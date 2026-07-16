/**
 * lib/ai/contextBuilder.ts
 *
 * AI Context Builder for the Daarayn Trust Intelligence Engine.
 * Translates collector payloads into clear, high-density structured contexts
 * to feed the Prompt Builder.
 */

import type { VerifiedDataContext } from "./verifiedDataCollector";

export function buildAIContext(context: VerifiedDataContext): string {
  let output = "=========================================\n";
  output += "VERIFIED SYSTEM DATA CONTEXT (TRUST LAYER)\n";
  output += "=========================================\n\n";

  if (context.donor) {
    output += `[DONOR PROFILE]\n`;
    output += `- ID: ${context.donor.id}\n`;
    output += `- Name: ${context.donor.name}\n`;
    output += `- Email: ${context.donor.email}\n`;
    output += `- Preferred Language: ${context.donor.preferredLanguage}\n`;
    output += `- Communication Preference: ${context.donor.communicationPreference}\n`;
    output += `- Lifetime Amount Donated: INR ${context.donor.totalAmountDonated.toLocaleString()}\n\n`;
  }

  if (context.donation) {
    output += `[DONATION RECORD]\n`;
    output += `- ID: ${context.donation.id}\n`;
    output += `- Amount: ${context.donation.currency} ${context.donation.amount.toLocaleString()}\n`;
    output += `- Date Received: ${context.donation.date}\n`;
    output += `- Method: ${context.donation.paymentMethod}\n`;
    output += `- Intended Sector: ${context.donation.donationType}\n\n`;
  }

  if (context.allocation) {
    output += `[ALLOCATION METRICS]\n`;
    output += `- ID: ${context.allocation.id}\n`;
    output += `- Allocated Amount: INR ${context.allocation.allocatedAmount.toLocaleString()}\n`;
    output += `- Date Allocated: ${context.allocation.allocationDate}\n`;
    output += `- Allocated Program: ${context.allocation.targetTitle}\n\n`;
  }

  if (context.program) {
    const remaining = Math.max(0, context.program.amountRequired - context.program.amountCollected);
    output += `[CHARITY PROGRAM STATUS]\n`;
    output += `- ID: ${context.program.id}\n`;
    output += `- Program Name: ${context.program.title}\n`;
    output += `- Description: ${context.program.description}\n`;
    output += `- Location: ${context.program.location}\n`;
    output += `- Funding Goal: INR ${context.program.amountRequired.toLocaleString()}\n`;
    output += `- Funding Raised: INR ${context.program.amountCollected.toLocaleString()}\n`;
    output += `- Funding Remaining: INR ${remaining.toLocaleString()}\n`;
    output += `- Overall Progress: ${context.program.progress}%\n`;
    output += `- Status: ${context.program.status}\n`;
    if (context.program.beneficiaryCount !== undefined) {
      output += `- Verified Beneficiary Count: ${context.program.beneficiaryCount}\n`;
    }
    output += `\n`;
  }

  if (context.projectUpdate) {
    output += `[VERIFIED AUDIT UPDATE]\n`;
    output += `- Update ID: ${context.projectUpdate.id}\n`;
    output += `- Update Title: ${context.projectUpdate.title}\n`;
    output += `- Audit Details: ${context.projectUpdate.content}\n`;
    output += `- Date Verified: ${context.projectUpdate.date}\n`;
    output += `- Current Work Progress: ${context.projectUpdate.progress}%\n`;
    output += `- Uploaded Media Files: ${context.projectUpdate.mediaCount} verified logs\n`;
    output += `- Caretaker Statement: "${context.projectUpdate.beneficiaryConfirmation || 'Everything verified'}"\n`;
    
    if (context.projectUpdate.receipts.length > 0) {
      output += `- Verified Receipts Breakdown:\n`;
      context.projectUpdate.receipts.forEach((r) => {
        output += `  * ${r.title}: INR ${r.value.toLocaleString()}\n`;
      });
    }
    output += `\n`;
  }

  if (context.customNotes) {
    output += `[ADMINISTRATOR AUDIT NOTES]\n`;
    output += `${context.customNotes}\n\n`;
  }

  output += "=========================================\n";
  output += "END OF VERIFIED CONTEXT DATA\n";
  output += "=========================================\n";

  return output;
}
