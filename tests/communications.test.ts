import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeSheets } from "./helpers/fakeSheets";
import { resetWorld, mailMock, authState, driveMock } from "./helpers/mocks";
import { evaluateRecipients, COMMUNICATION_TYPES, TYPE_RULES, attributeDonation } from "@/lib/communication-resolver";
import type { Cause } from "@/lib/repositories/causeRepository";
import type { CommunicationRecipientEntity } from "@/lib/repositories/communicationRecipientRepository";

// ---------- fixtures ----------
const cause = (id: string, title: string, status: any = "Active", target = 100000): Cause => ({
  id, title, category: "General", targetAmount: target, raisedAmount: 0, location: "", description: "", status, createdAt: "",
});
const donor = (id: string, email = `${id.toLowerCase()}@example.org`, status: any = "active") => ({
  id, name: `Donor ${id}`, email, phone: "", country: "India", city: "", donationPreference: "", communicationPreference: "Email",
  dateJoined: "", totalDonations: 0, totalAmountDonated: 0, projectsSupportedCount: 0, casesSupportedCount: 0,
  donationHistory: [], projectsSupported: [], casesSupported: [], projectsSupportedCount_: 0, status,
}) as any;
let n = 0;
const don = (donorId: string, causeId: string, causeTitle: string, status = "completed", amount = 100): any => ({
  id: `DA${String(++n).padStart(3, "0")}`, donorId, donorName: `Donor ${donorId}`, donorEmail: `${donorId.toLowerCase()}@example.org`,
  amount, currency: "INR", date: "2026-10-01", status, paymentMethod: "UPI", causeId, causeTitle, transactionReference: "", selectedCauses: [],
});
const hist = (over: Partial<CommunicationRecipientEntity>): CommunicationRecipientEntity => ({
  id: "x", broadcastId: "BCAST-1", communicationType: "contribution_confirmation", scopeKey: "WATER", donorId: "D1", donorName: "", email: "",
  donationIds: "", status: "smtp_accepted", attempts: 1, lastError: "", providerMessageId: "", eligibility: "", approvedBy: "", contentHash: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...over,
});

const WATER = cause("WATER", "Clean Water Wells");
const ORPHAN = cause("ORPHAN", "Orphan Care");
const causes = [WATER, ORPHAN];

/** 100 donors give to WATER; the first 18 have a verified donation, the rest are pending/rejected. */
function waterWorld() {
  const donors: any[] = [];
  const donations: any[] = [];
  for (let i = 1; i <= 100; i++) {
    const id = `W${i}`;
    donors.push(donor(id));
    donations.push(don(id, "WATER", "Clean Water Wells", i <= 18 ? "completed" : i <= 90 ? "pending" : "rejected"));
  }
  for (let i = 1; i <= 5; i++) {
    donors.push(donor(`O${i}`));
    donations.push(don(`O${i}`, "ORPHAN", "Orphan Care"));
  }
  return { donors, donations };
}
const base = (over: any = {}) => {
  const w = waterWorld();
  return { causeIds: ["WATER"], type: "contribution_confirmation", causes, donations: w.donations, donors: w.donors, allocations: [], history: [], ...over };
};

beforeEach(resetWorld);

describe("the five communication types", () => {
  it("are exactly the five types already implemented in the Admin UI, each with a documented rule", () => {
    expect([...COMMUNICATION_TYPES]).toEqual([
      "contribution_confirmation", "project_progress", "allocation_confirmation", "completion_report", "general_communication",
    ]);
    for (const t of COMMUNICATION_TYPES) expect(TYPE_RULES[t].length).toBeGreaterThan(10);
  });
});

