/**
 * LIVE Google request-count measurement on the APPROVED TEST SPREADSHEET ONLY (quota cost per operation).
 * Run: npx vitest run --config vitest.live.config.ts tests/live/hold-overdue.live.test.ts
 * TEST_CLOCK_OFFSET_DAYS shifts the server clock only for a process already authorised to write to the approved test resources. Refuses unless the sheet is the approved id, differs from production and has
 * the `_IntegrationTest` marker; e-mail, Drive uploads, realtime and Firebase are stubbed. 
 */
import "./env";
import { describe, it, expect, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { google } from "googleapis";

const APPROVED = "1sGVsMEQDI1WmjWdUTQ0eKOzZC34Ri9CLsf4uUUceGzM";
const PRODUCTION = (process.env.GOOGLE_SHEET_ID || "").trim();

vi.mock("@/lib/server/auth", async () => {
  const { NextResponse } = await import("next/server");
  const admin = { kind: "admin", uid: "live-hold", email: "live-hold@example.invalid" };
  return { requireAdmin: async () => admin, requireAgent: async () => NextResponse.json({}, { status: 401 }), requireAdminOrAgent: async () => admin };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendDonationEmail: vi.fn(async () => ({ sent: false, skipped: "live test: e-mail disabled" })) }));
vi.mock("@/lib/email/providerManager", () => ({ sendEmail: vi.fn(async () => { throw new Error("live test: e-mail disabled"); }), verifyEmailProvider: vi.fn(async () => false) }));
vi.mock("@/lib/google/drive", () => ({ driveService: { uploadFile: vi.fn(async () => ({ drive_file_id: "STUB-NO-REAL-UPLOAD", backend: "stub" })), deleteFile: vi.fn(async () => undefined) } }));
vi.mock("@/lib/realtime/broadcaster", () => ({ realtimeBroadcaster: { publish: vi.fn(async () => ({ delivered: "log" })), publishBatch: vi.fn(async () => ({ delivered: "log" })), broadcast: vi.fn() } }));

const RUN = `ZZ_HOLD_${Date.now().toString(36)}`;
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

const ID = `PROGRAM-${RUN}`;
const auditRows = async () => {
  const sa = JSON.parse((await import("fs")).readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS!, "utf8"));
  const raw = google.sheets({ version: "v4", auth: new google.auth.JWT({ email: sa.client_email, key: sa.private_key, scopes: ["https://www.googleapis.com/auth/spreadsheets"] }) });
  const r = await raw.spreadsheets.values.get({ spreadsheetId: APPROVED, range: "'Audit_Log'" });
  const [h, ...rows] = (r.data.values || []) as string[][];
  return rows.map((row) => Object.fromEntries(h.map((k, i) => [k, row[i] ?? ""]))).filter((a) => a.action === "CLEAR_PROJECT_HOLD" && a.entity_id === ID);
};
const publicPrograms = async () => {
  const { GET } = await import("@/app/api/programs/route");
  return (await (await GET(new NextRequest("http://t/api/programs?t=" + Date.now()))).json()) as any[];
};

