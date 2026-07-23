/**
 * lib/ai/knowledge/responseFormatter.ts
 *
 * Response Formatter for KHIZR Knowledge Intelligence Engine (MKIE).
 * Enforces executive layout style, formats the validated JSON into Markdown,
 * and builds strict Verification Metadata attributions without duplication.
 */

import type { RetrievedFact } from "./retriever";

/**
 * Decorates generated Grok JSON response with deterministic Markdown and Verification Metadata.
 */
export function formatKhizrResponse(
  jsonResponse: any,
  facts: RetrievedFact[],
  validationStatus: string,
  confidence: number,
  requestId: string
): string {
  let formatted = "";

  if (validationStatus === "Partial") {
    formatted += "> [!WARNING]\n";
    formatted += "> **Compliance Engine Advisory**: This response contained unverified claims that were automatically filtered by the KHIZR Compliance Engine. Inspect details before authorizing decisions.\n\n";
  } else if (validationStatus === "Failed") {
    formatted += "> [!CAUTION]\n";
    formatted += "> **Critical Engine Failure**: The AI intelligence pipeline is currently unavailable. Displaying raw ledger data only.\n\n";
  }

  if (jsonResponse.executiveSummary) {
    formatted += "### Executive Summary\n" + jsonResponse.executiveSummary + "\n\n";
  }

  if (jsonResponse.verifiedFindings && jsonResponse.verifiedFindings.length > 0) {
    formatted += "### Verified Organizational Findings\n";
    jsonResponse.verifiedFindings.forEach((finding: string) => {
      formatted += "- " + finding + "\n";
    });
    formatted += "\n";
  }

  if (jsonResponse.operationalObservations && jsonResponse.operationalObservations.length > 0) {
    formatted += "### Operational Observations\n";
    jsonResponse.operationalObservations.forEach((obs: string) => {
      formatted += "- " + obs + "\n";
    });
    formatted += "\n";
  }

  if (jsonResponse.potentialActions && jsonResponse.potentialActions.length > 0) {
    formatted += "### Potential Actions\n";
    jsonResponse.potentialActions.forEach((action: string) => {
      formatted += "- " + action + "\n";
    });
    formatted += "\n";
  }

  formatted += "---\n\n";
  formatted += "### Verification Metadata\n\n";

  const uniqueSources = Array.from(new Set(facts.map(f => f.source)));
  const sourceText = uniqueSources.length > 0 
    ? uniqueSources.map(s => "`" + s + "`").join(", ") 
    : "None (System Policies)";
    
  formatted += "- **Source Collections**: " + sourceText + "\n";

  const idList = Array.from(new Set(facts.map(f => f.id).filter(Boolean)));
  const idText = idList.length > 0 
    ? idList.map(id => "`" + id + "`").join(", ") 
    : "None";

  formatted += "- **Referenced IDs**: " + idText + "\n";
  formatted += "- **Validation Status**: " + validationStatus + "\n";
  formatted += "- **Confidence Level**: " + confidence + "%\n";
  formatted += "- **Request ID**: `" + requestId + "`\n";
  formatted += "- **Timestamp**: " + new Date().toISOString() + "\n";

  return formatted;
}
