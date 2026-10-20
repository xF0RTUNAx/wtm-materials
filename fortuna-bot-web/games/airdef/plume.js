// Шлейф ракет: факел и дымный след (2026-10-20, просьба Mark — «как в ПК-играх», по размеру и физике ракеты).
//  • Факел — запечённая раскадровка (tools/airdef-fx/plume-bake.py → fx/plume_flame.png: ядро, диски Маха, турбулентность),
//    плоскость вдоль оси ракеты, развёрнутая к камере вокруг оси; плюс свечение у среза сопла (видно и строго сзади).
//    Ширина — по соплу, длина — по режиму (стартовый / маршевый) и тяге; на высоте струя «недорасширена» — шире и длиннее.
//  • Дым — непрерывная лента по точкам траектории (не рвётся на любой скорости, в отличие от клубов-частиц): ширина
//    растёт как √возраста (турбулентная диффузия), лента сносится ветром и всплывает, тает к концу жизни; узор клубов —
//    запечённый бесшовный шум (fx/plume_smoke.png) с самозатенением. Освещение — небо и солнце сцены, туман — как у частиц.
//  • Тип двигателя (MOTOR): смесевое твёрдое топливо — густой белый дым; малодымное — лёгкая дымка; ПЗРК — тонкий серый;
//    НАР — плотный короткий; жидкостный (С-75, «Скад») — прозрачный рыжеватый (окислитель на азотной кислоте), факел
//    оранжевый; прямоточный («Куб», Х-31) — почти без дыма, факел слабый голубоватый; турбореактивный (крылатые) — дымки нет.
//    Густота и ширина дыма — от площади сечения (расход топлива ∝ r²), время жизни — от размера ракеты.
import { FOG_LIN, FOG_U, FXU, SOFT_GLSL } from '../drone/world.js?v=20261022q';

const TEX = new THREE.TextureLoader();
const url = (f) => new URL(`./fx/${f}`, import.meta.url).href;
const flameTex = TEX.load(url('plume_flame.png')), smokeTex = TEX.load(url('plume_smoke.png'));
smokeTex.wrapS = smokeTex.wrapT = THREE.RepeatWrapping; smokeTex.anisotropy = 4;

