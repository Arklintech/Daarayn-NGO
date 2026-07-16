import nlp from "compromise";
import removeAccents from "remove-accents";
import { distance } from "fastest-levenshtein";

const domainDictionary = [
  "donor", "donors", "project", "projects", "campaign", "campaigns", 
  "donation", "donations", "zakat", "sadaqah", "lillah", "finance", 
  "compliance", "audit", "report", "reports", "executive", "message",
  "draft", "email"
];

const abbreviationMap: Record<string, string> = {
  "pls": "please",
  "plz": "please",
  "thx": "thanks",
  "info": "information",
  "proj": "project",
  "projs": "projects",
  "repo": "report",
  "asap": "urgent",
  "msg": "message",
  "u": "you",
  "r": "are",
  "req": "request",
  "docs": "documents",
  "doner": "donor",
  "compain": "campaign",
  "campain": "campaign"
};

export class HumanLanguageNormalizer {
  /**
   * Normalizes messy human text by expanding abbreviations, fixing typos for domain words,
   * handling contractions, and normalizing casing/punctuation.
   */
  static normalize(rawMessage: string): string {
    let text = rawMessage.trim();
    
    // 1. Remove Accents
    text = removeAccents(text);
    
    // 2. Expand abbreviations and apply Levenshtein correction for domain terms
    let words = text.split(/\s+/);
    words = words.map(word => {
      const cleanWord = word.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
      
      if (!cleanWord) return word;

      // Abbreviation Map
      if (abbreviationMap[cleanWord]) {
        return word.toLowerCase().replace(cleanWord, abbreviationMap[cleanWord]);
      }

      // Levenshtein domain correction (if distance is 1 or 2 depending on length)
      if (cleanWord.length > 4) {
        let bestMatch = cleanWord;
        let minDistance = Infinity;
        for (const term of domainDictionary) {
          const dist = distance(cleanWord, term);
          if (dist < minDistance && dist <= 2) {
            minDistance = dist;
            bestMatch = term;
          }
        }
        if (bestMatch !== cleanWord && minDistance <= (cleanWord.length > 5 ? 2 : 1)) {
          // Preserve original punctuation
          return word.toLowerCase().replace(cleanWord, bestMatch);
        }
      }

      return word;
    });
    
    text = words.join(" ");

    // 3. NLP Normalization via Compromise
    // E.g., Contractions (I'm -> I am)
    const doc = nlp(text);
    doc.contractions().expand();
    text = doc.text();

    // 4. Final Whitespace and Capitalization
    text = text.replace(/\s+/g, ' ').trim();
    if (text.length > 0) {
      text = text.charAt(0).toUpperCase() + text.slice(1);
    }
    
    return text;
  }
}
