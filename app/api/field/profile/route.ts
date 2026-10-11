import { NextRequest, NextResponse } from "next/server";
import { requireAgent } from "@/lib/server/auth";

/** Returns the signed-in field agent's own profile (resolved from the verified token). */
export async function GET(request: NextRequest) {
  try {
    const principal = await requireAgent(request);
    if (principal instanceof NextResponse) return principal;
    return NextResponse.json(principal.agent);
  } catch (error: any) {
    console.error("[API/FieldProfile] Failed to fetch agent profile:", error);
    return NextResponse.json(
      { error: "Internal server error fetching agent profile." },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
