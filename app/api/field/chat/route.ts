import { NextRequest, NextResponse } from "next/server";
import { realtimeBroadcaster } from "@/lib/realtime/broadcaster";
import fs from "fs";
import path from "path";

interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderRole: "Admin" | "Agent" | "Supervisor";
  senderName: string;
  text: string;
  timestamp: string;
  read: boolean;
  attachmentDriveFileId?: string;
}

const isVercel = process.env.VERCEL || process.env.NEXT_PUBLIC_VERCEL || process.env.NODE_ENV === "production";
const chatStorageFile = isVercel
  ? "/tmp/field_chat.json"
  : path.join(process.cwd(), "data", "field_chat.json");

function getChatHistory(): ChatMessage[] {
  try {
    const dir = path.dirname(chatStorageFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(chatStorageFile)) {
      fs.writeFileSync(chatStorageFile, JSON.stringify([]), "utf8");
      return [];
    }
    return JSON.parse(fs.readFileSync(chatStorageFile, "utf8"));
  } catch {
    return [];
  }
}

function saveChatHistory(history: ChatMessage[]) {
  try {
    const dir = path.dirname(chatStorageFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(chatStorageFile, JSON.stringify(history, null, 2), "utf8");
  } catch (err: any) {
    console.warn("[FieldChat] Failed to persist chat history:", err.message);
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get("conversationId");

    const all = getChatHistory();
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
    const body = await request.json();
    const { conversationId, senderId, senderRole, senderName, text, attachmentDriveFileId } = body;

    if (!conversationId || !senderId || !text) {
      return NextResponse.json(
        { error: "conversationId, senderId, and text are required." },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();
    const messageId = `MSG-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

    const message: ChatMessage = {
      id: messageId,
      conversationId,
      senderId,
      senderRole: senderRole || "Agent",
      senderName: senderName || "Agent",
      text,
      timestamp: nowIso,
      read: false,
      attachmentDriveFileId,
    };

    // 1. Persist to Operational Structured Datastore
    const history = getChatHistory();
    history.push(message);
    saveChatHistory(history);

    // 2. Broadcast via Approved Realtime Layer (SSE) for Instantaneous Delivery
    realtimeBroadcaster.broadcast("CHAT_MESSAGE", message);
    realtimeBroadcaster.broadcast(`CHAT_MESSAGE_${conversationId}`, message);

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

