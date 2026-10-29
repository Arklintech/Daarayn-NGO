"use strict";
/**
 * The reservation arithmetic of lib/google/requestControl.ts (RESERVE_LUA, marker "GCRA-reserve-v2") in plain JavaScript.
 * Used by the self-hostable coordinator service and by the test emulators; the production Redis path runs the Lua text itself.
 * One call is synchronous, so for a single process it is atomic. `store` is a Map(key -> theoretical arrival time in ms).
 *
 * KEYS: [userKey, projectKey]. ARGV: [intervalMs, burst, penaltyMs, projectIntervalMs (0 = no project budget), projectBurst].
 * Returns the wait in ms (0 for a penalty).
 */
function evalReserve(store, keys, argv, now, initialTat) {
  const interval = Number(argv[0]);
  const burst = Number(argv[1]);
  const penalty = Number(argv[2]);
  const pint = Number(argv[3] || 0);
  const pburst = Number(argv[4] || 1);
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
  store.set(keys[0], tat + interval);
  if (pint > 0) store.set(keys[1], ptat + pint);
  return Math.ceil(Math.max(wait, pwait));
}
module.exports = { evalReserve };
