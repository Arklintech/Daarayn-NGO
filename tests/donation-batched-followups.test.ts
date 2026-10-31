import { describe, it, expect, vi } from "vitest";
import { fakeSheets } from "./helpers/fakeSheets";
import { resetWorld, driveMock } from "./helpers/mocks";
import { donationService } from "@/lib/services/donationService";
import { recoverDonation } from "@/lib/services/donationRecovery";
import { causeRepository } from "@/lib/repositories/causeRepository";
import { donationCauseRepository } from "@/lib/repositories/donationCauseRepository";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

/** R1 (D35 follow-up): designations, admin notification and audit record are written in ONE atomic request. */
const CAUSE_HEADERS = ["id", "title", "category", "targetAmount", "raisedAmount", "location", "description", "status", "imageUrl", "driveFileId", "createdAt", "kind"];
const cause = (id: string) => ({ id, title: `Cause ${id}`, category: "Relief", targetAmount: "1000", raisedAmount: "0", location: "", description: "", status: "Active", imageUrl: "", driveFileId: "", createdAt: "", kind: "cause" });

async function setup() {
  await resetWorld();
  fakeSheets.seed("Causes", CAUSE_HEADERS, [cause("C1"), cause("C2")]);
  causeRepository.invalidateCache();
  driveMock.uploadFile.mockImplementation(async () => ({ drive_file_id: "P1", storage_backend: "google_drive" }));
}
const donate = (over: Record<string, unknown> = {}) =>
  donationService.processDonation({ donorName: "Batch Donor", donorContact: "batch@example.invalid", amount: 300, cause: "x", selectedCauses: [{ causeId: "C1" }, { causeId: "C2" }], screenshotBuffer: Buffer.from("png"), screenshotFilename: "p.png", screenshotMimeType: "image/png", submissionKey: `K-${Math.random()}`, ...over });

describe("R1: batched follow-up writes", () => {
  it("writes designations, notification and audit with ONE multi-tab request and no separate appends to those tabs", async () => {
    await setup();
    const batch = vi.spyOn(fakeSheets, "appendRowsToTabs");
    const appendRow = vi.spyOn(fakeSheets, "appendRow");
    const appendRows = vi.spyOn(fakeSheets, "appendRows");
    const r = await donate();
    expect(r.operationStatus).toBe("complete");
    expect(batch).toHaveBeenCalledTimes(1);
    const tabs = (batch.mock.calls[0][0] as any[]).filter((b) => b.records.length).map((b) => b.sheetName).sort();
    expect(tabs).toEqual(["Audit_Log", "Donation_Causes", "Notifications"]);
    const separate = [...appendRow.mock.calls, ...appendRows.mock.calls].map((c) => c[0]);
    expect(separate).not.toContain("Notifications");
    expect(separate).not.toContain("Audit_Log");
    expect(separate).not.toContain("Donation_Causes");
    expect(fakeSheets.records("Donation_Causes").filter((x: any) => x.donationId === r.donationId)).toHaveLength(2);
    const notif = fakeSheets.records("Notifications");
    expect(notif).toHaveLength(1);
    expect(notif[0]).toMatchObject({ recipientType: "Admin", type: "DONATION", relatedEntityId: r.donationId, read: "false" });
    const audit = fakeSheets.records("Audit_Log");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: "SUBMIT_DONATION", entity_id: r.donationId, actor_role: "donor" });
    // the audit record is written AFTER the confirmed donation row: the donation row exists with its final id and a "complete" state
    expect(fakeSheets.records("Donations").find((d: any) => d.id === r.donationId)).toMatchObject({ opStatus: "complete" });
  });

  it("a general donation (no designations) still batches notification and audit into one request", async () => {
    await setup();
    const batch = vi.spyOn(fakeSheets, "appendRowsToTabs");
    const r = await donate({ selectedCauses: undefined, cause: "General" });
    expect(r.operationStatus).toBe("complete");
    expect(batch).toHaveBeenCalledTimes(1);
    expect((batch.mock.calls[0][0] as any[]).filter((b) => b.records.length).map((b) => b.sheetName).sort()).toEqual(["Audit_Log", "Notifications"]);
  });

  it("a failed batch leaves the donation recorded and all three steps pending; recovery completes them exactly once", async () => {
    await setup();
    vi.spyOn(fakeSheets, "appendRowsToTabs").mockRejectedValueOnce(new Error("Simulated batch failure"));
    const r = await donate();
    expect(r.success).toBe(true);
    expect(r.operationStatus).toBe("partial");
    expect([...(r.pendingSteps || [])].sort()).toEqual(["audit", "designations", "notification"]);
    expect(fakeSheets.records("Notifications")).toHaveLength(0);
    expect(fakeSheets.records("Audit_Log")).toHaveLength(0);
    expect(fakeSheets.records("Donation_Causes")).toHaveLength(0);
    const rec = await recoverDonation(r.donationId, "admin@test.local");
    expect(rec.remaining).toEqual([]);
    await recoverDonation(r.donationId, "admin@test.local"); // idempotent
    expect(fakeSheets.records("Donation_Causes").filter((x: any) => x.donationId === r.donationId)).toHaveLength(2);
    expect(fakeSheets.records("Notifications").filter((x: any) => x.relatedEntityId === r.donationId)).toHaveLength(1);
    expect(fakeSheets.records("Audit_Log").filter((x: any) => x.entity_id === r.donationId && x.action === "SUBMIT_DONATION")).toHaveLength(1);
  });

  it("if the post-append designation check fails, notification and audit are written and only designations stay pending", async () => {
    await setup();
    vi.spyOn(donationCauseRepository, "settleAfterAppend").mockRejectedValueOnce(new Error("Simulated read failure"));
    const r = await donate();
    expect(r.operationStatus).toBe("partial");
    expect(r.pendingSteps).toEqual(["designations"]);
    expect(fakeSheets.records("Notifications")).toHaveLength(1);
    expect(fakeSheets.records("Audit_Log")).toHaveLength(1);
    // the rows were written by the batch; recovery must not duplicate them
    expect(fakeSheets.records("Donation_Causes")).toHaveLength(2);
    await recoverDonation(r.donationId, "admin@test.local");
    expect(fakeSheets.records("Donation_Causes").filter((x: any) => x.donationId === r.donationId)).toHaveLength(2);
  });

  it("a retried submission (same key) writes nothing more", async () => {
    await setup();
    const key = "K-IDEMPOTENT";
    const first = await donate({ submissionKey: key });
    const second = await donate({ submissionKey: key });
    expect(second.duplicate).toBe(true);
    expect(second.donationId).toBe(first.donationId);
    expect(fakeSheets.records("Notifications")).toHaveLength(1);
    expect(fakeSheets.records("Audit_Log")).toHaveLength(1);
    expect(fakeSheets.records("Donation_Causes")).toHaveLength(2);
    expect(fakeSheets.records("Donations")).toHaveLength(1);
  });
});
