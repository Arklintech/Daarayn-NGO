/**
 * app/api/test-email/route.ts
 *
 * Test endpoint to verify the active email provider is configured correctly.
 * Uses whatever provider is set by EMAIL_PROVIDER in .env.local.
 */

import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email/providerManager";
import { generateLetterEmailTemplate } from "@/lib/email/resend";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const recipient = body.recipient || process.env.SMTP_USER || "test@example.com";
    const subject = body.subject || "Daarayn Gmail SMTP Test";
    const textContent = body.html || "This is a successful Gmail SMTP test from the Daarayn Foundation communication engine.";

    const provider = process.env.EMAIL_PROVIDER || "gmail";

    console.log(`[test-email] Provider: ${provider}`);
    console.log(`[test-email] Recipient: ${recipient}`);

    // Validate required env vars before attempting send
    if (provider === "gmail") {
      if (!process.env.SMTP_USER) {
        return NextResponse.json({ success: false, failureReason: "SMTP_USER is not set in .env.local" }, { status: 400 });
      }
      if (!process.env.SMTP_PASS) {
        return NextResponse.json({ success: false, failureReason: "SMTP_PASS is not set in .env.local" }, { status: 400 });
      }
    }

    if (provider === "resend" && !process.env.RESEND_API_KEY) {
      return NextResponse.json({ success: false, failureReason: "RESEND_API_KEY is not set in .env.local" }, { status: 400 });
    }

    const html = generateLetterEmailTemplate({
      title: subject,
      eyebrow: "SYSTEM TEST",
      headline: "Email Configuration Test",
      greeting: "Hello,",
      bodyParagraphs: [textContent]
    });

    const result = await sendEmail({ to: recipient, subject, html });

    if (!result.success) {
      return NextResponse.json({
        success: false,
        provider,
        failureReason: result.error,
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      provider,
      recipient,
      providerMessageId: result.providerMessageId,
      smtpResponse: "Email accepted for delivery",
    });

  } catch (error) {
    const msg = (error as Error).message;
    console.error("[test-email] Unhandled error:", msg);
    return NextResponse.json({ success: false, failureReason: msg }, { status: 500 });
  }
}
