import { describe, it, expect, beforeEach } from "vitest";
import { fakeSheets } from "./helpers/fakeSheets";
import { resetWorld, driveMock, mailMock } from "./helpers/mocks";
import { donorRepository, DonorRepository } from "@/lib/repositories/donorRepository";
import { donationRepository } from "@/lib/repositories/donationRepository";
import { donationService, DonationInputError } from "@/lib/services/donationService";
import { normalizePhone, normalizeEmail } from "@/lib/donors/normalize";
import { summarizeDonations, donationsForDonor } from "@/lib/donations/metrics";

const TOKEN = /^DNR-[0-9A-Z]+-[0-9A-Z]{4}$/;
const profile = (name: string, contact: string) => (id: string) => ({
  id, name, email: contact.includes("@") ? contact : "", phone: contact.includes("@") ? "" : contact,
  country: "India", city: "", donationPreference: "General", communicationPreference: "Email",
  dateJoined: new Date().toISOString(), totalDonations: 0, totalAmountDonated: 0, projectsSupportedCount: 0,
  casesSupportedCount: 0, donationHistory: [], projectsSupported: [], casesSupported: [], status: "active" as const,
});
const donate = (over: Record<string, any> = {}) =>
  donationService.processDonation({
    donorName: "Test Donor", donorContact: "asha@example.org", amount: 500, cause: "Clean Water",
    upiRef: "UTR123", screenshotBuffer: Buffer.from("png"), screenshotFilename: "p.png", screenshotMimeType: "image/png", ...over,
  });

beforeEach(resetWorld);

describe("normalisation", () => {
  it("treats formatting variants of one phone as the same phone, and never matches names", () => {
    expect(normalizePhone("+91 98765-43210")).toBe("9876543210");
    expect(normalizePhone("09876543210")).toBe("9876543210");
    expect(normalizePhone("9876543210")).toBe("9876543210");
    expect(normalizePhone("123")).toBe("");
    expect(normalizeEmail("  Asha@Example.ORG ")).toBe("asha@example.org");
    expect(normalizeEmail("not-an-email")).toBe("");
  });
});

describe("Donor Token Numbers (scenarios 1-5)", () => {
  it("1. a new donor receives a unique permanent token in the existing DNR- format", async () => {
    const { donor, created } = await donorRepository.findOrCreateByContact("asha@example.org", profile("Asha", "asha@example.org"));
    expect(created).toBe(true);
    expect(donor.id).toMatch(TOKEN);
    expect(fakeSheets.records("Donors")).toHaveLength(1);
  });

  it("2. repeated registration (case/spacing/phone-format variants) returns the same donor and creates no duplicate", async () => {
    const a = await donorRepository.findOrCreateByContact("asha@example.org", profile("Asha", "asha@example.org"));
    const b = await donorRepository.findOrCreateByContact("  ASHA@Example.org ", profile("Asha K", "asha@example.org"));
    expect(b.created).toBe(false);
    expect(b.donor.id).toBe(a.donor.id);
    const p1 = await donorRepository.findOrCreateByContact("+91 98765-43210", profile("Ravi", "9876543210"));
    const p2 = await donorRepository.findOrCreateByContact("09876543210", profile("Ravi", "9876543210"));
    expect(p2.donor.id).toBe(p1.donor.id);
    expect(fakeSheets.records("Donors")).toHaveLength(2);
  });

  it("2b. the same name with different contacts is NOT merged", async () => {
    const a = await donorRepository.findOrCreateByContact("a@example.org", profile("Mohammed Khan", "a@example.org"));
    const b = await donorRepository.findOrCreateByContact("b@example.org", profile("Mohammed Khan", "b@example.org"));
    expect(a.donor.id).not.toBe(b.donor.id);
  });

  it("3. concurrent registrations of the SAME person in one process create exactly one donor", async () => {
    const results = await Promise.all(
      Array.from({ length: 25 }, () => donorRepository.findOrCreateByContact("same@example.org", profile("Same", "same@example.org")))
    );
    expect(new Set(results.map((r) => r.donor.id)).size).toBe(1);
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(fakeSheets.records("Donors")).toHaveLength(1);
  });

  it("3b. concurrent registrations on SEPARATE instances (no shared lock) still converge on one donor", async () => {
    const instances = Array.from({ length: 8 }, () => new DonorRepository());
    const keys = { email: "race@example.org", phone: "" };
    const results = await Promise.all(
      instances.map((r) => (r as any).createOrFind(keys, profile("Race", "race@example.org")))
    );
    expect(new Set(results.map((r: any) => r.donor.id)).size).toBe(1);
    expect(fakeSheets.records("Donors").filter((d) => d.email === "race@example.org")).toHaveLength(1);
  });

  it("3c. concurrent registrations of DIFFERENT people never share a token", async () => {
    const results = await Promise.all(
      Array.from({ length: 40 }, (_, i) => donorRepository.findOrCreateByContact(`p${i}@example.org`, profile(`P${i}`, `p${i}@example.org`)))
    );
    const ids = results.map((r) => r.donor.id);
    expect(new Set(ids).size).toBe(40);
    expect(fakeSheets.records("Donors").map((d) => d.id).sort()).toEqual([...ids].sort());
  });

  it("failed Sheets write is not reported as a registration", async () => {
    fakeSheets.failWrites = true;
    await expect(donorRepository.findOrCreateByContact("x@example.org", profile("X", "x@example.org"))).rejects.toThrow(/Simulated/);
    fakeSheets.failWrites = false;
    expect(fakeSheets.records("Donors")).toHaveLength(0);
  });

  it("rejects a contact that is neither an email nor a phone number", async () => {
    await expect(donorRepository.findOrCreateByContact("no contact", profile("N", "n"))).rejects.toThrow(/valid email/);
  });
});

