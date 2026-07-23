/**
 * lib/ai/mco/CognitiveThinkingPlan.ts
 *
 * KHIZR Cognitive Orchestrator — Stage 2: Cognitive Thinking Plan
 *
 * Purpose: Before invoking any enterprise tool, MCO articulates EXACTLY
 * what it plans to do, why, and what it expects to find. This makes
 * KHIZR's reasoning transparent, auditable, and intentional.
 *
 * The ThinkingPlan is logged to Firestore as part of the conversation
 * audit trail. Administrators and developers can inspect WHY KHIZR
 * chose specific tools for any given query.
 *
 * This engine is fully DETERMINISTIC. No LLM calls.
 */

import type { AdministratorObjective, DecisionType } from "./AdministratorObjectiveEngine";
import type { ICEAnalysis } from "../engines/IntentClassificationEngine";

export interface CognitiveTool {
  // The name of the enterprise capability being invoked
  capability: string;
  // Why MCO is calling this capability for this specific objective
  rationale: string;
  // What MCO expects to learn from this capability
  expectedOutcome: string;
  // Whether this tool is essential or supplementary
  priority: "essential" | "supplementary";
}

export interface CognitiveThinkingPlan {
  // Unique identifier for this thinking plan
  planId: string;
  // The true objective MCO is working to fulfill
  objective: string;
  // The decision type driving the plan
  decisionType: DecisionType;
  // Ordered list of cognitive tools MCO intends to invoke
  toolSequence: CognitiveTool[];
  // What MCO expects to produce by the end of this plan
  expectedDeliverable: string;
  // How MCO intends to frame the response (tone and focus)
  responseFraming: string;
  // Timestamp of plan creation
  plannedAt: string;
  
  // ─── Cognitive Evolutions (Phase 6.0.1) ───
  // Cognitive Evolution 3: Knowledge Planning
  requiredKnowledgeDomains: string[];
  // Cognitive Evolution 5: Conversation Blueprint
  conversationBlueprint: string[];
}

export class CognitiveThinkingPlanEngine {

