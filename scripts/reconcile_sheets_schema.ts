import { SheetsService } from "../lib/google/sheets";

async function reconcileSchema() {
  console.log("=== PHASE 3: RECONCILING GOOGLE SHEETS SCHEMAS ===");
  const sheets = new SheetsService();

  const FIELD_AGENTS_SANITIZED_HEADERS = [
    "id",
    "firebaseUid",
    "name",
    "email",
    "phone",
    "country",
    "state",
    "district",
    "city",
    "address",
    "role",
    "region",
    "status",
    "assignedSupervisor",
    "avatarUrl",
    "joinDate",
    "requirePasswordChange",
    "permissions",
    "stats"
  ];

  console.log("Setting sanitized Field_Agents headers (removing rawPassword)...");
  await sheets.setHeaders("Field_Agents", FIELD_AGENTS_SANITIZED_HEADERS);

  const updatedHeaders = await sheets.getHeaders("Field_Agents");
  console.log("Updated Field_Agents headers:", updatedHeaders);
  if (updatedHeaders.includes("rawPassword")) {
    throw new Error("rawPassword still found in Field_Agents header!");
  }
  console.log("CONFIRMED: rawPassword removed from Field_Agents in Google Sheets.");
}

reconcileSchema().catch(err => {
  console.error("Failed to reconcile schema:", err);
  process.exit(1);
});
