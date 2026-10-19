// The app's files kept for opening fast and offline (the family's worker,
// Orbit-Weather/public/sw.js): a file with the deploy's ?v= from the cache
// first (that version never changes); the page itself from the cache at
// once, refreshed behind it (a newer deploy is caught by the page's version
// check, which reloads under ?v=: that one always asks the network);
// anything else the network first (2.5 s), then the kept copy. One copy a
// file. Scores and pictures from other sites are left to the browser, and
// version.json is never kept.
const CACHE = 'beats-app-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("beats-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));

async function keep(request, response) {
  if (!response || response.status !== 200) return;
  const cache = await caches.open(CACHE);
  const url = new URL(request.url);
  for (const old of await cache.keys()) {
    const o = new URL(old.url);
    if (o.pathname === url.pathname && o.search !== url.search) await cache.delete(old);
  }
  await cache.put(request, response);
}
async function fromNet(request) {
  // The page asked of the server every time (a 304 when unchanged; Pages lets browsers keep it 10 minutes).
  const res = request.mode === 'navigate' ? await fetch(request.url, { cache: 'no-cache', credentials: 'same-origin' }) : await fetch(request);
  await keep(request, res.clone());
  return res;
}
async function networkFirst(request) {
  const kept = await caches.match(request, { ignoreSearch: true });
  const net = fromNet(request);
  if (!kept) return net;
  return Promise.race([net.catch(() => kept), new Promise(r => setTimeout(() => r(kept), 2500))]);
}
async function pageFirst(e) {
  const kept = await caches.match(e.request, { ignoreSearch: true });
  const net = fromNet(e.request);
  if (!kept) return net;
  e.waitUntil(net.catch(() => {}));
  return kept;
}
async function cacheFirst(request) {
  return (await caches.match(request)) || fromNet(request).catch(async error => (await caches.match(request, { ignoreSearch: true })) || Promise.reject(error));
}
self.addEventListener('fetch', e => {
  const r = e.request;
  const url = new URL(r.url);
  if (r.method !== 'GET' || url.origin !== location.origin || url.pathname.endsWith('/version.json')) return;
  if (r.mode === 'navigate') return e.respondWith(url.searchParams.has('v') ? fromNet(r).catch(async error => (await caches.match(r, { ignoreSearch: true })) || Promise.reject(error)) : pageFirst(e));
  // (The recorded instruments never change: kept the first time, from the phone after.)
  if (url.pathname.includes('/samples/')) return e.respondWith(cacheFirst(r));
  e.respondWith(url.searchParams.has('v') ? cacheFirst(r) : networkFirst(r));
});