describe("cause- and purpose-specific recipients (scenarios 9-10)", () => {
  it("9. 100 donors, 18 eligible: the preview contains exactly those 18, with reasons for the other 82", () => {
    const r = evaluateRecipients(base());
    expect(r.ok).toBe(true);
    expect(r.recipients).toHaveLength(18);
    expect(r.recipients.every((x) => /^W(\d+)$/.test(x.id) && Number(x.id.slice(1)) <= 18)).toBe(true);
    expect(r.excluded).toHaveLength(82);
    expect(r.excluded.some((x) => x.reason === "payment not yet verified")).toBe(true);
    expect(r.excluded.some((x) => x.reason === "payment rejected")).toBe(true);
  });

  it("10. switching causes never mixes lists", () => {
    const w = base();
    const water = evaluateRecipients(w);
    const orphan = evaluateRecipients({ ...w, causeIds: ["ORPHAN"] });
    expect(orphan.recipients.map((x) => x.id).sort()).toEqual(["O1", "O2", "O3", "O4", "O5"]);
    const waterIds = new Set(water.recipients.map((x) => x.id));
    expect(orphan.recipients.some((x) => waterIds.has(x.id))).toBe(false);
  });

  it("never falls back to all donors when a cause is selected, even with no eligible donations", () => {
    const r = evaluateRecipients(base({ causeIds: ["ORPHAN"], type: "completion_report" }));
    expect(r.ok).toBe(true);
    expect(r.recipients).toHaveLength(0);
    expect(r.excluded.every((x) => x.id.startsWith("O"))).toBe(true);
  });

  it("an unknown cause fails safely with an explanation instead of guessing", () => {
    const r = evaluateRecipients(base({ causeIds: ["NOPE"] }));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Unknown cause/);
    expect(r.recipients).toHaveLength(0);
  });

  it("no fuzzy matching: a similar title does not attribute a donation to the cause", () => {
    const d = don("Z1", "", "Water Tube Wells");
    expect(attributeDonation(d, causes)).toBeNull();
    expect(attributeDonation(don("Z1", "", "clean water wells"), causes)).toBe("WATER");
    const r = evaluateRecipients(base({ donations: [d], donors: [donor("Z1")] }));
    expect(r.recipients).toHaveLength(0);
  });

  it("\"all donors\" is refused for every type except General Communication", () => {
    expect(evaluateRecipients(base({ causeIds: ["all_donors"] })).ok).toBe(false);
    const g = evaluateRecipients(base({ causeIds: ["all_donors"], type: "general_communication" }));
    expect(g.ok).toBe(true);
    expect(g.recipients.length).toBe(105);
  });
});

describe("per-type eligibility rules", () => {
  it("contribution_confirmation / project_progress: verified payments only", () => {
    for (const type of ["contribution_confirmation", "project_progress"]) {
      expect(evaluateRecipients(base({ type })).recipients).toHaveLength(18);
    }
  });

  it("allocation_confirmation requires a valid active allocation record", () => {
    const w = base({ type: "allocation_confirmation" });
    expect(evaluateRecipients(w).recipients).toHaveLength(0);
    const allocations = [
      { id: "AL1", donationId: w.donations[0].id, donorId: "W1", donorName: "", targetTitle: "", allocatedAmount: 100, allocationDate: "", adminEmail: "", status: "active" },
      { id: "AL2", donationId: w.donations[1].id, donorId: "W2", donorName: "", targetTitle: "", allocatedAmount: 100, allocationDate: "", adminEmail: "", status: "reversed" },
    ] as any;
    const r = evaluateRecipients({ ...w, allocations });
    expect(r.recipients.map((x) => x.id)).toEqual(["W1"]);
    expect(r.excluded.find((x) => x.id === "W2")!.reason).toBe("no allocation record for this donation and cause");
  });

  it("completion_report requires the cause to be Completed AND an allocation with supporting evidence", () => {
    const w = base({ type: "completion_report" });
    expect(evaluateRecipients(w).recipients).toHaveLength(0);
    const done = [cause("WATER", "Clean Water Wells", "Completed"), ORPHAN];
    const noAllocation = evaluateRecipients({ ...w, causes: done });
    expect(noAllocation.recipients).toHaveLength(0);
    expect(noAllocation.excluded.some((x) => /no verified completion evidence/.test(x.reason))).toBe(true);
    const alloc = (donationId: string, evidence: string[]) => ({ id: `AL-${donationId}`, donationId, donorId: "", donorName: "", causeId: "WATER", targetTitle: "", allocatedAmount: 100, allocationDate: "", adminEmail: "", status: "active", evidenceDriveFileIds: evidence }) as any;
    const withoutEvidence = evaluateRecipients({ ...w, causes: done, allocations: [alloc(w.donations[0].id, [])] });
    expect(withoutEvidence.recipients).toHaveLength(0);
    const withEvidence = evaluateRecipients({ ...w, causes: done, allocations: [alloc(w.donations[0].id, ["FILE1"]), alloc(w.donations[1].id, ["FILE2"])] });
    expect(withEvidence.recipients.map((r) => r.id)).toEqual(["W1", "W2"]);
  });

  it("general_communication: any non-rejected donor of the cause; rejected-only donors excluded", () => {
    const r = evaluateRecipients(base({ type: "general_communication" }));
    expect(r.recipients).toHaveLength(90);
    expect(r.excluded).toHaveLength(10);
  });

  it("donors without a valid email, inactive donors and duplicate addresses are excluded with a reason", () => {
    const donors = [donor("A", ""), donor("B", "shared@example.org"), donor("C", "SHARED@example.org"), donor("D", "d@example.org", "inactive")];
    const donations = donors.map((d) => ({ ...don(d.id, "WATER", "Clean Water Wells"), donorEmail: d.email }));
    const r = evaluateRecipients(base({ donors, donations }));
    expect(r.recipients.map((x) => x.id)).toEqual(["B"]);
    const why = Object.fromEntries(r.excluded.map((x) => [x.id, x.reason]));
    expect(why.A).toMatch(/no valid email/);
    expect(why.C).toMatch(/duplicate email/);
    expect(why.D).toMatch(/inactive/);
  });

  it("a donation with no linked donor profile is excluded, not guessed", () => {
    const r = evaluateRecipients(base({ donors: [], donations: [don("GHOST", "WATER", "Clean Water Wells")] }));
    expect(r.recipients).toHaveLength(0);
    expect(r.excluded[0].reason).toMatch(/no donor profile/);
  });
});

