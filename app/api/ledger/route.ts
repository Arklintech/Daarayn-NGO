import { NextResponse } from "next/server";
import { donationRepository } from "@/lib/repositories/donationRepository";

export async function GET() {
  try {
    const donations = await donationRepository.getAll();
    const ledger = donations.map((d: any) => ({
      id: d.trackingId || d.id,
      donationId: d.id,
      donor: d.donorName || "Generous Donor",
      amount: Number(d.amount || 0),
      cause: d.causeName || (d.selectedCauses?.[0]?.causeName) || "General Support",
      date: d.createdAt ? new Date(d.createdAt).toLocaleDateString("en-IN") : "Recent",
      createdAt: d.createdAt,
      status: d.status || "completed",
      refCode: d.transactionRef || "",
      proofDriveFileId: d.proofDriveFileId || "",
      proofUrl: d.proofDriveFileId ? `/api/media/${d.proofDriveFileId}` : null,
      proof: d.proofDriveFileId ? "✓ Verified on Drive" : "⏳ Direct Verification"
    }));

    // Sort descending by creation date or ID
    ledger.sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return dateB - dateA;
    });

    const response = NextResponse.json(ledger);
    response.headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
    return response;
  } catch (error: any) {
    console.error("[LedgerAPI] Failed to fetch donations from Google Sheets:", error);
    return NextResponse.json({ error: "Failed to read contribution ledger." }, { status: 500 });
  }
}
export const dynamic = 'force-dynamic';

