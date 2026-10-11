/**
 * app/api/admin/ai/health/route.ts
 *
 * API endpoint to run a comprehensive health check on the active AI completions service.
 * Reports status (Healthy/Degraded/Offline), config, and per-stage diagnostics.
 */

import { requireAdmin } from "@/lib/server/auth";
import { NextResponse } from "next/server";
import { checkAIHealth } from "@/lib/ai/grok";

export async function GET(request: Request) {
  const adminAuth = await requireAdmin(request);
  if (adminAuth instanceof NextResponse) return adminAuth;

  try {
    const report = await checkAIHealth();
    return NextResponse.json({
      success: true,
      ...report
    });
  } catch (error) {
    console.error("[HealthGETAPI] Exception:", error);
    return NextResponse.json({
      success: false,
      status: "Offline",
      details: (error as Error).message,
      timestamp: new Date().toISOString(),
      stages: [],
    }, { status: 500 });
  }
}
