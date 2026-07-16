/**
 * lib/ai/knowledge/intentEngine.ts
 *
 * Intent Detection Engine for MOMIN Knowledge Intelligence Engine (MKIE).
 * Classifies natural language prompts into target intelligence search categories.
 */

export type MominIntent =
  | "donationSearch"
  | "projectIntelligence"
  | "communicationIntelligence"
  | "donorIntelligence"
  | "complianceIntelligence"
  | "reportGenerator"
  | "knowledgeSearch"
  | "administration"
  | "globalSearch"
  | "executiveBriefing";

export interface IntentAnalysis {
  intent: MominIntent;
  confidence: number;
  entities: {
    donorName?: string;
    donorId?: string;
    programId?: string;
    donationId?: string;
    timeframe?: "today" | "week" | "month" | "year" | "all";
    numbers?: number[];
  };
}

/**
 * Parses user input to identify intelligence intent category and extract context variables.
 */
export async function detectIntent(message: string): Promise<IntentAnalysis> {
  const queryLower = message.toLowerCase();
  
  // Default fallback values
  let intent: MominIntent = "globalSearch";
  let confidence = 0.7;
  const entities: IntentAnalysis["entities"] = {};

  // Extract entities (simple regex)
  // Donor ID pattern: DNR-YYYY-XXXXXX
  const dnrMatch = message.match(/dnr-\d{4}-\d+/i);
  if (dnrMatch) entities.donorId = dnrMatch[0].toUpperCase();

  // Donation ID pattern: DON-YYYY-XXXXXX or similar
  const donMatch = message.match(/don-\d{4}-\d+/i) || message.match(/da\d+/i);
  if (donMatch) entities.donationId = donMatch[0].toUpperCase();

  // Timeframe checks
  if (queryLower.includes("today")) {
    entities.timeframe = "today";
  } else if (queryLower.includes("week")) {
    entities.timeframe = "week";
  } else if (queryLower.includes("month")) {
    entities.timeframe = "month";
  } else if (queryLower.includes("year")) {
    entities.timeframe = "year";
  }

  // Check specific names (like Ahmed Khan)
  if (queryLower.includes("ahmed") || queryLower.includes("khan")) {
    entities.donorName = "Ahmed Khan";
  } else if (queryLower.includes("sara") || queryLower.includes("ahmed")) {
    entities.donorName = "Sara Ahmed";
  }

  // Classification rules
  if (
    queryLower.includes("donation") || 
    queryLower.includes("money") || 
    queryLower.includes("raised") || 
    queryLower.includes("payment") ||
    queryLower.includes("split") ||
    queryLower.includes("received")
  ) {
    intent = "donationSearch";
    confidence = 0.95;
  } else if (
    queryLower.includes("project") || 
    queryLower.includes("program") || 
    queryLower.includes("milestone") || 
    queryLower.includes("progress") ||
    queryLower.includes("caretaker") ||
    queryLower.includes("kalyan") ||
    queryLower.includes("water")
  ) {
    intent = "projectIntelligence";
    confidence = 0.95;
  } else if (
    queryLower.includes("email") || 
    queryLower.includes("draft") || 
    queryLower.includes("mail") ||
    queryLower.includes("smtp") ||
    queryLower.includes("newsletter") ||
    queryLower.includes("sent") ||
    queryLower.includes("failed")
  ) {
    intent = "communicationIntelligence";
    confidence = 0.95;
  } else if (
    queryLower.includes("donor") || 
    queryLower.includes("customer") || 
    queryLower.includes("crm") || 
    entities.donorId || 
    entities.donorName
  ) {
    intent = "donorIntelligence";
    confidence = 0.90;
  } else if (
    queryLower.includes("receipt") || 
    queryLower.includes("compliance") || 
    queryLower.includes("verify") || 
    queryLower.includes("hallucination") ||
    queryLower.includes("audit") ||
    queryLower.includes("missing")
  ) {
    intent = "complianceIntelligence";
    confidence = 0.95;
  } else if (
    queryLower.includes("report") || 
    queryLower.includes("board") || 
    queryLower.includes("annual") || 
    queryLower.includes("monthly") ||
    queryLower.includes("summary")
  ) {
    intent = "reportGenerator";
    confidence = 0.95;
  } else if (
    queryLower.includes("rule") || 
    queryLower.includes("policy") || 
    queryLower.includes("bylaw") || 
    queryLower.includes("knowledge") ||
    queryLower.includes("guideline") ||
    queryLower.includes("faq")
  ) {
    intent = "knowledgeSearch";
    confidence = 0.90;
  } else if (
    queryLower.includes("brief") || 
    queryLower.includes("morning") || 
    queryLower.includes("status")
  ) {
    intent = "executiveBriefing";
    confidence = 0.95;
  } else if (
    queryLower.includes("grok") || 
    queryLower.includes("prompt") || 
    queryLower.includes("system") || 
    queryLower.includes("temperature") ||
    queryLower.includes("config")
  ) {
    intent = "administration";
    confidence = 0.95;
  }

  return {
    intent,
    confidence,
    entities
  };
}
