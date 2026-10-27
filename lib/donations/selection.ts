/**
 * lib/donations/selection.ts
 *
 * Turns whatever the browser sent as "selected causes" into a validated list of catalog causes. The browser is not
 * trusted: any amounts or percentages it sends are DISCARDED (a selection is not an allocation, and the old form
 * invented an equal split). Unknown or non-selectable causes are rejected; they are never guessed or replaced.
 */
import type { Cause } from "../repositories/causeRepository";
import { isSelectableCause } from "../catalog/causes";

import { GENERAL_CAUSE_ID } from "./causeToggle";
export { GENERAL_CAUSE_ID };

export interface NormalizedSelection {
  /** Catalog causes the donor chose. Empty = general / unrestricted donation. */
  causes: { causeId: string; causeTitle: string }[];
  general: boolean;
}

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

export function normalizeSelection(raw: unknown, catalog: Cause[], fallbackTitle = ""): NormalizedSelection {
  const items: unknown[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const chosen = new Map<string, { causeId: string; causeTitle: string }>();
  let general = false;
  const problems: string[] = [];

  for (const item of items) {
    const id = typeof item === "string" ? item : String((item as any)?.causeId ?? "");
    const name = typeof item === "string" ? item : String((item as any)?.causeName ?? (item as any)?.causeTitle ?? "");
    if (norm(id) === GENERAL_CAUSE_ID || (!id && /^general/i.test(name))) {
      general = true;
      continue;
    }
    // Resolve by permanent id first, then by exact title (older clients). Never by fuzzy match.
    const cause = catalog.find((c) => c.id === id) ?? (name ? catalog.find((c) => norm(c.title) === norm(name)) : undefined);
    if (!cause) {
      problems.push(`Unknown cause "${id || name}".`);
      continue;
    }
    if (!isSelectableCause(cause)) {
      problems.push(`"${cause.title}" is not open for donations (status ${cause.status}).`);
      continue;
    }
    chosen.set(cause.id, { causeId: cause.id, causeTitle: cause.title });
  }
  if (problems.length) throw new SelectionError(problems.join(" "));

  void fallbackTitle;
  const causes = [...chosen.values()];
  return { causes, general: causes.length === 0 };
}

export class SelectionError extends Error {}
