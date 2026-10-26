import { requireAdmin } from "@/lib/server/auth";
import { NextRequest, NextResponse } from "next/server";
import { runOperationsSetup } from "@/lib/setup/operationsSchema";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Schema setup for the operations model. Admin only. DRY RUN unless the body says {"apply": true}.
 * Body: { apply?: boolean, backfill?: boolean }. Never deletes or rewrites existing data.
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  try {
    const body = await request.json().catch(() => ({}));
    const report = await runOperationsSetup({ apply: body.apply === true, backfill: body.backfill === true });
    console.log(`[Setup] operations schema ${report.applied ? "APPLIED" : "dry-run"} by ${admin.email}: ${JSON.stringify({ ...report, columnsToAdd: Object.keys(report.columnsToAdd) })}`);
    return NextResponse.json({ success: true, ...report });
  } catch (error: any) {
    console.error("[Setup] failed:", error?.message);
    return NextResponse.json({ success: false, error: error?.message || "Setup failed." }, { status: 500 });
  }
}
