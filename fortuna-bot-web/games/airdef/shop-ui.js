// Магазин «Воздушного превосходства» (Mark 2026-10-26 — вариант «Витрина» из трёх макетов): особые окраски самолётов за кристаллы. Каждый сезон —
// 2 новые окраски (arsenal.js CAMOS: season); в магазине — все вышедшие к текущему сезону, новые первыми. Окно: ночная стоянка, выбранный самолёт
// крупно на компасной площадке (девиационный круг), соседний — сбоку в тени; плакат с названием, цена и кнопка; внизу плитки окрасок. Картинки —
// рендеры Blender (airdef/shop/<самолёт>_<окраска>.webp и _s.webp). Данные — функция airdef-shop (кристаллы, свои окраски, picks — окраски «на
// выбор», worn — надетые: самолёт → окраска); ?rmock=1 — заглушка account.js (?shop=token|owned|poor — её состояния для снимков).
// Правила наград за сезон в игре не объявляются (Mark): в подсказке — только «за рейтинг, в конце сезона».
import { ico } from './icons.js?v=20261026b';
import { tr, trIf, LANG } from './i18n.js?v=20261026b';
import { activeAcc, callFn } from './account.js?v=20261026b';
import { CAMOS, CAMO_PRICE, PLANES } from './arsenal.js?v=20261026b';

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
const img = (key, s) => `airdef/shop/${key.replace(':', '_')}${s ? '_s' : ''}.webp`;

