// Зоны повреждений самолёта на модели: каждый треугольник по своему центру (оси модели: нос −Z, правое крыло +X, верх +Y)
// относится к фюзеляжу, крылу (левому/правому), внешней консоли крыла (отлетает) или хвосту (киль и стабилизаторы — отлетают).
// Границы — по самой модели: ширина фюзеляжа — по носовой части, начало хвоста — задняя четверть длины, консоль — внешняя
// половина полуразмаха. ZCUT — поправки для особых схем (бесхвостка/«дельта» — хвост только киль, «утка» — ПГО — фюзеляж).
// Режется один раз на геометрию (кэш): копии моделей делят геометрию. Проверка: tools/airdef-models/zones.html.
/* global THREE */
export const ZONES = ['body', 'wingL', 'wingR', 'consL', 'consR', 'tailL', 'tailR', 'tailC']; // хвост — по бортам (стабилизатор, свой киль) и середина (одиночный киль)
const TAILS = new Set(['tailL', 'tailR', 'tailC']);
const tailSide = (P, x) => (x < -P.tc ? 'tailL' : x > P.tc ? 'tailR' : 'tailC');
// следы разрыва (тёмная опалённая кромка): scarL/scarR — на обрубке крыла (видны после отрыва), cutL/cutR — на самой консоли
const SCARS = ['scarL', 'scarR', 'cutL', 'cutR'];
// поправки: fusK — ширина фюзеляжа ×; tailK — доля длины, с которой хвост; consK — доля полуразмаха (от фюзеляжа), где консоль
// (по умолчанию 0,65: отлетает внешняя треть — самолёт ещё держится в воздухе);
// delta — у крыла нет стабилизаторов позади (хвост — только киль выше фюзеляжа); canard — ПГО перед крылом (это фюзеляж)
export const ZCUT = {
  e_gripen: { delta: true, canard: true }, e_typhoon: { delta: true, canard: true },
  su30: { canard: true }, e_su34: { canard: true },
  e_f22: { tailK: 0.8 }, e_tu160: { tailK: 0.82 }, // стабилизаторы вплотную к крылу — «перетяжки» нет
};
// два киля на мотогондолах (корни — ниже гаргрота): киль — любая стоячая поверхность над обшивкой в задней части
const TWIN = new Set(['su30', 'mig29', 'e_su34', 'e_su57', 'e_mig31', 'f18', 'e_f22', 'e_f35']);
const CACHE = new Map();
// опалённая рваная кромка: тёмный налёт поверх обшивки у линии разрыва
const SCAR_MAT = new THREE.MeshBasicMaterial({ color: 0x15110d, transparent: true, opacity: 0.82, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, depthWrite: false });
const pct = (arr, p) => { if (!arr.length) return 0; const a = Float32Array.from(arr).sort(); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };

