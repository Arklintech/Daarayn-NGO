import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";
import { AsyncLocalStorage } from "async_hooks";
import { fakeSheets } from "./helpers/fakeSheets";
import { resetWorld, driveMock } from "./helpers/mocks";
import { donationRepository } from "@/lib/repositories/donationRepository";
import { donationService } from "@/lib/services/donationService";
import { causeRepository } from "@/lib/repositories/causeRepository";
import { createAllocation } from "@/lib/services/allocationService";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

/**
 * D35 baseline (the CONTROL): how many logical Sheets requests one business operation makes, and what happens to ids and balances under
 * N concurrent donations. Everything runs against the in-memory fake, so latencies are RELATIVE (fake network jitter 0-4 ms), not Google's.
 * One counted SheetsService call is one Google API request (a batched read counts once). Results go to docs/testing/evidence-d35/request-baseline.current.json (override with D35_BASELINE_OUT); the preserved D35 baseline request-baseline.json is never overwritten.
 * The only assertions are integrity invariants and a loose upper bound on requests per donation; the numbers themselves are the deliverable.
 */
const METHODS = ["getHeaders", "getRowsWithNumbers", "getAllRows", "batchGetRows", "appendRow", "appendRows", "appendRowsToTabs", "batchAppendRows", "updateRowAt", "updateRowsAt", "clearRowAt", "updateRow", "ensureSheetExists"];
const READS = new Set(["getHeaders", "getRowsWithNumbers", "getAllRows", "batchGetRows"]);
const CAUSE_HEADERS = ["id", "title", "category", "targetAmount", "raisedAmount", "location", "description", "status", "imageUrl", "driveFileId", "createdAt", "kind"];
const cause = (id: string) => ({ id, title: `Cause ${id}`, category: "Relief", targetAmount: "1000", raisedAmount: "0", location: "", description: "", status: "Active", imageUrl: "", driveFileId: "", createdAt: "", kind: "cause" });

// The fake implements getAllRows/batchGetRows on top of getRowsWithNumbers; the real service issues ONE Google request for each. Only the OUTERMOST call is counted.
const nested = new AsyncLocalStorage<boolean>();
const tally = { read: 0, write: 0, byMethod: {} as Record<string, number> };
function instrument() {
  tally.read = 0;
  tally.write = 0;
  tally.byMethod = {};
  for (const n of METHODS) {
    const orig = (fakeSheets as any)[n].bind(fakeSheets);
    vi.spyOn(fakeSheets as any, n).mockImplementation(async (...a: any[]) => {
      if (nested.getStore()) return orig(...a);
      return nested.run(true, () => counted(n, a, orig));
    });
  }
}
async function counted(n: string, a: any[], orig: (...x: any[]) => any) {
  const tab = typeof a[0] === "string" ? a[0] : Array.isArray(a[0]) ? a[0].join("+") : "";
  const key = `${n}:${tab}`;
  tally.byMethod[key] = (tally.byMethod[key] || 0) + 1;
  if (READS.has(n)) tally.read++;
  else if (n !== "ensureSheetExists") tally.write++;
  return orig(...a);
}
const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? Math.round(s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] * 10) / 10 : 0;
};
const results: Record<string, unknown> = {};

async function seed() {
  await resetWorld();
  fakeSheets.seed("Causes", CAUSE_HEADERS, [cause("C1")]);
  causeRepository.invalidateCache();
  let n = 0;
  driveMock.uploadFile.mockImplementation(async () => ({ drive_file_id: `P${++n}`, storage_backend: "google_drive" }));
  driveMock.deleteFile.mockImplementation(async () => true);
}
const donate = (i: number, over: Record<string, unknown> = {}) =>
  donationService.processDonation({ donorName: `Donor ${i}`, donorContact: `d${i}@example.invalid`, amount: 500, cause: "C1", selectedCauses: [{ causeId: "C1" }], screenshotBuffer: Buffer.from("png"), screenshotFilename: "p.png", screenshotMimeType: "image/png", submissionKey: `K-${i}-${Math.random()}`, ...over });

