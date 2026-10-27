// Вид повреждений самолёта: модель режется на зоны (plane-zones.js), по состоянию зон (sim/damage.js: a.dz, a.det, a.fire)
// отлетевшая консоль или хвост прячутся на самолёте и падают отдельным обломком (кувыркаются, дымят), из повреждённых зон
// тянется след: серый дым (повреждено), чёрный (сильно), огонь (горит двигатель или бак). Один объект на модель самолёта.
/* global THREE */
import { splitPlane } from './plane-zones.js?v=20261027d';
import { mergeLocal } from './merge.js?v=20261027d';
const W = new THREE.Vector3(), M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3();
const debris = []; // общие для всех самолётов обломки: { g, v, w, t }
const SAMPS = new Map(); // точки обшивки по зонам — по ключу модели (зависят только от геометрии)
// пробоины — в шейдере обшивки (у каждого самолёта — свои копии материалов): в точке попадания обшивка вырезается по рваному
// контуру (сквозная дыра: видно небо и землю, у крыла — насквозь обе обшивки), вокруг — обгоревший край и пятно копоти.
// Точки — в осях модели (uToRoot переводит вершину меша в них; обломок с тем же материалом — дыры на нём те же)
const NH = 12, NS = 16;
// деталь обшивки (дыры и вмятины режут только свою: у корня крыла не прорежут борт, в киле — стабилизатор)
const ZID = { wingL: 1, consL: 1, wingR: 2, consR: 2, tailL: 3, tailR: 4, tailC: 5, body: 6 };
const GS = ['wingL', 'wingR', 'tailL', 'tailR', 'tailC', 'fuel', 'engL', 'engR', 'eng']; // группы пробоин (grp в planeDamageVis)
const GID = (g) => (g === 'wingL' ? 1 : g === 'wingR' ? 2 : g === 'tailL' ? 3 : g === 'tailR' ? 4 : g === 'tailC' ? 5 : 6);
// uHole — сквозные дыры: центр и радиус + uHoleN — ось поперёк обшивки и полглубины (крыло — насквозь, фюзеляж — нет);
// uMark — «условные» пробоины (вмятина: тёмная середина, рваный металл); uScor — копоть
const DMG_GLSL = `uniform vec4 uHole[${NH}], uHoleN[${NH}], uMark[${NH}], uScor[${NS}]; uniform float uHZ[${NH}], uMZ[${NH}], uZid; varying vec3 vMP;
float dh3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float dn3(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dh3(i), dh3(i + vec3(1, 0, 0)), f.x), mix(dh3(i + vec3(0, 1, 0)), dh3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(dh3(i + vec3(0, 0, 1)), dh3(i + vec3(1, 0, 1)), f.x), mix(dh3(i + vec3(0, 1, 1)), dh3(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
`;
function dmgMaterial(src, U, toRoot, zid) {
  const m = src.clone(), prev = src.onBeforeCompile; m.side = THREE.DoubleSide; // изнанка — для глубины в пробоине (в шейдере — только рядом с дырой)
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uHole = U.uHole; sh.uniforms.uHoleN = U.uHoleN; sh.uniforms.uMark = U.uMark; sh.uniforms.uScor = U.uScor; sh.uniforms.uHZ = U.uHZ; sh.uniforms.uMZ = U.uMZ; sh.uniforms.uZid = { value: zid }; sh.uniforms.uToRoot = { value: toRoot };
    sh.vertexShader = 'uniform mat4 uToRoot; varying vec3 vMP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vMP = (uToRoot * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = DMG_GLSL + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  bool inHole = false; if (!gl_FrontFacing) for (int i = 0; i < ${NH}; i++) { vec4 h = uHole[i]; if (h.w > 0.0 && length(vMP - h.xyz) < h.w * 3.0) inHole = true; } // изнанка у дыры — тёмное нутро; в остальном изнанка — как у исходного (двусторонние поверхности моделей: крыло одним листом, у Су-35 и B-2 видно снизу)
  { float burn = 0.0, hot = 0.0;
    for (int i = 0; i < ${NH}; i++) { vec4 h = uHole[i]; if (h.w <= 0.0 || abs(uHZ[i] - uZid) > 0.5) continue;
      vec3 d = vMP - h.xyz, ax = uHoleN[i].xyz; float along = dot(d, ax);       // цилиндр поперёк обшивки
      if (abs(along) > uHoleN[i].w) continue;
      // вход и выход разные: дальняя обшивка — дыра шире и сдвинута (сквозь дыру видно тёмное нутро и кусок неба)
      float sd = clamp(along / max(uHoleN[i].w * 0.35, 0.05), -1.0, 1.0); vec3 sh = normalize(cross(ax, vec3(0.3, 1.0, 0.2))) * h.w * 0.45 * max(sd, 0.0);
      d -= sh; along = dot(d, ax);
      float r = length(d - ax * along) / (h.w * (1.0 + 0.45 * max(sd, 0.0)) * (1.0 - 0.25 * max(-sd, 0.0))), jag = 0.7 + 0.6 * dn3(vMP * (5.0 / h.w)) + 0.25 * dn3(vMP * (17.0 / h.w)), q = r * jag;
      if (q < 1.0) discard;                                                   // сквозная рваная дыра
      burn = max(burn, 1.0 - smoothstep(1.0, 2.2, q)); hot = max(hot, (1.0 - smoothstep(1.0, 1.18, q)) * step(0.5, dn3(vMP * (11.0 / h.w)))); } // задранный металл — клочьями, не ровным кольцом
    for (int i = 0; i < ${NH}; i++) { vec4 h = uMark[i]; if (h.w <= 0.0 || abs(uMZ[i] - uZid) > 0.5) continue; // вмятина: середина почти чёрная, рваный светлый металл вокруг
      float r = length(vMP - h.xyz) / h.w, q = r * (0.65 + 0.7 * dn3(vMP * (4.0 / h.w)) + 0.35 * dn3(vMP * (13.0 / h.w)));
      burn = max(burn, (1.0 - smoothstep(0.6, 1.0, q)) * 0.97 + (1.0 - smoothstep(1.0, 2.2, q)) * 0.5); } // вмятина: рваное тёмное пятно, без ободка
    for (int i = 0; i < ${NS}; i++) { vec4 s = uScor[i]; if (s.w <= 0.0) continue;
      float r = length(vMP - s.xyz) / s.w * (0.65 + 0.7 * dn3(vMP * (2.5 / s.w))); burn = max(burn, (1.0 - smoothstep(0.1, 1.0, r)) * 0.92); }
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.035, 0.03, 0.025), burn); // копоть, обгоревший край
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.24, 0.22, 0.2), hot * 0.55);
    if (inHole) diffuseColor.rgb = vec3(0.05, 0.045, 0.04); } // изнанка обшивки у пробоины — тёмное нутро`);
  };
  m.customProgramCacheKey = () => (prev ? String(prev) : '') + 'dmgholes';
  return m;
}

