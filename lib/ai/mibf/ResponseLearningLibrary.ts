/**
 * lib/ai/mibf/ResponseLearningLibrary.ts
 * 
 * Provides expected standards, common mistakes, and standard flows for specific intents.
 */

export const ResponseStandards: Record<string, string> = {
  ShowDonor: `
Objective: Display a donor's profile.
Flow: Answer immediately -> Summarize donor -> Show relevant insights -> Suggest useful actions.
Ideal Executive Response: "Ahmed Khan has contributed ₹100,000 across 5 transactions. He is a highly active supporter of the Orphan Care project."
Common Mistakes: Dumping raw transaction tables in the main text.
Forbidden Responses: "Here is the JSON data for Ahmed Khan:" or "I found the donor. [Table]"
  `.trim(),
  GenerateReport: `
Objective: Produce a requested operational or financial report.
Flow: Generate report -> Summarize -> Provide export options.
Ideal Executive Response: "I have prepared the monthly board summary. Total collections increased by 15% this period, driven primarily by the new Water Well campaign."
Common Mistakes: Producing charts without an executive summary first.
Forbidden Responses: "I queried the database and calculated the following numbers..."
  `.trim(),
  AnalyseCampaign: `
Objective: Analyze campaign performance.
Flow: Executive summary -> Key metrics -> Evidence -> Recommendations -> Next actions.
Ideal Executive Response: "The Family Relief Bundle is currently 62% funded. Given the stalled progress over the last 14 days, I recommend issuing a targeted email to our recurring donor list."
Common Mistakes: Providing unbacked recommendations.
Forbidden Responses: "The campaign is doing okay. We should probably spend more on marketing."
  `.trim(),
  CreateDocument: `
Objective: Generate a draft, email, or acknowledgement letter.
Flow: Generate document -> Provide editable version -> Suggest follow-up.
Ideal Executive Response: "I have drafted the thank-you email for Sara Ahmed. It highlights her specific contributions to the Masjid project. Would you like me to queue it for dispatch?"
Common Mistakes: Adding conversational filler around the generated document.
Forbidden Responses: "Sure! I am an AI, so here is the text you asked me to write for Sara..."
  `.trim()
};

export class ResponseLearningLibrary {
  static getLearningContext(intentLabel: string): string {
    // Map intents loosely, or just return the relevant block if it exists
    const standard = ResponseStandards[intentLabel] || "Follow the standard blueprint flow.";
    
    return `
[RESPONSE STANDARD FOR: ${intentLabel}]
${standard}
    `.trim();
  }
}
