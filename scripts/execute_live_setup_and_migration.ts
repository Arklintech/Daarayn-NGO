import { sheetsService } from "../lib/google/sheets";
import { driveService } from "../lib/google/drive";
import { runMigration } from "./migrate-firestore-to-sheets";

export async function executeLiveSetup() {
  console.log("=================================================");
  console.log("Starting Live Google Setup & Data Migration");
  console.log("=================================================");

  // 1. Initialize _System metadata
  console.log("[Setup] Initializing _System sheet...");
  await sheetsService.initializeSystemMetadata();

  // 2. Ensure baseline domain tabs and headers exist
  const baselineSheets: { name: string; headers: string[] }[] = [
    {
      name: "Causes",
      headers: ["id", "title", "category", "targetAmount", "raisedAmount", "location", "description", "status", "imageUrl", "driveFileId", "createdAt"]
    },
    {
      name: "Donors",
      headers: ["id", "name", "email", "phone", "country", "city", "donationPreference", "communicationPreference", "dateJoined", "totalDonations", "totalAmountDonated", "projectsSupportedCount", "casesSupportedCount", "donationHistory", "projectsSupported", "casesSupported", "status"]
    },
    {
      name: "Donations",
      headers: ["id", "donorId", "donorName", "donorEmail", "amount", "currency", "date", "status", "paymentMethod", "causeId", "causeTitle", "proofDriveFileId", "transactionReference", "notes"]
    },
    {
      name: "Field_Reports",
      headers: ["id", "agentId", "agentName", "category", "title", "description", "urgency", "estimatedBudget", "location", "beneficiaries", "media", "documents", "status", "timelineStages", "assignedTo", "createdAt", "updatedAt"]
    },
    {
      name: "Field_Agents",
      headers: ["id", "firebaseUid", "name", "email", "phone", "country", "state", "district", "city", "address", "role", "region", "status", "assignedSupervisor", "avatarUrl", "joinDate", "requirePasswordChange", "permissions", "stats"]
    },
    {
      name: "Communications",
      headers: ["id", "type", "subject", "bodyText", "selectedCauses", "recipientCount", "sentCount", "failedCount", "status", "createdBy", "createdAt", "completedAt"]
    },
    {
      name: "Notifications",
      headers: ["id", "recipientType", "recipientId", "type", "title", "message", "read", "relatedEntityId", "createdAt"]
    },
    {
      name: "Audit_Log",
      headers: ["event_id", "actor_id", "actor_role", "action", "entity_type", "entity_id", "before_state", "after_state", "timestamp", "request_id", "source"]
    },
    {
      name: "Programs",
      headers: ["id", "title", "category", "amountRequired", "amountCollected", "progress", "status", "description", "createdAt"]
    },
    {
      name: "Campaigns",
      headers: ["id", "title", "goal", "raised", "startDate", "endDate", "status", "createdAt"]
    },
    {
      name: "Beneficiaries",
      headers: ["id", "name", "category", "familySize", "location", "assignedAgentId", "status", "createdAt"]
    }
  ];

  for (const s of baselineSheets) {
    console.log(`[Setup] Ensuring sheet tab: "${s.name}"...`);
    await sheetsService.ensureSheetExists(s.name, s.headers);
  }

  // 3. Create Google Drive subfolders
  console.log("[Setup] Creating Google Drive folder hierarchy...");
  const folders = [
    "Payment Proofs",
    "Field Reports",
    "Communication Attachments",
    "Beneficiary Documents",
    "Other Secure Files"
  ];

  for (const folderName of folders) {
    const fId = await driveService.getOrCreateFolder(folderName);
    console.log(`[Drive Setup] Folder "${folderName}" ready (ID: ${fId})`);
  }

  const fieldReportsFolderId = await driveService.getOrCreateFolder("Field Reports");
  await driveService.getOrCreateFolder("Images", fieldReportsFolderId);
  await driveService.getOrCreateFolder("Documents", fieldReportsFolderId);

  // 4. Run Firestore Migration
  console.log("[Migration] Running Firestore data extraction & population into Google Sheets...");
  const migrationSummary = await runMigration();

  console.log("=================================================");
  console.log("Live Setup & Migration Finished!");
  console.log("Migration Summary:", JSON.stringify(migrationSummary, null, 2));
  console.log("=================================================");
}

executeLiveSetup().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
