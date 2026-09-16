import { SheetsService } from "../lib/google/sheets";
import { DriveService } from "../lib/google/drive";
import { getGoogleAuth } from "../lib/google/client";

async function main() {
  console.log("=== TESTING GOOGLE CREDENTIALS & CONNECTIVITY ===");
  const auth = getGoogleAuth();
  if (!auth) {
    console.error("FAIL: Could not load Google credentials.");
    process.exit(1);
  }
  console.log("SUCCESS: Google Auth JWT initialized.");

  const sheets = new SheetsService();
  console.log("Fetching Field_Agents headers from Google Sheets...");
  const headers = await sheets.getHeaders("Field_Agents");
  console.log("SUCCESS: Field_Agents headers in Google Sheet:", headers);

  const drive = new DriveService();
  console.log("Testing Google Drive access...");
  const proofFolderId = await drive.getOrCreateFolder("Payment Proofs");
  console.log(`SUCCESS: Found/Ensured 'Payment Proofs' folder in Google Drive (id: ${proofFolderId})`);
  const fieldReportsFolderId = await drive.getOrCreateFolder("Field Reports");
  console.log(`SUCCESS: Found/Ensured 'Field Reports' folder in Google Drive (id: ${fieldReportsFolderId})`);
}

main().catch(err => {
  console.error("Connectivity test failed:", err);
  process.exit(1);
});
