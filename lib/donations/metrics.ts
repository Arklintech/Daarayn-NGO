/**
 * lib/donations/metrics.ts
 *
 * The single definition of how donation records turn into figures. Every
 * dashboard card, list, profile and report uses these functions so that no
 * two views can disagree about the same records. Safe to import on the
 * server and in the browser (no I/O).
 *
 * Business rules (as found in the existing system, see docs/DONATION_DATA_RULES.md):
 *   - Received:  status "completed" (shown as "Verified"), "verified" or
 *                "allocated". Only these count as money received.
 *   - Pending:   any other status (normally "pending") — submitted, awaiting
 *                admin verification. Reported separately, never as received.
 *   - Rejected:  "rejected", "failed" or "cancelled". Excluded from all totals.
 *   - Amounts are summed as stored; the platform records INR.
 *   - Months are bucketed in India time (Asia/Kolkata), the organisation's
 *     operating time zone, so a donation lands in the same month everywhere.
 */

export type DonationState = "received" | "pending" | "rejected";

/** Canonical status values the admin UI understands. */
export type DonationStatus = "completed" | "pending" | "rejected";

export const DONATION_STATUSES: readonly DonationStatus[] = ["pending", "completed", "rejected"];

const RECEIVED_STATUSES = new Set(["completed", "verified", "allocated"]);
const REJECTED_STATUSES = new Set(["rejected", "failed", "cancelled"]);

export interface DonationLike {
  id?: string;
  amount?: number | string;
  status?: string;
  date?: string;
  donorId?: string;
  donorEmail?: string;
  causeId?: string;
  causeTitle?: string;
}

export interface CauseLike {
  id: string;
  title?: string;
  name?: string;
}

export function donationState(status: unknown): DonationState {
  const s = String(status ?? "").trim().toLowerCase();
  if (RECEIVED_STATUSES.has(s)) return "received";
  if (REJECTED_STATUSES.has(s)) return "rejected";
  return "pending";
}

export function canonicalStatus(status: unknown): DonationStatus {
  const state = donationState(status);
  return state === "received" ? "completed" : state;
}

export function donationAmount(d: DonationLike): number {
  const n = Number(d.amount);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export interface DonationSummary {
  receivedAmount: number;
  receivedCount: number;
  pendingAmount: number;
  pendingCount: number;
  rejectedAmount: number;
  rejectedCount: number;
  totalCount: number;
}

export function emptySummary(): DonationSummary {
  return { receivedAmount: 0, receivedCount: 0, pendingAmount: 0, pendingCount: 0, rejectedAmount: 0, rejectedCount: 0, totalCount: 0 };
}

function addTo(summary: DonationSummary, d: DonationLike) {
  const amount = donationAmount(d);
  summary.totalCount++;
  switch (donationState(d.status)) {
    case "received":
      summary.receivedAmount += amount;
      summary.receivedCount++;
      break;
    case "rejected":
      summary.rejectedAmount += amount;
      summary.rejectedCount++;
      break;
    default:
      summary.pendingAmount += amount;
      summary.pendingCount++;
  }
}

export function summarizeDonations(donations: DonationLike[]): DonationSummary {
  const summary = emptySummary();
  for (const d of donations) addTo(summary, d);
  return summary;
}

// ─── Time ────────────────────────────────────────────────────────────────

export const REPORTING_TIME_ZONE = "Asia/Kolkata";

const monthKeyFormat = new Intl.DateTimeFormat("en-CA", { timeZone: REPORTING_TIME_ZONE, year: "numeric", month: "2-digit" });

/** "2026-10" for a date, in the reporting time zone. */
export function monthKey(date: Date): string {
  const parts = monthKeyFormat.formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  return `${y}-${m}`;
}

export function donationDate(d: DonationLike): Date | null {
  const when = new Date(d.date || "");
  return isNaN(when.getTime()) ? null : when;
}

export interface MonthlyPoint {
  key: string;
  month: string;
  /** Received (verified) amount — the figure charts plot. */
  amount: number;
  pending: number;
}

/** Received and pending amounts for each of the last `months` calendar months (oldest first). */
export function monthlyTrend(donations: DonationLike[], months = 6, now = new Date()): MonthlyPoint[] {
  const [year, month] = monthKey(now).split("-").map(Number);
  const points: MonthlyPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(year, month - 1 - i, 15));
    points.push({
      key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
      month: d.toLocaleString("en-US", { month: "short", timeZone: "UTC" }),
      amount: 0,
      pending: 0,
    });
  }
  const byKey = new Map(points.map((p) => [p.key, p]));
  for (const d of donations) {
    const when = donationDate(d);
    if (!when) continue;
    const point = byKey.get(monthKey(when));
    if (!point) continue;
    const state = donationState(d.status);
    if (state === "received") point.amount += donationAmount(d);
    else if (state === "pending") point.pending += donationAmount(d);
  }
  return points;
}

