/**
 * LIVE final-code financial acceptance on the APPROVED TEST SPREADSHEET ONLY.
 * Run: npx vitest run --config vitest.live.config.ts tests/live/final-acceptance.live.test.ts
 *
 * Safety: refuses to run unless GOOGLE_TEST_SHEET_ID is the approved id, differs from GOOGLE_SHEET_ID (production) and the sheet
 * carries the `_IntegrationTest` marker tab; the app then sees ONLY the test sheet. Drive, e-mail, realtime fan-out and
 * Firebase are replaced by stubs: no file is uploaded and NO e-mail can be sent. Records are synthetic (ZZ_FINAL_<run>).
 */
import "./env";
import { describe, it, expect, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { google } from "googleapis";

const APPROVED = "1sGVsMEQDI1WmjWdUTQ0eKOzZC34Ri9CLsf4uUUceGzM";
const PRODUCTION = (process.env.GOOGLE_SHEET_ID || "").trim();

vi.mock("@/lib/server/auth", async () => {
  const { NextResponse } = await import("next/server");
  const admin = { kind: "admin", uid: "live-final", email: "live-final@example.invalid" };
  return { requireAdmin: async () => admin, requireAgent: async () => NextResponse.json({}, { status: 401 }), requireAdminOrAgent: async () => admin };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendDonationEmail: vi.fn(async () => ({ sent: false, skipped: "live test: e-mail disabled" })) }));
vi.mock("@/lib/email/providerManager", () => ({ sendEmail: vi.fn(async () => { throw new Error("live test: e-mail disabled"); }), verifyEmailProvider: vi.fn(async () => false) }));
vi.mock("@/lib/google/drive", () => ({ driveService: { uploadFile: vi.fn(async () => ({ drive_file_id: "STUB-NO-REAL-UPLOAD", backend: "stub" })), deleteFile: vi.fn(async () => undefined) } }));
vi.mock("@/lib/realtime/broadcaster", () => ({ realtimeBroadcaster: { publish: vi.fn(async () => ({ delivered: "log" })), publishBatch: vi.fn(async () => ({ delivered: "log" })), broadcast: vi.fn() } }));

const RUN = `ZZ_FINAL_${Date.now().toString(36)}`;
const ids = { A: `CAUSE-${RUN}-A`, B: `CAUSE-${RUN}-B`, C: `CAUSE-${RUN}-C` };
let blocked = "";
let raw: ReturnType<typeof google.sheets>;
const need = (ctx: any) => { if (blocked) ctx.skip(blocked); };

const j = (res: Response) => res.json() as Promise<any>;
const admin = async (path: string, method: string, body?: any) => {
  const mod: any = await import(path);
  return mod[method](new NextRequest(`http://t/${path.replace("@/", "")}`, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }));
};
const saveCause = (id: string, status: string) =>
  admin("@/app/api/admin/programs/route", "POST", { id, kind: "cause", title: `${RUN} ${id.slice(-1)} _IntegrationTest`, category: "Relief", targetAmount: 1000, status, description: "Synthetic final acceptance.", content: { template: "relief" } });
let n = 0;
const donate = async (selected: string[], amount: number) => {
  const { POST } = await import("@/app/api/donate/route");
  const fd = new FormData();
  for (const [k, v] of Object.entries({ donorName: `${RUN} Donor`, donorContact: `${RUN.toLowerCase()}@example.invalid`, amount: String(amount), selectedCauses: JSON.stringify(selected.map((causeId) => ({ causeId }))) })) fd.set(k, v);
  fd.set("screenshot", new File([new Uint8Array([137, 80, 78, 71])], "p.png", { type: "image/png" }));
  const res = await POST(new NextRequest("http://t/api/donate", { method: "POST", body: fd, headers: { "x-forwarded-for": `10.9.${++n}.${Math.floor(Math.random() * 250)}` } }));
  return { status: res.status, body: await j(res) };
};
const col = async (tab: string) => {
  const r = await raw.spreadsheets.values.get({ spreadsheetId: APPROVED, range: `'${tab}'` });
  const [h, ...rows] = (r.data.values || []) as string[][];
  return rows.map((row) => Object.fromEntries(h.map((k, i) => [k, row[i] ?? ""])));
};

