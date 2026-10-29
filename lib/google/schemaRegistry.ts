/**
 * lib/google/schemaRegistry.ts
 *
 * Registry of the worksheets the application expects (tab name -> header row) plus a pure comparison against what the
 * spreadsheet actually contains. Nothing here talks to Google or changes a worksheet: drift is only ever reported.
 *
 * Additive columns are normal (older rows keep working, extra columns are appended by the app). Missing tabs, duplicate headers,
 * an empty header row and renamed headers block; a header that a legacy sheet predates is informational (added on first write).
 */

const registry = new Map<string, string[]>();

export function registerSchema(tab: string, headers: string[]): void {
  if (!registry.has(tab)) registry.set(tab, [...headers]);
}

export function registeredSchemas(): Map<string, string[]> {
  return new Map(registry);
}

export type DriftKind = "missing_tab" | "empty_header" | "missing_header" | "duplicate_header" | "possible_rename" | "extra_column";

export interface DriftFinding {
  tab: string;
  kind: DriftKind;
  detail: string;
  /** Missing tab / empty header row / duplicate / renamed header block safe operation; extra and legacy-missing columns are informational. */
  severity: "blocking" | "info";
}

const norm = (h: string) => h.trim().toLowerCase().replace(/[\s_-]+/g, "");

/**
 * @param expected tab -> expected header row
 * @param actual   tab -> header row read from the spreadsheet; a tab absent from this map does not exist
 */
export function compareSchema(expected: Map<string, string[]>, actual: Map<string, string[]>): DriftFinding[] {
  const findings: DriftFinding[] = [];
  for (const [tab, want] of expected) {
    const have = actual.get(tab);
    if (!have) {
      findings.push({ tab, kind: "missing_tab", detail: `Worksheet "${tab}" does not exist.`, severity: "blocking" });
      continue;
    }
    if (have.length === 0 || have.every((h) => !h.trim())) {
      findings.push({ tab, kind: "empty_header", detail: `Worksheet "${tab}" has no header row.`, severity: "blocking" });
      continue;
    }
    const seen = new Map<string, number>();
    for (const h of have) if (h.trim()) seen.set(h.trim(), (seen.get(h.trim()) || 0) + 1);
    for (const [h, n] of seen) if (n > 1) findings.push({ tab, kind: "duplicate_header", detail: `Header "${h}" appears ${n} times; values would be read from the wrong column.`, severity: "blocking" });

    const haveSet = new Set(have.map((h) => h.trim()));
    const unexpected = have.filter((h) => h.trim() && !want.includes(h.trim()));
    for (const h of want) {
      if (haveSet.has(h)) continue;
      const lookalike = unexpected.find((u) => norm(u) === norm(h));
      if (lookalike) findings.push({ tab, kind: "possible_rename", detail: `Header "${h}" is missing but "${lookalike}" looks like a renamed copy.`, severity: "blocking" });
      // A legacy sheet that predates a column: the application appends it on the first write and older rows read as blank.
      else findings.push({ tab, kind: "missing_header", detail: `Header "${h}" is missing (legacy sheet; appended on first write, older rows read as blank).`, severity: "info" });
    }
    for (const u of unexpected) {
      if (want.some((w) => !haveSet.has(w) && norm(w) === norm(u))) continue;
      findings.push({ tab, kind: "extra_column", detail: `Extra column "${u}" (additive; ignored by the application).`, severity: "info" });
    }
  }
  return findings;
}
