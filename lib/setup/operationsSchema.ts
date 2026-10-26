/**
 * lib/setup/operationsSchema.ts
 *
 * Explicit, repeatable, NON-DESTRUCTIVE setup for the unified operations model. It
 *   1. creates the new tabs (Donation_Causes, Communication_Recipients, Allocations) if missing;
 *   2. appends any missing columns to the existing tabs it touches (Donations, Donors, Causes, Allocations,
 *      Communications, Communication_Recipients) — it never renames, reorders, clears or deletes columns or rows;
 *   3. optionally backfills Donation_Causes for LEGACY donations from their stored single cause (full amount designated
 *      to that cause, provenance "legacy"), skipping donations that already have relationship rows or no valid cause.
 *      Legacy donations without a cause stay unrestricted. Nothing is invented for multi-cause history because it was
 *      never stored.
 * Default is a DRY RUN that reports what would change. Applying is an explicit second step. Run it first against the
 * designated TEST spreadsheet; the production procedure is documented in docs/OPERATIONS_DATA_MODEL.md and is not run
 * automatically.
 */
import { sheetsService } from "../google/sheets";
import { causeRepository } from "../repositories/causeRepository";
import { donationRepository } from "../repositories/donationRepository";
import { donorRepository } from "../repositories/donorRepository";
import { allocationRepository } from "../repositories/allocationRepository";
import { communicationRepository } from "../repositories/communicationRepository";
import { communicationRecipientRepository } from "../repositories/communicationRecipientRepository";
import { donationCauseRepository, designationId } from "../repositories/donationCauseRepository";
import type { DonationCauseEntity } from "../repositories/donationCauseRepository";
import { attributeDonation } from "../communication-resolver";
import { donationState } from "../donations/metrics";

const TABS = [
  { repo: donationRepository, name: "Donations" },
  { repo: donorRepository, name: "Donors" },
  { repo: causeRepository, name: "Causes" },
  { repo: allocationRepository, name: "Allocations" },
  { repo: communicationRepository, name: "Communications" },
  { repo: communicationRecipientRepository, name: "Communication_Recipients" },
  { repo: donationCauseRepository, name: "Donation_Causes" },
] as const;

export interface SetupReport {
  applied: boolean;
  tabsToCreate: string[];
  columnsToAdd: Record<string, string[]>;
  legacyDonationsToBackfill: number;
  backfilled: number;
}

export async function runOperationsSetup(options: { apply: boolean; backfill: boolean }): Promise<SetupReport> {
  const report: SetupReport = { applied: options.apply, tabsToCreate: [], columnsToAdd: {}, legacyDonationsToBackfill: 0, backfilled: 0 };

  // Plan: which tabs/columns are missing (read-only).
  for (const { repo, name } of TABS) {
    let existing: string[] = [];
    try {
      existing = await sheetsService.getHeaders(name);
    } catch {
      existing = [];
    }
    const expected: string[] = (repo as any).headers;
    if (existing.length === 0) report.tabsToCreate.push(name);
    else {
      const missing = expected.filter((h) => !existing.includes(h));
      if (missing.length) report.columnsToAdd[name] = missing;
    }
  }

  // Backfill plan
  let backfillRows: DonationCauseEntity[] = [];
  if (options.backfill) {
    // Read-only: raw rows, hydrated without repository.init(), so a dry run can never create a tab.
    const readTab = async (name: string) => ((await sheetsService.getHeaders(name).catch(() => [] as string[])).length ? sheetsService.getAllRows(name) : []);
    const [causes, donations, existingRel] = await Promise.all([
      readTab("Causes").then((rows) => causeRepository.hydrate(rows)),
      readTab("Donations").then((rows) => donationRepository.hydrate(rows)),
      readTab("Donation_Causes").then((rows) => donationCauseRepository.hydrate(rows)),
    ]);
    const have = new Set(existingRel.map((r) => r.donationId));
    const now = new Date().toISOString();
    for (const d of donations) {
      if (d.id === "PENDING" || have.has(d.id) || donationState(d.status) === "rejected") continue;
      const causeId = attributeDonation(d, causes);
      if (!causeId) continue;
      const cause = causes.find((c) => c.id === causeId)!;
      backfillRows.push({
        id: designationId(d.id, causeId),
        donationId: d.id,
        causeId,
        causeTitle: cause.title,
        designatedAmount: d.amount,
        designationStatus: "designated",
        provenance: "donor_selected",
        createdAt: now,
        updatedAt: now,
        updatedBy: "setup-backfill",
      });
    }
    report.legacyDonationsToBackfill = backfillRows.length;
  }

  if (!options.apply) return report;

  // Apply: create tabs and add missing columns (headers only; no row is touched).
  for (const { repo, name } of TABS) {
    const expected: string[] = (repo as any).headers;
    const existing = await sheetsService.getHeaders(name).catch(() => [] as string[]);
    if (existing.length === 0) {
      await (repo as any).init();
    } else {
      const merged = [...existing, ...expected.filter((h) => !existing.includes(h))];
      if (merged.length !== existing.length) await sheetsService.setHeaders(name, merged);
    }
  }
  if (backfillRows.length) {
    report.backfilled = await donationCauseRepository.createMissing(backfillRows);
  }
  return report;
}
