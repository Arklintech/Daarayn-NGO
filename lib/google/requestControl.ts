/**
 * lib/google/requestControl.ts
 *
 * Request-rate control for every Google Sheets request. Separate read and write budgets, per-minute rates with a small burst, a bounded
 * wait (a caller that would have to wait longer than the maximum gets a structured retryable "busy" error instead of a hung request),
 * and a penalty when Google itself answers 429 so that all callers slow down together.
 *
 * Two backends implement the same reservation (GCRA, one "theoretical arrival time" per budget):
 *  - MemoryLimiterBackend: this process only (used when no shared store is configured; NOT enough when several instances share one
 *    Google service identity, which is the normal situation on a serverless host);
 *  - RedisRestLimiterBackend: ONE atomic counter per budget in a Redis-compatible store reached over its REST API (for example Upstash
 *    Redis, available through the hosting marketplace). The reservation runs as a single Lua script inside Redis, using Redis' own clock, so
 *    concurrent instances cannot oversubscribe the budget and instance clock differences do not matter.
 * Google Sheets is never used to store limiter state.
 *
 * Configuration (names only): GOOGLE_LIMITER_REDIS_REST_URL, GOOGLE_LIMITER_REDIS_REST_TOKEN (both required to enable the shared backend),
 * GOOGLE_LIMITER_KEY_PREFIX (default "daarayn:sheets"), GOOGLE_LIMITER_TIMEOUT_MS (default 1500), GOOGLE_LIMITER_ON_COORDINATOR_FAILURE
 * ("fail_closed" default | "degraded_local"), GOOGLE_LIMITER_DEGRADED_SHARE (default 0.25), plus the rate settings below.
 */
import crypto from "crypto";
import { AsyncLocalStorage } from "async_hooks";
import { recordGoogleBackpressure } from "./usage";

export type RequestKind = "read" | "write";

export interface LimiterConfig {
  /** Requests per minute allowed for each kind (0 or less disables that kind's limit). */
  readsPerMinute: number;
  writesPerMinute: number;
  /** Requests that may go out back-to-back before pacing starts. */
  burst: number;
  /** Longest a caller may be delayed by the limiter before it is told the service is busy. */
  maxWaitMs: number;
  /** Google project-level quota (300 a minute per kind) is shared by EVERY identity of the project; shared backends keep a budget below it too (0 disables). */
  projectReadsPerMinute?: number;
  projectWritesPerMinute?: number;
  /**
   * "gcra" (default): evenly paced slots with a small burst. "window": a sliding window, a full burst of the per-minute limit when the window is empty and never
   * more than that limit in ANY 60 s (so the provider's minute can never be exceeded whatever its alignment). Needs the self-hosted coordinator or the process-local backend.
   */
  algorithm?: "gcra" | "window";
}

export interface LimiterBackend {
  /** Reserves the next slot and returns how long the caller must wait before using it. Must be atomic per budget. */
  reserve(kind: RequestKind, config: LimiterConfig, now: number, maxWaitMs?: number): Promise<number> | number;
  /* A returned -1 means: the wait would exceed maxWaitMs, nothing was reserved. */
  /** Google rejected a request (HTTP 429): push the whole budget back by this long for every caller. */
  penalize(kind: RequestKind, ms: number, now: number): Promise<void> | void;
  /** Human-readable description for diagnostics (never contains a secret). */
  readonly mode?: "process-local" | "shared";
}

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && v !== undefined && v !== "" ? n : d;
};

/** Conservative defaults below Google's documented 60 per minute per user, leaving headroom for other callers. */
export function limiterConfig(env: Record<string, string | undefined> = process.env): LimiterConfig {
  return {
    readsPerMinute: num(env.GOOGLE_SHEETS_READS_PER_MINUTE, 45),
    writesPerMinute: num(env.GOOGLE_SHEETS_WRITES_PER_MINUTE, 45),
    burst: Math.max(1, num(env.GOOGLE_SHEETS_BURST, 5)),
    maxWaitMs: Math.max(0, num(env.GOOGLE_SHEETS_MAX_WAIT_MS, 25_000)),
    projectReadsPerMinute: num(env.GOOGLE_SHEETS_PROJECT_READS_PER_MINUTE, 200),
    projectWritesPerMinute: num(env.GOOGLE_SHEETS_PROJECT_WRITES_PER_MINUTE, 200),
    algorithm: env.GOOGLE_LIMITER_ALGORITHM === "window" ? "window" : "gcra",
  };
}

