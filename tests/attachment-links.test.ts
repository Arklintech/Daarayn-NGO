import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { fakeSheets } from "./helpers/fakeSheets";
import { resetWorld, mailMock, authState, driveMock } from "./helpers/mocks";

// D4-T2: files too large to attach go out as personal secure links; file identity is bound to the approval.
const MB = 1024 * 1024;
const post = (url: string, body: any) => new Request(`http://t${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const compose = { heading: "Update", notes: "Thank you." };

function seedWorld() {
  fakeSheets.seed("Causes", ["id", "title", "category", "targetAmount", "raisedAmount", "location", "description", "status", "imageUrl", "driveFileId", "createdAt"], [
    { id: "WATER", title: "Clean Water Wells", category: "Water", targetAmount: 1000, raisedAmount: 0, status: "Active", createdAt: "" },
  ]);
  const donors: any[] = [];
  const donations: any[] = [];
  for (let i = 1; i <= 4; i++) {
    donors.push({ id: `DNR-T${i}-AAAA`, name: `Donor ${i}`, email: `d${i}@example.org`, phone: "", status: "active", donationHistory: "[]", projectsSupported: "[]", casesSupported: "[]" });
    donations.push({ id: `DA00${i}`, donorId: `DNR-T${i}-AAAA`, donorName: `Donor ${i}`, donorEmail: `d${i}@example.org`, amount: 100, currency: "INR", date: "2026-10-01", status: "completed", paymentMethod: "UPI", causeId: "WATER", causeTitle: "Clean Water Wells", submissionKey: `k${i}` });
  }
  fakeSheets.seed("Donors", ["id", "name", "email", "phone", "status", "donationHistory", "projectsSupported", "casesSupported"], donors);
  fakeSheets.seed("Donations", ["id", "donorId", "donorName", "donorEmail", "amount", "currency", "date", "status", "paymentMethod", "causeId", "causeTitle", "submissionKey"], donations);
}
async function approve(body: any) {
  const { POST } = await import("@/app/api/admin/communications/approve/route");
  return (await POST(post("/a", { ...compose, ...body }))).json();
}
async function send(body: any, approval?: any) {
  const { POST } = await import("@/app/api/admin/communications/send/route");
  const ap = approval ?? (await approve(body));
  return POST(post("/s", { ...compose, recipientIds: (ap.recipients || []).map((r: any) => r.id), approvalToken: ap.approvalToken, ...body }));
}

const addFile = (id: string, name: string, mb: number, fill: number) => driveMock.files.set(id, { name, mimeType: "application/pdf", content: Buffer.alloc(mb * MB, fill) });
const media = (...ids: string[]) => ids.map((i) => `/api/media/${i}`);
const body = (m: string[]) => ({ causeIds: ["WATER"], type: "project_progress", media: m });
const sentHtml = () => mailMock.sendEmail.mock.calls.map(([p]) => String(p.html));
const tokenIn = (html: string) => html.match(/\/api\/files\/share\/([A-Za-z0-9_.-]+)/)?.[1] || "";
const share = async (token: string) => (await import("@/app/api/files/share/[token]/route")).GET(new NextRequest(`http://t/api/files/share/${token}`), { params: Promise.resolve({ token }) });
const THREE = media("FILEAAAAAAA1", "FILEBBBBBBB2", "FILECCCCCCC3");

beforeEach(async () => {
  await resetWorld();
  process.env.PORTAL_SIGNING_SECRET = "test-secret";
  addFile("FILEAAAAAAA1", "annual-report.pdf", 8, 1);
  addFile("FILEBBBBBBB2", "audit-statement.pdf", 8, 2);
  addFile("FILECCCCCCC3", "photos.pdf", 2, 3);
  seedWorld();
});

describe("attachments: direct files and secure links", () => {
  it("the review shows how each file will be delivered; files beyond the budget become secure links, the rest are attached", async () => {
    const ap = await approve(body(THREE));
    expect(ap.attachments).toEqual([
      { name: "annual-report.pdf", sizeBytes: 8 * MB, delivery: "attached" },
      { name: "audit-statement.pdf", sizeBytes: 8 * MB, delivery: "secure-link" },
      { name: "photos.pdf", sizeBytes: 2 * MB, delivery: "attached" },
    ]);
    expect(ap.warnings.join(" ")).toMatch(/secure links/i);
  });

  it("every selected file is accounted for in every message: attached or linked, never dropped; links are personal", async () => {
    mailMock.sendEmail.mockClear();
    const res = await send(body(THREE));
    expect(res.status).toBe(200);
    const calls = mailMock.sendEmail.mock.calls.map(([p]) => p);
    expect(calls).toHaveLength(4);
    for (const p of calls) {
      expect(p.attachments.map((a: any) => a.filename).sort()).toEqual(["annual-report.pdf", "photos.pdf"]);
      expect(p.html).toContain("audit-statement.pdf");
      expect(p.html).toContain("/api/files/share/");
      expect(p.html).not.toContain("/api/media/"); // never a link that only admins can open
    }
    const tokens = sentHtml().map(tokenIn);
    expect(new Set(tokens).size).toBe(4);
    for (const t of tokens) expect(Buffer.from(t.split(".")[0], "base64url").toString()).not.toMatch(/@|example\.org/);
  });

  it("a share link serves the exact approved bytes to an anonymous recipient, as a download", async () => {
    await send(body(THREE));
    const token = tokenIn(sentHtml()[0]);
    authState.role = "none";
    const res = await share(token);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/^attachment/);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(Buffer.from(await res.arrayBuffer()).equals(Buffer.alloc(8 * MB, 2))).toBe(true);
  });

  it("a tampered, foreign or expired link is refused", async () => {
    await send(body(THREE));
    const token = tokenIn(sentHtml()[0]);
    expect((await share(token.slice(0, -2) + "xx")).status).toBe(404);
    expect((await share("garbage")).status).toBe(404);
    const { issueShareToken } = await import("@/lib/communications/attachments");
    const old = issueShareToken({ driveId: "FILEBBBBBBB2", fingerprint: "x", broadcastId: "B", recipient: "r" }, Date.now() - 40 * 24 * 3600 * 1000);
    expect((await share(old)).status).toBe(410);
  });

  it("a file replaced, trashed or removed after sending is refused honestly (410), never served as different content", async () => {
    await send(body(THREE));
    const token = tokenIn(sentHtml()[0]);
    driveMock.files.get("FILEBBBBBBB2")!.content = Buffer.alloc(8 * MB, 9);
    expect((await share(token)).status).toBe(410);
    driveMock.files.set("FILEBBBBBBB2", { name: "audit-statement.pdf", mimeType: "application/pdf", content: Buffer.alloc(8 * MB, 2), trashed: true });
    expect((await share(token)).status).toBe(410);
    driveMock.files.delete("FILEBBBBBBB2");
    expect((await share(token)).status).toBe(410);
  });

  it("a file that changes between approval and sending stops the send: nothing is emailed or recorded", async () => {
    const b = body(media("FILEAAAAAAA1", "FILEBBBBBBB2"));
    const ap = await approve(b);
    driveMock.files.get("FILEAAAAAAA1")!.content = Buffer.alloc(8 * MB, 7);
    mailMock.sendEmail.mockClear();
    const res = await send(b, ap);
    expect(res.status).toBe(403);
    expect(((await res.json()) as any).code).toBe("APPROVAL_REQUIRED");
    expect(mailMock.sendEmail).not.toHaveBeenCalled();
    expect(fakeSheets.records("Communication_Recipients")).toHaveLength(0);
  });

  it("a file that is missing or trashed cannot be approved or sent", async () => {
    driveMock.files.set("FILEAAAAAAA1", { name: "annual-report.pdf", mimeType: "application/pdf", content: Buffer.alloc(10, 1), trashed: true });
    const { POST } = await import("@/app/api/admin/communications/approve/route");
    for (const m of [media("FILEAAAAAAA1"), media("MISSINGFILE0001")]) {
      expect((await POST(post("/a", { causeIds: ["WATER"], type: "project_progress", ...compose, media: m }))).status).toBe(422);
    }
    mailMock.sendEmail.mockClear();
    expect((await send(body(media("MISSINGFILE0001")), { approvalToken: "x", recipients: [] })).status).toBe(422);
    expect(mailMock.sendEmail).not.toHaveBeenCalled();
  });

  it("the link mechanism creates nothing on Drive: no upload, no sharing permission", async () => {
    driveMock.uploadFile.mockClear();
    await send(body(THREE));
    expect(driveMock.uploadFile).not.toHaveBeenCalled();
    expect((driveMock as any).permissions).toBeUndefined();
  });

  it("small files are simply attached and need no link", async () => {
    mailMock.sendEmail.mockClear();
    await send(body(media("FILECCCCCCC3")));
    for (const [p] of mailMock.sendEmail.mock.calls) {
      expect(p.attachments.map((a: any) => a.filename)).toEqual(["photos.pdf"]);
      expect(p.html).not.toContain("/api/files/share/");
    }
  });
});
