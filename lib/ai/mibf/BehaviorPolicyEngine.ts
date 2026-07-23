/**
 * lib/ai/mibf/BehaviorPolicyEngine.ts
 * 
 * Central orchestrator for the KHIZR Intelligence & Behavior Framework (MIBF).
 * Compiles directives from all 10 enterprise libraries into a single MibfDirectives object.
 */

import { IdentityLibrary } from "./IdentityLibrary";
import { CommunicationLibrary } from "./CommunicationLibrary";
import { BehaviorLibrary } from "./BehaviorLibrary";
import { ResponseBlueprintLibrary } from "./ResponseBlueprintLibrary";
import { FeatureIntelligenceRegistry } from "./FeatureIntelligenceRegistry";
import { OperationalPlaybookLibrary } from "./OperationalPlaybookLibrary";
import { DecisionPolicyLibrary } from "./DecisionPolicyLibrary";
import { EnterpriseKnowledgeRegistry } from "./EnterpriseKnowledgeRegistry";
import { ConversationIntelligenceLibrary } from "./ConversationIntelligenceLibrary";
import { ResponseLearningLibrary } from "./ResponseLearningLibrary";
import { ExecutiveExperienceLibrary } from "./ExecutiveExperienceLibrary";

import type { ICEAnalysis } from "../engines/IntentClassificationEngine";
import type { EQREResolution } from "../engines/EnterpriseQueryResolutionEngine";
import type { KhizrRole } from "../knowledge/permissionEngine";

export interface MibfDirectives {
  identity: string;
  communication: string;
  behavior: string;
  decisionPolicy: string;
  enterpriseKnowledge: string;
  conversationIntelligence: string;
  situationalContext: string; // Combined feature, playbook, and learning contexts based on intent
}

export class BehaviorPolicyEngine {
  /**
   * Evaluates the current intent and state, then queries the MIBF libraries
   * to construct the deterministic behavior policy for this specific request.
   */
  static compileDirectives(
    query: string,
    ice: ICEAnalysis,
    eqre: EQREResolution,
    userRole: KhizrRole
  ): MibfDirectives {
    
    // Base static identities and rules
    const identity = IdentityLibrary.getIdentityContext();
    const behavior = BehaviorLibrary.getBehaviorContext();
    const decisionPolicy = DecisionPolicyLibrary.getDecisionContext();
    const enterpriseKnowledge = EnterpriseKnowledgeRegistry.getKnowledgeContext();
    const conversationIntelligence = ConversationIntelligenceLibrary.getConversationContext();

    // Determine tone based on role and query
    let tone: "professional" | "executive" | "audit" | "operational" = "professional";
    if (userRole === "super_admin" && ice.intent === "reviewCompliance") tone = "audit";
    else if (userRole === "super_admin" || query.toLowerCase().includes("board") || query.toLowerCase().includes("executive")) tone = "executive";
    else if (ice.intent === "allocateDonation" || ice.intent === "publishUpdate") tone = "operational";

    const communication = CommunicationLibrary.getCommunicationContext(tone);

    // Build situational context based on the detected intent
    let situationalContext = "";
    
    // Map intents to playbooks/features/learning standards and inject proactive intelligence
    if (ice.intent === "donorIntelligence") {
      situationalContext += FeatureIntelligenceRegistry.getFeatureContext(["DonorsCRM"]);
      situationalContext += "\n\n" + OperationalPlaybookLibrary.getPlaybookContext("DonorManagement");
      situationalContext += "\n\n" + ResponseLearningLibrary.getLearningContext("ShowDonor");
      situationalContext += "\n\n[PROACTIVE INTELLIGENCE]\nCheck if the donor is inactive or lacks a recent acknowledgment. Recommend stewardship actions based on Donors CRM capabilities.";
    } else if (ice.intent === "generateReport" || ice.intent === "financialOverview") {
      situationalContext += FeatureIntelligenceRegistry.getFeatureContext(["Analytics"]);
      situationalContext += "\n\n" + ResponseLearningLibrary.getLearningContext("GenerateReport");
    } else if (ice.intent === "allocateDonation") {
      situationalContext += FeatureIntelligenceRegistry.getFeatureContext(["AllocationCenter", "ProjectsHub"]);
      situationalContext += "\n\n" + OperationalPlaybookLibrary.getPlaybookContext("CampaignManagement");
    } else if (ice.intent === "projectStatus") {
      situationalContext += FeatureIntelligenceRegistry.getFeatureContext(["ProjectsHub"]);
      situationalContext += "\n\n[PROACTIVE INTELLIGENCE]\nIdentify projects with critical funding gaps and recommend allocations if unrestricted funds are available.";
    }

    // MEIEP Phase 5: Inject Executive Experience Engine wisdom into every situational context
    situationalContext += "\n\n" + ExecutiveExperienceLibrary.getExperienceContext();

    return {
      identity,
      communication,
      behavior,
      decisionPolicy,
      enterpriseKnowledge,
      conversationIntelligence,
      situationalContext: situationalContext.trim()
    };
  }
}
