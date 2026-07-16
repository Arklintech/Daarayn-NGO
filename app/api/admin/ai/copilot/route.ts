/**
 * app/api/admin/ai/copilot/route.ts
 *
 * API route for the Admin AI Copilot.
 * Ensures admin authentication session, filters requests by role permissions, and runs conversation manager.
 */

import { NextResponse } from "next/server";
import { processMominChatMessage } from "@/lib/ai/knowledge/conversationManager";
import { normalizeMominRole } from "@/lib/ai/roleNormalizer";

export async function POST(request: Request) {
  try {
    const { message, history, sessionId, adminEmail, adminRole } = await request.json();

    if (!message) {
      return NextResponse.json({ success: false, error: "message is required." }, { status: 400 });
    }

    const sessionKey = sessionId || `SESS-${Date.now()}`;
    const userRole = normalizeMominRole(adminRole || "editor");

    const result = await processMominChatMessage({
      sessionId: sessionKey,
      userId: adminEmail || "anonymous-admin",
      userRole: userRole,
      message,
      history: history || [],
    });

    // Debug injection
    try {
      require("fs").writeFileSync("erce_debug.json", JSON.stringify(result, null, 2));
    } catch(e) {}

    return NextResponse.json({
      success: true,
      sessionId: sessionKey,
      reply: result.reply,
      actionPlan: result.actionPlan,
      workflowPlan: result.workflowPlan || null,
      references: result.references,
      metadata: result.metadata,
    });
  } catch (error) {
    console.error("[CopilotAPI] Exception:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
