"use strict";
/**
 * Self-hostable Google request coordinator (no third-party service). It speaks the REST protocol the application already supports (POST a JSON
 * command array with a Bearer token, answer {"result": ...}) for the single command the limiter needs: the "GCRA-reserve-v3" script.
 *
 * Run exactly ONE instance per quota namespace on a host with a persistent process and a durable disk (see docs/ops/LIMITER_SERVICE_DEPLOYMENT.md):
 *   LIMITER_TOKEN=<24+ random characters>  [PORT=8787]  [LIMITER_STATE_FILE=/data/limiter-state.json]  node tools/limiter-server/server.cjs
 *
 * Safety properties
 *  - Durable: the state (only theoretical arrival times, numbers) is written atomically (temp file, fsync, rename) BEFORE a reservation is
 *    answered, so every granted slot survives a crash or restart. If the state cannot be written the reservation is refused (503, fail closed).
 *  - State loss: when the state file is missing, unreadable or invalid the effective budgets are unknown, so every budget is QUARANTINED for
 *    LIMITER_QUARANTINE_MS (default 75 000 ms = the 60 s Google quota window plus a 15 s margin). A restart can therefore never release a burst while earlier
 *    requests may still count against Google's per-minute quota. A deliberate first start on an empty volume can skip it with LIMITER_ACCEPT_EMPTY_STATE=true.
 *  - Single authority: an exclusive lock file next to the state file (heartbeat, stale after 15 s) stops a second instance from starting on the same state.
 *    Instances on different disks cannot detect each other: deploy with ONE instance (max instances = 1, recreate strategy, never rolling overlap).
 *  - Authentication on every quota endpoint; /health and /ready disclose no secret and are exempt (the platform probes them over plain http). HTTPS is required for
 *    quota requests when LIMITER_REQUIRE_HTTPS=true (TLS terminates at the platform proxy; requests whose X-Forwarded-Proto is not https are refused). The token is never logged or returned.
 *  - /ready answers 200 only while the state is writable and no quarantine is active.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { evalReserve, evalWindowReserve } = require("./gcra.cjs");

const env = process.env;
const token = env.LIMITER_TOKEN || "";
if (token.length < 24) {
  console.error("LIMITER_TOKEN is required and must be at least 24 characters");
  process.exit(1);
}
const port = Number(env.PORT || 8787);
const host = env.LIMITER_HOST || "0.0.0.0";
const stateFile = path.resolve(env.LIMITER_STATE_FILE || "limiter-state.json");
const lockFile = stateFile + ".lock";
// A quarantine shorter than the longest lease would let a lease holder from before a state loss work alongside a new holder: never shorter.
const quarantineMs = Math.max(Number(env.LIMITER_QUARANTINE_MS ?? 75000), Number(env.LIMITER_MAX_LEASE_MS || 75000));
const requireHttps = env.LIMITER_REQUIRE_HTTPS === "true";
const acceptEmpty = env.LIMITER_ACCEPT_EMPTY_STATE === "true";
const LOCK_STALE_MS = 15000;
const boot = Date.now();
const MAX_KEYS = 500; // a coordinator holds a handful of budget keys; refusing more bounds memory and disk
const KEY_RE = /^[A-Za-z0-9:_.\-]{1,200}$/;
const tokenBuf = Buffer.from(token);
/** Constant-time comparison of the Authorization header with the expected bearer token. */
const authorised = (header) => {
  const given = Buffer.from(String(header || ""));
  const want = Buffer.from("Bearer " + token);
  return given.length === want.length && crypto.timingSafeEqual(given, want);
};
/** Every numeric argument must be finite and inside sane bounds, otherwise a bad value could poison the persisted state. */
const validArgs = ([k1, k2, interval, burst, penalty, pint, pburst, maxw]) => {
  const n = [interval, burst, penalty, pint ?? 0, pburst ?? 1, maxw ?? 0].map(Number);
  return typeof k1 === "string" && typeof k2 === "string" && KEY_RE.test(k1) && KEY_RE.test(k2) && n.every(Number.isFinite) && n[0] > 0 && n[0] <= 3600000 && n[1] >= 1 && n[1] <= 1000 && n[2] >= 0 && n[2] <= 600000 && n[3] >= 0 && n[3] <= 3600000 && n[4] >= 1 && n[4] <= 1000 && n[5] >= 0 && n[5] <= 600000;
};

