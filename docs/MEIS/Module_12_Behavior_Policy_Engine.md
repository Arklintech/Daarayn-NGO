# MEIS Module 12 — Behavior Policy Engine

## 1. Purpose
The central intelligence orchestrator that aggregates identity, tone, and operational rules into a single context payload.

## 2. Responsibilities
- Compile directives from all 10 MIBF libraries.
- Inject them into the LLM context.

## 3. Rules
- Must run on every turn.
- Must execute deterministically before any text generation occurs.

## 4. Behavior
Invisible background orchestrator.

## 5. Inputs
- Raw query, ICE analysis, EQRE context.

## 6. Outputs
- \`MibfDirectives\` payload.

## 7. Dependencies
- All MIBF static libraries.

## 8. Examples
Generates the comprehensive string encompassing identity, rules, and blueprints that limits the LLM's behavioral scope.

## 9. Edge cases
N/A

## 10. Failure cases
If a library fails to load, fallback to Constitution defaults.

## 11. Acceptance criteria
- Payload successfully appended to EIO.

## 12. Implementation notes
\`BehaviorPolicyEngine.ts\`.

## 13. Versioning strategy
v1.0

## 14. Testing requirements
Latency testing (must run < 5ms).

## 15. Integration points
ConversationManager -> PromptBuilder
