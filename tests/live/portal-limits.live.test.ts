/**
 * LIVE Google request-count measurement on the APPROVED TEST SPREADSHEET ONLY (quota cost per operation).
 * Run: npx vitest run --config vitest.live.config.ts tests/live/portal-limits.live.test.ts
 * TEST_CLOCK_OFFSET_DAYS shifts the server clock only for a process already authorised to write to the approved test resources. Refuses unless the sheet is the approved id, differs from production and has
 * the `_IntegrationTest` marker; e-mail, Drive uploads, realtime and Firebase are stubbed. 
 */
import "./env";
import { describe, it, expect, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { google } from "googleapis";

const APPROVED = "1sGVsMEQDI1WmjWdUTQ0eKOzZC34Ri9CLsf4uUUceGzM";
const PRODUCTION = (process.env.GOOGLE_SHEET_ID || "").trim();

vi.mock("@/lib/server/auth", async () => {
  const { NextResponse } = await import("next/server");
  const admin = { kind: "admin", uid: "live-portal", email: "live-portal@example.invalid" };
  return { requireAdmin: async () => admin, requireAgent: async () => NextResponse.json({}, { status: 401 }), requireAdminOrAgent: async () => admin };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendDonationEmail: vi.fn(async () => ({ sent: false, skipped: "live test: e-mail disabled" })) }));
const mailer = vi.hoisted(() => ({ sent: 0 }));
vi.mock("@/lib/email/providerManager", () => ({ sendEmail: vi.fn(async () => { mailer.sent++; throw new Error("live test: e-mail disabled"); }), verifyEmailProvider: vi.fn(async () => false) }));
vi.mock("@/lib/google/drive", () => ({ driveService: { uploadFile: vi.fn(async () => ({ drive_file_id: "STUB-NO-REAL-UPLOAD", backend: "stub" })), deleteFile: vi.fn(async () => undefined) } }));
vi.mock("@/lib/realtime/broadcaster", () => ({ realtimeBroadcaster: { publish: vi.fn(async () => ({ delivered: "log" })), publishBatch: vi.fn(async () => ({ delivered: "log" })), broadcast: vi.fn() } }));

const RUN = `ZZ_PORTAL_${Date.now().toString(36)}`;
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
  process.env.GOOGLE_SHEETS_MAX_WAIT_MS = "240000"; // live suites model one busy process: let the limiter queue instead of answering "busy"
}, 120_000);

const KNOWN = "zz.d10.donor@example.invalid"; // synthetic donor with an e-mail already in the test sheet (the transport is mocked: nothing can be sent)
const lookup = async (identifier: string, ip: string) => {
  const { POST } = await import("@/app/api/donor/lookup/route");
  return POST(new NextRequest("http://t/api/donor/lookup", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify({ identifier }) }));
};
const settle = () => new Promise((r) => setTimeout(r, 1500)); // the code mail is queued after the response
const rawRows = async () => {
  const sa = JSON.parse((await import("fs")).readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS!, "utf8"));
  const raw = google.sheets({ version: "v4", auth: new google.auth.JWT({ email: sa.client_email, key: sa.private_key, scopes: ["https://www.googleapis.com/auth/spreadsheets"] }) });
  const r = await raw.spreadsheets.values.get({ spreadsheetId: APPROVED, range: "'Portal_Auth_Events'" });
  return (r.data.values || []) as string[][];
};

