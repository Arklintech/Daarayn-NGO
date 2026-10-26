import { BaseRepository } from "./baseRepository";
import { sheetsService } from "../google/sheets";

/**
 * Donation_Causes: one row per (donation, cause) relationship. This is the canonical link between ONE donation
 * and the causes it supports. It is a relationship table, never a count of donations.
 *
 * Money rules:
 *  - exactly one cause selected  -> "designated", amount = the donation amount (the donor named the only cause);
 *  - several causes, no split    -> "unresolved", amount blank. Nothing is invented and the full donation is never
 *                                   reported against each cause. An authorised admin records the split later;
 *  - "general" (no cause chosen) -> no row: the donation is unrestricted.
 * A cause SELECTION is not an allocation: allocations are separate records (Allocations tab).
 */
export type DesignationStatus = "designated" | "unresolved";
export type DesignationProvenance = "donor_selected" | "admin";

export interface DonationCauseEntity {
  /** Deterministic: DC-<donationId>-<causeId>, so writing the same relationship twice cannot duplicate it. */
  id: string;
  donationId: string;
  causeId: string;
  causeTitle: string;
  designatedAmount: number | null;
  designationStatus: DesignationStatus;
  provenance: DesignationProvenance;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

const HEADERS = [
  "id", "donationId", "causeId", "causeTitle", "designatedAmount", "designationStatus", "provenance", "createdAt", "updatedAt", "updatedBy",
];

export const designationId = (donationId: string, causeId: string) => `DC-${donationId}-${causeId}`;

/** Relationship rows implied by a donor's selection (pure). */
export function designationsForSelection(
  donation: { id: string; amount: number },
  selection: { causeId: string; causeTitle: string }[],
  now: string
): DonationCauseEntity[] {
  const single = selection.length === 1;
  return selection.map((s) => ({
    id: designationId(donation.id, s.causeId),
    donationId: donation.id,
    causeId: s.causeId,
    causeTitle: s.causeTitle,
    designatedAmount: single ? donation.amount : null,
    designationStatus: single ? ("designated" as const) : ("unresolved" as const),
    provenance: "donor_selected" as const,
    createdAt: now,
    updatedAt: now,
    updatedBy: "donor",
  }));
}

export class DonationCauseRepository extends BaseRepository<DonationCauseEntity> {
  constructor() {
    super("Donation_Causes", HEADERS);
  }

  protected mapRowToEntity(row: Record<string, any>): DonationCauseEntity {
    const amount = String(row.designatedAmount ?? "").trim();
    return {
      id: String(row.id || ""),
      donationId: String(row.donationId || ""),
      causeId: String(row.causeId || ""),
      causeTitle: String(row.causeTitle || ""),
      designatedAmount: amount === "" ? null : Number(amount),
      designationStatus: (row.designationStatus === "designated" ? "designated" : "unresolved") as DesignationStatus,
      provenance: (row.provenance === "admin" ? "admin" : "donor_selected") as DesignationProvenance,
      createdAt: String(row.createdAt || ""),
      updatedAt: String(row.updatedAt || ""),
      updatedBy: String(row.updatedBy || ""),
    };
  }

  protected mapEntityToRow(e: DonationCauseEntity): Record<string, any> {
    return { ...e, designatedAmount: e.designatedAmount === null ? "" : e.designatedAmount };
  }

  /**
   * Writes only the relationships that are not already stored (one read, at most one write). Safe to call again after
   * an interruption: existing rows are never duplicated or overwritten.
   */
  public async createMissing(entities: DonationCauseEntity[]): Promise<number> {
    if (entities.length === 0) return 0;
    await this.init();
    const { rows } = await sheetsService.getRowsWithNumbers(this.sheetName);
    const have = new Set(rows.map((r) => String(r.record.id)));
    const fresh = entities.filter((e) => !have.has(e.id));
    if (fresh.length === 0) return 0;
    await sheetsService.appendRows(this.sheetName, fresh.map((e) => this.mapEntityToRow(e)), this.headers);
    this.invalidateCache();
    return fresh.length;
  }

  /** Overwrites existing relationship rows in one request (used when an admin records the split). */
  public async rewrite(rows: { rowNumber: number; entity: DonationCauseEntity }[]): Promise<void> {
    await sheetsService.updateRowsAt(this.sheetName, rows.map((r) => ({ rowNumber: r.rowNumber, record: this.mapEntityToRow(r.entity) })));
    this.invalidateCache();
  }

  public async readFreshWithRows(): Promise<{ entity: DonationCauseEntity; rowNumber: number }[]> {
    await this.init();
    const { rows } = await sheetsService.getRowsWithNumbers(this.sheetName);
    return rows.map((r) => ({ entity: this.mapRowToEntity(r.record), rowNumber: r.rowNumber }));
  }
}

export const donationCauseRepository = new DonationCauseRepository();
