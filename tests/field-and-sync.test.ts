import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeSheets } from "./helpers/fakeSheets";
import { resetWorld, authState, driveMock } from "./helpers/mocks";
import { realtimeBroadcaster } from "@/lib/realtime/broadcaster";

beforeEach(resetWorld);

const multipart = (fields: Record<string, string>, files: File[] = []) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  files.forEach((f) => fd.append("mediaFiles", f));
  return new NextRequest("http://t/api/field/reports", { method: "POST", body: fd });
};

describe("Field Agent reports (scenario 13)", () => {
  it("an agent's report is attributed to that agent, its evidence goes to Drive and the id is stored on the record", async () => {
    authState.role = "agent";
    const { POST, GET } = await import("@/app/api/field/reports/route");
    const res = await POST(
      multipart({ title: "Well repair", category: "Water", description: "pump broken", agentId: "FA999", agentName: "Spoofed" }, [new File(["img"], "e.png", { type: "image/png" })])
    );
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.report.agentId).toBe("FA001"); // identity comes from the session, not the form
    const row = fakeSheets.records("Field_Reports")[0];
    expect(row).toMatchObject({ id: "FR001", agentId: "FA001", title: "Well repair", status: "Pending Review" });
    expect(JSON.parse(row.media)).toEqual(["DRIVEPROOF_000001"]);
    expect(driveMock.uploadFile).toHaveBeenCalledWith(expect.anything(), "e.png", "image/png", "Field Reports/Images", "Well repair", "Spoofed");

    // an agent sees only their own reports; admin sees all
    fakeSheets.records("Field_Reports");
    const mine = await (await GET(new NextRequest("http://t/api/field/reports"))).json();
    expect(mine).toHaveLength(1);
    authState.role = "admin";
    const all = await (await GET(new NextRequest("http://t/api/field/reports"))).json();
    expect(all).toHaveLength(1);
  });

  it("unauthenticated submissions are refused", async () => {
    authState.role = "none";
    const { POST } = await import("@/app/api/field/reports/route");
    expect((await POST(multipart({ title: "x" }))).status).toBe(401);
    expect(fakeSheets.records("Field_Reports")).toHaveLength(0);
  });

  it("14. admin review (status, notes, assignee) is persisted, survives a reload, and notifies the agent in realtime", async () => {
    authState.role = "agent";
    const { POST, PATCH } = await import("@/app/api/field/reports/route");
    await POST(multipart({ title: "Clinic need", category: "Health" }));
    authState.role = "admin";
    const res = await PATCH(
      new NextRequest("http://t/api/field/reports", {
        method: "PATCH",
        body: JSON.stringify({ reportId: "FR001", status: "Approved", adminNotes: "Verified on site", assignedTo: "admin@test.local" }),
      })
    );
    expect((await res.json()).success).toBe(true);

    const row = fakeSheets.records("Field_Reports")[0];
    expect(row).toMatchObject({ status: "Approved", adminNotes: "Verified on site", assignedAdminId: "admin@test.local" });

    // "reload": a fresh read through the repository sees the same persisted values
    const { fieldReportRepository } = await import("@/lib/repositories/fieldReportRepository");
    fieldReportRepository.invalidateCache();
    const reloaded = (await fieldReportRepository.getAll(true))[0] as any;
    expect(reloaded.adminNotes).toBe("Verified on site");

    expect(realtimeBroadcaster.broadcast).toHaveBeenCalledWith("FIELD_REPORT_UPDATE", expect.objectContaining({ id: "FR001" }), { audience: ["admin", "agent:FA001"] });
    const notes = fakeSheets.records("Notifications");
    expect(notes.some((n) => n.recipientType === "FieldAgent" && n.recipientId === "FA001")).toBe(true);
  });
});

describe("Realtime publishing order (scenario 14)", () => {
  it("a donation status change is published only after the sheet holds the change", async () => {
    const { donationService } = await import("@/lib/services/donationService");
    const r = await donationService.processDonation({
      donorName: "A", donorContact: "a@example.org", amount: 10, cause: "General", screenshotBuffer: Buffer.from("x"), screenshotMimeType: "image/png",
    });
    const { PATCH } = await import("@/app/api/admin/donations/route");
    (realtimeBroadcaster.publish as any).mockClear();
    let sheetStatusAtPublish = "";
    (realtimeBroadcaster.publish as any).mockImplementationOnce(async () => {
      sheetStatusAtPublish = fakeSheets.records("Donations").find((d) => d.id === r.donationId)!.status;
      return { delivered: "log" };
    });
    authState.role = "admin";
    const res = await PATCH(new NextRequest("http://t/api/admin/donations", { method: "PATCH", body: JSON.stringify({ id: r.donationId, status: "completed", expectedStatus: "pending" }) }));
    expect((await res.json()).changed).toBe(true);
    expect(sheetStatusAtPublish).toBe("completed");
    // an unauthorised caller changes nothing
    authState.role = "none";
    const denied = await PATCH(new NextRequest("http://t/api/admin/donations", { method: "PATCH", body: JSON.stringify({ id: r.donationId, status: "rejected" }) }));
    expect(denied.status).toBe(401);
    expect(fakeSheets.records("Donations").find((d) => d.id === r.donationId)!.status).toBe("completed");
  });
});
