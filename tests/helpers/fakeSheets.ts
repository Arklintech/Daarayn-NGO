/**
 * In-memory stand-in for lib/google/sheets.ts SheetsService.
 *
 * Mirrors the real service's semantics that the repositories rely on:
 * 1-based row numbers that never shift, header-driven records, values stored as
 * strings, blank rows skipped on read, appended rows land at the end. Every
 * call yields to the event loop for a random few milliseconds so that
 * concurrent requests genuinely interleave (which is what the race-condition
 * tests need). `failWrites` simulates a failed Google Sheets write.
 */
export class FakeSheets {
  tabs = new Map<string, { headers: string[]; rows: string[][] }>();
  failWrites = false;
  jitter = true;

  reset() {
    this.tabs.clear();
    this.failWrites = false;
  }

  private async tick() {
    if (this.jitter) await new Promise((r) => setTimeout(r, Math.random() * 4));
  }
  private tab(name: string) {
    let t = this.tabs.get(name);
    if (!t) {
      t = { headers: [], rows: [] };
      this.tabs.set(name, t);
    }
    return t;
  }
  private str(v: any): string {
    if (v === undefined || v === null) return "";
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  }
  private toRow(headers: string[], record: Record<string, any>) {
    return headers.map((h) => this.str(record[h]));
  }
  private guardWrite() {
    if (this.failWrites) throw new Error("Simulated Google Sheets write failure");
  }
  private growHeaders(t: { headers: string[] }, record: Record<string, any>) {
    for (const k of Object.keys(record)) if (!t.headers.includes(k)) t.headers.push(k);
  }

  async ensureSheetExists(name: string, headers: string[]) {
    await this.tick();
    const t = this.tab(name);
    if (t.headers.length === 0) t.headers = [...headers];
  }
  async getHeaders(name: string) {
    await this.tick();
    return [...this.tab(name).headers];
  }
  async setHeaders(name: string, headers: string[]) {
    this.tab(name).headers = [...headers];
  }
  async getRowsWithNumbers(name: string) {
    await this.tick();
    const t = this.tab(name);
    const rows: { rowNumber: number; record: Record<string, any> }[] = [];
    t.rows.forEach((values, i) => {
      if (!values[0]) return;
      const record: Record<string, any> = {};
      t.headers.forEach((h, c) => (record[h] = values[c] ?? ""));
      rows.push({ rowNumber: i + 2, record });
    });
    return { headers: [...t.headers], rows };
  }
  async getAllRows(name: string) {
    return (await this.getRowsWithNumbers(name)).rows.map((r) => r.record);
  }
  async batchGetRows(names: string[]) {
    const out: Record<string, Record<string, any>[]> = {};
    for (const n of names) out[n] = await this.getAllRows(n);
    return out;
  }
  async appendRow(name: string, record: Record<string, any>, expectedHeaders?: string[]) {
    await this.tick();
    this.guardWrite();
    const t = this.tab(name);
    if (t.headers.length === 0 && expectedHeaders) t.headers = [...expectedHeaders];
    this.growHeaders(t, record);
    t.rows.push(this.toRow(t.headers, record));
    return t.rows.length + 1;
  }
  async appendRows(name: string, records: Record<string, any>[], expectedHeaders: string[]) {
    await this.tick();
    this.guardWrite();
    const t = this.tab(name);
    if (t.headers.length === 0) t.headers = [...expectedHeaders];
    records.forEach((r) => this.growHeaders(t, r));
    const first = t.rows.length + 2;
    records.forEach((r) => t.rows.push(this.toRow(t.headers, r)));
    return first;
  }
  async batchAppendRows(name: string, records: Record<string, any>[], expectedHeaders: string[]) {
    if (records.length) await this.appendRows(name, records, expectedHeaders);
  }
  async updateRowAt(name: string, rowNumber: number, record: Record<string, any>) {
    await this.tick();
    this.guardWrite();
    const t = this.tab(name);
    this.growHeaders(t, record);
    t.rows[rowNumber - 2] = this.toRow(t.headers, record);
  }
  async updateRowsAt(name: string, updates: { rowNumber: number; record: Record<string, any> }[]) {
    for (const u of updates) await this.updateRowAt(name, u.rowNumber, u.record);
  }
  async clearRowAt(name: string, rowNumber: number) {
    await this.tick();
    this.guardWrite();
    this.tab(name).rows[rowNumber - 2] = [];
  }
  async updateRow(name: string, id: string, record: Record<string, any>) {
    const { rows } = await this.getRowsWithNumbers(name);
    const match = rows.find((r) => String(r.record.id || r.record[Object.keys(r.record)[0]]) === id);
    if (!match) {
      await this.appendRow(name, record);
      return true;
    }
    await this.updateRowAt(name, match.rowNumber, { ...match.record, ...record });
    return true;
  }
  async initializeSystemMetadata() {}

  /** Test helper: records currently in a tab. */
  records(name: string) {
    const t = this.tab(name);
    return t.rows
      .filter((v) => v[0])
      .map((values) => Object.fromEntries(t.headers.map((h, c) => [h, values[c] ?? ""])));
  }
  /** Test helper: seed rows directly (as if written earlier). */
  seed(name: string, headers: string[], records: Record<string, any>[]) {
    const t = this.tab(name);
    t.headers = [...headers];
    t.rows = records.map((r) => this.toRow(t.headers, r));
  }
}

export const fakeSheets = new FakeSheets();
