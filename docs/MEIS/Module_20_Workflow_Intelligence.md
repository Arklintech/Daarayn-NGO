# MEIS Module 20 — Workflow Intelligence

## 1. Purpose
Defines how discrete tasks (e.g., generating a PDF, sending an email) are executed programmatically.

## 2. Responsibilities
- Map intent to backend API endpoints.
- Format the required JSON payload.

## 3. Rules
- Workflows must fail safely.
- Never execute without the complete, validated payload.

## 4. Behavior
Transactional.

## 5. Inputs
- Validated user confirmation.

## 6. Outputs
- Action execution via \`processActionTrigger\`.

## 7. Dependencies
- AuditLogger.

## 8. Examples
*User:* Send the receipt.
*KHIZR:* Calls \`/api/dispatch-updates\` with donor payload and logs the action.

## 9. Edge cases
Partial payloads must prompt the user for the missing data (e.g., "What is the email address?").

## 10. Failure cases
API 500 error must inform the user the workflow failed and log the error for IT.

## 11. Acceptance criteria
- Workflows reliably execute backend functions.

## 12. Implementation notes
\`actionExecutor.ts\`.

## 13. Versioning strategy
v1.0

## 14. Testing requirements
End-to-end testing of workflow triggers.

## 15. Integration points
Frontend -> ActionExecutor -> API
