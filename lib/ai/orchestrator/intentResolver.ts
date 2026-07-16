/**
 * lib/ai/orchestrator/intentResolver.ts
 *
 * MIO Intent Resolver.
 * Resolves natural language prompts into structured operational action intents.
 */

export type MioActionType =
  | "allocateDonation"
  | "publishUpdate"
  | "generateCertificates"
  | "dispatchCommunications"
  | "reviewCompliance"
  | "generateReport"
  | "unknown";

export interface ResolvedIntent {
  actionType: MioActionType;
  parameters: {
    amount?: number;
    currency?: string;
    projectTitle?: string;
    projectId?: string;
    donorName?: string;
    donorId?: string;
    donationId?: string;
    reportType?: "board" | "monthly" | "annual" | "compliance";
    timeframe?: string;
  };
  confidence: number;
}

/**
 * Parses user input to resolve operational action intents.
 */
export async function resolveMioIntent(message: string): Promise<ResolvedIntent> {
  const queryLower = message.toLowerCase();
  
  // Default values
  let actionType: MioActionType = "unknown";
  const parameters: ResolvedIntent["parameters"] = {};
  let confidence = 0.5;

  // Extract amount
  const amountMatch = message.match(/(?:₹|inr)?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/i);
  if (amountMatch && !queryLower.includes("donors") && !queryLower.includes("emails")) {
    const cleanNum = parseFloat(amountMatch[1].replace(/,/g, ""));
    // Filter out potential year matches or index matches
    if (cleanNum > 100 && cleanNum !== 2026 && cleanNum !== 2025) {
      parameters.amount = cleanNum;
      parameters.currency = "INR";
    }
  }

  // Extract project title
  if (queryLower.includes("family relief") || queryLower.includes("family")) {
    parameters.projectTitle = "Family Relief";
    parameters.projectId = "PRG-FAMILY";
  } else if (queryLower.includes("quran") || queryLower.includes("endowment")) {
    parameters.projectTitle = "Quran Endowment";
    parameters.projectId = "PRG-QURAN";
  } else if (queryLower.includes("water") || queryLower.includes("well") || queryLower.includes("pump")) {
    parameters.projectTitle = "Water Well";
    parameters.projectId = "PRG-WATER";
  } else if (queryLower.includes("kalyan")) {
    parameters.projectTitle = "Kalyan Community Support";
    parameters.projectId = "PRG-KALYAN";
  }

  // Extract donor name
  if (queryLower.includes("ahmed khan")) {
    parameters.donorName = "Ahmed Khan";
    parameters.donorId = "DNR-2026-000001";
  } else if (queryLower.includes("sara ahmed")) {
    parameters.donorName = "Sara Ahmed";
    parameters.donorId = "DNR-2026-000002";
  }

  // Intent resolution matching
  if (queryLower.includes("allocate") || queryLower.includes("split") || queryLower.includes("distribution")) {
    actionType = "allocateDonation";
    confidence = 0.95;
  } else if (
    (queryLower.includes("publish") || queryLower.includes("log") || queryLower.includes("post")) && 
    (queryLower.includes("update") || queryLower.includes("milestone") || queryLower.includes("progress"))
  ) {
    actionType = "publishUpdate";
    confidence = 0.95;
  } else if (queryLower.includes("certificate") || queryLower.includes("exemption") || queryLower.includes("80g")) {
    actionType = "generateCertificates";
    confidence = 0.90;
  } else if (queryLower.includes("dispatch") || queryLower.includes("send all") || queryLower.includes("approve queue")) {
    actionType = "dispatchCommunications";
    confidence = 0.95;
  } else if (queryLower.includes("compliance") || queryLower.includes("audit") || queryLower.includes("verify ledger")) {
    actionType = "reviewCompliance";
    confidence = 0.95;
  } else if (queryLower.includes("report") || queryLower.includes("statement") || queryLower.includes("briefing")) {
    actionType = "generateReport";
    confidence = 0.90;
    if (queryLower.includes("board")) parameters.reportType = "board";
    else if (queryLower.includes("monthly")) parameters.reportType = "monthly";
    else if (queryLower.includes("annual")) parameters.reportType = "annual";
  }

  return {
    actionType,
    parameters,
    confidence
  };
}
