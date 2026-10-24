/**
 * lib/communication-resolver.ts
 *
 * Decides exactly who may receive a communication for the selected cause(s)
 * and communication type. The decision is made by the pure function
 * `evaluateRecipients` (unit-tested); `resolveRecipients` only loads the
 * records from Google Sheets through the repositories.
 *
 * Principles
 *  - A selected cause limits recipients to donors with a donation attributed
 *    to that cause by id or exact title. There is no keyword/fuzzy matching and
 *    never a fall-back to "all donors".
 *  - Each of the five communication types has its own eligibility rule, based
 *    on the donation's real payment state (see TYPE_RULES).
 *  - Donors are identified by their permanent Donor Token and de-duplicated by
 *    normalised e-mail address.
 *  - Communication history (Communication_Recipients) is consulted: donors who
 *    already had this communication accepted, or have one in progress, are
 *    excluded; previously failed donors are eligible and flagged.
 *  - Everything that is excluded is returned with the reason, so the admin can
 *    see why. If the selection cannot be established, an error is returned.
 */

import { causeRepository, type Cause } from "@/lib/repositories/causeRepository";
import { donationRepository } from "@/lib/repositories/donationRepository";
import { donorRepository } from "@/lib/repositories/donorRepository";
import { allocationRepository, type AllocationEntity } from "@/lib/repositories/allocationRepository";
import { communicationRecipientRepository, type CommunicationRecipientEntity } from "@/lib/repositories/communicationRecipientRepository";
import { donationState } from "@/lib/donations/metrics";
import { normalizeEmail } from "@/lib/donors/normalize";
import type { Donation, DonorProfile } from "@/lib/db";

export const COMMUNICATION_TYPES = [
  "contribution_confirmation",
  "project_progress",
  "allocation_confirmation",
  "completion_report",
  "general_communication",
] as const;
export type CommunicationType = (typeof COMMUNICATION_TYPES)[number];

/** Human description of each rule, shown in the UI and docs. */
export const TYPE_RULES: Record<CommunicationType, string> = {
  contribution_confirmation: "Donation attributed to the cause AND verified (payment received). Pending or rejected donations are not confirmed.",
  project_progress: "Donation attributed to the cause AND verified.",
  allocation_confirmation: "Verified donation AND a valid active allocation record for that donation.",
  completion_report: "Verified donation AND the cause is marked Completed (verified completion evidence).",
  general_communication: "Donor has at least one non-rejected donation attributed to the cause.",
};

const ALL_SELECTORS = new Set(["all", "all_causes", "all_donors"]);
/** A send attempt younger than this with no outcome is treated as still running. */
export const IN_PROGRESS_WINDOW_MS = 15 * 60 * 1000;

export interface EligibleRecipient {
  id: string; // Donor Token
  name: string;
  email: string;
  donationIds: string[];
  previouslyFailed: boolean;
  lastError?: string;
}

export interface ExcludedRecipient {
  id: string;
  name: string;
  email: string;
  reason: string;
}

export interface Resolution {
  ok: boolean;
  error?: string;
  type: CommunicationType;
  scopeKey: string;
  causeNames: string[];
  recipients: EligibleRecipient[];
  excluded: ExcludedRecipient[];
  stats: { raised: number; goalAmount: number; percentage: number };
}

export interface EvaluateInput {
  causeIds: string[];
  type: string;
  causes: Cause[];
  donations: Donation[];
  donors: DonorProfile[];
  allocations: AllocationEntity[];
  history: CommunicationRecipientEntity[];
  /** Admin explicitly chose to include donors who already had this message accepted. */
  includePreviouslySent?: boolean;
  now?: number;
}

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

export function isCommunicationType(type: string): type is CommunicationType {
  return (COMMUNICATION_TYPES as readonly string[]).includes(type);
}

export function scopeKeyFor(causeIds: string[]): string {
  return [...new Set(causeIds)].sort().join("|");
}

/** The cause a donation counts towards: exact cause id, else exact (case-insensitive) title. No partial matching. */
export function attributeDonation(d: Donation, causes: Cause[]): string | null {
  if (d.causeId && causes.some((c) => c.id === d.causeId)) return d.causeId;
  const title = norm(d.causeTitle);
  if (!title) return null;
  return causes.find((c) => norm(c.title) === title)?.id ?? null;
}

