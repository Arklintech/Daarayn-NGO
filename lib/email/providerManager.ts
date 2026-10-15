/**
 * lib/email/providerManager.ts
 *
 * Provider abstraction layer for the Daarayn email system.
 *
 * To switch provider, change EMAIL_PROVIDER:
 *   EMAIL_PROVIDER=gmail   → Gmail SMTP via Nodemailer (default)
 *   EMAIL_PROVIDER=resend  → Resend HTTP API
 *
 * The rest of the application never imports a provider directly.
 * All email calls go through sendEmail() exported from this file.
 */

import { sendViaGmail, verifyGmail } from "./providers/gmail";
import { sendViaResend, verifyResend } from "./providers/resend";

/** Shared email payload type for all providers */
export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  attachments?: any[];
}

/** Shared result type returned by all providers */
export interface EmailResult {
  success: boolean;
  providerMessageId?: string;
  error?: string;
  /** false when the failure is permanent (bad credentials, quota, invalid recipient) */
  retryable?: boolean;
}

function getProvider(): string {
  return (process.env.EMAIL_PROVIDER || "gmail").trim().replace(/^["']|["']$/g, "").toLowerCase();
}

/**
 * Dispatch an email using the active provider.
 * Provider is selected via EMAIL_PROVIDER environment variable.
 */
export async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
  const provider = getProvider();

  if (provider === "resend") {
    return sendViaResend(payload);
  }

  if (provider === "gmail") {
    return sendViaGmail(payload);
  }

  return {
    success: false,
    retryable: false,
    error: `Unknown EMAIL_PROVIDER: "${provider}". Valid values are "gmail" or "resend".`,
  };
}

/**
 * Checks that the active provider can send (credentials present and accepted)
 * without sending a message. Run before a broadcast so a misconfiguration is
 * reported to the admin instead of silently failing every recipient.
 */
export async function verifyEmailProvider(): Promise<{ ok: boolean; provider: string; error?: string }> {
  const provider = getProvider();

  if (provider === "gmail") return { provider, ...(await verifyGmail()) };
  if (provider === "resend") return { provider, ...(await verifyResend()) };

  return {
    ok: false,
    provider,
    error: `Unknown EMAIL_PROVIDER: "${provider}". Valid values are "gmail" or "resend".`,
  };
}
