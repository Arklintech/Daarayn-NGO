/**
 * D37 LIVE proofs of the queued intake and the finaliser on the APPROVED TEST SPREADSHEET ONLY (real Google; one machine; NOT Vercel).
 * Intake from N independent module graphs sharing ONE coordinator (LIVE_COORDINATOR_URL) at the default 45/45 per minute. Run with D37_N=12 or 30.
 * Same safety model as the other live suites: refuses unless the sheet is the approved id, differs from production and has the `_IntegrationTest`
 * marker; email, Drive uploads, realtime and Firebase are stubbed; only synthetic ZZ_ records.
 */
import "./env";
import { describe, it, expect, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { googleUsageSnapshot, resetGoogleUsage } from "@/lib/google/usage";
import { google } from "googleapis";

const APPROVED = "1sGVsMEQDI1WmjWdUTQ0eKOzZC34Ri9CLsf4uUUceGzM";
const PRODUCTION = (process.env.GOOGLE_SHEET_ID || "").trim();

vi.mock("@/lib/server/auth", async () => {
  const { NextResponse } = await import("next/server");
  const admin = { kind: "admin", uid: "live-d37", email: "live-d37@example.invalid" };
  return { requireAdmin: async () => admin, requireAgent: async () => NextResponse.json({}, { status: 401 }), requireAdminOrAgent: async () => admin };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendDonationEmail: vi.fn(async () => ({ sent: false, skipped: "live test: e-mail disabled" })) }));
vi.mock("@/lib/email/providerManager", () => ({ sendEmail: vi.fn(async () => { throw new Error("live test: e-mail disabled"); }), verifyEmailProvider: vi.fn(async () => false) }));
vi.mock("@/lib/google/drive", () => ({ driveService: { uploadFile: vi.fn(async () => ({ drive_file_id: `STUB-${Math.random().toString(36).slice(2, 8)}`, backend: "stub" })), deleteFile: vi.fn(async () => undefined) } }));
vi.mock("@/lib/realtime/broadcaster", () => ({ realtimeBroadcaster: { publish: vi.fn(async () => ({ delivered: "log" })), publishBatch: vi.fn(async () => ({ delivered: "log" })), broadcast: vi.fn() } }));

const RUN = `ZZ_D37_${Date.now().toString(36)}`;
const ids = { A: `CAUSE-${RUN}-A` };
let blocked = "";
const need = (ctx: any) => { if (blocked) ctx.skip(blocked); };

const admin = async (path: string, method: string, body?: any) => {
  const mod: any = await import(path);
  return mod[method](new NextRequest(`http://t/${path.replace("@/", "")}`, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }));
};
const saveCause = (id: string, status: string) =>
  admin("@/app/api/admin/programs/route", "POST", { id, kind: "cause", title: `${RUN} ${id.slice(-1)} _IntegrationTest`, category: "Relief", targetAmount: 1000, status, description: "Synthetic queue measurement.", content: { template: "relief" } });

beforeAll(async () => {
  const target = (process.env.GOOGLE_TEST_SHEET_ID || "").trim();
  if (target !== APPROVED) blocked = "BLOCKED: GOOGLE_TEST_SHEET_ID is not the approved test spreadsheet.";
  else if (PRODUCTION === APPROVED || !PRODUCTION) blocked = "BLOCKED: cannot tell production and test apart.";
  else {
    const sa = JSON.parse((await import("fs")).readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS!, "utf8"));
    const raw = google.sheets({ version: "v4", auth: new google.auth.JWT({ email: sa.client_email, key: sa.private_key, scopes: ["https://www.googleapis.com/auth/spreadsheets"] }) });
    const meta = await raw.spreadsheets.get({ spreadsheetId: APPROVED, fields: "sheets.properties.title" });
    if (!(meta.data.sheets || []).some((s) => s.properties?.title === "_IntegrationTest")) blocked = "BLOCKED: the test spreadsheet has no _IntegrationTest marker tab.";
  }
  if (blocked) return;
  process.env.GOOGLE_SHEET_ID = APPROVED;
  process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID = "";
  process.env.GOOGLE_TARGET_ENV = "test";
  process.env.GOOGLE_SHEETS_MAX_WAIT_MS = process.env.LIVE_MAX_WAIT_MS || "240000";
  if (process.env.LIVE_COORDINATOR_URL) {
    const { createBackendFromEnv, setLimiterBackend } = await import("@/lib/google/requestControl");
    setLimiterBackend(createBackendFromEnv({ GOOGLE_LIMITER_REDIS_REST_URL: process.env.LIVE_COORDINATOR_URL, GOOGLE_LIMITER_REDIS_REST_TOKEN: process.env.LIVE_COORDINATOR_TOKEN, GOOGLE_LIMITER_KEY_PREFIX: "live:d37", GOOGLE_SERVICE_ACCOUNT_EMAIL: "live-d37@invalid" } as any));
  }
}, 120_000);

