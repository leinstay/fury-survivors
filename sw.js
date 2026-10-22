// Service worker: свежесть без сборки. GitHub Pages отдаёт файлы с max-age=600, и после деплоя браузер
// до 10 минут держит старые модули (и может смешать их с новыми). Здесь каждый запрос к своему домену идёт
// на сервер с перепроверкой (cache: 'no-cache' → ETag, ответ 304 без тела, если файл не менялся), а копия
// кладётся в кэш только как запас на случай офлайна. Регистрируется из index.html.
const CACHE = 'fury-survivors-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req, { cache: 'no-cache' });
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(req);
      if (hit) return hit;
      throw err;
    }
  })());
});
