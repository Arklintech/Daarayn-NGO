import { getSheetsClient, GOOGLE_SHEET_ID, googleAuthProblem } from "./client";
import { withGoogleRetry } from "./retry";
import { assertSpreadsheetId } from "./config";
import { registeredSchemas } from "./schemaRegistry";

// Shared by every route bundle of this process. Identical reads are coalesced only when the shared request STARTED after the last write finished,
// so a caller that has just written (and now reads to verify its row) can never be handed a snapshot older than its own write.
const gs = globalThis as any;
gs.__daaraynLastWriteDoneAt ??= 0;
const inflightReads: Map<string, { startedAt: number; promise: Promise<any> }> = (gs.__daaraynInflightReads ??= new Map());

export interface SheetRow {
  rowNumber: number;
  record: Record<string, any>;
}

/** Rows to append to one tab as part of a multi-tab append (see SheetsService.appendRowsToTabs). */
export interface TabAppend {
  sheetName: string;
  records: Record<string, any>[];
  expectedHeaders: string[];
}

/**
 * One cell for `spreadsheets.batchUpdate` appendCells, from the same string `toRowValues` would send to `values.append` (USER_ENTERED).
 * Plain numbers and true/false are typed exactly as USER_ENTERED types them (verified live on the approved test spreadsheet, see
 * tests/live/r1-appendcells.live.test.ts). Everything else is kept as LITERAL TEXT: USER_ENTERED would also turn dates, fractions,
 * percentages, scientific notation, leading-zero or "+" numbers and "=..." text into numbers or formulas, which is a data-fidelity and
 * formula-injection hazard, not behaviour to copy.
 */
export function toUserEnteredCell(value: string): Record<string, any> {
  if (value === "") return {};
  if (/^-?(0|[1-9]\d{0,14})(\.\d{1,14})?$/.test(value)) return { userEnteredValue: { numberValue: Number(value) } };
  if (/^(true|false)$/i.test(value)) return { userEnteredValue: { boolValue: value.toLowerCase() === "true" } };
  return { userEnteredValue: { stringValue: value } };
}

const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^-?(0|[1-9]\d*)(\.\d+)?$/;
/** Makes a string safe against formula injection on a USER_ENTERED write; leaves plain numbers and everything else as it is. */
export function neutraliseFormula(value: string): string {
  return FORMULA_START.test(value) && !PLAIN_NUMBER.test(value) ? `'${value}` : value;
}

function rowNumberFromRange(range: string | null | undefined): number {
  const match = /![A-Z]+(\d+)/.exec(range || "");
  if (!match) throw new Error(`Google Sheets did not report where the row was written (${range}).`);
  return parseInt(match[1], 10);
}

/**
 * Every Sheets API call goes through `call()`:
 *  - idempotent calls (reads, in-place updates, clears) retry on any transient error;
 *  - appends retry ONLY on quota errors. Google rejects those before applying them, so a retry cannot
 *    duplicate a row; after an ambiguous 5xx / network failure an append is not retried blindly — the
 *    caller's own idempotency key (e.g. a donation's submissionKey) decides what to do.
 */
export class SheetsService {
  private spreadsheetId: string;
  private verifiedSheets = new Set<string>();
  private headersCache = new Map<string, string[]>();
  /** Tab titles seen in the last spreadsheet listing, so verifying several tabs costs one request, not one each. */
  private knownTabs: Set<string> | null = null;
  /** Numeric sheet ids from the same listing (appendCells addresses a tab by id). */
  private tabIds = new Map<string, number>();
  /** The in-flight tab listing, shared by every caller that starts while it is running (one request, not one each). */
  private tabsLoading: Promise<Set<string>> | null = null;
  /** Header reads requested in the same tick, sent as ONE batched request. */
  private headerQueue = new Map<string, { resolve: (h: string[]) => void; reject: (e: Error) => void }[]>();

  constructor(spreadsheetId: string = GOOGLE_SHEET_ID) {
    this.spreadsheetId = spreadsheetId;
  }

  private get sheets() {
    // Refuse before any request is made: a missing or malformed id never reaches Google and is never retried.
    assertSpreadsheetId(this.spreadsheetId);
    const client = getSheetsClient();
    if (!client) {
      throw new Error(`Google Sheets client is not initialized. ${googleAuthProblem()}`);
    }
    return client;
  }

