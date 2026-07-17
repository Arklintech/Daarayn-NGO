/**
 * lib/ai/engines/IntentClassificationEngine.ts
 *
 * Intent Classification Engine (ICE) for Phase 3.
 * Strictly separates intents before retrieval or context construction.
 */

export type SystemIntent =
  | "donationSearch"
  | "projectIntelligence"
  | "communicationIntelligence"
  | "donorIntelligence"
  | "complianceIntelligence"
  | "complianceViolation"
  | "reportGenerator"
  | "knowledgeSearch"
  | "administration"
  | "globalSearch"
  | "executiveBriefing"
  | "financialOverview"
  | "projectStatus"
  | "beneficiaryIntelligence"
  | "volunteerIntelligence"
  | "financialIntelligence"
  | "campaignIntelligence"
  | "emailIntelligence"
  | "operationalIntelligence"
  | "governance"
  | "reporting"
  | "publicLedger"
  | "analytics"
  | "investigations"
  | "decisionSupport"
  | "strategicPlanning"
  | "organizationalMemory"
  | "allocateDonation"
  | "publishUpdate"
  | "generateCertificates"
  | "dispatchCommunications"
  | "reviewCompliance"
  | "generateReport"
  | "chat";

export interface ExtractedEntities {
  donorName?: string;
  donorId?: string;
  programId?: string;
  programName?: string;
  donationId?: string;
  amount?: number;
  currency?: string;
  timeframe?: "today" | "week" | "month" | "year" | "all" | string;
  reportType?: "board" | "monthly" | "annual" | "compliance";
  pendingOnly?: boolean;
  listAllDonors?: boolean;
  listAllCauses?: boolean;
  listRepeatDonors?: boolean;
  repeatCount?: number;
  emailFailedOnly?: boolean;
  emailCountQuery?: boolean;
  wantsAdvice?: boolean;
  wantsProgramDonations?: boolean;
  wantsAllocationAudit?: boolean;
  wantsExecutiveDonorAnalysis?: boolean;
  wantsProactiveRisk?: boolean;
  wantsStrategicActions?: boolean;
  wantsFinancialInvestigation?: boolean;
  isExecutiveAnalysis?: boolean;
  executiveOpsMode?: import("../mco/ExecutiveOpsReportBuilder").ExecutiveOpsMode;
}

export type DaaraynIntent =
  | "donationSearch"
  | "donorIntelligence"
  | "campaignStrategy"
  | "complianceCheck"
  | "complianceViolation"
  | "financialReporting"
  | "communicationDrafting"
  | "financialOverview"
  | "projectStatus"
  | "beneficiaryIntelligence"
  | "volunteerIntelligence"
  | "financialIntelligence"
  | "campaignIntelligence"
  | "emailIntelligence"
  | "operationalIntelligence"
  | "governance"
  | "reporting"
  | "publicLedger"
  | "analytics"
  | "investigations"
  | "decisionSupport"
  | "strategicPlanning"
  | "organizationalMemory"
  | "unknown"
  | "executiveBriefing"
  | "chat";

export interface ICEAnalysis {
  intent: SystemIntent;
  confidence: number;
  entities: ExtractedEntities;
}

/** Typo fixes only — never remap operational words like "status". */
const NLU_SPELLING_MAP: Record<string, string> = {
  doner: "donor",
  doners: "donors",
  donat: "donation",
  camapign: "campaign",
  campain: "campaign",
  donatons: "donations",
  benificiary: "beneficiary",
  thnk: "thank",
  u: "you",
  mail: "email",
  ahmwd: "ahmed",
  rept: "report",
  sumary: "summary",
  pls: "please",
  cmplnc: "compliance",
  zkat: "zakat",
  compain: "campaign",
  edcation: "education",
  orpanage: "orphanage",
  orphange: "orphanage",
  repare: "prepare",
};

