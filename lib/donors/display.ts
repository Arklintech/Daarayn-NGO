/**
 * lib/donors/display.ts
 *
 * What the admin donor profile says about a donation or a message, derived from the stored records only. Browser-safe
 * (no server imports). The rule: a label states what the record proves and nothing more, so "Verified" needs a
 * verified donation and SMTP acceptance is never called delivery.
 */
import { donationState } from "../donations/metrics";

export type Tone = "good" | "wait" | "bad";

export function donationBadge(status: unknown): { label: string; tone: Tone } {
  const state = donationState(status);
  if (state === "received") return { label: "Verified", tone: "good" };
  if (state === "rejected") return { label: "Rejected", tone: "bad" };
  if (state === "pending") return { label: "Pending verification", tone: "wait" };
  return { label: "Status unknown", tone: "wait" };
}

/** Recipient-level outcomes as stored (queued | attempted | smtp_accepted | failed | unresolved). */
export function communicationOutcome(status: unknown): { label: string; tone: Tone; note: string } {
  switch (String(status || "").toLowerCase()) {
    case "smtp_accepted":
      return { label: "Accepted by mail server", tone: "good", note: "The mail server accepted it. This is not confirmation that it reached the inbox." };
    case "failed":
      return { label: "Failed", tone: "bad", note: "The mail server rejected it or it could not be sent." };
    case "unresolved":
      return { label: "Outcome unknown", tone: "wait", note: "The connection broke after sending; it may or may not have been accepted. Not resent automatically." };
    case "queued":
      return { label: "Queued", tone: "wait", note: "Recorded and waiting to be sent." };
    case "attempted":
      return { label: "Attempted", tone: "wait", note: "A send was started; no result is recorded yet." };
    default:
      return { label: "No outcome recorded", tone: "wait", note: "" };
  }
}

interface DesignationLike {
  causeId?: string;
  title?: string;
  causeTitle?: string;
  designationStatus?: string;
  designatedAmount?: number | null;
}

export function donationCauseLabel(donation: { causes?: DesignationLike[] | null }): string {
  const rows = donation.causes || [];
  if (rows.length === 0) return "Unrestricted (where most needed)";
  const names = rows.map((r) => r.title || r.causeTitle || r.causeId || "Unknown cause");
  const unresolved = rows.some((r) => r.designationStatus === "unresolved");
  return unresolved ? `${names.join(", ")} (split not recorded)` : names.join(", ");
}

/** Distinct causes that received a VERIFIED donation from this donor. */
export function supportedCauseCount(donations: { status?: unknown; causes?: { causeId?: string }[] | null }[]): number {
  const ids = new Set<string>();
  for (const d of donations) {
    if (donationState(d.status) !== "received") continue;
    for (const c of d.causes || []) if (c.causeId) ids.add(c.causeId);
  }
  return ids.size;
}
