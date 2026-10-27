// Онлайн «Воздушного превосходства» — интерфейс: режим «Онлайн» в меню (быстрый бой по роли, комнаты 1×1 … 6×6, вход по
// коду, лобби), окно ожидания поверх живого фона меню, выбор связки лётчиком перед волной (видно, что выбрали союзники),
// переход в бой (лётчик — air.js, ПВО — defense.js в режиме онлайна), итоги волн и боя, журнал сбитий (6 с) и
// «Мне нужна помощь!» союзникам (метка в кадре и на карте). Связь и зеркало боя — net.js.
/* global THREE, CONFIG */
import { tr, trIf, LANG } from './i18n.js?v=20261027b';
import { trFmt } from './i18n-fmt.js?v=20261027b';
import { createNet } from './net.js?v=20261027b';
import * as O from './sim/online.js?v=20261027b';
import * as MW from './sim/online-multi.js?v=20261027b';
import { AG, SAM, CARRIERS, LOADOUTS, PLANES, ERAS, loadoutRole } from './arsenal.js?v=20261027b';
import { MODES } from './sim/strike.js?v=20261027b';
import { ICON, ico } from './icons.js?v=20261027b';
import { activeAcc, siteAcc, siteNoProgress } from './account.js?v=20261027b';
import { boardOl, boardMw } from './endscr.js?v=20261027b';

