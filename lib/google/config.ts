/**
 * lib/google/config.ts
 *
 * One validated view of the Google configuration (spreadsheet, credentials, Drive folder). Pure: it reads the
 * environment it is given and never returns a secret value, only codes, messages and short fingerprints
 * (the last 6 characters of an id), so the result is safe to log and to show to an administrator.
 *
 * `blocking` problems make every Sheets mutation refuse to start (see SheetsService); `warnings` are reported by the
 * readiness check but do not stop the application.
 */
import fs from "fs";
import { isApprovedTestFolder, isApprovedTestSheet } from "./approvedTargets";

export type ConfigProblemCode =
  | "spreadsheet_id_missing"
  | "spreadsheet_id_malformed"
  | "credentials_missing"
  | "credentials_file_missing"
  | "credentials_file_invalid"
  | "credentials_key_malformed"
  | "credential_sources_conflict"
  | "credential_identity_conflict"
  | "drive_folder_missing"
  | "drive_folder_malformed"
  | "target_undeclared";

export interface ConfigProblem {
  code: ConfigProblemCode;
  message: string;
}

export interface GoogleConfigReport {
  ok: boolean;
  blocking: ConfigProblem[];
  warnings: ConfigProblem[];
  spreadsheet: { configured: boolean; wellFormed: boolean; fingerprint: string };
  driveFolder: { configured: boolean; wellFormed: boolean; fingerprint: string };
  credentials: { source: "file" | "inline" | "none"; identity: string };
  /** "test" | "production" as declared by GOOGLE_TARGET_ENV; "undeclared" when absent. */
  declaredTarget: "test" | "production" | "undeclared";
  runtime: string;
}

