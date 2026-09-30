// Чистая математика боя «Симулятора Летки»: лётная модель, углы, ИК-заметность, доплеровский провал, зона пуска.
// Без сцены и DOM — только THREE.Vector3 (глобальный THREE: в браузере — из скрипта, на сервере — из npm three@0.128.0).
// Этот файл импортируют и клиент (main.js), и онлайн-сервер — любые правки меняют поведение обоих.
/* global THREE */
import { terrainH } from '../terrain-core.js?v=20260930i';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const wrapPI = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
export const D2R = Math.PI / 180, G0 = 9.81;
export const rhoAt = (y) => Math.exp(-Math.max(0, y) / 9000);   // относительная плотность воздуха

// ═════════════ Летательные аппараты ═════════════
export function makeCraft(o) {
  return Object.assign({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0, wy: 0, wp: 0, speed: 250, thr: 0.85, ab: false,
    n: 1, massK: 1, dragK: 1, dead: false, agil: 4, vStall: 80, bleed: 1, rollK: 4, cmFlare: 0, cmChaff: 0 }, o);
}
export function fwdOf(a, out) { const cp = Math.cos(a.pitch); return out.set(-Math.sin(a.yaw) * cp, Math.sin(a.pitch), -Math.cos(a.yaw) * cp); }
export function rightOf(a, out) { return out.set(Math.cos(a.yaw), 0, -Math.sin(a.yaw)); }
// азимут и угол места вектора rel относительно носа аппарата a
export function localAngles(a, rel) {
  const cy = Math.cos(a.yaw), sy = Math.sin(a.yaw), cp = Math.cos(a.pitch), sp = Math.sin(a.pitch);
  const x1 = rel.x * cy - rel.z * sy, z1 = rel.x * sy + rel.z * cy;
  const y2 = rel.y * cp + z1 * sp, z2 = -rel.y * sp + z1 * cp;
  return [Math.atan2(x1, -z2), Math.atan2(y2, Math.hypot(x1, z2))];
}
export function angleBetween(a, b) { return Math.acos(clamp(a.dot(b) / ((a.length() * b.length()) || 1), -1, 1)); }
export function agl(a) { return a.pos.y - terrainH(a.pos.x, a.pos.z); }
export function localAz(a, rel) { const cy = Math.cos(a.yaw), sy = Math.sin(a.yaw), cp = Math.cos(a.pitch), sp = Math.sin(a.pitch); const x1 = rel.x * cy - rel.z * sy, z1 = rel.x * sy + rel.z * cy; return Math.atan2(x1, -(-rel.y * sp + z1 * cp)); }