describe("LIVE donor portal limits (state lives in Google Sheets)", () => {
  it("per-identifier limit: at most 3 codes are queued for one identifier however the IP changes; a fresh module instance (second server) is bound by the same Sheets state; the sheet stores hashes only", async (ctx) => {
    need(ctx);
    const answers: number[] = [];
    for (let i = 0; i < 5; i++) answers.push((await lookup(KNOWN, `10.5.${i}.${RUN.length}`)).status);
    await settle();
    expect(answers.every((s) => s === 200)).toBe(true); // identical generic answer whether or not a code is queued
    const sent = mailer.sent;
    expect(sent).toBeLessThanOrEqual(3);

    vi.resetModules(); // a different server instance has no in-memory state: only the Sheets state can refuse
    expect((await lookup(KNOWN, "10.5.99.1")).status).toBe(200);
    await settle();
    expect(mailer.sent).toBe(sent); // refused silently: no further code

    const text = JSON.stringify(await rawRows());
    expect(text).not.toContain(KNOWN);
    console.log(`portal: ${sent} code(s) queued across 6 requests (limit 3 per identifier), second instance still limited, sheet stores hashes only`);
  }, 240_000);

  it("per-IP limit: the 11th request from one IP inside the window is answered 429", async (ctx) => {
    need(ctx);
    const ip = `10.6.${Date.now() % 250}.${RUN.length}`;
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push((await lookup(`zz.unknown.${i}.${RUN.toLowerCase()}@example.invalid`, ip)).status);
    expect(codes.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(codes[10]).toBe(429);
    console.log("portal: 10 requests from one IP allowed, 11th refused with 429");
  }, 240_000);
});

/** Separate application instances: each gets its own module graph (own caches, own in-memory state). */
async function instances(n: number) {
  const out: ((identifier: string, ip: string) => Promise<Response>)[] = [];
  for (let i = 0; i < n; i++) {
    vi.resetModules();
    const { POST } = await import("@/app/api/donor/lookup/route");
    out.push((identifier, ip) => POST(new NextRequest("http://t/api/donor/lookup", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify({ identifier }) })));
  }
  return out;
}

describe("LIVE donor portal limits under CONCURRENCY from separate instances", () => {
  it("8 simultaneous requests for one identifier from 8 instances and 8 different IPs queue at most 3 codes and answer identically", async (ctx) => {
    need(ctx);
    const identifier = `zz_final_mvs4h887@example.invalid`; // synthetic donor with an e-mail in the test sheet; the transport is mocked
    const before = mailer.sent;
    const inst = await instances(8);
    const res = await Promise.all(inst.map((call, i) => call(identifier, `10.20.${i}.${RUN.length}`)));
    await new Promise((r) => setTimeout(r, 3000));
    const queued = mailer.sent - before;
    console.log(`portal concurrency (identifier): statuses ${res.map((r) => r.status).join(",")} | codes queued ${queued} (limit 3)`);
    expect(res.every((r) => r.status === 200)).toBe(true);
    expect(queued).toBeLessThanOrEqual(3);
    const bodies = await Promise.all(res.map((r) => r.json()));
    expect(bodies.every((b) => b.message === bodies[0].message)).toBe(true); // same wording whether or not a code was queued
  }, 280_000);

  it("14 simultaneous requests from ONE IP across 7 instances: at most 10 are answered 200, the rest 429", async (ctx) => {
    need(ctx);
    const ip = `10.30.${Date.now() % 250}.${RUN.length}`;
    const inst = await instances(7);
    const res = await Promise.all(Array.from({ length: 14 }, (_, i) => inst[i % 7](`zz.conc.${i}.${RUN.toLowerCase()}@example.invalid`, ip)));
    const ok = res.filter((r) => r.status === 200).length;
    const limited = res.filter((r) => r.status === 429).length;
    console.log(`portal concurrency (IP): ${ok} allowed, ${limited} refused (limit 10)`);
    expect(ok).toBeLessThanOrEqual(10);
    expect(ok + limited).toBe(14);
    expect(limited).toBeGreaterThanOrEqual(4);
  }, 280_000);

  it("no raw identifier or IP is stored (hashes only)", async (ctx) => {
    need(ctx);
    const text = JSON.stringify(await rawRows());
    expect(text).not.toMatch(/zz_final_mvs4h887|zz\.conc|10\.30\.|10\.20\./);
  }, 120_000);
});
