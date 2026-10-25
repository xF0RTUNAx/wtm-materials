// Ресурсы игры — на устройстве (Mark 2026-10-23: «пакет всех моделей и ресурсов навсегда, чтобы не догружать каждый раз, тем более в бою»).
// Два слоя:
//   • модели (≈ 350 МБ из ≈ 385) и их сжатые текстуры (models/ktx) — постоянный кэш прямо со страницы (Cache Storage, cachedFetch): работает и без сервис-воркера —
//     в Telegram на iPhone (WKWebView) воркеров нет. Ключ — точный адрес с версией модели (GLB_V): новая версия файла скачивается,
//     прежняя удаляется;
//   • остальное (код, текстуры, звуки, картинки) — сервис-воркер games/airdef-sw.js (Android, ПК), его кэш сменяется при каждом деплое.
// Только на сайте (fortunawtm.com) или с ?sw=1: на localhost и в локальной сети файлы меняются без смены версии — кэш показывал бы старое.
// «Скачать всё заранее» (Настройки) — prefetchAll: модели по списку models.js + файлы по games/airdef/assets.json.
import { ktxOn, ktxIndexUrl, ktxAllUrls } from './ktx.js?v=20261026a';
const PROD = typeof location !== 'undefined' && (/fortunawtm\.com$/.test(location.hostname) || /[?&]sw=1/.test(location.search));
const MCACHE = 'airdef-models-v1', glbName = (u) => (u.match(/models\/([^?]+)\.glb/) || [])[1], ktxName = (u) => (u.match(/models\/ktx\/([^?]+)\.(?:ktx2|json)/) || [])[1]; // сжатые текстуры моделей (models/ktx, ktx.js): имя «<модель>.<номер>», индекс — «index»
const hasCaches = () => PROD && typeof caches !== 'undefined' && caches && typeof caches.open === 'function';
let mc = null; const mcOpen = () => mc || (mc = caches.open(MCACHE).catch(() => null));
// модель: из кэша устройства, нет — из сети и в кэш (прежние версии того же файла — долой)
export async function cachedFetch(url) {
  if (!hasCaches()) return fetch(url);
  const c = await mcOpen(); if (!c) return fetch(url);
  try { const hit = await c.match(url); if (hit) return hit; } catch (_) { /* нет — из сети */ }
  const r = await fetch(url);
  if (r.ok) { const copy = r.clone(); c.put(url, copy).then(() => dropOld(c, url)).catch(() => { /* нет места — просто без кэша */ }); }
  return r;
}
async function dropOld(c, url) {
  const u = new URL(url, location.href); let ks;
  try { ks = await c.keys(u.href, { ignoreSearch: true }); } catch (_) { ks = await c.keys(); } // ignoreSearch — без перебора всего кэша (с ktx в нём больше тысячи записей)
  for (const k of ks) { const ku = new URL(k.url); if (ku.pathname === u.pathname && ku.search !== u.search) c.delete(k); }
}
// сервис-воркер (где есть): кэш остальных файлов игры. Регистрирует его сама страница (airdef.html, до модулей): версия в адресе воркера идёт
// со страницей, а она не кэшируется — после деплоя новый воркер ставится, даже если модули ещё из старого кэша. Здесь — только уборка вне сайта
// (localhost, локальная сеть: там файлы меняются без смены версии — воркер показывал бы старое)
export function registerSW() {
  if (PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.getRegistrations().then((L) => { for (const r of L) if (/airdef-sw\.js/.test((r.active || r.waiting || r.installing || {}).scriptURL || '')) r.unregister(); }).catch(() => {});
}
// сколько занято на устройстве, МБ (или null), и попросить браузер не вычищать (Android, ПК; в iOS — молча нет)
export async function storageInfo() {
  let used = null, persisted = false;
  try { if (navigator.storage && navigator.storage.estimate) used = (await navigator.storage.estimate()).usage / 1048576; } catch (_) { /* нет */ }
  try { if (navigator.storage && navigator.storage.persisted) persisted = await navigator.storage.persisted(); } catch (_) { /* нет */ }
  return { used, persisted, ok: hasCaches() };
}
// скачать всё: urls моделей (models.js modelUrls) + файлы из assets.json; onProgress(done, total, байт) — по ходу; по 4 сразу
export async function prefetchAll(modelUrls, onProgress, abort = { stop: false }) {
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (_) { /* нет */ }
  const man = await fetch('airdef/assets.json?v=20261026a').then((r) => r.json()).catch(() => ({ files: [], models: {} }));
  const has = Object.keys(man.models).length, nm = glbName; // в списке — только существующие файлы
  if (has) await tidyModels(man.models, man.ktx);
  const jobs = [...modelUrls.filter((u) => !has || man.models[nm(u)] !== undefined).map((u) => ({ u, m: true, b: man.models[nm(u)] || 1048576 })),
    ...man.files.map(([p, b]) => ({ u: `airdef/${p}?v=20261026a`, m: false, b }))];
  // сжатые текстуры моделей — только если это устройство их возьмёт (ktxOn: форматы и воркеры есть, не ?ktx=0); список — из index.json (файлы нужной версии), размеры — из assets.json
  if (has && man.ktx && ktxOn()) try {
    const base = (modelUrls[0] || '').split('models/')[0], verOf = (n) => ((modelUrls.find((u) => glbName(u) === n) || '').match(/[?&]v=([^&]+)/) || [])[1];
    const ir = await cachedFetch(ktxIndexUrl(base)); if (ir.ok) {
      const idx = await ir.json(); jobs.push({ u: ktxIndexUrl(base), m: true, b: man.ktx.index || 1024 });
      for (const f of ktxAllUrls(base, idx, verOf)) if (man.ktx[f.stem] !== undefined) jobs.push({ u: f.url, m: true, b: man.ktx[f.stem] });
    }
  } catch (_) { /* без сжатых — игра возьмёт JPEG из glb */ }
  const total = jobs.reduce((s, j) => s + j.b, 0); let done = 0, bytes = 0, fail = 0, i = 0;
  const one = async (j) => { try { const r = j.m ? await cachedFetch(j.u) : await fetch(j.u); if (r.ok) await r.arrayBuffer(); else fail++; } catch (_) { fail++; } done++; bytes += j.b; onProgress(done, jobs.length, bytes, total, fail); };
  await Promise.all([0, 1, 2, 3].map(async () => { while (i < jobs.length && !abort.stop) await one(jobs[i++]); }));
  return { done, total: jobs.length, fail };
}
// кэш моделей против списка: убранные из игры модели — долой; размер не тот (файл сменили без версии, запись битая) — долой, скачается заново.
// Размер — по самому файлу в кэше (заголовок content-length у сайта — сжатый размер)
async function tidyModels(sizes, ktx) {
  if (!hasCaches()) return; const c = await mcOpen(); if (!c) return;
  for (const k of await c.keys().catch(() => [])) {
    const kn = ktxName(k.url); if (kn !== undefined && !ktx) continue; // сжатые текстуры: в списке их нет (старый assets.json) — не трогаем
    const b = kn !== undefined ? ktx[kn] : sizes[glbName(k.url)];
    if (b === undefined) { await c.delete(k); continue; }
    try { const r = await c.match(k); if (r && (await r.blob()).size !== b) await c.delete(k); } catch (_) { /* не прочли — оставим */ }
  }
}
export const offlineOk = hasCaches;
