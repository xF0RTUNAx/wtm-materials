// Онлайн «Воздушного превосходства» на том же сервере, что «Летка» (адрес /ad): авиация против ПВО, три волны.
// Правила — AIRDEF_PLAN.md («Онлайн — решения Mark»), числа — games/airdef/sim/online.js.
//
// Бой считает сервер той же логикой, что одиночная игра: sim/strike.js (комплексы, ЗУР, пушки, оружие самолётов,
// ловушки, урон по объектам) и sim/raid.js (ИИ-самолёты — боты авиации и самолёты людей без связи). Лётчики-люди
// летают у себя и шлют своё состояние (сервер двигает по нему «прокси» — его видят РЛС, ГСН и пушки); сброс оружия,
// ловушки и подсвет лазером — командами. ПВО-люди ставят комплексы за очки, в бою ими стреляет ИИ-расчёт; любой свой
// комплекс можно взять под ручное управление (назначить цель, пуск, РЛС, метод, ствол пушки). Боты ПВО — ИИ-расчёты.
// Клиенты рисуют бой по снимкам (SNAP_HZ) и событиям.
//
// Комната: лобби (команды, «Готов», боты, эпоха и стороны) → по волнам: расстановка и покупки (PLAN_T) → волна (до
// WAVE_T) → итоги волны → … → итоги боя. Быстрый поиск — очередь по режиму с ролью (авиация / ПВО / любая).
/* global THREE */
import { buildCity, CITY } from '../games/airdef/city.js?v=20260930m';
import { createStrike, MODES } from '../games/airdef/sim/strike.js?v=20260930m';
import { createRaid, STRIKERS } from '../games/airdef/sim/raid.js?v=20260930m';
import { pickTargets, spotNear, freeGround, roofOk, buildingAt } from '../games/airdef/mission.js?v=20260930m';
import { AG, SAM, LOADOUTS, DEFENSE } from '../games/airdef/arsenal.js?v=20260930m';
import { makeCraft, fwdOf, setGround } from '../games/drone/sim/core.js?v=20260930m';
import * as O from '../games/airdef/sim/online.js?v=20260930m';

const city = buildCity(1); setGround(city.groundH); // город один для всех комнат (как у клиентов: seed 1), только чтение
const clock = () => performance.now() / 1000;
const DT = 1 / O.TICK_HZ, SNAP_EVERY = Math.round(O.TICK_HZ / O.SNAP_HZ);
// AD_FAST=1 — для автопроверки (game-server/airdef-full.js): короткие фазы, всё остальное как в бою
const FAST = (() => { try { return Deno.env.get('AD_FAST') === '1'; } catch (_) { return false; } })();
const QUEUE_BOTS_T = FAST ? 4 : O.QUEUE_BOTS_T, QUEUE_EXTRA_T = FAST ? 2 : O.QUEUE_EXTRA_T;
const PLAN_T = FAST ? 3 : O.PLAN_T, WAVE_T = FAST ? 45 : O.WAVE_T, DEBRIEF_T = FAST ? 1 : O.DEBRIEF_T, RESULTS_T = FAST ? 3 : O.RESULTS_T;
const MSG_MAX = 4096, MSG_RATE = 120, MSG_KILL = 600, ROOMS_MAX = 200;
const AFK_T = 1.5;            // лётчик молчит дольше — его самолёт ведёт ИИ до конца вылета
const EXTRAP_MAX = 0.3;       // прокси между состояниями летит по прямой не дольше, с
const REL_CD = 0.25, CM_CD = 0.3;
const BOT_NAMES = ['Беркут', 'Кречет', 'Сапсан', 'Ястреб', 'Гроза', 'Буран', 'Вихрь', 'Шквал', 'Тайфун', 'Орлан', 'Филин', 'Гранит']; // позывные ботов
const r1 = (v) => Math.round(v * 10) / 10;
const V = () => new THREE.Vector3();
const opp = (s) => (s === 'east' ? 'west' : 'east');

