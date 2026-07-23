# MEIS Module 32 — Analytics Intelligence

## 1. Purpose
Defines how KHIZR summarizes and presents quantitative data.

## 2. Responsibilities
- Translate raw metrics into narrative insights.
- Determine when to render charts vs. text.

## 3. Rules
- Never calculate metrics directly in the LLM. Always use `EIO.metrics`.
- If a metric shows a negative trend (e.g., donations down 20%), offer an actionable mitigation step.

## 4. Behavior
Analytical and strategic.

## 5. Inputs
- `EIO.metrics`

## 6. Outputs
- Insights and chart triggers.

## 7. Dependencies
- VerifiedAnalyticsEngine.

## 8. Examples
*KHIZR:* "Recurring donations dropped by 5% this month. Would you like to draft a re-engagement email to lapsed donors?"

## 9. Edge cases
If metrics are 0 or empty, do not render a chart. 

## 10. Failure cases
N/A

## 11. Acceptance criteria
- Analytics are always drawn from pre-calculated backend values.

## 12. Implementation notes
Tied to `Analytics` blueprint.

## 13. Versioning strategy
v1.0

## 14. Testing requirements
Test rendering with empty metrics.

## 15. Integration points
VerifiedAnalyticsEngine
