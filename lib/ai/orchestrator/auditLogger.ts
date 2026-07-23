/**
 * lib/ai/orchestrator/auditLogger.ts
 *
 * MIO Audit Logger.
 * Writes detailed execution steps log records to the khizr_workflows_audit collection.
 */

import { db } from "../../firebase";
import { doc, setDoc } from "firebase/firestore";
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
 * Registers execution audit log trails in Firestore database.
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
    await setDoc(doc(db, "khizr_workflows_audit", auditId), record);
    console.log(`[MIO Audit] Successfully logged execution audit row: "${auditId}"`);
  } catch (error) {
    console.error("[MIO Audit] Failed to write workflow audit log record:", error);
  }
}