describe("D35 request-count baseline (control)", () => {
  it("one donation, cold: requests per operation", async () => {
    await seed();
    instrument();
    await donate(1);
    results.oneDonationSpecificCause = { reads: tally.read, writes: tally.write, byMethod: { ...tally.byMethod } };
    vi.restoreAllMocks();
    await seed();
    instrument();
    await donate(2, { selectedCauses: undefined, cause: "General" });
    results.oneDonationGeneral = { reads: tally.read, writes: tally.write, byMethod: { ...tally.byMethod } };
    vi.restoreAllMocks();
    expect((results.oneDonationSpecificCause as any).reads + (results.oneDonationSpecificCause as any).writes).toBeLessThan(60);
  });

  it("a RETURNING donor (profile already exists): donor reads per donation", async () => {
    await seed();
    await donate(1);
    instrument();
    await donate(1, { submissionKey: `K-RET-${Math.random()}` });
    results.oneDonationReturningDonor = { reads: tally.read, writes: tally.write, byMethod: { ...tally.byMethod } };
    vi.restoreAllMocks();
  });

  it("a duplicate submission (retry): requests it costs", async () => {
    await seed();
    await donate(1, { submissionKey: "DUP" });
    instrument();
    await donate(1, { submissionKey: "DUP" });
    results.duplicateRetry = { reads: tally.read, writes: tally.write, byMethod: { ...tally.byMethod } };
    vi.restoreAllMocks();
  });

  it("one allocation: requests per operation", async () => {
    await seed();
    const d = await donate(1, { amount: 100 });
    await donationRepository.updateStatus(d.donationId, "completed");
    instrument();
    await createAllocation({ donationId: d.donationId, causeId: "C1", amount: 40, requestKey: "R1", actorEmail: "a@x.invalid" });
    results.oneAllocation = { reads: tally.read, writes: tally.write, byMethod: { ...tally.byMethod } };
    vi.restoreAllMocks();
  });

  for (const N of [12, 20, 30]) {
    it(`${N} concurrent donations: totals, ids, latency distribution`, async () => {
      await seed();
      instrument();
      let collisions = 0;
      const warn = vi.spyOn(console, "warn").mockImplementation((...a: unknown[]) => {
        if (String(a[0]).includes("ID collision")) collisions++;
      });
      const lat: number[] = [];
      const t0 = Date.now();
      const out = await Promise.allSettled(
        Array.from({ length: N }, async (_, i) => {
          const s = Date.now();
          try {
            return await donate(i + 100);
          } finally {
            lat.push(Date.now() - s);
          }
        })
      );
      const wall = Date.now() - t0;
      const ok = out.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<any>[];
      const ids = fakeSheets.records("Donations").map((r: any) => String(r.id));
      const dupIds = ids.length - new Set(ids).size;
      results[`concurrent${N}`] = {
        submitted: N, idCollisionRetries: collisions, succeeded: ok.length, failed: N - ok.length, rows: ids.length, duplicateIds: dupIds, pendingPlaceholders: ids.filter((i) => i === "PENDING").length,
        wallMs: wall, throughputPerSec: Math.round((ok.length / (wall / 1000)) * 10) / 10,
        p50ms: pct(lat, 50), p95ms: pct(lat, 95), p99ms: pct(lat, 99),
        totalReads: tally.read, totalWrites: tally.write, requestsPerDonation: Math.round(((tally.read + tally.write) / N) * 10) / 10,
      };
      warn.mockRestore();
      vi.restoreAllMocks();
      expect(dupIds).toBe(0);
      expect(ids.length).toBe(ok.length);
    }, 120_000);
  }

  it("writes the evidence file", () => {
    const dir = path.join(process.cwd(), "docs", "testing", "evidence-d35");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, process.env.D35_BASELINE_OUT || "request-baseline.current.json"), JSON.stringify({ environment: "in-memory fake Sheets, random 0-4 ms per call; latencies are relative only", generatedAt: new Date().toISOString(), results }, null, 2));
  });
});