/**
 * Length of the sliding window. LONGER than the provider's 60 s minute on purpose: grants are exactly spaced, but the moment a request is dispatched trails
 * its grant by a variable client-side lag (measured live: a burst of 45 left over about 1.4 s, and up to 20 requests of a second burst fell inside one 60 s span by
 * dispatch time when the window was exactly 60 s). A margin above that lag keeps the dispatch-time count at or below the limit. Override with
 * GOOGLE_LIMITER_WINDOW_MS (clamped to 60 000 to 120 000); the cost is a sustained rate of 45 per 62 s instead of 45 per 60 s.
 */
export const WINDOW_MS = Math.min(120_000, Math.max(60_000, Number(process.env.GOOGLE_LIMITER_WINDOW_MS) || 62_000));
export interface WindowState {
  g: number[];
  b: number;
}
/**
 * Sliding-window admission for ONE budget: at most `limit` grants in any window of WINDOW_MS. Returns the wait in ms, or -1 (nothing reserved) when it would exceed
 * `maxWaitMs`. The same arithmetic as evalWindowReserve in tools/limiter-server/gcra.cjs (a test keeps the two identical).
 */
export function windowReserve(e: WindowState, limit: number, now: number, maxWaitMs = 0): number {
  let n = 0;
  while (n < e.g.length && e.g[n] + WINDOW_MS <= now) n++;
  if (n) e.g.splice(0, n);
  let t = Math.max(now, e.b, e.g.length ? e.g[e.g.length - 1] : 0);
  if (e.g.length >= limit) t = Math.max(t, e.g[e.g.length - limit] + WINDOW_MS);
  const wait = t - now;
  if (maxWaitMs > 0 && wait > maxWaitMs) return -1;
  e.g.push(t);
  return Math.ceil(wait);
}

const perMinuteOf = (kind: RequestKind, c: LimiterConfig) => (kind === "read" ? c.readsPerMinute : c.writesPerMinute);

/** In-process backend using the Generic Cell Rate Algorithm (one theoretical arrival time per kind). */
export class MemoryLimiterBackend implements LimiterBackend {
  readonly mode = "process-local" as const;
  private tat: Record<RequestKind, number> = { read: 0, write: 0 };
  private win: Record<RequestKind, WindowState> = { read: { g: [], b: 0 }, write: { g: [], b: 0 } };
  reserve(kind: RequestKind, config: LimiterConfig, now: number, maxWaitMs = 0): number {
    const perMinute = perMinuteOf(kind, config);
    if (!(perMinute > 0)) return 0;
    if (config.algorithm === "window") return windowReserve(this.win[kind], perMinute, now, maxWaitMs);
    const interval = 60_000 / perMinute;
    const tat = Math.max(this.tat[kind], now);
    const wait = Math.max(0, tat - now - (config.burst - 1) * interval);
    if (maxWaitMs > 0 && wait > maxWaitMs) return -1; // refuse without reserving
    this.tat[kind] = tat + interval;
    return wait;
  }
  penalize(kind: RequestKind, ms: number, now: number): void {
    this.tat[kind] = Math.max(this.tat[kind], now) + ms;
    this.win[kind].b = Math.max(this.win[kind].b, now + ms);
  }
  /** Test helper. */
  reset() {
    this.tat = { read: 0, write: 0 };
    this.win = { read: { g: [], b: 0 }, write: { g: [], b: 0 } };
  }
}

/**
 * The reservation as one atomic Redis script ("GCRA-reserve-v3"). KEYS[1] = the user (service identity) budget, KEYS[2] = the project budget shared
 * by every identity. ARGV = interval ms, burst, penalty ms (0 for a normal reservation), project interval ms (0 = no project budget), project burst, maximum acceptable wait ms (0 = none).
 * Returns -1 and reserves NOTHING when the wait would exceed that maximum (atomic admit-or-refuse). Time comes from Redis (TIME), not from the instance. Returns the wait in ms. Keys expire one minute after their slot has passed.
 * The same arithmetic exists in tools/limiter-server/gcra.cjs (self-hosted coordinator and test emulators); tests compare the two.
 */
