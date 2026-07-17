/**
 * lib/ai/knowledge/router.ts
 *
 * AI Specialist Router for KHIDR Knowledge Intelligence Engine.
 * Directs parsed query intents to target specialist departments.
 */

import type { KhidrIntent } from "./intentEngine";

export type KhidrDepartment =
  | "executive"
  | "donation"
  | "project"
  | "communication"
  | "donor"
  | "compliance"
  | "report"
  | "knowledge"
  | "administration"
  | "global"
  | "analytics";

export interface RoutingDecision {
  department: KhidrDepartment;
  reason: string;
  collectionsRequired: string[];
}

/**
 * Routes classified intent to the appropriate intelligence department
 * and identifies the Firestore collections required to answer the query.
 */
export function routeToSpecialist(intent: KhidrIntent, query: string): RoutingDecision {
  const queryLower = query.toLowerCase();

  switch (intent) {
    case "donationSearch":
      return {
        department: "donation",
        reason: "Query references transaction details, payment splits, or total funds raised.",
        collectionsRequired: ["donations", "allocations"]
      };

    case "projectIntelligence":
      return {
        department: "project",
        reason: "Query references milestone progress, caretaker updates, or program categories.",
        collectionsRequired: ["programs"]
      };

    case "communicationIntelligence":
      return {
        department: "communication",
        reason: "Query references email templates, draft queue states, or SMTP configurations.",
        collectionsRequired: ["communications"]
      };

    case "donorIntelligence":
      return {
        department: "donor",
        reason: "Query references specific donor profiles, phone numbers, or lifetime support totals.",
        collectionsRequired: ["donors", "donations"]
      };

    case "complianceIntelligence":
      return {
        department: "compliance",
        reason: "Query references receipt audits, validation rules, or transaction split anomalies.",
        collectionsRequired: ["donations", "allocations", "publicLedger"]
      };

    case "reportGenerator":
      return {
        department: "report",
        reason: "Query requests compilation of monthly, quarterly, or board briefing summaries.",
        collectionsRequired: ["programs", "donations", "allocations"]
      };

    case "knowledgeSearch":
      return {
        department: "knowledge",
        reason: "Query references trust bylaws, FAQ sheets, or direct aid eligibility guidelines.",
        collectionsRequired: ["settings"] // settings/homepageCMS faq
      };

    case "administration":
      return {
        department: "administration",
        reason: "Query references LLM prompts, model configurations, or system control logs.",
        collectionsRequired: ["settings"]
      };

    case "executiveBriefing":
      return {
        department: "executive",
        reason: "Query requests an executive organizational briefing or status update.",
        collectionsRequired: ["donations", "programs", "communications", "allocations"]
      };

    case "globalSearch":
    default:
      // If references analytics
      if (queryLower.includes("analytic") || queryLower.includes("chart") || queryLower.includes("metric") || queryLower.includes("trend")) {
        return {
          department: "analytics",
          reason: "Query references comparative statistics or graphical representations.",
          collectionsRequired: ["donations", "communications"]
        };
      }
      return {
        department: "global",
        reason: "General search query addressing organization status or general statistics overview.",
        collectionsRequired: ["donations", "programs"]
      };
  }
}
