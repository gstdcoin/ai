// Service Worker for GSTD DePIN Platform PWA
const CACHE_NAME = 'gstd-depin-v4-fixed'; // Fixed cross-origin handling
const urlsToCache = [
  '/', // Will be cached, but Strategy will handle updates
  '/icon.png',
  '/logo.svg',
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  self.skipWaiting(); // Force activate immediately
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching files');
        return cache.addAll(urlsToCache);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Deleting old cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// Fetch event - Network First for HTML, Cache First for assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip cross-origin requests (external APIs, TonConnect bridges, etc.)
  if (url.origin !== self.location.origin) return;

  // Skip API requests
  if (url.pathname.startsWith('/api/')) return;

  // Skip WebSocket and SSE connections
  if (event.request.headers.get('accept')?.includes('text/event-stream')) return;

  const isHTML = event.request.destination === 'document';

  if (isHTML) {
    // Network First for HTML (always try to get latest version)
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Only cache successful responses
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone).catch(() => { });
            });
          }
          return response;
        })
        .catch(() => caches.match(event.request)) // Fallback to cache if offline
    );
  } else {
    // Cache First for other assets (images, fonts, etc)
    event.respondWith(
      caches.match(event.request)
        .then((response) => {
          if (response) return response;

          return fetch(event.request).then((networkResponse) => {
            // Only cache successful responses
            if (networkResponse.ok) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseClone).catch(() => { });
              });
            }
            return networkResponse;
          });
        })
        .catch(() => {
          // Return nothing if both cache and network fail
          return new Response('', { status: 503, statusText: 'Service Unavailable' });
        })
    );
  }
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    event.waitUntil(
      // Handle background sync
      console.log('Service Worker: Background sync')
    );
  }
});

// Push notifications (for future use)
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'GSTD Platform';
  const options = {
    body: data.body || 'New update available',
    icon: '/icon.png',
    badge: '/icon.png',
    vibrate: [200, 100, 200],
    tag: 'gstd-notification',
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('/')
  );
});
