import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeSheets } from "./helpers/fakeSheets";
import { resetWorld, driveMock } from "./helpers/mocks";
import { donationService } from "@/lib/services/donationService";
import { donationRepository } from "@/lib/repositories/donationRepository";
import { allocationRepository, type AllocationEntity } from "@/lib/repositories/allocationRepository";
import { donationCauseRepository } from "@/lib/repositories/donationCauseRepository";
import { causeRepository } from "@/lib/repositories/causeRepository";
import { donorRepository } from "@/lib/repositories/donorRepository";
import { createAllocation, AllocationError } from "@/lib/services/allocationService";
import { findIntegrityExceptions } from "@/lib/reporting/integrity";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

/** D36 Phase E: the three findings left open by D35. */
const CAUSE_HEADERS = ["id", "title", "category", "targetAmount", "raisedAmount", "location", "description", "status", "imageUrl", "driveFileId", "createdAt", "kind"];
const cause = (id: string) => ({ id, title: `Cause ${id}`, category: "Relief", targetAmount: "1000", raisedAmount: "0", location: "", description: "", status: "Active", imageUrl: "", driveFileId: "", createdAt: "", kind: "cause" });

async function donation(amount: number, verified: boolean) {
  await resetWorld();
  fakeSheets.seed("Causes", CAUSE_HEADERS, [cause("C1")]);
  causeRepository.invalidateCache();
  driveMock.uploadFile.mockImplementation(async () => ({ drive_file_id: "P1", storage_backend: "google_drive" }));
  const d = await donationService.processDonation({ donorName: "E", donorContact: "e@example.invalid", amount, cause: "C1", selectedCauses: [{ causeId: "C1" }], screenshotBuffer: Buffer.from("png"), screenshotFilename: "p.png", screenshotMimeType: "image/png", submissionKey: `K-${Math.random()}` });
  if (verified) await donationRepository.updateStatus(d.donationId, "completed");
  return d.donationId;
}
const patch = async (body: Record<string, unknown>) => {
  const { PATCH } = await import("@/app/api/admin/donations/route");
  return PATCH(new NextRequest("http://t/api/admin/donations", { method: "PATCH", body: JSON.stringify(body) }));
};
const statusOf = (id: string) => String((fakeSheets.records("Donations").find((r: any) => r.id === id) as any).status);

describe("D36 E2: two administrators changing one donation's status at the same moment", () => {
  it("exactly one change wins, the other is told the status has changed (409); the sheet and the audit trail agree with the winner", async () => {
    const bad: string[] = [];
    for (let t = 0; t < 12; t++) {
      const id = await donation(100, false);
      const [a, b] = await Promise.all([patch({ id, status: "completed", expectedStatus: "pending" }), patch({ id, status: "rejected", expectedStatus: "pending" })]);
      const codes = [a.status, b.status].sort();
      if (codes.join() !== "200,409") bad.push(`trial ${t}: statuses ${codes.join()}`);
      const winner = a.status === 200 ? "completed" : "rejected";
      if (statusOf(id) !== winner) bad.push(`trial ${t}: sheet says ${statusOf(id)} but the winner was ${winner}`);
      const audits = fakeSheets.records("Audit_Log").filter((x: any) => x.action === "UPDATE_DONATION_STATUS" && x.entity_id === id);
      if (audits.length !== 1) bad.push(`trial ${t}: ${audits.length} status audit records`);
      const loser = a.status === 409 ? a : b;
      if (((await loser.json()) as any).code !== "STATUS_CHANGED") bad.push(`trial ${t}: loser code was not STATUS_CHANGED`);
    }
    expect(bad).toEqual([]);
  }, 120_000);
});

