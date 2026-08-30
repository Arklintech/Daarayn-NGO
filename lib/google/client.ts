import { google } from "googleapis";
import fs from "fs";
import path from "path";

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive",
];

export const GOOGLE_SHEET_ID =
  process.env.GOOGLE_SHEET_ID || "1sg2XC0qT7JaXLEVk2u53rzY3UQXPvT5EiEgXYcs7D_U";

export const GOOGLE_DRIVE_ROOT_FOLDER_ID =
  process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || "1H2eGXS6YRTbUJpSeeMposoAZ2rOeaDwO";

let cachedAuth: any = null;

export function getGoogleAuth() {
  if (cachedAuth) return cachedAuth;

  // 1. Try Environment Variables first
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL;
  let privateKey = process.env.GOOGLE_PRIVATE_KEY;

  if (clientEmail && privateKey) {
    privateKey = privateKey.replace(/\\n/g, "\n");
    cachedAuth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: SCOPES,
    });
    return cachedAuth;
  }

  // 2. Try Local Service Account File
  const jsonPath = path.join(process.cwd(), "daaraynorg-9165c-c14dff5b2d5c.json");
  if (fs.existsSync(jsonPath)) {
    try {
      const serviceAccount = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
      cachedAuth = new google.auth.JWT({
        email: serviceAccount.client_email,
        key: serviceAccount.private_key,
        scopes: SCOPES,
      });
      return cachedAuth;
    } catch (err) {
      console.error("[GoogleClient] Error reading local service account JSON:", err);
    }
  }

  console.warn("[GoogleClient] Google credentials not found in env or local JSON file.");
  return null;
}

export function getSheetsClient() {
  const auth = getGoogleAuth();
  if (!auth) return null;
  return google.sheets({ version: "v4", auth });
}

export function getDriveClient() {
  const auth = getGoogleAuth();
  if (!auth) return null;
  return google.drive({ version: "v3", auth });
}
