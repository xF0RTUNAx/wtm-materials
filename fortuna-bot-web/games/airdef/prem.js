// Премиум в игре (Mark 2026-11-19, вариант «Крылья»: Магазин/Премиум/_чистовые/в_игре/ПАСПОРТ.md): знак крыльев, плашка со сроком под кнопкой звука в ангаре
// (больше суток - «6 д 14 ч» раз в минуту, меньше - «13:42:05» янтарным раз в секунду; без премиума - серая плашка «Премиум»), окно «Премиум закончился» (один раз
// на срок - флаг в localStorage), уведомление «+1 кристалл за вход», лента «Премиум до …» в профиле. Срок хранит progress-net.js (premUntil / premLast), магазин -
// shop-ui.js (вкладка «Премиум»), оплата - pay.js. Знак - своя картинка airdef/shop/prem/prem_wings_*.webp (в оригинале 1416×440, берём в 2× от показа).
import { tr, LANG } from './i18n.js?v=20261119b';
import { activeAcc } from './account.js?v=20261119b';

const WS = 'airdef/shop/prem/prem_wings_';
// знак высотой h px (CSS): 64 px шириной - обычный экран, 120 - плотный (srcset)
export const wings = (h = 13, cls = 'pemb') => `<img class="${cls}" src="${WS}64.webp" srcset="${WS}120.webp 2x" alt="" style="height:${typeof h === 'number' ? h + 'px' : h}" draggable="false">`;
// знак у ника другого игрока (лобби, табло боя, итоги, рейтинг): 0,95 em от шрифта ника; пусто, если у игрока нет премиума
export const nickMark = (on, h = '.95em') => (on ? wings(h, 'pemb pnk') : '');
// знак над аватаркой в лобби онлайна: 9 px, по центру, на 5 px выше верхнего края (CSS .pmk - ниже)
export const lobbyMark = (on) => (on ? wings(9, 'pemb pmk') : '');
// премиум игрока комнаты онлайна (N.room.players[].prem - флаг из билета mp-ticket): по id или по нику (лента сбитий знает только ник)
export const premById = (N, id) => { const r = N && N.room, p = r && (r.players || []).find((q) => q.id === id); return !!(p && p.prem); };
export const premByName = (N, name) => { const r = N && N.room, p = r && (r.players || []).find((q) => !q.bot && q.name === name); return !!(p && p.prem); };
// знак на холсте (лента сбитий, метки над техникой): картинка грузится один раз; пока не пришла (или нет Image - стенды без браузера) - ничего не рисуем
let WIMG = null;
function wingsImg() { if (!WIMG && typeof Image === 'function') { WIMG = new Image(); WIMG.decoding = 'async'; WIMG.src = WS + '120.webp'; } return WIMG && WIMG.complete && WIMG.naturalWidth ? WIMG : null; }
// знак высотой h px, левый край x, центр по вертикали y; a - прозрачность; возвращает ширину (0 - не нарисован)
export function drawWings(g, x, y, h, a = 1) {
  const im = wingsImg(); if (!im) return 0;
  const w = Math.round(h * im.naturalWidth / im.naturalHeight);
  g.save(); g.shadowColor = 'rgba(0,0,0,.7)'; g.shadowBlur = 3; g.shadowOffsetY = 1; g.globalAlpha *= a; g.drawImage(im, x, y - h / 2, w, h); g.restore(); return w;
}
export const wingsW = (h) => { const im = wingsImg(); return im ? Math.round(h * im.naturalWidth / im.naturalHeight) : 0; };
const p2 = (n) => String(n).padStart(2, '0');
export const ddmm = (iso) => { const d = new Date(iso); return `${p2(d.getDate())}.${p2(d.getMonth() + 1)}`; };
export const ddmmHm = (iso) => { const d = new Date(iso); return `${p2(d.getDate())}.${p2(d.getMonth() + 1)}, ${p2(d.getHours())}:${p2(d.getMinutes())}`; };
// сколько осталось: { text, soon } - soon: меньше суток (янтарный, с секундами)
export function left(iso, now = Date.now()) {
  const ms = Math.max(0, Date.parse(iso) - now);
  if (ms >= 86400000) return { text: tr('{0} д {1} ч', [Math.floor(ms / 86400000), Math.floor((ms % 86400000) / 3600000)]), soon: false };
  const s = Math.floor(ms / 1000);
  return { text: `${p2(Math.floor(s / 3600))}:${p2(Math.floor((s % 3600) / 60))}:${p2(s % 60)}`, soon: true };
}

