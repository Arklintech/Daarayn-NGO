import { BaseRepository } from "./baseRepository";
import { sheetsService } from "../google/sheets";

/**
 * One row per recipient per broadcast. This is the communication history the
 * recipient resolver consults, so "already sent", "in progress" and "failed"
 * are decided per donor, per communication type and cause scope — never by one
 * global flag.
 *
 * Status meanings (SMTP acceptance is NOT inbox delivery):
 *   queued        — selected and approved, nothing attempted yet
 *   attempted     — a send is in progress or was interrupted before an outcome
 *   smtp_accepted — the mail server accepted the message
 *   failed        — rejected or errored; `lastError` says why
 *   unresolved    — the connection broke AFTER the message body was sent, so the server may or may not have accepted it.
 *                   It is never resent automatically (that could deliver a duplicate); an admin decides.
 */
export type RecipientStatus = "queued" | "attempted" | "smtp_accepted" | "failed" | "unresolved";

export interface CommunicationRecipientEntity {
  id: string; // `${broadcastId}:${donorId}`
  broadcastId: string;
  communicationType: string;
  scopeKey: string; // sorted cause ids joined with "|"
  donorId: string; // permanent Donor Token
  donorName: string;
  email: string;
  donationIds: string; // comma separated Donation IDs that made the donor eligible
  status: RecipientStatus;
  attempts: number;
  lastError: string;
  providerMessageId: string;
  /** Why the donor was eligible: JSON {causeIds, donationIds}. */
  eligibility: string;
  /** Admin who approved the send and the hash of the approved content. */
  approvedBy: string;
  contentHash: string;
  createdAt: string;
  updatedAt: string;
}

const HEADERS = [
  "id", "broadcastId", "communicationType", "scopeKey", "donorId", "donorName", "email",
  "donationIds", "status", "attempts", "lastError", "providerMessageId", "eligibility", "approvedBy", "contentHash", "createdAt", "updatedAt",
];

export class CommunicationRecipientRepository extends BaseRepository<CommunicationRecipientEntity> {
  constructor() {
    super("Communication_Recipients", HEADERS);
  }

  protected mapRowToEntity(row: Record<string, any>): CommunicationRecipientEntity {
    return {
      id: String(row.id || ""),
      broadcastId: String(row.broadcastId || ""),
      communicationType: String(row.communicationType || ""),
      scopeKey: String(row.scopeKey || ""),
      donorId: String(row.donorId || ""),
      donorName: String(row.donorName || ""),
      email: String(row.email || ""),
      donationIds: String(row.donationIds || ""),
      status: (row.status || "queued") as RecipientStatus,
      attempts: Number(row.attempts || 0),
      lastError: String(row.lastError || ""),
      providerMessageId: String(row.providerMessageId || ""),
      eligibility: String(row.eligibility || ""),
      approvedBy: String(row.approvedBy || ""),
      contentHash: String(row.contentHash || ""),
      createdAt: String(row.createdAt || ""),
      updatedAt: String(row.updatedAt || ""),
    };
  }

  protected mapEntityToRow(e: CommunicationRecipientEntity): Record<string, any> {
    return { ...e };
  }

  /** Always reads fresh: history decides who may be emailed, so a stale cache is not acceptable. */
  public async readFresh(): Promise<{ entity: CommunicationRecipientEntity; rowNumber: number }[]> {
    await this.init();
    const { rows } = await sheetsService.getRowsWithNumbers(this.sheetName);
    return rows.map((r) => ({ entity: this.mapRowToEntity(r.record), rowNumber: r.rowNumber }));
  }

  /** Writes the queued rows in one request; returns each row with its sheet row number. */
  public async createQueued(entities: CommunicationRecipientEntity[]): Promise<{ entity: CommunicationRecipientEntity; rowNumber: number }[]> {
    if (entities.length === 0) return [];
    await this.init();
    const first = await sheetsService.appendRows(this.sheetName, entities.map((e) => this.mapEntityToRow(e)), this.headers);
    this.invalidateCache();
    return entities.map((entity, i) => ({ entity, rowNumber: first + i }));
  }

  public async writeOutcomes(rows: { entity: CommunicationRecipientEntity; rowNumber: number }[]): Promise<void> {
    await sheetsService.updateRowsAt(
      this.sheetName,
      rows.map((r) => ({ rowNumber: r.rowNumber, record: this.mapEntityToRow(r.entity) }))
    );
    this.invalidateCache();
  }
}

export const communicationRecipientRepository = new CommunicationRecipientRepository();
