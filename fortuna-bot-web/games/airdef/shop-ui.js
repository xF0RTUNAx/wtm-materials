// Магазин «Воздушного превосходства» (Mark 2026-10-26 — вариант «Витрина»): особые окраски самолётов за кристаллы. В магазине — окраски, вышедшие к
// текущему сезону (arsenal.js CAMOS: season), новые первыми. Окно: выбранный самолёт в полёте на фоне настоящего неба (Mark: «чтобы не бросалась в
// глаза процедурная работа» — рендер Blender: модель с окраской, свет и фон — фото-панорама неба Poly Haven, CC0; tools/airdef-models/shop-sky-render.py),
// при смене окраски небо плавно сменяется, самолёт влетает справа; слева — название, цена и кнопка; внизу плитки окрасок. Картинки — airdef/shop/
// <самолёт>_<окраска>.webp (самолёт на прозрачном фоне), _sky.webp (небо), _s.webp (карточка). Данные — функция airdef-shop (кристаллы, свои окраски,
// picks — окраски «на выбор», worn — надетые: самолёт → окраска); ?rmock=1 — заглушка account.js (?shop=token|owned|poor — её состояния для снимков).
// Правила наград за сезон в игре не объявляются (Mark): в подсказке — только «за рейтинг, в конце сезона».
import { ico } from './icons.js?v=20261027a';
import { tr, trIf, LANG } from './i18n.js?v=20261027a';
import { activeAcc, callFn } from './account.js?v=20261027a';
import { CAMOS, CAMO_PRICE, PLANES } from './arsenal.js?v=20261027a';

const LOC = LANG === 'en' ? 'en-US' : 'ru-RU';
const nf = (v) => Math.round(v).toLocaleString(LOC);
const RM = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const FRESH = 60000, RETRY = 30000;
// вид окраски на витрине: название (первое слово — светлое, остальное — цветом окраски; одно слово — цветом), акценты и полоска цветов
const LOOK = {
  'e_f15e:inferno': { name: 'Инферно', acc: '#ef7a2a', acc2: '#f6a04a', chips: ['#1d1d20', '#a3241a', '#e0531c', '#f39528', '#ffd264'] },
  'e_mig31:dragon': { name: 'Нефритовый дракон', acc: '#8cc49a', acc2: '#e3d3a8', chips: ['#173d2b', '#25563c', '#3c7a52', '#e9dfc2', '#e8542a'] },
};
export const camoName = (key) => tr((LOOK[key] || {}).name || key);
const img = (key, kind = '') => `airdef/shop/${key.replace(':', '_')}${kind ? '_' + kind : ''}.webp`;

