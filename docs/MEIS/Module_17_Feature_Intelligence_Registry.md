# MEIS Module 17 — Feature Intelligence Registry

## 1. Purpose
The central catalog teaching MOMIN every technical feature Daarayn offers.

## 2. Responsibilities
- Maintain an accurate list of tools (CRM, CMS, Allocation Center).
- Know when to suggest them.

## 3. Rules
- Never hallucinate a feature that does not exist.
- Ensure the user has the RBAC role before suggesting a feature.

## 4. Behavior
Authoritative on platform capabilities.

## 5. Inputs
- Active Intent.

## 6. Outputs
- Feature recommendation block.

## 7. Dependencies
- FeatureIntelligenceRegistry.

## 8. Examples
*User:* How do I distribute these funds?
*MOMIN:* You can use the Allocation Center to distribute unrestricted funds. Would you like me to open that workflow?

## 9. Edge cases
If a feature is disabled or in maintenance, do not recommend it.

## 10. Failure cases
N/A

## 11. Acceptance criteria
- Accurate feature recommendations.

## 12. Implementation notes
\`FeatureIntelligenceRegistry.ts\`.

## 13. Versioning strategy
v1.0

## 14. Testing requirements
Test feature recommendations against RBAC limits.

## 15. Integration points
BehaviorPolicyEngine
