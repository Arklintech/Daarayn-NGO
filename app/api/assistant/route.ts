/**
 * app/api/assistant/route.ts
 *
 * API route for the Public Trust Assistant.
 * Serves website visitors using standard guest / public permissions constraints.
 */

import { NextResponse } from "next/server";
import { processChatMessage } from "@/lib/ai/conversationManager";

export async function POST(request: Request) {
  try {
    const { message, history, sessionId } = await request.json();

    if (!message) {
      return NextResponse.json({ success: false, error: "message is required." }, { status: 400 });
    }

    const sessionKey = sessionId || `PUBLIC-SESS-${Date.now()}`;

    const result = await processChatMessage({
      sessionId: sessionKey,
      userId: "anonymous-guest",
      userRole: "public",
      message,
      history: history || [],
    });

    return NextResponse.json({
      success: true,
      sessionId: sessionKey,
      reply: result.reply,
      references: result.references,
    });
  } catch (error) {
    console.error("[AssistantAPI] Exception:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
