// Рейтинг онлайна «Воздушного превосходства» (Mark 2026-10-25): кнопка в меню (#ratBtn, верхняя в #mbtns), окно рейтинга (макет «Б» без пьедестала:
// место, игрок, очки; внизу своя карточка с 7 ячейками и «Мои бои») и вид «Мои бои» (все онлайн-бои сезона: засчитан или нет, разбор очков).
// Данные — функция get-airdef-rating (account.js; без сервера и без ?rmock=1 — «Рейтинг скоро откроется»). Формула очков — rating.js.
// В таблице — только аккаунты игры; аккаунту сайта и гостю вместо своей карточки — вход / перенос прогресса (account-ui.js).
/* global CONFIG */
import { ico } from './icons.js?v=20261026a';
import { tr, LANG } from './i18n.js?v=20261026a';
import { activeAcc, rating as fetchRating, transferOk } from './account.js?v=20261026a';

const LOC = LANG === 'en' ? 'en-US' : 'ru-RU';
const nf = (v) => Math.round(v).toLocaleString(LOC);
const kf = (v) => String(v).replace('.', LANG === 'en' ? '.' : ',');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const HELP_KEY = 'fortuna_airdef_rating_help'; // «?» перестаёт мерцать после первого открытия (на этом устройстве)
const SLOTS = 7, FRESH = 60000, RETRY = 30000;