const EXECUTIVE_BRIEFING_PATTERNS = [
  /\bexecutive\s+briefing\b/,
  /\bmorning\s+briefing\b/,
  /\bmorning\s+brief\b/,
  /\bgood\s+morning\b/,
  /\bgive\s+me\s+(the\s+)?brief\b/,
  /\borganizational\s+briefing\b/,
  /\bbrief\s+me\b/,
  /\bstart\s+my\s+day\b/,
  /\bbefore\s+i\s+start\b/,
  /\brequires?\s+(my\s+)?attention\b/,
  /\bboard\s+of\s+trustees\b/,
  /\bdaily\s+(executive\s+)?brief\b/,
  /\beverything\s+that\s+requires\b/,
];

const STRATEGIC_EXECUTIVE_PATTERNS = [
  /\bchief\s+operating\s+officer\b/,
  /\bcoo\b/,
  /\btop\s+three\s+strategic\b/,
  /\bnext\s+30\s+days\b/,
  /\boperational\s+health\b/,
  /\bstrategic\s+actions?\b/,
  /\bworried\s+about\b/,
  /\bshould\s+be\s+worried\b/,
  /\bhaven'?t\s+thought\s+to\s+ask\b/,
  /\bunusual\s+(financial|operational)\b/,
  /\binvestigate\s+whether\b/,
  /\banalyze\s+our\s+donor\s+base\b/,
  /\bexecutive\s+attention\b/,
  /\bdonors?\s+who\s+may\s+require\b/,
  /\busing\s+them\s+in\s+right\b/,
  /\bare\s+we\s+using\b/,
  /\bright\s+places?\b/,
];

import { detectExecutiveOpsMode } from "../mco/ExecutiveOpsReportBuilder";

export class IntentClassificationEngine {
  /**
   * Evaluates query message to return classified intent and parameters.
   * Tolerates misspellings and uses history + HCIE entities for context.
   */
  static classifyIntent(
    message: string,
    historyText: string = "",
    hciExtractedEntities: string[] = []
  ): ICEAnalysis {
    let queryLower = message.toLowerCase();

    Object.keys(NLU_SPELLING_MAP).forEach((typo) => {
      const regex = new RegExp(`\\b${typo}\\b`, "g");
      queryLower = queryLower.replace(regex, NLU_SPELLING_MAP[typo]);
    });

    const entities: ExtractedEntities = {};
    let intent: SystemIntent = "globalSearch";
    let confidence = 0.7;

    // HCIE context block: "how much did he donate? [Context: Abdul Rahman Khan]"
    const contextMatch = message.match(/\[Context:\s*([^\]]+)\]/i);
    if (contextMatch?.[1]) {
      entities.donorName = contextMatch[1].trim();
    }

    const isExecutiveBriefQuery = EXECUTIVE_BRIEFING_PATTERNS.some((p) => p.test(queryLower));
    const isStrategicExecutiveQuery = STRATEGIC_EXECUTIVE_PATTERNS.some((p) => p.test(queryLower));
    if (isStrategicExecutiveQuery || isExecutiveBriefQuery) {
      entities.isExecutiveAnalysis = true;
    }

    // HCIE fuzzy-resolved entity names — only bind to donors in donor-specific context
    const usesPersonPronoun = /\b(he|him|his|she|her|that donor|the other one)\b/.test(queryLower);
    const usesCollectiveReferent = /\b(them|they|these|those)\b/.test(queryLower);
    const donorContext =
      queryLower.includes("donor") ||
      /\b(give|gave|donate|donated|contributed|contribution)\b/.test(queryLower) ||
      usesPersonPronoun;

    if (!entities.isExecutiveAnalysis) {
      for (const entityName of hciExtractedEntities) {
        if (!entityName || entityName.length < 3) continue;
        if (donorContext && !entities.donorName) {
          entities.donorName = entityName;
        } else if (!entities.programName && (queryLower.includes("project") || queryLower.includes("cause") || queryLower.includes("program"))) {
          entities.programName = entityName;
        }
      }
    }

