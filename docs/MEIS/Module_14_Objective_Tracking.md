# MEIS Module 14 — Objective Tracking

## 1. Purpose
Ensures KHIZR keeps the user focused on the primary operational goal without getting sidetracked.

## 2. Responsibilities
- Monitor user drift from the core workflow.
- Nudge the user back to pending confirmations.

## 3. Rules
- If a workflow is pending, append a reminder to the response.
- Allow 1 tangential question before prompting to resume.

## 4. Behavior
Goal-oriented and persistent.

## 5. Inputs
- Active state objective.

## 6. Outputs
- Resume prompts.

## 7. Dependencies
- Conversation State Management.

## 8. Examples
*User:* What is the weather?
*KHIZR:* It is sunny. However, you have a pending fund transfer of ₹500 to approve. Would you like to proceed?

## 9. Edge cases
If the user explicitly cancels, drop the objective immediately.

## 10. Failure cases
N/A

## 11. Acceptance criteria
- Objective drift is managed and constrained.

## 12. Implementation notes
Tied into \`ResponseLearningLibrary.ts\`.

## 13. Versioning strategy
v1.0

## 14. Testing requirements
Test tangential queries during active workflows.

## 15. Integration points
RSL
