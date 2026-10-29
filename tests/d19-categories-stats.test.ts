import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "fs";
import { NextRequest } from "next/server";
import { fakeSheets } from "./helpers/fakeSheets";
import { resetWorld } from "./helpers/mocks";
import { prepareProgramContent, defaultCategoryFor } from "@/lib/catalog/programContentSchema";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

const CAUSE_HEADERS = ["id", "title", "category", "targetAmount", "raisedAmount", "location", "description", "status", "imageUrl", "driveFileId", "createdAt", "kind"];
const post = async (body: any) => (await import("@/app/api/admin/programs/route")).POST(new NextRequest("http://t/api/admin/programs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
const prog = (id: string, kind: string, status: string, content: any) => ({ id, kind, title: `T ${id}`, category: "X", targetAmount: 10, status, description: "d", content });

beforeEach(async () => {
  await resetWorld();
  fakeSheets.seed("Causes", CAUSE_HEADERS, []);
  const { invalidatePublicStats } = await import("@/lib/catalog/stats");
  invalidatePublicStats();
  (await import("@/lib/catalog/programs")).invalidatePublicPrograms();
  (await import("@/lib/catalog/programContent")).programContentRepository.invalidateCache();
});

describe("category is separate from template", () => {
  it("legacy rows get a derived category; an explicit category is validated and Masjid stays tied to the project template", () => {
    expect(defaultCategoryFor("project")).toBe("masjid");
    expect(defaultCategoryFor("endowment")).toBe("hifz");
    expect(defaultCategoryFor("relief")).toBe("general");
    expect(prepareProgramContent("A", { template: "endowment" }).programCategory).toBe("hifz");
    expect(prepareProgramContent("A", { template: "relief", programCategory: "hifz" }).programCategory).toBe("hifz"); // a Hifz program may use another template
    expect(() => prepareProgramContent("A", { template: "relief", programCategory: "masjid" })).toThrow(/Masjid/);
    expect(() => prepareProgramContent("A", { template: "project", programCategory: "general" })).toThrow(/Masjid/);
    expect(() => prepareProgramContent("A", { template: "custom", programCategory: "weird" })).toThrow(/category/i);
  });

  it("saving persists the category; the public API filters by it and hides unpublished entries", async () => {
    expect((await post(prog("P-M", "project", "Active", { template: "project" }))).status).toBe(200);
    expect((await post(prog("P-H", "cause", "Active", { template: "endowment" }))).status).toBe(200);
    expect((await post(prog("P-H2", "cause", "Active", { template: "relief", programCategory: "hifz" }))).status).toBe(200);
    expect((await post(prog("P-G", "cause", "Active", { template: "relief" }))).status).toBe(200);
    expect((await post(prog("P-D", "cause", "Draft", { template: "relief", programCategory: "hifz" }))).status).toBe(200);
    expect(fakeSheets.records("Program_Content").find((r: any) => r.id === "P-H2")?.programCategory).toBe("hifz");
    const { GET } = await import("@/app/api/programs/route");
    const ids = async (c: string) => ((await (await GET(new NextRequest(`http://t/api/programs?category=${c}&t=${Math.random()}`))).json()) as any[]).map((p) => p.id).sort();
    (await import("@/lib/catalog/programs")).invalidatePublicPrograms();
    expect(await ids("masjid")).toEqual(["P-M"]);
    expect(await ids("hifz")).toEqual(["P-H", "P-H2"]); // the Draft one is never public
    expect(await ids("general")).toEqual(["P-G"]);
  });

  it("an invalid save (Masjid category on a relief template) stores nothing", async () => {
    const res = await post(prog("P-X", "cause", "Active", { template: "relief", programCategory: "masjid" }));
    expect(res.status).toBe(400);
    expect(fakeSheets.records("Causes")).toHaveLength(0);
  });
});

describe("public statistics come from persisted records", () => {
  const stats = async () => {
    const { invalidatePublicStats } = await import("@/lib/catalog/stats");
    invalidatePublicStats();
    return (await import("@/app/api/public/stats/route")).GET();
  };

  it("Cases Completed counts Completed causes once; Draft/Active/Inactive do not count; re-saving the same completion does not double count; reopening lowers it", async () => {
    await post(prog("CAS-1", "cause", "Active", { template: "relief" }));
    await post(prog("CAS-2", "cause", "Active", { template: "relief" }));
    expect(((await (await stats()).json()) as any).casesCompleted).toBe(0);
    await post(prog("CAS-1", "cause", "Completed", { template: "relief" }));
    expect(((await (await stats()).json()) as any).casesCompleted).toBe(1);
    await post(prog("CAS-1", "cause", "Completed", { template: "relief" })); // retry / second save
    await post(prog("CAS-1", "cause", "Completed", { template: "relief" }));
    expect(fakeSheets.records("Causes").filter((r: any) => r.id === "CAS-1")).toHaveLength(1);
    expect(((await (await stats()).json()) as any).casesCompleted).toBe(1);
    await post(prog("CAS-2", "cause", "Completed", { template: "relief" }));
    expect(((await (await stats()).json()) as any).casesCompleted).toBe(2);
    await post(prog("CAS-1", "cause", "Active", { template: "relief" })); // reopened
    expect(((await (await stats()).json()) as any).casesCompleted).toBe(1);
  });

  it("a failed admin save does not change the count; Masjid Projects counts open Masjid projects; Students Sponsored is null (no data model)", async () => {
    await post(prog("MAS-1", "project", "Active", { template: "project" }));
    await post(prog("MAS-2", "project", "Draft", { template: "project" }));
    const before: any = await (await stats()).json();
    const { causeRepository } = await import("@/lib/repositories/causeRepository");
    const spy = vi.spyOn(causeRepository, "save").mockRejectedValue(new Error("Sheets write failed"));
    const failed = await post(prog("CAS-9", "cause", "Completed", { template: "relief" }));
    spy.mockRestore();
    expect(failed.status).toBeGreaterThanOrEqual(500);
    const after: any = await (await stats()).json();
    expect(after.casesCompleted).toBe(before.casesCompleted);
    expect(after.masjidProjects).toBe(1);
    expect(after.studentsSponsored).toBeNull();
  });

  it("source failure answers 503 (never zeros) and the body holds counts only", async () => {
    await post(prog("CAS-1", "cause", "Completed", { template: "relief" }));
    const ok: any = await (await stats()).json();
    expect(Object.keys(ok).sort()).toEqual(["casesCompleted", "generatedAt", "masjidProjects", "studentsSponsored"]);
    const { causeRepository } = await import("@/lib/repositories/causeRepository");
    const { invalidatePublicStats } = await import("@/lib/catalog/stats");
    invalidatePublicStats();
    const spy = vi.spyOn(causeRepository, "getAll").mockRejectedValue(new Error("Sheets unavailable"));
    const res = await (await import("@/app/api/public/stats/route")).GET();
    spy.mockRestore();
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toMatch(/"casesCompleted"/);
  });

  it("the homepage never shows a fixed number: no hardcoded counts remain in the hero", () => {
    const hero = fs.readFileSync("components/HeroSection.tsx", "utf8");
    expect(hero).not.toMatch(/trust-card-number">\s*\d/);
    expect(hero).toContain("/api/public/stats");
  });
});

describe("homepage structure and shared detail template (source checks)", () => {
  it("three category sections with View All links, all fed by persisted data; no long stacked detail sections", () => {
    const home = fs.readFileSync("components/programs/HomePrograms.tsx", "utf8");
    for (const t of ["View All Masjid Projects", "View All Qur'an Hifz Programs", "View All Causes", "/masjid-projects", "/quran-hifz", "/general-causes"]) expect(home).toContain(t);
    expect(home).not.toContain("ProgramDetailView");
    for (const d of ["masjid-projects", "quran-hifz", "general-causes"]) expect(fs.existsSync(`app/${d}/page.tsx`)).toBe(true);
  });
  it("every non-project template renders through ONE composition (copy left, image right on desktop)", () => {
    const view = fs.readFileSync("components/programs/ProgramDetailView.tsx", "utf8");
    expect(view).toContain("pg-std-hero");
    expect(view).not.toMatch(/template === "relief"|template === "endowment" \?|className="pg-one"|className="pg-two"/);
  });
  it("the mobile trust cards are a three-column grid only inside the mobile media query", () => {
    const css = fs.readFileSync("app/redesign.css", "utf8");
    const i = css.indexOf("Mobile only: the three statistic cards");
    expect(i).toBeGreaterThan(0);
    expect(css.slice(i, i + 200)).toContain("grid-template-columns: repeat(3, minmax(0, 1fr))");
  });
});
