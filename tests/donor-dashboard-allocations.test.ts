import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import fs from "fs";
import { fakeSheets } from "./helpers/fakeSheets";
import { resetWorld } from "./helpers/mocks";

beforeEach(async () => {
  await resetWorld();
  fakeSheets.seed("Donors", ["id", "name", "email", "phone", "status"], [
    { id: "DNR-A", name: "A", email: "a@example.invalid", phone: "", status: "active" },
    { id: "DNR-B", name: "B", email: "b@example.invalid", phone: "", status: "active" },
  ]);
  fakeSheets.seed("Donations", ["id", "donorId", "donorEmail", "amount", "status", "date", "causeId"], [
    { id: "DA1", donorId: "DNR-A", donorEmail: "a@example.invalid", amount: 1000, status: "completed", date: "2026-10-01", causeId: "C1" },
    { id: "DA2", donorId: "DNR-B", donorEmail: "b@example.invalid", amount: 700, status: "completed", date: "2026-10-01", causeId: "C1" },
  ]);
});

const dashboard = async (donorId: string) => {
  const { GET } = await import("@/app/api/donor/dashboard/route");
  const { issueSession } = await import("@/lib/donors/portalAuth");
  return (await GET(new NextRequest("http://t/d", { headers: { cookie: `daarayn_donor=${issueSession(donorId)}` } }))).json() as Promise<any>;
};

describe("donor dashboard shows REAL allocations only", () => {
  it("a verified donation with no allocation shows no allocation and no invented 90/10 split", async () => {
    const body = await dashboard("DNR-A");
    expect(body.allocations).toEqual([]);
    expect(JSON.stringify(body)).not.toMatch(/directAid|opsCost/);
  });

  it("shows only the signed-in donor's active allocations, with public-safe fields (no admin e-mail, notes or evidence ids)", async () => {
    fakeSheets.seed("Allocations", ["id", "donationId", "donorId", "targetTitle", "allocatedAmount", "allocationDate", "adminEmail", "status", "notes", "evidenceDriveFileIds"], [
      { id: "AL1", donationId: "DA1", donorId: "DNR-A", targetTitle: "Cause One", allocatedAmount: 400, allocationDate: "2026-10-02", adminEmail: "admin@example.invalid", status: "active", notes: "internal", evidenceDriveFileIds: "[\"F1\"]" },
      { id: "AL2", donationId: "DA1", donorId: "DNR-A", targetTitle: "Cause One", allocatedAmount: 100, allocationDate: "2026-10-03", adminEmail: "admin@example.invalid", status: "reversed", notes: "", evidenceDriveFileIds: "[]" },
      { id: "AL3", donationId: "DA2", donorId: "DNR-B", targetTitle: "Cause One", allocatedAmount: 500, allocationDate: "2026-10-02", adminEmail: "admin@example.invalid", status: "active", notes: "", evidenceDriveFileIds: "[]" },
    ]);
    const a = await dashboard("DNR-A");
    expect(a.allocations).toEqual([{ id: "AL1", donationId: "DA1", targetTitle: "Cause One", allocatedAmount: 400, allocationDate: "2026-10-02" }]);
    expect(JSON.stringify(a.allocations)).not.toMatch(/admin@|internal|F1/);
    const b = await dashboard("DNR-B");
    expect(b.allocations.map((x: any) => x.id)).toEqual(["AL3"]);
  });

  it("the donor page makes no 90/10 or AI claim", () => {
    const page = fs.readFileSync("app/donor/dashboard/page.tsx", "utf8");
    expect(page).not.toMatch(/90\/10|AI-Generated|AI Summary|AI Impact/i);
  });
});
