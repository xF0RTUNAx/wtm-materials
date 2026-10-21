// Язык интерфейса (Mark 2026-10-21): русский — исходный (строки остаются в коде), английский — словарь «русская строка →
// английская» (lang/en.js, собирается из частей lang/en-*.js). tr(ru) — строка на выбранном языке (перевода нет — исходная);
// tr('Сбито: {0}/{1}', [a, b]) — с подстановкой. trDom(root) — статичный HTML страницы (текст и title / aria-label / placeholder).
// Выбор — «Настройки» → «Язык» (localStorage), для проверки — ?lang=en. Пока перевод не готов целиком, по умолчанию — русский.
// Без DOM при импорте: модуль годится для стендов Deno.
import EN from './lang/en.js?v=20261022r';

const LS_KEY = 'fortuna_airdef_lang';
function detect() {
  try { const q = typeof location !== 'undefined' && location.search ? new URLSearchParams(location.search).get('lang') : null; if (q === 'en' || q === 'ru') return q; } catch (_) { /* нет location */ }
  try { const s = globalThis.localStorage && globalThis.localStorage.getItem(LS_KEY); if (s === 'en' || s === 'ru') return s; } catch (_) { /* приватный режим */ }
  return 'ru';
}
export const LANG = detect();
export const LANGS = [['ru', 'Русский'], ['en', 'English']];
export function setLang(l) { try { globalThis.localStorage.setItem(LS_KEY, l); } catch (_) { /* приватный режим */ } }

const sub = (s, args) => (args ? s.replace(/\{(\d+)\}/g, (m, i) => (args[i] ?? '')) : s);
export function tr(ru, args) {
  if (LANG !== 'en' || typeof ru !== 'string') return sub(ru, args);
  const en = EN[ru];
  return sub(en !== undefined ? en : ru, args);
}
// перевод уже готовой строки, если она целиком есть в словаре (сообщения сервера, названия из данных)
export const trIf = (s) => (LANG === 'en' && typeof s === 'string' && EN[s] !== undefined ? EN[s] : s);

const ATTRS = ['title', 'aria-label', 'placeholder', 'alt'];
export function trDom(root) {
  if (LANG !== 'en' || !root || typeof document === 'undefined' || !document.createTreeWalker) return;
  if (document.documentElement) document.documentElement.lang = 'en';
  const w = document.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const t = n.nodeValue, k = t.trim(); if (!k || EN[k] === undefined) continue;
    n.nodeValue = t.replace(k, EN[k]);
  }
  for (const el of root.querySelectorAll ? root.querySelectorAll('[title],[aria-label],[placeholder],[alt]') : []) for (const a of ATTRS) { const v = el.getAttribute(a); if (v && EN[v.trim()] !== undefined) el.setAttribute(a, EN[v.trim()]); }
}
