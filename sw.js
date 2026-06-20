// sw.js — минимальный service worker.
// Нужен для того, чтобы браузер разрешил установку сайта как приложения (PWA).
// Намеренно НЕ кешируем игровые данные, чтобы не показывать устаревший прогресс.

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  self.clients.claim();
});

// Прозрачный fetch: просто проксируем запросы в сеть.
self.addEventListener("fetch", (e) => {
  // ничего не перехватываем — всегда идём в сеть
});