export function createAdRooms({ log = () => {}, auth, sign = async () => null, journal = () => {} }) {
  const J = (r, ev, d = {}) => journal('ad_' + ev, r ? { room: r.code, mode: r.mode, st: r.state, wave: r.wave, ...d } : d);
  const rooms = new Map(), clients = new Set();
  const queues = { arcade: [], real: [] };   // [{ c, role, t }]
  const goAt = { arcade: 0, real: 0 };        // набралось 2 на 2 — когда собирать комнату
  let nextId = 1;
  // отказ игроку — с записью в журнал (что просил, почему нельзя)
  const deny = (c, msg, cmd) => { send(c, { t: 'deny', msg }); J(c.room, 'deny', { who: c.name, cmd, msg }); };
  const send = (c, msg) => { try { if (c.ws && c.ws.readyState === 1) c.ws.send(JSON.stringify(msg)); } catch (_) { /* закрылся */ } };
  const bcast = (r, msg, filter = null) => { const s = JSON.stringify(msg); for (const p of r.players.values()) if (p.ws && (!filter || filter(p))) try { if (p.ws.readyState === 1) p.ws.send(s); } catch (_) { /* закрылся */ } };
  const team = (r, t) => [...r.players.values()].filter((p) => p.team === t);
  const humans = (r) => [...r.players.values()].filter((p) => !p.bot);

  // ── вид комнаты (выбор связок авиации видят только союзники) ──
  const view = (r, me) => ({
    t: 'room', code: r.code, mode: r.mode, size: r.size, era: r.era, sideAir: r.sideAir, host: r.host, quick: !!r.quick, state: r.state, wave: r.wave,
    left: r.phaseT ? Math.max(0, Math.round(r.phaseT - r.t)) : null, valueK: r.valueK || 0, fill: !!r.fill,
    players: [...r.players.values()].map((p) => ({ id: p.id, name: p.name, team: p.team, bot: !!p.bot, ready: !!p.ready, away: !p.bot && !p.ws,
      budget: !me || p.team === me.team ? p.budget : null, choice: (!me || p.team === me.team) && p.choice !== null && p.choice !== undefined ? p.choice : null,
      kills: p.kills || 0, deaths: p.deaths || 0, score: Math.round(p.score || 0), lives: p.lives ?? null })),
  });
  const sendRoom = (r) => { for (const p of r.players.values()) if (p.ws) send(p, view(r, p)); };

  // ═════════════ Комната ═════════════
  function newRoom(host, o) {
    if (rooms.size >= ROOMS_MAX) return null;
    const code = O.makeCode(new Set(rooms.keys()));
    const r = { code, mode: O.AD_MODES.includes(o.mode) ? o.mode : 'arcade', size: O.AD_SIZES.includes(+o.size) ? +o.size : 2, era: [1, 2, 3, 4].includes(+o.era) ? +o.era : 1 + Math.floor(Math.random() * 4),
      sideAir: o.sideAir === 'east' || o.sideAir === 'west' ? o.sideAir : Math.random() < 0.5 ? 'east' : 'west', host: host ? host.id : 0, quick: !!o.quick, fill: o.fill !== false,
      players: new Map(), state: 'lobby', t: 0, phaseT: 0, wave: 0, tick: 0, S: null, raid: null, targets: [], valueK: 0, events: [] };
    rooms.set(code, r);
    J(r, 'room', { size: r.size, era: r.era });
    return r;
  }
  function joinRoom(r, c, wantTeam) {
    leaveRoom(c);
    const cap = (t) => team(r, t).length < r.size;
    // бот на месте нужной команды уступает человеку
    let t = wantTeam === 'air' || wantTeam === 'pvo' ? wantTeam : team(r, 'air').length <= team(r, 'pvo').length ? 'air' : 'pvo';
    if (!cap(t)) { const bot = team(r, t).find((p) => p.bot); if (bot) dropPlayer(r, bot); else t = t === 'air' ? 'pvo' : 'air'; }
    if (!cap(t)) { const bot = team(r, t).find((p) => p.bot); if (bot) dropPlayer(r, bot); else return send(c, { t: 'err', msg: 'Комната заполнена' }); }
    Object.assign(c, { room: r, team: t, ready: !!r.quick, bot: false, budget: O.BUDGET0[t], choice: null, kills: 0, deaths: 0, score: 0, lives: null, units: 0 });
    r.players.set(c.id, c);
    if (r.state !== 'lobby') { c.budget = r.wave > 1 ? Math.round(O.BUDGET0[t] * 0.8) : O.BUDGET0[t]; sendState(r, c); }
    sendRoom(r); J(r, 'join', { who: c.name, team: t });
  }
  function addBot(r, t) {
    if (team(r, t).length >= r.size) return;
    const used = new Set([...r.players.values()].map((p) => p.name));
    const name = BOT_NAMES.find((n) => !used.has(n)) || 'Бот';
    const b = { id: nextId++, name, bot: true, team: t, ready: true, budget: O.BUDGET0[t], choice: null, kills: 0, deaths: 0, score: 0, lives: null, ws: null };
    r.players.set(b.id, b);
    if (r.state === 'plan') botPlan(r, b);
    sendRoom(r);
  }
  function dropPlayer(r, p) {
    r.players.delete(p.id);
    if (r.S) { for (const u of r.S.units.filter((u) => u.owner === p.id)) { if (r.state === 'lobby') r.S.removeUnit(u); else u.owner = 0; } } // комплексы ушедшего остаются ИИ-расчётам
    if (p.craft) { toAI(r, p, 'left'); }
  }
  function leaveRoom(c) {
    const r = c.room; if (!r) return;
    c.room = null; dropPlayer(r, c);
    if (!humans(r).length) { closeRoom(r); return; }
    if (r.host === c.id) r.host = humans(r)[0].id;
    sendRoom(r);
  }
  function closeRoom(r) { rooms.delete(r.code); J(r, 'closed'); }

  // ── старт: все люди «Готов», в каждой команде кто-то есть (пусто — боты, если включено) ──
  function tryStart(r) {
    if (r.state !== 'lobby') return;
    const hs = humans(r);
    if (!hs.length || !hs.every((p) => p.ready && p.ws)) return;
    if (r.fill) for (const t of ['air', 'pvo']) while (team(r, t).length < r.size) addBot(r, t); // «боты» — все пустые места комнаты
    if (!team(r, 'air').length || !team(r, 'pvo').length) return;
    startBattle(r);
  }
  function startBattle(r) {
    r.S = createStrike({ city, rnd: Math.random, mode: () => MODES[r.mode], aircraft: () => r.air, laserSpot: (a) => a.laser || null, night: 0,
      hurt: (a, dmg, by) => hurtAir(r, a, dmg, by), spawnDecoy: (a, key, aim) => announce(r, r.raid.spawnDecoy(a, key, aim)), fx: strikeFx(r) });
    r.raid = createRaid(r.S, city, Math.random, { side: r.sideAir, era: r.era, fx: raidFx(r) });
    r.humanCraft = new Map();
    Object.defineProperty(r, 'air', { get: () => [...r.humanCraft.values(), ...r.raid.planes], configurable: true });
    r.targets = pickTargets(r.S, Math.random, 3);
    r.value0 = r.targets.reduce((s, o) => s + o.value, 0);
    r.wave = 0; r.valueK = 0; r.startedAt = Date.now();
    J(r, 'start', { era: r.era, sideAir: r.sideAir, air: team(r, 'air').map((p) => p.name), pvo: team(r, 'pvo').map((p) => p.name) });
    bcast(r, { t: 'start', era: r.era, sideAir: r.sideAir, mode: r.mode, targets: r.targets.map((o) => o.id), waves: O.WAVES });
    nextWave(r);
  }

  // ═════════════ Волны ═════════════
  function nextWave(r) {
    r.wave++; r.state = 'plan'; r.t = 0; r.phaseT = PLAN_T; r.waveRes = { downs: 0, unitKills: 0, value0K: r.valueK };
    for (const p of r.players.values()) {
      p.ready = !!p.bot; p.choice = null; p.craft = null; p.plane = null; p.lives = p.team === 'air' ? O.RESPAWNS[r.wave - 1] + 1 : null; p.out = false; p.respT = 0;
      p.limit = r.wave === 1 && p.team === 'pvo' ? { top: O.LIMIT1.top, mid: O.LIMIT1.mid } : null;
    }
    // ПВО между волнами: уничтоженные комплексы убираем, живые перезаряжаются
    for (const u of [...r.S.units]) { if (u.dead) { r.S.removeUnit(u); bcast(r, { t: 'ev', e: [['ur', u.id]] }); } else { u.ammo = u.S.ammo; u.reloadT = 0; u.track = null; u.desig = null; u.manual = false; } }
    for (const p of r.players.values()) if (p.bot) botPlan(r, p);
    sendState(r); sendRoom(r);
    J(r, 'plan', { budgets: [...r.players.values()].map((p) => [p.name, p.budget]) });
  }
  // начало волны: лётчики-люди — на край карты (своя связка), боты авиации — ИИ-налёт по целям
  function startWave(r) {
    r.state = 'play'; r.t = 0; r.phaseT = WAVE_T; r.tick = 0;
    for (const p of team(r, 'air')) if (p.choice === null || p.choice === undefined) autoChoice(r, p); // не выбрал — самая дешёвая из доступных
    const air = team(r, 'air'), b0 = Math.random() * Math.PI * 2;
    air.forEach((p, i) => { p.bearing = b0 + (i - (air.length - 1) / 2) * 0.35; spawnAir(r, p); });
    for (const p of team(r, 'pvo')) p.op = null;
    sendRoom(r);
    J(r, 'wave', { air: air.map((p) => [p.name, p.choice]) });
  }
  function spawnAir(r, p) {
    const L = O.bundleOf(r.era, r.sideAir, p.choice); if (!L) return;
    p.lives--; p.respT = 0;
    const R = CITY.HALF - 1500, x = Math.sin(p.bearing) * R, z = Math.cos(p.bearing) * R, yaw = Math.atan2(x, z), y = 3000;
    if (p.bot) {
      const tgt = r.targets[p.id % r.targets.length] || r.targets[0];
      const role = L.items.some(([k]) => AG[k].kind === 'arm') ? 'sead' : L.items.some(([k]) => AG[k].kind === 'cruise') ? 'cruise' : L.items.some(([k]) => AG[k].kind === 'agm' || AG[k].kind === 'tvb') ? 'tv' : 'bomber';
      const a = r.raid.spawn(role, tgt, p.bearing, 0, R);
      a.load = L.items.map(([k, n]) => ({ key: k, n })); a.owner = p.id; a.plane = L.plane;
      p.plane = a; announce(r, a);
      return;
    }
    const ST = STRIKERS[r.sideAir];
    const a = makeCraft({ ...ST, id: p.id, human: true, side: r.sideAir, hp: O.MAX_HP, hpMax: O.MAX_HP, rcs: ST.rcs, speed: 240, thr: 0.8, owner: p.id, plane: L.plane });
    a.pos.set(x, y, z); a.yaw = yaw; a.pitch = 0; a.roll = 0; fwdOf(a, a.vel).multiplyScalar(a.speed);
    a.jam = Math.max(0, ...L.items.map(([k]) => AG[k].jam || 0));
    p.craft = a; p.load = L.items.map(([k, n]) => ({ key: k, n })); p.cm = { flare: MODES[r.mode].cm, chaff: MODES[r.mode].cm }; p.relT = 0; p.cmT = 0; p.stT = r.t; p.lastSt = clock();
    r.humanCraft.set(p.id, a); a.load = p.load; announce(r, a);
    bcast(r, { t: 'spawn', id: p.id, s: [r1(x), y, r1(z), Math.round(yaw * 1000) / 1000], lives: p.lives, load: p.load, cm: p.cm, plane: L.plane, choice: p.choice });
  }
  // самолёт человека без связи (или ушедшего) — дальше его ведёт ИИ с тем, что осталось на подвеске
  function toAI(r, p, why) {
    const a = p.craft; if (!a || a.dead) { p.craft = null; return; }
    r.humanCraft.delete(p.id); p.craft = null;
    const tgt = r.targets[0];
    const b = r.raid.spawn('bomber', tgt, 0, 0);
    b.pos.copy(a.pos); b.yaw = a.yaw; b.pitch = a.pitch; b.speed = a.speed; fwdOf(b, b.vel).multiplyScalar(b.speed); b.hp = a.hp; b.hpMax = O.MAX_HP;
    b.load = (p.load || []).filter((l) => l.n > 0); b.owner = p.id; b.plane = a.plane; b.fromHuman = p.id;
    p.plane = b; p.ai = true; announce(r, b);
    bcast(r, { t: 'ev', e: [['ai', p.id, b.id]] });
    J(r, 'to_ai', { who: p.name, why });
  }
  function endWave(r, why) {
    if (r.state !== 'play') return;
    // самолёты, которые ещё в воздухе, уходят; ракеты и бомбы — догорают на клиентах сами
    for (const p of team(r, 'air')) { if (p.craft) { r.humanCraft.delete(p.id); p.craft = null; } }
    for (const a of r.raid.planes) if (!a.dead) a.out = true;
    r.raid.planes.length = 0;
    const res = { wave: r.wave, why, valueK: Math.max(0, r.valueK - r.waveRes.value0K), totalK: r.valueK, downs: r.waveRes.downs, unitKills: r.waveRes.unitKills };
    const airWins = r.valueK >= O.WIN_K, last = r.wave >= O.WAVES || airWins;
    r.state = 'debrief'; r.t = 0; r.phaseT = DEBRIEF_T; r.last = last; r.lastRes = res;
    // бюджеты на следующую волну: проигрывающая сторона (по ходу боя) получает прибавку
    const airLosing = r.valueK < O.WIN_K * r.wave / O.WAVES;
    for (const p of r.players.values()) p.budget = (p.budget || 0) + O.waveBudget(p.team, res, p.team === 'air' ? airLosing : !airLosing);
    bcast(r, { t: 'waveEnd', ...res, last });
    sendRoom(r);
    J(r, 'wave_end', res);
  }
  async function endBattle(r) {
    const winner = r.valueK >= O.WIN_K ? 'air' : 'pvo';
    r.state = 'end'; r.t = 0; r.phaseT = RESULTS_T;
    const list = [...r.players.values()].map((p) => ({ id: p.id, name: p.name, team: p.team, bot: !!p.bot, kills: p.kills || 0, deaths: p.deaths || 0, score: Math.round(p.score || 0) }));
    // итог для наград (функция airdef-claim проверяет подпись MP_SECRET): g — игра, m — бой, w — победа, k — сбито/уничтожено,
    // s — очки, hm — людей больше половины (тогда награды «Реализма» полные), exp — срок
    const hm = humans(r).length * 2 > r.players.size ? 1 : 0;
    for (const p of humans(r)) {
      const res = { g: 'airdef', m: `${r.code}-${r.startedAt}`, p: p.pid, mode: r.mode, team: p.team, w: p.team === winner ? 1 : 0, k: p.kills || 0, s: Math.round(p.score || 0), hm, exp: Math.floor(Date.now() / 1000) + 3600 };
      send(p, { t: 'end', winner, valueK: r.valueK, players: list, result: p.pid && !String(p.pid).startsWith('test-') ? await sign(res) : null });
    }
    J(r, 'end', { winner, valueK: r.valueK });
  }

  // ═════════════ Боты: расстановка и выбор связки ═════════════
  const afford = (r, p) => LOADOUTS[r.era].map((L, i) => [L, i]).filter(([L]) => L.side === r.sideAir && O.loadoutCost(L) <= p.budget);
  function autoChoice(r, p) {
    const list = afford(r, p).sort((a, b) => O.loadoutCost(a[0]) - O.loadoutCost(b[0]));
    const pick = p.bot && list.length ? list[Math.floor(Math.random() * list.length)] : list[0];
    const all = LOADOUTS[r.era].map((L, i) => [L, i]).filter(([L]) => L.side === r.sideAir).sort((a, b) => O.loadoutCost(a[0]) - O.loadoutCost(b[0]));
    const [L, i] = pick || all[0];
    p.choice = i; p.budget = Math.max(0, p.budget - O.loadoutCost(L));
  }
  function botPlan(r, p) {
    if (p.team === 'air') { if (p.choice === null) autoChoice(r, p); return; }
    const side = opp(r.sideAir), list = (DEFENSE[side][r.era] || []).map(([k]) => k).filter((k) => O.samOk(k, r.era, side));
    const order = [...list.filter((k) => O.samClass(k) === 'top'), ...list.filter((k) => O.samClass(k) === 'mid'), ...list.filter((k) => O.samClass(k) === 'near')];
    for (let guard = 0; guard < 12; guard++) {
      const k = order.find((k) => O.samCost(k) <= p.budget && canClass(r, p, k)); if (!k) break;
      const tgt = r.targets[guard % r.targets.length], Sx = SAM[k], man = Sx.type === 'ir' && Sx.hp <= 15;
      const xz = Sx.rmax >= 15000 ? spotNear(city, Math.random, tgt.x * 0.5, tgt.z * 0.5, 600, 2500, false) : spotNear(city, Math.random, tgt.x, tgt.z, 250, man ? 1600 : 1400, man);
      buyUnit(r, p, k, xz[0], xz[1], xz[2], true);
      if (order.length > 1 && O.samClass(k) === 'top') order.splice(order.indexOf(k), 1);
    }
  }
  function canClass(r, p, k) {
    if (!p.limit) return true;
    const cls = O.samClass(k); if (cls === 'near') return true;
    const have = r.S.units.filter((u) => u.owner === p.id && O.samClass(u.key) === cls).length;
    return have < p.limit[cls];
  }
  function buyUnit(r, p, k, x, z, roof, quiet) {
    const side = opp(r.sideAir);
    if (!O.samOk(k, r.era, side)) return 'Комплекс недоступен';
    if (O.samCost(k) > p.budget) return 'Не хватает очков';
    if (!canClass(r, p, k)) return O.samClass(k) === 'top' ? 'На первой волне — один дальний комплекс' : 'На первой волне — два комплекса средней дальности';
    if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > CITY.HALF - 1500 || Math.abs(z) > CITY.HALF - 1500) return 'Вне карты';
    const Sx = SAM[k], man = Sx.type === 'ir' && Sx.hp <= 15;
    if (roof) { if (!man) return 'На крышу — только ПЗРК'; const bi = buildingAt(city, x, z); if (bi < 0 || !roofOk(city, bi)) return 'Сюда на крышу нельзя'; }
    else if (!freeGround(city, x, z, man ? 3 : 9)) return 'Место занято — нужна свободная земля'; // как у клиента (defense.js placeOk)
    const u = r.S.addUnit(k, x, z, { roof: !!roof, skill: 0.75, yaw: Math.random() * 6.28 });
    u.owner = p.id; p.budget -= O.samCost(k);
    bcast(r, { t: 'ev', e: [['ua', u.id, k, r1(x), r1(z), roof ? 1 : 0, p.id, Math.round(u.yaw * 1000) / 1000]] });
    if (!quiet) sendRoom(r);
    return null;
  }

  // ═════════════ Хуки боя → события клиентам ═════════════
  const push = (r, e) => r.events.push(e);
  // новый самолёт в бою (люди, боты, ИИ вместо людей, ложные цели): роль, модель, владелец, подвеска — клиенты рисуют его
  const announce = (r, a) => push(r, ['an', a.id, a.role || (a.human ? 'human' : 'bomber'), a.plane || '', a.decoyKey || '', a.owner || 0, (a.load || []).map((l) => l.key + ':' + l.n).join(',')]);
  const v3 = (p) => [r1(p.x), r1(p.y), r1(p.z)];
  function strikeFx(r) {
    return {
      samLaunch: (m) => push(r, ['sl', m.id, m.unit.id, m.target ? (m.target.isMun ? -m.target.id : m.target.id) : 0, m.slot]),
      samEnd: (m, hit) => push(r, ['se', m.id, hit ? 1 : 0, ...v3(m.pos)]),
      wpnRelease: (w) => push(r, ['wr', w.id, w.key, w.owner ? w.owner.id : 0, ...v3(w.pos), r1(w.vel.x), r1(w.vel.y), r1(w.vel.z)]),
      wpnEnd: (w, res) => push(r, ['we', w.id, ...v3(w.pos), res.intercepted ? 1 : 0]),
      explosion: (p, R, kind) => push(r, ['x', ...v3(p), r1(R), kind]),
      cmDrop: (a, type) => push(r, ['cm', a.id, type === 'flare' ? 1 : 2]),
      objectDestroyed: (o, by, owner) => { push(r, ['od', o.id]); updValue(r); const p = airOwner(r, owner); if (p) p.score += o.value * (r.targets.some((q) => q.id === o.id) ? 2 : 0.5); killLog(r, p ? p.name : 'Авиация', o.name, by); },
      objectHit: () => updValue(r),
      unitDestroyed: (u, by, owner) => { push(r, ['ud', u.id]); r.waveRes.unitKills++; const p = airOwner(r, owner); if (p) { p.kills++; p.score += 40; } const v = r.players.get(u.owner); killLog(r, p ? p.name : 'Авиация', `${u.S.short}${v ? ' (' + v.name + ')' : ''}`, by); },
    };
  }
  function raidFx(r) {
    return {
      down: (a) => { push(r, ['dn', a.id]); onAirDown(r, a, a.lastBy); },
      out: () => {},
    };
  }
  const airOwner = (r, a) => (a ? r.players.get(a.owner || a.fromHuman || a.id) || null : null);
  // журнал сбитий: кто — кого — чем (клиенты показывают 6 с)
  const killLog = (r, who, whom, by) => push(r, ['kl', String(who || '?').slice(0, 24), String(whom || '?').slice(0, 40), String(by || '').slice(0, 24)]);
  function updValue(r) {
    let v = 0; for (const o of r.targets) { const S = r.S.objects.find((q) => q.id === o.id); v += o.value * (S.dead ? 1 : Math.min(1, S.dmgTaken / S.hpMax)); }
    r.valueK = v / r.value0;
  }
  // урон самолёту: люди — свой корпус, боты/ИИ — через налёт; кто сбил — тому очки
  function hurtAir(r, a, dmg, by) {
    const k = MODES[r.mode].dmgTaken;
    if (a.human) {
      if (a.dead) return;
      a.hp -= dmg * k; push(r, ['hp', a.id, Math.max(0, Math.round(a.hp)), by]);
      if (a.hp <= 0) { a.dead = true; push(r, ['dn', a.id]); onAirDown(r, a, by); }
      return;
    }
    a.lastBy = by; r.raid.hurt(a, dmg * k);
  }
  function onAirDown(r, a, by) {
    if (a.role === 'decoy') return;
    r.waveRes.downs++;
    const owner = r.players.get(a.owner || a.fromHuman || 0);
    if (owner) { owner.deaths++; if (owner.craft === a) { r.humanCraft.delete(owner.id); owner.craft = null; } if (owner.plane === a) owner.plane = null; owner.respT = r.t + O.RESPAWN_T; }
    // сбитие — ПВО: очки владельцу комплекса, который вёл цель (или всей команде поровну, если неизвестно)
    const shooter = r.S.units.find((u) => !u.dead && u.track === a) || null;
    const sp = shooter && r.players.get(shooter.owner);
    if (sp) { sp.kills++; sp.score += 50; } else { const pv = team(r, 'pvo'); for (const p of pv) p.score += 50 / pv.length; }
    killLog(r, sp ? `${sp.name} (${shooter.S.short})` : by === 'ЗЕМЛЯ' ? 'Земля' : 'ПВО', owner ? owner.name : 'Самолёт', by);
    J(r, 'down', { who: owner ? owner.name : '?', by });
  }

  // ═════════════ Такт ═════════════
  function step(r, dt) {
    r.t += dt;
    if (r.state !== 'lobby' && Math.floor(r.t) !== r.sec) { r.sec = Math.floor(r.t); sendRoom(r); } // таймер фазы — раз в секунду
    if (r.state === 'plan') { if (r.t >= r.phaseT || team(r, 'air').concat(team(r, 'pvo')).every((p) => p.ready || !p.ws && !p.bot)) startWave(r); return; }
    if (r.state === 'debrief') { if (r.t >= r.phaseT) { if (r.last) endBattle(r); else nextWave(r); } return; }
    if (r.state === 'end') { if (r.t >= r.phaseT) { for (const p of humans(r)) { p.room = null; send(p, { t: 'closed' }); } closeRoom(r); } return; }
    if (r.state !== 'play') return;
    const now = clock();
    // лётчики: прокси между состояниями — по прямой; молчит — самолёт берёт ИИ
    for (const p of team(r, 'air')) {
      const a = p.craft;
      if (a && !a.dead) {
        if (now - p.lastSt > AFK_T) toAI(r, p, p.ws ? 'silent' : 'disconnect');
        else if (now - p.lastSt < EXTRAP_MAX) a.pos.addScaledVector(a.vel, dt);
      }
      // возрождение: сбит, жизни остались — новый вылет с края карты
      if (!p.craft && !p.plane && !p.out && p.lives > 0 && p.respT && r.t >= p.respT && (p.bot || p.ws)) spawnAir(r, p);
    }
    r.S.step(dt); r.raid.step(dt);
    for (const a of r.raid.planes) if (a.out && a.owner) { const p = r.players.get(a.owner); if (p && p.plane === a) { p.plane = null; p.out = true; } }
    // конец волны: ≥ 75 % ценности — сразу; авиации в воздухе нет и не будет; время
    if (r.valueK >= O.WIN_K) return endWave(r, 'value');
    const inAir = team(r, 'air').some((p) => (p.craft && !p.craft.dead) || (p.plane && !p.plane.dead && !p.plane.out) || (!p.out && p.lives > 0 && (p.bot || p.ws)));
    const munitions = r.S.wpns.length + r.S.sams.length;
    if (!inAir && !munitions) return endWave(r, 'air_done');
    if (r.t >= r.phaseT) return endWave(r, 'time');
    if (++r.tick % SNAP_EVERY === 0) snapshot(r);
    if (r.tick % (O.TICK_HZ * 5) === 0) J(r, 'state', { // раз в 5 с: кто где, связь, комплексы
      V: Math.round(r.valueK * 100),
      P: [...r.players.values()].map((p) => ({ n: p.name, team: p.team, bot: p.bot ? 1 : undefined, net: p.bot ? undefined : p.ws ? 1 : 0, silent: p.craft ? Math.round((now - p.lastSt) * 10) / 10 : undefined,
        hp: p.craft ? Math.round(p.craft.hp) : p.plane ? Math.round(p.plane.hp) : undefined, ai: p.plane && !p.bot ? 1 : undefined, lives: p.lives ?? undefined, out: p.out ? 1 : undefined,
        load: p.craft && p.load ? p.load.map((l) => l.key + ':' + l.n).join(',') : undefined, op: p.op ? p.op.S.short : undefined, budget: p.budget })),
      U: r.S.units.map((u) => `${u.id}:${u.S.short}${u.owner ? '@' + (r.players.get(u.owner) || {}).name : ''}${u.dead ? ' УНИЧТОЖЕН' : ''}${u.manual ? ' РУЧН' : ''}${u.emit ? ' РЛС' : ''}${u.track ? ' захват:' + u.track.id : ''}${u.desig ? ' цель:' + u.desig.id : ''} р${Math.round(u.ammo)}`),
      air: r.air.filter((a) => !a.dead && !a.out).length, sams: r.S.sams.length, wpns: r.S.wpns.length });
  }
  function snapshot(r) {
    const ev = r.events; r.events = [];
    const msg = { t: 's', T: Math.round(r.t * 100) / 100, A: r.air.filter((a) => !a.dead || a.t < 1).map(O.packA), U: r.S.units.map(O.packU), M: r.S.sams.filter((m) => !m.dead).map(O.packM),
      W: r.S.wpns.filter((w) => !w.dead).map(O.packW), V: Math.round(r.valueK * 1000) / 1000, e: ev.length ? ev : undefined };
    bcast(r, msg);
  }
  // полное состояние входящему / новой волне: комплексы, объекты, бюджеты
  function sendState(r, only) {
    if (!r.S) return;
    const msg = { t: 'state', era: r.era, sideAir: r.sideAir, mode: r.mode, wave: r.wave, targets: r.targets.map((o) => o.id),
      units: r.S.units.map((u) => [u.id, u.key, r1(u.pos.x), r1(u.pos.z), u.roof ? 1 : 0, u.owner || 0, Math.round(u.yaw * 1000) / 1000, u.dead ? 1 : 0]),
      objects: r.S.objects.filter((o) => o.dmgTaken > 0 || o.dead).map((o) => [o.id, Math.round(o.hp), o.dead ? 1 : 0]) };
    if (only) send(only, msg); else bcast(r, msg);
  }
  setInterval(() => { for (const r of [...rooms.values()]) { try { step(r, DT); } catch (e) { log('ad: ошибка такта ' + (e && e.stack || e)); J(r, 'error', { msg: String(e && e.message || e) }); } } queueStep(); }, 1000 * DT);

  // ═════════════ Быстрый поиск ═════════════
  // очередь по режиму: роли «авиация», «ПВО», «любая». Набралось 2 на 2 — ждём ещё QUEUE_EXTRA_T (вдруг 3 на 3 …);
  // кто-то ждёт дольше QUEUE_BOTS_T — собираем с ботами
  function queueStep() {
    const now = clock();
    for (const mode of O.AD_MODES) {
      const q = queues[mode] = queues[mode].filter((e) => e.c.ws && e.c.ws.readyState === 1 && !e.c.room);
      if (!q.length) continue;
      const air = q.filter((e) => e.role === 'air').length, pvo = q.filter((e) => e.role === 'pvo').length, any = q.length - air - pvo;
      const per = Math.min(6, Math.floor((air + pvo + any) / 2)), fits = Math.min(air + any, per) >= O.QUEUE_MIN && Math.min(pvo + any, per) >= O.QUEUE_MIN && per >= O.QUEUE_MIN;
      const oldest = Math.min(...q.map((e) => e.t));
      if (fits && !goAt[mode]) { goAt[mode] = now + QUEUE_EXTRA_T; for (const e of q) send(e.c, { t: 'qwait', T: QUEUE_EXTRA_T, n: q.length }); }
      const full = per >= 6;
      if ((goAt[mode] && (now >= goAt[mode] || full)) || now - oldest > QUEUE_BOTS_T) {
        goAt[mode] = 0;
        const r = newRoom(null, { mode, size: Math.max(O.QUEUE_MIN, per), quick: true, fill: true }); if (!r) continue;
        const pick = [...q].sort((a, b) => a.t - b.t).slice(0, r.size * 2);
        for (const e of pick.filter((e) => e.role !== 'any')) joinRoom(r, e.c, e.role);
        for (const e of pick.filter((e) => e.role === 'any')) joinRoom(r, e.c, team(r, 'air').length <= team(r, 'pvo').length ? 'air' : 'pvo');
        queues[mode] = queues[mode].filter((e) => !pick.includes(e));
        for (const t of ['air', 'pvo']) while (team(r, t).length < r.size) addBot(r, t);
        startBattle(r);
      } else if (!fits) goAt[mode] = 0;
    }
  }
  const searching = () => ({ arcade: queues.arcade.length, real: queues.real.length });

  // ═════════════ Сообщения ═════════════
  function connect(ws) {
    const c = { id: nextId++, ws, name: null, pid: '', room: null, msgN: 0, msgT: 0 };
    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string' || ev.data.length > MSG_MAX) return;
      const s = Math.floor(clock()); if (s !== c.msgT) { c.msgT = s; c.msgN = 0; }
      if (++c.msgN > MSG_KILL) { try { ws.close(); } catch (_) { /* уже */ } return; }
      if (c.msgN > MSG_RATE) return;
      let m; try { m = JSON.parse(ev.data); } catch (_) { return; }
      if (!m || typeof m.t !== 'string') return;
      onMsg(c, m).catch((e) => log('ad: ошибка сообщения ' + (e && e.message || e)));
    };
    ws.onclose = () => {
      clients.delete(c);
      for (const q of Object.values(queues)) { const i = q.findIndex((e) => e.c === c); if (i >= 0) q.splice(i, 1); }
      const r = c.room;
      if (r) { c.ws = null; if (r.state === 'lobby' || r.state === 'end') leaveRoom(c); else { if (c.craft) toAI(r, c, 'disconnect'); if (!humans(r).some((p) => p.ws)) closeRoom(r); else sendRoom(r); } }
    };
  }
  async function onMsg(c, m) {
    if (m.t === 'hello') {
      const who = await auth(m); if (!who) return send(c, { t: 'err', msg: 'Не удалось войти: обновите страницу' });
      Object.assign(c, { name: who.name, pid: who.pid }); clients.add(c);
      // возвращение в идущий бой тем же аккаунтом
      for (const r of rooms.values()) { const old = [...r.players.values()].find((p) => !p.bot && p.pid && p.pid === c.pid && !p.ws); if (old && r.state !== 'lobby') { const ws = c.ws; Object.assign(c, old, { ws }); c.room = r; r.players.set(c.id, c); /* прежний id — комплексы и счёт остаются за игроком */ send(c, { t: 'welcome', id: c.id, name: c.name, resumed: 1 }); sendState(r, c); send(c, view(r, c)); return; } }
      return send(c, { t: 'welcome', id: c.id, name: c.name, search: searching() });
    }
    if (!c.name) return;
    const r = c.room;
    switch (m.t) {
      case 'create': { const nr = newRoom(c, m); if (!nr) return send(c, { t: 'err', msg: 'Сервер занят' }); joinRoom(nr, c, m.team); return; }
      case 'join': { const jr = rooms.get(O.cleanCode(m.code)); if (!jr) return send(c, { t: 'err', msg: 'Комната не найдена' }); if (jr.state === 'end') return send(c, { t: 'err', msg: 'Бой уже закончился' }); joinRoom(jr, c, m.team); return; }
      case 'leave': leaveRoom(c); return send(c, { t: 'left' });
      case 'queue': { if (r || !O.AD_MODES.includes(m.mode)) return; for (const q of Object.values(queues)) { const i = q.findIndex((e) => e.c === c); if (i >= 0) q.splice(i, 1); } queues[m.mode].push({ c, role: ['air', 'pvo'].includes(m.role) ? m.role : 'any', t: clock() }); return send(c, { t: 'queued', mode: m.mode, n: queues[m.mode].length }); }
      case 'unqueue': for (const q of Object.values(queues)) { const i = q.findIndex((e) => e.c === c); if (i >= 0) q.splice(i, 1); } return send(c, { t: 'unqueued' });
    }
    if (!r) return;
    const me = c, host = r.host === c.id;
    switch (m.t) {
      // ── лобби ──
      case 'team': if (r.state === 'lobby' && ['air', 'pvo'].includes(m.team) && team(r, m.team).length < r.size) { c.team = m.team; c.budget = O.BUDGET0[m.team]; c.ready = false; sendRoom(r); } return;
      case 'ready': if (r.state === 'lobby') { c.ready = !!m.on; sendRoom(r); tryStart(r); } else if (r.state === 'plan') { c.ready = !!m.on; sendRoom(r); } return;
      case 'bot': if (host && r.state === 'lobby') addBot(r, m.team === 'pvo' ? 'pvo' : 'air'); return;
      case 'kick': { const b = r.players.get(+m.id); if (host && r.state === 'lobby' && b && b.bot) { r.players.delete(b.id); sendRoom(r); } return; }
      case 'opts': if (host && r.state === 'lobby') { if ([1, 2, 3, 4].includes(+m.era)) r.era = +m.era; if (m.sideAir === 'east' || m.sideAir === 'west') r.sideAir = m.sideAir; if (O.AD_MODES.includes(m.mode)) r.mode = m.mode; if (O.AD_SIZES.includes(+m.size)) r.size = +m.size; if (m.fill !== undefined) r.fill = !!m.fill; for (const p of r.players.values()) if (!p.bot) p.ready = false; sendRoom(r); } return;
      // ── расстановка и покупки ──
      case 'buyAir': {
        if (r.state !== 'plan' || c.team !== 'air') return;
        const L = O.bundleOf(r.era, r.sideAir, +m.i); if (!L) return;
        const back = c.choice !== null ? O.loadoutCost(LOADOUTS[r.era][c.choice]) : 0;
        if (O.loadoutCost(L) > c.budget + back) return deny(c, 'Не хватает очков на эту связку', 'buyAir');
        c.budget += back - O.loadoutCost(L); c.choice = +m.i; sendRoom(r); return;
      }
      case 'buyUnit': { if (r.state !== 'plan' || c.team !== 'pvo') return; const why = buyUnit(r, c, String(m.k), +m.x, +m.z, !!m.roof); if (why) deny(c, why, 'buyUnit ' + m.k); else J(r, 'cmd', { who: c.name, cmd: 'buyUnit', k: m.k, x: Math.round(+m.x), z: Math.round(+m.z) }); return; }
      case 'sell': { const u = r.S && r.S.units.find((q) => q.id === +m.id); if (r.state !== 'plan' || !u || u.owner !== c.id) return; c.budget += Math.round(O.samCost(u.key) * 0.7); r.S.removeUnit(u); bcast(r, { t: 'ev', e: [['ur', u.id]] }); sendRoom(r); return; }
      case 'move': { const u = r.S && r.S.units.find((q) => q.id === +m.id); if (r.state !== 'plan' || !u || u.owner !== c.id || !Number.isFinite(+m.x) || !Number.isFinite(+m.z)) return; if (!(m.roof ? buildingAt(city, +m.x, +m.z) >= 0 : freeGround(city, +m.x, +m.z))) return deny(c, 'Место занято', 'move'); r.S.moveUnit(u, +m.x, +m.z, !!m.roof); bcast(r, { t: 'ev', e: [['um', u.id, r1(+m.x), r1(+m.z), m.roof ? 1 : 0]] }); return; }
    }
    // журнал игры: ошибки, отказы у себя, связь, частота кадров (≤ 30 в минуту)
    if (m.t === 'clog') {
      const now = clock(); if (now - (c.clogT || 0) > 60) { c.clogT = now; c.clogN = 0; }
      if (++c.clogN <= 30) J(r, 'client', { who: c.name, k: String(m.k || '').slice(0, 24), d: String(typeof m.d === 'string' ? m.d : JSON.stringify(m.d)).slice(0, 1500) });
      return;
    }
    // «Мне нужна помощь!» — союзникам (с точкой: самолёт или свой комплекс под управлением)
    if (m.t === 'help' && r.state !== 'lobby' && clock() - (c.helpT || 0) > 5) {
      c.helpT = clock();
      const at = c.craft ? c.craft.pos : c.op ? c.op.pos : null;
      bcast(r, { t: 'help', id: c.id, name: c.name, p: at ? [r1(at.x), r1(at.z)] : null }, (q) => q.team === c.team);
      return;
    }
    if (r.state !== 'play') return;
    switch (m.t) {
      // ── лётчик ──
      case 'st': {
        const a = c.craft; if (!a || a.dead || !O.validState(m.s)) return;
        const s = m.s; a.pos.set(s[0], s[1], s[2]); a.yaw = s[3]; a.pitch = s[4]; a.roll = s[5]; a.speed = s[6]; a.thr = s[7]; a.ab = !!(s[8] & 1);
        fwdOf(a, a.vel).multiplyScalar(a.speed); c.lastSt = clock();
        if (Math.abs(s[0]) > CITY.HALF - 200 || Math.abs(s[2]) > CITY.HALF - 200) { if (r.t > 60 && !(c.load || []).some((l) => l.n > 0 && AG[l.key].kind !== 'ecm')) { r.humanCraft.delete(c.id); c.craft = null; c.out = true; push(r, ['out', c.id]); } }
        return;
      }
      case 'rel': {
        const a = c.craft; if (!a || a.dead || r.t - c.relT < REL_CD) return;
        const l = (c.load || []).find((q) => q.key === m.k && q.n > 0); if (!l) return deny(c, 'Нет такого оружия', 'rel ' + m.k);
        c.relT = r.t; l.n--;
        const aim = Array.isArray(m.aim) && m.aim.every(Number.isFinite) ? new THREE.Vector3(m.aim[0], m.aim[1], m.aim[2]) : null;
        const tgt = m.tg ? r.S.units.find((u) => u.id === +m.tg) || null : null;
        r.S.release(a, l.key, { aim, target: tgt });
        J(r, 'cmd', { who: c.name, cmd: 'rel', k: l.key, left: l.n, aim: !!aim, tg: tgt ? tgt.S.short : null, laser: !!a.laser });
        return;
      }
      case 'rtb': { // вылет окончен: оружия нет, ушёл за границу района — дальше смотрит за союзниками
        const a = c.craft; if (!a || a.dead || (c.load || []).some((l) => l.n > 0 && AG[l.key].kind !== 'ecm')) return;
        r.humanCraft.delete(c.id); c.craft = null; c.out = true; push(r, ['out', c.id]); return;
      }
      case 'laser': { const a = c.craft; if (a) a.laser = Array.isArray(m.p) && m.p.every(Number.isFinite) ? new THREE.Vector3(m.p[0], m.p[1], m.p[2]) : null; return; }
      case 'cm': { // 'both' — пачка ЛТЦ и диполей одной кнопкой (клиенты с версии 2026-10); 'flare' / 'chaff' — по одной
        const a = c.craft, types = m.type === 'both' ? ['flare', 'chaff'] : [m.type === 'chaff' ? 'chaff' : 'flare'];
        if (a && c.cm) J(r, 'cmd', { who: c.name, cmd: 'cm', type: m.type, left: Math.max(c.cm.flare, c.cm.chaff) });
        if (!a || a.dead || r.t - (c.cmT || 0) < CM_CD || !types.some((k) => c.cm[k] > 0)) return;
        c.cmT = r.t; for (const k of types) if (c.cm[k] > 0) { c.cm[k]--; r.S.dropCM(a, k); }
        return; }
      case 'self': { const a = c.craft; if (!a || a.dead) return; a.hp = 0; a.dead = true; push(r, ['dn', a.id]); push(r, ['x', ...v3(a.pos), 25, 'ground']); onAirDown(r, a, 'ЗЕМЛЯ'); return; }
      // ── оператор ПВО: свой комплекс ──
      case 'op': {
        if (c.team !== 'pvo') return;
        if (c.op && !c.op.dead) r.S.setManual(c.op, false);
        const u = r.S.units.find((q) => q.id === +m.id && q.owner === c.id && !q.dead);
        c.op = u || null; if (u) r.S.setManual(u, true);
        J(r, 'cmd', { who: c.name, cmd: 'op', id: +m.id, ok: !!u || !+m.id });
        return;
      }
    }
    const u = c.op && c.op.id === +m.id && !c.op.dead ? c.op : null;
    if (!u) { if (m.t !== 'aim' && m.t !== 'method') J(r, 'deny', { who: c.name, cmd: m.t + ' ' + m.id, msg: c.op ? 'это не комплекс под управлением' : 'нет комплекса под управлением' }); return; }
    switch (m.t) {
      case 'desig': { const id = +m.tg; const t = id > 0 ? r.air.find((a) => a.id === id && !a.dead) : id < 0 ? r.S.wpns.find((w) => w.id === -id && !w.dead) : null; r.S.designate(u, t || null); J(r, 'cmd', { who: c.name, cmd: 'desig', u: u.S.short, tg: id, found: !!t, km: t ? Math.round(t.pos.distanceTo(u.pos) / 100) / 10 : null }); return; }
      case 'launch': { const why = r.S.launch(u); J(r, 'cmd', { who: c.name, cmd: 'launch', u: u.S.short, track: u.track ? u.track.id : 0, ok: !why, why: why || undefined }); if (why) send(c, { t: 'deny', msg: why }); return; }
      case 'emit': r.S.setEmit(u, !!m.on); J(r, 'cmd', { who: c.name, cmd: 'emit', u: u.S.short, on: !!m.on }); return;
      case 'method': if (m.m === '3t' || m.m === 'half') u.method = m.m; return;
      case 'aim': if (Array.isArray(m.d) && m.d.length === 3 && m.d.every(Number.isFinite)) { u.aimDir.set(m.d[0], m.d[1], m.d[2]).normalize(); u.gunFire = !!m.f; } return;
    }
  }
  return {
    connect,
    stats: () => ({ online: clients.size, rooms: rooms.size, searching: searching() }),
    _rooms: rooms,
  };
}
