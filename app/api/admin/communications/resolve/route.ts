import { NextResponse } from "next/server";
import { resolveRecipients } from "@/lib/communication-resolver";

export async function POST(req: Request) {
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
    console.error("Failed to resolve recipients:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