// границы зон по вершинам модели (root — модель целиком, в своих осях); meta — сопла (ширина фюзеляжа у двухдвигательных)
export function zoneParams(root, key, meta = null) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), m = new THREE.Matrix4(), v = new THREE.Vector3(), pts = [];
  root.traverse((o) => {
    if (!o.isMesh || o.userData.fx) return; m.multiplyMatrices(inv, o.matrixWorld); const p = o.geometry.attributes.position, st = Math.max(1, Math.floor(p.count / 6000));
    for (let i = 0; i < p.count; i += st) { v.fromBufferAttribute(p, i).applyMatrix4(m); pts.push(v.x, v.y, v.z); }
  });
  let z0 = Infinity, z1 = -Infinity, xm = 0;
  for (let i = 0; i < pts.length; i += 3) { z0 = Math.min(z0, pts[i + 2]); z1 = Math.max(z1, pts[i + 2]); xm = Math.max(xm, Math.abs(pts[i])); }
  const L = z1 - z0, c = ZCUT[key] || {};
  // фюзеляж — по носовой части (12–33 % длины от носа; у «уток» — до ПГО), без дальних от оси частей (мотогондолы на крыле);
  // у двухдвигательных — не уже мотогондол (сопло + полметра)
  const ax = [], ay = [];
  for (let i = 0; i < pts.length; i += 3) { const t = (pts[i + 2] - z0) / L, x = Math.abs(pts[i]); if (t > 0.12 && t < (c.canard ? 0.25 : 0.33) && x < xm * 0.25) ax.push(x); }
  let fus = pct(ax, 0.9) * 1.1;
  const nz = meta && meta.nozzles ? meta.nozzles.map((n) => Math.abs(n.x)).filter((x) => x < xm * 0.3) : [];
  if (nz.length) fus = Math.max(fus, Math.max(...nz) + Math.max(0.5, (meta.nr || 0.4) * 1.4));
  fus = Math.max(0.6, fus * (c.fusK || 1));
  for (let i = 0; i < pts.length; i += 3) { const t = (pts[i + 2] - z0) / L; if (t > 0.35 && t < 0.7 && Math.abs(pts[i]) < fus) ay.push(pts[i + 1]); }
  const top = pct(ay, 0.92), top2 = pct(ay, 0.55); // top — верх фюзеляжа (с гаргротом), top2 — обычная верхняя обшивка (там корни килей)
  // начало хвоста — «перетяжка» между крылом и стабилизатором (где размах меньше всего в задней части); нет её — 76 % длины
  let tailZ = z0 + L * (c.tailK || 0.76);
  if (!c.tailK && !c.delta) {
    const NS = 40, span = new Float32Array(NS);
    for (let i = 0; i < pts.length; i += 3) { const t = (pts[i + 2] - z0) / L, k = Math.floor(t * NS); if (k >= 0 && k < NS && pts[i + 1] < top + 0.1) span[k] = Math.max(span[k], Math.abs(pts[i])); }
    let best = -1, bv = Infinity; for (let k = Math.floor(NS * 0.55); k < Math.floor(NS * 0.93); k++) if (span[k] < bv) { bv = span[k]; best = k; }
    const before = Math.max(...span.slice(Math.floor(NS * 0.35), best)), after = Math.max(...span.slice(best + 1));
    if (best > 0 && bv < before * 0.8 && after > bv * 1.15) tailZ = z0 + L * (best + 0.5) / NS;
  }
  return { z0, z1, L, xm, fus, top, top2, twin: TWIN.has(key), tc: Math.max(0.25, fus * 0.2), tailZ, consX: fus + (xm - fus) * (c.consK || 0.65), amp: (xm - fus) * 0.07, delta: !!c.delta, canard: !!c.canard };
}
// рваная граница консоли: не ровный срез, а «клочья» по хорде (крупные) + зубцы (мелкие), верх и низ обшивки — по-разному
const hs = (i) => { const v = Math.sin(i * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
const vn = (t) => { const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f); return hs(i) * (1 - u) + hs(i + 1) * u; };
export function tearX(P, side, y, z) {
  const k = 18 / P.L; // частота — по размеру самолёта
  return P.consX + P.amp * (2 * (vn(z * k * 1.1 + side * 7) - 0.5) + (vn(z * k * 3.7 + y * k * 2 + side * 3) - 0.5) + 0.5 * (vn(z * k * 11 + y * k * 7) - 0.5));
}
export function zoneOf(P, x, y, z, ny = 1) { // ny — |вертикальная доля нормали| треугольника (киль — стоячая поверхность)
  const ax = Math.abs(x);
  if (P.twin && ny < 0.55 && z > P.z0 + P.L * 0.58 && y > P.top2 + 0.1 && ax > P.fus * 0.35 && ax < P.xm * 0.5) return tailSide(P, x); // кили, в том числе от самой спины
  if (z > P.z0 + P.L * 0.5 && y > P.top + Math.max(0.4, P.L * 0.035) && ax < P.xm * 0.45) return tailSide(P, x); // кили (и двойные — на мотогондолах, впереди стабилизаторов)
  if (z > P.tailZ && (P.delta ? y > P.top + 0.15 && ax < P.fus * 1.6 : ax > P.fus * 0.9 || y > P.top + 0.15)) return tailSide(P, x);
  if (ax <= P.fus) return 'body';
  if (P.canard && z < P.z0 + P.L * 0.42 && ax < P.fus + (P.xm - P.fus) * 0.45) return 'body'; // ПГО — часть носа
  return ax > tearX(P, Math.sign(x), y, z) ? (x < 0 ? 'consL' : 'consR') : (x < 0 ? 'wingL' : 'wingR');
}
// режет модель на зоны: у каждого меша — копии по зонам (общие атрибуты, своя выборка треугольников). → { P, parts: зона → [меши] }
export function splitPlane(root, key, meta = null) {
  const P = zoneParams(root, key, meta), parts = Object.fromEntries([...ZONES, 'scarL', 'scarR'].map((z) => [z, []]));
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), m = new THREE.Matrix4(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const meshes = []; root.traverse((o) => { if (o.isMesh && !o.userData.fx) meshes.push(o); }); // пламя сопел и прочие эффекты — не трогаем
  for (const o of meshes) {
    m.multiplyMatrices(inv, o.matrixWorld);
    const g = o.geometry, ck = g.uuid + key;
    let split = CACHE.get(ck);
    if (!split) {
      const pos = g.attributes.position, idx = g.index ? g.index.array : null, n = idx ? idx.length : pos.count, lists = Object.fromEntries(ZONES.map((z) => [z, []]));
      // детали (связанные куски сетки, вершины — по положению, швы развёртки не рвут): небольшая деталь, у которой хотя бы 40 %
      // площади — хвост, целиком в хвост (киль на мотогондоле, стабилизатор не режутся пополам); остальное — по треугольникам
      const T = n / 3, zt = new Uint8Array(T), cxs = new Float32Array(T), area = new Float32Array(T), par = new Int32Array(pos.count), key = new Map(), weld = new Int32Array(pos.count);
      for (let v = 0; v < pos.count; v++) { const k = `${Math.round(pos.getX(v) * 200)},${Math.round(pos.getY(v) * 200)},${Math.round(pos.getZ(v) * 200)}`; let w = key.get(k); if (w === undefined) key.set(k, w = v); weld[v] = w; par[v] = v; }
      const find = (v) => { while (par[v] !== v) { par[v] = par[par[v]]; v = par[v]; } return v; };
      const ZI = ZONES.reduce((o, z, i) => ((o[z] = i), o), {});
      for (let t = 0; t < T; t++) {
        const i0 = idx ? idx[t * 3] : t * 3, i1 = idx ? idx[t * 3 + 1] : t * 3 + 1, i2 = idx ? idx[t * 3 + 2] : t * 3 + 2;
        a.fromBufferAttribute(pos, i0).applyMatrix4(m); b.fromBufferAttribute(pos, i1).applyMatrix4(m); c.fromBufferAttribute(pos, i2).applyMatrix4(m);
        const nrm = b.clone().sub(a).cross(c.clone().sub(a)), ar = nrm.length();
        cxs[t] = (a.x + b.x + c.x) / 3; zt[t] = ZI[zoneOf(P, cxs[t], (a.y + b.y + c.y) / 3, (a.z + b.z + c.z) / 3, ar > 1e-9 ? Math.abs(nrm.y) / ar : 1)];
        area[t] = ar / 2;
        const r0 = find(weld[i0]), r1 = find(weld[i1]), r2 = find(weld[i2]); par[r1] = r0; par[find(r2)] = r0;
      }
      const comp = new Map(); // корень → { n, w: площадь по зонам }
      for (let t = 0; t < T; t++) { const r = find(weld[idx ? idx[t * 3] : t * 3]); let q = comp.get(r); if (!q) comp.set(r, q = { n: 0, w: new Float32Array(ZONES.length) }); q.n++; q.w[zt[t]] += area[t]; }
      for (const q of comp.values()) { const tot = q.w.reduce((x, y) => x + y, 0), tw = q.w[ZI.tailL] + q.w[ZI.tailR] + q.w[ZI.tailC]; q.z = q.n < T * 0.15 && tw >= tot * 0.4 ? -2 : -1; } // −2 — деталь хвоста: каждый треугольник — в хвост своего борта
      // полоса разрыва: треугольники крыла, задевающие границу консоли, дробятся (рваный край — мельче треугольников модели);
      // мелкие — по рваной границе, у самой границы — ещё и тёмная кромка (scar/cut)
      const band = P.amp * 1.8, names = Object.keys(g.attributes), ex = {}, WG = new Set([ZI.wingL, ZI.wingR, ZI.consL, ZI.consR]);
      const exOf = (z) => ex[z] || (ex[z] = Object.fromEntries(names.map((k) => [k, []])));
      // значение атрибута (r128: без getComponent; упакованные целые с normalized — в долях)
      const NORM = (A) => (!A.normalized ? 1 : A.array instanceof Uint8Array ? 1 / 255 : A.array instanceof Uint16Array ? 1 / 65535 : A.array instanceof Int8Array ? 1 / 127 : A.array instanceof Int16Array ? 1 / 32767 : 1);
      const av = (A, i, q) => (A.isInterleavedBufferAttribute ? A.data.array[i * A.data.stride + A.offset + q] : A.array[i * A.itemSize + q]);
      const put = (z, ids, wts) => { const E = exOf(z); for (const k of names) { const A = g.attributes[k], s = A.itemSize, out = E[k], nk = NORM(A); for (let v = 0; v < 3; v++) { const [w0, w1, w2] = wts[v]; for (let q = 0; q < s; q++) out.push((av(A, ids[0], q) * w0 + av(A, ids[1], q) * w1 + av(A, ids[2], q) * w2) * nk); } } };
      const pa = new THREE.Vector3(), pb = new THREE.Vector3(), pc = new THREE.Vector3();
      for (let t = 0; t < T; t++) {
        const i0 = idx ? idx[t * 3] : t * 3, i1 = idx ? idx[t * 3 + 1] : t * 3 + 1, i2 = idx ? idx[t * 3 + 2] : t * 3 + 2, q = comp.get(find(weld[i0])), z = q.z === -2 && !TAILS.has(ZONES[zt[t]]) ? ZI[tailSide(P, cxs[t])] : zt[t];
        if (WG.has(z)) {
          pa.fromBufferAttribute(pos, i0).applyMatrix4(m); pb.fromBufferAttribute(pos, i1).applyMatrix4(m); pc.fromBufferAttribute(pos, i2).applyMatrix4(m);
          const lo = Math.min(Math.abs(pa.x), Math.abs(pb.x), Math.abs(pc.x)), hi = Math.max(Math.abs(pa.x), Math.abs(pb.x), Math.abs(pc.x));
          if (hi > P.consX - band && lo < P.consX + band && Math.sign(pa.x) === Math.sign(pc.x)) {
            const edge = Math.max(pa.distanceTo(pb), pb.distanceTo(pc), pc.distanceTo(pa)), lev = Math.min(5, Math.max(1, Math.ceil(Math.log2(edge / (P.amp * 0.35)))));
            const sub = (w, d) => {
              if (d === 0) {
                const cx = (w[0][0] + w[1][0] + w[2][0]) / 3, cy = (w[0][1] + w[1][1] + w[2][1]) / 3, cz = (w[0][2] + w[1][2] + w[2][2]) / 3;
                const x = pa.x * cx + pb.x * cy + pc.x * cz, y = pa.y * cx + pb.y * cy + pc.y * cz, zz = pa.z * cx + pb.z * cy + pc.z * cz, sd = Math.sign(x) || 1;
                const d0 = Math.abs(x) - tearX(P, sd, y, zz), cons = d0 > 0, L = sd < 0;
                put(ZI[cons ? (L ? 'consL' : 'consR') : (L ? 'wingL' : 'wingR')], [i0, i1, i2], w);
                if (Math.abs(d0) < P.amp * 0.3) put(ZONES.length + SCARS.indexOf(cons ? (L ? 'cutL' : 'cutR') : (L ? 'scarL' : 'scarR')), [i0, i1, i2], w);
                return;
              }
              const m01 = w[0].map((v, i) => (v + w[1][i]) / 2), m12 = w[1].map((v, i) => (v + w[2][i]) / 2), m20 = w[2].map((v, i) => (v + w[0][i]) / 2);
              sub([w[0], m01, m20], d - 1); sub([m01, w[1], m12], d - 1); sub([m20, m12, w[2]], d - 1); sub([m01, m12, m20], d - 1);
            };
            sub([[1, 0, 0], [0, 1, 0], [0, 0, 1]], lev);
            continue;
          }
        }
        lists[ZONES[z]].push(i0, i1, i2);
      }
      split = {};
      for (const z of ZONES) {
        if (!lists[z].length) continue;
        const ng = new THREE.BufferGeometry(); for (const k of names) ng.setAttribute(k, g.attributes[k]);
        ng.setIndex(lists[z]); ng.computeBoundingSphere(); split[z] = ng;
      }
      for (const [zi, E] of Object.entries(ex)) { // дроблёные треугольники полосы разрыва — свои геометрии (без индекса)
        const zn = +zi < ZONES.length ? ZONES[+zi] : SCARS[+zi - ZONES.length], ng = new THREE.BufferGeometry();
        for (const k of names) ng.setAttribute(k, new THREE.Float32BufferAttribute(E[k], g.attributes[k].itemSize, false));
        ng.computeBoundingSphere(); split[zn + '+'] = ng;
      }
      CACHE.set(ck, split);
    }
    const par = o.parent;
    for (const [z0, ng] of Object.entries(split)) {
      const z = z0.replace('+', ''), scar = SCARS.includes(z);
      const q = new THREE.Mesh(ng, scar ? SCAR_MAT : o.material); q.position.copy(o.position); q.quaternion.copy(o.quaternion); q.scale.copy(o.scale);
      q.castShadow = !scar && o.castShadow; q.receiveShadow = o.receiveShadow; q.userData = { ...o.userData, zone: z }; q.name = o.name + ':' + z;
      // кромка разрыва: на обрубке — видна только после отрыва, на консоли — с ней в обломке (на целом крыле её не видно)
      if (scar) { q.visible = false; q.renderOrder = 1; parts[z.startsWith('scar') ? z : z === 'cutL' ? 'consL' : 'consR'].push(q); if (z.startsWith('scar')) q.userData.scar = true; else q.userData.cut = true; }
      else parts[z].push(q);
      par.add(q);
    }
    par.remove(o);
  }
  return { P, parts };
}
