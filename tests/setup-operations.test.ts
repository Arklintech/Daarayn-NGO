import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeApi } from "./helpers/fakeGoogleApi";
import { authState } from "./helpers/mocks";

vi.unmock("@/lib/google/sheets");
vi.mock("@/lib/google/client", () => ({
  GOOGLE_SHEET_ID: "TEST_SHEET_ID_000000000000000000000000",
  GOOGLE_DRIVE_ROOT_FOLDER_ID: "ROOT",
  googleAuthProblem: () => "",
  getSheetsClient: () => fakeApi.client(),
  getDriveClient: () => null,
  getGoogleAuth: () => ({}),
}));

function seedLegacy() {
  fakeApi.reset();
  fakeApi.tabs.set("Causes", [
    ["id", "title", "category", "targetAmount", "raisedAmount", "location", "description", "status", "imageUrl", "driveFileId", "createdAt"],
    ["EDU", "Education", "General", "1000", "0", "", "", "Active", "", "", "2026-01-01"],
  ]);
  fakeApi.tabs.set("Donations", [
    ["id", "donorId", "donorName", "donorEmail", "amount", "currency", "date", "status", "paymentMethod", "causeId", "causeTitle", "proofDriveFileId", "transactionReference", "notes", "submissionKey"],
    ["DA001", "DNR-1", "A", "a@x.org", "500", "INR", "2026-02-01", "completed", "UPI", "EDU", "Education", "", "", "", "k1"],
    ["DA002", "DNR-2", "B", "b@x.org", "300", "INR", "2026-02-02", "completed", "UPI", "", "General", "", "", "", "k2"],
    ["DA003", "DNR-3", "C", "c@x.org", "100", "INR", "2026-02-03", "rejected", "UPI", "EDU", "Education", "", "", "", "k3"],
  ]);
}

describe("operations schema setup", () => {
  it("dry run reports the changes and writes NOTHING", async () => {
    seedLegacy();
    vi.resetModules();
    const { runOperationsSetup } = await import("@/lib/setup/operationsSchema");
    fakeApi.resetCounts();
    const report = await runOperationsSetup({ apply: false, backfill: true });
    expect(fakeApi.counts.writes).toBe(0);
    expect(report.applied).toBe(false);
    expect(report.tabsToCreate).toEqual(expect.arrayContaining(["Donation_Causes", "Communication_Recipients", "Allocations"]));
    expect(report.columnsToAdd.Donations).toEqual(expect.arrayContaining(["causeSelection", "opStatus", "opPending"]));
    expect(report.legacyDonationsToBackfill).toBe(1); // only DA001: DA002 has no cause, DA003 is rejected
  });

  it("apply is additive and idempotent: columns and tabs are added, existing rows are untouched, backfill is not repeated", async () => {
    seedLegacy();
    const before = JSON.stringify(fakeApi.tabs.get("Donations")!.slice(1));
    vi.resetModules();
    const { runOperationsSetup } = await import("@/lib/setup/operationsSchema");
    const first = await runOperationsSetup({ apply: true, backfill: true });
    expect(first.backfilled).toBe(1);
    expect(fakeApi.tabs.has("Donation_Causes")).toBe(true);
    expect(fakeApi.tabs.get("Donations")![0]).toEqual(expect.arrayContaining(["causeSelection", "opStatus", "opPending"]));
    expect(fakeApi.tabs.get("Donations")![0].slice(0, 15)).toEqual(["id", "donorId", "donorName", "donorEmail", "amount", "currency", "date", "status", "paymentMethod", "causeId", "causeTitle", "proofDriveFileId", "transactionReference", "notes", "submissionKey"]);
    expect(JSON.stringify(fakeApi.tabs.get("Donations")!.slice(1).map((r) => r.slice(0, 15)))).toBe(before); // existing cells unchanged
    expect(fakeApi.records("Donation_Causes")).toEqual([expect.objectContaining({ donationId: "DA001", causeId: "EDU", designatedAmount: "500", designationStatus: "designated", updatedBy: "setup-backfill" })]);

    vi.resetModules();
    const again = await (await import("@/lib/setup/operationsSchema")).runOperationsSetup({ apply: true, backfill: true });
    expect(again.backfilled).toBe(0);
    expect(again.tabsToCreate).toEqual([]);
    expect(again.columnsToAdd).toEqual({});
    expect(fakeApi.records("Donation_Causes")).toHaveLength(1);
  });

  it("the route is admin-only and defaults to a dry run", async () => {
    seedLegacy();
    vi.resetModules();
    const { POST } = await import("@/app/api/admin/setup/operations/route");
    const req = (body: any) => new NextRequest("http://t/s", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    authState.role = "none";
    expect((await POST(req({}))).status).toBe(401);
    authState.role = "admin";
    fakeApi.resetCounts();
    const res = await (await POST(req({ backfill: true }))).json();
    expect(res).toMatchObject({ success: true, applied: false });
    expect(fakeApi.counts.writes).toBe(0);
  });
});
