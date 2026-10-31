import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fakeSheets } from "./helpers/fakeSheets";
import { resetWorld } from "./helpers/mocks";
import { withGoogleRetry, setRetrySleep } from "@/lib/google/retry";
import { runWithPriority, MemoryLimiterBackend, setLimiterBackend, getLimiterBackend, GoogleBackpressureError, type LimiterBackend, type LimiterConfig, type RequestKind } from "@/lib/google/requestControl";
import { googleUsageSnapshot, resetGoogleUsage } from "@/lib/google/usage";

const err = (code: number, extra: any = {}) => Object.assign(new Error(extra.message || `http ${code}`), { code, ...extra });
const saved = { ...process.env };
let delays: number[] = [];

beforeEach(() => {
  delays = [];
  setRetrySleep(async (ms) => { delays.push(ms); });
  resetGoogleUsage();
  setLimiterBackend(new MemoryLimiterBackend());
  Object.assign(process.env, { GOOGLE_SHEETS_READS_PER_MINUTE: "6", GOOGLE_SHEETS_WRITES_PER_MINUTE: "6", GOOGLE_SHEETS_BURST: "1", GOOGLE_SHEETS_MAX_WAIT_MS: "100000000" });
});
afterEach(() => {
  process.env = { ...saved };
  setLimiterBackend(new MemoryLimiterBackend());
});

describe("retry and backoff on HTTP 429", () => {
  it("bounded exponential backoff with randomized jitter, then success; the operation takes effect once", async () => {
    process.env.GOOGLE_SHEETS_READS_PER_MINUTE = "0";
    let effects = 0;
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls <= 3) throw err(429);
      effects++;
      return "ok";
    };
    await expect(withGoogleRetry(fn, { kind: "read", baseDelayMs: 1000, maxElapsedMs: 10_000_000 })).resolves.toBe("ok");
    expect(calls).toBe(4);
    expect(effects).toBe(1);
    expect(delays).toHaveLength(3);
    delays.forEach((d, i) => expect(d).toBeLessThanOrEqual(1000 * 2 ** i)); // truncated exponential ceiling per attempt
    expect(new Set(delays).size).toBeGreaterThan(1); // jitter: not a fixed ladder
  });

  it("Retry-After is honoured (never shorter than the server asked)", async () => {
    process.env.GOOGLE_SHEETS_READS_PER_MINUTE = "0";
    let n = 0;
    await withGoogleRetry(async () => { if (++n === 1) throw err(429, { response: { headers: { "retry-after": "7" } } }); return 1; }, { kind: "read", maxElapsedMs: 10_000_000 });
    expect(delays[0]).toBeGreaterThanOrEqual(7000);
  });

  it("persistent 429: honest, structured, retryable failure after the attempt limit; nothing reported as success", async () => {
    process.env.GOOGLE_SHEETS_READS_PER_MINUTE = "0";
    const fn = vi.fn(async () => { throw err(429); });
    const e: any = await withGoogleRetry(fn, { kind: "read", maxAttempts: 4, maxElapsedMs: 10_000_000 }).catch((x) => x);
    expect(fn).toHaveBeenCalledTimes(4);
    expect(e.retriesExhausted).toBe(true);
    expect(e.retryable).toBe(true);
    expect(e.quotaExhausted).toBe(true);
    expect(e.attempts).toBe(4);
  });

  it("the elapsed-time budget stops retrying early", async () => {
    process.env.GOOGLE_SHEETS_READS_PER_MINUTE = "0";
    const fn = vi.fn(async () => { throw err(429, { response: { headers: { "retry-after": "20" } } }); });
    const e: any = await withGoogleRetry(fn, { kind: "read", maxAttempts: 10, maxElapsedMs: 5000 }).catch((x) => x);
    expect(fn.mock.calls.length).toBeLessThan(3);
    expect(e.retriesExhausted).toBe(true);
  });

  it("a definite quota rejection of an append is retried (safe); an ambiguous 503 on an append is NOT replayed blindly", async () => {
    process.env.GOOGLE_SHEETS_WRITES_PER_MINUTE = "0";
    let rows = 0;
    let n = 0;
    await withGoogleRetry(async () => { if (++n < 3) throw err(429); rows++; }, { kind: "write", quotaOnly: true, maxElapsedMs: 10_000_000 });
    expect(rows).toBe(1);
    const ambiguous = vi.fn(async () => { throw err(503); });
    await expect(withGoogleRetry(ambiguous, { kind: "write", quotaOnly: true })).rejects.toBeTruthy();
    expect(ambiguous).toHaveBeenCalledTimes(1);
  });
});

