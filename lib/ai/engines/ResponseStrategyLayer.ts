/**
 * lib/ai/engines/ResponseStrategyLayer.ts
 *
 * Response Strategy Layer (RSL) for MOMIN AI-TOS.
 * Inserted between Permission Validation and Verified Retrieval.
 *
 * Purpose: Deterministically decide HOW MOMIN responds BEFORE any prompt
 * is constructed or any LLM token is spent.
 *
 * This layer is the single authority for:
 *   - User Objective classification
 *   - Response Mode selection
 *   - Response Depth determination
 *   - Allowed component list
 *   - Hidden component enforcement
 *   - Blueprint assignment
 *
 * Architecture Guarantee: This layer inserts cleanly between the EQRE and
 * the existing retriever without modifying any surrounding engine.
 */

import type { SystemIntent } from "./IntentClassificationEngine";
import type { ICEAnalysis } from "./IntentClassificationEngine";
import type { EQREResolution } from "./EnterpriseQueryResolutionEngine";
import type { MominRole } from "../knowledge/permissionEngine";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The six deterministic response modes.
 * Each mode controls prompt tone, structure, and allowed components.
 */
export type ResponseMode =
  | "INFORMATION"     // Concise factual answer. No extra modules.
  | "ANALYSIS"        // Trends, KPIs, comparisons. Charts and tables allowed.
  | "EXECUTIVE"       // Leadership briefing. Summary-first, evidence optional.
  | "CREATION"        // Email, draft, acknowledgement, report generation.
  | "WORKFLOW"        // Execute or guide an operational task with steps.
  | "AUDIT"           // ERCE, Mission Control, diagnostics. Role-gated.
  | "CHAT";           // Conversational AI mode.

/**
 * Response depth controls verbosity and section count.
 */
export type ResponseDepth = "MINIMAL" | "STANDARD" | "DETAILED" | "EXECUTIVE" | "DEVELOPER";

/**
 * User's underlying operational objective — semantic, not syntactic.
 */
export type UserObjective =
  | "Information"
  | "Verification"
  | "Search"
  | "Comparison"
  | "Analytics"
  | "Reporting"
  | "DraftGeneration"
  | "DecisionSupport"
  | "WorkflowExecution"
  | "Approval"
  | "ExecutiveBriefing"
  | "Chat"
  | "CompliancePushback";

/**
 * A Blueprint defines the exact response structure for a use case.
 * It controls section order, which are primary vs optional, and what is hidden.
 */
export interface ResponseBlueprint {
  id: string;
  label: string;
  primarySections: string[];      // Always rendered
  optionalSections: string[];     // Expandable — user-initiated
  hiddenSections: string[];       // Never rendered (dev/audit gated)
  allowCharts: boolean;
  allowTables: boolean;
  allowTimeline: boolean;
  allowMissionControl: boolean;
  allowExecutionDetails: boolean;
  allowRecommendations: boolean;
}

/**
 * The complete strategy decision output from the RSL.
 * This object is attached to the EIO and consumed by the Prompt Builder.
 */