export const RESERVE_LUA = `
-- GCRA-reserve-v3
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local interval = tonumber(ARGV[1])
local burst = tonumber(ARGV[2])
local penalty = tonumber(ARGV[3])
local pint = tonumber(ARGV[4])
local pburst = tonumber(ARGV[5])
local maxw = tonumber(ARGV[6])
local tat = tonumber(redis.call('GET', KEYS[1]) or '0')
if tat < now then tat = now end
local ptat = 0
if pint > 0 then
  ptat = tonumber(redis.call('GET', KEYS[2]) or '0')
  if ptat < now then ptat = now end
end
if penalty > 0 then
  tat = tat + penalty
  redis.call('SET', KEYS[1], string.format('%.0f', tat), 'PX', math.ceil(tat - now) + 60000)
  if pint > 0 then
    ptat = ptat + penalty
    redis.call('SET', KEYS[2], string.format('%.0f', ptat), 'PX', math.ceil(ptat - now) + 60000)
  end
  return 0
end
local wait = tat - now - (burst - 1) * interval
if wait < 0 then wait = 0 end
local pwait = 0
if pint > 0 then
  pwait = ptat - now - (pburst - 1) * pint
  if pwait < 0 then pwait = 0 end
end
if pwait > wait then wait = pwait end
if maxw > 0 and wait > maxw then return -1 end
tat = tat + interval
redis.call('SET', KEYS[1], string.format('%.0f', tat), 'PX', math.ceil(tat - now) + 60000)
if pint > 0 then
  ptat = ptat + pint
  redis.call('SET', KEYS[2], string.format('%.0f', ptat), 'PX', math.ceil(ptat - now) + 60000)
end
return math.ceil(wait)
`.trim();

export type FailurePolicy = "fail_closed" | "degraded_local";

export class LimiterUnavailableError extends Error {
  readonly retryable = true;
  readonly retriesExhausted = true;
  readonly code = "GOOGLE_LIMITER_UNAVAILABLE";
  constructor() {
    super("The shared request coordinator is unavailable, so the request was not sent. Please retry shortly.");
    this.name = "LimiterUnavailableError";
  }
}

export type Transport = (args: (string | number)[]) => Promise<unknown>;

export interface RedisRestOptions {
  /** REST front end (POST a JSON command array, Bearer token). Ignored when `transport` is given. */
  url?: string;
  token?: string;
  /** Any other way of sending one command to the coordinator (for example the TCP client for a redis:// URL). */
  transport?: Transport;
  keyPrefix: string;
  /** Prefix of the project-level budget keys (shared by all identities); defaults to keyPrefix without its last segment (the identity). */
  projectKeyPrefix?: string;
  timeoutMs: number;
  policy: FailurePolicy;
  degradedShare: number;
  fetchImpl?: typeof fetch;
}

/**
 * Shared backend over ANY Redis-compatible coordinator (REST API or redis:// TCP): one atomic script reserves the user-level and the
 * project-level slot together. Failure policy when the coordinator cannot be reached within the timeout:
 *  - fail_closed (default): the request is refused (retryable 503); no instance can bypass the global limit;
 *  - degraded_local: this instance paces itself with a SMALL fraction of the budget until the coordinator answers again (explicit opt-in;
 *    with more instances than 1/share the global limit can then be exceeded, which is why it is not the default).
 * After a failure the coordinator is not called again for a short cool-down so a dead store cannot slow every request.
 */
/** Marker of the sliding-window command. Only the self-hosted Daarayn coordinator (tools/limiter-server) evaluates it; a Redis server refuses it and the limiter then fails closed. */
export const WINDOW_SCRIPT = "-- WINDOW-reserve-v1: sliding-window admission (evaluated by the self-hosted coordinator)";

export class RedisRestLimiterBackend implements LimiterBackend {
  readonly mode = "shared" as const;
  private downUntil = 0;
  private local = new MemoryLimiterBackend();
  constructor(private o: RedisRestOptions) {}

