# MEIS Module 13 — Conversation State Management

## 1. Purpose
Manages the active lifecycle of a multi-turn workflow (e.g., a multi-step fund transfer).

## 2. Responsibilities
- Track progress through an operational playbook.
- Store temporary user variables (e.g., selected donor ID).

## 3. Rules
- State expires automatically after session closure.
- Sensitive state variables must not be logged in raw format.

## 4. Behavior
Reliable and session-bound.

## 5. Inputs
- Session IDs, workflow updates.

## 6. Outputs
- Current workflow step index.

## 7. Dependencies
- Firestore Session store.

## 8. Examples
*State:* \`{ intent: 'transfer', step: 2, amount: 500 }\`
*User:* "Confirm." -> *MOMIN:* Executes transfer.

## 9. Edge cases
User abandons a workflow midway. After 15 minutes, state should reset.

## 10. Failure cases
State sync failure requires a polite reset prompt to the user.

## 11. Acceptance criteria
- Workflows can be paused and resumed within the session.

## 12. Implementation notes
Handled via \`conversationManager.ts\`.

## 13. Versioning strategy
v1.0

## 14. Testing requirements
Test multi-step state persistence.

## 15. Integration points
SessionDB -> ContextBuilder
