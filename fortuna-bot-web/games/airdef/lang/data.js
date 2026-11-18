// Локализатор данных арсенала (Mark 2026-10-21, английский, этап 2). arsenal.js, sim/flight.js, sim/heli.js, progress.js копируются в
// функции Supabase и работают на игровом сервере - их тексты остаются русскими и i18n.js они не импортируют. Здесь, на клиенте,
// при языке не русском видимые русские строки в этих данных ПОДМЕНЯЮТСЯ по словарю (lang/<язык>-data.js, нет - английский): названия и описания
// оружия, комплексов, самолётов, вертолётов, подвесок, эпох, ролей, носителей, режимов, подписи и значения таблиц ТТХ, метки СПО.
// Ключи и идентификаторы не трогаются - только значения-строки с кириллицей. Модуль надо импортировать ПЕРВЫМ в main.js (до
// progress.js, чьё дерево копирует названия при импорте); localizeTree(TREE, BRANCHES) - страховка для уже построенного дерева.
import { XL, DICT, numLoc, L10N } from '../i18n.js?v=20261118b';
import * as ARS from '../arsenal.js?v=20261118b';
import { SPECS } from '../sim/flight.js?v=20261118b';
import { HSPECS } from '../sim/heli.js?v=20261118b';
import { MODES } from '../sim/strike.js?v=20261118b';

const CYR = /[А-Яа-яЁё]/;
const tx = (s) => (DICT[s] !== undefined ? DICT[s] : numLoc(s));

// обход: любое строковое значение с кириллицей заменяется (массивы подписей ТТХ [['Страна', 'СССР'], …] - тоже)
function walk(o, seen) {
  if (!o || typeof o !== 'object' || seen.has(o)) return;
  seen.add(o);
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (typeof v === 'string') { if (CYR.test(v)) { try { o[k] = tx(v); } catch (_) { /* заморожено - оставляем */ } } } else walk(v, seen);
  }
}
let done = false;
export function localizeData() {
  if (!XL || done) return;
  done = true;
  const seen = new Set();
  for (const v of Object.values(ARS)) walk(v, seen); // AG, SAM, PLANES, SPECS-подобное, LOADOUTS, HELI_LOADOUTS, ERAS, CARRIERS, ROLE_NAME, AG_KIND, SAM_TYPE, MULTI…
  walk(SPECS, seen); walk(HSPECS, seen); walk(MODES, seen);
  if (ARS.AG.kalibr) ARS.AG.kalibr.short = L10N.kalibr; // ракета «Калибр» - не подпись «Калибр» (мм) из таблиц ТТХ: общий ключ словаря
}
// узлы дерева прокачки (progress.js строит TREE при импорте из SPECS / AG - если он успел раньше, названия там русские). Названия
// берём из уже переведённых данных тем же правилом, что в buildTree (так «Калибр»-ракета не путается с подписью «Калибр» в таблицах).
export function localizeTree(TREE, BRANCHES, SIDE_NAME) {
  if (!XL) return;
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
