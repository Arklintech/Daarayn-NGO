import { requireAdmin } from "@/lib/server/auth";
import { NextResponse } from "next/server";
import { communicationRecipientRepository } from "@/lib/repositories/communicationRecipientRepository";

export const dynamic = "force-dynamic";

/**
 * Per-recipient communication history (Communication_Recipients tab).
 *   ?donorId=DNR-…       every communication recorded for that Donor Token
 *   ?broadcastId=BCAST-… every recipient outcome of one broadcast
 * Status values: queued, attempted, smtp_accepted, failed. smtp_accepted means the mail
 * server accepted the message; it is not proof of inbox delivery.
 */
export async function GET(request: Request) {
  const adminAuth = await requireAdmin(request);
  if (adminAuth instanceof NextResponse) return adminAuth;

  const { searchParams } = new URL(request.url);
  const donorId = searchParams.get("donorId");
  const broadcastId = searchParams.get("broadcastId");
  if (!donorId && !broadcastId) {
    return NextResponse.json({ success: false, error: "Provide donorId or broadcastId." }, { status: 400 });
  }

  try {
    const all = (await communicationRecipientRepository.readFresh()).map((r) => r.entity);
    const records = all
      .filter((r) => (donorId ? r.donorId === donorId : true) && (broadcastId ? r.broadcastId === broadcastId : true))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return NextResponse.json({ success: true, records }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    console.error("[CommunicationRecipients] read failed:", error?.message);
    return NextResponse.json({ success: false, error: "Could not read communication history from Google Sheets." }, { status: 503 });
  }
}
