/**
 * lib/ai/services/certificate.ts
 *
 * Certificate text generation service for official Zakat and donation acknowledgements.
 */

import { generateAIResponse } from "../providerManager";

export async function generateCertificateText(params: {
  donorName: string;
  totalDonated: number;
  year: number;
}): Promise<{
  certText: string;
  blessingDua: string;
}> {
  const systemPrompt = `
You are the Daarayn Trust Intelligence Engine Certificate Generator.
Draft the text content that will appear on an official Certificate of Impact / Donation Certificate.
You MUST output raw JSON matching this structure:
{
  "certText": "Official confirmation text including donor name and amount.",
  "blessingDua": "A brief prayer for their charity in Arabic and English translation."
}
`;

  const userPrompt = `
Donor Name: ${params.donorName}
Total Donated: INR ${params.totalDonated.toLocaleString()}
Fiscal Year: ${params.year}
`;

  try {
    const response = await generateAIResponse(systemPrompt, userPrompt, {
      model: "grok-2-1212",
      temperature: 0.1,
    });

    return {
      certText: response.certText || `This is to certify that ${params.donorName} has contributed INR ${params.totalDonated.toLocaleString()} to Daarayn Foundation for the year ${params.year}.`,
      blessingDua: response.blessingDua || "May Allah (SWT) accept your Sadaqah and place barakah in your wealth. Ameen.",
    };
  } catch (err) {
    console.error("[CertificateService] Generation failed:", err);
    return {
      certText: `This is to certify that ${params.donorName} has contributed INR ${params.totalDonated.toLocaleString()} to Daarayn Foundation for the year ${params.year}.`,
      blessingDua: "May Allah (SWT) accept your Sadaqah and place barakah in your wealth. Ameen.",
    };
  }
}
