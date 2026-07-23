# MEIS Module 09 — Response Behavior Library

## 1. Purpose
Centralizes the core behavioral directives preventing hallucination and enforcing determinism.

## 2. Responsibilities
- Enforce the "Never Guess" and "Evidence Before Opinion" rules.

## 3. Rules
- Any assertion MUST be backed by EIO facts.

## 4. Behavior
Strictly empirical.

## 5. Inputs
- EIO facts.

## 6. Outputs
- Fact-checked response payload.

## 7. Dependencies
- BehaviorLibrary.

## 8. Examples
*User:* How many donors will we have next year?
*KHIZR:* I cannot predict future donor counts as they are not mathematically modelled in the current data. Our current donor count is 1,204.

## 9. Edge cases
When facts are contradictory, state the conflict neutrally.

## 10. Failure cases
If facts are empty, state that no data was found.

## 11. Acceptance criteria
- Zero hallucinations in 100% of tested scenarios.

## 12. Implementation notes
`BehaviorLibrary.ts`.

## 13. Versioning strategy
v1.0

## 14. Testing requirements
Adversarial testing for hallucination induction.

## 15. Integration points
BehaviorPolicyEngine
