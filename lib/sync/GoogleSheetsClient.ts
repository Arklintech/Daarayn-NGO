import { google, sheets_v4 } from "googleapis";

export class GoogleSheetsClient {
  private sheets: sheets_v4.Sheets | null = null;
  private sheetId: string;

  constructor() {
    this.sheetId = process.env.GOOGLE_SHEET_ID || "";
    
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

    if (clientEmail && privateKey && this.sheetId) {
      const auth = new google.auth.JWT({
        email: clientEmail,
        key: privateKey,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });
      this.sheets = google.sheets({ version: "v4", auth });
    } else {
      console.warn("Google Sheets credentials are not fully configured.");
    }
  }

  public isConfigured(): boolean {
    return this.sheets !== null;
  }

  public async appendRow(sheetName: string, values: any[]): Promise<void> {
    if (!this.sheets) {
      console.warn(`[GoogleSheetsClient] Skipping appendRow to ${sheetName} because sheets client is not configured.`);
      return;
    }

    try {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.sheetId,
        range: `${sheetName}!A:A`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [values],
        },
      });
    } catch (error: any) {
      console.error(`[GoogleSheetsClient] Failed to append row to ${sheetName}:`, error.message);
      throw error;
    }
  }

  public async updateRow(sheetName: string, rowIndex: number, values: any[]): Promise<void> {
    if (!this.sheets) return;
    
    try {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.sheetId,
        range: `${sheetName}!A${rowIndex}`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [values],
        },
      });
    } catch (error: any) {
      console.error(`[GoogleSheetsClient] Failed to update row in ${sheetName}:`, error.message);
      throw error;
    }
  }

  public async getHeaders(sheetName: string): Promise<string[]> {
    if (!this.sheets) return [];
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.sheetId,
        range: `${sheetName}!1:1`,
      });
      const rows = response.data.values;
      if (!rows || rows.length === 0) return [];
      return rows[0].map(h => String(h).trim());
    } catch (error: any) {
      console.error(`[GoogleSheetsClient] Failed to get headers for ${sheetName}:`, error.message);
      // Return empty if sheet is empty or has issues
      return [];
    }
  }

  public async setHeaders(sheetName: string, headers: string[]): Promise<void> {
    if (!this.sheets) return;
    try {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.sheetId,
        range: `${sheetName}!1:1`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [headers],
        },
      });
    } catch (error: any) {
      console.error(`[GoogleSheetsClient] Failed to set headers for ${sheetName}:`, error.message);
      throw error;
    }
  }

  public async findRowIndex(sheetName: string, id: string): Promise<number | null> {
    if (!this.sheets) return null;
    
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.sheetId,
        range: `${sheetName}!A:A`,
      });
      
      const rows = response.data.values;
      if (!rows) return null;
      
      // rows is an array of arrays, e.g. [["ID"], ["DNR-2026-000001"]]
      // Google Sheets is 1-indexed for ranges
      const index = rows.findIndex(row => row[0] === id);
      return index !== -1 ? index + 1 : null;
    } catch (error: any) {
      console.error(`[GoogleSheetsClient] Failed to find row in ${sheetName}:`, error.message);
      throw error;
    }
  }
}
