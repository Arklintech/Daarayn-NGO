import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fakeSheets } from "./helpers/fakeSheets";
import { resetWorld, driveMock } from "./helpers/mocks";
import { startFakeRedisRest, type FakeRedis } from "./helpers/fakeRedisRest";
import { withGoogleRetry, setRetrySleep } from "@/lib/google/retry";
import {
  MemoryLimiterBackend,
  RedisRestLimiterBackend,
  LimiterUnavailableError,
  createBackendFromEnv,
  setLimiterBackend,
  limiterStatus,
  acquireSlot,
  limiterConfig,
  type FailurePolicy,
} from "@/lib/google/requestControl";
import { causeRepository } from "@/lib/repositories/causeRepository";
import { donationService } from "@/lib/services/donationService";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

/**
 * These tests run several independent limiter clients (separate objects with their own HTTP connections) against ONE local emulated
 * coordinator. The emulator is not a real Redis: this proves the client protocol, atomic-reservation arithmetic, and the failure
 * policies, not the behaviour of any managed service.
 */
let redis: FakeRedis;
const saved = { ...process.env };
const RATE = 600; // per minute -> 100 ms between slots
const INTERVAL = 60_000 / RATE;
const cfg = { readsPerMinute: RATE, writesPerMinute: RATE, burst: 1, maxWaitMs: 60_000 };

const client = (policy: FailurePolicy = "fail_closed", over: Partial<ConstructorParameters<typeof RedisRestLimiterBackend>[0]> = {}) =>
  new RedisRestLimiterBackend({ url: redis.url, token: redis.token, keyPrefix: "test:sheets", timeoutMs: 400, policy, degradedShare: 0.25, ...over });
const err = (code: number, extra: any = {}) => Object.assign(new Error(`http ${code}`), { code, ...extra });

beforeEach(async () => {
  redis = await startFakeRedisRest();
  setRetrySleep(async () => undefined);
  Object.assign(process.env, { GOOGLE_SHEETS_READS_PER_MINUTE: String(RATE), GOOGLE_SHEETS_WRITES_PER_MINUTE: String(RATE), GOOGLE_SHEETS_BURST: "1", GOOGLE_SHEETS_MAX_WAIT_MS: "60000", GOOGLE_SHEETS_PROJECT_READS_PER_MINUTE: "0", GOOGLE_SHEETS_PROJECT_WRITES_PER_MINUTE: "0" });
});
afterEach(async () => {
  await redis.stop();
  process.env = { ...saved };
  setLimiterBackend(new MemoryLimiterBackend());
  (globalThis as any).__daaraynRetrySleep = undefined;
});