  private async command(args: (string | number)[]): Promise<any> {
    if (this.o.transport) return this.o.transport(args);
    const f = this.o.fetchImpl ?? fetch;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.o.timeoutMs);
    try {
      const res = await f(this.o.url!, { method: "POST", headers: { Authorization: `Bearer ${this.o.token}`, "Content-Type": "application/json" }, body: JSON.stringify(args), signal: ctl.signal });
      if (!res.ok) throw new Error(`coordinator HTTP ${res.status}`);
      const body: any = await res.json();
      if (body && body.error) throw new Error("coordinator error");
      return body?.result;
    } finally {
      clearTimeout(timer);
    }
  }

  private key(kind: RequestKind) {
    return `${this.o.keyPrefix}:${kind}`;
  }
  private projectKey(kind: RequestKind) {
    return `${this.o.projectKeyPrefix ?? this.o.keyPrefix.split(":").slice(0, -1).join(":")}:project:${kind}`;
  }

  private async run(kind: RequestKind, config: LimiterConfig, penaltyMs: number, maxWaitMs = 0): Promise<number> {
    const perMinute = Math.max(1, perMinuteOf(kind, config));
    const projectPerMinute = (kind === "read" ? config.projectReadsPerMinute : config.projectWritesPerMinute) ?? 0;
    const pint = projectPerMinute > 0 ? 60_000 / projectPerMinute : 0;
    if (config.algorithm === "window") {
      const w = await this.command(["EVAL", WINDOW_SCRIPT, 2, this.key(kind), this.projectKey(kind), perMinute, WINDOW_MS, Math.round(penaltyMs), projectPerMinute > 0 ? projectPerMinute : 0, Math.round(maxWaitMs)]);
      const wn = Number(w);
      if (!Number.isFinite(wn)) throw new Error("coordinator returned an unusable value");
      return wn;
    }
    const result = await this.command(["EVAL", RESERVE_LUA, 2, this.key(kind), this.projectKey(kind), 60_000 / perMinute, config.burst, Math.round(penaltyMs), pint, config.burst, Math.round(maxWaitMs)]);
    const n = Number(result);
    if (!Number.isFinite(n)) throw new Error("coordinator returned an unusable value");
    return n;
  }

  async reserve(kind: RequestKind, config: LimiterConfig, now: number, maxWaitMs = 0): Promise<number> {
    if (!(perMinuteOf(kind, config) > 0)) return 0;
    if (Date.now() >= this.downUntil) {
      try {
        return await this.run(kind, config, 0, maxWaitMs);
      } catch {
        this.downUntil = Date.now() + 5_000; // cool-down
      }
    }
    // Coordinator unavailable: explicit policy.
    if (this.o.policy === "degraded_local") {
      const share = Math.min(1, Math.max(0.01, this.o.degradedShare));
      return this.local.reserve(kind, { ...config, readsPerMinute: config.readsPerMinute * share, writesPerMinute: config.writesPerMinute * share }, now, maxWaitMs);
    }
    throw new LimiterUnavailableError();
  }

  async penalize(kind: RequestKind, ms: number, now: number): Promise<void> {
    if (Date.now() >= this.downUntil) {
      try {
        await this.run(kind, limiterConfig(), ms);
        return;
      } catch {
        this.downUntil = Date.now() + 5_000;
      }
    }
    this.local.penalize(kind, ms, now); // best effort; the shared budget is protected again as soon as the coordinator answers
  }
}

/**
 * The HTTP coordinator endpoint, from GOOGLE_LIMITER_URL and GOOGLE_LIMITER_TOKEN (preferred names). The older names
 * GOOGLE_LIMITER_REDIS_REST_URL / GOOGLE_LIMITER_REDIS_REST_TOKEN are still accepted as aliases: they were misleading, because the Daarayn coordinator is NOT Redis,
 * it only speaks the same REST command protocol. Vercel talks to this endpoint; the coordinator keeps its own state on its own disk.
 */
export function coordinatorEndpoint(env: Record<string, string | undefined> = process.env): { url: string; token: string } {
  return {
    url: (env.GOOGLE_LIMITER_URL || env.GOOGLE_LIMITER_REDIS_REST_URL || "").trim(),
    token: (env.GOOGLE_LIMITER_TOKEN || env.GOOGLE_LIMITER_REDIS_REST_TOKEN || "").trim(),
  };
}

/**
 * The shared backend when a coordinator is configured, otherwise the process-local one. Either:
 *  - GOOGLE_LIMITER_REDIS_URL (redis:// or rediss://, any Redis-compatible server), or
 *  - GOOGLE_LIMITER_URL + GOOGLE_LIMITER_TOKEN (the Daarayn coordinator, tools/limiter-server; the older REDIS_REST names are aliases).
 * The key identifies the Google service identity.
 */
