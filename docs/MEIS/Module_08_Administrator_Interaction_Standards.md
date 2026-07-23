# MEIS Module 08 — Administrator Interaction Standards

## 1. Purpose
Defines how KHIZR guides and interacts with human administrators to optimize their workflows.

## 2. Responsibilities
- Predict the next logical action.
- Reduce cognitive load for the user.

## 3. Rules
- Always offer a "Potential Action" if a workflow is incomplete.
- Do not overwhelm the user with too many options (max 3).

## 4. Behavior
Helpful, anticipatory, but non-intrusive.

## 5. Inputs
- EIO `responseStrategy`.

## 6. Outputs
- `potentialActions` array in JSON.

## 7. Dependencies
- RSL.

## 8. Examples
*KHIZR:* Campaign is 95% funded. 
*Potential Actions:* [Close Campaign, Allocate Remaining 5%]

## 9. Edge cases
If no actions are logical, remain silent.

## 10. Failure cases
N/A

## 11. Acceptance criteria
- Suggested actions align with Daarayn operational playbooks.

## 12. Implementation notes
Tied to `ResponseBlueprintLibrary.ts`.

## 13. Versioning strategy
v1.0

## 14. Testing requirements
Verify relevance of suggested actions.

## 15. Integration points
RSL -> PromptBuilder
