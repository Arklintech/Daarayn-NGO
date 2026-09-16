import { getSheetsClient, GOOGLE_SHEET_ID } from "./client";

export class SheetsService {
  private spreadsheetId: string;

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
    } catch (err: any) {
      console.error(`[SheetsService] Failed to ensure sheet ${sheetName}:`, err.message);
      throw err;
    }
  }

  public async getHeaders(sheetName: string): Promise<string[]> {
    try {
      const res = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `'${sheetName}'!1:1`,
      });
      const rows = res.data.values;
      if (!rows || rows.length === 0) return [];
      return rows[0].map((h) => String(h).trim());
    } catch (err: any) {
      return [];
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

  public async getAllRows(sheetName: string): Promise<Record<string, any>[]> {
    try {
      const res = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `'${sheetName}'!A:ZZ`,
      });

      const values = res.data.values;
      if (!values || values.length <= 1) return [];

      const headers = values[0].map((h: any) => String(h).trim());
      const records: Record<string, any>[] = [];

      for (let i = 1; i < values.length; i++) {
        const row = values[i];
        if (!row || row.length === 0 || !row[0]) continue; // Skip empty rows

        const record: Record<string, any> = {};
        headers.forEach((header, colIndex) => {
          const val = row[colIndex];
          record[header] = val !== undefined && val !== null ? val : "";
        });

        records.push(record);
      }

      return records;
    } catch (err: any) {
      console.error(`[SheetsService] Failed to fetch rows from ${sheetName}:`, err.message);
      return [];
    }
  }

  public async getRowById(sheetName: string, id: string): Promise<{ row: Record<string, any>; rowIndex: number } | null> {
    const all = await this.getAllRows(sheetName);
    const index = all.findIndex((r) => String(r.id || r.ID || r[Object.keys(r)[0]]) === id);
    if (index === -1) return null;
    return { row: all[index], rowIndex: index + 2 }; // +2 for header row & 1-based index
  }

  public async appendRow(sheetName: string, record: Record<string, any>, expectedHeaders?: string[]): Promise<void> {
    let headers = await this.getHeaders(sheetName);
    if (headers.length === 0 && expectedHeaders) {
      headers = expectedHeaders;
      await this.setHeaders(sheetName, headers);
    }

    // Dynamic header expansion if record contains new keys
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

    const rowValues = headers.map((h) => {
      const val = record[h];
      if (val === undefined || val === null) return "";
      if (typeof val === "object") return JSON.stringify(val);
      return String(val);
    });

    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `'${sheetName}'!A:A`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [rowValues],
      },
    });
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
