/**
 * lib/google/driveOAuth.ts
 *
 * Server-side Google OAuth 2.0 for Google Drive FILE operations only. Google Sheets keeps using the
 * service account (lib/google/client.ts); nothing here touches Sheets authentication.
 *
 * Why OAuth: the service account has no Drive storage quota, so it cannot upload into a personal
 * My Drive. Uploads are made as the authorised Google account instead.
 *
 * Environment variables
 *   GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET   OAuth "Web application" client
 *   GOOGLE_OAUTH_REDIRECT_URI                            must equal the callback route exactly
 *   GOOGLE_DRIVE_REFRESH_TOKEN                           optional: supply the token yourself instead of the connect flow
 *   DRIVE_TOKEN_ENCRYPTION_KEY                           base64 of 32 random bytes; enables encrypted storage in the
 *                                                        "_Secrets" Sheets tab (needed on Vercel, where files do not persist)
 *
 * Refresh-token storage, first match wins when reading:
 *   1. GOOGLE_DRIVE_REFRESH_TOKEN
 *   2. AES-256-GCM encrypted row in the "_Secrets" tab (when DRIVE_TOKEN_ENCRYPTION_KEY is set)
 *   3. .secrets/google-drive-oauth.json (local development only; the folder is git-ignored)
 * The token is never returned by any API, logged, put in a URL, or sent to the browser.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { google } from "googleapis";
import { getDriveClient, googleAuthProblem } from "./client";
import { sheetsService } from "./sheets";

/**
 * Minimum scope that works for this app. `drive.file` is NOT enough: it only reaches files this OAuth client
 * created, so it cannot upload into the existing evidence folder or read the existing proofs.
 */
export const DRIVE_OAUTH_SCOPES = ["https://www.googleapis.com/auth/drive"];
export const OAUTH_CALLBACK_PATH = "/api/admin/google-drive/callback";
export const STATE_COOKIE = "daarayn_drive_oauth";
const STATE_TTL_MS = 10 * 60 * 1000;
const SECRETS_TAB = "_Secrets";
const SECRETS_KEY = "google_drive_refresh_token";
const SECRETS_HEADERS = ["key", "value", "updatedAt", "updatedBy"];

const env = (name: string) => (process.env[name] || "").trim().replace(/^["']|["']$/g, "");
const tokenFile = () => path.join(process.cwd(), ".secrets", "google-drive-oauth.json");

// ─── configuration ───────────────────────────────────────────────────────────

export function oauthConfig() {
  return { clientId: env("GOOGLE_OAUTH_CLIENT_ID"), clientSecret: env("GOOGLE_OAUTH_CLIENT_SECRET"), redirectUri: env("GOOGLE_OAUTH_REDIRECT_URI") };
}

export function oauthConfigProblem(): string | null {
  const c = oauthConfig();
  const missing = [
    !c.clientId && "GOOGLE_OAUTH_CLIENT_ID",
    !c.clientSecret && "GOOGLE_OAUTH_CLIENT_SECRET",
    !c.redirectUri && "GOOGLE_OAUTH_REDIRECT_URI",
  ].filter(Boolean);
  return missing.length ? `Google Drive OAuth is not configured: set ${missing.join(", ")}.` : null;
}

export const isOAuthConfigured = () => oauthConfigProblem() === null;

export function createOAuthClient() {
  const c = oauthConfig();
  return new google.auth.OAuth2(c.clientId, c.clientSecret, c.redirectUri);
}

// ─── CSRF-safe state ─────────────────────────────────────────────────────────

const b64u = (b: Buffer) => b.toString("base64url");
const stateKey = () => crypto.createHash("sha256").update(`daarayn-drive-oauth:${oauthConfig().clientSecret}`).digest();
const sign = (payload: string) => b64u(crypto.createHmac("sha256", stateKey()).update(payload).digest());

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * `state` goes to Google and back; `cookie` (httpOnly, SameSite=Lax, 10 minutes) stays in the admin's browser.
 * The cookie is HMAC-signed and records which admin started the flow, so the callback can verify both that the
 * request belongs to this browser and who authorised it (the Strict auth cookie is not sent on Google's redirect).
 */
export function createStateCookie(adminEmail: string, now = Date.now()) {
  const nonce = crypto.randomBytes(24).toString("hex");
  const payload = b64u(Buffer.from(JSON.stringify({ n: nonce, e: adminEmail, x: now + STATE_TTL_MS })));
  return { state: nonce, cookie: `${payload}.${sign(payload)}` };
}

export function verifyStateCookie(cookie: string | undefined, stateParam: string | null, now = Date.now()): { ok: true; email: string } | { ok: false; reason: string } {
  if (!cookie || !stateParam) return { ok: false, reason: "Missing OAuth state." };
  const [payload, sig] = cookie.split(".");
  if (!payload || !sig || !safeEqual(sig, sign(payload))) return { ok: false, reason: "Invalid OAuth state signature." };
  let data: { n: string; e: string; x: number };
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "Malformed OAuth state." };
  }
  if (!data.n || !safeEqual(data.n, stateParam)) return { ok: false, reason: "OAuth state mismatch." };
  if (!data.x || now > data.x) return { ok: false, reason: "OAuth state expired. Start the connection again." };
  return { ok: true, email: data.e };
}

export function buildAuthUrl(state: string): string {
  return createOAuthClient().generateAuthUrl({
    access_type: "offline", // ask for a refresh token
    prompt: "consent", // always issue one, even if the account authorised before
    include_granted_scopes: false,
    scope: DRIVE_OAUTH_SCOPES,
    state,
  });
}

// ─── secret encryption (AES-256-GCM) ─────────────────────────────────────────

function encryptionKey(): Buffer | null {
  const raw = env("DRIVE_TOKEN_ENCRYPTION_KEY");
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("DRIVE_TOKEN_ENCRYPTION_KEY must be base64 of exactly 32 bytes.");
  return key;
}

export function encryptSecret(plain: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, enc, cipher.getAuthTag()].map((b) => b.toString("base64")).join(".");
}

