// Сервис-воркер «Воздушного превосходства» (регистрирует сама страница airdef.html, только на сайте; область — games/airdef…): файлы игры — из кэша устройства.
// Кэш — на версию модулей (адрес воркера ?v=…): после деплоя новый воркер, прежний кэш удаляется (файлы могли смениться без своей версии).
// Модели (.glb) здесь не кэшируются — у них свой постоянный кэш со страницы (offline.js cachedFetch: работает и там, где воркеров нет).
// Только запросы «Воздушного превосходства» (путь или источник — games/airdef…); «Летка» и прочее — мимо, как без воркера.
const VER = new URL(self.location.href).searchParams.get('v') || 'dev', CACHE = 'airdef-files-' + VER;
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith('airdef-files-') && k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
const ours = (req) => {
  if (req.method !== 'GET' || req.mode === 'navigate' || req.headers.get('range')) return false;
  const u = new URL(req.url); if (u.origin !== self.location.origin || /\.glb$/.test(u.pathname) || /\/airdef\.html$/.test(u.pathname) || /airdef-sw\.js$/.test(u.pathname)) return false;
  return u.pathname.includes('/games/airdef/') || (req.referrer || '').includes('/games/airdef');
};
self.addEventListener('fetch', (e) => {
  if (!ours(e.request)) return;
  e.respondWith((async () => {
    // код и данные (.js, .json) — строго по адресу с версией: иначе новая страница получила бы прежний main.js и навсегда осталась на старом воркере;
    // картинки, звуки, текстуры — без учёта ?…: в пределах версии у файла одно содержимое (игра и «Скачать всё» просят их по-разному)
    const code = /\.(m?js|json|css|html?)$/.test(new URL(e.request.url).pathname);
    const c = await caches.open(CACHE), hit = await c.match(e.request, { ignoreSearch: !code });
    if (hit) return hit;
    const r = await fetch(e.request);
    if (r.ok && r.type === 'basic') { const copy = r.clone(); e.waitUntil(c.put(e.request, copy).catch(() => {})); }
    return r;
  })());
});
