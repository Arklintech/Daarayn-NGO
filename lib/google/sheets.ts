import { getSheetsClient, GOOGLE_SHEET_ID, googleAuthProblem } from "./client";
import { withGoogleRetry } from "./retry";

export interface SheetRow {
  rowNumber: number;
  record: Record<string, any>;
}

/** "'Donations'!A17:O17" → 17 */
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

  constructor(spreadsheetId: string = GOOGLE_SHEET_ID) {
    this.spreadsheetId = spreadsheetId;
  }

  private get sheets() {
    if (!this.spreadsheetId) {
      throw new Error("GOOGLE_SHEET_ID is not configured.");
    }
    const client = getSheetsClient();
    if (!client) {
      throw new Error(`Google Sheets client is not initialized. ${googleAuthProblem()}`);
    }
    return client;
  }

  private call<T>(label: string, fn: () => Promise<T>, appendOnly = false): Promise<T> {
    return withGoogleRetry(fn, { label: `Sheets ${label}`, quotaOnly: appendOnly });
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
      if (!this.knownTabs) {
        const meta = await this.call("get spreadsheet", () => this.sheets.spreadsheets.get({ spreadsheetId: this.spreadsheetId }));
        this.knownTabs = new Set((meta.data.sheets || []).map((t) => String(t.properties?.title)));
      }
      const sheetExists = this.knownTabs.has(sheetName);

      if (!sheetExists) {
        try {
          await this.call("add tab", () =>
            this.sheets.spreadsheets.batchUpdate({
              spreadsheetId: this.spreadsheetId,
              requestBody: { requests: [{ addSheet: { properties: { title: sheetName } } }] },
            })
          );
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

  public async getHeaders(sheetName: string): Promise<string[]> {
    if (this.headersCache.has(sheetName)) {
      const cached = this.headersCache.get(sheetName)!;
      if (cached.length > 0) return cached;
    }
    try {
      const res = await this.call("get headers", () =>
        this.sheets.spreadsheets.values.get({ spreadsheetId: this.spreadsheetId, range: `'${sheetName}'!1:1` })
      );
      const rows = res.data.values;
      if (!rows || rows.length === 0) return [];
      const headers = rows[0].map((h) => String(h).trim());
      this.headersCache.set(sheetName, headers);
      return headers;
    } catch (err: any) {
      // Callers treat [] as "sheet has no header row yet" and write one, so a
      // failed read must not look like an empty header row.
      throw new Error(`Could not read headers of ${sheetName}: ${err.message}`);
    }
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
      const res = await this.call("read rows", () =>
        this.sheets.spreadsheets.values.get({ spreadsheetId: this.spreadsheetId, range: `'${sheetName}'!A:ZZ` })
      );
      return this.parseValues(res.data.values);
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

  private toRowValues(headers: string[], record: Record<string, any>): string[] {
    return headers.map((h) => {
      const val = record[h];
      if (val === undefined || val === null) return "";
      if (typeof val === "object") return JSON.stringify(val);
      return String(val);
    });
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
    await this.call("update row", () =>
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
      "append row",
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

  public async batchAppendRows(sheetName: string, records: Record<string, any>[], expectedHeaders: string[]): Promise<void> {
    if (records.length === 0) return;
    await this.appendRows(sheetName, records, expectedHeaders);
  }
}

export const sheetsService = new SheetsService();