/* ---------- single-instance lock ---------- */
const me = `${os.hostname()}:${process.pid}`;
const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const ownerAlive = (owner) => {
  const i = String(owner).lastIndexOf(":");
  if (String(owner).slice(0, i) !== os.hostname()) return null; // another host: only the heartbeat can tell
  try {
    process.kill(Number(String(owner).slice(i + 1)), 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
};
function writeLock() {
  fs.writeFileSync(lockFile, JSON.stringify({ owner: me, beat: Date.now() }));
}
/** true when this process now holds the lock. A lock whose owner is dead (same host) or has not beaten for LOCK_STALE_MS is taken over; a live owner keeps it. */
function takeLock() {
  for (const deadline = Date.now() + LOCK_STALE_MS + 2000; ; ) {
    try {
      const fd = fs.openSync(lockFile, "wx");
      fs.writeSync(fd, JSON.stringify({ owner: me, beat: Date.now() }));
      fs.closeSync(fd);
      return true;
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
    }
    let cur = null;
    try {
      cur = JSON.parse(fs.readFileSync(lockFile, "utf8"));
    } catch {
      writeLock(); // unreadable lock: stale
      return true;
    }
    const alive = ownerAlive(cur.owner);
    if (alive === false || Date.now() - cur.beat >= LOCK_STALE_MS) {
      writeLock();
      return true;
    }
    if (alive === true) return false; // a live instance on this host holds it: refuse at once
    if (Date.now() > deadline) return false; // another host with a fresh heartbeat: give it the stale window to show it is gone
    sleepSync(500);
  }
}
fs.mkdirSync(path.dirname(stateFile), { recursive: true });
if (!takeLock()) {
  console.error("another coordinator instance is using this state file; refusing to start");
  process.exit(2);
}
const beat = setInterval(() => {
  try {
    fs.writeFileSync(lockFile, JSON.stringify({ owner: me, beat: Date.now() }));
  } catch {
    /* a failing heartbeat shows up as a failing save */
  }
}, 5000);
beat.unref();
const releaseLock = () => {
  try {
    fs.unlinkSync(lockFile);
  } catch {
    /* already gone */
  }
};

/* ---------- state ---------- */
const store = new Map();
/** Sliding-window budgets (D38): key -> { g: grant times ascending, b: blocked-until }. Plain JSON, persisted next to the GCRA state. */
const windows = new Map();
/** Leases for serialising critical operations: resource -> { token, owner, expiresAt }. lastToken: resource -> highest fencing token ever issued. */
const leases = new Map();
const lastToken = new Map();
const MAX_LEASE_MS = Number(env.LIMITER_MAX_LEASE_MS || 75000);
let trusted = false;
let quarantineUntil = 0;
try {
  const saved = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  if (saved && saved.version === 1 && saved.keys && typeof saved.keys === "object") {
    for (const [k, v] of Object.entries(saved.keys)) if (Number.isFinite(v)) store.set(k, v);
    for (const [k, v] of Object.entries(saved.windows || {})) if (v && Array.isArray(v.g) && v.g.every(Number.isFinite) && Number.isFinite(v.b)) windows.set(k, { g: v.g, b: v.b });
    for (const [k, v] of Object.entries(saved.leases || {})) if (v && Number.isFinite(v.token) && Number.isFinite(v.expiresAt)) leases.set(k, v);
    for (const [k, v] of Object.entries(saved.lastToken || {})) if (Number.isFinite(v)) lastToken.set(k, v);
    trusted = true;
  }
} catch (e) {
  if (e.code !== "ENOENT") {
    try {
      fs.renameSync(stateFile, `${stateFile}.corrupt-${Date.now()}`); // keep the evidence
    } catch {
      /* ignore */
    }
  }
}
if (!trusted && !acceptEmpty) quarantineUntil = boot + quarantineMs;
const initialTat = () => (Date.now() < quarantineUntil ? quarantineUntil : 0); // every budget not yet known stays closed while a quarantine runs

let storageOk = true;

/* ---------- metrics (technical counters only: no keys, identities or Google data) ---------- */
const stats = { granted: { read: [], write: [] }, refused: { read: 0, write: 0 }, penalties: 0, storageFailures: 0, leaseGrants: 0 };
const kindOf = (key) => (String(key).endsWith(":write") ? "write" : "read");
function metrics() {
  const now = Date.now();
  const rolling = {};
  for (const k of ["read", "write"]) {
    stats.granted[k] = stats.granted[k].filter((t) => t > now - 60000);
    rolling[k] = stats.granted[k].length;
  }
  const queueDepthMs = { read: 0, write: 0 };
  for (const [key, tat] of store) if (!key.includes(":project:") && !key.startsWith("__")) queueDepthMs[kindOf(key)] = Math.max(queueDepthMs[kindOf(key)], Math.max(0, tat - now));
  return { uptimeMs: now - boot, storageOk, quarantined: now < quarantineUntil, rollingGranted60s: rolling, queueDepthMs, refusedSinceStart: { ...stats.refused }, penaltiesSinceStart: stats.penalties, storageFailuresSinceStart: stats.storageFailures, activeLeases: [...leases.values()].filter((l) => l.expiresAt > now).length, leaseGrantsSinceStart: stats.leaseGrants };
}
function persistSync() {
  const now = Date.now();
  const keys = {};
  for (const [k, v] of store) if (v > now - 60000) keys[k] = v; // budgets that ended over a minute ago need not be remembered
  const tmp = stateFile + ".tmp";
  const fd = fs.openSync(tmp, "w");
  try {
    const lease = {};
    for (const [k, v] of leases) if (v.expiresAt > now - 60000) lease[k] = v;
    const tokens = {};
    for (const [k, v] of lastToken) tokens[k] = v;
    const wins = {};
    for (const [k, v] of windows) if ((v.g.length && v.g[v.g.length - 1] > now - 60000) || v.b > now) wins[k] = v;
    fs.writeSync(fd, JSON.stringify({ version: 1, savedAt: now, keys, windows: wins, leases: lease, lastToken: tokens }));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, stateFile);
}
// Even a quarantine must survive a restart: persist at start so a crash loop cannot shorten it
try {
  if (!trusted) {
    store.set("__quarantine__", quarantineUntil);
    persistSync();
    store.delete("__quarantine__");
  }
} catch {
  storageOk = false;
}
if (trusted && store.has("__quarantine__")) {
  quarantineUntil = Math.max(quarantineUntil, store.get("__quarantine__"));
  store.delete("__quarantine__");
}


/* ---------- leases (technical coordination only: who may run a critical operation for a resource, and a fencing token) ----------
 * acquire: grants the lease if it is free or expired, with a strictly increasing fencing token (max(lastToken+1, now): monotonic across restarts).
 * check: true only for the CURRENT token before its expiry (lets a worker refuse to write when its lease is no longer safely valid).
 * release: frees the lease for the matching token only. While a quarantine runs (state lost) leases are not granted: a holder from before
 * the loss may still be working and its lease can live up to LIMITER_MAX_LEASE_MS, which is why the quarantine must not be shorter than that. */
function handleLease(cmd, reply) {
  const [, action, resource, a, b, c] = cmd;
  const now = Date.now();
  if (!storageOk) return reply(503, { error: "state storage unavailable" });
  if (typeof resource !== "string" || !KEY_RE.test(resource)) return reply(400, { error: "invalid arguments" });
  const cur = leases.get(resource);
  const live = cur && cur.expiresAt > now;
  if (action === "acquire") {
    const owner = String(a || "");
    const ttl = Number(b);
    if (!KEY_RE.test(owner) || !Number.isFinite(ttl) || ttl < 1000 || ttl > MAX_LEASE_MS) return reply(400, { error: "invalid arguments" });
    if (now < quarantineUntil) return reply(200, { result: { ok: false, retryAfterMs: Math.min(5000, quarantineUntil - now), reason: "quarantine" } });
    if (live) return reply(200, { result: { ok: false, retryAfterMs: Math.min(2000, Math.max(100, cur.expiresAt - now)), reason: "held" } });
    if (!leases.has(resource) && leases.size >= 200) return reply(503, { error: "too many leases" });
    const token = Math.max((lastToken.get(resource) || 0) + 1, now);
    const lease = { token, owner, expiresAt: now + ttl };
    const before = { cur, last: lastToken.get(resource) };
    leases.set(resource, lease);
    lastToken.set(resource, token);
    try {
      persistSync();
    } catch {
      if (before.cur) leases.set(resource, before.cur); else leases.delete(resource);
      if (before.last === undefined) lastToken.delete(resource); else lastToken.set(resource, before.last);
      storageOk = false;
      return reply(503, { error: "state storage unavailable" });
    }
    stats.leaseGrants++;
    return reply(200, { result: { ok: true, token, expiresAt: lease.expiresAt, ttlMs: ttl } });
  }
  if (action === "check") {
    const token = Number(a);
    if (!Number.isFinite(token)) return reply(400, { error: "invalid arguments" });
    const valid = Boolean(live && cur.token === token);
    return reply(200, { result: { valid, remainingMs: valid ? cur.expiresAt - now : 0 } });
  }
  if (action === "release") {
    const token = Number(a);
    if (!Number.isFinite(token)) return reply(400, { error: "invalid arguments" });
    if (cur && cur.token === token) {
      leases.delete(resource);
      try {
        persistSync();
      } catch {
        leases.set(resource, cur); // not durably released: it simply expires
      }
      return reply(200, { result: { released: true } });
    }
    return reply(200, { result: { released: false } });
  }
  return reply(400, { error: "unsupported command" });
}

/* ---------- http ---------- */
const server = http.createServer((req, res) => {
  const reply = (code, body, headers = {}) => {
    res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers });
    res.end(JSON.stringify(body));
  };
  const now = Date.now();
  if (req.method === "GET" && req.url === "/health") return reply(200, { ok: true, uptimeMs: now - boot });
  if (req.method === "GET" && req.url === "/ready") {
    const quarantined = now < quarantineUntil;
    const ok = storageOk && !quarantined;
    return reply(ok ? 200 : 503, { ready: ok, storageOk, quarantined, quarantineEndsInMs: Math.max(0, quarantineUntil - now) });
  }
  if (requireHttps && req.headers["x-forwarded-proto"] !== "https") return reply(421, { error: "https required" });
  if (req.method === "GET" && req.url === "/metrics") return authorised(req.headers.authorization) ? reply(200, metrics()) : reply(401, { error: "unauthorized" });
  if (req.method !== "POST") return reply(405, { error: "method" });
  if (!authorised(req.headers.authorization)) return reply(401, { error: "unauthorized" });
  let raw = "";
  req.on("data", (c) => {
    raw += c;
    if (raw.length > 4096) req.destroy();
  });
  req.on("end", () => {
    let cmd;
    try {
      cmd = JSON.parse(raw);
    } catch {
      return reply(400, { error: "bad json" });
    }
    if (!Array.isArray(cmd)) return reply(400, { error: "bad command" });
    if (cmd[0] === "PING") return reply(200, { result: "PONG" });
    if (cmd[0] === "LEASE") return handleLease(cmd, reply);
    if (cmd[0] === "EVAL" && String(cmd[1]).includes("GCRA-reserve-v3") && Number(cmd[2]) === 2) {
      if (!storageOk) return reply(503, { error: "state storage unavailable" });
      const [, , , k1, k2, interval, burst, penalty, pint, pburst, maxw] = cmd;
      if (!validArgs([k1, k2, interval, burst, penalty, pint, pburst, maxw])) return reply(400, { error: "invalid arguments" });
      if ((!store.has(String(k1)) || !store.has(String(k2))) && store.size >= MAX_KEYS) return reply(503, { error: "too many budgets" });
      const snapshot = new Map(store);
      const wait = evalReserve(store, [String(k1), String(k2)], [interval, burst, penalty, pint, pburst, maxw], Date.now(), initialTat);
      const kind = kindOf(k1);
      if (wait < 0) {
        stats.refused[kind]++;
        return reply(200, { result: -1 });
      } // refused (wait above the caller's ceiling): nothing was reserved, nothing to persist
      try {
        persistSync(); // durable BEFORE the slot is handed out
      } catch {
        store.clear();
        for (const [k, v] of snapshot) store.set(k, v); // the slot was not durably recorded: do not keep it
        storageOk = false;
        stats.storageFailures++;
        setTimeout(() => {
          try {
            persistSync();
            storageOk = true; // the disk works again
          } catch {
            /* still failing */
          }
        }, 2000).unref();
        return reply(503, { error: "state storage unavailable" });
      }
      if (Number(penalty) > 0) stats.penalties++;
      else stats.granted[kind].push(Date.now());
      return reply(200, { result: wait });
    }
    if (cmd[0] === "EVAL" && String(cmd[1]).includes("WINDOW-reserve-v1") && Number(cmd[2]) === 2) {
      if (!storageOk) return reply(503, { error: "state storage unavailable" });
      const [, , , k1, k2, limit, windowMs, penalty, plimit, maxw] = cmd;
      const n = [limit, windowMs, penalty, plimit ?? 0, maxw ?? 0].map(Number);
      const valid = typeof k1 === "string" && typeof k2 === "string" && KEY_RE.test(k1) && KEY_RE.test(k2) && n.every(Number.isFinite) && n[0] >= 1 && n[0] <= 10000 && n[1] >= 1000 && n[1] <= 3600000 && n[2] >= 0 && n[2] <= 600000 && n[3] >= 0 && n[3] <= 100000 && n[4] >= 0;
      if (!valid) return reply(400, { error: "invalid arguments" });
      if ((!windows.has(String(k1)) || (n[3] > 0 && !windows.has(String(k2)))) && windows.size >= MAX_KEYS) return reply(503, { error: "too many budgets" });
      const snapshot = JSON.stringify([...windows]);
      const wait = evalWindowReserve(windows, [String(k1), String(k2)], [n[0], n[1], n[2], n[3], n[4]], Date.now(), Date.now() < quarantineUntil ? quarantineUntil : 0);
      const kind = kindOf(k1);
      if (wait < 0) {
        stats.refused[kind]++;
        return reply(200, { result: -1 }); // refused: nothing was reserved, nothing to persist
      }
      try {
        persistSync(); // durable BEFORE the slot is handed out
      } catch {
        windows.clear();
        for (const [k, v] of JSON.parse(snapshot)) windows.set(k, v);
        storageOk = false;
        stats.storageFailures++;
        setTimeout(() => {
          try {
            persistSync();
            storageOk = true;
          } catch {
            /* still failing */
          }
        }, 2000).unref();
        return reply(503, { error: "state storage unavailable" });
      }
      if (n[2] > 0) stats.penalties++;
      else stats.granted[kind].push(Date.now());
      return reply(200, { result: wait });
    }
    return reply(400, { error: "unsupported command" });
  });
});
server.listen(port, host, () => console.log(JSON.stringify({ listening: server.address().port, trusted, quarantineMs: trusted || acceptEmpty ? 0 : quarantineMs })));
const stop = () => {
  server.close(() => {
    releaseLock();
    process.exit(0);
  });
  setTimeout(() => {
    releaseLock();
    process.exit(0);
  }, 500).unref();
};
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, stop);
