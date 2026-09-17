import { auditLogRepository } from "../repositories/auditLogRepository";

export async function logSyncAudit(auditData: {
  entity: string;
  entityId: string;
  operation: "CREATE" | "UPDATE" | "DELETE";
  status: "SUCCESS" | "FAILED";
  errorDetails?: string;
  syncDurationMs?: number;
}) {
  try {
    const eventId = `SYNC-AUDIT-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    await auditLogRepository.createLog({
      id: eventId,
      event_id: eventId,
      actor_id: "sync_engine",
      actor_role: "system",
      action: `${auditData.operation}_${auditData.entity.toUpperCase()}`,
      entity_type: auditData.entity,
      entity_id: auditData.entityId,
      after_state: {
        status: auditData.status,
        errorDetails: auditData.errorDetails,
        syncDurationMs: auditData.syncDurationMs,
      },
      timestamp: new Date().toISOString(),
      source: "sync_audit_logger",
    });
  } catch (error) {
    console.error("Failed to write to sync audit logs", error);
  }
}

