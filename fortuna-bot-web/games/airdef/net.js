// Онлайн «Воздушного превосходства» — клиент. Связь с сервером (адрес /ad того же сервера, что «Летка»), лобби, быстрый
// поиск и «зеркало» боя: бой считает сервер, клиент повторяет его по снимкам (SNAP_HZ) и событиям.
// Зеркало — обычный бой sim/strike.js (его не шагаем): комплексы, ЗУР и оружие самолётов лежат в его массивах, поэтому
// вся отрисовка, HUD, СПО, круговой обзор и подсказки работают как в одиночной игре. Команды игрока (сброс, ловушки,
// пуск, захват, РЛС, ручное наведение, покупки) уходят серверу — их перехватывает обёртка методов зеркала (wrapMirror).
// Чужие самолёты и боты — «зеркальные» самолёты в C.raid.planes; свой самолёт игрок ведёт сам (C.player).
/* global THREE, CONFIG */
import * as O from './sim/online.js?v=20261010t';
import { AG, SAM } from './arsenal.js?v=20261010t';
import { LNCH } from './launchers.js?v=20261010t';

const PORT = 8787;
export function adServerUrl() {
  const h = location.hostname;
  if (/(^|\.)fortunawtm\.com$/.test(h)) return 'wss://game.fortunawtm.com' + O.AD_PATH;
  return `ws://${h || 'localhost'}:${PORT}${O.AD_PATH}`; // проверка: сервер на этом же компьютере (или по IP в сети)
}
const TEST = new URLSearchParams(location.search).get('mpname');
function account() {
  if (TEST) return { id: 'test-' + TEST, login: TEST };
  try { const p = JSON.parse(localStorage.getItem('fortuna_web_player') || 'null'); return p && p.id && p.login ? p : null; } catch (_) { return null; }
}
async function fetchTicket(acc) {
  try {
    if (typeof CONFIG === 'undefined' || !CONFIG.MP_TICKET_URL || String(acc.id).startsWith('test-')) return null;
    const key = String(CONFIG.SUPABASE_ANON_KEY).replace(/[^\x21-\x7E]/g, '');
    const res = await fetch(CONFIG.MP_TICKET_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key, apikey: key }, body: JSON.stringify({ player_id: acc.id }) });
    const d = await res.json().catch(() => ({}));
    return res.ok && d.ticket ? d.ticket : null;
  } catch (_) { return null; }
}
const V = () => new THREE.Vector3();
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const AHEAD = 0.5;      // досчёт по скорости не дальше, с
const SEND_ST = 0.05, SEND_LASER = 0.25, SEND_AIM = 0.1;