  /**
   * Constructs MCO's pre-execution thinking plan.
   * Deterministic based on the administrator's classified objective.
   */
  static formulate(
    objective: AdministratorObjective,
    iceAnalysis: ICEAnalysis
  ): CognitiveThinkingPlan {

    const entities = iceAnalysis.entities;
    const forceFirestore = !!(
      entities.listAllDonors || entities.listAllCauses || entities.listRepeatDonors ||
      entities.emailCountQuery || entities.emailFailedOnly || entities.wantsAdvice ||
      entities.timeframe || entities.pendingOnly || entities.donorName ||
      entities.wantsProgramDonations || entities.wantsAllocationAudit ||
      entities.wantsExecutiveDonorAnalysis || entities.wantsProactiveRisk ||
      entities.wantsStrategicActions || entities.wantsFinancialInvestigation ||
      entities.executiveOpsMode ||
      iceAnalysis.intent === "volunteerIntelligence" || iceAnalysis.intent === "executiveBriefing" ||
      iceAnalysis.intent === "operationalIntelligence"
    );

    const planId = `MCO-PLAN-${Date.now()}`;
    const tools: CognitiveTool[] = [];

    // ─── MUEIF Evolution: Executive Knowledge Planning ──────────────────────
    const requiredKnowledgeDomains: string[] = [
      "Universal Executive Knowledge", 
      "Daarayn Identity Knowledge", 
      "Conversation Context"
    ]; 
    
    // Determine if Firestore (Live Organizational Intelligence) is needed
    // DO NOT retrieve Firestore for abstract, greeting, or philosophical discussions
    const isPhilosophicalOrGreeting = 
      objective.conversationPurpose === "Greeting" || 
      objective.conversationPurpose === "Islamic Greeting" || 
      objective.conversationPurpose === "Educational" || 
      objective.conversationPurpose === "Organizational Philosophy" ||
      objective.conversationPurpose === "Mission Discussion";

    const needsLiveIntelligence = 
      !isPhilosophicalOrGreeting && 
      (objective.decisionType === "OPERATIONAL_LOOKUP" || 
       objective.decisionType === "EXECUTIVE_INTELLIGENCE" || 
       objective.decisionType === "STRATEGIC_ASSESSMENT" || 
       objective.decisionType === "INVESTIGATIVE_ANALYSIS" || 
       objective.decisionType === "WORKFLOW_EXECUTION" || 
       objective.decisionType === "COMPLIANCE_VERIFICATION");

    // Only inject Firestore if the conversation purpose actually requires evidence
    // (e.g. "Donations this month", "Project Status", "Explain Amanah" -> no)
    if (needsLiveIntelligence || forceFirestore) {
        if (forceFirestore || objective.domain !== "Executive" || objective.decisionType === "EXECUTIVE_INTELLIGENCE" || objective.decisionType === "STRATEGIC_ASSESSMENT") {
            requiredKnowledgeDomains.push("Firestore");
        }
    }

    if (objective.domain === "Donor" || objective.domain === "Finance") {
        requiredKnowledgeDomains.push("Operational Analytics", "Financial Intelligence");
    } else if (objective.domain === "Project") {
        requiredKnowledgeDomains.push("Timeline", "Operational Analytics");
    } else if (objective.domain === "Compliance") {
        requiredKnowledgeDomains.push("Compliance", "Historical Context");
    } else if (objective.domain === "Executive") {
        requiredKnowledgeDomains.push("Board Intelligence", "Organizational Experience", "Executive Judgment");
    }

    // ─── Always start with Business Rules verification ───────────────────────
    tools.push({
      capability: "BusinessRulesEngine",
      rationale: "Verify the administrator has permission to access the requested domain before any data is retrieved.",
      expectedOutcome: "Confirmed authorization boundary and allowed collections.",
      priority: "essential"
    });

    // ─── Domain-specific tool selection ─────────────────────────────────────
    switch (objective.domain) {
      case "Donor":
        if (needsLiveIntelligence) {
            tools.push({
              capability: "Firestore:donors",
              rationale: "Retrieve verified donor records from the organizational source of truth.",
              expectedOutcome: "Donor profile, contribution history, and engagement status.",
              priority: "essential"
            });
            if (objective.decisionType !== "DRAFTING_ACTION") {
              tools.push({
                capability: "Firestore:donations",
                rationale: "Cross-reference donation records to provide contribution context alongside the donor profile.",
                expectedOutcome: "Total donations, frequency, and last contribution date.",
                priority: "supplementary"
              });
            }
        }
        if (objective.decisionType === "DRAFTING_ACTION") {
          tools.push({
            capability: "ExecutiveResponseWriter:CommunicationDraft",
            rationale: "Draft a values-aligned communication using verified donor data.",
            expectedOutcome: "A ready-to-review communication draft that reflects Daarayn's voice.",
            priority: "essential"
          });
        }
        break;

      case "Finance":
        if (needsLiveIntelligence) {
            tools.push({
              capability: "Firestore:donations",
              rationale: "Retrieve verified financial transaction records from Firestore.",
              expectedOutcome: "Total donations, breakdowns by fund type, and transaction history.",
              priority: "essential"
            });
        }
        tools.push({
          capability: "VerifiedAnalyticsEngine",
          rationale: "Run backend-verified calculations. No metrics are estimated — all figures are deterministic.",
          expectedOutcome: "Verified totals, averages, top donors, and growth metrics.",
          priority: "essential"
        });
        break;

      case "Project":
        if (needsLiveIntelligence) {
            tools.push({
              capability: "Firestore:projects",
              rationale: "Retrieve active project records to assess mission delivery status.",
              expectedOutcome: "Project funding progress, milestones, and beneficiary impact metrics.",
              priority: "essential"
            });
        }
        tools.push({
          capability: "VerifiedAnalyticsEngine:project_progress",
          rationale: "Calculate deterministic progress percentages and funding gaps.",
          expectedOutcome: "Verified progress percentage and remaining funding requirement.",
          priority: "essential"
        });
        break;

      case "Compliance":
        if (needsLiveIntelligence) {
            tools.push({
              capability: "Firestore:donations",
              rationale: "Review fund allocation records against Sharia and organizational compliance rules.",
              expectedOutcome: "Zakat/Sadaqah split, allocation status, and unallocated fund positions.",
              priority: "essential"
            });
        }
        tools.push({
          capability: "BusinessRulesEngine:compliance_audit",
          rationale: "Evaluate organizational policies against current operational data.",
          expectedOutcome: "Compliance score, pending approvals, and audit readiness assessment.",
          priority: "essential"
        });
        break;

      case "Communication":
        if (needsLiveIntelligence) {
            tools.push({
              capability: "Firestore:donors",
              rationale: "Retrieve donor information needed to personalize the communication.",
              expectedOutcome: "Donor name, contact details, and recent contribution context.",
              priority: "essential"
            });
        }
        tools.push({
          capability: "ExecutiveResponseWriter:CommunicationDraft",
          rationale: "Generate an organization-voice-aligned draft using verified data.",
          expectedOutcome: "Draft communication ready for administrator review.",
          priority: "essential"
        });
        break;

      case "Executive":
        tools.push({
          capability: "EnterpriseMissionControl:EOAS",
          rationale: "Trigger the full Executive Organizational Awareness pipeline for comprehensive intelligence.",
          expectedOutcome: "Synthesized organizational health, strategic risks, opportunities, and work queue.",
          priority: "essential"
        });
        break;

      default:
        if (needsLiveIntelligence) {
            tools.push({
              capability: "Firestore:globalSearch",
              rationale: "Perform a broad search across available organizational data.",
              expectedOutcome: "Relevant records from across Daarayn's operational database.",
              priority: "essential"
            });
        }
    }

    // ─── Always end with Response Writer ────────────────────────────────────
    if (objective.domain !== "Executive") {
      tools.push({
        capability: "ExecutiveResponseWriter",
        rationale: "Translate verified, certified organizational intelligence into natural executive-quality communication.",
        expectedOutcome: "A response that sounds like Daarayn's most experienced Operations Officer — not like a database.",
        priority: "essential"
      });
    }

    // ─── Always run ERL asynchronously ──────────────────────────────────────
    tools.push({
      capability: "ExecutiveReflectionEngine (async)",
      rationale: "After the response is delivered, evaluate the interaction to extract organizational lessons.",
      expectedOutcome: "An evolution record stored in khizr_evolution for continuous improvement.",
      priority: "supplementary"
    });

    // ─── Determine response framing ─────────────────────────────────────────
    let responseFraming: string;
    switch (objective.decisionType) {
      case "EXECUTIVE_INTELLIGENCE":
        responseFraming = "Lead with the most important operational signal today. Present intelligence in order of decision urgency. End with a prioritized action queue.";
        break;
      case "STRATEGIC_ASSESSMENT":
        responseFraming = "Begin with the headline finding. Provide context and trend. Close with a strategic recommendation.";
        break;
      case "INVESTIGATIVE_ANALYSIS":
        responseFraming = "Acknowledge the concern. Present the verified evidence. Offer a grounded interpretation. Recommend a clear next step.";
        break;
      case "DRAFTING_ACTION":
        responseFraming = "Produce a ready-to-use draft. The administrator should feel they can send this with minimal editing.";
        break;
      case "WORKFLOW_EXECUTION":
        responseFraming = "Confirm the action plan. List steps clearly. Highlight what requires administrator approval.";
        break;
      case "COMPLIANCE_VERIFICATION":
        responseFraming = "State compliance status clearly upfront. Flag any concerns explicitly. Recommend remediation actions.";
        break;
      default:
        responseFraming = "Answer the question directly and completely. Offer one relevant contextual observation.";
    }

    const expectedDeliverable = objective.requiresSynthesis
      ? "A synthesized executive insight that connects verified data to operational meaning"
      : "A precise, fact-grounded answer to the administrator's query";

    // ─── MCEP Evolution 5: Conversation Blueprint (Dynamic Assembly) ────────
    let conversationBlueprint: string[] = [];

    // 1. Opening Phase
    if (objective.conversationPurpose === "Investigation" || objective.conversationPurpose === "Root Cause Analysis") {
      conversationBlueprint.push("Acknowledge Concern", "Present Objective Facts");
    } else if (objective.conversationPurpose === "Executive Briefing" || objective.conversationPurpose === "Strategic Advisory") {
      conversationBlueprint.push("Executive Summary", "Key Metric Highlight");
    } else if (objective.conversationPurpose === "Mission Discussion" || objective.conversationPurpose === "Organizational Philosophy") {
      conversationBlueprint.push("Value Alignment", "Historical Context");
    } else if (objective.conversationPurpose === "Greeting" || objective.conversationPurpose === "Islamic Greeting") {
      conversationBlueprint.push("Warm Greeting", "Acknowledge Administrator Role");
    } else if (objective.conversationPurpose === "Clarification") {
      conversationBlueprint.push("Acknowledge Goal", "Clarify Nuance");
    } else {
      conversationBlueprint.push("Direct Context Setting");
    }

    // 2. Core Reasoning Phase
    if (objective.decisionType === "STRATEGIC_ASSESSMENT") {
      conversationBlueprint.push("Trend Analysis", "Risk Evaluation", "Opportunity Identification");
    } else if (objective.decisionType === "INVESTIGATIVE_ANALYSIS") {
      conversationBlueprint.push("Evidence Review", "Root Cause Hypothesis");
    } else if (objective.decisionType === "WORKFLOW_EXECUTION") {
      conversationBlueprint.push("Workflow Validation", "Execution Steps");
    } else if (objective.decisionType === "EXECUTIVE_INTELLIGENCE") {
      conversationBlueprint.push("Operational Status", "Compliance Health");
    } else if (objective.conversationPurpose === "Educational") {
      conversationBlueprint.push("Simple Explanation", "Organizational Example");
    } else if (objective.conversationPurpose === "Brainstorming") {
      conversationBlueprint.push("Idea Generation", "Trade-off Consideration");
    }

    // 3. Closing Phase
    if (objective.urgency === "IMMEDIATE") {
      conversationBlueprint.push("Urgent Recommendation", "Await Sign-off");
    } else if (objective.decisionType === "INVESTIGATIVE_ANALYSIS") {
      conversationBlueprint.push("Suggested Next Investigation Step");
    } else if (objective.decisionType === "DRAFTING_ACTION") {
      conversationBlueprint.push("Draft Presentation", "Offer Revisions");
    } else if (objective.conversationPurpose === "Greeting" || objective.conversationPurpose === "Islamic Greeting") {
      conversationBlueprint.push("Offer Assistance");
    } else {
      conversationBlueprint.push("Strategic Recommendation", "Next Priority");
    }

    return {
      planId,
      objective: objective.trueObjective,
      decisionType: objective.decisionType,
      toolSequence: tools,
      expectedDeliverable,
      responseFraming,
      plannedAt: new Date().toISOString(),
      requiredKnowledgeDomains,
      conversationBlueprint
    };
  }
}
