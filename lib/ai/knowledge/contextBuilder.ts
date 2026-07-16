/**
 * lib/ai/knowledge/contextBuilder.ts
 *
 * Context Builder for MOMIN Knowledge Intelligence Engine (MKIE).
 * Formats Firestore raw query results into concise, structured, and verified text context blocks.
 */

import type { RetrievedFact } from "./retriever";

/**
 * Builds formatted text summary of the retrieved document facts.
 * Ensures the output context is optimized for token efficiency.
 */
export function buildVerifiedContext(facts: RetrievedFact[]): string {
  if (!facts || facts.length === 0) {
    return "No matching verified database records were retrieved.";
  }

  // Group facts by collection type
  const donations = facts.filter(f => f.source === "donations").map(f => f.data);
  const donors = facts.filter(f => f.source === "donors").map(f => f.data);
  const programs = facts.filter(f => f.source === "programs").map(f => f.data);
  const settings = facts.filter(f => f.source === "settings").map(f => f.data);
  const communications = facts.filter(f => f.source === "communications").map(f => f.data);

  let context = "=========================================\nVERIFIED DATABASE RECORDS (LEDGER)\n=========================================\n\n";

  // 1. Donation Summaries
  if (donations.length > 0) {
    const totalAmount = donations.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
    const pendingAlloc = donations.filter(d => d.allocationStatus !== "fully").length;
    const maxDonation = donations.reduce((max, d) => Math.max(max, Number(d.amount) || 0), 0);
    const currencies = Array.from(new Set(donations.map(d => d.currency || "INR")));

    context += "### COLLECTION: donations\n";
    context += "- Records Fetched: " + donations.length + "\n";
    context += "- Aggregated Value: INR " + totalAmount.toLocaleString() + "\n";
    context += "- Max Transaction: INR " + maxDonation.toLocaleString() + "\n";
    context += "- Pending Allocations: " + pendingAlloc + "\n";
    context += "- Currencies: " + currencies.join(", ") + "\n\n";
    
    context += "#### Detailed Donations List:\n";
    donations.forEach(d => {
      context += "  * ID: " + (d.id || "N/A") + " | Date: " + (d.date || "N/A") + " | Donor: " + (d.donorName || "Anonymous") + " | Amount: " + (d.currency || "INR") + " " + Number(d.amount || 0).toLocaleString() + " | Status: " + (d.status || "N/A") + " | Allocation: " + (d.allocationStatus || "pending") + " (Allocated: " + (d.allocatedAmount || 0) + ")\n";
    });
    context += "\n";
  }

  // 2. Donor Profile Summaries
  if (donors.length > 0) {
    context += "### COLLECTION: donors\n";
    donors.forEach(d => {
      context += "  * ID: " + (d.id || "N/A") + " | Name: " + (d.name || "N/A") + " | Email: " + (d.email || "N/A") + " | Contributions: INR " + Number(d.totalAmountDonated || 0).toLocaleString() + " across " + (d.totalDonations || 0) + " donations | Status: " + (d.status || "active") + "\n";
    });
    context += "\n";
  }

  // 3. Program / Milestone Summaries
  if (programs.length > 0) {
    context += "### COLLECTION: programs (Projects Hub)\n";
    programs.forEach(p => {
      const remainingGoal = Math.max(0, (p.amountRequired || 0) - (p.amountCollected || 0));
      context += "  * ID: " + (p.id || "N/A") + " | Title: " + (p.title || "N/A") + " | Progress: " + (p.progress || 0) + "% | Goal: INR " + Number(p.amountRequired || 0).toLocaleString() + " | Raised: INR " + Number(p.amountCollected || 0).toLocaleString() + " | Funding Gap: INR " + remainingGoal.toLocaleString() + " | Status: " + (p.status || "Ongoing") + "\n";
      if (Array.isArray(p.updates) && p.updates.length > 0) {
        context += "    * Milestone Updates:\n";
        p.updates.forEach((u) => {
          context += "      - [" + (u.date) + "] Title: " + (u.title || "N/A") + " | Progress: " + u.progress + "% | Details: " + (u.statement || "") + "\n";
        });
      }
    });
    context += "\n";
  }

  // 4. Communication Log summaries
  if (communications.length > 0) {
    context += "### COLLECTION: communications (Email Logs)\n";
    communications.forEach(c => {
      context += "  * ID: " + (c.id || "N/A") + " | Date: " + (c.sentDate || "N/A") + " | Recipient: " + (c.donorEmail || "N/A") + " | Subject: " + (c.subject || "N/A") + " | Delivery Status: " + (c.deliveryStatus || "sent") + "\n";
    });
    context += "\n";
  }

  // 5. General FAQ summaries
  if (settings.length > 0) {
    context += "### COLLECTION: settings (Homepage FAQ Config)\n";
    settings.forEach(s => {
      if (Array.isArray(s.faqs)) {
        s.faqs.forEach((faq, idx) => {
          context += "  * FAQ #" + (idx + 1) + "\n";
          context += "    Q: " + faq.question + "\n";
          context += "    A: " + faq.answer + "\n";
        });
      }
    });
    context += "\n";
  }

  return context;
}
