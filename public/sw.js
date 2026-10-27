// Orbit Beats: the family's one service worker (Orbit-Core/kit/sw.js),
// with this app's settings. It keeps the page's own files so the app opens
// without a connection and can be installed, and never keeps a file that
// isn't the one its address names (GitHub's CDN can answer a new address
// with the old file for a while after a deploy).
// The recorded instruments and drums (samples/) never change: they're kept
// in a cache of their own, which an update leaves alone, so they're fetched once.
const SAMPLES = 'orbit-beats-samples-v1';
async function samples(request) {
  const cache = await caches.open(SAMPLES);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.status === 200) await cache.put(request, response.clone()).catch(() => {});
  return response;
}
self.ORBIT_SW = {
  cache: 'beats-app-v2',
  prefix: 'beats-',
  title: 'Orbit Beats',
  route: (request, url) => (url.pathname.includes('/samples/') ? samples(request) : null)
};
importScripts('../Orbit-Core/kit/sw.js');