const CSS = `
#ratWin { position: fixed; inset: 0; z-index: 70; display: none; align-items: center; justify-content: center; box-sizing: border-box; background: rgba(8,11,7,.72); color: #e9e6dc; font: 400 14px/1.4 'Golos Text', -apple-system, sans-serif;
  padding: calc(12px + var(--sa-t, 0px) + var(--tg-t, 0px)) max(12px, var(--sa-r, 0px)) max(12px, var(--sa-b, 0px)) max(12px, var(--sa-l, 0px)); --line: #2f3828; --dim: #a9b09b; --amber: #e8b04a; --amber2: #f3c96f; --green: #7fd38f; }
#ratWin.on { display: flex; }
#ratWin .ic { width: 1em; height: 1em; fill: currentColor; flex: none; display: inline-block; vertical-align: -0.15em; }
#ratWin .win { width: min(460px, 100%); max-height: 100%; min-width: 0; display: flex; flex-direction: column; background: #10140f; border: 1px solid #39422f; }
#ratWin .win.wide { width: min(780px, 100%); }
#ratWin .whead { flex: none; display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--line); }
#ratWin .whead .t { display: flex; align-items: center; gap: 8px; font: 500 18px 'Oswald', 'Arial Narrow', sans-serif; min-width: 0; } #ratWin .whead .t .ic { width: 22px; height: 22px; color: var(--amber2); }
#ratWin .whead .s { margin-left: auto; font: 13px 'Golos Text', sans-serif; color: var(--dim); text-align: right; }
#ratWin .rx { flex: none; width: 28px; height: 28px; padding: 5px; border: 1px solid #4a5443; background: none; color: #e9e6dc; cursor: pointer; } #ratWin .rx:hover { background: #222a1f; } #ratWin .rx .ic { width: 100%; height: 100%; vertical-align: top; }
#ratWin button:focus-visible { outline: 2px solid var(--amber2); outline-offset: 2px; }
#ratWin .btnm { font: 500 13px 'Golos Text', sans-serif; color: #17190f; background: var(--amber); border: 0; padding: 6px 10px; white-space: nowrap; cursor: pointer; } #ratWin .btnm:hover { background: var(--amber2); }
#ratWin .btnm.alt { background: none; color: #e9e6dc; border: 1px solid #4a5443; } #ratWin .btnm.alt:hover { background: #222a1f; }
#ratWin .back { display: inline-flex; align-items: center; gap: 5px; font: 500 13px 'Golos Text', sans-serif; color: #e9e6dc; background: none; border: 1px solid #4a5443; padding: 5px 9px; cursor: pointer; } #ratWin .back:hover { background: #222a1f; }
#ratWin .num { font-family: 'JetBrains Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
#ratWin .rows { flex: 1 1 auto; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; display: block; }
#ratWin .row { display: grid; grid-template-columns: 40px 1fr auto; gap: 8px; align-items: center; padding: 7px 12px; border-bottom: 1px solid #1d2419; font-size: 14.5px; }
#ratWin .row .p { font: 600 14px 'JetBrains Mono', monospace; color: var(--dim); } #ratWin .row .v { font: 600 14.5px 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums; }
#ratWin .row.g1 .p { color: #f5d06a; } #ratWin .row.g2 .p { color: #dadcd2; } #ratWin .row.g3 .p { color: #d29a62; }
#ratWin .row.me { background: #2a2a17; } #ratWin .row.me .p { color: var(--amber2); }
#ratWin .row.gap { grid-template-columns: 1fr; text-align: center; color: var(--dim); padding: 2px; font-size: 12px; }
#ratWin .who { display: flex; align-items: center; gap: 8px; min-width: 0; } #ratWin .who span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#ratWin .av { width: 24px; height: 24px; display: grid; place-items: center; font: 600 10.5px 'Golos Text', sans-serif; background: #2c3526; flex: none; }
#ratWin .mecard { flex: none; margin: 12px; padding: 10px 12px; background: #1a2014; border: 1px solid #4b5640; display: grid; grid-template-columns: auto 1fr auto; gap: 4px 12px; align-items: center; }
#ratWin .mecard .big { font: 600 28px 'Oswald', sans-serif; color: var(--amber2); grid-row: span 2; } #ratWin .mecard .nk { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#ratWin .mecard small { color: var(--dim); font-size: 12.5px; }
#ratWin .mecard.no { grid-template-columns: 1fr; gap: 8px; } #ratWin .mecard.no .acts { display: flex; gap: 8px; flex-wrap: wrap; }
#ratWin .slots { display: flex; gap: 3px; } #ratWin .slots i { width: 18px; height: 6px; background: #3a4433; } #ratWin .slots i.on { background: var(--amber); }
#ratWin .msg { padding: 28px 16px; text-align: center; color: var(--dim); display: grid; gap: 10px; justify-items: center; } #ratWin .msg b { font: 500 17px 'Oswald', sans-serif; color: #e9e6dc; }
/* «?» в заголовке: мягкое мерцание, пока не открывали */
#ratWin .qbtn { display: inline-grid; place-items: center; width: 26px; height: 26px; margin-left: 4px; padding: 4px; border: 1px solid #6b5a2c; background: #1d2014; color: var(--amber2); cursor: pointer; font: 600 16px/1 'Oswald', sans-serif; }
#ratWin .qbtn:not(.seen) { animation: ratGlow 2.6s ease-in-out infinite; }
@keyframes ratGlow { 0%, 100% { box-shadow: 0 0 0 0 rgba(243, 201, 111, 0); border-color: #6b5a2c; } 50% { box-shadow: 0 0 10px 1px rgba(243, 201, 111, .45); border-color: #f3c96f; } }
@media (prefers-reduced-motion: reduce) { #ratWin .qbtn:not(.seen) { animation: none; border-color: #f3c96f; } }
#ratWin .qpop { flex: none; max-height: 46vh; overflow-y: auto; margin: 0; padding: 10px 12px 12px; background: #1a1f14; border-bottom: 1px solid #4b5640; display: grid; gap: 6px; }
#ratWin .qpop .qh { display: flex; justify-content: space-between; align-items: center; gap: 8px; } #ratWin .qpop .qh b { font: 500 16px 'Oswald', sans-serif; }
#ratWin .qpop ul { margin: 0; padding-left: 18px; display: grid; gap: 4px; font-size: 14px; }
/* мои бои */
#ratWin .battles { flex: 1 1 auto; min-height: 0; overflow: auto; -webkit-overflow-scrolling: touch; }
#ratWin table { width: 100%; border-collapse: collapse; font-size: 14px; min-width: 640px; }
#ratWin th { text-align: left; font: 500 12.5px 'Golos Text', sans-serif; color: var(--dim); padding: 6px 8px; border-bottom: 1px solid var(--line); white-space: nowrap; position: sticky; top: 0; background: #10140f; }
#ratWin td { padding: 8px; border-bottom: 1px solid #1d2419; vertical-align: top; } #ratWin td.nw { white-space: nowrap; }
#ratWin td.n, #ratWin th.n { text-align: right; font-family: 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums; white-space: nowrap; }
#ratWin tr.off td { color: #7f8775; } #ratWin tr.off td.n b { color: #7f8775; }
#ratWin .ok { color: #7fd38f; font-weight: 600; white-space: nowrap; } #ratWin .note { font-size: 12.5px; color: var(--dim); } #ratWin tr.off .note { color: #6b7363; }
#ratWin .k { display: inline-block; font: 12px 'JetBrains Mono', monospace; padding: 1px 5px; background: #222a1d; margin: 1px 2px 1px 0; white-space: nowrap; } #ratWin .break { font: 12.5px 'JetBrains Mono', monospace; color: var(--dim); }
@media (max-height: 460px) { #ratWin .whead { padding: 6px 10px; } #ratWin .row { padding-top: 4px; padding-bottom: 4px; } #ratWin .mecard { margin: 8px 10px; padding: 7px 10px; } #ratWin .mecard .big { font-size: 24px; } #ratWin td { padding: 5px 8px; } }
`;

