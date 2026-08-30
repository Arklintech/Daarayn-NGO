/**
 * lib/ai/knowledgeEngine.ts
 *
 * Retrieval-Augmented Generation (RAG) knowledge engine for Daarayn AI-TOS.
 * Queries Firestore databases and filters records dynamically to build facts.
 */

import { donorRepository } from "../repositories/donorRepository";
import { donationRepository } from "../repositories/donationRepository";
import { causeRepository } from "../repositories/causeRepository";
import { collectDonorData, collectDonationData, collectProgramData } from "./verifiedDataCollector";

export interface KnowledgeMatch {
  source: string;
  content: string;
}

/**
 * Searches the domain repositories for records matching key terms in user query
 */
export async function retrieveVerifiedKnowledge(
  userQuery: string,
  allowedCollections: string[]
): Promise<KnowledgeMatch[]> {
  const matches: KnowledgeMatch[] = [];
  const normalizedQuery = userQuery.toLowerCase();

  try {
    // 1. Search Donors (only if permitted)
    if (allowedCollections.includes("donors")) {
      const donors = await donorRepository.getAll();
      donors.forEach((donor) => {
        const name = String(donor.name || "").toLowerCase();
        const email = String(donor.email || "").toLowerCase();
        
        if (name.includes(normalizedQuery) || email.includes(normalizedQuery) || donor.id.toLowerCase().includes(normalizedQuery)) {
          const clean = collectDonorData(donor);
          matches.push({
            source: `Repository: Donors CRM (${clean.id})`,
            content: `Donor Name: ${clean.name}, Email: ${clean.email}, Lifetime Contributions: INR ${clean.totalAmountDonated.toLocaleString()}`,
          });
        }
      });
    }

    // 2. Search Donations
    if (allowedCollections.includes("donations")) {
      const donations = await donationRepository.getAll();
      donations.forEach((donation) => {
        const donorName = String(donation.donorName || "").toLowerCase();
        const id = donation.id.toLowerCase();
        
        if (donorName.includes(normalizedQuery) || id.includes(normalizedQuery)) {
          const clean = collectDonationData(donation);
          matches.push({
            source: `Repository: Donations Ledger (${clean.id})`,
            content: `Donation: ${clean.currency} ${clean.amount.toLocaleString()} received on ${clean.date} via ${clean.paymentMethod}. Status: ${donation.status || 'completed'}.`,
          });
        }
      });
    }

    // 3. Search Causes / Programs
    if (allowedCollections.includes("programs") || allowedCollections.includes("causes")) {
      const causes = await causeRepository.getAll();
      causes.forEach((cause) => {
        const title = String(cause.title || "").toLowerCase();
        const desc = String(cause.description || "").toLowerCase();
        
        if (title.includes(normalizedQuery) || desc.includes(normalizedQuery) || cause.id.toLowerCase().includes(normalizedQuery)) {
          matches.push({
            source: `Repository: Causes Hub (${cause.id})`,
            content: `Cause: ${cause.title}, Target: INR ${cause.targetAmount.toLocaleString()}, Raised: INR ${cause.raisedAmount.toLocaleString()}. Status: ${cause.status}.`,
          });
        }
      });
    }

    // 4. Default FAQs (approved knowledge base)
    const defaultFaqs = [
      { question: "What is Daarayn Foundation?", answer: "Daarayn Foundation is a global transparent NGO delivering emergency relief, water wells, and orphan care with 100% direct audit verification." },
      { question: "How does Daarayn verify donations?", answer: "Every donation is assigned a permanent identifier (DON-YYYY-XXXXXX) and tracked in our public ledger with direct proof materials." }
    ];
    defaultFaqs.forEach((faq) => {
      const q = faq.question.toLowerCase();
      const a = faq.answer.toLowerCase();
      if (q.includes(normalizedQuery) || a.includes(normalizedQuery)) {
        matches.push({
          source: "Approved FAQ",
          content: `Q: ${faq.question}\nA: ${faq.answer}`,
        });
      }
    });

  } catch (error) {
    console.error("[KnowledgeEngine] Retrieval failure:", error);
  }

  // Fallback defaults if no database entries match the search keywords to prevent empty UI
  if (matches.length === 0) {
    if (normalizedQuery.includes("rules") || normalizedQuery.includes("split") || normalizedQuery.includes("fee")) {
      matches.push({
        source: "Trust Allocation Policy Document",
        content: "Daarayn enforces a strict 90/10 Amanah split: 90% of every donation goes directly to target relief cases, and 10% is reserved for logistics, caretakers audits, and verified reporting. Trustees are 100% volunteers and receive zero commissions.",
      });
    }
  }

  return matches;
}
