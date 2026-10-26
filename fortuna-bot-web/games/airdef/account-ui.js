// Аккаунт игры «Воздушного превосходства» (Mark 2026-10-25): строка в левом верхнем углу меню (ник или «Войти в аккаунт игры», ниже —
// «Перенести прогресс», только если это касается) и модальное окно: «Вход» / «Регистрация» / «Перенос с сайта»; у вошедшего — ник, смена ника
// (раз в сезон), «Выйти». Запросы и хранилище — account.js (функция airdef-account). Без аккаунта игры в рейтинг не попасть;
// новичку аккаунт сайта в игре не нужен (только аккаунт игры), «старому» игроку с прогрессом он работает до переноса, но без рейтинга.
// В комнате и в бою аккаунт сменить нельзя; вне их смена закрывает соединение онлайна (net.js accChanged).
import { ico } from './icons.js?v=20261026c';
import { tr, trIf } from './i18n.js?v=20261026c';
import { gameAcc, siteAcc, setGameAcc, clearGameAcc, accountApi, siteStatus, siteStatusDone, transferOk, siteNewbie, legacySite, onAccChange } from './account.js?v=20261026c';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const LOGIN_RE = /^[a-zA-Z0-9_]{3,24}$/, NICK_RE = /^[\p{L}\p{N}_\- ]{3,16}$/u;
const cleanNick = (v) => String(v || '').trim().replace(/\s+/g, ' ');

