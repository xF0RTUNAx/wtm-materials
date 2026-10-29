// Страница для решения Mark — tools/airdef-ui/strike-balance.html — из замеров стенда strike-balance-stand.js (strike-balance.json).
//   deno run -A tools/airdef-headless/strike-balance-page.js
// Названия оружия, объектов, режимов и подвесок — из модулей игры (arsenal.js, карты, строки tr()), числа — из замера; руками не править.
const dir = new URL('.', import.meta.url).pathname;
(0, eval)(Deno.readTextFileSync(dir + '../drone-headless/three.min.js'));
const VQ = Deno.readTextFileSync(dir + '../../games/airdef/sim/strike.js').match(/arsenal\.js(\?v=\w+)/)[1];
const G = (p) => import(`../../games/airdef/${p}${VQ}`);
const { AG, LOADOUTS, loadoutRole } = await G('arsenal.js');
const { tr } = await G('i18n.js');
const J = JSON.parse(Deno.readTextFileSync(dir + 'strike-balance.json'));
const P = J.prop, N = J.now, D = P.def;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const f1 = (v) => (v === null || v === undefined ? '—' : (Math.round(v * 10) / 10).toLocaleString('ru-RU'));
const f2 = (v) => (v === null || v === undefined ? '—' : v.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const pc = (v) => (v === null || v === undefined ? '—' : Math.round(v * 100) + ' %');
const med = (a) => { const s = a.filter((v) => v !== null && v !== undefined).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
// ▲ — больше попаданий / подвесок (объект держится дольше), ▼ — меньше
const arrow = (a, b) => { if (a === null || b === null || a === undefined || b === undefined || Math.abs(a - b) < 1e-9) return '<i class="eq">=</i>'; const up = b > a; return `<i class="${up ? 'up' : 'dn'}">${up ? '▲' : '▼'}</i>`; };
const cap = (n) => (n > 120 ? '>120' : String(n));

// ── объекты: класс по размеру
const CLS = { 0.75: 'малый', 1: 'средний', 1.25: 'укреплённый', 1.5: 'крупный' };
const clsOf = (key) => CLS[D.SIZE[key] || 1];
const objId = (o) => o.map + ':' + o.key;
const MED = J.objects.filter((o) => (D.SIZE[o.key] || 1) === 1); // средние объекты — «на средний объект»
const onMed = (T, k, f) => med(MED.map((o) => T[k].obj[objId(o)][f]));

// ── оружие по линиям исследований (ветка «Вооружение») и «Мульти-волне»
const GROUPS = [
  ['Бомбы Востока', ['fab100', 'fab250', 'ofab250', 'fab500', 'fab1000', 'kab500kr', 'kab500l', 'kab500s', 'umpk']],
  ['Бомбы Запада', ['mk82', 'bomb1000', 'gbu12', 'gbu10', 'gbu24', 'gbu31', 'gbu39', 'gbu57']],
  ['Ракеты самолётов', ['kh25ml', 'kh29t', 'kh59m', 'kh59mk2', 'agm65b', 'storm', 'jassm']],
  ['Вертолёты и НАР', ['shturm', 'ataka', 'hellfire', 's8', 'hydra', 's8@plane', 'hydra@plane']],
  ['Крылатые «Мульти-волны»', ['kh55', 'kh555', 'kalibr', 'kh101', 'agm86', 'slam', 'tomahawk', 'jsow', 'sdb']],
  ['Баллистика', ['r17', 'tochka', 'iskander', 'kinzhal', 'lance', 'atacms', 'prsm', 'arrw']],
  ['Дроны', ['shahed', 'uav_w']],
];
const RANK = ['', 'I', 'II', 'III', 'IV'];
const wName = (k) => { const [key, at] = k.split('@'), W = AG[key]; return esc(W.short) + (at === 'plane' ? ' <small>с самолёта</small>' : key === 'sdb' ? ' <small>с F-16</small>' : '') + (W.side ? ` <small>${W.side === 'east' ? 'Восток' : 'Запад'}, ранг ${RANK[W.era]}</small>` : ''); };
function weaponRows(keys) {
  return keys.filter((k) => N.table[k] && P.table[k]).map((k) => {
    const n = N.table[k], p = P.table[k], e = Math.round(p.dmg * 1.25), now = Math.round(n.dmg * 1.25);
    const ex0 = onMed(N.table, k, 'exact'), ex1 = onMed(P.table, k, 'exact'), sc0 = onMed(N.table, k, 'mean'), sc1 = onMed(P.table, k, 'mean');
    const eff = p.eff !== undefined ? p.eff : null;
    return `<tr><td>${wName(k)}</td><td class="n">${n.blast}</td><td class="n">${now}</td><td class="n"><b>${e}</b></td><td class="n">${eff === null ? '—' : Math.round(e * eff)}</td>`
      + `<td class="n">${cap(ex0)} → <b>${cap(ex1)}</b>${arrow(ex0, ex1)}</td><td class="n">${f1(sc0)} → <b>${f1(sc1)}</b>${arrow(sc0, sc1)}</td></tr>`;
  }).join('');
}
const wTables = GROUPS.map(([g, keys]) => `<div class="tw"><table><caption>${esc(g)}</caption><thead><tr><th>Оружие</th><th class="n">Радиус, м</th><th class="n">Сейчас<small>урон прямым</small></th>`
  + `<th class="n">Эквивалент<small>предлагаю, ЕУ</small></th><th class="n">По делу<small>с промахом, ЕУ</small></th><th class="n">На средний объект<small>прямыми: сейчас → будет</small></th><th class="n">С разлётом<small>сейчас → будет</small></th></tr></thead><tbody>${weaponRows(keys)}</tbody></table></div>`).join('');

// ── объекты
const objRows = J.objects.map((o) => {
  const id = objId(o), c = (T, k, f) => T[k].obj[id][f];
  return `<tr><td>${esc(o.name)}<small>${esc(o.mname)}</small></td><td>${clsOf(o.key)}</td><td class="n">${o.hp} → <b>${D.hp[o.key]}</b></td>`
    + ['fab500', 'mk82', 'hellfire', 'kh55'].map((k) => `<td class="n">${cap(c(N.table, k, 'exact'))} → <b>${cap(c(P.table, k, 'exact'))}</b><small>${f1(c(N.table, k, 'mean'))} → ${f1(c(P.table, k, 'mean'))}</small></td>`).join('') + '</tr>';
}).join('');

// ── «Вылет»: подвески
const HEAVY = new Set(['e_tu16', 'e_tu22', 'e_m4', 'e_tu22m2', 'e_tu22m3', 'e_tu95', 'e_b52', 'e_b1b', 'e_b2', 'e_tu160', 'e_vulcan', 'e_il28', 'e_t4']);
const catOf = (r) => { const L = LOADOUTS[r.era][r.i]; if (!L || loadoutRole(L) === 'sead') return null; return r.heli ? 'Вертолёты' : HEAVY.has(r.plane) ? 'Бомбардировщики' : 'Фронтовые'; };
function loadStat(rows, cat, era, f = 'loads') { const L = rows.filter((r) => !r.raid && r.era === era && catOf(r) === cat).map((r) => r[f]); return { m: med(L), lo: L.length ? Math.min(...L) : null, hi: L.length ? Math.max(...L) : null, n: L.length }; }
const loadTable = ['Фронтовые', 'Бомбардировщики', 'Вертолёты'].map((c) => `<tr><td>${c}</td>` + [1, 2, 3, 4].map((e) => {
  const a = loadStat(N.loads, c, e), b = loadStat(P.loads, c, e);
  return `<td class="n">${f1(a.m)} → <b>${f1(b.m)}</b>${arrow(a.m, b.m)}<small>${f1(b.lo)}–${f1(b.hi)}</small></td>`; }).join('') + '</tr>').join('');
const tgtRule = (eu) => Math.max(1, Math.min(3, Math.round(eu / (D.TGT_K * D.H_M))));
const loadList = P.loads.filter((r) => !r.raid && catOf(r)).map((r) => { const n0 = N.loads.find((q) => !q.raid && q.era === r.era && q.i === r.i); const nt = tgtRule(r.eu);
  return `<tr><td>${esc(tr(r.name))}<small>${catOf(r)}, ранг ${RANK[r.era]}</small></td><td class="n">${n0.eu}</td><td class="n"><b>${r.eu}</b></td><td class="n">${f1(n0.loads)} → <b>${f1(r.loads)}</b></td><td class="n">${nt}</td><td class="n"><b>${f1(r.loads * nt / 3)}</b></td></tr>`; }).join('');

// ── «Оборона»: доля ценности целей, потерянная за волну (типовая ПВО), и всего целей уничтожено
const defRow = (k) => { const a = N.raidDef.waves[k], b = P.raidDef.waves[k]; return `<tr><td>${k.startsWith('east') ? 'Восток' : 'Запад'}, эпоха ${RANK[+k.slice(-1)]}</td>`
  + a.map((x, i) => `<td class="n">${pc(x.lost)} → <b>${pc(b[i].lost)}</b></td>`).join('') + `<td class="n">${f1(N.raidDef.deadTotal[k])} → <b>${f1(P.raidDef.deadTotal[k])}</b></td></tr>`; };
const defTable = Object.keys(N.raidDef.waves).map(defRow).join('');
// ── «Мульти-волна»
const multiTable = Object.keys(N.multi).filter((k) => k.includes('+')).map((k) => { const a = N.multi[k], b = P.multi[k];
  return `<tr><td>${k.startsWith('east') ? 'Восток' : 'Запад'}, уровень ${k[k.length - 5]}</td><td class="n">${pc(a.lost)} → <b>${pc(b.lost)}</b></td><td class="n">${f2(a.dead)} → <b>${f2(b.dead)}</b></td><td class="n">${pc(N.multi[k.replace('+ПВО', '')].lost)} → <b>${pc(P.multi[k.replace('+ПВО', '')].lost)}</b></td></tr>`; }).join('');

// ── варианты прочности
const V = J.variants || {};
const varRows = Object.keys(V).sort((a, b) => a - b).map((h) => { const v = V[h];
  const fr1 = loadStat(v.loads, 'Фронтовые', 1).m, fr4 = loadStat(v.loads, 'Фронтовые', 4).m, he = med([1, 2, 3, 4].map((e) => loadStat(v.loads, 'Вертолёты', e).m)), bo = med([1, 2, 3, 4].map((e) => loadStat(v.loads, 'Бомбардировщики', e).m));
  const dd = med(Object.values(v.raidDef.deadTotal)), ml = med(Object.entries(v.multi).filter(([k]) => k.includes('+')).map(([, x]) => x.lost));
  const fab = med(MED.map((o) => Math.ceil(h / 100)));
  return `<tr${+h === D.H_M ? ' class="rec"' : ''}><td>${h}${+h === D.H_M ? ' <small>предлагаю</small>' : ''}</td><td class="n">${Math.ceil(h * 0.75 / 100)} / ${fab} / ${Math.ceil(h * 1.25 / 100)} / ${Math.ceil(h * 1.5 / 100)}</td><td class="n">${f1(fr1)} · ${f1(fr4)}</td><td class="n">${f1(bo)}</td><td class="n">${f1(he)}</td><td class="n">${f1(dd)}</td><td class="n">${pc(ml)}</td></tr>`; }).join('');
const nowRow = (() => { const fr1 = loadStat(N.loads, 'Фронтовые', 1).m, fr4 = loadStat(N.loads, 'Фронтовые', 4).m, he = med([1, 2, 3, 4].map((e) => loadStat(N.loads, 'Вертолёты', e).m)), bo = med([1, 2, 3, 4].map((e) => loadStat(N.loads, 'Бомбардировщики', e).m));
  return `<tr class="now"><td>сейчас</td><td class="n">${onMed(N.table, 'fab500', 'exact')} (прочность 140–300)</td><td class="n">${f1(fr1)} · ${f1(fr4)}</td><td class="n">${f1(bo)}</td><td class="n">${f1(he)}</td><td class="n">${f1(med(Object.values(N.raidDef.deadTotal)))}</td><td class="n">${pc(med(Object.entries(N.multi).filter(([k]) => k.includes('+')).map(([, x]) => x.lost)))}</td></tr>`; })();

// ── вопросы к Mark (порядок — как в CLOUD_NOTES_balance.md)
const QUESTIONS = [
  { q: 'Прочность среднего объекта', opts: [
    { t: `200 ЕУ — 2 ФАБ-500 прямыми, как сейчас для 500-кг бомб; с промахом — 3–4. Тяжёлое оружие и вертолёты перестают сносить всё с одного раза`, rec: true },
    { t: '250 ЕУ — 3 ФАБ-500 прямыми: объекты заметно крепче во всех режимах' },
    { t: '300 ЕУ — 3 ФАБ-500 прямыми, с промахом 5–6: долгий бой, «Вылет» без правки целей не пройти' }] },
  { q: `«${tr('Вылет')}»: сколько целей в задании`, opts: [
    { t: 'По силе подвески: 1–3 цели (сильная подвеска — больше целей и очков)', rec: true },
    { t: `Всегда 3 цели, но «${tr('Реализм')}» даёт 2 пополнения вместо одного` },
    { t: 'Как сейчас: 3 цели и одно пополнение (слабым подвескам задание не закончить)' }] },
  { q: 'НАР по объектам', opts: [
    { t: 'Слабые (8 ЕУ с вертолёта): полный боекомплект вертолёта — 1–2 цели; по технике НАР — как сейчас', rec: true },
    { t: 'Как сейчас: вертолёт сносит 3 цели третью боекомплекта' }] },
  { q: 'Управляемое оружие и соседние постройки', opts: [
    { t: 'Весь удар — в постройку под прицелом, соседние на вид целы', rec: true },
    { t: 'Как неуправляемое: разбивает всё в радиусе' }] },
  { q: 'Склады: вторичные взрывы', opts: [
    { t: 'Только вид и звук, как сейчас', rec: true },
    { t: 'Ещё и урон объекту: взорвался склад — объект слабее' }] },
  { q: `«${tr('Мульти-волна')}»: насколько разрушительна волна`, opts: [
    { t: 'Пересчитать цены стендом и поднять бюджет так, чтобы типовая волна разрушала столько же, сколько сейчас', rec: true },
    { t: 'Бюджет 100 как есть: волна станет слабее (меньше половины ценности целей против ПВО)' }] },
  { q: 'Попутно найдено в ИИ налёта — исправить на этапе 2?', opts: [
    { t: 'Да: лазерные и ТВ-бомбы Востока эпох II–III и GBU-12 сбрасываются, когда цель вне поля зрения ГСН, — 43–99 % падают за 4–6 км; в волнах 1–2 все самолёты идут на одну цель из двух', rec: true },
    { t: 'Нет, оставить' }] },
];

// ── сводка «что сейчас»
const allOne = Object.values(N.table).filter((r) => Object.values(r.obj).every((c) => c.exact === 1)).map((r) => r.short);
const oneP = Object.values(P.table).filter((r) => Object.values(r.obj).every((c) => c.exact === 1)).map((r) => r.short);
const heliNow = [1, 2, 3, 4].map((e) => loadStat(N.loads, 'Вертолёты', e).m);
const raidNow = N.loads.filter((r) => r.raid && ['bomber', 'low'].includes(r.raid)).map((r) => r.first);
const raidProp = P.loads.filter((r) => r.raid && ['bomber', 'low'].includes(r.raid)).map((r) => r.first);
const R = N.raid;

const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Баланс удара по объектам</title>
<!-- Страница для решения Mark (облачная сессия cloud/strike-balance, 2026-10-29): эквивалент оружия и прочность объектов. Собрана скриптом
     tools/airdef-headless/strike-balance-page.js из замеров tools/airdef-headless/strike-balance-stand.js — руками не править.
     Подробности и вопросы — fortuna-bot-web/CLOUD_NOTES_balance.md. Шрифты — игры. -->
<style>
  @font-face { font-family: 'Oswald'; font-weight: 400 700; src: url(../../games/airdef/fonts/oswald-cyrillic.woff2) format('woff2'); unicode-range: U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116; }
  @font-face { font-family: 'Oswald'; font-weight: 400 700; src: url(../../games/airdef/fonts/oswald-latin.woff2) format('woff2'); unicode-range: U+0000-00FF, U+2000-206F; }
  @font-face { font-family: 'Golos Text'; font-weight: 400 800; src: url(../../games/airdef/fonts/golos-text-cyrillic.woff2) format('woff2'); unicode-range: U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116; }
  @font-face { font-family: 'Golos Text'; font-weight: 400 800; src: url(../../games/airdef/fonts/golos-text-latin.woff2) format('woff2'); unicode-range: U+0000-00FF, U+2000-206F; }
  @font-face { font-family: 'JetBrains Mono'; font-weight: 400 700; src: url(../../games/airdef/fonts/jetbrains-mono-cyrillic.woff2) format('woff2'); unicode-range: U+0400-045F; }
  @font-face { font-family: 'JetBrains Mono'; font-weight: 400 700; src: url(../../games/airdef/fonts/jetbrains-mono-latin.woff2) format('woff2'); unicode-range: U+0000-00FF; }
  :root { --bg: #10140f; --bg2: #141912; --line: #2f3828; --tx: #e9e6dc; --dim: #a9b09b; --ac: #e8b04a; --ac2: #f3c96f; --up: #e2574c; --dn: #6fbf73; }
  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body { margin: 0; background: var(--bg); color: var(--tx); font: 400 15px/1.5 'Golos Text', -apple-system, 'Segoe UI', sans-serif; }
  .wrap { max-width: 1160px; margin: 0 auto; padding: 22px max(16px, env(safe-area-inset-right)) 48px max(16px, env(safe-area-inset-left)); }
  h1 { font: 500 30px/1.1 'Oswald', sans-serif; margin: 0 0 6px; letter-spacing: .01em; }
  h2 { font: 500 21px/1.2 'Oswald', sans-serif; margin: 0 0 4px; }
  h3 { font: 500 16px 'Oswald', sans-serif; margin: 8px 0 0; color: var(--ac2); }
  p { margin: 0; max-width: 78ch; } .dim { color: var(--dim); } ul { margin: 0; padding-left: 20px; max-width: 80ch; } li { margin: 3px 0; }
  section { border-top: 1px solid var(--line); padding: 22px 0; display: grid; gap: 12px; }
  .tw { overflow-x: auto; border: 1px solid var(--line); background: var(--bg2); -webkit-overflow-scrolling: touch; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  caption { text-align: left; font: 500 16px 'Oswald', sans-serif; padding: 8px 10px; color: var(--ac2); border-bottom: 1px solid var(--line); }
  th { text-align: left; font-weight: 500; font-size: 12.5px; color: var(--dim); padding: 6px 10px; border-bottom: 1px solid var(--line); white-space: nowrap; vertical-align: bottom; }
  th small, td small { display: block; font-size: 11.5px; color: var(--dim); font-weight: 400; }
  td { padding: 6px 10px; border-bottom: 1px solid #1c2219; vertical-align: top; }
  .n { text-align: right; font-family: 'JetBrains Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.n b { color: var(--ac2); font-weight: 600; } th.n { font-family: inherit; text-align: right; }
  i { font-style: normal; font-size: 10px; display: inline-block; width: 12px; text-align: right; } .up { color: var(--ac); } .dn { color: #8fb3c9; } .eq { color: #6b7362; }
  tr.rec td { background: #1d2416; } tr.now td { color: var(--dim); }
  .sum { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: var(--line); border: 1px solid var(--line); }
  @media (max-width: 760px) { .sum { grid-template-columns: repeat(2, 1fr); } }
  .sum > div { background: var(--bg2); padding: 10px 12px; display: grid; gap: 2px; align-content: start; }
  .sum .big { font: 600 22px 'JetBrains Mono', monospace; color: var(--ac2); }
  .sum small { color: var(--dim); font-size: 13px; }
  .rule { border-left: 3px solid var(--ac); padding: 8px 12px; background: var(--bg2); display: grid; gap: 4px; max-width: 86ch; }
  .rule code { font-family: 'JetBrains Mono', monospace; color: var(--ac2); }
  .q { display: grid; gap: 4px; border: 1px solid var(--line); padding: 10px 12px; background: var(--bg2); }
  .q b { font-weight: 600; } .q .opt { color: var(--dim); } .q .opt b { color: var(--ac2); }
  .grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 520px), 1fr)); gap: 14px; align-items: start; }
  @media (max-width: 560px) { h1 { font-size: 25px; } table { font-size: 13px; } td, th { padding: 5px 7px; } }
</style></head><body><div class="wrap">
<h1>Баланс удара по объектам</h1>
<p class="dim">Эквивалент каждой бомбы и ракеты и прочность 22 целей трёх карт. Этап 1 — замеры и предложение, игра не менялась.
Стрелка <i class="up">▲</i> — объект держится дольше (больше попаданий или подвесок), <i class="dn">▼</i> — падает быстрее. Числа — стенд <code>strike-balance-stand.js</code> на настоящем расчёте урона игры.</p>

<section><h2>Что сейчас</h2>
<div class="sum">
  <div><span class="big">${allOne.length} из ${Object.keys(N.table).length}</span><small>видов оружия сносят любую из 22 целей одним попаданием: ${esc(allOne.slice(0, 6).join(', '))}…</small></div>
  <div><span class="big">${f1(med(heliNow))}</span><small>боекомплекта вертолёта хватает на задание из 3 целей — НАР сильнее бомб</small></div>
  <div><span class="big">${f1(Math.min(...raidNow))}–${f1(Math.max(...raidNow))}</span><small>объекта сносит один бомбардировщик налёта, если долетел</small></div>
  <div><span class="big">${f1(R.cep.bomb)} м</span><small>КВО свободных бомб у ИИ налёта (замер); спутниковых — ${R.missK.gps ? f1(R.missK.gps.cep) : '—'} м</small></div>
</div>
<p>Прочность объектов — 140–300, а урон прямым попаданием у ФАБ-1000 — 325, у тяжёлых крылатых — 250–375, у баллистики — 325–750. Поэтому ФАБ-1000, GBU-24, GBU-57,
тяжёлые крылатые и вся баллистика по объекту одинаковы: одно попадание — объект уничтожен. Смысла брать оружие сильнее нет, а слабое (НАР с самолёта,
ФАБ-100) — почти бесполезно.</p>
</section>

<section><h2>Эквивалент оружия</h2>
<div class="rule"><p><b>Единица удара (ЕУ): ФАБ-500 = 100.</b> Эквивалент — урон по объекту прямым попаданием.</p>
<p><code>E = 100 × R / 47</code>, где R — радиус поражения из arsenal.js. Он уже считается из тротила боевой части (R = 8 м × тротил<sup>⅓</sup>), значит
эквивалент растёт как корень кубический из взрывчатки: втрое больше взрывчатки — в 1,44 раза больше урона. Округление — до 5.</p>
<p>Рядом с постройкой — меньше (как сейчас: до 0,8 E, к краю радиуса — до нуля), по площадке у построек — ×0,4. Исключения: НАР — 8 с вертолёта и 5 с самолёта
(малые боевые части, ими бьют технику), ОФАБ-250 — 80 (взрывчатки как у ФАБ-250, радиус больше за счёт осколков), GBU-57 — 250 (2,4 т взрывчатки
проникающей части, на поверхности радиус 52 м)${D.EQ_FIX.jassm ? ', JASSM — как Storm Shadow, Х-59МК2 — как Х-59М (та же боевая часть)' : ''}. По технике урон оружия не меняется.</p>
<p>«По делу» — сколько ЕУ в среднем доходит до объекта с промахом (свободные бомбы — КВО ${f1(J.now.cepBomb)} м, как у ИИ). Так видно, зачем качать: КАБ-500С по делу сильнее ФАБ-500, хотя заряд тот же.</p></div>
<div class="grid2">${wTables}</div>
</section>

<section><h2>Прочность объектов</h2>
<div class="rule"><p><b>Прочность — по размеру:</b> средний объект — ${D.H_M} ЕУ (${Math.ceil(D.H_M / 100)} ФАБ-500 прямыми), малый ×0,75, укреплённый (КП) ×1,25, крупный ×1,5.
Объект уничтожен, когда кончилась общая прочность. «Все главные постройки разбиты» больше не убивает объект.</p></div>
<div class="tw"><table><thead><tr><th>Объект</th><th>Класс</th><th class="n">Прочность<small>сейчас → ЕУ</small></th>
<th class="n">ФАБ-500<small>прямыми · разлётом</small></th><th class="n">Mk 82</th><th class="n">Hellfire</th><th class="n">Х-55</th></tr></thead><tbody>${objRows}</tbody></table></div>
</section>

<section><h2>Режимы</h2>
<h3>${tr('Вылет')}: подвесок на задание из 3 целей</h3>
<p class="dim">Задание — 3 случайные цели одной карты, оружие — по очереди, с разлётом как у ИИ. «${tr('Реализм')}» даёт 2 подвески (своя и пополнение), «${tr('Аркада')}» — 3.
Медиана по готовым подвескам ранга, ниже — разброс. Охота за ПВО не считается.</p>
<div class="tw"><table><thead><tr><th>Подвески</th><th class="n">Ранг I</th><th class="n">Ранг II</th><th class="n">Ранг III</th><th class="n">Ранг IV</th></tr></thead><tbody>${loadTable}</tbody></table></div>
<p>Заход ИИ: от начала волны до первого сброса — ${f1(R.pass.first)} с, повторный заход — ${f1(R.pass.again)} с. Значит, ещё одна подвеска — это минуты боя: полёт за пополнением и новые заходы.</p>

<h3>${tr('Оборона')}: доля ценности целей, потерянная за волну</h3>
<p class="dim">Налёты ИИ по правилам режима (волны 3, 4, 6, 7, 9, 11 самолётов, цели 2–3), против типовой ПВО своей эпохи. Последняя колонка — сколько целей карты уничтожено за 6 волн.</p>
<div class="tw"><table><thead><tr><th>Налёт</th>${[1, 2, 3, 4, 5, 6].map((w) => `<th class="n">Волна ${w}</th>`).join('')}<th class="n">Целей за бой</th></tr></thead><tbody>${defTable}</tbody></table></div>

<h3>${tr('Мульти-волна')}: типовая волна ИИ по 3 целям</h3>
<div class="tw"><table><thead><tr><th>Волна</th><th class="n">Уничтожено ценности<small>против ПВО</small></th><th class="n">Целей добито<small>из 3</small></th><th class="n">Без ПВО</th></tr></thead><tbody>${multiTable}</tbody></table></div>
<p>Сила оружия меняется — цены «Мульти-волны» нужно пересчитать тем же стендом (multi-price-stand.js) на этапе 2.</p>

<h3>Насколько крепкими сделать объекты</h3>
<p class="dim">Тот же замер при разной прочности среднего объекта. Вылет — подвесок на 3 цели (фронтовые ранга I · ранга IV), Оборона — целей уничтожено за бой, Мульти-волна — доля против ПВО.</p>
<div class="tw"><table><thead><tr><th>Средний объект, ЕУ</th><th class="n">ФАБ-500 прямыми<small>малый / средний / КП / крупный</small></th><th class="n">${tr('Вылет')}, фронтовые<small>ранг I · IV</small></th><th class="n">Бомбардировщики</th><th class="n">Вертолёты</th><th class="n">${tr('Оборона')}<small>целей за бой</small></th><th class="n">${tr('Мульти-волна')}</th></tr></thead><tbody>${nowRow}${varRows}</tbody></table></div>
</section>

<section><h2>Цели «${tr('Вылет')}а» по силе подвески</h2>
<div class="rule"><p>Сейчас целей всегда 3, а подвески разные: у МиГ-21 — 2 ФАБ-500 (200 ЕУ), у Ту-16 — 980 ЕУ. Предлагаю: <b>целей — по силе подвески</b>,
одна цель на каждые ${D.TGT_K * D.H_M} ЕУ (с округлением), от 1 до 3. Тогда любой подвеске нужно около 1–1,5 подвески на задание, а сильная подвеска приносит больше целей —
и больше очков. Это и есть смысл качать оружие.</p></div>
<details><summary>Все готовые подвески</summary><div class="tw"><table><thead><tr><th>Подвеска</th><th class="n">Сейчас<small>урон прямыми</small></th><th class="n">ЕУ</th><th class="n">Подвесок на 3 цели<small>сейчас → будет</small></th><th class="n">Целей</th><th class="n">Подвесок<small>на задание</small></th></tr></thead><tbody>${loadList}</tbody></table></div></details>
</section>

<section><h2>Как будет выглядеть разрушение</h2>
<ul>
<li><b>Урон — в общую прочность</b> объекта: эквивалент × близость разрыва к постройке. Объект уничтожен, когда прочность кончилась.</li>
<li><b>Неуправляемое</b> (бомбы, НАР, баллистика с КВО): разбивает на вид постройки в области разрыва — каждая постройка в радиусе копит урон, как сейчас, и становится руинами, когда накопила свою долю прочности.</li>
<li><b>Управляемое</b> (лазерные, ТВ, спутниковые, ракеты, крылатые): весь удар — в постройку под точкой прицела, соседние не задевает. Игрок сам выбирает, что разбить; на гибель объекта выбор не влияет — эквивалент тот же.</li>
<li><b>Главные постройки</b> — точка прицела ИИ, «Мульти-волны» и контейнера; при гибели объекта главные становятся руинами (как сейчас). Остальное — как разбили.</li>
<li><b>Склады (вторичные взрывы)</b> — как сейчас: серия разрывов при разрушении постройки, только вид и звук.</li>
<li><b>Онлайн</b> — без изменений: маска разбитых построек (до 31 на объект), событие «постройка разбита»; сервер считает тем же sim/strike.js.</li>
</ul>
</section>

<section><h2>Нужно решить</h2>
${QUESTIONS.map((q, i) => `<div class="q"><b>${i + 1}. ${esc(q.q)}</b>${q.opts.map((o) => `<div class="opt">${o.rec ? '<b>' : ''}${esc(o.t)}${o.rec ? ' — предлагаю</b>' : ''}</div>`).join('')}</div>`).join('')}
</section>

<p class="dim">Замер: ${esc(J.stamp || '')}. Стенд: <code>deno run -A tools/airdef-headless/strike-balance-stand.js all</code>, страница: <code>strike-balance-page.js</code>.</p>
</div></body></html>
`;
Deno.writeTextFileSync(dir + '../airdef-ui/strike-balance.html', html);
console.log('→ tools/airdef-ui/strike-balance.html');
