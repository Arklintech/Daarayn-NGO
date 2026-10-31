import { requireAdmin } from "@/lib/server/auth";
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { CATALOG_TAG } from "@/lib/catalog/publicClient";
import { causeRepository } from "@/lib/repositories/causeRepository";
import { saveCause, CatalogError } from "@/lib/catalog/causes";
import { getPublicCatalog, invalidatePublicCatalog, loadFunding, toCatalogItem, type CatalogItem } from "@/lib/catalog/public";
import { realtimeBroadcaster } from "@/lib/realtime/broadcaster";
import { RealtimeEvent } from "@/lib/realtime/events";
import { runWithPriority } from "@/lib/google/requestControl";

export const dynamic = "force-dynamic";
export const maxDuration = 30; // Sheets/Drive/SMTP calls can outlast the platform default

/**
 * The shared catalog. Public callers (donation form, ribbon) receive only causes that are open for donations
 * (Active or Urgent) in a public-safe shape. An authenticated admin receives every cause with its lifecycle
 * status. There is no seeding and no hardcoded fallback: if the catalog cannot be read, the error is reported.
 */
async function GET_handler(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  // ?scope=public always returns the public view, even to a signed-in administrator: the donation form and ribbon must never offer
  // a Draft, Completed or Inactive entry just because the visitor happens to be an admin.
  const admin = params.get("scope") === "public" ? null : await requireAdmin(request);
  const isAdmin = admin !== null && !(admin instanceof NextResponse);
  const kind = params.get("kind");

  try {
    let items: CatalogItem[];
    if (isAdmin) {
      const all = await causeRepository.getAll();
      const funding = await loadFunding(all);
      items = all.map((c) => toCatalogItem(c, funding));
    } else {
      items = await getPublicCatalog();
    }
    if (kind) items = items.filter((i) => i.kind === kind);
    return NextResponse.json(items, { headers: { "Cache-Control": isAdmin ? "no-store" : "public, s-maxage=10, stale-while-revalidate=60", "X-Generated-At": new Date().toISOString() } });
  } catch (error: any) {
    console.error("[API/Causes] Error retrieving causes:", error);
    return NextResponse.json({ error: "The cause catalog could not be read from Google Sheets." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: NextRequest) {
  const adminAuth = await requireAdmin(request);
  if (adminAuth instanceof NextResponse) return adminAuth;

  try {
    const body = await request.json();
    const { cause, created } = await saveCause(body, adminAuth.email);
    causeRepository.invalidateCache();
    invalidatePublicCatalog();
    realtimeBroadcaster.broadcast(RealtimeEvent.CAUSE_UPDATED, { id: cause.id });
    // The record is persisted in Google Sheets. `public` states what visitors will now see, so the admin screen never has to guess.
    const open = cause.status === "Active" || cause.status === "Urgent";
    // The Sheets write is done. Refreshing the generated public pages is a separate step: if it fails the data is still saved
    // and the response says so, so the admin never reads "published" for something visitors cannot see yet.
    let revalidated = true;
    try {
      revalidateTag(CATALOG_TAG, { expire: 0 }); // the data every public page reads
      for (const p of ["/", "/programs", "/campaigns", "/causes"]) revalidatePath(p);
      revalidatePath("/causes/[id]", "page");
    } catch (err: any) {
      revalidated = false;
      console.error(`[API/Causes] Saved ${cause.id} but could not refresh the public pages:`, err?.message);
    }
    return NextResponse.json({ success: true, cause, created, publication: { persisted: true, publicVisible: open, publicPagesRefreshed: revalidated, publicPath: open ? `/causes/${cause.id}` : null, refresh: "This instance serves the change immediately; other instances and the CDN within about a minute." } });
  } catch (error: any) {
    if (error instanceof CatalogError) {
      return NextResponse.json({ error: error.message }, { status: error.httpStatus });
    }
    console.error("[API/Causes] Error saving cause:", error);
    return NextResponse.json({ error: "Failed to persist cause." }, { status: 500 });
  }
}

/* D29: request priority for the shared Google budget (P0/P1 financial, P3 public catalogue). */
export const GET = (...args: Parameters<typeof GET_handler>) => runWithPriority("P3", () => GET_handler(...args));
