// Экран «Исследования» (AIRDEF_PROGRESSION.md §7, §11; макет tools/airdef-ui/progress-mock.html, вариант 1 — досье справа):
// ветки сверху, стороны слева (нейтрально), колонки — ранги I–IV, линии — от предыдущей единицы к следующей, карточка —
// модель, название, ранг, цена; строка паритета над колонкой. Тап — досье: игровые ТТХ, аналог другой стороны,
// «Исследовать» / «Сделать целью» / «Купить». Тратит сервер (progress-net.js → airdef-progress).
import { NODE, BRANCHES, SIDES, SIDE_NAME, RANKS, RANK_NAME, nodesOf, owned, researched, rankOpen, rankBlock, canBuy, canResearch, cardStats, pairOf, unitType, treeLayout } from './progress.js?v=20261022w';
import { SAM, AG, ERAS, LOADOUTS } from './arsenal.js?v=20261022w';
import { ico } from './icons.js?v=20261022w';
import { XP, SV, trMsg } from './progress-net.js?v=20261022w';
import { tr, trIf, LANG } from './i18n.js?v=20261022w';

const CSS = `
#research { position: fixed; inset: 0; z-index: 40; display: none; background: #10140f; color: #e9e6dc; font: 13px 'IBM Plex Sans', -apple-system, sans-serif; overflow: hidden;
  --rt: calc(var(--sa-t, 0px) + var(--tg-t, 0px)); --hh: 58px; --cw: 184px; --ch: 82px; --gx: 26px; --gy: 14px; --line: #39422f; --line2: #2c3426; --ac: #e8b04a; --ac2: #f3c96f; --dim: #b3baa5; --dim2: #8f9884; --ok: #86c06c; --xp: #9fd3ff; }
#research.on { display: block; }
#research .ic { width: 1.15em; height: 1.15em; vertical-align: -0.17em; flex: none; }
#research .rbg { position: absolute; inset: 0; background: url(airdef/shots/s400-unit.webp) center/cover; filter: blur(14px) brightness(.32) saturate(.7); transform: scale(1.06); }
#research .top { position: absolute; left: 0; right: 0; top: var(--rt); height: var(--hh); display: flex; align-items: center; gap: 14px; padding: 0 18px; padding-left: max(18px, var(--sa-l, 0px)); background: linear-gradient(#0b0e0a, rgba(11,14,10,.86)); z-index: 5; }
#research::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: var(--rt); background: #0b0e0a; z-index: 5; }
#research .back { font: 400 22px 'Russo One'; color: #e9e6dc; border: 0; background: none; width: 34px; cursor: pointer; }
#research .top h1 { margin: 0; font: 400 19px 'Russo One'; letter-spacing: .02em; }
#research .btabs { display: flex; margin-left: 10px; } #research .btabs button { border: 1px solid transparent; background: none; color: var(--dim); padding: 7px 13px; font: 500 14px 'IBM Plex Sans'; cursor: pointer; }
#research .btabs button.on { color: #e9e6dc; border-color: #e9e6dc; } #research .btabs button i { font-style: normal; color: var(--dim2); font: 600 10.5px 'IBM Plex Mono', monospace; margin-left: 5px; }
#research .cur { display: flex; gap: 18px; margin-left: auto; font: 600 16px 'IBM Plex Mono', monospace; padding-right: var(--sa-r, 0px); } #research .cur span { display: flex; align-items: center; gap: 6px; } #research .cur .xp { color: var(--xp); }
#research .sides { position: absolute; left: 0; top: calc(var(--rt) + var(--hh)); bottom: 0; width: 122px; padding: 22px 0 0 14px; padding-left: max(14px, var(--sa-l, 0px)); display: flex; flex-direction: column; gap: 10px; z-index: 4; }
#research .sides button { border: 0; background: rgba(16,20,15,.88); color: var(--dim); height: 74px; text-align: left; padding: 0 12px; font: 400 15px 'Russo One'; border-left: 3px solid transparent; cursor: pointer; }
#research .sides button small { display: block; font: 500 11px 'IBM Plex Sans'; color: var(--dim2); margin-top: 3px; } #research .sides button.on { background: rgba(233,230,220,.12); color: #e9e6dc; border-left-color: #e9e6dc; }
#research .note { position: absolute; left: 18px; bottom: 14px; width: 114px; font-size: 11px; color: var(--dim2); line-height: 1.35; z-index: 4; }
#research .note b { color: var(--ac2); font-weight: 600; }
#research .wrap { position: absolute; left: 128px; top: calc(var(--rt) + var(--hh)); right: 290px; bottom: 0; overflow: auto; -webkit-overflow-scrolling: touch; }
#research .tree { position: relative; padding: 0 30px 40px 6px; }
#research .ranks { position: sticky; top: 0; z-index: 3; display: flex; gap: var(--gx); padding: 12px 0 10px 18px; background: linear-gradient(rgba(16,20,15,.95) 70%, rgba(16,20,15,0)); }
#research .rh { width: var(--cw); flex: none; } #research .rh b { font: 400 17px 'Russo One'; } #research .rh span { color: var(--dim); font-size: 12px; margin-left: 6px; }
#research .rh .par { font-size: 11.5px; color: var(--dim); margin-top: 2px; } #research .rh .par b { font: 600 11.5px 'IBM Plex Sans'; color: var(--ac2); } #research .rh .par.okk { color: var(--ok); }
#research svg.links { position: absolute; left: 0; top: 0; pointer-events: none; overflow: visible; } #research svg.links path { fill: none; stroke: #8d9585; stroke-width: 2; } #research svg.links path.lock { stroke: #69725f; }
#research .shade { position: absolute; top: 0; bottom: 0; background: repeating-linear-gradient(135deg, rgba(0,0,0,.18) 0 12px, rgba(0,0,0,.08) 12px 24px); pointer-events: none; }
#research .card { position: absolute; border-radius: 0; padding: 0; box-shadow: none; max-height: none; animation: none; width: var(--cw); height: var(--ch); background: linear-gradient(160deg, #39403a 0, #22271f 55%, #151a12 100%); border: 1px solid #0a0c09; cursor: pointer; overflow: hidden; }
#research .card img { position: absolute; left: -6px; top: 6px; width: 74%; height: 92%; object-fit: contain; object-position: left center; }
#research .card .nm { position: absolute; right: 7px; top: 4px; font: 400 13.5px 'Russo One'; text-shadow: 0 1px 3px #000; max-width: 62%; text-align: right; }
#research .card .rk { position: absolute; right: 7px; bottom: 2px; font: 400 18px 'Russo One'; color: #d9d6cb; text-shadow: 0 1px 3px #000; }
#research .card .pr { position: absolute; left: 6px; bottom: 5px; display: flex; align-items: center; gap: 5px; font: 600 13.5px 'IBM Plex Mono', monospace; text-shadow: 0 1px 3px #000; padding: 1px 6px 1px 3px; background: rgba(10,12,9,.62); }
#research .card .pr.xp { color: var(--xp); } #research .card .pr.sv { color: #eceae2; } #research .card .pr.no { color: var(--dim2); }
#research .card .bar { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: rgba(0,0,0,.4); } #research .card .bar i { position: absolute; left: 0; top: 0; bottom: 0; background: var(--xp); }
#research .card .tag { position: absolute; left: 6px; top: 5px; font: 600 9.5px 'IBM Plex Mono', monospace; letter-spacing: .04em; padding: 1px 5px; background: rgba(10,12,9,.7); }
#research .card .tag.own { color: var(--ok); } #research .card .tag.start { color: var(--ac2); } #research .card .tag.goal { background: var(--xp); color: #0d1a24; } #research .card .tag.res { color: var(--xp); }
#research .card.own { background: linear-gradient(160deg, #4a5246 0, #2b3127 55%, #1a1f17 100%); }
#research .card.can { box-shadow: 0 0 0 2px var(--ac) inset; }
#research .card.lock img { filter: grayscale(1) brightness(.55); } #research .card.lock .nm, #research .card.lock .rk { color: #8d9585; } #research .card.lock { background: linear-gradient(160deg, #2a2f28 0, #191d16 100%); }
#research .card.sel { outline: 2px solid #e9e6dc; outline-offset: 2px; } #research .card.pair { outline: 2px dashed var(--ac2); outline-offset: 2px; }
#research .dos { position: absolute; top: calc(var(--rt) + var(--hh)); right: 0; bottom: 0; width: 290px; background: rgba(13,16,12,.96); border-left: 1px solid var(--line); display: flex; flex-direction: column; z-index: 4; padding-right: var(--sa-r, 0px); }
#research .dos .sc { flex: 1; overflow: auto; padding: 0 14px 10px; } #research .dos .hero { margin: 0 -14px 8px; height: 150px; background: radial-gradient(ellipse at 50% 80%, #39403a 0, #151a12 75%); display: flex; }
#research .dos .hero img { width: 100%; height: 100%; object-fit: contain; }
#research .mk { font: 600 10.5px 'IBM Plex Mono', monospace; letter-spacing: .1em; text-transform: uppercase; color: var(--dim); }
#research .dos h3 { margin: 2px 0 0; font: 400 19px/1.15 'Russo One'; } #research .dos .ty { color: var(--dim); font-size: 12px; margin: 2px 0 8px; }
#research .st { display: grid; grid-template-columns: auto 1fr; gap: 3px 12px; font-size: 12.5px; } #research .st span { color: var(--dim2); } #research .st b { font-weight: 500; text-align: right; }
#research .dos p { color: #c9cebd; font-size: 12px; line-height: 1.5; margin: 8px 0; }
#research .an { display: flex; gap: 8px; align-items: center; border: 1px dashed var(--line); padding: 5px; margin-top: 8px; cursor: pointer; } #research .an img { width: 82px; aspect-ratio: 16/9; object-fit: contain; background: #1a1f17; }
#research .acts { padding: 10px 14px; border-top: 1px solid var(--line2); display: flex; flex-direction: column; gap: 6px; }
#research .rbtn { border: 0; background: var(--ac); color: #17190f; font: 400 14px 'Russo One'; letter-spacing: .05em; padding: 11px; width: 100%; display: flex; justify-content: center; align-items: center; gap: 6px; cursor: pointer; }
#research .rbtn.alt { background: none; border: 1px solid #4a5443; color: #e9e6dc; font: 500 13px 'IBM Plex Sans'; letter-spacing: 0; } #research .rbtn:disabled { background: #2c3426; color: var(--dim2); cursor: default; }
#research .why { font-size: 11.5px; color: var(--dim); text-align: center; } #research .why.err { color: #f0a08c; }
#research .guest { position: absolute; left: 50%; top: calc(var(--rt) + var(--hh) + 8px); transform: translateX(-50%); z-index: 6; background: rgba(13,16,12,.94); border: 1px solid var(--line); padding: 7px 14px; font-size: 12.5px; color: #e9e6dc; white-space: nowrap; }
#research .veil { display: none; }
#research .grp { position: absolute; left: 18px; font: 400 13px 'Russo One'; color: var(--dim); letter-spacing: .04em; } /* «Вертолёты»: подпись стороны над её линиями */
@media (max-height: 460px), (max-width: 720px) {
  #research { --cw: 196px; --ch: 80px; --gx: 40px; --gy: 12px; }
  #research { --hh: 46px; } #research .top { padding: 0 10px; padding-left: max(10px, var(--sa-l, 0px)); gap: 8px; } #research .top h1 { display: none; } #research .btabs { margin-left: 0; } #research .btabs button { padding: 5px 8px; font-size: 12.5px; } #research .btabs button i { display: none; } #research .cur { font-size: 13px; gap: 10px; }
  #research .sides { top: calc(var(--rt) + var(--hh)); width: 92px; padding: 10px 0 0 8px; padding-left: max(8px, var(--sa-l, 0px)); } #research .sides button { height: 52px; font-size: 13px; padding: 0 8px; } #research .sides button small, #research .note { display: none; }
  #research .wrap { left: calc(96px + var(--sa-l, 0px)); top: calc(var(--rt) + var(--hh)); right: 0; } #research .dos { display: none; } #research.open .dos { display: flex; top: calc(var(--rt) + var(--hh)); width: min(320px, 70vw); }
  #research.open .veil { display: block; position: absolute; inset: calc(var(--rt) + var(--hh)) 0 0 0; background: rgba(0,0,0,.45); z-index: 3; }
  html[lang=en] #research .sides button { font-size: 12px; padding: 0 5px; } /* английские «Helicopters» и т. п. шире русских подписей */
  #research .card .nm { font-size: 12.5px; } #research .card .rk { font-size: 16px; } #research .card .pr { font-size: 12.5px; }
  #research .rh b { font-size: 14px; } #research .rh span { display: none; } #research .dos .hero { height: 110px; } #research .guest { font-size: 11.5px; }
}`;

