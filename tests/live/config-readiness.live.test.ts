/**
 * LIVE, READ-ONLY readiness check. Run: npx vitest run --config vitest.live.config.ts tests/live/config-readiness.live.test.ts
 * Only metadata and header rows are read (no write, no worksheet creation, no e-mail). Ids are never printed in full.
 */
import "./env";
import { describe, it, expect } from "vitest";
import { getSheetsClient, getDriveClient, GOOGLE_SHEET_ID, GOOGLE_DRIVE_ROOT_FOLDER_ID } from "@/lib/google/client";
import { runSheetsReadiness } from "@/lib/google/readiness";
import "@/lib/repositories";
import "@/lib/catalog/programContent";
import "@/lib/catalog/programImages";
import "@/lib/realtime/eventLog";
import "@/lib/donors/portalGuard";
import "@/lib/google/driveOAuth";

const deps = (spreadsheetId: string) => ({ sheets: getSheetsClient, drive: getDriveClient, spreadsheetId, folderId: GOOGLE_DRIVE_ROOT_FOLDER_ID });
const TEST_SHEET = (process.env.GOOGLE_TEST_SHEET_ID || "1sGVsMEQDI1WmjWdUTQ0eKOzZC34Ri9CLsf4uUUceGzM").trim();

describe("live readiness (read-only)", () => {
  it("reports the effective target and classifies the configured spreadsheet", async () => {
    const r = await runSheetsReadiness(deps(GOOGLE_SHEET_ID));
    console.log("effective target fingerprint:", r.config.spreadsheet.fingerprint, "| is isolated test sheet:", GOOGLE_SHEET_ID === TEST_SHEET, "| declared:", r.config.declaredTarget, "| credentials:", r.config.credentials.source);
    console.log("state:", r.state, "| tabs", r.tabs.found + "/" + r.tabs.expected, "| drive:", r.drive.state);
    console.log("drift:", r.drift.map((d) => `${d.tab}:${d.kind}:${d.severity}`).join(", ") || "none");
    expect(["operational", "schema_incomplete"]).toContain(r.state);
    expect(JSON.stringify(r)).not.toContain(GOOGLE_SHEET_ID);
  }, 60_000);

  it("a well-formed id that is not a spreadsheet is classified, not retried forever", async () => {
    const r = await runSheetsReadiness(deps("1" + "A".repeat(43)));
    console.log("unknown-id state:", r.state);
    expect(["spreadsheet_not_found", "permission_denied"]).toContain(r.state);
  }, 60_000);

  it("a malformed id is configuration_invalid and no request is sent", async () => {
    const r = await runSheetsReadiness({ ...deps("not a valid id"), config: { env: { ...process.env, GOOGLE_SHEET_ID: "not a valid id" }, readFile: () => null } });
    expect(r.state).toBe("configuration_invalid");
  });
});
