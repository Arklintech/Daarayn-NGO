import { google } from "googleapis";
import fs from "fs";
import path from "path";

const SPREADSHEET_ID = "1sg2XC0qT7JaXLEVk2u53rzY3UQXPvT5EiEgXYcs7D_U";
const DRIVE_ROOT_ID = "1H2eGXS6YRTbUJpSeeMposoAZ2rOeaDwO";

const jsonPath = path.join(process.cwd(), "daaraynorg-9165c-c14dff5b2d5c.json");
if (!fs.existsSync(jsonPath)) {
  console.error("Service account JSON file not found at:", jsonPath);
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const auth = new google.auth.JWT({
  email: serviceAccount.client_email,
  key: serviceAccount.private_key,
  scopes: [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive"
  ]
});

const sheets = google.sheets({ version: "v4", auth });
const drive = google.drive({ version: "v3", auth });

async function inspect() {
  console.log("=== INSPECTING LIVE GOOGLE SPREADSHEET ===");
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    console.log("Spreadsheet Title:", meta.data.properties?.title);
    const sheetTabs = meta.data.sheets || [];
    console.log("Total Worksheets/Tabs Found:", sheetTabs.length);

    for (const tab of sheetTabs) {
      const title = tab.properties?.title || "";
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${title}'!A:ZZ`
      });
      const rows = res.data.values || [];
      const headers = rows.length > 0 ? rows[0] : [];
      const recordCount = rows.length > 1 ? rows.length - 1 : 0;
      console.log(`[SHEET] Tab: "${title}" | Total Rows: ${rows.length} | Data Records: ${recordCount}`);
      console.log(`        Headers:`, JSON.stringify(headers));
    }
  } catch (err: any) {
    console.error("Error inspecting spreadsheet:", err.message);
  }

  console.log("\n=== INSPECTING LIVE GOOGLE DRIVE ROOT FOLDER ===");
  try {
    const rootMeta = await drive.files.get({ fileId: DRIVE_ROOT_ID, fields: "id, name" });
    console.log("Root Folder Name:", rootMeta.data.name);

    const res = await drive.files.list({
      q: `'${DRIVE_ROOT_ID}' in parents and trashed = false`,
      fields: "files(id, name, mimeType, size, createdTime)"
    });
    const items = res.data.files || [];
    console.log("Items inside Root Folder:", items.length);

    for (const item of items) {
      if (item.mimeType === "application/vnd.google-apps.folder") {
        const subRes = await drive.files.list({
          q: `'${item.id}' in parents and trashed = false`,
          fields: "files(id, name, mimeType, size, createdTime)"
        });
        const subItems = subRes.data.files || [];
        console.log(`[DRIVE] Subfolder: "${item.name}" (ID: ${item.id}) | File Count: ${subItems.length}`);
        for (const sub of subItems) {
          console.log(`        └─ File: "${sub.name}" (ID: ${sub.id}, Type: ${sub.mimeType}, Size: ${sub.size || 0} bytes)`);
        }
      } else {
        console.log(`[DRIVE] Direct File: "${item.name}" (ID: ${item.id}, Type: ${item.mimeType})`);
      }
    }
  } catch (err: any) {
    console.error("Error inspecting Google Drive:", err.message);
  }
}

inspect();