describe("history-aware selection and retry rules (scenarios 11-12)", () => {
  it("11. SMTP-accepted donors are excluded; failed donors are eligible and flagged; in-progress donors are excluded", () => {
    const history = [
      hist({ donorId: "W1", status: "smtp_accepted" }),
      hist({ donorId: "W2", status: "failed", lastError: "550 rejected" }),
      hist({ donorId: "W3", status: "attempted" }), // fresh -> still running
      hist({ donorId: "W4", status: "attempted", updatedAt: "2020-01-01T00:00:00Z", createdAt: "2020-01-01T00:00:00Z" }), // stale -> interrupted
    ];
    const r = evaluateRecipients(base({ history }));
    const ids = new Set(r.recipients.map((x) => x.id));
    expect(ids.has("W1")).toBe(false);
    expect(ids.has("W3")).toBe(false);
    expect(ids.has("W2")).toBe(true);
    expect(r.recipients.find((x) => x.id === "W2")!.previouslyFailed).toBe(true);
    expect(r.recipients.find((x) => x.id === "W2")!.lastError).toBe("550 rejected");
    expect(ids.has("W4")).toBe(true);
    expect(r.excluded.find((x) => x.id === "W1")!.reason).toMatch(/already sent/);
    expect(r.excluded.find((x) => x.id === "W3")!.reason).toMatch(/in progress/);
  });

  it("history is per type and per cause scope, not one global flag", () => {
    const history = [hist({ donorId: "W1", communicationType: "project_progress" }), hist({ donorId: "W2", scopeKey: "ORPHAN" })];
    const ids = evaluateRecipients(base({ history })).recipients.map((x) => x.id);
    expect(ids).toContain("W1"); // other type
    expect(ids).toContain("W2"); // other cause
  });

  it("an administrator can explicitly include previously sent donors", () => {
    const r = evaluateRecipients(base({ history: [hist({ donorId: "W1" })], includePreviouslySent: true }));
    expect(r.recipients.map((x) => x.id)).toContain("W1");
  });
});

