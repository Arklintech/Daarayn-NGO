import { auditLogRepository } from "../repositories/auditLogRepository";

export interface AuditEventPayload {
  userId: string;
  userName?: string;
  role?: string;
  action: string; // e.g. "VERIFY_DONATION", "CREATE_CAUSE", "DELETE_LEDGER_ENTRY", "UPDATE_FIELD_REPORT"
  targetResource: string; // e.g. "donations/DON-2026-001"
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
}

/**
 * Write a structured, immutable audit record to Google Sheets
 */
export async function logAuditEvent(event: AuditEventPayload): Promise<void> {
  try {
    const eventId = `AUDIT-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    await auditLogRepository.createLog({
      id: eventId,
      event_id: eventId,
      actor_id: event.userId || "system",
      actor_role: event.role || "admin",
      action: event.action,
      entity_type: event.targetResource.split("/")[0] || "resource",
      entity_id: event.targetResource.split("/")[1] || event.targetResource,
      after_state: event.metadata,
      timestamp: new Date().toISOString(),
      source: "security_audit_logger",
    });
  } catch (err) {
    console.warn("Audit log write fallback:", err);
  }
}

