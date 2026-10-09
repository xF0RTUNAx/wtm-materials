// ИИ-налёт «Воздушного превосходства»: ударные самолёты против ПВО города (игра за ПВО и живой фон главного меню).
// Без сцены и DOM. Самолёты — на лётной модели «Летки» (flyStep), оружие и урон — через бой sim/strike.js.
// Роли: bomber — бомбы (свободнопадающие, лазерные с подсветом, ТВ) и ракеты по объекту; sead — противорадиолокационные
// ракеты по включённым РЛС; low — прорыв на малой высоте между домами со свободнопадающими бомбами.
// Уклонение: захват или пуск на СПО, датчик пуска — ловушки и диполи, отворот «траверзом» и снижение.
/* global THREE */
import { AG } from '../arsenal.js?v=20261010g';
import { makeCraft, flyStep, steerTo, fwdOf, clamp, angleBetween, D2R } from '../../drone/sim/core.js?v=20261010g';
import { predictBomb } from './strike.js?v=20261010g';
import { CITY } from '../city.js?v=20261010g';

// Ударные самолёты (обобщённые образы эпохи; без названий конкретных машин): лётные данные для flyStep
export const STRIKERS = {
  east: { name: 'Фронтовой бомбардировщик', model: 'east', hp: 70, rcs: 8, ir: 1.2, r: 11, gmax: 6.5, wCap: 0.42, agil: 4, milAcc: 13, abAcc: 24, cd0: 1.45e-4, vStall: 80, bleed: 1, rollK: 4 },
  west: { name: 'Ударный истребитель', model: 'west', hp: 60, rcs: 6, ir: 1.1, r: 10, gmax: 7.5, wCap: 0.5, agil: 4.5, milAcc: 14, abAcc: 26, cd0: 1.4e-4, vStall: 75, bleed: 1, rollK: 4.5 },
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
const V = () => new THREE.Vector3();
const TMP = V(), TMP2 = V(), DIR = V(), PI = V();

export function createRaid(S, city, rnd, opts = {}) {
  const side = opts.side || 'west', era = opts.era || 2;   // сторона и эпоха АТАКУЮЩИХ
  const planes = [];
  let pid = 1000;
  const fx = opts.fx || {};
  // волна: n самолётов, роли по номеру волны; подходят группами с разных направлений
  function spawnWave(n, wave, targets, R) {
    const loads = RAID_LOADS[side][era], groups = Math.min(3, 1 + Math.floor(n / 3));
    const bearing0 = rnd() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const g = i % groups;
      let role = 'bomber';
      if (wave >= 2 && i % 4 === 1) role = 'sead';
      else if (loads.decoyer && wave >= 2 && i % 5 === 3) role = 'decoyer';
      else if (loads.cruise && i % 4 === 2) role = 'cruise';
      else if (wave >= 3 && i % 4 === 2) role = 'low';
      else if (loads.tv && i % 3 === 2) role = 'tv';
      const tgt = targets[(i + g) % targets.length];
      const br = bearing0 + g * (Math.PI * 2 / groups) + (rnd() - 0.5) * 0.4;
      spawn(role, tgt, br, g * 25 + rnd() * 8, R);
    }
  }
  function spawn(role, tgt, bearing, delay = 0, R0) {
    const ST = STRIKERS[side], load = (RAID_LOADS[side][era][role] || RAID_LOADS[side][era].bomber).map(([k, c]) => ({ key: k, n: c }));
    const R = R0 || CITY.HALF - 600;
    const a = makeCraft({ ...ST, id: pid++, ai: true, role, side, load, tgt, hp: ST.hp, hpMax: ST.hp, cmFlare: 30, cmChaff: 30, speed: 230, thr: 0.9, delay, phase: delay > 0 ? 'wait' : 'ingress',
      cruise: role === 'low' ? 110 : role === 'sead' ? 4500 + rnd() * 1500 : 3000 + rnd() * 2500, skill: 0.4 + rnd() * 0.5, laser: null, lockPt: null, evadeT: 0, cmT: 0, relT: 0, t: 0, out: false,
      rcs: ST.rcs, massK: 1.15 });
    a.jam = Math.max(0, ...load.map((l) => AG[l.key].jam || 0)); // станция помех на подвеске
    a.pos.set(Math.sin(bearing) * R, a.cruise + (role === 'low' ? 300 : 0), Math.cos(bearing) * R);
    const to = TMP.set(tgt.x, 0, tgt.z).sub(a.pos); a.yaw = Math.atan2(-to.x, -to.z); a.pitch = 0;
    fwdOf(a, a.vel).multiplyScalar(a.speed);
    planes.push(a);
    return a;
  }
  const alive = () => planes.filter((a) => !a.dead && !a.out && a.phase !== 'wait');
  // урон: корпус, при гибели — падение
  function hurt(a, dmg) { if (a.dead) return; a.hp -= dmg; if (a.hp <= 0) { a.dead = true; a.laser = null; if (fx.down) fx.down(a); } else if (fx.hit) fx.hit(a, dmg); }
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
      a.ab = false; a.thr = 0.92;
      // угрозы: пуск по нам (СПО «пуск» или датчик пуска) — ловушки, диполи и отворот
      const rw = S.rwr(a), mw = S.mws(a), launch = rw.find((e) => e.state === 'launch'), track = rw.find((e) => e.state === 'track');
      a.cmT -= dt;
      if ((launch || mw.length) && a.cmT <= 0) {
        a.cmT = 1.4 + rnd() * 0.8;
        if (a.cmFlare > 0 && (mw.length || rnd() < 0.4)) { a.cmFlare--; S.dropCM(a, 'flare'); }
        if (a.cmChaff > 0 && launch) { a.cmChaff--; S.dropCM(a, 'chaff'); }
        if (rnd() < a.skill) a.evadeT = 3 + rnd() * 3;
      }
      if (a.evadeT > 0 && a.phase !== 'lase') { a.evadeT -= dt; evade(a, dt, (launch && launch.u.pos) || (mw[0] && mw[0].m.pos) || a.pos); a.ab = true; continue; }
      const L = curLoad(a);
      if (!L && a.phase !== 'lase') a.phase = 'egress';
      if (a.phase === 'egress') {
        // уход к ближнему краю карты на форсаже
        const ex = Math.abs(a.pos.x) > Math.abs(a.pos.z) ? Math.sign(a.pos.x) * CITY.HALF : a.pos.x, ez = Math.abs(a.pos.x) > Math.abs(a.pos.z) ? a.pos.z : Math.sign(a.pos.z) * CITY.HALF;
        a.ab = true; steerToward(a, TMP2.set(ex, 0, ez), a.role === 'low' ? 120 : 3500, dt);
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
        if (best && a.relT <= 0) { L.n--; S.release(a, L.key, { target: best }); a.relT = 2.5; if (fx.release) fx.release(a, L.key); }
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
          L.n--; S.release(a, L.key, { aim }); a.relT = W.kind === 'decoy' ? 1.2 : 2.5; if (fx.release) fx.release(a, L.key);
        }
        steerToward(a, aim, a.cruise, dt);
        if (a.t > 220) a.phase = 'egress';
      } else if (W.kind === 'bomb' || W.kind === 'lgb' || W.kind === 'tvb' || W.kind === 'gps') {
        // бомба: прогноз падения; сброс, когда точка падения у цели (у управляемых — когда достанет)
        const guided = W.kind !== 'bomb';
        const tImp = a.relT <= 0 && d < 16000 ? predictBomb(city, W, a.pos, a.vel, guided ? aim : null, TMP2) : -1;
        const miss = tImp > 0 ? TMP2.distanceTo(aim) : 1e9;
        if (miss < (guided ? 14 : Math.max(18, W.blast * 0.5))) {
          L.n--; S.release(a, L.key, guided ? { aim } : {}); a.relT = guided ? 1.2 : 0.25; if (fx.release) fx.release(a, L.key);
          if (W.kind === 'lgb') { a.lockPt = aim.clone(); a.phase = 'lase'; }
          else if (!guided && L.n % 2 === 1 && L.n > 0) a.relT = 0.25; // серия по две
        }
        steerToward(a, aim, a.cruise, dt);
        if (d < 600 && tImp < 0) { a.relT = 0; }
        if (a.t > 220) a.phase = 'egress';
      } else {
        // ракета: ТВ — пуск по захваченной точке в зоне; лазерная — пуск и подсвет
        if (d < W.rmax * 0.8 && angleBetween(fwdOf(a, DIR), TMP.copy(aim).sub(a.pos)) < W.fov * 0.7 * D2R && a.relT <= 0) {
          L.n--; S.release(a, L.key, { aim }); a.relT = 2; if (fx.release) fx.release(a, L.key);
          if (W.seeker === 'laser') { a.lockPt = aim.clone(); a.phase = 'lase'; }
        }
        steerToward(a, aim, Math.min(a.cruise, 2500), dt);
        if (a.t > 220) a.phase = 'egress';
      }
      // попадание в землю или дом — гибель
      if (a.pos.y < city.topAt(a.pos.x, a.pos.z) + 3) { a.dead = true; a.laser = null; if (fx.down) fx.down(a); }
    }
  }
  return { planes, spawn, spawnWave, spawnDecoy, step, hurt, alive, laserSpot: (a) => a.laser };
}
