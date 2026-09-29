// Онлайн «Симулятора Летки» на стороне игрока: связь с сервером (game-server), лобби во вкладке «Онлайн»,
// чужие самолёты (сглаженные снимки сервера), отправка своего состояния, сбития, возрождение, итоги боя.
// Своим самолётом игрок управляет у себя без задержки; урон, счёт и время ведёт сервер.
// Ракеты, ловушки и захваты РЛС тоже считает сервер: пуск/захват/ЛТЦ — заявка серверу, ракеты («сетевые», net: true)
// лежат в общем списке missiles игры и двигаются по снимкам сервера с досчётом по скорости — их видят HUD, СПО и звук.
// main.js передаёт в createOnline объект K — доступ к игре (игрок, списки противников, эффекты, HUD).
/* global THREE */
import { MATCH_T, SNAP_HZ, SIZES, TEAM_NAMES, ONLINE_MODES, PORT, F_AB, F_FIRE, MF_MOTOR, MF_ACTIVE, MF_LOST, packState, cleanCode } from './sim/online.js?v=20260929c';
import { MODES } from './sim/modes.js?v=20260929c';
import { MISSILES } from './missiles.js?v=20260929c';

const INTERP = 0.12;   // чужие самолёты показываем на 120 мс в прошлом — между двумя снимками, без рывков
const EXTRAP = 0.35;   // если снимки не пришли — продолжаем движение по прямой не дольше этого, с
const M_AHEAD = 0.5;   // ракету показываем «сейчас»: последний снимок + скорость × прошедшее время (не дольше этого, с)
const M_LOST_T = 1.5;  // ракета пропала из снимков дольше этого — убираем без взрыва

export function serverUrl() {
  const h = location.hostname;
  if (/(^|\.)fortunawtm\.com$/.test(h)) return 'wss://game.fortunawtm.com/ws';
  return `ws://${h || 'localhost'}:${PORT}/ws`; // локальная проверка: сервер на том же компьютере (или по IP в сети)
}
// аккаунт сайта: игра открыта во фрейме того же домена — сессия лежит в общем localStorage
function account(testName) {
  if (testName) return { id: 'test-' + testName, login: testName };
  try { const p = JSON.parse(localStorage.getItem('fortuna_web_player') || 'null'); return p && p.id && p.login ? p : null; } catch (_) { return null; }
}
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const wrapPI = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