describe("D36 E3: a failed compensating reversal is never silent", () => {
  /** A rogue writer that ignores the lease puts an active allocation in just before ours lands: ours then exceeds the cap. */
  async function overCapScenario() {
    const id = await donation(100, true);
    const entity: AllocationEntity = { id: "ALLOC-ROGUE", donationId: id, donorId: "x", donorName: "x", causeId: "C1", designationId: `DC-${id}-C1`, projectId: "", caseId: "", targetTitle: "Cause C1", allocatedAmount: 80, allocationDate: new Date().toISOString(), adminEmail: "rogue@x.invalid", status: "active", notes: "", createdAt: new Date().toISOString(), evidenceDriveFileIds: [], requestKey: "rogue" };
    const orig = allocationRepository.append.bind(allocationRepository);
    vi.spyOn(allocationRepository, "append").mockImplementationOnce(async (e: AllocationEntity) => {
      const prepared = await allocationRepository.prepareAppend(entity);
      await fakeSheets.appendRow(prepared.sheetName, prepared.records[0], prepared.expectedHeaders);
      return orig(e);
    });
    return id;
  }
  const activeIds = () => fakeSheets.records("Allocations").filter((a: any) => a.status === "active").map((a: any) => a.id);

  it("when the reversal succeeds on a retry the caller gets the normal 409 and the surplus row is reversed", async () => {
    const id = await overCapScenario();
    const orig = allocationRepository.update.bind(allocationRepository);
    vi.spyOn(allocationRepository, "update").mockRejectedValueOnce(new Error("Simulated write failure")).mockRejectedValueOnce(new Error("Simulated write failure")).mockImplementation(orig);
    await expect(createAllocation({ donationId: id, causeId: "C1", amount: 30, requestKey: "mine", actorEmail: "a@x.invalid" })).rejects.toMatchObject({ httpStatus: 409 });
    expect(activeIds()).toEqual(["ALLOCATION-ROGUE".replace("ALLOCATION", "ALLOC")]); // only the rogue row remains active; ours was reversed on the third attempt
  });

  it("when the reversal fails every time the error says so, names the row, and the integrity report flags it", async () => {
    const id = await overCapScenario();
    vi.spyOn(allocationRepository, "update").mockRejectedValue(new Error("Simulated permanent write failure"));
    let err: unknown;
    await createAllocation({ donationId: id, causeId: "C1", amount: 30, requestKey: "mine", actorEmail: "a@x.invalid" }).catch((e) => (err = e));
    expect(err).toBeInstanceOf(AllocationError);
    expect((err as AllocationError).httpStatus).toBe(503);
    expect((err as AllocationError).message).toMatch(/could NOT be reversed/);
    expect((err as AllocationError).message).toMatch(/ALLOC-/);
    expect(activeIds()).toHaveLength(2); // the surplus row stays active ...
    vi.restoreAllMocks();
    const [donations, donors, causes, designations, allocations] = await Promise.all([donationRepository.getAll(true), donorRepository.getAll(true), causeRepository.getAll(true), donationCauseRepository.getAll(true), allocationRepository.getAll(true)]);
    const found = findIntegrityExceptions({ donations, donors, causes, designations, allocations, now: new Date() } as any);
    expect(found.some((e: any) => e.type === "ALLOCATION_EXCEEDS_DESIGNATION")).toBe(true); // ... and is reported, not hidden
  });
});

describe("D36: busy lease on a status change is a retryable 503, not a conflict", () => {
  it("answers 503 with Retry-After and the BUSY code", async () => {
    const id = await donation(100, false);
    const lease = await import("@/lib/google/allocationLease");
    const backend = new lease.MemoryLeaseBackend();
    lease.setLeaseBackend(backend);
    try {
      await backend.acquire(`alloc:${id}`, "someone-else", 60_000);
      process.env.ALLOCATION_LEASE_WAIT_MS = "200";
      const res = await patch({ id, status: "completed" });
      expect(res.status).toBe(503);
      expect(res.headers.get("Retry-After")).toBe("5");
      expect(((await res.json()) as any).code).toBe("BUSY");
      expect(statusOf(id)).toBe("pending");
    } finally {
      delete process.env.ALLOCATION_LEASE_WAIT_MS;
      lease.setLeaseBackend(null);
    }
  });
});