// ранг боя по множителю (RATING.RANK_K: 1.02 → II, 1.05 → III, 1.08 → IV)
const rankOf = (k) => (k >= 1.075 ? 'IV' : k >= 1.04 ? 'III' : k >= 1.015 ? 'II' : 'I');
const pad2 = (v) => String(v).padStart(2, '0');
const when = (at) => { const d = new Date(at); return isNaN(d) ? '' : `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const initials = (nick) => (String(nick).match(/[\p{L}\p{N}]/gu) || ['?']).slice(0, 2).join('').toUpperCase();

export function createRating(C) {
  const style = document.createElement('style'); style.textContent = CSS; if (document.head) document.head.appendChild(style); // (заглушка DOM стенда — без head/body)
  const root = document.createElement('div'); root.id = 'ratWin'; root.setAttribute && root.setAttribute('role', 'dialog'); root.setAttribute && root.setAttribute('aria-modal', 'true'); if (document.body && document.body.appendChild) document.body.appendChild(root);
  const S = { data: null, err: '', key: null, at: 0, busy: false, view: 'list', q: false };
  const $ = (id) => document.getElementById(id);
  const seen = () => { try { return localStorage.getItem(HELP_KEY) === '1'; } catch (_) { return false; } };
  const markSeen = () => { try { localStorage.setItem(HELP_KEY, '1'); } catch (_) { /* приватный режим */ } };

  const daysLeft = (d) => { const e = Date.parse(d.ends_at); return isNaN(e) ? null : Math.max(1, Math.ceil((e - Date.now()) / 86400000)); };
  const seasonText = (d) => { const n = daysLeft(d); return n == null ? tr('сезон {0}', [d.season]) : tr('сезон {0} · ещё {1} дн.', [d.season, n]); };
  const mine = () => { const d = S.data, a = activeAcc(); return d && d.me && d.me.kind === 'airdef' && a && a.kind === 'airdef' ? d.me : null; };

  // ── кнопка в меню ──
  function paint() {
    const d = S.data, m = mine();
    const sub = d ? seasonText(d) : S.err === 'soon' ? tr('скоро откроется') : S.err ? tr('нет связи') : '';
    const pl = m ? (m.n > 0 && m.place ? '#' + m.place : m.n > 0 ? m.n + '/' + SLOTS : '0/' + SLOTS) : '';
    if ($('ratSub').textContent !== sub) $('ratSub').textContent = sub;
    if ($('ratPl').textContent !== pl) $('ratPl').textContent = pl;
  }
  $('ratIco').innerHTML = ico('rating');
  $('ratBtn').onclick = () => { if (C.snd && C.snd.click) C.snd.click(); api.open(); };

  // ── данные ──
  const keyNow = () => { const a = activeAcc(); return a ? a.id : ''; };
  async function load() {
    if (S.busy) return;
    const key = keyNow(); S.busy = true; S.key = key;
    let data = null, err = '';
    try { data = await fetchRating(key || null); }
    catch (e) { err = e.status === 404 || (e.status === 0 && !e.offline && typeof CONFIG !== 'undefined') ? 'soon' : e.message || tr('Нет связи с сайтом'); } // функции рейтинга ещё нет на сервере (404 или ответ без CORS) — «скоро откроется»
    S.busy = false;
    if (key !== keyNow()) { S.at = 0; S.data = null; S.err = ''; paint(); load(); return; } // пока ждали, сменили аккаунт — данные чужие
    S.data = data; S.err = err; S.at = Date.now(); paint(); if (root.classList.contains('on')) draw();
  }
  // меню показано: обновить данные кнопки (не чаще раза в минуту; после сбоя — раз в полминуты)
  function touch() {
    if (C.state !== 'menu' || S.busy) return;
    if (S.key === keyNow() && Date.now() - S.at < (S.err ? RETRY : FRESH)) return;
    load();
  }

  // ── окно ──
  function head(inner, sub, back) {
    return `<div class="whead">${back ? `<button class="back" data-a="back">${ico('triL')}${tr('Назад')}</button>` : ''}<span class="t">${inner}</span><span class="s">${sub}</span><button class="rx" data-a="close" aria-label="${tr('Закрыть')}" title="${tr('Закрыть')}">${ico('close')}</button></div>`;
  }
  const HELP = [tr('За каждый онлайн-бой: итог команды, ваш вклад и сила соперников.'), tr('Аркада — ×0,6.'), tr('Ранг боя II, III, IV — +2, +5, +8 %. В Мульти-волне надбавки нет.'),
    tr('Чем больше ботов среди соперников, тем меньше очков.'), tr('Итог сезона — 7 боёв: по 2 лучших за ПВО, за лётчика и в Мульти-волне и ещё 1 лучший из остальных.'), tr('Своя комната не считается. Вышли из боя раньше — 0.')];
  function noData() {
    const soon = S.err === 'soon';
    return `<div class="win">${head(`${ico('rating')}${tr('Рейтинг')}`, '')}<div class="msg">${S.busy || !S.err ? `<span>${tr('Загружаем…')}</span>` : soon ? `<b>${tr('Рейтинг скоро откроется')}</b><span>${tr('Таблица сезона появится, как только сервер рейтинга заработает.')}</span>`
      : `<b>${tr('Нет связи с сайтом')}</b><span>${esc(S.err)}</span><button class="btnm" data-a="retry">${tr('Повторить')}</button>`}</div></div>`;
  }
  function viewList() {
    const d = S.data, m = mine(), acc = activeAcc();
    const title = `${ico('rating')}${tr('Рейтинг')}<button class="qbtn${seen() ? ' seen' : ''}" data-a="help" aria-expanded="${S.q}" title="${tr('Как начисляются очки')}">?</button>`;
    const pop = S.q ? `<div class="qpop"><div class="qh"><b>${tr('Как начисляются очки')}</b><button class="rx" data-a="helpx" aria-label="${tr('Закрыть')}">${ico('close')}</button></div><ul>${HELP.map((h) => `<li>${h}</li>`).join('')}</ul></div>` : '';
    const rows = d.top.map((r) => `<div class="row${r.place <= 3 ? ' g' + r.place : ''}${m && m.place === r.place ? ' me' : ''}"><span class="p">${r.place}</span><span class="who"><span class="av">${esc(initials(r.nick))}</span><span>${esc(r.nick)}</span></span><span class="v">${nf(r.points)}</span></div>`).join('')
      + (d.total > d.top.length ? '<div class="row gap">…</div>' : '') + (d.top.length ? '' : `<div class="msg"><span>${tr('В этом сезоне ещё нет результатов.')}</span></div>`);
    let card;
    if (acc && acc.kind === 'airdef') {
      const me = d.me || { nick: acc.nick, place: null, points: 0, n: 0 };
      card = `<div class="mecard"><span class="big">${me.place || '—'}</span><span class="nk">${esc(me.nick || acc.nick)} · <b class="num">${nf(me.points || 0)}</b></span><button class="btnm" data-a="mine">${tr('Мои бои')}</button>
        <small>${tr('засчитано {0} из {1}', [me.n || 0, SLOTS])}</small><span class="slots">${Array.from({ length: SLOTS }, (_, i) => `<i${i < (me.n || 0) ? ' class="on"' : ''}></i>`).join('')}</span></div>`;
    } else {
      card = `<div class="mecard no"><span>${tr('В рейтинге — только аккаунты игры')}</span><span class="acts"><button class="btnm" data-a="login">${tr('Войти')}</button>${transferOk() ? `<button class="btnm alt" data-a="xfer">${tr('Перенести прогресс')}</button>` : ''}</span></div>`;
    }
    return `<div class="win">${head(title, esc(seasonText(d)))}${pop}<div class="rows">${rows}</div>${card}</div>`;
  }
  // «Мои бои»: дата, режим, роль, итог, разбор «итог + вклад + соперники», множители ≠ 1, очки, засчитан ли в сезон (2 + 2 + 2 + 1, sql/025)
  function battleRow(b) {
    const p = b.rp || {}, multi = !!b.multi;
    const mode = (multi ? tr('Мульти-волна') : tr('Вылет и оборона')) + ' · ' + (b.mode === 'real' ? tr('реализм') : tr('аркада')) + (multi ? '' : ' · ' + tr('ранг {0}', [rankOf(p.k || 1)]));
    const role = b.team === 'pvo' ? [ico('radar'), tr('ПВО')] : multi ? [ico('players'), tr('волна')] : [ico('fire'), tr('лётчик')];
    const res = b.draw ? tr('ничья') : b.win ? tr('победа') : tr('поражение');
    const chips = [];
    if (p.m && p.m !== 1) chips.push(tr('аркада ×{0}', [kf(p.m)]));
    if (p.k && p.k !== 1) chips.push(tr('ранг {0} +{1} %', [rankOf(p.k), Math.round((p.k - 1) * 100)]));
    if (p.b && p.b !== 1) chips.push(tr('боты ×{0}', [kf(p.b)]));
    const why = p.idle ? `<span class="break">${tr('без действий — 0')}</span>` : `<span class="break">${p.r || 0} + ${p.c || 0} + ${p.s || 0}</span>${chips.length ? '<br>' + chips.map((c) => `<span class="k">${esc(c)}</span>`).join('') : ''}`;
    return `<tr${b.counted ? '' : ' class="off"'}><td>${when(b.at)}<br><span class="note">${esc(mode)}</span></td><td class="nw">${role[0]} ${role[1]}</td><td class="nw">${res}</td><td>${why}</td><td class="n"><b>${nf(b.rating || 0)}</b></td>`
      + `<td class="nw">${b.counted ? `<span class="ok">${ico('ok')} ${tr('засчитан')}</span>` : tr('не засчитан')}</td></tr>`;
  }
  function viewMine() {
    const d = S.data, m = d.me || { battles: [], n: 0, points: 0 }, list = m.battles || [];
    const body = list.length ? `<div class="battles"><table><thead><tr><th>${tr('Бой')}</th><th>${tr('Роль')}</th><th>${tr('Итог')}</th><th>${tr('Из чего очки')}</th><th class="n">${tr('Очки')}</th><th>${tr('В рейтинге')}</th></tr></thead><tbody>${list.map(battleRow).join('')}</tbody></table></div>`
      : `<div class="msg"><span>${tr('В этом сезоне боёв пока нет.')}</span></div>`;
    return `<div class="win wide">${head(`${ico('rating')}${tr('Мои бои · сезон {0}', [d.season])}`, tr('засчитано {0} из {1} · сумма {2}', [m.n || 0, SLOTS, nf(m.points || 0)]), true)}${body}</div>`;
  }
  function draw() {
    const sc = root.querySelector && root.querySelector('.rows'), top = sc ? sc.scrollTop || 0 : 0;
    root.innerHTML = !S.data ? noData() : S.view === 'mine' && mine() ? viewMine() : viewList();
    if (S.view !== 'mine') { const r = root.querySelector && root.querySelector('.rows'); if (r && top) r.scrollTop = top; }
  }

  root.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest('[data-a]');
    if (!t) { if (e.target === root) api.close(); return; } // тап мимо окна
    const a = t.dataset.a;
    if (a === 'close') api.close();
    else if (a === 'help') { S.q = !S.q; if (S.q) markSeen(); draw(); }
    else if (a === 'helpx') { S.q = false; draw(); }
    else if (a === 'mine') { S.view = 'mine'; draw(); }
    else if (a === 'back') { S.view = 'list'; draw(); }
    else if (a === 'retry') { S.at = 0; draw(); load(); }
    else if (a === 'login' || a === 'xfer') { if (C.account) C.account.open(a); }
  });
  addEventListener('keydown', (e) => { if (e.code === 'Escape' && root.classList.contains('on') && !(C.account && C.account.isOpen())) { if (S.q) { S.q = false; draw(); } else api.close(); } });

  const api = {
    open() {
      S.view = 'list'; S.q = false; root.classList.add('on'); draw();
      const f = root.querySelector && root.querySelector('.rx'); if (f && f.focus && !(typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches)) try { f.focus(); } catch (_) { /* нет */ }
      if (!S.busy && Date.now() - S.at > 10000) { S.at = 0; load(); } // открыли окно — свежие данные
    },
    close() { root.classList.remove('on'); S.q = false; },
    isOpen: () => root.classList.contains('on'),
    // свежие данные после засчитанного боя (табло итога, endscr.js): { place, prev — место до боя, n — засчитано, counted — засчитан ли бой в сезон } или null
    async fresh() {
      const m0 = mine(), prev = m0 ? m0.place : null;
      for (let i = 0; i < 30 && S.busy; i++) await new Promise((r) => setTimeout(r, 100));
      S.at = 0; await load(); const m = mine(); if (!m) return null;
      const b0 = (m.battles || [])[0];
      return { place: m.place, prev, n: m.n, counted: b0 ? !!b0.counted : true };
    },
    touch, paint,
    // сменился аккаунт / засчитан бой: данные устарели
    reset() { if (S.key !== keyNow()) S.data = null; S.at = 0; paint(); if (root.classList.contains('on')) { draw(); load(); } else touch(); },
  };
  return api;
}
