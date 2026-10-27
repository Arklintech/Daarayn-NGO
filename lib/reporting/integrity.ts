/**
 * lib/reporting/integrity.ts
 *
 * Detects (never silently "fixes") inconsistencies between canonical records. Pure; used by the dashboard and the
 * reconciliation screen. Each exception names the record so an administrator can resolve it.
 */
import type { Donation, DonorProfile } from "../db";
import type { Cause } from "../repositories/causeRepository";
import type { DonationCauseEntity } from "../repositories/donationCauseRepository";
import type { AllocationEntity } from "../repositories/allocationRepository";
import { donationState } from "../donations/metrics";
import { normalizeEmail, normalizePhone } from "../donors/normalize";

export type IntegrityType =
  | "INCOMPLETE_DONATION"
  | "STALE_PLACEHOLDER"
  | "DUPLICATE_DONATION_ID"
  | "DUPLICATE_DONOR_TOKEN"
  | "DONATION_DONOR_MISSING"
  | "DUPLICATE_DONOR_CONTACT"
  | "UNRESOLVED_DESIGNATION"
  | "ORPHAN_DESIGNATION"
  | "UNKNOWN_CAUSE_REFERENCE"
  | "ALLOCATION_EXCEEDS_DESIGNATION"
  | "ALLOCATION_WITHOUT_DESIGNATION"
  | "ALLOCATION_ON_UNVERIFIED_DONATION";

export interface IntegrityException {
  type: IntegrityType;
  severity: "error" | "warning" | "info";
  entityId: string;
  message: string;
}

const cents = (n: number) => Math.round(n * 100);
const PLACEHOLDER_STALE_MS = 2 * 60 * 1000;

export function findIntegrityExceptions(input: {
  donations: Donation[];
  donors: DonorProfile[];
  causes: Cause[];
  designations: DonationCauseEntity[];
  allocations: AllocationEntity[];
  now?: number;
}): IntegrityException[] {
  const now = input.now ?? Date.now();
  const out: IntegrityException[] = [];
  const real = input.donations.filter((d) => d.id !== "PENDING");

  for (const d of input.donations) {
    if (d.id === "PENDING" && now - new Date(d.date).getTime() > PLACEHOLDER_STALE_MS) {
      out.push({ type: "STALE_PLACEHOLDER", severity: "warning", entityId: String((d as any).submissionKey || "PENDING"), message: "An unfinished donation placeholder row exists; the donor's retry will complete it." });
    }
  }
  const idCounts = new Map<string, number>();
  for (const d of real) idCounts.set(d.id, (idCounts.get(d.id) || 0) + 1);
  for (const [id, n] of idCounts) if (n > 1) out.push({ type: "DUPLICATE_DONATION_ID", severity: "error", entityId: id, message: `${n} donation rows share this id.` });

  const tokenCounts = new Map<string, number>();
  for (const dn of input.donors) tokenCounts.set(dn.id, (tokenCounts.get(dn.id) || 0) + 1);
  for (const [id, n] of tokenCounts) if (n > 1) out.push({ type: "DUPLICATE_DONOR_TOKEN", severity: "error", entityId: id, message: `${n} donor rows share this token.` });

  // A donation must belong to an existing donor; otherwise donor histories and counts silently omit it.
  const donorIds = new Set(input.donors.map((dn) => dn.id));
  for (const d of real) {
    if (d.donorId && !donorIds.has(d.donorId)) {
      out.push({ type: "DONATION_DONOR_MISSING", severity: "warning", entityId: d.id, message: `Refers to donor ${d.donorId}, which has no donor record.` });
    }
  }

  // Distinct tokens sharing one normalized email or phone are reported for an administrator to review. Never merged here:
  // matching people automatically is how two different donors get combined.
  const byContact = new Map<string, string[]>();
  for (const dn of input.donors) {
    for (const key of [normalizeEmail(dn.email) && `email:${normalizeEmail(dn.email)}`, normalizePhone(dn.phone) && `phone:${normalizePhone(dn.phone)}`]) {
      if (!key) continue;
      if (!byContact.has(key)) byContact.set(key, []);
      const tokens = byContact.get(key)!;
      if (!tokens.includes(dn.id)) tokens.push(dn.id);
    }
  }
  for (const [key, tokens] of byContact) {
    if (tokens.length > 1) {
      out.push({ type: "DUPLICATE_DONOR_CONTACT", severity: "warning", entityId: tokens[0], message: `${tokens.length} donor records share the same ${key.split(":")[0]} (${tokens.join(", ")}).` });
    }
  }

  for (const d of real) {
    if (d.opStatus === "pending" || d.opStatus === "partial") {
      out.push({ type: "INCOMPLETE_DONATION", severity: "warning", entityId: d.id, message: `Follow-up steps outstanding: ${d.opPending || "all"}.` });
    }
  }

  const donationById = new Map(real.map((d) => [d.id, d]));
  const causeIds = new Set(input.causes.map((c) => c.id));
  const byDonation = new Map<string, DonationCauseEntity[]>();
  for (const r of input.designations) {
    if (!byDonation.has(r.donationId)) byDonation.set(r.donationId, []);
    byDonation.get(r.donationId)!.push(r);
    if (!donationById.has(r.donationId)) out.push({ type: "ORPHAN_DESIGNATION", severity: "error", entityId: r.id, message: `References missing donation ${r.donationId}.` });
    if (!causeIds.has(r.causeId)) out.push({ type: "UNKNOWN_CAUSE_REFERENCE", severity: "error", entityId: r.id, message: `References unknown cause ${r.causeId}.` });
  }
  for (const [donationId, rels] of byDonation) {
    const d = donationById.get(donationId);
    if (d && donationState(d.status) === "received" && rels.some((r) => r.designationStatus === "unresolved")) {
      out.push({ type: "UNRESOLVED_DESIGNATION", severity: "info", entityId: donationId, message: "Verified donation related to several causes without a recorded distribution." });
    }
  }

  const sums = new Map<string, number>();
  for (const a of input.allocations) {
    if (a.status !== "active") continue;
    const d = donationById.get(a.donationId);
    if (!d) {
      out.push({ type: "ALLOCATION_ON_UNVERIFIED_DONATION", severity: "error", entityId: a.id, message: `Refers to missing donation ${a.donationId}.` });
      continue;
    }
    if (donationState(d.status) !== "received") out.push({ type: "ALLOCATION_ON_UNVERIFIED_DONATION", severity: "error", entityId: a.id, message: `Donation ${a.donationId} is not verified.` });
    const rel = (byDonation.get(a.donationId) || []).find((r) => r.causeId === a.causeId);
    if (!rel || rel.designatedAmount === null) {
      out.push({ type: "ALLOCATION_WITHOUT_DESIGNATION", severity: "error", entityId: a.id, message: "No recorded designation for this donation and cause." });
      continue;
    }
    const key = `${a.donationId}|${a.causeId}`;
    sums.set(key, (sums.get(key) || 0) + cents(a.allocatedAmount));
    if ((sums.get(key) as number) > cents(rel.designatedAmount)) {
      out.push({ type: "ALLOCATION_EXCEEDS_DESIGNATION", severity: "error", entityId: a.id, message: `Active allocations exceed the designated amount for ${a.donationId}/${a.causeId}.` });
    }
  }
  return out;
}
