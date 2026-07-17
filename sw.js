'use strict';

const BASE = new URL('./', self.location).pathname;
const CACHE_PREFIX = 'evn-toado-shell-';
const LEGACY_CACHE_PREFIXES = [CACHE_PREFIX, 'toadokh-pwa-'];
const CACHE_NAME = `${CACHE_PREFIX}v4-20260717`;
const APP_SHELL = [
  BASE,
  `${BASE}index.html`,
  `${BASE}app.js`,
  `${BASE}manifest.webmanifest`,
  `${BASE}icon-192-any.png`,
  `${BASE}icon-512-any.png`,
  `${BASE}icon-192-maskable.png`,
  `${BASE}icon-512-maskable.png`,
  `${BASE}evn_logo.png`
];

async function cacheShellSafely() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.allSettled(APP_SHELL.map(async asset => {
    const response = await fetch(asset, { cache: 'reload' });
    if (response.ok) await cache.put(asset, response);
  }));
}

self.addEventListener('install', event => {
  event.waitUntil(cacheShellSafely());
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => LEGACY_CACHE_PREFIXES.some(prefix => key.startsWith(prefix)) && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function networkFirst(request, fallbackUrl, timeoutMs = 8_000) {
  const cache = await caches.open(CACHE_NAME);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(request, { signal: controller.signal, cache: 'no-store' });
    if (response.ok && request.method === 'GET') {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (_) {
    return (await cache.match(request, { ignoreSearch: true }))
      || (fallbackUrl ? await cache.match(fallbackUrl, { ignoreSearch: true }) : null)
      || new Response('Ứng dụng tạm thời không khả dụng.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
  } finally {
    clearTimeout(timeout);
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: true });
  const refresh = fetch(request, { cache: 'no-store' }).then(response => {
    if (response.ok) cache.put(request, response.clone()).catch(() => {});
    return response;
  }).catch(() => null);

  return cached || await refresh || new Response('', { status: 504 });
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, `${BASE}index.html`));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