// куски зон — в одну сетку (2026-10-23, нагрев телефонов): splitPlane режет каждую деталь модели на куски по зонам — у F/A-18 выходило
// 104 сетки, то есть 104 вызова отрисовки и ещё 83 в тенях. Куски одной зоны с одним материалом, видимостью и тенью сливаются в одну сетку
// в осях модели (только использованные вершины); выглядит так же. Не трогаем: стекло, прозрачное, вращающиеся и двигающиеся части
// (винты, крылья), эффекты. Слитая геометрия — общая для всех самолётов той же модели (MERGED)
const MERGED = new Map(), MM4 = new THREE.Matrix4();
function mergeZones(root, parts, key) {
  root.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const moving = (o) => { for (let p = o.parent; p && p !== root; p = p.parent) if (p.userData.spin || p.userData.wa || p.userData.fx || p.userData.wings) return true; return false; };
  for (const z of Object.keys(parts)) {
    const by = new Map(), keep = [];
    for (const q of parts[z]) {
      if (q.userData.glass || q.userData.fx || moving(q) || !q.material || Array.isArray(q.material) || q.material.transparent) { keep.push(q); continue; }
      const k = `${q.material.uuid}|${q.visible ? 1 : 0}${q.castShadow ? 1 : 0}${q.receiveShadow ? 1 : 0}|${q.renderOrder}|${q.userData.cut ? 1 : 0}${q.userData.scar ? 1 : 0}`;
      (by.get(k) || by.set(k, []).get(k)).push(q);
    }
    for (const L of by.values()) {
      if (L.length < 2) { keep.push(...L); continue; }
      const ck = key + '|' + z + '|' + L.map((q) => q.geometry.uuid).join(','); let g = MERGED.get(ck);
      if (!g) { g = mergeLocal(L.map((q) => ({ g: q.geometry, m: MM4.multiplyMatrices(inv, q.matrixWorld).clone() }))); MERGED.set(ck, g); }
      const s = L[0], mm = new THREE.Mesh(g, s.material);
      mm.castShadow = s.castShadow; mm.receiveShadow = s.receiveShadow; mm.renderOrder = s.renderOrder; mm.visible = s.visible; mm.userData = { ...s.userData }; mm.name = 'zone:' + z;
      root.add(mm); for (const q of L) if (q.parent) q.parent.remove(q); keep.push(mm);
    }
    parts[z] = keep;
  }
}

