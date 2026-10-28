// Бой «Воздушного превосходства»: зенитные комплексы, их ракеты и пушки, ударное оружие самолётов, ловушки, разрушения.
// Без сцены, DOM и звука (как sim/battle.js «Летки»): всё видимое делает хозяин через хуки ctx.fx. Тот же код
// потом возьмёт онлайн-сервер.
//
// ctx: {
//   city            — город (city.js): los, raycast, topAt, objects;
//   mode()          — параметры режима (MODES ниже),
//   aircraft()      — массив самолётов (у каждого pos, vel, yaw/pitch/roll, speed, ab, ir, r, dead, rcs, side),
//   hurt(a, dmg, by, from)— урон самолёту (корпус и гибель — логика хозяина; from — точка подрыва, для зон),
//   laserSpot(a)    — точка подсвета лазером самолёта a (или null),
//   night           — 0…1 (ТВ-головки ночью не видят, расчёты ПЗРК видят хуже),
//   rnd             — генератор случайных чисел (по умолчанию Math.random),
//   fx: { ... }     — хуки (список — в NOOP_FX).
// }
/* global THREE */
import { tr } from '../i18n.js?v=20261027d';
import { AG, SAM } from '../arsenal.js?v=20261027d';
import { LNCH, lnchToWorld, lnchDir, slotOf, trainable } from '../launchers.js?v=20261027d';
import { clamp, D2R, G0, rhoAt, angleBetween, seekerHeat, offTailDeg, turnToward } from '../../drone/sim/core.js?v=20261027d';
import { cmOf, cmKey, cmBoost, cmWorld } from './cm.js?v=20261027d';
import { partDist } from '../city.js?v=20261027d';

// Режимы: Аркада прощает (медленнее реакция ПВО, меньше урона, больше ловушек и диполей), Реализм — как есть
// ind — доля индуктивного сопротивления в лётной модели самолётов (sim/flight.js): в «Аркаде» в вираже скорость теряется вдвое меньше
export const MODES = {
  // Аркада с 2026-10-20 строже: урон по игроку 0,75 (было 0,55), реакция ×1,2 (1,4), расчёты 0,85 (0,7), ловушек 200 (290), пушки 0,85 (0,7)
  arcade: { ind: 0.5, name: tr('Аркада'), desc: tr('больше ловушек, меньше урона, ПВО медленнее реагирует, все угрозы на экране; запас — 2 комплекта подвески, пополняется сам'), dmgTaken: 0.75, reactK: 1.2, samSkill: 0.85, cmK: 1.15, cm: 200, fuelS: 330, rearms: 2 /* запас: комплектов подвески («Реализм» — пополнений у точки вылета) */, markers: true, gunK: 0.85, reload: 'auto', reloadK: { air: 0.5, multi: 0.8 } },
  real: { ind: 1, name: tr('Реализм'), desc: tr('только СПО и датчик пуска, полный урон, опытные расчёты; одно пополнение у точки вылета'), dmgTaken: 1, reactK: 1, samSkill: 1, cmK: 1, cm: 145, fuelS: 240, rearms: 1, markers: false, gunK: 1, reload: 'home', reloadK: { air: 0.7, multi: 0.9 } }, // reload: 'auto' — подвеска пополняется сама, 'home' — у точки вылета; fuelS — секунд на полном газе (форсаж — втрое быстрее); cm — пачек ловушек (ЛТЦ и диполи разом, одной кнопкой)
};

// Виды целей для фильтра комплекса (Mark 2026-10-25: «все цели либо только какие-то конкретные»). Виды совпадают с цветными плашками «что сбивает»
// (icons.js samCaps): air — самолёты и вертолёты (и ложные цели налёта, пока они летят как самолёты); drone — дроны и разведчик «Мульти-волны»;
// bomb — бомбы и ракеты с самолётов (в том числе планирующие и крылатые, пущенные налётом — не ev); cruise — крылатые и планирующие ракеты «Мульти-волны»
// и ложные цели (MALD); tbm — баллистика. u.tgt — null (все) или Set видов; расчёт ИИ берёт только их, оператор (u.manual) — без ограничений
export const TGT_CATS = ['air', 'drone', 'bomb', 'cruise', 'tbm'];
export function tgtCat(t, multi = true) { // multi — идёт «Мульти-волна» (evOn): ложная цель налёта тогда — «крылатая», в обороне от налёта — самолёт (там плашки «крылатые» нет)
  if (!t.isMun) return t.role === 'decoy' && multi ? 'cruise' : 'air';
  if (!t.ev) return 'bomb';
  return t.W.kind === 'tbm' ? 'tbm' : t.W.uav ? 'drone' : 'cruise';
}
// из списка (с клиента, по сети) — Set видов или null («все»): незнакомые названия отбрасываются, пустой и полный набор — «все»
export function cleanTgt(list) {
  if (!Array.isArray(list)) return null;
  const s = new Set(list.slice(0, 8).filter((k) => TGT_CATS.includes(k)));
  return s.size && s.size < TGT_CATS.length ? s : null;
}

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

