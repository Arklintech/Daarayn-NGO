import { google } from "googleapis";
import fs from "fs";
import { guardWrites } from "./config";

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive",
];

/**
 * Target spreadsheet and evidence folder come ONLY from the environment. There are no hardcoded
 * production ids: a missing value is reported as a configuration error instead of silently
 * pointing the app (or a test run) at a real spreadsheet or folder.
 */
export const GOOGLE_SHEET_ID = (process.env.GOOGLE_SHEET_ID || "").trim();
export const GOOGLE_DRIVE_ROOT_FOLDER_ID = (process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || "").trim();

let cachedAuth: any = null;
let lastAuthProblem = "";

/** Why Google credentials could not be used (never contains secret values). */
export function googleAuthProblem(): string {
  return lastAuthProblem || "Google credentials are not configured.";
}

function cleanPrivateKey(key: string | undefined): string | null {
  if (!key) return null;
  let cleaned = key.trim();
  while ((cleaned.startsWith('"') && cleaned.endsWith('"')) || (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  cleaned = cleaned.replace(/\\n/g, "\n").replace(/\r/g, "").trim();
  return cleaned;
}

/**
 * One service account for Sheets and Drive. Order:
 *  1. GOOGLE_APPLICATION_CREDENTIALS = path to the service-account JSON (local development).
 *     If it is set it is the only source: an unreadable or invalid file is an error, never a
 *     silent fall-back to some other key.
 *  2. GOOGLE_CLIENT_EMAIL (or GOOGLE_SERVICE_ACCOUNT_EMAIL) + GOOGLE_PRIVATE_KEY (deployment).
 */
export function getGoogleAuth() {
  if (cachedAuth) return cachedAuth;

  const jsonPath = (process.env.GOOGLE_APPLICATION_CREDENTIALS || "").trim().replace(/^["']|["']$/g, "");
  if (jsonPath) {
    try {
      if (!fs.existsSync(jsonPath)) {
        lastAuthProblem = `GOOGLE_APPLICATION_CREDENTIALS points to a file that does not exist: ${jsonPath}`;
        console.error(`[GoogleClient] ${lastAuthProblem}`);
        return null;
      }
      const serviceAccount = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
      if (!serviceAccount.client_email || !serviceAccount.private_key) {
        lastAuthProblem = "The service-account JSON is missing client_email or private_key.";
        console.error(`[GoogleClient] ${lastAuthProblem}`);
        return null;
      }
      cachedAuth = new google.auth.JWT({ email: serviceAccount.client_email, key: serviceAccount.private_key, scopes: SCOPES });
      return cachedAuth;
    } catch (err: any) {
      lastAuthProblem = `The service-account JSON could not be read: ${err.message}`;
      console.error(`[GoogleClient] ${lastAuthProblem}`);
      return null;
    }
  }

  const rawEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL;
  const clientEmail = rawEmail ? rawEmail.trim().replace(/^["']|["']$/g, "") : null;
  const privateKey = cleanPrivateKey(process.env.GOOGLE_PRIVATE_KEY);
  if (clientEmail && privateKey) {
    try {
      cachedAuth = new google.auth.JWT({ email: clientEmail, key: privateKey, scopes: SCOPES });
      return cachedAuth;
    } catch (e: any) {
      lastAuthProblem = `Could not initialise Google credentials from GOOGLE_CLIENT_EMAIL/GOOGLE_PRIVATE_KEY: ${e.message}`;
      console.warn(`[GoogleClient] ${lastAuthProblem}`);
      return null;
    }
  }

  lastAuthProblem = "Google credentials are not configured: set GOOGLE_APPLICATION_CREDENTIALS (path) or GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY.";
  console.warn(`[GoogleClient] ${lastAuthProblem}`);
  return null;
}

export function getSheetsClient() {
  const auth = getGoogleAuth();
  if (!auth) return null;
  return guardWrites(google.sheets({ version: "v4", auth }), "sheets");
}

export function getDriveClient() {
  const auth = getGoogleAuth();
  if (!auth) return null;
  return guardWrites(google.drive({ version: "v3", auth }), "drive");
}
