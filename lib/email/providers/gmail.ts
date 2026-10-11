/**
 * lib/email/providers/gmail.ts
 *
 * Gmail SMTP provider using Nodemailer.
 * Reads credentials entirely from environment variables.
 * This is the TEMPORARY development provider.
 * Switch back to Resend by setting EMAIL_PROVIDER=resend in .env.local.
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

function getTransport() {
  if (cachedTransport) return cachedTransport;

  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com";
  const smtpPort = parseInt(process.env.SMTP_PORT || "587", 10);
  const smtpSecure = process.env.SMTP_SECURE === "true";

  if (!smtpUser || !smtpPass) {
    throw new Error(
      "[Gmail Provider] Missing SMTP_USER or SMTP_PASS environment variables."
    );
  }

  cachedTransport = nodemailer.createTransport({
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
    socketTimeout: 15000,
  });

  return cachedTransport;
}

export async function sendViaGmail(payload: EmailPayload): Promise<EmailResult> {
  const mailOptions: Mail.Options = {
    from: getFromHeader(process.env.SMTP_USER),
    replyTo: getReplyToAddress(),
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    text: htmlToPlainText(payload.html),
    headers: getStandardHeaders(),
    ...(payload.attachments && { attachments: payload.attachments }),
  };

  console.log("[Gmail] Connecting to SMTP...");
  console.log("  Host:", process.env.SMTP_HOST || "smtp.gmail.com");
  console.log("  User:", process.env.SMTP_USER ? "Present" : "MISSING");
  console.log("  Pass:", process.env.SMTP_PASS ? "Present" : "MISSING");
  console.log("  From:", mailOptions.from);
  console.log("  To:", payload.to);

  try {
    const transport = getTransport();

    const info = await transport.sendMail(mailOptions);

    console.log("[Gmail] Email sent ✓ MessageId:", info.messageId);
    console.log("[Gmail] Accepted:", info.accepted);
    console.log("[Gmail] Rejected:", info.rejected);

    // Treat as failed if the address was rejected
    if (info.rejected && info.rejected.length > 0) {
      return {
        success: false,
        error: `Address rejected by SMTP server: ${info.rejected.join(", ")}`,
        providerMessageId: info.messageId,
      };
    }

    return {
      success: true,
      providerMessageId: info.messageId,
    };
  } catch (err) {
    const error = err as NodeJS.ErrnoException & { responseCode?: number; response?: string };

    // Drop the pooled transport so the next send starts with a fresh connection
    cachedTransport?.close();
    cachedTransport = null;

    let reason = error.message || "Unknown SMTP error";

    // Classify common errors for better diagnostics
    if (error.code === "EAUTH") {
      reason = `Gmail authentication failed. Check SMTP_USER and SMTP_PASS. Make sure you are using an App Password, not your normal Gmail password. Error: ${error.response}`;
    } else if (error.code === "ECONNECTION" || error.code === "ETIMEDOUT" || error.code === "ENOTFOUND") {
      reason = `SMTP connection failed (${error.code}). Check SMTP_HOST and SMTP_PORT. Error: ${error.message}`;
    } else if (error.responseCode === 550) {
      reason = `Invalid recipient address. The mailbox does not exist.`;
    } else if (error.responseCode === 535) {
      reason = `Gmail authentication rejected. Ensure 2FA is enabled and you are using an App Password.`;
    }

    console.error("[Gmail] Send failed:", reason);
    return { success: false, error: reason };
  }
}
