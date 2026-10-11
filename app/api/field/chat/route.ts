import { NextRequest, NextResponse } from "next/server";
import { realtimeBroadcaster } from "@/lib/realtime/broadcaster";
import { fieldMessageRepository, FieldChatMessageEntity } from "@/lib/repositories/fieldMessageRepository";
import { fieldReportRepository } from "@/lib/repositories/fieldReportRepository";
import { requireAdminOrAgent, type AgentPrincipal } from "@/lib/server/auth";
import fs from "fs";
import path from "path";

const isVercel = process.env.VERCEL || process.env.NEXT_PUBLIC_VERCEL || process.env.NODE_ENV === "production";
const chatStorageFile = isVercel
  ? "/tmp/field_chat.json"
  : path.join(process.cwd(), "data", "field_chat.json");

function getLocalFallback(): FieldChatMessageEntity[] {
  try {
    if (fs.existsSync(chatStorageFile)) {
      return JSON.parse(fs.readFileSync(chatStorageFile, "utf8"));
    }
  } catch {}
  return [];
}

/** Agents may only use their own general thread and threads of reports they submitted. */
async function agentOwnsConversation(principal: AgentPrincipal, conversationId: string): Promise<boolean> {
  const agentId = principal.agent.id;
  if (conversationId === `conv_${agentId}_general`) return true;
  if (!conversationId.startsWith("conv_")) return false;
  const report = await fieldReportRepository.getById(conversationId.slice("conv_".length));
  return !!report && report.agentId === agentId;
}

function saveLocalFallback(history: FieldChatMessageEntity[]) {
  try {
    const dir = path.dirname(chatStorageFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(chatStorageFile, JSON.stringify(history, null, 2), "utf8");
  } catch {}
}

export async function GET(request: NextRequest) {
  try {
    const principal = await requireAdminOrAgent(request);
    if (principal instanceof NextResponse) return principal;

    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get("conversationId");
    const force = searchParams.get("force") === "true";

    if (principal.kind === "agent") {
      if (!conversationId) {
        return NextResponse.json({ error: "conversationId is required." }, { status: 400 });
      }
      if (!(await agentOwnsConversation(principal, conversationId))) {
        return NextResponse.json({ error: "You do not have access to this conversation." }, { status: 403 });
      }
    }

    let all: FieldChatMessageEntity[] = [];
    try {
      all = await fieldMessageRepository.getAll(force);
    } catch (sheetErr: any) {
      console.warn("[API/FieldChat] Sheets fetch warning, checking fallback:", sheetErr.message);
      all = getLocalFallback();
    }

    if (conversationId) {
      const filtered = all.filter((m) => m.conversationId === conversationId);
      return NextResponse.json(filtered);
    }
    return NextResponse.json(all);
  } catch (error: any) {
    console.error("[API/FieldChat] Error fetching messages:", error);
    return NextResponse.json({ error: "Failed to load messages" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const principal = await requireAdminOrAgent(request);
    if (principal instanceof NextResponse) return principal;

    const body = await request.json();
    const { conversationId, text, attachmentDriveFileId, reportId, agentId } = body;
    let { senderId, senderRole, senderName } = body;

    if (!conversationId || !text) {
      return NextResponse.json(
        { error: "conversationId and text are required." },
        { status: 400 }
      );
    }

    // Sender identity comes from the verified session, never from the request body.
    if (principal.kind === "agent") {
      if (!(await agentOwnsConversation(principal, conversationId))) {
        return NextResponse.json({ error: "You do not have access to this conversation." }, { status: 403 });
      }
      senderId = principal.agent.id;
      senderRole = "Agent";
      senderName = principal.agent.name;
    } else {
      senderId = senderId || principal.email;
      senderRole = "Admin";
      senderName = senderName || "Daarayn Admin";
    }

    // Derive reportId and agentId if not explicitly passed
    let derivedReportId = reportId;
    let derivedAgentId = agentId;
    if (!derivedReportId && conversationId.startsWith("conv_") && !conversationId.includes("_general")) {
      derivedReportId = conversationId.replace("conv_", "");
    }
    if (!derivedAgentId && conversationId.includes("_general")) {
      derivedAgentId = conversationId.replace("conv_", "").replace("_general", "");
    } else if (!derivedAgentId && senderRole === "Agent") {
      derivedAgentId = senderId;
    }

    const nowIso = new Date().toISOString();
    const messageId = `MSG-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

    const message: FieldChatMessageEntity = {
      id: messageId,
      conversationId,
      reportId: derivedReportId,
      agentId: derivedAgentId,
      senderId,
      senderRole: senderRole || "Agent",
      senderName: senderName || "Agent",
      text,
      timestamp: nowIso,
      read: false,
      attachmentDriveFileId,
    };

    // 1. Persist to Operational Datastore (Google Sheets)
    try {
      await fieldMessageRepository.save(message);
    } catch (saveErr: any) {
      console.error("[API/FieldChat] Sheets save error:", saveErr.message);
      // Ensure message is kept in local fallback if sheets temporarily unavailable
      const local = getLocalFallback();
      local.push(message);
      saveLocalFallback(local);
    }

    // Update local mirror as well for instant resilience
    try {
      const local = getLocalFallback();
      if (!local.some((m) => m.id === message.id)) {
        local.push(message);
        saveLocalFallback(local);
      }
    } catch {}

    // 2. Broadcast via Realtime Layer (SSE) for Instantaneous Delivery
    realtimeBroadcaster.broadcast("CHAT_MESSAGE", message);
    realtimeBroadcaster.broadcast(`CHAT_MESSAGE_${conversationId}`, message);
    realtimeBroadcaster.broadcast("CONVERSATION_UPDATED", {
      conversationId,
      lastMessage: {
        text: message.text,
        timestamp: message.timestamp,
        senderRole: message.senderRole,
      },
      agentId: derivedAgentId,
      reportId: derivedReportId,
    });

    return NextResponse.json({ success: true, message });
  } catch (error: any) {
    console.error("[API/FieldChat] Failed to post message:", error);
    return NextResponse.json(
      { error: "Failed to transmit message." },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";


