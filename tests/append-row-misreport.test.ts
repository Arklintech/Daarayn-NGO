import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeSheets } from "./helpers/fakeSheets";
import { resetWorld } from "./helpers/mocks";
import { donationRepository } from "@/lib/repositories/donationRepository";
import { donorRepository } from "@/lib/repositories/donorRepository";
import { communicationRecipientRepository } from "@/lib/repositories/communicationRecipientRepository";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

// Regression (D16): Google Sheets reports the same updatedRange for overlapping appends (verified live with 14 concurrent appends:
// 14 distinct rows were written but only 2 distinct row numbers were reported). Every protocol that orders itself by row position
// must therefore locate its own row by a unique marker, never by the number the append call returned.
beforeEach(async () => {
  await resetWorld();
  fakeSheets.misreportAppendedRow = true;
});

describe("protocols that depend on row position survive misreported append rows", () => {
  it("12 concurrent donations get 12 distinct finished ids, no PENDING row is left and nothing is overwritten", async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        donationRepository.createWithUniqueId((id) => ({ id, donorId: `D${i}`, donorName: `N${i}`, donorEmail: "", amount: 10 + i, currency: "INR", date: new Date().toISOString(), status: "pending", paymentMethod: "UPI", causeId: "", causeTitle: "", proofDriveFileId: "", transactionReference: "", notes: `n${i}` } as any), `key-${i}`)
      )
    );
    const ids = results.map((r) => r.donation.id);
    expect(new Set(ids).size).toBe(12);
    const rows = fakeSheets.records("Donations");
    expect(rows).toHaveLength(12);
    expect(rows.every((r: any) => /^DA\d+$/.test(r.id))).toBe(true);
    expect(rows.map((r: any) => r.donorName).sort()).toEqual(Array.from({ length: 12 }, (_, i) => `N${i}`).sort()); // every request kept its own row
  });

  it("concurrent creation of the SAME donor from separate callers yields one donor row", async () => {
    const build = (id: string) => ({ id, name: "Same", email: "same@example.invalid", phone: "", status: "active", donationHistory: [], projectsSupported: [], casesSupported: [] } as any);
    // separate instances are simulated by bypassing the in-process lock: call the private creator directly
    const create = (donorRepository as any).createOrFind.bind(donorRepository);
    const keys = { email: "same@example.invalid", phone: "" };
    const out = await Promise.all(Array.from({ length: 6 }, () => create(keys, build)));
    expect(fakeSheets.records("Donors").filter((r: any) => r.email === "same@example.invalid")).toHaveLength(1);
    expect(new Set(out.map((o: any) => o.donor.id)).size).toBe(1);
  });

  it("recipient rows are mapped to their real rows, so outcomes are written back to the right rows", async () => {
    const mk = (n: number, bid: string) => ({ id: `${bid}:D${n}`, broadcastId: bid, communicationType: "general_communication", scopeKey: "", donorId: `D${n}`, donorName: `D${n}`, email: `d${n}@example.invalid`, donationIds: [], status: "queued", attempts: 0, lastError: "", providerMessageId: "", eligibility: "eligible", approvedBy: "", contentHash: "", createdAt: "", updatedAt: "" } as any);
    const [a, b] = await Promise.all([communicationRecipientRepository.createQueued([mk(1, "A"), mk(2, "A"), mk(3, "A")]), communicationRecipientRepository.createQueued([mk(1, "B"), mk(2, "B")])]);
    const all = fakeSheets.records("Communication_Recipients");
    for (const grp of [a, b]) for (const r of grp) expect(all[r.rowNumber - 2].id).toBe(r.entity.id);
    // writing an outcome for batch A touches only batch A rows
    await communicationRecipientRepository.writeOutcomes(a.map((r) => ({ ...r, entity: { ...r.entity, status: "sent" as any } })));
    const after = fakeSheets.records("Communication_Recipients");
    expect(after.filter((r: any) => r.status === "sent").map((r: any) => r.broadcastId)).toEqual(["A", "A", "A"]);
    expect(after.filter((r: any) => r.broadcastId === "B").every((r: any) => r.status === "queued")).toBe(true);
  });

  it("portal guard: 14 concurrent code requests from one IP allow exactly 10 and refuse 4; consume() lets only one of two racers win", async () => {
    const { guardCodeRequest, guardCodeAttempt } = await import("@/lib/donors/portalGuard");
    const res = await Promise.all(Array.from({ length: 14 }, (_, i) => guardCodeRequest({ ip: "9.9.9.9", identifier: `x${i}@example.invalid`, donorId: "" })));
    expect(res.filter((r) => r.allowed).length).toBe(10);
    expect(res.filter((r) => !r.allowed && (r as any).scope === "ip").length).toBe(4);

    const attempts = await Promise.all([guardCodeAttempt({ ip: "8.8.8.1", nonce: "N1" }), guardCodeAttempt({ ip: "8.8.8.2", nonce: "N1" })]);
    const claims = await Promise.all(attempts.map((a) => (a.ok ? a.consume() : Promise.resolve(false))));
    expect(claims.filter(Boolean).length).toBeLessThanOrEqual(1);
  });

  it("identifier limit: 8 concurrent requests for one identifier allow at most 3", async () => {
    const { guardCodeRequest } = await import("@/lib/donors/portalGuard");
    const res = await Promise.all(Array.from({ length: 8 }, (_, i) => guardCodeRequest({ ip: `7.7.7.${i}`, identifier: "one@example.invalid", donorId: "DNR-1" })));
    expect(res.filter((r) => r.allowed).length).toBeLessThanOrEqual(3);
  });
});
