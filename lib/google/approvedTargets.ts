/**
 * lib/google/approvedTargets.ts
 *
 * The ONLY Google resources a development or test process may write to. This allowlist is committed code, not an environment
 * variable: editing two mutable env variables to say "test" and pointing them at the production spreadsheet is therefore not enough.
 * Ids of these test resources are not secrets (they are listed in the audit reports); access still requires the service account.
 * To approve another test resource, change this file in a reviewed commit.
 */
export const APPROVED_TEST_SHEET_IDS: ReadonlySet<string> = new Set(["1sGVsMEQDI1WmjWdUTQ0eKOzZC34Ri9CLsf4uUUceGzM"]);
export const APPROVED_TEST_FOLDER_IDS: ReadonlySet<string> = new Set(["1x9GnIWZ6GA-VjbH9KPCyKV8eupv6qllD"]);

const runtimeSheets = new Set<string>();
const runtimeFolders = new Set<string>();

/**
 * Test-runner only (vitest sets VITEST): a live test that creates its OWN throw-away spreadsheet or Drive folder may approve it for the
 * current process. Outside a test runner this does nothing, so application code cannot widen the allowlist.
 */
export function approveTestResourceForThisProcess(kind: "sheet" | "folder", id: string): boolean {
  if (!process.env.VITEST || !id) return false;
  (kind === "sheet" ? runtimeSheets : runtimeFolders).add(id);
  return true;
}

export const isApprovedTestSheet = (id: string): boolean => !!id && (APPROVED_TEST_SHEET_IDS.has(id) || runtimeSheets.has(id));
export const isApprovedTestFolder = (id: string): boolean => !!id && (APPROVED_TEST_FOLDER_IDS.has(id) || runtimeFolders.has(id));
