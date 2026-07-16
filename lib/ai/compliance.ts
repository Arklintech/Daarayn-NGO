/**
 * lib/ai/compliance.ts
 *
 * Compliance Engine for the Daarayn Trust Intelligence Engine.
 * Runs strict cross-checks comparing generated string text against verified numerical facts from database records.
 * Immediately flags discrepancies and blocks communication.
 */

import type { AIResponsePayload } from "./providerManager";
import type { VerifiedDataContext } from "./verifiedDataCollector";

export interface ComplianceReport {
  isCompliant: boolean;
  mismatches: string[];
  auditedAt: string;
}

/**
 * Cross-checks the generated text against verified database facts.
 * Mismatches will block communication.
 */
export function checkCompliance(
  payload: AIResponsePayload,
  verifiedContext: VerifiedDataContext
): ComplianceReport {
  const mismatches: string[] = [];
  const fullContent = `${payload.subject} ${payload.preview} ${payload.greeting} ${payload.body} ${payload.dua}`.toLowerCase();

  // 1. Cross-check Donation Amount
  if (verifiedContext.donation) {
    const amtStr = String(verifiedContext.donation.amount);
    const formattedAmt = verifiedContext.donation.amount.toLocaleString("en-IN");
    
    // Find all numbers prefixed with currency symbol in generated text
    const rupeeRegex = /(?:₹|inr)\s?([\d,]+)/g;
    let match;
    let foundAnyCurrency = false;
    
    while ((match = rupeeRegex.exec(fullContent)) !== null) {
      foundAnyCurrency = true;
      const parsedNumText = match[1].replace(/,/g, "");
      const parsedNum = parseInt(parsedNumText, 10);
      
      // The parsed currency number must match the donation amount OR the allocation amount (if available) OR project totals
      const validAmounts: number[] = [verifiedContext.donation.amount];
      if (verifiedContext.allocation) {
        validAmounts.push(verifiedContext.allocation.allocatedAmount);
      }
      if (verifiedContext.program) {
        validAmounts.push(verifiedContext.program.amountRequired);
        validAmounts.push(verifiedContext.program.amountCollected);
      }
      if (verifiedContext.projectUpdate?.receipts) {
        verifiedContext.projectUpdate.receipts.forEach(r => validAmounts.push(r.value));
      }

      if (!validAmounts.includes(parsedNum)) {
        mismatches.push(
          `Donation/Allocation currency mismatch: Found ₹${parsedNum.toLocaleString()} in text, which does not match any verified record amount.`
        );
      }
    }
  }

  // 2. Cross-check Project Title
  if (verifiedContext.program) {
    const titleLower = verifiedContext.program.title.toLowerCase();
    
    // Check if the program title matches key words in the generated body/subject
    const words = titleLower.split(/\s+/).filter(w => w.length > 3);
    const foundKeywords = words.some(word => fullContent.includes(word));
    
    if (!foundKeywords && words.length > 0) {
      mismatches.push(
        `Project target mismatch: The program name "${verifiedContext.program.title}" is not referenced in the generated communication.`
      );
    }
  }

  // 3. Cross-check Beneficiary Count Consistency
  if (verifiedContext.program?.beneficiaryCount !== undefined) {
    const count = verifiedContext.program.beneficiaryCount;
    // Check if another number is mentioned close to the word "beneficiary" or "families"
    const numberRegex = /\b\d+\b/g;
    let match;
    while ((match = numberRegex.exec(fullContent)) !== null) {
      const num = parseInt(match[0], 10);
      
      // If we find a number in the text that doesn't match count or direct parameters
      const validNumbers = [
        count,
        verifiedContext.donation?.amount,
        verifiedContext.allocation?.allocatedAmount,
        verifiedContext.program?.amountRequired,
        verifiedContext.program?.amountCollected,
        verifiedContext.program?.progress,
        verifiedContext.projectUpdate?.progress,
        verifiedContext.projectUpdate?.mediaCount,
        new Date().getFullYear()
      ].filter(x => x !== undefined) as number[];

      if (verifiedContext.projectUpdate?.receipts) {
        verifiedContext.projectUpdate.receipts.forEach(r => validNumbers.push(r.value));
      }

      if (!validNumbers.includes(num)) {
        // Just a warning/mismatch to check if it's describing facts
        mismatches.push(
          `Number consistency warning: Found unverified number "${num}" in output text.`
        );
      }
    }
  }

  // 4. Ensure there is no private donor details exposure (like full email/phone in body)
  if (verifiedContext.donor) {
    if (payload.body.includes(verifiedContext.donor.email) && verifiedContext.donor.email) {
      mismatches.push("Security block: Private donor email address is exposed in message body.");
    }
    if (payload.body.includes(verifiedContext.donor.id) && verifiedContext.donor.id) {
      mismatches.push("Security block: Internal donor database ID is exposed in message body.");
    }
  }

  return {
    isCompliant: mismatches.length === 0,
    mismatches,
    auditedAt: new Date().toISOString()
  };
}
