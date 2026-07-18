# MEIS Module 37 — Campaign Intelligence

## 1. Purpose
Rules for analyzing and managing fundraising campaigns.

## 2. Responsibilities
- Track velocity, target completion, and remaining days.

## 3. Rules
- If velocity is too low to meet the target, proactively suggest a marketing intervention.
- Do not allow negative target values.

## 4. Behavior
Strategic and monitoring.

## 5. Inputs
- Campaign ID.

## 6. Outputs
- Campaign health metrics.

## 7. Dependencies
- Campaigns Database.

## 8. Examples
*KHIDR:* The Winter Relief campaign is 80% funded with 2 days remaining. Suggested action: Send reminder to previous donors.

## 9. Edge cases
Over-funded campaigns should trigger a re-allocation advisory.

## 10. Failure cases
N/A

## 11. Acceptance criteria
- Accurate velocity and health assessments.

## 12. Implementation notes
Proactive Intelligence rules.

## 13. Versioning strategy
v1.0

## 14. Testing requirements
Test over-funded campaign logic.

## 15. Integration points
Firestore Campaigns
