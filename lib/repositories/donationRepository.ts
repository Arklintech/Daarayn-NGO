import { BaseRepository } from "./baseRepository";
import { Donation } from "../db";
import { sheetsService, SheetRow } from "../google/sheets";
import { canonicalStatus, DonationStatus } from "../donations/metrics";

const DONATION_HEADERS = [
  "id",
  "donorId",
  "donorName",
  "donorEmail",
  "amount",
  "currency",
  "date",
  "status",
  "paymentMethod",
  "causeId",
  "causeTitle",
  "proofDriveFileId",
  "transactionReference",
  "notes",
  "submissionKey",
  "confirmationEmailSent",
  "confirmationEmailSentAt",
  "confirmationEmailError",
  "confirmationEmailRetryCount",
];

/** A write the caller should report as a 4xx rather than a server fault. */
export class DonationWriteError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: 404 | 409,
    public readonly code: "NOT_FOUND" | "AMBIGUOUS_ID" | "STATUS_CHANGED",
    public readonly currentStatus?: string
  ) {
    super(message);
  }
}

const MAX_ID_ATTEMPTS = 12;

function nextDonationId(rows: SheetRow[]): string {
  const highest = rows.reduce((max, r) => {
    const match = /^DA(\d+)$/.exec(String(r.record.id || ""));
    return match ? Math.max(max, parseInt(match[1], 10)) : max;
  }, 0);
  return "DA" + String(highest + 1).padStart(3, "0");
}

export class DonationRepository extends BaseRepository<Donation> {
  constructor() {
    super("Donations", DONATION_HEADERS);
  }

  protected mapRowToEntity(row: Record<string, any>): Donation {
    return {
      id: String(row.id || row.ID || ""),
      donorId: String(row.donorId || ""),
      donorName: String(row.donorName || ""),
      donorEmail: String(row.donorEmail || ""),
      amount: Number(row.amount || 0),
      currency: String(row.currency || "INR"),
      date: String(row.date || new Date().toISOString()),
      status: (row.status || "Completed") as any,
      paymentMethod: String(row.paymentMethod || "Bank Transfer"),
      donationType: String(row.donationType || row.causeTitle || "General"),
      causeId: String(row.causeId || ""),
      causeTitle: String(row.causeTitle || ""),
      proofDriveFileId: String(row.proofDriveFileId || ""),
      transactionReference: String(row.transactionReference || ""),
      notes: String(row.notes || ""),
      selectedCauses: [],
      confirmationEmailSent: String(row.confirmationEmailSent).toLowerCase() === "true",
      confirmationEmailSentAt: row.confirmationEmailSentAt ? String(row.confirmationEmailSentAt) : undefined,
      confirmationEmailError: row.confirmationEmailError ? String(row.confirmationEmailError) : undefined,
      confirmationEmailRetryCount: Number(row.confirmationEmailRetryCount || 0),
    };
  }

  protected mapEntityToRow(donation: Donation): Record<string, any> {
    return {
      id: donation.id,
      donorId: donation.donorId,
      donorName: donation.donorName,
      donorEmail: donation.donorEmail,
      amount: donation.amount,
      currency: donation.currency,
      date: donation.date,
      status: donation.status,
      paymentMethod: donation.paymentMethod,
      causeId: donation.causeId || "",
      causeTitle: donation.causeTitle || "",
      proofDriveFileId: (donation as any).proofDriveFileId || (donation as any).receiptUrl || "",
      transactionReference: donation.transactionReference || "",
      notes: donation.notes || "",
      confirmationEmailSent: Boolean(donation.confirmationEmailSent),
      confirmationEmailSentAt: donation.confirmationEmailSentAt || "",
      confirmationEmailError: donation.confirmationEmailError || "",
      confirmationEmailRetryCount: donation.confirmationEmailRetryCount || 0,
    };
  }

  public async getByDonorId(donorId: string): Promise<Donation[]> {
    const all = await this.getAll();
    return all.filter((d) => d.donorId === donorId);
  }

