// public/sw.js
const SW_VERSION = 'v1.0.0';

// Independent namespace configurations - change versions to invalidate selectively
const CACHE_NAMESPACES = {
  shell: { name: 'daarayn-shell-v3', routeMatcher: () => false },
  admin: { name: 'daarayn-admin-v8', routeMatcher: (url) => url.pathname.startsWith('/admin') },
  field: { name: 'daarayn-field-v2', routeMatcher: (url) => url.pathname.startsWith('/agent') }, // Using /agent route for Field Ops
  public: { name: 'daarayn-public-v5', routeMatcher: () => true } // Catch-all default fallback
};

// Map URL to correct Cache Partition Name
const resolveNamespace = (url) => {
  if (CACHE_NAMESPACES.admin.routeMatcher(url)) return CACHE_NAMESPACES.admin.name;
  if (CACHE_NAMESPACES.field.routeMatcher(url)) return CACHE_NAMESPACES.field.name;
  return CACHE_NAMESPACES.public.name;
};

// Strictly exclude sensitive operational data from client caching
const isSensitiveEndpoint = (url) => {
  const sensitivePatterns = [
    '/api/auth',
    '/api/crm',
    '/api/financials',
    'firestore.googleapis.com',
    'identitytoolkit.googleapis.com'
  ];
  return sensitivePatterns.some((pattern) => url.href.includes(pattern));
};

self.addEventListener('activate', (event) => {
  const validCacheNames = Object.values(CACHE_NAMESPACES).map((ns) => ns.name);

  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          // Remove outdated cache keys for our namespaces
          if (!validCacheNames.includes(key)) {
            console.log(`[Service Worker] Invalidating outdated cache partition: ${key}`);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Security Gate: No caching for credentials, non-GETs, or PII endpoints
  if (event.request.method !== 'GET' || isSensitiveEndpoint(url)) {
    event.respondWith(fetch(event.request));
    return;
  }

  const activeNamespace = resolveNamespace(url);

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Stale-While-Revalidate for cached assets
        fetch(event.request).then((networkResponse) => {
          if (networkResponse.status === 200) {
            caches.open(activeNamespace).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {/* System offline; serve stale fallback silently */});

        return cachedResponse;
      }

      // Network First strategy for dynamic sub-application assets
      return fetch(event.request).then((networkResponse) => {
        if (networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(activeNamespace).then((cache) => cache.put(event.request, responseClone));
        }
        return networkResponse;
      }).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('/offline.html');
        }
      });
    })
  );
});
