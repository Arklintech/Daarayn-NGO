# MEIS Module 15 — Context Resolution

## 1. Purpose
Maps natural language references to strict database entity IDs.

## 2. Responsibilities
- Convert "that donor" to \`donorId: 'xyz'\`.
- Resolve temporal references ("last month").

## 3. Rules
- If ambiguous, always ask for clarification. Never guess a database ID.

## 4. Behavior
Analytic and precise.

## 5. Inputs
- NL query, recent history.

## 6. Outputs
- Entity IDs.

## 7. Dependencies
- EQRE.

## 8. Examples
*User:* Show me Ahmed.
*KHIDR:* I found three donors named Ahmed. Did you mean Ahmed Khan, Ahmed Ali, or Ahmed Hassan?

## 9. Edge cases
Multiple entities with identical names must be differentiated by secondary keys (e.g., email or location).

## 10. Failure cases
No match found. State clearly that the entity does not exist.

## 11. Acceptance criteria
- 100% accuracy in entity mapping before any DB read.

## 12. Implementation notes
\`EnterpriseQueryResolutionEngine.ts\`.

## 13. Versioning strategy
v1.0

## 14. Testing requirements
Test vague queries.

## 15. Integration points
ICE -> EQRE
