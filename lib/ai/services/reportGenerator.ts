/**
 * lib/ai/services/reportGenerator.ts
 *
 * Annual and project impact report generation service.
 */

import { generateAIResponse } from "../providerManager";

export async function generateAnnualReportDraft(params: {
  year: number;
  totalRaised: number;
  projectsCount: number;
  beneficiariesCount: number;
}): Promise<string> {
  const systemPrompt = `
You are the Daarayn Trust Intelligence Engine Report Generator.
Draft a comprehensive, transparent, and factual executive summary for the Daarayn Annual Impact Report.
Ensure you state the exact figures provided without extrapolation.
`;

  const userPrompt = `
Year: ${params.year}
Total Funds Raised & Disbursed: INR ${params.totalRaised.toLocaleString()}
Total Programs Active: ${params.projectsCount}
Total Families / Beneficiaries Impacted: ${params.beneficiariesCount}
`;

  try {
    const response = await generateAIResponse(systemPrompt, userPrompt, {
      model: "grok-2-1212",
      temperature: 0.2,
    });
    
    if (typeof response === "object" && response !== null) {
      return response.body || response.subject || JSON.stringify(response);
    }
    return String(response);
  } catch (err) {
    console.error("[ReportGenerator] Failed to generate annual report:", err);
    return `Daarayn Annual Impact Report for ${params.year}. Active programs: ${params.projectsCount}, funds deployed: INR ${params.totalRaised.toLocaleString()}, impact: ${params.beneficiariesCount} beneficiaries.`;
  }
}
