import { franc } from "franc";

export type CommunicationMode = "Urgent Request" | "Investigation" | "Executive Reporting" | "Executive Analysis" | "Standard Inquiry" | "Chat" | "Data Retrieval";

export class CommunicationUnderstandingEngine {
  /**
   * Detects communication style and purpose.
   */
  static analyze(message: string): CommunicationMode {
    const lower = message.toLowerCase();

    // 1. Check for urgency
    if (lower.includes("urgent") || lower.includes("quickly") || lower.includes("asap") || lower.includes("immediate") || lower.includes("now")) {
      return "Urgent Request";
    }

    // 2. Check for investigation
    if (lower.includes("wrong") || lower.includes("error") || lower.includes("issue") || lower.includes("investigate") || lower.includes("why did") || lower.includes("check")) {
      return "Investigation";
    }

    // 3. Check for analysis
    if (lower.includes("why are") || lower.includes("trend") || lower.includes("falling") || lower.includes("increasing") || lower.includes("compare") || lower.includes("analysis") || lower.includes("reason")) {
      return "Executive Analysis";
    }

    // 4. Check for reporting
    if (lower.includes("report") || lower.includes("brief") || lower.includes("summary") || lower.includes("export") || lower.includes("board")) {
      return "Executive Reporting";
    }

    // 5. Check for data retrieval (numeric/record lookups)
    if (
      lower.includes("how much") || lower.includes("how many") ||
      lower.includes("total") || lower.includes("show me") ||
      lower.includes("list") || lower.includes("find") ||
      lower.includes("show all") || lower.includes("give me")
    ) {
      return "Data Retrieval";
    }

    // 6. Check for conversational, philosophical, or open-ended chat
    if (
      lower.includes("good morning") || lower.includes("good afternoon") || lower.includes("good evening") ||
      lower.includes("assalamu") || lower.includes("salam") ||
      lower.includes("brainstorm") || lower.includes("let's think") || lower.includes("ideas") ||
      lower.includes("convince me") || lower.includes("trustworthy") ||
      lower.includes("what worries") || lower.includes("worries") ||
      lower.includes("amanah") || lower.includes("explain") || lower.includes("what is") ||
      lower.includes("why was") || lower.includes("created") || lower.includes("mission") ||
      lower.includes("vision") || lower.includes("something is wrong") || lower.includes("i think") ||
      lower.includes("approve this") || lower.includes("should we") ||
      lower.includes("strategy") || lower.includes("retention") || lower.includes("engage") ||
      lower.includes("philosophy") || lower.includes("meaning") || lower.includes("purpose")
    ) {
      return "Chat";
    }

    // Default
    return "Standard Inquiry";
  }

  /**
   * Detects the sentiment and emotional state of the administrator.
   */
  static detectSentiment(message: string): string {
    const lower = message.toLowerCase();
    
    if (lower.includes("urgent") || lower.includes("quick") || lower.includes("now") || lower.includes("emergency") || lower.includes("crisis")) {
      return "Crisis Mode";
    }
    
    if (lower.includes("brainstorm") || lower.includes("think") || lower.includes("idea") || lower.includes("strategy") || lower.includes("what if")) {
      return "Brainstorming";
    }
    
    if (lower.includes("alhamdulillah") || lower.includes("great") || lower.includes("success") || lower.includes("celebrate")) {
      return "Celebration";
    }
    
    if (lower.includes("curious") || lower.includes("wondering") || lower.includes("how does")) {
      return "Curiosity";
    }

    return "Neutral";
  }

  /**
   * Optional: Detect language using Franc.
   * If not english, we could flag it for translation in a future pipeline stage.
   */
  static detectLanguage(message: string): string {
    // franc returns a 3-letter language code (e.g., 'eng', 'urd', 'ara')
    // Requires minimum string length to be accurate, but provides basic support.
    if (message.length > 5) {
      return franc(message);
    }
    return 'eng';
  }
}
