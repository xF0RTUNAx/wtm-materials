// Экран подбора онлайн-боя (Mark 2026-11-01): меню уходит, на его месте — техника в разных ракурсах (одна из раскладок, которые Mark
// собрал в прототипах v3 — https://claude.ai/artifact/GYSERtUd6bB2gHdcyPhCZD, коллекция layouts; случайно на каждый поиск), справа —
// кольцо с временем поиска (цифры Oswald), под ним — сколько ищут и когда старт, внизу — «Отменить». Ников нет: соперник до боя не виден.
// Картинки — модели игры (tools/airdef-models/poses.html → ui/mm/<юнит>_<ракурс>.webp). Звук: пинг раз в 4 с, щелчок «Отменить».
import { tr } from './i18n.js?v=20261029b';

// раскладка: dim — затемнение фона; s — [картинка, x, y — центр в % экрана 932 × 430, w — ширина %, яркость, дымка, покачивание, ('f' — зеркально)]
const LAYOUTS = [
  { dim: 0.5, s: [['air_e_su17_belly', 56.02, 14.14, 15, 0.6, 0.5, 1], ['air_e_tu22_head', 26.15, 29.31, 50, 1, 0.54, 1.6], ['pvo_kub_fl', 16.58, 73.04, 46, 0.62, 0, 0.2]] },
  { dim: 0.5, s: [['air_e_mig25_dive', 56.02, 14.14, 15, 0.6, 0.5, 1], ['air_mig29_h1', 26.15, 29.31, 50, 1, 0.54, 1.6], ['pvo_hawk21_fr', 16.58, 73.04, 46, 0.62, 0, 0.2]] },
  { dim: 0.5, s: [['air_e_mirage_f1_h3', 56.02, 14.14, 15, 0.6, 0.5, 1], ['air_e_gripen_climb', 26.15, 29.31, 50, 1, 0.54, 1.6], ['pvo_phalanx_fl', 16.58, 73.04, 46, 0.62, 0, 0.2]] },
  { dim: 0.5, s: [['air_e_mig27_h1', 56.02, 14.14, 15, 0.6, 0.5, 1], ['strike_storm_s_fr', 26.15, 29.31, 50, 1, 0.54, 1.6], ['pvo_osa_fl', 16.58, 73.04, 46, 0.62, 0, 0.2]] },
  { dim: 0.5, s: [['air_e_tu95_h3', 56.02, 14.14, 15, 0.6, 0.5, 1], ['wpn_kh101_head', 26.15, 29.31, 50, 1, 0.54, 1.6], ['strike_tochka_sideR', 16.58, 73.04, 46, 0.62, 0, 0.2]] },
  { dim: 0.5, s: [['air_e_b52_top', 56.02, 14.14, 15, 0.6, 0.5, 1], ['strike_arrw_fr', 26.15, 29.31, 50, 1, 0.54, 1.6], ['pvo_gpsjam_fl', 16.58, 73.04, 46, 0.62, 0, 0.2]] },
  { dim: 0.5, s: [['strike_shahed_belly', 56.02, 14.14, 15, 0.6, 0.5, 1], ['heli_h_mi24_h1', 26.15, 29.31, 50, 1, 0.54, 1.6], ['pvo_strela1_fl', 16.58, 73.04, 46, 0.62, 0, 0.2]] },
  { dim: 0.5, s: [['air_e_f111_h3', 56.02, 14.14, 15, 0.6, 0.5, 1], ['air_e_tornado_belly', 26.15, 29.31, 50, 1, 0.54, 1.6], ['pvo_zu23_fr', 16.58, 73.04, 46, 0.62, 0, 0.2]] },
  { dim: 0.5, s: [['air_e_buccaneer_h1', 56.02, 14.14, 15, 0.6, 0.5, 1], ['air_e_mig31__dragon_rear', 26.15, 29.31, 50, 1, 0.54, 1.6], ['pvo_pac3_fr', 16.58, 73.04, 46, 0.62, 0, 0.2]] },
  { dim: 0.5, s: [['air_e_buccaneer_h1', 56.02, 14.14, 15, 0.6, 0.5, 1], ['air_e_mig31__dragon_rear', 26.15, 29.31, 50, 1, 0.54, 1.6], ['pvo_pac3_fr', 16.58, 73.04, 46, 0.62, 0, 0.2]] },
];
const H169 = 9 / 16 * 932 / 430; // высота картинки 16:9 в % экрана на 1 % его ширины
const CSS = `
body.mmOn #menu { opacity: 0; pointer-events: none; transition: opacity .35s; }
#mmScr { position: fixed; inset: 0; z-index: 33; display: none; color: #e9e6dc; font-family: 'Golos Text', -apple-system, 'Segoe UI', sans-serif; }
#mmScr.on { display: block; }
#mmScr .dim { position: absolute; inset: 0; background: #0a0d08; }
#mmScr .box { position: absolute; left: 50%; top: 50%; width: min(100vw, calc(100vh * 932 / 430)); aspect-ratio: 932 / 430; transform: translate(-50%, -50%); container-type: inline-size; }
#mmScr .it { position: absolute; aspect-ratio: 16 / 9; background: center / contain no-repeat; pointer-events: none; }
#mmScr .ring { position: absolute; left: 81%; top: 43%; width: 21%; aspect-ratio: 1; transform: translate(-50%, -50%); }
#mmScr .ring::before { content: ""; position: absolute; inset: -46%; background: radial-gradient(closest-side, rgba(10,13,9,.86) 40%, rgba(10,13,9,0)); } /* под кольцом — тёмное пятно: живой фон меню бывает ярким */
#mmScr .ring svg { position: relative; width: 100%; height: 100%; overflow: visible; }
#mmScr .ring .arc { transform-origin: 50px 50px; animation: mmArc 2.2s linear infinite; }
@keyframes mmArc { from { transform: rotate(-90deg); } to { transform: rotate(270deg); } }
#mmScr .rt { position: absolute; inset: 0; display: grid; place-items: center; text-align: center; }
#mmScr .rt b { display: block; font: 500 5cqw/1 'Oswald', 'Arial Narrow', sans-serif; letter-spacing: .02em; font-variant-numeric: tabular-nums; }
#mmScr .rt span { display: block; margin-top: .5cqw; font-size: 1.2cqw; color: #9ba38f; }
#mmScr .info { position: absolute; left: 81%; top: 71%; transform: translateX(-50%); width: 26cqw; text-align: center; font-size: 1.35cqw; line-height: 1.35; color: #c9cebd; }
#mmScr .info b { font: 500 1.5cqw 'Oswald', 'Arial Narrow', sans-serif; color: #e8b04a; letter-spacing: .03em; font-variant-numeric: tabular-nums; }
#mmScr .mode { position: absolute; right: max(3%, var(--sa-r, 0px)); top: max(5%, var(--top, 0px)); text-align: right; font-size: 1.25cqw; color: #9ba38f; letter-spacing: .04em; }
#mmScr .mode b { font: 600 1.25cqw 'Oswald', 'Arial Narrow', sans-serif; color: #e9e6dc; letter-spacing: .06em; margin-right: .6cqw; }
#mmScr .cx { position: absolute; left: 50%; bottom: calc(4.5% + var(--sa-b, 0px)); transform: translateX(-50%); font: 600 1.55cqw 'Golos Text', sans-serif; letter-spacing: .04em; color: #e9e6dc;
  background: rgba(10,13,9,.78); border: .14cqw solid rgba(233,230,220,.45); padding: .75cqw 3.4cqw; cursor: pointer; min-height: 36px; }
#mmScr .cx:hover, #mmScr .cx:focus-visible { border-color: #e8b04a; color: #e8b04a; outline: none; }
@media (prefers-reduced-motion: reduce) { #mmScr .ring .arc { animation: none; } }`;

