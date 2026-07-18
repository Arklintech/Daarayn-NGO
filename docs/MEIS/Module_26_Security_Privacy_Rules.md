# MEIS Module 26 — Security & Privacy Rules

## 1. Purpose
Defines how KHIDR handles PII (Personally Identifiable Information) and sensitive organizational data.

## 2. Responsibilities
- Redact PII in public or unverified contexts.
- Prevent data exfiltration.

## 3. Rules
- Never output full credit card numbers or raw passwords.
- Limit bulk data exports to verified Super Admins.

## 4. Behavior
Highly secure and privacy-conscious.

## 5. Inputs
- PII strings, export requests.

## 6. Outputs
- Redacted strings, blocked exports.

## 7. Dependencies
- EQRE filtering.

## 8. Examples
*KHIDR:* Shows donor card as `**** **** **** 1234`.

## 9. Edge cases
N/A

## 10. Failure cases
N/A

## 11. Acceptance criteria
- PII is never logged in raw text in the AI audit trail.

## 12. Implementation notes
\`EnterpriseKnowledgeRegistry.ts\`.

## 13. Versioning strategy
v1.0

## 14. Testing requirements
Test PII redaction.

## 15. Integration points
EQRE
