// Онлайн «Воздушного превосходства» - интерфейс: режим «Онлайн» в меню (быстрый бой по роли, комнаты 1×1 … 6×6, вход по
// коду, лобби), окно ожидания поверх живого фона меню, выбор связки лётчиком перед волной (видно, что выбрали союзники),
// переход в бой (лётчик - air.js, ПВО - defense.js в режиме онлайна), итоги волн и боя, журнал сбитий (6 с) и
// «Мне нужна помощь!» союзникам (метка в кадре и на карте). Связь и зеркало боя - net.js.
/* global THREE, CONFIG */
import { tr, trIf, XL, LOCALE, L10N } from './i18n.js?v=20261127a';
import { trFmt } from './i18n-fmt.js?v=20261127a';
import { createNet } from './net.js?v=20261127a';
import * as O from './sim/online.js?v=20261127a';
import * as MW from './sim/online-multi.js?v=20261127a';
import { AG, SAM, CARRIERS, LOADOUTS, PLANES, ERAS, loadoutRole, ROLE_NAME, AVA_SHOP } from './arsenal.js?v=20261127a';
import { retiredHidden } from './progress.js?v=20261127a';
import { MODES } from './sim/strike.js?v=20261127a';
import { ICON, ico } from './icons.js?v=20261127a';
import { activeAcc, siteAcc, siteNoProgress, authBody, RMOCK } from './account.js?v=20261127a';
import { lobbyMark, nickMark, premById, premByName, drawWings, wingsW } from './prem.js?v=20261127a';
import { avaSrc } from './avatar.js?v=20261127a';
import { boardOl, boardMw } from './endscr.js?v=20261127a';
import { createMM } from './mm.js?v=20261127a';
import { podBuiltIn } from './models.js?v=20261127a';