    // Pronoun + history resolution — person pronouns only (not them/they for causes)
    if (historyText && usesPersonPronoun && !entities.isExecutiveAnalysis) {
      const historyLower = historyText.toLowerCase();
      if (historyLower.includes("ahmed")) entities.donorName = entities.donorName || "Ahmed Khan";
      if (historyLower.includes("abdul")) entities.donorName = entities.donorName || "Abdul Rahman Khan";
      if (historyLower.includes("sara")) entities.donorName = entities.donorName || "Sara Ahmed";
      if (historyLower.includes("khan") && !entities.donorName) entities.donorName = "khan";
      if (historyLower.includes("water") && queryLower.includes("campaign")) queryLower += " water";
      if (historyLower.includes("family") && queryLower.includes("campaign")) queryLower += " family";
    }

    // Collective referents after causes/donations discussion → allocation audit, not donor lookup
    if (
      usesCollectiveReferent &&
      (/\b(place|use|allocate|cause|program|right)\b/.test(queryLower) ||
        historyText.toLowerCase().includes("cause") ||
        historyText.toLowerCase().includes("program"))
    ) {
      entities.wantsAllocationAudit = true;
      delete entities.donorName;
      delete entities.donorId;
    }

    // Entity ID patterns
    const dnrMatch = message.match(/dnr-\d{4}-\d+/i);
    if (dnrMatch) entities.donorId = dnrMatch[0].toUpperCase();

    const donMatch = message.match(/don-\d{4}-\d+/i) || message.match(/da\d+/i);
    if (donMatch) entities.donationId = donMatch[0].toUpperCase();

    const prgMatch = message.match(/prg-[a-zA-Z0-9]+/i);
    if (prgMatch) entities.programId = prgMatch[0].toUpperCase();

    const amountMatch = message.match(/(?:₹|inr)?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/i);
    if (amountMatch && !queryLower.includes("donors") && !queryLower.includes("emails")) {
      const cleanNum = parseFloat(amountMatch[1].replace(/,/g, ""));
      if (cleanNum > 100 && cleanNum !== 2026 && cleanNum !== 2025) {
        entities.amount = cleanNum;
        entities.currency = "INR";
      }
    }

    if (queryLower.includes("today")) entities.timeframe = "today";
    else if (queryLower.includes("yesterday")) entities.timeframe = "yesterday";
    else if (queryLower.includes("this month") || queryLower.includes("month details") || (queryLower.includes("month") && !queryLower.includes("6 month"))) entities.timeframe = "month";
    else if (queryLower.includes("last week") || queryLower.includes("past week")) entities.timeframe = "week";
    else if (queryLower.includes("week")) entities.timeframe = "week";
    else if (queryLower.includes("month")) entities.timeframe = "month";
    else if (queryLower.includes("year")) entities.timeframe = "year";

    // List / detail query modes
    if (
      (queryLower.includes("all") || queryLower.includes("list") || queryLower.includes("share") || queryLower.includes("each")) &&
      (queryLower.includes("donor") || queryLower.includes("doner"))
    ) {
      entities.listAllDonors = true;
    }

    if (
      queryLower.includes("cause") ||
      queryLower.includes("causes") ||
      (queryLower.includes("program") && queryLower.includes("each"))
    ) {
      if (queryLower.includes("each") || queryLower.includes("all") || queryLower.includes("detail") || queryLower.includes("information")) {
        entities.listAllCauses = true;
      }
    }

    if (queryLower.includes("other project") || queryLower.includes("other projects") || queryLower.includes("all project")) {
      entities.listAllCauses = true;
    }

    if (queryLower.includes("failed") && queryLower.includes("email")) {
      entities.emailFailedOnly = true;
    }
    if ((queryLower.includes("how many") || queryLower.includes("total") || queryLower.includes("totoal")) && queryLower.includes("email")) {
      entities.emailCountQuery = true;
    }

