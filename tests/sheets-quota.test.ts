import { describe, it, expect, beforeEach, vi } from "vitest";
import { fakeApi } from "./helpers/fakeGoogleApi";
import { mailMock, authState } from "./helpers/mocks";

// This file runs the REAL lib/google/sheets.ts against a fake of Google's REST API so API calls can be counted.
vi.unmock("@/lib/google/sheets");
vi.mock("@/lib/google/client", () => ({
  GOOGLE_SHEET_ID: "TEST_SHEET_ID_000000000000000000000000",
  GOOGLE_DRIVE_ROOT_FOLDER_ID: "ROOT",
  googleAuthProblem: () => "",
  getSheetsClient: () => fakeApi.client(),
  getDriveClient: () => null,
  getGoogleAuth: () => ({}),
}));
vi.unmock("@/lib/realtime/broadcaster"); // count the real realtime-log writes too

async function fresh() {
  fakeApi.reset();
  delete (globalThis as any).__daaraynRealtime; // the broadcaster is a process-wide singleton: start each test clean
  vi.resetModules();
  vi.clearAllMocks();
  mailMock.failFor.clear();
  authState.role = "admin";
  const svc = await import("@/lib/services/donationService");
  const sheets = await import("@/lib/google/sheets");
  const retry = await import("@/lib/google/retry");
  retry.setRetrySleep(async () => undefined); // no real waiting in tests
  return { donationService: svc.donationService, sheets, retry };
}
const donation = (over: any = {}) => ({
  donorName: "Test Donor", donorContact: "asha@example.org", amount: 500, cause: "General",
  upiRef: "UTR1", screenshotBuffer: Buffer.from("png"), screenshotFilename: "p.png", screenshotMimeType: "image/png", ...over,
});
const report = (label: string) => console.log(`[API COUNT] ${label}: ${JSON.stringify(fakeApi.counts)}`);

describe("Sheets API request cost of a donation (measured)", () => {
  it("first donation by a new donor (cold start, includes tab creation)", async () => {
    const { donationService } = await fresh();
    await donationService.processDonation(donation());
    report("first donation, cold");
    expect(fakeApi.records("Donations")).toHaveLength(1);
  });

  it("a second donation by the same donor (warm instance)", async () => {
    const { donationService } = await fresh();
    await donationService.processDonation(donation({ submissionKey: "a" }));
    fakeApi.resetCounts();
    await donationService.processDonation(donation({ submissionKey: "b" }));
    report("repeat donation, warm");
    expect(fakeApi.records("Donations")).toHaveLength(2);
  });

  it("admin verification of one donation", async () => {
    const { donationService } = await fresh();
    const r = await donationService.processDonation(donation());
    fakeApi.resetCounts();
    const { PATCH } = await import("@/app/api/admin/donations/route");
    const { NextRequest } = await import("next/server");
    await PATCH(new NextRequest("http://t/d", { method: "PATCH", body: JSON.stringify({ id: r.donationId, status: "completed", expectedStatus: "pending" }) }));
    report("admin verification");
    expect(fakeApi.records("Donations")[0].status).toBe("completed");
  });
});

import { quotaError, serverError, permissionError, notFoundError, badRequestError } from "./helpers/fakeGoogleApi";

