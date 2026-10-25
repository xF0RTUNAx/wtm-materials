// Аккаунт игры «Воздушного превосходства» (Mark 2026-10-25): строка в левом верхнем углу меню (ник или «Войти в аккаунт игры», ниже —
// «Перенести прогресс», только если это касается) и модальное окно: «Вход» / «Регистрация» / «Перенос прогресса»; у вошедшего — ник, смена ника
// (раз в сезон), «Выйти». Запросы и хранилище — account.js (функция airdef-account). Без аккаунта игры в рейтинг не попасть;
// новичку аккаунт сайта в игре не нужен (только аккаунт игры), «старому» игроку с прогрессом он работает до переноса, но без рейтинга.
// В комнате и в бою аккаунт сменить нельзя; вне их смена закрывает соединение онлайна (net.js accChanged).
import { ico } from './icons.js?v=20261025b';
import { tr, trIf } from './i18n.js?v=20261025b';
import { gameAcc, siteAcc, setGameAcc, clearGameAcc, accountApi, siteStatus, siteStatusDone, transferOk, siteNewbie, onAccChange } from './account.js?v=20261025b';

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
#accWin .amsg { min-height: 0; font-size: 13.5px; } #accWin .amsg:empty { display: none; } #accWin .amsg.err { color: #f08a7f; } #accWin .amsg.ok { color: #7fd38f; }
#accWin p { margin: 0; color: #c9cebd; font-size: 13.5px; } #accWin .step { color: var(--amber2); font-size: 13px; }
#accWin .lock { color: #f0b86f; } #accWin button:disabled { cursor: default; opacity: .55; }
#accWin .me { display: grid; gap: 2px; } #accWin .me b { font: 500 22px 'Oswald', sans-serif; word-break: break-word; } #accWin .me span { color: var(--dim); font-size: 13px; }
@media (max-height: 460px) { #accWin .whead { padding: 6px 10px; } #accWin .tabs button { padding: 6px 12px; } #accWin .body { padding: 8px 10px; gap: 8px; } #accWin .frm { grid-template-columns: 1fr 1fr; gap: 8px; } #accWin .frm .full { grid-column: 1 / -1; } }
@media (pointer: coarse) { #accWin input { font-size: 16px; } }
`;

export function createAccount(C) {
  const style = document.createElement('style'); style.textContent = CSS; if (document.head) document.head.appendChild(style); // (заглушка DOM стенда — без head/body)
  const root = document.createElement('div'); root.id = 'accWin'; root.setAttribute && root.setAttribute('role', 'dialog'); root.setAttribute && root.setAttribute('aria-modal', 'true'); if (document.body && document.body.appendChild) document.body.appendChild(root);
  const $ = (id) => document.getElementById(id);
  // tab: login | reg | xfer | acc; after: 'xfer' — после входа перейти к переносу (шаг 1 из 2); f — введённое (в памяти, пока окно открыто)
  const S = { tab: 'login', after: '', err: '', ok: '', done: '', busy: false, rename: false, pend: false, f: {} };
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
  $('accBox').onclick = (e) => { const t = e.target.closest && e.target.closest('[data-a]'); if (!t) return; if (C.snd && C.snd.click) C.snd.click(); api.open(t.dataset.a === 'xfer' ? 'xfer' : undefined); };

  // кнопка «Войти или создать аккаунт» в других местах игры (итог боя, исследования): data-accopen="reg" | "login"
  document.addEventListener('click', (e) => { const t = e.target && e.target.closest && e.target.closest('[data-accopen]'); if (!t) return; if (C.snd && C.snd.click) C.snd.click(); api.open(t.dataset.accopen); });

  // ── окно ──
  function tabs() {
    const g = gameAcc(), t = g ? [['acc', tr('Аккаунт')]] : [['login', tr('Вход')], ['reg', tr('Регистрация')]];
    if (transferOk() || S.done || S.tab === 'xfer') t.push(['xfer', tr('Перенос прогресса')]);
    return t;
  }
  const fld = (k, label, type, auto, hint, cls = '') => `<label class="fld ${cls}"><span>${label}</span><input data-f="${k}" type="${type}" autocomplete="${auto}" autocapitalize="off" autocorrect="off" spellcheck="false" value="${fv(k)}">${hint ? `<small>${hint}</small>` : ''}</label>`;
  const msg = () => `<div class="amsg${S.err ? ' err' : S.ok ? ' ok' : ''}" role="alert">${esc(S.err || S.ok)}</div>`;
  const newbie = () => (siteNewbie() ? `<p>${tr('У игры свой аккаунт — аккаунт сайта здесь не используется.')}</p>` : '');
  const step = () => (S.after === 'xfer' ? `<p class="step">${tr('Шаг 1 из 2: войдите в аккаунт игры или создайте его — затем перенесём прогресс.')}</p>` : '');
  function body() {
    const g = gameAcc();
    if (S.tab === 'login') return `${step()}<form class="frm" data-form="login" novalidate>${fld('login', tr('Логин'), 'text', 'username', '', 'full')}${fld('pass', tr('Пароль'), 'password', 'current-password', '', 'full')}<button class="btn full" type="submit">${tr('Войти')}</button></form>${msg()}`;
    if (S.tab === 'reg') return `${step()}${newbie()}<form class="frm" data-form="reg" novalidate>${fld('login', tr('Логин'), 'text', 'username', tr('3–24: латиница, цифры, _'))}${fld('pass', tr('Пароль'), 'password', 'new-password', tr('от 6 символов'))}${fld('nick', tr('Ник для рейтинга'), 'text', 'nickname', tr('3–16: буквы, цифры, пробел, _ и -'), 'full')}<button class="btn full" type="submit">${tr('Создать аккаунт')}</button></form>${msg()}`;
    if (S.tab === 'xfer') {
      if (S.done) return `${msg()}<button class="btn" data-a="close">${tr('Готово')}</button>`;
      const intro = `<p>${tr('Перенесутся опыт, серебро, исследования, покупки и онлайн-бои «Воздушного превосходства». Мини-игры сайта останутся на аккаунте сайта. Перенос — один раз.')}</p>`;
      if (!g) return `${intro}<p>${tr('Для переноса нужен аккаунт игры.')}</p><div class="row"><button class="btn" data-a="tab-login">${tr('Войти')}</button><button class="btn alt" data-a="tab-reg">${tr('Создать аккаунт')}</button></div>`;
      return `${intro}<form class="frm" data-form="xfer" novalidate>${fld('slogin', tr('Логин сайта'), 'text', 'off', '')}${fld('spass', tr('Пароль сайта'), 'password', 'off', '')}${fld('gpass', tr('Пароль аккаунта игры'), 'password', 'current-password', '', 'full')}<button class="btn full" type="submit">${tr('Перенести прогресс')}</button></form>${msg()}`;
    }
    // acc: вошёл
    const me = `<div class="me"><b>${esc(g.nick || g.login)}</b><span>${tr('Логин: {0}', [esc(g.login)])}</span></div>`;
    if (S.rename) return `${me}<form class="frm" data-form="rename" novalidate>${fld('newnick', tr('Новый ник'), 'text', 'nickname', tr('3–16: буквы, цифры, пробел, _ и -'), 'full')}${fld('npass', tr('Пароль аккаунта игры'), 'password', 'current-password', '', 'full')}<button class="btn" type="submit">${tr('Сохранить')}</button><button class="btn alt" type="button" data-a="rename-no">${tr('Отмена')}</button></form>${msg()}`;
    return `${me}<div class="row"><button class="btn alt" data-a="rename">${tr('Сменить ник')}</button><button class="btn alt" data-a="logout">${tr('Выйти из аккаунта')}</button></div><p>${tr('Ник виден в рейтинге и в онлайн-боях. Меняется раз в сезон.')}</p>${msg()}`;
  }
  function draw() {
    if (!tabs().some(([k]) => k === S.tab)) S.tab = gameAcc() ? 'acc' : 'login';
    root.innerHTML = `<div class="win"><div class="whead"><span class="t">${ico('players')}${tr('Аккаунт игры')}</span><button class="rx" data-a="close" aria-label="${tr('Закрыть')}" title="${tr('Закрыть')}">${ico('close')}</button></div>
      <div class="tabs">${tabs().map(([k, l]) => `<button data-a="tab-${k}" class="${k === S.tab ? 'on' : ''}">${l}</button>`).join('')}</div><div class="body">${lock() && !S.rename && !S.done ? `<p class="lock">${LOCK_MSG()}</p>` : ''}${body()}</div></div>`;
    applyLock();
  }
  // кнопки смены аккаунта (вход, регистрация, перенос, выход) — недоступны в комнате и в бою; смена ника остаётся
  function applyLock() {
    if (!lock() || !root.querySelectorAll) return;
    root.querySelectorAll('form[data-form="login"] button, form[data-form="reg"] button, form[data-form="xfer"] button, [data-a="logout"]').forEach((b) => { b.disabled = true; b.title = LOCK_MSG(); });
  }
  const setMsg = (err, ok) => { S.err = err || ''; S.ok = ok || ''; const m = root.querySelector && root.querySelector('.amsg'); if (m) { m.className = 'amsg' + (S.err ? ' err' : S.ok ? ' ok' : ''); m.textContent = S.err || S.ok; } };
  const busy = (on) => { S.busy = on; const b = root.querySelector && root.querySelector('button[type=submit]'); if (b) b.disabled = on || (lock() && b.closest && !b.closest('form[data-form="rename"]')); };

  // ── действия ──
  async function run(fn) {
    if (S.busy) return; setMsg(); busy(true);
    try { await fn(); } catch (e) { setMsg(trIf(e.message) || tr('Ошибка сервера')); }
    busy(false);
  }
  const needLogin = () => { if (!LOGIN_RE.test((S.f.login || '').trim())) throw new Error(tr('Неверный логин или пароль')); };
  async function entered(acc, pw) { // вошёл или зарегистрировался
    setGameAcc(acc); S.f.gpass = pw; S.f.pass = ''; changed();
    if (S.after === 'xfer') { S.after = ''; await siteStatus(); S.tab = transferOk() ? 'xfer' : 'acc'; if (S.tab === 'acc') { api.close(); return; } draw(); } else api.close();
  }
  const submit = {
    login: () => run(async () => { needFree(); needLogin(); await entered(await accountApi.login(S.f.login.trim(), S.f.pass || ''), S.f.pass || ''); }),
    reg: () => run(async () => {
      needFree();
      const login = (S.f.login || '').trim(), pw = S.f.pass || '', nick = cleanNick(S.f.nick);
      if (!LOGIN_RE.test(login)) throw new Error(tr('Логин: 3–24 символа — латиница, цифры, подчёркивание'));
      if (pw.length < 6) throw new Error(tr('Пароль: минимум 6 символов'));
      if (!NICK_RE.test(nick)) throw new Error(tr('Ник: 3–16 символов — буквы, цифры, пробел, _ и -'));
      await entered(await accountApi.register(login, pw, nick), pw);
    }),
    xfer: () => run(async () => {
      needFree();
      const g = gameAcc(), sl = (S.f.slogin || '').trim();
      if (!g) throw new Error(tr('Для переноса нужен аккаунт игры.'));
      if (!sl || !S.f.spass) throw new Error(tr('Неверный логин или пароль сайта'));
      if (!S.f.gpass) throw new Error(tr('Неверный пароль аккаунта игры'));
      const d = await accountApi.transfer(g.id, S.f.gpass, sl, S.f.spass), m = d.moved || {};
      if (d.account) setGameAcc({ ...d.account, transferred: true }); else setGameAcc({ ...g, transferred: true });
      siteStatusDone(); S.f.spass = S.f.gpass = '';
      const parts = [m.progress ? tr('прогресс игры') : '', m.runs ? tr('одиночных боёв — {0}', [m.runs]) : '', m.online ? tr('онлайн-боёв — {0}', [m.online]) : ''].filter(Boolean);
      S.done = parts.length ? tr('Перенесено: {0}.', [parts.join(', ')]) : tr('Переносить было нечего.'); S.ok = S.done; S.err = '';
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

  root.addEventListener('input', (e) => { const k = e.target && e.target.dataset && e.target.dataset.f; if (k) S.f[k] = e.target.value; });
  root.addEventListener('submit', (e) => { e.preventDefault(); const f = e.target && e.target.dataset && e.target.dataset.form; if (f && submit[f]) submit[f](); });
  root.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest('[data-a]'); if (!t) return; const a = t.dataset.a;
    if (a === 'close') api.close();
    else if (a.startsWith('tab-')) { if (S.tab === 'xfer' && !gameAcc()) S.after = 'xfer'; S.tab = a.slice(4); S.err = S.ok = ''; S.rename = false; draw(); } // из «Переноса» без аккаунта игры — вход / регистрация, потом назад к переносу
    else if (a === 'rename') { S.rename = true; S.err = S.ok = ''; draw(); }
    else if (a === 'rename-no') { S.rename = false; S.err = S.ok = ''; draw(); }
    else if (a === 'logout') { if (lock()) return; clearGameAcc(); S.f = {}; changed(); api.close(); }
  });
  addEventListener('keydown', (e) => { if (e.code === 'Escape' && root.classList.contains('on')) { api.close(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); } }); // поверх окна рейтинга: Esc закрывает только это окно

  const api = {
    // tab: 'xfer' — «Перенести прогресс» (без аккаунта игры — сначала регистрация в этом же окне), 'login' / 'reg' — вкладка входа
    open(tab) {
      const g = gameAcc(); S.err = S.ok = S.done = ''; S.busy = false; S.rename = false; S.after = '';
      if (g) S.tab = tab === 'xfer' ? 'xfer' : 'acc';
      else if (tab === 'xfer') { S.tab = 'reg'; S.after = 'xfer'; } else S.tab = tab === 'reg' ? 'reg' : 'login';
      S.f.slogin = S.f.slogin || (siteAcc() || {}).login || '';
      root.classList.add('on'); draw();
      const p = siteStatus(); if (p && p.then) p.then(() => { if (root.classList.contains('on')) draw(); });
      const f = root.querySelector && root.querySelector('input'); if (f && f.focus && !(typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches)) try { f.focus(); } catch (_) { /* нет */ }
    },
    close() { root.classList.remove('on'); S.f.pass = S.f.gpass = S.f.spass = S.f.npass = ''; S.busy = false; },
    isOpen: () => root.classList.contains('on'),
    refresh() { if (root.classList.contains('on')) draw(); }, // в комнату зашли или вышли — перерисовать (кнопки смены аккаунта)
    render: renderRail,
  };
  return api;
}