export function decryptSecret(blob: string, key: Buffer): string {
  const [iv, enc, tag] = blob.split(".").map((p) => Buffer.from(p, "base64"));
  const d = crypto.createDecipheriv("aes-256-gcm", key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

// ─── refresh-token store ─────────────────────────────────────────────────────

let cachedToken: string | null | undefined;

export function resetTokenCache() {
  cachedToken = undefined;
}

export async function loadRefreshToken(): Promise<string | null> {
  if (cachedToken !== undefined) return cachedToken;
  const fromEnv = env("GOOGLE_DRIVE_REFRESH_TOKEN");
  if (fromEnv) return (cachedToken = fromEnv);

  const key = encryptionKey();
  if (key) {
    try {
      await sheetsService.ensureSheetExists(SECRETS_TAB, SECRETS_HEADERS);
      const row = (await sheetsService.getAllRows(SECRETS_TAB)).find((r) => r.key === SECRETS_KEY);
      if (row?.value) return (cachedToken = decryptSecret(String(row.value), key));
    } catch (err: any) {
      console.error("[DriveOAuth] Could not read the stored refresh token:", err.message);
      return null; // do not cache a failure
    }
  }

  try {
    const file = tokenFile();
    if (fs.existsSync(file)) {
      const t = JSON.parse(fs.readFileSync(file, "utf8")).refresh_token;
      if (t) return (cachedToken = String(t));
    }
  } catch (err: any) {
    console.error("[DriveOAuth] Could not read the local token file:", err.message);
  }
  return null;
}

/** Persists the token server-side. Returns where it went; the value is never returned. */
export async function saveRefreshToken(token: string, updatedBy: string): Promise<"sheet" | "file"> {
  const key = encryptionKey();
  if (key) {
    await sheetsService.ensureSheetExists(SECRETS_TAB, SECRETS_HEADERS);
    const record = { key: SECRETS_KEY, value: encryptSecret(token, key), updatedAt: new Date().toISOString(), updatedBy };
    const existing = (await sheetsService.getAllRows(SECRETS_TAB)).some((r) => r.key === SECRETS_KEY);
    if (existing) await sheetsService.updateRow(SECRETS_TAB, SECRETS_KEY, record);
    else await sheetsService.appendRow(SECRETS_TAB, record, SECRETS_HEADERS);
    cachedToken = token;
    return "sheet";
  }
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    throw new Error("Cannot store the Drive token: set DRIVE_TOKEN_ENCRYPTION_KEY (base64 of 32 bytes) so it can be kept encrypted, or set GOOGLE_DRIVE_REFRESH_TOKEN.");
  }
  const file = tokenFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ refresh_token: token, updatedAt: new Date().toISOString(), updatedBy }), { encoding: "utf8", mode: 0o600 });
  cachedToken = token;
  return "file";
}

