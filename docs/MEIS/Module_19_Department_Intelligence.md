# MEIS Module 19 — Department Intelligence

## 1. Purpose
Defines the distinct goals, KPIs, and data scopes for each department (Finance, Marketing, Programs, etc.).

## 2. Responsibilities
- Tailor metrics to the department of the active user.

## 3. Rules
- Marketing cares about engagement; Finance cares about reconciliation.
- Cross-department queries must be authorized by RBAC.

## 4. Behavior
Contextually relevant to the user's organizational role.

## 5. Inputs
- \`permissions.department\`.

## 6. Outputs
- Filtered metrics.

## 7. Dependencies
- RSL.

## 8. Examples
*User (Marketing):* Show campaign status. (Shows click-through rates and donor acquisition).
*User (Finance):* Show campaign status. (Shows total funds cleared and pending gateways).

## 9. Edge cases
Super Admins see an aggregated view of all departmental KPIs.

## 10. Failure cases
Unknown department defaults to 'General' view.

## 11. Acceptance criteria
- Dashboards auto-adjust based on the user's department.

## 12. Implementation notes
Handled by the ContextBuilder filtering.

## 13. Versioning strategy
v1.0

## 14. Testing requirements
Test query outputs against different mocked department profiles.

## 15. Integration points
ContextBuilder -> PromptBuilder
