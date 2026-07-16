/**
 * lib/ai/planner.ts
 *
 * Action Planner for the Daarayn AI Trust Operating System (AI-TOS).
 * Compiles user queries into safe, structured ActionPlans requiring admin approval.
 */

import { generateAIResponse } from "./providerManager";

export interface ActionPlan {
  action: string;             // Action code (e.g. "UPDATE_PROGRAM_PROGRESS", "APPROVE_AI_DRAFT")
  parameters: Record<string, any>;
  description: string;        // Human-readable summary of what will happen
  requiredPermission: "super_admin" | "editor" | "inspector";
  isPlanValid: boolean;
}

/**
 * Parses user input to generate a potential ActionPlan.
 * AI never executes immediately; it only proposes a plan.
 */
export async function planAction(
  userInput: string,
  userRole: string,
  contextText: string
): Promise<ActionPlan | null> {
  const systemPrompt = `
You are the Daarayn AI-TOS Action Planner.
Your job is to analyze the user's operational request and compile it into a structured ActionPlan.

The available actions are:
1. "UPDATE_PROGRAM_PROGRESS"
   - Parameters: { "programId": string, "progress": number }
   - Required Permission: "editor"
2. "RECORD_ALLOCATION"
   - Parameters: { "donationId": string, "programId": string, "amount": number }
   - Required Permission: "editor"
3. "SEND_AUDIT_LOG"
   - Parameters: { "programId": string, "statement": string }
   - Required Permission: "inspector"

Guidelines:
- If the user's intent matches one of these actions, populate the details.
- If the intent is just informational or does not map to any action, return isPlanValid: false.
- Respect role permissions. If the user Role lacks authorization, set isPlanValid: false or note the conflict.

You MUST respond in JSON format ONLY:
{
  "action": "ACTION_CODE_OR_NONE",
  "parameters": {},
  "description": "Short explanation of proposed action",
  "requiredPermission": "editor",
  "isPlanValid": true
}
`;

  const userPrompt = `
User Role: ${userRole}
Request: "${userInput}"

Verified Context Data:
${contextText}
`;

  try {
    const targetModel = process.env.GROK_MODEL || "grok-2-1212";
    const response = await generateAIResponse(systemPrompt, userPrompt, {
      model: targetModel,
      temperature: 0.1,
    });

    if (response && response.isPlanValid && response.action !== "ACTION_CODE_OR_NONE") {
      return {
        action: response.action,
        parameters: response.parameters || {},
        description: response.description || "",
        requiredPermission: response.requiredPermission || "editor",
        isPlanValid: true,
      };
    }
    return null;
  } catch (err) {
    console.error("[Planner] Planning failed:", err);
    return null;
  }
}
