// Онлайн «Мульти-волны» (комнаты kind: 'multi' на /ad): бой считает сервер той же логикой, что одиночная игра —
// sim/strike.js (ПВО, ЗУР, перехват, урон), sim/raid.js (носители) и sim/combined.js (у каждого атакующего — своя волна:
// разведчик, дроны, носители, пусковые). Правила и числа — games/airdef/sim/online-multi.js.
// Раунд: подготовка (одновременно: атака собирает наряд, ПВО ставит комплексы; чат команды) → волна → итоги раунда.
// Два раунда со сменой сторон, победа — по сумме разрушенной ценности. Туман войны — на сервере: атакующим уходят только
// засечённые комплексы ПВО, обороне — только оружие, которое увидела её сеть РЛС (или глаза рядом); план — никому, кроме автора.
/* global THREE */
import { CITY } from '../games/airdef/city.js?v=20260930m';
import { createStrike, MODES } from '../games/airdef/sim/strike.js?v=20260930m';
import { createRaid } from '../games/airdef/sim/raid.js?v=20260930m';
import { createCombined, samKnown, levelIn } from '../games/airdef/sim/combined.js?v=20261018j';
import { spotNear, freeGround, roofOk, buildingAt } from '../games/airdef/mission.js?v=20260930m';
import { AG, SAM, SAM_COST, DEFENSE, COMBINED, THREAT, multiItems } from '../games/airdef/arsenal.js?v=20260930m';
import * as O from '../games/airdef/sim/online.js?v=20260930m';
import * as M from '../games/airdef/sim/online-multi.js?v=20261018j';
import { dmgPack } from '../games/airdef/sim/damage.js?v=20261022d';
import { realDeny, samIds, strikeIds } from './airdef-own.js';
import { battleParts } from '../games/airdef/rating.js?v=20261027d';

const r1 = (v) => Math.round(v * 10) / 10;
const opp = (s) => (s === 'east' ? 'west' : 'east');

