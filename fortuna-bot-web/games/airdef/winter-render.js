// Зимняя карта (map-winter.js) — отрисовка земли, погода и лес. Остальное (небо, свет, облака, дома, объекты, импосторы
// деревьев) — общее с городом (city-render.js). Земля: снег (детали 7 м и снимок с высоты 420 м), скалы на крутых склонах
// и гребнях, лёд с наметёнными пятнами снега, хвойная крона издали (лес читается лесом между редкими импосторами),
// укатанный снег и асфальт у базы, ВПП. Нормали — из сетки высот (50 м): склоны освещены точнее, чем грубая сетка земли.
/* global THREE */
import { tr } from './i18n.js?v=20261027d';
import { ZONE } from './city.js?v=20261027d';
import { WINTER } from './map-winter.js?v=20261027d';
import { NOISE_ON, NOISE_GLSL, noiseTex } from './noise-tex.js?v=20261027d';
import { FAR_U, FAR_GLSL, groundShadowChunk } from './ground-far.js?v=20261027d';
import { ktxOn, ktxLoad } from './ktx.js?v=20261027d';

// погода зимней карты (панорамы — Poly Haven, CC0): ясный мороз, морозная дымка, пасмурно со снегом
export function winterWeathers(W) {
  const D = W.day, O = W.overcast;
  return {
    w_clear: { ...D, name: tr('Мороз, ясно'), el: 17.8, az: 140, sun: 0xffeedd, sunI: 1.15, sky: 0x8eaad0, gnd: 0x7c8898, hemiI: 0.8, zenith: 0x3c64a8, horizon: 0xc4d6ea,
      haze: 0xffe2c0, hazeK: 0.18, fog: 0xc4d4e4, fogD: 0.000048, clouds: 0.35, cloudLit: 0xfffaf4, cloudDark: 0x9eacbe, hdri: { f: 'w_pass', u: 0.6003, k: 1, h0: 0.12 }, winter: 1 },
    w_frost: { ...D, name: tr('Морозная дымка'), el: 28.2, az: 200, sun: 0xfff2e2, sunI: 1.05, sky: 0x9cb0cc, gnd: 0x808a98, hemiI: 0.85, zenith: 0x48618c, horizon: 0xc8d4e2,
      haze: 0xfff0e0, hazeK: 0.25, fog: 0xc8d2de, fogD: 0.00008, clouds: 0.2, cloudLit: 0xffffff, cloudDark: 0xa4b0c0, hdri: { f: 'w_horn', u: 0.5999, k: 1, h0: 0.11 }, winter: 1 },
    w_snow: { ...O, name: tr('Снегопад'), sun: 0xe4eaf2, sunI: 0.45, sky: 0xb4bdc8, gnd: 0x8c949e, hemiI: 1.0, zenith: 0x8a96a4, horizon: 0xc6ced6,
      fog: 0xc2cad4, fogD: 0.00012, clouds: 0.5, cloudLit: 0xe2e6ea, cloudDark: 0x8c96a2, hdri: { f: 'w_field', u: 0.6189, k: 1, h0: 0.04 }, winter: 1, snow: 1 },
  };
}
export const WINTER_KEYS = ['w_clear', 'w_frost', 'w_snow'];