// ─── Donors ──────────────────────────────────────────────────────────────

export interface DonorIdentity {
  id: string;
  email?: string;
}

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

/**
 * A donation belongs to a donor when it carries the donor's id, or — for
 * records written without an id — the donor's email. Names are never used:
 * many donors share names such as "Generous Donor".
 */
export function belongsToDonor(d: DonationLike, donor: DonorIdentity): boolean {
  if (d.donorId && d.donorId === donor.id) return true;
  const email = norm(donor.email);
  return !d.donorId && !!email && norm(d.donorEmail) === email;
}

export function donationsForDonor<T extends DonationLike>(donations: T[], donor: DonorIdentity): T[] {
  return donations.filter((d) => belongsToDonor(d, donor));
}

export interface DonorGiving extends DonationSummary {
  firstDonationDate: string | null;
  lastDonationDate: string | null;
}

export function donorGiving(donations: DonationLike[]): DonorGiving {
  const summary = summarizeDonations(donations);
  const dates = donations
    .filter((d) => donationState(d.status) !== "rejected")
    .map(donationDate)
    .filter((d): d is Date => !!d)
    .sort((a, b) => a.getTime() - b.getTime());
  return {
    ...summary,
    firstDonationDate: dates[0]?.toISOString() ?? null,
    lastDonationDate: dates[dates.length - 1]?.toISOString() ?? null,
  };
}

/** Giving summary for every donor, computed in one pass over the donations. */
export function givingByDonor(donations: DonationLike[], donors: DonorIdentity[]): Map<string, DonorGiving> {
  const byId = new Map<string, DonationLike[]>();
  const byEmail = new Map<string, DonationLike[]>();
  for (const d of donations) {
    if (d.donorId) {
      if (!byId.has(d.donorId)) byId.set(d.donorId, []);
      byId.get(d.donorId)!.push(d);
    } else if (norm(d.donorEmail)) {
      const key = norm(d.donorEmail);
      if (!byEmail.has(key)) byEmail.set(key, []);
      byEmail.get(key)!.push(d);
    }
  }
  const out = new Map<string, DonorGiving>();
  for (const donor of donors) {
    const own = [...(byId.get(donor.id) || []), ...(norm(donor.email) ? byEmail.get(norm(donor.email)) || [] : [])];
    out.set(donor.id, donorGiving(own));
  }
  return out;
}

// ─── Causes ──────────────────────────────────────────────────────────────

/**
 * The cause a donation counts towards: its stored causeId when that cause
 * exists, otherwise the cause whose title matches the donation's cause title
 * (the same matching the donation intake has always used). Returns null for
 * general / unattributed donations.
 */
export function resolveCauseId(d: DonationLike, causes: CauseLike[]): string | null {
  if (d.causeId && causes.some((c) => c.id === d.causeId)) return d.causeId;
  const title = norm(d.causeTitle);
  if (!title) return null;
  const titled = causes.map((c) => ({ id: c.id, t: norm(c.title || c.name) })).filter((c) => c.t);
  const exact = titled.find((c) => c.t === title);
  if (exact) return exact.id;
  const partial = titled.find((c) => c.t.includes(title) || title.includes(c.t));
  return partial ? partial.id : null;
}

export interface CauseFunding extends DonationSummary {
  contributorCount: number;
}

/** Funding per cause id; donations that match no cause are reported under `unattributed`. */
export function fundingByCause(donations: DonationLike[], causes: CauseLike[]): { byCause: Map<string, CauseFunding>; unattributed: DonationSummary } {
  const byCause = new Map<string, CauseFunding>();
  const contributors = new Map<string, Set<string>>();
  for (const c of causes) {
    byCause.set(c.id, { ...emptySummary(), contributorCount: 0 });
    contributors.set(c.id, new Set());
  }
  const unattributed = emptySummary();
  for (const d of donations) {
    const causeId = resolveCauseId(d, causes);
    if (!causeId) {
      addTo(unattributed, d);
      continue;
    }
    addTo(byCause.get(causeId)!, d);
    if (donationState(d.status) === "received") contributors.get(causeId)!.add(d.donorId || norm(d.donorEmail) || String(d.id));
  }
  for (const [id, set] of contributors) byCause.get(id)!.contributorCount = set.size;
  return { byCause, unattributed };
}
