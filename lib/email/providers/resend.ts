/**
 * lib/email/providers/resend.ts
 *
 * Resend provider — kept intact for future use.
 * Uses direct IP (104.20.29.242) to bypass DNS issues on this machine.
 * Switch back by setting EMAIL_PROVIDER=resend in .env.local.
 */

import type { EmailResult, EmailPayload } from "../providerManager";

const resendApiKey = process.env.RESEND_API_KEY;

function sendViaResendIP(payload: object): Promise<{ ok: boolean; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const https = require("https");
    const body = JSON.stringify(payload);

    const options = {
      hostname: "104.20.29.242", // Resend's Cloudflare IP — bypasses local DNS failure
      port: 443,
      path: "/emails",
      method: "POST",
      headers: {
        "Host": "api.resend.com",
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res: import("http").IncomingMessage) => {
      let data = "";
      res.on("data", (chunk: Buffer) => { data += chunk; });
      res.on("end", () => {
        try {
          resolve({ ok: (res.statusCode ?? 500) < 300, body: JSON.parse(data) });
        } catch {
          resolve({ ok: false, body: { message: data } });
        }
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

export async function sendViaResend(payload: EmailPayload): Promise<EmailResult> {
  const fromEmail = process.env.FROM_EMAIL || "onboarding@resend.dev";

  console.log("[Resend] Sending via direct IP (bypassing DNS)...");
  console.log("  API Key:", resendApiKey ? "Present" : "MISSING");
  console.log("  From:", fromEmail);
  console.log("  To:", payload.to);

  if (!resendApiKey) {
    return { success: false, error: "RESEND_API_KEY is not defined in environment variables." };
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
        id: att.cid
      };
    });

    const result = await sendViaResendIP({
      from: fromEmail,
      to: [payload.to],
      subject: payload.subject,
      html: payload.html,
      ...(formattedAttachments && formattedAttachments.length > 0 && { attachments: formattedAttachments })
    });

    console.log("[Resend] Response:", JSON.stringify(result.body, null, 2));

    if (!result.ok) {
      const errMsg = (result.body as { message?: string }).message || JSON.stringify(result.body);
      return { success: false, error: errMsg };
    }

    return { success: true, providerMessageId: (result.body as { id?: string }).id };
  } catch (err) {
    const msg = (err as Error).message;
    console.error("[Resend] Exception:", msg);
    return { success: false, error: msg };
  }
}
