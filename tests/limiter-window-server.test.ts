import { describe, it, expect, afterEach } from "vitest";
import { spawn, type ChildProcess } from "child_process";
import { createRequire } from "module";
import fs from "fs";
import os from "os";
import path from "path";
import { RedisRestLimiterBackend, limiterConfig, windowReserve, WINDOW_MS, type WindowState } from "@/lib/google/requestControl";

const { evalWindowReserve } = createRequire(import.meta.url)("../tools/limiter-server/gcra.cjs");

/**
 * D38 Track B on the REAL coordinator program (its own OS process, on this machine; not a hosted coordinator): the sliding-window command, its durability,
 * its refusal, and the client that talks to it. Plus a property test that the TypeScript arithmetic equals the coordinator arithmetic.
 */
const TOKEN = "test-coordinator-token-0123456789";
let server: ChildProcess | null = null;
let url = "";
let tmp = "";

const start = (stateFile: string, extra: Record<string, string> = {}) =>
  new Promise<void>((resolve, reject) => {
    server = spawn(process.execPath, [path.join(process.cwd(), "tools/limiter-server/server.cjs")], { env: { ...process.env, LIMITER_TOKEN: TOKEN, PORT: "0", LIMITER_HOST: "127.0.0.1", LIMITER_STATE_FILE: stateFile, LIMITER_ACCEPT_EMPTY_STATE: "true", ...extra }, stdio: ["ignore", "pipe", "inherit"] });
    server.stdout!.once("data", (d) => {
      url = `http://127.0.0.1:${JSON.parse(String(d).trim().split("\n")[0]).listening}`;
      resolve();
    });
    server.on("error", reject);
  });
const stop = () =>
  new Promise<void>((resolve) => {
    if (!server) return resolve();
    server.once("close", () => resolve());
    server.kill();
    server = null;
  });
afterEach(async () => {
  await stop();
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  tmp = "";
});
const SCRIPT = "-- WINDOW-reserve-v1";
const post = async (cmd: unknown[]) => {
  const r = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(cmd) });
  return { status: r.status, body: (await r.json()) as any };
};
const reserve = (limit = 45, maxw = 0, penalty = 0, key = "t:read") => post(["EVAL", SCRIPT, 2, key, "t:project:read", limit, 60_000, penalty, 0, maxw]);
const fresh = () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "limiter-window-"));
  return path.join(tmp, "state.json");
};

describe("D38 Track B: the coordinator's sliding-window command (real process)", () => {
  it("a burst of 45 is admitted at once; the 46th waits for the window; a request above the ceiling is refused and reserves nothing", async () => {
    await start(fresh());
    for (let i = 0; i < 45; i++) expect((await reserve()).body.result).toBe(0);
    const w = (await reserve()).body.result;
    expect(w).toBeGreaterThan(55_000);
    expect(w).toBeLessThanOrEqual(60_000);
    const refused = await reserve(45, 25_000);
    expect(refused.body.result).toBe(-1);
    const again = (await reserve()).body.result; // the refused call reserved nothing: this one queues right behind the 46th
    expect(again).toBeGreaterThanOrEqual(w - 50);
    expect(again).toBeLessThanOrEqual(w + 2_000);
  });

  it("invalid arguments are refused with 400, and an unknown marker is unsupported (a Redis server would refuse the same way)", async () => {
    await start(fresh());
    expect((await post(["EVAL", SCRIPT, 2, "t:read", "t:project:read", 0, 60_000, 0, 0, 0])).status).toBe(400);
    expect((await post(["EVAL", SCRIPT, 2, "bad key!", "t:project:read", 45, 60_000, 0, 0, 0])).status).toBe(400);
    expect((await post(["EVAL", "-- something else", 2, "a", "b"])).status).toBe(400);
  });

  it("DURABLE: a restart on intact state does not release a burst (the used window is still used)", async () => {
    const state = fresh();
    await start(state);
    for (let i = 0; i < 45; i++) await reserve();
    await stop();
    await start(state);
    const w = (await reserve()).body.result;
    expect(w).toBeGreaterThan(50_000); // not 0: the 45 grants survived the restart
  }, 30_000);

  it("LOST STATE: every window stays closed during the quarantine, so a restart can never allow more than the documented quota", async () => {
    await start(fresh(), { LIMITER_ACCEPT_EMPTY_STATE: "false", LIMITER_QUARANTINE_MS: "75000" });
    const w = (await reserve()).body.result;
    expect(w).toBeGreaterThan(70_000);
  });

  it("the client speaks the same protocol: the window backend admits a burst, then paces, and a penalty blocks", async () => {
    await start(fresh());
    const backend = new RedisRestLimiterBackend({ url, token: TOKEN, keyPrefix: "client:test", timeoutMs: 2_000, policy: "fail_closed", degradedShare: 0.25 });
    const cfg = { ...limiterConfig({ GOOGLE_LIMITER_ALGORITHM: "window", GOOGLE_SHEETS_READS_PER_MINUTE: "10", GOOGLE_SHEETS_PROJECT_READS_PER_MINUTE: "0" }) };
    expect(cfg.algorithm).toBe("window");
    const waits: number[] = [];
    for (let i = 0; i < 11; i++) waits.push(await backend.reserve("read", cfg, Date.now()));
    expect(waits.slice(0, 10).every((x) => x === 0)).toBe(true);
    expect(waits[10]).toBeGreaterThan(55_000);
    // The algorithm is a DEPLOYMENT-level setting (GOOGLE_LIMITER_ALGORITHM): reserve and penalize both read it from the environment, so they always agree.
    const prior = process.env.GOOGLE_LIMITER_ALGORITHM;
    process.env.GOOGLE_LIMITER_ALGORITHM = "window";
    try {
      await backend.penalize("write", 5_000, Date.now());
      const w = await backend.reserve("write", { ...cfg, writesPerMinute: 10 }, Date.now());
      expect(w).toBeGreaterThan(3_000);
    } finally {
      if (prior === undefined) delete process.env.GOOGLE_LIMITER_ALGORITHM;
      else process.env.GOOGLE_LIMITER_ALGORITHM = prior;
    }
  });
});

describe("D38 Track B: TypeScript and coordinator arithmetic are identical", () => {
  it("2000 random reservations (bursts, pauses, ceilings) give the same wait in both implementations", () => {
    for (const seed of [11, 12, 13]) {
      let x = seed * 2654435761;
      const rnd = () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296);
      const ts: WindowState = { g: [], b: 0 };
      const store = new Map<string, WindowState>();
      let t = 1_000_000;
      for (let i = 0; i < 2000; i++) {
        t += rnd() < 0.8 ? rnd() * 60 : rnd() * 9_000;
        const maxw = rnd() < 0.3 ? 25_000 : 0;
        const a = windowReserve(ts, 45, Math.floor(t), maxw);
        const b = evalWindowReserve(store, ["u", "p"], [45, WINDOW_MS, 0, 0, maxw], Math.floor(t));
        expect(a).toBe(b);
      }
    }
  });
});
