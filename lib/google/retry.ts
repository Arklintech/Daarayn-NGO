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

export async function withGoogleRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 5;
  const base = options.baseDelayMs ?? 1000;
  const cap = options.maxDelayMs ?? 30_000;
  let attempt = 0;
  for (;;) {
    attempt++;
    try {
      const result = await fn();
      recordGoogleAttempt(options.label, { failed: false, quota: false });
      return result;
    } catch (err: any) {
      const info = classifyGoogleError(err);
      recordGoogleAttempt(options.label, { failed: true, quota: info.quota });
      const { retryAfterMs } = info;
      const retryable = options.quotaOnly ? info.quota : info.retryable;
      if (!retryable || attempt >= maxAttempts) {
        if (retryable && err && typeof err === "object") {
          err.retriesExhausted = true;
          err.attempts = attempt;
        }
        throw err;
      }
      const backoff = Math.random() * Math.min(cap, base * 2 ** (attempt - 1)); // full jitter
      const wait = Math.min(cap, retryAfterMs !== undefined ? Math.max(retryAfterMs, backoff) : backoff);
      console.warn(`[GoogleRetry] ${options.label || "request"} failed (${err?.code || err?.response?.status || err?.message}); retry ${attempt}/${maxAttempts - 1} in ${Math.round(wait)}ms`);
      await sleep(wait);
    }
  }
}
