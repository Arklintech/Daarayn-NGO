/**
 * lib/ai/mco/AIRouter.ts
 *
 * Classifies requests into specific execution routes.
 * 
 * ROUTE A: Deterministic (No LLM). Reports, KPIs, Statistics, Lookups.
 * ROUTE B: Hybrid. Verified evidence first, limited Executive reasoning second.
 * ROUTE C: Executive Intelligence. Requires deep reasoning (Strategy, Brainstorming).
 */

import type { ExecutionPlan } from "./ExecutiveQueryPlanner";

export type ExecutionRoute = "ROUTE_A_DETERMINISTIC" | "ROUTE_B_HYBRID" | "ROUTE_C_EXECUTIVE_INTELLIGENCE";

export class AIRouter {
  
  static route(plan: ExecutionPlan): ExecutionRoute {
    // Deterministic triggers
    const isLookup = plan.objective === "Search" || plan.objective === "Review";
    const isDeterministicCapability = [
      "Analytics Intelligence", 
      "Reporting Intelligence", 
      "Public Ledger Intelligence"
    ].includes(plan.capability);
    
    if (isLookup && isDeterministicCapability) {
      return "ROUTE_A_DETERMINISTIC";
    }
    
    // Executive Intelligence triggers
    const isStrategic = [
      "Strategic Planning", 
      "Crisis Management", 
      "Executive Briefings",
      "Decision Support",
      "Organizational Memory"
    ].includes(plan.capability);
    
    const isDeepReasoning = [
      "Decide",
      "Brainstorm",
      "Teach",
      "Plan",
      "Communicate" // Requires LLM to draft
    ].includes(plan.objective);
    
    if (isStrategic || isDeepReasoning) {
      return "ROUTE_C_EXECUTIVE_INTELLIGENCE";
    }
    
    // Default to Hybrid (fetch data, then reason lightly)
    return "ROUTE_B_HYBRID";
  }
}
