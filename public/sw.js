const CACHE_PREFIX = 'tecpey-academy-offline-';
const CACHE_NAME = `${CACHE_PREFIX}v3`;
const OFFLINE_FALLBACKS = Object.freeze({
  fa: '/academy-offline-fa.html',
  en: '/academy-offline-en.html'
});
const APP_SHELL = [
  OFFLINE_FALLBACKS.fa,
  OFFLINE_FALLBACKS.en,
  '/site.webmanifest',
  '/favicon.ico'
];

function isAcademyNavigation(request, url) {
  return request.mode === 'navigate' && /^\/(?:en\/)?academy(?:\/|$)/.test(url.pathname);
}

function offlineFallbackFor(url) {
  return url.pathname.startsWith('/en/academy')
    ? OFFLINE_FALLBACKS.en
    : OFFLINE_FALLBACKS.fa;
}

async function handleAcademyNavigation(request, url) {
  try {
    // Academy documents can contain release-specific auth UI and user state.
    // Always prefer the network and never persist these responses in Cache API.
    return await fetch(request);
  } catch {
    return (await caches.match(offlineFallbackFor(url))) || Response.error();
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

async function precacheAppShell() {
  const cache = await caches.open(CACHE_NAME);

  try {
    await Promise.all(APP_SHELL.map(async (path) => {
      // Safari rejects redirected responses returned by a service worker for a
      // navigation. Refuse redirects while populating the cache so a protected
      // or canonicalized fallback can never poison the offline app shell.
      const request = new Request(path, {
        cache: 'reload',
        redirect: 'error'
      });
      const response = await fetch(request);
      if (!response.ok || response.redirected || response.type === 'opaqueredirect') {
        throw new Error(`Unsafe app-shell response for ${path}`);
      }
      await cache.put(request, response);
    }));
  } catch (error) {
    await caches.delete(CACHE_NAME);
    throw error;
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheAppShell());
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
    event.respondWith(handleAcademyNavigation(request, url));
    return;
  }

  if (url.pathname.startsWith('/_next/static/') || APP_SHELL.includes(url.pathname)) {
    event.respondWith(handleStaticAsset(request));
  }
});
