// Orbit Beats' service worker: the family's (Orbit-Weather/public/sw.js, the
// same as the other Quadra apps'), keeping the page's own files so the app
// opens without a connection and can be installed.
//
// A file with a ?v= version (every deploy stamps one) is served from the
// cache first, since that exact version never changes; the page itself from
// the cache too, refreshed behind it (pageFirst); anything else from the
// network first, the cache only when offline.
// One copy per file is kept: a new version replaces the old one. Saving a
// copy never holds up the answer (it runs on after it, under waitUntil).
// The recorded instruments and drums (public/samples/) never change: they're
// kept in a cache of their own, which an update (the kit's watchUpdates
// clears the caches named beats-…) leaves alone, so they're fetched once.
const CACHE = 'beats-app-v2';
const SAMPLES = 'orbit-beats-samples-v1';

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['./'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      // Only this app's own old copies: the other Quadra apps share this site
      // (and its caches), and the pictures are kept for all of them.
      .then(keys => Promise.all(keys.filter(k => k.startsWith('beats-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function keep(request, response) {
  if (!response || response.status !== 200 || response.type === 'opaque') return;
  const cache = await caches.open(CACHE);
  const url = new URL(request.url);
  // Drop older versions of the same file (only that file's copies are listed).
  for (const old of await cache.keys(url.origin + url.pathname, { ignoreSearch: true })) if (old.url !== url.href) await cache.delete(old);
  await cache.put(request, response);
}

// A poor connection: the network gets this long before a kept copy answers
// (the network's copy still saved for next time). It had no limit: on a slow
// connection each file the page imports waited out the network in turn.
const PATIENCE_MS = 2500;
// `later` takes what may run on after the answer (saving a copy).
async function networkFirst(request, later) {
  const kept = request.mode === 'navigate' ? null : await caches.match(request);
  if (kept) {
    const fresh = networkFirstNow(request, later);
    later(fresh);
    const late = new Promise(done => setTimeout(() => done(kept), PATIENCE_MS));
    return Promise.race([fresh.catch(() => kept), late]);
  }
  return networkFirstNow(request, later);
}
async function networkFirstNow(request, later) {
  try {
    // The page itself is checked with the server every time (a cheap 304
    // when unchanged): GitHub Pages lets browsers keep it 10 minutes, which
    // would open the last deploy's page right after a new one. By address,
    // since a navigation can't be re-sent with options.
    const response = request.mode === 'navigate' ? await fetch(request.url, { cache: 'no-cache', credentials: 'same-origin', redirect: 'manual' }) : await fetch(request);
    later(keep(request, response.clone()));
    return response;
  } catch (error) {
    // Offline: this file as kept, else any version of it kept (the kit's ?v= changes with each of its deploys).
    const cached = (await caches.match(request)) || (await caches.match(request, { ignoreSearch: true })) || (request.mode === 'navigate' && (await caches.match('./')));
    if (cached) return cached;
    throw error;
  }
}

// Opening the app: the page kept here at once (no wait for the network,
// even on a poor connection), refreshed in the background for next time.
// A newer deploy is caught by the kit's watchUpdates right after opening,
// which reloads under a ?v= address: that one always asks the network.
async function pageFirst(request, later) {
  const kept = await caches.match(request, { ignoreSearch: true });
  const fresh = networkFirst(request, later);
  if (!kept) return fresh;
  later(fresh);
  return kept;
}

async function cacheFirst(request, later) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    later(keep(request, response.clone()));
    return response;
  } catch (error) {
    // Offline with another version kept (the kit noted a newer one): that one, rather than no app at all.
    const other = await caches.match(request, { ignoreSearch: true });
    if (other) return other;
    throw error;
  }
}

// A recording: from its own cache, else fetched once and kept there.
async function samples(request) {
  const cache = await caches.open(SAMPLES);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.status === 200) await cache.put(request, response.clone()).catch(() => {});
  return response;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.endsWith('/version.json')) return;
  // What runs on after the answer: the event is kept alive until it's all done
  // (a save started while another was awaited is waited for too).
  const tail = [];
  const later = work => tail.push(Promise.resolve(work).catch(() => {}));
  if (url.pathname.includes('/samples/')) {
    event.respondWith(samples(request));
    return;
  }
  const route = request.mode === 'navigate' ? (url.searchParams.has('v') ? networkFirst : pageFirst) : url.searchParams.has('v') ? cacheFirst : networkFirst;
  const answer = route(request, later);
  event.respondWith(answer);
  event.waitUntil(
    (async () => {
      await answer.catch(() => {});
      for (let done = 0; done < tail.length; ) {
        const upTo = tail.length;
        await Promise.all(tail.slice(done, upTo));
        done = upTo;
      }
    })()
  );
});

// The page lists the files it loaded before this worker was in charge, so
// the very first visit already works offline next time.
self.addEventListener('message', event => {
  if (event.data?.type !== 'cache') return;
  const urls = (event.data.urls || []).filter(u => new URL(u).origin === self.location.origin && !u.endsWith('/version.json'));
  event.waitUntil(
    Promise.all(
      urls.map(u =>
        caches.match(u).then(hit => hit || fetch(u).then(r => keep(new Request(u), r)).catch(() => {}))
      )
    )
  );
});

// A tap on a notice opens (or focuses) the page where it points.
self.addEventListener('notificationclick', event => {
  // A Quadra notice (quadra.mjs notify): open the app where it points.
  event.notification.close();
  const url = new URL(event.notification.data?.url || './', self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const open = list.find(c => c.url.startsWith(self.registration.scope));
      if (!open) return self.clients.openWindow(url);
      return open.focus().then(c => (url !== c.url && 'navigate' in c ? c.navigate(url) : c));
    })
  );
});

// A notice the Worker sent while the app was closed (Shared-Proxy/push.js):
// shown as it came; a tap opens the app where it points.
self.addEventListener('push', event => {
  let data;
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data?.text() || '' };
  }
  const icon = new URL('./icons/icon-192.png', self.registration.scope).href;
  event.waitUntil(self.registration.showNotification(data.title || 'Orbit Beats', { body: data.body || '', tag: data.tag || undefined, icon, badge: icon, data: { url: data.url || self.registration.scope } }));
});
