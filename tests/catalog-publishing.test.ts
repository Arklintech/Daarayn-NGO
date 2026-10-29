import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeSheets } from "./helpers/fakeSheets";
import { resetWorld, authState } from "./helpers/mocks";

const revalidate = vi.hoisted(() => vi.fn());
const revalidateTag = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath: revalidate, revalidateTag }));

const HEADERS = ["id", "title", "category", "targetAmount", "raisedAmount", "location", "description", "status", "imageUrl", "driveFileId", "createdAt", "kind"];
const causes = () => fakeSheets.records("Causes");
const post = (body: any) => new NextRequest("http://t/api/causes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const get = (qs = "") => new NextRequest(`http://t/api/causes${qs}`);
const save = async (body: any) => (await import("@/app/api/causes/route")).POST(post(body));
const list = async (qs = "") => (await import("@/app/api/causes/route")).GET(get(qs));

beforeEach(async () => {
  await resetWorld();
  revalidate.mockReset();
  revalidateTag.mockReset();
  fakeSheets.seed("Causes", HEADERS, []);
  const pub = await import("@/lib/catalog/public");
  pub.invalidatePublicCatalog();
});

const base = (over: any = {}) => ({ title: "Test Well", category: "Water", description: "Synthetic", targetAmount: 1000, ...over });

describe("programs, campaigns and causes: one Sheets-backed catalog told apart by kind", () => {
  it("creating persists one row with a permanent id and the kind; the admin list shows the persisted record", async () => {
    const res = await save(base({ id: "PROGRAM-T1", kind: "project", status: "Draft" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success && body.created).toBe(true);
    expect(causes()).toHaveLength(1);
    expect(causes()[0]).toMatchObject({ id: "PROGRAM-T1", kind: "project", status: "Draft", title: "Test Well" });
    const admin = await (await list("?kind=project")).json();
    expect(admin.map((c: any) => c.id)).toEqual(["PROGRAM-T1"]);
    expect((await (await list("?kind=campaign")).json())).toEqual([]);
  });

  it("editing updates the same row (permanent id kept, no duplicate), including a title change", async () => {
    await save(base({ id: "CAMP-T1", kind: "campaign", status: "Draft" }));
    const res = await save(base({ id: "CAMP-T1", kind: "campaign", title: "Renamed Campaign", status: "Draft" }));
    expect((await res.json()).created).toBe(false);
    expect(causes()).toHaveLength(1);
    expect(causes()[0]).toMatchObject({ id: "CAMP-T1", title: "Renamed Campaign" });
  });

  it("double-click / repeated simultaneous submission with the same id creates exactly one entry", async () => {
    const body = base({ id: "PROGRAM-DBL", kind: "project", status: "Active" });
    const results = await Promise.all([save(body), save(body), save(body), save(body)]);
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(causes().filter((c) => c.id === "PROGRAM-DBL")).toHaveLength(1);
  });

  it("a different id with the same title is refused (409): no duplicate entity", async () => {
    await save(base({ id: "PROGRAM-A", kind: "project" }));
    const res = await save(base({ id: "PROGRAM-B", kind: "project" }));
    expect(res.status).toBe(409);
    expect(causes()).toHaveLength(1);
  });

  it("validation: missing title, bad status, negative target, active without a target, unsafe id", async () => {
    expect((await save(base({ title: "" }))).status).toBe(400);
    expect((await save(base({ status: "Published" }))).status).toBe(400);
    expect((await save(base({ targetAmount: -5 }))).status).toBe(400);
    expect((await save(base({ id: "PROGRAM-Z", status: "Active", targetAmount: 0 }))).status).toBe(400);
    expect((await save(base({ id: "../x" }))).status).toBe(400);
    expect(causes()).toHaveLength(0);
  });

  it("mutations require an administrator", async () => {
    authState.role = "none";
    expect((await save(base())).status).toBe(401);
    expect(causes()).toHaveLength(0);
  });
});

describe("publishing lifecycle and public visibility", () => {
  const publicIds = async (qs = "") => {
    authState.role = "none";
    const res = await list(qs);
    authState.role = "admin";
    return { status: res.status, ids: res.status === 200 ? ((await res.json()) as any[]).map((c) => c.id) : [] };
  };

  it("Draft is not public; Active and Urgent are; Completed and Inactive are not; history stays in the admin list", async () => {
    await save(base({ id: "PROGRAM-LC", kind: "project", status: "Draft" }));
    expect((await publicIds()).ids).toEqual([]);

    const pub = await save(base({ id: "PROGRAM-LC", kind: "project", status: "Active" }));
    expect((await pub.json()).publication).toMatchObject({ persisted: true, publicVisible: true, publicPath: "/causes/PROGRAM-LC" });
    expect((await publicIds()).ids).toEqual(["PROGRAM-LC"]);

    await save(base({ id: "PROGRAM-LC", kind: "project", status: "Urgent" }));
    expect((await publicIds()).ids).toEqual(["PROGRAM-LC"]);

    for (const s of ["Completed", "Inactive"]) {
      const r = await save(base({ id: "PROGRAM-LC", kind: "project", status: s }));
      expect((await r.json()).publication.publicVisible).toBe(false);
      expect((await publicIds()).ids).toEqual([]);
      const admin = (await (await list()).json()) as any[];
      expect(admin.find((c) => c.id === "PROGRAM-LC")?.status).toBe(s); // record and id preserved
    }
    expect(causes()).toHaveLength(1);
  });

  it("the public API only filters by kind among open entries", async () => {
    await save(base({ id: "P-OPEN", title: "Open program", kind: "project", status: "Active" }));
    await save(base({ id: "C-OPEN", title: "Open campaign", kind: "campaign", status: "Urgent" }));
    await save(base({ id: "C-DRAFT", title: "Draft campaign", kind: "campaign", status: "Draft" }));
    expect((await publicIds("?kind=campaign")).ids).toEqual(["C-OPEN"]);
    expect((await publicIds("?kind=project")).ids).toEqual(["P-OPEN"]);
    expect((await publicIds()).ids.sort()).toEqual(["C-OPEN", "P-OPEN"]);
  });

  it("an edit shows up in the public catalog immediately on this instance (cache invalidated)", async () => {
    await save(base({ id: "PROGRAM-ED", kind: "project", status: "Active" }));
    const pub = await import("@/lib/catalog/public");
    expect((await pub.getPublicItem("PROGRAM-ED"))?.title).toBe("Test Well");
    await save(base({ id: "PROGRAM-ED", kind: "project", status: "Active", title: "Edited Title", description: "New text" }));
    const item = await pub.getPublicItem("PROGRAM-ED");
    expect(item).toMatchObject({ title: "Edited Title", description: "New text" });
    await save(base({ id: "PROGRAM-ED", kind: "project", status: "Inactive", title: "Edited Title" }));
    expect(await pub.getPublicItem("PROGRAM-ED")).toBeNull(); // unpublished: the detail page returns 404
  });

  it("the public detail never serves a Draft, even by its exact id", async () => {
    await save(base({ id: "PROGRAM-DR", kind: "project", status: "Draft" }));
    const pub = await import("@/lib/catalog/public");
    expect(await pub.getPublicItem("PROGRAM-DR")).toBeNull();
  });

  it("creating or publishing an entry does not touch donors or donations (no automatic subscription or attribution)", async () => {
    fakeSheets.seed("Donors", ["id", "name", "email", "status"], [{ id: "DNR-1", name: "D", email: "d@example.org", status: "active" }]);
    fakeSheets.seed("Donations", ["id", "donorId", "amount", "status", "causeId"], [{ id: "DA001", donorId: "DNR-1", amount: 100, status: "completed", causeId: "" }]);
    fakeSheets.seed("Donation_Causes", ["id", "donationId", "causeId"], []);
    const before = JSON.stringify([fakeSheets.records("Donors"), fakeSheets.records("Donations"), fakeSheets.records("Donation_Causes")]);
    await save(base({ id: "PROGRAM-X", kind: "project", status: "Active" }));
    await save(base({ id: "PROGRAM-X", kind: "project", status: "Completed" }));
    expect(JSON.stringify([fakeSheets.records("Donors"), fakeSheets.records("Donations"), fakeSheets.records("Donation_Causes")])).toBe(before);
  });

  it("a donation keeps pointing at its cause id after the cause is completed or unpublished", async () => {
    await save(base({ id: "CAUSE-H1", status: "Active" }));
    fakeSheets.seed("Donations", ["id", "donorId", "amount", "status", "causeId"], [{ id: "DA001", donorId: "DNR-1", amount: 100, status: "completed", causeId: "CAUSE-H1" }]);
    await save(base({ id: "CAUSE-H1", status: "Inactive" }));
    expect(fakeSheets.records("Donations")[0].causeId).toBe("CAUSE-H1");
    const admin = (await (await list()).json()) as any[];
    expect(admin.find((c) => c.id === "CAUSE-H1")).toBeTruthy();
  });
});

describe("failure handling and refresh", () => {
  it("a Sheets write failure is an error, not a published entry, and nothing is left behind", async () => {
    fakeSheets.failWrites = true;
    const res = await save(base({ id: "PROGRAM-F1", kind: "project", status: "Active" }));
    expect(res.status).toBe(500);
    expect((await res.json()).success).toBeUndefined();
    fakeSheets.failWrites = false;
    expect(causes()).toHaveLength(0);
    const pub = await import("@/lib/catalog/public");
    expect(await pub.getPublicItem("PROGRAM-F1")).toBeNull();
  });

  it("when Sheets cannot be read the public API answers 503 and the public helpers throw: no fallback content", async () => {
    const real = fakeSheets.getAllRows.bind(fakeSheets);
    (fakeSheets as any).getAllRows = async () => {
      throw new Error("Sheets unavailable");
    };
    authState.role = "none";
    const res = await list();
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toMatch(/Clean Water|Orphan|Family/);
    const pub = await import("@/lib/catalog/public");
    pub.invalidatePublicCatalog();
    await expect(pub.getPublicCatalog()).rejects.toThrow();
    (fakeSheets as any).getAllRows = real;
    authState.role = "admin";
  });

  it("a successful save refreshes the public pages; if that refresh fails the data is still saved and the response says so", async () => {
    const ok = await save(base({ id: "PROGRAM-R1", kind: "project", status: "Active" }));
    expect((await ok.json()).publication.publicPagesRefreshed).toBe(true);
    const refreshed = revalidate.mock.calls.map((c) => c[0]);
    expect(refreshed).toEqual(expect.arrayContaining(["/", "/programs", "/campaigns", "/causes", "/causes/[id]"]));
    expect(revalidateTag).toHaveBeenCalledWith("public-catalog", { expire: 0 }); // the data every public page reads

    revalidateTag.mockImplementation(() => {
      throw new Error("revalidate unavailable");
    });
    const res = await save(base({ id: "PROGRAM-R1", kind: "project", status: "Active", title: "Renamed" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.publication).toMatchObject({ persisted: true, publicPagesRefreshed: false });
    expect(causes()[0].title).toBe("Renamed");
  });

  it("repeated reads of the public catalog within the cache window share one Sheets read", async () => {
    await save(base({ id: "PROGRAM-C1", kind: "project", status: "Active" }));
    const pub = await import("@/lib/catalog/public");
    pub.invalidatePublicCatalog();
    const spy = vi.spyOn(fakeSheets, "getAllRows");
    await Promise.all([pub.getPublicCatalog(), pub.getPublicCatalog(), pub.getPublicCatalog()]);
    await pub.getPublicCatalog();
    const causeReads = spy.mock.calls.filter((c) => c[0] === "Causes").length;
    expect(causeReads).toBeLessThanOrEqual(1);
    spy.mockRestore();
  });
});
