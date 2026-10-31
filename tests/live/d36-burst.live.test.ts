/**
 * D36 LIVE burst on the APPROVED TEST SPREADSHEET ONLY: N simultaneous donations from N independent module graphs sharing ONE coordinator (LIVE_COORDINATOR_URL)
 * at the default 45/45 per minute. Records per-donation latency, request counts and 429s. Run with D36_N=6 or 12.
 * Same safety model as final-acceptance.live.test.ts: refuses unless the sheet is the approved id, differs from production and has
 * the `_IntegrationTest` marker; e-mail, Drive uploads, realtime and Firebase are stubbed.
 */
import "./env";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { googleUsageSnapshot, resetGoogleUsage } from "@/lib/google/usage";
import { google } from "googleapis";

const APPROVED = "1sGVsMEQDI1WmjWdUTQ0eKOzZC34Ri9CLsf4uUUceGzM";
const PRODUCTION = (process.env.GOOGLE_SHEET_ID || "").trim();

vi.mock("@/lib/server/auth", async () => {
  const { NextResponse } = await import("next/server");
  const admin = { kind: "admin", uid: "live-d36", email: "live-d36@example.invalid" };
  return { requireAdmin: async () => admin, requireAgent: async () => NextResponse.json({}, { status: 401 }), requireAdminOrAgent: async () => admin };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendDonationEmail: vi.fn(async () => ({ sent: false, skipped: "live test: e-mail disabled" })) }));
vi.mock("@/lib/email/providerManager", () => ({ sendEmail: vi.fn(async () => { throw new Error("live test: e-mail disabled"); }), verifyEmailProvider: vi.fn(async () => false) }));
vi.mock("@/lib/google/drive", () => ({ driveService: { uploadFile: vi.fn(async () => ({ drive_file_id: "STUB-NO-REAL-UPLOAD", backend: "stub" })), deleteFile: vi.fn(async () => undefined) } }));
vi.mock("@/lib/realtime/broadcaster", () => ({ realtimeBroadcaster: { publish: vi.fn(async () => ({ delivered: "log" })), publishBatch: vi.fn(async () => ({ delivered: "log" })), broadcast: vi.fn() } }));

const RUN = `ZZ_D36_${Date.now().toString(36)}`;
const ids = { A: `CAUSE-${RUN}-A`, B: `CAUSE-${RUN}-B`, C: `CAUSE-${RUN}-C` };
let blocked = "";
const need = (ctx: any) => { if (blocked) ctx.skip(blocked); };

const admin = async (path: string, method: string, body?: any) => {
  const mod: any = await import(path);
  return mod[method](new NextRequest(`http://t/${path.replace("@/", "")}`, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }));
};
const saveCause = (id: string, status: string) =>
  admin("@/app/api/admin/programs/route", "POST", { id, kind: "cause", title: `${RUN} ${id.slice(-1)} _IntegrationTest`, category: "Relief", targetAmount: 1000, status, description: "Synthetic quota measurement.", content: { template: "relief" } });
let n = 0;
const donate = async (selected: string[], amount: number) => {
  const { POST } = await import("@/app/api/donate/route");
  const fd = new FormData();
  for (const [k, v] of Object.entries({ donorName: `${RUN} Donor`, donorContact: `${RUN.toLowerCase()}@example.invalid`, amount: String(amount), selectedCauses: JSON.stringify(selected.map((causeId) => ({ causeId }))) })) fd.set(k, v);
  fd.set("screenshot", new File([new Uint8Array([137, 80, 78, 71])], "p.png", { type: "image/png" }));
  const res = await POST(new NextRequest("http://t/api/donate", { method: "POST", body: fd, headers: { "x-forwarded-for": `10.8.${++n}.${Math.floor(Math.random() * 250)}` } }));
  return { status: res.status, body: (await res.json()) as any };
};

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
  process.env.GOOGLE_SHEETS_MAX_WAIT_MS = process.env.LIVE_MAX_WAIT_MS || "240000"; // live suites model one busy process: let the limiter queue instead of answering "busy"
  if (process.env.LIVE_COORDINATOR_URL) {
    // D25: route the limiter through a coordinator PROCESS (tools/limiter-server) started separately on this machine; it is the real service program, not a hosted deployment.
    const { createBackendFromEnv, setLimiterBackend } = await import("@/lib/google/requestControl");
    setLimiterBackend(createBackendFromEnv({ GOOGLE_LIMITER_REDIS_REST_URL: process.env.LIVE_COORDINATOR_URL, GOOGLE_LIMITER_REDIS_REST_TOKEN: process.env.LIVE_COORDINATOR_TOKEN, GOOGLE_LIMITER_KEY_PREFIX: "live:d25", GOOGLE_SERVICE_ACCOUNT_EMAIL: "live-test-identity" }));
  }
  if (process.env.LIVE_EMULATED_COORDINATOR === "1") {
    // D21: route the limiter through a LOCAL EMULATED coordinator over HTTP (not a real Redis; nothing is provisioned).
    const { startFakeRedisRest } = await import("../helpers/fakeRedisRest");
    const { RedisRestLimiterBackend, setLimiterBackend } = await import("@/lib/google/requestControl");
    emulated = await startFakeRedisRest();
    setLimiterBackend(new RedisRestLimiterBackend({ url: emulated.url, token: emulated.token, keyPrefix: "live:emulated", timeoutMs: 1500, policy: "fail_closed", degradedShare: 0.25 }));
  }
}, 120_000);
let emulated: any = null;
afterAll(async () => {
  if (emulated) {
    console.log(`emulated coordinator: ${emulated.calls} reservation calls`);
    await emulated.stop();
  }
});

