/* MCA Steward App — Service Worker v4
 *
 * Strategy: stale-while-revalidate (matches MCA_Hunt pattern).
 * - Every request is served from cache immediately for speed.
 * - If online, the network response updates the cache in the background,
 *   so the next open gets the fresh version.
 * - Interview data lives in IndexedDB and is NEVER touched here.
 *
 * Bump CACHE_NAME on a deploy you want to force a clean re-cache.
 */
const CACHE_NAME = 'mca-steward-v5';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  /* Partner logos — cached for offline access */
  './logos/Logo_Gov_PNG.png',
  './logos/Logo_MCF.png',
  './logos/Logo_Oro_Province.png',
  './logos/Logo_EU_v1.png',
  './logos/Logo_EU_v2.png',
  './logos/Logo_EU_FCCB.png',
  './logos/CIFOR-ICRAF-logo.png',
  './logos/CIFOR-ICRAF-white-logo.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((c) => c.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* Stale-while-revalidate for same-origin GETs */
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  e.respondWith((async () => {
    const cache  = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);

    /* Revalidate in the background whenever we can */
    const network = fetch(req).then((res) => {
      if (res && res.status === 200 && res.type === 'basic') {
        cache.put(req, res.clone());
      }
      return res;
    }).catch(() => null);

    /* Serve cached immediately; wait for network only if nothing cached */
    return cached || (await network) ||
      new Response('Offline', { status: 503, statusText: 'Offline' });
  })());
});

/* Force update from app UI */
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