// районы → текстура: r — лес, g — лёд, b — база и площадки, a — посёлок (сглажено ~100 м)
export function winterZoneTex(city, size) {
  const H = 16000, d = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const x = -H + (i + 0.5) * 2 * H / size, z = -H + (j + 0.5) * 2 * H / size, zn = city.zoneAt(x, z), q = (j * size + i) * 4;
    d[q] = zn === ZONE.PARK ? 255 : 0; d[q + 1] = zn === ZONE.WATER ? 255 : 0; d[q + 2] = zn === ZONE.AIR || zn === ZONE.IND ? 255 : 0; d[q + 3] = zn === ZONE.LOW ? 255 : 0;
  }
  const t = new THREE.DataTexture(d, size, size, THREE.RGBAFormat); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.flipY = false; t.needsUpdate = true;
  return t;
}
// нормали земли из сетки высот (мировые оси, RGB)
export function winterNormalTex(city) {
  const N = city.HN, R = city.HRES, HM = city.HM, d = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const hx = HM[j * N + Math.min(N - 1, i + 1)] - HM[j * N + Math.max(0, i - 1)], hz = HM[Math.min(N - 1, j + 1) * N + i] - HM[Math.max(0, j - 1) * N + i];
    let nx = -hx / (2 * R), ny = 1, nz = -hz / (2 * R); const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const q = (j * N + i) * 4; d[q] = (nx * 0.5 + 0.5) * 255; d[q + 1] = (ny * 0.5 + 0.5) * 255; d[q + 2] = (nz * 0.5 + 0.5) * 255; d[q + 3] = 255;
  }
  const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.flipY = false; t.needsUpdate = true;
  return t;
}
// текстуры зимы (tex/w_*.jpg): снег, снимок снега с высоты, скала, скалы с высоты, лёд, асфальт со снегом
const WTEX = { wSn: 'w_snow', wSnN: 'w_snow_n', wSA: 'w_snowA', wRk: 'w_rock', wRA: 'w_rockA', wIce: 'w_ice', wAs: 'w_asph' };
const WCOARSE = new Set(['wSA', 'wRA']); // снимки с высоты (плитка 300–1900 м) — без анизотропии: крупный рисунок не мылится, а выборка втрое дешевле (ground-far.js)
// мелкие (снег, скала, лёд, асфальт) — не больше 4, как у осени: вдали они и так средним цветом
export function winterTextures(aniso, stats) {
  const U = {};
  for (const [u, f] of Object.entries(WTEX)) {
    const t = new THREE.Texture(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = WCOARSE.has(u) ? 1 : Math.min(4, aniso); t.minFilter = THREE.LinearMipmapLinearFilter; U[u] = { value: t };
    if (typeof createImageBitmap !== 'function' || typeof fetch !== 'function') continue;
    if (stats) stats.req++;
    const jpg = () => fetch(new URL(`./tex/${f}.jpg?v=20261021a`, import.meta.url)).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(f)))).then((b) => createImageBitmap(b))
      .then((bmp) => { t.image = bmp; t.needsUpdate = true; if (stats) stats.done++; }).catch((e) => { if (stats) stats.done++; console.warn('зимняя текстура не загрузилась:', e.message); });
    // KTX2 (Mark 2026-10-25: «сжать текстуры земли без значительной потери»; tools/airdef-tex/ktx.js): в памяти видеокарты ≈ 8 бит на пиксель
    // против 32 у JPEG; нет поддержки, ?ktx=0 или ошибка — прежний JPEG
    if (ktxOn()) ktxLoad(f).then((k) => { k.wrapS = k.wrapT = THREE.RepeatWrapping; k.anisotropy = t.anisotropy; U[u].value = k; if (stats) stats.done++; }).catch(() => jpg());
    else jpg();
  }
  return U;
}
// цвет земли в точке P (мир) на расстоянии dist: rgb — цвет, a — морозная дымка низин без множителя расстояния. Один код — у материала и у
// запекания (ground-bake.js: dist = 1e6 — дальше 1,6 км цвет от камеры не зависит). wN — нормаль рельефа (задаёт вызывающий)
function wGroundGLSL(H) {
  return `vec4 aGround(vec3 P, float dist) {
  vec2 mp = (P.xz + ${H.toFixed(1)}) / ${(2 * H).toFixed(1)};
  vec4 Z = texture2D(tZ, mp);
  float slope = 1.0 - wN.y, hgt = P.y, near = 1.0 - smoothstep(250.0, 1400.0, dist);
  // снег: снимок с высоты (крупные пятна, кусты) и мелкий рельеф вблизи; на солнце почти белый, в низинах — голубее
  vec3 sA = texture2D(wSA, P.xz / 420.0).rgb, sA2 = texture2D(wSA, P.xz / 1900.0 + 0.37).rgb;
  float dS = near > 0.0 ? lum(texF(wSn, P.xz, 7.0, vec2(0.0)).rgb) / 0.82 : 1.0;
  vec3 snow = vec3(0.8, 0.83, 0.88) * mix(1.0, dS, 0.4 * near) * mix(vec3(1.0), sA * sA / 0.62, 0.35) * mix(vec3(1.0), sA2 * sA2 / 0.62, 0.25);
  // скалы: крутые склоны и выдутые ветром гребни (рисунок — из текстур, цвет — серый камень)
  float rA = lum(texture2D(wRA, P.xz / 300.0).rgb), rl = near > 0.0 ? lum(texF(wRk, P.xz, 24.0, vec2(0.0)).rgb) : 0.5;
  vec3 rock = vec3(0.13, 0.125, 0.12) * (0.55 + 0.9 * rA) * mix(1.0, 0.6 + 0.8 * rl, near);
  float rk = smoothstep(0.2, 0.36, slope + 0.14 * (rA - 0.5) + 0.1 * (vn(P.xz / 60.0) - 0.5));
  rk = max(rk, smoothstep(1250.0, 1650.0, hgt) * smoothstep(0.1, 0.26, slope + 0.1 * (rA - 0.5)));
  vec3 col = mix(snow, rock, rk);
  // лес: издали — хвойная крона со снегом (импосторы редкие), вблизи под деревьями — притоптанный снег
  // край леса — рваный (шум двух масштабов), внутри — куртины и прогалины
  float fr = smoothstep(0.2, 0.8, Z.r + 0.5 * (vn(P.xz / 160.0) - 0.5) + 0.3 * (vn(P.xz / 45.0) - 0.5)), far = smoothstep(300.0, 1600.0, dist);
  vec3 canopy = mix(vec3(0.04, 0.06, 0.047), vec3(0.6, 0.63, 0.67), 0.12 + 0.2 * vn(P.xz / 35.0) + 0.12 * vn(P.xz / 7.0)); // хвоя со снегом
  col = mix(col, canopy, fr * far * (0.6 + 0.3 * vn(P.xz / 22.0))); col *= mix(1.0, 0.88, fr * (1.0 - far));
  // лёд: голубовато-серый с наметёнными полосами снега
  float ip = smoothstep(0.35, 0.7, vn(P.xz / 140.0) * 0.7 + vn(P.xz / 23.0) * 0.3);
  // берег — по высоте над уровнем льда (линия идёт по рельефу, а не по клеткам), у кромки — наметённый снег
  float iceY = P.z < uIce.z ? uIce.x : max(uIce.y, 144.0 - P.z * 0.004);
  float ik = smoothstep(0.0, 0.3, Z.g) * (1.0 - smoothstep(0.1, 1.2, hgt - iceY + 1.6 * (vn(P.xz / 40.0) - 0.5) + 0.6 * (vn(P.xz / 9.0) - 0.5)));
  vec3 ice = mix(vec3(0.33, 0.43, 0.5) * (0.85 + 0.3 * lum(texF(wIce, P.xz, 30.0, vec2(0.0)).rgb)), snow, max(ip * 0.8, 1.0 - smoothstep(0.35, 0.9, ik)));
  col = mix(col, ice, ik);
  // база и площадки: укатанный снег с колеями, местами асфальт; посёлок — снег серее
  float as = lum(texF(wAs, P.xz, 6.0, vec2(0.0)).rgb);
  // площадки: край — размытый и рваный (среднее по 4 точкам вокруг, ~90 м, со сдвигом по шуму)
  vec2 jo = (vec2(vn(P.xz / 70.0), vn(P.xz / 70.0 + 5.3)) - 0.5) * 120.0;
  float zbB = 0.0; for (int k = 0; k < 4; k++) { vec2 o = vec2(k == 0 ? 90.0 : k == 1 ? -90.0 : 0.0, k == 2 ? 90.0 : k == 3 ? -90.0 : 0.0); zbB += texture2D(tZ, (P.xz + o + jo + ${H.toFixed(1)}) / ${(2 * H).toFixed(1)}).b; }
  float zb = smoothstep(0.25, 0.85, 0.4 * Z.b + 0.15 * zbB + 0.3 * (vn(P.xz / 45.0) - 0.5)), za = smoothstep(0.1, 0.9, Z.a + 0.4 * (vn(P.xz / 80.0) - 0.5));
  col = mix(col, mix(col * 0.8, vec3(0.3, 0.31, 0.32) * (0.7 + 0.6 * as), 0.3 + 0.25 * vn(P.xz / 40.0)), zb * 0.85);
  col = mix(col, col * vec3(0.82, 0.83, 0.85), za * 0.7);
  // ВПП (вдоль Z): расчищенный асфальт, осевая, снежные кромки
  vec2 rp = vec2(abs(P.x - uAir.x), abs(P.z - uAir.y));
  if (rp.y < uAir.z && rp.x < uAir.w + 12.0) {
    float edge = smoothstep(uAir.w - 4.0, uAir.w + 8.0, rp.x + 6.0 * vn(P.xz / 9.0));
    vec3 rw = vec3(0.16, 0.165, 0.17) * (0.75 + 0.5 * as);
    rw = mix(rw, vec3(0.85), step(rp.x, 0.5) * step(0.5, fract(P.z / 60.0)) * (1.0 - edge));
    col = mix(rw, col, edge);
  }
  // морозная дымка в низинах (вдали над дном долины — белёсая пелена, вершины над ней): множитель расстояния — у вызывающего
  return vec4(col, 1.0 - smoothstep(60.0, 520.0, hgt - 140.0));
}
`;
}
const wHeadGLSL = () => `uniform vec4 uAir, uIce; uniform sampler2D tZ, tNm, wSn, wSnN, wSA, wRk, wRA, wIce, wAs;
      float lum(vec3 c) { return dot(c, vec3(0.3, 0.59, 0.11)); }
      float hs(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      ${NOISE_ON ? NOISE_GLSL + 'float vn(vec2 p) { return vnt(p); } // шум — текстурой (noise-tex.js), как у осени' : 'float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hs(i), hs(i + vec2(1, 0)), f.x), mix(hs(i + vec2(0, 1)), hs(i + vec2(1, 1)), f.x), f.y); }'}
      vec3 wN;
      ${FAR_GLSL}
`;
// материал земли: Phong (свет, тени, туман — как у остального), цвет и нормаль — в шейдере. bake — запечённый цвет дальней земли (ground-bake.js)
export function winterGroundMaterial(city, zt, nt, ENV, WT, bake) {
  const a = city.airport, H = 16000;
  const m = new THREE.MeshPhongMaterial({ color: 0xffffff, specular: 0x101418, shininess: 14 }); m.userData.WT = WT; m.userData.AT = WT; m.userData.farU = FAR_U;
  m.extensions = { derivatives: true, shaderTextureLOD: true }; // земля вдали (ground-far.js) — на WebGL 1; на WebGL 2 и так есть
  const GU = { uFar: FAR_U, tZ: { value: zt }, tNm: { value: nt }, tNoise: { value: NOISE_ON ? noiseTex() : null }, uAir: { value: new THREE.Vector4(a.x, a.z, a.rwyL / 2, a.rwyW / 2) },
    uIce: { value: new THREE.Vector4(WINTER.LAKE_N_Y, WINTER.LAKE_S_Y, WINTER.DAM_Z, 0) } };
  m.userData.GU = GU; m.userData.groundGLSL = () => wHeadGLSL() + wGroundGLSL(H); // для запекания — те же текстуры и код
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, WT, GU, { uCam: ENV.uCam }, bake ? bake.U : {});
    sh.vertexShader = 'varying vec3 vWp;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = `varying vec3 vWp; uniform vec3 uCam;
      ${wHeadGLSL()}${wGroundGLSL(H)}${bake ? bake.GLSL : ''}
