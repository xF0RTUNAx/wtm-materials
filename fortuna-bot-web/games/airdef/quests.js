// Экран «Задания»: ежедневные и еженедельные, маршрут недели с МиГ-31 (макет tools/airdef-mockups/quests.html, вариант F «Сводка»; пул и награды — quests-data.js).
// Материалы — пререндер: ui/quests/ (штабной стол, карта, булавки, МиГ-31, корешки досье, плашки, латунная кнопка, печать, лампы), t_* — пробные плитки наград.
// Пока ДЕМО: состояние — в этом браузере, сервер ничего не считает и не начисляет; на сайте кнопка скрыта (видна локально и с ?quests=1).
import { DAILY, WEEKLY, ROUTE, ROUTE_MAX, DAILY_N, WEEKLY_N, PTS_DAILY, PTS_WEEKLY, CRATE, CASE, pickDaily, pickWeekly, weekTotals } from './quests-data.js?v=20261103a';
import { QI } from './quest-icons.js?v=20261103a';
import { eventOn } from './event.js?v=20261103a';
import { tr, LANG } from './i18n.js?v=20261103a';

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
#quests .wp .v { position: absolute; left: 0; top: -44px; transform: translateX(-50%); font: 600 13px 'Oswald'; color: #e7e1cf; text-shadow: 0 1px 2px #000, 0 0 6px #000; white-space: nowrap; } #quests .wp.got .v { color: var(--gold2); }
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
#quests .mk { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 9px; font: 500 13px 'Oswald'; font-variant-numeric: tabular-nums; color: #2a2215; background: linear-gradient(#d9cfae, #bdb18c); box-shadow: 0 1px 3px rgba(0,0,0,.55); } /* временная закладка до рендера сборщика */
#quests .mk.rdy { color: #fff; background: linear-gradient(#b8382c, #8f2a20); } #quests .mk i { font: 600 14px 'Oswald'; font-style: normal; padding-right: 6px; border-right: 1px solid rgba(255,255,255,.4); }
#quests .list { flex: 1 1 0; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; display: flex; flex-direction: column; gap: 5px; scrollbar-width: none; } #quests .list::-webkit-scrollbar { display: none; }
#quests .row { position: relative; flex: none; height: 62px; display: grid; grid-template-columns: 44px minmax(0, 1fr) 214px 178px 124px; gap: 12px; align-items: center; padding: 0 12px 0 8px; border-style: solid; border-width: 14px; border-image: url(${UI}plate.webp) 28 fill / 14px stretch; }
#quests .row > * { margin: -14px 0; } #quests .row.done { border-image-source: url(${UI}plate_done.webp); }
#quests .no { display: flex; align-items: center; justify-content: center; } #quests .no .ic { width: 28px; height: 28px; color: var(--gold2); } #quests .row.taken .no .ic { color: var(--green); }
#quests .tx { min-width: 0; } #quests .t { font: 500 17px 'Oswald'; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-shadow: 0 1px 1px rgba(0,0,0,.6); }
#quests .d { font-size: 12px; color: var(--dim); margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } #quests .wh { color: var(--dim2); font: 600 10.5px 'Golos Text'; text-transform: uppercase; letter-spacing: .06em; margin-right: 4px; }
#quests .tag { display: inline-block; margin-left: 8px; padding: 0 5px; border: 1px solid #e2762c; color: #ff9a3c; font: 500 11px 'Oswald'; vertical-align: 2px; }
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
#quests .flyR { position: fixed; left: 0; top: 0; width: 34px; height: 34px; z-index: 6; pointer-events: none; }
#quests .pop { position: absolute; z-index: 7; right: max(18px, var(--sa-r, 0px)); left: auto; top: calc(var(--rt) + var(--hh) + 2px); width: 270px; max-height: calc(100% - var(--rt) - var(--hh) - 10px); overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 6px; background: rgba(14,16,10,.97); border: 1px solid rgba(232,176,74,.6); box-shadow: 0 8px 24px rgba(0,0,0,.6); }
#quests .pop p { margin: 0 0 4px; font-size: 12px; line-height: 1.35; color: var(--dim); } #quests .pop button { padding: 7px 10px; text-align: left; font: 500 14px 'Oswald'; color: #ece8dc; background: rgba(233,230,220,.07); border: 1px solid rgba(233,230,220,.16); cursor: pointer; } #quests .pop button:hover { background: rgba(233,230,220,.15); } #quests .pop button.on { border-color: var(--gold); color: var(--gold2); } #quests .pop .two { display: flex; gap: 6px; } #quests .pop .two button { flex: 1 1 0; }
#quests .allv { position: absolute; z-index: 5; left: 0; right: 0; bottom: 0; top: calc(var(--rt) + var(--hh)); overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 10px max(18px, var(--sa-r, 0px)) 18px max(18px, var(--sa-l, 0px)); background: rgba(12,14,9,.975); }
#quests .allv .in { max-width: 1280px; margin: 0 auto; display: flex; flex-direction: column; gap: 5px; } #quests .allv h3 { margin: 12px 0 4px; font: 500 18px 'Oswald'; color: var(--gold2); } #quests .allv h3:first-child { margin-top: 0; } #quests .allv h3 small { font: 400 13px 'Golos Text'; color: var(--dim); margin-left: 8px; }
#quests .allv .note { margin: 0 0 4px; font-size: 13px; line-height: 1.45; color: var(--dim); } #quests .allv .note b { color: #ece8dc; font-weight: 600; }
#quests .allv table { border-collapse: collapse; font: 500 14px 'Oswald'; font-variant-numeric: tabular-nums; align-self: flex-start; } #quests .allv td, #quests .allv th { padding: 3px 14px 3px 0; text-align: right; border-bottom: 1px solid rgba(233,230,220,.12); white-space: nowrap; } #quests .allv td:first-child, #quests .allv th:first-child { text-align: left; font-weight: 400; } #quests .allv th { color: var(--dim2); font-weight: 400; } #quests .allv tr:last-child td { color: var(--gold2); border-bottom: 0; font-weight: 600; }
#quests .allv .row { grid-template-columns: 44px minmax(0, 1fr) 178px; } #quests .allv .prog, #quests .allv .act { display: none; }
@media (max-height: 460px) {
  #quests { --hh: 46px; } #quests .top { gap: 9px; } #quests h2 { font-size: 19px; } #quests h2 .ic { width: 24px; height: 24px; } #quests .cur { font-size: 14.5px; gap: 12px; } #quests .cur img { width: 22px; height: 22px; }
  #quests .gw { top: calc(var(--rt) + var(--hh) + 4px); bottom: max(4px, var(--sa-b, 0px)); left: max(8px, var(--sa-l, 0px)); right: max(8px, var(--sa-r, 0px)); gap: 4px; }
  #quests .sum { height: 92px; padding: 4px 10px; background-size: auto 210px; background-position: center bottom; } #quests .route { top: 22px; bottom: 2px; left: 10px; right: 10px; } #quests .sh b { font-size: 11.5px; } #quests .sh .pts { font-size: 13px; } #quests .sh .pts img { width: 16px; height: 16px; } #quests .sh .tm, #quests .sh .tm b { font-size: 11.5px; }
  #quests .wp img.pin { width: 34px; height: 34px; left: -18px; top: -25px; } #quests .wp .v { top: -33px; font-size: 10.5px; } #quests .wp .wr { top: 8px; } #quests .chip { font-size: 10.5px; padding-right: 4px; } #quests .chip img { width: 14px; height: 14px; }
  #quests .mig img { width: 108px; height: 45px; left: -54px; top: -22.5px; }
  #quests .list { padding-bottom: 8px; -webkit-mask-image: linear-gradient(#000 calc(100% - 10px), transparent); mask-image: linear-gradient(#000 calc(100% - 10px), transparent); gap: 4px; } #quests .tabs { height: 31px; } #quests .tab { height: 29px; padding: 0 4px 0 2px; gap: 8px; } #quests .mk { height: 22px; padding: 0 6px; font-size: 11px; gap: 4px; } #quests .mk i { font-size: 12px; padding-right: 4px; } #quests .tab b { font-size: 13.5px; }
  #quests .row { height: 45px; grid-template-columns: 26px minmax(0, 1fr) 112px 132px 88px; gap: 8px; padding: 0 2px 0 0; border-width: 10px; border-image-width: 10px; } #quests .row > * { margin: -10px 0; }
  #quests .no .ic { width: 21px; height: 21px; } #quests .t { font-size: 14.5px; } #quests .d { font-size: 10.5px; margin-top: 0; } #quests .wh { font-size: 9px; } #quests .sg i { height: 11px; } #quests .prog { gap: 6px; }
  #quests .cnt { font-size: 11.5px; min-width: 36px; } #quests .ptc { font-size: 10.5px; padding-right: 3px; } #quests .ptc img { width: 13px; height: 13px; } #quests .rws { gap: 3px; } #quests .take { width: 86px; height: 28px; font-size: 12px; letter-spacing: .1em; } #quests .stamp { width: 86px; height: 33px; margin-right: 0; } #quests .wait { font-size: 11.5px; }
  #quests .bon { height: 40px; border-width: 9px; border-image-width: 9px; gap: 8px; } #quests .bon > * { margin: -9px 0; } #quests .bon img.cr { width: 34px; height: 34px; } #quests .bon .bt { font-size: 13px; } #quests .bon .s3 i { width: 20px; height: 11px; } #quests .bon .act { min-width: 88px; }
  #quests .allv .row { grid-template-columns: 26px minmax(0, 1fr) 132px; }
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
const cnt = (q) => q.u === 'h' ? `<b>${dec(q.n / 60)}</b> / ${tr('{0} ч', [q.of / 60])}` : q.u === 'min' ? `<b>${q.n}</b> / ${tr('{0} мин', [q.of])}` : q.of >= 10000 ? `<b>${dec(q.n / 1000)}</b> / ${tr('{0} тыс.', [q.of / 1000])}` : `<b>${num(q.n)}</b> / ${num(q.of)}`;
const leftOf = (q) => { const v = q.of - q.n; return tr('ещё {0}', [q.u === 'h' ? tr('{0} ч', [dec(v / 60)]) : q.u === 'min' ? tr('{0} мин', [v]) : q.of >= 10000 ? tr('{0} тыс.', [dec(v / 1000)]) : num(v)]); };
const chips = (r) => Object.entries(r).map(([k, v]) => `<span class="chip ${k}"><img src="${TILE[k]}" alt="">${num(v)}</span>`).join('');
const seg = (q) => { const m = Math.min(q.of, 10), f = q.n >= q.of ? m : q.n > 0 ? Math.max(1, Math.floor(m * q.n / q.of)) : 0, c = q.n >= q.of ? 'ok' : 'on'; return `<span class="sg">${Array.from({ length: m }, (_, i) => `<i class="${i < f ? c : ''}"></i>`).join('')}</span>`; };
// маршрут: x — по очкам, y — между путевыми точками плавно (проценты полосы)
const YS = [56, 47, 63, 49, 61, 51];
const rX = (p) => 3 + p / ROUTE_MAX * 92.5;
const rY = (p) => { p = Math.max(0, Math.min(ROUTE_MAX, p)); let i = 1; while (i < ROUTE.length - 1 && ROUTE[i].p < p) i++; const a = ROUTE[i - 1].p, b = ROUTE[i].p, t = (p - a) / (b - a); return YS[i - 1] + (YS[i] - YS[i - 1]) * (1 - Math.cos(Math.PI * t)) / 2; };
const rPath = (p) => { const L = []; for (let x = 0; x < p; x += ROUTE_MAX / 150) L.push(`${rX(x).toFixed(2)},${rY(x).toFixed(2)}`); L.push(`${rX(p).toFixed(2)},${rY(p).toFixed(2)}`); return L.join(' '); };

const LS = 'fortuna_airdef_quests_demo';
function freshDemo() {
  const L = (P, ids) => ids.map(([id, n = 0, st = '']) => ({ id, n, st: st || (n >= P[id].of ? 'done' : '') }));
  return { v: 1, day: 1, week: 1, pts: 130, paid: 2, mig: 'grey', cur: { xp: 3528, silver: 12400, gem: 46 }, crate: '', chest: '',
    daily: L(DAILY, [['kills', 6], ['strike', 4], ['play3', 3, 'taken']]),
    weekly: L(WEEKLY, [['play', 11], ['wins', 3], ['downs', 80], ['xp', 14200], ['days', 5, 'taken']]) };
}

export function createQuests(C) {
  const $ = (id) => document.getElementById(id), snd = () => C.snd || null;
  const css = document.createElement('style'); css.textContent = CSS; (document.head || document.body).appendChild(css);
  const root = document.createElement('div'); root.id = 'quests'; if (LANG === 'en') root.classList.add('en'); document.body.appendChild(root);
  let D = null; try { D = JSON.parse(localStorage.getItem(LS) || 'null'); } catch (_) { /* приватный режим */ } if (!D || D.v !== 1) D = freshDemo();
  const save = () => { try { localStorage.setItem(LS, JSON.stringify(D)); } catch (_) { /* приватный режим */ } };
  const S = { tab: 'd', pop: false, all: false, shown: Math.min(D.pts, ROUTE_MAX), disp: { ...D.cur }, raf: 0, fresh: null };
  const full = (P, q) => ({ ...P[q.id], ...q });
  const claimable = () => D.daily.filter((q) => q.st === 'done').length + D.weekly.filter((q) => q.st === 'done').length + (allTaken(D.daily) && !D.crate ? 1 : 0) + (allTaken(D.weekly) && !D.chest ? 1 : 0);
  const allTaken = (L) => L.every((q) => q.st === 'taken');
  const doneN = (L) => L.filter((q) => q.st).length;

  const row = (q, kind, i) => `<div class="row ${q.st || ''}"><span class="no">${qic(q.st === 'taken' ? 'done-check-mark' : q.ic)}</span>
    <div class="tx"><div class="t">${tr(q.t)}${q.ev && kind === 'ro' ? `<span class="tag">${tr('только в событие')}</span>` : ''}</div><div class="d"><span class="wh">${tr('засчитывается:')}</span>${tr(q.d)}</div></div>
    <span class="prog">${seg(q)}<span class="cnt">${cnt(q)}</span></span><span class="rws">${chips(q.r)}<span class="ptc"><img src="${TILE.star}" alt="">+${q.pts}</span></span>
    <span class="act">${q.st === 'done' ? `<button class="take" data-take="${kind}:${i}">${tr('ЗАБРАТЬ')}</button>` : q.st === 'taken' ? `<span class="stamp${S.fresh === `${kind}:${i}` ? ' fresh' : ''}"></span>` : `<span class="wait">${leftOf(q)}</span>`}</span></div>`;
  const bonus = (d) => { const L = d ? D.daily : D.weekly, st = d ? D.crate : D.chest, ready = allTaken(L), N = L.length, n = L.filter((q) => q.st === 'taken').length, key = d ? 'crate' : 'chest';
    return `<div class="bon ${ready && !st ? 'done' : ''}"><img class="cr" src="${d ? TILE.crate : TILE.case}" alt=""><span class="bt">${tr(d ? 'Ящик снабжения за все три сегодня' : 'Кейс недели за все пять')}</span><span class="s3">${Array.from({ length: N }, (_, i) => `<i class="${i < n ? (ready ? 'ok' : 'on') : ''}"></i>`).join('')}</span><span class="rws">${chips(d ? CRATE : CASE)}</span>
      <span class="act">${st ? `<span class="stamp${S.fresh === key ? ' fresh' : ''}"></span>` : ready ? `<button class="take" data-take="${key}">${tr('ЗАБРАТЬ')}</button>` : `<span class="wait">${tr('ещё {0}', [N - n])}</span>`}</span></div>`; };
  const ptsLabel = () => D.pts >= ROUTE_MAX ? tr('{0} очков · маршрут пройден', [Math.round(S.shown >= ROUTE_MAX ? D.pts : S.shown)]) : tr('{0} / {1} очков', [Math.round(S.shown), ROUTE_MAX]);
  function routeHtml() {
    return `<svg viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="${rPath(ROUTE_MAX)}" fill="none" stroke="#efe7cf" stroke-opacity=".7" stroke-width="2.2" stroke-dasharray="2 6" vector-effect="non-scaling-stroke" stroke-linecap="round"/>
      <polyline class="dn0" fill="none" stroke="#000" stroke-opacity=".55" stroke-width="7" vector-effect="non-scaling-stroke" stroke-linejoin="round"/><polyline class="dn1" fill="none" stroke="#f0bd5a" stroke-width="3.2" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/></svg>
      ${ROUTE.map((w, i) => `<div class="wp${i ? '' : ' base'}" data-w="${i}" style="left:${rX(w.p)}%;top:${YS[i]}%"><img class="pin" alt=""><span class="v">${i ? w.p : tr('база')}</span>${w.r ? `<span class="wr">${chips(w.r)}</span>` : ''}</div>`).join('')}
      <div class="mig idle"><div class="rot"><img class="shd" src="${UI}mig_${D.mig}_shadow.webp" alt=""><img class="pl" src="${UI}mig_${D.mig}.webp" alt=""></div></div>`;
  }
  // положение МиГа, золотая линия, булавки: каждый кадр полёта и после перерисовки
  function place() {
    const R = root.querySelector('.route'); if (!R) return; const b = R.getBoundingClientRect(), p = S.shown, x = rX(p), y = rY(p);
    const m = R.querySelector('.mig'); if (m) { m.style.left = x + '%'; m.style.top = y + '%'; const a = Math.max(0, p - 1), c = Math.min(ROUTE_MAX, p + 1), ang = Math.atan2((rY(c) - rY(a)) / 100 * b.height, (rX(c) - rX(a)) / 100 * b.width) * 180 / Math.PI; m.firstElementChild.style.transform = `rotate(${ang}deg)`; }
    const d = rPath(p); R.querySelector('.dn0').setAttribute('points', d); R.querySelector('.dn1').setAttribute('points', d);
    let next = true; R.querySelectorAll('.wp').forEach((el, i) => { const w = ROUTE[i], got = w.p <= p + 1e-6, st = got ? 'got' : next ? 'next' : 'off'; if (!got) next = false; el.classList.toggle('got', got); const im = el.querySelector('.pin'), src = `${UI}pin_${st}.webp`; if (im.getAttribute('src') !== src) im.setAttribute('src', src); });
    const l = root.querySelector('.ptsT'); if (l) l.textContent = ptsLabel();
  }
  function pulse(k) { const el = root.querySelector(`.cur [data-c="${k}"]`); if (!el) return; el.querySelector('u').textContent = num(S.disp[k]); el.classList.add('pulse'); setTimeout(() => el.classList.remove('pulse'), 180); }
  // награда: на счёт сразу, значки летят к счётчикам; число меняется по прилёту
  function give(r, from) {
    const a = from && from.getBoundingClientRect ? from.getBoundingClientRect() : null;
    Object.entries(r).forEach(([k, v], i) => { D.cur[k] += v;
      const to = root.querySelector(`.cur [data-c="${k}"] img`), b = to && to.getBoundingClientRect();
      if (!a || !b || !root.animate) { S.disp[k] = D.cur[k]; pulse(k); return; }
      const im = document.createElement('img'); im.className = 'flyR'; im.src = TILE[k]; im.alt = ''; root.appendChild(im);
      const x0 = a.left + a.width / 2 - 17 + i * 18, y0 = a.top + a.height / 2 - 17, x1 = b.left + b.width / 2 - 17, y1 = b.top + b.height / 2 - 17;
      const an = im.animate([{ transform: `translate(${x0}px, ${y0}px) scale(.7)`, opacity: 0 }, { transform: `translate(${x0}px, ${y0 - 26}px) scale(1.25)`, opacity: 1, offset: .25 }, { transform: `translate(${x1}px, ${y1}px) scale(.75)`, opacity: 1 }], { duration: 720 + i * 90, easing: 'cubic-bezier(.4,0,.25,1)' });
      an.onfinish = () => { im.remove(); S.disp[k] = D.cur[k]; pulse(k); };
    });
  }
  // награда точки маршрута — сама, как только самолёт долетел
  function payRoute() { for (let i = D.paid + 1; i < ROUTE.length; i++) { if (ROUTE[i].p > S.shown + 1e-6) break; D.paid = i; save(); const el = root.querySelector(`.wp[data-w="${i}"]`); if (el) { el.classList.add('ping'); setTimeout(() => el.classList.remove('ping'), 320); } give(ROUTE[i].r, el && el.querySelector('.wr')); if (snd() && snd().click) snd().click(); } }
  function fly() {
    cancelAnimationFrame(S.raf); const from = S.shown, to = Math.min(D.pts, ROUTE_MAX); if (Math.abs(to - from) < 1e-3) { S.shown = to; place(); return; }
    const dur = Math.min(2800, 1000 + Math.abs(to - from) * 34), t0 = performance.now(); const m0 = root.querySelector('.mig'); if (m0) m0.classList.remove('idle');
    const step = (now) => { const k = Math.min(1, (now - t0) / dur), e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2; S.shown = from + (to - from) * e; place(); payRoute();
      if (k < 1) S.raf = requestAnimationFrame(step); else { S.shown = to; const m = root.querySelector('.mig'); if (m) m.classList.add('idle'); place(); } };
    S.raf = requestAnimationFrame(step);
  }
  const addTo = (id, v) => { const q = D.weekly.find((w) => w.id === id); if (q && !q.st) { q.n = Math.min(WEEKLY[id].of, q.n + v); if (q.n >= WEEKLY[id].of) q.st = 'done'; } };
  function take(key, el) {
    if (key === 'crate' || key === 'chest') { give(key === 'crate' ? CRATE : CASE, el); D[key] = 'taken'; S.fresh = key; }
    else { const [k, i] = key.split(':'), L = k === 'd' ? D.daily : D.weekly, q = L[+i]; if (!q || q.st !== 'done') return; q.st = 'taken'; give((k === 'd' ? DAILY : WEEKLY)[q.id].r, el); D.pts += k === 'd' ? PTS_DAILY : PTS_WEEKLY; S.fresh = key; if (k === 'd') addTo('daily', 1); }
    if (snd() && snd().click) snd().click(); save(); draw(); touch(); fly(); setTimeout(() => { S.fresh = null; }, 400);
  }
  // кнопки демо: ускорить то, что в игре делает сервер
  function autoClaim(L, P, pts) { for (const q of L) if (q.st === 'done') { q.st = 'taken'; give(P[q.id].r, null); D.pts += pts; } }
  function nextDay() { autoClaim(D.daily, DAILY, PTS_DAILY); if (allTaken(D.daily) && !D.crate) give(CRATE, null); addTo('days', 1); D.day++; D.crate = ''; D.daily = pickDaily(D.day, eventOn()).map((id) => ({ id, n: 0, st: '' })); }
  function nextWeek() { nextDay(); autoClaim(D.weekly, WEEKLY, PTS_WEEKLY); if (allTaken(D.weekly) && !D.chest) give(CASE, null); S.shown = Math.min(D.pts, ROUTE_MAX); payRoute(); D.week++; D.pts = 0; D.paid = 0; D.chest = ''; S.shown = 0; D.weekly = pickWeekly(D.week, eventOn()).map((id) => ({ id, n: 0, st: '' })); }
  function advance() { const L = S.tab === 'd' ? D.daily : D.weekly, P = S.tab === 'd' ? DAILY : WEEKLY; for (const q of L) if (!q.st) { q.n = Math.min(P[q.id].of, q.n + Math.ceil(P[q.id].of * 0.34)); if (q.n >= P[q.id].of) q.st = 'done'; } }

  function allView() {
    const T = weekTotals(false), rw = (A, k) => A[k] ? num(A[k]) : '—', roL = (P, pts) => Object.keys(P).map((id) => row({ ...P[id], id, n: 0, st: '', pts }, 'ro', 0)).join('');
    const line = (t, A, g) => `<tr><td>${t}</td><td>${rw(A, 'silver')}</td><td>${rw(A, 'xp')}</td><td>${g}</td></tr>`;
    return `<div class="allv"><div class="in"><h3>${tr('Сколько можно получить за неделю')}</h3>
      <table><tr><th></th><th>${tr('серебро')}</th><th>${tr('опыт')}</th><th>${tr('кристаллы')}</th></tr>${line(tr('Ежедневные: 21 задание'), T.daily, '—')}${line(tr('Ящики: 7 дней'), T.crates, '—')}${line(tr('Еженедельные: 5 заданий'), T.weekly, tr('0–2'))}${line(tr('Кейс недели'), CASE, '1')}${line(tr('Маршрут: 5 точек'), T.route, '3')}${line(tr('Всего за неделю'), T.all, tr('4–6'))}</table>
      <p class="note">${tr('Ежедневное даёт <b>{0}</b> очков, еженедельное — <b>{1}</b>. Вся неделя — <b>{2}</b> очков, конец маршрута — <b>{3}</b>. Запас — 60 очков: можно пропустить 2 дня целиком или 3 еженедельных.', [PTS_DAILY, PTS_WEEKLY, 21 * PTS_DAILY + WEEKLY_N * PTS_WEEKLY, ROUTE_MAX])}</p>
      <h3>${tr('Ежедневно')}<small>${tr('{0} в день из {1}', [DAILY_N, Object.keys(DAILY).length])}</small></h3>${roL(DAILY, PTS_DAILY)}
      <h3>${tr('Еженедельно')}<small>${tr('{0} на неделю из {1}', [WEEKLY_N, Object.keys(WEEKLY).length])}</small></h3>${roL(WEEKLY, PTS_WEEKLY)}</div></div>`;
  }
  function popView() {
    return `<div class="pop"><p>${tr('Демо: сервер пока ничего не считает и не начисляет, всё хранится в этом браузере.')}</p>
      <button data-d="adv">${tr('Продвинуть задания этой вкладки')}</button><button data-d="day">${tr('Следующий день')}</button><button data-d="week">${tr('Следующая неделя')}</button>
      <div class="two"><button data-d="grey" class="${D.mig === 'grey' ? 'on' : ''}">${tr('МиГ-31 серый')}</button><button data-d="dragon" class="${D.mig === 'dragon' ? 'on' : ''}">${tr('«Нефритовый дракон»')}</button></div>
      <button data-d="all">${S.all ? tr('Скрыть список заданий') : tr('Все задания и награды')}</button><button data-d="reset">${tr('Сбросить демо')}</button></div>`;
  }
  function draw() {
    if (!root.classList.contains('on')) return;
    const ld = root.querySelector('.list'), sc = ld ? ld.scrollTop : 0, a0 = root.querySelector('.allv'), asc = a0 ? a0.scrollTop : 0;
    const d = S.tab === 'd', P = d ? DAILY : WEEKLY, L = d ? D.daily : D.weekly, pts = d ? PTS_DAILY : PTS_WEEKLY, nD = D.daily.filter((q) => q.st === 'done').length, nW = D.weekly.filter((q) => q.st === 'done').length;
    const mark = (n, tm) => `<span class="mk${n ? ' rdy' : ''}">${n ? `<i>${n}</i>` : ''}<span class="${tm}"></span></span>`;
    root.innerHTML = `<div class="topFill"></div><div class="top"><button class="back" data-close="1" aria-label="${tr('Назад')}">«</button><h2>${qic('menu-scroll-unfurled')}${tr('Задания')}</h2><button class="demoB" data-pop="1">${tr('ДЕМО')}</button>
        <div class="cur"><span class="xp" data-c="xp"><img src="${TILE.xp}" alt=""><u style="text-decoration:none">${num(S.disp.xp)}</u></span><span data-c="silver"><img src="${TILE.silver}" alt=""><u style="text-decoration:none">${num(S.disp.silver)}</u></span><span class="gem" data-c="gem"><img src="${TILE.gem}" alt=""><u style="text-decoration:none">${num(S.disp.gem)}</u></span></div></div>
      <div class="gw"><div class="sum"><div class="sh"><b>${tr('Сводка недели')}</b><span class="pts"><img src="${TILE.star}" alt=""><span class="ptsT"></span></span><span class="tm">${qic('weekly-calendar')}<span>${tr('неделя закончится через')}</span> <b class="tmW"></b></span></div><div class="route">${routeHtml()}</div></div>
        <div class="tabs"><button class="tab ${d ? 'on' : ''}" data-tab="d"><b>${tr('Ежедневно')}</b>${mark(nD, 'tmD')}</button><button class="tab ${d ? '' : 'on'}" data-tab="w"><b>${tr('Еженедельно')}</b>${mark(nW, 'tmW')}</button></div>
        <div class="list">${L.map((q, i) => row({ ...full(P, q), pts }, S.tab, i)).join('')}${bonus(d)}</div></div>${S.all ? allView() : ''}${S.pop ? popView() : ''}`;
    const l2 = root.querySelector('.list'); if (l2) l2.scrollTop = sc; const a2 = root.querySelector('.allv'); if (a2) a2.scrollTop = asc;
    place(); tick();
  }
  function tick() { root.querySelectorAll('.tmD').forEach((e) => { e.textContent = hms(dayLeft()); }); root.querySelectorAll('.tmW').forEach((e) => { e.textContent = dh(weekLeft()); }); }
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-close],[data-pop],[data-tab],[data-take],[data-d]');
    if (!t) { if (S.pop) { S.pop = false; draw(); } return; }
    if (t.dataset.close) { if (S.all) { S.all = false; S.pop = false; draw(); return; } api.close(); return; }
    if (t.dataset.pop) { S.pop = !S.pop; draw(); return; }
    if (t.dataset.tab) { S.tab = t.dataset.tab; S.pop = false; S.all = false; if (snd() && snd().click) snd().click(); const l = root.querySelector('.list'); if (l) l.scrollTop = 0; draw(); return; }
    if (t.dataset.take) { take(t.dataset.take, t); return; }
    const a = t.dataset.d;
    if (a === 'adv') advance(); else if (a === 'day') nextDay(); else if (a === 'week') nextWeek();
    else if (a === 'grey' || a === 'dragon') D.mig = a; else if (a === 'all') { S.all = !S.all; S.pop = false; }
    else if (a === 'reset') { D = freshDemo(); S.shown = Math.min(D.pts, ROUTE_MAX); S.disp = { ...D.cur }; S.tab = 'd'; S.all = false; }
    save(); draw(); touch(); fly();
  });
  addEventListener('resize', () => { draw(); });
  setInterval(() => { if (root.classList.contains('on')) tick(); }, 1000);
  setInterval(() => { touch(); }, 30000);

  // кнопка в меню: подпись «сделано N из 3 · до обновления», три лампы, красная цифра — есть что забрать
  const SHOW = (() => { try { return !/(^|\.)fortunawtm\.com$/.test(location.hostname) || new URLSearchParams(location.search).has('quests'); } catch (_) { return false; } })();
  function touch() {
    const b = $('qstBtn'); if (!b) return; b.style.display = SHOW ? 'flex' : 'none'; if (!SHOW) return;
    const sub = $('qstSub'), seg3 = $('qstSeg'), dt = $('qstDot'), n = doneN(D.daily), c = claimable();
    if (sub) sub.textContent = `${tr('{0} из {1}', [n, D.daily.length])} · ${hms(dayLeft()).slice(0, 5)}`;
    if (seg3) seg3.innerHTML = D.daily.map((q) => `<i class="${q.st === 'taken' ? 'ok' : q.st === 'done' ? 'on' : ''}"></i>`).join('');
    if (dt) { dt.textContent = c || ''; dt.style.display = c ? 'block' : 'none'; }
  }
  const api = {
    open() { root.classList.add('on'); document.body.classList.add('researchOn'); S.pop = false; S.shown = Math.min(D.pts, ROUTE_MAX); S.disp = { ...D.cur }; draw(); },
    close() { cancelAnimationFrame(S.raf); root.classList.remove('on'); document.body.classList.remove('researchOn'); touch(); if (C.menu && C.menu.render) C.menu.render(); },
    isOpen: () => root.classList.contains('on'),
    touch,
  };
  if ($('qstIco')) $('qstIco').innerHTML = qic('menu-scroll-unfurled');
  if ($('qstBtn')) $('qstBtn').onclick = () => { if (snd() && snd().click) snd().click(); api.open(); };
  touch();
  return api;
}
