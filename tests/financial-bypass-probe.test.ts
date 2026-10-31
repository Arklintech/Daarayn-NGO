import { describe, it, expect, vi } from "vitest";
import { fakeSheets } from "./helpers/fakeSheets";
import { resetWorld, driveMock, mailMock } from "./helpers/mocks";
import { donationRepository } from "@/lib/repositories/donationRepository";
import { donationService } from "@/lib/services/donationService";
import { causeRepository } from "@/lib/repositories/causeRepository";
import { NextRequest } from "next/server";
import { createAllocation, reverseAllocation } from "@/lib/services/allocationService";
import { recordDesignation } from "@/lib/services/designationService";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

/**
 * D35 probes of paths that change the balance an allocation is checked against WITHOUT going through the allocation lease:
 *  (A) lowering a designation, (B) moving a donation out of "verified" while active allocations exist.
 * Each test states the invariant that SHOULD hold. A failing test is a verified finding, not a flaky test.
 */
const CAUSE_HEADERS = ["id", "title", "category", "targetAmount", "raisedAmount", "location", "description", "status", "imageUrl", "driveFileId", "createdAt", "kind"];
const cause = (id: string) => ({ id, title: `Cause ${id}`, category: "Relief", targetAmount: "1000", raisedAmount: "0", location: "", description: "", status: "Active", imageUrl: "", driveFileId: "", createdAt: "", kind: "cause" });

async function verifiedDonation(amount: number) {
  await resetWorld();
  fakeSheets.seed("Causes", CAUSE_HEADERS, [cause("C1")]);
  causeRepository.invalidateCache();
  driveMock.uploadFile.mockImplementation(async () => ({ drive_file_id: "P1", storage_backend: "google_drive" }));
  const d = await donationService.processDonation({ donorName: "Probe", donorContact: "p@example.invalid", amount, cause: "C1", selectedCauses: [{ causeId: "C1" }], screenshotBuffer: Buffer.from("png"), screenshotFilename: "p.png", screenshotMimeType: "image/png", submissionKey: `K-${Math.random()}` });
  await donationRepository.updateStatus(d.donationId, "completed");
  return d.donationId;
}
const activeTotal = () => fakeSheets.records("Allocations").filter((a: any) => a.status === "active").reduce((s: number, a: any) => s + Number(a.allocatedAmount), 0);
const designatedFor = (id: string) => Number((fakeSheets.records("Donation_Causes").find((r: any) => r.donationId === id) as any)?.designatedAmount);

describe("D35 probes: balance-changing paths outside the allocation lease", () => {
  it("(B) a donation with ACTIVE allocations cannot be moved out of the verified state", async () => {
    const id = await verifiedDonation(100);
    await createAllocation({ donationId: id, causeId: "C1", amount: 60, requestKey: "A1", actorEmail: "a@x.invalid" });
    expect(activeTotal()).toBe(60);
    const { PATCH } = await import("@/app/api/admin/donations/route");
    const res = await PATCH(new NextRequest("http://t/api/admin/donations", { method: "PATCH", body: JSON.stringify({ id, status: "rejected" }) }));
    const status = String((fakeSheets.records("Donations").find((r: any) => r.id === id) as any).status);
    // INVARIANT: either the change is refused, or no active allocation may remain against a donation that is not verified.
    expect(res.status === 409 || activeTotal() === 0, `donation is now "${status}" with ${activeTotal()} still actively allocated (HTTP ${res.status})`).toBe(true);
    expect(res.status).toBe(409);
    expect(status).toBe("completed");
  });

  it("(B2) once the allocations are reversed the same status change is allowed", async () => {
    const id = await verifiedDonation(100);
    const { allocation } = await createAllocation({ donationId: id, causeId: "C1", amount: 60, requestKey: "A2", actorEmail: "a@x.invalid" });
    await reverseAllocation(allocation.id, "test reversal", "a@x.invalid");
    const { PATCH } = await import("@/app/api/admin/donations/route");
    const res = await PATCH(new NextRequest("http://t/api/admin/donations", { method: "PATCH", body: JSON.stringify({ id, status: "rejected" }) }));
    expect(res.status).toBe(200);
  });

  it("(A) concurrent lowering of the designation and an allocation never leaves active allocations above the designation", async () => {
    const bad: string[] = [];
    for (let t = 0; t < 15; t++) {
      const id = await verifiedDonation(100);
      await Promise.allSettled([
        createAllocation({ donationId: id, causeId: "C1", amount: 80, requestKey: `A-${t}`, actorEmail: "a@x.invalid" }),
        recordDesignation(id, [{ causeId: "C1", amount: 50 }], "a@x.invalid"),
      ]);
      if (activeTotal() > designatedFor(id)) bad.push(`trial ${t}: active ${activeTotal()} > designated ${designatedFor(id)}`);
    }
    expect(bad).toEqual([]);
  }, 120_000);
});

describe("D35 probe: the donation's final completion write must not undo an admin decision made while it was in flight", () => {
  it("an admin verification that lands during the e-mail step is still in force after processDonation returns", async () => {
    await resetWorld();
    driveMock.uploadFile.mockImplementation(async () => ({ drive_file_id: "P1", storage_backend: "google_drive" }));
    // The admin verifies the donation while the e-mail is being sent (the follow-up steps run in parallel with it).
    mailMock.sendDonationEmail.mockImplementationOnce(async () => {
      const row = fakeSheets.records("Donations").find((r: any) => String(r.id).startsWith("DA")) as any;
      await donationRepository.updateStatus(row.id, "completed");
      return { success: true, providerMessageId: "m1" };
    });
    const d = await donationService.processDonation({ donorName: "Race", donorContact: "race@example.invalid", amount: 100, cause: "General", screenshotBuffer: Buffer.from("png"), screenshotFilename: "p.png", screenshotMimeType: "image/png", submissionKey: "K-RACE" });
    const row = fakeSheets.records("Donations").find((r: any) => r.id === d.donationId) as any;
    expect(row.status, "the admin's verification was overwritten by the donation's completion write").toBe("completed");
  });
});
