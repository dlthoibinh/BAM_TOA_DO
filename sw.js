const BASE = new URL('./', self.location.href).pathname;
const CACHE = 'toadokh-pwa-direct-v4';

const STATIC_ASSETS = [
  BASE,
  BASE + 'index.html',
  BASE + 'manifest.webmanifest',
  BASE + 'icon-192-any.png',
  BASE + 'icon-512-any.png',
  BASE + 'icon-192-maskable.png',
  BASE + 'icon-512-maskable.png',
  BASE + 'evn_logo.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(async cache => {
      // Một icon thiếu không được làm hỏng toàn bộ quá trình cài SW.
      await Promise.all(
        STATIC_ASSETS.map(async url => {
          try {
            await cache.add(new Request(url, { cache: 'reload' }));
          } catch (error) {
            console.warn('[SW] Không cache được:', url, error);
          }
        })
      );
    })
  );

  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE)
          .map(key => caches.delete(key))
      )
    )
  );

  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // Chỉ xử lý file cùng origin của PWA wrapper.
  // Không can thiệp và không cache Google Apps Script.
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    !url.pathname.startsWith(BASE)
  ) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE);

  try {
    const response = await fetch(request, { cache: 'no-store' });

    if (response && response.ok) {
      await cache.put(request, response.clone());
    }

    return response;
  } catch (_) {
    return (
      await cache.match(request, { ignoreSearch: true }) ||
      await cache.match(BASE + 'index.html') ||
      await cache.match(BASE) ||
      new Response(
        '<!doctype html><meta charset="utf-8"><title>Offline</title>' +
        '<meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<style>body{font-family:system-ui;padding:24px}</style>' +
        '<h2>Không có mạng</h2><p>Vui lòng kiểm tra kết nối Internet rồi mở lại ứng dụng.</p>',
        {
          status: 503,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        }
      )
    );
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request, { ignoreVary: true });

  const networkPromise = fetch(request)
    .then(async response => {
      if (response && response.ok) {
        await cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  return cached || await networkPromise || Response.error();
}
