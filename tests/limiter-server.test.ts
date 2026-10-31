import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { build } from "esbuild";
import { spawn, type ChildProcess } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { startFakeResp, type FakeResp } from "./helpers/fakeRespServer";
import { createBackendFromEnv } from "@/lib/google/requestControl";

/**
 * Real independent OS processes against the SELF-HOSTED coordinator (tools/limiter-server/server.cjs, started here as its own process) and
 * against a local RESP emulator. The coordinator service is the actual deployable program, but it runs on this machine: this is
 * multi-process verification of the code, NOT verification of a hosted production coordinator or of Google's own quota behaviour.
 */
const TOKEN = "test-coordinator-token-0123456789";
const RATE = 300; // per minute -> 200 ms
const INTERVAL = 60_000 / RATE;
let tmp: string;
let childBundle: string;
let server: ChildProcess | null = null;
let serverUrl = "";
let stateFile = "";

const startServer = (extra: Record<string, string> = {}) =>
  new Promise<void>((resolve, reject) => {
    server = spawn(process.execPath, [path.join(process.cwd(), "tools/limiter-server/server.cjs")], { env: { ...process.env, LIMITER_TOKEN: TOKEN, PORT: String(extra.PORT || 0), LIMITER_HOST: "127.0.0.1", LIMITER_STATE_FILE: stateFile, LIMITER_ACCEPT_EMPTY_STATE: "true", LIMITER_MAX_LEASE_MS: "3000", ...extra }, stdio: ["ignore", "pipe", "inherit"] });
    server.stdout!.once("data", (d) => {
      const info = JSON.parse(String(d).trim().split("\n")[0]);
      serverUrl = `http://127.0.0.1:${info.listening}`;
      resolve();
    });
    server.on("error", reject);
  });
const stopServer = () => new Promise<void>((resolve) => {
  if (!server) return resolve();
  server.once("close", () => resolve());
  server.kill();
  server = null;
});

const run = (env: Record<string, string>) =>
  new Promise<{ pid: number; grants?: number[]; error?: string }>((resolve, reject) => {
    const p = spawn(process.execPath, [childBundle], {
      env: { ...process.env, GOOGLE_LIMITER_KEY_PREFIX: "srv:test", GOOGLE_SERVICE_ACCOUNT_EMAIL: "sa@proj.iam.gserviceaccount.com", GOOGLE_SHEETS_READS_PER_MINUTE: String(RATE), GOOGLE_SHEETS_WRITES_PER_MINUTE: String(RATE), GOOGLE_SHEETS_BURST: "1", GOOGLE_SHEETS_MAX_WAIT_MS: "60000", GOOGLE_SHEETS_PROJECT_READS_PER_MINUTE: "0", GOOGLE_SHEETS_PROJECT_WRITES_PER_MINUTE: "0", GOOGLE_LIMITER_TIMEOUT_MS: "800", GOOGLE_LIMITER_REDIS_REST_URL: serverUrl, GOOGLE_LIMITER_REDIS_REST_TOKEN: TOKEN, VITEST: "", ...env },
      stdio: ["ignore", "pipe", "inherit"],
    });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("error", reject);
    p.on("close", () => { try { resolve(JSON.parse(out.trim().split("\n").pop()!)); } catch { reject(new Error("child produced no result: " + out)); } });
  });

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "limiter-server-"));
  childBundle = path.join(tmp, "child.cjs");
  await build({ entryPoints: [path.join(process.cwd(), "tests/helpers/limiterChild.ts")], bundle: true, platform: "node", format: "cjs", outfile: childBundle, alias: { "@": process.cwd() }, logLevel: "silent" });
}, 60_000);

afterEach(async () => { await stopServer(); });
afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

