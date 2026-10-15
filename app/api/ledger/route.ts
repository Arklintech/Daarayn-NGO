import { requireAdmin } from "@/lib/server/auth";
import { NextResponse } from "next/server";
import { donationRepository } from "@/lib/repositories/donationRepository";
import { canonicalStatus } from "@/lib/donations/metrics";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const adminAuth = await requireAdmin(request);
  if (adminAuth instanceof NextResponse) return adminAuth;

  try {
    const donations = await donationRepository.getAll(true);
    const ledger = donations.map((d) => ({
      id: d.id,
      donationId: d.id,
      donorId: d.donorId,
      donor: d.donorName || "Generous Donor",
      amount: Number(d.amount || 0),
      cause: d.causeTitle || "General Support",
      date: d.date ? new Date(d.date).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }) : "—",
      createdAt: d.date,
      status: canonicalStatus(d.status),
      refCode: d.transactionReference || "",
      proofDriveFileId: d.proofDriveFileId || "",
      proofUrl: d.proofDriveFileId ? `/api/media/${d.proofDriveFileId}` : null,
      proof: d.proofDriveFileId ? "✓ Verified on Drive" : "⏳ Direct Verification",
    }));

    ledger.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    const response = NextResponse.json(ledger);
    response.headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
    return response;
  } catch (error: any) {
    console.error("[LedgerAPI] Failed to fetch donations from Google Sheets:", error);
    return NextResponse.json({ error: "Failed to read contribution ledger." }, { status: 503 });
  }
}
