// Offline support: network-first so updates show immediately, cached shell when offline.
const CACHE = 'carpass-v5';
const SHELL = [
  './', 'index.html', 'report.html', 'css/style.css', 'icon.svg', 'manifest.webmanifest',
  'js/app.js', 'js/ui.js', 'js/shops.js', 'js/biz.js', 'js/parts.js', 'js/garage.js', 'js/market.js', 'js/places.js', 'js/icons.js', 'js/cars.js', 'js/data.js', 'js/logic.js', 'js/store.js', 'js/report.js', 'js/report-view.js',
  'vendor/qrcode.js', 'icons/icon-192.png', 'icons/icon-512.png',
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
