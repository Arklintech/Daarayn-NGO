/**
 * D38 LIVE minute-boundary test of the sliding-window limiter on the APPROVED TEST SPREADSHEET ONLY (real Google; one machine; NOT Vercel). Sends two back-to-back
 * bursts of 45 small reads through the shared coordinator in window mode: the second burst must be held until the first has aged out, so no 60 s window ever holds
 * more than 45 requests, whatever the alignment of Google's own minute. Records every 429 and 503. Same safety model as the other live suites.
 * Run with LIVE_COORDINATOR_URL / LIVE_COORDINATOR_TOKEN and GOOGLE_LIMITER_ALGORITHM=window.
 */
import "./env";
import { describe, it, expect, beforeAll } from "vitest";
import { googleUsageSnapshot, resetGoogleUsage } from "@/lib/google/usage";
import { google } from "googleapis";

const APPROVED = "1sGVsMEQDI1WmjWdUTQ0eKOzZC34Ri9CLsf4uUUceGzM";
const PRODUCTION = (process.env.GOOGLE_SHEET_ID || "").trim();
let blocked = "";

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
  process.env.GOOGLE_SHEETS_MAX_WAIT_MS = "240000"; // let the limiter queue: this test measures the schedule it produces
  const { createBackendFromEnv, setLimiterBackend } = await import("@/lib/google/requestControl");
  setLimiterBackend(createBackendFromEnv({ GOOGLE_LIMITER_REDIS_REST_URL: process.env.LIVE_COORDINATOR_URL, GOOGLE_LIMITER_REDIS_REST_TOKEN: process.env.LIVE_COORDINATOR_TOKEN, GOOGLE_LIMITER_KEY_PREFIX: "live:d38b", GOOGLE_SERVICE_ACCOUNT_EMAIL: "live-d38@invalid" } as any));
}, 120_000);

describe("D38 LIVE: sliding-window admission around the minute boundary (real Google, approved test sheet)", () => {
  it("two bursts of 45 reads: burst 1 is admitted at once, burst 2 waits for the window; no 429, no 503, never more than 45 inside any 60 s", async (ctx) => {
    if (blocked) return ctx.skip(blocked);
    expect(process.env.GOOGLE_LIMITER_ALGORITHM).toBe("window");
    // 90 DISTINCT real reads (a different cell each), every one governed by the shared limiter through the same retry wrapper the application uses.
    // (SheetsService would merge identical concurrent reads into one request, which would measure nothing.)
    const { withGoogleRetry } = await import("@/lib/google/retry");
    const sa = JSON.parse((await import("fs")).readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS!, "utf8"));
    const raw = google.sheets({ version: "v4", auth: new google.auth.JWT({ email: sa.client_email, key: sa.private_key, scopes: ["https://www.googleapis.com/auth/spreadsheets"] }) });
    const dispatched: number[] = []; // the moment each request is SENT: the function below runs only after the limiter has granted the slot
    let t0 = Date.now();
    const read = (i: number) =>
      withGoogleRetry(
        () => {
          dispatched.push(Date.now() - t0);
          return raw.spreadsheets.values.get({ spreadsheetId: APPROVED, range: `'_IntegrationTest'!A${i + 1}:A${i + 1}` });
        },
        { label: "boundary read", kind: "read" }
      );
    await raw.spreadsheets.values.get({ spreadsheetId: APPROVED, range: "'_IntegrationTest'!A1:A1" }); // warm the token and connection (outside the governed counts)
    resetGoogleUsage();
    t0 = Date.now();
    const one = async (i: number) => {
      await read(i);
    };
    await Promise.all(Array.from({ length: 45 }, (_, i) => one(i)));
    const burst1 = Date.now() - t0;
    const t1 = Date.now();
    await Promise.all(Array.from({ length: 45 }, (_, i) => one(45 + i))); // sent right after burst 1: still inside the same 60 s window
    const burst2 = Date.now() - t1;
    const u: any = googleUsageSnapshot();
    dispatched.sort((a, b) => a - b);
    let worst = 0;
    for (let i = 0, j = 0; i < dispatched.length; i++) {
      while (dispatched[i] - dispatched[j] >= 60_000) j++;
      worst = Math.max(worst, i - j + 1);
    }
    console.log(`D38 LIVE boundary: burst 1 finished in ${(burst1 / 1000).toFixed(1)} s, burst 2 (45 more, sent right after) finished in ${(burst2 / 1000).toFixed(1)} s after ITS send, total ${((Date.now() - t0) / 1000).toFixed(1)} s | reads ${u.byKind.read} | 429s ${u.total.quotaRejections} | retries ${u.byKind.retries} | max requests DISPATCHED in any 60 s window ${worst} (of 90 sent) | limiter waited ${Math.round(u.byKind.waitedMs / 1000)} s total, longest single ${Math.round(u.byKind.maxWaitMs / 1000)} s`);
    expect(u.byKind.read).toBe(90); // all 90 distinct requests really went out and were counted
    expect(u.total.quotaRejections).toBe(0);
    expect(u.byKind.retries).toBe(0);
    expect(burst1).toBeLessThan(15_000); // an idle window admits the whole burst at once
    expect(Date.now() - t0).toBeGreaterThan(55_000); // the second burst was held for the window
    expect(worst).toBeLessThanOrEqual(46);
  }, 240_000);
});
