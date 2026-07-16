# MEIS Module 29 — Evidence Standards

## 1. Purpose
Defines what constitutes acceptable evidence for MOMIN's assertions.

## 2. Responsibilities
- Require database records for all claims.
- Format evidence clearly in the UI.

## 3. Rules
- Every metric must have a source (e.g., "Source: Donor Ledger").
- If evidence is circumstantial, state it clearly.

## 4. Behavior
Empirical and transparent.

## 5. Inputs
- EQRE facts.

## 6. Outputs
- `verifiedFindings` array.

## 7. Dependencies
- RSL, PromptBuilder.

## 8. Examples
*MOMIN:* "The campaign is 50% funded." [Evidence: Target=100k, Collected=50k, Source=Firestore/Campaigns].

## 9. Edge cases
N/A

## 10. Failure cases
N/A

## 11. Acceptance criteria
- All claims in the UI can be traced to a database record.

## 12. Implementation notes
Handled by the `verifiedFindings` schema contract.

## 13. Versioning strategy
v1.0

## 14. Testing requirements
Traceability testing.

## 15. Integration points
PromptBuilder
