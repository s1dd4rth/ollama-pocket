const CACHE = 'ollama-v4';
const ASSETS = [
  './',
  './chat.html',
  './manifest.json',
  './icon.svg',
  './icon-maskable.svg',
  './fonts/space-mono-regular.woff2',
  './fonts/space-mono-bold.woff2',
  './fonts/dm-sans-variable.woff2',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  // Wipe old caches (ollama-v1, ollama-v2) on activate.
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Never cache Ollama API traffic — always hit the live server. The service
  // worker still sits in front of the request so we can't let /api/ near the
  // cache path at all.
  if (url.pathname.startsWith('/api/') || url.port === '11434') return;

  // Stale-while-revalidate for static PWA assets: serve from cache if we have
  // it, kick off a background network refresh, fall back to network if we
  // don't have a cached copy yet.
  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
