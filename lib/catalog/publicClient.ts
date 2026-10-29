import { headers } from "next/headers";
import type { CatalogItem } from "./public";

/** Cache tag shared by every public page that shows the catalog; the admin save route revalidates it. */
export const CATALOG_TAG = "public-catalog";
export const CATALOG_REVALIDATE_SECONDS = 30;

/**
 * Next keeps serving the last good copy of a cached fetch while Google Sheets is down. That is fine for a short blip but must
 * not turn into stale content presented as current: a response older than this is refused and the page says it is unavailable.
 */
export const maxStaleSeconds = () => Number(process.env.PUBLIC_CATALOG_MAX_STALE_SECONDS) || 600;

function assertFresh(res: Response, what: string) {
  const stamp = Date.parse(res.headers.get("x-generated-at") || "");
  if (Number.isFinite(stamp) && Date.now() - stamp > maxStaleSeconds() * 1000) throw new Error(`${what} data is older than ${maxStaleSeconds()} s; refusing to present it as current`);
}

/**
 * Reads the public catalog for server-rendered pages through the app's own public API (/api/causes), using Next's data
 * cache: a result is reused for CATALOG_REVALIDATE_SECONDS and discarded immediately when an administrator saves
 * (revalidateTag). Google Sheets is only ever touched by the API route, never inside a page render.
 * Throws when the catalog cannot be read, so pages can say so instead of showing invented content.
 */
export async function fetchPublicCatalog(kind?: string): Promise<CatalogItem[]> {
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  const res = await fetch(`${proto}://${host}/api/causes${kind ? `?kind=${encodeURIComponent(kind)}` : ""}`, {
    next: { revalidate: CATALOG_REVALIDATE_SECONDS, tags: [CATALOG_TAG] },
  });
  if (!res.ok) throw new Error(`Catalog unavailable (HTTP ${res.status})`);
  assertFresh(res, "Catalog");
  const body = await res.json();
  if (!Array.isArray(body)) throw new Error("Catalog response was not a list");
  return body as CatalogItem[];
}

export async function fetchPublicItem(id: string): Promise<CatalogItem | null> {
  return (await fetchPublicCatalog()).find((i) => i.id === id) ?? null;
}

import type { ProgramView } from "./programs";

/** Open programs with their page content (same data cache and tag as the catalog). */
export async function fetchPublicPrograms(opts: { id?: string; kind?: string; category?: string } = {}): Promise<ProgramView[]> {
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  const res = await fetch(`${proto}://${host}/api/programs${new URLSearchParams(Object.entries(opts).filter(([, v]) => v) as [string, string][]).toString().replace(/^(?=.)/, "?")}`, {
    next: { revalidate: CATALOG_REVALIDATE_SECONDS, tags: [CATALOG_TAG] },
  });
  if (!res.ok) throw new Error(`Programs unavailable (HTTP ${res.status})`);
  assertFresh(res, "Programs");
  const body = await res.json();
  if (!Array.isArray(body)) throw new Error("Programs response was not a list");
  return body as ProgramView[];
}
