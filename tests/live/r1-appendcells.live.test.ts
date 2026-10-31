/**
 * LIVE check for R1 on the APPROVED TEST SPREADSHEET ONLY: does `spreadsheets.batchUpdate` + `appendCells` store the SAME cell values as
 * `values.append` with USER_ENTERED (what SheetsService writes today)? Uses its own throw-away tab, removed at the end. Synthetic strings only.
 * Run: npx vitest run --config vitest.live.config.ts tests/live/r1-appendcells.live.test.ts
 */
import "./env";
import { describe, it, expect } from "vitest";
import { google } from "googleapis";
import { toUserEnteredCell } from "@/lib/google/sheets";

const APPROVED = "1sGVsMEQDI1WmjWdUTQ0eKOzZC34Ri9CLsf4uUUceGzM";
const PRODUCTION = (process.env.GOOGLE_SHEET_ID || "").trim();

// The shapes the follow-up rows really contain: these MUST be stored identically by both paths.
const MUST_MATCH = [
  "DA001", "NOTIF-1761900000000-ab12", "AUDIT-1761900000000-ab12", "DONATION", "New Donation Received",
  "2026-10-31T11:50:07.016Z", "450", "450.5", "0.10", "1000000", "12345678901234567890", "9876543210",
  "true", "false", "TRUE", "{\"a\":1,\"b\":[1,2]}", "[]", "null", " leading space", "line1\nline2", "₹500",
  "Received ₹1,500 for Multiple Causes from A (Ref: 123) — awaiting verification", "",
];
// Strings USER_ENTERED silently converts (date, fraction, percent, scientific, leading zero, plus sign, formula, leading apostrophe).
// appendCells keeps them as literal text on purpose. Listed, never asserted equal.
const INTENTIONAL_DIFFERENCES = ["2026-10-31", "007", "+919876543210", "=1+1", "'quoted", "1e5", "5/6", "10%"];
const SAMPLES = [...MUST_MATCH, ...INTENTIONAL_DIFFERENCES];

describe("R1: appendCells stores the same values as USER_ENTERED values.append", () => {
  it("per-cell comparison on a throw-away tab of the approved test spreadsheet", async (ctx) => {
    if ((process.env.GOOGLE_TEST_SHEET_ID || "").trim() !== APPROVED || !PRODUCTION || PRODUCTION === APPROVED) return ctx.skip("BLOCKED: approved test spreadsheet not configured");
    const sa = JSON.parse((await import("fs")).readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS!, "utf8"));
    const sheets = google.sheets({ version: "v4", auth: new google.auth.JWT({ email: sa.client_email, key: sa.private_key, scopes: ["https://www.googleapis.com/auth/spreadsheets"] }) });
    const title = `_R1Probe_${Date.now().toString(36)}`;
    const add = await sheets.spreadsheets.batchUpdate({ spreadsheetId: APPROVED, requestBody: { requests: [{ addSheet: { properties: { title } } }] } });
    const sheetId = add.data.replies![0].addSheet!.properties!.sheetId!;
    try {
      // row 1 = USER_ENTERED values.append, row 2 = appendCells (two separate requests; the tab is private to this test)
      await sheets.spreadsheets.values.append({ spreadsheetId: APPROVED, range: `'${title}'!A:A`, valueInputOption: "USER_ENTERED", insertDataOption: "INSERT_ROWS", requestBody: { values: [SAMPLES] } });
      await sheets.spreadsheets.batchUpdate({ spreadsheetId: APPROVED, requestBody: { requests: [{ appendCells: { sheetId, rows: [{ values: SAMPLES.map(toUserEnteredCell) }], fields: "userEnteredValue" } }] } });
      const got = await sheets.spreadsheets.get({ spreadsheetId: APPROVED, ranges: [`'${title}'!A1:AF2`], includeGridData: true, fields: "sheets.data.rowData.values(formattedValue,effectiveValue,userEnteredValue)" });
      const rows = got.data.sheets![0].data![0].rowData!;
      const kind = (c: any) => (c?.effectiveValue ? Object.keys(c.effectiveValue)[0] : "empty");
      const diffs: string[] = [];
      const intended: string[] = [];
      SAMPLES.forEach((s, i) => {
        const a = rows[0].values?.[i] || {};
        const b = rows[1]?.values?.[i] || {};
        if ((a.formattedValue ?? "") !== (b.formattedValue ?? "") || kind(a) !== kind(b)) (MUST_MATCH.includes(s) ? diffs : intended).push(`${JSON.stringify(s)}: values.append -> ${kind(a)} ${JSON.stringify(a.formattedValue ?? "")} | appendCells -> ${kind(b)} ${JSON.stringify(b.formattedValue ?? "")}`);
      });
      console.log(`R1 live comparison: ${MUST_MATCH.length} app-shaped samples, ${diffs.length} unexpected differences; ${intended.length} of ${INTENTIONAL_DIFFERENCES.length} awkward strings differ by design`);
      for (const d of diffs) console.log("  UNEXPECTED " + d);
      for (const d of intended) console.log("  BY DESIGN  " + d);
      expect(diffs).toEqual([]);
    } finally {
      await sheets.spreadsheets.batchUpdate({ spreadsheetId: APPROVED, requestBody: { requests: [{ deleteSheet: { sheetId } }] } });
    }
  }, 120_000);
});
