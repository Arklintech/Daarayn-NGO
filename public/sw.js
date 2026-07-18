const CACHE_NAMES = {
  admin: 'daarayn-adm-v1',
  field: 'daarayn-fld-v1',
  public: 'daarayn-pub-v1'
};

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Determine which cache to use based on the route scope
  let cacheName = CACHE_NAMES.public;
  if (url.pathname.startsWith('/admin')) {
    cacheName = CACHE_NAMES.admin;
  } else if (url.pathname.startsWith('/field')) {
    cacheName = CACHE_NAMES.field;
  }

  // Very basic network-first caching strategy
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Cache successful responses for later offline use
        if (networkResponse.ok && event.request.method === 'GET' && !url.pathname.startsWith('/api')) {
          const clone = networkResponse.clone();
          caches.open(cacheName).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        // Network failed, try to serve from the correct cache
        const cache = await caches.open(cacheName);
        const cachedResponse = await cache.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }
        // If not in cache, let it fail (or return an offline page if one existed)
        return new Response('Offline Content Not Available', { status: 503, statusText: 'Service Unavailable' });
      })
  );
});