` + sh.fragmentShader.replace('#include <shadowmap_pars_fragment>', groundShadowChunk())
      .replace('#include <color_fragment>', `#include <color_fragment>
  farInit(vWp.xz); // мелкие текстуры вдали — средним цветом (texF, ground-far.js); вблизи — только при ненулевом весе
  wN = normalize(texture2D(tNm, (vWp.xz + ${H.toFixed(1)}) / ${(2 * H).toFixed(1)}).xyz * 2.0 - 1.0);
  float dist = length(vWp - uCam);
  ${bake ? `float bk = bakeK(dist, vWp.xz); vec4 gC = vec4(0.0); // дальняя земля — запечённый цвет (ground-bake.js); в полосе перехода — смесь
  if (bk < 1.0) gC = aGround(vWp, dist);
  if (bk > 0.0) gC = mix(gC, bakeAt(vWp.xz), bk);` : 'vec4 gC = aGround(vWp, dist);'}
  diffuseColor.rgb = mix(gC.rgb, vec3(0.8, 0.84, 0.9), gC.a * smoothstep(1500.0, 9000.0, dist) * 0.55);`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
  // мелкий рельеф снега (сугробы, наст): нормали текстуры в двух масштабах, вблизи сильнее; на скалах — слабее
  float nw = 1.0 - smoothstep(150.0, 900.0, length(vWp - uCam));
  vec2 nd = (nw > 0.0 ? (texF(wSnN, vWp.xz, 6.0, vec2(0.0)).xy - 0.5) * 0.9 * nw : vec2(0.0)) + (texture2D(wSnN, vWp.xz / 55.0 + 0.5).xy - 0.5) * 0.5;
  vec3 wn2 = normalize(wN + vec3(nd.x, 0.0, -nd.y));
  normal = normalize((viewMatrix * vec4(wn2, 0.0)).xyz);`);
  };
  return m;
}
// лес: ели и сосны (вблизи — модели, вдали — импосторы) по району «лес» — в 8 раз больше городских деревьев, куртинами; елей ~¾:
// центр куртины — случайная точка леса, вокруг неё 6–14 деревьев в радиусе 40–90 м
export function winterTrees(city, P, rnd, gh = city.groundH) {
  const tl = [], want = Math.round((P.trees || 0) * 12), H = 15500;
  for (let t = 0; t < want && tl.length < want; t++) {
    const cx = (rnd() * 2 - 1) * H, cz = (rnd() * 2 - 1) * H;
    if (city.zoneAt(cx, cz) !== ZONE.PARK) continue;
    const k = 8 + Math.floor(rnd() * 12), R = 25 + rnd() * 40;
    for (let c = 0; c < k && tl.length < want; c++) {
    const a = rnd() * 6.283, r = Math.sqrt(rnd()) * R, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    if (city.zoneAt(x, z) !== ZONE.PARK) continue;
    const ht = 11 + rnd() * 11;
    const sp = rnd(); tl.push({ x, z, y: gh(x, z) - 0.6, sy: ht / 1.3, v: sp < 0.42 ? 0 : sp < 0.78 ? 1 : sp < 0.9 ? 2 : 3, color: new THREE.Color(0.05, 0.06, 0.05), ry: rnd() * 6.283 });
    }
  }
  return tl;
}
// снегопад: хлопья в кубе B вокруг камеры (один вызов отрисовки); падают и сносятся ветром, у краёв куба и вплотную к камере
// гаснут. n — по пресету (P.particles)
export function makeSnowfall(scene, n, W) {
  const B = 360, g = new THREE.BufferGeometry(), p = new Float32Array(n * 3), r = new Float32Array(n);
  for (let i = 0; i < n; i++) { p[i * 3] = Math.random(); p[i * 3 + 1] = Math.random(); p[i * 3 + 2] = Math.random(); r[i] = Math.random(); }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('aR', new THREE.BufferAttribute(r, 1));
  const U = { uCam: { value: new THREE.Vector3() }, uT: { value: 0 }, uPx: { value: 1 }, uCol: { value: new THREE.Color(W.fog).convertSRGBToLinear().lerp(new THREE.Color(1, 1, 1), 0.6) } };
  const mat = new THREE.ShaderMaterial({ uniforms: U, transparent: true, depthWrite: false,
    vertexShader: `attribute float aR; uniform vec3 uCam; uniform float uT, uPx; varying float vA;
      void main() {
        vec3 drift = vec3(2.6, -1.4 - aR * 0.9, 1.1) * uT + vec3(sin(uT * 0.7 + aR * 40.0), 0.0, cos(uT * 0.6 + aR * 31.0)) * 1.5;
        vec3 w = mod(position * ${B.toFixed(1)} + drift - uCam, ${B.toFixed(1)}) - ${(B / 2).toFixed(1)} + uCam; // куб следует за камерой
        vec4 mv = viewMatrix * vec4(w, 1.0); float d = -mv.z;
        vA = smoothstep(${(B / 2).toFixed(1)}, ${(B * 0.3).toFixed(1)}, length(w - uCam)) * smoothstep(1.5, 6.0, d);
        gl_PointSize = clamp(uPx * (0.9 + aR) * 9.0 / max(d, 1.0), 1.0, 6.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform vec3 uCol; varying float vA;
      void main() { vec2 q = gl_PointCoord - 0.5; float a = vA * (1.0 - smoothstep(0.2, 0.5, length(q))); if (a < 0.02) discard; gl_FragColor = vec4(uCol, a * 0.85); }`,
  });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.renderOrder = 3; scene.add(pts);
  return { pts, update(cam, t, pxH) { U.uCam.value.copy(cam.position); U.uT.value = t; U.uPx.value = pxH / 720 * 60; } };
}
// дороги: ленты по рельефу (чуть выше земли, сдвиг глубины), укатанный снег и асфальт; у льда — мост на 3 м выше
export function winterRoads(scene, city, WT, P, gh = city.groundH) {
  const pos = [], uv = [], idx = [];
  for (const r of city.roads || []) {
    const pts = []; // через 15 м
    for (let i = 0; i < r.pts.length - 1; i++) { const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 15)); for (let k = 0; k < n; k++) pts.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]); }
    pts.push(r.pts[r.pts.length - 1]);
    let along = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x, z] = pts[i], [px, pz] = pts[Math.max(0, i - 1)], [nx, nz] = pts[Math.min(pts.length - 1, i + 1)], dx = nx - px, dz = nz - pz, l = Math.hypot(dx, dz) || 1, ox = -dz / l * r.w / 2, oz = dx / l * r.w / 2;
      if (i) along += Math.hypot(x - px, z - pz) / (i === 1 ? 2 : 2);
      const y = (xx, zz) => gh(xx, zz) + (city.iceAt && city.iceAt(xx, zz) ? 3 : 0.35);
      const b = pos.length / 3; pos.push(x + ox, y(x + ox, z + oz), z + oz, x - ox, y(x - ox, z - oz), z - oz); uv.push(0, along / r.w, 1, along / r.w);
      if (i) idx.push(b - 2, b - 1, b, b - 1, b + 1, b);
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.MeshPhongMaterial({ color: 0xffffff, specular: 0x101010, shininess: 10, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { wAs: WT.wAs, wSn: WT.wSn });
    sh.vertexShader = 'varying vec2 vR; varying vec3 vWq;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n vR = uv;').replace('#include <project_vertex>', '#include <project_vertex>\n vWq = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'varying vec2 vR; varying vec3 vWq; uniform sampler2D wAs, wSn;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  float e = abs(vR.x - 0.5) * 2.0, as = dot(texture2D(wAs, vWq.xz / 6.0).rgb, vec3(0.33));
  float tr = smoothstep(0.55, 0.75, abs(fract(vR.x * 2.0) - 0.5) * 2.0); // колеи
  vec3 c = mix(vec3(0.2, 0.205, 0.21) * (0.7 + 0.6 * as), vec3(0.72, 0.74, 0.78), 0.12 + 0.3 * tr); // расчищенный асфальт, снег в колеях
  c = mix(c, vec3(0.86, 0.88, 0.92), smoothstep(0.7, 1.0, e)); // снежные обочины
  diffuseColor.rgb = c;`);
  };
  const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = !!P.shadows; scene.add(mesh); return mesh;
}
