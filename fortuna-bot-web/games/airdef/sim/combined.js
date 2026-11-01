// «Мульти-волна» по городу (2026-10-13): без сцены и DOM — расписание пусков и пусковые для отрисовки.
// Эшелоны (как в жизни): 1 — разведчик над городом, дроны и ложные цели (ПВО тратит ракеты и раскрывает РЛС);
// 2 — крылатые ракеты и ложные цели с носителей (Ту-160, B-1B, F-16, Су-24М — самолёты ИИ-налёта): носитель заходит из-за
// края карты, на рубеже пуска идёт вдоль края района, пускает ракеты по одной и уходит (сбили раньше — остальные ракеты
// не пущены); ракеты входят в район с 2–3 направлений (или по маршрутам плана) и приходят почти одновременно;
// 3 — оперативно-тактические ракеты с пусковых на краю района.
// Дроны — только свои у стороны: у востока «Шахед» (и разведчик), у запада — БПЛА (и разведчик, и ударный).
// Комплексы ПВО заранее не известны: их засекает разведчик (прямая видимость), выдаёт излучение РЛС (его «слышат» ракеты,
// дроны и носители в зоне станции) и пуск ЗУР. По ПВО бьют только по засечённым — цель выбирается в момент пуска;
// по комплексу, которого разведчик не видел сам (засечён по излучению или пуску), баллистика ложится с тройным промахом.
/* global THREE */
import { tr } from '../i18n.js?v=20261029b';
import { AG, SAM, COMBINED, CARRIERS, MULTI, THREAT } from '../arsenal.js?v=20261029b';
import { CITY, objAimXZ } from '../city.js?v=20261029b';

export const COMBINED_NAME = 'Мульти-волна';
export const combinedOk = (side, era) => !!(COMBINED[side] && COMBINED[side][era]);
// ── Скрытый уровень ИИ в «Мульти-волне» (Mark 2026-10-25: эпох и рангов нет; игроку уровень не показывается — чтобы новичок со стартовым
// оружием не встречал С-400). ИИ берёт готовые составы по уровню 1–4: ПВО — DEFENSE[сторона][уровень], волна — COMBINED[сторона][уровень].
//  • ИИ-ПВО против игрока-атакующего: средняя ступень оружия в плане игрока (MULTI.items, 3-й элемент), взвешенная очками угрозы, округлённая;
//  • ИИ-волна против игрока-ПВО: наибольшая эпоха (SAM.era) среди комплексов, доступных игроку (в «Реализме» — купленные);
//  • боты онлайна: уровень комнаты (быстрый бой — по рангу людей, quickEra), наружу он не выводится;
//  • нужного уровня нет в таблице (у запада нет I в COMBINED) — ближайший старший, иначе младший (levelIn).
const clampLevel = (v) => Math.max(1, Math.min(4, v));
export const levelIn = (tab, lvl) => { for (let d = 0; d < 4; d++) for (const l of [lvl + d, lvl - d]) if (tab && tab[l]) return l; return lvl; };
export function levelOfPlan(side, n) { // n — { ключ: сколько } план игрока за сторону side
  let w = 0, s = 0;
  for (const [k, , step] of MULTI.items[side] || []) { const c = (n || {})[k] || 0; if (c > 0) { const t = (THREAT[k] ?? 3) * c; w += t; s += t * step; } }
  return w ? clampLevel(Math.round(s / w)) : 1;
}
export const levelOfSams = (side, keys) => clampLevel(Math.max(1, ...keys.filter((k) => SAM[k] && SAM[k].side === side).map((k) => SAM[k].era || 1))); // keys — комплексы, доступные игроку-ПВО
// комплекс ПВО засечён (видел разведчик, выдал излучением или пуском)
export const samKnown = (u) => !!(u.spotted || u.elint || u.fired);

