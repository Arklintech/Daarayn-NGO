/**
 * app/api/admin/ai/stats/route.ts
 *
 * API endpoint to serve aggregated stats for the AI Trust Intelligence dashboard.
 */

import { requireAdmin } from "@/lib/server/auth";
import { NextResponse } from "next/server";
import { getAIAnalytics } from "@/lib/ai/services/insights";

export async function GET(request: Request) {
  const adminAuth = await requireAdmin(request);
  if (adminAuth instanceof NextResponse) return adminAuth;

  try {
    const stats = await getAIAnalytics();
    return NextResponse.json({ success: true, stats });
  } catch (error) {
    console.error("[StatsGETAPI] Error:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