// точки следа из зон — середина обшивки (по площади треугольников) крыла с консолью и хвоста; бак — между ними по оси.
// 2026-10-25 (Mark: дым «на какой-то стороне удаленней или наоборот далеко от самолета»): были по габаритам — над крылом на высоте
// спины, хвост — на метр выше киля, а у низкоплана и стреловидного крыла середина полуразмаха на 55 % длины — вовсе мимо крыла
const ZPTS = new Map(); // по ключу модели
function zonePoints(root, parts, P) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), mm = new THREE.Matrix4(), A = new THREE.Vector3(), B = new THREE.Vector3(), Cc = new THREE.Vector3(), N = new THREE.Vector3();
  const mid = (zs) => {
    const s = new THREE.Vector3(); let w = 0;
    for (const z of zs) for (const msh of parts[z] || []) {
      if (msh.userData.scar || msh.userData.cut) continue;
      mm.multiplyMatrices(inv, msh.matrixWorld); const pos = msh.geometry.attributes.position, ix = msh.geometry.index ? msh.geometry.index.array : null, n = ix ? ix.length : pos.count;
      for (let t = 0; t < n; t += 3 * Math.max(1, Math.floor(n / 30000))) {
        A.fromBufferAttribute(pos, ix ? ix[t] : t).applyMatrix4(mm); B.fromBufferAttribute(pos, ix ? ix[t + 1] : t + 1).applyMatrix4(mm); Cc.fromBufferAttribute(pos, ix ? ix[t + 2] : t + 2).applyMatrix4(mm);
        const cx = (A.x + B.x + Cc.x) / 3, cy = (A.y + B.y + Cc.y) / 3, cz = (A.z + B.z + Cc.z) / 3, ar = N.crossVectors(B.sub(A), Cc.sub(A)).length();
        s.x += cx * ar; s.y += cy * ar; s.z += cz * ar; w += ar;
      }
    }
    return w > 0 ? s.divideScalar(w) : null;
  };
  const wy = P.top - 0.4, wx = (P.fus + P.xm) / 2, zm = P.z0 + P.L * 0.55; // зоны нет (модель без крыла) — как раньше, по габаритам
  const wingL = mid(['wingL', 'consL']) || new THREE.Vector3(-wx, wy, zm), wingR = mid(['wingR', 'consR']) || new THREE.Vector3(wx, wy, zm);
  const tail = mid(['tailL', 'tailR', 'tailC']) || new THREE.Vector3(0, P.top, P.tailZ + 0.5);
  return { wingL, wingR, tail, fuel: new THREE.Vector3(0, (wingL.y + wingR.y) / 2, (wingL.z + wingR.z) / 2) };
}

