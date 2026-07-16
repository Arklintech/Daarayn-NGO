/**
 * lib/ai/engines/BlueprintEnforcer.ts
 *
 * Task 1 — Hard enforcement filter.
 * Runs after Grok generates, before serialization to the client.
 * This is a deterministic DELETE — not a prompt instruction the model can ignore.
 */

import type { ResponseStrategy } from "./ResponseStrategyLayer";

const ALWAYS_HIDDEN_UNLESS_AUDIT = new Set([
  "erceMetadata","governanceTrace","executionDetails","executionTrace",
  "promptMetadata","developerDiagnostics","certificationLevel","certificationId",
  "repairsPerformed","pipelineStages","requestId","confidenceScore",
]);

export class BlueprintEnforcer {
  static enforceComponents(raw: Record<string,any>, strategy: ResponseStrategy): Record<string,any> {
    const allowed = new Set(strategy.allowedComponents);
    const filtered = { ...raw };
    if (filtered.components && typeof filtered.components === "object") {
      for (const key of Object.keys(filtered.components)) {
        if (!allowed.has(key)) delete filtered.components[key];
      }
    }
    if (strategy.mode !== "AUDIT") {
      for (const field of ALWAYS_HIDDEN_UNLESS_AUDIT) delete filtered[field];
    }
    return filtered;
  }

  static enforceReplyText(replyText: string, strategy: ResponseStrategy): string {
    if (strategy.mode === "AUDIT") return replyText;
    let cleaned = replyText;
    cleaned = cleaned.replace(/\n?---\s*\n+###\s*Verification Metadata[\s\S]*$/, "");
    cleaned = cleaned.replace(/> \[!NOTE\]\s*\n> This reply was generated directly from verified backend[\s\S]*?\n\n/g, "");
    cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();
    return cleaned;
  }

  static enforceJsonContract(json: Record<string,any>, strategy: ResponseStrategy): Record<string,any> {
    if (!json) return json;
    const { mode, depth } = strategy;
    if (mode === "INFORMATION" && depth === "MINIMAL") {
      return { executiveSummary: json.executiveSummary || "", verifiedFindings: [], operationalObservations: [], potentialActions: [] };
    }
    if (mode === "CREATION") {
      const fields = ["subject","preview","greeting","body","dua","cta","footer"];
      const out: Record<string,any> = {};
      for (const f of fields) { if (json[f]) out[f] = json[f]; }
      return Object.keys(out).length > 0 ? out : { executiveSummary: json.executiveSummary || "", verifiedFindings: [], operationalObservations: [], potentialActions: [] };
    }
    if (mode === "EXECUTIVE") {
      return { executiveSummary: json.executiveSummary || "", verifiedFindings: (json.verifiedFindings || []).slice(0,3), operationalObservations: [], potentialActions: (json.potentialActions || []).slice(0,2) };
    }
    if (strategy.suppressAnalytics && mode !== "ANALYSIS") {
      delete json.analyticsPanel; delete json.charts; delete json.kpis; delete json.trends;
    }
    if (strategy.suppressRecommendations) json.potentialActions = [];
    return json;
  }
}