const CSS = `
#shopWin { position: fixed; inset: 0; z-index: 70; display: none; overflow: hidden; isolation: isolate; background: #0c0e0b; color: #f3f0e6; font: 400 calc(14px * var(--k, 1))/1.4 'Golos Text', -apple-system, 'Segoe UI', sans-serif;
  --k: 1; --dim: #c9cfc2; --mute: #8f9884; --amber: #e8b14a; --amber2: #f3c96f; --jade: #59b884; --ok: #8fcf7a; --ease: cubic-bezier(.2, .8, .2, 1);
  --sl: max(calc(22px * var(--k)), calc(var(--sa-l, 0px) + 10px)); --sr: max(calc(16px * var(--k)), calc(var(--sa-r, 0px) + 8px)); --st: calc(var(--sa-t, 0px) + var(--tg-t, 0px)); }
#shopWin.on { display: block; }
#shopWin * { box-sizing: border-box; }
#shopWin button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
#shopWin button:focus-visible { outline: 2px solid var(--amber2); outline-offset: 2px; }
#shopWin .ic { width: 1em; height: 1em; fill: currentColor; flex: none; display: inline-block; vertical-align: -0.14em; }
#shopWin .gem { color: var(--jade); }
#shopWin .floor { position: absolute; inset: 0; width: 100%; height: 100%; z-index: -3; transform: translate(calc(var(--mx, 0) * -3px), calc(var(--my, 0) * -2px)); }
#shopWin .pool { position: absolute; z-index: -2; pointer-events: none; border-radius: 50%; background: radial-gradient(closest-side, rgba(255,220,160,.3), rgba(255,205,140,.13) 50%, rgba(255,200,130,0)); mix-blend-mode: screen; }
#shopWin .vign { position: absolute; inset: 0; z-index: 4; pointer-events: none; background: linear-gradient(180deg, rgba(8,10,7,.82) 0, rgba(8,10,7,0) calc(80px * var(--k))),
  linear-gradient(0deg, rgba(8,10,7,.78) 0, rgba(8,10,7,0) calc(110px * var(--k))), linear-gradient(90deg, rgba(8,10,7,.55) 0, rgba(8,10,7,0) 32%), radial-gradient(120% 90% at 60% 55%, rgba(0,0,0,0) 55%, rgba(0,0,0,.5) 100%); }
#shopWin .slot { position: absolute; left: var(--hx); top: var(--hy); width: var(--hw); height: calc(var(--hw) * .5625); transform-origin: 50% 70%; transition: transform .8s var(--ease), filter .8s var(--ease); cursor: pointer; }
#shopWin .slot.c { z-index: 3; cursor: default; }
#shopWin .slot.l { z-index: 1; transform: translate(var(--lx), var(--ly)) scale(.5); filter: brightness(.44) saturate(.6); }
#shopWin .slot.r { z-index: 1; transform: translate(var(--rx), var(--ry)) scale(.5); filter: brightness(.44) saturate(.6); }
#shopWin .slot.off { display: none; }
#shopWin .par { position: absolute; inset: 0; transition: transform .25s linear; --d: 5; transform: translate(calc(var(--mx, 0) * var(--d) * 1px * var(--k)), calc(var(--my, 0) * var(--d) * .6px * var(--k))); }
#shopWin .slot.c .par { --d: 13; }
#shopWin .slot img { position: absolute; left: 0; top: 0; width: 100%; height: 100%; user-select: none; -webkit-user-drag: none; pointer-events: none; }
#shopWin .float { position: absolute; inset: 0; animation: shpBob 7s ease-in-out infinite; }
#shopWin .slot .shadow { filter: brightness(0) blur(calc(var(--hw) * .009)); opacity: .62; transform: translate(5%, 30%) scale(.94, .46) skewX(14deg); transform-origin: 50% 60%; animation: shpBobS 7s ease-in-out infinite; }
#shopWin .pad { position: absolute; left: -6%; width: 112%; top: 62%; height: 52%; overflow: visible; }
@keyframes shpBob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-1.1%); } }
@keyframes shpBobS { 0%, 100% { transform: translate(5%, 30%) scale(.94, .46) skewX(14deg); opacity: .62; } 50% { transform: translate(5%, 30%) scale(.91, .44) skewX(14deg); opacity: .54; } }
@media (prefers-reduced-motion: reduce) { #shopWin .float, #shopWin .slot .shadow { animation: none; } #shopWin .slot, #shopWin .par { transition: none; } }
#shopWin .top { position: absolute; z-index: 6; left: var(--sl); right: var(--sr); top: calc(10px * var(--k) + var(--st)); display: flex; align-items: center; gap: calc(8px * var(--k)); }
#shopWin .top .t { display: flex; align-items: baseline; gap: calc(10px * var(--k)); margin-right: auto; min-width: 0; }
#shopWin .top h1 { margin: 0; font: 500 calc(22px * var(--k))/1 'Oswald', 'Arial Narrow', sans-serif; letter-spacing: .01em; }
#shopWin .top .t small { font-size: calc(12px * var(--k)); color: var(--mute); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#shopWin .bal { display: flex; align-items: center; gap: calc(7px * var(--k)); height: max(40px, calc(40px * var(--k))); padding: 0 calc(12px * var(--k)) 0 calc(10px * var(--k)); background: rgba(17,21,15,.9); border: 1px solid #36412f;
  clip-path: polygon(calc(8px * var(--k)) 0, 100% 0, 100% 100%, 0 100%, 0 calc(8px * var(--k))); }
#shopWin .bal .ic { width: calc(20px * var(--k)); height: calc(20px * var(--k)); }
#shopWin .bal b { font: 600 calc(18px * var(--k)) 'JetBrains Mono', monospace; letter-spacing: -.02em; }
#shopWin .bal small { font-size: calc(11.5px * var(--k)); color: var(--mute); }
#shopWin .tok { display: none; align-items: center; gap: calc(6px * var(--k)); height: max(40px, calc(40px * var(--k))); padding: 0 calc(11px * var(--k)); background: rgba(48,38,14,.92); border: 1px solid #8a7232; color: var(--amber2); font: 600 calc(13px * var(--k)) 'Golos Text', sans-serif; white-space: nowrap; }
#shopWin .tok .ic { width: calc(19px * var(--k)); height: calc(19px * var(--k)); }
#shopWin.has-token .tok { display: flex; }
#shopWin .sq { width: max(40px, calc(40px * var(--k))); height: max(40px, calc(40px * var(--k))); display: grid; place-items: center; background: rgba(17,21,15,.9); border: 1px solid #36412f; color: var(--dim); }
#shopWin .sq .ic { width: calc(20px * var(--k)); height: calc(20px * var(--k)); }
#shopWin .sq.q { font: 600 calc(18px * var(--k)) 'Oswald', sans-serif; color: var(--amber2); border-color: #6b5a2a; }
#shopWin .sq.q[aria-expanded="true"] { background: var(--amber); color: #17190f; border-color: var(--amber); }
#shopWin .sq:hover { border-color: #5c6a4f; color: #f3f0e6; }
#shopWin .sinfo { position: absolute; z-index: 5; left: var(--sl); top: calc(62px * var(--k) + var(--st) + var(--extra-top, 0px)); width: calc(330px * var(--k)); transform: translate(calc(var(--mx, 0) * -4px), calc(var(--my, 0) * -2px)); transition: transform .25s linear; }
#shopWin .kick { display: flex; align-items: baseline; gap: calc(8px * var(--k)); font-size: calc(12.5px * var(--k)); color: var(--dim); }
#shopWin .kick .idx { font: 600 calc(12px * var(--k)) 'JetBrains Mono', monospace; color: var(--acc); }
#shopWin .name { margin: calc(4px * var(--k)) 0 0; font: 600 calc(52px * var(--k))/.9 'Oswald', 'Arial Narrow', sans-serif; letter-spacing: -.005em; text-shadow: 0 2px 18px rgba(0,0,0,.6); }
#shopWin .name span { display: block; } #shopWin .name span.a { color: var(--acc2, #f3f0e6); }
#shopWin .chips { display: flex; margin-top: calc(10px * var(--k)); height: calc(6px * var(--k)); width: calc(132px * var(--k)); } #shopWin .chips i { flex: 1; }
#shopWin .act { display: flex; align-items: center; gap: calc(10px * var(--k)); margin-top: calc(16px * var(--k)); flex-wrap: wrap; }
#shopWin .sbt { display: inline-flex; align-items: center; gap: calc(8px * var(--k)); height: max(44px, calc(46px * var(--k))); padding: 0 calc(22px * var(--k)) 0 calc(20px * var(--k)); font: 500 calc(18px * var(--k)) 'Oswald', sans-serif; letter-spacing: .02em; white-space: nowrap;
  clip-path: polygon(0 0, calc(100% - 12px * var(--k)) 0, 100% calc(12px * var(--k)), 100% 100%, 0 100%); }
#shopWin .sbt .ic { width: calc(18px * var(--k)); height: calc(18px * var(--k)); }
#shopWin .sbt b { font: 600 calc(17px * var(--k)) 'JetBrains Mono', monospace; letter-spacing: -.02em; }
#shopWin .sbt.main { background: var(--amber); color: #17190f; } #shopWin .sbt.main:hover { background: var(--amber2); } #shopWin .sbt.main .gem { color: #17532f; }
#shopWin .sbt.main[disabled] { opacity: .55; cursor: default; }
#shopWin .sbt.short { background: rgba(17,21,15,.86); color: var(--dim); box-shadow: inset 0 0 0 1px #5a4c2a; clip-path: none; } #shopWin .sbt.short b { color: var(--amber2); }
#shopWin .sbt.worn { background: rgba(17,21,15,.86); color: var(--ok); box-shadow: inset 0 0 0 1px #3f5a35; clip-path: none; cursor: default; }
#shopWin .stag { display: inline-flex; align-items: center; gap: calc(6px * var(--k)); font: 500 calc(13px * var(--k)) 'Golos Text', sans-serif; color: var(--ok); }
#shopWin .stag .ic { width: calc(14px * var(--k)); height: calc(14px * var(--k)); }
#shopWin .strike { font: 500 calc(13px * var(--k)) 'JetBrains Mono', monospace; color: var(--mute); text-decoration: line-through; display: inline-flex; align-items: center; gap: .3em; }
#shopWin .note { margin-top: calc(10px * var(--k)); font-size: calc(12.5px * var(--k)); color: var(--dim); max-width: calc(300px * var(--k)); }
#shopWin .note button { color: var(--amber2); text-decoration: underline; text-underline-offset: 3px; text-decoration-thickness: 1px; }
#shopWin .note.err { color: #f09a7a; }
#shopWin .stamp { position: absolute; left: calc(150px * var(--k)); top: calc(-4px * var(--k)); padding: calc(3px * var(--k)) calc(10px * var(--k)); border: calc(3px * var(--k)) double var(--ok); color: var(--ok); font: 600 calc(17px * var(--k)) 'Oswald', sans-serif; transform: rotate(-8deg); opacity: 0; pointer-events: none; }
#shopWin .tray { position: absolute; z-index: 5; left: var(--sl); right: var(--sr); bottom: calc(12px * var(--k) + var(--sa-b, 0px)); display: grid; gap: calc(6px * var(--k)); justify-items: start; }
#shopWin .ticket { display: none; align-items: center; gap: calc(8px * var(--k)); height: calc(28px * var(--k)); padding: 0 calc(16px * var(--k)) 0 calc(14px * var(--k)); background: #e4dcc3; color: #2a261d; font: 600 calc(13px * var(--k)) 'Golos Text', sans-serif;
  clip-path: polygon(0 0, 100% 0, calc(100% - 6px * var(--k)) 50%, 100% 100%, 0 100%, calc(6px * var(--k)) 50%); }
#shopWin .ticket .ic { width: calc(16px * var(--k)); height: calc(16px * var(--k)); color: #8a5a12; }
#shopWin.has-token .ticket { display: inline-flex; }
#shopWin .tiles { display: flex; gap: calc(8px * var(--k)); align-items: flex-end; }
#shopWin .tile { position: relative; width: calc(170px * var(--k)); height: max(48px, calc(58px * var(--k))); background: rgba(17,21,15,.9); border: 1px solid #2f3828; text-align: left; padding: calc(7px * var(--k)) calc(6px * var(--k)) calc(6px * var(--k)) calc(80px * var(--k));
  display: flex; flex-direction: column; justify-content: center; transition: background .2s, border-color .2s, transform .3s var(--ease); }
#shopWin .tile img { position: absolute; left: calc(-6px * var(--k)); top: calc(-10px * var(--k)); width: calc(84px * var(--k)); height: calc(47px * var(--k)); filter: brightness(.62) saturate(.7) drop-shadow(0 3px 3px rgba(0,0,0,.6)); transition: filter .3s, transform .3s var(--ease); }
#shopWin .tile b { font: 600 calc(12.5px * var(--k))/1.08 'Golos Text', sans-serif; }
#shopWin .tile small { margin-top: calc(4px * var(--k)); font: 500 calc(11.5px * var(--k)) 'JetBrains Mono', monospace; color: var(--dim); display: flex; align-items: center; gap: .35em; }
#shopWin .tile small.t { font-family: 'Golos Text', sans-serif; } #shopWin .tile small.worn { color: var(--ok); } #shopWin .tile small.tk { color: var(--amber2); }
#shopWin .tile::before { content: ""; position: absolute; left: -1px; right: -1px; top: -1px; height: calc(3px * var(--k)); background: var(--acc); transform: scaleX(0); transform-origin: left; transition: transform .35s var(--ease); }
#shopWin .tile.on { background: rgba(31,37,27,.96); border-color: #4b5640; transform: translateY(calc(-4px * var(--k))); } #shopWin .tile.on::before { transform: scaleX(1); }
#shopWin .tile.on img { filter: brightness(1) saturate(1) drop-shadow(0 4px 4px rgba(0,0,0,.6)); transform: translate(calc(2px * var(--k)), calc(-3px * var(--k))) scale(1.08); }
#shopWin .tile:not(.on):hover { border-color: #46513c; }
#shopWin .soon { font-size: calc(12px * var(--k)); color: var(--mute); }
#shopWin .shint { position: absolute; z-index: 8; right: var(--sr); top: calc(58px * var(--k) + var(--st)); width: calc(292px * var(--k)); background: #151a12; border: 1px solid #3a4531; box-shadow: 0 calc(10px * var(--k)) calc(30px * var(--k)) rgba(0,0,0,.55); padding: calc(12px * var(--k)) calc(14px * var(--k)); display: none; }
#shopWin .shint.open { display: block; animation: shpDrop .25s var(--ease); }
@keyframes shpDrop { from { opacity: 0; transform: translateY(calc(-6px * var(--k))); } }
#shopWin .shint h3 { margin: 0 0 calc(8px * var(--k)); font: 500 calc(16px * var(--k)) 'Oswald', sans-serif; display: flex; align-items: center; gap: calc(7px * var(--k)); }
#shopWin .shint p { margin: 0; padding: calc(8px * var(--k)) 0; border-top: 1px solid #262e21; font-size: calc(13px * var(--k)); } #shopWin .shint p small { display: block; color: var(--mute); font-size: calc(11.5px * var(--k)); }
`;

