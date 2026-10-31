import { describe, it, expect } from "vitest";
import { createRequire } from "module";
import { WINDOW_MS } from "@/lib/google/requestControl";

const { evalWindowReserve } = createRequire(import.meta.url)("../tools/limiter-server/gcra.cjs") as {
  evalWindowReserve: (store: Map<string, { g: number[]; b: number }>, keys: string[], argv: unknown[], now: number, gate?: number) => number;
};

/**
 * D38 Track B: a sliding-window admission control. LIMIT grants are allowed in ANY window of WINDOW ms, so a burst is admitted at once when the
 * window is empty and the documented per-minute quota can never be exceeded, whatever the alignment of Google's own minute. Pure and deterministic.
 */
const WINDOW = 60_000;
const KEYS = ["g:read", "p:read"];
const argv = (limit: number, penalty = 0, plimit = 0, maxWait = 0) => [limit, WINDOW, penalty, plimit, maxWait];

/** Grant times for requests arriving at the given times (ms). */
function run(arrivals: number[], limit: number, opts: { plimit?: number; maxWait?: number } = {}) {
  const store = new Map<string, { g: number[]; b: number }>();
  const grants: number[] = [];
  for (const at of arrivals) {
    const wait = evalWindowReserve(store, KEYS, argv(limit, 0, opts.plimit || 0, opts.maxWait || 0), at);
    if (wait >= 0) grants.push(at + wait);
  }
  return { store, grants };
}
/** The strongest form of the rule: the (i+limit)th grant is at least WINDOW after the ith, so no window of WINDOW ms holds more than `limit`. */
const maxInAnyWindow = (grants: number[]) => {
  const g = [...grants].sort((a, b) => a - b);
  let best = 0;
  for (let i = 0, j = 0; i < g.length; i++) {
    while (g[i] - g[j] >= WINDOW) j++;
    best = Math.max(best, i - j + 1);
  }
  return best;
};

describe("D38 Track B: sliding-window admission", () => {
  it("an idle window admits a full burst at once (no 1.33 s spacing), and the next request waits for the oldest grant to age out", () => {
    const { grants } = run(Array.from({ length: 46 }, () => 1_000_000), 45);
    expect(grants.slice(0, 45).every((t) => t === 1_000_000)).toBe(true);
    expect(grants[45]).toBe(1_000_000 + WINDOW);
  });

  it("never more than LIMIT grants in ANY window of 60 s, for random arrivals (1000 requests, several seeds)", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      let x = seed * 2654435761;
      const rnd = () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296);
      let t = 0;
      const arrivals: number[] = [];
      for (let i = 0; i < 1000; i++) {
        t += rnd() < 0.7 ? rnd() * 50 : rnd() * 4000; // bursts and pauses
        arrivals.push(Math.floor(t));
      }
      const { grants } = run(arrivals, 45);
      expect(grants).toHaveLength(1000);
      expect(maxInAnyWindow(grants)).toBeLessThanOrEqual(45);
    }
  });

  it("MINUTE BOUNDARY: a burst just before and a burst just after the refill cannot exceed the limit in any 60 s window", () => {
    // 45 at t = 0.0 s, 45 more at t = 59.9 s (just before the window refills), 45 more at t = 60.1 s (just after)
    const arrivals = [...Array(45).fill(0), ...Array(45).fill(59_900), ...Array(45).fill(60_100)];
    const { grants } = run(arrivals, 45);
    expect(maxInAnyWindow(grants)).toBeLessThanOrEqual(45);
    // the second burst is held until the first has aged out, the third until the second has
    expect(Math.min(...grants.slice(45, 90))).toBeGreaterThanOrEqual(WINDOW);
    expect(Math.min(...grants.slice(90))).toBeGreaterThanOrEqual(2 * WINDOW);
    // A fixed GCRA with burst 45 and 45 per minute would have admitted 90 inside one minute: show that the old shape really is unsafe
    const gcraBurst45Max = 45 + Math.floor(WINDOW / (WINDOW / 45));
    expect(gcraBurst45Max).toBe(90);
  });

  it("sustained rate equals the limit per window (45 per minute), not less", () => {
    const { grants } = run(Array.from({ length: 450 }, () => 0), 45);
    expect(Math.max(...grants)).toBe(9 * WINDOW); // 450 requests = 10 windows: the last one starts at the 9th boundary
  });

  it("an admission above the caller ceiling is refused and reserves NOTHING", () => {
    const store = new Map<string, { g: number[]; b: number }>();
    for (let i = 0; i < 45; i++) evalWindowReserve(store, KEYS, argv(45), 0);
    const before = JSON.stringify([...store]);
    expect(evalWindowReserve(store, KEYS, argv(45, 0, 0, 25_000), 0)).toBe(-1); // would wait 60 s, ceiling 25 s
    expect(JSON.stringify([...store])).toBe(before);
  });

  it("the project budget binds when it is tighter: the slower of the two decides", () => {
    const store = new Map<string, { g: number[]; b: number }>();
    for (let i = 0; i < 10; i++) expect(evalWindowReserve(store, KEYS, argv(45, 0, 10), 0)).toBe(0);
    expect(evalWindowReserve(store, KEYS, argv(45, 0, 10), 0)).toBe(WINDOW); // user budget has room, project (10) does not
  });

  it("a penalty (a 429 seen elsewhere) blocks every later grant until it ends", () => {
    const store = new Map<string, { g: number[]; b: number }>();
    expect(evalWindowReserve(store, KEYS, argv(45, 5_000), 1_000)).toBe(0);
    expect(evalWindowReserve(store, KEYS, argv(45), 1_000)).toBe(5_000);
    expect(evalWindowReserve(store, KEYS, argv(45), 7_000)).toBe(0);
  });

  it("a gate (quarantine after lost state) keeps every unknown budget closed until it ends", () => {
    const store = new Map<string, { g: number[]; b: number }>();
    expect(evalWindowReserve(store, KEYS, argv(45), 1_000, 76_000)).toBe(75_000);
  });

  it("state is plain JSON (so it can be persisted and restored) and stays bounded", () => {
    const store = new Map<string, { g: number[]; b: number }>();
    for (let i = 0; i < 40; i++) evalWindowReserve(store, KEYS, argv(45), i * 100_000);
    const restored = new Map<string, { g: number[]; b: number }>(JSON.parse(JSON.stringify([...store])));
    expect(evalWindowReserve(restored, KEYS, argv(45), 40 * 100_000)).toBe(0);
    for (const e of store.values()) expect(e.g.length).toBeLessThanOrEqual(46); // old grants are pruned
  });
});

