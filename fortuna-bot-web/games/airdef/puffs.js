// Клубы дыма из Blender для следов подбитых самолётов (2026-10-24, Mark: «запечь дымы повреждений»): как makeParticles «Летки» (точки,
// тот же emit — форму следа по траектории задаёт игра), но частица — не ровное пятно, а кадр настоящего клуба по её возрасту: плотный и
// клубящийся → рваный → тающие пряди, со светом и самозатенением (tools/airdef-fx/explode/puff.py → fx/puff.ktx2: 4 варианта × 16 кадров, 8×8).
// Клуб в листе всегда заполняет клетку (камера Blender — по границам дыма), разрастание — размером частицы, как было. Тон (серый / чёрный /
// белёсая течь) — цвет частицы × белый дым листа; свет — небо и солнце сцены (как у раскадровок). Вариант и зеркало — случайные (повторов не видно).
// ready = false, пока лист не пришёл (или его нет) — вызывающий шлёт частицы в прежний пул (мягкое пятно)
/* global THREE */
import { FXU, SOFT_GLSL, FOG_LIN, FOG_U } from '../drone/world.js?v=20261024t';
import { ktxOn, ktxLoadUrl } from './ktx.js?v=20261024t';

// cfg: ktx, url — лист; cols, rows, frames (на вариант), variants, times — время кадров съёмки, с; onTex(t) — текстура пришла
export function makePuffs(scene, N, cfg) {
  const web = typeof document !== 'undefined' && document.createElementNS, st = { ready: false };
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), alp = new Float32Array(N), siz = new Float32Array(N), pf = new Float32Array(N * 2);
  const vel = new Float32Array(N * 3), life = new Float32Array(N), max = new Float32Array(N), a0 = new Float32Array(N), grow = new Float32Array(N), drag = new Float32Array(N), grav = new Float32Array(N), t0 = new Float32Array(N);
  for (let i = 0; i < N; i++) pos[i * 3 + 1] = -99999;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('pcolor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alp, 1)); geo.setAttribute('size', new THREE.BufferAttribute(siz, 1)); geo.setAttribute('pf', new THREE.BufferAttribute(pf, 2));
  for (const k of ['position', 'pcolor', 'alpha', 'size', 'pf']) geo.attributes[k].setUsage(THREE.DynamicDrawUsage);
  geo.setDrawRange(0, 0);
  const F = cfg.frames, TM = cfg.times, T1 = TM[F - 1], K = cfg.k || 2;
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: new THREE.Texture() }, uGrid: { value: new THREE.Vector2(cfg.cols, cfg.rows) }, uLight: { value: new THREE.Vector3(1, 1, 1) },
      scale: { value: 500 }, fogColor: { value: FOG_LIN }, fogDensity: FOG_U, ...FXU },
    extensions: { fragDepth: true },
    vertexShader: `#include <common>
      #include <logdepthbuf_pars_vertex>
      attribute float alpha; attribute float size; attribute vec3 pcolor; attribute vec2 pf;
      uniform float scale; uniform float fogDensity; uniform float fxOn, fxK; varying vec3 vC; varying float vA; varying float vF; varying vec2 vP;
      void main() { vC = pow(pcolor, vec3(2.2)); vA = alpha; vP = pf; vec4 mv = modelViewMatrix * vec4(position, 1.0); float d = -mv.z;
        vF = 1.0 - exp(-fogDensity * fogDensity * d * d);
        float ps = size * scale / d; if (fxOn > 0.5) ps *= fxK; // в проходе половинного разрешения пиксели вдвое крупнее
        gl_PointSize = (d > 0.0 && alpha > 0.0) ? min(ps, 400.0) : 0.0; gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    // pf.x — кадр (дробный: соседние кадры смешиваются), pf.y — номер клетки первого кадра варианта, со знаком — зеркало
    fragmentShader: `#include <common>
      #include <logdepthbuf_pars_fragment>
      uniform sampler2D map; uniform vec2 uGrid; uniform vec3 uLight, fogColor; varying vec3 vC; varying float vA; varying float vF; varying vec2 vP;
      ${SOFT_GLSL}
      vec2 cell(float i, vec2 q) { float c = mod(i, uGrid.x), r = floor(i / uGrid.x); return (vec2(c, uGrid.y - 1.0 - r) + q) / uGrid; }
      void main() {
        #include <logdepthbuf_fragment>
        vec2 q = vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y); if (vP.y < 0.0) q.x = 1.0 - q.x;
        q = clamp(q, 0.004, 0.996); // не заходить в соседнюю клетку
        float b = abs(vP.y) - 1.0, f0 = floor(vP.x), k = vP.x - f0;
        vec4 t = mix(texture2D(map, cell(b + f0, q)), texture2D(map, cell(b + min(f0 + 1.0, ${F - 1}.0), q)), k);
        float a = vA * t.a * fxSoft(8.0); if (a < 0.004) discard;
        vec3 c = pow(t.rgb, vec3(2.2)) * vC * uLight;
        gl_FragColor = vec4(mix(c, fogColor, vF), a);
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }`,
    transparent: true, depthWrite: false,
  });
  const done = (t) => { mat.uniforms.map.value = t; st.ready = true; if (cfg.onTex) cfg.onTex(t); };
  if (web) {
    const png = () => new THREE.TextureLoader().load(cfg.url, (t) => { t.encoding = THREE.LinearEncoding; done(t); });
    if (cfg.ktx && ktxOn()) ktxLoadUrl(cfg.ktx).then(done).catch(png); else png();
  }
  const points = new THREE.Points(geo, mat); points.frustumCulled = false; scene.add(points);
  let head = 0, emitted = false, wasLive = false;
  const A = geo.attributes, range = (attr, lo, n, k) => { attr.updateRange.offset = lo * k; attr.updateRange.count = n * k; attr.needsUpdate = true; };
  // возраст (доля жизни) → время съёмки → дробный кадр; t0 — с какого места листа начинать (у течи — с прядей)
  const frameAt = (u) => { const t = u * T1; let k = 0; while (k < F - 2 && TM[k + 1] <= t) k++; return Math.min(F - 1, k + (t - TM[k]) / (TM[k + 1] - TM[k])); };
  return {
    mat, points, get ready() { return st.ready; },
    // как makeParticles.emit; st — с какого места клуба (0…1: 0 — свежий, 0,5 — уже рваный)
    emit(x, y, z, vx, vy, vz, r, g, b, a, s, gr, l, dr, gv, start = 0) {
      const i = head = (head + 1) % N, i3 = i * 3, v = Math.floor(Math.random() * cfg.variants);
      pos[i3] = x; pos[i3 + 1] = y; pos[i3 + 2] = z; vel[i3] = vx; vel[i3 + 1] = vy; vel[i3 + 2] = vz;
      // клуб занимает меньше клетки, чем мягкое пятно своей точки, — размер × K: видимый — как был (иначе след издали — цепочка «бусин»)
      col[i3] = r; col[i3 + 1] = g; col[i3 + 2] = b; a0[i] = alp[i] = a; siz[i] = s * K; grow[i] = gr * K; max[i] = life[i] = l; drag[i] = dr; grav[i] = gv; t0[i] = start;
      pf[i * 2] = frameAt(start); pf[i * 2 + 1] = (v * F + 1) * (Math.random() < 0.5 ? -1 : 1);
      emitted = true;
    },
    update(dt, light) {
      if (light) mat.uniforms.uLight.value.copy(light);
      let lo = N, hi = -1;
      for (let i = 0; i < N; i++) {
        if (life[i] <= 0) { if (alp[i] !== 0) { alp[i] = 0; if (i < lo) lo = i; hi = i; } continue; }
        const i3 = i * 3;
        life[i] -= dt;
        pos[i3] += vel[i3] * dt; pos[i3 + 1] += vel[i3 + 1] * dt; pos[i3 + 2] += vel[i3 + 2] * dt;
        const k = Math.max(0, 1 - drag[i] * dt); vel[i3] *= k; vel[i3 + 1] = vel[i3 + 1] * k + grav[i] * dt; vel[i3 + 2] *= k;
        siz[i] += grow[i] * dt;
        const u = Math.max(0, life[i] / max[i]), age = 1 - u, e = Math.min(1, u * 4);
        alp[i] = a0[i] * e * e * (3 - 2 * e); // клуб тает сам (кадры листа) — общая прозрачность уходит только в последней четверти жизни, по S-кривой
        pf[i * 2] = frameAt(t0[i] + (1 - t0[i]) * age);
        if (i < lo) lo = i; hi = i;
      }
      if (hi < 0) { if (wasLive) { geo.setDrawRange(0, 0); wasLive = false; } return; }
      const n = hi - lo + 1;
      range(A.position, lo, n, 3); range(A.alpha, lo, n, 1); range(A.size, lo, n, 1); range(A.pf, lo, n, 2);
      if (emitted) { range(A.pcolor, lo, n, 3); emitted = false; }
      geo.setDrawRange(lo, n); wasLive = true;
    },
    clear() { life.fill(0); },
    dispose() { scene.remove(points); geo.dispose(); mat.dispose(); },
  };
}
