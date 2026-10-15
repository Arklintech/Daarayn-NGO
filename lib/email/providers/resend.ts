/**
 * lib/email/providers/resend.ts
 *
 * Resend provider. Enable by setting EMAIL_PROVIDER=resend.
 */

import type { EmailResult, EmailPayload } from "../providerManager";
import { getReplyToAddress, getStandardHeaders, htmlToPlainText } from "../deliverability";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

function cleanEnv(value: string | undefined): string {
  return (value || "").trim().replace(/^["']|["']$/g, "").trim();
}

function getFromEmail(): string {
  return cleanEnv(process.env.FROM_EMAIL) || "onboarding@resend.dev";
}

/**
 * Resend's shared test sender only delivers to the Resend account owner, so a
 * broadcast from it would report success while donors receive nothing.
 */
function sandboxSenderError(): string | null {
  if (/@resend\.dev\b/i.test(getFromEmail())) {
    return "FROM_EMAIL uses Resend's test sender (resend.dev), which only delivers to the Resend account owner. Set FROM_EMAIL to an address on a domain verified in Resend.";
  }
  return null;
}

export async function verifyResend(): Promise<{ ok: boolean; error?: string }> {
  if (!cleanEnv(process.env.RESEND_API_KEY)) {
    return { ok: false, error: "RESEND_API_KEY is not set on this deployment." };
  }
  const sandbox = sandboxSenderError();
  return sandbox ? { ok: false, error: sandbox } : { ok: true };
}

export async function sendViaResend(payload: EmailPayload): Promise<EmailResult> {
  const apiKey = cleanEnv(process.env.RESEND_API_KEY);
  if (!apiKey) {
    return { success: false, retryable: false, error: "RESEND_API_KEY is not set on this deployment." };
  }
  const sandbox = sandboxSenderError();
  if (sandbox) {
    return { success: false, retryable: false, error: sandbox };
  }

  try {
    const formattedAttachments = payload.attachments?.map((att: any) => {
      let contentBase64 = "";
      if (att.content) {
        contentBase64 = Buffer.isBuffer(att.content)
          ? att.content.toString("base64")
          : typeof att.content === "string"
            ? att.content
            : Buffer.from(att.content).toString("base64");
      }

      return {
        filename: att.filename,
        content: contentBase64,
        ...(att.cid && { content_id: att.cid }),
      };
    });

    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: getFromEmail(),
        to: [payload.to],
        subject: payload.subject,
        html: payload.html,
        text: htmlToPlainText(payload.html),
        reply_to: getReplyToAddress(),
        headers: getStandardHeaders(),
        ...(formattedAttachments && formattedAttachments.length > 0 && { attachments: formattedAttachments }),
      }),
      signal: AbortSignal.timeout(20000),
    });

    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };

    if (!res.ok) {
      const errMsg = body.message || `Resend responded with HTTP ${res.status}`;
      console.error("[Resend] Send failed:", errMsg);
      // 429 and 5xx are temporary; other 4xx (bad key, unverified domain) are not
      return { success: false, error: errMsg, retryable: res.status === 429 || res.status >= 500 };
    }

    return { success: true, providerMessageId: body.id };
  } catch (err) {
    const msg = (err as Error).message;
    console.error("[Resend] Exception:", msg);
    return { success: false, error: msg, retryable: true };
  }
}
