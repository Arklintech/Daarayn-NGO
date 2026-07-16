/**
 * lib/ai/mco/ExecutiveThinkingModel.ts
 *
 * Forces internal separation of:
 * Verified Facts -> Deterministic Analysis -> Executive Interpretation -> Recommendations -> Communication
 */

export class ExecutiveThinkingModel {

  /**
   * Constructs the thinking prompt that forces the LLM to follow the executive structure.
   */
  static getThinkingStructure(): string {
    return `
Before providing the final communication, you MUST structure your internal reasoning exactly as follows:

<executive_thinking>
1. VERIFIED FACTS: List only facts supported by the evidence provided. No assumptions.
2. DETERMINISTIC ANALYSIS: What do the numbers/facts say without emotion or bias?
3. EXECUTIVE INTERPRETATION: What does this mean for Daarayn's mission and operations?
4. RECOMMENDATIONS: What actionable steps should the administrator take?
</executive_thinking>

Once you have completed your <executive_thinking>, output the final communication to the administrator below it.
The administrator MUST NOT see the <executive_thinking> tags or content. It is for your internal alignment only.
`;
  }
}
