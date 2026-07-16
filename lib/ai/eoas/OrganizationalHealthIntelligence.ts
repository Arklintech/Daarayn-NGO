/**
 * lib/ai/eoas/OrganizationalHealthIntelligence.ts
 * 
 * Deterministically evaluates the health of the organization based on EAE signals.
 * Generates health scores, positive indicators, and areas of concern using strict Business Rules.
 */

import type { OrganizationalSignals } from "./ExecutiveAwarenessEngine";

export interface HealthAssessment {
  domain: string;
  healthScore: number; // 0-100
  positiveIndicators: string[];
  areasOfConcern: string[];
  suggestedPriorityLevel: "Low" | "Medium" | "High" | "Critical";
}

export interface OrganizationalHealthReport {
  timestamp: string;
  overallScore: number;
  assessments: HealthAssessment[];
}

export class OrganizationalHealthIntelligence {
  
  static evaluateHealth(signals: OrganizationalSignals): OrganizationalHealthReport {
    const assessments: HealthAssessment[] = [];
    
    // 1. Donor Health
    let donorScore = 100;
    const donorPos: string[] = [];
    const donorConcerns: string[] = [];
    
    if (signals.donors.retentionRate > 80) {
      donorPos.push(`High donor retention rate (${signals.donors.retentionRate}%)`);
    } else {
      donorScore -= (80 - signals.donors.retentionRate) * 2;
      donorConcerns.push(`Donor retention is dropping (${signals.donors.retentionRate}%)`);
    }

    if (signals.donors.decliningEngagementAlerts > 10) {
      donorScore -= 15;
      donorConcerns.push(`${signals.donors.decliningEngagementAlerts} high-value donors show declining engagement.`);
    }

    if (signals.donors.recurringDonorGrowthRate > 2) {
      donorPos.push(`Recurring donations growing steadily at ${signals.donors.recurringDonorGrowthRate}%`);
    }

    assessments.push({
      domain: "Donors",
      healthScore: Math.max(0, donorScore),
      positiveIndicators: donorPos,
      areasOfConcern: donorConcerns,
      suggestedPriorityLevel: donorScore < 70 ? "High" : donorScore < 85 ? "Medium" : "Low"
    });

    // 2. Project Health
    let projScore = 100;
    const projPos: string[] = [];
    const projConcerns: string[] = [];

    if (signals.projects.projectsBelow50PercentFunding > 0) {
      projScore -= (signals.projects.projectsBelow50PercentFunding * 5);
      projConcerns.push(`${signals.projects.projectsBelow50PercentFunding} active campaigns are struggling below 50% funding.`);
    }

    if (signals.projects.delayedMilestones > 0) {
      projScore -= (signals.projects.delayedMilestones * 10);
      projConcerns.push(`${signals.projects.delayedMilestones} projects have delayed execution milestones.`);
    }

    if (signals.projects.budgetExhaustionWarnings > 0) {
      projScore -= 20;
      projConcerns.push(`${signals.projects.budgetExhaustionWarnings} projects are nearing budget exhaustion.`);
    }

    if (projConcerns.length === 0) {
      projPos.push("All projects are executing on schedule and within budget.");
    }

    assessments.push({
      domain: "Projects",
      healthScore: Math.max(0, projScore),
      positiveIndicators: projPos,
      areasOfConcern: projConcerns,
      suggestedPriorityLevel: projScore < 75 ? "High" : "Medium"
    });

    // 3. Compliance Health
    let compScore = signals.compliance.auditReadinessScore;
    const compPos: string[] = [];
    const compConcerns: string[] = [];

    if (signals.compliance.expiringDocuments > 0) {
      compScore -= 10;
      compConcerns.push(`${signals.compliance.expiringDocuments} compliance documents are expiring within 30 days.`);
    }

    if (signals.compliance.missingApprovals > 0) {
      compScore -= 30; // High penalty for missing approvals
      compConcerns.push(`${signals.compliance.missingApprovals} workflows are blocked pending compliance approval.`);
    }

    if (compScore >= 95) {
      compPos.push("Organizational compliance and audit readiness are exceptionally strong.");
    }

    assessments.push({
      domain: "Compliance",
      healthScore: Math.max(0, compScore),
      positiveIndicators: compPos,
      areasOfConcern: compConcerns,
      suggestedPriorityLevel: compScore < 80 ? "Critical" : "Low"
    });

    // 4. Communications Health
    let commScore = 100;
    const commPos: string[] = [];
    const commConcerns: string[] = [];

    if (signals.communications.thankYouBacklog > 5) {
      commScore -= 15;
      commConcerns.push(`Backlog of ${signals.communications.thankYouBacklog} major donors awaiting personalized acknowledgement.`);
    }

    if (signals.communications.averageAcknowledgementDelayHours > 24) {
      commScore -= 20;
      commConcerns.push(`Average acknowledgement delay is ${signals.communications.averageAcknowledgementDelayHours}h (Target: < 24h).`);
    } else {
      commPos.push(`Acknowledgements are sent promptly within ${signals.communications.averageAcknowledgementDelayHours}h.`);
    }

    assessments.push({
      domain: "Communications",
      healthScore: Math.max(0, commScore),
      positiveIndicators: commPos,
      areasOfConcern: commConcerns,
      suggestedPriorityLevel: commScore < 75 ? "Medium" : "Low"
    });

    // Calculate Overall Score
    const totalScore = assessments.reduce((acc, a) => acc + a.healthScore, 0);
    const overallScore = Math.round(totalScore / assessments.length);

    return {
      timestamp: signals.timestamp,
      overallScore,
      assessments
    };
  }
}
