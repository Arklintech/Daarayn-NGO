import { getAuth } from 'firebase/auth';
import { openDB } from 'idb';

export async function executeSecureSessionIsolation() {
  const auth = getAuth();
  
  // 1. Clear non-authoritative client preferences safely
  localStorage.clear();
  sessionStorage.clear();

  // 2. Sanitize and isolate database registers
  try {
    const db = await openDB('daarayn_os_core', 1);
    const tx = db.transaction(['sync_queue', 'drafts', 'ui_preferences'], 'readwrite');
    
    // Safety check: Preserve un-synced transactions in a localized secure backup layer
    const pendingTransactions = await tx.objectStore('sync_queue').getAll();
    if (pendingTransactions.length > 0) {
      console.warn('[Session Isolation] Un-synced sync queue transactions detected. Isolating queue securely.');
      // Keep only sync_queue, clear everything else to eliminate visibility
      await tx.objectStore('drafts').clear();
    } else {
      await tx.objectStore('sync_queue').clear();
      await tx.objectStore('drafts').clear();
    }
    
    await tx.objectStore('ui_preferences').clear();
    await tx.done;
  } catch (err) {
    console.error('[Session Isolation] Database purge failed:', err);
  }

  // 3. Purge targeted route-aware browser caches
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(
      keys.map((key) => {
        // Purge role-scoped cache containers exclusively; preserve public layout resources
        if (key.includes('daarayn-admin') || key.includes('daarayn-field')) {
          return caches.delete(key);
        }
      })
    );
  }

  // 4. Invalidate authoritative authorization credentials
  await auth.signOut();

  // Redirect back to landing with clear headers
  window.location.href = '/?session_reset=true';
}
