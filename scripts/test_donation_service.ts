import { donationService } from "../lib/services/donationService";
import { donationRepository } from "../lib/repositories/donationRepository";
import { donorRepository } from "../lib/repositories/donorRepository";
import { auditLogRepository } from "../lib/repositories/auditLogRepository";
import { notificationRepository } from "../lib/repositories/notificationRepository";

async function testDonation() {
  console.log("=== TESTING DONATION SERVICE (SHEETS + DRIVE CUTOVER) ===");

  // Create a minimal 1x1 transparent PNG buffer
  const samplePngBuffer = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64"
  );

  const testInput = {
    donorName: "Fatima Al-Zahra (Test)",
    donorContact: "fatima.test@example.org",
    upiRef: "TEST-UPI-" + Date.now(),
    amount: 2500,
    currency: "INR",
    cause: "Emergency Medical Relief",
    selectedCauses: ["Emergency Medical Relief"],
    screenshotBuffer: samplePngBuffer,
    screenshotFilename: "test-payment-proof.png",
    screenshotMimeType: "image/png"
  };

  console.log("Submitting donation via DonationService...");
  const result = await donationService.processDonation(testInput);
  console.log("SUCCESS: Donation Processed:", result);

  console.log("Verifying Google Sheets row in 'Donations'...");
  const savedDonation = await donationRepository.getById(result.trackingId);
  console.log("Retrieved Donation from Sheets:", savedDonation);

  console.log("Verifying Google Sheets row in 'Donors'...");
  const savedDonor = await donorRepository.getById(result.donorId);
  console.log("Retrieved Donor from Sheets:", savedDonor);

  console.log("Verifying Google Sheets Audit_Log...");
  const auditRows = await auditLogRepository.getAll(true);
  const matchedAudit = auditRows.find(a => a.entity_id === result.trackingId);
  console.log("Found Audit Row in Sheets:", !!matchedAudit, matchedAudit?.action);

  console.log("Verifying Google Sheets Notifications...");
  const notifRows = await notificationRepository.getAll(true);
  const matchedNotif = notifRows.find(n => n.relatedEntityId === result.trackingId);
  console.log("Found Notification in Sheets:", !!matchedNotif, matchedNotif?.title);

  console.log("=== PHASE 6 DONATION TEST COMPLETED SUCCESSFULLY ===");
}

testDonation().catch(err => {
  console.error("Donation test failed:", err);
  process.exit(1);
});
