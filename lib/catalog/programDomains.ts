/**
 * The two management experiences of the Programs module. The domain is derived from the page template, so no second catalog
 * or schema column exists: the "project" template is a Masjid Infrastructure project (needs, evidence updates), every other
 * template is a General Cause. Financial identity is unchanged: one permanent Causes-row id per program in both domains.
 */
import type { ProgramTemplate } from "./programContentSchema";

export type ProgramDomain = "masjid" | "general";

export const domainOf = (template: string): ProgramDomain => (template === "project" ? "masjid" : "general");

export const DOMAIN_LABEL: Record<ProgramDomain, string> = { masjid: "Masjid Infrastructure", general: "General Causes" };

export const GENERAL_TEMPLATES: ProgramTemplate[] = ["relief", "endowment", "custom"];

/** A Masjid project with no verified update for this many days is shown as on hold (review) until one is recorded. */
export const MASJID_UPDATE_WINDOW_DAYS = 7;

export type UpdateState = "none" | "current" | "overdue";

/** Pure: derived from the persisted timestamp and the clock, never stored. Exactly 7.0 days is still current; later is overdue. */
export function masjidUpdateState(lastUpdateAt: string, now: Date = new Date()): { state: UpdateState; daysSince: number | null } {
  const at = Date.parse(lastUpdateAt || "");
  if (Number.isNaN(at)) return { state: "none", daysSince: null };
  const ms = now.getTime() - at;
  const days = Math.max(0, Math.floor(ms / 86_400_000));
  return { state: ms > MASJID_UPDATE_WINDOW_DAYS * 86_400_000 ? "overdue" : "current", daysSince: days };
}

/**
 * Hold rule: a Masjid project whose newest verified-update reference (last recorded update, or the moment an administrator
 * cleared a hold, whichever is later) is MORE than 7 days old is on hold: still visible, but closed to new donations until
 * an administrator clears the hold. A project that never had an update is not held (there is nothing to age); it is shown
 * as "not yet shown as verified".
 */
export function masjidHoldState(c: { template: string; lastUpdateAt?: string; holdClearedAt?: string }, now: Date = new Date()): { held: boolean; daysSince: number | null } {
  if (domainOf(c.template) !== "masjid") return { held: false, daysSince: null };
  const t = Math.max(Date.parse(c.lastUpdateAt || "") || 0, Date.parse(c.holdClearedAt || "") || 0);
  if (!t) return { held: false, daysSince: null };
  const ms = now.getTime() - t;
  return { held: ms > MASJID_UPDATE_WINDOW_DAYS * 86_400_000, daysSince: Math.max(0, Math.floor(ms / 86_400_000)) };
}
