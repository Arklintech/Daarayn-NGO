/**
 * lib/communication-resolver.ts
 *
 * Decides exactly who may receive a communication for the selected cause(s) and purpose. The decision is made by the
 * pure function `evaluateRecipients` (unit-tested); `resolveRecipients` only loads the records from Google Sheets.
 *
 * Principles
 *  - Cause scope comes from canonical relationships: Donation_Causes rows (a donation selecting several causes
 *    qualifies for each of them) with the donation's stored cause as a legacy fallback. No keyword/fuzzy matching and
 *    never a fall-back to "all donors". An empty result is a valid result, not a reason to broaden the audience.
 *  - Each of the five purposes has its own rule, based on the donation's payment state and, where relevant, real
 *    allocation records and evidence (TYPE_RULES).
 *  - Donors are identified by their permanent Donor Token and de-duplicated by e-mail; the causes and donations that
 *    made a donor eligible are kept as eligibility context.
 *  - Communication history is consulted per donor, purpose and cause scope: accepted, in-progress and unresolved
 *    outcomes are excluded; failed recipients are eligible and flagged.
 *  - Everything excluded is returned with its reason.
 */

import { causeRepository, type Cause } from "@/lib/repositories/causeRepository";
import { donationRepository } from "@/lib/repositories/donationRepository";
import { donorRepository } from "@/lib/repositories/donorRepository";
import { allocationRepository, type AllocationEntity } from "@/lib/repositories/allocationRepository";
import { donationCauseRepository, type DonationCauseEntity } from "@/lib/repositories/donationCauseRepository";
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
  contribution_confirmation: "A verified donation related to the selected cause. Pending or rejected donations are not confirmed. (Transactional: ignores e-mail opt-out.)",
  project_progress: "A verified donation related to the selected cause.",
  allocation_confirmation: "A verified donation with an ACTIVE allocation record for the selected cause.",
  completion_report: "A verified donation AND the cause is marked Completed AND an active allocation for that donation and cause has supporting evidence.",
  general_communication: "A donor with a non-rejected donation related to the selected cause (or, for All donors, every active registered donor).",
};

const ALL_SELECTORS = new Set(["all", "all_causes", "all_donors"]);
/** A send attempt younger than this with no outcome is treated as still running. */
export const IN_PROGRESS_WINDOW_MS = 15 * 60 * 1000;

export interface EligibleRecipient {
  id: string; // Donor Token
  name: string;
  email: string;
  donationIds: string[];
  /** The selected causes that made this donor eligible (a donor matching several causes appears once). */
  causeIds: string[];
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
  designations?: DonationCauseEntity[];
  history: CommunicationRecipientEntity[];
  /** Admin explicitly chose to include donors who already had this message accepted. */
  includePreviouslySent?: boolean;
  /** Admin explicitly chose to include donors whose previous send has an unknown outcome (may duplicate). */
  includeUnresolved?: boolean;
  now?: number;
}

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

export function isCommunicationType(type: string): type is CommunicationType {
  return (COMMUNICATION_TYPES as readonly string[]).includes(type);
}

export function scopeKeyFor(causeIds: string[]): string {
  return [...new Set(causeIds)].sort().join("|");
}