// компасная площадка (девиационный круг) под самолётом
function padSVG(i) {
  let t = '', n = '';
  for (let a = 0; a < 360; a += 5) {
    const r0 = a % 30 === 0 ? 118 : a % 10 === 0 ? 124 : 128, rad = (a - 90) * Math.PI / 180;
    t += `<line x1="${(Math.cos(rad) * r0).toFixed(1)}" y1="${(Math.sin(rad) * r0).toFixed(1)}" x2="${(Math.cos(rad) * 134).toFixed(1)}" y2="${(Math.sin(rad) * 134).toFixed(1)}" stroke-width="${a % 30 ? 2 : 3.4}"/>`;
  }
  for (let a = 0; a < 360; a += 30) {
    const rad = (a - 90) * Math.PI / 180, x = Math.cos(rad) * 104, y = Math.sin(rad) * 104;
    n += `<text x="${x.toFixed(1)}" y="${(y + 5).toFixed(1)}" transform="rotate(${a} ${x.toFixed(1)} ${y.toFixed(1)})">${a === 0 ? (LANG === 'en' ? 'N' : 'С') : String(a / 10).padStart(2, '0')}</text>`;
  }
  return `<svg class="pad" viewBox="-160 -50 320 100" aria-hidden="true"><defs>
    <filter id="shpWear${i}" x="-200" y="-200" width="400" height="400" filterUnits="userSpaceOnUse"><feTurbulence type="fractalNoise" baseFrequency=".09" numOctaves="2" seed="${7 + i}"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -3.4 2.25"/><feComposite in="SourceGraphic" operator="in"/></filter>
    <radialGradient id="shpPl${i}"><stop offset="0" stop-color="#3a3528" stop-opacity=".55"/><stop offset="1" stop-color="#3a3528" stop-opacity="0"/></radialGradient></defs>
    <g transform="scale(1 .3)"><circle r="150" fill="url(#shpPl${i})"/><g filter="url(#shpWear${i})">
      <circle r="140" fill="none" stroke="#c99a3c" stroke-width="7" opacity=".75"/><circle r="96" fill="none" stroke="#d8d2bf" stroke-width="2" opacity=".5"/>
      <g stroke="#d8d2bf" opacity=".62">${t}</g><g fill="#d8d2bf" opacity=".55" font-family="JetBrains Mono, monospace" font-weight="600" font-size="15" text-anchor="middle">${n}</g>
      <path d="M-210 300 C -170 120 -70 40 0 0" fill="none" stroke="#c99a3c" stroke-width="5" opacity=".6"/><path d="M0 -96 L0 96 M-12 -80 L0 -96 L12 -80" fill="none" stroke="#d8d2bf" stroke-width="2.4" opacity=".45"/>
    </g></g></svg>`;
}

