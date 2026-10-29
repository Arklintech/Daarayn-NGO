import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { build } from "esbuild";
import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { startFakeRedisRest, type FakeRedis } from "./helpers/fakeRedisRest";

/**
 * Independent OS processes (separate Node runtimes, separate module state, separate HTTP connections) share ONE budget through a
 * coordinator. The coordinator here is the LOCAL EMULATOR: this proves the multi-process behaviour of the client and the arithmetic of the
 * reservation, NOT the behaviour of a real managed Redis service (see docs/ops/SHARED_LIMITER.md).
 */
let redis: FakeRedis;
let bundle: string;
const RATE = 300; // per minute -> 200 ms
const INTERVAL = 60_000 / RATE;

const run = (env: Record<string, string>) =>
  new Promise<{ pid: number; grants?: number[]; error?: string }>((resolve, reject) => {
    const p = spawn(process.execPath, [bundle], {
      env: { ...process.env, GOOGLE_LIMITER_REDIS_REST_URL: redis.url, GOOGLE_LIMITER_REDIS_REST_TOKEN: redis.token, GOOGLE_LIMITER_KEY_PREFIX: "proc:test", GOOGLE_SERVICE_ACCOUNT_EMAIL: "sa@proj.iam.gserviceaccount.com", GOOGLE_SHEETS_READS_PER_MINUTE: String(RATE), GOOGLE_SHEETS_WRITES_PER_MINUTE: String(RATE), GOOGLE_SHEETS_BURST: "1", GOOGLE_SHEETS_MAX_WAIT_MS: "60000", VITEST: "", ...env },
      stdio: ["ignore", "pipe", "inherit"],
    });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("error", reject);
    p.on("close", () => { try { resolve(JSON.parse(out.trim().split("\n").pop()!)); } catch { reject(new Error("child produced no result: " + out)); } });
  });

beforeAll(async () => {
  redis = await startFakeRedisRest();
  bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "limiter-child-")), "child.cjs");
  await build({ entryPoints: [path.join(process.cwd(), "tests/helpers/limiterChild.ts")], bundle: true, platform: "node", format: "cjs", outfile: bundle, alias: { "@": process.cwd() }, logLevel: "silent" });
}, 60_000);
afterAll(async () => { await redis.stop(); });

const spacing = (g: number[]) => g.slice(1).map((t, i) => t - g[i]);

describe("D22: three independent processes share one budget (emulated coordinator)", () => {
  it("combined grants from 3 processes x 8 requests respect the configured rate", async () => {
    const res = await Promise.all([run({ CHILD_COUNT: "8" }), run({ CHILD_COUNT: "8" }), run({ CHILD_COUNT: "8" })]);
    expect(res.map((r) => r.pid)).toHaveLength(3);
    expect(new Set(res.map((r) => r.pid)).size).toBe(3);
    res.forEach((r) => expect(r.error).toBeUndefined());
    const all = res.flatMap((r) => r.grants!).sort((a, b) => a - b);
    expect(all).toHaveLength(24);
    // sleep granularity and process scheduling add jitter; the combined rate may not exceed the limit by more than that
    const span = all[all.length - 1] - all[0];
    expect(span).toBeGreaterThanOrEqual(23 * INTERVAL * 0.85); // 24 requests need ~23 intervals, not one burst
    const perMinute = (all.length - 1) / (span / 60_000);
    expect(perMinute).toBeLessThanOrEqual(RATE * 1.2);
    expect(Math.min(...spacing(all))).toBeGreaterThanOrEqual(0);
    expect(redis.grants.get("proc:test:" + [...redis.grants.keys()][0].split(":").pop()) ?? redis.grants.get([...redis.grants.keys()][0])).toHaveLength(24);
  }, 60_000);

  it("a penalty (HTTP 429) applied by one process slows the other processes", async () => {
    const [pen, waiter] = await Promise.all([run({ CHILD_COUNT: "0", CHILD_PENALTY_MS: "3000" }), (async () => { await new Promise((r) => setTimeout(r, 700)); const t0 = Date.now(); const r = await run({ CHILD_COUNT: "1" }); return { r, waitedUntil: r.grants![0] - t0 }; })()]);
    expect(pen.error).toBeUndefined();
    expect(waiter.waitedUntil).toBeGreaterThan(1500); // would be ~400 ms (process start) without the shared penalty
  }, 60_000);

  it("restarting a process does not reset the shared budget", async () => {
    const first = await run({ CHILD_COUNT: "6", CHILD_KIND: "write" });
    const lastFirst = first.grants![5];
    const second = await run({ CHILD_COUNT: "6", CHILD_KIND: "write" }); // a brand-new process right afterwards
    expect(second.grants![0]).toBeGreaterThanOrEqual(lastFirst); // continues after the first process' reservations
    const merged = [...first.grants!, ...second.grants!].sort((a, b) => a - b);
    expect(Math.min(...spacing(merged))).toBeGreaterThanOrEqual(0);
    expect(merged[11] - merged[0]).toBeGreaterThanOrEqual(11 * INTERVAL * 0.8);
  }, 60_000);

  it("read and write budgets are enforced independently across processes", async () => {
    const t0 = Date.now();
    const [r, w] = await Promise.all([run({ CHILD_COUNT: "6", CHILD_KIND: "read" }), run({ CHILD_COUNT: "6", CHILD_KIND: "write" })]);
    const rSpan = r.grants![5] - r.grants![0], wSpan = w.grants![5] - w.grants![0];
    // each kind needs ~5 intervals on its own; if they shared one budget the pair would need ~11 intervals
    expect(Math.max(rSpan, wSpan)).toBeLessThan(8 * INTERVAL + 400);
    expect(Math.max(rSpan, wSpan)).toBeGreaterThanOrEqual(4 * INTERVAL * 0.8);
    expect(Date.now() - t0).toBeGreaterThan(0);
  }, 60_000);

  it("a coordinator outage makes every process refuse (fail_closed) instead of bypassing the limit", async () => {
    redis.mode.down = true;
    const res = await Promise.all([run({ CHILD_COUNT: "2" }), run({ CHILD_COUNT: "2" }), run({ CHILD_COUNT: "2" })]);
    redis.mode.down = false;
    res.forEach((r) => expect(r.error).toBe("GOOGLE_LIMITER_UNAVAILABLE"));
  }, 60_000);
});
