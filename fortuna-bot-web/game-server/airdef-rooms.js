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
import { AG, SAM, LOADOUTS, DEFENSE, loadoutRole } from '../games/airdef/arsenal.js?v=20260930m';
import { makeCraft, fwdOf, setGround } from '../games/drone/sim/core.js?v=20260930m';
import * as O from '../games/airdef/sim/online.js?v=20260930m';
import { cmOf, cmKey } from '../games/airdef/sim/cm.js?v=20261026b';
import { createMulti } from './airdef-multi.js';
import { adProgress, realDeny, loadoutIds, samIds, quickEra } from './airdef-own.js';
import { flightModel, loadOf } from '../games/airdef/sim/flight.js?v=20261022d';
import { initDamage, hitZones, dmgPack, burnRate } from '../games/airdef/sim/damage.js?v=20261022d';
import { buildWinter } from '../games/airdef/map-winter.js?v=20261022d';
import { battleParts } from '../games/airdef/rating.js?v=20261026b';

const city = buildCity(1); setGround(city.groundH); // город один для всех комнат (как у клиентов: seed 1), только чтение
const winter = buildWinter(1); // «Мульти-волна» — зимняя горная долина «Северный рубеж» (как у клиентов: seed 1)
const clock = () => performance.now() / 1000;
const DT = 1 / O.TICK_HZ, SNAP_EVERY = Math.round(O.TICK_HZ / O.SNAP_HZ);
// AD_FAST=1 — для автопроверки (game-server/airdef-full.js): короткие фазы, всё остальное как в бою
const FAST = (() => { try { return Deno.env.get('AD_FAST') === '1'; } catch (_) { return false; } })();
const QUEUE_BOTS_T = FAST ? 4 : O.QUEUE_BOTS_T, QUEUE_EXTRA_T = FAST ? 2 : O.QUEUE_EXTRA_T;
const PLAN_T = FAST ? 3 : O.PLAN_T, WAVE_T = FAST ? 45 : O.WAVE_T, DEBRIEF_T = FAST ? 1 : O.DEBRIEF_T, RESULTS_T = FAST ? 3 : O.RESULTS_T;
const MSG_MAX = 4096, MSG_RATE = 120, MSG_KILL = 600, ROOMS_MAX = 200;
const AFK_T = 4;              // лётчик молчит дольше — его самолёт ведёт ИИ, пока игра не попросит его назад ('retake')
const LOBBY_HOLD_T = 30;      // в лобби связь пропала (перезагрузка под карту комнаты, обрыв) — место ждёт, потом игрок выбывает
const DEAD_T = 9;             // от игры ничего (даже пинга раз в 2 с) дольше — соединение мёртвое: закрываем, место ждёт переподключения
const EXTRAP_MAX = 0.3;       // прокси между состояниями летит по прямой не дольше, с
const REL_CD = 0.25, CM_CD = 0.3;
const LAST_T = 2.5;           // после последней волны — итоги боя через, с (раньше ждали полный разбор волны и картинка стояла)
const BOT_NAMES = ['Беркут', 'Кречет', 'Сапсан', 'Ястреб', 'Гроза', 'Буран', 'Вихрь', 'Шквал', 'Тайфун', 'Орлан', 'Филин', 'Гранит']; // позывные ботов
const r1 = (v) => Math.round(v * 10) / 10;
const V = () => new THREE.Vector3();
const opp = (s) => (s === 'east' ? 'west' : 'east');

