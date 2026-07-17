/**
 * lib/ai/eoas/ExecutiveBriefingEngine.ts
 * 
 * Uses Grok as a Natural Language Generation layer to format the deterministic
 * EOAS intelligence into an Executive Briefing and Work Queue.
 */

import { generateRawWithGrok } from "../grok";
import type { OrganizationalSignals } from "./ExecutiveAwarenessEngine";
import type { OrganizationalHealthReport } from "./OrganizationalHealthIntelligence";
import type { OrganizationalMemory } from "./OrganizationalMemoryEngine";
import type { StrategicIntelligence } from "./StrategicIntelligenceEngine";

export class ExecutiveBriefingEngine {
  
  static async draftBriefing(
    role: string,
    signals: OrganizationalSignals,
    health: OrganizationalHealthReport,
    memory: OrganizationalMemory,
    strategy: StrategicIntelligence
  ): Promise<string> {
    
    const systemPrompt = `
You are KHIDR, Daarayn's Executive Operations Officer.
You are delivering the Daily Executive Briefing to a human Administrator (${role}).

Your tone must be: Executive, Natural, Professional, Warm, Respectful, Actionable.
Do NOT sound like a chatbot.
Do NOT use markdown headers like ###. Use bold text and bullet points cleanly.

You have been provided with deterministic Organizational Intelligence.
You must synthesize this intelligence into an executive briefing that answers:
1. What changed?
2. Why does it matter?
3. What should leadership consider?
4. What actions deserve priority?

FORMAT REQUIREMENTS:
1. "Good Morning / Assalamu Alaikum [Role],"
2. Executive Summary (2 sentences max)
3. Organizational Health Overview (Very brief, mention overall score out of 100)
4. Strategic Risks & Opportunities
5. The Executive Work Queue (A prioritized list of 3-5 immediate actions they should take today, based ONLY on the provided intelligence).

Rules:
- Never hallucinate data. Only use the provided intelligence.
- Never expose internal system names like "EOAS", "EAE", "SORI".
- Present the intelligence naturally.
    `.trim();

    const userPrompt = `
[ROLE]
${role}

[ORGANIZATIONAL HEALTH OVERVIEW]
Overall Score: ${health.overallScore}/100
Domain Breakdown:
${health.assessments.map(a => `- ${a.domain}: ${a.healthScore}/100 (Priority: ${a.suggestedPriorityLevel})
  Concerns: ${a.areasOfConcern.join(" ")}
  Positives: ${a.positiveIndicators.join(" ")}`).join("\n")}

[ORGANIZATIONAL MEMORY & SEASONALITY]
Seasonality: ${memory.timeframe.seasonality}
Recent Highlights: ${memory.timeframe.yesterdayHighlights.join(" ")}
Week Trend: ${memory.timeframe.thisWeekTrend}

[STRATEGIC INTELLIGENCE (SORI)]
Risks:
${strategy.risks.map(r => `- ${r.title}: ${r.evidence}. Action: ${r.recommendedActions[0]}`).join("\n")}

Opportunities:
${strategy.opportunities.map(o => `- ${o.title}: ${o.evidence}. Action: ${o.recommendedActions[0]}`).join("\n")}

[RAW SIGNALS FOR CONTEXT]
Active Projects: ${signals.projects.activeProjects}
Projects <50% Funded: ${signals.projects.projectsBelow50PercentFunding}
Thank You Backlog: ${signals.communications.thankYouBacklog}
    `.trim();

    const briefingText = await generateRawWithGrok(systemPrompt, userPrompt, {
      temperature: 0.2, // Executive deterministic tone
      maxTokens: 1500,
      rawMode: true
    });

    return briefingText;
  }
}