beforeAll(async () => {
  const sa = JSON.parse((await import("fs")).readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS!, "utf8"));
  raw = google.sheets({ version: "v4", auth: new google.auth.JWT({ email: sa.client_email, key: sa.private_key, scopes: ["https://www.googleapis.com/auth/spreadsheets"] }) });
  const target = (process.env.GOOGLE_TEST_SHEET_ID || "").trim();
  if (target !== APPROVED) blocked = "BLOCKED: GOOGLE_TEST_SHEET_ID is not the approved test spreadsheet.";
  else if (PRODUCTION === APPROVED || !PRODUCTION) blocked = "BLOCKED: cannot tell production and test apart.";
  else {
    const meta = await raw.spreadsheets.get({ spreadsheetId: APPROVED, fields: "sheets.properties.title" });
    if (!(meta.data.sheets || []).some((s) => s.properties?.title === "_IntegrationTest")) blocked = "BLOCKED: the test spreadsheet has no _IntegrationTest marker tab.";
  }
  if (blocked) return;
  process.env.GOOGLE_SHEET_ID = APPROVED;
  process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID = "";
  process.env.GOOGLE_TARGET_ENV = "test";
  process.env.GOOGLE_SHEETS_MAX_WAIT_MS = "240000"; // live suites model one busy process: let the limiter queue instead of answering "busy"
  if (process.env.LIVE_COORDINATOR_URL) {
    // D26: route the limiter through the coordinator PROCESS (tools/limiter-server) started separately on this machine (not a hosted deployment).
    const { createBackendFromEnv, setLimiterBackend } = await import("@/lib/google/requestControl");
    setLimiterBackend(createBackendFromEnv({ GOOGLE_LIMITER_REDIS_REST_URL: process.env.LIVE_COORDINATOR_URL, GOOGLE_LIMITER_REDIS_REST_TOKEN: process.env.LIVE_COORDINATOR_TOKEN, GOOGLE_LIMITER_KEY_PREFIX: "live:d26", GOOGLE_SERVICE_ACCOUNT_EMAIL: "live-test-identity" }));
  }
  const { inspectGoogleConfig } = await import("@/lib/google/config");
  const cfg = inspectGoogleConfig();
  console.log("effective target fingerprint:", cfg.spreadsheet.fingerprint, "| declared:", cfg.declaredTarget, "| production fingerprint differs:", PRODUCTION.slice(-6) !== APPROVED.slice(-6));
  expect(cfg.spreadsheet.fingerprint).toBe("…" + APPROVED.slice(-6));
}, 120_000);

