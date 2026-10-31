/**
 * LIVE Google request-count measurement on the APPROVED TEST SPREADSHEET ONLY (quota cost per operation).
 * Run: npx vitest run --config vitest.live.config.ts tests/live/quota-cost.live.test.ts
 * Same safety model as final-acceptance.live.test.ts: refuses unless the sheet is the approved id, differs from production and has
 * the `_IntegrationTest` marker; e-mail, Drive uploads, realtime and Firebase are stubbed. Counts come from lib/google/usage
 * (labels and numbers only; no ids and no record data are printed).
 */
import "./env";
import { describe, it, expect, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { google } from "googleapis";
import { googleUsageSnapshot, resetGoogleUsage } from "@/lib/google/usage";

const APPROVED = "1sGVsMEQDI1WmjWdUTQ0eKOzZC34Ri9CLsf4uUUceGzM";
const PRODUCTION = (process.env.GOOGLE_SHEET_ID || "").trim();

vi.mock("@/lib/server/auth", async () => {
  const { NextResponse } = await import("next/server");
  const admin = { kind: "admin", uid: "live-quota", email: "live-quota@example.invalid" };
  return { requireAdmin: async () => admin, requireAgent: async () => NextResponse.json({}, { status: 401 }), requireAdminOrAgent: async () => admin };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendDonationEmail: vi.fn(async () => ({ sent: false, skipped: "live test: e-mail disabled" })) }));
vi.mock("@/lib/email/providerManager", () => ({ sendEmail: vi.fn(async () => { throw new Error("live test: e-mail disabled"); }), verifyEmailProvider: vi.fn(async () => false) }));
vi.mock("@/lib/google/drive", () => ({ driveService: { uploadFile: vi.fn(async () => ({ drive_file_id: "STUB-NO-REAL-UPLOAD", backend: "stub" })), deleteFile: vi.fn(async () => undefined) } }));
vi.mock("@/lib/realtime/broadcaster", () => ({ realtimeBroadcaster: { publish: vi.fn(async () => ({ delivered: "log" })), publishBatch: vi.fn(async () => ({ delivered: "log" })), broadcast: vi.fn() } }));

const RUN = `ZZ_QUOTA_${Date.now().toString(36)}`;
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
  process.env.GOOGLE_SHEETS_MAX_WAIT_MS = "240000"; // live suites model one busy process: let the limiter queue instead of answering "busy"
}, 120_000);

const rows: string[] = [];
/** Runs fn and records how many Google API attempts it made (labels only). */
async function measure<T>(name: string, fn: () => Promise<T>): Promise<T> {
  resetGoogleUsage();
  const out = await fn();
  const snap = googleUsageSnapshot();
  const isRead = (l: string) => /read rows|get headers|batch read|get spreadsheet|locate|event log/i.test(l);
  let reads = 0, writes = 0, failed = 0;
  for (const [l, c] of Object.entries(snap.byLabel)) {
    if (isRead(l)) reads += c.calls; else writes += c.calls;
    failed += c.failures;
  }
  rows.push(`${name.padEnd(36)} reads=${String(reads).padStart(2)} writes=${String(writes).padStart(2)} total=${String(snap.total.calls).padStart(2)} retried/failed=${failed} 429=${snap.total.quotaRejections}`);
  // D36: which request labels make up the count (labels and numbers only)
  rows.push("    " + Object.entries(snap.byLabel).map(([l, c]) => `${l.replace(/^Sheets /, "")} x${c.calls}`).join("; "));
  return out;
}

describe("LIVE Google request counts per operation (approved test sheet)", () => {
  it("measures the representative workflows", async (ctx) => {
    need(ctx);
    for (const id of Object.values(ids)) expect((await saveCause(id, "Active")).status).toBe(200);
    const first = await measure("valid new donation (single cause)", () => donate([ids.A], 100));
    expect(first.status).toBe(200);
    const don = first.body.trackingId;
    const second = await measure("valid donation, same donor again", () => donate([ids.B], 50));
    expect(second.status).toBe(200);
    const general = await measure("valid GENERAL donation (no cause)", () => donate([], 30));
    expect(general.status).toBe(200);
    expect((await saveCause(ids.C, "Completed")).status).toBe(200);
    expect((await measure("rejected ineligible donation", () => donate([ids.C], 25))).status).toBe(400);
    expect((await measure("verification (status change)", () => admin("@/app/api/admin/donations/route", "PATCH", { id: don, status: "completed" }))).status).toBe(200);
    expect((await measure("valid allocation", () => admin("@/app/api/admin/allocations/route", "POST", { donationId: don, causeId: ids.A, amount: 40, requestKey: `${RUN}-a` }))).status).toBe(200);
    expect((await measure("rejected allocation (over limit)", () => admin("@/app/api/admin/allocations/route", "POST", { donationId: don, causeId: ids.A, amount: 500, requestKey: `${RUN}-b` }))).status).toBe(409);
    expect((await measure("dashboard", () => admin("@/app/api/admin/dashboard/route", "GET"))).status).toBe(200);
    expect((await measure("reconciliation", () => admin("@/app/api/admin/reconciliation/route", "GET"))).status).toBe(200);
    console.log(["GOOGLE REQUESTS PER OPERATION", ...rows].join("\n"));
  }, 240_000);
});