const CSS = `
.pemb { display: inline-block; width: auto; vertical-align: middle; filter: drop-shadow(0 1px 2px rgba(0,0,0,.7)); } .pemb.pnk { margin: -.2em 0 0 .3em; }
.rseat .pemb.pmk { position: absolute; z-index: 2; left: 50%; top: -5px; transform: translateX(-50%); margin: 0; pointer-events: none; } .rseat.prem .rava { box-shadow: 0 0 0 2px #d6b06a, 0 0 8px rgba(214,176,106,.6); }
#plPanel .plr { padding-left: 5px; } #plPanel .plr.prem, .pr.prem { box-shadow: inset 2px 0 0 #d6b06a, inset 60px 0 40px -40px rgba(214,176,106,.18); }
#premChip { position: fixed; z-index: 32; display: none; align-items: center; gap: 5px; height: 26px; padding: 0 9px 0 7px; border-radius: 13px; cursor: pointer; white-space: nowrap;
  font: 600 11px/1 'Golos Text', Golos, sans-serif; color: #f4e3bb; letter-spacing: .2px; background: linear-gradient(180deg, rgba(30,24,14,.86), rgba(16,13,8,.86)); border: 1px solid rgba(226,180,90,.55); box-shadow: 0 2px 8px rgba(0,0,0,.45); }
#premChip.on { display: flex; } #premChip:focus-visible { outline: 2px solid #f3c96f; outline-offset: 2px; }
#premChip b { font: 600 12px/1 'Oswald', sans-serif; letter-spacing: .4px; color: #f6dc9a; font-variant-numeric: tabular-nums; }
#premChip.warn { border-color: rgba(240,150,70,.8); } #premChip.warn b { color: #ffb36b; }
#premChip.off { padding: 0 10px 0 7px; border-color: rgba(255,255,255,.18); background: rgba(16,14,10,.62); color: #bdb6a6; font-weight: 500; }
#premChip.off .pemb { filter: grayscale(1) brightness(1.15) drop-shadow(0 1px 2px rgba(0,0,0,.7)); opacity: .65; }
#premToast { position: fixed; z-index: 90; left: 50%; top: calc(var(--sa-t, 0px) + var(--tg-t, 0px) + 58px); transform: translateX(-50%); display: flex; align-items: center; gap: 10px; padding: 8px 16px 8px 12px; border-radius: 10px; pointer-events: none;
  font: 600 12px/1.2 'Golos Text', Golos, sans-serif; color: #f4ead6; background: linear-gradient(180deg, rgba(28,22,12,.92), rgba(14,11,7,.92)); border: 1px solid rgba(226,180,90,.55); box-shadow: 0 6px 18px rgba(0,0,0,.5); animation: premToast 4s cubic-bezier(.2,.8,.2,1) both; }
#premToast b { font: 600 15px/1 'Oswald', sans-serif; color: #7fe0a6; } #premToast small { display: block; margin-top: 2px; font-weight: 500; color: #b9a988; font-size: 10px; }
@keyframes premToast { 0% { opacity: 0; transform: translate(-50%, 8px); } 10% { opacity: 1; transform: translate(-50%, 0); } 85% { opacity: 1; transform: translate(-50%, 0); } 100% { opacity: 0; transform: translate(-50%, 0); } }
@media (max-height: 500px) { #premToast { top: calc(var(--sa-t, 0px) + var(--tg-t, 0px) + 92px); } }
#premEnd { position: fixed; z-index: 91; inset: 0; display: none; place-items: center; background: rgba(0,0,0,.45); } #premEnd.on { display: grid; animation: premFade .35s ease both; }
@keyframes premFade { from { opacity: 0; } }
#premEnd > div { width: min(300px, calc(100vw - 32px)); padding: 18px 20px 16px; border-radius: 12px; text-align: center; background: linear-gradient(180deg, #221b10, #120e08); border: 1px solid rgba(226,180,90,.5); color: #e9dfca;
  font: 500 12px/1.4 'Golos Text', Golos, sans-serif; box-shadow: 0 10px 30px rgba(0,0,0,.6); }
#premEnd .pemb { opacity: .55; filter: grayscale(.6); } #premEnd h3 { margin: 8px 0 4px; font: 400 22px/1 'Oswald', sans-serif; letter-spacing: 1.5px; color: #e2c487; text-transform: uppercase; }
#premEnd .bt { display: flex; gap: 8px; justify-content: center; margin-top: 12px; flex-wrap: wrap; }
#premEnd button { padding: 8px 14px; border-radius: 7px; font: 600 12px/1 'Oswald', sans-serif; letter-spacing: 1px; text-transform: uppercase; cursor: pointer; background: none; color: #cfc6b4; border: 1px solid rgba(255,255,255,.2); }
#premEnd button.go { background: #d6b06a; color: #140f06; border-color: #d6b06a; } #premEnd button:focus-visible { outline: 2px solid #f3c96f; outline-offset: 2px; }
.pribbon { display: inline-flex; align-items: center; gap: 6px; margin-top: 6px; padding: 3px 10px 3px 6px; border-radius: 4px; font: 600 10px/1 'Golos Text', Golos, sans-serif; color: #2a1d08; letter-spacing: .3px; background: linear-gradient(180deg, #f6dc9a, #c9973f); }
.pribbon .pemb { filter: none; } .hero .since .pribbon { display: flex; width: fit-content; margin: 2px 0 6px; }
@media (prefers-reduced-motion: reduce) { #premToast, #premEnd.on { animation: none; } }
`;