export function createOnline(K) {
  const MP = {
    on: false,            // идёт онлайн-бой (от отсчёта до итогов)
    down: false,          // мой самолёт сбит, жду возрождения
    conn: 'off',          // off | noacc | connecting | on | error
    ws: null, me: 0, room: null, team: 0, err: '',
    pick: { mode: 'arcade', size: 2 },
    remotes: new Map(), allies: [],
    score: [0, 0], srvT: 0, sendT: 0, cdT: 0, end: null,
    msls: new Map(),      // сетевые ракеты по id сервера
    lockSent: 0,          // какой захват РЛС сервер знает от нас (id соперника или 0)
  };
  const MP_V = new THREE.Vector3();
  const send = (m) => { if (MP.ws && MP.ws.readyState === 1) MP.ws.send(JSON.stringify(m)); };
  const myInfo = () => MP.room && MP.room.players.find((p) => p.id === MP.me);
  const nameOf = (id) => { if (id === MP.me) return 'вы'; const p = MP.room && MP.room.players.find((x) => x.id === id); return p ? p.name : '?'; };

  // ═════════════ Связь ═════════════
  function connect() {
    if (MP.ws) return;
    const acc = account(K.testName);
    if (!acc) { MP.conn = 'noacc'; render(); return; }
    MP.conn = 'connecting'; MP.err = ''; render();
    let ws; try { ws = new WebSocket(serverUrl()); } catch (_) { MP.conn = 'error'; render(); return; }
    MP.ws = ws;
    ws.onopen = () => send({ t: 'hello', name: acc.login, pid: acc.id });
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (_) { return; } if (on[m.t]) on[m.t](m); };
    ws.onclose = () => {
      MP.ws = null; MP.conn = 'error'; MP.room = null;
      if (MP.on) { stopBattle(); K.popup('СВЯЗЬ С СЕРВЕРОМ ПОТЕРЯНА', 'bad'); K.backToMenu(); }
      render();
    };
  }
  const on = {
    welcome(m) { MP.me = m.id; MP.conn = 'on'; render(); },
    err(m) { MP.err = m.msg; if (MP.on) K.popup(m.msg, 'bad'); render(); },
    room(m) {
      MP.room = m; const me = myInfo(); if (me) MP.team = me.team;
      if (m.score) MP.score = m.score;
      if (MP.on && m.state === 'play' && K.G.state === 'countdown') K.goPlay();
      if (m.state === 'lobby' && MP.on && !MP.end) { stopBattle(); K.backToMenu(); }
      render();
    },
    start(m) { startBattle(m); },
    snap(m) {
      if (!MP.on) return;
      if (Math.abs(m.T - MP.srvT) > 0.3) MP.srvT = m.T; else MP.srvT += (m.T - MP.srvT) * 0.1;
      for (const row of m.P) {
        const id = row[0]; if (id === MP.me) continue;
        const c = remote(id); if (!c || !row[1]) continue;
        c.buf.push({ T: m.T, s: row.slice(3, 12) }); if (c.buf.length > 40) c.buf.shift();
        c.hp = row[2];
        c.radar.lock = craftOf(row[12] || 0); c.stt = row[12] === MP.me; c.tgt = c.stt ? K.player : null; // СПО: кто нас ведёт РЛС
      }
      for (const row of m.M || []) snapMissile(row, m.T);
    },
    ml(m) { if (MP.on) netMissile(m); },
    mx(m) {
      const x = MP.msls.get(m.id); if (!x) return;
      MP.msls.delete(m.id); if (x.dead) return;
      x.pos.set(m.p[0], m.p[1], m.p[2]); x.dead = true; K.netDetonated(x, !!m.hit);
    },
    cm(m) { const c = MP.remotes.get(m.id); if (MP.on && c && !c.dead) K.netCM(c, m.type); },
    lockx(m) { MP.lockSent = 0; if (MP.on) K.lockLost(m.why); },
    deny(m) { if (m.msg && MP.on) K.popup(m.msg, 'bad'); },
    hp(m) {
      if (m.id === MP.me) K.setHull(m.hp);
      else { const c = MP.remotes.get(m.id); if (c) { c.hp = m.hp; if (m.by === MP.me) K.hitMark(c); } }
    },
    kill(m) {
      MP.score = m.score;
      const how = m.killer ? `${nameOf(m.killer)} сбил ${nameOf(m.victim)} · ${m.by}` : `${nameOf(m.victim)} разбился`;
      K.popup(how.toUpperCase(), m.victim === MP.me ? 'bad' : m.killer === MP.me ? 'good' : 'info');
      if (m.killer === MP.me) K.G.kills++;
      if (m.victim === MP.me) { MP.down = true; K.meDown(); }
      else { const c = MP.remotes.get(m.victim); if (c && !c.dead) { c.dead = true; c.buf.length = 0; K.remoteDown(c); dropAlly(c); } }
    },
    spawn(m) {
      if (m.id === MP.me) { MP.down = false; MP.lockSent = 0; K.meUp(m.s); send({ t: 'load', l: K.loadout() }); return; }
      const c = remote(m.id); if (!c) return;
      c.buf.length = 0; c.hp = 100;
      if (c.dead) { c.dead = false; K.remoteUp(c); (c.team === MP.team ? MP.allies : K.enemies).push(c); }
      placeRemote(c, m.s[0], m.s[1], m.s[2], m.s[3], 0, 0, 240, 0.85, 0);
    },
    gone(m) { const c = MP.remotes.get(m.id); if (c) dropRemote(c); },
    end(m) { MP.end = m; K.showEnd(m, MP.me, MP.team); },
  };

  // ═════════════ Бой ═════════════
  function startBattle(m) {
    clearRemotes(); MP.msls.clear();
    Object.assign(MP, { on: true, down: false, score: [0, 0], srvT: 0, sendT: 0, end: null, cdT: m.cd, len: m.len || MATCH_T, lockSent: 0 });
    const me = myInfo(); if (me) MP.team = me.team;
    K.startOnline({ mode: m.mode, weather: m.weather, spawn: m.spawns[MP.me], cd: m.cd });
    send({ t: 'load', l: K.loadout() }); // подвеска на эту жизнь — сервер проверит её и будет знать, что есть на пилонах
    for (const p of MP.room.players) if (p.id !== MP.me) remote(p.id);
  }
  function stopBattle() { MP.on = false; MP.down = false; MP.end = null; clearRemotes(); MP.msls.clear(); }
  function remote(id) {
    let c = MP.remotes.get(id); if (c) return c;
    const info = MP.room && MP.room.players.find((p) => p.id === id); if (!info) return null;
    c = K.makeRemote(info, info.team === MP.team);
    Object.assign(c, { id, name: info.name, buf: [], fireT: 0, hp: 100 });
    MP.remotes.set(id, c);
    (c.team === MP.team ? MP.allies : K.enemies).push(c);
    return c;
  }
  function dropAlly(c) { const i = MP.allies.indexOf(c); if (i >= 0) MP.allies.splice(i, 1); }
  function dropRemote(c) {
    MP.remotes.delete(c.id); dropAlly(c);
    const i = K.enemies.indexOf(c); if (i >= 0) K.enemies.splice(i, 1);
    c.dead = true; K.removeRemote(c);
  }
  function clearRemotes() { for (const c of [...MP.remotes.values()]) dropRemote(c); }
  const craftOf = (id) => (!id ? null : id === MP.me ? K.player : MP.remotes.get(id) || null);

  // ═════════════ Сетевые ракеты ═════════════
  // пуск (событие ml): ракета появляется в списке игры; хозяин вышел из комнаты — вместо него «пустышка» с его точкой
  function netMissile(m) {
    const M_ = MISSILES[m.key]; if (!M_ || MP.msls.has(m.id)) return;
    const owner = craftOf(m.owner) || { pos: new THREE.Vector3(m.p[0], m.p[1], m.p[2]), vel: new THREE.Vector3(), speed: 250, yaw: 0, pitch: 0, team: -1 };
    const cp = Math.cos(owner.pitch), dir = new THREE.Vector3(-Math.sin(owner.yaw) * cp, Math.sin(owner.pitch), -Math.cos(owner.yaw) * cp);
    const x = { net: true, id: m.id, key: m.key, M: M_, owner, target: craftOf(m.target), pos: new THREE.Vector3(m.p[0], m.p[1], m.p[2]), dir,
      speed: owner.speed, t: 0, flown: 0, active: false, lost: false, decoy: null, dead: false, trailT: 0, motor: false, seenBy: new Set(),
      srv: new THREE.Vector3(m.p[0], m.p[1], m.p[2]), sdir: dir.clone(), sT: MP.srvT, off: new THREE.Vector3(), seenT: 0 };
    MP.msls.set(m.id, x);
    K.netLaunched(x, m.slot); // модель, вспышка пуска; своя ракета снимается с пилона (x.off — от пилона к точке сервера)
  }
  function snapMissile(row, T) {
    const x = MP.msls.get(row[0]); if (!x || x.dead) return;
    x.srv.set(row[1], row[2], row[3]); x.sdir.set(row[4], row[5], row[6]).normalize(); x.speed = row[7]; x.sT = T; x.seenT = 0;
    x.motor = !!(row[8] & MF_MOTOR); x.active = !!(row[8] & MF_ACTIVE); x.lost = !!(row[8] & MF_LOST);
    x.target = craftOf(row[9]); x.closing = row[10] === null ? undefined : row[10];
    // без рывка: разницу между показанным и новым положением гасим за ~0,2 с
    MP_V.copy(x.srv).addScaledVector(x.sdir, x.speed * Math.min(M_AHEAD, Math.max(0, MP.srvT - T)));
    x.off.copy(x.pos).sub(MP_V); if (x.off.lengthSq() > 300 * 300) x.off.set(0, 0, 0);
  }
  // каждый кадр (из tick вместо updateMissile): положение «сейчас» по последнему снимку, эффекты двигателя
  function stepMissile(x, dt) {
    x.t += dt; x.seenT += dt;
    if (x.seenT > M_LOST_T) { x.dead = true; MP.msls.delete(x.id); K.netGone(x); return; }
    x.off.multiplyScalar(Math.max(0, 1 - 6 * dt));
    const prevX = x.pos.x, prevY = x.pos.y, prevZ = x.pos.z;
    x.pos.copy(x.srv).addScaledVector(x.sdir, x.speed * Math.min(M_AHEAD, Math.max(0, MP.srvT - x.sT))).add(x.off);
    x.flown += Math.hypot(x.pos.x - prevX, x.pos.y - prevY, x.pos.z - prevZ);
    x.dir.lerp(x.sdir, Math.min(1, 12 * dt)).normalize();
    if (x.target && !x.target.dead) x.dPrev = x.pos.distanceTo(x.target.pos);
    K.netMotor(x, x.motor, dt);
  }
  function placeRemote(c, x, y, z, yaw, pitch, roll, speed, thr, flags) {
    c.pos.set(x, y, z); c.yaw = yaw; c.pitch = pitch; c.roll = roll; c.speed = speed; c.thr = thr; c.ab = !!(flags & F_AB);
    const cp = Math.cos(pitch); c.vel.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp).multiplyScalar(speed);
  }
  // положение чужого самолёта на момент srvT − INTERP: между двумя снимками — линейно, после последнего — по прямой
  function interp(c) {
    const b = c.buf; if (!b.length) return false;
    const rt = MP.srvT - INTERP;
    let i = b.length - 1; while (i > 0 && b[i - 1].T > rt) i--;
    const B_ = b[i], A = i > 0 ? b[i - 1] : null, s = B_.s;
    if (A && rt < B_.T) {
      const k = Math.max(0, Math.min(1, (rt - A.T) / ((B_.T - A.T) || 1e-3))), a = A.s, L = (u, v) => u + (v - u) * k;
      placeRemote(c, L(a[0], s[0]), L(a[1], s[1]), L(a[2], s[2]), a[3] + wrapPI(s[3] - a[3]) * k, L(a[4], s[4]), L(a[5], s[5]), L(a[6], s[6]), L(a[7], s[7]), s[8]);
    } else {
      const ahead = Math.min(EXTRAP, Math.max(0, rt - B_.T));
      placeRemote(c, s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7], s[8]);
      c.pos.addScaledVector(c.vel, ahead);
    }
    while (b.length > 2 && b[1].T < rt - 1) b.shift();
    return true;
  }
  function update(dt) {
    if (!MP.on) return;
    MP.srvT += dt;
    if (K.G.state === 'countdown') { MP.cdT -= dt; K.countdown(Math.max(1, Math.ceil(MP.cdT))); }
    for (const c of MP.remotes.values()) {
      if (c.dead || !interp(c)) continue;
      K.remoteVisual(c);
      c.fireT -= dt;
      const last = c.buf[c.buf.length - 1];
      if (last && (last.s[8] & F_FIRE) && c.fireT <= 0) { c.fireT = 1 / 20; K.remoteShot(c); } // трассеры чужой пушки (урон считает сервер)
    }
    // захват РЛС: сервер должен знать, кого мы ведём (подсвет для ПАРЛ, СПО цели)
    if (K.G.state === 'play' && !MP.down) {
      const L = K.radarLock(), id = L && L.remote && !L.dead ? L.id : 0;
      if (id !== MP.lockSent) { MP.lockSent = id; send({ t: 'lock', target: id }); }
    }
    // своё состояние — SNAP_HZ раз в секунду (и во время отсчёта, чтобы нас сразу было видно)
    MP.sendT -= dt;
    if (MP.sendT <= 0 && !MP.down && (K.G.state === 'play' || K.G.state === 'countdown')) {
      MP.sendT = 1 / SNAP_HZ;
      send({ t: 'st', s: packState(K.player, K.firing()) });
    }
  }
  const leftSec = () => (MP.room && MP.room.state === 'play' ? Math.max(0, (MP.len || MATCH_T) - MP.srvT) : (MP.len || MATCH_T));

  // ═════════════ Вкладка «Онлайн» в меню ═════════════
  const seg = (id, val, opts) => `<div class="seg" data-mpseg="${id}">${opts.map(([v, t]) => `<button class="${String(val) === String(v) ? 'on' : ''}" data-v="${v}">${t}</button>`).join('')}</div>`;
  function render() {
    const box = K.tabEl(); if (!box) return;
    K.syncMenu(MP);
    let h = '';
    if (MP.conn === 'noacc') h = `<p class="mpNote">Онлайн — только для зарегистрированных игроков. Войдите на сайте и откройте игру снова.</p>`;
    else if (MP.conn === 'off' || MP.conn === 'connecting') h = `<p class="mpNote">Подключаемся к серверу…</p>`;
    else if (MP.conn === 'error') h = `<p class="mpNote bad">Сервер онлайна сейчас недоступен.</p><button class="btn alt" data-mp="retry">Подключиться снова</button>`;
    else if (!MP.room) {
      h = `<div class="mpRow"><span>Режим</span>${seg('mode', MP.pick.mode, ONLINE_MODES.map((k) => [k, MODES[k].name]))}</div>
        <div class="mpRow"><span>Команды</span>${seg('size', MP.pick.size, SIZES.map((n) => [n, n + '×' + n]))}</div>
        <button class="btn" data-mp="create">Создать комнату</button>
        <div class="mpJoin"><input id="mpCode" maxlength="4" placeholder="КОД" autocomplete="off" autocapitalize="characters" spellcheck="false"><button class="btn alt" data-mp="join">Войти по коду</button></div>
        <p class="mpNote">Создайте комнату и отправьте код друзьям — или войдите в комнату по коду от друга. Бой — ${MATCH_T / 60} минут, сбитые возрождаются через 5 с, побеждает команда, сбившая больше.</p>`;
    } else {
      const r = MP.room, me = myInfo();
      const team = (t) => {
        const ps = r.players.filter((p) => p.team === t);
        let rows = ps.map((p) => `<div class="mpP${p.id === MP.me ? ' me' : ''}"><span>${esc(p.name)}${p.id === r.host ? ' <i>создатель</i>' : ''}</span><b class="${p.ready ? 'ok' : ''}">${r.state === 'lobby' ? (p.ready ? 'готов' : 'ждём') : p.k + '/' + p.d}</b></div>`).join('');
        for (let i = ps.length; i < r.size; i++) rows += `<div class="mpP free"><span>свободно</span></div>`;
        const canMove = r.state === 'lobby' && me && me.team !== t && ps.length < r.size;
        return `<div class="mpTeam t${t}"><div class="mpTH">${TEAM_NAMES[t]}${r.state !== 'lobby' ? ' · ' + r.score[t] : ''}</div>${rows}${canMove ? `<button class="mpMove" data-mp="team" data-team="${t}">перейти сюда</button>` : ''}</div>`;
      };
      const st = { lobby: 'лобби', countdown: 'отсчёт', play: 'идёт бой', end: 'итоги' }[r.state];
      h = `<div class="mpHead">Комната <b>${r.code}</b> · ${MODES[r.mode].name} ${r.size}×${r.size} · ${st}<button class="mpCopy" data-mp="copy">скопировать код</button></div>
        <div class="mpTeams">${team(0)}${team(1)}</div>
        <p class="mpNote">${r.state === 'lobby' ? 'Бой начнётся, когда <b>все</b> игроки нажмут «Готов» (кнопка внизу) и в обеих командах будет хотя бы по одному.' : 'В комнате идёт бой — дождитесь его конца.'}</p>
        <button class="btn alt" data-mp="leave">Выйти из комнаты</button>`;
    }
    if (MP.err) h += `<p class="mpNote bad">${esc(MP.err)}</p>`;
    box.innerHTML = h;
  }
  function onClick(e) {
    const s = e.target.closest('[data-mpseg] button');
    if (s) { const k = s.parentElement.dataset.mpseg; MP.pick[k] = k === 'size' ? +s.dataset.v : s.dataset.v; render(); return; }
    const b = e.target.closest('[data-mp]'); if (!b) return;
    MP.err = '';
    const a = b.dataset.mp;
    if (a === 'retry') connect();
    else if (a === 'create') send({ t: 'create', mode: MP.pick.mode, size: MP.pick.size });
    else if (a === 'join') { const code = cleanCode((document.getElementById('mpCode') || {}).value); if (code.length === 4) send({ t: 'join', code }); else { MP.err = 'Код комнаты — 4 символа'; render(); } }
    else if (a === 'leave') { send({ t: 'leave' }); MP.room = null; render(); }
    else if (a === 'team') send({ t: 'team', team: +b.dataset.team });
    else if (a === 'copy') { try { navigator.clipboard.writeText(MP.room.code); b.textContent = 'скопировано'; } catch (_) { /* нет доступа к буферу */ } }
  }

  return Object.assign(MP, {
    connect, render, onClick, update,
    inLobby: () => !!(MP.room && MP.room.state === 'lobby' && !MP.on),
    toggleReady: () => { const me = myInfo(); if (me) send({ t: 'ready', on: !me.ready }); },
    leave: () => { send({ t: 'leave' }); if (MP.ws) MP.ws.close(); },
    hitRemote: (c) => send({ t: 'hit', target: c.id }),
    launch: (key, target, slot) => send({ t: 'launch', key, target: target && target.remote ? target.id : 0, slot, s: packState(K.player, false) }),
    cm: (type) => send({ t: 'cm', type }),
    stepMissile,
    selfDamage: (dmg) => send({ t: 'self', dmg }),
    leftSec, myInfo, nameOf,
    closeResults: () => { stopBattle(); render(); },
  });
}
