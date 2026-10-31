#!/usr/bin/env node
/**
 * D38 Vercel PREVIEW acceptance driver for the queued intake. Run by the owner against a deliberate Preview deployment that is connected ONLY to the approved test
 * spreadsheet. It refuses to run against anything that does not look like a Preview deployment. It sends dummy submissions (donor addresses end in .invalid, no real
 * email is sent), measures acknowledgement latency, tests replays, waits for the queue to drain and reports what it can see from the OUTSIDE.
 *
 *   node scripts/preview-d38-acceptance.mjs --url https://<preview>.vercel.app --n 30 \
 *        [--bypass <VERCEL_AUTOMATION_BYPASS_SECRET>] [--monitor-token <OPS_MONITOR_TOKEN>] [--cause <causeId>] [--wait 240]
 *
 * What it cannot see (collect these from the deployment): Google Sheets reads and writes per operation (GET /api/admin/diagnostics/quota-health as an admin, or the
 * usage counters), Vercel Queues operations (Vercel Observability -> Queues), 429s from Google (quota-health), instance cold/warm behaviour (function logs).
 */
const args = process.argv.slice(2);
const opt = (name, d) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : d;
};
const base = (opt("url", "") || "").replace(/\/$/, "");
const N = Number(opt("n", 12));
const bypass = opt("bypass", "");
const monitor = opt("monitor-token", "");
const cause = opt("cause", "");
const waitS = Number(opt("wait", 240));
const override = args.includes("--i-know-this-is-a-test-environment");

if (!/^https:\/\//.test(base)) {
  console.error("Give the Preview URL with --url https://...");
  process.exit(2);
}
if (!/\.vercel\.app$/i.test(new URL(base).hostname) && !override) {
  console.error("Refusing to run: the host is not a *.vercel.app deployment. A production domain must never receive test submissions. (Override only for a staging host you control.)");
  process.exit(2);
}
const headers = bypass ? { "x-vercel-protection-bypass": bypass } : {};
const run = Date.now().toString(36);
const pct = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] : 0;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function submit(i, key = `PV-${run}-${i}`) {
  const fd = new FormData();
  fd.set("donorName", `Preview Donor ${i}`);
  fd.set("donorContact", `pv-${run}-${i}@example.invalid`);
  fd.set("amount", String(100 + i));
  fd.set("submissionKey", key);
  if (cause) fd.set("selectedCauses", JSON.stringify([{ causeId: cause }]));
  fd.set("screenshot", new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: "image/png" }), "proof.png");
  const t = Date.now();
  try {
    const res = await fetch(`${base}/api/intake/accept`, { method: "POST", body: fd, headers: { ...headers, "x-forwarded-for": `198.51.100.${(i % 250) + 1}` } });
    const body = await res.json().catch(() => ({}));
    return { i, key, status: res.status, ms: Date.now() - t, reference: body.reference, queued: body.queued, error: body.error };
  } catch (e) {
    return { i, key, status: 0, ms: Date.now() - t, error: String(e.message || e) };
  }
}

const t0 = Date.now();
console.log(`D38 Preview acceptance: ${N} simultaneous submissions to ${new URL(base).host}`);
const results = await Promise.all(Array.from({ length: N }, (_, i) => submit(i + 1)));
const ackWall = Date.now() - t0;
const codes = {};
for (const r of results) codes[r.status] = (codes[r.status] || 0) + 1;
const ok = results.filter((r) => r.status === 202);
const lat = ok.map((r) => r.ms);
console.log(`ACK: wall ${(ackWall / 1000).toFixed(1)} s | accepted ${ok.length}/${N} | status codes ${JSON.stringify(codes)} | latency s P50 ${(pct(lat, 50) / 1000).toFixed(2)} P95 ${(pct(lat, 95) / 1000).toFixed(2)} P99 ${(pct(lat, 99) / 1000).toFixed(2)} max ${(Math.max(0, ...lat) / 1000).toFixed(2)} | within 60 s: ${results.filter((r) => r.status === 202 && r.ms <= 60000).length}/${N} | wake-ups published: ${ok.filter((r) => r.queued).length}`);

// Replays: the same key and payload must give the same reference (idempotent acceptance)
const replays = await Promise.all(ok.slice(0, 3).map((r) => submit(r.i, r.key)));
const sameRef = replays.every((r, k) => r.reference && r.reference === ok[k].reference);
console.log(`REPLAY: ${replays.length} replays, same reference returned: ${sameRef}`);

// Wait for the queue to drain. With the monitor token the queue depth is read (one Sheets read per call); without it, two references are sampled.
const refs = ok.map((r) => r.reference);
let drained = false;
let depthSeen = null;
let completedAt = null;
const deadline = Date.now() + waitS * 1000;
while (Date.now() < deadline && !drained) {
  await sleep(15000);
  if (monitor) {
    const r = await fetch(`${base}/api/ops/queue-status`, { headers: { ...headers, authorization: `Bearer ${monitor}` } }).catch(() => null);
    const b = r ? await r.json().catch(() => ({})) : {};
    depthSeen = b.depth ?? depthSeen;
    if (b.depth === 0) drained = true;
  } else {
    const sample = [refs[0], refs[refs.length - 1]].filter(Boolean);
    const states = await Promise.all(sample.map((ref) => fetch(`${base}/api/intake/status?ref=${ref}`, { headers }).then((x) => x.json()).catch(() => ({}))));
    depthSeen = states.map((s) => s.state).join(",");
    if (states.length && states.every((s) => s.final)) drained = true;
  }
  if (drained) completedAt = Date.now();
}
console.log(`DRAIN: ${drained ? `queue empty ${((completedAt - t0) / 1000).toFixed(0)} s after the first submission` : `NOT drained within ${waitS} s`} (last reading: ${depthSeen})`);

// Spot-check the final state of up to 8 references (the status route is rate limited: 30 a minute per address)
const spot = refs.slice(0, 8);
const finals = [];
for (const ref of spot) {
  const r = await fetch(`${base}/api/intake/status?ref=${ref}`, { headers }).then((x) => x.json()).catch(() => ({}));
  finals.push(r.state);
  await sleep(2200);
}
const completeCount = finals.filter((s) => s === "COMPLETE").length;
console.log(`SPOT-CHECK: ${completeCount}/${spot.length} COMPLETE (${JSON.stringify(finals)})`);

const failed = results.filter((r) => r.status !== 202);
console.log(
  JSON.stringify(
    {
      category: "PREVIEW (acceptance driver, outside view only)",
      n: N,
      accepted: ok.length,
      statusCodes: codes,
      ackWallSeconds: Number((ackWall / 1000).toFixed(1)),
      ackP50: pct(lat, 50),
      ackP95: pct(lat, 95),
      ackP99: pct(lat, 99),
      within60s: results.filter((r) => r.status === 202 && r.ms <= 60000).length,
      replaySameReference: sameRef,
      drained,
      drainSeconds: drained ? Math.round((completedAt - t0) / 1000) : null,
      spotComplete: `${completeCount}/${spot.length}`,
      firstErrors: failed.slice(0, 3).map((r) => r.error || r.status),
      note: "Collect Sheets reads/writes per operation, Google 429s and queue operations from the deployment (see header comment).",
    },
    null,
    2
  )
);
process.exit(ok.length === N && drained && sameRef ? 0 : 1);
