/**
 * lib/ai/orchestrator/approvalManager.ts
 *
 * MIO Approval Manager.
 * Manages operational sign-off permissions checks and execution trigger flags.
 */

import { db } from "../../firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import type { WorkflowPlan } from "./executionPlanner";

export interface ApprovalRecord {
  workflowId: string;
  adminEmail: string;
  role: string;
  signedAt: string;
  decision: "approve" | "cancel";
}

/**
 * Registers administrator sign-off decision for a proposed workflow plan
 * and returns whether authorization was successfully registered.
 */
export async function registerApproval(
  workflow: WorkflowPlan,
  adminEmail: string,
  role: string,
  decision: "approve" | "cancel"
): Promise<boolean> {
  // Guard role permission sets
  if (role !== "super_admin" && role !== "editor") {
    console.warn(`[MIO Approval] Unauthorized sign-off attempt by ${adminEmail} (Role: ${role})`);
    return false;
  }

  const approvalId = `APP-${workflow.workflowId}-${Date.now()}`;
  const record: ApprovalRecord = {
    workflowId: workflow.workflowId,
    adminEmail,
    role,
    signedAt: new Date().toISOString(),
    decision
  };

  try {
    // Write approval record to database audits log namespace
    await setDoc(doc(db, "momin_workflows_approvals", approvalId), record);
    console.log(`[MIO Approval] Registered sign-off: "${decision}" for workflow ${workflow.workflowId} by ${adminEmail}`);
    return true;
  } catch (error) {
    console.error("[MIO Approval] Failed to record approval signature:", error);
    return false;
  }
}
