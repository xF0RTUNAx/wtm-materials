// ИИ-налёт «Воздушного превосходства»: ударные самолёты против ПВО города (игра за ПВО и живой фон главного меню).
// Без сцены и DOM. Самолёты — на лётной модели «Летки» (flyStep), оружие и урон — через бой sim/strike.js.
// Роли: bomber — бомбы (свободнопадающие, лазерные с подсветом, ТВ) и ракеты по объекту; sead — противорадиолокационные
// ракеты по включённым РЛС; low — прорыв на малой высоте между домами со свободнопадающими бомбами;
// carrier — носитель «Мульти-волны» (sim/combined.js): у края района пускает крылатые ракеты и ложные цели и уходит.
// Уклонение: захват или пуск на СПО, датчик пуска — ловушки и диполи, отворот «траверзом» и снижение.
/* global THREE */
import { tr } from '../i18n.js?v=20261022t';
import { AG, raidPlane } from '../arsenal.js?v=20261022t';
import { flightModel, loadOf } from './flight.js?v=20261022t';
import { initDamage, hitZones, burnRate } from './damage.js?v=20261022t';
import { cmOf } from './cm.js?v=20261022t';
import { setGround, makeCraft, flyStep, steerTo, fwdOf, clamp, angleBetween, D2R } from '../../drone/sim/core.js?v=20261022t';
import { predictBomb, predictRocket } from './strike.js?v=20261022t';
import { heliModel, heliStep, heliInit, touchVerdict } from './heli.js?v=20261022t';
import { CITY } from '../city.js?v=20261022t';

// Ударные самолёты (обобщённые образы эпохи; без названий конкретных машин): лётные данные для flyStep
export const STRIKERS = {
  east: { name: tr('Фронтовой бомбардировщик'), model: 'east', hp: 70, rcs: 8, ir: 1.2, r: 11, gmax: 6.5, wCap: 0.42, agil: 4, milAcc: 13, abAcc: 24, cd0: 1.45e-4, vStall: 80, bleed: 1, rollK: 4 },
  west: { name: tr('Ударный истребитель'), model: 'west', hp: 60, rcs: 6, ir: 1.1, r: 10, gmax: 7.5, wCap: 0.5, agil: 4.5, milAcc: 14, abAcc: 26, cd0: 1.4e-4, vStall: 75, bleed: 1, rollK: 4.5 },
};
// подвески ИИ по стороне атакующих и эпохе: роль → [[оружие, сколько]]
export const RAID_LOADS = {
  west: { 1: { bomber: [['mk82', 6]], sead: [['agm45', 2], ['mk82', 2]], low: [['mk82', 4]] },
    2: { bomber: [['gbu12', 4]], tv: [['agm65b', 4]], sead: [['agm88', 2], ['gbu12', 2]], low: [['mk82', 4]] },
    3: { bomber: [['gbu31', 2], ['ecm_w', 1]], tv: [['agm65b', 4]], sead: [['agm88', 2], ['ecm_w', 1]], low: [['mk82', 4]] },
    4: { bomber: [['gbu39', 4], ['ecm_w', 1]], cruise: [['jassm', 2]], sead: [['aargm', 2], ['ecm_w', 1]], decoyer: [['mald', 4]], low: [['gbu39', 2]] } },
  east: { 1: { bomber: [['fab500', 4]], sead: [['kh28', 2]], low: [['fab500', 2]] },
    2: { bomber: [['kab500l', 2], ['kab500kr', 2]], tv: [['kh29t', 2], ['kh25ml', 2]], sead: [['kh58', 2]], low: [['fab500', 4]] },
    3: { bomber: [['kab500s', 3], ['ecm_e', 1]], tv: [['kh29t', 2]], sead: [['kh31p', 2], ['ecm_e', 1]], low: [['fab500', 4]] },
    4: { bomber: [['umpk', 2], ['ecm_e', 1]], cruise: [['kh59mk2', 2]], sead: [['kh31p', 2], ['ecm_e', 1]], decoyer: [['decoy_e', 4]], low: [['fab500', 4]] } },
};
// вертолёты налёта (Хеллоуин 2026) по стороне и эпохе: модель и подвеска — как у игрока (arsenal.js, подвески heli)
export const RAID_HELI = {
  east: { 1: ['h_mi24', [['shturm', 4], ['s8', 2]]], 2: ['h_mi8', [['s8', 4]]], 3: ['h_ka50', [['ataka', 8], ['s8', 2]]], 4: ['h_ka52', [['ataka', 8], ['s8', 2]]] },
  west: { 1: ['h_uh1', [['hydra', 2]]], 2: ['h_uh60', [['hellfire', 4], ['hydra', 2]]], 3: ['h_ah64', [['hellfire', 8], ['hydra', 2]]], 4: ['h_rah66', [['hellfire', 6], ['hydra', 2]]] },
};
// вторые вертолёты эпохи (Mark 2026-10-21 — вернуть в налёты вместе с новыми): в налёте вертолёты чередуются
export const RAID_HELI2 = {
  east: { 3: ['h_mi28', [['ataka', 8], ['s8', 2]]] },
  west: { 2: ['h_ah1', [['hellfire', 8], ['hydra', 2]]] },
};
const V = () => new THREE.Vector3();
const TMP = V(), TMP2 = V(), DIR = V(), PI = V(), PR = V(); // PR — точка падения НАР (не PI: там точка прицеливания — была одна на двоих, промах всегда 0)

