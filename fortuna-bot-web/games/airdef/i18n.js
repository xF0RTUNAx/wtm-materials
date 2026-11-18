// Язык интерфейса (Mark 2026-10-21; 2026-11-18 - ещё украинский, немецкий, испанский, французский): русский - исходный (строки остаются
// в коде), остальные - словари «русская строка → перевод» (lang/<язык>.js, собираются из частей lang/<язык>-*.js). Грузится только
// словарь выбранного языка (у русского - никакого); у неанглийских недостающая строка берётся из английского. tr(ru) - строка на
// выбранном языке (перевода нет - исходная); tr('Сбито: {0}/{1}', [a, b]) - с подстановкой. trDom(root) - статичный HTML страницы.
// Выбор - «Настройки» → «Язык» (localStorage), для проверки - ?lang=de. Первый вход - язык устройства / Telegram и вопрос (askLang).
// Без DOM при импорте: модуль годится для стендов Deno (там язык - русский, словарь не грузится).
export const LANGS = [['en', 'English'], ['ru', 'Русский'], ['uk', 'Українська'], ['de', 'Deutsch'], ['es', 'Español'], ['fr', 'Français']];
const CODES = LANGS.map(([k]) => k);

const LS_KEY = 'fortuna_airdef_lang';
// язык устройства (Mark 2026-10-21: иностранца не пугать русским интерфейсом): в Telegram - язык аккаунта, иначе - браузера;
// свой язык, если игра на нём есть; языки, где обычно понимают русский, - русский; остальные - английский
const RU_LIKE = /^(ru|be|kk|ky|uz|tg|tk|hy|az)\b/i;
export function sysLang() {
  let c = '';
  try { const w = window.parent !== window ? window.parent : window, T = (w.Telegram && w.Telegram.WebApp) || (window.Telegram && window.Telegram.WebApp); c = (T && T.initDataUnsafe && T.initDataUnsafe.user && T.initDataUnsafe.user.language_code) || ''; } catch (_) { /* нет Telegram или чужой фрейм */ }
  try { if (!c && typeof navigator !== 'undefined') c = (navigator.languages && navigator.languages[0]) || navigator.language || ''; } catch (_) { /* нет navigator */ }
  const two = String(c).slice(0, 2).toLowerCase();
  return !c || RU_LIKE.test(c) ? 'ru' : CODES.includes(two) ? two : 'en';
}
let saved = null;
function detect() {
  if (typeof document === 'undefined') return 'ru'; // онлайн-сервер (Deno 1.x: window есть, navigator.language - en-US) - сообщения по-русски, их переводит клиент
  try { const Q = typeof location !== 'undefined' && location.search ? new URLSearchParams(location.search) : null, q = Q && Q.get('lang'); if (CODES.includes(q)) return q; if (Q && Q.get('test')) return 'ru'; /* стенды (Deno: navigator.language - en-US) - русский, если не ?lang= */ } catch (_) { /* нет location */ }
  try { const s = globalThis.localStorage && globalThis.localStorage.getItem(LS_KEY); if (CODES.includes(s)) { saved = s; return s; } } catch (_) { /* приватный режим */ }
  return typeof window === 'undefined' ? 'ru' : sysLang();
}
export const LANG = detect();
// первый вход: язык ещё не выбран - один раз спросить (угаданный выделен); выбор запоминается, сменить - «Настройки» → «Язык»
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
export function setLang(l) { try { globalThis.localStorage.setItem(LS_KEY, l); } catch (_) { /* приватный режим */ } }

export const XL = LANG !== 'ru'; // язык не русский - строки идут через словарь
export const LOCALE = { ru: 'ru-RU', uk: 'uk-UA', en: 'en-US', de: 'de-DE', es: 'es-ES', fr: 'fr-FR' }[LANG] || 'ru-RU'; // числа: разделитель тысяч
async function loadDict(l) {
  if (l === 'ru') return {};
  const en = (await import('./lang/en.js?v=20261118a')).default;
  if (l === 'en') return en;
  let d = {}; try { d = (await import(`./lang/${l}.js?v=20261118a`)).default; } catch (_) { /* словаря ещё нет - английский */ }
  return { ...en, ...d };
}
export const DICT = await loadDict(LANG);
const sub = (s, args) => (args ? s.replace(/\{(\d+)\}/g, (m, i) => (args[i] ?? '')) : s);
export function tr(ru, args) {
  if (!XL || typeof ru !== 'string') return sub(ru, args);
  const v = DICT[ru];
  return sub(v !== undefined ? v : ru, args);
}
// перевод уже готовой строки, если она целиком есть в словаре (сообщения сервера, названия из данных)
// ответы сервера: длинные тире убраны из всех текстов (Mark 2026-11-04), игровой сервер на ноутбуке может быть ещё старым
const noDash = (s) => (typeof s === 'string' ? s.replace(/[\u2014\u2013]/g, '-') : s);
export const trIf = (s0) => { const s = noDash(s0); return XL && typeof s === 'string' && DICT[s] !== undefined ? DICT[s] : s; };

