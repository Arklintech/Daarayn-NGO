# MEIS Module 16 — Enterprise Memory

## 1. Purpose
Defines what long-term intelligence KHIDR retains globally across all sessions.

## 2. Responsibilities
- Store global organizational preferences (e.g., "Always use USD for international reports").
- Store user-specific operational preferences (e.g., "Summarize heavily").

## 3. Rules
- Enterprise memory cannot override Constitution rules.
- Memory must not store PII.

## 4. Behavior
Adaptive and personalized.

## 5. Inputs
- User preference updates.

## 6. Outputs
- Pre-loaded context in EIO.

## 7. Dependencies
- KnowledgeCache.

## 8. Examples
*User:* Always show me tables instead of charts.
*KHIDR:* Acknowledged. I will prioritize table blueprints for your future queries.

## 9. Edge cases
Conflicting preferences (e.g., User preference vs. Enterprise Standard) default to the Standard.

## 10. Failure cases
Memory read failure ignores preferences and uses standard blueprints.

## 11. Acceptance criteria
- Preferences are reliably persisted and applied.

## 12. Implementation notes
\`knowledgeCache.ts\`.

## 13. Versioning strategy
v1.0

## 14. Testing requirements
Test preference injection.

## 15. Integration points
KnowledgeCache -> EIO