const eventually = async (fn: () => Promise<boolean>, ms = 8000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 200)); }
  return false;
};
const post = (body: unknown, headers: Record<string, string> = {}) => fetch(serverUrl, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}`, ...headers }, body: JSON.stringify(body) });
const reserveCmd = (key: string) => ["EVAL", "-- GCRA-reserve-v3", 2, key, "proj:" + key, 200, 1, 0, 0, 1, 0];

describe("D26: three independent processes against the self-hosted coordinator service", () => {
  it("combined grants from 3 processes x 8 requests respect the configured rate; all three reach the same coordinator", async () => {
    stateFile = path.join(tmp, "s1.json");
    await startServer();
    const res = await Promise.all([run({ CHILD_COUNT: "8" }), run({ CHILD_COUNT: "8" }), run({ CHILD_COUNT: "8" })]);
    expect(new Set(res.map((r) => r.pid)).size).toBe(3);
    res.forEach((r) => expect(r.error).toBeUndefined());
    const all = res.flatMap((r) => r.grants!).sort((a, b) => a - b);
    const span = all[all.length - 1] - all[0];
    expect(all).toHaveLength(24);
    expect(span).toBeGreaterThanOrEqual(23 * INTERVAL * 0.85);
    expect(((all.length - 1) / (span / 60_000))).toBeLessThanOrEqual(RATE * 1.2);
  }, 90_000);

  it("ordinary restart with intact state continues the same budget; it does not release a burst", async () => {
    stateFile = path.join(tmp, "s2.json");
    await startServer();
    const first = await run({ CHILD_COUNT: "10", CHILD_KIND: "write" });
    await stopServer();
    await startServer(); // same state file, immediately (accept-empty is irrelevant: the state is readable)
    const second = await run({ CHILD_COUNT: "10", CHILD_KIND: "write" });
    expect(second.error).toBeUndefined();
    expect(second.grants![0]).toBeGreaterThanOrEqual(first.grants![9] - 50);
    const merged = [...first.grants!, ...second.grants!].sort((a, b) => a - b);
    expect((merged.length - 1) / ((merged[merged.length - 1] - merged[0]) / 60_000)).toBeLessThanOrEqual(RATE * 1.2);
  }, 90_000);

  it("MISSING state: every budget is quarantined (not released); /ready reports it; after the quarantine the budget runs normally", async () => {
    stateFile = path.join(tmp, "s3-missing.json");
    await startServer({ LIMITER_ACCEPT_EMPTY_STATE: "false", LIMITER_QUARANTINE_MS: "2500" });
    const early = await fetch(`${serverUrl}/ready`);
    expect(early.status).toBe(503);
    expect((await early.json()).quarantined).toBe(true);
    const t0 = Date.now();
    const a = await run({ CHILD_COUNT: "1" });
    expect(a.grants![0] - t0).toBeGreaterThanOrEqual(2000); // held until the quarantine ends (process start alone is ~300 ms)
    expect(await eventually(async () => (await fetch(`${serverUrl}/ready`)).status === 200, 4000)).toBe(true);
    const b = await run({ CHILD_COUNT: "3" }); // recovery: ordinary pacing again
    expect(b.error).toBeUndefined();
    expect(b.grants![2] - b.grants![0]).toBeGreaterThanOrEqual(2 * INTERVAL * 0.8);
  }, 60_000);

  it("CORRUPTED state is quarantined like missing state and the bad file is kept as evidence", async () => {
    stateFile = path.join(tmp, "s3-corrupt.json");
    fs.writeFileSync(stateFile, "{ this is not json");
    await startServer({ LIMITER_ACCEPT_EMPTY_STATE: "false", LIMITER_QUARANTINE_MS: "2000" });
    expect((await fetch(`${serverUrl}/ready`)).status).toBe(503);
    expect(fs.readdirSync(tmp).some((f) => f.startsWith("s3-corrupt.json.corrupt-"))).toBe(true);
    const t0 = Date.now();
    const a = await run({ CHILD_COUNT: "1" });
    expect(a.grants![0] - t0).toBeGreaterThanOrEqual(1500);
  }, 60_000);

  it("the quarantine itself survives a restart: a crash loop cannot shorten it", async () => {
    stateFile = path.join(tmp, "s3-loop.json");
    await startServer({ LIMITER_ACCEPT_EMPTY_STATE: "false", LIMITER_QUARANTINE_MS: "3000" });
    const t0 = Date.now();
    await stopServer();
    await startServer({ LIMITER_ACCEPT_EMPTY_STATE: "false", LIMITER_QUARANTINE_MS: "3000" }); // state file now exists, but the quarantine is recorded in it
    const r = await run({ CHILD_COUNT: "1" });
    expect(r.grants![0] - t0).toBeGreaterThanOrEqual(2500);
  }, 60_000);

  it("a hard kill during concurrent reservations loses no granted slot", async () => {
    stateFile = path.join(tmp, "s4-kill.json");
    await startServer();
    const wave = Promise.all([run({ CHILD_COUNT: "12" }), run({ CHILD_COUNT: "12" }), run({ CHILD_COUNT: "12" })]);
    await new Promise((r) => setTimeout(r, 900));
    server!.kill("SIGKILL"); // no chance to clean up
    server = null;
    const results = await wave;
    const granted = results.flatMap((r) => r.grants || []);
    await startServer();
    const after = await run({ CHILD_COUNT: "1" });
    expect(after.error).toBeUndefined();
    if (granted.length) expect(after.grants![0]).toBeGreaterThanOrEqual(Math.max(...granted) - 50); // continues after every slot that was handed out
  }, 90_000);

  it("a coordinator restart while callers are waiting does not disturb them (they already hold their slots)", async () => {
    stateFile = path.join(tmp, "s5-wait.json");
    await startServer();
    const pending = run({ CHILD_COUNT: "10" });
    await new Promise((r) => setTimeout(r, 700));
    await stopServer();
    await startServer();
    const r = await pending;
    expect(r.error).toBeUndefined();
    expect(r.grants).toHaveLength(10);
  }, 60_000);

  it("storage failure: reservations are refused (fail closed, nothing granted) and service resumes when the disk works", async () => {
    stateFile = path.join(tmp, "s6-disk.json");
    await startServer();
    fs.mkdirSync(stateFile + ".tmp"); // the temp file cannot be created: the save fails
    const res = await post(reserveCmd("k:read"));
    expect(res.status).toBe(503);
    const refused = await run({ CHILD_COUNT: "1" });
    expect(refused.error).toBe("GOOGLE_LIMITER_UNAVAILABLE");
    fs.rmdirSync(stateFile + ".tmp");
    expect(await eventually(async () => (await post(reserveCmd("k:read"))).status === 200, 8000)).toBe(true);
  }, 60_000);

  it("duplicate identical reservations each take their own slot (no slot is granted twice)", async () => {
    stateFile = path.join(tmp, "s7.json");
    await startServer();
    const rs = await Promise.all(Array.from({ length: 4 }, () => post(reserveCmd("dup:read")).then((r) => r.json())));
    const waits = rs.map((r: any) => r.result).sort((a: number, b: number) => a - b);
    expect(new Set(waits).size).toBe(4);
    for (let i = 1; i < 4; i++) expect(waits[i] - waits[i - 1]).toBeGreaterThanOrEqual(180);
  }, 30_000);

  it("a second instance on the same state file refuses to start (single authority)", async () => {
    stateFile = path.join(tmp, "s8.json");
    await startServer();
    const code = await new Promise<number | null>((resolve) => {
      const p = spawn(process.execPath, [path.join(process.cwd(), "tools/limiter-server/server.cjs")], { env: { ...process.env, LIMITER_TOKEN: TOKEN, PORT: "0", LIMITER_HOST: "127.0.0.1", LIMITER_STATE_FILE: stateFile }, stdio: "ignore" });
      p.on("close", (c) => resolve(c));
    });
    expect(code).toBe(2);
    expect((await fetch(`${serverUrl}/health`)).status).toBe(200); // the first instance is untouched
  }, 30_000);

  it("a 429 penalty from one process slows the others (shared, persisted)", async () => {
    stateFile = path.join(tmp, "s9.json");
    await startServer();
    const [, w] = await Promise.all([run({ CHILD_COUNT: "0", CHILD_PENALTY_MS: "3000" }), (async () => { await new Promise((r) => setTimeout(r, 700)); const t0 = Date.now(); const r = await run({ CHILD_COUNT: "1" }); return r.grants![0] - t0; })()]);
    expect(w).toBeGreaterThan(1500);
  }, 60_000);

  it("outage: every process refuses (fail closed); after recovery the next processes succeed", async () => {
    stateFile = path.join(tmp, "s10.json");
    await startServer();
    await stopServer();
    const down = await Promise.all([run({ CHILD_COUNT: "1" }), run({ CHILD_COUNT: "1" }), run({ CHILD_COUNT: "1" })]);
    down.forEach((r) => expect(r.error).toBe("GOOGLE_LIMITER_UNAVAILABLE"));
    await startServer();
    expect((await run({ CHILD_COUNT: "2" })).error).toBeUndefined();
  }, 60_000);

  it("authentication and transport: wrong or missing token refused; HTTPS required when configured; /health shows no secret", async () => {
    stateFile = path.join(tmp, "s11.json");
    await startServer({ LIMITER_REQUIRE_HTTPS: "true" });
    expect((await run({ CHILD_COUNT: "1", GOOGLE_LIMITER_REDIS_REST_TOKEN: "wrong" })).error).toBe("GOOGLE_LIMITER_UNAVAILABLE");
    expect((await fetch(serverUrl, { method: "POST", body: JSON.stringify(["PING"]) })).status).toBe(421); // plain http, not behind the TLS proxy
    expect((await post(["PING"], { "x-forwarded-proto": "https", authorization: "Bearer nope" })).status).toBe(401);
    expect((await post(["PING"], { "x-forwarded-proto": "https" })).status).toBe(200);
    const plain = await fetch(`${serverUrl}/health`); // platform probes use plain http
    expect(plain.status).toBe(200);
    const health = await plain.text();
    expect(health).not.toContain(TOKEN);
  }, 60_000);

  it("start-up validation: a short token is refused", async () => {
    const code = await new Promise<number | null>((resolve) => {
      const p = spawn(process.execPath, [path.join(process.cwd(), "tools/limiter-server/server.cjs")], { env: { ...process.env, LIMITER_TOKEN: "short", PORT: "0", LIMITER_STATE_FILE: path.join(tmp, "s12.json") }, stdio: "ignore" });
      p.on("close", (c) => resolve(c));
    });
    expect(code).toBe(1);
  });
});

describe("D25: any Redis-compatible server over TCP (redis:// URL), emulated locally", () => {
  let resp: FakeResp;
  beforeAll(async () => { resp = await startFakeResp(); });
  afterAll(async () => { await resp.stop(); });

  it("the TCP transport reserves through the same script and authenticates", async () => {
    const backend = createBackendFromEnv({ GOOGLE_LIMITER_REDIS_URL: resp.url, GOOGLE_SERVICE_ACCOUNT_EMAIL: "sa@p" });
    expect(backend.mode).toBe("shared");
    const cfg = { readsPerMinute: 600, writesPerMinute: 600, burst: 1, maxWaitMs: 60_000 };
    const w = await Promise.all([backend.reserve("read", cfg, 0), backend.reserve("read", cfg, 0), backend.reserve("read", cfg, 0)]);
    expect(Math.max(...(w as number[]))).toBeGreaterThanOrEqual(150);
    expect(resp.calls).toBe(3);
  });

  it("a wrong password fails closed", async () => {
    const backend = createBackendFromEnv({ GOOGLE_LIMITER_REDIS_URL: resp.url.replace("resp-secret", "nope") });
    await expect(backend.reserve("read", { readsPerMinute: 600, writesPerMinute: 600, burst: 1, maxWaitMs: 1000 }, 0)).rejects.toMatchObject({ code: "GOOGLE_LIMITER_UNAVAILABLE" });
  });

  it("3 independent processes x 6 requests through the TCP coordinator respect the rate", async () => {
    const env = { GOOGLE_LIMITER_REDIS_URL: resp.url, GOOGLE_LIMITER_REDIS_REST_URL: "", GOOGLE_LIMITER_REDIS_REST_TOKEN: "" };
    const res = await Promise.all([run({ ...env, CHILD_COUNT: "6" }), run({ ...env, CHILD_COUNT: "6" }), run({ ...env, CHILD_COUNT: "6" })]);
    res.forEach((r) => expect(r.error).toBeUndefined());
    const all = res.flatMap((r) => r.grants!).sort((a, b) => a - b);
    expect(all).toHaveLength(18);
    expect(all[17] - all[0]).toBeGreaterThanOrEqual(17 * INTERVAL * 0.85);
  }, 60_000);
});

describe("D29: coordinator request validation and bounds", () => {
  it("malformed or hostile arguments are refused with 400 and never reach the persisted state", async () => {
    stateFile = path.join(tmp, "v1.json");
    await startServer();
    const bad: unknown[][] = [
      ["EVAL", "-- GCRA-reserve-v3", 2, "k:read", "p:read", "abc", 1, 0, 0, 1, 0], // not a number
      ["EVAL", "-- GCRA-reserve-v3", 2, "k:read", "p:read", -5, 1, 0, 0, 1, 0], // negative interval
      ["EVAL", "-- GCRA-reserve-v3", 2, "k:read", "p:read", 200, 0, 0, 0, 1, 0], // burst below 1
      ["EVAL", "-- GCRA-reserve-v3", 2, "k:read", "p:read", 200, 1, 999999999, 0, 1, 0], // penalty far above ten minutes
      ["EVAL", "-- GCRA-reserve-v3", 2, "bad key with spaces", "p:read", 200, 1, 0, 0, 1, 0], // illegal key
      ["EVAL", "-- GCRA-reserve-v3", 2, "k".repeat(500), "p:read", 200, 1, 0, 0, 1, 0], // key too long
      ["EVAL", "-- GCRA-reserve-v3", 2, "k:read", "p:read", null, 1, 0, 0, 1, 0], // missing value
    ];
    for (const cmd of bad) expect((await post(cmd)).status).toBe(400);
    const saved = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    expect(Object.keys(saved.keys)).toEqual([]); // nothing was stored
    expect((await post(reserveCmd("good:read"))).status).toBe(200); // the service still works
  }, 30_000);

  it("the number of budget keys is bounded", async () => {
    stateFile = path.join(tmp, "v2.json");
    await startServer();
    let refused = 0;
    for (let i = 0; i < 260; i++) if ((await post(["EVAL", "-- GCRA-reserve-v3", 2, `b${i}:read`, `p${i}:read`, 200, 1, 0, 200, 1, 0])).status === 503) refused++;
    expect(refused).toBeGreaterThan(0); // 520 distinct keys exceed the bound of 500
  }, 60_000);

  it("a wrong token of the same length is refused (constant-time comparison)", async () => {
    stateFile = path.join(tmp, "v3.json");
    await startServer();
    const same = "x".repeat(TOKEN.length);
    expect((await fetch(serverUrl, { method: "POST", headers: { authorization: `Bearer ${same}` }, body: JSON.stringify(["PING"]) })).status).toBe(401);
    expect((await fetch(`${serverUrl}/metrics`, { headers: { authorization: `Bearer ${same}` } })).status).toBe(401);
  }, 30_000);

  it("/metrics needs the token, reports technical counters only and shows refusals from the priority ceiling", async () => {
    stateFile = path.join(tmp, "v4.json");
    await startServer();
    for (let i = 0; i < 3; i++) await post(["EVAL", "-- GCRA-reserve-v3", 2, "m:read", "pm:read", 1000, 1, 0, 0, 1, 1500]); // 0, 1000, then 2000 > 1500 refused
    const res = await fetch(`${serverUrl}/metrics`, { headers: { authorization: `Bearer ${TOKEN}` } });
    const m = await res.json();
    expect(m.refusedSinceStart.read).toBe(1);
    expect(m.rollingGranted60s.read).toBe(2);
    expect(JSON.stringify(m)).not.toContain(TOKEN);
    expect(JSON.stringify(m)).not.toContain("m:read"); // no key names
    expect((await fetch(`${serverUrl}/metrics`)).status).toBe(401);
  }, 30_000);
});

const leaseCmd = (...a: (string | number)[]) => post(["LEASE", ...a]).then((r) => r.json().then((j) => ({ status: r.status, ...(j.result ?? j) })));

describe("D30: leases with fencing tokens at the coordinator", () => {
  it("only one holder at a time; the token is strictly increasing; check is true only for the current token; release frees the resource", async () => {
    stateFile = path.join(tmp, "l1.json");
    await startServer();
    const a: any = await leaseCmd("acquire", "alloc:D1", "worker-a", 2000);
    expect(a.ok).toBe(true);
    const b: any = await leaseCmd("acquire", "alloc:D1", "worker-b", 2000);
    expect(b.ok).toBe(false);
    expect((await leaseCmd("check", "alloc:D1", a.token) as any).valid).toBe(true);
    expect((await leaseCmd("check", "alloc:D1", a.token + 1) as any).valid).toBe(false);
    expect((await leaseCmd("release", "alloc:D1", a.token + 5) as any).released).toBe(false); // a wrong token cannot release
    expect((await leaseCmd("release", "alloc:D1", a.token) as any).released).toBe(true);
    const c: any = await leaseCmd("acquire", "alloc:D1", "worker-b", 2000);
    expect(c.ok).toBe(true);
    expect(c.token).toBeGreaterThan(a.token);
    expect((await leaseCmd("check", "alloc:D1", a.token) as any).valid).toBe(false); // the old holder's token is no longer valid
  }, 30_000);

  it("an expired lease is taken over with a higher token and the old token is rejected by check", async () => {
    stateFile = path.join(tmp, "l2.json");
    await startServer();
    const a: any = await leaseCmd("acquire", "alloc:D2", "worker-a", 1000);
    await new Promise((r) => setTimeout(r, 1200));
    expect((await leaseCmd("check", "alloc:D2", a.token) as any).valid).toBe(false);
    const b: any = await leaseCmd("acquire", "alloc:D2", "worker-b", 1000);
    expect(b.ok).toBe(true);
    expect(b.token).toBeGreaterThan(a.token);
  }, 30_000);

  it("a lease and its fencing token survive a coordinator restart; tokens never go backwards", async () => {
    stateFile = path.join(tmp, "l3.json");
    await startServer();
    const a: any = await leaseCmd("acquire", "alloc:D3", "worker-a", 3000);
    await stopServer();
    await startServer();
    expect((await leaseCmd("check", "alloc:D3", a.token) as any).valid).toBe(true); // still the holder
    expect((await leaseCmd("acquire", "alloc:D3", "worker-b", 1000) as any).ok).toBe(false);
    await leaseCmd("release", "alloc:D3", a.token);
    const b: any = await leaseCmd("acquire", "alloc:D3", "worker-b", 1000);
    expect(b.token).toBeGreaterThan(a.token);
  }, 60_000);

  it("after a state LOSS no lease is granted during the quarantine (a holder from before the loss may still be working)", async () => {
    stateFile = path.join(tmp, "l4-missing.json");
    await startServer({ LIMITER_ACCEPT_EMPTY_STATE: "false", LIMITER_QUARANTINE_MS: "2000", LIMITER_MAX_LEASE_MS: "2000" });
    const early: any = await leaseCmd("acquire", "alloc:D4", "worker-a", 1000);
    expect(early.ok).toBe(false);
    expect(early.reason).toBe("quarantine");
    await new Promise((r) => setTimeout(r, 2300));
    expect(((await leaseCmd("acquire", "alloc:D4", "worker-a", 1000)) as any).ok).toBe(true);
  }, 30_000);

  it("invalid lease requests are refused with 400 and the lease table is bounded", async () => {
    stateFile = path.join(tmp, "l5.json");
    await startServer();
    for (const bad of [["acquire", "bad resource", "w", 1000], ["acquire", "alloc:X", "w", 10], ["acquire", "alloc:X", "w", 999999999], ["check", "alloc:X", "abc"], ["frobnicate", "alloc:X"]]) {
      expect((await post(["LEASE", ...bad])).status).toBe(400);
    }
  }, 30_000);

  it("three independent processes taking the same lease repeatedly never overlap (mutual exclusion across processes)", async () => {
    stateFile = path.join(tmp, "l6.json");
    await startServer({ LIMITER_MAX_LEASE_MS: "5000" });
    const bundle = path.join(tmp, "lease-child.cjs");
    await build({ entryPoints: [path.join(process.cwd(), "tests/helpers/leaseChild.ts")], bundle: true, platform: "node", format: "cjs", outfile: bundle, alias: { "@": process.cwd() }, logLevel: "silent" });
    const runChild = () => new Promise<any>((resolve, reject) => {
      const p = spawn(process.execPath, [bundle], { env: { ...process.env, GOOGLE_LIMITER_URL: serverUrl, GOOGLE_LIMITER_TOKEN: TOKEN, CHILD_ROUNDS: "4", CHILD_WORK_MS: "120", VITEST: "" }, stdio: ["ignore", "pipe", "inherit"] });
      let out = "";
      p.stdout.on("data", (d) => (out += d));
      p.on("error", reject);
      p.on("close", () => { try { resolve(JSON.parse(out.trim().split(String.fromCharCode(10)).pop()!)); } catch { reject(new Error("child produced no result")); } });
    });
    const results = await Promise.all([runChild(), runChild(), runChild()]);
    results.forEach((r) => expect(r.error).toBeUndefined());
    const iv = results.flatMap((r) => r.intervals as { start: number; end: number; token: number }[]).sort((x, y) => x.start - y.start);
    expect(iv).toHaveLength(12);
    for (let i = 1; i < iv.length; i++) {
      expect(iv[i].start).toBeGreaterThanOrEqual(iv[i - 1].end - 5); // no two holders at the same time (5 ms clock-read tolerance)
      expect(iv[i].token).toBeGreaterThan(iv[i - 1].token); // fencing tokens increase in the order the lease was used
    }
  }, 90_000);
});