const CSS = `
button[data-accopen] { margin: 0 0 0 6px; border: 1px solid #4a5443; border-radius: 0; background: rgba(16,20,15,.88); color: #e9e6dc; font: 500 12px 'Golos Text', -apple-system, sans-serif; padding: 3px 9px; cursor: pointer; } button[data-accopen]:hover { background: #222a1f; }
#accWin { position: fixed; inset: 0; z-index: 71; display: none; align-items: center; justify-content: center; box-sizing: border-box; background: rgba(8,11,7,.72); color: #e9e6dc; font: 400 14px/1.45 'Golos Text', -apple-system, sans-serif;
  padding: calc(12px + var(--sa-t, 0px) + var(--tg-t, 0px)) max(12px, var(--sa-r, 0px)) max(12px, var(--sa-b, 0px)) max(12px, var(--sa-l, 0px)); --line: #2f3828; --dim: #a9b09b; --amber: #e8b04a; --amber2: #f3c96f; }
#accWin.on { display: flex; }
#accWin .ic { width: 1em; height: 1em; fill: currentColor; flex: none; display: inline-block; vertical-align: -0.15em; }
#accWin .win { width: min(420px, 100%); max-height: 100%; min-width: 0; display: flex; flex-direction: column; background: #10140f; border: 1px solid #39422f; }
#accWin .whead { flex: none; display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--line); }
#accWin .whead .t { display: flex; align-items: center; gap: 8px; font: 500 18px 'Oswald', 'Arial Narrow', sans-serif; flex: 1; min-width: 0; } #accWin .whead .t .ic { width: 22px; height: 22px; color: var(--amber2); }
#accWin .rx { flex: none; width: 28px; height: 28px; padding: 5px; border: 1px solid #4a5443; background: none; color: #e9e6dc; cursor: pointer; } #accWin .rx:hover { background: #222a1f; } #accWin .rx .ic { width: 100%; height: 100%; vertical-align: top; }
#accWin button:focus-visible, #accWin input:focus-visible { outline: 2px solid var(--amber2); outline-offset: 2px; }
#accWin .tabs { flex: none; display: flex; flex-wrap: wrap; border-bottom: 1px solid var(--line); }
#accWin .tabs button { border: 0; border-bottom: 2px solid transparent; background: none; color: var(--dim); padding: 9px 13px; font: 500 14px 'Golos Text', sans-serif; cursor: pointer; } #accWin .tabs button:hover { color: #e9e6dc; }
#accWin .tabs button.on { color: #e9e6dc; border-bottom-color: var(--amber); }
#accWin .body { flex: 1 1 auto; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 12px; display: grid; gap: 10px; align-content: start; }
#accWin .frm { display: grid; gap: 10px; margin: 0; }
#accWin .fld { display: grid; gap: 3px; min-width: 0; } #accWin .fld > span { font: 500 13px 'Golos Text', sans-serif; color: var(--dim); } #accWin .fld small { color: #8f9884; font-size: 12px; }
#accWin input { width: 100%; box-sizing: border-box; border-radius: 0; background: #161c13; border: 1px solid #4a5443; color: #e9e6dc; padding: 8px 10px; font: 400 15px 'Golos Text', sans-serif; } #accWin input:focus { border-color: var(--amber); outline: none; }
#accWin .btn { border: 0; border-radius: 0; background: var(--amber); color: #17190f; font: 500 14px 'Golos Text', sans-serif; padding: 10px 14px; cursor: pointer; } #accWin .btn:hover { background: var(--amber2); } #accWin .btn:disabled { background: #2c3426; color: #8f9884; cursor: default; }
#accWin .btn.alt { background: none; color: #e9e6dc; border: 1px solid #4a5443; } #accWin .btn.alt:hover { background: #222a1f; }
#accWin .row { display: flex; gap: 8px; flex-wrap: wrap; } #accWin .row .btn { flex: 1 1 auto; }
#accWin .amsg { font-size: 13.5px; } #accWin .amsg:empty { display: none; } #accWin .amsg.err { color: #f08a7f; } #accWin .amsg.ok { color: #7fd38f; }
#accWin p { margin: 0; color: #c9cebd; font-size: 13.5px; } #accWin .step { color: var(--amber2); font-size: 13px; }
#accWin .lock { color: #f0b86f; } #accWin button:disabled { cursor: default; opacity: .55; }
#accWin .seg { display: flex; } #accWin .seg button { flex: 1 1 0; border: 1px solid #4a5443; border-radius: 0; background: none; color: var(--dim); padding: 7px 8px; font: 500 14px 'Golos Text', sans-serif; cursor: pointer; } #accWin .seg button + button { border-left: 0; }
#accWin .seg button.on { background: #2c3426; color: #e9e6dc; box-shadow: inset 0 -2px 0 var(--amber); } #accWin .seg button:hover:not(.on) { color: #e9e6dc; }
#accWin .ginfo { color: var(--dim); } #accWin .ginfo b { color: #e9e6dc; font-weight: 500; } #accWin p b { color: #e9e6dc; font-weight: 600; word-break: break-word; }
#accWin .me { display: grid; gap: 2px; } #accWin .me b { font: 500 22px 'Oswald', sans-serif; word-break: break-word; } #accWin .me span { color: var(--dim); font-size: 13px; }
@media (max-height: 460px) { #accWin .whead { padding: 6px 10px; } #accWin .tabs button { padding: 6px 12px; } #accWin .body { padding: 8px 10px; gap: 8px; } #accWin .frm { grid-template-columns: 1fr 1fr; gap: 8px; } #accWin .frm .full { grid-column: 1 / -1; } }
@media (pointer: coarse) { #accWin input { font-size: 16px; } }
#accWin input { -webkit-user-select: text; user-select: text; } #accWin .body { touch-action: pan-y; overscroll-behavior: contain; } /* в игре выделение и жесты выключены — полю ввода и прокрутке окна вернуть */
/* клавиатура телефона открыта (.kb, visualViewport): окно — в видимой части над ней, у верхнего края; на время ввода видны поле, подпись и кнопка */
#accWin.kb { align-items: flex-start; padding: 4px; }
#accWin.kb .tabs, #accWin.kb .body > p:not(.lock), #accWin.kb .fld small, #accWin.kb .ginfo { display: none; }
#accWin.kb .whead { padding: 4px 8px; } #accWin.kb .whead .t { font-size: 15px; } #accWin.kb .body { padding: 6px 8px; gap: 6px; } #accWin.kb .frm { gap: 6px; }
`;

