/**
 * lib/ai/knowledge/validator.ts
 *
 * Response Validator for MOMIN Knowledge Intelligence Engine (MKIE).
 * Audits AI output responses against input context logs to block estimations or hallucinations.
 * Processes the structured JSON schema.
 */

export interface KnowledgeValidationReport {
  isValid: boolean;
  errors: string[];
  auditedNumbers: number[];
  filteredResponse: any;
  confidence: number;
  status: "Verified" | "Partial" | "Failed";
}

/**
 * Validates that all monetary values, transaction/donor IDs, and key figures
 * mentioned in the AI JSON response exist within the retrieved verified database context.
 * Filters unsupported potential actions.
 */
export function validateKnowledgeResponse(
  aiJsonResponse: any,
  verifiedContext: string
): KnowledgeValidationReport {
  const errors: string[] = [];
  const normalizedContext = verifiedContext.toLowerCase();
  const auditedNumbers: number[] = [];

  const filteredResponse = {
    executiveSummary: aiJsonResponse?.executiveSummary || "",
    verifiedFindings: Array.isArray(aiJsonResponse?.verifiedFindings) ? [...aiJsonResponse.verifiedFindings] : [],
    operationalObservations: Array.isArray(aiJsonResponse?.operationalObservations) ? [...aiJsonResponse.operationalObservations] : [],
    potentialActions: Array.isArray(aiJsonResponse?.potentialActions) ? [...aiJsonResponse.potentialActions] : []
  };

  // Helper function to audit a specific string
  function auditText(text: string, contextSource: string, sourceField: string, index?: number): boolean {
    let hasError = false;
    const normalizedText = text.toLowerCase();

    // 1. Audit monetary values and large numbers (e.g., ₹82,000, 15,000, INR 92000)
    const moneyRegex = /(?:₹|inr)?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/gi;
    let match;
    while ((match = moneyRegex.exec(text)) !== null) {
      const rawNumberStr = match[1].replace(/,/g, "");
      const numValue = parseFloat(rawNumberStr);

      if (isNaN(numValue) || numValue <= 100 || numValue === 2026 || numValue === 2025) {
        continue;
      }

      auditedNumbers.push(numValue);
      const numberVariants = [
        rawNumberStr,
        numValue.toString(),
        numValue.toLocaleString(),
        Math.floor(numValue).toString()
      ];

      const isPresent = numberVariants.some(variant => 
        normalizedContext.includes(variant.toLowerCase())
      );

      if (!isPresent) {
        errors.push(`[${contextSource}] Speculative metric detected: "${match[0]}"`);
        hasError = true;
      }
    }

    // 2. Audit Serial IDs (e.g. DON-, DNR-, ALC-, DA001)
    const idRegex = /(?:dnr|don|alc|da)-\d{4}-\d+|da\d{3}/gi;
    while ((match = idRegex.exec(text)) !== null) {
      const id = match[0].toLowerCase();
      if (!normalizedContext.includes(id)) {
        errors.push(`[${contextSource}] Speculative record ID detected: "${match[0]}"`);
        hasError = true;
      }
    }

    // 3. Audit specific entity names if mentioned
    const knownNames = ["ahmed khan", "sara ahmed", "irfan shaikh", "kalyan", "feedback"];
    knownNames.forEach(name => {
      // If the AI mentions "feedback" but the context doesn't have it, it's hallucinating capabilities or data
      if (normalizedText.includes(name) && !normalizedContext.includes(name)) {
        errors.push(`[${contextSource}] Speculative entity/topic detected: "${name}"`);
        hasError = true;
      }
    });

    return hasError;
  }

  // Audit Executive Summary
  auditText(filteredResponse.executiveSummary, "Executive Summary", "executiveSummary");

  // Audit Verified Findings
  filteredResponse.verifiedFindings.forEach((finding, idx) => {
    auditText(finding, "Verified Findings", "verifiedFindings", idx);
  });

  // Audit Operational Observations
  filteredResponse.operationalObservations.forEach((obs, idx) => {
    auditText(obs, "Operational Observations", "operationalObservations", idx);
  });

  // Audit and Filter Potential Actions
  // If an action has an error (hallucination), we FILTER it out.
  const validActions: string[] = [];
  filteredResponse.potentialActions.forEach((action) => {
    const hasError = auditText(action, "Potential Actions", "potentialActions");
    if (!hasError) {
      validActions.push(action);
    }
  });
  filteredResponse.potentialActions = validActions;

  // Calculate Confidence & Status
  let confidence = 100;
  let status: "Verified" | "Partial" | "Failed" = "Verified";

  if (errors.length > 0) {
    confidence = Math.max(50, 100 - (errors.length * 15));
    status = "Partial";
  }

  // If the core response failed fundamentally
  if (filteredResponse.executiveSummary.includes("temporarily unavailable")) {
    confidence = 0;
    status = "Failed";
  }

  return {
    isValid: errors.length === 0,
    errors,
    auditedNumbers,
    filteredResponse,
    confidence,
    status
  };
}
