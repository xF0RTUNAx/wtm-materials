// Готовые модели на карте «Симулятора Летки» (подход «Воздушного превосходства»): world.js / props.js / landmarks.js расставляют
// объекты как раньше (тот же генератор, те же коробки столкновений) и отдают места (world.glbSites). Здесь по готовности модели
// каждая группа рисуется экземплярами (один вызов отрисовки на деталь модели), а её процедурная замена прячется.
//  • ЛЭП, ветряки (ротор крутится), порт (краны, контейнеры, сухогрузы), маяк, резервуары промзоны, ангары, стоянка аэродрома —
//    целиком, с отсечением по дальности группы.
//  • Дома деревень и лес — только вблизи камеры (набор пересобирается при смещении); те же процедурные экземпляры в этом
//    радиусе прячет шейдер (все вершины экземпляра — в одну точку), дальше — прежние коробки и конусы.
// Пока модель грузится (или не загрузилась) — всё процедурное, как раньше.
/* global THREE */
import { want, loadedModel } from './glb.js?v=20261012i';

const V = (x, y, z) => new THREE.Vector3(x, y, z), Q = new THREE.Quaternion(), UPY = V(0, 1, 0);
const mtx = (x, y, z, yaw, sx = 1, sy = sx, sz = sx) => new THREE.Matrix4().compose(V(x, y, z), Q.setFromAxisAngle(UPY, yaw), V(sx, sy, sz));
// прятать экземпляры процедурного InstancedMesh ближе R к камере (uNear: x, z камеры, R², мин. ширина экземпляра —
// у стен деревни так остаются водонапорные башни: их ствол 3 м, дома от 7 м)
function hideNear(mat, U, cond = 'length(instanceMatrix[0].xyz) >= uNear.w') { // cond — какие экземпляры вообще можно прятать
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uNear = U;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform vec4 uNear;').replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
{ vec4 io = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0); vec2 dd = io.xz - uNear.xy; if (dot(dd, dd) < uNear.z && (${cond})) transformed = vec3(0.0); }
#endif`);
  };
  const key = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
  mat.customProgramCacheKey = () => key() + '|hideNear|' + cond;
  mat.needsUpdate = true;
}