const N = Number(process.env.D37_N || 12);
const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] : 0; };
const sec = (ms: number) => (ms / 1000).toFixed(1);

const intakeInstance = async () => {
  vi.resetModules();
  const m = await import("@/lib/intake/intakeService");
  return (i: number, key: string, amount = 100 + i) =>
    m.acceptDonation({ donorName: `${RUN} Donor ${i}`, donorContact: `${RUN.toLowerCase()}-${i}@example.invalid`, amount, selectedCauses: [{ causeId: ids.A }], screenshotBuffer: Buffer.from([137, 80, 78, 71]), screenshotFilename: "p.png", screenshotMimeType: "image/png", submissionKey: key });
};
const finaliserInstance = async (opts: Record<string, any> = {}) => {
  vi.resetModules();
  const m = await import("@/lib/intake/finaliser");
  return () => m.runFinaliserPass(opts);
};
const col = async (tab: string) => {
  const sa = JSON.parse((await import("fs")).readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS!, "utf8"));
  const raw = google.sheets({ version: "v4", auth: new google.auth.JWT({ email: sa.client_email, key: sa.private_key, scopes: ["https://www.googleapis.com/auth/spreadsheets"] }) });
  const r = await raw.spreadsheets.values.get({ spreadsheetId: APPROVED, range: `'${tab}'` });
  const [h, ...rows] = (r.data.values || []) as string[][];
  return rows.map((row) => Object.fromEntries(h.map((k, i) => [k, row[i] ?? ""])));
};
const usage = () => {
  const u: any = googleUsageSnapshot();
  const labels = Object.entries(u.byLabel as Record<string, { calls: number }>).map(([l, c]) => `${l.replace(/^Sheets /, "")} x${c.calls}`).join("; ");
  return { reads: u.byKind.read, writes: u.byKind.write, retries: u.byKind.retries, q429: u.total.quotaRejections, labels };
};
async function drainLive(opts: Record<string, any> = {}, maxPasses = 12) {
  let passes = 0;
  let last: any;
  for (; passes < maxPasses; passes++) {
    const run = await finaliserInstance(opts);
    last = await run();
    if (last.skipped === "idle") break;
  }
  return { passes, last };
}
/** Integrity of the records created for these references, read raw from Google (not through the application). */
async function integrity(refs: string[]) {
  const [don, dc, intake] = await Promise.all([col("Donations"), col("Donation_Causes"), col("Donation_Intake")]);
  const mine = don.filter((d) => refs.includes(String(d.submissionRef)));
  const idsMine = mine.map((d) => d.id);
  const allIds = don.filter((d) => /^DA\d+$/.test(String(d.id))).map((d) => d.id);
  const rowsForRefs = intake.filter((r) => refs.includes(r.submissionRef));
  return {
    donationRows: mine.length,
    distinctRefs: new Set(mine.map((d) => d.submissionRef)).size,
    distinctIds: new Set(idsMine).size,
    idsUniqueInWholeSheet: new Set(allIds).size === allIds.length,
    // only rows of THIS run (the shared test sheet still holds an old PENDING placeholder from earlier sessions); the queued path creates none
    pending: don.filter((d) => d.id === "PENDING" && String(d.submissionKey || "").startsWith(RUN)).length,
    notComplete: mine.filter((d) => d.opStatus !== "complete").length,
    designations: dc.filter((d) => idsMine.includes(d.donationId)).length,
    donors: new Set(mine.map((d) => d.donorId)).size,
    intakeStates: Object.fromEntries([...new Set(rowsForRefs.map((r) => r.state))].map((s) => [s, rowsForRefs.filter((r) => r.state === s).length])),
    payloadsScrubbed: rowsForRefs.filter((r) => r.state === "COMPLETE").every((r) => r.payload === ""),
    completionMs: rowsForRefs.filter((r) => r.state === "COMPLETE" && r.completedAt && r.receivedAt).map((r) => new Date(r.completedAt).getTime() - new Date(r.receivedAt).getTime()),
  };
}
const show = (inv: any) => JSON.stringify({ ...inv, completionMs: undefined });

