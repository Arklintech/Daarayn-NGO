import Fuse from "fuse.js";
import { LRUCache } from "lru-cache";
import { db } from "../../firebase";
import { collection, getDocs } from "firebase/firestore";

interface OrgEntity {
  id: string;
  name: string;
  type: "project" | "donor" | "campaign";
  aliases: string[];
}

// Cache to prevent hitting Firestore on every request
const entityCache = new LRUCache<string, OrgEntity[]>({ max: 1, ttl: 1000 * 60 * 60 }); // 1 hour cache

export class OrganizationalEntityResolver {
  
  private static async getEntities(): Promise<OrgEntity[]> {
    if (entityCache.has("entities")) {
      return entityCache.get("entities")!;
    }

    const entities: OrgEntity[] = [];

    try {
      // Fetch Projects
      const projectsSnap = await getDocs(collection(db, "projects"));
      projectsSnap.forEach(doc => {
        const data = doc.data();
        entities.push({
          id: doc.id,
          name: data.name || doc.id,
          type: "project",
          aliases: data.name ? data.name.toLowerCase().split(" ") : []
        });
      });

      // Fetch Donors (In production, this would be a subset or indexed search, not all donors)
      const donorsSnap = await getDocs(collection(db, "donors"));
      donorsSnap.forEach(doc => {
        const data = doc.data();
        entities.push({
          id: doc.id,
          name: data.name || doc.id,
          type: "donor",
          aliases: data.name ? data.name.toLowerCase().split(" ") : []
        });
      });

      // Add static/known campaigns or aliases
      entities.push({ id: "ramadan_2026", name: "Ramadan Campaign 2026", type: "campaign", aliases: ["ramadan", "ramzan", "fasting"] });
      entities.push({ id: "eid_2026", name: "Eid Relief 2026", type: "campaign", aliases: ["eid", "qurbani", "bakrid"] });
      
    } catch (e) {
      console.warn("[HCIE] Entity Resolver could not fetch from Firestore, using fallback.", e);
      // Fallback entities
      entities.push({ id: "DA001", name: "Family Relief Bundle", type: "project", aliases: ["family", "relief", "food"] });
      entities.push({ id: "DA002", name: "Orphan Sponsorship", type: "project", aliases: ["orphan", "children", "education"] });
      entities.push({ id: "D1", name: "Abdul Rahman Khan", type: "donor", aliases: ["abdul", "rahman", "khan"] });
    }

    entityCache.set("entities", entities);
    return entities;
  }

  /**
   * Identifies ambiguous entities in the message and replaces them with their 
   * verified, formal organizational name using fuzzy search.
   */
  static async resolve(message: string): Promise<{ resolvedMessage: string, extractedEntities: string[] }> {
    const isAnalyticalQuery =
      message.split(/\s+/).length > 14 ||
      /\b(strategic|operational|organizational|investigate|analyze|brief\s+me|board\s+of\s+trustees|coo\b|worried|patterns|recommend|executive\s+attention|30\s+days|chief\s+operating|requires?\s+my\s+attention|start\s+my\s+day)\b/i.test(
        message
      );

    if (isAnalyticalQuery) {
      return { resolvedMessage: message, extractedEntities: [] };
    }

    const entities = await this.getEntities();
    
    // Setup Fuse
    const fuse = new Fuse(entities, {
      keys: ["name", "aliases"],
      threshold: 0.3, // Strict enough to avoid false positives
      includeScore: true
    });

    let resolvedMessage = message;
    const extractedEntities: string[] = [];

    // Simple heuristic: extract name-like tokens (3+ chars) to check against Fuse
    const tokens = message.split(/\s+/).filter(t => t.replace(/[^a-zA-Z0-9]/g, "").length >= 3);

    // To prevent checking common words, we only replace if there is a very strong match
    // and the word isn't a common English stopword.
    const stopWords = [
      "show", "please", "what", "how", "much", "many", "project", "donor", "campaign", "status", "report", "the", "for", "and",
      "operational", "organizational", "strategic", "actions", "recommend", "improve", "health", "attention", "board",
      "trustees", "investigate", "analyze", "patterns", "chief", "officer", "days", "next", "base", "executive", "worried",
      "something", "probably", "thought", "prepare", "concise", "suitable", "presenting", "performance", "achievements",
      "priorities", "risks", "highlights", "ongoing", "immediate", "everything", "prioritize", "critical", "approvals",
    ];

    for (const token of tokens) {
      const cleanToken = token.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
      if (stopWords.includes(cleanToken)) continue;

      const results = fuse.search(cleanToken);
      if (results.length > 0 && results[0].score! <= 0.15) { // Highly confident match only
        const bestMatch = results[0].item;
        
        // Only extract donor-type entities for replacement
        if (bestMatch.type !== "donor" && bestMatch.type !== "project") continue;
        if (!resolvedMessage.toLowerCase().includes(bestMatch.name.toLowerCase())) {
          const regex = new RegExp(`\\b${cleanToken}\\b`, "gi");
          resolvedMessage = resolvedMessage.replace(regex, bestMatch.name);
          extractedEntities.push(bestMatch.name);
        }
      }
    }

    return { resolvedMessage, extractedEntities };
  }
}
