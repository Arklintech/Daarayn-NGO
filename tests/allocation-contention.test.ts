import { describe, it, expect, vi } from "vitest";
import { fakeSheets } from "./helpers/fakeSheets";
import { resetWorld, driveMock } from "./helpers/mocks";
import { donationRepository } from "@/lib/repositories/donationRepository";
import { donationService } from "@/lib/services/donationService";
import { causeRepository } from "@/lib/repositories/causeRepository";
import { createAllocation, AllocationError } from "@/lib/services/allocationService";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

/**
 * D29: competing allocations against ONE constrained balance, with randomised network latency on every sheet request so that the
 * read/validate/write steps of different requests genuinely interleave. A request-rate limiter does not protect this; the allocation service's own
 * write-then-verify protocol does. Invariants checked on every trial: the ACTIVE allocations never exceed the designated amount, every
 * success is an active row, every refusal leaves no active row, and nothing is left half-written.
 */
const CAUSE_HEADERS = ["id", "title", "category", "targetAmount", "raisedAmount", "location", "description", "status", "imageUrl", "driveFileId", "createdAt", "kind"];
const cause = (id: string) => ({ id, title: `Cause ${id}`, category: "Relief", targetAmount: "1000", raisedAmount: "0", location: "", description: "", status: "Active", imageUrl: "", driveFileId: "", createdAt: "", kind: "cause" });
const jitter = (max: number) => new Promise<void>((r) => setTimeout(r, Math.random() * max));

function addLatency(maxMs: number) {
  const methods = ["getHeaders", "getRowsWithNumbers", "getAllRows", "batchGetRows", "appendRow", "appendRows", "batchAppendRows", "updateRowAt", "updateRowsAt", "clearRowAt", "updateRow"];
  for (const n of methods) {
    const orig = (fakeSheets as any)[n].bind(fakeSheets);
    vi.spyOn(fakeSheets as any, n).mockImplementation(async (...a: any[]) => {
      await jitter(maxMs); // request travels
      const r = await orig(...a); // Sheets applies it
      await jitter(maxMs); // response travels back
      return r;
    });
  }
}

async function oneTrial(competitors: number, amount: number, designated: number) {
  await resetWorld();
  fakeSheets.misreportAppendedRow = true;
  fakeSheets.seed("Causes", CAUSE_HEADERS, [cause("C1")]);
  causeRepository.invalidateCache();
  let n = 0;
  driveMock.uploadFile.mockImplementation(async () => ({ drive_file_id: `P${++n}`, storage_backend: "google_drive" }));
  driveMock.deleteFile.mockImplementation(async () => true);
  const d = await donationService.processDonation({ donorName: "Contention", donorContact: "c@example.invalid", amount: designated, cause: "C1", selectedCauses: [{ causeId: "C1" }], screenshotBuffer: Buffer.from("png"), screenshotFilename: "p.png", screenshotMimeType: "image/png", submissionKey: `K-${Math.random()}` });
  await donationRepository.updateStatus(d.donationId, "completed");
  addLatency(15);
  const res = await Promise.allSettled(Array.from({ length: competitors }, (_, i) => createAllocation({ donationId: d.donationId, causeId: "C1", amount, requestKey: `ck-${i}-${Math.random()}`, actorEmail: "a@x.invalid" })));
  vi.restoreAllMocks();
  driveMock.uploadFile.mockReset();
  const active = fakeSheets.records("Allocations").filter((a: any) => a.status === "active");
  const sum = active.reduce((s: number, a: any) => s + Number(a.allocatedAmount), 0);
  return { res, active, sum, ok: res.filter((r) => r.status === "fulfilled").length, refusals: res.filter((r) => r.status === "rejected") };
}

describe("D29: competing allocations against one constrained balance (random latency, repeated trials)", () => {
  it("6 competitors of 30 against a designated 100, 10 trials: the active total never exceeds 100 and every outcome matches the stored rows", async () => {
    const violations: string[] = [];
    let successes = 0;
    for (let t = 0; t < 10; t++) {
      const { sum, active, ok, refusals } = await oneTrial(6, 30, 100);
      successes += ok;
      if (sum > 100) violations.push(`trial ${t}: active total ${sum}`);
      if (ok !== active.length) violations.push(`trial ${t}: ${ok} reported successes but ${active.length} active rows`);
      for (const r of refusals) if (!((r as PromiseRejectedResult).reason instanceof AllocationError)) violations.push(`trial ${t}: refusal was not an AllocationError`);
    }
    expect(violations).toEqual([]);
    expect(successes).toBeGreaterThan(0); // the protocol admits work, it does not simply refuse everything
  }, 120_000);

  it("2 competitors of 60 against 100: exactly one can win, in every one of 10 trials", async () => {
    const bad: string[] = [];
    for (let t = 0; t < 10; t++) {
      const { sum, ok } = await oneTrial(2, 60, 100);
      if (sum > 100) bad.push(`trial ${t}: total ${sum}`);
      if (ok > 1) bad.push(`trial ${t}: ${ok} successes`);
    }
    expect(bad).toEqual([]);
  }, 120_000);
});
