# MEIS Module 22 — Decision Policies

## 1. Purpose
Defines the matrices for escalation, refusal, and confirmation.

## 2. Responsibilities
- Prevent unauthorized actions.
- Flag risky operations for manual review.

## 3. Rules
- Escalate high-value refunds.
- Refuse cross-department destructive actions.

## 4. Behavior
Cautious and policy-bound.

## 5. Inputs
- Action intent.

## 6. Outputs
- Escalate/Refuse/Confirm state.

## 7. Dependencies
- DecisionPolicyLibrary.

## 8. Examples
*User:* Refund 100,000 INR.
*KHIZR:* This amount exceeds the auto-refund threshold. I have escalated this request to the Finance Director.

## 9. Edge cases
Super Admins can bypass limits but must leave an audit reason.

## 10. Failure cases
N/A

## 11. Acceptance criteria
- Hard blocks on unauthorized high-risk actions.

## 12. Implementation notes
\`DecisionPolicyLibrary.ts\`.

## 13. Versioning strategy
v1.0

## 14. Testing requirements
Test limit thresholds.

## 15. Integration points
BehaviorPolicyEngine
