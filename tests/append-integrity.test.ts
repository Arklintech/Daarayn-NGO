import { describe, it, expect, beforeEach, vi } from "vitest";
import { fakeSheets } from "./helpers/fakeSheets";
import { resetWorld, driveMock } from "./helpers/mocks";
import { donationRepository } from "@/lib/repositories/donationRepository";
import { donationService } from "@/lib/services/donationService";
import { donationCauseRepository } from "@/lib/repositories/donationCauseRepository";
import { causeRepository } from "@/lib/repositories/causeRepository";
import { createAllocation, AllocationError } from "@/lib/services/allocationService";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

const CAUSE_HEADERS = ["id", "title", "category", "targetAmount", "raisedAmount", "location", "description", "status", "imageUrl", "driveFileId", "createdAt", "kind"];
const cause = (id: string) => ({ id, title: `Cause ${id}`, category: "Relief", targetAmount: "1000", raisedAmount: "0", location: "", description: "", status: "Active", imageUrl: "", driveFileId: "", createdAt: "", kind: "cause" });
let proofSeq = 0;

beforeEach(async () => {
  await resetWorld();
  fakeSheets.misreportAppendedRow = true; // Google reports the wrong row for overlapping appends
  fakeSheets.seed("Causes", CAUSE_HEADERS, [cause("C1"), cause("C2")]);
  causeRepository.invalidateCache();
  proofSeq = 0;
  driveMock.uploadFile.mockImplementation(async () => ({ drive_file_id: `PROOF_${++proofSeq}`, storage_backend: "google_drive" }));
  driveMock.deleteFile.mockImplementation(async () => true);
});

const donate = (over: Record<string, any> = {}) =>
  donationService.processDonation({
    donorName: "Conc Test", donorContact: "conc@example.invalid", amount: 100, cause: "C1", selectedCauses: [{ causeId: "C1" }],
    screenshotBuffer: Buffer.from("png"), screenshotFilename: "p.png", screenshotMimeType: "image/png", ...over,
  });

describe("A. the SAME logical donation submitted concurrently (one submission key)", () => {
  it("8 simultaneous identical requests: one donation, one set of side effects, the same answer for everyone, redundant proofs removed", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => donate({ submissionKey: "SAME-KEY" })));
    const ids = new Set(results.map((r) => r.donationId));
    expect(ids.size).toBe(1);
    expect(results.filter((r) => !r.duplicate)).toHaveLength(1); // exactly one request did the work
    const donations = fakeSheets.records("Donations");
    expect(donations).toHaveLength(1);
    expect(donations[0].id).toMatch(/^DA\d+$/);
    expect(fakeSheets.records("Donation_Causes")).toHaveLength(1);
    expect(fakeSheets.records("Donors")).toHaveLength(1);
    expect(fakeSheets.records("Audit_Log").filter((a: any) => a.action === "SUBMIT_DONATION")).toHaveLength(1);
    // 8 proofs were uploaded before the duplicate was known; 7 redundant ones are deleted and the recorded one is kept
    expect(driveMock.uploadFile).toHaveBeenCalledTimes(8);
    expect(driveMock.deleteFile).toHaveBeenCalledTimes(7);
    const kept = donations[0].proofDriveFileId;
    expect(driveMock.deleteFile.mock.calls.map((c) => c[0])).not.toContain(kept);
  });
});

describe("B. distinct donations by the same donor, concurrently", () => {
  it("8 simultaneous donations: 8 distinct ids, 8 designations, one donor owning all of them", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => donate({ submissionKey: `K-${i}`, amount: 10 + i })));
    expect(new Set(results.map((r) => r.donationId)).size).toBe(8);
    const donations = fakeSheets.records("Donations");
    expect(donations).toHaveLength(8);
    expect(new Set(donations.map((d: any) => d.donorId)).size).toBe(1);
    expect(new Set(donations.map((d: any) => d.amount)).size).toBe(8); // every request kept its own row
    expect(fakeSheets.records("Donation_Causes")).toHaveLength(8);
    expect(fakeSheets.records("Donors")).toHaveLength(1);
  });
});

