// Страница для Mark — tools/airdef-ui/strike-balance.html — «было → стало» по замерам стенда strike-balance-stand.js (strike-balance.json:
// before — игра до баланса удара на online-dev 6caf37d, now — после, этап 2 2026-11-01).
//   deno run -A tools/airdef-headless/strike-balance-page.js
// Названия оружия, объектов, режимов и подвесок — из модулей игры (arsenal.js, карты, строки tr()), числа — из замера; руками не править.
const dir = new URL('.', import.meta.url).pathname;
(0, eval)(Deno.readTextFileSync(dir + '../drone-headless/three.min.js'));
const VQ = Deno.readTextFileSync(dir + '../../games/airdef/sim/strike.js').match(/arsenal\.js(\?v=\w+)/)[1];
const G = (p) => import(`../../games/airdef/${p}${VQ}`);
const { AG, LOADOUTS, loadoutRole, STRIKE_TGT_EU } = await G('arsenal.js');
const { OBJ_HP } = await G('city.js');
const { tr } = await G('i18n.js');
const J = JSON.parse(Deno.readTextFileSync(dir + 'strike-balance.json'));
const B = J.before, N = J.now;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const f1 = (v) => (v === null || v === undefined ? '—' : (Math.round(v * 10) / 10).toLocaleString('ru-RU'));
const f2 = (v) => (v === null || v === undefined ? '—' : v.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const pc = (v) => (v === null || v === undefined ? '—' : Math.round(v * 100) + ' %');
const med = (a) => { const s = a.filter((v) => v !== null && v !== undefined).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
// ▲ — больше попаданий / подвесок (объект держится дольше), ▼ — меньше
const arrow = (a, b) => { if (a === null || b === null || a === undefined || b === undefined || Math.abs(a - b) < 1e-9) return '<i class="eq">=</i>'; const up = b > a; return `<i class="${up ? 'up' : 'dn'}">${up ? '▲' : '▼'}</i>`; };
const cap = (n) => (n > 120 ? '>120' : String(n));
const RANK = ['', 'I', 'II', 'III', 'IV'];

// ── объекты: класс по прочности (city.js OBJ_HP)
const CLS = { [OBJ_HP.S]: 'малый', [OBJ_HP.M]: 'средний', [OBJ_HP.F]: 'укреплённый', [OBJ_HP.L]: 'крупный' };
const objId = (o) => o.map + ':' + o.key;
const hpNow = Object.fromEntries(N.objects.map((o) => [objId(o), o.hp]));
const MED = N.objects.filter((o) => o.hp === OBJ_HP.M); // средние объекты — «на средний объект»
const onMed = (T, k, f) => med(MED.map((o) => (T[k] && T[k].obj[objId(o)] ? T[k].obj[objId(o)][f] : null)));

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
const wName = (k) => { const [key, at] = k.split('@'), W = AG[key]; return esc(W.short) + (at === 'plane' ? ' <small>с самолёта</small>' : key === 'sdb' ? ' <small>с F-16</small>' : '') + (W.side ? ` <small>${W.side === 'east' ? 'Восток' : 'Запад'}, ранг ${RANK[W.era]}</small>` : ''); };
function weaponRows(keys) {
  return keys.filter((k) => B.table[k] && N.table[k]).map((k) => {
    const b = B.table[k], n = N.table[k], was = Math.round(b.dmg * 1.25);
    const ex0 = onMed(B.table, k, 'exact'), ex1 = onMed(N.table, k, 'exact'), sc0 = onMed(B.table, k, 'mean'), sc1 = onMed(N.table, k, 'mean');
    return `<tr><td>${wName(k)}</td><td class="n">${n.blast}</td><td class="n">${was}</td><td class="n"><b>${n.eq}</b></td><td class="n">${Math.round(n.eq * (n.eff ?? 1))}</td>`
      + `<td class="n">${cap(ex0)} → <b>${cap(ex1)}</b>${arrow(ex0, ex1)}</td><td class="n">${f1(sc0)} → <b>${f1(sc1)}</b>${arrow(sc0, sc1)}</td></tr>`;
  }).join('');
}
const wTables = GROUPS.map(([g, keys]) => `<div class="tw"><table><caption>${esc(g)}</caption><thead><tr><th>Оружие</th><th class="n">Радиус, м</th><th class="n">Было<small>урон прямым</small></th>`
  + `<th class="n">Эквивалент<small>ЕУ</small></th><th class="n">По делу<small>с промахом, ЕУ</small></th><th class="n">На средний объект<small>прямыми: было → стало</small></th><th class="n">С разлётом<small>было → стало</small></th></tr></thead><tbody>${weaponRows(keys)}</tbody></table></div>`).join('');

// ── объекты
const objRows = B.objects.map((o) => {
  const id = objId(o), c = (T, k, f) => T[k].obj[id][f];
  return `<tr><td>${esc(o.name)}<small>${esc(o.mname)}</small></td><td>${CLS[hpNow[id]] || '—'}</td><td class="n">${o.hp} → <b>${hpNow[id]}</b></td>`
    + ['fab500', 'mk82', 'hellfire', 'kh55'].map((k) => `<td class="n">${cap(c(B.table, k, 'exact'))} → <b>${cap(c(N.table, k, 'exact'))}</b><small>${f1(c(B.table, k, 'mean'))} → ${f1(c(N.table, k, 'mean'))}</small></td>`).join('') + '</tr>';
}).join('');

// ── «Вылет»: подвески
const HEAVY = new Set(['e_tu16', 'e_tu22', 'e_m4', 'e_tu22m2', 'e_tu22m3', 'e_tu95', 'e_b52', 'e_b1b', 'e_b2', 'e_tu160', 'e_vulcan', 'e_il28', 'e_t4']);
const catOf = (r) => { const L = LOADOUTS[r.era][r.i]; if (!L || loadoutRole(L) === 'sead') return null; return r.heli ? 'Вертолёты' : HEAVY.has(r.plane) ? 'Бомбардировщики' : 'Фронтовые'; };
const stat = (rows, cat, era, f) => { const L = rows.filter((r) => !r.raid && r.era === era && catOf(r) === cat).map((r) => r[f]); return { m: med(L), lo: L.length ? Math.min(...L) : null, hi: L.length ? Math.max(...L) : null }; };
const loadTable = ['Фронтовые', 'Бомбардировщики', 'Вертолёты'].map((c) => `<tr><td>${c}</td>` + [1, 2, 3, 4].map((e) => {
  const a = stat(B.loads, c, e, 'loads'), b = stat(N.loads, c, e, 'mission'), t = stat(N.loads, c, e, 'nT');
  return `<td class="n">${f1(a.m)} → <b>${f1(b.m)}</b>${arrow(a.m, b.m)}<small>${f1(b.lo)}–${f1(b.hi)} · целей ${t.lo === t.hi ? t.lo : `${t.lo}–${t.hi}`}</small></td>`; }).join('') + '</tr>').join('');
const loadList = N.loads.filter((r) => !r.raid && catOf(r)).map((r) => { const b = B.loads.find((q) => !q.raid && q.era === r.era && q.i === r.i);
  return `<tr><td>${esc(tr(r.name))}<small>${catOf(r)}, ранг ${RANK[r.era]}</small></td><td class="n">${b ? f1(b.loads) : '—'}</td><td class="n"><b>${r.eu}</b></td><td class="n">${r.nT}</td><td class="n"><b>${f1(r.mission)}</b></td><td class="n">${f1(r.loads)}</td></tr>`; }).join('');

// ── «Оборона» и «Мульти-волна»
const side = (k) => (k.startsWith('east') ? 'Восток' : 'Запад');
const defTable = Object.keys(B.raidDef.waves).map((k) => { const a = B.raidDef.waves[k], b = N.raidDef.waves[k];
  return `<tr><td>${side(k)}, эпоха ${RANK[+k.slice(-1)]}</td>` + a.map((x, i) => `<td class="n">${pc(x.lost)} → <b>${pc(b[i].lost)}</b></td>`).join('') + `<td class="n">${f1(B.raidDef.deadTotal[k])} → <b>${f1(N.raidDef.deadTotal[k])}</b></td></tr>`; }).join('');
const multiTable = Object.keys(B.multi).filter((k) => k.includes('+')).map((k) => { const a = B.multi[k], b = N.multi[k], k0 = k.replace('+ПВО', '');
  return `<tr><td>${side(k)}, уровень ${k0.slice(-1)}</td><td class="n">${pc(a.lost)} → <b>${pc(b.lost)}</b></td><td class="n">${f2(a.dead)} → <b>${f2(b.dead)}</b></td><td class="n">${pc(B.multi[k0].lost)} → <b>${pc(N.multi[k0].lost)}</b></td></tr>`; }).join('');
const MP = J.multiPrices || null; // цены «Мульти-волны»: { budget0, budget, fair0, fair, atk: {ключ: [было, стало]} }
const priceRows = MP ? Object.entries(MP.atk).map(([k, [a, b]]) => `<tr><td>${esc(AG[k].short)}<small>${AG[k].side === 'east' ? 'Восток' : 'Запад'}</small></td><td class="n">${a}</td><td class="n"><b>${b}</b></td></tr>`).join('') : '';

// ── сводка
const oneShot = (T) => Object.values(T).filter((r) => Object.values(r.obj).every((c) => c.exact === 1)).map((r) => r.short);
const heli = (rows, f) => med([1, 2, 3, 4].map((e) => stat(rows, 'Вертолёты', e, f).m));
const raidK = (rows) => rows.filter((r) => r.raid && ['bomber', 'low'].includes(r.raid)).map((r) => r.first);
const lost = (R, k) => (R.raid && R.raid.missK[k] ? R.raid.missK[k].lost : null);
const exc = Object.entries(AG).filter(([, W]) => W.eq !== undefined).map(([, W]) => `${esc(W.short)} — ${W.eq}${W.planeEq ? ` (с самолёта ${W.planeEq})` : ''}`).join(', ');
const one1 = oneShot(N.table);

const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Баланс удара по объектам</title>
<!-- Страница для Mark (облачная сессия cloud/strike-balance, этап 2 — 2026-11-01): эквивалент оружия и прочность объектов, «было → стало».
     Собрана скриптом tools/airdef-headless/strike-balance-page.js из замеров tools/airdef-headless/strike-balance-stand.js — руками не править.
     Подробности — fortuna-bot-web/CLOUD_NOTES_balance.md. Шрифты — игры. -->
<style>
  @font-face { font-family: 'Oswald'; font-weight: 400 700; src: url(../../games/airdef/fonts/oswald-cyrillic.woff2) format('woff2'); unicode-range: U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116; }
  @font-face { font-family: 'Oswald'; font-weight: 400 700; src: url(../../games/airdef/fonts/oswald-latin.woff2) format('woff2'); unicode-range: U+0000-00FF, U+2000-206F; }
  @font-face { font-family: 'Golos Text'; font-weight: 400 800; src: url(../../games/airdef/fonts/golos-text-cyrillic.woff2) format('woff2'); unicode-range: U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116; }
  @font-face { font-family: 'Golos Text'; font-weight: 400 800; src: url(../../games/airdef/fonts/golos-text-latin.woff2) format('woff2'); unicode-range: U+0000-00FF, U+2000-206F; }
  @font-face { font-family: 'JetBrains Mono'; font-weight: 400 700; src: url(../../games/airdef/fonts/jetbrains-mono-cyrillic.woff2) format('woff2'); unicode-range: U+0400-045F; }
  @font-face { font-family: 'JetBrains Mono'; font-weight: 400 700; src: url(../../games/airdef/fonts/jetbrains-mono-latin.woff2) format('woff2'); unicode-range: U+0000-00FF; }
  :root { --bg: #10140f; --bg2: #141912; --line: #2f3828; --tx: #e9e6dc; --dim: #a9b09b; --ac: #e8b04a; --ac2: #f3c96f; }
  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body { margin: 0; background: var(--bg); color: var(--tx); font: 400 15px/1.5 'Golos Text', -apple-system, 'Segoe UI', sans-serif; }
  .wrap { max-width: 1160px; margin: 0 auto; padding: 22px max(16px, env(safe-area-inset-right)) 48px max(16px, env(safe-area-inset-left)); }
  h1 { font: 500 30px/1.1 'Oswald', sans-serif; margin: 0 0 6px; letter-spacing: .01em; }
  h2 { font: 500 21px/1.2 'Oswald', sans-serif; margin: 0 0 4px; }
  h3 { font: 500 16px 'Oswald', sans-serif; margin: 8px 0 0; color: var(--ac2); }
  p { margin: 0; max-width: 78ch; } .dim { color: var(--dim); } ul { margin: 0; padding-left: 20px; max-width: 80ch; } li { margin: 3px 0; }
  code { font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: .92em; }
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
  .sum { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: var(--line); border: 1px solid var(--line); }
  @media (max-width: 760px) { .sum { grid-template-columns: repeat(2, 1fr); } }
  .sum > div { background: var(--bg2); padding: 10px 12px; display: grid; gap: 2px; align-content: start; }
  .sum .big { font: 600 22px 'JetBrains Mono', monospace; color: var(--ac2); }
  .sum small { color: var(--dim); font-size: 13px; }
  .rule { border-left: 3px solid var(--ac); padding: 8px 12px; background: var(--bg2); display: grid; gap: 4px; max-width: 86ch; }
  .rule code { color: var(--ac2); }
  .grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 520px), 1fr)); gap: 14px; align-items: start; }
  details > summary { cursor: pointer; color: var(--ac2); font-weight: 500; padding: 4px 0; }
  @media (max-width: 560px) { h1 { font-size: 25px; } table { font-size: 13px; } td, th { padding: 5px 7px; } }
