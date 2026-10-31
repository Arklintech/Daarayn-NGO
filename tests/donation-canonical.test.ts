import { describe, it, expect, beforeEach } from "vitest";
import { fakeSheets } from "./helpers/fakeSheets";
import { resetWorld } from "./helpers/mocks";
import { donationRepository } from "@/lib/repositories/donationRepository";
import { loadSnapshot } from "@/lib/donations/snapshot";
import { findIntegrityExceptions } from "@/lib/reporting/integrity";

/**
 * D38 Track E: a stale finaliser can briefly leave a SECOND copy of a donation row (same donation id AND same submission reference). No read model may count
 * it as a second contribution. The rule is narrow on purpose: only a row that is the same id AND the same non-empty submission reference as an EARLIER row is
 * dropped from what the application reads. A duplicate donation id WITHOUT that proof (a real conflict, a manual edit) stays visible to the integrity checks.
 */
const H = ["id", "donorId", "donorName", "donorEmail", "amount", "currency", "date", "status", "paymentMethod", "causeId", "causeTitle", "proofDriveFileId", "transactionReference", "notes", "opStatus", "opPending", "submissionRef"];
const row = (over: Record<string, unknown>) => ({ id: "DA001", donorId: "D1", donorName: "A", donorEmail: "a@example.invalid", amount: 500, currency: "INR", date: "2026-11-01T00:00:00.000Z", status: "completed", paymentMethod: "UPI", causeId: "", causeTitle: "General", proofDriveFileId: "", transactionReference: "", notes: "", opStatus: "complete", opPending: "", submissionRef: "", ...over });

beforeEach(async () => {
  await resetWorld();
  donationRepository.invalidateCache();
});

describe("D38: a stale-worker duplicate is never counted as a second donation", () => {
  it("getAll (fresh and cached) returns the donation once when the copy has the same id AND submission reference", async () => {
    fakeSheets.seed("Donations", H, [row({ submissionRef: "SUB-AAAAAAAAAAAA" }), row({ submissionRef: "SUB-AAAAAAAAAAAA" }), row({ id: "DA002", amount: 100, submissionRef: "SUB-BBBBBBBBBBBB" })]);
    const fresh = await donationRepository.getAll(true);
    expect(fresh.map((d) => d.id)).toEqual(["DA001", "DA002"]);
    expect(fresh.reduce((s, d) => s + d.amount, 0)).toBe(600);
    const cached = await donationRepository.getAll();
    expect(cached.map((d) => d.id).sort()).toEqual(["DA001", "DA002"]);
  });

  it("the batched snapshot every dashboard and report is built from agrees", async () => {
    fakeSheets.seed("Donations", H, [row({ submissionRef: "SUB-AAAAAAAAAAAA" }), row({ submissionRef: "SUB-AAAAAAAAAAAA" })]);
    const snap = await loadSnapshot(["donations"]);
    expect(snap.donations).toHaveLength(1);
    expect(snap.donations[0].amount).toBe(500);
  });

  it("the EARLIEST row is the canonical one (so every reader and every worker agrees which copy stays)", async () => {
    fakeSheets.seed("Donations", H, [row({ submissionRef: "SUB-AAAAAAAAAAAA", status: "pending", donorName: "first" }), row({ submissionRef: "SUB-AAAAAAAAAAAA", status: "completed", donorName: "second" })]);
    const all = await donationRepository.getAll(true);
    expect(all).toHaveLength(1);
    expect(all[0].donorName).toBe("first");
  });

  it("a duplicate id WITHOUT a matching submission reference is a real conflict: both rows stay visible and the integrity report flags it", async () => {
    fakeSheets.seed("Donations", H, [row({}), row({ amount: 900 })]);
    const all = await donationRepository.getAll(true);
    expect(all).toHaveLength(2);
    const found = findIntegrityExceptions({ donations: all, donors: [], causes: [], designations: [], allocations: [], now: new Date() } as any);
    expect(found.some((e: any) => /DUPLICATE/i.test(e.type))).toBe(true);
  });

  it("two different submissions that (wrongly) share a donation id are NOT merged: different references mean a conflict, not a copy", async () => {
    fakeSheets.seed("Donations", H, [row({ submissionRef: "SUB-AAAAAAAAAAAA" }), row({ submissionRef: "SUB-BBBBBBBBBBBB", amount: 700 })]);
    expect(await donationRepository.getAll(true)).toHaveLength(2);
  });
});
