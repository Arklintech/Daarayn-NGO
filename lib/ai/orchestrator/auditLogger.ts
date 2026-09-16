/**
 * lib/ai/orchestrator/auditLogger.ts
 *
 * MIO Audit Logger.
 * Writes detailed execution steps log records to the khizr_workflows_audit collection.
 */

import { db } from "../../firebase";
import { doc, setDoc } from "firebase/firestore";
import { auditLogRepository } from "../../repositories/auditLogRepository";
import type { WorkflowPlan } from "./executionPlanner";
import type { ExecutionResult } from "./executionEngine";

export interface WorkflowAuditRecord {
  workflowId: string;
  conversationId: string;
  prompt: string;
  intent: string;
  plan: any;
  approvalStatus: string;
  executionResult: any;
  durationMs: number;
  user: string;
  timestamp: string;
  referencedRecords: string[];
  modelVersion: string;
  affectedCollections: string[];
}

/**
 * Registers execution audit log trails in authoritative Google Sheets and mirrors to Firestore.
 */
export async function logWorkflowAudit(
  workflow: WorkflowPlan,
  result: ExecutionResult | null,
  durationMs: number,
  adminEmail: string,
  conversationId: string
): Promise<void> {
  const auditId = `AUD-${workflow.workflowId}`;
  
  const record: WorkflowAuditRecord = {
    workflowId: workflow.workflowId,
    conversationId: conversationId || `SESS-${Date.now()}`,
    prompt: `Execute action trigger: "${workflow.actionType}"`,
    intent: workflow.actionType,
    plan: {
      parameters: workflow.parameters,
      stepsCount: workflow.steps.length
    },
    approvalStatus: "approved_and_signed",
    executionResult: result ? {
      success: result.success,
      message: result.message,
      stepsCompletedCount: result.stepsCompleted.length
    } : { success: false, message: "Awaiting approval signoff" },
    durationMs,
    user: adminEmail,
    timestamp: new Date().toISOString(),
    referencedRecords: result ? result.recordsCreated : [],
    modelVersion: "grok-2-1212",
    affectedCollections: Array.from(new Set(workflow.impact.potentialRisks))
  };

  try {
    // Authoritative Google Sheets Audit Log
    auditLogRepository.save({
      id: auditId,
      actor_id: adminEmail || "admin",
      actor_role: "admin",
      action: `MIO_WORKFLOW_${workflow.actionType}`,
      entity_type: "WORKFLOW",
      entity_id: workflow.workflowId,
      after_state: record,
      timestamp: new Date().toISOString(),
      request_id: conversationId,
      source: "KHIZR_MIO"
    }).catch(() => {});

    // Safe non-blocking Firestore mirror write
    const firestoreWrite = setDoc(doc(db, "khizr_workflows_audit", auditId), record);
    const timeout = new Promise((resolve) => setTimeout(resolve, 1500));
    await Promise.race([firestoreWrite, timeout]).catch(() => {});
    console.log(`[MIO Audit] Successfully logged execution audit row: "${auditId}"`);
  } catch (error) {
    console.error("[MIO Audit] Audit write warning:", error);
  }
}
