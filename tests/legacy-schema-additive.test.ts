import { describe, it, expect, beforeEach } from "vitest";
import { fakeSheets } from "./helpers/fakeSheets";
import { resetWorld } from "./helpers/mocks";

// D4-T7: production worksheets predate several columns and tabs. The application must read legacy rows unchanged and only
// ever ADD columns/tabs (never rewrite or delete existing data). Shapes below are the production header sets observed
// read-only on 2026-10-28 (Donations 15 columns; Allocations / Donation_Causes / Portal_Auth_Events tabs absent).
const PROD_DONATION_HEADERS = ["id", "donorId", "donorName", "donorEmail", "amount", "currency", "date", "status", "paymentMethod", "causeId", "causeTitle", "transactionReference", "screenshotUrl", "submissionKey", "verifiedBy"];

beforeEach(resetWorld);

describe("legacy production-shaped data", () => {
  it("legacy donations are read unchanged and still counted by the unified metrics", async () => {
    fakeSheets.seed("Donations", PROD_DONATION_HEADERS, [
      { id: "DA001", donorId: "DNR-A", donorName: "A", donorEmail: "a@example.org", amount: 500, currency: "INR", date: "2026-09-01", status: "completed", paymentMethod: "UPI", causeId: "", causeTitle: "General Support", submissionKey: "k1" },
      { id: "DA002", donorId: "DNR-B", donorName: "B", donorEmail: "b@example.org", amount: 300, currency: "INR", date: "2026-09-02", status: "pending", paymentMethod: "UPI", causeId: "", causeTitle: "General Support", submissionKey: "k2" },
    ]);
    const { donationRepository } = await import("@/lib/repositories/donationRepository");
    const rows = await donationRepository.getAll(true);
    expect(rows.map((r) => [r.id, r.amount, r.status])).toEqual([["DA001", 500, "completed"], ["DA002", 300, "pending"]]);
    const { summarizeDonations } = await import("@/lib/donations/metrics");
    const m = summarizeDonations(rows as any);
    expect([m.receivedAmount, m.receivedCount, m.pendingAmount, m.pendingCount]).toEqual([500, 1, 300, 1]);
  });

  it("a new write only adds columns and rows: every legacy cell is preserved byte for byte", async () => {
    const legacy = [{ id: "DA001", donorId: "DNR-A", donorName: "A", donorEmail: "a@example.org", amount: 500, currency: "INR", date: "2026-09-01", status: "completed", paymentMethod: "UPI", causeId: "", causeTitle: "General Support", submissionKey: "k1" }];
    fakeSheets.seed("Donations", PROD_DONATION_HEADERS, legacy);
    const before = JSON.stringify(fakeSheets.records("Donations"));
    const { donationRepository } = await import("@/lib/repositories/donationRepository");
    await donationRepository.createWithUniqueId(
      (id) => ({ id, donorId: "DNR-A", donorName: "A", donorEmail: "a@example.org", amount: 100, currency: "INR", date: "2026-10-28", status: "pending", paymentMethod: "UPI", causeId: "", causeTitle: "General Support", transactionReference: "" } as any),
      "k-new"
    );
    const after = fakeSheets.records("Donations");
    expect(after).toHaveLength(2);
    expect(Object.keys(after[0]).slice(0, PROD_DONATION_HEADERS.length)).toEqual(PROD_DONATION_HEADERS); // existing columns keep their positions
    for (const h of PROD_DONATION_HEADERS) expect(String(after[0][h])).toBe(String((JSON.parse(before)[0] as any)[h]));
    expect(after[1].id).toBe("DA002");
  });

  it("tabs that do not exist yet are created on first use, with headers, without touching other tabs", async () => {
    fakeSheets.seed("Donations", PROD_DONATION_HEADERS, []);
    const { allocationRepository } = await import("@/lib/repositories/allocationRepository");
    await (allocationRepository as any).getAll(true);
    expect(fakeSheets.tabs.get("Allocations")?.headers.length).toBeGreaterThan(5);
    expect(fakeSheets.tabs.get("Donations")?.headers).toEqual(PROD_DONATION_HEADERS);
  });
});
