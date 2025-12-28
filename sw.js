const CACHE_NAME = 'screenshot-exporter-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/styles.css',
  '/script.js',
  // Critical External Libraries
  'https://unpkg.com/jszip@3.10.0/dist/jszip.min.js',
  'https://unpkg.com/file-saver@2.0.5/dist/FileSaver.min.js'
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (ev) => {
  ev.respondWith(
    caches.match(ev.request).then(resp => {
      return resp || fetch(ev.request);
    })
  );
});