// пол: бетонные плиты ночного аэродрома в перспективе, огни рулёжки и фонари на горизонте
function floorSVG(vw, vh, padY) {
  const hz = vh * 0.13, vx = vw * 0.56, F = (padY - hz) * 2.2, rows = [];
  let seams = '', patches = '', lights = '';
  for (let z = 1.1; z < 26; z *= 1.45) rows.push(hz + F / z);
  const col = (i, y) => vx + (i * vw * 0.42) * ((y - hz) / (F / 1.1));
  let seed = 5; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let r = 0; r < rows.length - 1; r++) for (let i = -7; i < 7; i++) {
    const y0 = rows[r], y1 = rows[r + 1], tone = rnd();
    if (tone < 0.35) continue;
    const pts = [[col(i, y0), y0], [col(i + 1, y0), y0], [col(i + 1, y1), y1], [col(i, y1), y1]].map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ');
    patches += `<polygon points="${pts}" fill="${tone > 0.7 ? '#fff' : '#000'}" opacity="${((0.015 + rnd() * 0.04) * Math.min(1, (y0 - hz) / (vh * 0.35))).toFixed(3)}"/>`;
  }
  rows.forEach((y, r) => { seams += `<line x1="0" y1="${y.toFixed(1)}" x2="${vw}" y2="${y.toFixed(1)}" stroke-width="${Math.max(0.7, 2.6 / (1 + r * 0.6)).toFixed(2)}"/>`; });
  for (let i = -7; i <= 7; i++) seams += `<line x1="${vx}" y1="${hz}" x2="${col(i, vh * 2).toFixed(1)}" y2="${vh * 2}" stroke-width="1.6"/>`;
  for (const [fx, fz] of [[-0.62, 9], [-0.4, 12], [-0.22, 15], [0.5, 10], [0.7, 8], [0.86, 11], [0.3, 16]]) {
    const y = hz + F / (fz * 3), x = vx + fx * vw * 0.5;
    lights += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.3" fill="#3d6fd6" opacity=".16"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.1" fill="#9db9ff" opacity=".8"/>`;
  }
  for (const [fx, fs] of [[0.08, 1], [0.27, 0.7], [0.83, 0.85], [0.95, 0.6]]) {
    const x = vw * fx, y = hz - 6 * fs;
    lights += `<circle cx="${x}" cy="${y}" r="${18 * fs}" fill="url(#shpHalo)"/><rect x="${x - 3 * fs}" y="${y - 1.5}" width="${6 * fs}" height="3" fill="#ffe2a6"/><line x1="${x}" y1="${y}" x2="${x}" y2="${hz + 2}" stroke="#1b1e18" stroke-width="1.5"/>`;
  }
  return `<defs>
    <linearGradient id="shpSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#090b09"/><stop offset=".75" stop-color="#14140f"/><stop offset="1" stop-color="#2a2318"/></linearGradient>
    <linearGradient id="shpGnd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#151712"/><stop offset=".35" stop-color="#22251f"/><stop offset="1" stop-color="#2b2e27"/></linearGradient>
    <radialGradient id="shpHalo"><stop offset="0" stop-color="#ffd27a" stop-opacity=".45"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient>
    <filter id="shpConc" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".8 1.6" numOctaves="3" seed="4" result="n"/><feColorMatrix in="n" values="0 0 0 0 .5  0 0 0 0 .5  0 0 0 0 .46  0 0 0 .55 -.05"/></filter>
    <filter id="shpStain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".006 .02" numOctaves="3" seed="9"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 1.05"/></filter>
    <linearGradient id="shpFade" x1="0" y1="${hz}" x2="0" y2="${vh}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".35" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity=".8"/></linearGradient>
    <mask id="shpSeam"><rect y="${hz}" width="${vw}" height="${vh - hz}" fill="url(#shpFade)"/></mask>
    <clipPath id="shpBelow"><rect x="0" y="${hz}" width="${vw}" height="${vh - hz}"/></clipPath></defs>
    <rect width="${vw}" height="${hz}" fill="url(#shpSky)"/><rect y="${hz}" width="${vw}" height="${vh - hz}" fill="url(#shpGnd)"/>
    <g clip-path="url(#shpBelow)"><rect y="${hz}" width="${vw}" height="${vh - hz}" filter="url(#shpStain)" opacity=".5"/>
      <rect y="${hz}" width="${vw}" height="${vh - hz}" filter="url(#shpConc)" opacity=".18" style="mix-blend-mode:overlay"/>${patches}<g stroke="#11130f" opacity=".75" mask="url(#shpSeam)">${seams}</g></g>
    <rect y="${hz - 1}" width="${vw}" height="2" fill="#2e2a20" opacity=".8"/>${lights}`;
}

