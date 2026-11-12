// Web app only (the iOS/Android apps bundle every file). Precache the app so it works offline after the first visit.
// Network first, so a new deploy (code or rates.json) is picked up whenever online; the cache is the offline fallback.
const CACHE = 'tanaw-v2';
const FILES = ['./', 'index.html', 'app.js', 'style.css', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png',
  'lib/extract.js', 'lib/parse.js', 'lib/checks.js', 'lib/model.js', 'lib/explain.js', 'lib/flags.js', 'lib/chat.js', 'lib/disputes.js', 'lib/solar.js',
  'vendor/pdf.min.mjs', 'vendor/pdf.worker.min.mjs', 'data/rates.json', 'data/weather.json', 'data/reasons.json',
  'data/fixtures/SYNTHETIC_bill.pdf', 'data/fixtures/SYNTHETIC_weak_bill.pdf'];

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys()
  .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
