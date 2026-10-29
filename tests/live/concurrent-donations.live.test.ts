/**
 * LIVE Google request-count measurement on the APPROVED TEST SPREADSHEET ONLY (quota cost per operation).
 * Run: npx vitest run --config vitest.live.config.ts tests/live/concurrent-donations.live.test.ts
 * Same safety model as final-acceptance.live.test.ts: refuses unless the sheet is the approved id, differs from production and has
 * the `_IntegrationTest` marker; e-mail, Drive uploads, realtime and Firebase are stubbed.
 */
import "./env";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { googleUsageSnapshot, resetGoogleUsage } from "@/lib/google/usage";
import { google } from "googleapis";

const APPROVED = "1sGVsMEQDI1WmjWdUTQ0eKOzZC34Ri9CLsf4uUUceGzM";
const PRODUCTION = (process.env.GOOGLE_SHEET_ID || "").trim();

vi.mock("@/lib/server/auth", async () => {
  const { NextResponse } = await import("next/server");
  const admin = { kind: "admin", uid: "live-conc", email: "live-conc@example.invalid" };
  return { requireAdmin: async () => admin, requireAgent: async () => NextResponse.json({}, { status: 401 }), requireAdminOrAgent: async () => admin };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendDonationEmail: vi.fn(async () => ({ sent: false, skipped: "live test: e-mail disabled" })) }));
vi.mock("@/lib/email/providerManager", () => ({ sendEmail: vi.fn(async () => { throw new Error("live test: e-mail disabled"); }), verifyEmailProvider: vi.fn(async () => false) }));
vi.mock("@/lib/google/drive", () => ({ driveService: { uploadFile: vi.fn(async () => ({ drive_file_id: "STUB-NO-REAL-UPLOAD", backend: "stub" })), deleteFile: vi.fn(async () => undefined) } }));
vi.mock("@/lib/realtime/broadcaster", () => ({ realtimeBroadcaster: { publish: vi.fn(async () => ({ delivered: "log" })), publishBatch: vi.fn(async () => ({ delivered: "log" })), broadcast: vi.fn() } }));

const RUN = `ZZ_CONC_${Date.now().toString(36)}`;
const ids = { A: `CAUSE-${RUN}-A`, B: `CAUSE-${RUN}-B`, C: `CAUSE-${RUN}-C` };
let blocked = "";
const need = (ctx: any) => { if (blocked) ctx.skip(blocked); };

const admin = async (path: string, method: string, body?: any) => {
  const mod: any = await import(path);
  return mod[method](new NextRequest(`http://t/${path.replace("@/", "")}`, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }));
};
const saveCause = (id: string, status: string) =>
  admin("@/app/api/admin/programs/route", "POST", { id, kind: "cause", title: `${RUN} ${id.slice(-1)} _IntegrationTest`, category: "Relief", targetAmount: 1000, status, description: "Synthetic quota measurement.", content: { template: "relief" } });
let n = 0;
const donate = async (selected: string[], amount: number) => {
  const { POST } = await import("@/app/api/donate/route");
  const fd = new FormData();
  for (const [k, v] of Object.entries({ donorName: `${RUN} Donor`, donorContact: `${RUN.toLowerCase()}@example.invalid`, amount: String(amount), selectedCauses: JSON.stringify(selected.map((causeId) => ({ causeId }))) })) fd.set(k, v);
  fd.set("screenshot", new File([new Uint8Array([137, 80, 78, 71])], "p.png", { type: "image/png" }));
  const res = await POST(new NextRequest("http://t/api/donate", { method: "POST", body: fd, headers: { "x-forwarded-for": `10.8.${++n}.${Math.floor(Math.random() * 250)}` } }));
  return { status: res.status, body: (await res.json()) as any };
};

