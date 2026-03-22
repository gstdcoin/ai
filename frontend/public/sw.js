// ═══════════════════════════════════════════════════════════════
// GSTD Service Worker v8 — Full PWA (awesome-pwa)
// Strategy: Stale-While-Revalidate for pages, Cache-First for assets
// Push notifications for signals, offline fallback page
// ═══════════════════════════════════════════════════════════════
const CACHE_VERSION = 'gstd-v8';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;

// Static assets to pre-cache on install
const PRECACHE_URLS = [
  '/',
  '/offline',
  '/manifest.json',
  '/icon.png',
];

// Patterns to NEVER cache (dynamic API data, auth, streaming)
const NEVER_CACHE = [
  '/api/',
  '/ws',
  '/_next/webpack-hmr',
  'chrome-extension',
  'localhost:8080',
];

// ── Install: Pre-cache critical assets ────────────────────────
self.addEventListener('install', (event) => {
  console.log('🛡️ SW v8: Installing with full PWA cache');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        return cache.addAll(PRECACHE_URLS).catch((err) => {
          console.warn('SW v8: Pre-cache partial failure (ok)', err);
        });
      })
      .then(() => self.skipWaiting())
  );
});

// ── Activate: Clean old caches ─────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('🛡️ SW v8: Activating');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== STATIC_CACHE && name !== DYNAMIC_CACHE)
          .map((name) => {
            console.log('SW v8: Purging old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ── Fetch: Smart caching strategy ──────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip patterns that should never be cached
  if (NEVER_CACHE.some((pattern) => request.url.includes(pattern))) return;

  // Strategy 1: Cache-First for static assets (_next/static, images, fonts)
  if (url.pathname.startsWith('/_next/static/') ||
      url.pathname.match(/\.(png|jpg|jpeg|webp|svg|ico|woff2?|ttf|css|js)$/)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Strategy 2: Stale-While-Revalidate for pages (/, /monitor, /predictions, /chat)
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request)
          .then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(DYNAMIC_CACHE).then((cache) => cache.put(request, clone));
            }
            return response;
          })
          .catch(() => {
            // Offline fallback
            return caches.match('/offline') || caches.match('/');
          });

        return cached || fetchPromise;
      })
    );
    return;
  }
});

// ── Push Notifications (for AI signals) ────────────────────────
self.addEventListener('push', (event) => {
  let data = { title: 'GSTD Signal', body: 'New AI signal available', icon: '/icon.png' };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'GSTD Signal', {
      body: data.body || 'Check your signals',
      icon: data.icon || '/icon.png',
      badge: '/icon.png',
      vibrate: [200, 100, 200],
      tag: data.tag || 'gstd-signal',
      data: { url: data.url || '/signals' },
      actions: [
        { action: 'view', title: '📊 View Signal' },
        { action: 'dismiss', title: '✕ Dismiss' },
      ],
    })
  );
});

// ── Notification Click Handler ─────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Focus existing window if available
        for (const client of clientList) {
          if (client.url.includes('gstdtoken.com') && 'focus' in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        // Open new window
        return self.clients.openWindow(targetUrl);
      })
  );
});
