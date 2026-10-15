// Passion Beats' service worker: keeps the page's own files (and the
// family's stylesheet) so the page opens without a connection. Everything
// it does runs on the device; nothing else ever needs the network.
// Each file from the network when it answers within a moment (a new
// version), else the copy kept here.
const CACHE = 'passion-beats-v1';
const FILES = ['./', './index.html', './app.js', './engine.mjs', './analyze.mjs', './icon.svg', 'https://jaypengx.github.io/Shared-Proxy/kit/quadra.css'];
const PATIENCE_MS = 2500;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES).catch(() => {})).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('passion-beats-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function fresh(request) {
  const cache = await caches.open(CACHE);
  const kept = await cache.match(request, { ignoreSearch: true });
  const network = fetch(request).then(res => {
    if (res.ok) cache.put(request, res.clone());
    return res;
  });
  if (!kept) return network;
  return Promise.race([network.catch(() => kept), new Promise(done => setTimeout(() => done(kept), PATIENCE_MS))]);
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(fresh(event.request));
});
