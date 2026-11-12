// Web app only (the iOS/Android apps bundle every file). Precache the app so it works offline after the first visit.
// Network first, so a new deploy (code or rates.json) is picked up whenever online; the cache is the offline fallback.
const CACHE = 'tanaw-v8';
const FILES = ['./', 'index.html', 'app.js', 'style.css', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'logo.png',
  'lib/extract.js', 'lib/parse.js', 'lib/checks.js', 'lib/model.js', 'lib/explain.js', 'lib/flags.js', 'lib/chat.js', 'lib/faq.js', 'lib/disputes.js', 'lib/solar.js', 'lib/ocr.js',
  'vendor/pdf.min.mjs', 'vendor/pdf.worker.min.mjs', 'data/rates.json', 'data/weather.json', 'data/reasons.json', 'data/faqs.json', 'data/bill_spec.json',
  'data/fixtures/SYNTHETIC_bill.pdf', 'data/fixtures/SYNTHETIC_weak_bill.pdf'];

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys()
  .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.includes('/api/')) return; // the inbox must never be served stale
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
