/**
 * lib/intake/status.ts  (D37, ISOLATED): donor-facing status of a submission, and queue metrics for operations.
 */
import { sheetsService } from "../google/sheets";
import { INTAKE_SHEET, parseIntakeRow, WORKING_STATES, type IntakeEntry } from "./schema";

export interface DonorFacingStatus {
  reference: string;
  state: string;
  /** The permanent donation number: shown only once it has been assigned. */
  donationId?: string;
  /** True ONLY when the donation is COMPLETE. */
  final: boolean;
  message: string;
}

export function donorFacingStatus(e: IntakeEntry): DonorFacingStatus {
  const base = { reference: e.submissionRef, state: e.state };
  switch (e.state) {
    case "COMPLETE":
      return { ...base, donationId: e.donationId, final: true, message: `Your donation ${e.donationId} has been recorded. Thank you.` };
    case "ID_ASSIGNED":
      return { ...base, donationId: e.donationId, final: false, message: `Your donation number is ${e.donationId}. We are finishing recording it; this is not yet your final confirmation.` };
    case "REJECTED":
      return { ...base, state: "REJECTED", final: false, message: "We could not accept this submission. Nothing was recorded. Please submit again or contact us with your reference." };
    case "FAILED_REQUIRES_REVIEW":
      return { ...base, final: false, message: "Your submission is being reviewed by our team. You do not need to submit it again. Keep your reference." };
    case "RETRY_PENDING":
      return { ...base, state: "RECEIVED", final: false, message: "We have received your submission and are still processing it. It has not been recorded as a donation yet." };
    default:
      return { ...base, state: "RECEIVED", final: false, message: "We have received your submission. It has not been recorded as a donation yet; your donation number will follow." };
  }
}

/** One read. The canonical row of a reference is the earliest row that carries it. */
export async function getIntakeStatus(reference: string): Promise<DonorFacingStatus | null> {
  const snap = await sheetsService.getRowsWithNumbers(INTAKE_SHEET);
  const rows = (snap.rows as { rowNumber: number; record: Record<string, any> }[]).filter((r) => String(r.record.submissionRef) === reference).sort((a, b) => a.rowNumber - b.rowNumber);
  if (rows.length === 0) return null;
  return donorFacingStatus(parseIntakeRow(rows[0].rowNumber, rows[0].record));
}

export interface QueueMetrics {
  depth: number;
  byState: Record<string, number>;
  oldestPendingAgeSec: number;
  retryTotal: number;
  needsReview: number;
  /** Pending rows older than the threshold: the "no indefinite pending records" alarm. */
  stale: number;
}

export function computeQueueMetrics(entries: IntakeEntry[], now = Date.now(), staleAfterSec = 900): QueueMetrics {
  const byState: Record<string, number> = {};
  let depth = 0;
  let oldest = 0;
  let stale = 0;
  let retryTotal = 0;
  for (const e of entries) {
    byState[e.state] = (byState[e.state] || 0) + 1;
    retryTotal += e.retryCount;
    if (WORKING_STATES.has(e.state)) {
      depth++;
      const age = Math.max(0, (now - new Date(e.receivedAt).getTime()) / 1000);
      oldest = Math.max(oldest, age);
      if (age > staleAfterSec) stale++;
    }
  }
  return { depth, byState, oldestPendingAgeSec: Math.round(oldest), retryTotal, needsReview: byState.FAILED_REQUIRES_REVIEW || 0, stale };
}

export interface QueueSnapshot extends QueueMetrics {
  /** Latest completion and latest write of any pass, derived from the rows (nothing extra is stored anywhere). */
  lastCompletedAt: string;
  lastActivityAt: string;
  /** Rows that need a person: references, categories and ages only, never donor data. */
  review: { reference: string; state: string; category: string; retryCount: number; ageSec: number }[];
  /** Rows waiting for the finaliser (RECEIVED, ID_ASSIGNED, RETRY_PENDING), oldest first. */
  waiting: { reference: string; state: string; retryCount: number; ageSec: number }[];
}

/** ONE read of the intake worksheet: metrics plus the lists an operator needs. No personal data leaves this function. */
export async function readQueueSnapshot(now = Date.now(), staleAfterSec = 900): Promise<QueueSnapshot> {
  const snap = await sheetsService.getRowsWithNumbers(INTAKE_SHEET);
  const raw = snap.rows as { rowNumber: number; record: Record<string, any> }[];
  const entries = raw.map((r) => parseIntakeRow(r.rowNumber, r.record));
  const metrics = computeQueueMetrics(entries, now, staleAfterSec);
  const age = (e: IntakeEntry) => Math.max(0, Math.round((now - new Date(e.receivedAt).getTime()) / 1000));
  const latest = (pick: (r: Record<string, any>) => string) => raw.map((r) => pick(r.record)).filter(Boolean).sort().pop() || "";
  return {
    ...metrics,
    lastCompletedAt: latest((r) => String(r.completedAt || "")),
    lastActivityAt: latest((r) => String(r.updatedAt || "")),
    review: entries.filter((e) => e.state === "FAILED_REQUIRES_REVIEW").slice(0, 50).map((e) => ({ reference: e.submissionRef, state: e.state, category: e.lastErrorCategory, retryCount: e.retryCount, ageSec: age(e) })),
    waiting: entries.filter((e) => WORKING_STATES.has(e.state)).sort((a, b) => a.rowNumber - b.rowNumber).slice(0, 50).map((e) => ({ reference: e.submissionRef, state: e.state, retryCount: e.retryCount, ageSec: age(e) })),
  };
}

export async function readQueueMetrics(now = Date.now(), staleAfterSec = 900): Promise<QueueMetrics> {
  const snap = await sheetsService.getRowsWithNumbers(INTAKE_SHEET);
  return computeQueueMetrics((snap.rows as { rowNumber: number; record: Record<string, any> }[]).map((r) => parseIntakeRow(r.rowNumber, r.record)), now, staleAfterSec);
}
