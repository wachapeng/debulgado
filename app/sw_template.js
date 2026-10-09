// Service worker: keeps a copy of the app on this device so it opens and works with no internet.
// VERSION and FILES are filled in by the server (app/service_worker.py).
const VERSION = 'dev'; // @version
const FILES = []; // @files
const CACHE = 'debulgado-pos-' + VERSION;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('debulgado-pos-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Save a copy of anything the app loads, so it is there next time even if it wasn't in FILES.
async function remember(key, response) {
  if (response && response.ok && response.type === 'basic') {
    const cache = await caches.open(CACHE);
    await cache.put(key, response.clone());
  }
  return response;
}

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  // Sync requests always go to the network; the app handles being offline itself.
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  if (req.mode === 'navigate') {
    const page = /^\/order\/?$/.test(url.pathname) ? 'order.html' : 'index.html'; // the customer's order page, or the POS
    event.respondWith(caches.match(page).then(hit => hit || fetch(req).then(res => remember(page, res))));
    return;
  }
  event.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => remember(req, res))));
});
