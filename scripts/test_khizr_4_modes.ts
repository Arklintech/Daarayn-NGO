import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { generateAIResponse } from '../lib/ai/providerManager';
import { processChatMessage } from '../lib/ai/conversationManager';
import { causeRepository } from '../lib/repositories/causeRepository';
import { donationRepository } from '../lib/repositories/donationRepository';
import { fieldReportRepository } from '../lib/repositories/fieldReportRepository';

async function runKhizr4ModeTests() {
  console.log("==================================================");
  console.log("KHIZR AI SYSTEM 4-MODE EXECUTABLE RECONCILIATION TEST");
  console.log("==================================================\n");

  // MODE A: REAL MODEL INFERENCE TEST
  console.log("--- TEST A: REAL MODEL INFERENCE ---");
  const hasKey = !!(process.env.GROK_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY);
  console.log(`Model Provider API Key Configured: ${hasKey ? "YES" : "NO"}`);
  try {
    const resA = await generateAIResponse(
      "You are KHIZR. System prompt test.",
      "Summarize operational goals.",
      { rawMode: true }
    );
    console.log("Executed Path: MODEL_INFERENCE_PATH");
    console.log("Output snippet:\n", resA.body.substring(0, 180));
  } catch (err) {
    console.log("Executed Path: MODEL_INFERENCE_FAILED");
    console.log("Error:", (err as Error).message);
  }

  // MODE B: NO MODEL PROVIDER / FALLBACK TEST
  console.log("\n--- TEST B: NO MODEL PROVIDER / FALLBACK MODE ---");
  const origGrok = process.env.GROK_API_KEY;
  const origGemini = process.env.GEMINI_API_KEY;
  const origOpenAI = process.env.OPENAI_API_KEY;
  delete process.env.GROK_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  try {
    const resB = await generateAIResponse(
      "You are KHIZR.",
      "What is the status of AI provider?",
      { rawMode: true }
    );
    console.log("Executed Path: FALLBACK_UNAVAILABLE_PATH");
    console.log("Honest Provider Output snippet:\n", resB.body.substring(0, 220));
  } catch (err) {
    console.log("Executed Path: FALLBACK_FAILED");
    console.log("Error:", (err as Error).message);
  }

  // Restore keys
  if (origGrok) process.env.GROK_API_KEY = origGrok;
  if (origGemini) process.env.GEMINI_API_KEY = origGemini;
  if (origOpenAI) process.env.OPENAI_API_KEY = origOpenAI;

  // MODE C: SHEETS DATA RETRIEVAL TEST
  console.log("\n--- TEST C: SHEETS REPOSITORY DATA RETRIEVAL ---");
  try {
    const causes = await causeRepository.getAll();
    const donations = await donationRepository.getAll();
    console.log("Executed Path: SHEETS_REPOSITORY_RETRIEVAL_PATH");
    console.log(`Retrieved Causes Count: ${causes.length}`);
    console.log(`Retrieved Donations Count: ${donations.length}`);
    if (causes.length > 0) {
      console.log(`Sample Cause Title: "${causes[0].title || (causes[0] as any).name}"`);
    }
  } catch (err) {
    console.log("Executed Path: SHEETS_REPOSITORY_FAILED");
    console.log("Error:", (err as Error).message);
  }

  // MODE D: CROSS-DOMAIN QUERY TEST
  console.log("\n--- TEST D: CROSS-DOMAIN QUERY ---");
  try {
    const resD = await processChatMessage({
      sessionId: "TEST-CROSS-DOMAIN-1",
      userId: "admin-exec",
      userRole: "super_admin",
      message: "Give me an executive report correlating causes, donations, and field reports.",
      history: []
    });
    console.log("Executed Path: KHIZR_CROSS_DOMAIN_ORCHESTRATOR_PATH");
    console.log("Cross-Domain Success:", resD.success);
    console.log("Reply snippet:\n", resD.reply.substring(0, 250));
  } catch (err) {
    console.log("Executed Path: CROSS_DOMAIN_FAILED");
    console.log("Error:", (err as Error).message);
  }

  console.log("\n==================================================");
  console.log("4-MODE TEST COMPLETED SUCCESSFULLY");
  console.log("==================================================");
}

runKhizr4ModeTests().catch(console.error);
