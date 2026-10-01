// Бой «Симулятора Летки»: ракеты, ловушки, пушка, урон, РЛС и ИИ — для любого числа аппаратов в любых командах.
// Без сцены, DOM и звука: всё видимое и слышимое делает хозяин боя через хуки ctx.fx (клиент — эффекты и HUD,
// онлайн-сервер — ничего или события по сети). Хуки вызываются ровно там, где раньше стоял код эффектов, поэтому
// порядок вызовов Math.random в одиночной игре не изменился (см. tools/drone-headless: контрольная сумма боя).
//
// ctx: {
//   mode()            — параметры режима (MODES.arcade / real / training),
//   opponents(owner)  — массив противников аппарата (живых и сбитых — мёртвых пропускаем сами),
//   targetable(t)     — можно ли сейчас бить по t (у клиента игрок после конца вылета — нельзя),
//   canAct(owner)     — может ли игрок сейчас ставить помехи (у клиента — только во время боя),
//   hurt(t, amount, by, msl) — урон по аппарату игрока (у него корпус, неуязвимость, конец вылета — это логика хозяина;
//                       by — чем, msl — ракета: онлайн-сервер по ней находит, кому засчитать сбитие),
//   remoteCM(owner)   — необязательно: true — ловушки owner только показываем (онлайн: увод ракет и срыв захвата решает сервер),
//   retarget          — необязательно: раз в столько секунд ИИ заново выбирает ближайшую цель (онлайн; в одиночной игре — только когда цель сбита),
//   sunDir, sunVis()  — направление на солнце и видно ли его (ранние ИК-ГСН уводятся на солнце),
//   fx: { ... }       — хуки, все необязательные (список — в NOOP_FX ниже),
// }
// Аппарат игрока (живой человек): human = true, radar = { contacts: Map, lock, lostT, scanT, t }, flares/chaff, rcs().
// Аппарат ИИ: S (характеристики из AC), tgt (цель), stt (РЛС сопровождает tgt), cmFlare/cmChaff, msl (подвеска).
// Онлайн-аппарат (mp = true: бот или самолёт игрока под ИИ на сервере): урон по нему тоже уходит в ctx.hurt — корпус ведёт хозяин боя.
/* global THREE */
import { MISSILES } from '../missiles.js?v=20260930l';
import { WORLD, terrainH } from '../terrain-core.js?v=20260930l';
import { clamp, D2R, G0, rhoAt, makeCraft, fwdOf, localAngles, angleBetween, agl, flyStep, steerTo,
  seekerHeat, offTailDeg, irCanSee, isNotched, dlz, closingOf, turnToward, segHitsSphere } from './core.js?v=20260930l';

const rnd = Math.random;

// РЛС «Изделия»: дальность по цели с ЭПР refRcs, обзор ±az/±el, дальность «прожига» помех
export const RADAR = { range: 36000, refRcs: 5, az: 60 * D2R, el: 35 * D2R, burn: 16000 };

// Самолёты «Подстилки улитки» (вымышленные). Подвески: [внутр. L, внутр. R, внешн. L, внешн. R] (у босса — 6 точек).
export const AC = {
  fighter: { name: '«Слизень»', code: 'СЛ', hp: 100, rcs: 3, ir: 1.0, gmax: 8, wCap: 0.5, milAcc: 12, abAcc: 25, cd0: 1.44e-4, skill: 0.45, radarR: 28000, r: 9, pts: 1000, cm: 12,
    loadouts: [['r27r', 'r27r', 'r60m', 'r60m'], ['aim7m', 'aim7m', 'aim9l', 'aim9l'], ['r27r', 'r27t', 'r73', 'r73']] },
  interceptor: { name: '«Раковина»', code: 'РК', hp: 130, rcs: 6, ir: 1.3, gmax: 6.5, wCap: 0.4, milAcc: 14, abAcc: 30, cd0: 1.3e-4, skill: 0.55, radarR: 36000, r: 12, pts: 1200, cm: 16,
    loadouts: [['r27er', 'r27er', 'r73', 'r73'], ['aim7m', 'aim7m', 'aim9l', 'aim9l']] },
  ace: { name: '«Улитка-ас»', code: 'АС', hp: 110, rcs: 1.2, ir: 0.9, gmax: 9, wCap: 0.55, milAcc: 14, abAcc: 28, cd0: 1.35e-4, skill: 0.85, radarR: 34000, r: 10, pts: 2500, cm: 24,
    loadouts: [['r77', 'r77', 'r73', 'r73'], ['aim120c', 'aim120c', 'aim9x', 'aim9x'], ['derby', 'derby', 'python5', 'python5'], ['mica_em', 'mica_em', 'mica_ir', 'mica_ir']] },
  boss: { name: '«Подстилка улитки»', code: 'ПУ', hp: 450, rcs: 25, ir: 1.8, gmax: 3, wCap: 0.18, milAcc: 8, abAcc: 10, cd0: 1.6e-4, skill: 0.6, radarR: 45000, r: 26, pts: 6000, cm: 60, jam: true,
    loadouts: [['r73', 'r33', 'r33', 'r33', 'r33', 'r73'], ['aim9l', 'aim54', 'aim54', 'aim54', 'aim54', 'aim9l']] },
};

