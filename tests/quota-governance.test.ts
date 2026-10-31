import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import { MemoryLimiterBackend, setLimiterBackend, acquireSlot, runWithPriority, currentPriority, PRIORITY_WAIT_SHARE, GoogleBackpressureError } from "@/lib/google/requestControl";
import { evaluateQuotaHealth, worst } from "@/lib/google/quotaAlerts";
import { googleUsageSnapshot, resetGoogleUsage, recordGoogleAttempt } from "@/lib/google/usage";

const saved = { ...process.env };
beforeEach(() => {
  resetGoogleUsage();
  (globalThis as any).__daaraynRetrySleep = async () => undefined;
  setLimiterBackend(new MemoryLimiterBackend());
  Object.assign(process.env, { GOOGLE_SHEETS_READS_PER_MINUTE: "60", GOOGLE_SHEETS_WRITES_PER_MINUTE: "60", GOOGLE_SHEETS_BURST: "1", GOOGLE_SHEETS_MAX_WAIT_MS: "10000" });
});
afterEach(() => {
  process.env = { ...saved };
  (globalThis as any).__daaraynRetrySleep = undefined;
  setLimiterBackend(new MemoryLimiterBackend());
});

describe("D29: request priority protects financial traffic", () => {
  it("when the queue builds, P3 is refused first, then P2; P0 and P1 are still admitted (1 s per slot, 10 s limit)", async () => {
    for (let i = 0; i < 4; i++) await acquireSlot("read", process.env, "P0"); // waits 0,1,2,3 s
    await expect(acquireSlot("read", process.env, "P3")).rejects.toBeInstanceOf(GoogleBackpressureError); // 4 s > 2 s (20 % of 10 s)
    await expect(acquireSlot("read", process.env, "P2")).resolves.toBeGreaterThan(0); // 4 s <= 5 s (50 %)
    expect(Math.abs((await acquireSlot("read", process.env, "P2")) - 5000)).toBeLessThan(50); // 5 s <= 5 s, queue now 6 s
    await expect(acquireSlot("read", process.env, "P2")).rejects.toBeInstanceOf(GoogleBackpressureError); // 6 s > 5 s
    expect(Math.abs((await acquireSlot("read", process.env, "P1")) - 6000)).toBeLessThan(50); // 6 s <= 10 s: critical work still admitted
    await expect(acquireSlot("read", process.env, "P0")).resolves.toBeGreaterThan(0);
    expect(googleUsageSnapshot().shed).toMatchObject({ P3: 1, P2: 1 });
  });

  it("a refused request reserves NOTHING (shedding does not waste budget)", async () => {
    for (let i = 0; i < 4; i++) await acquireSlot("read", process.env, "P0");
    for (let i = 0; i < 20; i++) await acquireSlot("read", process.env, "P3").catch(() => undefined); // 20 refused attempts
    const w = await acquireSlot("read", process.env, "P0"); // waits only for the slots really reserved
    expect(Math.abs(w - 4000)).toBeLessThan(50);
  });

  it("priority travels with the request through async code and defaults to P2", async () => {
    expect(currentPriority()).toBe("P2");
    await runWithPriority("P0", async () => {
      await Promise.resolve();
      expect(currentPriority()).toBe("P0");
    });
    expect(currentPriority()).toBe("P2");
    expect(PRIORITY_WAIT_SHARE.P0).toBe(1);
  });

  it("the financial routes declare their priority (P0 donation and allocation, P1 verification) and the public catalogue is P3", () => {
    const src = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf8");
    expect(src("app/api/donate/route.ts")).toMatch(/runWithPriority\("P0"/);
    expect(src("app/api/admin/allocations/route.ts")).toMatch(/POST = .*runWithPriority\("P0"/);
    expect(src("app/api/admin/allocations/route.ts")).toMatch(/PATCH = .*runWithPriority\("P0"/);
    expect(src("app/api/admin/donations/route.ts")).toMatch(/PATCH = .*runWithPriority\("P1"/);
    for (const f of ["app/api/public/stats/route.ts", "app/api/programs/route.ts", "app/api/causes/route.ts"]) expect(src(f)).toMatch(/GET = .*runWithPriority\("P3"/);
  });
});

describe("D29: rolling-window measurement", () => {
  it("counts attempts in a rolling 60 s window and remembers the peak", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 30; i++) recordGoogleAttempt("x", { failed: false, quota: false }, t0 + i * 1000, { kind: "read" });
    for (let i = 0; i < 5; i++) recordGoogleAttempt("x", { failed: false, quota: false }, t0 + 120_000 + i * 1000, { kind: "read" });
    const r: any = (googleUsageSnapshot() as any).rolling;
    expect(r.read.peak).toBe(30);
    expect(r.write.peak).toBe(0);
  });
});

describe("D29: alert evaluation (70 / 80 / 90 percent, 429, coordinator loss)", () => {
  const cfg = { readsPerMinute: 45, writesPerMinute: 45, burst: 5, maxWaitMs: 25000, projectReadsPerMinute: 200, projectWritesPerMinute: 200 };
  const local = { total: { quotaRejections: 0 }, byKind: { read: 0, write: 0, retries: 0, backpressure: 0 }, shed: {} };
  const metrics = (read: number, write = 0, queueRead = 0) => ({ storageOk: true, quarantined: false, rollingGranted60s: { read, write }, queueDepthMs: { read: queueRead, write: 0 }, refusedSinceStart: { read: 0, write: 0 }, penaltiesSinceStart: 0, storageFailuresSinceStart: 0 });

  it("bands: 69 percent ok, 71 warning, 80 high, 91 critical", () => {
    expect(worst(evaluateQuotaHealth({ config: cfg, coordinator: metrics(31), coordinatorConfigured: true, local }))).toBe("ok");
    expect(worst(evaluateQuotaHealth({ config: cfg, coordinator: metrics(32), coordinatorConfigured: true, local }))).toBe("warning");
    expect(worst(evaluateQuotaHealth({ config: cfg, coordinator: metrics(36), coordinatorConfigured: true, local }))).toBe("high");
    expect(worst(evaluateQuotaHealth({ config: cfg, coordinator: metrics(41), coordinatorConfigured: true, local }))).toBe("critical");
  });

  it("coordinator loss, missing configuration, 429 and uncertain financial operations are raised", () => {
    expect(worst(evaluateQuotaHealth({ config: cfg, coordinator: null, coordinatorConfigured: true, local }))).toBe("critical");
    expect(evaluateQuotaHealth({ config: cfg, coordinator: null, coordinatorConfigured: false, local })[0].code).toBe("COORDINATOR_NOT_CONFIGURED");
    const a = evaluateQuotaHealth({ config: cfg, coordinator: metrics(1), coordinatorConfigured: true, local: { ...local, total: { quotaRejections: 2 } }, uncertainFinancialOperations: 3 });
    expect(a.map((x) => x.code)).toEqual(expect.arrayContaining(["GOOGLE_HTTP_429", "UNCERTAIN_FINANCIAL_OPERATIONS"]));
  });

  it("a Google 429 reported by ANY instance (coordinator penalty counter) raises a global incident", () => {
    const a = evaluateQuotaHealth({ config: cfg, coordinator: { ...metrics(1), penaltiesSinceStart: 1 }, coordinatorConfigured: true, local });
    expect(a.map((x) => x.code)).toContain("GOOGLE_429_GLOBAL");
    expect(worst(a)).toBe("high");
  });

  it("queue depth over 50 percent of the wait limit warns, 80 percent is high", () => {
    expect(evaluateQuotaHealth({ config: cfg, coordinator: metrics(1, 0, 13000), coordinatorConfigured: true, local }).some((x) => x.code.startsWith("READ_QUEUE"))).toBe(true);
    expect(worst(evaluateQuotaHealth({ config: cfg, coordinator: metrics(1, 0, 21000), coordinatorConfigured: true, local }))).toBe("high");
  });
});

describe("D30: priority starvation", () => {
  it("a flood of P3 and P2 requests cannot starve P0: every critical request is admitted within the wait limit while low priorities are shed", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); // simulated clock: one critical request every 3 s while a flood of low-priority requests arrives each round
    setLimiterBackend(new MemoryLimiterBackend());
    let p0Admitted = 0;
    let lowAdmitted = 0;
    let lowShed = 0;
    for (let round = 0; round < 12; round++) {
      for (let i = 0; i < 25; i++) {
        await acquireSlot("read", process.env, i % 2 ? "P3" : "P2").then(() => lowAdmitted++, () => lowShed++);
      }
      await acquireSlot("read", process.env, "P0"); // must never be refused: the queue is capped for low priorities at 50 percent / 20 percent of the limit
      p0Admitted++;
      vi.setSystemTime(Date.now() + 3000);
    }
    vi.useRealTimers();
    expect(p0Admitted).toBe(12);
    expect(lowShed).toBeGreaterThan(lowAdmitted); // under flood the low priorities are the ones refused
    expect(googleUsageSnapshot().shed.P0 ?? 0).toBe(0);
    expect(googleUsageSnapshot().shed.P3 ?? 0).toBeGreaterThan(0);
  });
});