export function createAccount(C) {
  const style = document.createElement('style'); style.textContent = CSS; if (document.head) document.head.appendChild(style); // (заглушка DOM стенда — без head/body)
  const root = document.createElement('div'); root.id = 'accWin'; root.setAttribute && root.setAttribute('role', 'dialog'); root.setAttribute && root.setAttribute('aria-modal', 'true'); if (document.body && document.body.appendChild) document.body.appendChild(root);
  const $ = (id) => document.getElementById(id);
  // tab: login | reg | xfer | acc; xfer — «Перенос с сайта»: без аккаунта игры — перенос в один шаг (сервер создаёт аккаунт игры: migrate), с аккаунтом — в него (transfer);
  // m — ход переноса в один шаг (что сервер попросил добавить: другой пароль, логин, ник; used — с этого аккаунта сайта уже переносили); nickSite — регистрация упёрлась
  // в ник, равный логину аккаунта сайта; f — введённое (в памяти, пока окно открыто)
  const newM = () => ({ pwNew: false, needLogin: false, needNick: false, used: false });
  const S = { tab: 'login', err: '', ok: '', done: '', busy: false, rename: false, pend: false, nickSite: false, m: newM(), f: {} };
  const fv = (k) => esc(S.f[k] || '');

  // в комнате и в бою аккаунт сменить нельзя: соединение онлайна держит место за прежним аккаунтом, итог боя уйдёт ему
  const lock = () => { const N = C.netc; return !!(N && (N.room || N.battle || N.re)); };
  const LOCK_MSG = () => tr('Выйдите из комнаты, чтобы сменить аккаунт');
  const needFree = () => { if (lock()) throw new Error(LOCK_MSG()); };

  // ── что изменилось (вход, выход, перенос, ник; статус сайта): онлайн, прогресс, меню, рейтинг ──
  function changed() {
    if (C.netc && C.netc.accChanged) C.netc.accChanged(); // соединение онлайна — со старым аккаунтом: закрыть, панель «Онлайн» подключится заново
    if (C.progress) C.progress.refresh();
    if (C.rating) C.rating.reset();
    if (C.shop) C.shop.reset();
    if (C.state === 'menu' && C.menu) C.menu.render(); else renderRail();
    if (root.classList.contains('on')) draw();
  }
  onAccChange(changed); // аккаунт сменился сам: пришёл статус сайта («старый» игрок или новичок), сервер ответил «нужен аккаунт игры»

  // ── левый верхний угол меню ──
  function renderRail() {
    const box = $('accBox'), g = gameAcc();
    const p = siteStatus(); if (p && p.then && !S.pend) { S.pend = true; p.then(() => { S.pend = false; renderRail(); if (root.classList.contains('on')) draw(); }); } // «Перенести прогресс» — по ответу сервера
    const h = (g ? `<button data-a="open" title="${tr('Аккаунт игры')}">${ico('players')}<span class="nm">${esc(g.nick || g.login)}</span></button>` : `<button class="in" data-a="open">${tr('Войти в аккаунт игры')}</button>`)
      + (transferOk() ? `<button class="xf" data-a="xfer">${tr('Перенести прогресс')}</button>` : '');
    if (box.innerHTML !== h) box.innerHTML = h;
  }
  $('accBox').onclick = (e) => { const t = e.target.closest && e.target.closest('[data-a]'); if (!t) return; if (C.snd && C.snd.click) C.snd.click(); api.open(t.dataset.a === 'xfer' ? 'xfer' : 'login'); };

  // кнопка «Войти или создать аккаунт» в других местах игры (итог боя, исследования): data-accopen="reg" | "login"
  document.addEventListener('click', (e) => { const t = e.target && e.target.closest && e.target.closest('[data-accopen]'); if (!t) return; if (C.snd && C.snd.click) C.snd.click(); api.open(t.dataset.accopen); });

  // ── окно ──
  function tabs() {
    if (S.done) return []; // экран «Готово» — без вкладок
    const g = gameAcc(), t = g ? [['acc', tr('Аккаунт')]] : [['login', tr('Вход')], ['reg', tr('Регистрация')]];
    if (transferOk() || S.tab === 'xfer') { const x = ['xfer', tr('Перенос с сайта')]; if (g) t.push(x); else t.unshift(x); } // без аккаунта игры перенос — первая вкладка
    return t;
  }
  const fld = (k, label, type, auto, hint, cls = '') => `<label class="fld ${cls}"><span>${label}</span><input data-f="${k}" type="${type}" autocomplete="${auto}" autocapitalize="off" autocorrect="off" spellcheck="false" value="${fv(k)}">${hint ? `<small>${hint}</small>` : ''}</label>`;
  const msg = () => `<div class="amsg${S.err ? ' err' : S.ok ? ' ok' : ''}" role="alert">${esc(S.err || S.ok)}</div>`;
  const newbie = () => (siteNewbie() ? `<p>${tr('У игры свой аккаунт — аккаунт сайта здесь не используется.')}</p>` : '');
  const siteLogin = () => (siteAcc() ? siteAcc().login : (S.f.slogin || '').trim());
  // «В игре: …» — какие логин и ник получит аккаунт игры при переносе в один шаг (логин сайта, пока сервер не попросил другой)
  function migInfo() {
    const sl = siteLogin() || '…', M = S.m, l = M.needLogin ? (S.f.glogin || '').trim() || '…' : sl, n = M.needNick ? cleanNick(S.f.gnick) || '…' : sl;
    return (l === n ? tr('В игре: логин и ник — <b>{0}</b>.', [esc(l)]) : tr('В игре: логин — <b>{0}</b>, ник — <b>{1}</b>.', [esc(l), esc(n)])) + ' ' + tr('Ник можно один раз поменять в этом сезоне.');
  }
  // «Перенести прогресс» под ошибкой регистрации «ник — логин аккаунта сайта»: у «старого» игрока с таким аккаунтом сайта на устройстве, либо аккаунта сайта на устройстве нет (логин введёт сам)
  const ownSiteNick = () => !!siteAcc() && siteAcc().login.toLowerCase() === cleanNick(S.f.nick).toLowerCase(); // ник = логин аккаунта сайта, вошедшего на этом устройстве
  const nickSiteBtn = () => S.nickSite && (ownSiteNick() || !siteAcc()); // ревью: у новичка с тем же логином сайта кнопки не было — тупик
  function xferBody(g) {
    if (S.done) return `<p>${S.done}</p><button class="btn" data-a="close">${tr('Готово')}</button>`;
    if (!g) { // перенос в один шаг: аккаунта игры нет, он создаётся при переносе
      const s = siteAcc(), M = S.m;
      if (M.used) return `${msg()}<div class="row"><button class="btn" data-a="tab-login">${tr('Войти в аккаунт игры')}</button></div>`;
      const intro = s ? tr('Прогресс «Воздушного превосходства» с аккаунта сайта <b>{0}</b> переедет в аккаунт игры. Мини-игры сайта останутся на сайте. Перенос — один раз.', [esc(s.login)])
        : tr('Прогресс «Воздушного превосходства» с вашего аккаунта сайта переедет в аккаунт игры. Мини-игры сайта останутся на сайте. Перенос — один раз.');
      const seg = `<div class="fld full"><span>${tr('Пароль в игре')}</span><div class="seg"><button type="button" data-a="pw-same" class="${M.pwNew ? '' : 'on'}" aria-pressed="${!M.pwNew}">${tr('как на сайте')}</button><button type="button" data-a="pw-new" class="${M.pwNew ? 'on' : ''}" aria-pressed="${M.pwNew}">${tr('другой')}</button></div></div>`;
      return `<p>${intro}</p>${msg()}<form class="frm" data-form="mig" novalidate>${s ? '' : fld('slogin', tr('Логин сайта'), 'text', 'username', '', 'full')}${fld('spass', tr('Пароль сайта'), 'password', 'current-password', '', 'full')}${seg}`
        + (M.pwNew ? fld('npw', tr('Новый пароль для игры'), 'password', 'new-password', tr('от 6 символов'), 'full') : '')
        + (M.needLogin ? fld('glogin', tr('Логин для игры'), 'text', 'off', tr('3–24: латиница, цифры, _'), 'full') : '')
        + (M.needNick ? fld('gnick', tr('Ник для рейтинга'), 'text', 'nickname', tr('3–16: буквы, цифры, пробел, _ и -'), 'full') : '')
        + `<p class="ginfo full">${migInfo()}</p><button class="btn full" type="submit">${tr('Перенести прогресс')}</button></form>`;
    }
    // уже вошёл в аккаунт игры: прогресс сайта — в него
    return `<p>${tr('Перенести прогресс сайта в этот аккаунт ({0})', [`<b>${esc(g.nick || g.login)}</b>`])}</p><p>${tr('Перенесутся опыт, серебро, исследования, покупки и онлайн-бои «Воздушного превосходства». Мини-игры сайта останутся на аккаунте сайта. Перенос — один раз.')}</p>`
      + `<form class="frm" data-form="xfer" novalidate>${fld('slogin', tr('Логин сайта'), 'text', 'off', '')}${fld('spass', tr('Пароль сайта'), 'password', 'off', '')}${fld('gpass', tr('Пароль аккаунта игры'), 'password', 'current-password', tr('тот, которым вы входите в игру'), 'full')}<button class="btn full" type="submit">${tr('Перенести прогресс')}</button></form>${msg()}`;
  }
  function body() {
    const g = gameAcc();
    if (S.tab === 'login') return `<form class="frm" data-form="login" novalidate>${fld('login', tr('Логин'), 'text', 'username', '', 'full')}${fld('pass', tr('Пароль'), 'password', 'current-password', '', 'full')}<button class="btn full" type="submit">${tr('Войти')}</button></form>${msg()}`;
    if (S.tab === 'reg') return `${newbie()}<form class="frm" data-form="reg" novalidate>${fld('login', tr('Логин'), 'text', 'username', tr('3–24: латиница, цифры, _'))}${fld('pass', tr('Пароль'), 'password', 'new-password', tr('от 6 символов'))}${fld('nick', tr('Ник для рейтинга'), 'text', 'nickname', tr('3–16: буквы, цифры, пробел, _ и -'), 'full')}<button class="btn full" type="submit">${tr('Создать аккаунт')}</button></form>${msg()}${nickSiteBtn() ? `<div class="row"><button class="btn alt" data-a="goxfer">${legacySite() || !siteAcc() ? tr('Перенести прогресс') : tr('Взять ник — войти паролем сайта')}</button></div>` : ''}`;
    if (S.tab === 'xfer') return xferBody(g);
    // acc: вошёл
    const me = `<div class="me"><b>${esc(g.nick || g.login)}</b><span>${tr('Логин: {0}', [esc(g.login)])}</span></div>`;
    if (S.rename) return `${me}<form class="frm" data-form="rename" novalidate>${fld('newnick', tr('Новый ник'), 'text', 'nickname', tr('3–16: буквы, цифры, пробел, _ и -'), 'full')}${fld('npass', tr('Пароль аккаунта игры'), 'password', 'current-password', '', 'full')}<button class="btn" type="submit">${tr('Сохранить')}</button><button class="btn alt" type="button" data-a="rename-no">${tr('Отмена')}</button></form>${msg()}`;
    return `${me}<div class="row"><button class="btn alt" data-a="rename">${tr('Сменить ник')}</button><button class="btn alt" data-a="logout">${tr('Выйти из аккаунта')}</button></div><p>${tr('Ник виден в рейтинге и в онлайн-боях. Меняется раз в сезон.')}</p>${msg()}`;
  }
  function draw() {
    if (!S.done && !tabs().some(([k]) => k === S.tab)) S.tab = gameAcc() ? 'acc' : 'login';
    root.innerHTML = `<div class="win"><div class="whead"><span class="t">${ico('players')}${tr('Аккаунт игры')}</span><button class="rx" data-a="close" aria-label="${tr('Закрыть')}" title="${tr('Закрыть')}">${ico('close')}</button></div>
      ${S.done ? '' : `<div class="tabs">${tabs().map(([k, l]) => `<button data-a="tab-${k}" class="${k === S.tab ? 'on' : ''}">${l}</button>`).join('')}</div>`}<div class="body">${lock() && !S.rename && !S.done ? `<p class="lock">${LOCK_MSG()}</p>` : ''}${body()}</div></div>`;
    applyLock();
    // клавиша ввода на телефоне: «Далее» — к следующему полю, на последнем — «Готово» (отправить форму)
    if (root.querySelectorAll) root.querySelectorAll('form').forEach((f) => { const ins = f.querySelectorAll('input'); ins.forEach((x, i) => x.setAttribute('enterkeyhint', i < ins.length - 1 ? 'next' : 'go')); });
  }
  // кнопки смены аккаунта (вход, регистрация, перенос, выход) — недоступны в комнате и в бою; смена ника остаётся
  function applyLock() {
    if (!lock() || !root.querySelectorAll) return;
    root.querySelectorAll('form[data-form="login"] button, form[data-form="reg"] button, form[data-form="xfer"] button, form[data-form="mig"] button, [data-a="logout"]').forEach((b) => { b.disabled = true; b.title = LOCK_MSG(); });
  }
  const setMsg = (err, ok) => { S.err = err || ''; S.ok = ok || ''; const m = root.querySelector && root.querySelector('.amsg'); if (m) { m.className = 'amsg' + (S.err ? ' err' : S.ok ? ' ok' : ''); m.textContent = S.err || S.ok; if (S.err && m.scrollIntoView) try { m.scrollIntoView({ block: 'nearest' }); } catch (_) { /* нет */ } } };
  const busy = (on) => { S.busy = on; const b = root.querySelector && root.querySelector('button[type=submit]'); if (b) b.disabled = on || (lock() && b.closest && !b.closest('form[data-form="rename"]')); };

  // ── действия ──
  async function run(fn) {
    if (S.busy) return; S.nickSite = false; setMsg(); busy(true);
    try { await fn(); } catch (e) { setMsg(trIf(e.message) || tr('Ошибка сервера')); }
    busy(false);
  }
  const focusF = (k) => { const f = root.querySelector && root.querySelector(`[data-f="${k}"]`); if (f && f.focus && !(typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches)) try { f.focus(); } catch (_) { /* нет */ } };
  const needLogin = () => { if (!LOGIN_RE.test((S.f.login || '').trim())) throw new Error(tr('Неверный логин или пароль')); };
  function entered(acc, pw) { // вошёл или зарегистрировался
    setGameAcc(acc); S.f.gpass = pw; S.f.pass = ''; changed(); api.close();
  }
  // «Готово» после переноса: что именно переехало (moved — ответ сервера); inNew — аккаунт игры создан переносом, нужен совет, как входить
  function doneText(g, m, inNew, same) {
    const parts = [m.progress ? tr('опыт и серебро, исследования') : '', m.runs ? tr('одиночных боёв — {0}', [m.runs]) : '', m.online ? tr('онлайн-боёв — {0}', [m.online]) : ''].filter(Boolean);
    const head = parts.length ? tr('Прогресс перенесён в аккаунт игры <b>{0}</b>: {1}.', [esc(g.login), esc(parts.join(', '))]) : tr('Аккаунт игры <b>{0}</b> готов. Переносить было нечего.', [esc(g.login)]);
    return inNew ? head + ' ' + tr('Дальше входите в игру этим логином.') + (same ? ' ' + tr('Пароль — тот же, что на сайте.') : '') : head;
  }
  // сервер попросил что-то добавить к переносу (code в ответе): показываем нужное поле и подсказку, игрок повторяет; true — обработано
  function migErr(e, sent) {
    const M = S.m, code = e.code;
    if (code === 'login_taken') { M.needLogin = true; S.err = tr('Логин «{0}» в игре уже занят — введите другой логин для игры', [sent.login || sent.site_login]); }
    else if (code === 'login_needed') { M.needLogin = true; S.err = tr('Логин сайта не подходит для игры — придумайте логин для игры: 3–24 символа, латиница, цифры, _'); }
    else if (code === 'nick_taken') { M.needNick = true; S.err = tr('Ник «{0}» занят — введите другой ник для рейтинга', [sent.nick || sent.site_login]); }
    else if (code === 'nick_site') { M.needNick = true; S.err = tr('Ник «{0}» — логин другого аккаунта сайта, введите другой ник', [sent.nick || sent.site_login]); }
    else if (code === 'nick_needed') { M.needNick = true; S.err = tr('Логин сайта не подходит как ник (3–16 символов) — придумайте ник для рейтинга'); }
    else if (code === 'password_needed') { M.pwNew = true; S.err = tr('Пароль сайта короче 6 символов — придумайте пароль для игры'); }
    else if (code === 'already_used') { M.used = true; siteStatusDone(); S.err = tr('С этого аккаунта сайта прогресс уже перенесён. Войдите в аккаунт игры — пароль как на сайте, если не меняли'); }
    else return false;
    S.ok = ''; draw(); focusF(M.used ? '' : code === 'password_needed' ? 'npw' : /^nick_/.test(code) ? 'gnick' : 'glogin');
    return true;
  }
  const submit = {
    login: () => run(async () => { needFree(); needLogin(); entered(await accountApi.login(S.f.login.trim(), S.f.pass || ''), S.f.pass || ''); }),
    reg: () => run(async () => {
      needFree();
      const login = (S.f.login || '').trim(), pw = S.f.pass || '', nick = cleanNick(S.f.nick);
      if (!LOGIN_RE.test(login)) throw new Error(tr('Логин: 3–24 символа — латиница, цифры, подчёркивание'));
      if (pw.length < 6) throw new Error(tr('Пароль: минимум 6 символов'));
      if (!NICK_RE.test(nick)) throw new Error(tr('Ник: 3–16 символов — буквы, цифры, пробел, _ и -'));
      let acc; try { acc = await accountApi.register(login, pw, nick); } catch (e) {
        if (e.code === 'nick_site') { S.nickSite = true; S.err = !siteAcc() ? trIf(e.message) : ownSiteNick() ? (legacySite() ? tr('Это логин вашего аккаунта сайта — перенесите прогресс, ник останется за вами') : tr('Это логин вашего аккаунта сайта — подтвердите паролем сайта, и ник останется за вами')) : tr('Этот ник — логин другого аккаунта сайта. Выберите другой ник'); S.ok = ''; draw(); return; } // ник = логин аккаунта сайта: если он ваш — перенос (кнопка под сообщением, если уместна)
        throw e;
      }
      entered(acc, pw);
    }),
    // перенос в один шаг: аккаунта игры нет — сервер проверит пароль сайта, создаст аккаунт игры (логин и ник — как на сайте, пока не попросит другие) и перенесёт прогресс
    mig: () => run(async () => {
      needFree();
      const M = S.m, sl = siteLogin(), b = { site_login: sl, site_password: S.f.spass || '' };
      if (!sl) throw new Error(tr('Введите логин сайта'));
      if (!b.site_password) throw new Error(tr('Введите пароль сайта'));
      if (M.pwNew) { if ((S.f.npw || '').length < 6) throw new Error(tr('Пароль: минимум 6 символов')); b.password = S.f.npw; }
      if (M.needLogin) { const l = (S.f.glogin || '').trim(); if (!LOGIN_RE.test(l)) throw new Error(tr('Логин: 3–24 символа — латиница, цифры, подчёркивание')); b.login = l; }
      if (M.needNick) { const n = cleanNick(S.f.gnick); if (!NICK_RE.test(n)) throw new Error(tr('Ник: 3–16 символов — буквы, цифры, пробел, _ и -')); b.nick = n; }
      let d; try { d = await accountApi.migrate(b); } catch (e) {
        if (migErr(e, b)) return;
        if (e.status === 401) throw new Error(tr('Неверный логин или пароль сайта'));
        if (e.status === 429) throw new Error(tr('Слишком много попыток — подождите немного'));
        throw e;
      }
      const acc = { ...d.account, transferred: true }; setGameAcc(acc); siteStatusDone();
      S.done = doneText(acc, d.moved || {}, true, !M.pwNew); S.ok = ''; S.err = ''; S.f.spass = S.f.npw = ''; S.m = newM(); changed(); draw();
    }),
    xfer: () => run(async () => {
      needFree();
      const g = gameAcc(), sl = (S.f.slogin || '').trim();
      if (!g) throw new Error(tr('Для переноса нужен аккаунт игры.'));
      if (!sl || !S.f.spass) throw new Error(tr('Неверный логин или пароль сайта'));
      if (!S.f.gpass) throw new Error(tr('Неверный пароль аккаунта игры'));
      const d = await accountApi.transfer(g.id, S.f.gpass, sl, S.f.spass), m = d.moved || {};
      const acc = d.account ? { ...d.account, transferred: true } : { ...g, transferred: true }; setGameAcc(acc);
      siteStatusDone(); S.f.spass = S.f.gpass = '';
      S.done = doneText(acc, m, false); S.ok = ''; S.err = '';
      changed(); draw();
    }),
    rename: () => run(async () => {
      const g = gameAcc(), nick = cleanNick(S.f.newnick);
      if (!NICK_RE.test(nick)) throw new Error(tr('Ник: 3–16 символов — буквы, цифры, пробел, _ и -'));
      if (!S.f.npass) throw new Error(tr('Неверный пароль'));
      const acc = await accountApi.rename(g.id, S.f.npass, nick);
      setGameAcc({ ...g, ...acc }); S.rename = false; S.f.newnick = S.f.npass = ''; S.ok = tr('Ник изменён'); S.err = ''; changed(); draw();
    }),
  };

  root.addEventListener('input', (e) => {
    const k = e.target && e.target.dataset && e.target.dataset.f; if (!k) return; S.f[k] = e.target.value;
    if (k === 'slogin' || k === 'glogin' || k === 'gnick') { const gi = root.querySelector && root.querySelector('.ginfo'); if (gi) gi.innerHTML = migInfo(); } // «В игре: …» следует за вводом
  });
  root.addEventListener('submit', (e) => { e.preventDefault(); const f = e.target && e.target.dataset && e.target.dataset.form; if (f && submit[f]) submit[f](); });
  root.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest('[data-a]'); if (!t) return; const a = t.dataset.a;
    if (a === 'close') api.close();
    else if (a.startsWith('tab-')) { S.tab = a.slice(4); S.err = S.ok = ''; S.nickSite = false; S.rename = false; draw(); }
    else if (a === 'goxfer') { if (!siteAcc() && !S.f.slogin) S.f.slogin = cleanNick(S.f.nick); S.tab = 'xfer'; S.err = S.ok = ''; S.nickSite = false; draw(); focusF('spass'); } // «ник — логин сайта» → перенос
    else if (a === 'pw-same' || a === 'pw-new') { S.m.pwNew = a === 'pw-new'; draw(); if (S.m.pwNew) focusF('npw'); }
    else if (a === 'rename') { S.rename = true; S.err = S.ok = ''; draw(); }
    else if (a === 'rename-no') { S.rename = false; S.err = S.ok = ''; draw(); }
    else if (a === 'logout') { if (lock()) return; clearGameAcc(); S.f = {}; changed(); api.close(); }
  });
  // ── клавиатура телефона (Mark 2026-10-26: «при активации клавиатуры не видно, что печатаешь… трудно двигать, всё скидывается»): окно — в видимой
  // части над клавиатурой (visualViewport), поле — в середине видимого; перерисовка во время ввода (пришёл статус сайта, сменилась комната)
  // откладывается до ухода с поля — иначе поле пересоздаётся и клавиатура закрывается
  const vv = typeof visualViewport !== 'undefined' ? visualViewport : null;
  const typing = () => { const a = document.activeElement; return !!a && a.tagName === 'INPUT' && !!root.contains && root.contains(a); };
  let redraw = false;
  function drawSoon() { if (typing()) redraw = true; else draw(); }
  function fit() {
    if (!vv || !root.classList.contains('on')) return;
    const kb = typing() && vv.height < innerHeight * 0.85, st = root.style; // клавиатура открыта
    root.classList.toggle('kb', kb);
    if (kb) Object.assign(st, { top: vv.offsetTop + 'px', left: vv.offsetLeft + 'px', width: vv.width + 'px', height: vv.height + 'px', right: 'auto', bottom: 'auto' });
    else Object.assign(st, { top: '', left: '', width: '', height: '', right: '', bottom: '' });
    const f = kb && document.activeElement.closest && document.activeElement.closest('.fld');
    if (f && f.scrollIntoView) try { f.scrollIntoView({ block: 'center' }); } catch (_) { /* нет */ }
  }
  if (vv && vv.addEventListener) { vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); }
  root.addEventListener('focusin', () => setTimeout(fit, 60)); // клавиатура выезжает чуть позже фокуса
  root.addEventListener('focusout', () => setTimeout(() => { if (typing()) return; fit(); if (redraw) { redraw = false; draw(); } }, 60));
  root.addEventListener('keydown', (e) => { // Enter в поле — к следующему полю формы; в последнем — отправка (как обычно)
    const t = e.target; if (e.key !== 'Enter' || !t || t.tagName !== 'INPUT' || !t.form) return;
    const ins = [...t.form.querySelectorAll('input')], i = ins.indexOf(t);
    if (i >= 0 && i < ins.length - 1) { e.preventDefault(); ins[i + 1].focus(); }
  });
  addEventListener('keydown', (e) => { if (e.code === 'Escape' && root.classList.contains('on')) { api.close(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); } }); // поверх окна рейтинга: Esc закрывает только это окно

  const api = {
    // tab: 'xfer' — «Перенос с сайта»; 'login' / 'reg' — вход / регистрация. «Старый» игрок с прогрессом сайта, ещё без аккаунта игры, по умолчанию попадает на перенос
    // (регистрация ему не нужна: перенос сам создаёт аккаунт игры), на вход — только если просили 'login'
    open(tab) {
      const g = gameAcc(); S.err = S.ok = S.done = ''; S.busy = false; S.rename = false; S.nickSite = false; S.m = newM();
      if (g) S.tab = tab === 'xfer' ? 'xfer' : 'acc';
      else if (tab === 'xfer' || (legacySite() && tab !== 'login')) S.tab = 'xfer';
      else S.tab = tab === 'reg' ? 'reg' : 'login';
      S.f.slogin = S.f.slogin || (siteAcc() || {}).login || '';
      root.classList.add('on'); draw();
      const p = siteStatus(); if (p && p.then) p.then(() => { if (root.classList.contains('on')) drawSoon(); });
      const f = root.querySelector && root.querySelector('input'); if (f && f.focus && !(typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches)) try { f.focus(); } catch (_) { /* нет */ }
    },
    close() { root.classList.remove('on', 'kb'); Object.assign(root.style, { top: '', left: '', width: '', height: '', right: '', bottom: '' }); redraw = false; S.f.pass = S.f.gpass = S.f.spass = S.f.npass = S.f.npw = ''; S.busy = false; },
    isOpen: () => root.classList.contains('on'),
    refresh() { if (root.classList.contains('on')) drawSoon(); }, // в комнату зашли или вышли — перерисовать (кнопки смены аккаунта)
    render: renderRail,
  };
  return api;
}
