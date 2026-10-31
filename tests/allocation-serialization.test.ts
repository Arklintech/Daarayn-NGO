import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fakeSheets } from "./helpers/fakeSheets";
import { resetWorld, driveMock } from "./helpers/mocks";
import { donationRepository } from "@/lib/repositories/donationRepository";
import { donationService } from "@/lib/services/donationService";
import { causeRepository } from "@/lib/repositories/causeRepository";
import { createAllocation, allocationsPaused, AllocationError } from "@/lib/services/allocationService";
import { MemoryLeaseBackend, setLeaseBackend } from "@/lib/google/allocationLease";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

/**
 * D30: allocation commands for one donation are SERIALISED by a lease. With serialisation the losers are refused BEFORE anything is written,
 * so (unlike the optimistic protocol alone) no surplus row is ever created and no system reversal is needed. Randomised latency makes the
 * interleavings real. This is mutual exclusion under bounded-delay assumptions, not a transaction (see lib/google/allocationLease.ts).
 */
const CAUSE_HEADERS = ["id", "title", "category", "targetAmount", "raisedAmount", "location", "description", "status", "imageUrl", "driveFileId", "createdAt", "kind"];
const cause = (id: string) => ({ id, title: `Cause ${id}`, category: "Relief", targetAmount: "1000", raisedAmount: "0", location: "", description: "", status: "Active", imageUrl: "", driveFileId: "", createdAt: "", kind: "cause" });
const jitter = (max: number) => new Promise<void>((r) => setTimeout(r, Math.random() * max));
const saved = { ...process.env };

function addLatency(maxMs: number) {
  for (const n of ["getHeaders", "getRowsWithNumbers", "getAllRows", "batchGetRows", "appendRow", "appendRows", "batchAppendRows", "updateRowAt", "updateRowsAt", "clearRowAt", "updateRow"]) {
    const orig = (fakeSheets as any)[n].bind(fakeSheets);
    vi.spyOn(fakeSheets as any, n).mockImplementation(async (...a: any[]) => {
      await jitter(maxMs);
      const r = await orig(...a);
      await jitter(maxMs);
      return r;
    });
  }
}

async function setup(designated: number) {
  await resetWorld();
  setLeaseBackend(new MemoryLeaseBackend());
  fakeSheets.misreportAppendedRow = true;
  fakeSheets.seed("Causes", CAUSE_HEADERS, [cause("C1")]);
  causeRepository.invalidateCache();
  let n = 0;
  driveMock.uploadFile.mockImplementation(async () => ({ drive_file_id: `P${++n}`, storage_backend: "google_drive" }));
  driveMock.deleteFile.mockImplementation(async () => true);
  const d = await donationService.processDonation({ donorName: "Serial", donorContact: "s@example.invalid", amount: designated, cause: "C1", selectedCauses: [{ causeId: "C1" }], screenshotBuffer: Buffer.from("png"), screenshotFilename: "p.png", screenshotMimeType: "image/png", submissionKey: `K-${Math.random()}` });
  await donationRepository.updateStatus(d.donationId, "completed");
  return d.donationId;
}
const alloc = (donationId: string, amount: number, requestKey: string) => createAllocation({ donationId, causeId: "C1", amount, requestKey, actorEmail: "a@x.invalid" });
const rows = () => fakeSheets.records("Allocations");
const audits = () => fakeSheets.records("Audit_Log").filter((a: any) => a.action === "CREATE_ALLOCATION");

beforeEach(() => {
  Object.assign(process.env, { ALLOCATION_LEASE_WAIT_MS: "60000" });
});
afterEach(() => {
  process.env = { ...saved };
  vi.restoreAllMocks();
  setLeaseBackend(null);
});

