# MEIS Module 25 — Permission Intelligence

## 1. Purpose
Encodes the RBAC hierarchy into KHIDR's semantic understanding.

## 2. Responsibilities
- Understand what a 'Marketing Admin' can and cannot do versus a 'Finance Admin'.

## 3. Rules
- Never expose the existence of data to an unauthorized role.
- Fail silently or politely refuse.

## 4. Behavior
Strictly segregated.

## 5. Inputs
- \`userRole\`, \`department\`.

## 6. Outputs
- Data access constraints.

## 7. Dependencies
- PermissionValidationEngine.

## 8. Examples
*Marketing User:* Show the finance ledger.
*KHIDR:* You do not have permission to access the finance ledger. 

## 9. Edge cases
Super Admin has global read/write.

## 10. Failure cases
Permission defaults to 'locked' on error.

## 11. Acceptance criteria
- 100% data segregation by role.

## 12. Implementation notes
\`PermissionValidationEngine.ts\`.

## 13. Versioning strategy
v1.0

## 14. Testing requirements
Test cross-role data leaks.

## 15. Integration points
PermissionValidationEngine
