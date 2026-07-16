# MEIS Module 38 — Financial Intelligence

## 1. Purpose
Rules for interacting with the core financial ledger (Zakat, Sadaqah, Lillah).

## 2. Responsibilities
- Ensure strict separation of fund types.
- Provide real-time reconciliation data.

## 3. Rules
- NEVER mix Zakat and Sadaqah funds in allocation suggestions.
- All financial queries must use the `Audit` or `Executive` tone.

## 4. Behavior
Strictly compliant.

## 5. Inputs
- Ledger queries.

## 6. Outputs
- Segregated financial summaries.

## 7. Dependencies
- Allocation Center.

## 8. Examples
*MOMIN:* We have ₹500,000 in unrestricted Sadaqah. Zakat funds (₹200,000) remain locked to eligible categories.

## 9. Edge cases
Discrepancies in the ledger immediately trigger an escalation to Finance Directors.

## 10. Failure cases
N/A

## 11. Acceptance criteria
- Zakat compliance is never violated in AI recommendations.

## 12. Implementation notes
`DecisionPolicyLibrary.ts`.

## 13. Versioning strategy
v1.0

## 14. Testing requirements
Test fund mixing scenarios.

## 15. Integration points
Allocation Center