export interface ResponseStrategy {
  objective: UserObjective;
  mode: ResponseMode;
  depth: ResponseDepth;
  blueprint: ResponseBlueprint;
  allowedComponents: string[];
  hiddenComponents: string[];
  promptToneDirective: string;
  promptStructureDirective: string;
  // If true, the AI should NOT produce analytics unless explicitly stated
  suppressAnalytics: boolean;
  // If true, the AI should NOT produce recommendations unless governance cleared them
  suppressRecommendations: boolean;
  // If true, the AI should NOT render enterprise dashboards or status panels
  suppressDashboards: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// BLUEPRINTS REGISTRY
// ─────────────────────────────────────────────────────────────────────────────

const BLUEPRINTS: Record<string, ResponseBlueprint> = {

  DonationSummary: {
    id: "DonationSummary",
    label: "Donation Summary",
    primarySections: ["naturalAnswer"],
    optionalSections: ["analytics", "evidence", "actions"],
    hiddenSections: ["erceMetadata", "executionTrace", "promptMetadata", "developerDiagnostics"],
    allowCharts: false,
    allowTables: false,
    allowTimeline: false,
    allowMissionControl: false,
    allowExecutionDetails: false,
    allowRecommendations: false,
  },

  DonorSearch: {
    id: "DonorSearch",
    label: "Donor Search",
    primarySections: ["naturalAnswer", "donorProfile"],
    optionalSections: ["donationHistory", "evidence"],
    hiddenSections: ["erceMetadata", "executionTrace", "promptMetadata", "developerDiagnostics"],
    allowCharts: false,
    allowTables: true,
    allowTimeline: false,
    allowMissionControl: false,
    allowExecutionDetails: false,
    allowRecommendations: false,
  },

  DraftGeneration: {
    id: "DraftGeneration",
    label: "Draft Generation",
    primarySections: ["generatedDraft"],
    optionalSections: ["revisionActions", "complianceCheck"],
    hiddenSections: ["erceMetadata", "executionTrace", "promptMetadata", "developerDiagnostics"],
    allowCharts: false,
    allowTables: false,
    allowTimeline: false,
    allowMissionControl: false,
    allowExecutionDetails: false,
    allowRecommendations: false,
  },

  Analytics: {
    id: "Analytics",
    label: "Analytics",
    primarySections: ["executiveSummary", "keyMetrics"],
    optionalSections: ["charts", "kpis", "export"],
    hiddenSections: ["erceMetadata", "executionTrace", "promptMetadata", "developerDiagnostics"],
    allowCharts: true,
    allowTables: true,
    allowTimeline: false,
    allowMissionControl: false,
    allowExecutionDetails: false,
    allowRecommendations: true,
  },

  ReportGeneration: {
    id: "ReportGeneration",
    label: "Report Generation",
    primarySections: ["reportSummary"],
    optionalSections: ["preview", "download", "approval"],
    hiddenSections: ["erceMetadata", "executionTrace", "promptMetadata", "developerDiagnostics"],
    allowCharts: true,
    allowTables: true,
    allowTimeline: true,
    allowMissionControl: false,
    allowExecutionDetails: false,
    allowRecommendations: true,
  },

  WorkflowExecution: {
    id: "WorkflowExecution",
    label: "Workflow Execution",
    primarySections: ["naturalAnswer", "workflowSteps"],
    optionalSections: ["executionDetails", "missionControl", "evidence"],
    hiddenSections: ["erceMetadata", "promptMetadata", "developerDiagnostics"],
    allowCharts: false,
    allowTables: false,
    allowTimeline: true,
    allowMissionControl: true,
    allowExecutionDetails: true,
    allowRecommendations: false,
  },

  ExecutiveBriefing: {
    id: "ExecutiveBriefing",
    label: "Executive Briefing",
    primarySections: ["executiveSummary"],
    optionalSections: ["analytics", "evidence", "recommendations"],
    hiddenSections: ["erceMetadata", "executionTrace", "promptMetadata", "developerDiagnostics"],
    allowCharts: false,
    allowTables: false,
    allowTimeline: false,
    allowMissionControl: false,
    allowExecutionDetails: false,
    allowRecommendations: true,
  },
  CompliancePushback: {
    id: "CompliancePushback",
    label: "Compliance Pushback",
    primarySections: ["complianceWarning", "naturalAnswer"],
    optionalSections: ["policyEvidence"],
    hiddenSections: ["erceMetadata", "executionTrace", "promptMetadata", "developerDiagnostics"],
    allowCharts: false,
    allowTables: false,
    allowTimeline: false,
    allowMissionControl: false,
    allowExecutionDetails: false,
    allowRecommendations: false,
  },
  ConversationalIdentity: {
    id: "ConversationalIdentity",
    label: "Conversational Identity",
    primarySections: ["naturalAnswer"],
    optionalSections: [],
    hiddenSections: ["erceMetadata", "executionTrace", "promptMetadata", "developerDiagnostics", "evidence", "analytics"],
    allowCharts: false,
    allowTables: false,
    allowTimeline: false,
    allowMissionControl: false,
    allowExecutionDetails: false,
    allowRecommendations: false,
  },

  ComplianceAudit: {
    id: "ComplianceAudit",
    label: "Compliance Audit",
    primarySections: ["naturalAnswer", "complianceStatus"],
    optionalSections: ["evidence", "timeline", "recommendations"],
    hiddenSections: ["promptMetadata", "developerDiagnostics"],
    allowCharts: false,
    allowTables: true,
    allowTimeline: true,
    allowMissionControl: true,
    allowExecutionDetails: true,
    allowRecommendations: true,
  },

  // Fallback: generic, minimal
  General: {
    id: "General",
    label: "General",
    primarySections: ["naturalAnswer"],
    optionalSections: ["evidence"],
    hiddenSections: ["erceMetadata", "executionTrace", "promptMetadata", "developerDiagnostics"],
    allowCharts: false,
    allowTables: false,
    allowTimeline: false,
    allowMissionControl: false,
    allowExecutionDetails: false,
    allowRecommendations: false,
  },

  // Conversational Chat
  Chat: {
    id: "Chat",
    label: "Chat",
    primarySections: ["naturalAnswer"],
    optionalSections: [],
    hiddenSections: ["erceMetadata", "executionTrace", "promptMetadata", "developerDiagnostics"],
    allowCharts: false,
    allowTables: false,
    allowTimeline: false,
    allowMissionControl: false,
    allowExecutionDetails: false,
    allowRecommendations: false,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// CORE ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export class ResponseStrategyLayer {

  /**
   * Evaluate the request and return a deterministic ResponseStrategy.
   * Called after Permission Validation, before Verified Retrieval.
   *
   * @param message   Raw user query
   * @param ice       ICE classification result
   * @param eqre      EQRE resolution result
   * @param userRole  Authenticated role
   */
  static determine(
    message: string,
    ice: ICEAnalysis,
    eqre: EQREResolution,
    userRole: MominRole
  ): ResponseStrategy {
    const q = message.toLowerCase();
    const intent = ice.intent;

    // ── 1. Classify User Objective ──────────────────────────────────────────
    const objective = ResponseStrategyLayer.classifyObjective(q, intent);

    // ── 2. Select Response Mode ─────────────────────────────────────────────
    const mode = ResponseStrategyLayer.selectMode(objective, intent, userRole);

    // ── 3. Determine Depth ──────────────────────────────────────────────────
    const depth = ResponseStrategyLayer.determineDepth(q, mode, userRole, objective);

    // ── 4. Select Blueprint ─────────────────────────────────────────────────
    const blueprint = ResponseStrategyLayer.selectBlueprint(objective, intent, mode);

    // ── 5. Build Allowed & Hidden Component Lists ───────────────────────────
    const { allowedComponents, hiddenComponents } = ResponseStrategyLayer.resolveComponents(
      blueprint, mode, depth, userRole, q
    );

    // ── 6. Compose Prompt Directives ────────────────────────────────────────
    const { promptToneDirective, promptStructureDirective } =
      ResponseStrategyLayer.buildPromptDirectives(mode, depth, objective);

    // ── 7. Suppression Flags ────────────────────────────────────────────────
    const suppressAnalytics      = !ResponseStrategyLayer.analyticsRequested(q, objective, mode);
    const suppressRecommendations = !blueprint.allowRecommendations;
    const suppressDashboards     = mode !== "AUDIT" && mode !== "EXECUTIVE";

    return {
      objective,
      mode,
      depth,
      blueprint,
      allowedComponents,
      hiddenComponents,
      promptToneDirective,
      promptStructureDirective,
      suppressAnalytics,
      suppressRecommendations,
      suppressDashboards,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE: OBJECTIVE CLASSIFICATION
  // ─────────────────────────────────────────────────────────────────────────

  private static classifyObjective(q: string, intent: SystemIntent): UserObjective {
    if (intent === "complianceViolation") {
      return "CompliancePushback";
    }

    // ── AUDIENCE WORDS — override everything else ───────────────────────────
    // "board", "leadership", "executive", "stakeholder" → always EXECUTIVE
    if (q.includes("board") || q.includes("leadership") || q.includes("stakeholder") ||
        q.includes("executive") || q.includes("management") || q.includes("trustee")) {
      return "ExecutiveBriefing";
    }

    // ── WORKFLOW / OPERATIONAL ACTIONS ──────────────────────────────────────
    if (intent === "allocateDonation" || intent === "publishUpdate" || intent === "dispatchCommunications") {
      return "WorkflowExecution";
    }
    if (intent === "generateCertificates") return "DraftGeneration";
    if (intent === "reviewCompliance")     return "Verification";

    // ── SCOPE WORDS → deep dive (ANALYSIS/DETAILED) ─────────────────────────
    // "full", "detailed", "complete", "comprehensive", "breakdown", "in detail"
    if (q.includes("full breakdown") || q.includes("full detail") || q.includes("in detail") ||
        q.includes("comprehensive") || q.includes("breakdown") || q.includes("detailed") ||
        q.includes("complete picture") || q.includes("all data") || q.includes("deep dive")) {
      return "Analytics";
    }

    // ── REPORT GENERATION verbs ─────────────────────────────────────────────
    // "prepare", "generate", "create", "produce" + report/briefing/summary
    if (intent === "generateReport") return "Reporting";
    if ((q.includes("prepare") || q.includes("generate") || q.includes("produce") || q.includes("create")) &&
        (q.includes("report") || q.includes("briefing") || q.includes("summary") || q.includes("statement"))) {
      return "Reporting";
    }

    // ── DRAFT / CREATION ────────────────────────────────────────────────────
    if (q.includes("draft") || q.includes("write") || q.includes("email") ||
        q.includes("acknowledgement") || q.includes("letter") || q.includes("message")) {
      return "DraftGeneration";
    }

    // ── APPROVAL ────────────────────────────────────────────────────────────
    if (q.includes("approve") || q.includes("authorize") || q.includes("sign off")) {
      return "Approval";
    }

    // ── EXPLICIT ANALYTICS / COMPARISON ─────────────────────────────────────
    if (q.includes("analytic") || q.includes("trend") || q.includes("growth") || q.includes("chart")) {
      return "Analytics";
    }
    if (q.includes("compare") || q.includes(" vs ") || q.includes("versus") || q.includes("month over") || q.includes("vs last")) {
      return "Comparison";
    }

    // ── DECISION SUPPORT ────────────────────────────────────────────────────
    if (q.includes("should") || q.includes("recommend") || q.includes("suggest") ||
        q.includes("advise") || q.includes("strategy")) {
      return "DecisionSupport";
    }

    // ── VERIFICATION ────────────────────────────────────────────────────────
    if (q.includes("verify") || q.includes("confirm") || q.includes("check") ||
        q.includes("valid") || q.includes("audit")) {
      return "Verification";
    }

    if (intent === "chat") {
      return "Chat";
    }

    // ── SEARCH / LOOKUP ─────────────────────────────────────────────────────
    // "find", "search", "list", "show me all", "which", "who"
    if (q.includes("find") || q.includes("search") || q.includes("list all") ||
        q.includes("show me all") || q.includes("which") || q.includes("who")) {
      return "Search";
    }

    // ── QUICK CHECK — simple fact queries → INFORMATION/MINIMAL ─────────────
    // "show", "what", "how much", "how many", "tell me", short queries
    if (
      q.startsWith("show ") || q.startsWith("what ") || q.startsWith("what's") ||
      q.startsWith("how much") || q.startsWith("how many") || q.startsWith("tell me") ||
      q.startsWith("is ") || q.startsWith("are ") || q.split(" ").length <= 7
    ) {
      return "Information";
    }

    // Fallback → Information (Task 4: unmapped → least verbose)
    return "Information";
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE: MODE SELECTION
  // ─────────────────────────────────────────────────────────────────────────

  private static selectMode(
    objective: UserObjective,
    intent: SystemIntent,
    userRole: MominRole
  ): ResponseMode {
    // Audit mode — super_admin only
    if (userRole === "super_admin" &&
        objective === "Verification" && intent === "reviewCompliance") {
      return "AUDIT";
    }

    switch (objective) {
      case "CompliancePushback":
        return "EXECUTIVE";

      case "Information":
      case "Search":
      case "Verification":
        return "INFORMATION";

      case "Analytics":
      case "Comparison":
        return "ANALYSIS";

      case "ExecutiveBriefing":
      case "DecisionSupport":
        return "EXECUTIVE";

      case "DraftGeneration":
      case "Approval":
        return "CREATION";

      case "WorkflowExecution":
        return "WORKFLOW";

      case "Reporting":
        return "EXECUTIVE";

      case "Chat":
        return "CHAT";

      default:
        return "INFORMATION";
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE: DEPTH DETERMINATION
  // ─────────────────────────────────────────────────────────────────────────

  private static determineDepth(
    q: string,
    mode: ResponseMode,
    userRole: MominRole,
    objective?: UserObjective
  ): ResponseDepth {
    if (objective === "CompliancePushback") return "EXECUTIVE";
    // Developer/diagnostic depth — super_admin only
    if (userRole === "super_admin" && (q.includes("diagnostic") || q.includes("debug") || q.includes("trace"))) {
      return "DEVELOPER";
    }
    if (mode === "EXECUTIVE" || q.includes("board") || q.includes("leadership") || q.includes("brief")) {
      return "EXECUTIVE";
    }
    if (mode === "ANALYSIS" || q.includes("detailed") || q.includes("full") || q.includes("comprehensive")) {
      return "DETAILED";
    }
    // Simple facts → minimal
    if (
      q.match(/^(what|how much|how many|who|when|which|total|largest|give me|show me).{0,60}[?]?$/i) ||
      q.split(" ").length < 8
    ) {
      return "MINIMAL";
    }
    return "STANDARD";
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE: BLUEPRINT SELECTION
  // ─────────────────────────────────────────────────────────────────────────

  private static selectBlueprint(
    objective: UserObjective,
    intent: SystemIntent,
    mode: ResponseMode
  ): ResponseBlueprint {
    if (objective === "CompliancePushback") {
      return BLUEPRINTS.CompliancePushback;
    }
    if (mode === "CREATION" || objective === "DraftGeneration" || objective === "Approval") {
      return BLUEPRINTS.DraftGeneration;
    }
    if (mode === "WORKFLOW" || objective === "WorkflowExecution") {
      return BLUEPRINTS.WorkflowExecution;
    }
    if (mode === "AUDIT" || objective === "Verification") {
      return BLUEPRINTS.ComplianceAudit;
    }
    if (mode === "ANALYSIS" || objective === "Analytics" || objective === "Comparison") {
      return BLUEPRINTS.Analytics;
    }
    if (objective === "Reporting") {
      return BLUEPRINTS.ReportGeneration;
    }
    if (objective === "ExecutiveBriefing" || objective === "DecisionSupport") {
      return BLUEPRINTS.ExecutiveBriefing;
    }
    if (intent === "donorIntelligence") {
      return BLUEPRINTS.DonorSearch;
    }
    if (intent === "donationSearch") {
      return BLUEPRINTS.DonationSummary;
    }
    if (objective === "Chat" || mode === "CHAT") {
      return BLUEPRINTS.ConversationalIdentity;
    }
    return BLUEPRINTS.General;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE: COMPONENT RESOLUTION
  // ─────────────────────────────────────────────────────────────────────────

  private static resolveComponents(
    blueprint: ResponseBlueprint,
    mode: ResponseMode,
    depth: ResponseDepth,
    userRole: MominRole,
    q: string
  ): { allowedComponents: string[]; hiddenComponents: string[] } {

    const allowed: string[] = [...blueprint.primarySections];

    // Optional components become allowed only in DETAILED / DEVELOPER / EXECUTIVE depth
    if (depth === "DETAILED" || depth === "DEVELOPER" || depth === "EXECUTIVE") {
      allowed.push(...blueprint.optionalSections);
    }

    // Charts
    if (blueprint.allowCharts && (q.includes("chart") || q.includes("graph") || q.includes("visual") || depth === "DETAILED")) {
      allowed.push("charts");
    }

    // Tables
    if (blueprint.allowTables && (depth === "DETAILED" || depth === "DEVELOPER")) {
      allowed.push("tables");
    }

    // Timeline
    if (blueprint.allowTimeline && (mode === "WORKFLOW" || mode === "AUDIT")) {
      allowed.push("timeline");
    }

    // Mission Control — only workflow + audit modes
    if (blueprint.allowMissionControl && (mode === "WORKFLOW" || mode === "AUDIT")) {
      allowed.push("missionControl");
    }

    // Execution Details — only workflow
    if (blueprint.allowExecutionDetails && mode === "WORKFLOW") {
      allowed.push("executionDetails");
    }

    // Recommendations — only if governance approved AND explicitly requested or analysis mode
    if (blueprint.allowRecommendations &&
        (mode === "ANALYSIS" || mode === "EXECUTIVE" || q.includes("recommend") || q.includes("suggest"))) {
      allowed.push("recommendations");
    }

    // Hidden components — always hide internals unless super_admin
    const hidden = [...blueprint.hiddenSections];
    if (userRole !== "super_admin") {
      if (!hidden.includes("erceMetadata"))        hidden.push("erceMetadata");
      if (!hidden.includes("executionTrace"))       hidden.push("executionTrace");
      if (!hidden.includes("promptMetadata"))       hidden.push("promptMetadata");
      if (!hidden.includes("developerDiagnostics")) hidden.push("developerDiagnostics");
    } else {
      // super_admin: expose diagnostics on explicit request
      if (q.includes("diagnostic") || q.includes("debug") || q.includes("trace") || q.includes("audit")) {
        allowed.push("erceMetadata", "developerDiagnostics");
      }
    }

    return {
      allowedComponents: [...new Set(allowed)],
      hiddenComponents: [...new Set(hidden)],
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE: PROMPT DIRECTIVES
  // ─────────────────────────────────────────────────────────────────────────

  private static buildPromptDirectives(
    mode: ResponseMode,
    depth: ResponseDepth,
    objective: UserObjective
  ): { promptToneDirective: string; promptStructureDirective: string } {
    if (objective === "CompliancePushback") {
      return {
        promptToneDirective: "STRICT COMPLIANCE PUSHBACK: The user has requested an action that violates Shariah or Amanah (donor trust) policies, such as diverting earmarked funds. You must actively refuse the request. Be firm, respectful, but absolute. Do NOT output analytics, project status, or execute the request.",
        promptStructureDirective: "1. Firmly state that the action cannot be performed.\n2. Explain the Amanah/Shariah compliance violation clearly.\n3. Stop."
      };
    }

    const toneMap: Record<ResponseMode, string> = {
      INFORMATION:
        "Respond with a single, concise, factual answer. Do not add unrequested context, analytics, or enterprise modules. Answer the question directly, then stop.",
      ANALYSIS:
        "Respond as an analyst. Lead with the key insight, then present supporting data. Do not narrate beyond what the numbers indicate. Avoid filler phrases.",
      EXECUTIVE:
        "Respond as an Executive Operations Officer delivering a leadership briefing. Be calm, authoritative, and concise. Lead with the decision-relevant summary.",
      CREATION:
        "Your task is to generate the requested document or communication. Focus exclusively on producing that output. Do not add commentary, summaries, or enterprise status panels.",
      WORKFLOW:
        "Respond as an operations coordinator. Present a clear, step-by-step action plan. Each step must reference verified data. Do not add unrequested analytics.",
      AUDIT:
        "Respond as a compliance auditor. Lead with the verification finding. Present evidence systematically. Expose governance and certification metadata as authorised.",
      CHAT:
        "Respond naturally, conversationally, and expansively like an experienced AI assistant who is deeply knowledgeable about Daarayn and its mission. You are allowed to use your general knowledge about MOMIN, AI-TOS, and Daarayn.",
    };

    const structureMap: Record<ResponseMode, string> = {
      INFORMATION:
        "Answer in one to three sentences. If a number was requested, state it first. Do not add a summary section, chart, or recommendation.",
      ANALYSIS:
        "Structure: Executive Insight → Key Metrics → Optional Supporting Detail. Do not include unrelated modules.",
      EXECUTIVE:
        "Structure: One-paragraph executive summary → Optional: supporting evidence (only if relevant). Do not include raw data tables, internal diagnostics, or recommendations unless governance approved.",
      CREATION:
        "Output the requested document or draft only. Follow the field schema specified in the response plan. Do not add explanatory text around the output.",
      WORKFLOW:
        "Structure: Objective → Ordered Steps → Authorization Gate. Each step must be verifiable against the ledger.",
      AUDIT:
        "Structure: Compliance Status → Evidence → Gaps → Recommended Remediation. Reference authoritative sources only.",
      CHAT:
        "Structure: Natural conversational response. Answer the user's question directly and thoroughly.",
    };

    const depthOverride: Partial<Record<ResponseDepth, string>> = {
      MINIMAL:
        "DEPTH CONSTRAINT: Your response must fit in 2–3 sentences maximum. No additional sections.",
      DEVELOPER:
        "DEPTH MODE: Full developer diagnostic output authorized. Include all pipeline metadata, certification levels, and trace data.",
    };

    const toneDirective   = toneMap[mode];
    const structDirective = (depthOverride[depth] ?? "") + "\n" + structureMap[mode];

    return {
      promptToneDirective: toneDirective,
      promptStructureDirective: structDirective.trim(),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE: ANALYTICS SUPPRESSION CHECK
  // ─────────────────────────────────────────────────────────────────────────

  private static analyticsRequested(
    q: string,
    objective: UserObjective,
    mode: ResponseMode
  ): boolean {
    if (objective === "Analytics" || objective === "Comparison" || mode === "ANALYSIS") return true;
    // Explicit keywords
    if (q.includes("analytic") || q.includes("chart") || q.includes("graph") ||
        q.includes("breakdown") || q.includes("trend") || q.includes("kpi") ||
        q.includes("metric") || q.includes("statistic")) return true;
    return false;
  }
}
