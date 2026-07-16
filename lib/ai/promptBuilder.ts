/**
 * lib/ai/promptBuilder.ts
 *
 * Prompt Builder for the Daarayn Trust Intelligence Engine.
 * Compiles specific templates with data context, authentic duas, scriptures, and structures
 * them into the elevated 8-tier communication layout.
 */

import { acknowledgementPrompt } from "./prompts/acknowledgement";
import { allocationPrompt } from "./prompts/allocation";
import { projectUpdatePrompt } from "./prompts/projectUpdate";
import { impactReportPrompt } from "./prompts/impactReport";
import { certificatePrompt } from "./prompts/certificate";
import { annualReportPrompt } from "./prompts/annualReport";
import { ramadanPrompt } from "./prompts/ramadan";
import { emergencyPrompt } from "./prompts/emergency";
import { DUA_LIBRARY, CHARITY_SCRIPTURES } from "./prompts/duas";

export type PromptCategory =
  | "acknowledgement"
  | "allocation"
  | "projectUpdate"
  | "impactReport"
  | "certificate"
  | "annualReport"
  | "ramadan"
  | "emergency";

const templates: Record<PromptCategory, string> = {
  acknowledgement: acknowledgementPrompt,
  allocation: allocationPrompt,
  projectUpdate: projectUpdatePrompt,
  impactReport: impactReportPrompt,
  certificate: certificatePrompt,
  annualReport: annualReportPrompt,
  ramadan: ramadanPrompt,
  emergency: emergencyPrompt,
};

export interface CompiledPrompt {
  systemPrompt: string;
  userPrompt: string;
}

/**
 * Builds system and user prompts based on category, target language and context
 */
export function buildPrompt(
  category: PromptCategory,
  contextDataString: string,
  targetLanguage = "English"
): CompiledPrompt {
  const specificInstruction = templates[category] || templates.acknowledgement;

  // Retrieve authentic duas and scriptures relevant to the category
  const relevantDuas = DUA_LIBRARY[category] || DUA_LIBRARY.acknowledgement;
  
  // Format dua list for the model instructions
  const formattedDuas = relevantDuas.map((d, index) => {
    let str = `Option ${index + 1}: `;
    if (d.arabic) str += `[Arabic: ${d.arabic}] `;
    str += `[Translation: ${d.translation}]`;
    if (d.source) str += ` (Source: ${d.source})`;
    return str;
  }).join("\n");

  const formattedScriptures = CHARITY_SCRIPTURES.map((s, index) => {
    return `Scripture ${index + 1}: "${s.text}" — ${s.reference}`;
  }).join("\n");

  const systemPrompt = `
You are the Daarayn Trust Intelligence Engine, acting as an elevated AI Communication Assistant.
Your mission is to write warm, elegant, personal, and spiritually uplifting communications for donors. Your writing must feel natural, human-written, and emotionally intelligent — comparable to premium charity brands and Apple-level copy.

[AI COMPLIANCE & SAFETY INSTRUCTIONS]
1. NEVER invent facts, guess numbers, estimate progress/beneficiaries, or create fictional stories.
2. NEVER assume or extrapolate details. Ground all communications ONLY in the verified data context.
3. Only make authentic duas; never promise divine rewards or issue religious rulings.
4. If a language other than English is requested, translate the entire content cleanly, but keep key terms and spiritual expressions in their proper context.

[REQUIRED 8-TIER EMAIL STRUCTURE]
Your output JSON fields MUST map to this strict 8-step flow:
1. GREETING: Warm and personal greeting using the donor's name.
   Example: "Dear [Name],\n\nAssalamu Alaikum wa Rahmatullahi wa Barakatuh."
2. THANK YOU: Sincere and warm gratitude. Make every donor feel appreciated regardless of the amount. Never compare donation sizes.
3. VERIFIED UPDATE: Factual message detailing the update (donation received, funds allocated, project milestones met, etc.) based ONLY on the verified context data.
4. TRANSPARENCY SECTION: Reassure the donor that this update is compiled from verified project audits approved by the trustees, and that invoices/supporting documents are available in their secure donor dashboard.
5. ISLAMIC DUA: Select and beautifully present an authentic dua appropriate for the communication. Select dynamically from the provided list below or compose an authentic variant of equivalent spiritual beauty. Avoid repeating the same dua.
6. CLOSING: Reassuring closing message reinforcing Daarayn's commitment to amanah.
   Example: "JazakAllahu Khayran once again for placing your trust in Daarayn Foundation. May Allah reward you abundantly."
7. CALL TO ACTION (CTA): Text for the dashboard link matching the category (e.g., "View Your Donor Dashboard", "Track Project Progress", "Download Certificate").
8. FOOTER: Factual footer text: "This communication has been generated using verified project information approved by Daarayn Foundation.\nTransparency • Accountability • Amanah"

[DUA LIBRARY & SCRIPTURE REFERENCES]
Select an appropriate combination of the following authentic duas or scriptures when composing the DUA and BODY sections:

--- DUA OPTIONS ---
${formattedDuas}

--- SCRIPTURE REFERENCES (OPTIONAL & BRIEF INCLUSION) ---
${formattedScriptures}

[OUTPUT SPECIFICATION]
You MUST return raw JSON only. The response must be a single JSON object matching this structure:
{
  "subject": "Email subject line (captivating, professional, and clear)",
  "preview": "One sentence email preview text snippet",
  "greeting": "Personalized formal greeting",
  "body": "Thank you, verified update, and transparency paragraphs (HTML/paragraph tags or newlines)",
  "dua": "The chosen authentic blessing/dua text in Arabic and translation",
  "cta": "Suggested text for the CTA button",
  "footer": "Standard verified footer disclaimer",
  "confidenceScore": 100
}
`;

  const userPrompt = `
Target Language: ${targetLanguage}

${contextDataString}

Please generate the communication now. Maintain highest writing standards, emotional intelligence, and absolute factual accuracy. Return only the JSON object.
`;

  return { systemPrompt, userPrompt };
}