const ATTRS = ['title', 'aria-label', 'placeholder', 'alt'];
export function trDom(root) {
  if (!XL || !root || typeof document === 'undefined' || !document.createTreeWalker) return;
  if (document.documentElement) document.documentElement.lang = LANG;
  const w = document.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const t = n.nodeValue, k = t.trim(); if (!k || DICT[k] === undefined) continue;
    n.nodeValue = t.replace(k, DICT[k]);
  }
  for (const el of root.querySelectorAll ? root.querySelectorAll('[title],[aria-label],[placeholder],[alt]') : []) for (const a of ATTRS) { const v = el.getAttribute(a); if (v && DICT[v.trim()] !== undefined) el.setAttribute(a, DICT[v.trim()]); }
}

// Числа с единицами из таблиц ТТХ («≈ 500 кг», «0,5-5 км», «до ≈ 12 км с большой высоты», «≈ 3,6 М»): словари их не хранят - правила.
// Английский: запятая → точка, пробел тысяч → запятая; остальные языки - запятая остаётся. Единицы и несколько фраз - на языке игры.
const U = {
  en: { kmh: 'km/h', kms: 'km/s', ms: 'm/s', degs: '°/s', km: 'km', kg: 'kg', mm: 'mm', m: 'm', s: 's', t: 't', mach: 'Mach ', upto: 'up to' },
  de: { kmh: 'km/h', kms: 'km/s', ms: 'm/s', degs: '°/s', km: 'km', kg: 'kg', mm: 'mm', m: 'm', s: 's', t: 't', mach: 'Mach ', upto: 'bis' },
  es: { kmh: 'km/h', kms: 'km/s', ms: 'm/s', degs: '°/s', km: 'km', kg: 'kg', mm: 'mm', m: 'm', s: 's', t: 't', mach: 'Mach ', upto: 'hasta' },
  fr: { kmh: 'km/h', kms: 'km/s', ms: 'm/s', degs: '°/s', km: 'km', kg: 'kg', mm: 'mm', m: 'm', s: 's', t: 't', mach: 'Mach ', upto: "jusqu'à" },
  uk: { kmh: 'км/год', kms: 'км/с', ms: 'м/с', degs: '°/с', km: 'км', kg: 'кг', mm: 'мм', m: 'м', s: 'с', t: 'т', mach: null, upto: 'до' },
};
const PHRASE = {
  en: [['в игре меньше', 'less in the game'], ['при подсвете', 'when lased'], ['с большой высоты', 'from high altitude'], ['с высоты', 'from altitude'], ['в контейнере', 'in container'], ['без GPS', 'without GPS'], ['кумулятивная', 'shaped-charge'], ['MSE - больше', 'MSE: more'], ['выстр./мин', 'rpm'], ['снарядов', 'rounds'], ['(оптика)', '(optical)'], ['залп', 'salvo'], ['высоты', 'altitude']],
  de: [['в игре меньше', 'im Spiel weniger'], ['при подсвете', 'bei Laserzielmarkierung'], ['с большой высоты', 'aus großer Höhe'], ['с высоты', 'aus der Höhe'], ['в контейнере', 'im Behälter'], ['без GPS', 'ohne GPS'], ['кумулятивная', 'Hohlladung'], ['MSE - больше', 'MSE: mehr'], ['выстр./мин', 'Schuss/min'], ['снарядов', 'Schuss'], ['(оптика)', '(optisch)'], ['залп', 'Salve'], ['высоты', 'Höhe']],
  es: [['в игре меньше', 'menos en el juego'], ['при подсвете', 'con designación láser'], ['с большой высоты', 'desde gran altitud'], ['с высоты', 'desde altitud'], ['в контейнере', 'en contenedor'], ['без GPS', 'sin GPS'], ['кумулятивная', 'carga hueca'], ['MSE - больше', 'MSE: más'], ['выстр./мин', 'disp./min'], ['снарядов', 'proyectiles'], ['(оптика)', '(óptico)'], ['залп', 'salva'], ['высоты', 'altitud']],
  fr: [['в игре меньше', 'moins dans le jeu'], ['при подсвете', 'avec désignation laser'], ['с большой высоты', 'depuis haute altitude'], ['с высоты', "depuis l'altitude"], ['в контейнере', 'en conteneur'], ['без GPS', 'sans GPS'], ['кумулятивная', 'charge creuse'], ['MSE - больше', 'MSE : plus'], ['выстр./мин', 'coups/min'], ['снарядов', 'obus'], ['(оптика)', '(optique)'], ['залп', 'salve'], ['высоты', 'altitude']],
  uk: [['в игре меньше', 'у грі менше'], ['при подсвете', 'при підсвічуванні'], ['с большой высоты', 'з великої висоти'], ['с высоты', 'з висоти'], ['в контейнере', 'у контейнері'], ['без GPS', 'без GPS'], ['кумулятивная', 'кумулятивна'], ['MSE - больше', 'MSE - більше'], ['выстр./мин', 'постр./хв'], ['снарядов', 'снарядів'], ['(оптика)', '(оптика)'], ['залп', 'залп'], ['высоты', 'висоти']],
};
const CYR = /[А-Яа-яЁё]/;
export function numLoc(s) {
  if (!XL || typeof s !== 'string' || !CYR.test(s)) return s;
  const u = U[LANG] || U.en; let t = s;
  for (const [a, b] of PHRASE[LANG] || PHRASE.en) t = t.split(a).join(b);
  if (LANG === 'en') t = t.replace(/(\d),(\d)/g, '$1.$2').replace(/(\d) (\d{3})(?!\d)/g, '$1,$2');
  t = t.replace(/(\d)(\s*)км\/ч/g, `$1$2${u.kmh}`).replace(/(\d)(\s*)км\/с/g, `$1$2${u.kms}`).replace(/(\d)(\s*)м\/с/g, `$1$2${u.ms}`).replace(/°\/с/g, u.degs)
    .replace(/(\d)(\s*)км(?![А-Яа-яіїєґ\/])/g, `$1$2${u.km}`).replace(/(\d)(\s*)кг/g, `$1$2${u.kg}`).replace(/(\d)(\s*)мм/g, `$1$2${u.mm}`);
  if (u.mach) t = t.replace(/(≈\s*)?(\d+(?:[.,]\d+)?)\s*М(?![А-Яа-яA-Za-z0-9-])/g, `$1${u.mach}$2`);
  t = t.replace(/(\d)(\s*)м(?![А-Яа-яA-Za-zіїєґ])/g, `$1$2${u.m}`).replace(/(\d)(\s*)с(?![А-Яа-яA-Za-zіїєґ])/g, `$1$2${u.s}`).replace(/(\d)(\s*)т(?![А-Яа-яA-Za-zіїєґ])/g, `$1$2${u.t}`)
    .replace(/(^|[\s(])до(?=\s*[\d≈])/g, `$1${u.upto}`);
  return t;
}
// слова, которых нет в словаре отдельно (у английского свои решения - см. места использования)
export const L10N = {
  confirm: { ru: 'ПОДТВЕРДИТЬ', uk: 'ПІДТВЕРДИТИ', en: 'CONFIRM', de: 'BESTÄTIGEN', es: 'CONFIRMAR', fr: 'CONFIRMER' }[LANG], // удаление аккаунта
  goal: { ru: 'Цель', uk: 'Мета', en: 'GOAL', de: 'ZIEL', es: 'OBJETIVO', fr: 'OBJECTIF' }[LANG], // ярлык цели исследования (в словаре «Цель» - кнопка захвата)
  detect: { ru: 'Обзор', uk: 'Виявлення', en: 'Detection', de: 'Erfassung', es: 'Detección', fr: 'Détection' }[LANG], // «Обзор» в ТТХ (в словаре - кнопка камеры)
  join: { ru: 'Войти', uk: 'Увійти', en: 'Join', de: 'Beitreten', es: 'Unirse', fr: 'Rejoindre' }[LANG], // войти в комнату по коду (в словаре «Войти» - вход в аккаунт)
  kalibr: { ru: 'Калибр', uk: 'Калібр', en: 'Kalibr', de: 'Kalibr', es: 'Kalibr', fr: 'Kalibr' }[LANG], // ракета, не калибр в мм
};
