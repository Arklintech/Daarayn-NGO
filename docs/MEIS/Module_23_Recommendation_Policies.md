# MEIS Module 23 — Recommendation Policies

## 1. Purpose
Governs when and how KHIDR can suggest actions to the administrator.

## 2. Responsibilities
- Provide actionable next steps.
- Avoid overwhelming the user with irrelevant suggestions.

## 3. Rules
- Suggestions must be contextually relevant to the current objective.
- Maximum of 3 suggestions per response.
- Must be executable via existing workflows.

## 4. Behavior
Anticipatory and practical.

## 5. Inputs
- EIO state, ICE intent.

## 6. Outputs
- \`potentialActions\` list.

## 7. Dependencies
- FeatureIntelligenceRegistry.

## 8. Examples
*After displaying a campaign:* "Would you like to allocate unrestricted funds to this campaign or generate a progress report?"

## 9. Edge cases
If the workflow is complete, suggest returning to the dashboard or ending the session.

## 10. Failure cases
N/A

## 11. Acceptance criteria
- Recommendations are always executable.

## 12. Implementation notes
Handled by the RSL and \`potentialActions\` schema.

## 13. Versioning strategy
v1.0

## 14. Testing requirements
Check relevance of recommendations.

## 15. Integration points
RSL