export function createMM(C, onCancel) {
  const { snd } = C, ver = '20261029b';
  const st = document.createElement('style'); st.textContent = CSS; if (document.head) document.head.appendChild(st); // (заглушка DOM стенда — без head/body)
  const el = document.createElement('div'); el.id = 'mmScr'; if (el.setAttribute) { el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', tr('Поиск боя')); }
  el.innerHTML = `<div class="dim"></div><div class="box"><div class="stage"></div>
    <div class="ring"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="none" stroke="rgba(233,230,220,.16)" stroke-width="1.1"/>
      <circle cx="50" cy="50" r="40.5" fill="none" stroke="rgba(233,230,220,.10)" stroke-width=".6" stroke-dasharray="1 3.2"/>
      <circle class="arc" cx="50" cy="50" r="46" fill="none" stroke="#e8b04a" stroke-width="1.7" stroke-linecap="round" stroke-dasharray="58 231"/></svg>
      <div class="rt"><div><b class="tm">0:00</b><span>${tr('поиск соперников')}</span></div></div></div>
    <div class="info"></div><div class="mode"></div><button class="cx">${tr('Отменить')}</button></div>`;
  if (document.body) document.body.appendChild(el);
  const $ = (s) => el.querySelector(s), stage = $('.stage'), tm = $('.tm'), info = $('.info'), mode = $('.mode');
  const RM = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let on = false, last = -1, t0 = 0, anims = [], pingT = 0, tick = 0, hideT = 0;
  $('.cx').onclick = () => { snd.cancelClick ? snd.cancelClick() : snd.click(); onCancel(); };
  const sceneOf = (L) => L.s.map(([f, x, y, w, b, h, d, fl], i) => `<div class="it" data-d="${d}" data-i="${i}" style="left:${x}%;top:${y}%;width:${w}%;background-image:url(airdef/ui/mm/${f}.webp?v=${ver});` +
    `transform:translate(-50%,-50%)${fl === 'f' ? ' scaleX(-1)' : ''};filter:brightness(${b}) saturate(${(1 - h * 0.35).toFixed(2)}) blur(${(h * 0.12).toFixed(3)}cqw)${h < 0.3 ? ' drop-shadow(0 1.6cqw 1.4cqw rgba(0,0,0,.55))' : ''}"></div>`).join('');
  const clock = () => { const s = Math.max(0, Math.floor((performance.now() - t0) / 1000)); tm.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  function show(o) { // o: { t0 — начало поиска (performance.now), mode — строка режима, info — строка под кольцом (HTML: <b> — цифры) }
    t0 = o.t0 || performance.now(); mode.innerHTML = `<b>${tr('ОНЛАЙН')}</b>${o.mode || ''}`; info.innerHTML = o.info || ''; clock();
    if (on) return;
    on = true; clearTimeout(hideT);
    let i = Math.floor(Math.random() * LAYOUTS.length); if (LAYOUTS.length > 1 && i === last) i = (i + 1) % LAYOUTS.length; last = i;
    const L = LAYOUTS[i]; stage.innerHTML = sceneOf(L); $('.dim').style.opacity = String(0.25 + L.dim * 0.6);
    el.classList.add('on'); document.body.classList.add('mmOn');
    if (!RM && el.animate) {
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, fill: 'both' });
      stage.querySelectorAll('.it').forEach((e, k) => { // техника выезжает слоями, потом слегка покачивается — у дальних меньше
        e.animate([{ opacity: 0, translate: '5cqw 0' }, { opacity: 1, translate: '0 0' }], { duration: 800, delay: 150 + k * 90, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
        const d = +e.dataset.d; if (d > 0) anims.push(e.animate([{ translate: '0 0' }, { translate: `${(k % 2 ? 0.6 : -0.7) * d}cqw ${-0.8 * d}cqw` }, { translate: '0 0' }], { duration: 4600 + k * 900, delay: 1000 - k * 700, iterations: Infinity, easing: 'ease-in-out' }));
      });
    }
    pingT = 0; tick = setInterval(() => { clock(); if ((pingT += 1) % 4 === 1 && snd.mmPing) snd.mmPing(); }, 1000); // первый пинг — через секунду, дальше раз в 4 с
  }
  function hide() {
    if (!on) return; on = false; clearInterval(tick); document.body.classList.remove('mmOn');
    const done = () => { el.classList.remove('on'); anims.forEach((a) => a.cancel()); anims = []; if (el.getAnimations) el.getAnimations().forEach((a) => a.cancel()); stage.innerHTML = ''; };
    if (!RM && el.animate) { el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }); hideT = setTimeout(done, 300); } else done();
  }
  return { show, hide, get on() { return on; } };
}
