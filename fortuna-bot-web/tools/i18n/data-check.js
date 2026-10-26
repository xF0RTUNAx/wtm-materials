// Проверка английской локализации данных и руководства «Воздушного превосходства» (этап 2):
//   deno run -A tools/i18n/data-check.js        — LANG = en: после localizeData() / localizeTree() в видимых полях AG / SAM / PLANES / SPECS /
//                                                 HSPECS / LOADOUTS / ERAS / MODES … и в узлах дерева прокачки нет кириллицы; руководство
//                                                 (guide.js, обе раскладки — телефон и ПК) тоже без кириллицы
//   deno run -A tools/i18n/data-check.js --late — то же, но progress.js импортирован раньше data.js: узлы дерева переименовывает localizeTree
//   deno run -A tools/i18n/data-check.js --ru   — LANG = ru: данные не тронуты (на сервере LANG всегда ru), руководство собирается
// Язык подставляется как ?lang=en через globalThis.location (как в браузере). Код выхода 1 — есть непереведённое.
const RU = Deno.args.includes('--ru');
const dir = new URL('.', import.meta.url).pathname;
(0, eval)(Deno.readTextFileSync(dir + '../drone-headless/three.min.js'));
globalThis.location = { search: RU ? '?lang=ru' : '?lang=en' };
globalThis.document = globalThis.document || {}; // i18n.js без document считает себя онлайн-сервером и держит русский — изображаем страницу
const A = '../../games/airdef/';
const LATE = Deno.args.includes('--late'); // дерево прокачки построено ДО локализации (проверка localizeTree)
if (LATE) await import(A + 'progress.js?v=20261026b');
await import(A + 'lang/data.js?v=20261026b'); // первым, как в main.js
const ARS = await import(A + 'arsenal.js?v=20261026b');
const { SPECS } = await import(A + 'sim/flight.js?v=20261026b');
const { HSPECS } = await import(A + 'sim/heli.js?v=20261026b');
const { MODES } = await import(A + 'sim/strike.js?v=20261026b');
const PR = await import(A + 'progress.js?v=20261026b');
const { localizeTree } = await import(A + 'lang/data.js?v=20261026b');
const { guideChapters } = await import(A + 'guide.js?v=20261026b');
localizeTree(PR.TREE, PR.BRANCHES);

const cyr = /[А-Яа-яЁё]/;
let n = 0, bad = 0;
const seen = new Set();
const walk = (v, path) => {
  if (typeof v === 'string') { n++; if (cyr.test(v)) { bad++; if (bad <= 40) console.log('  кириллица:', path, '=', JSON.stringify(v.length > 90 ? v.slice(0, 90) + '…' : v)); } return; }
  if (!v || typeof v !== 'object' || seen.has(v)) return; seen.add(v);
  for (const k of Object.keys(v)) walk(v[k], path + '.' + k);
};
if (!RU) {
  for (const [k, v] of Object.entries(ARS)) walk(v, k);
  walk(SPECS, 'SPECS'); walk(HSPECS, 'HSPECS'); walk(MODES, 'MODES');
  walk(PR.TREE, 'TREE'); walk(PR.BRANCHES, 'BRANCHES');
  console.log(`данные: строк ${n}, с кириллицей ${bad}`);
} else {
  // по-русски данные нетронуты: контрольные строки
  const ok = ARS.AG.fab500.name === 'ФАБ-500М-62' && ARS.SAM.s300.short === 'С-300' && ARS.ERAS[0].name.startsWith('I —') && PR.TREE.some((x) => x.name === 'ФАБ-500М-62');
  console.log('по-русски данные нетронуты:', ok ? 'да' : 'НЕТ'); if (!ok) bad++;
}
// руководство: обе раскладки; по-английски — без кириллицы
for (const touch of [true, false]) {
  const ch = guideChapters({ IS_TOUCH: touch });
  const html = ch.map(([t, b]) => t + '\n' + b).join('\n');
  const text = html.replace(/<[^>]+>/g, ' ');
  const m = RU ? [] : [...text.matchAll(/[^\s]*[А-Яа-яЁё][^\s]*/g)].map((x) => x[0]);
  console.log(`руководство (${touch ? 'телефон' : 'ПК'}): глав ${ch.length}, знаков ${html.length}${RU ? '' : `, кириллица: ${m.length}`}`);
  if (m.length) { bad += m.length; console.log('  ', [...new Set(m)].slice(0, 25).join(' | ')); }
}
console.log(bad ? `ИТОГ: непереведённого — ${bad}` : 'ИТОГ: кириллицы нет');
Deno.exit(bad ? 1 : 0);
