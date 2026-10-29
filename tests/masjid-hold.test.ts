import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeSheets } from "./helpers/fakeSheets";
import { resetWorld, authState } from "./helpers/mocks";
import { masjidHoldState } from "@/lib/catalog/programDomains";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

const CAUSE_HEADERS = ["id", "title", "category", "targetAmount", "raisedAmount", "location", "description", "status", "imageUrl", "driveFileId", "createdAt", "kind"];
const D = 86_400_000;
const adminPost = async (path: string, body: any) => {
  const mod = path === "hold" ? await import("@/app/api/admin/programs/hold/route") : await import("@/app/api/admin/programs/route");
  return mod.POST(new NextRequest(`http://t/api/admin/programs${path === "hold" ? "/hold" : ""}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
};
const masjid = (id: string) => ({ id, kind: "project", title: `Masjid ${id}`, category: "Masjid Infrastructure", targetAmount: 1000, status: "Active", description: "x", content: { template: "project", recordUpdate: true } });
const donate = async (cause: string) => {
  const { POST } = await import("@/app/api/donate/route");
  const fd = new FormData();
  for (const [k, v] of Object.entries({ donorName: "Hold Test", donorContact: `h${Math.random().toString(36).slice(2, 6)}@example.invalid`, amount: "100", selectedCauses: JSON.stringify([{ causeId: cause }]) })) fd.set(k, v);
  fd.set("screenshot", new File([new Uint8Array([137, 80, 78, 71])], "p.png", { type: "image/png" }));
  return POST(new NextRequest("http://t/api/donate", { method: "POST", body: fd, headers: { "x-forwarded-for": `10.1.0.${Math.floor(Math.random() * 250)}` } }));
};
/** Moves a project's last verified update back in time (the only way to simulate days passing in a test). */
const ageUpdate = async (id: string, ms: number) => {
  const { programContentRepository } = await import("@/lib/catalog/programContent");
  const row = (await programContentRepository.getAll(true)).find((c) => c.id === id)!;
  await programContentRepository.save({ ...row, lastUpdateAt: new Date(Date.now() - ms).toISOString() });
  programContentRepository.invalidateCache();
};

beforeEach(async () => {
  await resetWorld();
  fakeSheets.seed("Causes", CAUSE_HEADERS, []);
  const { programContentRepository } = await import("@/lib/catalog/programContent");
  programContentRepository.invalidateCache();
  (await import("@/lib/catalog/public")).invalidatePublicCatalog();
});

describe("hold rule (pure)", () => {
  const now = new Date("2026-10-28T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
  it("exactly 7 days is not held; just beyond is held; clearing restarts the window; general causes and never-updated projects are never held", () => {
    expect(masjidHoldState({ template: "project", lastUpdateAt: ago(7 * D) }, now).held).toBe(false);
    expect(masjidHoldState({ template: "project", lastUpdateAt: ago(7 * D + 1) }, now).held).toBe(true);
    expect(masjidHoldState({ template: "project", lastUpdateAt: ago(30 * D), holdClearedAt: ago(1 * D) }, now).held).toBe(false);
    expect(masjidHoldState({ template: "project", lastUpdateAt: ago(30 * D), holdClearedAt: ago(8 * D) }, now).held).toBe(true);
    expect(masjidHoldState({ template: "relief", lastUpdateAt: ago(90 * D) }, now).held).toBe(false);
    expect(masjidHoldState({ template: "project", lastUpdateAt: "" }, now).held).toBe(false);
  });
});

describe("server-side enforcement", () => {
  it("a held project refuses new donations (direct API) and leaves the unrelated project and a General Cause open", async () => {
    await adminPost("programs", masjid("PROGRAM-HELD"));
    await adminPost("programs", masjid("PROGRAM-FRESH"));
    await adminPost("programs", { id: "CAUSE-GEN", kind: "cause", title: "General", category: "Relief", targetAmount: 1, status: "Active", content: { template: "relief" } });
    expect((await donate("PROGRAM-HELD")).status).toBe(200); // fresh update: accepted

    await ageUpdate("PROGRAM-HELD", 7 * D + 60_000);
    const res = await donate("PROGRAM-HELD");
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error).toMatch(/on hold/i);
    expect((await donate("PROGRAM-FRESH")).status).toBe(200);
    expect((await donate("CAUSE-GEN")).status).toBe(200);
    const donations = fakeSheets.records("Donations");
    expect(donations.filter((d: any) => d.causeId === "PROGRAM-HELD")).toHaveLength(1); // only the pre-hold one; history preserved
  });

  it("held projects are not offered by the public catalog used by the ribbon and donation form, but stay in the program list", async () => {
    await adminPost("programs", masjid("PROGRAM-HELD"));
    await ageUpdate("PROGRAM-HELD", 8 * D);
    (await import("@/lib/catalog/public")).invalidatePublicCatalog();
    (await import("@/lib/catalog/programs")).invalidatePublicPrograms();
    const catalog = await (await import("@/lib/catalog/public")).getPublicCatalog(Date.now() + 60_000);
    expect(catalog.some((c) => c.id === "PROGRAM-HELD")).toBe(false);
    const programs = await (await import("@/lib/catalog/programs")).getPublicPrograms(Date.now() + 60_000);
    expect(programs.some((p: any) => p.id === "PROGRAM-HELD")).toBe(true);
  });

  it("fails closed: if Program_Content cannot be read the donation is not accepted", async () => {
    await adminPost("programs", masjid("PROGRAM-HELD"));
    const { programContentRepository } = await import("@/lib/catalog/programContent");
    const spy = vi.spyOn(fakeSheets, "batchGetRows").mockRejectedValue(new Error("Sheets unavailable"));
    const res = await donate("PROGRAM-HELD");
    spy.mockRestore();
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(fakeSheets.records("Donations")).toHaveLength(0);
  });
});

describe("clearing a hold", () => {
  it("requires an administrator and a reason, only works on a held project, records who/when in the audit log, and reopens donations", async () => {
    await adminPost("programs", masjid("PROGRAM-HELD"));
    expect((await adminPost("hold", { programId: "PROGRAM-HELD", reason: "checking" })).status).toBe(409); // not held yet
    await ageUpdate("PROGRAM-HELD", 8 * D);
    expect((await donate("PROGRAM-HELD")).status).toBe(400);

    expect((await adminPost("hold", { programId: "PROGRAM-HELD", reason: "" })).status).toBe(400);
    authState.role = "none";
    expect((await adminPost("hold", { programId: "PROGRAM-HELD", reason: "site visit confirmed" })).status).toBe(401);
    authState.role = "admin";
    expect((await donate("PROGRAM-HELD")).status).toBe(400); // still held after the rejected attempts

    const ok = await adminPost("hold", { programId: "PROGRAM-HELD", reason: "site visit confirmed" });
    expect(ok.status).toBe(200);
    const audit = fakeSheets.records("Audit_Log").filter((a: any) => a.action === "CLEAR_PROJECT_HOLD");
    expect(audit).toHaveLength(1);
    expect(audit[0].entity_id).toBe("PROGRAM-HELD");
    expect(fakeSheets.records("Program_Content").find((c: any) => c.id === "PROGRAM-HELD")?.holdClearedAt).toBeTruthy();
    expect((await donate("PROGRAM-HELD")).status).toBe(200);
    expect((await adminPost("hold", { programId: "PROGRAM-HELD", reason: "again?" })).status).toBe(409); // no longer held
  });
});

describe("test clock (TEST_CLOCK_OFFSET_DAYS) cannot influence an unauthorised process", () => {
  it("is honoured only for a development/test process already authorised for the approved test sheet", async () => {
    const { serverNow } = await import("@/lib/catalog/clock");
    const APPROVED = "1sGVsMEQDI1WmjWdUTQ0eKOzZC34Ri9CLsf4uUUceGzM";
    const base = { NODE_ENV: "development", GOOGLE_TARGET_ENV: "test", GOOGLE_SHEET_ID: APPROVED, GOOGLE_TEST_SHEET_ID: APPROVED, TEST_CLOCK_OFFSET_DAYS: "8" };
    const days = (e: any) => Math.round((serverNow(e).getTime() - Date.now()) / 86_400_000);
    expect(days(base)).toBe(8);
    expect(days({ ...base, GOOGLE_TARGET_ENV: undefined })).toBe(0); // no label
    expect(days({ ...base, GOOGLE_SHEET_ID: "1ProductionLookingIdXXXXXXXXXXXXXXXXXXXX", GOOGLE_TEST_SHEET_ID: "1ProductionLookingIdXXXXXXXXXXXXXXXXXXXX" })).toBe(0); // not allowlisted
    expect(days({ ...base, NODE_ENV: "production" })).toBe(0);
    expect(days({ ...base, VERCEL: "1" })).toBe(0);
    expect(days({ ...base, TEST_CLOCK_OFFSET_DAYS: "abc" })).toBe(0);
    const fixed = "2030-01-01T00:00:00.000Z";
    expect(serverNow({ ...base, TEST_CLOCK_FIXED_ISO: fixed }).toISOString()).toBe(fixed);
    expect(Math.abs(serverNow({ ...base, GOOGLE_TARGET_ENV: undefined, TEST_CLOCK_FIXED_ISO: fixed }).getTime() - Date.now())).toBeLessThan(5000); // ignored without authorisation
    expect(Math.abs(serverNow({ ...base, NODE_ENV: "production", TEST_CLOCK_FIXED_ISO: fixed }).getTime() - Date.now())).toBeLessThan(5000);
  });
});