const TMP = new THREE.Vector3(), TMP2 = new THREE.Vector3(), AIM = new THREE.Vector3(), UPV = new THREE.Vector3(0, 1, 0), LOFT = new THREE.Vector3(), PREV = new THREE.Vector3();
const SF_A = new THREE.Vector3(), SF_B = new THREE.Vector3(), SF_M = new THREE.Vector3();
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function createStrike(ctx) {
  const fx = { ...NOOP_FX, ...(ctx.fx || {}) };
  const rnd = ctx.rnd || Math.random;
  const city = ctx.city;
  const units = [], sams = [], wpns = [], flares = [];
  const objects = city.objects.map((o) => ({ ...o, hpMax: o.hp, dead: false, dmgTaken: 0 }));
  // перезарядка ПВО по игре: ctx.game 'air' (вылеты) / 'multi' («Мульти-волна») — быстрее по режиму (MODES.reloadK), до 5 с
  const reloadOf = (S) => { const b = S.reload || 60, k = ctx.game && ((ctx.mode() || {}).reloadK || {})[ctx.game]; return k ? Math.max(5, Math.round(b * k / 5) * 5) : b; };
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
      ammo: S.ammo, reloadT: 0, salvoLeft: 0, gunT: 0, gunOn: false, skill: o.skill ?? 0.7, armSeen: new Set(), roof: !!o.roof, known: false, tgt: null, // tgt — фильтр видов целей (null — все)
      lyaw: (LN && LN.yaw0) || 0, lel: LN ? LN.el ?? 0.35 : 0, lnEl: null, lnT: 0, lnErr: 0, slotT: {}, lid: 0 }; // lid — крышка следующей ячейки «Тора»: 0 закрыта … 1 открыта
    if (LN && LN.erect) { u.dep = u.emit ? LN.erect.jk + LN.erect.up : 0; u.lel = u.emit ? LN.el : 0; } // С-300 / С-400: с включённой РЛС — уже на позиции (пакет поднят), в засаде — лежит
    units.push(u);
    return u;
  }
  function removeUnit(u) { const i = units.indexOf(u); if (i >= 0) units.splice(i, 1); }
  // новая позиция (между волнами): машина переезжает, ракеты в пусковой остаются
  function moveUnit(u, x, z, roof) {
    const y = roof ? city.topAt(x, z) : city.groundH(x, z);
    u.pos.set(x, y + 1.5, z); u.ant.set(x, y + (u.S.radar ? u.S.radar.mast : 2), z); u.roof = !!roof;
  }
  // наклон машины по рельефу (как её ставит отрисовка — main.js seat): тангаж tx и крен tz по высоте земли спереди / сзади и
  // слева / справа; ракета уходит по оси наклонённой пусковой. Пересчёт — если машину переставили или развернули
  function unitTilt(u) {
    const k = u.pos.x * 7 + u.pos.z * 13 + u.yaw;
    if (u.tiltK !== k) {
      u.tiltK = k; const hw = 1.3, hl = 3.5, c = Math.cos(u.yaw), s = Math.sin(u.yaw);
      const h = (lx, lz) => city.groundH(u.pos.x + lx * c + lz * s, u.pos.z - lx * s + lz * c);
      if (u.roof) { u.tx = 0; u.tz = 0; } else { u.tx = Math.atan2(h(0, -hl) - h(0, hl), 2 * hl); u.tz = Math.atan2(h(hw, 0) - h(-hw, 0), 2 * hw); }
    }
    return u;
  }
  const aglOf = (a) => a.pos.y - city.groundH(a.pos.x, a.pos.z);
  // РЛС видит цель: дальность по ЭПР, радиогоризонт, земля под целью (у некогерентных — «низкую» цель не видно),
  // доплеровский провал у когерентных, здания и рельеф между антенной и целью
  function radarSees(u, t) {
    const R = u.S.radar, d = u.ant.distanceTo(t.pos);
    let range = R.range * Math.min(1.4, Math.pow((t.rcs || 5) / 5, 0.25));
    if (t.W && t.W.kind === 'tbm' && u.S.abm) range = R.range * 1.2; // противоракетный режим РЛС: баллистическую цель видно на полную дальность
    // станция помех цели: РЛС видит её ближе, пока не «прожжёт» помеху (помехозащищённые — почти не замечают)
    if (t.jam) range = Math.max(R.range * 0.3 * (1 + (u.S.eccm || 0)), range * (1 - t.jam * 0.6 * (1 - (u.S.eccm || 0))));
    if (d > range) return false;
    const h = aglOf(t);
    if (h < R.clutter) return false;
    const horizon = 4120 * (Math.sqrt(Math.max(1, u.ant.y - city.groundH(u.ant.x, u.ant.z))) + Math.sqrt(Math.max(1, h)));
    if (d > horizon) return false;
    if (R.doppler && h < 1500 && radial(u, t) < 32 && !t.heli) return false; // вертолёт: лопасти дают доплер и на висении — прятаться только рельефом и высотой
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
    return d > S.rmin && d < S.rmax && h > S.hmin && h < S.hmax || meetSoon(u, t);
  }
  // баллистика: противоракетный ЗРК стреляет в упреждённую точку — пуск разрешён, если к подлёту ЗУР (≈ 1,1 км/с в среднем,
  // плюс 1,5 с на старт) цель уже будет в зоне, хотя сейчас она выше или дальше
  const MEET = new THREE.Vector3();
  function meetSoon(u, t) {
    if (!t.W || t.W.kind !== 'tbm' || !u.S.abm || t.vel.y >= 0) return false;
    const S = u.S;
    for (let tau = 1; tau < 25; tau += 0.5) {
      MEET.copy(t.pos).addScaledVector(t.vel, tau);
      const h = MEET.y - city.groundH(MEET.x, MEET.z), d = u.pos.distanceTo(MEET);
      if (h < Math.max(S.hmin, 1500)) return false; // так низко — уже не успеть
      if (Math.abs(d / 1100 + 1.5 - tau) < 0.5) return d > S.rmin && d < S.rmax && h < S.hmax;
    }
    return false;
  }
  function updateUnit(u, dt, targets) {
    if (u.dead) return;
    const S = u.S, M = ctx.mode();
    u.cool = Math.max(0, u.cool - dt);
    if (u.reloadT > 0) { u.reloadT -= dt; if (u.reloadT <= 0) u.ammo = S.ammo; }
    if (S.type === 'jammer') return; // станция подавления навигации работает сама (см. updateWpn)
    if (S.antiMun || evOn || u.tgt) targets = targetsFor(u, targets);
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
    // выбор и сопровождение цели; сбитая цель снимается с захвата — новую берут заново, с временем захвата и реакции
    // (2026-10-24: сбитая оставалась в u.track — комплекс пускал ракеты по обломкам, в sim-test востока эпохи 1 — 20 из 49 пусков)
    if (u.track && u.track.dead) { u.track = null; u.reactT = 0; u.seeT = 0; fx.radarState(u); }
    let t = u.track;
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
      u.lostT = 0; u.seeT += dt; u.seeTgt = t; // кого видит (интерфейс: «вас видит» — только про игрока)
      // вертолёт у земли (ниже 60 м) берут на 3 с дольше (Mark 2026-10-22): выскочил из-за складки — успевает пустить ПТУР и уйти вниз
      // (пока не видно, seeT тает вдвое быстрее — подскок снова начинает отсчёт почти с нуля)
      const acq = (S.radar ? S.radar.acq : 2) * (M.reactK || 1) + (t.heli && aglOf(t) < 60 ? 3 : 0);
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
        if (u.ammo <= 0) u.reloadT = u.reload0 = reloadOf(S) * (ctx.reloadK ? ctx.reloadK() : 1); // онлайн: подавленная ПВО перезаряжается дольше
      }
    } else u.reactT = Math.max(0, u.reactT - dt * 0.5);
  }

  // очереди ИИ-расчёта: с перерывами; вероятность попадания падает с дальностью и угловой скоростью цели
  function aiGuns(u, tr, dt, rmax, hmax, noReact) {
    const S = u.S, G = S.gun, M = ctx.mode(), d = u.pos.distanceTo(tr.pos);
    if (!(d < rmax && aglOf(tr) < hmax && u.ammo > 0 || (S.type !== 'guns' && d < rmax))) { u.gunOn = false; return false; }
    if (!noReact) { u.reactT += dt; if (u.reactT < S.react * (M.reactK || 1)) return true; }
    if (u.gunForce > 0) { u.gunForce -= dt; u.gunOn = true; u.gunT = Math.max(u.gunT, 0.3); } // принудительная очередь («Съёмка», forceLaunch): без перерыва и без огневой дисциплины
    u.gunT -= dt;
    if (u.gunT <= 0) { u.gunOn = !u.gunOn; u.gunT = u.gunOn ? G.burst : G.pause * (0.7 + rnd() * 0.6); }
    // огневая дисциплина: расчёт не тратит снаряды, пока шанс попасть мал (дрон за 3 км) — ждёт, сопровождая
    TMP.copy(tr.pos).sub(u.pos); const w = TMP.clone().cross(tr.vel).length() / Math.max(1, d * d); // угловая скорость, рад/с
    const p = G.hitK * M.gunK * Math.pow(1 - d / rmax, 1.4) / (1 + w * 9) * u.skill * M.samSkill * (tr.isMun ? 0.6 : 1);
    if (p * 8 < 0.1 && !(u.gunForce > 0)) { u.gunOn = false; return true; }
    if (u.gunOn) {
      if (S.type === 'guns') { u.ammo -= dt * (G.rof || 30); if (u.ammo <= 0) { u.gunOn = false; u.reloadT = u.reload0 = reloadOf(S); } } // темп — по пушкам комплекса; кончились — подвоз
      const hits = rnd() < p * dt * 8 ? 1 + Math.floor(rnd() * 3) : 0;
      if (tr.heli) u.known = true; // огонь по вертолёту выдаёт позицию — на карте с кругом дальности (Mark 2026-10-22)
      fx.gunFire(u, tr, hits, dt);
      if (hits) { hurtAny(tr, G.dmg * hits, S.short, u.pos); fx.gunHit(u, tr, hits); }
    }
    return true;
  }
  // комплексы против летящего оружия: к самолётам добавляются бомбы, крылатые ракеты и ПРР в пределах ~60 % дальности
  // летящее оружие как цель: «Тор», «Панцирь», C-RAM (antiMun) — любое вблизи; оружие «Мульти-волны» (ev) — крылатые
  // и дроны берут все ЗРК, баллистику (tbm) — только противоракетные (S.abm)
  function targetsFor(u, aircraft) {
    const f = u.manual ? null : u.tgt, // фильтр видов целей (tgtCat): у оператора — без ограничений
      out = aircraft.filter((a) => !a.immune && (!f || f.has(tgtCat(a, evOn)))), S = u.S, // immune — носитель «Мульти-волны» за краем района (в жизни — за сотни км)
      R2 = Math.pow(S.rmax * 0.6, 2), E2 = Math.pow(S.rmax * 0.95, 2);
    for (const w of wpns) {
      if (w.dead || w.t < 1.5 || w.W.kind === 'decoy') continue;
      if (f && !f.has(tgtCat(w))) continue;
      const d2 = w.pos.distanceToSquared(u.pos);
      if (w.ev) { if (w.W.kind === 'tbm' ? S.abm && w.vel.y < 0 && d2 < E2 * 1.6 : (S.radar || S.type === 'ir' || S.type === 'guns') && d2 < E2) out.push(w); } // баллистику — на нисходящем участке
      else if (S.antiMun && d2 < R2) out.push(w);
    }
    return out;
  }
  // урон самолёту (хозяину боя) или летящему оружию (перехват)
  function hurtAny(t, dmg, by, from = null) { // from — откуда пришло (зоны повреждений самолёта)
    if (t.isMun) { t.mhp -= dmg; if (t.mhp <= 0) intercept(t); }
    else ctx.hurt(t, dmg, by, from);
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
      u.lostT = 0; u.seeT += dt; u.seeTgt = t; // кого видит (интерфейс: «вас видит» — только про игрока)
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
    u.gunOn = true; u.ammo -= dt * (S.gun.rof || 30); if (u.ammo <= 0) { u.gunOn = false; u.reloadT = u.reload0 = reloadOf(S); }
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
    if (hits) { hurtAny(t, S.gun.dmg * hits, S.short, u.pos); fx.gunHit(u, t, hits); }
  }
  function launch(u) {
    const S = u.S;
    if (u.dead) return tr('комплекс уничтожен');
    if (S.type === 'guns') return null;
    if (u.reloadT > 0) return tr('перезарядка {0} с', [Math.ceil(u.reloadT)]);
    if (u.ammo <= 0) return tr('нет ракет');
    if (u.cool > 0) return tr('пусковая не готова');
    const t = u.track;
    if (!t || t.dead) return S.type === 'ir' ? tr('ГСН не захватила цель') : tr('нет захвата цели');
    if (t.immune) return tr('далеко — цель вне зоны'); // носитель «Мульти-волны» за краем района: ракета по нему уходила впустую (взрыватель его не видит)
    if (S.radar && !u.emit && S.type !== 'saclos' && !S.optTrack && S.type !== 'ir') return tr('РЛС выключена — ракету некому вести');
    if (S.type === 'jammer') return tr('станция РЭБ не стреляет');
    const d = u.pos.distanceTo(t.pos), h = aglOf(t);
    if (!meetSoon(u, t)) { // баллистику можно и раньше — в упреждённую точку
      if (d < S.rmin) return tr('слишком близко');
      if (d > S.rmax) return tr('далеко — цель вне зоны');
      if (h < S.hmin) return tr('цель ниже зоны поражения');
      if (h > S.hmax) return tr('цель выше зоны поражения');
    }
    if (!launcherReady(u)) { const LN = LNCH[u.key]; return LN && LN.erect && !erected(u, LN) ? tr('пакет поднимается — ещё {0} с', [Math.ceil(LN.erect.jk + LN.erect.up - u.dep)]) : tr('пусковая разворачивается'); } // С-300 / С-400: после включения РЛС — ≈ 13 с
    launchSam(u, t); u.cool = 1.6; if (u.ammo <= 0) u.reloadT = u.reload0 = reloadOf(S) * (ctx.reloadK ? ctx.reloadK() : 1); // онлайн: подавленная ПВО перезаряжается дольше
    return null;
  }
  // принудительный пуск («Съёмка», кнопка «Пуск»; в бою не вызывается): захват цели t и перезарядка — сразу; пусковая доворачивается с настоящей скоростью
  // (крышка ячейки «Тора» открывается), ракета уходит, как только навелась (forceStep), — без рывка башни (Mark 2026-10-27: «пуск — не продолжение
  // процесса, а резкое перемещение»); не навелась за 6 с — как раньше, сразу. Пушки — очередь без перерыва ~1 с.
  // Возвращает ракету (пусковая уже наведена), 'pending' (доворачивается), 'guns' или null (комплекс — глушилка / убит)
  function forceLaunch(u, t) {
    const S = u.S; if (u.dead || !t || t.dead || S.type === 'jammer') return null;
    u.track = t; u.seeT = Math.max(u.seeT, 9); u.lostT = 0; u.reactT = 99; u.cool = 0; u.reloadT = 0; if (S.radar) u.emit = true;
    if (S.type === 'guns') { u.ammo = Math.max(u.ammo, 200); u.gunForce = Math.max(1, (S.gun.burst || 0.6) * 1.6); u.gunOn = true; u.gunT = u.gunForce; return 'guns'; }
    if (u.ammo <= 0) u.ammo = S.ammo;
    if (S.gun) u.gunForce = 0.8; // «Панцирь», «Тунгуска»: пушки вместе с ракетой
    if (launcherReady(u)) return forcedShot(u, t);
    const E = LNCH[u.key] && LNCH[u.key].erect; // С-300 / С-400: ждать и подъём пакета (иначе через 6 с — рывком)
    u.force = { t, left: 6 + (E ? E.jk + E.up - u.dep : 0) }; u.cool = 99; // своим ходом комплекс не пускает, пока ждёт наводки (иначе — две ракеты)
    return 'pending';
  }
  function forcedShot(u, t) { const m = launchSam(u, t); u.cool = 1.6; if (u.ammo <= 0) u.reloadT = u.reload0 = reloadOf(u.S) * (ctx.reloadK ? ctx.reloadK() : 1); return m; }
  // ожидание наводки принудительного пуска: цель держится, пусковая доворачивается (aimLauncher — каждый шаг), пуск — когда навелась
  // до aimLauncher: цель — принудительная (свой выбор цели комплексом в updateUnit её не сбивает)
  function forceHold(u) { const t = u.force.t; if (!u.dead && !t.dead) { u.track = t; u.lostT = 0; u.seeT = Math.max(u.seeT, 9); } }
  function forceStep(u, dt) {
    const f = u.force, t = f.t;
    if (u.dead || t.dead) { u.force = null; u.cool = 0; return; }
    const late = (f.left -= dt) <= 0;
    if (!launcherReady(u) && !late) return;
    if (late && LNCH[u.key] && LNCH[u.key].erect) { const LN = LNCH[u.key]; if (u.S.radar && !u.emit) { u.emit = true; fx.radarState(u); } u.dep = LN.erect.jk + LN.erect.up; u.lel = LN.el; u.lid = 1; } // С-300: РЛС выключили за время ожидания (ПРР) — не из лежащего пакета
    if (late) aimLauncher(u, 30); // не навелась за 6 с (цель за препятствием, медленная башня) — как раньше, сразу
    u.force = null; forcedShot(u, t);
  }
  function designate(u, t) { if (u.desig !== t) { u.desig = t; u.track = null; u.seeT = 0; fx.radarState(u); } }
  // фильтр целей комплекса (cats — список видов или null = все); сопровождаемая цель не того вида снимается, ракеты в воздухе долетают
  function setTgt(u, cats) {
    u.tgt = cats instanceof Set ? cleanTgt([...cats]) : cleanTgt(cats);
    if (u.tgt && !u.manual && u.track && !u.tgt.has(tgtCat(u.track, evOn))) { u.track = null; u.reactT = 0; u.seeT = 0; fx.radarState(u); }
  }
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
    const LN = LNCH[u.key]; if (!LN || u.dead) return;
    const S = u.S, man = u.manual && (S.type === 'guns' || S.type === 'ir');
    const t = man ? null : u.manual ? (u.desig && !u.desig.dead ? u.desig : u.track) : u.track;
    if (LN.erect) erectStep(u, LN, dt);
    // «Тор», NASAMS, С-300: крышка следующей ячейки открывается, пока цель сопровождается и есть ракеты (как по команде на пуск), иначе закрывается; у С-300 — только у поднятого пакета
    if (LN.lids) { const want = !!(t && !t.dead && u.track === t) && u.ammo > 0 && u.reloadT <= 0 && erected(u, LN); u.lid = clamp(u.lid + (want ? dt / LN.lids.tOpen : -dt / LN.lids.tClose), 0, 1); }
    if (!trainable(LN)) return;
    let dx, dy, dz;
    if (t && !t.dead) { dx = t.pos.x - u.pos.x; dy = t.pos.y - u.pos.y; dz = t.pos.z - u.pos.z; }
    else if (u.manual && u.aimDir) { dx = u.aimDir.x; dy = u.aimDir.y; dz = u.aimDir.z; }
    else { u.lnErr = 9; return; } // цели нет — пусковая не наведена (иначе в кадр захвата пуск шёл с прежней ошибкой 0 — до разворота; стенд sam-launch.js)
    const hd = Math.hypot(dx, dz) || 1, yawT = Math.atan2(-dx, -dz) - u.yaw;
    let elT = Math.atan2(dy, hd);
    if (LN.mode === 'rail' && S.msl) { if ((u.lnT -= dt) <= 0 || u.lnEl === null) { u.lnT = 0.3; u.lnEl = launchEl(u, dx / hd, dz / hd, elT); } elT = u.lnEl; }
    const dyaw = wrapPi(yawT - u.lyaw), ky = LN.slewY * dt;
    u.lyaw = wrapPi(u.lyaw + clamp(dyaw, -ky, ky));
    let de = 0;
    if (LN.el == null) { elT = clamp(elT, LN.elMin, LN.elMax); const ke = LN.slewE * dt; de = elT - u.lel; u.lel += clamp(de, -ke, ke); de = elT - u.lel; }
    u.lnErr = Math.max(Math.abs(wrapPi(yawT - u.lyaw)), Math.abs(de));
  }
  // С-300 / С-400: подъём пакета от РЛС (launchers.js erect). u.dep — место на графике «домкраты (jk) → подъём (up)»: РЛС включена — вперёд,
  // выключена — назад (пакет опускается за down с, потом домкраты); угол места — S-кривая 5-й степени (нулевые скорость и ускорение на концах)
  const s5 = (x) => x * x * x * (x * (6 * x - 15) + 10);
  function erectStep(u, LN, dt) {
    const E = LN.erect;
    u.dep = clamp(u.dep + (u.emit ? dt : -dt * (u.dep > E.jk ? E.up / E.down : 1)), 0, E.jk + E.up);
    u.lel = LN.el * s5(clamp((u.dep - E.jk) / E.up, 0, 1));
  }
  const erected = (u, LN) => !LN.erect || u.dep >= LN.erect.jk + LN.erect.up;
  // пусковая готова: С-300 — пакет поднят; «Тор», NASAMS, С-300 — крышка открыта; поворотные — навелись
  function launcherReady(u) { const LN = LNCH[u.key]; return !LN || (erected(u, LN) && (!LN.lids || u.lid >= 1) && (!trainable(LN) || u.lnErr < (LN.mode === 'tube' ? 0.12 : 0.09))); }
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
      unitTilt(u); pos = lnchToWorld(u, sl.Ld, sl.p, new THREE.Vector3()); dir = lnchDir(u, new THREE.Vector3());
      u.slotT[sl.idx] = 5; if (LN.lids) u.lid = 0; // «Тор»: крышка ушедшей ракеты ещё 3 с открыта и закрывается (вид — main.js torLids), следующая начинает открываться заново
      if (LN.mode === 'cold' || LN.mode === 'tube') { speed = LN.ej.acc ? 3 : LN.ej.v; ign = LN.ej.t + (LN.ej.tilt || 0); } // acc — разгон в контейнере (С-300)
      else speed = LN.mode === 'vhot' ? 20 : 25;
    } else { pos = u.pos.clone().add(TMP2.set(0, 3, 0)); dir = gdDir.clone(); }
    const m = { id: mid++, unit: u, S: u.S, M: M_, target: t, clearY, last: t.pos.clone(), lastV: t.vel.clone(), active: false, pos, dir, speed, t: 0, flown: 0, lost: false, lostT: 0, decoy: null, dead: false, trailT: 0,
      ln: LN || null, ign, tb: -ign, lit: ign === 0, staged: false, gdDir, slot: sl ? sl.idx : -1, up: LN && LN.ej && LN.ej.up ? upOf(LN.ej.up, M_) : null };
    u.ammo--; if (t.heli) u.known = true; // пуск по вертолёту выдаёт позицию (ПЗРК и ИК-комплексы иначе не «замечаются» никогда)
    sams.push(m);
    fx.samLaunch(m);
    return m;
  }
  // ИК-ГСН (ЗУР и ПЗРК): дальность по тепловой заметности, ракурс (у ранних — только хвост), поле зрения
  function irSees(S, t, from, axis, fovDeg) {
    const d = from.distanceTo(t.pos), R = S.rmax * 1.1 * Math.sqrt(seekerHeat(t, from));
    if (d > R) return false;
    if ((S.aspect || 180) < 180 && !(t.W && t.W.uav) && offTailDeg(t, from) > S.aspect) return false; // дрон (медленный, горячий мотор и корпус) — с любого ракурса
    if (axis && angleBetween(axis, TMP2.copy(t.pos).sub(from)) > fovDeg * D2R) return false;
    return true;
  }
  // С-300: первые up.t с после зажигания — вертикально, тяга a = разгон листа дыма + тяжесть; недобранный импульс — до конца работы двигателя (×k)
  const upOf = (U, M_) => { const a = U.a + G0; return { t: U.t, a, k: Math.max(1, (M_.acc * M_.burn - a * U.t) / (M_.acc * (M_.burn - U.t))) }; };
  // общий полёт ракеты: двигатель, сопротивление, гравитация вдоль оси, поворот с ограничением перегрузки
  function flyMissile(m, M_, dt, aim, avel, lead) {
    const tb = m.tb ?? m.t;
    // тяга — ровно burn секунд при любом шаге кадра: на шаге запуска и выгорания — доля шага (2026-10-22: при 60 к/с НАР летели на 5–10 % дальше, чем при 30)
    const bk = clamp((Math.min(tb, M_.burn) - Math.max(tb - dt, 0)) / dt, 0, 1);
    let acc = tb < 0 ? 0 : M_.acc * bk + (bk < 1 && tb >= M_.burn && M_.sustain && tb < M_.burn + M_.sustain.t ? M_.sustain.acc * (1 - bk) : 0);
    if (m.up && tb >= 0) acc = tb < m.up.t ? m.up.a : tb < M_.burn ? acc * m.up.k : acc; // С-300: первую секунду — как в листе дыма, дальше — с добором
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
    m.speed = Math.max(m.speed, m.tb < 0 || (m.up && m.tb < m.up.t) ? 3 : 30); // до запуска двигателя (выброс) ракета тормозит; С-300 — и первую секунду после (20 м/с, как в листе)
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
      else if (m.up && m.tb < m.up.t) gas = true; // С-300: строго вверх, пока сопло идёт по листу дыма
      else if (LN.gd && m.tb < (m.up ? m.up.t : 0) + LN.gdT) { gas = true; turnToward(m.dir, m.gdDir, LN.gd * dt); }
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
    if (aim && T && T.W && T.W.kind === 'tbm' && S.abm) lead = 1; // противоракетный режим: всегда в точку встречи (баллистика за 2 км/с — иначе не догнать)
    if (LN && LN.ej && LN.ej.acc && m.t <= LN.ej.tube) m.speed = Math.min(LN.ej.v, LN.ej.acc * m.t) + G0 * m.dir.y * dt; // С-300: в контейнере — разгон газом до ej.v (тяжесть вычтет flyMissile)
    const motor = flyMissile(m, M_, dt, aim, avel, lead);
    if (LN && LN.stage && !m.staged && m.tb >= M_.burn) { m.staged = true; fx.samStage(m); } // ускоритель выгорел и отделился
    fx.samMotor(m, motor);
    m.trailT -= dt; if (motor && m.trailT <= 0) { m.trailT = M_.L > 5 ? 0.03 : 0.04; fx.samTrail(m); }
    // неконтактный взрыватель
    if (T && T.isMun && !T.dead && m.flown > 150) {
      // перехват летящего оружия: ближайшее сближение за шаг (баллистика за кадр проходит десятки метров)
      const px = T.pos.x - m.pos.x, py = T.pos.y - m.pos.y, pz = T.pos.z - m.pos.z;
      if (px * px + py * py + pz * pz < 2500 * 2500) {
        const vx = T.vel.x - m.dir.x * m.speed, vy = T.vel.y - m.dir.y * m.speed, vz = T.vel.z - m.dir.z * m.speed, vv = vx * vx + vy * vy + vz * vz || 1e-6;
        const qx = px - vx * dt, qy = py - vy * dt, qz = pz - vz * dt, ts = clamp(-(qx * vx + qy * vy + qz * vz) / vv, 0, dt);
        const dmin = Math.hypot(qx + vx * ts, qy + vy * ts, qz + vz * ts);
        if (dmin < (T.W.kind === 'tbm' ? Math.max(220, M_.blast * 2) : M_.blast * 0.85 + 2)) { // по баллистике на встречных 3+ км/с — шире: за шаг она пролетает сотни метров, промах наведения прощаем (успех решает S.abm)
          // баллистическую цель — с вероятностью комплекса (S.abm), манёвр на конечном участке её снижает
          const pk = T.W.kind === 'tbm' ? Math.min(0.9, (S.abm || 0) * 1.5) * (T.W.man && T.phase === 'term' ? 0.8 : 1) : 1; // ×1,5 — игровая поблажка (2026-10-16: ×1,2; 2026-10-12 — ещё выше по просьбе Mark)
          m.dead = true; fx.explosion(m.pos, M_.blast * 0.6, 'air');
          if (rnd() < pk) { intercept(T); fx.samEnd(m, true); } else fx.samEnd(m, false);
          return;
        }
      }
    }
    if (m.flown > 150) for (const a of ctx.aircraft()) {
      if (a.dead || a.immune) continue; // носитель «Мульти-волны» — вне досягаемости (ракета по только что пущенной крылатой его не задевает)
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
      if (a.dead || a.immune) continue;
      const d = Math.max(0, a.pos.distanceTo(m.pos) - a.r * 0.5);
      if (d < m.M.blast) { ctx.hurt(a, m.M.dmg * Math.pow(1 - d / m.M.blast, 0.6), m.S.short, m.pos); hit = true; }
    }
    fx.samEnd(m, hit);
    fx.explosion(m.pos, m.M.blast, 'air');
  }

  // ═════════════ Ловушки и диполи самолёта ═════════════
  // Точки отстрела и залп — у каждой машины свои (sim/cm.js): ЛТЦ сходят из этих точек по ориентации самолёта, скорость — 0,6 от
  // скорости машины + 25 м/с вдоль выброса + разброс; машина без ЛТЦ (flare: false) на кнопку выбрасывает одни диполи.
  // Уводит ГСН первая ЛТЦ залпа; больше залп — выше шанс (×1 + 0,1·(залп − 2), не больше ×1,4)
  const CMP = [0, 0, 0], CMD = [0, 0, 0], MAXF = 64; // MAXF — ЛТЦ одновременно (залпы бомбардировщиков не копятся)
  function dropCM(a, type) {
    const M = ctx.mode(), cm = cmOf(cmKey(a), a.cmSide || a.mside || a.side);
    if (type === 'flare') {
      if (!cm.flare) return;
      const made = [];
      for (let i = 0; i < cm.salvo; i++) {
        cmWorld(a, cm, i, CMP, CMD);
        const rd = Math.floor(i / cm.at.length), ek = 25 * (1 + 0.45 * rd), sc = 8 + 4 * rd; // залп больше числа точек — следующие «выстрелы» из тех же точек летят быстрее и шире (веером)
        const g = { pos: new THREE.Vector3(CMP[0] + (rnd() - 0.5) * 0.3, CMP[1] + (rnd() - 0.5) * 0.2, CMP[2] + (rnd() - 0.5) * 0.3),
          vel: a.vel.clone().multiplyScalar(0.6).add(TMP.set(CMD[0] * ek + (rnd() - 0.5) * sc, CMD[1] * ek + (rnd() - 0.5) * sc, CMD[2] * ek + (rnd() - 0.5) * sc)), life: 3.5, max: 3.5, owner: a };
        flares.push(g); made.push(g);
      }
      while (flares.length > MAXF) flares.shift().life = 0; // выброшенная из пула ЛТЦ — «выгорела»: уведённая на неё ракета теряет цель, а не летит в застывшую точку
      fx.cmDrop(a, type, made);
      const f = made[0], boost = cmBoost(cm.salvo);
      for (const m of sams) {
        if (m.dead || m.decoy || m.lost || m.S.type !== 'ir' || m.target !== a) continue;
        if (m.pos.distanceTo(a.pos) > 7000 || angleBetween(m.dir, TMP.copy(a.pos).sub(m.pos)) > 25 * D2R) continue;
        // ранние ГСН уводятся почти всегда; ракурс «в лоб» ловушке помогает меньше
        const head = offTailDeg(a, m.pos) > 90 ? 0.6 : 1;
        if (rnd() < (1 - (m.S.irccm || 0)) * 0.75 * head * M.cmK * boost) { m.decoy = f; fx.decoyed(m, f); }
      }
    } else {
      // диполи: РЛС сопровождения может «перескочить» на облако. Когерентная (доплеровская) РЛС неподвижное облако
      // отсекает — сработает, только если цель идёт «траверзом»; частый сброс подряд почти ничего не добавляет
      fx.cmDrop(a, type, null);
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
    let W = AG[key];
    if (W.planeDmg && !a.heli) W = { ...W, dmg: W.planeDmg, blast: W.planeBlast || W.blast }; // НАР с самолёта — свой урон (усиление — только вертолётам)
    const w = { id: mid++, key, W, owner: a, pos: a.pos.clone().addScaledVector(TMP.set(0, -1, 0), 2.5), vel: a.vel.clone(), dir: a.vel.clone().normalize(),
      speed: a.speed, t: 0, flown: 0, dead: false, aim: opts.aim ? opts.aim.clone() : null, target: opts.target || null, mem: null, lost: false, homing: false, trailT: 0 };
    if (W.kind === 'arm' && w.target) w.mem = w.target.pos.clone();
    if (W.kind === 'agm' && W.seeker === 'laser' && w.aim) { w.mem = w.aim.clone(); w.memT = 0; } // лазерная с точкой захвата: подсвет включается уже после пуска — до него летит туда
    // с вертолёта (скорость бывает и нулевой, нос — не по скорости) ракеты и НАР сходят по оси корпуса; бомбы — со скоростью
    if (a.heli && W.kind !== 'bomb') { if (opts.dir) w.dir.copy(opts.dir); else w.dir.set(-Math.sin(a.yaw) * Math.cos(a.pitch), Math.sin(a.pitch), -Math.cos(a.yaw) * Math.cos(a.pitch)); w.speed = Math.max(0, a.vel.dot(w.dir)); } // opts.dir — НАР «Аркады» по прицельному расчёту (air.js nar), ПТУР — на линию прицела
    // разброс залпа; «Аркада» с прицельной помощью (opts.dir) — вдвое кучнее, по вертикали ещё вдесятеро: с висения ракеты идут к земле под
    // 2–3°, и 1 м по высоте — 20–30 м по дальности (Mark 2026-10-22: «вертолёты слишком сложные», «НАР промахиваются»; было ×0,25 — залп
    // ложился в 20–60 м от машины ПВО)
    if (W.kind === 'rocket') { const dk = opts.dir ? 0.5 : 1; w.dir.x += (rnd() - 0.5) * 2 * W.disp * dk; w.dir.y += (rnd() - 0.5) * 2 * W.disp * dk * (opts.dir ? 0.1 : 1); w.dir.z += (rnd() - 0.5) * 2 * W.disp * dk; w.dir.normalize(); w.pos.addScaledVector(w.dir, 3); w.speed = Math.max(30, w.speed); } // сход с 30 м/с — как в predictRocket (иначе нижний предел 30 м/с на первом шаге давал разную дальность при 30 и 60 к/с)
    // летящее оружие — цель для «Тора», «Панциря», C-RAM: размер, ЭПР, тепло, «прочность»
    Object.assign(w, { isMun: true, r: 1.2, rcs: W.rcs ?? 0.12, ir: W.kind === 'cruise' ? 0.35 : 0.15, mhp: W.kind === 'cruise' ? 18 : 10, yaw: 0, pitch: 0, ab: false });
    if (W.kind === 'decoy') { if (ctx.spawnDecoy) ctx.spawnDecoy(a, key, w.aim); return null; } // ложная цель — как самолёт (у хозяина боя)
    if (W.kind === 'cruise') { w.speed = Math.max(a.speed, 180); w.dir.copy(a.vel).setY(Math.min(0, a.vel.y)).normalize(); }
    wpns.push(w);
    fx.wpnRelease(w);
    return w;
  }
  // ═════════════ «Мульти-волна»: оружие без самолёта (пуск из-за края района) ═════════════
  // key — из AG; from — точка пуска; aim — точка цели (у tbm к ней прибавляется круговое отклонение); o: { decoy, target, route }
  let evOn = false;
  function spawnMun(key, from, aim, o = {}) {
    const W = AG[key]; evOn = true;
    const w = { id: mid++, key, W, owner: o.owner || null, pos: from.clone(), vel: new THREE.Vector3(), dir: new THREE.Vector3(0, 1, 0), speed: 0, t: 0, flown: 0, dead: false,
      aim: aim ? aim.clone() : null, target: o.target || null, mem: null, lost: false, homing: true, trailT: 0, ev: true, decoy: !!(o.decoy || W.decoyMun), route: o.route || null,
      isMun: true, r: W.kind === 'tbm' ? 1 : 1.2, rcs: W.rcs ?? 0.12, ir: W.kind === 'tbm' ? 0.6 : W.uav ? 0.9 : 0.35, /* дрон: ПЗРК и ИК-ГСН берут уверенно */ mhp: W.mhp ?? (W.kind === 'cruise' ? 18 : 10), yaw: 0, pitch: 0, ab: false,
      alt: o.alt ?? null, launcher: o.launcher || null, podDir: o.podDir || null }; // podDir — пуск из пакета: первые секунды по его оси // alt — высота полёта по плану удара (иначе своя у ракеты); launcher — пусковая
    if (W.kind === 'tbm') {
      // точка падения: КВО — по нормальному закону (у разведанных комплексов и с действующим разведчиком — как в таблице, иначе ×3)
      const cep = (W.cep || 0) * (o.blind ? 3 : 1), a2 = rnd() * 6.283, r2 = cep * Math.sqrt(-1.4427 * Math.log(Math.max(1e-6, rnd())));
      w.aim.x += Math.cos(a2) * r2; w.aim.z += Math.sin(a2) * r2; w.aim.y = city.topAt(w.aim.x, w.aim.z);
      w.p0 = from.clone(); w.T = W.T * (0.92 + rnd() * 0.16); w.phase = 'boost';
      if (o.decoy) { w.T = o.T; w.p0 = o.p0.clone(); w.s0 = o.s0; w.t = o.t0; } // ложная цель — отделилась на спуске от ракеты
      // воздушный пуск («Кинжал»): ~1,2 с ракета свободно сходит с пилона вниз (скорость и курс носителя + толчок вниз 3 м/с),
      // двигатель — потом; дуга начинается с точки зажигания, первые 5 с плавно переходит с прямой по скорости на свою траекторию
      if (o.air) { w.phase = 'drop'; w.dropT = 1.2; w.vel.copy(o.vel || TMP2.set(0, 0, 0)).addScaledVector(o.up || TMP.set(0, 1, 0), -3); w.dir.copy(o.dir || w.vel).normalize(); w.speed = w.vel.length(); }
    } else {
      // o.dir — пуск с самолёта: ракета сначала идёт по курсу носителя и разворачивается к цели сама
      w.speed = W.speed; if (o.dir) TMP.copy(o.dir).setY(0).normalize(); else TMP.copy(w.aim || TMP2.set(0, 0, 0)).sub(from).setY(0).normalize(); w.dir.copy(TMP); w.vel.copy(w.dir).multiplyScalar(w.speed);
    }
    wpns.push(w); fx.wpnRelease(w);
    return w;
  }
  // баллистика по сжатой дуге: горизонталь — от точки пуска к цели, высота — парабола с апогеем W.H; s = (t/T)^1,1 — разгон на старте,
  // на спуске скорость растёт (у «Искандера» ≈ 2 км/с). Отделение ложных целей и манёвр — на спуске
  const BP = new THREE.Vector3(), BQ = new THREE.Vector3();
  function tbmPos(w, s, out) {
    const H = w.W.H, p0 = w.p0, a = w.aim;
    out.set(p0.x + (a.x - p0.x) * s, p0.y + (a.y - p0.y) * s + 4 * H * s * (1 - s), p0.z + (a.z - p0.z) * s);
    if (w.W.man && s > 0.86) { const k = (s - 0.86) / 0.14, sw = Math.sin(k * 9 + w.id) * 160 * (1 - k); out.x += sw * 0.7; out.z += sw * 0.7; } // манёвр, к цели сходится
    return out;
  }
  function updateTbm(w, dt) {
    if (w.phase === 'drop') { // сход с носителя: без двигателя, нос — по носителю, понемногу клонится по скорости
      w.dropT -= dt; w.vel.y -= G0 * dt; w.pos.addScaledVector(w.vel, dt); w.speed = w.vel.length(); w.flown += w.speed * dt;
      w.dir.lerp(TMP.copy(w.vel).normalize(), Math.min(1, dt * 0.8)).normalize();
      if (w.dropT <= 0) { w.phase = 'boost'; w.p0 = w.pos.clone(); w.v0 = w.vel.clone(); w.t = 0; fx.wpnIgnite && fx.wpnIgnite(w); }
      return;
    }
    // разгон на старте: первые tb с скорость растёт от нуля (ракета медленно сходит с пусковой) — «своё» время tw идёт
    // как t²/(2·tb), дальше — ровно; к T ракета всё так же у цели. tb: «Скад» (жидкостный) — 16 с, «Искандер» — 14, «Точка» и ATACMS — 10 (≈ 10–15 g)
    w.t += dt; const W = w.W, tb = W.boostT || 8, tw = w.t < tb ? Math.max(0, w.t) * Math.max(0, w.t) / (2 * tb) : w.t - tb / 2;
    const s = Math.min(1, Math.pow(Math.max(0, tw) / Math.max(1, w.T - tb / 2), 1.1));
    tbmPos(w, s, BP); tbmPos(w, Math.min(1, s + 0.002), BQ);
    if (w.podDir && w.t < 4) { // из пакета: сначала по оси пакета, за 4 с плавно переходит на свою дугу
      const k = Math.min(1, w.t / 4), sm = k * k * (3 - 2 * k);
      for (const B of [BP, BQ]) { const a = B.distanceTo(w.p0); B.lerp(TMP2.copy(w.p0).addScaledVector(w.podDir, a), 1 - sm); }
    }
    if (w.v0 && w.t < 5) { // воздушный пуск: от прямой по скорости схода — к своей дуге
      const k = Math.min(1, w.t / 5), sm = k * k * (3 - 2 * k);
      const ia = (t2) => t2 + 40 * t2 * t2 / Math.max(1, w.v0.length()); // прямая с разгоном ≈ 8 g (не тормозит, пока не вышла на дугу)
      BP.lerp(TMP2.copy(w.p0).addScaledVector(w.v0, ia(w.t)), 1 - sm); BQ.lerp(TMP2.copy(w.p0).addScaledVector(w.v0, ia(w.t + 0.05)), 1 - sm);
    }
    w.vel.copy(BP).sub(w.pos).divideScalar(Math.max(dt, 1e-3)); w.speed = w.vel.length();
    if (BQ.distanceToSquared(BP) > 1e-6) w.dir.copy(BQ).sub(BP).normalize();
    w.pos.copy(BP); w.flown += w.speed * dt;
    w.phase = s < 0.25 ? 'boost' : s < 0.86 ? 'mid' : 'term';
    w.trailT -= dt; if (s < 0.22 && w.trailT <= 0) { w.trailT = 0.04; fx.wpnTrail(w); }
    // ложные цели «Искандера»: на спуске отделяются и летят рядом (для РЛС — неотличимы)
    if (W.dec && !w.decoy && !w.decSpawned && s > 0.74) {
      w.decSpawned = true;
      for (let i = 0; i < W.dec; i++) { const d = spawnMun(w.key, w.pos, w.aim.clone().add(TMP2.set((rnd() - 0.5) * 900, 0, (rnd() - 0.5) * 900)), { decoy: true, T: w.T, p0: w.p0, t0: w.t, owner: w.owner }); d.aim.y = city.topAt(d.aim.x, d.aim.z); }
    }
    if (s >= 1 || w.pos.y <= Math.max(city.topAt(w.pos.x, w.pos.z), -4)) { toSurface(w, TMP2.copy(w.pos).addScaledVector(w.vel, -dt)); if (w.decoy) { w.dead = true; fx.wpnEnd(w, { objects: [], units: [], intercepted: false }); fx.explosion(w.pos, 4, 'ground'); } else wpnDetonate(w); }
  }
  // разведчик: облёт по маршруту над городом; кого видит (прямая видимость, до 7 км) — те комплексы «разведаны»
  function updateRecon(w, dt) {
    const W = w.W; w.t += dt;
    if (!w.route || !w.route.length) { w.dead = true; fx.wpnEnd(w, { objects: [], units: [], intercepted: false }); return; }
    const wp = w.route[0]; TMP.set(wp.x - w.pos.x, 0, wp.z - w.pos.z); if (TMP.length() < 400) { w.route.push(w.route.shift()); }
    TMP.normalize(); TMP.y = clamp((W.alt - w.pos.y) / 400, -0.2, 0.2); TMP.normalize(); turnToward(w.dir, TMP, 0.35 * dt);
    climbSpeed(w, W, dt); w.pos.addScaledVector(w.dir, w.speed * dt); w.vel.copy(w.dir).multiplyScalar(w.speed);
    w.scanT = (w.scanT || 0) - dt;
    if (w.scanT <= 0) { w.scanT = 1; for (const u of units) if (!u.dead && !u.spotted && u.pos.distanceTo(w.pos) < 7000 && city.los(w.pos.x, w.pos.y, w.pos.z, u.pos.x, u.pos.y + 2, u.pos.z, 4)) { u.spotted = true; fx.unitSpotted && fx.unitSpotted(u, w); } }
    if (w.t > W.life) { w.dead = true; fx.wpnEnd(w, { objects: [], units: [], intercepted: false }); }
  }
  function updateWpn(w, dt) {
    const W = w.W;
    if (W.kind === 'tbm') { updateTbm(w, dt); w.yaw = Math.atan2(-w.dir.x, -w.dir.z); w.pitch = Math.asin(clamp(w.dir.y, -1, 1)); return; }
    if (W.recon) { updateRecon(w, dt); w.yaw = Math.atan2(-w.dir.x, -w.dir.z); w.pitch = Math.asin(clamp(w.dir.y, -1, 1)); return; }
    w.t += dt;
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
      PREV.copy(w.pos); w.pos.addScaledVector(w.vel, dt); w.speed = w.vel.length();
    } else {
      // ракета: ТВ («выстрелил и забыл» по захваченной точке), лазерная (по пятну), ПРР (по излучению или по памяти)
      let aim = null;
      if (w.t > 0.5 && !w.lost) {
        if (W.kind === 'agm' && W.seeker === 'tv') {
          if (w.aim && angleBetween(w.dir, TMP.copy(w.aim).sub(w.pos)) < W.fov * 2 * D2R) aim = w.aim; else w.lost = true;
        } else if (W.kind === 'agm' && W.seeker === 'laser') {
          const spot = ctx.laserSpot(w.owner);
          // ПТУР вертолёта ведёт прицел носителя («Штурм» и «Атака» — по радиокомандам, Hellfire — по подсвету того же прицела): своя прямая
          // видимость не нужна — пятно есть, пока его видит прицел (ракета сходит на 1 м ниже прицела и за бугром его не видела — летела
          // неуправляемой, 2026-10-22). У самолётных лазерных — своя ГСН: пятно должно быть видно ей
          if (spot && angleBetween(w.dir, TMP.copy(spot).sub(w.pos)) < W.fov * D2R && (W.heli || city.los(w.pos.x, w.pos.y, w.pos.z, spot.x, spot.y, spot.z, 4))) { aim = spot; (w.mem = w.mem || new THREE.Vector3()).copy(spot); w.memT = 0; }
          // пятно на миг пропало (у земли его закрыл бугор, подсвет мигнул) — до 1,5 с в последнюю точку (2026-10-22: ПТУР вертолёта на
          // подлёте теряли пятно в 40 м от ЗРК, пролетали мимо и рвались в 100 м за ним)
          else if (w.mem && (w.memT = (w.memT || 0) + dt) < 1.5) aim = w.mem;
        } else if (W.kind === 'arm' && w.target) {
          const u = w.target, emitting = !u.dead && u.emit;
          if (emitting && angleBetween(w.dir, TMP.copy(u.ant).sub(w.pos)) < W.fov * D2R) { w.mem = w.mem || new THREE.Vector3(); w.mem.copy(u.ant); aim = u.ant; }
          else if (W.mmw && w.mem && !u.dead && w.pos.distanceTo(w.mem) < 3500 && u.pos.distanceTo(w.mem) < 60) aim = u.ant; // AARGM: миллиметровая ГСН находит молчащую машину
          else if (W.mem && w.mem) aim = w.mem;   // HARM, Х-58: летит в запомненную точку
          else w.lost = true;                     // Shrike, Х-28: потеряла цель
        }
      }
      w.homing = !!aim;
      PREV.copy(w.pos);
      // ПТУР вертолёта — горкой над линией прицела (до 25 м, к цели сходит на нет): прямо на пятно у земли ракета шла на 2–5 м над
      // рельефом, задевала бугры и теряла пятно
      if (aim && W.heli && W.kind === 'agm') { LOFT.copy(aim); LOFT.y += Math.min(25, 0.012 * w.pos.distanceTo(aim)); flyMissile(w, W, dt, LOFT, null, 0); }
      else flyMissile(w, W, dt, aim, null, 0);
      w.vel.copy(w.dir).multiplyScalar(w.speed);
      w.trailT -= dt; if (w.t < W.burn && w.trailT <= 0) { w.trailT = 0.04; fx.wpnTrail(w); }
      if (W.kind === 'arm' && aim && w.pos.distanceTo(aim) < 14) { wpnDetonate(w); return; }
      // у точки подсвета — подрыв (пологий пуск с вертолёта: а не мимо над крышей). Ближайшее сближение — на всём отрезке за шаг: на 350 м/с
      // ракета за кадр пролетает ~12 м и проскакивала окно «ближе 5 м» — рвалась в 30–40 м за целью (2026-10-22)
      if (W.kind === 'agm' && aim) {
        const R = Math.max(5, W.blast * 0.35); TMP.copy(w.pos).sub(PREV); const L2 = TMP.lengthSq();
        const k = L2 > 1e-6 ? clamp(TMP2.copy(aim).sub(PREV).dot(TMP) / L2, 0, 1) : 1; TMP2.copy(PREV).addScaledVector(TMP, k);
        if (TMP2.distanceTo(aim) < R) { w.pos.copy(TMP2); wpnDetonate(w); return; }
      }
    }
    if (w.pos.y <= Math.max(city.topAt(w.pos.x, w.pos.z), -4) || w.t > (W.life || 150)) { toSurface(w, PREV); wpnDetonate(w); }
  }
  // крылатая ракета: маршевый двигатель держит скорость, полёт на малой высоте с облётом крыш (смотрит вперёд),
  // за 1,8 км до цели — пикирование в точку (на конце — оптическая/тепловизионная ГСН). w.route — точки маршрута
  // (план удара): сначала через них, потом на цель; w.alt — высота по плану
  // скорость на подъёме и спуске: тяга тянет к маршевой W.speed, на подъёме часть её уходит в высоту, в пикировании разгоняет тяжесть
  // (Mark 2026-10-26: «набирают высоту или пикируют, а скорость фиксированная»). Установившаяся разница — G0·sinθ / kV: дрону
  // (винт, запаса тяги мало) kV 0,5 — на подъёме под 30° 50 м/с → 40; крылатой kV 0,25 — в пикировании под 30° 250 → 270 м/с.
  // К ней — с прежним темпом 0,5 (как в etaOf); пределы — у цели, а не у скорости (без скачков после схода с носителя, ревью 2026-10-27);
  // планирующие (W.glide, без двигателя) — как было, скорость своя
  function climbSpeed(w, W, dt) {
    if (W.glide) { w.speed += (W.speed - w.speed) * Math.min(1, dt * 0.5); return; }
    const kV = W.uav ? 0.5 : 0.25, want = clamp(W.speed - G0 * clamp(w.dir.y, -1, 1) / kV, W.speed * 0.55, W.speed * 1.7);
    w.speed += (want - w.speed) * Math.min(1, dt * 0.5);
  }
  function updateCruise(w, dt) {
    const W = w.W, alt = w.alt ?? W.alt; climbSpeed(w, W, dt);
    if (w.route && w.route.length && Math.hypot(w.route[0].x - w.pos.x, w.route[0].z - w.pos.z) < 700) w.route.shift();
    const wp = w.route && w.route.length ? w.route[0] : null, aim = wp || w.aim;
    TMP.copy(aim || w.pos.clone().addScaledVector(w.dir, 1000)).sub(w.pos); const dh = Math.hypot(TMP.x, TMP.z);
    // у цели: пикирование, когда прямая до неё свободна от домов; иначе — горка над крышами по пути к цели (без неё врезалась в высотки)
    let dive = false;
    if (dh < 2500 && !wp && aim) {
      if ((w.losT = (w.losT || 0) - dt) <= 0) {
        w.losT = 0.2; w.clear = dh < 150 || city.los(w.pos.x, w.pos.y - 20, w.pos.z, aim.x, aim.y + 2, aim.z, 25); // с запасом: на довороте траектория чуть ниже прямой
        w.popY = 0; for (let k = 1; k <= 90; k++) { const f = Math.min(1, (k * 30) / dh); w.popY = Math.max(w.popY, city.topAt(w.pos.x + TMP.x * f, w.pos.z + TMP.z * f)); if (f >= 1) break; } // шаг 30 м — узкие высотки не проскакивают
      }
      dive = w.clear;
    }
    if (dive) TMP.normalize();
    else if (dh < 2500 && !wp && aim) { TMP.y = 0; TMP.normalize(); TMP.y = clamp((w.popY + 40 - w.pos.y) / 150, -0.15, 0.6); TMP.normalize(); }
    else if (W.glide && w.aim) {
      // планирующая бомба: с высоты сброса — по прямой вниз к цели (над крышами не ниже 60 м), скорость — своя
      TMP.y = 0; TMP.normalize();
      const dA = Math.hypot(w.aim.x - w.pos.x, w.aim.z - w.pos.z);
      if (w.gy0 === undefined) { w.gy0 = w.pos.y; w.gd0 = Math.max(1, dA); }
      const want = Math.max(city.topAt(w.pos.x + TMP.x * 300, w.pos.z + TMP.z * 300) + 60, w.aim.y + (w.gy0 - w.aim.y) * clamp(dA / w.gd0, 0, 1));
      TMP.y = clamp((want - w.pos.y) / 300, -0.6, 0.15); TMP.normalize();
    } else {
      TMP.y = 0; TMP.normalize();
      // огибание рельефа и крыш: впереди по курсу на цель и по текущему курсу (на развороте дуга уходит в сторону)
      let top = city.topAt(w.pos.x, w.pos.z), hx = Math.hypot(w.dir.x, w.dir.z) || 1;
      for (const L of [150, 400, 800]) top = Math.max(top, city.topAt(w.pos.x + TMP.x * L, w.pos.z + TMP.z * L));
      for (const L of [40, 110, 220, 380]) top = Math.max(top, city.topAt(w.pos.x + w.dir.x / hx * L, w.pos.z + w.dir.z / hx * L));
      const hills = city.kind === 'winter'; // в горах — смотреть дальше и набирать высоту круче (крутые склоны; в городе — как было)
      if (hills) for (const L of [1300, 2000]) top = Math.max(top, city.topAt(w.pos.x + TMP.x * L, w.pos.z + TMP.z * L) - L * 0.12);
      TMP.y = clamp((top + alt - w.pos.y) / 200, -0.25, hills ? 0.8 : 0.55); TMP.normalize();
    }
    turnToward(w.dir, TMP, 0.7 * dt);
    PREV.copy(w.pos); w.pos.addScaledVector(w.dir, w.speed * dt); w.vel.copy(w.dir).multiplyScalar(w.speed); w.homing = true;
    if (!W.uav && !W.glide) { w.trailT -= dt; if (w.trailT <= 0) { w.trailT = 0.08; fx.wpnTrail(w); } } // у дронов (поршневой мотор) и планирующих бомб следа нет
    if (w.pos.y <= Math.max(city.topAt(w.pos.x, w.pos.z), -4) || w.t > W.life) { toSurface(w, PREV); wpnDetonate(w); }
  }
  // истинное время до цели: прогон той же кинематики (разгон, разворот 0,7 рад/с, маршрутные точки — снимаются за 700 м, пикирование
  // с 1,8 км) вперёд с шагом 0,25 с; пересчёт раз в 2 с, между ними — убывает ровно. Баллистика — по своему расписанию (T)
  function etaOf(w) {
    if (w.W.kind === 'tbm') return { t: Math.max(0, w.T - w.t), d: w.aim ? Math.hypot(w.aim.x - w.pos.x, w.aim.z - w.pos.z) : 0 };
    const C = w.etaC;
    if (C && w.t - C.t0 < 2 && C.route === (w.route ? w.route.length : 0)) { const k = w.t - C.t0; return { t: Math.max(0, C.v - k), d: Math.max(0, C.d * (1 - k / Math.max(1e-3, C.v))) }; }
    const W = w.W, route = w.route || [], h = 0.25;
    let px = w.pos.x, pz = w.pos.z, a = Math.atan2(w.dir.z, w.dir.x), sp = w.speed, ri = 0, T = 0, L = 0;
    while (T < 900) {
      while (ri < route.length && Math.hypot(route[ri].x - px, route[ri].z - pz) < 700) ri++;
      const tg = ri < route.length ? route[ri] : w.aim; if (!tg) break;
      const ex = tg.x - px, ez = tg.z - pz, dist = Math.hypot(ex, ez);
      if (ri >= route.length && dist < 1800) { const dl = Math.hypot(dist, w.pos.y - tg.y); T += dl / Math.max(30, sp); L += dist; break; }
      a += clamp(wrapPi(Math.atan2(ez, ex) - a), -0.7 * h, 0.7 * h);
      sp += (W.speed - sp) * Math.min(1, h * 0.5);
      px += Math.cos(a) * sp * h; pz += Math.sin(a) * sp * h; T += h; L += sp * h;
    }
    w.etaC = { t0: w.t, v: T, d: L, route: route.length };
    return { t: T, d: L };
  }
  // подрыв о землю — на поверхности (Mark 2026-10-25: «на зимней карте бьют как бы под землю»): за шаг быстрый боеприпас уходил ниже
  // рельефа или крыши на скорость × шаг (баллистика — 20–50 м, бомбы и крылатые — 5–10 м), и взрыв с уроном считались там: урон по технике
  // зависел от частоты кадров (у сервера шаг крупнее). Теперь — назад по отрезку шага до поверхности (8 делений пополам)
  function toSurface(w, from) {
    const top = (p) => Math.max(city.topAt(p.x, p.z), -4);
    if (w.pos.y > top(w.pos) || from.y <= top(from)) return; // не под землёй или шаг начался уже ниже — как есть
    SF_A.copy(from); SF_B.copy(w.pos);
    for (let k = 0; k < 8; k++) { SF_M.copy(SF_A).add(SF_B).multiplyScalar(0.5); if (SF_M.y > top(SF_M)) SF_A.copy(SF_M); else SF_B.copy(SF_M); }
    w.pos.copy(SF_B);
  }
  function wpnDetonate(w) {
    if (w.dead) return;
    w.dead = true;
    if (w.decoy || !w.W.dmg) { fx.wpnEnd(w, { objects: [], units: [], intercepted: false }); fx.explosion(w.pos, 4, 'ground'); return; } // ложная цель — без боевой части
    const res = blast(w.pos, w.W.dmg, w.W.blast, w.W.short, w.owner, w.W.ap || 1);
    fx.wpnEnd(w, res);
    fx.explosion(w.pos, w.W.blast, w.W.kind === 'tbm' ? 'tbm' : w.W.vis && w.W.vis.kind !== 'missile' ? 'bomb' : 'ground'); // бомба — крупнее, со вспышкой и пылью; баллистика — ещё крупнее (удар сверху на 2–6 М)
  }
  // урон взрывом по объектам и комплексам; возвращает, кого задело
  // ap — бронебойность по технике (ПТУР: кумулятивная часть — прямое попадание выводит из строя любой комплекс; по зданиям — как есть)
  function blast(p, dmg, R, by, owner = null, ap = 1) { // owner — самолёт, чьё оружие (онлайн: кому засчитать)
    const res = { objects: [], units: [] };
    for (const o of objects) {
      if (o.dead) continue;
      // части — постройки; zones — площади только для урона (ВПП аэродрома, площадка объекта — city.js objTargets), со своим весом q.k;
      // площадка (q.yard) — до q.pad м от построек на земле, земля — в точке разрыва (на склоне и в овраге она на десятки метров выше или
      // ниже, чем у построек); разрыв в воде — река, болото — площадкой не считается
      let best = 0;
      for (const L of o.zones ? [o.parts, o.zones] : [o.parts]) for (const q of L) {
        if (q.yard && (city.waterAt || city.wetAt || (() => false))(p.x, p.z)) continue;
        const base = q.y0 !== undefined ? q.y0 : q.yard ? city.groundH(p.x, p.z) : city.groundH(q.x, q.z), top = base + q.h;
        let dh;
        if (q.yard) { let m = 1e9; for (const g of q.parts) m = Math.min(m, partDist(g, p.x, p.z)); dh = Math.max(0, m - q.pad); }
        else if (q.t === 'box') dh = Math.hypot(Math.max(0, Math.abs(p.x - q.x) - q.w / 2), Math.max(0, Math.abs(p.z - q.z) - q.d / 2));
        else dh = Math.max(0, Math.hypot(p.x - q.x, p.z - q.z) - q.r);
        const dv = p.y > top ? p.y - top : p.y < base ? base - p.y : 0, d = Math.hypot(dh, dv);
        if (d < R) best = Math.max(best, (d < 2 ? 1.25 : Math.pow(1 - d / R, 0.6)) * (q.k ?? 1));
      }
      if (best > 0) {
        const amount = dmg * best;
        o.hp -= amount; o.dmgTaken += amount; res.objects.push(o);
        fx.objectHit(o, amount, p);
        if (o.hp <= 0) { o.dead = true; o.hp = 0; fx.objectDestroyed(o, by, owner); }
      }
    }
    for (const u of units) {
      if (u.dead) continue;
      const d = Math.max(0, u.pos.distanceTo(p) - 4);
      if (d < R) {
        const amount = dmg * Math.pow(1 - d / R, 0.6) * 1.2 * ap * (ctx.unitDmgK ? ctx.unitDmgK() : 1); // уроки мульти-волны — комплексы неуязвимы
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
    for (const u of units) { updateUnit(u, dt, targets); if (u.force) forceHold(u); aimLauncher(u, dt); if (u.force) forceStep(u, dt); }
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

  return { units, sams, wpns, flares, objects, net, addUnit, release, spawnMun, dropCM, step, rwr, mws, radarSees, eyesSee, inZone, blast, aglOf, etaOf,
    launch, forceLaunch, designate, setEmit, setTgt, setManual, gunLead, irSees, removeUnit, moveUnit, launcherReady, unitTilt,
    get evOn() { return evOn; } }; // идёт удар (оружие «Мульти-волны») — как видит фильтр целей ложные цели (tgtCat)
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
// НАР из точки p по оси dir (скорость вдоль оси v0): куда упадёт без разброса — та же кинематика, что у flyMissile без
// наведения (разгон burn, сопротивление, нос клонится под тяжестью). Время до падения или −1 (дальше life)
export function predictRocket(city, W, p, dir, v0, out) {
  PP.copy(p).addScaledVector(dir, 3); PD.copy(dir); let sp = Math.max(30, v0);
  const dt = 1 / 30; // как у полёта (flyMissile): тяга — доля шага на выгорании, сход с 30 м/с; круг прицела ≈ точка падения на 30 и 60 к/с
  for (let t = dt; t < (W.life || 12); t += dt) {
    if (PD.y > -0.95) turnToward(PD, PA.copy(PD).setY(PD.y - 0.3).normalize(), G0 / Math.max(120, sp) * dt * 0.6);
    const bk = Math.min(1, Math.max(0, (Math.min(t, W.burn) - (t - dt)) / dt));
    sp = Math.max(30, sp + (W.acc * bk - (W.kd || 1) * 1e-4 * rhoAt(PP.y) * sp * sp - G0 * PD.y) * dt);
    PP.addScaledVector(PD, sp * dt);
    if (PP.y <= Math.max(city.topAt(PP.x, PP.z), -4)) { out.copy(PP); return t; }
  }
  return -1;
}