const pnm = (p) => esc(p.bot ? trIf(p.name) : p.name); // позывные ботов приходят с сервера по-русски
const ROLES = [['air', tr('Авиация')], ['pvo', tr('ПВО')], ['any', tr('Любая')]];
const SIDES = [['random', tr('Случайно')], ['west', tr('Запад')], ['east', tr('Восток')]];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createOnline(C, ctrls) {
  const { $, ls, snd } = C;
  const N = createNet(C); C.netc = N;
  const ui = { kind: ls.get('fortuna_ad_kind') || 'air', mode: ls.get('fortuna_ad_mode') || 'arcade', role: ls.get('fortuna_ad_role') || 'any', size: +(ls.get('fortuna_ad_size') || 2), era: +(ls.get('fortuna_ad_era') || 2), sideAir: ls.get('fortuna_ad_side') || 'random', fill: ls.get('fortuna_ad_fill') !== '0', code: '' };
  const saveUi = () => { ls.set('fortuna_ad_kind', ui.kind); ls.set('fortuna_ad_mode', ui.mode); ls.set('fortuna_ad_role', ui.role); ls.set('fortuna_ad_size', String(ui.size)); ls.set('fortuna_ad_era', String(ui.era)); ls.set('fortuna_ad_side', ui.sideAir); ls.set('fortuna_ad_fill', ui.fill ? '1' : '0'); };
  const seg = (id, cur, items) => `<div class="seg" data-oseg="${id}">${items.map(([v, l]) => `<button data-v="${v}" class="${String(v) === String(cur) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const inMenu = () => C.state === 'menu' && C.setup.game === 'online';
  const rerender = () => { if (inMenu()) C.menu.render(); renderWait(); };
  let feed = [], helps = [], keepRoom = false, afterBattle = false; // keepRoom — в меню, не выходя из комнаты; afterBattle — лобби после боя

  // ═════════════ Меню: вкладка «Бой» в режиме «Онлайн» ═════════════
  function panel(el) {
    if (N.conn !== 'on') {
      if (N.conn === 'off' || N.conn === 'error' || (N.conn === 'noacc' && N.account())) N.connect(); // 'noacc' — аккаунт появился (вошли, пришёл статус сайта): подключаемся с ним
      const guest = N.conn === 'noacc' || N.conn === 'needgame'; // гость: онлайн только с аккаунтом игры
      el.innerHTML = `<div class="cat-h">${tr('Онлайн')}</div><p class="hint">${N.conn === 'noacc' ? tr('Онлайн — только с аккаунтом игры. Войдите или создайте его.')
        : N.conn === 'needgame' ? tr('Создайте аккаунт игры — онлайн только с ним.')
        : N.conn === 'error' ? tr('Сервер онлайна сейчас недоступен. Попробуйте позже.') : tr('Подключаемся к серверу…')}</p>${N.conn === 'error' ? `<button class="btn alt" data-oa="retry">${tr('Повторить')}</button>` : ''}${guest ? `<button class="btn alt" data-oa="acc">${tr('Войти или создать аккаунт')}</button>` : ''}`;
      return;
    }
    const r = N.room;
    if (r && r.state === 'lobby') return lobby(el, r);
    if (N.queued) { el.innerHTML = `<div class="cat-h">${tr('Поиск боя')}</div><p class="hint">${waitText()}</p>`; return; }
    const mw = ui.kind === 'multi', srch = N.search || {};
    el.innerHTML = `<div class="prow"><span>${tr('Игра')}</span>${seg('kind', ui.kind, [['air', tr('Вылет и оборона')], ['multi', tr('Мульти-волна')]])}</div>
      <div class="cat-h">${tr('Быстрый бой')}</div>
      <div class="prow"><span>${tr('Режим')}</span>${seg('mode', ui.mode, O.AD_MODES.map((k) => [k, MODES[k].name]))}</div>
      ${mw ? '' : `<div class="prow"><span>${tr('Роль')}</span>${seg('role', ui.role, ROLES)}</div>`}
      <p class="hint">${mw ? tr('Команда против команды, два раунда. В одном ваша команда собирает волну (дроны, крылатые, баллистика), в другом ставит ПВО против волны соперника. Побеждает тот, чья волна разрушила больше. Подготовка — {0} с, в это время работает чат команды.{1}', [MW.PREP_T, N.search ? tr(' Сейчас ищут: аркада {0}, реализм {1}.', [srch.marcade || 0, srch.mreal || 0]) : ''])
        : tr('Авиация против ПВО города, три волны. Ждём минимум 2 на 2, затем ещё 15 с, вдруг подтянутся другие. Если людей долго нет, добавим ботов.{0}', [N.search ? tr(' Сейчас ищут: аркада {0}, реализм {1}.', [srch.arcade, srch.real]) : ''])}</p>
      <div class="cat-h">${tr('Своя комната')}</div>
      <div class="prow"><span>${tr('Формат')}</span>${seg('size', ui.size, O.AD_SIZES.map((n) => [n, `${n}×${n}`]))}</div>
      ${mw ? '' : `<div class="prow"><span>${tr('Эпоха')}</span>${seg('era', ui.era, ERAS.filter((e) => LOADOUTS[e.id]).map((e) => [e.id, e.short || e.name]))}</div>`}
      ${mw ? '' : `<div class="prow"><span>${tr('Авиация')}</span>${seg('side', ui.sideAir, SIDES)}</div>`}
      <div class="prow"><span>${tr('Пустые места')}</span>${seg('fill', ui.fill ? 1 : 0, [[1, tr('Боты')], [0, tr('Без ботов')]])}</div>
      <button class="btn alt" data-oa="create">${tr('Создать комнату')}</button>
      <div class="cat-h">${tr('Войти по коду')}</div>
      <div class="prow"><input id="adCode" maxlength="4" placeholder="${tr('Код')}" value="${esc(ui.code)}" style="text-transform:uppercase;width:90px"><button class="btn alt" data-oa="join" style="width:auto">${tr('Войти')}</button></div>`;
  }
  function lobby(el, r) {
    const me = N.myPlayer(), host = r.host === (N.me && N.me.id);
    const TN = r.kind === 'multi' ? MW.TEAM_NAME : O.ROLE_NAMES, TT = r.kind === 'multi' ? MW.TEAMS : ['air', 'pvo'];
    const col = (t) => `<div class="adteam"><div class="cat-h">${TN[t]} · ${r.players.filter((p) => p.team === t).length}/${r.size}</div>` +
      r.players.filter((p) => p.team === t).map((p) => `<div class="adp ${p.id === (me && me.id) ? 'me' : ''}"><b>${pnm(p)}</b>${p.bot ? ` <span class="dim">${tr('бот')}</span>` : ''}${p.ready ? ` <span class="okc">${ico('ok', 'ii')}</span>` : ''}${host && p.bot ? ` <button class="mini" data-kick="${p.id}">×</button>` : ''}</div>`).join('') +
      (me && me.team !== t ? `<button class="mini" data-oa="team" data-t="${t}">${tr('Перейти сюда')}</button>` : '') + (host ? ` <button class="mini" data-bot="${t}">${tr('+ бот')}</button>` : '') + '</div>';
    el.innerHTML = `<div class="cat-h">${tr('Комната <b class="adcode">{0}</b>', [r.code])} <button class="mini" data-oa="invite">${tr('Пригласить')}</button> <button class="mini" data-oa="leave">${tr('Выйти')}</button></div>
      <p class="hint">${r.kind === 'multi' ? tr('Мульти-волна · два раунда со сменой сторон · {0} · {1}×{2}{3}', [MODES[r.mode].name, r.size, r.size, r.fill ? tr(' · пустые места — боты') : '']) /* без эпохи: уровень ботов скрытый */
        : tr('{0}{1}{2} · {3}×{4} · эпоха {5}{6}{7}', ['', '', MODES[r.mode].name, r.size, r.size, ERAS[r.era - 1].short || r.era, tr(' · авиация — {0}', [r.sideAir === 'east' ? tr('восток') : tr('запад')]), r.fill ? tr(' · пустые места — боты') : ''])}</p>
      ${afterBattle ? `<p class="hint">${tr('<b>Бой окончен, вы снова в комнате.</b> Хост может сменить игру, режим, формат, эпоху и сторону; затем все нажимают «Готов».')}</p>` : ''}
      ${host ? `<div class="prow"><span>${tr('Игра')}</span>${seg('rkind', r.kind === 'multi' ? 'multi' : 'air', [['air', tr('Вылет и оборона')], ['multi', tr('Мульти-волна')]])}</div><div class="prow"><span>${tr('Формат')}</span>${seg('rsize', r.size, O.AD_SIZES.map((n) => [n, `${n}×${n}`]))}</div>${r.kind === 'multi' ? '' : `<div class="prow"><span>${tr('Эпоха')}</span>${seg('rera', r.era, ERAS.filter((e) => LOADOUTS[e.id]).map((e) => [e.id, e.short || e.name]))}</div>`}
        ${r.kind === 'multi' ? '' : `<div class="prow"><span>${tr('Авиация')}</span>${seg('rside', r.sideAir, SIDES.slice(1))}</div>`}<div class="prow"><span>${tr('Режим')}</span>${seg('rmode', r.mode, O.AD_MODES.map((k) => [k, MODES[k].name]))}</div>` : ''}
      <div class="adteams">${TT.map(col).join('')}</div>
      <p class="hint">${tr('Бой начнётся, когда все нажмут «Готов».')}</p>`;
  }
  // кнопка внизу карточки меню
  function primaryText() {
    if (N.conn === 'noacc' && !N.account() || N.conn === 'needgame') return tr('Войти или создать аккаунт');
    if (N.conn !== 'on') return tr('Онлайн');
    if (N.room && N.room.state === 'lobby') { const me = N.myPlayer(); return me && me.ready ? tr('Готов (снять)') : tr('Готов'); }
    return N.queued ? tr('Отменить поиск') : tr('Найти бой');
  }
  function primary() {
    if (N.conn === 'noacc' && !N.account() || N.conn === 'needgame') { openAcc(); return; }
    if (N.conn !== 'on') { N.connect(); return; }
    if (N.room && N.room.state === 'lobby') { const me = N.myPlayer(); N.ready(!(me && me.ready)); return; }
    if (N.queued) N.unqueue(); else N.queue(ui.mode, ui.role, ui.kind === 'multi' ? 'multi' : undefined);
  }
  const openAcc = () => { if (C.account) C.account.open(siteAcc() ? 'reg' : 'login'); }; // у вошедшего на сайте новичка — сразу регистрация
  function onClick(e) {
    const b = e.target.closest('[data-v]'), sg = b && b.closest('[data-oseg]');
    if (sg) {
      const v = b.dataset.v, k = sg.dataset.oseg;
      if (k === 'kind') ui.kind = v; else if (k === 'mode') ui.mode = v; else if (k === 'role') ui.role = v; else if (k === 'size') ui.size = +v; else if (k === 'era') ui.era = +v; else if (k === 'side') ui.sideAir = v; else if (k === 'fill') ui.fill = v === '1';
      else if (k === 'rkind') N.opts({ kind: v }); else if (k === 'rsize') N.opts({ size: +v }); else if (k === 'rera') N.opts({ era: +v }); else if (k === 'rside') N.opts({ sideAir: v }); else if (k === 'rmode') N.opts({ mode: v });
      saveUi(); snd.click(); if (k === 'kind' && !N.room && !N.queued && C.wantMap('online') !== C.MAP) { mapFix(v); return; } rerender(); return;
    }
    const a = e.target.closest('[data-oa]'), bot = e.target.closest('[data-bot]'), kick = e.target.closest('[data-kick]');
    if (bot) { N.bot(bot.dataset.bot); return; }
    if (kick) { N.kick(+kick.dataset.kick); return; }
    if (!a) return;
    snd.click();
    switch (a.dataset.oa) {
      case 'retry': N.conn = 'off'; N.connect(); break;
      case 'acc': openAcc(); break;
      case 'create': N.create(ui.kind === 'multi' ? { kind: 'multi', mode: ui.mode, size: ui.size, fill: ui.fill, era: 2 + Math.floor(Math.random() * 3) /* только для старого сервера до update.ps1 (у запада нет I); новый — игнорирует */ } : { mode: ui.mode, size: ui.size, era: ui.era, sideAir: ui.sideAir === 'random' ? null : ui.sideAir, fill: ui.fill, team: ui.role === 'any' ? null : ui.role }); break;
      case 'join': { const v = ($('adCode') && $('adCode').value || '').toUpperCase(); ui.code = v; if (v.length === 4) N.join(v, ui.kind === 'multi' || ui.role === 'any' ? null : ui.role); break; }
      case 'leave': N.leave(); break;
      case 'team': N.team(a.dataset.t); break;
      case 'invite': invite(); break;
    }
  }
  function invite() {
    const url = `https://fortunawtm.com/airsuperiority/?ad=${N.room.code}` /* красивая ссылка (/airsuperiority/ → игра с тем же ?ad=; со слешем — без лишнего перенаправления GitHub Pages) */, text = tr('Бой «Air Superiority Online»: комната {0}', [N.room.code]);
    try { const tg = window.Telegram && window.Telegram.WebApp; if (tg && tg.openTelegramLink) { tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`); return; } } catch (_) { /* не Telegram */ }
    if (navigator.share) { navigator.share({ title: text, url }).catch(() => {}); return; }
    try { navigator.clipboard.writeText(url); C.say(tr('Ссылка скопирована'), 2); } catch (_) { C.say(tr('Код комнаты: {0}', [N.room.code]), 3); }
  }

  // ═════════════ Ожидание поиска — поверх живого фона меню ═════════════
  const waitEl = $('netWait');
  function waitText() {
    const q = N.queued; if (!q) return '';
    const sec = Math.floor((performance.now() - q.t) / 1000), w = N.qwait ? Math.max(0, Math.ceil((N.qwait - performance.now()) / 1000)) : 0;
    return tr('{0}{1}{2} · ищем {3}:{4}{5}', [q.kind === 'multi' ? tr('Мульти-волна · ') : '', MODES[q.mode].name, q.kind === 'multi' ? '' : tr(' · роль: {0}', [ROLES.find((r) => r[0] === ui.role)[1]]), Math.floor(sec / 60), String(sec % 60).padStart(2, '0'), w ? tr(' · набралось 2 на 2 — старт через {0} с', [w]) : '']);
  }
  function renderWait() {
    const on = !!N.queued && C.state === 'menu';
    waitEl.style.display = on ? 'flex' : 'none';
    if (on) waitEl.querySelector('.t').textContent = waitText();
  }
  waitEl.querySelector('button').onclick = () => { N.unqueue(); snd.click(); };
  setInterval(() => { if (N.queued) { renderWait(); if (inMenu()) C.menu.render(); } }, 1000);

  // ═════════════ Бой ═════════════
  const planEl = $('netPlan');
  const team = () => N.myTeam();
  function enterBattle() {
    snd.unlock(); afterBattle = false;
    if (C.ctrl && C.ctrl.stop) C.ctrl.stop();
    C.hooks = {}; C.paused = false; C.hint(''); C.say('');
    for (const id of ['menu', 'end', 'pauseScr']) $(id).classList.remove('on');
    if (C.shop) C.shop.close(); if (C.rating) C.rating.close(); // бой нашёлся, пока открыто окно магазина или рейтинга (ревью)
    document.body.classList.remove('menuing'); document.body.classList.add('playing');
    C.state = 'play'; C.camera.clearViewOffset(); C.lastGame = 'online'; C.shell.play(true);
    if (N.battle && N.battle.kind === 'multi') { C.ctrl = ctrls.defense; ctrls.defense.startNetMulti(N); }
    else if (team() === 'air') { C.ctrl = ctrls.air; ctrls.air.startNet(N); } else { C.ctrl = ctrls.defense; ctrls.defense.startNet(N); }
    feed = []; helps = []; renderWait(); renderPlan();
    document.body.classList.add('netOn'); // кнопка «Игроки»
  }
  // выбор связки лётчиком: что по карману, что выбрали союзники
  function renderPlan() {
    const r = N.room, show = N.battle && N.battle.kind !== 'multi' && r && r.state === 'plan' && team() === 'air';
    planEl.style.display = show ? 'block' : 'none'; if (!show) return;
    const B = N.battle, me = N.myPlayer(), list = LOADOUTS[B.era].map((L, i) => [L, i]).filter(([L]) => L.side === B.sideAir && O.netOk(L)); // вертолёты — пока только одиночная игра (НАР в онлайне — с 2026-10-22)
    const allies = r.players.filter((p) => p.team === 'air' && p.id !== me.id), others = allies.map((p) => (p.choice !== null ? LOADOUTS[B.era][p.choice] : null));
    const nAir = allies.length + 1, hunters = others.filter((x) => x && loadoutRole(x) === 'sead').length;
    planEl.innerHTML = `<h3>${tr('Волна {0}/{1} · выбор связки · {2} с', [r.wave, O.WAVES, r.left ?? ''])}</h3><div>${tr('Очки: <b style="color:#fde68a">{0}</b> · вылетов на волну: {1}{2}', [me.budget, me.lives ?? O.RESPAWNS[r.wave - 1] + 1, r.lead === 'pvo' ? tr(' (+1: команда отстаёт)') : ''])}</div>
      <div class="dim">${tr('Охотников за ПВО в команде: {0}/{1} · после {2} с каждая уничтоженная РЛС замедляет перезарядку ПВО{3}', [hunters + (me.choice !== null && loadoutRole(LOADOUTS[B.era][me.choice]) === 'sead' ? 1 : 0), O.huntCap(nAir), O.SUPPRESS_T, r.lead === 'air' ? tr(' · вы ведёте — связки на 10 % дороже') : ''])}</div>
      ${allies.length ? `<div class="cat-h">${tr('Союзники')}</div>${allies.map((p) => { const L = p.choice !== null ? LOADOUTS[B.era][p.choice] : null; return `<div class="adp"><b>${pnm(p)}</b> — ${L ? `${PLANES[L.plane]} <span class="role ${loadoutRole(L)}">${O.approachOf(L)}</span>` : tr('выбирает…')}${p.ready ? ` <span class="okc">${ico('ok', 'ii')}</span>` : ''}</div>`; }).join('')}` : ''}
      <div class="cat-h">${tr('Связки')}</div>` + list.map(([L, i]) => {
      const cost = O.loadoutCostFor(L, r.lead), back = me.choice !== null ? O.loadoutCostFor(LOADOUTS[B.era][me.choice], r.lead) : 0, deny = O.roleDeny(L, others, nAir), miss = r.mode === 'real' && C.progress && C.progress.ready() ? C.progress.loadoutMissing(L) : [], no = cost > me.budget + back || !!deny || miss.length > 0; // «Реализм»: только купленное
      return `<button class="opt ${me.choice === i ? 'on' : ''} ${no ? 'no' : ''}" data-bi="${i}"><div class="nm"><b>${PLANES[L.plane]} · ${L.name}</b><span class="role ${loadoutRole(L)}">${O.approachOf(L)}</span><span>${L.items.map(([k, n]) => `${AG[k].short} ×${n}`).join(' · ')}${L.pod ? tr(' · контейнер') : ''}${deny ? ` ${tr('· <b class="warnc">лимит охотников</b>')}` : ''}${miss.length ? ` · <b class="warnc">${C.progress.needText(miss)}</b>` : ''}</span></div><span class="pr">${cost}</span></button>`;
    }).join('') + `<button class="btn ${me.ready ? 'alt' : ''}" data-oa="pready">${me.ready ? tr('Готов (снять)') : tr('Готов')}</button>`;
  }
  planEl.onclick = (e) => {
    const b = e.target.closest('[data-bi]'), a = e.target.closest('[data-oa]');
    if (b) { N.buyAir(+b.dataset.bi); snd.click(); }
    if (a && a.dataset.oa === 'pready') { const me = N.myPlayer(); N.ready(!(me && me.ready)); snd.click(); }
  };

  // ═════════════ События сети ═════════════
  N.on('conn', rerender);
  N.on('room', () => { if (C.account && C.account.refresh) C.account.refresh(); }); // зашли в комнату / вышли — окно аккаунта открыто: кнопки смены аккаунта закрыть / открыть
  N.on('queue', rerender);
  N.on('err', (m) => { C.say(trFmt(m), 3); rerender(); }); // сообщения сервера — по-русски: переводим на клиенте
  N.on('deny', (m) => { N.clog('deny', m); const t = trFmt(m); C.say(t, 2.5); snd.deny(); if (ctrls.defense.st.net) ctrls.defense.st.msg = t; });
  // карта комнаты: «Мульти-волна» — «Северный рубеж», «Вылет и оборона» — город. Карта строится при загрузке страницы: не та —
  // перезагружаемся под неё; сервер держит место (в лобби — 30 с, в бою — как при обрыве) и тот же аккаунт возвращает в комнату
  let mapGo = false;
  function mapFix(kind) {
    if (mapGo) return true; // уже уходим на другую карту
    const k = kind === 'multi' ? 'multi' : 'air'; ls.set('fortuna_ad_kind', k);
    if (C.wantMap('online') === C.MAP) return false;
    mapGo = true; N.quit = true; // уходящая страница не переподключается (иначе две вкладки одного аккаунта отнимают место друг у друга)
    N.clog('map_reload', k); C.say(tr('Загружаем карту комнаты…'), 5);
    const u = new URL(location.href); u.searchParams.delete('ad'); u.searchParams.set('mp', '1'); location.replace(u.href);
    return true;
  }
  N.on('start', () => { if (N.battle && mapFix(N.battle.kind)) return; enterBattle(); });
  N.on('room', (was) => {
    if (N.room && mapFix(N.room.kind)) return;
    rerender();
    const r = N.room; if (!r || !N.battle || r.state === 'end' || r.state === 'lobby') return; // итоги и лобби — не бой
    if (C.state !== 'play') enterBattle();
    if (team() === 'pvo' || N.battle.kind === 'multi') ctrls.defense.netSync();
    renderPlan();
    if (was !== r.state && r.state === 'play' && N.battle.kind !== 'multi') { C.say(tr('Волна {0}!', [r.wave]), 2.5); snd.alarm(); }
  });
  // бой кончился, комната снова в лобби: с итогов «В КОМНАТУ» (или сразу, если итоги уже закрыли)
  N.on('lobby', () => { afterBattle = true; document.body.classList.remove('netOn', 'plOpen'); if (C.state === 'play' && !C.ended) { keepRoom = true; C.toMenu(); C.setup.game = 'online'; } if (inMenu()) { C.menu.panel(true); C.menu.render(); } });
  N.on('resupply', (e) => { if (team() === 'air') ctrls.air.netResupply(e); });
  N.on('spawn', (m) => { N.clog('spawn', { lives: m.lives, plane: m.plane, load: m.load.map((l) => l.key + ':' + l.n).join(',') }); if (team() === 'air') ctrls.air.netSpawn(m); });
  N.on('meHit', (hp, by, pk) => ctrls.air.netHit(hp, by, pk));
  N.on('meDown', () => { N.clog('down', { hp: C.player && C.player.hp, pos: C.player && C.player.pos.toArray().map(Math.round) }); ctrls.air.netDown(tr('Самолёт сбит')); });
  N.on('meAI', () => { N.clog('to_ai', { hidden: document.visibilityState }); ctrls.air.netAI(); });
  // журнал сбитий: своя команда — синим, противник — красным; под ником — техника, которой он управлял в этот момент
  const vehName = (v) => { const [k, key] = String(v || '').split(':'); return !key ? '' : k === 'p' ? (PLANES[key] || (CARRIERS[key] && CARRIERS[key].name) || key) : k === 'u' ? (SAM[key] ? SAM[key].short : key) : (AG[key] ? AG[key].short : key); };
  N.on('kill', (who, whom, by, wt, mt, wv, mv) => { feed.push({ t: performance.now(), who: trIf(who), whom: trIf(whom), by: trIf(by), wt, mt, wv: vehName(wv), mv: vehName(mv) }); if (feed.length > 6) feed.shift(); });
  N.on('help', (m) => { feed.push({ t: performance.now(), s: tr('{0}: Мне нужна помощь!', [m.name]), help: true }); helps.push({ t: performance.now(), name: m.name, p: m.p }); if (snd.help) snd.help(); else snd.alarm(); });
  // «Нужна помощь»: не чаще раза в HELP_CD с; p — [x, z] (самолёт, свой комплекс или место на карте)
  let helpAt = -1e9;
  C.askHelp = (p) => {
    const left = O.HELP_CD - (performance.now() - helpAt) / 1000;
    if (left > 0) { C.say(tr('Просить помощи снова можно через {0} с', [Math.ceil(left)]), 2); snd.deny(); return false; }
    helpAt = performance.now(); N.help(p); C.say(tr('Союзникам: «Нужна помощь!» — знак на их карте'), 2); snd.click(); return true;
  };
  // знак «внимание»: жёлтый треугольник с чёрным ободком и чёрным «!» (s — половина стороны, px)
  // метка «Нужна помощь» на картах — значок «hazard-sign» (icons.js): жёлтый на тёмной подложке
  let HZ = null;
  C.drawWarn = (g, x, y, s = 9) => {
    if (!HZ && typeof Path2D === 'function') HZ = new Path2D(ICON.help);
    g.save(); g.fillStyle = 'rgba(16,20,15,.85)'; g.fillRect(x - s * 1.25, y - s * 1.25, s * 2.5, s * 2.5);
    if (HZ) { const k = (s * 2.3) / 512; g.translate(x - s * 1.15, y - s * 1.15); g.scale(k, k); g.fillStyle = '#facc15'; g.fill(HZ); }
    g.restore();
  };
  // ═════════════ Игроки: кто в сети и кто готов (кнопка «Игроки» вверху, во всех онлайн-боях) ═════════════
  const plBtn = $('plBtn'), plEl = $('plPanel');
  function renderPl() {
    const r = N.room; if (!r || !document.body.classList.contains('plOpen')) return;
    const multi = r.kind === 'multi', TN = multi ? MW.TEAM_NAME : O.ROLE_NAMES, TT = multi ? MW.TEAMS : ['air', 'pvo'], me = N.me && N.me.id, myT = N.myTeam();
    const ph = { plan: multi ? tr('подготовка') : tr('расстановка'), play: tr('бой'), debrief: tr('итоги'), end: tr('итоги боя') }[r.state] || '', ready = r.state === 'plan';
    plEl.innerHTML = `<div class="plh">${tr('<b>Комната {0}</b> · {1} · {2}{3}', [r.code, MODES[r.mode].name, ph, r.left != null ? tr(' · {0} с', [r.left]) : ''])}<button data-pl="x" aria-label="${tr('Закрыть')}">${ico('close')}</button></div>` +
      TT.map((t) => `<div class="plt" style="color:${t === myT ? '#93c5fd' : '#fca5a5'}">${TN[t]}${multi && r.atk ? (r.atk === t ? tr(' · волна') : tr(' · ПВО')) : ''}</div>` + r.players.filter((p) => p.team === t).map((p) =>
        `<div class="plr${p.id === me ? ' me' : ''}"><i class="pld ${p.bot ? 'bot' : p.away ? 'off' : 'on'}"></i><b>${pnm(p)}</b>${p.bot ? ` <span class="dim">${tr('бот')}</span>` : p.away ? ` <span class="dim">${tr('нет связи')}</span>` : ''}<span class="plx">${tr('{0}{1} · {2} оч.{3}', [p.lives != null ? tr('вылетов {0} · ', [p.lives]) : '', p.kills || 0, p.score || 0, ready ? (p.ready ? ` <b class="okc">${ico('ok', 'ii')}</b>` : ' <span class="dim">…</span>') : ''])}</span></div>`).join('')).join('') +
      `<div class="dim pll">${tr('{0} в сети · {1} нет связи · {2} бот{3} · число — сбито / уничтожено', ['<i class="pld on"></i>', '<i class="pld off"></i>', '<i class="pld bot"></i>', ready ? ' · ' + ico('ok', 'ii') + tr('готов') : ''])}</div>`;
  }
  plBtn.onclick = (e) => { e.stopPropagation(); document.body.classList.toggle('plOpen'); snd.click(); renderPl(); };
  plEl.addEventListener('pointerdown', (e) => e.stopPropagation());
  plEl.onclick = (e) => { if (e.target.closest('[data-pl="x"]')) { document.body.classList.remove('plOpen'); snd.click(); } };
  N.on('room', renderPl);
  N.on('chat', () => ctrls.defense.chatSync());
  N.on('roundEnd', (m) => { ctrls.defense.setNetRes(m); C.say(tr('Раунд {0}: {1} разрушил {2}% ценности объектов{3}', [m.round, MW.TEAM_NAME[m.atk], Math.round(m.k * 100), m.last ? '' : tr(' · стороны меняются')]), 6); });
  N.on('waveEnd', (m) => {
    // итоги волны: вклад каждой роли — цели, подавленные РЛС, сбитые охотники и ударники
    const det = tr('РЛС уничтожено: {0} · сбито охотников за ПВО: {1}, ударников: {2}', [m.radarKills || 0, m.downsSead || 0, Math.max(0, (m.downs || 0) - (m.downsSead || 0))]);
    C.say(m.last ? `${m.totalK >= O.WIN_K ? tr('Авиация уничтожила цели') : tr('Последняя волна отбита')} · ${det}` : tr('Волна {0} окончена · уничтожено {1}% ценности целей · {2}{3}', [m.wave, Math.round(m.totalK * 100), det, m.lead ? tr(' · ведёт {0}', [m.lead === 'air' ? tr('авиация') : tr('ПВО')]) : '']), 7);
    if (team() === 'pvo') ctrls.defense.setNetRes(m);
    else { N.myCraft = false; ctrls.air.netWaveOut(); } // уцелевший самолёт — на базу: сервер его уже убрал
  });
  // итог боя: «Мульти-волна» — «Два раунда», «Вылет и оборона» — «Табло команд» (endscr.js); очки рейтинга и награда доезжают из claimOnline
  N.on('end', (m) => {
    const me = N.myPlayer();
    if (m.kind === 'multi') {
      const b = boardMw(m, me, pnm);
      C.showEnd({ again: tr('В комнату'), title: b.title, win: b.win, online: b });
    } else {
      const b = boardOl(m, me, pnm);
      C.showEnd({ again: tr('В комнату'), title: b.title, win: b.win, online: b });
    }
    if (m.result && C.claimOnline) C.claimOnline(m.result);
  });
  N.on('lost', () => { hideModal(); if (C.state === 'play' && C.lastGame === 'online' && !C.ended) C.showEnd({ title: tr('Связь потеряна'), reason: tr('Не удалось вернуться в бой: комната закрыта или сервер недоступен'), win: null, stats: [], events: [], dur: 0 }); }); // без ленты событий: журнал этого боя на экране «Связь потеряна» не нужен

  // ═════════════ Окна поверх игры: переподключение, возвращение в комнату, «покинуть комнату?» ═════════════
  const md = $('netModal');
  let mdKind = null;
  function showModal(kind, title, text, btns, spin) {
    mdKind = kind;
    md.innerHTML = `<div class="nmb">${spin ? '<div class="nms"></div>' : ''}<b>${title}</b><p>${text}</p><div class="nmr">${btns.map(([l, , alt], i) => `<button class="btn${alt ? ' alt' : ''}" data-nm="${i}">${l}</button>`).join('')}</div></div>`;
    md.onclick = (e) => { const b = e.target.closest('[data-nm]'); if (b) { snd.click(); btns[+b.dataset.nm][1](); } };
    md.classList.add('on');
  }
  function hideModal(kind) { if (kind && mdKind !== kind) return; mdKind = null; md.classList.remove('on'); }
  // связь оборвалась в комнате или в бою — переподключаемся сами; бой на сервере идёт, место держится
  function renderRe() {
    if (!N.re) { hideModal('re'); return; }
    const s = Math.round((performance.now() - N.re.t0) / 1000);
    showModal('re', tr('Связь потеряна'), `${tr('Переподключаемся{0}… {1} с<br>', [N.re.n > 1 ? tr(' · попытка {0}', [N.re.n]) : '', s])}<span class="dim">${tr('Ваше место в команде сохранено{0}.', [N.battle ? tr(', бой продолжается (самолёт пока ведёт ИИ)') : ''])}</span>`,
      [[tr('Выйти в меню'), () => { N.stopRe(); hideModal(); keepRoom = false; if (C.state === 'play') C.toMenu(); }, true]], true);
  }
  N.on('re', renderRe); setInterval(() => { if (N.re) renderRe(); }, 1000);
  // «В КОМНАТУ» после итогов: комната вернётся в лобби, когда все нажмут (или кончится показ итогов) — до тех пор это окно
  let backWait = false;
  function renderBack() {
    const r = N.room;
    if (!backWait || !r || r.state !== 'end') { if (backWait && (!r || r.state === 'lobby')) backWait = false; hideModal('back'); return; }
    const hs = r.players.filter((p) => !p.bot && !p.away);
    showModal('back', tr('Возвращаемся в комнату {0}', [r.code]), `${tr('Ждём остальных игроков{0}…<br>', [r.left ? tr(', не дольше {0} с', [r.left]) : ''])}<span class="dim">${tr('Людей в комнате: {0}', [hs.length])}</span>`,
      [[tr('Выйти из комнаты'), () => { backWait = false; hideModal(); N.leave(); afterBattle = false; C.menu.render(); }, true]], true);
  }
  N.on('room', renderBack);
  // уйти из комнаты (итоги, пауза) — переспросить: комнату с друзьями потерять легко, вернуться — только по коду
  function confirmLeave(go, inBattle) {
    if (!N.room || N.conn !== 'on') { go(); return; }
    showModal('leave', inBattle ? tr('Покинуть бой?') : tr('Покинуть комнату?'), inBattle ? tr('Вы действительно хотите покинуть бой и текущую комнату? Ваш самолёт или комплексы дальше поведёт ИИ.') : tr('Вы действительно хотите покинуть текущую комнату? Вернуться можно будет только по коду.'),
      [[tr('Покинуть'), () => { hideModal(); go(); }], [tr('Остаться'), () => hideModal(), true]]);
  }
  const close0 = $('closeBtn').onclick, pexit0 = $('pauseExit').onclick;
  $('closeBtn').onclick = () => (C.lastGame === 'online' ? confirmLeave(close0) : close0());
  $('pauseExit').onclick = () => (C.lastGame === 'online' && N.battle ? confirmLeave(pexit0, true) : pexit0());

  // ═════════════ Журнал боя (что видела игра): ошибки, частота кадров, зеркало ═════════════
  let fr = 0, frT = performance.now();
  addEventListener('error', (e) => { if (N.battle) N.clog('js_error', `${e.message} @ ${(e.filename || '').split('/').pop()}:${e.lineno}`); });
  addEventListener('unhandledrejection', (e) => { if (N.battle) N.clog('js_error', String(e.reason && e.reason.stack || e.reason).slice(0, 600)); });
  document.addEventListener('visibilitychange', () => { if (N.battle) N.clog('visibility', document.visibilityState); });
  // идёт онлайн-бой — запись раз в 5 с (main.js LIVE): вкладка вылетит — при следующем открытии игра сама вернётся в бой, а сервер
  // получит, что было перед вылетом (пресет, карта, память, кадры). Обычный конец боя и выход её стирают
  // хранилище вкладки (sessionStorage): переживает перезагрузку и вылет этой вкладки, но не видно новым — иначе вторая вкладка сама отбирала
  // место у живой, и они перехватывали его по кругу (ревью 2026-10-27)
  const LIVE_K = 'fortuna_ad_live', ss = { set(k, v) { try { sessionStorage.setItem(k, v); } catch (_) { /* приватный режим */ } } }, liveOff = () => ss.set(LIVE_K, '');
  setInterval(() => {
    if (!N.battle || N.conn !== 'on' || C.state !== 'play' || C.ended) return;
    const R = C.renderer, gm = R && R.info && R.info.memory, pm = performance.memory;
    ss.set(LIVE_K, JSON.stringify({ t: Date.now(), kind: N.battle.kind, q: C.P.name, map: C.MAP, fps: C.fps || 0, geo: gm ? gm.geometries : 0, tex: gm ? gm.textures : 0, prog: R && R.info.programs ? R.info.programs.length : 0,
      heap: pm ? Math.round(pm.usedJSHeapSize / 1048576) : 0, pr: R ? Math.round(R.getPixelRatio() * 100) / 100 : 0, vw: C.VW, vh: C.VH, up: Math.round(performance.now() / 1000), view: C.ctrl === ctrls.defense ? ctrls.defense.st.view : 'air' }));
  }, 5000);
  for (const ev of ['lobby', 'end', 'lost']) N.on(ev, liveOff);
  if (C.LIVE && !new URLSearchParams(location.search).get('ad')) { // открылись после вылета посреди боя: подключаемся сразу; сервер вернёт на своё место (hello → takeSeat)
    C.setup.game = 'online'; let done = false;
    N.on('conn', () => {
      if (done || N.conn !== 'on') return; done = true; liveOff();
      N.clog('reload', { ...C.LIVE, ago: Math.round((Date.now() - C.LIVE.t) / 1000), resumed: N.resumed ? 1 : 0 });
      if (!N.resumed) C.say(tr('Бой, из которого вас выбросило, уже закрыт'), 4);
    });
  }
  setInterval(() => {
    if (!N.battle || C.state !== 'play') return;
    const s = (performance.now() - frT) / 1000; frT = performance.now();
    N.clog('client', { fps: Math.round(fr / s), q: C.P.name, team: team(), view: C.ctrl === ctrls.defense ? ctrls.defense.st.view : C.ctrl === ctrls.air ? 'air' : '?', units: C.S ? C.S.units.length : 0, air: C.raid ? C.raid.planes.length : 0,
      sams: C.S ? C.S.sams.length : 0, me: C.player && !C.player.dead ? { hp: Math.round(C.player.hp), alt: Math.round(C.player.pos.y), fuel: Math.round((C.player.fuel ?? 1) * 100) } : null, touch: C.IS_TOUCH ? 1 : 0 });
    fr = 0;
  }, 30000);
  // ═════════════ Журнал сбитий и метки «нужна помощь» (поверх HUD) ═════════════
  // значок слева от «Игроков»: сколько осталось фазы (сервер шлёт раз в секунду; часы раунда «Мульти-волны» — из строки сверху
  // перенесены сюда), задержка и потери. DOM — только при смене текста
  const chip = $('netChip'); let chipS = null;
  function netChip() {
    const l = N.room && N.room.left != null ? N.room.left : null, p = Math.round(N.ping || 0), on = N.conn === 'on' && p > 0;
    const s = (l != null ? `<b>${Math.floor(l / 60)}:${String(l % 60).padStart(2, '0')}</b>` : '') +
      `<small class="${!on || N.pl >= 10 || p >= 300 ? 'bad' : N.pl > 0 || p >= 150 ? 'mid' : ''}">${on ? tr('{0} мс · PL {1}%', [p, N.pl]) : tr('связь…')}</small>`;
    if (s !== chipS) { chipS = s; chip.innerHTML = s; }
  }
  C.extraHud = () => {
    if (!N.battle || C.state !== 'play') return;
    fr++; netChip();
    const hx = C.hx, now = performance.now();
    feed = feed.filter((f) => now - f.t < 6000); helps = helps.filter((h) => now - h.t < O.HELP_T * 1000);
    hx.textAlign = 'right'; hx.font = '600 12px "Golos Text", -apple-system, Segoe UI, sans-serif'; hx.shadowColor = 'rgba(0,0,0,.85)'; hx.shadowBlur = 4;
    const myT = N.myTeam(), col = (t, a) => (!t ? `rgba(255,255,255,${a})` : t === myT ? `rgba(96,165,250,${a})` : `rgba(248,113,113,${a})`);
    let y = 70;
    for (const f of feed) {
      const a = Math.min(1, (6000 - (now - f.t)) / 800);
      if (f.help) { hx.fillStyle = `rgba(253,186,116,${a})`; hx.fillText(f.s, C.VW - 60, y); y += 17; continue; }
      // справа налево: « · оружие», ник цели, « → », ник стрелка; под никами — техника мелко
      let x = C.VW - 60; hx.font = '600 12px "Golos Text", -apple-system, Segoe UI, sans-serif';
      const tail = f.by ? ` · ${f.by}` : '', wTail = hx.measureText(tail).width; hx.fillStyle = `rgba(226,232,240,${a})`; hx.fillText(tail, x, y); x -= wTail;
      const wWhom = hx.measureText(f.whom).width; hx.fillStyle = col(f.mt, a); hx.fillText(f.whom, x, y); const cWhom = x - wWhom / 2; x -= wWhom;
      const arr = ' → ', wArr = hx.measureText(arr).width; hx.fillStyle = `rgba(226,232,240,${a})`; hx.fillText(arr, x, y); x -= wArr;
      const wWho = hx.measureText(f.who).width; hx.fillStyle = col(f.wt, a); hx.fillText(f.who, x, y); const cWho = x - wWho / 2;
      if (f.wv || f.mv) {
        hx.font = '500 10px "Golos Text", -apple-system, Segoe UI, sans-serif'; hx.textAlign = 'center';
        if (f.wv) { hx.fillStyle = col(f.wt, a * 0.85); hx.fillText(`(${f.wv})`, cWho, y + 12); }
        if (f.mv) { hx.fillStyle = col(f.mt, a * 0.85); hx.fillText(`(${f.mv})`, cWhom, y + 12); }
        hx.textAlign = 'right'; y += 12;
      }
      y += 17;
    }
    hx.shadowBlur = 0;
    // помощь союзнику: на карте — знак у места (рисуют air.js / defense.js); не на карте — подсвечена кнопка карты и знак рядом
    // (на ПК кнопки нет — знак и подсказка вверху по центру)
    const air = C.ctrl === ctrls.air, onMap = air ? ctrls.air.mapOn : C.ctrl === ctrls.defense ? ctrls.defense.st.view === 'map' : true, glow = helps.length > 0 && !onMap;
    const mb = $(air ? 'tMap' : 'opMap'), r = mb.getBoundingClientRect ? mb.getBoundingClientRect() : null;
    for (const id of ['tMap', 'opMap']) { const on = glow && id === mb.id; if ($(id).classList.contains('helpGlow') !== on) $(id).classList.toggle('helpGlow', on); }
    if (glow) {
      const h = helps[helps.length - 1];
      if (r && r.width) C.drawWarn(hx, r.left - 16, r.top + r.height / 2, 10);
      else { const y = 64; C.drawWarn(hx, C.VW / 2, y, 11); hx.textAlign = 'center'; hx.font = '700 12px "Golos Text", -apple-system, Segoe UI, sans-serif'; hx.fillStyle = '#fde047'; hx.shadowColor = 'rgba(0,0,0,.85)'; hx.shadowBlur = 4; hx.fillText(tr('{0}: нужна помощь — {1}: карта', [h.name, air ? 'M' : 'Q']), C.VW / 2, y + 26); hx.shadowBlur = 0; }
    }
  };
  C.netHelps = () => helps; // для тактической карты ПВО

  // строка рейтинга в итогах боя: аккаунт игры — «Рейтинг: +882»; аккаунт сайта — очки лежат и засчитаются после переноса прогресса
  const ratingNote = (r, acc) => {
    if (!r || typeof r.points !== 'number') return '';
    const body = acc.kind === 'airdef' ? (r.parts && r.parts.idle ? tr('Рейтинг: 0 — без действий в бою') : tr('Рейтинг: <b>+{0}</b>', [r.points.toLocaleString(LANG === 'en' ? 'en-US' : 'ru-RU')]))
      : r.points > 0 ? tr('Очки рейтинга: <b>{0}</b> — засчитаются, когда перенесёте прогресс в аккаунт игры', [r.points.toLocaleString(LANG === 'en' ? 'en-US' : 'ru-RU')]) : '';
    return body ? `<div class="pgRes ratLine">${ico('rating')} ${body}</div>` : '';
  };
  // награда за онлайн-бой: подписанный сервером итог → функция airdef-claim (результат в таблицу, награда по правилам «Летки»)
  C.claimOnline = async (token) => {
    try {
      if (typeof CONFIG === 'undefined' || !CONFIG.SUPABASE_URL) return;
      const acc = activeAcc(); if (!acc || String(acc.id).startsWith('rmock-')) return; // аккаунт игры, иначе сайта; заглушка рейтинга (?rmock=1) боёв не засчитывает
      const key = String(CONFIG.SUPABASE_ANON_KEY).replace(/[^\x21-\x7E]/g, '');
      const res = await fetch(CONFIG.SUPABASE_URL + '/functions/v1/airdef-claim', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key, apikey: key }, body: JSON.stringify({ player_id: acc.id, token }) });
      const d = await res.json().catch(() => ({}));
      const parts = []; if (d.details) parts.push(tr('+{0} деталей', [d.details])); if (d.keys) parts.push(`+${d.keys} ${ico('key', 'ii')}`); if (d.ticket) parts.push(d.ticket === 'ticket' ? tr('+1 билет') : '+1 ' + ico('key', 'ii'));
      const needG = res.status === 403 && d.need_game; // у аккаунта сайта нет прогресса игры: дальше — как гость (account.js оповестит)
      if (needG && acc.kind === 'site') siteNoProgress();
      const note = res.ok ? (parts.length ? tr('Награда: {0}', [parts.join(', ')]) : d.online_rewards_left === 0 ? tr('Наградные бои на сегодня закончились — результат засчитан') : tr('Результат засчитан')) : needG ? tr('Создайте аккаунт игры — бой не засчитан') : esc(d.error || tr('Не удалось засчитать бой'));
      const el = $('endNote'); if (el) el.innerHTML = `<b>${note}</b><br>` + ratingNote(d.rating, acc) + el.innerHTML;
      if (C.endScr) { // табло: очки рейтинга, место и ячейки сезона, награда прокачки
        const cl = { rating: d.rating, acc, note, board: null, off: !!d.offseason }; C.endScr.claimed(cl); if (d.progress) C.endScr.reward(d.progress); // off — межсезонье: бой в рейтинг не идёт
        if (d.rating && acc.kind === 'airdef' && C.rating) C.rating.fresh().then((b) => { if (b) { cl.board = b; C.endScr.claimed(cl); } }).catch(() => {});
      }
      if (d.rating && C.rating) C.rating.reset(); // очки боя в таблице сезона: обновить при следующем показе
      if (d.progress && C.progress) { if (el) el.insertAdjacentHTML('afterbegin', `<div class="pgRes">${C.progress.rewardHtml(d.progress)}</div>`); C.progress.refresh(); } // прокачка: опыт и серебро за бой
      N.clog('claim', { ok: res.ok, d });
    } catch (e) { N.clog('claim_fail', String(e)); }
  };
  // выход в меню посреди боя — уходим из комнаты
  // после боя «В КОМНАТУ» — остаться (keepRoom: комната вернётся в лобби), «Закрыть» и выход из боя — уйти из комнаты
  const toMenu0 = C.toMenu;
  let booted = false; // первый вызов — показ меню при загрузке: комната (вернулись в неё после перезагрузки под карту) остаётся
  C.toMenu = function () { if (booted && (N.battle || N.room) && !keepRoom) { N.leave(); afterBattle = false; } if (booted) liveOff(); booted = true; keepRoom = false; planEl.style.display = 'none'; document.body.classList.remove('netOn', 'plOpen'); for (const id of ['tMap', 'opMap']) $(id).classList.remove('helpGlow'); toMenu0(); };
  // ?ad=КОД — приглашение: сразу режим «Онлайн» и вход в комнату
  const inv = new URLSearchParams(location.search).get('ad');
  if (inv) { C.setup.game = 'online'; let done = false; N.on('conn', () => { if (N.conn === 'on' && !done && !N.room) { done = true; N.join(O.cleanCode(inv)); } }); N.connect(); }
  else if (new URLSearchParams(location.search).get('mp') === '1' || C.LIVE) { C.setup.game = 'online'; N.connect(); } // сайт: кнопка «Онлайн-бой» — сразу раздел онлайна; C.LIVE — возвращение в бой после вылета
  return { N, panel, primary, primaryText, onClick, again() {
    if (N.room && (N.room.state === 'end' || N.room.state === 'lobby')) { keepRoom = true; C.toMenu(); C.setup.game = 'online'; C.menu.panel(true); C.menu.render(); if (N.room.state === 'end') { backWait = true; N.back(); renderBack(); } return; } // в ту же комнату
    C.toMenu(); C.setup.game = 'online'; if (N.conn === 'on') N.queue(ui.mode, ui.role, ui.kind === 'multi' ? 'multi' : undefined); C.menu.panel(true); C.menu.render();
  } };
}
