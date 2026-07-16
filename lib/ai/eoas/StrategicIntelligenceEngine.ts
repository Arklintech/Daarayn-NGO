/**
 * lib/ai/eoas/StrategicIntelligenceEngine.ts
 * 
 * Synthesizes health reports and historical memory into actionable
 * Strategic Risks and Opportunities (SORI).
 */

import type { OrganizationalHealthReport } from "./OrganizationalHealthIntelligence";
import type { OrganizationalMemory } from "./OrganizationalMemoryEngine";

export interface StrategicItem {
  title: string;
  evidence: string;
  whyItMatters: string;
  affectedStakeholders: string[];
  confidence: number;
  recommendedActions: string[];
}

export interface StrategicIntelligence {
  opportunities: StrategicItem[];
  risks: StrategicItem[];
}

export class StrategicIntelligenceEngine {
  
  static evaluateStrategy(health: OrganizationalHealthReport, memory: OrganizationalMemory): StrategicIntelligence {
    const opportunities: StrategicItem[] = [];
    const risks: StrategicItem[] = [];

    // Analyze Health Assessments for Risks & Opportunities
    health.assessments.forEach(assessment => {
      
      // Look for Risks based on Areas of Concern
      if (assessment.suggestedPriorityLevel === "Critical" || assessment.suggestedPriorityLevel === "High") {
        if (assessment.domain === "Compliance") {
          risks.push({
            title: "Severe Compliance Exposure",
            evidence: assessment.areasOfConcern.join(" "),
            whyItMatters: "Compliance failures threaten organizational trust, legal standing, and operational continuity.",
            affectedStakeholders: ["Board of Directors", "Super Admin", "Finance Team"],
            confidence: 95,
            recommendedActions: [
              "Immediately execute pending compliance approvals.",
              "Review expiring documents today."
            ]
          });
        }
        
        if (assessment.domain === "Projects") {
          risks.push({
            title: "Project Delivery Stagnation",
            evidence: assessment.areasOfConcern.join(" "),
            whyItMatters: "Delayed milestones and underfunded campaigns erode donor trust and delay beneficiary relief.",
            affectedStakeholders: ["Beneficiaries", "Donors", "Project Managers"],
            confidence: 90,
            recommendedActions: [
              "Review struggling campaigns for strategic pivot.",
              "Consider unrestricted fund allocation for almost-funded projects."
            ]
          });
        }
      }

      // Look for Opportunities based on Positive Indicators & Memory
      if (assessment.domain === "Donors" && assessment.healthScore >= 80) {
        // If it's a slow season (summer slump), and retention is high, there's an opportunity.
        if (memory.timeframe.seasonality.includes("Summer slump") || memory.timeframe.thisMonthTrend.includes("below")) {
          opportunities.push({
            title: "Leverage High Donor Retention to Offset Slump",
            evidence: `Donor retention is strong (${assessment.healthScore} Health), despite seasonal trends: ${memory.timeframe.seasonality}`,
            whyItMatters: "Engaging highly retained donors during slow periods can stabilize cash flow.",
            affectedStakeholders: ["Donors", "Finance Team", "Executive Director"],
            confidence: 85,
            recommendedActions: [
              "Send an exclusive impact update to top recurring donors without an explicit ask.",
              "Prepare a targeted campaign for lapsed donors from the previous year."
            ]
          });
        }
      }
    });

    // Cross-Domain Risk: Communications + Donor Health
    const commHealth = health.assessments.find(a => a.domain === "Communications")?.healthScore || 100;
    const donorHealth = health.assessments.find(a => a.domain === "Donors")?.healthScore || 100;
    
    if (commHealth < 80 && donorHealth < 80) {
      risks.push({
        title: "Communication Backlog Threatens Donor Retention",
        evidence: "Both Communications and Donor health scores are below 80.",
        whyItMatters: "Delayed acknowledgements directly correlate with reduced future giving.",
        affectedStakeholders: ["High-Value Donors", "Communications Team"],
        confidence: 88,
        recommendedActions: [
          "Clear the thank-you backlog immediately.",
          "Implement an SLA for major gift acknowledgements (< 24h)."
        ]
      });
    }

    return {
      opportunities,
      risks
    };
  }
}