describe("retry policy (bounded, jittered, honours Retry-After)", () => {
  it("retries quota errors then succeeds; waits are bounded and jittered; Retry-After is honoured", async () => {
    const { retry } = await fresh();
    const waits: number[] = [];
    retry.setRetrySleep(async (ms: number) => void waits.push(ms));
    let n = 0;
    const out = await retry.withGoogleRetry(async () => {
      if (++n <= 2) throw quotaError(n === 1 ? "7" : undefined);
      return "ok";
    });
    expect(out).toBe("ok");
    expect(n).toBe(3);
    expect(waits).toHaveLength(2);
    expect(waits[0]).toBeGreaterThanOrEqual(7000); // Retry-After: 7 seconds
    expect(waits[1]).toBeLessThanOrEqual(2000); // 2nd backoff ceiling = base * 2
  });

  it("never waits longer than the cap, even if Retry-After asks for more", async () => {
    const { retry } = await fresh();
    const waits: number[] = [];
    retry.setRetrySleep(async (ms: number) => void waits.push(ms));
    let n = 0;
    await retry.withGoogleRetry(async () => { if (++n === 1) throw quotaError("3600"); return 1; }, { maxDelayMs: 30_000 });
    expect(waits[0]).toBeLessThanOrEqual(30_000);
  });

  it("is bounded: gives up after maxAttempts and throws the ORIGINAL error, marked as exhausted", async () => {
    const { retry } = await fresh();
    let n = 0;
    await expect(retry.withGoogleRetry(async () => { n++; throw quotaError(); }, { maxAttempts: 4 })).rejects.toMatchObject({ retriesExhausted: true, attempts: 4 });
    expect(n).toBe(4);
  });

  it("does NOT retry permanent errors (400, 403 permission, 404)", async () => {
    const { retry } = await fresh();
    for (const make of [badRequestError, permissionError, notFoundError]) {
      let n = 0;
      await expect(retry.withGoogleRetry(async () => { n++; throw make(); })).rejects.toBeTruthy();
      expect(n).toBe(1);
    }
  });

  it("transient server/network errors are retried for idempotent calls, but an APPEND is retried only on quota errors", async () => {
    const { retry } = await fresh();
    let reads = 0;
    expect(await retry.withGoogleRetry(async () => { if (++reads === 1) throw serverError(); return "r"; })).toBe("r");
    let appends = 0;
    await expect(retry.withGoogleRetry(async () => { appends++; throw serverError(); }, { quotaOnly: true })).rejects.toBeTruthy();
    expect(appends).toBe(1); // an ambiguous 503 could have written the row: not retried blindly
    let q = 0;
    expect(await retry.withGoogleRetry(async () => { if (++q === 1) throw quotaError(); return "a"; }, { quotaOnly: true })).toBe("a");
  });
});