// значки «Своей комнаты» (Mark 2026-11-17, макет «Ангарные таблички»): сторона авиации звездой, бот - робот
const STAR_E = '<svg class="ic star" viewBox="0 0 24 24"><path fill="#d8332a" stroke="#f3e7c8" stroke-width="1.2" d="M12 1.8l2.9 7.2 7.6.4-5.9 4.9 2 7.5L12 17.6l-6.6 4.2 2-7.5-5.9-4.9 7.6-.4z"/></svg>';
const STAR_W = '<svg class="ic star" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#28427a" stroke="#f3e7c8" stroke-width="1.2"/><path fill="#fff" d="M12 4.2l2 5 5.3.3-4.1 3.4 1.4 5.2L12 15.2l-4.6 2.9 1.4-5.2-4.1-3.4 5.3-.3z"/></svg>';
const DICE = '<svg class="ic" viewBox="0 0 24 24"><path fill="currentColor" d="M4 2h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm3.5 3.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm9 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-4.5 4.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm9 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg>';
const BOT = '<svg class="ic" viewBox="0 0 24 24"><path fill="currentColor" d="M11 2h2v3h4a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3h4zM8.5 10a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm7 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM8 15v2h8v-2zM1 10h2v5H1zm20 0h2v5h-2z"/></svg>';
const TEAM_PIC = { air: 'air_e_mig27', pvo: 'pvo_buk', east: 'air_e_su24', west: 'air_f16' };
const pnm = (p) => esc(p.bot ? trIf(p.name) : p.name); // позывные ботов приходят с сервера по-русски
const ROLES = [['air', tr('Авиация')], ['pvo', tr('ПВО')], ['any', tr('Любая')]];
const SIDES = [['random', tr('Случайно')], ['west', tr('Запад')], ['east', tr('Восток')]];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createOnline(C, ctrls) {
  const { $, ls, snd } = C;
  const N = createNet(C); C.netc = N;
  // проверять сервер после неудачи - только пока игрок в разделе «Онлайн» на экране (net.js failed); раз в секунду - обратный отсчёт в панели
  N.wanted = () => C.state === 'menu' && C.setup && C.setup.game === 'online' && !document.hidden;
  setInterval(() => {
    if (N.conn !== 'error' || !N.down) return;
    const el = document.querySelector('#menu .odl'); if (el) el.textContent = String(N.downLeft());
    if (!N.probing && Date.now() >= N.down.until && N.wanted()) N.connect(); // пауза вышла, пока панели не было на экране
  }, 1000);
  const ui = { kind: ls.get('fortuna_ad_kind') || 'air', mode: ls.get('fortuna_ad_mode') || 'arcade', role: ls.get('fortuna_ad_role') || 'any', size: +(ls.get('fortuna_ad_size') || 2), era: +(ls.get('fortuna_ad_era') || 2), sideAir: ls.get('fortuna_ad_side') || 'random', fill: ls.get('fortuna_ad_fill') !== '0', code: '' };
  const saveUi = () => { ls.set('fortuna_ad_kind', ui.kind); ls.set('fortuna_ad_mode', ui.mode); ls.set('fortuna_ad_role', ui.role); ls.set('fortuna_ad_size', String(ui.size)); ls.set('fortuna_ad_era', String(ui.era)); ls.set('fortuna_ad_side', ui.sideAir); ls.set('fortuna_ad_fill', ui.fill ? '1' : '0'); };
  const seg = (id, cur, items) => `<div class="seg" data-oseg="${id}">${items.map(([v, l]) => `<button data-v="${v}" class="${String(v) === String(cur) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const inMenu = () => C.state === 'menu' && C.setup.game === 'online';
  const rerender = () => { if (inMenu()) C.menu.render(); renderWait(); };
  let feed = [], helps = [], keepRoom = false, afterBattle = false, endQuick = false; // keepRoom - в меню, не выходя из комнаты; afterBattle - лобби после боя

  // ═════════════ Меню: вкладка «Бой» в режиме «Онлайн» ═════════════
  function panel(el) {
    if (N.conn !== 'on') {
      if (N.conn === 'off' || (N.conn === 'error' && (!N.down || Date.now() >= N.down.until) && !N.probing) || (N.conn === 'noacc' && N.account())) N.connect(); // сервер не отвечал (N.down) - перерисовка не подключается, проверку ведёт net.js по паузам // 'noacc' - аккаунт появился (вошли, пришёл статус сайта): подключаемся с ним
      const guest = N.conn === 'noacc' || N.conn === 'needgame'; // гость: онлайн только с аккаунтом игры
      el.innerHTML = `<div class="cat-h">${tr('Онлайн')}</div><p class="hint">${N.conn === 'noacc' ? tr('Онлайн - только с аккаунтом игры. Войдите или создайте его.')
        : N.conn === 'needgame' ? tr('Создайте аккаунт игры - онлайн только с ним.')
        : N.conn === 'error' ? (N.probing ? tr('Сервер онлайна сейчас недоступен - проверяем…') : N.down ? tr('Сервер онлайна сейчас недоступен. Проверим снова сами через {0} с.', [`<b class="odl">${N.downLeft()}</b>`]) : tr('Сервер онлайна сейчас недоступен. Попробуйте позже.')) : tr('Подключаемся к серверу…')}</p>${N.conn === 'error' && !N.probing ? `<button class="btn alt" data-oa="retry">${tr('Проверить сейчас')}</button>` : ''}${guest ? `<button class="btn alt" data-oa="acc">${tr('Войти или создать аккаунт')}</button>` : ''}`;
      return;
    }
    const r = N.room;
    if (r && r.state === 'lobby') return lobby(el, r);
    if (N.queued) { el.innerHTML = `<div class="cat-h">${tr('Поиск боя')}</div><p class="hint">${waitText()}</p>`; return; }
    const mw = ui.kind === 'multi';
    // макет «Плитки» (Mark 2026-11-17): игра и роль - картинками, меньше текста; своя комната и вход по коду - под кнопками
    const pic = (n, st) => `<img src="airdef/thumbs/${n}.webp?v=20261127a" alt="" style="${st}" onerror="this.style.visibility='hidden'">`;
    const tile = (v, cur, pics, l) => `<button data-v="${v}" class="${String(v) === String(cur) ? 'on' : ''}"><span class="opics">${pics}</span><em>${l}</em></button>`;
    const RP = { air: pic('air_e_mig27', 'left:8%;top:4%;width:84%;height:92%'), pvo: pic('pvo_buk', 'left:8%;top:4%;width:84%;height:92%'), any: pic('air_e_mig27', 'left:-4%;top:-6%;width:70%;height:80%') + pic('pvo_buk', 'right:-4%;top:22%;width:66%;height:80%') };
    if (ui.sub === 'room') { // своя комната: настройки клетками на табличке, «Создать» - большая кнопка внизу
      const cell = (v, cur, inner) => `<button data-v="${v}" class="${String(v) === String(cur) ? 'on' : ''}">${inner}</button>`;
      el.innerHTML = `<div class="rhead"><button class="rback" data-oa="sub" data-t="room">‹</button><b>${tr('Своя комната')}</b><span class="dim">${tr('· без рейтинга')}</span></div>
        <div class="rplate"><div class="rlbl">${tr('Формат')}</div><div class="seg rgrid" data-oseg="size">${O.AD_SIZES.map((n) => cell(n, ui.size, `<b>${n}×${n}</b>`)).join('')}</div>
        ${mw ? '' : `<div class="rlbl">${tr('Ваша авиация')}</div><div class="seg rgrid" data-oseg="side">${SIDES.map(([v, l]) => cell(v, ui.sideAir, `${v === 'random' ? DICE : v === 'west' ? STAR_W : STAR_E}<em>${l}</em>`)).join('')}</div>`}</div>
        <div class="rbox">${mw ? '' : seg('era', ui.era, ERAS.filter((e) => LOADOUTS[e.id]).map((e) => [e.id, e.short || e.name]))}<div class="seg rsw" data-oseg="fill"><button data-v="${ui.fill ? 0 : 1}" class="${ui.fill ? 'on' : ''}">${tr('боты')}<i></i></button></div></div>`;
      return;
    }
    if (ui.sub === 'code') {
      el.innerHTML = `<div class="rhead"><button class="rback" data-oa="sub" data-t="code">‹</button><b>${tr('По коду')}</b></div>
        <div class="rplate"><div class="rlbl">${tr('Код комнаты')}</div><div class="prow"><input id="adCode" maxlength="4" placeholder="${tr('Код')}" value="${esc(ui.code)}" style="text-transform:uppercase;width:110px"><button class="btn alt" data-oa="join" style="width:auto">${L10N.join}</button></div></div>`;
      return;
    }
    el.innerHTML = `<div class="seg otiles og" data-oseg="kind">${tile('air', ui.kind, pic('air_e_mig27', 'left:2%;top:0;width:58%;height:84%') + pic('pvo_hawk', 'right:2%;top:16%;width:50%;height:84%'), tr('Вылет и оборона'))}${tile('multi', ui.kind, pic('strike_kalibr', 'left:0;top:6%;width:60%;height:80%') + pic('strike_shahed', 'right:2%;top:18%;width:52%;height:78%'), tr('Мульти-волна'))}</div>
      <div class="oq"><div class="cat-h">${tr('Быстрый бой')} <span class="dim">${tr('· на рейтинг')}</span></div>
      ${seg('mode', ui.mode, O.AD_MODES.map((k) => [k, MODES[k].name]))}
      ${mw ? '' : `<div class="seg otiles orole" data-oseg="role">${ROLES.map(([v, l]) => tile(v, ui.role, RP[v], l)).join('')}</div>`}</div>
      <div class="ofoot"><button class="btn alt" data-oa="sub" data-t="room">${ico('players')} ${tr('Своя комната')}</button><button class="btn alt" data-oa="sub" data-t="code">${ico('key')} ${tr('По коду')}</button></div>`;
  }
  function lobby(el, r) {
    const me = N.myPlayer(), host = r.host === (N.me && N.me.id);
    const TN = r.kind === 'multi' ? MW.TEAM_NAME : O.ROLE_NAMES, TT = r.kind === 'multi' ? MW.TEAMS : ['air', 'pvo'];
    // команда - табличка (Mark 2026-11-17, макет «Ангарные таблички»): места аватарками, лампа - готов; пустое место - «+ бот» у хоста или «сюда»
    const seat = (p) => `<div class="rseat${p.id === (me && me.id) ? ' me' : ''}${p.ready ? ' ready' : ''}${p.prem && !p.bot ? ' prem' : ''}">${p.bot ? `<span class="rava bot">${BOT}</span>` : `<img class="rava" src="${avaSrc(p.ava)}" alt="">`}${lobbyMark(p.prem && !p.bot)}<i class="rlamp${p.ready ? ' on' : ''}"></i><em>${pnm(p)}</em>${host && p.bot ? `<button class="rkick" data-kick="${p.id}">×</button>` : ''}</div>`;
    const team = (t) => { const ps = r.players.filter((p) => p.team === t), free = Math.max(0, r.size - ps.length), mine = me && me.team === t;
      const empty = host ? `<button class="rseat empty" data-bot="${t}"><span class="rava">+</span><em>${tr('бот')}</em></button>` : !mine && me ? `<button class="rseat empty" data-oa="team" data-t="${t}"><span class="rava">↔</span><em>${tr('сюда')}</em></button>` : `<div class="rseat empty"><span class="rava"></span><em>&nbsp;</em></div>`;
      return `<div class="rteam t-${t}${mine ? ' on' : ''}"><div class="hd">${TEAM_PIC[t] ? `<img src="airdef/thumbs/${TEAM_PIC[t]}.webp?v=20261127a" alt="">` : ''}<b>${TN[t]}</b><i>${ps.length}/${r.size}</i></div><div class="rseats">${ps.map(seat).join('')}${free ? empty : ''}</div></div>`; };
    const sum = r.kind === 'multi' ? tr('Мульти-волна · {0} · {1}×{2}', [MODES[r.mode].name, r.size, r.size]) : tr('{0}×{1} · ранг {2} · {3}', [r.size, r.size, ERAS[r.era - 1].short || r.era, MODES[r.mode].name]);
    el.innerHTML = `<div class="rcode"><span class="rlabel">${r.code}</span><button class="rbtn" data-oa="invite">${ico('send')} ${tr('Позвать')}</button><button class="rbtn" data-oa="leave">${tr('Выйти')}</button></div>
      ${afterBattle ? `<p class="hint">${tr('<b>Бой окончен, вы снова в комнате.</b> Хост может сменить игру, режим, формат, ранг и сторону; затем все нажимают «Готов».')}</p>` : ''}
      ${host ? `<button class="rsum${ui.rset ? ' open' : ''}" data-oa="rset">${sum}</button>${ui.rset ? `<div class="rbox col"><div class="prow"><span>${tr('Игра')}</span>${seg('rkind', r.kind === 'multi' ? 'multi' : 'air', [['air', tr('Вылет и оборона')], ['multi', tr('Мульти-волна')]])}</div><div class="prow"><span>${tr('Формат')}</span>${seg('rsize', r.size, O.AD_SIZES.map((n) => [n, `${n}×${n}`]))}</div>${r.kind === 'multi' ? '' : `<div class="prow"><span>${tr('Ранг')}</span>${seg('rera', r.era, ERAS.filter((e) => LOADOUTS[e.id]).map((e) => [e.id, e.short || e.name]))}</div><div class="prow"><span>${tr('Авиация')}</span>${seg('rside', r.sideAir, SIDES.slice(1))}</div>`}<div class="prow"><span>${tr('Режим')}</span>${seg('rmode', r.mode, O.AD_MODES.map((k) => [k, MODES[k].name]))}</div></div>` : ''}`
        : `<div class="rsum">${sum}${r.kind === 'multi' ? '' : tr(' · авиация - {0}', [r.sideAir === 'east' ? tr('восток') : tr('запад')])}</div>`}
      ${TT.map(team).join('')}
      <p class="hint">${tr('Бой начнётся, когда все нажмут «Готов».')}</p>`;
  }
  // кнопка внизу карточки меню
  function primaryText() {
    if (N.conn === 'noacc' && !N.account() || N.conn === 'needgame') return tr('Войти или создать аккаунт');
    if (N.conn !== 'on') return tr('Онлайн');
    if (N.room && N.room.state === 'lobby') { const me = N.myPlayer(); return me && me.ready ? tr('Готов (снять)') : tr('Готов'); }
    if (ui.sub === 'room') return tr('Создать');
    return N.queued ? tr('Отменить поиск') : tr('Найти бой');
  }
  function primary() {
    if (N.conn === 'noacc' && !N.account() || N.conn === 'needgame') { openAcc(); return; }
    if (N.conn !== 'on') { N.connect(true); return; }
    if (N.room && N.room.state === 'lobby') { const me = N.myPlayer(); N.ready(!(me && me.ready)); return; }
    if (ui.sub === 'room' && !N.queued) { createRoom(); return; }
    if (N.queued) N.unqueue(); else N.queue(ui.mode, ui.role, ui.kind === 'multi' ? 'multi' : undefined);
  }
  const createRoom = () => { ui.sub = null; N.create(ui.kind === 'multi' ? { kind: 'multi', mode: ui.mode, size: ui.size, fill: ui.fill, era: 2 + Math.floor(Math.random() * 3) /* только для старого сервера до update.ps1 (у запада нет I); новый - игнорирует */ } : { mode: ui.mode, size: ui.size, era: ui.era, sideAir: ui.sideAir === 'random' ? null : ui.sideAir, fill: ui.fill, team: ui.role === 'any' ? null : ui.role }); };
  const openAcc = () => { if (C.account) C.account.open(siteAcc() ? 'reg' : 'login'); }; // у вошедшего на сайте новичка - сразу регистрация
  function onClick(e) {
    const b = e.target.closest('[data-v]'), sg = b && b.closest('[data-oseg]');
    if (sg) {
      const v = b.dataset.v, k = sg.dataset.oseg;
      if (k === 'kind') ui.kind = v; else if (k === 'mode') ui.mode = v; else if (k === 'role') ui.role = v; else if (k === 'size') ui.size = +v; else if (k === 'era') ui.era = +v; else if (k === 'side') ui.sideAir = v; else if (k === 'fill') ui.fill = v === '1';
      else if (k === 'rkind') N.opts({ kind: v }); else if (k === 'rsize') N.opts({ size: +v }); else if (k === 'rera') N.opts({ era: +v }); else if (k === 'rside') N.opts({ sideAir: v }); else if (k === 'rmode') N.opts({ mode: v });
      saveUi(); snd.click(); if (k === 'kind' && !N.room && !N.queued && mapFix(v, null)) return; rerender(); return;
    }
    const a = e.target.closest('[data-oa]'), bot = e.target.closest('[data-bot]'), kick = e.target.closest('[data-kick]');
    if (bot) { N.bot(bot.dataset.bot); return; }
    if (kick) { N.kick(+kick.dataset.kick); return; }
    if (!a) return;
    snd.click();
    switch (a.dataset.oa) {
      case 'retry': N.connect(true); break;
      case 'acc': openAcc(); break;
      case 'create': createRoom(); break;
      case 'rset': ui.rset = !ui.rset; rerender(); break;
      case 'join': { const v = ($('adCode') && $('adCode').value || '').toUpperCase(); ui.code = v; if (v.length === 4) N.join(v, ui.kind === 'multi' || ui.role === 'any' ? null : ui.role); break; }
      case 'sub': ui.sub = ui.sub === a.dataset.t ? null : a.dataset.t; rerender(); if (C.menu && C.menu.render) C.menu.render(); break; // свой экран «Своей комнаты» / «По коду»; кнопка внизу - «Создать» // «Своя комната» / «По коду» - раскрыть или свернуть
      case 'leave': N.leave(); break;
      case 'team': N.team(a.dataset.t); break;
      case 'invite': invite(); break;
    }
  }
  function invite() {
    const url = `https://fortunawtm.com/airsuperiority/${XL ? 'en/' : ''}?ad=${N.room.code}` /* красивая ссылка (/airsuperiority/ → игра с тем же ?ad=; со слешем - без лишнего перенаправления GitHub Pages); в английской игре - /en/: превью по-английски */, text = tr('Бой «Air Superiority Online»: комната {0}', [N.room.code]);
    try { const tg = window.Telegram && window.Telegram.WebApp; if (tg && tg.openTelegramLink) { tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`); return; } } catch (_) { /* не Telegram */ }
    if (navigator.share) { navigator.share({ title: text, url }).catch(() => {}); return; }
    try { navigator.clipboard.writeText(url); C.say(tr('Ссылка скопирована'), 2); } catch (_) { C.say(tr('Код комнаты: {0}', [N.room.code]), 3); }
  }

  // ═════════════ Ожидание поиска - экран подбора поверх живого фона меню (mm.js: техника, кольцо, «Отменить»; без ников) ═════════════
  const mm = createMM(C, () => N.unqueue());
  function waitText() {
    const q = N.queued; if (!q) return '';
    const sec = Math.floor((performance.now() - q.t) / 1000), w = N.qwait ? Math.max(0, Math.ceil((N.qwait - performance.now()) / 1000)) : 0;
    return tr('{0}{1}{2} · ищем {3}:{4}{5}', [q.kind === 'multi' ? tr('Мульти-волна · ') : '', MODES[q.mode].name, q.kind === 'multi' ? '' : tr(' · роль: {0}', [ROLES.find((r) => r[0] === ui.role)[1]]), Math.floor(sec / 60), String(sec % 60).padStart(2, '0'), w ? tr(' · набралось 2 на 2 - старт через {0} с', [w]) : '']);
  }
  function renderWait() {
    const q = N.queued;
    // бой нашёлся: сервер шлёт room раньше start - экран подбора держим, пока не закроются створки (уберёт enterBattle, уже в 'play')
    if (!q || C.state !== 'menu') { if (C.state !== 'menu' || !(C.doors.busy || (mm.on && N.room && N.room.state !== 'lobby'))) mm.hide(); return; }
    const w = N.qwait ? Math.max(0, Math.ceil((N.qwait - performance.now()) / 1000)) : 0;
    mm.show({ t0: q.t, mode: `${q.kind === 'multi' ? tr('Мульти-волна · ') : ''}${MODES[q.mode].name}${q.kind === 'multi' ? '' : tr(' · роль: {0}', [ROLES.find((r) => r[0] === ui.role)[1]])}`,
      info: w ? tr('Соперники найдены - старт через <b>{0}</b> с', [w]) : tr('Ждём соперников') }); // живого числа ищущих сервер не шлёт - без него
  }
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
    if (C.G && C.G.nearScale) C.G.nearScale(N.battle && N.battle.kind !== 'multi' && team() === 'air' ? 0.5 : 1); // за самолёт - земля вблизи в половинном радиусе (как в main.js start)
    if (N.battle && N.battle.kind === 'multi') { C.ctrl = ctrls.defense; ctrls.defense.startNetMulti(N); }
    else if (team() === 'air') { C.ctrl = ctrls.air; ctrls.air.startNet(N); } else { C.ctrl = ctrls.defense; ctrls.defense.startNet(N); }
    feed = []; helps = []; renderWait(); renderPlan();
    document.body.classList.add('netOn'); // кнопка «Игроки»
  }
  // выбор загрузки лётчиком перед волной - «Ангар» (Mark 2026-11-24, вариант Б, Интерфейс/Выбор техники/_чистовые): слева самолёты, в центре раскрытый крупно и команда,
  // справа его загрузки. Нажатие на самолёт - только раскрыть (planOpen - на клиенте, перерисовка по «room» его не сбрасывает), на загрузку - купить.
  let planOpen = null, planKey = '', planHtml = '';
  function renderPlan() {
    const r = N.room, show = !!(N.battle && N.battle.kind !== 'multi' && r && r.state === 'plan' && team() === 'air');
    document.body.classList.toggle('apick', show); planEl.style.display = show ? 'block' : 'none'; if (!show) { planHtml = ''; planKey = ''; return; }
    const B = N.battle, me = N.myPlayer(), LO = LOADOUTS[B.era], key = `${B.era}|${B.sideAir}|${r.wave}`; if (key !== planKey) { planKey = key; planOpen = null; }
    const allies = r.players.filter((p) => p.team === 'air' && p.id !== me.id), others = allies.map((p) => (p.choice !== null ? LO[p.choice] : null)), nAir = allies.length + 1;
    const cur = me.choice !== null ? LO[me.choice] : null, back = cur ? O.loadoutCostFor(cur, r.lead) : 0;
    const list = LO.map((L, i) => ({ L, i })).filter(({ L }) => L.side === B.sideAir && O.netOk(L) && !retiredHidden(C.progress && C.progress.P, L.plane)).map((q) => { // вертолёты - пока только одиночная игра (НАР в онлайне - с 2026-10-22)
      const cost = O.loadoutCostFor(q.L, r.lead), miss = r.mode === 'real' && C.progress && C.progress.ready() ? C.progress.loadoutMissing(q.L) : []; // «Про»: только купленное
      return { ...q, cost, role: loadoutRole(q.L), need: miss.length ? C.progress.needText(miss) : '', why: miss.length ? 'lock' : O.roleDeny(q.L, others, nAir) ? 'hunt' : cost > me.budget + back ? 'exp' : '' };
    });
    const planes = []; for (const q of list) { let p = planes.find((x) => x.k === q.L.plane); if (!p) planes.push(p = { k: q.L.plane, lo: [] }); p.lo.push(q); }
    if (!planes.length) return;
    for (const p of planes) p.why = p.lo.every((q) => q.why) ? (p.lo.every((q) => q.why === 'lock') ? 'lock' : p.lo.some((q) => q.why === 'exp') ? 'exp' : 'hunt') : ''; // самолёт тусклый, только если недоступны все его загрузки
    const P0 = planes.find((p) => p.k === planOpen) || (cur && planes.find((p) => p.k === cur.plane)) || planes.find((p) => !p.why) || planes[0];
    const hunters = others.filter((x) => x && loadoutRole(x) === 'sead').length + (cur && loadoutRole(cur) === 'sead' ? 1 : 0), cap = O.huntCap(nAir), full = hunters >= cap;
    const air = (k) => `<img src="airdef/thumbs/air_${k}.webp?v=20261127a" alt="" onerror="this.style.visibility='hidden'">`, rIco = (x) => ico(x === 'sead' ? 'radar' : 'target');
    const role = (x, word) => `<i class="nrl ${x}${word ? ' w' : ''}" title="${trIf(ROLE_NAME[x])}">${rIco(x)}${word ? `<em>${trIf(ROLE_NAME[x])}</em>` : ''}</i>`;
    const why = (w, need) => (w === 'lock' ? `<span class="nwhy lk" title="${esc(need || '')}">${ico('lock')}</span>` : w === 'hunt' ? `<span class="nwhy">${ico('radar')}${hunters}/${cap}</span>` : w === 'exp' ? `<span class="nwhy">${tr('дорого')}</span>` : '');
    const cell = (cap, v, c = '') => `<span class="ncell ${c}">${cap ? (cap[0] === '<' ? cap : `<small>${cap}</small>`) : ''}<b>${v}</b></span>`;
    const head = cell(tr('Волна'), `${r.wave}/${O.WAVES}`) + cell(tr('очки'), `${me.budget}${r.lead === 'air' ? `<u class="bad">${tr('цены +10 %')}</u>` : ''}`, 'am') + cell(ico('radar'), `${hunters}/${cap}`, full ? 'rd' : '') + cell(tr('вылеты'), `${me.lives ?? O.RESPAWNS[r.wave - 1] + 1}${r.lead === 'pvo' ? '<u>+1</u>' : ''}`);
    const mate = (p) => { const L = p.choice !== null ? LO[p.choice] : null, rl = L ? loadoutRole(L) : ''; return `<span class="nmate ${p.ready ? 'ok' : ''}"><span class="im">${L ? air(L.plane) : '<b>?</b>'}${L ? `<i class="r ${rl}">${rIco(rl)}</i>` : ''}${p.ready ? `<i class="k">${ico('ok')}</i>` : ''}</span><span class="tx"><b>${pnm(p)}</b><em>${L ? `${role(rl)}${trIf(PLANES[L.plane])}` : tr('выбирает…')}</em></span></span>`; };
    const tiles = (L) => L.items.map(([k, n]) => `<span class="nwt"><img src="airdef/thumbs/wpn_${k}.webp?v=20261127a" alt="${esc(trIf(AG[k].short))}" onerror="this.style.visibility='hidden'"><u>×${n}</u></span>`).join('') + (L.pod ? `<span class="nwt pod" title="${podBuiltIn(L.plane) ? tr('прицел') : tr('контейнер')}">${ico('target')}</span>` : '');
    const big = P0.lo.length <= 3, mine = cur && cur.plane === P0.k, none = !cur && list.some((q) => !q.why);
    const html = `<div class="nhead">${head}</div><div class="nbox"><div class="npl c${planes.length > 8 ? 3 : 2}">${planes.map((p) => `<button class="ncard ${p === P0 ? 'on' : ''} ${p.why ? 'no' : ''}" data-op="${p.k}">${air(p.k)}<b>${trIf(PLANES[p.k])}</b>${why(p.why, p.lo[0].need)}${cur && cur.plane === p.k && p !== P0 ? '<i class="mark"></i>' : ''}</button>`).join('')}</div>
      <div class="nmid">${allies.length ? `<div class="nteam n${allies.length} ${allies.length <= 2 ? 'nwide' : 'ntiny'}">${allies.map(mate).join('')}</div>` : ''}<div class="nhero">${air(P0.k)}<span class="cap"><b>${trIf(PLANES[P0.k])}</b>${mine ? role(loadoutRole(cur), true) : ''}</span></div>${mine ? `<div class="nset">${cur.items.map(([k, n]) => `${trIf(AG[k].short)} ×${n}`).join(' · ')}</div>` : ''}
      <button class="ngo ${none ? 'off' : me.ready ? 'dn' : ''}" data-oa="pready" ${none ? 'disabled' : ''}>${tr('Готов')}${me.ready ? `<i>${ico('ok')}</i>` : ''}</button></div>
      <div class="nlo ${big ? 'big' : 'row'}" style="--n:${P0.lo.length}">${P0.lo.map((q) => `<button class="ncard ${me.choice === q.i ? 'on' : ''} ${q.why ? 'no ' + q.why : ''}" data-bi="${q.i}">${big ? `<span class="t">${role(q.role, true)}<s></s>${why(q.why, q.need)}<b class="pr">${q.cost}</b></span><span class="tl">${tiles(q.L)}</span>` : `${role(q.role)}<span class="tl">${tiles(q.L)}</span><span class="e"><b class="pr">${q.cost}</b>${why(q.why, q.need)}</span>`}</button>`).join('')}</div></div>`;
    if (html !== planHtml) planEl.innerHTML = planHtml = html; // без лишней замены разметки: обновление комнаты раз в секунду не съедает нажатие
  }
  planEl.onclick = (e) => {
    const b = e.target.closest('[data-bi]'), p = e.target.closest('[data-op]'), a = e.target.closest('[data-oa]');
    if (p) { planOpen = p.dataset.op; snd.click(); renderPlan(); }
    if (b) { N.buyAir(+b.dataset.bi); snd.click(); }
    if (a && a.dataset.oa === 'pready') { const me = N.myPlayer(); N.ready(!(me && me.ready)); snd.click(); }
  };

  // ═════════════ События сети ═════════════
  N.on('conn', rerender);
  N.on('conn', () => { if (N.conn === 'on' && C.doors.held) setTimeout(() => { if (!N.room && !N.battle) C.doors.release(true); }, 4000); }); // после перезагрузки под карту комнаты, а комнаты уже нет
  N.on('room', () => { if (C.account && C.account.refresh) C.account.refresh(); }); // зашли в комнату / вышли - окно аккаунта открыто: кнопки смены аккаунта закрыть / открыть
  N.on('queue', rerender);
  N.on('err', (m) => { C.say(trFmt(m), 3); rerender(); }); // сообщения сервера - по-русски: переводим на клиенте
  N.on('deny', (m) => { N.clog('deny', m); const t = trFmt(m); C.say(t, 2.5); snd.deny(); if (ctrls.defense.st.net) ctrls.defense.st.msg = t; });
  // карта комнаты: «Мульти-волна» - «Северный рубеж», «Вылет и оборона» - случайная на каждый бой (сервер: r.map, «Речной узел» или «Северный
  // рубеж», Mark 2026-10-27; старый сервер карту не шлёт - город). Карта строится при загрузке страницы: не та - перезагружаемся под неё;
  // сервер держит место (в лобби - 30 с, в бою - как при обрыве) и тот же аккаунт возвращает в комнату.
  // map - карта комнаты из сообщения сервера; null - комнаты нет (выбор игры в меню): подходит любая из случайных, что уже загружена
  let mapGo = false;
  // doors - бой нашёлся: перезагрузка за закрытыми створками (новая страница начнётся с них, doors.js carry)
  function mapFix(kind, map, doors = false) {
    if (mapGo) return true; // уже уходим на другую карту
    const k = kind === 'multi' ? 'multi' : 'air'; ls.set('fortuna_ad_kind', k);
    if (k === 'air') ls.set('fortuna_ad_omap', map !== null ? (C.RAND_MAPS.includes(map) ? map : 'city') : C.RAND_MAPS.includes(C.MAP) ? C.MAP : 'city');
    if (C.wantMap('online') === C.MAP) return false;
    C.setup.game = 'online'; C.saveSetup(); // после перезагрузки - снова раздел онлайна, карта - комнаты
    mapGo = true; N.quit = true; // уходящая страница не переподключается (иначе две вкладки одного аккаунта отнимают место друг у друга)
    N.clog('map_reload', k); C.say(tr('Загружаем карту комнаты…'), 5);
    const u = new URL(location.href); u.searchParams.delete('ad'); u.searchParams.set('mp', '1'); if (k === 'air') u.searchParams.set('omap', ls.get('fortuna_ad_omap') || map || 'city'); else u.searchParams.delete('omap');
    if (doors) C.doors.run(() => { C.doors.carry('online'); location.replace(u.href); }, true); else location.replace(u.href);
    return true;
  }
  // бой нашёлся: створки (doors.js) - экран подбора уходит за ними; повторный вызов, пока створки идут, - сразу (бой уже на сервере)
  // (с экрана итогов, C.state === 'play', - сразу, как было)
  // wave - бой открылся за створками позже (не в этом же вызове): надпись «Волна N!», если волна уже идёт (возврат в бой)
  const enterNow = (wave) => { if (C.state === 'play') return; enterBattle(); if (N.battle && (team() === 'pvo' || N.battle.kind === 'multi')) ctrls.defense.netSync(); renderPlan();
    const r = N.room; if (wave && r && r.state === 'play' && N.battle && N.battle.kind !== 'multi') { C.say(tr('Волна {0}!', [r.wave]), 2.5); snd.alarm(); } };
  const enterDoors = () => { let now = true; C.doors.run(() => enterNow(!now), true); now = false; };
  N.on('start', () => { if (N.battle && mapFix(N.battle.kind, N.battle.map || null, true)) return; if (C.state === 'play') enterBattle(); else enterDoors(); });
  N.on('room', (was) => {
    if (N.room && !(C.ended && N.room.state === 'lobby') && mapFix(N.room.kind, N.room.map || 'city', N.room.state !== 'lobby')) return;
    if (N.room && N.room.state === 'lobby') C.doors.release(true); // створки с перезагрузки, а впереди лобби - открыть // на экране итогов - не перезагружаться: карту новой комнаты - по «В комнату» (again)
    rerender();
    const r = N.room; if (!r || !N.battle || r.state === 'end' || r.state === 'lobby') return; // итоги и лобби - не бой
    if (C.state !== 'play') { if (!C.doors.busy) enterDoors(); if (C.state !== 'play') return; } // створки идут - синхронизация в enterNow, когда бой откроется
    if (team() === 'pvo' || N.battle.kind === 'multi') ctrls.defense.netSync();
    renderPlan();
    if (was !== r.state && r.state === 'play' && N.battle.kind !== 'multi') { C.say(tr('Волна {0}!', [r.wave]), 2.5); snd.alarm(); }
  });
  // бой кончился, комната снова в лобби: с итогов «В КОМНАТУ» (или сразу, если итоги уже закрыли)
  N.on('lobby', () => { afterBattle = true; document.body.classList.remove('netOn', 'plOpen'); if (C.state === 'play' && !C.ended) { keepRoom = true; C.toMenu(); C.setup.game = 'online'; } if (inMenu()) { C.menu.panel(true); C.menu.render(); } });
  N.on('resupply', (e) => { if (team() === 'air') ctrls.air.netResupply(e); });
  N.on('spawn', (m) => { myPlane = m.plane || myPlane; N.clog('spawn', { lives: m.lives, plane: m.plane, load: m.load.map((l) => l.key + ':' + l.n).join(',') }); if (team() === 'air') ctrls.air.netSpawn(m); });
  N.on('meHit', (hp, by, pk) => ctrls.air.netHit(hp, by, pk));
  N.on('meDown', () => { N.clog('down', { hp: C.player && C.player.hp, pos: C.player && C.player.pos.toArray().map(Math.round) }); ctrls.air.netDown(tr('Самолёт сбит')); });
  N.on('meAI', () => { N.clog('to_ai', { hidden: document.visibilityState }); ctrls.air.netAI(); });
  // журнал сбитий: своя команда - синим, противник - красным; под ником - техника, которой он управлял в этот момент
  const vehName = (v) => { const [k, key] = String(v || '').split(':'); return !key ? '' : k === 'p' ? (PLANES[key] || (CARRIERS[key] && CARRIERS[key].name) || key) : k === 'u' ? (SAM[key] ? SAM[key].short : key) : (AG[key] ? AG[key].short : key); };
  const pushKill = (who, whom, by, wt, mt, wv, mv) => { feed.push({ t: performance.now(), who: trIf(who), whom: trIf(whom), by: trIf(by), wt, mt, wv: vehName(wv), mv: vehName(mv), pw: premByName(N, who), pm: premByName(N, whom) }); if (feed.length > 6) feed.shift(); };
  N.on('kill', pushKill);
  N.on('help', (m) => { feed.push({ t: performance.now(), s: tr('{0}: Мне нужна помощь!', [m.name]), help: true }); helps.push({ t: performance.now(), name: m.name, p: m.p }); if (snd.help) snd.help(); else snd.alarm(); });
  // «Нужна помощь»: не чаще раза в HELP_CD с; p - [x, z] (самолёт, свой комплекс или место на карте)
  let helpAt = -1e9;
  C.askHelp = (p) => {
    const left = O.HELP_CD - (performance.now() - helpAt) / 1000;
    if (left > 0) { C.say(tr('Просить помощи снова можно через {0} с', [Math.ceil(left)]), 2); snd.deny(); return false; }
    helpAt = performance.now(); N.help(p); C.say(tr('Союзникам: «Нужна помощь!» - знак на их карте'), 2); snd.click(); return true;
  };
  // знак «внимание»: жёлтый треугольник с чёрным ободком и чёрным «!» (s - половина стороны, px)
  // метка «Нужна помощь» на картах - значок «hazard-sign» (icons.js): жёлтый на тёмной подложке
  let HZ = null;
  C.drawWarn = (g, x, y, s = 9) => {
    if (!HZ && typeof Path2D === 'function') HZ = new Path2D(ICON.help);
    g.save(); g.fillStyle = 'rgba(16,20,15,.85)'; g.fillRect(x - s * 1.25, y - s * 1.25, s * 2.5, s * 2.5);
    if (HZ) { const k = (s * 2.3) / 512; g.translate(x - s * 1.15, y - s * 1.15); g.scale(k, k); g.fillStyle = '#facc15'; g.fill(HZ); }
    g.restore();
  };
  // ═════════════ Игроки: кто в сети и кто готов (кнопка «Игроки» вверху, во всех онлайн-боях) ═════════════
  const plBtn = $('plBtn'), plEl = $('plPanel');
  // Табло сбоку (Mark 2026-11-20, макет «Табло и расстановка»): цель авиации (полоса и порог победы), команды, по игроку - связь, техника, ник со знаком премиума, метка
  // (вы / бот / связь / сбит), сбито или уничтожено, очки. До 4 на команду - одна колонка, больше - панель шире, команды в две колонки, строки плотнее.
  // Открывается кнопкой «Игроки», закрывается ею же (кнопка подсвечена, пока открыто); обновляется раз в секунду. Лента сбитий уходит левее панели (extraHud)
  const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}`;
  let myPlane = null, plH = ''; const techC = new Map(); // myPlane - мой самолёт (из 'spawn'); techC - картинка техники игрока, запомненная за бой (сбитый самолёт из зеркала исчезает)
  const airs = () => (C.raid && C.raid.planes) || [];
  function techOf(r, p) { // самолёт - из зеркала боя (у своего - из 'spawn'), у ПВО - первый его комплекс; нет - пусто
    const key = r.code + ':' + p.id, pl = p.id === (N.me && N.me.id) ? { plane: myPlane } : airs().find((a) => a.owner === p.id && a.plane), u = !(pl && pl.plane) && C.S ? C.S.units.find((q) => q.owner === p.id) : null;
    const t = pl && pl.plane ? 'air_' + pl.plane : u ? 'pvo_' + u.key : ''; if (t) techC.set(key, t); return t || techC.get(key) || '';
  }
  const downed = (r, p, me) => r.state === 'play' && r.kind !== 'multi' && p.team === 'air' && (p.id === me ? !!(C.player && C.player.dead) : !airs().some((a) => a.owner === p.id && !a.dead && !a.out)); // самолёта в воздухе нет
  function renderPl() {
    const r = N.room; if (!r || !document.body.classList.contains('plOpen')) return;
    const multi = r.kind === 'multi', TN = multi ? MW.TEAM_NAME : O.ROLE_NAMES, TT = multi ? MW.TEAMS : ['air', 'pvo'], me = N.me && N.me.id, myT = N.myTeam();
    const ph = { plan: multi ? tr('подготовка') : tr('расстановка'), play: tr('бой'), debrief: tr('итоги'), end: tr('итоги боя') }[r.state] || '', ready = r.state === 'plan';
    const per = TT.map((t) => r.players.filter((p) => p.team === t)), two = Math.max(...per.map((l) => l.length)) > 4, vk = ((N.battle && N.battle.valueK != null ? N.battle.valueK : r.valueK) || 0), pct = Math.round(Math.min(1, vk) * 100), win = Math.round(O.WIN_K * 100);
    const row = (p) => {
      const th = p.tech || techOf(r, p), dn = p.down != null ? p.down : downed(r, p, me), rd = ready ? (p.ready ? `<b class="okc">${ico('ok', 'ii')}</b>` : '<span class="dim">…</span>') : '';
      const tag = dn ? `<span class="qtg dn">${tr('сбит ')}${typeof dn === 'number' ? ' · ' + mmss(dn) : ''}</span>` : p.away ? `<span class="qtg off">${two ? tr('связь') : tr('нет связи')}</span>` : p.bot ? `<span class="qtg bot">${tr('бот')}</span>` : p.id === me ? `<span class="qtg me">${tr('вы')}</span>` : '',
        lv = p.lives != null && p.team === 'air' && r.state === 'play' ? `<span class="dim" title="${tr('вылетов {0}', [p.lives])}">×${p.lives}</span>` : '';
      return `<div class="qrow${p.id === me ? ' me' : ''}${dn ? ' dn' : ''}"><i class="qdot ${p.bot ? 'bot' : p.away ? 'off' : 'on'}"></i>${th ? `<img class="qth" src="airdef/thumbs/${th}.webp?v=20261127a" alt="" onerror="this.style.visibility='hidden'">` : '<span></span>'}<span class="qnk">${pnm(p)}${nickMark(p.prem && !p.bot)}</span><span>${tag}${lv ? ' ' + lv : ''}${rd ? ' ' + rd : ''}</span><span class="qn">${p.kills || 0}</span><span class="qn qbig">${p.score || 0}</span></div>`;
    };
    const team = (t, i) => `<div><div class="gs O" style="color:${t === myT ? '#7fb2e6' : '#e48a6c'}"><span style="flex:1;min-width:0">${TN[t]}${multi && r.atk ? (r.atk === t ? tr(' · волна') : tr(' · ПВО')) : ''}</span><span class="qch" style="width:28px;text-align:right;margin:0">${(multi ? r.atk === t : t === 'air') ? tr('уничт.') : tr('сбито')}</span><span class="qch" style="width:32px;text-align:right;margin:0">${tr('очки')}</span></div>${per[i].map(row).join('')}</div>`;
    const html = `<div class="phd"><span class="O">${tr('<b>Комната {0}</b> · {1} · {2}{3}', [r.code, MODES[r.mode].name, !multi && r.state === 'play' && r.wave ? tr('волна {0}/{1}', [r.wave, O.WAVES]) : ph, ''])}</span>${r.left != null ? `<span class="O am">${mmss(r.left)}</span>` : ''}</div>` +
      (!multi ? `<div class="pgoal"><span class="O tA">${TN.air} · ${pct} %</span><div class="qbar"><i style="width:${pct}%"></i><b style="left:${win}%"></b></div><span class="O am">${tr('цель {0} %', [win])}</span></div>` : '') +
      `<div class="pgrid">${TT.map(team).join('')}</div>` +
      `<div class="pll">${tr('{0} в сети · {1} нет связи · {2} бот{3} · число - сбито / уничтожено', ['<i class="pld on"></i>', '<i class="pld off"></i>', '<i class="pld bot"></i>', ready ? ' · ' + ico('ok', 'ii') + tr('готов') : ''])} · ${tr('закрыть - ещё раз «Игроки»')}</div>`;
    plEl.classList.toggle('two', two);
    if (html !== plH) { plH = html; plEl.innerHTML = html; }
  }
  setInterval(renderPl, 1000); // сбит / вылеты / связь меняются между обновлениями комнаты
  plBtn.onclick = (e) => { e.stopPropagation(); document.body.classList.toggle('plOpen'); snd.click(); plH = ''; feedAt = 0; renderPl(); };
  plEl.addEventListener('pointerdown', (e) => e.stopPropagation());
  N.on('room', renderPl);
  N.on('chat', () => ctrls.defense.chatSync());
  N.on('roundEnd', (m) => { ctrls.defense.setNetRes(m); C.say(tr('Раунд {0}: {1} разрушил {2}% ценности объектов{3}', [m.round, MW.TEAM_NAME[m.atk], Math.round(m.k * 100), m.last ? '' : tr(' · стороны меняются')]), 6); });
  N.on('waveEnd', (m) => {
    // итоги волны: вклад каждой роли - цели, подавленные РЛС, сбитые охотники и ударники
    const det = tr('РЛС уничтожено: {0} · сбито охотников за ПВО: {1}, ударников: {2}', [m.radarKills || 0, m.downsSead || 0, Math.max(0, (m.downs || 0) - (m.downsSead || 0))]);
    C.say(m.last ? `${m.totalK >= O.WIN_K ? tr('Авиация уничтожила цели') : tr('Последняя волна отбита')} · ${det}` : tr('Волна {0} окончена · уничтожено {1}% ценности целей · {2}{3}', [m.wave, Math.round(m.totalK * 100), det, m.lead ? tr(' · ведёт {0}', [m.lead === 'air' ? tr('авиация') : tr('ПВО')]) : '']), 7);
    if (team() === 'pvo') ctrls.defense.setNetRes(m);
    else { N.myCraft = false; ctrls.air.netWaveOut(); } // уцелевший самолёт - на базу: сервер его уже убрал
  });
  // итог боя: «Мульти-волна» - «Два раунда», «Вылет и оборона» - «Табло команд» (endscr.js); очки рейтинга и награда доезжают из claimOnline
  // быстрый бой - без «В комнату» (Mark 2026-10-27: «не имеет смысла»): кнопка ищет новый бой с теми же настройками (again)
  N.on('end', (m) => {
    endQuick = !!(N.room && N.room.quick); // сервер через 25 с переводит комнату в лобби и снимает quick - кнопка помнит, каким был бой
    const me = N.myPlayer(), again = endQuick ? tr('Найти бой') : tr('В комнату');
    for (const p of m.players || []) if (p.prem == null) p.prem = premById(N, p.id); // сервер список итогов без премиума шлёт - знак по комнате (там флаг из билета)
    if (m.kind === 'multi') {
      const b = boardMw(m, me, pnm);
      C.showEnd({ again, title: b.title, win: b.win, online: b });
    } else {
      const b = boardOl(m, me, pnm);
      C.showEnd({ again, title: b.title, win: b.win, online: b });
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
  // связь оборвалась в комнате или в бою - переподключаемся сами; бой на сервере идёт, место держится
  function renderRe() {
    if (!N.re) { hideModal('re'); return; }
    const s = Math.round((performance.now() - N.re.t0) / 1000);
    showModal('re', tr('Связь потеряна'), `${tr('Переподключаемся{0}… {1} с<br>', [N.re.n > 1 ? tr(' · попытка {0}', [N.re.n]) : '', s])}<span class="dim">${tr('Ваше место в команде сохранено{0}.', [N.battle ? tr(', бой продолжается (самолёт пока ведёт ИИ)') : ''])}</span>`,
      [[tr('Выйти в меню'), () => { N.stopRe(); hideModal(); keepRoom = false; if (C.state === 'play') C.toMenu(); }, true]], true);
  }
  N.on('re', renderRe); setInterval(() => { if (N.re) renderRe(); }, 1000);
  // «В КОМНАТУ» после итогов: комната вернётся в лобби, когда все нажмут (или кончится показ итогов) - до тех пор это окно
  let backWait = false;
  function renderBack() {
    const r = N.room;
    if (!backWait || !r || r.state !== 'end') { if (backWait && (!r || r.state === 'lobby')) backWait = false; hideModal('back'); return; }
    const hs = r.players.filter((p) => !p.bot && !p.away);
    showModal('back', tr('Возвращаемся в комнату {0}', [r.code]), `${tr('Ждём остальных игроков{0}…<br>', [r.left ? tr(', не дольше {0} с', [r.left]) : ''])}<span class="dim">${tr('Людей в комнате: {0}', [hs.length])}</span>`,
      [[tr('Выйти из комнаты'), () => { backWait = false; hideModal(); N.leave(); afterBattle = false; C.menu.render(); }, true]], true);
  }
  N.on('room', renderBack);
  // уйти из комнаты (итоги, пауза) - переспросить: комнату с друзьями потерять легко, вернуться - только по коду
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
  // идёт онлайн-бой - запись раз в 5 с (main.js LIVE): вкладка вылетит - при следующем открытии игра сама вернётся в бой, а сервер
  // получит, что было перед вылетом (пресет, карта, память, кадры). Обычный конец боя и выход её стирают
  // хранилище вкладки (sessionStorage): переживает перезагрузку и вылет этой вкладки, но не видно новым - иначе вторая вкладка сама отбирала
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
  // значок слева от «Игроков»: сколько осталось фазы (сервер шлёт раз в секунду; часы раунда «Мульти-волны» - из строки сверху
  // перенесены сюда), задержка и потери. DOM - только при смене текста
  const chip = $('netChip'); let chipS = null;
  function netChip() {
    const l = N.room && N.room.left != null ? N.room.left : null, p = Math.round(N.ping || 0), on = N.conn === 'on' && p > 0;
    const s = (l != null ? `<b>${Math.floor(l / 60)}:${String(l % 60).padStart(2, '0')}</b>` : '') +
      `<small class="${!on || N.pl >= 10 || p >= 300 ? 'bad' : N.pl > 0 || p >= 150 ? 'mid' : ''}">${on ? tr('{0} мс · PL {1}%', [p, N.pl]) : tr('связь…')}</small>`;
    if (s !== chipS) { chipS = s; chip.innerHTML = s; }
  }
  wingsW(1); // знак для ленты сбитий - грузим заранее
  const PH = 13; // высота знака премиума в ленте сбитий - строка 12 px; картинку грузит drawWings при первом показе, wingsW до этого 0
  let feedY0 = 70, feedAt = 0, feedX = 0, feedOff = false; // верх ленты сбитий (см. extraHud); feedOff - лента скрыта (открыто табло)
  C.extraHud = () => {
    if (!N.battle || C.state !== 'play') return;
    fr++; netChip();
    const hx = C.hx, now = performance.now();
    feed = feed.filter((f) => now - f.t < 6000); helps = helps.filter((h) => now - h.t < O.HELP_T * 1000);
    hx.textAlign = 'right'; hx.font = '600 12px "Golos Text", -apple-system, Segoe UI, sans-serif'; hx.shadowColor = 'rgba(0,0,0,.85)'; hx.shadowBlur = 4;
    const myT = N.myTeam(), col = (t, a) => (!t ? `rgba(255,255,255,${a})` : t === myT ? `rgba(96,165,250,${a})` : `rgba(248,113,113,${a})`);
    // верх ленты - под кнопками справа сверху (Игроки, связь, полный экран, звук, пауза): с отступом Telegram они ниже 70 px; пересчёт раз в 30 кадров
    if (!feedAt || fr - feedAt > 30) {
      feedAt = fr; let b = 0;
      for (const id of ['plBtn', 'netChip', 'fsBtn', 'mute', 'pause']) { const e = document.getElementById(id), r = e && e.getBoundingClientRect ? e.getBoundingClientRect() : null; if (r && r.height > 0 && r.right > C.VW - 320 && r.top < 160) b = Math.max(b, r.bottom); }
      feedY0 = Math.max(70, Math.round(b) + 16);
      const pr = document.body.classList.contains('plOpen') && plEl.getBoundingClientRect ? plEl.getBoundingClientRect() : null; feedX = pr && pr.width ? Math.round(pr.left) - 12 : C.VW - 60; // открыто табло «Игроки» - лента левее него
      feedOff = !!(pr && pr.width && (C.VW < 1100 || pr.left < C.VW * 0.6)); // телефон или широкое табло (две колонки): ленте слева места нет - она налезала на приборы; счёт и так в табло
    }
    let y = feedY0;
    for (const f of feedOff ? [] : feed) {
      const a = Math.min(1, (6000 - (now - f.t)) / 800);
      if (f.help) { hx.fillStyle = `rgba(253,186,116,${a})`; hx.fillText(f.s, feedX || C.VW - 60, y); y += 17; continue; }
      // справа налево: « · оружие», ник цели, « → », ник стрелка; под никами - техника мелко
      let x = feedX || C.VW - 60; hx.font = '600 12px "Golos Text", -apple-system, Segoe UI, sans-serif';
      const tail = f.by ? ` · ${f.by}` : '', wTail = hx.measureText(tail).width; hx.fillStyle = `rgba(226,232,240,${a})`; hx.fillText(tail, x, y); x -= wTail;
      if (f.pm) { const w = wingsW(PH); if (w) { drawWings(hx, x - w, y - 4, PH, a); x -= w + 4; } } // знак премиума после ника цели (рисуем справа налево: сначала знак, левее - ник)
      const wWhom = hx.measureText(f.whom).width; hx.fillStyle = col(f.mt, a); hx.fillText(f.whom, x, y); const cWhom = x - wWhom / 2; x -= wWhom;
      const arr = ' → ', wArr = hx.measureText(arr).width; hx.fillStyle = `rgba(226,232,240,${a})`; hx.fillText(arr, x, y); x -= wArr;
      if (f.pw) { const w = wingsW(PH); if (w) { drawWings(hx, x - w, y - 4, PH, a); x -= w + 4; } } // то же у стрелка
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
    // помощь союзнику: на карте - знак у места (рисуют air.js / defense.js); не на карте - подсвечена кнопка карты и знак рядом
    // (на ПК кнопки нет - знак и подсказка вверху по центру)
    const air = C.ctrl === ctrls.air, onMap = air ? ctrls.air.mapOn : C.ctrl === ctrls.defense ? ctrls.defense.st.view === 'map' : true, glow = helps.length > 0 && !onMap;
    const mb = $(air ? 'tMore' : 'opMap'), r = mb.getBoundingClientRect ? mb.getBoundingClientRect() : null; // у самолёта «Карта» спрятана под «Ещё» (ряд открывается по нему)
    for (const id of ['tMore', 'tMap', 'opMap']) { const on = glow && (id === mb.id || (air && id === 'tMap')); if ($(id).classList.contains('helpGlow') !== on) $(id).classList.toggle('helpGlow', on); }
    if (glow) {
      const h = helps[helps.length - 1];
      if (r && r.width) C.drawWarn(hx, r.left - 16, r.top + r.height / 2, 10);
      else { const y = 64; C.drawWarn(hx, C.VW / 2, y, 11); hx.textAlign = 'center'; hx.font = '700 12px "Golos Text", -apple-system, Segoe UI, sans-serif'; hx.fillStyle = '#fde047'; hx.shadowColor = 'rgba(0,0,0,.85)'; hx.shadowBlur = 4; hx.fillText(tr('{0}: нужна помощь - {1}: карта', [h.name, air ? 'M' : 'Q']), C.VW / 2, y + 26); hx.shadowBlur = 0; }
    }
  };
  C.netHelps = () => helps; // для тактической карты ПВО

  // строка рейтинга в итогах боя: аккаунт игры - «Рейтинг: +882»; аккаунт сайта - очки лежат и засчитаются после переноса прогресса
  const ratingNote = (r, acc) => {
    if (!r || typeof r.points !== 'number') return '';
    const body = acc.kind === 'airdef' ? (r.parts && r.parts.idle ? tr('Рейтинг: 0 - без действий в бою') : tr('Рейтинг: <b>+{0}</b>', [r.points.toLocaleString(LOCALE)]))
      : r.points > 0 ? tr('Очки рейтинга: <b>{0}</b> - засчитаются, когда перенесёте прогресс в аккаунт игры', [r.points.toLocaleString(LOCALE)]) : '';
    return body ? `<div class="pgRes ratLine">${ico('rating')} ${body}</div>` : '';
  };
  // награда за онлайн-бой: подписанный сервером итог → функция airdef-claim (результат в таблицу, награда по правилам «Летки»)
  C.claimOnline = async (token) => {
    try {
      if (typeof CONFIG === 'undefined' || !CONFIG.SUPABASE_URL) return;
      const acc = activeAcc(); if (!acc || String(acc.id).startsWith('rmock-')) return; // аккаунт игры, иначе сайта; заглушка рейтинга (?rmock=1) боёв не засчитывает
      const key = String(CONFIG.SUPABASE_ANON_KEY).replace(/[^\x21-\x7E]/g, '');
      const res = await fetch(CONFIG.SUPABASE_URL + '/functions/v1/airdef-claim', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key, apikey: key }, body: JSON.stringify({ ...authBody(acc), token }) }); // итог подписан сервером на этого игрока; ключ - на будущее
      const d = await res.json().catch(() => ({}));
      const parts = []; if (d.details) parts.push(tr('+{0} деталей', [d.details])); if (d.keys) parts.push(`+${d.keys} ${ico('key', 'ii')}`); if (d.ticket) parts.push(d.ticket === 'ticket' ? tr('+1 билет') : '+1 ' + ico('key', 'ii'));
      const needG = res.status === 403 && d.need_game; // у аккаунта сайта нет прогресса игры: дальше - как гость (account.js оповестит)
      if (needG && acc.kind === 'site') siteNoProgress();
      const note = res.ok ? (parts.length ? tr('Награда: {0}', [parts.join(', ')]) : d.online_rewards_left === 0 ? tr('Наградные бои на сегодня закончились - результат засчитан') : tr('Результат засчитан')) : needG ? tr('Создайте аккаунт игры - бой не засчитан') : esc(d.error || tr('Не удалось засчитать бой'));
      const el = $('endNote'); if (el) el.innerHTML = `<b>${note}</b><br>` + ratingNote(d.rating, acc) + el.innerHTML;
      if (C.endScr) { // табло: очки рейтинга, место и ячейки сезона, награда прокачки
        const cl = { rating: d.rating, acc, note, board: null, off: !!d.offseason }; C.endScr.claimed(cl); if (d.progress) C.endScr.reward(d.progress); // off - межсезонье: бой в рейтинг не идёт
        if (d.rating && acc.kind === 'airdef' && C.rating) C.rating.fresh().then((b) => { if (b) { cl.board = b; C.endScr.claimed(cl); } }).catch(() => {});
      }
      if (d.rating && C.rating) C.rating.reset(); // очки боя в таблице сезона: обновить при следующем показе
      if (d.progress && C.progress) { if (el) el.insertAdjacentHTML('afterbegin', `<div class="pgRes">${C.progress.rewardHtml(d.progress)}</div>`); C.progress.refresh(); } // прокачка: опыт и серебро за бой
      N.clog('claim', { ok: res.ok, d });
    } catch (e) { N.clog('claim_fail', String(e)); }
  };
  // выход в меню посреди боя - уходим из комнаты
  // после боя «В КОМНАТУ» - остаться (keepRoom: комната вернётся в лобби), «Закрыть» и выход из боя - уйти из комнаты
  const toMenu0 = C.toMenu;
  let booted = false; // первый вызов - показ меню при загрузке: комната (вернулись в неё после перезагрузки под карту) остаётся
  C.toMenu = function () { if (booted && (N.battle || N.room) && !keepRoom) { N.leave(); afterBattle = false; } if (booted) liveOff(); booted = true; keepRoom = false; planEl.style.display = 'none'; planHtml = ''; document.body.classList.remove('netOn', 'plOpen', 'apick'); for (const id of ['tMap', 'opMap']) $(id).classList.remove('helpGlow'); toMenu0(); };
  // ?ad=КОД - приглашение: сразу режим «Онлайн» и вход в комнату
  const inv = new URLSearchParams(location.search).get('ad');
  if (inv) { C.setup.game = 'online'; let done = false; N.on('conn', () => { if (N.conn === 'on' && !done && !N.room) { done = true; N.join(O.cleanCode(inv)); } }); N.connect(); }
  else if (new URLSearchParams(location.search).get('mp') === '1' || C.LIVE) { C.setup.game = 'online'; N.connect(); } // сайт: кнопка «Онлайн-бой» - сразу раздел онлайна; C.LIVE - возвращение в бой после вылета
  // Заглушка ?omock=lobby | battle (только вместе с ?rmock=1 на своём компьютере; main.js после меню): комната из шести игроков, у части премиум (prem: 1).
  // lobby - раздел «Онлайн» с лобби комнаты; battle - вылет с панелью «Игроки», лентой сбитий и итогом онлайна (в нём же знак у ников по комнате)
  function mock(name) {
    if (!RMOCK) return;
    const myP = /^(1|hour)$/.test(new URLSearchParams(location.search).get('prem') || ''), P =  /* свой премиум - как в заглушке ?prem (account.js); прогресс к этому часу мог ещё не прийти */ (id, nm, team, x) => ({ id, name: nm, team, ready: id !== 1, bot: false, down: false, ...x });
    const big = name === 'battle6'; // battle6 - 6 на 6 (табло шире, две колонки); tech / down - как пришлют с сервера: картинка техники и секунды до нового вылета
    const players = [P(1, 'xFORTUNAx', 'air', { prem: myP ? 1 : undefined, ava: AVA_SHOP[0], tech: 'air_e_su24' }), P(2, 'Sokol_77', 'air', { prem: 1, ava: AVA_SHOP[1], tech: 'air_e_su25', down: big ? 8 : false }), P(3, 'Viper', 'air', { ava: AVA_SHOP[2], tech: 'air_e_mig29k', away: true }),
      P(4, 'Беркут-7', 'pvo', { bot: true, tech: 'pvo_kub' }), P(5, 'Ракетчик', 'pvo', { prem: 1, ava: AVA_SHOP[3], tech: 'pvo_buk' }), P(6, 'Тайга', 'pvo', { bot: true, tech: 'pvo_zsu234' })];
    if (big) players.splice(3, 0, P(7, 'Гром_52', 'air', { prem: 1, tech: 'air_e_su34' }), P(8, 'Ястреб', 'air', { tech: 'air_e_su27', down: 15 }), P(9, 'Strela_21', 'air', { tech: 'air_e_mig21n' })),
      players.push(P(10, 'SkyKeeper', 'pvo', { prem: 1, tech: 'pvo_s300' }), P(11, 'Волхов', 'pvo', { tech: 'pvo_tor', away: true }), P(12, 'Орлан', 'pvo', { bot: true, tech: 'pvo_strela10' }));
    N.conn = 'on'; N.me = { id: 1, name: 'xFORTUNAx' }; N.ping = 42; N.pl = 0;
    N.room = { code: 'K7QF', host: 1, kind: 'air', size: big ? 6 : 3, era: 2, mode: 'arcade', sideAir: 'east', map: 'city', state: 'lobby', players };
    if (name === 'battle' || name === 'battle6') {
      C.setup.game = 'air'; C.start('air');
      setTimeout(() => {
        Object.assign(N.room, { state: 'play', left: 372 }); N.battle = { kind: 'air', era: 2, mode: 'arcade', map: 'city', targets: [], waves: 3, wave: 1, state: 'play', valueK: 0.2, T: 0 }; N.myCraft = true;
        document.body.classList.add('netOn', 'plOpen'); renderPl();
        const PL = N.room.players, pvoI = PL.findIndex((q) => q.team === 'pvo'); PL[0].kills = 3; PL[0].score = 420; PL[pvoI + 1].kills = 2; PL[pvoI + 1].score = 300;
        if (big) { PL[1].kills = 1; PL[1].score = 180; PL[2].score = 60; PL[3].kills = 2; PL[3].score = 260; PL[5].kills = 1; PL[5].score = 140; PL[pvoI].kills = 1; PL[pvoI].score = 120; PL[pvoI + 3].kills = 3; PL[pvoI + 3].score = 410; PL[pvoI + 4].kills = 1; PL[pvoI + 4].score = 150; } renderPl();
        const kl = () => { for (const k of [['xFORTUNAx', 'Бук-М1', 'Х-58У', 'air', 'pvo', 'p:e_su24m', 'u:buk'], ['Ракетчик', 'Viper', '9М317', 'pvo', 'air', 'u:s300', 'p:f16'], ['Sokol_77', 'Беркут-7', 'КАБ-500Л', 'air', 'pvo', 'p:su25', 'u:buk']]) pushKill(...k); };
        kl(); setInterval(kl, 5000); // лента живёт 6 с - обновляем, чтобы кадр можно было снять в любой момент
      }, 2500);
      return;
    }
    if (name.startsWith('plan')) { // выбор загрузки лётчиком («Ангар»): plan - 3 на 3, ранг IV, восток; plan1 … plan6 - размер команды; &pera=1…4 - ранг, &pside=west
      const Q2 = new URLSearchParams(location.search), n = +name.slice(4) || 3, era = +Q2.get('pera') || 4, sideAir = Q2.get('pside') === 'west' ? 'west' : 'east', lead = Q2.get('plead') || null;
      const names = ['xFORTUNAx', 'Sokol_77', 'Viper', 'Гром_52', 'Ястреб', 'Strela_21'], air = names.slice(0, n).map((q, i) => P(i + 1, q, 'air', {})), mine = LOADOUTS[era].map((L, i) => i).filter((i) => LOADOUTS[era][i].side === sideAir && O.netOk(LOADOUTS[era][i]));
      air.forEach((q, i) => { q.budget = Q2.get('pbud') ? +Q2.get('pbud') : 420; q.lives = 2; q.choice = i && i % 3 !== 2 ? mine[(i * 7) % mine.length] : null; q.ready = i % 2 === 1; });
      Object.assign(N.room, { size: n, era, sideAir, state: 'plan', left: 38, wave: 1, lead, players: [...air, P(20, 'Ракетчик', 'pvo', {})] }); N.battle = { kind: 'air', era, mode: 'arcade', map: 'city', targets: [], waves: 3, wave: 1, state: 'plan', valueK: 0, T: 0, sideAir };
      C.setup.game = 'air'; C.start('air'); setTimeout(() => { N.buyAir = (i) => { air[0].choice = air[0].choice === i ? null : i; renderPlan(); }; N.ready = (v) => { air[0].ready = v; renderPlan(); }; document.body.classList.add('netOn'); renderPlan(); }, 2500); return;
    }
    if (name === 'pvo' || name === 'mdef') { // расстановка ПВО онлайн без сервера: pvo - «Оборона» (первая волна, лимит классов), mdef - ПВО «Мульти-волны» (раунд 1, очки, не больше N); я - ПВО, за комплексы платят очки
      N.me = { id: 5, name: 'Ракетчик' }; for (const q of players) if (q.team === 'pvo') q.budget = 1200;
      const multi = name === 'mdef'; Object.assign(N.room, { kind: multi ? 'multi' : 'air', state: 'plan', left: 45, wave: 1, atk: 'air' }); if (multi) for (const q of players) q.team = q.team === 'air' ? 'east' : 'west';
      if (multi) { N.me = { id: 5, name: 'Ракетчик' }; N.room.atk = 'east'; }
      C.netBattle(N, { defSide: 'west', era: 2, mode: 'arcade', game: multi ? 'multi' : 'air' });
      if (!multi) for (const [k, x, z] of [['hawk', -800, 600], ['roland', 500, -300]]) { const u = C.S.addUnit(k, x, z, { roof: false, skill: 0.75 }); u.owner = 5; } // уже стоят дальний и средний: на картах причина «волна 1: … уже стоит» и метка ×1
      N.battle = multi ? { kind: 'multi', era: 2, mode: 'arcade', map: 'winter', atk: 'east', round: 1, rounds: 2, targets: [], wave: 1, waves: 1, state: 'plan', valueK: 0, T: 0, V: 0, v0: 1 }
        : { kind: 'air', era: 2, mode: 'arcade', sideAir: 'east', map: 'city', targets: C.S.objects.filter((o) => !o.noTarget).slice(0, 3).map((o) => o.id), waves: 3, wave: 1, state: 'plan', valueK: 0, T: 0 };
      N.send = () => {}; enterBattle(); return;
    }
    if (/^matk[1-6]?$/.test(name)) { // сбор волны «Мульти-волны» онлайн без сервера: matkN - в атакующей команде N человек (по умолчанию 3); &pside=east|west, &pbud=очки, &phave=1 - часть наряда уже есть
      const n = +name.slice(4) || 3, qp = new URLSearchParams(location.search), atkS = qp.get('pside') === 'west' ? 'west' : 'east', defS = atkS === 'east' ? 'west' : 'east', bud = +qp.get('pbud') || 150;
      const al = ['xFORTUNAx', 'Sokol_77', 'Viper', 'Гром_52', 'Ястреб', 'Strela_21'].slice(0, n).map((nm, i) => P(i + 1, nm, atkS, { ready: i === 1, budget: bud }));
      N.me = { id: 1, name: 'xFORTUNAx' }; N.battle = { kind: 'multi', era: 4, mode: 'arcade', map: 'winter', atk: atkS, round: 1, rounds: 2, targets: [], wave: 1, waves: 1, state: 'plan', valueK: 0, T: 0, V: 0, v0: 1 };
      Object.assign(N.room, { kind: 'multi', size: n, era: 4, map: 'winter', state: 'plan', left: 38, wave: 1, atk: atkS, players: [...al, ...[7, 8, 9].slice(0, n).map((id) => P(id, 'ПВО-' + id, defS, {}))] });
      C.netBattle(N, { defSide: defS, era: 4, mode: 'arcade', game: 'multi', map: 'winter' });
      const T = C.S.objects.filter((o) => !o.noTarget).map((o) => 'o' + o.id);
      N.room.allies = al.map((p, i) => ({ id: p.id, name: p.name, cost: [0, 96, 40, 148, 0, 72][i], tg: i === 1 ? { [T[0]]: 5, [T[1]]: 2 } : i === 2 ? { [T[1]]: 4 } : i === 3 ? { [T[4] || T[0]]: 6 } : {}, tbn: i === 1 && n > 4 ? { [atkS === 'east' ? 'r17' : 'lance']: 1 } : {} }));
      if (qp.get('phave')) { const k2 = atkS === 'east' ? ['kalibr', 'shahed', 'kh55d', 'r17'] : ['tomahawk', 'uav_w', 'quail', 'lance'], u = (t, m) => Array.from({ length: m }, () => ({ tgt: t ? +t.slice(1) : null, sam: false }));
        N.battle.myPlan = { n: { [k2[0]]: 5, [k2[1]]: 6, [k2[2]]: 3, [k2[3]]: 1 }, cfg: { [k2[0]]: { pts: [], alt: null, t: null, sam: false, tgt: null, units: [...u(T[1], 4), ...u(null, 1)] }, [k2[1]]: { pts: [], alt: null, t: null, sam: false, tgt: null, units: u(T[0], 6) }, [k2[2]]: { pts: [], alt: null, t: null, sam: false, tgt: null, units: Array.from({ length: 3 }, () => ({ sam: true })) }, [k2[3]]: { pts: [], alt: null, t: null, sam: false, tgt: null, units: u(T[1], 1) } } }; }
      N.chat = [{ id: 2, name: 'Sokol_77', text: 'Беру авиабазу' }]; N.send = () => {}; N.ready = (v) => { al[0].ready = v; ctrls.defense.netSync(); }; enterBattle(); return;
    }
    C.setup.game = 'online'; C.menu.panel(true); C.menu.render();
  }
  return { N, panel, primary, primaryText, onClick, mock, again() {
    const quick = endQuick; endQuick = false;
    if (N.room && !quick && N.room.state === 'lobby' && mapFix(N.room.kind, N.room.map || 'city')) return; // в лобби - уже новая карта комнаты
    if (N.room && !quick && (N.room.state === 'end' || N.room.state === 'lobby')) { keepRoom = true; C.toMenu(); C.setup.game = 'online'; C.menu.panel(true); C.menu.render(); if (N.room.state === 'end') { backWait = true; N.back(); renderBack(); } return; } // в ту же комнату
    C.toMenu(); C.setup.game = 'online'; if (N.conn === 'on') N.queue(ui.mode, ui.role, ui.kind === 'multi' ? 'multi' : undefined); C.menu.panel(true); C.menu.render();
  } };
}