describe("D37 LIVE queued intake and finaliser (real Google, approved test sheet)", () => {
  it("1 submission: RECEIVED then COMPLETE; request counts", async (ctx) => {
    need(ctx);
    expect((await saveCause(ids.A, "Active")).status).toBe(200);
    const acc = await intakeInstance();
    resetGoogleUsage();
    const t0 = Date.now();
    const r = await acc(0, `${RUN}-ONE`);
    const intakeMs = Date.now() - t0;
    const u1 = usage();
    resetGoogleUsage();
    const f0 = Date.now();
    const { passes } = await drainLive();
    const u2 = usage();
    const inv = await integrity([r.reference]);
    console.log(`D37 LIVE N=1: intake ${sec(intakeMs)} s (R ${u1.reads} W ${u1.writes}) | finaliser ${passes} pass(es) ${sec(Date.now() - f0)} s (R ${u2.reads} W ${u2.writes} 429s ${u2.q429}) | ${show(inv)} | completion ${sec(inv.completionMs[0] || 0)} s`);
    expect(inv.donationRows).toBe(1);
    expect(inv.intakeStates).toEqual({ COMPLETE: 1 });
    expect(inv.notComplete).toBe(0);
  }, 300_000);

  it(`${N} simultaneous submissions from ${N} independent instances: intake inside the window, then finalisation`, async (ctx) => {
    need(ctx);
    expect((await saveCause(ids.A, "Active")).status).toBe(200); // idempotent: the test must not depend on an earlier test
    const inst: any[] = [];
    for (let i = 0; i < N; i++) inst.push(await intakeInstance());
    resetGoogleUsage();
    const t0 = Date.now();
    const res = await Promise.all(inst.map(async (acc, i) => { const s = Date.now(); const r = await acc(i + 1, `${RUN}-B${N}-${i}`); return { r, ms: Date.now() - s }; }));
    const wall = Date.now() - t0;
    const u1 = usage();
    const lat = res.map((x) => x.ms);
    const refs = res.map((x) => x.r.reference);
    console.log(`D37 LIVE intake N=${N}: wall ${sec(wall)} s | accepted ${res.length}/${N} | latency s P50 ${sec(pct(lat, 50))} P95 ${sec(pct(lat, 95))} P99 ${sec(pct(lat, 99))} max ${sec(Math.max(...lat))} | within 60 s ${lat.filter((x) => x <= 60_000).length}/${N} | reads ${u1.reads} writes ${u1.writes} retries ${u1.retries} 429s ${u1.q429} | reads/submission ${(u1.reads / N).toFixed(2)} writes/submission ${(u1.writes / N).toFixed(2)} | labels: ${u1.labels}`);
    const intakeRows = (await col("Donation_Intake")).filter((r) => refs.includes(r.submissionRef));
    expect(intakeRows.length).toBe(N); // no lost accepted submission
    resetGoogleUsage();
    const f0 = Date.now();
    const { passes } = await drainLive({ maxBatch: 25 });
    const fwall = Date.now() - f0;
    const u2 = usage();
    const inv = await integrity(refs);
    const comp = inv.completionMs;
    console.log(`D37 LIVE finalise N=${N}: ${passes} pass(es) ${sec(fwall)} s | reads ${u2.reads} writes ${u2.writes} retries ${u2.retries} 429s ${u2.q429} | per donation R ${(u2.reads / N).toFixed(2)} W ${(u2.writes / N).toFixed(2)} | completion latency s P50 ${sec(pct(comp, 50))} P95 ${sec(pct(comp, 95))} P99 ${sec(pct(comp, 99))} | throughput ${(N / (fwall / 60000)).toFixed(0)} donations/min`);
    console.log(`D37 LIVE integrity N=${N}: ${show(inv)}`);
    expect(inv.donationRows).toBe(N);
    expect(inv.distinctRefs).toBe(N);
    expect(inv.distinctIds).toBe(N);
    expect(inv.idsUniqueInWholeSheet).toBe(true);
    expect(inv.pending).toBe(0);
    expect(inv.notComplete).toBe(0);
    expect(inv.designations).toBe(N);
    expect(inv.donors).toBe(N);
  }, 560_000);

  it("duplicate submissions: 5 instances send the SAME key at once, 2 workers run at once without a lease: one donation", async (ctx) => {
    need(ctx);
    const inst: any[] = [];
    for (let i = 0; i < 5; i++) inst.push(await intakeInstance());
    const key = `${RUN}-DUP`;
    const acc = await Promise.all(inst.map((a) => a(900, key, 777)));
    const refs = [...new Set(acc.map((a) => a.reference))];
    const w1 = await finaliserInstance({ useLease: false });
    const w2 = await finaliserInstance({ useLease: false });
    await Promise.all([w1(), w2()]);
    await drainLive({ useLease: false });
    const inv = await integrity(refs);
    const rows = (await col("Donation_Intake")).filter((r) => refs.includes(r.submissionRef));
    console.log(`D37 LIVE duplicates: references ${refs.length} | intake rows ${rows.length} | states ${JSON.stringify(inv.intakeStates)} | donation rows ${inv.donationRows} | designations ${inv.designations} | donors ${inv.donors}`);
    expect(refs).toHaveLength(1);
    expect(inv.donationRows).toBe(1);
    expect(inv.designations).toBe(1);
    expect(inv.notComplete).toBe(0);
  }, 400_000);

  it("worker crash after assigning the id, then after follow-ups: recovery completes everything exactly once", async (ctx) => {
    need(ctx);
    const acc = await intakeInstance();
    const refs = (await Promise.all([1, 2, 3].map((i) => acc(800 + i, `${RUN}-CR${i}`)))).map((r) => r.reference);
    for (const crashAt of ["donations-verified", "followups-written"]) {
      const run = await finaliserInstance({ hooks: { stage: (n: string) => { if (n === crashAt) throw new Error(`crash@${n}`); } } });
      const r = await run();
      console.log(`D37 LIVE crash@${crashAt}: category ${r.errorCategory} retryScheduled ${r.retryScheduled}`);
    }
    const { passes } = await drainLive();
    const inv = await integrity(refs);
    const notif = (await col("Notifications")).filter((n) => refs.some((r) => n.id === `NOTIF-${r}`));
    const audit = (await col("Audit_Log")).filter((a) => refs.some((r) => a.event_id === `AUDIT-${r}-SUBMIT`));
    console.log(`D37 LIVE recovery: ${passes} pass(es) | ${show(inv)} | notifications ${notif.length} audits ${audit.length}`);
    expect(inv.donationRows).toBe(3);
    expect(inv.designations).toBe(3);
    expect(inv.notComplete).toBe(0);
    expect(notif.length).toBe(3);
    expect(audit.length).toBe(3);
  }, 400_000);

  it("stale worker: A stalls after its snapshot, B finishes, an administrator verifies, A wakes up: no duplicate rows, status kept", async (ctx) => {
    need(ctx);
    const acc = await intakeInstance();
    const refs = (await Promise.all([1, 2].map((i) => acc(700 + i, `${RUN}-ST${i}`)))).map((r) => r.reference);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let reached!: () => void;
    const at = new Promise<void>((r) => (reached = r));
    const runA = await finaliserInstance({ useLease: false, hooks: { stage: async (n: string) => { if (n === "planned") { reached(); await gate; } } } });
    const pa = runA();
    await at;
    await drainLive({ useLease: false }); // B (a fresh module graph) completes the whole batch
    const done = (await col("Donations")).filter((d) => refs.includes(String(d.submissionRef)));
    const target = done[0].id;
    vi.resetModules();
    const { donationRepository } = await import("@/lib/repositories/donationRepository");
    await donationRepository.updateStatus(target, "completed");
    release();
    const ra = await pa;
    await drainLive({ useLease: false });
    const inv = await integrity(refs);
    const after = (await col("Donations")).find((d) => d.id === target) as any;
    console.log(`D37 LIVE stale worker: A result ${JSON.stringify({ assigned: ra.assigned, completed: ra.completed, aborted: ra.aborted })} | ${show(inv)} | verified donation still "${after.status}"`);
    expect(inv.donationRows).toBe(2);
    expect(inv.distinctIds).toBe(2);
    expect(inv.designations).toBe(2);
    expect(inv.notComplete).toBe(0);
    expect(after.status).toBe("completed");
  }, 400_000);
});
