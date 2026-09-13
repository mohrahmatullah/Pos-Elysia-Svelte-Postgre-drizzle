/* POS PWA service worker — app-shell precache + runtime caching.
 * - Navigations: network-first with offline fallback to cached shell.
 * - Vite build assets (/_app/immutable/*) + icons: cache-first (immutable/hashed).
 * - Cross-origin requests (API, Iconify) are passed through untouched.
 * Update flow: bump VERSION to invalidate old caches; clients postMessage
 * 'SKIP_WAITING' (see lib/pwa/register.ts) then reload.
 */
const VERSION = 'v1.0.0';
const SHELL_CACHE = `pos-shell-${VERSION}`;
const ASSET_CACHE = `pos-assets-${VERSION}`;

const SHELL_ASSETS = ['/', '/manifest.webmanifest', '/icons/pwa-192.png', '/icons/pwa-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await Promise.allSettled(
        SHELL_ASSETS.map((url) => cache.add(new Request(url, { cache: 'reload' }))),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, ASSET_CACHE]);
      for (const name of await caches.keys()) {
        if (!keep.has(name)) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // API + Iconify: passthrough

  if (req.mode === 'navigate') {
    event.respondWith(networkFirstPage(req));
    return;
  }
  if (url.pathname.startsWith('/_app/immutable/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(cacheFirst(req));
  }
});

/** Pages: try network, fall back to the cached shell when offline. */
async function networkFirstPage(req) {
  try {
    const res = await fetch(req);
    const cache = await caches.open(SHELL_CACHE);
    cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch {
    const cached = (await caches.match(req)) || (await caches.match('/'));
    if (cached) return cached;
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

/** Immutable assets: serve from cache, backfill on miss. */
async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    const cache = await caches.open(ASSET_CACHE);
    cache.put(req, res.clone()).catch(() => {});
  }
  return res;
}