// Общая лётная модель: rx, ry — команды по рысканию/тангажу (−1…1). Угловая скорость ограничена перегрузкой.
export function flyStep(a, rx, ry, dt) {
  const v = Math.max(a.speed, 60);
  const wMax = Math.min(a.wCap, a.gmax * G0 / v);
  let wy = -rx * wMax, wp = ry * wMax;
  const w = Math.hypot(wy, wp); if (w > wMax) { wy *= wMax / w; wp *= wMax / w; }
  const k = Math.min(1, a.agil * dt);
  a.wy += (wy - a.wy) * k; a.wp += (wp - a.wp) * k;
  a.yaw += a.wy * dt; a.pitch = clamp(a.pitch + a.wp * dt, -1.35, 1.35);
  a.n = 1 + v * Math.hypot(a.wy * Math.cos(a.pitch), a.wp) / G0;
  const bank = clamp(Math.atan2(v * a.wy * Math.cos(a.pitch), G0), -1.45, 1.45);
  a.roll += (bank - a.roll) * Math.min(1, a.rollK * dt);
  const rho = rhoAt(a.pos.y);
  const thrust = (a.ab ? a.abAcc : a.milAcc * a.thr) * (0.25 + 0.75 * rho) / a.massK;
  const drag = a.cd0 * rho * v * v * a.dragK + 0.32 * a.bleed * Math.pow(Math.max(0, a.n - 1), 2);
  a.speed += (thrust - drag - G0 * Math.sin(a.pitch)) * dt;
  if (a.speed < a.vStall) a.pitch -= (a.vStall - a.speed) * 0.015 * dt; // сваливание: нос опускается
  a.speed = Math.max(a.speed, 45);
  fwdOf(a, a.vel).multiplyScalar(a.speed);
  a.pos.addScaledVector(a.vel, dt);
}
// Пилотажная лётная модель (настройка «Управление: Пилотажное», только самолёт игрока): ориентация — кватернион в осях
// самолёта; ручка вверх-вниз — тангаж вокруг правого крыла (петля через вертикаль возможна), влево-вправо — крен.
// Каждый шаг раскладывается обратно в yaw/pitch/roll (порядок YXZ, как у моделей) — fwdOf, HUD, сеть и ракеты не меняются.
// Энергетика (тяга, сопротивление, перегрузка, сваливание) — как во flyStep. sink — принудительное опускание носа, рад/с (потолок).
export const ROLL_RATE = 3.6; // рад/с (~200°/с) — «Изделие» без лётчика
const PQ = new THREE.Quaternion(), PE = new THREE.Euler(0, 0, 0, 'YXZ'), PAX = new THREE.Vector3(), PFW = new THREE.Vector3();
const AX_X = new THREE.Vector3(1, 0, 0), AX_Y = new THREE.Vector3(0, 1, 0), AX_Z = new THREE.Vector3(0, 0, 1), UP_W = new THREE.Vector3(0, 1, 0);
export function pilotStep(a, rx, ry, dt, sink = 0, rollK = 1, rz = 0) { // rollK — чувствительность крена; rz — руль направления −1…1 (половина тангажа)
  const e = a.qe;
  if (!a.q || !e || e[0] !== a.pitch || e[1] !== a.yaw || e[2] !== a.roll) { // углы поменяли снаружи: старт, удар о землю, возрождение
    a.q = (a.q || new THREE.Quaternion()).setFromEuler(PE.set(a.pitch, a.yaw, a.roll, 'YXZ'));
    a.wr = 0;
  }
  const v = Math.max(a.speed, 60);
  const wMax = Math.min(a.wCap, a.gmax * G0 / v); // тангаж ограничен перегрузкой, как во flyStep
  const k = Math.min(1, a.agil * dt);
  a.wp += (clamp(ry, -1, 1) * wMax - a.wp) * k;
  a.wr += (-clamp(rx, -1, 1) * ROLL_RATE * rollK - a.wr) * k; // ручка вправо — правое крыло вниз (крен < 0, как у моделей)
  a.wz = (a.wz || 0) + (clamp(rz, -1, 1) * wMax * 0.5 - (a.wz || 0)) * k; // руль: нос влево-вправо без крена, слабее тангажа
  a.q.multiply(PQ.setFromAxisAngle(AX_X, a.wp * dt)).multiply(PQ.setFromAxisAngle(AX_Z, a.wr * dt)).multiply(PQ.setFromAxisAngle(AX_Y, a.wz * dt));
  // сваливание и потолок: нос опускается к земле в мировых осях (и в перевёрнутом полёте — тоже к земле)
  const drop = (a.speed < a.vStall ? (a.vStall - a.speed) * 0.015 : 0) + sink;
  if (drop > 0) {
    PFW.set(0, 0, -1).applyQuaternion(a.q); PAX.crossVectors(PFW, UP_W);
    if (PAX.lengthSq() > 1e-6) a.q.premultiply(PQ.setFromAxisAngle(PAX.normalize(), -drop * dt));
  }
  a.q.normalize();
  PE.setFromQuaternion(a.q, 'YXZ'); a.pitch = PE.x; a.yaw = PE.y; a.roll = PE.z;
  a.qe = [a.pitch, a.yaw, a.roll];
  a.wy = 0; // у вертикали рыскание по углам скачет на 180° — камере и HUD оно здесь не нужно
  a.n = 1 + v * Math.abs(a.wp) / G0;
  const rho = rhoAt(a.pos.y);
  const thrust = (a.ab ? a.abAcc : a.milAcc * a.thr) * (0.25 + 0.75 * rho) / a.massK;
  const drag = a.cd0 * rho * v * v * a.dragK + 0.32 * a.bleed * Math.pow(Math.max(0, a.n - 1), 2);
  a.speed = Math.max(45, a.speed + (thrust - drag - G0 * Math.sin(a.pitch)) * dt);
  fwdOf(a, a.vel).multiplyScalar(a.speed);
  a.pos.addScaledVector(a.vel, dt);
}
// Команды, чтобы развернуть нос в направлении dir
export function steerTo(a, dir, gain = 2.5) {
  const wantYaw = Math.atan2(-dir.x, -dir.z), dy = wrapPI(wantYaw - a.yaw);
  const wantPitch = Math.asin(clamp(dir.y / (dir.length() || 1), -1, 1));
  return [clamp(-dy * gain, -1, 1), clamp((wantPitch - a.pitch) * gain, -1, 1)];
}