    // Follow-up: "who are those 3?" after repeat donor mention
    if (
      /\b(who are|which are|name)\b/.test(queryLower) &&
      (/\bthose\b|\bthem\b|\bthe three\b|\b3\b/.test(queryLower) || historyText.toLowerCase().includes("repeat"))
    ) {
      entities.listRepeatDonors = true;
      const countFromQuery = queryLower.match(/\b(\d+)\b/);
      const countFromHistory = historyText.match(/(\d+)\s+of whom are repeat|(\d+)\s+repeat donor/i);
      entities.repeatCount = countFromQuery
        ? parseInt(countFromQuery[1], 10)
        : countFromHistory
          ? parseInt(countFromHistory[1] || countFromHistory[2], 10)
          : 3;
    }

    if (
      queryLower.includes("how can we") ||
      queryLower.includes("how to complete") ||
      queryLower.includes("how do we complete") ||
      queryLower.includes("how can we complete") ||
      (queryLower.includes("enhance") && (queryLower.includes("project") || queryLower.includes("masjid") || entities.programName))
    ) {
      entities.wantsAdvice = true;
    }

    // Broad cause/program listing
    if (queryLower.includes("causes") || queryLower.includes("each cause") || (queryLower.includes("each") && queryLower.includes("cause"))) {
      entities.listAllCauses = true;
    }

    // Known donor names
    if (queryLower.includes("ahmed khan")) {
      entities.donorName = "Ahmed Khan";
      entities.donorId = entities.donorId || "DNR-2026-000001";
    } else if (queryLower.includes("abdul")) {
      entities.donorName = entities.donorName || "Abdul Rahman Khan";
    } else if (queryLower.includes("sara ahmed")) {
      entities.donorName = "Sara Ahmed";
      entities.donorId = entities.donorId || "DNR-2026-000002";
    }

    // Single-token donor name heuristic: "what did khan give?"
    if (!entities.donorName) {
      const gaveMatch = queryLower.match(/(?:what did|how much did)\s+([a-z]{3,})\s+(?:give|donate|contribute)/);
      if (gaveMatch?.[1] && !["he", "she", "they"].includes(gaveMatch[1])) {
        entities.donorName = gaveMatch[1].charAt(0).toUpperCase() + gaveMatch[1].slice(1);
      }
    }

    // Program heuristics
    if (queryLower.includes("family relief") || queryLower.includes("family")) {
      entities.programId = entities.programId || "PRG-FAMILY";
    } else if (queryLower.includes("quran") || queryLower.includes("endowment")) {
      entities.programId = entities.programId || "PRG-QURAN";
    } else if (queryLower.includes("water") || queryLower.includes("well") || queryLower.includes("pump")) {
      entities.programId = entities.programId || "PRG-WATER";
    } else if (queryLower.includes("kalyan")) {
      entities.programId = entities.programId || "PRG-KALYAN";
    } else if (queryLower.includes("education")) {
      entities.programName = "Education";
      entities.programId = entities.programId || "PRG-EDUCATION";
    }

    if (queryLower.includes("gaza")) entities.programName = "Gaza";
    else if (queryLower.includes("orphan") || queryLower.includes("orphanage")) entities.programName = "Orphan";
    else if (queryLower.includes("masjid")) entities.programName = "Masjid";
    else if (queryLower.includes("water") || queryLower.includes("well")) entities.programName = entities.programName || "Water";

    // Program-scoped donation totals
    if (
      (queryLower.includes("donation") || queryLower.includes("total") || queryLower.includes("how much") || queryLower.includes("received")) &&
      (entities.programName || queryLower.includes("orphan") || queryLower.includes("orphanage") || queryLower.includes("masjid") || queryLower.includes("in "))
    ) {
      if (entities.programName || queryLower.includes("orphan") || queryLower.includes("orphanage") || queryLower.includes("masjid")) {
        entities.wantsProgramDonations = true;
      }
    }

    if (/\b(where\s+(can|should)\s+we\s+use|causes?\s+we\s+can\s+use)\b/.test(queryLower)) {
      entities.listAllCauses = true;
    }

