// Комнаты онлайн-боя «Симулятора Летки»: лобби (команды, «Готов», боты), быстрый поиск, отсчёт, бой с возрождением, итоги.
// Люди летают у себя (клиент шлёт своё состояние SNAP_HZ раз в секунду), сервер раздаёт снимки всем,
// засчитывает попадания и сбития, ведёт счёт и время. Правила — ONLINE_PLAN.md, числа — games/drone/sim/online.js.
// Ракеты, ловушки и захваты РЛС считает сервер той же логикой боя, что одиночная игра (games/drone/sim/battle.js):
// у каждого игрока — «прокси»-аппарат, который двигается по его состояниям; клиенты только рисуют ракеты по снимкам.
// Боты — аппараты ИИ из той же battle.js на «Изделии». Игрок пропал (обрыв связи или > 1 с без состояний — свернул
// Telegram) — его самолёт ведёт ИИ, пока он не вернётся (обрыв — до 60 с, потом место освобождается).
//
// Запись участника (p) — одна на место в комнате: у человека ws (null — связь оборвалась), у бота bot = true.
// p.ai — самолётом сейчас управляет ИИ сервера (бот или человек без связи).
/* global THREE */
import { MODES, DRONE } from '../games/drone/sim/modes.js';
import { MATCH_T, RESPAWN_T, COUNTDOWN_T, RESULTS_T, SNAP_HZ, SIZES, ONLINE_MODES, MAX_HP, GUN_DMG, F_AB,
  teamSpawn, packState, validState, validLoadout, sunFor, packMissile, makeCode, cleanCode } from '../games/drone/sim/online.js';
import { MISSILES } from '../games/drone/missiles.js?v=20260929d';
import { makeCraft, fwdOf, irCanSee } from '../games/drone/sim/core.js?v=20260929d';
import { createBattle, RADAR } from '../games/drone/sim/battle.js?v=20260929d';

const WEATHER_KEYS = ['day', 'morning', 'evening', 'sunset', 'overcast', 'rain'];
const GUN_RANGE = 2200;       // дальше этого попадание пушки не засчитываем (пуля живёт 1,6 с)
const HITS_PER_S = 25;        // больше заявок на попадание в секунду пушка физически не даёт (20 выстр/с)
const GUN_AIM = Math.cos(25 * Math.PI / 180); // стрелок должен смотреть на цель (с упреждением и доводкой пуль в Аркаде — до 25°)
const SUBSTEPS = 2;           // ракеты и ИИ считаем с шагом 1/(SNAP_HZ·SUBSTEPS) = 25 мс
const EXTRAP_MAX = 0.3;       // прокси игрока между его состояниями летит по прямой не дольше этого, с
const LAUNCH_CD = 0.4;        // перезарядка пусков (у клиента 0,45 с)
const IR_SLACK = 5;           // запас по углу для ИК-ГСН на сервере (позиции у клиента и сервера расходятся на задержку сети), °
const AFK_T = 1;              // нет состояний дольше — самолёт берёт ИИ (свёрнутая вкладка не рвёт связь, но молчит)
const RESUME_T = 60;          // оборвалась связь — ждём игрока столько, потом место освобождается
const FOUND_T = 15;           // быстрый поиск: время на «Подтвердить»
const QUICK_WAIT = 8;         // быстрый поиск: ждём ещё игроков столько после второго в очереди (8 и больше — сразу)
const BOT_SKILL = 0.75;       // «умение» ботов (× aiSkill режима)
const RETARGET_T = 3;         // ИИ онлайна перепроверяет ближайшую цель раз в столько секунд
const MSG_MAX = 4096;          // длиннее — не наше сообщение, не разбираем
const MSG_RATE = 120;          // сообщений в секунду с одной связи (st 20 + hit 25 + прочее); лишние выбрасываем,
const MSG_KILL = 600;          // а столько за секунду — закрываем связь
const ROOMS_MAX = 300;
const BOT_NAMES = ['Слизень', 'Раковина', 'Рожок', 'Панцирь', 'Тихоход', 'Слизун', 'Усик', 'Ракушка'];
const BOT_LOADOUTS = [
  ['aim9l', 'aim120c', null, null, null, null, 'aim120c', 'aim9l'],
  ['r73', 'r77', null, null, null, null, 'r77', 'r73'],
  ['python5', 'derby', null, null, null, null, 'derby', 'python5'],
  ['aim9x', 'mica_em', null, null, null, null, 'mica_em', 'aim9x'],
  [null, 'r73', 'r27er', null, null, 'r27er', 'r73', null],
];
if (!BOT_LOADOUTS.every(validLoadout)) throw new Error('BOT_LOADOUTS: подвеска не проходит validLoadout');
const DEF_LOAD = BOT_LOADOUTS[0];
const clock = () => performance.now() / 1000;
const r1 = (v) => Math.round(v * 10) / 10;
const AX = new THREE.Vector3();
// «Изделие» для ИИ (поля как у AC в battle.js): перегрузка и угловая скорость — из режима, как у игрока
function botSpec(mode) {
  const M = MODES[mode];
  return { name: 'Изделие', code: 'ИЗ', hp: MAX_HP, rcs: 1.6, ir: DRONE.ir, gmax: M.gmax, wCap: M.wCap, milAcc: DRONE.milAcc, abAcc: DRONE.abAcc,
    cd0: DRONE.cd0, skill: BOT_SKILL, radarR: RADAR.range, r: DRONE.r, pts: 0, cm: M.cm };
}