export function createNet(C) {
  const N = { conn: 'off', me: null, room: null, queued: null, qwait: 0, search: null, err: '', battle: null, myCraft: false, lives: null };
  const L = {}; N.on = (ev, f) => (L[ev] = L[ev] || []).push(f);
  const emit = (ev, ...a) => { for (const f of L[ev] || []) try { f(...a); } catch (e) { console.warn('net', ev, e); } };
  let ws = null, stT = 0, laserT = 0, aimT = 0, lastMethod = null;
  N.send = (m) => { try { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); } catch (_) { /* закрылась */ } };

  // ═════════════ Связь ═════════════
  N.connect = async () => {
    if (ws && ws.readyState <= 1) return;
    const acc = account();
    if (!acc) { N.conn = 'noacc'; emit('conn'); return; }
    N.conn = 'connecting'; emit('conn');
    try { ws = new WebSocket(adServerUrl()); } catch (_) { N.conn = 'error'; emit('conn'); return; }
    ws.onopen = async () => { const ticket = await fetchTicket(acc); N.send({ t: 'hello', ticket, name: acc.login, pid: String(acc.id) }); };
    ws.onerror = () => { N.conn = 'error'; emit('conn'); };
    ws.onclose = () => { N.conn = N.conn === 'error' ? 'error' : 'off'; ws = null; N.queued = null; emit('conn'); if (N.battle) { N.battle.lost = true; emit('lost'); } };
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (_) { return; } handle(m); };
  };
  N.close = () => { try { ws && ws.close(); } catch (_) { /* уже */ } };
  // лобби и очередь
  N.queue = (mode, role) => N.send({ t: 'queue', mode, role });
  N.unqueue = () => N.send({ t: 'unqueue' });
  N.create = (o) => N.send({ t: 'create', ...o });
  N.join = (code, team) => N.send({ t: 'join', code, team });
  N.leave = () => N.send({ t: 'leave' });
  N.team = (team) => N.send({ t: 'team', team });
  N.ready = (on) => N.send({ t: 'ready', on });
  N.bot = (team) => N.send({ t: 'bot', team });
  N.kick = (id) => N.send({ t: 'kick', id });
  N.opts = (o) => N.send({ t: 'opts', ...o });
  // расстановка и покупки
  N.buyAir = (i) => N.send({ t: 'buyAir', i });
  N.buyUnit = (k, x, z, roof) => N.send({ t: 'buyUnit', k, x, z, roof: roof ? 1 : 0 });
  N.sell = (id) => N.send({ t: 'sell', id });
  N.move = (id, x, z, roof) => N.send({ t: 'move', id, x, z, roof: roof ? 1 : 0 });
  N.myTeam = () => { const p = N.room && N.me && N.room.players.find((q) => q.id === N.me.id); return p ? p.team : null; };
  N.myPlayer = () => N.room && N.me && N.room.players.find((q) => q.id === N.me.id);

  function handle(m) {
    switch (m.t) {
      case 'welcome': N.me = { id: m.id, name: m.name }; N.conn = 'on'; N.search = m.search || null; emit('conn'); return;
      case 'err': N.err = m.msg; emit('err', m.msg); return;
      case 'deny': emit('deny', m.msg); return;
      case 'queued': N.queued = { mode: m.mode, n: m.n, t: performance.now() }; N.qwait = 0; emit('queue'); return;
      case 'unqueued': N.queued = null; N.qwait = 0; emit('queue'); return;
      case 'qwait': N.qwait = performance.now() + m.T * 1000; emit('queue'); return;
      case 'room': {
        const was = N.room ? N.room.state : null;
        N.room = m; N.queued = null;
        if (N.battle) { N.battle.wave = m.wave; N.battle.state = m.state; }
        emit('room', was);
        return;
      }
      case 'left': case 'closed': N.room = null; endMirror(); emit('room', null); return;
      case 'start': startMirror(m); emit('start'); return;
      case 'state': applyState(m); emit('state'); return;
      case 'spawn': onSpawn(m); return;
      case 's': snapshot(m); return;
      case 'ev': for (const e of m.e) applyEv(e); return;
      case 'waveEnd': emit('waveEnd', m); return;
      case 'end': emit('end', m); return;
      case 'help': emit('help', m); return;
    }
  }

  // ═════════════ Зеркало боя ═════════════
  const ac = new Map();          // id → зеркальный самолёт (чужие люди, боты, ИИ, ложные цели)
  const sams = new Map(), wpns = new Map();
  N.raid = { planes: [], alive: () => N.raid.planes.filter((a) => !a.dead && !a.out), spawn() {}, spawnWave() {}, spawnDecoy() {}, step() {}, hurt() {}, laserSpot: () => null };
  function startMirror(m) {
    endMirror();
    N.battle = { era: m.era, sideAir: m.sideAir, mode: m.mode, targets: m.targets, waves: m.waves, wave: 0, state: 'plan', valueK: 0, T: 0 };
    C.netBattle(N, { defSide: m.sideAir === 'east' ? 'west' : 'east', era: m.era, mode: m.mode });
    wrapMirror(C.S);
  }
  function endMirror() { ac.clear(); sams.clear(); wpns.clear(); N.raid.planes.length = 0; N.battle = null; N.myCraft = false; }
  const findAir = (id) => (id > 0 ? (N.me && id === N.me.id && C.player ? C.player : ac.get(id)) : id < 0 ? wpns.get(-id) : null) || null;
  // команды игрока — серверу; на месте — только то, что нужно интерфейсу
  function wrapMirror(S) {
    const o = { designate: S.designate, setManual: S.setManual, setEmit: S.setEmit };
    S.release = (a, key, opts = {}) => { const p = opts.aim; N.send({ t: 'rel', k: key, aim: p ? [p.x, p.y, p.z] : null, tg: opts.target ? opts.target.id : 0 }); return null; };
    S.dropCM = (a, type) => { N.send({ t: 'cm', type }); if (C.simFx.cmDrop) for (const k of type === 'both' ? ['flare', 'chaff'] : [type]) C.simFx.cmDrop(a, k); }; // 'both' — пачка ЛТЦ и диполей
    S.launch = (u) => { N.send({ t: 'launch', id: u.id }); return null; };
    S.designate = (u, t) => { o.designate(u, t); N.send({ t: 'desig', id: u.id, tg: t ? (t.isMun ? -t.id : t.id) : 0 }); };
    S.setEmit = (u, on) => { u.emit = !!on; N.send({ t: 'emit', id: u.id, on: !!on }); };
    S.setManual = (u, on) => { o.setManual(u, on); N.send({ t: 'op', id: on ? u.id : 0 }); lastMethod = null; };
    S.step = () => {};
  }
  function applyState(m) {
    const S = C.S; if (!S) return;
    N.battle.wave = m.wave;
    for (const u of [...S.units]) S.removeUnit(u);
    for (const [id, k, x, z, roof, owner, yaw, dead] of m.units) { if (!SAM[k]) continue; const u = S.addUnit(k, x, z, { id, roof: !!roof, yaw }); u.owner = owner; u.dead = !!dead; }
    for (const [id, hp, dead] of m.objects) { const o = S.objects.find((q) => q.id === id); if (o) { o.hp = hp; if (dead && !o.dead) { o.dead = true; C.objLook(id, true); } } }
    C.syncUnits();
  }
  function onSpawn(m) {
    if (N.me && m.id === N.me.id) { N.myCraft = true; N.lives = m.lives; emit('spawn', m); }
  }
  // самолёт в зеркале: создаётся по событию «an» (или по первому снимку — как бомбардировщик)
  function mkAir(id, role = 'bomber', plane = '', decoyKey = '', owner = 0, load = '') {
    const a = { id, pos: V(), vel: V(), sp: V(), sv: V(), st: 0, yaw: 0, pitch: 0, roll: 0, ty: 0, tp: 0, tr: 0, speed: 0, thr: 0.9, ab: false, hp: 100, hpMax: role === 'human' ? 100 : 70,
      dead: false, out: false, side: N.battle ? N.battle.sideAir : 'west', role: role === 'human' ? 'bomber' : role, plane: plane || null, decoyKey: decoyKey || null, owner, phase: 'ingress',
      r: 10, rcs: 5, ir: 1, load: load ? load.split(',').filter(Boolean).map((s) => { const [key, n] = s.split(':'); return { key, n: +n }; }).filter((l) => AG[l.key]) : [], fresh: true };
    ac.set(id, a); N.raid.planes.push(a);
    return a;
  }
  function dropAir(a) { ac.delete(a.id); const i = N.raid.planes.indexOf(a); if (i >= 0) N.raid.planes.splice(i, 1); }
  function snapshot(m) {
    const S = C.S; if (!S || !N.battle) return;
    if (m.e) for (const e of m.e) applyEv(e);
    const now = performance.now() / 1000;
    N.battle.T = m.T; N.battle.valueK = m.V;
    const seen = new Set();
    for (const s of m.A) {
      const id = s[0]; seen.add(id);
      if (N.me && id === N.me.id && N.myCraft) continue; // свой самолёт ведём сами
      let a = ac.get(id); if (!a) a = mkAir(id);
      a.dead = !(s[1] & O.A_ALIVE); a.ab = !!(s[1] & O.A_AB); a.out = !!(s[1] & O.A_OUT); a.hp = s[2];
      a.sp.set(s[3], s[4], s[5]); a.ty = s[6]; a.tp = s[7]; a.tr = s[8]; a.speed = s[9]; a.thr = s[10]; a.st = now;
      a.sv.set(-Math.sin(a.ty) * Math.cos(a.tp), Math.sin(a.tp), -Math.cos(a.ty) * Math.cos(a.tp)).multiplyScalar(a.speed);
      if (a.fresh) { a.pos.copy(a.sp); a.yaw = a.ty; a.pitch = a.tp; a.roll = a.tr; a.vel.copy(a.sv); a.fresh = false; }
    }
    for (const a of [...ac.values()]) if (!seen.has(a.id)) { if (!a.dead) a.out = true; dropAir(a); }
    // комплексы
    for (const s of m.U) {
      const u = S.units.find((q) => q.id === s[0]); if (!u) continue;
      const wasDead = u.dead; u.dead = !!(s[1] & O.U_DEAD);
      u.emit = !!(s[1] & O.U_EMIT); u.gunOn = !!(s[1] & O.U_GUN); if (!(u.manual && u.owner === (N.me && N.me.id))) u.manual = !!(s[1] & O.U_MAN);
      u.lyaw = s[2]; u.lel = s[3]; u.track = findAir(s[4]); u.ammo = s[5]; u.reloadT = s[6]; u.hp = s[7];
      if (u.dead && !wasDead) { C.simFx.unitDestroyed && C.simFx.unitDestroyed(u); }
    }
    // ЗУР
    for (const s of m.M) {
      const mm = sams.get(s[0]); if (!mm) continue;
      mm.sp.set(s[1], s[2], s[3]); mm.dir.set(s[4], s[5], s[6]).normalize(); mm.speed = s[7]; mm.st = now; mm.target = findAir(s[9]);
      const lit = !!(s[8] & O.M_MOTOR), staged = !!(s[8] & O.M_STAGED); mm.lost = !!(s[8] & O.M_LOST);
      if (lit && !mm.lit) { mm.lit = true; mm.tb = 0; if (mm.started) C.simFx.samIgnite(mm); }
      if (staged && !mm.staged) { mm.staged = true; C.simFx.samStage(mm); }
      if (!mm.started) { mm.pos.copy(mm.sp); mm.started = true; C.simFx.samLaunch(mm); }
    }
    // оружие самолётов
    for (const s of m.W) { const w = wpns.get(s[0]); if (!w) continue; w.sp.set(s[1], s[2], s[3]); w.vel.set(s[4], s[5], s[6]); w.st = now; if (!w.started) { w.pos.copy(w.sp); w.started = true; } }
  }
  function applyEv(e) {
    const S = C.S; if (!S || !N.battle) return;
    const P = (i) => new THREE.Vector3(e[i], e[i + 1], e[i + 2]);
    switch (e[0]) {
      case 'an': { const [, id, role, plane, dk, owner, load] = e; if (N.me && id === N.me.id) return; const a = ac.get(id); if (a) dropAir(a); mkAir(id, role, plane, dk, owner, load); return; }
      case 'sl': { // пуск ЗУР: ракета появится на месте по снимку (в этом же сообщении)
        const [, id, uid, tg, slot] = e, u = S.units.find((q) => q.id === uid); if (!u) return;
        const LN = LNCH[u.key] || null;
        const m = { id, unit: u, S: u.S, M: u.S.msl, ln: LN, target: findAir(tg), pos: u.pos.clone(), sp: u.pos.clone(), dir: V().set(0, 1, 0), speed: 0, st: performance.now() / 1000,
          t: 0, tb: -1, lit: false, staged: false, dead: false, lost: false, decoy: null, slot, flown: 0, trailT: 0, started: false };
        sams.set(id, m); S.sams.push(m);
        if (u.slotT && slot >= 0) u.slotT[slot] = 1.5;
        return;
      }
      case 'se': { const m = sams.get(e[1]); if (!m) return; m.dead = true; m.pos.copy(P(3)); sams.delete(m.id); const i = S.sams.indexOf(m); if (i >= 0) S.sams.splice(i, 1); C.simFx.samEnd(m, !!e[2]); return; }
      case 'wr': {
        const [, id, key, owner] = e, W = AG[key]; if (!W) return;
        const own = N.me && owner === N.me.id && C.player ? C.player : ac.get(owner) || null;
        const w = { id, key, W, owner: own, pos: P(4), sp: P(4), vel: P(7), dir: P(7).normalize(), st: performance.now() / 1000, speed: 0, t: 0, dead: false, isMun: true, started: true, trailT: 0, homing: W.kind !== 'bomb' };
        w.speed = w.vel.length(); wpns.set(id, w); S.wpns.push(w); C.simFx.wpnRelease(w);
        if (own && own.load) { const l = own.load.find((q) => q.key === key && q.n > 0); if (l) l.n--; }
        return;
      }
      case 'we': { const w = wpns.get(e[1]); if (!w) return; w.dead = true; w.pos.copy(P(2)); wpns.delete(w.id); const i = S.wpns.indexOf(w); if (i >= 0) S.wpns.splice(i, 1); C.simFx.wpnEnd(w, { objects: [], units: [], intercepted: !!e[5] }); return; }
      case 'x': C.simFx.explosion(P(1), e[4], e[5]); return;
      case 'cm': { if (N.me && e[1] === N.me.id) return; const a = ac.get(e[1]); if (a && C.simFx.cmDrop) C.simFx.cmDrop(a, e[2] === 1 ? 'flare' : 'chaff'); return; }
      case 'od': { const o = S.objects.find((q) => q.id === e[1]); if (o && !o.dead) { o.dead = true; o.hp = 0; if (C.simFx.objectDestroyed) C.simFx.objectDestroyed(o); else C.objLook(o.id, true); } return; }
      case 'ud': { const u = S.units.find((q) => q.id === e[1]); if (u && !u.dead) { u.dead = true; if (C.simFx.unitDestroyed) C.simFx.unitDestroyed(u); } return; }
      case 'dn': {
        if (N.me && e[1] === N.me.id) { N.myCraft = false; emit('meDown'); return; }
        const a = ac.get(e[1]); if (!a || a.dead) return; a.dead = true; a.pos.copy(a.sp); C.raidFx.down(a); dropAir(a); return;
      }
      case 'hp': { if (N.me && e[1] === N.me.id) { emit('meHit', e[2], e[3]); return; } const a = ac.get(e[1]); if (a) a.hp = e[2]; return; }
      case 'ua': { const [, id, k, x, z, roof, owner, yaw] = e; if (!SAM[k] || S.units.some((u) => u.id === id)) return; const u = S.addUnit(k, x, z, { id, roof: !!roof, yaw }); u.owner = owner; C.syncUnits(); emit('units'); return; }
      case 'ur': { const u = S.units.find((q) => q.id === e[1]); if (u) { S.removeUnit(u); C.syncUnits(); emit('units'); } return; }
      case 'um': { const u = S.units.find((q) => q.id === e[1]); if (u) { S.moveUnit(u, e[2], e[3], !!e[4]); u.cov = null; C.syncUnits(); emit('units'); } return; }
      case 'kl': emit('kill', e[1], e[2], e[3]); return;
      case 'ai': if (N.me && e[1] === N.me.id) { N.myCraft = false; emit('meAI'); } return;
      case 'out': if (N.me && e[1] === N.me.id) { N.myCraft = false; emit('meOut'); } return;
    }
  }

  // ═════════════ Кадр: досчёт зеркала и отправка своего ═════════════
  N.update = (dt) => {
    if (!N.battle || !C.S) return;
    const now = performance.now() / 1000, S = C.S, kk = 1 - Math.exp(-dt * 10);
    for (const a of ac.values()) {
      const ahead = Math.min(AHEAD, now - a.st);
      const px = a.sp.x + a.sv.x * ahead, py = a.sp.y + a.sv.y * ahead, pz = a.sp.z + a.sv.z * ahead;
      a.pos.x += (px - a.pos.x) * kk; a.pos.y += (py - a.pos.y) * kk; a.pos.z += (pz - a.pos.z) * kk;
      a.yaw += wrap(a.ty - a.yaw) * kk; a.pitch += (a.tp - a.pitch) * kk; a.roll += wrap(a.tr - a.roll) * kk; a.vel.lerp(a.sv, kk);
    }
    for (const m of sams.values()) {
      const ahead = Math.min(AHEAD, now - m.st); m.pos.copy(m.sp).addScaledVector(m.dir, m.speed * ahead);
      m.t += dt; if (m.lit) m.tb += dt;
      m.trailT -= dt; if (m.lit && m.started && m.trailT <= 0) { m.trailT = m.M.L > 5 ? 0.03 : 0.04; C.fx.samTrail(m); }
    }
    for (const w of wpns.values()) {
      const ahead = Math.min(AHEAD, now - w.st); w.pos.copy(w.sp).addScaledVector(w.vel, ahead); w.t += dt;
      w.trailT -= dt; if (w.trailT <= 0) { w.trailT = 0.08; C.fx.wpnTrail(w); }
    }
    for (const u of S.units) if (u.slotT) for (const k in u.slotT) if (u.slotT[k] > 0) u.slotT[k] -= dt;
    for (const u of S.units) if (u.gunOn && u.track && !u.dead) C.simFx.gunFire(u, u.track, 0, dt); // трассы зениток — по флагу из снимка
    // свой самолёт: состояние 20 Гц, подсвет лазером
    const a = C.player;
    if (N.myCraft && a && !a.dead) {
      if ((stT -= dt) <= 0) { stT = SEND_ST; N.send({ t: 'st', s: [a.pos.x, a.pos.y, a.pos.z, a.yaw, a.pitch, a.roll, a.speed, a.thr, a.ab ? 1 : 0] }); }
      if ((laserT -= dt) <= 0) { laserT = SEND_LASER; const p = C.hooks.playerLaser ? C.hooks.playerLaser() : null; N.send({ t: 'laser', p: p ? [p.x, p.y, p.z] : null }); }
    }
    // свой комплекс под ручным управлением: ствол / метод
    const u = S.units.find((q) => q.manual && q.owner === (N.me && N.me.id) && !q.dead);
    if (u && (aimT -= dt) <= 0) { aimT = SEND_AIM; if (u.aimDir) N.send({ t: 'aim', id: u.id, d: [u.aimDir.x, u.aimDir.y, u.aimDir.z], f: u.gunFire ? 1 : 0 }); if (u.method !== lastMethod) { lastMethod = u.method; N.send({ t: 'method', id: u.id, m: u.method }); } }
  };
  N.selfCrash = () => N.send({ t: 'self' });
  N.help = () => N.send({ t: 'help' });
  N.clog = (k, d) => N.send({ t: 'clog', k, d: typeof d === 'string' ? d : JSON.stringify(d) }); // журнал боя на сервере (что видела игра)
  return N;
}
