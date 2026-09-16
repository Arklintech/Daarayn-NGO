import { NextRequest, NextResponse } from "next/server";
import { donationService } from "@/lib/services/donationService";
import { checkRateLimit } from "@/lib/security/rate-limiter";
import { logAuditEvent } from "@/lib/security/audit-logger";

export async function POST(request: NextRequest) {
  // 1. Rate limit check (max 15 donation attempts per IP per minute)
  const rateLimitResult = checkRateLimit(request, { limit: 15, windowMs: 60 * 1000 });
  if (!rateLimitResult.allowed && rateLimitResult.response) {
    return rateLimitResult.response;
  }

  try {
    const formData = await request.formData();
    const donorName = formData.get("donorName")?.toString() || "";
    const donorContact = formData.get("donorContact")?.toString() || "";
    const upiRef = formData.get("upiRef")?.toString() || "";
    const amountStr = formData.get("amount")?.toString() || "";
    const currency = formData.get("currency")?.toString() || "INR";
    const cause = formData.get("cause")?.toString() || "General Support";

    let selectedCauses: string[] = [];
    try {
      const selectedCausesStr = formData.get("selectedCauses")?.toString();
      if (selectedCausesStr) {
        selectedCauses = JSON.parse(selectedCausesStr);
      }
    } catch (e) {
      console.warn("Failed to parse selectedCauses", e);
    }

    const screenshot = formData.get("screenshot") as File | null;

    if (!upiRef || !amountStr || !screenshot || screenshot.size === 0) {
      return NextResponse.json(
        { error: "Required fields (Amount, UPI Ref Code, Payment Screenshot) are missing." },
        { status: 400 }
      );
    }

    const numAmount = parseInt(amountStr, 10);
    if (isNaN(numAmount) || numAmount <= 0) {
      return NextResponse.json({ error: "Invalid donation amount specified." }, { status: 400 });
    }

    // Convert screenshot to buffer for Google Drive upload
    const screenshotBuffer = Buffer.from(await screenshot.arrayBuffer());
    const screenshotFilename = screenshot.name || `proof-${Date.now()}.png`;
    const screenshotMimeType = screenshot.type || "image/png";

    // Ingest via Authoritative Donation Service
    const result = await donationService.processDonation({
      donorName,
      donorContact,
      upiRef,
      amount: numAmount,
      currency,
      cause,
      selectedCauses,
      screenshotBuffer,
      screenshotFilename,
      screenshotMimeType,
    });

    logAuditEvent({
      userId: result.donorId,
      userName: donorName || "Anonymous Donor",
      action: "DONATION_PROCESSED",
      targetResource: `Donations/${result.trackingId}`,
      metadata: { amount: numAmount, cause, upiRef, proofDriveFileId: result.proofDriveFileId },
    }).catch((err) => console.warn("Audit logging non-fatal error:", err));

    return NextResponse.json({
      success: true,
      trackingId: result.trackingId,
      proofDriveFileId: result.proofDriveFileId,
    });
  } catch (error: any) {
    console.error("[API/Donate] Error processing donation:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process contribution." },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
