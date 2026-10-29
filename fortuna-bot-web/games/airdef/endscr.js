// Экраны итога боя «Воздушного превосходства» (Mark 2026-10-25, макет endscr/tpl.html): «Разбор вылета» — для всех одиночных боёв
// (вылет самолёта и вертолёта, оборона, «Мульти-волна», операция из двух вылетов), «Табло команд» — онлайн «Вылет и оборона»,
// «Два раунда» — онлайн «Мульти-волна». Вход — C.showEnd (main.js): { title, reason, stats, note, win, again, events, dur, online }.
// Одиночный бой: 3D замирает (C.endFreeze), холст выцветает (CSS body.endCine), сверху и снизу — чёрные полосы, внизу — лента боя
// (C.blog: { t, c: 'g' | 'r' | 'y' | '', l } — события, их пишут air.js и defense.js через C.bev). Онлайн — табло поверх затемнённой игры;
// очки рейтинга и награда приходят позже (claimed / reward). Всё в единицах «u» — процент ширины экрана 16:9, вписанного по высоте.
import { tr, LANG } from './i18n.js?v=20261029b';
import { ico } from './icons.js?v=20261029b';
import { WIN_K } from './sim/online.js?v=20261029b';
import { activeAcc } from './account.js?v=20261029b';

const LOC = LANG === 'en' ? 'en-US' : 'ru-RU';
const fmt = (v) => Math.round(v).toLocaleString(LOC);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const RM = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const SLOTS = 7;