describe("C. one-time code consumption and attempt limits", () => {
  it("6 simultaneous consumptions of one code from separate callers: exactly one wins; the code is then used", async () => {
    const { guardCodeAttempt } = await import("@/lib/donors/portalGuard");
    const attempts = await Promise.all(Array.from({ length: 6 }, (_, i) => guardCodeAttempt({ ip: `3.3.3.${i}`, nonce: "NONCE-ONE" })));
    const oks = attempts.filter((a) => a.ok);
    const wins = await Promise.all(oks.map((a) => (a.ok ? a.consume() : Promise.resolve(false))));
    expect(wins.filter(Boolean)).toHaveLength(1);
    const replay = await guardCodeAttempt({ ip: "3.3.3.99", nonce: "NONCE-ONE" });
    expect(replay).toMatchObject({ ok: false, reason: "used" });
  });

  it("12 simultaneous guesses against ONE challenge: at most 5 are even evaluated", async () => {
    const { guardCodeAttempt } = await import("@/lib/donors/portalGuard");
    const attempts = await Promise.all(Array.from({ length: 12 }, (_, i) => guardCodeAttempt({ ip: `4.4.${i}.1`, nonce: "NONCE-GUESS" })));
    expect(attempts.filter((a) => a.ok).length).toBeLessThanOrEqual(5);
  });
});

describe("E. concurrent allocations", () => {
  let donationId = "";
  beforeEach(async () => {
    const r = await donate({ submissionKey: "ALLOC-BASE" });
    donationId = r.donationId;
    await donationRepository.updateStatus(donationId, "completed");
  });
  const alloc = (amount: number, requestKey: string) => createAllocation({ donationId, causeId: "C1", amount, requestKey, actorEmail: "a@x.invalid" });

  it("6 simultaneous 30s against a designated 100: at most 3 stay active (never more than the designation)", async () => {
    const res = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => alloc(30, `k${i}`)));
    const active = fakeSheets.records("Allocations").filter((a: any) => a.status === "active");
    expect(active.reduce((s: number, a: any) => s + Number(a.allocatedAmount), 0)).toBeLessThanOrEqual(100);
    expect(active.length).toBeLessThanOrEqual(3);
    expect(res.filter((r) => r.status === "fulfilled").length).toBe(active.length); // every success is an active row, every refusal left none
    for (const r of res) if (r.status === "rejected") expect(r.reason).toBeInstanceOf(AllocationError);
  });

  it("5 simultaneous replays of ONE idempotency key create ONE allocation and everyone gets it", async () => {
    const res = await Promise.all(Array.from({ length: 5 }, () => alloc(40, "SAME-ALLOC")));
    expect(new Set(res.map((r) => r.allocation.id)).size).toBe(1);
    const rows = fakeSheets.records("Allocations").filter((a: any) => a.requestKey === "SAME-ALLOC");
    expect(rows.filter((a: any) => a.status === "active")).toHaveLength(1); // one allocation
    expect(rows.filter((a: any) => a.status !== "active").every((a: any) => a.reversedBy === "system")).toBe(true); // the rest are system-reversed duplicates, kept as history
    expect(res.filter((r) => !r.duplicate).length).toBeLessThanOrEqual(1);
  });
});

describe("G. designation rows written by overlapping callers", () => {
  it("6 simultaneous createMissing calls for the same relationship leave exactly one row", async () => {
    const e = { id: "DC-X-C1", donationId: "X", causeId: "C1", causeTitle: "Cause C1", designatedAmount: 100, designationStatus: "designated" as const, provenance: "donor_selected" as const, createdAt: "", updatedAt: "", updatedBy: "donor" };
    await Promise.all(Array.from({ length: 6 }, () => donationCauseRepository.createMissing([e])));
    expect(fakeSheets.records("Donation_Causes").filter((r: any) => r.id === "DC-X-C1")).toHaveLength(1);
  });
});
