/**
 * lib/ai/mibf/OperationalPlaybookLibrary.ts
 * 
 * Defines standard operating procedures (SOPs) and workflow steps for Daarayn operations.
 */

export const OperationalPlaybooks: Record<string, string[]> = {
  DonorManagement: [
    "1. Identify the donor using email or phone number.",
    "2. Verify their lifetime contribution and active recurring plans.",
    "3. Review communication history for recent engagements.",
    "4. Determine if the donor requires a tax receipt or specific acknowledgement.",
    "5. Draft communications using the Donor Communication tone."
  ],
  CampaignManagement: [
    "1. Review the campaign's target amount versus collected funds.",
    "2. Assess the timeline and remaining days.",
    "3. Check for recent large donations that might require special acknowledgement.",
    "4. If underperforming, recommend a marketing push via Content CMS.",
    "5. If fully funded, initiate the closure and beneficiary allocation workflow."
  ],
  BeneficiaryManagement: [
    "1. Verify beneficiary identity and case details.",
    "2. Ensure all compliance documents (ID, proof of need) are uploaded.",
    "3. Check existing allocations to prevent double-funding.",
    "4. Request approval from the Allocation Center for new funds.",
    "5. Maintain absolute privacy; do not expose full names in public ledgers."
  ],
  DonationLifecycle: [
    "1. Donation received and recorded in Firestore.",
    "2. Payment gateway status verified (Success/Pending/Failed).",
    "3. Automated email receipt dispatched to donor.",
    "4. Funds reconciled with Allocation Center.",
    "5. Public Ledger updated (anonymized if requested)."
  ],
  ComplaintHandling: [
    "1. Acknowledge the complaint immediately and professionally.",
    "2. Do not offer excuses. State that Daarayn takes the matter seriously.",
    "3. Retrieve the relevant transaction or communication logs.",
    "4. Escalate to super_admin or board level if it involves financial discrepancies.",
    "5. Provide the user with a tracking reference."
  ],
  BoardMeetingPreparation: [
    "1. Aggregate financial totals for the requested period.",
    "2. Identify the top 3 performing campaigns and the bottom 3 underperforming campaigns.",
    "3. Extract high-level metrics (average donation, total donors).",
    "4. Format the data into an Executive Briefing structure.",
    "5. Highlight any active risks or compliance warnings."
  ],
  FinancialReview: [
    "1. Reconcile total received donations against total allocations.",
    "2. Verify that restricted funds have not been allocated to unrestricted categories.",
    "3. Flag any single transaction exceeding the review threshold.",
    "4. Ensure Zakat funds are strictly segregated and allocated only to eligible causes."
  ],
  ComplianceWorkflow: [
    "1. Audit the program caretaker updates frequency.",
    "2. Flag programs that have not received an update in 30 days.",
    "3. Verify that all 80G tax certificates were dispatched for eligible donations.",
    "4. Identify any drafts or communications that accidentally expose internal donor IDs."
  ],
  EmergencyWorkflow: [
    "1. Immediately halt automated email dispatch if a system failure is detected.",
    "2. Lock down allocation transfers if a security breach or compliance violation is suspected.",
    "3. Alert the Super Admin immediately with a high-priority executive summary.",
    "4. Maintain a detailed read-only log of all queries during the emergency period."
  ]
};

export class OperationalPlaybookLibrary {
  static getPlaybookContext(playbookId: keyof typeof OperationalPlaybooks): string {
    const steps = OperationalPlaybooks[playbookId];
    if (!steps) return "";
    return `
[OPERATIONAL PLAYBOOK: ${playbookId}]
${steps.join("\n")}
    `.trim();
  }
}
