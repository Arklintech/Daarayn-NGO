import { getSheetsClient, GOOGLE_SHEET_ID } from "./client";

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

export class SheetsService {
  private spreadsheetId: string;
  private verifiedSheets = new Set<string>();
  private headersCache = new Map<string, string[]>();

  constructor(spreadsheetId: string = GOOGLE_SHEET_ID) {
    this.spreadsheetId = spreadsheetId;
  }

  private get sheets() {
    const client = getSheetsClient();
    if (!client) {
      throw new Error("Google Sheets client is not initialized.");
    }
    return client;
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
      const meta = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId,
      });

      const sheetExists = meta.data.sheets?.some(
        (s) => s.properties?.title === sheetName
      );

      if (!sheetExists) {
        // Create tab
        await this.sheets.spreadsheets.batchUpdate({
          spreadsheetId: this.spreadsheetId,
          requestBody: {
            requests: [
              {
                addSheet: {
                  properties: { title: sheetName },
                },
              },
            ],
          },
        });

        // Set Headers
        await this.setHeaders(sheetName, headers);
      } else {
        // Verify or initialize headers if empty
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
      const res = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `'${sheetName}'!1:1`,
      });
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
    await this.sheets.spreadsheets.values.clear({
      spreadsheetId: this.spreadsheetId,
      range,
    });
  }

  public async setHeaders(sheetName: string, headers: string[]): Promise<void> {
    try {
      await this.sheets.spreadsheets.values.clear({
        spreadsheetId: this.spreadsheetId,
        range: `'${sheetName}'!1:1`,
      });
    } catch (e) {}

    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `'${sheetName}'!1:1`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [headers],
      },
    });
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
      const res = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `'${sheetName}'!A:ZZ`,
      });
      return this.parseValues(res.data.values);
    } catch (err: any) {
      console.error(`[SheetsService] Failed to fetch rows from ${sheetName}:`, err.message);
      throw new Error(`Could not read ${sheetName} from Google Sheets: ${err.message}`);
    }
  }

  /** Reads several tabs in a single Sheets API request. Throws on failure. */
  public async batchGetRows(sheetNames: string[]): Promise<Record<string, Record<string, any>[]>> {
    try {
      const res = await this.sheets.spreadsheets.values.batchGet({
        spreadsheetId: this.spreadsheetId,
        ranges: sheetNames.map((name) => `'${name}'!A:ZZ`),
      });
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
      this.headersCache.set(sheetName, headers);
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
      this.headersCache.set(sheetName, headers);
    }
    return headers;
  }

  /** Overwrites one known row in place (no lookup, no append fallback). */
  public async updateRowAt(sheetName: string, rowNumber: number, record: Record<string, any>): Promise<void> {
    const headers = await this.ensureHeadersFor(sheetName, record);
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `'${sheetName}'!A${rowNumber}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [this.toRowValues(headers, record)] },
    });
  }

  /** Blanks one row. Rows are cleared rather than deleted so other row numbers never shift. */
  public async clearRowAt(sheetName: string, rowNumber: number): Promise<void> {
    await this.sheets.spreadsheets.values.clear({
      spreadsheetId: this.spreadsheetId,
      range: `'${sheetName}'!A${rowNumber}:ZZ${rowNumber}`,
    });
  }

  public async getRowById(sheetName: string, id: string): Promise<{ row: Record<string, any>; rowIndex: number } | null> {
    const all = await this.getAllRows(sheetName);
    const index = all.findIndex((r) => String(r.id || r.ID || r[Object.keys(r)[0]]) === id);
    if (index === -1) return null;
    return { row: all[index], rowIndex: index + 2 }; // +2 for header row & 1-based index
  }

  /** Appends one row and returns the 1-based sheet row number it landed on. */
  public async appendRow(sheetName: string, record: Record<string, any>, expectedHeaders?: string[]): Promise<number> {
    const headers = await this.ensureHeadersFor(sheetName, record, expectedHeaders);
    const res = await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `'${sheetName}'!A:A`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [this.toRowValues(headers, record)],
      },
    });
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
    const merged = { ...existingRow, ...record };

    let headers = await this.getHeaders(sheetName);
    let headersUpdated = false;
    for (const key of Object.keys(merged)) {
      if (!headers.includes(key)) {
        headers.push(key);
        headersUpdated = true;
      }
    }
    if (headersUpdated) {
      await this.setHeaders(sheetName, headers);
    }

    const rowValues = headers.map((h) => {
      const val = merged[h];
      if (val === undefined || val === null) return "";
      if (typeof val === "object") return JSON.stringify(val);
      return String(val);
    });

    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `'${sheetName}'!A${rowIndex}`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [rowValues],
      },
    });

    return true;
  }

  /** Appends several rows in one request and returns the 1-based row number of the first. */
  public async appendRows(sheetName: string, records: Record<string, any>[], expectedHeaders: string[]): Promise<number> {
    if (records.length === 0) throw new Error("appendRows needs at least one record.");
    await this.ensureSheetExists(sheetName, expectedHeaders);
    let headers = await this.getHeaders(sheetName);
    const missing = Object.keys(records[0]).filter((k) => !headers.includes(k));
    if (missing.length) headers = await this.ensureHeadersFor(sheetName, records[0], expectedHeaders);
    const res = await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `'${sheetName}'!A:A`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: records.map((r) => this.toRowValues(headers, r)) },
    });
    return rowNumberFromRange(res.data.updates?.updatedRange);
  }

  /** Overwrites several known rows in one request. */
  public async updateRowsAt(sheetName: string, updates: { rowNumber: number; record: Record<string, any> }[]): Promise<void> {
    if (updates.length === 0) return;
    const headers = await this.ensureHeadersFor(sheetName, Object.assign({}, ...updates.map((u) => u.record)));
    await this.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data: updates.map((u) => ({ range: `'${sheetName}'!A${u.rowNumber}`, values: [this.toRowValues(headers, u.record)] })),
      },
    });
  }

  public async batchAppendRows(sheetName: string, records: Record<string, any>[], expectedHeaders: string[]): Promise<void> {
    if (records.length === 0) return;
    await this.ensureSheetExists(sheetName, expectedHeaders);

    const headers = await this.getHeaders(sheetName);
    const rowsValues = records.map((record) =>
      headers.map((h) => {
        const val = record[h];
        if (val === undefined || val === null) return "";
        if (typeof val === "object") return JSON.stringify(val);
        return String(val);
      })
    );

    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `'${sheetName}'!A:A`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: rowsValues,
      },
    });
  }
}

export const sheetsService = new SheetsService();