</style></head><body><div class="wrap">
<h1>Баланс удара по объектам</h1>
<p class="dim">Эквивалент каждой бомбы и ракеты, прочность 22 целей трёх карт и что от этого поменялось в режимах. Этап 2 — в игре (ветка
<code>cloud/strike-balance</code>, ждёт проверки главной сессией). «Было» — игра до правки на свежем online-dev, «стало» — после.
Стрелка <i class="up">▲</i> — объект держится дольше, <i class="dn">▼</i> — падает быстрее.</p>

<section><h2>Главное</h2>
<div class="sum">
  <div><span class="big">${oneShot(B.table).length} → ${one1.length}</span><small>видов оружия сносят любую цель одним попаданием${one1.length ? ' (' + esc(one1.join(', ')) + ')' : ''}; GBU-57 — ${Object.values(N.table.gbu57.obj).filter((c) => c.exact === 1).length} из 22 (малые и средние)</small></div>
  <div><span class="big">${f1(heli(B.loads, 'loads'))} → ${f1(heli(N.loads, 'mission'))}</span><small>боекомплекта вертолёта на задание (было — 3 цели, стало — по силе подвески)</small></div>
  <div><span class="big">${f1(Math.min(...raidK(B.loads)))}–${f1(Math.max(...raidK(B.loads)))} → ${f1(Math.min(...raidK(N.loads)))}–${f1(Math.max(...raidK(N.loads)))}</span><small>объекта сносит один бомбардировщик налёта, если долетел</small></div>
  <div><span class="big">${pc(lost(B, 'tvb'))} → ${pc(lost(N, 'tvb'))}</span><small>ТВ-бомб ИИ налёта падает мимо (лазерных — ${pc(lost(B, 'lgb'))} → ${pc(lost(N, 'lgb'))})</small></div>
