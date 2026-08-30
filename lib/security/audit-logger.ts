import { db } from "../firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

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
 * Write a structured, immutable audit record to admin_audit_logs
 */
export async function logAuditEvent(event: AuditEventPayload): Promise<void> {
  const record = {
    ...event,
    createdAt: new Date().toISOString(),
    timestamp: serverTimestamp(),
  };

  try {
    await addDoc(collection(db, "admin_audit_logs"), record);
  } catch (err) {
    console.warn("Audit log Firestore write fallback (offline or unauthenticated):", err, record);
  }
}
