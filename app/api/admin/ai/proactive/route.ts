import { requireAdmin } from "@/lib/server/auth";
import { NextResponse } from "next/server";
import { ExecutiveAnticipationEngine } from "@/lib/ai/eoas/ExecutiveAnticipationEngine";

export async function GET(request: Request) {
  const adminAuth = await requireAdmin(request);
  if (adminAuth instanceof NextResponse) return adminAuth;

  try {
    const alertText = await ExecutiveAnticipationEngine.generateStrategicAlerts();
    
    return NextResponse.json({
      success: true,
      alert: alertText
    });
  } catch (error) {
    console.error("[ProactiveAPI] Exception:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
