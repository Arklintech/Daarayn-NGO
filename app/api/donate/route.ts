import { NextRequest, NextResponse } from "next/server";
import { donationService, DonationInputError, ProofStorageError } from "@/lib/services/donationService";
import { DonationWriteError } from "@/lib/repositories/donationRepository";
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
    const submissionKey = formData.get("submissionKey")?.toString() || "";

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

    if (!amountStr || !screenshot || screenshot.size === 0) {
      return NextResponse.json(
        { error: "Required fields (Amount, Payment Screenshot) are missing." },
        { status: 400 }
      );
    }

    const ALLOWED_PROOF_TYPES = ["image/png", "image/jpeg", "image/webp", "image/heic", "application/pdf"];
    const MAX_PROOF_BYTES = 10 * 1024 * 1024;
    if (!ALLOWED_PROOF_TYPES.includes(screenshot.type)) {
      return NextResponse.json({ error: "Payment proof must be an image (PNG, JPEG, WebP, HEIC) or PDF." }, { status: 400 });
    }
    if (screenshot.size > MAX_PROOF_BYTES) {
      return NextResponse.json({ error: "Payment proof must be 10 MB or smaller." }, { status: 400 });
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
      submissionKey,
    });

    if (!result.duplicate) logAuditEvent({
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
      duplicate: Boolean(result.duplicate),
      confirmationEmailSent: result.confirmationEmailSent,
      confirmationEmailError: result.confirmationEmailError,
    });
  } catch (error: any) {
    if (error instanceof DonationWriteError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.httpStatus });
    }
    if (error instanceof ProofStorageError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    if (error instanceof DonationInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[API/Donate] Error processing donation:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process contribution." },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