const n2 = (v) => Math.round(v).toLocaleString(LANG === 'en' ? 'en-US' : 'ru-RU');
// значения карточки из progress.js (cardStats): «480 км/ч», «1,5–30 км», «2,5 т», «есть» — единицы и запятая на выбранном языке
const trVal = (v) => (LANG !== 'en' ? v : trIf(v).replace(/^none$/, 'no').replace(/(\d),(\d)/g, '$1.$2').replace(/ км\/ч/g, ' km/h').replace(/ км(?![А-Яа-я\/])/g, ' km').replace(/ м\/с/g, ' m/s').replace(/ кг/g, ' kg').replace(/ т$/g, ' t').replace(/ м$/g, ' m').replace(/ с$/g, ' s').replace(/°\/с/g, '°/s')
  .replace(/ снарядов$/, ' rounds').replace(/ · залп /, ' · salvo ').replace(/ \(оптика\)$/, ' (optical)'));
const thumb = (n) => `airdef/thumbs/${n.branch}_${n.key}.webp?v=20261022w`;
const GOAL_TAG = LANG === 'en' ? 'GOAL' : 'ЦЕЛЬ'; // по-русски та же «ЦЕЛЬ», что кнопка захвата цели (словарь — один ключ на оба), по-английски это разные слова
const era = (r) => (ERAS[r - 1] ? trIf(ERAS[r - 1].name).split('— ')[1] || '' : '');
const guide = (n) => (n.branch === 'pvo' ? trIf(SAM[n.key]?.guide) : n.branch === 'air' || n.branch === 'heli' ? tr('Подвески: {0}.', [RANKS.flatMap((e) => (LOADOUTS[e] || []).filter((L) => L.plane === n.key).map((L) => trIf(L.name))).join(' · ')]) : trIf(AG[n.item || n.key]?.guide)) || '';