// a — плотность дыма у сопла, c — цвет дыма, w — ширина у сопла (× радиус), g — рост ширины (м/√с на 1 м радиуса + база),
// life — жизнь (с) = base + k·r, fl — факел: [r, g, b] оттенок, br — яркость, len — длина (× радиус) стартового / маршевого
export const MOTOR = { // ширина у сопла и рост — по снимкам пусков: след С-300 сразу ≈ 4 м, через 10 с — 15–20 м; ПЗРК ≈ 1 м → 5 м
  solid: { a: 0.8, c: [0.9, 0.9, 0.88], w: 15, g: [1.2, 12], life: [10, 80], fl: [1, 0.78, 0.5], br: 1.0, len: [26, 13] },
  lowsmoke: { a: 0.32, c: [0.93, 0.93, 0.93], w: 11, g: [0.9, 9], life: [6, 36], fl: [1, 0.86, 0.68], br: 1.0, len: [22, 12] },
  manpads: { a: 0.75, c: [0.82, 0.82, 0.8], w: 24, g: [0.7, 14], life: [7, 50], fl: [1, 0.92, 0.8], br: 1.1, len: [20, 14] },
  rocket: { a: 0.75, c: [0.9, 0.9, 0.88], w: 22, g: [0.8, 16], life: [5, 50], fl: [1, 0.86, 0.6], br: 1.0, len: [18, 18] },
  atgm: { a: 0.42, c: [0.8, 0.8, 0.78], w: 14, g: [0.5, 9], life: [4, 35], fl: [1, 0.8, 0.55], br: 0.9, len: [12, 12] },
  liquid: { a: 0.16, c: [0.7, 0.54, 0.42], w: 9, g: [0.8, 7], life: [6, 24], fl: [1, 0.62, 0.38], br: 0.8, len: [20, 16] },
  ramjet: { a: 0.05, c: [0.86, 0.86, 0.86], w: 6, g: [0.5, 4], life: [3, 12], fl: [0.6, 0.72, 1], br: 0.35, len: [8, 8] },
  jet: { a: 0.05, c: [0.62, 0.62, 0.62], w: 5, g: [0.3, 3], life: [2, 10], fl: [1, 0.7, 0.45], br: 0.35, len: [5, 5] },
};
// по ключу комплекса / оружия (что не указано — по виду: ракета ЗРК и УР «воздух — земля» — смесевое твёрдое)
const BY_KEY = {
  strela2: 'manpads', strela3: 'manpads', igla: 'manpads', iglas: 'manpads', verba: 'manpads', stinger: 'manpads', redeye: 'manpads', mistral: 'manpads', starstreak: 'manpads', aam_stinger: 'manpads',
  sampt: 'lowsmoke', iris: 'lowsmoke', nasams: 'lowsmoke', camm: 'lowsmoke', pac3: 'lowsmoke', bukm3: 'lowsmoke', s400: 'lowsmoke',
  w_kh31: 'ramjet', kh31: 'ramjet', kh31p: 'ramjet', agm88: 'lowsmoke', aargm: 'lowsmoke', hellfire: 'atgm', shturm: 'atgm', ataka: 'atgm', tow: 'atgm',
  s8: 'rocket', hydra: 'rocket', s5: 'rocket', s13: 'rocket', scud: 'liquid', r17: 'liquid',
};
// sustain — маршевый режим после стартового: у С-75 маршевый двигатель жидкостный, у «Куба» — прямоточный
const SUSTAIN = { s75: 'liquid', kub: 'ramjet', kvadrat: 'ramjet', w_kh31: 'ramjet', kh31: 'ramjet', kh31p: 'ramjet' };
export function motorOf(key, kind, sustain) {
  if (sustain && SUSTAIN[key]) return MOTOR[SUSTAIN[key]];
  return MOTOR[BY_KEY[key] || (kind === 'cruise' ? 'jet' : kind === 'rocket' ? 'rocket' : 'solid')];
}
const air = (y) => Math.exp(-Math.max(0, y) / 8500); // плотность воздуха на высоте (доля от земли)

// ═════════════ Факел ═════════════
// плоскость: x — поперёк (−0,5…0,5), z — от среза сопла (0) к хвосту (1); в шейдере разворачивается к камере вокруг оси z
const flameGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5);
const FL_V = `#include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec2 vUv; varying float vFace;
  void main() {
    vUv = uv;
    vec3 ax = (modelViewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz;       // ось струи в осях камеры (с масштабом длины)
    vec3 base = (modelViewMatrix * vec4(0.0, 0.0, position.z, 1.0)).xyz;
    float wid = length((modelViewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
    vec3 side = normalize(cross(normalize(ax), normalize(base)));     // поперёк оси и луча зрения
    vFace = 1.0 - smoothstep(0.8, 0.98, abs(dot(normalize(ax), normalize(base)))); // вдоль оси (камера сзади/спереди) — плоскость гаснет, светит сопло
    vec4 mv = vec4(base + side * position.x * wid, 1.0);
    gl_Position = projectionMatrix * mv;
    #include <logdepthbuf_vertex>
  }`;
const FL_F = `#include <common>
  #include <logdepthbuf_pars_fragment>
  uniform sampler2D map; uniform vec3 tint; uniform float br, frame;
  varying vec2 vUv; varying float vFace;
  void main() {
    #include <logdepthbuf_fragment>
    float f = mod(floor(frame), 16.0); vec2 cell = vec2(mod(f, 4.0), 3.0 - floor(f / 4.0));
    vec4 t = texture2D(map, (cell + vec2(vUv.x, vUv.y)) / 4.0);   // uv.y: 1 у сопла (z = 0) — кадр сверху вниз
    gl_FragColor = vec4(t.rgb * tint * br * 2.0 * vFace, t.a * br * vFace);
    #include <tonemapping_fragment>
    #include <encodings_fragment>
  }`;
