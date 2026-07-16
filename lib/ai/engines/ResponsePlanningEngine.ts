/**
 * lib/ai/engines/ResponsePlanningEngine.ts
 *
 * Response Planning Engine (RPE) for Phase 3.11.
 * Deterministically constructs a response plan specifying response type,
 * allowed metrics, narrative permissions, and required structure constraints.
 */

export interface ResponsePlan {
  responseType: "deterministic" | "ai_assisted";
  responseContract:
    | "DonationSummary"
    | "DonorSummary"
    | "ProjectSummary"
    | "CampaignSummary"
    | "ExecutiveBrief"
    | "WorkflowPlan"
    | "ImpactAnalysis"
    | "CommunicationDraft";
  requiredSections: string[];
  allowedMetrics: string[];
  allowedNarrative: string[];
  allowedRecommendations: string[];
  formattingContract: "Communication" | "ExecutiveBrief" | "WorkflowPlan" | "StandardJSON";
}

export class ResponsePlanningEngine {
  /**
   * Evaluates incoming request parameters and deterministically structures a response plan.
   */
  static planResponse(
    userQuery: string,
    intent: string,
    isAIRequired: boolean,
    resolvedContract: string
  ): ResponsePlan {
    const queryLower = userQuery.toLowerCase();
    
    // Default Plan
    const plan: ResponsePlan = {
      responseType: isAIRequired ? "ai_assisted" : "deterministic",
      responseContract: resolvedContract as any,
      requiredSections: ["executiveSummary"],
      allowedMetrics: [],
      allowedNarrative: [],
      allowedRecommendations: [],
      formattingContract: "ExecutiveBrief",
    };

    // 1. Map Allowed Metrics based on query categories
    if (queryLower.includes("donat") || queryLower.includes("total") || queryLower.includes("amount") || queryLower.includes("sum")) {
      plan.allowedMetrics.push("totalDonations", "transactionCount", "averageDonation", "largestDonation", "smallestDonation", "medianDonation");
    }
    if (queryLower.includes("donor") || queryLower.includes("contribut") || queryLower.includes("who")) {
      plan.allowedMetrics.push("uniqueDonorsCount", "repeatDonorsCount", "topDonorName", "topDonorTotal");
    }
    if (queryLower.includes("project") || queryLower.includes("program") || queryLower.includes("progress") || queryLower.includes("gap")) {
      plan.allowedMetrics.push("projectId", "amountRequired", "amountCollected", "progress", "remainingGap", "status");
    }

    // 2. Map Allowed Recommendations & Actions
    // Always allow proactive intelligence (Phase 4 MIBF)
    plan.allowedRecommendations.push("proactiveIntelligence");
    if (queryLower.includes("allocate") || queryLower.includes("propose") || queryLower.includes("plan")) {
      plan.allowedRecommendations.push("allocateFunds", "requestSignoff", "syncLedger");
    }

    // 3. Narrative validation guidelines
    if (queryLower.includes("draft") || queryLower.includes("email") || queryLower.includes("message")) {
      plan.responseContract = "CommunicationDraft";
      plan.formattingContract = "Communication";
      plan.requiredSections = ["subject", "preview", "greeting", "body", "dua", "cta", "footer"];
      plan.allowedNarrative.push("spiritualDuas", "donorAppreciation", "disclaimer", "transparencyClause");
    } else if (queryLower.includes("propose") || queryLower.includes("plan") || queryLower.includes("allocate")) {
      plan.responseContract = "WorkflowPlan";
      plan.formattingContract = "WorkflowPlan";
      plan.requiredSections = ["executiveSummary"];
      plan.allowedNarrative.push("executionSteps", "systemMilestones");
    } else {
      plan.responseContract = "ExecutiveBrief";
      plan.formattingContract = "ExecutiveBrief";
      plan.requiredSections = ["executiveSummary"];
      plan.allowedNarrative.push("operationalBrief", "metricsExplanation");
    }

    // Override responseType if bypassing AI completely
    if (!isAIRequired) {
      plan.responseType = "deterministic";
      if (resolvedContract === "DonationSummary") {
        plan.responseContract = "DonationSummary";
      } else if (resolvedContract === "DonorSummary") {
        plan.responseContract = "DonorSummary";
      } else {
        plan.responseContract = "ProjectSummary";
      }
    }

    return plan;
  }
}
