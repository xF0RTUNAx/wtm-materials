// Деревья от взрыва (Mark 2026-11-25: «механика реакции деревьев, кустов на ударную волну»): волна гнёт всё вокруг (blast.js), а у самого разрыва деревья валятся
// (дерево падает от взрыва, у части остаётся пень с изломом), кусты сносит; с крон летит листва, зимой - снег. Только вид, на бой не влияет; выбор - по месту дерева,
// у всех игроков одинаково. Целое дерево убирается из набора вблизи и из дальних снимков. ?tf=0 - без этого
/* global THREE */
export const TF_ON = typeof location === 'undefined' || !/[?&]tf=0/.test(location.search);
const MAXF = 160, LEAF = 700;
const hash = (x, z, k) => { let h = (Math.round(x * 3) * 374761393 + Math.round(z * 3) * 668265263 + k * 1274126177) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
// o: scene, gh(x, z), kind (c / w / a), mat(m0, H) - материал дерева без затухания, depth(mat) - глубина листвы, cast, uTime
export function createTreeFall(o) {
  const grid = new Map(), GS = 64, gk = (x, z) => Math.floor(x / GS) + ',' + Math.floor(z / GS), falls = new Map(), stumps = new Map(), live = [], snaps = [];
  let total = 0, broken = null, leaf = null, lk = 0, t = 0;
  const Q = new THREE.Quaternion(), V = new THREE.Vector3(), M4 = new THREE.Matrix4(), AX = new THREE.Vector3(), P0 = new THREE.Vector3(), Q0 = new THREE.Quaternion(), S0 = new THREE.Vector3();
  const T = { trees: 0, fallen: 0, leaves: 0,
    reg(S, name, list) { list.forEach((q, j) => { const k = gk(q.x, q.z); let c = grid.get(k); if (!c) grid.set(k, c = []); c.push({ S, name, j, x: q.x, z: q.z, bush: /bush/.test(name) }); T.trees++; }); },
    model(name, L) { const f = falls.get(name) || {}; f.L = L; falls.set(name, f); },
    broken(g) { broken = g; },
    tiles(list) { for (const m of list) if (m.isInstancedMesh) snaps.push(m); },
    // взрыв: p - точка, R - радиус вспышки (м)
    hit(p, R, time) {
      t = time; if (!TF_ON || !(R >= 6)) return; const gy = o.gh(p.x, p.z); if (p.y - gy > R * 0.5) return; // в воздухе - только волна
      const rb = Math.min(34, Math.max(3, R * 0.4)), rl = rb * 3.2, n = Math.ceil(rl / GS); const cx = Math.floor(p.x / GS), cz = Math.floor(p.z / GS); let cnt = 0, lc = 0;
      for (let ix = cx - n; ix <= cx + n; ix++) for (let iz = cz - n; iz <= cz + n; iz++) { const c = grid.get(ix + ',' + iz); if (!c) continue;
        for (const e of c) { if (e.dead) continue; const dx = e.x - p.x, dz = e.z - p.z, r = Math.hypot(dx, dz); if (r > rl) continue;
          const h = hash(e.x, e.z, 7), size = e.S.mats[e.j * 16 + 5]; e.S.mats && M4.fromArray(e.S.mats, e.j * 16);
          if (lc < 140) { const k = r < rb ? 14 : Math.round(7 * (1 - r / rl)); lc += k; this.leaves_(e, k, dx / (r || 1), dz / (r || 1), r, R, size); }
          if (r >= rb || cnt >= 28 || h < 0.75 * (r / rb) ** 2) continue;
          cnt++; e.dead = true; if (!e.S.offT) e.S.offT = new Uint8Array(e.S.n); e.S.offT[e.j] = 1; this.unsnap(e);
          const snap = r < rb * 0.4 || hash(e.x, e.z, 3) < 0.45; if (snap && !e.bush) this.stump(e, R >= 30 && r < rb * 0.5);
          if (!e.bush && !(r < rb * 0.18) && total < MAXF) this.fall(e, dx / (r || 1), dz / (r || 1), r, snap); } }
      if (cnt) { T.fallen += cnt; if (o.dirty) o.dirty(); }
    },
    // дальний снимок дерева - в точку
    unsnap(e) { for (const m of snaps) { const a = m.instanceMatrix.array; if (m.geometry.boundingSphere && Math.hypot(m.geometry.boundingSphere.center.x - e.x, m.geometry.boundingSphere.center.z - e.z) > m.geometry.boundingSphere.radius + 30) continue;
      for (let i = 0; i < m.count; i++) { const k = i * 16; if (Math.abs(a[k + 12] - e.x) < 0.05 && Math.abs(a[k + 14] - e.z) < 0.05) { for (let q = 0; q < 11; q++) a[k + q] = 0; m.instanceMatrix.needsUpdate = true; if (m.material.uniforms && m.material.uniforms.uSp) return; } } } },
    pool(f, L, n, mat) { f.im = new THREE.InstancedBufferAttribute(new Float32Array(n * 16), 16); f.im.setUsage(THREE.DynamicDrawUsage); f.n = 0; f.cap = n;
      f.ms = L.children.filter((c) => c.isMesh).map((c) => { const lf = c.material.alphaTest > 0, m = new THREE.InstancedMesh(c.geometry, mat(c.material), n); m.instanceMatrix = f.im; m.count = 0; m.frustumCulled = false; if (lf && o.depth) m.customDepthMaterial = o.depth(c.material); m.castShadow = !!o.cast; m.receiveShadow = true; o.scene.add(m); return m; }); },
    fall(e, dx, dz, r, snap) {
      const f = falls.get(e.name); if (!f || !f.L) return; if (!f.ms) this.pool(f, f.L, 48, (m) => o.mat(m, 0.02)); if (f.n >= f.cap) return; total++;
      M4.fromArray(e.S.mats, e.j * 16); const pos = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); M4.decompose(pos, q, s);
      const a = Math.atan2(dz, dx) + (hash(e.x, e.z, 11) - 0.5) * 0.5, ux = Math.cos(a), uz = Math.sin(a), H = (e.S.wind || 10) * s.y; if (snap) pos.y += 0.35 + 0.5 * hash(e.x, e.z, 5);
      const gt = o.gh(pos.x + ux * H * 0.8, pos.z + uz * H * 0.8), end = Math.PI / 2 - Math.atan2(gt - pos.y + H * 0.045, H * 0.8); // ложится на ветви - чуть не до земли
      live.push({ f, i: f.n, pos, q, s, ax: new THREE.Vector3(uz, 0, -ux), end: Math.min(1.75, Math.max(0.9, end)), t0: t + r / 380, dur: 0.75 + 0.085 * H * 0.6 + 0.5 * hash(e.x, e.z, 13), drop: snap ? 0.35 : 0.1 });
      M4.compose(pos, q, s); M4.toArray(f.im.array, f.n * 16); f.n++; for (const m of f.ms) m.count = f.n; f.im.needsUpdate = true; },
    stump(e, burnt) {
      if (!broken) return; const sp = /pine/.test(e.name) ? 'pine' : /fir|spruce/.test(e.name) ? 'fir' : 'oak', k = 'st_' + sp + (burnt ? '_b' : ''); let f = stumps.get(k);
      if (!f) { const L = new THREE.Group(); L.children = broken.children.filter((c) => c.name.startsWith(k + '@') || (c.userData && c.userData.name && c.userData.name.startsWith(k + '@'))); const g0 = broken.getObjectByName(k + '@1'); f = {}; stumps.set(k, f); const src = g0 || L; if (!src || !src.children.length) { f.bad = 1; return; } this.pool(f, src, 60, (m) => o.mat(m, 0.02)); }
      if (f.bad || f.n >= f.cap) return; M4.fromArray(e.S.mats, e.j * 16); M4.decompose(P0, Q0, S0); const w = Math.min(1.5, Math.max(0.5, (e.S.wind || 10) * S0.y / 12)); P0.y -= 0.3; M4.compose(P0, Q0, S0.set(w, w * (0.75 + 0.5 * hash(e.x, e.z, 17)), w)); M4.toArray(f.im.array, f.n * 16); f.n++; for (const m of f.ms) m.count = f.n; f.im.needsUpdate = true; },
    leaves_(e, n, dx, dz, r, R, size) {
      if (n <= 0 || !o.leaves) return; if (!leaf) this.leafInit(); const H = (e.S.wind || 10) * Math.abs(size || 1), pow = Math.min(14, R * 0.5) / (1 + (r / (6 + R * 0.5)) ** 2), a = leaf.geometry.attributes, y0 = M4.elements[13];
      for (let k = 0; k < n; k++) { const i = lk++ % LEAF, u = Math.random(), v = Math.random() * 6.283, rr = H * 0.28 * Math.sqrt(Math.random());
        a.aP.setXYZW(i, e.x + Math.cos(v) * rr, y0 + H * (0.35 + 0.6 * u), e.z + Math.sin(v) * rr, t + r / 380); a.aV.setXYZW(i, dx * pow * (0.4 + Math.random()) + (Math.random() - 0.5) * 2, 0.5 + Math.random() * pow * 0.35, dz * pow * (0.4 + Math.random()) + (Math.random() - 0.5) * 2, Math.random()); }
      a.aP.needsUpdate = a.aV.needsUpdate = true; T.leaves += n; leaf.visible = true; },
    leafInit() {
      const g = new THREE.InstancedBufferGeometry(), pl = new THREE.PlaneGeometry(1, 1); g.setAttribute('position', pl.attributes.position); g.setIndex(pl.index); g.instanceCount = LEAF;
      for (const k of ['aP', 'aV']) { const b = new THREE.InstancedBufferAttribute(new Float32Array(LEAF * 4), 4); b.setUsage(THREE.DynamicDrawUsage); if (k === 'aP') for (let i = 0; i < LEAF; i++) b.setW(i, -1e3); g.setAttribute(k, b); }
      const C = o.leaves.map((c) => new THREE.Color(c).convertSRGBToLinear()); const snow = o.kind === 'w';
      const mat = new THREE.ShaderMaterial({ side: THREE.DoubleSide, uniforms: { uTime: o.uTime, uC: { value: C }, uL: { value: o.light }, ...THREE.UniformsLib.fog }, transparent: snow, depthWrite: !snow,
        vertexShader: `attribute vec4 aP, aV; uniform float uTime; uniform vec3 uC[3]; varying vec3 vC; varying float vA; varying vec2 vQ;
        void main() { float t = uTime - aP.w, life = ${snow ? '2.6' : '4.5'} + aV.w * 2.0; vQ = position.xy; vA = 1.0 - smoothstep(life * 0.6, life, t); if (t < 0.0 || t > life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
          float d = ${snow ? '1.3' : '1.7'}; vec3 c = aP.xyz + aV.xyz * (1.0 - exp(-d * t)) / d - vec3(0.0, ${snow ? '1.6' : '1.25'} * t * (1.0 - exp(-t)), 0.0) + vec3(sin(t * 2.3 + aV.w * 40.0), 0.0, cos(t * 1.9 + aV.w * 31.0)) * 0.35 * min(t, 1.0);
          float sz = ${snow ? '0.35 + 0.9 * t * (0.4 + aV.w)' : '0.14 + 0.12 * aV.w'}; vec2 q = position.xy * sz; vec3 w; ${snow ? 'vec4 mv = viewMatrix * vec4(c, 1.0); mv.xy += q; gl_Position = projectionMatrix * mv;' : 'float a = t * (3.0 + 6.0 * aV.w) + aV.w * 20.0, b = t * (2.0 + 4.0 * fract(aV.w * 7.3)); vec3 X = vec3(cos(a), sin(a) * sin(b), sin(a) * cos(b)), Y = vec3(0.0, cos(b), -sin(b)); gl_Position = projectionMatrix * viewMatrix * vec4(c + X * q.x + Y * q.y, 1.0);'}
          int k = int(fract(aV.w * 13.7) * 2.99); vC = k == 0 ? uC[0] : k == 1 ? uC[1] : uC[2]; }`,
        fragmentShader: `uniform vec3 uL; varying vec3 vC; varying float vA; varying vec2 vQ; void main() { float r = length(vQ * ${snow ? '2.0' : 'vec2(2.0, 3.4)'}); ${snow ? 'float a = (1.0 - smoothstep(0.1, 1.0, r)) * 0.3 * vA; if (a < 0.01) discard; gl_FragColor = vec4(vC * uL, a);' : 'if (r > 1.0 || vA < 0.02) discard; gl_FragColor = vec4(vC * uL, 1.0);'}
#include <tonemapping_fragment>
#include <encodings_fragment>
}` });
      leaf = new THREE.Mesh(g, mat); leaf.frustumCulled = false; o.scene.add(leaf); },
    tick(time) {
      t = time; for (let i = live.length - 1; i >= 0; i--) { const e = live[i], s = t - e.t0; if (s < 0) continue; const u = Math.min(1, s / e.dur); let a = e.end * Math.pow(u, 2.3), y = 0; // сначала медленно, потом быстро, как настоящее
        if (s > e.dur) { const b = s - e.dur; a = e.end - 0.07 * Math.exp(-3.5 * b) * Math.abs(Math.sin(8.5 * b)); if (b > 1.6) { a = e.end; live.splice(i, 1); } }
        y = -e.drop * Math.min(1, u * u); Q.setFromAxisAngle(e.ax, a).multiply(e.q); V.copy(e.pos); V.y += y; M4.compose(V, Q, e.s); M4.toArray(e.f.im.array, e.i * 16); e.f.im.needsUpdate = true; }
    } };
  return T;
}
