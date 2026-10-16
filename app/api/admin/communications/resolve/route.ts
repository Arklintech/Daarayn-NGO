import { requireAdmin } from "@/lib/server/auth";
import { NextResponse } from "next/server";
import { resolveRecipients } from "@/lib/communication-resolver";

export async function POST(req: Request) {
  const adminAuth = await requireAdmin(req);
  if (adminAuth instanceof NextResponse) return adminAuth;

  try {
    const { causeIds, type } = await req.json();

    if (!causeIds || !Array.isArray(causeIds) || causeIds.length === 0) {
      return NextResponse.json({ success: false, error: "Missing selected causes." }, { status: 400 });
    }

    const { uniqueDonors, stats } = await resolveRecipients(causeIds, type || "general_communication");

    return NextResponse.json({
      success: true,
      count: uniqueDonors.length,
      stats
    });
  } catch (error: any) {
    const errorMsg = error?.message || "Unknown error";
    console.error("[Resolve] Failed to resolve recipients:", errorMsg, error?.code);

    // Network/API errors
    if (errorMsg.includes("ENOTFOUND") || errorMsg.includes("ECONNREFUSED") || errorMsg.includes("timeout")) {
      return NextResponse.json({
        success: false,
        error: "Unable to reach data services. Please check your network connection and try again.",
        code: "SERVICE_UNAVAILABLE"
      }, { status: 503 });
    }

    return NextResponse.json({
      success: false,
      error: "Failed to resolve recipients. Please try again.",
      code: "RESOLUTION_ERROR"
    }, { status: 500 });
  }
}