export function createBackendFromEnv(env: Record<string, string | undefined> = process.env): LimiterBackend {
  const tcp = (env.GOOGLE_LIMITER_REDIS_URL || "").trim();
  const { url, token } = coordinatorEndpoint(env);
  if (!tcp && !(url && token)) return new MemoryLimiterBackend();
  const identity = (env.GOOGLE_SERVICE_ACCOUNT_EMAIL || env.GOOGLE_CLIENT_EMAIL || env.GOOGLE_APPLICATION_CREDENTIALS || "default").trim().toLowerCase();
  const id = crypto.createHash("sha256").update(identity).digest("hex").slice(0, 12); // not secret; groups every instance of one identity
  const base = (env.GOOGLE_LIMITER_KEY_PREFIX || "daarayn:sheets").trim();
  const timeoutMs = Math.max(100, num(env.GOOGLE_LIMITER_TIMEOUT_MS, 1500));
  return new RedisRestLimiterBackend({
    ...(tcp ? { transport: (args: (string | number)[]) => import("./respTransport").then((m) => m.respCommand(tcp, args, timeoutMs)) } : { url, token }),
    keyPrefix: `${base}:${id}`,
    projectKeyPrefix: base,
    timeoutMs,
    policy: (env.GOOGLE_LIMITER_ON_COORDINATOR_FAILURE || "").trim() === "degraded_local" ? "degraded_local" : "fail_closed",
    degradedShare: num(env.GOOGLE_LIMITER_DEGRADED_SHARE, 0.25),
  });
}

const g = globalThis as any;
const holder = (): { backend: LimiterBackend } => (g.__daaraynLimiter ??= { backend: createBackendFromEnv() });

/** Replaces the backend (tests, or an explicitly chosen shared one). */
export function setLimiterBackend(backend: LimiterBackend) {
  holder().backend = backend;
}
export function getLimiterBackend(): LimiterBackend {
  return holder().backend;
}

/** Production means the deployment is labelled production (never inferred from a hostname). */
const isProduction = (env: Record<string, string | undefined>) => (env.GOOGLE_TARGET_ENV || "").trim() === "production" || (env.VERCEL_ENV || "").trim() === "production";

/**
 * Diagnostics: is the limit shared across instances, and is the configuration acceptable for this environment? In production a
 * process-local limiter is NOT acceptable unless the owner explicitly decided on a single instance (GOOGLE_LIMITER_ALLOW_PROCESS_LOCAL=true).
 * Never includes the URL or token.
 */
export function limiterStatus(env: Record<string, string | undefined> = process.env): { mode: "process-local" | "shared"; crossInstance: boolean; policy?: FailurePolicy; production: boolean; ready: boolean; reason?: string; conflict?: true } {
  const b = getLimiterBackend() as any;
  const mode = b.mode === "shared" ? "shared" : "process-local";
  const production = isProduction(env);
  const allowLocal = (env.GOOGLE_LIMITER_ALLOW_PROCESS_LOCAL || "").trim() === "true";
  // Two coordination backends configured at once (the raw Redis URL takes precedence in createBackendFromEnv): ambiguous, so NOT ready and requests are refused.
  const { url: httpUrl, token: httpToken } = coordinatorEndpoint(env);
  const conflict = Boolean((env.GOOGLE_LIMITER_REDIS_URL || "").trim()) && Boolean(httpUrl && httpToken);
  const ready = !conflict && (mode === "shared" || !production || allowLocal);
  return {
    mode,
    crossInstance: mode === "shared",
    ...(mode === "shared" ? { policy: b.o?.policy as FailurePolicy } : {}),
    production,
    ready,
    ...(conflict ? { conflict: true as const, reason: "conflicting coordinator configuration: GOOGLE_LIMITER_REDIS_URL and GOOGLE_LIMITER_URL/GOOGLE_LIMITER_TOKEN are both set; unset GOOGLE_LIMITER_REDIS_URL so the Daarayn HTTPS coordinator is the only backend" } : {}),
    ...(ready || conflict ? {} : { reason: "production requires a shared limiter (GOOGLE_LIMITER_URL and GOOGLE_LIMITER_TOKEN for the Daarayn coordinator, or GOOGLE_LIMITER_REDIS_URL for a Redis server) or an explicit owner decision GOOGLE_LIMITER_ALLOW_PROCESS_LOCAL=true for a single instance" }),
  };
}

/** Thrown in production when no shared limiter is configured and process-local limiting was not explicitly accepted. */
export class LimiterNotConfiguredError extends Error {
  readonly retryable = true;
  readonly retriesExhausted = true;
  readonly code = "GOOGLE_LIMITER_NOT_CONFIGURED";
  constructor() {
    super("The request coordinator is not configured for this environment, so the request was not sent.");
    this.name = "LimiterNotConfiguredError";
  }
}

