import { requireAdmin } from "@/lib/server/auth";
import { NextRequest, NextResponse } from "next/server";
import { loadSnapshot } from "@/lib/donations/snapshot";
import { donationsForDonor, summarizeDonations } from "@/lib/donations/metrics";

export const dynamic = "force-dynamic";

/**
 * The complete, canonical history of ONE donor from one consistent snapshot: donations (with cause relationships and
 * recorded designations), allocations, recipient-level communication outcomes and audit entries. Totals use the same
 * definitions as the dashboard.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const { id } = await params;
  try {
    const snap = await loadSnapshot(["donations", "donors", "causes", "designations", "allocations", "recipients", "auditLog"]);
    const donor = snap.donors.find((d) => d.id === id);
    if (!donor) return NextResponse.json({ success: false, error: "Donor not found." }, { status: 404 });

    const donations = donationsForDonor(snap.donations.filter((d) => d.id !== "PENDING"), donor);
    const ids = new Set(donations.map((d) => d.id));
    const relations = snap.designations.filter((r) => ids.has(r.donationId));
    const allocations = snap.allocations.filter((a) => ids.has(a.donationId));
    const communications = snap.recipients.filter((r) => r.donorId === donor.id);
    const audit = snap.auditLog.filter((e) => ids.has(e.entity_id) || e.entity_id === donor.id).slice(-50);
    const summary = summarizeDonations(donations);

    return NextResponse.json(
      {
        success: true,
        readAt: snap.readAt,
        donor: { id: donor.id, name: donor.name, email: donor.email, phone: donor.phone, status: donor.status, emailSuppressed: Boolean(donor.emailSuppressed), dateJoined: donor.dateJoined },
        totals: { verifiedAmount: summary.receivedAmount, verifiedCount: summary.receivedCount, pendingAmount: summary.pendingAmount, pendingCount: summary.pendingCount, rejectedCount: summary.rejectedCount },
        donations: donations.map((d) => ({
          id: d.id,
          date: d.date,
          amount: d.amount,
          status: d.status,
          reference: d.transactionReference,
          proofDriveFileId: d.proofDriveFileId || "",
          opStatus: d.opStatus || "complete",
          causes: relations.filter((r) => r.donationId === d.id),
        })),
        causes: [...new Set(relations.map((r) => r.causeId))].map((cid) => ({ causeId: cid, title: snap.causes.find((c) => c.id === cid)?.title || cid })),
        allocations,
        communications,
        audit,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: any) {
    console.error("[DonorHistory] failed:", error?.message);
    return NextResponse.json({ success: false, error: "The donor history could not be read from Google Sheets." }, { status: 503 });
  }
}
