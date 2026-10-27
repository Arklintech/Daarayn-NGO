import { describe, it, expect } from "vitest";
import { findIntegrityExceptions } from "@/lib/reporting/integrity";

const donor = (id: string, email = "", phone = "") => ({ id, name: id, email, phone } as any);
const donation = (id: string, donorId: string) => ({ id, donorId, amount: 100, status: "completed", date: new Date().toISOString() } as any);
const run = (donors: any[], donations: any[]) => findIntegrityExceptions({ donors, donations, causes: [], designations: [], allocations: [] });

// Found in the D3 audit: five donations pointed at a donor token with no donor record, and several donor records shared
// one email address; neither was reported, so donor counts and histories could be wrong without any signal.
describe("donor relationship integrity", () => {
  it("reports a donation whose donor record does not exist", () => {
    const ex = run([donor("DNR-A", "a@example.invalid")], [donation("DA001", "DNR-A"), donation("DA002", "DNR-GONE")]);
    const missing = ex.filter((e) => e.type === "DONATION_DONOR_MISSING");
    expect(missing).toHaveLength(1);
    expect(missing[0]).toMatchObject({ entityId: "DA002", severity: "warning" });
    expect(missing[0].message).toContain("DNR-GONE");
  });

  it("does not report a donation that has a donor", () => {
    expect(run([donor("DNR-A", "a@example.invalid")], [donation("DA001", "DNR-A")])).toEqual([]);
  });

  it("reports two donor records sharing a normalized email, once, naming both tokens", () => {
    const ex = run([donor("DNR-1", "Same@Example.invalid"), donor("DNR-2", " same@example.invalid ")], []);
    const dup = ex.filter((e) => e.type === "DUPLICATE_DONOR_CONTACT");
    expect(dup).toHaveLength(1);
    expect(dup[0].message).toContain("DNR-1");
    expect(dup[0].message).toContain("DNR-2");
  });

  it("reports donors sharing a phone written in different formats", () => {
    const ex = run([donor("DNR-1", "", "+91 98765-43210"), donor("DNR-2", "", "09876543210")], []);
    expect(ex.filter((e) => e.type === "DUPLICATE_DONOR_CONTACT")).toHaveLength(1);
  });

  it("does not merge or report different people", () => {
    expect(run([donor("DNR-1", "a@example.invalid"), donor("DNR-2", "b@example.invalid")], [])).toEqual([]);
  });
});