/** When the stored authorisation was made (from the token record; unknown when supplied via GOOGLE_DRIVE_REFRESH_TOKEN). */
export async function tokenConnectedAt(): Promise<string | null> {
  try {
    if (encryptionKey()) {
      const row = (await sheetsService.getAllRows(SECRETS_TAB)).find((r) => r.key === SECRETS_KEY);
      if (row?.updatedAt) return String(row.updatedAt);
    }
    const file = tokenFile();
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")).updatedAt || null;
  } catch {
    // age is informational only
  }
  return null;
}

/**
 * Google expires refresh tokens after 7 days for an OAuth app whose consent screen is in "Testing" status (and the
 * Drive scope is a sensitive/restricted scope). Set GOOGLE_OAUTH_PUBLISHING_STATUS=production once the app has been
 * published; until then the app assumes Testing and warns before the authorisation lapses.
 */
export const TESTING_MODE_TOKEN_DAYS = 7;
export const oauthPublishingStatus = (): "testing" | "production" => (env("GOOGLE_OAUTH_PUBLISHING_STATUS").toLowerCase() === "production" ? "production" : "testing");

// ─── the Drive client used by DriveService ───────────────────────────────────

export class DriveNotConnectedError extends Error {}

/**
 * Writes (create folder, upload, delete) always use the authorised OAuth account. When OAuth is configured but
 * nobody has connected yet, writes fail with an explicit error. Reads use OAuth when connected, otherwise the
 * service account (existing behaviour), so evidence stays viewable before the connection is made.
 */
export async function getDriveApi(write: boolean) {
  const problem = oauthConfigProblem();
  if (!problem) {
    const token = await loadRefreshToken();
    if (token) {
      const client = createOAuthClient();
      client.setCredentials({ refresh_token: token });
      return google.drive({ version: "v3", auth: client });
    }
    if (write) throw new DriveNotConnectedError("Google Drive is not connected. An administrator must connect it in Admin → Settings → Google Drive.");
  } else if (write) {
    throw new DriveNotConnectedError(`${problem} Uploads cannot use the service account (it has no Drive storage quota).`);
  }
  const sa = getDriveClient();
  if (!sa) throw new Error(`Google Drive client is not initialized. ${googleAuthProblem()}`);
  return sa;
}

/** Non-secret status for the admin UI. */
export async function driveConnectionStatus(): Promise<{ configured: boolean; connected: boolean; account?: string; problem?: string; reauthorizeBy?: string; publishingStatus?: string; reauthorizeSoon?: boolean }> {
  const problem = oauthConfigProblem();
  if (problem) return { configured: false, connected: false, problem };
  const token = await loadRefreshToken();
  if (!token) return { configured: true, connected: false };
  try {
    const drive = await getDriveApi(true);
    const about = await drive.about.get({ fields: "user(emailAddress)" });
    const at = await tokenConnectedAt();
    const status = oauthPublishingStatus();
    let reauthorizeBy: string | undefined;
    let reauthorizeSoon = false;
    if (status === "testing" && at) {
      const expires = new Date(new Date(at).getTime() + TESTING_MODE_TOKEN_DAYS * 24 * 3600 * 1000);
      reauthorizeBy = expires.toISOString();
      reauthorizeSoon = expires.getTime() - Date.now() < 2 * 24 * 3600 * 1000;
    }
    return { configured: true, connected: true, account: about.data.user?.emailAddress || undefined, publishingStatus: status, reauthorizeBy, reauthorizeSoon };
  } catch (err: any) {
    const revoked = /invalid_grant/i.test(err?.message || "");
    return { configured: true, connected: false, problem: revoked ? "The Google authorisation was revoked or expired. Connect again." : `Could not reach Google Drive: ${err.message}` };
  }
}
