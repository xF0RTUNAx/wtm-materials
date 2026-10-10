// Бой «Воздушного превосходства»: зенитные комплексы, их ракеты и пушки, ударное оружие самолётов, ловушки, разрушения.
// Без сцены, DOM и звука (как sim/battle.js «Летки»): всё видимое делает хозяин через хуки ctx.fx. Тот же код
// потом возьмёт онлайн-сервер.
//
// ctx: {
//   city            — город (city.js): los, raycast, topAt, objects;
//   mode()          — параметры режима (MODES ниже),
//   aircraft()      — массив самолётов (у каждого pos, vel, yaw/pitch/roll, speed, ab, ir, r, dead, rcs, side),
//   hurt(a, dmg, by)— урон самолёту (корпус и гибель — логика хозяина),
//   laserSpot(a)    — точка подсвета лазером самолёта a (или null),
//   night           — 0…1 (ТВ-головки ночью не видят, расчёты ПЗРК видят хуже),
//   rnd             — генератор случайных чисел (по умолчанию Math.random),
//   fx: { ... }     — хуки (список — в NOOP_FX).
// }
/* global THREE */
import { AG, SAM } from '../arsenal.js?v=20261011c';
import { LNCH, lnchToWorld, lnchDir, slotOf, trainable } from '../launchers.js?v=20261011c';
import { clamp, D2R, G0, rhoAt, angleBetween, seekerHeat, offTailDeg, turnToward } from '../../drone/sim/core.js?v=20261011c';

// Режимы: Аркада прощает (медленнее реакция ПВО, меньше урона, больше ловушек и диполей), Реализм — как есть
export const MODES = {
  arcade: { name: 'Аркада', desc: 'больше ловушек, меньше урона, ПВО медленнее реагирует, все угрозы на экране', dmgTaken: 0.55, reactK: 1.4, samSkill: 0.7, cmK: 1.3, cm: 360, fuelS: 330, markers: true, gunK: 0.7, reload: 'auto' },
  real: { name: 'Реализм', desc: 'только СПО и датчик пуска, полный урон, опытные расчёты', dmgTaken: 1, reactK: 1, samSkill: 1, cmK: 1, cm: 240, fuelS: 240, markers: false, gunK: 1, reload: 'home' }, // reload: 'auto' — подвеска пополняется сама, 'home' — у точки вылета; fuelS — секунд на полном газе (форсаж — втрое быстрее); cm — пачек ловушек (ЛТЦ и диполи разом, одной кнопкой)
};

const NOOP_FX = {
  samLaunch() {}, samMotor() {}, samTrail() {}, samEnd() {},
  samIgnite() {}, samJet() {}, samStage() {},                       // запуск двигателя в воздухе, газовые рули, отделение ускорителя        // ракета ЗРК: пуск, двигатель, след, конец (m, hit)
  gunFire() {}, gunHit() {},                                       // очередь зенитной пушки (u, target, hits)
  wpnRelease() {}, wpnTrail() {}, wpnEnd() {},                     // оружие самолёта: сброс/пуск, след, конец
  explosion() {}, wpnJammed() {},                                                  // взрыв (точка, радиус, kind)
  objectHit() {}, objectDestroyed() {}, unitHit() {}, unitDestroyed() {},
  radarState() {},                                                 // РЛС комплекса включилась/выключилась/захватила (u)
  cmDrop() {}, decoyed() {}, trackBroken() {},
};

