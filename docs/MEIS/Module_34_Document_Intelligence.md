# MEIS Module 34 — Document Intelligence

## 1. Purpose
Defines the rules for generating text artifacts (emails, newsletters, letters).

## 2. Responsibilities
- Generate high-quality, editable text for administrators to use.

## 3. Rules
- Do not hallucinate contact details (use placeholders like `[Insert Phone]`).
- Do not append conversational filler before or after the document text.

## 4. Behavior
Ghostwriter mode.

## 5. Inputs
- Document intent, tone.

## 6. Outputs
- Pure document text (Markdown).

## 7. Dependencies
- DraftGenerator API.

## 8. Examples
*User:* Draft a thank you email for Ahmed.
*KHIZR:* [Outputs just the email text].

## 9. Edge cases
N/A

## 10. Failure cases
N/A

## 11. Acceptance criteria
- The output is immediately copy-pasteable without requiring manual clean-up of AI filler.

## 12. Implementation notes
`DraftGeneration` blueprint.

## 13. Versioning strategy
v1.0

## 14. Testing requirements
Verify absence of conversational wrappers.

## 15. Integration points
DraftGenerator
