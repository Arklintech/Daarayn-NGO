/**
 * lib/ai/engines/EnterpriseQueryResolutionEngine.ts
 *
 * Enterprise Query Resolution Engine (EQRE) for KHIZR Intelligence Orchestrator.
 */

import { ICEAnalysis } from "./IntentClassificationEngine";
import { CognitiveThinkingPlan } from "../mco/CognitiveThinkingPlan";

export interface EQREResolution {
  requiredCollections: string[];
  analyticsToRun: string[];
  isAIRequired: boolean;
  responseContract:
    | "DonationSummary"
    | "DonorSummary"
    | "ProjectSummary"
    | "CampaignSummary"
    | "ExecutiveBrief"
    | "WorkflowPlan"
    | "ImpactAnalysis"
    | "CommunicationDraft";
}

export class EnterpriseQueryResolutionEngine {
  static resolveQuery(message: string, iceAnalysis: ICEAnalysis, thinkingPlan: CognitiveThinkingPlan): EQREResolution {
    const queryLower = message.toLowerCase();
    const intent = iceAnalysis.intent;
    const entities = iceAnalysis.entities;
    const requiresFirestore = thinkingPlan.requiredKnowledgeDomains.includes("Firestore");

    const resolution: EQREResolution = {
      requiredCollections: [],
      analyticsToRun: [],
      isAIRequired: true,
      responseContract: "ExecutiveBrief",
    };

    if (!requiresFirestore) {
      return resolution;
    }

    const hasSpecificDonor = !!(entities.donorName || entities.donorId);
    const hasSpecificProgram = !!(entities.programName || entities.programId);
    const isPendingQuery = !!entities.pendingOnly;
    const isListQuery = !!(entities.listAllDonors || entities.listAllCauses || entities.listRepeatDonors || entities.emailCountQuery || entities.emailFailedOnly);
    const isInvestigation = intent === "investigations" || intent === "decisionSupport" || intent === "strategicPlanning";
    const isAdviceQuery = !!entities.wantsAdvice;
    const isExecutiveIntel = !!(
      entities.wantsProgramDonations ||
      entities.wantsAllocationAudit ||
      entities.wantsExecutiveDonorAnalysis ||
      entities.wantsProactiveRisk ||
      entities.wantsStrategicActions ||
      entities.wantsFinancialInvestigation ||
      entities.executiveOpsMode
    );

    // Intent-first collection targeting — never dump all collections by default
    switch (intent) {
      case "donationSearch":
      case "publicLedger":
      case "financialIntelligence":
        resolution.requiredCollections.push("donations");
        resolution.responseContract = "DonationSummary";
        break;
      case "donorIntelligence":
        resolution.requiredCollections.push("donors", "donations");
        resolution.responseContract = "DonorSummary";
        break;
      case "projectIntelligence":
      case "campaignIntelligence":
      case "beneficiaryIntelligence":
        resolution.requiredCollections.push("programs");
        resolution.responseContract = "ProjectSummary";
        break;
      case "communicationIntelligence":
        resolution.requiredCollections.push("communications", "donors");
        resolution.responseContract = isPendingQuery ? "DonorSummary" : "CommunicationDraft";
        break;
      case "executiveBriefing":
      case "operationalIntelligence":
        resolution.requiredCollections.push("donations", "programs", "donors", "communications");
        resolution.responseContract = "ExecutiveBrief";
        break;
      case "investigations":
      case "analytics":
      case "decisionSupport":
      case "strategicPlanning":
        resolution.requiredCollections.push("donations", "programs", "donors", "communications");
        resolution.responseContract = "ExecutiveBrief";
        break;
      case "complianceIntelligence":
      case "reviewCompliance":
        resolution.requiredCollections.push("donations", "programs", "publicLedger");
        resolution.responseContract = "CampaignSummary";
        break;
      case "knowledgeSearch":
        resolution.requiredCollections.push("settings");
        break;
      case "chat":
      case "globalSearch":
        resolution.isAIRequired = true;
        resolution.responseContract = "ExecutiveBrief";
        break;
      default:
        if (queryLower.includes("donat") || queryLower.includes("give") || queryLower.includes("gave") || queryLower.includes("contributed")) {
          resolution.requiredCollections.push("donations");
          resolution.responseContract = hasSpecificDonor ? "DonorSummary" : "DonationSummary";
        } else if (queryLower.includes("donor") || queryLower.includes("contributor")) {
          resolution.requiredCollections.push("donors", "donations");
          resolution.responseContract = "DonorSummary";
        } else if (queryLower.includes("project") || queryLower.includes("program") || queryLower.includes("education")) {
          resolution.requiredCollections.push("programs");
          resolution.responseContract = "ProjectSummary";
        } else {
          resolution.requiredCollections.push("programs", "publicLedger");
          resolution.responseContract = "ExecutiveBrief";
        }
    }

    if (queryLower.includes("total") || queryLower.includes("how much") || queryLower.includes("sum")) {
      resolution.analyticsToRun.push("aggregate_donations");
    }
    if (
      queryLower.includes("average") ||
      queryLower.includes("median") ||
      queryLower.includes("largest") ||
      queryLower.includes("repeat") ||
      queryLower.includes("unique")
    ) {
      resolution.analyticsToRun.push("extended_metrics");
    }
    if (queryLower.includes("progress") || queryLower.includes("percent") || queryLower.includes("gap") || queryLower.includes("funding")) {
      resolution.analyticsToRun.push("project_progress");
    }

    const asksForEmailStats = !!(entities.emailCountQuery || entities.emailFailedOnly);
    const asksForDraft =
      !asksForEmailStats &&
      (queryLower.includes("draft") ||
      queryLower.includes("write") ||
      (queryLower.includes("message") && !isPendingQuery && !queryLower.includes("email")) ||
      (queryLower.includes("send") && !queryLower.includes("sent") && !queryLower.includes("email")));
    const asksForWorkflow =
      queryLower.includes("allocate") ||
      queryLower.includes("execute") ||
      (queryLower.includes("plan") && queryLower.includes("proposal"));
    const asksForReasoning =
      (isInvestigation && !isAdviceQuery) ||
      queryLower.includes("why") ||
      (queryLower.includes("advise") && !isAdviceQuery) ||
      queryLower.includes("brainstorm");

    if (isExecutiveIntel) {
      resolution.requiredCollections = ["donations", "programs", "donors", "communications"];
      resolution.responseContract = "ExecutiveBrief";
      resolution.isAIRequired = false;
      resolution.analyticsToRun.push("aggregate_donations", "extended_metrics", "project_progress");
    }

    if (entities.wantsProgramDonations) {
      if (!resolution.requiredCollections.includes("donations")) resolution.requiredCollections.push("donations");
      if (!resolution.requiredCollections.includes("programs")) resolution.requiredCollections.push("programs");
      resolution.isAIRequired = false;
    }

    if (intent === "volunteerIntelligence") {
      resolution.requiredCollections.push("volunteers");
      resolution.responseContract = "ExecutiveBrief";
      resolution.isAIRequired = false;
    }

    // Deterministic only for aggregate lookups without specific entities or reasoning
    const canUseDeterministic =
      !asksForDraft &&
      !asksForWorkflow &&
      !asksForReasoning &&
      !isAdviceQuery &&
      !isPendingQuery &&
      !isExecutiveIntel &&
      !hasSpecificDonor &&
      (!hasSpecificProgram || entities.listAllCauses) &&
      (intent === "donationSearch" || intent === "projectIntelligence" || intent === "donorIntelligence" || intent === "communicationIntelligence" || isListQuery);

    if (canUseDeterministic) {
      resolution.isAIRequired = false;
    }

    if (hasSpecificDonor || isPendingQuery || isListQuery) {
      resolution.isAIRequired = false;
    }

    if (entities.timeframe && intent === "donationSearch") {
      resolution.isAIRequired = false;
    }

    if (isAdviceQuery) {
      resolution.isAIRequired = false;
    }

    if (asksForWorkflow) {
      resolution.responseContract = "WorkflowPlan";
      resolution.isAIRequired = true;
    } else if (asksForDraft) {
      resolution.responseContract = "CommunicationDraft";
      resolution.isAIRequired = true;
    } else if (asksForReasoning) {
      resolution.isAIRequired = true;
    }

    // Final overrides — operational list/stat/advice/executive intel queries stay deterministic
    if (isListQuery || isAdviceQuery || asksForEmailStats || isExecutiveIntel || intent === "volunteerIntelligence" || (entities.timeframe && intent === "donationSearch")) {
      resolution.isAIRequired = false;
    }

    return resolution;
  }
}
