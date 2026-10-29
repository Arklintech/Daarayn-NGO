"use strict";
/**
 * Self-hostable Google request coordinator (no third-party service). It speaks the REST protocol the application already supports (POST a JSON
 * command array with a Bearer token, answer {"result": ...}) for the single command the limiter needs: the "GCRA-reserve-v2" script.
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
const { evalReserve } = require("./gcra.cjs");

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
const quarantineMs = Number(env.LIMITER_QUARANTINE_MS ?? 75000);
const requireHttps = env.LIMITER_REQUIRE_HTTPS === "true";
const acceptEmpty = env.LIMITER_ACCEPT_EMPTY_STATE === "true";
const LOCK_STALE_MS = 15000;
const boot = Date.now();

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
let trusted = false;
let quarantineUntil = 0;
try {
  const saved = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  if (saved && saved.version === 1 && saved.keys && typeof saved.keys === "object") {
    for (const [k, v] of Object.entries(saved.keys)) if (Number.isFinite(v)) store.set(k, v);
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
function persistSync() {
  const now = Date.now();
  const keys = {};
  for (const [k, v] of store) if (v > now - 60000) keys[k] = v; // budgets that ended over a minute ago need not be remembered
  const tmp = stateFile + ".tmp";
  const fd = fs.openSync(tmp, "w");
  try {
    fs.writeSync(fd, JSON.stringify({ version: 1, savedAt: now, keys }));
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
  if (req.method !== "POST") return reply(405, { error: "method" });
  if (req.headers.authorization !== "Bearer " + token) return reply(401, { error: "unauthorized" });
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
    if (cmd[0] === "EVAL" && String(cmd[1]).includes("GCRA-reserve-v2") && Number(cmd[2]) === 2) {
      if (!storageOk) return reply(503, { error: "state storage unavailable" });
      const [, , , k1, k2, interval, burst, penalty, pint, pburst] = cmd;
      const snapshot = new Map(store);
      const wait = evalReserve(store, [String(k1), String(k2)], [interval, burst, penalty, pint, pburst], Date.now(), initialTat);
      try {
        persistSync(); // durable BEFORE the slot is handed out
      } catch {
        store.clear();
        for (const [k, v] of snapshot) store.set(k, v); // the slot was not durably recorded: do not keep it
        storageOk = false;
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