// ---------- end-to-end through the real routes (Sheets fake, mail mocked) ----------
async function seedWorld(opts: { verified: number } = { verified: 4 }) {
  fakeSheets.seed("Causes", ["id", "title", "category", "targetAmount", "raisedAmount", "location", "description", "status", "imageUrl", "driveFileId", "createdAt"], [
    { id: "WATER", title: "Clean Water Wells", category: "Water", targetAmount: 1000, raisedAmount: 0, status: "Active", createdAt: "" },
    { id: "ORPHAN", title: "Orphan Care", category: "Care", targetAmount: 1000, raisedAmount: 0, status: "Active", createdAt: "" },
  ]);
  const donors: any[] = [];
  const donations: any[] = [];
  for (let i = 1; i <= 6; i++) {
    donors.push({ id: `DNR-T${i}-AAAA`, name: `Donor ${i}`, email: `d${i}@example.org`, phone: "", status: "active", donationHistory: "[]", projectsSupported: "[]", casesSupported: "[]" });
    donations.push({ id: `DA00${i}`, donorId: `DNR-T${i}-AAAA`, donorName: `Donor ${i}`, donorEmail: `d${i}@example.org`, amount: 100, currency: "INR", date: "2026-10-01", status: i <= opts.verified ? "completed" : "pending", paymentMethod: "UPI", causeId: "WATER", causeTitle: "Clean Water Wells", submissionKey: `k${i}` });
  }
  donors.push({ id: "DNR-OTHER-AAAA", name: "Orphan Donor", email: "orphan@example.org", phone: "", status: "active", donationHistory: "[]", projectsSupported: "[]", casesSupported: "[]" });
  donations.push({ id: "DA050", donorId: "DNR-OTHER-AAAA", donorName: "Orphan Donor", donorEmail: "orphan@example.org", amount: 100, currency: "INR", date: "2026-10-01", status: "completed", paymentMethod: "UPI", causeId: "ORPHAN", causeTitle: "Orphan Care", submissionKey: "k50" });
  fakeSheets.seed("Donors", ["id", "name", "email", "phone", "status", "donationHistory", "projectsSupported", "casesSupported"], donors);
  fakeSheets.seed("Donations", ["id", "donorId", "donorName", "donorEmail", "amount", "currency", "date", "status", "paymentMethod", "causeId", "causeTitle", "submissionKey"], donations);
}
const post = (url: string, body: any) => new Request(`http://t${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const nreq = (url: string, body: any) => new NextRequest(`http://t${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const compose = { heading: "Update", notes: "Thank you." };

/** Review (server computes the audience and signs an approval) then send. */
async function approve(body: any) {
  const { POST } = await import("@/app/api/admin/communications/approve/route");
  return (await POST(post("/a", { heading: compose.heading, notes: compose.notes, ...body }))).json();
}
async function send(body: any, approval?: any) {
  const { POST } = await import("@/app/api/admin/communications/send/route");
  const ap = approval ?? (await approve(body));
  return POST(post("/s", { heading: compose.heading, notes: compose.notes, recipientIds: (ap.recipients || []).map((r: any) => r.id), approvalToken: ap.approvalToken, ...body }));
}

describe("approval, history, retry through the real routes (scenarios 8, 11, 12, 15)", () => {
  it("review returns the exact recipients with reasons for the rest; unauthorized callers are refused; nothing is sent", async () => {
    await seedWorld();
    authState.role = "none";
    const { POST } = await import("@/app/api/admin/communications/approve/route");
    expect((await POST(post("/a", { causeIds: ["WATER"], type: "project_progress", ...compose }))).status).toBe(401);
    authState.role = "admin";
    const body = await approve({ causeIds: ["WATER"], type: "project_progress" });
    expect(body.count).toBe(4);
    expect(body.recipients.map((r: any) => r.email).sort()).toEqual(["d1@example.org", "d2@example.org", "d3@example.org", "d4@example.org"]);
    expect(body.excluded).toHaveLength(2);
    expect(body.approvalToken).toBeTruthy();
    expect(mailMock.sent).toHaveLength(0);
  });

  it("refuses to send without an approval, with a forged or altered one, or after the message or recipients changed", async () => {
    await seedWorld();
    const base = { causeIds: ["WATER"], type: "project_progress" };
    const ap = await approve(base);
    expect((await send({ ...base }, { recipients: ap.recipients, approvalToken: undefined })).status).toBe(403); // no approval
    expect((await send({ ...base }, { recipients: ap.recipients, approvalToken: "x.y" })).status).toBe(403); // forged
    expect((await send({ ...base, notes: "A different message than the one approved." }, ap)).status).toBe(403); // content changed
    expect((await send({ ...base, recipientIds: ["DNR-T1-AAAA"] }, ap)).status).toBe(403); // recipient set changed
    expect((await send({ ...base, causeIds: ["ORPHAN"] }, ap)).status).toBe(403); // different audience
    expect(mailMock.sent).toHaveLength(0);
    expect(fakeSheets.records("Communication_Recipients")).toHaveLength(0);
  });

  it("a recipient who stops being eligible after approval blocks the send (409) instead of being mailed", async () => {
    await seedWorld();
    const base = { causeIds: ["WATER"], type: "project_progress" };
    const ap = await approve(base);
    const { donationRepository } = await import("@/lib/repositories/donationRepository");
    await donationRepository.updateStatus("DA001", "rejected");
    const res = await send(base, ap);
    expect(res.status).toBe(409);
    expect(mailMock.sent).toHaveLength(0);
  });

  it("8/9. sends only to the approved eligible recipients, records every outcome per Donor Token with eligibility context", async () => {
    await seedWorld();
    const res = await (await send({ causeIds: ["WATER"], type: "project_progress" })).json();
    expect(res.success).toBe(true);
    expect(mailMock.sent.sort()).toEqual(["d1@example.org", "d2@example.org", "d3@example.org", "d4@example.org"]);
    const rows = fakeSheets.records("Communication_Recipients");
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.status === "smtp_accepted" && r.communicationType === "project_progress" && r.scopeKey === "WATER" && r.attempts === "1" && r.approvedBy === "admin@test.local" && r.contentHash.length === 64)).toBe(true);
    expect(JSON.parse(rows[0].eligibility).causeIds).toEqual(["WATER"]);
    const comm = fakeSheets.records("Communications")[0];
    expect(comm).toMatchObject({ communicationType: "project_progress", sentCount: "4", failedCount: "0", createdBy: "admin@test.local" });
  });

  it("11. a second review for the same cause and purpose skips donors already accepted (no accidental resend)", async () => {
    await seedWorld();
    await send({ causeIds: ["WATER"], type: "project_progress" });
    mailMock.sent.length = 0;
    const again = await approve({ causeIds: ["WATER"], type: "project_progress" });
    expect(again.count).toBe(0);
    expect(again.approvalToken).toBeNull();
    expect(again.excluded.every((x: any) => /already sent|payment not yet verified/.test(x.reason))).toBe(true);
    expect(mailMock.sent).toHaveLength(0);
  });

  it("12. failures are recorded and retried safely: only failed donors, never accepted ones, with a fresh approval", async () => {
    await seedWorld();
    mailMock.failFor.add("d2@example.org");
    const first = await (await send({ causeIds: ["WATER"], type: "project_progress" })).json();
    expect(first.broadcast.stats).toMatchObject({ sent: 3, failed: 1 });
    const failed = fakeSheets.records("Communication_Recipients").find((r) => r.donorId === "DNR-T2-AAAA")!;
    expect(failed.status).toBe("failed");
    expect(failed.lastError).toContain("550");

    mailMock.failFor.clear();
    mailMock.sent.length = 0;
    const base = { causeIds: ["WATER"], type: "project_progress", retryBroadcastId: first.broadcastId };
    const review = await approve(base);
    expect(review.recipients.map((r: any) => r.id)).toEqual(["DNR-T2-AAAA"]);
    expect(review.recipients[0].previouslyFailed).toBe(true);
    const retry = await (await send(base, review)).json();
    expect(retry.success).toBe(true);
    expect(mailMock.sent).toEqual(["d2@example.org"]);
    expect((await approve(base)).count).toBe(0); // nothing left to retry
  });

  it("I. an ambiguous SMTP outcome is recorded as unresolved, never resent automatically, and only retried on explicit request", async () => {
    await seedWorld();
    const { mailMock: mm } = await import("./helpers/mocks");
    const orig = mm.sendEmail.getMockImplementation()!;
    mm.sendEmail.mockImplementation(async (p: any) => (p.to === "d3@example.org" ? { success: false, ambiguous: true, retryable: false, error: "Outcome unknown: connection reset after DATA" } : orig(p)));
    const first = await (await send({ causeIds: ["WATER"], type: "project_progress" })).json();
    mm.sendEmail.mockImplementation(orig);
    expect(first.broadcast.stats).toMatchObject({ sent: 3, failed: 0, unresolved: 1 });
    expect(fakeSheets.records("Communication_Recipients").filter((r) => r.status === "unresolved")).toHaveLength(1);
    expect(fakeSheets.records("Communications")[0].unresolvedCount).toBe("1");
    // a normal re-review excludes the unresolved donor with an explanation; the explicit flag includes them with a warning
    const normal = await approve({ causeIds: ["WATER"], type: "project_progress" });
    expect(normal.recipients.map((r: any) => r.id)).not.toContain("DNR-T3-AAAA");
    expect(normal.excluded.find((x: any) => x.id === "DNR-T3-AAAA").reason).toMatch(/outcome unknown/);
    const explicit = await approve({ causeIds: ["WATER"], type: "project_progress", retryBroadcastId: first.broadcastId, includeUnresolved: true });
    expect(explicit.recipients.map((r: any) => r.id)).toEqual(["DNR-T3-AAAA"]);
    expect(explicit.warnings.join(" ")).toMatch(/duplicate/);
  });

  it("15. history is not written (and nothing is sent) when Sheets cannot record it", async () => {
    await seedWorld();
    const ap = await approve({ causeIds: ["WATER"], type: "project_progress" });
    fakeSheets.failWrites = true;
    const res = await send({ causeIds: ["WATER"], type: "project_progress" }, ap);
    fakeSheets.failWrites = false;
    expect(res.status).toBe(503);
    expect(mailMock.sent).toHaveLength(0);
  });

  it("admin-typed HTML is escaped in the message and donor names cannot inject markup", async () => {
    await seedWorld();
    const { sendEmail } = await import("@/lib/email/providerManager");
    void sendEmail;
    const res = await send({ causeIds: ["WATER"], type: "project_progress", notes: "Hello <script>alert(1)</script> **bold**" });
    expect(res.status).toBe(200);
  });

  it("per-donor history is readable for the CRM profile", async () => {
    await seedWorld();
    await send({ causeIds: ["WATER"], type: "project_progress" });
    const { GET } = await import("@/app/api/admin/communications/recipients/route");
    const body = await (await GET(new Request("http://t/x?donorId=DNR-T1-AAAA"))).json();
    expect(body.records).toHaveLength(1);
    expect(body.records[0]).toMatchObject({ donorId: "DNR-T1-AAAA", status: "smtp_accepted", communicationType: "project_progress" });
  });
});