describe("D21: one budget shared by independent clients", () => {
  it("3 independent clients x 8 simultaneous reservations: the combined slot rate respects the limit", async () => {
    const clients = [client(), client(), client()];
    const waits = (await Promise.all(clients.flatMap((c) => Array.from({ length: 8 }, () => c.reserve("read", cfg, Date.now()))))) as number[];
    expect(waits).toHaveLength(24);
    const slots = [...(redis.grants.get(Array.from(redis.grants.keys())[0]) ?? [])].sort((a, b) => a - b);
    expect(slots).toHaveLength(24); // every reservation hit the single counter
    for (let i = 1; i < slots.length; i++) expect(slots[i] - slots[i - 1]).toBeGreaterThanOrEqual(INTERVAL - 2);
    expect(slots[23] - slots[0]).toBeGreaterThanOrEqual(23 * INTERVAL - 5); // 24 requests cannot fit in less than 23 intervals
    expect(Math.max(...waits)).toBeGreaterThanOrEqual(22 * INTERVAL - 120);
  });

  it("contrast: three process-local limiters would each allow their own full rate (why a shared store is needed)", () => {
    const locals = [new MemoryLimiterBackend(), new MemoryLimiterBackend(), new MemoryLimiterBackend()];
    const now = Date.now();
    expect(locals.map((l) => l.reserve("read", cfg, now))).toEqual([0, 0, 0]); // 3 requests in the same instant: 3x the intended rate
  });

  it("read and write budgets are separate keys on the shared store", async () => {
    const a = client(), b = client();
    await Promise.all([a.reserve("read", cfg, 0), b.reserve("read", cfg, 0), a.reserve("write", cfg, 0)]);
    expect(Array.from(redis.grants.keys()).sort()).toEqual(["test:sheets:read", "test:sheets:write"]);
    expect(redis.grants.get("test:sheets:read")).toHaveLength(2);
    expect(redis.grants.get("test:sheets:write")).toHaveLength(1);
  });

  it("different Google service identities do not share a budget; the same identity does", () => {
    const base = { GOOGLE_LIMITER_REDIS_REST_URL: "http://x.invalid", GOOGLE_LIMITER_REDIS_REST_TOKEN: "t" };
    const key = (email: string) => (createBackendFromEnv({ ...base, GOOGLE_SERVICE_ACCOUNT_EMAIL: email }) as any).o.keyPrefix;
    expect(key("a@p.iam.gserviceaccount.com")).toBe(key("A@p.iam.gserviceaccount.com"));
    expect(key("a@p.iam.gserviceaccount.com")).not.toBe(key("b@p.iam.gserviceaccount.com"));
    expect(key("a@p.iam.gserviceaccount.com")).not.toContain("a@p"); // identity is hashed
  });

  it("a Google HTTP 429 seen by one client slows every other client", async () => {
    const a = client(), b = client();
    await a.reserve("read", cfg, 0);
    await a.penalize("read", 5000, Date.now());
    const w = (await b.reserve("read", cfg, Date.now())) as number;
    expect(w).toBeGreaterThanOrEqual(4800);
  });

  it("withGoogleRetry on the shared backend: 429 + Retry-After retried once, one logical effect, penalty visible to a second client", async () => {
    const a = client();
    setLimiterBackend(a);
    let effects = 0, n = 0;
    await withGoogleRetry(async () => { if (++n === 1) throw err(429, { response: { headers: { "retry-after": "4" } } }); effects++; }, { kind: "read", maxElapsedMs: 10_000_000 });
    expect(effects).toBe(1);
    const w = (await client().reserve("read", cfg, Date.now())) as number;
    expect(w).toBeGreaterThanOrEqual(3000);
  });

  it("the sync-free key expires: stored values are plain numbers and never Google data", async () => {
    await client().reserve("read", cfg, 0);
    for (const v of redis.keys.values()) expect(Number.isFinite(v)).toBe(true);
  });
});

