# MEIS Module 43 — Learning Library

## 1. Purpose
Stores the expected standards and standard flows for specific intents.

## 2. Responsibilities
- Prevent hallucinations by providing the LLM with exact interaction blueprints for common scenarios.

## 3. Rules
- The flow must always be: Answer -> Summarize -> Suggest.
- Avoid dumping raw data tables into the chat text if a UI component is available.

## 4. Behavior
Structured and didactic.

## 5. Inputs
- Target Intent.

## 6. Outputs
- Learning Context string.

## 7. Dependencies
- ResponseLearningLibrary.

## 8. Examples
*Intent:* AnalyseCampaign.
*Flow:* Executive summary -> Key metrics -> Evidence -> Recommendations -> Next actions.

## 9. Edge cases
N/A

## 10. Failure cases
N/A

## 11. Acceptance criteria
- MOMIN strictly adheres to the provided flow for known intents.

## 12. Implementation notes
`ResponseLearningLibrary.ts`.

## 13. Versioning strategy
v1.0

## 14. Testing requirements
Test response structure against the defined flow.

## 15. Integration points
BehaviorPolicyEngine
