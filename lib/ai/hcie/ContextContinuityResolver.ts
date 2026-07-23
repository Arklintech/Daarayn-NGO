import { db } from "../../firebase";
import { collection, query, where, orderBy, limit, getDocs } from "firebase/firestore";

export class ContextContinuityResolver {
  /**
   * Resolves conversational continuity by replacing pronouns/demonstratives
   * with actual entities from the user's previous conversation turn.
   */
  static async resolve(decodedMessage: string, userId: string): Promise<string> {
    const tokens = decodedMessage.toLowerCase().split(/\s+/);
    
    const pronouns = ["he", "him", "his", "she", "her", "they", "them", "their", "it", "this", "that", "previous", "last", "same"];
    const needsContext = tokens.some(token => pronouns.includes(token));
    
    if (!needsContext) return decodedMessage;

    try {
      const q = query(
        collection(db, "khizr_conversations_history"),
        where("userId", "==", userId),
        orderBy("timestamp", "desc"),
        limit(1)
      );
      
      const snap = await getDocs(q);
      if (snap.empty) return decodedMessage;

      const lastConv = snap.docs[0].data();
      
      // Try to extract the primary entity from the last conversation
      let contextEntity = "";
      
      // If the last response involved a donor
      if (lastConv.responsePlan?.responseContract === "DonorSummary") {
        contextEntity = lastConv.extractedFacts?.donorName || "the donor";
      } 
      // If the last response involved a project
      else if (lastConv.responsePlan?.responseContract === "ProjectSummary") {
        contextEntity = lastConv.extractedFacts?.projectName || "the project";
      }
      // If the last response involved a donation
      else if (lastConv.responsePlan?.responseContract === "DonationSummary") {
        contextEntity = "the donation";
      }
      else {
        // Fallback: use the entities from the last intent classification
        const lastEntities = lastConv.intentAnalysis?.entities;
        if (lastEntities && Object.keys(lastEntities).length > 0) {
          contextEntity = Object.values(lastEntities).join(" ");
        }
      }

      if (contextEntity) {
        // Append context to the query to ensure downstream deterministic engines catch it
        // e.g., "how much did he donate?" -> "how much did he donate? [Context: Abdul Rahman Khan]"
        return `${decodedMessage} [Context: ${contextEntity}]`;
      }

      return decodedMessage;
    } catch (e) {
      console.warn(`[HCIE] Failed to resolve context continuity for userId: ${userId}`, e);
      return decodedMessage;
    }
  }
}
