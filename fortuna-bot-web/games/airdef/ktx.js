// Сжатые текстуры KTX2 (tools/airdef-tex/ktx.js): в памяти видеокарты в 4–8 раз меньше JPEG/WebP. Транскодер Basis
// (vendor/basis, three r128) переводит в формат устройства: ASTC (iPhone, Mac), BC7/BC3 (ПК), ETC2 (Android).
// Нет поддержки, ?ktx=0 или ошибка загрузки — вызывающий берёт прежний JPEG/WebP.
/* global THREE */
import { KTX2Loader } from './vendor/basis/KTX2Loader.js?v=20261022y';
const V = '20261022c';
let L = null, META = null;
export function ktxInit(renderer) {
  if (L || !renderer || typeof Worker === 'undefined' || typeof WebAssembly === 'undefined') return;
  if (typeof location !== 'undefined' && /[?&]ktx=0/.test(location.search)) return;
  try { L = new KTX2Loader().setTranscoderPath(new URL('./vendor/basis/', import.meta.url).href).detectSupport(renderer); } catch (e) { L = null; console.warn('KTX2 недоступен:', e.message); }
}
export const ktxOn = () => !!L;
// текстура tex/<name>.ktx2 (картинка — сверху вниз, как ImageBitmap без переворота); шейдеры игры сами переводят sRGB
export function ktxLoad(name) {
  if (!L) return Promise.reject(new Error('KTX2 выключен'));
  return new Promise((ok, no) => L.load(new URL(`./tex/${name}.ktx2?v=${V}`, import.meta.url).href, (t) => { t.encoding = THREE.LinearEncoding; ok(t); }, undefined, no));
}
// текстура по адресу (раскадровки эффектов, flipbook.js): как ktxLoad — сырые значения, шейдер сам переводит sRGB
export function ktxLoadUrl(url) {
  if (!L) return Promise.reject(new Error('KTX2 выключен'));
  return new Promise((ok, no) => L.load(url, (t) => { t.encoding = THREE.LinearEncoding; ok(t); }, undefined, no));
}
// средние цвета земли (из сжатой текстуры их не прочитать)
export const ktxMeta = () => META || (META = fetch(new URL(`./tex/ktx.json?v=${V}`, import.meta.url)).then((r) => r.json()));

// ── текстуры моделей (models.js): games/airdef/models/ktx/<модель>.<номер картинки>.ktx2 + index.json (tools/airdef-models/ktx-models.js) ──
// index.json: { "<модель>": { v: версия glb на момент кодирования, r: ревизия, img: [номера], alias?: { "<номер>": "<модель>.<номер>" — файл другой модели } } }.
// Сжатые UASTC в формат устройства переводит тот же транскодер; maxSize — предел размера (телефон): верхние уровни не переводятся и в память не попадают.
const MV = new URL(import.meta.url).searchParams.get('v') || '0'; // версия модулей — у index.json (адрес меняется с деплоем)
export const ktxIndexUrl = (base) => `${base}models/ktx/index.json?v=${MV}`;
// адрес файла для картинки i модели name (или null — нет файла / glb пересобран после кодирования, тогда игра берёт JPEG из glb); verOf(name) — версия glb сейчас
export function ktxUrlOf(base, idx, name, i, verOf) {
  const e = idx && idx[name]; if (!e || e.v !== verOf(name) || !e.img.includes(i)) return null;
  const stem = e.alias && e.alias[i] ? e.alias[i] : `${name}.${i}`, on = stem.slice(0, stem.lastIndexOf('.')), oe = idx[on];
  return oe && oe.v === verOf(on) ? `${base}models/ktx/${stem}.ktx2?v=${oe.v}.${oe.r || 0}` : null;
}
// все файлы, которые нужны этой версии игры: [{ url, stem }] (для «Скачать всё заранее»)
export function ktxAllUrls(base, idx, verOf) {
  const seen = new Map();
  for (const [name, e] of Object.entries(idx || {})) for (const i of e.img) { const u = ktxUrlOf(base, idx, name, i, verOf); if (u && !seen.has(u)) seen.set(u, (u.match(/ktx\/([^?]+)\.ktx2/) || [])[1]); }
  return [...seen].map(([url, stem]) => ({ url, stem }));
}
// разбор файла из памяти (cachedFetch → arrayBuffer): текстура с уровнями не больше maxSize (0 — все)
export function ktxParse(buffer, maxSize = 0) {
  if (!L) return Promise.reject(new Error('KTX2 выключен'));
  return new Promise((ok, no) => { try { L.parse(buffer, ok, no, maxSize); } catch (e) { no(e); } });
}