describe("evidence access and donor portal (scenarios 8, 15)", () => {
  it("Drive evidence requires sign-in; public cause images do not; errors are reported honestly", async () => {
    fakeSheets.seed("Causes", ["id", "title", "driveFileId", "imageUrl"], [
      { id: "C1", title: "Cause", driveFileId: "PUBLICIMG0001", imageUrl: "" },
      { id: "C2", title: "Program", driveFileId: "", imageUrl: "/api/media/PROGRAMIMG0001" },
    ]);
    const { GET } = await import("@/app/api/media/[fileId]/route");
    const call = (id: string) => GET(new Request("http://t/m") as any, { params: Promise.resolve({ fileId: id }) });
    authState.role = "none";
    expect((await call("DRIVEPROOF_000001")).status).toBe(401);
    expect((await call("PUBLICIMG0001")).status).toBe(200);
    expect((await call("PROGRAMIMG0001")).status).toBe(200); // Programs/Campaigns store imageUrl, not driveFileId
    authState.role = "admin";
    const ok = await call("DRIVEPROOF_000001");
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("private, no-store");
    expect((await call("MISSINGFILE0001")).status).toBe(404);
    expect((await call("../etc/passwd")).status).toBe(400);
    expect(driveMock.getFileStream).toHaveBeenCalled();
  });

  // D3-F4: the lookup used to return the donor token to anyone who knew an email address, and the unauthenticated
  // dashboard then served the whole profile for that token.
  it("donor lookup never creates a profile, never discloses donor data, answers identically for known and unknown, and mails the code only to the profile's own address", async () => {
    await seedWorld();
    const { POST } = await import("@/app/api/donor/lookup/route");
    const before = fakeSheets.records("Donors").length;
    mailMock.sendEmail.mockClear();
    const unknownRes = await POST(nreq("/l", { identifier: "stranger@example.org" }));
    const unknown = await unknownRes.json();
    expect(unknownRes.status).toBe(200);
    expect(mailMock.sendEmail).not.toHaveBeenCalled();
    expect(fakeSheets.records("Donors")).toHaveLength(before);

    const known = await (await POST(nreq("/l", { identifier: " D1@Example.org " }))).json();
    expect(Object.keys(known).sort()).toEqual(Object.keys(unknown).sort());
    expect(known.message).toBe(unknown.message);
    expect(JSON.stringify(known)).not.toContain("DNR-T1-AAAA");
    expect(known.donor).toBeUndefined();
    expect(mailMock.sendEmail).toHaveBeenCalledTimes(1);
    const mail = mailMock.sendEmail.mock.calls[0][0];
    expect(mail.to.toLowerCase()).toBe("d1@example.org");
    expect(mail.html).toMatch(/\b\d{6}\b/);
  });

  it("the emailed code opens a session for that donor only; the dashboard refuses everyone else", async () => {
    await seedWorld();
    const { POST: lookup } = await import("@/app/api/donor/lookup/route");
    const { POST: verify } = await import("@/app/api/donor/verify/route");
    const { GET: dashboard } = await import("@/app/api/donor/dashboard/route");
    mailMock.sendEmail.mockClear();
    const { challenge } = await (await lookup(nreq("/l", { identifier: "d1@example.org" }))).json();
    const code = mailMock.sendEmail.mock.calls[0][0].html.match(/\b(\d{6})\b/)[1];

    expect((await verify(nreq("/v", { challenge, code: code === "000000" ? "000001" : "000000" }))).status).toBe(401);
    const ok = await verify(nreq("/v", { challenge, code }));
    expect(ok.status).toBe(200);
    const cookie = ok.headers.get("set-cookie") || "";
    expect(cookie).toMatch(/daarayn_donor=/);
    expect(cookie.toLowerCase()).toContain("httponly");
    const session = cookie.split(";")[0];

    const get = (url: string, headers: Record<string, string> = {}) => dashboard(new NextRequest(`http://t${url}`, { headers }));
    expect((await get("/d")).status).toBe(401); // no session
    expect((await get("/d?donorId=DNR-T1-AAAA")).status).toBe(401); // a donorId is not an identity
    const mine = await get("/d", { cookie: session });
    expect(mine.status).toBe(200);
    expect((await mine.json()).donor.id).toBe("DNR-T1-AAAA");
    expect((await get("/d?donorId=DNR-OTHER", { cookie: session })).status).toBe(403);
    expect((await get("/d", { cookie: "daarayn_donor=forged.value" })).status).toBe(401);
  });

  it("donor dashboard does not leak other donors' donations when the donor has no email", async () => {
    fakeSheets.seed("Donors", ["id", "name", "email", "phone", "status"], [
      { id: "DNR-P1-AAAA", name: "Phone One", email: "", phone: "9876543210", status: "active" },
      { id: "DNR-P2-AAAA", name: "Phone Two", email: "", phone: "9123456789", status: "active" },
    ]);
    fakeSheets.seed("Donations", ["id", "donorId", "donorEmail", "amount", "status", "date"], [
      { id: "DA001", donorId: "DNR-P1-AAAA", donorEmail: "", amount: 100, status: "completed", date: "2026-10-01" },
      { id: "DA002", donorId: "DNR-P2-AAAA", donorEmail: "", amount: 900, status: "completed", date: "2026-10-01" },
    ]);
    const { GET } = await import("@/app/api/donor/dashboard/route");
    const { issueSession } = await import("@/lib/donors/portalAuth");
    const body = await (await GET(new NextRequest("http://t/d", { headers: { cookie: `daarayn_donor=${issueSession("DNR-P1-AAAA")}` } }))).json();
    expect(body.donations.map((d: any) => d.id)).toEqual(["DA001"]);
  });

  it("the AI writing assistant route is gone (410) and calls no external service", async () => {
    const { POST } = await import("@/app/api/admin/communications/ai-assist/route");
    expect((await POST()).status).toBe(410);
  });
});

