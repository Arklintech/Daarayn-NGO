import { causeRepository } from "../repositories/causeRepository";
import { programContentRepository } from "./programContent";
import { domainOf } from "./programDomains";

export interface PublicStats {
  /** Causes whose lifecycle status is Completed (the existing canonical completion state), each cause counted once by its permanent id. */
  casesCompleted: number;
  /** Published (Active or Urgent) Masjid Infrastructure projects. */
  masjidProjects: number;
  /** Not derivable: no sponsorship record exists in the data model, so no number is ever invented. */
  studentsSponsored: null;
  generatedAt: string;
}

// Kept on globalThis: Next bundles every route separately, so a module-level variable would not be shared between the admin save route
// (which invalidates) and the public stats route (which reads).
const TTL_MS = 30_000;
const holder = (): { cache: { at: number; value: PublicStats } | null } => ((globalThis as any).__daaraynPublicStats ??= { cache: null });

export function invalidatePublicStats() {
  holder().cache = null;
}

/** Aggregate counts only, computed from the persisted Causes and Program_Content rows. Throws if the source cannot be read (never zeros). */
export async function getPublicStats(now = Date.now()): Promise<PublicStats> {
  const h = holder();
  if (h.cache && now - h.cache.at < TTL_MS) return h.cache.value;
  // Read fresh: the repositories' own caches are per route bundle and may predate an admin save made through another route.
  const [causes, contents] = await Promise.all([causeRepository.getAll(true), programContentRepository.getAll(true)]);
  const template = new Map(contents.map((c) => [c.id, c.template]));
  const completed = new Set<string>();
  const seen = new Set<string>();
  let masjid = 0;
  for (const c of causes) {
    if (!c.id || seen.has(c.id)) continue; // a duplicated id is one case
    seen.add(c.id);
    const status = String(c.status || "").trim().toLowerCase();
    if (status === "completed") completed.add(c.id);
    if ((status === "active" || status === "urgent") && domainOf(template.get(c.id) || "custom") === "masjid") masjid++;
  }
  const value: PublicStats = { casesCompleted: completed.size, masjidProjects: masjid, studentsSponsored: null, generatedAt: new Date(now).toISOString() };
  h.cache = { at: now, value };
  return value;
}
