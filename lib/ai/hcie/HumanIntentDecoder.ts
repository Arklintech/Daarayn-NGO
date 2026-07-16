export class HumanIntentDecoder {
  /**
   * Infers hidden intent, missing words, and decodes shorthand.
   * e.g., "education" -> "Show Education Project"
   */
  static decode(normalizedMessage: string): string {
    let decoded = normalizedMessage;
    const lower = decoded.toLowerCase();

    // Humans often use single words as commands
    const tokens = lower.split(/\s+/);
    if (tokens.length <= 3) {
      if (lower.includes("education") || lower.includes("water") || lower.includes("food") || lower.includes("orphan") || lower.includes("masjid")) {
        // Assume they are asking for a project status
        if (!lower.includes("show") && !lower.includes("get") && !lower.includes("status")) {
          decoded = `Show status for ${decoded} project`;
        }
      } else if (lower.includes("ramadan") || lower.includes("eid") || lower.includes("zakat")) {
        // Assume they are asking for a campaign status
        if (!lower.includes("show") && !lower.includes("get")) {
          decoded = `Show campaign ${decoded}`;
        }
      } else if (lower === "donors" || lower === "donor") {
        decoded = "Show donor list";
      } else if (lower === "report") {
        decoded = "Generate executive report";
      } else if (lower === "health" || lower === "briefing" || lower === "brief") {
        decoded = "Give me the executive briefing";
      }
    }

    return decoded;
  }
}
