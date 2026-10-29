import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeSheets } from "./helpers/fakeSheets";
import { resetWorld } from "./helpers/mocks";
import { causeRepository } from "@/lib/repositories/causeRepository";
import { donationRepository } from "@/lib/repositories/donationRepository";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

const HEADERS = ["id", "title", "category", "targetAmount", "raisedAmount", "location", "description", "status", "imageUrl", "driveFileId", "createdAt", "kind"];
const cause = (id: string, status: string) => ({ id, title: `Cause ${id}`, category: "Relief", targetAmount: "1000", raisedAmount: "0", location: "", description: "", status, imageUrl: "", driveFileId: "", createdAt: new Date().toISOString(), kind: "cause" });

const donate = async (causeId: string) => {
  const { POST } = await import("@/app/api/donate/route");
  const fd = new FormData();
  for (const [k, v] of Object.entries({ donorName: "Cache Test", donorContact: `c${Math.random().toString(36).slice(2, 7)}@example.invalid`, amount: "100", selectedCauses: JSON.stringify([{ causeId }]) })) fd.set(k, v);
  fd.set("screenshot", new File([new Uint8Array([137, 80, 78, 71])], "p.png", { type: "image/png" }));
  return POST(new NextRequest("http://t/api/donate", { method: "POST", body: fd, headers: { "x-forwarded-for": `10.2.0.${Math.floor(Math.random() * 250)}` } }));
};

beforeEach(async () => {
  await resetWorld();
  fakeSheets.seed("Causes", HEADERS, [cause("C-OPEN", "Active"), cause("C-OTHER", "Active")]);
  causeRepository.invalidateCache();
});

describe("cached presentation data never authorizes a donation", () => {
  it("a cause completed by ANOTHER instance (this instance's cache still says Active) is refused", async () => {
    await causeRepository.getAll(); // this instance now caches C-OPEN as Active
    // another instance completes it: change the sheet directly, bypassing this instance's repository and its cache
    const row = fakeSheets.records("Causes").findIndex((r: any) => r.id === "C-OPEN") + 2;
    await fakeSheets.updateRowAt("Causes", row, { ...cause("C-OPEN", "Completed") });
    expect((await causeRepository.getAll()).find((c) => c.id === "C-OPEN")?.status).toBe("Active"); // the cache is genuinely stale
    const res = await donate("C-OPEN");
    expect(res.status).toBe(400);
    expect(await donationRepository.getAll(true)).toHaveLength(0);
  });

  it("a cause that only exists in the cache (deleted from the sheet) is refused as unknown", async () => {
    await causeRepository.getAll();
    const row = fakeSheets.records("Causes").findIndex((r: any) => r.id === "C-OPEN") + 2;
    await fakeSheets.clearRowAt("Causes", row);
    expect((await donate("C-OPEN")).status).toBe(400);
    expect(await donationRepository.getAll(true)).toHaveLength(0);
  });

  it("when current eligibility cannot be read, the donation fails (5xx) and nothing is stored or invented", async () => {
    await causeRepository.getAll(); // a warm cache must NOT be used as a fallback
    const spy = vi.spyOn(fakeSheets, "batchGetRows").mockRejectedValue(new Error("Sheets unavailable")); // the single fresh eligibility read fails
    const res = await donate("C-OPEN");
    spy.mockRestore();
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(await donationRepository.getAll(true)).toHaveLength(0);
    expect(fakeSheets.records("Donation_Causes")).toHaveLength(0);
  });

  it("a Google quota failure while checking eligibility answers 503 (temporary), stores nothing and leaks no provider details", async () => {
    const spy = vi.spyOn(fakeSheets, "batchGetRows").mockRejectedValue(Object.assign(new Error("Could not read Causes: Quota exceeded for consumer 'project_number:123456'"), { retriesExhausted: true }));
    const res = await donate("C-OPEN");
    spy.mockRestore();
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBeTruthy();
    expect(JSON.stringify(await res.json())).not.toMatch(/project_number|Quota exceeded/);
    expect(fakeSheets.records("Donations")).toHaveLength(0);
  });

  it("a valid donation still works and relationships come from the current sheet (positive control)", async () => {
    const res = await donate("C-OTHER");
    expect(res.status).toBe(200);
    expect(fakeSheets.records("Donation_Causes").map((r: any) => r.causeId)).toEqual(["C-OTHER"]);
  });

  it("an unknown cause id crafted into the request is rejected before any record is written", async () => {
    expect((await donate("C-DOES-NOT-EXIST")).status).toBe(400);
    expect(fakeSheets.records("Donations")).toHaveLength(0);
  });
});

describe("cached balances never authorize an allocation", () => {
  it("designation reduced by another instance after this instance cached it: over-allocation is refused", async () => {
    const ok = await donate("C-OPEN");
    expect(ok.status).toBe(200);
    const donation = (await donationRepository.getAll(true))[0];
    await donationRepository.updateStatus(donation.id, "completed");
    const { donationCauseRepository } = await import("@/lib/repositories/donationCauseRepository");
    await donationCauseRepository.getAll(); // cached: designated 100
    const row = fakeSheets.records("Donation_Causes").findIndex((r: any) => r.donationId === donation.id) + 2;
    const rec = fakeSheets.records("Donation_Causes")[row - 2];
    await fakeSheets.updateRowAt("Donation_Causes", row, { ...rec, designatedAmount: "40" }); // another instance lowered it
    const { createAllocation, AllocationError } = await import("@/lib/services/allocationService");
    await expect(createAllocation({ donationId: donation.id, causeId: "C-OPEN", amount: 90, requestKey: "k1", actorEmail: "a@x.invalid" })).rejects.toBeInstanceOf(AllocationError);
    expect(fakeSheets.records("Allocations")).toHaveLength(0);
  });
});