describe("D21: coordinator failure policy", () => {
  it("fail_closed (default): outage refuses the request BEFORE anything is sent to Google; error is retryable", async () => {
    redis.mode.down = true;
    setLimiterBackend(client("fail_closed"));
    const fn = vi.fn(async () => "sent");
    const e: any = await withGoogleRetry(fn, { kind: "write", label: "append" }).catch((x) => x);
    expect(e).toBeInstanceOf(LimiterUnavailableError);
    expect(e.retryable).toBe(true);
    expect(e.retriesExhausted).toBe(true); // existing handlers answer 503
    expect(fn).not.toHaveBeenCalled();
  });

  it.each([
    ["unreachable", () => { redis.mode.down = true; }],
    ["HTTP 500", () => { redis.mode.status = 500; }],
    ["slower than the timeout", () => { redis.mode.delayMs = 1200; }],
  ])("fail_closed: coordinator %s", async (_n, breakIt) => {
    breakIt();
    await expect(client("fail_closed").reserve("read", cfg, Date.now())).rejects.toBeInstanceOf(LimiterUnavailableError);
  });

  it("wrong token is a failure, not a bypass", async () => {
    await expect(client("fail_closed", { token: "wrong" }).reserve("read", cfg, Date.now())).rejects.toBeInstanceOf(LimiterUnavailableError);
  });

  it("after a failure the dead coordinator is not hammered (short cool-down) and recovery is picked up by a fresh client", async () => {
    redis.mode.down = true;
    const c = client("fail_closed");
    await c.reserve("read", cfg, 0).catch(() => undefined);
    const calls = redis.calls;
    await c.reserve("read", cfg, 0).catch(() => undefined);
    await c.reserve("write", cfg, 0).catch(() => undefined);
    expect(redis.calls).toBe(calls); // no further requests during the cool-down
    redis.mode.down = false;
    await expect(client("fail_closed").reserve("read", cfg, Date.now())).resolves.toBe(0);
  });

  it("degraded_local (explicit opt-in): paces with a reduced local share instead of failing, and says so in status", async () => {
    redis.mode.down = true;
    const c = client("degraded_local");
    const now = Date.now();
    const w1 = await c.reserve("read", cfg, now);
    const w2 = await c.reserve("read", cfg, now);
    expect(w1).toBe(0);
    expect(w2).toBeGreaterThanOrEqual(INTERVAL * 4 - 5); // 25% share = 4x the interval
    setLimiterBackend(c);
    expect(limiterStatus()).toEqual({ mode: "shared", crossInstance: true, policy: "degraded_local", production: false, ready: true });
  });

  it("limiterStatus reports process-local when no coordinator is configured, and the shared mode (no URL/token) when it is", () => {
    setLimiterBackend(createBackendFromEnv({}));
    expect(limiterStatus()).toEqual({ mode: "process-local", crossInstance: false, production: false, ready: true });
    setLimiterBackend(createBackendFromEnv({ GOOGLE_LIMITER_REDIS_REST_URL: "http://x.invalid", GOOGLE_LIMITER_REDIS_REST_TOKEN: "secret-token" }));
    const s = JSON.stringify(limiterStatus());
    expect(s).toContain('"shared"');
    expect(s).not.toContain("secret-token");
    expect(s).not.toContain("x.invalid");
  });

  it("only one of URL/token present: stays process-local (never half-configured)", () => {
    expect(createBackendFromEnv({ GOOGLE_LIMITER_REDIS_REST_URL: "http://x.invalid" }).mode).toBe("process-local");
    expect(createBackendFromEnv({ GOOGLE_LIMITER_REDIS_REST_TOKEN: "t" }).mode).toBe("process-local");
  });

  it("a request that would wait past the maximum is refused unsent even on the shared backend", async () => {
    setLimiterBackend(client());
    const tight = { GOOGLE_SHEETS_MAX_WAIT_MS: "150" };
    Object.assign(process.env, tight);
    (globalThis as any).__daaraynRetrySleep = async () => undefined;
    await acquireSlot("read");
    await acquireSlot("read");
    await expect(acquireSlot("read")).rejects.toMatchObject({ code: "GOOGLE_BACKPRESSURE" });
    expect(limiterConfig().maxWaitMs).toBe(150);
  });
});

