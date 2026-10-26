// Событие «Туманная топь» (Хеллоуин 2026, макет «В» — tools/airdef-mockups/heli-event.html, без наград и заданий): полноэкранный
// экран поверх меню, как «Исследования» (research.js). Вкладки: «Вылет на вертолёте» (погода, сторона, режим, вертолёт и его
// подвеска, «ВЗЛЁТ») и «Оборона от вертолётов» (обычная оборона на осенней карте: сторона ПВО, эпоха). Вертолётов в обычном
// «Вылете» и «Съёмке» нет (menu.js) — только здесь. Карта и погода строятся при загрузке страницы: смена — перезагрузкой
// (main.js: wantMap — вертолётная подвеска или setup.evd при go=air / go=defense).
import { AG, PLANES, ERAS, HELI_LOADOUTS } from './arsenal.js?v=20261026c';
import { MODES } from './sim/strike.js?v=20261026c';
import { RAID_HELI } from './sim/raid.js?v=20261026c';
import { AUTUMN_KEYS } from './autumn-render.js?v=20261026c';
import { ico } from './icons.js?v=20261026c';
import { tr, trIf, LANG } from './i18n.js?v=20261026c';
import { orientGate } from '../orient-warn.js?v=20261011a';

// решение Mark 2026-10-20: событие идёт 2 месяца; после конца кнопка входа скрыта
export const EVENT_END = new Date('2026-12-20T23:59:59+03:00');
export const eventLeft = () => Math.max(0, EVENT_END.getTime() - Date.now());
export const eventOn = () => eventLeft() > 0;
// вкладка «Оборона от вертолётов»: false — видна с пометкой «скоро» и неактивна (проверено 2026-10-20: все 6 волн доходят до конца, см. defense.js, сторожок вертолётов)
const DEF_READY = true;
const WX = { a_eve: tr('Вечер'), a_dusk: tr('Сумерки'), a_fog: tr('Туман') };

