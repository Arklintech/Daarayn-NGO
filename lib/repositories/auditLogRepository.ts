import { BaseRepository } from "./baseRepository";

export interface AuditLogEntry {
  id: string; // event_id
  event_id?: string;
  actor_id: string;
  actor_role: string;
  action: string;
  entity_type: string;
  entity_id: string;
  before_state?: any;
  after_state?: any;
  timestamp: string;
  request_id?: string;
  source?: string;
}

const AUDIT_LOG_HEADERS = [
  "event_id",
  "actor_id",
  "actor_role",
  "action",
  "entity_type",
  "entity_id",
  "before_state",
  "after_state",
  "timestamp",
  "request_id",
  "source",
];

export class AuditLogRepository extends BaseRepository<AuditLogEntry> {
  constructor() {
    super("Audit_Log", AUDIT_LOG_HEADERS);
  }

  protected mapRowToEntity(row: Record<string, any>): AuditLogEntry {
    let before_state = row.before_state;
    if (typeof before_state === "string" && (before_state.startsWith("{") || before_state.startsWith("["))) {
      try {
        before_state = JSON.parse(before_state);
      } catch (e) {}
    }

    let after_state = row.after_state;
    if (typeof after_state === "string" && (after_state.startsWith("{") || after_state.startsWith("["))) {
      try {
        after_state = JSON.parse(after_state);
      } catch (e) {}
    }

    return {
      id: String(row.event_id || row.id || ""),
      event_id: String(row.event_id || row.id || ""),
      actor_id: String(row.actor_id || ""),
      actor_role: String(row.actor_role || ""),
      action: String(row.action || ""),
      entity_type: String(row.entity_type || ""),
      entity_id: String(row.entity_id || ""),
      before_state,
      after_state,
      timestamp: String(row.timestamp || new Date().toISOString()),
      request_id: String(row.request_id || ""),
      source: String(row.source || "application"),
    };
  }

  protected mapEntityToRow(entry: AuditLogEntry): Record<string, any> {
    return {
      event_id: entry.id || entry.event_id || `AUDIT-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      actor_id: entry.actor_id || "system",
      actor_role: entry.actor_role || "system",
      action: entry.action,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      before_state: typeof entry.before_state === "object" ? JSON.stringify(entry.before_state) : (entry.before_state || ""),
      after_state: typeof entry.after_state === "object" ? JSON.stringify(entry.after_state) : (entry.after_state || ""),
      timestamp: entry.timestamp || new Date().toISOString(),
      request_id: entry.request_id || "",
      source: entry.source || "application",
    };
  }

  public async createLog(entry: Partial<AuditLogEntry>): Promise<AuditLogEntry> {
    const fullEntry: AuditLogEntry = {
      id: entry.id || entry.event_id || `AUDIT-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      event_id: entry.event_id || entry.id || `AUDIT-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      actor_id: entry.actor_id || "system",
      actor_role: entry.actor_role || "system",
      action: entry.action || "UNKNOWN",
      entity_type: entry.entity_type || "system",
      entity_id: entry.entity_id || "global",
      before_state: entry.before_state,
      after_state: entry.after_state,
      timestamp: entry.timestamp || new Date().toISOString(),
      request_id: entry.request_id || "",
      source: entry.source || "application",
    };
    return this.save(fullEntry);
  }
}

export const auditLogRepository = new AuditLogRepository();
