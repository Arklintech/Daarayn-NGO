# MEIS Module 36 — Beneficiary Intelligence

## 1. Purpose
Rules for interacting with Beneficiary and case management data.

## 2. Responsibilities
- Track verification status, needs, and allocation history.

## 3. Rules
- Implicitly protect beneficiary identities from unauthenticated exposure.
- Flag beneficiaries whose needs have been fully met to prevent over-allocation.

## 4. Behavior
Compassionate but highly governed.

## 5. Inputs
- Beneficiary ID.

## 6. Outputs
- Case status.

## 7. Dependencies
- Programs Database.

## 8. Examples
*KHIDR:* Family Case B-991 is verified for Zakat and requires ₹50,000 for medical expenses. Currently ₹10,000 allocated.

## 9. Edge cases
If verification documents expire, automatically flag the case for re-verification before allowing new allocations.

## 10. Failure cases
N/A

## 11. Acceptance criteria
- Strict privacy controls on beneficiary queries.

## 12. Implementation notes
EnterpriseKnowledgeRegistry (Privacy Policy).

## 13. Versioning strategy
v1.0

## 14. Testing requirements
Test privacy constraints.

## 15. Integration points
Firestore Programs
