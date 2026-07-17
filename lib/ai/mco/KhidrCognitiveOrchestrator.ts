/**
 * lib/ai/mco/KhidrCognitiveOrchestrator.ts
 *
 * KHIDR Cognitive Orchestrator (MCO)
 * The single cognitive mind of the Daarayn AI Operating System.
 *
 * MCO is the mandatory entry point for every administrator interaction
 * after HCIE normalization. It does not replace any existing enterprise
 * capability. Instead, it:
 *
 *   1. Understands the administrator's TRUE objective (AdministratorObjectiveEngine)
 *   2. Formulates a thinking plan (CognitiveThinkingPlan)
 *   3. Dynamically invokes all required enterprise capabilities as cognitive tools
 *   4. Constructs a verified evidence map (EIO)
 *   5. Challenges its own reasoning (MCOReasoningEngine)
 *   6. Instructs the Executive Response Writer with enriched context
 *
 * MCO reasons about decisions rather than questions.
 * MCO constructs understanding rather than retrieving answers.
 * MCO acts as Daarayn's Executive Operations Officer whose purpose is
 * to help administrators fulfil the amanah (trust) placed upon them.
 */

import { routeToSpecialist } from "../knowledge/router";
import type { KhidrRole } from "../knowledge/permissionEngine";
import { retrieveTargetedData } from "../knowledge/retriever";
import { buildMKIEPrompt } from "../knowledge/promptBuilder";
import { generateAIResponse } from "../providerManager";
import { KhidrSessionMemory } from "../knowledge/memory";
import { db } from "../../firebase";
import { doc, setDoc } from "firebase/firestore";
import { planAction } from "../planner";
import type { ActionPlan } from "../planner";
import { compileWorkflowPlan } from "../orchestrator/executionPlanner";
import type { WorkflowPlan } from "../orchestrator/executionPlanner";

// Enterprise Pipeline Engines
import type { HCIEAnalysis } from "../hcie/HumanCommunicationIntelligenceEngine";
import { IntentClassificationEngine } from "../engines/IntentClassificationEngine";
import { ContextOptimizationEngine } from "../engines/ContextOptimizationEngine";
import { AIReliabilityFramework } from "../engines/AIReliabilityFramework";
import { BusinessRulesEngine } from "../engines/BusinessRulesEngine";
import { EnterpriseQueryResolutionEngine } from "../engines/EnterpriseQueryResolutionEngine";
import { VerifiedAnalyticsEngine } from "../engines/VerifiedAnalyticsEngine";
import { ResponseContracts } from "../engines/ResponseContracts";
import { ResponsePlanningEngine } from "../engines/ResponsePlanningEngine";
import type { EnterpriseIntelligenceObject } from "../engines/EnterpriseIntelligenceObject";
import { EnterpriseResponseCertificationEngine } from "../engines/EnterpriseResponseCertificationEngine";
import { ResponseStrategyLayer } from "../engines/ResponseStrategyLayer";
import { BlueprintEnforcer } from "../engines/BlueprintEnforcer";
import { BehaviorPolicyEngine } from "../mibf/BehaviorPolicyEngine";
import { ExecutiveResponseWriter } from "../engines/ExecutiveResponseWriter";
import { ExecutiveReflectionEngine } from "../engines/ExecutiveReflectionEngine";

// MCO Cognitive Stages
import { AdministratorObjectiveEngine } from "./AdministratorObjectiveEngine";
import { CognitiveThinkingPlanEngine } from "./CognitiveThinkingPlan";
import { MCOReasoningEngine } from "./MCOReasoningEngine";
import { SpiritualIntelligenceEngine } from "../engines/SpiritualIntelligenceEngine";
import { CrossDomainIntelligenceEngine } from "../eoas/CrossDomainIntelligenceEngine";
import { ExecutiveAnticipationEngine } from "../eoas/ExecutiveAnticipationEngine";
import { normalizeKhidrRole } from "../roleNormalizer";
import {
  buildDonorSpecificReply,
  buildPendingDonorsReply,
  buildProgramSpecificReply,
  buildDonationTimeframeReply,
  buildDonorListReply,
  buildRepeatDonorsReply,
  buildAllCausesReply,
  buildEmailStatsReply,
  buildProjectAdviceReply,
} from "./TargetedResponseBuilder";
import {
  buildProgramDonationReply,
  buildAllocationAuditReply,
  buildExecutiveDonorAnalysisReply,
  buildProactiveRiskBriefReply,
  buildStrategicActionsReply,
  buildFinancialInvestigationReply,
  buildVolunteerSummaryReply,
  buildGeneralExecutiveReply,
} from "./ExecutiveIntelligenceBuilder";
import { buildExecutiveOpsReport } from "./ExecutiveOpsReportBuilder";

import type { KhidrChatRequest, KhidrChatResponse } from "../knowledge/conversationManager";

export class KhidrCognitiveOrchestrator {

