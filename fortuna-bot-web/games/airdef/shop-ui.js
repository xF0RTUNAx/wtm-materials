// Магазин «Воздушного превосходства» (Mark 2026-10-26 - вариант «Витрина»): особые окраски самолётов за кристаллы. В магазине - окраски, вышедшие к
// текущему сезону (arsenal.js CAMOS: season), новые первыми. Окно: выбранный самолёт в полёте на фоне настоящего неба (Mark: «чтобы не бросалась в
// глаза процедурная работа» - рендер Blender: модель с окраской, свет и фон - фото-панорама неба Poly Haven, CC0; tools/airdef-models/shop-sky-render.py),
// при смене окраски небо плавно сменяется, самолёт влетает справа; слева - название, цена и кнопка; внизу плитки окрасок. Картинки - airdef/shop/
// <самолёт>_<окраска>.webp (самолёт на прозрачном фоне), _sky.webp (небо), _s.webp (карточка). Данные - функция airdef-shop (кристаллы, свои окраски,
// picks - окраски «на выбор», worn - надетые: самолёт → окраска); ?rmock=1 - заглушка account.js (?shop=token|owned|poor - её состояния для снимков).
// Правила наград за сезон в игре не объявляются (Mark): в подсказке - только «за рейтинг, в конце сезона».
// Вкладки «Премиум» и «Кристаллы» (Mark 2026-11-19, «Витрина над облаками», Магазин/Премиум/_чистовые/ПАСПОРТ.md): видео-фон с перекрёстным растворением, талоны бронза / серебро /
// золото с ценой в Telegram Stars, блик, преимущества, согласие и «Купить». Оплата - pay.js (счёт Telegram, опрос заказа), срок премиума - progress-net.js.
import { ico } from './icons.js?v=20261118d';
import { tr, trIf, LANG, LOCALE } from './i18n.js?v=20261118d';
import { activeAcc, callFn } from './account.js?v=20261118d';
import { CAMOS, CAMO_PRICE, PLANES, AVA_SHOP, AVA_PRICE, avaKey, PAY, PREM_K } from './arsenal.js?v=20261118d';
import { avaSrc } from './avatar.js?v=20261118d';
import { wings, ddmmHm } from './prem.js?v=20261118d';

