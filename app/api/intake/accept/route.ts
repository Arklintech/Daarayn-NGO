import { NextRequest, NextResponse } from "next/server";
import { acceptDonation } from "@/lib/intake/intakeService";
import { IntakeSchemaError } from "@/lib/intake/schema";
import { intakeModeEnabled } from "@/lib/intake/runtime";
import { signalDrain } from "@/lib/intake/queue/dispatcher";
import { vercelQueueTransport } from "@/lib/intake/queue/vercelTransport";
import { DonationInputError, ProofStorageError } from "@/lib/services/donationService";
import { checkRateLimit } from "@/lib/security/rate-limiter";
import { runWithPriority } from "@/lib/google/requestControl";
import { financialOperationsPaused, FINANCIAL_PAUSED_MESSAGE } from "@/lib/financialActivation";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // the donor acknowledgement window; the financial work happens later, in the queue consumer

/**
 * Queued intake (D38, OFF unless DONATION_INTAKE_MODE=queued; the direct /api/donate path is untouched). It durably accepts a submission (one Sheets read, one write),
 * wakes the finaliser through the queue and answers 202 "received". It does NOT claim a recorded donation: no permanent id exists yet. A failed wake-up never
 * fails an accepted submission: the row is already durable and reconciliation redispatches it.
 */
async function POST_handler(request: NextRequest) {
  if (!intakeModeEnabled()) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (financialOperationsPaused()) return NextResponse.json({ error: FINANCIAL_PAUSED_MESSAGE, paused: true }, { status: 503, headers: { "Retry-After": "3600" } });
  const limited = checkRateLimit(request, { limit: 15, windowMs: 60 * 1000 });
  if (!limited.allowed && limited.response) return limited.response;

  try {
    const formData = await request.formData();
    const get = (k: string) => formData.get(k)?.toString() || "";
    let selectedCauses: unknown = [];
    try {
      const s = formData.get("selectedCauses")?.toString();
      if (s) selectedCauses = JSON.parse(s);
    } catch {
      return NextResponse.json({ error: "The selected causes could not be read. Please choose your causes again." }, { status: 400 });
    }
    const screenshot = formData.get("screenshot") as File | null;
    if (!get("amount") || !screenshot || screenshot.size === 0) return NextResponse.json({ error: "Required fields (Amount, Payment Screenshot) are missing." }, { status: 400 });
    const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/heic", "application/pdf"];
    if (!ALLOWED.includes(screenshot.type)) return NextResponse.json({ error: "Payment proof must be an image (PNG, JPEG, WebP, HEIC) or PDF." }, { status: 400 });
    if (screenshot.size > 10 * 1024 * 1024) return NextResponse.json({ error: "Payment proof must be 10 MB or smaller." }, { status: 400 });
    const amount = parseInt(get("amount"), 10);
    if (isNaN(amount) || amount <= 0) return NextResponse.json({ error: "Invalid donation amount specified." }, { status: 400 });

    const accepted = await acceptDonation({
      donorName: get("donorName"),
      donorContact: get("donorContact"),
      upiRef: get("upiRef"),
      amount,
      currency: get("currency") || "INR",
      cause: get("cause") || "General Support",
      selectedCauses,
      screenshotBuffer: Buffer.from(await screenshot.arrayBuffer()),
      screenshotFilename: screenshot.name || `proof-${Date.now()}.png`,
      screenshotMimeType: screenshot.type || "image/png",
      submissionKey: get("submissionKey"),
    });
    const wake = await signalDrain(vercelQueueTransport, { hint: accepted.reference });
    return NextResponse.json(
      {
        success: true,
        state: "RECEIVED",
        reference: accepted.reference,
        message: "We have received your submission and your payment proof. This is not yet your donation receipt: your donation number and confirmation follow. Keep this reference and do not submit the form again.",
        statusUrl: `/donate/status?ref=${accepted.reference}`,
        queued: wake.published,
      },
      { status: 202, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: any) {
    if (error instanceof DonationInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof ProofStorageError) return NextResponse.json({ error: error.message }, { status: 503 });
    if (error instanceof IntakeSchemaError) {
      console.error("[Intake] schema contract violated:", error.message);
      return NextResponse.json({ error: "We could not accept your submission right now. Nothing was recorded. Please try again later." }, { status: 503, headers: { "Retry-After": "300" } });
    }
    console.error("[Intake] accept failed:", error?.message);
    if (error?.retriesExhausted || /Quota exceeded|rate limit|Could not read|Could not write|busy/i.test(String(error?.message))) {
      return NextResponse.json({ error: "We could not accept your submission right now because the records service is busy. Please try again in a minute; submitting the same form again will not create a duplicate." }, { status: 503, headers: { "Retry-After": "30" } });
    }
    return NextResponse.json({ error: "We could not accept your submission." }, { status: 500 });
  }
}

export const POST = (...args: Parameters<typeof POST_handler>) => runWithPriority("P0", () => POST_handler(...args));