describe("D30: serialised allocations against a limited balance", () => {
  it.each([2, 6, 12, 20])("%i simultaneous allocations of 30 against 100: exactly 3 are recorded, the rest refused before any write, no surplus row, balances and audit agree", async (n) => {
    const id = await setup(100);
    addLatency(6);
    const res = await Promise.allSettled(Array.from({ length: n }, (_, i) => alloc(id, 30, `rk-${n}-${i}`)));
    const ok = res.filter((r) => r.status === "fulfilled").length;
    const refused = res.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    const all = rows();
    const active = all.filter((a: any) => a.status === "active");
    expect(ok).toBe(Math.min(n, 3));
    expect(active).toHaveLength(Math.min(n, 3));
    expect(active.reduce((s: number, a: any) => s + Number(a.allocatedAmount), 0)).toBe(Math.min(n, 3) * 30);
    expect(all).toHaveLength(active.length); // serialisation: nothing was written and then reversed
    expect(all.filter((a: any) => a.reversedBy === "system")).toHaveLength(0);
    for (const r of refused) {
      expect(r.reason).toBeInstanceOf(AllocationError);
      expect((r.reason as AllocationError).httpStatus).toBe(409); // "would exceed the designation", never a lost race
    }
    expect(audits()).toHaveLength(active.length); // one audit record per allocation, none for refusals
    for (const a of active) expect(audits().some((x: any) => x.entity_id === a.id)).toBe(true);
  }, 60_000);

  it("20 simultaneous submissions of ONE idempotency key leave exactly ONE allocation row (not one plus nineteen reversed duplicates)", async () => {
    const id = await setup(100);
    addLatency(5);
    const res = await Promise.all(Array.from({ length: 20 }, () => alloc(id, 40, "SAME-KEY")));
    expect(new Set(res.map((r) => r.allocation.id)).size).toBe(1);
    expect(rows()).toHaveLength(1);
    expect(res.filter((r) => !r.duplicate)).toHaveLength(1);
    expect(audits()).toHaveLength(1);
  }, 60_000);

  it("a worker that died while holding the lease does not block forever; its recorded row is counted; the balance holds", async () => {
    const id = await setup(100);
    const backend = new MemoryLeaseBackend();
    setLeaseBackend(backend);
    const dead = await backend.acquire(`alloc:${id}`, "dead-worker", 400); // acquired, never released, never finished
    expect(dead.ok).toBe(true);
    const started = Date.now();
    const first = await alloc(id, 60, "after-crash-1"); // waits for the lease to expire, then proceeds
    expect(Date.now() - started).toBeGreaterThanOrEqual(300);
    expect(first.duplicate).toBe(false);
    await expect(alloc(id, 60, "after-crash-2")).rejects.toBeInstanceOf(AllocationError); // 60 + 60 > 100: the earlier row is counted
    expect(rows().filter((a: any) => a.status === "active")).toHaveLength(1);
  }, 30_000);

  it("a worker whose lease expired while it was stalled refuses to write (self-fencing) and the new holder allocates correctly", async () => {
    const id = await setup(100);
    Object.assign(process.env, { ALLOCATION_LEASE_TTL_MS: "400", ALLOCATION_LEASE_MIN_REMAINING_MS: "200" });
    // worker A's first read returns, then A stalls for 700 ms: far longer than its 400 ms lease
    const orig = (fakeSheets as any).batchGetRows.bind(fakeSheets);
    let first = true;
    vi.spyOn(fakeSheets as any, "batchGetRows").mockImplementation(async (...a: any[]) => {
      const mine = first;
      first = false;
      const r = await orig(...a); // A reads the (still empty) allocations ...
      if (mine) await new Promise((res) => setTimeout(res, 700)); // ... then stalls past its lease before acting on what it read
      return r;
    });
    const a = alloc(id, 70, "stale-A");
    await new Promise((r) => setTimeout(r, 450)); // A's lease has expired
    const b = await alloc(id, 70, "fresh-B"); // B acquires (new token) and writes
    expect(b.duplicate).toBe(false);
    const resA = await a.then(() => "wrote", (e) => e);
    expect(resA).toBeInstanceOf(AllocationError);
    expect((resA as AllocationError).httpStatus).toBe(503);
    expect(rows().filter((r: any) => r.status === "active")).toHaveLength(1); // only B
    expect(rows().filter((r: any) => r.requestKey === "stale-A")).toHaveLength(0); // A never wrote
  }, 30_000);

  it("while another worker holds the lease a caller waits only as long as configured, then is told to retry; nothing is written", async () => {
    const id = await setup(100);
    const backend = new MemoryLeaseBackend();
    setLeaseBackend(backend);
    await backend.acquire(`alloc:${id}`, "holder", 5000);
    Object.assign(process.env, { ALLOCATION_LEASE_WAIT_MS: "250" });
    const err: any = await alloc(id, 10, "busy-1").catch((e) => e);
    expect(err).toBeInstanceOf(AllocationError);
    expect(err.httpStatus).toBe(503);
    expect(rows()).toHaveLength(0);
  }, 20_000);

  it("different donations do not block each other", async () => {
    const id = await setup(100);
    const backend = new MemoryLeaseBackend();
    setLeaseBackend(backend);
    await backend.acquire("alloc:SOME-OTHER-DONATION", "other", 5000);
    await expect(alloc(id, 10, "independent-1")).resolves.toMatchObject({ duplicate: false });
  });
});

describe("D30: live allocations are blocked in production until serialisation is verified", () => {
  it("production without ALLOCATION_SERIALIZATION_VERIFIED is paused; with it, allowed; other environments are not paused", () => {
    expect(allocationsPaused({ GOOGLE_TARGET_ENV: "production" })).toBe(true);
    expect(allocationsPaused({ VERCEL_ENV: "production" })).toBe(true);
    expect(allocationsPaused({ GOOGLE_TARGET_ENV: "production", ALLOCATION_SERIALIZATION_VERIFIED: "true" })).toBe(false);
    expect(allocationsPaused({ GOOGLE_TARGET_ENV: "test" })).toBe(false);
    expect(allocationsPaused({})).toBe(false);
  });

  it("a paused environment refuses the command before reading or writing anything", async () => {
    const id = await setup(100);
    process.env.GOOGLE_TARGET_ENV = "production";
    delete process.env.ALLOCATION_SERIALIZATION_VERIFIED;
    const err: any = await alloc(id, 10, "paused-1").catch((e) => e);
    expect(err).toBeInstanceOf(AllocationError);
    expect(err.httpStatus).toBe(503);
    expect(rows()).toHaveLength(0);
  });
});