const flameMats = new Map();
function flameMat(m) {
  let M = flameMats.get(m); if (M) return M;
  M = new THREE.ShaderMaterial({ uniforms: { map: { value: flameTex }, tint: { value: new THREE.Color(...m.fl) }, br: { value: m.br }, frame: { value: 0 } },
    vertexShader: FL_V, fragmentShader: FL_F, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  flameMats.set(m, M); return M;
}
const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,230,180,.55)'); g.addColorStop(1, 'rgba(255,160,60,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
let frameT = 0, flameLayer = 0;
// слой факела: при дыме в половине разрешения — проход огня (рисуется после дыма — дым у сопла не закрывает факел)
export function setFlameLayer(l) { flameLayer = l; }
export function flameTick(dt) { frameT += dt * 30; for (const M of flameMats.values()) M.uniforms.frame.value = frameT; } // 30 кадров/с, у каждой ракеты свой сдвиг — в uv нет, поэтому сдвиг — масштабом мерцания
// факел на ракете: group — модель (+Z к хвосту), z — срез сопла, r — радиус корпуса, motor — MOTOR.*
export function makeFlame(group, z, r, motor = MOTOR.solid) {
  const mesh = new THREE.Mesh(flameGeo, flameMat(motor)); mesh.position.z = z; mesh.renderOrder = 5; mesh.frustumCulled = false; mesh.userData.fx = true;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(...motor.fl), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
  glow.position.z = z; glow.renderOrder = 5; glow.userData.fx = true; group.add(mesh); group.add(glow);
  if (flameLayer) { mesh.layers.set(flameLayer); glow.layers.set(flameLayer); }
  let mot = motor;
  return {
    // k: 0 — двигатель не работает, 1 — маршевый, 2 — стартовый; rr — радиус сопла; y — высота (на высоте струя шире и длиннее)
    set(k, rr = r, y = 0) {
      mesh.visible = glow.visible = k > 0; if (!k) return;
      const e = 1 - air(y), f = 0.9 + Math.random() * 0.2, w = rr * (k > 1 ? 3.2 : 2.4) * (1 + 1.6 * e), L = rr * mot.len[k > 1 ? 0 : 1] * 1.5 * (1 + 0.8 * e) * f;
      mesh.scale.set(w, 1, L); glow.scale.setScalar(rr * (k > 1 ? 5 : 3.6) * (1 + e) * (0.9 + Math.random() * 0.2)); glow.material.opacity = Math.min(0.8, 0.4 * mot.br + 0.1);
    },
    motor(m) { if (m === mot) return; mot = m; mesh.material = flameMat(m); glow.material.color.setRGB(...m.fl); },
    move(z2) { mesh.position.z = glow.position.z = z2; },
    at(x, y, z) { mesh.position.set(x, y, z); glow.position.set(x, y, z); },
  };
}

// ═════════════ Дымная лента ═════════════
const SM_V = `#include <common>
  #include <logdepthbuf_pars_vertex>
  attribute vec3 aTan; attribute vec4 aA; attribute vec4 aB; attribute vec3 aCol; attribute float aSeed;
  uniform float uTime; uniform vec3 uWind, uSun; uniform float fogDensity;
  varying vec2 vUv; varying float vAl, vF, vAge, vSh; varying vec3 vCol;
  void main() {
    float age = max(0.0, uTime - aA.x), life = aB.y, f = clamp(age / life, 0.0, 1.0);
    vec3 p = position + uWind * age + vec3(0.0, aB.w * age, 0.0);          // снос ветром и всплытие тёплого дыма
    float u = aB.z, sg = aSeed * 6.283, grow = smoothstep(0.0, 2.5, age);
    float w = aA.z + aB.x * sqrt(age);                                       // турбулентная диффузия: ширина ∝ √t
    w *= 1.0 + grow * (0.28 * sin(u * 0.9 / max(aA.z, 0.5) + sg) + 0.18 * sin(u * 0.37 / max(aA.z, 0.5) + 2.0 * sg)); // «клубы» по длине
    vec3 vd = normalize(cameraPosition - p), sd = cross(normalize(aTan), vd); float sl = length(sd);
    vec3 sn = sl > 1e-4 ? sd / sl : vec3(0.0, 1.0, 0.0);
    p += sn * grow * w * (0.22 * sin(u * 0.045 + sg + age * 0.15) + 0.12 * sin(u * 0.13 + 3.0 * sg)); // лента изгибается — турбулентность
    p += sn * aA.y * w * 0.5; vSh = dot(sn * aA.y, uSun);                 // край ленты к солнцу — освещённый
    vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
    float d = -mv.z; vF = 1.0 - exp(-fogDensity * fogDensity * d * d);
    // у сопла дым появляется не сразу (горячие газы прозрачны), к концу жизни тает; лента «ребром» к камере — бледнее (клубы-частицы её дополняют)
    vAl = aA.w * smoothstep(0.0, 0.035, age) * pow(1.0 - f, 1.4) * mix(0.35, 1.0, smoothstep(0.08, 0.5, sl));
    vUv = vec2(u / max(w, 0.6) * 0.42 + aSeed * 7.0, aA.y * 0.5 + 0.5); vAge = age; vCol = aCol;
    #include <logdepthbuf_vertex>
  }`;
const SM_F = `#include <common>
  #include <logdepthbuf_pars_fragment>
  uniform sampler2D map; uniform vec3 fogColor, uLight; uniform float uTime;
  varying vec2 vUv; varying float vAl, vF, vAge, vSh; varying vec3 vCol;
  ${SOFT_GLSL}
  void main() {
    #include <logdepthbuf_fragment>
    float v = vUv.y * 2.0 - 1.0;
    vec4 t = texture2D(map, vec2(vUv.x - vAge * 0.015, vUv.y * 0.55 + vAge * 0.01));
    vec4 t2 = texture2D(map, vec2(vUv.x * 2.3 + 0.37, vUv.y * 0.9 - vAge * 0.02));
    float dens = t.a * 0.65 + t2.a * 0.35;
    float edge = exp(-pow(v * 1.25, 2.0));
    float cl = smoothstep(0.1, 0.7, dens * (0.55 + 0.75 * edge) + 0.25 * edge - 0.1);   // рваный силуэт клубов
    float a = vAl * cl * (0.55 + 0.45 * edge) * fxSoft(6.0);
    if (a < 0.004) discard;
    vec3 c = vCol * uLight * mix(0.58, 1.08, t.r) * (0.86 + 0.22 * vSh * (1.0 - 0.5 * edge));
    gl_FragColor = vec4(mix(c, fogColor, vF), clamp(a, 0.0, 1.0));
    #include <tonemapping_fragment>
    #include <encodings_fragment>
  }`;
export function createPlumes(scene, P = {}) {
  const MAXV = P.fxLo ? 8000 : 20000, MAXP = 260;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(MAXV * 3), tan = new Float32Array(MAXV * 3), A = new Float32Array(MAXV * 4), B = new Float32Array(MAXV * 4), C = new Float32Array(MAXV * 3);
  const idx = new Uint32Array(MAXV * 3);
  const at = (n, a, s) => { const b = new THREE.BufferAttribute(a, s); b.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(n, b); return b; };
  const SD = new Float32Array(MAXV); const aPos = at('position', pos, 3), aTan = at('aTan', tan, 3), aA = at('aA', A, 4), aB = at('aB', B, 4), aC = at('aCol', C, 3), aS = at('aSeed', SD, 1);
  geo.setIndex(new THREE.BufferAttribute(idx, 1)); geo.index.setUsage(THREE.DynamicDrawUsage); geo.setDrawRange(0, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: smokeTex }, uTime: { value: 0 }, uWind: { value: new THREE.Vector3(2, 0, 1) }, uLight: { value: new THREE.Vector3(0.9, 0.9, 0.9) }, uSun: { value: new THREE.Vector3(0.4, 0.8, 0.4).normalize() }, fogColor: { value: FOG_LIN }, fogDensity: FOG_U, ...FXU },
    vertexShader: SM_V, fragmentShader: SM_F, transparent: true, depthWrite: false, side: THREE.DoubleSide, extensions: { fragDepth: true },
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 2; scene.add(mesh);
  const trails = new Map(); let time = 0;
  return {
    mesh, mat,
    // точка следа у среза сопла: obj — ракета (ключ ленты), m — MOTOR.*, r — радиус корпуса, y — высота
    add(obj, x, y, z, m, r) {
      if (!m || m.a < 0.02) return;
      let T = trails.get(obj);
      if (!T) { T = { pts: [], end: 0, seed: Math.random() }; trails.set(obj, T); }
      const L = T.pts[T.pts.length - 1];
      if (L && time - L.t < 0.02) return;
      const e = 1 - air(y), rr = Math.max(0.03, r);
      const p = { x, y, z, t: time, w: Math.max(0.6, rr * m.w) * (1 + 1.2 * e), g: (m.g[0] + rr * m.g[1]) * (1 + 0.6 * e), life: (m.life[0] + rr * m.life[1]) * (0.7 + 0.3 * (1 - e)),
        a: Math.min(1, m.a * Math.min(1.2, 0.8 + rr * 2)) * (1 - 0.45 * e), rise: 0.25 + rr * 1.5, c: m.c, u: L ? L.u + Math.hypot(x - L.x, y - L.y, z - L.z) : 0 };
      T.pts.push(p); T.end = Math.max(T.end, time + p.life);
      if (T.pts.length > MAXP) { const o = T.pts; T.pts = o.filter((q, i) => i >= o.length / 2 || i % 2 === 0); } // длинная лента — старая половина реже
    },
    clear() { trails.clear(); geo.setDrawRange(0, 0); },
    update(dt, light, wind, sun) {
      time += dt; mat.uniforms.uTime.value = time; if (light) mat.uniforms.uLight.value.copy(light); if (sun) mat.uniforms.uSun.value.copy(sun); if (wind) mat.uniforms.uWind.value.set(wind.x, 0, wind.z);
      let v = 0, ii = 0;
      for (const [k, T] of trails) {
        if (time > T.end) { trails.delete(k); continue; }
        const p = T.pts; while (p.length > 2 && time - p[0].t > p[0].life && time - p[1].t > p[1].life) p.shift();
        if (p.length < 2 || v + p.length * 2 > MAXV) continue;
        const v0 = v;
        for (let i = 0; i < p.length; i++) {
          const q = p[i], a = p[Math.max(0, i - 1)], b = p[Math.min(p.length - 1, i + 1)];
          let tx = b.x - a.x, ty = b.y - a.y, tz = b.z - a.z; if (tx * tx + ty * ty + tz * tz < 1e-8) { tx = 0; ty = 0; tz = 1; }
          const fade = i === p.length - 1 ? 0 : 1; // свежий конец — тонкий хвост у сопла
          for (const s of [-1, 1]) {
            const j = v * 3, j4 = v * 4;
            pos[j] = q.x; pos[j + 1] = q.y; pos[j + 2] = q.z; tan[j] = tx; tan[j + 1] = ty; tan[j + 2] = tz; C[j] = q.c[0]; C[j + 1] = q.c[1]; C[j + 2] = q.c[2];
            SD[v] = T.seed; A[j4] = q.t; A[j4 + 1] = s; A[j4 + 2] = q.w; A[j4 + 3] = q.a * fade; B[j4] = q.g; B[j4 + 1] = q.life; B[j4 + 2] = q.u; B[j4 + 3] = q.rise; v++;
          }
        }
        for (let i = 0; i < p.length - 1; i++) { const a = v0 + i * 2; idx[ii++] = a; idx[ii++] = a + 1; idx[ii++] = a + 2; idx[ii++] = a + 1; idx[ii++] = a + 3; idx[ii++] = a + 2; }
      }
      for (const b of [aPos, aTan, aA, aB, aC, aS]) { b.updateRange.offset = 0; b.updateRange.count = v * b.itemSize; b.needsUpdate = true; }
      geo.index.updateRange.offset = 0; geo.index.updateRange.count = ii; geo.index.needsUpdate = true; geo.setDrawRange(0, ii);
    },
  };
}