// «Nu» → calc(var(--u) * N); F(n) — размер шрифта не меньше 10 px (на телефоне 1u ≈ 7 px)
const U = (css) => css.replace(/(-?\d*\.?\d+)u\b/g, (m, n) => `calc(var(--u) * ${n})`);
const F = (n, min = 10) => `max(${min}px, ${n}u)`;
const CSS = U(`
#end .endv { position: absolute; inset: 0; container-type: size; --u: min(1vw, 1.7778vh); color: #e9e6dc; font-family: 'Golos Text', -apple-system, sans-serif; line-height: 1.35; }
@supports (width: 1cqw) { #end .endv { --u: min(1cqw, 1.7778cqh); } } /* iOS 15 и старше: единиц контейнера нет — окно целиком (vw / vh) */
#end.cine { background: none; } #end.cine.on { animation: none; }
#endView { position: absolute; inset: 0; overflow: hidden; }
/* пока открыт итог — интерфейс боя (HUD, кнопки, подсказки, чат, метки) не поверх него */
body.endOn #hudc, body.endOn #hud, body.endOn #mute, body.endOn #pause, body.endOn #exit, body.endOn #perf, body.endOn #hint, body.endOn #msg, body.endOn #warn, body.endOn #ask, body.endOn #touch, body.endOn #opHud,
body.endOn #netChat, body.endOn #plPanel, body.endOn #plBtn, body.endOn #netPlan, body.endOn #evBtn, body.endOn #evPanel, body.endOn #dtop, body.endOn #dside, body.endOn #wBar, body.endOn #mapNav, body.endOn #lsnPanel { display: none !important; }
#endView .num, #end .num { font-family: 'Oswald', 'Golos Text', sans-serif; font-variant-numeric: tabular-nums; } /* цифры итогов — Oswald, как заголовок (Mark 2026-10-27: моноширинный «выдавал ИИ»); tabular — счёт при отсчёте не дрожит */
#endView .ic { width: 1em; height: 1em; fill: currentColor; display: inline-block; vertical-align: -0.14em; flex: none; }
#endBtns { position: absolute; display: flex; gap: 1.2u; z-index: 3; }
#endBtns .btn { display: block; width: auto; margin: 0; border-radius: 0; box-shadow: none; padding: 1.1u 2.4u; font-family: 'Oswald', 'Arial Narrow', sans-serif; font-weight: 500; font-size: ${F(1.7, 13)}; letter-spacing: .02em; line-height: 1.2; white-space: nowrap; }
#endBtns .btn:not(.alt) { background: #e8b04a; color: #17190f; } #endBtns .btn.alt { background: rgba(16, 20, 15, .88); color: #e9e6dc; border: 1px solid #4b5640; }
#endBtns .btn:focus-visible { outline: 2px solid #f3c96f; outline-offset: 2px; }
/* ── разбор: одиночные бои ── */
body.endCine #c, body.endCine #tmap, body.endCine #map { transform-origin: 60% 50%; animation: endFade 6s ease-out both; }
@keyframes endFade { from { filter: saturate(1) brightness(1); transform: scale(1); } to { filter: saturate(.55) brightness(.62); transform: scale(1.07); } }
@media (prefers-reduced-motion: reduce) { body.endCine #c, body.endCine #tmap, body.endCine #map { animation: none; filter: saturate(.55) brightness(.62); transform: scale(1.07); } }
.cine .bar { position: absolute; left: 0; right: 0; height: 9u; background: #070806; } .cine .bar.t { top: 0; } .cine .bar.b { bottom: 0; }
.cine .band { position: absolute; left: 0; top: 13u; max-width: 78%; padding: 1.4u 6u 1.4u calc(var(--sa-l, 0px) + 5u); font-family: 'Oswald', 'Arial Narrow', sans-serif; font-weight: 600; font-size: 4.4u; line-height: 1; color: #15170f; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; clip-path: polygon(0 0, 100% 0, 95% 100%, 0 100%); background: #8a9378; }
#end.win .band { background: #e8b04a; } #end.lose .band { background: #c4472f; color: #fff4ec; }
.cine .sub { position: absolute; left: calc(var(--sa-l, 0px) + 5u); top: 21.6u; max-width: 46u; text-shadow: 0 .1u .4u #000; }
.cine .why { font-size: ${F(1.7, 11.5)}; color: #f1ede2; } .cine .nt { margin-top: .8u; font-size: ${F(1.15, 10)}; color: #cfd3c3; line-height: 1.4; }
.cine .nt .pgRes { margin: .4u 0 0; padding: 0; background: none; border: 0; font-size: inherit; } .cine .nt .pgSum { display: none; } .cine .nt .pgLines { color: #cfd3c3; }
.cine .plates { position: absolute; right: calc(var(--sa-r, 0px) + 4u); top: 12.5u; display: grid; gap: .8u; width: 23u; }
.cine .plate { background: rgba(10, 12, 9, .78); border-left: .35u solid #e8b04a; padding: .8u 1.2u; display: flex; justify-content: space-between; align-items: center; gap: 1u; } /* по центру: подпись в две строки уезжала вниз (baseline) */
#end.lose .plate { border-left-color: #c4472f; } #end.neu .plate { border-left-color: #8a9378; }
.cine .plate b { font-family: 'Oswald', 'Golos Text', sans-serif; font-variant-numeric: tabular-nums; font-weight: 600; font-size: ${F(2.6, 15)}; color: #fff; white-space: nowrap; } .cine .plate span { font-size: ${F(1.3, 10)}; color: #cfd3c3; text-align: right; }
.cine .rwd { position: absolute; right: calc(var(--sa-r, 0px) + 4u); top: 2.6u; display: none; gap: 2u; font-family: 'Oswald', 'Golos Text', sans-serif; font-variant-numeric: tabular-nums; font-weight: 600; font-size: ${F(1.8, 13)}; color: #fff; } .cine .rwd.on { display: flex; }
.cine .rwd span { display: inline-flex; gap: .5u; align-items: center; } .cine .rwd .xp { color: #9fd3ff; }
.cine .tl { position: absolute; left: calc(var(--sa-l, 0px) + 5u); right: calc(var(--sa-r, 0px) + 5u); bottom: 3.4u; height: 3u; }
.cine .tl .ln { position: absolute; left: 0; right: 0; top: 50%; height: .2u; background: #4d5546; } .cine .tl .run { position: absolute; left: 0; top: 50%; height: .2u; background: #f3c96f; width: 0; }
.cine .tl .ev { position: absolute; top: 50%; width: .9u; height: .9u; margin: -.45u 0 0 -.45u; background: #cfd3c3; transform: rotate(45deg); opacity: .25; }
.cine .tl .ev.g { background: #6fcf7f; } .cine .tl .ev.r { background: #e2574c; } .cine .tl .ev.y { background: #f3c96f; } .cine .tl .ev.on { opacity: 1; }
.cine .tl .lb { position: absolute; bottom: 2.2u; transform: translateX(-50%); font-size: ${F(1.05, 10)}; color: #cfd3c3; white-space: nowrap; opacity: 0; } .cine .tl .lb.dn { bottom: auto; top: 2.2u; } .cine .tl .lb.on { opacity: 1; }
.cine .tl .t0, .cine .tl .t1 { position: absolute; top: 50%; transform: translateY(-50%); font-family: 'Oswald', 'Golos Text', sans-serif; font-variant-numeric: tabular-nums; font-size: ${F(1, 9)}; color: #8f9884; } .cine .tl .t0 { right: 100%; margin-right: .8u; } .cine .tl .t1 { left: 100%; margin-left: .8u; }
#end.cine #endBtns { right: calc(var(--sa-r, 0px) + 4u); bottom: 11.4u; }
/* ── онлайн: затемнённая игра, табло ── */
#end.ol, #end.mw { background: rgba(8, 10, 7, .72); }
.verdict { position: absolute; left: 0; right: 0; top: 4.2u; text-align: center; font-family: 'Oswald', 'Arial Narrow', sans-serif; font-weight: 600; font-size: 5.2u; line-height: 1; color: #e9e6dc; }
#end.win .verdict { color: #f3c96f; } #end.lose .verdict { color: #ff8b78; }
#end.ol #endBtns, #end.mw #endBtns { right: calc(var(--sa-r, 0px) + 4u); top: 4.4u; }
.meter { position: absolute; left: 12u; right: 12u; top: 12.4u; height: 2.2u; background: #12150f; border: .15u solid #3b4334; }
.meter .fill { position: absolute; left: 0; top: 0; bottom: 0; width: 0; background: linear-gradient(90deg, #5a8fd6, #8fb6ec); } .meter .th { position: absolute; top: -1u; bottom: -1u; width: .25u; margin-left: -.12u; background: #f3c96f; }
.meter .cap { position: absolute; top: 2.9u; font-size: ${F(1.25, 10)}; color: #cfd3c3; white-space: nowrap; } .meter .cap.c { transform: translateX(-50%); }
.meter .val { position: absolute; left: 100%; margin-left: 1.4u; top: -.3u; font-family: 'Oswald', 'Golos Text', sans-serif; font-variant-numeric: tabular-nums; font-weight: 600; font-size: ${F(2, 13)}; white-space: nowrap; }
.teams { position: absolute; left: calc(var(--sa-l, 0px) + 4u); right: calc(var(--sa-r, 0px) + 4u); top: 19.5u; bottom: 11.4u; display: grid; grid-template-columns: 1fr 1fr; gap: 3u; overflow: hidden; }
.mw .teams { top: 24.2u; }
.team { min-height: 0; overflow-y: auto; } .team h4 { margin: 0 0 .8u; font-family: 'Oswald', 'Arial Narrow', sans-serif; font-weight: 500; font-size: ${F(2, 14)}; display: flex; justify-content: space-between; align-items: baseline; padding-bottom: .5u; border-bottom: .2u solid; }
.team.a h4, .team.w h4 { color: #8fb6ec; } .team.p h4 { color: #f3a46a; } .team.e h4 { color: #f08a7c; }
.team h4 i { display: none; font: normal 600 ${F(1.25, 10)} 'Golos Text', sans-serif; color: #15170f; background: #f3c96f; padding: .2u .8u; } .team.won h4 i { display: inline; }
.pr { display: grid; grid-template-columns: 1fr 12u 8u; gap: 1u; align-items: baseline; font-size: ${F(1.45, 11)}; padding: .55u .6u; border-bottom: .1u solid rgba(255, 255, 255, .07); }
.pr.pr3 { grid-template-columns: 1fr 10.5u 10u 7.5u; } .pr b { font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .pr .num { text-align: right; } .pr .bot { color: #8f9884; font-weight: 400; font-size: .85em; }
.pr.hd { color: #8f9884; font-size: ${F(1.15, 10)}; border-bottom: 0; padding-top: 0; padding-bottom: .2u; } .pr.hd span { text-align: right; white-space: nowrap; } .pr.me { background: rgba(232, 176, 74, .2); }
.rate { position: absolute; left: calc(var(--sa-l, 0px) + 4u); right: calc(var(--sa-r, 0px) + 4u); bottom: 3u; display: flex; align-items: center; gap: 2u; padding: 1u 1.4u; background: rgba(10, 12, 9, .85); border: .15u solid #4b5640; opacity: 0; }
.rate.on { opacity: 1; } .rate .rp { font-family: 'Oswald', 'Golos Text', sans-serif; font-variant-numeric: tabular-nums; font-weight: 600; font-size: ${F(2.6, 16)}; color: #f3c96f; display: inline-flex; gap: .7u; align-items: center; white-space: nowrap; }
.rate .rp.off { color: #8f9884; } .rate .txt { font-size: ${F(1.35, 11)}; color: #cfd3c3; min-width: 0; } .rate .rw { display: inline-flex; gap: 1.4u; font-family: 'Oswald', 'Golos Text', sans-serif; font-variant-numeric: tabular-nums; font-weight: 600; font-size: ${F(1.5, 12)}; white-space: nowrap; } .rate .rw .xp { color: #9fd3ff; }
.rate .rw span { display: inline-flex; gap: .4u; align-items: center; }
.rate .slots { display: flex; gap: .35u; margin-left: auto; } .rate .slots i { width: 2.4u; height: .8u; background: #3a4433; } .rate .slots i.on { background: #e8b04a; } .rate .slots i.new { background: #f3c96f; box-shadow: 0 0 .8u #f3c96f; }
.rounds { position: absolute; left: calc(var(--sa-l, 0px) + 6u); right: calc(var(--sa-r, 0px) + 6u); top: 11.6u; display: grid; gap: 1.2u; }
.rnd { display: grid; grid-template-columns: 19u 1fr 8u; gap: 1.6u; align-items: center; } .rnd .who { font-family: 'Oswald', 'Arial Narrow', sans-serif; font-weight: 500; font-size: ${F(1.8, 13)}; white-space: nowrap; } .rnd .who small { display: block; font: 400 ${F(1.2, 10)} 'Golos Text', sans-serif; color: #a9b09b; }
.rnd .trk { height: 2.4u; background: #12150f; border: .15u solid #3b4334; position: relative; } .rnd .trk .f { position: absolute; left: 0; top: 0; bottom: 0; width: 0; }
.rnd.e .trk .f { background: linear-gradient(90deg, #8f2f24, #d65a4a); } .rnd.w .trk .f { background: linear-gradient(90deg, #2a4d82, #5a8fd6); }
.rnd .pc { font-family: 'Oswald', 'Golos Text', sans-serif; font-variant-numeric: tabular-nums; font-weight: 600; font-size: ${F(2.4, 14)}; text-align: right; white-space: nowrap; }
.mw .verdict { top: 4.4u; }
`);

