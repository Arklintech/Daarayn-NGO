import { NextRequest, NextResponse } from "next/server";
import { notificationRepository, SystemNotification } from "@/lib/repositories/notificationRepository";
import { realtimeBroadcaster } from "@/lib/realtime/broadcaster";
import { db } from "@/lib/firebase";
import { doc, updateDoc, deleteDoc, setDoc } from "firebase/firestore";

export async function GET(req: NextRequest) {
  try {
    const all = await notificationRepository.getAll();
    const mapped = all.map((n) => ({
      id: n.id,
      notificationId: n.id,
      category: (n.type.toLowerCase().includes("report")
        ? "field_reports"
        : n.type.toLowerCase().includes("donat")
        ? "donations"
        : n.type.toLowerCase().includes("donor")
        ? "donors"
        : n.type.toLowerCase().includes("comm")
        ? "communications"
        : "executive_reports") as any,
      title: n.title,
      description: n.message,
      entityType: n.type,
      entityId: n.relatedEntityId || "",
      createdAt: n.createdAt,
      createdBy: "System",
      isRead: n.read,
      actionUrl: n.type.toLowerCase().includes("report")
        ? "/admin/field-ops"
        : n.type.toLowerCase().includes("donat")
        ? "/admin/donations"
        : "/admin",
      priority: (n.title.toLowerCase().includes("urgent") || n.type.toLowerCase().includes("urgent") ? "high" : "normal") as any,
      isStarred: false,
    }));
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
        // Safe mirror write
        if (process.env.NODE_ENV !== "test") {
          try {
            const mirrorPromise = updateDoc(doc(db, "admin_notifications", n.id), { isRead: true });
            const timeout = new Promise((r) => setTimeout(r, 1500));
            await Promise.race([mirrorPromise, timeout]).catch(() => {});
          } catch (_) {}
        }
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

    // Safe Firestore mirror
    if (process.env.NODE_ENV !== "test") {
      try {
        const mirrorPromise = updateDoc(doc(db, "admin_notifications", id), {
          isRead: read,
          isStarred: isStarred,
        });
        const timeout = new Promise((r) => setTimeout(r, 1500));
        await Promise.race([mirrorPromise, timeout]).catch(() => {});
      } catch (_) {}
    }

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

    // Safe mirror deletion
    if (process.env.NODE_ENV !== "test") {
      try {
        const mirrorPromise = deleteDoc(doc(db, "admin_notifications", id));
        const timeout = new Promise((r) => setTimeout(r, 1500));
        await Promise.race([mirrorPromise, timeout]).catch(() => {});
      } catch (_) {}
    }

    realtimeBroadcaster.broadcast("NOTIFICATION_DELETED", { id });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[API] DELETE /api/admin/notifications error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
