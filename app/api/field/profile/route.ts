import { NextRequest, NextResponse } from "next/server";
import { fieldAgentRepository } from "@/lib/repositories/fieldAgentRepository";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get("uid");
    const email = searchParams.get("email");

    if (!uid && !email) {
      return NextResponse.json(
        { error: "uid or email parameter is required." },
        { status: 400 }
      );
    }

    let agent: any = null;
    if (uid) {
      agent = await fieldAgentRepository.getByFirebaseUid(uid);
    }
    if (!agent && email) {
      agent = await fieldAgentRepository.getByEmail(email);
    }

    if (!agent) {
      return NextResponse.json({ error: "Agent profile not found." }, { status: 404 });
    }

    return NextResponse.json(agent);
  } catch (error: any) {
    console.error("[API/FieldProfile] Failed to fetch agent profile:", error);
    return NextResponse.json(
      { error: "Internal server error fetching agent profile." },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
