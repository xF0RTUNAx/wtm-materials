// Онлайн «Воздушного превосходства» — интерфейс: режим «Онлайн» в меню (быстрый бой по роли, комнаты 1×1 … 6×6, вход по
// коду, лобби), окно ожидания поверх живого фона меню, выбор связки лётчиком перед волной (видно, что выбрали союзники),
// переход в бой (лётчик — air.js, ПВО — defense.js в режиме онлайна), итоги волн и боя, журнал сбитий (6 с) и
// «Мне нужна помощь!» союзникам (метка в кадре и на карте). Связь и зеркало боя — net.js.
/* global THREE, CONFIG */
import { createNet } from './net.js?v=20261010t';
import * as O from './sim/online.js?v=20261010t';
import { AG, LOADOUTS, PLANES, ERAS } from './arsenal.js?v=20261010t';
import { MODES } from './sim/strike.js?v=20261010t';

const ROLES = [['air', 'Авиация'], ['pvo', 'ПВО'], ['any', 'Любая']];
const SIDES = [['random', 'Случайно'], ['west', 'Запад'], ['east', 'Восток']];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createOnline(C, ctrls) {
  const { $, ls, snd } = C;
  const N = createNet(C); C.netc = N;
  const ui = { mode: ls.get('fortuna_ad_mode') || 'arcade', role: ls.get('fortuna_ad_role') || 'any', size: +(ls.get('fortuna_ad_size') || 2), era: +(ls.get('fortuna_ad_era') || 2), sideAir: ls.get('fortuna_ad_side') || 'random', fill: ls.get('fortuna_ad_fill') !== '0', code: '' };
  const saveUi = () => { ls.set('fortuna_ad_mode', ui.mode); ls.set('fortuna_ad_role', ui.role); ls.set('fortuna_ad_size', String(ui.size)); ls.set('fortuna_ad_era', String(ui.era)); ls.set('fortuna_ad_side', ui.sideAir); ls.set('fortuna_ad_fill', ui.fill ? '1' : '0'); };
  const seg = (id, cur, items) => `<div class="seg" data-oseg="${id}">${items.map(([v, l]) => `<button data-v="${v}" class="${String(v) === String(cur) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const inMenu = () => C.state === 'menu' && C.setup.game === 'online';
  const rerender = () => { if (inMenu()) C.menu.render(); renderWait(); };
  let feed = [], helps = [];

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
    el.innerHTML = `<div class="cat-h">Быстрый бой</div>
      <div class="prow"><span>Режим</span>${seg('mode', ui.mode, O.AD_MODES.map((k) => [k, MODES[k].name]))}</div>
      <div class="prow"><span>Роль</span>${seg('role', ui.role, ROLES)}</div>
      <p class="hint">Авиация против ПВО города, три волны. Ждём минимум 2 на 2, потом ещё 15 с — вдруг наберётся больше. Людей долго нет — добавим ботов.${N.search ? ` Сейчас ищут: аркада ${N.search.arcade}, реализм ${N.search.real}.` : ''}</p>
      <div class="cat-h">Своя комната</div>
      <div class="prow"><span>Формат</span>${seg('size', ui.size, O.AD_SIZES.map((n) => [n, `${n}×${n}`]))}</div>
      <div class="prow"><span>Эпоха</span>${seg('era', ui.era, ERAS.filter((e) => LOADOUTS[e.id]).map((e) => [e.id, e.short || e.name]))}</div>
      <div class="prow"><span>Авиация</span>${seg('side', ui.sideAir, SIDES)}</div>
      <div class="prow"><span>Пустые места</span>${seg('fill', ui.fill ? 1 : 0, [[1, 'Боты'], [0, 'Без ботов']])}</div>
      <button class="btn alt" data-oa="create">Создать комнату</button>
      <div class="cat-h">Войти по коду</div>
      <div class="prow"><input id="adCode" maxlength="4" placeholder="КОД" value="${esc(ui.code)}" style="text-transform:uppercase;width:90px"><button class="btn alt" data-oa="join" style="width:auto">Войти</button></div>`;
  }
  function lobby(el, r) {
    const me = N.myPlayer(), host = r.host === (N.me && N.me.id);
    const col = (t) => `<div class="adteam"><div class="cat-h">${O.ROLE_NAMES[t]} · ${r.players.filter((p) => p.team === t).length}/${r.size}</div>` +
      r.players.filter((p) => p.team === t).map((p) => `<div class="adp ${p.id === (me && me.id) ? 'me' : ''}"><b>${esc(p.name)}</b>${p.bot ? ' <span class="dim">бот</span>' : ''}${p.ready ? ' <span class="okc">✓</span>' : ''}${host && p.bot ? ` <button class="mini" data-kick="${p.id}">×</button>` : ''}</div>`).join('') +
      (me && me.team !== t ? `<button class="mini" data-oa="team" data-t="${t}">Перейти сюда</button>` : '') + (host ? ` <button class="mini" data-bot="${t}">+ бот</button>` : '') + '</div>';
    el.innerHTML = `<div class="cat-h">Комната <b class="adcode">${r.code}</b> <button class="mini" data-oa="invite">Пригласить</button> <button class="mini" data-oa="leave">Выйти</button></div>
      <p class="hint">${MODES[r.mode].name} · ${r.size}×${r.size} · эпоха ${ERAS[r.era - 1].short || r.era} · авиация — ${r.sideAir === 'east' ? 'восток' : 'запад'}${r.fill ? ' · пустые места — боты' : ''}</p>
      ${host ? `<div class="prow"><span>Формат</span>${seg('rsize', r.size, O.AD_SIZES.map((n) => [n, `${n}×${n}`]))}</div><div class="prow"><span>Эпоха</span>${seg('rera', r.era, ERAS.filter((e) => LOADOUTS[e.id]).map((e) => [e.id, e.short || e.name]))}</div>
        <div class="prow"><span>Авиация</span>${seg('rside', r.sideAir, SIDES.slice(1))}</div><div class="prow"><span>Режим</span>${seg('rmode', r.mode, O.AD_MODES.map((k) => [k, MODES[k].name]))}</div>` : ''}
      <div class="adteams">${col('air')}${col('pvo')}</div>
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
    if (N.queued) N.unqueue(); else N.queue(ui.mode, ui.role);
  }
  function onClick(e) {
    const b = e.target.closest('[data-v]'), sg = b && b.closest('[data-oseg]');
    if (sg) {
      const v = b.dataset.v, k = sg.dataset.oseg;
      if (k === 'mode') ui.mode = v; else if (k === 'role') ui.role = v; else if (k === 'size') ui.size = +v; else if (k === 'era') ui.era = +v; else if (k === 'side') ui.sideAir = v; else if (k === 'fill') ui.fill = v === '1';
      else if (k === 'rsize') N.opts({ size: +v }); else if (k === 'rera') N.opts({ era: +v }); else if (k === 'rside') N.opts({ sideAir: v }); else if (k === 'rmode') N.opts({ mode: v });
      saveUi(); snd.click(); rerender(); return;
    }
    const a = e.target.closest('[data-oa]'), bot = e.target.closest('[data-bot]'), kick = e.target.closest('[data-kick]');
    if (bot) { N.bot(bot.dataset.bot); return; }
    if (kick) { N.kick(+kick.dataset.kick); return; }
    if (!a) return;
    snd.click();
    switch (a.dataset.oa) {
      case 'retry': N.conn = 'off'; N.connect(); break;
      case 'create': N.create({ mode: ui.mode, size: ui.size, era: ui.era, sideAir: ui.sideAir === 'random' ? null : ui.sideAir, fill: ui.fill, team: ui.role === 'any' ? null : ui.role }); break;
      case 'join': { const v = ($('adCode') && $('adCode').value || '').toUpperCase(); ui.code = v; if (v.length === 4) N.join(v, ui.role === 'any' ? null : ui.role); break; }
      case 'leave': N.leave(); break;
      case 'team': N.team(a.dataset.t); break;
      case 'invite': invite(); break;
    }
  }
  function invite() {
    const url = `https://fortunawtm.com/fortuna-bot-web/games/airdef.html?ad=${N.room.code}`, text = `Бой «Воздушное превосходство»: комната ${N.room.code}`;
    try { const tg = window.Telegram && window.Telegram.WebApp; if (tg && tg.openTelegramLink) { tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`); return; } } catch (_) { /* не Telegram */ }
    if (navigator.share) { navigator.share({ title: text, url }).catch(() => {}); return; }
    try { navigator.clipboard.writeText(url); C.say('Ссылка скопирована', 2); } catch (_) { C.say(`Код комнаты: ${N.room.code}`, 3); }
  }

  // ═════════════ Ожидание поиска — поверх живого фона меню ═════════════
  const waitEl = $('netWait');
  function waitText() {
    const q = N.queued; if (!q) return '';
    const sec = Math.floor((performance.now() - q.t) / 1000), w = N.qwait ? Math.max(0, Math.ceil((N.qwait - performance.now()) / 1000)) : 0;
    return `${MODES[q.mode].name} · роль: ${ROLES.find((r) => r[0] === ui.role)[1]} · ищем ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}${w ? ` · набралось 2 на 2 — старт через ${w} с` : ''}`;
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
    snd.unlock();
    if (C.ctrl && C.ctrl.stop) C.ctrl.stop();
    C.hooks = {}; C.paused = false; C.hint(''); C.say('');
    for (const id of ['menu', 'end', 'pauseScr']) $(id).classList.remove('on');
    document.body.classList.remove('menuing'); document.body.classList.add('playing');
    C.state = 'play'; C.camera.clearViewOffset(); C.lastGame = 'online'; C.shell.play(true);
    if (team() === 'air') { C.ctrl = ctrls.air; ctrls.air.startNet(N); } else { C.ctrl = ctrls.defense; ctrls.defense.startNet(N); }
    feed = []; helps = []; renderWait(); renderPlan();
  }
  // выбор связки лётчиком: что по карману, что выбрали союзники
  function renderPlan() {
    const r = N.room, show = N.battle && r && r.state === 'plan' && team() === 'air';
    planEl.style.display = show ? 'block' : 'none'; if (!show) return;
    const B = N.battle, me = N.myPlayer(), list = LOADOUTS[B.era].map((L, i) => [L, i]).filter(([L]) => L.side === B.sideAir);
    const allies = r.players.filter((p) => p.team === 'air' && p.id !== me.id);
    planEl.innerHTML = `<h3>Волна ${r.wave}/${O.WAVES} · выбор связки · ${r.left ?? ''} с</h3><div>Очки: <b style="color:#fde68a">${me.budget}</b> · вылетов на волну: ${O.RESPAWNS[r.wave - 1] + 1}</div>
      ${allies.length ? `<div class="cat-h">Союзники</div>${allies.map((p) => { const L = p.choice !== null ? LOADOUTS[B.era][p.choice] : null; return `<div class="adp"><b>${esc(p.name)}</b> — ${L ? `${PLANES[L.plane]} · ${O.approachOf(L)}` : 'выбирает…'}${p.ready ? ' <span class="okc">✓</span>' : ''}</div>`; }).join('')}` : ''}
      <div class="cat-h">Связки</div>` + list.map(([L, i]) => {
      const cost = O.loadoutCost(L), back = me.choice !== null ? O.loadoutCost(LOADOUTS[B.era][me.choice]) : 0, no = cost > me.budget + back;
      return `<button class="opt ${me.choice === i ? 'on' : ''} ${no ? 'no' : ''}" data-bi="${i}"><div class="nm"><b>${PLANES[L.plane]} · ${L.name}</b><span>${O.approachOf(L)} · ${L.items.map(([k, n]) => `${AG[k].short} ×${n}`).join(' · ')}${L.pod ? ' · контейнер' : ''}</span></div><span class="pr">${cost}</span></button>`;
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
    const r = N.room; if (!r || !N.battle) return;
    if (C.state !== 'play') enterBattle();
    if (team() === 'pvo') ctrls.defense.netSync();
    renderPlan();
    if (was !== r.state && r.state === 'play') { C.say(`Волна ${r.wave}!`, 2.5); snd.alarm(); }
  });
  N.on('spawn', (m) => { N.clog('spawn', { lives: m.lives, plane: m.plane, load: m.load.map((l) => l.key + ':' + l.n).join(',') }); if (team() === 'air') ctrls.air.netSpawn(m); });
  N.on('meHit', (hp, by) => ctrls.air.netHit(hp, by));
  N.on('meDown', () => { N.clog('down', { hp: C.player && C.player.hp, pos: C.player && C.player.pos.toArray().map(Math.round) }); ctrls.air.netDown('Самолёт сбит'); });
  N.on('meAI', () => { N.clog('to_ai', { hidden: document.visibilityState }); ctrls.air.netDown('Связь пропала — самолёт довёл ИИ'); });
  N.on('kill', (who, whom, by) => { feed.push({ t: performance.now(), s: `${who} → ${whom}${by ? ' · ' + by : ''}` }); if (feed.length > 6) feed.shift(); });
  N.on('help', (m) => { feed.push({ t: performance.now(), s: `${m.name}: Мне нужна помощь!`, help: true }); helps.push({ t: performance.now(), name: m.name, p: m.p }); snd.alarm(); });
  N.on('waveEnd', (m) => {
    C.say(m.last ? (m.totalK >= O.WIN_K ? 'Авиация уничтожила цели' : 'Последняя волна отбита') : `Волна ${m.wave} окончена · уничтожено ${Math.round(m.totalK * 100)}% ценности целей`, 5);
    if (team() === 'pvo') ctrls.defense.setNetRes(m);
  });
  N.on('end', (m) => {
    const me = N.myPlayer(), win = me && m.winner === me.team, list = m.players.slice().sort((a, b) => b.score - a.score);
    C.showEnd({ title: win ? 'Победа' : 'Поражение', win, reason: m.winner === 'air' ? `Авиация уничтожила ${Math.round(m.valueK * 100)}% ценности целей` : `ПВО отстояла город: уничтожено ${Math.round(m.valueK * 100)}% ценности целей`,
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
    feed = feed.filter((f) => now - f.t < 6000); helps = helps.filter((h) => now - h.t < 8000);
    hx.textAlign = 'right'; hx.font = '600 12px -apple-system, Segoe UI, sans-serif'; hx.shadowColor = 'rgba(0,0,0,.85)'; hx.shadowBlur = 4;
    feed.forEach((f, i) => { const a = Math.min(1, (6000 - (now - f.t)) / 800); hx.fillStyle = f.help ? `rgba(253,186,116,${a})` : `rgba(255,255,255,${a})`; hx.fillText(f.s, C.VW - 60, 70 + i * 17); });
    for (const h of helps) {
      if (!h.p) continue;
      const p = C.proj(new THREE.Vector3(h.p[0], C.city.groundH(h.p[0], h.p[1]) + 60, h.p[1])); if (!p) continue;
      hx.textAlign = 'center'; hx.fillStyle = '#fb923c'; hx.font = '800 16px -apple-system, Segoe UI, sans-serif'; hx.fillText('⚠', p[0], p[1]);
      hx.font = '600 11px -apple-system, Segoe UI, sans-serif'; hx.fillText(h.name, p[0], p[1] + 14);
    }
    hx.shadowBlur = 0;
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
  const toMenu0 = C.toMenu;
  C.toMenu = function () { if (N.battle || N.room) N.leave(); planEl.style.display = 'none'; toMenu0(); };
  // ?ad=КОД — приглашение: сразу режим «Онлайн» и вход в комнату
  const inv = new URLSearchParams(location.search).get('ad');
  if (inv) { C.setup.game = 'online'; let done = false; N.on('conn', () => { if (N.conn === 'on' && !done && !N.room) { done = true; N.join(O.cleanCode(inv)); } }); N.connect(); }
  else if (new URLSearchParams(location.search).get('mp') === '1') { C.setup.game = 'online'; N.connect(); } // сайт: кнопка «Онлайн-бой» — сразу раздел онлайна
  return { N, panel, primary, primaryText, onClick, again() { C.toMenu(); C.setup.game = 'online'; if (N.conn === 'on') N.queue(ui.mode, ui.role); C.menu.render(); } };
}
