// Service Worker for GSTD DePIN Platform PWA
// v6 - Minimal SW that doesn't intercept any requests (login payload format fix)
const CACHE_NAME = 'gstd-v6-minimal';

// Install event - just skip waiting
self.addEventListener('install', (event) => {
  console.log('SW v6: Installing');
  self.skipWaiting();
});

// Activate event - clean up ALL old caches and claim clients
self.addEventListener('activate', (event) => {
  console.log('SW v6: Activating');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          console.log('SW v6: Deleting cache', cacheName);
          return caches.delete(cacheName);
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// DO NOT handle fetch events - let all requests pass through normally
// This prevents CORS issues with TonConnect bridges and other external services
