import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const metrics = vi.hoisted(() => ({ value: null as any }));
vi.mock("@/lib/google/requestControl", async (orig) => {
  const real: any = await orig();
  return { ...real, fetchCoordinatorMetrics: async () => metrics.value, limiterStatus: () => ({ mode: "shared", crossInstance: true, production: false, ready: true }) };
});

import { GET } from "@/app/api/ops/quota-status/route";

const TOKEN = "monitor-token-0123456789-abcdef";
const saved = { ...process.env };
const call = (min?: string, auth: string | null = `Bearer ${TOKEN}`) => GET(new Request(`http://t/api/ops/quota-status${min ? `?min=${min}` : ""}`, { headers: auth ? { authorization: auth } : {} }));
const m = (read: number, write = 0, extra: any = {}) => ({ storageOk: true, quarantined: false, rollingGranted60s: { read, write }, queueDepthMs: { read: 0, write: 0 }, refusedSinceStart: { read: 0, write: 0 }, penaltiesSinceStart: 0, storageFailuresSinceStart: 0, ...extra });

beforeEach(() => {
  process.env.OPS_MONITOR_TOKEN = TOKEN;
  Object.assign(process.env, { GOOGLE_SHEETS_READS_PER_MINUTE: "45", GOOGLE_SHEETS_WRITES_PER_MINUTE: "45", GOOGLE_SHEETS_MAX_WAIT_MS: "25000" });
  metrics.value = m(1);
});
afterEach(() => {
  process.env = { ...saved };
});

describe("D30: machine-readable quota status for an external monitor", () => {
  it("is disabled (404) without OPS_MONITOR_TOKEN and refuses a missing or wrong token (401)", async () => {
    expect((await call("high", null)).status).toBe(401);
    expect((await call("high", `Bearer ${"x".repeat(TOKEN.length)}`)).status).toBe(401);
    delete process.env.OPS_MONITOR_TOKEN;
    expect((await call()).status).toBe(404);
  });

  it("answers 200 while healthy and 503 when the chosen threshold is reached: warning 70 percent, high 80, critical 90", async () => {
    metrics.value = m(1);
    expect((await call("warning")).status).toBe(200);
    metrics.value = m(32); // 71 %
    expect((await call("warning")).status).toBe(503);
    expect((await call("high")).status).toBe(200);
    metrics.value = m(36); // 80 %
    expect((await call("high")).status).toBe(503);
    expect((await call("critical")).status).toBe(200);
    metrics.value = m(41); // 91 %
    expect((await call("critical")).status).toBe(503);
  });

  it("an unreachable coordinator is critical", async () => {
    metrics.value = null;
    const res = await call("critical");
    expect(res.status).toBe(503);
    expect((await res.json()).alerts.map((a: any) => a.code)).toContain("COORDINATOR_UNREACHABLE");
  });

  it("the answer carries codes and severities only (no address, token, key names or Google data)", async () => {
    metrics.value = m(41);
    const body = JSON.stringify(await (await call("warning")).json());
    expect(body).not.toContain(TOKEN);
    expect(body).not.toMatch(/https?:\/\//);
    expect(Object.keys(JSON.parse(body))).toEqual(["status", "threshold", "breach", "alerts"]);
  });
});
