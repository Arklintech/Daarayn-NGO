import { describe, it, expect } from "vitest";
import { validateOnboardingBatch, type OnboardingBatch } from "@/lib/onboarding/validate";

const good = (): OnboardingBatch => ({
  donors: [{ id: "DNR-AAA-0001" }, { id: "DNR-AAA-0002" }],
  causes: [{ id: "CAUSE-1" }, { id: "CAUSE-2" }],
  donations: [
    { id: "DA001", donorId: "DNR-AAA-0001", amount: 100, submissionKey: "k1" },
    { id: "DA002", donorId: "DNR-AAA-0002", amount: 50.5, submissionKey: "k2" },
  ],
  designations: [
    { donationId: "DA001", causeId: "CAUSE-1", designatedAmount: 100 },
    { donationId: "DA002", causeId: "CAUSE-2", designatedAmount: 50.5 },
  ],
  allocations: [{ id: "ALLOC-1", donationId: "DA001", causeId: "CAUSE-1", allocatedAmount: 60, status: "active", requestKey: "a1" }],
});
const codes = (b: OnboardingBatch) => validateOnboardingBatch(b).problems.map((p) => p.code);

describe("D32: onboarding batch validation (pure; no real data is handled here)", () => {
  it("a consistent batch passes and reports its counts", () => {
    const r = validateOnboardingBatch(good());
    expect(r.ok).toBe(true);
    expect(r.counts).toMatchObject({ donors: 2, donations: 2, allocations: 1 });
  });

  it("detects duplicate and malformed permanent ids", () => {
    const b = good();
    b.donations.push({ id: "DA001", donorId: "DNR-AAA-0001", amount: 10 });
    b.donors.push({ id: "x" });
    expect(codes(b)).toEqual(expect.arrayContaining(["DUPLICATE_ID", "BAD_ID"]));
  });

  it("detects broken relationships (missing donor, donation, cause, designation)", () => {
    const b = good();
    b.donations[0].donorId = "DNR-NOPE-0000";
    b.designations.push({ donationId: "DA999", causeId: "CAUSE-9", designatedAmount: 5 });
    b.allocations.push({ id: "ALLOC-2", donationId: "DA002", causeId: "CAUSE-1", allocatedAmount: 5 });
    expect(codes(b)).toEqual(expect.arrayContaining(["DONOR_MISSING", "DONATION_MISSING", "CAUSE_MISSING", "NO_DESIGNATION"]));
  });

  it("detects duplicate donations (same submission key) and duplicate allocation request keys", () => {
    const b = good();
    b.donations.push({ id: "DA003", donorId: "DNR-AAA-0001", amount: 100, submissionKey: "k1" });
    b.allocations.push({ id: "ALLOC-3", donationId: "DA002", causeId: "CAUSE-2", allocatedAmount: 5, requestKey: "a1" });
    expect(codes(b)).toEqual(expect.arrayContaining(["DUPLICATE_SUBMISSION_KEY", "DUPLICATE_REQUEST_KEY"]));
  });

  it("enforces the financial invariants: designations within the donation, allocations within the designation, valid money", () => {
    const b = good();
    b.designations.push({ donationId: "DA001", causeId: "CAUSE-2", designatedAmount: 10 }); // 110 > 100
    b.allocations.push({ id: "ALLOC-4", donationId: "DA001", causeId: "CAUSE-1", allocatedAmount: 50, status: "active" }); // 60 + 50 > 100
    b.donations.push({ id: "DA004", donorId: "DNR-AAA-0001", amount: 10.005 }); // not whole cents
    expect(codes(b)).toEqual(expect.arrayContaining(["DESIGNATED_EXCEEDS_DONATION", "ALLOCATED_EXCEEDS_DESIGNATED", "BAD_AMOUNT"]));
  });

  it("reversed allocations do not count against the designation", () => {
    const b = good();
    b.allocations.push({ id: "ALLOC-5", donationId: "DA001", causeId: "CAUSE-1", allocatedAmount: 50, status: "reversed" });
    expect(validateOnboardingBatch(b).ok).toBe(true);
  });

  it("compares the batch with totals stated independently by the owner; it never invents a total", () => {
    const b = good();
    expect(validateOnboardingBatch({ ...b, statedTotals: { donationsTotal: 150.5, allocatedTotal: 60 } }).ok).toBe(true);
    expect(codes({ ...b, statedTotals: { donationsTotal: 151 } })).toContain("TOTAL_MISMATCH");
    expect(validateOnboardingBatch(b).ok).toBe(true); // no stated totals: nothing is compared, nothing is assumed
  });
});
