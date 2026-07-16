/**
 * lib/ai/mco/ExecutiveCapabilityRegistry.ts
 *
 * Permanent capabilities of Daarayn's Executive Intelligence Operating System.
 * Replaces generic Intent Classification. Questions map to capabilities.
 */

export type ExecutiveCapability =
  | "Donor Intelligence"
  | "Donation Intelligence"
  | "Financial Intelligence"
  | "Project Intelligence"
  | "Beneficiary Intelligence"
  | "Volunteer Intelligence"
  | "Campaign Intelligence"
  | "Email Intelligence"
  | "Communication Intelligence"
  | "Analytics Intelligence"
  | "Operational Intelligence"
  | "Governance Intelligence"
  | "Compliance Intelligence"
  | "Reporting Intelligence"
  | "Public Ledger Intelligence"
  | "Executive Briefings"
  | "Decision Support"
  | "Strategic Planning"
  | "Crisis Management"
  | "Investigations"
  | "Organizational Memory"
  | "Administration Intelligence"
  | "Document Intelligence"
  | "Unknown Domain";

export class ExecutiveCapabilityRegistry {
  
  /**
   * Evaluates a query to determine the primary executive capability required.
   * This operates without LLMs for speed and determinism.
   */
  static identifyCapability(message: string): ExecutiveCapability {
    const lower = message.toLowerCase();
    
    if (lower.includes("board") || lower.includes("strategy") || lower.includes("strategic")) {
      return "Strategic Planning";
    }
    if (lower.includes("brief") || lower.includes("morning") || lower.includes("status")) {
      return "Executive Briefings";
    }
    if (lower.includes("donor") || lower.includes("supporter") || lower.includes("contributor")) {
      return "Donor Intelligence";
    }
    if (lower.includes("donation") || lower.includes("payment") || lower.includes("fund")) {
      return "Donation Intelligence";
    }
    if (lower.includes("finance") || lower.includes("budget") || lower.includes("money") || lower.includes("expense")) {
      return "Financial Intelligence";
    }
    if (lower.includes("project") || lower.includes("well") || lower.includes("masjid")) {
      return "Project Intelligence";
    }
    if (lower.includes("beneficiary") || lower.includes("orphan") || lower.includes("family")) {
      return "Beneficiary Intelligence";
    }
    if (lower.includes("campaign") || lower.includes("appeal") || lower.includes("drive")) {
      return "Campaign Intelligence";
    }
    if (lower.includes("volunteer") || lower.includes("staff")) {
      return "Volunteer Intelligence";
    }
    if (lower.includes("compliance") || lower.includes("audit") || lower.includes("violation") || lower.includes("rule")) {
      return "Compliance Intelligence";
    }
    if (lower.includes("report") || lower.includes("summary")) {
      return "Reporting Intelligence";
    }
    if (lower.includes("email") || lower.includes("mail")) {
      return "Email Intelligence";
    }
    if (lower.includes("investigate") || lower.includes("why did") || lower.includes("what happened")) {
      return "Investigations";
    }
    if (lower.includes("ledger") || lower.includes("public record")) {
      return "Public Ledger Intelligence";
    }
    if (lower.includes("document") || lower.includes("pdf") || lower.includes("file")) {
      return "Document Intelligence";
    }
    
    // Default fallback
    return "Operational Intelligence";
  }
}