</div>
</section>

<section><h2>Эквивалент оружия</h2>
<div class="rule"><p><b>Единица удара (ЕУ): ФАБ-500 = 100.</b> Эквивалент — урон по объекту прямым попаданием, в досье оружия — «Удар (ФАБ-500 = 100)».</p>
<p><code>E = 100 × R / 47</code>, R — радиус поражения из arsenal.js (он считается из тротила боевой части): втрое больше взрывчатки — в 1,44 раза больше урона.
Рядом с постройкой — меньше (до 0,8 E, к краю радиуса — к нулю), по площадке у построек — ×0,4. Исключения (своё <code>eq</code>): ${exc}.
По технике и ЗРК урон оружия прежний.</p>
<p>«По делу» — сколько в среднем доходит до объекта с промахом (свободные бомбы — КВО ${f1(N.cepBomb)} м, как у ИИ): точное оружие той же
мощности — сильнее, в этом и смысл качать.</p></div>
<div class="grid2">${wTables}</div>
</section>

<section><h2>Прочность объектов</h2>
<div class="rule"><p><b>По размеру:</b> малый — ${OBJ_HP.S}, средний — ${OBJ_HP.M} (2 ФАБ-500 прямыми), укреплённый (КП) — ${OBJ_HP.F}, крупный — ${OBJ_HP.L} ЕУ.
Объект уничтожен, когда кончилась общая прочность; «все главные постройки разбиты» больше не убивает объект.</p></div>
<div class="tw"><table><thead><tr><th>Объект</th><th>Класс</th><th class="n">Прочность<small>было → ЕУ</small></th>
<th class="n">ФАБ-500<small>прямыми · разлётом</small></th><th class="n">Mk 82</th><th class="n">Hellfire</th><th class="n">Х-55</th></tr></thead><tbody>${objRows}</tbody></table></div>
</section>

