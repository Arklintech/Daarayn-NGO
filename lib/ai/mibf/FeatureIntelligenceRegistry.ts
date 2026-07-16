/**
 * lib/ai/mibf/FeatureIntelligenceRegistry.ts
 * 
 * Defines Daarayn's enterprise features, capabilities, and recommendation conditions.
 * Teaches MOMIN the business value and context of every organizational module.
 */

export interface DaaraynFeature {
  id: string;
  name: string;
  purpose: string;
  businessValue: string;
  typicalAdministratorQuestions: string[];
  operationalContext: string;
  recommendedFollowUpActions: string[];
  permissions: string[];
  dependencies: string[];
  whenToRecommend: string;
  whenToAvoid: string;
  expectedConversationStyle: string;
  edgeCases: string[];
  failureHandling: string;
  relatedWorkflows: string[];
  administratorGoals: string[];
  examples: string[];
}

export const FeatureRegistry: Record<string, DaaraynFeature> = {
  DonorsCRM: {
    id: "DonorsCRM",
    name: "Donors CRM",
    purpose: "Manage donor profiles, transaction histories, and communication logs.",
    businessValue: "Builds and protects long-term donor relationships through organized stewardship.",
    typicalAdministratorQuestions: [
      "Who is our top donor?",
      "What is the communication history with donor X?",
      "Which donors are currently inactive?"
    ],
    operationalContext: "Acts as the single source of truth for all external stakeholder interactions and lifetime value tracking.",
    recommendedFollowUpActions: [
      "Send a personalized acknowledgment for recent large contributions.",
      "Re-engage donors who haven't contributed in over a year.",
      "Review communication logs for upcoming donor anniversaries."
    ],
    permissions: ["admin", "super_admin", "finance"],
    dependencies: ["Firestore (users collection)", "Stripe/Payment Gateway"],
    whenToRecommend: "When the administrator needs to view a specific donor's history, understand donor engagement, or update contact information.",
    whenToAvoid: "When asking for aggregate financial metrics (use Analytics instead).",
    expectedConversationStyle: "Warm, respectful, and stewardship-focused. Emphasize the impact of the donor's contributions.",
    edgeCases: ["Anonymous donors", "Duplicate donor profiles", "Failed payments"],
    failureHandling: "If a donor cannot be found, ask for an email or transaction ID to clarify.",
    relatedWorkflows: ["Drafting thank-you emails", "Generating 80G tax certificates"],
    administratorGoals: ["Stewardship", "Dispute resolution", "Compliance verification"],
    examples: ["Ahmed Khan is our top donor, having contributed ₹100,000 across 5 transactions. Would you like me to draft a personalized thank-you message?"]
  },
  AllocationCenter: {
    id: "AllocationCenter",
    name: "Allocation Center",
    purpose: "Distribute unrestricted funds to underfunded programs and verify Zakat compliance.",
    businessValue: "Ensures financial resources are deployed swiftly and compliantly to areas of greatest need.",
    typicalAdministratorQuestions: [
      "Which campaigns need funding right now?",
      "Can we allocate unrestricted funds to the Masjid project?",
      "Is this allocation Zakat compliant?"
    ],
    operationalContext: "The critical financial routing hub connecting unallocated donations to specific humanitarian projects.",
    recommendedFollowUpActions: [
      "Review the project's updated funding progress after allocation.",
      "Notify the project manager that funds have been secured."
    ],
    permissions: ["super_admin", "finance"],
    dependencies: ["Firestore (allocations, campaigns)", "VerifiedAnalyticsEngine"],
    whenToRecommend: "When funds need to be moved to a specific campaign, or a campaign is struggling to meet its target.",
    whenToAvoid: "When just viewing high-level project status without financial action.",
    expectedConversationStyle: "Precise, compliant, and operational. Focus on numbers, eligibility, and execution.",
    edgeCases: ["Allocating more than the remaining gap", "Allocating restricted funds to the wrong category"],
    failureHandling: "If an allocation exceeds available funds, block the action and inform the administrator of the maximum allowable amount.",
    relatedWorkflows: ["Board reporting", "Zakat audits"],
    administratorGoals: ["Ensuring campaign success", "Financial compliance", "Fund utilization"],
    examples: ["We currently have ₹50,000 in unrestricted funds. The Orphan Care project has a funding gap of ₹20,000. Should I allocate funds to close this gap?"]
  },
  ProjectsHub: {
    id: "ProjectsHub",
    name: "Projects Hub & Programs",
    purpose: "Manage long-term programs and specific relief campaigns.",
    businessValue: "Tracks the actual on-the-ground impact and funding status of Daarayn's humanitarian missions.",
    typicalAdministratorQuestions: [
      "What are our active programs and how are they funded?",
      "How close is the Orphan Care project to its goal?",
      "Which projects have the largest remaining gaps?"
    ],
    operationalContext: "The central tracker for all initiatives requiring funding, milestone tracking, and beneficiary assignment.",
    recommendedFollowUpActions: [
      "Consider reallocating funds to projects with critical gaps.",
      "Publish a milestone update to donors who contributed to fully funded projects."
    ],
    permissions: ["admin", "super_admin", "programs_manager"],
    dependencies: ["Firestore (campaigns)"],
    whenToRecommend: "When the administrator wants to check the status of a specific initiative or understand the overall funding landscape.",
    whenToAvoid: "When executing a financial transfer (use Allocation Center).",
    expectedConversationStyle: "Clear, impact-driven, and structured. Highlight progress percentages and funding gaps.",
    edgeCases: ["Overfunded projects", "Projects with no recent caretaker updates"],
    failureHandling: "If a requested project does not exist, list the 3 most recently active projects instead.",
    relatedWorkflows: ["Publishing public updates", "Allocating funds"],
    administratorGoals: ["Monitoring field impact", "Identifying funding needs", "Reporting to board"],
    examples: ["The Masjid Al-Noor Construction is currently 76% funded, having collected ₹492,000 of its ₹650,000 target."]
  },
  ContentCMS: {
    id: "ContentCMS",
    name: "Content CMS & Media Library",
    purpose: "Manage public-facing website content, blog posts, and marketing assets.",
    businessValue: "Controls the public narrative, ensuring transparency and inspiring future donations.",
    typicalAdministratorQuestions: [
      "How do I update the homepage banner?",
      "Can we publish a news update about the recent food drive?"
    ],
    operationalContext: "The bridge between internal operations and public transparency.",
    recommendedFollowUpActions: [
      "Draft an email newsletter linking to the newly published content.",
      "Review the media library for outdated assets."
    ],
    permissions: ["admin", "super_admin", "marketing"],
    dependencies: ["Firebase Storage", "Firestore (content)"],
    whenToRecommend: "When the user wants to publish a story, share an update with the public, or manage visual assets.",
    whenToAvoid: "For internal operational or financial updates.",
    expectedConversationStyle: "Creative, engaging, and brand-aligned.",
    edgeCases: ["Missing images", "Broken links", "Unapproved drafts"],
    failureHandling: "If a requested media asset is missing, suggest checking the 'Uncategorized' folder or uploading a new file.",
    relatedWorkflows: ["Campaign marketing", "Newsletters"],
    administratorGoals: ["Public transparency", "Donor acquisition", "Brand management"],
    examples: ["I can help you draft a public update for the Food Drive. Would you like me to pull the latest photos from the media library to include?"]
  },
  Analytics: {
    id: "Analytics",
    name: "Verified Analytics",
    purpose: "Provide aggregate financial and operational metrics.",
    businessValue: "Delivers the high-level insights required for executive decision-making and strategic planning.",
    typicalAdministratorQuestions: [
      "What is the total amount donated to Daarayn?",
      "How many unique donors do we have?",
      "What is our average donation size?"
    ],
    operationalContext: "The macro-level view of organizational health, processing raw ledger data into actionable metrics.",
    recommendedFollowUpActions: [
      "Drill down into specific donor profiles contributing to major metrics.",
      "Review underperforming campaigns."
    ],
    permissions: ["super_admin", "finance", "admin"],
    dependencies: ["VerifiedAnalyticsEngine", "Firestore (donations)"],
    whenToRecommend: "When the administrator asks broad questions about organizational performance or totals.",
    whenToAvoid: "When investigating a single specific transaction or donor.",
    expectedConversationStyle: "Authoritative, data-driven, and executive. Present metrics naturally in complete sentences.",
    edgeCases: ["Zero donations in a timeframe", "Currency conversion issues"],
    failureHandling: "If analytics engine times out or fails, inform the administrator that aggregate data is temporarily unavailable and suggest checking specific campaigns.",
    relatedWorkflows: ["Board reporting", "Annual reports", "Performance reviews"],
    administratorGoals: ["Strategic planning", "Performance tracking", "Financial oversight"],
    examples: ["Daarayn has received a total of ₹237,001 across 16 transactions from 11 unique donors."]
  }
};

export class FeatureIntelligenceRegistry {
  static getFeatureContext(featureIds?: string[]): string {
    const features = featureIds 
      ? featureIds.map(id => FeatureRegistry[id]).filter(Boolean)
      : Object.values(FeatureRegistry);

    return features.map(f => `
[FEATURE: ${f.name}]
Purpose: ${f.purpose}
Business Value: ${f.businessValue}
Typical Questions: ${f.typicalAdministratorQuestions.join(" | ")}
Operational Context: ${f.operationalContext}
Recommended Follow-ups: ${f.recommendedFollowUpActions.join(" | ")}
Permissions Required: ${f.permissions.join(", ")}
Dependencies: ${f.dependencies.join(", ")}
Recommend When: ${f.whenToRecommend}
DO NOT Recommend When: ${f.whenToAvoid}
Expected Style: ${f.expectedConversationStyle}
Administrator Goals: ${f.administratorGoals.join(", ")}
Related Workflows: ${f.relatedWorkflows.join(", ")}
Edge Cases: ${f.edgeCases.join(", ")}
Failure Handling: ${f.failureHandling}
Examples: ${f.examples.join("\n")}
    `.trim()).join("\n\n");
  }
}
