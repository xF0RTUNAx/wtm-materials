// Объекты на карте «Симулятора Летки»: деревни, промзона (цеха, трубы с дымом, резервуары, градирня),
// дороги с мостами и разметкой, железная дорога, ЛЭП, телевышки с огнями, ветряки.
// Всё склеено в несколько мешей (деревни — 2 InstancedMesh на всю карту, промзона и опоры — по одной геометрии),
// поэтому вызовов отрисовки добавляется около десятка. Расстановка — по своему генератору от seed,
// застройку городов и лес не сдвигает. Здесь же — «коробки» для столкновений дрона со строениями.
/* global THREE */
import { mulberry32 } from './schedule.js?v=20260930m';
import { M, part, mergeParts } from './models.js?v=20260930m';

// C — окружение из world.js: { WORLD, TOWNS, AIRFIELD, terrainH, airfieldH, lin, add, P, rnd }
export function buildProps(C) {
  const { WORLD, TOWNS, AIRFIELD, terrainH, lin, add, P } = C;
  const R = mulberry32(0x7a11 ^ C.seed);
  const W = WORLD.WATER_Y, lvl = Math.min(2, P.propsLvl ?? 2); // 0 — низкий, 1 — средний, 2 — высокий и выше (3 у «Кино» — ещё гуще)
  const boxes = [], emitters = [], anim = [], lights = [];
  // места под готовые модели (main.js → glbmap.js): что заменить и какие процедурные меши спрятать, когда модель загрузится.
  // Расстановка и коробки столкновений — прежние, генератор R() тот же
  const glb = {};
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const flat = (x, z, r) => { let lo = 1e9, hi = -1e9; for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [r * 0.7, r * 0.7], [-r * 0.7, -r * 0.7]]) { const h = terrainH(x + dx, z + dz); lo = Math.min(lo, h); hi = Math.max(hi, h); } return [hi - lo, lo, hi]; };
  const farFrom = (x, z, list, d) => list.every((p) => Math.hypot(p.x - x, p.z - z) > d + (p.r || 0));
  const solidMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  // провода и растяжки: линия в 1 пиксель не тоньшает с расстоянием, поэтому гасим её вдали (дальше ~1,5 км проводов не видно)
  const wireMat = (hex) => {
    const m = new THREE.LineBasicMaterial({ color: lin(hex), transparent: true, depthWrite: false });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vWD;').replace('#include <project_vertex>', '#include <project_vertex>\nvWD = -mvPosition.z;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vWD;').replace('#include <fog_fragment>', '#include <fog_fragment>\ngl_FragColor.a *= 1.0 - smoothstep(300.0, 1500.0, vWD);');
    };
    return m;
  };

  // ── места: промзона у города, деревни на ровных участках долины ──
  let ind = null;
  for (let k = 0; k < 400 && !ind; k++) {
    const T = TOWNS[1], a = R() * Math.PI * 2, d = T.r + 700 + R() * 1400, x = T.x + Math.cos(a) * d, z = T.z + Math.sin(a) * d;
    const [rng, lo] = flat(x, z, 320);
    if (rng < 14 && lo > W + 18 && farFrom(x, z, TOWNS, 500) && Math.hypot(x, z) < 9500) ind = { x, z, r: 450, y: lo };
  }
  const villages = [], avoid = [...TOWNS, { ...AIRFIELD, r: AIRFIELD.r + 600 }, ...(ind ? [ind] : [])];
  const nV = [6, 11, 16][lvl] + (P.propsLvl === 3 ? 4 : 0);
  for (let k = 0; k < 3000 && villages.length < nV; k++) {
    const a = R() * Math.PI * 2, d = 2200 + Math.sqrt(R()) * 8200, x = Math.cos(a) * d, z = Math.sin(a) * d;
    const [rng, lo] = flat(x, z, 110);
    if (rng > 30 || lo < W + 12 || lo > 950) continue;
    if (!farFrom(x, z, avoid, 600) || !farFrom(x, z, villages, 1500)) continue;
    villages.push({ x, z, r: 260 + R() * 120, y: lo });
  }

  // ── деревни: дома (стены и крыши — два InstancedMesh на всю карту), у каждой — сарай и водонапорная башня ──
  {
    const per = [8, 12, 18][lvl] + (P.propsLvl === 3 ? 6 : 0);
    const walls = [], roofs = [];
    const WALL = [0xe9e2d0, 0xf2ecdf, 0xd9cfae, 0xc9d6de, 0xb86b4b, 0xe3d6b8, 0xa9b7a0], ROOF = [0x8a3b2c, 0x6b3a2a, 0x4a4f57, 0x7a6a58, 0x3d5a3e, 0x9b4a32];
    for (const v of villages) {
      const main = R() * Math.PI; // дома вдоль «улицы»
      for (let i = 0; i < per; i++) {
        const along = (R() - 0.5) * v.r * 1.8, off = (R() < 0.5 ? -1 : 1) * (18 + R() * 30) + (R() - 0.5) * 20;
        const x = v.x + Math.cos(main) * along - Math.sin(main) * off, z = v.z + Math.sin(main) * along + Math.cos(main) * off;
        const w = 7 + R() * 5, d = 8 + R() * 6, h = 4 + R() * 3.5, y = terrainH(x, z), rot = main + (R() < 0.3 ? Math.PI / 2 : 0) + (R() - 0.5) * 0.2;
        walls.push({ x, y: y - 1.5, z, w, h: h + 1.5, d, rot, c: WALL[(R() * WALL.length) | 0] });
        roofs.push({ x, y: y + h, z, w: w * 1.12, h: 2.2 + R() * 2.2, d: d * 1.06, rot, c: ROOF[(R() * ROOF.length) | 0] });
        boxes.push({ x, z, hw: Math.max(w, d) / 2, hd: Math.max(w, d) / 2, y0: y - 2, y1: y + h + 3 });
      }
      if (lvl >= 1) { // водонапорная башня
        const x = v.x + (R() - 0.5) * 120, z = v.z + (R() - 0.5) * 120, y = terrainH(x, z);
        walls.push({ x, y, z, w: 3, h: 22, d: 3, rot: 0, c: 0x8d8f8a }); roofs.push({ x, y: y + 22, z, w: 9, h: 7, d: 9, rot: 0, c: 0x9a5b3a, tank: true });
        boxes.push({ x, z, hw: 5, hd: 5, y0: y, y1: y + 30 });
      }
    }
    const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
    const roof = new THREE.CylinderGeometry(0.58, 0.58, 1, 3, 1); roof.rotateX(Math.PI / 2); roof.rotateZ(Math.PI); roof.translate(0, 0.29, 0); roof.scale(1, 1 / 0.87, 1);
    const tank = new THREE.CylinderGeometry(0.5, 0.5, 1, 10); tank.translate(0, 0.5, 0);
    const mk = (geo, list, fn) => {
      const items = list.filter(fn); if (!items.length) return null;
      const im = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial(), items.length), m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
      items.forEach((b, i) => { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.rot); m.compose(V(b.x, b.y, b.z), q, V(b.w, b.h, b.d)); im.setMatrixAt(i, m); im.setColorAt(i, c.set(b.c).convertSRGBToLinear()); });
      im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true;
      geo.boundingSphere = new THREE.Sphere(V(0, 300, 0), WORLD.SIZE); // вся карта — одна проверка видимости
      im.castShadow = im.receiveShadow = !!P.shadows; add(im); return im;
    };
    // дома (без водонапорных башен): стена i и крыша i — один дом
    const houses = walls.map((w, i) => (roofs[i].tank ? null : { x: w.x, y: w.y + 1.5, z: w.z, w: w.w, d: w.d, h: w.h - 1.5, rot: w.rot, i })).filter(Boolean);
    const wm = mk(box, walls, () => true), rm = mk(roof, roofs, (b) => !b.tank); mk(tank, roofs, (b) => b.tank);
    glb.houses = { items: houses, walls: wm, roofs: rm }; // вблизи — модели домов, процедурные экземпляры прячет шейдер
  }

  // ── промзона: площадка, цеха, трубы, резервуары, градирня ──
  if (ind) {
    const parts = [], cx = ind.x, cz = ind.z, [, , hi] = flat(cx, cz, 330), y0 = hi + 0.4, rot = R() * Math.PI;
    const at = (lx, lz) => [cx + Math.cos(rot) * lx - Math.sin(rot) * lz, cz + Math.sin(rot) * lx + Math.cos(rot) * lz];
    const P_ = (geo, col, lx, ly, lz, ry = 0, sx = 1, sy = 1, sz = 1) => { const [x, z] = at(lx, lz); parts.push(part(geo, col, M(x, y0 + ly, z, 0, rot + ry, 0, sx, sy, sz))); return [x, z]; };
    P_(new THREE.BoxGeometry(760, 14, 560), 0x6d6e6a, 0, -7, 0);                         // бетонная площадка (с насыпью)
    const B = new THREE.BoxGeometry(1, 1, 1); B.translate(0, 0.5, 0);
    const halls = [[-250, -150, 90, 22, 60, 0x9aa3ad], [-120, -160, 70, 18, 55, 0xb8b2a2], [20, -170, 110, 26, 70, 0x7f8c95], [180, -150, 80, 20, 60, 0xa9a08c],
      [-260, 30, 60, 16, 90, 0x8d969c], [-150, 60, 100, 30, 50, 0xc0b8a8], [230, 40, 70, 18, 110, 0x9aa3ad], [-40, 200, 160, 14, 40, 0xa6a08f], [150, 210, 60, 24, 60, 0x7e8a92]];
    for (const [lx, lz, w, h, d, c] of halls) {
      P_(B, c, lx, 0, lz, 0, w, h, d); P_(B, 0x5b636b, lx, h, lz, 0, w * 1.02, 1.2, d * 1.02); // крыша-кромка
      const [x, z] = at(lx, lz); boxes.push({ x, z, hw: Math.max(w, d) / 2, hd: Math.max(w, d) / 2, y0: y0 - 2, y1: y0 + h + 2 });
    }
    // трубы: красно-белые полосы, дым сверху
    for (const [lx, lz, h] of [[70, 20, 120], [100, 30, 95], [-60, -30, 80]]) {
      const n = 8;
      for (let k = 0; k < n; k++) P_(new THREE.CylinderGeometry(3.6 - k * 0.15, 3.75 - k * 0.15, h / n, 14), k % 2 ? 0xe8e6e0 : 0xb33a2e, lx, (k + 0.5) * h / n, lz);
      const [x, z] = at(lx, lz); emitters.push({ x, y: y0 + h + 2, z, kind: 'smoke' }); boxes.push({ x, z, hw: 5, hd: 5, y0: y0, y1: y0 + h + 3 });
    }
    // резервуары
    const tanks = [], tankParts = [];
    for (let k = 0; k < 6; k++) {
      const lx = -300 + (k % 3) * 44, lz = 170 + Math.floor(k / 3) * 44, n0 = parts.length;
      P_(new THREE.CylinderGeometry(16, 16, 15, 20), 0xd6d8d6, lx, 7.5, lz); P_(new THREE.CylinderGeometry(4, 16, 3, 20), 0xc4c6c4, lx, 16.5, lz);
      tankParts.push(...parts.splice(n0)); // отдельным мешем — его прячем, когда загрузится модель резервуаров
      const [x, z] = at(lx, lz); boxes.push({ x, z, hw: 16, hd: 16, y0: y0, y1: y0 + 18 }); tanks.push({ x, y: y0, z, yaw: rot });
    }
    // градирня (гиперболоид) с паром
    if (lvl >= 1) {
      const pr = [[42, 0], [36, 30], [29, 62], [30, 78], [33, 92]].map(([r, y]) => new THREE.Vector2(r, y));
      const g = new THREE.LatheGeometry(pr, 28); P_(g, 0xbdbab2, 300, 0, -40);
      const [x, z] = at(300, -40); emitters.push({ x, y: y0 + 95, z, kind: 'steam' }); boxes.push({ x, z, hw: 42, hd: 42, y0: y0, y1: y0 + 92 });
    }
    const mesh = add(new THREE.Mesh(mergeParts(parts), solidMat)); mesh.castShadow = mesh.receiveShadow = !!P.shadows;
    const tm = add(new THREE.Mesh(mergeParts(tankParts), solidMat)); tm.castShadow = tm.receiveShadow = !!P.shadows;
    glb.tanks = { items: tanks, hide: [tm] };
    // фонари площадки — светятся в сумерки
    if (lvl >= 1) {
      const pts = []; for (let i = 0; i < 18; i++) { const [x, z] = at(-360 + (i % 6) * 144, -260 + Math.floor(i / 6) * 260); pts.push(V(x, y0 + 14, z)); }
      lights.push({ pts, color: 0xffb060, size: 1.2 });
    }
  }

  // ── дороги и железная дорога: ленты по рельефу, мосты над водой, разметка в шейдере ──
  const roadPts = []; // для столкновений не нужны
  {
    const nodes = [...TOWNS.map((t) => ({ x: t.x, z: t.z, r: t.r * 0.55, big: true })), { x: AIRFIELD.x + 150, z: AIRFIELD.z - 1500, r: 0, big: true }];
    const links = [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4]];
    if (ind) { nodes.push({ x: ind.x, z: ind.z, r: 300 }); links.push([1, nodes.length - 1]); }
    for (const v of villages) {
      let best = -1, bd = 1e9;
      nodes.forEach((n, i) => { const d = Math.hypot(n.x - v.x, n.z - v.z); if (d < bd) { bd = d; best = i; } });
      nodes.push({ x: v.x, z: v.z, r: 0 }); links.push([best, nodes.length - 1]);
    }
    const pos = [], rd = [], idx = [], piers = [];
    const ribbon = (pts, half, kind) => {
      const base = pos.length / 3; let along = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], p = pts[i];
        let tx = b.x - a.x, tz = b.z - a.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
        if (i) along += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z);
        pos.push(p.x - tz * half, p.y, p.z + tx * half, p.x + tz * half, p.y, p.z - tx * half);
        rd.push(kind, along, kind + 1, along);
        if (i) { const o = base + i * 2; idx.push(o - 2, o - 1, o, o - 1, o + 1, o); }
      }
    };
    const path = (A, B, curvy) => {
      const dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
      const t0 = A.r / L, t1 = 1 - B.r / L, amp = (R() - 0.5) * L * (curvy ? 0.18 : 0.1), ph = R() * 6;
      const pts = [], step = 32;
      for (let s = t0 * L; s <= t1 * L; s += step) {
        const t = s / L, off = amp * Math.sin(Math.PI * t) + 25 * Math.sin(t * 9 + ph);
        const x = A.x + dx * t - uz * off, z = A.z + dz * t + ux * off, g = terrainH(x, z);
        pts.push({ x, z, g, y: g + 0.35 });
      }
      // мосты: над водой — настил на высоте, въезды плавные
      for (let i = 0; i < pts.length; i++) {
        let wet = 0; for (let k = -4; k <= 4; k++) { const q = pts[i + k]; if (q && q.g < W + 2.5) wet = Math.max(wet, 1 - Math.abs(k) / 5); }
        if (wet > 0) { pts[i].y = Math.max(pts[i].y, pts[i].g + 0.35 + (W + 7 - pts[i].g) * Math.min(1, wet * 1.4)); if (pts[i].g < W + 2.5 && i % 2 === 0) piers.push(pts[i]); }
      }
      return pts;
    };
    for (const [a, b] of links) { const pts = path(nodes[a], nodes[b], !nodes[a].big || !nodes[b].big); if (pts.length > 2) { ribbon(pts, nodes[a].big && nodes[b].big ? 6.5 : 4, 0); roadPts.push(pts); } }
    // железная дорога: через всю долину, мимо промзоны
    if (lvl >= 1) {
      const A = { x: -10500, z: -6000, r: 0 }, B = { x: 10500, z: 5000, r: 0 }, mid = ind ? { x: ind.x + 500, z: ind.z + 500, r: 0 } : { x: 0, z: 0, r: 0 };
      for (const [p, q] of [[A, mid], [mid, B]]) { const pts = path(p, q, false); pts.forEach((t) => { t.y += 0.4; }); if (pts.length > 2) ribbon(pts, 4.2, 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('rd', new THREE.Float32BufferAttribute(rd, 2)); g.setIndex(idx);
    g.computeVertexNormals(); g.boundingSphere = new THREE.Sphere(V(0, 300, 0), WORLD.SIZE);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 rd; varying vec2 vRd; varying float vDist;')
        // «притянуть» ленту к камере на 0,2 % расстояния: на экране она на том же месте, но не тонет в рельефе и не мерцает вдали
        .replace('#include <project_vertex>', '#include <project_vertex>\nvRd = rd; vDist = -mvPosition.z; mvPosition.xyz *= 0.998; gl_Position = projectionMatrix * mvPosition;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vRd; varying float vDist;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          float near = 1.0 - smoothstep(250.0, 1400.0, vDist);
          if (vRd.x < 1.5) { // дорога: асфальт, прерывистая осевая и сплошные края
            float u = vRd.x; diffuseColor.rgb = vec3(0.055, 0.058, 0.062);
            float mark = step(abs(u - 0.5), 0.018) * step(0.55, fract(vRd.y / 14.0)) + step(0.455, abs(u - 0.5)) * step(abs(u - 0.5), 0.475);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.75), mark * near);
          } else { // железная дорога: щебень, шпалы, два рельса
            float u = vRd.x - 2.0; diffuseColor.rgb = vec3(0.16, 0.14, 0.12);
            float sleeper = step(0.5, fract(vRd.y / 0.9)) * step(abs(u - 0.5), 0.34);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.13, 0.08), sleeper * near);
            float rail = step(abs(abs(u - 0.5) - 0.18), 0.02);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.32, 0.3, 0.3), max(rail * near, 0.0));
          }`);
    };
    const roads = add(new THREE.Mesh(g, mat)); roads.receiveShadow = !!P.shadows; roads.renderOrder = -1;
    // опоры мостов
    if (piers.length) {
      const parts = piers.map((p) => part(new THREE.BoxGeometry(3, Math.max(2, p.y - p.g + 6), 3), 0x8a8a84, M(p.x, (p.y + p.g - 6) / 2, p.z)));
      add(new THREE.Mesh(mergeParts(parts), solidMat));
    }
  }

  // ── ЛЭП: опоры и провода с провисом от промзоны к двум городам ──
  if (lvl >= 1 && ind) {
    const parts = [], wires = [], pyl = [];
    for (const T of [TOWNS[0], TOWNS[2]]) {
      const dx = T.x - ind.x, dz = T.z - ind.z, L = Math.hypot(dx, dz) - T.r * 0.8, n = Math.max(2, Math.round(L / 330)), ux = dx / Math.hypot(dx, dz), uz = dz / Math.hypot(dx, dz);
      const yaw = Math.atan2(ux, uz); let prev = null;
      for (let i = 0; i <= n; i++) {
        const t = i / n, x = ind.x + ux * (L * t + 200) + Math.sin(t * 7) * 40 * -uz, z = ind.z + uz * (L * t + 200) + Math.sin(t * 7) * 40 * ux, y = terrainH(x, z);
        parts.push(part(new THREE.CylinderGeometry(0.8, 3.4, 36, 4), 0x7d8288, M(x, y + 18, z, 0, yaw + Math.PI / 4))); pyl.push({ x, y, z, yaw, line: T === TOWNS[0] ? 0 : 1 });
        parts.push(part(new THREE.BoxGeometry(18, 1, 1.2), 0x7d8288, M(x, y + 31, z, 0, yaw)));
        boxes.push({ x, z, hw: 4, hd: 4, y0: y, y1: y + 37 });
        const arms = [-8.5, 0, 8.5].map((o) => V(x + Math.cos(yaw) * o, y + (o ? 30.5 : 36), z - Math.sin(yaw) * o));
        if (prev) for (let k = 0; k < 3; k++) { const a = prev[k], b = arms[k]; for (let s = 0; s < 8; s++) { const t0 = s / 8, t1 = (s + 1) / 8, sag = (t) => 4 * t * (1 - t) * 7; wires.push(a.x + (b.x - a.x) * t0, a.y + (b.y - a.y) * t0 - sag(t0), a.z + (b.z - a.z) * t0, a.x + (b.x - a.x) * t1, a.y + (b.y - a.y) * t1 - sag(t1), a.z + (b.z - a.z) * t1); } }
        prev = arms;
      }
    }
    const pm = add(new THREE.Mesh(mergeParts(parts), solidMat)); pm.castShadow = !!P.shadows;
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
    const wl = add(new THREE.LineSegments(wg, wireMat(0x2a2c2e)));
    glb.pylons = { items: pyl, hide: [pm, wl], wireMat: () => wireMat(0x2a2c2e) };
  }

  // ── телевышки на холмах у городов: красно-белые, с растяжками и мигающими огнями ──
  if (lvl >= 1) {
    const parts = [], guys = [], tops = [];
    for (const T of [TOWNS[0], TOWNS[2], TOWNS[3]]) {
      let best = null;
      for (let k = 0; k < 60; k++) { const a = R() * Math.PI * 2, d = T.r + 500 + R() * 1800, x = T.x + Math.cos(a) * d, z = T.z + Math.sin(a) * d, y = terrainH(x, z); if (!best || y > best.y) best = { x, y, z }; }
      const H = 170 + R() * 60, n = 10;
      for (let k = 0; k < n; k++) parts.push(part(new THREE.CylinderGeometry(1.2 - k * 0.06, 1.3 - k * 0.06, H / n, 6), k % 2 ? 0xeeeeea : 0xc2352b, M(best.x, best.y + (k + 0.5) * H / n, best.z)));
      for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2, gx = best.x + Math.cos(a) * H * 0.45, gz = best.z + Math.sin(a) * H * 0.45; guys.push(best.x, best.y + H * 0.8, best.z, gx, terrainH(gx, gz), gz); }
      tops.push(V(best.x, best.y + H + 1, best.z), V(best.x, best.y + H * 0.55, best.z));
      boxes.push({ x: best.x, z: best.z, hw: 4, hd: 4, y0: best.y, y1: best.y + H + 2 });
    }
    add(new THREE.Mesh(mergeParts(parts), solidMat));
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(guys, 3));
    add(new THREE.LineSegments(gg, wireMat(0x3a3c3e)));
    lights.push({ pts: tops, color: 0xff2a18, size: 2.4, blink: true, always: true });
  }

  // ── ветряки на гряде: башни одной геометрией, роторы крутятся ──
  if (lvl >= 1) {
    let best = null;
    for (let k = 0; k < 160; k++) { const a = R() * Math.PI * 2, d = 7500 + R() * 2500, x = Math.cos(a) * d, z = Math.sin(a) * d, y = terrainH(x, z); if (farFrom(x, z, [...avoid, ...villages], 700) && (!best || y > best.y)) best = { x, z, y, a }; }
    if (best) {
      const parts = [], dirA = best.a + Math.PI / 2, n = lvl >= 2 ? 8 : 5, yaw = R() * Math.PI * 2, wind = [], rotors = [];
      const rotorGeo = mergeParts([0, 1, 2].map((k) => part(new THREE.BoxGeometry(1.4, 38, 0.35), 0xf2f2ee, M(0, 0, 0, 0, 0, k * Math.PI * 2 / 3).multiply(new THREE.Matrix4().makeTranslation(0, 19, 0))))
        .concat([part(new THREE.SphereGeometry(1.6, 10, 8), 0xe8e8e4, M(0, 0, 0))]));
      for (let i = 0; i < n; i++) {
        const x = best.x + Math.cos(dirA) * (i - n / 2) * 360, z = best.z + Math.sin(dirA) * (i - n / 2) * 360, y = terrainH(x, z);
        parts.push(part(new THREE.CylinderGeometry(1.3, 2.2, 82, 12), 0xf0f0ec, M(x, y + 41, z)));
        parts.push(part(new THREE.BoxGeometry(3.4, 3.6, 10), 0xe4e4e0, M(x, y + 83, z, 0, yaw)));
        const rotor = new THREE.Mesh(rotorGeo, solidMat); rotor.position.set(x - Math.sin(yaw) * 5.6, y + 83, z - Math.cos(yaw) * 5.6); rotor.rotation.order = 'YXZ'; rotor.rotation.y = yaw;
        add(rotor); anim.push({ o: rotor, w: 0.9 + R() * 0.25 }); rotors.push(rotor); wind.push({ x, y, z, yaw, w: anim[anim.length - 1].w });
        boxes.push({ x, z, hw: 22, hd: 22, y0: y, y1: y + 122 });
      }
      const tw = add(new THREE.Mesh(mergeParts(parts), solidMat)); tw.castShadow = !!P.shadows;
      glb.wind = { items: wind, hide: [tw, ...rotors] };
    }
  }

  // ── огни (фонари, огни вышек): HDR-яркие точки — «светятся» в свечении кадра ──
  const lightMeshes = lights.map((L) => {
    const g = new THREE.SphereGeometry(L.size, 6, 4), m = new THREE.MeshBasicMaterial({ color: lin(L.color).multiplyScalar(8) });
    const im = new THREE.InstancedMesh(g, m, L.pts.length), mm = new THREE.Matrix4();
    L.pts.forEach((p, i) => im.setMatrixAt(i, mm.makeTranslation(p.x, p.y, p.z))); im.instanceMatrix.needsUpdate = true;
    g.boundingSphere = new THREE.Sphere(V(0, 300, 0), WORLD.SIZE); add(im); return { im, L };
  });
  let t = 0;
  return {
    boxes, emitters, villages, industry: ind, roads: roadPts, glb,
    update(dt, night) {
      t += dt;
      for (const a of anim) a.o.rotation.z += a.w * dt;
      for (const { im, L } of lightMeshes) im.visible = (L.always || night > 0.25) && (!L.blink || (t % 1.6) < 0.8);
    },
  };
}
