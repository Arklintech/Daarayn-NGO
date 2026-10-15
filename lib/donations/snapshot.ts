/**
 * lib/donations/snapshot.ts
 *
 * Fresh, consistent read of the tabs donation figures are built from, in a
 * single Sheets request so every number on a page comes from the same moment.
 * Throws when Sheets cannot be read — callers must show that as a failure,
 * never as zero.
 */

import { sheetsService } from "../google/sheets";
import { donationRepository } from "../repositories/donationRepository";
import { donorRepository } from "../repositories/donorRepository";
import { causeRepository } from "../repositories/causeRepository";
import { fieldReportRepository } from "../repositories/fieldReportRepository";
import { auditLogRepository } from "../repositories/auditLogRepository";

const repositories = {
  donations: donationRepository,
  donors: donorRepository,
  causes: causeRepository,
  fieldReports: fieldReportRepository,
  auditLog: auditLogRepository,
};

type Repos = typeof repositories;
type Part = keyof Repos;
type EntityOf<K extends Part> = Awaited<ReturnType<Repos[K]["getAll"]>>;

export type DonationSnapshot<K extends Part> = { [P in K]: EntityOf<P> } & { readAt: string };

export async function loadSnapshot<K extends Part>(parts: K[]): Promise<DonationSnapshot<K>> {
  await Promise.all(parts.map((p) => repositories[p].init()));
  const tabs = parts.map((p) => repositories[p].tabName);
  const rows = await sheetsService.batchGetRows(tabs);
  const out: any = { readAt: new Date().toISOString() };
  parts.forEach((p, i) => {
    out[p] = repositories[p].hydrate(rows[tabs[i]]);
  });
  return out;
}
