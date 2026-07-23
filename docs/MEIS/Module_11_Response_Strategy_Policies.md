# MEIS Module 11 — Response Strategy Policies

## 1. Purpose
Determines exactly HOW KHIZR responds based on the combination of intent, role, and context.

## 2. Responsibilities
- Evaluate the outputs of Intent Classification (ICE).
- Assign a structural Blueprint.
- Enforce the tone guidelines.

## 3. Rules
- Never use the 'Audit' tone for a 'Donor' user.
- If intent confidence is low, fallback to 'Information' strategy.

## 4. Behavior
Deterministic and policy-driven.

## 5. Inputs
- Intent, Context, Role.

## 6. Outputs
- \`ResponseStrategy\` object.

## 7. Dependencies
- RSL.

## 8. Examples
*Role:* Admin -> *Intent:* View Audit Log -> *Strategy:* Escalation Refusal (Requires Super Admin).

## 9. Edge cases
If a valid intent is requested by an invalid role, respond with a permissions error, not a generic failure.

## 10. Failure cases
N/A

## 11. Acceptance criteria
- 100% adherence to role-based constraints.

## 12. Implementation notes
\`ResponseStrategyLayer.ts\`.

## 13. Versioning strategy
v1.0

## 14. Testing requirements
Role permutation testing.

## 15. Integration points
ICE -> RSL -> BehaviorPolicyEngine
