import { requireAdmin } from "@/lib/server/auth";
import { NextRequest, NextResponse } from "next/server";
import { loadSnapshot } from "@/lib/donations/snapshot";
import { findIntegrityExceptions } from "@/lib/reporting/integrity";
import { isIncomplete, outstandingSteps, recoverDonation } from "@/lib/services/donationRecovery";

export const dynamic = "force-dynamic";

/** Integrity exceptions and donations with outstanding follow-up work. Read-only. */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  try {
    const snap = await loadSnapshot(["donations", "donors", "causes", "designations", "allocations"]);
    const exceptions = findIntegrityExceptions(snap);
    const incomplete = snap.donations.filter((d) => d.id !== "PENDING" && isIncomplete(d)).map((d) => ({ id: d.id, status: d.opStatus, outstanding: outstandingSteps(d) }));
    return NextResponse.json({ success: true, readAt: snap.readAt, incomplete, exceptions }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    console.error("[Reconciliation] read failed:", error?.message);
    return NextResponse.json({ success: false, error: "Records could not be read from Google Sheets." }, { status: 503 });
  }
}

/** Finishes interrupted donations. Body: { donationIds?: string[] } (default: every incomplete donation). Idempotent and audited. */
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  try {
    const body = await request.json().catch(() => ({}));
    let ids: string[] = Array.isArray(body.donationIds) ? body.donationIds.map(String) : [];
    if (ids.length === 0) {
      const snap = await loadSnapshot(["donations"]);
      ids = snap.donations.filter((d) => d.id !== "PENDING" && isIncomplete(d)).map((d) => d.id);
    }
    const results: Awaited<ReturnType<typeof recoverDonation>>[] = [];
    for (const id of ids.slice(0, 25)) results.push(await recoverDonation(id, admin.email));
    return NextResponse.json({ success: true, results, truncated: ids.length > 25 });
  } catch (error: any) {
    console.error("[Reconciliation] recovery failed:", error?.message);
    return NextResponse.json({ success: false, error: error?.message || "Recovery failed." }, { status: 500 });
  }
}
