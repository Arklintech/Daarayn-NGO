/**
 * lib/ai/conversationManager.ts
 *
 * Legacy wrapper for Daarayn AI-TOS conversation processing.
 * Delegates query requests directly to Phase 2 KHIDR Knowledge Intelligence Engine (MKIE).
 */

import { processKhidrChatMessage } from "./knowledge/conversationManager";
import type { KhidrRole } from "./knowledge/permissionEngine";

export interface ChatSessionRequest {
  sessionId: string;
  userId: string;
  userRole: "super_admin" | "editor" | "inspector" | "public";
  message: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface ChatSessionResponse {
  success: boolean;
  reply: string;
  actionPlan: any | null;
  references: Array<{ source: string; content: string }>;
  metadata?: {
    department: string;
    contextSummary: string;
    collections: string[];
    role: string;
  };
}

/**
 * Legacy wrapper processing incoming chats through the Phase 2 intelligence layer.
 */
export async function processChatMessage(
  req: ChatSessionRequest
): Promise<ChatSessionResponse> {
  try {
    const result = await processKhidrChatMessage({
      sessionId: req.sessionId,
      userId: req.userId,
      userRole: req.userRole as KhidrRole,
      message: req.message,
      history: req.history,
    });

    return {
      success: result.success,
      reply: result.reply,
      actionPlan: result.actionPlan,
      references: result.references,
      metadata: result.metadata,
    };
  } catch (error) {
    console.error("[CM Wrapper] Delegation failed:", error);
    return {
      success: false,
      reply: `I encountered an operational issue wrapping your query: ${(error as Error).message}`,
      actionPlan: null,
      references: [],
    };
  }
}