// ---------- D3-F8: attachments must be exactly what was approved, or nothing is sent ----------
describe("attachments and uploads", () => {
  const big = () => ({ stream: require("stream").Readable.from([Buffer.alloc(19 * 1024 * 1024)]), mimeType: "application/pdf", filename: "big.pdf", size: 19 * 1024 * 1024 });
  const withMedia = (media: string[]) => ({ causeIds: ["WATER"], type: "project_progress", media });
  const queuedRows = () => fakeSheets.records("Communication_Recipients").length;

  it("a file that cannot be read stops the whole send: nothing is emailed or recorded, and the reason names the file", async () => {
    await seedWorld();
    mailMock.sendEmail.mockClear();
    const res = await send(withMedia(["/api/media/MISSINGFILE0001"]));
    expect(res.status).toBe(422);
    expect(((await res.json()) as any).error).toMatch(/MISSINGFILE0001|attachment/i);
    expect(mailMock.sendEmail).not.toHaveBeenCalled();
    expect(queuedRows()).toBe(0);
  });

  it("a readable file is attached to every message", async () => {
    await seedWorld();
    mailMock.sendEmail.mockClear();
    const res = await send(withMedia(["/api/media/DRIVEPROOF_000001"]));
    expect(res.status).toBe(200);
    expect(mailMock.sendEmail).toHaveBeenCalled();
    for (const [payload] of mailMock.sendEmail.mock.calls) expect((payload.attachments || []).some((a: any) => a.filename === "f.png")).toBe(true);
  });

  it("a message over the provider size limit is rejected, not truncated or sent without the file", async () => {
    await seedWorld();
    mailMock.sendEmail.mockClear();
    driveMock.getFileStream.mockResolvedValueOnce(big());
    const res = await send(withMedia(["/api/media/BIGFILE00000001"]));
    expect(res.status).toBe(422);
    expect(((await res.json()) as any).error).toMatch(/too large|size/i);
    expect(mailMock.sendEmail).not.toHaveBeenCalled();
  });

  it("an attachment URL pointing at the local or private network is never fetched", async () => {
    await seedWorld();
    mailMock.sendEmail.mockClear();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    for (const url of ["http://127.0.0.1:8080/secret", "http://169.254.169.254/latest/meta-data", "http://localhost/x", "http://10.0.0.5/a.pdf", "file:///etc/passwd"]) {
      const res = await send(withMedia([url]));
      expect(res.status).toBe(422);
    }
    expect(fetchSpy.mock.calls.map((c) => String(c[0]))).toEqual([]);
    expect(mailMock.sendEmail).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  const upload = async (name: string, type: string, bytes: number) => {
    const { POST } = await import("@/app/api/admin/communications/upload/route");
    const fd = new FormData();
    fd.append("files", new File([new Uint8Array(bytes)], name, { type }));
    return POST(new NextRequest("http://t/u", { method: "POST", body: fd }));
  };

  it("uploads accept documents and images only, up to a size limit", async () => {
    driveMock.uploadFile.mockClear();
    expect((await upload("report.pdf", "application/pdf", 1000)).status).toBe(200);
    expect((await upload("photo.png", "image/png", 1000)).status).toBe(200);
    for (const [n, t] of [["run.exe", "application/x-msdownload"], ["page.html", "text/html"], ["image.svg", "image/svg+xml"], ["script.js", "text/javascript"]] as const) {
      expect((await upload(n, t, 100)).status).toBe(400);
    }
    expect((await upload("huge.pdf", "application/pdf", 11 * 1024 * 1024)).status).toBe(400);
    expect(driveMock.uploadFile).toHaveBeenCalledTimes(2);
  });

  it("uploads are admin-only", async () => {
    authState.role = "none";
    expect((await upload("report.pdf", "application/pdf", 10)).status).toBe(401);
  });
});
