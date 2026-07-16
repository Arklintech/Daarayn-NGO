/**
 * lib/email/providerManager.ts
 *
 * Provider abstraction layer for the Daarayn email system.
 *
 * To switch provider, change EMAIL_PROVIDER in .env.local:
 *   EMAIL_PROVIDER=gmail   → Gmail SMTP via Nodemailer (current)
 *   EMAIL_PROVIDER=resend  → Resend via direct IP
 *
 * The rest of the application never imports a provider directly.
 * All email calls go through sendEmail() exported from this file.
 */

import { sendViaGmail } from "./providers/gmail";
import { sendViaResend } from "./providers/resend";

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
}

/**
 * Dispatch an email using the active provider.
 * Provider is selected via EMAIL_PROVIDER environment variable.
 */
export async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
  const provider = (process.env.EMAIL_PROVIDER || "gmail").toLowerCase();

  console.log(`[ProviderManager] Active provider: ${provider}`);

  if (provider === "resend") {
    return sendViaResend(payload);
  }

  if (provider === "gmail") {
    return sendViaGmail(payload);
  }

  return {
    success: false,
    error: `Unknown EMAIL_PROVIDER: "${provider}". Valid values are "gmail" or "resend".`,
  };
}
