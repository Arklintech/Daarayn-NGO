import { requireAdmin } from "@/lib/server/auth";
import { NextResponse } from "next/server";
import { communicationRepository } from "@/lib/repositories/communicationRepository";

export async function GET(request: Request) {
  const adminAuth = await requireAdmin(request);
  if (adminAuth instanceof NextResponse) return adminAuth;

  try {
    const communications = await communicationRepository.getAll();
    return NextResponse.json({
      success: true,
      communications
    });
  } catch (error: any) {
    console.error("[CommunicationsAPI] Failed to fetch communications from Google Sheets:", error);
    // Never pass a raw Google error to the browser; say what could not be read.
    return NextResponse.json({ success: false, error: "Communication history could not be read from Google Sheets." }, { status: 503 });
  }
}
