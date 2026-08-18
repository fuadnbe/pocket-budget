/* ===================================================================
   POCKET BUDGET — Service Worker
   Offline-first cache strategy: Cache All + Network Update
   =================================================================== */

const CACHE_NAME = 'pocket-budget-v1';

// Files to pre-cache during install (the entire app)
const PRECACHE_URLS = [
  './index.html',
  './manifest.json',
  './icon-192x192.png',
  './icon-512x512.png',
  './icon-maskable-512x512.png',
  './favicon-32x32.png'
];

// ────────────────────────────────────────────
//  INSTALL — pre-cache shell
// ────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Install');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())   // activate immediately
  );
});

// ────────────────────────────────────────────
//  ACTIVATE — clean old caches
// ────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activate');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())   // take control immediately
  );
});

// ────────────────────────────────────────────
//  FETCH — Cache-first, network-fallback
//  (the app has NO external deps so cache-first is perfect)
// ────────────────────────────────────────────
self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  // Skip non-http(s) schemes (chrome-extension, etc.)
  const url = new URL(event.request.url);
  if (!url.protocol.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) {
          // Return cached version immediately, then update cache in background
          const fetchPromise = fetch(event.request)
            .then(networkResponse => {
              if (networkResponse && networkResponse.ok) {
                const clone = networkResponse.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
              }
            })
            .catch(() => { /* network failed, that's ok — we have cache */ });

          return cached;
        }

        // Not in cache — try network
        return fetch(event.request)
          .then(networkResponse => {
            if (networkResponse && networkResponse.ok) {
              const clone = networkResponse.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
            }
            return networkResponse;
          })
          .catch(() => {
            // Network failed and no cache — for the HTML, return an offline page
            if (event.request.headers.get('accept')?.includes('text/html')) {
              return new Response(
                '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pocket Budget — Offline</title></head><body style="display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;font-family:sans-serif;background:#1a73e8;color:#fff;text-align:center;padding:24px"><div><h1 style="font-size:22px;margin-bottom:8px">📱 Pocket Budget</h1><p style="font-size:16px;opacity:.85">You are offline. Open the app from your home screen for the full experience.</p></div></body></html>',
                { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
              );
            }
            return new Response('', { status: 503, statusText: 'Offline' });
          });
      })
  );
});

// ────────────────────────────────────────────
//  MESSAGE — handle updates from the app
// ────────────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
