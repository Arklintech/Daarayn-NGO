import { sheetsService } from "../google/sheets";

export abstract class BaseRepository<T extends { id: string }> {
  protected sheetName: string;
  protected headers: string[];
  private cache: Map<string, T> = new Map();
  private cacheLoaded: boolean = false;
  private lastFetchTime: number = 0;
  private CACHE_TTL_MS = 30_000; // 30 seconds memory cache

  constructor(sheetName: string, headers: string[]) {
    this.sheetName = sheetName;
    this.headers = headers;
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

    await this.init();
    const rows = await sheetsService.getAllRows(this.sheetName);
    this.cache.clear();

    const entities: T[] = [];
    for (const row of rows) {
      if (!row || (!row.id && !row.ID)) continue;
      const entity = this.mapRowToEntity(row);
      this.cache.set(entity.id, entity);
      entities.push(entity);
    }

    this.cacheLoaded = true;
    this.lastFetchTime = now;
    return entities;
  }

  public async getById(id: string): Promise<T | null> {
    const all = await this.getAll();
    return this.cache.get(id) || null;
  }

  public async save(entity: T): Promise<T> {
    await this.init();
    const existing = await this.getById(entity.id);
    const rowData = this.mapEntityToRow(entity);

    if (existing) {
      await sheetsService.updateRow(this.sheetName, entity.id, rowData);
    } else {
      await sheetsService.appendRow(this.sheetName, rowData, this.headers);
    }

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
    this.cacheLoaded = false;
  }
}