/**
 * LIVE finding (D38, real Google): grants are exactly spaced, but the moment a request is DISPATCHED trails its grant by a variable client-side lag (the first
 * burst left over about 1.4 s while the held second burst woke from precise timers). A window of exactly 60 s then lets up to 20 extra requests fall inside one
 * 60 s span by dispatch time. The default window is therefore longer than the provider's minute, by more than that lag.
 */
describe("D38 Track B: dispatch jitter", () => {
  const dispatchedMax = (windowMs: number) => {
    const store = new Map<string, { g: number[]; b: number }>();
    const grants: { at: number; lag: number }[] = [];
    // burst 1: 45 requests granted within the same instant, but dispatched with a lag that grows over 1.5 s
    for (let i = 0; i < 45; i++) grants.push({ at: 1_000_000 + evalWindowReserve(store, KEYS, [45, windowMs, 0, 0, 0], 1_000_000), lag: i * 33 });
    // burst 2: 45 more arrive just after; each is held until its slot, then dispatched by a timer with no lag
    for (let i = 0; i < 45; i++) grants.push({ at: 1_000_100 + evalWindowReserve(store, KEYS, [45, windowMs, 0, 0, 0], 1_000_100), lag: 0 });
    const d = grants.map((g) => g.at + g.lag).sort((a, b) => a - b);
    let best = 0;
    for (let i = 0, j = 0; i < d.length; i++) {
      while (d[i] - d[j] >= 60_000) j++;
      best = Math.max(best, i - j + 1);
    }
    return best;
  };

  it("with a window of exactly 60 s the dispatch-time count can exceed the limit (the live finding)", () => {
    expect(dispatchedMax(60_000)).toBeGreaterThan(45);
  });

  it("with the DEFAULT window it cannot: no 60 s span holds more than the limit by dispatch time", () => {
    expect(WINDOW_MS).toBeGreaterThanOrEqual(61_500);
    expect(dispatchedMax(WINDOW_MS)).toBeLessThanOrEqual(45);
  });
});
