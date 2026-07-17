/**
 * lib/ai/mibf/ExperienceGovernancePipeline.ts
 * 
 * Manages the promotion of KnowledgeEvolutionRecords into approved ExecutiveExperience.
 * Governs novelty, deduplication, and administrator approval workflows.
 */

import { db } from "../../firebase";
import { doc, setDoc, getDoc, updateDoc } from "firebase/firestore";
import type { KnowledgeEvolutionRecord } from "./EnterpriseKnowledgeRegistry";

export interface ApprovedExperience {
  id: string;
  domain: string;
  operationalLesson: string;
  createdAt: string;
  referenceCount: number;
  confidenceScore: number;
  lastReferenced: string;
  expirationPolicy: "never" | "1_year" | "6_months";
  status: "active" | "archived" | "deprecated";
  sourceEvolutionId: string;
}

export class ExperienceGovernancePipeline {
  
  /**
   * Assesses a pending evolution record against Quality Engine thresholds.
   */
  static assessQuality(record: KnowledgeEvolutionRecord): boolean {
    if (!record.scores) return false;
    
    // Hard Governance Thresholds
    const { novelty, evidenceStrength, executiveValue, operationalImpact, confidence, reusability } = record.scores;
    
    if (evidenceStrength < 8) return false; // Must be strictly grounded in verified facts
    if (confidence < 7) return false;
    if (executiveValue < 7) return false;
    
    // Average overall must be >= 7.0
    const average = (novelty + evidenceStrength + executiveValue + operationalImpact + confidence + reusability) / 6;
    return average >= 7.0;
  }

  /**
   * Simulates the administrator approval flow for an evolution record.
   * If quality checks pass, promotes it to the khidr_experience collection.
   */
  static async approveExperience(evolutionId: string, adminUserId: string): Promise<boolean> {
    try {
      const evolRef = doc(db, "khidr_evolution", evolutionId);
      const evolSnap = await getDoc(evolRef);
      
      if (!evolSnap.exists()) {
        console.error(`[Governance] Evolution record not found: ${evolutionId}`);
        return false;
      }

      const record = evolSnap.data() as KnowledgeEvolutionRecord;
      
      if (record.status !== "pending_review") {
        console.warn(`[Governance] Record ${evolutionId} is already ${record.status}`);
        return false;
      }

      const passesQuality = this.assessQuality(record);
      if (!passesQuality) {
        await updateDoc(evolRef, {
          status: "rejected",
          administratorFeedback: "negative",
          rejectionReason: "Failed Quality Engine Thresholds"
        });
        return false;
      }

      // Promote to khidr_experience
      const approvedExp: ApprovedExperience = {
        id: `EXP-${Date.now()}`,
        domain: record.domain,
        operationalLesson: record.operationalLesson || "",
        createdAt: new Date().toISOString(),
        referenceCount: 0,
        confidenceScore: record.scores?.confidence || 8,
        lastReferenced: new Date().toISOString(),
        expirationPolicy: "1_year", // Default
        status: "active",
        sourceEvolutionId: evolutionId
      };

      await setDoc(doc(db, "khidr_experience", approvedExp.id), approvedExp);
      
      // Update evolution record
      await updateDoc(evolRef, {
        status: "approved",
        administratorFeedback: "positive"
      });

      console.log(`[Governance] Successfully promoted ${evolutionId} to Experience ID: ${approvedExp.id}`);
      return true;

    } catch (error) {
      console.error(`[Governance] Failed to approve experience:`, error);
      return false;
    }
  }
}
