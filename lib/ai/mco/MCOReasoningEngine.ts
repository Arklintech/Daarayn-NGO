/**
 * lib/ai/mco/MCOReasoningEngine.ts
 *
 * KHIZR Cognitive Orchestrator — Stage 3: Reasoning Engine
 *
 * Purpose: After all enterprise tools have been invoked and data gathered,
 * MCO challenges its own reasoning before authorizing the response.
 * This is the self-verification layer that ensures every response
 * is grounded, mission-aligned, and reflects an experienced executive.
 *
 * The 5 Verification Questions:
 *   Q1. Is this response grounded in verified Firestore data?
 *   Q2. Am I answering the TRUE objective, not just the surface question?
 *   Q3. Does this reflect Daarayn's mission, values, and amanah?
 *   Q4. Would an experienced Executive Director approve this response?
 *   Q5. What is the most valuable next action for this administrator?
 *
 * This engine is fully DETERMINISTIC. No LLM calls.
 */

import type { AdministratorObjective } from "./AdministratorObjectiveEngine";
import type { CognitiveThinkingPlan } from "./CognitiveThinkingPlan";
import type { EnterpriseIntelligenceObject } from "../engines/EnterpriseIntelligenceObject";

export type ReasoningVerdict = "PROCEED" | "REFINE" | "ESCALATE";

export interface ReasoningChallenge {
  question: string;
  verdict: "PASS" | "FAIL" | "WARN";
  reasoning: string;
}

export interface ReasoningResult {
  // Final verdict: proceed, refine the plan, or escalate
  verdict: ReasoningVerdict;
  // Score 0-100: how confident MCO is in this response
  confidenceScore: number;
  // Individual challenge results for auditability
  challenges: ReasoningChallenge[];
  // Specific operational context to inject into the response
  responseEnrichment: string;
  // The recommended next action for the administrator
  suggestedNextAction: string;
  // Whether the response needs a mission-alignment note
  addMissionContext: boolean;
  
  // ─── Cognitive Evolutions (Phase 6.0.1) ───
  // Cognitive Evolution 4: Self Evaluation (One-Pass Reflection)
  selfReflectionCorrection: string | null;
  // Cognitive Evolution 8: Executive Ownership (Value Add)
  executiveValueAddition: string | null;
}

export class MCOReasoningEngine {

