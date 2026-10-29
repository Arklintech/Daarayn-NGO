import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { causeRepository } from "@/lib/repositories/causeRepository";
import { auditLogRepository } from "@/lib/repositories/auditLogRepository";
import { programContentRepository } from "@/lib/catalog/programContent";
import { masjidHoldState } from "@/lib/catalog/programDomains";
import { serverNow } from "@/lib/catalog/clock";
import { refreshPublicCatalog } from "@/lib/catalog/publish";

export const dynamic = "force-dynamic";

/**
 * Clear the update-overdue hold of one Masjid project (body: { programId, reason }). Administrator only. Only a project that is
 * actually on hold can be cleared (409 otherwise). The clearance time and administrator are stored on the project's content row
 * (server clock) and written to the audit log; the update window restarts from that moment. Nothing else changes: donations,
 * designations, allocations and history are untouched.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });
  }
  const programId = String(body?.programId || "").trim();
  const reason = String(body?.reason || "").trim().slice(0, 300);
  if (!programId) return NextResponse.json({ success: false, error: "programId is required." }, { status: 400 });
  if (reason.length < 5) return NextResponse.json({ success: false, error: "A reason (at least 5 characters) is required to clear a hold." }, { status: 400 });
  try {
    const content = (await programContentRepository.getAll(true)).find((c) => c.id === programId);
    if (!content) return NextResponse.json({ success: false, error: "That program does not exist." }, { status: 404 });
    if (!masjidHoldState(content, serverNow()).held) return NextResponse.json({ success: false, error: "This project is not on hold." }, { status: 409 });
    const now = serverNow().toISOString();
    await programContentRepository.save({ ...content, holdClearedAt: now, holdClearedBy: admin.email });
    programContentRepository.invalidateCache();
    try {
      const cause = (await causeRepository.getAll()).find((c) => c.id === programId);
      await auditLogRepository.append({
        id: `AUDIT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        actor_id: admin.email,
        actor_role: "admin",
        action: "CLEAR_PROJECT_HOLD",
        entity_type: "Cause",
        entity_id: programId,
        before_state: { hold: "on_hold", lastUpdateAt: content.lastUpdateAt, title: cause?.title },
        after_state: { hold: "cleared", holdClearedAt: now, reason },
        timestamp: now,
        source: "admin_catalog",
      });
    } catch (err: any) {
      console.error(`[Hold] audit for ${programId} failed:`, err?.message);
    }
    const refreshed = refreshPublicCatalog();
    return NextResponse.json({ success: true, holdClearedAt: now, publication: { persisted: true, publicPagesRefreshed: refreshed } });
  } catch (err: any) {
    console.error("[API/ProgramHold]", err?.message);
    return NextResponse.json({ success: false, error: "The hold could not be cleared in Google Sheets. Nothing was changed." }, { status: 500 });
  }
}
