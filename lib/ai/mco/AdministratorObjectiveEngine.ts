/**
 * lib/ai/mco/AdministratorObjectiveEngine.ts
 *
 * KHIDR Cognitive Orchestrator — Stage 1: Administrator Objective Engine
 *
 * Purpose: Determine the administrator's TRUE operational objective — not
 * just what they typed, but what they are trying to ACCOMPLISH as a trustee
 * of Daarayn. This is the semantic layer above intent classification.
 *
 * This engine is fully DETERMINISTIC. No LLM calls. It operates on
 * classified signals from HCIE and ICE to produce a structured objective.
 */

import type { ICEAnalysis } from "../engines/IntentClassificationEngine";
import type { HCIEAnalysis } from "../hcie/HumanCommunicationIntelligenceEngine";
import type { KhidrRole } from "../knowledge/permissionEngine";

// The urgency level of the objective
export type ObjectiveUrgency = "IMMEDIATE" | "STANDARD" | "BACKGROUND";

// The type of decision the administrator is navigating
export type DecisionType =
  | "OPERATIONAL_LOOKUP"      // Finding a specific fact or record
  | "STRATEGIC_ASSESSMENT"    // Understanding the health of something
  | "DRAFTING_ACTION"         // Creating a communication or document
  | "WORKFLOW_EXECUTION"      // Performing an operational task
  | "COMPLIANCE_VERIFICATION" // Checking rules or readiness
  | "EXECUTIVE_INTELLIGENCE"  // Morning brief / overall awareness
  | "INVESTIGATIVE_ANALYSIS"; // Why is X happening / root cause

export type ReasoningDepth = "MINIMAL" | "LIGHT" | "MODERATE" | "DEEP" | "MAXIMUM";

export type ConversationPurpose = 
  | "Executive Briefing"
  | "Operational Review"
  | "Strategic Advisory"
  | "Decision Support"
  | "Investigation"
  | "Root Cause Analysis"
  | "Mission Discussion"
  | "Organizational Philosophy"
  | "Educational"
  | "Brainstorming"
  | "Executive Reflection"
  | "Planning"
  | "Board Preparation"
  | "Donor Discussion"
  | "Campaign Discussion"
  | "Project Discussion"
  | "Compliance Discussion"
  | "Financial Discussion"
  | "General Conversation"
  | "Greeting"
  | "Islamic Greeting"
  | "Encouragement"
  | "Clarification"
  | "Challenge"
  | "Debate";

export interface AdministratorObjective {
  // The surface-level question as typed
  surfaceQuery: string;
  // What the administrator truly needs to accomplish
  trueObjective: string;
  // Operational context: what role does this serve?
  operationalContext: string;
  // Type of decision this feeds
  decisionType: DecisionType;
  // How urgently this needs resolution
  urgency: ObjectiveUrgency;
  // Is this query directly related to Daarayn's mission delivery?
  missionRelevant: boolean;
  // The amanah (trust) dimension — what responsibility does this support?
  amanahDimension: string;
  // Whether this query requires synthesized insight vs raw data retrieval
  requiresSynthesis: boolean;
  // The primary organizational domain
  domain: "Donor" | "Finance" | "Project" | "Compliance" | "Communication" | "Executive" | "System" | "Volunteer" | "Governance" | "Campaign";
  
  // ─── Cognitive Evolutions (Phase 6.0.1) ───
  // Cognitive Evolution 1: Meta Thinking Challenge
  metaThinkingChallenge: string;
  // Cognitive Evolution 2: Adaptive Cognitive Strategy
  reasoningDepth: ReasoningDepth;
  // Cognitive Evolution 7: Conversation Adaptability
  conversationPurpose: ConversationPurpose;
  // Cognitive Evolution 9: Islamic Identity
  shouldIncludeIslamicGreeting: boolean;
}

export class AdministratorObjectiveEngine {