// ── разбор событий боя для ленты: не больше 10 подписей, важные — первыми, близкие не налезают ──
const PRI = (e, i, n) => (i === 0 || i === n - 1 ? 5 : e.c === 'r' ? 4 : e.c === 'g' ? 3 : e.c === 'y' ? 2 : 1);
export function layoutTimeline(events, dur, widthPx, fontPx) {
  const evs = (events || []).filter((e) => e && e.l && isFinite(e.t)).map((e) => ({ x: clamp(e.t / dur, 0, 1), c: e.c || '', l: String(e.l).slice(0, 24) })).sort((a, b) => a.x - b.x);
  const n = evs.length; evs.forEach((e, i) => { e.p = PRI(e, i, n); e.w = (e.l.length * fontPx * 0.56 + fontPx) / widthPx; e.xl = clamp(e.x, e.w / 2, 1 - e.w / 2); });
  const ok = (idx) => { const s = idx.slice().sort((a, b) => evs[a].xl - evs[b].xl); for (let k = 0; k + 2 < s.length; k++) { const a = evs[s[k]], b = evs[s[k + 2]]; if (b.xl - b.w / 2 < a.xl + a.w / 2 + 0.006) return false; } return true; };
  const chosen = [];
  for (const i of evs.map((_, i) => i).sort((a, b) => evs[b].p - evs[a].p || a - b)) { if (chosen.length >= 10) break; if (ok([...chosen, i])) chosen.push(i); }
  chosen.sort((a, b) => evs[a].xl - evs[b].xl).forEach((i, r) => { evs[i].lab = true; evs[i].dn = r % 2 === 1; });
  return evs.length > 48 ? evs.filter((e) => e.lab || e.p >= 3).slice(0, 48) : evs;
}