  private call<T>(label: string, fn: () => Promise<T>, appendOnly = false): Promise<T> {
    const kind = /^(read rows|get headers|get spreadsheet|batch read)/.test(label) ? "read" : "write";
    const run = withGoogleRetry(fn, { label: `Sheets ${label}`, quotaOnly: appendOnly, kind });
    if (kind === "read") return run;
    // A write finished (or failed) at this moment: a read that is already in flight may not contain it, so it must not be shared afterwards.
    return run.finally(() => {
      gs.__daaraynLastWriteDoneAt = performance.now();
    });
  }

  /**
   * Initializes Phase 07 System Metadata (_System sheet)
   */
  public async initializeSystemMetadata(): Promise<void> {
    const headers = ["schema_version", "migration_version", "environment", "initialized_at", "last_migration_at", "last_migration_status"];
    await this.ensureSheetExists("_System", headers);
    const rows = await this.getAllRows("_System");
    if (rows.length === 0) {
      await this.appendRow("_System", {
        schema_version: "2.0.0",
        migration_version: "v2-google-sheets-drive",
        environment: process.env.NODE_ENV || "production",
        initialized_at: new Date().toISOString(),
        last_migration_at: new Date().toISOString(),
        last_migration_status: "SUCCESS",
      }, headers);
    }
  }

  /**
   * Ensures that a worksheet tab exists in the spreadsheet.
   * If missing, it creates the tab and writes the header row.
   */
  public async ensureSheetExists(sheetName: string, headers: string[]): Promise<void> {
    if (this.verifiedSheets.has(sheetName)) {
      return;
    }
    try {
      // Only list the spreadsheet when this tab is not already known to exist.
      // List once per instance; a tab missing from that listing is simply created ("already exists" is tolerated below).
      if (!this.knownTabs) this.knownTabs = await this.loadKnownTabs();
      const sheetExists = this.knownTabs.has(sheetName);

      if (!sheetExists) {
        try {
          const added = await this.call("add tab", () =>
            this.sheets.spreadsheets.batchUpdate({
              spreadsheetId: this.spreadsheetId,
              requestBody: { requests: [{ addSheet: { properties: { title: sheetName } } }] },
            })
          );
          const newId = added?.data?.replies?.[0]?.addSheet?.properties?.sheetId;
          if (newId != null) this.tabIds.set(sheetName, newId);
        } catch (err: any) {
          // Another instance created the tab between our check and our request: that is fine.
          if (!/already exists/i.test(String(err?.message))) throw err;
        }
        this.knownTabs.add(sheetName);
        await this.setHeaders(sheetName, headers);
      } else {
        const currentHeaders = await this.getHeaders(sheetName);
        if (currentHeaders.length === 0) {
          await this.setHeaders(sheetName, headers);
        }
      }
      this.verifiedSheets.add(sheetName);
    } catch (err: any) {
      console.error(`[SheetsService] Failed to ensure sheet ${sheetName}:`, err.message);
      throw err;
    }
  }

  /** One tab listing at a time: concurrent callers wait for the same request. A failure is not remembered. */
  private loadKnownTabs(): Promise<Set<string>> {
    if (!this.tabsLoading) {
      this.tabsLoading = this.call("get spreadsheet", () => this.sheets.spreadsheets.get({ spreadsheetId: this.spreadsheetId }))
        .then((meta) => {
          for (const t of meta.data.sheets || []) if (t.properties?.sheetId != null) this.tabIds.set(String(t.properties.title), t.properties.sheetId);
          return new Set((meta.data.sheets || []).map((t) => String(t.properties?.title)));
        })
        .finally(() => {
          this.tabsLoading = null;
        });
    }
    return this.tabsLoading;
  }

  private parseHeaderRow(rows: any[][] | null | undefined): string[] {
    return !rows || rows.length === 0 ? [] : rows[0].map((h) => String(h).trim());
  }

