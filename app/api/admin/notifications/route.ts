import { NextRequest, NextResponse } from "next/server";
import { notificationRepository, SystemNotification } from "@/lib/repositories/notificationRepository";
import { realtimeBroadcaster } from "@/lib/realtime/broadcaster";

export async function GET(req: NextRequest) {
  try {
    const all = await notificationRepository.getAll();
    const mapped = all.map((n) => {
      const typeStr = (n.type || "").toLowerCase();
      const titleStr = (n.title || "").toLowerCase();
      return {
        id: n.id,
        notificationId: n.id,
        category: (typeStr.includes("report")
          ? "field_reports"
          : typeStr.includes("donat")
          ? "donations"
          : typeStr.includes("donor")
          ? "donors"
          : typeStr.includes("comm")
          ? "communications"
          : "executive_reports") as any,
        title: n.title || "Notification",
        description: n.message || "",
        entityType: n.type || "SYSTEM",
        entityId: n.relatedEntityId || "",
        createdAt: n.createdAt || new Date().toISOString(),
        createdBy: "System",
        isRead: Boolean(n.read),
        actionUrl: typeStr.includes("report")
          ? "/admin/field-ops"
          : typeStr.includes("donat")
          ? "/admin/donations"
          : "/admin",
        priority: (titleStr.includes("urgent") || typeStr.includes("urgent") ? "high" : "normal") as any,
        isStarred: false,
      };
    });
    const sorted = mapped.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return NextResponse.json({ success: true, notifications: sorted });
  } catch (error: any) {
    console.error("[API] GET /api/admin/notifications error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, read, isStarred, markAllRead } = body;

    if (markAllRead) {
      const all = await notificationRepository.getAll();
      const unread = all.filter((n) => !n.read);
      for (const n of unread) {
        await notificationRepository.update(n.id, { read: true });
      }
      realtimeBroadcaster.broadcast("NOTIFICATION_UPDATED", { markAllRead: true });
      return NextResponse.json({ success: true, updatedCount: unread.length });
    }

    if (!id) {
      return NextResponse.json({ success: false, error: "Missing notification id" }, { status: 400 });
    }

    const updates: Partial<SystemNotification> = {};
    if (typeof read === "boolean") updates.read = read;

    await notificationRepository.update(id, updates);

    realtimeBroadcaster.broadcast("NOTIFICATION_UPDATED", { id, ...updates, isStarred });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[API] PATCH /api/admin/notifications error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "Missing notification id" }, { status: 400 });
    }

    await notificationRepository.delete(id);

    realtimeBroadcaster.broadcast("NOTIFICATION_DELETED", { id });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[API] DELETE /api/admin/notifications error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const notifId = payload.id || `NOTIF-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
    const newNotif: SystemNotification = {
      id: notifId,
      recipientType: payload.recipientType || "Admin",
      recipientId: payload.recipientId || "all",
      type: payload.category || payload.type || "System",
      title: payload.title || "Notification",
      message: payload.description || payload.message || "",
      read: false,
      relatedEntityId: payload.entityId || "",
      createdAt: new Date().toISOString(),
    };

    await notificationRepository.save(newNotif);
    realtimeBroadcaster.broadcast("NOTIFICATION_CREATED", newNotif);

    return NextResponse.json({ success: true, notification: newNotif });
  } catch (error: any) {
    console.error("[API] POST /api/admin/notifications error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";