const Q = (root, k) => root.querySelector(`[data-k="${k}"]`);
const numParts = (v) => { const s = String(v).replace(/[\s ]/g, ''), m = /^(\d+)(\D.*)?$/.exec(s); return m ? [+m[1], m[2] || ''] : null; };

export function createEndScreen(C) {
  const $ = (id) => document.getElementById(id);
  const root = $('end'), view = $('endView');
  const style = document.createElement('style'); style.textContent = CSS; if (document.head) document.head.appendChild(style); // (заглушка DOM стенда — без head/body)
  const E = { gen: 0, timers: [], anims: [], mode: '', on: false, reward: null, claim: null, rateOn: false };

  const later = (ms, f) => { const g = E.gen; E.timers.push(setTimeout(() => { if (g === E.gen) f(); }, RM() ? 0 : ms)); };
  const anim = (el, kf, o) => { if (RM() || !el || !el.animate) return null; const a = el.animate(kf, { fill: 'both', easing: 'cubic-bezier(.2,.8,.2,1)', ...o }); E.anims.push(a); return a; };
  // набор числа за ms (таймером, не rAF: у стендов один общий слот кадра)
  const count = (el, to, ms, pre = '', post = '') => {
    if (!el) return; const g = E.gen;
    if (RM() || ms <= 0) { el.textContent = pre + fmt(to) + post; return; }
    const t0 = performance.now(); const step = () => { if (g !== E.gen) return; const k = Math.min(1, (performance.now() - t0) / ms), e = 1 - Math.pow(1 - k, 3); el.textContent = pre + fmt(to * e) + post; if (k < 1) E.timers.push(setTimeout(step, 33)); }; step();
  };
  const all = (sel) => (view.querySelectorAll ? Array.from(view.querySelectorAll(sel)) : []);

  function reset() {
    E.gen++; E.timers.forEach(clearTimeout); E.timers = []; E.anims.forEach((a) => { try { a.cancel(); } catch (_) { /* уже */ } }); E.anims = [];
    E.on = false; E.reward = null; E.claim = null; E.rateOn = false; E.pcFor = null; C.endFreeze = false; document.body.classList.remove('endCine', 'endOn');
  }

  // ═════════════ «Разбор вылета» ═════════════
  function cineHtml(o) {
    const dur = Math.max(1, o.dur || 0), has = (o.events || []).length > 0 && o.dur > 0;
    const W = (typeof innerWidth === 'number' ? innerWidth : 1280), H = (typeof innerHeight === 'number' ? innerHeight : 720), u = Math.min(W / 100, H * 1.7778 / 100);
    const evs = has ? layoutTimeline(o.events, dur, Math.max(100, W - 10 * u), Math.max(10, 1.05 * u)) : [];
    const plates = (o.stats || []).map(([v, l]) => { const np = numParts(v); return `<div class="plate"><b${np ? ` data-n="${np[0]}" data-post="${esc(np[1])}"` : ''}>${esc(v)}</b><span>${esc(l)}</span></div>`; }).join('');
    return `<div class="bar t"></div><div class="bar b"></div>
      <div class="rwd"><span class="xp">${ico('xp')}<b data-c="xp">0</b></span><span>${ico('silver')}<b data-c="sv">0</b></span></div>
      <div class="band" data-k="band">${esc(o.title)}</div>
      <div class="sub"><div class="why" data-k="why">${esc(o.reason || '')}</div><div class="nt" id="endNote">${o.note || ''}</div></div>
      <div class="plates" data-k="plates">${plates}</div>
      ${has ? `<div class="tl"><div class="ln"></div><div class="run"></div><span class="t0">0:00</span><span class="t1">${mmss(dur)}</span>${evs.map((e) => `<span class="ev ${e.c}" style="left:${(e.x * 100).toFixed(2)}%"></span>${e.lab ? `<span class="lb${e.dn ? ' dn' : ''}" style="left:${(e.xl * 100).toFixed(2)}%">${esc(e.l)}</span>` : ''}`).join('')}</div>` : ''}`;
  }
  function playCine() {
    document.body.classList.add('endCine'); C.endFreeze = true; if (C.snd && C.snd.silence) C.snd.silence();
    if (C.say) C.say(''); if (C.hint) C.hint(''); for (const id of ['ask', 'warn']) { const e = $(id); if (e) e.style.display = 'none'; } // подсказки боя — не поверх итога
    const bt = (c) => view.querySelector(c);
    anim(bt('.bar.t'), [{ transform: 'translateY(-100%)' }, { transform: 'none' }], { duration: 500, delay: 100 });
    anim(bt('.bar.b'), [{ transform: 'translateY(100%)' }, { transform: 'none' }], { duration: 500, delay: 100 });
    anim(bt('.band'), [{ clipPath: 'polygon(0 0, 0 0, 0 100%, 0 100%)' }, { clipPath: 'polygon(0 0, 100% 0, 95% 100%, 0 100%)' }], { duration: 420, delay: 600, easing: 'cubic-bezier(.7,0,.2,1)' });
    anim(bt('.sub'), [{ opacity: 0, transform: `translateX(${-2}vmin)` }, { opacity: 1, transform: 'none' }], { duration: 400, delay: 950 });
    all('.plate').forEach((p, i) => {
      anim(p, [{ opacity: 0, transform: 'translateX(3vmin)' }, { opacity: 1, transform: 'none' }], { duration: 320, delay: 1100 + i * 140 });
      const b = p.querySelector('b'); if (b && b.dataset && b.dataset.n != null) later(1100 + i * 140, () => count(b, +b.dataset.n, 1500, '', b.dataset.post || ''));
    });
    const tl = bt('.tl');
    if (tl) {
      const T = 2600; anim(tl.querySelector('.run'), [{ width: '0%' }, { width: '100%' }], { duration: T, delay: 1200, easing: 'linear' });
      const evs = Array.from(tl.querySelectorAll('.ev')), lbs = Array.from(tl.querySelectorAll('.lb'));
      const posOf = (el) => parseFloat(el.style.left) / 100 || 0;
      evs.forEach((e) => later(1200 + T * posOf(e), () => { e.classList.add('on'); anim(e, [{ transform: 'rotate(45deg) scale(2.2)' }, { transform: 'rotate(45deg) scale(1)' }], { duration: 260 }); }));
      lbs.forEach((l) => later(1200 + T * clamp(posOf(l), 0, 1) - 100, () => l.classList.add('on')));
      anim($('endBtns'), [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 1300 + T });
    } else anim($('endBtns'), [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 1500 });
    if (E.reward) later(1400, paintReward);
  }

  // ═════════════ Онлайн: «Табло команд» и «Два раунда» ═════════════
  const rateHtml = () => (activeAcc() ? `<div class="rate" data-k="rate"><span class="rp">${ico('rating')}<span class="num" data-k="rp">+0</span></span><span class="txt" data-k="rtxt">${tr('Считаем рейтинг…')}</span><span class="rw" data-k="rw"></span><span class="slots" data-k="slots"></span></div>` : '');
  const row = (r, cols) => `<div class="pr${cols.length === 3 ? ' pr3' : ''}${r.me ? ' me' : ''}"><b>${esc(r.name)}${r.bot ? ` <span class="bot">${tr('бот')}</span>` : ''}</b>${cols.map((c) => `<span class="num">${esc(c(r))}</span>`).join('')}</div>`;
  const hd = (...h) => `<div class="pr${h.length === 3 ? ' pr3' : ''} hd"><span></span>${h.map((x) => `<span>${x}</span>`).join('')}</div>`;
  function olHtml(b) {
    return `<div class="verdict" data-k="verdict">${esc(b.title)}</div>
      <div class="meter"><div class="fill"></div><div class="th" style="left:${b.wk}%"></div><span class="cap">${tr('уничтожено ценности целей')}</span><span class="cap c" style="left:${b.wk}%">${tr('порог победы авиации — {0} %', [b.wk])}</span><span class="val num" data-k="pct">0 %</span></div>
      <div class="teams"><div class="team a" data-team="air"><h4><span>${tr('Авиация')}</span><i>${tr('победа')}</i></h4>${hd(tr('ЗРК уничтожено'), tr('очки'))}${b.air.map((r) => row(r, [(x) => x.k, (x) => fmt(x.s)])).join('')}</div>
      <div class="team p" data-team="pvo"><h4><span>${tr('ПВО')}</span><i>${tr('победа')}</i></h4>${hd(tr('сбито'), tr('очки'))}${b.pvo.map((r) => row(r, [(x) => x.k, (x) => fmt(x.s)])).join('')}</div></div>${rateHtml()}`;
  }
  function mwHtml(b) {
    const rnd = (s) => `<div class="rnd ${s.side}"><div class="who">${s.side === 'e' ? tr('Волна Востока') : tr('Волна Запада')}<small>${s.side === 'e' ? tr('раунд {0} · по ПВО Запада', [s.n]) : tr('раунд {0} · по ПВО Востока', [s.n])}</small></div><div class="trk"><div class="f"></div></div><div class="pc num" data-k="pc${s.side}">0 %</div></div>`;
    const cols = [(x) => x.icp ?? '—', (x) => (x.dmg == null ? '—' : x.dmg + ' %'), (x) => fmt(x.s)];
    const team = (k, cls, name, rows) => `<div class="team ${cls}" data-team="${k}"><h4><span>${name}</span><i>${tr('победа')}</i></h4>${hd(tr('перехвачено'), tr('разрушено'), tr('очки'))}${rows.map((r) => row(r, cols)).join('')}</div>`;
    return `<div class="verdict" data-k="verdict">${esc(b.title)}</div><div class="rounds">${b.rounds.map(rnd).join('')}</div>
      <div class="teams">${team('east', 'e', tr('Восток'), b.east)}${team('west', 'w', tr('Запад'), b.west)}</div>${rateHtml()}`;
  }
  function playOnline(b) {
    const bt = (c) => view.querySelector(c);
    if (b.kind === 'ol') {
      const fill = bt('.fill'); anim(fill, [{ width: '0%' }, { width: Math.min(100, b.pct) + '%' }], { duration: 1500, delay: 400, easing: 'cubic-bezier(.3,.6,.2,1)' });
      later(400, () => count(Q(view, 'pct'), b.pct, 1500, '', ' %'));
      anim(Q(view, 'verdict'), [{ opacity: 0, transform: 'scale(.9)' }, { opacity: 1, transform: 'none' }], { duration: 500, delay: 1950 });
      later(1950, () => { const t = view.querySelector(`[data-team="${b.won}"]`); if (t) t.classList.add('won'); });
      all('.pr:not(.hd)').forEach((r, i) => anim(r, [{ opacity: 0, transform: `translateX(${i < b.air.length ? -3 : 3}vmin)` }, { opacity: 1, transform: 'none' }], { duration: 300, delay: 2300 + (i % 3) * 120 }));
      E.rateAt = 2900;
    } else {
      const [f1, f2] = all('.trk .f'), [p1, p2] = b.rounds;
      anim(f1, [{ width: '0%' }, { width: Math.min(100, p1.pct) + '%' }], { duration: 1300, delay: 300 }); later(300, () => count(Q(view, 'pc' + p1.side), p1.pct, 1300, '', ' %'));
      anim(f2, [{ width: '0%' }, { width: Math.min(100, p2.pct) + '%' }], { duration: 1300, delay: 1800 }); later(1800, () => count(Q(view, 'pc' + p2.side), p2.pct, 1300, '', ' %'));
      anim(Q(view, 'verdict'), [{ opacity: 0, transform: 'translateY(-2vmin)' }, { opacity: 1, transform: 'none' }], { duration: 450, delay: 3250 });
      later(3250, () => { const t = b.won && view.querySelector(`[data-team="${b.won}"]`); if (t) t.classList.add('won'); });
      all('.pr:not(.hd)').forEach((r, i) => anim(r, [{ opacity: 0, transform: `translateX(${i < b.east.length ? -3 : 3}vmin)` }, { opacity: 1, transform: 'none' }], { duration: 300, delay: 3500 + (i % 2) * 120 }));
      E.rateAt = 3900;
    }
    const rt = bt('.rate'); if (rt) { anim(rt, [{ opacity: 0, transform: 'translateY(2vmin)' }, { opacity: 1, transform: 'none' }], { duration: 350, delay: E.rateAt }); }
    later(E.rateAt, () => { E.rateOn = true; if (rt) rt.classList.add('on'); applyClaim(); paintReward(); });
    anim($('endBtns'), [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 600 });
  }

  // ═════════════ Награда и рейтинг (приходят после показа) ═════════════
  function paintReward() {
    const d = E.reward; if (!d || !d.xp || !E.on) return;
    if (E.mode === 'cine') { const w = view.querySelector('.rwd'); if (!w || w.classList.contains('on')) return; w.classList.add('on'); anim(w, [{ opacity: 0, transform: 'translateY(-1vmin)' }, { opacity: 1, transform: 'none' }], { duration: 300 }); count(w.querySelector('[data-c="xp"]'), d.xp, 1500, '+'); count(w.querySelector('[data-c="sv"]'), d.silver || 0, 1500, '+'); return; }
    const rw = Q(view, 'rw'); if (!rw || rw.dataset.done) return; rw.dataset.done = '1';
    rw.innerHTML = `<span class="xp">${ico('xp')}<b data-c="xp">0</b></span><span>${ico('silver')}<b data-c="sv">0</b></span>`;
    count(rw.querySelector('[data-c="xp"]'), d.xp, 1000, '+'); count(rw.querySelector('[data-c="sv"]'), d.silver || 0, 1000, '+');
  }
  // claim: { rating: { points, parts }, acc, note, board: { place, prev, n, counted } | null, off — межсезонье (рейтинга нет) }
  function applyClaim() {
    const c = E.claim, rt = view.querySelector('.rate'); if (!c || !rt || !E.rateOn) return;
    const rp = Q(view, 'rp'), txt = Q(view, 'rtxt'), slots = Q(view, 'slots'), r = c.rating, line = [];
    if (r && typeof r.points === 'number') {
      const idle = !!(r.parts && r.parts.idle);
      const once = E.pcFor !== r; E.pcFor = r;
      if (c.acc && c.acc.kind === 'airdef') { if (once) count(rp, r.points, 900, idle ? '' : '+'); if (idle) line.push(tr('без действий в бою')); }
      else { if (once) count(rp, r.points, 900); rp.parentNode.classList.add('off'); line.push(tr('очки засчитаются, когда перенесёте прогресс в аккаунт игры')); }
    } else if (rp && rp.parentNode) rp.parentNode.style.display = 'none';
    if (c.off) line.push(tr('межсезонье — бой не идёт в рейтинг'));
    const b = c.board;
    if (b) {
      if (b.place) line.push(b.prev && b.prev !== b.place ? tr('место в сезоне {0} → {1}', [b.prev, b.place]) : tr('место в сезоне {0}', [b.place]));
      line.push(b.counted === false ? tr('бой не вошёл в засчитанные') : tr('засчитано {0} из {1}', [b.n, SLOTS]));
      if (slots) { slots.innerHTML = Array.from({ length: SLOTS }, (_, i) => `<i class="${i < b.n ? 'on' : ''}"></i>`).join(''); if (b.counted !== false && b.n > 0) later(900, () => { const s = slots.querySelectorAll('i')[b.n - 1]; if (s) { s.classList.add('new'); anim(s, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 300 }); } }); }
    }
    if (txt) txt.innerHTML = [...(c.note ? [c.note] : []), ...line.map(esc)].join(' · '); // c.note — готовый HTML (в награде бывает значок ключа), остальное — текст
  }

  // ═════════════ Вход ═════════════
  const api = {
    // o: { title, reason, stats, note, win, events, dur, online: { kind: 'ol' | 'mw', ... } }
    show(o) {
      reset();
      const kind = o.online ? o.online.kind : 'cine';
      E.mode = kind; const win = o.online ? o.online.win : o.win;
      root.classList.remove('cine', 'ol', 'mw', 'win', 'lose', 'neu'); root.classList.add(kind, win === true ? 'win' : win === false ? 'lose' : 'neu');
      view.innerHTML = kind === 'ol' ? olHtml(o.online) : kind === 'mw' ? mwHtml(o.online) : cineHtml(o);
      const g = E.gen;
      setTimeout(() => { // через 0,9 с — дать доиграть взрыв потерянной машины
        if (g !== E.gen) return; // за это время вышли в меню или начали новый бой
        root.classList.add('on'); document.body.classList.remove('flying'); document.body.classList.add('endOn'); E.on = true;
        if (kind === 'cine') playCine(); else playOnline(o.online);
        paintReward();
      }, 900);
    },
    // награда прокачки: { xp, silver } (progress-net.js: одиночный бой; online.js: d.progress)
    reward(d) { if (!d || !d.xp) return; E.reward = d; paintReward(); },
    // итог онлайн-боя от airdef-claim: { rating, acc, note, board }
    claimed(c) { E.claim = c; applyClaim(); },
    cine: () => E.mode === 'cine' && E.on,
    reset,
    mock: (name) => mock(name),
  };

  // ═════════════ Заглушка ?endmock=solo-win | solo-lose | ol-win | ol-lose | mw-win | mw-lose ═════════════
  function mock(name) {
    const [kind, res] = String(name).split('-'), win = res !== 'lose';
    C.setup.game = 'air'; C.start('air'); // фон — настоящий вылет
    const nm = (p) => p.name;
    setTimeout(() => {
      C.ended = true; $('againBtn').textContent = kind === 'solo' ? tr('Ещё раз') : tr('В комнату');
      if (kind === 'solo') {
        const ev = win ? [[0, '', tr('взлёт')], [133, 'r', tr('пуск ЗУР по вам')], [153, 'y', tr('ловушки')], [221, 'g', tr('цель 1')], [257, 'g', tr('цели 2 и 3')], [289, 'g', tr('«Шилка» уничтожена')], [402, '', tr('посадка')]]
          : [[0, '', tr('взлёт')], [77, 'g', tr('цель 1')], [119, 'r', tr('пуск ПЗРК')], [127, 'y', tr('ловушки поздно')], [134, 'r', tr('сбит')]];
        api.show({ title: win ? tr('Задание выполнено') : tr('Самолёт потерян'), reason: win ? tr('Торфяные карьеры разбиты, «Шилка» у дамбы подавлена. Вертолёт вернулся на площадку.') : tr('Попадание ПЗРК «Игла» после пуска по второй цели.'),
          stats: win ? [['3/3', tr('целей уничтожено')], ['2', tr('комплексов ПВО')], ['4 820', tr('очков')], [tr('Реализм'), tr('эпоха III')]] : [['1/3', tr('целей уничтожено')], ['0', tr('комплексов ПВО')], ['1 150', tr('очков')]],
          note: win ? tr('Задание выполнено.') : '', win, events: ev.map(([t, c, l]) => ({ t, c, l })), dur: win ? 402 : 134 });
        setTimeout(() => api.reward(win ? { xp: 1240, silver: 620 } : { xp: 310, silver: 150 }), 2200);
        return;
      }
      const P = (id, name, team, bot, kills, score, extra) => ({ id, name, team, bot, kills, deaths: 0, score, ...extra });
      const me = { id: 'me', team: kind === 'ol' ? 'air' : 'east' };
      if (kind === 'ol') {
        const m = { winner: win ? 'air' : 'pvo', valueK: win ? 0.84 : 0.52, players: win ? [P('me', 'xFORTUNAx', 'air', false, 2, 1840), P('a2', 'Беркут-7', 'air', true, 1, 1120), P('a3', 'Орлан', 'air', false, 0, 640), P('p1', 'SkyKeeper', 'pvo', false, 4, 1300), P('p2', 'Гранит', 'pvo', true, 2, 860), P('p3', 'Волхов', 'pvo', false, 1, 540)]
          : [P('me', 'xFORTUNAx', 'air', false, 1, 920), P('a2', 'Беркут-7', 'air', true, 0, 410), P('a3', 'Орлан', 'air', false, 0, 300), P('p1', 'SkyKeeper', 'pvo', false, 6, 2100), P('p2', 'Гранит', 'pvo', true, 3, 1240), P('p3', 'Волхов', 'pvo', false, 2, 900)] };
        api.show({ title: '', win, online: boardOl(m, me, nm) });
      } else {
        const m = { winner: win ? 'east' : 'west', scores: { east: win ? 580 : 360, west: win ? 410 : 520 }, v0: 1000, first: 'east', players: win ? [P('me', 'xFORTUNAx', 'east', false, 9, 2840, { icp: 9, samk: 3, dmg: 31 }), P('e2', 'Гранит', 'east', true, 6, 1900, { icp: 6, samk: 2, dmg: 27 }), P('w1', 'SkyKeeper', 'west', false, 7, 2210, { icp: 7, samk: 1, dmg: 22 }), P('w2', 'Tanker_Alpha', 'west', false, 5, 1760, { icp: 5, samk: 0, dmg: 19 })]
          : [P('me', 'xFORTUNAx', 'east', false, 4, 1420, { icp: 4, samk: 1, dmg: 20 }), P('e2', 'Гранит', 'east', true, 2, 980, { icp: 2, samk: 0, dmg: 16 }), P('w1', 'SkyKeeper', 'west', false, 11, 2650, { icp: 11, samk: 2, dmg: 29 }), P('w2', 'Tanker_Alpha', 'west', false, 8, 2010, { icp: 8, samk: 1, dmg: 23 })] };
        api.show({ title: '', win, online: boardMw(m, me, nm) });
      }
      setTimeout(() => {
        api.claimed({ rating: { points: win ? 882 : 236, parts: {} }, acc: { kind: 'airdef' }, note: win ? tr('Награда: {0}', [`${tr('+{0} деталей', [12])}, +1 ${ico('key', 'ii')}`]) : tr('Результат засчитан'), board: win ? { place: 31, prev: 37, n: 6, counted: true } : { place: 37, prev: 37, n: 5, counted: false } });
        api.reward(win ? { xp: 1240, silver: 620 } : { xp: 310, silver: 150 });
      }, 1200);
    }, 2500);
  }
  return api;
}

