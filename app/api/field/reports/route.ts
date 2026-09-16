import { NextRequest, NextResponse } from "next/server";
import { fieldReportRepository } from "@/lib/repositories/fieldReportRepository";
import { auditLogRepository } from "@/lib/repositories/auditLogRepository";
import { notificationRepository } from "@/lib/repositories/notificationRepository";
import { driveService } from "@/lib/google/drive";
import { realtimeBroadcaster } from "@/lib/realtime/broadcaster";
import { db } from "@/lib/firebase";
import { doc, setDoc } from "firebase/firestore";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get("agentId");
    const status = searchParams.get("status");

    let reports = await fieldReportRepository.getAll();

    if (agentId) {
      reports = reports.filter((r) => r.agentId === agentId);
    }
    if (status && status !== "all") {
      reports = reports.filter((r) => r.status.toLowerCase() === status.toLowerCase());
    }

    return NextResponse.json(reports);
  } catch (error: any) {
    console.error("[API/FieldReports] Failed to fetch field reports:", error);
    return NextResponse.json(
      { error: "Failed to retrieve field reports." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let body: any = {};
    const mediaDriveIds: string[] = [];
    const docDriveIds: string[] = [];

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const payloadStr = formData.get("payload")?.toString();
      if (payloadStr) {
        body = JSON.parse(payloadStr);
      } else {
        body = {
          category: formData.get("category")?.toString(),
          title: formData.get("title")?.toString(),
          description: formData.get("description")?.toString(),
          urgency: formData.get("urgency")?.toString() || "Medium",
          estimatedBudget: formData.get("estimatedBudget")?.toString() || "₹0",
          agentId: formData.get("agentId")?.toString(),
          agentName: formData.get("agentName")?.toString(),
          location: {
            country: formData.get("country")?.toString() || "India",
            state: formData.get("state")?.toString() || "",
            district: formData.get("district")?.toString() || "",
            village: formData.get("village")?.toString() || "",
          },
          beneficiaries: {
            families: Number(formData.get("families")) || 0,
            children: Number(formData.get("children")) || 0,
            women: Number(formData.get("women")) || 0,
            elderly: Number(formData.get("elderly")) || 0,
            description: formData.get("beneficiaryDesc")?.toString() || "",
          },
        };
      }

      // Process uploaded files to Google Drive
      const mediaFiles = formData.getAll("mediaFiles") as File[];
      for (const file of mediaFiles) {
        if (file && file.size > 0) {
          const buffer = Buffer.from(await file.arrayBuffer());
          const uploaded = await driveService.uploadFile(
            buffer,
            file.name,
            file.type || "image/jpeg",
            "Field Reports/Images",
            body.title,
            body.agentName
          );
          mediaDriveIds.push(uploaded.drive_file_id);
        }
      }

      const documentFiles = formData.getAll("documentFiles") as File[];
      for (const file of documentFiles) {
        if (file && file.size > 0) {
          const buffer = Buffer.from(await file.arrayBuffer());
          const uploaded = await driveService.uploadFile(
            buffer,
            file.name,
            file.type || "application/pdf",
            "Field Reports/Documents",
            body.title,
            body.agentName
          );
          docDriveIds.push(uploaded.drive_file_id);
        }
      }
    } else {
      body = await request.json();
    }

    if (!body.title || !body.agentId) {
      return NextResponse.json(
        { error: "Title and Agent ID are required." },
        { status: 400 }
      );
    }

    // Generate Report ID
    const existing = await fieldReportRepository.getAll();
    const nextIdx = existing.length + 1;
    const reportId = `FR${String(nextIdx).padStart(3, "0")}`;

    const nowIso = new Date().toISOString();

    const reportEntity = {
      id: reportId,
      agentId: body.agentId,
      agentName: body.agentName || "Field Agent",
      category: body.category || "General",
      title: body.title,
      description: body.description || "",
      urgency: body.urgency || "Medium",
      estimatedBudget: body.estimatedBudget || "₹0",
      location: body.location || { country: "India", state: "", district: "", village: "" },
      beneficiaries: body.beneficiaries || { families: 0, children: 0, women: 0, elderly: 0, description: "" },
      media: mediaDriveIds.length > 0 ? mediaDriveIds : (body.media || []),
      documents: docDriveIds.length > 0 ? docDriveIds : (body.documents || []),
      status: "Pending Review" as const,
      timelineStages: {
        submitted: { timestamp: nowIso, by: body.agentName || "Agent" },
      },
      assignedTo: "",
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    // 1. Authoritative Save to Google Sheets
    await fieldReportRepository.save(reportEntity as any);

    // 2. Realtime SSE Broadcast to Admin Operations
    realtimeBroadcaster.broadcast("FIELD_REPORT_SUBMITTED", reportEntity);

    // 3. Persist Notification in Google Sheets
    const notifId = `NOTIF-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    await notificationRepository.save({
      id: notifId,
      recipientType: "Admin",
      recipientId: "all",
      type: "FIELD_REPORT",
      title: "New Field Incident Report",
      message: `${reportEntity.agentName} submitted "${reportEntity.title}" (${reportEntity.category}, Urgency: ${reportEntity.urgency})`,
      read: false,
      relatedEntityId: reportId,
      createdAt: nowIso,
    });

    // 4. Persist Audit Log in Google Sheets
    const auditId = `AUDIT-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    await auditLogRepository.save({
      id: auditId,
      actor_id: body.agentId,
      actor_role: "field_agent",
      action: "SUBMIT_FIELD_REPORT",
      entity_type: "Field_Report",
      entity_id: reportId,
      before_state: null,
      after_state: { title: reportEntity.title, urgency: reportEntity.urgency, category: reportEntity.category },
      timestamp: nowIso,
      source: "field_portal",
    });

    // 5. Temporary Dual-Write to Firestore Mirror with 1.5s timeout
    try {
      const firestoreWrite = setDoc(doc(db, "field_reports", reportId), {
        ...reportEntity,
        migratedToSheets: true,
      }, { merge: true });
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Firestore write timed out")), 1500)
      );
      await Promise.race([firestoreWrite, timeout]);
    } catch (e: any) {
      console.warn("[API/FieldReports] Dual-write to Firestore skipped/timed out:", e.message);
    }

    return NextResponse.json({ success: true, report: reportEntity });
  } catch (error: any) {
    console.error("[API/FieldReports] Submission error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to submit field report." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { reportId, status, adminNotes, assignedTo } = body;

    if (!reportId) {
      return NextResponse.json({ error: "reportId is required." }, { status: 400 });
    }

    const reports = await fieldReportRepository.getAll();
    const existing = reports.find(r => r.id === reportId);
    if (!existing) {
      return NextResponse.json({ error: "Report not found." }, { status: 404 });
    }

    const nowIso = new Date().toISOString();
    const updatedReport = {
      ...existing,
      status: status || existing.status,
      adminNotes: adminNotes !== undefined ? adminNotes : existing.adminNotes,
      assignedAdminId: assignedTo !== undefined ? assignedTo : existing.assignedAdminId,
      updatedAt: nowIso,
      timelineStages: {
        ...((existing as any).timelineStages || {}),
        [status || "update"]: { timestamp: nowIso, by: "Admin" }
      }
    };

    // 1. Authoritative Save to Google Sheets
    await fieldReportRepository.save(updatedReport as any);

    // 2. Realtime SSE Broadcast to Field Agent & Admin
    realtimeBroadcaster.broadcast("FIELD_REPORT_UPDATE", updatedReport);
    realtimeBroadcaster.broadcast(`FIELD_REPORT_${reportId}`, updatedReport);

    // 3. Persist Notification in Google Sheets
    const notifId = `NOTIF-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    await notificationRepository.save({
      id: notifId,
      recipientType: "FieldAgent",
      recipientId: existing.agentId,
      type: "FIELD_REPORT_STATUS",
      title: `Field Report ${status || "Updated"}`,
      message: `Your report "${existing.title}" status is now ${status || existing.status}.`,
      read: false,
      relatedEntityId: reportId,
      createdAt: nowIso,
    });

    // 4. Persist Audit Log in Google Sheets
    const auditId = `AUDIT-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    await auditLogRepository.save({
      id: auditId,
      actor_id: "admin",
      actor_role: "admin",
      action: "UPDATE_FIELD_REPORT_STATUS",
      entity_type: "Field_Report",
      entity_id: reportId,
      before_state: { status: existing.status },
      after_state: { status: updatedReport.status, adminNotes: updatedReport.adminNotes },
      timestamp: nowIso,
      source: "admin_panel",
    });

    return NextResponse.json({ success: true, report: updatedReport });
  } catch (error: any) {
    console.error("[API/FieldReports] Status update error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update field report status." },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