// ═════════════ Тепловая заметность и провал в доплере ═════════════
// ИК-заметность цели для головки в точке from: с форсажем ×2,2, в лоб ~40% от «хвоста».
// (у этих функций свои временные векторы — их зовут изнутри кода, который держит TMP*/TGT)
const SH_A = new THREE.Vector3(), SH_B = new THREE.Vector3(), IRV = new THREE.Vector3(), NTV = new THREE.Vector3(), CLV = new THREE.Vector3();
export function seekerHeat(t, from) {
  fwdOf(t, SH_A); SH_B.copy(from).sub(t.pos).normalize();
  const tail = (1 - SH_A.dot(SH_B)) / 2; // 1 — смотрим строго в сопло
  return t.ir * (t.ab ? 2.2 : 1) * (0.4 + 0.6 * tail);
}
export function offTailDeg(t, from) { fwdOf(t, SH_A); SH_B.copy(from).sub(t.pos).normalize(); return Math.acos(clamp(-SH_A.dot(SH_B), -1, 1)) / D2R; }
// ИК-ГСН ракеты M_ видит цель t из точки from с осью axis в конусе coneDeg?
export function irCanSee(M_, t, from, axis, coneDeg) {
  IRV.copy(t.pos).sub(from); const d = IRV.length();
  if (d > M_.ir.range * Math.sqrt(seekerHeat(t, from)) || d < 50) return false;
  if (M_.ir.aspect < 180 && offTailDeg(t, from) > M_.ir.aspect) return false;
  return angleBetween(axis, IRV) <= coneDeg * D2R;
}
// Почему ИК-ГСН не видит цель: null — видит, иначе { why: 'cone' | 'aspect' | 'range', d, maxR } (d и maxR — м).
// rangeK, aspectSlack — запас по дальности (множитель) и ракурсу (°): их даёт сервер, у которого позиции на задержку сети старее.
export function irWhy(M_, t, from, axis, coneDeg, rangeK = 1, aspectSlack = 0) {
  IRV.copy(t.pos).sub(from); const d = IRV.length(), maxR = M_.ir.range * rangeK * Math.sqrt(seekerHeat(t, from));
  if (angleBetween(axis, IRV) > coneDeg * D2R) return { why: 'cone', d, maxR };
  if (M_.ir.aspect < 180 && offTailDeg(t, from) > M_.ir.aspect + aspectSlack) return { why: 'aspect', d, maxR };
  if (d > maxR || d < 50) return { why: 'range', d, maxR };
  return null;
}
// Цель на фоне земли и летит поперёк луча — импульсно-доплеровская РЛС (и РЛ ГСН) её отсекает.
export function isNotched(from, t) {
  NTV.copy(t.pos).sub(from); const d = NTV.length() || 1;
  if (NTV.y / d > -0.03) return false;
  return Math.abs(t.vel.dot(NTV) / d) < 35;
}

// ═════════════ Зона пуска (расчёт по той же кинематике) ═════════════
export function dlz(M_, alt, vLaunch, vClose) {
  const rho = rhoAt(alt), dt = 0.1;
  let v = vLaunch, d = 0, t = 0, rmax = 0, rne = 0;
  while (t < M_.life) {
    const tb = t - M_.drop;
    const acc = tb < 0 ? 0 : tb < M_.burn ? M_.acc : (M_.sustain && tb < M_.burn + M_.sustain.t ? M_.sustain.acc : 0);
    v += (acc - M_.kd * 1e-4 * rho * v * v) * dt; d += v * dt; t += dt;
    if (v < M_.vmin && tb > M_.burn) break;
    rmax = Math.max(rmax, d + vClose * t); rne = Math.max(rne, d - 280 * t);
  }
  return { rmax, rne, rmin: M_.rmin };
}
export function closingOf(t, from) { CLV.copy(from).sub(t.pos).normalize(); return t.vel.dot(CLV); }

// поворот вектора dir к desired не больше чем на maxAng (рад); возвращает фактический угол
const TT = new THREE.Vector3();
export function turnToward(dir, desired, maxAng) {
  const a = Math.acos(clamp(dir.dot(desired), -1, 1));
  if (a < 1e-5) return 0;
  TT.crossVectors(dir, desired); if (TT.lengthSq() < 1e-12) return 0; TT.normalize();
  const turn = Math.min(a, maxAng); dir.applyAxisAngle(TT, turn).normalize(); return turn;
}
// отрезок a→b проходит через сферу (c, r)?
export function segHitsSphere(a, b, c, r) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z, l2 = abx * abx + aby * aby + abz * abz || 1e-6;
  const t = clamp(((c.x - a.x) * abx + (c.y - a.y) * aby + (c.z - a.z) * abz) / l2, 0, 1);
  const dx = a.x + abx * t - c.x, dy = a.y + aby * t - c.y, dz = a.z + abz * t - c.z;
  return dx * dx + dy * dy + dz * dz < r * r;
}