/** Spreadsheet and Drive ids are URL-safe base64-like tokens of 20-100 characters. Anything else is a typo or a pasted URL. */
const GOOGLE_ID = /^[A-Za-z0-9_-]{20,100}$/;
export const isWellFormedGoogleId = (id: string): boolean => GOOGLE_ID.test(id);
const fingerprint = (id: string): string => (id ? `…${id.slice(-6)}` : "");
const unquote = (v: string | undefined): string => (v || "").trim().replace(/^["']|["']$/g, "");

export interface ConfigDeps {
  env: Record<string, string | undefined>;
  readFile: (path: string) => string | null;
}

const defaultDeps = (): ConfigDeps => ({
  env: process.env,
  readFile: (p) => {
    try {
      return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
    } catch {
      return null;
    }
  },
});

export function inspectGoogleConfig(deps: ConfigDeps = defaultDeps()): GoogleConfigReport {
  const { env } = deps;
  const blocking: ConfigProblem[] = [];
  const warnings: ConfigProblem[] = [];

  const sheetId = (env.GOOGLE_SHEET_ID || "").trim();
  if (!sheetId) blocking.push({ code: "spreadsheet_id_missing", message: "GOOGLE_SHEET_ID is not set." });
  else if (!isWellFormedGoogleId(sheetId)) blocking.push({ code: "spreadsheet_id_malformed", message: "GOOGLE_SHEET_ID is not a valid spreadsheet id (it must be the id only, not a URL, and contain no spaces or quotes)." });

  const folderId = (env.GOOGLE_DRIVE_ROOT_FOLDER_ID || "").trim();
  if (!folderId) warnings.push({ code: "drive_folder_missing", message: "GOOGLE_DRIVE_ROOT_FOLDER_ID is not set; evidence uploads are unavailable." });
  else if (!isWellFormedGoogleId(folderId)) warnings.push({ code: "drive_folder_malformed", message: "GOOGLE_DRIVE_ROOT_FOLDER_ID is not a valid Drive folder id." });

  // Credentials: a file path wins when set (see getGoogleAuth). An inline key set at the same time is a conflict, never a silent choice.
  const filePath = unquote(env.GOOGLE_APPLICATION_CREDENTIALS);
  const inlineEmail = unquote(env.GOOGLE_SERVICE_ACCOUNT_EMAIL || env.GOOGLE_CLIENT_EMAIL);
  const inlineKey = (env.GOOGLE_PRIVATE_KEY || "").trim();
  let source: GoogleConfigReport["credentials"]["source"] = "none";
  let identity = "";

  if (filePath) {
    source = "file";
    const raw = deps.readFile(filePath);
    if (raw === null) blocking.push({ code: "credentials_file_missing", message: "GOOGLE_APPLICATION_CREDENTIALS points to a file that cannot be read." });
    else {
      try {
        const parsed = JSON.parse(raw);
        identity = String(parsed.client_email || "");
        if (!parsed.client_email || !parsed.private_key) blocking.push({ code: "credentials_file_invalid", message: "The service-account JSON is missing client_email or private_key." });
        else if (!/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(String(parsed.private_key))) blocking.push({ code: "credentials_key_malformed", message: "The service-account JSON private_key is not a PEM key." });
      } catch {
        blocking.push({ code: "credentials_file_invalid", message: "The service-account JSON is not valid JSON." });
      }
    }
    if (inlineEmail && inlineKey) {
      warnings.push({ code: "credential_sources_conflict", message: "Both GOOGLE_APPLICATION_CREDENTIALS and an inline GOOGLE_PRIVATE_KEY are set. The file is used; remove the unused inline key." });
      if (identity && inlineEmail.toLowerCase() !== identity.toLowerCase()) blocking.push({ code: "credential_identity_conflict", message: "The inline service-account email differs from the one in the credentials file. Remove the source that is not meant to be used." });
    }
  } else if (inlineEmail && inlineKey) {
    source = "inline";
    identity = inlineEmail;
    const key = inlineKey.replace(/^["']|["']$/g, "").replace(/\\n/g, "\n");
    if (!/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(key) || !/-----END [A-Z ]*PRIVATE KEY-----/.test(key)) blocking.push({ code: "credentials_key_malformed", message: "GOOGLE_PRIVATE_KEY is not a complete PEM key (check the line breaks / quotes)." });
  } else {
    blocking.push({ code: "credentials_missing", message: "Google credentials are not configured: set GOOGLE_APPLICATION_CREDENTIALS (path) or GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY." });
  }

  // Test-versus-production ambiguity: a deployment must say which kind of spreadsheet it points at.
  const raw = (env.GOOGLE_TARGET_ENV || "").trim().toLowerCase();
  const declaredTarget: GoogleConfigReport["declaredTarget"] = raw === "test" || raw === "production" ? raw : "undeclared";
  const runtime = env.VERCEL ? "vercel" : env.NODE_ENV || "unknown";
  if (declaredTarget === "undeclared") {
    warnings.push({ code: "target_undeclared", message: "GOOGLE_TARGET_ENV (test | production) is not set, so it cannot be proven which kind of spreadsheet this server writes to." });
  } else if (declaredTarget === "test" && (env.VERCEL || env.NODE_ENV === "production")) {
    warnings.push({ code: "target_undeclared", message: "This is a production runtime but GOOGLE_TARGET_ENV says test. Confirm the spreadsheet is the intended one." });
  }

  return {
    ok: blocking.length === 0,
    blocking,
    warnings,
    spreadsheet: { configured: !!sheetId, wellFormed: !!sheetId && isWellFormedGoogleId(sheetId), fingerprint: fingerprint(sheetId) },
    driveFolder: { configured: !!folderId, wellFormed: !!folderId && isWellFormedGoogleId(folderId), fingerprint: fingerprint(folderId) },
    credentials: { source, identity },
    declaredTarget,
    runtime,
  };
}

/** Thrown before any Google request is made when the configuration is unusable. Never retried. */
export class GoogleConfigError extends Error {
  readonly code: ConfigProblemCode;
  readonly isConfigError = true;
  constructor(problem: ConfigProblem) {
    super(problem.message);
    this.name = "GoogleConfigError";
    this.code = problem.code;
  }
}

/** Throws a GoogleConfigError for the first blocking problem that concerns the spreadsheet id (cheap, no file access). */
export function assertSpreadsheetId(id: string): void {
  if (!id) throw new GoogleConfigError({ code: "spreadsheet_id_missing", message: "GOOGLE_SHEET_ID is not configured." });
  if (!isWellFormedGoogleId(id)) throw new GoogleConfigError({ code: "spreadsheet_id_malformed", message: "GOOGLE_SHEET_ID is not a valid spreadsheet id." });
}

// ---------------------------------------------------------------------------------------------------------------------
// Fail-closed write guard
// ---------------------------------------------------------------------------------------------------------------------
// `.env.local` of a developer machine can hold the PRODUCTION spreadsheet and Drive folder. A process may therefore only
// MUTATE Google resources when its declared target agrees with the exact resource it points at:
//   - development / test runtime (anything that is not a production runtime): GOOGLE_TARGET_ENV must be "test" AND the
//     spreadsheet id must equal GOOGLE_TEST_SHEET_ID (Drive: the root folder must be empty or equal GOOGLE_DRIVE_TEST_FOLDER_ID).
//     Unset, unknown, "production" or a mismatching id => every write is refused before it reaches Google. Reads still work.
//   - production runtime (NODE_ENV=production or VERCEL): GOOGLE_TARGET_ENV "production" is accepted unless the id is the
//     declared test id; an unset label is tolerated (so an existing deployment keeps working) but reported by the readiness check.
// An environment label alone never authorizes a target: it must agree with the exact id.

export type WriteGuardCode = "target_undeclared" | "target_not_test" | "target_mismatch" | "production_runtime_on_test_target" | "target_ok";

export interface WriteDecision {
  allowed: boolean;
  code: WriteGuardCode;
  message: string;
}

export function decideWriteTarget(kind: "sheets" | "drive", env: Record<string, string | undefined> = process.env): WriteDecision {
  const label = (env.GOOGLE_TARGET_ENV || "").trim().toLowerCase();
  const productionRuntime = !!env.VERCEL || env.NODE_ENV === "production";
  const sheetId = (env.GOOGLE_SHEET_ID || "").trim();
  const testSheet = (env.GOOGLE_TEST_SHEET_ID || "").trim();
  const folderId = (env.GOOGLE_DRIVE_ROOT_FOLDER_ID || "").trim();
  const testFolder = (env.GOOGLE_DRIVE_TEST_FOLDER_ID || "").trim();
  const deny = (code: WriteGuardCode, message: string): WriteDecision => ({ allowed: false, code, message: `Write refused: ${message}` });

  if (productionRuntime) {
    if (label === "production" || label === "") {
      if (testSheet && sheetId === testSheet) return deny("production_runtime_on_test_target", "a production runtime points at the declared test spreadsheet.");
      return { allowed: true, code: "target_ok", message: "production runtime" };
    }
    if (label === "test") {
      if (kind === "sheets" ? sheetId && sheetId === testSheet && isApprovedTestSheet(sheetId) : !folderId || (testFolder && folderId === testFolder && isApprovedTestFolder(folderId))) return { allowed: true, code: "target_ok", message: "declared test target agrees" };
      return deny("target_mismatch", "GOOGLE_TARGET_ENV=test but the configured resource is not the declared test resource.");
    }
    return deny("target_undeclared", "GOOGLE_TARGET_ENV must be 'test' or 'production'.");
  }

  if (label !== "test" && label !== "production") return deny("target_undeclared", "GOOGLE_TARGET_ENV is not set to 'test' (development and test processes may only write to the declared test resources).");
  if (label === "production") return deny("target_not_test", "a development or test process may not declare the production target.");
  // Three independent proofs for a development write: the label, the declared test id, AND membership of the committed allowlist
  // (lib/google/approvedTargets.ts). A configured production id (GOOGLE_PRODUCTION_SHEET_ID / GOOGLE_PRODUCTION_DRIVE_FOLDER_ID) is a veto.
  const prodSheet = (env.GOOGLE_PRODUCTION_SHEET_ID || "").trim();
  const prodFolder = (env.GOOGLE_PRODUCTION_DRIVE_FOLDER_ID || "").trim();
  if (kind === "sheets") {
    if (prodSheet && sheetId === prodSheet) return deny("target_mismatch", "the configured spreadsheet is the production spreadsheet.");
    if (!sheetId || !testSheet || sheetId !== testSheet) return deny("target_mismatch", "GOOGLE_SHEET_ID is not the declared GOOGLE_TEST_SHEET_ID.");
    if (!isApprovedTestSheet(sheetId)) return deny("target_mismatch", "the spreadsheet is not on the approved test-resource allowlist.");
  } else if (folderId) {
    if (prodFolder && folderId === prodFolder) return deny("target_mismatch", "the configured Drive folder is the production folder.");
    if (!(testFolder && folderId === testFolder)) return deny("target_mismatch", "GOOGLE_DRIVE_ROOT_FOLDER_ID is not the declared GOOGLE_DRIVE_TEST_FOLDER_ID.");
    if (!isApprovedTestFolder(folderId)) return deny("target_mismatch", "the Drive folder is not on the approved test-resource allowlist.");
  }
  return { allowed: true, code: "target_ok", message: "declared test target agrees" };
}

const SHEETS_WRITES = new Set(["batchUpdate", "create", "append", "update", "clear", "batchClear", "batchClearByDataFilter", "batchUpdateByDataFilter", "copyTo"]);
const DRIVE_WRITES = new Set(["create", "update", "delete", "copy", "emptyTrash", "export"].filter((m) => m !== "export"));

/**
 * Wraps a googleapis client so that every mutating call (any depth: spreadsheets.batchUpdate, spreadsheets.values.append, files.create,
 * permissions.create ...) first passes the write guard. Reads pass through untouched. Applied where clients are created, so a code path
 * cannot reach Google for writing without it.
 */
export function guardWrites<T extends object>(client: T, kind: "sheets" | "drive"): T {
  const writes = kind === "sheets" ? SHEETS_WRITES : DRIVE_WRITES;
  const wrap = (obj: any, path: string[]): any =>
    // The proxy target is an empty shadow object: googleapis defines non-configurable data properties on its resources, and a Proxy
    // over those would be forced to return the raw (unguarded) value. Everything is resolved from the real object instead.
    new Proxy({} as any, {
      get(_shadow, prop) {
        const target = obj;
        const value = Reflect.get(target, prop);
        if (typeof prop !== "string") return value;
        if (typeof value === "function") {
          if (writes.has(prop)) {
            return (...args: any[]) => {
              const d = decideWriteTarget(kind);
              if (!d.allowed) return Promise.reject(new GoogleConfigError({ code: "target_undeclared", message: d.message }));
              return value.apply(target, args);
            };
          }
          return value.bind(target);
        }
        if (value && typeof value === "object" && ["spreadsheets", "values", "files", "permissions", "drives", "revisions"].includes(prop)) return wrap(value, [...path, prop]);
        return value;
      },
    });
  return wrap(client, []) as T;
}
