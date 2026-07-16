/**
 * lib/ai/validator.ts
 *
 * Validation Engine for the Daarayn Trust Intelligence Engine.
 * Verifies that AI outputs match constraints, checks formatting, identifies potential hallucinations,
 * and calculates AI Quality scores.
 */

import type { AIResponsePayload } from "./providerManager";

export interface AIQualityScore {
  accuracy: number;        // 0-10
  grammar: number;         // 0-10
  readability: number;     // 0-10
  tone: number;            // 0-10
  transparency: number;    // 0-10
  personalization: number; // 0-10
  overall: number;         // 0-10
}

export interface ValidationReport {
  isValid: boolean;
  errors: string[];
  qualityScore: AIQualityScore;
}

const FORBIDDEN_WORDS = [
  "approximately",
  "estimated",
  "around",
  "we estimate",
  "we hope to support",
  "maybe",
  "probably",
  "roughly",
  "about",
];

/**
 * Validate and score a generated communication payload
 */
export function validateResponse(
  payload: AIResponsePayload,
  donorName?: string
): ValidationReport {
  const errors: string[] = [];

  // 1. Structure Verification
  const requiredKeys = ["subject", "preview", "greeting", "body", "dua", "cta", "footer"];
  requiredKeys.forEach((key) => {
    if (!payload[key] || typeof payload[key] !== "string" || payload[key].trim() === "") {
      errors.push(`Missing or empty required field: "${key}"`);
    }
  });

  // 2. Formatting constraints
  if (payload.subject && payload.subject.length > 150) {
    errors.push("Subject exceeds maximum length of 150 characters.");
  }
  if (payload.preview && payload.preview.length > 250) {
    errors.push("Preview snippet exceeds maximum length of 250 characters.");
  }

  // 3. Hallucination / Forbidden terms detection
  const fullContentText = `${payload.subject} ${payload.preview} ${payload.body}`.toLowerCase();
  FORBIDDEN_WORDS.forEach((word) => {
    if (fullContentText.includes(word)) {
      errors.push(`Hallucination warning: Content contains speculation or unverified estimation keyword "${word}".`);
    }
  });

  // 4. Calculate quality scores
  let accuracyScore = 10;
  if (payload.confidenceScore < 100) {
    accuracyScore = Math.max(1, Math.round(payload.confidenceScore / 10));
  }
  if (errors.some((e) => e.includes("Hallucination"))) {
    accuracyScore = Math.max(1, accuracyScore - 3);
  }

  // Personalization score: check if the donor name is placed correctly in greeting or body
  let personalizationScore = 5;
  if (donorName) {
    const greetingMatches = payload.greeting.includes(donorName);
    const bodyMatches = payload.body.includes(donorName);
    if (greetingMatches || bodyMatches) {
      personalizationScore = 10;
    } else {
      personalizationScore = 7; // partially personalized
    }
  }

  const grammarScore = 9; // baseline
  const readabilityScore = payload.body.length > 150 ? 9 : 10;
  const toneScore = payload.body.toLowerCase().includes("jazakallah") || payload.body.toLowerCase().includes("assalamu") ? 10 : 8;
  const transparencyScore = payload.body.includes("₹") || payload.body.includes("INR") || payload.body.includes("allocated") ? 10 : 8;

  const overall = Math.round(
    (accuracyScore + grammarScore + readabilityScore + toneScore + transparencyScore + personalizationScore) / 6
  );

  const qualityScore: AIQualityScore = {
    accuracy: accuracyScore,
    grammar: grammarScore,
    readability: readabilityScore,
    tone: toneScore,
    transparency: transparencyScore,
    personalization: personalizationScore,
    overall: overall,
  };

  return {
    isValid: errors.length === 0,
    errors,
    qualityScore,
  };
}
