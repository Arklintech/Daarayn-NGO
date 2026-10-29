import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { getSheetsClient, getDriveClient, GOOGLE_SHEET_ID, GOOGLE_DRIVE_ROOT_FOLDER_ID } from "@/lib/google/client";
import { runSheetsReadiness } from "@/lib/google/readiness";
import { limiterStatus } from "@/lib/google/requestControl";
// Importing the repositories registers every expected worksheet and header row (no request is made by importing them).
import "@/lib/repositories";
import "@/lib/catalog/programContent";
import "@/lib/catalog/programImages";
import "@/lib/realtime/eventLog";
import "@/lib/donors/portalGuard";
import "@/lib/google/driveOAuth";

export const dynamic = "force-dynamic";

/**
 * Administrator-only, read-only readiness of the Google Sheets / Drive configuration. Never writes, never creates a worksheet,
 * never returns a secret or a full id. HTTP 200 only when operational, so a monitor can alert on the status code alone.
 */
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const report = await runSheetsReadiness({
    sheets: getSheetsClient,
    drive: getDriveClient,
    spreadsheetId: GOOGLE_SHEET_ID,
    folderId: GOOGLE_DRIVE_ROOT_FOLDER_ID,
  });
  const limiter0 = limiterStatus();
  const status = !limiter0.ready ? 503 : report.state === "operational" ? 200 : report.state === "quota_limited" || report.state === "temporarily_unavailable" ? 503 : 424;
  const limiter = limiterStatus();
  const limiterWarning = limiter.crossInstance ? undefined : "Request limiter is process-local: separate instances using one Google service account are NOT coordinated. Configure the shared coordinator before running more than one instance.";
  return NextResponse.json({ success: report.state === "operational" && limiter.ready, ...report, ...(limiter.ready ? {} : { state: "limiter_not_configured" }), limiter: { ...limiter, warning: limiterWarning } }, { status, headers: { "Cache-Control": "no-store" } });
}