<section><h2>Режимы</h2>
<h3>«${tr('Вылет')}»: подвесок на задание</h3>
<p class="dim">Было — 3 цели всегда, стало — целей по силе подвески (одна на ${STRIKE_TGT_EU} ЕУ, от 1 до 3; на брифинге и в кнопке подвески — «целей: N — по силе
подвески»). Оружие с разлётом как у ИИ. «${tr('Реализм')}» даёт 2 подвески, «${tr('Аркада')}» — 3. Медиана по готовым подвескам ранга, ниже — разброс и число целей.
Опыт за выполненное задание — как за прежние 3 цели при любом их числе.</p>
<div class="tw"><table><thead><tr><th>Подвески</th><th class="n">Ранг I</th><th class="n">Ранг II</th><th class="n">Ранг III</th><th class="n">Ранг IV</th></tr></thead><tbody>${loadTable}</tbody></table></div>
<details><summary>Все готовые подвески</summary><div class="tw"><table><thead><tr><th>Подвеска</th><th class="n">Было<small>подвесок на 3 цели</small></th><th class="n">ЕУ<small>сила подвески</small></th><th class="n">Целей</th><th class="n">Подвесок<small>на задание</small></th><th class="n">На 3 цели</th></tr></thead><tbody>${loadList}</tbody></table></div></details>