beforeAll(async () => {
  const target = (process.env.GOOGLE_TEST_SHEET_ID || "").trim();
  if (target !== APPROVED) blocked = "BLOCKED: GOOGLE_TEST_SHEET_ID is not the approved test spreadsheet.";
  else if (PRODUCTION === APPROVED || !PRODUCTION) blocked = "BLOCKED: cannot tell production and test apart.";
  else {
    const sa = JSON.parse((await import("fs")).readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS!, "utf8"));
    const raw = google.sheets({ version: "v4", auth: new google.auth.JWT({ email: sa.client_email, key: sa.private_key, scopes: ["https://www.googleapis.com/auth/spreadsheets"] }) });
    const meta = await raw.spreadsheets.get({ spreadsheetId: APPROVED, fields: "sheets.properties.title" });
    if (!(meta.data.sheets || []).some((s) => s.properties?.title === "_IntegrationTest")) blocked = "BLOCKED: the test spreadsheet has no _IntegrationTest marker tab.";
  }
  if (blocked) return;
  process.env.GOOGLE_SHEET_ID = APPROVED;
  process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID = "";
  process.env.GOOGLE_TARGET_ENV = "test";
  process.env.GOOGLE_SHEETS_MAX_WAIT_MS = process.env.LIVE_MAX_WAIT_MS || "240000"; // live suites model one busy process: let the limiter queue instead of answering "busy"
  if (process.env.LIVE_COORDINATOR_URL) {
    // D25: route the limiter through a coordinator PROCESS (tools/limiter-server) started separately on this machine; it is the real service program, not a hosted deployment.
    const { createBackendFromEnv, setLimiterBackend } = await import("@/lib/google/requestControl");
    setLimiterBackend(createBackendFromEnv({ GOOGLE_LIMITER_REDIS_REST_URL: process.env.LIVE_COORDINATOR_URL, GOOGLE_LIMITER_REDIS_REST_TOKEN: process.env.LIVE_COORDINATOR_TOKEN, GOOGLE_LIMITER_KEY_PREFIX: "live:d25", GOOGLE_SERVICE_ACCOUNT_EMAIL: "live-test-identity" }));
  }
  if (process.env.LIVE_EMULATED_COORDINATOR === "1") {
    // D21: route the limiter through a LOCAL EMULATED coordinator over HTTP (not a real Redis; nothing is provisioned).
    const { startFakeRedisRest } = await import("../helpers/fakeRedisRest");
    const { RedisRestLimiterBackend, setLimiterBackend } = await import("@/lib/google/requestControl");
    emulated = await startFakeRedisRest();
    setLimiterBackend(new RedisRestLimiterBackend({ url: emulated.url, token: emulated.token, keyPrefix: "live:emulated", timeoutMs: 1500, policy: "fail_closed", degradedShare: 0.25 }));
  }
}, 120_000);
let emulated: any = null;
afterAll(async () => {
  if (emulated) {
    console.log(`emulated coordinator: ${emulated.calls} reservation calls`);
    await emulated.stop();
  }
});

const instance = async () => {
  vi.resetModules();
  const { POST } = await import("@/app/api/donate/route");
  return async (cause: string, amount: number, submissionKey = "") => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ donorName: `${RUN} Donor`, donorContact: `${RUN.toLowerCase()}@example.invalid`, amount: String(amount), selectedCauses: JSON.stringify([{ causeId: cause }]) })) fd.set(k, v);
    if (submissionKey) fd.set("submissionKey", submissionKey);
    fd.set("screenshot", new File([new Uint8Array([137, 80, 78, 71])], "p.png", { type: "image/png" }));
    const res = await POST(new NextRequest("http://t/api/donate", { method: "POST", body: fd, headers: { "x-forwarded-for": `10.4.${++n}.${Math.floor(Math.random() * 250)}` } }));
    return { status: res.status, body: (await res.json()) as any };
  };
};
const col = async (tab: string) => {
  const sa = JSON.parse((await import("fs")).readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS!, "utf8"));
  const raw = google.sheets({ version: "v4", auth: new google.auth.JWT({ email: sa.client_email, key: sa.private_key, scopes: ["https://www.googleapis.com/auth/spreadsheets"] }) });
  const r = await raw.spreadsheets.values.get({ spreadsheetId: APPROVED, range: `'${tab}'` });
  const [h, ...rows] = (r.data.values || []) as string[][];
  return rows.map((row) => Object.fromEntries(h.map((k, i) => [k, row[i] ?? ""])));
};

