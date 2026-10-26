import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { driveConnectionStatus } from "@/lib/google/driveOAuth";

export const dynamic = "force-dynamic";

/** Non-secret connection status (never returns tokens). */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  return NextResponse.json({ success: true, ...(await driveConnectionStatus()) }, { headers: { "Cache-Control": "no-store" } });
}