const CSS = `
#event { position: fixed; inset: 0; z-index: 39; display: none; background: #0e110d; color: var(--th-tx, #e9e6dc); font: 13px 'Golos Text', -apple-system, sans-serif; overflow: hidden;
  --ev: #e2762c; --ev2: #ff9a3c; --evd: rgba(226,118,44,.16); --ln: var(--th-line, #3a4334); --dim: var(--th-dim, #a9b19c); --pn: rgba(17,21,15,.94);
  --rt: calc(var(--sa-t, 0px) + var(--tg-t, 0px)); --hh: 56px; }
#event.on { display: block; }
body.eventOn #menu { visibility: hidden; }
#event .bg { position: absolute; inset: 0; background: url(airdef/ui/ev_bg.jpg) center/cover; opacity: .35; filter: blur(3px); transform: scale(1.04); }
#event .fog { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(20,14,22,0) 40%, rgba(40,28,36,.55)); pointer-events: none; }
#event::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: var(--rt); background: var(--pn); z-index: 5; }
#event .top { position: absolute; left: 0; right: 0; top: var(--rt); height: var(--hh); display: flex; align-items: center; gap: 18px; padding: 0 max(14px, var(--sa-r, 0px)) 0 max(14px, var(--sa-l, 0px)); background: var(--pn); border-bottom: 1px solid var(--ln); z-index: 4; }
#event .top h1 { margin: 0; font: 500 20px 'Oswald', sans-serif; letter-spacing: .02em; white-space: nowrap; }
#event .top h1 .pk { display: inline-block; width: 1.2em; height: 1.2em; vertical-align: -0.25em; color: #ff9a3c; margin-right: 4px; }
#event .top .tm { font-weight: 600; font-size: 13px; color: var(--ev2); white-space: nowrap; }
#event .tabs { display: flex; margin-left: 8px; align-self: stretch; }
#event .tabs button { border: 0; border-bottom: 3px solid transparent; background: none; color: var(--dim); padding: 0 16px; font: 600 14px 'Golos Text', sans-serif; cursor: pointer; white-space: nowrap; }
#event .tabs button.on { color: var(--th-tx, #e9e6dc); border-bottom-color: var(--ev); }
#event .tabs button:disabled { opacity: .45; cursor: default; }
#event .x { margin-left: auto; width: 40px; height: 40px; border: 0; background: none; color: var(--dim); font-size: 20px; cursor: pointer; }
#event .x:hover { color: var(--th-tx, #e9e6dc); } #event .x .ic { width: 20px; height: 20px; margin: auto; }
#event .body { position: absolute; left: 0; right: 0; bottom: 0; top: calc(var(--rt) + var(--hh)); display: flex; gap: 14px; padding: 14px max(14px, var(--sa-r, 0px)) 14px max(14px, var(--sa-l, 0px)); z-index: 2; }
#event .pl { width: 236px; flex: none; background: var(--pn); border: 1px solid var(--ln); padding: 12px; overflow: auto; -webkit-overflow-scrolling: touch; }
#event .cap { font: 600 12.5px 'Golos Text', -apple-system, sans-serif; letter-spacing: 0; color: var(--dim); margin: 0 0 6px; }
#event .pl .cap:not(:first-child) { margin-top: 12px; }
#event .map { display: block; width: 100%; aspect-ratio: 4/3; object-fit: cover; border: 1px solid var(--ln); background: #171c14; }
#event .sg { display: flex; border: 1px solid var(--ln); }
#event .sg button { flex: 1; border: 0; border-left: 1px solid var(--ln); background: none; color: var(--th-tx, #e9e6dc); padding: 7px 2px; font: 600 12.5px 'Golos Text', sans-serif; cursor: pointer; }
#event .sg button:first-child { border-left: 0; }
#event .sg button.on { background: var(--ev); color: #1a0f08; }
#event .pc { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; }
#event .hero { flex: 1 1 0; min-height: 40px; width: 100%; display: flex; align-items: center; justify-content: center; background: radial-gradient(ellipse at 50% 85%, rgba(226,118,44,.14) 0, rgba(17,21,15,.0) 70%); }
#event .hero img { max-width: 100%; max-height: 100%; object-fit: contain; }
#event .nm { text-align: center; margin-top: 6px; }
#event .nm b { font: 500 24px 'Oswald', sans-serif; letter-spacing: .02em; margin-right: 8px; }
#event .tg { display: inline-block; font-size: 12px; font-weight: 600; padding: 2px 8px; background: var(--evd); color: var(--ev2); margin: 2px 3px 0; }
#event .rib { display: flex; gap: 8px; margin-top: 10px; max-width: 100%; overflow-x: auto; padding-bottom: 2px; }
#event .ec { position: relative; flex: none; width: 128px; border: 1px solid var(--ln); background: #171c14; padding: 4px; color: var(--th-tx, #e9e6dc); text-align: left; cursor: pointer; font: 12px 'Golos Text', sans-serif; }
#event .ec img { display: block; width: 100%; aspect-ratio: 16/9; object-fit: contain; background: #1a2016; }
#event .ec b { display: block; margin-top: 3px; font-size: 12.5px; }
#event .ec small { display: block; font-size: 11px; color: var(--dim); }
#event .ec.sel { border-color: var(--ev2); box-shadow: 0 0 0 1px var(--ev2) inset; }
#event .ec.lk img { filter: grayscale(.85) brightness(.55); }
#event .ec.lk small { color: var(--ev2); }
#event .ec .lc { position: absolute; right: 6px; top: 6px; color: var(--ev2); }
#event .ec .lc .ic { width: 16px; height: 16px; display: block; }
#event .go { margin-top: 12px; flex: none; width: min(380px, 80%); height: 50px; border: 0; background: var(--ev); color: #1a0f08; font: 500 20px 'Oswald', sans-serif; letter-spacing: .06em; cursor: pointer; }
#event .go:hover { background: var(--ev2); }
#event .dh { text-align: center; max-width: 560px; margin: 8px 0 0; }
#event .dh h2 { margin: 0 0 4px; font: 500 22px 'Oswald', sans-serif; }
#event .dh p { margin: 4px 0; color: var(--dim); line-height: 1.45; font-size: 13px; }
#event .dh p b { color: var(--th-tx, #e9e6dc); font-weight: 600; }
#event .row { display: flex; align-items: center; gap: 10px; margin-top: 10px; }
#event .row .cap { margin: 0; min-width: 78px; text-align: right; }
#event .row .sg { min-width: 250px; }
@media (max-height: 460px), (max-width: 720px) {
  #event { --hh: 44px; }
  #event .top { gap: 10px; padding-left: max(10px, var(--sa-l, 0px)); } #event .top h1 { font-size: 16px; } #event .top .tm { font-size: 12px; }
  #event .tabs button { padding: 0 9px; font-size: 12.5px; } #event .x { width: 34px; }
  #event .body { gap: 10px; padding: 8px max(10px, var(--sa-r, 0px)) 8px max(10px, var(--sa-l, 0px)); }
  #event .pl { width: 176px; padding: 8px; } #event .pl .cap:not(:first-child) { margin-top: 8px; } #event .map { aspect-ratio: 16/7; }
  #event .sg button { padding: 5px 1px; font-size: 12px; }
  #event .nm b { font-size: 18px; } #event .tg { font-size: 11px; padding: 1px 6px; }
  #event .rib { gap: 6px; margin-top: 6px; } #event .ec { width: 104px; padding: 3px; } #event .ec img { aspect-ratio: 2/1; } #event .ec b { font-size: 11.5px; margin-top: 2px; } #event .ec small { font-size: 10.5px; }
  #event .go { height: 40px; font-size: 17px; margin-top: 8px; }
  #event .dh h2 { font-size: 17px; } #event .dh p.lng { display: none; } #event .dh p { font-size: 12px; margin: 2px 0; }
  #event .row { margin-top: 6px; } #event .row .sg { min-width: 200px; } #event .row .cap { min-width: 62px; }
}`;

