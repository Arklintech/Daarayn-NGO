/**
 * Serialisation of allocation commands that touch the same constrained balance.
 *
 * WHAT THIS IS: a lease with a strictly increasing fencing token, granted by the shared coordinator (or, outside production and without a
 * coordinator, by an in-process table that only protects ONE process). A worker must hold the lease for the donation it is allocating
 * against, and must re-check immediately before it writes that the lease is still the current one with enough time left.
 *
 * WHAT THIS IS NOT: Google Sheets cannot reject a write that carries an old token, so a stale worker is NOT rejected by the storage. Stale writes are
 * prevented by (1) a lease that outlives the platform's function limit (the worker is killed before the lease can expire),
 * (2) the worker refusing to write when less than `minRemainingMs` of the lease is left (self-fencing by deadline), and
 * (3) the allocation service's own post-write verification, which stays as the backstop. This is mutual exclusion under bounded-delay assumptions,
 * not a database transaction, and it is described that way everywhere.
 *
 * The coordinator holds only technical lease records (resource id, owner id, token, expiry). It is never a financial ledger.
 */
import crypto from "crypto";
import { coordinatorEndpoint, limiterStatus, LimiterNotConfiguredError, LimiterUnavailableError } from "./requestControl";

export interface Lease {
  resource: string;
  token: number;
  expiresAt: number;
  /** True only while this is still the CURRENT lease and at least `minRemainingMs` is left. Never throws: an unreachable coordinator answers false. */
  stillValid(minRemainingMs: number): Promise<boolean>;
}

export class LeaseBusyError extends Error {
  readonly retryable = true;
  readonly code = "ALLOCATION_BUSY";
  constructor(readonly resource: string) {
    super("Another allocation for this donation is being processed. Please retry in a moment.");
    this.name = "LeaseBusyError";
  }
}

export interface LeaseBackend {
  acquire(resource: string, owner: string, ttlMs: number): Promise<{ ok: true; token: number; expiresAt: number } | { ok: false; retryAfterMs: number }>;
  check(resource: string, token: number): Promise<{ valid: boolean; remainingMs: number }>;
  release(resource: string, token: number): Promise<void>;
}

/** In-process table: correct for one process only. Used in tests and in non-production environments without a coordinator. */
export class MemoryLeaseBackend implements LeaseBackend {
  private leases = new Map<string, { token: number; owner: string; expiresAt: number }>();
  private last = new Map<string, number>();
  async acquire(resource: string, owner: string, ttlMs: number) {
    const now = Date.now();
    const cur = this.leases.get(resource);
    if (cur && cur.expiresAt > now) return { ok: false as const, retryAfterMs: Math.min(250, Math.max(10, cur.expiresAt - now)) };
    const token = Math.max((this.last.get(resource) || 0) + 1, now);
    this.last.set(resource, token);
    this.leases.set(resource, { token, owner, expiresAt: now + ttlMs });
    return { ok: true as const, token, expiresAt: now + ttlMs };
  }
  async check(resource: string, token: number) {
    const cur = this.leases.get(resource);
    const now = Date.now();
    const valid = Boolean(cur && cur.expiresAt > now && cur.token === token);
    return { valid, remainingMs: valid ? cur!.expiresAt - now : 0 };
  }
  async release(resource: string, token: number) {
    const cur = this.leases.get(resource);
    if (cur && cur.token === token) this.leases.delete(resource);
  }
}

/** Leases held by the shared coordinator (the same endpoint, token and timeout as the request limiter). */
export class CoordinatorLeaseBackend implements LeaseBackend {
  constructor(private url: string, private token: string, private timeoutMs: number) {}
  private async command(args: (string | number)[]): Promise<any> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.timeoutMs);
    try {
      const res = await fetch(this.url, { method: "POST", headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" }, body: JSON.stringify(args), signal: ctl.signal });
      if (!res.ok) throw new Error(`coordinator HTTP ${res.status}`);
      return (await res.json())?.result;
    } finally {
      clearTimeout(timer);
    }
  }
  async acquire(resource: string, owner: string, ttlMs: number) {
    let r: any;
    try {
      r = await this.command(["LEASE", "acquire", resource, owner, ttlMs]);
    } catch {
      throw new LimiterUnavailableError(); // nothing was written: fail closed
    }
    if (r?.ok) return { ok: true as const, token: Number(r.token), expiresAt: Number(r.expiresAt) };
    return { ok: false as const, retryAfterMs: Number(r?.retryAfterMs) || 500 };
  }
  async check(resource: string, token: number) {
    try {
      const r = await this.command(["LEASE", "check", resource, token]);
      return { valid: Boolean(r?.valid), remainingMs: Number(r?.remainingMs) || 0 };
    } catch {
      return { valid: false, remainingMs: 0 }; // cannot confirm: treat as not valid, the worker will not write
    }
  }
  async release(resource: string, token: number) {
    try {
      await this.command(["LEASE", "release", resource, token]);
    } catch {
      /* the lease simply expires */
    }
  }
}

const g = globalThis as any;
export function setLeaseBackend(b: LeaseBackend | null) {
  g.__daaraynLeaseBackend = b;
}
export function getLeaseBackend(env: Record<string, string | undefined> = process.env): LeaseBackend {
  if (g.__daaraynLeaseBackend) return g.__daaraynLeaseBackend;
  const { url, token } = coordinatorEndpoint(env);
  const status = limiterStatus(env);
  if (status.conflict) throw new LimiterNotConfiguredError(); // ambiguous backends: no lease is granted
  if (url && token) g.__daaraynLeaseBackend = new CoordinatorLeaseBackend(url, token, Math.max(100, Number(env.GOOGLE_LIMITER_TIMEOUT_MS) || 1500));
  else if (status.production && !status.ready) throw new LimiterNotConfiguredError(); // production without a coordinator never falls back to a per-process table
  else g.__daaraynLeaseBackend = new MemoryLeaseBackend();
  return g.__daaraynLeaseBackend;
}

export interface LeaseOptions {
  /** how long the lease lasts; must exceed the longest the guarded work can run (the platform kills a function at its maximum duration) */
  ttlMs?: number;
  /** how long to wait for another holder before answering "busy" */
  acquireTimeoutMs?: number;
  backend?: LeaseBackend;
}

/** Runs `fn` while holding the lease for `resource`; always releases it. */
export async function withLease<T>(resource: string, fn: (lease: Lease) => Promise<T>, options: LeaseOptions = {}): Promise<T> {
  const backend = options.backend ?? getLeaseBackend();
  const ttlMs = options.ttlMs ?? Number(process.env.ALLOCATION_LEASE_TTL_MS || 75_000);
  const acquireTimeoutMs = options.acquireTimeoutMs ?? Number(process.env.ALLOCATION_LEASE_WAIT_MS || 25_000);
  const owner = `w-${crypto.randomBytes(8).toString("hex")}`;
  const deadline = Date.now() + acquireTimeoutMs;
  let got: { token: number; expiresAt: number } | null = null;
  for (;;) {
    const r = await backend.acquire(resource, owner, ttlMs);
    if (r.ok) {
      got = r;
      break;
    }
    if (Date.now() + r.retryAfterMs > deadline) throw new LeaseBusyError(resource);
    await new Promise((res) => setTimeout(res, r.retryAfterMs + Math.random() * 100)); // jittered
  }
  const lease: Lease = { resource, token: got.token, expiresAt: got.expiresAt, stillValid: async (min) => {
      const c = await backend.check(resource, got!.token);
      return c.valid && c.remainingMs >= min;
    },
  };
  try {
    return await fn(lease);
  } finally {
    await backend.release(resource, got.token);
  }
}
