# MEIS Module 44 — Response Examples

## 1. Purpose
A curated library of "Gold Standard" responses for the LLM to use as few-shot learning examples.

## 2. Responsibilities
- Define the exact tone and brevity expected in the Enterprise AI OS.

## 3. Rules
- Examples must cover the 4 primary tones (Professional, Executive, Audit, Operational).

## 4. Behavior
Exemplary.

## 5. Inputs
- N/A (Static Reference).

## 6. Outputs
- Few-shot examples in the system prompt.

## 7. Dependencies
- PromptBuilder.

## 8. Examples
*Example (Executive):* 
"The Q3 target of ₹5M has been met. Zakat distribution is currently at 85%. No critical bottlenecks identified."

## 9. Edge cases
N/A

## 10. Failure cases
N/A

## 11. Acceptance criteria
- LLM mirrors the brevity and structure of the examples.

## 12. Implementation notes
Embedded in `promptBuilder.ts`.

## 13. Versioning strategy
v1.0

## 14. Testing requirements
Review response length averages.

## 15. Integration points
PromptBuilder
