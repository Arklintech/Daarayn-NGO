import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { CatalogError } from "@/lib/catalog/causes";
import { getAdminPrograms, invalidatePublicPrograms, saveProgram, PartialSaveError } from "@/lib/catalog/programs";
import { refreshPublicCatalog } from "@/lib/catalog/publish";
import { realtimeBroadcaster } from "@/lib/realtime/broadcaster";
import { RealtimeEvent } from "@/lib/realtime/events";

export const dynamic = "force-dynamic";
export const maxDuration = 30; // Sheets calls can outlast the platform default

/** Every program (any status) with its page content. Administrators only. */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  try {
    return NextResponse.json(await getAdminPrograms(), { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    console.error("[API/AdminPrograms] read failed:", error?.message);
    return NextResponse.json({ error: "The programs could not be read from Google Sheets." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

/** Create or update a program (content + its cause, one permanent id). Never reports success unless both are stored. */
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const { cause, created } = await saveProgram(body, admin.email);
    realtimeBroadcaster.broadcast(RealtimeEvent.CAUSE_UPDATED, { id: cause.id });

    const open = cause.status === "Active" || cause.status === "Urgent";
    // The Sheets writes are done. Refreshing generated public pages is a separate step; if it fails the data is still saved
    // and the response says so, so the screen never claims the public page changed when it may not have.
    const revalidated = refreshPublicCatalog();
    return NextResponse.json({
      success: true,
      cause,
      created,
      publication: { persisted: true, publicVisible: open, publicPath: open ? `/programs/${cause.id}` : null, publicPagesRefreshed: revalidated },
    });
  } catch (error: any) {
    if (error instanceof CatalogError) return NextResponse.json({ error: error.message }, { status: error.httpStatus });
    if (error instanceof PartialSaveError) {
      invalidatePublicPrograms();
      return NextResponse.json({ error: error.message, partial: true, causeId: error.causeId, contentSaved: error.contentSaved }, { status: 500 });
    }
    console.error("[API/AdminPrograms] save failed:", error?.message);
    return NextResponse.json({ error: "Failed to save the program." }, { status: 500 });
  }
}