<h3>«${tr('Оборона')}»: доля ценности целей, потерянная за волну</h3>
<p class="dim">Налёты ИИ по правилам режима (волны 3, 4, 6, 7, 9, 11 самолётов, цели 2–3) против типовой ПВО своей эпохи. Последняя колонка — целей карты уничтожено за 6 волн.
В «стало» — и исправленный ИИ: волны 1–2 бьют обе цели, управляемые бомбы не теряются, поэтому первые волны стали опаснее.</p>
<div class="tw"><table><thead><tr><th>Налёт</th>${[1, 2, 3, 4, 5, 6].map((w) => `<th class="n">Волна ${w}</th>`).join('')}<th class="n">Целей за бой</th></tr></thead><tbody>${defTable}</tbody></table></div>

<h3>«${tr('Мульти-волна')}»: типовая волна ИИ по 3 целям</h3>
<div class="tw"><table><thead><tr><th>Волна</th><th class="n">Уничтожено ценности<small>против ПВО</small></th><th class="n">Целей добито<small>из 3</small></th><th class="n">Без ПВО</th></tr></thead><tbody>${multiTable}</tbody></table></div>
${MP ? `<p>Цены — заново по измеренной силе (стенд multi-price-stand.js, с сетью ПВО), бюджет волны <b>${MP.budget0} → ${MP.budget}</b>: случайный состав игрока
по ценам разрушает ${f1(MP.fair0)} ценности (было) и ${f1(MP.fair)} (стало). ПВО — 2500, как было.</p>
<details><summary>Цены удара: было → стало</summary><div class="tw"><table><thead><tr><th>Единица</th><th class="n">Было</th><th class="n">Стало</th></tr></thead><tbody>${priceRows}</tbody></table></div></details>` : ''}
</section>

<section><h2>Как выглядит разрушение</h2>
<ul>
<li><b>Урон — в общую прочность</b> объекта: эквивалент × близость разрыва к постройке. Объект уничтожен, когда прочность кончилась.</li>
<li><b>Неуправляемое</b> (свободные бомбы, НАР, баллистика с большим КВО — Р-17, «Точка-У», Lance): каждая постройка в радиусе копит урон и становится руинами,
когда накопила свою долю прочности — разрушение области.</li>
<li><b>Управляемое</b> (лазерные, ТВ, спутниковые, ракеты, крылатые, дроны, точная баллистика): весь удар — в постройку под точкой прицела, соседние целы.</li>
<li><b>Главные постройки</b> — точка прицела ИИ, «Мульти-волны» и контейнера; при гибели объекта — руины. Разбиты все, а прочность осталась — бьют по руинам.</li>
<li><b>Склады</b> — вторичные взрывы как были: только вид и звук. <b>Онлайн</b> — та же маска разбитых построек (до 31), событие «постройка разбита».</li>
</ul>
</section>

<p class="dim">Замер: было — ${esc(B.stamp || '')}, стало — ${esc(N.stamp || '')}. Стенд: <code>deno run -A tools/airdef-headless/strike-balance-stand.js all</code>
(быстрая проверка — <code>… check</code>), страница — <code>strike-balance-page.js</code>.</p>
</div></body></html>
`;
Deno.writeTextFileSync(dir + '../airdef-ui/strike-balance.html', html);
console.log('→ tools/airdef-ui/strike-balance.html');
