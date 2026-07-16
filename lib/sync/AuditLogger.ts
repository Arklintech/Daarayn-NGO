import { db } from "../firebase";
import { collection, addDoc } from "firebase/firestore";

export async function logSyncAudit(auditData: {
  entity: string;
  entityId: string;
  operation: "CREATE" | "UPDATE" | "DELETE";
  status: "SUCCESS" | "FAILED";
  errorDetails?: string;
  syncDurationMs?: number;
}) {
  try {
    await addDoc(collection(db, "sync_audit_logs"), {
      ...auditData,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to write to sync_audit_logs", error);
  }
}
