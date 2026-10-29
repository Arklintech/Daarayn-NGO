/**
 * lib/google/retry.ts
 *
 * Bounded retry with exponential backoff and full jitter for Google API calls.
 *
 * Retried (transient): HTTP 429, 500, 502, 503, 504, 403 whose reason is a rate/quota limit, and network-level
 * errors (reset, timeout, temporary DNS). When the server sends Retry-After it is honoured (capped).
 * Never retried: 400 (malformed), 401, 403 permission, 404 (wrong id), and anything unrecognised — retrying
 * those only hides the real problem. After the attempts are used up the ORIGINAL error is thrown (annotated),
 * so callers still report an accurate failure and never a false success.
 */

import { recordGoogleAttempt } from "./usage";
import { acquireSlot, penalizeKind, type RequestKind } from "./requestControl";

export interface RetryOptions {
  /** Total tries including the first (default 5). */
  maxAttempts?: number;
  /** First backoff ceiling in ms; doubles each retry (default 1000). */
  baseDelayMs?: number;
  /** Upper bound for any single wait, including Retry-After (default 30000). */
  maxDelayMs?: number;
  label?: string;
  /** Retry only quota errors (429 / rate-limit 403). Use for non-idempotent calls such as append. */
  quotaOnly?: boolean;
  /** Read or write budget this request is charged to; when set, every attempt (first and retries) waits for a slot from the shared limiter. */
  kind?: RequestKind;
  /** Total time the retries may take (default GOOGLE_RETRY_MAX_ELAPSED_MS or 40000 ms). A retry that would exceed it is not started. */
  maxElapsedMs?: number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** Test hook: replace real waiting. Stored process-wide so every loaded copy of this module honours it. */
export function setRetrySleep(fn: (ms: number) => Promise<void>) {
  (globalThis as any).__daaraynRetrySleep = fn;
}
const sleep = (ms: number): Promise<void> => ((globalThis as any).__daaraynRetrySleep ?? defaultSleep)(ms);

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const RETRYABLE_REASONS = new Set(["rateLimitExceeded", "userRateLimitExceeded", "quotaExceeded"]);
const RETRYABLE_NET = new Set(["ECONNRESET", "ETIMEDOUT", "ESOCKETTIMEDOUT", "EAI_AGAIN", "ECONNREFUSED", "EPIPE", "ECONNABORTED"]);

export function classifyGoogleError(err: any): { retryable: boolean; quota: boolean; retryAfterMs?: number } {
  const status = Number(err?.code && typeof err.code === "number" ? err.code : err?.response?.status || err?.status || 0);
  const reasons: string[] = (err?.errors || err?.response?.data?.error?.errors || []).map((e: any) => e?.reason).filter(Boolean);
  const message = String(err?.message || "");

  let retryable = false;
  if (RETRYABLE_STATUS.has(status)) retryable = true;
  else if (status === 403 && (reasons.some((r) => RETRYABLE_REASONS.has(r)) || /quota exceeded|rate limit/i.test(message))) retryable = true;
  else if (typeof err?.code === "string" && RETRYABLE_NET.has(err.code)) retryable = true;
  else if (/socket hang up|network error|timed? ?out/i.test(message) && !status) retryable = true;

  const quota = status === 429 || (status === 403 && (reasons.some((r) => RETRYABLE_REASONS.has(r)) || /quota exceeded|rate limit/i.test(message)));
  let retryAfterMs: number | undefined;
  const header = err?.response?.headers?.["retry-after"] ?? err?.response?.headers?.["Retry-After"];
  if (retryable && header !== undefined) {
    const secs = Number(header);
    if (Number.isFinite(secs)) retryAfterMs = Math.max(0, secs * 1000);
    else {
      const at = Date.parse(String(header));
      if (!Number.isNaN(at)) retryAfterMs = Math.max(0, at - Date.now());
    }
  }
  return { retryable, quota, retryAfterMs };
}

export type GoogleErrorCategory = "configuration" | "authentication" | "permission" | "not_found" | "quota" | "transient" | "timeout" | "invalid_request" | "unknown";

/**
 * Operational category of a failed Google call, used for honest messages and the readiness check.
 * configuration / authentication / permission / not_found / invalid_request are never retried; quota and transient are.
 */
export function categorizeGoogleError(err: any): GoogleErrorCategory {
  if (err?.isConfigError) return "configuration";
  const status = Number(err?.code && typeof err.code === "number" ? err.code : err?.response?.status || err?.status || 0);
  const message = String(err?.message || "");
  const info = classifyGoogleError(err);
  if (info.quota) return "quota";
  if (/invalid_grant|invalid_client|unauthorized_client|invalid jwt|private key|DECODER routines|no key or keyfile/i.test(message) || status === 401) return "authentication";
  if (status === 403) return "permission";
  if (status === 404) return "not_found";
  if (status === 400) return "invalid_request";
  if (/timed? ?out|ETIMEDOUT|ESOCKETTIMEDOUT/i.test(message) || err?.code === "ETIMEDOUT" || err?.code === "ESOCKETTIMEDOUT") return "timeout";
  if (info.retryable) return "transient";
  return "unknown";
}

export async function withGoogleRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 5;
  const base = options.baseDelayMs ?? 1000;
  const cap = options.maxDelayMs ?? 30_000;
  const maxElapsed = options.maxElapsedMs ?? (Number(process.env.GOOGLE_RETRY_MAX_ELAPSED_MS) || 40_000);
  const started = Date.now();
  let attempt = 0;
  for (;;) {
    attempt++;
    // Pacing: every attempt, including retries, is charged to the shared budget. A backpressure error means nothing was sent.
    const waited = options.kind ? await acquireSlot(options.kind) : 0;
    try {
      const result = await fn();
      recordGoogleAttempt(options.label, { failed: false, quota: false }, Date.now(), { kind: options.kind, waitedMs: waited, retry: attempt > 1 });
      return result;
    } catch (err: any) {
      const info = classifyGoogleError(err);
      recordGoogleAttempt(options.label, { failed: true, quota: info.quota }, Date.now(), { kind: options.kind, waitedMs: waited, retry: attempt > 1 });
      const { retryAfterMs } = info;
      const retryable = options.quotaOnly ? info.quota : info.retryable;
      const backoff = Math.random() * Math.min(cap, base * 2 ** (attempt - 1)); // full jitter
      const wait = Math.min(cap, retryAfterMs !== undefined ? Math.max(retryAfterMs, backoff) : backoff);
      if (info.quota && options.kind) await penalizeKind(options.kind, wait); // everyone slows down, not only this caller
      const outOfTime = Date.now() - started + wait > maxElapsed;
      if (!retryable || attempt >= maxAttempts || outOfTime) {
        if (retryable && err && typeof err === "object") {
          err.retriesExhausted = true;
          err.retryable = true;
          err.quotaExhausted = info.quota;
          err.attempts = attempt;
        }
        throw err;
      }
      console.warn(`[GoogleRetry] ${options.label || "request"} failed (${err?.code || err?.response?.status || err?.message}); retry ${attempt}/${maxAttempts - 1} in ${Math.round(wait)}ms`);
      await sleep(wait);
    }
  }
}
