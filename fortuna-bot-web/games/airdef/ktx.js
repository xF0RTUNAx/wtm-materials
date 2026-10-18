// Сжатые текстуры KTX2 (tools/airdef-tex/ktx.js): в памяти видеокарты в 4–8 раз меньше JPEG/WebP. Транскодер Basis
// (vendor/basis, three r128) переводит в формат устройства: ASTC (iPhone, Mac), BC7/BC3 (ПК), ETC2 (Android).
// Нет поддержки, ?ktx=0 или ошибка загрузки — вызывающий берёт прежний JPEG/WebP.
/* global THREE */
import { KTX2Loader } from './vendor/basis/KTX2Loader.js?v=20261021a';
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
// средние цвета земли (из сжатой текстуры их не прочитать)
export const ktxMeta = () => META || (META = fetch(new URL(`./tex/ktx.json?v=${V}`, import.meta.url)).then((r) => r.json()));