const LK = (o) => { try { return JSON.parse(o || '{}') || {}; } catch (_) { return {}; } };

export function createEvent(C) {
  const { $, setup, ls, snd } = C;
  const style = document.createElement('style'); style.textContent = CSS; if (document.head) document.head.appendChild(style); // (заглушка DOM стенда — без head/body)
  const root = document.createElement('div'); root.id = 'event'; if (document.body && document.body.appendChild) document.body.appendChild(root);
  const KEY = 'fortuna_airdef_event';
  // сторона вертолётов (hside), погода (wx), выбранный вертолёт (sel — «эпоха:индекс»), вкладка, ПВО и эпоха обороны (dside, dera)
  const S = Object.assign({ tab: 'fly', hside: 'east', wx: 'a_dusk', sel: '', dside: 'east', dera: 3 }, LK(ls.get(KEY)));
  if (!AUTUMN_KEYS.includes(S.wx)) S.wx = 'a_dusk';
  const save = () => ls.set(KEY, JSON.stringify(S));
  const seg = (id, cur, items) => `<div class="sg" data-seg="${id}">${items.map(([v, l]) => `<button data-v="${v}" class="${String(v) === String(cur) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const realLock = () => setup.diff === 'real' && C.progress && C.progress.ready(); // прокачка ограничивает только «Реализм»
  const open0 = (L) => !realLock() || C.progress.loadoutOk(L);
  const thumb = (L) => `airdef/thumbs/heli_${L.plane}.webp?v=20261026c`;
  const idOf = (L) => `${L.era}:${L.i}`;
  const list = () => HELI_LOADOUTS.filter((L) => L.side === S.hside);
  const cur = () => { const l = list(); return l.find((L) => idOf(L) === S.sel) || l[0]; };
  const tagsOf = (L) => L.items.map(([k, n]) => `<span class="tg">${trIf(AG[k].short)} ×${n}</span>`).join('');
  // выбранный вертолёт — всегда открытый, если такой есть (в «Реализме» закрытые выбрать нельзя)
  function fixSel() { const l = list(), L = cur(); if (L && !open0(L)) { const o = l.find(open0); if (o) S.sel = idOf(o); } else if (L) S.sel = idOf(L); }

  const left = () => eventLeft();
  const leftTxt = () => { const ms = left(), d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5); return d > 0 ? tr('ещё {0} д {1} ч', [d, String(h).padStart(2, '0')]) : tr('ещё {0} ч', [h]); };
  const mapPane = () => `<div class="cap">${tr('Карта')}</div><img class="map" src="airdef/ui/${LANG === 'en' ? 'ev_map_en' : 'ev_map'}.jpg?v=20261026c" alt="${tr('Туманная топь')}">
    <div class="cap">${tr('Погода')}</div>${seg('wx', S.wx, AUTUMN_KEYS.map((k) => [k, WX[k]]))}`;
  const modePane = () => `<div class="cap">${tr('Режим')}</div>${seg('diff', setup.diff, Object.entries(MODES).map(([k, m]) => [k, trIf(m.name)]))}`;

  function fly() {
    fixSel(); const L = cur(), lk = (X) => !open0(X);
    const sub = L.items.map(([k, n]) => `${trIf(AG[k].short)} ×${n}`).join(' · ');
    return `<div class="pl">${mapPane()}<div class="cap">${tr('Сторона')}</div>${seg('hside', S.hside, [['east', tr('Восток')], ['west', tr('Запад')]])}${modePane()}</div>
      <div class="pc"><div class="hero"><img src="${thumb(L)}" alt=""></div>
        <div class="nm"><b>${trIf(PLANES[L.plane])}</b>${tagsOf(L)}</div>
        <div class="rib">${list().map((X) => { const miss = lk(X) ? C.progress.loadoutMissing(X) : [];
          return `<button class="ec ${idOf(X) === idOf(L) ? 'sel' : ''} ${miss.length ? 'lk' : ''}" ${miss.length ? `data-need="${miss[0].id}"` : `data-sel="${idOf(X)}"`}><img src="${thumb(X)}" alt="" loading="lazy"><b>${trIf(PLANES[X.plane])}</b><small>${miss.length ? tr('исследовать') : ERAS[X.era - 1].short + ' · ' + X.items.map(([k]) => trIf(AG[k].short)).join(', ')}</small>${miss.length ? `<span class="lc">${ico('lock')}</span>` : ''}</button>`; }).join('')}</div>
        <button class="go" data-go="fly" title="${sub}">${tr('Взлёт')}</button></div>`;
  }
  function def() {
    const att = S.dside === 'east' ? 'west' : 'east', rh = RAID_HELI[att] && RAID_HELI[att][S.dera], hp = rh && rh[0];
    return `<div class="pl">${mapPane()}${modePane()}</div>
      <div class="pc"><div class="hero">${hp ? `<img src="airdef/thumbs/heli_${hp}.webp?v=20261026c" alt="">` : ''}</div>
        <div class="dh"><h2>${tr('Оборона от вертолётов')}</h2>
          <p>${tr('<b>Угроза{0}.</b> Налёт идёт самолётами; со 2-й волны к ним присоединяется вертолёт, с 4-й — пара. Они подходят низко, по оврагам, и прячутся за холмами.', [hp ? ': ' + trIf(PLANES[hp]) : ''])}</p>
          <p class="lng">${tr('Ниже ~30 м за рельефом РЛС вертолёт не видит, поэтому берегите ближние комплексы: пушки, ЗРК ближнего действия, ПЗРК. Поражение — если потеряно 75 % ценности военных объектов. Волн: {0}.', [C.WAVES])}</p></div>
        <div class="row"><span class="cap">${tr('Ваша ПВО')}</span>${seg('dside', S.dside, [['east', tr('Советская')], ['west', tr('Западная')]])}</div>
        <div class="row"><span class="cap">${tr('Эпоха')}</span>${seg('dera', S.dera, ERAS.map((e) => [e.id, e.short]))}</div>
        <button class="go" data-go="def">${tr('К расстановке')}</button></div>`;
  }
  function draw() {
    if (!root.classList.contains('on')) return;
    const sc = root.querySelector('.pl'), st = sc ? sc.scrollTop : 0;
    root.innerHTML = `<div class="bg"></div><div class="fog"></div>
      <div class="top"><h1>${ico('pumpkin', 'pk')} ${tr('Туманная топь')}</h1><span class="tm" id="evTm">${leftTxt()}</span>
        <div class="tabs"><button data-tab="fly" class="${S.tab === 'fly' ? 'on' : ''}">${tr('Вылет на вертолёте')}</button><button data-tab="def" class="${S.tab === 'def' ? 'on' : ''}" ${DEF_READY ? '' : 'disabled'}>${tr('Оборона от вертолётов')}${DEF_READY ? '' : tr(' · скоро')}</button></div>
        <button class="x" data-close="1" aria-label="${tr('Закрыть')}">${ico('close')}</button></div>
      <div class="body">${S.tab === 'def' && DEF_READY ? def() : fly()}</div>`;
    const p = root.querySelector('.pl'); if (p) p.scrollTop = st;
  }
  // карта и погода строятся при загрузке: нужна осенняя карта и выбранная погода — иначе перезагрузка сразу в бой (go=…, weather=…)
  function launch(game) {
    setup.evd = game === 'defense'; C.saveSetup(); C.lastGame = game;
    if (C.MAP === 'autumn' && C.W_KEY === S.wx) { api.hide(); C.start(game); return; }
    const u = new URL(location.href); u.searchParams.set('go', game); u.searchParams.set('weather', S.wx); if (game === 'air') u.searchParams.set('hlo', setup.lo); // подвеска вертолёта: меню на загрузке подменяет её самолётной
    for (const k of ['heli', 'mp', 'ad']) u.searchParams.delete(k);
    if (u.searchParams.get('map') !== 'autumn') u.searchParams.delete('map');
    location.replace(u.href);
  }
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-close],[data-tab],[data-seg] [data-v],[data-sel],[data-need],[data-go]'); if (!t) return;
    snd.click();
    if (t.dataset.close) { api.close(); return; }
    if (t.dataset.tab) { S.tab = t.dataset.tab; save(); draw(); return; }
    if (t.dataset.need) { C.research.open(t.dataset.need); return; } // закрыто в «Реализме» — к нужному узлу дерева
    if (t.dataset.sel) { S.sel = t.dataset.sel; save(); draw(); return; }
    if (t.dataset.go === 'fly') {
      const L = cur();
      if (!open0(L)) { C.research.open(C.progress.loadoutMissing(L)[0].id); return; } // «Реализм»: ни одного купленного вертолёта — в «Исследования»
      // сторона ПВО города — противоположная стороне вертолёта; вылет один, без «Операции»
      Object.assign(setup, { game: 'air', era: L.era, lo: L.i, op: false, side: S.hside === 'east' ? 'west' : 'east' });
      orientGate(() => launch('air'), C.IS_TOUCH); return;
    }
    if (t.dataset.go === 'def') {
      Object.assign(setup, { game: 'defense', era: S.dera, side: S.dside });
      orientGate(() => launch('defense'), C.IS_TOUCH); return;
    }
    const id = t.parentNode.dataset.seg, v = t.dataset.v;
    if (id === 'wx') S.wx = v; else if (id === 'hside') { S.hside = v; S.sel = ''; } else if (id === 'dside') S.dside = v; else if (id === 'dera') S.dera = +v;
    else if (id === 'diff') { setup.diff = v; C.saveSetup(); }
    save(); draw();
  });
  addEventListener('keydown', (e) => { if (e.code === 'Escape' && root.classList.contains('on') && !(C.research && C.research.isOpen && C.research.isOpen())) api.close(); });
  if (C.progress && C.progress.on) C.progress.on(draw); // купили в «Исследованиях» — замки на карточках обновляются
  addEventListener('resize', draw);
  let tmr = 0;
  const api = {
    open() {
      if (!eventOn()) return;
      root.classList.add('on'); document.body.classList.add('eventOn'); draw(); if (C.progress && C.progress.refresh) C.progress.refresh();
      clearInterval(tmr); tmr = setInterval(() => { const e = $('evTm'); if (e) e.textContent = leftTxt(); if (!eventOn()) api.close(); }, 60000);
    },
    hide() { root.classList.remove('on'); document.body.classList.remove('eventOn'); clearInterval(tmr); },
    close() { api.hide(); if (C.menu) C.menu.render(); },
    isOpen: () => root.classList.contains('on'),
    leftText: leftTxt,
  };
  // кнопка входа на фоне меню рядом с «Исследованиями»; после конца события скрыта
  const btn = $('evtBtn');
  if ($('evtIco')) $('evtIco').innerHTML = ico('pumpkin'); // pumpkin-lantern — Lorc (game-icons.net, CC BY 3.0)
  if (btn) { btn.style.display = eventOn() ? 'flex' : 'none'; if ($('evtLeft')) $('evtLeft').textContent = tr('событие · {0}', [eventLeft() >= 864e5 ? tr('ещё {0} дн.', [Math.floor(eventLeft() / 864e5)]) : leftTxt()]); btn.onclick = () => { snd.click(); api.open(); }; }
  return api;
}
