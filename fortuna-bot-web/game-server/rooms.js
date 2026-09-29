// Комнаты онлайн-боя «Симулятора Летки»: лобби (команды, «Готов»), отсчёт, бой с возрождением, итоги.
// Люди летают у себя (клиент шлёт своё состояние SNAP_HZ раз в секунду), сервер раздаёт снимки всем,
// засчитывает попадания и сбития, ведёт счёт и время. Правила — ONLINE_PLAN.md, числа — games/drone/sim/online.js.
// Ракеты, ловушки и захваты РЛС считает сервер той же логикой боя, что одиночная игра (games/drone/sim/battle.js):
// у каждого игрока — «прокси»-аппарат, который двигается по его состояниям; клиенты только рисуют ракеты по снимкам.
/* global THREE */
import { MODES, DRONE } from '../games/drone/sim/modes.js';
import { MATCH_T, RESPAWN_T, COUNTDOWN_T, RESULTS_T, SNAP_HZ, SIZES, ONLINE_MODES, MAX_HP, GUN_DMG, F_AB,
  teamSpawn, validState, validLoadout, sunFor, packMissile, makeCode, cleanCode } from '../games/drone/sim/online.js';
import { MISSILES } from '../games/drone/missiles.js?v=20260929c';
import { makeCraft, fwdOf, irCanSee } from '../games/drone/sim/core.js?v=20260929c';
import { createBattle } from '../games/drone/sim/battle.js?v=20260929c';

const WEATHER_KEYS = ['day', 'morning', 'evening', 'sunset', 'overcast', 'rain'];
const GUN_RANGE = 2200;       // дальше этого попадание пушки не засчитываем (пуля живёт 1,6 с)
const HITS_PER_S = 25;        // больше заявок на попадание в секунду пушка физически не даёт (20 выстр/с)
const GUN_AIM = Math.cos(25 * Math.PI / 180); // стрелок должен смотреть на цель (с упреждением и доводкой пуль в Аркаде — до 25°)
const SUBSTEPS = 2;           // ракеты считаем с шагом 1/(SNAP_HZ·SUBSTEPS) = 25 мс
const EXTRAP_MAX = 0.3;       // прокси игрока между его состояниями летит по прямой не дольше этого, с
const LAUNCH_CD = 0.4;        // перезарядка пусков (у клиента 0,45 с)
const IR_SLACK = 5;           // запас по углу для ИК-ГСН на сервере (позиции у клиента и сервера расходятся на задержку сети), °
const clock = () => performance.now() / 1000;
const r1 = (v) => Math.round(v * 10) / 10;
const AX = new THREE.Vector3();

