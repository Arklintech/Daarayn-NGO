/**
 * LIVE operations scenario on the designated TEST spreadsheet (real Google Sheets, real Gmail SMTP).
 * Run: npx vitest run --config vitest.live.config.ts tests/live/operations.live.test.ts
 *
 * Safety: GOOGLE_SHEET_ID is replaced by GOOGLE_TEST_SHEET_ID before any application module loads; the run aborts if
 * that id equals production or the sheet lacks the "_IntegrationTest" marker tab. Donations use phone-only donors; the
 * only e-mail goes to the SMTP account's own mailbox. Drive is not used (no proof/evidence upload here).
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { google } from "googleapis";
import fs from "fs";

const auth = vi.hoisted(() => ({ role: "admin" as "admin" | "none" }));
vi.mock("@/lib/server/auth", async () => {
  const { NextResponse } = await import("next/server");
  const admin = { kind: "admin", uid: "live", email: "live-test@example.invalid" };
  const deny = () => NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  return {
    requireAdmin: async () => (auth.role === "admin" ? admin : deny()),
    requireAgent: async () => deny(),
    requireAdminOrAgent: async () => (auth.role === "admin" ? admin : deny()),
  };
});

const PRODUCTION = (process.env.GOOGLE_SHEET_ID || "").trim();
const TEST_SHEET = (process.env.GOOGLE_TEST_SHEET_ID || "").trim();
const SMTP_USER = (process.env.SMTP_USER || "").trim();
const RUN = Date.now().toString(36).toUpperCase();
let blocked = "";
let raw: ReturnType<typeof google.sheets>;
let m: any;

const json = (url: string, method: string, body?: any) => new NextRequest(`http://t${url}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const tab = async (name: string) => {
  const v = (await raw.spreadsheets.values.get({ spreadsheetId: TEST_SHEET, range: `'${name}'!A:ZZ` })).data.values || [];
  const h = v[0] || [];
  return v.slice(1).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ""])));
};

beforeAll(async () => {
  if (!TEST_SHEET || TEST_SHEET === PRODUCTION) {
    blocked = "BLOCKED: GOOGLE_TEST_SHEET_ID is missing or equals production.";
    return;
  }
  const sa = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS!, "utf8"));
  const jwt = new google.auth.JWT({ email: sa.client_email, key: sa.private_key, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
  raw = google.sheets({ version: "v4", auth: jwt });
  const meta = await raw.spreadsheets.get({ spreadsheetId: TEST_SHEET, fields: "sheets.properties.title" });
  if (!(meta.data.sheets || []).some((s) => s.properties?.title === "_IntegrationTest")) {
    blocked = "BLOCKED: the test spreadsheet has no _IntegrationTest marker tab.";
    return;
  }
  process.env.GOOGLE_TARGET_ENV = "test"; // the write guard: only the declared test sheet may be written
  process.env.GOOGLE_SHEET_ID = TEST_SHEET; // every application module now sees ONLY the test spreadsheet
  vi.resetModules();
  m = {
    donationService: (await import("@/lib/services/donationService")).donationService,
    donationRepository: (await import("@/lib/repositories/donationRepository")).donationRepository,
    saveCause: (await import("@/lib/catalog/causes")).saveCause,
    snapshot: (await import("@/lib/donations/snapshot")).loadSnapshot,
    computeDashboard: (await import("@/lib/reporting/dashboard")).computeDashboard,
    designations: await import("@/app/api/admin/designations/route"),
    approve: await import("@/app/api/admin/communications/approve/route"),
    send: await import("@/app/api/admin/communications/send/route"),
    history: await import("@/app/api/admin/donors/[id]/history/route"),
    recon: await import("@/app/api/admin/reconciliation/route"),
    verifyEmailProvider: (await import("@/lib/email/providerManager")).verifyEmailProvider,
  };
});

describe("LIVE: unified operations scenario on the test spreadsheet", () => {
  it("causes → multi-cause donation → designation → dashboard reconciliation → approved test campaign → CRM history", async (ctx) => {
    if (blocked) return ctx.skip(blocked);
    const EDU = `LIVE-EDU-${RUN}`;
    const FOOD = `LIVE-FOOD-${RUN}`;
    await m.saveCause({ id: EDU, title: `Live Education ${RUN}`, targetAmount: 1000, status: "Active" }, "live-test@example.invalid");
    await m.saveCause({ id: FOOD, title: `Live Food Aid ${RUN}`, targetAmount: 1000, status: "Active" }, "live-test@example.invalid");

    const phone = `97${Math.floor(10000000 + Math.random() * 89999999)}`;
    const base = { donorName: "Live Ops Donor", amount: 900, cause: "Multiple", selectedCauses: [EDU, FOOD] };
    const multi = await m.donationService.processDonation({ ...base, donorContact: phone, submissionKey: `${RUN}-multi` });
    const retry = await m.donationService.processDonation({ ...base, donorContact: phone, submissionKey: `${RUN}-multi` });
    expect(multi.operationStatus).toBe("complete");
    expect(retry).toMatchObject({ duplicate: true, donationId: multi.donationId }); // idempotent
    const second = await m.donationService.processDonation({ donorName: "Live Ops Donor", donorContact: `+91 ${phone}`, amount: 200, cause: "x", selectedCauses: [FOOD], submissionKey: `${RUN}-single` });
    expect(second.donorId).toBe(multi.donorId);
    expect(second.donationId).not.toBe(multi.donationId);

    // sheet truth (read directly, independent of the application)
    const donations = (await tab("Donations")).filter((d) => [multi.donationId, second.donationId].includes(d.id));
    expect(donations.map((d) => d.opStatus)).toEqual(["complete", "complete"]);
    const rel = (await tab("Donation_Causes")).filter((r) => [multi.donationId, second.donationId].includes(r.donationId));
    expect(rel.filter((r) => r.donationId === multi.donationId).every((r) => r.designationStatus === "unresolved" && r.designatedAmount === "")).toBe(true);
    expect(rel.filter((r) => r.donationId === second.donationId)).toEqual([expect.objectContaining({ causeId: FOOD, designationStatus: "designated", designatedAmount: "200" })]);

    await m.donationRepository.updateStatus(multi.donationId, "completed", "pending");
    await m.donationRepository.updateStatus(second.donationId, "completed", "pending");
    const put = await m.designations.PUT(json("/d", "PUT", { donationId: multi.donationId, split: [{ causeId: EDU, amount: 600 }, { causeId: FOOD, amount: 300 }] }));
    expect(put.status).toBe(200);
    expect((await m.designations.PUT(json("/d", "PUT", { donationId: multi.donationId, split: [{ causeId: EDU, amount: 600 }, { causeId: FOOD, amount: 100 }] }))).status).toBe(409); // must reconcile

    // dashboard from the application equals an independent computation from the raw rows
    const snap = await m.snapshot(["donations", "donors", "causes", "designations", "allocations", "recipients"]);
    const board = m.computeDashboard(snap);
    const eduRow = board.causes.find((c: any) => c.id === EDU);
    const foodRow = board.causes.find((c: any) => c.id === FOOD);
    expect(eduRow.designatedReceived).toBe(600);
    expect(foodRow.designatedReceived).toBe(300 + 200);
    expect(board.integrity.exceptions.filter((e: any) => e.entityId === multi.donationId || e.entityId === second.donationId)).toEqual([]);
    const rawVerified = (await tab("Donations")).filter((d) => d.status === "completed" && d.id !== "PENDING").reduce((s, d) => s + Number(d.amount), 0);
    expect(board.donations.verifiedAmount).toBe(rawVerified);
    const partition = board.causes.reduce((s: number, c: any) => s + c.designatedReceived, 0) + board.unresolvedDistribution.receivedAmount + board.unrestricted.receivedAmount;
    expect(partition).toBe(board.donations.verifiedAmount);

    // approved test campaign: an email-bearing donor whose address is the SMTP account's own mailbox
    const mailDonation = await m.donationService.processDonation({ donorName: "Live Inbox Donor", donorContact: SMTP_USER, amount: 100, cause: "x", selectedCauses: [FOOD], submissionKey: `${RUN}-mail` });
    await m.donationRepository.updateStatus(mailDonation.donationId, "completed", "pending");
    const provider = await m.verifyEmailProvider();
    if (!provider.ok) return ctx.skip(`BLOCKED: SMTP not ready (${provider.error})`);
    const review = await (await m.approve.POST(json("/a", "POST", { causeIds: [FOOD], type: "project_progress", heading: `Live ops test ${RUN}`, notes: "Automated test. No action needed." }))).json();
    const ids = review.recipients.map((r: any) => r.id);
    expect(ids).toContain(mailDonation.donorId);
    // the phone-only donors have no e-mail address and are excluded with a reason, never mailed
    expect(review.excluded.every((x: any) => /email/i.test(x.reason))).toBe(true);
    const allowed = review.recipients.filter((r: any) => r.email === SMTP_USER);
    expect(allowed.length).toBe(review.recipients.length); // only the approved test inbox is in the audience
    const sent = await (await m.send.POST(json("/s", "POST", { causeIds: [FOOD], type: "project_progress", heading: `Live ops test ${RUN}`, notes: "Automated test. No action needed.", recipientIds: ids, approvalToken: review.approvalToken }))).json();
    expect(sent.success).toBe(true);

    const crm = await (await m.history.GET(json("/h", "GET"), { params: Promise.resolve({ id: mailDonation.donorId }) })).json();
    expect(crm.communications[0]).toMatchObject({ status: "smtp_accepted", communicationType: "project_progress" });
    const recipients = (await tab("Communication_Recipients")).filter((r) => r.broadcastId === sent.broadcastId);
    expect(recipients).toHaveLength(1);
    expect(recipients[0]).toMatchObject({ status: "smtp_accepted", approvedBy: "live-test@example.invalid" });

    // reconciliation endpoint reports no outstanding follow-ups for these donations
    const rec = await (await m.recon.GET(json("/r", "GET"))).json();
    expect(rec.incomplete.some((i: any) => [multi.donationId, second.donationId, mailDonation.donationId].includes(i.id))).toBe(false);
  });
});
