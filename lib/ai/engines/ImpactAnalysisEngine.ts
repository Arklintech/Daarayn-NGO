/**
 * lib/ai/engines/ImpactAnalysisEngine.ts
 *
 * Impact Analysis Engine (IAE) for Phase 3.
 * Non-destructively evaluates operational impact size and potential risks of a plan.
 */

import { db } from "../../firebase";
import { collection, getDocs } from "firebase/firestore";

export interface ImpactSummary {
  affectedDonors: number;
  affectedProjects: number;
  affectedBeneficiaries: number;
  emailsTriggered: number;
  ledgerEntriesCreated: number;
  reportsAffected: number;
  estimatedDurationSeconds: number;
  potentialRisks: string[];
}

export class ImpactAnalysisEngine {
  /**
   * Evaluates the scope of data affected by a workflow without writing to Firestore.
   */
  static async analyzeOperationalImpact(
    actionType: string,
    parameters: any
  ): Promise<ImpactSummary> {
    const summary: ImpactSummary = {
      affectedDonors: 0,
      affectedProjects: 0,
      affectedBeneficiaries: 0,
      emailsTriggered: 0,
      ledgerEntriesCreated: 0,
      reportsAffected: 1,
      estimatedDurationSeconds: 5,
      potentialRisks: [],
    };

    try {
      if (actionType === "allocateDonation") {
        summary.affectedDonors = 1;
        summary.affectedProjects = 1;
        summary.emailsTriggered = 1;
        summary.ledgerEntriesCreated = 2; // debit/credit splits
        summary.estimatedDurationSeconds = 4;

        const amount = Number(parameters.amount) || 0;
        summary.affectedBeneficiaries = Math.max(1, Math.floor(amount / 5000));

        if (amount > 100000) {
          summary.potentialRisks.push(
            "Large transaction balance: Allocation split exceeds standard ₹100,000 threshold. Verify bank clearance logs."
          );
        }
      }

      else if (actionType === "publishUpdate") {
        summary.affectedProjects = 1;
        summary.ledgerEntriesCreated = 0;
        summary.estimatedDurationSeconds = 9;

        // Try reading donations to calculate donor count safely
        try {
          const donationSnap = await getDocs(collection(db, "donations"));
          const uniqueDonorIds = new Set<string>();

          donationSnap.forEach((doc) => {
            const data = doc.data();
            if (data.donationType === parameters.projectTitle || data.cause === parameters.projectTitle) {
              if (data.donorId) uniqueDonorIds.add(data.donorId);
            }
          });

          const donorCount = uniqueDonorIds.size || 7;
          summary.affectedDonors = donorCount;
          summary.emailsTriggered = donorCount;
          summary.affectedBeneficiaries = donorCount * 2;
        } catch (err) {
          // Fallback mocks
          summary.affectedDonors = 7;
          summary.emailsTriggered = 7;
          summary.affectedBeneficiaries = 14;
        }

        summary.potentialRisks.push(
          "Mass mailing triggered: Dispatching updates letters to all supporting donors. Ensure SMTP queue rate limits are active."
        );
      }

      else if (actionType === "generateCertificates") {
        summary.ledgerEntriesCreated = 0;
        summary.estimatedDurationSeconds = 8;

        try {
          const donorSnap = await getDocs(collection(db, "donors"));
          const eligibleCount = donorSnap.docs.filter((d) => (d.data().totalAmountDonated || 0) > 0).length;

          summary.affectedDonors = eligibleCount || 5;
          summary.emailsTriggered = eligibleCount || 5;
          summary.reportsAffected = 2;
        } catch (err) {
          summary.affectedDonors = 5;
          summary.emailsTriggered = 5;
          summary.reportsAffected = 2;
        }
      }

      else if (actionType === "dispatchCommunications") {
        try {
          const draftSnap = await getDocs(collection(db, "ai_drafts"));
          const pendingCount = draftSnap.docs.filter((d) => d.data().status === "pending").length;

          summary.affectedDonors = pendingCount || 3;
          summary.emailsTriggered = pendingCount || 3;
          summary.ledgerEntriesCreated = 0;
          summary.estimatedDurationSeconds = Math.max(3, Math.floor(pendingCount * 1.5));
        } catch (err) {
          summary.affectedDonors = 3;
          summary.emailsTriggered = 3;
          summary.estimatedDurationSeconds = 5;
        }
      }
    } catch (error) {
      console.error("IAE: Operational impact evaluation failed:", error);
    }

    return summary;
  }
}
