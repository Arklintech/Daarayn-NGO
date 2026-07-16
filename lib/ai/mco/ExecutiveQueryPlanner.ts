/**
 * lib/ai/mco/ExecutiveQueryPlanner.ts
 *
 * First runtime stage of the Executive Runtime Transformation.
 * Replaces keyword-first thinking. Determines what the executive wants.
 */

import { ExecutiveCapabilityRegistry, ExecutiveCapability } from "./ExecutiveCapabilityRegistry";
import { EntityUnderstanding } from "./EntityUnderstanding";

export type ExecutiveObjective = 
  | "Review"
  | "Investigate"
  | "Teach"
  | "Brainstorm"
  | "Decide"
  | "Approve"
  | "Compare"
  | "Forecast"
  | "Verify"
  | "Communicate"
  | "Summarize"
  | "Search"
  | "Plan"
  | "Audit"
  | "Escalate"
  | "General";

export interface ExecutionPlan {
  objective: ExecutiveObjective;
  capability: ExecutiveCapability;
  primaryEntity: string | null;
  requiredScope: string;
  requiredEvidence: string[];
  requiredOutput: string;
  requiredBlueprint: string;
}

export class ExecutiveQueryPlanner {
  
  /**
   * Evaluates the administrator's input and returns a structured ExecutionPlan.
   * Deterministic logic based on operational triggers.
   */
  static planExecution(message: string): ExecutionPlan {
    const lower = message.toLowerCase();
    
    let objective: ExecutiveObjective = "Review";
    
    if (lower.includes("why") || lower.includes("investigate") || lower.includes("what happened")) {
      objective = "Investigate";
    } else if (lower.includes("decide") || lower.includes("should we")) {
      objective = "Decide";
    } else if (lower.includes("compare") || lower.includes("versus") || lower.includes("vs")) {
      objective = "Compare";
    } else if (lower.includes("forecast") || lower.includes("predict")) {
      objective = "Forecast";
    } else if (lower.includes("write") || lower.includes("draft") || lower.includes("email") || lower.includes("send")) {
      objective = "Communicate";
    } else if (lower.includes("summarize") || lower.includes("tldr")) {
      objective = "Summarize";
    } else if (lower.includes("audit") || lower.includes("verify") || lower.includes("compliance")) {
      objective = "Audit";
    } else if (lower.includes("approve") || lower.includes("sign off")) {
      objective = "Approve";
    } else if (lower.includes("brainstorm") || lower.includes("ideas")) {
      objective = "Brainstorm";
    } else if (lower.includes("explain") || lower.includes("teach") || lower.includes("how does")) {
      objective = "Teach";
    } else if (lower.includes("plan") || lower.includes("strategy")) {
      objective = "Plan";
    }

    const capability = ExecutiveCapabilityRegistry.identifyCapability(message);
    const primaryEntity = EntityUnderstanding.extractPrimaryEntity(message);

    return {
      objective,
      capability,
      primaryEntity,
      requiredScope: "Organization-Wide", // Defaults, refined later
      requiredEvidence: [],
      requiredOutput: "Executive Brief",
      requiredBlueprint: "Standard Executive Response"
    };
  }
}
