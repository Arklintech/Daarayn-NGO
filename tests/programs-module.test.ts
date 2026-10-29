import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { fakeSheets } from "./helpers/fakeSheets";
import { resetWorld, authState } from "./helpers/mocks";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

const CAUSE_HEADERS = ["id", "title", "category", "targetAmount", "raisedAmount", "location", "description", "status", "imageUrl", "driveFileId", "createdAt", "kind"];
const adminPost = async (body: any) => (await import("@/app/api/admin/programs/route")).POST(new NextRequest("http://t/api/admin/programs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
const adminGet = async () => (await import("@/app/api/admin/programs/route")).GET(new NextRequest("http://t/api/admin/programs"));
const publicGet = async (qs = "") => {
  authState.role = "none";
  const res = await (await import("@/app/api/programs/route")).GET(new NextRequest(`http://t/api/programs${qs}`));
  authState.role = "admin";
  return res;
};
const causeRows = () => fakeSheets.records("Causes");
const contentRows = () => fakeSheets.records("Program_Content");

const program = (over: any = {}) => ({
  id: "PROGRAM-T1", kind: "project", title: "Test Relief Program", category: "Relief", targetAmount: 5000, status: "Draft", description: "Synthetic.",
  content: { template: "relief", cardSummary: "Short summary", cardDetails: ["Line one", "Line two"], ctaText: "View Program", sortOrder: 10, lead: "Lead text", heroAlt: "alt", heroCaption: "caption", primaryCtaText: "Fund This Case",
    sections: [{ type: "checklist", title: "Supports", items: ["Rent", "Ration"] }, { type: "panel", title: "What you receive", items: ["Tracking ID"] }] },
  ...over,
});

beforeEach(async () => {
  await resetWorld();
  fakeSheets.seed("Causes", CAUSE_HEADERS, []);
  (await import("@/lib/catalog/programs")).invalidatePublicPrograms();
  (await import("@/lib/catalog/public")).invalidatePublicCatalog();
  const { programContentRepository } = await import("@/lib/catalog/programContent");
  programContentRepository.invalidateCache();
});

describe("one module for programs, campaigns and causes (one id, one lifecycle)", () => {
  it("creating a program stores ONE cause row (kind project, the permanent id) and ONE content row with the same id", async () => {
    const res = await adminPost(program());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(causeRows()).toHaveLength(1);
    expect(causeRows()[0]).toMatchObject({ id: "PROGRAM-T1", kind: "project", status: "Draft" });
    expect(contentRows()).toHaveLength(1);
    expect(contentRows()[0]).toMatchObject({ id: "PROGRAM-T1", template: "relief", sortOrder: "10" });
    expect(JSON.parse(contentRows()[0].sections)).toHaveLength(2);
  });

  it("the admin list shows every kind with content; editing keeps the id and does not duplicate rows", async () => {
    await adminPost(program());
    await adminPost(program({ id: "CAMPAIGN-T1", kind: "campaign", title: "Test Campaign", content: { template: "custom" } }));
    await adminPost(program({ id: "CAUSE-T1", kind: "cause", title: "Test Cause", content: {} }));
    await adminPost(program({ title: "Renamed Program", content: { template: "relief", lead: "Edited lead" } }));
    const list = (await (await adminGet()).json()) as any[];
    expect(list.map((i) => i.id).sort()).toEqual(["CAMPAIGN-T1", "CAUSE-T1", "PROGRAM-T1"]);
    expect(list.find((i) => i.id === "PROGRAM-T1")).toMatchObject({ title: "Renamed Program", content: { lead: "Edited lead" } });
    expect(causeRows()).toHaveLength(3);
    expect(contentRows()).toHaveLength(3);
  });

  it("triple submission of the same program creates one row of each", async () => {
    const results = await Promise.all([adminPost(program({ status: "Active" })), adminPost(program({ status: "Active" })), adminPost(program({ status: "Active" }))]);
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(causeRows()).toHaveLength(1);
    expect(contentRows()).toHaveLength(1);
  });

  it("server-side validation stores nothing: unknown template, bad section, too many sections, bad order, missing id/title, active without target", async () => {
    const bad = [
      program({ content: { template: "carousel" } }),
      program({ content: { template: "relief", sections: [{ type: "video" }] } }),
      program({ content: { template: "relief", sections: [{ type: "checklist", items: [] }] } }),
      program({ content: { template: "relief", sections: Array.from({ length: 13 }, () => ({ type: "text", body: "x" })) } }),
      program({ content: { template: "relief", sortOrder: -3 } }),
      program({ content: { template: "project", sections: [{ type: "needs", needs: [{ name: "Fans", amount: -1 }] }] } }),
      program({ id: "" }),
      program({ title: "" }),
      program({ status: "Active", targetAmount: 0 }),
    ];
    for (const b of bad) expect((await adminPost(b)).status).toBe(400);
    expect(causeRows()).toHaveLength(0);
    expect(contentRows()).toHaveLength(0);
  });

  it("mutations require an administrator", async () => {
    authState.role = "none";
    expect((await adminPost(program())).status).toBe(401);
    expect((await adminGet()).status).toBe(401);
    expect(causeRows()).toHaveLength(0);
  });
});

describe("public programs: published only, in the administrator's order", () => {
  it("Draft is invisible; Active and Urgent appear ordered by sortOrder; Completed and Inactive disappear; ids and records stay", async () => {
    await adminPost(program({ id: "PROGRAM-B", title: "Second", status: "Active", content: { template: "custom", sortOrder: 20 } }));
    await adminPost(program({ id: "PROGRAM-A", title: "First", status: "Urgent", content: { template: "custom", sortOrder: 5 } }));
    await adminPost(program({ id: "PROGRAM-D", title: "Hidden draft", status: "Draft", content: { template: "custom" } }));
    const ids = async (qs = "") => ((await (await publicGet(qs)).json()) as any[]).map((p) => p.id);
    expect(await ids("?kind=project")).toEqual(["PROGRAM-A", "PROGRAM-B"]);
    expect(await ids("?id=PROGRAM-D")).toEqual([]);
    await adminPost(program({ id: "PROGRAM-B", title: "Second", status: "Completed", content: { template: "custom", sortOrder: 20 } }));
    await adminPost(program({ id: "PROGRAM-A", title: "First", status: "Inactive", content: { template: "custom", sortOrder: 5 } }));
    expect(await ids("?kind=project")).toEqual([]);
    expect(causeRows().map((c) => c.id).sort()).toEqual(["PROGRAM-A", "PROGRAM-B", "PROGRAM-D"]);
    expect(contentRows()).toHaveLength(3);
  });

  it("the public API carries the page content and an evidence-based funding figure, and the same cause appears in the donation catalog", async () => {
    await adminPost(program({ status: "Active" }));
    fakeSheets.seed("Donations", ["id", "donorId", "amount", "status", "causeId"], [{ id: "DA001", donorId: "DNR-1", amount: 1500, status: "completed", causeId: "PROGRAM-T1" }, { id: "DA002", donorId: "DNR-2", amount: 700, status: "pending", causeId: "PROGRAM-T1" }]);
    fakeSheets.seed("Donation_Causes", ["id", "donationId", "causeId", "amount", "kind"], []);
    (await import("@/lib/catalog/programs")).invalidatePublicPrograms();
    const [p] = (await (await publicGet("?id=PROGRAM-T1")).json()) as any[];
    expect(p).toMatchObject({ id: "PROGRAM-T1", title: "Test Relief Program", content: { template: "relief", cardSummary: "Short summary", primaryCtaText: "Fund This Case" } });
    expect(typeof p.raisedAmount).toBe("number");
    expect(p.raisedAmount).toBeLessThanOrEqual(1500); // pending money is never counted
    authState.role = "none";
    const cat = (await (await (await import("@/app/api/causes/route")).GET(new NextRequest("http://t/api/causes"))).json()) as any[];
    authState.role = "admin";
    expect(cat.map((c) => c.id)).toContain("PROGRAM-T1"); // quick ribbon and donation form read this
  });

  it("the donation form and ribbon ask for the PUBLIC view: a signed-in administrator still never sees Draft/Completed/Inactive entries there", async () => {
    await adminPost(program({ id: "PROGRAM-OPEN", title: "Open one", status: "Active" }));
    await adminPost(program({ id: "PROGRAM-DRAFT", title: "Draft one", status: "Draft", content: { template: "custom" } }));
    await adminPost(program({ id: "PROGRAM-DONE", title: "Done one", status: "Completed", content: { template: "custom" } }));
    const { GET } = await import("@/app/api/causes/route");
    const ids = async (qs: string) => ((await (await GET(new NextRequest(`http://t/api/causes${qs}`))).json()) as any[]).map((c) => c.id).sort();
    expect(authState.role).toBe("admin");
    expect(await ids("?scope=public")).toEqual(["PROGRAM-OPEN"]);
    expect(await ids("")).toEqual(["PROGRAM-DONE", "PROGRAM-DRAFT", "PROGRAM-OPEN"]); // admin screens keep the full list
  });

  it("an unreadable catalog answers 503 and no fallback content", async () => {
    const real = fakeSheets.getAllRows.bind(fakeSheets);
    (fakeSheets as any).getAllRows = async () => { throw new Error("Sheets unavailable"); };
    (await import("@/lib/catalog/programs")).invalidatePublicPrograms();
    const res = await publicGet();
    (fakeSheets as any).getAllRows = real;
    expect(res.status).toBe(503);
  });
});

describe("partial failure is recoverable and never reported as success", () => {
  it("content stored but the program record fails: 500 with partial=true, nothing public, and saving again completes it", async () => {
    const { causeRepository } = await import("@/lib/repositories/causeRepository");
    const spy = vi.spyOn(causeRepository, "save").mockRejectedValueOnce(new Error("Sheets write failed"));
    const res = await adminPost(program({ status: "Active" }));
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body).toMatchObject({ partial: true, contentSaved: true, causeId: "PROGRAM-T1" });
    expect(body.success).toBeUndefined();
    expect(causeRows()).toHaveLength(0);
    expect(((await (await publicGet()).json()) as any[])).toHaveLength(0);
    spy.mockRestore();
    const again = await adminPost(program({ status: "Active" }));
    expect((await again.json()).success).toBe(true);
    expect(causeRows()).toHaveLength(1);
    expect(contentRows()).toHaveLength(1);
    expect(((await (await publicGet()).json()) as any[]).map((p) => p.id)).toEqual(["PROGRAM-T1"]);
  });

  it("content cannot be stored: nothing is created and the error says nothing was published", async () => {
    const { programContentRepository } = await import("@/lib/catalog/programContent");
    const spy = vi.spyOn(programContentRepository, "save").mockRejectedValueOnce(new Error("Sheets write failed"));
    const res = await adminPost(program({ status: "Active" }));
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toMatch(/Nothing was published/);
    expect(causeRows()).toHaveLength(0);
    spy.mockRestore();
  });

  it("a revalidation failure after a successful save is reported, and the data stays saved", async () => {
    const cache = await import("next/cache");
    (cache.revalidateTag as any).mockImplementationOnce(() => { throw new Error("revalidate unavailable"); });
    const res = await adminPost(program({ status: "Active" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.publication).toMatchObject({ persisted: true, publicVisible: true, publicPagesRefreshed: false });
    expect(causeRows()).toHaveLength(1);
  });
});

describe("downstream: donations and communications use the same permanent id", () => {
  const seedDonors = () => {
    fakeSheets.seed("Donors", ["id", "name", "email", "phone", "status", "donationHistory", "projectsSupported", "casesSupported"], [
      { id: "DNR-1", name: "Donor 1", email: "d1@example.org", phone: "", status: "active", donationHistory: "[]", projectsSupported: "[]", casesSupported: "[]" },
      { id: "DNR-2", name: "Donor 2", email: "d2@example.org", phone: "", status: "active", donationHistory: "[]", projectsSupported: "[]", casesSupported: "[]" },
    ]);
  };
  const approve = async (causeId: string) => {
    const { POST } = await import("@/app/api/admin/communications/approve/route");
    return (await POST(new Request("http://t/a", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ causeIds: [causeId], type: "project_progress", heading: "Update", notes: "Text" }) }))).json();
  };

  it("a program's cause resolves in Communications from real donor/donation links only; an empty audience stays empty (never all donors); nothing is sent by publishing", async () => {
    await adminPost(program({ status: "Active" }));
    seedDonors();
    fakeSheets.seed("Donations", ["id", "donorId", "donorName", "donorEmail", "amount", "status", "causeId", "causeTitle", "submissionKey"], []);
    const { mailMock } = await import("./helpers/mocks");
    mailMock.sendEmail.mockClear();
    expect((await approve("PROGRAM-T1")).count).toBe(0); // nobody donated to it yet: audience empty, not widened
    fakeSheets.seed("Donations", ["id", "donorId", "donorName", "donorEmail", "amount", "status", "causeId", "causeTitle", "submissionKey"], [
      { id: "DA001", donorId: "DNR-1", donorName: "Donor 1", donorEmail: "d1@example.org", amount: 100, status: "completed", causeId: "PROGRAM-T1", causeTitle: "Test Relief Program", submissionKey: "k1" },
    ]);
    const body = await approve("PROGRAM-T1");
    expect(body.count).toBe(1);
    expect(body.recipients.map((r: any) => r.email)).toEqual(["d1@example.org"]);
    expect(mailMock.sendEmail).not.toHaveBeenCalled();
  });

  it("history stays linked after the program is completed or unpublished", async () => {
    await adminPost(program({ status: "Active" }));
    fakeSheets.seed("Donations", ["id", "donorId", "amount", "status", "causeId"], [{ id: "DA001", donorId: "DNR-1", amount: 100, status: "completed", causeId: "PROGRAM-T1" }]);
    await adminPost(program({ status: "Completed" }));
    await adminPost(program({ status: "Inactive" }));
    expect(fakeSheets.records("Donations")[0].causeId).toBe("PROGRAM-T1");
    expect(causeRows()[0].id).toBe("PROGRAM-T1");
  });
});

