/**
 * LIVE verification of the shared limiter against the REAL Redis-compatible REST service configured for this environment.
 * Skipped (NOT RUN) unless GOOGLE_LIMITER_REDIS_REST_URL and GOOGLE_LIMITER_REDIS_REST_TOKEN are set. It never calls Google and never prints
 * the URL or token; it uses a throw-away key prefix so it cannot consume the real budget.
 * Run: npx vitest run --config vitest.live.config.ts tests/live/shared-limiter-real.live.test.ts
 */
import "./env";
import { describe, it, expect, beforeAll } from "vitest";
import { build } from "esbuild";
import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const URL = (process.env.GOOGLE_LIMITER_REDIS_REST_URL || "").trim();
const TOKEN = (process.env.GOOGLE_LIMITER_REDIS_REST_TOKEN || "").trim();
const configured = Boolean(URL && TOKEN);
const RATE = 300;
const INTERVAL = 60_000 / RATE;
const PREFIX = `d22-verify-${Date.now().toString(36)}`;
let bundle = "";

const run = (env: Record<string, string>) =>
  new Promise<{ pid: number; grants?: number[]; error?: string }>((resolve, reject) => {
    const p = spawn(process.execPath, [bundle], { env: { ...process.env, GOOGLE_LIMITER_KEY_PREFIX: PREFIX, GOOGLE_SERVICE_ACCOUNT_EMAIL: "verify@invalid", GOOGLE_SHEETS_READS_PER_MINUTE: String(RATE), GOOGLE_SHEETS_WRITES_PER_MINUTE: String(RATE), GOOGLE_SHEETS_BURST: "1", GOOGLE_SHEETS_MAX_WAIT_MS: "60000", ...env }, stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("error", reject);
    p.on("close", () => { try { resolve(JSON.parse(out.trim().split("\n").pop()!)); } catch { reject(new Error("child produced no result")); } });
  });

beforeAll(async () => {
  if (!configured) return;
  bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "limiter-real-")), "child.cjs");
  await build({ entryPoints: [path.join(process.cwd(), "tests/helpers/limiterChild.ts")], bundle: true, platform: "node", format: "cjs", outfile: bundle, alias: { "@": process.cwd() }, logLevel: "silent" });
}, 60_000);

describe("LIVE shared limiter against the real coordinator", () => {
  it("3 independent processes x 8 requests share one budget; a penalty from one slows the others", async (ctx) => {
    if (!configured) ctx.skip("NOT RUN: GOOGLE_LIMITER_REDIS_REST_URL / _TOKEN are not configured");
    const res = await Promise.all([run({ CHILD_COUNT: "8" }), run({ CHILD_COUNT: "8" }), run({ CHILD_COUNT: "8" })]);
    res.forEach((r) => expect(r.error).toBeUndefined());
    const all = res.flatMap((r) => r.grants!).sort((a, b) => a - b);
    const span = all[all.length - 1] - all[0];
    expect(all).toHaveLength(24);
    expect(span).toBeGreaterThanOrEqual(23 * INTERVAL * 0.85);
    console.log(`real coordinator: 24 grants over ${span} ms = ${((all.length - 1) / (span / 60000)).toFixed(0)} per minute (limit ${RATE})`);
    const [, w] = await Promise.all([run({ CHILD_COUNT: "0", CHILD_PENALTY_MS: "3000", CHILD_KIND: "write" }), (async () => { await new Promise((r) => setTimeout(r, 700)); const t0 = Date.now(); const r = await run({ CHILD_COUNT: "1", CHILD_KIND: "write" }); return r.grants![0] - t0; })()]);
    expect(w).toBeGreaterThan(1500);
    const reads = await run({ CHILD_COUNT: "6", CHILD_KIND: "read" });
    const writes = await run({ CHILD_COUNT: "6", CHILD_KIND: "write" });
    expect(reads.error).toBeUndefined();
    expect(writes.error).toBeUndefined();
  }, 120_000);
});
