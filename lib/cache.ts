interface CacheEntry<T> {
  value: T;
  expiry: number;
  tags?: string[];
}

class MemoryCacheManager {
  private cache = new Map<string, CacheEntry<any>>();

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  set<T>(key: string, value: T, ttlMs: number = 60000, tags: string[] = []): void {
    this.cache.set(key, {
      value,
      expiry: Date.now() + ttlMs,
      tags,
    });
  }

  invalidateTag(tag: string): void {
    for (const [key, entry] of this.cache.entries()) {
      if (entry.tags && entry.tags.includes(tag)) {
        this.cache.delete(key);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }
}

export const memoryCache = new MemoryCacheManager();