    if (/\b(analyze\s+.*donor|donor\s+base|executive\s+attention|donors?\s+who\s+may\s+require)\b/.test(queryLower)) {
      entities.wantsExecutiveDonorAnalysis = true;
      entities.listAllDonors = false;
      delete entities.donorName;
    }

    if (/\b(worried\s+about|should\s+be\s+worried|haven'?t\s+thought\s+to\s+ask|something\s+i\s+should\s+be\s+worried)\b/.test(queryLower)) {
      entities.wantsProactiveRisk = true;
      delete entities.donorName;
    }

    // Executive operations reports — comprehensive verified briefings
    const opsMode = detectExecutiveOpsMode(queryLower);
    if (opsMode) {
      entities.executiveOpsMode = opsMode;
      entities.isExecutiveAnalysis = true;
      delete entities.donorName;
      delete entities.donorId;
      delete entities.programName;
      entities.wantsStrategicActions = false;
      entities.wantsFinancialInvestigation = false;
      if (opsMode === "weekly_review") entities.timeframe = "week";
    }

    if (!entities.executiveOpsMode && /\b(chief\s+operating|coo\b|top\s+three\s+strategic|30\s+days.*improve)\b/.test(queryLower)) {
      entities.wantsStrategicActions = true;
      entities.isExecutiveAnalysis = true;
      delete entities.donorName;
    }

    if (!entities.executiveOpsMode && /\b(investigate\s+whether|unusual\s+(financial|operational)|patterns?\s+that\s+deserve)\b/.test(queryLower)) {
      entities.wantsFinancialInvestigation = true;
      delete entities.donorName;
    }

    if (/\b(right\s+place|using\s+them|allocated\s+correctly|are\s+we\s+using)\b/.test(queryLower)) {
      entities.wantsAllocationAudit = true;
      delete entities.donorName;
    }

    // Pending acknowledgements only — NOT "pending approvals" inside a morning brief
    if (
      !isExecutiveBriefQuery &&
      !entities.isExecutiveAnalysis &&
      ((queryLower.includes("pending donor") || queryLower.includes("pending acknowledg") || queryLower.includes("pending thank") || queryLower.includes("awaiting acknowledgement")) ||
        (queryLower.includes("pending") && (queryLower.includes("thank") || queryLower.includes("acknowledg")) && !queryLower.includes("approval")))
    ) {
      entities.pendingOnly = true;
    }

    const isExecutiveBriefing = isExecutiveBriefQuery;
    const isProjectStatus =
      (queryLower.includes("status") || queryLower.includes("progress")) &&
      (queryLower.includes("project") || queryLower.includes("program") || queryLower.includes("campaign") ||
        queryLower.includes("education") || queryLower.includes("orphan") || queryLower.includes("water") ||
        queryLower.includes("masjid") || entities.programName);

    const isTopDonorQuery = 
      queryLower.includes("primary donor") ||
      queryLower.includes("top donor") ||
      queryLower.includes("generous donor") ||
      queryLower.includes("highest contributing") ||
      queryLower.includes("highest active donor") ||
      queryLower.includes("most generous") ||
      queryLower.includes("donated the most") ||
      queryLower.includes("who donated the most");

    const asksAboutSpecificDonor =
      !entities.isExecutiveAnalysis &&
      !entities.wantsAllocationAudit &&
      !entities.wantsExecutiveDonorAnalysis &&
      !entities.wantsProactiveRisk &&
      !entities.wantsStrategicActions &&
      !entities.wantsFinancialInvestigation &&
      !entities.executiveOpsMode &&
      (!!entities.donorName ||
        !!entities.donorId ||
        (usesPersonPronoun && (queryLower.includes("donate") || queryLower.includes("give") || queryLower.includes("contributed"))));

    const asksAboutDonation =
      queryLower.includes("donation") ||
      queryLower.includes("donate") ||
      queryLower.includes("donated") ||
      queryLower.includes("give") ||
      queryLower.includes("gave") ||
      queryLower.includes("contributed") ||
      queryLower.includes("contribution");

    // Intent classification — precedence order matters
    if (entities.executiveOpsMode) {
      intent = "operationalIntelligence";
      confidence = 0.98;
    } else if (isExecutiveBriefing) {
      intent = "executiveBriefing";
      confidence = 0.97;
    } else if (entities.wantsFinancialInvestigation) {
      intent = "investigations";
      confidence = 0.95;
    } else if (entities.wantsProactiveRisk) {
      intent = "decisionSupport";
      confidence = 0.94;
    } else if (entities.wantsStrategicActions) {
      intent = "strategicPlanning";
      confidence = 0.94;
    } else if (isTopDonorQuery) {
      intent = "donorIntelligence";
      confidence = 0.96;
    } else if (entities.wantsExecutiveDonorAnalysis) {
      intent = "donorIntelligence";
      confidence = 0.93;
    } else if (entities.wantsAllocationAudit) {
      intent = "decisionSupport";
      confidence = 0.92;
    } else if (entities.wantsProgramDonations) {
      intent = "donationSearch";
      confidence = 0.91;
    } else if (
      queryLower.includes("divert") ||
      queryLower.includes("reallocate") ||
      queryLower.includes("move funds") ||
      (queryLower.includes("orphan") && queryLower.includes("masjid") && queryLower.includes("fund")) ||
      queryLower.includes("bypass compliance")
    ) {
      intent = "complianceViolation";
      confidence = 1.0;
    } else if (entities.emailFailedOnly || entities.emailCountQuery) {
      intent = "communicationIntelligence";
      confidence = 0.92;
    } else if (entities.listAllCauses) {
      intent = "projectIntelligence";
      confidence = 0.9;
    } else if (entities.listAllDonors || entities.listRepeatDonors) {
      intent = "donorIntelligence";
      confidence = 0.9;
    } else if (entities.wantsAdvice) {
      intent = "decisionSupport";
      confidence = 0.9;
    } else if (entities.pendingOnly) {
      intent = "communicationIntelligence";
      confidence = 0.9;
    } else if (asksAboutSpecificDonor && asksAboutDonation) {
      intent = "donorIntelligence";
      confidence = 0.92;
    } else if (isProjectStatus) {
      intent = "projectIntelligence";
      confidence = 0.9;
    } else if (queryLower.includes("allocate") || queryLower.includes("split") || queryLower.includes("distribution")) {
      intent = "allocateDonation";
      confidence = 0.95;
    } else if (
      (queryLower.includes("publish") || queryLower.includes("log") || queryLower.includes("post")) &&
      (queryLower.includes("update") || queryLower.includes("milestone") || queryLower.includes("progress"))
    ) {
      intent = "publishUpdate";
      confidence = 0.95;
    } else if (queryLower.includes("certificate") || queryLower.includes("exemption") || queryLower.includes("80g")) {
      intent = "generateCertificates";
      confidence = 0.9;
    } else if (queryLower.includes("dispatch") || queryLower.includes("send all") || queryLower.includes("approve queue")) {
      intent = "dispatchCommunications";
      confidence = 0.95;
    } else if (queryLower.includes("compliance") || queryLower.includes("audit") || queryLower.includes("verify ledger")) {
      intent = "reviewCompliance";
      confidence = 0.95;
    } else if (
      queryLower.includes("report") ||
      queryLower.includes("statement") ||
      (queryLower.includes("briefing") && !isProjectStatus)
    ) {
      intent = "generateReport";
      confidence = 0.9;
      if (queryLower.includes("board")) entities.reportType = "board";
      else if (queryLower.includes("monthly")) entities.reportType = "monthly";
      else if (queryLower.includes("annual")) entities.reportType = "annual";
      else if (queryLower.includes("compliance")) entities.reportType = "compliance";
    } else if (
      queryLower.includes("why did") ||
      queryLower.includes("why are") ||
      queryLower.includes("drop") ||
      queryLower.includes("falling") ||
      queryLower.includes("decrease") ||
      queryLower.includes("root cause")
    ) {
      intent = "investigations";
      confidence = 0.92;
    } else if (entities.timeframe && (queryLower.includes("detail") || queryLower.includes("share") || queryLower.includes("show"))) {
      intent = "donationSearch";
      confidence = 0.88;
    } else if (asksAboutDonation || queryLower.includes("money") || queryLower.includes("raise") || queryLower.includes("received") || queryLower.includes("funds")) {
      intent = entities.donorName ? "donorIntelligence" : "donationSearch";
      confidence = 0.85;
    } else if (
      queryLower.includes("project") ||
      queryLower.includes("program") ||
      queryLower.includes("milestone") ||
      queryLower.includes("education") ||
      queryLower.includes("orphan") ||
      queryLower.includes("masjid")
    ) {
      intent = "projectIntelligence";
      confidence = 0.85;
    } else if (queryLower.includes("email") || queryLower.includes("draft") || queryLower.includes("mail") || queryLower.includes("sent")) {
      intent = "communicationIntelligence";
      confidence = 0.85;
    } else if (queryLower.includes("donor") || queryLower.includes("customer") || queryLower.includes("crm") || queryLower.includes("contributor")) {
      intent = "donorIntelligence";
      confidence = 0.85;
    } else if (queryLower.includes("rule") || queryLower.includes("policy") || queryLower.includes("bylaw") || queryLower.includes("knowledge")) {
      intent = "knowledgeSearch";
      confidence = 0.8;
    } else if (queryLower.includes("beneficiary") || queryLower.includes("beneficiaries")) {
      intent = "beneficiaryIntelligence";
      confidence = 0.85;
    } else if (queryLower.includes("volunteer") || queryLower.includes("staff")) {
      intent = "volunteerIntelligence";
      confidence = 0.85;
    } else if (queryLower.includes("finance") || queryLower.includes("financials") || queryLower.includes("balance sheet")) {
      intent = "financialIntelligence";
      confidence = 0.85;
    } else if (queryLower.includes("campaign") || queryLower.includes("marketing") || queryLower.includes("fundraiser")) {
      intent = "campaignIntelligence";
      confidence = 0.85;
    } else if (queryLower.includes("governance") || queryLower.includes("board of directors")) {
      intent = "governance";
      confidence = 0.85;
    } else if (queryLower.includes("public ledger") || queryLower.includes("open data")) {
      intent = "publicLedger";
      confidence = 0.85;
    } else if (queryLower.includes("analytics") || queryLower.includes("metrics") || queryLower.includes("dashboard")) {
      intent = "analytics";
      confidence = 0.85;
    } else if (queryLower.includes("investigate")) {
      intent = "investigations";
      confidence = 0.9;
    } else if (queryLower.includes("should we") || queryLower.includes("advise") || queryLower.includes("decision")) {
      intent = "decisionSupport";
      confidence = 0.9;
    } else if (queryLower.includes("strategy") || queryLower.includes("strategic plan") || queryLower.includes("brainstorm")) {
      intent = "strategicPlanning";
      confidence = 0.9;
    } else if (queryLower.includes("history") || queryLower.includes("past memory") || queryLower.includes("what happened in")) {
      intent = "organizationalMemory";
      confidence = 0.85;
    } else if (
      queryLower.includes("grok") ||
      queryLower.includes("prompt") ||
      (queryLower.includes("system") && queryLower.includes("config")) ||
      queryLower.includes("database") ||
      queryLower.includes("password") ||
      (queryLower.includes("permission") && queryLower.includes("role"))
    ) {
      intent = "administration";
      confidence = 0.95;
    } else if (
      queryLower.includes("who are you") ||
      queryLower.includes("what are you") ||
      queryLower.includes("khidr") ||
      queryLower.includes("ai tos") ||
      queryLower.includes("ai-tos") ||
      (queryLower.includes("why was") && queryLower.includes("created")) ||
      (queryLower.includes("what is") && queryLower.includes("daarayn"))
    ) {
      intent = "chat";
      confidence = 0.95;
    }

    return { intent, confidence, entities };
  }
}
