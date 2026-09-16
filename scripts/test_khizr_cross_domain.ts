import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { processChatMessage } from "../lib/ai/conversationManager";
import { donationRepository } from "../lib/repositories/donationRepository";
import { donorRepository } from "../lib/repositories/donorRepository";
import { causeRepository } from "../lib/repositories/causeRepository";
import { fieldReportRepository } from "../lib/repositories/fieldReportRepository";

async function runCrossDomainVerification() {
  console.log("==========================================================");
  console.log("PHASE 20 — CROSS-DOMAIN KHIZR VERIFICATION TEST");
  console.log("==========================================================\n");

  // Step 1: Verify data presence in Google Sheets
  const donors = await donorRepository.getAll();
  const donations = await donationRepository.getAll();
  const causes = await causeRepository.getAll();
  const reports = await fieldReportRepository.getAll();

  console.log("Authoritative Google Sheets Counts:");
  console.log(` - Donors in Sheets: ${donors.length}`);
  console.log(` - Donations in Sheets: ${donations.length}`);
  console.log(` - Causes in Sheets: ${causes.length}`);
  console.log(` - Field Reports in Sheets: ${reports.length}\n`);

  if (donors.length === 0 || donations.length === 0 || reports.length === 0) {
    throw new Error("Authoritative records missing from Google Sheets. Cannot run cross-domain test.");
  }

  // Query 1: Cross-Domain Join: Donor -> Donation -> Cause
  console.log("--- QUERY 1: Cross-Domain Donor -> Donation -> Cause ---");
  const testDonor = donors[0];
  console.log(`Asking KHIZR about Donor "${testDonor.name}"...`);

  const response1 = await processChatMessage({
    sessionId: "SESSION-CROSS-1",
    userId: "admin-auditor",
    userRole: "super_admin",
    message: `Provide a ledger audit of donations made by ${testDonor.name}, including amount, tracking ID, and cause.`,
    history: []
  });

  console.log("KHIZR Success:", response1.success);
  console.log("KHIZR Response:\n", response1.reply);

  // Validate answer against authoritative Sheets data
  const hasDonorName = response1.reply.toLowerCase().includes(testDonor.name.toLowerCase().split(" ")[0]);
  const hasDonation = donations.some(d => response1.reply.includes(d.id) || response1.reply.includes(String(d.amount)));
  console.log(`Verification: Mentions Donor Name? ${hasDonorName ? "YES" : "NO"}`);
  console.log(`Verification: Mentions Tracking ID / Amount? ${hasDonation ? "YES" : "NO"}\n`);

  // Groq TPM rate-limit safety cooldown
  console.log("Pausing 30s for Groq free-tier TPM window cooldown...");
  await new Promise(r => setTimeout(r, 30000));

  // Query 2: Cross-Domain Join: Field Agent -> Field Report -> Status
  console.log("--- QUERY 2: Cross-Domain Field Agent -> Field Report -> Status ---");
  const testReport = reports[0];
  console.log(`Asking KHIZR about Field Report "${testReport.id}" by "${testReport.agentName}"...`);

  const response2 = await processChatMessage({
    sessionId: "SESSION-CROSS-2",
    userId: "admin-auditor",
    userRole: "super_admin",
    message: `What is the operational status and budget of field report ${testReport.id} submitted by ${testReport.agentName}?`,
    history: []
  });

  console.log("KHIZR Success:", response2.success);
  console.log("KHIZR Response:\n", response2.reply);

  const hasReportId = response2.reply.includes(testReport.id) || response2.reply.toLowerCase().includes(testReport.title.toLowerCase().slice(0, 15));
  console.log(`Verification: Mentions Report ID / Title? ${hasReportId ? "YES" : "NO"}`);

  console.log("\n==========================================================");
  console.log("PHASE 20 CROSS-DOMAIN TEST COMPLETE");
  console.log("==========================================================");
}

runCrossDomainVerification().catch(err => {
  console.error("Cross-domain test failed:", err);
  process.exit(1);
});