  /** Sends every header read queued in this tick as one batchGet; if that fails, each tab is read on its own so one bad tab cannot fail the rest. */
  private async flushHeaderQueue(): Promise<void> {
    const queued = this.headerQueue;
    this.headerQueue = new Map();
    const requested = [...queued.keys()];
    // A cold instance is going to need the header row of most worksheets it knows (one donation touches five). They ride in the SAME batched
    // request instead of five single reads. Only tabs that the last listing showed to exist and that are not cached yet; nobody waits on them,
    // and a failure of the batch falls back to the requested tabs only. Headers are cached per instance exactly as before.
    const extra = this.knownTabs ? [...registeredSchemas().keys()].filter((t) => this.knownTabs!.has(t) && !this.headersCache.has(t) && !queued.has(t)) : [];
    const names = [...requested, ...extra];
    const settle = (name: string, fn: (w: { resolve: (h: string[]) => void; reject: (e: Error) => void }) => void) => queued.get(name)?.forEach(fn);
    const single = async (name: string) => {
      try {
        const res = await this.call("get headers", () => this.sheets.spreadsheets.values.get({ spreadsheetId: this.spreadsheetId, range: `'${name}'!1:1` }));
        const headers = this.parseHeaderRow(res.data.values as any);
        if (headers.length > 0) this.headersCache.set(name, headers);
        settle(name, (w) => w.resolve(headers));
      } catch (err: any) {
        settle(name, (w) => w.reject(new Error(`Could not read headers of ${name}: ${err.message}`)));
      }
    };
    if (names.length === 1) return single(names[0]);
    try {
      const res = await this.call("get headers (batch)", () =>
        this.sheets.spreadsheets.values.batchGet({ spreadsheetId: this.spreadsheetId, ranges: names.map((n) => `'${n}'!1:1`) })
      );
      names.forEach((name, i) => {
        const headers = this.parseHeaderRow(res.data.valueRanges?.[i]?.values as any);
        if (headers.length > 0) this.headersCache.set(name, headers);
        settle(name, (w) => w.resolve(headers));
      });
    } catch {
      await Promise.all(requested.map(single));
    }
  }

  public async getHeaders(sheetName: string): Promise<string[]> {
    if (this.headersCache.has(sheetName)) {
      const cached = this.headersCache.get(sheetName)!;
      if (cached.length > 0) return cached;
    }
    return new Promise<string[]>((resolve, reject) => {
      const first = this.headerQueue.size === 0;
      const waiters = this.headerQueue.get(sheetName) || [];
      waiters.push({ resolve, reject });
      this.headerQueue.set(sheetName, waiters);
      if (first) setTimeout(() => void this.flushHeaderQueue(), 0);
    });
  }

  public async clearRange(range: string): Promise<void> {
    await this.call("clear range", () => this.sheets.spreadsheets.values.clear({ spreadsheetId: this.spreadsheetId, range }));
  }

