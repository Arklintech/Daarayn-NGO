import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GET } from "@/app/api/ops/probe/route";
import { MemoryLimiterBackend, setLimiterBackend } from "@/lib/google/requestControl";

const TOKEN = "probe-token-0123456789-abcdefgh";
const saved = { ...process.env };
const call = (qs = "", auth: string | null = `Bearer ${TOKEN}`) => GET(new Request(`http://t/api/ops/probe${qs}`, { headers: auth ? { authorization: auth } : {} }));

beforeEach(() => {
  process.env.OPS_MONITOR_TOKEN = TOKEN;
  Object.assign(process.env, { GOOGLE_SHEETS_READS_PER_MINUTE: "600", GOOGLE_SHEETS_WRITES_PER_MINUTE: "600", GOOGLE_SHEETS_BURST: "5", GOOGLE_SHEETS_MAX_WAIT_MS: "5000" });
  setLimiterBackend(new MemoryLimiterBackend());
});
afterEach(() => {
  process.env = { ...saved };
  setLimiterBackend(new MemoryLimiterBackend());
});

describe("D31: Preview-only probe of the shared limiter (no Google request)", () => {
  it("is disabled in production and without OPS_MONITOR_TOKEN, and refuses a wrong token", async () => {
    expect((await call("", null)).status).toBe(401);
    expect((await call("", `Bearer ${"x".repeat(TOKEN.length)}`)).status).toBe(401);
    process.env.VERCEL_ENV = "production";
    expect((await call()).status).toBe(404);
    delete process.env.VERCEL_ENV;
    delete process.env.OPS_MONITOR_TOKEN;
    expect((await call()).status).toBe(404);
  });

  it("reports a stable instance id, grants the requested slots and shows no secret", async () => {
    const a = await (await call("?n=3&kind=write&priority=P0")).json();
    const b = await (await call("?n=1")).json();
    expect(a.instance).toBe(b.instance);
    expect(a.granted).toBe(3);
    expect(a.kind).toBe("write");
    expect(JSON.stringify(a)).not.toContain(TOKEN);
    expect(b.servedByThisInstance).toBeGreaterThan(a.servedByThisInstance);
  });

  it("answers 503 with the refusal code when the budget cannot admit the request in time", async () => {
    process.env.GOOGLE_SHEETS_READS_PER_MINUTE = "6";
    process.env.GOOGLE_SHEETS_BURST = "1";
    process.env.GOOGLE_SHEETS_MAX_WAIT_MS = "100";
    setLimiterBackend(new MemoryLimiterBackend());
    await call("?n=1&priority=P0");
    const res = await call("?n=1&priority=P0");
    expect(res.status).toBe(503);
    expect((await res.json()).refused).toBe("GOOGLE_BACKPRESSURE");
  });
});
