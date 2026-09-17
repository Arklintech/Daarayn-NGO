import { NextRequest, NextResponse } from "next/server";
import { fieldReportRepository } from "@/lib/repositories/fieldReportRepository";
import { auditLogRepository } from "@/lib/repositories/auditLogRepository";
import { notificationRepository } from "@/lib/repositories/notificationRepository";
import { realtimeBroadcaster } from "@/lib/realtime/broadcaster";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> }
) {
  try {
    const { reportId } = await params;
    const report = await fieldReportRepository.getById(reportId);
    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }
    return NextResponse.json(report);
  } catch (error: any) {
    return NextResponse.json({ error: "Failed to fetch report" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> }
) {
  try {
    const { reportId } = await params;
    const updates = await request.json();

    const existing = await fieldReportRepository.getById(reportId);
    if (!existing) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    const nowIso = new Date().toISOString();
    const updated = {
      ...existing,
      ...updates,
      updatedAt: nowIso,
    };

    // 1. Authoritative Save to Google Sheets
    await fieldReportRepository.save(updated as any);

    // 2. Broadcast via Realtime SSE Layer
    realtimeBroadcaster.broadcast("FIELD_REPORT_UPDATED", updated);

    // 3. Persist Notification to Agent
    const notifId = `NOTIF-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    await notificationRepository.save({
      id: notifId,
      recipientType: "FieldAgent",
      recipientId: updated.agentId,
      type: "REPORT_STATUS_UPDATE",
      title: `Report Status Updated: ${updated.title}`,
      message: `Status changed to "${updated.status}" by Operations Admin.`,
      read: false,
      relatedEntityId: reportId,
      createdAt: nowIso,
    });

    // 4. Audit Log in Google Sheets
    const auditId = `AUDIT-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    await auditLogRepository.save({
      id: auditId,
      actor_id: updates.adminId || "admin",
      actor_role: "admin",
      action: "UPDATE_FIELD_REPORT",
      entity_type: "Field_Report",
      entity_id: reportId,
      before_state: { status: existing.status },
      after_state: { status: updated.status },
      timestamp: nowIso,
      source: "admin_field_ops",
    });

    return NextResponse.json({ success: true, report: updated });
  } catch (error: any) {
    console.error("[API/FieldReports/[reportId]] Update error:", error);
    return NextResponse.json({ error: "Failed to update report" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";

