import { revalidatePath, revalidateTag } from "next/cache";
import { causeRepository } from "../repositories/causeRepository";
import { invalidatePublicCatalog } from "./public";
import { invalidatePublicPrograms } from "./programs";
import { invalidatePublicStats } from "./stats";
import { CATALOG_TAG } from "./publicClient";

/**
 * Run after ANY successful change to a program, campaign, cause or gallery. Drops this instance's caches, then asks Next to
 * regenerate the public pages that show catalog data (data tag, list pages, detail pages, home, sitemap). The Sheets write
 * has already succeeded when this runs: a failure here returns false so the caller reports "saved, public refresh pending"
 * instead of claiming the public page changed.
 */
export function refreshPublicCatalog(): boolean {
  causeRepository.invalidateCache();
  invalidatePublicCatalog();
  invalidatePublicPrograms();
  invalidatePublicStats();
  try {
    revalidateTag(CATALOG_TAG, { expire: 0 });
    for (const p of ["/", "/programs", "/campaigns", "/causes", "/sitemap.xml"]) revalidatePath(p);
    revalidatePath("/programs/[id]", "page");
    return true;
  } catch (err: any) {
    console.error("[Catalog] Saved, but the public pages could not be refreshed:", err?.message);
    return false;
  }
}
