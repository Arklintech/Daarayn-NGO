/**
 * lib/ai/engines/AIResponseGovernanceEngine.ts
 *
 * AI Response Governance Engine (RGE) for Phase 3.
 * Delegates authoritatively to EnterpriseResponseCertificationEngine (ERCE).
 */

import { EnterpriseResponseCertificationEngine } from "./EnterpriseResponseCertificationEngine";

export interface GovernanceResult {
  isValid: boolean;
  errors: string[];
  auditedNumbers: number[];
  filteredResponse: any;
  confidence: number;
  status: "Verified" | "Partial" | "Failed";
  formattedMarkdown: string;
}

export class AIResponseGovernanceEngine {
  /**
   * Filters, validates, and format-checks a generated response structure.
   * Delegates authoritatively to EnterpriseResponseCertificationEngine.
   */
  static validateAndGovernResponse(
    aiOutput: any,
    verifiedContextText: string,
    requestId: string,
    donorEmail?: string,
    donorId?: string
  ): GovernanceResult {
    const result = EnterpriseResponseCertificationEngine.certifyResponse(
      aiOutput,
      verifiedContextText,
      {}, // eioMetrics
      requestId,
      donorEmail,
      donorId
    );

    return {
      isValid: result.isValid,
      errors: result.errors,
      auditedNumbers: result.extractedFacts.numbers,
      filteredResponse: result.filteredResponse,
      confidence: result.confidence,
      status: result.status,
      formattedMarkdown: result.formattedMarkdown
    };
  }
}
