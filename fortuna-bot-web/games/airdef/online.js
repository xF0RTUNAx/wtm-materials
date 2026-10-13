// Онлайн «Воздушного превосходства» — интерфейс: режим «Онлайн» в меню (быстрый бой по роли, комнаты 1×1 … 6×6, вход по
// коду, лобби), окно ожидания поверх живого фона меню, выбор связки лётчиком перед волной (видно, что выбрали союзники),
// переход в бой (лётчик — air.js, ПВО — defense.js в режиме онлайна), итоги волн и боя, журнал сбитий (6 с) и
// «Мне нужна помощь!» союзникам (метка в кадре и на карте). Связь и зеркало боя — net.js.
/* global THREE, CONFIG */
import { createNet } from './net.js?v=20261020h';
import * as O from './sim/online.js?v=20261020h';
import * as MW from './sim/online-multi.js?v=20261020h';
import { AG, SAM, CARRIERS, LOADOUTS, PLANES, ERAS, loadoutRole } from './arsenal.js?v=20261020h';
import { MODES } from './sim/strike.js?v=20261020h';

const ROLES = [['air', 'Авиация'], ['pvo', 'ПВО'], ['any', 'Любая']];
const SIDES = [['random', 'Случайно'], ['west', 'Запад'], ['east', 'Восток']];
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
      if (N.conn === 'off' || N.conn === 'error') N.connect();
      el.innerHTML = `<div class="cat-h">Онлайн</div><p class="hint">${N.conn === 'noacc' ? 'Онлайн — для игроков с аккаунтом сайта: откройте игру с fortunawtm.com/play и войдите.'
        : N.conn === 'error' ? 'Сервер онлайна сейчас недоступен. Попробуйте позже.' : 'Подключаемся к серверу…'}</p>${N.conn === 'error' ? '<button class="btn alt" data-oa="retry">Повторить</button>' : ''}`;
      return;
    }
    const r = N.room;
    if (r && r.state === 'lobby') return lobby(el, r);
    if (N.queued) { el.innerHTML = `<div class="cat-h">Поиск боя</div><p class="hint">${waitText()}</p>`; return; }
    const mw = ui.kind === 'multi', srch = N.search || {};
    el.innerHTML = `<div class="prow"><span>Игра</span>${seg('kind', ui.kind, [['air', 'Вылет и оборона'], ['multi', 'Мульти-волна']])}</div>
      <div class="cat-h">Быстрый бой</div>
      <div class="prow"><span>Режим</span>${seg('mode', ui.mode, O.AD_MODES.map((k) => [k, MODES[k].name]))}</div>
      ${mw ? '' : `<div class="prow"><span>Роль</span>${seg('role', ui.role, ROLES)}</div>`}
      <p class="hint">${mw ? `Команда против команды, два раунда: в одном ваша команда собирает волну (дроны, крылатые, баллистика — наряд на цели), в другом ставит ПВО против волны соперника. Побеждает тот, чья волна разрушила больше. Подготовка — ${MW.PREP_T} с, на ней — чат команды.${N.search ? ` Сейчас ищут: аркада ${srch.marcade || 0}, реализм ${srch.mreal || 0}.` : ''}`
        : `Авиация против ПВО города, три волны. Ждём минимум 2 на 2, потом ещё 15 с — вдруг наберётся больше. Людей долго нет — добавим ботов.${N.search ? ` Сейчас ищут: аркада ${srch.arcade}, реализм ${srch.real}.` : ''}`}</p>
      <div class="cat-h">Своя комната</div>
      <div class="prow"><span>Формат</span>${seg('size', ui.size, O.AD_SIZES.map((n) => [n, `${n}×${n}`]))}</div>
      <div class="prow"><span>Эпоха</span>${seg('era', ui.era, ERAS.filter((e) => LOADOUTS[e.id] && (!mw || e.id >= 2)).map((e) => [e.id, e.short || e.name]))}</div>
      ${mw ? '' : `<div class="prow"><span>Авиация</span>${seg('side', ui.sideAir, SIDES)}</div>`}
      <div class="prow"><span>Пустые места</span>${seg('fill', ui.fill ? 1 : 0, [[1, 'Боты'], [0, 'Без ботов']])}</div>
      <button class="btn alt" data-oa="create">Создать комнату</button>
      <div class="cat-h">Войти по коду</div>
      <div class="prow"><input id="adCode" maxlength="4" placeholder="КОД" value="${esc(ui.code)}" style="text-transform:uppercase;width:90px"><button class="btn alt" data-oa="join" style="width:auto">Войти</button></div>`;
  }
  function lobby(el, r) {
    const me = N.myPlayer(), host = r.host === (N.me && N.me.id);
    const TN = r.kind === 'multi' ? MW.TEAM_NAME : O.ROLE_NAMES, TT = r.kind === 'multi' ? MW.TEAMS : ['air', 'pvo'];
    const col = (t) => `<div class="adteam"><div class="cat-h">${TN[t]} · ${r.players.filter((p) => p.team === t).length}/${r.size}</div>` +
      r.players.filter((p) => p.team === t).map((p) => `<div class="adp ${p.id === (me && me.id) ? 'me' : ''}"><b>${esc(p.name)}</b>${p.bot ? ' <span class="dim">бот</span>' : ''}${p.ready ? ' <span class="okc">✓</span>' : ''}${host && p.bot ? ` <button class="mini" data-kick="${p.id}">×</button>` : ''}</div>`).join('') +
      (me && me.team !== t ? `<button class="mini" data-oa="team" data-t="${t}">Перейти сюда</button>` : '') + (host ? ` <button class="mini" data-bot="${t}">+ бот</button>` : '') + '</div>';
    el.innerHTML = `<div class="cat-h">Комната <b class="adcode">${r.code}</b> <button class="mini" data-oa="invite">Пригласить</button> <button class="mini" data-oa="leave">Выйти</button></div>
      <p class="hint">${r.kind === 'multi' ? 'Мульти-волна · два раунда со сменой сторон' : ''}${r.kind === 'multi' ? ' · ' : ''}${MODES[r.mode].name} · ${r.size}×${r.size} · эпоха ${ERAS[r.era - 1].short || r.era}${r.kind === 'multi' ? '' : ` · авиация — ${r.sideAir === 'east' ? 'восток' : 'запад'}`}${r.fill ? ' · пустые места — боты' : ''}</p>
      ${afterBattle ? '<p class="hint"><b>Бой окончен — вы снова в комнате.</b> Хост может сменить игру, режим, формат, эпоху и сторону; затем все — «Готов».</p>' : ''}
      ${host ? `<div class="prow"><span>Игра</span>${seg('rkind', r.kind === 'multi' ? 'multi' : 'air', [['air', 'Вылет и оборона'], ['multi', 'Мульти-волна']])}</div><div class="prow"><span>Формат</span>${seg('rsize', r.size, O.AD_SIZES.map((n) => [n, `${n}×${n}`]))}</div><div class="prow"><span>Эпоха</span>${seg('rera', r.era, ERAS.filter((e) => LOADOUTS[e.id] && (r.kind !== 'multi' || e.id >= 2)).map((e) => [e.id, e.short || e.name]))}</div>
        ${r.kind === 'multi' ? '' : `<div class="prow"><span>Авиация</span>${seg('rside', r.sideAir, SIDES.slice(1))}</div>`}<div class="prow"><span>Режим</span>${seg('rmode', r.mode, O.AD_MODES.map((k) => [k, MODES[k].name]))}</div>` : ''}
      <div class="adteams">${TT.map(col).join('')}</div>
      <p class="hint">Бой начнётся, когда все нажмут «Готов».</p>`;
  }
  // кнопка внизу карточки меню
  function primaryText() {
    if (N.conn !== 'on') return 'ОНЛАЙН';
    if (N.room && N.room.state === 'lobby') { const me = N.myPlayer(); return me && me.ready ? 'ГОТОВ ✓ — СНЯТЬ' : 'ГОТОВ'; }
    return N.queued ? 'ОТМЕНИТЬ ПОИСК' : 'НАЙТИ БОЙ';
  }
  function primary() {
    if (N.conn !== 'on') { N.connect(); return; }
    if (N.room && N.room.state === 'lobby') { const me = N.myPlayer(); N.ready(!(me && me.ready)); return; }
    if (N.queued) N.unqueue(); else N.queue(ui.mode, ui.role, ui.kind === 'multi' ? 'multi' : undefined);
  }
  function onClick(e) {
    const b = e.target.closest('[data-v]'), sg = b && b.closest('[data-oseg]');
    if (sg) {
      const v = b.dataset.v, k = sg.dataset.oseg;
      if (k === 'kind') { ui.kind = v; if (v === 'multi' && ui.era < 2) ui.era = 4; } else if (k === 'mode') ui.mode = v; else if (k === 'role') ui.role = v; else if (k === 'size') ui.size = +v; else if (k === 'era') ui.era = +v; else if (k === 'side') ui.sideAir = v; else if (k === 'fill') ui.fill = v === '1';
      else if (k === 'rkind') N.opts({ kind: v }); else if (k === 'rsize') N.opts({ size: +v }); else if (k === 'rera') N.opts({ era: +v }); else if (k === 'rside') N.opts({ sideAir: v }); else if (k === 'rmode') N.opts({ mode: v });
      saveUi(); snd.click(); rerender(); return;
    }
    const a = e.target.closest('[data-oa]'), bot = e.target.closest('[data-bot]'), kick = e.target.closest('[data-kick]');
    if (bot) { N.bot(bot.dataset.bot); return; }
    if (kick) { N.kick(+kick.dataset.kick); return; }
    if (!a) return;
    snd.click();
    switch (a.dataset.oa) {
      case 'retry': N.conn = 'off'; N.connect(); break;
      case 'create': N.create(ui.kind === 'multi' ? { kind: 'multi', mode: ui.mode, size: ui.size, era: Math.max(2, ui.era), fill: ui.fill } : { mode: ui.mode, size: ui.size, era: ui.era, sideAir: ui.sideAir === 'random' ? null : ui.sideAir, fill: ui.fill, team: ui.role === 'any' ? null : ui.role }); break;
      case 'join': { const v = ($('adCode') && $('adCode').value || '').toUpperCase(); ui.code = v; if (v.length === 4) N.join(v, ui.kind === 'multi' || ui.role === 'any' ? null : ui.role); break; }
      case 'leave': N.leave(); break;
      case 'team': N.team(a.dataset.t); break;
      case 'invite': invite(); break;
    }
  }
  function invite() {
    const url = `https://fortunawtm.com/fortuna-bot-web/games/airdef.html?ad=${N.room.code}`, text = `Бой «Air Superiority Online»: комната ${N.room.code}`;
    try { const tg = window.Telegram && window.Telegram.WebApp; if (tg && tg.openTelegramLink) { tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`); return; } } catch (_) { /* не Telegram */ }
    if (navigator.share) { navigator.share({ title: text, url }).catch(() => {}); return; }
    try { navigator.clipboard.writeText(url); C.say('Ссылка скопирована', 2); } catch (_) { C.say(`Код комнаты: ${N.room.code}`, 3); }
  }

  // ═════════════ Ожидание поиска — поверх живого фона меню ═════════════
  const waitEl = $('netWait');
  function waitText() {
    const q = N.queued; if (!q) return '';
    const sec = Math.floor((performance.now() - q.t) / 1000), w = N.qwait ? Math.max(0, Math.ceil((N.qwait - performance.now()) / 1000)) : 0;
    return `${q.kind === 'multi' ? 'Мульти-волна · ' : ''}${MODES[q.mode].name}${q.kind === 'multi' ? '' : ` · роль: ${ROLES.find((r) => r[0] === ui.role)[1]}`} · ищем ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}${w ? ` · набралось 2 на 2 — старт через ${w} с` : ''}`;
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
    const B = N.battle, me = N.myPlayer(), list = LOADOUTS[B.era].map((L, i) => [L, i]).filter(([L]) => L.side === B.sideAir);
    const allies = r.players.filter((p) => p.team === 'air' && p.id !== me.id), others = allies.map((p) => (p.choice !== null ? LOADOUTS[B.era][p.choice] : null));
    const nAir = allies.length + 1, hunters = others.filter((x) => x && loadoutRole(x) === 'sead').length;
    planEl.innerHTML = `<h3>Волна ${r.wave}/${O.WAVES} · выбор связки · ${r.left ?? ''} с</h3><div>Очки: <b style="color:#fde68a">${me.budget}</b> · вылетов на волну: ${me.lives ?? O.RESPAWNS[r.wave - 1] + 1}${r.lead === 'pvo' ? ' (+1: команда отстаёт)' : ''}</div>
      <div class="dim">Охотников за ПВО в команде: ${hunters + (me.choice !== null && loadoutRole(LOADOUTS[B.era][me.choice]) === 'sead' ? 1 : 0)}/${O.huntCap(nAir)} · после ${O.SUPPRESS_T} с каждая уничтоженная РЛС замедляет перезарядку ПВО${r.lead === 'air' ? ' · вы ведёте — связки на 10 % дороже' : ''}</div>
      ${allies.length ? `<div class="cat-h">Союзники</div>${allies.map((p) => { const L = p.choice !== null ? LOADOUTS[B.era][p.choice] : null; return `<div class="adp"><b>${esc(p.name)}</b> — ${L ? `${PLANES[L.plane]} <span class="role ${loadoutRole(L)}">${O.approachOf(L)}</span>` : 'выбирает…'}${p.ready ? ' <span class="okc">✓</span>' : ''}</div>`; }).join('')}` : ''}
      <div class="cat-h">Связки</div>` + list.map(([L, i]) => {
      const cost = O.loadoutCostFor(L, r.lead), back = me.choice !== null ? O.loadoutCostFor(LOADOUTS[B.era][me.choice], r.lead) : 0, deny = O.roleDeny(L, others, nAir), no = cost > me.budget + back || !!deny;
      return `<button class="opt ${me.choice === i ? 'on' : ''} ${no ? 'no' : ''}" data-bi="${i}"><div class="nm"><b>${PLANES[L.plane]} · ${L.name}</b><span class="role ${loadoutRole(L)}">${O.approachOf(L)}</span><span>${L.items.map(([k, n]) => `${AG[k].short} ×${n}`).join(' · ')}${L.pod ? ' · контейнер' : ''}${deny ? ' · <b class="warnc">лимит охотников</b>' : ''}</span></div><span class="pr">${cost}</span></button>`;
    }).join('') + `<button class="btn ${me.ready ? 'alt' : ''}" data-oa="pready">${me.ready ? 'Готов ✓ (снять)' : 'ГОТОВ'}</button>`;
  }
  planEl.onclick = (e) => {
    const b = e.target.closest('[data-bi]'), a = e.target.closest('[data-oa]');
    if (b) { N.buyAir(+b.dataset.bi); snd.click(); }
    if (a && a.dataset.oa === 'pready') { const me = N.myPlayer(); N.ready(!(me && me.ready)); snd.click(); }
  };

  // ═════════════ События сети ═════════════
  N.on('conn', rerender);
  N.on('queue', rerender);
  N.on('err', (m) => { C.say(m, 3); rerender(); });
  N.on('deny', (m) => { N.clog('deny', m); C.say(m, 2.5); snd.deny(); if (ctrls.defense.st.net) ctrls.defense.st.msg = m; });
  N.on('start', () => enterBattle());
  N.on('room', (was) => {
    rerender();
    const r = N.room; if (!r || !N.battle || r.state === 'end' || r.state === 'lobby') return; // итоги и лобби — не бой
    if (C.state !== 'play') enterBattle();
    if (team() === 'pvo' || N.battle.kind === 'multi') ctrls.defense.netSync();
    renderPlan();
    if (was !== r.state && r.state === 'play' && N.battle.kind !== 'multi') { C.say(`Волна ${r.wave}!`, 2.5); snd.alarm(); }
  });
  // бой кончился, комната снова в лобби: с итогов «В КОМНАТУ» (или сразу, если итоги уже закрыли)
  N.on('lobby', () => { afterBattle = true; document.body.classList.remove('netOn', 'plOpen'); if (C.state === 'play' && !C.ended) { keepRoom = true; C.toMenu(); C.setup.game = 'online'; } if (inMenu()) C.menu.render(); });
  N.on('resupply', (e) => { if (team() === 'air') ctrls.air.netResupply(e); });
  N.on('spawn', (m) => { N.clog('spawn', { lives: m.lives, plane: m.plane, load: m.load.map((l) => l.key + ':' + l.n).join(',') }); if (team() === 'air') ctrls.air.netSpawn(m); });
  N.on('meHit', (hp, by) => ctrls.air.netHit(hp, by));
  N.on('meDown', () => { N.clog('down', { hp: C.player && C.player.hp, pos: C.player && C.player.pos.toArray().map(Math.round) }); ctrls.air.netDown('Самолёт сбит'); });
  N.on('meAI', () => { N.clog('to_ai', { hidden: document.visibilityState }); ctrls.air.netDown('Связь пропала — самолёт довёл ИИ'); });
  // журнал сбитий: своя команда — синим, противник — красным; под ником — техника, которой он управлял в этот момент
  const vehName = (v) => { const [k, key] = String(v || '').split(':'); return !key ? '' : k === 'p' ? (PLANES[key] || (CARRIERS[key] && CARRIERS[key].name) || key) : k === 'u' ? (SAM[key] ? SAM[key].short : key) : (AG[key] ? AG[key].short : key); };
  N.on('kill', (who, whom, by, wt, mt, wv, mv) => { feed.push({ t: performance.now(), who, whom, by, wt, mt, wv: vehName(wv), mv: vehName(mv) }); if (feed.length > 6) feed.shift(); });
  N.on('help', (m) => { feed.push({ t: performance.now(), s: `${m.name}: Мне нужна помощь!`, help: true }); helps.push({ t: performance.now(), name: m.name, p: m.p }); if (snd.help) snd.help(); else snd.alarm(); });
  // «Нужна помощь»: не чаще раза в HELP_CD с; p — [x, z] (самолёт, свой комплекс или место на карте)
  let helpAt = -1e9;
  C.askHelp = (p) => {
    const left = O.HELP_CD - (performance.now() - helpAt) / 1000;
    if (left > 0) { C.say(`Просить помощи снова можно через ${Math.ceil(left)} с`, 2); snd.deny(); return false; }
    helpAt = performance.now(); N.help(p); C.say('Союзникам: «Нужна помощь!» — знак на их карте', 2); snd.click(); return true;
  };
  // знак «внимание»: жёлтый треугольник с чёрным ободком и чёрным «!» (s — половина стороны, px)
  C.drawWarn = (g, x, y, s = 9) => {
    g.save(); g.beginPath(); g.moveTo(x, y - s * 1.05); g.lineTo(x + s * 1.15, y + s * 0.95); g.lineTo(x - s * 1.15, y + s * 0.95); g.closePath();
    g.fillStyle = '#facc15'; g.fill(); g.lineJoin = 'round'; g.lineWidth = Math.max(1.5, s * 0.22); g.strokeStyle = '#000'; g.stroke();
    g.fillStyle = '#000'; g.font = `900 ${Math.round(s * 1.25)}px -apple-system, Segoe UI, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', x, y + s * 0.2); g.textBaseline = 'alphabetic'; g.restore();
  };
  // ═════════════ Игроки: кто в сети и кто готов (кнопка 👥 вверху, во всех онлайн-боях) ═════════════
  const plBtn = $('plBtn'), plEl = $('plPanel');
  function renderPl() {
    const r = N.room; if (!r || !document.body.classList.contains('plOpen')) return;
    const multi = r.kind === 'multi', TN = multi ? MW.TEAM_NAME : O.ROLE_NAMES, TT = multi ? MW.TEAMS : ['air', 'pvo'], me = N.me && N.me.id, myT = N.myTeam();
    const ph = { plan: multi ? 'подготовка' : 'расстановка', play: 'бой', debrief: 'итоги', end: 'итоги боя' }[r.state] || '', ready = r.state === 'plan';
    plEl.innerHTML = `<div class="plh"><b>Комната ${r.code}</b> · ${MODES[r.mode].name} · ${ph}${r.left != null ? ` · ${r.left} с` : ''}<button data-pl="x" aria-label="Закрыть">✕</button></div>` +
      TT.map((t) => `<div class="plt" style="color:${t === myT ? '#93c5fd' : '#fca5a5'}">${TN[t]}${multi && r.atk ? (r.atk === t ? ' · волна' : ' · ПВО') : ''}</div>` + r.players.filter((p) => p.team === t).map((p) =>
        `<div class="plr${p.id === me ? ' me' : ''}"><i class="pld ${p.bot ? 'bot' : p.away ? 'off' : 'on'}"></i><b>${esc(p.name)}</b>${p.bot ? ' <span class="dim">бот</span>' : p.away ? ' <span class="dim">нет связи</span>' : ''}<span class="plx">${p.lives != null ? `вылетов ${p.lives} · ` : ''}${p.kills || 0} · ${p.score || 0} оч.${ready ? (p.ready ? ' <b class="okc">✓</b>' : ' <span class="dim">…</span>') : ''}</span></div>`).join('')).join('') +
      `<div class="dim pll">● в сети · ○ нет связи · ◆ бот${ready ? ' · ✓ готов' : ''} · число — сбито / уничтожено</div>`;
  }
  plBtn.onclick = (e) => { e.stopPropagation(); document.body.classList.toggle('plOpen'); snd.click(); renderPl(); };
  plEl.addEventListener('pointerdown', (e) => e.stopPropagation());
  plEl.onclick = (e) => { if (e.target.closest('[data-pl="x"]')) { document.body.classList.remove('plOpen'); snd.click(); } };
  N.on('room', renderPl);
  N.on('chat', () => ctrls.defense.chatSync());
  N.on('roundEnd', (m) => { ctrls.defense.setNetRes(m); C.say(`Раунд ${m.round}: ${MW.TEAM_NAME[m.atk]} разрушил ${Math.round(m.k * 100)}% ценности объектов${m.last ? '' : ' · стороны меняются'}`, 6); });
  N.on('waveEnd', (m) => {
    // итоги волны: вклад каждой роли — цели, подавленные РЛС, сбитые охотники и ударники
    const det = `РЛС уничтожено: ${m.radarKills || 0} · сбито охотников за ПВО: ${m.downsSead || 0}, ударников: ${Math.max(0, (m.downs || 0) - (m.downsSead || 0))}`;
    C.say(m.last ? `${m.totalK >= O.WIN_K ? 'Авиация уничтожила цели' : 'Последняя волна отбита'} · ${det}` : `Волна ${m.wave} окончена · уничтожено ${Math.round(m.totalK * 100)}% ценности целей · ${det}${m.lead ? ` · ведёт ${m.lead === 'air' ? 'авиация' : 'ПВО'}` : ''}`, 7);
    if (team() === 'pvo') ctrls.defense.setNetRes(m);
  });
  N.on('end', (m) => {
    if (m.kind === 'multi') {
      const me = N.myPlayer(), v0 = m.v0 || 1, list = m.players.slice().sort((a, b) => b.score - a.score), win = m.winner ? me && m.winner === me.team : null;
      C.showEnd({ again: 'В КОМНАТУ', title: win ? 'Победа' : win === false ? 'Поражение' : 'Ничья', win, reason: `Волна Востока разрушила ${Math.round(100 * m.scores.east / v0)}%, Запада — ${Math.round(100 * m.scores.west / v0)}% ценности объектов`,
        stats: [[`${Math.round(100 * m.scores.east / v0)}%`, 'Восток'], [`${Math.round(100 * m.scores.west / v0)}%`, 'Запад'], [me ? Math.round(me.score || 0) : 0, 'очков']],
        note: list.map((p) => `${esc(p.name)}${p.bot ? ' (бот)' : ''} — ${MW.TEAM_NAME[p.team]}: ${p.kills} перехв./уничт., ${p.score} очков`).join('<br>') });
      if (m.result && C.claimOnline) C.claimOnline(m.result);
      return;
    }
    const me = N.myPlayer(), win = me && m.winner === me.team, list = m.players.slice().sort((a, b) => b.score - a.score);
    C.showEnd({ again: 'В КОМНАТУ', title: win ? 'Победа' : 'Поражение', win, reason: m.winner === 'air' ? `Авиация уничтожила ${Math.round(m.valueK * 100)}% ценности целей` : `ПВО отстояла город: уничтожено ${Math.round(m.valueK * 100)}% ценности целей`,
      stats: [[me ? me.kills || 0 : 0, me && me.team === 'air' ? 'комплексов уничтожено' : 'самолётов сбито'], [me ? Math.round(me.score || 0) : 0, 'очков'], [m.winner === 'air' ? 'Авиация' : 'ПВО', 'победила']],
      note: list.map((p) => `${esc(p.name)}${p.bot ? ' (бот)' : ''} — ${O.ROLE_NAMES[p.team]}: ${p.kills}/${p.deaths}, ${p.score} очков`).join('<br>') });
    if (m.result && C.claimOnline) C.claimOnline(m.result);
  });
  N.on('lost', () => { if (C.state === 'play' && C.lastGame === 'online' && !C.ended) C.showEnd({ title: 'Связь потеряна', reason: 'Соединение с сервером оборвалось', win: null, stats: [] }); });

  // ═════════════ Журнал боя (что видела игра): ошибки, частота кадров, зеркало ═════════════
  let fr = 0, frT = performance.now();
  addEventListener('error', (e) => { if (N.battle) N.clog('js_error', `${e.message} @ ${(e.filename || '').split('/').pop()}:${e.lineno}`); });
  addEventListener('unhandledrejection', (e) => { if (N.battle) N.clog('js_error', String(e.reason && e.reason.stack || e.reason).slice(0, 600)); });
  document.addEventListener('visibilitychange', () => { if (N.battle) N.clog('visibility', document.visibilityState); });
  setInterval(() => {
    if (!N.battle || C.state !== 'play') return;
    const s = (performance.now() - frT) / 1000; frT = performance.now();
    N.clog('client', { fps: Math.round(fr / s), q: C.P.name, team: team(), view: C.ctrl === ctrls.defense ? ctrls.defense.st.view : C.ctrl === ctrls.air ? 'air' : '?', units: C.S ? C.S.units.length : 0, air: C.raid ? C.raid.planes.length : 0,
      sams: C.S ? C.S.sams.length : 0, me: C.player && !C.player.dead ? { hp: Math.round(C.player.hp), alt: Math.round(C.player.pos.y), fuel: Math.round((C.player.fuel ?? 1) * 100) } : null, touch: C.IS_TOUCH ? 1 : 0 });
    fr = 0;
  }, 30000);
  // ═════════════ Журнал сбитий и метки «нужна помощь» (поверх HUD) ═════════════
  C.extraHud = () => {
    if (!N.battle || C.state !== 'play') return;
    fr++;
    const hx = C.hx, now = performance.now();
    feed = feed.filter((f) => now - f.t < 6000); helps = helps.filter((h) => now - h.t < O.HELP_T * 1000);
    hx.textAlign = 'right'; hx.font = '600 12px -apple-system, Segoe UI, sans-serif'; hx.shadowColor = 'rgba(0,0,0,.85)'; hx.shadowBlur = 4;
    const myT = N.myTeam(), col = (t, a) => (!t ? `rgba(255,255,255,${a})` : t === myT ? `rgba(96,165,250,${a})` : `rgba(248,113,113,${a})`);
    let y = 70;
    for (const f of feed) {
      const a = Math.min(1, (6000 - (now - f.t)) / 800);
      if (f.help) { hx.fillStyle = `rgba(253,186,116,${a})`; hx.fillText(f.s, C.VW - 60, y); y += 17; continue; }
      // справа налево: « · оружие», ник цели, « → », ник стрелка; под никами — техника мелко
      let x = C.VW - 60; hx.font = '600 12px -apple-system, Segoe UI, sans-serif';
      const tail = f.by ? ` · ${f.by}` : '', wTail = hx.measureText(tail).width; hx.fillStyle = `rgba(226,232,240,${a})`; hx.fillText(tail, x, y); x -= wTail;
      const wWhom = hx.measureText(f.whom).width; hx.fillStyle = col(f.mt, a); hx.fillText(f.whom, x, y); const cWhom = x - wWhom / 2; x -= wWhom;
      const arr = ' → ', wArr = hx.measureText(arr).width; hx.fillStyle = `rgba(226,232,240,${a})`; hx.fillText(arr, x, y); x -= wArr;
      const wWho = hx.measureText(f.who).width; hx.fillStyle = col(f.wt, a); hx.fillText(f.who, x, y); const cWho = x - wWho / 2;
      if (f.wv || f.mv) {
        hx.font = '500 10px -apple-system, Segoe UI, sans-serif'; hx.textAlign = 'center';
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
      else { const y = 64; C.drawWarn(hx, C.VW / 2, y, 11); hx.textAlign = 'center'; hx.font = '700 12px -apple-system, Segoe UI, sans-serif'; hx.fillStyle = '#fde047'; hx.shadowColor = 'rgba(0,0,0,.85)'; hx.shadowBlur = 4; hx.fillText(`${h.name}: нужна помощь — ${air ? 'M' : 'Q'}: карта`, C.VW / 2, y + 26); hx.shadowBlur = 0; }
    }
  };
  C.netHelps = () => helps; // для тактической карты ПВО

  // награда за онлайн-бой: подписанный сервером итог → функция airdef-claim (результат в таблицу, награда по правилам «Летки»)
  C.claimOnline = async (token) => {
    try {
      if (typeof CONFIG === 'undefined' || !CONFIG.SUPABASE_URL) return;
      const acc = JSON.parse(localStorage.getItem('fortuna_web_player') || 'null'); if (!acc || !acc.id) return;
      const key = String(CONFIG.SUPABASE_ANON_KEY).replace(/[^\x21-\x7E]/g, '');
      const res = await fetch(CONFIG.SUPABASE_URL + '/functions/v1/airdef-claim', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key, apikey: key }, body: JSON.stringify({ player_id: acc.id, token }) });
      const d = await res.json().catch(() => ({}));
      const parts = []; if (d.details) parts.push(`+${d.details} деталей`); if (d.keys) parts.push(`+${d.keys} 🔑`); if (d.ticket) parts.push(d.ticket === 'ticket' ? '+1 билет' : '+1 🔑');
      const note = res.ok ? (parts.length ? `Награда: ${parts.join(', ')}` : d.online_rewards_left === 0 ? 'Наградные бои на сегодня закончились — результат засчитан' : 'Результат засчитан') : (d.error || 'Не удалось засчитать бой');
      const el = $('endNote'); if (el) el.innerHTML = `<b>${note}</b><br>` + el.innerHTML;
      N.clog('claim', { ok: res.ok, d });
    } catch (e) { N.clog('claim_fail', String(e)); }
  };
  // выход в меню посреди боя — уходим из комнаты
  // после боя «В КОМНАТУ» — остаться (keepRoom: комната вернётся в лобби), «Закрыть» и выход из боя — уйти из комнаты
  const toMenu0 = C.toMenu;
  C.toMenu = function () { if ((N.battle || N.room) && !keepRoom) { N.leave(); afterBattle = false; } keepRoom = false; planEl.style.display = 'none'; document.body.classList.remove('netOn', 'plOpen'); for (const id of ['tMap', 'opMap']) $(id).classList.remove('helpGlow'); toMenu0(); };
  // ?ad=КОД — приглашение: сразу режим «Онлайн» и вход в комнату
  const inv = new URLSearchParams(location.search).get('ad');
  if (inv) { C.setup.game = 'online'; let done = false; N.on('conn', () => { if (N.conn === 'on' && !done && !N.room) { done = true; N.join(O.cleanCode(inv)); } }); N.connect(); }
  else if (new URLSearchParams(location.search).get('mp') === '1') { C.setup.game = 'online'; N.connect(); } // сайт: кнопка «Онлайн-бой» — сразу раздел онлайна
  return { N, panel, primary, primaryText, onClick, again() {
    if (N.room && (N.room.state === 'end' || N.room.state === 'lobby')) { keepRoom = true; C.toMenu(); C.setup.game = 'online'; C.menu.render(); return; } // в ту же комнату
    C.toMenu(); C.setup.game = 'online'; if (N.conn === 'on') N.queue(ui.mode, ui.role, ui.kind === 'multi' ? 'multi' : undefined); C.menu.render();
  } };
}
