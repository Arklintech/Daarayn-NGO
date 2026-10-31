import { requireAdmin } from "@/lib/server/auth";
import { NextRequest, NextResponse } from "next/server";
import { donationRepository, DonationWriteError } from "@/lib/repositories/donationRepository";
import { auditLogRepository } from "@/lib/repositories/auditLogRepository";
import { realtimeBroadcaster } from "@/lib/realtime/broadcaster";
import { RealtimeEvent } from "@/lib/realtime/events";
import { canonicalStatus, donationState, DONATION_STATUSES, type DonationStatus } from "@/lib/donations/metrics";
import { withDonationBalanceLock, assertNoActiveAllocations, AllocationError } from "@/lib/services/allocationService";
import { donationCauseRepository } from "@/lib/repositories/donationCauseRepository";
import { runWithPriority } from "@/lib/google/requestControl";
import { financialOperationsPaused } from "@/lib/financialActivation";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Sheets/Drive/SMTP calls can outlast the platform default; the allocation lease wait (up to 25 s) can run inside a status change

// In-memory cache with 2-minute TTL
let cachedDonations: any = null;
let cacheTime = 0;
const CACHE_TTL = 2 * 60 * 1000;

export async function GET(request: Request) {
  const adminAuth = await requireAdmin(request);
  if (adminAuth instanceof NextResponse) return adminAuth;

  try {
    const [allDonations, designations] = await Promise.all([donationRepository.getAll(true), donationCauseRepository.getAll(true)]);
    const donations = allDonations.filter((d) => d.id !== "PENDING"); // an unfinished placeholder is not a donation
    const relByDonation = new Map<string, typeof designations>();
    for (const r of designations) {
      if (!relByDonation.has(r.donationId)) relByDonation.set(r.donationId, []);
      relByDonation.get(r.donationId)!.push(r);
    }
    const mapped = donations.map((d) => ({
      causes: (relByDonation.get(d.id) || []).map((r) => ({ causeId: r.causeId, title: r.causeTitle, designatedAmount: r.designatedAmount, designationStatus: r.designationStatus })),
      opStatus: d.opStatus || "complete",
      opPending: d.opPending || "",
      id: d.id,
      donationId: d.id,
      donorId: d.donorId,
      donorEmail: d.donorEmail || "",
      donor: d.donorName || "Generous Donor",
      amount: Number(d.amount || 0),
      currency: d.currency || "INR",
      causeId: d.causeId || "",
      cause: (relByDonation.get(d.id) || []).length > 1 ? (relByDonation.get(d.id) || []).map((r) => r.causeTitle).join(", ") : d.causeTitle || "General Support",
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

    // Cache successful response
    cachedDonations = { success: true, donations: mapped, duplicateIds, readAt: new Date().toISOString() };
    cacheTime = Date.now();

    return NextResponse.json(cachedDonations, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    console.error("[AdminDonationsAPI] Failed to get donations from Google Sheets:", error?.message);

    // Return cached data if available
    if (cachedDonations && Date.now() - cacheTime < CACHE_TTL) {
      return NextResponse.json({
        ...cachedDonations,
        cached: true,
        cacheAge: Date.now() - cacheTime
      }, { headers: { "Cache-Control": "no-store" } });
    }

    // No cache: report the failure. An empty list is never presented as a successful result.
    return NextResponse.json({ success: false, error: "Donations could not be read from Google Sheets.", donations: [], duplicateIds: [] }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

async function PATCH_handler(req: NextRequest) {
  const adminAuth = await requireAdmin(req);
  if (adminAuth instanceof NextResponse) return adminAuth;
  if (financialOperationsPaused()) return NextResponse.json({ error: "Donation changes are paused in this environment until financial activation is approved.", paused: true }, { status: 503 });

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
    // 1. Persist to the authoritative sheet (fails rather than guessing on missing or duplicate ids).
    // EVERY status change of one donation runs under the allocation lease of that donation, and the expected-status comparison happens inside it
    // on a fresh read: two administrators changing the same donation at the same moment are serialised, the second one is told the status has
    // changed (409) instead of silently overwriting the first. Leaving the verified state is also refused while active allocations exist.
    const leavesVerified = donationState(status) !== "received";
    const { before, after, changed } = await withDonationBalanceLock(id, async () => {
      if (leavesVerified) await assertNoActiveAllocations(id, "Changing the status of this donation");
      return donationRepository.updateStatus(id, status, expectedStatus);
    });

    if (!changed) {
      return NextResponse.json({ success: true, id, status, previousStatus: canonicalStatus(before.status), changed: false });
    }

    // 2. Audit trail of who changed what
    try {
      await auditLogRepository.append({
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
    if (error instanceof AllocationError) {
      return NextResponse.json({ success: false, error: error.message, code: error.httpStatus === 409 ? "ACTIVE_ALLOCATIONS" : "BUSY" }, { status: error.httpStatus, ...(error.httpStatus === 503 ? { headers: { "Retry-After": "5" } } : {}) });
    }
    console.error("[AdminDonationsAPI] Update error:", error);
    return NextResponse.json({ success: false, error: `The change was not saved: ${error.message}` }, { status: 503 });
  }
}

/* D29: request priority for the shared Google budget (P0/P1 financial, P3 public catalogue). */
export const PATCH = (...args: Parameters<typeof PATCH_handler>) => runWithPriority("P1", () => PATCH_handler(...args));
