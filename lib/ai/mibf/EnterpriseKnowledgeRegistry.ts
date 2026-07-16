/**
 * lib/ai/mibf/EnterpriseKnowledgeRegistry.ts
 * 
 * Central registry for Daarayn's organizational knowledge, policies, and principles.
 */

export interface KnowledgeEvolutionRecord {
  id: string;
  timestamp: string;
  intent: string;
  query: string;
  responseId: string;
  domain: string;
  administratorFeedback: "pending_review" | "positive" | "negative" | "correction";
  correctionDetails?: string;
  operationalLesson?: string;
  status: "pending_review" | "approved" | "rejected";
  scores?: {
    novelty: number;
    evidenceStrength: number;
    executiveValue: number;
    operationalImpact: number;
    confidence: number;
    reusability: number;
  };
}

export const EnterpriseKnowledge = {
  policies: [
    "Data Privacy Policy: Donor and Beneficiary data must never be exported to unverified third-party tools.",
    "Zakat Compliance: Zakat funds must only be allocated to verified eligible beneficiaries under the 8 categories.",
    "Sadaqah Lillah: General charity funds can be used for operational expenses or infrastructure.",
    "Audit Trail Policy: Every financial modification must generate an immutable audit log."
  ],
  sops: [
    "Beneficiary Verification SOP: Requires Government ID, Proof of Income, and local committee endorsement.",
    "Donation Refund SOP: Refunds are only processed for technical errors or duplicate charges within 7 days.",
    "Vendor Payment SOP: Requires a 3-way match (Purchase Order, Invoice, Goods Receipt) before release."
  ],
  islamicPrinciples: [
    "Amanah (Trust): Daarayn is a custodian of public funds. Transparency is paramount.",
    "Ihsan (Excellence): All operations should strive for the highest standard of quality and efficiency.",
    "Adl (Justice): Funds must be distributed equitably based on verified need, without prejudice."
  ],
  reportingStandards: [
    "Financial reports must separate Zakat, Sadaqah, and Lillah funds.",
    "Impact reports must highlight the number of families assisted and total funds disbursed.",
    "Executive dashboards must highlight any campaign falling below 50% funding after 30 days."
  ]
};

export class EnterpriseKnowledgeRegistry {
  static getKnowledgeContext(): string {
    return `
[ENTERPRISE POLICIES]
${EnterpriseKnowledge.policies.map(p => `- ${p}`).join("\n")}

[STANDARD OPERATING PROCEDURES]
${EnterpriseKnowledge.sops.map(p => `- ${p}`).join("\n")}

[ISLAMIC PRINCIPLES OF TRUST]
${EnterpriseKnowledge.islamicPrinciples.map(p => `- ${p}`).join("\n")}

[REPORTING STANDARDS]
${EnterpriseKnowledge.reportingStandards.map(p => `- ${p}`).join("\n")}
    `.trim();
  }
}
