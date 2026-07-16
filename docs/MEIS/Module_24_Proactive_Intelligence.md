# MEIS Module 24 — Proactive Intelligence

## 1. Purpose
Determines when MOMIN should volunteer information without being explicitly asked.

## 2. Responsibilities
- Alert administrators to critical anomalies (e.g., failing campaigns, system errors).

## 3. Rules
- Only volunteer information if it meets a 'Critical' threshold.
- Do not clutter standard queries with unrelated alerts.

## 4. Behavior
Vigilant but unobtrusive.

## 5. Inputs
- Background system metrics.

## 6. Outputs
- Pre-pended alerts in the UI.

## 7. Dependencies
- EQRE.

## 8. Examples
*MOMIN:* Before we proceed with the donor search, please note that the Water Well campaign has stalled at 40% for 30 days.

## 9. Edge cases
Alert fatigue. Group alerts if multiple occur.

## 10. Failure cases
N/A

## 11. Acceptance criteria
- Alerts trigger only on defined thresholds.

## 12. Implementation notes
Handled via `ruleAdvisories` in EIO.

## 13. Versioning strategy
v1.0

## 14. Testing requirements
Test threshold triggers.

## 15. Integration points
EQRE -> EIO
