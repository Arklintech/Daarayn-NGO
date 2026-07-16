/**
 * lib/ai/services/communication.ts
 *
 * Orchestration Service for generating verified donor communications.
 */

import { collectDonorData, collectDonationData, collectAllocationData, collectProgramData, collectUpdateData } from "../verifiedDataCollector";
import type { VerifiedDataContext } from "../verifiedDataCollector";
import { buildAIContext } from "../contextBuilder";
import { buildPrompt } from "../promptBuilder";
import type { PromptCategory } from "../promptBuilder";
import { generateAIResponse } from "../providerManager";
import { validateResponse } from "../validator";
import type { ValidationReport } from "../validator";
import { checkCompliance } from "../compliance";
import type { ComplianceReport } from "../compliance";

export interface GeneratedDraftResult {
  success: boolean;
  category: PromptCategory;
  language: string;
  payload: {
    subject: string;
    preview: string;
    greeting: string;
    body: string;
    dua: string;
    cta: string;
    footer: string;
  };
  validation: ValidationReport;
  compliance: ComplianceReport;
  contextLogs: string;
  error?: string;
}

/**
 * Orchestrates the full lifecycle of drafting verified communications.
 */
export async function draftCommunication(params: {
  category: PromptCategory;
  rawDonor?: any;
  rawDonation?: any;
  rawAllocation?: any;
  rawProgram?: any;
  rawUpdate?: any;
  customNotes?: string;
  language?: string;
}): Promise<GeneratedDraftResult> {
  const language = params.language || "English";
  const verifiedContext: VerifiedDataContext = {};

  try {
    // 1. Safe data collection
    if (params.rawDonor) verifiedContext.donor = collectDonorData(params.rawDonor);
    if (params.rawDonation) verifiedContext.donation = collectDonationData(params.rawDonation);
    if (params.rawAllocation) verifiedContext.allocation = collectAllocationData(params.rawAllocation);
    if (params.rawProgram) verifiedContext.program = collectProgramData(params.rawProgram);
    if (params.rawUpdate) verifiedContext.projectUpdate = collectUpdateData(params.rawUpdate);
    if (params.customNotes) verifiedContext.customNotes = params.customNotes;

    // 2. Build high-density context
    const contextString = buildAIContext(verifiedContext);

    // 3. Compile prompts
    const { systemPrompt, userPrompt } = buildPrompt(params.category, contextString, language);

    // 4. Invoke Grok / AI Provider
    const aiResponse = await generateAIResponse(systemPrompt, userPrompt);

    // 5. Validate structure and score qualities
    const validation = validateResponse(aiResponse, verifiedContext.donor?.name);

    // 6. Cross-reference database facts (Compliance audit)
    const compliance = checkCompliance(aiResponse, verifiedContext);

    const success = validation.isValid && compliance.isCompliant;

    return {
      success,
      category: params.category,
      language,
      payload: {
        subject: aiResponse.subject,
        preview: aiResponse.preview,
        greeting: aiResponse.greeting,
        body: aiResponse.body,
        dua: aiResponse.dua,
        cta: aiResponse.cta,
        footer: aiResponse.footer,
      },
      validation,
      compliance,
      contextLogs: contextString,
    };
  } catch (error) {
    console.error("[CommunicationService] Orchestration Failure:", error);
    return {
      success: false,
      category: params.category,
      language,
      payload: {
        subject: "",
        preview: "",
        greeting: "",
        body: "",
        dua: "",
        cta: "",
        footer: "",
      },
      validation: {
        isValid: false,
        errors: [`Engine execution failed: ${(error as Error).message}`],
        qualityScore: { accuracy: 0, grammar: 0, readability: 0, tone: 0, transparency: 0, personalization: 0, overall: 0 },
      },
      compliance: { isCompliant: false, mismatches: ["Compliance evaluation aborted due to execution failure."], auditedAt: new Date().toISOString() },
      contextLogs: "",
      error: (error as Error).message,
    };
  }
}
