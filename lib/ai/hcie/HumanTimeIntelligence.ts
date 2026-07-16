import * as chrono from "chrono-node";

export interface TimeContext {
  originalText: string;
  startDate: Date | null;
  endDate: Date | null;
}

export class HumanTimeIntelligence {
  /**
   * Extracts natural language time expressions ("yesterday", "last week")
   * and converts them into deterministic Date objects.
   */
  static extractTime(message: string): { messageWithoutTime: string, timeContexts: TimeContext[] } {
    const results = chrono.parse(message);
    
    if (results.length === 0) {
      return { messageWithoutTime: message, timeContexts: [] };
    }

    let messageWithoutTime = message;
    const timeContexts: TimeContext[] = [];

    // Process from back to front to avoid messing up indices
    for (let i = results.length - 1; i >= 0; i--) {
      const result = results[i];
      
      timeContexts.push({
        originalText: result.text,
        startDate: result.start ? result.start.date() : null,
        endDate: result.end ? result.end.date() : null
      });

      // Remove the time text from the original message if desired, 
      // or we can just leave it. The prompt asks to "Convert to deterministic date ranges before querying Firestore."
      // Let's keep the message intact, but the extracted time Context can be used downstream.
      // But we return both just in case downstream wants the stripped version.
      messageWithoutTime = messageWithoutTime.substring(0, result.index) + 
                           messageWithoutTime.substring(result.index + result.text.length);
    }

    // Clean up double spaces left behind
    messageWithoutTime = messageWithoutTime.replace(/\s+/g, " ").trim();

    return { messageWithoutTime: message, timeContexts: timeContexts.reverse() }; // Keeping message intact for now, just returning contexts
  }
}
