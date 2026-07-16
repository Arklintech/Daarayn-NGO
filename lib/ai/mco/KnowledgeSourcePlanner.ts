/**
 * lib/ai/mco/KnowledgeSourcePlanner.ts
 *
 * Automatically determines which backend sources are required based on the ExecutionPlan.
 * Administrator never specifies source.
 */

import type { ExecutionPlan } from "./ExecutiveQueryPlanner";

export type KnowledgeSource = 
  | "Firestore"
  | "Gmail"
  | "Documents"
  | "Reports"
  | "Communications"
  | "Public Ledger"
  | "Audit Logs"
  | "Tasks"
  | "Analytics"
  | "Organizational Memory"
  | "None";

export class KnowledgeSourcePlanner {

  static determineSources(plan: ExecutionPlan): KnowledgeSource[] {
    const sources: Set<KnowledgeSource> = new Set();
    
    // Always include Organizational Memory for executive context
    sources.add("Organizational Memory");

    // Base sources on primary capability
    switch (plan.capability) {
      case "Donor Intelligence":
      case "Donation Intelligence":
      case "Project Intelligence":
      case "Beneficiary Intelligence":
      case "Campaign Intelligence":
      case "Volunteer Intelligence":
        sources.add("Firestore");
        sources.add("Analytics");
        break;
      
      case "Financial Intelligence":
        sources.add("Firestore");
        sources.add("Reports");
        sources.add("Public Ledger");
        break;
        
      case "Email Intelligence":
      case "Communication Intelligence":
        sources.add("Gmail");
        sources.add("Communications");
        break;
        
      case "Compliance Intelligence":
      case "Governance Intelligence":
      case "Investigations":
        sources.add("Audit Logs");
        sources.add("Firestore");
        sources.add("Documents");
        break;
        
      case "Reporting Intelligence":
      case "Document Intelligence":
        sources.add("Reports");
        sources.add("Documents");
        break;
        
      case "Public Ledger Intelligence":
        sources.add("Public Ledger");
        break;
        
      case "Executive Briefings":
      case "Strategic Planning":
      case "Decision Support":
        sources.add("Analytics");
        sources.add("Reports");
        sources.add("Firestore");
        break;
        
      default:
        // Operational Intelligence, etc
        sources.add("Firestore");
        break;
    }

    return Array.from(sources);
  }
}