// sites — world.glbSites; P — пресет; opts: { terrainH, water } (уровень воды)
export function createGlbMap(scene, sites, P, { water }) {
  const groups = []; // { objs: [Object3D], c: Vector3, r, far } — отсечение группы по дальности
  const spin = []; // роторы ветряков
  const SH = !!P.shadows, lvl = P.propsLvl || 0;
  // экземпляры модели name по матрицам mats; colors — цвет на экземпляр (умножается на текстуру); skip(mesh) — какие детали не брать
  function inst(name, mats, { shadow = SH, colors = null, skip = null, cap = 0 } = {}) {
    const G = loadedModel(name); if (!G || (!mats.length && !cap)) return [];
    const out = [];
    for (const c of G.children) {
      if (!c.isMesh || (skip && skip(c))) continue;
      const im = new THREE.InstancedMesh(c.geometry, c.material, Math.max(mats.length, cap));
      mats.forEach((m, i) => im.setMatrixAt(i, m)); im.count = mats.length;
      if (colors) { const col = new THREE.Color(); colors.forEach((h, i) => im.setColorAt(i, col.set(h).convertSRGBToLinear())); }
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.frustumCulled = false; im.castShadow = shadow && !c.userData.glass; im.receiveShadow = SH; // отсечение — по группе (ниже)
      scene.add(im); out.push(im);
    }
    return out;
  }
  const group = (objs, pts, far) => { // центр и радиус группы — по её местам
    if (!objs.length) return;
    const c = V(0, 0, 0); for (const p of pts) c.add(V(p.x, 0, p.z)); c.multiplyScalar(1 / pts.length);
    let r = 0; for (const p of pts) r = Math.max(r, Math.hypot(p.x - c.x, p.z - c.z));
    groups.push({ objs, c, r, far });
  };
  const hide = (list) => { for (const o of list || []) if (o) o.visible = false; };
  // загрузить модели и, когда все пришли, собрать группу (нет модели — остаётся процедурное)
  const when = (names, fn) => Promise.all(names.map((n) => want(n))).then((gs) => { if (gs.every(Boolean)) fn(); }).catch((e) => console.warn('карта:', e));

  // ── ЛЭП: опоры-модели, провода с провисом между крепления (3 фазы: x −7 / 0 / +7 на высоте 23,1 м) ──
  const S = sites;
  if (S.pylons && S.pylons.items.length) when(['m_pylon'], () => {
    const it = S.pylons.items, objs = inst('m_pylon', it.map((p) => mtx(p.x, p.y, p.z, p.yaw)));
    const wires = [], arm = (p, o) => V(p.x + Math.cos(p.yaw) * o, p.y + 23.1, p.z - Math.sin(p.yaw) * o);
    for (let i = 1; i < it.length; i++) {
      const a = it[i - 1], b = it[i]; if (a.line !== b.line) continue;
      for (const o of [-7, 0, 7]) {
        const A = arm(a, o), B = arm(b, o), sag = Math.hypot(B.x - A.x, B.z - A.z) * 0.02;
        for (let s = 0; s < 10; s++) { const t0 = s / 10, t1 = (s + 1) / 10, y = (t) => A.y + (B.y - A.y) * t - 4 * t * (1 - t) * sag;
          wires.push(A.x + (B.x - A.x) * t0, y(t0), A.z + (B.z - A.z) * t0, A.x + (B.x - A.x) * t1, y(t1), A.z + (B.z - A.z) * t1); }
      }
    }
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
    const wl = new THREE.LineSegments(wg, S.pylons.wireMat()); wl.frustumCulled = false; scene.add(wl);
    group([...objs, wl], it, 9000); hide(S.pylons.hide);
  });

  // ── ветряки: башня с гондолой экземплярами, ротор — свой у каждого (крутится вокруг ступицы) ──
  if (S.wind && S.wind.items.length) when(['m_wind'], () => {
    const it = S.wind.items, objs = inst('m_wind', it.map((p) => mtx(p.x, p.y, p.z, p.yaw)), { skip: (c) => /^rotor/.test(c.name) });
    const rot = loadedModel('m_wind').children.find((c) => /^rotor/.test(c.name));
    if (rot) {
      const pos = rot.geometry.attributes.position, hub = V(0, 0, 0); for (let i = 0; i < pos.count; i++) hub.add(V(pos.getX(i), pos.getY(i), pos.getZ(i)));
      hub.multiplyScalar(1 / pos.count); // три одинаковые лопасти: средняя точка вершин — ступица
      const g = rot.geometry.clone(); g.translate(-hub.x, -hub.y, -hub.z);
      for (const p of it) {
        const piv = new THREE.Group(); piv.position.set(p.x, p.y, p.z); piv.rotation.y = p.yaw;
        const m = new THREE.Mesh(g, rot.material); m.position.copy(hub); m.castShadow = SH; piv.add(m); scene.add(piv);
        objs.push(piv); spin.push({ m, w: p.w || 1 });
      }
    }
    group(objs, it, 12000); hide(S.wind.hide);
  });

  // ── промзона: резервуары ──
  if (S.tanks && S.tanks.items.length) when(['obj_tanks'], () => {
    const it = S.tanks.items; group(inst('obj_tanks', it.map((p, i) => mtx(p.x, p.y, p.z, p.yaw + (i % 2) * Math.PI / 2))), it, 8000); hide(S.tanks.hide);
  });

  // ── порт: портальные краны, контейнеры (40 футов, цвет — прежний), сухогрузы у причалов ──
  if (S.port) {
    const pt = S.port, H = S.hide || {};
    if (pt.cranes.length) when(['m_crane'], () => { group(inst('m_crane', pt.cranes.map((p) => mtx(p.x, p.y, p.z, p.yaw))), pt.cranes, 8000); hide([H.cranes]); });
    if (pt.conts.length) when(['m_cont'], () => {
      group(inst('m_cont', pt.conts.map((p) => mtx(p.x, p.y, p.z, p.yaw, 2.5 / 2.43, 1, 12 / 6.06)), { colors: pt.conts.map((p) => p.c) }), pt.conts, 6000); hide([H.conts]);
    });
    if (pt.ships.length) when(['m_ship', 'm_cont'], () => {
      const objs = [];
      for (const s of pt.ships) {
        const k = s.len / 150; objs.push(...inst('m_ship', [mtx(s.x, water - 8 * k, s.z, s.yaw, k)]));
        // контейнеры на палубе: ряды вдоль корпуса перед надстройкой (корма — +z модели)
        const mats = [], cols = [], C = [0xb23b2e, 0x2f5f9e, 0x3f8a4a, 0xd0a33a, 0x7a7f86];
        const cs = Math.cos(s.yaw), sn = Math.sin(s.yaw), deck = water - 8 * k + 13 * k;
        for (let r = 0; r < 7; r++) for (let c = -2; c <= 2; c++) for (let h = 0; h < 2; h++) {
          const lz = -60 * k + r * 13.5 * k, lx = c * 2.6; if ((r + c + h) % 5 === 4) continue;
          mats.push(mtx(s.x + cs * lx + sn * lz, deck + h * 2.6, s.z - sn * lx + cs * lz, s.yaw, 1.03, 1, 2)); cols.push(C[(r * 3 + c + h * 7 + 20) % 5]);
        }
        objs.push(...inst('m_cont', mats, { colors: cols }));
      }
      group(objs, pt.ships, 9000); hide([H.ships]);
    });
  }

  // ── маяк ──
  if (S.light) when(['m_light'], () => { group(inst('m_light', [mtx(S.light.x, S.light.y, S.light.z, 0)]), [S.light], 9000); hide([S.hide && S.hide.light, S.hide && S.hide.lightGlass]); });

  // ── аэродром: арочные ангары, топливозаправщики, самолёты на стоянке ──
  if (S.airfield && S.airfield.hangars.length) {
    const A = S.airfield, hs = A.hangars;
    when(['obj_jhangar'], () => { group(inst('obj_jhangar', hs.map((p) => mtx(p.x, p.y, p.z, -Math.PI / 2, 0.75))), hs, 9000); hide(A.hide); });
    const park = hs.slice(1, 5).map((p, i) => ({ x: p.x - 60, y: p.y, z: p.z + 60, yaw: Math.PI / 2, key: i % 2 ? 'mig29' : 'su30' })); // носом к полосе
    when(['su30', 'mig29'], () => {
      group([...inst('su30', park.filter((p) => p.key === 'su30').map((p) => mtx(p.x, p.y + 0.2, p.z, p.yaw))),
        ...inst('mig29', park.filter((p) => p.key === 'mig29').map((p) => mtx(p.x, p.y + 0.2, p.z, p.yaw)))], park, 6000);
    });
    const fuel = hs.slice(0, 3).map((p, i) => ({ x: p.x + 45, y: p.y, z: p.z - 150 + i * 14 }));
    when(['obj_rtank'], () => group(inst('obj_rtank', fuel.map((p) => mtx(p.x, p.y, p.z, 0))), fuel, 5000));
  }

  // ── вблизи камеры: дома деревень и лес моделями (набор пересобирается при смещении камеры) ──
  const near = []; // { R, step, last, fill(cam) }
  if (lvl >= 1 && S.houses && S.houses.items.length) {
    const HT = ['h_brick', 'h_house', 'h_log', 'h_khata', 'h_mobile'], R = lvl >= 2 ? 1800 : 1200, U = { value: new THREE.Vector4(0, 0, -1, 0) };
    const items = S.houses.items.map((h, i) => ({ ...h, t: HT[(i * 7 + (i >> 2)) % HT.length] }));
    when(HT, () => {
      const pools = {}, fp = {};
      for (const t of HT) {
        const b = new THREE.Box3().setFromObject(loadedModel(t)), n = items.filter((h) => h.t === t).length;
        fp[t] = [b.max.x - b.min.x, b.max.z - b.min.z]; pools[t] = inst(t, [], { cap: n, shadow: SH });
      }
      for (const m of [S.houses.walls, S.houses.roofs]) if (m) hideNear(m.material, U);
      const M4 = new THREE.Matrix4();
      near.push({ R, step: 60, last: null, fill(cam) {
        const cnt = {}; for (const t of HT) cnt[t] = 0;
        for (const h of items) {
          if (Math.hypot(h.x - cam.x, h.z - cam.z) > R) continue;
          const [mx, mz] = fp[h.t], s = Math.min(1.35, Math.max(0.75, Math.sqrt((h.w * h.d) / (mx * mz))));
          M4.compose(V(h.x, h.y - 0.3, h.z), Q.setFromAxisAngle(UPY, h.rot), V(s, s, s));
          for (const im of pools[h.t]) im.setMatrixAt(cnt[h.t], M4); cnt[h.t]++;
        }
        for (const t of HT) for (const im of pools[t]) { im.count = cnt[t]; im.instanceMatrix.needsUpdate = true; }
        U.value.set(cam.x, cam.z, R * R, 5);
      } });
    });
  }
  if (lvl >= 1 && S.trees && S.trees.chunks.length && S.trees.mat) {
    const R = lvl >= 2 ? 700 : 450, CAP = 2500, U = { value: new THREE.Vector4(0, 0, -1, 0) };
    when(['tr_pine', 'tr_oak', 'tr_lime'], () => {
      const H = {}; for (const t of ['tr_pine', 'tr_oak', 'tr_lime']) { const b = new THREE.Box3().setFromObject(loadedModel(t)); H[t] = b.max.y - b.min.y; }
      const pools = { tr_pine: inst('tr_pine', [], { cap: CAP }), tr_oak: inst('tr_oak', [], { cap: CAP }), tr_lime: inst('tr_lime', [], { cap: CAP }) };
      hideNear(S.trees.mat, U);
      const M4 = new THREE.Matrix4(), M0 = new THREE.Matrix4(), p = V(0, 0, 0), q = new THREE.Quaternion(), sc = V(0, 0, 0);
      near.push({ R, step: 40, last: null, fill(cam) {
        const cnt = { tr_pine: 0, tr_oak: 0, tr_lime: 0 };
        for (const ch of S.trees.chunks) {
          if (Math.hypot(ch.x - cam.x, ch.z - cam.z) > R + ch.half * 1.5) continue;
          const im = ch.mesh;
          for (let i = 0; i < im.count; i++) {
            im.getMatrixAt(i, M0); M0.decompose(p, q, sc);
            if (Math.hypot(p.x - cam.x, p.z - cam.z) > R) continue;
            // ель → сосна; лиственные — дуб и липа вперемешку; высота — как у процедурного дерева (ель ≈ 17 м, лиственное ≈ 15 м)
            const t = ch.leafy ? (i % 2 ? 'tr_oak' : 'tr_lime') : 'tr_pine'; if (cnt[t] >= CAP) continue;
            const k = (ch.leafy ? 15 : 17) / H[t];
            M4.compose(V(p.x, p.y + 0.5, p.z), q, V(sc.x * k, sc.y * k, sc.z * k));
            for (const m of pools[t]) m.setMatrixAt(cnt[t], M4); cnt[t]++;
          }
        }
        for (const t in pools) for (const m of pools[t]) { m.count = cnt[t]; m.instanceMatrix.needsUpdate = true; }
        U.value.set(cam.x, cam.z, R * R, 0);
      } });
    });
  }

  // ── города вблизи: дома до 48 м — модели по форме коробки (вытянутые низкие — панельная пятиэтажка, квадратные низкие —
  // сталинка, средние — многоэтажка или офисный блок; высота — растяжкой ×0,85…1,5), у подъездов — машины. Выше 48 м —
  // прежние стеклянные башни с окнами. Дальше радиуса — коробки
  if (lvl >= 1 && S.towns && S.towns.items.length) {
    const BT = ['bld_p5', 'bld_st', 'bld_b12', 'o_block'], PARK = ['c_compact', 'c_coupe', 'c_hatch', 'c_van', 'c_offroad', 'c_pickup', 'c_sedan', 'c_sport', 'c_suv', 'c_wagon', 'c_police'];
    const R = lvl >= 2 ? 1500 : 1000, HMAX = 48, U = { value: new THREE.Vector4(0, 0, -1, 0) };
    const items = S.towns.items.filter((b) => b.h <= HMAX).map((b, i) => {
      const lng = Math.max(b.w, b.d) / Math.min(b.w, b.d) > 1.45, t = b.h <= 22 ? (lng ? 'bld_p5' : 'bld_st') : (lng ? 'bld_b12' : 'o_block');
      return { ...b, t, i };
    });
    when([...BT, ...PARK], () => {
      const dim = {}; for (const t of BT) { const bb = new THREE.Box3().setFromObject(loadedModel(t)); dim[t] = [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z]; }
      const pools = {}; for (const t of BT) pools[t] = inst(t, [], { cap: items.filter((b) => b.t === t).length || 1 });
      const cars = {}; for (const c of PARK) cars[c] = inst(c, [], { cap: items.length, shadow: false });
      hideNear(S.towns.mat, U, `length(instanceMatrix[1].xyz) <= ${HMAX.toFixed(1)}`);
      const M4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = V(1, 1, 1), p = V(0, 0, 0);
      near.push({ R, step: 80, last: null, fill(cam) {
        const cnt = {}; for (const t of BT) cnt[t] = 0; const cc = {}; for (const c of PARK) cc[c] = 0;
        for (const b of items) {
          if (Math.hypot(b.x - cam.x, b.z - cam.z) > R) continue;
          const [mx, my, mz] = dim[b.t], alongX = b.w > b.d, L = Math.max(b.w, b.d), Wd = Math.min(b.w, b.d);
          sc.set(Wd / mx, Math.min(1.5, Math.max(0.85, b.h / my)), L / mz); // длинная сторона модели — z
          M4.compose(p.set(b.x, b.y - 1.5, b.z), q.setFromAxisAngle(UPY, alongX ? Math.PI / 2 : 0), sc);
          for (const im of pools[b.t]) im.setMatrixAt(cnt[b.t], M4); cnt[b.t]++;
          if (b.i % 3 !== 2) { // машина у дома — вдоль длинной стороны, в 4 м от стены
            const c = PARK[(b.i * 7 + 3) % PARK.length], side = b.i % 2 ? 1 : -1, off = Wd / 2 + 4, sh = ((b.i * 13) % 10 - 5) * L / 14;
            p.set(b.x + (alongX ? sh : side * off), b.y - 0.1, b.z + (alongX ? side * off : sh));
            M4.compose(p, q.setFromAxisAngle(UPY, (alongX ? Math.PI / 2 : 0) + (b.i % 4 < 2 ? 0 : Math.PI)), V(1, 1, 1));
            for (const im of cars[c]) im.setMatrixAt(cc[c], M4); cc[c]++;
          }
        }
        for (const t of BT) for (const im of pools[t]) { im.count = cnt[t]; im.instanceMatrix.needsUpdate = true; }
        for (const c of PARK) for (const im of cars[c]) { im.count = cc[c]; im.instanceMatrix.needsUpdate = true; }
        U.value.set(cam.x, cam.z, R * R, 0);
      } });
    });
  }

  // ── машины на дорогах: едут по правой полосе в обе стороны, на концах дороги разворачиваются; вблизи (< 250 м) — подробные,
  // до 3 км — упрощённые (_lo), дальше не рисуются. Полицейская — примерно каждая восьмая. Только картинка: столкновений нет
  const traffic = [];
  const CARS = ['c_compact', 'c_coupe', 'c_hatch', 'c_van', 'c_offroad', 'c_pickup', 'c_sedan', 'c_sport', 'c_suv', 'c_wagon', 'c_police'];
  const nCars = [0, 120, 220][Math.min(2, lvl)] + (P.propsLvl === 3 ? 80 : 0); // «Кино» — уровень 3
  if (nCars && S.roads && S.roads.length) when([...CARS, ...CARS.map((c) => c + '_lo')], () => {
    const roads = S.roads.filter((r) => r.length > 3).map((pts) => { const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z)); return { pts, L, len: L[L.length - 1] }; });
    const total = roads.reduce((a, r) => a + r.len, 0); let seed = 7;
    const rr = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; // своя случайность: бой и общий Math.random не трогаем
    const cars = [];
    for (let k = 0; k < nCars; k++) {
      let u = rr() * total, ri = 0; while (u > roads[ri].len) { u -= roads[ri].len; ri++; }
      const t = k % 8 === 7 ? 10 : (rr() * 10) | 0;
      cars.push({ r: roads[ri], s: u, dir: rr() < 0.5 ? 1 : -1, v: 11 + rr() * 11, t });
    }
    const pools = CARS.map((c) => ({ hi: inst(c, [], { cap: nCars, shadow: SH }), lo: inst(c + '_lo', [], { cap: nCars, shadow: false }) }));
    const M4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = V(1, 1, 1), pos = V(0, 0, 0);
    traffic.cars = cars;
    traffic.push((dt, cam) => {
      const cnt = CARS.map(() => [0, 0]);
      for (const c of cars) {
        const R = c.r; c.s += c.v * c.dir * dt;
        if (c.s > R.len - 5) { c.s = R.len - 5; c.dir = -1; } else if (c.s < 5) { c.s = 5; c.dir = 1; }
        let i = 1; while (i < R.L.length - 1 && R.L[i] < c.s) i++;
        const a = R.pts[i - 1], b = R.pts[i], f = (c.s - R.L[i - 1]) / Math.max(1e-3, R.L[i] - R.L[i - 1]);
        const tx = (b.x - a.x) * c.dir, tz = (b.z - a.z) * c.dir, tl = Math.hypot(tx, tz) || 1, dx = tx / tl, dz = tz / tl;
        pos.set(a.x + (b.x - a.x) * f - dz * 2.2, a.y + (b.y - a.y) * f + 0.05, a.z + (b.z - a.z) * f + dx * 2.2); // правая полоса
        const d = Math.hypot(pos.x - cam.x, pos.z - cam.z); if (d > 3000) continue;
        M4.compose(pos, q.setFromAxisAngle(UPY, Math.atan2(-dx, -dz)), one);
        const P_ = pools[c.t], hi = d < 250, set = hi ? P_.hi : P_.lo, n = cnt[c.t][hi ? 0 : 1]++;
        for (const im of set) im.setMatrixAt(n, M4);
      }
      pools.forEach((P_, j) => { for (const im of P_.hi) { im.count = cnt[j][0]; im.instanceMatrix.needsUpdate = true; } for (const im of P_.lo) { im.count = cnt[j][1]; im.instanceMatrix.needsUpdate = true; } });
    });
  });

  return {
    near, traffic, // для проверки
    update(dt, cam) {
      for (const s of spin) s.m.rotation.z += s.w * dt;
      for (const f of traffic) f(dt, cam);
      for (const g of groups) { const v = Math.hypot(g.c.x - cam.x, g.c.z - cam.z) < g.far + g.r; for (const o of g.objs) o.visible = v; }
      for (const n of near) if (!n.last || Math.hypot(cam.x - n.last.x, cam.z - n.last.z) > n.step) { n.last = { x: cam.x, z: cam.z }; n.fill(cam); }
    },
  };
}
