/**
 * lib/ai/knowledge/knowledgeCache.ts
 *
 * Localized knowledge cache for MOMIN AI-TOS.
 * Minimizes duplicate Firestore reads by caching query results with a 30s TTL.
 */

interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
}

class KnowledgeCache {
  private store: Map<string, CacheEntry> = new Map();
  private ttl = 30000; // 30 seconds Time-To-Live

  /**
   * Retrieves data from cache if it exists and is within TTL limits
   */
  public get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;

    const isExpired = Date.now() - entry.timestamp > this.ttl;
    if (isExpired) {
      this.store.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Caches data under a key
   */
  public set<T>(key: string, data: T): void {
    this.store.set(key, { data, timestamp: Date.now() });
  }

  /**
   * Invalidates keys associated with modified collection names
   */
  public invalidate(collectionName: string): void {
    const normalized = collectionName.toLowerCase();
    for (const key of this.store.keys()) {
      if (key.includes(normalized)) {
        this.store.delete(key);
      }
    }
    console.log(`[MKIE Cache] Invalidated cache keys containing collection: "${collectionName}"`);
  }

  /**
   * Resets entire cache
   */
  public clear(): void {
    this.store.clear();
  }
}

export const knowledgeCache = new KnowledgeCache();