export function createPrem(C) {
  const st = document.createElement('style'); st.textContent = CSS; if (document.head) document.head.appendChild(st); // (заглушка DOM стенда - без head/body)
  const S = { gift: false, shown: '', endOn: false };
  const $ = (id) => document.getElementById(id);
  const P = () => C.progress;
  const until = () => (P() && P().premUntil) || null;
  const airdefAcc = () => { const a = activeAcc(); return a && a.kind === 'airdef' ? a : null; };
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } }, lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* приватный режим */ } };
  const hangar = () => document.body.classList.contains('menuing') && !$('loading');

  // ── плашка в ангаре: под кнопкой звука, левый край по левому краю кнопки ──
  const chip = document.createElement('button'); chip.id = 'premChip'; chip.type = 'button'; if (document.body && document.body.appendChild) document.body.appendChild(chip);
  chip.onclick = () => { if (C.snd && C.snd.click) C.snd.click(); if (C.shop) C.shop.open('prem'); };
  function place() {
    const mu = $('mute'), a = airdefAcc();
    const cs = mu && getComputedStyle(mu), vis = !!a && C.state === 'menu' && document.body.classList.contains('hgOn') && !!mu && cs.display !== 'none' && parseFloat(cs.opacity) > 0.05 && !document.body.classList.contains('endOn');
    chip.classList.toggle('on', vis); if (!vis) return;
    const r = mu.getBoundingClientRect(); chip.style.left = Math.round(r.left) + 'px'; chip.style.top = Math.round(r.bottom + 6) + 'px';
  }
  function paintChip() {
    const u = until(), a = airdefAcc(); if (!a) { chip.classList.remove('on'); return; }
    let key, html, cls;
    if (u) { const l = left(u); key = 'on|' + l.text + l.soon + LANG; cls = l.soon ? 'warn' : ''; html = `${wings(13)}<b>${l.text}</b>`; }
    else { key = 'off|' + LANG; cls = 'off'; html = `${wings(13)}<span>${tr('Премиум')}</span>`; }
    if (S.shown !== key) { S.shown = key; chip.className = cls + (chip.classList.contains('on') ? ' on' : ''); chip.innerHTML = html; chip.title = tr('Премиум'); chip.setAttribute('aria-label', tr('Премиум')); }
    place();
  }

  // ── уведомление «+1 кристалл за вход» ──
  function toast() {
    const u = until(), old = $('premToast'); if (old) old.remove();
    const t = document.createElement('div'); t.id = 'premToast'; t.setAttribute('role', 'status');
    t.innerHTML = `${wings(18)}<span><b>${tr('+1 кристалл за вход')}</b>${u ? `<small>${tr('премиум · ещё {0}', [left(u).text])}</small>` : ''}</span>`;
    document.body.appendChild(t); setTimeout(() => t.remove(), 4100);
  }

  // ── окно «Премиум закончился»: один раз на срок ──
  function endWin() {
    let w = $('premEnd');
    if (!w) {
      w = document.createElement('div'); w.id = 'premEnd'; w.setAttribute('role', 'dialog'); w.setAttribute('aria-modal', 'true'); document.body.appendChild(w);
      w.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; w.classList.remove('on'); S.endOn = false; if (b.dataset.a === 'go' && C.shop) C.shop.open('prem'); });
    }
    w.innerHTML = `<div>${wings(30)}<h3>${tr('Премиум закончился')}</h3>${tr('Спасибо, что летали с премиумом. Бонус ×1,75 и дополнительная замена заданий больше не действуют.')}<div class="bt"><button class="go" data-a="go">${tr('Продлить')}</button><button data-a="no">${tr('Позже')}</button></div></div>`;
    w.classList.add('on'); S.endOn = true; const g = w.querySelector('.go'); if (g) g.focus({ preventScroll: true });
  }
  function checkEnd() {
    const a = airdefAcc(), last = P() && P().premLast;
    if (!a || !last || until() || S.endOn || !hangar() || (C.shop && C.shop.isOpen && C.shop.isOpen())) return;
    const ended = Date.parse(last), now = Date.now();
    if (!(ended <= now && now - ended < 14 * 86400000)) return; // давно закончился (новое устройство) - не напоминаем
    const key = `${a.id}|${last}`; if (lsGet('fortuna_airdef_prem_end') === key) return;
    lsSet('fortuna_airdef_prem_end', key); endWin();
  }

  // ── ход времени: плашка и проверки; раз в секунду, DOM трогаем, только когда текст изменился ──
  function tick() {
    if (document.hidden) return;
    paintChip();
    if (S.gift && hangar()) { S.gift = false; toast(); }
    checkEnd();
  }
  setInterval(tick, 1000);
  addEventListener('airdef-prem', () => { S.shown = ''; tick(); });
  addEventListener('resize', place); addEventListener('orientationchange', () => setTimeout(place, 300)); addEventListener('airdef-safearea', place);
  if (typeof MutationObserver === 'function' && document.body) new MutationObserver(place).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  return {
    // +1 кристалл за первый вход дня начислен сервером: показать, когда на экране ангар
    gift() { S.gift = true; setTimeout(tick, 0); },
    // лента под ником в своём профиле (rating-ui.js), только пока премиум активен
    ribbon(iso) { const u = iso || until(); return u ? `<span class="pribbon">${wings(11)}${tr('Премиум до {0}', [ddmm(u)])}</span>` : ''; },
    until, on: () => !!until(),
    tick,
  };
}
