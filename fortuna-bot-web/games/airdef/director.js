// Живой фон главного меню: настоящий бой — ИИ-налёт против ИИ-ПВО на этой же карте, без игрока. «Режиссёр» камеры
// выбирает планы по событиям боя:
//   пуск ЗУР — с разных точек (сбоку от пусковой, сзади по направлению на цель, снизу от земли), дальше — полёт за ракетой
//   и встреча с целью у самолёта; пусковая разворачивается на цель; бомба до разрыва; трассы зенитки; пролёт ударников над
//   городом; погоня; вид с улицы; общий вид; рядом с самолётом (ведомый, из-за плеча, подвеска снизу, облёт); зенитная
//   машина крупно; объект-цель и улица города вблизи (готовые модели домов). У ПЗРК — без плана у стрелка: сразу за ракетой.
// Кнопки ◀ ▶ — листать виды планов (выбранный держится дольше и не перебивается событиями).
// Кадр строится только по свободной от карточки меню части экрана (карточка слева — на горизонтальном, снизу — на
// вертикальном), чтобы ракета и пусковая не прятались под ней. Внизу справа — подпись, что сейчас в кадре.
// Раз в несколько минут бой начинается заново (город восстанавливается).
/* global THREE */
import { mulberry32 } from './city.js?v=20261012d';
import { SAM_TYPE, AG, PLANES, raidPlane } from './arsenal.js?v=20261012d';
import { planeModel, classOfRole } from './models.js?v=20261012d';
import { fwdOf } from '../drone/sim/core.js?v=20261012d';
import { placeDefense, pickTargets } from './mission.js?v=20261012d';
import { LNCH, trainable } from './launchers.js?v=20261012d';