export function createAdRooms({ log = () => {}, auth, sign = async () => null, seal = async () => null, journal = () => {} }) {
  const J = (r, ev, d = {}) => journal('ad_' + ev, r ? { room: r.code, mode: r.mode, st: r.state, wave: r.wave, ...d } : d);
  const rooms = new Map(), clients = new Set();
  const queues = { arcade: [], real: [] };   // [{ c, role, t }]
  const goAt = { arcade: 0, real: 0 };        // набралось 2 на 2 — когда собирать комнату
  const mqueues = { arcade: [], real: [] }, mgoAt = { arcade: 0, real: 0 }; // «Мульти-волна»: своя очередь (роль не нужна — оба раунда)
  let nextId = 1;
  // отказ игроку — с записью в журнал (что просил, почему нельзя)
  const deny = (c, msg, cmd) => { send(c, { t: 'deny', msg }); J(c.room, 'deny', { who: c.name, cmd, msg }); };
  const send = (c, msg) => { try { if (c.ws && c.ws.readyState === 1) c.ws.send(JSON.stringify(msg)); } catch (_) { /* закрылся */ } };
  const bcast = (r, msg, filter = null) => { const s = JSON.stringify(msg); for (const p of r.players.values()) if (p.ws && (!filter || filter(p))) try { if (p.ws.readyState === 1) p.ws.send(s); } catch (_) { /* закрылся */ } };
  const team = (r, t) => [...r.players.values()].filter((p) => p.team === t);
  const humans = (r) => [...r.players.values()].filter((p) => !p.bot);
  const teamsOf = (r) => (r.kind === 'multi' ? ['east', 'west'] : ['air', 'pvo']); // «Мульти-волна» — восток и запад (оба раунда)
  let MU = null; // «Мульти-волна» (airdef-multi.js) — после sendRoom/closeRoom

  // ── вид комнаты (выбор связок авиации видят только союзники) ──
  const view = (r, me) => ({
    t: 'room', code: r.code, mode: r.mode, size: r.size, era: r.era, sideAir: r.sideAir, host: r.host, quick: !!r.quick, state: r.state, wave: r.wave,
    left: r.phaseT ? Math.max(0, Math.round(r.phaseT - r.t)) : null, valueK: r.valueK || 0, fill: !!r.fill, lead: r.lead || null,
    ...(r.kind === 'multi' && MU ? MU.viewExtra(r, me) : {}),
    players: [...r.players.values()].map((p) => ({ id: p.id, name: p.name, team: p.team, bot: !!p.bot, ready: !!p.ready, away: !p.bot && !p.ws, spent: !me || p.team === me.team ? p.spent || 0 : null,
      budget: !me || p.team === me.team ? p.budget : null, choice: (!me || p.team === me.team) && p.choice !== null && p.choice !== undefined ? p.choice : null,
      kills: p.kills || 0, deaths: p.deaths || 0, score: Math.round(p.score || 0), lives: p.lives ?? null })),
  });
  const sendRoom = (r) => { for (const p of r.players.values()) if (p.ws) send(p, view(r, p)); };

  // ═════════════ Комната ═════════════
  function newRoom(host, o) {
    if (rooms.size >= ROOMS_MAX) return null;
    const code = O.makeCode(new Set(rooms.keys()));
    const r = { code, mode: O.AD_MODES.includes(o.mode) ? o.mode : 'arcade', size: O.AD_SIZES.includes(+o.size) ? +o.size : 2, era: [1, 2, 3, 4].includes(+o.era) ? +o.era : o.kind === 'multi' ? 2 + Math.floor(Math.random() * 3) : 1 + Math.floor(Math.random() * 4), // у «Мульти-волны» era — скрытый уровень ботов (игрокам не показывается, не выбирается), не ниже II
      sideAir: o.sideAir === 'east' || o.sideAir === 'west' ? o.sideAir : Math.random() < 0.5 ? 'east' : 'west', host: host ? host.id : 0, quick: !!o.quick, fill: o.fill !== false,
      players: new Map(), state: 'lobby', t: 0, phaseT: 0, wave: 0, tick: 0, S: null, raid: null, targets: [], valueK: 0, events: [], kind: o.kind === 'multi' ? 'multi' : 'air' };
    if (r.kind === 'multi' && r.era < 2) r.era = 2;
    rooms.set(code, r);
    J(r, 'room', { size: r.size, era: r.era });
    return r;
  }
  function joinRoom(r, c, wantTeam) {
    const same = c.pid && [...r.players.values()].find((p) => !p.bot && p !== c && p.pid === c.pid);
    if (same) return takeSeat(r, same, c); // вход по коду тем же аккаунтом (связь оборвалась) — своё место, а не новое в чужой команде
    leaveRoom(c);
    const cap = (t) => team(r, t).length < r.size;
    // бот на месте нужной команды уступает человеку
    const [T1, T2] = teamsOf(r);
    let t = wantTeam === T1 || wantTeam === T2 ? wantTeam : team(r, T1).length <= team(r, T2).length ? T1 : T2;
    if (!cap(t)) { const bot = team(r, t).find((p) => p.bot); if (bot) dropPlayer(r, bot); else t = t === T1 ? T2 : T1; }
    if (!cap(t)) { const bot = team(r, t).find((p) => p.bot); if (bot) dropPlayer(r, bot); else return send(c, { t: 'err', msg: 'Комната заполнена' }); }
    Object.assign(c, { room: r, team: t, ready: !!r.quick, bot: false, budget: O.BUDGET0[t] || 0, choice: null, kills: 0, deaths: 0, score: 0, lives: null, units: 0, plan: null, spent: 0 });
    r.players.set(c.id, c);
    if (r.state !== 'lobby') { if (r.kind === 'multi') MU.resume(r, c); else { c.budget = r.wave > 1 ? Math.round(O.BUDGET0[t] * 0.8) : O.BUDGET0[t]; sendStart(r, c); sendState(r, c); } }
    sendRoom(r); J(r, 'join', { who: c.name, team: t });
  }
  function addBot(r, t) {
    if (team(r, t).length >= r.size) return;
    const used = new Set([...r.players.values()].map((p) => p.name));
    const name = BOT_NAMES.find((n) => !used.has(n)) || 'Бот';
    const b = { id: nextId++, name, bot: true, team: t, ready: true, budget: O.BUDGET0[t] || 0, choice: null, kills: 0, deaths: 0, score: 0, lives: null, ws: null, plan: null, spent: 0 };
    r.players.set(b.id, b);
    if (r.state === 'plan' && r.kind !== 'multi') botPlan(r, b);
    sendRoom(r);
  }
  function dropPlayer(r, p) {
    r.players.delete(p.id);
    if (r.kind === 'multi') { if (MU) MU.drop(r, p); return; }
    if (r.S) { for (const u of r.S.units.filter((u) => u.owner === p.id)) { if (r.state === 'lobby') r.S.removeUnit(u); else u.owner = 0; } } // комплексы ушедшего остаются ИИ-расчётам
    if (p.craft) { toAI(r, p, 'left'); }
  }
  function leaveRoom(c) {
    const r = c.room; if (!r) return;
    c.room = null; dropPlayer(r, c);
    if (!humans(r).length) { closeRoom(r); return; }
    if (r.host === c.id) r.host = humans(r)[0].id;
    sendRoom(r); checkBack(r);
  }
  function closeRoom(r) { rooms.delete(r.code); J(r, 'closed'); }
  // тот же аккаунт снова в сети (обрыв связи, вход по коду, вторая вкладка): занимает своё место — команда, комплексы, счёт,
  // самолёт. Старое соединение отключаем (его обработчики больше ничего не трогают: room = null)
  function takeSeat(r, old, c) {
    if (c.room && c.room !== r) leaveRoom(c);
    const ws = c.ws, ows = old.ws, msgN = c.msgN, msgT = c.msgT;
    clients.delete(old); old.ws = null; old.room = null;
    if (ows && ows !== ws) try { ows.close(); } catch (_) { /* уже */ }
    Object.assign(c, old, { ws, msgN, msgT, lastMsg: clock(), back: false, goneT: 0 }); c.room = r; r.players.set(c.id, c); clients.add(c); // прежний id — комплексы и счёт остаются за игроком
    send(c, { t: 'welcome', id: c.id, name: c.name, resumed: 1 });
    if (r.state !== 'lobby' && r.state !== 'end') { if (r.kind === 'multi') MU.resume(r, c); else { sendStart(r, c); sendState(r, c); } }
    send(c, view(r, c)); sendRoom(r);
    J(r, 'resume', { who: c.name, team: c.team, state: r.state });
  }
  // начало боя «Вылет и оборона» — входящему посреди боя (без него игра не знает, что бой идёт)
  const sendStart = (r, c) => send(c, { t: 'start', era: r.era, sideAir: r.sideAir, mode: r.mode, targets: r.targets.map((o) => o.id), waves: O.WAVES });
  // после боя «В КОМНАТУ» нажали все, кто на связи, — лобби сразу, не дожидаясь конца показа итогов
  function checkBack(r) { if (r.state === 'end' && humans(r).some((p) => p.ws) && humans(r).filter((p) => p.ws).every((p) => p.back)) toLobby(r); }
  // после итогов боя комната снова в лобби с теми же игроками: хост меняет режим, формат, эпоху, сторону, игру — и снова «Готов».
  // Ушедшие (без связи) — долой; хоста нет — хост первый человек; быстрый бой становится своей комнатой
  function toLobby(r) {
    for (const p of [...r.players.values()]) if (!p.bot && !p.ws) { p.room = null; r.players.delete(p.id); }
    if (!humans(r).length) { closeRoom(r); return; }
    if (!r.players.has(r.host) || r.players.get(r.host).bot) r.host = humans(r)[0].id;
    Object.assign(r, { quick: false, state: 'lobby', t: 0, phaseT: 0, wave: 0, tick: 0, S: null, raid: null, targets: [], valueK: 0, events: [], zone: null, humanCraft: null, lead: null,
      E: null, round: 0, atk: null, scores: null, last: false, lastRes: null, waveRes: null });
    for (const p of r.players.values()) Object.assign(p, { back: false, ready: !!p.bot, budget: O.BUDGET0[p.team] || 0, choice: null, paid: null, kills: 0, deaths: 0, score: 0, lives: null, craft: null, plane: null,
      op: null, plan: null, spent: 0, E: null, out: false, units: 0 });
    sendRoom(r); J(r, 'lobby', { players: humans(r).map((p) => p.name) });
  }
  // смена игры в лобби: «Вылет и оборона» (авиация / ПВО) ↔ «Мульти-волна» (восток / запад) — команды по порядку
  function setKind(r, kind) {
    if (kind === r.kind) return;
    const from = teamsOf(r); r.kind = kind; const to = teamsOf(r);
    for (const p of r.players.values()) { p.team = to[Math.max(0, from.indexOf(p.team))]; p.budget = O.BUDGET0[p.team] || 0; }
    if (kind === 'multi' && r.era < 2) r.era = 2; // у «Мульти-волны» era — скрытый уровень ботов, не ниже II
  }

  // ── старт: все люди «Готов», в каждой команде кто-то есть (пусто — боты, если включено) ──
  function tryStart(r) {
    if (r.state !== 'lobby') return;
    const hs = humans(r);
    if (!hs.length || !hs.every((p) => p.ready && p.ws)) return;
    const [T1, T2] = teamsOf(r);
    if (r.fill) for (const t of [T1, T2]) while (team(r, t).length < r.size) addBot(r, t); // «боты» — все пустые места комнаты
    if (!team(r, T1).length || !team(r, T2).length) return;
    if (r.kind === 'multi') MU.start(r); else startBattle(r);
  }
  function startBattle(r) {
    r.S = createStrike({ city, rnd: Math.random, mode: () => MODES[r.mode], game: 'air', aircraft: () => r.air, laserSpot: (a) => a.laser || null, night: 0,
      reloadK: () => (r.state === 'play' && r.waveRes ? O.reloadKOf(r.t, r.waveRes.radarKills) : 1), // две фазы волны: подавленная ПВО перезаряжается дольше
      hurt: (a, dmg, by, from) => hurtAir(r, a, dmg, by, from), spawnDecoy: (a, key, aim) => announce(r, r.raid.spawnDecoy(a, key, aim)), fx: strikeFx(r) });
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
    r.wave++; r.state = 'plan'; r.t = 0; r.phaseT = PLAN_T; r.waveRes = { downs: 0, downsSead: 0, unitKills: 0, radarKills: 0, value0K: r.valueK };
    for (const p of r.players.values()) {
      p.ready = !!p.bot; p.choice = null; p.paid = null; p.craft = null; p.plane = null; p.lives = p.team === 'air' ? O.RESPAWNS[r.wave - 1] + 1 + (r.lead === 'pvo' ? 1 : 0) : null; p.out = false; p.respT = 0; // отстающей авиации — +1 вылет; out/respT — заново каждую волну (комментарий раньше съедал этот код: ушедший за край не возрождался)
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
    r.zone = O.newZone(Math.random); // зона пополнения — новое место на каждую волну
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
      a.load = L.items.map(([k, n]) => ({ key: k, n })); a.owner = p.id; a.plane = L.plane; a.cmFlare = cmOf(a.plane, r.sideAir).flare ? a.cmFlare || 30 : 0; // ЛТЦ — по машине бота (cmKey берёт plane), а не по raidPlane
      p.plane = a; announce(r, a);
      return;
    }
    humanCraft(r, p, L.plane, L.items.map(([k, n]) => ({ key: k, n })), x, y, z, yaw, 240, O.MAX_HP);
    p.cm = { flare: MODES[r.mode].cm, chaff: MODES[r.mode].cm }; p.stT = r.t;
    p.zFuel = O.ZONE.FUEL; p.zAmmo = O.ZONE.AMMO; p.fuel = 1; p.zT = 0; // зона пополнения: на этот вылет — 1 раз топливо, 2 раза боекомплект
    sendSpawn(r, p);
  }
  function humanCraft(r, p, plane, load, x, y, z, yaw, speed, hp) {
    const ST = STRIKERS[r.sideAir];
    const a = makeCraft({ ...ST, id: p.id, human: true, side: r.sideAir, hp, hpMax: O.MAX_HP, rcs: ST.rcs, speed, thr: 0.8, owner: p.id, plane });
    a.pos.set(x, y, z); a.yaw = yaw; a.pitch = 0; a.roll = 0; fwdOf(a, a.vel).multiplyScalar(a.speed);
    a.jam = Math.max(0, ...load.map((l) => AG[l.key].jam || 0));
    // свои ТТХ самолёта (когда его ведёт ИИ сервера — после обрыва связи): масса, подвески, режим комнаты
    a.fm = flightModel(plane || (r.sideAir === 'east' ? 'su30' : 'f16'), { ind: MODES[r.mode].ind }); a.fuel = 1;
    if (a.fm) { const Lw = loadOf(a.fm.key, load.map((l) => ({ mass: (AG[l.key] || {}).mass || 0, n: l.n }))); a.payload = Lw.payload; a.dragK = Lw.dragK; }
    initDamage(a); // зоны повреждений: считает сервер, игроку — в событии 'hp'
    p.craft = a; p.load = load; p.cap = null; p.relT = 0; p.relTok = 2; p.cmT = 0; p.lastSt = clock();
    r.humanCraft.set(p.id, a); a.load = p.load; announce(r, a);
    return a;
  }
  // back — управление вернулось игроку (связь восстановилась): с того же места, скорости и прочности
  const sendSpawn = (r, p, back) => { const a = p.craft; bcast(r, { t: 'spawn', id: p.id, s: [r1(a.pos.x), r1(a.pos.y), r1(a.pos.z), Math.round(a.yaw * 1000) / 1000], lives: p.lives, load: p.load, cm: p.cm, plane: a.plane, choice: p.choice, back: back ? 1 : undefined, v: back ? Math.round(a.speed) : undefined, hp: back ? Math.round(a.hp) : undefined }); };
  // самолёт, который вёл ИИ (связь пропадала), — снова игроку; ИИ-двойник тихо исчезает (без взрыва)
  function retake(r, p) {
    if (r.state !== 'play' || !p.ws) return;
    if (p.craft && !p.craft.dead) { p.lastSt = clock(); sendSpawn(r, p, true); return; } // самолёт ещё у игрока (вернулся быстро) — только напомнить где он
    const b = p.plane; if (!b || b.dead || b.out || !p.ai || b.fromHuman !== p.id) return;
    p.plane = null; p.ai = false; b.out = true;
    humanCraft(r, p, b.plane, (b.load || []).map((l) => ({ key: l.key, n: l.n, rs: l.rs })) /* rs — начатый блок НАР (ИИ-двойник пускал залпы) */, b.pos.x, b.pos.y, b.pos.z, b.yaw, Math.max(150, b.speed), b.hp);
    sendSpawn(r, p, true);
    J(r, 'to_human', { who: p.name });
  }
  // самолёт человека без связи (или ушедшего) — дальше его ведёт ИИ с тем, что осталось на подвеске
  function toAI(r, p, why) {
    const a = p.craft; if (!a || a.dead) { p.craft = null; return; }
    r.humanCraft.delete(p.id); p.craft = null;
    const tgt = r.targets[0];
    const b = r.raid.spawn('bomber', tgt, 0, 0);
    b.pos.copy(a.pos); b.yaw = a.yaw; b.pitch = a.pitch; b.speed = a.speed; fwdOf(b, b.vel).multiplyScalar(b.speed); b.hp = a.hp; b.hpMax = O.MAX_HP;
    b.load = (p.load || []).filter((l) => l.n > 0).map((l) => ({ ...l })); b.owner = p.id; b.plane = a.plane; b.fromHuman = p.id;
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
    const res = { wave: r.wave, why, valueK: Math.max(0, r.valueK - r.waveRes.value0K), totalK: r.valueK, downs: r.waveRes.downs, downsSead: r.waveRes.downsSead, unitKills: r.waveRes.unitKills, radarKills: r.waveRes.radarKills };
    const airWins = r.valueK >= O.WIN_K, last = r.wave >= O.WAVES || airWins;
    r.state = 'debrief'; r.t = 0; r.phaseT = last ? Math.min(DEBRIEF_T, LAST_T) : DEBRIEF_T; r.last = last; r.lastRes = res; // последняя волна — сразу к итогам боя
    // бюджеты на следующую волну: проигрывающая сторона (по ходу боя) получает прибавку
    const airLosing = r.valueK < O.WIN_K * r.wave / O.WAVES;
    r.lead = airLosing ? 'pvo' : 'air'; res.lead = r.lead; // ведущая сторона платит больше в следующей волне (O.LEAD_K)
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
    const hm = humans(r).length * 2 > r.players.size ? 1 : 0, deadT = Math.round((r.valueK || 0) * (r.targets || []).length); // разрушено целей (по доле ценности)
    for (const p of humans(r)) {
      // ev — события для прокачки (airdef-claim → опыт и серебро): длительность боя, сбитые / уничтоженные комплексы, доля разрушенных целей команды
      const ev = { min: Math.round((Date.now() - (r.startedAt || Date.now())) / 6000) / 10, ...(p.team === 'air' ? { sams: p.kills || 0, targets: Array(Math.min(10, Math.round(deadT / Math.max(1, team(r, 'air').filter((q) => !q.bot).length || 1)))).fill(1) } : { downs: p.kills || 0 }) };
      // рейтинг (Mark 2026-10-25, games/airdef/rating.js): только быстрый бой (своя комната рейтинга не даёт — решение Mark); части боя —
      // итог, вклад (доля очков в команде), боты у соперников, режим, ранг (эпоха). ope — id соперников-людей, запечатанные (seal в server.js):
      // клиент итог читает, а голые id чужих аккаунтов — пропуска к ним; силу соперников по таблице сезона досчитает airdef-claim
      const opp = [...r.players.values()].filter((q) => q.team !== p.team);
      const rt = r.quick ? battleParts({ win: p.team === winner ? 1 : 0, score: p.score || 0, kills: p.kills || 0, teamScores: team(r, p.team).map((q) => q.score || 0), oppHumans: opp.filter((q) => !q.bot).length, oppTotal: opp.length, mode: r.mode, era: r.era }) : null;
      const ope = await seal(opp.filter((q) => !q.bot && q.pid && !String(q.pid).startsWith('test-')).map((q) => q.pid));
      const res = { g: 'airdef', m: `${r.code}-${r.startedAt}`, p: p.pid, mode: r.mode, team: p.team, w: p.team === winner ? 1 : 0, k: p.kills || 0, s: Math.round(p.score || 0), hm, ev, ...(rt ? { rt } : {}), ope, exp: Math.floor(Date.now() / 1000) + 3600 };
      send(p, { t: 'end', winner, valueK: r.valueK, players: list, result: p.pid && !String(p.pid).startsWith('test-') ? await sign(res) : null });
    }
    J(r, 'end', { winner, valueK: r.valueK });
  }

  // ═════════════ Боты: расстановка и выбор связки ═════════════
  const afford = (r, p) => LOADOUTS[r.era].map((L, i) => [L, i]).filter(([L]) => L.side === r.sideAir && O.netOk(L) && O.loadoutCostFor(L, r.lead) <= p.budget); // вертолёты — пока не в онлайне; НАР — с 2026-10-22 (залп одним сообщением 'rel' с n)
  // НАР: с 2026-10-22 самолётный ИИ (sim/raid.js) пускает их залпами с пикирования — боты берут такие связки, ИИ-двойник человека — с ними
  // подвески остальных лётчиков команды (для лимита охотников)
  const othersL = (r, p) => team(r, 'air').filter((q) => q !== p).map((q) => (q.choice !== null && q.choice !== undefined ? LOADOUTS[r.era][q.choice] : null));
  function autoChoice(r, p) {
    // в пределах лимита охотников; бот берёт недостающую роль: нет штурмовика — штурмовку, нет охотника — охоту (если лимит позволяет)
    const others = othersL(r, p), nAir = team(r, 'air').length, ok = ([L]) => !O.roleDeny(L, others, nAir);
    let list = afford(r, p).filter(ok).filter(([L]) => p.bot || !realDeny(r.mode, p, loadoutIds(L))).sort((a, b) => O.loadoutCostFor(a[0], r.lead) - O.loadoutCostFor(b[0], r.lead));
    if (p.bot && list.length) {
      const has = (role) => others.some((x) => x && loadoutRole(x) === role), want = !has('strike') ? 'strike' : !has('sead') ? 'sead' : null;
      const w = want && list.filter(([L]) => loadoutRole(L) === want); if (w && w.length) list = w;
    }
    const pick = p.bot && list.length ? list[Math.floor(Math.random() * list.length)] : list[0];
    const all = LOADOUTS[r.era].map((L, i) => [L, i]).filter(([L]) => L.side === r.sideAir && O.netOk(L)).filter(ok).sort((a, b) => O.loadoutCost(a[0]) - O.loadoutCost(b[0]));
    const [L, i] = pick || all[0] || LOADOUTS[r.era].map((q, j) => [q, j]).find(([q]) => q.side === r.sideAir && O.netOk(q));
    p.choice = i; p.paid = O.loadoutCostFor(L, r.lead); p.budget = Math.max(0, p.budget - p.paid);
  }
  function botPlan(r, p) {
    if (p.team === 'air') { if (p.choice === null) autoChoice(r, p); return; }
    const side = opp(r.sideAir), list = (DEFENSE[side][r.era] || []).map(([k]) => k).filter((k) => O.samOk(k, r.era, side));
    const order = [...list.filter((k) => O.samClass(k) === 'top'), ...list.filter((k) => O.samClass(k) === 'mid'), ...list.filter((k) => O.samClass(k) === 'near')];
    for (let guard = 0; guard < 12; guard++) {
      const k = order.find((k) => O.samCostFor(k, r.lead) <= p.budget && canClass(r, p, k)); if (!k) break;
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
    if (O.samCostFor(k, r.lead) > p.budget) return 'Не хватает очков';
    if (!canClass(r, p, k)) return O.samClass(k) === 'top' ? 'На первой волне — один дальний комплекс' : 'На первой волне — один комплекс средней дальности';
    if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > CITY.HALF - 1500 || Math.abs(z) > CITY.HALF - 1500) return 'Вне карты';
    const Sx = SAM[k], man = Sx.type === 'ir' && Sx.hp <= 15;
    if (roof) { if (!man) return 'На крышу — только ПЗРК'; const bi = buildingAt(city, x, z); if (bi < 0 || !roofOk(city, bi)) return 'Сюда на крышу нельзя'; }
    else if (!freeGround(city, x, z, man ? 3 : 9)) return 'Место занято — нужна свободная земля'; // как у клиента (defense.js placeOk)
    const u = r.S.addUnit(k, x, z, { roof: !!roof, skill: 0.75, yaw: Math.random() * 6.28 });
    u.owner = p.id; u.paid = O.samCostFor(k, r.lead); p.budget -= u.paid;
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
      objectDestroyed: (o, by, owner) => { push(r, ['od', o.id]); updValue(r); const p = airOwner(r, owner); if (p) p.score += o.value * (r.targets.some((q) => q.id === o.id) ? 2 : 0.5); killLog(r, p ? p.name : 'Авиация', o.name, by, 'air', 'pvo', owner && owner.plane ? 'p:' + owner.plane : ''); },
      objectHit: () => updValue(r),
      unitDestroyed: (u, by, owner) => { push(r, ['ud', u.id]); r.waveRes.unitKills++; if (u.S.radar) r.waveRes.radarKills++; const p = airOwner(r, owner); if (p) { p.kills++; p.score += 40; } const v = r.players.get(u.owner); killLog(r, p ? p.name : 'Авиация', v ? v.name : 'ПВО', by, 'air', 'pvo', owner && owner.plane ? 'p:' + owner.plane : '', 'u:' + u.key); },
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
  // журнал сбитий: кто, кого, чем; команды обоих (свои у игры — синим, чужие — красным) и техника под ником: «p:самолёт» / «u:комплекс»
  const killLog = (r, who, whom, by, wt = '', mt = '', wv = '', mv = '') => push(r, ['kl', String(who || '?').slice(0, 24), String(whom || '?').slice(0, 40), String(by || '').slice(0, 24), wt, mt, String(wv).slice(0, 24), String(mv).slice(0, 24)]);
  function updValue(r) {
    let v = 0; for (const o of r.targets) { const S = r.S.objects.find((q) => q.id === o.id); v += o.value * (S.dead ? 1 : Math.min(1, S.dmgTaken / S.hpMax)); }
    r.valueK = v / r.value0;
  }
  // урон самолёту: люди — свой корпус, боты/ИИ — через налёт; кто сбил — тому очки
  // урон самолёту: корпус и зоны (sim/damage.js, from — точка подрыва); всем — прочность и зоны (отрыв частей, дым, пожар)
  function hurtAir(r, a, dmg, by, from = null) {
    const k = MODES[r.mode].dmgTaken;
    if (a.human) {
      if (a.dead) return;
      a.hp -= dmg * k; hitZones(a, dmg * k, from); push(r, ['hp', a.id, Math.max(0, Math.round(a.hp)), by, dmgPack(a)]);
      if (a.hp <= 0) { a.dead = true; push(r, ['dn', a.id]); onAirDown(r, a, by); }
      return;
    }
    a.lastBy = by; r.raid.hurt(a, dmg * k, from);
    if (a.dz && !a.dead) push(r, ['hp', a.id, Math.max(0, Math.round(a.hp)), by, dmgPack(a)]);
  }
  function onAirDown(r, a, by) {
    if (a.role === 'decoy') return;
    r.waveRes.downs++;
    const owner = r.players.get(a.owner || a.fromHuman || 0);
    { const L = owner && O.bundleOf(r.era, r.sideAir, owner.choice); if (L ? loadoutRole(L) === 'sead' : a.role === 'sead') r.waveRes.downsSead++; } // охотник за ПВО
    if (owner) { owner.deaths++; if (owner.craft === a) { r.humanCraft.delete(owner.id); owner.craft = null; } if (owner.plane === a) owner.plane = null; owner.respT = r.t + O.RESPAWN_T; }
    // сбитие — ПВО: очки владельцу комплекса, который вёл цель (или всей команде поровну, если неизвестно)
    const shooter = r.S.units.find((u) => !u.dead && u.track === a) || null;
    const sp = shooter && r.players.get(shooter.owner);
    if (sp) { sp.kills++; sp.score += 50; } else { const pv = team(r, 'pvo'); for (const p of pv) p.score += 50 / pv.length; }
    killLog(r, sp ? sp.name : by === 'ЗЕМЛЯ' ? 'Земля' : 'ПВО', owner ? owner.name : 'Самолёт', by, by === 'ЗЕМЛЯ' && !sp ? '' : 'pvo', 'air', shooter ? 'u:' + shooter.key : '', a.plane ? 'p:' + a.plane : '');
    J(r, 'down', { who: owner ? owner.name : '?', by });
  }

  // ═════════════ Такт ═════════════
  function step(r, dt) {
    r.t += dt;
    // пожар на борту и разрушенный хвост у самолётов игроков: корпус тает (раз в секунду — всем)
    if (r.humanCraft) for (const a of r.humanCraft.values()) if (burnRate(a) && !a.dead) {
      a.hp -= burnRate(a) * dt; a.fireT = (a.fireT || 0) + dt;
      if (a.hp <= 0) { a.hp = 0; a.dead = true; push(r, ['hp', a.id, 0, 'пожар', dmgPack(a)]); push(r, ['dn', a.id]); onAirDown(r, a, a.lastBy || 'пожар'); }
      else if (a.fireT > 1) { a.fireT = 0; push(r, ['hp', a.id, Math.round(a.hp), null, dmgPack(a)]); }
    }
    if (r.state !== 'lobby' && Math.floor(r.t) !== r.sec) { r.sec = Math.floor(r.t); sendRoom(r); } // таймер фазы — раз в секунду
    if (r.kind === 'multi') { if (r.state !== 'lobby') MU.step(r, dt); return; }
    if (r.state === 'plan') { if (r.t >= r.phaseT || team(r, 'air').concat(team(r, 'pvo')).every((p) => p.ready || !p.ws && !p.bot)) startWave(r); return; }
    if (r.state === 'debrief') { if (r.t >= r.phaseT) { if (r.last) endBattle(r); else nextWave(r); } return; }
    if (r.state === 'end') { if (r.t >= r.phaseT) toLobby(r); return; } // итоги показаны — снова лобби той же комнаты
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
    // зона пополнения: лётчики-люди (боты — нет); кто пробыл 12 с — топливо и/или боекомплект с ловушками
    if (!r.zone) r.zone = O.newZone(Math.random);
    O.zoneStep(r.zone, team(r, 'air').filter((p) => p.craft && !p.craft.dead).map((p) => { p.pos = p.craft.pos; return p; }), dt, Math.random,
      (p) => {
        const L = O.bundleOf(r.era, r.sideAir, p.choice), cm = MODES[r.mode].cm;
        const part = (l) => AG[l.key].kind === 'rocket' && l.rs !== undefined && l.rs < Math.ceil(AG[l.key].load / AG[l.key].salvo); // начатый блок НАР
        const spent = !!L && (L.items.some(([k, n]) => { const l = (p.load || []).find((q) => q.key === k) || { key: k, n: 0 }; return l.n < Math.min(n, p.cap?.[k] ?? n) || part(l); }) || !p.cm || p.cm.flare < cm * 0.5 || p.cm.chaff < cm * 0.5);
        return { fuel: (p.zFuel || 0) > 0 && (p.fuel ?? 1) < 0.9, ammo: (p.zAmmo || 0) > 0 && spent };
      },
      (p, n) => {
        if (n.fuel) { p.zFuel--; p.fuel = 1; }
        if (n.ammo) { p.zAmmo--; const L = O.bundleOf(r.era, r.sideAir, p.choice); p.load = L.items.map(([k, q]) => ({ key: k, n: Math.min(q, p.cap?.[k] ?? q) })); p.craft.load = p.load; p.cm = { flare: MODES[r.mode].cm, chaff: MODES[r.mode].cm }; }
        push(r, ['zr', p.id, n.fuel ? 1 : 0, n.ammo ? 1 : 0, p.zFuel, p.zAmmo, (p.load || []).map((l) => l.key + ':' + l.n).join(','), p.cm ? p.cm.flare : 0, p.cm ? p.cm.chaff : 0]);
        J(r, 'resupply', { who: p.name, fuel: n.fuel ? 1 : 0, ammo: n.ammo ? 1 : 0, left: [p.zFuel, p.zAmmo] });
      });
    for (const a of r.raid.planes) if (a.out && a.owner) { const p = r.players.get(a.owner); if (p && p.plane === a) { p.plane = null; p.out = true; } }
    // конец волны: ≥ 75 % ценности — сразу; авиации в воздухе нет и не будет; время
    if (r.valueK >= O.WIN_K) return endWave(r, 'value');
    const inAir = team(r, 'air').some((p) => (p.craft && !p.craft.dead) || (p.plane && !p.plane.dead && !p.plane.out) || (!p.out && p.lives > 0 && (p.bot || p.ws)));
    if (!inAir && !r.S.wpns.some((w) => !w.dead)) return endWave(r, 'air_done'); // ЗУР, которым уже некого ловить, волну не держат
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
      W: r.S.wpns.filter((w) => !w.dead).map(O.packW), V: Math.round(r.valueK * 1000) / 1000, e: ev.length ? ev : undefined, Z: r.zone ? O.packZ(r.zone) : undefined };
    bcast(r, msg);
  }
  // полное состояние входящему / новой волне: комплексы, объекты, бюджеты
  function sendState(r, only) {
    if (!r.S) return;
    const msg = { t: 'state', era: r.era, sideAir: r.sideAir, mode: r.mode, wave: r.wave, targets: r.targets.map((o) => o.id),
      units: r.S.units.map((u) => [u.id, u.key, r1(u.pos.x), r1(u.pos.z), u.roof ? 1 : 0, u.owner || 0, Math.round(u.yaw * 1000) / 1000, u.dead ? 1 : 0, only && only.team === 'pvo' && u.tgt ? [...u.tgt] : 0]), // последнее — фильтр целей (вернувшемуся ПВО; лётчикам не выдаём)
      objects: r.S.objects.filter((o) => o.dmgTaken > 0 || o.dead).map((o) => [o.id, Math.round(o.hp), o.dead ? 1 : 0]) };
    if (only) send(only, msg); else bcast(r, msg);
  }
  MU = createMulti({ city: winter, send, bcast, team, humans, J, sign, seal, clock, sendRoom, closeRoom, toLobby, FAST });
  // нагрузка: время такта всех комнат (среднее и худшее за минуту) — в /health; бюджет такта — 1000 × DT мс
  const load = { ema: 0, max: 0, maxPrev: 0, maxT: 0 };
  // мёртвые соединения (телефон ушёл из сети, приложение свернули): закрываем — место ждёт переподключения, самолёт ведёт ИИ
  // лобби и итоги: место без связи держим LOBBY_HOLD_T (тот же аккаунт вернётся — takeSeat), потом — долой
  setInterval(() => { const now = clock(); for (const r of [...rooms.values()]) if (r.state === 'lobby' || r.state === 'end') for (const p of humans(r)) if (!p.ws && p.goneT && now - p.goneT > LOBBY_HOLD_T) { p.goneT = 0; if (p.room === r) leaveRoom(p); else { r.players.delete(p.id); if (!humans(r).length) closeRoom(r); else sendRoom(r); } } }, 2000);
  setInterval(() => { const now = clock(); for (const c of [...clients]) if (c.room && c.ws && now - (c.lastMsg || now) > DEAD_T) { J(c.room, 'dead', { who: c.name }); try { c.ws.close(); } catch (_) { /* уже */ } c.ws.onclose && c.ws.onclose(); } }, 2000);
  setInterval(() => {
    const t0 = performance.now();
    for (const r of [...rooms.values()]) { try { step(r, DT); } catch (e) { log('ad: ошибка такта ' + (e && e.stack || e)); J(r, 'error', { msg: String(e && e.message || e) }); } }
    queueStep(); mqueueStep();
    const ms = performance.now() - t0, now = clock(); load.ema += (ms - load.ema) * 0.02; load.max = Math.max(load.max, ms);
    if (now - load.maxT > 60) { load.maxPrev = load.max; load.max = 0; load.maxT = now; }
  }, 1000 * DT);

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
        const pick0 = [...q].sort((a, b) => a.t - b.t).slice(0, Math.max(O.QUEUE_MIN, per) * 2), era = quickEra(mode, pick0.map((e) => e.c));
        const r = newRoom(null, { mode, size: Math.max(O.QUEUE_MIN, per), quick: true, fill: true, ...(era ? { era } : {}) }); if (!r) continue;
        const pick = pick0;
        for (const e of pick.filter((e) => e.role !== 'any')) joinRoom(r, e.c, e.role);
        for (const e of pick.filter((e) => e.role === 'any')) joinRoom(r, e.c, team(r, 'air').length <= team(r, 'pvo').length ? 'air' : 'pvo');
        queues[mode] = queues[mode].filter((e) => !pick.includes(e));
        for (const t of ['air', 'pvo']) while (team(r, t).length < r.size) addBot(r, t);
        startBattle(r);
      } else if (!fits) goAt[mode] = 0;
    }
  }
  // «Мульти-волна»: двое и больше — ждём ещё QUEUE_EXTRA_T (вдруг больше); один дольше QUEUE_BOTS_T — 1 на 1 с ботом
  function mqueueStep() {
    const now = clock();
    for (const mode of O.AD_MODES) {
      const q = mqueues[mode] = mqueues[mode].filter((e) => e.c.ws && e.c.ws.readyState === 1 && !e.c.room);
      if (!q.length) { mgoAt[mode] = 0; continue; }
      const oldest = Math.min(...q.map((e) => e.t)), per = Math.min(6, Math.ceil(q.length / 2));
      if (q.length >= 2 && !mgoAt[mode]) { mgoAt[mode] = now + QUEUE_EXTRA_T; for (const e of q) send(e.c, { t: 'qwait', T: QUEUE_EXTRA_T, n: q.length }); }
      if ((mgoAt[mode] && (now >= mgoAt[mode] || q.length >= 12)) || now - oldest > QUEUE_BOTS_T) {
        mgoAt[mode] = 0;
        const pick0 = [...q].sort((a, b) => a.t - b.t).slice(0, per * 2), era = quickEra(mode, pick0.map((e) => e.c), 2); // уровень ботов комнаты (скрытый) — не выше открытого людям, не ниже II
        const r = newRoom(null, { mode, size: per, quick: true, fill: true, kind: 'multi', ...(era ? { era } : {}) }); if (!r) continue;
        const pick = pick0;
        for (const e of pick) joinRoom(r, e.c, null);
        mqueues[mode] = mqueues[mode].filter((e) => !pick.includes(e));
        for (const t of teamsOf(r)) while (team(r, t).length < r.size) addBot(r, t);
        MU.start(r);
      }
    }
  }
  const searching = () => ({ arcade: queues.arcade.length, real: queues.real.length, marcade: mqueues.arcade.length, mreal: mqueues.real.length });

  // ═════════════ Сообщения ═════════════
  function connect(ws) {
    const c = { id: nextId++, ws, name: null, pid: '', room: null, msgN: 0, msgT: 0 };
    ws.onmessage = (ev) => {
      c.lastMsg = clock();
      if (typeof ev.data !== 'string' || ev.data.length > MSG_MAX) return;
      const s = Math.floor(clock()); if (s !== c.msgT) { c.msgT = s; c.msgN = 0; }
      if (++c.msgN > MSG_KILL) { try { ws.close(); } catch (_) { /* уже */ } return; }
      if (c.msgN > MSG_RATE) return;
      let m; try { m = JSON.parse(ev.data); } catch (_) { return; }
      if (!m || typeof m.t !== 'string') return;
      onMsg(c, m).catch((e) => log('ad: ошибка сообщения ' + (e && e.message || e)));
    };
    ws.onclose = () => {
      if (ws.gone) return; ws.gone = true; // закрываем и сами (мёртвое соединение) — второй раз не разбираем
      clients.delete(c);
      for (const q of [...Object.values(queues), ...Object.values(mqueues)]) { const i = q.findIndex((e) => e.c === c); if (i >= 0) q.splice(i, 1); }
      const r = c.room;
      if (r) { c.ws = null; if (r.state === 'lobby' || r.state === 'end') { c.goneT = clock(); sendRoom(r); } else { if (c.craft) toAI(r, c, 'disconnect'); if (!humans(r).some((p) => p.ws)) closeRoom(r); else sendRoom(r); } }
    };
  }
  async function onMsg(c, m) {
    if (m.t === 'ping') return send(c, { t: 'pong', i: +m.i || 0 }); // клиент меряет задержку и потери (раз в 2 с)
    if (m.t === 'hello') {
      const who = await auth(m); if (!who) return send(c, { t: 'err', msg: 'Не удалось войти: обновите страницу' });
      if (who.needGame) return send(c, { t: 'err', msg: 'Создайте аккаунт игры — новым игрокам прогресс копится только на нём', need_game: true }); // аккаунт сайта без прогресса игры (билет с ng)
      Object.assign(c, { name: who.name, pid: who.pid, adP: adProgress(who.ad) }); clients.add(c); // adP — купленное в прокачке (замки «Реализма»)
      // возвращение в идущий бой тем же аккаунтом
      for (const r of rooms.values()) { const old = [...r.players.values()].find((p) => !p.bot && p.pid && p.pid === c.pid && p !== c); if (old) { takeSeat(r, old, c); return; } } // и когда старое соединение ещё не закрылось
      return send(c, { t: 'welcome', id: c.id, name: c.name, search: searching() });
    }
    if (!c.name) return;
    const r = c.room;
    switch (m.t) {
      case 'create': { const nr = newRoom(c, m); if (!nr) return send(c, { t: 'err', msg: 'Сервер занят' }); joinRoom(nr, c, m.team); return; }
      case 'join': { const jr = rooms.get(O.cleanCode(m.code)); if (!jr) return send(c, { t: 'err', msg: 'Комната не найдена' }); if (jr.state === 'end') return send(c, { t: 'err', msg: 'Бой уже закончился' }); joinRoom(jr, c, m.team); return; }
      case 'leave': leaveRoom(c); return send(c, { t: 'left' });
      case 'back': if (r && r.state === 'end') { c.back = true; checkBack(r); } return; // «В КОМНАТУ» после итогов
      case 'retake': if (r && r.kind !== 'multi') retake(r, c); return; // связь вернулась — самолёт снова у игрока
      case 'queue': { if (r || !O.AD_MODES.includes(m.mode)) return; for (const q of [...Object.values(queues), ...Object.values(mqueues)]) { const i = q.findIndex((e) => e.c === c); if (i >= 0) q.splice(i, 1); }
        if (m.kind === 'multi') { mqueues[m.mode].push({ c, t: clock() }); return send(c, { t: 'queued', mode: m.mode, kind: 'multi', n: mqueues[m.mode].length }); }
        queues[m.mode].push({ c, role: ['air', 'pvo'].includes(m.role) ? m.role : 'any', t: clock() }); return send(c, { t: 'queued', mode: m.mode, n: queues[m.mode].length }); }
      case 'unqueue': for (const q of [...Object.values(queues), ...Object.values(mqueues)]) { const i = q.findIndex((e) => e.c === c); if (i >= 0) q.splice(i, 1); } return send(c, { t: 'unqueued' });
    }
    if (!r) return;
    const me = c, host = r.host === c.id;
    if (r.kind === 'multi' && r.state !== 'lobby' && m.t !== 'clog') { MU.onMsg(c, r, m); return; } // «Мульти-волна» — свой разбор
    switch (m.t) {
      // ── лобби ──
      case 'team': if (r.state === 'lobby' && teamsOf(r).includes(m.team) && team(r, m.team).length < r.size) { c.team = m.team; c.budget = O.BUDGET0[m.team] || 0; c.ready = false; sendRoom(r); } return;
      case 'ready': if (r.state === 'lobby') { c.ready = !!m.on; sendRoom(r); tryStart(r); } else if (r.state === 'plan') { c.ready = !!m.on; sendRoom(r); } return;
      case 'bot': if (host && r.state === 'lobby') addBot(r, teamsOf(r).includes(m.team) ? m.team : teamsOf(r)[0]); return;
      case 'kick': { const b = r.players.get(+m.id); if (host && r.state === 'lobby' && b && b.bot) { r.players.delete(b.id); sendRoom(r); } return; }
      case 'opts': if (host && r.state === 'lobby') { if (m.kind === 'air' || m.kind === 'multi') setKind(r, m.kind); if ([1, 2, 3, 4].includes(+m.era) && r.kind !== 'multi') r.era = +m.era; /* у «Мульти-волны» эпоху не выбирают */ if (m.sideAir === 'east' || m.sideAir === 'west') r.sideAir = m.sideAir; if (O.AD_MODES.includes(m.mode)) r.mode = m.mode; if (O.AD_SIZES.includes(+m.size)) r.size = +m.size; if (m.fill !== undefined) r.fill = !!m.fill; for (const p of r.players.values()) if (!p.bot) p.ready = false; sendRoom(r); } return;
      // ── расстановка и покупки ──
      case 'buyAir': {
        if (r.state !== 'plan' || c.team !== 'air') return;
        const L = O.bundleOf(r.era, r.sideAir, +m.i); if (!L) return;
        const back = c.choice !== null ? (c.paid ?? O.loadoutCostFor(LOADOUTS[r.era][c.choice], r.lead)) : 0, cost = O.loadoutCostFor(L, r.lead);
        if (cost > c.budget + back) return deny(c, 'Не хватает очков на эту связку', 'buyAir');
        { const rw = realDeny(r.mode, c, loadoutIds(L)); if (rw) return deny(c, rw, 'buyAir'); }
        const rd = O.roleDeny(L, othersL(r, c), team(r, 'air').length); if (rd) return deny(c, rd, 'buyAir');
        c.budget += back - cost; c.choice = +m.i; c.paid = cost; sendRoom(r); return;
      }
      case 'buyUnit': { if (r.state !== 'plan' || c.team !== 'pvo') return; { const rw = realDeny(r.mode, c, samIds(String(m.k))); if (rw) return deny(c, rw, 'buyUnit ' + m.k); } const why = buyUnit(r, c, String(m.k), +m.x, +m.z, !!m.roof); if (why) deny(c, why, 'buyUnit ' + m.k); else J(r, 'cmd', { who: c.name, cmd: 'buyUnit', k: m.k, x: Math.round(+m.x), z: Math.round(+m.z) }); return; }
      case 'tgt': { const u = r.S && (r.state === 'plan' || r.state === 'play') && c.team === 'pvo' && r.S.units.find((q) => q.id === +m.id && q.owner === c.id && !q.dead); if (u) r.S.setTgt(u, m.c); return; } // фильтр целей своего комплекса: список видов, пустой — все (старый сервер пропускает)
      case 'sell': { const u = r.S && r.S.units.find((q) => q.id === +m.id); if (r.state !== 'plan' || !u || u.owner !== c.id) return; c.budget += Math.round((u.paid ?? O.samCost(u.key)) * 0.7); r.S.removeUnit(u); bcast(r, { t: 'ev', e: [['ur', u.id]] }); sendRoom(r); return; }
      case 'move': { const u = r.S && r.S.units.find((q) => q.id === +m.id); if (r.state !== 'plan' || !u || u.owner !== c.id || !Number.isFinite(+m.x) || !Number.isFinite(+m.z)) return; if (!(m.roof ? buildingAt(city, +m.x, +m.z) >= 0 : freeGround(city, +m.x, +m.z))) return deny(c, 'Место занято', 'move'); r.S.moveUnit(u, +m.x, +m.z, !!m.roof); bcast(r, { t: 'ev', e: [['um', u.id, r1(+m.x), r1(+m.z), m.roof ? 1 : 0]] }); return; }
    }
    // журнал игры: ошибки, отказы у себя, связь, частота кадров (≤ 30 в минуту)
    if (m.t === 'clog') {
      const now = clock(); if (now - (c.clogT || 0) > 60) { c.clogT = now; c.clogN = 0; }
      if (++c.clogN <= 30) J(r, 'client', { who: c.name, k: String(m.k || '').slice(0, 24), d: String(typeof m.d === 'string' ? m.d : JSON.stringify(m.d)).slice(0, 1500) });
      return;
    }
    // «Мне нужна помощь!» — союзникам (с точкой: самолёт или свой комплекс под управлением)
    if (m.t === 'help' && r.state !== 'lobby' && clock() - (c.helpT || -1e9) >= O.HELP_CD - 0.5) {
      c.helpT = clock();
      const at = c.craft ? c.craft.pos : c.op ? c.op.pos : null, mp = Array.isArray(m.p) && m.p.length === 2 && m.p.every(Number.isFinite) ? [r1(m.p[0]), r1(m.p[1])] : null; // ПВО без пульта — точка от игры (свой комплекс или карта)
      bcast(r, { t: 'help', id: c.id, name: c.name, p: at ? [r1(at.x), r1(at.z)] : mp }, (q) => q.team === c.team);
      return;
    }
    if (r.state !== 'play') return;
    switch (m.t) {
      // ── лётчик ──
      case 'st': {
        const a = c.craft; if (!a || a.dead || !O.validState(m.s)) return;
        const s = m.s; a.pos.set(s[0], s[1], s[2]); a.yaw = s[3]; a.pitch = s[4]; a.roll = s[5]; a.speed = s[6]; a.thr = s[7]; a.ab = !!(s[8] & 1);
        if (Number.isFinite(s[9])) c.fuel = Math.max(0, Math.min(1, s[9])); // топливо (для зоны пополнения)
        fwdOf(a, a.vel).multiplyScalar(a.speed); c.lastSt = clock();
        if (Math.abs(s[0]) > CITY.HALF - 200 || Math.abs(s[2]) > CITY.HALF - 200) { if (r.t > 60 && !(c.load || []).some((l) => l.n > 0 && AG[l.key].kind !== 'ecm')) { r.humanCraft.delete(c.id); c.craft = null; c.out = true; push(r, ['out', c.id]); } }
        return;
      }
      case 'rel': {
        const a = c.craft; if (!a || a.dead) return;
        // темп сброса: запас на 2 подряд, восполняется раз в REL_CD (сообщения в сети приходят пачками — второй сброс не терялся бы)
        c.relTok = Math.min(2, (c.relTok ?? 2) + (r.t - (c.relT || 0)) / REL_CD); c.relT = r.t;
        if (c.relTok < 1) return deny(c, 'Слишком часто — сброс не прошёл', 'rel ' + m.k);
        const l = (c.load || []).find((q) => q.key === m.k && q.n > 0); if (!l) return deny(c, 'Нет такого оружия', 'rel ' + m.k);
        c.relTok -= 1;
        const W = AG[l.key];
        if (W.kind === 'rocket' && m.n) { // залп НАР (2026-10-22): одним сообщением (m.n — клиент с залпом; старый клиент шлёт без n — пойдёт по одной, как остальное оружие) — W.salvo ракет; блок пустеет через load/salvo залпов (как у клиента в air.js)
          const per = Math.ceil(W.load / W.salvo); l.rs = (l.rs ?? per) - 1; if (l.rs <= 0) { l.n--; l.rs = per; }
          for (let i = 0; i < W.salvo; i++) r.S.release(a, l.key, {});
          J(r, 'cmd', { who: c.name, cmd: 'rel', k: l.key, left: l.n, aim: false, tg: null, laser: !!a.laser });
          return;
        }
        l.n--;
        const aim = Array.isArray(m.aim) && m.aim.every(Number.isFinite) ? new THREE.Vector3(m.aim[0], m.aim[1], m.aim[2]) : null;
        const tgt = m.tg ? r.S.units.find((u) => u.id === +m.tg) || null : null;
        r.S.release(a, l.key, { aim, target: tgt });
        J(r, 'cmd', { who: c.name, cmd: 'rel', k: l.key, left: l.n, aim: !!aim, tg: tgt ? tgt.S.short : null, laser: !!a.laser });
        return;
      }
      case 'lost': { // оторвалась консоль с подвесками: только уменьшает (сколько есть и сколько пилонов — до конца вылета)
        if (!c.craft || !Array.isArray(m.k)) return; c.cap = c.cap || {};
        for (const q of m.k.slice(0, 12)) { if (!Array.isArray(q) || !Number.isFinite(q[1]) || !Number.isFinite(q[2])) continue;
          const l = (c.load || []).find((x) => x.key === q[0]); if (!l) continue;
          l.n = Math.max(0, Math.min(l.n, q[1] | 0)); c.cap[l.key] = Math.max(0, Math.min(c.cap[l.key] ?? Infinity, q[2] | 0)); }
        return;
      }
      case 'rtb': { // вылет окончен: оружия нет, ушёл за границу района — дальше смотрит за союзниками
        const a = c.craft; if (!a || a.dead || (c.load || []).some((l) => l.n > 0 && AG[l.key].kind !== 'ecm')) return;
        r.humanCraft.delete(c.id); c.craft = null; c.out = true; push(r, ['out', c.id]); return;
      }
      case 'laser': { const a = c.craft; if (a) a.laser = Array.isArray(m.p) && m.p.every(Number.isFinite) ? new THREE.Vector3(m.p[0], m.p[1], m.p[2]) : null; return; }
      case 'cm': { // 'both' — пачка ЛТЦ и диполей одной кнопкой (клиенты с версии 2026-10); 'flare' / 'chaff' — по одной
        const a = c.craft, types = (m.type === 'both' ? ['flare', 'chaff'] : [m.type === 'chaff' ? 'chaff' : 'flare']).filter((k) => k !== 'flare' || !a || cmOf(cmKey(a), a.side).flare); // машина без ЛТЦ (sim/cm.js) — только диполи
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
    stats: () => ({ online: clients.size, rooms: rooms.size, searching: searching(), load: { tickMs: Math.round(load.ema * 100) / 100, tickMaxMs: Math.round(Math.max(load.max, load.maxPrev) * 10) / 10, budgetMs: Math.round(1000 * DT) } }),
    _rooms: rooms,
  };
}