export function createRooms({ log = () => {}, auth, matchT = MATCH_T }) {
  const rooms = new Map();     // код → комната
  const clients = new Set();
  let nextId = 1;

  const send = (c, msg) => { try { if (c.ws.readyState === 1) c.ws.send(JSON.stringify(msg)); } catch (_) { /* сокет закрылся */ } };
  const broadcast = (r, msg) => { const s = JSON.stringify(msg); for (const p of r.players.values()) try { if (p.ws.readyState === 1) p.ws.send(s); } catch (_) { /* закрылся */ } };
  const teamCount = (r, team) => { let n = 0; for (const p of r.players.values()) if (p.team === team) n++; return n; };
  const roomView = (r) => ({
    t: 'room', code: r.code, mode: r.mode, size: r.size, host: r.host, state: r.state,
    left: r.state === 'play' ? Math.max(0, Math.round(matchT - r.t)) : null, score: r.score,
    players: [...r.players.values()].map((p) => ({ id: p.id, name: p.name, team: p.team, ready: p.ready, k: p.k, d: p.d })),
  });
  const pushRoom = (r) => broadcast(r, roomView(r));

  function leave(c) {
    const r = c.room; if (!r) return;
    r.players.delete(c.id); c.room = null;
    dropCraft(r, c);
    if (!r.players.size) { rooms.delete(r.code); log(`комната ${r.code} закрыта`); return; }
    if (r.host === c.id) r.host = r.players.keys().next().value;
    if (r.state !== 'lobby') broadcast(r, { t: 'gone', id: c.id });
    pushRoom(r);
  }
  function join(c, r) {
    if (c.room) leave(c);
    const team = teamCount(r, 0) <= teamCount(r, 1) ? 0 : 1;
    Object.assign(c, { room: r, team, ready: false, k: 0, d: 0, hp: MAX_HP, alive: false, st: null, craft: null });
    r.players.set(c.id, c);
    pushRoom(r);
  }
  function createRoom(c, mode, size) {
    let code; do code = makeCode(); while (rooms.has(code));
    const r = { code, mode, size, host: c.id, state: 'lobby', players: new Map(), t: 0, cd: 0, endT: 0, score: [0, 0], seed: 0, weather: 'day',
      battle: null, sides: [[], []], mid: 1, sunDir: new THREE.Vector3(), sunVis: false };
    rooms.set(code, r); log(`комната ${code}: ${MODES[mode].name} ${size}×${size}, создал ${c.name}`);
    join(c, r);
  }
  // старт — только когда все в лобби нажали «Готов» и в обеих командах есть игроки
  function maybeStart(r) {
    if (r.state !== 'lobby') return;
    const ps = [...r.players.values()];
    if (ps.length < 2 || !ps.every((p) => p.ready) || !teamCount(r, 0) || !teamCount(r, 1)) return;
    r.state = 'countdown'; r.cd = COUNTDOWN_T; r.t = 0; r.score = [0, 0];
    r.seed = (Math.random() * 2147483646 + 1) >>> 0; r.weather = WEATHER_KEYS[(Math.random() * WEATHER_KEYS.length) | 0];
    r.sunVis = sunFor(r.weather, r.sunDir);
    r.battle = roomBattle(r); r.sides = [[], []]; r.mid = 1;
    const slots = [0, 0], spawns = {};
    for (const p of ps) {
      const s = teamSpawn(p.team, slots[p.team]++);
      Object.assign(p, { hp: MAX_HP, alive: true, k: 0, d: 0, st: null, hitT: 0, hitN: 0, spawn: s });
      newCraft(r, p, s);
      spawns[p.id] = [s.x, s.y, s.z, s.yaw];
    }
    broadcast(r, { t: 'start', seed: r.seed, weather: r.weather, mode: r.mode, cd: COUNTDOWN_T, len: matchT, spawns });
    pushRoom(r);
    log(`комната ${r.code}: бой ${ps.map((p) => p.name + '/' + p.team).join(', ')}`);
  }
  function damage(r, victim, amount, killer, by) {
    if (!victim.alive || r.state !== 'play') return;
    victim.hp = Math.max(0, victim.hp - amount);
    broadcast(r, { t: 'hp', id: victim.id, hp: Math.round(victim.hp * 10) / 10, by: killer ? killer.id : null });
    if (victim.hp > 0) return;
    victim.alive = false; victim.respawnAt = r.t + RESPAWN_T; victim.d++;
    if (victim.craft) { victim.craft.dead = true; victim.craft.radar.lock = null; }
    if (killer && killer.team !== victim.team) { killer.k++; r.score[killer.team]++; }
    else r.score[1 - victim.team]++; // разбился сам — очко противнику
    broadcast(r, { t: 'kill', victim: victim.id, killer: killer ? killer.id : null, by, score: r.score });
  }

  // ═════════════ Бой комнаты: ракеты, ловушки, РЛС (games/drone/sim/battle.js) ═════════════
  const sendTo = (r, id, msg) => { const p = r.players.get(id); if (p) send(p, msg); };
  function roomBattle(r) {
    return createBattle({
      mode: () => MODES[r.mode],
      opponents: (o) => r.sides[1 - o.team],
      targetable: (t) => r.state === 'play' && !t.dead,
      canAct: () => r.state === 'play',
      // урон ракетой по игроку (уже × dmgTaken режима); сбитие — хозяину ракеты
      hurt: (t, amount, by, msl) => {
        const v = r.players.get(t.cid); if (!v || v.craft !== t) return;
        damage(r, v, amount, msl ? r.players.get(msl.owner.cid) || null : null, by || 'РАКЕТА');
      },
      sunDir: r.sunDir, sunVis: () => r.sunVis,
      bullets: 1, // пушку считает не battle (заявки hit), пули серверу не нужны
      fx: {
        launched(m, slot) {
          m.id = r.mid++;
          broadcast(r, { t: 'ml', id: m.id, key: m.key, owner: m.owner.cid, target: m.target ? m.target.cid : 0, slot: slot ? slot.i : -1,
            p: [r1(m.pos.x), r1(m.pos.y), r1(m.pos.z)] });
        },
        missileResult(m, hit) { broadcast(r, { t: 'mx', id: m.id, hit: hit ? 1 : 0, p: [r1(m.pos.x), r1(m.pos.y), r1(m.pos.z)] }); },
        cmDrop(o, type) { const s = JSON.stringify({ t: 'cm', id: o.cid, type }); for (const p of r.players.values()) if (p.id !== o.cid) try { if (p.ws.readyState === 1) p.ws.send(s); } catch (_) { /* закрылся */ } },
        lockBroken(o) { sendTo(r, o.cid, { t: 'lockx', why: 'chaff' }); },
        radarLost(o) { sendTo(r, o.cid, { t: 'lockx', why: 'lost' }); },
      },
    });
  }
  // прокси-аппарат игрока на одну жизнь (после сбития — новый: старые ракеты не наводятся на возродившегося)
  function newCraft(r, p, s) {
    dropCraft(r, p);
    const M = MODES[r.mode];
    const o = makeCraft({ human: true, cid: p.id, team: p.team, ...DRONE, flares: M.cm, chaff: M.cm, load: null, mslT: -9, stT: clock(), base: new THREE.Vector3(),
      radar: { contacts: new Map(), lock: null, lostT: 0, scanT: 0, t: 0 } });
    o.rcs = () => 1 + 0.15 * (o.load ? o.load.filter(Boolean).length : 4); // как у игрока в main.js; до сообщения load — типовые 4 ракеты
    o.pos.set(s.x, s.y, s.z); o.base.copy(o.pos); o.yaw = s.yaw; o.speed = 240; fwdOf(o, o.vel).multiplyScalar(o.speed);
    p.craft = o; r.sides[p.team].push(o);
  }
  function dropCraft(r, p) {
    const o = p.craft; if (!o) return;
    o.dead = true; o.radar.lock = null;
    const side = r.sides[o.team], i = side.indexOf(o); if (i >= 0) side.splice(i, 1);
    p.craft = null;
  }
  function placeCraft(o, s) {
    o.base.set(s[0], s[1], s[2]); o.pos.copy(o.base); o.yaw = s[3]; o.pitch = s[4]; o.roll = s[5]; o.speed = s[6]; o.thr = s[7]; o.ab = !!(s[8] & F_AB);
    fwdOf(o, o.vel).multiplyScalar(o.speed); o.stT = clock();
  }
  function stepBattle(r, dt) {
    const B = r.battle; if (!B) return;
    const h = dt / SUBSTEPS, t0 = clock() - dt;
    for (let k = 1; k <= SUBSTEPS; k++) {
      for (const side of r.sides) for (const o of side) {
        if (o.dead) continue;
        o.pos.copy(o.base).addScaledVector(o.vel, Math.min(EXTRAP_MAX, Math.max(0, t0 + h * k - o.stT)));
        B.updateRadar(o, h);
      }
      for (let i = B.missiles.length - 1; i >= 0; i--) { const m = B.missiles[i]; if (!m.dead) B.updateMissile(m, h); if (m.dead) B.missiles.splice(i, 1); }
      B.updateCMs(h);
    }
  }
  const lockOf = (p) => (p.craft && p.craft.radar.lock ? p.craft.radar.lock.cid : 0);

  const handlers = {
    async hello(c, m) {
      const who = await auth(m);
      if (!who) { send(c, { t: 'err', msg: 'Не удалось подтвердить аккаунт — перезайдите на сайт' }); c.ws.close(); return; }
      c.name = who.name; c.pid = who.pid; c.authed = true;
      send(c, { t: 'welcome', id: c.id, name: c.name });
    },
    create(c, m) {
      if (!ONLINE_MODES.includes(m.mode) || !SIZES.includes(m.size)) return;
      createRoom(c, m.mode, m.size);
    },
    join(c, m) {
      const r = rooms.get(cleanCode(m.code));
      if (!r) return send(c, { t: 'err', msg: 'Комнаты с таким кодом нет' });
      if (r.state !== 'lobby') return send(c, { t: 'err', msg: 'В этой комнате уже идёт бой — дождитесь конца' });
      if (r.players.size >= r.size * 2) return send(c, { t: 'err', msg: 'Комната заполнена' });
      join(c, r);
    },
    leave(c) { leave(c); },
    team(c, m) {
      const r = c.room; if (!r || r.state !== 'lobby' || (m.team !== 0 && m.team !== 1) || m.team === c.team) return;
      if (teamCount(r, m.team) >= r.size) return send(c, { t: 'err', msg: 'В этой команде нет мест' });
      c.team = m.team; c.ready = false; pushRoom(r);
    },
    ready(c, m) {
      const r = c.room; if (!r || r.state !== 'lobby') return;
      c.ready = !!m.on; pushRoom(r); maybeStart(r);
    },
    st(c, m) {
      const r = c.room; if (!r || (r.state !== 'play' && r.state !== 'countdown') || !c.alive || !validState(m.s)) return;
      c.st = m.s;
      if (c.craft && !c.craft.dead) placeCraft(c.craft, m.s);
    },
    load(c, m) { // подвеска на эту жизнь — один раз после старта/возрождения (иначе ракеты можно было бы «перезаряжать»)
      if (!c.room || !c.craft || c.craft.load || !validLoadout(m.l)) return;
      c.craft.load = m.l.slice();
    },
    lock(c, m) { // захват РЛС игрока (или сброс: target 0); дальше его ведёт сервер той же логикой РЛС
      const r = c.room; if (!r || r.state !== 'play' || !c.alive || !c.craft) return;
      const radar = c.craft.radar;
      if (!m.target) { radar.lock = null; return; }
      const v = r.players.get(m.target);
      if (!v || !v.alive || !v.craft || v.team === c.team) return send(c, { t: 'lockx', why: 'lost' });
      radar.lock = v.craft; radar.lostT = 0;
    },
    launch(c, m) { // пуск ракеты: сервер проверяет подвеску, перезарядку и захват, потом ракету ведёт сам
      const r = c.room; if (!r || r.state !== 'play' || !c.alive || !c.craft || !r.battle) return;
      const o = c.craft, key = m.key, slot = m.slot | 0, M_ = typeof key === 'string' && Object.prototype.hasOwnProperty.call(MISSILES, key) ? MISSILES[key] : null;
      const deny = (msg) => send(c, { t: 'deny', msg, slot });
      if (!M_ || !o.load || o.load[slot] !== key) return deny('РАКЕТЫ НЕТ НА ПОДВЕСКЕ');
      const now = clock(); if (now - o.mslT < LAUNCH_CD) return deny('');
      if (validState(m.s)) { c.st = m.s; placeCraft(o, m.s); } // точка пуска — где игрок был в момент нажатия
      const v = m.target ? r.players.get(m.target) : null, t = v && v.alive && v.craft && v.team !== c.team ? v.craft : null;
      if (m.target && !t) return deny('ЦЕЛЬ ПОТЕРЯНА');
      if (M_.kind === 'ir') {
        if (t && !irCanSee(M_, t, o.pos, fwdOf(o, AX), Math.max(M_.ir.fov, M_.ir.slaved) + IR_SLACK)) return deny('НЕТ ЗАХВАТА ГСН');
        if (!t && !M_.ir.loal) return deny('НЕТ ЗАХВАТА ГСН');
      } else if (M_.kind === 'sarh') {
        if (!t || o.radar.lock !== t) return deny('НУЖЕН ЗАХВАТ РЛС');
      } else if (!t || !(o.radar.lock === t || o.radar.contacts.has(t) || r.battle.radarSees(o, t) === true)) return deny('НЕТ ЦЕЛИ НА РАДАРЕ');
      o.load[slot] = null; o.mslT = now;
      r.battle.launchMissile(o, key, t, { i: slot });
    },
    cm(c, m) { // ЛТЦ / диполи: увод ракет и срыв захватов решает сервер, остальным — событие для картинки
      const r = c.room; if (!r || r.state !== 'play' || !c.alive || !c.craft || !r.battle || (m.type !== 'flare' && m.type !== 'chaff')) return;
      r.battle.dropCM(c.craft, m.type);
    },
    hit(c, m) { // попадание пушки: заявляет стрелок, сервер проверяет дальность, команду и темп стрельбы
      const r = c.room; if (!r || r.state !== 'play' || !c.alive || !c.st) return;
      const v = r.players.get(m.target); if (!v || !v.alive || !v.st || v.team === c.team) return;
      const now = r.t; if (now - c.hitT >= 1) { c.hitT = now; c.hitN = 0; }
      if (++c.hitN > HITS_PER_S) return;
      const dx = v.st[0] - c.st[0], dy = v.st[1] - c.st[1], dz = v.st[2] - c.st[2], d = Math.hypot(dx, dy, dz);
      if (d > GUN_RANGE) return;
      const yaw = c.st[3], cp = Math.cos(c.st[4]); // нос стрелка (как fwdOf в sim/core.js)
      if ((-Math.sin(yaw) * cp * dx + Math.sin(c.st[4]) * dy - Math.cos(yaw) * cp * dz) / (d || 1) < GUN_AIM) return;
      damage(r, v, GUN_DMG * MODES[r.mode].dmgTaken, c, 'ПУШКА');
    },
    self(c, m) { // удар о землю или здание — клиент сообщает о себе сам
      const r = c.room; if (!r || r.state !== 'play' || !c.alive) return;
      const dmg = Math.min(MAX_HP, Math.max(0, +m.dmg || 0)); if (dmg) damage(r, c, dmg, null, 'ЗЕМЛЯ');
    },
  };

  function tick(dt) {
    for (const r of rooms.values()) {
      if (r.state === 'countdown') { r.cd -= dt; if (r.cd <= 0) { r.state = 'play'; r.t = 0; pushRoom(r); } }
      else if (r.state === 'play') {
        r.t += dt;
        for (const p of r.players.values()) if (!p.alive && p.respawnAt <= r.t) {
          const s = teamSpawn(p.team, (Math.random() * 4) | 0);
          p.alive = true; p.hp = MAX_HP; p.st = null;
          newCraft(r, p, s);
          broadcast(r, { t: 'spawn', id: p.id, s: [s.x, s.y, s.z, s.yaw] });
        }
        stepBattle(r, dt);
        const P = [], M = [];
        for (const p of r.players.values()) if (p.st) P.push([p.id, p.alive ? 1 : 0, Math.round(p.hp), ...p.st, lockOf(p)]);
        for (const m of r.battle.missiles) if (!m.dead) M.push(packMissile(m, m.target ? m.target.cid : 0));
        broadcast(r, { t: 'snap', T: Math.round(r.t * 1000) / 1000, P, M });
        if (r.t >= matchT) {
          r.state = 'end'; r.endT = RESULTS_T; r.battle = null;
          for (const p of r.players.values()) p.craft = null;
          r.sides = [[], []];
          const players = [...r.players.values()].map((p) => ({ id: p.id, name: p.name, team: p.team, k: p.k, d: p.d }));
          broadcast(r, { t: 'end', score: r.score, players });
          pushRoom(r);
          log(`комната ${r.code}: итог ${r.score.join(':')}`);
        }
      } else if (r.state === 'end') {
        r.endT -= dt;
        if (r.endT <= 0) { r.state = 'lobby'; for (const p of r.players.values()) { p.ready = false; p.alive = false; p.st = null; } pushRoom(r); }
      }
    }
  }
  setInterval(() => tick(1 / SNAP_HZ), 1000 / SNAP_HZ);

  return {
    connect(ws) {
      const c = { id: nextId++, ws, name: '?', room: null, authed: false };
      clients.add(c);
      ws.onmessage = async (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch (_) { return; }
        if (!m || typeof m.t !== 'string' || !handlers[m.t]) return;
        if (!c.authed && m.t !== 'hello') return;
        try { await handlers[m.t](c, m); } catch (e) { log('ошибка в ' + m.t + ': ' + (e && e.stack || e)); }
      };
      ws.onclose = () => { leave(c); clients.delete(c); };
      ws.onerror = () => {};
    },
    stats() { return { online: clients.size, rooms: rooms.size }; },
  };
}
