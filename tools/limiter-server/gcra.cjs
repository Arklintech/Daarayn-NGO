"use strict";
/**
 * The reservation arithmetic of lib/google/requestControl.ts (RESERVE_LUA, marker "GCRA-reserve-v2") in plain JavaScript.
 * Used by the self-hostable coordinator service and by the test emulators; the production Redis path runs the Lua text itself.
 * One call is synchronous, so for a single process it is atomic. `store` is a Map(key -> theoretical arrival time in ms).
 *
 * KEYS: [userKey, projectKey]. ARGV: [intervalMs, burst, penaltyMs, projectIntervalMs (0 = no project budget), projectBurst, maxWaitMs (0 = no ceiling)].
 * Returns the wait in ms (0 for a penalty), or -1 when the wait would exceed maxWaitMs: then NOTHING is reserved (atomic admit-or-refuse).
 */
function evalReserve(store, keys, argv, now, initialTat) {
  const interval = Number(argv[0]);
  const burst = Number(argv[1]);
  const penalty = Number(argv[2]);
  const pint = Number(argv[3] || 0);
  const pburst = Number(argv[4] || 1);
  const maxWait = Number(argv[5] || 0);
  const load = (k) => {
    let v = store.has(k) ? store.get(k) : initialTat ? initialTat(k, now) : 0;
    if (v < now) v = now;
    return v;
  };
  let tat = load(keys[0]);
  let ptat = pint > 0 ? load(keys[1]) : 0;
  if (penalty > 0) {
    store.set(keys[0], tat + penalty);
    if (pint > 0) store.set(keys[1], ptat + penalty);
    return 0;
  }
  const wait = Math.max(0, tat - now - (burst - 1) * interval);
  const pwait = pint > 0 ? Math.max(0, ptat - now - (pburst - 1) * pint) : 0;
  const total = Math.max(wait, pwait);
  if (maxWait > 0 && total > maxWait) return -1; // refuse without reserving
  store.set(keys[0], tat + interval);
  if (pint > 0) store.set(keys[1], ptat + pint);
  return Math.ceil(total);
}

/**
 * Sliding-window admission (D38). At most LIMIT grants in ANY window of WINDOW ms: the (i+LIMIT)th grant is at least WINDOW after the ith. When the window is
 * empty a whole burst of LIMIT requests is admitted at once (a per-minute quota is not a requirement to send one request every 1.33 s), and the
 * documented quota can never be exceeded whatever the alignment of the provider's own minute (a GCRA with a burst of LIMIT and a rate of LIMIT per window would
 * admit 2 x LIMIT inside one window). Each grant is a (possibly future) time; a caller sleeps until it. Times are monotonic per budget, so order is preserved.
 *
 * `store` is a Map(key -> { g: grant times ascending, b: blocked-until ms }), plain JSON, so it can be persisted.
 * KEYS: [userKey, projectKey]. ARGV: [limit, windowMs, penaltyMs (0 = a normal reservation), projectLimit (0 = no project budget), maxWaitMs (0 = no ceiling)].
 * `gate` blocks every budget that is not yet known until that time (the quarantine after lost state).
 * Returns the wait in ms (0 for a penalty), or -1 when the wait would exceed maxWaitMs: then NOTHING is reserved (atomic admit-or-refuse).
 */
function evalWindowReserve(store, keys, argv, now, gate) {
  const limit = Number(argv[0]);
  const windowMs = Number(argv[1]);
  const penalty = Number(argv[2] || 0);
  const plimit = Number(argv[3] || 0);
  const maxWait = Number(argv[4] || 0);
  const entry = (k) => store.get(k) || { g: [], b: gate || 0 };
  // a grant older than the window can no longer constrain a future one; dropping it keeps the state bounded
  const prune = (e) => {
    let n = 0;
    while (n < e.g.length && e.g[n] + windowMs <= now) n++;
    if (n) e.g.splice(0, n);
  };
  const earliest = (e, lim) => {
    let t = Math.max(now, e.b, e.g.length ? e.g[e.g.length - 1] : 0);
    if (e.g.length >= lim) t = Math.max(t, e.g[e.g.length - lim] + windowMs);
    return t;
  };
  const eu = entry(keys[0]);
  const ep = plimit > 0 ? entry(keys[1]) : null;
  prune(eu);
  if (ep) prune(ep);
  if (penalty > 0) {
    eu.b = Math.max(eu.b, now + penalty);
    store.set(keys[0], eu);
    if (ep) {
      ep.b = Math.max(ep.b, now + penalty);
      store.set(keys[1], ep);
    }
    return 0;
  }
  const t = Math.max(earliest(eu, limit), ep ? earliest(ep, plimit) : 0);
  const wait = t - now;
  if (maxWait > 0 && wait > maxWait) return -1; // refuse without reserving
  if (eu.g.length >= 5000 || (ep && ep.g.length >= 5000)) return -1; // defensive bound; unreachable with a sane ceiling
  eu.g.push(t);
  store.set(keys[0], eu);
  if (ep) {
    ep.g.push(t);
    store.set(keys[1], ep);
  }
  return Math.ceil(wait);
}
module.exports = { evalReserve, evalWindowReserve };
