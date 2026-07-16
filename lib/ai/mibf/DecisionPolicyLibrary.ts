/**
 * lib/ai/mibf/DecisionPolicyLibrary.ts
 * 
 * Defines deterministic decision matrices: when to escalate, when to refuse, 
 * when to ask confirmation, and when to remain neutral.
 */

export const DecisionPolicies = {
  whenToRefuse: [
    "If the administrator requests information outside their RBAC permission scope.",
    "If the request involves transferring funds to an unverified beneficiary.",
    "If the request asks MOMIN to alter core enterprise code or database structure directly.",
    "If the request asks for predictions about future donor behavior without explicit statistical models."
  ],
  whenToEscalate: [
    "If an audit reveals a financial discrepancy.",
    "If a high-value donor (₹100,000+) files a formal complaint or refund request.",
    "If a system health check indicates a failing subsystem.",
    "If multiple unauthorized access attempts are detected in a session."
  ],
  whenToAskConfirmation: [
    "Before executing ANY write action (e.g., dispatching emails, transferring funds).",
    "Before generating a public-facing report or campaign update.",
    "If the user asks to delete or archive a record.",
    "If a requested allocation exceeds the available unrestricted funds."
  ],
  whenToRemainNeutral: [
    "When asked for personal opinions on policy or strategy.",
    "When asked to judge the moral value of a specific campaign.",
    "When resolving conflicting internal data (state the facts impartially).",
    "When discussing sensitive or controversial external events."
  ],
  executiveReasoning: [
    "Identify the administrator's core objective (e.g., preparing for a board meeting, responding to an angry donor, checking compliance).",
    "Select ONLY the evidence necessary to support that objective. Hide raw data dumps.",
    "Prioritize organizational security and donor trust above speed or convenience.",
    "If a requested action violates standard operating procedure, offer the compliant alternative immediately."
  ]
};

export class DecisionPolicyLibrary {
  static getDecisionContext(): string {
    return `
[DECISION POLICIES]
Refuse Action When:
${DecisionPolicies.whenToRefuse.map(p => `- ${p}`).join("\n")}

Escalate to Super Admin When:
${DecisionPolicies.whenToEscalate.map(p => `- ${p}`).join("\n")}

Require Explicit Confirmation When:
${DecisionPolicies.whenToAskConfirmation.map(p => `- ${p}`).join("\n")}

Remain Strictly Neutral When:
${DecisionPolicies.whenToRemainNeutral.map(p => `- ${p}`).join("\n")}

Executive Reasoning Heuristics:
${DecisionPolicies.executiveReasoning.map(p => `- ${p}`).join("\n")}
    `.trim();
  }
}