describe("admin navigation consolidation", () => {
  const ROOT = path.resolve(__dirname, "..");
  const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

  it("the sidebar lists only Programs under Programs & Causes; Campaigns and Cause Management Center are gone from navigation", () => {
    const nav = read("app/admin/AdminLayoutClient.tsx");
    const section = nav.slice(nav.indexOf('title: "Programs & Causes"'), nav.indexOf('title: "Financial Operations"'));
    expect(section).toContain('href: "/admin/programs"');
    expect(section).not.toMatch(/Campaigns|Cause Management Center|\/admin\/campaigns|\/admin\/causes"/);
    expect((section.match(/name:/g) || []).length).toBe(1);
  });

  it("old entry points redirect to Programs and no screen links to a removed route", () => {
    expect(read("app/admin/campaigns/page.tsx")).toContain('redirect("/admin/programs")');
    expect(read("app/admin/causes/page.tsx")).toContain('redirect("/admin/programs")');
    for (const f of ["lib/notifications.ts", "app/admin/notifications/page.tsx", "app/admin/causes/[causeId]/page.tsx", "app/admin/field-ops/[id]/page.tsx"]) {
      expect(read(f)).not.toMatch(/router\.push\("\/admin\/causes"\)|href: "\/admin\/causes",|Cause Management Center/);
    }
  });

  it("Financial Operations, Donors and Communications navigation is unchanged", () => {
    const nav = read("app/admin/AdminLayoutClient.tsx");
    for (const href of ["/admin/designations", "/admin/allocations", "/admin/reconciliation", "/admin/donors", "/admin/communications", "/admin/donations"]) expect(nav).toContain(`href: "${href}"`);
  });
});
