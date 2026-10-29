/**
 * lib/google/readiness.ts
 *
 * Read-only readiness check for the Google Sheets / Drive configuration. It performs reads only (spreadsheet metadata,
 * header rows, Drive folder metadata): it never creates, renames, clears or writes anything, and its result contains no
 * secret, record data or full id (only a short fingerprint).
 */
import { inspectGoogleConfig, decideWriteTarget, type GoogleConfigReport, type ConfigDeps, type WriteGuardCode } from "./config";
import { categorizeGoogleError, withGoogleRetry, type GoogleErrorCategory } from "./retry";
import { registeredSchemas, compareSchema, type DriftFinding } from "./schemaRegistry";

export type ReadinessState =
  | "configuration_invalid"
  | "authentication_failed"
  | "permission_denied"
  | "spreadsheet_not_found"
  | "schema_incomplete"
  | "quota_limited"
  | "temporarily_unavailable"
  | "operational";

export interface ReadinessReport {
  state: ReadinessState;
  /** Safe-to-show explanation, never contains a secret. */
  summary: string;
  checkedAt: string;
  config: GoogleConfigReport;
  tabs: { expected: number; found: number };
  drift: DriftFinding[];
  drive: { checked: boolean; state: "ok" | "not_configured" | "not_found" | "permission_denied" | "unavailable" | "unknown" };
  /** Whether THIS process would be allowed to write (code only; ids are never shown). A refused target means every write is blocked. */
  writeTarget: { sheets: WriteGuardCode; drive: WriteGuardCode };
  /** Always true: this check never writes. */
  readOnly: true;
}

export interface ReadinessDeps {
  config?: ConfigDeps;
  sheets: () => any | null;
  drive: () => any | null;
  spreadsheetId: string;
  folderId: string;
  schemas?: Map<string, string[]>;
  now?: () => Date;
}

const STATE_FOR: Partial<Record<GoogleErrorCategory, ReadinessState>> = {
  authentication: "authentication_failed",
  permission: "permission_denied",
  not_found: "spreadsheet_not_found",
  quota: "quota_limited",
  transient: "temporarily_unavailable",
  timeout: "temporarily_unavailable",
  configuration: "configuration_invalid",
};

const SUMMARY: Record<ReadinessState, string> = {
  configuration_invalid: "The Google configuration is invalid; no request was sent.",
  authentication_failed: "Google rejected the service-account credentials.",
  permission_denied: "The service account is not allowed to read this spreadsheet (share it with the service-account email).",
  spreadsheet_not_found: "Google reports that the spreadsheet does not exist (check GOOGLE_SHEET_ID).",
  schema_incomplete: "The spreadsheet is reachable but a required worksheet or header is missing or ambiguous.",
  quota_limited: "Google is rate-limiting this project right now; retry later.",
  temporarily_unavailable: "Google could not be reached or is failing temporarily; retry later.",
  operational: "Spreadsheet reachable and every required worksheet and header is present.",
};

export async function runSheetsReadiness(deps: ReadinessDeps): Promise<ReadinessReport> {
  const config = inspectGoogleConfig(deps.config);
  const env = deps.config?.env ?? process.env;
  const base = { checkedAt: (deps.now?.() ?? new Date()).toISOString(), config, writeTarget: { sheets: decideWriteTarget("sheets", env).code, drive: decideWriteTarget("drive", env).code }, readOnly: true as const };
  const expected = deps.schemas ?? registeredSchemas();
  const done = (state: ReadinessState, extra: Partial<ReadinessReport> = {}): ReadinessReport => ({
    ...base,
    state,
    summary: SUMMARY[state],
    tabs: { expected: expected.size, found: 0 },
    drift: [],
    drive: { checked: false, state: "unknown" },
    ...extra,
  });

  if (!config.ok) return done("configuration_invalid");
  const sheets = deps.sheets();
  if (!sheets) return done("authentication_failed");

  const actual = new Map<string, string[]>();
  try {
    const meta: any = await withGoogleRetry(() => sheets.spreadsheets.get({ spreadsheetId: deps.spreadsheetId, fields: "sheets.properties.title" }), { label: "Sheets readiness metadata", kind: "read", maxAttempts: 3, baseDelayMs: 500, maxDelayMs: 4000 });
    const titles: string[] = (meta.data.sheets || []).map((t: any) => String(t.properties?.title));
    const present = [...expected.keys()].filter((t) => titles.includes(t));
    for (const t of present) actual.set(t, []);
    if (present.length > 0) {
      const res: any = await withGoogleRetry(() => sheets.spreadsheets.values.batchGet({ spreadsheetId: deps.spreadsheetId, ranges: present.map((t) => `'${t}'!1:1`) }), { label: "Sheets readiness headers", kind: "read", maxAttempts: 3, baseDelayMs: 500, maxDelayMs: 4000 });
      present.forEach((t, i) => actual.set(t, ((res.data.valueRanges?.[i]?.values?.[0] as any[]) || []).map((h) => String(h).trim())));
    }
  } catch (err: any) {
    const state = STATE_FOR[categorizeGoogleError(err)] ?? "temporarily_unavailable";
    return done(state);
  }

  const drift = compareSchema(expected, actual);
  const drive = await checkDrive(deps);
  const blocking = drift.some((d) => d.severity === "blocking");
  return done(blocking ? "schema_incomplete" : "operational", { tabs: { expected: expected.size, found: actual.size }, drift, drive });
}

async function checkDrive(deps: ReadinessDeps): Promise<ReadinessReport["drive"]> {
  if (!deps.folderId) return { checked: false, state: "not_configured" };
  const drive = deps.drive();
  if (!drive) return { checked: true, state: "unavailable" };
  try {
    await withGoogleRetry(() => drive.files.get({ fileId: deps.folderId, fields: "id,mimeType,trashed", supportsAllDrives: true }), { label: "Drive readiness folder", maxAttempts: 3, baseDelayMs: 500, maxDelayMs: 4000 });
    return { checked: true, state: "ok" };
  } catch (err: any) {
    const c = categorizeGoogleError(err);
    return { checked: true, state: c === "not_found" ? "not_found" : c === "permission" ? "permission_denied" : c === "authentication" ? "unavailable" : "unavailable" };
  }
}
