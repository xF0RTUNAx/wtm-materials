// Экран «Задания»: ежедневные и еженедельные, маршрут недели с МиГ-31 (пул, награды и правила - quests-data.js; счёт и начисление - сервер, airdef-progress, progress-net.js).
// Материалы - пререндер: ui/quests/ (штабной стол, карта, булавки, МиГ-31, корешки досье, ленты-закладки, плашки, латунная кнопка, печать, лампы), t_* - плитки наград.
// Тестовый режим (?pgtest=1) - кнопка «ДЕМО»: продвинуть задания, следующий день и неделя, состояние в памяти.
import { DAILY, WEEKLY, ROUTE, ROUTE_MAX, PTS_DAILY, PTS_WEEKLY, CRATE, CASE, mskDay } from './quests-data.js?v=20261112a';
import { QI } from './quest-icons.js?v=20261112a';
import { tr, LANG } from './i18n.js?v=20261112a';

const UI = 'airdef/ui/quests/', LOC = LANG === 'en' ? 'en-US' : 'ru-RU';
const TILE = { silver: UI + 't_silver.webp', xp: UI + 't_xp.webp', gem: UI + 't_gems.webp', star: UI + 't_star.webp', crate: UI + 't_crate.webp', case: UI + 't_case.webp' };
const CSS = `
#quests { position: fixed; inset: 0; z-index: 40; display: none; overflow: hidden; color: #ece8dc; font: 14px 'Golos Text', -apple-system, sans-serif; background: #14160f url(${UI}bg.jpg) center / cover;
  --rt: calc(var(--sa-t, 0px) + var(--tg-t, 0px)); --hh: 54px; --dim: #c2c7b2; --dim2: #959c87; --gold: #e8b04a; --gold2: #f3c96f; --green: #6cc996; }
#quests.on { display: block; } #quests * { box-sizing: border-box; }
#quests::before { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, rgba(8,9,6,.55), rgba(8,9,6,.22) 55%, rgba(8,9,6,.45)); pointer-events: none; }
#quests .ic { display: inline-block; flex: none; width: 1em; height: 1em; }
#quests .top { position: absolute; left: 0; right: 0; top: var(--rt); height: var(--hh); display: flex; align-items: center; gap: 12px; padding: 0 max(18px, var(--sa-r, 0px)) 0 max(18px, var(--sa-l, 0px)); background: linear-gradient(rgba(10,12,8,.94), rgba(10,12,8,.6)); border-bottom: 1px solid rgba(233,230,220,.12); z-index: 3; }
#quests .topFill { position: absolute; left: 0; right: 0; top: 0; height: var(--rt); background: #0b0d09; }
#quests .back { font: 600 26px 'Oswald'; color: var(--dim); background: none; border: 0; width: 30px; padding: 0; cursor: pointer; }
#quests h2 { margin: 0; display: flex; align-items: center; gap: 9px; font: 500 22px 'Oswald'; letter-spacing: .03em; } #quests h2 .ic { width: 28px; height: 28px; color: var(--gold); }
#quests .demoB { font: 600 11.5px 'Oswald'; letter-spacing: .14em; color: var(--gold2); background: rgba(20,18,10,.7); border: 1px dashed rgba(232,176,74,.7); padding: 3px 9px; cursor: pointer; }
#quests .demoB:hover { background: #2c2513; }
#quests .cur { margin-left: auto; display: flex; gap: 16px; font: 500 18px 'Oswald'; font-variant-numeric: tabular-nums; } #quests .cur span { display: flex; align-items: center; gap: 5px; transition: transform .18s; } #quests .cur img { width: 28px; height: 28px; }
#quests .cur .xp { color: #9fd0ff; } #quests .cur .gem { color: #8fe0b2; } #quests .cur .pulse { transform: scale(1.16); }
#quests .gw { position: absolute; left: max(18px, var(--sa-l, 0px)); right: max(18px, var(--sa-r, 0px)); top: calc(var(--rt) + var(--hh) + 8px); bottom: max(10px, var(--sa-b, 0px)); max-width: 1480px; margin: 0 auto; display: flex; flex-direction: column; gap: 8px; }
#quests .sum { position: relative; flex: none; height: clamp(96px, calc(100vh - 536px), 250px); padding: 8px 16px; background: url(${UI}map.jpg) center / cover; box-shadow: 0 6px 18px rgba(0,0,0,.55), inset 0 0 0 1px rgba(0,0,0,.5); }
#quests.en .sum { background-image: url(${UI}map_en.jpg); }
#quests .sum::after { content: ''; position: absolute; inset: 0; background: linear-gradient(rgba(10,10,6,.5), rgba(10,10,6,.05) 40%, rgba(10,10,6,.25)); pointer-events: none; }
#quests .sh { position: relative; z-index: 2; display: flex; align-items: center; gap: 12px; } #quests .sh b { font: 600 13px 'Oswald'; letter-spacing: .16em; color: #f1ead6; text-shadow: 0 1px 2px #000; text-transform: uppercase; }
#quests .sh .pts { display: flex; align-items: center; gap: 4px; font: 600 16px 'Oswald'; color: var(--gold2); text-shadow: 0 1px 3px #000; font-variant-numeric: tabular-nums; } #quests .sh .pts img { width: 20px; height: 20px; }
#quests .sh .tm { margin-left: auto; display: flex; align-items: center; gap: 5px; font: 400 13.5px 'Oswald'; color: #e5dfcc; text-shadow: 0 1px 2px #000; white-space: nowrap; } #quests .sh .tm .ic { width: 15px; height: 15px; color: var(--gold); } #quests .sh .tm b { font: 600 13.5px 'Oswald'; color: #e5dfcc; letter-spacing: .02em; text-transform: none; }
#quests .route { position: absolute; left: 16px; right: 16px; top: 34px; bottom: 6px; z-index: 2; } #quests .route > svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
#quests .wp { position: absolute; width: 0; height: 0; } #quests .wp img.pin { position: absolute; width: 46px; height: 46px; left: -25px; top: -33px; transition: transform .2s; } #quests .wp.base img.pin { filter: saturate(.5) brightness(.85); } #quests .wp.ping img.pin { transform: translateY(-6px) scale(1.18); }
#quests .wp .v { position: absolute; left: 0; top: -44px; transform: translateX(-50%); font: 600 13px 'Oswald'; color: #e7e1cf; text-shadow: 0 1px 2px #000, 0 0 6px #000; white-space: nowrap; } #quests .wp.got .v { color: var(--gold2); } #quests .wp.base .v { top: 11px; }
#quests .wp .wr { position: absolute; left: 0; top: 13px; transform: translateX(-50%); display: flex; gap: 3px; white-space: nowrap; } #quests .wp.got .wr { opacity: .6; }
#quests .chip { display: inline-flex; align-items: center; gap: 3px; font: 500 13px 'Oswald'; color: #f0ebdc; padding: 1px 6px 1px 2px; background: rgba(12,14,9,.74); border: 1px solid rgba(233,230,220,.18); border-radius: 2px; font-variant-numeric: tabular-nums; white-space: nowrap; } #quests .chip img { width: 18px; height: 18px; } #quests .chip.gem { color: #a6ecc4; }
#quests .mig { position: absolute; width: 0; height: 0; z-index: 2; pointer-events: none; } #quests .mig .rot { position: absolute; left: 0; top: 0; width: 0; height: 0; }
#quests .mig img { position: absolute; width: 150px; height: 62.5px; left: -75px; top: -31px; will-change: transform; }
#quests .mig.idle .pl { animation: qBobP 3.4s ease-in-out infinite alternate; } #quests .mig.idle .shd { animation: qBobS 3.4s ease-in-out infinite alternate; }
@keyframes qBobP { from { transform: translate(0, 0) scale(1); } to { transform: translate(-3px, -2px) scale(1.045); } }
@keyframes qBobS { from { transform: translate(0, 0) scale(1); opacity: .95; filter: blur(0); } to { transform: translate(7px, 5px) scale(.97); opacity: .6; filter: blur(1.6px); } }
#quests .tabs { flex: none; display: flex; gap: 6px; height: 40px; align-items: flex-end; border-bottom: 2px solid var(--gold); padding-left: 2px; }
#quests .tab { position: relative; height: 38px; display: flex; align-items: center; gap: 10px; padding: 0 6px 0 4px; background: none; border-style: solid; border-width: 0 24px; border-image: url(${UI}tab_off.webp) 0 40 fill / 0 24px stretch; color: #d7d5c6; cursor: pointer; white-space: nowrap; }
#quests .tab.on { border-image-source: url(${UI}tab_on.webp); color: #2a2215; } #quests .tab b { font: 600 16px 'Oswald'; letter-spacing: .12em; text-transform: uppercase; }
#quests .mk { position: relative; flex: none; align-self: flex-start; width: 100px; height: 30px; margin-top: -3px; background: url(${UI}mark_idle.webp) center / 100% 100% no-repeat; font: 500 13px 'Oswald'; font-variant-numeric: tabular-nums; letter-spacing: .02em; color: #f1ecdc; }
#quests .mk.rdy { background-image: url(${UI}mark_ready.webp); color: #fff4e2; } #quests .mk i, #quests .mk span { position: absolute; top: 0; height: 96%; display: flex; align-items: center; justify-content: center; font-style: normal; white-space: nowrap; }
#quests .mk span { left: 10%; width: 77.5%; } #quests .mk.rdy span { left: 31.9%; width: 55.6%; } #quests .mk i { left: 11.25%; width: 19.35%; font: 600 14px 'Oswald'; color: #2a2215; }
#quests .list { flex: 1 1 0; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; display: flex; flex-direction: column; gap: 5px; scrollbar-width: none; } #quests .list::-webkit-scrollbar { display: none; }
#quests .row { position: relative; flex: none; height: 62px; display: grid; grid-template-columns: 44px minmax(0, 1fr) 214px 178px 124px; gap: 12px; align-items: center; padding: 0 12px 0 8px; border-style: solid; border-width: 14px; border-image: url(${UI}plate.webp) 28 fill / 14px stretch; }
#quests .row > * { margin: -14px 0; } #quests .row.done { border-image-source: url(${UI}plate_done.webp); }
#quests .no { display: flex; align-items: center; justify-content: center; } #quests .no .ic { width: 28px; height: 28px; color: var(--gold2); } #quests .row.taken .no .ic { color: var(--green); }
#quests .tx { min-width: 0; } #quests .t { font: 500 17px 'Oswald'; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-shadow: 0 1px 1px rgba(0,0,0,.6); }
#quests .d { font-size: 12px; color: var(--dim); margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } #quests .wh { color: var(--dim2); font: 600 10.5px 'Golos Text'; text-transform: uppercase; letter-spacing: .06em; margin-right: 4px; }
#quests .prog { display: flex; align-items: center; gap: 9px; min-width: 0; } #quests .sg { display: flex; gap: 2px; flex: 1 1 0; min-width: 0; } #quests .sg i { flex: 1 1 0; min-width: 0; height: 14px; background: url(${UI}seg_off.webp) center / 100% 100%; } #quests .sg i.on { background-image: url(${UI}seg_on.webp); } #quests .sg i.ok { background-image: url(${UI}seg_green.webp); }
#quests .cnt { flex: none; font: 500 14px 'Oswald'; color: var(--dim); white-space: nowrap; min-width: 50px; text-align: right; font-variant-numeric: tabular-nums; } #quests .cnt b { color: #ece8dc; font-weight: 500; }
#quests .rws { display: flex; gap: 5px; justify-content: flex-end; align-items: center; } #quests .ptc { display: inline-flex; align-items: center; gap: 2px; font: 500 13px 'Oswald'; color: var(--gold2); padding: 0 5px 0 2px; border: 1px dashed rgba(232,176,74,.6); white-space: nowrap; } #quests .ptc img { width: 16px; height: 16px; }
#quests .act { justify-self: end; display: flex; align-items: center; justify-content: flex-end; }
#quests .take { width: 120px; height: 36px; padding: 0; border: 0; cursor: pointer; background: url(${UI}btn_take.webp) center / 100% 100%; font: 600 15px 'Oswald'; letter-spacing: .14em; color: #2a1d08; text-shadow: 0 1px 0 rgba(255,236,190,.55); } #quests .take:hover { filter: brightness(1.08); } #quests .take:active { background-image: url(${UI}btn_take_down.webp); transform: translateY(1px); }
#quests .stamp { display: block; width: 124px; height: 47px; margin-right: -6px; background: url(${UI}stamp.webp) center / contain no-repeat; filter: brightness(1.4) saturate(1.2); } #quests.en .stamp { background-image: url(${UI}stamp_en.webp); } #quests .stamp.fresh { animation: qStamp .28s cubic-bezier(.2,.9,.3,1.2); } @keyframes qStamp { from { transform: scale(1.9) rotate(-5deg); opacity: 0; } 70% { opacity: 1; } to { transform: scale(1) rotate(0); } }
#quests .wait { font: 400 13.5px 'Oswald'; color: var(--dim2); white-space: nowrap; font-variant-numeric: tabular-nums; }
#quests .row.taken .t, #quests .row.taken .d { opacity: .62; }
#quests .bon { position: relative; flex: none; height: 56px; display: flex; align-items: center; gap: 12px; padding: 0 12px 0 6px; border-style: solid; border-width: 12px; border-image: url(${UI}plate.webp) 28 fill / 12px stretch; } #quests .bon.done { border-image-source: url(${UI}plate_done.webp); }
#quests .bon > * { margin: -12px 0; } #quests .bon img.cr { width: 52px; height: 52px; object-fit: contain; flex: none; } #quests .bon .bt { font: 500 15px 'Oswald'; white-space: nowrap; } #quests .bon .s3 { display: flex; gap: 2px; } #quests .bon .s3 i { width: 26px; height: 15px; background: url(${UI}seg_off.webp) center / 100% 100%; } #quests .bon .s3 i.on { background-image: url(${UI}seg_on.webp); } #quests .bon .s3 i.ok { background-image: url(${UI}seg_green.webp); } #quests .bon .rws { margin-left: auto; } #quests .bon .act { min-width: 124px; }
#quests .cur u { text-decoration: none; }
#quests .qmsg { flex: none; padding: 7px 12px; font-size: 13px; color: #ece8dc; background: rgba(12,14,9,.82); border: 1px solid rgba(232,176,74,.5); } #quests .qmsg.err { border-color: #c8372d; color: #ffb4a8; } #quests .qmsg button { margin-left: 8px; padding: 3px 10px; font: 500 13px 'Oswald'; color: #2a1d08; background: var(--gold); border: 0; cursor: pointer; }
#quests .flyR { position: fixed; left: 0; top: 0; width: 34px; height: 34px; z-index: 6; pointer-events: none; }
#quests .pop { position: absolute; z-index: 7; right: max(18px, var(--sa-r, 0px)); left: auto; top: calc(var(--rt) + var(--hh) + 2px); width: 270px; max-height: calc(100% - var(--rt) - var(--hh) - 10px); overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 6px; background: rgba(14,16,10,.97); border: 1px solid rgba(232,176,74,.6); box-shadow: 0 8px 24px rgba(0,0,0,.6); }
#quests .pop p { margin: 0 0 4px; font-size: 12px; line-height: 1.35; color: var(--dim); } #quests .pop button { padding: 7px 10px; text-align: left; font: 500 14px 'Oswald'; color: #ece8dc; background: rgba(233,230,220,.07); border: 1px solid rgba(233,230,220,.16); cursor: pointer; } #quests .pop button:hover { background: rgba(233,230,220,.15); } #quests .pop button.on { border-color: var(--gold); color: var(--gold2); } #quests .pop .two { display: flex; gap: 6px; } #quests .pop .two button { flex: 1 1 0; }
@media (max-height: 460px) {
  #quests { --hh: 46px; } #quests .top { gap: 9px; } #quests h2 { font-size: 19px; } #quests h2 .ic { width: 24px; height: 24px; } #quests .cur { font-size: 14.5px; gap: 12px; } #quests .cur img { width: 22px; height: 22px; }
  #quests .gw { top: calc(var(--rt) + var(--hh) + 4px); bottom: max(4px, var(--sa-b, 0px)); left: max(8px, var(--sa-l, 0px)); right: max(8px, var(--sa-r, 0px)); gap: 4px; }
  #quests .sum { height: 92px; padding: 4px 10px; background-size: 103% auto; background-position: right center; } /* карта чуть крупнее и сдвинута: названия мест не попадают на подписи точек */ #quests .wp[data-w="1"] .v { transform: translateX(-85%); } #quests .wp[data-w="4"] .v { transform: translateX(-15%); } #quests .route { top: 22px; bottom: 2px; left: 10px; right: 10px; } #quests .sh b { font-size: 11.5px; } #quests .sh .pts { font-size: 13px; } #quests .sh .pts img { width: 16px; height: 16px; } #quests .sh .tm, #quests .sh .tm b { font-size: 11.5px; }
  #quests .wp img.pin { width: 34px; height: 34px; left: -18px; top: -25px; } #quests .wp .v { top: -33px; font-size: 10.5px; } #quests .wp .wr { top: 8px; } #quests .chip { font-size: 10.5px; padding-right: 4px; } #quests .chip img { width: 14px; height: 14px; }
  #quests .mig img { width: 108px; height: 45px; left: -54px; top: -22.5px; }
  #quests .list { padding-bottom: 8px; -webkit-mask-image: linear-gradient(#000 calc(100% - 10px), transparent); mask-image: linear-gradient(#000 calc(100% - 10px), transparent); gap: 4px; } #quests .tabs { height: 31px; } #quests .tab { height: 29px; padding: 0 4px 0 2px; gap: 8px; } #quests .mk { width: 76px; height: 23px; margin-top: -2px; font-size: 11px; } #quests .mk i { font-size: 12px; } #quests .tab b { font-size: 13.5px; }
  #quests .row { height: 45px; grid-template-columns: 26px minmax(0, 1fr) 112px 132px 88px; gap: 8px; padding: 0 2px 0 0; border-width: 10px; border-image-width: 10px; } #quests .row > * { margin: -10px 0; }
  #quests .no .ic { width: 21px; height: 21px; } #quests .t { font-size: 14.5px; } #quests .d { font-size: 10.5px; margin-top: 0; } #quests .wh { font-size: 9px; } #quests .sg i { height: 11px; } #quests .prog { gap: 6px; }
  #quests .cnt { font-size: 11.5px; min-width: 36px; } #quests .ptc { font-size: 10.5px; padding-right: 3px; } #quests .ptc img { width: 13px; height: 13px; } #quests .rws { gap: 3px; } #quests .take { width: 86px; height: 28px; font-size: 12px; letter-spacing: .1em; } #quests .stamp { width: 86px; height: 33px; margin-right: 0; } #quests .wait { font-size: 11.5px; }
  #quests .bon { height: 40px; border-width: 9px; border-image-width: 9px; gap: 8px; } #quests .bon > * { margin: -9px 0; } #quests .bon img.cr { width: 34px; height: 34px; } #quests .bon .bt { font-size: 13px; } #quests .bon .s3 i { width: 20px; height: 11px; } #quests .bon .act { min-width: 88px; }
}
@media (max-width: 760px) { #quests .wh { display: none; } #quests .row { grid-template-columns: 26px minmax(0, 1fr) 42px 126px 86px; } #quests .sg { display: none; } #quests .prog { justify-content: flex-end; } #quests .sh .tm > span { display: none; } }`;

