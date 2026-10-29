// Язык интерфейса (Mark 2026-10-21): русский — исходный (строки остаются в коде), английский — словарь «русская строка →
// английская» (lang/en.js, собирается из частей lang/en-*.js). tr(ru) — строка на выбранном языке (перевода нет — исходная);
// tr('Сбито: {0}/{1}', [a, b]) — с подстановкой. trDom(root) — статичный HTML страницы (текст и title / aria-label / placeholder).
// Выбор — «Настройки» → «Язык» (localStorage), для проверки — ?lang=en. Первый вход — язык устройства / Telegram и вопрос (askLang).
// Без DOM при импорте: модуль годится для стендов Deno.
import EN from './lang/en.js?v=20261029a';

const LS_KEY = 'fortuna_airdef_lang';
// язык устройства (Mark 2026-10-21: иностранца не пугать русским интерфейсом): в Telegram — язык аккаунта, иначе — браузера;
// языки, где обычно понимают русский, — русский, остальные — английский
const RU_LIKE = /^(ru|be|kk|ky|uz|tg|tk|hy|az|uk)\b/i;
export function sysLang() {
  let c = '';
  try { const w = window.parent !== window ? window.parent : window, T = (w.Telegram && w.Telegram.WebApp) || (window.Telegram && window.Telegram.WebApp); c = (T && T.initDataUnsafe && T.initDataUnsafe.user && T.initDataUnsafe.user.language_code) || ''; } catch (_) { /* нет Telegram или чужой фрейм */ }
  try { if (!c && typeof navigator !== 'undefined') c = (navigator.languages && navigator.languages[0]) || navigator.language || ''; } catch (_) { /* нет navigator */ }
  return !c || RU_LIKE.test(c) ? 'ru' : 'en';
}
let saved = null;
function detect() {
  if (typeof document === 'undefined') return 'ru'; // онлайн-сервер (Deno 1.x: window есть, navigator.language — en-US) — сообщения по-русски, их переводит клиент
  try { const Q = typeof location !== 'undefined' && location.search ? new URLSearchParams(location.search) : null, q = Q && Q.get('lang'); if (q === 'en' || q === 'ru') return q; if (Q && Q.get('test')) return 'ru'; /* стенды (Deno: navigator.language — en-US) — русский, если не ?lang= */ } catch (_) { /* нет location */ }
  try { const s = globalThis.localStorage && globalThis.localStorage.getItem(LS_KEY); if (s === 'en' || s === 'ru') { saved = s; return s; } } catch (_) { /* приватный режим */ }
  return typeof window === 'undefined' ? 'ru' : sysLang();
}
export const LANG = detect();
// первый вход: язык ещё не выбран — один раз спросить (угаданный выделен); выбор запоминается, сменить — «Настройки» → «Язык»
export function askLang() {
  if (saved || typeof document === 'undefined' || !document.body || !document.body.appendChild) return;
  try { if (new URLSearchParams(location.search).get('lang') || new URLSearchParams(location.search).get('test')) return; } catch (_) { /* нет location */ }
  const el = document.createElement('div'); el.id = 'langAsk';
  el.innerHTML = `<div class="lcard"><b>Choose language · Выберите язык</b>${LANGS.map(([k, l]) => `<button data-l="${k}" class="${k === LANG ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const css = document.createElement('style');
  css.textContent = `#langAsk{position:fixed;inset:0;z-index:200;display:flex;align-items:center;justify-content:center;background:rgba(6,9,6,.72)}
#langAsk .lcard{display:flex;flex-direction:column;gap:10px;min-width:min(320px,86vw);padding:18px;background:rgba(16,20,15,.97);border:1px solid rgba(233,230,220,.18);color:#e9e6dc;font:400 15px 'Golos Text',sans-serif}
#langAsk b{font:500 17px 'Oswald',sans-serif;margin-bottom:4px}#langAsk button{padding:12px;border:1px solid rgba(233,230,220,.25);background:rgba(255,255,255,.06);color:inherit;font:500 16px 'Oswald',sans-serif;cursor:pointer}
#langAsk button.on{background:#e8b04a;color:#17190f;border-color:#e8b04a}`;
  (document.head || document.body).appendChild(css); document.body.appendChild(el);
  el.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('[data-l]'); if (!b) return; setLang(b.dataset.l); if (b.dataset.l !== LANG) location.reload(); else el.remove(); });
}
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