export function createShop(C) {
  const style = document.createElement('style'); style.textContent = CSS; if (document.head) document.head.appendChild(style); // (заглушка DOM стенда — без head/body)
  const root = document.createElement('div'); root.id = 'shopWin'; root.setAttribute && root.setAttribute('role', 'dialog'); root.setAttribute && root.setAttribute('aria-modal', 'true');
  if (document.body && document.body.appendChild) document.body.appendChild(root);
  const S = { w: null, season: 1, err: '', key: null, at: 0, busy: false, sel: 0, hint: false, act: false, built: '' };
  const $ = (id) => document.getElementById(id);
  const q = (s) => root.querySelector(s);
  const gem = ico('gem', 'gem');
  const out = () => CAMOS.filter((c) => c.season && c.season <= S.season && LOOK[c.key]).sort((a, b) => b.season - a.season).map((c) => c.key); // новые — первыми
  const acc = () => activeAcc();
  const owned = (k) => !!S.w && S.w.camos.includes(k);
  const worn = (k) => { const [pl, id] = k.split(':'); return !!S.w && (S.w.worn || {})[pl] === id; };

  // ── кнопка в меню: баланс и самолёт новой окраски ──
  function paint() {
    const sub = S.w ? `${gem}<b>${nf(S.w.crystals)}</b> · ${tr('окраски')}` : tr('окраски сезона');
    if ($('shopSub') && $('shopSub').innerHTML !== sub) $('shopSub').innerHTML = sub;
    const k = out()[0], src = k ? img(k, true) : '';
    if ($('shopPeek') && k && !String($('shopPeek').src).endsWith(src)) $('shopPeek').src = src;
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
      catch (e) { err = e.status === 404 && !e.code ? 'soon' : e.message || tr('Нет связи с сайтом'); }
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
    if (S.act) return; S.act = true; draw();
    let d = null, err = '';
    try { d = await callFn('airdef-shop', { player_id: keyNow(), action, key, ...extra }); } catch (e) { err = e.message || tr('Нет связи с сайтом'); }
    S.act = false;
    if (d && d.wallet) { const from = S.w ? S.w.crystals : 0; S.w = d.wallet; draw(); countTo(from, S.w.crystals); paint(); } else { S.err = err; draw(); S.err = ''; }
    return !!d;
  }

  // ── раскладка: размер героя и места соседей от размера экрана ──
  function layout() {
    const vw = innerWidth, vh = innerHeight, r = root.style;
    const k = Math.max(0.82, Math.min(1.3, Math.min(vw / 932, vh / 430)));
    r.setProperty('--k', k);
    const hw = Math.min(vw * 0.66, vh * 1.4), hh = hw * 0.5625, cx = vw * (vw / vh > 1.9 ? 0.6 : 0.585), cy = vh * 0.47;
    r.setProperty('--hw', hw + 'px'); r.setProperty('--hx', cx - hw / 2 + 'px'); r.setProperty('--hy', cy - hh / 2 + 'px');
    r.setProperty('--lx', vw * 0.03 - cx + 'px'); r.setProperty('--ly', -hh * 0.16 + 'px');
    r.setProperty('--rx', vw - cx + 'px'); r.setProperty('--ry', -hh * 0.2 + 'px');
    r.setProperty('--extra-top', Math.max(0, (vh - 430 * k) * 0.25) + 'px');
    const pool = q('.pool'), pw = hw * 1.25, ph = hh * 0.7;
    if (pool) Object.assign(pool.style, { left: cx - pw / 2 + hw * 0.02 + 'px', top: cy + hh * 0.26 - ph / 2 + 'px', width: pw + 'px', height: ph + 'px' });
    const fl = q('.floor'); if (fl) { fl.setAttribute('viewBox', `0 0 ${vw} ${vh}`); fl.innerHTML = floorSVG(vw, vh, cy + hh * 0.3); }
  }

  // ── окно: каркас (раз на набор окрасок), затем сведения о выбранной ──
  function build() {
    const list = out(), sig = list.join(',') + '|' + LANG;
    if (S.built === sig) return; S.built = sig;
    root.innerHTML = `<svg class="floor" preserveAspectRatio="xMidYMid slice" aria-hidden="true"></svg><div class="pool"></div>
      <div class="slots">${list.map((k, i) => `<div class="slot" data-i="${i}"><div class="par">${padSVG(i)}<img class="shadow" src="${img(k)}" alt=""><div class="float"><img src="${img(k)}" alt="${trIf(PLANES[k.split(':')[0]] || '')} · ${camoName(k)}"></div></div></div>`).join('')}</div>
      <div class="vign"></div>
      <header class="top"><div class="t"><h1>${tr('Магазин')}</h1><small class="ssub"></small></div>
        <div class="tok" title="${tr('Окраска на выбор')}">${ico('ticket')}<span class="tokN"></span></div>
        <div class="bal" title="${tr('Кристаллы')}"><small>${tr('кристаллы')}</small>${gem}<b class="balN">—</b></div>
        <button class="sq q" data-a="q" aria-expanded="false" title="${tr('Откуда кристаллы')}">?</button>
        <button class="sq" data-a="close" title="${tr('Закрыть')}" aria-label="${tr('Закрыть')}">${ico('close')}</button></header>
      <div class="sinfo"><div class="kick"><span class="idx"></span><span class="pln"></span></div><h2 class="name"></h2><div class="chips"></div><div class="act"></div><div class="note"></div><div class="stamp"></div></div>
      <div class="tray"><span class="ticket">${ico('ticket')}${tr('Окраска на выбор — возьмите любую')}</span>
        <div class="tiles">${list.map((k, i) => `<button class="tile" data-i="${i}" style="--acc:${LOOK[k].acc}"><img src="${img(k, true)}" alt=""><b>${camoName(k).replace(' ', '<br>')}</b><small></small></button>`).join('')}</div>
        <span class="soon">${tr('Каждый сезон — 2 новые окраски')}</span></div>
      <div class="shint" role="dialog" aria-label="${tr('Откуда кристаллы')}"><h3>${gem}${tr('Откуда кристаллы')}</h3>
        <p>${tr('Награда за онлайн-рейтинг')}<small>${tr('начисляются в конце сезона')}</small></p>
        <p>${tr('Каждый сезон — 2 новые окраски')}<small>${tr('купленная окраска остаётся навсегда; надеть или снять — здесь же')}</small></p></div>`;
    layout();
  }

  function draw() {
    build();
    const list = out(), n = list.length; if (!n) return;
    S.sel = Math.min(S.sel, n - 1);
    const k = list[S.sel], L = LOOK[k], a = acc(), w = S.w;
    root.classList.toggle('has-token', !!w && w.picks > 0);
    q('.ssub').textContent = tr('окраски сезона {0}', [S.season]);
    q('.balN').textContent = w ? nf(w.crystals) : '—';
    q('.tokN').textContent = w ? tr('на выбор: {0}', [w.picks]) : '';
    root.querySelectorAll('.slot').forEach((el) => { const d = (+el.dataset.i - S.sel + n) % n; el.classList.remove('l', 'c', 'r', 'off'); el.classList.add(d === 0 ? 'c' : d === 1 ? 'r' : d === n - 1 ? 'l' : 'off'); });
    const info = q('.sinfo'); info.style.setProperty('--acc', L.acc); info.style.setProperty('--acc2', L.acc2);
    q('.idx').textContent = String(S.sel + 1).padStart(2, '0') + ' / ' + String(n).padStart(2, '0');
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
    const h = q('.shint'), qb = q('.sq.q'); h.classList.toggle('open', S.hint); qb.setAttribute('aria-expanded', S.hint);
  }
  function select(i, anim) {
    S.sel = i; draw();
    if (anim && !RM && q('.name').animate) {
      q('.name').animate([{ opacity: 0, transform: 'translateX(-14px)', clipPath: 'inset(0 100% 0 0)' }, { opacity: 1, transform: 'none', clipPath: 'inset(0 0 0 0)' }], { duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)' });
      q('.act').animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay: 120, fill: 'backwards' });
    }
  }
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
    const b = e.target.closest('[data-a]'), slot = e.target.closest('.slot:not(.c)'), tile = e.target.closest('.tile');
    if (!b || b.dataset.a !== 'q') if (S.hint && !e.target.closest('.shint')) { S.hint = false; draw(); }
    if (slot) { select(+slot.dataset.i, true); return; }
    if (tile) { if (C.snd && C.snd.click) C.snd.click(); select(+tile.dataset.i, true); return; }
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
  // свайп и параллакс от мыши
  let sx = null, tx = 0, ty = 0, mx = 0, my = 0, raf = 0;
  root.addEventListener && root.addEventListener('pointerdown', (e) => { sx = e.clientX; });
  root.addEventListener && root.addEventListener('pointerup', (e) => {
    if (sx == null) return; const dx = e.clientX - sx, n = out().length; sx = null;
    if (Math.abs(dx) > 50 && n > 1 && !e.target.closest('.shint')) select((S.sel + (dx < 0 ? 1 : n - 1)) % n, true);
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
      S.hint = false; root.classList.add('on'); select(S.sel, false); layout();
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
