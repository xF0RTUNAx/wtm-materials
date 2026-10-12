// Объекты на карте «Симулятора Летки»: деревни, промзона (цеха, трубы с дымом, резервуары, градирня),
// дороги с мостами и разметкой, железная дорога, ЛЭП, телевышки с огнями, ветряки.
// Всё склеено в несколько мешей (деревни — 2 InstancedMesh на всю карту, промзона и опоры — по одной геометрии),
// поэтому вызовов отрисовки добавляется около десятка. Расстановка — по своему генератору от seed,
// застройку городов и лес не сдвигает. Здесь же — «коробки» для столкновений дрона со строениями.
/* global THREE */
import { mulberry32 } from './schedule.js?v=20260930m';
import { M, part, mergeParts } from './models.js?v=20260930m';

// C — окружение из world.js: { WORLD, TOWNS, AIRFIELD, terrainH, airfieldH, lin, add, P, rnd }
// детали поверхности (Poly Haven, CC0; ../airdef/tex/p_*.jpg — серые 512 px): скалы, пашня, асфальт. Пока не пришла — серая 1×1
const DETAIL = {};
export function detailTex(name) {
  if (DETAIL[name]) return DETAIL[name];
  const t = new THREE.Texture(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; DETAIL[name] = t;
  if (typeof document === 'undefined' || typeof document.createElementNS !== 'function') return t; // без браузера (тесты) — без картинки
  const c = document.createElement('canvas'); c.width = c.height = 1; const x = c.getContext('2d'); if (x) { x.fillStyle = '#808080'; x.fillRect(0, 0, 1, 1); } t.image = c; t.needsUpdate = true;
  new THREE.ImageLoader().load(new URL(`../airdef/tex/${name}.jpg?v=20261020e`, import.meta.url).href, (img) => { t.image = img; t.needsUpdate = true; }, undefined, () => {});
  return t;
}
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
  let finishHouses = null;
  {
    const per = [8, 12, 18][lvl] + (P.propsLvl === 3 ? 6 : 0);
    const walls = [], roofs = [];
    const WALL = [0xe9e2d0, 0xf2ecdf, 0xd9cfae, 0xc9d6de, 0xb86b4b, 0xe3d6b8, 0xa9b7a0], ROOF = [0x8a3b2c, 0x6b3a2a, 0x4a4f57, 0x7a6a58, 0x3d5a3e, 0x9b4a32];
    for (const v of villages) {
      const main = R() * Math.PI; v.main = main; // дома вдоль «улицы» (её рисуем с дорогами ниже)
      for (let i = 0; i < per; i++) {
        const along = (R() - 0.5) * v.r * 1.8, off = (R() < 0.5 ? -1 : 1) * (18 + R() * 30) + (R() - 0.5) * 20;
        const x = v.x + Math.cos(main) * along - Math.sin(main) * off, z = v.z + Math.sin(main) * along + Math.cos(main) * off;
        const w = 7 + R() * 5, d = 8 + R() * 6, h = 4 + R() * 3.5, y = terrainH(x, z), rot = main + (R() < 0.3 ? Math.PI / 2 : 0) + (R() - 0.5) * 0.2;
        walls.push({ x, y: y - 1.5, z, w, h: h + 1.5, d, rot, c: WALL[(R() * WALL.length) | 0], box: { x, z, hw: Math.max(w, d) / 2, hd: Math.max(w, d) / 2, y0: y - 2, y1: y + h + 3 } });
        roofs.push({ x, y: y + h, z, w: w * 1.12, h: 2.2 + R() * 2.2, d: d * 1.06, rot, c: ROOF[(R() * ROOF.length) | 0] });
      }
      if (lvl >= 1) { // водонапорная башня
        const x = v.x + (R() - 0.5) * 120, z = v.z + (R() - 0.5) * 120, y = terrainH(x, z);
        walls.push({ x, y, z, w: 3, h: 22, d: 3, rot: 0, c: 0x8d8f8a, box: { x, z, hw: 5, hd: 5, y0: y, y1: y + 30 } }); roofs.push({ x, y: y + 22, z, w: 9, h: 7, d: 9, rot: 0, c: 0x9a5b3a, tank: true });
      }
    }
    // меши — после дорог (ниже): дом, на который легла дорога или улица, убираем
    finishHouses = (roadDist) => {
    const keep = walls.map((w) => roadDist(w.x, w.z) > Math.hypot(w.w, w.d) / 2 + 2);
    for (let i = walls.length - 1; i >= 0; i--) if (!keep[i]) { walls.splice(i, 1); roofs.splice(i, 1); }
    for (const w of walls) boxes.push(w.box);
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
    const isT = walls.map((w, i) => !!roofs[i].tank);
    const wm = mk(box, walls, (w) => !isT[walls.indexOf(w)]), rm = mk(roof, roofs, (b) => !b.tank);
    const tp = mk(box, walls, (w) => isT[walls.indexOf(w)]), tt = mk(tank, roofs, (b) => b.tank); // водонапорные башни — своими мешами (их заменяет модель)
    glb.houses = { items: houses, walls: wm, roofs: rm }; // вблизи — модели домов, процедурные экземпляры прячет шейдер
    // село моделями (glbmap.js): водонапорные башни, у домов — забор вдоль улицы, сараи, в полях — трактор и комбайн; у городов —
    // вышки сотовой связи. Своя случайность: остальная карта не сдвигается
    const RV = mulberry32((0x5e10 ^ C.seed) >>> 0), vg = { wt: [], fence: [], barn: [], tractor: [], combine: [], mast: [], hide: [tp, tt].filter(Boolean) };
    walls.forEach((w, i) => { if (isT[i]) vg.wt.push({ x: w.x, y: terrainH(w.x, w.z) - 0.3, z: w.z, yaw: RV() * 6.28 }); });
    const vOf = (x, z) => villages.reduce((b, v) => (Math.hypot(v.x - x, v.z - z) < Math.hypot(b.x - x, b.z - z) ? v : b), villages[0]);
    for (const h of houses) {
      const v = vOf(h.x, h.z); if (!v || RV() > 0.75) continue;
      const nx = -Math.sin(v.main), nz = Math.cos(v.main), tx = Math.cos(v.main), tz = Math.sin(v.main), o = (h.x - v.x) * nx + (h.z - v.z) * nz, sd = o > 0 ? -1 : 1;
      const dep = Math.max(h.w, h.d) / 2 + 4, L = Math.max(h.w, h.d) + 6, n = Math.max(2, Math.round(L / 4)), yaw = Math.atan2(tx, tz);
      for (let k = 0; k < n; k++) { const t = (k + 0.5) * L / n - L / 2, x = h.x + nx * sd * dep + tx * t, z = h.z + nz * sd * dep + tz * t; if (roadDist(x, z) > 2) vg.fence.push({ x, y: terrainH(x, z) - 0.1, z, yaw }); }
    }
    const spot = (v, d0, d1, clear) => { for (let k = 0; k < 12; k++) { const a = RV() * 6.28, d = d0 + RV() * (d1 - d0), x = v.x + Math.cos(a) * d, z = v.z + Math.sin(a) * d; if (roadDist(x, z) > clear && !boxes.some((b) => Math.abs(b.x - x) < b.hw + clear && Math.abs(b.z - z) < b.hd + clear) && Math.abs(terrainH(x + 6, z) - terrainH(x - 6, z)) < 3) return { x, y: terrainH(x, z) - 0.2, z, yaw: RV() * 6.28 }; } return null; };
    for (const v of villages) {
      for (let k = 0; k < 2; k++) { const q = spot(v, 40, v.r * 0.8, 12); if (q) vg.barn.push(q); }
      let q = spot(v, v.r + 60, v.r + 260, 10); if (q) vg.tractor.push(q);
      if (RV() < 0.6 && (q = spot(v, v.r + 120, v.r + 400, 12))) vg.combine.push(q);
    }
    for (const t of TOWNS) for (let k = 0; k < 2; k++) { const q = spot(t, t.r * 0.85, t.r * 1.2, 20); if (q) vg.mast.push(q); }
    glb.village = vg;
    };
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
  // расстояние до края ближайшей дороги или ж/д (м; дальше ~40 м — «далеко»): дома, лес и трава не встают на дорогу
  const RC = 64, rSeg = [], rHash = new Map(), rKey = (i, j) => (i + 4096) * 8192 + j + 4096;
  const roadDist = (x, z) => {
    const L = rHash.get(rKey(Math.floor(x / RC), Math.floor(z / RC))); let best = 1e9;
    if (L) for (const k of L) {
      const [ax, az, bx, bz, h] = rSeg[k], dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t) - h);
    }
    return best;
  };
  // высота земли под дорогой: сетка рельефа между узлами — плоскости треугольников, на вогнутом склоне она выше настоящей
  // поверхности (лента по terrainH там тонула — дорога «прерывалась»); берём большее из двух
  const MS = C.meshStep || 0, MX0 = -WORLD.SIZE / 2;
  const meshH = (x, z) => {
    const fx = (x - MX0) / MS, fz = (z - MX0) / MS, i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, X = MX0 + i * MS, Z = MX0 + j * MS;
    if (u + v <= 1) { const a = terrainH(X, Z); return a + (terrainH(X + MS, Z) - a) * u + (terrainH(X, Z + MS) - a) * v; }
    const d = terrainH(X + MS, Z + MS); return d + (terrainH(X, Z + MS) - d) * (1 - u) + (terrainH(X + MS, Z) - d) * (1 - v);
  };
  let addRoads = () => {};
  const bridgeItems = [], bridgeHide = []; glb.bridges = { items: bridgeItems, hide: bridgeHide };
  const trussItems = [], trussHide = []; glb.trusses = { items: trussItems, hide: trussHide }; // ж/д мосты — ферма br_truss
  const groundAt = (x, z) => (MS ? Math.max(terrainH(x, z), meshH(x, z)) : terrainH(x, z));
  {
    // дороги между городами идут в центр города (там сходятся), а не обрываются на полпути
    const nodes = [...TOWNS.map((t) => ({ x: t.x, z: t.z, r: 0, big: true })), { x: AIRFIELD.x + 150, z: AIRFIELD.z - 1500, r: 0, big: true }];
    const links = [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4]];
    if (ind) { nodes.push({ x: ind.x, z: ind.z, r: 300 }); links.push([1, nodes.length - 1]); }
    const pos = [], rd = [], idx = [], piers = [], sk = [], skW = [], skT = [];
    const quad = (a, b, c, d) => sk.push(...a, ...b, ...c, ...a, ...c, ...d), quadW = (a, b, c, d) => skW.push(...a, ...b, ...c, ...a, ...c, ...d), quadT = (a, b, c, d) => skT.push(...a, ...b, ...c, ...a, ...c, ...d);
    // пролёты над водой — готовой моделью br_seg (glbmap.js): настил 9,6 м, опора (колонны до дна) — через каждые три
    const spanSegs = (P, half) => {
      const L = [0]; for (let k = 1; k < P.length; k++) L.push(L[k - 1] + Math.hypot(P[k].x - P[k - 1].x, P[k].z - P[k - 1].z));
      const tot = L[L.length - 1], n = Math.max(1, Math.round(tot / 9.6)), sl = tot / (n * 9.6);
      for (let s = 0; s < n; s++) {
        const d = (s + 0.5) * tot / n; let k = 1; while (k < P.length - 1 && L[k] < d) k++;
        const f = (d - L[k - 1]) / ((L[k] - L[k - 1]) || 1), A = P[k - 1], B = P[k];
        bridgeItems.push({ x: A.x + (B.x - A.x) * f, y: A.y + (B.y - A.y) * f, z: A.z + (B.z - A.z) * f, g: A.g + (B.g - A.g) * f, yaw: Math.atan2(-(B.x - A.x), -(B.z - A.z)),
          sx: (2 * half) / 5.5, sl, pier: n < 3 ? s === Math.floor(n / 2) : s % 3 === 1 });
      }
    };
    // ж/д над водой — ферма br_truss (glbmap.js): пролёт фермы 242 м (×sl), длинная переправа — несколько ферм подряд
    const trussSegs = (P) => {
      const L = [0]; for (let k = 1; k < P.length; k++) L.push(L[k - 1] + Math.hypot(P[k].x - P[k - 1].x, P[k].z - P[k - 1].z));
      const tot = L[L.length - 1], n = Math.max(1, Math.ceil((tot + 30) / (242 * 1.6))), seg = tot / n;
      const at = (d) => { let k = 1; while (k < P.length - 1 && L[k] < d) k++; const f = Math.min(1, Math.max(0, (d - L[k - 1]) / ((L[k] - L[k - 1]) || 1))), A = P[k - 1], B = P[k]; return { x: A.x + (B.x - A.x) * f, y: A.y + (B.y - A.y) * f, z: A.z + (B.z - A.z) * f }; };
      for (let s = 0; s < n; s++) {
        const a = at(s * seg), b = at((s + 1) * seg), c = at((s + 0.5) * seg);
        trussItems.push({ x: c.x, y: c.y, z: c.z, yaw: Math.atan2(-(b.x - a.x), -(b.z - a.z)), sl: Math.max(0.5, (seg / 2 + 15) / 121) });
      }
    };
    const ribbon = (pts, half, kind) => {
      if (kind === 2) { let a = -1; for (let i = 0; i <= pts.length; i++) { const ok = i < pts.length && pts[i].g < W + 2.5; if (ok && a < 0) a = i; if (!ok && a >= 0) { if (i - a >= 2) trussSegs(pts.slice(a, i)); a = -1; } } }
      if (kind === 0) { let a = -1; for (let i = 0; i <= pts.length; i++) { const ok = i < pts.length && pts[i].g < W + 2.5; if (ok && a < 0) a = i; if (!ok && a >= 0) { if (i - a >= 2) spanSegs(pts.slice(a, i), half); a = -1; } } }
      const base = pos.length / 3; let along = 0, prev = null;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], p = pts[i];
        let tx = b.x - a.x, tz = b.z - a.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
        if (i) along += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z);
        const l = [p.x - tz * half, p.y, p.z + tx * half], r = [p.x + tz * half, p.y, p.z - tx * half];
        pos.push(...l, ...r);
        rd.push(kind, along, kind + 1, along);
        if (i) { const o = base + i * 2; idx.push(o - 2, o - 1, o, o - 1, o + 1, o); }
        // мост и насыпь: где лента поднята над землёй — боковины до земли (над водой — балка 1,8 м), низ и ограждение
        const up = p.y - p.gm > 0.8, bot = p.g < W + 0.5 ? p.y - 1.8 : p.gm - 0.6;
        const cur = { l, r, bl: [l[0], bot, l[2]], br: [r[0], bot, r[2]], ul: [l[0], p.y + 1, l[2]], ur: [r[0], p.y + 1, r[2]], up, wet: kind !== 1 && p.g < W + 2.5 };
        if (prev && (prev.up || up)) {
          const q = prev.wet && cur.wet ? (kind === 2 ? quadT : quadW) : quad; // над водой — отдельным мешем: его заменяют пролёты br_seg (ж/д — ферма)
          q(prev.bl, prev.l, cur.l, cur.bl); q(prev.r, prev.br, cur.br, cur.r); q(prev.br, prev.bl, cur.bl, cur.br);
          if (prev.up && up && p.g < W + 4) { q(prev.l, prev.ul, cur.ul, cur.l); q(prev.ur, prev.r, cur.r, cur.ur); }
        }
        prev = cur;
        if (i) { // в индекс расстояний
          const q = pts[i - 1], k = rSeg.length, e = half + 40; rSeg.push([q.x, q.z, p.x, p.z, half]);
          for (let ci = Math.floor((Math.min(q.x, p.x) - e) / RC); ci <= Math.floor((Math.max(q.x, p.x) + e) / RC); ci++)
            for (let cj = Math.floor((Math.min(q.z, p.z) - e) / RC); cj <= Math.floor((Math.max(q.z, p.z) + e) / RC); cj++) {
              const key = rKey(ci, cj); let L = rHash.get(key); if (!L) rHash.set(key, L = []); L.push(k);
            }
        }
      }
    };
    // wig — извилистость (0 — прямая деревенская улица); у концов изгибы гаснут, чтобы дороги сходились точно в узел
    const path = (A, B, curvy, wig = 1) => {
      const dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
      const t0 = A.r / L, t1 = 1 - B.r / L, amp = (R() - 0.5) * L * (curvy ? 0.18 : 0.1) * wig, ph = R() * 6;
      const pts = [], step = 16;
      for (let s = t0 * L; s <= t1 * L + 0.01; s += step) {
        // в последних ~900 м перед узлом дорога прямая: дороги, подходящие к городу с близких сторон, не переплетаются
        const t = Math.min(s, t1 * L) / L, e = Math.min(t - t0, t1 - t) * L, fade = e <= 0 ? 0 : e >= 900 ? 1 : (e / 900) * (e / 900) * (3 - 2 * e / 900);
        const off = (amp * Math.sin(Math.PI * t) + 25 * wig * Math.sin(t * 9 + ph)) * fade;
        const x = A.x + dx * t - uz * off, z = A.z + dz * t + ux * off, g = terrainH(x, z);
        // по ширине дороги — самая высокая точка сетки (на косом склоне край ленты не уходит в землю)
        const gm = Math.max(groundAt(x, z), groundAt(x - uz * 6.5, z + ux * 6.5), groundAt(x + uz * 6.5, z - ux * 6.5));
        pts.push({ x, z, g, gm, y: gm + 0.35 });
        if (s < t1 * L && s + step > t1 * L) s = t1 * L - step; // последняя точка — ровно в конце
      }
      // мосты: над водой — настил на высоте, въезды плавные
      for (let i = 0; i < pts.length; i++) {
        let wet = 0; for (let k = -4; k <= 4; k++) { const q = pts[i + k]; if (q && q.g < W + 2.5) wet = Math.max(wet, 1 - Math.abs(k) / 5); }
        if (wet > 0) { pts[i].y = Math.max(pts[i].y, pts[i].gm + 0.35 + (W + 7 - pts[i].gm) * Math.min(1, wet * 1.4)); if (pts[i].g < W + 2.5 && i % 4 === 0) piers.push(pts[i]); }
      }
      return pts;
    };
    for (const [a, b] of links) { const pts = path(nodes[a], nodes[b], !nodes[a].big || !nodes[b].big); if (pts.length > 2) { ribbon(pts, nodes[a].big && nodes[b].big ? 6.5 : 4, 0); roadPts.push(pts); } }
    // деревня — вдоль своей улицы; к ближнему концу улицы подходит дорога от ближайшей точки уже проложенных дорог
    // (примыкание буквой «Т», а не своя лента от центра города рядом с другой — так они шли парой и переплетались)
    for (const v of villages) {
      const ux = Math.cos(v.main), uz = Math.sin(v.main), Lh = v.r * 0.9 + 30;
      const E = [{ x: v.x - ux * Lh, z: v.z - uz * Lh, r: 0 }, { x: v.x + ux * Lh, z: v.z + uz * Lh, r: 0 }];
      let best = null, bd = 1e9, end = 0;
      for (const pts of roadPts) for (let k = 0; k < pts.length; k += 2) E.forEach((e, j) => { const d = Math.hypot(pts[k].x - e.x, pts[k].z - e.z); if (d < bd) { bd = d; best = pts[k]; end = j; } });
      const st = path(E[1 - end], E[end], false, 0); if (st.length > 2) { ribbon(st, 3.5, 0); roadPts.push(st); }
      if (best && bd > 30) { const pts = path(E[end], { x: best.x, z: best.z, r: 5 }, true); if (pts.length > 2) { ribbon(pts, 4, 0); roadPts.push(pts); } }
    }
    // железная дорога: через всю долину, мимо промзоны
    if (lvl >= 1) {
      const A = { x: -10500, z: -6000, r: 0 }, B = { x: 10500, z: 5000, r: 0 }, mid = ind ? { x: ind.x + 500, z: ind.z + 500, r: 0 } : { x: 0, z: 0, r: 0 };
      for (const [p, q] of [[A, mid], [mid, B]]) { const pts = path(p, q, false); pts.forEach((t) => { t.y += 0.4; t.rail = 1; }); if (pts.length > 2) ribbon(pts, 4.2, 2); }
    }
    // перекрёсток в центре города: круглая площадка асфальта поверх сходящихся концов (без разметки — u = 0,2)
    const hub = (n, R0) => {
      const base = pos.length / 3, y = groundAt(n.x, n.z) + 0.45; pos.push(n.x, y, n.z); rd.push(0.2, 0);
      for (let k = 0; k <= 24; k++) { const a = k / 24 * Math.PI * 2, x = n.x + Math.cos(a) * R0, z = n.z + Math.sin(a) * R0; pos.push(x, Math.max(y, groundAt(x, z) + 0.45), z); rd.push(0.2, 0); if (k) idx.push(base, base + k + 1, base + k); }
    };
    nodes.forEach((n, i) => { if (n.big && links.filter((l) => l.includes(i)).length >= 2) hub(n, 16); });
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const tAsph = detailTex('p_asph'), tGrav = detailTex('p_grav');
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.tAsph = { value: tAsph }; sh.uniforms.tGrav = { value: tGrav };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 rd; varying vec2 vRd; varying float vDist;')
        // «притянуть» ленту к камере на 0,2 % расстояния: на экране она на том же месте, но не тонет в рельефе и не мерцает вдали
        .replace('#include <project_vertex>', '#include <project_vertex>\nvRd = rd; vDist = -mvPosition.z; mvPosition.xyz *= 0.998; gl_Position = projectionMatrix * mvPosition;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vRd; varying float vDist; uniform sampler2D tAsph, tGrav;\nfloat dlum(sampler2D t, vec2 uv, float avg) { return clamp(dot(texture2D(t, uv).rgb, vec3(0.333)) / avg, 0.35, 1.9); }')
        .replace('#include <color_fragment>', `#include <color_fragment>
          float near = 1.0 - smoothstep(250.0, 1400.0, vDist);
          if (vRd.x < 1.5) { // дорога: асфальт, прерывистая осевая и сплошные края
            float u = vRd.x; diffuseColor.rgb = vec3(0.055, 0.058, 0.062) * mix(1.0, dlum(tAsph, vec2(u * 10.0, vRd.y) / 4.0, 0.351), near); // асфальт вблизи — фактура
            float mark = step(abs(u - 0.5), 0.018) * step(0.55, fract(vRd.y / 14.0)) + step(0.455, abs(u - 0.5)) * step(abs(u - 0.5), 0.475);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.75), mark * near);
          } else { // железная дорога: щебень, шпалы, два рельса
            float u = vRd.x - 2.0; diffuseColor.rgb = vec3(0.16, 0.14, 0.12) * mix(1.0, dlum(tGrav, vec2(u * 8.4, vRd.y) / 2.5, 0.257), near);
            float sleeper = step(0.5, fract(vRd.y / 0.9)) * step(abs(u - 0.5), 0.34);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.13, 0.08), sleeper * near);
            float rail = step(abs(abs(u - 0.5) - 0.18), 0.02);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.32, 0.3, 0.3), max(rail * near, 0.0));
          }`);
    };
    const flush = () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('rd', new THREE.Float32BufferAttribute(rd, 2)); g.setIndex(idx);
    g.computeVertexNormals(); g.boundingSphere = new THREE.Sphere(V(0, 300, 0), WORLD.SIZE);
    const roads = add(new THREE.Mesh(g, mat)); roads.receiveShadow = !!P.shadows; roads.renderOrder = -1;
    // опоры мостов
    for (const [rail, H] of [[0, bridgeHide], [1, trussHide]]) {
      const pp = piers.filter((p) => !p.rail === !rail); if (!pp.length) continue;
      const parts = pp.map((p) => part(new THREE.BoxGeometry(3, Math.max(2, p.y - 1.8 - p.g + 6), 6), 0x8a8a84, M(p.x, (p.y - 1.8 + p.g - 6) / 2, p.z)));
      H.push(add(new THREE.Mesh(mergeParts(parts), solidMat)));
    }
    for (const [S, H] of [[skW, bridgeHide], [skT, trussHide]]) { // балки мостов над водой — прячутся, когда придут пролёты br_seg (ж/д — ферма)
      if (!S.length) continue;
      const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(S, 3)); sg.computeVertexNormals();
      const sm = add(new THREE.Mesh(mergeParts([part(sg, 0x8f8d86, null)]), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
      sm.castShadow = sm.receiveShadow = !!P.shadows; H.push(sm);
    }
    if (sk.length) { // боковины мостов и насыпей
      const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sk, 3)); sg.computeVertexNormals();
      const sm = add(new THREE.Mesh(mergeParts([part(sg, 0x8f8d86, null)]), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
      sm.castShadow = sm.receiveShadow = !!P.shadows;
    }
    pos.length = rd.length = idx.length = piers.length = sk.length = skW.length = skT.length = 0;
    };
    flush();
    finishHouses(roadDist);
    // ещё дороги позже (landmarks.js: подъезды к большому мосту): пары [A, B, полуширина], у узлов r — отступ от узла
    addRoads = (pairs) => { for (const [a, b, h] of pairs) { const pts = path(a, b, true); if (pts.length > 2) { ribbon(pts, h, 0); roadPts.push(pts); } } if (pos.length) flush(); };
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
    boxes, emitters, villages, industry: ind, roads: roadPts, glb, roadDist, addRoads: (p) => addRoads(p),
    update(dt, night) {
      t += dt;
      for (const a of anim) a.o.rotation.z += a.w * dt;
      for (const { im, L } of lightMeshes) im.visible = (L.always || night > 0.25) && (!L.blink || (t % 1.6) < 0.8);
    },
  };
}
