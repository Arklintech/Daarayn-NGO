/**
 * lib/google/usage.ts
 *
 * In-memory accounting of Google API attempts made by THIS server instance (counts every attempt, including retries),
 * so quota problems (HTTP 429) can be investigated from evidence: which operation, how many per minute, how many
 * were rejected. Diagnostic only; it never changes behaviour. Kept on globalThis so every loaded copy shares it.
 */
interface Counter {
  calls: number;
  quotaRejections: number;
  failures: number;
}
interface Store {
  byKind: { read: number; write: number; retries: number; waitedMs: number; maxWaitMs: number; backpressure: number };
  byLabel: Map<string, Counter>;
  /** Requests refused by the limiter, per priority. */
  shed: Record<string, number>;
  /** Rolling 60 s window per kind: attempt timestamps (ms), highest count seen. */
  rolling: { read: { ts: number[]; peak: number }; write: { ts: number[]; peak: number } };
  perMinute: Map<number, { calls: number; quotaRejections: number }>;
  since: number;
}

const KEEP_MINUTES = 30;
const store = (): Store => {
  const g = globalThis as any;
  return (g.__daaraynGoogleUsage ??= { byKind: { read: 0, write: 0, retries: 0, waitedMs: 0, maxWaitMs: 0, backpressure: 0 }, byLabel: new Map(), shed: {}, rolling: { read: { ts: [], peak: 0 }, write: { ts: [], peak: 0 } }, perMinute: new Map(), since: Date.now() } as Store);
};

export function recordGoogleAttempt(label: string | undefined, outcome: { failed: boolean; quota: boolean }, now = Date.now(), extra: { kind?: "read" | "write"; waitedMs?: number; retry?: boolean } = {}) {
  const s = store();
  if (extra.kind) {
    s.byKind[extra.kind]++;
    const r = s.rolling[extra.kind];
    r.ts.push(now);
    while (r.ts.length && r.ts[0] <= now - 60_000) r.ts.shift();
    r.peak = Math.max(r.peak, r.ts.length); // most attempts seen in any rolling 60 s window (counted when the attempt finished)
  }
  if (extra.retry) s.byKind.retries++;
  s.byKind.waitedMs += extra.waitedMs || 0;
  s.byKind.maxWaitMs = Math.max(s.byKind.maxWaitMs, extra.waitedMs || 0); // longest single wait: compared with GOOGLE_SHEETS_MAX_WAIT_MS
  const key = label || "(unlabelled)";
  const c = s.byLabel.get(key) || { calls: 0, quotaRejections: 0, failures: 0 };
  c.calls++;
  if (outcome.failed) c.failures++;
  if (outcome.quota) c.quotaRejections++;
  s.byLabel.set(key, c);

  const minute = Math.floor(now / 60_000);
  const m = s.perMinute.get(minute) || { calls: 0, quotaRejections: 0 };
  m.calls++;
  if (outcome.quota) m.quotaRejections++;
  s.perMinute.set(minute, m);
  for (const k of s.perMinute.keys()) if (k < minute - KEEP_MINUTES) s.perMinute.delete(k);
}

export function googleUsageSnapshot() {
  const s = store();
  const byLabel: Record<string, Counter> = {};
  const total: Counter = { calls: 0, quotaRejections: 0, failures: 0 };
  for (const [label, c] of s.byLabel) {
    byLabel[label] = { ...c };
    total.calls += c.calls;
    total.quotaRejections += c.quotaRejections;
    total.failures += c.failures;
  }
  const perMinute = [...s.perMinute.entries()].sort((a, b) => a[0] - b[0]).map(([minute, m]) => ({ minute: new Date(minute * 60_000).toISOString(), ...m }));
  const nowMs = Date.now();
  const rolling = { read: { current: s.rolling.read.ts.filter((t) => t > nowMs - 60_000).length, peak: s.rolling.read.peak }, write: { current: s.rolling.write.ts.filter((t) => t > nowMs - 60_000).length, peak: s.rolling.write.peak } };
  return { since: new Date(s.since).toISOString(), total, byKind: { ...s.byKind }, rolling, shed: { ...s.shed }, byLabel, perMinute };
}

/** A request refused by the limiter before it was sent (busy, coordinator unavailable or not configured). */
export function recordGoogleBackpressure(priority?: string) {
  const st = store();
  st.byKind.backpressure++;
  if (priority) st.shed[priority] = (st.shed[priority] || 0) + 1;
}

export function resetGoogleUsage() {
  const s = store();
  s.byLabel.clear();
  s.shed = {};
  s.rolling = { read: { ts: [], peak: 0 }, write: { ts: [], peak: 0 } };
  s.perMinute.clear();
  s.byKind = { read: 0, write: 0, retries: 0, waitedMs: 0, maxWaitMs: 0, backpressure: 0 };
  s.since = Date.now();
}
