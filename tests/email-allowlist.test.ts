import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const sendMail = vi.hoisted(() => vi.fn(async () => ({ messageId: "<m@test>", rejected: [], response: "250 ok" })));
vi.mock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail, verify: async () => true, close: () => undefined }) } }));

const ENV = { SMTP_USER: "sender@example.invalid", SMTP_PASS: "abcdabcdabcdabcd" };

describe("outbound recipient allowlist (EMAIL_RECIPIENT_ALLOWLIST)", () => {
  beforeEach(() => {
    sendMail.mockClear();
    Object.assign(process.env, ENV);
  });
  afterEach(() => {
    delete process.env.EMAIL_RECIPIENT_ALLOWLIST;
  });

  it("refuses an address outside the allowlist without contacting SMTP", async () => {
    process.env.EMAIL_RECIPIENT_ALLOWLIST = "a@example.invalid, B@example.invalid";
    const { sendViaGmail } = await import("@/lib/email/providers/gmail");
    const r = await sendViaGmail({ to: "stranger@example.invalid", subject: "s", html: "<p>x</p>" } as any);
    expect(r.success).toBe(false);
    expect(r.retryable).toBe(false);
    expect(r.error).toMatch(/allowlist/i);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("sends to an allowlisted address (case-insensitive)", async () => {
    process.env.EMAIL_RECIPIENT_ALLOWLIST = "a@example.invalid, B@example.invalid";
    const { sendViaGmail } = await import("@/lib/email/providers/gmail");
    const r = await sendViaGmail({ to: "b@EXAMPLE.invalid", subject: "s", html: "<p>x</p>" } as any);
    expect(r.success).toBe(true);
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it("does not restrict anything when the variable is unset (production behaviour unchanged)", async () => {
    const { sendViaGmail } = await import("@/lib/email/providers/gmail");
    const r = await sendViaGmail({ to: "anyone@example.invalid", subject: "s", html: "<p>x</p>" } as any);
    expect(r.success).toBe(true);
  });
});