const LOC = LOCALE;
const nf = (v) => Math.round(v).toLocaleString(LOC);
const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const RM = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const FRESH = 60000, RETRY = 30000;
// вид окраски на витрине: название (первое слово - светлое, остальное - цветом окраски; одно слово - цветом), акценты и полоска цветов
const LOOK = {
  'e_f15e:inferno': { name: 'Инферно', acc: '#ef7a2a', acc2: '#f6a04a', chips: ['#1d1d20', '#a3241a', '#e0531c', '#f39528', '#ffd264'] },
  'e_typhoon:harlequin': { name: 'Арлекин', acc: '#247e6c', acc2: '#a9cf5a', chips: ['#0d1f45', '#2a1a6e', '#247e6c', '#a9cf5a', '#f0802a', '#ffd84a'] }, // сезон 1 с 2026-11-18 (Mark)
  'e_tu22:milk': { name: 'Сгущёнка', acc: '#4f9fe6', acc2: '#cfe6f7', chips: ['#1f2f86', '#3256c0', '#5aa7ea', '#cde7f8', '#ffffff'] }, // сезон 1 с 2026-11-18 (Mark): голубой фон, синяя решётка, белые клинья
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
#shopWin .skyi { position: absolute; inset: 0; background: center / cover no-repeat; /* в кадре неба - только облака: горизонт с размытым низом панорамы - ниже кадра (shop-sky-render.py skyup) */ opacity: 0; transition: opacity 1s ease; animation: shpDrift 40s ease-in-out infinite alternate; }
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
#shopWin .top .t { display: flex; align-items: center; gap: calc(10px * var(--k)); margin-right: auto; min-width: 0; }
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
#shopWin .cats { display: flex; flex: none; }
#shopWin .cats button { height: calc(36px * var(--k)); padding: 0 calc(14px * var(--k)); font: 500 calc(15px * var(--k)) 'Oswald', sans-serif; letter-spacing: .02em; color: var(--dim); background: rgba(14,17,15,.72); border: 1px solid #3a4532; border-right-width: 0; display: flex; align-items: center; }
#shopWin .cats button:last-child { border-right-width: 1px; } #shopWin .cats button.on { background: var(--amber); color: #17190f; border-color: var(--amber); } #shopWin .cats button:not(.on):hover { color: #f3f0e6; }
#shopWin .avaL, #shopWin .avaG { display: none; }
#shopWin.cat-ava .avaL { display: block; } #shopWin.cat-ava .avaG { display: grid; }
#shopWin.cat-ava .hero, #shopWin.cat-ava .sinfo, #shopWin.cat-ava .tray, #shopWin.cat-ava .tok, #shopWin.cat-ava .ssub { display: none; }
#shopWin.cat-pay .sky, #shopWin.cat-pay .hero, #shopWin.cat-pay .sinfo, #shopWin.cat-pay .tray, #shopWin.cat-pay .tok, #shopWin.cat-pay .ssub { display: none; }
#shopWin .avaL { position: absolute; z-index: 5; left: var(--sl); top: var(--at); width: var(--fs); }
#shopWin .avaL .frame { display: block; width: var(--fs); height: var(--fs); object-fit: cover; box-shadow: 0 0 0 calc(2px * var(--k)) var(--amber), 0 calc(10px * var(--k)) calc(26px * var(--k)) rgba(0,0,0,.55); }
#shopWin .aact { display: flex; align-items: center; gap: calc(10px * var(--k)); margin-top: calc(12px * var(--k)); flex-wrap: wrap; }
#shopWin .anote { max-width: none; margin-top: calc(6px * var(--k)); } #shopWin .anote:empty { display: none; }
#shopWin .seenT { margin-top: calc(10px * var(--k)); font-size: calc(11.5px * var(--k)); color: var(--dim); text-shadow: 0 1px 4px rgba(0,0,0,.6); } #shopWin.lowh .seenT { display: none; }
#shopWin .seen { margin-top: calc(6px * var(--k)); padding: calc(5px * var(--k)) calc(9px * var(--k)); display: flex; align-items: center; gap: calc(9px * var(--k)); background: rgba(14,17,15,.84); border: 1px solid #333d2c; min-width: 0; }
#shopWin .seen img { flex: none; width: calc(34px * var(--k)); height: calc(34px * var(--k)); object-fit: cover; box-shadow: 0 0 0 1px rgba(232,177,74,.7); }
#shopWin .seen span { min-width: 0; } #shopWin .seen b { display: block; font: 500 calc(15px * var(--k)) 'Oswald', sans-serif; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } #shopWin .seen small { display: block; color: var(--mute); font-size: calc(11.5px * var(--k)); white-space: nowrap; } #shopWin .seen small:empty { display: none; }
#shopWin .avaL .stamp { left: 0; right: 0; margin-inline: auto; width: fit-content; top: calc(var(--fs) * .4); background: rgba(14,17,15,.7); }
#shopWin .avaG { position: absolute; z-index: 5; left: calc(var(--sl) + var(--fs) + 24px * var(--k)); top: var(--at); grid-template-columns: repeat(5, var(--ts)); gap: calc(10px * var(--k)); }
#shopWin .atile { display: block; padding: calc(4px * var(--k)); background: rgba(14,17,15,.84); border: 1px solid #333d2c; transition: border-color .2s, background .2s; }
#shopWin .atile img { display: block; width: 100%; aspect-ratio: 1; object-fit: cover; filter: saturate(.85) brightness(.88); transition: filter .25s; }
#shopWin .atile.on { background: rgba(26,31,24,.94); border-color: var(--amber); } #shopWin .atile.on img, #shopWin .atile:hover img { filter: none; } #shopWin .atile:not(.on):hover { border-color: #4c5843; }
#shopWin .atile .pr { display: flex; justify-content: center; align-items: center; gap: .3em; padding-top: calc(3px * var(--k)); font: 500 calc(12.5px * var(--k)) 'JetBrains Mono', monospace; color: var(--dim); white-space: nowrap; }
#shopWin .atile .pr.t { font-family: 'Golos Text', sans-serif; } #shopWin .atile .pr.worn { color: var(--ok); }
@property --c1 { syntax: '<color>'; inherits: true; initial-value: #d6b06a; }
@property --c2 { syntax: '<color>'; inherits: true; initial-value: #f6e3b4; }
#shopWin { --c1: #d6b06a; --c2: #f6e3b4; --ps: 1; --py: 64px; transition: --c1 1.6s cubic-bezier(.45,0,.55,1), --c2 1.6s cubic-bezier(.45,0,.55,1); }
#shopWin.cat-gems { --c1: #62c792; --c2: #d9ffe9; }
#shopWin .pvid, #shopWin .pbox { display: none; }
#shopWin.cat-pay .pvid { display: block; } #shopWin.cat-pay .pbox { display: block; }
#shopWin .pvid { position: absolute; inset: 0; z-index: -2; background: #14100c; }
#shopWin .pv { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity 2.4s cubic-bezier(.45,0,.55,1); }
#shopWin .pv.on { opacity: 1; }
#shopWin .pbox { position: absolute; z-index: 5; left: var(--sl); top: var(--py); width: calc(410px * var(--ps)); }
#shopWin .ppane { display: none; } #shopWin.cat-prem .ppane[data-g="prem"], #shopWin.cat-gems .ppane[data-g="gems"] { display: block; }
#shopWin .pttl { margin: 0; font: 300 calc(34px * var(--ps))/1.05 'Oswald', 'Arial Narrow', sans-serif; letter-spacing: calc(3px * var(--ps)); text-transform: uppercase; color: transparent; -webkit-background-clip: text; background-clip: text;
  background: linear-gradient(100deg, var(--c1) 0%, var(--c1) 40%, var(--c2) 50%, var(--c1) 60%, var(--c1) 100%) 100% 0 / 300% 100%; -webkit-background-clip: text; background-clip: text; animation: pShim 6s cubic-bezier(.45,0,.55,1) infinite; }
@keyframes pShim { 0% { background-position: 100% 0; } 43% { background-position: 0 0; } 100% { background-position: 0 0; } }
#shopWin .perks { margin-top: calc(8px * var(--ps)); display: grid; gap: calc(4px * var(--ps)); font: 500 max(9.5px, calc(10.5px * var(--ps)))/1.25 'Golos Text', sans-serif; color: #e9e2d3; text-shadow: 0 1px 6px rgba(0,0,0,.6); }
#shopWin .perks div { display: flex; gap: 8px; align-items: baseline; } #shopWin .perks i { flex: none; width: 4px; height: 4px; border: 1px solid var(--c1); transform: rotate(45deg) translateY(-1px); }
#shopWin .plead { margin-top: calc(8px * var(--ps)); font: 400 max(9.5px, calc(10.5px * var(--ps)))/1.45 'Golos Text', sans-serif; color: #b9b0a0; text-shadow: 0 1px 6px rgba(0,0,0,.6); }
#shopWin .pact { margin-top: calc(7px * var(--ps)); display: flex; align-items: center; gap: 7px; flex-wrap: wrap; font: 600 max(10px, calc(11px * var(--ps)))/1.2 'Golos Text', sans-serif; color: var(--c2); text-shadow: 0 1px 6px rgba(0,0,0,.6); }
#shopWin .pact[hidden] { display: none; } #shopWin .pact small { font-weight: 500; color: #b9b0a0; }
#shopWin .pcards { display: none; grid-template-columns: repeat(3, 1fr); gap: calc(9px * var(--ps)); margin-top: calc(12px * var(--ps)); padding-top: 3px; width: calc(330px * var(--ps)); }
#shopWin.cat-prem .pcards[data-g="prem"], #shopWin.cat-gems .pcards[data-g="gems"] { display: grid; }
#shopWin .talon { position: relative; aspect-ratio: 600 / 780; display: block; width: 100%; background: var(--mk) center / 100% 100% no-repeat; filter: drop-shadow(0 calc(6px * var(--ps)) calc(10px * var(--ps)) rgba(0,0,0,.45)); transition: transform 1.6s cubic-bezier(.45,0,.55,1); color: #1f2635; text-align: center; }
#shopWin .talon.on { transform: translateY(-3px); }
#shopWin .talon > * { position: absolute; z-index: 2; }
#shopWin .talon .ic2 { left: 0; right: 0; top: 14%; height: 33%; display: flex; align-items: center; justify-content: center; }
#shopWin .talon .ic2 img { max-height: 100%; max-width: 74%; object-fit: contain; filter: drop-shadow(0 4px 6px rgba(0,0,0,.35)); transition: transform 1.6s cubic-bezier(.45,0,.55,1); }
#shopWin .talon.on .ic2 img { transform: scale(1.06); }
#shopWin .talon .num { left: 0; right: 0; top: 46.5%; display: flex; justify-content: center; align-items: baseline; gap: 4px; font: 300 calc(21px * var(--ps))/1 'Oswald', sans-serif; color: #1f2635; font-variant-numeric: tabular-nums; }
#shopWin .talon .num small { font: 500 max(7.5px, calc(8px * var(--ps)))/1 'Golos Text', sans-serif; letter-spacing: 1.6px; text-transform: uppercase; color: #5a5f6b; }
#shopWin .talon .sv { left: 0; right: 0; top: 64.5%; font: 600 max(7.5px, calc(8px * var(--ps)))/1.1 'Golos Text', sans-serif; color: #2e7a4f; white-space: nowrap; }
#shopWin .talon .tpr { left: 4%; right: 4%; top: 74.8%; height: 21.2%; display: flex; align-items: center; justify-content: center; gap: .3em; font: 600 calc(13.5px * var(--ps))/1 'Oswald', sans-serif; letter-spacing: .8px; color: #1f2635; }
#shopWin .st { width: .95em; height: .95em; flex: none; display: inline-block; vertical-align: -0.1em; }
#shopWin .talon .best { z-index: 3; top: -7px; left: 50%; transform: translateX(-50%); padding: 1px 7px; white-space: nowrap; font: 600 7px/10px 'Golos Text', sans-serif; letter-spacing: 1.6px; text-transform: uppercase; color: #1a1408; background: linear-gradient(90deg, var(--c1), var(--c2), var(--c1)); border-radius: 6px; }
#shopWin .talon .glow { z-index: 1; inset: -1px; border-radius: 8px; border: 1px solid var(--c1); box-shadow: 0 0 14px -2px var(--c1), inset 0 0 18px -10px var(--c1); pointer-events: none; opacity: 0; transition: opacity 1.6s cubic-bezier(.45,0,.55,1); }
#shopWin .talon.on .glow { opacity: 1; }
#shopWin .talon > .shine { z-index: 6; inset: 0; pointer-events: none; background: linear-gradient(118deg, rgba(255,252,240,0) 44%, rgba(255,252,240,.18) 47.6%, rgba(255,252,240,.70) 50%, rgba(255,252,240,.18) 52.4%, rgba(255,252,240,0) 56%);
  background-size: 300% 300%; background-position: 100% 100%; -webkit-mask: var(--mk) center / 100% 100% no-repeat; mask: var(--mk) center / 100% 100% no-repeat; animation: pShine 4.5s 1.2s cubic-bezier(.45,0,.55,1) infinite; }
@keyframes pShine { 0% { background-position: 100% 100%; } 35.5% { background-position: 0% 0%; } 100% { background-position: 0% 0%; } }
#shopWin .pcta { margin-top: calc(9px * var(--ps)); } #shopWin .pbtn { width: calc(330px * var(--ps)); }
#shopWin .pbuy { width: 100%; min-height: calc(36px * var(--ps)); padding: 0 12px; display: flex; align-items: center; justify-content: center; gap: calc(12px * var(--ps)); border-radius: 8px; color: #140f06; font: 600 max(12px, calc(14px * var(--ps)))/1 'Oswald', sans-serif; letter-spacing: 2px; text-transform: uppercase;
  background: linear-gradient(100deg, var(--c1) 0%, var(--c1) 42%, var(--c2) 50%, var(--c1) 58%, var(--c1) 100%) 100% 0 / 320% 100%; box-shadow: 0 6px 18px rgba(0,0,0,.3); animation: pShim 6s 1.2s cubic-bezier(.45,0,.55,1) infinite; }
