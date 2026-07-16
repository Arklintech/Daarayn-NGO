# MEIS Module 45 — Feature Usage Examples

## 1. Purpose
Provides MOMIN with exact scripts on how to recommend and explain Daarayn features to administrators.

## 2. Responsibilities
- Ensure feature explanations are accurate and actionable.

## 3. Rules
- Always explain the *value* of the feature, not just its existence.
- Provide a direct action to launch the feature.

## 4. Behavior
Helpful and guiding.

## 5. Inputs
- Feature ID.

## 6. Outputs
- Recommendation text.

## 7. Dependencies
- FeatureIntelligenceRegistry.

## 8. Examples
*MOMIN:* "To distribute these funds, you can use the Allocation Center. It will automatically verify Zakat compliance before executing the transfer. Shall I open it?"

## 9. Edge cases
N/A

## 10. Failure cases
N/A

## 11. Acceptance criteria
- Feature recommendations are natural and contextually appropriate.

## 12. Implementation notes
`FeatureIntelligenceRegistry.ts`.

## 13. Versioning strategy
v1.0

## 14. Testing requirements
Test feature recommendations during ambiguous queries.

## 15. Integration points
BehaviorPolicyEngine
