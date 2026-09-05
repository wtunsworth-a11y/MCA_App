/* MCA App Service Worker — v3 */
var CACHE_NAME = 'mca-app-v3';
var CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

/* Install: pre-cache core assets */
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(CORE_ASSETS);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

/* Activate: delete all old caches */
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names
          .filter(function(n) { return n !== CACHE_NAME; })
          .map(function(n) { return caches.delete(n); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

/* Fetch: cache-first for core assets, network-first for everything else */
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  /* Only handle same-origin GET requests */
  if (event.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  /* index.html: network-first so updates reach users, fall back to cache */
  if (url.pathname.endsWith('index.html') || url.pathname.endsWith('/')) {
    event.respondWith(
      fetch(event.request)
        .then(function(response) {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function(c) { c.put(event.request, copy); });
          return response;
        })
        .catch(function() {
          return caches.match('./index.html');
        })
    );
    return;
  }

  /* All other assets: cache-first */
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) return cached;
      return fetch(event.request).then(function(response) {
        if (response && response.status === 200) {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function(c) { c.put(event.request, copy); });
        }
        return response;
      }).catch(function() {
        /* Offline fallback: serve cached app shell */
        return caches.match('./index.html');
      });
    })
  );
});

/* Message: force update from app UI */
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