describe("LIVE Masjid overdue hold (test clock)", () => {
  it("fresh update: donations accepted; +6 days: still accepted; +8 days: refused but still visible; clearance with a reason reopens", async (ctx) => {
    need(ctx);
    const save = await admin("@/app/api/admin/programs/route", "POST", { id: ID, kind: "project", title: `${RUN} Masjid _IntegrationTest`, category: "Masjid Infrastructure", targetAmount: 1000, status: "Active", description: "Synthetic hold test.", content: { template: "project", recordUpdate: true, updateNote: "Synthetic update" } });
    expect(save.status).toBe(200);

    process.env.TEST_CLOCK_OFFSET_DAYS = "0";
    expect((await donate([ID], 20)).status).toBe(200);

    process.env.TEST_CLOCK_OFFSET_DAYS = "6";
    expect((await donate([ID], 20)).status).toBe(200);

    process.env.TEST_CLOCK_OFFSET_DAYS = "8";
    const held = await donate([ID], 20);
    expect(held.status).toBe(400);
    expect(JSON.stringify(held.body)).toMatch(/on hold/i);
    const list = await publicPrograms();
    expect(list.some((p) => p.id === ID)).toBe(true); // still visible
    const { getPublicCatalog } = await import("@/lib/catalog/public");
    expect((await getPublicCatalog(Date.now() + 60_000)).some((c) => c.id === ID)).toBe(false); // not offered for donation (ribbon / form catalog)

    expect((await admin("@/app/api/admin/programs/hold/route", "POST", { programId: ID, reason: "" })).status).toBe(400);
    const cleared = await admin("@/app/api/admin/programs/hold/route", "POST", { programId: ID, reason: "Site visit confirmed (synthetic)" });
    expect(cleared.status).toBe(200);
    expect((await donate([ID], 20)).status).toBe(200); // reopened (still +8 days on the test clock, window restarted at clearance)
    expect((await admin("@/app/api/admin/programs/hold/route", "POST", { programId: ID, reason: "again, not held" })).status).toBe(409);

    const audit = await auditRows();
    expect(audit).toHaveLength(1);
    expect(JSON.parse(audit[0].after_state || "{}")).toMatchObject({ hold: "cleared", reason: "Site visit confirmed (synthetic)" });
    console.log("hold: accepted at +0 and +6, refused at +8 (400), cleared with audit entry, accepted after clearance");
  }, 240_000);

  it("exact boundary with a frozen clock: 7 days minus 1 ms accepted, exactly 7 days accepted, 7 days plus 1 ms refused", async (ctx) => {
    need(ctx);
    const BID = `${ID}-B`;
    delete process.env.TEST_CLOCK_OFFSET_DAYS;
    expect((await admin("@/app/api/admin/programs/route", "POST", { id: BID, kind: "project", title: `${RUN} Boundary _IntegrationTest`, category: "Masjid Infrastructure", targetAmount: 1000, status: "Active", description: "Synthetic boundary test.", content: { template: "project", recordUpdate: true } })).status).toBe(200);
    const { programContentRepository } = await import("@/lib/catalog/programContent");
    const stamp = Date.parse((await programContentRepository.getAll(true)).find((c) => c.id === BID)!.lastUpdateAt);
    expect(Number.isFinite(stamp)).toBe(true);
    const at = (ms: number) => { process.env.TEST_CLOCK_FIXED_ISO = new Date(stamp + 7 * 86_400_000 + ms).toISOString(); };
    at(-1);
    expect((await donate([BID], 20)).status).toBe(200);
    at(0);
    expect((await donate([BID], 20)).status).toBe(200); // exactly 7 days is still current
    at(1);
    const refused = await donate([BID], 20);
    expect(refused.status).toBe(400);
    expect(JSON.stringify(refused.body)).toMatch(/on hold/i);
    expect((await publicPrograms()).some((p) => p.id === BID)).toBe(true); // visibility preserved
    // other projects and General Causes are unaffected by this hold
    expect((await donate([], 20)).status).toBe(200);
    delete process.env.TEST_CLOCK_FIXED_ISO;
    console.log("boundary: -1ms accepted, exactly 7d accepted, +1ms refused (frozen test clock)");
  }, 240_000);

  it("the test clock is ignored when the process is not authorised for the test target (no effect on other processes)", async () => {
    const { serverNow } = await import("@/lib/catalog/clock");
    const before = Date.now();
    const shifted = serverNow({ TEST_CLOCK_OFFSET_DAYS: "30", NODE_ENV: "development" }).getTime(); // no label, no allowlisted sheet
    expect(Math.abs(shifted - before)).toBeLessThan(5000);
    expect(Math.abs(serverNow({ TEST_CLOCK_OFFSET_DAYS: "30", NODE_ENV: "production", GOOGLE_TARGET_ENV: "test", GOOGLE_SHEET_ID: APPROVED, GOOGLE_TEST_SHEET_ID: APPROVED }).getTime() - before)).toBeLessThan(5000);
  });
});