/** Legacy attribution of a donation that has no relationship rows: its stored cause id, else exact title. No fuzzy match. */
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
  const designations = input.designations ?? [];
  const now = input.now ?? Date.now();
  const scopeKey = scopeKeyFor(causeIds || []);

  if (!isCommunicationType(input.type)) return fail(input.type, scopeKey, `Unknown communication type "${input.type}".`);
  const type = input.type;
  if (!causeIds || causeIds.length === 0) return fail(type, scopeKey, "Select at least one cause before choosing recipients.");

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
  if (unknown.length > 0) return fail(type, scopeKey, `Unknown cause id(s): ${unknown.join(", ")}. Recipients cannot be established safely.`);
  if (wantsAll && causeIds.includes("all_donors") && type !== "general_communication") {
    return fail(type, scopeKey, "\"All donors\" is only allowed for General Communication; choose a cause for this communication type.");
  }

  const selectedCauses = causes.filter((c) => causeSelection.includes(c.id));
  const causeNames = [
    ...selectedCauses.map((c) => c.title),
    ...directDonorIds.map((id) => `Direct to: ${donorById.get(id)!.name || id}`),
    ...(wantsAll ? ["All causes"] : []),
  ];

  // Canonical relationships: donationId -> cause ids (Donation_Causes), else the legacy single cause.
  const relByDonation = new Map<string, Set<string>>();
  for (const r of designations) {
    if (!relByDonation.has(r.donationId)) relByDonation.set(r.donationId, new Set());
    relByDonation.get(r.donationId)!.add(r.causeId);
  }
  const relatedCauses = (d: Donation): Set<string> => {
    const rows = relByDonation.get(d.id);
    if (rows && rows.size) return rows;
    const legacy = attributeDonation(d, causes);
    return new Set(legacy ? [legacy] : []);
  };

  /** Selected causes this donation relates to (empty = out of scope). */
  const matchedCauses = (d: Donation): string[] => {
    if (directDonorIds.includes(d.donorId) || wantsAll) return [...relatedCauses(d)];
    return [...relatedCauses(d)].filter((c) => causeSelection.includes(c));
  };
  const inScope = (d: Donation): boolean => d.id !== "PENDING" && (directDonorIds.includes(d.donorId) || wantsAll || matchedCauses(d).length > 0);
  const scoped = donations.filter(inScope);

  const activeAllocs = allocations.filter((a) => norm(a.status) !== "reversed" && Number(a.allocatedAmount) > 0);
  const allocFor = (donationId: string, causeId: string) =>
    activeAllocs.filter((a) => a.donationId === donationId && (a.causeId ? a.causeId === causeId : true));

  /** null = eligible; otherwise the reason. `matched` are the selected causes this donation relates to. */
  const donationEligible = (d: Donation, matched: string[]): string | null => {
    const state = donationState(d.status);
    const casesToCheck = matched.length ? matched : [...relatedCauses(d)];
    switch (type) {
      case "contribution_confirmation":
      case "project_progress":
        return state === "received" ? null : state === "pending" ? "payment not yet verified" : "payment rejected";
      case "allocation_confirmation":
        if (state !== "received") return state === "pending" ? "payment not yet verified" : "payment rejected";
        return casesToCheck.some((c) => allocFor(d.id, c).length > 0) ? null : "no allocation record for this donation and cause";
      case "completion_report": {
        if (state !== "received") return state === "pending" ? "payment not yet verified" : "payment rejected";
        const completed = casesToCheck.filter((c) => norm(causes.find((x) => x.id === c)?.status) === "completed");
        if (completed.length === 0) return "cause is not marked Completed";
        const evidenced = completed.some((c) => allocFor(d.id, c).some((a) => (a.evidenceDriveFileIds || []).length > 0));
        return evidenced ? null : "no verified completion evidence is attached to an allocation";
      }
      case "general_communication":
        return state === "rejected" ? "payment rejected" : null;
    }
  };

  const byDonor = new Map<string, { donor: DonorProfile | null; fallbackEmail: string; fallbackName: string; ok: Donation[]; causeIds: Set<string>; reasons: string[] }>();
  for (const d of scoped) {
    let donor = donorById.get(d.donorId) || null;
    if (!donor) donor = donorByEmail.get(normalizeEmail(d.donorEmail)) || null;
    const key = donor?.id || `unresolved:${normalizeEmail(d.donorEmail) || d.id}`;
    const entry = byDonor.get(key) || { donor, fallbackEmail: normalizeEmail(d.donorEmail), fallbackName: d.donorName, ok: [], causeIds: new Set<string>(), reasons: [] };
    const matched = matchedCauses(d);
    const reason = donationEligible(d, matched);
    if (reason) entry.reasons.push(reason);
    else {
      entry.ok.push(d);
      matched.forEach((c) => entry.causeIds.add(c));
    }
    byDonor.set(key, entry);
  }

  const allDonorsMail = type === "general_communication" && causeIds.includes("all_donors");
  if (allDonorsMail) {
    for (const d of donors) {
      if (!byDonor.has(d.id) && d.status !== "inactive") byDonor.set(d.id, { donor: d, fallbackEmail: "", fallbackName: d.name, ok: [], causeIds: new Set(), reasons: [] });
    }
  }

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
    if (donor.emailSuppressed && type !== "contribution_confirmation") {
      excluded.push({ id, name, email, reason: "donor opted out of e-mail outreach" });
      continue;
    }

    const past = historyFor(id);
    const accepted = past.find((h) => h.status === "smtp_accepted");
    if (accepted && !input.includePreviouslySent) {
      excluded.push({ id, name, email, reason: `already sent (broadcast ${accepted.broadcastId}, SMTP-accepted)` });
      continue;
    }
    const unresolved = past.find((h) => h.status === "unresolved");
    if (unresolved && !input.includeUnresolved && !accepted) {
      excluded.push({ id, name, email, reason: `previous send outcome unknown (broadcast ${unresolved.broadcastId}); it may already have been delivered` });
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
      causeIds: [...entry.causeIds],
      previouslyFailed: !!failed && !accepted,
      lastError: failed?.lastError || undefined,
    });
  }

  const raised = scoped.filter((d) => donationState(d.status) === "received").reduce((s, d) => s + (Number(d.amount) || 0), 0);
  const goalAmount = wantsAll ? causes.reduce((s, c) => s + (Number(c.targetAmount) || 0), 0) : selectedCauses.reduce((s, c) => s + (Number(c.targetAmount) || 0), 0);
  const percentage = goalAmount > 0 ? Math.min(100, Math.round((raised / goalAmount) * 100)) : 0;

  recipients.sort((a, b) => a.name.localeCompare(b.name));
  return { ok: true, type, scopeKey, causeNames, recipients, excluded, stats: { raised, goalAmount, percentage } };
}

/** Loads fresh records and evaluates. Throws if Sheets cannot be read (never returns a guess). */
export async function resolveRecipients(causeIds: string[], type: string, options: { includePreviouslySent?: boolean; includeUnresolved?: boolean } = {}) {
  const [causes, donations, donors, allocations, designations, history] = await Promise.all([
    causeRepository.getAll(true),
    donationRepository.getAll(true),
    donorRepository.getAll(true),
    allocationRepository.getAll(true),
    donationCauseRepository.getAll(true),
    communicationRecipientRepository.readFresh(),
  ]);
  const resolution = evaluateRecipients({
    causeIds,
    type,
    causes,
    donations,
    donors,
    allocations,
    designations,
    history: history.map((h) => h.entity),
    includePreviouslySent: options.includePreviouslySent,
    includeUnresolved: options.includeUnresolved,
  });
  return { ...resolution, uniqueDonors: resolution.recipients };
}
