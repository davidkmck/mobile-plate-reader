const CACHE_NAME = 'platescan-v7';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon.png',
  'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs',
  'https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd',
  'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((cacheNames) => {
    return Promise.all(cacheNames.map((cache) => {
      if (cache !== CACHE_NAME) return caches.delete(cache);
    }));
  }).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then((cached) => {
    if (cached) {
      fetch(event.request).then((netRes) => {
        if (netRes && netRes.status === 200) caches.open(CACHE_NAME).then((c) => c.put(event.request, netRes));
      }).catch(() => {});
      return cached;
    }
    return fetch(event.request).then((netRes) => {
      if (!netRes || netRes.status !== 200 || netRes.type !== 'basic') return netRes;
      const clone = netRes.clone();
      caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
      return netRes;
    });
  }));
});
