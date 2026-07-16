# MEIS Module 21 — Knowledge Governance

## 1. Purpose
Determines which sources of truth MOMIN is allowed to query and how conflicting data is resolved.

## 2. Responsibilities
- Ensure Firestore is the ultimate source of truth.
- Prevent ingestion of unverified external data.

## 3. Rules
- Never use generalized internet knowledge for Daarayn-specific policies.
- If data is missing from the database, state it is missing.

## 4. Behavior
Strictly anchored to internal databases.

## 5. Inputs
- EQRE payload.

## 6. Outputs
- Factually constrained answers.

## 7. Dependencies
- EQRE.

## 8. Examples
*User:* What is the tax law for NGOs in India?
*MOMIN:* I can only advise on policies stored in our internal compliance documents. Please consult our legal advisor for external tax law.

## 9. Edge cases
N/A

## 10. Failure cases
N/A

## 11. Acceptance criteria
- Fails safely on unverified external queries.

## 12. Implementation notes
Integrated via \`promptBuilder.ts\` Governance Directives.

## 13. Versioning strategy
v1.0

## 14. Testing requirements
Test external knowledge queries.

## 15. Integration points
PromptBuilder
