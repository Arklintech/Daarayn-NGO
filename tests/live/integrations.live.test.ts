/**
 * LIVE integration tests (real Google Sheets, Google Drive, Gmail SMTP). Run: npm run test:live
 *
 * Safety:
 *  - never writes to the production spreadsheet: an isolated test spreadsheet is created (or
 *    GOOGLE_TEST_SHEET_ID is used) BEFORE any application module is imported, and the run aborts if
 *    that id equals the configured production GOOGLE_SHEET_ID;
 *  - Drive files go to a temporary "ZZ_Integration_Test" subfolder that is deleted afterwards;
 *  - donations use phone-only donors, so no donor e-mail is ever sent; the only e-mail goes to the
 *    SMTP account's own mailbox;
 *  - only Firebase auth is stubbed (we are testing Sheets/Drive/SMTP, not Firebase sign-in).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { google } from "googleapis";
import fs from "fs";

const auth = vi.hoisted(() => ({ role: "admin" as "admin" | "none" }));
vi.mock("@/lib/server/auth", async () => {
  const { NextResponse } = await import("next/server");
  const deny = () => NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  const admin = { kind: "admin", uid: "live-test", email: "live-test@example.invalid" };
  return {
    requireAdmin: async () => (auth.role === "admin" ? admin : deny()),
    requireAgent: async () => deny(),
    requireAdminOrAgent: async () => (auth.role === "admin" ? admin : deny()),
  };
});

const PRODUCTION_SHEET_ID = (process.env.GOOGLE_SHEET_ID || "").trim();
let TEST_FOLDER = (process.env.GOOGLE_DRIVE_TEST_FOLDER_ID || "").trim(); // isolated Drive folder; production is never used here
let tempFolderId = ""; // a temporary folder this run created (deleted afterwards)
let oauthDrive: any = null;
const SMTP_USER = (process.env.SMTP_USER || "").trim();
const RUN = `LIVE-${Date.now().toString(36)}`;

let testSheetId = "";
let blockedReason = "";
let createdSheet = false;
let smtpOk = false;
let driveOk = false;
const driveCleanup: string[] = [];
const needSheet = (ctx: any) => { if (!testSheetId) ctx.skip(blockedReason); };
let g: { sheets: ReturnType<typeof google.sheets>; drive: ReturnType<typeof google.drive>; jwt: any };
let sheetsSvc: any;
let driveSvc: any;
let uploaded: { id: string; backend?: string } | null = null;

function rawClients() {
  const sa = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS!, "utf8"));
  const jwt = new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"],
  });
  return { sheets: google.sheets({ version: "v4", auth: jwt }), drive: google.drive({ version: "v3", auth: jwt }), jwt };
}

beforeAll(async () => {
  expect(process.env.GOOGLE_APPLICATION_CREDENTIALS, "GOOGLE_APPLICATION_CREDENTIALS must be set").toBeTruthy();
  g = rawClients();

  if (process.env.GOOGLE_TEST_SHEET_ID) {
    testSheetId = process.env.GOOGLE_TEST_SHEET_ID.trim();
  } else {
    try {
      const res = await g.sheets.spreadsheets.create({ requestBody: { properties: { title: `DAARAYN INTEGRATION TEST ${RUN} (safe to delete)` } } });
      testSheetId = res.data.spreadsheetId!;
      createdSheet = true;
    } catch (err: any) {
      // The service account may not be allowed to create files. Without an isolated spreadsheet every
      // test that writes to Sheets is skipped (BLOCKED); production is never used as a substitute.
      blockedReason = `BLOCKED: cannot create a test spreadsheet (${err.message}). Share a COPY of the spreadsheet with the service account as Editor and set GOOGLE_TEST_SHEET_ID.`;
      console.warn(blockedReason);
    }
  }
  if (testSheetId && testSheetId === PRODUCTION_SHEET_ID) throw new Error("Refusing to run: the test spreadsheet must differ from production.");

  // Blank-sheet guard: a spreadsheet that already holds records (e.g. a copy of production) is never written to.
  // First use requires every tab to be empty; the marker tab "_IntegrationTest" then allows reruns.
  if (testSheetId) {
    const meta = await g.sheets.spreadsheets.get({ spreadsheetId: testSheetId, fields: "properties.title,sheets.properties.title" });
    const tabs = (meta.data.sheets || []).map((t) => t.properties?.title as string);
    if (!tabs.includes("_IntegrationTest")) {
      const counts = await g.sheets.spreadsheets.values.batchGet({ spreadsheetId: testSheetId, ranges: tabs.map((t) => `'${t}'!A:A`) });
      const populated = tabs.filter((_, i) => ((counts.data.valueRanges?.[i]?.values || []).length) > 1);
      if (populated.length > 0) {
        blockedReason = `BLOCKED: the test spreadsheet already contains data in tab(s) ${populated.join(", ")} (looks like a copy of production). Use a blank spreadsheet.`;
        testSheetId = "";
      } else {
        await g.sheets.spreadsheets.batchUpdate({ spreadsheetId: testSheetId, requestBody: { requests: [{ addSheet: { properties: { title: "_IntegrationTest" } } }] } });
      }
    }
  }

  // From here on every application module sees ONLY the isolated test spreadsheet.
  if (!TEST_FOLDER) {
    // No configured test folder: create a temporary one as the connected OAuth account (never the production folder).
    try {
      const oauth = await import("@/lib/google/driveOAuth");
      if (await oauth.loadRefreshToken()) {
        oauthDrive = await oauth.getDriveApi(true);
        const f = await oauthDrive.files.create({ requestBody: { name: `Daarayn e2e test ${RUN} (safe to delete)`, mimeType: "application/vnd.google-apps.folder" }, fields: "id" });
        tempFolderId = f.data.id;
        TEST_FOLDER = tempFolderId;
      }
    } catch (err: any) {
      console.warn(`Could not create a temporary Drive test folder: ${err.message}`);
    }
  }
  if (TEST_FOLDER && TEST_FOLDER === (process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || "").trim()) throw new Error("Refusing to run: the Drive test folder must differ from the production evidence folder.");
  process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID = TEST_FOLDER; // empty => Drive-dependent tests are skipped, production folder untouched
  const { approveTestResourceForThisProcess: approve } = await import("@/lib/google/approvedTargets");
  approve("sheet", testSheetId); // a throw-away sheet created by THIS run (the approved one is already on the allowlist)
  approve("folder", TEST_FOLDER);
  process.env.GOOGLE_TARGET_ENV = "test"; // the write guard: this process may only write to the declared test resources
  process.env.GOOGLE_TEST_SHEET_ID = testSheetId;
  process.env.GOOGLE_DRIVE_TEST_FOLDER_ID = TEST_FOLDER;
  process.env.GOOGLE_SHEET_ID = testSheetId; // empty when blocked, so the app can never fall back to production
  vi.resetModules();
  sheetsSvc = (await import("@/lib/google/sheets")).sheetsService;
  driveSvc = (await import("@/lib/google/drive")).driveService;
});

afterAll(async () => {
  for (const id of driveCleanup) await g.drive.files.delete({ fileId: id, supportsAllDrives: true }).catch(() => undefined);
  if (tempFolderId && oauthDrive) await oauthDrive.files.delete({ fileId: tempFolderId, supportsAllDrives: true }).catch(() => undefined);
  if (createdSheet && testSheetId) await g.drive.files.delete({ fileId: testSheetId, supportsAllDrives: true }).catch(() => undefined);
});

describe("LIVE: service-account authentication", () => {
  it("Google accepts the configured service-account JSON", async () => {
    const tokens = await g.jwt.authorize();
    expect(tokens.access_token).toBeTruthy();
  });

  it("the JSON is the intended service account and project (metadata only)", () => {
    const sa = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS!, "utf8"));
    expect(sa.project_id).toBe("daaraynorg-9165c");
    expect(sa.client_email).toBe("daarayn@daaraynorg-9165c.iam.gserviceaccount.com");
  });

  it("the application's own auth loader accepts it", async () => {
    const { getGoogleAuth } = await import("@/lib/google/client");
    expect(getGoogleAuth()).toBeTruthy();
  });
});

describe("LIVE: Google Sheets", () => {
  it("the configured production spreadsheet is reachable (read-only metadata check)", async () => {
    const r = await g.sheets.spreadsheets.get({ spreadsheetId: PRODUCTION_SHEET_ID, fields: "properties.title,sheets.properties.title" });
    expect(r.data.properties?.title).toBe("DAARAYN OPERATIONS DATABASE");
    const tabs = (r.data.sheets || []).map((s) => s.properties?.title);
    for (const t of ["Donors", "Donations", "Causes", "Communications", "Field_Reports"]) expect(tabs).toContain(t);
  });

  it("writes a record to the isolated test spreadsheet and reads it back", async (ctx) => {
    needSheet(ctx);
    await sheetsSvc.ensureSheetExists("Donations", ["id", "donorId", "amount", "status"]);
    const row = await sheetsSvc.appendRow("Donations", { id: `T-${RUN}`, donorId: "DNR-TEST", amount: 123, status: "pending" }, ["id", "donorId", "amount", "status"]);
    expect(row).toBeGreaterThanOrEqual(2);
    const back = (await sheetsSvc.getAllRows("Donations")).find((r: any) => r.id === `T-${RUN}`);
    expect(back).toMatchObject({ donorId: "DNR-TEST", amount: "123", status: "pending" });
    await sheetsSvc.updateRowAt("Donations", row, { id: `T-${RUN}`, donorId: "DNR-TEST", amount: 123, status: "completed" });
    const updated = (await sheetsSvc.getAllRows("Donations")).find((r: any) => r.id === `T-${RUN}`);
    expect(updated.status).toBe("completed");
  });

  it("reports a wrong spreadsheet id / missing permission with a clear error (not an empty result)", async () => {
    const { SheetsService } = await import("@/lib/google/sheets");
    const bad = new SheetsService("1" + "A".repeat(43));
    await expect(bad.getAllRows("Donations")).rejects.toThrow(/Could not read Donations from Google Sheets/);
  });

  it("an invalid credential file is reported, not silently replaced by another key", async () => {
    const saved = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    vi.resetModules();
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "D:/does/not/exist.json";
    try {
      const { getGoogleAuth, googleAuthProblem } = await import("@/lib/google/client");
      expect(getGoogleAuth()).toBeNull();
      expect(googleAuthProblem()).toMatch(/does not exist/);
    } finally {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = saved;
      vi.resetModules();
      sheetsSvc = (await import("@/lib/google/sheets")).sheetsService;
      driveSvc = (await import("@/lib/google/drive")).driveService;
    }
  });
});

describe("LIVE: donation workflow on the isolated spreadsheet", () => {
  let donorToken = "";
  const phone = `98${Math.floor(10000000 + Math.random() * 89999999)}`;

  it("persists a donation and a permanent Donor Token; a second donation keeps the token and gets a new Donation ID", async (ctx) => {
    needSheet(ctx);
    const { donationService } = await import("@/lib/services/donationService");
    const a = await donationService.processDonation({ donorName: "Live Test Donor", donorContact: phone, amount: 111, cause: "General", submissionKey: `${RUN}-a` });
    const b = await donationService.processDonation({ donorName: "Live Test Donor", donorContact: `+91 ${phone}`, amount: 222, cause: "General", submissionKey: `${RUN}-b` });
    donorToken = a.donorId;
    expect(a.donorId).toMatch(/^DNR-[0-9A-Z]+-[0-9A-Z]{4}$/);
    expect(b.donorId).toBe(a.donorId);
    expect(b.donationId).not.toBe(a.donationId);
    const donors = (await sheetsSvc.getAllRows("Donors")).filter((d: any) => d.phone === phone);
    expect(donors).toHaveLength(1);
    const rows = (await sheetsSvc.getAllRows("Donations")).filter((d: any) => d.donorId === donorToken);
    expect(rows.map((r: any) => r.status)).toEqual(["pending", "pending"]);
  });

  it("appears in Admin Donations and verification persists", async (ctx) => {
    needSheet(ctx);
    const { GET, PATCH } = await import("@/app/api/admin/donations/route");
    auth.role = "admin";
    const list = await (await GET(new Request("http://t/d"))).json();
    const mine = list.donations.filter((d: any) => d.donorId === donorToken);
    expect(mine).toHaveLength(2);
    const res = await PATCH(new NextRequest("http://t/d", { method: "PATCH", body: JSON.stringify({ id: mine[0].id, status: "completed", expectedStatus: "pending" }) }));
    expect((await res.json()).changed).toBe(true);
    const after = (await sheetsSvc.getAllRows("Donations")).find((d: any) => d.id === mine[0].id);
    expect(after.status).toBe("completed");
  });

  it("a donation WITH proof stores the Drive file id on the record", async (ctx) => {
    needSheet(ctx);
    if (!TEST_FOLDER) return ctx.skip("BLOCKED: set GOOGLE_DRIVE_TEST_FOLDER_ID (and connect Drive via OAuth) to test donation proofs.");
    const { donationService } = await import("@/lib/services/donationService");
    const r = await donationService.processDonation({ donorName: "Live Test Donor", donorContact: phone, amount: 50, cause: "General", submissionKey: `${RUN}-c`, screenshotBuffer: Buffer.from("proof"), screenshotFilename: `proof-${RUN}.png`, screenshotMimeType: "image/png" });
    const row = (await sheetsSvc.getAllRows("Donations")).find((d: any) => d.id === r.donationId);
    expect(row.proofDriveFileId).toBeTruthy();
    expect(row.proofDriveFileId.startsWith("local_")).toBe(false);
    driveCleanup.push(row.proofDriveFileId);
  });

  it("realtime events are appended to Realtime_Events and can be replayed", async (ctx) => {
    needSheet(ctx);
    const { appendEvent, readEventsFrom, lastEventRow } = await import("@/lib/realtime/eventLog");
    const before = await lastEventRow();
    const row = await appendEvent("DONATION_UPDATED", { id: "T-1" }, ["admin"], "live-test", new Date().toISOString());
    expect(row).not.toBeNull();
    expect(row!).toBeGreaterThan(before - 1);
    const { events } = await readEventsFrom(row!);
    expect(events[0].message.type).toBe("DONATION_UPDATED");
    expect(events[0].audience).toEqual(["admin"]);
  });
});

describe("LIVE: Gmail SMTP", () => {
  it("SMTP authentication succeeds", async () => {
    const { verifyEmailProvider } = await import("@/lib/email/providerManager");
    const r = await verifyEmailProvider();
    smtpOk = r.ok;
    expect(r.error ?? "", "SMTP login failed").toBe("");
    expect(r.ok).toBe(true);
  });

  it("sends the test communication ONLY to the SMTP account's own mailbox, with per-recipient history", async (ctx) => {
    needSheet(ctx);
    if (!smtpOk) return expect.fail("SMTP authentication failed, so no email can be sent");
    // isolated records: one cause, one verified donor whose email is the test inbox, one other donor (must not be mailed)
    await sheetsSvc.ensureSheetExists("Causes", ["id", "title", "category", "targetAmount", "raisedAmount", "location", "description", "status", "imageUrl", "driveFileId", "createdAt"]);
    await sheetsSvc.appendRow("Causes", { id: `C-${RUN}`, title: `Live Cause ${RUN}`, category: "Test", targetAmount: 1000, raisedAmount: 0, status: "Active", createdAt: new Date().toISOString() });
    const mk = (id: string, email: string, n: number) => ({ donor: { id, name: `Live ${id}`, email, phone: "", status: "active", country: "India" }, don: { id: `DA9${n}${RUN.slice(-3)}`, donorId: id, donorName: `Live ${id}`, donorEmail: email, amount: 10, currency: "INR", date: new Date().toISOString(), status: "completed", paymentMethod: "UPI", causeId: `C-${RUN}`, causeTitle: `Live Cause ${RUN}`, submissionKey: `${RUN}-s${n}` } });
    const inbox = mk(`DNR-LIVE-IN${RUN.slice(-2).toUpperCase()}`, SMTP_USER, 1);
    const other = mk(`DNR-LIVE-OT${RUN.slice(-2).toUpperCase()}`, "must-not-be-mailed@example.invalid", 2);
    await sheetsSvc.ensureSheetExists("Donors", ["id", "name", "email", "phone", "status"]);
    await sheetsSvc.ensureSheetExists("Donations", ["id", "donorId", "amount", "status"]);
    other.don.status = "pending"; // unverified: ineligible, so it is excluded with a reason and can never be mailed
    for (const x of [inbox, other]) {
      await sheetsSvc.appendRow("Donors", x.donor);
      await sheetsSvc.appendRow("Donations", x.don);
    }

    const { POST: approve } = await import("@/app/api/admin/communications/approve/route");
    const { POST: send } = await import("@/app/api/admin/communications/send/route");
    const jsonReq = (body: any) => new Request("http://t/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    auth.role = "admin";
    const content = { causeIds: [`C-${RUN}`], type: "project_progress", heading: `Integration test ${RUN}`, notes: "Automated integration test. No action needed." };
    // review: the server computes the audience and signs an approval bound to this message and recipient set
    const review = await (await approve(jsonReq(content))).json();
    expect(review.recipients.map((r: any) => r.id)).toEqual([inbox.donor.id]);
    expect(review.excluded.map((x: any) => x.id)).toEqual([other.donor.id]);
    expect(review.excluded[0].reason).toBe("payment not yet verified");
    const res = await (await send(jsonReq({ ...content, recipientIds: [inbox.donor.id], approvalToken: review.approvalToken }))).json();
    expect(res.success).toBe(true);
    const hist = (await sheetsSvc.getAllRows("Communication_Recipients")).filter((r: any) => r.broadcastId === res.broadcastId);
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({ donorId: inbox.donor.id, status: "smtp_accepted" });
    expect(hist[0].providerMessageId).toBeTruthy(); // SMTP accepted; inbox arrival is confirmed by a human
  });
});