export function createRooms({ log = () => {}, auth, matchT = MATCH_T }) {
  const rooms = new Map();     // код → комната
  const clients = new Set();   // подключённые участники (записи людей с живым сокетом)
  const queues = { arcade: [], real: [] }; // быстрый поиск: [{ c, t }] по режимам
  let nextId = 1, qSent = '';

  const send = (c, msg) => { try { if (c.ws && c.ws.readyState === 1) c.ws.send(JSON.stringify(msg)); } catch (_) { /* сокет закрылся */ } };
  const broadcast = (r, msg, except = 0) => {
    const s = JSON.stringify(msg);
    for (const p of r.players.values()) if (p.ws && p.id !== except) try { if (p.ws.readyState === 1) p.ws.send(s); } catch (_) { /* закрылся */ }
  };
  const teamCount = (r, team) => { let n = 0; for (const p of r.players.values()) if (p.team === team) n++; return n; };
  const humans = (r) => [...r.players.values()].filter((p) => !p.bot);
  const roomView = (r) => ({
    t: 'room', code: r.code, mode: r.mode, size: r.size, host: r.host, state: r.state, quick: !!r.quick,
    left: r.state === 'play' ? Math.max(0, Math.round(matchT - r.t)) : null, score: r.score,
    players: [...r.players.values()].map((p) => ({ id: p.id, name: p.name, team: p.team, ready: p.ready, k: p.k, d: p.d,
      bot: p.bot ? 1 : 0, away: !p.bot && !p.ws ? 1 : 0, ai: p.ai && !p.bot ? 1 : 0 })),
  });
  const pushRoom = (r) => broadcast(r, roomView(r));

  // ═════════════ Участники комнаты ═════════════
  function reset(p, r, team) {
    Object.assign(p, { room: r, team, ready: !!p.bot, k: 0, d: 0, hp: MAX_HP, alive: false, st: null, craft: null, ai: !!p.bot,
      hitT: 0, hitN: 0, lastSt: 0, youN: 0, awayT: 0 });
  }
  function leave(c) {
    const r = c.room; if (!r) return;
    r.players.delete(c.id); c.room = null;
    dropCraft(r, c);
    if (!humans(r).length) { rooms.delete(r.code); log(`комната ${r.code} закрыта`); return; }
    if (r.host === c.id) r.host = humans(r).find((p) => p.ws) ? humans(r).find((p) => p.ws).id : humans(r)[0].id;
    if (r.state !== 'lobby') broadcast(r, { t: 'gone', id: c.id });
    pushRoom(r);
  }
  // свободное место в команде (лобби или идущий бой): нет места — занимаем место бота команды, где людей меньше
  function seatFor(r, prefer) {
    const order = prefer === 0 || prefer === 1 ? [prefer, 1 - prefer] : teamCount(r, 0) <= teamCount(r, 1) ? [0, 1] : [1, 0];
    for (const t of order) if (teamCount(r, t) < r.size) return { team: t };
    const humansIn = (t) => humans(r).filter((p) => p.team === t).length;
    for (const t of [0, 1].sort((a, b) => humansIn(a) - humansIn(b))) {
      const bot = [...r.players.values()].find((p) => p.bot && p.team === t);
      if (bot) return { team: t, bot };
    }
    return null;
  }
  function join(c, r, prefer) {
    if (c.room) leave(c);
    unqueue(c);
    const seat = seatFor(r, prefer); if (!seat) return false;
    if (seat.bot) leave(seat.bot);
    reset(c, r, seat.team);
    r.players.set(c.id, c);
    if (r.state === 'countdown' || r.state === 'play') { // вход в идущий бой
      const s = teamSpawn(c.team, (Math.random() * 4) | 0);
      Object.assign(c, { alive: true, spawn: s });
      newCraft(r, c, s);
      pushRoom(r);
      sendStart(r, c, { t: r.t, score: r.score });
    } else pushRoom(r);
    return true;
  }
  function addBot(r, team) {
    const used = new Set([...r.players.values()].map((p) => p.name));
    const name = 'Бот ' + (BOT_NAMES.find((n) => !used.has('Бот ' + n)) || r.players.size);
    const b = { id: nextId++, name, pid: '', bot: true, ws: null };
    reset(b, r, team);
    r.players.set(b.id, b);
    return b;
  }
  function createRoom(c, mode, size) {
    let code; do code = makeCode(); while (rooms.has(code));
    const r = { code, mode, size, host: c.id, state: 'lobby', players: new Map(), t: 0, cd: 0, endT: 0, score: [0, 0], seed: 0, weather: 'day',
      battle: null, sides: [[], []], mid: 1, sunDir: new THREE.Vector3(), sunVis: false, S: botSpec(mode) };
    rooms.set(code, r); log(`комната ${code}: ${MODES[mode].name} ${size}×${size}, создал ${c.name}`);
    join(c, r);
    return r;
  }
  // старт — когда все люди в лобби нажали «Готов» и в каждой команде кто-то есть (человек или бот)
  function maybeStart(r) {
    if (r.state !== 'lobby') return;
    const ps = [...r.players.values()], hs = ps.filter((p) => !p.bot);
    if (!hs.length || !hs.every((p) => p.ready && p.ws) || !teamCount(r, 0) || !teamCount(r, 1)) return;
    r.state = 'countdown'; r.cd = COUNTDOWN_T; r.t = 0; r.score = [0, 0];
    r.seed = (Math.random() * 2147483646 + 1) >>> 0; r.weather = WEATHER_KEYS[(Math.random() * WEATHER_KEYS.length) | 0];
    r.sunVis = sunFor(r.weather, r.sunDir);
    r.battle = roomBattle(r); r.sides = [[], []]; r.mid = 1;
    const slots = [0, 0];
    for (const p of ps) {
      const s = teamSpawn(p.team, slots[p.team]++);
      Object.assign(p, { hp: MAX_HP, alive: true, k: 0, d: 0, st: null, hitT: 0, hitN: 0, spawn: s, ai: !!p.bot });
      newCraft(r, p, s);
    }
    for (const p of hs) sendStart(r, p, null);
    pushRoom(r);
    log(`комната ${r.code}: бой ${ps.map((p) => p.name + '/' + p.team).join(', ')}`);
  }
  // start: всем в начале боя; вошедшему в идущий бой или вернувшемуся — с resume (время, счёт, свой самолёт)
  function sendStart(r, p, resume) {
    const spawns = {};
    for (const q of r.players.values()) {
      if (q.st) spawns[q.id] = [q.st[0], q.st[1], q.st[2], q.st[3]];
      else if (q.spawn) spawns[q.id] = [q.spawn.x, q.spawn.y, q.spawn.z, q.spawn.yaw];
    }
    send(p, { t: 'start', seed: r.seed, weather: r.weather, mode: r.mode, cd: r.state === 'countdown' ? Math.max(0, r.cd) : resume ? 0 : COUNTDOWN_T,
      len: matchT, spawns, resume });
  }
  function damage(r, victim, amount, killer, by) {
    if (!victim.alive || r.state !== 'play') return;
    victim.hp = Math.max(0, victim.hp - amount);
    broadcast(r, { t: 'hp', id: victim.id, hp: Math.round(victim.hp * 10) / 10, by: killer ? killer.id : null });
    if (victim.hp > 0) return;
    victim.alive = false; victim.respawnAt = r.t + RESPAWN_T; victim.d++;
    if (victim.craft) { victim.craft.dead = true; if (victim.craft.radar) victim.craft.radar.lock = null; }
    if (killer && killer.team !== victim.team) { killer.k++; r.score[killer.team]++; }
    else r.score[1 - victim.team]++; // разбился сам — очко противнику
    broadcast(r, { t: 'kill', victim: victim.id, killer: killer ? killer.id : null, by, score: r.score });
  }

  // ═════════════ Бой комнаты: ракеты, ловушки, РЛС, ИИ (games/drone/sim/battle.js) ═════════════
  const sendTo = (r, id, msg) => { const p = r.players.get(id); if (p) send(p, msg); };
  const ownerOf = (r, o) => (o ? r.players.get(o.cid) || null : null);
  function roomBattle(r) {
    return createBattle({
      mode: () => MODES[r.mode],
      opponents: (o) => r.sides[1 - o.team],
      targetable: (t) => r.state === 'play' && !t.dead,
      canAct: () => r.state === 'play',
      // урон (уже × dmgTaken режима) по человеку или боту; сбитие — стрелку пушки или хозяину ракеты
      hurt: (t, amount, by, msl, src) => {
        const v = r.players.get(t.cid); if (!v || v.craft !== t) return;
        damage(r, v, amount, ownerOf(r, src) || ownerOf(r, msl && msl.owner), by || 'РАКЕТА');
      },
      retarget: RETARGET_T,
      sunDir: r.sunDir, sunVis: () => r.sunVis,
      bullets: 60, // пули ИИ (заявки пушки людей — сообщением hit)
      fx: {
        launched(m, slot) {
          m.id = r.mid++;
          broadcast(r, { t: 'ml', id: m.id, key: m.key, owner: m.owner.cid, target: m.target ? m.target.cid : 0, slot: slot && slot.i !== undefined ? slot.i : -1,
            p: [r1(m.pos.x), r1(m.pos.y), r1(m.pos.z)] });
        },
        missileResult(m, hit) { broadcast(r, { t: 'mx', id: m.id, hit: hit ? 1 : 0, p: [r1(m.pos.x), r1(m.pos.y), r1(m.pos.z)] }); },
        cmDrop(o, type) { broadcast(r, { t: 'cm', id: o.cid, type }, o.cid); },
        aiCM(o, type) { broadcast(r, { t: 'cm', id: o.cid, type }); },
        lockBroken(o) { sendTo(r, o.cid, { t: 'lockx', why: 'chaff' }); },
        radarLost(o) { sendTo(r, o.cid, { t: 'lockx', why: 'lost' }); },
        shot(b) { b.owner.fireT = clock(); }, // у ИИ в снимке горит «стреляет» — клиенты рисуют трассеры
        killed(e, by) { const v = r.players.get(e.cid); if (v && v.craft === e && v.alive) damage(r, v, v.hp, null, by); }, // ИИ врезался в землю
      },
    });
  }
  // аппарат на одну жизнь (после сбития — новый: старые ракеты не наводятся на возродившегося).
  // Человек — прокси по его состояниям; бот или человек без связи — ИИ.
  function newCraft(r, p, s) {
    dropCraft(r, p);
    const pos = new THREE.Vector3(s.x, s.y, s.z);
    let o;
    if (p.bot || !p.ws) {
      p.ai = true;
      o = r.battle.spawnCraft('drone', r.S, p.bot ? BOT_LOADOUTS[(Math.random() * BOT_LOADOUTS.length) | 0] : p.load || DEF_LOAD, pos, s.yaw, null, null, p.team);
      Object.assign(o, { mp: true, cid: p.id, thr: 1, fireT: -9, radar: null });
      o.speed = 240; fwdOf(o, o.vel).multiplyScalar(o.speed);
    } else {
      p.ai = false; p.lastSt = clock();
      const M = MODES[r.mode];
      o = makeCraft({ human: true, cid: p.id, team: p.team, ...DRONE, flares: M.cm, chaff: M.cm, load: null, mslT: -9, stT: clock(), base: new THREE.Vector3(),
        radar: { contacts: new Map(), lock: null, lostT: 0, scanT: 0, t: 0 } });
      o.pos.copy(pos); o.base.copy(pos); o.yaw = s.yaw; o.speed = 240; fwdOf(o, o.vel).multiplyScalar(o.speed);
    }
    o.rcs = () => 1 + 0.15 * (o.human ? (o.load || DEF_LOAD) : o.msl.map((x) => x && x.key)).filter(Boolean).length; // как у игрока в main.js
    p.craft = o; r.sides[p.team].push(o);
    if (p.ai) p.st = packState(o, false);
  }
  function dropCraft(r, p) {
    const o = p.craft; if (!o) return;
    o.dead = true; if (o.radar) o.radar.lock = null;
    const side = r.sides[o.team], i = side ? side.indexOf(o) : -1; if (i >= 0) side.splice(i, 1);
    p.craft = null;
  }
  function placeCraft(o, s) {
    o.base.set(s[0], s[1], s[2]); o.pos.copy(o.base); o.yaw = s[3]; o.pitch = s[4]; o.roll = s[5]; o.speed = s[6]; o.thr = s[7]; o.ab = !!(s[8] & F_AB);
    fwdOf(o, o.vel).multiplyScalar(o.speed); o.stT = clock();
  }
  // самолёт человека берёт ИИ (тот же объект — ракеты, летящие в него, продолжают наводиться)
  function toAI(r, p) {
    p.ai = true;
    const o = p.craft; if (!o || o.dead || !o.human) return;
    Object.assign(o, r.battle.aiFields('drone', r.S, o.load || DEF_LOAD, o.team), { human: false, mp: true, cmFlare: o.flares, cmChaff: o.chaff, thr: 1, fireT: -9 });
    o.radar.lock = null; o.tgt = r.battle.pickTarget(o);
    log(`комната ${r.code}: самолёт ${p.name} ведёт ИИ`);
    pushRoom(r);
  }
  // и обратно человеку: подвеска и ловушки — сколько осталось у ИИ
  function toHuman(r, p) {
    p.ai = false; p.lastSt = clock();
    const o = p.craft; if (!o || o.dead || o.human) return;
    Object.assign(o, { human: true, mp: false, load: o.msl.map((x) => (x ? x.key : null)), flares: o.cmFlare, chaff: o.cmChaff, stt: false, tgt: null,
      mslT: -9, base: (o.base || new THREE.Vector3()).copy(o.pos), stT: clock(), radar: { contacts: new Map(), lock: null, lostT: 0, scanT: 0, t: 0 } });
    pushRoom(r);
  }
  // «вот ваш самолёт сейчас» — вернувшемуся после ИИ; он ставит самолёт и отвечает back {n}
  function youOf(p) {
    const o = p.craft;
    if (!p.alive || !o) return { n: ++p.youN, dead: 1 };
    return { n: ++p.youN, s: packState(o, false), hp: Math.round(p.hp * 10) / 10,
      load: o.human ? o.load : o.msl.map((x) => (x ? x.key : null)), flares: o.human ? o.flares : o.cmFlare, chaff: o.human ? o.chaff : o.cmChaff };
  }
  function stepBattle(r, dt) {
    const B = r.battle; if (!B) return;
    const h = dt / SUBSTEPS, t0 = clock() - dt;
    for (let k = 1; k <= SUBSTEPS; k++) {
      for (const side of r.sides) for (const o of side.slice()) {
        if (o.dead) continue;
        if (o.human) {
          o.pos.copy(o.base).addScaledVector(o.vel, Math.min(EXTRAP_MAX, Math.max(0, t0 + h * k - o.stT)));
          B.updateRadar(o, h);
        } else B.updateAI(o, h);
      }
      for (let i = B.missiles.length - 1; i >= 0; i--) { const m = B.missiles[i]; if (!m.dead) B.updateMissile(m, h); if (m.dead) B.missiles.splice(i, 1); }
      B.updateBullets(h); B.updateCMs(h);
    }
    const now = clock();
    for (const p of r.players.values()) if (p.ai && p.alive && p.craft && !p.craft.human) p.st = packState(p.craft, now - p.craft.fireT < 0.15);
  }
  const lockOf = (p) => {
    const o = p.craft; if (!o || o.dead) return 0;
    if (o.human) return o.radar.lock ? o.radar.lock.cid : 0;
    return o.stt && o.tgt && !o.tgt.dead ? o.tgt.cid : 0;
  };

  // ═════════════ Быстрый поиск ═════════════
  // очередь по режиму; двое и больше — через QUICK_WAIT с (восемь — сразу) всем «Бой найден», FOUND_T с на подтверждение.
  // Все подтвердили — комната: size = ⌈n/2⌉, пустые места — боты, все «Готов».
  function queue(c, mode) {
    if (c.room || !ONLINE_MODES.includes(mode)) return;
    unqueue(c);
    queues[mode].push({ c, t: clock() }); c.queued = mode;
    send(c, { t: 'queued', mode });
    pushSearch();
  }
  function unqueue(c, why) {
    if (!c.queued) return;
    const q = queues[c.queued], i = q.findIndex((e) => e.c === c); if (i >= 0) q.splice(i, 1);
    const pm = c.match; c.queued = null; c.match = null;
    if (pm && !pm.done) failMatch(pm, c);
    if (why) send(c, { t: 'unqueued', why });
    pushSearch();
  }
  function failMatch(pm, culprit) { // кто-то не подтвердил — остальные подтвердившие остаются в очереди
    pm.done = true;
    for (const c of pm.members) {
      if (c === culprit) continue;
      c.match = null;
      if (!pm.accepted.has(c)) unqueue(c, 'Вы не подтвердили бой — поиск остановлен');
      else send(c, { t: 'queued', mode: pm.mode, again: 1 });
    }
  }
  function tickQueues() {
    const now = clock();
    for (const mode of ONLINE_MODES) {
      const q = queues[mode], free = q.filter((e) => !e.c.match);
      if (free.length >= 2 && (free.length >= 8 || now - free[1].t >= QUICK_WAIT)) {
        const members = free.slice(0, 8).map((e) => e.c);
        const pm = { mode, members, accepted: new Set(), until: now + FOUND_T, done: false };
        for (const c of members) { c.match = pm; send(c, { t: 'found', mode, n: members.length, T: FOUND_T }); }
      }
      for (const e of q.slice()) { const pm = e.c.match; if (pm && !pm.done && now > pm.until) for (const c of pm.members) if (!pm.accepted.has(c)) { unqueue(c, 'Вы не подтвердили бой — поиск остановлен'); break; } }
    }
  }
  function accept(c) {
    const pm = c.match; if (!pm || pm.done) return;
    pm.accepted.add(c);
    for (const m of pm.members) send(m, { t: 'accepted', n: pm.accepted.size, of: pm.members.length });
    if (pm.accepted.size < pm.members.length) return;
    pm.done = true;
    const size = Math.min(4, Math.ceil(pm.members.length / 2));
    for (const m of pm.members) { const q = queues[pm.mode], i = q.findIndex((e) => e.c === m); if (i >= 0) q.splice(i, 1); m.queued = null; m.match = null; }
    const [first, ...rest] = pm.members;
    const r = createRoom(first, pm.mode, size); r.quick = true;
    rest.forEach((m, i) => join(m, r, i % 2 ? 0 : 1));
    for (const t of [0, 1]) while (teamCount(r, t) < size) addBot(r, t);
    for (const p of r.players.values()) p.ready = true;
    pushSearch(); maybeStart(r);
  }
  // «кто ищет»: число в очереди по режимам — всем, кто не в комнате (и в /health для сайта)
  const searching = () => ({ arcade: queues.arcade.length, real: queues.real.length });
  function pushSearch(force) {
    const s = JSON.stringify({ t: 'search', ...searching() }); if (s === qSent && !force) return; qSent = s;
    for (const c of clients) if (!c.room) try { if (c.ws.readyState === 1) c.ws.send(s); } catch (_) { /* закрылся */ }
  }

  // ═════════════ Сообщения клиента ═════════════
  const handlers = {
    async hello(c, m) {
      const who = await auth(m);
      if (!who) { send(c, { t: 'err', msg: 'Не удалось подтвердить аккаунт — перезайдите на сайт' }); c.ws.close(); return; }
      c.name = who.name; c.pid = who.pid; c.authed = true;
      // вернулся в идущий бой (обрыв связи): занимает свою прежнюю запись
      const old = who.pid && findAway(who.pid, !!m.resume);
      if (old) return resume(c, old);
      if (m.resume) send(c, { t: 'noresume' });
      send(c, { t: 'welcome', id: c.id, name: c.name });
      send(c, { t: 'search', ...searching() });
    },
    create(c, m) {
      if (!ONLINE_MODES.includes(m.mode) || !SIZES.includes(m.size)) return;
      if (rooms.size >= ROOMS_MAX) return send(c, { t: 'err', msg: 'Сервер занят — попробуйте позже' });
      unqueue(c); createRoom(c, m.mode, m.size);
    },
    join(c, m) {
      const r = rooms.get(cleanCode(m.code));
      if (!r) return send(c, { t: 'err', msg: 'Комнаты с таким кодом нет' });
      if (r.state === 'end') return send(c, { t: 'err', msg: 'В этой комнате подводят итоги — войдите через несколько секунд' });
      if (r.players.get(c.id)) return;
      if (!join(c, r)) send(c, { t: 'err', msg: 'Комната заполнена' });
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
    // создатель комнаты: «+ бот» в команду, убрать бота, перевести участника в другую команду
    bot(c, m) {
      const r = c.room; if (!r || r.host !== c.id || r.state !== 'lobby' || (m.team !== 0 && m.team !== 1)) return;
      if (teamCount(r, m.team) >= r.size) return send(c, { t: 'err', msg: 'В этой команде нет мест' });
      addBot(r, m.team); pushRoom(r); maybeStart(r);
    },
    kick(c, m) {
      const r = c.room, b = r && r.players.get(m.id); if (!b || !b.bot || r.host !== c.id || r.state !== 'lobby') return;
      leave(b);
    },
    move(c, m) {
      const r = c.room, p = r && r.players.get(m.id); if (!p || r.host !== c.id || r.state !== 'lobby') return;
      const to = 1 - p.team; if (teamCount(r, to) >= r.size) return send(c, { t: 'err', msg: 'В этой команде нет мест' });
      p.team = to; if (!p.bot) p.ready = false; pushRoom(r);
    },
    queue(c, m) { queue(c, m.mode); },
    unqueue(c) { unqueue(c); },
    accept(c) { accept(c); },
    decline(c) { unqueue(c, 'Поиск отменён'); },
    st(c, m) {
      const r = c.room; if (!r || (r.state !== 'play' && r.state !== 'countdown') || !c.alive || !validState(m.s)) return;
      if (c.ai) { // самолётом правил ИИ, а игрок снова шлёт состояния — отдаём ему самолёт с того места, где он сейчас
        if (!c.youT || clock() - c.youT > 1) { c.youT = clock(); send(c, { t: 'you', ...youOf(c) }); }
        return;
      }
      c.st = m.s; c.lastSt = clock();
      if (c.craft && !c.craft.dead) placeCraft(c.craft, m.s);
    },
    back(c, m) { // клиент поставил свой самолёт по «you» — дальше снова ведёт сам
      const r = c.room; if (!r || !c.ai || m.n !== c.youN) return;
      c.youT = 0; toHuman(r, c);
    },
    load(c, m) { // подвеска на эту жизнь — один раз после старта/возрождения (иначе ракеты можно было бы «перезаряжать»)
      if (!c.room || !validLoadout(m.l)) return;
      c.load = m.l.slice(); // её же возьмёт ИИ, если игрок пропадёт до возрождения
      if (c.craft && c.craft.human && !c.craft.load) c.craft.load = m.l.slice();
    },
    lock(c, m) { // захват РЛС игрока (или сброс: target 0); дальше его ведёт сервер той же логикой РЛС
      const r = c.room; if (!r || r.state !== 'play' || !c.alive || !c.craft || !c.craft.human) return;
      const radar = c.craft.radar;
      if (!m.target) { radar.lock = null; return; }
      const v = r.players.get(m.target);
      if (!v || !v.alive || !v.craft || v.team === c.team) return send(c, { t: 'lockx', why: 'lost' });
      radar.lock = v.craft; radar.lostT = 0;
    },
    launch(c, m) { // пуск ракеты: сервер проверяет подвеску, перезарядку и захват, потом ракету ведёт сам
      const r = c.room; if (!r || r.state !== 'play' || !c.alive || !c.craft || !c.craft.human || !r.battle) return;
      const o = c.craft, key = m.key, slot = m.slot | 0, M_ = typeof key === 'string' && Object.prototype.hasOwnProperty.call(MISSILES, key) ? MISSILES[key] : null;
      const deny = (msg) => send(c, { t: 'deny', msg, slot });
      if (!M_ || !o.load || o.load[slot] !== key) return deny('РАКЕТЫ НЕТ НА ПОДВЕСКЕ');
      const now = clock(); if (now - o.mslT < LAUNCH_CD) return deny('');
      if (validState(m.s)) { c.st = m.s; c.lastSt = now; placeCraft(o, m.s); } // точка пуска — где игрок был в момент нажатия
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
      const r = c.room; if (!r || r.state !== 'play' || !c.alive || !c.craft || !c.craft.human || !r.battle || (m.type !== 'flare' && m.type !== 'chaff')) return;
      r.battle.dropCM(c.craft, m.type);
    },
    hit(c, m) { // попадание пушки: заявляет стрелок, сервер проверяет дальность, команду и темп стрельбы
      const r = c.room; if (!r || r.state !== 'play' || !c.alive || c.ai || !c.st) return;
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
      const r = c.room; if (!r || r.state !== 'play' || !c.alive || c.ai) return;
      const dmg = Math.min(MAX_HP, Math.max(0, +m.dmg || 0)); if (dmg) damage(r, c, dmg, null, 'ЗЕМЛЯ');
    },
  };

  // ═════════════ Обрыв связи и возвращение ═════════════
  function findAway(pid, force) {
    for (const r of rooms.values()) for (const p of r.players.values()) if (!p.bot && p.pid === pid && (!p.ws || force) && r.state !== 'lobby') return p;
    return null;
  }
  // новая связь c занимает запись p (прежний сокет, если ещё жив, закрываем); дальше сообщения этого сокета — от p
  function resume(c, p) {
    const r = p.room;
    if (p.ws && p.ws !== c.ws) { const old = p.ws; p.ws = null; try { old.close(); } catch (_) { /* уже закрыт */ } }
    clients.delete(c); clients.add(p);
    Object.assign(p, { ws: c.ws, name: c.name, authed: true, awayT: 0 });
    send(p, { t: 'welcome', id: p.id, name: p.name, resumed: 1 });
    log(`комната ${r.code}: ${p.name} вернулся`);
    pushRoom(r);
    if (r.state === 'countdown' || r.state === 'play') {
      if (!p.ai) toAI(r, p); // пока клиент не поставил самолёт по «you» — ведёт ИИ
      sendStart(r, p, { t: r.t, score: r.score, you: youOf(p) });
      p.youT = clock();
    }
    return p;
  }
  function dropped(c) { // сокет закрылся
    clients.delete(c);
    unqueue(c);
    const r = c.room;
    if (r && (r.state === 'countdown' || r.state === 'play')) { // в бою место держим RESUME_T, самолёт ведёт ИИ
      c.ws = null; c.awayT = clock();
      toAI(r, c);
      if (!humans(r).some((p) => p.ws)) log(`комната ${r.code}: все люди без связи`);
      pushRoom(r);
      return;
    }
    leave(c);
  }

  function tick(dt) {
    const now = clock();
    for (const r of rooms.values()) {
      for (const p of humans(r)) if (!p.ws && p.awayT && now - p.awayT > RESUME_T) { log(`комната ${r.code}: ${p.name} не вернулся`); leave(p); }
      if (!rooms.has(r.code)) continue;
      if (r.state === 'countdown') {
        r.cd -= dt;
        if (r.cd <= 0) { r.state = 'play'; r.t = 0; for (const p of r.players.values()) p.lastSt = now; pushRoom(r); }
      } else if (r.state === 'play') {
        r.t += dt;
        for (const p of r.players.values()) {
          if (!p.alive && p.respawnAt <= r.t) {
            const s = teamSpawn(p.team, (Math.random() * 4) | 0);
            p.alive = true; p.hp = MAX_HP; p.st = null; p.spawn = s;
            newCraft(r, p, s);
            broadcast(r, { t: 'spawn', id: p.id, s: [s.x, s.y, s.z, s.yaw] });
          } else if (p.alive && !p.bot && !p.ai && now - p.lastSt > AFK_T) toAI(r, p); // молчит (свернул) — самолёт ведёт ИИ
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
          const players = [...r.players.values()].map((p) => ({ id: p.id, name: p.name, team: p.team, k: p.k, d: p.d, bot: p.bot ? 1 : 0 }));
          broadcast(r, { t: 'end', score: r.score, players });
          pushRoom(r);
          log(`комната ${r.code}: итог ${r.score.join(':')}`);
        }
      } else if (r.state === 'end') {
        r.endT -= dt;
        if (r.endT <= 0) {
          r.state = 'lobby';
          for (const p of humans(r)) if (!p.ws) leave(p); // не вернувшиеся к концу боя — выбывают
          if (!rooms.has(r.code)) continue;
          for (const p of r.players.values()) { p.ready = !!p.bot; p.alive = false; p.st = null; p.ai = !!p.bot; }
          pushRoom(r);
        }
      }
    }
  }
  setInterval(() => tick(1 / SNAP_HZ), 1000 / SNAP_HZ);
  setInterval(tickQueues, 1000);

  return {
    connect(ws) {
      let c = { id: nextId++, ws, name: '?', room: null, authed: false };
      clients.add(c);
      let rateT = 0, rateN = 0;
      ws.onmessage = async (ev) => {
        const now = clock(); if (now - rateT >= 1) { rateT = now; rateN = 0; }
        if (++rateN > MSG_RATE) { if (rateN > MSG_KILL) try { ws.close(); } catch (_) { /* уже */ } return; }
        if (typeof ev.data !== 'string' || ev.data.length > MSG_MAX) return;
        let m; try { m = JSON.parse(ev.data); } catch (_) { return; }
        if (!m || typeof m.t !== 'string' || !handlers[m.t]) return;
        if (!c.authed && m.t !== 'hello') return;
        if (c.ws !== ws) return; // запись уже заняла новая связь
        try { const p = await handlers[m.t](c, m); if (m.t === 'hello' && p && p.ws === ws) c = p; } catch (e) { log('ошибка в ' + m.t + ': ' + (e && e.stack || e)); }
      };
      ws.onclose = () => { if (c.ws === ws) dropped(c); }; // иначе запись уже заняла новая связь (переподключение)
      ws.onerror = () => {};
    },
    stats() { return { online: clients.size, rooms: rooms.size, searching: searching() }; },
  };
}