#shopWin .pbuy em { font-style: normal; font-weight: 500; opacity: .85; display: inline-flex; align-items: center; gap: .3em; letter-spacing: 1px; }
#shopWin .pbuy[disabled] { opacity: .45; cursor: default; animation: none; }
#shopWin .pwait { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: calc(8px * var(--ps)) 12px; border-radius: 8px; background: rgba(14,12,8,.78); border: 1px solid color-mix(in srgb, var(--c1) 55%, transparent); font: 500 max(10.5px, calc(12px * var(--ps)))/1.3 'Golos Text', sans-serif; color: #efe8da; }
#shopWin .pwait .dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--c1); animation: pDot 1.4s ease-in-out infinite; } @keyframes pDot { 50% { opacity: .25; transform: scale(.7); } }
#shopWin .pwait .sp2 { flex: 1 1 auto; } #shopWin .pwait button { color: var(--c2); text-decoration: underline; text-underline-offset: 3px; font-weight: 600; }
#shopWin .pwait a.pbuy { margin-top: 2px; text-decoration: none; letter-spacing: 1px; font-size: max(11px, calc(12.5px * var(--ps))); } #shopWin .pwait .row2 { flex: 1 1 100%; display: flex; gap: 10px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
#shopWin .pwait a.lnk { color: var(--c2); text-decoration: underline; text-underline-offset: 3px; font-weight: 500; }
#shopWin .pcons { display: none; align-items: flex-start; gap: 8px; margin-top: calc(8px * var(--ps)); font: 400 max(9px, calc(10px * var(--ps)))/1.35 'Golos Text', sans-serif; color: #cfc6b4; cursor: pointer; text-shadow: 0 1px 6px rgba(0,0,0,.6); }
#shopWin .pcons.on { display: flex; } #shopWin .pcons input { flex: none; appearance: none; -webkit-appearance: none; width: 14px; height: 14px; margin: 1px 0 0; border: 1px solid rgba(255,255,255,.5); border-radius: 3px; background: rgba(10,10,8,.55); cursor: pointer; display: grid; place-items: center; }
#shopWin .pcons input::after { content: ''; width: 7px; height: 4px; border: solid #140f06; border-width: 0 0 2px 2px; transform: rotate(-45deg) translate(0, -1px) scale(0); transition: transform .2s; }
#shopWin .pcons input:checked { background: var(--c1); border-color: var(--c1); } #shopWin .pcons input:checked::after { transform: rotate(-45deg) translate(0, -1px) scale(1); }
#shopWin .pcons input:focus-visible { outline: 2px solid var(--c2); outline-offset: 2px; }
#shopWin .pmeta { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 12px; margin-top: calc(5px * var(--ps)); }
#shopWin .pterms { display: inline-block; font: 500 max(9px, calc(10px * var(--ps)))/1.2 'Golos Text', sans-serif; color: var(--mute); text-decoration: underline; text-underline-offset: 3px; text-shadow: 0 1px 6px rgba(0,0,0,.6); }
#shopWin .pterms:hover { color: var(--dim); }
#shopWin .pnote { font: 500 max(9.5px, calc(10.5px * var(--ps)))/1.35 'Golos Text', sans-serif; color: var(--dim); text-shadow: 0 1px 6px rgba(0,0,0,.6); } #shopWin .pnote:empty { display: none; }
#shopWin .pnote.err { color: #f6a585; } #shopWin .pnote.ok { color: var(--ok); } #shopWin .pnote button { color: var(--c2); text-decoration: underline; text-underline-offset: 3px; }
@keyframes pIn { from { opacity: 0; transform: translateY(10px); } }
#shopWin.pin .ppane > *, #shopWin.pin .pcards .talon, #shopWin.pin .pcta { animation: pIn 1.3s cubic-bezier(.2,.8,.2,1) both; }
#shopWin.pin .perks div:nth-child(2) { animation-delay: .12s; } #shopWin.pin .perks div:nth-child(3) { animation-delay: .24s; }
#shopWin.pin .pcards .talon:nth-child(2) { animation-delay: .15s; } #shopWin.pin .pcards .talon:nth-child(3) { animation-delay: .3s; } #shopWin.pin .pcta { animation-delay: .35s; }
@media (prefers-reduced-motion: reduce) { #shopWin .pttl, #shopWin .pbuy, #shopWin .talon > .shine, #shopWin .pwait .dot, #shopWin.pin * { animation: none !important; } #shopWin .pv, #shopWin .talon, #shopWin .talon .glow { transition: none; } }
`;

export function createShop(C) {
  const style = document.createElement('style'); style.textContent = CSS; if (document.head) document.head.appendChild(style); // (заглушка DOM стенда - без head/body)
  const root = document.createElement('div'); root.id = 'shopWin'; root.setAttribute && root.setAttribute('role', 'dialog'); root.setAttribute && root.setAttribute('aria-modal', 'true');
  if (document.body && document.body.appendChild) document.body.appendChild(root);
  const S = { w: null, season: 1, err: '', key: null, at: 0, busy: false, sel: 0, shown: null, hint: false, act: false, built: '', cat: 'camo', asel: 0, ps: { prem: 1, gems: 2 }, consent: false, msg: '', pvOn: '' }; // cat - вкладка: окраски или аватарки (asel - выбранная)
  const $ = (id) => document.getElementById(id);
  const q = (s) => root.querySelector(s);
  const gem = ico('gem', 'gem');
  const pay = C.pay || { st: 'idle', err: '', blocked: false, link: '', on() {}, start: async () => false, cancel() {}, clearErr() {} }; // pay.js (в стендах без него - покупок нет)
  const STAR = '<svg class="st" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.3l2.85 6.2 6.75.8-5 4.65 1.3 6.7L12 17.2 6.1 20.65l1.3-6.7-5-4.65 6.75-.8z" fill="#f2b32c" stroke="#9a6a0c" stroke-width=".7" stroke-linejoin="round"/></svg>';
  const PK = { prem: ['prem_1d', 'prem_7d', 'prem_30d'], gems: ['gems_100', 'gems_550', 'gems_1200'] }, BAND = ['bronze', 'silver', 'gold'], isPay = (c) => c === 'prem' || c === 'gems';
  const unitP = (k) => PAY[k].stars / (PAY[k].prem || PAY[k].gems), savePct = (g, i) => (i ? Math.round((1 - unitP(PK[g][i]) / unitP(PK[g][0])) * 100) : 0); // выгода - от цены за единицу младшего талона
  const premUntil = () => { const u = S.w && S.w.premium_until; return u && Date.parse(u) > Date.now() ? u : null; };
  const syncPrem = () => { if (S.w && C.progress && C.progress.setPrem) C.progress.setPrem(S.w.premium_until || null); }; // срок - в одно место клиента (progress-net.js)
  const out = () => CAMOS.filter((c) => c.season && c.season <= S.season && LOOK[c.key]).sort((a, b) => b.season - a.season).map((c) => c.key); // новые - первыми
  const acc = () => activeAcc();
  const owned = (k) => !!S.w && S.w.camos.includes(k);
  const worn = (k) => { const [pl, id] = k.split(':'); return !!S.w && (S.w.worn || {})[pl] === id; };

  // ── кнопка в меню: баланс (картинка - «Нефритовый дракон», Mark: в разметке) ──
  function paint() {
    const sub = S.w ? `${gem}<b>${nf(S.w.crystals)}</b>` : tr('окраски и аватарки');
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
      catch (e) { err = e.status === 404 && (!e.code || e.code === 'NOT_FOUND') ? 'soon' : trIf(e.message) || tr('Нет связи с сайтом'); } // NOT_FOUND - функции нет на сервере (Supabase)
    }
    S.busy = false;
    if (key !== keyNow()) { S.at = 0; S.w = null; load(); return; } // пока ждали, сменили аккаунт
    if (d) { S.w = d.wallet; S.season = d.season || S.season; syncPrem(); } else S.w = null;
    S.err = err; S.at = Date.now(); paint(); if (api.isOpen()) draw();
    if (C.account && C.account.render) C.account.render(); // своя аватарка у ника в меню
    if (C.hangar && C.hangar.refresh) C.hangar.refresh(); // надетая окраска - на самолёт в ангаре
    if (d && C.state === 'play' && C.ctrl && C.ctrl.modelsReady) C.ctrl.modelsReady(); // страница открылась сразу в бой (?go= после «Ещё раз» на другой карте): надетая окраска - когда пришёл кошелёк
  }
  function touch() {
    if (C.state !== 'menu' || S.busy) return;
    if (S.key === keyNow() && Date.now() - S.at < (S.err ? RETRY : FRESH)) return;
    load();
  }
  async function act(action, key, extra) {
    if (S.act) return false; S.act = true; draw();
    let d = null, err = '';
    try { d = await callFn('airdef-shop', { player_id: keyNow(), action, key, ...extra }); } catch (e) { err = trIf(e.message) || tr('Нет связи с сайтом'); }
    S.act = false;
    // на игровом сервере надетое - из билета при подключении: соединение в меню закрыть, панель «Онлайн» подключится с новым (в комнате, в бою и в поиске боя не трогаем)
    const N = C.netc; if (d && action === 'wear' && N && N.accChanged && !N.queued) N.accChanged();
    if (d && d.wallet) { const from = S.w ? S.w.crystals : 0; S.w = d.wallet; syncPrem(); draw(); countTo(from, S.w.crystals); paint(); if (C.account && C.account.render) C.account.render(); if (C.hangar && C.hangar.refresh) C.hangar.refresh(); } else { S.err = err; draw(); S.err = ''; }
    return !!d;
  }

  // ── раскладка: самолёт справа от плаката, размер - от экрана ──
  function layout() {
    const vw = innerWidth, vh = innerHeight, r = root.style;
    const k = Math.max(0.82, Math.min(1.3, Math.min(vw / 932, vh / 430)));
    r.setProperty('--k', k);
    const hw = Math.min(vw * 0.74, vh * 1.5), hh = hw * 0.5625, cx = vw * (vw / vh > 1.9 ? 0.62 : 0.6), cy = vh * 0.5;
    r.setProperty('--hw', hw + 'px'); r.setProperty('--hx', cx - hw / 2 + 'px'); r.setProperty('--hy', cy - hh / 2 + 'px');
    r.setProperty('--extra-top', Math.max(0, (vh - 430 * k) * 0.25) + 'px');
    if (S.cat === 'ava') layoutAva(k, vw, vh); else if (isPay(S.cat)) layoutPay(k, vw, vh);
    fitInfo();
  }
  // вкладки «Премиум» и «Кристаллы»: колонка слева под строкой вкладок; размер - от высоты (на телефоне в горизонтали с отступом Telegram места мало): сперва по расчёту, затем по факту (fitPay)
  function layoutPay(k, vw, vh) {
    const top = q('.top'); if (!top) return;
    const y0 = top.getBoundingClientRect().bottom + 8 * k, r = root.style, sb = parseFloat(getComputedStyle(root).getPropertyValue('--sa-b')) || 0;
    r.setProperty('--py', y0 + 'px'); r.setProperty('--ps', Math.max(0.55, Math.min(k, (vh - y0 - 8 - sb) / 345)).toFixed(3));
    fitPay();
  }
  function fitPay() {
    const box = q('.pbox'); if (!box || !isPay(S.cat) || !api.isOpen()) return;
    const sb = parseFloat(getComputedStyle(root).getPropertyValue('--sa-b')) || 0;
    for (let i = 0; i < 12; i++) { const ps = parseFloat(root.style.getPropertyValue('--ps')) || 1; if (box.getBoundingClientRect().bottom <= innerHeight - 6 - sb || ps <= 0.55) break; root.style.setProperty('--ps', Math.max(0.55, ps * 0.97).toFixed(3)); }
  }
  // аватарки (Mark: вариант «Картотека»): большая слева, под ней кнопка и строка «как увидят», справа плитки 5×2. Размеры - от экрана: всё помещается без прокрутки
  function layoutAva(k, vw, vh) {
    const top = q('.top'); if (!top) return;
    const b = top.getBoundingClientRect(), y0 = b.bottom + 12 * k, low = vh < 520;
    const H = vh - y0 - 12 * k - (parseFloat(getComputedStyle(root).getPropertyValue('--sa-b')) || 0);
    const under = (58 + 44 + 54 + (low ? 0 : 28)) * k, gap = 10 * k, cap = 24 * k; // под большой: кнопка, пояснение, строка «как увидят», её подпись; cap - цена под плиткой
    const fs = Math.max(110, Math.min(300 * k, H - under));
    const ts = Math.max(56, Math.min((vw - b.left - fs - 24 * k - (vw - b.right) - 4 * gap) / 5, (H - gap) / 2 - cap));
    const h = Math.max(fs + under, 2 * (ts + cap) + gap);
    const r = root.style; r.setProperty('--fs', fs + 'px'); r.setProperty('--ts', ts + 'px'); r.setProperty('--at', y0 + Math.min(Math.max(0, (vh - 430 * k) * 0.25), Math.max(0, H - h)) + 'px');
    root.classList.toggle('lowh', low);
  }
  // название, кнопка и подсказка - над плитками (Mark 2026-10-29: длинное название - два-три слова строками - уводило кнопку под плитки, тем более
  // с отступом Telegram сверху и строкой «Окраска на выбор» снизу): не влезает по высоте или слово шире блока - название мельче, до 55 %
  function fitInfo() {
    const info = q('.sinfo'), tray = q('.tray'), nm = q('.name'); if (!info || !tray || !nm || !api.isOpen() || S.cat === 'ava' || isPay(S.cat)) return;
    nm.style.fontSize = '';
    const k = parseFloat(root.style.getPropertyValue('--k')) || 1, room = () => tray.getBoundingClientRect().top - 8 * k - info.getBoundingClientRect().top;
    for (let f = 0.92; f >= 0.55 && (info.getBoundingClientRect().height > room() || nm.scrollWidth > nm.clientWidth + 1); f -= 0.08) nm.style.fontSize = `calc(52px * var(--k) * ${f.toFixed(2)})`;
  }

  // ── окно: каркас (раз на набор окрасок), затем сведения о выбранной ──
  function build() {
    const list = out(), sig = list.join(',') + '|' + LANG;
    if (S.built === sig) return; S.built = sig; S.shown = null;
    const talons = (g) => PK[g].map((k, i) => `<button class="talon" data-i="${i}" data-k="${k}" style="--mk:url(airdef/shop/prem/talon_${BAND[i]}.webp)" aria-label="${g === 'prem' ? (PAY[k].prem === 1 ? tr('{0} день', [1]) : tr('{0} дней', [PAY[k].prem])) : tr('{0} кристаллов', [nf(PAY[k].gems)])}">${i === 2 ? `<span class="best">${tr('лучшая цена')}</span>` : ''}<span class="glow"></span><span class="shine"></span>
      <span class="ic2"><img src="airdef/shop/prem/${k}.webp" alt="" draggable="false"></span><span class="num">${g === 'prem' ? PAY[k].prem : nf(PAY[k].gems)}${g === 'prem' ? `<small>${PAY[k].prem === 1 ? tr('день') : tr('дней')}</small>` : ''}</span>
      <span class="sv">${i ? tr('выгоднее на {0} %', [savePct(g, i)]) : '&nbsp;'}</span><span class="tpr">${PAY[k].stars}${STAR}</span></button>`).join('');
    const vsrc = (n) => `<video class="pv" data-v="${n}" muted playsinline loop preload="none" poster="airdef/shop/prem/shop_${n}_poster.webp" aria-hidden="true"><source src="airdef/shop/prem/shop_${n}.webm" type="video/webm"><source src="airdef/shop/prem/shop_${n}.mp4" type="video/mp4"></video>`;
    root.innerHTML = `<div class="pvid">${vsrc('prem')}${vsrc('gems')}</div><div class="sky"><i class="skyi"></i><i class="skyi"></i></div><div class="hero"><img class="pl" alt=""><img class="pl" alt=""></div><div class="vign"></div>
      <header class="top"><div class="t"><h1>${tr('Магазин')}</h1><div class="cats"><button data-c="camo">${tr('Окраски')}</button><button data-c="ava">${tr('Аватарки')}</button><button data-c="prem">${tr('Премиум')}</button><button data-c="gems">${tr('Кристаллы')}</button></div><small class="ssub"></small></div>
        <div class="tok" title="${tr('Окраска на выбор')}">${ico('ticket')}<span class="tokN"></span></div>
        <div class="bal" title="${tr('Кристаллы')}"><small>${tr('кристаллы')}</small>${gem}<b class="balN">-</b></div>
        <button class="sq q" data-a="q" aria-expanded="false" title="${tr('Откуда кристаллы')}">?</button>
        <button class="sq" data-a="close" title="${tr('Закрыть')}" aria-label="${tr('Закрыть')}">${ico('close')}</button></header>
      <div class="sinfo"><div class="kick pln"></div><h2 class="name"></h2><div class="chips"></div><div class="act"></div><div class="note"></div><div class="stamp"></div></div>
      <div class="tray"><span class="ticket">${ico('ticket')}${tr('Окраска на выбор - возьмите любую')}</span>
        <div class="tiles">${list.map((k, i) => `<button class="tile" data-i="${i}" style="--acc:${LOOK[k].acc}"><img src="${img(k, 's')}" alt=""><span class="tt"><b>${camoName(k)}</b><small></small></span></button>`).join('')}</div></div>
      <div class="avaL"><img class="frame" alt=""><div class="aact"></div><div class="note anote"></div><div class="seenT">${tr('Так вас увидят в рейтинге и в онлайне:')}</div><div class="seen"><img alt=""><span><b></b><small></small></span></div><div class="stamp"></div></div>
      <div class="avaG">${AVA_SHOP.map((id, i) => `<button class="atile" data-ai="${i}" aria-label="${tr('Аватарка {0}', [i + 1])}"><img src="${avaSrc(id)}" alt=""><span class="pr"></span></button>`).join('')}</div>
      <div class="pbox">
        <div class="ppane" data-g="prem"><h2 class="pttl">${tr('Премиум')}</h2><div class="pact" hidden></div>
          <div class="perks"><div><i></i>${tr('×1,75 серебра и опыта за каждый бой')}</div><div><i></i>${tr('+1 кристалл за ежедневный вход')}</div><div><i></i>${tr('+1 бесплатная замена задания в день и в неделю')}</div></div></div>
        <div class="ppane" data-g="gems"><h2 class="pttl">${tr('Кристаллы')}</h2><div class="plead">${tr('Для окрасок и аватарок в магазине.')}<br>${tr('Остаются на аккаунте навсегда.')}</div></div>
        <div class="pcards" data-g="prem">${talons('prem')}</div><div class="pcards" data-g="gems">${talons('gems')}</div>
        <div class="pcta"><div class="pbtn"></div>
          <label class="pcons"><input type="checkbox" data-a="pcons"><span>${tr('Премиум начнёт действовать сразу после оплаты. Принимаю это и понимаю, что отказаться от покупки потом нельзя.')}</span></label>
          <div class="pmeta"><a class="pterms" href="legal/terms.html?lang=${LANG}" target="_blank" rel="noopener">${tr('Условия покупок')}</a><div class="pnote" role="status"></div></div></div></div>
      <div class="shint" role="dialog" aria-label="${tr('Откуда кристаллы')}"><h3>${gem}${tr('Откуда кристаллы')}</h3>
        <p>${tr('Задания')}<small>${tr('ежедневные и еженедельные')}</small></p>
        <p>${tr('Награда за онлайн-рейтинг')}<small>${tr('начисляются в конце сезона')}</small></p>
        <p>${tr('Покупка - навсегда')}<small>${tr('надеть или снять - здесь же')}</small></p></div>`;
    for (const k of list) { const a = new Image(); a.src = img(k); const b = new Image(); b.src = img(k, 'sky'); } // смена окраски без мигания
    layout();
  }

  // небо и самолёт выбранной окраски: небо - плавная смена, самолёт - влетает справа, прежний уходит влево
  function scene(k, anim) {
    if (S.shown === k) return; const first = S.shown == null; S.shown = k;
    const [s0, s1] = root.querySelectorAll('.skyi'), [p0, p1] = root.querySelectorAll('.pl');
    const sOld = s0.classList.contains('on') ? s0 : s1, sNew = sOld === s0 ? s1 : s0;
    const pOld = p0.classList.contains('on') ? p0 : p1, pNew = pOld === p0 ? p1 : p0;
    sNew.style.backgroundImage = `url(${img(k, 'sky')})`; sNew.classList.add('on'); sOld.classList.remove('on');
    pNew.src = img(k); pNew.alt = `${trIf(PLANES[k.split(':')[0]] || '')} · ${camoName(k)}`;
    pOld.classList.remove('on'); pNew.classList.add('on');
    if (!anim || first || RM || !pNew.animate) return;
    // прежний уходит влево быстро, новый влетает справа после него - без наложения двух самолётов
    pOld.animate([{ opacity: 1, transform: 'translate(0, 0)' }, { opacity: 0, transform: 'translate(-34%, 6%) scale(.9)' }], { duration: 340, easing: 'cubic-bezier(.55,0,1,.45)' });
    pNew.animate([{ opacity: 0, transform: 'translate(38%, -7%) scale(.88)' }, { opacity: 1, transform: 'translate(0, 0) scale(1)' }], { duration: 900, delay: 260, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
  }

  // вкладка «Аватарки»: тот же слой неба плавно сменяется столом кадровика, самолёта нет
  function sceneAva() {
    if (S.shown === 'ava') return; S.shown = 'ava';
    const [s0, s1] = root.querySelectorAll('.skyi'), sOld = s0.classList.contains('on') ? s0 : s1, sNew = sOld === s0 ? s1 : s0;
    sNew.style.backgroundImage = 'url(airdef/shop/bg_avatars.jpg)'; sNew.classList.add('on'); sOld.classList.remove('on');
  }
  function drawAva(anim) {
    sceneAva();
    const id = AVA_SHOP[S.asel], k = avaKey(id), a = acc(), w = S.w, tick = ico('ok'), busy = S.act ? ' disabled' : '', big = q('.frame'), src = avaSrc(id, true);
    q('.balN').textContent = w ? nf(w.crystals) : '-';
    if (big.getAttribute('src') !== src) { big.src = src; if (anim && !RM && big.animate) big.animate([{ opacity: 0.3, transform: 'scale(.985)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' }); }
    let html = '', note = '';
    if (!a || a.kind !== 'airdef') {
      html = `<button class="sbt main" data-a="${a ? 'xfer' : 'login'}">${a ? tr('Перенести прогресс') : tr('Войти')}</button>`;
      note = tr('Кристаллы и аватарки - только у аккаунта игры.');
    } else if (!w) {
      html = `<button class="sbt main" disabled>${tr('Купить')} ${gem}<b>${AVA_PRICE}</b></button>`;
      note = S.busy || !S.err ? tr('Загружаем…') : S.err === 'soon' ? tr('Магазин скоро откроется.') : `${S.err} <button data-a="retry">${tr('Повторить')}</button>`;
    } else if (worn(k)) {
      html = `<span class="sbt worn">${tick}${tr('Надета')}</span>`;
      note = `${tr('Эта аватарка у вас в профиле.')} <button data-a="off">${tr('Снять')}</button>`;
    } else if (owned(k)) {
      html = `<span class="stag">${tick}${tr('Куплена')}</span><button class="sbt main" data-a="wear"${busy}>${tr('Надеть')}</button>`;
    } else if (w.crystals >= AVA_PRICE) {
      html = `<button class="sbt main" data-a="buy"${busy}>${tr('Купить')} ${gem}<b>${AVA_PRICE}</b></button>`;
    } else {
      html = `<button class="sbt short" data-a="q">${tr('Не хватает')} ${gem}<b>${AVA_PRICE - w.crystals}</b></button>`;
      note = `${tr('Кристаллы - за задания и рейтинг.')} <button data-a="q">${tr('Откуда?')}</button>`;
    }
    q('.aact').innerHTML = html; const ne = q('.anote'); ne.innerHTML = note; ne.classList.toggle('err', !!S.err && !!w);
    if (S.err && w) ne.textContent = S.err;
    const m = C.rating && C.rating.me ? C.rating.me() : null;
    q('.seen img').src = avaSrc(id); q('.seen b').textContent = (a && a.nick) || tr('Ваш ник'); q('.seen small').textContent = m && m.place ? tr('{0} место · очки: {1}', [m.place, nf(m.points || 0)]) : '';
    root.querySelectorAll('.atile').forEach((t) => {
      const i = +t.dataset.ai, kk = avaKey(AVA_SHOP[i]), pr = t.querySelector('.pr');
      t.classList.toggle('on', i === S.asel);
      const [cls, txt] = !w ? ['', gem + AVA_PRICE] : worn(kk) ? ['t worn', tick + tr('надета')] : owned(kk) ? ['t', tr('куплена')] : ['', gem + AVA_PRICE];
      pr.className = `pr ${cls}`; pr.innerHTML = txt;
    });
  }
  // видео-фон: у вкладки своя петля, смена - перекрёстное растворение 2,4 с (CSS); играет только нужная, невидимая и скрытая вкладка - на паузе (батарея)
  function videos(on) {
    const vs = root.querySelectorAll('.pv'); if (!vs.length) return;
    vs.forEach((v) => {
      const mine = v.dataset.v === on;
      if (mine) { v.classList.add('on'); if (!RM && api.isOpen() && !document.hidden) { const p = v.play && v.play(); if (p && p.catch) p.catch(() => {}); } }
      else { v.classList.remove('on'); if (v.pause && !v.paused) setTimeout(() => { if (!v.classList.contains('on') && v.pause) v.pause(); }, 2600); }
    });
    S.pvOn = on || '';
  }
  document.addEventListener && document.addEventListener('visibilitychange', () => { if (!api.isOpen()) return; if (document.hidden) root.querySelectorAll('.pv').forEach((v) => v.pause && v.pause()); else if (isPay(S.cat)) videos(S.cat); });
  function drawPay(anim) {
    const g = S.cat, keys = PK[g], i = S.ps[g], key = keys[i], P = PAY[key], a = acc(), w = S.w, uu = premUntil(), ok = !!a && a.kind === 'airdef';
    if (S.shown !== 'pay:' + g) { S.shown = 'pay:' + g; videos(g); if (!RM) { root.classList.remove('pin'); void root.offsetWidth; root.classList.add('pin'); setTimeout(() => root.classList.remove('pin'), 2200); } }
    q('.balN').textContent = w ? nf(w.crystals) : '-';
    root.querySelectorAll(`.pcards[data-g="${g}"] .talon`).forEach((t) => t.classList.toggle('on', +t.dataset.i === i));
    const pact = q('.pact'); pact.hidden = !(g === 'prem' && uu);
    if (g === 'prem' && uu) pact.innerHTML = `${wings(12)}<span>${tr('Премиум до {0}', [ddmmHm(uu)])}</span>`;
    const price = `<em>${P.stars}${STAR}</em>`, st = pay.st, busy = st !== 'idle';
    let btn = '', note = '';
    const loading = !w ? (S.busy || !S.err ? tr('Загружаем…') : S.err === 'soon' ? tr('Магазин скоро откроется.') : `${esc(S.err)} <button data-a="retry">${tr('Повторить')}</button>`) : '';
    if (!ok) { btn = `<button class="pbuy" data-a="${a ? 'xfer' : 'login'}">${a ? tr('Перенести прогресс') : tr('Войти')}</button>`; note = tr('Премиум и кристаллы - только у аккаунта игры.'); }
    else if (!w) { btn = `<button class="pbuy" disabled>${tr('Купить')}${price}</button>`; note = loading; }
    else if (st === 'wait') {
      btn = `<div class="pwait"><span class="dot"></span><span>${tr('Ждём оплату в Telegram…')}</span><span class="sp2"></span><button data-a="pcancel">${tr('Отмена')}</button>`
        + (pay.link ? `<div class="row2">${pay.blocked ? `<a class="pbuy" href="${esc(pay.link)}" target="_blank" rel="noopener">${tr('Открыть оплату в Telegram')}</a>` : `<a class="lnk" href="${esc(pay.link)}" target="_blank" rel="noopener">${tr('Открыть оплату в Telegram')}</a>`}</div>` : '') + '</div>';
    } else {
      const label = st === 'creating' ? tr('Открываем счёт…') : st === 'tg' ? tr('Ждём оплату…') : st === 'polling' ? tr('Зачисляем…') : tr('Купить');
      btn = `<button class="pbuy" data-a="pbuy"${busy || (g === 'prem' && !S.consent) ? ' disabled' : ''}>${label}${st === 'idle' ? price : ''}</button>`;
      note = S.msg ? `<span class="okm">${esc(S.msg)}</span>` : pay.err ? esc(pay.err) : g === 'prem' && uu ? tr('Покупка добавит дни к сроку') : tr('Оплата - звёздами Telegram (Stars).');
    }
    q('.pbtn').innerHTML = btn;
    const cons = q('.pcons'); cons.classList.toggle('on', g === 'prem' && ok && !!w && st !== 'wait'); const cb = cons.querySelector('input'); cb.checked = S.consent; cb.disabled = busy;
    const ne = q('.pnote'); ne.innerHTML = note; ne.classList.toggle('err', !!pay.err && !S.msg && !!w && ok); ne.classList.toggle('ok', !!S.msg);
    fitPay(); // только уменьшает: размеры талонов не прыгают при смене состояния кнопки (заново считает layout: открытие, поворот, смена вкладки)
  }
  const setCat = (c) => { if (S.cat === c) return; S.cat = c; S.hint = false; layout(); draw(true); };

  function draw(anim) {
    build();
    root.classList.toggle('cat-ava', S.cat === 'ava'); root.classList.toggle('cat-pay', isPay(S.cat)); root.classList.toggle('cat-prem', S.cat === 'prem'); root.classList.toggle('cat-gems', S.cat === 'gems');
    root.querySelectorAll('.cats button').forEach((b) => b.classList.toggle('on', b.dataset.c === S.cat));
    q('.shint').classList.toggle('open', S.hint); q('.sq.q').setAttribute('aria-expanded', S.hint);
    if (!isPay(S.cat) && S.pvOn) videos('');
    if (isPay(S.cat)) { drawPay(anim); return; }
    if (S.cat === 'ava') { drawAva(anim); return; }
    const list = out(), n = list.length; if (!n) return;
    S.sel = Math.min(S.sel, n - 1);
    const k = list[S.sel], L = LOOK[k], a = acc(), w = S.w;
    scene(k, anim);
    root.classList.toggle('has-token', !!w && w.picks > 0);
    q('.ssub').textContent = tr('окраски сезона {0}', [S.season]);
    q('.balN').textContent = w ? nf(w.crystals) : '-';
    q('.tokN').textContent = w ? tr('на выбор: {0}', [w.picks]) : '';
    const info = q('.sinfo'); info.style.setProperty('--acc', L.acc); info.style.setProperty('--acc2', L.acc2);
    q('.pln').textContent = trIf(PLANES[k.split(':')[0]] || '');
    const words = camoName(k).split(' ');
    q('.name').innerHTML = words.length > 1 ? `<span>${words[0]}</span><span class="a">${words.slice(1).join(' ')}</span>` : `<span class="a">${words[0]}</span>`;
    q('.chips').innerHTML = L.chips.map((x) => `<i style="background:${x}"></i>`).join('');
    const tick = ico('ok'), busy = S.act ? ' disabled' : '';
    let html = '', note = '';
    if (!a || a.kind !== 'airdef') { // гость или аккаунт сайта: покупки - только с аккаунтом игры
      html = `<button class="sbt main" data-a="${a ? 'xfer' : 'login'}">${a ? tr('Перенести прогресс') : tr('Войти')}</button>`;
      note = tr('Кристаллы и окраски - только у аккаунта игры.');
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
      note = `${tr('Кристаллы - за задания и рейтинг.')} <button data-a="q">${tr('Откуда?')}</button>`;
    }
    q('.act').innerHTML = html; const ne = q('.note'); ne.innerHTML = note; ne.classList.toggle('err', !!S.err && !!w);
    if (S.err && w) ne.textContent = S.err;
    root.querySelectorAll('.tile').forEach((t) => {
      const kk = list[+t.dataset.i], sm = t.querySelector('small');
      t.classList.toggle('on', +t.dataset.i === S.sel);
      const [cls, txt] = !w ? ['', gem + CAMO_PRICE] : worn(kk) ? ['t worn', tick + tr('надета')] : owned(kk) ? ['t', tr('куплена')] : w.picks > 0 ? ['t tk', tr('на выбор')] : ['', gem + CAMO_PRICE];
      sm.className = cls; sm.innerHTML = txt;
    });
    fitInfo();
    // название и кнопка проявляются без обрезки букв (Mark: нижнее слово обрезалось на миг)
    if (anim && !RM && q('.name').animate) {
      q('.name').animate([{ opacity: 0, transform: 'translateX(-14px)' }, { opacity: 1, transform: 'none' }], { duration: 480, easing: 'cubic-bezier(.2,.8,.2,1)' });
      q('.act').animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay: 120, fill: 'backwards' });
    }
  }
  const count = () => (isPay(S.cat) ? 3 : S.cat === 'ava' ? AVA_SHOP.length : out().length), cur = () => (isPay(S.cat) ? S.ps[S.cat] : S.cat === 'ava' ? S.asel : S.sel);
  const select = (i, anim) => { if (isPay(S.cat)) S.ps[S.cat] = i; else if (S.cat === 'ava') S.asel = i; else S.sel = i; draw(anim); };
  function countTo(from, to) {
    const el = q('.balN'); if (!el || RM || from === to) return;
    const t0 = performance.now(), step = (now) => { const k = Math.min(1, (now - t0) / 600); el.textContent = nf(from + (to - from) * k); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  function stamp(text) {
    const s = q(S.cat === 'ava' ? '.avaL .stamp' : '.sinfo .stamp'); s.textContent = text; if (RM || !s.animate) return;
    s.animate([{ opacity: 0, transform: 'rotate(-8deg) scale(2)' }, { opacity: 1, transform: 'rotate(-8deg) scale(.95)', offset: 0.6 }, { opacity: 1, transform: 'rotate(-8deg) scale(1)', offset: 0.85 }, { opacity: 0, transform: 'rotate(-8deg) scale(1)' }], { duration: 1500, easing: 'cubic-bezier(.5,0,.75,0)' });
  }

  // ── события ──
  root.addEventListener && root.addEventListener('click', async (e) => {
    if (Date.now() - swipeAt < 400) return; // click сразу после свайпа - его же касание (ревью: свайп по плитке гасил сам себя)
    const b = e.target.closest('[data-a]'), tile = e.target.closest('.tile'), at = e.target.closest('.atile'), cat = e.target.closest('[data-c]'), tal = e.target.closest('.talon');
    if ((!b || b.dataset.a !== 'q') && S.hint && !e.target.closest('.shint')) { S.hint = false; draw(); }
    if (cat) { if (cat.dataset.c !== S.cat) { if (C.snd && C.snd.click) C.snd.click(); setCat(cat.dataset.c); } return; }
    if (tal) { if (+tal.dataset.i !== S.ps[S.cat]) { if (C.snd && C.snd.click) C.snd.click(); select(+tal.dataset.i, true); } return; }
    if (at) { if (+at.dataset.ai !== S.asel) { if (C.snd && C.snd.click) C.snd.click(); select(+at.dataset.ai, true); } return; }
    if (tile) { if (+tile.dataset.i !== S.sel) { if (C.snd && C.snd.click) C.snd.click(); select(+tile.dataset.i, true); } return; }
    if (!b) return;
    const k = isPay(S.cat) ? PK[S.cat][S.ps[S.cat]] : S.cat === 'ava' ? avaKey(AVA_SHOP[S.asel]) : out()[S.sel], a = b.dataset.a;
    if (a === 'close') api.close();
    else if (a === 'pbuy') { if (S.cat === 'prem' && !S.consent) return; S.msg = ''; pay.clearErr(); if (C.snd && C.snd.click) C.snd.click(); pay.start(k); }
    else if (a === 'pcancel') pay.cancel();
    else if (a === 'pcons') { S.consent = !!e.target.checked; draw(); }
    else if (a === 'q') { S.hint = !S.hint; draw(); }
    else if (a === 'retry') { S.at = 0; S.err = ''; draw(); load(); }
    else if (a === 'login' || a === 'xfer') { if (C.account) C.account.open(a); }
    else if (a === 'buy') { if (await act('buy', k)) stamp(tr('куплена')); }
    else if (a === 'pick') { if (await act('pick', k)) stamp(tr('получена')); }
    else if (a === 'wear') await act('wear', k);
    else if (a === 'off') await act('wear', null, { plane: k.split(':')[0] });
  });
  // свайп и лёгкий параллакс от мыши (небо - против движения, самолёт - по нему)
  let sx = null, tx = 0, ty = 0, mx = 0, my = 0, raf = 0, swipeAt = 0;
  root.addEventListener && root.addEventListener('pointerdown', (e) => { sx = e.clientX; });
  root.addEventListener && root.addEventListener('pointerup', (e) => {
    if (sx == null) return; const dx = e.clientX - sx, n = count(); sx = null;
    if (Math.abs(dx) > 50 && n > 1 && !e.target.closest('.shint')) { swipeAt = Date.now(); select((cur() + (dx < 0 ? 1 : n - 1)) % n, true); }
  });
  const loop = () => { mx += (tx - mx) * 0.08; my += (ty - my) * 0.08; root.style.setProperty('--mx', mx.toFixed(3)); root.style.setProperty('--my', my.toFixed(3)); raf = Math.abs(tx - mx) + Math.abs(ty - my) > 0.002 ? requestAnimationFrame(loop) : 0; };
  root.addEventListener && root.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || RM) return;
    tx = Math.max(-1, Math.min(1, (e.clientX / innerWidth - 0.5) * 2)); ty = Math.max(-1, Math.min(1, (e.clientY / innerHeight - 0.5) * 2)); if (!raf) raf = requestAnimationFrame(loop);
  });
  addEventListener('keydown', (e) => {
    if (!api.isOpen() || (C.account && C.account.isOpen())) return;
    const n = count();
    if (e.code === 'Escape') { if (S.hint) { S.hint = false; draw(); } else api.close(); }
    else if (e.code === 'ArrowRight' && n > 1) select((cur() + 1) % n, true);
    else if (e.code === 'ArrowLeft' && n > 1) select((cur() + n - 1) % n, true);
  });
  addEventListener('resize', () => { if (api.isOpen()) layout(); });
  // оплата: итог - кошелёк и срок премиума, сообщение под кнопкой (десять секунд); состояние и ошибки - перерисовать вкладку
  pay.on((e) => {
    if (e.type === 'paid') {
      const from = S.w ? S.w.crystals : 0, k = e.key; if (e.wallet) S.w = e.wallet; S.consent = false;
      const u = premUntil(); S.msg = PAY[k] && PAY[k].prem ? tr('Оплата прошла. Премиум до {0}.', [u ? ddmmHm(u) : '']) : tr('Оплата прошла. Кристаллы: +{0}.', [nf((PAY[k] || {}).gems || 0)]);
      setTimeout(() => { S.msg = ''; if (api.isOpen() && isPay(S.cat)) draw(); }, 10000);
      if (api.isOpen()) { draw(); if (S.w) countTo(from, S.w.crystals); }
      paint(); if (C.account && C.account.render) C.account.render();
    } else if (api.isOpen() && isPay(S.cat)) draw();
  });
  paint();
  if (keyNow()) setTimeout(load, 0); // кошелёк - сразу при загрузке (а не только из меню): надетые окраски нужны и бою, открытому по ?go=

  const api = {
    // tab: 'camo' | 'ava' | 'prem' | 'gems' - открыть сразу на нужной вкладке (ангар, окно «Премиум закончился»)
    open(tab) {
      S.hint = false; if (tab === 'camo' || tab === 'ava' || tab === 'prem' || tab === 'gems') S.cat = tab;
      root.classList.add('on'); layout(); draw(false);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitInfo); // Oswald пришёл позже - размеры другие
      if (!S.busy && Date.now() - S.at > 10000) { S.at = 0; load(); }
    },
    close() { root.classList.remove('on'); S.hint = false; root.querySelectorAll('.pv').forEach((v) => v.pause && v.pause()); if (isPay(S.cat)) S.shown = null; },
    isOpen: () => !!root.classList && root.classList.contains('on'),
    touch, paint,
    // сменился аккаунт: кошелёк устарел
    reset() { if (S.key !== keyNow()) S.w = null; S.at = 0; paint(); if (api.isOpen()) { draw(); load(); } else touch(); },
    wallet: () => S.w,
  };
  return api;
}
