/**
 * lib/donations/designations.ts
 *
 * Pure rules for monetary cause designations (how much of ONE donation is designated to each cause).
 * A designation is a donor/admin statement about intent, not proof that money was allocated or spent.
 */
import type { DonationCauseEntity } from "../repositories/donationCauseRepository";

export class DesignationError extends Error {
  constructor(message: string, public readonly httpStatus: 400 | 409 = 400) {
    super(message);
  }
}

const cents = (n: number) => Math.round(n * 100);

/**
 * Validates an admin-entered split for a donation. Rules:
 *  - every cause in the split must already be one of the donation's related causes (an admin cannot silently
 *    attach a new cause here; that is a different, audited operation);
 *  - every related cause must be covered (no hidden remainder);
 *  - amounts are positive and reconcile exactly to the donation amount (to the paisa; no rounding allowance is
 *    applied, so any approved rounding rule must be entered explicitly in the amounts).
 */
export function validateSplit(donationAmount: number, related: DonationCauseEntity[], split: { causeId: string; amount: number }[]): void {
  if (related.length === 0) throw new DesignationError("This donation has no cause relationships to designate.");
  const ids = new Set(related.map((r) => r.causeId));
  const seen = new Set<string>();
  for (const s of split) {
    if (!ids.has(s.causeId)) throw new DesignationError(`Cause ${s.causeId} is not related to this donation.`);
    if (seen.has(s.causeId)) throw new DesignationError(`Cause ${s.causeId} appears more than once.`);
    seen.add(s.causeId);
    if (!Number.isFinite(s.amount) || s.amount <= 0) throw new DesignationError(`The amount for ${s.causeId} must be greater than zero.`);
  }
  if (seen.size !== ids.size) throw new DesignationError("The split must cover every related cause.");
  const total = split.reduce((sum, s) => sum + cents(s.amount), 0);
  if (total !== cents(donationAmount)) {
    throw new DesignationError(`The split totals ${(total / 100).toFixed(2)} but the donation is ${donationAmount.toFixed(2)}. Designations must reconcile exactly.`, 409);
  }
}