  /**
   * Persists a new donation under a unique DA### id and returns it once the
   * row is confirmed in the sheet.
   *
   * Race condition fix: appending a blank row first locks the position in the
   * append queue, preventing two concurrent requests from calculating the same
   * ID. Once myRow is locked, we calculate the final ID based on how many rows
   * came before it in the final sheet state. This ensures every concurrent
   * submission gets a unique position and unique ID.
   *
   * `submissionKey` identifies one donor submission. If a row with the same
   * key already exists (a retry, or a double-clicked submit) no new row is
   * kept and the existing donation is returned with `duplicate: true`.
   */
  public async createWithUniqueId(
    build: (id: string) => Donation,
    submissionKey: string
  ): Promise<{ donation: Donation; duplicate: boolean }> {
    await this.init();
    let { rows } = await sheetsService.getRowsWithNumbers(this.sheetName);

    const prior = rows.find((r) => r.record.submissionKey === submissionKey);
    if (prior) return { donation: this.mapRowToEntity(prior.record), duplicate: true };

    // 1. Append a blank row to lock position in the append queue.
    //    Once appended, this row's position is immutable; no later appends
    //    can move it or change how many rows came before it.
    const blankRow = {
      id: "PENDING",
      donorId: "",
      donorName: "",
      donorEmail: "",
      amount: 0,
      currency: "INR",
      date: new Date().toISOString(),
      status: "pending",
      paymentMethod: "UPI",
      causeId: "",
      causeTitle: "",
      proofDriveFileId: "",
      transactionReference: "",
      notes: "",
      submissionKey,
    };
    const myRow = await sheetsService.appendRow(this.sheetName, blankRow, DONATION_HEADERS);

    // 2. Re-read and calculate the collision-free ID based on final row position.
    for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt++) {
      ({ rows } = await sheetsService.getRowsWithNumbers(this.sheetName));
      const earlier = rows.filter((r) => r.rowNumber < myRow);

      // Check if another submission with the same submissionKey got in first.
      const sameSubmission = earlier.find((r) => r.record.submissionKey === submissionKey);
      if (sameSubmission) {
        await sheetsService.clearRowAt(this.sheetName, myRow);
        this.invalidateCache();
        return { donation: this.mapRowToEntity(sameSubmission.record), duplicate: true };
      }

      // Calculate the ID from the rows above ours: the highest finalized DA### plus one, plus one
      // more for every recent row above us that is still being finalized (id "PENDING"). Every
      // concurrent request applies the same rule, so ids line up with row order instead of
      // colliding. Stale PENDING rows (a request that died) are ignored after two minutes.
      const highest = earlier.reduce((max, r) => {
        const match = /^DA(\d+)$/.exec(String(r.record.id || ""));
        return match ? Math.max(max, parseInt(match[1], 10)) : max;
      }, 0);
      const inFlight = earlier.filter(
        (r) => String(r.record.id) === "PENDING" && Date.now() - new Date(String(r.record.date)).getTime() < 120_000
      ).length;
      const finalId = "DA" + String(highest + 1 + inFlight).padStart(3, "0");

      const donation = build(finalId);
      const toRow = (d: Donation) => ({ ...this.mapEntityToRow(d), submissionKey });
      await sheetsService.updateRowAt(this.sheetName, myRow, toRow(donation));

      // Verify uniqueness: only myRow should have finalId.
      ({ rows } = await sheetsService.getRowsWithNumbers(this.sheetName));
      const sameIdCount = rows.filter((r) => String(r.record.id) === finalId).length;
      if (sameIdCount === 1) {
        this.invalidateCache();
        return { donation, duplicate: false };
      }

      console.warn(`[DonationRepository] ID collision on attempt ${attempt + 1} for ${finalId}, retrying...`);
      await new Promise((r) => setTimeout(r, 20 + Math.random() * 60 * (attempt + 1)));
    }

    throw new Error(`Could not allocate a unique donation id (row ${myRow}); retry the submission.`);
  }

  /** Reads the donation fresh from the sheet; refuses ids held by more than one row. */
  private async findSingleRow(id: string): Promise<SheetRow> {
    await this.init();
    const { rows } = await sheetsService.getRowsWithNumbers(this.sheetName);
    const matches = rows.filter((r) => String(r.record.id) === id);
    if (matches.length === 0) {
      throw new DonationWriteError(`Donation ${id} was not found.`, 404, "NOT_FOUND");
    }
    if (matches.length > 1) {
      throw new DonationWriteError(
        `${matches.length} donation rows share the id ${id} (sheet rows ${matches.map((m) => m.rowNumber).join(", ")}). Resolve the duplicate in the Donations sheet before changing it.`,
        409,
        "AMBIGUOUS_ID"
      );
    }
    return matches[0];
  }

  /**
   * Changes a donation's status. When `expectedStatus` is given the write is
   * refused if someone else has changed the status since the caller loaded it.
   */
  public async updateStatus(
    id: string,
    nextStatus: DonationStatus,
    expectedStatus?: string
  ): Promise<{ before: Donation; after: Donation; changed: boolean }> {
    const match = await this.findSingleRow(id);
    const before = this.mapRowToEntity(match.record);
    const current = canonicalStatus(before.status);

    if (expectedStatus && canonicalStatus(expectedStatus) !== current) {
      throw new DonationWriteError(
        `Donation ${id} is now "${current}", not "${canonicalStatus(expectedStatus)}". Reload and try again.`,
        409,
        "STATUS_CHANGED",
        current
      );
    }
    if (current === nextStatus) return { before, after: before, changed: false };

    await sheetsService.updateRowAt(this.sheetName, match.rowNumber, { ...match.record, status: nextStatus });
    this.invalidateCache();
    return { before, after: { ...before, status: nextStatus }, changed: true };
  }

  /**
   * Partial updates must target an existing, unambiguous row. This used to
   * fabricate a ₹0 "Generous Donor" record when the id was unknown.
   */
  public async update(id: string, partial: Partial<Donation>): Promise<Donation | null> {
    let match: SheetRow;
    try {
      match = await this.findSingleRow(id);
    } catch (err) {
      if (err instanceof DonationWriteError && err.code === "NOT_FOUND") return null;
      throw err;
    }
    const existing = this.mapRowToEntity(match.record);
    const updated: Donation = { ...existing, ...partial, id: existing.id };
    await sheetsService.updateRowAt(this.sheetName, match.rowNumber, { ...match.record, ...this.mapEntityToRow(updated) });
    this.invalidateCache();
    return updated;
  }
}

export const donationRepository = new DonationRepository();