  /**
   * Constructs a structured AdministratorObjective from raw HCIE and ICE signals.
   * Deterministic. No LLM required.
   */
  static understand(
    normalizedMessage: string,
    hcieAnalysis: HCIEAnalysis,
    iceAnalysis: ICEAnalysis,
    userRole: KhidrRole,
    historyText: string
  ): AdministratorObjective {

    const lower = normalizedMessage.toLowerCase();
    const intent = iceAnalysis.intent;
    const mode = hcieAnalysis.mode;

    // ─── Step 1: Determine Domain ───────────────────────────────────────────
    let domain: AdministratorObjective["domain"] = "Executive";
    if (intent === "donorIntelligence") domain = "Donor";
    else if (intent === "donationSearch" || intent === "financialIntelligence" || intent === "publicLedger") domain = "Finance";
    else if (intent === "projectIntelligence" || intent === "beneficiaryIntelligence") domain = "Project";
    else if (intent === "complianceIntelligence" || intent === "reviewCompliance") domain = "Compliance";
    else if (intent === "communicationIntelligence" || intent === "dispatchCommunications" || intent === "emailIntelligence") domain = "Communication";
    else if (intent === "volunteerIntelligence") domain = "Volunteer";
    else if (intent === "governance") domain = "Governance";
    else if (intent === "campaignIntelligence") domain = "Campaign";
    else if (intent === "executiveBriefing" || intent === "operationalIntelligence" || intent === "generateReport" || intent === "analytics" || intent === "investigations" || intent === "decisionSupport" || intent === "strategicPlanning" || intent === "organizationalMemory" || intent === "reporting") domain = "Executive";
    else if (intent === "administration") domain = "System";

    // ─── Step 2: Determine Decision Type ────────────────────────────────────
    let decisionType: DecisionType = "OPERATIONAL_LOOKUP";

    const isMorningBrief =
      /\b(brief\s+me|start\s+my\s+day|before\s+i\s+start|requires?\s+my\s+attention|everything\s+that\s+requires)\b/i.test(
        lower
      );
    const isStrategicExecutive =
      /\b(coo\b|chief\s+operating|strategic\s+actions|worried\s+about|investigate|board\s+of\s+trustees|executive\s+attention|30\s+days|operational\s+health)\b/i.test(
        lower
      );

    if (intent === "executiveBriefing" || isMorningBrief) {
      decisionType = "EXECUTIVE_INTELLIGENCE";
    } else if (isStrategicExecutive || intent === "strategicPlanning" || intent === "investigations" || intent === "decisionSupport") {
      decisionType =
        lower.includes("investigate") || lower.includes("unusual") || lower.includes("worried") || lower.includes("patterns")
          ? "INVESTIGATIVE_ANALYSIS"
          : "STRATEGIC_ASSESSMENT";
    } else if (mode === "Chat") {
      // Chat mode: conversational, philosophical, open-ended — always INVESTIGATIVE or STRATEGIC
      if (
        lower.includes("why was") || lower.includes("created") || lower.includes("amanah") ||
        lower.includes("mission") || lower.includes("explain") || lower.includes("what is") ||
        lower.includes("convince") || lower.includes("trustworthy") || lower.includes("philosophy")
      ) {
        decisionType = "INVESTIGATIVE_ANALYSIS";
      } else if (
        lower.includes("brainstorm") || lower.includes("strategy") || lower.includes("retention") ||
        lower.includes("should we") || lower.includes("approve") || lower.includes("ideas")
      ) {
        decisionType = "STRATEGIC_ASSESSMENT";
      } else if (lower.includes("good morning") || lower.includes("good afternoon") || lower.includes("good evening") || lower.includes("assalamu") || lower.includes("salam")) {
        decisionType = "EXECUTIVE_INTELLIGENCE";
      } else {
        decisionType = "INVESTIGATIVE_ANALYSIS";
      }
    } else if (mode === "Executive Reporting" || intent === "generateReport") {
      decisionType = "STRATEGIC_ASSESSMENT";
    } else if (mode === "Investigation" || hcieAnalysis.sentiment === "concern" || hcieAnalysis.sentiment === "frustration") {
      decisionType = "INVESTIGATIVE_ANALYSIS";
    } else if (mode === "Urgent Request") {
      decisionType = "OPERATIONAL_LOOKUP";
    } else if (intent === "communicationIntelligence") {
      decisionType = "DRAFTING_ACTION";
    } else if (intent === "allocateDonation" || intent === "publishUpdate" || intent === "generateCertificates") {
      decisionType = "WORKFLOW_EXECUTION";
    } else if (intent === "reviewCompliance" || intent === "complianceIntelligence") {
      decisionType = "COMPLIANCE_VERIFICATION";
    } else if (mode === "Executive Analysis") {
      decisionType = "STRATEGIC_ASSESSMENT";
    }

    // ─── Step 3: Determine Urgency ───────────────────────────────────────────
    let urgency: ObjectiveUrgency = "STANDARD";
    if (mode === "Urgent Request" || lower.includes("urgent") || lower.includes("asap") || lower.includes("immediately")) {
      urgency = "IMMEDIATE";
    } else if (decisionType === "EXECUTIVE_INTELLIGENCE") {
      urgency = "STANDARD";
    }

    // ─── Step 4: Determine if synthesis is required ──────────────────────────
    const requiresSynthesis =
      decisionType === "EXECUTIVE_INTELLIGENCE" ||
      decisionType === "STRATEGIC_ASSESSMENT" ||
      decisionType === "INVESTIGATIVE_ANALYSIS" ||
      decisionType === "DRAFTING_ACTION" ||
      mode === "Executive Analysis" ||
      mode === "Executive Reporting";

    // ─── Step 5: Construct True Objective narrative ──────────────────────────
    // This is what the administrator is REALLY trying to do — not just what they typed.
    let trueObjective: string;
    let operationalContext: string;
    let amanahDimension: string;

    switch (domain) {
      case "Donor":
        trueObjective = decisionType === "DRAFTING_ACTION"
          ? "Draft a communication that maintains the trust and relationship with a donor"
          : "Understand the current state of donor engagement to support stewardship decisions";
        operationalContext = "Donor relationships are a direct expression of trust (amanah). Every interaction must reinforce accountability and gratitude.";
        amanahDimension = "Donor Stewardship — ensuring those who give can trust that their contributions are handled with integrity";
        break;
      case "Finance":
        trueObjective = "Gain verified financial clarity to support sound stewardship of donated funds";
        operationalContext = "Every financial query reflects the administrator's responsibility to donors and beneficiaries.";
        amanahDimension = "Financial Integrity — every rupee is a trust from the donor and an obligation to the beneficiary";
        break;
      case "Project":
        trueObjective = "Understand the delivery status of Daarayn's charitable work to ensure funds reach beneficiaries";
        operationalContext = "Project intelligence directly measures mission impact. Administrators need this to make delivery decisions.";
        amanahDimension = "Mission Delivery — ensuring that charitable intentions translate into real-world impact";
        break;
      case "Compliance":
        trueObjective = "Verify organizational readiness and rule adherence to protect Daarayn's legal and ethical standing";
        operationalContext = "Compliance protects the organization's ability to serve long-term.";
        amanahDimension = "Institutional Integrity — upholding the regulatory and ethical standards that protect all stakeholders";
        break;
      case "Communication":
        trueObjective = "Draft or review a communication that upholds Daarayn's voice and strengthens relationships";
        operationalContext = "Communications are public-facing expressions of Daarayn's values and mission.";
        amanahDimension = "Transparency & Gratitude — communicating honestly and graciously with all stakeholders";
        break;
      case "Executive":
        trueObjective = "Obtain a synthesized organizational intelligence overview to support leadership decision-making";
        operationalContext = "Executive intelligence helps leadership understand the organization holistically so they can guide effectively.";
        amanahDimension = "Leadership Accountability — leaders need clear awareness to discharge their responsibilities faithfully";
        break;
      case "Volunteer":
        trueObjective = "Assess volunteer capacity and engagement to ensure operational readiness";
        operationalContext = "Volunteers are the lifeblood of on-the-ground delivery.";
        amanahDimension = "Human Capital Stewardship — honoring the time and effort of those who serve the mission";
        break;
      case "Governance":
        trueObjective = "Evaluate organizational governance and adherence to ethical mandates";
        operationalContext = "Governance queries relate directly to Daarayn's founding principles and board oversight.";
        amanahDimension = "Organizational Trust — preserving the highest standard of accountability in decision making";
        break;
      case "Campaign":
        trueObjective = "Review campaign performance and strategy for fundraising optimization";
        operationalContext = "Campaigns translate need into actionable support mechanisms.";
        amanahDimension = "Resource Mobilization — ensuring the organization has the means to fulfill its promises";
        break;
      default:
        trueObjective = "Obtain accurate information to fulfill an administrative responsibility";
        operationalContext = "This query supports the operational administration of Daarayn.";
        amanahDimension = "Organizational Responsibility — every administrative action supports the trust placed in Daarayn";
    }

    // ─── MCEP Evolution 9: Islamic Identity ──────────────────────────────────
    const isSessionStart = historyText.trim() === "";
    const isShortChat = mode === "Chat" && normalizedMessage.split(" ").length <= 4;
    const shouldIncludeIslamicGreeting = isSessionStart || isShortChat;

    // ─── MCEP Evolution 7: Conversation Purpose Recognition (CCF) ────────────
    let conversationPurpose: ConversationPurpose = "General Conversation";

    if (isShortChat || (isSessionStart && mode === "Chat")) {
      conversationPurpose = shouldIncludeIslamicGreeting ? "Islamic Greeting" : "Greeting";
    } else if (mode === "Executive Reporting" && urgency === "IMMEDIATE") {
      conversationPurpose = "Decision Support";
    } else if (mode === "Executive Reporting") {
      conversationPurpose = "Executive Briefing";
    } else if (mode === "Investigation" && intent === "administration") {
      conversationPurpose = "Root Cause Analysis";
    } else if (mode === "Investigation" || hcieAnalysis.sentiment === "concern" || hcieAnalysis.sentiment === "frustration") {
      conversationPurpose = "Investigation";
    } else if (intent === "executiveBriefing") {
      conversationPurpose = "Executive Briefing";
    } else if (mode === "Chat" && intent === "chat") {
      conversationPurpose = "Mission Discussion";
    } else if (mode === "Chat" && (
      lower.includes("brainstorm") || lower.includes("retention") || lower.includes("strategy") || lower.includes("ideas")
    )) {
      conversationPurpose = "Brainstorming";
    } else if (mode === "Chat" && (
      lower.includes("should we") || lower.includes("approve") || lower.includes("allocation")
    )) {
      conversationPurpose = "Decision Support";
    } else if (mode === "Chat") {
      conversationPurpose = "Mission Discussion";
    } else if (domain === "Donor") {
      conversationPurpose = "Donor Discussion";
    } else if (domain === "Finance") {
      conversationPurpose = "Financial Discussion";
    } else if (domain === "Project") {
      conversationPurpose = "Project Discussion";
    } else if (domain === "Compliance") {
      conversationPurpose = "Compliance Discussion";
    } else if (domain === "Executive") {
      conversationPurpose = "Strategic Advisory";
    } else if (decisionType === "DRAFTING_ACTION") {
      conversationPurpose = "Clarification"; 
    } else if (decisionType === "WORKFLOW_EXECUTION") {
      conversationPurpose = "Operational Review";
    }

    // ─── MCEP Evolution 2: Adaptive Strategy ────────
    let reasoningDepth: ReasoningDepth = "MODERATE";

    if (conversationPurpose === "Greeting" || conversationPurpose === "Islamic Greeting") {
        reasoningDepth = "MINIMAL";
    } else if (decisionType === "EXECUTIVE_INTELLIGENCE") {
        reasoningDepth = "DEEP";
    } else if (decisionType === "STRATEGIC_ASSESSMENT") {
        reasoningDepth = "MAXIMUM";
    } else if (decisionType === "INVESTIGATIVE_ANALYSIS") {
        reasoningDepth = "DEEP";
    } else if (decisionType === "WORKFLOW_EXECUTION") {
        reasoningDepth = "MAXIMUM";
    } else if (decisionType === "OPERATIONAL_LOOKUP") {
        reasoningDepth = "LIGHT";
    }

    // ─── MCEP Evolution 1: Meta Thinking (Challenging Assumptions) ───────────
    let metaThinkingChallenge = "Is the administrator's premise fully accurate, or is there a deeper underlying issue?";
    
    if (domain === "Donor" && hcieAnalysis.sentiment === "concern") {
        metaThinkingChallenge = "Is donor acquisition actually the problem, or could donor retention and stewardship be the root issue?";
    } else if (hcieAnalysis.sentiment === "frustration" || hcieAnalysis.sentiment === "concern") {
        metaThinkingChallenge = "What defines failure or a drop in this context? Is there verified evidence, or is there another seasonal/operational explanation?";
    } else if (domain === "Project" && decisionType === "INVESTIGATIVE_ANALYSIS") {
        metaThinkingChallenge = "Are we confusing operational delays with project failure? What does the execution timeline say?";
    } else if (decisionType === "WORKFLOW_EXECUTION") {
        metaThinkingChallenge = "Is this the correct workflow for their true objective, or are they asking for a workaround to an underlying process issue?";
    } else if (conversationPurpose === "Greeting" || conversationPurpose === "Islamic Greeting") {
        metaThinkingChallenge = "How can I set an executive and supportive tone for the remainder of this session?";
    } else if (domain === "System" || conversationPurpose === "Mission Discussion" || conversationPurpose === "General Conversation") {
        metaThinkingChallenge = "Deliver highly precise, accurate, and comprehensive intelligence to fully resolve the administrator's query.";
    }

    return {
      surfaceQuery: normalizedMessage,
      trueObjective,
      operationalContext,
      decisionType,
      urgency,
      missionRelevant: domain !== "System",
      amanahDimension,
      requiresSynthesis,
      domain,
      metaThinkingChallenge,
      reasoningDepth,
      conversationPurpose,
      shouldIncludeIslamicGreeting
    };
  }
}
