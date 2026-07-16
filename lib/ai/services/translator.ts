/**
 * lib/ai/services/translator.ts
 *
 * Translation Service for the Daarayn Trust Intelligence Engine.
 */

import { generateAIResponse } from "../providerManager";

export async function translateText(
  text: string,
  targetLanguage: "English" | "Arabic" | "Urdu" | "Hindi"
): Promise<string> {
  const systemPrompt = `
You are the Daarayn Trust Intelligence Engine Translator.
Translate the input text accurately into ${targetLanguage}.
Maintain a professional, transparent, and compassionate tone.
Do not change facts, numbers, or references.
Output raw translated text only.
`;

  const userPrompt = `
Text to translate:
"""
${text}
"""
`;

  try {
    const response = await generateAIResponse(systemPrompt, userPrompt, {
      model: "grok-2-1212",
      temperature: 0.1,
    });

    if (typeof response === "object" && response !== null) {
      return response.body || response.subject || JSON.stringify(response);
    }
    return String(response);
  } catch (err) {
    console.error("[TranslatorService] Failed to translate:", err);
    return text; // fallback to original
  }
}
