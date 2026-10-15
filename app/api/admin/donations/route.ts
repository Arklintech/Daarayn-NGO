import { requireAdmin } from "@/lib/server/auth";
import { NextRequest, NextResponse } from "next/server";
import { donationRepository, DonationWriteError } from "@/lib/repositories/donationRepository";
import { auditLogRepository } from "@/lib/repositories/auditLogRepository";
import { realtimeBroadcaster } from "@/lib/realtime/broadcaster";
import { RealtimeEvent } from "@/lib/realtime/events";
import { canonicalStatus, DONATION_STATUSES, type DonationStatus } from "@/lib/donations/metrics";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const adminAuth = await requireAdmin(request);
  if (adminAuth instanceof NextResponse) return adminAuth;

  try {
    const donations = await donationRepository.getAll(true);
    const mapped = donations.map((d) => ({
      id: d.id,
      donationId: d.id,
      donorId: d.donorId,
      donorEmail: d.donorEmail || "",
      donor: d.donorName || "Generous Donor",
      amount: Number(d.amount || 0),
      currency: d.currency || "INR",
      causeId: d.causeId || "",
      cause: d.causeTitle || "General Support",
      date: d.date,
      createdAt: d.date,
      status: canonicalStatus(d.status),
      rawStatus: d.status,
      refCode: d.transactionReference || "",
      proofDriveFileId: d.proofDriveFileId || "",
      proofUrl: d.proofDriveFileId ? `/api/media/${d.proofDriveFileId}` : null,
      proof: d.proofDriveFileId ? "✓ Verified on Drive" : "⏳ Direct Verification",
    }));

    mapped.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    // Ids held by more than one row cannot be verified until the sheet is corrected.
    const counts = new Map<string, number>();
    for (const d of mapped) counts.set(d.id, (counts.get(d.id) || 0) + 1);
    const duplicateIds = [...counts].filter(([, n]) => n > 1).map(([id]) => id);

    return NextResponse.json(
      { success: true, donations: mapped, duplicateIds, readAt: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: any) {
    console.error("[AdminDonationsAPI] Failed to get donations from Google Sheets:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 503 });
  }
}

export async function PATCH(req: NextRequest) {
  const adminAuth = await requireAdmin(req);
  if (adminAuth instanceof NextResponse) return adminAuth;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const id = String(body?.id || "").trim();
  const status = String(body?.status || "").trim().toLowerCase() as DonationStatus;
  const expectedStatus = body?.expectedStatus ? String(body.expectedStatus) : undefined;

  if (!id || !status) {
    return NextResponse.json({ success: false, error: "Missing donation id or status" }, { status: 400 });
  }
  if (!DONATION_STATUSES.includes(status)) {
    return NextResponse.json(
      { success: false, error: `Unsupported status "${status}". Use one of: ${DONATION_STATUSES.join(", ")}.` },
      { status: 400 }
    );
  }

  try {
    // 1. Persist to the authoritative sheet (fails rather than guessing on missing or duplicate ids)
    const { before, after, changed } = await donationRepository.updateStatus(id, status, expectedStatus);

    if (!changed) {
      return NextResponse.json({ success: true, id, status, previousStatus: canonicalStatus(before.status), changed: false });
    }

    // 2. Audit trail of who changed what
    try {
      await auditLogRepository.save({
        id: `AUDIT-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        actor_id: adminAuth.email,
        actor_role: "admin",
        action: "UPDATE_DONATION_STATUS",
        entity_type: "Donation",
        entity_id: id,
        before_state: { status: before.status, amount: before.amount },
        after_state: { status: after.status, amount: after.amount },
        timestamp: new Date().toISOString(),
        source: "admin_donations",
      });
    } catch (auditErr: any) {
      console.error(`[AdminDonationsAPI] Audit log for ${id} failed:`, auditErr.message);
    }

    // 3. Only now that the sheet holds the change, tell every connected admin
    const event = await realtimeBroadcaster.publish(RealtimeEvent.DONATION_UPDATED, { id, status });

    return NextResponse.json({
      success: true,
      id,
      status,
      previousStatus: canonicalStatus(before.status),
      changed: true,
      realtime: event.delivered,
    });
  } catch (error: any) {
    if (error instanceof DonationWriteError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code, currentStatus: error.currentStatus },
        { status: error.httpStatus }
      );
    }
    console.error("[AdminDonationsAPI] Update error:", error);
    return NextResponse.json({ success: false, error: `The change was not saved: ${error.message}` }, { status: 503 });
  }
}
