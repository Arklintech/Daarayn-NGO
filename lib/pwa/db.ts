import { openDB, IDBPDatabase } from 'idb';

const DATABASE_NAME = 'daarayn_os_core';
// v2 drops the decommissioned assistant conversation store.
const DATABASE_VERSION = 2;

export interface OfflineDraft {
  id: string;
  payloadType: 'field_report' | 'crm_draft';
  payload: Record<string, any>;
  timestamp: number;
  retries: number;
}

export async function initializePwaDatabase(): Promise<IDBPDatabase> {
  return openDB(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(db) {
      // Offline operations queue
      if (!db.objectStoreNames.contains('sync_queue')) {
        const syncStore = db.createObjectStore('sync_queue', { keyPath: 'id' });
        syncStore.createIndex('by_timestamp', 'timestamp');
      }

      // Removed in v2: locally cached assistant conversations
      if (db.objectStoreNames.contains('khizr_conversations')) {
        db.deleteObjectStore('khizr_conversations');
      }

      // Offline form and metadata drafts
      if (!db.objectStoreNames.contains('drafts')) {
        db.createObjectStore('drafts', { keyPath: 'id' });
      }

      // Non-sensitive cached notifications
      if (!db.objectStoreNames.contains('notifications')) {
        db.createObjectStore('notifications', { keyPath: 'id' });
      }

      // App visual settings and layout caches
      if (!db.objectStoreNames.contains('ui_preferences')) {
        db.createObjectStore('ui_preferences', { keyPath: 'id' });
      }
    }
  });
}

// Keep legacy alias for backwards compatibility if any other files import it directly
export const initPwaDatabase = initializePwaDatabase;

export async function queueOfflineAction(draft: OfflineDraft) {
  const db = await initializePwaDatabase();
  await db.put('sync_queue', draft);
}

export async function getPendingSyncs(): Promise<OfflineDraft[]> {
  const db = await initializePwaDatabase();
  return db.getAllFromIndex('sync_queue', 'by_timestamp');
}

export async function removePendingSync(id: string) {
  const db = await initializePwaDatabase();
  await db.delete('sync_queue', id);
}