const instance = async () => {
  vi.resetModules();
  const { POST } = await import("@/app/api/donate/route");
  return async (cause: string, amount: number, submissionKey = "") => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ donorName: `${RUN} Donor`, donorContact: `${RUN.toLowerCase()}@example.invalid`, amount: String(amount), selectedCauses: JSON.stringify([{ causeId: cause }]) })) fd.set(k, v);
    if (submissionKey) fd.set("submissionKey", submissionKey);
    fd.set("screenshot", new File([new Uint8Array([137, 80, 78, 71])], "p.png", { type: "image/png" }));
    const res = await POST(new NextRequest("http://t/api/donate", { method: "POST", body: fd, headers: { "x-forwarded-for": `10.4.${++n}.${Math.floor(Math.random() * 250)}` } }));
    return { status: res.status, body: (await res.json()) as any };
  };
};
const col = async (tab: string) => {
  const sa = JSON.parse((await import("fs")).readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS!, "utf8"));
  const raw = google.sheets({ version: "v4", auth: new google.auth.JWT({ email: sa.client_email, key: sa.private_key, scopes: ["https://www.googleapis.com/auth/spreadsheets"] }) });
  const r = await raw.spreadsheets.values.get({ spreadsheetId: APPROVED, range: `'${tab}'` });
  const [h, ...rows] = (r.data.values || []) as string[][];
  return rows.map((row) => Object.fromEntries(h.map((k, i) => [k, row[i] ?? ""])));
};


const N = Number(process.env.D36_N || 6);
const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] : 0; };

describe("D36 LIVE burst: N simultaneous donations, shared coordinator, real Google (approved test sheet)", () => {
  it(`${N} simultaneous donations by ${N} distinct donors: completion time, latency distribution, request counts, integrity`, async (ctx) => {
    need(ctx);
    expect((await saveCause(ids.A, "Active")).status).toBe(200);
    const inst: any[] = [];
    for (let i = 0; i < N; i++) inst.push(await instance());
    const callAs = (call: any, i: number) => async () => {
      const t = Date.now();
      const r = await call(ids.A, 100 + i, `${RUN}-K${i}`);
      return { ...r, ms: Date.now() - t };
    };
    resetGoogleUsage();
    const t0 = Date.now();
    const res = await Promise.all(inst.map((c, i) => callAs(c, i)()));
    const wall = Date.now() - t0;
    const usage: any = googleUsageSnapshot();
    const ok = res.filter((r) => r.status === 200);
    const lat = res.map((r) => r.ms);
    console.log(`D36 LIVE N=${N}: wall ${Math.round(wall / 1000)} s | accepted ${ok.length}/${N} | statuses ${res.map((r) => r.status).join(",")} | latency s P50 ${(pct(lat, 50) / 1000).toFixed(1)} P95 ${(pct(lat, 95) / 1000).toFixed(1)} P99 ${(pct(lat, 99) / 1000).toFixed(1)} max ${(Math.max(...lat) / 1000).toFixed(1)} | within 60 s: ${lat.filter((x) => x <= 60_000).length}/${N} | reads ${usage.byKind.read} writes ${usage.byKind.write} retries ${usage.byKind.retries} 429s ${usage.total.quotaRejections} | limiter waited ${Math.round(usage.byKind.waitedMs / 1000)} s total, max single ${Math.round(usage.byKind.maxWaitMs / 1000)} s | reads/donation ${(usage.byKind.read / Math.max(1, ok.length)).toFixed(1)} writes/donation ${(usage.byKind.write / Math.max(1, ok.length)).toFixed(1)}`);
    const rows = (await col("Donations")).filter((d) => String(d.donorName).startsWith(RUN));
    const dcs = (await col("Donation_Causes")).filter((d) => ok.map((r) => r.body.trackingId).includes(d.donationId));
    const ids2 = rows.map((r) => r.id);
    console.log(`D36 LIVE integrity: ${rows.length} donation rows, ${new Set(ids2).size} distinct ids, ${rows.filter((r) => r.id === "PENDING").length} PENDING, ${dcs.length} designation rows for ${ok.length} accepted, partial=${ok.filter((r) => r.body.operationStatus === "partial").length}`);
    expect(new Set(ids2).size).toBe(ids2.length);
    expect(rows.filter((r) => r.id === "PENDING")).toHaveLength(0);
    expect(rows).toHaveLength(ok.length);
    expect(dcs).toHaveLength(ok.length);
  }, 560_000);
});
