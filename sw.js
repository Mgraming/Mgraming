// Offline support: network-first so updates show immediately, cached shell when offline.
const CACHE = 'carpass-v1';
const SHELL = [
  './', 'index.html', 'report.html', 'css/style.css', 'icon.svg', 'manifest.webmanifest',
  'js/app.js', 'js/data.js', 'js/logic.js', 'js/store.js', 'js/report.js', 'vendor/qrcode.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request)
    .then(res => {
      if (res.ok && new URL(e.request.url).origin === location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
