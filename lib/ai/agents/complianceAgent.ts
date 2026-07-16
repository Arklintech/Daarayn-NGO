/**
 * lib/ai/agents/complianceAgent.ts
 *
 * Compliance Agent for Daarayn AI-TOS.
 * Coordinates validation score computations and ledger consistency cross-checks.
 */

import { validateResponse } from "../validator";
import { checkCompliance } from "../compliance";

export class ComplianceAgent {
  public runAudit(payload: any, verifiedContext: any) {
    const validation = validateResponse(payload, verifiedContext.donor?.name);
    const compliance = checkCompliance(payload, verifiedContext);
    return {
      isValid: validation.isValid && compliance.isCompliant,
      validation,
      compliance,
    };
  }
}
