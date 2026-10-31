import { BaseRepository } from "./baseRepository";
import { Donation } from "../db";
import { sheetsService, SheetRow } from "../google/sheets";
import { canonicalStatus, DonationStatus } from "../donations/metrics";

/** Fields the donation request itself owns after the row is created (follow-up state and e-mail outcome); everything else belongs to whoever changed it last. */
const OPERATIONAL_FIELDS = ["opStatus", "opPending", "confirmationEmailSent", "confirmationEmailSentAt", "confirmationEmailError", "confirmationEmailRetryCount"] as const;

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
  "causeSelection",
  "opStatus",
  "opPending",
];

/** A write the caller should report as a 4xx rather than a server fault. */
export class DonationWriteError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: 404 | 409,
    public readonly code: "NOT_FOUND" | "AMBIGUOUS_ID" | "STATUS_CHANGED" | "IN_PROGRESS",
    public readonly currentStatus?: string
  ) {
    super(message);
  }
}

/** A PENDING placeholder older than this belongs to a request that died, and is completed by the retry. */
const PENDING_ADOPT_AFTER_MS = 20_000;

const MAX_ID_ATTEMPTS = 30;

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
      selection: (() => {
        try {
          const v = JSON.parse(String(row.causeSelection || "[]"));
          return Array.isArray(v) ? v.map((x: any) => ({ causeId: String(x.causeId || ""), causeName: String(x.causeName || "") })) : [];
        } catch {
          return [];
        }
      })(),
      opStatus: (["pending", "partial", "complete"].includes(String(row.opStatus)) ? String(row.opStatus) : "") as any,
      opPending: String(row.opPending || ""),
      submissionRef: row.submissionRef ? String(row.submissionRef) : undefined,
    };
  }

  /**
   * A stale queue finaliser can briefly leave a second copy of a donation row. A row is a COPY only when an EARLIER row has the same donation id AND the same non-empty
   * submission reference; the copy is not read, so no total, report, donor history or allocation can count it twice. Rows without that proof (a duplicate id from
   * the direct path, a manual edit, two submissions sharing an id) are all kept, so the integrity checks still see every real conflict.
   */
  protected canonical(entities: Donation[]): Donation[] {
    const seen = new Set<string>();
    return entities.filter((d) => {
      if (!d.submissionRef) return true;
      const key = `${d.id}|${d.submissionRef}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
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
      causeSelection: JSON.stringify(donation.selection || []),
      opStatus: donation.opStatus || "",
      opPending: donation.opPending || "",
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
  /** A FINISHED donation (real DA### id) recorded under this submission key, or null. Always reads Sheets fresh. */
  public async findFinishedBySubmissionKey(submissionKey: string): Promise<Donation | null> {
    await this.init();
    const { rows } = await sheetsService.getRowsWithNumbers(this.sheetName);
    const hit = rows.find((r) => r.record.submissionKey === submissionKey && String(r.record.id) !== "PENDING");
    return hit ? this.mapRowToEntity(hit.record) : null;
  }

  public async createWithUniqueId(
    build: (id: string) => Donation,
    submissionKey: string
  ): Promise<{ donation: Donation; duplicate: boolean; rowNumber: number }> {
    await this.init();
    let { rows } = await sheetsService.getRowsWithNumbers(this.sheetName);

    // A row with this submissionKey already exists: this is a retry or a double-click.
    //  - finished row (real DA### id): return it, nothing new is written;
    //  - unfinished placeholder (id "PENDING"): a previous attempt died part-way. If it is recent another request
    //    may still be finishing it, so ask the caller to retry shortly; if it is stale, ADOPT the row and finish
    //    it, instead of leaving an orphan and creating a second row.
    const prior = rows.find((r) => r.record.submissionKey === submissionKey);
    let adoptedRow = 0;
    if (prior) {
      if (String(prior.record.id) !== "PENDING") {
        return { donation: this.mapRowToEntity(prior.record), duplicate: true, rowNumber: prior.rowNumber };
      }
      const age = Date.now() - new Date(String(prior.record.date)).getTime();
      if (age < PENDING_ADOPT_AFTER_MS) {
        // Another request is finishing this very submission: wait briefly for it so that the caller gets the SAME answer, not an error.
        for (let wait = 0; wait < 8; wait++) {
          await new Promise((r) => setTimeout(r, 150 + wait * 100));
          const { rows: now } = await sheetsService.getRowsWithNumbers(this.sheetName);
          const done = now.find((r) => r.rowNumber === prior.rowNumber);
          if (done && String(done.record.id) !== "PENDING") return { donation: this.mapRowToEntity(done.record), duplicate: true, rowNumber: done.rowNumber };
        }
        throw new DonationWriteError("This submission is still being processed. Please retry in a few seconds.", 409, "IN_PROGRESS");
      }
      adoptedRow = prior.rowNumber;
    }

    const claimNote = `claim:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
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
      // Unique marker: the row number Sheets reports for an append is NOT reliable when appends overlap (observed live: several
      // concurrent appends reported the same row), so this request finds its own row by this marker in the read below.
      notes: claimNote,
      submissionKey,
    };
    let myRow = adoptedRow;
    if (!adoptedRow) await sheetsService.appendRow(this.sheetName, blankRow, DONATION_HEADERS);

    // 2. Re-read and calculate the collision-free ID based on final row position.
    for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt++) {
      ({ rows } = await sheetsService.getRowsWithNumbers(this.sheetName));
      if (!myRow) {
        let found = rows.find((r) => r.record.notes === claimNote && r.record.submissionKey === submissionKey);
        for (let wait = 0; !found && wait < 3; wait++) {
          await new Promise((r) => setTimeout(r, 200 * (wait + 1)));
          ({ rows } = await sheetsService.getRowsWithNumbers(this.sheetName));
          found = rows.find((r) => r.record.notes === claimNote && r.record.submissionKey === submissionKey);
        }
        if (!found) throw new DonationWriteError("The submission was written but its row could not be located; it will be completed or adopted on retry. Please retry in a minute.", 409, "IN_PROGRESS");
        myRow = found.rowNumber;
      }
      const earlier = rows.filter((r) => r.rowNumber < myRow);

      // Check if another submission with the same submissionKey got in first.
      const sameSubmission = earlier.find((r) => r.record.submissionKey === submissionKey);
      if (sameSubmission) {
        if (!adoptedRow) {
          await sheetsService.clearRowAt(this.sheetName, myRow);
          this.invalidateCache();
        }
        // The winner may still be finalizing its row. Never hand back an unfinished placeholder as "the donation".
        for (let wait = 0; wait < 8; wait++) {
          const { rows: now } = await sheetsService.getRowsWithNumbers(this.sheetName);
          const winner = now.find((r) => r.rowNumber === sameSubmission.rowNumber);
          if (winner && String(winner.record.id) !== "PENDING") {
            return { donation: this.mapRowToEntity(winner.record), duplicate: true, rowNumber: winner.rowNumber };
          }
          await new Promise((r) => setTimeout(r, 150 + wait * 100));
        }
        throw new DonationWriteError("This submission is still being processed. Please retry in a few seconds.", 409, "IN_PROGRESS");
      }

      // Calculate the ID from the rows above ours: the highest finalized DA### plus one, plus one
      // more for every recent row above us that is still being finalized (id "PENDING"). Every
      // concurrent request applies the same rule, so ids line up with row order instead of
      // colliding. Stale PENDING rows (a request that died) are ignored after two minutes.
      const highest = rows.reduce((max, r) => {
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
        return { donation, duplicate: false, rowNumber: myRow };
      }

      console.warn(`[DonationRepository] ID collision on attempt ${attempt + 1} for ${finalId}, retrying...`);
      await new Promise((r) => setTimeout(r, 10 + Math.random() * Math.min(400, 40 * (attempt + 1))));
    }

    throw new Error(`Could not allocate a unique donation id (row ${myRow}); retry the submission.`);
  }

  /**
   * Rewrites the donation at the row createWithUniqueId just returned (no extra read). Rows are never deleted
   * or shifted, so the position is stable for the life of the request.
   */
  public async saveAtRow(rowNumber: number, donation: Donation, submissionKey: string): Promise<void> {
    // The row is re-read and ONLY the operational fields this request owns are written. Rewriting the whole row from the in-memory donation
    // would silently undo a decision an admin made while the follow-up steps were running (D35: a verification reverted to "pending").
    const { rows } = await sheetsService.getRowsWithNumbers(this.sheetName);
    const current = rows.find((r) => r.rowNumber === rowNumber && String(r.record.id) === donation.id);
    if (!current) throw new DonationWriteError(`Donation ${donation.id} is no longer at row ${rowNumber}.`, 404, "NOT_FOUND");
    const mine = this.mapEntityToRow(donation);
    const owned = Object.fromEntries(OPERATIONAL_FIELDS.map((k) => [k, mine[k]]));
    await sheetsService.updateRowAt(this.sheetName, rowNumber, { ...current.record, ...owned, submissionKey });
    this.invalidateCache();
  }

  /** Records the follow-up state of a donation (used by recovery). Reads the row fresh and refuses ambiguous ids. */
  public async setOperationState(id: string, status: "pending" | "partial" | "complete", pending: string): Promise<void> {
    const match = await this.findSingleRow(id);
    await sheetsService.updateRowAt(this.sheetName, match.rowNumber, { ...match.record, opStatus: status, opPending: pending });
    this.invalidateCache();
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
