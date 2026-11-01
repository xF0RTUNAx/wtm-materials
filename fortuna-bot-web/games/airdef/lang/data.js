// Локализатор данных арсенала (Mark 2026-10-21, английский, этап 2). arsenal.js, sim/flight.js, sim/heli.js, progress.js копируются в
// функции Supabase и работают на игровом сервере — их тексты остаются русскими и i18n.js они не импортируют. Здесь, на клиенте,
// при LANG = en видимые русские строки в этих данных ПОДМЕНЯЮТСЯ английскими по словарю lang/en-data.js: названия и описания
// оружия, комплексов, самолётов, вертолётов, подвесок, эпох, ролей, носителей, режимов, подписи и значения таблиц ТТХ, метки СПО.
// Ключи и идентификаторы не трогаются — только значения-строки с кириллицей. Модуль надо импортировать ПЕРВЫМ в main.js (до
// progress.js, чьё дерево копирует названия при импорте); localizeTree(TREE, BRANCHES) — страховка для уже построенного дерева.
import { LANG } from '../i18n.js?v=20261029b';
import EN from './en.js?v=20261029b';
import * as ARS from '../arsenal.js?v=20261029b';
import { SPECS } from '../sim/flight.js?v=20261029b';
import { HSPECS } from '../sim/heli.js?v=20261029b';
import { MODES } from '../sim/strike.js?v=20261029b';

const CYR = /[А-Яа-яЁё]/;
// Числа с единицами («≈ 500 кг», «0,5–5 км», «до ≈ 12 км с большой высоты», «≈ 3,6 М»): словарь их не хранит — собираем по правилам.
// Десятичная запятая → точка, пробел тысяч → запятая, единицы и несколько фраз таблиц ТТХ — на английском.
const PHRASE = [['в игре меньше', 'less in the game'], ['при подсвете', 'when lased'], ['с большой высоты', 'from high altitude'], ['с высоты', 'from altitude'],
  ['в контейнере', 'in container'], ['без GPS', 'without GPS'], ['кумулятивная', 'shaped-charge'], ['MSE — больше', 'MSE: more'], ['выстр./мин', 'rpm'],
  ['снарядов', 'rounds'], ['(оптика)', '(optical)'], ['залп', 'salvo'], ['высоты', 'altitude']];
export function enNum(s) {
  if (typeof s !== 'string' || !CYR.test(s)) return s;
  let t = s;
  for (const [a, b] of PHRASE) t = t.split(a).join(b);
  t = t.replace(/(\d),(\d)/g, '$1.$2').replace(/(\d) (\d{3})(?!\d)/g, '$1,$2')
    .replace(/(\d)(\s*)км\/ч/g, '$1$2km/h').replace(/(\d)(\s*)км\/с/g, '$1$2km/s').replace(/(\d)(\s*)м\/с/g, '$1$2m/s').replace(/°\/с/g, '°/s')
    .replace(/(\d)(\s*)км/g, '$1$2km').replace(/(\d)(\s*)кг/g, '$1$2kg').replace(/(\d)(\s*)мм/g, '$1$2mm')
    .replace(/(≈\s*)?(\d+(?:\.\d+)?)\s*М(?![А-Яа-яA-Za-z0-9-])/g, '$1Mach $2')
    .replace(/(\d)(\s*)м(?![А-Яа-яA-Za-z])/g, '$1$2m').replace(/(\d)(\s*)с(?![А-Яа-яA-Za-z])/g, '$1$2s').replace(/(\d)(\s*)т(?![А-Яа-яA-Za-z])/g, '$1$2t')
    .replace(/(^|[\s(])до(?=\s*[\d≈])/g, '$1up to');
  return t;
}
const tx = (s) => (EN[s] !== undefined ? EN[s] : enNum(s));

// обход: любое строковое значение с кириллицей заменяется (массивы подписей ТТХ [['Страна', 'СССР'], …] — тоже)
function walk(o, seen) {
  if (!o || typeof o !== 'object' || seen.has(o)) return;
  seen.add(o);
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (typeof v === 'string') { if (CYR.test(v)) { try { o[k] = tx(v); } catch (_) { /* заморожено — оставляем */ } } } else walk(v, seen);
  }
}
let done = false;
export function localizeData() {
  if (LANG !== 'en' || done) return;
  done = true;
  const seen = new Set();
  for (const v of Object.values(ARS)) walk(v, seen); // AG, SAM, PLANES, SPECS-подобное, LOADOUTS, HELI_LOADOUTS, ERAS, CARRIERS, ROLE_NAME, AG_KIND, SAM_TYPE, MULTI…
  walk(SPECS, seen); walk(HSPECS, seen); walk(MODES, seen);
  if (ARS.AG.kalibr) ARS.AG.kalibr.short = 'Kalibr'; // ракета «Калибр» — не подпись «Калибр» (мм) из таблиц ТТХ: общий ключ словаря
}
// узлы дерева прокачки (progress.js строит TREE при импорте из SPECS / AG — если он успел раньше, названия там русские). Названия
// берём из уже переведённых данных тем же правилом, что в buildTree (так «Калибр»-ракета не путается с подписью «Калибр» в таблицах).
export function localizeTree(TREE, BRANCHES, SIDE_NAME) {
  if (LANG !== 'en') return;
  for (const n of TREE) {
    const k = n.item || n.key, isAir = n.branch === 'air' || n.branch === 'heli';
    const src = isAir ? (n.branch === 'heli' ? HSPECS : SPECS)[n.key] : n.branch === 'pvo' ? ARS.SAM[n.key] : ARS.AG[k];
    if (isAir) { n.name = src && src.name ? src.name : ARS.PLANES[n.key] || tx(n.name); n.short = ARS.PLANES[n.key] || tx(n.short); }
    else if (src && src.name) { n.name = src.name; n.short = src.short || tx(n.short); }
    else { n.name = tx(n.name); n.short = tx(n.short); }
    if (n.lineName) n.lineName = tx(n.lineName); // линия «Мульти-волны» («Баллистика», «Крылатые ракеты»…)
  }
  for (const b of BRANCHES || []) { b.name = tx(b.name); if (b.hint) b.hint = tx(b.hint); }
  if (SIDE_NAME) for (const k of Object.keys(SIDE_NAME)) SIDE_NAME[k] = tx(SIDE_NAME[k]);
}
localizeData();
