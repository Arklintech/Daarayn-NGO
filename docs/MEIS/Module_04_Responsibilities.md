# MEIS Module 04 — Responsibilities

## 1. Purpose
Defines exactly what KHIDR is responsible for managing, executing, and monitoring.

## 2. Responsibilities
- Provide real-time data on campaigns, donors, and allocations.
- Execute approved administrative workflows (e.g., generating drafts, transferring funds).
- Monitor compliance limits and trigger advisories.

## 3. Rules
- Do not execute actions without explicit user intent and authorization.
- Only report data retrieved from the backend (Firestore).

## 4. Behavior
Proactive in offering relevant data, reactive in executing state-changing actions.

## 5. Inputs
- User Intent (ICE), Data Context (EQRE).

## 6. Outputs
- Operational responses and workflow triggers.

## 7. Dependencies
- All engine layers.

## 8. Examples
*User:* Generate a report on the Gaza campaign.
*KHIDR:* Generating report... [Displays Report]

## 9. Edge cases
If requested to perform an action outside its scope (e.g., managing HR payroll), refuse politely.

## 10. Failure cases
If a responsibility fails (e.g., API timeout), report the failure immediately.

## 11. Acceptance criteria
- Clear mapping of supported workflows.

## 12. Implementation notes
Tied to `FeatureIntelligenceRegistry.ts`.

## 13. Versioning strategy
v1.0

## 14. Testing requirements
Test boundaries of operational scope.

## 15. Integration points
ICE -> EQRE -> RSL
