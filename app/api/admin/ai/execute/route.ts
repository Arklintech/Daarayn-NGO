/**
 * app/api/admin/ai/execute/route.ts
 *
 * Secure MIO Execution Engine for KHIZR Intelligence Orchestrator (Phase 3).
 * Validates admin sign-off, runs WorkflowPlan through the execution engine, logs audit trails,
 * handles rollback on failure, and triggers notifications.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, setDoc } from "firebase/firestore";
import { checkPermission } from "@/lib/ai/permissions";
import { executeWorkflowPlan } from "@/lib/ai/orchestrator/executionEngine";
import { rollbackWorkflowOperations } from "@/lib/ai/orchestrator/rollbackManager";
import { logWorkflowAudit } from "@/lib/ai/orchestrator/auditLogger";
import { pushWorkflowNotification } from "@/lib/ai/orchestrator/notificationPlanner";
import { registerApproval } from "@/lib/ai/orchestrator/approvalManager";

// Phase 3 Engine Imports
import { MissionControlEngine } from "@/lib/ai/engines/MissionControlEngine";

export async function POST(request: Request) {
  const startedAt = Date.now();

  try {
    const { actionPlan, workflowPlan, adminEmail, adminRole, sessionId } = await request.json();

    const userRole = adminRole || "editor";
    const conversationId = sessionId || `SESS-${Date.now()}`;

    // =============================================
    // Phase 3: MIO WorkflowPlan Execution Path
    // =============================================
    if (workflowPlan && workflowPlan.workflowId) {
      console.log(`[MIO Execute] Received approved WorkflowPlan: ${workflowPlan.workflowId} | Admin: ${adminEmail}`);

      // 1. Permission boundary check via Mission Control Engine (MCE)
      const signoff = MissionControlEngine.validateSignOff(userRole, workflowPlan.actionType);
      if (!signoff.authorized) {
        return NextResponse.json({
          success: false,
          error: signoff.error,
        }, { status: 403 });
      }

      // Guard — Block if validation failed
      if (!workflowPlan.validationPassed) {
        return NextResponse.json({
          success: false,
          error: `Workflow blocked by pre-validation: ${workflowPlan.validationErrors?.join(", ")}`,
        }, { status: 422 });
      }

      // Register approval sign-off log
      await registerApproval(workflowPlan, adminEmail || "anonymous", userRole, "approve");

      // Execute workflow via execution engine
      const execResult = await executeWorkflowPlan(workflowPlan, adminEmail || "anonymous");
      const durationMs = Date.now() - startedAt;

      if (!execResult.success) {
        // Attempt rollback
        const rollbackMessage = await rollbackWorkflowOperations(execResult, workflowPlan.parameters);
        await logWorkflowAudit(workflowPlan, execResult, durationMs, adminEmail || "anonymous", conversationId);
        await pushWorkflowNotification(
          `Workflow Failed: ${workflowPlan.actionType}`,
          `Execution error: ${execResult.message}. Rollback: ${rollbackMessage}`,
          "error"
        );
        return NextResponse.json({
          success: false,
          error: execResult.message,
          rollbackDetails: rollbackMessage,
        }, { status: 500 });
      }

      // Audit log success
      await logWorkflowAudit(workflowPlan, execResult, durationMs, adminEmail || "anonymous", conversationId);
      await pushWorkflowNotification(
        `Workflow Completed: ${workflowPlan.actionType}`,
        `${execResult.stepsCompleted.length} steps executed. Records created: ${execResult.recordsCreated.length}.`,
        "success"
      );

      return NextResponse.json({
        success: true,
        workflowId: workflowPlan.workflowId,
        message: execResult.message,
        stepsCompleted: execResult.stepsCompleted,
        recordsCreated: execResult.recordsCreated,
        durationMs,
      });
    }

    // Legacy permission check
    const hasPermission = checkPermission(userRole, "super_admin", "write") || userRole === "super_admin" || userRole === "editor";
    if (!hasPermission) {
      return NextResponse.json({
        success: false,
        error: `Permission Denied: Role "${userRole}" is not authorized to execute legacy workflows.`,
      }, { status: 403 });
    }

    // =============================================
    // Legacy: ActionPlan backward compatibility path
    // =============================================
    if (!actionPlan || !actionPlan.action || !actionPlan.parameters) {
      return NextResponse.json({ success: false, error: "ActionPlan or WorkflowPlan parameters are required." }, { status: 400 });
    }

    const { action, parameters } = actionPlan;
    let executionResult = "";

    console.log(`[AI-TOS Executor] Executing legacy action: ${action} | Admin: ${adminEmail}`);

    if (action === "UPDATE_PROGRAM_PROGRESS") {
      const { programId, progress } = parameters;
      if (!programId || progress === undefined) {
        return NextResponse.json({ success: false, error: "Missing programId or progress parameter." }, { status: 400 });
      }

      const progRef = doc(db, "programs", programId);
      const snap = await getDoc(progRef);
      if (!snap.exists()) {
        return NextResponse.json({ success: false, error: `Program ${programId} not found.` }, { status: 404 });
      }

      await updateDoc(progRef, { progress: Number(progress) });
      executionResult = `Successfully updated program ${programId} progress to ${progress}%.`;

    } else if (action === "RECORD_ALLOCATION") {
      const { donationId, programId, amount } = parameters;
      if (!donationId || !programId || !amount) {
        return NextResponse.json({ success: false, error: "Missing parameters for allocation." }, { status: 400 });
      }

      const progRef = doc(db, "programs", programId);
      const progSnap = await getDoc(progRef);
      if (!progSnap.exists()) {
        return NextResponse.json({ success: false, error: "Program not found." }, { status: 404 });
      }

      const current = progSnap.data().amountCollected || 0;
      await updateDoc(progRef, { amountCollected: current + Number(amount) });
      executionResult = `Successfully recorded allocation of INR ${Number(amount).toLocaleString()} from donation ${donationId} to program ${programId}.`;

    } else if (action === "SEND_AUDIT_LOG") {
      const { programId, statement } = parameters;
      if (!programId || !statement) {
        return NextResponse.json({ success: false, error: "Missing programId or statement parameters." }, { status: 400 });
      }

      const ledgerId = `LEDGER-${Date.now()}`;
      await setDoc(doc(db, "publicLedger", ledgerId), {
        id: ledgerId,
        donor: "Audit update",
        cause: "Operations Audit",
        amount: 0,
        status: "completed",
        date: new Date().toLocaleDateString("en-IN"),
        refCode: `AUDIT-${programId}`,
        proof: statement,
        createdAt: new Date().toISOString()
      });
      executionResult = `Successfully published public audit statement: "${statement}".`;

    } else {
      return NextResponse.json({ success: false, error: `Action code "${action}" is not supported.` }, { status: 400 });
    }

    // Log legacy execution audit entry
    const execLogId = `AIEXEC-${Date.now()}`;
    await setDoc(doc(db, "ai_execution_logs", execLogId), {
      id: execLogId,
      action,
      parameters,
      adminEmail,
      executedAt: new Date().toISOString(),
      result: executionResult,
    });

    return NextResponse.json({ success: true, message: executionResult });

  } catch (error) {
    console.error("[ExecutionAPI] Critical exception:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