describe("LIVE final code on the approved test spreadsheet", () => {
  it("creates three causes (Draft is not donatable, Active is)", async (ctx) => {
    need(ctx);
    for (const id of Object.values(ids)) expect((await saveCause(id, "Draft")).status).toBe(200);
    const draft = await donate([ids.A], 50);
    expect(draft.status).toBe(400);
    for (const id of Object.values(ids)) expect((await saveCause(id, "Active")).status).toBe(200);
  }, 120_000);

  let don1 = "";
  it("single-cause donation: pending until verified; allocation refused while pending", async (ctx) => {
    need(ctx);
    const d = await donate([ids.A], 100);
    expect(d.status).toBe(200);
    don1 = d.body.trackingId || d.body.donationId || d.body.id;
    console.log("donation 1:", don1);
    const pend = await admin("@/app/api/admin/allocations/route", "POST", { donationId: don1, causeId: ids.A, amount: 10, requestKey: `${RUN}-p` });
    expect(pend.status).toBe(409);
  }, 120_000);

  it("verification, valid allocation, idempotent replay, concurrency cap, over-allocation, reversal", async (ctx) => {
    need(ctx);
    expect((await admin("@/app/api/admin/donations/route", "PATCH", { id: don1, status: "completed" })).status).toBe(200);
    const a1 = await j(await admin("@/app/api/admin/allocations/route", "POST", { donationId: don1, causeId: ids.A, amount: 60, requestKey: `${RUN}-a1` }));
    expect(a1.success).toBe(true);
    const replay = await j(await admin("@/app/api/admin/allocations/route", "POST", { donationId: don1, causeId: ids.A, amount: 60, requestKey: `${RUN}-a1` }));
    expect(replay).toMatchObject({ duplicate: true });
    expect(replay.allocation.id).toBe(a1.allocation.id);
    expect((await admin("@/app/api/admin/allocations/route", "POST", { donationId: don1, causeId: ids.A, amount: 41, requestKey: `${RUN}-over` })).status).toBe(409);
    const both = await Promise.all([30, 30].map((amount, i) => admin("@/app/api/admin/allocations/route", "POST", { donationId: don1, causeId: ids.A, amount, requestKey: `${RUN}-c${i}` })));
    expect(both.map((r) => r.status).sort()).toEqual([200, 409]);
    const rev = await j(await admin("@/app/api/admin/allocations/route", "PATCH", { id: a1.allocation.id, reason: "final acceptance reversal" }));
    expect(rev.allocation.status).toBe("reversed");
    expect((await admin("@/app/api/admin/allocations/route", "PATCH", { id: a1.allocation.id, reason: "" })).status).toBe(400);
  }, 180_000);

  it("a cause that becomes Completed refuses new donations; an unknown id is refused; neither writes a donation", async (ctx) => {
    need(ctx);
    const before = (await col("Donations")).filter((d) => String(d.donorName).startsWith(RUN)).length;
    expect((await saveCause(ids.A, "Completed")).status).toBe(200);
    const refused = await donate([ids.A], 25);
    console.log("completed-cause donate:", refused.status, JSON.stringify(refused.body).slice(0, 200));
    expect(refused.status).toBe(400);
    expect((await donate([`${ids.A}-NOPE`], 25)).status).toBe(400);
    const after = (await col("Donations")).filter((d) => String(d.donorName).startsWith(RUN)).length;
    expect(after).toBe(before);
  }, 120_000);

  let don2 = "";
  it("multi-cause donation: designations stay UNRESOLVED (no invented split); explicit split reconciles to the donation; invalid splits refused", async (ctx) => {
    need(ctx);
    const d = await donate([ids.B, ids.C], 300);
    expect(d.status).toBe(200);
    don2 = d.body.trackingId || d.body.donationId || d.body.id;
    const rows = (await col("Donation_Causes")).filter((r) => r.donationId === don2);
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(r.designationStatus).toBe("unresolved");
    const bad = [
      [{ causeId: ids.B, amount: 200 }, { causeId: ids.C, amount: 200 }],
      [{ causeId: ids.B, amount: 350 }, { causeId: ids.C, amount: -50 }],
      [{ causeId: ids.B, amount: 300 }],
    ];
    for (const split of bad) expect((await admin("@/app/api/admin/designations/route", "PUT", { donationId: don2, split })).status).toBeGreaterThanOrEqual(400);
    expect((await col("Donation_Causes")).filter((r) => r.donationId === don2).every((r) => r.designationStatus === "unresolved")).toBe(true);
    const ok = await admin("@/app/api/admin/designations/route", "PUT", { donationId: don2, split: [{ causeId: ids.B, amount: 200 }, { causeId: ids.C, amount: 100 }] });
    expect(ok.status).toBe(200);
    const fin = (await col("Donation_Causes")).filter((r) => r.donationId === don2);
    expect(fin.reduce((s, r) => s + Number(r.designatedAmount), 0)).toBe(300);
  }, 180_000);

  it("independent recount from the stored records equals what the application reports", async (ctx) => {
    need(ctx);
    expect((await admin("@/app/api/admin/donations/route", "PATCH", { id: don2, status: "completed" })).status).toBe(200);
    const [donations, designations, allocations] = await Promise.all([col("Donations"), col("Donation_Causes"), col("Allocations")]);
    const mine = donations.filter((d) => String(d.donorName).startsWith(RUN));
    const verified = mine.filter((d) => d.status === "completed");
    const expected: Record<string, number> = {};
    for (const dsg of designations) {
      const don = verified.find((d) => d.id === dsg.donationId);
      if (don && Object.values(ids).includes(dsg.causeId)) expected[dsg.causeId] = (expected[dsg.causeId] || 0) + Number(dsg.designatedAmount || 0);
    }
    const catalog: any[] = await j(await admin("@/app/api/causes/route", "GET"));
    console.log("expected verified designated per cause:", JSON.stringify(expected), "| app:", JSON.stringify(Object.fromEntries(Object.values(ids).map((id) => [id.slice(-1), catalog.find((c) => c.id === id)?.raisedAmount]))));
    for (const [id, amount] of Object.entries(expected)) expect(catalog.find((c) => c.id === id)?.raisedAmount).toBe(amount);
    const active = allocations.filter((a) => a.donationId === don1 && a.status === "active").reduce((s, a) => s + Number(a.allocatedAmount), 0);
    expect(active).toBeLessThanOrEqual(100);
    const recon = await j(await admin("@/app/api/admin/reconciliation/route", "GET"));
    const mineIds = new Set(mine.map((d) => d.id));
    expect((recon.exceptions || []).filter((e: any) => mineIds.has(e.entityId))).toEqual([]);
  }, 180_000);
});