export function createDirector(C) {
  const { camera, city } = C;
  const V3 = () => new THREE.Vector3();
  let rnd = Math.random, targets = [], wave = 1, battleT = 0, shot = null, events = [], caption = '', capT = 0, pending = null, era = 2, side = 'east';
  const camPos = V3(), look = V3(), lookS = V3(), TMP = V3(), F = V3(), RT = V3(), OFF = V3(), BX = new THREE.Box3();
  const fade = document.getElementById('fade'), card = document.getElementById('menu').querySelector('.card');
  const sizeOf = new Map(); // полуразмер машины (с пусковыми) — для планов у пусковой
  function unitR(u) {
    if (sizeOf.has(u.id)) return sizeOf.get(u.id);
    const g = C.unitMeshes.get(u.id); const r = g ? Math.max(3, BX.setFromObject(g).getSize(TMP).length() * 0.5) : 10;
    sizeOf.set(u.id, r); return r;
  }
  function newBattle() {
    rnd = mulberry32((Date.now() & 0xfffff) ^ 0x5151);
    side = rnd() < 0.5 ? 'east' : 'west'; era = 1 + Math.floor(rnd() * 4);
    const S = C.newBattle({ defSide: side, era, rnd });
    C.hooks = {
      samLaunch: (m) => events.push({ k: 'sam', m, t: C.t }),
      wpnRelease: (w) => events.push({ k: 'wpn', w, t: C.t }),
      planeDown: (a) => events.push({ k: 'down', a, t: C.t }),
      radarState: (u) => { if (u.track && !u.dead && trainable(LNCH[u.key])) events.push({ k: 'track', u, t: C.t }); },
    };
    targets = pickTargets(S, rnd, 3);
    placeDefense(S, city, rnd, side, era, targets, 0.9);
    C.syncUnits(); sizeOf.clear();
    wave = 1; C.raid.spawnWave(4, 2, targets, 7000 + rnd() * 2000);
    battleT = 0; shot = null; events = [];
  }
  const aliveTargets = () => targets.filter((o) => !o.dead);
  const groundAt = (x, z) => city.groundH(x, z);
  // ── планы ──
  function cut(make) { // монтажная склейка через короткое затемнение
    if (pending) return;
    pending = make; fade.style.opacity = '1';
    setTimeout(() => { const s = pending && pending(); pending = null; if (s) { shot = s; shot.t = 0; } fade.style.opacity = '0'; }, 260);
  }
  function panShot() {
    const o = aliveTargets()[0] || C.S.objects[0], a0 = rnd() * 6.28, R = 1400 + rnd() * 1200, h = 250 + rnd() * 500;
    return { kind: 'pan', dur: 10, cap: `${o.name} · ${side === 'east' ? 'советская/российская' : 'западная'} ПВО, эпоха ${['I', 'II', 'III', 'IV'][era - 1]}`,
      cam(dt, t) { const a = a0 + t * 0.05; camPos.set(o.x + Math.sin(a) * R, groundAt(o.x, o.z) + h, o.z + Math.cos(a) * R); look.set(o.x, groundAt(o.x, o.z) + 40, o.z); return true; } };
  }
  function planeShot(chase) {
    const ps = C.raid.alive(); if (!ps.length) return panShot();
    const a = ps[Math.floor(rnd() * ps.length)];
    if (chase) return { kind: 'chase', dur: 8, cap: `Ударная группа · ${roleName(a)}`, cam() { if (a.dead || a.out) return false; fwdOf(a, F); camPos.copy(a.pos).addScaledVector(F, -70).y += 14; look.copy(a.pos).addScaledVector(F, 120); shot.follow = a; return true; } };
    // пролёт: камера впереди по курсу, над крышами, самолёт проходит мимо
    fwdOf(a, F); const p = a.pos.clone().addScaledVector(F, 900).add(TMP.set(-F.z, 0, F.x).multiplyScalar(90 * (rnd() < 0.5 ? 1 : -1)));
    p.y = Math.max(city.topAt(p.x, p.z) + 25, a.pos.y - 40 + rnd() * 30);
    return { kind: 'flyby', dur: 7.5, cap: `Пролёт · ${roleName(a)}`, cam() { if (a.dead) return false; camPos.copy(p); look.copy(a.pos); return true; } };
  }
  // вид с улицы: камера на тротуаре впереди по курсу самолёта, он проходит над крышами
  function streetShot() {
    const ps = C.raid.alive().filter((a) => a.role !== 'decoy'); if (!ps.length) return null;
    const a = ps[Math.floor(rnd() * ps.length)];
    fwdOf(a, F); const ahead = a.pos.clone().addScaledVector(F, 1200 + rnd() * 600);
    let p = null;
    for (let k = 0; k < 24 && !p; k++) { const x = ahead.x + (rnd() - 0.5) * 300, z = ahead.z + (rnd() - 0.5) * 300; if (city.bldAt(x, z) <= 0) p = new THREE.Vector3(x, groundAt(x, z) + 1.8, z); }
    if (!p) return null;
    return { kind: 'street', dur: 8, cap: `Вид с улицы · ${roleName(a)}`, cam() { if (a.dead || a.out) return false; camPos.copy(p); look.copy(a.pos); return true; } };
  }
  // пусковая разворачивается на цель (до пуска): крупно на ¾ спереди
  function trackShot(u) {
    if (u.dead) return null;
    const R = unitR(u), a0 = (u.track ? Math.atan2(u.track.pos.x - u.pos.x, u.track.pos.z - u.pos.z) : u.yaw) + (rnd() < 0.5 ? 0.9 : -0.9);
    const D = R * 2.2 + 5, p = new THREE.Vector3(u.pos.x + Math.sin(a0) * D, u.pos.y + R * 0.45 + 1, u.pos.z + Math.cos(a0) * D);
    p.y = Math.max(p.y, city.topAt(p.x, p.z) + 2);
    return { kind: 'track', dur: 6, cap: `${u.S.name} · цель захвачена — пусковая разворачивается`,
      cam() { if (u.dead) return false; camPos.copy(p); look.copy(u.pos).y += R * 0.25; return true; } };
  }
  // пуск ЗУР: сначала у пусковой (сбоку / сзади / снизу), потом за ракетой, на подлёте — у цели
  function samShot(m) {
    const u = m.unit, R = unitR(u), L = m.M.L, cold = m.ln && (m.ln.mode === 'cold' || m.ln.mode === 'vhot');
    const T = m.target ? m.target.pos : TMP.copy(u.pos).add(F.set(0, 500, -2000));
    const brg = Math.atan2(T.x - u.pos.x, T.z - u.pos.z), sx = Math.sin(brg), sz = Math.cos(brg), sd = rnd() < 0.5 ? 1 : -1;
    const r = rnd(), variant = r < (cold ? 0.5 : 0.4) ? 'side' : r < 0.75 ? 'rear' : 'low';
    const p = V3();
    if (variant === 'side') { const D = R * 3 + L * 2.5 + 12; p.set(u.pos.x + sz * D * sd, u.pos.y + R * 0.3 + 1.5, u.pos.z - sx * D * sd); } // поперёк направления пуска
    else if (variant === 'rear') { const D = R * 2.2 + L + 8; p.set(u.pos.x - sx * D + sz * R * 0.8 * sd, u.pos.y + R * 0.6 + 3, u.pos.z - sz * D - sx * R * 0.8 * sd); } // за пусковой, на цель
    else { const D = R * 1.4 + 6; p.set(u.pos.x + sz * D * sd - sx * D * 0.5, u.pos.y - 0.6, u.pos.z - sx * D * sd - sz * D * 0.5); } // снизу у земли
    p.y = Math.max(p.y, city.topAt(p.x, p.z) + 1.2);
    const how = { cold: ' · «холодный» старт', tube: ' · вышибной заряд', vhot: ' · вертикальный старт', box: ' · из наклонного контейнера' }[m.ln && m.ln.mode] || '';
    const tube = m.ln && m.ln.mode === 'tube'; // ПЗРК: стрелка не показываем — сразу за ракетой
    const hold = tube ? 0 : 2.6 + (m.ign || 0) + (variant === 'side' ? 1.2 : 0);
    let near = null, endT = 0;
    return { kind: 'sam', dur: 18, cap: `Пуск: ${u.S.name} · ${SAM_TYPE[u.S.type]}${how}`,
      cam(dt, t) {
        shot.follow = null;
        if (m.dead) { endT = endT || t; look.copy(m.pos); return t - endT < 2.5; } // подрыв — пара секунд на разрыв
        if (t < hold) { camPos.copy(p); look.copy(u.pos).lerp(m.pos, Math.min(1, Math.max(0, (m.t - 0.2) / 1.8))); look.y += R * 0.2; return true; }
        // подлёт: < 2,5 с до встречи — камера у цели, ракета влетает в кадр
        const tg = m.target && !m.target.dead ? m.target : null;
        if (tg && !near && m.pos.distanceTo(tg.pos) < Math.max(400, m.speed * 2.5)) {
          near = tg.pos.clone().add(TMP.copy(m.dir).cross(F.set(0, 1, 0)).normalize().multiplyScalar(60 + rnd() * 40)); near.y += 15;
          shot.snap = true; caption = `${u.S.short}: встреча с целью`; capT = 0;
        }
        if (near) { if (tg) near.addScaledVector(tg.vel, dt); camPos.copy(near); look.copy(m.pos).lerp(tg ? tg.pos : m.pos, 0.5); return true; }
        camPos.copy(m.pos).addScaledVector(m.dir, -(L * 3 + 16 + (tube ? 25 : 0))).y += L * 0.5 + 3;
        look.copy(tg ? tg.pos : TMP.copy(m.pos).addScaledVector(m.dir, 200)).lerp(F.copy(m.pos).addScaledVector(m.dir, 60), 0.6);
        shot.follow = m; return true;
      } };
  }
  function bombShot(w) {
    let impact = null;
    return { kind: 'bomb', dur: 16, cap: `${AG[w.key].name} · ${{ lgb: 'наводится на пятно лазера', arm: 'летит на излучение РЛС', gps: 'летит по спутниковой навигации', cruise: 'крылатая ракета на малой высоте' }[w.W.kind] || (w.W.tv ? 'ТВ-головка, «выстрелил и забыл»' : 'свободное падение')}`,
      cam(dt, t) {
        shot.follow = null;
        if (!w.dead) { TMP.copy(w.vel).normalize(); camPos.copy(w.pos).addScaledVector(TMP, -30).add(F.set(-TMP.z, 0, TMP.x).multiplyScalar(14)).y += 6; look.copy(w.pos).addScaledVector(TMP, 60); impact = w.pos.clone(); shot.follow = w; return true; }
        if (!impact || t > 30) return false;
        camPos.copy(impact).add(TMP.set(160, 90, 160)); look.copy(impact); return (shot.endT = (shot.endT || t)) > t - 5;
      } };
  }
  function aaaShot() {
    const u = C.S.units.find((q) => q.gunOn && !q.dead && q.track); if (!u) return null;
    return { kind: 'aaa', dur: 6, cap: `${u.S.name} · заградительный огонь`, cam() { if (!u.track || u.dead) return false; TMP.copy(u.track.pos).sub(u.pos).normalize(); camPos.copy(u.pos).addScaledVector(TMP, -18).y += 6; look.copy(u.track.pos); return true; } };
  }
  const planeName = (a) => { const pm = planeModel(a.side, classOfRole(a.role), a.plane || raidPlane(a.side, C.raidEra, a.role)); return pm ? PLANES[pm.name] : a.side === 'east' ? 'Ударник' : 'Strike'; };
  const fighters = () => C.raid.alive().filter((a) => a.role !== 'decoy');
  // рядом с самолётом: v — wing (ведомый сбоку), close (из-за плеча), under (подвеска снизу спереди), orbit (облёт)
  function planeClose(v) {
    const ps = fighters(); if (!ps.length) return null;
    const a = ps[Math.floor(rnd() * ps.length)], sd = rnd() < 0.5 ? 1 : -1, a0 = rnd() * 6.28;
    const name = { wing: 'рядом с ведущим', close: 'из-за плеча', under: 'подвеска', orbit: 'облёт' }[v];
    return { kind: 'p_' + v, dur: 8, near: 4, cap: `${planeName(a)} · ${name} · ${roleName(a)}`,
      cam(dt, t) {
        if (a.dead || a.out) return false;
        fwdOf(a, F); RT.set(-F.z, 0, F.x); if (RT.lengthSq() < 1e-4) RT.set(1, 0, 0); RT.normalize();
        let f = 0, r = 0, u = 0, la = 0;
        if (v === 'wing') { f = -6; r = 26 * sd; u = 3; la = 25; }
        else if (v === 'close') { f = -24; r = 5 * sd; u = 6; la = 80; }
        else if (v === 'under') { f = 15; r = 9 * sd; u = -6; la = -3; }
        else { const g = a0 + t * 0.4; f = Math.cos(g) * 34; r = Math.sin(g) * 34; u = 7; }
        camPos.copy(a.pos).addScaledVector(F, f).addScaledVector(RT, r); camPos.y += u;
        look.copy(a.pos).addScaledVector(F, la); shot.follow = a; return true;
      } };
  }
  // зенитная машина крупно: медленный облёт (ПЗРК не показываем — без модели стрелка)
  function unitShot() {
    const us = C.S.units.filter((u) => !u.dead && !(LNCH[u.key] && LNCH[u.key].mode === 'tube')); if (!us.length) return null;
    const u = us[Math.floor(rnd() * us.length)], R = unitR(u), a0 = rnd() * 6.28, D = R * 2.6 + 6, sd = rnd() < 0.5 ? 1 : -1;
    return { kind: 'unit', dur: 9, near: 1, cap: `${u.S.name} · ${SAM_TYPE[u.S.type]}`,
      cam(dt, t) { if (u.dead) return false; const g = a0 + t * 0.12 * sd; camPos.set(u.pos.x + Math.sin(g) * D, u.pos.y + R * 0.5 + 1.5, u.pos.z + Math.cos(g) * D); look.copy(u.pos).y += R * 0.3; return true; } };
  }
  // объект-цель вблизи: облёт на малой высоте
  function objShot() {
    const os = aliveTargets(); if (!os.length) return null;
    const o = os[Math.floor(rnd() * os.length)], a0 = rnd() * 6.28, D = Math.max(o.w, o.d) * 0.55 + 70, sd = rnd() < 0.5 ? 1 : -1;
    return { kind: 'obj', dur: 9, cap: `${o.name} вблизи`,
      cam(dt, t) { const g = a0 + t * 0.07 * sd, gy = groundAt(o.x, o.z); camPos.set(o.x + Math.sin(g) * D, gy + 38, o.z + Math.cos(g) * D); look.set(o.x, gy + 8, o.z); return true; } };
  }
  // улица города: камера медленно едет вдоль панельного дома на высоте 3–4 этажа
  function cityShot() {
    const B = city.B;
    for (let k = 0; k < 60; k++) {
      const i = Math.floor(rnd() * B.n); if (B.k[i] !== 1 || B.y0[i] > 0) continue;
      const lx = B.w[i] > B.d[i], L = Math.max(B.w[i], B.d[i]), S = Math.min(B.w[i], B.d[i]), sd = rnd() < 0.5 ? 1 : -1, h = B.h[i];
      const ax = lx ? 1 : 0, az = lx ? 0 : 1, off = S / 2 + 24, x0 = B.x[i] + (lx ? 0 : off * sd), z0 = B.z[i] + (lx ? off * sd : 0);
      if (city.bldAt(x0, z0) > 0) continue;
      return { kind: 'city', dur: 9, near: 1, cap: 'Город вблизи',
        cam(dt, t) { const s = -L * 0.6 + t * 7, gy = groundAt(x0, z0); camPos.set(x0 + ax * s, gy + 11, z0 + az * s); look.set(B.x[i] + ax * (s + 40), gy + h * 0.45, B.z[i] + az * (s + 40)); return true; } };
    }
    return null;
  }
  const latest = (arr) => { let m = null; for (const q of arr) if (!q.dead && (!m || q.id > m.id)) m = q; return m; };
  // виды планов по порядку — для кнопок ◀ ▶
  const KINDS = ['pan', 'flyby', 'chase', 'p_wing', 'p_close', 'p_under', 'p_orbit', 'street', 'city', 'unit', 'obj', 'aaa', 'sam', 'bomb'];
  function make(kind) {
    switch (kind) {
      case 'pan': return panShot();
      case 'flyby': return C.raid.alive().length ? planeShot(false) : null;
      case 'chase': return C.raid.alive().length ? planeShot(true) : null;
      case 'p_wing': return planeClose('wing'); case 'p_close': return planeClose('close'); case 'p_under': return planeClose('under'); case 'p_orbit': return planeClose('orbit');
      case 'street': return streetShot(); case 'city': return cityShot(); case 'unit': return unitShot(); case 'obj': return objShot(); case 'aaa': return aaaShot();
      case 'sam': { const m = latest(C.S.sams); return m ? samShot(m) : null; }
      case 'bomb': { const w = latest(C.S.wpns.filter((q) => q.W.kind !== 'decoy')); return w ? bombShot(w) : null; }
    }
    return null;
  }
  function nav(dir) {
    const kind = shot ? (shot.kind === 'track' ? 'unit' : shot.kind) : 'pan', i0 = Math.max(0, KINDS.indexOf(kind));
    for (let k = 1; k <= KINDS.length; k++) {
      const s = make(KINDS[(i0 + dir * k + KINDS.length * 2) % KINDS.length]);
      if (s) { s.manual = true; s.dur *= 1.6; pending = null; cut(() => { caption = s.cap; capT = 0; return s; }); return; }
    }
  }
  const roleName = (a) => ({ bomber: 'бомбардировщик', tv: 'носитель ТВ-ракет', sead: 'охотник за РЛС', low: 'прорыв на малой высоте', cruise: 'носитель крылатых ракет', decoyer: 'носитель ложных целей', decoy: 'ложная цель' })[a.role] || 'ударник';
  function pickShot() {
    const now = C.t; events = events.filter((e) => now - e.t < 1.5);
    // события боя — чаще всего, но не всегда: остальное время — самолёты и город крупно
    const ev = rnd() < 0.65 && (events.find((e) => e.k === 'sam') || events.find((e) => e.k === 'wpn') || (rnd() < 0.5 && events.find((e) => e.k === 'track')));
    if (ev) { events.length = 0; return ev.k === 'sam' ? samShot(ev.m) : ev.k === 'wpn' ? bombShot(ev.w) : trackShot(ev.u); }
    // спокойные планы: больше — у самолётов и вблизи (показать графику)
    const r = rnd();
    const kind = r < 0.07 ? 'aaa' : r < 0.17 ? 'street' : r < 0.25 ? 'city' : r < 0.35 ? 'unit' : r < 0.43 ? 'obj' : r < 0.5 ? 'p_wing' : r < 0.57 ? 'p_close'
      : r < 0.63 ? 'p_under' : r < 0.7 ? 'p_orbit' : r < 0.8 ? 'flyby' : r < 0.92 ? 'chase' : 'pan';
    return make(kind) || (C.raid.alive().length ? planeShot(rnd() < 0.5) : panShot());
  }
  function update(dt) {
    battleT += dt;
    if (battleT > 240) { newBattle(); return; }
    const alive = C.raid.planes.filter((a) => !a.dead && !a.out).length;
    if (alive < 2) { wave++; C.raid.spawnWave(3 + (wave % 3), 2 + (wave % 2), aliveTargets().length ? aliveTargets() : targets, 8000 + rnd() * 3000); }
  }
  // кадр — по свободной от карточки части экрана: камера считает «экраном» только её, остальное видно под карточкой
  function frameFree() {
    const VW = C.VW, VH = C.VH, r = card && card.getBoundingClientRect ? card.getBoundingClientRect() : null;
    if (!(VW > 1 && VH > 1)) { camera.clearViewOffset(); return; } // окно ещё без размера (страница открыта в фоне) — без смещения
    if (VW >= VH) {
      const x0 = r && r.width ? Math.min(VW * 0.62, Math.max(0, (r.right ?? r.left + r.width) + 8)) : VW * 0.4, Wf = VW - x0;
      camera.aspect = Wf / VH; camera.setViewOffset(Wf, VH, -x0, 0, VW, VH);
    } else {
      const y1 = r && r.height ? Math.max(VH * 0.35, r.top - 8) : VH * 0.6;
      camera.aspect = VW / y1; camera.setViewOffset(VW, y1, 0, 0, VW, VH);
    }
  }
  function cameraUpdate(dt) {
    if (C.camera.fov !== 60) C.setFov(60);
    frameFree();
    if (!shot) { shot = panShot(); shot.t = 0; caption = shot.cap; }
    shot.t += dt;
    const ok = shot.cam(dt, shot.t);
    // важное событие перебивает спокойный план; план кончился или потерял объект — новый
    const ev = !shot.manual && !['sam', 'bomb'].includes(shot.kind) && shot.t > 6.5 && events.some((e) => e.k === 'sam' || e.k === 'wpn' || (e.k === 'track' && shot.kind !== 'track'));
    if (!ok || shot.t > shot.dur || ev) { const s = pickShot(); if (s) cut(() => { caption = s.cap; capT = 0; return s; }); }
    camPos.y = Math.max(camPos.y, city.topAt(camPos.x, camPos.z) + 1);
    if (shot.t < 0.05 || shot.snap) { shot.snap = false; shot.fo = null; camera.position.copy(camPos); lookS.copy(look); }
    else if (shot.follow) {
      // за быстрым объектом сглаживаем смещение относительно него — камера не отстаёт
      const o = shot.follow;
      if (shot.fo !== o) { shot.fo = o; OFF.copy(camera.position).sub(o.pos); if (OFF.length() > 400) OFF.setLength(400); }
      OFF.lerp(TMP.copy(camPos).sub(o.pos), 1 - Math.exp(-dt * 3)); camera.position.copy(o.pos).add(OFF);
      lookS.lerp(look, 1 - Math.exp(-dt * 8));
    } else { shot.fo = null; camera.position.lerp(camPos, 1 - Math.exp(-dt * 6)); lookS.lerp(look, 1 - Math.exp(-dt * 8)); }
    camera.up.set(0, 1, 0); camera.lookAt(lookS);
    capT += dt;
  }
  function hud() {
    if (!caption) return;
    const hx = C.hx, VW = C.VW, VH = C.VH, a = Math.min(1, capT * 2);
    hx.font = '600 12px -apple-system, Segoe UI, sans-serif'; hx.textAlign = 'right'; hx.fillStyle = `rgba(255,255,255,${0.8 * a})`;
    hx.shadowColor = 'rgba(0,0,0,.8)'; hx.shadowBlur = 4;
    // на вертикальном экране снизу карточка — подпись над ней
    const r = VW < VH && card && card.getBoundingClientRect ? card.getBoundingClientRect() : null;
    const y = r && r.height ? r.top - 10 : VH - 16;
    hx.fillText(caption, VW - 16, y); hx.shadowBlur = 0;
    if (navEl) navEl.style.bottom = (VH - y + 10) + 'px'; // кнопки — над подписью
  }
  // кнопки ◀ ▶ поверх меню
  const navEl = document.getElementById('promoNav');
  if (navEl) navEl.addEventListener('click', (e) => { const b = e.target.closest('[data-nav]'); if (b) nav(+b.dataset.nav); });
  return {
    sim: true,
    start() { newBattle(); if (navEl) navEl.style.display = 'flex'; },
    near: () => (shot && shot.near) || 0,
    nav,
    stop() { if (navEl) navEl.style.display = 'none'; camera.clearViewOffset(); camera.aspect = C.VW / C.VH; camera.updateProjectionMatrix(); fade.style.opacity = '0'; pending = null; },
    update, camera: cameraUpdate, hud, focus: () => camera.position,
    get shotKind() { return shot ? shot.kind : ''; },
  };
}