// ── данные табло из сообщения сервера 'end' (online.js) ──
// «Вылет и оборона»: m = { winner: 'air' | 'pvo', valueK, players: [{ id, name, team, bot, kills, score }] }; me — свой игрок; nm — как показать ник
export function boardOl(m, me, nm = (p) => p.name) {
  const mk = (p) => ({ name: nm(p), bot: !!p.bot, k: p.kills || 0, s: Math.round(p.score || 0), me: !!(me && p.id === me.id) }), by = (t) => m.players.filter((p) => p.team === t).sort((a, b) => (b.score || 0) - (a.score || 0)).map(mk);
  const win = me ? m.winner === me.team : null;
  return { kind: 'ol', win, title: win === true ? tr('Победа') : win === false ? tr('Поражение') : m.winner === 'air' ? tr('Победа авиации') : tr('Победа ПВО'), pct: Math.round((m.valueK || 0) * 100), wk: Math.round(WIN_K * 100), won: m.winner, air: by('air'), pvo: by('pvo') };
}
// «Мульти-волна»: m = { winner: 'east' | 'west' | null, scores: { east, west }, v0, first, players: [{ …, icp, samk, dmg }] }
export function boardMw(m, me, nm = (p) => p.name) {
  const v0 = m.v0 || 1, pe = Math.round(100 * m.scores.east / v0), pw = Math.round(100 * m.scores.west / v0), first = m.first === 'west' ? 'west' : 'east';
  const mk = (p) => ({ name: nm(p), bot: !!p.bot, icp: p.icp, dmg: p.dmg, s: Math.round(p.score || 0), me: !!(me && p.id === me.id) }), by = (t) => m.players.filter((p) => p.team === t).sort((a, b) => (b.score || 0) - (a.score || 0)).map(mk);
  const R = (side, n) => ({ side: side === 'east' ? 'e' : 'w', n, pct: side === 'east' ? pe : pw });
  const win = m.winner ? (me ? m.winner === me.team : null) : null;
  return { kind: 'mw', win: m.winner ? win : null, won: m.winner, title: !m.winner ? tr('Ничья') : win === true ? tr('Победа') : win === false ? tr('Поражение') : m.winner === 'east' ? tr('Победа Востока') : tr('Победа Запада'),
    rounds: [R(first, 1), R(first === 'east' ? 'west' : 'east', 2)], east: by('east'), west: by('west') };
}
