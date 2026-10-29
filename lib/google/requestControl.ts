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
}

export interface LimiterBackend {
  /** Reserves the next slot and returns how long the caller must wait before using it. Must be atomic per budget. */
  reserve(kind: RequestKind, config: LimiterConfig, now: number): Promise<number> | number;
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
  };
}

const perMinuteOf = (kind: RequestKind, c: LimiterConfig) => (kind === "read" ? c.readsPerMinute : c.writesPerMinute);

/** In-process backend using the Generic Cell Rate Algorithm (one theoretical arrival time per kind). */
export class MemoryLimiterBackend implements LimiterBackend {
  readonly mode = "process-local" as const;
  private tat: Record<RequestKind, number> = { read: 0, write: 0 };
  reserve(kind: RequestKind, config: LimiterConfig, now: number): number {
    const perMinute = perMinuteOf(kind, config);
    if (!(perMinute > 0)) return 0;
    const interval = 60_000 / perMinute;
    const tat = Math.max(this.tat[kind], now);
    const wait = Math.max(0, tat - now - (config.burst - 1) * interval);
    this.tat[kind] = tat + interval;
    return wait;
  }
  penalize(kind: RequestKind, ms: number, now: number): void {
    this.tat[kind] = Math.max(this.tat[kind], now) + ms;
  }
  /** Test helper. */
  reset() {
    this.tat = { read: 0, write: 0 };
  }
}

/**
 * The reservation as one atomic Redis script ("GCRA-reserve-v2"). KEYS[1] = the user (service identity) budget, KEYS[2] = the project budget shared
 * by every identity. ARGV = interval ms, burst, penalty ms (0 for a normal reservation), project interval ms (0 = no project budget), project burst.
 * Time comes from Redis (TIME), not from the instance. Returns the wait in ms. Keys expire one minute after their slot has passed.
 * The same arithmetic exists in tools/limiter-server/gcra.cjs (self-hosted coordinator and test emulators); tests compare the two.
 */
export const RESERVE_LUA = `
-- GCRA-reserve-v2
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local interval = tonumber(ARGV[1])
local burst = tonumber(ARGV[2])
local penalty = tonumber(ARGV[3])
local pint = tonumber(ARGV[4])
local pburst = tonumber(ARGV[5])
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
tat = tat + interval
redis.call('SET', KEYS[1], string.format('%.0f', tat), 'PX', math.ceil(tat - now) + 60000)
if pint > 0 then
  ptat = ptat + pint
  redis.call('SET', KEYS[2], string.format('%.0f', ptat), 'PX', math.ceil(ptat - now) + 60000)
end
if pwait > wait then wait = pwait end
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

  private async run(kind: RequestKind, config: LimiterConfig, penaltyMs: number): Promise<number> {
    const perMinute = Math.max(1, perMinuteOf(kind, config));
    const projectPerMinute = (kind === "read" ? config.projectReadsPerMinute : config.projectWritesPerMinute) ?? 0;
    const pint = projectPerMinute > 0 ? 60_000 / projectPerMinute : 0;
    const result = await this.command(["EVAL", RESERVE_LUA, 2, this.key(kind), this.projectKey(kind), 60_000 / perMinute, config.burst, Math.round(penaltyMs), pint, config.burst]);
    const n = Number(result);
    if (!Number.isFinite(n)) throw new Error("coordinator returned an unusable value");
    return n;
  }

  async reserve(kind: RequestKind, config: LimiterConfig, now: number): Promise<number> {
    if (!(perMinuteOf(kind, config) > 0)) return 0;
    if (Date.now() >= this.downUntil) {
      try {
        return await this.run(kind, config, 0);
      } catch {
        this.downUntil = Date.now() + 5_000; // cool-down
      }
    }
    // Coordinator unavailable: explicit policy.
    if (this.o.policy === "degraded_local") {
      const share = Math.min(1, Math.max(0.01, this.o.degradedShare));
      return this.local.reserve(kind, { ...config, readsPerMinute: config.readsPerMinute * share, writesPerMinute: config.writesPerMinute * share }, now);
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
 * The shared backend when a coordinator is configured, otherwise the process-local one. Either:
 *  - GOOGLE_LIMITER_REDIS_URL (redis:// or rediss://, any Redis-compatible server), or
 *  - GOOGLE_LIMITER_REDIS_REST_URL + GOOGLE_LIMITER_REDIS_REST_TOKEN (a REST front end, or the self-hosted tools/limiter-server).
 * The key identifies the Google service identity.
 */
export function createBackendFromEnv(env: Record<string, string | undefined> = process.env): LimiterBackend {
  const tcp = (env.GOOGLE_LIMITER_REDIS_URL || "").trim();
  const url = (env.GOOGLE_LIMITER_REDIS_REST_URL || "").trim();
  const token = (env.GOOGLE_LIMITER_REDIS_REST_TOKEN || "").trim();
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
export function limiterStatus(env: Record<string, string | undefined> = process.env): { mode: "process-local" | "shared"; crossInstance: boolean; policy?: FailurePolicy; production: boolean; ready: boolean; reason?: string } {
  const b = getLimiterBackend() as any;
  const mode = b.mode === "shared" ? "shared" : "process-local";
  const production = isProduction(env);
  const allowLocal = (env.GOOGLE_LIMITER_ALLOW_PROCESS_LOCAL || "").trim() === "true";
  const ready = mode === "shared" || !production || allowLocal;
  return {
    mode,
    crossInstance: mode === "shared",
    ...(mode === "shared" ? { policy: b.o?.policy as FailurePolicy } : {}),
    production,
    ready,
    ...(ready ? {} : { reason: "production requires a shared limiter (GOOGLE_LIMITER_REDIS_URL, or GOOGLE_LIMITER_REDIS_REST_URL and GOOGLE_LIMITER_REDIS_REST_TOKEN) or an explicit owner decision GOOGLE_LIMITER_ALLOW_PROCESS_LOCAL=true for a single instance" }),
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

const sleepFn = (ms: number): Promise<void> => ((globalThis as any).__daaraynRetrySleep ?? ((m: number) => new Promise<void>((r) => setTimeout(r, m))))(ms);

/** Waits for this request's slot. Returns the milliseconds waited (for metrics). */
export async function acquireSlot(kind: RequestKind, env: Record<string, string | undefined> = process.env): Promise<number> {
  const config = limiterConfig(env);
  if ((kind === "read" ? config.readsPerMinute : config.writesPerMinute) > 0 && !limiterStatus(env).ready) {
    if (!(globalThis as any).__daaraynLimiterWarned) {
      (globalThis as any).__daaraynLimiterWarned = true;
      console.error("[Limiter] production without a shared request limiter: Google requests are refused until it is configured (see docs/ops/SHARED_LIMITER.md).");
    }
    recordGoogleBackpressure();
    throw new LimiterNotConfiguredError();
  }
  let wait: number;
  try {
    wait = await getLimiterBackend().reserve(kind, config, Date.now());
  } catch (e) {
    recordGoogleBackpressure(); // coordinator unavailable: refused unsent
    throw e;
  }
  if (wait <= 0) return 0;
  if (wait > config.maxWaitMs) {
    // The reservation simply lapses unused (a small, safe loss of budget).
    recordGoogleBackpressure();
    throw new GoogleBackpressureError(kind, wait);
  }
  await sleepFn(wait);
  return wait;
}

export async function penalizeKind(kind: RequestKind, ms: number): Promise<void> {
  await getLimiterBackend().penalize(kind, ms, Date.now());
}