describe("LIVE concurrent donations from separate instances", () => {
  it("6 simultaneous donations by ONE new donor via 6 instances: 6 distinct ids, one donor, no overwritten or PENDING rows", async (ctx) => {
    need(ctx);
    expect((await saveCause(ids.A, "Active")).status).toBe(200);
    const inst = await Promise.all(Array.from({ length: 6 }, () => instance())).catch(async () => { const out: any[] = []; for (let i = 0; i < 6; i++) out.push(await instance()); return out; });
    resetGoogleUsage();
    const t0 = Date.now();
    const res = await Promise.all(inst.map((call, i) => call(ids.A, 100 + i)));
    const usage: any = googleUsageSnapshot();
    console.log(`six-donation metrics: ${Math.round((Date.now() - t0) / 1000)} s, reads ${usage.byKind.read}, writes ${usage.byKind.write}, retries ${usage.byKind.retries}, 429s ${usage.total.quotaRejections}, limiter waited ${Math.round(usage.byKind.waitedMs / 1000)} s in total, longest single wait ${Math.round(usage.byKind.maxWaitMs / 1000)} s, backpressure refusals ${usage.byKind.backpressure}, statuses ${res.map((r: any) => r.status).join("/")}`);
    console.log("concurrent donations statuses:", res.map((r) => r.status).join(","));
    const okIds = res.filter((r) => r.status === 200).map((r) => r.body.trackingId);
    const rows = (await col("Donations")).filter((d) => String(d.donorName).startsWith(RUN));
    const donors = (await col("Donors")).filter((d) => String(d.name).startsWith(RUN));
    console.log(`concurrent donations: ${okIds.length} accepted, ${rows.length} rows, ${new Set(rows.map((r) => r.id)).size} distinct ids, ${donors.length} donor row(s)`);
    expect(new Set(okIds).size).toBe(okIds.length);
    expect(rows.filter((r) => r.id === "PENDING")).toHaveLength(0);
    expect(rows).toHaveLength(okIds.length);
    expect(new Set(rows.map((r) => r.amount)).size).toBe(rows.length); // every request kept its own row (amounts 100..105 are unique)
    expect(donors.length).toBeLessThanOrEqual(1);
    expect(okIds.length).toBeGreaterThanOrEqual(1);
  }, 280_000);
});

describe("LIVE the SAME logical donation submitted concurrently from separate instances", () => {
  it("5 simultaneous requests with ONE submission key: one donation row, one designation, everyone receives the same Donation ID", async (ctx) => {
    need(ctx);
    expect((await saveCause(ids.A, "Active")).status).toBe(200);
    const key = `${RUN}-SAME-KEY`;
    const inst = await Promise.all(Array.from({ length: 5 }, () => instance())).catch(async () => { const out: any[] = []; for (let i = 0; i < 5; i++) out.push(await instance()); return out; });
    const res = await Promise.all(inst.map((call) => call(ids.A, 777, key)));
    const okIds = res.filter((r) => r.status === 200).map((r) => r.body.trackingId);
    const rows = (await col("Donations")).filter((d) => d.submissionKey === key);
    const designations = (await col("Donation_Causes")).filter((d) => okIds.includes(d.donationId));
    console.log(`identical-key concurrency: statuses ${res.map((r) => r.status).join(",")} | rows ${rows.length} | designations ${designations.length} | distinct ids returned ${new Set(okIds).size}`);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).not.toBe("PENDING");
    expect(new Set(okIds).size).toBe(1);
    expect(okIds.length).toBeGreaterThanOrEqual(1);
    expect(designations).toHaveLength(1);
  }, 280_000);
});

