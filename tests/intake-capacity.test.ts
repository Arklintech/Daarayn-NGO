import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";
import { AsyncLocalStorage } from "async_hooks";
import { fakeSheets } from "./helpers/fakeSheets";
import { resetWorld, driveMock } from "./helpers/mocks";
import { causeRepository } from "@/lib/repositories/causeRepository";
import { acceptDonation } from "@/lib/intake/intakeService";
import { runFinaliserPass } from "@/lib/intake/finaliser";
import { computeQueueMetrics } from "@/lib/intake/status";
import { parseIntakeRow } from "@/lib/intake/schema";
import { setLeaseBackend, MemoryLeaseBackend } from "@/lib/google/allocationLease";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

/**
 * D37 capacity measurements on the in-memory sheets (FAKE category: request counts, queue behaviour and relative latency only; the fake network adds
 * 0 to 4 ms per call, so latencies say nothing about Google). One counted call is one Google request (nested fake calls are not counted).
 * Evidence: docs/testing/evidence-d37/queue-fake-measurements.json
 */
const METHODS = ["getHeaders", "getRowsWithNumbers", "getAllRows", "batchGetRows", "appendRow", "appendRows", "appendRowsToTabs", "batchAppendRows", "updateRowAt", "updateRowsAt", "updateFieldsLiteral", "clearRowAt", "updateRow"];
const READS = new Set(["getHeaders", "getRowsWithNumbers", "getAllRows", "batchGetRows"]);
const CAUSE_HEADERS = ["id", "title", "category", "targetAmount", "raisedAmount", "location", "description", "status", "imageUrl", "driveFileId", "createdAt", "kind"];
const nested = new AsyncLocalStorage<boolean>();
const tally = { read: 0, write: 0 };
function instrument() {
  tally.read = 0;
  tally.write = 0;
  for (const n of METHODS) {
    const orig = (fakeSheets as any)[n].bind(fakeSheets);
    vi.spyOn(fakeSheets as any, n).mockImplementation(async (...a: any[]) => {
      if (nested.getStore()) return orig(...a);
      if (READS.has(n)) tally.read++;
      else tally.write++;
      return nested.run(true, () => orig(...a));
    });
  }
}
const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? Math.round(s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] * 10) / 10 : 0;
};
let proof = 0;
async function setup() {
  await resetWorld();
  fakeSheets.seed("Causes", CAUSE_HEADERS, [{ id: "C1", title: "Cause C1", category: "Relief", targetAmount: "1000", raisedAmount: "0", location: "", description: "", status: "Active", imageUrl: "", driveFileId: "", createdAt: "", kind: "cause" }]);
  fakeSheets.seed("Program_Content", ["id", "kind", "title"], []);
  causeRepository.invalidateCache();
  setLeaseBackend(new MemoryLeaseBackend());
  driveMock.uploadFile.mockImplementation(async () => ({ drive_file_id: `P${++proof}`, storage_backend: "google_drive" }));
}
const accept = (i: number) => acceptDonation({ donorName: `Donor ${i}`, donorContact: `i${i}@example.invalid`, amount: 100 + i, selectedCauses: [{ causeId: "C1" }], screenshotBuffer: Buffer.from("png"), screenshotFilename: "p.png", screenshotMimeType: "image/png", submissionKey: `K-${i}` });
const results: Record<string, unknown> = {};

describe("D37 capacity on the fake sheets", () => {
  for (const N of [1, 6, 12, 20, 30]) {
    it(`${N}: intake requests and latency, finaliser requests, completion latency, queue depth`, async () => {
      await setup();
      instrument();
      const t0 = Date.now();
      const lat: number[] = [];
      const accepted = await Promise.all(Array.from({ length: N }, async (_, i) => { const s = Date.now(); try { return await accept(i + 1); } finally { lat.push(Date.now() - s); } }));
      const intakeReads = tally.read;
      const intakeWrites = tally.write;
      const intakeWall = Date.now() - t0;
      const depthBefore = computeQueueMetrics(fakeSheets.records("Donation_Intake").map((r: any, i: number) => parseIntakeRow(i + 2, r))).depth;

      tally.read = 0;
      tally.write = 0;
      const f0 = Date.now();
      let passes = 0;
      let retries = 0;
      for (;;) {
        const r = await runFinaliserPass({ maxBatch: 25 });
        if (r.skipped === "idle") break;
        passes++;
        retries += r.retryScheduled;
        if (passes > 20) throw new Error("did not drain");
      }
      const finWall = Date.now() - f0;
      const pass = { reads: tally.read, writes: tally.write };
      const completion = fakeSheets.records("Donation_Intake").map((r: any) => new Date(r.completedAt).getTime() - new Date(r.receivedAt).getTime());
      const ids = fakeSheets.records("Donations").map((d: any) => String(d.id));
      results[`n${N}`] = {
        submitted: N, accepted: accepted.length, queueDepthAfterIntake: depthBefore,
        intake: { reads: intakeReads, writes: intakeWrites, readsPerSubmission: intakeReads / N, writesPerSubmission: intakeWrites / N, wallMs: intakeWall, p50ms: pct(lat, 50), p95ms: pct(lat, 95), p99ms: pct(lat, 99) },
        finaliser: { passes, reads: pass.reads, writes: pass.writes, wallMs: finWall, readsPerDonation: Math.round((pass.reads / N) * 100) / 100, writesPerDonation: Math.round((pass.writes / N) * 100) / 100, retryRate: retries / Math.max(1, passes) },
        financialCompletion: { p50ms: pct(completion, 50), p95ms: pct(completion, 95), p99ms: pct(completion, 99) },
        totalPerDonation: { reads: Math.round(((intakeReads + pass.reads) / N) * 100) / 100, writes: Math.round(((intakeWrites + pass.writes) / N) * 100) / 100 },
        integrity: { donations: ids.length, duplicateIds: ids.length - new Set(ids).size },
      };
      vi.restoreAllMocks();
      expect(ids).toHaveLength(N);
      expect(new Set(ids).size).toBe(N);
    }, 120_000);
  }

  it("writes the evidence file", () => {
    const dir = path.join(process.cwd(), "docs", "testing", "evidence-d37");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "queue-fake-measurements.json"), JSON.stringify({ category: "FAKE (in-memory sheets; relative latency only)", generatedAt: new Date().toISOString(), results }, null, 2));
  });
});
