import { HumanLanguageNormalizer } from "./HumanLanguageNormalizer";
import { HumanIntentDecoder } from "./HumanIntentDecoder";
import { ContextContinuityResolver } from "./ContextContinuityResolver";
import { OrganizationalEntityResolver } from "./OrganizationalEntityResolver";
import { HumanTimeIntelligence, TimeContext } from "./HumanTimeIntelligence";
import { CommunicationUnderstandingEngine, CommunicationMode } from "./CommunicationUnderstandingEngine";

export interface HCIEAnalysis {
  originalMessage: string;
  normalizedMessage: string;
  language: string;
  mode: CommunicationMode;
  sentiment: string;
  extractedEntities: string[];
  timeContexts: TimeContext[];
  processingMetadata: {
    durationMs: number;
    resolvedPronouns: boolean;
  };
}

export class HumanCommunicationIntelligenceEngine {
  /**
   * Translates messy, real-world human communication into structured enterprise understanding.
   * Runs BEFORE the Intent Classification Engine in the AI-TOS pipeline.
   */
  static async process(
    rawMessage: string, 
    userId: string
  ): Promise<HCIEAnalysis> {
    const startMs = Date.now();

    // 1. Communication Understanding
    const language = CommunicationUnderstandingEngine.detectLanguage(rawMessage);
    const mode = CommunicationUnderstandingEngine.analyze(rawMessage);
    const sentiment = CommunicationUnderstandingEngine.detectSentiment(rawMessage);

    // 2. Language Normalization
    const normalized = HumanLanguageNormalizer.normalize(rawMessage);

    // 3. Human Intent Decoding
    const decoded = HumanIntentDecoder.decode(normalized);

    // 4. Context Continuity Resolution
    const contextResolved = await ContextContinuityResolver.resolve(decoded, userId);
    const resolvedPronouns = contextResolved !== decoded;

    // 5. Organizational Entity Resolution
    const { resolvedMessage, extractedEntities } = await OrganizationalEntityResolver.resolve(contextResolved);

    // 6. Human Time Intelligence
    const { timeContexts } = HumanTimeIntelligence.extractTime(resolvedMessage);

    const durationMs = Date.now() - startMs;

    return {
      originalMessage: rawMessage,
      normalizedMessage: resolvedMessage,
      language,
      mode,
      sentiment,
      extractedEntities,
      timeContexts,
      processingMetadata: {
        durationMs,
        resolvedPronouns
      }
    };
  }
}
