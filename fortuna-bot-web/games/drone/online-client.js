// Онлайн «Симулятора Летки» на стороне игрока: связь с сервером (game-server), лобби во вкладке «Онлайн»,
// чужие самолёты (сглаженные снимки сервера), отправка своего состояния, сбития, возрождение, итоги боя.
// Своим самолётом игрок управляет у себя без задержки; урон, счёт и время ведёт сервер.
// Ракеты, ловушки и захваты РЛС тоже считает сервер: пуск/захват/ЛТЦ — заявка серверу, ракеты («сетевые», net: true)
// лежат в общем списке missiles игры и двигаются по снимкам сервера с досчётом по скорости — их видят HUD, СПО и звук.
// Этап 3: быстрый поиск (очередь по режиму, «Бой найден — подтвердить»), боты в лобби (создатель: «+ бот», убрать, перевести),
// переподключение (связь оборвалась в бою — до RECONN_T с пробуем вернуться, самолёт тем временем ведёт ИИ сервера),
// «you» — сервер отдаёт самолёт обратно после ИИ (вкладка была свёрнута) с его положением, корпусом, подвеской.
// main.js передаёт в createOnline объект K — доступ к игре (игрок, списки противников, эффекты, HUD).
/* global THREE, CONFIG */
import { MATCH_T, SNAP_HZ, SIZES, TEAM_NAMES, ONLINE_MODES, PORT, F_AB, F_FIRE, MF_MOTOR, MF_ACTIVE, MF_LOST, packState, cleanCode } from './sim/online.js?v=20260930c';
import { MODES } from './sim/modes.js?v=20260930c';
import { MISSILES } from './missiles.js?v=20260930c';