describe("D21: ambiguous writes and idempotent donation recovery under the shared limiter", () => {
  const CAUSE_HEADERS = ["id", "title", "category", "targetAmount", "raisedAmount", "location", "description", "status", "imageUrl", "driveFileId", "createdAt", "kind"];
  const cause = { id: "C1", title: "Cause C1", category: "Relief", targetAmount: "1000", raisedAmount: "0", location: "", description: "", status: "Active", imageUrl: "", driveFileId: "", createdAt: "", kind: "cause" };
  const donate = (over: Record<string, any> = {}) =>
    donationService.processDonation({
      donorName: "Shared Limiter", donorContact: "shared@example.invalid", amount: 100, cause: "C1", selectedCauses: [{ causeId: "C1" }],
      screenshotBuffer: Buffer.from("png"), screenshotFilename: "p.png", screenshotMimeType: "image/png", ...over,
    });
  let proof = 0;

  /** The fake replaces SheetsService wholesale, so charge the limiter at the same seam SheetsService.call uses (one slot per request). */
  const chargeLimiter = () => {
    const reads = ["getHeaders", "getRowsWithNumbers", "getAllRows", "batchGetRows"];
    const writes = ["appendRow", "appendRows", "batchAppendRows", "updateRowAt", "updateRowsAt", "clearRowAt", "updateRow"];
    for (const [names, kind] of [[reads, "read"], [writes, "write"]] as const) {
      for (const n of names) {
        const orig = (fakeSheets as any)[n].bind(fakeSheets);
        vi.spyOn(fakeSheets as any, n).mockImplementation((...a: any[]) => withGoogleRetry(() => orig(...a), { kind, label: `Sheets ${kind} ${n}`, quotaOnly: kind === "write" }));
      }
    }
  };

  beforeEach(async () => {
    await resetWorld();
    chargeLimiter();
    fakeSheets.misreportAppendedRow = true;
    fakeSheets.seed("Causes", CAUSE_HEADERS, [cause]);
    causeRepository.invalidateCache();
    proof = 0;
    driveMock.uploadFile.mockImplementation(async () => ({ drive_file_id: `PROOF_${++proof}`, storage_backend: "google_drive" }));
    driveMock.deleteFile.mockImplementation(async () => true);
    Object.assign(process.env, { GOOGLE_SHEETS_READS_PER_MINUTE: "60000", GOOGLE_SHEETS_WRITES_PER_MINUTE: "60000", GOOGLE_SHEETS_BURST: "100" });
  });

  it("8 simultaneous identical submissions through the shared coordinator: ONE donation, ONE designation, same answer", async () => {
    setLimiterBackend(client());
    const results = await Promise.all(Array.from({ length: 8 }, () => donate({ submissionKey: "SHARED-SAME" })));
    expect(new Set(results.map((r) => r.donationId)).size).toBe(1);
    expect(fakeSheets.records("Donations")).toHaveLength(1);
    expect(fakeSheets.records("Donation_Causes")).toHaveLength(1);
    expect(redis.calls).toBeGreaterThan(8); // the coordinator really was consulted
  });

  it("coordinator outage (fail_closed): the donation is refused with a retryable error, NOTHING is stored; the replay after recovery creates exactly one", async () => {
    redis.mode.down = true;
    setLimiterBackend(client("fail_closed"));
    const e: any = await donate({ submissionKey: "OUTAGE-KEY" }).catch((x) => x);
    expect(e?.retryable).toBe(true);
    expect(fakeSheets.records("Donations")).toHaveLength(0);
    expect(fakeSheets.records("Donors")).toHaveLength(0);

    redis.mode.down = false;
    setLimiterBackend(client("fail_closed")); // coordinator back
    const results = await Promise.all([donate({ submissionKey: "OUTAGE-KEY" }), donate({ submissionKey: "OUTAGE-KEY" })]);
    expect(new Set(results.map((r) => r.donationId)).size).toBe(1);
    expect(fakeSheets.records("Donations")).toHaveLength(1);
  });

  afterEach(() => vi.restoreAllMocks());

  it("an ambiguous write (503 after the row may exist) is never replayed blindly; a definite 429 is", async () => {
    setLimiterBackend(client());
    let rows = 0;
    await withGoogleRetry(async () => { if (rows === 0 && ++rows) throw err(429); rows++; }, { kind: "write", quotaOnly: true, maxElapsedMs: 10_000_000 });
    expect(rows).toBe(2); // 429: nothing was written, so the retry is safe
    let attempts = 0;
    await expect(withGoogleRetry(async () => { attempts++; throw err(503); }, { kind: "write", quotaOnly: true })).rejects.toBeTruthy();
    expect(attempts).toBe(1); // ambiguous: left to reconciliation by marker
  });
});

