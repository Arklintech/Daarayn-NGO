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

const MAX_ID_ATTEMPTS = 6;

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
   * Reading the highest id and then appending is not safe on its own: two
   * submissions can read the same maximum (this is how two DA006 rows came
   * to exist). So the row is appended first, then re-read: Sheets applies
   * appends one at a time, so row order decides — the earliest row holding
   * an id keeps it and any later row moves to the next free id.
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

    let donation = build(nextDonationId(rows));
    const toRow = (d: Donation) => ({ ...this.mapEntityToRow(d), submissionKey });
    const myRow = await sheetsService.appendRow(this.sheetName, toRow(donation), DONATION_HEADERS);

    for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt++) {
      ({ rows } = await sheetsService.getRowsWithNumbers(this.sheetName));
      const earlier = rows.filter((r) => r.rowNumber < myRow);

      const sameSubmission = earlier.find((r) => r.record.submissionKey === submissionKey);
      if (sameSubmission) {
        await sheetsService.clearRowAt(this.sheetName, myRow);
        this.invalidateCache();
        return { donation: this.mapRowToEntity(sameSubmission.record), duplicate: true };
      }

      if (!earlier.some((r) => String(r.record.id) === donation.id)) {
        this.invalidateCache();
        return { donation, duplicate: false };
      }

      donation = build(nextDonationId(rows));
      await sheetsService.updateRowAt(this.sheetName, myRow, toRow(donation));
    }

    throw new Error(`Could not allocate a unique donation id (row ${myRow} kept id ${donation.id}); retry the submission.`);
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