/** Thrown when the limiter would have to hold a request longer than `maxWaitMs`. Retryable by the caller; nothing was sent to Google. */
export class GoogleBackpressureError extends Error {
  readonly retryable = true;
  readonly retriesExhausted = true; // existing handlers map this to HTTP 503
  readonly code = "GOOGLE_BACKPRESSURE";
  constructor(readonly kind: RequestKind, readonly waitMs: number) {
    super(`The records service is busy (${kind} budget); the request was not sent. Please retry shortly.`);
    this.name = "GoogleBackpressureError";
  }
}

/* ---------- request priority ---------- */
export type Priority = "P0" | "P1" | "P2" | "P3";
/**
 * P0 donation validation and critical financial checks, P1 donation persistence, audit and recovery, P2 admin and CRM operations, P3 public
 * catalogue refresh, statistics and other non-critical reads. The shared budget is allocated in arrival order, but each priority may only
 * be QUEUED up to a share of the maximum wait: when the queue builds, P3 is refused first (at 20% of the wait limit), then P2 (50%); P0 and P1 can
 * still be admitted up to the full limit. A refused request reserves nothing (atomic admit-or-refuse), so shedding never wastes budget.
 */
export const PRIORITY_WAIT_SHARE: Record<Priority, number> = { P0: 1, P1: 1, P2: 0.5, P3: 0.2 };
const priorityStore = new AsyncLocalStorage<Priority>();
export const currentPriority = (): Priority => priorityStore.getStore() ?? "P2";
/** Runs `fn` (and everything it awaits) with the given request priority. */
export const runWithPriority = <T>(priority: Priority, fn: () => T): T => priorityStore.run(priority, fn);

const sleepFn = (ms: number): Promise<void> => ((globalThis as any).__daaraynRetrySleep ?? ((m: number) => new Promise<void>((r) => setTimeout(r, m))))(ms);

/** Waits for this request's slot. Returns the milliseconds waited (for metrics). */
export async function acquireSlot(kind: RequestKind, env: Record<string, string | undefined> = process.env, priority: Priority = currentPriority()): Promise<number> {
  const config = limiterConfig(env);
  if ((kind === "read" ? config.readsPerMinute : config.writesPerMinute) > 0 && !limiterStatus(env).ready) {
    if (!(globalThis as any).__daaraynLimiterWarned) {
      (globalThis as any).__daaraynLimiterWarned = true;
      console.error("[Limiter] production without a shared request limiter: Google requests are refused until it is configured (see docs/ops/SHARED_LIMITER.md).");
    }
    recordGoogleBackpressure(priority);
    throw new LimiterNotConfiguredError();
  }
  const ceiling = Math.max(1, Math.round(config.maxWaitMs * PRIORITY_WAIT_SHARE[priority]));
  let wait: number;
  try {
    wait = await getLimiterBackend().reserve(kind, config, Date.now(), config.maxWaitMs > 0 ? ceiling : 0);
  } catch (e) {
    recordGoogleBackpressure(priority); // coordinator unavailable: refused unsent
    throw e;
  }
  if (wait < 0 || (config.maxWaitMs > 0 && wait > ceiling)) {
    recordGoogleBackpressure(priority);
    throw new GoogleBackpressureError(kind, wait < 0 ? ceiling : wait);
  }
  if (wait <= 0) return 0;
  await sleepFn(wait);
  return wait;
}

export async function penalizeKind(kind: RequestKind, ms: number): Promise<void> {
  await getLimiterBackend().penalize(kind, ms, Date.now());
}

/** Global consumption as the coordinator sees it (REST mode only). null when unreachable or not a REST coordinator. Never exposes the address or token. */
export async function fetchCoordinatorMetrics(env: Record<string, string | undefined> = process.env): Promise<import("./quotaAlerts").CoordinatorMetrics | null> {
  const { url, token } = coordinatorEndpoint(env);
  if (!url || !token) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), Math.max(100, num(env.GOOGLE_LIMITER_TIMEOUT_MS, 1500)));
  try {
    const res = await fetch(new URL("/metrics", url).toString(), { headers: { Authorization: `Bearer ${token}` }, signal: ctl.signal, cache: "no-store" });
    return res.ok ? ((await res.json()) as import("./quotaAlerts").CoordinatorMetrics) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
