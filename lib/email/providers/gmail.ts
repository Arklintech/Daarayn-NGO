/**
 * lib/email/providers/gmail.ts
 *
 * Gmail SMTP provider using Nodemailer.
 * Reads credentials entirely from environment variables.
 * Switch to Resend by setting EMAIL_PROVIDER=resend.
 */

import nodemailer from "nodemailer";
import type Mail from "nodemailer/lib/mailer";
import type { EmailResult, EmailPayload } from "../providerManager";
import {
  getFromHeader,
  getReplyToAddress,
  getStandardHeaders,
  htmlToPlainText,
} from "../deliverability";

// Reused across sends: logging in to Gmail for every message is slow and
// repeated logins from cloud IPs can make Google treat the account as suspicious.
let cachedTransport: nodemailer.Transporter | null = null;
let cachedBulkTransport: nodemailer.Transporter | null = null;

/** Messages with attachments are uploaded in one piece; on a slow uplink 10 MB takes minutes, far beyond the 20 s idle limit used for ordinary mail. */
const BULK_SOCKET_TIMEOUT_MS = 240_000;

/** Env values pasted into a dashboard often keep their quotes; Gmail App Passwords are shown with spaces. */
function cleanEnv(value: string | undefined): string {
  return (value || "").trim().replace(/^["']|["']$/g, "").trim();
}

function getSmtpUser(): string {
  return cleanEnv(process.env.SMTP_USER);
}

function getTransport(bulk = false) {
  if (bulk ? cachedBulkTransport : cachedTransport) return (bulk ? cachedBulkTransport : cachedTransport)!;

  const smtpUser = getSmtpUser();
  const smtpPass = cleanEnv(process.env.SMTP_PASS).replace(/\s+/g, "");
  const smtpHost = cleanEnv(process.env.SMTP_HOST) || "smtp.gmail.com";
  const smtpPort = parseInt(cleanEnv(process.env.SMTP_PORT) || "587", 10);
  const smtpSecure = cleanEnv(process.env.SMTP_SECURE) === "true" || smtpPort === 465;

  if (!smtpUser || !smtpPass) {
    throw Object.assign(
      new Error("Missing SMTP_USER or SMTP_PASS environment variables on this deployment."),
      { code: "ECONFIG" }
    );
  }

  const created = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    requireTLS: !smtpSecure,
    pool: true,
    maxConnections: 3,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
    // Timeouts to prevent hanging on connection failures
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: bulk ? BULK_SOCKET_TIMEOUT_MS : 20000,
  });
  if (bulk) cachedBulkTransport = created;
  else cachedTransport = created;

  return created;
}

function resetTransport() {
  cachedTransport?.close();
  cachedTransport = null;
  cachedBulkTransport?.close();
  cachedBulkTransport = null;
}

/**
 * Turns an SMTP error into an admin-readable reason, and decides whether
 * trying again could help. Auth, config and quota errors never fix themselves
 * on retry, so retrying them only delays the report.
 */
/**
 * The connection failed after the message body may already have been sent. nodemailer reports the SMTP command in
 * progress: "CONN"/"EHLO"/"AUTH…"/"MAIL FROM"/"RCPT TO" failures happen before any body is accepted (safe to retry),
 * but a failure during/after "DATA" (or a dropped socket with no command info) leaves the outcome unknown.
 */
export function isAmbiguousSmtpFailure(err: unknown): boolean {
  const e = err as NodeJS.ErrnoException & { command?: string; responseCode?: number };
  if (e?.responseCode) return false; // the server answered: the outcome is known
  const command = String(e?.command || "");
  if (/^DATA/i.test(command)) return true;
  if (!command && ["ESOCKET", "ETIMEDOUT", "ECONNRESET", "EPIPE"].includes(String(e?.code))) return true;
  return false;
}

