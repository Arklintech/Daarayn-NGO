import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { googleUsageSnapshot } from "@/lib/google/usage";

export const dynamic = "force-dynamic";

/** Google API attempts made by this server instance (per operation and per minute) for quota investigations. No record data. */
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  return NextResponse.json({ success: true, scope: "this server instance only", ...googleUsageSnapshot() }, { headers: { "Cache-Control": "no-store" } });
}
