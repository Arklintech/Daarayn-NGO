import { NextRequest, NextResponse } from "next/server";
import { notificationRepository, type SystemNotification } from "@/lib/repositories/notificationRepository";
import { requireAgent } from "@/lib/server/auth";
import type { FieldNotification } from "@/lib/db-field-ops";

function isForAgent(n: SystemNotification, agentId: string) {
  return n.recipientType === "FieldAgent" && (n.recipientId === agentId || n.recipientId === "all");
}

function toFieldType(n: SystemNotification): FieldNotification["type"] {
  const text = `${n.type} ${n.title} ${n.message}`.toLowerCase();
  if (text.includes("assign")) return "Assignment";
  if (text.includes("reject") || text.includes("needs more")) return "Alert";
  if (text.includes("approv") || text.includes("fund") || text.includes("complet")) return "Success";
  return "Info";
}

/** The signed-in agent's own notifications, newest first. */
export async function GET(request: NextRequest) {
  try {
    const principal = await requireAgent(request);
    if (principal instanceof NextResponse) return principal;
    const agentId = principal.agent.id;

    const all = await notificationRepository.getAll(true);
    const notifications: FieldNotification[] = all
      .filter((n) => isForAgent(n, agentId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((n) => ({
        id: n.id,
        agentId,
        title: n.title,
        message: n.message,
        type: toFieldType(n),
        isRead: n.read,
        timestamp: n.createdAt,
        relatedReportId: n.relatedEntityId || undefined,
      }));

    return NextResponse.json(notifications);
  } catch (error) {
    console.error("[API/FieldNotifications] Failed to load notifications:", error);
    return NextResponse.json({ error: "Failed to load notifications." }, { status: 500 });
  }
}

/** Marks one of the agent's own notifications as read. */
export async function PATCH(request: NextRequest) {
  try {
    const principal = await requireAgent(request);
    if (principal instanceof NextResponse) return principal;

    const { id } = await request.json();
    const notification = id ? await notificationRepository.getById(id) : null;
    if (!notification || !isForAgent(notification, principal.agent.id)) {
      return NextResponse.json({ error: "Notification not found." }, { status: 404 });
    }

    await notificationRepository.save({ ...notification, read: true });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API/FieldNotifications] Failed to update notification:", error);
    return NextResponse.json({ error: "Failed to update notification." }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
