#!/usr/bin/env node
/**
 * Cross-instance acceptance driver for a deployed Preview (or for several local instances of the production build).
 * It calls /api/ops/probe (no Google request, only coordinator slots) in parallel across one or more base URLs and reports:
 *   - how many DISTINCT function instances answered (their random ids),
 *   - whether the combined grants respect ONE shared budget (spacing of grant times across all instances),
 *   - that read and write budgets are separate,
 *   - that low priority is refused before critical traffic under a flood.
 * Usage:
 *   OPS_MONITOR_TOKEN=... node scripts/preview-acceptance.mjs --base https://preview.example.vercel.app[,https://other] [--calls 24] [--coordinator https://limiter.example.org --coordinator-token ...]
 * The token is read from the environment only and never printed. Output is JSON.
 */
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const bases = String(opt("base", "")).split(",").filter(Boolean);
const calls = Number(opt("calls", 24));
const token = process.env.OPS_MONITOR_TOKEN || "";
const coordinator = opt("coordinator", "");
const coordinatorToken = opt("coordinator-token", process.env.GOOGLE_LIMITER_TOKEN || "");
if (!bases.length || token.length < 24) {
  console.error("Need --base <url[,url]> and OPS_MONITOR_TOKEN (24+ characters) in the environment.");
  process.exit(2);
}
const headers = { authorization: `Bearer ${token}` };
const probe = async (i, qs) => {
  const base = bases[i % bases.length];
  const t0 = Date.now();
  try {
    const res = await fetch(`${base}/api/ops/probe?${qs}`, { headers });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, at: Date.now(), t0, base, ...body };
  } catch (e) {
    return { status: 0, error: String(e?.message || e), at: Date.now(), t0, base };
  }
};
const metrics = async () => {
  if (!coordinator) return null;
  try {
    const r = await fetch(new URL("/metrics", coordinator), { headers: { authorization: `Bearer ${coordinatorToken}` } });
    return r.ok ? await r.json() : { status: r.status };
  } catch {
    return null;
  }
};
const report = { bases: bases.length, calls };

// 1. identity and shared budget: parallel critical reads from all bases
const before = await metrics();
const t0 = Date.now();
const a = await Promise.all(Array.from({ length: calls }, (_, i) => probe(i, "kind=read&priority=P0&n=1")));
const ok = a.filter((r) => r.status === 200);
const ids = new Set(ok.map((r) => r.instance));
const grantTimes = ok.map((r) => r.at - (r.waitedMs ? 0 : 0)).sort((x, y) => x - y);
report.sharedBudget = {
  answered: ok.length,
  refused: a.length - ok.length,
  distinctInstances: ids.size,
  instancesById: Object.fromEntries([...ids].map((id) => [id, ok.filter((r) => r.instance === id).length])),
  regions: [...new Set(ok.map((r) => r.region).filter(Boolean))],
  deployments: [...new Set(ok.map((r) => r.deployment).filter(Boolean))],
  limiterModes: [...new Set(ok.map((r) => r.limiterMode))],
  allReady: ok.every((r) => r.limiterReady),
  elapsedMs: Date.now() - t0,
  maxWaitedMs: Math.max(0, ...ok.map((r) => r.waitedMs)),
  completionSpanMs: grantTimes.length ? grantTimes[grantTimes.length - 1] - grantTimes[0] : 0,
};
const afterReads = await metrics();
if (before && afterReads) report.sharedBudget.coordinatorRollingGranted60s = afterReads.rollingGranted60s;

// 2. read and write budgets are separate
const rw = await Promise.all([...Array.from({ length: 6 }, (_, i) => probe(i, "kind=read&priority=P0")), ...Array.from({ length: 6 }, (_, i) => probe(i, "kind=write&priority=P0"))]);
report.readWriteSeparate = { reads: rw.slice(0, 6).filter((r) => r.status === 200).length, writes: rw.slice(6).filter((r) => r.status === 200).length };

// 3. priority: a P3 flood alongside a few P0 requests
const flood = await Promise.all([...Array.from({ length: calls * 2 }, (_, i) => probe(i, "kind=read&priority=P3")), ...Array.from({ length: 6 }, (_, i) => probe(i, "kind=read&priority=P0"))]);
const p3 = flood.slice(0, calls * 2);
const p0 = flood.slice(calls * 2);
report.priority = { p3Admitted: p3.filter((r) => r.status === 200).length, p3Refused: p3.filter((r) => r.status === 503).length, p0Admitted: p0.filter((r) => r.status === 200).length, p0Refused: p0.filter((r) => r.status === 503).length };
report.metricsAfter = await metrics();
console.log(JSON.stringify(report, null, 2));
