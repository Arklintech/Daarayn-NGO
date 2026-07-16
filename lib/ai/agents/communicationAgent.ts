/**
 * lib/ai/agents/communicationAgent.ts
 *
 * Communication Agent for Daarayn AI-TOS.
 * Focuses on drafting letters, notifications, and certificates.
 */

import { draftCommunication } from "../services/communication";
import type { PromptCategory } from "../promptBuilder";

export class CommunicationAgent {
  public async draft(params: {
    category: PromptCategory;
    donor: any;
    donation?: any;
    allocation?: any;
    program?: any;
    update?: any;
    customNotes?: string;
    language?: string;
  }) {
    console.log(`[CommunicationAgent] Drafting category: ${params.category}`);
    return draftCommunication({
      category: params.category,
      rawDonor: params.donor,
      rawDonation: params.donation,
      rawAllocation: params.allocation,
      rawProgram: params.program,
      rawUpdate: params.update,
      customNotes: params.customNotes,
      language: params.language,
    });
  }
}
