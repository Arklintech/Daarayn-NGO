import { describe, it, expect, vi } from "vitest";
import { fakeSheets } from "./helpers/fakeSheets";
import { resetWorld, driveMock } from "./helpers/mocks";
import { donationService } from "@/lib/services/donationService";
import { donationRepository } from "@/lib/repositories/donationRepository";
import { recoverDonation } from "@/lib/services/donationRecovery";
import { causeRepository } from "@/lib/repositories/causeRepository";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

/**
 * D36 Phase B: the designation PRE-read was removed for the FIRST-RUN path only (a donation row this very request created). These tests prove the
 * guarantee the pre-read used to give from other mechanisms, case by case. The recovery path keeps its read (createMissing).
 */
const CAUSE_HEADERS = ["id", "title", "category", "targetAmount", "raisedAmount", "location", "description", "status", "imageUrl", "driveFileId", "createdAt", "kind"];
const cause = (id: string) => ({ id, title: `Cause ${id}`, category: "Relief", targetAmount: "1000", raisedAmount: "0", location: "", description: "", status: "Active", imageUrl: "", driveFileId: "", createdAt: "", kind: "cause" });
const DC_HEADERS = ["id", "donationId", "causeId", "causeTitle", "designatedAmount", "designationStatus", "provenance", "createdAt", "updatedAt", "updatedBy"];

async function setup() {
  await resetWorld();
  fakeSheets.seed("Causes", CAUSE_HEADERS, [cause("C1"), cause("C2")]);
  causeRepository.invalidateCache();
  driveMock.uploadFile.mockImplementation(async () => ({ drive_file_id: "P1", storage_backend: "google_drive" }));
}
const donate = (over: Record<string, unknown> = {}) =>
  donationService.processDonation({ donorName: "First Run", donorContact: "first@example.invalid", amount: 300, cause: "x", selectedCauses: [{ causeId: "C1" }, { causeId: "C2" }], screenshotBuffer: Buffer.from("png"), screenshotFilename: "p.png", screenshotMimeType: "image/png", submissionKey: `K-${Math.random()}`, ...over });
const dcFor = (donationId: string) => fakeSheets.records("Donation_Causes").filter((x: any) => x.donationId === donationId);

