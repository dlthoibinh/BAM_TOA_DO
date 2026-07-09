'use strict';

/*
 * Service Worker tự dọn và tự hủy.
 *
 * Mục đích:
 * - Xóa cache toadokh-pwa-v3 cũ.
 * - Xóa index.html cũ chứa iframe.
 * - Ngừng Service Worker điều khiển trang.
 */

const OLD_CACHE_NAMES = [
  'toadokh-pwa-v3'
];

const OLD_CACHE_PREFIXES = [
  'toadokh-pwa-'
];

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    (async function () {
      try {
        const cacheNames = await caches.keys();

        await Promise.all(
          cacheNames
            .filter(function (cacheName) {
              if (OLD_CACHE_NAMES.includes(cacheName)) {
                return true;
              }

              return OLD_CACHE_PREFIXES.some(
                function (prefix) {
                  return cacheName.startsWith(prefix);
                }
              );
            })
            .map(function (cacheName) {
              return caches.delete(cacheName);
            })
        );

        /*
         * Gỡ đăng ký Service Worker.
         */
        await self.registration.unregister();

        /*
         * Tải lại các trang đang mở để nhận index.html mới.
         */
        const clients = await self.clients.matchAll({
          type: 'window',
          includeUncontrolled: true
        });

        await Promise.all(
          clients.map(function (client) {
            return client.navigate(client.url)
              .catch(function () {
                return null;
              });
          })
        );
      } catch (error) {
        console.error(
          '[TOA-DO-KH] Không thể dọn Service Worker:',
          error
        );
      }
    })()
  );
});

/*
 * Không dùng respondWith().
 * Mọi request được trình duyệt tải trực tiếp qua mạng.
 */
self.addEventListener('fetch', function () {
  // Cố ý để trống.
});
