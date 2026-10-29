import { sheetsService } from "../google/sheets";
import { registerSchema } from "../google/schemaRegistry";

export abstract class BaseRepository<T extends { id: string }> {
  protected sheetName: string;
  protected headers: string[];
  private cache: Map<string, T> = new Map();
  private cacheLoaded: boolean = false;
  private lastFetchTime: number = 0;
  // Each serverless instance holds its own copy, so a long TTL hides rows
  // written by other instances (new donations, verifications) for minutes.
  private CACHE_TTL_MS = 30_000;
  private MISS_REFRESH_INTERVAL_MS = 3_000;
  // Several components ask for the same tab at the same moment (page load, realtime refresh); they share one Sheets read.
  private inflight: Promise<T[]> | null = null;

  constructor(sheetName: string, headers: string[]) {
    this.sheetName = sheetName;
    this.headers = headers;
    registerSchema(sheetName, headers);
  }

  protected abstract mapRowToEntity(row: Record<string, any>): T;
  protected abstract mapEntityToRow(entity: T): Record<string, any>;

  public async init(): Promise<void> {
    await sheetsService.ensureSheetExists(this.sheetName, this.headers);
  }

  public async getAll(forceRefresh = false): Promise<T[]> {
    const now = Date.now();
    if (this.cacheLoaded && !forceRefresh && now - this.lastFetchTime < this.CACHE_TTL_MS) {
      return Array.from(this.cache.values());
    }

    // Only ordinary reads share a request already in flight. A forced refresh must see writes that finished after that
    // request started, so it always performs its own read (sharing it would hand back a snapshot older than the caller's write).
    if (this.inflight && !forceRefresh) return this.inflight;
    const load = (async () => {
      await this.init();
      const rows = await sheetsService.getAllRows(this.sheetName);
      return this.hydrate(rows, Date.now());
    })();
    if (!forceRefresh) this.inflight = load;
    try {
      return await load;
    } finally {
      if (this.inflight === load) this.inflight = null;
    }
  }

  public get tabName(): string {
    return this.sheetName;
  }

  /**
   * Maps rows that were read elsewhere (e.g. several tabs in one batch
   * request) and refreshes this repository's cache with them.
   */
  public hydrate(rows: Record<string, any>[], fetchedAt = Date.now()): T[] {
    this.cache.clear();
    const entities: T[] = [];
    for (const row of rows) {
      if (!row) continue;
      // Check the mapped id: some tabs key rows by another column (Audit_Log uses event_id).
      const entity = this.mapRowToEntity(row);
      if (!entity.id) continue;
      this.cache.set(entity.id, entity);
      entities.push(entity);
    }
    this.cacheLoaded = true;
    this.lastFetchTime = fetchedAt;
    return entities;
  }

  public async getById(id: string): Promise<T | null> {
    await this.getAll();
    const cached = this.cache.get(id);
    if (cached) return cached;

    // The row may have been written by another instance after our cache was
    // filled; without this, save() appends a duplicate and update() silently
    // does nothing. Throttled so lookups of unknown ids can't hammer Sheets.
    if (Date.now() - this.lastFetchTime >= this.MISS_REFRESH_INTERVAL_MS) {
      await this.getAll(true);
    }
    return this.cache.get(id) || null;
  }

  /**
   * "Look up, then append" is not atomic: two instances creating the SAME new id at once both append. Right after creating, the rows for this
   * id are re-read; a later row that is IDENTICAL to the earliest one (the double-submit case) is blanked, rows are never deleted. A later
   * row with DIFFERENT content is never touched: it is reported as an integrity incident (log) so a person decides, because blanking it
   * would lose a real edit.
   */
  private async resolveConcurrentCreate(id: string, rowData: Record<string, any>): Promise<void> {
    try {
      const { rows } = await sheetsService.getRowsWithNumbers(this.sheetName);
      const same = rows.filter((r) => String(r.record.id) === String(id));
      if (same.length < 2) return;
      const first = same[0];
      for (const dup of same.slice(1)) {
        const identical = Object.keys(rowData).every((k) => String(dup.record[k] ?? "") === String(first.record[k] ?? ""));
        if (identical) {
          console.warn(`[${this.sheetName}] concurrent create of ${id}: identical duplicate at row ${dup.rowNumber} blanked; row ${first.rowNumber} kept.`);
          await sheetsService.clearRowAt(this.sheetName, dup.rowNumber);
        } else {
          console.error(`[${this.sheetName}] INTEGRITY INCIDENT: id ${id} exists at rows ${first.rowNumber} and ${dup.rowNumber} with different content; nothing was changed.`);
        }
      }
    } catch (err: any) {
      console.error(`[${this.sheetName}] could not check ${id} for a concurrent duplicate:`, err?.message);
    }
  }

  public async save(entity: T): Promise<T> {
    await this.init();
    const existing = await this.getById(entity.id);
    const rowData = this.mapEntityToRow(entity);

    if (existing) {
      await sheetsService.updateRow(this.sheetName, entity.id, rowData);
    } else {
      await sheetsService.appendRow(this.sheetName, rowData, this.headers);
      await this.resolveConcurrentCreate(entity.id, rowData);
    }

    this.cache.set(entity.id, entity);
    return entity;
  }

  /**
   * Appends a NEW record with a unique id (notification, audit entry, ...). Unlike save() it does not first read the
   * tab to check whether the id exists, which saves a Sheets read per record on hot paths.
   */
  public async append(entity: T): Promise<T> {
    await this.init();
    await sheetsService.appendRow(this.sheetName, this.mapEntityToRow(entity), this.headers);
    this.cache.set(entity.id, entity);
    return entity;
  }

  public async saveBatch(entities: T[]): Promise<void> {
    if (entities.length === 0) return;
    await this.init();

    const rows = entities.map((e) => this.mapEntityToRow(e));
    await sheetsService.batchAppendRows(this.sheetName, rows, this.headers);

    for (const e of entities) {
      this.cache.set(e.id, e);
    }
  }

  public async create(entity: T): Promise<T> {
    return this.save(entity);
  }

  public async update(id: string, partial: Partial<T>): Promise<T | null> {
    await this.init();
    const existing = await this.getById(id);
    if (!existing) return null;
    const updated = { ...existing, ...partial };
    await this.save(updated);
    return updated;
  }

  public async delete(id: string): Promise<boolean> {
    await this.init();
    this.cache.delete(id);
    this.invalidateCache();
    return true;
  }

  public invalidateCache(): void {
    this.inflight = null; // a read that began before this write must not be shared with later callers
    this.cacheLoaded = false;
  }
}