// ЭПР аппарата: у игрока растёт с внешней подвеской (функция), у ИИ — из характеристик
export function rcsOf(t) { return typeof t.rcs === 'function' ? t.rcs() : t.S.rcs; }
export function detectR(e) { return RADAR.range * Math.min(1.4, Math.pow(rcsOf(e) / RADAR.refRcs, 0.25)); }

const NOOP_FX = {
  launchPos(owner, key, slot, out) { out.copy(owner.pos); }, // откуда стартует ракета (у клиента — с пилона)
  launched() {}, motor() {}, trail() {}, pitbull() {}, detonated() {}, missileResult() {},
  cmEmpty() {}, cmDrop() {}, aiCM() {}, lockBroken() {}, cm() {},
  hit() {}, killed() {}, shot() {}, bulletHit() {}, bulletOff() {},
  spawned() {}, aiVisual() {}, radarLost() {},
};

export function createBattle(ctx) {
  const fx = { ...NOOP_FX, ...(ctx.fx || {}) };
  const targetable = ctx.targetable || (() => true);
  const canAct = ctx.canAct || (() => true);
  const missiles = [], cms = [], bullets = [];
  for (let i = 0; i < (ctx.bullets || 180); i++) bullets.push({ on: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, owner: null, target: null, prev: new THREE.Vector3() });
  const T1 = new THREE.Vector3(), T2 = new THREE.Vector3(), T3 = new THREE.Vector3(), TG = new THREE.Vector3();

  // ═════════════ РЛС игрока ═════════════
  function radarSees(o, e) {
    const rel = T1.copy(e.pos).sub(o.pos), d = rel.length();
    const [az, el] = localAngles(o, rel);
    if (Math.abs(az) > RADAR.az || Math.abs(el) > RADAR.el) return false;
    if (e.jam && d > RADAR.burn) return 'jam';
    if (d > detectR(e)) return false;
    if (isNotched(o.pos, e)) return 'notch';
    return true;
  }
  function updateRadar(o, dt) {
    const radar = o.radar;
    radar.t += dt; radar.scanT -= dt;
    if (radar.scanT <= 0) {
      radar.scanT = 0.25;
      for (const e of ctx.opponents(o)) {
        if (e.dead) continue;
        const s = radarSees(o, e);
        if (s === true || s === 'jam') {
          const [az] = localAngles(o, T1.copy(e.pos).sub(o.pos));
          radar.contacts.set(e, { t: radar.t, az, r: e.pos.distanceTo(o.pos), alt: e.pos.y, jam: s === 'jam' });
        }
      }
      for (const [e, c] of radar.contacts) if (e.dead || radar.t - c.t > 2) radar.contacts.delete(e);
    }
    const L = radar.lock;
    if (L) {
      if (L.dead) radar.lock = null;
      else if (radarSees(o, L) === true) radar.lostT = 0;
      else { radar.lostT += dt; if (radar.lostT > 0.8) { radar.lock = null; fx.radarLost(o); } }
    }
  }
  // радиокоррекция: РЛС игрока (сопровождение или свежая отметка обзора) «видит» цель
  function radarDatalink(o, t) { const r = o.radar, c = r.contacts.get(t); return r.lock === t || (c && !c.jam && r.t - c.t < 0.6); }
  // РЛС аппарата o сопровождает t (подсвет для ПАРЛ, СПО цели слышит захват)
  function lockedOn(o, t) { return o.human ? o.radar.lock === t : (!o.dead && o.stt && o.tgt === t); }

  // ═════════════ Ракеты ═════════════
  // slot — точка подвески (клиент берёт с неё модель ракеты и положение пилона); null — старт из центра аппарата
  function launchMissile(owner, key, target, slot) {
    const M_ = MISSILES[key];
    const pos = new THREE.Vector3();
    fx.launchPos(owner, key, slot, pos);
    const dir = fwdOf(owner, new THREE.Vector3());
    const m = { key, M: M_, owner, target, pos, dir, speed: owner.speed, t: 0, flown: 0, active: false, lost: false, decoy: null, dead: false,
      lastKnown: target ? target.pos.clone() : owner.pos.clone().addScaledVector(dir, 5000), lastVel: target ? target.vel.clone() : new THREE.Vector3(), notchT: 0, trailT: 0, hit: false, seenBy: new Set() };
    missiles.push(m);
    fx.launched(m, slot);
    return m;
  }
  function missileDatalink(m, T) {
    if (T.jam) return true; // наведение на источник помех
    return m.owner.human ? radarDatalink(m.owner, T) : lockedOn(m.owner, T);
  }
  function updateMissile(m, dt) {
    const M_ = m.M; m.t += dt;
    const tb = m.t - M_.drop;
    if (tb < 0) { // сброс с пилона
      m.pos.addScaledVector(m.dir, m.speed * dt); m.pos.y -= 14 * m.t * dt * 4; return;
    }
    const acc = tb < M_.burn ? M_.acc : (M_.sustain && tb < M_.burn + M_.sustain.t ? M_.sustain.acc : 0);
    const motor = acc > 0;
    fx.motor(m, motor, tb);
    // ── наведение ──
    const T = m.target, alive = T && !T.dead && targetable(T);
    let aim = null, avel = null;
    if (m.decoy) { aim = m.decoy.pos; avel = m.decoy.vel; if (m.decoy.life <= 0) { m.decoy = null; m.lost = true; m.why = m.why || 'decoy'; } }
    else if (!m.lost) {
      if (M_.kind === 'ir') {
        if (!T && M_.ir.loal && tb > 0.4) { // захват после пуска
          let best = null, bd = 1e9;
          for (const e of ctx.opponents(m.owner)) { if (e.dead || !irCanSee(M_, e, m.pos, m.dir, 35)) continue; const d = e.pos.distanceTo(m.pos); if (d < bd) { bd = d; best = e; } }
          if (best) m.target = best;
        } else if (alive) {
          TG.copy(T.pos).sub(m.pos);
          const gimbal = M_.ir.fov >= 45 ? 80 : 40;
          if (angleBetween(m.dir, TG) > gimbal * D2R || (M_.ir.aspect < 180 && offTailDeg(T, m.pos) > M_.ir.aspect + 15)) { m.lost = true; m.why = 'gimbal'; }
          else if (M_.ir.sun && ctx.sunVis() && angleBetween(m.dir, ctx.sunDir) < 10 * D2R) { m.lost = true; m.why = 'sun'; } // ранняя ГСН «увелась» на солнце
          else { aim = T.pos; avel = T.vel; }
        }
      } else if (M_.kind === 'sarh') {
        const illuminated = alive && lockedOn(m.owner, T);
        if (illuminated) {
          if (isNotched(m.pos, T)) { m.notchT += dt; if (m.notchT > 0.4 + 1.2 * M_.eccm) { m.lost = true; m.why = 'notch'; } } else m.notchT = Math.max(0, m.notchT - dt);
          aim = T.pos; avel = T.vel;
        }
      } else {
        if (!m.active) {
          if (alive && missileDatalink(m, T)) { m.lastKnown.copy(T.pos); m.lastVel.copy(T.vel); }
          else m.lastKnown.addScaledVector(m.lastVel, dt);
          aim = m.lastKnown; avel = m.lastVel;
          if (m.pos.distanceTo(m.lastKnown) < M_.pitbull) { m.active = true; fx.pitbull(m); }
        }
        if (m.active && alive) {
          TG.copy(T.pos).sub(m.pos); const d = TG.length();
          if (d > M_.pitbull * 1.7 || angleBetween(m.dir, TG) > 60 * D2R) { m.lost = true; m.why = 'gimbal'; }
          else {
            if (isNotched(m.pos, T)) { m.notchT += dt; if (m.notchT > 0.4 + 1.2 * M_.eccm) { m.lost = true; m.why = 'notch'; } } else m.notchT = Math.max(0, m.notchT - dt);
            aim = T.pos; avel = T.vel;
          }
        }
      }
    }
    let lat = 0;
    if (aim) {
      const d = m.pos.distanceTo(aim), tgo = d / Math.max(200, m.speed);
      TG.copy(aim).addScaledVector(avel, tgo * 0.95).sub(m.pos).normalize();
      const gEff = M_.g * G0 * Math.pow(clamp(m.speed / M_.vmin, 0.3, 1), 2);
      lat = turnToward(m.dir, TG, gEff / Math.max(150, m.speed) * dt) / dt * m.speed;
    }
    const rho = rhoAt(m.pos.y);
    m.speed += (acc - M_.kd * 1e-4 * rho * m.speed * m.speed - 0.1 * lat - G0 * m.dir.y) * dt;
    const step = m.speed * dt; m.flown += step;
    m.pos.addScaledVector(m.dir, step);
    // скорость сближения с целью: после выгорания ракета, которая не догоняет, «сдыхает» (исчерпала энергию)
    if (T && !T.dead) {
      const dNow = m.pos.distanceTo(T.pos);
      if (m.dPrev !== undefined) m.closing = (m.dPrev - dNow) / dt;
      m.dPrev = dNow;
      if (!motor && m.closing !== undefined && m.closing < 15) { m.slowT = (m.slowT || 0) + dt; if (m.slowT > 2.5 && !m.lost) { m.lost = true; m.spent = true; m.why = 'energy'; } }
      else m.slowT = 0;
    }
    if (m.spent && (m.spentT = (m.spentT || 0) + dt) > 1.5) { detonate(m, false); return; }
    // след
    m.trailT -= dt;
    if (motor && m.trailT <= 0) { m.trailT = 0.025; fx.trail(m, tb); }
    // неконтактный взрыватель: сближение внутри кадра
    if (m.flown > M_.rmin * 0.6) {
      for (const e of ctx.opponents(m.owner)) {
        if (e.dead) continue;
        const px = e.pos.x - m.pos.x, py = e.pos.y - m.pos.y, pz = e.pos.z - m.pos.z;
        if (px * px + py * py + pz * pz > 600 * 600) continue;
        const vx = e.vel.x - m.dir.x * m.speed, vy = e.vel.y - m.dir.y * m.speed, vz = e.vel.z - m.dir.z * m.speed;
        const qx = px - vx * dt, qy = py - vy * dt, qz = pz - vz * dt; // положение в начале кадра
        const vv = vx * vx + vy * vy + vz * vz || 1e-6;
        const ts = clamp(-(qx * vx + qy * vy + qz * vz) / vv, 0, dt);
        const rx = qx + vx * ts, ry = qy + vy * ts, rz = qz + vz * ts, dmin = Math.hypot(rx, ry, rz);
        if (dmin < e.r * 0.4 + M_.blast * 0.7) { m.pos.set(e.pos.x - rx, e.pos.y - ry, e.pos.z - rz); detonate(m, true); return; }
      }
      if (m.decoy && m.pos.distanceTo(m.decoy.pos) < 20) { detonate(m, false); return; }
    }
    if (m.pos.y < terrainH(m.pos.x, m.pos.z) || (!motor && m.speed < Math.max(220, M_.vmin * 0.75)) || m.t > M_.life) detonate(m, false);
  }
  function detonate(m, dealDamage) {
    if (m.dead) return;
    m.dead = true;
    fx.detonated(m, dealDamage);
    if (!dealDamage) { fx.missileResult(m, false); return; }
    let hitAny = false;
    for (const e of ctx.opponents(m.owner)) {
      if (e.dead) continue;
      const d = Math.max(0, e.pos.distanceTo(m.pos) - e.r * 0.4);
      if (d < m.M.blast) { damage(e, m.M.dmg * Math.pow(1 - d / m.M.blast, 0.6), m.M.short, m); hitAny = true; if (e.human) m.hitPlayer = true; }
    }
    fx.missileResult(m, hitAny);
  }

  // ═════════════ Контрмеры: ЛТЦ и дипольные отражатели ═════════════
  function dropCM(owner, type) {
    if (owner.human) {
      if (!canAct(owner)) return;
      if (type === 'flare' ? owner.flares <= 0 : owner.chaff <= 0) { fx.cmEmpty(owner, type); return; }
      if (type === 'flare') owner.flares -= 2; else owner.chaff -= 2;
      fx.cmDrop(owner, type);
    } else {
      if (type === 'flare' ? owner.cmFlare <= 0 : owner.cmChaff <= 0) return;
      if (type === 'flare') owner.cmFlare -= 2; else owner.cmChaff -= 2;
      fx.aiCM(owner, type);
    }
    const last = spawnCMs(owner, type);
    if (ctx.remoteCM && ctx.remoteCM(owner)) return;
    // ракеты, наведённые на owner, могут переключиться на ловушку / отражатели
    for (const m of missiles) {
      if (m.dead || m.target !== owner || m.decoy || m.lost || m.pos.distanceTo(owner.pos) > 7000) continue;
      if (type === 'flare' && m.M.kind === 'ir') {
        const heat = seekerHeat(owner, m.pos);
        if (rnd() < clamp((1 - m.M.ir.irccm) * 1.7 / (1.7 + heat), 0, 0.92)) { m.decoy = last; m.why = 'flare'; }
      } else if (type === 'chaff' && m.M.kind !== 'ir' && (m.M.kind === 'sarh' || m.active)) {
        if (rnd() < (1 - m.M.eccm) * (isNotched(m.pos, owner) ? 0.85 : 0.22)) { m.decoy = last; m.why = 'chaff'; }
      }
    }
    if (type === 'chaff') { // срыв сопровождения РЛС противников
      for (const o of ctx.opponents(owner)) {
        if (o.human) {
          if (o.radar.lock === owner && rnd() < (isNotched(o.pos, owner) ? 0.8 : 0.15)) { o.radar.lock = null; fx.lockBroken(o); }
        } else if (o.stt && o.tgt === owner && !o.dead && rnd() < (isNotched(o.pos, owner) ? 0.8 : 0.2) * (1 - 0.3 * o.skill)) { o.stt = false; o.sttCD = 2; }
      }
    }
  }
  // пара ловушек из-под owner (только сами ловушки — без счётчиков и увода ракет); возвращает последнюю
  function spawnCMs(owner, type) {
    let last = null;
    for (let k = 0; k < 2; k++) {
      const c = { type, owner, pos: owner.pos.clone(), vel: owner.vel.clone().multiplyScalar(0.8).add(new THREE.Vector3((rnd() - 0.5) * 30, -20 - rnd() * 15, (rnd() - 0.5) * 30)), life: type === 'flare' ? 4 : 3.5 };
      cms.push(c); last = c;
    }
    while (cms.length > 160) cms.shift();
    return last;
  }
  function updateCMs(dt) {
    for (let i = cms.length - 1; i >= 0; i--) {
      const c = cms[i]; c.life -= dt;
      c.vel.multiplyScalar(Math.max(0, 1 - (c.type === 'flare' ? 0.9 : 2.5) * dt)); c.vel.y -= (c.type === 'flare' ? 8 : 2) * dt;
      c.pos.addScaledVector(c.vel, dt);
      fx.cm(c);
      if (c.life <= 0) cms.splice(i, 1);
    }
  }

  // ═════════════ Урон и сбитие ═════════════
  // by — чем (для ленты сбитых), msl — ракета (дальний пуск даёт бонус очков), src — кто стрелял (пушка)
  function damage(e, amount, by, msl, src) {
    if (e.dead) return;
    if (e.human || e.mp) { ctx.hurt(e, amount * ctx.mode().dmgTaken, by, msl, src); return; }
    e.hp -= amount;
    fx.hit(e, amount, by);
    if (e.hp <= 0) kill(e, by, msl);
  }
  function kill(e, by, msl) { e.dead = true; fx.killed(e, by, msl); }

  // ═════════════ Пушка ═════════════
  function fireBullet(owner, target, dmg) {
    const b = bullets.find((x) => !x.on); if (!b) return;
    fwdOf(owner, T3);
    b.on = true; b.life = 1.6; b.owner = owner; b.target = target; b.dmg = dmg;
    b.pos.copy(owner.pos).addScaledVector(T3, 9); b.pos.y -= 0.4;
    b.prev.copy(b.pos);
    b.vel.copy(T3).multiplyScalar(1050).add(owner.vel);
    T1.set((rnd() - 0.5) * 6, (rnd() - 0.5) * 6, (rnd() - 0.5) * 6); b.vel.add(T1); // рассеивание
    fx.shot(b);
  }
  function updateBullets(dt) {
    const gunHome = ctx.mode().gunHome;
    for (const b of bullets) {
      if (!b.on) continue;
      b.life -= dt; b.prev.copy(b.pos);
      if (gunHome > 0 && b.target && !b.target.dead && b.owner.human) { // лёгкое «доведение» — прощает мелкие ошибки прицеливания
        T1.copy(b.target.pos).sub(b.pos).normalize().multiplyScalar(b.vel.length());
        b.vel.lerp(T1, Math.min(1, gunHome * dt));
      }
      b.vel.y -= G0 * dt;
      b.pos.addScaledVector(b.vel, dt);
      let hit = false;
      for (const e of ctx.opponents(b.owner)) {
        if (e.dead) continue;
        if (segHitsSphere(b.prev, b.pos, e.pos, e.r + 2)) { fx.bulletHit(b, e); if (b.dmg) damage(e, b.dmg, 'ПУШКА', undefined, b.owner); hit = true; break; } // dmg 0 — только трассер
      }
      const p = b.pos;
      if (!hit && p.y < terrainH(p.x, p.z)) hit = true;
      if (hit || b.life <= 0) { b.on = false; fx.bulletOff(b); }
    }
  }

  // ═════════════ ИИ ═════════════
  // ближайший живой противник
  function pickTarget(e) {
    let best = null, bd = Infinity;
    for (const o of ctx.opponents(e)) { if (o.dead) continue; const d = o.pos.distanceToSquared(e.pos); if (d < bd) { bd = d; best = o; } }
    return best;
  }
  function spawnAI(type, pos, yaw, leader, off, team = 1) {
    const S = AC[type];
    const lo = S.loadouts[(rnd() * S.loadouts.length) | 0];
    return spawnCraft(type, S, lo, pos, yaw, leader, off, team);
  }
  // аппарат ИИ с характеристиками S (как в AC) и подвеской lo (ключи ракет, null — пусто)
  function spawnCraft(type, S, lo, pos, yaw, leader, off, team = 1) {
    const e = makeCraft({ ...aiFields(type, S, lo, team), leader, off });
    e.pos.copy(pos); e.yaw = yaw; e.speed = type === 'boss' ? 220 : 260;
    fwdOf(e, e.vel).multiplyScalar(e.speed);
    e.tgt = pickTarget(e);
    fx.spawned(e);
    return e;
  }
  // поля «мозгов» ИИ — ими же онлайн-сервер отдаёт боту самолёт игрока (Object.assign поверх аппарата)
  function aiFields(type, S, lo, team) {
    const mode = ctx.mode();
    return { type, team, S, msl: lo.map((k) => (k ? { key: k } : null)), hp: S.hp, gmax: S.gmax, wCap: S.wCap, agil: 2 + S.skill * mode.aiSkill * 2.5, milAcc: S.milAcc, abAcc: S.abAcc, cd0: S.cd0,
      ir: S.ir, r: S.r, jam: !!S.jam, cmFlare: S.cm, cmChaff: S.cm, skill: S.skill * mode.aiSkill,
      state: 'ingress', thinkT: rnd() * 0.3, stt: false, sttLostT: 0, sttCD: 0, mslCD: 6 + rnd() * 6, cmT: 0, crank: rnd() < 0.5 ? 1 : -1, reactT: 0, threat: null,
      gunT: 0, want: new THREE.Vector3(0, 0, -1), wantAB: false };
  }
  const AS_A = new THREE.Vector3(), AS_B = new THREE.Vector3(), AI_TOP = new THREE.Vector3();
  function aiSees(e, t) { // РЛС ИИ видит цель t?
    const rel = AS_A.copy(t.pos).sub(e.pos), d = rel.length();
    fwdOf(e, AS_B);
    if (angleBetween(AS_B, rel) > 60 * D2R) return false;
    if (d > e.S.radarR * Math.pow(rcsOf(t) / 5, 0.25)) return false;
    return !isNotched(e.pos, t);
  }
  function aiLaunch(e, key) {
    const i = e.msl.findIndex((x) => x && x.key === key); if (i < 0) return;
    const slot = e.msl[i]; e.msl[i] = null;
    launchMissile(e, key, e.tgt, slot);
  }
  function aiThink(e) {
    if (ctx.retarget && (e.rtT = (e.rtT || 0) - 0.25) <= 0 && e.tgt && !e.tgt.dead) { e.rtT = ctx.retarget; const t = pickTarget(e); if (t !== e.tgt) { e.tgt = t; e.stt = false; } }
    if (!e.tgt || e.tgt.dead) { const t = pickTarget(e); if (t !== e.tgt) { e.tgt = t; e.stt = false; } }
    const p = e.tgt;
    if (!p) { fwdOf(e, e.want); e.want.y = 0; e.wantAB = false; safety(e); return; } // противников нет — патруль
    const toP = AI_TOP.copy(p.pos).sub(e.pos), d = toP.length();
    const sees = aiSees(e, p);
    // ── угрозы: ракеты противника, летящие в e (что «знает» его СПО / что видно глазами) ──
    let threat = null, tD = 1e9;
    for (const m of missiles) {
      if (m.dead || m.target !== e || m.owner.team === e.team || m.lost || m.decoy) continue;
      const md = m.pos.distanceTo(e.pos);
      let known = m.seenBy.has(e);
      if (!known) {
        if (m.M.kind === 'arh' && m.active) known = true;                              // СПО слышит активную ГСН
        else if (m.M.kind !== 'ir' && lockedOn(m.owner, e) && m.t < 6) known = true;   // пуск при захвате
        else if (m.M.kind === 'sarh' && lockedOn(m.owner, e)) known = true;            // подсвет
        else if (md < 4000 && rnd() < e.skill * 0.35) known = true;                    // увидел дымный след
        if (known) m.seenBy.add(e);
      }
      if (known && md < tD) { threat = m; tD = md; }
    }
    if (threat && tD < (threat.M.kind === 'ir' ? 5000 : 15000)) {
      if (e.threat !== threat) { e.threat = threat; e.reactT = (1 - e.skill) * 1.4; }
      e.reactT -= 0.25;
      if (e.reactT <= 0) e.state = 'defend';
    } else { e.threat = null; if (e.state === 'defend') e.state = 'engage'; }
    // ── оборона: выход на траверз (в доплеровский провал), снижение, контрмеры ──
    if (e.state === 'defend') {
      const m = e.threat;
      T2.copy(e.pos).sub(m.pos); T2.y = 0; T2.normalize();
      const perp = T3.set(-T2.z, 0, T2.x); fwdOf(e, TG);
      if (perp.dot(TG) < 0) perp.negate();
      e.want.copy(perp); e.want.y = agl(e) > 1500 ? -0.3 : 0.05;
      e.wantAB = m.M.kind !== 'ir';
      if (tD < 1800) { e.want.addScaledVector(T2, -0.4).normalize(); } // в последний момент — резкий доворот на ракету
      if (e.cmT <= 0) {
        if (m.M.kind === 'ir' && tD < 3500) { dropCM(e, 'flare'); e.cmT = 0.7 - e.skill * 0.3; }
        else if (m.M.kind !== 'ir' && tD < 7000) { dropCM(e, 'chaff'); e.cmT = 0.9 - e.skill * 0.3; }
      }
      safety(e); return;
    }
    // ── сопровождение ──
    const hasR = e.msl.some((x) => x && MISSILES[x.key].kind !== 'ir');
    const hasIR = e.msl.some((x) => x && MISSILES[x.key].kind === 'ir');
    let guiding = 0; for (const m of missiles) if (!m.dead && m.owner === e && !m.lost && (m.M.kind === 'sarh' || (m.M.kind === 'arh' && !m.active))) guiding++;
    const radarKey = hasR ? e.msl.find((x) => x && MISSILES[x.key].kind !== 'ir').key : null;
    const rK = radarKey && dlz(MISSILES[radarKey], e.pos.y, e.speed, closingOf(p, e.pos));
    const launchR = rK ? rK.rne + (rK.rmax - rK.rne) * (0.55 - 0.35 * e.skill) : 0;
    if (sees && e.sttCD <= 0 && (guiding || (hasR && d < launchR * 1.25))) { if (!e.stt) { e.stt = true; e.sttLostT = 0; } }
    else if (!guiding && !(hasR && d < launchR * 1.25)) e.stt = false;
    // ── пуски ──
    fwdOf(e, T2);
    const off = angleBetween(T2, toP);
    const maxInFlight = e.type === 'boss' ? 2 : 1;
    if (e.mslCD <= 0 && radarKey && e.stt && guiding < maxInFlight && d < launchR && d > MISSILES[radarKey].rmin && off < 25 * D2R) {
      aiLaunch(e, radarKey); e.mslCD = 9 + (1 - e.skill) * 7; e.state = 'crank';
    } else if (e.mslCD <= 0 && hasIR && d < 10000) {
      const irKey = e.msl.find((x) => x && MISSILES[x.key].kind === 'ir').key, M_ = MISSILES[irKey];
      if (d > M_.rmin && irCanSee(M_, p, e.pos, T2, Math.min(M_.ir.fov, 30)) && d < dlz(M_, e.pos.y, e.speed, closingOf(p, e.pos)).rmax * 0.8) {
        aiLaunch(e, irKey); e.mslCD = 6 + (1 - e.skill) * 5;
      }
    }
    // ── манёвр ──
    const lead = TG.copy(p.pos).addScaledVector(p.vel, Math.min(6, d / 900));
    if (e.type === 'boss') {
      // флагман держит дистанцию, эскорт прикрывает
      if (d < 14000) { e.want.copy(e.pos).sub(p.pos).normalize(); e.want.y = 0; } else { e.want.copy(toP).normalize(); e.want.y = (7000 - e.pos.y) / 4000; }
      e.wantAB = false;
    } else if (e.leader && !e.leader.dead && d > 18000) {
      e.want.copy(e.leader.pos).add(e.off).sub(e.pos); if (e.want.lengthSq() < 1) e.want.copy(fwdOf(e.leader, T3)); e.want.normalize(); e.wantAB = e.pos.distanceTo(e.leader.pos) > 800;
    } else if (e.state === 'crank' && guiding) {
      // держим цель у края зоны обзора РЛС (~50°), чтобы медленнее сближаться и не терять захват
      const a = Math.atan2(toP.x, toP.z) + e.crank * 50 * D2R;
      e.want.set(Math.sin(a), (p.pos.y - e.pos.y) / Math.max(3000, d), Math.cos(a)).normalize(); e.wantAB = false;
    } else if (d > 6000) {
      e.state = 'engage';
      e.want.copy(lead).sub(e.pos); e.want.y += 800; e.want.normalize(); e.wantAB = d < 20000 && e.speed < 300;
    } else {
      e.state = 'dogfight';
      e.want.copy(lead).sub(e.pos).normalize(); e.wantAB = e.speed < 290;
    }
    safety(e);
  }
  // земля и граница арены важнее всего остального
  function safety(e) {
    const ahead = T3.copy(e.pos).addScaledVector(e.vel, 5);
    const clearance = ahead.y - terrainH(ahead.x, ahead.z);
    if (clearance < 600 || agl(e) < 400) { e.want.y = Math.max(e.want.y, clearance < 250 ? 0.9 : 0.45); e.want.normalize(); }
    const r = Math.hypot(e.pos.x, e.pos.z);
    if (r > WORLD.R + 800) { e.want.set(-e.pos.x, 0, -e.pos.z).normalize(); }
    if (e.pos.y > WORLD.CEIL - 1500) e.want.y = Math.min(e.want.y, -0.2);
  }
  function updateAI(e, dt) {
    e.thinkT -= dt; e.mslCD -= dt; e.cmT -= dt; e.sttCD -= dt; e.gunT -= dt;
    if (e.stt) { if (!e.tgt || !aiSees(e, e.tgt)) { e.sttLostT += dt; if (e.sttLostT > 0.8) { e.stt = false; e.sttCD = 1.5; } } else e.sttLostT = 0; }
    if (e.thinkT <= 0) { e.thinkT = 0.25; aiThink(e); }
    const [rx, ry] = steerTo(e, e.want, 2.2 + e.skill);
    e.ab = e.wantAB; e.thr = 1;
    flyStep(e, rx, ry, dt);
    if (agl(e) < 5) { e.hp = 0; kill(e, 'ЗЕМЛЯ'); return; } // загнали в землю — засчитывается
    const t = e.tgt;
    if (t) {
      // пушка на малой дистанции
      const d = e.pos.distanceTo(t.pos), ok = targetable(t) && !t.dead;
      if (d < 1300 && e.gunT <= 0 && ok) {
        fwdOf(e, T2); T1.copy(t.pos).addScaledVector(t.vel, d / 1100).sub(e.pos);
        if (angleBetween(T2, T1) < 2.5 * D2R) { fireBullet(e, t, 4); e.gunT = 0.09; }
      }
      // столкновение
      if (d < e.r + t.r && ok) { if (t.human) ctx.hurt(t, 50); else damage(t, 50, 'ТАРАН'); damage(e, 80, 'ТАРАН'); }
    }
    fx.aiVisual(e);
  }

  return { missiles, cms, bullets, radarSees, updateRadar, radarDatalink, lockedOn, launchMissile, updateMissile, detonate,
    dropCM, spawnCMs, updateCMs, damage, kill, fireBullet, updateBullets, pickTarget, spawnAI, spawnCraft, aiFields, aiSees, aiLaunch, updateAI };
}