const TMP = new THREE.Vector3(), TMP2 = new THREE.Vector3(), AIM = new THREE.Vector3(), UPV = new THREE.Vector3(0, 1, 0);
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function createStrike(ctx) {
  const fx = { ...NOOP_FX, ...(ctx.fx || {}) };
  const rnd = ctx.rnd || Math.random;
  const city = ctx.city;
  const units = [], sams = [], wpns = [], flares = [];
  const objects = city.objects.map((o) => ({ ...o, hpMax: o.hp, dead: false, dmgTaken: 0 }));
  const net = { alertT: 0, last: new THREE.Vector3() }; // общая сеть ПВО: кто-то сопровождает цель — засада включается
  let uid = 1, mid = 1;

  // ═════════════ Зенитные комплексы ═════════════
  // pos — точка установки (земля или крыша); антенна — выше на radar.mast
  function addUnit(key, x, z, o = {}) {
    const S = SAM[key], LN = LNCH[key];
    const roof = o.roof ? city.topAt(x, z) : city.groundH(x, z);
    if (o.id && o.id >= uid) uid = o.id + 1; // онлайн: клиент повторяет комплексы сервера с теми же номерами
    const u = { id: o.id || uid++, key, S, pos: new THREE.Vector3(x, roof + 1.5, z), ant: new THREE.Vector3(x, roof + (S.radar ? S.radar.mast : 2), z), yaw: o.yaw || 0,
      hp: S.hp, dead: false, emit: !!S.radar && !o.ambush, ambush: !!o.ambush, shutT: 0, track: null, seeT: 0, lostT: 0, reactT: 0, cool: 0,
      ammo: S.ammo, reloadT: 0, salvoLeft: 0, gunT: 0, gunOn: false, skill: o.skill ?? 0.7, armSeen: new Set(), roof: !!o.roof, known: false,
      lyaw: (LN && LN.yaw0) || 0, lel: LN ? LN.el ?? 0.35 : 0, lnEl: null, lnT: 0, lnErr: 0, slotT: {} };
    units.push(u);
    return u;
  }
  function removeUnit(u) { const i = units.indexOf(u); if (i >= 0) units.splice(i, 1); }
  // новая позиция (между волнами): машина переезжает, ракеты в пусковой остаются
  function moveUnit(u, x, z, roof) {
    const y = roof ? city.topAt(x, z) : city.groundH(x, z);
    u.pos.set(x, y + 1.5, z); u.ant.set(x, y + (u.S.radar ? u.S.radar.mast : 2), z); u.roof = !!roof;
  }
  const aglOf = (a) => a.pos.y - city.groundH(a.pos.x, a.pos.z);
  // РЛС видит цель: дальность по ЭПР, радиогоризонт, земля под целью (у некогерентных — «низкую» цель не видно),
  // доплеровский провал у когерентных, здания и рельеф между антенной и целью
  function radarSees(u, t) {
    const R = u.S.radar, d = u.ant.distanceTo(t.pos);
    let range = R.range * Math.min(1.4, Math.pow((t.rcs || 5) / 5, 0.25));
    // станция помех цели: РЛС видит её ближе, пока не «прожжёт» помеху (помехозащищённые — почти не замечают)
    if (t.jam) range = Math.max(R.range * 0.3 * (1 + (u.S.eccm || 0)), range * (1 - t.jam * 0.6 * (1 - (u.S.eccm || 0))));
    if (d > range) return false;
    const h = aglOf(t);
    if (h < R.clutter) return false;
    const horizon = 4120 * (Math.sqrt(Math.max(1, u.ant.y - city.groundH(u.ant.x, u.ant.z))) + Math.sqrt(Math.max(1, h)));
    if (d > horizon) return false;
    if (R.doppler && h < 1500 && radial(u, t) < 32) return false;
    return city.los(u.ant.x, u.ant.y, u.ant.z, t.pos.x, t.pos.y, t.pos.z, 25);
  }
  function radial(u, t) { TMP.copy(t.pos).sub(u.ant).normalize(); return Math.abs(t.vel.dot(TMP)); }
  // оптика и глаза расчёта (ИК-комплексы, ПЗРК): ночью хуже, только прямая видимость
  function eyesSee(u, t) {
    const R = (u.S.optTrack || u.S.optical || 6000) * (1 - 0.55 * (ctx.night || 0)), d = u.pos.distanceTo(t.pos);
    if (d > R) return false;
    return city.los(u.pos.x, u.pos.y + 1.5, u.pos.z, t.pos.x, t.pos.y, t.pos.z, 15);
  }
  function inZone(u, t) {
    const S = u.S, d = u.pos.distanceTo(t.pos), h = aglOf(t);
    return d > S.rmin && d < S.rmax && h > S.hmin && h < S.hmax;
  }
  function updateUnit(u, dt, targets) {
    if (u.dead) return;
    const S = u.S, M = ctx.mode();
    u.cool = Math.max(0, u.cool - dt);
    if (u.reloadT > 0) { u.reloadT -= dt; if (u.reloadT <= 0) u.ammo = S.ammo; }
    if (S.type === 'jammer') return; // станция подавления навигации работает сама (см. updateWpn)
    if (S.antiMun) targets = targetsFor(u, targets);
    if (u.manual) { manualUnit(u, dt, targets); return; }
    // ПРР в воздухе: опытный расчёт выключает РЛС («мигание»), пока ракета не упадёт
    if (S.radar) {
      if (u.shutT > 0) { u.shutT -= dt; if (u.shutT <= 0 && !u.dead) { u.emit = true; fx.radarState(u); } }
      for (const w of wpns) {
        if (w.dead || w.W.kind !== 'arm' || w.target !== u || u.armSeen.has(w.id)) continue;
        if (w.pos.distanceTo(u.pos) > 16000) continue;
        u.armSeen.add(w.id);
        if (rnd() < u.skill * M.samSkill * 0.8) { u.emit = false; u.shutT = 9 + rnd() * 9; u.track = null; fx.radarState(u); }
      }
      // засада: РЛС молчит, пока сеть не сообщит о цели в зоне
      if (u.ambush && !u.emit && u.shutT <= 0 && net.alertT > 0 && net.last.distanceTo(u.pos) < S.rmax * 0.85) { u.emit = true; u.ambush = false; fx.radarState(u); }
    }
    // выбор и сопровождение цели
    let t = u.track && !u.track.dead ? u.track : null;
    if (!t) {
      // многоканальный комплекс сначала берёт цели, по которым ещё не летят его ракеты
      let best = null, bd = 1e12;
      for (const a of targets) {
        if (a.dead) continue;
        let d = a.pos.distanceToSquared(u.pos);
        if ((S.channels || 1) > 1 && sams.some((m) => !m.dead && !m.lost && m.unit === u && m.target === a)) d *= 9;
        if (d < bd) { bd = d; best = a; }
      }
      t = best;
    }
    if (!t) { u.track = null; return; }
    const sees = S.radar ? (u.emit && radarSees(u, t)) || ((S.type === 'saclos' || S.optTrack) && eyesSee(u, t)) : eyesSee(u, t);
    if (sees) {
      u.lostT = 0; u.seeT += dt;
      const acq = (S.radar ? S.radar.acq : 2) * (M.reactK || 1);
      // помехи цели иногда срывают сопровождение (у помехозащищённых — редко)
      if (u.track === t && t.jam && u.emit && rnd() < t.jam * (1 - (S.eccm || 0)) * 0.25 * dt) { u.track = null; u.seeT = -0.5; u.relock = t; fx.trackBroken(u, t); fx.radarState(u); }
      if (!u.track && u.seeT > (u.relock === t ? 0.8 : acq)) { u.track = t; u.relock = null; fx.radarState(u); }
      if (u.track && S.radar && u.emit) { net.alertT = 30; net.last.copy(t.pos); u.known = true; }
    } else {
      u.seeT = Math.max(0, u.seeT - dt * 2);
      if (u.track) { u.lostT += dt; if (u.lostT > 1.2) { u.track = null; u.reactT = 0; fx.radarState(u); } }
    }
    if (!u.track) { u.gunOn = false; return; }
    const tr = u.track;
    if (u.hold) { u.gunOn = false; return; } // приказ командира: огонь только по команде (сопровождать можно)
    // пушки: очереди с перерывами; вероятность попадания падает с дальностью и угловой скоростью цели
    if (S.type === 'guns') {
      if (!aiGuns(u, tr, dt, S.rmax, S.hmax)) u.reactT = Math.max(0, u.reactT - dt);
      return;
    }
    // ракетно-пушечный комплекс («Панцирь»): вблизи работают и пушки
    if (S.gun) aiGuns(u, tr, dt, S.gun.rmax, S.hmax, true);
    // ракеты: время реакции в зоне, потом залп с интервалом
    if (inZone(u, tr) && u.ammo > 0 && u.reloadT <= 0) {
      u.reactT += dt;
      const inAir = sams.filter((m) => !m.dead && m.unit === u && m.target === tr).length;
      if (u.reactT > S.react * (M.reactK || 1) && u.cool <= 0 && inAir < (S.salvo || 1)) {
        // ИК: ГСН должна захватить цель до пуска (кроме захвата после пуска — IRIS-T)
        if (S.type === 'ir' && !S.loal && !irSees(S, tr, u.pos, null, 999)) return;
        if (!launcherReady(u)) return; // пусковая ещё разворачивается
        launchSam(u, tr);
        u.cool = 2.2 + rnd() * 1.5;
        if (u.ammo <= 0) u.reloadT = S.reload;
      }
    } else u.reactT = Math.max(0, u.reactT - dt * 0.5);
  }

  // очереди ИИ-расчёта: с перерывами; вероятность попадания падает с дальностью и угловой скоростью цели
  function aiGuns(u, tr, dt, rmax, hmax, noReact) {
    const S = u.S, G = S.gun, M = ctx.mode(), d = u.pos.distanceTo(tr.pos);
    if (!(d < rmax && aglOf(tr) < hmax && u.ammo > 0 || (S.type !== 'guns' && d < rmax))) { u.gunOn = false; return false; }
    if (!noReact) { u.reactT += dt; if (u.reactT < S.react * (M.reactK || 1)) return true; }
    u.gunT -= dt;
    if (u.gunT <= 0) { u.gunOn = !u.gunOn; u.gunT = u.gunOn ? G.burst : G.pause * (0.7 + rnd() * 0.6); }
    if (u.gunOn) {
      if (S.type === 'guns') u.ammo -= dt * 50;
      TMP.copy(tr.pos).sub(u.pos); const w = TMP.clone().cross(tr.vel).length() / Math.max(1, d * d); // угловая скорость, рад/с
      const p = G.hitK * M.gunK * Math.pow(1 - d / rmax, 1.4) / (1 + w * 9) * u.skill * M.samSkill * (tr.isMun ? 0.6 : 1);
      const hits = rnd() < p * dt * 8 ? 1 + Math.floor(rnd() * 3) : 0;
      fx.gunFire(u, tr, hits, dt);
      if (hits) { hurtAny(tr, G.dmg * hits, S.short); fx.gunHit(u, tr, hits); }
    }
    return true;
  }
  // комплексы против летящего оружия: к самолётам добавляются бомбы, крылатые ракеты и ПРР в пределах ~60 % дальности
  function targetsFor(u, aircraft) {
    const out = aircraft.slice(), R2 = Math.pow(u.S.rmax * 0.6, 2);
    for (const w of wpns) if (!w.dead && w.t > 1.5 && w.W.kind !== 'decoy' && w.pos.distanceToSquared(u.pos) < R2) out.push(w);
    return out;
  }
  // урон самолёту (хозяину боя) или летящему оружию (перехват)
  function hurtAny(t, dmg, by) {
    if (t.isMun) { t.mhp -= dmg; if (t.mhp <= 0) intercept(t); }
    else ctx.hurt(t, dmg, by);
  }
  function intercept(w) {
    if (w.dead) return;
    w.dead = true; w.intercepted = true;
    fx.wpnEnd(w, { objects: [], units: [], intercepted: true });
    fx.explosion(w.pos, Math.min(20, w.W.blast * 0.5), 'air');
  }

  // ═════════════ Комплекс под управлением игрока (оператор) ═════════════
  // Расчёт ИИ не стреляет сам: игрок назначает цель (захват — за реальное время acq), включает и выключает РЛС, пускает
  // (launch возвращает причину отказа или null). ИК-комплексы и ПЗРК — ГСН смотрит по прицелу u.aimDir и захватывает цель
  // в узком конусе; пушки — очередь по направлению ствола u.aimDir, попадание — по ошибке упреждения.
  function manualUnit(u, dt, targets) {
    const S = u.S, M = ctx.mode();
    if (S.type === 'ir') {
      let best = null, bh = 0;
      for (const a of targets) {
        if (a.dead || angleBetween(u.aimDir, TMP.copy(a.pos).sub(u.pos)) > 3.5 * D2R || !irSees(S, a, u.pos, null, 999) || !eyesSee(u, a)) continue;
        const h = seekerHeat(a, u.pos); if (h > bh) { bh = h; best = a; }
      }
      u.seek = best ? clamp(0.4 + bh * 0.4, 0, 1) : 0;
      if (best) { u.seeT += dt; if (u.seeT > 0.8 && u.track !== best) { u.track = best; fx.radarState(u); } }
      else { u.seeT = 0; if (u.track) { u.track = null; fx.radarState(u); } }
      return;
    }
    if (S.type === 'guns') { manualGuns(u, dt, targets); return; }
    const t = u.desig && !u.desig.dead ? u.desig : null;
    if (!t) { if (u.track) { u.track = null; fx.radarState(u); } u.seeT = 0; return; }
    const sees = (S.radar && u.emit && radarSees(u, t)) || ((S.type === 'saclos' || S.optTrack) && eyesSee(u, t));
    if (sees) {
      u.lostT = 0; u.seeT += dt;
      if (!u.track && u.seeT > (u.relock === t ? 0.8 : (S.radar ? S.radar.acq : 2) * (M.reactK || 1))) { u.track = t; u.relock = null; fx.radarState(u); } // перезахват той же цели после диполей — быстрее
      if (u.track && u.emit) { net.alertT = 30; net.last.copy(t.pos); }
    } else {
      u.seeT = Math.max(0, u.seeT - dt * 2);
      if (u.track) { u.lostT += dt; if (u.lostT > 1.2) { u.track = null; fx.radarState(u); } }
    }
  }
  const LEAD = new THREE.Vector3(), FAR = { pos: new THREE.Vector3() };
  // точка упреждения для пушки: где будет цель через время полёта снаряда (+ поправка на падение снаряда)
  function gunLead(u, t, out) {
    const v = u.S.gun.v; let tof = u.pos.distanceTo(t.pos) / v;
    for (let k = 0; k < 2; k++) { out.copy(t.pos).addScaledVector(t.vel, tof); tof = u.pos.distanceTo(out) / v; }
    out.y += 0.5 * G0 * tof * tof;
    return tof;
  }
  function manualGuns(u, dt, targets) {
    const S = u.S;
    // цель: сопровождаемая РЛС или ближайшая в секторе ствола (наводчик видит её глазом)
    let t = u.track && !u.track.dead ? u.track : null;
    if (!t) { let ba = 0.3; for (const a of targets) { if (a.dead || a.pos.distanceTo(u.pos) > S.rmax * 1.3) continue; const ang = angleBetween(u.aimDir, TMP.copy(a.pos).sub(u.pos)); if (ang < ba) { ba = ang; t = a; } } }
    u.gunTgt = t;
    if (!u.gunFire || u.ammo <= 0) { u.gunOn = false; return; }
    u.gunOn = true; u.ammo -= dt * 50;
    let hits = 0;
    if (t) {
      gunLead(u, t, LEAD);
      const err = angleBetween(u.aimDir, TMP.copy(LEAD).sub(u.pos)), d = u.pos.distanceTo(t.pos);
      const inEnv = d < S.rmax && aglOf(t) < S.hmax ? 1 : 0.15;
      const p = S.gun.hitK * 1.8 * Math.exp(-Math.pow(err / 0.012, 2)) * Math.pow(Math.max(0, 1 - d / (S.rmax * 1.15)), 0.8) * inEnv;
      hits = rnd() < p * dt * 8 ? 1 + Math.floor(rnd() * 3) : 0;
    }
    FAR.pos.copy(u.pos).addScaledVector(u.aimDir, S.rmax);
    fx.gunFire(u, FAR, hits, dt);
    if (hits) { hurtAny(t, S.gun.dmg * hits, S.short); fx.gunHit(u, t, hits); }
  }
  function launch(u) {
    const S = u.S;
    if (u.dead) return 'комплекс уничтожен';
    if (S.type === 'guns') return null;
    if (u.reloadT > 0) return `перезарядка ${Math.ceil(u.reloadT)} с`;
    if (u.ammo <= 0) return 'нет ракет';
    if (u.cool > 0) return 'пусковая не готова';
    const t = u.track;
    if (!t || t.dead) return S.type === 'ir' ? 'ГСН не захватила цель' : 'нет захвата цели';
    if (S.radar && !u.emit && S.type !== 'saclos' && !S.optTrack && S.type !== 'ir') return 'РЛС выключена — ракету некому вести';
    if (S.type === 'jammer') return 'станция РЭБ не стреляет';
    const d = u.pos.distanceTo(t.pos), h = aglOf(t);
    if (d < S.rmin) return 'слишком близко';
    if (d > S.rmax) return 'далеко — цель вне зоны';
    if (h < S.hmin) return 'цель ниже зоны поражения';
    if (h > S.hmax) return 'цель выше зоны поражения';
    if (!launcherReady(u)) return 'пусковая разворачивается';
    launchSam(u, t); u.cool = 1.6; if (u.ammo <= 0) u.reloadT = S.reload;
    return null;
  }
  function designate(u, t) { if (u.desig !== t) { u.desig = t; u.track = null; u.seeT = 0; fx.radarState(u); } }
  function setEmit(u, on) { u.emit = !!on; u.shutT = 0; u.ambush = false; if (!on) u.track = null; fx.radarState(u); }
  function setManual(u, on) { u.manual = !!on; u.desig = null; u.gunFire = false; u.aimDir = u.aimDir || new THREE.Vector3(0, 0.2, -1).normalize(); u.method = u.method || '3t'; }

  // ═════════════ Ракеты ЗРК ═════════════
  // угол места для старта: горка над направлением на цель (большие ракеты — круче) и выше домов по азимуту (не больше 85°);
  // заодно — высота, выше которой ракета вышла из застройки (CLEAR.y)
  const CLEAR = { y: 0 };
  function launchEl(u, hx, hz, tEl) {
    const M_ = u.S.msl, loft = u.S.vls ? 0.6 : M_.L > 5 ? 0.55 : M_.L > 2.5 ? 0.25 : 0.05;
    const ch = Math.cos(tEl) * (1 - loft), cv = Math.sin(tEl) * (1 - loft) + loft;
    let el = Math.atan2(cv, ch); const y0 = u.pos.y + 3; CLEAR.y = y0;
    for (let d = 25; d <= 700; d += 25) { const top = city.topAt(u.pos.x + hx * d, u.pos.z + hz * d) + 25; CLEAR.y = Math.max(CLEAR.y, top); el = Math.max(el, Math.atan2(top - y0, d)); }
    if (u.S.vls) CLEAR.y = Math.max(CLEAR.y, y0 + 70);
    return Math.min(el, 85 * D2R);
  }
  // пусковая (башня) следит за целью с реальной скоростью разворота; пустить можно, когда навелась
  function aimLauncher(u, dt) {
    for (const k in u.slotT) u.slotT[k] -= dt;
    const LN = LNCH[u.key]; if (!LN || u.dead || !trainable(LN)) return;
    const S = u.S, man = u.manual && (S.type === 'guns' || S.type === 'ir');
    const t = man ? null : u.manual ? (u.desig && !u.desig.dead ? u.desig : u.track) : u.track;
    let dx, dy, dz;
    if (t && !t.dead) { dx = t.pos.x - u.pos.x; dy = t.pos.y - u.pos.y; dz = t.pos.z - u.pos.z; }
    else if (u.manual && u.aimDir) { dx = u.aimDir.x; dy = u.aimDir.y; dz = u.aimDir.z; }
    else return;
    const hd = Math.hypot(dx, dz) || 1, yawT = Math.atan2(-dx, -dz) - u.yaw;
    let elT = Math.atan2(dy, hd);
    if (LN.mode === 'rail' && S.msl) { if ((u.lnT -= dt) <= 0 || u.lnEl === null) { u.lnT = 0.3; u.lnEl = launchEl(u, dx / hd, dz / hd, elT); } elT = u.lnEl; }
    const dyaw = wrapPi(yawT - u.lyaw), ky = LN.slewY * dt;
    u.lyaw = wrapPi(u.lyaw + clamp(dyaw, -ky, ky));
    let de = 0;
    if (LN.el == null) { elT = clamp(elT, LN.elMin, LN.elMax); const ke = LN.slewE * dt; de = elT - u.lel; u.lel += clamp(de, -ke, ke); de = elT - u.lel; }
    u.lnErr = Math.max(Math.abs(wrapPi(yawT - u.lyaw)), Math.abs(de));
  }
  function launcherReady(u) { const LN = LNCH[u.key]; return !LN || !trainable(LN) || u.lnErr < (LN.mode === 'tube' ? 0.12 : 0.09); }
  function launchSam(u, t) {
    const M_ = u.S.msl, LN = LNCH[u.key];
    TMP.copy(t.pos).sub(u.pos); const hd = Math.hypot(TMP.x, TMP.z) || 1, hx = TMP.x / hd, hz = TMP.z / hd;
    const el = launchEl(u, hx, hz, Math.atan2(TMP.y, hd)), clearY = CLEAR.y;
    // куда выходить из застройки (вертикальный старт склоняется сюда газовыми рулями)
    const gdDir = new THREE.Vector3(hx * Math.cos(el), Math.sin(el), hz * Math.cos(el));
    let pos, dir, speed = 40, ign = 0;
    const sl = LN && slotOf(LN, u.S.ammo - u.ammo);
    if (sl) {
      // ракета уходит из своего слота: с направляющей / из контейнера, по оси пусковой
      pos = lnchToWorld(u, sl.Ld, sl.p, new THREE.Vector3()); dir = lnchDir(u, new THREE.Vector3());
      u.slotT[sl.idx] = 5;
      if (LN.mode === 'cold' || LN.mode === 'tube') { speed = LN.ej.v; ign = LN.ej.t + (LN.ej.tilt || 0); }
      else speed = LN.mode === 'vhot' ? 20 : 25;
    } else { pos = u.pos.clone().add(TMP2.set(0, 3, 0)); dir = gdDir.clone(); }
    const m = { id: mid++, unit: u, S: u.S, M: M_, target: t, clearY, last: t.pos.clone(), lastV: t.vel.clone(), active: false, pos, dir, speed, t: 0, flown: 0, lost: false, lostT: 0, decoy: null, dead: false, trailT: 0,
      ln: LN || null, ign, tb: -ign, lit: ign === 0, staged: false, gdDir, slot: sl ? sl.idx : -1 };
    u.ammo--;
    sams.push(m);
    fx.samLaunch(m);
    return m;
  }
  // ИК-ГСН (ЗУР и ПЗРК): дальность по тепловой заметности, ракурс (у ранних — только хвост), поле зрения
  function irSees(S, t, from, axis, fovDeg) {
    const d = from.distanceTo(t.pos), R = S.rmax * 1.1 * Math.sqrt(seekerHeat(t, from));
    if (d > R) return false;
    if ((S.aspect || 180) < 180 && offTailDeg(t, from) > S.aspect) return false;
    if (axis && angleBetween(axis, TMP2.copy(t.pos).sub(from)) > fovDeg * D2R) return false;
    return true;
  }
  // общий полёт ракеты: двигатель, сопротивление, гравитация вдоль оси, поворот с ограничением перегрузки
  function flyMissile(m, M_, dt, aim, avel, lead) {
    const tb = m.tb ?? m.t;
    const acc = tb < 0 ? 0 : tb < M_.burn ? M_.acc : (M_.sustain && tb < M_.burn + M_.sustain.t ? M_.sustain.acc : 0);
    let lat = 0;
    if (aim) {
      // время до встречи — по скорости сближения (на встречном курсе она больше скорости ракеты)
      TMP2.copy(aim).sub(m.pos); const d = TMP2.length() || 1;
      const closing = m.speed * m.dir.dot(TMP2) / d - (avel ? avel.dot(TMP2) / d : 0), tgo = d / Math.max(150, closing);
      AIM.copy(aim); if (avel) AIM.addScaledVector(avel, tgo * lead);
      AIM.sub(m.pos).normalize();
      const gEff = M_.g * G0 * Math.pow(clamp(m.speed / (M_.vmin || 200), 0.3, 1), 2);
      lat = turnToward(m.dir, AIM, gEff / Math.max(120, m.speed) * dt) / dt * m.speed;
    } else if (m.dir.y > -0.95 && !m.hold) {
      // без наведения — нос опускается под действием тяжести
      turnToward(m.dir, TMP2.copy(m.dir).setY(m.dir.y - 0.3).normalize(), G0 / Math.max(120, m.speed) * dt * 0.6);
    }
    const rho = rhoAt(m.pos.y);
    m.speed += (acc - (M_.kd || 1) * 1e-4 * rho * m.speed * m.speed - 0.1 * lat - G0 * m.dir.y) * dt;
    m.speed = Math.max(m.speed, m.tb < 0 ? 3 : 30); // до запуска двигателя (выброс) ракета тормозит
    const step = m.speed * dt; m.flown += step;
    m.pos.addScaledVector(m.dir, step);
    return acc > 0;
  }
  function updateSam(m, dt) {
    const M_ = m.M, S = m.S, T = m.target, u = m.unit, LN = m.ln; m.t += dt;
    let aim = null, avel = null, lead = 0.9;
    m.tb = m.t - (m.ign || 0);
    if (!m.lit && m.tb >= 0) { m.lit = true; fx.samIgnite(m); }
    // старт: выброс без двигателя, склонение газовыми рулями («Тор» — до запуска двигателя), газодинамический доворот,
    // у «наклонных» контейнеров — полсекунды по оси контейнера
    let gas = false;
    if (LN) {
      if (m.tb < 0) { gas = true; if (LN.ej.tilt && m.t > LN.ej.t) { turnToward(m.dir, m.gdDir, LN.gd * dt); fx.samJet(m); } }
      else if (LN.gd && m.tb < LN.gdT) { gas = true; turnToward(m.dir, m.gdDir, LN.gd * dt); }
      else if (LN.mode === 'box' && m.tb < 0.5) gas = true;
    }
    if (m.decoy) { if (m.decoy.life > 0) { aim = m.decoy.pos; avel = m.decoy.vel; } else { m.decoy = null; m.lost = true; } }
    else if (!m.lost && T && !T.dead) {
      // данные РЛС комплекса: эту цель сопровождают (одноканальные — только её; многоканальные — любую видимую)
      const link = () => !u.dead && (u.track === T || ((S.channels || 1) > 1 && u.emit && radarSees(u, T)))
        && (u.emit || S.type === 'saclos' || (S.optTrack && eyesSee(u, T)));
      if (S.type === 'ir') {
        const sees = angleBetween(m.dir, TMP.copy(T.pos).sub(m.pos)) <= 60 * D2R && irSees(S, T, m.pos, null, 999);
        if (sees) { aim = T.pos; avel = T.vel; m.seen = true; }
        else if (S.loal && !m.seen && link()) { aim = T.pos; avel = T.vel; } // захват после пуска: пока ГСН не видит — по данным РЛС
        else m.lost = true;
      } else if (S.type === 'arh') {
        // активная ГСН: до включения — по командам РЛС (или в последнюю точку), после — сама
        if (!m.active) {
          if (link()) { m.last.copy(T.pos); m.lastV.copy(T.vel); } else m.last.addScaledVector(m.lastV, dt);
          aim = m.last; avel = m.lastV; lead = 0.95;
          if (m.pos.distanceTo(m.last) < (S.pitbull || 8000)) m.active = true;
        } else if (angleBetween(m.dir, TMP.copy(T.pos).sub(m.pos)) < 60 * D2R && city.los(m.pos.x, m.pos.y, m.pos.z, T.pos.x, T.pos.y, T.pos.z, 5)) { m.lostT = 0; aim = T.pos; avel = T.vel; lead = 1; }
        else { m.lostT += dt; if (m.lostT > 1.5) m.lost = true; }
      } else {
        // командное, полуактивное, через ракету: нужна РЛС (или оптика) комплекса
        if (link()) {
          m.lostT = 0; aim = T.pos; avel = T.vel;
          lead = S.type === 'sarh' || S.type === 'tvm' ? 0.95 : u.method === 'half' ? 0.75 : 0.45; // «три точки» — ракета догоняет; «половинное спрямление» — ближе к перехвату
        } else { m.lostT += dt; if (m.lostT > 2.5) m.lost = true; } // без сопровождения ракета летит по последним командам ~2,5 с
      }
    }
    // первые 0,4 с — без наведения (сход с направляющей); на последних секундах — перехват с полным упреждением
    // сход с направляющей и выход из застройки по линии старта: наведение — когда ракета выше ближайших крыш
    if (gas || m.tb < 0.4 || (m.tb < 3 && m.pos.y < m.clearY)) { aim = null; m.hold = true; } else { m.hold = false; if (aim && aim.distanceTo(m.pos) < m.speed * 2.5) lead = 1; }
    // горка на старте: впереди дом выше ракеты — тянем вверх (первые 3 с, пока не вышла из застройки)
    if (m.tb < 3 && !gas) {
      const ahead = Math.max(60, m.speed * 1.2);
      if (city.topAt(m.pos.x + m.dir.x * ahead, m.pos.z + m.dir.z * ahead) + 15 > m.pos.y + m.dir.y * ahead) { aim = null; turnToward(m.dir, TMP2.copy(m.dir).setY(Math.max(m.dir.y, 0) + 0.8).normalize(), 1.2 * dt); }
    }
    const motor = flyMissile(m, M_, dt, aim, avel, lead);
    if (LN && LN.stage && !m.staged && m.tb >= M_.burn) { m.staged = true; fx.samStage(m); } // ускоритель выгорел и отделился
    fx.samMotor(m, motor);
    m.trailT -= dt; if (motor && m.trailT <= 0) { m.trailT = M_.L > 5 ? 0.03 : 0.04; fx.samTrail(m); }
    // неконтактный взрыватель
    if (T && T.isMun && !T.dead && m.flown > 150 && m.pos.distanceTo(T.pos) < M_.blast * 0.85 + 2) { intercept(T); m.dead = true; fx.samEnd(m, true); fx.explosion(m.pos, M_.blast * 0.6, 'air'); return; }
    if (m.flown > 150) for (const a of ctx.aircraft()) {
      if (a.dead) continue;
      const px = a.pos.x - m.pos.x, py = a.pos.y - m.pos.y, pz = a.pos.z - m.pos.z;
      if (px * px + py * py + pz * pz > 400 * 400) continue;
      const vx = a.vel.x - m.dir.x * m.speed, vy = a.vel.y - m.dir.y * m.speed, vz = a.vel.z - m.dir.z * m.speed;
      const qx = px - vx * dt, qy = py - vy * dt, qz = pz - vz * dt, vv = vx * vx + vy * vy + vz * vz || 1e-6;
      const ts = clamp(-(qx * vx + qy * vy + qz * vz) / vv, 0, dt);
      const rx = qx + vx * ts, ry = qy + vy * ts, rz = qz + vz * ts, dmin = Math.hypot(rx, ry, rz);
      if (dmin < a.r * 0.5 + M_.blast * 0.85) { m.pos.set(a.pos.x - rx, a.pos.y - ry, a.pos.z - rz); samDetonate(m, true); return; }
    }
    if (m.decoy && m.pos.distanceTo(m.decoy.pos) < 15) { samDetonate(m, false); return; }
    // первые 1,5 с ракета уходит вверх из застройки — дома вокруг пусковой не учитываем (пусковая не стреляет в стену)
    if (m.pos.y < (m.t < 1.5 ? city.groundH(m.pos.x, m.pos.z) : city.topAt(m.pos.x, m.pos.z)) || m.t > M_.life || (m.tb > M_.burn + 2 && m.speed < (M_.vmin || 200) * 0.6)) samDetonate(m, false);
  }
  function samDetonate(m, near) {
    if (m.dead) return;
    m.dead = true;
    let hit = false;
    if (near) for (const a of ctx.aircraft()) {
      if (a.dead) continue;
      const d = Math.max(0, a.pos.distanceTo(m.pos) - a.r * 0.5);
      if (d < m.M.blast) { ctx.hurt(a, m.M.dmg * Math.pow(1 - d / m.M.blast, 0.6), m.S.short); hit = true; }
    }
    fx.samEnd(m, hit);
    fx.explosion(m.pos, m.M.blast, 'air');
  }

  // ═════════════ Ловушки и диполи самолёта ═════════════
  function dropCM(a, type) {
    const M = ctx.mode();
    fx.cmDrop(a, type);
    if (type === 'flare') {
      // залп из двух ловушек в стороны-вниз; уводит первая
      const mk = (side) => { const g = { pos: a.pos.clone(), vel: a.vel.clone().multiplyScalar(0.6).add(TMP.set((rnd() - 0.5) * 20 + side * 14, -18 - rnd() * 8, (rnd() - 0.5) * 20)), life: 3.5, max: 3.5, owner: a }; flares.push(g); return g; };
      const f = mk(-1); mk(1);
      for (const m of sams) {
        if (m.dead || m.decoy || m.lost || m.S.type !== 'ir' || m.target !== a) continue;
        if (m.pos.distanceTo(a.pos) > 7000 || angleBetween(m.dir, TMP.copy(a.pos).sub(m.pos)) > 25 * D2R) continue;
        // ранние ГСН уводятся почти всегда; ракурс «в лоб» ловушке помогает меньше
        const head = offTailDeg(a, m.pos) > 90 ? 0.6 : 1;
        if (rnd() < (1 - (m.S.irccm || 0)) * 0.75 * head * M.cmK) { m.decoy = f; fx.decoyed(m, f); }
      }
    } else {
      // диполи: РЛС сопровождения может «перескочить» на облако. Когерентная (доплеровская) РЛС неподвижное облако
      // отсекает — сработает, только если цель идёт «траверзом»; частый сброс подряд почти ничего не добавляет
      const spam = a.chaffT !== undefined && a.chaffT > 0 ? 0.35 : 1; a.chaffT = 3;
      for (const u of units) {
        if (u.dead || u.track !== a || !u.S.radar) continue;
        const beam = radial(u, a) < 80, dop = !!u.S.radar.doppler;
        const k = dop ? (beam ? 0.8 : 0.12) : (beam ? 1 : 0.45);
        if (rnd() < (1 - (u.S.eccm || 0)) * 0.45 * k * spam * M.cmK) { u.track = null; u.seeT = -0.8; u.relock = a; u.reactT = 0; fx.trackBroken(u, a); fx.radarState(u); }
      }
    }
  }
  function updateFlares(dt) {
    for (let i = flares.length - 1; i >= 0; i--) {
      const f = flares[i]; f.life -= dt;
      f.vel.multiplyScalar(Math.max(0, 1 - 0.9 * dt)); f.vel.y -= 9.8 * dt; f.pos.addScaledVector(f.vel, dt);
      if (f.life <= 0) flares.splice(i, 1);
    }
  }

  // ═════════════ Оружие самолёта ═════════════
  // opts: { aim — точка захвата (ТВ, лазер — для расчёта), target — комплекс (ПРР) }
  function release(a, key, opts = {}) {
    const W = AG[key];
    const w = { id: mid++, key, W, owner: a, pos: a.pos.clone().addScaledVector(TMP.set(0, -1, 0), 2.5), vel: a.vel.clone(), dir: a.vel.clone().normalize(),
      speed: a.speed, t: 0, flown: 0, dead: false, aim: opts.aim ? opts.aim.clone() : null, target: opts.target || null, mem: null, lost: false, homing: false, trailT: 0 };
    if (W.kind === 'arm' && w.target) w.mem = w.target.pos.clone();
    // летящее оружие — цель для «Тора», «Панциря», C-RAM: размер, ЭПР, тепло, «прочность»
    Object.assign(w, { isMun: true, r: 1.2, rcs: W.rcs ?? 0.12, ir: W.kind === 'cruise' ? 0.35 : 0.15, mhp: W.kind === 'cruise' ? 18 : 10, yaw: 0, pitch: 0, ab: false });
    if (W.kind === 'decoy') { if (ctx.spawnDecoy) ctx.spawnDecoy(a, key, w.aim); return null; } // ложная цель — как самолёт (у хозяина боя)
    if (W.kind === 'cruise') { w.speed = Math.max(a.speed, 180); w.dir.copy(a.vel).setY(Math.min(0, a.vel.y)).normalize(); }
    wpns.push(w);
    fx.wpnRelease(w);
    return w;
  }
  function updateWpn(w, dt) {
    const W = w.W; w.t += dt;
    w.yaw = Math.atan2(-w.dir.x, -w.dir.z); w.pitch = Math.asin(clamp(w.dir.y, -1, 1));
    if (W.kind === 'cruise') { updateCruise(w, dt); return; }
    if (W.kind === 'bomb' || W.kind === 'lgb' || W.kind === 'tvb' || W.kind === 'gps') {
      // бомба: баллистика + рули (у управляемых) — поворот вектора скорости не больше располагаемой перегрузки
      const v = w.vel.length(), rho = rhoAt(w.pos.y);
      // планирующие (SDB, УМПК) держатся в воздухе крылом, пока далеко до цели
      w.vel.y -= G0 * dt * (W.glide && w.aim && w.pos.distanceTo(w.aim) > 2500 ? 0.3 : 1);
      w.vel.multiplyScalar(Math.max(0, 1 - W.kd * 1e-4 * rho * v * dt));
      let aim = null;
      if (W.kind === 'lgb') {
        const spot = ctx.laserSpot(w.owner);
        // ГСН видит пятно: в поле зрения и без зданий между
        if (spot && angleBetween(w.vel, TMP.copy(spot).sub(w.pos)) < W.fov * D2R && city.los(w.pos.x, w.pos.y, w.pos.z, spot.x, spot.y, spot.z, 4)) { aim = spot; w.homing = true; w.aimSeen = spot.clone(); }
        else w.homing = false;
      } else if (W.kind === 'gps' && w.aim) {
        // спутниковое: летит в координаты; в зоне станции подавления навигации — уход на десятки метров (один раз)
        if (!w.jammed) for (const u of units) if (!u.dead && u.S.type === 'jammer' && u.pos.distanceTo(w.pos) < u.S.jamR) {
          w.jammed = true; const a2 = rnd() * 6.283, e = 25 + rnd() * 45; w.aim.x += Math.cos(a2) * e; w.aim.z += Math.sin(a2) * e; w.aim.y = city.topAt(w.aim.x, w.aim.z);
          fx.wpnJammed(w); break;
        }
        aim = w.aim; w.homing = !w.jammed;
      } else if (W.kind === 'tvb' && w.aim && !w.lost) {
        if (angleBetween(w.vel, TMP.copy(w.aim).sub(w.pos)) < W.fov * 2 * D2R) { aim = w.aim; w.homing = true; } else { w.lost = true; w.homing = false; }
      }
      if (aim && w.t > 0.6) {
        const sp = w.vel.length(); w.dir.copy(w.vel).divideScalar(sp || 1);
        // цель с упреждением на «провисание» под тяжестью — бомба идёт чуть выше линии визирования
        const d = w.pos.distanceTo(aim), tgo = d / Math.max(80, sp);
        AIM.copy(aim).addScaledVector(UPV, 0.5 * G0 * tgo * tgo * 0.35).sub(w.pos).normalize();
        turnToward(w.dir, AIM, W.g * G0 / Math.max(80, sp) * dt);
        w.vel.copy(w.dir).multiplyScalar(sp);
      }
      w.pos.addScaledVector(w.vel, dt); w.speed = w.vel.length();
    } else {
      // ракета: ТВ («выстрелил и забыл» по захваченной точке), лазерная (по пятну), ПРР (по излучению или по памяти)
      let aim = null;
      if (w.t > 0.5 && !w.lost) {
        if (W.kind === 'agm' && W.seeker === 'tv') {
          if (w.aim && angleBetween(w.dir, TMP.copy(w.aim).sub(w.pos)) < W.fov * 2 * D2R) aim = w.aim; else w.lost = true;
        } else if (W.kind === 'agm' && W.seeker === 'laser') {
          const spot = ctx.laserSpot(w.owner);
          if (spot && angleBetween(w.dir, TMP.copy(spot).sub(w.pos)) < W.fov * D2R && city.los(w.pos.x, w.pos.y, w.pos.z, spot.x, spot.y, spot.z, 4)) aim = spot;
        } else if (W.kind === 'arm' && w.target) {
          const u = w.target, emitting = !u.dead && u.emit;
          if (emitting && angleBetween(w.dir, TMP.copy(u.ant).sub(w.pos)) < W.fov * D2R) { w.mem = w.mem || new THREE.Vector3(); w.mem.copy(u.ant); aim = u.ant; }
          else if (W.mmw && w.mem && !u.dead && w.pos.distanceTo(w.mem) < 3500 && u.pos.distanceTo(w.mem) < 60) aim = u.ant; // AARGM: миллиметровая ГСН находит молчащую машину
          else if (W.mem && w.mem) aim = w.mem;   // HARM, Х-58: летит в запомненную точку
          else w.lost = true;                     // Shrike, Х-28: потеряла цель
        }
      }
      w.homing = !!aim;
      flyMissile(w, W, dt, aim, null, 0);
      w.vel.copy(w.dir).multiplyScalar(w.speed);
      w.trailT -= dt; if (w.t < W.burn && w.trailT <= 0) { w.trailT = 0.04; fx.wpnTrail(w); }
      if (W.kind === 'arm' && aim && w.pos.distanceTo(aim) < 14) { wpnDetonate(w); return; }
    }
    if (w.pos.y <= Math.max(city.topAt(w.pos.x, w.pos.z), -4) || w.t > (W.life || 150)) wpnDetonate(w);
  }
  // крылатая ракета: маршевый двигатель держит скорость, полёт на малой высоте с облётом крыш (смотрит вперёд),
  // за 1,8 км до цели — пикирование в точку (на конце — оптическая/тепловизионная ГСН)
  function updateCruise(w, dt) {
    const W = w.W, aim = w.aim; w.t += 0; w.speed += (W.speed - w.speed) * Math.min(1, dt * 0.5);
    TMP.copy(aim || w.pos.clone().addScaledVector(w.dir, 1000)).sub(w.pos); const dh = Math.hypot(TMP.x, TMP.z);
    if (dh < 1800) TMP.normalize();
    else {
      TMP.y = 0; TMP.normalize();
      let top = 0; for (const L of [150, 400, 800]) top = Math.max(top, city.topAt(w.pos.x + TMP.x * L, w.pos.z + TMP.z * L));
      TMP.y = clamp((top + W.alt - w.pos.y) / 300, -0.25, 0.4); TMP.normalize();
    }
    turnToward(w.dir, TMP, 0.7 * dt);
    w.pos.addScaledVector(w.dir, w.speed * dt); w.vel.copy(w.dir).multiplyScalar(w.speed); w.homing = true;
    w.trailT -= dt; if (w.trailT <= 0) { w.trailT = 0.08; fx.wpnTrail(w); }
    if (w.pos.y <= Math.max(city.topAt(w.pos.x, w.pos.z), -4) || w.t > W.life) wpnDetonate(w);
  }
  function wpnDetonate(w) {
    if (w.dead) return;
    w.dead = true;
    const res = blast(w.pos, w.W.dmg, w.W.blast, w.W.short, w.owner);
    fx.wpnEnd(w, res);
    fx.explosion(w.pos, w.W.blast, w.W.vis && w.W.vis.kind !== 'missile' ? 'bomb' : 'ground'); // бомба — крупнее, со вспышкой и пылью
  }
  // урон взрывом по объектам и комплексам; возвращает, кого задело
  function blast(p, dmg, R, by, owner = null) { // owner — самолёт, чьё оружие (онлайн: кому засчитать)
    const res = { objects: [], units: [] };
    for (const o of objects) {
      if (o.dead) continue;
      let dmin = 1e9;
      for (const q of o.parts) {
        const base = q.y0 !== undefined ? q.y0 : city.groundH(q.x, q.z), top = base + q.h;
        let dh;
        if (q.t === 'box') dh = Math.hypot(Math.max(0, Math.abs(p.x - q.x) - q.w / 2), Math.max(0, Math.abs(p.z - q.z) - q.d / 2));
        else dh = Math.max(0, Math.hypot(p.x - q.x, p.z - q.z) - q.r);
        const dv = p.y > top ? p.y - top : p.y < base ? base - p.y : 0;
        dmin = Math.min(dmin, Math.hypot(dh, dv));
      }
      if (dmin < R) {
        const k = dmin < 2 ? 1.25 : Math.pow(1 - dmin / R, 0.6);
        const amount = dmg * k;
        o.hp -= amount; o.dmgTaken += amount; res.objects.push(o);
        fx.objectHit(o, amount, p);
        if (o.hp <= 0) { o.dead = true; o.hp = 0; fx.objectDestroyed(o, by, owner); }
      }
    }
    for (const u of units) {
      if (u.dead) continue;
      const d = Math.max(0, u.pos.distanceTo(p) - 4);
      if (d < R) {
        const amount = dmg * Math.pow(1 - d / R, 0.6) * 1.2;
        u.hp -= amount; res.units.push(u); fx.unitHit(u, amount);
        if (u.hp <= 0) { u.dead = true; u.emit = false; u.track = null; fx.unitDestroyed(u, by, owner); fx.radarState(u); }
      }
    }
    return res;
  }

  // ═════════════ Шаг боя ═════════════
  function step(dt) {
    net.alertT = Math.max(0, net.alertT - dt);
    const targets = ctx.aircraft();
    for (const a of targets) if (a.chaffT > 0) a.chaffT -= dt;
    for (const u of units) { updateUnit(u, dt, targets); aimLauncher(u, dt); }
    for (const m of sams) if (!m.dead) updateSam(m, dt);
    for (const w of wpns) if (!w.dead) updateWpn(w, dt);
    updateFlares(dt);
    for (let i = sams.length - 1; i >= 0; i--) if (sams[i].dead) sams.splice(i, 1);
    for (let i = wpns.length - 1; i >= 0; i--) if (wpns[i].dead) wpns.splice(i, 1);
  }

  // ═════════════ Станция предупреждения об облучении (СПО) самолёта a ═════════════
  // Излучающие РЛС видны дальше, чем они видят самолёт (сигнал идёт в одну сторону). state: 'search' — облучает обзором,
  // 'track' — захват, 'launch' — ведёт ракету по самолёту. ИК-ракеты и ПЗРК в СПО не видны — их ловит датчик пуска (mws).
  function rwr(a) {
    const out = [];
    for (const u of units) {
      if (u.dead || !u.S.radar || !u.emit) continue;
      const d = u.ant.distanceTo(a.pos);
      if (d > u.S.radar.range * 1.6) continue;
      if (!city.los(u.ant.x, u.ant.y, u.ant.z, a.pos.x, a.pos.y, a.pos.z, 25)) continue;
      let state = u.track === a ? 'track' : 'search';
      if (state === 'track' && sams.some((m) => !m.dead && !m.lost && m.unit === u && m.target === a)) state = 'launch';
      if (state === 'track' && u.S.type === 'guns' && u.gunOn) state = 'launch';
      out.push({ u, d, state });
    }
    return out;
  }
  // датчик пуска: ракеты с работающим двигателем, летящие к самолёту (любые, в том числе ИК)
  function mws(a) {
    const out = [];
    for (const m of sams) {
      if (m.dead || m.target !== a || m.tb < 0 || m.tb > m.M.burn + 1.5) continue;
      const d = m.pos.distanceTo(a.pos);
      if (d < 9000) out.push({ m, d });
    }
    return out;
  }

  return { units, sams, wpns, flares, objects, net, addUnit, release, dropCM, step, rwr, mws, radarSees, eyesSee, inZone, blast, aglOf,
    launch, designate, setEmit, setManual, gunLead, irSees, removeUnit, moveUnit, launcherReady };
}

