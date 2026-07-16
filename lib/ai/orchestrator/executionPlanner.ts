/**
 * lib/ai/orchestrator/executionPlanner.ts
 *
 * MIO Execution Planner.
 * Orchestrates intent resolution, step checklist generation, validation bounds,
 * and impact analyses into a structured WorkflowPlan payload.
 */

import { validateWorkflow } from "./workflowValidator";
import { WorkflowStep } from "./workflowPlanner";
import { ImpactSummary } from "./impactAnalyzer";

// Phase 3 Engines Imports
import { IntentClassificationEngine } from "../engines/IntentClassificationEngine";
import { WorkflowPlanningEngine } from "../engines/WorkflowPlanningEngine";
import { ImpactAnalysisEngine } from "../engines/ImpactAnalysisEngine";
import { MissionControlEngine, WorkflowTimeline } from "../engines/MissionControlEngine";
import { BusinessRulesEngine } from "../engines/BusinessRulesEngine";

export interface WorkflowPlan {
  workflowId: string;
  actionType: string;
  parameters: any;
  steps: WorkflowStep[];
  impact: ImpactSummary;
  validationPassed: boolean;
  validationErrors: string[];
  status: "pending_approval" | "approved" | "running" | "completed" | "failed" | "cancelled";
  createdAt: string;
  creatorRole: string;
  timeline?: WorkflowTimeline; // Deterministic execution timeline for Phase 3 MCE
}

/**
 * Builds the comprehensive execution plan layout based on user query message.
 */
export async function compileWorkflowPlan(
  message: string,
  userRole: string
): Promise<WorkflowPlan | null> {
  // 1. Strict Intent Resolution via IntentClassificationEngine (ICE)
  const iceReport = IntentClassificationEngine.classifyIntent(message);
  
  const validActionTypes = ["allocateDonation", "publishUpdate", "generateCertificates", "dispatchCommunications", "reviewCompliance", "generateReport"];
  if (!validActionTypes.includes(iceReport.intent) || iceReport.confidence < 0.6) {
    return null; // Query is general query, does not trigger a database workflow
  }

  const actionType = iceReport.intent;
  const parameters = iceReport.entities;

  // 2. Generate Checklist Steps via WorkflowPlanningEngine (WPE)
  const steps = WorkflowPlanningEngine.compileWorkflowSteps(actionType);

  // 3. Pre-validate parameters via BusinessRulesEngine (BRE) and legacy validator
  const validation = await validateWorkflow(actionType as any, parameters, userRole);
  
  if (parameters.amount) {
    const breLimits = BusinessRulesEngine.evaluateDonationLimits(parameters.amount, userRole);
    if (!breLimits.passed) {
      validation.passed = false;
      validation.errors.push(...breLimits.errors);
    }
  }

  // 4. Analyze operational impact size via ImpactAnalysisEngine (IAE)
  const impact = await ImpactAnalysisEngine.analyzeOperationalImpact(actionType, parameters);

  const workflowId = `WRK-${Date.now()}`;

  // 5. Complete Mission Control (MCE) timeline registration
  const timeline = MissionControlEngine.registerTimeline(workflowId, steps);

  return {
    workflowId,
    actionType,
    parameters,
    steps,
    impact,
    validationPassed: validation.passed,
    validationErrors: validation.errors,
    status: "pending_approval",
    createdAt: new Date().toISOString(),
    creatorRole: userRole,
    timeline,
  };
}