  /** Writes the header row in ONE request (a separate clear first only doubled the write cost). */
  public async setHeaders(sheetName: string, headers: string[]): Promise<void> {
    await this.call("set headers", () =>
      this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `'${sheetName}'!1:1`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [headers] },
      })
    );
    this.headersCache.set(sheetName, [...headers]);
  }

  /**
   * Turns a raw values grid into records, keeping each record's 1-based sheet
   * row number. Blank rows (cleared or never written) are skipped but still
   * counted, so row numbers always match the sheet.
   */
  private parseValues(values: any[][] | null | undefined): { headers: string[]; rows: SheetRow[] } {
    if (!values || values.length === 0) return { headers: [], rows: [] };
    const headers = values[0].map((h: any) => String(h).trim());
    const rows: SheetRow[] = [];
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      if (!row || row.length === 0 || !row[0]) continue;
      const record: Record<string, any> = {};
      headers.forEach((header, colIndex) => {
        const val = row[colIndex];
        record[header] = val !== undefined && val !== null ? val : "";
      });
      rows.push({ rowNumber: i + 1, record });
    }
    return { headers, rows };
  }

  /**
   * Reads every data row. Throws when Sheets cannot be read: returning an
   * empty list here used to look like "no records" to callers, which showed
   * zero totals and made updateRow() append duplicates of existing rows.
   */
  public async getAllRows(sheetName: string): Promise<Record<string, any>[]> {
    return (await this.getRowsWithNumbers(sheetName)).rows.map((r) => r.record);
  }

  public async getRowsWithNumbers(sheetName: string): Promise<{ headers: string[]; rows: SheetRow[] }> {
    try {
      const key = `${this.spreadsheetId}|${sheetName}`;
      const shared = inflightReads.get(key);
      if (shared && shared.startedAt >= (gs.__daaraynLastWriteDoneAt as number)) return await shared.promise;
      const promise = this.call(`read rows ${sheetName}`, () =>
        this.sheets.spreadsheets.values.get({ spreadsheetId: this.spreadsheetId, range: `'${sheetName}'!A:ZZ` })
      ).then((res) => this.parseValues(res.data.values));
      const entry = { startedAt: performance.now(), promise };
      inflightReads.set(key, entry);
      try {
        return await promise;
      } finally {
        if (inflightReads.get(key) === entry) inflightReads.delete(key);
      }
    } catch (err: any) {
      console.error(`[SheetsService] Failed to fetch rows from ${sheetName}:`, err.message);
      throw new Error(`Could not read ${sheetName} from Google Sheets: ${err.message}`);
    }
  }

  /** Reads several tabs in a single Sheets API request. Throws on failure. */
  public async batchGetRows(sheetNames: string[]): Promise<Record<string, Record<string, any>[]>> {
    try {
      const res = await this.call("batch read", () =>
        this.sheets.spreadsheets.values.batchGet({
          spreadsheetId: this.spreadsheetId,
          ranges: sheetNames.map((name) => `'${name}'!A:ZZ`),
        })
      );
      const out: Record<string, Record<string, any>[]> = {};
      sheetNames.forEach((name, i) => {
        out[name] = this.parseValues(res.data.valueRanges?.[i]?.values).rows.map((r) => r.record);
      });
      return out;
    } catch (err: any) {
      console.error(`[SheetsService] Failed to batch-read ${sheetNames.join(", ")}:`, err.message);
      throw new Error(`Could not read ${sheetNames.join(", ")} from Google Sheets: ${err.message}`);
    }
  }

  /**
   * ONE request that reads several tabs (all rows) AND the header row of other tabs (for a contract check). Throws on failure.
   * Used by the intake fast path: eligibility and the intake worksheet header contract arrive together, so no tab listing and no separate
   * header read is needed on a cold instance. The error text of a missing worksheet is kept so the caller can tell "not provisioned" from "unreachable".
   */
  public async batchGetRowsAndHeaders(sheetNames: string[], headerOf: string[]): Promise<{ rows: Record<string, Record<string, any>[]>; headers: Record<string, string[]> }> {
    try {
      const res = await this.call("batch read", () =>
        this.sheets.spreadsheets.values.batchGet({
          spreadsheetId: this.spreadsheetId,
          ranges: [...sheetNames.map((n) => `'${n}'!A:ZZ`), ...headerOf.map((n) => `'${n}'!1:1`)],
        })
      );
      const rows: Record<string, Record<string, any>[]> = {};
      sheetNames.forEach((name, i) => {
        rows[name] = this.parseValues(res.data.valueRanges?.[i]?.values).rows.map((r) => r.record);
      });
      const headers: Record<string, string[]> = {};
      headerOf.forEach((name, i) => {
        headers[name] = this.parseHeaderRow(res.data.valueRanges?.[sheetNames.length + i]?.values as any);
      });
      return { rows, headers };
    } catch (err: any) {
      throw new Error(`Could not read ${[...sheetNames, ...headerOf].join(", ")} from Google Sheets: ${err.message}`);
    }
  }

  /**
   * Appends ONE row as literal text (valueInputOption RAW: nothing is parsed, nothing is evaluated as a formula), in the order of `headers`, which the caller
   * has validated in the same request that read the data. Needs no tab listing and no header read. Retried on quota errors only, like every append.
   */
  public async appendRowRaw(sheetName: string, record: Record<string, any>, headers: string[]): Promise<void> {
    await this.call(
      `append row ${sheetName}`,
      () =>
        this.sheets.spreadsheets.values.append({
          spreadsheetId: this.spreadsheetId,
          range: `'${sheetName}'!A:A`,
          valueInputOption: "RAW",
          insertDataOption: "INSERT_ROWS",
          requestBody: { values: [this.rawRowValues(headers, record)] },
        }),
      true
    );
  }

  /** The strings of one record in header order, exactly as given (no formula protection). */
  private rawRowValues(headers: string[], record: Record<string, any>): string[] {
    return headers.map((h) => {
      const val = record[h];
      if (val === undefined || val === null) return "";
      if (typeof val === "object") return JSON.stringify(val);
      return String(val);
    });
  }

  /**
   * Values for the USER_ENTERED write paths (values.append / values.update). Text that Sheets would evaluate as a FORMULA ("=...", and the
   * "+", "-", "@" prefixes plus TAB/CR that spreadsheet software also treats as formula starters) is written with a leading apostrophe, which
   * Sheets stores as literal text and strips on read (verified live on the approved test spreadsheet). Plain numbers are untouched.
   */
  private toRowValues(headers: string[], record: Record<string, any>): string[] {
    return this.rawRowValues(headers, record).map(neutraliseFormula);
  }

  /** Adds any keys of `record` missing from the header row and returns the headers. */
  private async ensureHeadersFor(sheetName: string, record: Record<string, any>, expectedHeaders?: string[]): Promise<string[]> {
    let headers = [...(await this.getHeaders(sheetName))];
    if (headers.length === 0 && expectedHeaders) {
      headers = [...expectedHeaders];
      await this.setHeaders(sheetName, headers);
    }
    let headersUpdated = false;
    for (const key of Object.keys(record)) {
      if (!headers.includes(key)) {
        headers.push(key);
        headersUpdated = true;
      }
    }
    if (headersUpdated) {
      await this.setHeaders(sheetName, headers);
    }
    return headers;
  }

  /** Overwrites one known row in place (no lookup, no append fallback). Idempotent, so it retries on transient errors. */
  public async updateRowAt(sheetName: string, rowNumber: number, record: Record<string, any>): Promise<void> {
    const headers = await this.ensureHeadersFor(sheetName, record);
    await this.call(`update row ${sheetName}`, () =>
      this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `'${sheetName}'!A${rowNumber}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [this.toRowValues(headers, record)] },
      })
    );
  }

  /** Blanks one row. Rows are cleared rather than deleted so other row numbers never shift. */
  public async clearRowAt(sheetName: string, rowNumber: number): Promise<void> {
    await this.call("clear row", () =>
      this.sheets.spreadsheets.values.clear({ spreadsheetId: this.spreadsheetId, range: `'${sheetName}'!A${rowNumber}:ZZ${rowNumber}` })
    );
  }

  public async getRowById(sheetName: string, id: string): Promise<{ row: Record<string, any>; rowIndex: number } | null> {
    const all = await this.getAllRows(sheetName);
    const index = all.findIndex((r) => String(r.id || r.ID || r[Object.keys(r)[0]]) === id);
    if (index === -1) return null;
    return { row: all[index], rowIndex: index + 2 }; // +2 for header row & 1-based index
  }

  /** Appends one row and returns the 1-based sheet row number it landed on. Retried on quota errors only. */
  public async appendRow(sheetName: string, record: Record<string, any>, expectedHeaders?: string[]): Promise<number> {
    const headers = await this.ensureHeadersFor(sheetName, record, expectedHeaders);
    const res = await this.call(
      `append row ${sheetName}`,
      () =>
        this.sheets.spreadsheets.values.append({
          spreadsheetId: this.spreadsheetId,
          range: `'${sheetName}'!A:A`,
          valueInputOption: "USER_ENTERED",
          insertDataOption: "INSERT_ROWS",
          requestBody: { values: [this.toRowValues(headers, record)] },
        }),
      true
    );
    return rowNumberFromRange(res.data.updates?.updatedRange);
  }

  public async updateRow(sheetName: string, id: string, record: Record<string, any>): Promise<boolean> {
    const match = await this.getRowById(sheetName, id);
    if (!match) {
      // If not found, append as fallback
      await this.appendRow(sheetName, record);
      return true;
    }
    const { row: existingRow, rowIndex } = match;
    await this.updateRowAt(sheetName, rowIndex, { ...existingRow, ...record });
    return true;
  }

  /** Appends several rows in one request and returns the 1-based row number of the first. Retried on quota errors only. */
  public async appendRows(sheetName: string, records: Record<string, any>[], expectedHeaders: string[]): Promise<number> {
    if (records.length === 0) throw new Error("appendRows needs at least one record.");
    await this.ensureSheetExists(sheetName, expectedHeaders);
    const headers = await this.ensureHeadersFor(sheetName, Object.assign({}, ...records), expectedHeaders);
    const res = await this.call(
      "append rows",
      () =>
        this.sheets.spreadsheets.values.append({
          spreadsheetId: this.spreadsheetId,
          range: `'${sheetName}'!A:A`,
          valueInputOption: "USER_ENTERED",
          insertDataOption: "INSERT_ROWS",
          requestBody: { values: records.map((r) => this.toRowValues(headers, r)) },
        }),
      true
    );
    return rowNumberFromRange(res.data.updates?.updatedRange);
  }

  /** Overwrites several known rows in one request. */
  public async updateRowsAt(sheetName: string, updates: { rowNumber: number; record: Record<string, any> }[]): Promise<void> {
    if (updates.length === 0) return;
    const headers = await this.ensureHeadersFor(sheetName, Object.assign({}, ...updates.map((u) => u.record)));
    await this.call("update rows", () =>
      this.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          valueInputOption: "USER_ENTERED",
          data: updates.map((u) => ({ range: `'${sheetName}'!A${u.rowNumber}`, values: [this.toRowValues(headers, u.record)] })),
        },
      })
    );
  }

  /** Numeric id of a tab; one listing request only when this instance has not seen the tab yet. */
  private async sheetIdFor(sheetName: string): Promise<number> {
    if (!this.tabIds.has(sheetName)) {
      this.knownTabs = null;
      this.knownTabs = await this.loadKnownTabs();
    }
    const id = this.tabIds.get(sheetName);
    if (id == null) throw new Error(`Worksheet ${sheetName} was not found in the spreadsheet.`);
    return id;
  }

  /**
   * Appends rows to SEVERAL tabs in ONE request (spreadsheets.batchUpdate with appendCells; Google counts a batch as one request and applies
   * it atomically: every tab receives its rows or none does). Sheet existence and headers are handled exactly as in appendRows. Retried on
   * quota errors only, like every append: after an ambiguous failure the caller's own idempotency decides. Cell typing: see toUserEnteredCell.
   */
  public async appendRowsToTabs(batches: TabAppend[]): Promise<void> {
    const live = batches.filter((b) => b.records.length > 0);
    if (live.length === 0) return;
    const prepared: { rows: Record<string, any>[]; sheetId: number }[] = [];
    for (const b of live) {
      await this.ensureSheetExists(b.sheetName, b.expectedHeaders);
      const headers = await this.ensureHeadersFor(b.sheetName, Object.assign({}, ...b.records), b.expectedHeaders);
      prepared.push({ sheetId: await this.sheetIdFor(b.sheetName), rows: b.records.map((r) => ({ values: this.rawRowValues(headers, r).map(toUserEnteredCell) })) });
    }
    await this.call(
      "append rows (batch)",
      () =>
        this.sheets.spreadsheets.batchUpdate({
          spreadsheetId: this.spreadsheetId,
          requestBody: { requests: prepared.map((p) => ({ appendCells: { sheetId: p.sheetId, rows: p.rows, fields: "userEnteredValue" } })) },
        }),
      true
    );
  }

  /**
   * Writes ONLY the named cells of known rows, in ONE request, with LITERAL-safe values (spreadsheets.batchUpdate updateCells: numbers and
   * booleans typed, all other text literal, never a formula). No other cell of the row is touched, so a writer can never overwrite a field
   * it does not own (a status an administrator changed meanwhile). Writing the same value twice is harmless, so it retries on any transient error.
   */
  public async updateFieldsLiteral(sheetName: string, updates: { rowNumber: number; fields: Record<string, any> }[]): Promise<void> {
    const live = updates.filter((u) => Object.keys(u.fields).length > 0);
    if (live.length === 0) return;
    const headers = await this.ensureHeadersFor(sheetName, Object.assign({}, ...live.map((u) => u.fields)));
    const sheetId = await this.sheetIdFor(sheetName);
    const cell = (v: any) => toUserEnteredCell(v === undefined || v === null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
    const requests = live.flatMap((u) =>
      Object.entries(u.fields).map(([name, value]) => ({
        updateCells: { start: { sheetId, rowIndex: u.rowNumber - 1, columnIndex: headers.indexOf(name) }, rows: [{ values: [cell(value)] }], fields: "userEnteredValue" },
      }))
    );
    await this.call("update rows (batch)", () => this.sheets.spreadsheets.batchUpdate({ spreadsheetId: this.spreadsheetId, requestBody: { requests } }));
  }

  public async batchAppendRows(sheetName: string, records: Record<string, any>[], expectedHeaders: string[]): Promise<void> {
    if (records.length === 0) return;
    await this.appendRows(sheetName, records, expectedHeaders);
  }
}

export const sheetsService = new SheetsService();
