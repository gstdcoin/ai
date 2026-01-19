// Service Worker for GSTD DePIN Platform PWA
// v7 - Minimal SW that doesn't intercept any requests (login timestamp fix)
const CACHE_NAME = 'gstd-v7-minimal';

// Install event - just skip waiting
self.addEventListener('install', (event) => {
  console.log('SW v7: Installing');
  self.skipWaiting();
});

// Activate event - clean up ALL old caches and claim clients
self.addEventListener('activate', (event) => {
  console.log('SW v7: Activating');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          console.log('SW v7: Deleting cache', cacheName);
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
