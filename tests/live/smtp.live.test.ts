/**
 * LIVE Gmail SMTP test (no Sheets/Drive needed). Run: npx vitest run --config vitest.live.config.ts tests/live/smtp.live.test.ts
 * Sends ONE message, only to the SMTP account's own mailbox (SMTP_USER). Never to donors.
 * Result "success" means the mail server ACCEPTED the message; it is not proof of inbox delivery.
 */
import { describe, it, expect } from "vitest";
import { randomBytes } from "crypto";

const RUN = `SMTP-${Date.now().toString(36)}`;

describe("LIVE: Gmail SMTP", () => {
  it("authenticates with the configured SMTP_USER / SMTP_PASS", async () => {
    const { verifyEmailProvider } = await import("@/lib/email/providerManager");
    const r = await verifyEmailProvider();
    expect(r.error ?? "", "SMTP login failed").toBe("");
    expect(r.ok).toBe(true);
    expect(r.provider).toBe("gmail");
  });

  it("the server accepts a test email addressed to the SMTP account's own mailbox", async () => {
    const to = (process.env.SMTP_USER || "").trim();
    expect(to).toContain("@");
    const { sendEmail } = await import("@/lib/email/providerManager");
    const res = await sendEmail({
      to,
      subject: `Daarayn SMTP integration test ${RUN}`,
      html: `<p>Automated integration test <b>${RUN}</b>. No action needed. Please confirm this message arrived in the inbox.</p>`,
    });
    expect(res.error ?? "").toBe("");
    expect(res.success).toBe(true);
    expect(res.providerMessageId).toBeTruthy();
    console.log(`SMTP accepted test message ${RUN} to the account's own mailbox (inbox arrival must be confirmed by a person).`);
  });

  it("wrong credentials are reported as a clear authentication error", async () => {
    const saved = process.env.SMTP_PASS;
    const { default: nodemailer } = await import("nodemailer");
    const t = nodemailer.createTransport({
      host: "smtp.gmail.com", port: 587, secure: false, requireTLS: true,
      auth: { user: process.env.SMTP_USER, pass: randomBytes(8).toString("hex") },
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
    });
    await expect(t.verify()).rejects.toMatchObject({ responseCode: 535 });
    process.env.SMTP_PASS = saved;
  });
});