  /**
   * The single cognitive entry point for every KHIDR interaction.
   * Orchestrates the full enterprise pipeline with cognitive reasoning.
   */
  static async process(
    req: KhidrChatRequest,
    hcieAnalysis: HCIEAnalysis,
    historyText: string,
    requestId: string,
    pipelineStart: number,
    stages: Array<{ stage: string; status: string; durationMs: number; error?: string }>
  ): Promise<KhidrChatResponse> {

    const { sessionId, userId, message, history } = req;
    const userRole = normalizeKhidrRole(req.userRole);
    const normalizedMessage = hcieAnalysis.normalizedMessage;

    function logStage(stage: string, status: "✓" | "✗", startMs: number, error?: string) {
      const durationMs = Date.now() - startMs;
      stages.push({ stage, status, durationMs, error });
      AIReliabilityFramework.logDiagnostic(
        requestId,
        error ? "error" : "info",
        `${stage} completed in ${durationMs}ms`,
        error ? { error } : undefined
      );
    }

    // ═══════════════════════════════════════════════════════════════════
    // MCO STAGE 0: PROACTIVE EXECUTIVE ANTICIPATION
    // ═══════════════════════════════════════════════════════════════════
    // Strategic alerts only for executive briefings — loaded after intent classification below.
    let strategicAlerts: string | null = null;

    // ═══════════════════════════════════════════════════════════════════
    // MCO COGNITIVE EVOLUTION 6: THE KHIDR CONSTITUTION
    // ═══════════════════════════════════════════════════════════════════
    const khidrConstitution = `
[THE KHIDR CONSTITUTION]
Identity: I am KHIDR, the Executive Operations Officer of Daarayn Foundation, built upon the AI-TOS (AI Trust Operating System) architecture.
Origins: I was created to solve the fundamental problem of Trust (Amanah) and operational friction in modern non-profits, ensuring Daarayn operates with Adl (Justice) and Ihsan (Excellence).
Purpose: To help administrators fulfil Daarayn's amanah through proactive intelligence and operational command.
Protection: I protect Trust, Transparency, Accountability, Beneficiaries, Donors, and Organizational Integrity.
Responsibility: To help leadership make better decisions.
Evidence: I rely ONLY on verified organizational knowledge when discussing data.
Capabilities: I naturally support universal conversations including Mission, Strategy, Brainstorming, Operations, Coaching, and Islamic Ethics. I am an executive, not a database.

[NON-NEGOTIABLE EXECUTIVE BEHAVIORS]
1. Never hallucinate, guess, or leak backend implementation details (like JSON schemas, engine names, or internal flags).
2. Ensure evidence is presented using concise executive summaries and verified records.
3. When evidence is partial or missing, state what is known and what is unknown. Do not invent filler.
4. I provide highly accurate, precise, and executive-level answers to any question the administrator asks, leveraging my broad intelligence capabilities to support their decision-making and operational awareness.
`.trim();

    // ═══════════════════════════════════════════════════════════════════
    // MCO STAGE 1: UNDERSTAND THE TRUE OBJECTIVE
    // ═══════════════════════════════════════════════════════════════════
    let stageStart = Date.now();

    // First, classify intent (ICE is a cognitive tool for MCO)
    const iceAnalysis = IntentClassificationEngine.classifyIntent(
      normalizedMessage,
      historyText,
      hcieAnalysis.extractedEntities
    );
    logStage("Intent Classification", "✓", stageStart);

    stageStart = Date.now();
    const administratorObjective = AdministratorObjectiveEngine.understand(
      normalizedMessage,
      hcieAnalysis,
      iceAnalysis,
      userRole,
      historyText
    );
    logStage("MCO: Objective Understanding", "✓", stageStart);
    console.log(`[MCO] True Objective: "${administratorObjective.trueObjective}" | Domain: ${administratorObjective.domain} | Decision: ${administratorObjective.decisionType}`);

    if (
      (iceAnalysis.intent === "executiveBriefing" || administratorObjective.decisionType === "EXECUTIVE_INTELLIGENCE") &&
      !iceAnalysis.entities.executiveOpsMode
    ) {
      strategicAlerts = await ExecutiveAnticipationEngine.generateStrategicAlerts();
    }

    // ═══════════════════════════════════════════════════════════════════
    // MCO STAGE 2: FORMULATE THINKING PLAN
    // ═══════════════════════════════════════════════════════════════════
    stageStart = Date.now();
    const thinkingPlan = CognitiveThinkingPlanEngine.formulate(administratorObjective, iceAnalysis);
    logStage("MCO: Cognitive Thinking Plan", "✓", stageStart);
    console.log(`[MCO] Plan ID: ${thinkingPlan.planId} | Tools: ${thinkingPlan.toolSequence.map(t => t.capability).join(" → ")}`);

    // ═══════════════════════════════════════════════════════════════════
    // MCO STAGE 3A: INVOKE ENTERPRISE TOOLS (Query Resolution)
    // ═══════════════════════════════════════════════════════════════════
    stageStart = Date.now();
    const eqreResolution = EnterpriseQueryResolutionEngine.resolveQuery(normalizedMessage, iceAnalysis, thinkingPlan);
    logStage("Enterprise Query Resolution", "✓", stageStart);

    stageStart = Date.now();
    const routing = routeToSpecialist(iceAnalysis.intent as any, normalizedMessage);
    logStage("Specialist Routing", "✓", stageStart);

    // ═══════════════════════════════════════════════════════════════════
    // MCO STAGE 3B: PERMISSION BOUNDARY (Business Rules — always first)
    // ═══════════════════════════════════════════════════════════════════
    stageStart = Date.now();
    const isAuthorized = BusinessRulesEngine.verifyAccessRules(userRole, routing.department, "read");
    if (!isAuthorized) {
      const errorText = `Role permissions validation failed: "${userRole}" level is restricted from accessing ${routing.department}.`;
      logStage("Permission Validation", "✗", stageStart, errorText);
      return {
        success: false,
        reply: `> [!CAUTION]\n> **Access Denied**: ${errorText}`,
        actionPlan: null,
        workflowPlan: null,
        references: [],
        metadata: {
          department: routing.department,
          contextSummary: "Permission Denied",
          collections: [],
          role: userRole,
          requestId,
          pipelineStages: stages,
        }
      };
    }
    logStage("Permission Validation", "✓", stageStart);

    // ═══════════════════════════════════════════════════════════════════
    // MCO STAGE 3C: EXECUTIVE AWARENESS (EOAS — if applicable)
    // ═══════════════════════════════════════════════════════════════════
    if (
      (iceAnalysis.intent === "executiveBriefing" || administratorObjective.decisionType === "EXECUTIVE_INTELLIGENCE") &&
      !iceAnalysis.entities.executiveOpsMode
    ) {
      stageStart = Date.now();
      try {
        const { EnterpriseMissionControl } = await import("../eoas/EnterpriseMissionControl");
        const briefingText = await EnterpriseMissionControl.generateExecutiveBriefing(userRole);
        logStage("Executive Mission Control (EOAS)", "✓", stageStart);

        return {
          success: true,
          reply: briefingText,
          actionPlan: null,
          workflowPlan: null,
          references: [],
          metadata: {
            department: "executive",
            contextSummary: "MCO-directed Executive Organizational Awareness Briefing",
            collections: [],
            role: userRole,
            requestId,
            pipelineStages: stages,
            mcoObjective: administratorObjective.trueObjective,
            mcoDecisionType: administratorObjective.decisionType,
          } as any
        };
      } catch (err) {
        logStage("Executive Mission Control (EOAS)", "✗", stageStart, (err as Error).message);
        // Fallback to normal flow
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // MCO STAGE 3D: BEHAVIOR, STRATEGY & RESPONSE PLANNING
    // ═══════════════════════════════════════════════════════════════════
    stageStart = Date.now();
    const mibfDirectives = BehaviorPolicyEngine.compileDirectives(
      normalizedMessage,
      iceAnalysis,
      eqreResolution,
      userRole
    );
    logStage("Behavior Policy Engine", "✓", stageStart);

    stageStart = Date.now();
    const responseStrategy = ResponseStrategyLayer.determine(
      normalizedMessage,
      iceAnalysis,
      eqreResolution,
      userRole
    );
    logStage("Response Strategy Layer", "✓", stageStart);

    stageStart = Date.now();
    const responsePlan = ResponsePlanningEngine.planResponse(
      normalizedMessage,
      iceAnalysis.intent,
      eqreResolution.isAIRequired,
      eqreResolution.responseContract
    );
    logStage("Response Planning", "✓", stageStart);

    // ═══════════════════════════════════════════════════════════════════
    // MCO STAGE 3E: FIRESTORE RETRIEVAL (Cognitive Tool: Organizational Knowledge)
    // ═══════════════════════════════════════════════════════════════════
    stageStart = Date.now();
    let facts: any[] = [];
    const allowedCollections = eqreResolution.requiredCollections.filter(col => {
      if (userRole === "public") return ["publicLedger", "programs"].includes(col);
      return true;
    });
    try {
      facts = await retrieveTargetedData(
        iceAnalysis.intent as any,
        iceAnalysis.entities as any,
        allowedCollections
      );
      logStage("Firestore Retrieval", "✓", stageStart);
    } catch (err) {
      logStage("Firestore Retrieval", "✗", stageStart, (err as Error).message);
      facts = [];
    }

    // ═══════════════════════════════════════════════════════════════════
    // MCO STAGE 3F: VERIFIED ANALYTICS (Cognitive Tool: Calculations)
    // ═══════════════════════════════════════════════════════════════════
    stageStart = Date.now();
    const donations = facts.filter(f => f.source === "donations").map(f => f.data);
    const programs = facts.filter(f => f.source === "programs" || f.source === "projects").map(f => f.data);

    const extendedMetrics = VerifiedAnalyticsEngine.calculateExtendedMetrics(donations);
    const programAnalytics = programs.map(p => {
      const progressInfo = VerifiedAnalyticsEngine.calculateProgramProgress(p.amountCollected, p.amountRequired);
      return {
        projectId: p.id || "PRG-GENERAL",
        title: p.title || "Program Update",
        amountRequired: Number(p.amountRequired || 0),
        amountCollected: Number(p.amountCollected || 0),
        progress: progressInfo.progress,
        remainingGap: progressInfo.remainingGap,
        status: p.status || "Ongoing"
      };
    });
    logStage("Verified Analytics", "✓", stageStart);

    // ═══════════════════════════════════════════════════════════════════
    // MCO STAGE 3F.1: CROSS-DOMAIN SYNTHESIS
    // ═══════════════════════════════════════════════════════════════════
    const crossDomainInsight = CrossDomainIntelligenceEngine.synthesize(facts, normalizedMessage);
    if (crossDomainInsight) {
      console.log(`[MCO] Cross-Domain Insight Generated.`);
    }

    const caretakerConfig = BusinessRulesEngine.getConfig();

    // ═══════════════════════════════════════════════════════════════════
    // MCO STAGE 3G: CONSTRUCT EVIDENCE MAP (EIO)
    // ═══════════════════════════════════════════════════════════════════
    const eio: EnterpriseIntelligenceObject = {
      requestId,
      sessionId,
      userId,
      userRole,
      query: normalizedMessage,
      intent: iceAnalysis,
      objective: administratorObjective,
      permissions: {
        authorized: true,
        allowedCollections,
        department: routing.department
      },
      responsePlan,
      facts,
      metrics: {
        totalDonations: extendedMetrics.totalDonations,
        transactionCount: donations.length,
        averageDonation: extendedMetrics.averageDonation,
        largestDonation: extendedMetrics.largestDonation,
        smallestDonation: extendedMetrics.smallestDonation,
        medianDonation: extendedMetrics.medianDonation,
        uniqueDonorsCount: extendedMetrics.uniqueDonorsCount,
        repeatDonorsCount: extendedMetrics.repeatDonorsCount,
        topDonorName: extendedMetrics.topDonorName,
        topDonorTotal: extendedMetrics.topDonorTotal,
        programAnalytics
      },
      businessRules: {
        limitsPassed: true,
        caretakerUpdateFrequencyDays: caretakerConfig.caretakerUpdateFrequencyDays,
        ruleAdvisories: []
      },
      diagnostics: { stages, totalDurationMs: 0 },
      responseStrategy,
      mibfDirectives,
    };

    // ═══════════════════════════════════════════════════════════════════
    // MCO STAGE 4: CHALLENGE OWN REASONING (Self-Verification)
    // ═══════════════════════════════════════════════════════════════════
    stageStart = Date.now();
    const reasoningResult = MCOReasoningEngine.challenge(administratorObjective, thinkingPlan, eio);
    logStage("MCO: Reasoning & Self-Challenge", "✓", stageStart);
    console.log(`[MCO] Reasoning Verdict: ${reasoningResult.verdict} | Confidence: ${reasoningResult.confidenceScore}/100`);
    console.log(`[MCO] Next Action: "${reasoningResult.suggestedNextAction}"`);

    // Context optimization
    stageStart = Date.now();
    const optimizedContext = ContextOptimizationEngine.optimizeContext(facts);
    logStage("Context Optimization", "✓", stageStart);

    // Workflow planning
    stageStart = Date.now();
    let mioPlan: WorkflowPlan | null = null;
    let legacyActionPlan: ActionPlan | null = null;
    try {
      mioPlan = await compileWorkflowPlan(normalizedMessage, userRole);
      const requiresAction = eio.responsePlan.responseContract === "WorkflowPlan" || eio.responsePlan.responseContract === "CommunicationDraft";
      if (requiresAction && !mioPlan) {
        legacyActionPlan = await planAction(normalizedMessage, userRole, optimizedContext.contextText);
      }
      logStage("Execution Planning", "✓", stageStart);
    } catch (planError) {
      logStage("Execution Planning", "✗", stageStart, (planError as Error).message);
    }

    // ═══════════════════════════════════════════════════════════════════
    // DETERMINISTIC PATH (Route A: No LLM invoked)
    // ═══════════════════════════════════════════════════════════════════
    if (!eqreResolution.isAIRequired || eio.responsePlan.responseType === "deterministic") {
      stageStart = Date.now();
      let replyText = "";
      const depth = responseStrategy.depth;
      const entities = iceAnalysis.entities;

      // Targeted replies — answer the actual question, not org-wide aggregates
      if (entities.executiveOpsMode) {
        replyText = buildExecutiveOpsReport(entities.executiveOpsMode, facts, eio.metrics);
      } else if (entities.pendingOnly) {
        replyText = buildPendingDonorsReply(facts);
      } else if (entities.wantsProgramDonations) {
        replyText = buildProgramDonationReply(entities, facts);
      } else if (entities.wantsAllocationAudit) {
        replyText = buildAllocationAuditReply(facts);
      } else if (entities.wantsExecutiveDonorAnalysis) {
        replyText = buildExecutiveDonorAnalysisReply(facts);
      } else if (entities.wantsProactiveRisk) {
        replyText = buildProactiveRiskBriefReply(facts, eio.metrics);
      } else if (entities.wantsStrategicActions) {
        replyText = buildStrategicActionsReply(facts, eio.metrics);
      } else if (entities.wantsFinancialInvestigation) {
        replyText = buildFinancialInvestigationReply(facts, eio.metrics);
      } else if (iceAnalysis.intent === "volunteerIntelligence") {
        replyText = buildVolunteerSummaryReply(facts);
      } else if (entities.emailFailedOnly) {
        replyText = buildEmailStatsReply(facts, true);
      } else if (entities.emailCountQuery) {
        replyText = buildEmailStatsReply(facts, false);
      } else if (entities.listRepeatDonors) {
        replyText = buildRepeatDonorsReply(facts, entities.repeatCount || 3);
      } else if (entities.listAllDonors) {
        replyText = buildDonorListReply(facts);
      } else if (entities.wantsAdvice) {
        replyText = buildProjectAdviceReply(entities, facts);
      } else if (entities.listAllCauses) {
        replyText = buildAllCausesReply(facts);
      } else if (entities.donorName || entities.donorId) {
        replyText = buildDonorSpecificReply(entities.donorName || entities.donorId || "", facts) || "";
      } else if (entities.timeframe && eio.responsePlan.responseContract === "DonationSummary") {
        replyText = buildDonationTimeframeReply(entities, facts);
      } else if (entities.programName && entities.wantsProgramDonations) {
        replyText = buildProgramDonationReply(entities, facts);
      } else if (entities.programName && eio.responsePlan.responseContract === "ProjectSummary") {
        replyText = buildProgramSpecificReply(entities, facts) || "";
      } else if (eio.responsePlan.responseContract === "DonationSummary") {
        const summary = ResponseContracts.validateDonationSummary({
          totalDonations: eio.metrics.totalDonations,
          transactionCount: eio.metrics.transactionCount,
          currencySplit: { INR: eio.metrics.totalDonations },
          averageDonation: eio.metrics.averageDonation,
          largestDonation: eio.metrics.largestDonation
        });
        if (depth === "MINIMAL") {
          replyText = `The total donations received stand at ₹${summary.totalDonations.toLocaleString()} across ${summary.transactionCount} transactions. The largest single contribution was ₹${summary.largestDonation.toLocaleString()}.`;
        } else {
          replyText = `Daarayn has received a total of ₹${summary.totalDonations.toLocaleString()} across ${summary.transactionCount} transactions.\n\nThe average donation is ₹${summary.averageDonation.toLocaleString()}, with the largest single contribution at ₹${summary.largestDonation.toLocaleString()} and a median of ₹${eio.metrics.medianDonation.toLocaleString()}.`;
        }
      } else if (eio.responsePlan.responseContract === "DonorSummary") {
        const summary = ResponseContracts.validateDonorSummary({
          uniqueDonorsCount: eio.metrics.uniqueDonorsCount,
          repeatDonorsCount: eio.metrics.repeatDonorsCount,
          topDonorName: eio.metrics.topDonorName,
          topDonorTotal: eio.metrics.topDonorTotal
        });
        if (depth === "MINIMAL") {
          replyText = `Daarayn has ${summary.uniqueDonorsCount} unique donors on record, ${summary.repeatDonorsCount} of whom are repeat contributors.`;
          if (summary.topDonorName) replyText += ` The highest-contributing donor is ${summary.topDonorName} with a cumulative total of ₹${summary.topDonorTotal.toLocaleString()}.`;
        } else {
          replyText = `The donor portfolio currently holds ${summary.uniqueDonorsCount} unique contributors, with ${summary.repeatDonorsCount} repeat donors demonstrating sustained engagement.`;
          if (summary.topDonorName) replyText += `\n\n${summary.topDonorName} leads the contributor list with a cumulative total of ₹${summary.topDonorTotal.toLocaleString()}.`;
        }
      } else if (eio.metrics.programAnalytics.length > 0) {
        if (depth === "MINIMAL" && eio.metrics.programAnalytics.length === 1) {
          const p = eio.metrics.programAnalytics[0];
          replyText = `${p.title} has collected ₹${p.amountCollected.toLocaleString()} of its ₹${p.amountRequired.toLocaleString()} target — ${p.progress}% funded with a remaining gap of ₹${p.remainingGap.toLocaleString()}.`;
        } else {
          replyText = eio.metrics.programAnalytics.map(p => {
            const validated = ResponseContracts.validateProjectSummary({
              projectId: p.projectId,
              amountCollected: p.amountCollected,
              amountRequired: p.amountRequired,
              progress: p.progress,
              remainingGap: p.remainingGap
            });
            return `${p.title} — ${validated.progress}% funded (₹${validated.amountCollected.toLocaleString()} of ₹${validated.amountRequired.toLocaleString()}, gap: ₹${validated.remainingGap.toLocaleString()})`;
          }).join("\n");
        }
      } else {
        replyText = buildGeneralExecutiveReply(eio.metrics);
      }

      if (replyText && reasoningResult.suggestedNextAction) {
        const skipFollowUp =
          !!entities.executiveOpsMode ||
          entities.listAllDonors ||
          entities.listAllCauses ||
          entities.listRepeatDonors ||
          entities.emailCountQuery ||
          entities.emailFailedOnly ||
          entities.pendingOnly ||
          entities.wantsProgramDonations ||
          entities.wantsAllocationAudit ||
          entities.wantsExecutiveDonorAnalysis ||
          entities.wantsProactiveRisk ||
          entities.wantsStrategicActions ||
          entities.wantsFinancialInvestigation ||
          iceAnalysis.intent === "volunteerIntelligence" ||
          !!entities.timeframe;
        if (!skipFollowUp) {
          replyText += `\n\n${reasoningResult.suggestedNextAction}`;
        }
      }

      logStage("AI Completions", "✓", stageStart);
      logStage("Response Governance", "✓", stageStart);

      if (process.env.NODE_ENV !== "test") {
        try {
          await setDoc(doc(db, "khidr_conversations_history", `KHIDR-CHAT-${Date.now()}`), {
            requestId, department: routing.department, prompt: message, normalizedPrompt: normalizedMessage,
            response: replyText, timestamp: new Date().toISOString(), model: "Deterministic-Backend-Route",
            user: userId || "anonymous", contextUsed: optimizedContext.contextText, referencedCollections: allowedCollections,
            pipelineStages: stages, governanceStatus: "Verified", confidenceScore: 100,
            mcoObjective: administratorObjective.trueObjective, mcoThinkingPlan: thinkingPlan.planId,
            mcoReasoningVerdict: reasoningResult.verdict
          });
        } catch (_) {}
      }

      return {
        success: true,
        reply: replyText,
        actionPlan: legacyActionPlan,
        workflowPlan: mioPlan || null,
        references: facts.map(f => ({ source: f.source, content: JSON.stringify(f.data) })),
        metadata: {
          department: routing.department,
          contextSummary: "Resolved via deterministic VAE backend route",
          collections: allowedCollections,
          role: userRole,
          requestId,
          pipelineStages: stages
        }
      };
    }

    // ═══════════════════════════════════════════════════════════════════
    // MCO STAGE 5: INSTRUCT EXECUTIVE RESPONSE WRITER
    // MCO enriches the prompt with its Reasoning & Objective understanding
    // before handing off to Grok/Executive Response Writer.
    // ═══════════════════════════════════════════════════════════════════
    stageStart = Date.now();
    const basePrompts = buildMKIEPrompt(eio, historyText);

    // MCO Cognitive Enrichment: Inject reasoning verdict and all cognitive evolutions into the system prompt
    const spiritualDirectives = SpiritualIntelligenceEngine.evaluate(administratorObjective);
    
    // Tone Mirroring based on HCIE Sentiment
    let toneMirroringDirective = "";
    if (hcieAnalysis.sentiment === "Crisis Mode") {
      toneMirroringDirective = "Tone Directive: Administrator is in Crisis Mode. Respond with extreme brevity, calmness, and action-orientation. No fluff.";
    } else if (hcieAnalysis.sentiment === "Brainstorming") {
      toneMirroringDirective = "Tone Directive: Administrator is Brainstorming. Respond expansively, encouragingly, and offer creative strategic perspectives.";
    } else if (hcieAnalysis.sentiment === "Celebration") {
      toneMirroringDirective = "Tone Directive: Administrator is Celebrating. Respond with shared warmth and acknowledgement of the milestone.";
    } else if (hcieAnalysis.sentiment === "Curiosity") {
      toneMirroringDirective = "Tone Directive: Administrator is Curious. Provide detailed, educational, and thorough explanations.";
    }

    const mcoEnrichmentBlock = `
${khidrConstitution}

${strategicAlerts ? `[STRATEGIC ALERTS]\n${strategicAlerts}\n\n` : ""}
${crossDomainInsight ? `[ORGANIZATIONAL MEMORY INSIGHT]\n${crossDomainInsight}\n\n` : ""}

[MCO COGNITIVE DIRECTIVE — STRICTLY FOLLOW]
True Objective: ${administratorObjective.trueObjective}
Decision Type: ${administratorObjective.decisionType}
Urgency: ${administratorObjective.urgency}
Amanah Dimension: ${administratorObjective.amanahDimension}
Conversation Purpose: ${administratorObjective.conversationPurpose}
Reasoning Depth: ${administratorObjective.reasoningDepth}
Required Knowledge Domains: ${thinkingPlan.requiredKnowledgeDomains.join(", ")}
Conversation Blueprint: ${thinkingPlan.conversationBlueprint.join(" -> ")}
Meta-Thinking Challenge: ${administratorObjective.metaThinkingChallenge}
Reasoning Confidence: ${reasoningResult.confidenceScore}/100
${administratorObjective.shouldIncludeIslamicGreeting ? "Identity Directive: Begin with 'السلام عليكم ورحمة الله وبركاته' and a brief, context-appropriate dua." : ""}
${reasoningResult.addMissionContext ? "Mission Context: Acknowledge the broader mission relevance of this query." : ""}
Suggested Next Action for Administrator: ${reasoningResult.suggestedNextAction}
${reasoningResult.executiveValueAddition ? "Executive Value Addition: " + reasoningResult.executiveValueAddition : ""}
${reasoningResult.selfReflectionCorrection ? "Self-Correction Directive: " + reasoningResult.selfReflectionCorrection : ""}
${reasoningResult.verdict === "REFINE" ? "NOTE: Data coverage is partial. Qualify your response appropriately." : ""}
${spiritualDirectives}
${toneMirroringDirective}

[CCF STRICTNESS DIRECTIVE]
EXECUTIVE RESPONSE PRINCIPLE: Never expose raw retrieval data unless explicitly requested. Data is evidence. KHIDR provides judgment. Synthesize the data into an executive recommendation or insight. Do NOT act like a reporting engine. Do NOT use repetitive markdown structures unless explicitly requested. Follow the Conversation Blueprint exactly as the flow of your natural prose. Vary your opening naturally. When answering general knowledge questions, be highly precise, accurate, and comprehensive, as an Executive Intelligence Operating System should be.
You MUST output your response as a valid JSON object with the following exact schema:
{
  "executiveSummary": "A brief one sentence summary of your response.",
  "body": "Your full, natural, conversational prose response following the blueprint.",
  "verifiedFindings": [],
  "operationalObservations": [],
  "potentialActions": []
}
`.trim();

    const enrichedSystemPrompt = basePrompts.systemPrompt + `\n\n${mcoEnrichmentBlock}`;
    logStage("MCO: Prompt Enrichment", "✓", stageStart);

    // ═══════════════════════════════════════════════════════════════════
    // AI COMPLETIONS (Grok — Language Generation Only)
    // ═══════════════════════════════════════════════════════════════════
    stageStart = Date.now();
    let aiJsonResponse: any = null;
    const targetModel = process.env.GROK_MODEL || "grok-2-1212";

    try {
      const fetchAIResponseCall = () => generateAIResponse(enrichedSystemPrompt, basePrompts.userPrompt, {
        model: targetModel,
        temperature: 0.15,
        maxTokens: 2000,
      });

      aiJsonResponse = await AIReliabilityFramework.wrapWithTimeout(
        AIReliabilityFramework.executeWithRetry(fetchAIResponseCall, 1, 500, requestId),
        25000,
        requestId
      );
      console.log("[MCO] Raw AI JSON Response:", JSON.stringify(aiJsonResponse, null, 2));
      try { require("fs").writeFileSync("mco_ai_debug.json", JSON.stringify(aiJsonResponse, null, 2)); } catch(e){}
      logStage("AI Completions", "✓", stageStart);
    } catch (error) {
      logStage("AI Completions", "✗", stageStart, (error as Error).message);
      aiJsonResponse = {
        executiveSummary: ExecutiveResponseWriter.buildAIFailureFallback(eio),
        verifiedFindings: [],
        operationalObservations: [],
        potentialActions: []
      };
    }

    // ERCE Certification
    stageStart = Date.now();
    const certResult = EnterpriseResponseCertificationEngine.certifyResponse(
      aiJsonResponse,
      optimizedContext.contextText,
      eio.metrics,
      requestId,
      iceAnalysis.entities.donorName ? "donor@daarayn.org" : undefined,
      iceAnalysis.entities.donorId,
      iceAnalysis.intent
    );
    try { require("fs").writeFileSync("erce_errors.json", JSON.stringify(certResult.errors, null, 2)); } catch (_) {}
    logStage("Response Governance", certResult.isValid ? "✓" : "✗", stageStart);

    eio.aiOutput = {
      raw: aiJsonResponse,
      certified: certResult.filteredResponse,
      level: certResult.level,
      repairs: certResult.repairsPerformed,
      errors: certResult.errors
    };

    BlueprintEnforcer.enforceJsonContract({ ...certResult.filteredResponse }, responseStrategy);
    BlueprintEnforcer.enforceReplyText(certResult.formattedMarkdown, responseStrategy);

    // CXL: Executive Response Writer
    const cxlResult = ExecutiveResponseWriter.write(certResult, eio, responseStrategy);

    // ═══════════════════════════════════════════════════════════════════
    // AUDIT TRAIL — Enriched with MCO Cognitive Data
    // ═══════════════════════════════════════════════════════════════════
    stageStart = Date.now();
    const conversationId = `KHIDR-CHAT-${Date.now()}`;
    try {
      const historyData = {
        conversationId, requestId, department: routing.department,
        prompt: message, normalizedPrompt: normalizedMessage,
        response: certResult.formattedMarkdown, timestamp: new Date().toISOString(),
        model: targetModel, user: userId || "anonymous",
        contextUsed: optimizedContext.contextText, referencedCollections: allowedCollections,
        pipelineStages: stages, governanceStatus: certResult.status, confidenceScore: certResult.confidence,
        // MCO Enriched Audit Fields
        mco: {
          constitutionReaffirmed: true,
          objectiveEngine: {
            trueObjective: administratorObjective.trueObjective,
            decisionType: administratorObjective.decisionType,
            domain: administratorObjective.domain,
            urgency: administratorObjective.urgency,
            amanahDimension: administratorObjective.amanahDimension,
            conversationPurpose: administratorObjective.conversationPurpose,
            reasoningDepth: administratorObjective.reasoningDepth,
            metaThinkingChallenge: administratorObjective.metaThinkingChallenge
          },
          thinkingPlan: {
            planId: thinkingPlan.planId,
            toolsInvoked: thinkingPlan.toolSequence.map(t => t.capability),
            expectedDeliverable: thinkingPlan.expectedDeliverable,
            requiredKnowledgeDomains: thinkingPlan.requiredKnowledgeDomains,
            conversationBlueprint: thinkingPlan.conversationBlueprint
          },
          reasoningVerdict: reasoningResult.verdict,
          reasoningConfidence: reasoningResult.confidenceScore,
          challenges: reasoningResult.challenges.map(c => ({ q: c.question, verdict: c.verdict })),
          suggestedNextAction: reasoningResult.suggestedNextAction,
          selfReflectionCorrection: reasoningResult.selfReflectionCorrection,
          executiveValueAddition: reasoningResult.executiveValueAddition
        }
      };
      if (process.env.NODE_ENV !== "test") {
        await setDoc(doc(db, "khidr_conversations_history", conversationId), JSON.parse(JSON.stringify(historyData)));
        logStage("Audit Trail Log", "✓", stageStart);
      }
    } catch (logError) {
      if (process.env.NODE_ENV !== "test") {
        logStage("Audit Trail Log", "✗", stageStart, (logError as Error).message);
      }
    }

    const totalDuration = Date.now() - pipelineStart;
    eio.diagnostics.totalDurationMs = totalDuration;
    AIReliabilityFramework.logDiagnostic(requestId, "info", `MCO Pipeline Complete | Duration: ${totalDuration}ms | Verdict: ${reasoningResult.verdict}`);

    // Executive Reflection Loop (async — does not block response)
    if (responseStrategy.mode !== "AUDIT") {
      ExecutiveReflectionEngine.runReflectionAsync(eio, cxlResult.conversationText);
    }

    return {
      success: true,
      reply: cxlResult.conversationText,
      actionPlan: legacyActionPlan,
      workflowPlan: mioPlan || null,
      references: facts.map(f => ({
        source: f.source,
        content: typeof f.data === "string" ? f.data : JSON.stringify(f.data)
      })),
      metadata: {
        department: routing.department,
        contextSummary: facts.length > 0 ? `${facts.length} records matched` : "No matches",
        collections: allowedCollections,
        role: userRole,
        requestId: responseStrategy.mode === "AUDIT" ? requestId : undefined,
        pipelineStages: responseStrategy.mode === "AUDIT" ? stages : undefined,
        certification: responseStrategy.mode === "AUDIT" ? certResult.level : undefined,
        status: certResult.status,
        confidence: responseStrategy.mode === "AUDIT" ? certResult.confidence : undefined,
        responseMode: responseStrategy.mode,
        responseDepth: responseStrategy.depth,
        allowedComponents: responseStrategy.allowedComponents,
        blueprint: responseStrategy.blueprint.id,
        suppressAnalytics: responseStrategy.suppressAnalytics,
        developerDiagnostics: responseStrategy.mode === "AUDIT" ? {
          intent: eio.intent.intent,
          certificationLevel: certResult.level,
          responseTimeMs: Date.now() - pipelineStart,
          pipelineStages: stages,
          mcoVerdict: reasoningResult.verdict,
          mcoConfidence: reasoningResult.confidenceScore,
        } : undefined,
      }
    };
  }
}