// пакет HIMARS (ATACMS): ось подъёма (низ у кормы) и срез — передний торец (к кабине), в осях модели; в покое наклон ≈ 10°,
// к пуску поднимается до 60° (≈ 15 с), стреляет поверх кабины; после пусков опускается
// M752 (Lance, своя модель сборщика): сначала откидывается кормовой трап — доля ramp подъёма L.podEl (rampA от походных 35,8° до 106,5°, его наружная
// плита rampB раскрывается на 180°), затем стрела (часть pod) с ракетой поднимается на 70° вокруг оси у кормы (≈ 24 с всего, стреляет вперёд поверх
// кабины). Оси петель — из узлов модели сборщика (Свои/M752: стрела (0; 1,3; 2,7), трап (0; 0,65; 2,56)) со сдвигом центровки prepare.js −0,215 по z;
// срез — центр ракеты на сёдлах (ось y 2,42, хвост z 2,785, длина 6,15 м): при пуске ракета на стреле прячется, на её месте появляется летящая
export const POD = { l_himars: { hinge: [0.12, 1.3, 3.75], muzzle: [0.12, 2.05, 0.25], rest: 0.17, el: 1.05, rate: 1 / 15 },
  l_lance: { hinge: [0, 1.3, 2.485], muzzle: [0, 2.42, -0.29], rest: 0, el: 1.2217, rate: 1 / 24, ramp: 0.3,
    rampA: { hinge: [0, 0.65, 2.345], a: 1.2347 }, rampB: { hinge: [0, 1.766, 3.106], a: -Math.PI }, msl: 'w_lance' } }; // наружная плита — 180° → 0°, как в пакете сборщика (pack.py): +π прошла бы сквозь внутреннюю
