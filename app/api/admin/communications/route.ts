import { NextResponse } from "next/server";
import { communicationRepository } from "@/lib/repositories/communicationRepository";

export async function GET() {
  try {
    const communications = await communicationRepository.getAll();
    return NextResponse.json({
      success: true,
      communications
    });
  } catch (error: any) {
    console.error("[CommunicationsAPI] Failed to fetch communications from Google Sheets:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
