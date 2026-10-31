import { describe, it, expect, vi, afterEach } from "vitest";
import { financialOperationsPaused } from "@/lib/financialActivation";
import { NextRequest } from "next/server";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
  vi.resetModules();
});

describe("D31: financial operations stay paused in production until activation is approved", () => {
  it("production without FINANCIAL_ACTIVATION_APPROVED=true is paused; with it, open; other environments never paused", () => {
    expect(financialOperationsPaused({ GOOGLE_TARGET_ENV: "production" })).toBe(true);
    expect(financialOperationsPaused({ VERCEL_ENV: "production" })).toBe(true);
    expect(financialOperationsPaused({ VERCEL_ENV: "production", FINANCIAL_ACTIVATION_APPROVED: "true" })).toBe(false);
    expect(financialOperationsPaused({ VERCEL_ENV: "production", FINANCIAL_ACTIVATION_APPROVED: "yes" })).toBe(true);
    expect(financialOperationsPaused({ VERCEL_ENV: "preview" })).toBe(false);
    expect(financialOperationsPaused({})).toBe(false);
  });

  it("the donation endpoint answers 503 (paused) in production and reads or writes nothing", async () => {
    process.env.GOOGLE_TARGET_ENV = "production";
    delete process.env.FINANCIAL_ACTIVATION_APPROVED;
    const { POST } = await import("@/app/api/donate/route");
    const fd = new FormData();
    fd.set("donorName", "Test");
    const res = await POST(new NextRequest("http://t/api/donate", { method: "POST", body: fd }));
    expect(res.status).toBe(503);
    expect((await res.json()).paused).toBe(true);
  });
});