describe("D36 B: designations on the first run need no pre-read", () => {
  it("first submission: exactly one read of Donation_Causes (the kept post-append check), two rows", async () => {
    await setup();
    const reads = vi.spyOn(fakeSheets, "getRowsWithNumbers");
    const r = await donate();
    const dcReads = reads.mock.calls.filter((c) => c[0] === "Donation_Causes").length;
    expect(dcReads).toBe(1);
    expect(dcFor(r.donationId)).toHaveLength(2);
    expect(r.operationStatus).toBe("complete");
  });

  it("repeated submission: no new rows, no read or write of Donation_Causes at all", async () => {
    await setup();
    const key = "K-REPEAT";
    const first = await donate({ submissionKey: key });
    const reads = vi.spyOn(fakeSheets, "getRowsWithNumbers");
    const batch = vi.spyOn(fakeSheets, "appendRowsToTabs");
    const again = await donate({ submissionKey: key });
    expect(again.duplicate).toBe(true);
    expect(reads.mock.calls.filter((c) => c[0] === "Donation_Causes")).toHaveLength(0);
    expect(batch).not.toHaveBeenCalled();
    expect(dcFor(first.donationId)).toHaveLength(2);
  });

  it("six simultaneous duplicate submissions of one key: one donation, one set of designations, one notification, one audit", async () => {
    await setup();
    const key = "K-SIM";
    const out = await Promise.all(Array.from({ length: 6 }, () => donate({ submissionKey: key })));
    const ids = new Set(out.map((o) => o.donationId));
    expect(ids.size).toBe(1);
    expect(out.filter((o) => !o.duplicate)).toHaveLength(1);
    const id = [...ids][0];
    expect(dcFor(id)).toHaveLength(2);
    expect(fakeSheets.records("Notifications").filter((n: any) => n.relatedEntityId === id)).toHaveLength(1);
    expect(fakeSheets.records("Audit_Log").filter((a: any) => a.entity_id === id && a.action === "SUBMIT_DONATION")).toHaveLength(1);
    expect(fakeSheets.records("Donations").filter((d: any) => d.submissionKey === key)).toHaveLength(1);
  }, 60_000);

  it("many independent concurrent donations: every donation owns exactly its own designation rows (no cross-talk, no duplicates)", async () => {
    await setup();
    const out = await Promise.all(Array.from({ length: 12 }, (_, i) => donate({ donorContact: `d${i}@example.invalid`, submissionKey: `K-IND-${i}-${Math.random()}` })));
    const rows = fakeSheets.records("Donation_Causes");
    expect(rows).toHaveLength(24);
    expect(new Set(rows.map((r: any) => r.id)).size).toBe(24);
    for (const o of out) expect(dcFor(o.donationId)).toHaveLength(2);
  }, 60_000);

  it("failed append: nothing partial is written; recovery completes the three steps exactly once", async () => {
    await setup();
    vi.spyOn(fakeSheets, "appendRowsToTabs").mockRejectedValueOnce(new Error("Simulated append failure"));
    const r = await donate();
    expect(r.operationStatus).toBe("partial");
    expect(dcFor(r.donationId)).toHaveLength(0);
    await recoverDonation(r.donationId, "admin@test.local");
    await recoverDonation(r.donationId, "admin@test.local");
    expect(dcFor(r.donationId)).toHaveLength(2);
  });

  it("interrupted first attempt (row confirmed, follow-ups never ran): a replay does not repeat them; recovery finishes them", async () => {
    await setup();
    const key = "K-INTERRUPT";
    vi.spyOn(fakeSheets, "appendRowsToTabs").mockRejectedValueOnce(new Error("worker killed"));
    const first = await donate({ submissionKey: key });
    const replay = await donate({ submissionKey: key });
    expect(replay.duplicate).toBe(true);
    expect(replay.donationId).toBe(first.donationId);
    expect(dcFor(first.donationId)).toHaveLength(0);
    await recoverDonation(first.donationId, "admin@test.local");
    expect(dcFor(first.donationId)).toHaveLength(2);
  });

  it("stale PENDING claim of the same key is adopted after the threshold and its follow-ups run exactly once", async () => {
    await setup();
    await donationRepository.init();
    const headers = fakeSheets.tabs.get("Donations")!.headers;
    const old = new Date(Date.now() - 60_000).toISOString();
    fakeSheets.seed("Donations", headers, [{ id: "PENDING", donorId: "", amount: 0, currency: "INR", date: old, status: "pending", notes: "claim:dead", submissionKey: "K-STALE" }]);
    donationRepository.invalidateCache();
    const r = await donate({ submissionKey: "K-STALE" });
    expect(r.success).toBe(true);
    expect(r.duplicate).toBeFalsy();
    expect(r.operationStatus).toBe("complete");
    expect(dcFor(r.donationId)).toHaveLength(2);
    expect(fakeSheets.records("Donations").filter((d: any) => d.submissionKey === "K-STALE")).toHaveLength(1);
  });

  it("leftover IDENTICAL designation rows for a reused id: the kept post-append check leaves exactly one row per designation", async () => {
    await setup();
    const now = new Date().toISOString();
    const stale = (c: string) => ({ id: `DC-DA001-${c}`, donationId: "DA001", causeId: c, causeTitle: `Cause ${c}`, designatedAmount: "", designationStatus: "unresolved", provenance: "donor_selected", createdAt: now, updatedAt: now, updatedBy: "donor" });
    fakeSheets.seed("Donation_Causes", DC_HEADERS, [stale("C1"), stale("C2")]);
    const r = await donate();
    expect(r.donationId).toBe("DA001");
    expect(dcFor("DA001")).toHaveLength(2);
    expect(r.operationStatus).toBe("complete");
  });

  it("leftover DIFFERING designation rows for a reused id: never auto-resolved, the step stays pending and visible", async () => {
    await setup();
    const now = new Date().toISOString();
    fakeSheets.seed("Donation_Causes", DC_HEADERS, [{ id: "DC-DA001-C1", donationId: "DA001", causeId: "C1", causeTitle: "Cause C1", designatedAmount: "5", designationStatus: "designated", provenance: "admin", createdAt: now, updatedAt: now, updatedBy: "someone" }]);
    const r = await donate();
    expect(r.donationId).toBe("DA001");
    expect(r.operationStatus).toBe("partial");
    expect(r.pendingSteps).toEqual(["designations"]);
    expect(dcFor("DA001").filter((x: any) => x.causeId === "C1")).toHaveLength(2); // both kept for a human to resolve
  });
});