export function planeDamageVis(scene, root, key, meta, fxOf) { // fxOf — эффекты боя (или функция, которая их вернёт: создаются позже модели)
  const FX = () => (typeof fxOf === 'function' ? fxOf() : fxOf);
  const { P, parts } = splitPlane(root, key, meta);
  mergeZones(root, parts, key);
  // точки следа (оси модели): крылья и хвост — середина обшивки своей зоны (zonePoints), двигатели — сопла по бортам, бак — между корнями крыльев
  const Z = ZPTS.get(key) || ZPTS.set(key, zonePoints(root, parts, P)).get(key);
  const nz = (meta && meta.nozzles) || [], side = (s) => { const L = nz.filter((n) => Math.sign(n.x || 0.0001) === s); return L.length ? L.reduce((p, n) => p.add(n), new THREE.Vector3()).divideScalar(L.length) : null; };
  const eng0 = nz.length ? nz.reduce((p, n) => p.add(n), new THREE.Vector3()).divideScalar(nz.length) : new THREE.Vector3(0, Z.fuel.y, P.z1 - 1);
  const PT = { wingL: Z.wingL, wingR: Z.wingR, tail: Z.tail, engL: side(-1) || eng0, engR: side(1) || eng0, eng: eng0, fuel: Z.fuel };
  // пробоины: точки на обшивке зон (по площади), сколько видно — по целостности зоны (больше попаданий — больше дыр)
  // точки обшивки для пробоин — одни на модель и только с первой пробоины (2026-10-22: у каждого самолёта налёта строились сразу ~10 тыс.
  // треугольников клонами Vector3 — ≈ 20 МБ мусора и паузы сборщика на телефоне). Строятся до отрыва частей в том же sync — оси модели целые
  const holes = {}; let SAMP = null;
  const samp = () => { if (!SAMP) { SAMP = SAMPS.get(key); if (!SAMP) { SAMP = buildSamp(); SAMPS.set(key, SAMP); } } return SAMP; };
  function buildSamp() {
    const SAMP = {};
    const A = new THREE.Vector3(), B = new THREE.Vector3(), Cc = new THREE.Vector3(), Nn = new THREE.Vector3(), inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), mm = new THREE.Matrix4();
    const grp = (z, cx, cz) => (z === 'consL' || z === 'wingL' ? 'wingL' : z === 'consR' || z === 'wingR' ? 'wingR' : z.startsWith('tail') ? z : cz > P.z0 + P.L * 0.75 ? (cx < -0.1 ? 'engL' : cx > 0.1 ? 'engR' : 'eng') : cz > P.z0 + P.L * 0.35 ? 'fuel' : null);
    root.updateMatrixWorld(true);
    for (const [z, list] of Object.entries(parts)) for (const msh of list) {
      if (msh.userData.scar || msh.userData.cut) continue;
      mm.multiplyMatrices(inv, msh.matrixWorld); const gm = msh.geometry, pos = gm.attributes.position, ix = gm.index ? gm.index.array : null, n = ix ? ix.length : pos.count;
      for (let t = 0; t < n; t += 3 * Math.max(1, Math.floor(n / 30000))) {
        A.fromBufferAttribute(pos, ix ? ix[t] : t).applyMatrix4(mm); B.fromBufferAttribute(pos, ix ? ix[t + 1] : t + 1).applyMatrix4(mm); Cc.fromBufferAttribute(pos, ix ? ix[t + 2] : t + 2).applyMatrix4(mm);
        Nn.copy(B).sub(A).cross(Cc.clone().sub(A)); const ar = Nn.length(); if (ar < 1e-4) continue;
        const g = grp(z, (A.x + B.x + Cc.x) / 3, (A.z + B.z + Cc.z) / 3); if (!g) continue;
        const ctr = A.clone().add(B).add(Cc).divideScalar(3), rr = Math.max(ctr.distanceTo(A), ctr.distanceTo(B), ctr.distanceTo(Cc)) + P.L * 0.06;
        (SAMP[g] = SAMP[g] || []).push([A.clone(), B.clone(), Cc.clone(), Nn.divideScalar(ar).clone(), ar, ctr, rr * rr]);
      }
    }
    return SAMP;
  }
  // материалы обшивки — свои у самолёта, с пробоинами (вырез + копоть); точки пробоин — общие uniform на все меши
  const V4 = (n) => ({ value: Array.from({ length: n }, () => new THREE.Vector4()) });
  const U = { uHole: V4(NH), uHoleN: V4(NH), uMark: V4(NH), uScor: V4(NS), uHZ: { value: new Array(NH).fill(0) }, uMZ: { value: new Array(NH).fill(0) } };
  {
    const invR = new THREE.Matrix4().copy(root.matrixWorld).invert(), cache = new Map();
    for (const list of Object.values(parts)) for (const msh of list) {
      if (msh.userData.scar || msh.userData.cut || msh.userData.glass || !msh.material || msh.material.isShaderMaterial) continue;
      const k = msh.material.uuid + ':' + msh.uuid, tr = new THREE.Matrix4().multiplyMatrices(invR, msh.matrixWorld);
      msh.material = dmgMaterial(msh.material, U, tr, ZID[msh.userData.zone] || 6); cache.set(k, msh.material);
    }
  }
  // новая пробоина в зоне g: точка на обшивке (по площади), дыра + пятно копоти вокруг
  // точка на обшивке, вокруг которой по всему кругу (с запасом) есть обшивка своей детали: не на кромке, законцовке, стыке
  const onSurf = (L, q, tol) => { for (const t of L) { if (t[5].distanceToSquared(q) > t[6]) continue; const d = q.clone().sub(t[0]).dot(t[3]); if (Math.abs(d) > tol) continue;
    const pp = q.clone().addScaledVector(t[3], -d), v0 = t[1].clone().sub(t[0]), v1 = t[2].clone().sub(t[0]), v2 = pp.sub(t[0]);
    const d00 = v0.dot(v0), d01 = v0.dot(v1), d11 = v1.dot(v1), d20 = v2.dot(v0), d21 = v2.dot(v1), den = d00 * d11 - d01 * d01; if (Math.abs(den) < 1e-12) continue;
    const v = (d11 * d20 - d01 * d21) / den, w = (d00 * d21 - d01 * d20) / den; if (v >= -0.02 && w >= -0.02 && v + w <= 1.02) return true; } return false; };
  const holeAt = (g) => {
    const L = samp()[g]; if (!L || !L.length) return null;
    let tot = 0; for (const t of L) tot += t[4];
    const small = g === 'fuel' || g.startsWith('eng');
    for (let tries = 0; tries < 24; tries++) {
      let r = Math.random() * tot, T = L[0]; for (const t of L) { r -= t[4]; if (r <= 0) { T = t; break; } }
      let u = Math.random(), v = Math.random(); if (u + v > 1) { u = 1 - u; v = 1 - v; }
      const p = T[0].clone().addScaledVector(T[1].clone().sub(T[0]), u).addScaledVector(T[2].clone().sub(T[0]), v);
      const hr = P.L * (small ? 0.012 : 0.018) * (0.6 + Math.random() * 0.8), n = T[3];
      if (Object.values(holes).flat().some((h) => h.p.distanceTo(p) < (h.hr + hr) * 1.8)) continue; // не друг на друге
      // кольцо вокруг (в плоскости обшивки, 1,6 радиуса): каждая точка — на обшивке своей детали
      const a = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0), t1 = a.cross(n).normalize(), t2 = n.clone().cross(t1);
      let ok = true; for (let k = 0; k < 8 && ok; k++) { const ang = k / 8 * Math.PI * 2; ok = onSurf(L, p.clone().addScaledVector(t1, Math.cos(ang) * hr * 1.6).addScaledVector(t2, Math.sin(ang) * hr * 1.6), hr * 0.35); }
      if (!ok) continue;
      // половина — сквозные дыры (ось — нормаль обшивки, глубина ~1 м: крыло насквозь, фюзеляж — нет), половина — вмятины
      return { g, p, hr, sr: hr * (3.2 + Math.random() * 2), n: n.clone(), real: Math.random() < 0.5, depth: Math.max(0.6, P.L * 0.045) };
    }
    return null;
  };
  const writeHoles = () => { // все пробоины самолёта → uniform (не влезли — только копоть)
    const all = Object.values(holes).flat(); let ih = 0, im = 0, is = 0;
    for (const h of all) {
      if (h.real && ih < NH) { U.uHZ.value[ih] = GID(h.g); U.uHole.value[ih].set(h.p.x, h.p.y, h.p.z, h.hr); U.uHoleN.value[ih++].set(h.n.x, h.n.y, h.n.z, h.depth); }
      else if (!h.real && im < NH) { U.uMZ.value[im] = GID(h.g); U.uMark.value[im++].set(h.p.x, h.p.y, h.p.z, h.hr); }
      if (is < NS) U.uScor.value[is++].set(h.p.x, h.p.y, h.p.z, h.sr);
    }
    for (; ih < NH; ih++) U.uHole.value[ih].w = 0; for (; im < NH; im++) U.uMark.value[im].w = 0; for (; is < NS; is++) U.uScor.value[is].w = 0;
  };
  const want = (a, g) => { const D = a.dz; if (!D) return 0;
    const v = g === 'wingL' ? D.wingL : g === 'wingR' ? D.wingR : g.startsWith('tail') ? D.tail : g === 'fuel' ? D.fuel : g === 'engL' ? D.eng[0] : g === 'engR' ? (D.eng[1] ?? D.eng[0]) : D.eng[0];
    const max = g.startsWith('wing') ? 6 : g === 'fuel' ? 4 : g.startsWith('tail') ? 3 : 3; return v >= 0.95 ? 0 : Math.min(max, Math.ceil((1 - v) * max)); }; // всего: до 12 дыр, 12 вмятин и 16 пятен копоти
  const shown = { consL: true, consR: true, tailL: true, tailR: true, tailC: true };
  const gone = (a, z) => !!(a.det && (z === 'tailC' ? a.det.tailAll : a.det[z])); // середина хвоста (одиночный киль) — только со всем хвостом
  let acc = 0;
  const api = {
    P, parts, PT,
    // показать/спрятать отлетающие части по состоянию (новый вылет — всё на месте)
    sync(a) {
      // пробоины: по целостности зон (новый вылет — ни одной)
      let ch = false;
      if (SAMP || GS.some((g) => want(a, g) > 0)) for (const g of Object.keys(samp())) { // целый самолёт — точки обшивки не нужны
        const L = holes[g] || (holes[g] = []), n = want(a, g);
        while (L.length > n) { L.pop(); ch = true; }
        while (L.length < n) { const h = holeAt(g); if (!h) break; L.push(h); ch = true; }
      }
      if (ch) writeHoles();
      for (const z of ['consL', 'consR', 'tailL', 'tailR', 'tailC']) {
        const g = gone(a, z), cons = z === 'consL' || z === 'consR';
        if (g && shown[z]) api.detach(z, a);
        else if (!g && !shown[z]) { for (const m of parts[z]) m.visible = !m.userData.cut; if (cons) for (const m of parts[z === 'consL' ? 'scarL' : 'scarR']) m.visible = false; shown[z] = true; }
      }
    },
    detach(z, a) {
      if (!shown[z] || !parts[z].length) { shown[z] = false; return; }
      shown[z] = false; (root.parent || root).updateMatrixWorld(true); // с группы самолёта: в кадре её создания matrixWorld ещё единичная (ревью 2026-10-25)
      const cons = z === 'consL' || z === 'consR';
      if (cons) for (const m of parts[z === 'consL' ? 'scarL' : 'scarR']) m.visible = true; // опалённая рваная кромка на обрубке
      { const F = FX(); if (F && F.explosion) { const sg = z === 'consL' ? -1 : 1; F.explosion(root.localToWorld(cons ? new THREE.Vector3(sg * P.consX, P.top, P.z0 + P.L * 0.55) : new THREE.Vector3(z === 'tailL' ? -P.fus : z === 'tailR' ? P.fus : 0, P.top, P.tailZ)), 4, 'air'); } } // хлопок и искры в месте разрыва
      // подвески на оторванной консоли (соседи модели в группе самолёта) — пропадают вместе с ней
      if (cons && root.parent) { const sg = z === 'consL' ? -1 : 1; for (const c of root.parent.children) if (c !== root && c.position.x * sg > P.consX * 0.92) c.visible = false; }
      const g = new THREE.Group();
      for (const m of parts[z]) { const c = new THREE.Mesh(m.geometry, m.material); M4.copy(m.matrixWorld); M4.decompose(c.position, c.quaternion, c.scale); g.add(c); m.visible = false; }
      // обломок — в центре своей части (крутится вокруг себя), скорость самолёта + отброс в сторону и вверх
      const bb = new THREE.Box3().setFromObject(g), ctr = bb.getCenter(new THREE.Vector3());
      for (const c of g.children) c.position.sub(ctr);
      g.position.copy(ctr); scene.add(g);
      const out = new THREE.Vector3(z === 'consL' || z === 'tailL' ? -1 : z === 'consR' || z === 'tailR' ? 1 : 0, 0.4, cons ? 0 : 1).applyQuaternion(root.getWorldQuaternion(Q));
      debris.push({ g, v: (a && a.vel ? a.vel.clone().multiplyScalar(0.85) : new THREE.Vector3()).addScaledVector(out, 12 + Math.random() * 10), w: new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 8), t: 0, fx: FX() });
    },
    // след из зон: a — самолёт (dz, fire, vel), wind — ветер; частицы — по пройденному пути
    update(dt, a, wind) {
      const fx = FX(); if (!a.dz || !fx || !fx.zoneTrail) return;
      // шаг — меньше молодого клуба (fx.trailStep: 2,5 м, на телефонных пресетах 3,5), остаток пути переносится; за кадр — до 4 клубов,
      // вдоль пройденного отрезка (2026-10-24: раз в 5 м и с потерей остатка при 30 к/с выходило 6–8 м — след вдали рассыпался «бусинами»)
      const STEP = fx.trailStep || 5; acc += (a.speed || 0) * dt; if (acc < STEP) return;
      // больше 4 шагов за кадр (быстро и мало кадров) — 4 клуба на весь пройденный отрезок, а не на последние 7,5 м (ревью 2026-10-24: просветы в следе)
      const n = Math.min(4, Math.floor(acc / STEP)), gap = n === 4 ? acc / 4 : STEP, back = acc - gap; acc = n === 4 ? 0 : acc - n * STEP;
      (root.parent || root).updateMatrixWorld(true); // с группы самолёта: её положение на этот кадр уже выставлено, а matrixWorld — ещё с прошлой отрисовки
      const sp = Math.max(1, a.vel ? a.vel.length() : 0), D = a.dz;
      const emit = (pt, v, kind) => { for (let i = 0; i < n; i++) { W.copy(pt).applyMatrix4(root.matrixWorld); if (a.vel) W.addScaledVector(a.vel, -Math.min(back, (n - 1 - i) * gap) / sp); fx.zoneTrail(W, a.vel, wind, kind, v); } };
      const z = (v, pt, burn) => { if (v < 0.75) emit(pt, 1 - v, burn ? 2 : v < 0.35 ? 1 : 0); };
      z(D.wingL, PT.wingL); z(D.wingR, PT.wingR); z(D.tail, PT.tail);
      if (D.eng.length > 1) { z(D.eng[0], PT.engL, a.fire === 1 && D.eng[0] < 0.3); z(D.eng[1], PT.engR, a.fire === 1 && D.eng[1] < 0.3); } else z(D.eng[0], PT.eng, a.fire === 1);
      if (a.fire === 2 || D.fuel < 0.7) emit(PT.fuel, 1 - D.fuel, a.fire === 2 ? 2 : 3); // течь бака — белёсый шлейф (3; было тем же серым дымом), пожар — огонь
    },
  };
  return api;
}
// обломки: падают, кувыркаются, дымят; у земли (или через 14 с) — пропадают
export function updateDebris(scene, dt, groundAt, wind) {
  for (let i = debris.length - 1; i >= 0; i--) {
    const d = debris[i]; d.t += dt;
    d.v.y -= 9.8 * dt; d.v.multiplyScalar(1 - 0.25 * dt); d.g.position.addScaledVector(d.v, dt);
    d.g.rotation.x += d.w.x * dt; d.g.rotation.y += d.w.y * dt; d.g.rotation.z += d.w.z * dt;
    if (d.fx && d.fx.zoneTrail && Math.random() < 0.6) d.fx.zoneTrail(d.g.position, d.v, wind, 1, 0.5);
    if (d.t > 14 || d.g.position.y < groundAt(d.g.position.x, d.g.position.z)) { scene.remove(d.g); debris.splice(i, 1); }
  }
}
export function clearDebris(scene) { for (const d of debris) scene.remove(d.g); debris.length = 0; SAMPS.clear(); } // и точки обшивки (≈ 3–4 МБ на тип) — новый бой строит заново при первой пробоине