export function createRaid(S, city, rnd, opts = {}) {
  setGround(city.groundH); // рельеф города — в той же копии core.js, что у налёта (сервер и проверки грузят её по другому адресу)
  const side = opts.side || 'west', era = opts.era || 2;   // сторона и эпоха АТАКУЮЩИХ
  const planes = [];
  let pid = 1000;
  const fx = opts.fx || {};
  // сложность одиночной обороны (difficulty.js, ставит игра): skill — прибавка к умению пилотов, early — ПРР и ложные цели с 1-й волны
  const H = { skill: 0, early: false };
  // волна: n самолётов, роли по номеру волны; подходят группами с разных направлений
  function spawnWave(n, wave, targets, R) {
    const loads = RAID_LOADS[side][era], groups = Math.min(3, 1 + Math.floor(n / 3));
    const bearing0 = rnd() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const g = i % groups;
      let role = 'bomber';
      if ((wave >= 2 || H.early) && i % 4 === 1) role = 'sead';
      else if (loads.decoyer && (wave >= 2 || H.early) && i % 5 === 3) role = 'decoyer';
      else if (loads.cruise && i % 4 === 2) role = 'cruise';
      else if (wave >= 3 && i % 4 === 2) role = 'low';
      else if (loads.tv && i % 3 === 2) role = 'tv';
      const tgt = targets[(i + g) % targets.length];
      const br = bearing0 + g * (Math.PI * 2 / groups) + (rnd() - 0.5) * 0.4;
      spawn(role, tgt, br, g * 25 + rnd() * 8, R);
    }
    // вертолёты — со 2-й волны (с 4-й — пара): подходят по рельефу с 9 км, прячась за холмами
    if (wave >= 2 && RAID_HELI[side] && RAID_HELI[side][era] && opts.helis !== false) for (let k = 0; k < (wave >= 4 ? 2 : 1); k++) spawn('heli', targets[(k + wave) % targets.length], bearing0 + Math.PI + (k - 0.5) * 0.6, 10 + k * 12 + rnd() * 10, Math.min(R || 9000, 9000));
  }
  // o — поправки для особых ролей (носитель «Мульти-волны»: plane, load, cruise, hp, rcs, salvo)
  function spawn(role, tgt, bearing, delay = 0, R0, o = {}) {
    const ST = STRIKERS[side], load = o.load || (RAID_LOADS[side][era][role] || RAID_LOADS[side][era].bomber).map(([k, c]) => ({ key: k, n: c }));
    const R = R0 || CITY.HALF - 600;
    const a = makeCraft({ ...ST, id: pid++, ai: true, role, side, load, tgt, hp: ST.hp, hpMax: ST.hp, cmFlare: 30, cmChaff: 30, speed: 230, thr: 0.9, delay, phase: delay > 0 ? 'wait' : 'ingress',
      cruise: role === 'low' ? 110 : role === 'sead' ? 4500 + rnd() * 1500 : 3000 + rnd() * 2500, skill: Math.min(1, 0.4 + rnd() * 0.5 + H.skill), laser: null, lockPt: null, evadeT: 0, cmT: 0, relT: 0, t: 0, out: false,
      rcs: ST.rcs, massK: 1.15 });
    if (o.cruise) Object.assign(a, o, { hpMax: o.hp || a.hpMax, t: 0 });
    a.jam = Math.max(0, ...load.map((l) => AG[l.key].jam || 0)); // станция помех на подвеске
    // свои ТТХ самолёта (sim/flight.js): модель — как в отрисовке (носитель — o.plane); ИИ — честная лётная модель
    if (role === 'heli') return spawnHeli(a, bearing, R0 || 9000);
    a.model = o.plane || raidPlane(side, era, role); a.fm = flightModel(a.model) || null;
    if (!cmOf(a.model, side).flare) a.cmFlare = 0; // старые машины — без ЛТЦ: только диполи (sim/cm.js)
    if (a.fm) { a.fuel = 0.8; setLoad(a); a.speed = Math.min(a.speed, a.fm.s.vSL / 3.6 * 0.7); initDamage(a); }
    a.pos.set(Math.sin(bearing) * R, a.cruise + (role === 'low' ? 300 : 0), Math.cos(bearing) * R);
    const to = TMP.set(tgt.x, 0, tgt.z).sub(a.pos); a.yaw = Math.atan2(-to.x, -to.z); a.pitch = 0;
    if (role === 'carrier') { // носитель: заходит из-за края карты (o.R0) к рубежу пуска (o.R), там — вдоль края района
      a.R = o.R; a.b = bearing; a.inbound = true; a.relT = 2;
      a.pos.set(Math.sin(bearing) * R, a.cruise, Math.cos(bearing) * R); a.yaw = Math.atan2(Math.sin(bearing), Math.cos(bearing)); fwdOf(a, a.vel).multiplyScalar(a.speed);
    }
    fwdOf(a, a.vel).multiplyScalar(a.speed);
    planes.push(a);
    return a;
  }
  // вертолёт: своя лётная модель (sim/heli.js, «Аркада» — ИИ ведёт скоростью), низко над рельефом, тепла меньше
  function spawnHeli(a, bearing, R) {
    const alt = RAID_HELI2[side] && RAID_HELI2[side][era], [model, load] = alt && (a.id % 2) ? alt : RAID_HELI[side][era]; // чётный/нечётный — разные вертолёты эпохи
    a.plane = a.model = model; a.heli = true; a.hm = heliModel(model, { arcade: true }); a.fm = null; a.load = load.map(([k, c]) => ({ key: k, n: c }));
    a.hp = a.hpMax = 45; a.ir = 0.6; a.rcs = 6; a.cmFlare = 40; a.cmChaff = 10; a.jam = 0; a.u = { cx: 0, cy: 0, col: 0, yaw: 0, yawTo: undefined, pitchTo: undefined, pitchHold: false };
    const x = Math.sin(bearing) * R, z = Math.cos(bearing) * R; a.home = new THREE.Vector3(x * 1.6, 0, z * 1.6);
    a.pos.set(x, groundOf(x, z) + 40, z); const to = TMP.set(a.tgt.x - x, 0, a.tgt.z - z); a.yaw = Math.atan2(-to.x, -to.z); a.pitch = a.roll = 0;
    a.vel.set(-Math.sin(a.yaw) * 30, 0, -Math.cos(a.yaw) * 30); a.speed = 30; heliInit(a); a.alt = 30 + rnd() * 15; a.phase = a.delay > 0 ? 'wait' : 'ingress';
    planes.push(a); return a;
  }
  const groundOf = (x, z) => Math.max(city.topAt(x, z), city.waterAt ? city.autumn.WY : CITY.WATER_Y);
  // ИИ вертолёта: заход на 30–45 м над рельефом (смотрит вперёд), у цели — подскок до прямой видимости, висение носом на цель:
  // ПТУР — пуск и подсвет до попадания (как лазерные у самолётов), НАР — нос на прицел, залп, когда точка падения у цели;
  // угроза — ловушки (выше), бросок вниз до 12 м и вбок; без оружия или подбит — уходит низко туда, откуда пришёл
  function heliAI(a, dt) {
    const u = a.u, L = curLoad(a), aim = aimPointOf(a), W = L && AG[L.key];
    u.cx = 0; u.cy = 0; u.col = 0; u.yaw = 0; u.pitchTo = undefined; u.pitchHold = false;
    if (!L && a.phase !== 'lase') a.phase = 'egress';
    if (a.dz === undefined && a.hp < a.hpMax * 0.4 && a.phase !== 'egress') a.phase = 'egress';
    let alt = a.alt, p = aim;
    if (a.phase === 'egress') { const hh = Math.hypot(a.home.x, a.home.z) || 1; p = TMP2.set(a.home.x / hh * (CITY.HALF + 2000), 0, a.home.z / hh * (CITY.HALF + 2000)); u.cy = 1; /* уходит за край карты (точка прихода в обороне — внутри карты: долетал и кружил) */ if (Math.hypot(a.pos.x, a.pos.z) > CITY.HALF - 400) { a.out = true; if (fx.out) fx.out(a); return; } }
    TMP.set(p.x - a.pos.x, 0, p.z - a.pos.z); const d = TMP.length() || 1; u.yawTo = Math.atan2(-TMP.x, -TMP.z);
    if (a.evadeT > 0) { a.evadeT -= dt; alt = 12; u.cx = a.id % 2 ? 1 : -1; u.cy = 0.6; u.yawTo = undefined; }
    else if (a.phase === 'ingress' || a.phase === 'lase') {
      const stand = Math.min(a.stand || 1e9, W && W.kind === 'rocket' ? 2200 : W ? Math.min(W.rmax * 0.7, 5000) : 3000); // a.stand — подполз ближе (цель за холмами)
      u.cy = clamp((d - stand) / 1500, -0.2, 1);
      if (d < stand * 1.4) {
        // у цели: подскок, пока цель закрыта рельефом или домами (до 180 м), иначе — висение на этой высоте
        const see = city.los(a.pos.x, a.pos.y - 1.5, a.pos.z, aim.x, aim.y, aim.z, 3);
        a.pop = clamp((a.pop || alt) + (see ? 0 : 14 * dt), alt, 180); alt = a.pop;
        a.blindT = see || a.pop < 179 ? 0 : (a.blindT || 0) + dt;
        if (a.blindT > 4) { a.blindT = 0; a.pop = alt; if (stand <= 600) a.phase = 'egress'; else a.stand = stand <= 1200 ? 600 : Math.max(1200, stand - 700); } // и на 180 м не видно — ближе; вплотную не видно (дно оврага) — уходит
        const face = Math.abs(Math.atan2(Math.sin(u.yawTo - a.yaw), Math.cos(u.yawTo - a.yaw))) < 0.08, steady = a.speed < 12 && Math.abs(a.pitch) < 0.12; // пуск — с висения, нос почти в горизонт
        if (a.phase === 'lase') u.cy = 0; // подсвет: висит на месте (сдвинется — цель закроет рельеф)
        a.relT -= dt;
        if (a.phase === 'lase') { a.laser = see ? aim.clone() : null; if (!S.wpns.some((w) => w.owner === a && !w.dead)) { a.laser = null; a.phase = 'ingress'; a.relT = 1.5 + rnd(); } }
        else if (W && W.kind === 'rocket') {
          // НАР: нос — на точку цели (с поправкой на снижение ракеты), залп — когда точка падения ближе 30 м
          a.pop = Math.max(a.pop || alt, 90); alt = a.pop; // залп НАР — с подскока ~90 м (нос вниз у самой земли — разбивался)
          const el = Math.atan2(aim.y - a.pos.y, d); u.pitchTo = el + (a.rk || 0); u.pitchHold = true; u.cy = 0;
          fwdOf(a, DIR); const t = predictRocket(city, W, TMP2.copy(a.pos).add(TMP.set(0, -2.5, 0)), DIR, Math.max(0, a.vel.dot(DIR)), PR);
          if (t > 0) { const err = Math.hypot(PR.x - aim.x, PR.z - aim.z) * (Math.hypot(PR.x - a.pos.x, PR.z - a.pos.z) < d ? 1 : -1); a.rk = clamp((a.rk || 0) + err * 0.00002 * dt * 60, -0.15, 0.12); if (Math.abs(err) < 30 && face && see && a.relT <= 0) { for (let k = 0; k < W.salvo; k++) S.release(a, L.key, {}); if ((L.rs = (L.rs ?? Math.ceil(W.load / W.salvo)) - 1) <= 0) { L.n--; L.rs = undefined; } a.relT = 2.5 + (1 - a.skill) * 2; if (fx.release) fx.release(a, L.key); } }
          else a.rk = clamp((a.rk || 0) - 0.003 * dt * 60, -0.15, 0.12); // перелёт дальше дальности расчёта — нос ниже
        } else if (W && see && face && steady && a.relT <= 0 && d < W.rmax * 0.9) { L.n--; S.release(a, L.key, { aim }); a.relT = 2; if (fx.release) fx.release(a, L.key); if (W.seeker === 'laser') { a.laser = aim.clone(); a.phase = 'lase'; } }
      }
    }
    // высота: не ниже рельефа впереди (100–600 м по курсу), газ — к нужной
    let floor = groundOf(a.pos.x, a.pos.z); fwdOf(a, DIR); const hx = Math.hypot(DIR.x, DIR.z) || 1;
    for (const s of [80, 200, 400, 650]) floor = Math.max(floor, groundOf(a.pos.x + DIR.x / hx * s, a.pos.z + DIR.z / hx * s) - s * 0.04);
    u.col = clamp((floor + alt - a.pos.y) / 12 - a.vel.y * 0.12, -1, 1);
    const ev = heliStep(a, a.hm, u, dt, { groundY: groundOf(a.pos.x, a.pos.z), gear: 2 }); a.thr = a.col;
    if (ev && ev.touch !== undefined && touchVerdict(ev) === 'crash') { a.dead = true; a.laser = null; if (fx.down) fx.down(a); }
    else if (ev && ev.touch !== undefined) { a.vel.y = Math.abs(a.vel.y) * 0.3; a.pos.y += 0.5; }
  }
  // оторвало консоль: подвески на ней (внешние пилоны — примерно четверть груза под крылом) уходят вместе с ней
  function loseCons(a) { for (const l of a.load) { const k = AG[l.key]; if (!k || k.kind === 'ecm' || l.n < 2) continue; l.n -= Math.max(1, Math.floor(l.n / 4)); } setLoad(a); }
  // груз и сопротивление подвесок → лётная модель (после каждого пуска и сброса)
  function setLoad(a) { if (!a.fm) return; const L = loadOf(a.fm.key, a.load.map((l) => ({ mass: (AG[l.key] || {}).mass || 0, n: l.n }))); a.payload = L.payload; a.dragK = L.dragK; }
  const alive = () => planes.filter((a) => !a.dead && !a.out && a.phase !== 'wait');
  // урон: корпус, при гибели — падение
  // from — точка подрыва: зоны повреждений (sim/damage.js) — отрыв частей, пожар, потеря тяги и управления
  function hurt(a, dmg, from = null) { if (a.dead) return; a.hp -= dmg; if (a.dz) { a.dmgEv = hitZones(a, dmg, from, rnd); if (a.dmgEv.some((e) => e === 'consL' || e === 'consR')) loseCons(a); } if (a.hp <= 0) { a.dead = true; a.laser = null; if (fx.down) fx.down(a); } else if (fx.hit) fx.hit(a, dmg); }
  const curLoad = (a) => a.load.find((l) => l.n > 0 && AG[l.key].kind !== 'ecm');
  // ложная цель (MALD): для РЛС — самолёт; летит к точке и кружит, пока не кончится топливо
  function spawnDecoy(src, key, aimPt) {
    const W = AG[key], f = fwdOf(src, V());
    const d = makeCraft({ id: pid++, ai: true, role: 'decoy', decoyKey: key, side: src.side || side, load: [], hp: 6, rcs: W.rcs, ir: 0.25, r: 2,
      gmax: 5, wCap: 0.4, agil: 3, milAcc: 12, abAcc: 12, cd0: 1.2e-4, vStall: 60, bleed: 1, rollK: 3, speed: Math.max(src.speed, W.speed), thr: 1,
      life: W.life, cruise: Math.max(800, src.pos.y), phase: 'ingress', t: 0, cmFlare: 0, cmChaff: 0, skill: 0, evadeT: 0, cmT: 0, relT: 0, out: false });
    d.tgt = aimPt ? { x: aimPt.x, z: aimPt.z } : { x: src.pos.x + f.x * 15000, z: src.pos.z + f.z * 15000 };
    d.pos.copy(src.pos).addScaledVector(f, 25).y -= 6; d.yaw = src.yaw; d.pitch = 0; fwdOf(d, d.vel).multiplyScalar(d.speed);
    planes.push(d);
    return d;
  }
  function aimPointOf(a) { const t = a.tgt; return PI.set(t.x + (a.id % 3 - 1) * 15, city.topAt(t.x, t.z) + 2, t.z + ((a.id >> 2) % 3 - 1) * 15); }
  // полёт к точке на высоте h с облётом крыш (смотрим вперёд на 300 и 700 м)
  function fly(a, dir, dt, k = 2.2) { const [rx, ry] = steerTo(a, dir, k); flyStep(a, rx, ry, dt); } // полёт носом по направлению dir
  function steerToward(a, p, h, dt) {
    TMP.set(p.x - a.pos.x, 0, p.z - a.pos.z); const dh = TMP.length() || 1; TMP.divideScalar(dh);
    let floor = 0;
    for (const L of [250, 600, 1100]) { const x = a.pos.x + TMP.x * L, z = a.pos.z + TMP.z * L; floor = Math.max(floor, city.topAt(x, z)); }
    const want = Math.max(h + (a.role === 'low' ? city.groundH(a.pos.x, a.pos.z) : 0), floor + 70);
    DIR.copy(TMP); DIR.y = clamp((want - a.pos.y) / 900, -0.3, 0.35); DIR.normalize();
    const [rx, ry] = steerTo(a, DIR, 2.2);
    flyStep(a, rx, ry, dt);
  }
  function evade(a, dt, threatPos) {
    // отворот: угроза на 3 или 9 часов, со снижением (до 150 м над крышами)
    TMP.copy(threatPos).sub(a.pos); TMP.y = 0; TMP.normalize();
    const s = a.id % 2 ? 1 : -1; DIR.set(-TMP.z * s, 0, TMP.x * s);
    DIR.y = clamp((city.topAt(a.pos.x, a.pos.z) + 200 - a.pos.y) / 900, -0.4, 0.1); DIR.normalize();
    const [rx, ry] = steerTo(a, DIR, 3); flyStep(a, rx, ry, dt);
  }
  function step(dt) {
    for (const a of planes) {
      if (a.dead || a.out) continue;
      a.t += dt;
      // повреждения: пожар и оторванные части добивают самолёт; сильно подбитый (тяга < ½, нет консоли) бросает задачу и уходит
      if (a.dz && !a.script) {
        const burn = burnRate(a); // пожар, весь хвост оторван — падает; без консоли — держится и уходит
        if (burn) { a.hp -= burn * dt; if (a.hp <= 0) { a.dead = true; a.laser = null; if (fx.down) fx.down(a); continue; } }
        if (a.leak) a.fuel = Math.max(0, a.fuel - a.leak * dt);
        if ((a.thrK < 0.5 || a.det.consL || a.det.consR) && a.phase === 'ingress' && a.role !== 'carrier') a.phase = 'egress';
      }
      if (a.phase === 'wait') { a.delay -= dt; if (a.delay <= 0) a.phase = 'ingress'; continue; }
      if (a.script) { a.script(a, dt, fly); continue; } // постановка (промо-ролик, tools/airdef-promo): полёт задаёт сценарий
      if (a.role === 'decoy') {
        a.life -= dt;
        const dd = Math.hypot(a.tgt.x - a.pos.x, a.tgt.z - a.pos.z);
        steerToward(a, dd > 1500 ? TMP2.set(a.tgt.x, 0, a.tgt.z) : TMP2.set(a.tgt.x + Math.sin(a.t * 0.2) * 3000, 0, a.tgt.z + Math.cos(a.t * 0.2) * 3000), a.cruise, dt);
        if (a.life <= 0 || Math.abs(a.pos.x) > CITY.HALF - 200 || Math.abs(a.pos.z) > CITY.HALF - 200) { a.out = true; if (fx.out) fx.out(a); }
        else if (a.pos.y < city.topAt(a.pos.x, a.pos.z) + 3) { a.dead = true; if (fx.down) fx.down(a); }
        continue;
      }
      a.ab = false; if (!a.heli) a.thr = 0.92;
      // угрозы: пуск по нам (СПО «пуск» или датчик пуска) — ловушки, диполи и отворот
      const rw = S.rwr(a), mw = S.mws(a), launch = rw.find((e) => e.state === 'launch'), track = rw.find((e) => e.state === 'track');
      a.cmT -= dt;
      if ((launch || mw.length) && a.cmT <= 0) {
        a.cmT = 1.4 + rnd() * 0.8;
        if (a.cmFlare > 0 && (mw.length || rnd() < 0.4)) { a.cmFlare--; S.dropCM(a, 'flare'); }
        if (a.cmChaff > 0 && launch) { a.cmChaff--; S.dropCM(a, 'chaff'); }
        if (rnd() < a.skill) a.evadeT = 3 + rnd() * 3;
      }
      if (a.heli) { heliAI(a, dt); continue; }
      if (a.role === 'carrier') {
        // носитель «Мульти-волны»: идёт прямо к рубежу a.R (за краем района — ПВО не достаёт), там ходит по дуге и пускает
        // каждую ракету в её время (q.t — от начала боя, a.t — тоже), по своему курсу (ракета сама разворачивается к цели);
        // последний пуск — разворот и уход за край карты
        a.immune = true; // носитель в жизни — за сотни км: ПВО района его не достаёт (на развороте он может зайти за край — всё равно)
        const r0 = Math.hypot(a.pos.x, a.pos.z) || 1;
        if (a.phase === 'egress') {
          steerToward(a, TMP2.set(a.pos.x / r0 * (r0 + 6000), 0, a.pos.z / r0 * (r0 + 6000)), a.cruise, dt); // назад, от района
          if (r0 > CITY.HALF + 9500) { a.out = true; if (fx.out) fx.out(a); }
          continue;
        }
        if (a.inbound) {
          steerToward(a, TMP2.set(a.pos.x - a.pos.x / r0 * 3000, 0, a.pos.z - a.pos.z / r0 * 3000), a.cruise, dt);
          if (r0 <= a.R + 300) { a.inbound = false; a.b = Math.atan2(a.pos.x, a.pos.z); }
          continue;
        }
        // перед воздушным пуском баллистики («Кинжал») — крылья в горизонт и нос вверх: 4 с прямо и с набором высоты
        const nq = a.salvo[0], airTbm = nq && AG[nq.key] && AG[nq.key].kind === 'tbm' && AG[nq.key].air, soon = airTbm && a.relT < 4 && a.t + (a.t0 || 0) >= (nq.t ?? 0) - 4;
        if (soon) { fwdOf(a, DIR); steerToward(a, TMP2.set(a.pos.x + DIR.x * 9000, 0, a.pos.z + DIR.z * 9000), a.cruise + 2500, dt); }
        else { a.b += (a.speed / a.R) * dt; steerToward(a, TMP2.set(Math.sin(a.b + 0.25) * a.R, 0, Math.cos(a.b + 0.25) * a.R), a.cruise, dt); }
        a.relT -= dt;
        if (a.relT <= 0 && a.salvo.length && a.t + (a.t0 || 0) >= (a.salvo[0].t ?? 0)) { // время волны = a.t0 (когда заказан) + своё
          const q = a.salvo.shift(), L = a.load.find((l) => l.key === q.key && l.n > 0); if (L) { L.n--; setLoad(a); }
          // цель — в момент пуска (по ПВО — только по уже засечённым комплексам), маршрут и высота — по плану
          const aim = q.aimFn ? q.aimFn() : q.aim;
          const air = AG[q.key] && AG[q.key].kind === 'tbm' && AG[q.key].air;
          if (air && a.q) TMP.set(0, -2.45, -1.5).applyQuaternion(a.q).add(a.pos); else { TMP.copy(a.pos); TMP.y -= 8; } // «Кинжал» — с подфюзеляжного пилона (как висел)
          const w = S.spawnMun(q.key, TMP, aim.p || aim, { owner: a, route: q.route ? q.route.map((v) => v.clone()) : null, alt: q.alt, dir: fwdOf(a, DIR).clone(),
            ...(air ? { air: true, vel: a.vel.clone(), up: a.q ? new THREE.Vector3(0, 1, 0).applyQuaternion(a.q) : null } : {}) }); a.relT = a.every;
          if (q.done) q.done(w); if (fx.release) fx.release(a, q.key);
        }
        if (!a.salvo.length) a.phase = 'egress';
        continue;
      }
      // страховка: на отходе тихоходный штурмовик (Су-25 с ракетами) под пусками ЗУР уворачивается без конца и не доходит до края — волна
      // висела (ui-test, сторона запад, эпоха II; было и на сайте): через 60 с отхода — «ушёл»
      if (a.phase === 'egress' && (a.egT = (a.egT || 0) + dt) > 60) { a.out = true; if (fx.out) fx.out(a); continue; }
      if (a.evadeT > 0 && a.phase !== 'lase') { a.evadeT -= dt; evade(a, dt, (launch && launch.u.pos) || (mw[0] && mw[0].m.pos) || a.pos); a.ab = true; continue; }
      const L = curLoad(a);
      if (!L && a.phase !== 'lase') a.phase = 'egress';
      if (a.phase === 'egress') {
        // уход к ближнему краю карты на форсаже
        const ex = Math.abs(a.pos.x) > Math.abs(a.pos.z) ? Math.sign(a.pos.x) * CITY.HALF : a.pos.x, ez = Math.abs(a.pos.x) > Math.abs(a.pos.z) ? a.pos.z : Math.sign(a.pos.z) * CITY.HALF;
        a.ab = a.role !== 'carrier'; steerToward(a, TMP2.set(ex, 0, ez), a.role === 'low' ? 120 : a.role === 'carrier' ? a.cruise : 3500, dt);
        if (Math.abs(a.pos.x) > CITY.HALF - 250 || Math.abs(a.pos.z) > CITY.HALF - 250) { a.out = true; if (fx.out) fx.out(a); }
        continue;
      }
      if (a.phase === 'lase') {
        // подсвет до попадания: держим цель, летим по кругу вокруг неё
        const p = a.lockPt, inAir = S.wpns.some((w) => w.owner === a && !w.dead && (w.W.kind === 'lgb' || w.W.seeker === 'laser'));
        a.laser = city.los(a.pos.x, a.pos.y - 2, a.pos.z, p.x, p.y, p.z, 3) ? p : null;
        TMP.copy(p).sub(a.pos); TMP.y = 0; const d = TMP.length(); TMP.normalize();
        DIR.set(-TMP.z, 0, TMP.x).multiplyScalar(d > 6000 ? 0.3 : 1).addScaledVector(TMP, d > 6000 ? 1 : d < 3000 ? -0.4 : 0.2).normalize();
        steerToward(a, TMP2.copy(a.pos).addScaledVector(DIR, 1000), a.cruise, dt);
        if (!inAir) { a.laser = null; a.phase = curLoad(a) ? 'ingress' : 'egress'; }
        continue;
      }
      const W = AG[L.key], aim = aimPointOf(a);
      if (W.kind === 'arm') {
        // ПРР: ищем излучающую РЛС впереди в поле ГСН; если нет — к центру ПВО
        let best = null, ba = 1e9; fwdOf(a, DIR);
        for (const e of rw) { const ang = angleBetween(DIR, TMP.copy(e.u.ant).sub(a.pos)); if (ang < W.fov * D2R && e.d < W.rmax && ang < ba) { ba = ang; best = e.u; } }
        if (best && a.relT <= 0) { L.n--; setLoad(a); S.release(a, L.key, { target: best }); a.relT = 2.5; if (fx.release) fx.release(a, L.key); }
        a.relT -= dt;
        // заход на излучатель: издалека — по горизонтали на своей высоте, в зоне пуска — нос на станцию;
        // проскочили (станция под нами) — отходим на 9 км и разворачиваемся снова
        const e0 = rw[0], em = e0 ? e0.u.ant : aim, hd = Math.hypot(em.x - a.pos.x, em.z - a.pos.z);
        if (a.sOut) { TMP2.set(a.pos.x + (a.pos.x - em.x), 0, a.pos.z + (a.pos.z - em.z)); steerToward(a, TMP2, a.cruise, dt); if (hd > 9000) a.sOut = false; }
        else if (e0 && hd < W.rmax * 0.85) {
          DIR.copy(em).sub(a.pos).normalize(); DIR.y = Math.max(DIR.y, -0.55); DIR.normalize();
          const [rx, ry] = steerTo(a, DIR, 2); flyStep(a, rx, ry, dt);
          if (hd < 2500 || a.pos.y < city.topAt(a.pos.x, a.pos.z) + 600) a.sOut = true;
        } else steerToward(a, em, a.cruise, dt);
        if (a.t > 200) a.phase = 'egress';
        continue;
      }
      a.relT -= dt;
      const d = Math.hypot(aim.x - a.pos.x, aim.z - a.pos.z);
      if (W.kind === 'cruise' || W.kind === 'decoy') {
        // крылатые ракеты и ложные цели пускают издалека, носом к цели
        const range = W.kind === 'cruise' ? Math.min(W.rmax * 0.6, 22000) : 16000;
        if (d < range && a.relT <= 0 && angleBetween(fwdOf(a, DIR), TMP.set(aim.x - a.pos.x, 0, aim.z - a.pos.z)) < 40 * D2R) {
          L.n--; setLoad(a); S.release(a, L.key, { aim }); a.relT = W.kind === 'decoy' ? 1.2 : 2.5; if (fx.release) fx.release(a, L.key);
        }
        steerToward(a, aim, a.cruise, dt);
        if (a.t > 220) a.phase = 'egress';
      } else if (W.kind === 'bomb' || W.kind === 'lgb' || W.kind === 'tvb' || W.kind === 'gps') {
        // бомба: прогноз падения; сброс, когда точка падения у цели (у управляемых — когда достанет)
        const guided = W.kind !== 'bomb';
        const tImp = a.relT <= 0 && d < 16000 ? predictBomb(city, W, a.pos, a.vel, guided ? aim : null, TMP2) : -1;
        const miss = tImp > 0 ? TMP2.distanceTo(aim) : 1e9;
        if (miss < (guided ? 14 : Math.max(18, W.blast * 0.5))) {
          L.n--; setLoad(a); S.release(a, L.key, guided ? { aim } : {}); a.relT = guided ? 1.2 : 0.25; if (fx.release) fx.release(a, L.key);
          if (W.kind === 'lgb') { a.lockPt = aim.clone(); a.phase = 'lase'; }
          else if (!guided && L.n % 2 === 1 && L.n > 0) a.relT = 0.25; // серия по две
        }
        steerToward(a, aim, a.cruise, dt);
        if (d < 600 && tImp < 0) { a.relT = 0; }
        if (a.t > 220) a.phase = 'egress';
      } else {
        // ракета: ТВ — пуск по захваченной точке в зоне; лазерная — пуск и подсвет
        if (d < W.rmax * 0.8 && angleBetween(fwdOf(a, DIR), TMP.copy(aim).sub(a.pos)) < W.fov * 0.7 * D2R && a.relT <= 0) {
          L.n--; setLoad(a); S.release(a, L.key, { aim }); a.relT = 2; if (fx.release) fx.release(a, L.key);
          if (W.seeker === 'laser') { a.lockPt = aim.clone(); a.phase = 'lase'; }
        }
        steerToward(a, aim, Math.min(a.cruise, 2500), dt);
        if (a.t > 220) a.phase = 'egress';
      }
      // попадание в землю или дом — гибель
      if (a.pos.y < city.topAt(a.pos.x, a.pos.z) + 3) { a.dead = true; a.laser = null; if (fx.down) fx.down(a); }
    }
  }
  return { planes, spawn, spawnWave, spawnDecoy, step, hurt, alive, laserSpot: (a) => a.laser, setHard(o) { H.skill = o.raidSkill || 0; H.early = !!o.early; } };
}
