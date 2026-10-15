import { NextRequest, NextResponse } from "next/server";
import { fieldReportRepository } from "@/lib/repositories/fieldReportRepository";
import { auditLogRepository } from "@/lib/repositories/auditLogRepository";
import { notificationRepository } from "@/lib/repositories/notificationRepository";
import { realtimeBroadcaster } from "@/lib/realtime/broadcaster";
import { requireAdmin, requireAdminOrAgent } from "@/lib/server/auth";

// Fields an admin may change on a report; identity fields (id, agentId, createdAt) stay fixed.
const EDITABLE_FIELDS = [
  "status", "adminNotes", "assignedAdminId", "assignedTo", "urgency", "category",
  "title", "description", "estimatedBudget", "location", "beneficiaries", "timelineStages",
] as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> }
) {
  try {
    const principal = await requireAdminOrAgent(request);
    if (principal instanceof NextResponse) return principal;

    const { reportId } = await params;
    const report = await fieldReportRepository.getById(reportId);
    if (!report || (principal.kind === "agent" && report.agentId !== principal.agent.id)) {
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
    const admin = await requireAdmin(request);
    if (admin instanceof NextResponse) return admin;

    const { reportId } = await params;
    const body = await request.json();
    const updates: Record<string, unknown> = {};
    for (const key of EDITABLE_FIELDS) {
      if (body[key] !== undefined) updates[key] = body[key];
    }

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
    realtimeBroadcaster.broadcast("FIELD_REPORT_UPDATED", updated, { audience: ["admin", `agent:${(existing as any).agentId}`] });

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
      actor_id: admin.email,
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

