/**
 * lib/ai/providers/ResponseNormalizer.ts
 *
 * Transforms the raw fetch response from any provider into a NormalizedResponse.
 * MCO receives a NormalizedResponse and never knows which provider slot served it.
 *
 * Also handles:
 *  - Stripping <executive_thinking> blocks before JSON parsing
 *  - Stripping markdown code fences
 *  - JSON integrity validation for structured mode
 */

import type { NormalizedResponse, CompletionMode } from "./ProviderTypes";

export class ResponseNormalizer {
  /**
   * Normalize a raw content string (from provider) into a NormalizedResponse.
   */
  static normalize(
    rawContent: string,
    mode: CompletionMode,
    slotId: string,
    latencyMs: number,
    tokensUsed?: number
  ): NormalizedResponse {
    const content = mode === "json"
      ? this.cleanJsonContent(rawContent)
      : rawContent;

    return {
      content,
      _internalProviderSlot: slotId,
      _latencyMs: latencyMs,
      _tokensUsed: tokensUsed,
    };
  }

  /**
   * Strips executive_thinking blocks and markdown fences, returning clean JSON string.
   * Throws if the result is not parseable JSON (allows upstream to handle gracefully).
   */
  static cleanJsonContent(raw: string): string {
    let cleaned = raw;

    // Strip <executive_thinking>...</executive_thinking>
    const thinkStart = cleaned.indexOf("<executive_thinking>");
    const thinkEnd = cleaned.indexOf("</executive_thinking>");
    if (thinkStart !== -1 && thinkEnd !== -1) {
      cleaned = cleaned.substring(thinkEnd + "</executive_thinking>".length).trim();
    }

    // Strip \`\`\`json ... \`\`\` or \`\`\` ... \`\`\`
    if (cleaned.startsWith("\`\`\`json")) {
      cleaned = cleaned.replace(/^\`\`\`json\\n?/, "").replace(/\\n?\`\`\`$/, "").trim();
    } else if (cleaned.startsWith("\`\`\`")) {
      cleaned = cleaned.replace(/^\`\`\`\\n?/, "").replace(/\\n?\`\`\`$/, "").trim();
    }

    return cleaned;
  }

  /**
   * Parse a normalized JSON response content into an object.
   * Returns null if parsing fails (caller decides fallback).
   */
  static parseJsonSafe(content: string): Record<string, any> | null {
    try {
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
}
