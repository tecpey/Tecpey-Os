const CACHE_PREFIX = 'tecpey-academy-offline-';
const CACHE_NAME = `${CACHE_PREFIX}v2`;
const OFFLINE_FALLBACK = '/academy/offline-ready';
const APP_SHELL = [
  OFFLINE_FALLBACK,
  '/site.webmanifest',
  '/favicon.ico'
];

function isAcademyNavigation(request, url) {
  return request.mode === 'navigate' && /^\/(?:en\/)?academy(?:\/|$)/.test(url.pathname);
}

async function handleAcademyNavigation(request) {
  try {
    // Academy documents can contain release-specific auth UI and user state.
    // Always prefer the network and never persist these responses in Cache API.
    return await fetch(request);
  } catch {
    return (await caches.match(OFFLINE_FALLBACK)) || Response.error();
  }
}

async function handleStaticAsset(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => null));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (isAcademyNavigation(request, url)) {
    event.respondWith(handleAcademyNavigation(request));
    return;
  }

  if (url.pathname.startsWith('/_next/static/') || APP_SHELL.includes(url.pathname)) {
    event.respondWith(handleStaticAsset(request));
  }
});
