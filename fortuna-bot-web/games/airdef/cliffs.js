// Обрывы (Mark 2026-11-25: «добавить такие обрывы для всех трёх карт в уместных местах»): на крутых склонах - уступ с почти отвесной стенкой:
// лёссовой в городе и на топи, скальной на «Северном рубеже». Только вид: рельеф симуляции (city.groundH) не меняется, машины на крутых местах и так
// не ставятся. Места - сами по крутизне (одинаковы у всех: только от зерна карты), в стороне от дорог, домов, воды и объектов; вдоль горизонтали.
// Уступ: верх - материал земли (стыка с лугом нет), лицо - свой (глина / камень, три проекции), осыпь у подножия - снова земля; верх и осыпь - в высоте G.meshH
// (деревья, трава, машины стоят на них).
/* global THREE */
import { ktxLoad, ktxOn } from './ktx.js?v=20261124a';
import { CITY, mulberry32, smooth, clamp } from './city.js?v=20261124a';
import { noiseTex } from './noise-tex.js?v=20261124a';
export const CLIFF_ON = typeof location !== 'undefined' && !/[?&]cliff=0/.test(location.search);
const CFG = { city: { H0: 8400, s0: 0.33, gap: 210, max: 30, h: [7, 17], L: [80, 240] }, autumn: { H0: 9800, s0: 0.32, gap: 300, max: 60, h: [7, 18], L: [80, 260] }, winter: { H0: 11500, s0: 0.5, gap: 380, max: 90, h: [10, 24], L: [80, 280] } };
const hash2 = (i, j) => { const v = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return v - Math.floor(v); };
const ln2 = (x, y) => { const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j; return u + v < 1 ? hash2(i, j) + (hash2(i + 1, j) - hash2(i, j)) * u + (hash2(i, j + 1) - hash2(i, j)) * v : hash2(i + 1, j + 1) + (hash2(i, j + 1) - hash2(i + 1, j + 1)) * (1 - u) + (hash2(i + 1, j) - hash2(i + 1, j + 1)) * (1 - v); }; // грани вместо волн - для камня
const vn2 = (x, y) => { const i = Math.floor(x), j = Math.floor(y); let u = x - i, v = y - j; u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v); return (hash2(i, j) * (1 - u) + hash2(i + 1, j) * u) * (1 - v) + (hash2(i, j + 1) * (1 - u) + hash2(i + 1, j + 1) * u) * v; };
export function createCliffs({ scene, city, gh, P, sh, ground, winter, waterY, snow = 1 }) {
  const T0 = typeof performance !== 'undefined' ? performance.now() : 0, kind = city.kind, K = CFG[kind]; if (!CLIFF_ON || !K || !(P.bldNear > 0)) return null;
  const rnd = mulberry32(city.seed * 31 + 17), STEP = kind === 'winter' ? 1.8 : 1.5, sites = [];
  // запретные клетки 25 м: дороги и рельсы (полилинии), площадки
  const BC = 25, bad = new Set(), bk = (x, z) => Math.floor(x / BC) * 4096 + Math.floor(z / BC), mark = (x, z, r) => { for (let a = -r; a <= r; a += BC * 0.8) for (let b = -r; b <= r; b += BC * 0.8) bad.add(bk(x + a, z + b)); };
  for (const r of city.roads || []) if (r.pts) for (let k = 0; k < r.pts.length - 1; k++) { const [ax, az] = r.pts[k], [bx, bz] = r.pts[k + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / BC)); for (let q = 0; q <= n; q++) mark(ax + (bx - ax) * q / n, az + (bz - az) * q / n, (r.w || 8) / 2 + 30); }
  const obs = city.objects.map((o) => [o.x, o.z, (o.w || 100) / 2 + 130, (o.d || 100) / 2 + 130]).concat((city.pads || []).map((p) => [p.x, p.z, (p.hx || 50) + (p.m || 40), (p.hz || 50) + (p.m || 40)]));
  const free = (x, z) => { if (Math.abs(x) > CITY.HALF - 1500 || Math.abs(z) > CITY.HALF - 1500 || bad.has(bk(x, z)) || city.bldAt(x, z) > 0) return false; for (const [ox, oz, w, d] of obs) if (Math.abs(x - ox) < w && Math.abs(z - oz) < d) return false; if (city.onRoad && city.onRoad(x, z, 14)) return false; if (city.waterAt && city.waterAt(x, z)) return false; if (city.iceAt && city.iceAt(x, z)) return false; return gh(x, z) > waterY + 1.5; };
  const houseFree = (x, z) => { for (let a = 0; a < 8; a++) if (city.bldAt(x + Math.cos(a * 0.785) * 16, z + Math.sin(a * 0.785) * 16) > 0) return false; return true; };
  const grad = (x, z, e = 24) => { const a = (gh(x + e, z) - gh(x - e, z)) / (2 * e), b = (gh(x, z + e) - gh(x, z - e)) / (2 * e); return [a, b, Math.hypot(a, b)]; };
  // кандидаты: круче - раньше, но с разбросом
  const cand = []; for (let x = -K.H0; x < K.H0; x += 60) for (let z = -K.H0; z < K.H0; z += 60) { const px = x + rnd() * 60, pz = z + rnd() * 60, s = grad(px, pz)[2], q = rnd(); if (s > K.s0 && s < 1.25) cand.push([px, pz, Math.min(s, K.s0 * 1.7) * (0.6 + 0.8 * q)]); }
  cand.sort((a, b) => b[2] - a[2]);
  for (const [cx, cz] of cand) {
    if (sites.length >= K.max) break; if (sites.some((s) => Math.hypot(s.x - cx, s.z - cz) < K.gap + s.R * 0.6)) continue; if (!free(cx, cz)) continue;
    const H = K.h[0] + (K.h[1] - K.h[0]) * Math.pow(rnd(), 1.3), L = K.L[0] + (K.L[1] - K.L[0]) * rnd(), ph = rnd() * 500, walk = (dir) => { const out = []; let x = cx, z = cz; for (let s = STEP; s < L / 2; s += STEP) { const [a, b, g] = grad(x, z); if (g < K.s0 * 0.72 || g > 1.5) break; x += -b / g * STEP * dir; z += a / g * STEP * dir; if (!free(x, z) || !free(x - a / g * H * 1.4, z - b / g * H * 1.4) || !free(x + a / g * H * 1.6, z + b / g * H * 1.6) || !houseFree(x, z)) break; out.push([x, z]); } return out; };
    const pts = walk(-1).reverse().concat([[cx, cz]], walk(1)); if (pts.length * STEP < 45) continue;
    // станции: сглаженная линия, нормаль в гору, высота стенки с сужением к концам
    for (let it = 0; it < 24; it++) for (let i = 1; i < pts.length - 1; i++) { pts[i] = [(pts[i - 1][0] + pts[i][0] * 2 + pts[i + 1][0]) / 4, (pts[i - 1][1] + pts[i][1] * 2 + pts[i + 1][1]) / 4]; }
    const n = pts.length, st = []; let ok = true;
    for (let i = 0; i < n && ok; i++) { const a = pts[Math.max(0, i - 4)], b = pts[Math.min(n - 1, i + 4)]; let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l; const [ga, gb] = grad(pts[i][0], pts[i][1]); let nx = -tz, nz = tx; if (nx * ga + nz * gb < 0) { nx = -nx; nz = -nz; }
      const V = kind === 'winter' ? ln2 : vn2, t = i * STEP, e = Math.min(t, (n - 1) * STEP - t), gu = Math.pow(clamp(1 - Math.abs(V(t / 13 + ph, 6.6) - 0.5) * 7, 0, 1), 1.5), w = (V(t / 19 + ph, 3.3) - 0.5) * 7 + (V(t / 6 + ph, 8.1) - 0.5) * 2.6 + (V(t / 2.3 + ph, 9.7) - 0.5) * 1.3 + (kind === 'winter' ? (hash2(Math.floor(t / 7.5 + ph), 12) - 0.5) * 4.5 : gu * H * 0.22), x = pts[i][0] + nx * w, z = pts[i][1] + nz * w;
      let h = H * (0.5 + 0.75 * V(t / 33 + ph, 1.7) + 0.22 * (V(t / 5 + ph, 5.2) - 0.5)) * (kind === 'winter' ? 0.82 + 0.36 * hash2(Math.floor(t / 7.5 + ph), 31) : 1 - 0.3 * gu) * smooth(0, 26, e), g0 = gh(x, z), W = 0;
      for (let tr = 0; tr < 5; tr++) { W = 0; const yl = g0 + h; while (W < 62 && gh(x + nx * W, z + nz * W) < yl + 0.07 * W) W += 1.5; if (W < 60) break; h *= 0.7; }
      if (W >= 60) { h = 0; W = 2; } st.push({ x, z, nx, nz, h, g0, W: Math.max(1.5, W), t }); }
    for (let it = 0; it < 3; it++) for (let i = 1; i < n - 1; i++) st[i].W = (st[i - 1].W + 2 * st[i].W + st[i + 1].W) / 4 + 0.3;
    if (Math.max(...st.map((q) => q.h)) < 4) continue;
    sites.push({ x: cx, z: cz, R: n * STEP / 2 + 60, st, ph });
  }
  if (!sites.length) return null;
  // профиль: верх уступа (d < 0 - в гору) и осыпь (d > 0)
  const tal = (q, d) => { const u = d / (q.h * 1.15 + 0.5); return u >= 1 ? -1 : q.h * 0.3 * Math.pow(1 - Math.max(0, u), 1.7) * (0.65 + 0.7 * vn2(q.t / 7, 4.4)); };
  const yTop = (q, d, x, z, b) => { const f = clamp(1 + d / q.W, 0, 1), gW = gh(q.x + q.nx * q.W, q.z + q.nz * q.W); return Math.max(gW + (q.g0 + q.h - gW) * f + (vn2(x / 5, z / 5) - 0.5) * 0.5 * f * Math.min(1, q.h / 4), b + 0.1 * smooth(0, 0.15, f)); };
  const CELL = 64, gridS = new Map(); sites.forEach((s, i) => { for (let x = Math.floor((s.x - s.R - 60) / CELL); x <= Math.floor((s.x + s.R + 60) / CELL); x++) for (let z = Math.floor((s.z - s.R - 60) / CELL); z <= Math.floor((s.z + s.R + 60) / CELL); z++) { const k = x * 4096 + z; if (!gridS.has(k)) gridS.set(k, []); gridS.get(k).push(i); } });
  const topH = (x, z, b) => { const c = gridS.get(Math.floor(x / CELL) * 4096 + Math.floor(z / CELL)); if (!c) return -1e9; let r = -1e9; for (const i of c) { const s = sites[i]; let best = null, bd = STEP * 0.75; for (const q of s.st) { if (q.h < 0.5) continue; const dx = x - q.x, dz = z - q.z, al = Math.abs(dx * -q.nz + dz * q.nx); if (al < bd) { const d = -(dx * q.nx + dz * q.nz); if (d > -q.W && d < q.h * 1.2 + 1) { bd = al; best = [q, d]; } } } if (best) { const [q, d] = best; r = Math.max(r, d <= -0.7 ? yTop(q, d, x, z, b) : b + Math.max(0, tal(q, Math.max(d, q.h * 0.2)))); } } return r; };
  // ── сетки ──
  const rock = kind === 'winter', NT = 9, NF = rock ? 22 : 16, NA = 6, foot = [];
  const build = (s) => {
    const n = s.st.length, g = { p: [], uv: [], i: [] }, f = { p: [], c: [], i: [] }, U2 = (x) => (x + CITY.HALF) / (2 * CITY.HALF);
    const gv = (x, y, z) => { g.p.push(x, y, z); g.uv.push(U2(x), U2(z)); };
    for (const q of s.st) {
      const on = Math.min(1, q.h / 1.2), yl = q.g0 + q.h, at = (d) => [q.x - q.nx * d, q.z - q.nz * d], base = q.h * 0.2, [bx, bz] = at(base), [fx, fz] = at(base + 4), yb = Math.min(gh(bx, bz), gh(fx, fz)) - 1.2;
      for (let k = 0; k < NT; k++) { const d = -q.W * (1 - Math.pow(k / (NT - 1), 0.8)), [x, z] = at(d), b = gh(x, z); gv(x, (k === 0 ? b - 0.35 : yTop(q, d, x, z, b)) - (1 - on) * 0.5, z); }
      for (let k = 0; k < NA; k++) { const u = k / (NA - 1), d = base * 0.4 + (q.h * 1.15 + 0.6) * u * 1.02, [x, z] = at(d), b = gh(x, z); gv(x, b + (k === NA - 1 ? -0.4 : Math.max(-0.2, tal(q, d))) - (1 - on) * 0.6, z); }
      const last = g.p.length / 3 - NA - 1, y0 = g.p[last * 3 + 1];
      for (let k = 0; k < NF; k++) {
        const v = k / (NF - 1), y = y0 - v * (y0 - yb), up = y - yb, e = Math.min(1, v * 4) * (1 - 0.5 * smooth(0.75, 1, v)) * on;
        let dsp, lay0 = 0; if (rock) { // уступы пластов, блоки и трещины - гранями
          const lay = y / 3.4 + ln2(q.t / 40, 2.2) * 2 + (q.x + q.z) * 0.01, li = Math.floor(lay), fr = lay - li, bl = hash2(Math.floor(q.t / 5.4 + hash2(li, 7) * 3), li); dsp = (bl - 0.45) * 1.7 + (fr > 0.8 ? -0.9 : 0) + (ln2(q.t / 13, y / 11) - 0.5) * 5 + (ln2(q.t / 4.5 + 9, y / 4) - 0.5) * 2.0 + (ln2(q.t / 1.8, y / 1.5) - 0.5) * 0.7;
        } else dsp = (vn2(q.t / 12 + s.ph, y / 18) - 0.5) * 5 + (Math.abs(vn2(q.t / 4.2 + s.ph, y / 13) - 0.5) * 2 - 0.45) * 2.4 + (vn2(q.t / 6, y / 1.7) - 0.5) * 1.0 + (vn2(q.t / 1.9, y / 1.4) - 0.5) * 0.5; // промоины сверху вниз, мягкие пласты
        const d = base * Math.pow(v, 1.25) + dsp * e * Math.min(1, q.h / 6), [x, z] = at(d);
        f.p.push(x, y, z); const ao = clamp(0.8 + dsp * 0.13 + 0.1 * smooth(0, 3, up), 0.5, 1) * (1 - 0.22 * (1 - smooth(0, 0.12, v))); f.c.push(ao, clamp(1 - (y0 - y) / 2, 0, 1) * on, 0);
      }
      if (rnd() < 0.3 * on && q.h > 3) { const d = base + q.h * (0.1 + 0.9 * rnd() * rnd()) + 1, [x, z] = at(d); foot.push([x + (rnd() - 0.5) * 3, z + (rnd() - 0.5) * 3, q.h]); }
    }
    // края уступа и осыпи - с нормалью самой земли: слои земли по крутизне не ломаются на стыке
    const NG = NT + NA, flip = (() => { const q = s.st[0], r = s.st[1]; return (r.x - q.x) * -q.nz + (r.z - q.z) * q.nx > 0; })(), quad = (I, a, b, c, d) => (flip ? I.push(a, b, c, b, d, c) : I.push(a, c, b, b, c, d));
    for (let i = 0; i < n - 1; i++) { if (s.st[i].h < 0.35 && s.st[i + 1].h < 0.35) continue;
      for (let k = 0; k < NG - 1; k++) if (k !== NT - 1) quad(g.i, i * NG + k, i * NG + k + 1, (i + 1) * NG + k, (i + 1) * NG + k + 1);
      for (let k = 0; k < NF - 1; k++) quad(f.i, i * NF + k, i * NF + k + 1, (i + 1) * NF + k, (i + 1) * NF + k + 1); }
    const mk = (o) => { let G = new THREE.BufferGeometry(); G.setAttribute('position', new THREE.Float32BufferAttribute(o.p, 3)); if (o.uv) G.setAttribute('uv', new THREE.Float32BufferAttribute(o.uv, 2)); if (o.c) G.setAttribute('color', new THREE.Float32BufferAttribute(o.c, 3)); G.setIndex(o.i); G.computeVertexNormals(); if (rock && !o.uv) { G = G.toNonIndexed(); const ns = G.attributes.normal.array.slice(); G.computeVertexNormals(); const nf = G.attributes.normal.array; for (let i = 0; i < nf.length; i += 3) { const x = nf[i] * 0.5 + ns[i] * 0.5, y = nf[i + 1] * 0.5 + ns[i + 1] * 0.5, z = nf[i + 2] * 0.5 + ns[i + 2] * 0.5, l = Math.hypot(x, y, z) || 1; nf[i] = x / l; nf[i + 1] = y / l; nf[i + 2] = z / l; } } /* камень - наполовину гранями */ if (o.uv) { const na = G.attributes.normal, N0 = new THREE.Vector3(), N1 = new THREE.Vector3(); for (let i = 0; i < n; i++) for (const [k, w] of [[0, 1], [1, 0.85], [2, 0.6], [3, 0.4], [4, 0.2], [NG - 1, 1], [NG - 2, 0.9], [NG - 3, 0.75], [NG - 4, 0.55], [NG - 5, 0.4]]) { const j = i * NG + k, x = o.p[j * 3], z = o.p[j * 3 + 2], [a, b] = grad(x, z, 12); N0.set(-a, 1, -b).normalize(); N1.fromBufferAttribute(na, j).lerp(N0, w).normalize(); na.setXYZ(j, N1.x, N1.y, N1.z); } } G.computeBoundingSphere(); return G; };
    return [mk(g), mk(f)];
  };
  const mat = faceMaterial(kind, winter, snow), grp = new THREE.Group(); grp.name = 'cliffs';
  const far = P.shadows ? 7000 : 3500;
  for (const s of sites) { const [a, b] = build(s), A = new THREE.Mesh(a, ground.material), B = new THREE.Mesh(b, mat); A.receiveShadow = B.receiveShadow = !!sh.receive; B.castShadow = !!sh.cast; A.castShadow = !!sh.cast; A.renderOrder = 1; for (const m of [A, B]) { m.matrixAutoUpdate = false; m.updateMatrix(); grp.add(m); } s.m = [A, B]; }
  scene.add(grp);
  return { topH, sites, foot, group: grp, ms: Math.round(T0 ? performance.now() - T0 : 0), update(cam) { for (const s of sites) { const v = Math.hypot(cam.position.x - s.x, cam.position.z - s.z) * Math.tan(cam.fov * Math.PI / 360) / 0.6 < far + s.R; if (s.m[0].visible !== v) s.m[0].visible = s.m[1].visible = v; } } };
}
// лицо обрыва: три проекции, два масштаба; глина - плитка + макро 16 м (промоины), камень - 11 и 3,7 м; на топи - сырая бурая; зимой - снег на уступах
function faceMaterial(kind, winter, snow) {
  const rock = kind === 'winter', U = { tC: { value: null }, tN: { value: null }, tM: { value: null }, tNoise: { value: noiseTex() }, uOn: { value: 0 } };
  const m = new THREE.MeshPhongMaterial({ color: 0xffffff, specular: 0x000000, shininess: 1, vertexColors: true, side: THREE.DoubleSide });
  if (ktxOn()) Promise.all([ktxLoad(rock ? 'cl_rock_c' : 'cl_clay_c'), ktxLoad(rock ? 'cl_rock_n' : 'cl_clay_n'), rock ? null : ktxLoad('cl_macro_n')]).then(([c, nn, mm]) => { for (const t of [c, nn, mm]) if (t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; } U.tC.value = c; U.tN.value = nn; U.tM.value = mm || nn; U.uOn.value = 1; }).catch((e) => console.warn('текстуры обрывов', e.message));
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, U);
    s.vertexShader = 'varying vec3 vWp, vGN;\n' + s.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vWp = (modelMatrix * vec4(transformed, 1.0)).xyz; vGN = mat3(modelMatrix) * normal;');
    s.fragmentShader = `varying vec3 vWp, vGN; uniform sampler2D tC, tN, tM, tNoise; uniform float uOn; vec3 cDN = vec3(0.0);
float nz(vec2 p) { return texture2D(tNoise, p * 0.0078125).r; }
` + s.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  { vec3 gn = normalize(vGN); if (!gl_FrontFacing) gn = -gn; vec3 bw = pow(abs(gn), vec3(4.0)); bw /= bw.x + bw.y + bw.z; vec3 p = vWp; float w = nz(p.xz / 7.0 + p.y / 5.0);
    vec2 px = vec2(p.z, -p.y), pz = vec2(p.x, -p.y), py = p.xz; vec3 c = vec3(0.4), dn = vec3(0.0); float big = nz((px + pz) / 23.0), mid = nz(vec2(p.x + p.z, p.y * 0.4) / 4.5 + 7.0);
    if (uOn > 0.5) {
      #define TRI(t, T) (texture2D(t, px / T) * bw.x + texture2D(t, pz / T) * bw.z + texture2D(t, py / T) * bw.y)
      #define TRN(t, T, k) { vec2 a = (texture2D(t, px / T).xy * 2.0 - 1.0) * bw.x, b = (texture2D(t, pz / T).xy * 2.0 - 1.0) * bw.z, d = (texture2D(t, py / T).xy * 2.0 - 1.0) * bw.y; dn += k * vec3(b.x + d.x, a.y + b.y, a.x - d.y); }
${rock ? `      vec3 c1 = TRI(tC, 11.0).rgb, c2 = TRI(tC, 3.7).rgb; c = c1 * c1 * (0.45 + 1.5 * c2.g * c2.g / 0.16); c = mix(vec3(dot(c, vec3(0.33))), c, 0.45) * 0.78;
      TRN(tN, 11.0, 1.2) TRN(tN, 3.7, 0.9)
      c *= mix(vec3(0.75, 0.78, 0.83), vec3(1.2, 1.1, 1.0), big) * (0.8 + 0.4 * mid);` : `      vec4 c1 = TRI(tC, 3.0); float mh = TRI(tM, 16.0).a, d2 = TRI(tC, 0.83).a; c = c1.rgb * c1.rgb * mix(0.75, 1.15, smoothstep(0.15, 0.8, c1.a)) * mix(0.82, 1.1, smoothstep(0.2, 0.8, d2)); c = mix(vec3(dot(c, vec3(0.3, 0.55, 0.15))), c, 0.5);
      TRN(tN, 3.0, 0.9) TRN(tN, 0.83, 0.5) TRN(tM, 16.0, 1.0)
      c *= mix(0.66, 1.15, smoothstep(0.2, 0.75, mh)) * (0.8 + 0.42 * big) * mix(vec3(0.88, 0.82, 0.76), vec3(1.0), smoothstep(0.25, 0.7, mid));
      c *= ${kind === 'autumn' ? 'vec3(0.31, 0.275, 0.23)' : 'vec3(0.6, 0.56, 0.5)'}; float st = smoothstep(0.62, 0.7, nz(vec2(p.y / 1.7 + nz(p.xz / 31.0) * 3.0, 3.0))); c = mix(c, c * vec3(0.62, 0.55, 0.5), st * 0.6);`}
    }
${winter ? `    float up = normalize(gn + dn * 0.7).y, sn = smoothstep(0.5, 0.75, up + 0.35 * (w - 0.5) + 0.25 * (mid - 0.5)); c = mix(c, vec3(0.8, 0.83, 0.88), sn * ${snow.toFixed(2)});` : `    float up = gn.y, gs = smoothstep(0.45, 0.8, up + 0.5 * (w - 0.5)); c = mix(c, ${kind === 'autumn' ? 'vec3(0.1, 0.095, 0.045)' : 'vec3(0.075, 0.1, 0.035)'}, gs * 0.85);`}
    ${winter ? '' : `    { float lp = vColor.g * 2.0 - 2.0, jg = nz(vec2(p.x + p.z, p.x - p.z) * 1.6) + 0.5 * nz(vec2(p.x - p.z, p.x + p.z) * 4.0), sl = smoothstep(-1.1, -0.75, lp - 0.5 + jg * 0.5); // дёрн и тёмный слой почвы под бровкой, свисает рваным краем
      c = mix(c, vec3(0.055, 0.042, 0.03) * (0.6 + 0.8 * mid), sl * 0.85); c = mix(c, ${kind === 'autumn' ? 'vec3(0.12, 0.105, 0.05)' : 'vec3(0.08, 0.1, 0.035)'} * (0.6 + 0.8 * nz(p.xz * 3.0 + p.y)), smoothstep(-0.42, -0.2, lp - 0.35 + jg * 0.35)); }`}
    diffuseColor.rgb = c * vColor.r * vColor.r; cDN = dn; }`).replace('diffuseColor.rgb *= vColor;', '').replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n  normal = normalize(normal + (viewMatrix * vec4(cDN, 0.0)).xyz * 0.8);');
  };
  return m;
}
