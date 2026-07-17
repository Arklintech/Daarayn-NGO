/**
 * lib/ai/mibf/ExecutiveExperienceLibrary.ts
 * 
 * Executive Experience Engine (EEE) organizational wisdom and decision patterns.
 * This library teaches KHIDR experience, not just knowledge.
 */

import { db } from "../../firebase";
import { collection, getDocs, query, where } from "firebase/firestore";
import type { ApprovedExperience } from "./ExperienceGovernancePipeline";

export interface DecisionPattern {
  situation: string;
  decision: string;
  outcome: string;
  lesson: string;
}

export const FallbackExecutiveExperience = {
  donorStewardship: [
    "High-value donors require relationship management, not just transactional receipts.",
    "Acknowledgement should happen promptly, ideally within 24 hours of a major gift."
  ],
  campaignStrategy: [
    "Campaigns stalling below 50% funding after 30 days require immediate strategic pivot, not just 'more time'."
  ],
  complianceWisdom: [
    "Compliance issues require immediate visibility to the Super Admin. Never minimize a risk."
  ],
  decisionPatterns: [
    {
      situation: "A major donor requests a refund due to an accidental double-charge.",
      decision: "Immediate empathetic acknowledgment, bypassing standard 7-day review to expedite the refund.",
      outcome: "Donor retained and increased their next contribution due to rapid support.",
      lesson: "Technical errors involving large sums should override standard bureaucratic delays."
    }
  ] as DecisionPattern[]
};

export class ExecutiveExperienceLibrary {
  
  // In-memory cache for 0 latency execution
  private static cachedWisdom: ApprovedExperience[] = [];
  private static isCacheLoaded = false;

  /**
   * Called during system initialization or on a schedule to load experience.
   * This prevents latency during the actual AI pipeline execution.
   */
  static async preloadExperienceCache() {
    try {
      const q = query(collection(db, "khidr_experience"), where("status", "==", "active"));
      const snap = await getDocs(q);
      const wisdom: ApprovedExperience[] = [];
      snap.forEach(doc => {
        wisdom.push(doc.data() as ApprovedExperience);
      });
      this.cachedWisdom = wisdom;
      this.isCacheLoaded = true;
      console.log(`[ExecutiveExperienceLibrary] Loaded ${wisdom.length} approved experiences.`);
    } catch (e) {
      console.error(`[ExecutiveExperienceLibrary] Failed to load experience cache:`, e);
    }
  }

  static getExperienceContext(): string {
    if (!this.isCacheLoaded || this.cachedWisdom.length === 0) {
      // Fallback to static if cache isn't ready or empty
      return `
[EXECUTIVE ORGANIZATIONAL WISDOM]
Donor Stewardship:
${FallbackExecutiveExperience.donorStewardship.map(w => `- ${w}`).join("\n")}

Campaign Strategy:
${FallbackExecutiveExperience.campaignStrategy.map(w => `- ${w}`).join("\n")}

Compliance Wisdom:
${FallbackExecutiveExperience.complianceWisdom.map(w => `- ${w}`).join("\n")}

[HISTORICAL DECISION PATTERNS]
${FallbackExecutiveExperience.decisionPatterns.map(dp => `
Situation: ${dp.situation}
Decision: ${dp.decision}
Lesson Learned: ${dp.lesson}`).join("\n")}
      `.trim();
    }

    // Use dynamic experience
    // Group by Domain
    const grouped: Record<string, string[]> = {};
    for (const exp of this.cachedWisdom) {
      if (!grouped[exp.domain]) grouped[exp.domain] = [];
      grouped[exp.domain].push(exp.operationalLesson);
    }

    let dynamicContext = "[EXECUTIVE ORGANIZATIONAL WISDOM (Dynamically Sourced)]\n";
    for (const [domain, lessons] of Object.entries(grouped)) {
      dynamicContext += `\n${domain}:\n`;
      lessons.forEach(l => dynamicContext += `- ${l}\n`);
    }

    // Append fallback decision patterns for safety coverage
    dynamicContext += `\n[HISTORICAL DECISION PATTERNS]\n`;
    FallbackExecutiveExperience.decisionPatterns.forEach(dp => {
      dynamicContext += `Situation: ${dp.situation}\nDecision: ${dp.decision}\nLesson Learned: ${dp.lesson}\n\n`;
    });

    return dynamicContext.trim();
  }
}
