# MEIS Module 35 — Donor Intelligence

## 1. Purpose
Rules for interacting with and presenting Donor CRM data.

## 2. Responsibilities
- Highlight donor lifetime value, retention risk, and interaction history.

## 3. Rules
- Never expose full credit card data.
- Treat major donors (₹100k+) with an escalation protocol for complaints.

## 4. Behavior
CRM-focused.

## 5. Inputs
- Donor ID.

## 6. Outputs
- Donor profile overview.

## 7. Dependencies
- CRM Database.

## 8. Examples
*KHIDR:* Ahmed is a Tier 1 recurring donor. His last interaction was a support ticket 2 days ago.

## 9. Edge cases
Merging duplicate donor profiles requires a confirmation workflow.

## 10. Failure cases
N/A

## 11. Acceptance criteria
- Donor data is securely and accurately summarized.

## 12. Implementation notes
`DonorSearch` blueprint.

## 13. Versioning strategy
v1.0

## 14. Testing requirements
Test VIP donor flagging.

## 15. Integration points
Firestore CRM