const CSS = `
#shopWin { position: fixed; inset: 0; z-index: 70; display: none; overflow: hidden; isolation: isolate; background: #1b2026; color: #f3f0e6; font: 400 calc(14px * var(--k, 1))/1.4 'Golos Text', -apple-system, 'Segoe UI', sans-serif;
  --k: 1; --dim: #d3d8cc; --mute: #a2aa98; --amber: #e8b14a; --amber2: #f3c96f; --jade: #59b884; --ok: #8fcf7a; --ease: cubic-bezier(.2, .8, .2, 1);
  --sl: max(calc(22px * var(--k)), calc(var(--sa-l, 0px) + 10px)); --sr: max(calc(16px * var(--k)), calc(var(--sa-r, 0px) + 8px)); --st: calc(var(--sa-t, 0px) + var(--tg-t, 0px)); }
#shopWin.on { display: block; }
#shopWin * { box-sizing: border-box; }
#shopWin button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
#shopWin button:focus-visible { outline: 2px solid var(--amber2); outline-offset: 2px; }
#shopWin .ic { width: 1em; height: 1em; fill: currentColor; flex: none; display: inline-block; vertical-align: -0.14em; }
#shopWin .gem { color: var(--jade); }
#shopWin .sky { position: absolute; inset: -3%; z-index: -3; transform: translate(calc(var(--mx, 0) * -6px), calc(var(--my, 0) * -4px)); transition: transform .3s linear; }
#shopWin .skyi { position: absolute; inset: 0; background: center / cover no-repeat; /* в кадре неба — только облака: горизонт с размытым низом панорамы — ниже кадра (shop-sky-render.py skyup) */ opacity: 0; transition: opacity 1s ease; animation: shpDrift 40s ease-in-out infinite alternate; }
#shopWin .skyi.on { opacity: 1; }
@keyframes shpDrift { from { transform: scale(1.04) translateX(0); } to { transform: scale(1.1) translateX(-1.5%); } }
#shopWin .hero { position: absolute; z-index: 2; left: var(--hx); top: var(--hy); width: var(--hw); height: calc(var(--hw) * .5625); pointer-events: none;
  transform: translate(calc(var(--mx, 0) * 12px * var(--k)), calc(var(--my, 0) * 7px * var(--k))); transition: transform .3s linear; }
#shopWin .pl { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; user-select: none; -webkit-user-drag: none; filter: drop-shadow(0 calc(18px * var(--k)) calc(22px * var(--k)) rgba(0,0,0,.28)); }
#shopWin .pl.on { opacity: 1; animation: shpBob 6s ease-in-out infinite; }
@keyframes shpBob { 0%, 100% { transform: translate(0, 0) rotate(0deg); } 50% { transform: translate(-.4%, -1.4%) rotate(-.6deg); } }
@media (prefers-reduced-motion: reduce) { #shopWin .skyi, #shopWin .pl.on { animation: none; } #shopWin .skyi { transition: none; } }
#shopWin .vign { position: absolute; inset: 0; z-index: 3; pointer-events: none; background: linear-gradient(180deg, rgba(10,12,14,.72) 0, rgba(10,12,14,0) calc(90px * var(--k))),
  linear-gradient(0deg, rgba(10,12,14,.8) 0, rgba(10,12,14,0) calc(120px * var(--k))), linear-gradient(90deg, rgba(10,12,14,.78) 0, rgba(10,12,14,.35) 30%, rgba(10,12,14,0) 48%); }
#shopWin .top { position: absolute; z-index: 6; left: var(--sl); right: var(--sr); top: calc(10px * var(--k) + var(--st)); display: flex; align-items: center; gap: calc(8px * var(--k)); }
#shopWin .top .t { display: flex; align-items: baseline; gap: calc(10px * var(--k)); margin-right: auto; min-width: 0; }
#shopWin .top h1 { margin: 0; font: 500 calc(22px * var(--k))/1 'Oswald', 'Arial Narrow', sans-serif; letter-spacing: .01em; }
#shopWin .top .t small { font-size: calc(12px * var(--k)); color: var(--mute); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#shopWin .bal { display: flex; align-items: center; gap: calc(7px * var(--k)); height: max(40px, calc(40px * var(--k))); padding: 0 calc(12px * var(--k)) 0 calc(10px * var(--k)); background: rgba(14,17,15,.82); border: 1px solid #3a4532;
  clip-path: polygon(calc(8px * var(--k)) 0, 100% 0, 100% 100%, 0 100%, 0 calc(8px * var(--k))); }
#shopWin .bal .ic { width: calc(20px * var(--k)); height: calc(20px * var(--k)); }
#shopWin .bal b { font: 600 calc(18px * var(--k)) 'JetBrains Mono', monospace; letter-spacing: -.02em; }
#shopWin .bal small { font-size: calc(11.5px * var(--k)); color: var(--mute); }
#shopWin .tok { display: none; align-items: center; gap: calc(6px * var(--k)); height: max(40px, calc(40px * var(--k))); padding: 0 calc(11px * var(--k)); background: rgba(48,38,14,.9); border: 1px solid #8a7232; color: var(--amber2); font: 600 calc(13px * var(--k)) 'Golos Text', sans-serif; white-space: nowrap; }
#shopWin .tok .ic { width: calc(19px * var(--k)); height: calc(19px * var(--k)); }
#shopWin.has-token .tok { display: flex; }
#shopWin .sq { width: max(40px, calc(40px * var(--k))); height: max(40px, calc(40px * var(--k))); display: grid; place-items: center; background: rgba(14,17,15,.82); border: 1px solid #3a4532; color: var(--dim); }
#shopWin .sq .ic { width: calc(20px * var(--k)); height: calc(20px * var(--k)); }
#shopWin .sq.q { font: 600 calc(18px * var(--k)) 'Oswald', sans-serif; color: var(--amber2); border-color: #6b5a2a; }
#shopWin .sq.q[aria-expanded="true"] { background: var(--amber); color: #17190f; border-color: var(--amber); }
#shopWin .sq:hover { border-color: #5c6a4f; color: #f3f0e6; }
#shopWin .sinfo { position: absolute; z-index: 5; left: var(--sl); top: calc(64px * var(--k) + var(--st) + var(--extra-top, 0px)); width: calc(330px * var(--k)); }
#shopWin .kick { font-size: calc(13px * var(--k)); color: var(--dim); letter-spacing: .02em; text-shadow: 0 1px 6px rgba(0,0,0,.6); }
#shopWin .name { margin: calc(4px * var(--k)) 0 0; padding-bottom: .08em; font: 600 calc(52px * var(--k))/.95 'Oswald', 'Arial Narrow', sans-serif; letter-spacing: -.005em; text-shadow: 0 2px 18px rgba(0,0,0,.55); }
#shopWin .name span { display: block; } #shopWin .name span.a { color: var(--acc2, #f3f0e6); }
#shopWin .chips { display: flex; margin-top: calc(10px * var(--k)); height: calc(6px * var(--k)); width: calc(132px * var(--k)); } #shopWin .chips i { flex: 1; }
#shopWin .act { display: flex; align-items: center; gap: calc(10px * var(--k)); margin-top: calc(16px * var(--k)); flex-wrap: wrap; }
#shopWin .sbt { display: inline-flex; align-items: center; gap: calc(8px * var(--k)); height: max(44px, calc(46px * var(--k))); padding: 0 calc(22px * var(--k)) 0 calc(20px * var(--k)); font: 500 calc(18px * var(--k)) 'Oswald', sans-serif; letter-spacing: .02em; white-space: nowrap;
  clip-path: polygon(0 0, calc(100% - 12px * var(--k)) 0, 100% calc(12px * var(--k)), 100% 100%, 0 100%); }
#shopWin .sbt .ic { width: calc(18px * var(--k)); height: calc(18px * var(--k)); }
#shopWin .sbt b { font: 600 calc(17px * var(--k)) 'JetBrains Mono', monospace; letter-spacing: -.02em; }
#shopWin .sbt.main { background: var(--amber); color: #17190f; } #shopWin .sbt.main:hover { background: var(--amber2); } #shopWin .sbt.main .gem { color: #17532f; }
#shopWin .sbt.main[disabled] { opacity: .55; cursor: default; }
#shopWin .sbt.short { background: rgba(14,17,15,.84); color: var(--dim); box-shadow: inset 0 0 0 1px #5a4c2a; clip-path: none; } #shopWin .sbt.short b { color: var(--amber2); }
#shopWin .sbt.worn { background: rgba(14,17,15,.84); color: var(--ok); box-shadow: inset 0 0 0 1px #3f5a35; clip-path: none; cursor: default; }
#shopWin .stag { display: inline-flex; align-items: center; gap: calc(6px * var(--k)); font: 500 calc(13px * var(--k)) 'Golos Text', sans-serif; color: var(--ok); text-shadow: 0 1px 4px rgba(0,0,0,.6); }
#shopWin .stag .ic { width: calc(14px * var(--k)); height: calc(14px * var(--k)); }
#shopWin .strike { font: 500 calc(13px * var(--k)) 'JetBrains Mono', monospace; color: var(--mute); text-decoration: line-through; display: inline-flex; align-items: center; gap: .3em; }
#shopWin .note { margin-top: calc(10px * var(--k)); font-size: calc(12.5px * var(--k)); color: var(--dim); max-width: calc(300px * var(--k)); text-shadow: 0 1px 4px rgba(0,0,0,.6); }
#shopWin .note button { color: var(--amber2); text-decoration: underline; text-underline-offset: 3px; text-decoration-thickness: 1px; }
#shopWin .note.err { color: #f6a585; }
#shopWin .stamp { position: absolute; left: calc(150px * var(--k)); top: calc(-4px * var(--k)); padding: calc(3px * var(--k)) calc(10px * var(--k)); border: calc(3px * var(--k)) double var(--ok); color: var(--ok); font: 600 calc(17px * var(--k)) 'Oswald', sans-serif; transform: rotate(-8deg); opacity: 0; pointer-events: none; }
#shopWin .tray { position: absolute; z-index: 5; left: var(--sl); right: var(--sr); bottom: calc(12px * var(--k) + var(--sa-b, 0px)); display: grid; gap: calc(6px * var(--k)); justify-items: start; }
#shopWin .ticket { display: none; align-items: center; gap: calc(8px * var(--k)); height: calc(28px * var(--k)); padding: 0 calc(16px * var(--k)) 0 calc(14px * var(--k)); background: #e4dcc3; color: #2a261d; font: 600 calc(13px * var(--k)) 'Golos Text', sans-serif;
  clip-path: polygon(0 0, 100% 0, calc(100% - 6px * var(--k)) 50%, 100% 100%, 0 100%, calc(6px * var(--k)) 50%); }
#shopWin .ticket .ic { width: calc(16px * var(--k)); height: calc(16px * var(--k)); color: #8a5a12; }
#shopWin.has-token .ticket { display: inline-flex; }
#shopWin .tiles { display: flex; gap: calc(8px * var(--k)); }
#shopWin .tile { position: relative; display: flex; align-items: center; gap: calc(9px * var(--k)); width: calc(196px * var(--k)); padding: calc(6px * var(--k)); background: rgba(14,17,15,.84); border: 1px solid #333d2c; text-align: left; transition: background .2s, border-color .2s; }
#shopWin .tile img { flex: none; width: calc(72px * var(--k)); height: calc(40.5px * var(--k)); object-fit: cover; display: block; filter: saturate(.75) brightness(.8); transition: filter .3s; }
#shopWin .tile .tt { display: flex; flex-direction: column; min-width: 0; }
#shopWin .tile b { font: 600 calc(12.5px * var(--k))/1.1 'Golos Text', sans-serif; }
#shopWin .tile small { margin-top: calc(3px * var(--k)); font: 500 calc(11.5px * var(--k)) 'JetBrains Mono', monospace; color: var(--dim); display: flex; align-items: center; gap: .35em; }
#shopWin .tile small.t { font-family: 'Golos Text', sans-serif; } #shopWin .tile small.worn { color: var(--ok); } #shopWin .tile small.tk { color: var(--amber2); }
#shopWin .tile::before { content: ""; position: absolute; left: -1px; right: -1px; top: -1px; height: calc(3px * var(--k)); background: var(--acc); transform: scaleX(0); transform-origin: left; transition: transform .35s var(--ease); }
#shopWin .tile.on { background: rgba(26,31,24,.94); border-color: #55614a; } #shopWin .tile.on::before { transform: scaleX(1); } #shopWin .tile.on img { filter: none; }
#shopWin .tile:not(.on):hover { border-color: #4c5843; }
#shopWin .shint { position: absolute; z-index: 8; right: var(--sr); top: calc(58px * var(--k) + var(--st)); width: calc(292px * var(--k)); background: #151a14; border: 1px solid #3a4531; box-shadow: 0 calc(10px * var(--k)) calc(30px * var(--k)) rgba(0,0,0,.55); padding: calc(12px * var(--k)) calc(14px * var(--k)); display: none; }
#shopWin .shint.open { display: block; animation: shpDrop .25s var(--ease); }
@keyframes shpDrop { from { opacity: 0; transform: translateY(calc(-6px * var(--k))); } }
#shopWin .shint h3 { margin: 0 0 calc(8px * var(--k)); font: 500 calc(16px * var(--k)) 'Oswald', sans-serif; display: flex; align-items: center; gap: calc(7px * var(--k)); }
#shopWin .shint p { margin: 0; padding: calc(8px * var(--k)) 0; border-top: 1px solid #262e21; font-size: calc(13px * var(--k)); } #shopWin .shint p small { display: block; color: var(--mute); font-size: calc(11.5px * var(--k)); }
`;

