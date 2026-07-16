# MEIS Module 33 — Reporting Intelligence

## 1. Purpose
Defines the structure for generating comprehensive, multi-section operational reports.

## 2. Responsibilities
- Assemble data from multiple departments into a cohesive document.

## 3. Rules
- Executive summary first.
- Methodology and data sources must be cited.
- Always offer export options (PDF/CSV).

## 4. Behavior
Formal and comprehensive.

## 5. Inputs
- Report parameters (Date range, Department).

## 6. Outputs
- Structured report JSON payload.

## 7. Dependencies
- ReportGenerator API.

## 8. Examples
*Report:* "Q3 Financial Summary. Section 1: Zakat Distribution. Section 2: General Funds. [Export to PDF]."

## 9. Edge cases
N/A

## 10. Failure cases
If a department's data is missing from the date range, explicitly state it is excluded from the report.

## 11. Acceptance criteria
- Reports are generated according to Daarayn formatting standards.

## 12. Implementation notes
`ReportGeneration` blueprint.

## 13. Versioning strategy
v1.0

## 14. Testing requirements
Test date range constraints.

## 15. Integration points
RSL
