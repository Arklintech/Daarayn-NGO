/**
 * lib/ai/eoas/EnterpriseMissionControl.ts
 * 
 * The Unified Executive Intelligence Layer.
 * Orchestrates Phase 6 subsystems: EAE -> OHI -> ETOM -> SORI
 * Generates the unified Executive Briefing via EBWQ.
 */

import { ExecutiveAwarenessEngine } from "./ExecutiveAwarenessEngine";
import { OrganizationalHealthIntelligence } from "./OrganizationalHealthIntelligence";
import { OrganizationalMemoryEngine } from "./OrganizationalMemoryEngine";
import { StrategicIntelligenceEngine } from "./StrategicIntelligenceEngine";
import { ExecutiveBriefingEngine } from "./ExecutiveBriefingEngine";

export class EnterpriseMissionControl {
  
  static async generateExecutiveBriefing(role: string): Promise<string> {
    console.log(`[EMC] Generating Executive Briefing for role: ${role}`);

    // 1. EAE: Extract Continuous Signals
    const signals = await ExecutiveAwarenessEngine.extractSignals(role);

    // 2. OHI: Calculate Health Scores
    const health = OrganizationalHealthIntelligence.evaluateHealth(signals);

    // 3. ETOM: Retrieve Organizational Memory & Seasonality
    const memory = OrganizationalMemoryEngine.getMemoryContext();

    // 4. SORI: Synthesize Strategic Risks and Opportunities
    const strategy = StrategicIntelligenceEngine.evaluateStrategy(health, memory);

    // 5. EBWQ: Generate the Final Executive Briefing (Natural Language)
    const briefingText = await ExecutiveBriefingEngine.draftBriefing(
      role,
      signals,
      health,
      memory,
      strategy
    );

    console.log(`[EMC] Executive Briefing generation complete.`);
    return briefingText;
  }
}
