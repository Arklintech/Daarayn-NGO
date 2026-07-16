/**
 * lib/ai/services/summarizer.ts
 *
 * AI Summarizer Service for condensing audit records, invoices, and updates.
 */

import { generateAIResponse } from "../providerManager";

export async function summarizeText(
  text: string,
  maxLength = 150
): Promise<string> {
  const systemPrompt = `
You are the Daarayn Trust Intelligence Engine Summarizer.
Your goal is to summarize the provided input text into a highly factual, professional, and transparent summary.
Do not extrapolate. Stick to the absolute facts.
Keep output length under ${maxLength} characters.
Output raw text only (JSON structure is NOT required for this specific summarizer).
`;

  const userPrompt = `
Text to summarize:
"""
${text}
"""
`;

  try {
    const response = await generateAIResponse(systemPrompt, userPrompt, {
      model: "grok-2-1212",
      temperature: 0.1,
    });
    
    // Check if the response matches normal string structure or custom JSON payload wrapper
    if (typeof response === "object" && response !== null) {
      return response.body || response.subject || JSON.stringify(response);
    }
    return String(response);
  } catch (err) {
    console.error("[SummarizerService] Failed to summarize:", err);
    return text.slice(0, maxLength); // fallback
  }
}
