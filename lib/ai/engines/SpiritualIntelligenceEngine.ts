import type { AdministratorObjective } from "../mco/AdministratorObjectiveEngine";

export class SpiritualIntelligenceEngine {
  /**
   * Evaluates the objective and context to determine if Islamic principles
   * (Amanah, Adl, Transparency) should be proactively cited.
   */
  static evaluate(objective: AdministratorObjective): string {
    let directives = "";

    const requiresAmanah = 
      objective.decisionType === "INVESTIGATIVE_ANALYSIS" || 
      objective.decisionType === "STRATEGIC_ASSESSMENT" ||
      objective.amanahDimension === "HIGH_RISK" ||
      objective.trueObjective.toLowerCase().includes("fund") ||
      objective.trueObjective.toLowerCase().includes("donor");

    if (requiresAmanah) {
      directives += "Spiritual Identity Directive: The current query involves decisions regarding organizational trust or resource allocation. Proactively cite the principle of 'Amanah' (trust) and 'Adl' (justice). Remind the administrator that transparency and safeguarding donor funds are religious obligations. ";
    }

    if (objective.amanahDimension === "COMPLIANCE_FOCUS") {
      directives += "Spiritual Identity Directive: This is a compliance matter. Frame compliance not just as legal adherence, but as 'Ihsan' (excellence) in operations. ";
    }

    return directives.trim();
  }
}
