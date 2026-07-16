/**
 * lib/ai/mco/DynamicContextBuilder.ts
 *
 * Never sends full runtime context. Only includes:
 * Required identity, required business rules, required evidence, required memory.
 */

import { EXECUTIVE_CONSTITUTION } from "./ExecutiveConstitution";
import type { ExecutionPlan } from "./ExecutiveQueryPlanner";

export interface ContextComponents {
  identity: string;
  businessRules: string;
  evidence: any;
  organizationalMemory: string;
}

export class DynamicContextBuilder {
  
  static buildContext(plan: ExecutionPlan, rawEvidence: any, memoryContext: string): string {
    let contextStr = `
${EXECUTIVE_CONSTITUTION}
`;
    
    contextStr += `
[EXECUTIVE OBJECTIVE]
${plan.objective}
`;
    contextStr += `
[CAPABILITY IN USE]
${plan.capability}
`;
    
    // Inject only necessary evidence
    if (rawEvidence && Object.keys(rawEvidence).length > 0) {
      contextStr += `
[VERIFIED EVIDENCE]
${JSON.stringify(rawEvidence, null, 2)}
`;
    } else {
      contextStr += `
[VERIFIED EVIDENCE]
No evidence found for this request.
`;
    }
    
    if (memoryContext) {
      contextStr += `
[ORGANIZATIONAL MEMORY]
${memoryContext}
`;
    }

    return contextStr;
  }
}