// ctx — общее с комнатами airdef-rooms.js: city, send, bcast, team, humans, J, sign, seal, clock, closeRoom, toLobby, sendRoom, FAST
export function createMulti(ctx) {
  const { city, send, bcast, team, humans, J, sign, seal = async () => null, clock, sendRoom, FAST } = ctx;
  const PREP_T = FAST ? 8 : M.PREP_T, DEBRIEF_T = FAST ? 1 : M.DEBRIEF_T, RESULTS_T = FAST ? 3 : M.RESULTS_T, WAVE_MAX = M.WAVE_MAX;
  const DT = 1 / O.TICK_HZ, SNAP_EVERY = Math.round(O.TICK_HZ / O.SNAP_HZ);
  const atkTeam = (r) => team(r, r.atk), defTeam = (r) => team(r, opp(r.atk));
  const isAtk = (r, p) => p.team === r.atk;

  // ═════════════ Раунды ═════════════
  function start(r) {
    r.first = Math.random() < 0.5 ? 'east' : 'west'; r.round = 0; r.scores = { east: 0, west: 0 }; r.startedAt = Date.now();
    for (const p of r.players.values()) { p.kills = 0; p.deaths = 0; p.score = 0; p.icp = 0; p.samk = 0; p.dmg = 0; } // icp — перехваты (раунд за ПВО), samk — комплексы, уничтоженные волной игрока, dmg — доля разрушенного волной игрока, % (экран итога)
    J(r, 'start', { kind: 'multi', era: r.era, first: r.first, east: team(r, 'east').map((p) => p.name), west: team(r, 'west').map((p) => p.name) });
    nextRound(r);
  }
  function nextRound(r) {
    r.round++; r.atk = r.round === 1 ? r.first : opp(r.first);
    const def = opp(r.atk);
    r.S = createStrike({ city, rnd: Math.random, mode: () => MODES[r.mode], game: 'multi', aircraft: () => r.raid.planes, laserSpot: () => null, night: 0, hurt: (a, d, by, from) => { r.raid.hurt(a, d, from); if (a.dz && !a.dead) pushTo(r, 'all', ['hp', a.id, Math.max(0, Math.round(a.hp)), by, dmgPack(a)]); }, fx: strikeFx(r) });
    r.raid = createRaid(r.S, city, Math.random, { side: r.atk, era: r.era, fx: {} });
    r.E = []; r.events = []; r.state = 'plan'; r.t = 0; r.phaseT = PREP_T; r.tick = 0; r.wt = 0; r.k = 1; r.seenT = 0; r.announced = new Set();
    r.v0 = M.totalValue(r.S.objects);
    const nA = atkTeam(r).length, nD = defTeam(r).length;
    for (const p of r.players.values()) {
      p.ready = !!p.bot; p.op = null; p.E = null; p.planT = 0;
      if (isAtk(r, p)) { p.budget = M.atkBudget(nA); p.plan = { n: {}, cfg: {} }; p.spent = 0; }
      else { p.budget = M.defBudget(nD, r.mode); p.plan = null; p.spent = 0; }
    }
    bcast(r, { t: 'start', kind: 'multi', round: r.round, rounds: M.ROUNDS, atk: r.atk, era: r.era, mode: r.mode, scores: r.scores, v0: r.v0 });
    for (const p of r.players.values()) if (p.bot) (isAtk(r, p) ? botAttack : botDefense)(r, p);
    sendState(r); sendRoom(r);
    J(r, 'round', { round: r.round, atk: r.atk, budgets: [...r.players.values()].map((p) => [p.name, p.team, p.budget]) });
  }
  function startWave(r) {
    r.state = 'play'; r.t = 0; r.phaseT = WAVE_MAX; r.wt = 0; r.tick = 0;
    const military = r.S.objects.filter((o) => !o.noTarget && !o.dead);
    for (const p of atkTeam(r)) {
      if (!p.plan || !M.planCost(p.plan.n)) continue;
      const ids = new Set(); for (const c of Object.values(p.plan.cfg)) { if (c.tgt != null) ids.add(c.tgt); for (const u of c.units || []) if (u && u.tgt != null) ids.add(u.tgt); }
      const tg = military.filter((o) => ids.has(o.id));
      const own = { id: p.id, owner: p.id };
      const E = createCombined(r.S, city, Math.random, { side: r.atk, era: r.era, raid: r.raid, comp: M.compOf(r.atk, p.plan.n), plan: p.plan.cfg, lim: M.LIM, owner: own,
        gate: () => r.S.wpns.length < M.INFLIGHT_CAP });
      E.start(tg.length ? tg : military); E.pid = p.id; p.E = E; p.own = own; r.E.push(E);
    }
    sendRoom(r);
    J(r, 'wave', { round: r.round, plans: atkTeam(r).map((p) => [p.name, M.planCost(p.plan && p.plan.n), Object.entries((p.plan && p.plan.n) || {}).map(([k, n]) => k + ':' + n).join(',')]) });
  }
  function endRound(r, why) {
    if (r.state !== 'play') return;
    const value = M.damageValue(r.S.objects), k = value / (r.v0 || 1);
    r.scores[r.atk] += value;
    // вклад атакующих — по потраченным очкам угрозы (урон считает весь бой); у ПВО — свои перехваты (p.score по ходу)
    const spent = atkTeam(r).reduce((s, p) => s + M.planCost(p.plan && p.plan.n), 0) || 1;
    for (const p of atkTeam(r)) { const share = M.planCost(p.plan && p.plan.n) / spent; p.score += Math.round(k * 1000 * share); p.dmg = Math.round(100 * k * share); } // та же доля плана игрока × доля разрушенного раунда
    const last = r.round >= M.ROUNDS;
    r.state = 'debrief'; r.t = 0; r.phaseT = last ? Math.min(DEBRIEF_T, 2.5) : DEBRIEF_T; r.last = last; // последний раунд — сразу к итогам боя
    const res = { round: r.round, atk: r.atk, why, value: Math.round(value), k: Math.round(k * 1000) / 1000, v0: r.v0, scores: { east: Math.round(r.scores.east), west: Math.round(r.scores.west) }, last,
      downs: r.downs || 0 };
    r.downs = 0;
    bcast(r, { t: 'roundEnd', ...res }); sendRoom(r); J(r, 'round_end', res);
  }
  async function endBattle(r) {
    const e = r.scores.east, w = r.scores.west, winner = Math.abs(e - w) < 1 ? null : e > w ? 'east' : 'west';
    r.state = 'end'; r.t = 0; r.phaseT = RESULTS_T;
    const list = [...r.players.values()].map((p) => ({ id: p.id, name: p.name, team: p.team, bot: !!p.bot, kills: p.kills || 0, deaths: 0, score: Math.round(p.score || 0), icp: p.icp || 0, samk: p.samk || 0, dmg: p.dmg || 0 }));
    const hm = humans(r).length * 2 > r.players.size ? 1 : 0;
    for (const p of humans(r)) {
      // итог для наград — как у обычного онлайна (airdef-claim): team — роль первого раунда игрока, w — победа команды
      // рейтинг (games/airdef/rating.js): только быстрый бой (своя комната рейтинга не даёт); ничья — winner null (×0,5 победы), надбавки за ранг
      // в «Мульти-волне» нет; ope — id соперников-людей, запечатанные (seal в server.js, расшифровывает только airdef-claim)
      const all = [...r.players.values()], opp = all.filter((q) => q.team !== p.team);
      const rt = r.quick ? battleParts({ win: winner === null ? 0.5 : p.team === winner ? 1 : 0, score: p.score || 0, kills: p.kills || 0, teamScores: all.filter((q) => q.team === p.team).map((q) => q.score || 0), oppHumans: opp.filter((q) => !q.bot).length, oppTotal: opp.length, mode: r.mode, multi: true }) : null;
      const ope = await seal(opp.filter((q) => !q.bot && q.pid && !String(q.pid).startsWith('test-')).map((q) => q.pid));
      const res = { g: 'airdef', mm: 1, m: `${r.code}-${r.startedAt}`, p: p.pid, mode: r.mode, team: p.team === r.first ? 'air' : 'pvo', w: p.team === winner ? 1 : 0, k: p.kills || 0, s: Math.round(p.score || 0), hm, ...(rt ? { rt } : {}), ope,
        ev: { min: Math.round((Date.now() - (r.startedAt || Date.now())) / 6000) / 10, mwInt: (p.kills || 0) * 3, mwObj: Math.min(300, Math.round((p.score || 0) / 40)) }, // для прокачки (airdef-claim)
        exp: Math.floor(Date.now() / 1000) + 3600 };
      send(p, { t: 'end', kind: 'multi', first: r.first, winner, scores: { east: Math.round(e), west: Math.round(w) }, v0: r.v0, players: list, result: p.pid && !String(p.pid).startsWith('test-') ? await sign(res) : null });
    }
    J(r, 'end', { winner, scores: r.scores });
  }

  // ═════════════ Боты ═════════════
  // эпох у игроков нет; r.era — скрытый уровень ботов (игроку не показывается; быстрый бой — по рангу людей, quickEra, свои комнаты — случайный)
  // атака: состав ИИ этого уровня, урезанный под бюджет; цели — два случайных объекта, ложные цели — на ПВО
  function botAttack(r, p) {
    const base = (COMBINED[r.atk] || {})[levelIn(COMBINED[r.atk], r.era)] || [], n = {}; let cost = 0;
    const others = M.sumN(...atkTeam(r).filter((q) => q !== p).map((x) => x.plan && x.plan.n)), team = atkTeam(r).length;
    for (let pass = 0; pass < 6; pass++) for (const [k] of base) { if (AG[k].recon || !multiItems(r.atk).some(([q]) => q === k)) continue; const c = THREAT[k] ?? 3, tb = AG[k].kind === 'tbm'; if (cost + c <= p.budget && (!tb || !M.tbmCheck(M.sumN(others, n, { [k]: 1 }), team))) { n[k] = (n[k] || 0) + 1; cost += c; } }
    const objs = r.S.objects.filter((o) => !o.noTarget), pick = [objs[Math.floor(Math.random() * objs.length)], objs[Math.floor(Math.random() * objs.length)]], cfg = {};
    for (const [k, c] of Object.entries(n)) cfg[k] = { pts: [], alt: null, t: null, sam: false, tgt: null, units: Array.from({ length: c }, (_, i) => (AG[k].decoyMun ? { sam: true } : { sam: false, tgt: pick[i % 2].id })) };
    p.plan = { n, cfg }; p.spent = cost;
  }
  // ПВО: дальние — между центром и объектами, средние и ближние — у объектов (целей атакующих бот не знает)
  function botDefense(r, p) {
    const side = opp(r.atk), list = (DEFENSE[side][levelIn(DEFENSE[side], r.era)] || []).map(([k]) => k).filter((k) => M.samOk(k, side));
    const order = [...list.filter((k) => O.samClass(k) === 'top'), ...list.filter((k) => O.samClass(k) === 'mid'), ...list.filter((k) => O.samClass(k) === 'near')];
    const objs = r.S.objects.filter((o) => !o.noTarget);
    for (let g = 0; g < 16; g++) {
      const k = order.find((q) => (SAM_COST[q] || 100) <= p.budget); if (!k) break;
      const tgt = objs[(g + p.id) % objs.length], Sx = SAM[k], man = Sx.type === 'ir' && Sx.hp <= 15;
      const xz = Sx.rmax >= 15000 ? spotNear(city, Math.random, tgt.x * 0.5, tgt.z * 0.5, 600, 2500, false) : spotNear(city, Math.random, tgt.x, tgt.z, 250, man ? 1600 : 1400, man);
      buyUnit(r, p, k, xz[0], xz[1], xz[2], true);
      if (O.samClass(k) === 'top' && order.length > 1) order.splice(order.indexOf(k), 1);
    }
  }
  function buyUnit(r, p, k, x, z, roof, quiet) {
    const side = opp(r.atk);
    if (!M.samOk(k, side)) return 'Комплекс недоступен';
    const cost = SAM_COST[k] || 100; if (cost > p.budget) return 'Не хватает очков';
    if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > CITY.HALF - 1500 || Math.abs(z) > CITY.HALF - 1500) return 'Вне карты';
    const Sx = SAM[k], man = Sx.type === 'ir' && Sx.hp <= 15;
    if (roof) { if (!man) return 'На крышу — только ПЗРК'; const bi = buildingAt(city, x, z); if (bi < 0 || !roofOk(city, bi)) return 'Сюда на крышу нельзя'; }
    else if (!freeGround(city, x, z, man ? 3 : 9)) return 'Место занято — нужна свободная земля';
    const u = r.S.addUnit(k, x, z, { roof: !!roof, skill: 0.75, yaw: Math.random() * 6.28 });
    u.owner = p.id; u.paid = cost; p.budget -= cost;
    pushTo(r, 'def', ['ua', u.id, k, r1(x), r1(z), roof ? 1 : 0, p.id, Math.round(u.yaw * 1000) / 1000]); flushPlan(r);
    if (!quiet) sendRoom(r);
    return null;
  }

  // ═════════════ События: кому (all / atk / def) ═════════════
  const pushTo = (r, to, e) => r.events.push([to, e]);
  const v3 = (p) => [r1(p.x), r1(p.y), r1(p.z)];
  const wFlags = (w) => (w.W.kind === 'tbm' && w.phase === 'boost' ? M.W_BOOST : 0) | (w.decoy || w.W.decoyMun ? M.W_DECOY : 0);
  const wOwner = (w) => (w.owner ? w.owner.owner || 0 : 0);
  // баллистика: + точка прицеливания, сколько летит и полное время (ПВО — оценка СПРН: в реализме клиент размывает до круга)
  const wrEv = (w) => ['wr', w.id, w.key, wOwner(w), ...v3(w.pos), r1(w.vel.x), r1(w.vel.y), r1(w.vel.z), wFlags(w), ...(w.W.kind === 'tbm' && w.aim ? [r1(w.aim.x), r1(w.aim.z), r1(w.t), r1(w.T)] : [])];
  // в плане ещё нет боя: события расстановки сразу (ua / ur / um — только своей команде ПВО)
  function flushPlan(r) { if (r.state === 'plan') { flush(r); } }
  function flush(r) {
    const ev = r.events; r.events = []; if (!ev.length) return;
    const pick = (side) => ev.filter(([to]) => to === 'all' || to === side).map(([, e]) => e);
    const A = pick('atk'), D = pick('def');
    if (A.length) bcast(r, { t: 'ev', e: A }, (q) => q.team === r.atk);
    if (D.length) bcast(r, { t: 'ev', e: D }, (q) => q.team !== r.atk);
  }
  function strikeFx(r) {
    return {
      samLaunch: (m) => { const t = m.target; pushTo(r, 'all', ['sl', m.id, m.unit.id, t ? (t.isMun ? -t.id : t.id) : 0, m.slot]); },
      samEnd: (m, hit) => {
        pushTo(r, 'all', ['se', m.id, hit ? 1 : 0, ...v3(m.pos)]);
        if (hit && m.target && m.target.isMun && m.target.dead) { const p = r.players.get(m.unit.owner); if (p) { p.kills++; p.icp++; p.score += 10 * (THREAT[m.target.key] ?? 2); } r.downs = (r.downs || 0) + 1; }
      },
      wpnRelease: (w) => { pushTo(r, 'atk', wrEv(w)); },
      wpnEnd: (w, res) => { const e = ['we', w.id, ...v3(w.pos), res.intercepted ? 1 : 0]; pushTo(r, w.defSeen ? 'all' : 'atk', e); },
      explosion: (p, R, kind) => pushTo(r, 'all', ['x', ...v3(p), r1(R), kind]),
      objectDestroyed: (o, by, owner) => { pushTo(r, 'all', ['od', o.id]); const p = owner && r.players.get(owner.owner || owner.id); pushTo(r, 'all', ['kl', String(p ? p.name : M.TEAM_NAME[r.atk]).slice(0, 24), String(o.name).slice(0, 40), String(by || '').slice(0, 24), r.atk, r.atk === 'east' ? 'west' : 'east', '', '']); },
      unitDestroyed: (u, by, owner) => { pushTo(r, u.atkSeen ? 'all' : 'def', ['ud', u.id]); const p = owner && r.players.get(owner.owner || owner.id); if (p) { p.kills++; p.samk++; p.score += 40; }
        const v = r.players.get(u.owner); pushTo(r, u.atkSeen ? 'all' : 'def', ['kl', String(p ? p.name : M.TEAM_NAME[r.atk]).slice(0, 24), String(v ? v.name : 'ПВО').slice(0, 40), String(by || '').slice(0, 24), r.atk, opp(r.atk), '', 'u:' + u.key]); },
    };
  }

  // ═════════════ Туман войны ═════════════
  // раз в 0,5 с: что атака знает о ПВО (засечённые — со всеми данными), что ПВО видит из волны (РЛС сети, оптика, рядом, старт баллистики)
  function fog(r) {
    const S = r.S, dU = S.units.filter((u) => !u.dead);
    for (const u of S.units) if (!u.atkSeen && samKnown(u)) { u.atkSeen = true; pushTo(r, 'atk', ['ua', u.id, u.key, r1(u.pos.x), r1(u.pos.z), u.roof ? 1 : 0, u.owner || 0, Math.round(u.yaw * 1000) / 1000]); }
    for (const w of S.wpns) {
      if (w.dead || w.defSeen || !w.ev) continue;
      let seen = w.W.kind === 'tbm' && w.phase === 'boost' && w.t > 2; // факел старта видно издалека
      for (const u of dU) { if (seen) break; const d = u.pos.distanceTo(w.pos); if (d < 2500 || (u.S.radar && u.emit && S.radarSees(u, w)) || (d < 7000 && S.eyesSee(u, w))) seen = true; }
      if (seen) { w.defSeen = true; pushTo(r, 'def', wrEv(w)); }
    }
  }
  // снимки: атаке — носители, засечённые комплексы, все ЗУР, своё оружие, пусковые; ПВО — свои комплексы, все ЗУР, увиденное оружие
  function snapshot(r) {
    const S = r.S, ev = r.events; r.events = [];
    const pick = (side) => ev.filter(([to]) => to === 'all' || to === side).map(([, e]) => e);
    const M_ = S.sams.filter((m) => !m.dead).map(O.packM), base = { t: 's', T: Math.round(r.wt * 100) / 100, k: r.k, V: Math.round(M.damageValue(S.objects)) };
    const W = (f) => S.wpns.filter((w) => !w.dead && w.ev && f(w)).map((w) => [...O.packW(w), wFlags(w)]);
    const L = []; for (const E of r.E) for (const q of E.launchers) L.push([q.id, q.key, r1(q.pos.x), r1(q.pos.z), Math.round(q.yaw * 1000) / 1000, q.fired, Math.round((q.podEl || 0) * 100) / 100, q.n0, q.name, E.pid || 0]); // последнее — чья пусковая (союзники — своим цветом)
    const A = r.raid.planes.filter((a) => !a.dead && !a.out && a.phase !== 'wait').map(O.packA);
    const ea = pick('atk'), ed = pick('def');
    bcast(r, { ...base, A, U: S.units.filter((u) => u.atkSeen).map(O.packU), M: M_, W: W(() => true), L, e: ea.length ? ea : undefined }, (q) => q.team === r.atk);
    bcast(r, { ...base, A: [], U: S.units.map(O.packU), M: M_, W: W((w) => w.defSeen), e: ed.length ? ed : undefined }, (q) => q.team !== r.atk);
  }
  // расписание атакующему (раз в секунду): его единицы (пущена, время, не раньше) и лента «Ход волны»
  const refOf = (o) => (!o ? null : o.isLauncher ? ['L', o.id] : o.isMun ? ['w', o.id] : o.id !== undefined ? ['a', o.id] : null);
  function sched(r) {
    for (const p of atkTeam(r)) {
      if (!p.ws) continue;
      const E = p.E, u = {};
      if (E) for (const [k, n] of E.comp) { if (AG[k].recon) continue; u[k] = []; for (let i = 0; i < n; i++) { const f = E.unitInfo(k, i); u[k].push(f.launched ? [1] : [0, Math.round(f.t * 10) / 10, Math.round(f.earliest * 10) / 10]); } }
      const pack = (e) => [e.g, e.label, e.sub, e.eta === null ? null : Math.round(e.eta * 10) / 10, refOf(e.obj), refOf(e.cue)];
      const ev = E ? E.events().map(pack) : []; // без своего наряда — только союзники
      // союзники по атаке: их носители, пусковые и то, что летит (без подробностей плана) — отдельным разделом ленты
      const al = []; for (const q of atkTeam(r)) if (q !== p && q.E) for (const e of q.E.events().slice(0, 14)) al.push([q.name, ...pack(e)]);
      send(p, { t: 'sched', T: Math.round((E ? E.t : r.wt) * 10) / 10, u, ev, al });
    }
  }
  // ПВО «за пультом» или над районом летит — время ×1, иначе ×3 (подлёт носителей, ожидание пусков)
  function quiet(r) {
    if (r.S.sams.some((m) => !m.dead)) return false;
    if (defTeam(r).some((p) => p.op)) return false;
    const pts = [...r.S.objects.filter((o) => !o.noTarget && !o.dead), ...r.S.units.filter((u) => !u.dead).map((u) => u.pos)], R2 = M.QUIET_R * M.QUIET_R;
    return !r.S.wpns.some((w) => !w.dead && w.ev && !w.W.recon && pts.some((p) => (p.x - w.pos.x) ** 2 + (p.z - w.pos.z) ** 2 < R2)); // ни одной ракеты и дрона у объектов и ПВО
  }

  // ═════════════ Такт ═════════════
  function step(r, dt) {
    if (r.state === 'plan') {
      if (r.t >= r.phaseT || (!r.emptyT && [...r.players.values()].every((p) => p.ready || (!p.ws && !p.bot)))) startWave(r); // никого на связи — подготовка до конца срока (вернувшийся успеет)
      return;
    }
    if (r.state === 'debrief') { if (r.t >= r.phaseT) { if (r.last) endBattle(r); else nextRound(r); } return; }
    if (r.state === 'end') { if (r.t >= r.phaseT) ctx.toLobby(r); return; } // итоги показаны — снова лобби той же комнаты
    if (r.state !== 'play') return;
    r.k = quiet(r) ? M.QUIET_K : 1;
    for (let s = 0; s < r.k * (FAST ? 4 : 1); s++) { // AD_FAST (автопроверка) — ещё ×4
      r.wt += dt;
      for (const E of r.E) E.step(dt);
      r.raid.step(dt); r.S.step(dt);
    }
    for (const a of r.raid.planes) if (!r.announced.has(a.id) && a.phase !== 'wait') { r.announced.add(a.id); pushTo(r, 'atk', ['an', a.id, 'carrier', a.plane || '', '', a.owner || 0, (a.load || []).map((l) => l.key + ':' + l.n).join(','), a.carrierName || '']); }
    if ((r.seenT -= dt) <= 0) { r.seenT = 0.5; fog(r); }
    if (++r.tick % SNAP_EVERY === 0) snapshot(r);
    if (r.tick % O.TICK_HZ === 0) sched(r);
    const busy = r.E.some((E) => E.pending()) || r.S.wpns.some((w) => !w.dead && !w.W.recon); // разведчик и ЗУР без целей волну не держат
    if (!busy && r.wt > 5) return endRound(r, 'done');
    if (r.wt >= r.phaseT) return endRound(r, 'time');
    if (r.tick % (O.TICK_HZ * 5) === 0) J(r, 'state', { wt: Math.round(r.wt), k: r.k, wpns: r.S.wpns.length, sams: r.S.sams.length, V: Math.round(M.damageValue(r.S.objects)) });
  }
  // полное состояние: ПВО — свои комплексы; атаке — засечённые; объекты — у всех
  function sendState(r, only) {
    if (!r.S) return;
    const objects = r.S.objects.filter((o) => o.dmgTaken > 0 || o.dead).map((o) => [o.id, Math.round(o.hp), o.dead ? 1 : 0]);
    const unitsOf = (atk) => r.S.units.filter((u) => !atk || u.atkSeen).map((u) => [u.id, u.key, r1(u.pos.x), r1(u.pos.z), u.roof ? 1 : 0, u.owner || 0, Math.round(u.yaw * 1000) / 1000, u.dead ? 1 : 0, !atk && u.tgt ? [...u.tgt] : 0]); // последнее — фильтр целей (только своей команде ПВО)
    const msg = (atk) => ({ t: 'state', kind: 'multi', round: r.round, atk: r.atk, era: r.era, mode: r.mode, units: unitsOf(atk), objects, scores: r.scores });
    if (only) send(only, msg(only.team === r.atk));
    else { bcast(r, msg(true), (q) => q.team === r.atk); bcast(r, msg(false), (q) => q.team !== r.atk); }
  }
  // вид комнаты для мульти: раунд, кто атакует, план союзников-атакующих (сводка по целям) — только своей команде
  function viewExtra(r, me) {
    const out = { kind: 'multi', round: r.round || 0, rounds: M.ROUNDS, atk: r.atk || null, scores: r.scores ? { east: Math.round(r.scores.east), west: Math.round(r.scores.west) } : null, k: r.k || 1 };
    if (me && r.atk && me.team === r.atk) out.allies = atkTeam(r).map((p) => ({ id: p.id, name: p.name, cost: M.planCost(p.plan && p.plan.n), tbm: M.tbmOf(p.plan && p.plan.n), tbn: Object.fromEntries(Object.entries((p.plan && p.plan.n) || {}).filter(([k, v]) => v > 0 && AG[k] && AG[k].kind === 'tbm')), tg: tgSummary(p.plan) }));
    return out;
  }
  function tgSummary(plan) { // { 'o12': 'Калибр 2, Дрон ударный 4' } — что союзник шлёт на какую цель
    if (!plan) return {};
    const out = {};
    for (const [k, n] of Object.entries(plan.n || {})) { const c = plan.cfg[k] || {}; for (let i = 0; i < n; i++) { const u = (c.units || [])[i] || {}, key = u.sam ?? c.sam ? (u.sid != null ? 'u' + u.sid : 'sam') : (u.tgt ?? c.tgt) != null ? 'o' + (u.tgt ?? c.tgt) : 'free'; (out[key] = out[key] || {})[k] = (out[key][k] || 0) + 1; } }
    for (const key of Object.keys(out)) out[key] = Object.entries(out[key]).map(([k, n]) => `${AG[k].short} ${n}`).join(', ');
    return out;
  }

  // ═════════════ Сообщения игроков ═════════════
  function onMsg(c, r, m) {
    // чат команды — на подготовке
    if (m.t === 'chat') {
      if (r.state !== 'plan' || (c.chatT !== undefined && clock() - c.chatT < M.CHAT_GAP)) return;
      const text = M.cleanChat(m.text); if (!text) return;
      c.chatT = clock(); bcast(r, { t: 'chat', id: c.id, name: c.name, text }, (q) => q.team === c.team); J(r, 'chat', { who: c.name, text });
      return;
    }
    // «Помощь» обороны — метка на карте союзникам (всегда)
    if (m.t === 'help') {
      if (!r.atk || c.team === r.atk || (c.helpT !== undefined && clock() - c.helpT < O.HELP_CD - 0.5)) return;
      const p = Array.isArray(m.p) && m.p.length === 2 && m.p.every(Number.isFinite) ? [r1(m.p[0]), r1(m.p[1])] : c.op ? [r1(c.op.pos.x), r1(c.op.pos.z)] : null;
      c.helpT = clock(); bcast(r, { t: 'help', id: c.id, name: c.name, p }, (q) => q.team === c.team);
      return;
    }
    if (m.t === 'ready' && r.state === 'plan') { c.ready = !!m.on; sendRoom(r); return; }
    // план атакующего: целиком (подготовка и бой); в бою — новые единицы докупаются в волну, правки — ещё не пущенным
    if (m.t === 'plan') {
      if (!isAtk(r, c) || (r.state !== 'plan' && r.state !== 'play')) return;
      if (typeof m.json !== 'string' || m.json.length > M.PLAN_MAX || (c.planT && clock() - c.planT < M.PLAN_RATE)) return;
      let raw; try { raw = JSON.parse(m.json); } catch (_) { return; }
      const ids = new Set(r.S.objects.filter((o) => !o.noTarget).map((o) => o.id));
      const plan = M.cleanPlan(raw, r.atk, ids, CITY.HALF); if (!plan) return;
      { const rw = realDeny(r.mode, c, strikeIds(plan.n)); if (rw) return send(c, { t: 'deny', msg: rw }); } // «Реализм» — только купленные удары
      const cost = M.planCost(plan.n);
      if (cost > c.budget) return send(c, { t: 'deny', msg: 'Не хватает очков угрозы' });
      { const others = M.sumN(...atkTeam(r).filter((p) => p !== c).map((p) => p.plan && p.plan.n)), old = (c.plan && c.plan.n) || {};
        const more = Object.keys(plan.n).some((k) => AG[k] && AG[k].kind === 'tbm' && (plan.n[k] || 0) > (old[k] || 0)), why = more && M.tbmCheck(M.sumN(others, plan.n), atkTeam(r).length);
        if (why) return send(c, { t: 'deny', msg: `${why} на команду` }); } // меньше — можно всегда
      if (r.state === 'play' && c.E) { // нельзя убрать то, что уже в бою: число единиц — не меньше прежнего
        for (const [k, n0] of Object.entries(c.plan.n)) if ((plan.n[k] || 0) < n0) plan.n[k] = n0;
        const items = new Map(multiItems(r.atk));
        for (const [k, n] of Object.entries(plan.n)) {
          const n0 = c.plan.n[k] || 0, add = n - n0; if (add <= 0) continue;
          const cf = plan.cfg[k] = plan.cfg[k] || { pts: [], units: [] }; cf.units = cf.units || [];
          for (let i = n0; i < n; i++) { const u = cf.units[i] = cf.units[i] || {}; if (u.t == null) u.t = Math.ceil(c.E.t + 30 + (i - n0) * 2); } // докупка в бою — пуск через 30 с после заказа
          c.E.extend(k, add, items.get(k), plan.cfg);
        }
        c.E.applyPlan(plan.cfg);
      } else if (r.state === 'play' && cost) { // в подготовке ничего не собрал — волна стартует сейчас
        c.plan = plan; c.planT = clock(); c.spent = cost;
        const own = { id: c.id, owner: c.id }, E = createCombined(r.S, city, Math.random, { side: r.atk, era: r.era, raid: r.raid, comp: M.compOf(r.atk, plan.n), plan: plan.cfg, lim: M.LIM, owner: own, gate: () => r.S.wpns.length < M.INFLIGHT_CAP });
        E.start(r.S.objects.filter((o) => !o.noTarget && !o.dead)); E.pid = c.id; c.E = E; r.E.push(E); return;
      }
      c.plan = plan; c.planT = clock(); c.spent = cost; sendRoom(r);
      return;
    }
    // ПВО: покупка, продажа, перенос (подготовка)
    if (m.t === 'buyUnit') { if (r.state !== 'plan' || isAtk(r, c)) return; { const rw = realDeny(r.mode, c, samIds(String(m.k))); if (rw) return send(c, { t: 'deny', msg: rw }); } const why = buyUnit(r, c, String(m.k), +m.x, +m.z, !!m.roof); if (why) send(c, { t: 'deny', msg: why }); return; }
    if (m.t === 'sell') { const u = r.S && r.S.units.find((q) => q.id === +m.id); if (r.state !== 'plan' || !u || u.owner !== c.id) return; c.budget += Math.round((u.paid ?? SAM_COST[u.key]) * 0.7); r.S.removeUnit(u); pushTo(r, 'def', ['ur', u.id]); flush(r); sendRoom(r); return; }
    if (m.t === 'move') { const u = r.S && r.S.units.find((q) => q.id === +m.id); if (r.state !== 'plan' || !u || u.owner !== c.id || !Number.isFinite(+m.x) || !Number.isFinite(+m.z)) return; if (!(m.roof ? buildingAt(city, +m.x, +m.z) >= 0 : freeGround(city, +m.x, +m.z))) return send(c, { t: 'deny', msg: 'Место занято' }); r.S.moveUnit(u, +m.x, +m.z, !!m.roof); pushTo(r, 'def', ['um', u.id, r1(+m.x), r1(+m.z), m.roof ? 1 : 0]); flush(r); return; }
    // фильтр целей своего комплекса (подготовка и бой): список видов, пустой — все; старый сервер команду не знает и пропускает
    if (m.t === 'tgt') { const u = r.S && (r.state === 'plan' || r.state === 'play') && !isAtk(r, c) && r.S.units.find((q) => q.id === +m.id && q.owner === c.id && !q.dead); if (u) r.S.setTgt(u, m.c); return; }
    if (r.state !== 'play' || isAtk(r, c)) return;
    // ПВО в бою: свой комплекс под ручное управление и пульт (как в обычном онлайне)
    if (m.t === 'op') { if (c.op && !c.op.dead) r.S.setManual(c.op, false); const u = r.S.units.find((q) => q.id === +m.id && q.owner === c.id && !q.dead); c.op = u || null; if (u) r.S.setManual(u, true); return; }
    if (m.t === 'emit' && !c.op) { const u = r.S.units.find((q) => q.id === +m.id && q.owner === c.id && !q.dead); if (u) r.S.setEmit(u, !!m.on); return; }
    const u = c.op && c.op.id === +m.id && !c.op.dead ? c.op : null; if (!u) return;
    switch (m.t) {
      case 'desig': { const id = +m.tg; const t = id < 0 ? r.S.wpns.find((w) => w.id === -id && !w.dead && w.defSeen) : null; r.S.designate(u, t || null); return; }
      case 'launch': { const why = r.S.launch(u); if (why) send(c, { t: 'deny', msg: why }); return; }
      case 'emit': r.S.setEmit(u, !!m.on); return;
      case 'method': if (m.m === '3t' || m.m === 'half') u.method = m.m; return;
      case 'aim': if (Array.isArray(m.d) && m.d.length === 3 && m.d.every(Number.isFinite)) { u.aimDir.set(m.d[0], m.d[1], m.d[2]).normalize(); u.gunFire = !!m.f; } return;
    }
  }
  // вернувшийся в бой: раунд, комплексы (по туману своей команды)
  function resume(r, c) { send(c, { t: 'start', kind: 'multi', round: r.round, rounds: M.ROUNDS, atk: r.atk, era: r.era, mode: r.mode, scores: r.scores, v0: r.v0, plan: c.team === r.atk && c.plan ? c.plan : undefined }); sendState(r, c); } // переподключение: и свой план (наряд атаки)
  // ушёл игрок: его комплексы — ИИ-расчётам, его волна летит по плану
  function drop(r, p) { if (r.S) for (const u of r.S.units) if (u.owner === p.id) u.owner = 0; }
  return { start, step, onMsg, viewExtra, resume, drop, DT };
}