const qic = (n) => `<svg class="ic" viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="${QI[n] || ''}"/></svg>`;
const num = (v) => Math.round(v).toLocaleString(LOC);
const dec = (v) => v.toLocaleString(LOC, { maximumFractionDigits: 1 });
const MSK = 3 * 3600e3, DAY = 864e5;
const dayLeft = () => DAY - (Date.now() + MSK) % DAY;
const weekLeft = () => { const m = Date.now() + MSK, d = new Date(m).getUTCDay(); return ((8 - d) % 7 || 7) * DAY - m % DAY; };
const pad = (v) => String(v).padStart(2, '0');
const hms = (ms) => { const s = Math.floor(ms / 1000); return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`; };
const dh = (ms) => tr('{0} д {1} ч', [Math.floor(ms / DAY), pad(Math.floor(ms / 3600e3) % 24)]);
const cnt = (q) => q.u === 'h' ? `<b>${dec(q.n / 60)}</b> / ${tr('{0} ч', [q.of / 60])}` : q.u === 'min' ? `<b>${Math.floor(q.n)}</b> / ${tr('{0} мин', [q.of])}` : q.of >= 10000 ? `<b>${dec(q.n / 1000)}</b> / ${tr('{0} тыс.', [q.of / 1000])}` : `<b>${num(q.n)}</b> / ${num(q.of)}`;
const leftOf = (q) => { const v = q.of - q.n; return tr('ещё {0}', [q.u === 'h' ? tr('{0} ч', [dec(Math.ceil(v / 6) / 10)]) : q.u === 'min' ? tr('{0} мин', [Math.ceil(v)]) : q.of >= 10000 ? tr('{0} тыс.', [dec(v / 1000)]) : num(v)]); };
const chips = (r) => Object.entries(r).map(([k, v]) => `<span class="chip ${k}"><img src="${TILE[k]}" alt="">${num(v)}</span>`).join('');
const seg = (q) => { const m = Math.min(q.of, 10), f = q.n >= q.of ? m : q.n > 0 ? Math.max(1, Math.floor(m * q.n / q.of)) : 0, c = q.n >= q.of ? 'ok' : 'on'; return `<span class="sg">${Array.from({ length: m }, (_, i) => `<i class="${i < f ? c : ''}"></i>`).join('')}</span>`; };
// маршрут: x - по очкам, y - между путевыми точками плавно (проценты полосы)
const YS = [56, 47, 63, 49, 61, 51];
const rX = (p) => 7 + p / ROUTE_MAX * 88.5;
const rY = (p) => { p = Math.max(0, Math.min(ROUTE_MAX, p)); let i = 1; while (i < ROUTE.length - 1 && ROUTE[i].p < p) i++; const a = ROUTE[i - 1].p, b = ROUTE[i].p, t = (p - a) / (b - a); return YS[i - 1] + (YS[i] - YS[i - 1]) * (1 - Math.cos(Math.PI * t)) / 2; };
const rPath = (p) => { const L = []; for (let x = 0; x < p; x += ROUTE_MAX / 150) L.push(`${rX(x).toFixed(2)},${rY(x).toFixed(2)}`); L.push(`${rX(p).toFixed(2)},${rY(p).toFixed(2)}`); return L.join(' '); };

export function createQuests(C) {
  const $ = (id) => document.getElementById(id), snd = () => { if (C.snd && C.snd.click) C.snd.click(); };
  const css = document.createElement('style'); css.textContent = CSS; (document.head || document.body).appendChild(css);
  const root = document.createElement('div'); root.id = 'quests'; if (LANG === 'en') root.classList.add('en'); document.body.appendChild(root);
  // на экране - то, что показано (МиГ, числа): догоняет настоящее состояние во время полёта и анимации наград
  const S = { tab: 'd', pop: false, shown: 0, paid: 0, disp: { xp: 0, silver: 0, gem: 0 }, raf: 0, fresh: null, msg: '', busy: false, flying: 0, mig: null };
  const PG = () => C.progress;
  const V = () => PG().quests;
  const cur = () => { const P = PG().P || {}, w = C.shop && C.shop.wallet && C.shop.wallet(); return { xp: P.xp || 0, silver: P.silver || 0, gem: PG().crystals ?? (w ? w.crystals : 0) ?? 0 }; };
  const isOpen = () => root.classList.contains('on');
  const allTaken = (L) => L.length > 0 && L.every((q) => q.st === 'taken');
  const known = (L, P) => L.filter((q) => P[q.id]); // страница старее сервера: незнакомое задание не показываем
  const doneN = (L) => L.filter((q) => q.st === 'done').length;
  const count = (q) => doneN(q.d) + doneN(q.w) + (allTaken(q.d) && !q.crate ? 1 : 0) + (allTaken(q.w) && !q.chest ? 1 : 0);
  // МиГ на маршруте: серый; у кого есть окраска «Нефритовый дракон» - дракон
  const migKey = () => { if (S.mig) return S.mig; const w = C.shop && C.shop.wallet && C.shop.wallet(); return w && w.camos && w.camos.includes('e_mig31:dragon') ? 'dragon' : 'grey'; };

  const row = (q, kind, i) => `<div class="row ${q.st || ''}"><span class="no">${qic(q.st === 'taken' ? 'done-check-mark' : q.ic)}</span>
    <div class="tx"><div class="t">${tr(q.t)}</div><div class="d"><span class="wh">${tr('засчитывается:')}</span>${tr(q.d)}</div></div>
    <span class="prog">${seg(q)}<span class="cnt">${cnt(q)}</span></span><span class="rws">${chips(q.r)}<span class="ptc"><img src="${TILE.star}" alt="">+${q.pts}</span></span>
    <span class="act">${q.st === 'done' ? `<button class="take" data-take="${kind}:${q.id}">${tr('ЗАБРАТЬ')}</button>` : q.st === 'taken' ? `<span class="stamp${S.fresh === `${kind}:${q.id}` ? ' fresh' : ''}"></span>` : `<span class="wait">${leftOf(q)}</span>`}</span></div>`;
  const bonus = (Q, d) => { const L = d ? Q.d : Q.w, st = d ? Q.crate : Q.chest, ready = allTaken(L), N = L.length, n = L.filter((q) => q.st === 'taken').length, key = d ? 'crate' : 'chest';
    return `<div class="bon ${ready && !st ? 'done' : ''}"><img class="cr" src="${d ? TILE.crate : TILE.case}" alt=""><span class="bt">${tr(d ? 'Ящик снабжения за все три сегодня' : 'Кейс недели за все пять')}</span><span class="s3">${Array.from({ length: N }, (_, i) => `<i class="${i < n ? (ready ? 'ok' : 'on') : ''}"></i>`).join('')}</span><span class="rws">${chips(d ? CRATE : CASE)}</span>
      <span class="act">${st ? `<span class="stamp${S.fresh === key ? ' fresh' : ''}"></span>` : ready ? `<button class="take" data-take="${key}">${tr('ЗАБРАТЬ')}</button>` : `<span class="wait">${tr('ещё {0}', [N - n])}</span>`}</span></div>`; };
  const ptsLabel = (Q) => Q.pts >= ROUTE_MAX ? tr('{0} очков · маршрут пройден', [Math.round(S.shown >= ROUTE_MAX ? Q.pts : S.shown)]) : tr('{0} / {1} очков', [Math.round(S.shown), ROUTE_MAX]);
  function routeHtml() {
    const mg = migKey();
    return `<svg viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="${rPath(ROUTE_MAX)}" fill="none" stroke="#efe7cf" stroke-opacity=".7" stroke-width="2.2" stroke-dasharray="2 6" vector-effect="non-scaling-stroke" stroke-linecap="round"/>
      <polyline class="dn0" fill="none" stroke="#000" stroke-opacity=".55" stroke-width="7" vector-effect="non-scaling-stroke" stroke-linejoin="round"/><polyline class="dn1" fill="none" stroke="#f0bd5a" stroke-width="3.2" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/></svg>
      ${ROUTE.map((w, i) => `<div class="wp${i ? '' : ' base'}" data-w="${i}" style="left:${rX(w.p)}%;top:${YS[i]}%"><img class="pin" alt=""><span class="v">${i ? w.p : tr('база')}</span>${w.r ? `<span class="wr">${chips(w.r)}</span>` : ''}</div>`).join('')}
      <div class="mig${S.raf ? '' : ' idle'}"><div class="rot"><img class="shd" src="${UI}mig_${mg}_shadow.webp" alt=""><img class="pl" src="${UI}mig_${mg}.webp" alt=""></div></div>`;
  }
  // положение МиГа, золотая линия, булавки: каждый кадр полёта и после перерисовки
  function place() {
    const R = root.querySelector('.route'); if (!R) return; const b = R.getBoundingClientRect(), p = S.shown, x = rX(p), y = rY(p);
    const m = R.querySelector('.mig'); if (m) { m.style.left = x + '%'; m.style.top = y + '%'; const a = Math.max(0, p - 1), c = Math.min(ROUTE_MAX, p + 1), ang = Math.atan2((rY(c) - rY(a)) / 100 * b.height, (rX(c) - rX(a)) / 100 * b.width) * 180 / Math.PI; m.firstElementChild.style.transform = `rotate(${ang}deg)`; }
    const d = rPath(p); R.querySelector('.dn0').setAttribute('points', d); R.querySelector('.dn1').setAttribute('points', d);
    let next = true; R.querySelectorAll('.wp').forEach((el, i) => { const w = ROUTE[i], got = w.p <= p + 1e-6, st = got ? 'got' : next ? 'next' : 'off'; if (!got) next = false; el.classList.toggle('got', got); const im = el.querySelector('.pin'), src = `${UI}pin_${st}.webp`; if (im.getAttribute('src') !== src) im.setAttribute('src', src); });
    const l = root.querySelector('.ptsT'); if (l) l.textContent = ptsLabel(V());
  }
  function showNum(k, pulse) { const el = root.querySelector(`.cur [data-c="${k}"]`); if (!el) return; el.querySelector('u').textContent = num(S.disp[k]); if (pulse) { el.classList.add('pulse'); setTimeout(() => el.classList.remove('pulse'), 180); } }
  // когда всё долетело - числа точно как на сервере
  function settle() { if (S.flying || S.raf) return; S.disp = cur(); for (const k of ['xp', 'silver', 'gem']) showNum(k); }
  // награда: значки летят к счётчикам, число меняется по прилёту (начислил уже сервер, это только показ)
  function give(r, a) {
    Object.entries(r).forEach(([k, v], i) => {
      const to = root.querySelector(`.cur [data-c="${k}"] img`), b = to && to.getBoundingClientRect();
      if (!a || !b || !root.animate) { S.disp[k] += v; showNum(k, true); return; }
      const im = document.createElement('img'); im.className = 'flyR'; im.src = TILE[k]; im.alt = ''; root.appendChild(im); S.flying++;
      const x0 = a.left + a.width / 2 - 17 + i * 18, y0 = a.top + a.height / 2 - 17, x1 = b.left + b.width / 2 - 17, y1 = b.top + b.height / 2 - 17;
      const an = im.animate([{ transform: `translate(${x0}px, ${y0}px) scale(.7)`, opacity: 0 }, { transform: `translate(${x0}px, ${y0 - 26}px) scale(1.25)`, opacity: 1, offset: .25 }, { transform: `translate(${x1}px, ${y1}px) scale(.75)`, opacity: 1 }], { duration: 720 + i * 90, easing: 'cubic-bezier(.4,0,.25,1)' });
      an.onfinish = () => { im.remove(); S.flying--; S.disp[k] += v; showNum(k, true); settle(); };
    });
  }
  // награда точки маршрута пришла с сервера; на экране - когда самолёт долетел
  function reachPins() { for (let i = S.paid + 1; i < ROUTE.length; i++) { if (ROUTE[i].p > S.shown + 1e-6) break; S.paid = i; const el = root.querySelector(`.wp[data-w="${i}"]`); if (el) { el.classList.add('ping'); setTimeout(() => el.classList.remove('ping'), 320); } give(ROUTE[i].r, el && el.querySelector('.wr') && el.querySelector('.wr').getBoundingClientRect()); snd(); } }
  function fly() {
    cancelAnimationFrame(S.raf); S.raf = 0; const Q = V(), from = S.shown, to = Math.min(Q.pts, ROUTE_MAX);
    if (to < from) S.paid = Q.paid; // новая неделя: самолёт возвращается на базу без наград
    if (Math.abs(to - from) < 1e-3) { S.shown = to; place(); settle(); return; }
    const dur = Math.min(2800, 1000 + Math.abs(to - from) * 34), t0 = performance.now(); const m0 = root.querySelector('.mig'); if (m0) m0.classList.remove('idle');
    const step = (now) => { const k = Math.min(1, (now - t0) / dur), e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2; S.shown = from + (to - from) * e; place(); reachPins();
      if (k < 1) S.raf = requestAnimationFrame(step); else { S.raf = 0; S.shown = to; const m = root.querySelector('.mig'); if (m) m.classList.add('idle'); place(); settle(); } };
    S.raf = requestAnimationFrame(step);
  }
  async function take(key, el) {
    if (S.busy) return; S.busy = true; S.msg = '';
    const [k, id] = key.split(':'), r = key === 'crate' ? CRATE : key === 'chest' ? CASE : (k === 'd' ? DAILY : WEEKLY)[id].r, a = el.getBoundingClientRect(), g0 = cur().gem;
    const res = await PG().questClaim(key); S.busy = false;
    if (!res.ok) { S.msg = res.why || tr('Ошибка сервера'); draw(); PG().questsRefresh().then(() => { draw(); touch(); }); return; } // например, забрали в другой вкладке
    if (cur().gem !== g0 && C.shop && C.shop.reset) C.shop.reset(); // кошелёк магазина - заново
    snd(); S.fresh = key; draw(); give(r, a); touch(); fly(); setTimeout(() => { S.fresh = null; }, 400);
  }

  function popView() {
    return `<div class="pop"><p>${tr('Тестовый режим: состояние в памяти этой вкладки, на сервер ничего не уходит.')}</p>
      <button data-d="adv">${tr('Продвинуть задания этой вкладки')}</button><button data-d="day">${tr('Следующий день')}</button><button data-d="week">${tr('Следующая неделя')}</button>
      <div class="two"><button data-d="grey" class="${migKey() === 'grey' ? 'on' : ''}">${tr('МиГ-31 серый')}</button><button data-d="dragon" class="${migKey() === 'dragon' ? 'on' : ''}">${tr('«Нефритовый дракон»')}</button></div>
      <button data-d="reset">${tr('Сбросить демо')}</button></div>`;
  }
  function draw() {
    if (!isOpen()) return;
    const ld = root.querySelector('.list'), sc = ld ? ld.scrollTop : 0;
    const Q = V(), d = S.tab === 'd', P = d ? DAILY : WEEKLY, L = d ? Q.d : Q.w, pts = d ? PTS_DAILY : PTS_WEEKLY, nD = doneN(Q.d) + (allTaken(Q.d) && !Q.crate ? 1 : 0), nW = doneN(Q.w) + (allTaken(Q.w) && !Q.chest ? 1 : 0), guest = PG().guest;
    const mark = (n, tm) => `<span class="mk${n ? ' rdy' : ''}">${n ? `<i>${n}</i>` : ''}<span class="${tm}"></span></span>`;
    const note = guest ? `<div class="qmsg">${tr('Вы не вошли: задания считаются только в аккаунте игры.')} <button data-acc="1">${tr('Войти или создать аккаунт')}</button></div>` : S.msg ? `<div class="qmsg err">${S.msg}</div>` : '';
    root.innerHTML = `<div class="topFill"></div><div class="top"><button class="back" data-close="1" aria-label="${tr('Назад')}">«</button><h2>${qic('menu-scroll-unfurled')}${tr('Задания')}</h2>${PG().test ? `<button class="demoB" data-pop="1">${tr('ДЕМО')}</button>` : ''}
        <div class="cur"><span class="xp" data-c="xp"><img src="${TILE.xp}" alt=""><u>${num(S.disp.xp)}</u></span><span data-c="silver"><img src="${TILE.silver}" alt=""><u>${num(S.disp.silver)}</u></span><span class="gem" data-c="gem"><img src="${TILE.gem}" alt=""><u>${num(S.disp.gem)}</u></span></div></div>
      <div class="gw"><div class="sum"><div class="sh"><b>${tr('Сводка недели')}</b><span class="pts"><img src="${TILE.star}" alt=""><span class="ptsT"></span></span><span class="tm">${qic('weekly-calendar')}<span>${tr('неделя закончится через')}</span> <b class="tmW"></b></span></div><div class="route">${routeHtml()}</div></div>
        <div class="tabs"><button class="tab ${d ? 'on' : ''}" data-tab="d"><b>${tr('Ежедневно')}</b>${mark(nD, 'tmD')}</button><button class="tab ${d ? '' : 'on'}" data-tab="w"><b>${tr('Еженедельно')}</b>${mark(nW, 'tmW')}</button></div>
        <div class="list">${note}${known(L, P).map((q) => row({ ...P[q.id], ...q, pts }, S.tab, 0)).join('')}${bonus(Q, d)}</div></div>${S.pop ? popView() : ''}`;
    const l2 = root.querySelector('.list'); if (l2) l2.scrollTop = sc;
    place(); tick();
  }
  function tick() { root.querySelectorAll('.tmD').forEach((e) => { e.textContent = hms(dayLeft()); }); root.querySelectorAll('.tmW').forEach((e) => { e.textContent = dh(weekLeft()); }); }
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-close],[data-pop],[data-tab],[data-take],[data-d],[data-acc]');
    if (!t) { if (S.pop) { S.pop = false; draw(); } return; }
    if (t.dataset.close) { api.close(); return; }
    if (t.dataset.acc) { if (C.account) C.account.open('login'); return; }
    if (t.dataset.pop) { S.pop = !S.pop; draw(); return; }
    if (t.dataset.tab) { S.tab = t.dataset.tab; S.pop = false; S.msg = ''; snd(); const l = root.querySelector('.list'); if (l) l.scrollTop = 0; draw(); return; }
    if (t.dataset.take) { take(t.dataset.take, t); return; }
    const a = t.dataset.d;
    if (a === 'grey' || a === 'dragon') S.mig = a;
    else PG().questTest(a, S.tab);
    if (a === 'reset') S.mig = null;
    S.fresh = null; draw(); touch(); fly();
  });
  addEventListener('resize', () => { draw(); });
  let stale = 0;
  setInterval(() => { if (!isOpen()) return; tick(); if (V().day !== mskDay() && !PG().test && Date.now() - stale > 60000) { stale = Date.now(); PG().questsRefresh().then(() => { draw(); touch(); fly(); }); } }, 1000); // полночь при открытом экране
  setInterval(() => { touch(); if (!isOpen() && PG() && !PG().test && !PG().guest && V().day !== mskDay() && Date.now() - stale > 600000) { stale = Date.now(); PG().questsRefresh(); } }, 30000); // полночь в меню: кнопка и табличка - про новый день

  // кнопка в меню: подпись «сделано N из 3 · до обновления», три лампы, красная цифра - есть что забрать
  function touch() {
    const b = $('qstBtn'); if (!b || !PG()) return; b.style.display = 'flex';
    const sub = $('qstSub'), seg3 = $('qstSeg'), dt = $('qstDot'), Q = V(), n = Q.d.filter((q) => q.st).length, c = PG().guest ? 0 : count(Q);
    if (sub) sub.textContent = `${tr('{0} из {1}', [n, Q.d.length])} · ${hms(dayLeft()).slice(0, 5)}`;
    if (seg3) seg3.innerHTML = Q.d.map((q) => `<i class="${q.st === 'taken' ? 'ok' : q.st === 'done' ? 'on' : ''}"></i>`).join('');
    if (dt) { dt.textContent = c || ''; dt.style.display = c ? 'block' : 'none'; }
    if (C.menu && C.menu.notice) C.menu.notice();
  }
  const api = {
    open() {
      root.classList.add('on'); document.body.classList.add('researchOn'); S.pop = false; S.msg = ''; const sync = () => { const Q = V(); S.shown = Math.min(Q.pts, ROUTE_MAX); S.paid = Q.paid; S.disp = cur(); };
      sync(); draw();
      PG().questsRefresh().then((r) => { if (!isOpen()) return; if (!r.ok) S.msg = r.why; if (!S.flying && !S.raf) sync(); draw(); touch(); });
    },
    close() { cancelAnimationFrame(S.raf); S.raf = 0; root.classList.remove('on'); document.body.classList.remove('researchOn'); touch(); if (C.menu && C.menu.render) C.menu.render(); },
    isOpen,
    touch,
    pending: () => (PG() && !PG().guest ? count(V()) : 0), // незабранные награды - для таблички меню
  };
  if ($('qstIco')) $('qstIco').innerHTML = qic('menu-scroll-unfurled');
  if ($('qstBtn')) $('qstBtn').onclick = () => { snd(); api.open(); };
  if (PG() && PG().on) PG().on(() => { touch(); if (isOpen() && !S.busy && !S.raf && !S.flying) { S.disp = cur(); draw(); } });
  touch();
  return api;
}
