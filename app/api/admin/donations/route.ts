import { NextRequest, NextResponse } from "next/server";
import { donationRepository } from "@/lib/repositories/donationRepository";
import { realtimeBroadcaster } from "@/lib/realtime/broadcaster";
import { db } from "@/lib/firebase";
import { doc, updateDoc } from "firebase/firestore";

export async function GET() {
  try {
    const donations = await donationRepository.getAll();
    const mapped = donations.map((d: any) => ({
      id: d.trackingId || d.id,
      donationId: d.id,
      donor: d.donorName || "Generous Donor",
      amount: Number(d.amount || 0),
      cause: d.causeName || d.causeTitle || (d.selectedCauses?.[0]?.causeName) || "General Support",
      date: d.date || (d.createdAt ? new Date(d.createdAt).toLocaleDateString("en-IN") : "Recent"),
      createdAt: d.date || d.createdAt,
      status: d.status || "completed",
      refCode: d.transactionReference || d.transactionRef || "",
      proofDriveFileId: d.proofDriveFileId || "",
      proofUrl: d.proofDriveFileId ? `/api/media/${d.proofDriveFileId}` : null,
      proof: d.proofDriveFileId ? "✓ Verified on Drive" : "⏳ Direct Verification"
    }));

    mapped.sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return dateB - dateA;
    });

    return NextResponse.json({ success: true, donations: mapped });
  } catch (error: any) {
    console.error("[AdminDonationsAPI] Failed to get donations from Google Sheets:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, status } = body;

    if (!id || !status) {
      return NextResponse.json({ success: false, error: "Missing donation id or status" }, { status: 400 });
    }

    // 1. Update in Google Sheets authoritative repository
    await donationRepository.update(id, { status });

    // 2. Safe non-blocking mirror to Firestore
    try {
      const mirrorRef = doc(db, "publicLedger", id);
      await Promise.race([
        updateDoc(mirrorRef, {
          status,
          proof: status === "completed" ? "✅ Verified & Checked" : "❌ Rejected / Refuted"
        }),
        new Promise(res => setTimeout(res, 1200))
      ]);
    } catch {}

    // 3. Emit realtime event
    realtimeBroadcaster.broadcast("DONATION_STATUS_UPDATED", { id, status });

    return NextResponse.json({ success: true, id, status });
  } catch (error: any) {
    console.error("[AdminDonationsAPI] Update error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
