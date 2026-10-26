/**
 * lib/reporting/dashboard.ts
 *
 * Dashboard metrics computed ONLY from canonical records (Donations, Donors, Donation_Causes, Allocations,
 * Communication_Recipients, Causes). Pure and deterministic so tests can reconcile it against the sheet contents.
 *
 * Definitions (documented business rules):
 *  - Donation count / value: DISTINCT donation rows (unfinished PENDING placeholders excluded). "Verified" = status
 *    completed/verified/allocated; "pending" = submitted, unverified; rejected/failed/cancelled never count as money.
 *  - Contribution by cause: explicit designated amounts of verified donations. A multi-cause donation without a
 *    recorded split is reported ONCE under "unresolved distribution", never against each cause. Donations with no cause
 *    are "unrestricted". Designation rows are relationships, not donations.
 *  - Allocated: sum of ACTIVE allocation records (reversed excluded). Allocated is not "spent" and not "completed".
 *  - Communications: recipient-level outcomes. smtp_accepted means the mail server accepted the message, not delivery.
 */
import type { Donation, DonorProfile } from "../db";
import type { Cause } from "../repositories/causeRepository";
import type { DonationCauseEntity } from "../repositories/donationCauseRepository";
import type { AllocationEntity } from "../repositories/allocationRepository";
import type { CommunicationRecipientEntity } from "../repositories/communicationRecipientRepository";
import { summarizeDonations, fundingByDesignation, donationState } from "../donations/metrics";
import { findIntegrityExceptions } from "./integrity";

export interface DashboardInput {
  donations: Donation[];
  donors: DonorProfile[];
  causes: Cause[];
  designations: DonationCauseEntity[];
  allocations: AllocationEntity[];
  recipients: CommunicationRecipientEntity[];
  /** Optional reporting window applied to donations (by donation date) and new donors (by join date). */
  range?: { from?: string; to?: string };
  now?: number;
}

const inRange = (iso: string | undefined, range?: { from?: string; to?: string }) => {
  if (!range?.from && !range?.to) return true;
  const t = new Date(iso || "").getTime();
  if (Number.isNaN(t)) return false;
  if (range.from && t < new Date(range.from).getTime()) return false;
  if (range.to && t > new Date(range.to).getTime()) return false;
  return true;
};

export function computeDashboard(input: DashboardInput) {
  const now = input.now ?? Date.now();
  const real = input.donations.filter((d) => d.id !== "PENDING");
  const scoped = real.filter((d) => inRange(d.date, input.range));
  const summary = summarizeDonations(scoped);

  const scopedIds = new Set(scoped.map((d) => d.id));
  const designations = input.designations.filter((r) => scopedIds.has(r.donationId));
  const funding = fundingByDesignation(scoped, designations, input.causes);

  const activeAllocs = input.allocations.filter((a) => a.status === "active" && scopedIds.has(a.donationId));
  const allocatedByCause = new Map<string, { amount: number; count: number; withEvidence: number }>();
  for (const a of activeAllocs) {
    const e = allocatedByCause.get(a.causeId || "") || { amount: 0, count: 0, withEvidence: 0 };
    e.amount += a.allocatedAmount;
    e.count++;
    if ((a.evidenceDriveFileIds || []).length > 0) e.withEvidence++;
    allocatedByCause.set(a.causeId || "", e);
  }

  const causes = input.causes.map((c) => {
    const f = funding.byCause.get(c.id)!;
    const al = allocatedByCause.get(c.id) || { amount: 0, count: 0, withEvidence: 0 };
    return {
      id: c.id,
      title: c.title,
      kind: c.kind || "cause",
      status: c.status,
      targetAmount: c.targetAmount,
      designatedReceived: f.designatedReceived,
      designatedPending: f.designatedPending,
      verifiedDonationCount: f.donationCount,
      contributorCount: f.contributorCount,
      unresolvedDonationCount: f.unresolvedDonationCount,
      allocatedAmount: al.amount,
      allocationCount: al.count,
      allocationsWithEvidence: al.withEvidence,
      designatedNotYetAllocated: Math.max(0, f.designatedReceived - al.amount),
    };
  });

  const recipientsInScope = input.recipients;
  const countBy = (s: string) => recipientsInScope.filter((r) => r.status === s).length;
  const staleCutoff = now - 15 * 60 * 1000;
  const pendingStale = recipientsInScope.filter((r) => (r.status === "queued" || r.status === "attempted") && new Date(r.updatedAt || r.createdAt).getTime() < staleCutoff).length;
  const byType: Record<string, { accepted: number; failed: number; unresolved: number }> = {};
  for (const r of recipientsInScope) {
    const t = (byType[r.communicationType] ||= { accepted: 0, failed: 0, unresolved: 0 });
    if (r.status === "smtp_accepted") t.accepted++;
    else if (r.status === "failed") t.failed++;
    else if (r.status === "unresolved") t.unresolved++;
  }

  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const verifiedDonorIds = new Set(scoped.filter((d) => donationState(d.status) === "received").map((d) => d.donorId));
  const integrity = findIntegrityExceptions({ donations: input.donations, donors: input.donors, causes: input.causes, designations: input.designations, allocations: input.allocations, now });

  return {
    donations: {
      totalCount: summary.totalCount,
      verifiedAmount: summary.receivedAmount,
      verifiedCount: summary.receivedCount,
      pendingAmount: summary.pendingAmount,
      pendingCount: summary.pendingCount,
      rejectedAmount: summary.rejectedAmount,
      rejectedCount: summary.rejectedCount,
    },
    donors: {
      total: input.donors.length,
      newInPeriod: input.donors.filter((d) => (input.range ? inRange(d.dateJoined, input.range) : new Date(d.dateJoined || "").getTime() >= thirtyDaysAgo)).length,
      withVerifiedDonation: verifiedDonorIds.size,
    },
    causes,
    unresolvedDistribution: funding.unresolved,
    unrestricted: funding.unrestricted,
    allocations: {
      activeAmount: activeAllocs.reduce((s, a) => s + a.allocatedAmount, 0),
      activeCount: activeAllocs.length,
      reversedCount: input.allocations.filter((a) => a.status === "reversed").length,
      withEvidenceCount: activeAllocs.filter((a) => (a.evidenceDriveFileIds || []).length > 0).length,
    },
    communications: {
      recipients: recipientsInScope.length,
      smtpAccepted: countBy("smtp_accepted"),
      failed: countBy("failed"),
      unresolved: countBy("unresolved"),
      inProgressOrStale: countBy("queued") + countBy("attempted"),
      stalePending: pendingStale,
      byType,
    },
    integrity: {
      errors: integrity.filter((e) => e.severity === "error").length,
      warnings: integrity.filter((e) => e.severity === "warning").length,
      info: integrity.filter((e) => e.severity === "info").length,
      exceptions: integrity.slice(0, 50),
    },
  };
}