const INTERP = 0.12;   // чужие самолёты показываем на 120 мс в прошлом — между двумя снимками, без рывков
const EXTRAP = 0.35;   // если снимки не пришли — продолжаем движение по прямой не дольше этого, с
const M_AHEAD = 0.5;   // ракету показываем «сейчас»: последний снимок + скорость × прошедшее время (не дольше этого, с)
const M_LOST_T = 1.5;  // ракета пропала из снимков дольше этого — убираем без взрыва
const RECONN_T = 55;   // связь оборвалась в бою — пробуем вернуться столько секунд (сервер держит место 60 с)

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
// билет онлайна: подписанный сайтом {pid, login, exp} (функция mp-ticket) — сервер с MP_SECRET пускает только по нему.
// Нет конфига/функции (локальная проверка) — null: сервер разработки пускает по нику.
async function fetchTicket(acc) {
  try {
    if (typeof CONFIG === 'undefined' || !CONFIG.MP_TICKET_URL || String(acc.id).startsWith('test-')) return null;
    const key = String(CONFIG.SUPABASE_ANON_KEY).replace(/[^\x21-\x7E]/g, '');
    const res = await fetch(CONFIG.MP_TICKET_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key, apikey: key },
      body: JSON.stringify({ player_id: acc.id }) });
    const d = await res.json().catch(() => ({}));
    return res.ok && d.ticket ? d.ticket : null;
  } catch (_) { return null; }
}
// ссылка-приглашение в комнату: на сайте — короткий вход /play (сохраняет #mp=КОД), локально — эта же страница с ?mp=КОД
export function inviteUrl(code) {
  if (/(^|\.)fortunawtm\.com$/.test(location.hostname)) return `https://fortunawtm.com/play#mp=${code}`;
  const u = new URL(location.href); u.searchParams.set('mp', code); return u.href;
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
    searching: { arcade: 0, real: 0 }, // сколько игроков в быстром поиске по режимам
    q: null,              // мой быстрый поиск: { mode, state: 'wait'|'found'|'accepted', n, left, acc }
    reconn: 0,            // > 0 — связь оборвалась в бою, пробуем вернуться (секунд осталось)
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
    ws.onopen = async () => {
      const ticket = await fetchTicket(acc);
      if (MP.ws === ws) send({ t: 'hello', name: acc.login, pid: acc.id, ticket, resume: MP.reconn > 0 ? 1 : 0 });
    };
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (_) { return; } if (on[m.t]) on[m.t](m); };
    ws.onclose = () => {
      if (MP.ws !== ws) return;
      MP.ws = null; MP.q = null;
      if (MP.on && !MP.end) { // в бою — переподключаемся: место на сервере держится, самолёт пока ведёт ИИ
        if (!MP.reconn) { MP.reconn = RECONN_T; K.popup('СВЯЗЬ ПОТЕРЯНА — ПЕРЕПОДКЛЮЧАЕМСЯ', 'bad'); }
        MP.conn = 'connecting';
        setTimeout(() => { if (MP.reconn > 0 && !MP.ws) connect(); }, 2000);
        return;
      }
      MP.conn = 'error'; MP.room = null;
      if (MP.on) { stopBattle(); K.popup('СВЯЗЬ С СЕРВЕРОМ ПОТЕРЯНА', 'bad'); K.backToMenu(); }
      render();
    };
  }
  function giveUp() { // вернуться в бой не вышло
    MP.reconn = 0; K.status('');
    if (MP.ws) { const w = MP.ws; MP.ws = null; try { w.close(); } catch (_) { /* уже */ } }
    MP.conn = 'error'; MP.room = null;
    if (MP.on) { stopBattle(); K.popup('СВЯЗЬ С СЕРВЕРОМ ПОТЕРЯНА', 'bad'); K.backToMenu(); }
    render();
  }
  // сервер отдаёт самолёт после ИИ: ставим его туда, где он сейчас, и отвечаем back
  function takeYou(y) {
    if (!y || y.dead) { if (y) send({ t: 'back', n: y.n }); return; }
    K.applyYou(y); MP.lockSent = 0;
    send({ t: 'back', n: y.n });
  }
  const on = {
    welcome(m) {
      MP.me = m.id; MP.conn = 'on';
      if (MP.autoCode && !m.resumed) { send({ t: 'join', code: MP.autoCode }); MP.autoCode = ''; } // пришли по ссылке-приглашению
      render();
    },
    noresume() { if (MP.reconn) giveUp(); },
    search(m) { MP.searching = { arcade: m.arcade, real: m.real }; if (!MP.room) render(); },
    queued(m) { MP.q = { mode: m.mode, state: 'wait' }; render(); },
    unqueued(m) { MP.q = null; if (m.why) MP.err = m.why; render(); },
    found(m) { MP.q = { mode: m.mode, state: 'found', n: m.n, until: performance.now() + m.T * 1000, left: m.T, acc: 0 }; K.onFound(); render(); },
    accepted(m) { if (MP.q && MP.q.state !== 'wait') { MP.q.acc = m.n; render(); } },
    you(m) { if (MP.on && !MP.down) { K.popup('ПОКА ВАС НЕ БЫЛО, САМОЛЁТ ВЁЛ ИИ', 'info'); takeYou(m); } else send({ t: 'back', n: m.n }); },
    err(m) { MP.err = m.msg; if (MP.on) K.popup(m.msg, 'bad'); render(); },
    room(m) {
      MP.room = m; MP.q = null; const me = myInfo(); if (me) MP.team = me.team;
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
    result(m) { if (K.onResult) K.onResult(m); }, // итог боя, подписанный сервером, — награда и очки операции на сайте
  };

  // ═════════════ Бой ═════════════
  // start: начало боя; с resume — вход в идущий бой или возвращение после обрыва связи (you — где сейчас мой самолёт)
  function startBattle(m) {
    clearRemotes(); MP.msls.clear();
    const R = m.resume;
    Object.assign(MP, { on: true, down: false, score: R ? R.score : [0, 0], srvT: R ? R.t : 0, sendT: 0, end: null, cdT: m.cd, len: m.len || MATCH_T, lockSent: 0, reconn: 0, q: null });
    const me = myInfo(); if (me) MP.team = me.team;
    K.status('');
    K.startOnline({ mode: m.mode, weather: m.weather, spawn: m.spawns[MP.me], cd: m.cd });
    if (R && R.you) { // вернулся после обрыва: самолёт там, куда его довёл ИИ
      if (R.you.dead) { MP.down = true; K.meDown(); send({ t: 'back', n: R.you.n }); } else takeYou(R.you);
      if (me) K.G.kills = me.k;
    } else send({ t: 'load', l: K.loadout() }); // подвеска на эту жизнь — сервер проверит её и будет знать, что есть на пилонах
    if (MP.room) for (const p of MP.room.players) if (p.id !== MP.me) remote(p.id);
    if (m.cd <= 0) K.goPlay();
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
    if (MP.q && MP.q.state === 'found') { const was = Math.ceil(MP.q.left); MP.q.left = (MP.q.until - performance.now()) / 1000; if (Math.ceil(MP.q.left) !== was) render(); } // по часам, не по кадрам
    if (MP.reconn > 0) {
      MP.reconn -= dt;
      K.status(`НЕТ СВЯЗИ · переподключение ${Math.max(0, Math.ceil(MP.reconn))} с`);
      if (MP.reconn <= 0) giveUp();
    }
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
      const q = MP.q, S = MP.searching, qName = q && MODES[q.mode].name;
      let quick;
      if (!q) quick = `<button class="btn" data-mp="queue">Быстрый бой · ${MODES[MP.pick.mode].name}</button>`;
      else if (q.state === 'wait') quick = `<div class="mpFound">Ищем бой · ${qName}…</div><button class="btn alt" data-mp="unqueue">Отменить поиск</button>`;
      else if (q.state === 'found') quick = `<div class="mpFound">Бой найден! ${qName}, игроков: <b>${q.n}</b></div>
        <p class="mpNote">Подтвердите за <b>${Math.max(0, Math.ceil(q.left))} с</b>${q.acc ? ` · подтвердили ${q.acc} из ${q.n}` : ''}</p>
        <div class="mpRow2"><button class="btn" data-mp="accept">Подтвердить</button><button class="btn alt" data-mp="decline">Отказаться</button></div>`;
      else quick = `<div class="mpFound">Подтверждено — ждём остальных (${q.acc || 1} из ${q.n})</div>`;
      h = `<div class="mpRow"><span>Режим</span>${seg('mode', MP.pick.mode, ONLINE_MODES.map((k) => [k, MODES[k].name]))}</div>
        <div class="mpQuick">${quick}<p class="mpNote">Сейчас ищут бой: ${MODES.arcade.name} — <b>${S.arcade}</b> · ${MODES.real.name} — <b>${S.real}</b>. Сервер соберёт команды из ищущих в выбранном режиме (свободные места займут боты).</p></div>
        <div class="mpRow"><span>Команды</span>${seg('size', MP.pick.size, SIZES.map((n) => [n, n + '×' + n]))}</div>
        <button class="btn" data-mp="create">Создать комнату</button>
        <div class="mpJoin"><input id="mpCode" maxlength="4" placeholder="КОД" autocomplete="off" autocapitalize="characters" spellcheck="false"><button class="btn alt" data-mp="join">Войти по коду</button></div>
        <p class="mpNote">Или создайте комнату и отправьте код друзьям — или войдите в комнату по коду от друга (можно и в идущий бой, если есть место). Свободные места можно отдать ботам. Бой — ${MATCH_T / 60} минут, сбитые возрождаются через 5 с, побеждает команда, сбившая больше.</p>`;
    } else {
      const r = MP.room, me = myInfo(), host = r.host === MP.me, lobby = r.state === 'lobby';
      const team = (t) => {
        const ps = r.players.filter((p) => p.team === t);
        let rows = ps.map((p) => {
          const tag = p.bot ? '<em>бот</em>' : p.away ? '<em>нет связи</em>' : p.ai ? '<em>ведёт ИИ</em>' : '';
          const ctl = host && lobby ? (p.bot ? `<button class="mpX" data-mp="kick" data-id="${p.id}" title="Убрать бота">×</button>` : '')
            + (p.id !== MP.me ? `<button class="mpX" data-mp="move" data-id="${p.id}" title="В другую команду">⇄</button>` : '') : '';
          return `<div class="mpP${p.id === MP.me ? ' me' : ''}${p.bot ? ' bot' : ''}${p.away ? ' away' : ''}"><span>${esc(p.name)}${p.id === r.host ? ' <i>создатель</i>' : ''}${tag}</span>`
            + `<b class="${p.ready ? 'ok' : ''}">${lobby ? (p.ready ? 'готов' : 'ждём') : p.k + '/' + p.d}${ctl}</b></div>`;
        }).join('');
        for (let i = ps.length; i < r.size; i++) rows += `<div class="mpP free"><span>свободно</span></div>`;
        const canMove = lobby && me && me.team !== t && ps.length < r.size, canBot = host && lobby && ps.length < r.size;
        const btns = (canMove ? `<button class="mpMove" data-mp="team" data-team="${t}">перейти сюда</button>` : '') + (canBot ? `<button class="mpMove" data-mp="bot" data-team="${t}">+ бот</button>` : '');
        return `<div class="mpTeam t${t}"><div class="mpTH">${TEAM_NAMES[t]}${!lobby ? ' · ' + r.score[t] : ''}</div>${rows}${btns ? `<div class="mpBtns">${btns}</div>` : ''}</div>`;
      };
      const st = { lobby: 'лобби', countdown: 'отсчёт', play: 'идёт бой', end: 'итоги' }[r.state];
      h = `<div class="mpHead">Комната <b>${r.code}</b> · ${MODES[r.mode].name} ${r.size}×${r.size} · ${st}<button class="mpCopy" data-mp="invite">пригласить</button><button class="mpCopy mpCopy2" data-mp="copy">код</button></div>
        <div class="mpTeams">${team(0)}${team(1)}</div>
        <p class="mpNote">${lobby ? 'Бой начнётся, когда <b>все</b> игроки нажмут «Готов» (кнопка внизу) и в обеих командах будет хотя бы по одному (можно боты).'
          + (host ? ' Вы создатель: «+ бот» — отдать свободное место боту, × — убрать бота, ⇄ — перевести в другую команду.' : '') : 'В комнате идёт бой — дождитесь его конца.'}</p>
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
    else if (a === 'create') { const { mode, size } = MP.pick; K.gate(() => send({ t: 'create', mode, size })); }
    else if (a === 'join') { const code = cleanCode((document.getElementById('mpCode') || {}).value); if (code.length === 4) K.gate(() => send({ t: 'join', code })); else { MP.err = 'Код комнаты — 4 символа'; render(); } }
    else if (a === 'leave') { send({ t: 'leave' }); MP.room = null; render(); }
    else if (a === 'team') send({ t: 'team', team: +b.dataset.team });
    else if (a === 'bot') send({ t: 'bot', team: +b.dataset.team });
    else if (a === 'kick') send({ t: 'kick', id: +b.dataset.id });
    else if (a === 'move') send({ t: 'move', id: +b.dataset.id });
    else if (a === 'queue') { const mode = MP.pick.mode; K.gate(() => send({ t: 'queue', mode })); }
    else if (a === 'unqueue') { send({ t: 'unqueue' }); MP.q = null; render(); }
    else if (a === 'accept') K.gate(() => { send({ t: 'accept' }); if (MP.q) { MP.q.state = 'accepted'; render(); } });
    else if (a === 'decline') { send({ t: 'decline' }); MP.q = null; render(); }
    else if (a === 'copy') { try { navigator.clipboard.writeText(MP.room.code); b.textContent = 'скопировано'; } catch (_) { /* нет доступа к буферу */ } }
    else if (a === 'invite') K.share(inviteUrl(MP.room.code), `Летим вместе в «Симуляторе Летки»! Комната ${MP.room.code} (${MODES[MP.room.mode].name} ${MP.room.size}×${MP.room.size})`, b);
  }

  MP.autoCode = cleanCode(K.inviteCode || ''); if (MP.autoCode.length !== 4) MP.autoCode = ''; // ?mp=КОД — сразу войти в комнату после подключения (?mp=1 — только открыть вкладку)
  return Object.assign(MP, {
    connect, render, onClick, update,
    inLobby: () => !!(MP.room && MP.room.state === 'lobby' && !MP.on),
    toggleReady: () => { const me = myInfo(); if (!me) return; if (me.ready) send({ t: 'ready', on: false }); else K.gate(() => send({ t: 'ready', on: true })); },
    leave: () => { MP.reconn = 0; send({ t: 'leave' }); if (MP.ws) MP.ws.close(); },
    hitRemote: (c) => send({ t: 'hit', target: c.id }),
    launch: (key, target, slot) => send({ t: 'launch', key, target: target && target.remote ? target.id : 0, slot, s: packState(K.player, false) }),
    cm: (type) => send({ t: 'cm', type }),
    stepMissile,
    selfDamage: (dmg) => send({ t: 'self', dmg }),
    leftSec, myInfo, nameOf,
    closeResults: () => { stopBattle(); render(); },
  });
}