export function createResearch(C, PG) {
  const style = document.createElement('style'); style.textContent = CSS; if (document.head) document.head.appendChild(style); // (заглушка DOM стенда — без head/body)
  const root = document.createElement('div'); root.id = 'research'; if (document.body && document.body.appendChild) document.body.appendChild(root);
  const S = { B: 'air', side: 'east', sel: null, open: false, msg: '', msgErr: false };
  const P0 = { xp: 0, silver: 0, res: [], own: [], goal: {} };
  const P = () => PG.P || P0;
  const phone = () => innerHeight < 460 || innerWidth < 720;
  // «Вертолёты» — своя ветка прокачки, но на экране — внутри «Авиации», третьей кнопкой слева (обе стороны в одном дереве)
  const EB = () => (S.B === 'air' && S.side === 'heli' ? 'heli' : S.B), sideOf = () => (S.side === 'heli' ? null : S.side);

  function st(n) {
    const p = P();
    if (n.start) return { k: 'start' }; if (owned(p, n.id)) return { k: 'own' };
    if (researched(p, n.id)) { const c = canBuy(p, n.id); return { k: 'buy', can: c.ok, why: c.why }; }
    if (!rankOpen(p, n.branch, n.rank) || (n.parent && !researched(p, n.parent))) return { k: 'lock', why: canResearch(p, n.id).why || '' };
    const c = canResearch(p, n.id); return { k: 'res', can: c.ok, why: c.why };
  }
  function card(c, x, y) {
    const n = c.n, s = st(n), p = P(), sel = n.id === S.sel, pr = S.sel && pairOf(NODE[S.sel]);
    const tag = s.k === 'own' ? `<span class="tag own">${tr('✓ КУПЛЕН')}</span>` : s.k === 'start' ? `<span class="tag start">${tr('★ СТАРТ')}</span>` : p.goal[n.branch] === n.id ? `<span class="tag goal">${GOAL_TAG}</span>` : s.k === 'buy' ? `<span class="tag res">${tr('ИССЛЕДОВАН')}</span>` : '';
    const price = s.k === 'buy' ? `<span class="pr ${s.can ? 'sv' : 'no'}">${SV(n.cost)}</span>` : s.k === 'res' ? `<span class="pr ${s.can ? 'xp' : 'no'}">${XP(n.cost)}</span>` : s.k === 'lock' ? `<span class="pr no">${ico('lock')}${n2(n.cost)}</span>` : '';
    const bar = s.k === 'res' && p.goal[n.branch] === n.id ? `<div class="bar"><i style="width:${Math.min(100, p.xp / n.cost * 100)}%"></i></div>` : '';
    return `<div class="card ${s.k === 'own' || s.k === 'start' ? 'own' : ''} ${s.can ? 'can' : ''} ${s.k === 'lock' ? 'lock' : ''} ${sel ? 'sel' : ''} ${pr && pr.id === n.id ? 'pair' : ''}" data-id="${n.id}" style="left:${x}px;top:${y}px">
      <img src="${thumb(n)}" alt="" loading="lazy">${tag}<span class="nm">${trIf(n.short)}</span><span class="rk">${RANK_NAME[n.rank]}</span>${price}${bar}</div>`;
  }
  function parity(r) {
    const p = P();
    if (r === 1) return `<div class="par okk">${tr('открыт')}</div>`;
    if (rankOpen(p, EB(), r)) return `<div class="par okk">${tr('паритет ранга {0} есть', [RANK_NAME[r - 1]])}</div>`;
    if (!rankOpen(p, EB(), r - 1)) return `<div class="par">${tr('сначала ранг {0}', [RANK_NAME[r - 1]])}</div>`;
    return `<div class="par">${tr('купить в ранге {0}: {1}', [RANK_NAME[r - 1], rankBlock(p, EB(), r).map((x) => `<b>${trIf(SIDE_NAME[x.side])} ${x.got}/${x.need}</b>`).join(', ')])}</div>`;
  }
  function tree() {
    const cs = getComputedStyle(root), px = (v) => parseFloat(cs.getPropertyValue(v)), ph = phone();
    const cw = px('--cw'), gx = px('--gx'), gy = px('--gy'), ch = px('--ch'), top = ph ? 76 : 72; // ниже шапки рангов (строка паритета — до двух строк)
    // вертолёты: линии Востока, под ними — Запада, над каждой группой — подпись стороны
    const hl = EB() === 'heli', LS = hl ? SIDES.map((sd) => [sd, treeLayout('heli', sd)]) : [[S.side, treeLayout(S.B, S.side)]], pos = {}, grp = [], L = { cells: [], links: [] };
    let y0 = top;
    for (const [sd, l] of LS) { if (hl) { grp.push(`<div class="grp" style="top:${y0 + 2}px">${trIf(SIDE_NAME[sd])}</div>`); y0 += 22; } for (const c of l.cells) pos[c.n.id] = [c.col * (cw + gx) + 18, y0 + c.row * (ch + gy)]; L.cells.push(...l.cells); L.links.push(...l.links); y0 += l.rows * (ch + gy) + (hl ? 8 : 0); }
    const H = y0 + 20, W = 4 * (cw + gx) + 18, p = P();
    const links = L.links.map(([a, b]) => { const [x1, y1] = pos[a], [x2, y2] = pos[b], xa = x1 + cw, ya = y1 + ch / 2, yb = y2 + ch / 2, xm = x2 - gx / 2;
      if (x2 <= x1) return `<path class="${st(NODE[b]).k === 'lock' ? 'lock' : ''}" d="M${x1} ${ya} H${x1 - 11} V${yb} H${x2}"/>`; // тот же ранг (Ил-28 → Ту-16 → Ту-22): скобкой слева от колонки
      return `<path class="${st(NODE[b]).k === 'lock' ? 'lock' : ''}" d="M${xa} ${ya} H${xm} V${yb} H${x2}"/>`; }).join('');
    const shade = RANKS.filter((r) => !rankOpen(p, EB(), r)).map((r) => `<div class="shade" style="left:${(r - 1) * (cw + gx) + 18 - gx / 2}px;width:${cw + gx}px"></div>`).join('');
    return `<div class="tree" style="width:${W + 30}px;height:${H}px"><div class="ranks">${RANKS.map((r) => `<div class="rh"><b>${tr('Ранг {0}', [RANK_NAME[r]])}</b><span>${era(r)}</span>${parity(r)}</div>`).join('')}</div>
      ${shade}${grp.join('')}<svg class="links" width="${W}" height="${H}">${links}</svg>${L.cells.map((c) => card(c, ...pos[c.n.id])).join('')}</div>`;
  }
  function dossier() {
    if (!S.sel || !NODE[S.sel]) return '';
    const n = NODE[S.sel], s = st(n), p = pairOf(n), sp = p && st(p), goal = P().goal[n.branch] === n.id, busy = PG.busy, guest = PG.guest;
    const why = S.msg ? `<div class="why ${S.msgErr ? 'err' : ''}">${S.msg}</div>` : s.why ? `<div class="why">${trMsg(s.why)}</div>` : '';
    const act = guest && s.k !== 'own' && s.k !== 'start' ? `<div class="why">${tr('Войдите на сайте — опыт и серебро копятся только в аккаунте.')}</div>`
      : s.k === 'buy' ? `<button class="rbtn" data-act="buy" ${s.can && !busy ? '' : 'disabled'}>${tr('КУПИТЬ')} ${SV(n.cost)}</button>${why}`
      : s.k === 'res' ? `<button class="rbtn" data-act="research" ${s.can && !busy ? '' : 'disabled'}>${tr('ИССЛЕДОВАТЬ')} ${XP(n.cost)}</button><button class="rbtn alt" data-act="goal" ${busy ? 'disabled' : ''}>${goal ? tr('Цель исследования ✓ (снять)') : tr('Сделать целью — опыт за бой пойдёт сюда')}</button>${why}`
      : s.k === 'lock' ? (n.parent && !researched(P(), n.parent) ? `<button class="rbtn alt" data-act="goal" ${busy ? 'disabled' : ''}>${goal ? tr('Цель ✓ (снять)') : tr('Сделать целью')}</button>` : '') + why
      : `<div class="why">${tr('Доступно в «Реализме».')}</div>`;
    const stats = `<div class="st">${cardStats(n).map(([k, v]) => `<span>${trIf(k)}</span><b>${trVal(v)}</b>`).join('')}</div>`;
    const an = p ? `<div class="an" data-id="${p.id}" data-side="${p.side}"><img src="${thumb(p)}" alt=""><div><span class="mk">${tr('аналог · {0}', [trIf(SIDE_NAME[p.side])])}</span><div style="font:400 13px 'Russo One'">${trIf(p.short)}</div><div style="font-size:11px;color:var(--dim)">${sp.k === 'own' ? tr('✓ куплен') : sp.k === 'start' ? tr('★ стартовый') : sp.k === 'lock' ? ico('lock') + tr(' закрыт') : sp.k === 'buy' ? tr('исследован') : tr('не исследован')}</div></div></div>` : '';
    return `<div class="veil" data-close="1"></div><div class="dos"><div class="sc"><div class="hero"><img src="${thumb(n)}" alt=""></div>
      <span class="mk">${tr('{0} · ранг {1} · {2}', [trIf(SIDE_NAME[n.side]), RANK_NAME[n.rank], era(n.rank)])}</span><h3>${trIf(n.name)}</h3><div class="ty">${trIf(unitType(n))}</div>
      ${stats}<p>${guide(n)}</p>${an}</div><div class="acts">${act}</div></div>`;
  }
  function draw() {
    if (!root.classList.contains('on')) return;
    const p = P(), scroll = root.querySelector('.wrap') ? [root.querySelector('.wrap').scrollLeft, root.querySelector('.wrap').scrollTop] : null;
    if (!phone() && !S.sel) S.sel = (nodesOf(EB(), sideOf(), 2)[0] || nodesOf(EB(), sideOf())[0]).id;
    root.classList.toggle('open', S.open);
    root.innerHTML = `<div class="rbg"></div><div class="top"><button class="back" data-close-all="1" aria-label="${tr('Назад')}">«</button><h1>${tr('Исследования')}</h1><div class="btabs">${BRANCHES.filter((b) => !b.sub).map((b) => `<button data-b="${b.id}" class="${b.id === S.B ? 'on' : ''}">${trIf(b.name)}<i>${RANKS.filter((r) => rankOpen(p, b.id, r)).length}/4</i></button>`).join('')}</div>
      <div class="cur"><span class="xp" title="${tr('Опыт — исследовать')}">${XP(p.xp)}</span><span title="${tr('Серебро — покупать')}">${SV(p.silver)}</span></div></div>
      <div class="sides">${SIDES.map((s) => `<button data-s="${s}" class="${s === S.side ? 'on' : ''}">${trIf(SIDE_NAME[s])}<small>${tr('куплено {0} из {1}', [nodesOf(S.B, s).filter((n) => owned(p, n.id)).length, nodesOf(S.B, s).length])}</small></button>`).join('')}${S.B === 'air' ? `<button data-s="heli" class="${S.side === 'heli' ? 'on' : ''}">${tr('Вертолёты')}<small>${tr('куплено {0} из {1}', [nodesOf('heli').filter((n) => owned(p, n.id)).length, nodesOf('heli').length])}</small></button>` : ''}</div>
      <div class="note">${tr('Только для <b>«Реализма»</b>. Аркада и обучение — всё открыто.')}</div>
      ${PG.guest ? `<div class="guest">${tr('Вы не вошли на сайте — показан стартовый набор. Опыт и серебро копятся в аккаунте.')}</div>` : PG.err ? `<div class="guest">${tr('Нет связи с сайтом: {0}', [trMsg(PG.err)])}</div>` : ''}
      <div class="wrap">${tree()}</div>${S.open || !phone() ? dossier() : ''}`;
    if (scroll && !S.reset) { const w = root.querySelector('.wrap'); w.scrollLeft = scroll[0]; w.scrollTop = scroll[1]; } // выбор единицы, покупка — дерево стоит на месте
    const sc0 = S.dosScroll; if (sc0 != null && root.querySelector('.dos .sc')) root.querySelector('.dos .sc').scrollTop = sc0; S.reset = false; S.dosScroll = null;
  }
  root.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-id],[data-b],[data-s],[data-close],[data-close-all],[data-act]'); if (!t) return;
    if (t.dataset.closeAll) { api.close(); return; }
    if (t.dataset.close) { S.open = false; S.msg = ''; draw(); return; }
    if (t.dataset.act) {
      const n = NODE[S.sel]; if (!n) return;
      const goal = P().goal[n.branch] === n.id; const dsc = root.querySelector('.dos .sc'); S.dosScroll = dsc ? dsc.scrollTop : null;
      const r = await PG.act(t.dataset.act, t.dataset.act === 'goal' ? (goal ? null : n.id) : n.id, n.branch);
      S.msg = r.ok ? (t.dataset.act === 'buy' ? tr('Куплено: {0} — доступно в «Реализме»', [trIf(n.short)]) : t.dataset.act === 'research' ? tr('Исследовано: {0}', [trIf(n.short)]) : goal ? tr('Цель снята') : tr('Цель выбрана')) : trMsg(r.why);
      S.msgErr = !r.ok; if (r.ok && C.snd) C.snd.click && C.snd.click();
      draw(); return;
    }
    if (t.dataset.id) { if (t.dataset.side && t.dataset.side !== S.side && EB() !== 'heli') S.side = t.dataset.side; S.sel = t.dataset.id; S.open = true; S.msg = ''; draw(); return; }
    if (t.dataset.b || t.dataset.s) { S.reset = true; if (t.dataset.b) { S.B = t.dataset.b; if (S.side === 'heli' && S.B !== 'air') S.side = 'east'; } if (t.dataset.s) S.side = t.dataset.s; S.sel = null; S.open = false; S.msg = ''; draw(); }
  });
  PG.on(draw);
  addEventListener('resize', draw);
  const api = {
    // открыть экран (по желанию — сразу на узле: из замка подвески «нужно: …»)
    open(id) {
      root.classList.add('on'); document.body.classList.add('researchOn');
      if (id && NODE[id]) { const h = NODE[id].branch === 'heli'; S.B = h ? 'air' : NODE[id].branch; S.side = h ? 'heli' : NODE[id].side; S.sel = id; S.open = true; }
      S.msg = ''; draw(); PG.refresh();
    },
    close() { root.classList.remove('on'); document.body.classList.remove('researchOn'); S.open = false; if (C.menu) C.menu.render(); },
    isOpen: () => root.classList.contains('on'),
  };
  return api;
}