// ═════════════ Предсказание полёта бомбы (CCIP и зона сброса) ═════════════
// Бомба из точки p со скоростью v: куда упадёт (без наведения). Для управляемых — ещё и «достанет ли до точки aim»:
// упрощённо — летим с наведением на aim и смотрим промах.
const PP = new THREE.Vector3(), PV = new THREE.Vector3(), PD = new THREE.Vector3(), PA = new THREE.Vector3();
export function predictBomb(city, W, p, v, aim, out) {
  PP.copy(p); PV.copy(v);
  const dt = 0.1;
  for (let t = 0; t < 120; t += dt) {
    const sp = PV.length(), rho = rhoAt(PP.y);
    PV.y -= G0 * dt * (W.glide && aim && PP.distanceTo(aim) > 2500 ? 0.3 : 1); PV.multiplyScalar(Math.max(0, 1 - W.kd * 1e-4 * rho * sp * dt));
    if (aim && W.kind !== 'bomb' && t > 0.6) {
      const s2 = PV.length(); PD.copy(PV).divideScalar(s2 || 1);
      const d = PP.distanceTo(aim), tgo = d / Math.max(80, s2);
      PA.copy(aim); PA.y += 0.5 * G0 * tgo * tgo * 0.35; PA.sub(PP).normalize();
      turnToward(PD, PA, W.g * G0 / Math.max(80, s2) * dt);
      PV.copy(PD).multiplyScalar(s2);
    }
    PP.addScaledVector(PV, dt);
    if (PP.y <= Math.max(city.topAt(PP.x, PP.z), -4)) { out.copy(PP); return t; }
  }
  return -1;
}
