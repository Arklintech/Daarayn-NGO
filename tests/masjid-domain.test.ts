import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeSheets } from "./helpers/fakeSheets";
import { resetWorld } from "./helpers/mocks";
import { domainOf, masjidUpdateState } from "@/lib/catalog/programDomains";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

const CAUSE_HEADERS = ["id", "title", "category", "targetAmount", "raisedAmount", "location", "description", "status", "imageUrl", "driveFileId", "createdAt", "kind"];
const post = async (body: any) => (await import("@/app/api/admin/programs/route")).POST(new NextRequest("http://t/api/admin/programs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
const masjid = (content: any = {}, over: any = {}) => ({
  id: "PROGRAM-MASJID-T1", kind: "project", title: "Test Masjid Roof", category: "Masjid Infrastructure", targetAmount: 100000, status: "Draft", description: "Synthetic.",
  content: { template: "project", cardSummary: "Roof", sections: [{ type: "needs", title: "Needs", needs: [{ name: "Roof", amount: 60000 }, { name: "Wudu area", amount: 40000 }] }], ...content },
  ...over,
});
const row = (): any => fakeSheets.records("Program_Content").find((r: any) => r.id === "PROGRAM-MASJID-T1");

beforeEach(async () => {
  await resetWorld();
  fakeSheets.seed("Causes", CAUSE_HEADERS, []);
  (await import("@/lib/catalog/programs")).invalidatePublicPrograms();
  (await import("@/lib/catalog/programContent")).programContentRepository.invalidateCache();
});

describe("domains", () => {
  it("the project template is Masjid Infrastructure; every other template is a General Cause", () => {
    expect(domainOf("project")).toBe("masjid");
    for (const t of ["relief", "endowment", "custom"]) expect(domainOf(t)).toBe("general");
  });
});

describe("masjid update window (7 days, from the persisted timestamp)", () => {
  const now = new Date("2026-10-28T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
  const D = 86_400_000;
  it("none, current, exactly 7 days (still current), just over 7 days (overdue)", () => {
    expect(masjidUpdateState("", now).state).toBe("none");
    expect(masjidUpdateState("garbage", now).state).toBe("none");
    expect(masjidUpdateState(ago(2 * D), now)).toEqual({ state: "current", daysSince: 2 });
    expect(masjidUpdateState(ago(7 * D), now).state).toBe("current");
    expect(masjidUpdateState(ago(7 * D + 1), now)).toEqual({ state: "overdue", daysSince: 7 });
    expect(masjidUpdateState(ago(-5000), now).state).toBe("current"); // a clock a few seconds ahead is not an error
  });
});

describe("saving a Masjid project", () => {
  it("stores the update timestamp from the SERVER clock only when an update is recorded, and keeps it on later saves", async () => {
    let res = await post(masjid({ recordUpdate: true, updateNote: "Slab poured", lastUpdateAt: "2020-01-01T00:00:00Z" }));
    expect(res.status).toBe(200);
    const stamped = row().lastUpdateAt;
    expect(stamped).not.toBe("2020-01-01T00:00:00Z"); // a client-supplied date is ignored
    expect(Date.now() - Date.parse(stamped)).toBeLessThan(5000);
    expect(row().updateNote).toBe("Slab poured");

    res = await post(masjid({ cardSummary: "Edited only the text" })); // ordinary edit: no new stamp, note kept
    expect(res.status).toBe(200);
    expect(row().lastUpdateAt).toBe(stamped);
    expect(row().updateNote).toBe("Slab poured");
  });
  it("a project with no recorded update stays without a timestamp (never invented)", async () => {
    await post(masjid());
    expect(row().lastUpdateAt).toBe("");
  });
  it("recording an update on a General Cause is rejected and stores nothing", async () => {
    const res = await post({ id: "CAUSE-G1", kind: "cause", title: "Family Relief T", category: "Relief", targetAmount: 1, status: "Draft", content: { template: "relief", recordUpdate: true } });
    expect(res.status).toBe(400);
    expect(fakeSheets.records("Causes").find((r: any) => r.id === "CAUSE-G1")).toBeUndefined();
  });
  it("needs keep their own amounts and the parent keeps ONE permanent cause id (no per-need cause is invented)", async () => {
    await post(masjid());
    expect(fakeSheets.records("Causes").filter((r: any) => String(r.id).startsWith("PROGRAM-MASJID"))).toHaveLength(1);
    const saved = JSON.parse(row().sections);
    expect(saved[0].needs.map((n: any) => n.amount)).toEqual([60000, 40000]);
  });
});
