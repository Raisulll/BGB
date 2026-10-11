// BIRDS service worker (specs #41, #58: installable on phones, fast start, opens offline).
//
// It caches the application itself and nothing else:
//   - page loads (navigations): network first, so a new release is picked up at once; offline,
//     the last index.html is used and the app shows its own "offline" state
//   - /assets/* (Vite's hashed bundles, fonts): cache first; a name never changes content
//   - other files of this site (crest, icons, manifest): served from cache, refreshed in the background
// Never cached: /api/* (incident data, evidence, messages, voice, photos), anything that isn't a
// GET, and other origins. Data stays behind authentication on the server.
const SHELL_CACHE = 'birds-shell-v1';
const ASSET_CACHE = 'birds-assets-v1';
const ASSET_LIMIT = 120; // bundles of old releases are dropped first
const SHELL = ['/', '/manifest.webmanifest', '/bgb.png', '/icons/icon-192.png', '/icons/apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n.startsWith('birds-') && n !== SHELL_CACHE && n !== ASSET_CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

async function trim(cache) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - ASSET_LIMIT))) await cache.delete(key);
}

async function pageLoad(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    // Every client route is the same index.html; keep the latest good copy
    if (response.ok && (response.headers.get('content-type') || '').includes('text/html')) await cache.put('/', response.clone());
    return response;
  } catch {
    return (await cache.match('/')) || Response.error();
  }
}

async function asset(request) {
  const cache = await caches.open(ASSET_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    trim(cache);
  }
  return response;
}

async function siteFile(request) {
  const cache = await caches.open(SHELL_CACHE);
  const hit = await cache.match(request);
  const fresh = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return hit || (await fresh) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') event.respondWith(pageLoad(request));
  else if (url.pathname.startsWith('/assets/')) event.respondWith(asset(request));
  else if (url.pathname !== '/sw.js') event.respondWith(siteFile(request));
});
