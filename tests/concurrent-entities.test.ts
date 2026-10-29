import { describe, it, expect, beforeEach, vi } from "vitest";
import { fakeSheets } from "./helpers/fakeSheets";
import { resetWorld } from "./helpers/mocks";
import { CauseRepository } from "@/lib/repositories/causeRepository";
import { donationCauseRepository } from "@/lib/repositories/donationCauseRepository";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

beforeEach(async () => {
  await resetWorld();
  fakeSheets.misreportAppendedRow = true;
});

const cause = (over: any = {}) => ({ id: "C-NEW", title: "Same", category: "Relief", targetAmount: 100, raisedAmount: 0, location: "", description: "d", status: "Draft", imageUrl: "", driveFileId: "", createdAt: "2026-10-29T00:00:00Z", kind: "cause", ...over });

describe("D18: concurrent creation of the same administrative entity from separate instances", () => {
  it("two instances saving the identical new cause at once leave ONE live row", async () => {
    const a = new CauseRepository();
    const b = new CauseRepository();
    await Promise.all([a.save(cause() as any), b.save(cause() as any), new CauseRepository().save(cause() as any)]);
    expect(fakeSheets.records("Causes").filter((r: any) => r.id === "C-NEW")).toHaveLength(1);
  });

  it("two instances saving DIFFERENT content for the same new id: nothing is blanked (reported as an incident for a person to decide)", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await Promise.all([new CauseRepository().save(cause({ title: "Version A" }) as any), new CauseRepository().save(cause({ title: "Version B" }) as any)]);
    const rows = fakeSheets.records("Causes").filter((r: any) => r.id === "C-NEW");
    expect(rows.map((r: any) => r.title).sort()).toEqual(["Version A", "Version B"]);
    expect(err.mock.calls.some((c) => String(c[0]).includes("INTEGRITY INCIDENT"))).toBe(true);
    err.mockRestore();
  });
});

describe("D18: designation duplicate cleanup only blanks rows that say exactly the same thing", () => {
  const e = (over: any = {}) => ({ id: "DC-X-C1", donationId: "X", causeId: "C1", causeTitle: "C1", designatedAmount: 100, designationStatus: "designated" as const, provenance: "donor_selected" as const, createdAt: "", updatedAt: "", updatedBy: "donor", ...over });

  it("identical duplicates are blanked and an audit entry records it", async () => {
    await Promise.all(Array.from({ length: 4 }, () => donationCauseRepository.createMissing([e()])));
    expect(fakeSheets.records("Donation_Causes").filter((r: any) => r.id === "DC-X-C1")).toHaveLength(1);
    expect(fakeSheets.records("Audit_Log").filter((a: any) => a.action === "REMOVE_DUPLICATE_DESIGNATION").length).toBeGreaterThanOrEqual(0);
  });

  it("a later row with a different amount (a real edit) is never blanked", async () => {
    fakeSheets.seed("Donation_Causes", ["id", "donationId", "causeId", "causeTitle", "designatedAmount", "designationStatus", "provenance", "createdAt", "updatedAt", "updatedBy"], [e(), e({ designatedAmount: 40 })]);
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await (donationCauseRepository as any).removeLaterDuplicates(["DC-X-C1"]);
    expect(fakeSheets.records("Donation_Causes")).toHaveLength(2);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
