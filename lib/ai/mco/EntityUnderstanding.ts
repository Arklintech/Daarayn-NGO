/**
 * lib/ai/mco/EntityUnderstanding.ts
 *
 * Understands entities independently of wording. 
 * Maps synonyms to canonical domain entities.
 */

export class EntityUnderstanding {
  
  /**
   * Normalizes words into standard Daarayn entities.
   */
  static extractPrimaryEntity(message: string): string | null {
    const lower = message.toLowerCase();
    
    if (lower.includes("donor") || lower.includes("supporter") || lower.includes("contributor") || lower.includes("recurring donor") || lower.includes("major donor")) {
      return "Donor Entity";
    }
    if (lower.includes("project") || lower.includes("projects") || lower.includes("well") || lower.includes("masjid")) {
      return "Project Entity";
    }
    if (lower.includes("beneficiary") || lower.includes("beneficiaries") || lower.includes("orphan") || lower.includes("family")) {
      return "Beneficiary Entity";
    }
    if (lower.includes("volunteer") || lower.includes("volunteers") || lower.includes("staff")) {
      return "Volunteer Entity";
    }
    if (lower.includes("finance") || lower.includes("financial") || lower.includes("budget") || lower.includes("money")) {
      return "Finance Entity";
    }
    if (lower.includes("communication") || lower.includes("communications") || lower.includes("email") || lower.includes("emails")) {
      return "Communication Entity";
    }
    if (lower.includes("report") || lower.includes("reports") || lower.includes("document") || lower.includes("documents")) {
      return "Report Entity";
    }
    if (lower.includes("campaign") || lower.includes("campaigns") || lower.includes("appeal")) {
      return "Campaign Entity";
    }
    if (lower.includes("task") || lower.includes("tasks") || lower.includes("todo")) {
      return "Task Entity";
    }
    if (lower.includes("administrator") || lower.includes("admin")) {
      return "Administrator Entity";
    }
    if (lower.includes("ledger") || lower.includes("public ledger")) {
      return "Public Ledger Entity";
    }
    
    return null;
  }
}
