/**
 * Acceptance scenarios A-K for the unified operations model. Real services, repositories, routes and SheetsService run
 * against a fake of Google's REST API (no network, no credentials). Assertions read the "sheet" contents directly.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeApi, permissionError, serverError } from "./helpers/fakeGoogleApi";
import { mailMock, authState, driveMock } from "./helpers/mocks";

vi.unmock("@/lib/google/sheets");
vi.mock("@/lib/google/client", () => ({
  GOOGLE_SHEET_ID: "TEST_SHEET_ID_000000000000000000000000",
  GOOGLE_DRIVE_ROOT_FOLDER_ID: "ROOT",
  googleAuthProblem: () => "",
  getSheetsClient: () => fakeApi.client(),
  getDriveClient: () => null,
  getGoogleAuth: () => ({}),
}));
vi.unmock("@/lib/realtime/broadcaster");

const json = (url: string, method: string, body?: any) => new NextRequest(`http://t${url}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

async function world() {
  fakeApi.reset();
  delete (globalThis as any).__daaraynRealtime;
  vi.resetModules();
  vi.clearAllMocks();
  mailMock.failFor.clear();
  mailMock.sent.length = 0;
  authState.role = "admin";
  (await import("@/lib/google/retry")).setRetrySleep(async () => undefined);
  const m = {
    donationService: (await import("@/lib/services/donationService")).donationService,
    donationRepository: (await import("@/lib/repositories/donationRepository")).donationRepository,
    saveCause: (await import("@/lib/catalog/causes")).saveCause,
    snapshot: (await import("@/lib/donations/snapshot")).loadSnapshot,
    computeDashboard: (await import("@/lib/reporting/dashboard")).computeDashboard,
    allocation: await import("@/lib/services/allocationService"),
    routes: {
      causes: await import("@/app/api/causes/route"),
      designations: await import("@/app/api/admin/designations/route"),
      allocations: await import("@/app/api/admin/allocations/route"),
      reconciliation: await import("@/app/api/admin/reconciliation/route"),
      history: await import("@/app/api/admin/donors/[id]/history/route"),
      dashboard: await import("@/app/api/admin/dashboard/route"),
      approve: await import("@/app/api/admin/communications/approve/route"),
      send: await import("@/app/api/admin/communications/send/route"),
    },
  };
  for (const [id, title, target] of [["EDU", "Education", 1000], ["FOOD", "Food Aid", 1000], ["HEALTH", "Healthcare", 1000]] as const) {
    await m.saveCause({ id, title, targetAmount: target, status: "Active" }, "admin@test.local");
  }
  return m;
}
type World = Awaited<ReturnType<typeof world>>;

let n = 0;
const donate = (w: World, over: Record<string, any> = {}) =>
  w.donationService.processDonation({
    donorName: "Test Donor", donorContact: "a@example.org", amount: 100, cause: "General", selectedCauses: [], submissionKey: `k${++n}`,
    screenshotBuffer: Buffer.from("png"), screenshotMimeType: "image/png", ...over,
  });
const verify = (w: World, id: string) => w.donationRepository.updateStatus(id, "completed", "pending");
const dash = async (w: World, range?: any) => {
  const s = await w.snapshot(["donations", "donors", "causes", "designations", "allocations", "recipients"]);
  return w.computeDashboard({ ...s, range });
};
const approveSend = async (w: World, body: any) => {
  const ap = await (await w.routes.approve.POST(json("/a", "POST", { heading: "Update", notes: "Thank you.", ...body }))).json();
  const res = ap.approvalToken ? await w.routes.send.POST(json("/s", "POST", { heading: "Update", notes: "Thank you.", ...body, recipientIds: ap.recipients.map((r: any) => r.id), approvalToken: ap.approvalToken })) : null;
  return { ap, res, result: res ? await res.json() : null };
};

beforeEach(() => {
  n = 0;
});

describe("A. one donor, multiple donations", () => {
  it("keeps one identity, distinct Donation IDs, full CRM history and consistent dashboard figures", async () => {
    const w = await world();
    const d1 = await donate(w, { amount: 100, selectedCauses: ["EDU"] });
    const d2 = await donate(w, { amount: 200, selectedCauses: ["FOOD"] });
    const d3 = await donate(w, { amount: 300, selectedCauses: [] });
    expect(new Set([d1.donorId, d2.donorId, d3.donorId]).size).toBe(1);
    expect(new Set([d1.donationId, d2.donationId, d3.donationId]).size).toBe(3);
    expect(fakeApi.records("Donors")).toHaveLength(1);
    await verify(w, d1.donationId);
    await verify(w, d2.donationId);

    const board = await dash(w);
    expect(board.donations).toMatchObject({ totalCount: 3, verifiedCount: 2, verifiedAmount: 300, pendingCount: 1, pendingAmount: 300 });
    expect(board.causes.find((c) => c.id === "EDU")).toMatchObject({ designatedReceived: 100, verifiedDonationCount: 1 });
    expect(board.causes.find((c) => c.id === "FOOD")).toMatchObject({ designatedReceived: 200 });
    expect(board.unrestricted).toMatchObject({ pendingAmount: 300, pendingCount: 1, receivedAmount: 0 });

    const crm = await (await w.routes.history.GET(json("/h", "GET"), { params: Promise.resolve({ id: d1.donorId }) })).json();
    expect(crm.donations).toHaveLength(3);
    expect(crm.totals).toMatchObject({ verifiedAmount: 300, verifiedCount: 2, pendingCount: 1 });
    expect(crm.causes.map((c: any) => c.causeId).sort()).toEqual(["EDU", "FOOD"]);
  });
});

describe("B. one donation, several causes", () => {
  it("is ONE donation with several relationships; the browser's invented split is ignored; nothing is double-counted", async () => {
    const w = await world();
    const browserSplit = ["EDU", "FOOD", "HEALTH"].map((id) => ({ causeId: id, causeName: id, allocatedAmount: 300, percentage: 33.3 }));
    const d = await donate(w, { amount: 900, selectedCauses: browserSplit });
    await verify(w, d.donationId);

    expect(fakeApi.records("Donations").filter((r) => r.id !== "PENDING")).toHaveLength(1);
    const rel = fakeApi.records("Donation_Causes");
    expect(rel).toHaveLength(3);
    expect(rel.every((r) => r.designationStatus === "unresolved" && r.designatedAmount === "" && r.provenance === "donor_selected")).toBe(true);

    const board = await dash(w);
    expect(board.donations).toMatchObject({ totalCount: 1, verifiedAmount: 900 });
    expect(board.causes.every((c) => c.designatedReceived === 0)).toBe(true); // 900 is NOT reported against each cause
    expect(board.unresolvedDistribution).toMatchObject({ receivedAmount: 900, receivedCount: 1 });
    for (const id of ["EDU", "FOOD", "HEALTH"]) expect(board.causes.find((c) => c.id === id)!.unresolvedDonationCount).toBe(1);
    const partition = board.causes.reduce((s, c) => s + c.designatedReceived, 0) + board.unresolvedDistribution.receivedAmount + board.unrestricted.receivedAmount;
    expect(partition).toBe(board.donations.verifiedAmount);

    // an authorised split must reconcile exactly and cover every related cause
    const put = (split: any[]) => w.routes.designations.PUT(json("/d", "PUT", { donationId: d.donationId, split }));
    expect((await put([{ causeId: "EDU", amount: 500 }, { causeId: "FOOD", amount: 300 }, { causeId: "HEALTH", amount: 50 }])).status).toBe(409); // totals 850, not 900
    expect((await put([{ causeId: "EDU", amount: 450 }, { causeId: "FOOD", amount: 450 }])).status).toBe(400); // HEALTH not covered
    expect((await put([{ causeId: "EDU", amount: 300 }, { causeId: "FOOD", amount: 300 }, { causeId: "HEALTH", amount: 200 }, { causeId: "OTHER", amount: 100 }])).status).toBe(400); // unrelated cause
    const ok = await put([{ causeId: "EDU", amount: 500 }, { causeId: "FOOD", amount: 300 }, { causeId: "HEALTH", amount: 100 }]);
    expect(ok.status).toBe(200);

    const after = await dash(w);
    expect(after.causes.find((c) => c.id === "EDU")!.designatedReceived).toBe(500);
    expect(after.causes.find((c) => c.id === "FOOD")!.designatedReceived).toBe(300);
    expect(after.causes.find((c) => c.id === "HEALTH")!.designatedReceived).toBe(100);
    expect(after.unresolvedDistribution.receivedAmount).toBe(0);
    expect(after.donations.verifiedCount).toBe(1);
    expect(fakeApi.records("Donation_Causes").every((r) => r.designationStatus === "designated" && r.provenance === "admin")).toBe(true);
    expect(fakeApi.records("Audit_Log").some((e) => e.action === "RECORD_DESIGNATION")).toBe(true);
  });
});

describe("C. repeat donor, new cause", () => {
  it("retains the token, issues a new Donation ID, preserves earlier relationships and feeds cause-specific audiences", async () => {
    const w = await world();
    const first = await donate(w, { selectedCauses: ["EDU"], submissionKey: "c1" });
    const second = await donate(w, { selectedCauses: ["FOOD"], submissionKey: "c2" });
    expect(second.donorId).toBe(first.donorId);
    expect(second.donationId).not.toBe(first.donationId);
    await verify(w, first.donationId);
    await verify(w, second.donationId);
    expect(fakeApi.records("Donation_Causes").map((r) => `${r.donationId}:${r.causeId}`).sort()).toEqual([`${first.donationId}:EDU`, `${second.donationId}:FOOD`].sort());

    const food = await (await w.routes.approve.POST(json("/a", "POST", { causeIds: ["FOOD"], type: "project_progress", heading: "h", notes: "n" }))).json();
    expect(food.recipients).toHaveLength(1);
    expect(food.recipients[0]).toMatchObject({ id: first.donorId, donationIds: [second.donationId], causeIds: ["FOOD"] });
    const edu = await (await w.routes.approve.POST(json("/a", "POST", { causeIds: ["EDU"], type: "project_progress", heading: "h", notes: "n" }))).json();
    expect(edu.recipients[0].donationIds).toEqual([first.donationId]);
  });
});

describe("D. admin creates a cause (dynamic catalog)", () => {
  it("validates, persists with a permanent id, flows through shared consumers, never subscribes donors, and preserves history on deactivation", async () => {
    const w = await world();
    const post = async (body: any) => w.routes.causes.POST(json("/c", "POST", body));
    const created = await post({ title: "Water Wells", targetAmount: 5000, status: "Draft", category: "Water" });
    expect(created.status).toBe(200);
    const cause = (await created.json()).cause;
    expect(cause.id).toMatch(/^CAUSE-/);
    expect(fakeApi.records("Causes").find((c) => c.id === cause.id)!.title).toBe("Water Wells");
    expect(fakeApi.records("Audit_Log").some((e) => e.action === "CREATE_CAUSE" && e.entity_id === cause.id)).toBe(true);

    // validation
    expect((await post({ title: "water wells", targetAmount: 1 })).status).toBe(409); // duplicate title (case-insensitive)
    expect((await post({ title: "Zakat", status: "Bogus" })).status).toBe(400);
    expect((await post({ title: "Zakat", status: "Active", targetAmount: 0 })).status).toBe(400); // active needs a target
    expect((await post({ title: "" })).status).toBe(400);

    // Draft: visible to admins, not to the public, not donatable
    authState.role = "none";
    const publicBefore = await (await w.routes.causes.GET(json("/c", "GET"))).json();
    expect(publicBefore.map((c: any) => c.id)).not.toContain(cause.id);
    authState.role = "admin";
    expect((await (await w.routes.causes.GET(json("/c", "GET"))).json()).map((c: any) => c.id)).toContain(cause.id);
    await expect(donate(w, { selectedCauses: [cause.id] })).rejects.toThrow(/not open for donations/);

    // activating makes it selectable everywhere through the shared catalog; existing donors are NOT subscribed
    const existing = await donate(w, { donorContact: "old@example.org", selectedCauses: ["EDU"] });
    await verify(w, existing.donationId);
    expect((await post({ id: cause.id, title: "Water Wells", targetAmount: 5000, status: "Active" })).status).toBe(200);
    authState.role = "none";
    expect((await (await w.routes.causes.GET(json("/c", "GET"))).json()).map((c: any) => c.id)).toContain(cause.id);
    authState.role = "admin";
    const noOne = await (await w.routes.approve.POST(json("/a", "POST", { causeIds: [cause.id], type: "project_progress", heading: "h", notes: "n" }))).json();
    expect(noOne.count).toBe(0);
    expect(noOne.approvalToken).toBeNull(); // an empty audience is a result, not a reason to broaden

    const d = await donate(w, { donorContact: "new@example.org", selectedCauses: [cause.id], submissionKey: "w1" });
    await verify(w, d.donationId);
    const reach = await (await w.routes.approve.POST(json("/a", "POST", { causeIds: [cause.id], type: "project_progress", heading: "h", notes: "n" }))).json();
    expect(reach.recipients.map((r: any) => r.email)).toEqual(["new@example.org"]);

    // rename keeps the id; deactivate stops new donations but preserves history and reporting
    expect((await post({ id: cause.id, title: "Clean Water Wells", targetAmount: 5000, status: "Inactive" })).status).toBe(200);
    expect(fakeApi.records("Causes").filter((c) => c.id === cause.id)).toHaveLength(1);
    await expect(donate(w, { selectedCauses: [cause.id], submissionKey: "w2" })).rejects.toThrow(/not open for donations/);
    expect(fakeApi.records("Donations").find((r) => r.id === d.donationId)!.causeId).toBe(cause.id);
    const board = await dash(w);
    expect(board.causes.find((c) => c.id === cause.id)).toMatchObject({ title: "Clean Water Wells", status: "Inactive", designatedReceived: 100 });
    expect(fakeApi.records("Audit_Log").some((e) => e.action === "CHANGE_CAUSE_STATUS" && e.entity_id === cause.id)).toBe(true);
  });

  it("an unknown cause id in a donation is rejected, never guessed or replaced", async () => {
    const w = await world();
    await expect(donate(w, { selectedCauses: ["NOPE"] })).rejects.toThrow(/Unknown cause/);
    expect(fakeApi.records("Donations")).toHaveLength(0);
  });
});

describe("E/F. cause-specific communication", () => {
  it("E: only donors with a verified relationship to the selected cause qualify; outcome appears in the CRM", async () => {
    const w = await world();
    const a = await donate(w, { donorContact: "a@example.org", amount: 900, selectedCauses: ["EDU", "FOOD"], submissionKey: "e1" });
    const b = await donate(w, { donorContact: "b@example.org", selectedCauses: ["EDU"], submissionKey: "e2" });
    const c = await donate(w, { donorContact: "c@example.org", selectedCauses: ["FOOD"], submissionKey: "e3" }); // pending
    await verify(w, a.donationId);
    await verify(w, b.donationId);

    const { ap, result } = await approveSend(w, { causeIds: ["FOOD"], type: "project_progress" });
    expect(ap.recipients.map((r: any) => r.id)).toEqual([a.donorId]); // A qualifies through a multi-cause donation
    expect(ap.excluded.map((x: any) => x.id)).toEqual([c.donorId]); // C pending: shown with a reason
    expect(ap.excluded[0].reason).toBe("payment not yet verified");
    expect(JSON.stringify([ap.recipients, ap.excluded])).not.toContain(b.donorId); // B is unrelated to FOOD
    expect(result.success).toBe(true);
    expect(mailMock.sent).toEqual(["a@example.org"]);
    const rows = fakeApi.records("Communication_Recipients");
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].eligibility)).toEqual({ causeIds: ["FOOD"], donationIds: [a.donationId] });

    const crmA = await (await w.routes.history.GET(json("/h", "GET"), { params: Promise.resolve({ id: a.donorId }) })).json();
    expect(crmA.communications).toHaveLength(1);
    expect(crmA.communications[0]).toMatchObject({ status: "smtp_accepted", communicationType: "project_progress" });
    const crmB = await (await w.routes.history.GET(json("/h", "GET"), { params: Promise.resolve({ id: b.donorId }) })).json();
    expect(crmB.communications).toHaveLength(0);
  });

  it("F: a donor matching several selected causes receives ONE copy, with all matching causes kept as context", async () => {
    const w = await world();
    const a = await donate(w, { donorContact: "a@example.org", amount: 900, selectedCauses: ["EDU", "FOOD"], submissionKey: "f1" });
    const b = await donate(w, { donorContact: "b@example.org", selectedCauses: ["EDU"], submissionKey: "f2" });
    await verify(w, a.donationId);
    await verify(w, b.donationId);
    const { ap, result } = await approveSend(w, { causeIds: ["EDU", "FOOD"], type: "project_progress" });
    expect(ap.recipients).toHaveLength(2);
    expect(ap.recipients.find((r: any) => r.id === a.donorId).causeIds.sort()).toEqual(["EDU", "FOOD"]);
    expect(result.success).toBe(true);
    expect(mailMock.sent.sort()).toEqual(["a@example.org", "b@example.org"]);
    expect(fakeApi.records("Communication_Recipients")).toHaveLength(2);
  });

  it("an opted-out donor is excluded from outreach but a transactional confirmation is still allowed", async () => {
    const w = await world();
    const a = await donate(w, { donorContact: "a@example.org", selectedCauses: ["EDU"] });
    await verify(w, a.donationId);
    const { donorRepository } = await import("@/lib/repositories/donorRepository");
    const donor = (await donorRepository.getAll(true))[0];
    await donorRepository.save({ ...donor, emailSuppressed: true });
    const outreach = await (await w.routes.approve.POST(json("/a", "POST", { causeIds: ["EDU"], type: "project_progress", heading: "h", notes: "n" }))).json();
    expect(outreach.count).toBe(0);
    expect(outreach.excluded[0].reason).toMatch(/opted out/);
    const confirmation = await (await w.routes.approve.POST(json("/a", "POST", { causeIds: ["EDU"], type: "contribution_confirmation", heading: "h", notes: "n" }))).json();
    expect(confirmation.count).toBe(1);
  });
});

describe("G. allocations and evidence", () => {
  async function verifiedDonation(w: World, over: any = {}) {
    const d = await donate(w, { amount: 1000, selectedCauses: ["EDU"], ...over });
    await verify(w, d.donationId);
    return d;
  }
  const alloc = (w: World, body: any) => w.allocation.createAllocation({ actorEmail: "admin@test.local", causeId: "EDU", ...body });

  it("creates traceable allocations with real evidence, enforces the designation ceiling, idempotency and reversal", async () => {
    const w = await world();
    const d = await verifiedDonation(w);
    const a1 = await alloc(w, { donationId: d.donationId, amount: 600, evidence: { buffer: Buffer.from("receipt"), filename: "r.pdf", mimeType: "application/pdf" }, requestKey: "r1" });
    expect(a1.allocation.id).toMatch(/^ALLOC-/);
    expect(a1.allocation).toMatchObject({ donationId: d.donationId, causeId: "EDU", designationId: `DC-${d.donationId}-EDU`, evidenceDriveFileIds: ["DRIVEPROOF_000001"] });
    const row = fakeApi.records("Allocations")[0];
    expect(row).toMatchObject({ donationId: d.donationId, causeId: "EDU", status: "active" });
    expect(JSON.parse(row.evidenceDriveFileIds)).toEqual(["DRIVEPROOF_000001"]);

    expect((await alloc(w, { donationId: d.donationId, amount: 600, requestKey: "r1" })).duplicate).toBe(true); // retry returns the same record
    expect(fakeApi.records("Allocations")).toHaveLength(1);
    await expect(alloc(w, { donationId: d.donationId, amount: 500 })).rejects.toMatchObject({ httpStatus: 409 }); // 600 + 500 > 1000
    const a2 = await alloc(w, { donationId: d.donationId, amount: 400 });
    expect(a2.allocation.id).not.toBe(a1.allocation.id);

    const board = await dash(w);
    expect(board.allocations).toMatchObject({ activeAmount: 1000, activeCount: 2, withEvidenceCount: 1 });
    expect(board.causes.find((c) => c.id === "EDU")).toMatchObject({ designatedReceived: 1000, allocatedAmount: 1000, designatedNotYetAllocated: 0 });

    // reversal keeps the record and frees the amount
    await expect(w.allocation.reverseAllocation(a2.allocation.id, "", "admin@test.local")).rejects.toMatchObject({ httpStatus: 400 });
    await w.allocation.reverseAllocation(a2.allocation.id, "Entered in error", "admin@test.local");
    expect(fakeApi.records("Allocations").find((r) => r.id === a2.allocation.id)).toMatchObject({ status: "reversed", reversedBy: "admin@test.local", reversedReason: "Entered in error" });
    expect((await dash(w)).allocations.activeAmount).toBe(600);
    expect(fakeApi.records("Audit_Log").some((e) => e.action === "REVERSE_ALLOCATION")).toBe(true);
  });

  it("rejects allocations the records do not justify: unverified donation, unresolved split, unknown cause", async () => {
    const w = await world();
    const pending = await donate(w, { amount: 500, selectedCauses: ["EDU"], submissionKey: "g-pending" });
    await expect(alloc(w, { donationId: pending.donationId, amount: 100 })).rejects.toThrow(/verified/);
    const multi = await donate(w, { amount: 900, selectedCauses: ["EDU", "FOOD"], submissionKey: "g-multi" });
    await verify(w, multi.donationId);
    await expect(alloc(w, { donationId: multi.donationId, amount: 100 })).rejects.toThrow(/designation first/i);
    const ok = await verifiedDonation(w, { submissionKey: "g-ok" });
    await expect(alloc(w, { donationId: ok.donationId, amount: 100, causeId: "NOPE" })).rejects.toMatchObject({ httpStatus: 404 });
    await expect(alloc(w, { donationId: ok.donationId, amount: 100, causeId: "FOOD" })).rejects.toThrow(/not related/);
    expect(fakeApi.records("Allocations")).toHaveLength(0);
  });

  it("an evidence upload failure never becomes a successful attachment: no allocation is recorded", async () => {
    const w = await world();
    const d = await verifiedDonation(w);
    driveMock.uploadFile.mockRejectedValueOnce(new Error("Drive down"));
    await expect(alloc(w, { donationId: d.donationId, amount: 100, evidence: { buffer: Buffer.from("x"), filename: "e.png", mimeType: "image/png" } })).rejects.toMatchObject({ httpStatus: 503 });
    expect(fakeApi.records("Allocations")).toHaveLength(0);
  });

  it("allocation and completion purposes require real allocation records and evidence", async () => {
    const w = await world();
    const d = await verifiedDonation(w);
    const req = (type: string) => w.routes.approve.POST(json("/a", "POST", { causeIds: ["EDU"], type, heading: "h", notes: "n" })).then((r) => r.json());
    expect((await req("allocation_confirmation")).count).toBe(0);
    await alloc(w, { donationId: d.donationId, amount: 300 }); // no evidence
    expect((await req("allocation_confirmation")).count).toBe(1);
    await w.saveCause({ id: "EDU", title: "Education", targetAmount: 1000, status: "Completed" }, "admin@test.local");
    expect((await req("completion_report")).count).toBe(0); // completed cause but no evidence
    await alloc(w, { donationId: d.donationId, amount: 200, evidence: { buffer: Buffer.from("proof"), filename: "p.png", mimeType: "image/png" } });
    expect((await req("completion_report")).count).toBe(1);
  });

  it("J: concurrent over-allocation never leaves active allocations above the designated amount", async () => {
    const w = await world();
    const d = await verifiedDonation(w);
    fakeApi.jitter = true;
    const results = await Promise.allSettled([alloc(w, { donationId: d.donationId, amount: 600 }), alloc(w, { donationId: d.donationId, amount: 600 })]);
    fakeApi.jitter = false;
    const active = fakeApi.records("Allocations").filter((r) => r.status === "active").reduce((s, r) => s + Number(r.allocatedAmount), 0);
    expect(active).toBeLessThanOrEqual(1000);
    expect(results.filter((r) => r.status === "fulfilled").length).toBeLessThanOrEqual(1);
  });

  it("allocation routes are admin-only and validate input", async () => {
    const w = await world();
    authState.role = "none";
    expect((await w.routes.allocations.POST(json("/x", "POST", {}))).status).toBe(401);
    expect((await w.routes.designations.PUT(json("/x", "PUT", {}))).status).toBe(401);
    expect((await w.routes.reconciliation.POST(json("/x", "POST", {}))).status).toBe(401);
    authState.role = "admin";
    expect((await w.routes.allocations.POST(json("/x", "POST", { donationId: "DA999", causeId: "EDU", amount: 5 }))).status).toBe(404);
    expect((await w.routes.allocations.POST(json("/x", "POST", { donationId: "DA1", causeId: "EDU", amount: -5 }))).status).toBe(400);
  });
});

describe("H. interrupted multi-step operations", () => {
  it("a failed follow-up write leaves the donation once, marks it partial, shows it as an integrity exception, and recovery completes it idempotently", async () => {
    const w = await world();
    await donate(w, { donorContact: "warm@example.org", submissionKey: "warm" }); // tabs exist
    // The donation row succeeds; writing its cause relationships fails permanently.
    fakeApi.failures.push({ when: "write", method: "values.append", error: permissionError(), match: (a) => String(a?.range).includes("Donation_Causes") });
    const d = await donate(w, { donorContact: "h@example.org", amount: 700, selectedCauses: ["EDU", "FOOD"], submissionKey: "h1" });
    expect(d).toMatchObject({ success: true, operationStatus: "partial", pendingSteps: ["designations"] });

    const row = fakeApi.records("Donations").find((r) => r.id === d.donationId)!;
    expect(row).toMatchObject({ opStatus: "partial", opPending: "designations" });
    expect(fakeApi.records("Donations").filter((r) => r.submissionKey === "h1")).toHaveLength(1);
    expect(fakeApi.records("Donation_Causes").filter((r) => r.donationId === d.donationId)).toHaveLength(0);

    // a retry of the same submission returns the same donation (no duplicate) and still reports it as incomplete
    const again = await donate(w, { donorContact: "h@example.org", amount: 700, selectedCauses: ["EDU", "FOOD"], submissionKey: "h1" });
    expect(again).toMatchObject({ duplicate: true, donationId: d.donationId, operationStatus: "partial" });
    expect(fakeApi.records("Donations").filter((r) => r.submissionKey === "h1")).toHaveLength(1);

    // the dashboard and reconciliation do not call it complete
    const board = await dash(w);
    expect(board.integrity.exceptions.some((e) => e.type === "INCOMPLETE_DONATION" && e.entityId === d.donationId)).toBe(true);
    const report = await (await w.routes.reconciliation.GET(json("/r", "GET"))).json();
    expect(report.incomplete).toEqual([{ id: d.donationId, status: "partial", outstanding: ["designations"] }]);

    // recovery repeats ONLY the missing step, is audited, and is safe to run twice
    const rec = await (await w.routes.reconciliation.POST(json("/r", "POST", { donationIds: [d.donationId] }))).json();
    expect(rec.results[0]).toMatchObject({ recovered: ["designations"], remaining: [] });
    expect(fakeApi.records("Donation_Causes").filter((r) => r.donationId === d.donationId).map((r) => r.causeId).sort()).toEqual(["EDU", "FOOD"]);
    expect(fakeApi.records("Donations").find((r) => r.id === d.donationId)).toMatchObject({ opStatus: "complete", opPending: "" });
    await w.routes.reconciliation.POST(json("/r", "POST", { donationIds: [d.donationId] }));
    expect(fakeApi.records("Donation_Causes").filter((r) => r.donationId === d.donationId)).toHaveLength(2);
    expect(fakeApi.records("Audit_Log").some((e) => e.action === "RECOVER_DONATION_FOLLOW_UP" && e.entity_id === d.donationId)).toBe(true);
    expect((await dash(w)).integrity.exceptions.some((e) => e.type === "INCOMPLETE_DONATION")).toBe(false);
  });

  it("if even the completion record cannot be written, the donation stays 'pending' (identifiable) and the response says partial", async () => {
    const w = await world();
    await donate(w, { donorContact: "warm@example.org", submissionKey: "warm" });
    // the 2nd values.update of the operation is the completion write (the 1st is the final donation row)
    let updates = 0;
    const donationUpdate = (a: any) => String(a?.range).startsWith("'Donations'!A");
    fakeApi.failures.push({ when: "write", method: "values.update", error: serverError(), match: (a) => donationUpdate(a) && ++updates === 2 });
    for (let i = 0; i < 6; i++) fakeApi.failures.push({ when: "write", method: "values.update", error: serverError(), match: (a) => donationUpdate(a) && updates >= 2 });
    const d = await donate(w, { donorContact: "p@example.org", submissionKey: "p1" });
    expect(d.operationStatus).toBe("partial");
    expect(fakeApi.records("Donations").find((r) => r.id === d.donationId)!.opStatus).toBe("pending");
    fakeApi.failures.length = 0;
    const rec = await (await w.routes.reconciliation.POST(json("/r", "POST", { donationIds: [d.donationId] }))).json();
    expect(rec.results[0].remaining).toEqual([]);
    expect(fakeApi.records("Donations").find((r) => r.id === d.donationId)!.opStatus).toBe("complete");
    expect(fakeApi.records("Notifications").filter((r) => r.relatedEntityId === d.donationId)).toHaveLength(1); // not duplicated
  });
});

describe("J. concurrent operations", () => {
  it("concurrent donations keep identifiers unique and every donation linked to its donor, with no lost donor updates", async () => {
    const w = await world();
    fakeApi.jitter = true;
    const results = await Promise.all([
      ...Array.from({ length: 6 }, (_, i) => donate(w, { donorContact: "same@example.org", submissionKey: `s${i}`, selectedCauses: ["EDU"] })),
      ...Array.from({ length: 4 }, (_, i) => donate(w, { donorContact: `o${i}@example.org`, submissionKey: `o${i}` })),
    ]);
    fakeApi.jitter = false;
    expect(new Set(results.map((r) => r.donationId)).size).toBe(10);
    expect(new Set(results.slice(0, 6).map((r) => r.donorId)).size).toBe(1);
    expect(fakeApi.records("Donors")).toHaveLength(5);
    const rows = fakeApi.records("Donations").filter((r) => r.id !== "PENDING");
    expect(rows).toHaveLength(10);
    expect(fakeApi.records("Donation_Causes")).toHaveLength(6);
    expect(results.every((r) => r.operationStatus === "complete")).toBe(true);
  });
});

describe("K. dashboard reconciliation against the sheet", () => {
  it("every figure equals an independent computation from the stored rows, and money partitions without double-counting", async () => {
    const w = await world();
    const a = await donate(w, { donorContact: "a@example.org", amount: 500, selectedCauses: ["EDU"], submissionKey: "k1" });
    const b = await donate(w, { donorContact: "b@example.org", amount: 900, selectedCauses: ["EDU", "FOOD", "HEALTH"], submissionKey: "k2" });
    const c = await donate(w, { donorContact: "c@example.org", amount: 250, selectedCauses: [], submissionKey: "k3" });
    const d = await donate(w, { donorContact: "d@example.org", amount: 400, selectedCauses: ["FOOD"], submissionKey: "k4" });
    await verify(w, a.donationId);
    await verify(w, b.donationId);
    await verify(w, c.donationId);
    await w.donationRepository.updateStatus(d.donationId, "rejected", "pending");

    const board = await dash(w);
    const rows = fakeApi.records("Donations").filter((r) => r.id !== "PENDING");
    const sum = (f: (r: any) => boolean) => rows.filter(f).reduce((s, r) => s + Number(r.amount), 0);
    expect(board.donations.totalCount).toBe(rows.length);
    expect(board.donations.verifiedAmount).toBe(sum((r) => r.status === "completed"));
    expect(board.donations.rejectedAmount).toBe(sum((r) => r.status === "rejected"));
    expect(board.donors.total).toBe(fakeApi.records("Donors").length);
    expect(board.donors.withVerifiedDonation).toBe(3);

    const designated = board.causes.reduce((s, x) => s + x.designatedReceived, 0);
    expect(designated + board.unresolvedDistribution.receivedAmount + board.unrestricted.receivedAmount).toBe(board.donations.verifiedAmount);
    expect(board.causes.find((x) => x.id === "FOOD")!.designatedReceived).toBe(0); // the rejected 400 never counts
    expect(board.unresolvedDistribution).toMatchObject({ receivedAmount: 900, receivedCount: 1 });
    expect(board.unrestricted).toMatchObject({ receivedAmount: 250, receivedCount: 1 });

    // communications metrics equal the recipient rows
    await approveSend(w, { causeIds: ["EDU"], type: "project_progress" });
    const after = await dash(w);
    const recRows = fakeApi.records("Communication_Recipients");
    expect(after.communications.recipients).toBe(recRows.length);
    expect(after.communications.smtpAccepted).toBe(recRows.filter((r) => r.status === "smtp_accepted").length);
    expect(after.communications.byType.project_progress.accepted).toBe(2);

    // date filter: a window that excludes everything yields zero donations from the SAME records
    const empty = await dash(w, { from: "2000-01-01", to: "2000-12-31" });
    expect(empty.donations.totalCount).toBe(0);
    const all = await dash(w, { from: "2000-01-01", to: "2100-01-01" });
    expect(all.donations.totalCount).toBe(rows.length);

    // the HTTP route exposes the same numbers
    const http = await (await w.routes.dashboard.GET(json("/dash", "GET"))).json();
    expect(http.success).toBe(true);
    expect(http.stats.totalDonations).toBe(board.donations.verifiedAmount);
    expect(http.canonical.donations.totalCount).toBe(board.donations.totalCount);
  });

  it("when Sheets cannot be read the dashboard is an ERROR, never zeros presented as a result", async () => {
    const w = await world();
    await donate(w);
    for (let i = 0; i < 30; i++) fakeApi.failures.push({ when: "read", method: "values.batchGet", error: serverError() });
    const res = await w.routes.dashboard.GET(json("/dash", "GET"));
    expect(res.status).toBe(503);
    expect((await res.json()).success).toBe(false);
    fakeApi.failures.length = 0;
  });

  it("an unfinished PENDING placeholder row is not counted as a donation", async () => {
    const w = await world();
    const d = await donate(w);
    await verify(w, d.donationId);
    fakeApi.tabs.get("Donations")!.push(["PENDING", "", "", "", "0", "INR", new Date().toISOString(), "pending"]);
    const board = await dash(w);
    expect(board.donations.totalCount).toBe(1);
    expect(board.donations.pendingCount).toBe(0);
  });
});