function classifySmtpError(err: unknown): { reason: string; retryable: boolean } {
  const error = err as NodeJS.ErrnoException & { responseCode?: number; response?: string };
  const response = error.response || error.message || "Unknown SMTP error";

  if (error.code === "ECONFIG") {
    return { reason: error.message, retryable: false };
  }
  if (error.code === "EAUTH" || error.responseCode === 535 || error.responseCode === 534) {
    return {
      reason: `Gmail rejected the SMTP login for ${getSmtpUser() || "SMTP_USER"}. SMTP_PASS must be a valid 16-character App Password (2-Step Verification enabled). Server said: ${response}`,
      retryable: false,
    };
  }
  if (/5\.4\.5|sending limit|quota/i.test(response)) {
    return {
      reason: `Gmail daily sending limit reached for ${getSmtpUser()}. Sending resumes automatically in up to 24 hours. Server said: ${response}`,
      retryable: false,
    };
  }
  if (error.responseCode === 550 || error.responseCode === 553 || error.responseCode === 501) {
    return { reason: `Recipient address rejected: ${response}`, retryable: false };
  }
  if (error.code === "ECONNECTION" || error.code === "ETIMEDOUT" || error.code === "ENOTFOUND" || error.code === "ESOCKET") {
    return { reason: `SMTP connection failed (${error.code}): ${error.message}`, retryable: true };
  }
  // 4xx are temporary by definition (e.g. 421 rate limiting)
  if (error.responseCode && error.responseCode >= 400 && error.responseCode < 500) {
    return { reason: `Temporary SMTP error ${error.responseCode}: ${response}`, retryable: true };
  }
  return { reason: response, retryable: true };
}

/** Logs in to the SMTP server without sending anything. */
export async function verifyGmail(): Promise<{ ok: boolean; error?: string }> {
  try {
    await getTransport().verify();
    return { ok: true };
  } catch (err) {
    resetTransport();
    const { reason } = classifySmtpError(err);
    console.error("[Gmail] SMTP verification failed:", reason);
    return { ok: false, error: reason };
  }
}

/**
 * Opt-in safety net for test runs: when EMAIL_RECIPIENT_ALLOWLIST (comma-separated) is set, mail to any other address
 * is refused before SMTP is contacted. Unset in production, where it changes nothing.
 */
function allowlistViolation(to: string): string | null {
  const raw = cleanEnv(process.env.EMAIL_RECIPIENT_ALLOWLIST);
  if (!raw) return null;
  const allowed = new Set(raw.split(",").map((a) => a.trim().toLowerCase()).filter(Boolean));
  const recipients = String(to).split(",").map((a) => a.trim().toLowerCase()).filter(Boolean);
  return recipients.every((r) => allowed.has(r)) ? null : "Recipient is not on EMAIL_RECIPIENT_ALLOWLIST; nothing was sent.";
}

export async function sendViaGmail(payload: EmailPayload): Promise<EmailResult> {
  const blocked = allowlistViolation(payload.to);
  if (blocked) {
    console.warn("[Gmail] Send refused by recipient allowlist.");
    return { success: false, retryable: false, error: blocked };
  }
  try {
    const hasAttachments = Array.isArray(payload.attachments) && payload.attachments.some((a: any) => a?.content && Buffer.byteLength(a.content) > 512 * 1024);
    const transport = getTransport(hasAttachments);
    const smtpUser = getSmtpUser();

    const mailOptions: Mail.Options = {
      from: getFromHeader(smtpUser),
      replyTo: getReplyToAddress(),
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: htmlToPlainText(payload.html),
      headers: getStandardHeaders(),
      ...(payload.attachments && { attachments: payload.attachments }),
    };

    const info = await transport.sendMail(mailOptions);

    // Treat as failed if the address was rejected
    if (info.rejected && info.rejected.length > 0) {
      console.warn("[Gmail] Recipient rejected:", info.response);
      return {
        success: false,
        retryable: false,
        error: `Address rejected by SMTP server: ${info.rejected.join(", ")}`,
        providerMessageId: info.messageId,
      };
    }

    console.log("[Gmail] Email accepted, MessageId:", info.messageId);
    return {
      success: true,
      providerMessageId: info.messageId,
    };
  } catch (err) {
    // Drop the pooled transport so the next send starts with a fresh connection
    resetTransport();
    const { reason, retryable } = classifySmtpError(err);
    console.error("[Gmail] Send failed:", reason);
    // A timeout while a large body is being uploaded is reported by nodemailer with command CONN; the server may still have accepted it.
    const hasBody = Array.isArray(payload.attachments) && payload.attachments.length > 0;
    if (isAmbiguousSmtpFailure(err) || (hasBody && ((err as any)?.code === "ETIMEDOUT" || (err as any)?.code === "ESOCKET") && !(err as any)?.responseCode)) {
      return {
        success: false,
        retryable: false,
        ambiguous: true,
        error: `Outcome unknown: the connection broke after the message was sent, so it may have been accepted. ${reason}`,
      };
    }
    return { success: false, error: reason, retryable };
  }
}