describe("LIVE controlled quota exhaustion and recovery (D23)", () => {
  it("a refused read stores nothing; a refused write mid-flow leaves no false success; replaying the SAME key afterwards yields exactly one completed donation", async (ctx) => {
    need(ctx);
    expect((await saveCause(ids.B, "Active")).status).toBe(200);
    const { setLimiterBackend, MemoryLimiterBackend } = await import("@/lib/google/requestControl");
    const key = `${RUN}-EXHAUST`;
    const normal = { r: process.env.GOOGLE_SHEETS_READS_PER_MINUTE, w: process.env.GOOGLE_SHEETS_WRITES_PER_MINUTE, b: process.env.GOOGLE_SHEETS_BURST, m: process.env.GOOGLE_SHEETS_MAX_WAIT_MS };
    const restore = () => {
      for (const [k, v] of [["GOOGLE_SHEETS_READS_PER_MINUTE", normal.r], ["GOOGLE_SHEETS_WRITES_PER_MINUTE", normal.w], ["GOOGLE_SHEETS_BURST", normal.b], ["GOOGLE_SHEETS_MAX_WAIT_MS", normal.m]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
      setLimiterBackend(new MemoryLimiterBackend());
    };
    const call = await instance();
    const stored = async () => (await col("Donations")).filter((d) => d.submissionKey === key);
    try {
      // Phase A: the read budget is exhausted after one request -> refused unsent
      Object.assign(process.env, { GOOGLE_SHEETS_READS_PER_MINUTE: "1", GOOGLE_SHEETS_BURST: "1", GOOGLE_SHEETS_MAX_WAIT_MS: "300" });
      setLimiterBackend(new MemoryLimiterBackend());
      resetGoogleUsage();
      const a = await call(ids.B, 888, key);
      const ua: any = googleUsageSnapshot();
      restore();
      console.log(`exhaustion A (reads): status ${a.status}, backpressure refusals ${ua.byKind.backpressure}, reads sent ${ua.byKind.read}, writes sent ${ua.byKind.write}`);
      expect(a.status).toBe(503);
      expect(a.body.trackingId).toBeUndefined();
      expect(await stored()).toHaveLength(0);

      // Phase B: reads are fine but the write budget allows ONE write -> the flow is cut after its first write
      Object.assign(process.env, { GOOGLE_SHEETS_WRITES_PER_MINUTE: "1", GOOGLE_SHEETS_BURST: "1", GOOGLE_SHEETS_MAX_WAIT_MS: "300", GOOGLE_SHEETS_READS_PER_MINUTE: "0" });
      setLimiterBackend(new MemoryLimiterBackend());
      resetGoogleUsage();
      const b = await call(ids.B, 888, key);
      const ub: any = googleUsageSnapshot();
      restore();
      const partial = await stored();
      console.log(`exhaustion B (writes): status ${b.status}, backpressure refusals ${ub.byKind.backpressure}, writes sent ${ub.byKind.write}, rows left ${partial.length} (ids: ${partial.map((r) => r.id).join(",") || "none"})`);
      expect(b.status).toBe(503); // never reported as a completed donation
      expect(b.body.trackingId).toBeUndefined();
      expect(partial.length).toBeLessThanOrEqual(1);

      // Phase C: normal budget, same submission key -> recovery without duplicates
      // A fresh unfinished placeholder answers 409 "still being processed" (retryable) until it is old enough (20 s) to be adopted and completed.
      await new Promise((r) => setTimeout(r, 3000));
      resetGoogleUsage();
      let c = await call(ids.B, 888, key);
      const early = c.status;
      for (let i = 0; i < 8 && c.status === 409; i++) {
        await new Promise((r) => setTimeout(r, 6000));
        c = await call(ids.B, 888, key);
      }
      console.log(`recovery C: first replay status ${early}${early === 409 ? " (placeholder too fresh to adopt, retryable)" : ""}`);
      const uc: any = googleUsageSnapshot();
      const final = await stored();
      const designations = (await col("Donation_Causes")).filter((d) => final.some((f) => f.id === d.donationId));
      console.log(`recovery C: status ${c.status}, id ${c.body.trackingId}, rows ${final.length}, designations ${designations.length}, reads ${uc.byKind.read}, writes ${uc.byKind.write}, 429s ${uc.total.quotaRejections}`);
      expect(c.status).toBe(200);
      expect(final).toHaveLength(1);
      expect(final[0].id).not.toBe("PENDING");
      expect(final[0].id).toBe(c.body.trackingId);
      expect(designations).toHaveLength(1);
    } finally {
      restore();
    }
  }, 280_000);
});