// доля подъёма самого пакета (стрелы) по L.podEl: у M752 первая часть хода — трап
export const podLift = (P, el) => (P.ramp ? Math.max(0, (el - P.ramp) / (1 - P.ramp)) : el);
// где срез пакета и куда он смотрит (мир): по подъёму L.podEl (0…1) и курсу L.yaw
export function podPose(L, pos, dir) {
  const P = POD[L.key], f = (P.el - P.rest) * podLift(P, L.podEl || 0), c = Math.cos(f), s = Math.sin(f);
  const dy = P.muzzle[1] - P.hinge[1], dz = P.muzzle[2] - P.hinge[2], lx = P.muzzle[0], ly = P.hinge[1] + dy * c - dz * s, lz = P.hinge[2] + dy * s + dz * c;
  const cy = Math.cos(L.yaw), sy = Math.sin(L.yaw), a = P.rest + f;
  pos.set(L.pos.x + lx * cy + lz * sy, L.pos.y + ly, L.pos.z - lx * sy + lz * cy);
  dir.set(-Math.cos(a) * sy, Math.sin(a), -Math.cos(a) * cy); // ось пакета вперёд (−Z) с подъёмом a
  return pos;
}
// «Искандер» (dofash_76): две ракеты стоят на пусковой вертикально (направляющая у автора под 56,8° поднята до вертикали в prepare.js, raiseSel) — центры
// (оси модели l_iskander, y — от земли) и ось ракеты (вверх). Пуск — из центра ракеты вдоль её оси (первые секунды, как у пакета HIMARS); ракеты уходят по очереди: tbm, tbm2
// «Точка-У» (своя, боевое положение): ракета 9М79 стоит вертикально в корме (центр — по готовому l_tochka.glb: prepare.js центрует машину по длине); раньше — 6 м над центром машины
// Р-17 (l_scud): ракета на поднятой стреле в корме — центр части tbm готового l_scud.glb; без записи стартовала из «центра машины + 6 м» — посреди
// пусковой, в стороне от стоящей ракеты (Mark 2026-10-27: «телепортируется уже пущенной где-то по центру пусковой»)
export const RAIL = { l_iskander: { c: [[0.58, 5.36, 5.121], [-0.58, 5.36, 5.121]], a: [0, 1, 0] }, l_tochka: { c: [[0, 5.753, 4.464]], a: [0, 1, 0] }, l_scud: { c: [[0, 7.213, 5.963]], a: [0, 1, 0] } };
export function railPose(L, j, pos, dir) {
  const R = RAIL[L.key], c = R.c[Math.min(j, R.c.length - 1)], cy = Math.cos(L.yaw), sy = Math.sin(L.yaw);
  pos.set(L.pos.x + c[0] * cy + c[2] * sy, L.pos.y + c[1], L.pos.z - c[0] * sy + c[2] * cy);
  dir.set(R.a[0] * cy + R.a[2] * sy, R.a[1], -R.a[0] * sy + R.a[2] * cy);
  return pos;
}
export const LAUNCH_R = CITY.HALF + 1500; // рубеж пусков носителя: за краем района (ПВО не достаёт), там он ходит по дуге
export const CARRIER_WAIT = 90;            // самолёт-носитель у рубежа: от первого пуска до последнего — не дольше 1,5 мин
const SPAWN_R = CITY.HALF + 9000, CARRIER_V = 230;
// пределы расписания: одиночная игра (LIM) и онлайн (LIM_ON — время волны общее: короче, носитель заходит ближе, ≈ 45 с до рубежа)
export const LIM = { spawnR: SPAWN_R, uav: 600, tbm: 900, car: 300 };
export const LIM_ON = { spawnR: LAUNCH_R + CARRIER_V * 45, uav: 300, tbm: 360, car: 180 };
const pathLen = (from, pts, aim) => { let d = 0, p = from; for (const q of pts || []) { d += Math.hypot(q.x - p.x, q.z - p.z); p = q; } return d + Math.hypot(aim.x - p.x, aim.z - p.z); };
const bearingOf = (pts, c) => (pts && pts.length ? Math.atan2(pts[0][0], pts[0][1]) : Math.hypot(c.x, c.z) > 1 ? Math.atan2(c.x, c.z) : 0);
// настройка единицы: своя (plan[k].units[i]) поверх общей для типа (plan[k]); pts — [[x, z]], tgt — id объекта-цели
export function unitCfg(plan, k, i) {
  const P = plan[k] || {}, U = (P.units && P.units[i]) || {};
  const pick = (f) => (U[f] !== undefined ? U[f] : P[f] ?? null); // своё значение (даже null) важнее общего
  return { pts: U.pts && U.pts.length ? U.pts : P.pts && P.pts.length ? P.pts : null, alt: pick('alt'), t: U.t ?? null, tType: P.t ?? null, sam: !!pick('sam'), tgt: pick('tgt'), sid: pick('sid'), own: !!(P.units && P.units[i]) }; // sid — конкретный засечённый комплекс ПВО (id)
}
// какие единицы на каком носителе: подряд, поровну
export const carrierOf = (n, via, i) => { const nC = Math.ceil(n / CARRIERS[via].cap), per = Math.ceil(n / nC); return Math.floor(i / per); };
// расписание: у каждой единицы — время пуска (с от начала боя) и когда она у цели. Пределы по типу: tmin (носителю надо
// долететь до рубежа), tmax (самолёт у района долго не ходит — до 5 мин; дроны — до 10, баллистика — до 15).
// Без плана — как у ИИ: дроны сразу, крылатые к T2 (после дронов), баллистика сразу за крылатыми
export function planDefaults(comp, targets, plan = {}, lim = LIM) {
  const c = targets.length ? { x: targets.reduce((s, o) => s + o.x, 0) / targets.length, z: targets.reduce((s, o) => s + o.z, 0) / targets.length } : { x: 0, z: 0 };
  const xz = (p) => (p ? p.map(([x, z]) => ({ x, z })) : null), aimOf = (u) => { const o = u.tgt != null && targets.find((q) => q.id === u.tgt); return o || c; };
  const fromAt = (pts, R, aim = c) => { const b = bearingOf(pts, aim); return { x: Math.sin(b) * R, z: Math.cos(b) * R }; }; // без маршрута — со стороны цели
  const out = {};
  let maxDrone = 0;
  for (const [k, n] of comp) { const W = AG[k]; if (!W.uav || W.recon) continue; const fly = pathLen(fromAt(plan[k] && plan[k].pts, CITY.HALF - 500), xz(plan[k] && plan[k].pts), c) / W.speed; maxDrone = Math.max(maxDrone, fly + n * 2); }
  const T2 = maxDrone ? Math.max(Math.min(300, lim.uav), maxDrone + 20) : 150;
  for (const [k, n, , via] of comp) {
    const W = AG[k]; if (W.recon) continue;
    const car = via && CARRIERS[via], tb = W.kind === 'tbm';
    const o = out[k] = { n, units: [], tmin: 0, tmax: W.uav ? lim.uav : tb && !car ? lim.tbm : car ? lim.car : lim.uav, dt: W.uav ? 2 : tb && !car ? 6 : car ? car.every : 2 }; // tb с носителем — «Кинжал»
    if (car) o.tmin = Math.ceil(Math.max(0, lim.spawnR - LAUNCH_R) / CARRIER_V) + 2;
    const fly0 = tb ? W.T : pathLen(fromAt(plan[k] && plan[k].pts, W.uav ? CITY.HALF - 500 : LAUNCH_R), xz(plan[k] && plan[k].pts), c) / W.speed;
    const def = W.uav ? 0 : tb ? Math.max(10, T2 + 8 - W.T) : Math.max(5, T2 - fly0 - n * o.dt * 0.3);
    for (let i = 0; i < n; i++) {
      const u = unitCfg(plan, k, i), tType = Math.min(o.tmax, Math.max(o.tmin, u.tType ?? Math.round(def)));
      const slot = car ? i - carrierOf(n, via, i) * Math.ceil(n / Math.ceil(n / car.cap)) : i; // у носителя — по порядку пуска
      const t = Math.min(o.tmax, Math.max(o.tmin, u.t ?? tType + slot * o.dt));
      const fly = tb ? W.T : pathLen(fromAt(u.pts, W.uav ? CITY.HALF - 500 : LAUNCH_R, aimOf(u)), xz(u.pts), aimOf(u)) / W.speed;
      o.units.push({ t, arrive: Math.round(t + fly), carrier: car ? carrierOf(n, via, i) : null, own: u.own });
    }
    o.tType = Math.min(o.tmax, Math.max(o.tmin, (plan[k] && plan[k].t) ?? Math.round(def)));
    o.t = Math.min(...o.units.map((q) => q.t)); o.arrive = Math.max(...o.units.map((q) => q.arrive));
  }
  return out;
}
// opts: side, era, raid (носители), comp — свой состав [[ключ, n, эшелон, носитель]] (режим «За удар»),
// plan — { ключ: { t, pts, alt, sam, tgt, units: [{ t, pts, alt, sam, tgt }] } }: у типа и у каждой единицы — время пуска
// (с от начала), маршрут, высота, по ПВО или по объекту (tgt — конкретный). Без плана — расписание ИИ (дроны → крылатые →
// баллистика), часть крылатых и баллистики — по засечённым комплексам ПВО
export function createCombined(S, city, rnd, opts = {}) {
  const side = opts.side || 'east', era = opts.era || 4, comp = (opts.comp || (COMBINED[side] || {})[era] || []).map((e) => e.slice()); // копия: во время волны дополняется
  const plan = opts.plan || {}, mine = !!opts.plan;
  const queue = [], launchers = [], log = [], carriers = [], raid = opts.raid || null;
  let t = 0, started = false, scanT = 0;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const edge = (b, R) => V(Math.sin(b) * R, 0, Math.cos(b) * R);
  const ground = (p) => { p.y = city.groundH(p.x, p.z); return p; };
  const vecs = (pts) => (pts ? pts.map(([x, z]) => V(x, 0, z)) : null);
  // по ПВО: у игрока — по выбору (у единицы или типа); у ИИ — ложные цели все, дроны половина, крылатые треть, баллистика половина
  const aiFrac = (k) => (AG[k].decoyMun ? 1 : AG[k].uav ? 0.5 : AG[k].kind === 'tbm' ? 0.5 : 0.34);
  const toSamN = (i, f) => Math.floor((i + 1) * f) > Math.floor(i * f);

  let objs = [];
  // по объекту — по его постройкам вразлёт (Mark 2026-10-22: били все в одну точку — центр, а он у части объектов — пустая земля):
  // каждая следующая единица по тому же объекту — в следующую постройку (city.js objAimXZ; крупные — чаще), место на крыше — случайное
  const hitN = new Map();
  const objAim = (i, id) => {
    let o = id != null ? objs.find((q) => q.id === id && !q.dead) : null; if (!o) o = objs[i % objs.length];
    const n = hitN.get(o.id) || 0; hitN.set(o.id, n + 1);
    const p = objAimXZ(o, n, rnd() - 0.5, rnd() - 0.5); return V(p.x, city.topAt(p.x, p.z), p.z);
  };
  // цель — в момент пуска: по ПВО — случайный из засечённых комплексов с РЛС (никого не знаем — по объекту)
  const aimFn = (toSam, i, id, sid) => () => {
    if (toSam && sid != null) { const u = S.units.find((q) => q.id === sid && !q.dead); if (u) return { p: u.pos.clone(), u }; } // по выбранному ЗРК (если ещё цел)
    if (toSam) { const us = S.units.filter((u) => !u.dead && u.S.radar && samKnown(u)); if (us.length) { const u = us[Math.floor(rnd() * us.length)]; return { p: u.pos.clone(), u }; } }
    return { p: objAim(i, id), u: null };
  };
  // targets — объекты-цели волны
  // OWN — онлайн: метка игрока { id, owner } у его ракет, дронов и носителей (кому очки, чья лента); mineW — своё оружие
  const OWN = opts.owner || null, mineW = (w) => !OWN || w.owner === OWN || (w.owner && w.owner.ownTag === OWN);
  const lim = opts.lim || LIM, approachT = (lim.spawnR - LAUNCH_R) / CARRIER_V, PD = new THREE.Vector3();
  let b0 = 0, dirs = [0, 0, 0], di = 0, ci = 0, oi = 0;
  // курс захода носителя — не ближе 0,12 рад (≈ 1,7 км на рубеже) к живым носителям: единицы разных типов на один объект с настройками
  // по умолчанию брали один курс (на цель), и носители появлялись друг в друге (Mark 2026-10-27); сдвиг — по 0,15 рад в обе стороны
  const angD = (x) => Math.abs(Math.atan2(Math.sin(x), Math.cos(x)));
  function freeB(b) {
    for (let s = 0; s < 13; s++) { const bb = b + (s % 2 ? 1 : -1) * Math.ceil(s / 2) * 0.15; if (!carriers.some((c) => !c.dead && !c.out && angD(c.sb - bb) < 0.12)) return bb; }
    return b;
  }
  // единицы типа k с номерами i0…i1-1 — в расписание (на старте — все; во время волны — докупленные). tFloor — не раньше
  function schedule(k, n, via, i0, i1, D, tFloor) {
    const W = AG[k];
    if (W.recon) {
      // разведчик: облёт над городом по кругу через районы ПВО
      const R = 5000 + rnd() * 2000, route = [0, 1, 2, 3, 4, 5].map((j) => V(Math.sin(b0 + j * 1.05) * R, W.alt, Math.cos(b0 + j * 1.05) * R));
      queue.push({ t: 0, key: k, from: edge(dirs[0], CITY.HALF - 500).setY(W.alt + 300), aimFn: () => ({ p: route[0].clone() }), o: { route } });
      return;
    }
    // направление захода: по маршруту; без него у игрока — со стороны своей цели (с ближнего края), у ИИ — по общим направлениям
    const bTgt = (u) => { const o = u.tgt != null && objs.find((q) => q.id === u.tgt); return o && Math.hypot(o.x, o.z) > 300 ? Math.atan2(o.x, o.z) : null; };
    const U = (i) => { const u = unitCfg(plan, k, i); return { ...u, tL: Math.max(tFloor, D[k].units[i].t), toSam: mine ? u.sam : toSamN(i, aiFrac(k)), route: vecs(u.pts), b: u.pts ? Math.atan2(u.pts[0][0], u.pts[0][1]) : mine ? bTgt(u) : null }; };
    const m = i1 - i0;
    if (W.kind === 'tbm' && !W.air) { // воздушного пуска («Кинжал») — с носителя, ниже
      // пусковые оперативно-тактических ракет: у края района (12,2–13,4 км от центра), за городом; у каждой ракеты — своё время
      const per = k === 'iskander' ? 2 : 1, nL = Math.ceil(m / per);
      for (let l = 0; l < nL; l++) {
        const b = dirs[(ci + l) % 2] + (rnd() - 0.5) * 0.5, p = ground(edge(b, CITY.HALF - 3800 + rnd() * 1200)), c = Math.min(per, m - l * per);
        // HIMARS — кабиной к городу (пакет стреляет поверх кабины); остальные — кормой с ракетой к городу
        const L = { id: launchers.length + 1, key: W.launcher, wkey: k, pos: p, yaw: Math.atan2(p.x, p.z) + (POD[W.launcher] ? 0 : Math.PI), left: c, n0: c, fired: 0, isLauncher: true, name: tr('{0}: пусковая {1}', [W.short, launchers.length + 1]), podEl: 0, lastFire: -1e9 };
        launchers.push(L);
        for (let j = 0; j < c; j++) { const i = i0 + l * per + j, u = U(i); queue.push({ t: u.tL + (mine ? 0 : rnd() * 4), key: k, k, i, oi, L, aimFn: aimFn(u.toSam, oi++, u.tgt, u.sid) }); }
      }
      ci++; return;
    }
    if (W.uav) { // дроны: с края района
      for (let i = i0; i < i1; i++) {
        const u = U(i), b = u.b !== null ? u.b + (rnd() - 0.5) * 0.12 : dirs[di++ % dirs.length] + (rnd() - 0.5) * 0.35, from = edge(b, CITY.HALF - 500);
        from.y = city.groundH(from.x, from.z) + (u.alt ?? W.alt ?? 60);
        queue.push({ t: u.tL, key: k, k, i, oi, from, aimFn: aimFn(u.toSam, oi++, u.tgt, u.sid), route: u.route, alt: u.alt });
      }
      return;
    }
    if (via && raid && CARRIERS[via]) {
      // носители: единицы подряд по вместимости; носитель приходит на рубеж к первому своему пуску, ходит там по дуге
      // (за краем района) и пускает каждую ракету в её время; последний пуск — уход. Время носителя — время волны (a.t0 + a.t)
      const CA = CARRIERS[via], nC = Math.ceil(m / CA.cap);
      for (let j = 0; j < nC; j++) {
        const salvo = [];
        for (let i = i0; i < i1; i++) if (carrierOf(m, via, i - i0) === j) { const u = U(i); const q = { key: k, k, i, oi, t: u.tL, aimFn: aimFn(u.toSam, oi++, u.tgt, u.sid), route: u.route, alt: u.alt, b: u.b }; q.done = () => { q.launched = t; log.push({ t, key: k, kind: W.kind, via }); }; salvo.push(q); }
        if (!salvo.length) continue;
        salvo.sort((a, b) => a.t - b.t);
        const rq = salvo.find((q) => q.b !== null), b = freeB(rq ? rq.b + (j - (nC - 1) / 2) * 0.15 : dirs[ci++ % dirs.length] + (rnd() - 0.5) * 0.3);
        const T = Math.max(salvo[0].t, t + approachT * 0.1), approach = approachT, delay = Math.max(0, T - t - approach);
        const spawnR = delay > 0 ? lim.spawnR : LAUNCH_R + Math.max(300, (T - t) * CARRIER_V);
        const a = raid.spawn('carrier', { x: 0, z: 0 }, b, delay, spawnR,
          { plane: via, mside: CA.side, load: [{ key: k, n: salvo.length }], salvo, n0: salvo.length, cruise: CA.alt, hp: CA.hp, rcs: CA.rcs, every: CA.every, carrierName: CA.name, len: CA.len, R: LAUNCH_R, launchAt: T, t0: t });
        if (OWN) { a.owner = OWN.owner; a.ownTag = OWN; } // онлайн: чей носитель (очки, лента «Ход волны» игрока)
        a.sb = b; carriers.push(a);
      }
      return;
    }
    for (let i = i0; i < i1; i++) { // крылатые без носителя (на всякий случай): из-за края карты
      const u = U(i), b = u.b !== null ? u.b : dirs[ci++ % dirs.length], from = edge(b, CITY.HALF + 8000); from.y = city.groundH(from.x, from.z) + (u.alt ?? W.alt ?? 60);
      queue.push({ t: u.tL, key: k, k, i, oi, from, aimFn: aimFn(u.toSam, oi++, u.tgt, u.sid), route: u.route, alt: u.alt });
    }
  }
  function start(targets) {
    if (!comp || started) return false;
    started = true; t = 0;
    b0 = rnd() * Math.PI * 2; dirs = [b0, b0 + 1.9 + rnd() * 0.6, b0 - 1.9 - rnd() * 0.6];
    objs = targets.length ? targets : S.objects.filter((o) => !o.dead && !o.noTarget);
    const D = planDefaults(comp, objs, plan, lim);
    for (const [k, n, , via] of comp) schedule(k, n, via, 0, n, D, 0);
    queue.sort((a, b) => a.t - b.t);
    return true;
  }
  // докупить во время волны: add единиц типа k (носитель via) — в расписание по плану (по умолчанию — как можно скорее)
  function extend(k, add, via, newPlan) {
    if (!started || add <= 0) return;
    if (newPlan && newPlan !== plan) { Object.keys(plan).forEach((q) => delete plan[q]); Object.assign(plan, newPlan); }
    let e = comp.find(([q]) => q === k); if (!e) { e = [k, 0, AG[k].uav ? 1 : AG[k].kind === 'tbm' ? 3 : 2, via]; comp.push(e); }
    const n0 = e[1]; e[1] += add;
    schedule(k, e[1], via, n0, n0 + add, planDefaults(comp, objs, plan, lim), t + 0.5);
    queue.sort((a, b) => a.t - b.t);
  }
  // ── правка плана во время удара: для ещё не пущенных единиц — время (не раньше «сейчас» и прилёта носителя на рубеж),
  // маршрут, высота, цель. Носитель, который ещё не вылетел, — вылетает под новое первое время и по новому направлению
    function carrierEarliest(a) { // когда носитель сможет пустить первую ракету
    if (a.phase === 'wait') return t + Math.max(0, a.delay) + approachT;
    if (a.inbound) return t + Math.max(0, Math.hypot(a.pos.x, a.pos.z) - a.R) / Math.max(150, a.speed);
    return t;
  }
  function pendingItem(k, i) {
    const q = queue.find((x) => x.k === k && x.i === i); if (q) return { q, a: null };
    for (const a of carriers) { if (a.dead || a.out) continue; const x = a.salvo.find((y) => y.k === k && y.i === i); if (x) return { q: x, a }; }
    return null;
  }
  // состояние единицы: пущена ли, не раньше какого времени её можно пустить, на каком носителе
  function unitInfo(k, i) {
    const p = pendingItem(k, i); if (!p) return { launched: true };
    return { launched: false, t: p.q.t, earliest: p.a ? Math.max(t + 0.5, carrierEarliest(p.a)) : t + 0.5, carrier: p.a };
  }
  function applyPlan(newPlan) {
    if (!started) return;
    if (newPlan && newPlan !== plan) { Object.keys(plan).forEach((k) => delete plan[k]); Object.assign(plan, newPlan); } // обычно — тот же объект плана игрока
    const D = planDefaults(comp, objs, plan, lim);
    const upd = (q, a) => {
      const u = unitCfg(plan, q.k, q.i), lo = a ? Math.max(t + 0.5, carrierEarliest(a)) : t + 0.5;
      q.t = Math.max(lo, D[q.k] ? D[q.k].units[q.i].t : q.t);
      if (!AG[q.k].recon && AG[q.k].kind !== 'tbm') { q.route = u.pts ? u.pts.map(([x, z]) => V(x, 0, z)) : null; q.alt = u.alt; }
      q.aimFn = aimFn(mine ? u.sam : false, q.oi, u.tgt, u.sid);
    };
    for (const q of queue) if (q.k !== undefined) upd(q, null);
    queue.sort((a, b) => a.t - b.t);
    for (const a of carriers) {
      if (a.dead || a.out || !a.salvo.length) continue;
      for (const q of a.salvo) upd(q, a);
      a.salvo.sort((x, y) => x.t - y.t); a.launchAt = a.salvo[0].t;
      if (a.phase === 'wait') { // ещё не вылетел: вылет — под первое время, направление — по маршруту
        a.delay = Math.max(0, a.salvo[0].t - approachT - t);
        const rq = a.salvo.find((q) => q.route); if (rq) { a.b = Math.atan2(rq.route[0].x, rq.route[0].z); a.pos.set(Math.sin(a.b) * lim.spawnR, a.cruise, Math.cos(a.b) * lim.spawnR); a.yaw = Math.atan2(Math.sin(a.b), Math.cos(a.b)); }
      }
    }
  }
  // засечка ПВО: излучающую РЛС «слышат» свои ракеты, дроны и носители в зоне станции (при прямой видимости); пуск ЗУР выдаёт комплекс
  function scan() {
    for (const m of S.sams) if (m.unit) m.unit.fired = true;
    const assets = [...S.wpns.filter((w) => w.ev && !w.dead), ...carriers.filter((a) => !a.dead && !a.out && a.phase !== 'wait')];
    for (const u of S.units) {
      if (u.dead || u.elint || !u.S.radar || !u.emit) continue;
      const R = u.S.radar.range || 20000, e = u.ant || u.pos;
      for (const a of assets) if (a.pos.distanceTo(u.pos) < R && city.los(a.pos.x, a.pos.y, a.pos.z, e.x, e.y, e.z, 6)) { u.elint = true; break; }
    }
  }
  function step(dt) {
    if (!started) return;
    t += dt;
    if ((scanT -= dt) <= 0) { scanT = 1; scan(); }
    // пакеты пусковых: поднимаются, когда до пуска меньше, чем нужно на подъём (+3 с); после всех пусков — опускаются
    for (const L of launchers) {
      const P = POD[L.key]; if (!P) continue;
      const next = queue.find((q) => q.L === L), up = next ? next.t - t < 1 / P.rate + 3 : t - L.lastFire < 4;
      L.podEl = Math.min(1, Math.max(0, L.podEl + (up ? 1 : -1) * P.rate * (up && L.podFast ? L.podFast : 1) * dt)); // podFast — «Пуск» в «Съёмке»: подъём быстрее, но плавно
    }
    while (queue.length && queue[0].t <= t) {
      if (opts.gate && !opts.gate()) { for (const q of queue) if (q.t <= t) q.t = t + 1; break; } // онлайн: в воздухе слишком много — пуски ждут
      if (queue[0].L && POD[queue[0].L.key] && queue[0].L.podEl < 1) { queue[0].t = t + 0.25; queue.sort((a, b) => a.t - b.t); break; } // пакет ещё не поднят — ждём
      const q = queue.shift(), W = AG[q.key], aim = q.aimFn();
      if (W.kind === 'tbm') {
        const L = q.L, pod = POD[L.key], rail = RAIL[L.key], from = pod ? podPose(L, V(0, 0, 0), PD) : rail ? railPose(L, L.fired, V(0, 0, 0), PD) : L.pos.clone().setY(L.pos.y + 6);
        const blind = aim.u ? !aim.u.spotted : false; // по комплексу, которого не видел разведчик, — тройной промах
        L.fired++; L.lastFire = t; S.spawnMun(q.key, from, aim.p, { blind, launcher: L, podDir: pod || rail ? PD.clone() : null, owner: OWN }); // из пакета и с направляющей — по их оси
        log.push({ t, key: q.key, kind: 'tbm' });
      } else {
        S.spawnMun(q.key, q.from, aim.p, { ...(q.o || {}), route: q.o && q.o.route ? q.o.route : q.route ? q.route.map((v) => v.clone()) : null, alt: q.alt, owner: OWN });
        log.push({ t, key: q.key, kind: W.kind });
      }
    }
  }
  // ещё будут пуски (волна не кончилась)
  const pending = () => queue.length > 0 || carriers.some((a) => !a.dead && !a.out && a.salvo.length > 0);
  // ход удара для ленты событий: что летит, что будет и когда (eta — через сколько секунд событие; {eta} в sub — сюда лента
  // подставляет оставшееся время на месте: у онлайна sub приходит раз в секунду, а время идёт каждый кадр; obj — за чем смотреть сейчас;
  // cue — за чем смотреть, когда событие наступит: носитель перед пуском, пусковая перед стартом)
  function events() {
    const out = [];
    const recon = S.wpns.find((w) => w.ev && w.W.recon && !w.dead && mineW(w)), rq = queue.find((q) => AG[q.key].recon);
    if (recon || rq) out.push({ g: 'Разведка', label: AG[(recon || rq).key].short, sub: recon ? tr('в воздухе · засечено ПВО: {0}', [S.units.filter((u) => samKnown(u)).length]) : tr('вылет'), obj: recon || null, eta: rq ? rq.t - t : null });
    for (const [k, tot] of comp) { // дроны — группой по типу
      const W = AG[k]; if (!W.uav || W.recon) continue;
      const fly = S.wpns.filter((w) => w.key === k && !w.dead && mineW(w)), wait = queue.filter((q) => q.key === k), gone = log.filter((e) => e.key === k).length - fly.length;
      out.push({ g: 'Дроны', label: `${W.short} ×${tot}`, sub: tr('в воздухе {0}{1}{2}', [fly.length, wait.length ? tr(' · ещё вылетят {0}', [wait.length]) : '', gone ? tr(' · закончили полёт {0}', [gone]) : '']), obj: fly[0] || null, eta: wait.length ? wait[0].t - t : null });
    }
    for (const a of carriers) {
      const done = a.n0 - a.salvo.length, st = a.dead ? tr('сбит{0}', [a.salvo.length ? tr(' — не пущено {0}', [a.salvo.length]) : '']) : a.out ? tr('ушёл') : a.phase === 'wait' ? tr('вылет {eta}') : a.inbound ? tr('к рубежу пуска · высота {0} м', [Math.round(a.pos.y / 100) * 100]) : a.salvo.length ? tr('пуск {0}/{1}', [done, a.n0]) : tr('уходит');
      const eta = a.dead || a.out ? null : a.phase === 'wait' ? a.launchAt - t : a.inbound ? (Math.hypot(a.pos.x, a.pos.z) - a.R) / Math.max(150, a.speed) : null;
      out.push({ g: 'Носители', label: `${a.carrierName}: ${a.load.map((l) => AG[l.key].short).join(', ')}`, sub: st, obj: a.dead || a.out || a.phase === 'wait' ? null : a, eta, cue: eta !== null ? a : null });
    }
    for (const L of launchers) {
      const next = queue.find((q) => q.L === L);
      out.push({ g: 'Пусковые', label: L.name, sub: next ? tr('пуск {eta} · пущено {0}/{1}', [L.fired, L.n0]) : tr('пущено {0}/{1}', [L.fired, L.n0]), obj: L, eta: next ? next.t - t : null, cue: next ? L : null });
    }
    for (const w of S.wpns) {
      if (!w.ev || w.dead || w.W.uav || w.W.recon || !mineW(w)) continue;
      const tb = w.W.kind === 'tbm', h = Math.round(w.pos.y - city.groundH(w.pos.x, w.pos.z));
      const { t: eta, d } = S.etaOf(w); // с учётом маршрута, разворотов и разгона
      out.push({ g: tb ? 'Баллистика в полёте' : 'Крылатые в полёте', label: `${w.W.short}${w.decoy ? tr(' (ложная)') : ''}`, sub: tr('{0} · {1} км/ч · до цели {2} км · {3} с', [h > 9999 ? (h / 1000).toFixed(0) + tr(' км') : h + tr(' м'), Math.round(w.speed * 3.6), (d / 1000).toFixed(1), Math.max(0, Math.ceil(eta))]), obj: w, eta: null });
    }
    return out;
  }
  return { start, step, pending, events, applyPlan, unitInfo, extend, launchers, carriers, log, get t() { return t; }, get comp() { return comp; }, side, era };
}