describe("shared request-rate control", () => {
  it("requests are PACED (one slot per interval after the burst), not released as a burst", async () => {
    process.env.GOOGLE_SHEETS_BURST = "3";
    const ran: number[] = [];
    await Promise.all(Array.from({ length: 8 }, (_, i) => withGoogleRetry(async () => { ran.push(i); }, { kind: "read" })));
    expect(ran).toHaveLength(8);
    const waits = [...delays].sort((a, b) => a - b);
    expect(waits).toHaveLength(5); // the first three go straight out (burst), the other five wait
    for (let i = 1; i < waits.length; i++) expect(waits[i] - waits[i - 1]).toBeGreaterThanOrEqual(9000); // 6 per minute = one slot every 10 s
  });

  it("three independent clients coordinate through ONE limiter (test double of a shared backend; the protocol, not distributed correctness)", async () => {
    const log: { kind: RequestKind; at: number }[] = [];
    const inner = new MemoryLimiterBackend();
    const shared: LimiterBackend = {
      reserve: (k, c, now) => { log.push({ kind: k, at: now }); return inner.reserve(k, c, now); },
      penalize: (k, ms, now) => inner.penalize(k, ms, now),
    };
    setLimiterBackend(shared);
    const client = (name: string) => Promise.all(Array.from({ length: 3 }, () => withGoogleRetry(async () => name, { kind: "read" })));
    await Promise.all([client("a"), client("b"), client("c")]);
    expect(log).toHaveLength(9); // all three clients charged the same budget
    const waits = [...delays].sort((a, b) => a - b);
    expect(waits).toHaveLength(8); // burst 1: only the very first request of the nine was free
    expect(waits[waits.length - 1]).toBeGreaterThanOrEqual(8 * 9000);
    expect(getLimiterBackend()).toBe(shared);
  });

  it("read and write budgets are independent", async () => {
    await withGoogleRetry(async () => 1, { kind: "read" });
    await withGoogleRetry(async () => 1, { kind: "read" }); // second read has to wait
    const afterReads = delays.length;
    await withGoogleRetry(async () => 1, { kind: "write" }); // a write is not delayed by the read queue
    expect(afterReads).toBe(1);
    expect(delays.length).toBe(1);
  });

  it("a request that would wait longer than the maximum gets a retryable 'busy' error and is NOT sent", async () => {
    process.env.GOOGLE_SHEETS_MAX_WAIT_MS = "15000";
    const fn = vi.fn(async () => 1);
    await runWithPriority("P0", () => withGoogleRetry(fn, { kind: "read" }));
    await runWithPriority("P0", () => withGoogleRetry(fn, { kind: "read" })); // waits 10 s: allowed
    const e: any = await runWithPriority("P0", () => withGoogleRetry(fn, { kind: "read" })).catch((x) => x); // would wait 20 s: refused
    expect(e).toBeInstanceOf(GoogleBackpressureError);
    expect(e.retryable).toBe(true);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("a Google 429 penalises the whole budget so other callers slow down too", () => {
    const config: LimiterConfig = { readsPerMinute: 6, writesPerMinute: 6, burst: 1, maxWaitMs: 1e9 };
    const plain = new MemoryLimiterBackend();
    const penalised = new MemoryLimiterBackend();
    plain.reserve("read", config, 1000);
    penalised.reserve("read", config, 1000);
    penalised.penalize("read", 30_000, 1000); // Google answered 429
    expect(penalised.reserve("read", config, 1000)).toBeGreaterThanOrEqual(plain.reserve("read", config, 1000) + 30_000);
    expect(penalised.reserve("write", config, 1000)).toBe(0); // the other budget is untouched
  });

  it("a 429 inside withGoogleRetry reaches the shared backend", async () => {
    const calls: [RequestKind, number][] = [];
    const inner = new MemoryLimiterBackend();
    setLimiterBackend({ reserve: (k, c, n) => inner.reserve(k, c, n), penalize: (k, ms, n) => { calls.push([k, ms]); inner.penalize(k, ms, n); } });
    let n = 0;
    await withGoogleRetry(async () => { if (++n === 1) throw err(429); return 1; }, { kind: "read", maxElapsedMs: 10_000_000 });
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe("read");
  });

  it("metrics: reads, writes, retries and waiting are counted without any record data", async () => {
    process.env.GOOGLE_SHEETS_READS_PER_MINUTE = "0";
    process.env.GOOGLE_SHEETS_WRITES_PER_MINUTE = "0";
    let n = 0;
    await withGoogleRetry(async () => { if (++n === 1) throw err(429); }, { kind: "read", label: "Sheets read rows Donations", maxElapsedMs: 10_000_000 });
    await withGoogleRetry(async () => 1, { kind: "write", label: "Sheets append row Donations" });
    const snap = googleUsageSnapshot() as any;
    expect(snap.byKind.read).toBe(2);
    expect(snap.byKind.write).toBe(1);
    expect(snap.byKind.retries).toBe(1);
    expect(snap.total.quotaRejections).toBe(1);
    expect(JSON.stringify(snap)).not.toMatch(/@|DA\d{3}/);
  });
});

describe("fewer requests, same answers", () => {
  beforeEach(async () => {
    await resetWorld();
    process.env.GOOGLE_SHEETS_READS_PER_MINUTE = "0";
    process.env.GOOGLE_SHEETS_WRITES_PER_MINUTE = "0";
  });

  it("a donation to a specific cause reads Causes and Program_Content in ONE batched request, and still refuses an ineligible cause", async () => {
    fakeSheets.seed("Causes", ["id", "title", "category", "targetAmount", "raisedAmount", "location", "description", "status", "imageUrl", "driveFileId", "createdAt", "kind"], [
      { id: "C-OPEN", title: "Open", category: "R", targetAmount: 1, raisedAmount: 0, status: "Active", kind: "cause" },
      { id: "C-DONE", title: "Done", category: "R", targetAmount: 1, raisedAmount: 0, status: "Completed", kind: "cause" },
    ]);
    const { readEligibilityFresh } = await import("@/lib/catalog/holds");
    const batch = vi.spyOn(fakeSheets, "batchGetRows");
    const { catalog } = await readEligibilityFresh();
    expect(batch).toHaveBeenCalledTimes(1);
    expect(catalog.map((c) => c.id).sort()).toEqual(["C-DONE", "C-OPEN"]);
    const { donationService } = await import("@/lib/services/donationService");
    const donate = (id: string) => donationService.processDonation({ donorName: "Q", donorContact: "q@example.invalid", amount: 50, cause: id, selectedCauses: [{ causeId: id }], screenshotBuffer: Buffer.from("png"), screenshotFilename: "p.png", screenshotMimeType: "image/png" });
    await expect(donate("C-DONE")).rejects.toThrow(/not open/);
    await expect(donate("C-OPEN")).resolves.toMatchObject({ success: true });
  });

  it("an allocation reads its four authoritative inputs in ONE batched request (previously four)", async () => {
    fakeSheets.seed("Causes", ["id", "title", "category", "targetAmount", "raisedAmount", "location", "description", "status", "imageUrl", "driveFileId", "createdAt", "kind"], [{ id: "C1", title: "C1", category: "R", targetAmount: 1, raisedAmount: 0, status: "Active", kind: "cause" }]);
    const { donationService } = await import("@/lib/services/donationService");
    const r = await donationService.processDonation({ donorName: "Q", donorContact: "q2@example.invalid", amount: 100, cause: "C1", selectedCauses: [{ causeId: "C1" }], screenshotBuffer: Buffer.from("png"), screenshotFilename: "p.png", screenshotMimeType: "image/png" });
    const { donationRepository } = await import("@/lib/repositories/donationRepository");
    await donationRepository.updateStatus(r.donationId, "completed");
    const batch = vi.spyOn(fakeSheets, "batchGetRows");
    const { createAllocation } = await import("@/lib/services/allocationService");
    await createAllocation({ donationId: r.donationId, causeId: "C1", amount: 40, requestKey: "k-batch", actorEmail: "a@x.invalid" });
    const first = batch.mock.calls[0][0];
    expect(batch).toHaveBeenCalledTimes(1);
    expect([...first].sort()).toEqual(["Allocations", "Causes", "Donation_Causes", "Donations"]);
  });
});

describe("identical concurrent reads of the real Sheets client are coalesced only when safe", () => {
  const api = vi.hoisted(() => ({ get: vi.fn(), append: vi.fn() }));
  vi.mock("googleapis", () => ({
    google: {
      auth: { JWT: class { constructor(_o: any) {} } },
      sheets: () => ({ spreadsheets: { values: { get: api.get, append: api.append, update: vi.fn(), clear: vi.fn(), batchGet: vi.fn() }, get: vi.fn(), batchUpdate: vi.fn() } }),
      drive: () => ({ files: {} }),
    },
  }));
  const APPROVED = "1sGVsMEQDI1WmjWdUTQ0eKOzZC34Ri9CLsf4uUUceGzM";
  const setup = () => {
    process.env = { ...saved, NODE_ENV: "development", GOOGLE_SHEET_ID: APPROVED, GOOGLE_TEST_SHEET_ID: APPROVED, GOOGLE_TARGET_ENV: "test", GOOGLE_CLIENT_EMAIL: "sa@x.iam.gserviceaccount.com", GOOGLE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n", GOOGLE_SHEETS_READS_PER_MINUTE: "0", GOOGLE_SHEETS_WRITES_PER_MINUTE: "0" };
  };

  it("five simultaneous identical reads cost ONE request; a read started before a write finished is never shared with a read that follows the write", async () => {
    setup();
    vi.resetModules();
    api.get.mockReset();
    api.append.mockReset().mockResolvedValue({ data: { updates: { updatedRange: "Donations!A9:C9" } } });
    let release: (v: any) => void = () => {};
    api.get.mockImplementationOnce(() => new Promise((r) => { release = r; })).mockResolvedValue({ data: { values: [["id"], ["fresh"]] } });
    const { SheetsService } = await vi.importActual<typeof import("@/lib/google/sheets")>("@/lib/google/sheets");
    const svc = new SheetsService(APPROVED);
    const early = Array.from({ length: 5 }, () => svc.getRowsWithNumbers("Donations"));
    await new Promise((r) => setTimeout(r, 10));
    const bodyReads = () => api.get.mock.calls.filter((c: any) => /A:ZZ/.test(String(c[0].range))).length;
    expect(bodyReads()).toBe(1); // coalesced
    await svc.appendRow("Donations", { id: "mine" }, ["id"]); // a write finishes while that read is still in flight
    const afterWrite = svc.getRowsWithNumbers("Donations"); // must NOT join the older read
    await new Promise((r) => setTimeout(r, 10));
    expect(bodyReads()).toBe(2);
    release({ data: { values: [["id"], ["stale"]] } });
    const [first] = await Promise.all(early);
    expect(first.rows[0].record.id).toBe("stale");
    expect((await afterWrite).rows[0].record.id).toBe("fresh");
  });
});