export function createShop(C) {
  const style = document.createElement('style'); style.textContent = CSS; if (document.head) document.head.appendChild(style); // (заглушка DOM стенда — без head/body)
  const root = document.createElement('div'); root.id = 'shopWin'; root.setAttribute && root.setAttribute('role', 'dialog'); root.setAttribute && root.setAttribute('aria-modal', 'true');
  if (document.body && document.body.appendChild) document.body.appendChild(root);
  const S = { w: null, season: 1, err: '', key: null, at: 0, busy: false, sel: 0, shown: null, hint: false, act: false, built: '' };
  const $ = (id) => document.getElementById(id);
  const q = (s) => root.querySelector(s);
  const gem = ico('gem', 'gem');
  const out = () => CAMOS.filter((c) => c.season && c.season <= S.season && LOOK[c.key]).sort((a, b) => b.season - a.season).map((c) => c.key); // новые — первыми
  const acc = () => activeAcc();
  const owned = (k) => !!S.w && S.w.camos.includes(k);
  const worn = (k) => { const [pl, id] = k.split(':'); return !!S.w && (S.w.worn || {})[pl] === id; };

  // ── кнопка в меню: баланс (картинка — «Нефритовый дракон», Mark: в разметке) ──
  function paint() {
    const sub = S.w ? `${gem}<b>${nf(S.w.crystals)}</b> · ${tr('окраски')}` : tr('окраски сезона');
    if ($('shopSub') && $('shopSub').innerHTML !== sub) $('shopSub').innerHTML = sub;
  }
  $('shopBtn').onclick = () => { if (C.snd && C.snd.click) C.snd.click(); api.open(); };

  // ── данные ──
  const keyNow = () => { const a = acc(); return a && a.kind === 'airdef' ? a.id : ''; };
  async function load() {
    if (S.busy) return;
    const key = keyNow(); S.busy = true; S.key = key;
    let d = null, err = '';
    if (key) {
      try { d = await callFn('airdef-shop', { player_id: key, action: 'state' }); }
      catch (e) { err = e.status === 404 && (!e.code || e.code === 'NOT_FOUND') ? 'soon' : e.message || tr('Нет связи с сайтом'); } // NOT_FOUND — функции нет на сервере (Supabase)
    }
    S.busy = false;
    if (key !== keyNow()) { S.at = 0; S.w = null; load(); return; } // пока ждали, сменили аккаунт
    if (d) { S.w = d.wallet; S.season = d.season || S.season; } else S.w = null;
    S.err = err; S.at = Date.now(); paint(); if (api.isOpen()) draw();
  }
  function touch() {
    if (C.state !== 'menu' || S.busy) return;
    if (S.key === keyNow() && Date.now() - S.at < (S.err ? RETRY : FRESH)) return;
    load();
  }
  async function act(action, key, extra) {
    if (S.act) return false; S.act = true; draw();
    let d = null, err = '';
    try { d = await callFn('airdef-shop', { player_id: keyNow(), action, key, ...extra }); } catch (e) { err = e.message || tr('Нет связи с сайтом'); }
    S.act = false;
    if (d && d.wallet) { const from = S.w ? S.w.crystals : 0; S.w = d.wallet; draw(); countTo(from, S.w.crystals); paint(); } else { S.err = err; draw(); S.err = ''; }
    return !!d;
  }

  // ── раскладка: самолёт справа от плаката, размер — от экрана ──
  function layout() {
    const vw = innerWidth, vh = innerHeight, r = root.style;
    const k = Math.max(0.82, Math.min(1.3, Math.min(vw / 932, vh / 430)));
    r.setProperty('--k', k);
    const hw = Math.min(vw * 0.74, vh * 1.5), hh = hw * 0.5625, cx = vw * (vw / vh > 1.9 ? 0.62 : 0.6), cy = vh * 0.5;
    r.setProperty('--hw', hw + 'px'); r.setProperty('--hx', cx - hw / 2 + 'px'); r.setProperty('--hy', cy - hh / 2 + 'px');
    r.setProperty('--extra-top', Math.max(0, (vh - 430 * k) * 0.25) + 'px');
  }

  // ── окно: каркас (раз на набор окрасок), затем сведения о выбранной ──
  function build() {
    const list = out(), sig = list.join(',') + '|' + LANG;
    if (S.built === sig) return; S.built = sig; S.shown = null;
    root.innerHTML = `<div class="sky"><i class="skyi"></i><i class="skyi"></i></div><div class="hero"><img class="pl" alt=""><img class="pl" alt=""></div><div class="vign"></div>
      <header class="top"><div class="t"><h1>${tr('Магазин')}</h1><small class="ssub"></small></div>
        <div class="tok" title="${tr('Окраска на выбор')}">${ico('ticket')}<span class="tokN"></span></div>
        <div class="bal" title="${tr('Кристаллы')}"><small>${tr('кристаллы')}</small>${gem}<b class="balN">—</b></div>
        <button class="sq q" data-a="q" aria-expanded="false" title="${tr('Откуда кристаллы')}">?</button>
        <button class="sq" data-a="close" title="${tr('Закрыть')}" aria-label="${tr('Закрыть')}">${ico('close')}</button></header>
      <div class="sinfo"><div class="kick pln"></div><h2 class="name"></h2><div class="chips"></div><div class="act"></div><div class="note"></div><div class="stamp"></div></div>
      <div class="tray"><span class="ticket">${ico('ticket')}${tr('Окраска на выбор — возьмите любую')}</span>
        <div class="tiles">${list.map((k, i) => `<button class="tile" data-i="${i}" style="--acc:${LOOK[k].acc}"><img src="${img(k, 's')}" alt=""><span class="tt"><b>${camoName(k)}</b><small></small></span></button>`).join('')}</div></div>
      <div class="shint" role="dialog" aria-label="${tr('Откуда кристаллы')}"><h3>${gem}${tr('Откуда кристаллы')}</h3>
        <p>${tr('Награда за онлайн-рейтинг')}<small>${tr('начисляются в конце сезона')}</small></p>
        <p>${tr('Купленная окраска — навсегда')}<small>${tr('надеть или снять — здесь же')}</small></p></div>`;
    for (const k of list) { const a = new Image(); a.src = img(k); const b = new Image(); b.src = img(k, 'sky'); } // смена окраски без мигания
    layout();
  }

  // небо и самолёт выбранной окраски: небо — плавная смена, самолёт — влетает справа, прежний уходит влево
  function scene(k, anim) {
    if (S.shown === k) return; const first = S.shown == null; S.shown = k;
    const [s0, s1] = root.querySelectorAll('.skyi'), [p0, p1] = root.querySelectorAll('.pl');
    const sOld = s0.classList.contains('on') ? s0 : s1, sNew = sOld === s0 ? s1 : s0;
    const pOld = p0.classList.contains('on') ? p0 : p1, pNew = pOld === p0 ? p1 : p0;
    sNew.style.backgroundImage = `url(${img(k, 'sky')})`; sNew.classList.add('on'); sOld.classList.remove('on');
    pNew.src = img(k); pNew.alt = `${trIf(PLANES[k.split(':')[0]] || '')} · ${camoName(k)}`;
    pOld.classList.remove('on'); pNew.classList.add('on');
    if (!anim || first || RM || !pNew.animate) return;
    // прежний уходит влево быстро, новый влетает справа после него — без наложения двух самолётов
    pOld.animate([{ opacity: 1, transform: 'translate(0, 0)' }, { opacity: 0, transform: 'translate(-34%, 6%) scale(.9)' }], { duration: 340, easing: 'cubic-bezier(.55,0,1,.45)' });
    pNew.animate([{ opacity: 0, transform: 'translate(38%, -7%) scale(.88)' }, { opacity: 1, transform: 'translate(0, 0) scale(1)' }], { duration: 900, delay: 260, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
  }

  function draw(anim) {
    build();
    const list = out(), n = list.length; if (!n) return;
    S.sel = Math.min(S.sel, n - 1);
    const k = list[S.sel], L = LOOK[k], a = acc(), w = S.w;
    scene(k, anim);
    root.classList.toggle('has-token', !!w && w.picks > 0);
    q('.ssub').textContent = tr('окраски сезона {0}', [S.season]);
    q('.balN').textContent = w ? nf(w.crystals) : '—';
    q('.tokN').textContent = w ? tr('на выбор: {0}', [w.picks]) : '';
    const info = q('.sinfo'); info.style.setProperty('--acc', L.acc); info.style.setProperty('--acc2', L.acc2);
    q('.pln').textContent = trIf(PLANES[k.split(':')[0]] || '');
    const words = camoName(k).split(' ');
    q('.name').innerHTML = words.length > 1 ? `<span>${words[0]}</span><span class="a">${words.slice(1).join(' ')}</span>` : `<span class="a">${words[0]}</span>`;
    q('.chips').innerHTML = L.chips.map((x) => `<i style="background:${x}"></i>`).join('');
    const tick = ico('ok'), busy = S.act ? ' disabled' : '';
    let html = '', note = '';
    if (!a || a.kind !== 'airdef') { // гость или аккаунт сайта: покупки — только с аккаунтом игры
      html = `<button class="sbt main" data-a="${a ? 'xfer' : 'login'}">${a ? tr('Перенести прогресс') : tr('Войти')}</button>`;
      note = tr('Кристаллы и окраски — только у аккаунта игры.');
    } else if (!w) {
      html = `<button class="sbt main" disabled>${tr('Купить')} ${gem}<b>${CAMO_PRICE}</b></button>`;
      note = S.busy || !S.err ? tr('Загружаем…') : S.err === 'soon' ? tr('Магазин скоро откроется.') : `${S.err} <button data-a="retry">${tr('Повторить')}</button>`;
    } else if (worn(k)) {
      html = `<span class="sbt worn">${tick}${tr('Надета')}</span>`;
      note = `${tr('Эта окраска на самолёте.')} <button data-a="off">${tr('Снять')}</button>`;
    } else if (owned(k)) {
      html = `<span class="stag">${tick}${tr('Куплена')}</span><button class="sbt main" data-a="wear"${busy}>${tr('Надеть')}</button>`;
    } else if (w.picks > 0) {
      html = `<button class="sbt main" data-a="pick"${busy}>${ico('ticket')}${tr('Взять на выбор')}</button><span class="strike">${gem}${CAMO_PRICE}</span>`;
    } else if (w.crystals >= CAMO_PRICE) {
      html = `<button class="sbt main" data-a="buy"${busy}>${tr('Купить')} ${gem}<b>${CAMO_PRICE}</b></button>`;
    } else {
      html = `<button class="sbt short" data-a="q">${tr('Не хватает')} ${gem}<b>${CAMO_PRICE - w.crystals}</b></button>`;
      note = `${tr('Кристаллы приходят в конце сезона.')} <button data-a="q">${tr('Откуда?')}</button>`;
    }
    q('.act').innerHTML = html; const ne = q('.note'); ne.innerHTML = note; ne.classList.toggle('err', !!S.err && !!w);
    if (S.err && w) ne.textContent = S.err;
    root.querySelectorAll('.tile').forEach((t) => {
      const kk = list[+t.dataset.i], sm = t.querySelector('small');
      t.classList.toggle('on', +t.dataset.i === S.sel);
      const [cls, txt] = !w ? ['', gem + CAMO_PRICE] : worn(kk) ? ['t worn', tick + tr('надета')] : owned(kk) ? ['t', tr('куплена')] : w.picks > 0 ? ['t tk', tr('на выбор')] : ['', gem + CAMO_PRICE];
      sm.className = cls; sm.innerHTML = txt;
    });
    q('.shint').classList.toggle('open', S.hint); q('.sq.q').setAttribute('aria-expanded', S.hint);
    // название и кнопка проявляются без обрезки букв (Mark: нижнее слово обрезалось на миг)
    if (anim && !RM && q('.name').animate) {
      q('.name').animate([{ opacity: 0, transform: 'translateX(-14px)' }, { opacity: 1, transform: 'none' }], { duration: 480, easing: 'cubic-bezier(.2,.8,.2,1)' });
      q('.act').animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay: 120, fill: 'backwards' });
    }
  }
  const select = (i, anim) => { S.sel = i; draw(anim); };
  function countTo(from, to) {
    const el = q('.balN'); if (!el || RM || from === to) return;
    const t0 = performance.now(), step = (now) => { const k = Math.min(1, (now - t0) / 600); el.textContent = nf(from + (to - from) * k); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  function stamp(text) {
    const s = q('.stamp'); s.textContent = text; if (RM || !s.animate) return;
    s.animate([{ opacity: 0, transform: 'rotate(-8deg) scale(2)' }, { opacity: 1, transform: 'rotate(-8deg) scale(.95)', offset: 0.6 }, { opacity: 1, transform: 'rotate(-8deg) scale(1)', offset: 0.85 }, { opacity: 0, transform: 'rotate(-8deg) scale(1)' }], { duration: 1500, easing: 'cubic-bezier(.5,0,.75,0)' });
  }

  // ── события ──
  root.addEventListener && root.addEventListener('click', async (e) => {
    if (Date.now() - swipeAt < 400) return; // click сразу после свайпа — его же касание (ревью: свайп по плитке гасил сам себя)
    const b = e.target.closest('[data-a]'), tile = e.target.closest('.tile');
    if ((!b || b.dataset.a !== 'q') && S.hint && !e.target.closest('.shint')) { S.hint = false; draw(); }
    if (tile) { if (+tile.dataset.i !== S.sel) { if (C.snd && C.snd.click) C.snd.click(); select(+tile.dataset.i, true); } return; }
    if (!b) return;
    const k = out()[S.sel], a = b.dataset.a;
    if (a === 'close') api.close();
    else if (a === 'q') { S.hint = !S.hint; draw(); }
    else if (a === 'retry') { S.at = 0; S.err = ''; draw(); load(); }
    else if (a === 'login' || a === 'xfer') { if (C.account) C.account.open(a); }
    else if (a === 'buy') { if (await act('buy', k)) stamp(tr('куплена')); }
    else if (a === 'pick') { if (await act('pick', k)) stamp(tr('получена')); }
    else if (a === 'wear') await act('wear', k);
    else if (a === 'off') await act('wear', null, { plane: k.split(':')[0] });
  });
  // свайп и лёгкий параллакс от мыши (небо — против движения, самолёт — по нему)
  let sx = null, tx = 0, ty = 0, mx = 0, my = 0, raf = 0, swipeAt = 0;
  root.addEventListener && root.addEventListener('pointerdown', (e) => { sx = e.clientX; });
  root.addEventListener && root.addEventListener('pointerup', (e) => {
    if (sx == null) return; const dx = e.clientX - sx, n = out().length; sx = null;
    if (Math.abs(dx) > 50 && n > 1 && !e.target.closest('.shint')) { swipeAt = Date.now(); select((S.sel + (dx < 0 ? 1 : n - 1)) % n, true); }
  });
  const loop = () => { mx += (tx - mx) * 0.08; my += (ty - my) * 0.08; root.style.setProperty('--mx', mx.toFixed(3)); root.style.setProperty('--my', my.toFixed(3)); raf = Math.abs(tx - mx) + Math.abs(ty - my) > 0.002 ? requestAnimationFrame(loop) : 0; };
  root.addEventListener && root.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || RM) return;
    tx = Math.max(-1, Math.min(1, (e.clientX / innerWidth - 0.5) * 2)); ty = Math.max(-1, Math.min(1, (e.clientY / innerHeight - 0.5) * 2)); if (!raf) raf = requestAnimationFrame(loop);
  });
  addEventListener('keydown', (e) => {
    if (!api.isOpen() || (C.account && C.account.isOpen())) return;
    const n = out().length;
    if (e.code === 'Escape') { if (S.hint) { S.hint = false; draw(); } else api.close(); }
    else if (e.code === 'ArrowRight' && n > 1) select((S.sel + 1) % n, true);
    else if (e.code === 'ArrowLeft' && n > 1) select((S.sel + n - 1) % n, true);
  });
  addEventListener('resize', () => { if (api.isOpen()) layout(); });
  paint();

  const api = {
    open() {
      S.hint = false; root.classList.add('on'); layout(); draw(false);
      if (!S.busy && Date.now() - S.at > 10000) { S.at = 0; load(); }
    },
    close() { root.classList.remove('on'); S.hint = false; },
    isOpen: () => !!root.classList && root.classList.contains('on'),
    touch, paint,
    // сменился аккаунт: кошелёк устарел
    reset() { if (S.key !== keyNow()) S.w = null; S.at = 0; paint(); if (api.isOpen()) { draw(); load(); } else touch(); },
    wallet: () => S.w,
  };
  return api;
}
