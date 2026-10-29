import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeSheets } from "./helpers/fakeSheets";
import { resetWorld } from "./helpers/mocks";
import { causeRepository } from "@/lib/repositories/causeRepository";
import { donationRepository } from "@/lib/repositories/donationRepository";
import { allocationRepository } from "@/lib/repositories/allocationRepository";
import { createAllocation, AllocationError } from "@/lib/services/allocationService";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

const HEADERS = ["id", "title", "category", "targetAmount", "raisedAmount", "location", "description", "status", "imageUrl", "driveFileId", "createdAt", "kind"];
let donationId = "";
const alloc = (amount: number, requestKey: string) => createAllocation({ donationId, causeId: "C1", amount, requestKey, actorEmail: "a@x.invalid" });
const rows = () => fakeSheets.records("Allocations");

beforeEach(async () => {
  await resetWorld();
  fakeSheets.seed("Causes", HEADERS, [{ id: "C1", title: "Cause One", category: "Relief", targetAmount: "1000", raisedAmount: "0", location: "", description: "", status: "Active", imageUrl: "", driveFileId: "", createdAt: "", kind: "cause" }]);
  causeRepository.invalidateCache();
  const { POST } = await import("@/app/api/donate/route");
  const fd = new FormData();
  for (const [k, v] of Object.entries({ donorName: "Alloc Test", donorContact: "alloc@example.invalid", amount: "100", selectedCauses: JSON.stringify([{ causeId: "C1" }]) })) fd.set(k, v);
  fd.set("screenshot", new File([new Uint8Array([137, 80, 78, 71])], "p.png", { type: "image/png" }));
  const res = await POST(new NextRequest("http://t/api/donate", { method: "POST", body: fd, headers: { "x-forwarded-for": "10.7.0.1" } }));
  donationId = ((await res.json()) as any).trackingId;
  await donationRepository.updateStatus(donationId, "completed");
});

describe("an allocation whose cap check cannot run is never left active", () => {
  it("the verification read fails (rate limit): the row is reversed by the system, the caller gets 503, the retry with the same key succeeds once", async () => {
    const real = allocationRepository.getAll.bind(allocationRepository);
    let calls = 0;
    const spy = vi.spyOn(allocationRepository, "getAll").mockImplementation(async (fresh?: boolean) => {
      calls++;
      // the pre-check is one batched read (not getAll); the first getAll is the post-write verification, which fails
      if (calls === 1) throw new Error("Quota exceeded");
      return real(fresh);
    });
    const err: any = await alloc(60, "k1").catch((e) => e);
    spy.mockRestore();
    expect(err).toBeInstanceOf(AllocationError);
    expect(err.httpStatus).toBe(503);
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({ status: "reversed", reversedBy: "system" });
    expect(rows()[0].reversedReason).toMatch(/Could not verify/);

    const retry = await alloc(60, "k1"); // same key: the system-reversed row never happened
    expect(retry.duplicate).toBe(false);
    expect(rows().filter((r: any) => r.status === "active")).toHaveLength(1);
    const again = await alloc(60, "k1"); // now it IS a genuine replay
    expect(again.duplicate).toBe(true);
    expect(again.allocation.id).toBe(retry.allocation.id);
    expect(rows()).toHaveLength(2);
  });

  it("if even the undo fails the caller is told plainly that the outcome is unknown (never reported as success)", async () => {
    const real = allocationRepository.getAll.bind(allocationRepository);
    let calls = 0;
    const g = vi.spyOn(allocationRepository, "getAll").mockImplementation(async (fresh?: boolean) => {
      if (++calls === 1) throw new Error("Quota exceeded");
      return real(fresh);
    });
    const u = vi.spyOn(allocationRepository, "update").mockRejectedValue(new Error("Quota exceeded"));
    const err: any = await alloc(60, "k2").catch((e) => e);
    g.mockRestore();
    u.mockRestore();
    expect(err).toBeInstanceOf(AllocationError);
    expect(err.httpStatus).toBe(503);
    expect(err.message).toMatch(/may have been written/);
  });

  it("a cap-exceeded rollback by the system is also not returned as a successful replay", async () => {
    await alloc(80, "k3");
    await expect(alloc(40, "k4")).rejects.toBeInstanceOf(AllocationError); // pre-check refuses 80 + 40 > 100
    expect(rows().filter((r: any) => r.status === "active")).toHaveLength(1);
  });
});