describe("Donations (scenarios 4-7)", () => {
  it("4+5. one donor, several donations: same token, distinct Donation IDs, all pending until verified", async () => {
    const r1 = await donate({ amount: 100 });
    const r2 = await donate({ amount: 200, submissionKey: "k2" });
    const r3 = await donate({ amount: 300, submissionKey: "k3", donorContact: " ASHA@example.org" });
    expect(new Set([r1.donorId, r2.donorId, r3.donorId]).size).toBe(1);
    expect(r1.donorId).toMatch(TOKEN);
    expect(new Set([r1.donationId, r2.donationId, r3.donationId]).size).toBe(3);
    const rows = fakeSheets.records("Donations");
    expect(rows).toHaveLength(3);
    expect(rows.every((d) => d.status === "pending" && d.donorId === r1.donorId)).toBe(true);
    expect(fakeSheets.records("Donors")).toHaveLength(1);
  });

  it("5b. concurrent donations by different donors all persist with distinct IDs", async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) => donate({ donorContact: `d${i}@example.org`, submissionKey: `ck${i}`, amount: 10 + i }))
    );
    expect(new Set(results.map((r) => r.donationId)).size).toBe(12);
    expect(fakeSheets.records("Donations").map((d) => d.id).sort()).toEqual(results.map((r) => r.donationId).sort());
  });

  it("a retry of the same submission does not create a second donation or donor", async () => {
    const a = await donate({ submissionKey: "same-key" });
    const b = await donate({ submissionKey: "same-key" });
    expect(b.duplicate).toBe(true);
    expect(b.donationId).toBe(a.donationId);
    expect(fakeSheets.records("Donations")).toHaveLength(1);
    expect(fakeSheets.records("Donors")).toHaveLength(1);
  });

  it("6. a public donation persists with donor, amount, cause, reference and Drive evidence", async () => {
    const r = await donate({ amount: 750, cause: "Orphan Care", upiRef: "UTR-9" });
    expect(r.success).toBe(true);
    const row = fakeSheets.records("Donations")[0];
    expect(row).toMatchObject({ id: r.donationId, donorId: r.donorId, amount: "750", causeTitle: "Orphan Care", transactionReference: "UTR-9", proofDriveFileId: "DRIVEPROOF_000001", status: "pending" });
    expect(driveMock.uploadFile).toHaveBeenCalledTimes(1);
  });

  it("the confirmation email result is now persisted on the donation (was dropped before)", async () => {
    const r = await donate();
    const row = fakeSheets.records("Donations").find((d) => d.id === r.donationId)!;
    expect(row.confirmationEmailSent).toBe("true");
    expect(row.confirmationEmailRetryCount).toBe("1");
    mailMock.sendDonationEmail.mockResolvedValueOnce({ success: false, error: "550 rejected" } as any);
    const r2 = await donate({ donorContact: "other@example.org", submissionKey: "e2" });
    const row2 = fakeSheets.records("Donations").find((d) => d.id === r2.donationId)!;
    expect(row2.confirmationEmailSent).toBe("false");
    expect(row2.confirmationEmailError).toContain("550");
  });

  it("15. invalid submissions are rejected before anything is written", async () => {
    await expect(donate({ donorContact: "???" })).rejects.toBeInstanceOf(DonationInputError);
    await expect(donate({ amount: 0 })).rejects.toThrow(/amount/);
    expect(fakeSheets.records("Donations")).toHaveLength(0);
    expect(fakeSheets.records("Donors")).toHaveLength(0);
  });

  it("15b. a failed Sheets write is an error, never a success", async () => {
    fakeSheets.failWrites = true;
    await expect(donate()).rejects.toThrow();
    fakeSheets.failWrites = false;
    expect(fakeSheets.records("Donations")).toHaveLength(0);
  });

  it("7. admin verification persists and Dashboard figures / CRM history follow", async () => {
    const r = await donate({ amount: 1000 });
    await donate({ amount: 400, submissionKey: "b" });
    let all = await donationRepository.getAll(true);
    expect(summarizeDonations(all)).toMatchObject({ receivedAmount: 0, pendingAmount: 1400, pendingCount: 2 });

    const change = await donationRepository.updateStatus(r.donationId, "completed", "pending");
    expect(change.changed).toBe(true);
    expect(fakeSheets.records("Donations").find((d) => d.id === r.donationId)!.status).toBe("completed");

    all = await donationRepository.getAll(true);
    expect(summarizeDonations(all)).toMatchObject({ receivedAmount: 1000, receivedCount: 1, pendingAmount: 400, pendingCount: 1 });
    const donor = (await donorRepository.getAll(true))[0];
    expect(donationsForDonor(all, donor)).toHaveLength(2);
    // stale expectation is refused (conflict-safe)
    await expect(donationRepository.updateStatus(r.donationId, "rejected", "pending")).rejects.toThrow(/now "completed"/);
  });

  it("CRM relationship: an empty email never links unrelated phone-only donations", async () => {
    await donate({ donorContact: "9876543210", submissionKey: "p1" });
    await donate({ donorContact: "9123456789", submissionKey: "p2" });
    const donations = await donationRepository.getAll(true);
    const donors = await donorRepository.getAll(true);
    expect(donors).toHaveLength(2);
    for (const d of donors) expect(donationsForDonor(donations, d)).toHaveLength(1);
  });
});