describe("donation persistence under quota pressure, partial failure and concurrency (real SheetsService)", () => {
  it("a transient quota burst during a donation is retried and yields exactly one donation and one donor", async () => {
    const { donationService } = await fresh();
    await donationService.processDonation(donation({ submissionKey: "warm" })); // warm the instance
    fakeApi.failures.push({ when: "write", error: quotaError() }, { when: "write", error: quotaError() });
    const r = await donationService.processDonation(donation({ submissionKey: "burst", donorContact: "new@example.org" }));
    expect(r.success).toBe(true);
    expect(fakeApi.records("Donations").filter((d) => d.submissionKey === "burst")).toHaveLength(1);
    expect(fakeApi.records("Donors").filter((d) => d.email === "new@example.org")).toHaveLength(1);
  });

  it("a persistent quota failure is reported as a failure (never a false success) and bounded in attempts", async () => {
    const { donationService } = await fresh();
    await donationService.processDonation(donation({ submissionKey: "warm" }));
    const rowsBefore = fakeApi.records("Donations").length;
    fakeApi.resetCounts();
    for (let i = 0; i < 40; i++) fakeApi.failures.push({ when: "write", error: quotaError() });
    await expect(donationService.processDonation(donation({ submissionKey: "doomed", donorContact: "x@example.org" }))).rejects.toBeTruthy();
    expect(fakeApi.counts.writes).toBeLessThanOrEqual(5); // 5 attempts max on the first write, then it stops
    fakeApi.failures.length = 0;
    expect(fakeApi.records("Donations").length).toBe(rowsBefore); // nothing half-recorded as a donation
  });

  it("an interrupted donation is identifiable (PENDING row) and the retry COMPLETES it instead of duplicating", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const { donationService } = await fresh();
      await donationService.processDonation(donation({ submissionKey: "warm", donorContact: "w@example.org" })); // tabs exist now
      // the placeholder row is appended, then rewriting it with the final data fails permanently (not retryable)
      fakeApi.failures.push({ when: "write", method: "values.update", error: permissionError() });
      await expect(donationService.processDonation(donation({ submissionKey: "interrupted", donorContact: "i@example.org" }))).rejects.toBeTruthy();
      const pending = fakeApi.records("Donations").filter((d) => d.submissionKey === "interrupted");
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe("PENDING"); // identifiable, not a fake donation

      // an immediate retry is told it is still in progress (it might be a live request), and nothing new is written
      await expect(donationService.processDonation(donation({ submissionKey: "interrupted", donorContact: "i@example.org" }))).rejects.toMatchObject({ code: "IN_PROGRESS" });
      expect(fakeApi.records("Donations").filter((d) => d.submissionKey === "interrupted")).toHaveLength(1);

      // once the placeholder is stale, the retry adopts and finishes that same row
      vi.setSystemTime(Date.now() + 60_000);
      const done = await donationService.processDonation(donation({ submissionKey: "interrupted", donorContact: "i@example.org" }));
      expect(done.success).toBe(true);
      const rows = fakeApi.records("Donations").filter((d) => d.submissionKey === "interrupted");
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toMatch(/^DA\d{3}$/);
      expect(fakeApi.records("Donations").some((d) => d.id === "PENDING")).toBe(false);
      expect(fakeApi.records("Donors").filter((d) => d.email === "i@example.org")).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("concurrent submissions with the SAME key produce exactly one finished donation and never return a placeholder", async () => {
    const { donationService } = await fresh();
    fakeApi.jitter = true;
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => donationService.processDonation(donation({ submissionKey: "same" }))));
    fakeApi.jitter = false;
    const ok = results.filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled");
    expect(ok.length).toBeGreaterThan(0);
    expect(ok.every((r) => /^DA\d{3}$/.test(r.value.donationId))).toBe(true); // never "PENDING"
    expect(new Set(ok.map((r) => r.value.donationId)).size).toBe(1);
    expect(ok.filter((r) => !r.value.duplicate)).toHaveLength(1);
    const rows = fakeApi.records("Donations");
    expect(rows.filter((d) => d.submissionKey === "same")).toHaveLength(1);
    expect(rows.some((d) => d.id === "PENDING")).toBe(false);
    expect(fakeApi.records("Donors")).toHaveLength(1);
  });

  it("concurrent donations by DIFFERENT donors and repeat donations keep unique Donation IDs and stable Donor Tokens", async () => {
    const { donationService } = await fresh();
    fakeApi.jitter = true;
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => donationService.processDonation(donation({ submissionKey: `d${i}`, donorContact: `d${i}@example.org` })))
    );
    fakeApi.jitter = false;
    expect(new Set(results.map((r) => r.donationId)).size).toBe(8);
    expect(new Set(results.map((r) => r.donorId)).size).toBe(8);
    const again = await donationService.processDonation(donation({ submissionKey: "d0-again", donorContact: " D0@example.org" }));
    expect(again.donorId).toBe(results[0].donorId);
    expect(again.donationId).not.toBe(results[0].donationId);
  });

  it("audit, notification and realtime records are still written (realtime events in ONE batched write)", async () => {
    const { donationService } = await fresh();
    await donationService.processDonation(donation({ submissionKey: "a", donorContact: "a@example.org" }));
    const r = await donationService.processDonation(donation({ submissionKey: "b", donorContact: "b@example.org" }));
    expect(fakeApi.records("Audit_Log").some((e) => e.action === "SUBMIT_DONATION" && e.entity_id === r.donationId)).toBe(true);
    expect(fakeApi.records("Notifications").some((n) => n.relatedEntityId === r.donationId)).toBe(true);
    const events = fakeApi.records("Realtime_Events").map((e) => e.type);
    expect(events).toEqual(expect.arrayContaining(["DONATION_CREATED", "DONOR_UPDATED", "NOTIFICATION_CREATED"]));
    expect(fakeApi.records("Donations").find((d) => d.id === r.donationId)!.confirmationEmailSent).toBe("true");
  });

  it("a Sheets read failure surfaces as an error after bounded retries, never as an empty list", async () => {
    const { sheets } = await fresh();
    await sheets.sheetsService.ensureSheetExists("Donations", ["id"]);
    fakeApi.resetCounts();
    for (let i = 0; i < 20; i++) fakeApi.failures.push({ when: "read", method: "values.get", error: serverError() });
    await expect(sheets.sheetsService.getAllRows("Donations")).rejects.toThrow(/Could not read Donations from Google Sheets/);
    expect(fakeApi.counts["values.get"]).toBe(5);
    fakeApi.failures.length = 0;
  });
});
