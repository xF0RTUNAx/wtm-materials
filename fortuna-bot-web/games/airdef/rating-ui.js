// Рейтинг онлайна «Воздушного превосходства» (Mark 2026-10-25): кнопка в меню (#ratBtn, верхняя в #mbtns), окно рейтинга (макет «Б» без пьедестала:
// место, игрок, очки; внизу своя карточка с 7 ячейками и «Мои бои») и вид «Мои бои» (все онлайн-бои сезона: засчитан или нет, разбор очков).
// Данные — функция get-airdef-rating (account.js; без сервера и без ?rmock=1 — «Рейтинг скоро откроется»). Формула очков — rating.js.
// В таблице — только аккаунты игры; аккаунту сайта и гостю вместо своей карточки — вход / перенос прогресса (account-ui.js).
// Профиль игрока (Mark 2026-10-28, макет tools/airdef-ui/profile-mock.html): нажатие на строку таблицы (свой — на свой ник в карточке) — профиль
// в том же окне, «Назад» — к таблице. Данные — get-airdef-profile по нику (sql/029): шапка, онлайн по режимам (сезон / всё время), любимые
// самолёт и ЗРК, лучшие бои сезона без разбора, места за сезоны. В горизонтали телефона — две колонки, каждая листается сама.
/* global CONFIG */
import { ico } from './icons.js?v=20261028a';
import { tr, trIf, LANG } from './i18n.js?v=20261028a';
import { activeAcc, rating as fetchRating, profile as fetchProfile, transferOk } from './account.js?v=20261028a';
import { NODE } from './progress.js?v=20261028a';

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
/* строка таблицы — кнопка: профиль игрока (стрелка справа — подсказка, Mark 2026-10-28) */
#ratWin button.row { width: 100%; grid-template-columns: 40px 1fr auto 12px; border: 0; border-bottom: 1px solid #1d2419; background: none; color: inherit; font: inherit; font-size: 14.5px; text-align: left; cursor: pointer; }
#ratWin button.row:hover { background: #171d14; } #ratWin button.row.me:hover { background: #33331c; } #ratWin .row .go { width: 10px; height: 10px; color: #5d6a52; }
#ratWin .mecard .nk.lnk { background: none; border: 0; padding: 0; color: inherit; font: inherit; text-align: left; cursor: pointer; } #ratWin .mecard .nk.lnk u { text-decoration: underline dotted #6b7363; text-underline-offset: 3px; }
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
/* профиль игрока */
#ratWin .win.prof { width: min(540px, 100%); }
#ratWin .pbody { flex: 1 1 auto; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; display: block; }
#ratWin .pbody .col { display: grid; align-content: start; min-width: 0; }
#ratWin .hero { padding: 14px 12px; display: grid; grid-template-columns: 56px minmax(0, 1fr) auto; gap: 2px 12px; align-items: center; }
#ratWin .ava { width: 56px; height: 56px; grid-row: span 2; display: grid; place-items: center; font: 600 21px 'Oswald', sans-serif; background: #2c3526; border: 1px solid #4b5640; }
#ratWin .hero.g1 .ava { border-color: #f5d06a; color: #f5d06a; } #ratWin .hero.g2 .ava { border-color: #dadcd2; } #ratWin .hero.g3 .ava { border-color: #d29a62; }
#ratWin .hero .nick { font: 500 24px/1.15 'Oswald', sans-serif; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; align-self: end; min-width: 0; }
#ratWin .hero .since { font-size: 13px; color: var(--dim); align-self: start; }
#ratWin .place { grid-row: span 2; display: grid; justify-items: end; gap: 3px; text-align: right; }
#ratWin .place .lb { font-size: 12px; color: var(--dim); line-height: 1; }
#ratWin .place .pn { font: 600 34px/1 'Oswald', sans-serif; color: var(--amber2); display: flex; align-items: center; gap: 6px; } #ratWin .place .pn .ic { width: 22px; height: 22px; }
#ratWin .hero.g1 .pn { color: #f5d06a; } #ratWin .hero.g2 .pn { color: #dadcd2; } #ratWin .hero.g3 .pn { color: #d29a62; }
#ratWin .place .pts { font: 600 13.5px 'JetBrains Mono', monospace; } #ratWin .place .slots i { width: 12px; }
#ratWin .hero .mine { grid-column: 1 / -1; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding-top: 10px; } #ratWin .hero .mine small { color: var(--dim); font-size: 12.5px; }
#ratWin .sec { padding: 12px; border-top: 1px solid var(--line); display: grid; gap: 10px; min-width: 0; }
#ratWin .sh { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; } #ratWin .sh b { font: 500 16px 'Oswald', sans-serif; } #ratWin .sh small { font-size: 12.5px; color: var(--dim); }
#ratWin .seg { display: inline-flex; border: 1px solid #4a5443; } #ratWin .seg button { font: 500 12.5px 'Golos Text', sans-serif; padding: 3px 9px; background: none; border: 0; cursor: pointer; color: var(--dim); }
#ratWin .seg button[aria-pressed="true"] { background: #2a2a17; color: var(--amber2); }
#ratWin table.mt { min-width: 0; font-size: 14px; } #ratWin .mt th { position: static; background: none; text-align: right; font-size: 12px; padding: 0 0 5px 6px; } #ratWin .mt th:first-child { text-align: left; padding-left: 0; }
#ratWin .mt td { padding: 7px 0 7px 6px; text-align: right; font: 600 14px 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums; white-space: nowrap; }
#ratWin .mt td:first-child { text-align: left; padding-left: 0; font: 500 14px 'Golos Text', sans-serif; white-space: normal; } #ratWin .mt td:first-child .ic { color: var(--amber2); margin-right: 5px; }
#ratWin .mt td small { display: block; font: 500 11px 'JetBrains Mono', monospace; color: var(--dim); margin-top: 2px; }
#ratWin .mt .wbar { display: block; width: 44px; height: 3px; background: #2a3224; margin: 4px 0 0 auto; } #ratWin .mt .wbar i { display: block; height: 100%; background: var(--amber); }
#ratWin .mt tfoot td { color: var(--dim); border-bottom: 0; font-size: 13px; }
#ratWin .fav { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; } #ratWin .fv { display: grid; gap: 2px; min-width: 0; }
#ratWin .fv .pic { aspect-ratio: 16 / 9; max-width: 100%; margin-bottom: 4px; border: 1px solid #262e21; background: no-repeat center / contain, radial-gradient(120% 90% at 50% 40%, #1f2819 0%, #12170f 70%); }
#ratWin .fv .fk { font: 500 11.5px 'Golos Text', sans-serif; color: var(--dim); letter-spacing: .06em; text-transform: uppercase; }
#ratWin .fv .fn { font: 600 15px 'Golos Text', sans-serif; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } #ratWin .fv .fc { font: 500 12.5px 'JetBrains Mono', monospace; color: var(--dim); }
#ratWin .br { display: grid; grid-template-columns: 62px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 6px 0; border-bottom: 1px solid #1d2419; } #ratWin .br:last-child { border-bottom: 0; }
#ratWin .br .d { font: 500 12.5px/1.25 'JetBrains Mono', monospace; color: var(--dim); } #ratWin .br .r { min-width: 0; line-height: 1.3; } #ratWin .br .r .ic { color: var(--dim); margin-right: 4px; }
#ratWin .br .r small { display: block; font-size: 12px; color: var(--dim); } #ratWin .br .v { font: 600 14.5px 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums; }
#ratWin .aw { display: flex; flex-wrap: wrap; gap: 6px; } #ratWin .bd { display: grid; grid-template-columns: auto auto; gap: 0 8px; align-items: center; padding: 6px 10px 6px 8px; border: 1px solid #39422f; background: #161b13; }
#ratWin .bd .ic { width: 24px; height: 24px; grid-row: span 2; color: #6b7363; } #ratWin .bd b { font: 500 14px 'Oswald', sans-serif; } #ratWin .bd small { font-size: 12px; color: var(--dim); }
#ratWin .bd.g1 .ic { color: #f5d06a; } #ratWin .bd.g2 .ic { color: #dadcd2; } #ratWin .bd.g3 .ic { color: #d29a62; } #ratWin .bd.t10 .ic { color: var(--amber2); }
#ratWin .empty { font-size: 13.5px; color: var(--dim); }
@media (max-width: 420px) { #ratWin .hero { grid-template-columns: 48px minmax(0, 1fr) auto; gap: 2px 10px; } #ratWin .ava { width: 48px; height: 48px; font-size: 18px; } #ratWin .hero .nick { font-size: 21px; } #ratWin .place .pn { font-size: 30px; }
  #ratWin .mt td, #ratWin .mt th { padding-left: 4px; } #ratWin .mt td:first-child .ic { display: none; } }
/* телефон горизонтально: окно во всю высоту, две колонки — каждая листается сама */
@media (orientation: landscape) and (max-height: 500px) {
  #ratWin .win.prof { width: min(860px, 100%); height: 100%; }
  #ratWin .win.prof .pbody { display: grid; grid-template-columns: 1fr 1fr; overflow: hidden; }
  #ratWin .win.prof .col { min-height: 0; }
  #ratWin .win.prof .col { overflow-y: auto; -webkit-overflow-scrolling: touch; } #ratWin .win.prof .col + .col { border-left: 1px solid var(--line); } #ratWin .win.prof .col > .sec:first-child { border-top: 0; }
  #ratWin .win.prof .hero { grid-template-columns: 44px minmax(0, 1fr) auto; padding: 10px 12px; } #ratWin .win.prof .ava { width: 44px; height: 44px; font-size: 17px; }
  #ratWin .win.prof .hero .nick { font-size: 20px; } #ratWin .win.prof .place .pn { font-size: 28px; }
}
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
  const S = { data: null, err: '', key: null, at: 0, busy: false, view: 'list', q: false, p: null, per: 'season', listTop: 0 }; // view: list | mine | prof (профиль S.p), per — период профиля
  const $ = (id) => document.getElementById(id);
  const seen = () => { try { return localStorage.getItem(HELP_KEY) === '1'; } catch (_) { return false; } };
  const markSeen = () => { try { localStorage.setItem(HELP_KEY, '1'); } catch (_) { /* приватный режим */ } };

  const daysLeft = (d) => { const e = Date.parse(d.ends_at); return isNaN(e) ? null : Math.max(1, Math.ceil((e - Date.now()) / 86400000)); };
  // межсезонье (sql/027, неделя между сезонами): сервер показывает итоги прошедшего сезона, next — когда начнётся следующий
  const seasonText = (d) => {
    if (d.next) { const s = Date.parse(d.next.starts_at), n = isNaN(s) ? null : Math.max(1, Math.ceil((s - Date.now()) / 86400000)); return n == null ? tr('сезон {0} завершён', [d.season]) : tr('сезон {0} завершён · сезон {1} через {2} дн.', [d.season, d.next.season, n]); }
    const n = daysLeft(d); return n == null ? tr('сезон {0}', [d.season]) : tr('сезон {0} · ещё {1} дн.', [d.season, n]);
  };
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
    catch (e) { err = e.status === 404 || (e.status === 0 && !e.offline && typeof CONFIG !== 'undefined') ? 'soon' : trIf(e.message) || tr('Нет связи с сайтом'); } // функции рейтинга ещё нет на сервере (404 или ответ без CORS) — «скоро откроется»
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
    tr('Чем больше ботов среди соперников, тем меньше очков.'), tr('Итог сезона — 7 боёв: по 2 лучших за ПВО, за лётчика и в Мульти-волне и ещё 1 лучший из остальных.'), tr('Между сезонами — неделя межсезонья: бои в рейтинг не идут.'), tr('Своя комната не считается. Вышли из боя раньше — 0.')];
  function noData() {
    const soon = S.err === 'soon';
    return `<div class="win">${head(`${ico('rating')}${tr('Рейтинг')}`, '')}<div class="msg">${S.busy || !S.err ? `<span>${tr('Загружаем…')}</span>` : soon ? `<b>${tr('Рейтинг скоро откроется')}</b><span>${tr('Таблица сезона появится, как только сервер рейтинга заработает.')}</span>`
      : `<b>${tr('Нет связи с сайтом')}</b><span>${esc(S.err)}</span><button class="btnm" data-a="retry">${tr('Повторить')}</button>`}</div></div>`;
  }
  function viewList() {
    const d = S.data, m = mine(), acc = activeAcc();
    const title = `${ico('rating')}${tr('Рейтинг')}<button class="qbtn${seen() ? ' seen' : ''}" data-a="help" aria-expanded="${S.q}" title="${tr('Как начисляются очки')}">?</button>`;
    const pop = S.q ? `<div class="qpop"><div class="qh"><b>${tr('Как начисляются очки')}</b><button class="rx" data-a="helpx" aria-label="${tr('Закрыть')}">${ico('close')}</button></div><ul>${HELP.map((h) => `<li>${h}</li>`).join('')}</ul></div>` : '';
    const rows = d.top.map((r, i) => `<button type="button" class="row${r.place <= 3 ? ' g' + r.place : ''}${m && m.place === r.place ? ' me' : ''}" data-a="prof" data-i="${i}"><span class="p">${r.place}</span><span class="who"><span class="av">${esc(initials(r.nick))}</span><span>${esc(r.nick)}</span></span><span class="v">${nf(r.points)}</span>${ico('tri', 'go')}</button>`).join('')
      + (d.total > d.top.length ? '<div class="row gap">…</div>' : '') + (d.top.length ? '' : `<div class="msg"><span>${tr('В этом сезоне ещё нет результатов.')}</span></div>`);
    let card;
    if (acc && acc.kind === 'airdef') {
      const me = d.me || { nick: acc.nick, place: null, points: 0, n: 0 };
      card = `<div class="mecard"><span class="big">${me.place || '—'}</span><button type="button" class="nk lnk" data-a="profme" title="${tr('Профиль')}"><u>${esc(me.nick || acc.nick)}</u> · <b class="num">${nf(me.points || 0)}</b></button><button class="btnm" data-a="mine">${tr('Мои бои')}</button>
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
  // ── профиль игрока (get-airdef-profile, sql/029): по нику, кэш на минуту ──
  const PROF = new Map(); // ник (строчными) + сезон → { data, at }
  const pkey = (nick, season) => String(nick).toLowerCase() + '|' + season;
  async function openProfile(nick, own) {
    const season = S.data ? S.data.season : 0;
    S.view = 'prof'; S.p = { nick, own: !!own, season, data: null, err: '', busy: true };
    const c = PROF.get(pkey(nick, season));
    if (c && Date.now() - c.at < FRESH) { S.p.data = c.data; S.p.busy = false; draw(); return; }
    draw();
    const p = S.p;
    try { const d = await fetchProfile(nick, season); p.data = d; PROF.set(pkey(nick, season), { data: d, at: Date.now() }); }
    catch (e) { p.err = e.status === 404 ? tr('Игрок не найден') : e.status === 0 && !e.offline && typeof CONFIG !== 'undefined' ? 'soon' : trIf(e.message) || tr('Нет связи с сайтом'); } // функции ещё нет на сервере (ответ без CORS) — «скоро»
    p.busy = false;
    if (S.p === p && S.view === 'prof' && root.classList.contains('on')) draw();
  }
  const MODE_ROWS = [['air', 'fire', tr('Вылет')], ['pvo', 'radar', tr('Оборона')], ['multi', 'players', tr('Мульти-волна')]];
  const thumbOf = (branch, key) => (NODE[branch + ':' + key] ? `airdef/thumbs/${branch}_${key}.webp?v=20261028a` : '');
  const unitName = (branch, key) => { const n = NODE[branch + ':' + key]; return n ? trIf(n.name) : key; };
  const ddmm = (at, year) => { const d = new Date(at); return isNaN(d) ? '' : `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}${year ? '.' + d.getFullYear() : ''}`; };
  const hhmm = (at) => { const d = new Date(at); return isNaN(d) ? '' : `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
  function profParts(P, season, own) {
    const per = S.per === 'all' ? 'all' : 'season', g = P.place && P.place <= 3 ? ' g' + P.place : '';
    const hero = `<div class="hero${g}"><span class="ava">${esc(initials(P.nick))}</span><span class="nick">${esc(P.nick)}</span>
      <span class="place"><span class="lb">${tr('место')}</span><span class="pn">${P.place && P.place <= 3 ? ico('rating') : ''}${P.place || '—'}</span><span class="pts">${nf(P.points || 0)}</span><span class="slots">${Array.from({ length: SLOTS }, (_, i) => `<i${i < (P.n || 0) ? ' class="on"' : ''}></i>`).join('')}</span></span>
      <span class="since">${tr('в игре с {0}', [ddmm(P.since, true)])}<br>${tr('онлайн-боёв: {0}', [nf(P.games || 0)])}</span>
      ${own ? `<span class="mine"><button class="btnm" data-a="mine">${tr('Мои бои')}</button><small>${tr('Так ваш профиль видят другие игроки')}</small></span>` : ''}</div>`;
    const M = (P.modes && P.modes[per]) || {}, tot = [0, 0, 0, null];
    const mrow = ([k, ic, name]) => {
      const x = M[k] || { n: 0, w: 0, k: 0, best: null }, pc = x.n ? Math.round(100 * x.w / x.n) : 0;
      tot[0] += x.n; tot[1] += x.w; tot[2] += x.k || 0; if (x.best != null) tot[3] = Math.max(tot[3] ?? 0, x.best);
      return `<tr><td>${ico(ic)}${name}</td><td>${x.n}</td><td>${x.w}<small>${pc} %</small><span class="wbar"><i style="width:${pc}%"></i></span></td><td>${x.k || 0}</td><td>${x.best != null ? nf(x.best) : '—'}</td></tr>`;
    };
    const body = MODE_ROWS.map(mrow).join('');
    const modes = `<div class="sec"><div class="sh"><b>${tr('По режимам')}</b><span class="seg" role="group"><button type="button" data-a="per" data-per="season" aria-pressed="${per === 'season'}">${tr('Сезон {0}', [season])}</button><button type="button" data-a="per" data-per="all" aria-pressed="${per === 'all'}">${tr('Всё время')}</button></span></div>
      <table class="mt"><thead><tr><th>${tr('Онлайн')}</th><th>${tr('Боёв')}</th><th>${tr('Побед')}</th><th title="${tr('Лётчик — уничтоженные ЗРК, ПВО — сбитые, Мульти-волна — всё поражённое')}">${tr('Поражено')}</th><th>${tr('Лучший')}</th></tr></thead>
      <tbody>${body}</tbody><tfoot><tr><td>${tr('Всего')}</td><td>${tot[0]}</td><td>${tot[1]}</td><td>${tot[2]}</td><td>${tot[3] != null ? nf(tot[3]) : '—'}</td></tr></tfoot></table></div>`;
    const F = (P.fav && P.fav[per]) || {};
    const fv = (x, branch, label, cnt) => (x ? `<div class="fv"><span class="pic"${thumbOf(branch, x.key) ? ` style="background-image:url('${thumbOf(branch, x.key)}')"` : ''}></span><span class="fk">${label}</span><span class="fn">${esc(unitName(branch, x.key))}</span><span class="fc">${cnt(x.n, x.of)}</span></div>` : '');
    const favs = fv(F.plane, 'air', tr('Самолёт'), (n, of) => tr('вылетов: {0} из {1}', [n, of])) + fv(F.sam, 'pvo', tr('ЗРК'), (n, of) => tr('боёв: {0} из {1}', [n, of]));
    const fav = `<div class="sec"><div class="sh"><b>${tr('Любимое')}</b><small>${per === 'season' ? tr('за сезон') : tr('за всё время')}</small></div>${favs ? `<div class="fav">${favs}</div>` : `<span class="empty">${tr('Появится после онлайн-боёв.')}</span>`}</div>`;
    const ROLE = { air: ['fire', tr('лётчик')], pvo: ['radar', tr('ПВО')], multi: ['players', tr('волна')] };
    const bl = (P.best || []).map((b) => { const r = ROLE[b.kind] || ROLE.air, res = b.draw ? tr('ничья') : b.win ? tr('победа') : tr('поражение');
      const md = (b.kind === 'multi' ? tr('Мульти-волна') : tr('Вылет и оборона')) + ' · ' + (b.mode === 'real' ? tr('реализм') : tr('аркада')) + (b.kind === 'multi' ? '' : ' · ' + tr('ранг {0}', [rankOf(b.k || 1)]));
      return `<div class="br"><span class="d">${ddmm(b.at)}<br>${hhmm(b.at)}</span><span class="r">${ico(r[0])}${r[1]} · ${res}<small>${esc(md)}</small></span><span class="v">${nf(b.rating || 0)}</span></div>`; }).join('');
    const best = `<div class="sec"><div class="sh"><b>${tr('Лучшие бои сезона')}</b><small>${tr('засчитано {0} из {1} · сумма {2}', [P.n || 0, SLOTS, nf(P.points || 0)])}</small></div>${bl ? `<div class="bl">${bl}</div>` : `<span class="empty">${tr('В этом сезоне боёв пока нет.')}</span>`}</div>`;
    const aw = (P.awards || []).map((a) => { const c = a.place <= 3 ? 'g' + a.place : a.place <= 10 ? 't10' : 'pl';
      return `<span class="bd ${c}">${ico(a.place <= 3 ? 'rating' : a.place <= 10 ? 'star' : 'ok')}<b>${tr('Сезон {0}', [a.season])}</b><small>${tr('{0} место', [a.place])}</small></span>`; }).join('');
    const awards = `<div class="sec"><div class="sh"><b>${tr('Награды')}</b><small>${tr('места за сезоны')}</small></div>${aw ? `<div class="aw">${aw}</div>` : `<span class="empty">${tr('Наград пока нет. Место за сезон появляется после его конца.')}</span>`}</div>`;
    return { hero, modes, fav, best, awards };
  }
  function viewProfile() {
    const p = S.p, d = p.data, head = (s) => `<div class="whead"><button class="back" data-a="back">${ico('triL')}${tr('Назад')}</button><span class="t">${ico('rating')}${tr('Профиль')}</span><span class="s">${s}</span><button class="rx" data-a="close" aria-label="${tr('Закрыть')}" title="${tr('Закрыть')}">${ico('close')}</button></div>`;
    if (!d) {
      const msg = p.busy ? `<span>${tr('Загружаем…')}</span>` : p.err === 'soon' ? `<b>${tr('Профили скоро откроются')}</b><span>${tr('Профиль появится, как только сервер рейтинга обновится.')}</span>`
        : `<b>${esc(p.err)}</b><button class="btnm" data-a="pretry">${tr('Повторить')}</button>`;
      return `<div class="win prof">${head('')}<div class="msg">${msg}</div></div>`;
    }
    const x = profParts(d.profile, d.season, p.own);
    return `<div class="win prof">${head(esc(tr('сезон {0}', [d.season])))}<div class="pbody"><div class="col">${x.hero}${x.modes}</div><div class="col">${x.fav}${x.best}${x.awards}</div></div></div>`;
  }
  function draw() {
    const q = (s) => (root.querySelectorAll ? [...root.querySelectorAll(s)] : []);
    const sc = q('.rows')[0]; if (sc) S.listTop = sc.scrollTop || 0; // таблица: место прокрутки — и после профиля («Назад»)
    const pv = S.view === 'prof' && S.p ? q('.pbody, .pbody .col').map((el) => el.scrollTop || 0) : null, pnick = S.p && S.p.nick; // профиль: прокрутка — при смене «Сезон / Всё время»
    root.innerHTML = !S.data ? noData() : S.view === 'prof' && S.p ? viewProfile() : S.view === 'mine' && mine() ? viewMine() : viewList();
    if (S.view === 'list') { const r = q('.rows')[0]; if (r && S.listTop) r.scrollTop = S.listTop; }
    if (pv && S.view === 'prof' && S.p && S.p.nick === pnick) q('.pbody, .pbody .col').forEach((el, i) => { if (pv[i]) el.scrollTop = pv[i]; });
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
    else if (a === 'prof') { // строка таблицы: свой ник — свой профиль (с «Моими боями»)
      const r = S.data && S.data.top[+t.dataset.i]; if (!r) return;
      const m = mine(); openProfile(r.nick, !!(m && m.nick && String(m.nick).toLowerCase() === String(r.nick).toLowerCase()));
    }
    else if (a === 'profme') { const m = mine(), acc = activeAcc(), nk = (m && m.nick) || (acc && acc.nick); if (nk) openProfile(nk, true); }
    else if (a === 'per') { S.per = t.dataset.per === 'all' ? 'all' : 'season'; draw(); }
    else if (a === 'pretry') { if (S.p) openProfile(S.p.nick, S.p.own); }
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
