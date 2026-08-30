const CACHE_NAMES = {
  admin: 'daarayn-adm-v6',
  field: 'daarayn-fld-v6',
  public: 'daarayn-pub-v5'
};

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (!Object.values(CACHE_NAMES).includes(key)) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  // Only handle HTTP/HTTPS GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Ignore non-http/https protocols (e.g. chrome-extension, file://, ws://)
  if (!url.protocol.startsWith('http')) return;

  // Ignore API requests, _next build assets, and Next.js RSC data/router requests
  if (
    url.pathname.startsWith('/api') || 
    url.pathname.startsWith('/_next') ||
    event.request.headers.get('RSC') === '1' ||
    event.request.headers.get('Next-Router-State-Tree') ||
    event.request.headers.get('Next-Url')
  ) return;

  // Determine which cache to use based on the route scope
  let cacheName = CACHE_NAMES.public;
  if (url.pathname.startsWith('/admin')) {
    cacheName = CACHE_NAMES.admin;
  } else if (url.pathname.startsWith('/field')) {
    cacheName = CACHE_NAMES.field;
  }

  // Network-first strategy with safe 200 OK caching
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Cache ONLY 200 OK full responses (NEVER cache 206 Partial Content or non-200)
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(cacheName).then((cache) => {
            cache.put(event.request, clone).catch(() => {
              // Ignore cache write errors silently (e.g. quota limit)
            });
          }).catch(() => {});
        }
        return networkResponse;
      })
      .catch(async () => {
        // Network failed, attempt cache fallback
        try {
          const cache = await caches.open(cacheName);
          const cachedResponse = await cache.match(event.request);
          if (cachedResponse) {
            return cachedResponse;
          }
        } catch (e) {}

        // For navigation requests when offline, return fallback page
        if (event.request.mode === 'navigate') {
          return new Response(
            `<!DOCTYPE html><html><body style="background:#080c10;color:#fff;font-family:sans-serif;text-align:center;padding:40px;">
              <h2>Daarayn OS — Offline</h2>
              <p>Please check your internet connection and reload.</p>
            </body></html>`,
            { headers: { 'Content-Type': 'text/html' } }
          );
        }

        return new Response('Network error occurred', { status: 504, statusText: 'Gateway Timeout' });
      })
  );
});