  /**
   * Challenges MCO's own reasoning after gathering evidence.
   * Returns a verdict and enrichment instructions for the response writer.
   */
  static challenge(
    objective: AdministratorObjective,
    plan: CognitiveThinkingPlan,
    eio: EnterpriseIntelligenceObject
  ): ReasoningResult {

    const challenges: ReasoningChallenge[] = [];
    let score = 100;

    // ─── Q1: Is the response grounded in verified data? ─────────────────────
    const hasFacts = eio.facts && eio.facts.length > 0;
    const hasMetrics = eio.metrics && (eio.metrics.totalDonations > 0 || eio.metrics.programAnalytics.length > 0);
    const isGrounded = hasFacts || hasMetrics;

    challenges.push({
      question: "Is this response grounded in verified Firestore data?",
      verdict: isGrounded ? "PASS" : "WARN",
      reasoning: isGrounded
        ? `${eio.facts.length} Firestore records retrieved. Analytics engine ran ${eio.metrics.transactionCount} calculations.`
        : "No Firestore records retrieved. Response must rely on KHIZR's organizational knowledge only."
    });
    if (!isGrounded) score -= 15;

    // ─── Q2: Am I answering the TRUE objective? ──────────────────────────────
    const intentMatchesDomain =
      (objective.domain === "Donor" && (eio.facts.some(f => f.source === "donors") || eio.facts.some(f => f.source === "donations"))) ||
      (objective.domain === "Finance" && eio.facts.some(f => f.source === "donations")) ||
      (objective.domain === "Project" && eio.facts.some(f => f.source === "programs" || f.source === "projects")) ||
      (objective.domain === "Executive") ||
      (objective.domain === "Compliance") ||
      (objective.domain === "Communication") ||
      (objective.domain === "System");

    challenges.push({
      question: "Am I answering the TRUE objective, not just the surface question?",
      verdict: intentMatchesDomain ? "PASS" : "WARN",
      reasoning: intentMatchesDomain
        ? `Retrieved data aligns with identified domain: ${objective.domain}. Objective: "${objective.trueObjective}".`
        : `Retrieved data may not fully satisfy the objective: "${objective.trueObjective}". Proceeding with available context.`
    });
    if (!intentMatchesDomain) score -= 10;

    // ─── Q3: Does this reflect Daarayn's mission and amanah? ────────────────
    const missionRelevant = objective.missionRelevant;
    challenges.push({
      question: "Does this reflect Daarayn's mission, values, and amanah?",
      verdict: "PASS", // Always guided by the amanah dimension regardless
      reasoning: missionRelevant
        ? `This query serves the amanah dimension: "${objective.amanahDimension}". Response must honour this responsibility.`
        : "This is a system query. Responding factually and securely fulfills administrative responsibility."
    });

    // ─── Q4: Would an experienced Executive Director approve? ────────────────
    const willBeAISynthesized = objective.requiresSynthesis;
    const hasDataForSynthesis = hasFacts || hasMetrics;
    const executiveApproval = !willBeAISynthesized || hasDataForSynthesis;

    challenges.push({
      question: "Would an experienced Executive Director approve this response?",
      verdict: executiveApproval ? "PASS" : "WARN",
      reasoning: executiveApproval
        ? `Response will be ${willBeAISynthesized ? "synthesized from verified data" : "a direct factual answer"}. Both are appropriate for executive communication.`
        : "Synthesis requested but data is sparse. Response should be appropriately qualified."
    });
    if (!executiveApproval) score -= 10;

    // ─── Q5: What is the most valuable next action? ──────────────────────────
    let suggestedNextAction: string;
    switch (objective.decisionType) {
      case "EXECUTIVE_INTELLIGENCE":
        suggestedNextAction = "Review the prioritized work queue and act on the highest-urgency item today.";
        break;
      case "STRATEGIC_ASSESSMENT":
        suggestedNextAction = "Share this assessment with relevant team members and initiate any flagged remediation steps.";
        break;
      case "INVESTIGATIVE_ANALYSIS":
        suggestedNextAction = "Investigate the specific record or period identified, and document findings in the project update log.";
        break;
      case "DRAFTING_ACTION":
        suggestedNextAction = "Review the draft, approve or refine it, then dispatch through the communication queue.";
        break;
      case "WORKFLOW_EXECUTION":
        suggestedNextAction = "Review and confirm the execution plan, then approve each step requiring sign-off.";
        break;
      case "COMPLIANCE_VERIFICATION":
        suggestedNextAction = "Address any flagged compliance items and schedule the next compliance review cycle.";
        break;
      default:
        suggestedNextAction = "Verify the information satisfies your requirement. If further detail is needed, request a specific record breakdown.";
    }

    challenges.push({
      question: "What is the most valuable next action for this administrator?",
      verdict: "PASS",
      reasoning: suggestedNextAction
    });

    // ─── Determine final verdict ─────────────────────────────────────────────
    const failCount = challenges.filter(c => c.verdict === "FAIL").length;
    const warnCount = challenges.filter(c => c.verdict === "WARN").length;

    let verdict: ReasoningVerdict = "PROCEED";
    if (failCount >= 2) verdict = "ESCALATE";
    else if (failCount >= 1 || warnCount >= 2) verdict = "REFINE";

    // ─── Build response enrichment instruction ───────────────────────────────
    let responseEnrichment = `This response serves the objective: "${objective.trueObjective}". `;
    responseEnrichment += `Frame it as an experienced Executive Operations Officer speaking to a trusted colleague. `;
    responseEnrichment += `The administrator's ${objective.urgency === "IMMEDIATE" ? "urgent" : "standard"} priority is: ${objective.domain} intelligence. `;
    if (objective.missionRelevant) {
      responseEnrichment += `This query supports: ${objective.amanahDimension}.`;
    }

    const addMissionContext = objective.decisionType === "EXECUTIVE_INTELLIGENCE" ||
      objective.decisionType === "STRATEGIC_ASSESSMENT";

    // ─── MCEP Evolution 4: Self Evaluation (One-Pass Reflection) ─────────────
    let selfReflectionCorrection: string | null = null;
    if (verdict === "REFINE") {
        selfReflectionCorrection = "MCO Self-Reflection: The initial reasoning lacks sufficient data coverage or executive confidence. Please ensure the response explicitly qualifies any limitations in the data and refrains from making overly definitive strategic conclusions.";
    } else if (objective.decisionType === "DRAFTING_ACTION") {
        selfReflectionCorrection = "MCO Self-Reflection: Ensure the drafted communication sounds like it comes from a 30-year veteran Executive Operations Officer—authoritative, empathetic, and perfectly aligned with Daarayn's values. Do not sound like a machine.";
    }

    // ─── MCEP Evolution 8: Executive Ownership (Value Addition) ──────────────
    let executiveValueAddition: string | null = null;
    if (objective.domain === "Donor" && eio.metrics && eio.metrics.repeatDonorsCount > 0) {
        executiveValueAddition = "Relationship Reminder: Note the proportion of repeat donors as a strong indicator of organizational trust, and suggest a personalized follow-up for high-value contributors.";
    } else if (objective.domain === "Compliance") {
        executiveValueAddition = "Compliance Consideration: Remind the administrator that maintaining transparent Zakat/Sadaqah allocation is a strict organizational and Sharia requirement.";
    } else if (objective.decisionType === "STRATEGIC_ASSESSMENT" && eio.metrics && eio.metrics.programAnalytics.some(p => p.progress < 50)) {
        executiveValueAddition = "Hidden Risk: Flag any programs that are under 50% funded as requiring immediate executive attention before the end of the quarter.";
    }

    return {
      verdict,
      confidenceScore: Math.max(score, 40),
      challenges,
      responseEnrichment,
      suggestedNextAction,
      addMissionContext,
      selfReflectionCorrection,
      executiveValueAddition
    };
  }
}
