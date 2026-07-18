/**
 * lib/ai/fields/translatorAgent.ts
 *
 * Translator Agent for Daarayn AI-TOS.
 * Translates texts to target languages (English, Arabic, Urdu, Hindi).
 */

import { translateText } from "../services/translator";

export class TranslatorAgent {
  public async translate(
    text: string,
    targetLanguage: "English" | "Arabic" | "Urdu" | "Hindi"
  ) {
    return translateText(text, targetLanguage);
  }
}