function fail(type: string, scopeKey: string, error: string): Resolution {
  return {
    ok: false,
    error,
    type: (isCommunicationType(type) ? type : "general_communication") as CommunicationType,
    scopeKey,
    causeNames: [],
    recipients: [],
    excluded: [],
    stats: { raised: 0, goalAmount: 0, percentage: 0 },
  };
}

export function evaluateRecipients(input: EvaluateInput): Resolution {
  const { causeIds, causes, donations, donors, allocations, history } = input;
  const now = input.now ?? Date.now();
  const scopeKey = scopeKeyFor(causeIds || []);

  if (!isCommunicationType(input.type)) {
    return fail(input.type, scopeKey, `Unknown communication type "${input.type}".`);
  }
  const type = input.type;
  if (!causeIds || causeIds.length === 0) {
    return fail(type, scopeKey, "Select at least one cause before choosing recipients.");
  }

  const donorById = new Map(donors.map((d) => [d.id, d]));
  const donorByEmail = new Map<string, DonorProfile>();
  for (const d of donors) {
    const e = normalizeEmail(d.email);
    if (e && !donorByEmail.has(e)) donorByEmail.set(e, d);
  }

  const wantsAll = causeIds.some((c) => ALL_SELECTORS.has(c));
  const directDonorIds = causeIds.filter((c) => donorById.has(c));
  const causeSelection = causeIds.filter((c) => !ALL_SELECTORS.has(c) && !donorById.has(c));
  const unknown = causeSelection.filter((c) => !causes.some((x) => x.id === c));
  if (unknown.length > 0) {
    return fail(type, scopeKey, `Unknown cause id(s): ${unknown.join(", ")}. Recipients cannot be established safely.`);
  }
  if (wantsAll && causeIds.includes("all_donors") && type !== "general_communication") {
    return fail(type, scopeKey, "\"All donors\" is only allowed for General Communication; choose a cause for this communication type.");
  }

  const selectedCauses = causes.filter((c) => causeSelection.includes(c.id));
  const causeNames = [
    ...selectedCauses.map((c) => c.title),
    ...directDonorIds.map((id) => `Direct to: ${donorById.get(id)!.name || id}`),
    ...(wantsAll ? ["All causes"] : []),
  ];

  // Donations in scope
  const inScope = (d: Donation): boolean => {
    if (directDonorIds.includes(d.donorId)) return true;
    const attributed = attributeDonation(d, causes);
    if (wantsAll) return true;
    return !!attributed && causeSelection.includes(attributed);
  };
  const scoped = donations.filter(inScope);

  const allocatedDonationIds = new Set(
    allocations.filter((a) => norm(a.status) !== "reversed" && Number(a.allocatedAmount) > 0).map((a) => a.donationId)
  );

  const donationEligible = (d: Donation): string | null => {
    const state = donationState(d.status);
    const cause = causes.find((c) => c.id === attributeDonation(d, causes));
    switch (type) {
      case "contribution_confirmation":
      case "project_progress":
        return state === "received" ? null : state === "pending" ? "payment not yet verified" : "payment rejected";
      case "allocation_confirmation":
        if (state !== "received") return state === "pending" ? "payment not yet verified" : "payment rejected";
        return allocatedDonationIds.has(d.id) ? null : "no allocation record for this donation";
      case "completion_report":
        if (state !== "received") return state === "pending" ? "payment not yet verified" : "payment rejected";
        return cause && norm(cause.status) === "completed" ? null : "cause is not marked Completed";
      case "general_communication":
        return state === "rejected" ? "payment rejected" : null;
    }
  };

  // Group in-scope donations by donor identity
  const byDonor = new Map<string, { donor: DonorProfile | null; fallbackEmail: string; fallbackName: string; ok: Donation[]; reasons: string[] }>();
  for (const d of scoped) {
    let donor = donorById.get(d.donorId) || null;
    if (!donor) donor = donorByEmail.get(normalizeEmail(d.donorEmail)) || null;
    const key = donor?.id || `unresolved:${normalizeEmail(d.donorEmail) || d.id}`;
    const entry = byDonor.get(key) || { donor, fallbackEmail: normalizeEmail(d.donorEmail), fallbackName: d.donorName, ok: [], reasons: [] };
    const reason = donationEligible(d);
    if (reason) entry.reasons.push(reason);
    else entry.ok.push(d);
    byDonor.set(key, entry);
  }

  // Registered donors with no donation at all matter only for direct targeting and All-donors general mail.
  if (type === "general_communication" && causeIds.includes("all_donors")) {
    for (const d of donors) {
      if (!byDonor.has(d.id) && d.status !== "inactive") {
        byDonor.set(d.id, { donor: d, fallbackEmail: "", fallbackName: d.name, ok: [], reasons: [] });
      }
    }
  }

  // Communication history for this type + scope
  const relevant = history.filter((h) => h.communicationType === type && h.scopeKey === scopeKey);
  const historyFor = (donorId: string) => relevant.filter((h) => h.donorId === donorId);

  const recipients: EligibleRecipient[] = [];
  const excluded: ExcludedRecipient[] = [];
  const emailsTaken = new Map<string, string>();

  for (const [key, entry] of byDonor) {
    const donor = entry.donor;
    const id = donor?.id || key;
    const name = donor?.name || entry.fallbackName || "Valued Donor";
    const email = normalizeEmail(donor?.email) || entry.fallbackEmail;
    const allDonorsMail = type === "general_communication" && causeIds.includes("all_donors");

    if (!donor) {
      excluded.push({ id, name, email, reason: "no donor profile (Donor Token) is linked to this donation" });
      continue;
    }
    if (entry.ok.length === 0 && !allDonorsMail) {
      excluded.push({ id, name, email, reason: entry.reasons[0] || "no eligible donation" });
      continue;
    }
    if (!email) {
      excluded.push({ id, name, email: "", reason: "no valid email address" });
      continue;
    }
    if (donor.status === "inactive") {
      excluded.push({ id, name, email, reason: "donor profile is inactive" });
      continue;
    }

    const past = historyFor(id);
    const accepted = past.find((h) => h.status === "smtp_accepted");
    if (accepted && !input.includePreviouslySent) {
      excluded.push({ id, name, email, reason: `already sent (broadcast ${accepted.broadcastId}, SMTP-accepted)` });
      continue;
    }
    const inProgress = past.find(
      (h) => (h.status === "queued" || h.status === "attempted") && now - new Date(h.updatedAt || h.createdAt).getTime() < IN_PROGRESS_WINDOW_MS
    );
    if (inProgress) {
      excluded.push({ id, name, email, reason: `a send is in progress (broadcast ${inProgress.broadcastId})` });
      continue;
    }
    const owner = emailsTaken.get(email);
    if (owner) {
      excluded.push({ id, name, email, reason: `duplicate email address (already included for ${owner})` });
      continue;
    }
    emailsTaken.set(email, id);

    const failed = [...past].reverse().find((h) => h.status === "failed" || h.status === "attempted" || h.status === "queued");
    recipients.push({
      id,
      name,
      email,
      donationIds: entry.ok.map((d) => d.id),
      previouslyFailed: !!failed && !accepted,
      lastError: failed?.lastError || undefined,
    });
  }

  const raised = scoped.filter((d) => donationState(d.status) === "received").reduce((s, d) => s + (Number(d.amount) || 0), 0);
  const goalAmount = wantsAll
    ? causes.reduce((s, c) => s + (Number(c.targetAmount) || 0), 0)
    : selectedCauses.reduce((s, c) => s + (Number(c.targetAmount) || 0), 0);
  const percentage = goalAmount > 0 ? Math.min(100, Math.round((raised / goalAmount) * 100)) : 0;

  recipients.sort((a, b) => a.name.localeCompare(b.name));
  return { ok: true, type, scopeKey, causeNames, recipients, excluded, stats: { raised, goalAmount, percentage } };
}

/** Loads fresh records and evaluates. Throws if Sheets cannot be read (never returns a guess). */
export async function resolveRecipients(causeIds: string[], type: string, options: { includePreviouslySent?: boolean } = {}) {
  const [causes, donations, donors, allocations, history] = await Promise.all([
    causeRepository.getAll(true),
    donationRepository.getAll(true),
    donorRepository.getAll(true),
    allocationRepository.getAll(true),
    communicationRecipientRepository.readFresh(),
  ]);
  const resolution = evaluateRecipients({
    causeIds,
    type,
    causes,
    donations,
    donors,
    allocations,
    history: history.map((h) => h.entity),
    includePreviouslySent: options.includePreviouslySent,
  });
  return {
    ...resolution,
    // kept for existing callers
    uniqueDonors: resolution.recipients,
  };
}