describe("D22: production never silently falls back to a process-local limiter", () => {
  it("production without a shared limiter is NOT ready and says why", () => {
    setLimiterBackend(new MemoryLimiterBackend());
    const s = limiterStatus({ GOOGLE_TARGET_ENV: "production" });
    expect(s).toMatchObject({ mode: "process-local", production: true, ready: false });
    expect(s.reason).toContain("GOOGLE_LIMITER_REDIS_REST_URL");
    expect(limiterStatus({ VERCEL_ENV: "production" }).ready).toBe(false);
  });

  it("an explicit owner decision for a single instance (GOOGLE_LIMITER_ALLOW_PROCESS_LOCAL=true) is accepted; a shared backend is ready", () => {
    setLimiterBackend(new MemoryLimiterBackend());
    expect(limiterStatus({ GOOGLE_TARGET_ENV: "production", GOOGLE_LIMITER_ALLOW_PROCESS_LOCAL: "true" }).ready).toBe(true);
    setLimiterBackend(client());
    expect(limiterStatus({ GOOGLE_TARGET_ENV: "production" })).toMatchObject({ mode: "shared", ready: true });
  });

  it("requests are refused UNSENT in production when the limiter is not configured (retryable), but not in test", async () => {
    setLimiterBackend(new MemoryLimiterBackend());
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fn = vi.fn(async () => "sent");
    const prod = { ...process.env, GOOGLE_TARGET_ENV: "production" };
    await expect(acquireSlot("read", prod)).rejects.toMatchObject({ code: "GOOGLE_LIMITER_NOT_CONFIGURED", retryable: true });
    await expect(acquireSlot("read", { ...process.env, GOOGLE_TARGET_ENV: "test" })).resolves.toBeGreaterThanOrEqual(0);
    process.env.GOOGLE_TARGET_ENV = "production";
    await expect(withGoogleRetry(fn, { kind: "write" })).rejects.toMatchObject({ code: "GOOGLE_LIMITER_NOT_CONFIGURED" });
    expect(fn).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it("the legacy sync client is charged to the same budget", async () => {
    setLimiterBackend(client());
    const { GoogleSheetsClient } = await import("@/lib/sync/GoogleSheetsClient");
    const before = redis.calls;
    const c: any = new GoogleSheetsClient();
    c.sheets = { spreadsheets: { values: { get: async () => ({ data: { values: [["h"]] } }), update: async () => ({}), append: async () => ({}) } } };
    await c.getHeaders("T");
    await c.appendRow("T", ["x"]);
    expect(redis.calls - before).toBe(2);
  });
});

describe("D25: the project-level budget is shared by every service identity", () => {
  it("two identities (two user budgets) still share one project budget; the user budget alone would let each go at full rate", async () => {
    const projectCfg = { ...cfg, readsPerMinute: 6000, writesPerMinute: 6000, projectReadsPerMinute: RATE, projectWritesPerMinute: RATE };
    const a = client("fail_closed", { keyPrefix: "test:sheets:idA", projectKeyPrefix: "test:sheets" });
    const b = client("fail_closed", { keyPrefix: "test:sheets:idB", projectKeyPrefix: "test:sheets" });
    const waits = (await Promise.all([...Array.from({ length: 6 }, () => a.reserve("read", projectCfg, 0)), ...Array.from({ length: 6 }, () => b.reserve("read", projectCfg, 0))])) as number[];
    expect(Math.max(...waits)).toBeGreaterThanOrEqual(10 * INTERVAL - 150); // 12 requests through one project budget need about 11 intervals
    const projectKeys = Array.from(redis.keys.keys()).filter((k) => k.includes(":project:"));
    expect(projectKeys).toEqual(["test:sheets:project:read"]);
  });

  it("a 429 penalty is applied to the project budget as well", async () => {
    const projectCfg = { ...cfg, projectReadsPerMinute: RATE };
    const a = client("fail_closed", { keyPrefix: "test:sheets:idA", projectKeyPrefix: "test:sheets" });
    const b = client("fail_closed", { keyPrefix: "test:sheets:idB", projectKeyPrefix: "test:sheets" });
    setLimiterBackend(a);
    process.env.GOOGLE_SHEETS_PROJECT_READS_PER_MINUTE = String(RATE);
    await a.penalize("read", 4000, Date.now());
    expect((await b.reserve("read", projectCfg, Date.now())) as number).toBeGreaterThanOrEqual(3500);
  });
});
