/**
 * lib/catalog/public.ts
 *
 * The public view of the catalog (Causes tab: causes, programs and campaigns share it, told apart by `kind`).
 * Public visitors see only entries that are OPEN (Active or Urgent). Draft, Completed and Inactive entries are never
 * public; their records, donations, designations and allocations stay untouched. Used by /api/causes (public callers)
 * and by the public pages so they all show the same thing.
 *
 * There is no hardcoded fallback: when Google Sheets cannot be read the callers get an error and say so.
 * Refresh behaviour: a successful admin save invalidates this cache on the writing instance immediately; other
 * instances pick the change up when their copy expires (PUBLIC_TTL_MS), and the HTTP layer adds a short CDN window.
 */
import { causeRepository, type Cause } from "../repositories/causeRepository";
import { donationRepository } from "../repositories/donationRepository";
import { donationCauseRepository } from "../repositories/donationCauseRepository";
import { fundingByDesignation } from "../donations/metrics";
import { isSelectableCause } from "./causes";
import { getHeldProgramIds } from "./holds";

export const PUBLIC_TTL_MS = 10_000;

export interface CatalogItem {
  id: string;
  title: string;
  name: string;
  category: string;
  kind: string;
  targetAmount: number;
  raisedAmount: number;
  recordedRaisedAmount: number;
  raisedSource: "verified_designations" | "recorded";
  supporters?: number;
  location: string;
  description: string;
  status: string;
  imageUrl: string;
}

type Funding = ReturnType<typeof fundingByDesignation>;

/** Raised = VERIFIED donations explicitly designated to the cause (never the whole of a multi-cause donation). */
export async function loadFunding(all: Cause[]): Promise<Funding | null> {
  try {
    return fundingByDesignation(await donationRepository.getAll(), await donationCauseRepository.getAll(), all);
  } catch (err: any) {
    console.error("[Catalog] Donations unavailable, using recorded raised amounts:", err.message);
    return null;
  }
}

export function toCatalogItem(c: Cause, funding: Funding | null): CatalogItem {
  return {
    id: c.id,
    title: c.title,
    name: c.title,
    category: c.category,
    kind: c.kind || "cause",
    targetAmount: c.targetAmount,
    raisedAmount: funding ? funding.byCause.get(c.id)?.designatedReceived ?? 0 : c.raisedAmount,
    recordedRaisedAmount: c.raisedAmount,
    raisedSource: funding ? "verified_designations" : "recorded",
    supporters: funding ? funding.byCause.get(c.id)?.contributorCount ?? 0 : undefined,
    location: c.location,
    description: c.description,
    status: c.status,
    imageUrl: c.imageUrl || (c.driveFileId ? `/api/media/${c.driveFileId}` : ""),
  };
}

let cache: { at: number; items: CatalogItem[] } | null = null;
let inflight: Promise<CatalogItem[]> | null = null;

/** Open entries only (Active, Urgent), newest first. Throws when the catalog cannot be read. */
export async function getPublicCatalog(now = Date.now()): Promise<CatalogItem[]> {
  if (cache && now - cache.at < PUBLIC_TTL_MS) return cache.items;
  if (inflight) return inflight;
  const load = (async () => {
    const all = await causeRepository.getAll();
    const funding = await loadFunding(all);
    const held = await getHeldProgramIds();
    const items = all
      .filter(isSelectableCause)
      .filter((c) => !held.has(c.id))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map((c) => toCatalogItem(c, funding));
    cache = { at: Date.now(), items };
    return items;
  })();
  inflight = load;
  try {
    return await load;
  } finally {
    if (inflight === load) inflight = null;
  }
}

/** One open entry by its permanent id, or null (not found, or not open to the public). */
export async function getPublicItem(id: string): Promise<CatalogItem | null> {
  return (await getPublicCatalog()).find((i) => i.id === id) ?? null;
}

/** Called after a successful admin write so this instance serves the change on the next request. */
export function invalidatePublicCatalog() {
  cache = null;
}
