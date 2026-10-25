// Отрисовка мегаполиса (three.js r128). Геометрию города даёт city.js — тот же город, что видит симуляция.
//  • Атмосфера и погода — из «Летки» (world.js): физическое небо, воздушная перспектива (дымка гуще внизу и
//    подсвечена со стороны солнца), палитры погоды. Все материалы — Phong: ему three.js передаёт позицию камеры,
//    без неё не работают ни дымка, ни отражения.
//  • Здания — инстансы коробок по плиткам 2×2 км (плитки отсекаются по виду и дальности). Фасад целиком в шейдере:
//    окна сеткой по размеру фасада (с простенками у углов), у каждого окна свой оттенок (шторы, жалюзи), ночью часть
//    окон горит; панельные швы и балконы, ленточные окна офисов, витражи стеклянных башен с отражением неба и бликом
//    солнца, витрины первого этажа; затенение у земли и в углах (как от рассеянного света), парапеты крыш.
//    Высокие башни — ступенями; на крышах — надстройки; у частных домов — скатные крыши.
//  • Земля: районы из текстуры, улицы, тротуары, разметка и «зебры» — в шейдере; дворы с газонами; затенение земли
//    у домов (запечённое из сетки высот застройки); шум, чтобы не было плоской заливки.
//  • Река с волнами и отражением неба, деревья в парках и вдоль улиц, облака-«пуховки» (один вызов отрисовки).
/* global THREE */
import { CITY, ZONE, KIND, AIRPORT, groundH, zoneAt, riverX, mulberry32, lineW, RN, RS, RURAL_HW } from './city.js?v=20261026a';
import { part, mergeParts, M } from '../drone/models.js?v=20261026a';
import { WEATHERS, ATMO, skyMaterial, skyUniforms, skyPano, SKY, FXU } from '../drone/world.js?v=20261026a';
import { ktxOn, ktxLoad, ktxMeta } from './ktx.js?v=20261026a';
import { winterWeathers, winterZoneTex, winterNormalTex, winterTextures, winterGroundMaterial, winterTrees, makeSnowfall, winterRoads } from './winter-render.js?v=20261026a';
import { autumnWeathers, autumnZoneTex, autumnTextures, autumnGroundMaterial, autumnTrees, autumnRoads, autumnWaterMask, autumnProps } from './autumn-render.js?v=20261026a';
Object.assign(WEATHERS, winterWeathers(WEATHERS), autumnWeathers(WEATHERS)); // зимние и осенние погоды — только в «Воздушном превосходстве»
// высота земли и районы — у текущей карты (город — city.js, зима — map-winter.js); выставляет buildCityScene
let GH = groundH, ZA = zoneAt;
import { MeshoptSimplifier } from './vendor/meshopt_simplifier.module.js?v=20261026a'; // MIT, meshoptimizer 0.21
import { bakeGroup } from './merge.js?v=20261026a';
import { NOISE_ON, NOISE_GLSL, noiseTex } from './noise-tex.js?v=20261026a';
import { FAR_U, groundShadowChunk } from './ground-far.js?v=20261026a';

const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();
const TILE = 3000; // плитка инстансов: 3 км — на 20 % меньше вызовов отрисовки, чем 2 км, при почти тех же треугольниках
const ROOFX = 6, ROOF = 7; // виды только для отрисовки: надстройки на крышах и скатные крыши домов

// ═════════════ Общие uniform'ы ═════════════
export const UPX = { value: 0.0015 }; // размер пикселя на 1 м расстояния (сглаживание линий и окон, переход к среднему цвету)
export const ENV = {
  uCam: { value: new THREE.Vector3() }, uPx: UPX, uSun: { value: new THREE.Vector3(0.4, 0.7, 0.4).normalize() },
  uZen: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uGnd: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() },
  uNight: { value: 0 }, uTime: { value: 0 }, uSnowK: { value: 0 }, // uSnowK — снег на крышах и уступах (зимняя карта)
  uMdlCol: { value: Array.from({ length: 24 }, () => new THREE.Vector4(0, 0, 0, 0)) }, // средний цвет модели вида (w = 1 — есть): дальняя коробка — в цвет своей модели
  uMdl: { value: new Array(24).fill(0) }, // радиус, в котором коробки вида дома скрыты (вместо них — модели; 0 — модели нет)
  uHide: { value: new THREE.Vector3() }, // центр этого радиуса: камера (в окне ТВ — точка, куда смотрит контейнер)
};
// ═════════════ Текстуры (ambientCG и Poly Haven, CC0): земля, дороги, обочины, тротуары, крыши, фасады ═════════════
// грузятся в фоне (fetch + createImageBitmap); пока не пришли все — uTexOn = 0 и шейдеры обходятся без них
export const TEX = { uTexOn: { value: 0 }, tGN: { value: packNormals() }, uAvgGG: { value: new THREE.Vector3(1, 1, 1) }, uAvgGD: { value: new THREE.Vector3(1, 1, 1) }, uAvgGF: { value: new THREE.Vector3(1, 1, 1) }, uAvgGA: { value: new THREE.Vector3(1, 1, 1) }, uAvgFG: { value: new THREE.Vector3(1, 1, 1) }, uAvgSand: { value: new THREE.Vector3(1, 1, 1) } }; // uAvg* — средний цвет (линейный)
const TEX_FILES = { tGG: 'g_grass', tGGn: 'g_grass_n', tGD: 'g_dry', tGDn: 'g_dry_n', tGF: 'g_field', tGA: 'g_aerial', tFG: 'g_forest', tSand: 'g_sand', tWN: 'w_normals', // + лесная подстилка, песчаный берег (Poly Haven), волны (three.js, MIT) // земля: Poly Haven (CC0), цвет 1K и нормали (обе — в tGN)
  tAsph: 'p_asph', tGrav: 'p_grav', tConcP: 'p_conc', tIron: 'p_iron', tPave: 'paving', tConc: 'concrete', tRoof: 'roof', tOff: 'f_office', tGls: 'f_glass', tBrk: 'f_brick' };
// средний цвет картинки (линейный, как srgb() в шейдере — квадрат): уменьшенная копия 8×8
function avgColor(img) {
  const v = new THREE.Vector3(1, 1, 1);
  try { const c = document.createElement('canvas'); c.width = c.height = 8; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, 8, 8); const d = x.getImageData(0, 0, 8, 8).data; let r = 0, g = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += (d[i] / 255) ** 2; g += (d[i + 1] / 255) ** 2; b += (d[i + 2] / 255) ** 2; } const n = d.length / 4; v.set(r / n, g / n, b / n); } catch (_) { /* нет — 1 */ }
  return v;
}
// нормали травы и сухой земли — одной текстурой (у шейдера земли предел — 16 текстур): r, g — трава (x, y), b, a — сухая земля
function packNormals() { const t = new THREE.DataTexture(new Uint8Array([128, 128, 128, 128]), 1, 1, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; return t; }
const NRM = {};
function packNormalsFrom(key, bmp) {
  NRM[key] = bmp; if (!NRM.tGGn || !NRM.tGDn) return;
  try {
    const W = 512, c = document.createElement('canvas'); c.width = c.height = W; const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(NRM.tGGn, 0, 0, W, W); const a = x.getImageData(0, 0, W, W).data; x.drawImage(NRM.tGDn, 0, 0, W, W); const b = x.getImageData(0, 0, W, W).data;
    const d = new Uint8Array(W * W * 4); for (let i = 0; i < W * W; i++) { d[i * 4] = a[i * 4]; d[i * 4 + 1] = a[i * 4 + 1]; d[i * 4 + 2] = b[i * 4]; d[i * 4 + 3] = b[i * 4 + 1]; }
    const t = TEX.tGN.value; t.image = { data: d, width: W, height: W }; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  } catch (_) { /* без рельефа */ }
}
export const texStats = { req: 0, done: 0 }; // статус загрузки текстур города
function loadCityTextures(aniso) {
  if (TEX.tGG) return;
  let left = Object.keys(TEX_FILES).length; texStats.req = left;
  const done = () => { texStats.done++; if (--left === 0) TEX.uTexOn.value = 1; };
  // сжатые KTX2: нормали травы и сухой земли — уже одной текстурой (g_gn), средние цвета — из tex/ktx.json
  const viaKtx = ktxOn();
  if (viaKtx) { left -= 1; texStats.req = left; ktxMeta().then((m) => { for (const [u, c] of Object.entries(m.avg || {})) { const av = TEX['uAvg' + u.slice(1)]; if (av) av.value.set(c[0], c[1], c[2]); } }).catch(() => {}); }
  for (const [u, f] of Object.entries(TEX_FILES)) {
    const t = new THREE.Texture(); t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = u === 'tGA' ? 1 : aniso; t.minFilter = THREE.LinearMipmapLinearFilter; TEX[u] = { value: t }; // снимок с высоты (плитка 260 м) — без анизотропии (ground-far.js)
    if (typeof createImageBitmap !== 'function' || typeof fetch !== 'function') continue;
    if (viaKtx && (u === 'tGGn' || u === 'tGDn')) { if (u === 'tGGn') ktxLoad('g_gn').then((k) => { k.wrapS = k.wrapT = THREE.RepeatWrapping; TEX.tGN.value = k; done(); }).catch(() => done()); continue; }
    if (viaKtx) { ktxLoad(f).then((k) => { k.wrapS = k.wrapT = THREE.RepeatWrapping; k.anisotropy = t.anisotropy; TEX[u].value = k; done(); }).catch(() => jpg(u, f, t)); continue; }
    jpg(u, f, t);
  }
  function jpg(u, f, t) {
    fetch(new URL(`./tex/${f}.jpg?v=20261026a`, import.meta.url)).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(f))))
      .then((b) => createImageBitmap(b)).then((bmp) => { if (u === 'tGGn' || u === 'tGDn') packNormalsFrom(u, bmp); else { TEX[u].value = t; t.image = bmp; t.needsUpdate = true; } const av = TEX['uAvg' + u.slice(1)]; if (av && !viaKtx) av.value.copy(avgColor(bmp)); done(); })
      .catch((e) => { texStats.done++; console.warn('текстура не загрузилась:', e.message); });
  }
}
// яркость текстуры относительно её среднего (детализация поверх своего цвета); картинки — sRGB, без переворота
const GLSL_TEX = `
uniform sampler2D tAsph, tGrav, tIron, tPave, tConc, tRoof, tOff, tGls, tBrk, tGG, tGD, tGF, tGA, tGN, tFG, tSand; uniform float uTexOn; uniform vec3 uAvgGG, uAvgGD, uAvgGF, uAvgGA, uAvgFG, uAvgSand;
float riverX(float z) { return 1300.0 * sin(z * 0.00019 + 0.6) + 450.0 * sin(z * 0.00052 + 2.1) - 300.0; } // как city.js riverX
float dl(sampler2D t, vec2 uv, float avg) { return clamp(dot(texture2D(t, uv).rgb, vec3(0.3, 0.59, 0.11)) / avg, 0.35, 1.9); }
vec3 srgb(vec3 c) { return c * c; }
// цвет текстуры относительно её среднего (оттенок и яркость поверх цвета района); рельеф — по карте нормалей: насколько грань ярче ровной под солнцем
vec3 cr(sampler2D t, vec2 uv, vec3 avg) { return clamp(srgb(texture2D(t, uv).rgb) / max(avg, vec3(0.004)), 0.25, 2.6); }
float reliefN(vec2 nx, vec3 sun) { vec3 n = vec3(nx * 2.0 - 1.0, 0.0); n.z = sqrt(max(0.0, 1.0 - dot(n.xy, n.xy))); vec3 w = normalize(vec3(n.x, n.z * 1.6, -n.y)); float f = max(sun.y, 0.08); return clamp(dot(w, sun) / f, 0.55, 1.5); } // ровная грань — 1 при любом солнце (низкое — не темнее)
`;
const GLSL_COMMON = `
uniform vec3 uCam, uSun, uZen, uHor, uGnd, uSunCol; uniform float uPx, uNight, uTime;
float hsh(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vns(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hsh(i), hsh(i + vec2(1.0, 0.0)), f.x), mix(hsh(i + vec2(0.0, 1.0)), hsh(i + vec2(1.0, 1.0)), f.x), f.y); }
// небо в направлении d (для отражений): градиент, ореол солнца; ниже горизонта — тёмный город
vec3 skyAt(vec3 d) {
  vec3 c = d.y > 0.0 ? mix(uHor, uZen, pow(d.y, 0.45)) : mix(uHor * 0.6, uGnd, min(-d.y * 3.0, 1.0));
  float s = max(dot(d, uSun), 0.0);
  return c + uSunCol * (pow(s, 10.0) * 0.35 + pow(s, 300.0) * 3.0);
}
`;

// ═════════════ Земля ═════════════
// цвет района (sRGB) и покрытие: 0 — без улиц, 0,5 — мощёный (Сити, промзона, порт), 1 — жилой (дворы с газонами)
const ZCOL = { [ZONE.FIELD]: [0x74854c, 0], [ZONE.LOW]: [0x6a7450, 1], [ZONE.MID]: [0x6c7264, 1], [ZONE.CBD]: [0x6c6c6a, 0.5], [ZONE.IND]: [0x6e6a62, 0.5],
  [ZONE.PARK]: [0x4b6b35, 0.12], [ZONE.WATER]: [0x6e6a60, 0.04], [ZONE.AIR]: [0x7f8c62, 0.04], [ZONE.PORT]: [0x6c6a66, 0.5] }; // альфа 0 — поля за городом (лоскуты культур), 0,12 — парк (лесная подстилка), 0,04 — вода, аэродром
function zoneTexture(size) {
  const data = new Uint8Array(size * size * 4), c = new THREE.Color();
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const x = -CITY.HALF + (i + 0.5) * 2 * CITY.HALF / size, z = -CITY.HALF + (j + 0.5) * 2 * CITY.HALF / size;
    const [hex, urb] = ZCOL[ZA(x, z)];
    c.set(hex);
    const v = 0.9 + 0.2 * Math.sin(x * 0.0021 + Math.sin(z * 0.0013) * 2) * Math.sin(z * 0.0019 + 0.5); // поля и кварталы — пятнами
    const q = (j * size + i) * 4;
    data[q] = Math.min(255, c.r * 255 * v); data[q + 1] = Math.min(255, c.g * 255 * v); data[q + 2] = Math.min(255, c.b * 255 * v); data[q + 3] = urb * 255;
  }
  // границы районов — не ступенькой в текстель, а переходом ~120 м (окраина города плавно уходит в поле)
  const r = Math.max(1, Math.round(size / 1024 * 2)), tmp = new Float32Array(size * 4);
  const pass = (stride, step) => {
    for (let l = 0; l < size; l++) {
      const o = l * stride, s = [0, 0, 0, 0];
      for (let k = -r; k <= r; k++) { const q = o + Math.min(size - 1, Math.max(0, k)) * step; for (let c4 = 0; c4 < 4; c4++) s[c4] += data[q + c4]; }
      for (let i = 0; i < size; i++) {
        for (let c4 = 0; c4 < 4; c4++) tmp[i * 4 + c4] = s[c4] / (2 * r + 1) + 0.5;
        const qa = o + Math.min(size - 1, i + r + 1) * step, qb = o + Math.max(0, i - r) * step;
        for (let c4 = 0; c4 < 4; c4++) s[c4] += data[qa + c4] - data[qb + c4];
      }
      for (let i = 0; i < size; i++) for (let c4 = 0; c4 < 4; c4++) data[o + i * step + c4] = tmp[i * 4 + c4];
    }
  };
  for (let it = 0; it < 2; it++) { pass(size * 4, 4); pass(4, size * 4); }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.encoding = THREE.sRGBEncoding; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}
// затенение земли у зданий: доля застройки вокруг точки (размытая сетка высот) — «контактная тень» и тёмные дворы-колодцы
function aoTexture(city) {
  const N = city.GN, g = city.grid, a = new Float32Array(N * N), b = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) a[i] = g[i] > 0 ? Math.min(1, 0.45 + g[i] / 60) : 0; // высокие дома затеняют сильнее
  const blur = (src, dst, dx, dy) => {
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      let s = 0; for (let k = -2; k <= 2; k++) { const ii = Math.min(N - 1, Math.max(0, i + k * dx)), jj = Math.min(N - 1, Math.max(0, j + k * dy)); s += src[jj * N + ii]; }
      dst[j * N + i] = s / 5;
    }
  };
  blur(a, b, 1, 0); blur(b, a, 0, 1); blur(a, b, 1, 0); blur(b, a, 0, 1);
  const out = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) out[i] = Math.min(255, a[i] * 255);
  const t = new THREE.DataTexture(out, N, N, THREE.LuminanceFormat);
  t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
}
// дорожная сеть (city.RX/RZ) — текстура RS×RS: r — отрезок линии вдоль Z, g — вдоль X; 0 — нет, 0,5 — трасса, 1 — улица
function roadTexture(city) {
  const data = new Uint8Array(RS * RS * 4);
  for (let q = 0; q < RS * RS; q++) { data[q * 4] = city.RX[q] * 127; data[q * 4 + 1] = city.RZ[q] * 127; data[q * 4 + 3] = 255; }
  const t = new THREE.DataTexture(data, RS, RS, THREE.RGBAFormat);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.flipY = false; t.needsUpdate = true;
  return t;
}
function groundMaterial(tex, ao, road) {
  const m = new THREE.MeshPhongMaterial({ map: tex, specular: 0x0a0a0a, shininess: 8 }); m.userData.farU = FAR_U; m.userData.AT = TEX;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, ENV, TEX, { uFar: FAR_U, tAO: { value: ao }, tRoad: { value: road }, tNoise: { value: NOISE_ON ? noiseTex() : null }, uAir: { value: new THREE.Vector4(AIRPORT.x, AIRPORT.z, AIRPORT.rwyL / 2, AIRPORT.rwyW / 2) } });
    sh.vertexShader = 'varying vec3 vWp;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    const G = CITY.GRID.toFixed(1), AV = CITY.AVE_EVERY.toFixed(1), HA = (CITY.AVENUE / 2).toFixed(1), HS = (CITY.STREET / 2).toFixed(1);
    const RNf = RN.toFixed(1), RSf = RS.toFixed(1), HR = RURAL_HW.toFixed(1);
    // шум земли — текстурой (noise-tex.js): vns() здесь — 13 вызовов на пиксель по 4 хэша; в остальных шейдерах города vns прежний
    sh.fragmentShader = 'varying vec3 vWp; uniform sampler2D tAO, tRoad; uniform vec4 uAir; uniform float uFar;\n' + GLSL_COMMON + (NOISE_ON ? NOISE_GLSL + '#define vns vnt\n' : '') + GLSL_TEX + `
// вид отрезка дороги: линия i (вдоль Z) между j и j+1 — .r, линия j (вдоль X) между i и i+1 — .g
vec2 roadSeg(float i, float j) { return texture2D(tRoad, (vec2(i, j) + ${RNf} + 0.5) / ${RSf}).rg; }
// дорога вдоль линии сетки: o — смещение от оси, hw — полуширина, ave — проспект
void roadAt(float p, out float o, out float hw, out float ave) {
  float i = floor(p / ${G} + 0.5); o = p - i * ${G};
  ave = mod(i, ${AV}) < 0.5 ? 1.0 : 0.0; hw = ave > 0.5 ? ${HA} : ${HS};
}
` + sh.fragmentShader.replace('#include <shadowmap_pars_fragment>', groundShadowChunk()).replace('#include <map_fragment>', `#include <map_fragment>
  float urb = diffuseColor.a; diffuseColor.a = 1.0;
  float dist = length(vWp - uCam), px = max(0.05, dist * uPx), fine = 1.0 - smoothstep(0.4, 2.5, px);
  vec3 col = diffuseColor.rgb;
  // шум в двух масштабах: пятна покрытия, неровный тон
  float n1 = vns(vWp.xz / 23.0), n2 = vns(vWp.xz / 190.0 + 7.0);
  col *= 0.86 + 0.28 * n2;
  col *= mix(1.0, 0.9 + 0.2 * n1, fine);
  // текстуры вблизи: трава / бетон по цвету района, асфальт, плитка; дальше — их среднее (1)
  float tk = 0.0, dG = 1.0, dC = 1.0, dA = 1.0, dR = 1.0, dS = 1.0, dP = 1.0;
  if (uTexOn > 0.5) {
    tk = 1.0 - smoothstep(0.12, 1.0, px);
    if (tk > 0.0 || uFar == 0.0) { // вдали (вес 0) — без выборок (ground-far.js; ?gf=0 — как раньше)
    dG = mix(1.0, mix(dl(tGG, vWp.xz / 3.6, sqrt(dot(uAvgGG, vec3(0.3, 0.59, 0.11)))), dl(tGD, vWp.xz / 4.2, sqrt(dot(uAvgGD, vec3(0.3, 0.59, 0.11)))), smoothstep(0.55, 0.75, n2)), tk); dC = mix(1.0, dl(tConc, vWp.xz / 7.0, 0.364), tk); // трава с проплешинами сухой земли
    dA = mix(1.0, dl(tAsph, vWp.xz / 4.0, 0.351), tk); dP = mix(1.0, dl(tPave, vWp.xz / 2.5, 0.435), tk);
    dR = mix(1.0, dl(tAsph, vWp.xz / 7.0, 0.351), tk); dS = mix(1.0, dl(tGrav, vWp.xz / 2.5, 0.257), tk); // загородная трасса — латаный асфальт, обочина — щебень
    }
  }
  float gm = clamp((col.g - col.b) * 14.0, 0.0, 1.0); // зелень (трава, поля) — иначе бетон и грунт
  // ── поля за городом (альфа зоны 0): лоскуты 300–500 м — пастбище, пашня, пшеница, всходы рядами; межи — тёмные полосы
  float fm = 1.0 - smoothstep(0.0, 0.025, urb), plough = 0.0;
  if (fm > 0.001) {
    vec2 jit = vec2(vns(vWp.xz / 900.0 + 11.0), vns(vWp.xz / 900.0 + 23.0)) * 0.45;
    vec2 pc = vWp.xz / vec2(430.0, 340.0) + jit, pid = floor(pc), pf = fract(pc);
    float h = hsh(pid * 1.7 + 3.1), h2 = hsh(pid * 5.3 + 1.9), along = h2 > 0.5 ? vWp.x : vWp.z;
    vec3 crop = h < 0.3 ? vec3(0.38, 0.43, 0.25) : h < 0.55 ? vec3(0.4, 0.34, 0.26) : h < 0.78 ? vec3(0.5, 0.47, 0.33) : vec3(0.29, 0.36, 0.2); // приглушённо: пастбище, пашня, пшеница, всходы
    plough = step(0.3, h) * step(h, 0.55);
    crop = srgb(crop) * (0.88 + 0.24 * hsh(pid * 9.1 + 0.3)) * (0.92 + 0.16 * vns(vWp.xz / 60.0));
    float rows = (h > 0.55 || plough > 0.5) ? 1.0 - (1.0 - smoothstep(0.25, 0.9, px)) * 0.16 * (0.5 + 0.5 * sin(along * 1.2)) : 1.0; // борозды и рядки (гаснут, пока не пошла рябь)
    vec2 ed = min(pf, 1.0 - pf) * vec2(430.0, 340.0); float edge = 1.0 - smoothstep(2.0, 6.0 + px, min(ed.x, ed.y)); // межа / полевая дорога
    crop *= rows * (1.0 - 0.32 * edge);
    col = mix(col, crop, fm * 0.7);
  }
  // ── текстуры в трёх масштабах (с цветом): снимок с высоты (тайл 260 м) — виден всегда; трава / сухая земля (25–30 м) —
  //    до ~8 м на точку экрана; мелкая (3–4 м) — вблизи. Рельеф карт нормалей — на средней и мелкой
  if (uTexOn > 0.5) {
    float midK = 1.0 - smoothstep(2.0, 8.0, px), dryM = smoothstep(0.55, 0.75, n2);
    vec3 macro = cr(tGA, vWp.xz / 260.0, uAvgGA);
    col *= mix(vec3(1.0), macro, 0.4 * gm);
    float pm = smoothstep(0.07, 0.11, urb) * (1.0 - smoothstep(0.16, 0.24, urb)); // парк, перелесок — лесная подстилка
    { float pn = vns(vWp.xz / 45.0 + 17.0) * 0.7 + vns(vWp.xz / 11.0) * 0.3; // пятна: тёмная трава ↔ бурая подстилка под кронами
      col = mix(col, mix(srgb(vec3(0.24, 0.31, 0.15)), uAvgFG * 0.85, smoothstep(0.35, 0.7, pn)), pm * gm * 0.75); }
    bool mOn = midK > 0.0 || uFar == 0.0, nOn = tk > 0.0 || uFar == 0.0; // средние и мелкие текстуры — только где их вес не 0 (вдали без выборок)
    vec3 mid = mOn ? mix(mix(mix(cr(tGG, vWp.xz / 25.0, uAvgGG), cr(tGD, vWp.xz / 31.0, uAvgGD), dryM), cr(tGF, vWp.xz / 18.0, uAvgGF), plough * fm), cr(tFG, vWp.xz / 14.0, uAvgFG), pm) : vec3(1.0);
    col *= mix(vec3(1.0), mid, 0.45 * gm * midK);
    vec3 mic = nOn ? mix(mix(mix(cr(tGG, vWp.xz / 3.6, uAvgGG), cr(tGD, vWp.xz / 4.2, uAvgGD), dryM), cr(tGF, vWp.xz / 3.0, uAvgGF), plough * fm), cr(tFG, vWp.xz / 2.6, uAvgFG), pm) : vec3(1.0);
    col *= mix(vec3(1.0), mic, 0.6 * gm * tk);
    vec4 nM = mOn ? texture2D(tGN, vWp.xz / 25.0) : vec4(0.5), nN = nOn ? texture2D(tGN, vWp.xz / 3.6) : vec4(0.5); float dP2 = max(dryM, plough * fm); // пашня — рельеф сухой земли
    float rM = mix(reliefN(nM.rg, uSun), reliefN(nM.ba, uSun), dP2), rN = mix(reliefN(nN.rg, uSun), reliefN(nN.ba, uSun), dP2);
    col *= mix(1.0, rM, 0.45 * gm * midK) * mix(1.0, rN, 0.55 * gm * tk);
    col *= mix(1.0, 0.82, pm * gm); // под деревьями темнее
  }
  // ── берег реки: песок и ил за городом, в городе — серая набережная; полоса ~60 м от уреза, у воды — мокрый тёмный край
  {
    float rd = abs(vWp.x - riverX(vWp.z)) - ${(CITY.RIVER_W / 2).toFixed(1)};
    float bank = (1.0 - smoothstep(30.0, 75.0 + 0.5 * vns(vWp.xz / 40.0) * 40.0, rd)) * step(-60.0, rd);
    if (bank > 0.001) {
      vec3 sand = srgb(vec3(0.6, 0.55, 0.43)) * (0.85 + 0.3 * vns(vWp.xz / 17.0)), mud = srgb(vec3(0.33, 0.29, 0.22));
      vec3 b = mix(sand, mud, smoothstep(0.45, 0.7, vns(vWp.xz / 70.0 + 5.0)));
      if (uTexOn > 0.5) b *= cr(tSand, vWp.xz / 45.0, uAvgSand);
      b *= 1.0 - 0.35 * (1.0 - smoothstep(0.0, 14.0, rd)); // мокрая полоса у воды
      b = mix(b, srgb(vec3(0.42, 0.42, 0.4)) * dC, max(smoothstep(0.22, 0.42, urb), 1.0 - smoothstep(${(CITY.R * 0.55).toFixed(1)}, ${(CITY.R * 0.75).toFixed(1)}, length(vWp.xz)))); // в городе — набережная
      col = mix(col, b, bank * 0.9);
    }
  }
  col *= mix(dC, mix(dG, 1.0, uTexOn), gm); // трава — новыми слоями (выше); старая яркостная — пока они не пришли
  col = mix(vec3(dot(col, vec3(0.3, 0.59, 0.11))), col, 0.82); // земля чуть спокойнее по цвету (без «кислотной» зелени)
  if (urb > 0.01) {
    // дворы: газоны в жилых кварталах, плитка и парковки в мощёных
    float yard = smoothstep(0.42, 0.62, vns(vWp.xz / 38.0 + 3.0));
    col = mix(col, urb > 0.75 ? vec3(0.07, 0.11, 0.04) * (0.8 + 0.4 * n1) * dG : vec3(0.16, 0.16, 0.15) * dP, yard * 0.75 * smoothstep(0.1, 0.4, urb));
  }
  {
    // дороги — по сетке отрезков (city.js): улица кончается на перекрёстке, за городом — узкая трасса с обочиной
    float ox, hwx, avx, oz, hwz, avz;
    roadAt(vWp.x, ox, hwx, avx); roadAt(vWp.z, oz, hwz, avz);
    float tX = roadSeg(floor(vWp.x / ${G} + 0.5), floor(vWp.z / ${G})).r, tZ = roadSeg(floor(vWp.x / ${G}), floor(vWp.z / ${G} + 0.5)).g;
    float cX = step(0.75, tX), cZ = step(0.75, tZ), eX = step(0.25, tX), eZ = step(0.25, tZ); // c — улица, e — есть дорога
    float hx0 = hwx, hz0 = hwz;
    hwx = mix(${HR}, hwx, cX); hwz = mix(${HR}, hwz, cZ); avx *= cX; avz *= cZ;
    float ax = abs(ox), az = abs(oz);
    float onX = eX * (1.0 - smoothstep(hwx - px, hwx + px, ax));   // проезжая часть дороги, идущей вдоль z
    float onZ = eZ * (1.0 - smoothstep(hwz - px, hwz + px, az));   // … вдоль x
    float road = max(onX, onZ);
    float swX = 1.0 - smoothstep(hwx + 4.5 - px, hwx + 4.5 + px, ax), swZ = 1.0 - smoothstep(hwz + 4.5 - px, hwz + 4.5 + px, az);
    float walk = max(swX * cX, swZ * cZ) * (1.0 - road);
    float shX = 1.0 - smoothstep(hwx + 2.0 - px, hwx + 3.5 + px, ax), shZ = 1.0 - smoothstep(hwz + 2.0 - px, hwz + 3.5 + px, az);
    float shoulder = max(shX * eX * (1.0 - cX), shZ * eZ * (1.0 - cZ)) * (1.0 - road) * (1.0 - walk);
    vec3 asph = vec3(0.032, 0.034, 0.038) * (0.85 + 0.3 * n1);
    asph = mix(asph * 1.35 * dR, asph * dA, max(cX * onX, cZ * onZ)); // загородный асфальт светлее, выгоревший, в заплатах
    col = mix(col, vec3(0.15, 0.15, 0.145) * (0.9 + 0.2 * n1) * dP, walk);    // тротуар
    col = mix(col, vec3(0.2, 0.18, 0.15) * (0.85 + 0.3 * n1) * dS, shoulder * 0.8); // обочина — щебень
    col = mix(col, asph, road);
    // разметка (пока линия толще ~пикселя)
    float mk = (1.0 - smoothstep(0.25, 0.9, px)) * road;
    float inX = onX * (1.0 - onZ), inZ = onZ * (1.0 - onX);              // не на перекрёстке
    float lane = 0.0;
    // осевая: у проспектов — двойная сплошная и пунктир полос, у улиц — пунктир
    lane += inX * (avx > 0.5 ? step(abs(ax - 0.3), 0.12) + step(abs(ax - 7.5), 0.1) * step(fract(vWp.z / 12.0), 0.4) : step(ax, 0.1) * step(fract(vWp.z / 9.0), 0.5));
    lane += inZ * (avz > 0.5 ? step(abs(az - 0.3), 0.12) + step(abs(az - 7.5), 0.1) * step(fract(vWp.x / 12.0), 0.4) : step(az, 0.1) * step(fract(vWp.x / 9.0), 0.5));
    // «зебры» у перекрёстков
    // загородная трасса: сплошные края
    lane += inX * (1.0 - cX) * step(abs(ax - hwx + 0.5), 0.1) + inZ * (1.0 - cZ) * step(abs(az - hwz + 0.5), 0.1);
    // «зебры» у перекрёстков — только где поперечная улица есть
    float ix = floor(vWp.x / ${G} + 0.5), jz = floor(vWp.z / ${G} + 0.5);
    float nZ = step(0.75, max(roadSeg(ix - 1.0, jz).g, roadSeg(ix, jz).g)), nX = step(0.75, max(roadSeg(ix, jz - 1.0).r, roadSeg(ix, jz).r));
    lane += onX * cX * nZ * step(hz0 + 0.8, az) * step(az, hz0 + 4.0) * step(0.5, fract(vWp.x / 1.1)) * step(ax, hwx - 1.0);
    lane += onZ * cZ * nX * step(hx0 + 0.8, ax) * step(ax, hx0 + 4.0) * step(0.5, fract(vWp.z / 1.1)) * step(az, hwz - 1.0);
    col = mix(col, vec3(0.55), min(lane, 1.0) * mk);
  }
  // ВПП аэропорта: асфальт, осевая, торцевые «клавиши»
  vec2 ra = abs(vWp.xz - uAir.xy);
  float rwy = (1.0 - smoothstep(uAir.z - px, uAir.z + px, ra.x)) * (1.0 - smoothstep(uAir.w - px, uAir.w + px, ra.y));
  float cl = step(ra.y, 0.7) * step(0.5, fract(vWp.x / 50.0)) * step(ra.x, uAir.z - 90.0);
  float keys = step(uAir.z - 60.0, ra.x) * step(ra.x, uAir.z - 10.0) * step(0.5, fract(ra.y / 3.0)) * step(ra.y, uAir.w - 4.0);
  col = mix(col, vec3(0.1, 0.1, 0.098) * (tk > 0.0 || uFar == 0.0 ? mix(1.0, dl(tConc, vWp.xz / 5.0, 0.364), tk) : 1.0), rwy); // ВПП — бетонные плиты
  col = mix(col, vec3(0.6), min(cl + keys, 1.0) * rwy * (1.0 - smoothstep(0.6, 3.0, px)));
  // затенение у домов
  float ao = texture2D(tAO, (vWp.xz + ${CITY.GH.toFixed(1)}) / ${(2 * CITY.GH).toFixed(1)}).r;
  col *= 1.0 - 0.55 * ao;
  diffuseColor.rgb = col;`);
  };
  return m;
}

// ═════════════ Здания ═════════════
// aKind = вид + 0,9·случайное (своё у каждого здания) + 10, если часть поднята над землёй (верхняя ступень башни)
// снег на всём, что смотрит вверх (крыши, уступы, верх объектов): поверх своего onBeforeCompile материала; включает ENV.uSnowK
export function snowify(m) {
  if (!m || m.userData.snow) return m; m.userData.snow = true;
  const prev = m.onBeforeCompile, pk = m.customProgramCacheKey(); // прежний ключ программы (у камуфляжа — свой: один код на разные схемы)
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uSnowK = ENV.uSnowK;
    sh.fragmentShader = 'uniform float uSnowK;\n' + sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  { float upv = dot(normal, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz)); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.84, 0.87, 0.92), uSnowK * smoothstep(0.45, 0.75, upv)); }`);
  };
  m.customProgramCacheKey = () => pk + 'snow';
  m.needsUpdate = true; return m;
}
function buildingMaterial() {
  const m = new THREE.MeshPhongMaterial({ specular: 0x8a8a8a, shininess: 90 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, ENV, TEX);
    sh.vertexShader = 'attribute float aKind, aMdl;\nuniform vec3 uCam, uHide; uniform float uMdl[24];\nvarying float vKind, vMdl; varying vec3 vObj, vSize, vNw, vWp;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
  // вблизи дом нарисован готовой моделью — коробку убираем за экран
  if (aMdl > 0.5 && distance(instanceMatrix[3].xz, uHide.xz) < uMdl[int(aMdl + 0.5)]) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  vWp = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz; vKind = aKind; vMdl = aMdl; vObj = position;
  vNw = normalize(mat3(instanceMatrix) * normal);
  vSize = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));`);
    sh.fragmentShader = 'varying float vKind, vMdl; varying vec3 vObj, vSize, vNw, vWp;\nuniform vec4 uMdlCol[24];\nvec3 bEmis = vec3(0.0); float bSpec = 0.0;\n' + GLSL_COMMON + GLSL_TEX +
      sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  float raised = vKind >= 9.5 ? 1.0 : 0.0;
  float kf = mod(vKind, 10.0), kindF = floor(kf + 0.001), seed = fract(kf) / 0.9;
  int k = int(kindF + 0.5);
  float dist = length(vWp - uCam), px = max(0.02, dist * uPx);
  vec3 base = diffuseColor.rgb;
  if (vMdl > 0.5) { vec4 mc = uMdlCol[int(vMdl + 0.5)]; if (mc.w > 0.5) { base = mix(base, mc.rgb, 0.85); diffuseColor.rgb = base; } } // вдали — в цвет своей модели (вблизи её и видно)
  vec3 N = normalize(vNw), V = (uCam - vWp) / max(dist, 1.0);
  float H = vSize.y, y = vObj.y * H;
  if (abs(vObj.y - 1.0) > 0.001 && abs(N.y) < 0.7 && k != ${ROOF}) {
    bool fx = abs(vObj.x) > 0.499;
    float W = fx ? vSize.z : vSize.x, u = ((fx ? vObj.z : vObj.x) + 0.5) * W;
    float face = fx ? (vObj.x > 0.0 ? 1.0 : 2.0) : (vObj.z > 0.0 ? 3.0 : 4.0);
    // параметры фасада по виду: высота этажа, шаг окон, доля окна по ширине и высоте, простенок у угла, средняя доля стекла
    float fh = 3.0, cs = 3.0, ww = 0.45, wh = 0.5, mg = 1.5, avg = 0.2, glassK = 0.0, shop = 0.0;
    if (k == ${KIND.PANEL}) { fh = 2.8; cs = 3.2; ww = 0.42; wh = 0.5; mg = 1.6; avg = 0.2; }
    else if (k == ${KIND.OFFICE}) { fh = 3.7; cs = 1.7; ww = 0.88; wh = 0.52; mg = 2.0; avg = 0.42; shop = 1.0; }
    else if (k == ${KIND.GLASS}) { fh = 4.0; cs = 1.6; ww = 0.94; wh = 0.88; mg = 0.7; avg = 0.82; glassK = 1.0; shop = 1.0; }
    else if (k == ${KIND.HOUSE}) { fh = 3.0; cs = 3.6; ww = 0.34; wh = 0.42; mg = 1.4; avg = 0.1; }
    else if (k == ${KIND.WAREHOUSE}) { fh = 100.0; cs = 6.0; ww = 0.0; wh = 0.0; mg = 3.0; avg = 0.0; }
    else if (k == ${KIND.PLAIN}) { fh = 3.4; cs = 3.4; ww = 0.5; wh = 0.42; mg = 2.0; avg = 0.15; }
    else if (k == ${ROOFX}) { fh = 100.0; ww = 0.0; avg = 0.0; }
    float n = max(1.0, floor((W - 2.0 * mg) / cs)), colW = (W - 2.0 * mg) / n;
    float cu = (u - mg) / colW, col = floor(cu), fu = fract(cu);
    float fl = floor(y / fh), fy = fract(y / fh);
    float inside = step(mg, u) * step(u, W - mg) * step(fh * 0.6, y) * step(y, H - 1.0);
    float win = inside * step(0.5 - ww * 0.5, fu) * step(fu, 0.5 + ww * 0.5) * step(0.5 - wh * 0.5, fy) * step(fy, 0.5 + wh * 0.5);
    // первый этаж офисов и башен — сплошные витрины (у поднятых частей его нет)
    float gf = shop * (1.0 - raised) * step(y, 4.6);
    win = max(win, gf * step(0.6, y) * step(y, 4.0) * step(1.0, u) * step(u, W - 1.0));
    float r1 = hsh(vec2(col + seed * 113.0 + face * 37.0, fl + seed * 71.0)), r2 = hsh(vec2(fl * 3.1 + face, col * 1.7 + seed * 53.0));
    // переход к среднему цвету, когда окно меньше пикселя
    float far = smoothstep(0.25, 0.7, px / min(cs, fh) * 2.0);
    // фасадные детали: швы панелей, балконы, межэтажные пояса офисов, гофра складов
    float detail = 1.0;
    if (k == ${KIND.PANEL}) {
      float seam = max(1.0 - smoothstep(0.0, 0.06 + px * 0.2, fy * fh), 1.0 - smoothstep(0.0, 0.06 + px * 0.2, fu * colW));
      detail *= 1.0 - 0.12 * seam;
      float balc = step(0.62, hsh(vec2(col + seed * 9.0, face))) * step(0.04, fy) * step(fy, 0.22) * inside;
      detail *= 1.0 + 0.22 * balc;
    } else if (k == ${KIND.OFFICE}) detail *= 1.0 - 0.18 * step(0.8, fy);
    else if (k == ${KIND.WAREHOUSE}) detail *= 0.92 + 0.08 * step(0.5, fract(u / 0.9)) + 0.1 * step(H - 1.2, y);
    detail = mix(detail, 1.0, far);
    // рассеянное затенение: у земли и в углах темнее, карниз светлее
    float ao = mix(0.55, 1.0, smoothstep(0.0, 9.0, y + raised * 30.0)) * mix(0.82, 1.0, smoothstep(0.0, 1.8, min(u, W - u)));
    ao *= 1.0 + 0.12 * step(H - 0.7, y);
    // окно: тёмное стекло, у части — шторы/жалюзи (светлее), у стеклянных башен — тонированное стекло
    vec3 glassC = mix(vec3(0.035, 0.045, 0.055), vec3(0.16, 0.14, 0.11), step(0.72, r1) * (1.0 - glassK));
    glassC = mix(glassC, base * 0.22 + vec3(0.01, 0.015, 0.02), glassK);
    vec3 wallC = base * detail;
    float w = mix(win, avg, far);
    diffuseColor.rgb = mix(mix(wallC, glassC, win), mix(wallC, glassC, avg), far) * ao;
    // издали окна уже меньше пикселя, а этажи ещё различимы — ряды окон и простенки полосами вместо ровной заливки
    // (иначе высотки Сити вдали — ровные белые и серые коробки)
    float bandK = far * (1.0 - smoothstep(0.12, 0.28, px / fh)) * step(0.01, avg) * inside; // этаж ≥ 3–4 пикс., иначе рябь
    float rowW = smoothstep(0.45 - wh * 0.5, 0.55 - wh * 0.5, fy) * (1.0 - smoothstep(0.45 + wh * 0.5, 0.55 + wh * 0.5, fy));
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(wallC, glassC, rowW * min(1.0, avg * 1.6)) * ao, bandK);
    // фасады-текстуры: офисы — ленточные окна, башни — стеклянные панели, частные дома — кирпич с окнами
    // (тон — от цвета дома; тайл по размеру этажей картинки; у каждого дома свой сдвиг)
    if (uTexOn > 0.5 && (k == ${KIND.OFFICE} || k == ${KIND.GLASS} || k == ${KIND.HOUSE})) {
      vec2 tuv = vec2(u + seed * 37.0 + face * 5.0, -y);
      vec3 tc = k == ${KIND.OFFICE} ? srgb(texture2D(tOff, tuv / vec2(18.0, 33.0)).rgb) : k == ${KIND.GLASS} ? srgb(texture2D(tGls, tuv / vec2(28.0, 28.0)).rgb) : srgb(texture2D(tBrk, tuv / vec2(15.0, 18.0)).rgb);
      tc *= mix(vec3(1.0), base * 2.6, k == ${KIND.GLASS} ? 0.5 : k == ${KIND.OFFICE} ? 0.65 : 0.3); // офисы — заметно в цвет дома (светлая текстура под солнцем уходила в белое)
      if (k == ${KIND.OFFICE}) tc *= 0.82; else if (k == ${KIND.GLASS}) tc *= 0.85;
      diffuseColor.rgb = mix(diffuseColor.rgb, tc * ao, 0.85 * (1.0 - gf) * (1.0 - 0.55 * far)); // издали текстура — ровный тон, рисунок фасада важнее
    }
    // крупный рисунок фасада, читается за километры: остеклённые ленты через 3 этажа и простенки через 3 окна
    // (когда сами окна уже меньше пикселя; гаснет, пока ленты не стали мельче 3–4 пикс., — без ряби)
    float fh3 = fh * 3.0, fyM = fract(y / fh3), fuM = fract((u - mg) / (colW * 3.0));
    float macroK = far * (1.0 - smoothstep(0.15, 0.45, px / fh3)) * step(0.01, avg) * inside;
    float ribbon = smoothstep(0.04, 0.12, fyM) * (1.0 - smoothstep(0.8, 0.88, fyM)) * smoothstep(0.03, 0.09, fuM) * (1.0 - smoothstep(0.91, 0.97, fuM));
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(wallC, glassC, ribbon * min(1.0, avg * 1.8)) * ao, macroK);
    // офисы и стеклянные башни — та же светлота, что у готовых моделей домов (иначе под солнцем — белые пятна среди города)
    if (k == ${KIND.OFFICE} || k == ${KIND.GLASS}) diffuseColor.rgb *= 0.78;
    // отражение неба в стекле (сильнее под острым углом) и блик солнца
    vec3 R = reflect(-V, N);
    float fres = mix(0.06, 1.0, pow(1.0 - max(dot(N, V), 0.0), 4.0));
    float rk = w * mix(0.35, 1.0, glassK) * (0.25 + 0.75 * fres);
    rk *= mix(1.0, 0.6, far) * mix(1.0, 0.45 + 0.75 * rowW, bandK) * mix(1.0, 0.35 + 0.8 * ribbon, macroK); // издали небо отражают только ряды и ленты окон — видны этажи, а не белая коробка
    // отражение неба — только вблизи и слабо: вдали высотки освещаются как готовые модели домов (солнце и небо), без своего свечения
    bEmis += min(skyAt(R), vec3(2.5)) * rk * (0.22 + 0.28 * glassK) * (1.0 - uNight * 0.6) * (1.0 - far);
    bSpec = w * mix(0.25, 1.0, glassK);
    // ночью — горящие окна (тёплые и холодные), витрины горят все
    float litP = smoothstep(0.3, 0.9, uNight) * uNight * (0.6 + 0.25 * glassK); // утром окна не горят, на закате — немногие
    // вдали окна горят только настоящей ночью (в сумерках готовые модели домов окнами не светятся — коробки не должны выделяться)
    float lit = mix(step(1.0 - litP, r2) * win + gf * win * uNight, avg * litP * 0.55 * mix(1.0, rowW * 1.6, bandK) * mix(1.0, ribbon * 1.4, macroK) * smoothstep(0.75, 0.95, uNight), far);
    vec3 lc = mix(vec3(1.0, 0.72, 0.4), vec3(0.75, 0.85, 1.0), step(0.7, hsh(vec2(r2, seed))));
    bEmis += lc * lit * mix(0.8 + 0.5 * r1, 0.9, far) * 1.2;
  } else {
    // крыша: гравий/рубероид с пятнами, светлый парапет по краю; скатные крыши домов — полосами черепицы
    vec2 e2 = (0.5 - abs(vObj.xz)) * vSize.xz;
    float edge = min(e2.x, e2.y);
    float nn = vns(vWp.xz * 0.35 + seed * 50.0);
    float tr = uTexOn > 0.5 ? 1.0 - smoothstep(0.1, 0.8, px) : 0.0;
    if (k == ${ROOF}) diffuseColor.rgb = base * mix(0.85 + 0.15 * step(0.5, fract(y * 2.5)), dl(tRoof, vec2(vObj.x * vSize.x, vObj.z * vSize.z * 1.4) / 3.2, 0.319), tr) * (0.9 + 0.2 * nn);
    else if (k == ${KIND.WAREHOUSE}) diffuseColor.rgb = base * 0.8 * (0.85 + 0.3 * nn) * mix(1.0, dl(tIron, vec2(vObj.x * vSize.x, vObj.z * vSize.z) / 3.0, 0.208), tr); // цеха и склады — ржавый профнастил
    else diffuseColor.rgb = base * mix(0.42, 0.75, step(edge, 0.6)) * (0.85 + 0.3 * nn) * mix(1.0, dl(tConc, vWp.xz / 6.0, 0.364), tr);
  }`).replace('#include <specularmap_fragment>', '#include <specularmap_fragment>\n specularStrength = bSpec;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += bEmis;');
  };
  return m;
}

// коробка с основанием в y = 0, без нижней грани
function boxGeo() {
  const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0.5, 0);
  const idx = Array.from(g.index.array); idx.splice(18, 6); g.setIndex(idx); g.clearGroups();
  return g;
}
// двускатная крыша: конёк вдоль X, основание 1×1, высота 1
function roofGeo() {
  const p = [-0.5, 0, -0.5, 0.5, 1, 0, 0.5, 0, -0.5, -0.5, 0, -0.5, -0.5, 1, 0, 0.5, 1, 0, // северный скат
    -0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 1, 0, -0.5, 0, 0.5, 0.5, 1, 0, -0.5, 1, 0, // южный скат
    -0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 1, 0, 0.5, 0, -0.5, 0.5, 1, 0, 0.5, 0, 0.5]; // фронтоны
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.computeVertexNormals();
  return g;
}
// дерево: ствол и крона (цвет кроны задаёт инстанс)
// Импосторы деревьев (tools/airdef-trees/bake.html): каждое дерево снято с 6×6 направлений полусферы (полу-октаэдр), атлас 2×2
// вида: цвет + покрытие и нормаль + затенение кроны. В шейдере — квадрат лицом к камере, кадр по направлению взгляда
// (4 соседних кадра смешиваются), свет как у Phong (небо + солнце). city — модели ближнего кольца (дуб, липа, сосна, куст):
// вдали то же дерево, что вблизи; winter — две ели и две сосны LOLIPOP (CC BY, TREES_W — они же вблизи). Вид: [радиус описанной сферы, центр по высоте, высота]
export const TREE_IMP = {
  city: { G: 6, tint: [0.1, 0.14, 0.085], snow: 0, sp: [[6.446, 5.18, 10.36], [6.812, 4.759, 9.519], [6.905, 6.353, 12.706], [4.679, 3.56, 7.12]] },
  winter: { G: 6, tint: [0.1, 0.13, 0.095], snow: 0.7, sp: [[5.907, 4.654, 9.309], [5.189, 4.048, 8.096], [10.073, 8.444, 16.887], [11.48, 9.808, 19.617]] },
  // осень: городской атлас, листва перекрашена цветом экземпляра (рыжие, жёлтые, багряные, сухостой), сосна (вид 2) — своя хвоя
  autumn: { G: 6, atlas: 'city', recolor: 1, tint: [0.12, 0.12, 0.1], snow: 0, sp: [[6.446, 5.18, 10.36], [6.812, 4.759, 9.519], [6.905, 6.353, 12.706], [4.679, 3.56, 7.12]] },
};
function treeImpTex(f) { // → uniform { value }: KTX2, иначе WebP
  const t = new THREE.Texture(); t.flipY = false; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  const U = { value: t };
  if (typeof createImageBitmap !== 'function' || typeof fetch !== 'function') return U;
  texStats.req++;
  if (ktxOn()) { ktxLoad(f).then((k) => { U.value = k; texStats.done++; }).catch(() => webp()); return U; }
  webp(); return U;
  function webp() { fetch(new URL(`./tex/${f}.webp?v=20261022c`, import.meta.url)).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(f))))
    .then((b) => createImageBitmap(b, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })).then((bmp) => { t.image = bmp; t.needsUpdate = true; texStats.done++; })
    .catch((e) => { texStats.done++; console.warn('деревья не загрузились:', e.message); }); }
}
function treeImpMat(set, hi, hemi, sunL, a2c = false) {
  const I = TREE_IMP[set], sfx = hi ? '' : '_lo', atl = I.atlas || set;
  const sp = I.sp.map(([R, cy, H]) => new THREE.Vector4(R / H, cy / H, 0, 0)); // в долях высоты: экземпляр масштабирован под высоту модели
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsLib.fog, atmoSunDir: { value: ATMO.sunDir }, atmoSunCol: { value: ATMO.sunCol }, atmoP: { value: ATMO.p }, /* воздушная перспектива как у земли (world.js): без них высота тумана = 0 → туман ×2,2 — деревья вдали белые */ uCam: ENV.uCam, uHide: ENV.uHide, uMdl: ENV.uMdl, uSun: ENV.uSun,
      tA: treeImpTex(`tr_${atl}_a${sfx}`), tN: treeImpTex(`tr_${atl}_n${sfx}`), uSp: { value: sp }, uRec: { value: I.recolor || 0 },
      uHS: { value: hemi.color.clone().multiplyScalar(hemi.intensity) }, uHG: { value: hemi.groundColor.clone().multiplyScalar(hemi.intensity) },
      uSL: { value: sunL.color.clone().multiplyScalar(sunL.intensity) }, uTint: { value: new THREE.Vector3(...I.tint) }, uSnow: { value: I.snow } },
    vertexShader: `attribute float aKind, aMdl; uniform vec3 uCam, uHide; uniform float uMdl[24]; uniform vec4 uSp[4];
      varying vec2 vUv, vG0, vG1, vF; varying vec3 vAx, vAz, vCol; varying float vSp, vTint, vVar;
      #include <fog_pars_vertex>
      void main() {
        vSp = aKind; vec4 S = uSp[int(aKind + 0.5)];
        float h = length(instanceMatrix[1].xyz); vec3 base = instanceMatrix[3].xyz; vVar = fract(sin(dot(base.xz, vec2(12.9898, 78.233))) * 43758.5453); vec3 ctr = base + vec3(0.0, S.y * h, 0.0); float R = S.x * h;
        vAx = normalize(instanceMatrix[0].xyz); vAz = normalize(instanceMatrix[2].xyz);
        vec3 V = normalize(uCam - ctr), Vl = vec3(dot(V, vAx), max(V.y, 0.0), dot(V, vAz)); Vl = normalize(Vl + vec3(0.0, 1e-3, 0.0));
        vec2 p = Vl.xz / (abs(Vl.x) + Vl.y + abs(Vl.z)), o = vec2(p.x + p.y, p.x - p.y);                 // полу-октаэдр → [−1, 1]²
        vec2 g = (o * 0.5 + 0.5) * ${I.G.toFixed(1)} - 0.5; vG0 = clamp(floor(g), 0.0, ${(I.G - 1).toFixed(1)}); vG1 = min(vG0 + 1.0, ${(I.G - 1).toFixed(1)}); vF = clamp(g - vG0, 0.0, 1.0);
        vec3 up = vec3(0.0, 1.0, 0.0) - Vl * Vl.y; up = dot(up, up) < 1e-6 ? vec3(0.0, 0.0, -1.0) : normalize(up);   // как камера запекания
        vec3 rt = normalize(cross(up, Vl)); up = cross(Vl, rt);
        vec3 Rw = vAx * rt.x + vec3(0.0, rt.y, 0.0) + vAz * rt.z, Uw = vAx * up.x + vec3(0.0, up.y, 0.0) + vAz * up.z;
        vUv = position.xy + 0.5;
        vec4 mvPosition = viewMatrix * vec4(ctr + (Rw * position.x + Uw * position.y) * 2.0 * R, 1.0); gl_Position = projectionMatrix * mvPosition;
        if (aMdl > 0.5 && distance(base.xz, uHide.xz) < uMdl[int(aMdl + 0.5)]) gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // вблизи — модели
        #ifdef USE_INSTANCING_COLOR
          vTint = dot(instanceColor, vec3(0.3, 0.59, 0.11)); vCol = instanceColor;
        #else
          vTint = 0.05; vCol = vec3(0.05);
        #endif
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform sampler2D tA, tN; uniform vec3 uHS, uHG, uSL, uSun, uTint; uniform float uSnow, uRec;
      varying vec2 vUv, vG0, vG1, vF; varying vec3 vAx, vAz, vCol; varying float vSp, vTint, vVar;
      #include <fog_pars_fragment>
      vec2 at(vec2 c) { float s = floor(vSp + 0.5); vec2 o = vec2(mod(s, 2.0), floor(s / 2.0)) * ${I.G.toFixed(1)};
        vec2 q = (o + c + clamp(vUv, 0.01, 0.99)) / ${(I.G * 2).toFixed(1)}; return vec2(q.x, 1.0 - q.y); }
      void main() {
        vec2 a0 = at(vG0), a1 = at(vec2(vG1.x, vG0.y)), a2 = at(vec2(vG0.x, vG1.y)), a3 = at(vG1);
        float w0 = (1.0 - vF.x) * (1.0 - vF.y), w1 = vF.x * (1.0 - vF.y), w2 = (1.0 - vF.x) * vF.y, w3 = vF.x * vF.y;
        vec4 A = texture2D(tA, a0) * w0 + texture2D(tA, a1) * w1 + texture2D(tA, a2) * w2 + texture2D(tA, a3) * w3;
        // порог покрытия — ниже на мелких мип-уровнях (иначе редкая хвоя и листва вдали «облезают» до ствола)
        vec2 ts = vec2(${(I.G * 2 * 128).toFixed(1)}); float lod = log2(max(max(length(dFdx(a0 * ts)), length(dFdy(a0 * ts))), 1.0)), lk = clamp(lod / 4.0, 0.0, 1.0);
        float thr = mix(0.45, 0.1, lk);
        ${a2c ? `float cov = clamp((A.a - thr) / max(fwidth(A.a), 1e-3) + 0.5, 0.0, 1.0); if (cov < 0.01) discard; // край хвои — сглаженный (MSAA: покрытие из альфы), без мерцания вдали`
          : 'if (A.a < thr) discard;'}
        vec4 Nn = texture2D(tN, a0) * w0 + texture2D(tN, a1) * w1 + texture2D(tN, a2) * w2 + texture2D(tN, a3) * w3;
        vec3 alb = pow(A.rgb / max(A.a, 0.05), vec3(2.2)) * (0.85 + 3.0 * vTint); // атлас — sRGB; тон — от цвета экземпляра
        alb *= uTint * mix(1.0, 0.85, clamp(lod / 4.0, 0.0, 1.0)); // крона в тени самой себя: темнее и зеленее, вдали — как у моделей
        float cl = dot(vCol, vec3(0.3, 0.59, 0.11)); // осень: тон листвы — цвет экземпляра (яркость — от атласа); сосна — без перекраски
        float gy = clamp(dot(alb, vec3(0.3, 0.59, 0.11)), 0.012, 0.11) * mix(1.0, 0.75, lk); // яркость листвы — с потолком: у края кроны и на мелких мипах цвет/прозрачность взлетает (неоновые ободки вблизи, белёсые пятна вдали)
        alb = mix(alb, gy * vCol / max(cl, 1e-3), uRec * (1.0 - step(abs(vSp - 2.0), 0.5)));
        vec3 nl = normalize(Nn.rgb / max(A.a, 0.05) * 2.0 - 1.0), n = normalize(vAx * nl.x + vec3(0.0, nl.y, 0.0) + vAz * nl.z);
        float ao = clamp(Nn.a / max(A.a, 0.05), 0.0, 1.0);
        float ny0 = n.y; n = normalize(mix(n, vec3(0.0, 0.6, 0.0) + normalize(uSun) * 0.25, lk * 0.6)); // вдали мелкий рельеф кроны не виден — свет ровнее (без искр)
        vec3 lt = mix(uHG, uHS, n.y * 0.5 + 0.5) * ao + uSL * max(dot(n, normalize(uSun)) * 0.8 + 0.2, 0.0) * mix(0.6, 1.0, ao);
        vec3 col = alb * lt;
        // снег на ветвях: плавно на обращённых вверх лапах, у каждого дерева — своё количество; вдали — приглушённо
        float sn = uSnow * smoothstep(0.35, 0.9, ny0) * (0.2 + 0.35 * vVar) * mix(1.0, 0.5, lk) * ao;
        col = mix(col, vec3(0.74, 0.77, 0.82) * lt, sn);
        gl_FragColor = vec4(col, ${a2c ? 'cov' : '1.0'});
        #include <tonemapping_fragment>
        #include <encodings_fragment>
        #include <fog_fragment>
      }`,
    fog: true, extensions: { derivatives: true },
  });
  mat.alphaToCoverage = a2c;
  return mat;
}
function treeGeo() {
  return mergeParts([
    part(new THREE.CylinderGeometry(0.06, 0.09, 0.5, 5), 0x5a4a3c, M(0, 0.25, 0)),
    part(new THREE.IcosahedronGeometry(0.5, 1), 0xffffff, M(0, 0.85, 0, 0, 0, 0, 1, 0.9, 1)),
  ]);
}
// дальние деревья (за 2–3 км — пара пикселей): ~26 треугольников вместо ~100
function treeGeoLo() {
  return mergeParts([
    part(new THREE.CylinderGeometry(0.07, 0.09, 0.5, 3, 1, true), 0x5a4a3c, M(0, 0.25, 0)),
    part(new THREE.IcosahedronGeometry(0.52, 0), 0xffffff, M(0, 0.85, 0, 0, 0, 0, 1, 0.9, 1)),
  ]);
}

// неподвижное — без пересчёта матриц каждый кадр (2026-10-23, нагрев телефонов: ≈ 700 из 1300 объектов сцены — город и постройки целей).
// Кто потом двигает такой объект (objLook в main.js — «осел» после разрушения), зовёт его updateMatrix()
// Подвижные части (крылья мельницы — userData.sail, винты — spin / hub) и всё под ними — не замораживаются (ревью 2026-10-23: крылья встали)
export function freezeTree(o) {
  if (!o) return;
  const walk = (q) => { if (q.userData.sail || q.userData.spin || q.userData.hub) return; q.updateMatrix(); q.matrixAutoUpdate = false; for (const c of q.children) walk(c); };
  walk(o);
}
// инстансы по плиткам: list — [{x, z, y, sx, sy, sz, ry, color, kind}]; drawK — доля дальности прорисовки
function tiled(scene, list, baseGeo, mat, opts, drawK = 1) {
  const tiles = new Map();
  for (const b of list) {
    const key = Math.floor(b.x / TILE) + ',' + Math.floor(b.z / TILE);
    let t = tiles.get(key); if (!t) tiles.set(key, t = []); t.push(b);
  }
  const out = [], mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  for (const [key, arr] of tiles) {
    const [ti, tj] = key.split(',').map(Number);
    const g = new THREE.BufferGeometry();
    for (const a of Object.keys(baseGeo.attributes)) g.setAttribute(a, baseGeo.attributes[a]);
    if (baseGeo.index) g.setIndex(baseGeo.index);
    const kind = new Float32Array(arr.length), mdl = new Float32Array(arr.length);
    const mesh = new THREE.InstancedMesh(g, mat, arr.length);
    let maxH = 0;
    arr.forEach((b, i) => {
      q.setFromAxisAngle(Y, b.ry || 0);
      mtx.compose(p.set(b.x, b.y, b.z), q, s.set(b.sx, b.sy, b.sz)); mesh.setMatrixAt(i, mtx);
      mesh.setColorAt(i, b.color); kind[i] = b.kind || 0; mdl[i] = b.mdl || 0; maxH = Math.max(maxH, b.y + b.sy);
    });
    g.setAttribute('aKind', new THREE.InstancedBufferAttribute(kind, 1)); g.setAttribute('aMdl', new THREE.InstancedBufferAttribute(mdl, 1));
    const cx = (ti + 0.5) * TILE, cz = (tj + 0.5) * TILE;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, maxH / 2, cz), Math.hypot(TILE * 0.75, maxH / 2 + 10));
    mesh.castShadow = !!opts.cast; mesh.receiveShadow = !!opts.receive;
    mesh.frustumCulled = true; // r128 у InstancedMesh отсечение по умолчанию выключено — без него плитки за спиной рисовались во всех проходах (кадр, тени, контейнер)
    mesh.userData = { cx, cz, maxH, drawK };
    if (opts.lo) { // дальняя плитка — упрощённая форма (те же атрибуты инстансов)
      const gl = new THREE.BufferGeometry();
      for (const a of Object.keys(opts.lo.attributes)) gl.setAttribute(a, opts.lo.attributes[a]);
      if (opts.lo.index) gl.setIndex(opts.lo.index);
      gl.setAttribute('aKind', g.attributes.aKind); gl.setAttribute('aMdl', g.attributes.aMdl); gl.boundingSphere = g.boundingSphere;
      Object.assign(mesh.userData, { gHi: g, gLo: gl, loD: opts.loD });
    }
    scene.add(mesh); out.push(mesh);
  }
  return out;
}

// ═════════════ Дома вблизи — готовые модели ═════════════
// упрощённая копия сетки для средней дальности: те же вершины (нормали, текстура), меньше треугольников (meshoptimizer).
// Сливаются только полные дубли (положение, текстура, нормаль); швы текстуры и острые грани — границы, они закреплены
// (иначе текстура «течёт» полосами). err — допустимая ошибка в долях размера модели
export async function loIndex(geo, ratio, err) {
  const pos = geo.attributes.position, uv = geo.attributes.uv, nor = geo.attributes.normal, idx = geo.index;
  if (!idx || idx.count < 900) return null;
  await MeshoptSimplifier.ready;
  const nv = pos.count, wid = new Uint32Array(nv), key = new Map(), wpos = [], rep = [], r = (x, k) => Math.round(x * k);
  for (let v = 0; v < nv; v++) {
    const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
    const k = r(x, 1e4) + ',' + r(y, 1e4) + ',' + r(z, 1e4) + (uv ? ',' + r(uv.getX(v), 2e3) + ',' + r(uv.getY(v), 2e3) : '') + (nor ? ',' + r(nor.getX(v), 50) + ',' + r(nor.getY(v), 50) + ',' + r(nor.getZ(v), 50) : '');
    let w = key.get(k); if (w === undefined) { key.set(k, w = rep.length); wpos.push(x, y, z); rep.push(v); }
    wid[v] = w;
  }
  const widx = new Uint32Array(idx.count); for (let i = 0; i < idx.count; i++) widx[i] = wid[idx.getX(i)];
  const [out] = MeshoptSimplifier.simplify(widx, Float32Array.from(wpos), 3, Math.max(3, Math.floor(widx.length * ratio / 3) * 3), err, ['LockBorder']);
  if (out.length > widx.length * 0.75) return null; // почти не упростилось — незачем
  const I = new Uint32Array(out.length); for (let i = 0; i < out.length; i++) I[i] = rep[out[i]];
  return new THREE.BufferAttribute(I, 1);
}
// средний цвет модели (текстура × цвет материала, вес — число треугольников): им красится дальняя коробка того же вида,
// чтобы при подходе коробка не сменялась моделью другого цвета. Текстура — уменьшенной копией 8×8 (среднее по ней)
const MC = document.createElement('canvas'); MC.width = MC.height = 8;
function modelColor(group) {
  const ctx = MC.getContext('2d', { willReadFrequently: true }); let r = 0, g = 0, b = 0, wsum = 0;
  group.traverse((m) => {
    if (!m.isMesh || !m.material || m.material.transparent) return;
    const w = (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3, c = m.material.color || new THREE.Color(1, 1, 1);
    let tr = 1, tg = 1, tb = 1; const img = m.material.map && m.material.map.image, sm = m.material.map && m.material.map.small;
    if (sm) { let a = 0, q = 0, e = 0; for (let i = 0; i < sm.length; i += 3) { a += sm[i]; q += sm[i + 1]; e += sm[i + 2]; } const n = sm.length / 3; tr = a / n; tg = q / n; tb = e / n; } // сжатая текстура: средний цвет — по уменьшенной копии (линейный, models.js smallTex)
    else if (img) { try { ctx.clearRect(0, 0, 8, 8); ctx.drawImage(img, 0, 0, 8, 8); const d = ctx.getImageData(0, 0, 8, 8).data; let a = 0, q = 0, e = 0; for (let i = 0; i < d.length; i += 4) { a += d[i]; q += d[i + 1]; e += d[i + 2]; } const n = d.length / 4 * 255, L = (x) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)); tr = L(a / n); tg = L(q / n); tb = L(e / n); } catch (_) { /* нет доступа к картинке */ } }
    r += c.r * tr * w; g += c.g * tg * w; b += c.b * tb * w; wsum += w;
  });
  return wsum ? { r: r / wsum, g: g / wsum, b: b / wsum } : null;
}
// сильно упрощённая копия той же модели — вдали вместо коробки: склейка только по положению (швы текстуры и острые грани
// схлопываются — вдали их не видно), err — крупно; форма, цвет и текстура остаются свои. k — доля треугольников, min — не меньше
export async function farIndex(geo, k = 0.04, min = 16, err = 0.08) {
  const pos = geo.attributes.position, idx = geo.index; if (!idx) return null;
  await MeshoptSimplifier.ready;
  const nv = pos.count, wid = new Uint32Array(nv), key = new Map(), wpos = [], rep = [];
  for (let v = 0; v < nv; v++) {
    const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v), kk = Math.round(x * 500) + ',' + Math.round(y * 500) + ',' + Math.round(z * 500);
    let w = key.get(kk); if (w === undefined) { key.set(kk, w = rep.length); wpos.push(x, y, z); rep.push(v); } wid[v] = w;
  }
  const widx = new Uint32Array(idx.count); for (let i = 0; i < idx.count; i++) widx[i] = wid[idx.getX(i)];
  const tgt = Math.max(min * 3, Math.floor(widx.length * k / 3) * 3);
  if (tgt >= widx.length) return idx;
  const [out] = MeshoptSimplifier.simplify(widx, Float32Array.from(wpos), 3, tgt, err, []);
  const I = new Uint32Array(out.length); for (let i = 0; i < out.length; i++) I[i] = rep[out[i]];
  return new THREE.BufferAttribute(I, 1);
}
// дальняя копия — одним материалом (2026-10-23, нагрев телефонов: у копии объекта было по вызову отрисовки на материал, ≈ 13 на объект):
// цвет текстуры запекается в цвет вершин треугольников — по уменьшенной копии картинки (models.js smallTex, линейный цвет), усреднение по 7
// точкам треугольника на уровне, где он ≈ тексель (повтор UV — как RepeatWrapping), × цвет материала × цвет вершин (деталь, затенение в стыках).
// Вдали (3,5–8 км) пиксель экрана — 3–6 м: рисунок окон и панелей и так сливается. Прозрачное, вырезанное по маске, со своим шейдером
// (камуфляж, снег) и текстура без копии — как было. ?farflat=0 — как было
const FAR_MAT = new Map(); // блеск — как у исходного материала (у построек обычно один на всех — одна сетка)
const farMat = (mt) => { const k = mt.specular.getHex() + '|' + mt.shininess; let m = FAR_MAT.get(k); if (!m) FAR_MAT.set(k, m = new THREE.MeshPhongMaterial({ vertexColors: true, specular: mt.specular.getHex(), shininess: mt.shininess, side: THREE.DoubleSide })); return m; };
const FARFLAT = !(typeof location !== 'undefined' && /[?&]farflat=0/.test(location.search));
const SMALLP = new WeakMap(); // уменьшенная копия → уровни 32, 16, 8, 4, 2, 1
function smallLevels(L) {
  let lv = SMALLP.get(L); if (lv) return lv; lv = [L];
  for (let w = 16; w >= 1; w >>= 1) { const a = lv[lv.length - 1], b = new Float32Array(w * w * 3), W = w * 2;
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) b[(y * w + x) * 3 + c] = (a[(2 * y * W + 2 * x) * 3 + c] + a[(2 * y * W + 2 * x + 1) * 3 + c] + a[((2 * y + 1) * W + 2 * x) * 3 + c] + a[((2 * y + 1) * W + 2 * x + 1) * 3 + c]) / 4;
    lv.push(b); }
  SMALLP.set(L, lv); return lv;
}
const FS3 = [0, 0, 0];
function farFlat(m, geo, orig) {
  const mt = m.material;
  if (!FARFLAT || Array.isArray(mt) || mt.transparent || mt.alphaTest > 0 || mt.polygonOffset || mt.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile || !mt.isMeshPhongMaterial) return geo; // polygonOffset — подложки (pad): без сдвига мерцали бы с землёй
  const small = mt.map ? mt.map.small : null; if (mt.map && !small) return geo;
  const g = geo === orig ? (geo.index ? geo.toNonIndexed() : geo.clone()) : geo.index ? geo.toNonIndexed() : geo;
  const P = g.attributes.position, U = g.attributes.uv, C0 = g.attributes.color, n = P.count, col = new Float32Array(n * 3), lv = small && smallLevels(small);
  const ck = C0 && C0.normalized ? (C0.array instanceof Uint8Array ? 1 / 255 : C0.array instanceof Uint16Array ? 1 / 65535 : 1) : 1; // байты затенения → 0…1
  const smp = (u, v, l) => { const w = 32 >> l, a = lv[l], x = ((Math.floor(u * w) % w) + w) % w, y = ((Math.floor(v * w) % w) + w) % w, i = (y * w + x) * 3; FS3[0] += a[i]; FS3[1] += a[i + 1]; FS3[2] += a[i + 2]; };
  for (let t = 0; t + 2 < n; t += 3) {
    let r = mt.color.r, gg = mt.color.g, b = mt.color.b;
    if (lv && U) {
      const u0 = U.getX(t), v0 = U.getY(t), u1 = U.getX(t + 1), v1 = U.getY(t + 1), u2 = U.getX(t + 2), v2 = U.getY(t + 2);
      const ext = Math.max(Math.max(u0, u1, u2) - Math.min(u0, u1, u2), Math.max(v0, v1, v2) - Math.min(v0, v1, v2));
      const l = Math.max(0, Math.min(5, Math.ceil(Math.log2(Math.max(ext * 32 / 2, 1))))); // уровень, где треугольник ≈ 2 текселя
      FS3[0] = FS3[1] = FS3[2] = 0;
      smp(u0, v0, l); smp(u1, v1, l); smp(u2, v2, l); smp((u0 + u1) / 2, (v0 + v1) / 2, l); smp((u1 + u2) / 2, (v1 + v2) / 2, l); smp((u0 + u2) / 2, (v0 + v2) / 2, l); smp((u0 + u1 + u2) / 3, (v0 + v1 + v2) / 3, l);
      r *= FS3[0] / 7; gg *= FS3[1] / 7; b *= FS3[2] / 7;
    }
    for (let k = 0; k < 3; k++) { const o = (t + k) * 3; col[o] = r * (C0 ? C0.getX(t + k) * ck : 1); col[o + 1] = gg * (C0 ? C0.getY(t + k) * ck : 1); col[o + 2] = b * (C0 ? C0.getZ(t + k) * ck : 1); }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.deleteAttribute('uv'); m.material = farMat(mt);
  return g;
}
// дальняя копия как отдельная геометрия: свои вершины на каждый треугольник и нормали по граням — у упрощённой сетки
// нормали исходных вершин ложились пятнами («мятые» стены); крупные модели (big) — упрощаются до ошибки 0,5 % размера: силуэт не искажается
export async function farGeo(geo, big, o = {}) {
  const ix = await farIndex(geo, o.k ?? (big ? 0.05 : 0.04), o.min ?? (big ? 48 : 16), o.err ?? (big ? 0.005 : 0.08)); if (!ix) return geo; // крупные — по ошибке 0,5 % (силуэт), а не по доле: сколько треугольников останется, столько и будет
  const P = geo.attributes.position, U = geo.attributes.uv, N0 = geo.attributes.normal, n = ix.count, pos = new Float32Array(n * 3), uv = U ? new Float32Array(n * 2) : null, on = new Float32Array(n * 3);
  // цвет вершин — тоже (2026-10-23: у слитых деталей моделей в нём цвет детали, models.js mergeSame; раньше терялось только затенение)
  const Cc = geo.attributes.color, cs = Cc ? Cc.itemSize : 0, col = Cc ? new Float32Array(n * cs) : null, ck = Cc && Cc.normalized ? (Cc.array instanceof Uint8Array ? 1 / 255 : Cc.array instanceof Uint16Array ? 1 / 65535 : 1) : 1;
  for (let i = 0; i < n; i++) { const v = ix.getX(i); pos[i * 3] = P.getX(v); pos[i * 3 + 1] = P.getY(v); pos[i * 3 + 2] = P.getZ(v); if (uv) { uv[i * 2] = U.getX(v); uv[i * 2 + 1] = U.getY(v); } if (N0) { on[i * 3] = N0.getX(v); on[i * 3 + 1] = N0.getY(v); on[i * 3 + 2] = N0.getZ(v); } if (col) for (let c = 0; c < cs; c++) col[i * cs + c] = Cc.array[v * cs + c] * ck; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); if (uv) g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); if (col) g.setAttribute('color', new THREE.BufferAttribute(col, cs));
  g.computeVertexNormals(); const F = Float32Array.from(g.attributes.normal.array); creaseNormals(g, 0.72);
  // нормаль модели — где она совпадает с гранью (ровные стены коробчатых домов), развёрнутая по обходу грани (тонкие двусторонние крыши
  // склеились верхом и низом — иначе чёрные скаты); иначе — сглаженная
  if (N0) { const Nn = g.attributes.normal.array; for (let i = 0; i < n; i++) { const d = on[i * 3] * F[i * 3] + on[i * 3 + 1] * F[i * 3 + 1] + on[i * 3 + 2] * F[i * 3 + 2]; const sg = d < 0 ? -1 : 1; if (Math.abs(d) > 0.9) { Nn[i * 3] = sg * on[i * 3]; Nn[i * 3 + 1] = sg * on[i * 3 + 1]; Nn[i * 3 + 2] = sg * on[i * 3 + 2]; } } } // по обходу грани: изнанку движок развернёт сам (двусторонний материал)
  g.boundingSphere = geo.boundingSphere; return g;
}
// сглаживание с порогом угла: в каждой вершине — среднее нормалей граней, сходящихся в этой точке и отличающихся от своей
// не больше чем на acos(cosT) (~44°): стены — ровные (без «мятых» граней у неровных моделей), углы здания — острые
function creaseNormals(g, cosT) {
  const P = g.attributes.position.array, N = g.attributes.normal.array, n = P.length / 3, F = new Float32Array(n * 3), by = new Map();
  F.set(N); // после computeVertexNormals на неиндексной геометрии — нормали граней
  for (let i = 0; i < n; i++) { const k = Math.round(P[i * 3] * 200) + ',' + Math.round(P[i * 3 + 1] * 200) + ',' + Math.round(P[i * 3 + 2] * 200); let a = by.get(k); if (!a) by.set(k, a = []); a.push(i); }
  for (const a of by.values()) for (const i of a) {
    let x = 0, y = 0, z = 0;
    for (const j of a) { const d = F[i * 3] * F[j * 3] + F[i * 3 + 1] * F[j * 3 + 1] + F[i * 3 + 2] * F[j * 3 + 2]; if (d >= cosT) { x += F[j * 3]; y += F[j * 3 + 1]; z += F[j * 3 + 2]; } }
    const L = Math.hypot(x, y, z) || 1; N[i * 3] = x / L; N[i * 3 + 1] = y / L; N[i * 3 + 2] = z / L;
  }
  g.attributes.normal.needsUpdate = true;
}
// дальняя копия дома — «импостор»: коробка размером с модель, обтянутая её снимками (4 стороны и крыша, без света — только
// цвет), фон снимка прозрачный (alphaTest — силуэт свой: скаты крыш, уступы башен). 10 треугольников на дом, вид — как у
// модели (никаких «мятых» стен упрощения). Атлас 4×2 клетки: низ — +X, −X, +Z, −Z; верх — крыша и пустая (дно коробки)
const IMP_V = new THREE.Vector3(), IMP_C = new THREE.Vector3(), IMP_UP = new THREE.Vector3();
// высота основной крыши: по площади граней, смотрящих вверх (n.y > 0,5), — уровень, выше которого лежит меньше 35 % этой площади
// (трубы, будки, антенны — малая площадь — её не поднимают)
function roofHeight(group, bb) {
  const A = [], va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  group.traverse((m) => {
    if (!m.isMesh) return; const P = m.geometry.attributes.position, I = m.geometry.index; const n = I ? I.count : P.count;
    for (let t = 0; t < n; t += 3) {
      const a = I ? I.getX(t) : t, b = I ? I.getX(t + 1) : t + 1, c = I ? I.getX(t + 2) : t + 2;
      va.fromBufferAttribute(P, a).applyMatrix4(m.matrixWorld); vb.fromBufferAttribute(P, b).applyMatrix4(m.matrixWorld); vc.fromBufferAttribute(P, c).applyMatrix4(m.matrixWorld);
      e1.subVectors(vb, va); e2.subVectors(vc, va); e1.cross(e2); const ar = e1.length() / 2; if (ar < 1e-4) continue;
      if (Math.abs(e1.y) / (2 * ar) > 0.5) A.push([(va.y + vb.y + vc.y) / 3, ar]);
    }
  });
  if (!A.length) return bb.max.y;
  A.sort((p, q) => q[0] - p[0]); let tot = 0; for (const [, a] of A) tot += a;
  let acc = 0; for (const [y, a] of A) { acc += a; if (acc > tot * 0.35) return Math.min(bb.max.y, y + 0.05); }
  return bb.max.y;
}
export function makeImpostor(group, renderer, cell = 256) {
  if (!renderer) return null;
  group.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(group); if (bb.isEmpty()) return null;
  const S = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3()), sc = new THREE.Scene();
  group.traverse((m) => {
    if (!m.isMesh || !m.material || m.material.transparent && m.material.opacity < 0.3) return;
    const o = m.material, q = new THREE.Mesh(m.geometry, new THREE.MeshBasicMaterial({ map: o.map || null, color: o.color ? o.color.clone() : 0xffffff, side: THREE.DoubleSide, alphaTest: o.alphaTest || 0, toneMapped: false }));
    q.matrixAutoUpdate = false; q.matrix.copy(m.matrixWorld); sc.add(q);
  });
  const rt = new THREE.WebGLRenderTarget(cell * 4, cell * 2, { minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true, format: THREE.RGBAFormat });
  const prevRT = renderer.getRenderTarget(), prevAuto = renderer.autoClear, prevCol = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha(), prevSc = renderer.getScissorTest();
  const vp = new THREE.Vector4(); renderer.getViewport(vp); const sp = new THREE.Vector4(); renderer.getScissor(sp);
  renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.autoClear = false; renderer.setScissorTest(false); renderer.clear(true, true, true); renderer.setScissorTest(true);
  // клетка (cx, cy): камера на расстоянии вдоль n, смотрит в центр; w × h — ширина и высота грани; up — верх кадра
  const shot = (cx, cy, n, w, h, d, up) => {
    const cam = new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, 0.05, d + 2);
    cam.position.copy(c).addScaledVector(n, d / 2 + 1); cam.up.copy(up); cam.lookAt(c); cam.updateMatrixWorld();
    renderer.setViewport(cx * cell, cy * cell, cell, cell); renderer.setScissor(cx * cell, cy * cell, cell, cell); renderer.clear(true, true, true);
    renderer.render(sc, cam);
  };
  const Y = IMP_UP.set(0, 1, 0);
  shot(0, 0, IMP_V.set(1, 0, 0), S.z, S.y, S.x, Y); shot(1, 0, IMP_V.set(-1, 0, 0), S.z, S.y, S.x, Y);
  shot(2, 0, IMP_V.set(0, 0, 1), S.x, S.y, S.z, Y); shot(3, 0, IMP_V.set(0, 0, -1), S.x, S.y, S.z, Y);
  if (ENV.uSnowK.value > 0) sc.traverse((q) => { if (q.isMesh) { const o = q.material; q.material = new THREE.MeshBasicMaterial({ color: 0xd2d8e0, side: THREE.DoubleSide, alphaTest: o.alphaTest, map: o.alphaTest ? o.map : null, toneMapped: false }); o.dispose(); } }); // зима: крыша сверху — снег
  shot(0, 1, IMP_V.set(0, 1, 0), S.x, S.z, S.y, IMP_C.set(0, 0, -1));
  renderer.setScissorTest(prevSc); renderer.setScissor(sp); renderer.setViewport(vp); renderer.setRenderTarget(prevRT); renderer.autoClear = prevAuto; renderer.setClearColor(prevCol, prevA);
  sc.traverse((q) => { if (q.isMesh) q.material.dispose(); });
  // коробка: развёртка граней BoxGeometry (+X, −X, +Y, −Y, +Z, −Z) → клетки атласа (дно — в пустую клетку: прозрачно).
  // Крыша коробки — на высоте основной крыши (а не труб и будок: иначе снимок крыши висел над домом), стены — во всю высоту
  const g = new THREE.BoxGeometry(S.x, S.y, S.z); g.translate(c.x, c.y, c.z);
  const ry = roofHeight(group, bb); if (ry < bb.max.y - 0.3) for (let i = 8; i < 12; i++) g.attributes.position.setY(i, ry);
  const uv = g.attributes.uv, CELL = [[0, 0], [1, 0], [0, 1], [3, 1], [2, 0], [3, 0]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k, [cx, cy] = CELL[f], e = 0.5 / cell; uv.setXY(i, (cx + e + uv.getX(i) * (1 - 2 * e)) / 4, (cy + e + uv.getY(i) * (1 - 2 * e)) / 2); }
  const mat = new THREE.MeshLambertMaterial({ map: rt.texture, alphaTest: 0.5, side: THREE.DoubleSide });
  return { geo: g, mat, rt };
}
// вид (номер = aMdl) → модель и её габариты [X, Y, Z] при масштабе 1 (как печатает tools/airdef-models/prepare.js)
export const BLD = [null, ['bld_p5', 16.24, 16.5, 53.0], ['bld_p9', 24.1, 25.4, 178.6], null,
  ['bld_b12', 17.76, 29.86, 43.19], ['bld_st', 15.44, 17.43, 25.92], ['obj_factory', 97.09, 27.93, 27.23],
  // частные дома (с крышей; модель вписана в участок без растяжения, по одной на участок); офисный корпус
  ['h_brick', 11.39, 7.53, 13.38, 1], ['h_house', 12.01, 7.4, 9.71, 1], ['h_log', 10.23, 5.96, 12.24, 1], ['h_khata', 9.64, 3.86, 13.31, 1], ['o_block', 25.6, 32, 30.7],
  ['h_shanty', 18.39, 14.25, 29.59, 1], ['h_mobile', 7.42, 5.97, 11.74, 1], null, null, null, null, // 14…17 — деревья
  // 18…: точечная девятиэтажка, 16-этажная «пластина», офисный корпус, стеклянные башни
  ['bld_t9', 14.2, 28.42, 15], ['bld_a16', 16.25, 50.5, 50], ['o_tall', 37.09, 33.19, 18.36], ['g_amel', 25.15, 56.37, 27.19], ['g_fortune', 38.88, 111.23, 31.55]];
// деревья вблизи (номер в uMdl — 14…17) и их высота при масштабе 1; фонарь
const TREES = [[14, 'tr_oak', 10.36], [15, 'tr_lime', 9.52], [16, 'tr_pine', 12.71], [17, 'tr_bush', 7.12]];
// зимний лес вблизи (те же номера: на зимней карте городских деревьев нет): две ели, две сосны — высота модели, м
const TREES_W = [[14, 'w_fir1', 9.31], [15, 'w_fir3', 8.1], [16, 'w_pine1', 16.89], [17, 'w_pine2', 19.62]];
const HOUSES = [7, 8, 9, 10, 12, 13];
// прятать процедурное вблизи (вершинный шейдер): у инстанса aMdl > 0 и до камеры меньше uMdl[aMdl] — за экран
const HIDE_HEAD = 'attribute float aMdl;\nuniform vec3 uHide; uniform float uMdl[24];\n';
const HIDE_BODY = 'if (aMdl > 0.5 && distance(instanceMatrix[3].xz, uHide.xz) < uMdl[int(aMdl + 0.5)]) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);';
const roofH = (c) => 2.2 + c * 2.2; // высота скатной крыши частного дома (как у коробки с крышей)
// какой моделью рисовать дом вблизи (0 — остаётся коробкой): пятиэтажки, длинные девятиэтажки,
// многоэтажки, сталинки (школы, магазины — невысокие «простые»), цеха складов
function bldVariant(B, i) {
  if (B.y0[i] > 0) return 0;
  const k = B.k[i], h = B.h[i], L = Math.max(B.w[i], B.d[i]), S = Math.min(B.w[i], B.d[i]);
  // башня (L / S < 1,6) — модель растягивается по коробке: годится, если по высоте она растянута не сильнее, чем по плану (×0,7…1,45)
  const tower = (...vs) => { let best = 0, bk = 0.37; for (const v of vs) { const [, mx, my, mz] = BLD[v], kp = Math.sqrt((B.w[i] * B.d[i]) / (mx * mz)), d = Math.abs(Math.log((h / my) / kp)); if (d < bk && kp < 2) { bk = d; best = v; } } return best; }; // и не крупнее ×2 (окна — не огромные)
  if (k === KIND.PANEL) return L / S < 1.6 ? tower(18) : h < 20 ? 1 : h > 40 ? 19 : L > 100 && h < 30 ? 2 : 4;
  if (k === KIND.PLAIN) return S > 15 && h > 11 && h < 20 && L < 70 ? 5 : 0;
  if (k === KIND.WAREHOUSE) return 0; // цеха и склады — свои коробки (модель-электростанция растягивалась в плоский блин и не совпадала с коробкой вдали)
  if (k === KIND.HOUSE) return HOUSES[Math.floor(B.c[i] * HOUSES.length) % HOUSES.length];
  if (k === KIND.OFFICE) return L / S < 1.5 ? (h > 20 && h < 45 ? 11 : 0) : h > 22 && h < 48 ? 20 : 0;
  if (k === KIND.GLASS) return L / S < 1.6 ? tower(21, 22) : 0;
  return 0;
}
// модели ставятся по готовым матрицам (растянуты по коробке дома, длинной стороной вдоль длинной стороны коробки);
// раз в кадр берутся те, что ближе радиуса, — ровно те, чьи коробки шейдер прячет (тот же uCam)
const GC = 150, gkey = (ix, iz) => (ix + 2048) * 4096 + iz + 2048; // ячейка сетки «моделей вблизи», м
function nearHouses(G, scene, B, near, P, sh) {
  const R = P.bldNear || 0, sets = new Map(), mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s = new THREE.Vector3();
  ENV.uMdl.value.fill(0); // город пересобран — коробки снова видны, пока не придут модели
  if (!R) return;
  // набор моделей вблизи: slot — номер в uMdl (коробки / процедурные деревья с этим aMdl прячутся в радиусе), 0 — прятать нечего
  // (фонари); xz — центры (по ним видимость), mats — готовые матрицы
  G.addNear = (key, slot, name, Rs, xz, mats) => {
    const n = xz.length / 2; if (!n) return;
    const im = new THREE.InstancedBufferAttribute(new Float32Array(n * 16), 16); im.setUsage(THREE.DynamicDrawUsage);
    // сетка ячеек GC × GC м: отбор перебирает только ячейки в радиусе, а не все экземпляры города
    const cells = new Map();
    for (let j = 0; j < n; j++) { const k = gkey(Math.floor(xz[j * 2] / GC), Math.floor(xz[j * 2 + 1] / GC)); let c = cells.get(k); if (!c) cells.set(k, c = []); c.push(j); }
    const grid = new Map(); for (const [k, c] of cells) grid.set(k, Int32Array.from(c));
    sets.set(key, { slot, name, xz, mats, im, n, meshes: [], R: Rs, grid });
  };
  for (let v = 1; v < BLD.length; v++) {
    if (!BLD[v] || !near[v].length) continue;
    const ids = near[v], [, mx, my, mz, house] = BLD[v];
    // длинный дом — несколькими секциями модели подряд (окна не растягиваются); видимость — по центру всего дома
    const mLongX = mx > mz, mL = Math.max(mx, mz), segs = [];
    for (const i of ids) {
      const longX = B.w[i] > B.d[i], L = Math.max(B.w[i], B.d[i]), ns = house ? 1 : Math.max(1, Math.round(L / mL));
      for (let k = 0; k < ns; k++) segs.push([i, longX, (k + 0.5) * L / ns - L / 2, L / ns, Math.min(B.w[i], B.d[i])]);
    }
    const n = segs.length, xz = new Float32Array(n * 2), mats = new Float32Array(n * 16);
    segs.forEach(([i, longX, off, sl, S], j) => {
      const flip = ((i * 2654435761 + j * 40503) >>> 0) % 2 ? Math.PI : 0;
      q.setFromAxisAngle(Y, (mLongX === longX ? 0 : Math.PI / 2) + flip);
      s.set((mLongX ? sl : S) / mx, B.h[i] / my, (mLongX ? S : sl) / mz); // вдоль длинной оси модели — секция, поперёк — ширина дома
      if (house) s.setScalar(Math.min(s.x, s.z)); // частный дом — без растяжения: свои пропорции, вписан в участок
      const x = B.x[i] + (longX ? off : 0), z = B.z[i] + (longX ? 0 : off);
      mtx.compose(p.set(x, GH(x, z) - 0.2, z), q, s); mtx.toArray(mats, j * 16);
      xz[j * 2] = B.x[i]; xz[j * 2 + 1] = B.z[i];
    });
    // мелких частных домов много — их радиус меньше; офисный корпус издали светлый и плоский — дальше коробки с фасадом
    G.addNear('b' + v, v, BLD[v][0], house ? R * 0.6 : BLD[v][0] === 'o_block' ? Math.min(R, 700) : R, xz, mats);
  }
  // модель пришла: по мешу на материал, общая матрица инстансов; коробки этого вида вблизи прячутся
  G.attachBld = (name, group) => {
    for (const [key, S] of sets) {
      if (S.name !== name || S.meshes.length) continue;
      let cast = false;
      group.traverse((c) => {
        if (!c.isMesh) return;
        if (G.winter) snowify(c.material); // зимой — снег на крышах моделей
        const m = new THREE.InstancedMesh(c.geometry, c.material, S.n); m.instanceMatrix = S.im; m.count = 0; m.frustumCulled = false; m.userData.set = key;
        m.castShadow = !!sh.cast && !c.material.alphaTest; m.receiveShadow = !!sh.receive; scene.add(m); S.meshes.push(m); cast = cast || m.castShadow;
      });
      // шар вокруг начала модели, вмещающий её, × масштаб экземпляра — для отсечения по полю зрения (+ запас на тень, если отбрасывает)
      const bb = new THREE.Box3().setFromObject(group); let r0 = 0;
      for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) r0 = Math.max(r0, Math.hypot(x, y, z));
      S.rad = new Float32Array(S.n); S.cxyz = new Float32Array(S.n * 3);
      for (let j = 0, e = S.mats; j < S.n; j++) {
        const o = j * 16, k = Math.max(Math.hypot(e[o], e[o + 1], e[o + 2]), Math.hypot(e[o + 4], e[o + 5], e[o + 6]), Math.hypot(e[o + 8], e[o + 9], e[o + 10]));
        S.rad[j] = r0 * k + (cast ? 45 : 15); // запас 15 м: отбор — через кадр
        S.cxyz[j * 3] = e[o + 12]; S.cxyz[j * 3 + 1] = e[o + 13]; S.cxyz[j * 3 + 2] = e[o + 14];
      }
      S.imPod = new THREE.InstancedBufferAttribute(new Float32Array(S.n * 16), 16); S.imPod.setUsage(THREE.DynamicDrawUsage);
      if (S.slot) { ENV.uMdl.value[S.slot] = S.R; const mc = modelColor(group); if (mc) ENV.uMdlCol.value[S.slot].set(mc.r, mc.g, mc.b, 1); }
      lx = 1e9;
      // тяжёлая модель (больше 2500 треугольников) — на средней дальности упрощённой копией (~ четверть треугольников)
      let tri = 0; for (const m of S.meshes) tri += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
      if (tri > 2500 && P.bldLo !== false && !(S.slot && !(S.slot >= 14 && S.slot <= 17) && (P.bldFar || 0) > S.R)) Promise.all(S.meshes.map((m) => loIndex(m.geometry, 0.35, 0.005))).then((ix) => { // мягче, чем было (0,25 / 0,012): у крупных — меньше «мятых» граней
        let lt = 0; S.meshes.forEach((m, i) => { lt += ix[i] ? ix[i].count / 3 : (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; });
        if (lt > tri * 0.7) return; // выигрыш меньше 30 % — лишние вызовы отрисовки дороже
        S.imLo = new THREE.InstancedBufferAttribute(new Float32Array(S.n * 16), 16); S.imLo.setUsage(THREE.DynamicDrawUsage);
        S.lo = S.meshes.map((h, i) => {
          let g = h.geometry;
          if (ix[i]) { g = new THREE.BufferGeometry(); for (const a in h.geometry.attributes) g.setAttribute(a, h.geometry.attributes[a]); g.setIndex(ix[i]); g.boundingSphere = h.geometry.boundingSphere; }
          const m = new THREE.InstancedMesh(g, h.material, S.n); m.instanceMatrix = S.imLo; m.count = 0; m.visible = false; m.frustumCulled = false;
          m.castShadow = h.castShadow; m.receiveShadow = h.receiveShadow; Object.assign(m.userData, { set: key, lo: true }); scene.add(m); return m;
        });
        S.R1 = Math.max(120, S.R * 0.45); lx = 1e9;
      }).catch(() => { /* без упрощения — модель целиком */ });
      // вдали (до P.bldFar) — сильно упрощённая та же модель вместо коробки; дальше — коробки в цвет модели (там здания — точки)
      const RF = S.slot >= 14 && S.slot <= 17 ? (P.treeFar || 0) : (P.bldFar || 0);
      const big = tri >= 8000 && !(S.slot >= 14 && S.slot <= 17); // сталинки, высотки, «пластины» — мягче
      const tree = S.slot >= 14 && S.slot <= 17, imp = RF > S.R && S.slot && !tree ? makeImpostor(group, G.renderer, (() => { const b = new THREE.Box3().setFromObject(group), z = b.getSize(new THREE.Vector3()); return Math.max(z.x, z.z) > 60 ? 512 : big || S.R >= R ? 256 : 128; })()) : null; // дома — импостор (снимки модели), деревья — упрощённая сетка
      if (imp) {
        S.imFar = new THREE.InstancedBufferAttribute(new Float32Array(S.n * 16), 16); S.imFar.setUsage(THREE.DynamicDrawUsage);
        const m = new THREE.InstancedMesh(imp.geo, imp.mat, S.n); m.instanceMatrix = S.imFar; m.count = 0; m.visible = false; m.frustumCulled = false; m.receiveShadow = !!sh.receive;
        Object.assign(m.userData, { set: key, far: true }); scene.add(m); S.far = [m]; S.Rf = RF; ENV.uMdl.value[S.slot] = RF; lx = 1e9;
      } else if (RF > S.R && S.slot && tree) Promise.all(S.meshes.map((m) => farIndex(m.geometry, 0.08, 8).then((ix) => { const g = new THREE.BufferGeometry(); for (const a in m.geometry.attributes) g.setAttribute(a, m.geometry.attributes[a]); g.setIndex(ix || m.geometry.index); g.boundingSphere = m.geometry.boundingSphere; return g; }))).then((gs) => {
        S.imFar = new THREE.InstancedBufferAttribute(new Float32Array(S.n * 16), 16); S.imFar.setUsage(THREE.DynamicDrawUsage);
        S.far = S.meshes.map((h, i) => {
          const m = new THREE.InstancedMesh(gs[i], h.material, S.n); m.instanceMatrix = S.imFar; m.count = 0; m.visible = false; m.frustumCulled = false;
          m.castShadow = false; m.receiveShadow = h.receiveShadow; Object.assign(m.userData, { set: key, far: true }); scene.add(m); return m;
        });
        S.Rf = RF; ENV.uMdl.value[S.slot] = RF; lx = 1e9; // коробки этого вида спрятаны до RF — там теперь модель
      }).catch(() => { /* без дальней копии — коробки */ });
    }
  };
  Object.defineProperty(G, 'bldNames', { get: () => [...new Set([...sets.values()].map((S) => S.name))] });
  // раз в кадр: в радиусе от камеры (его коробки прячет шейдер) и в поле зрения — камеры или контейнера (cams);
  // модели за спиной не рисуются ни в кадре, ни в тенях, ни в окне контейнера
  let lx = 1e9, lz = 1e9, nk = 0;
  const FR = [new THREE.Frustum(), new THREE.Frustum()], PM = new THREE.Matrix4(), lastM = new Float32Array(16);
  G.near = (cam, cams) => {
    const p = cam.position;
    if ((++nk & 1) && lx < 1e8 && Math.abs(p.x - lx) < 120 && Math.abs(p.z - lz) < 120) return; // через кадр (запас по краям поля зрения — 15 м); резкий скачок камеры — сразу
    let same = Math.abs(p.x - lx) < 0.5 && Math.abs(p.z - lz) < 0.5 && cams.length === 1;
    for (let i = 0, e = cam.matrixWorld.elements; i < 16 && same; i++) if (Math.abs(e[i] - lastM[i]) > 2e-3) same = false;
    if (same) return; // стоим и не поворачиваемся — ничего не меняется
    lx = p.x; lz = p.z; lastM.set(cam.matrixWorld.elements);
    const nf = Math.min(cams.length, 2);
    for (let i = 0; i < nf; i++) { const c = cams[i]; c.updateMatrixWorld(); PM.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse.copy(c.matrixWorld).invert()); FR[i].setFromProjectionMatrix(PM); }
    for (const S of sets.values()) {
      if (!S.meshes.length) continue;
      const a = S.im.array, R2 = S.R * S.R, C3 = S.cxyz, al = S.lo ? S.imLo.array : null, R12 = al ? S.R1 * S.R1 : R2; let c = 0, cl = 0, cf = 0;
      const af = S.far ? S.imFar.array : null, RM = af ? S.Rf : S.R, RM2 = RM * RM; // вдали — упрощённая копия (до Rf)
      const ix0 = Math.floor((p.x - RM) / GC), ix1 = Math.floor((p.x + RM) / GC), iz0 = Math.floor((p.z - RM) / GC), iz1 = Math.floor((p.z + RM) / GC);
      for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
      const cell = S.grid.get(gkey(ix, iz)); if (!cell) continue;
      for (let q = 0; q < cell.length; q++) {
        const j = cell[q], dx = S.xz[j * 2] - p.x, dz = S.xz[j * 2 + 1] - p.z, d2 = dx * dx + dz * dz;
        if (d2 >= RM2) continue;
        const x = C3[j * 3], y = C3[j * 3 + 1], z = C3[j * 3 + 2], r = S.rad[j];
        let vis = false;
        for (let f = 0; f < nf && !vis; f++) { const pl = FR[f].planes; vis = true; for (let k = 0; k < 6; k++) { const q = pl[k]; if (q.normal.x * x + q.normal.y * y + q.normal.z * z + q.constant < -r) { vis = false; break; } } }
        if (!vis) continue;
        if (d2 < R12) { a.set(S.mats.subarray(j * 16, j * 16 + 16), c * 16); c++; } else if (d2 < R2) { al.set(S.mats.subarray(j * 16, j * 16 + 16), cl * 16); cl++; } else { af.set(S.mats.subarray(j * 16, j * 16 + 16), cf * 16); cf++; }
      } }
      // на видеочип — только занятая часть буфера (у деревьев весь буфер — сотни КБ, а видно десятки)
      if (c || S.c0) { S.im.updateRange.count = Math.max(c, 1) * 16; S.im.needsUpdate = true; } S.c0 = c;
      for (const m of S.meshes) { m.count = c; m.visible = c > 0; } // пустые — без вызова отрисовки
      if (al) { if (cl || S.cl0) { S.imLo.updateRange.count = Math.max(cl, 1) * 16; S.imLo.needsUpdate = true; } S.cl0 = cl; for (const m of S.lo) { m.count = cl; m.visible = cl > 0; } }
      if (af) { if (cf || S.cf0) { S.imFar.updateRange.count = Math.max(cf, 1) * 16; S.imFar.needsUpdate = true; } S.cf0 = cf; for (const m of S.far) { m.count = cf; m.visible = cf > 0; } }
    }
  };
  // окно ТВ: модели вблизи точки at (радиус R) в поле зрения cam — во втором буфере инстансов; коробки там прячет шейдер
  // (uHide = at). Возвращает, как вернуть основной кадр. Основной набор не трогается — нагрузки на остальной кадр нет
  const podFr = new THREE.Frustum(), mdl0 = new Array(24), keep = [];
  G.nearPod = (cam, at, R) => {
    cam.updateMatrixWorld(); PM.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse.copy(cam.matrixWorld).invert()); podFr.setFromProjectionMatrix(PM);
    const pl = podFr.planes, R2 = R * R, U = ENV.uMdl.value; keep.length = 0;
    for (let i = 0; i < 24; i++) mdl0[i] = U[i];
    for (const S of sets.values()) {
      if (!S.meshes.length) continue;
      const a = S.imPod.array, C3 = S.cxyz; let c = 0;
      const ix0 = Math.floor((at.x - R) / GC), ix1 = Math.floor((at.x + R) / GC), iz0 = Math.floor((at.z - R) / GC), iz1 = Math.floor((at.z + R) / GC);
      for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
      const cell = S.grid.get(gkey(ix, iz)); if (!cell) continue;
      for (let q = 0; q < cell.length; q++) {
        const j = cell[q], dx = S.xz[j * 2] - at.x, dz = S.xz[j * 2 + 1] - at.z;
        if (dx * dx + dz * dz >= R2) continue;
        const x = C3[j * 3], y = C3[j * 3 + 1], z = C3[j * 3 + 2], r = S.rad[j];
        let vis = true; for (let k = 0; k < 6; k++) { const q = pl[k]; if (q.normal.x * x + q.normal.y * y + q.normal.z * z + q.constant < -r) { vis = false; break; } }
        if (vis) { a.set(S.mats.subarray(j * 16, j * 16 + 16), c * 16); c++; }
      } }
      if (c) { S.imPod.updateRange.count = c * 16; S.imPod.needsUpdate = true; }
      for (const m of S.meshes) { keep.push(m, m.count, m.visible); m.instanceMatrix = S.imPod; m.count = c; m.visible = c > 0; }
      if (S.lo) for (const m of S.lo) { keep.push(m, m.count, m.visible); m.visible = false; }
      if (S.far) for (const m of S.far) { keep.push(m, m.count, m.visible); m.visible = false; }
      if (S.slot) U[S.slot] = R;
    }
    const h0 = ENV.uHide.value.clone(); ENV.uHide.value.copy(at);
    return () => {
      for (let i = 0; i < keep.length; i += 3) { const m = keep[i], S = sets.get(m.userData.set); m.instanceMatrix = m.userData.far ? S.imFar : m.userData.lo ? S.imLo : S.im; m.count = keep[i + 1]; m.visible = keep[i + 2]; }
      for (let i = 0; i < 24; i++) U[i] = mdl0[i];
      ENV.uHide.value.copy(h0);
    };
  };
}

// ═════════════ Улица вблизи: фонари и ЛЭП с проводами, автоматы, будки, урны, баки ═════════════
// Только вблизи (вдали не видно) — наборы «моделей вблизи» без процедурной замены (slot 0). Своя случайность от seed.
// Фонарь (p_lamp): столб 6,9 м, консоль вдоль +Z; провода крепятся у вершины столба на консоли.
const WIRE_AT = [-1.4, -0.95, -0.25, 0.3], WIRE_Y = 6.1, WIRE_SAG = 0.7;
function streetProps(G, city, B, P) {
  const R = P.bldNear || 0, rnd = mulberry32(city.seed * 31 + 7), GR = CITY.GRID, n0 = Math.ceil(CITY.R / GR);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0), p = new THREE.Vector3(), sc = new THREE.Vector3(), a3 = new THREE.Vector3(), b3 = new THREE.Vector3();
  const sets = {}; const put = (name, x, z, rot, s = 1, y = GH(x, z)) => { (sets[name] = sets[name] || []).push(x, z, ...m4.compose(p.set(x, y, z), q.setFromAxisAngle(Y, rot), sc.setScalar(s)).elements); };
  const wire = [], seg = (A, Bp) => { const d = b3.copy(Bp).sub(A), L = d.length(); q.setFromUnitVectors(X, d.normalize()); wire.push((A.x + Bp.x) / 2, (A.z + Bp.z) / 2, ...m4.compose(p.copy(A).add(Bp).multiplyScalar(0.5), q, sc.set(L, 1, 1)).elements); };
  // точка крепления провода k у столба: столб (x, z), поворот rot (консоль +Z модели)
  const att = (x, z, rot, k, out) => out.set(x + Math.sin(rot) * WIRE_AT[k], GH(x, z) + WIRE_Y, z + Math.cos(rot) * WIRE_AT[k]);
  // линия столбов вдоль оси: проспекты — фонари с обеих сторон, улицы частного сектора — ЛЭП с одной стороны
  const line = (alongX, c, side, step, okZone, withBins) => {
    let prev = null; const rc = Math.round(c / GR) * GR; // ось дороги
    for (let a = -CITY.R; a <= CITY.R; a += step) {
      const m = ((a % GR) + GR) % GR, x = alongX ? a : c, z = alongX ? c : a;
      const ok = m >= 30 && m <= GR - 30 && okZone(ZA(x, z)) && city.bldAt(x, z) <= 0 && city.onRoad(alongX ? x : rc, alongX ? rc : z); // столбы — только у существующей дороги
      if (!ok) { prev = null; continue; }
      const rot = alongX ? (side > 0 ? Math.PI : 0) : -side * Math.PI / 2; // консоль — к дороге
      put('p_lamp', x, z, rot);
      if (prev) for (let k = 0; k < 4; k++) { const A = att(prev[0], prev[1], prev[2], k, new THREE.Vector3()), Bp = att(x, z, rot, k, new THREE.Vector3()), M = A.clone().add(Bp).multiplyScalar(0.5); M.y -= WIRE_SAG; seg(A, M); seg(M, Bp); }
      prev = [x, z, rot];
      if (withBins && rnd() < 0.5) { const bx = x + (alongX ? 6 : 0), bz = z + (alongX ? 0 : 6); put('pr_bin', bx, bz, rot + Math.PI); }
    }
  };
  for (let i = -n0; i <= n0; i++) {
    const ave = ((i % CITY.AVE_EVERY) + CITY.AVE_EVERY) % CITY.AVE_EVERY === 0, hw = (ave ? CITY.AVENUE : CITY.STREET) / 2;
    for (const alongX of [true, false]) {
      if (ave) for (const side of [-1, 1]) line(alongX, i * GR + side * (hw + 1.5), side, 40, (zn) => zn !== ZONE.FIELD && zn !== ZONE.WATER && zn !== ZONE.AIR, true);
      else if (rnd() < 0.7) { const side = rnd() < 0.5 ? -1 : 1; line(alongX, i * GR + side * (hw + 1.5), side, 38, (zn) => zn === ZONE.LOW, false); } // ЛЭП в частном секторе
    }
  }
  // углы перекрёстков в городе: автоматы и телефонные будки на тротуаре, лицом к дороге
  for (let i = -n0; i <= n0; i++) for (let j = -n0; j <= n0; j++) {
    const cx = i * GR, cz = j * GR, zn = ZA(cx, cz); if (zn !== ZONE.MID && zn !== ZONE.CBD) continue;
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      if (rnd() > 0.35) continue;
      const hx = lineW(i) / 2 + 3, hz = lineW(j) / 2 + 3, x = cx + sx * (hx + 6 + rnd() * 10), z = cz + sz * hz;
      if (city.bldAt(x, z) > 0) continue;
      const r = rnd(), name = r < 0.4 ? 'pr_vend' : r < 0.7 ? 'pr_vend2' : 'pr_booth';
      put(name, x, z, sz > 0 ? Math.PI : 0); // лицом к улице вдоль X
      if (name !== 'pr_booth' && rnd() < 0.6) put(name === 'pr_vend' ? 'pr_vend2' : 'pr_vend', x + 1.15 * Math.sign(sx), z, sz > 0 ? Math.PI : 0); // автоматы — парой
    }
  }
  // баки у панельных домов: у торца, в 4 м от стены
  for (let i = 0; i < B.n; i++) {
    if (B.k[i] !== KIND.PANEL || B.y0[i] > 0 || rnd() > 0.6) continue;
    const lx = B.w[i] > B.d[i], e = (lx ? B.w[i] : B.d[i]) / 2 + 4, sd = rnd() < 0.5 ? 1 : -1, x = B.x[i] + (lx ? e * sd : 0), z = B.z[i] + (lx ? 0 : e * sd);
    if (city.bldAt(x, z) <= 0) put('pr_wbins', x, z, (lx ? Math.PI / 2 : 0) + (rnd() < 0.5 ? Math.PI : 0));
  }
  // остановки, знаки, село — своей случайностью (прежние детали улиц не сдвигаются)
  const r2 = mulberry32(city.seed * 53 + 11), BIG = { v_wtower: 1, m_5g: 1, v_barn: 0.8, v_combine: 0.6, v_tractor: 0.5, pr_bstop: 0.45, pr_rstop: 0.45, v_picket: 0.3, sg_main: 0.3, sg_yield: 0.3 };
  const city0 = (zn) => zn === ZONE.MID || zn === ZONE.CBD, rural = (zn) => zn === ZONE.LOW || zn === ZONE.FIELD;
  for (let i = -n0; i <= n0; i++) for (let j = -n0; j < n0; j++) for (const alongX of [true, false]) {
    // середина квартала у дороги по линии i: городская остановка (через 3–4 квартала) или старая сельская; навесом к дороге
    const c = i * GR, a = j * GR + GR / 2, rx = alongX ? a : c, rz = alongX ? c : a, zn = ZA(rx, rz);
    if (!city.onRoad(rx, rz)) continue;
    const pc = city0(zn) ? 0.14 : rural(zn) ? 0.05 : 0; if (!pc || r2() > pc) continue;
    const side = r2() < 0.5 ? 1 : -1, off = (city0(zn) ? lineW(i) / 2 : RURAL_HW) + 4.5, x = rx + (alongX ? 0 : side * off), z = rz + (alongX ? side * off : 0);
    if (city.bldAt(x, z) > 0) continue;
    put(city0(zn) ? 'pr_bstop' : 'pr_rstop', x, z, alongX ? (side > 0 ? 0 : Math.PI) : (side > 0 ? -Math.PI / 2 : Math.PI / 2));
  }
  // перекрёстки за городом: на одной дороге «Главная», на другой «Уступи дорогу» (знак — лицом к подъезжающим)
  for (let i = -n0; i <= n0; i++) for (let j = -n0; j <= n0; j++) {
    const cx = i * GR, cz = j * GR; if (!rural(ZA(cx, cz)) || r2() > 0.3) continue;
    const ex = city.onRoad(cx + 30, cz) || city.onRoad(cx - 30, cz), ez = city.onRoad(cx, cz + 30) || city.onRoad(cx, cz - 30); if (!ex || !ez) continue;
    const o = RURAL_HW + 3, mainX = r2() < 0.5;
    for (const sd of [1, -1]) {
      const xm = cx + sd * 14, zm = cz + sd * o, xy = cx + sd * o, zy = cz - sd * 14; // знак у правой обочины, за 14 м до перекрёстка
      if (city.bldAt(mainX ? xm : xy, mainX ? zm : zy) <= 0) put('sg_main', mainX ? xm : xy, mainX ? zm : zy, mainX ? (sd > 0 ? Math.PI / 2 : -Math.PI / 2) : (sd > 0 ? 0 : Math.PI));
      if (city.bldAt(mainX ? xy : xm, mainX ? zy : zm) <= 0) put('sg_yield', mainX ? xy : xm, mainX ? zy : zm, mainX ? (sd > 0 ? 0 : Math.PI) : (sd > 0 ? Math.PI / 2 : -Math.PI / 2));
    }
  }
  // село: у частных домов за городом — штакетник со стороны улицы, сарай во дворе; рядом с домами — трактор, комбайн,
  // водонапорная башня, вышка сотовой связи
  const free = (x, z, r) => city.bldAt(x, z) <= 0 && city.bldAt(x + r, z) <= 0 && city.bldAt(x - r, z) <= 0 && city.bldAt(x, z + r) <= 0 && city.bldAt(x, z - r) <= 0 && !city.onRoad(x, z);
  for (let i = 0; i < B.n; i++) {
    if (B.k[i] !== KIND.HOUSE || B.y0[i] > 0) continue;
    const zn = ZA(B.x[i], B.z[i]); if (!rural(zn)) continue;
    const hx = B.w[i] / 2, hz = B.d[i] / 2;
    // улица — ближайшая к дому линия сетки
    const gx = Math.round(B.x[i] / GR) * GR, gz = Math.round(B.z[i] / GR) * GR, dx = B.x[i] - gx, dz = B.z[i] - gz, toX = Math.abs(dx) < Math.abs(dz);
    if (r2() < 0.7) { // штакетник: секции по 3 м вдоль фасада, в 4 м от стены
      const sd = toX ? -Math.sign(dx) : -Math.sign(dz), L = (toX ? B.d[i] : B.w[i]) + 6, n = Math.max(2, Math.round(L / 3));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) * L / n - L / 2, x = toX ? B.x[i] + sd * (hx + 4) : B.x[i] + t, z = toX ? B.z[i] + t : B.z[i] + sd * (hz + 4);
        if (!city.onRoad(x, z)) put('v_picket', x, z, toX ? 0 : Math.PI / 2); // bldAt — по сетке: у своей стены всегда «дом»
      }
    }
    const back = (d) => [toX ? B.x[i] + Math.sign(dx || 1) * (hx + d) : B.x[i], toX ? B.z[i] : B.z[i] + Math.sign(dz || 1) * (hz + d)];
    if (r2() < 0.18) { const [x, z] = back(11); if (free(x, z, 7)) put('v_barn', x, z, toX ? Math.PI / 2 : 0); }
    const r = r2();
    const spot = (d) => { const a = r2() * Math.PI * 2, x = B.x[i] + Math.cos(a) * d, z = B.z[i] + Math.sin(a) * d; return free(x, z, 6) ? [x, z, a] : null; };
    let q;
    if (r < 0.012 && (q = spot(35 + r2() * 30))) put('v_tractor', q[0], q[1], q[2]);
    else if (r < 0.02 && (q = spot(60 + r2() * 60))) put('v_combine', q[0], q[1], q[2]);
    else if (r < 0.023 && (q = spot(40))) put('v_wtower', q[0], q[1], r2() * 6);
    else if (r < 0.026 && (q = spot(70))) put('m_5g', q[0], q[1], r2() * 6);
  }
  const add = (name, arr, Rk) => { const n = arr.length / 18, xz = new Float32Array(n * 2), mats = new Float32Array(n * 16); for (let k = 0; k < n; k++) { xz[k * 2] = arr[k * 18]; xz[k * 2 + 1] = arr[k * 18 + 1]; mats.set(arr.slice(k * 18 + 2, k * 18 + 18), k * 16); } G.addNear(name, 0, name, R * Rk, xz, mats); };
  for (const [name, arr] of Object.entries(sets)) add(name, arr, name === 'p_lamp' ? 0.6 : BIG[name] || 0.33);
  if (wire.length) {
    add('p_wire', wire, 0.5);
    // провод — тонкий цилиндр длиной 1 вдоль X (модель не грузится — своя)
    const g = new THREE.CylinderGeometry(0.018, 0.018, 1, 4, 1, true); g.rotateZ(Math.PI / 2);
    const grp = new THREE.Group(); grp.add(new THREE.Mesh(g, new THREE.MeshPhongMaterial({ color: 0x202020, shininess: 10 }))); G.attachBld('p_wire', grp);
  }
}

// палитры (sRGB): штукатурка, кирпич, бетон, облицовка
const PAL = {
  [KIND.HOUSE]: [0xd8c8a8, 0xe6dccb, 0xc2a586, 0xb98e6e, 0xd9d2c4, 0xa7b29a],
  [KIND.PANEL]: [0xdcd8cc, 0xcfd2cf, 0xe2d4b8, 0xc4ccd4, 0xd8c6b0, 0xb8c4c0, 0xe6e0d4],
  [KIND.OFFICE]: [0x9c9488, 0x7f868c, 0xb3a184, 0x6f7a84, 0x8f8070, 0x5f5d5a, 0xa58f78, 0x7a6a5c], // глубже: светлые фасады под солнцем уходили в белое
  [KIND.GLASS]: [0x6f93b0, 0x5f8a8c, 0x8c939c, 0x8a7a62, 0x4f6f96, 0x7aa0b8],
  [KIND.WAREHOUSE]: [0xa8aca8, 0x9aa6ac, 0xb6a88f, 0x8f9e8a, 0xc0c0b8, 0x9c6e5a],
  [KIND.PLAIN]: [0xbcb2a4, 0xa8a29a, 0xc8bcae],
  [ROOFX]: [0x9a9c9e, 0x8a8c8e, 0xb4b4b0],
  [ROOF]: [0x8c4a32, 0x6e3c2c, 0x5a5f66, 0x7d5a40, 0x4f5a4a],
};

// ═════════════ Облака ═════════════
// запечённые объёмные облака (tools/airdef-clouds/bake.html): атлас 4×4 — 0–11 кучевые, 12–15 слоисто-кучевые;
// clouds_n — свет сквозь объём от солнца справа / сверху / слева, clouds_d — R прозрачность, G свет от солнца за облаком,
// B рассеянный свет неба. В шейдере свет смешивается по направлению на солнце (квадраты осей картинки). Картинка всегда стоит вертикально (без крена камеры).
const CLOUD_BASE = 0.35; // низ облака в клетке — примерно на 0,35 размера ниже центра (BASE −0,62 в запекании, клубы чуть ниже)
function cloudTex(f, done) { // → uniform { value }: KTX2, иначе WebP
  const t = new THREE.Texture(); t.flipY = false; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  const U = { value: t };
  if (typeof createImageBitmap !== 'function' || typeof fetch !== 'function') return U;
  texStats.req++;
  webp(); return U; // облака — WebP: в KTX2 светотень в кадре выходила площе (данные те же — разница в выборке мипов; не разобрались)
  function webp() { fetch(new URL(`./tex/${f}.webp?v=20261026a`, import.meta.url)).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(f))))
    .then((b) => createImageBitmap(b, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })).then((bmp) => { t.image = bmp; t.needsUpdate = true; texStats.done++; done(); })
    .catch((e) => { texStats.done++; console.warn('облака не загрузились:', e.message); }); }
}
function buildClouds(scene, count, seed, W, hi, SU) {
  const rnd = mulberry32(seed * 31 + 7), pos = [], cor = [], dat = [];
  let made = 0;
  const thick = W.deck ? 1.6 : 1, flatP = W.deck ? 0.55 : 0.18;
  while (made < count) {
    const cx = (rnd() * 2 - 1) * 24000, cz = (rnd() * 2 - 1) * 24000, cy = 2300 + rnd() * 900, k = 8 + Math.floor(rnd() * 10), R = 500 + rnd() * 900;
    for (let i = 0; i < k && made < count; i++, made++) {
      const x = cx + (rnd() - 0.5) * R * 2, z = cz + (rnd() - 0.5) * R * 2, s = (700 + rnd() * 900) * thick;
      const cell = rnd() < flatP ? 12 + Math.floor(rnd() * 4) : Math.floor(rnd() * 12);
      const y = cy + (rnd() - 0.5) * 60 * thick + CLOUD_BASE * s; // у облаков гряды — общее ровное основание
      const code = (cell + 1) * (rnd() < 0.5 ? -1 : 1); // знак — зеркально
      for (const [u, v] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) { pos.push(x, y, z); cor.push(u, v); dat.push(s, code); }
    }
  }
  const idx = []; for (let i = 0; i < made; i++) idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('corner', new THREE.Float32BufferAttribute(cor, 2)); g.setAttribute('dat', new THREE.Float32BufferAttribute(dat, 2));
  g.setIndex(idx); g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 60000);
  const rdy = { value: 0 }; let left = 2; const one = () => { if (--left === 0) rdy.value = 1; };
  const sfx = hi ? '' : '_lo';
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...ENV, ...FXU, tN: cloudTex('clouds_n' + sfx, one), tD: cloudTex('clouds_d' + sfx, one), uRdy: rdy,
      skyTex: SU.skyTex, skyOn: SU.skyOn, skyU: SU.skyU, skyK: SU.skyK, zenith: SU.zenith, horizon: SU.horizon,
      lit: { value: lin(W.cloudLit) }, dark: { value: lin(W.cloudDark) }, fogC: { value: lin(W.fog) }, fogD: { value: W.fogD } },
    vertexShader: `attribute vec2 corner, dat; varying vec2 vUv; varying vec3 vL, vW; varying float vFade, vFog;
      uniform vec3 uCam, uSun; uniform float fogD;
      void main() {
        vec3 toC = uCam - position; float d = length(toC); vec3 F = toC / max(d, 1.0);
        vec3 Rc = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), Rh = cross(vec3(0.0, 1.0, 0.0), F); float rl = length(Rh);
        vec3 Rb = normalize(mix(Rc, Rh / max(rl, 1e-4), smoothstep(0.05, 0.3, rl))); // сверху и снизу — по камере
        Rb = normalize(Rb - F * dot(Rb, F)); vec3 Ub = cross(F, Rb);
        float fl = sign(dat.y), cell = abs(dat.y) - 1.0;
        vec2 uv = corner + 0.5; if (fl < 0.0) uv.x = 1.0 - uv.x;
        uv = clamp(uv, 0.004, 0.996);
        vUv = vec2((mod(cell, 4.0) + uv.x) * 0.25, 1.0 - (floor(cell / 4.0) + uv.y) * 0.25);
        vL = vec3(dot(uSun, Rb) * fl, dot(uSun, Ub), dot(uSun, F));
        vFade = smoothstep(dat.x * 0.4, dat.x * 1.4, d); vFog = max(1.0 - exp(-pow(d * fogD * 0.55, 2.0)), 1.0 - exp(-d / 15000.0)); // + воздушная перспектива
        vW = position + (Rb * corner.x + Ub * corner.y) * dat.x;
        gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0);
      }`,
    // в проходе половинного разрешения (post.js, fxOn) глубины нет — облако гасится само там, где оно за домом или самолётом
    fragmentShader: `uniform sampler2D tN, tD, tDepth, skyTex; uniform vec3 lit, dark, fogC, uSunCol, uSun, uCam, zenith, horizon; uniform float fxOn, uRdy, skyOn, skyU, skyK; uniform vec2 fxSize, camNF;
      varying vec2 vUv; varying vec3 vL, vW; varying float vFade, vFog;
      vec3 skyAt(vec3 d) { // небо за облаком — как рисует небо (drone/world.js skyMaterial), размыто
        float h = max(d.y, 0.0); vec3 col = mix(horizon, zenith, pow(h, 0.45));
        if (skyOn > 0.5) { vec2 uv = vec2(fract((atan(d.z, d.x) - atan(uSun.z, uSun.x)) / 6.2831853 + skyU), asin(min(h, 1.0)) / 1.5707963);
          #if defined(GL_EXT_shader_texture_lod) || __VERSION__ >= 300
            vec3 p = texture2DLodEXT(skyTex, uv, 5.0).rgb;
          #else
            vec3 p = texture2D(skyTex, uv, 6.0).rgb;
          #endif
          col = mix(col, p * p * skyK, smoothstep(0.0, 0.12, h)); }
        return col; }
      float fxLinZ(float d) { float z = d * 2.0 - 1.0; return 2.0 * camNF.x * camNF.y / (camNF.y + camNF.x - z * (camNF.y - camNF.x)); }
      void main() { vec4 D = texture2D(tD, vUv); float a = pow(D.r, 1.5) * 0.8 * vFade * uRdy; if (a < 0.01) discard; // края — прозрачнее
        if (fxOn > 0.5) { a *= clamp((fxLinZ(texture2D(tDepth, gl_FragCoord.xy / fxSize).r) - fxLinZ(gl_FragCoord.z)) / 120.0, 0.0, 1.0); if (a < 0.01) discard; }
        vec3 A = texture2D(tN, vUv).rgb, L = normalize(vL), q = L * L; // свет сквозь объём: справа, сверху, слева; веса — квадраты осей
        float day = smoothstep(-0.08, 0.12, uSun.y), avg = (A.r + A.g + A.b) / 3.0;
        float sun = (L.x > 0.0 ? q.x * A.r : q.x * A.b) + (L.y > 0.0 ? q.y * A.g : q.y * avg * 0.3)
                  + (L.z > 0.0 ? q.z * (0.3 + 0.7 * mix(avg, A.g, 0.45)) : q.z * D.g * 1.3); // солнце за спиной — облако светлое; за облаком — светятся тонкие края
        vec3 bg = skyAt(normalize(vW - uCam)), amb = mix(dark, bg, 0.55); // тень облака — в цвет неба за ним
        vec3 lt = mix(vec3(dot(lit, vec3(0.3, 0.59, 0.11))), lit, 0.6); // закатный свет — приглушённый
        vec3 c = (amb * (0.26 + 0.58 * D.b) + max(lt - amb * 0.4, vec3(0.0)) * pow(sun, 1.25) * 0.9 * day) * (0.85 + 0.25 * uSunCol);
        c = mix(c, bg, max(vFog, 0.14)); // всегда чуть в дымке неба, вдали растворяется в нём
        gl_FragColor = vec4(c, min(a * 1.1, 1.0) * (1.0 - vFog * 0.35));
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }`,
    transparent: true, depthWrite: false, fog: false, extensions: { shaderTextureLOD: true },
  });
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = 0.5; scene.add(mesh); // облака — фон: раньше дыма (1) и взрывов (3), иначе дальнее облако ложилось поверх них
  return mesh;
}

// мост поперёк реки (вдоль X): пролёт над водой, пологие въезды до самой земли (у берега — сплошная опора-устой), перила,
// разметка, быки в русле. Части для столкновений и сетки высот — прежние (city.js), здесь только картинка
const topR = [], conR = [], mkR = []; // въезды (общие буферы на вызов bridgeParts — очищаются в начале)
function bridgeParts(o) {
  topR.length = conR.length = mkR.length = 0;
  const Yd = 9, T = 2.4, HW = 18, SPAN = CITY.RIVER_W / 2 + 30, K = 0.07, DS = 5;
  const prof = (s) => (Math.abs(s) <= SPAN ? Yd : Yd - K * (Math.abs(s) - SPAN));
  // въезд кончается, где настил лёг на землю (с каждой стороны — своя длина)
  const end = (dir) => { let s = SPAN; while (s < SPAN + 400 && prof(dir * s) > GH(o.x + dir * s, o.z) + 0.3) s += DS; return s + DS; };
  const s0 = -end(-1), s1 = end(1), top = [], con = [], mk = [], topS = [], conS = [], mkS = [];
  const quad = (arr, a, b, c, d) => arr.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (let s = s0; s < s1 - 0.1; s += DS) {
    const span = s >= -SPAN - 0.1 && s + DS <= SPAN + 0.1, [top, con, mk] = span ? [topS, conS, mkS] : [topR, conR, mkR]; // над водой — пролёт (его заменяет модель br_seg)
    const sa = s, sb = Math.min(s1, s + DS), xa = o.x + sa, xb = o.x + sb, ga = GH(xa, o.z), gb = GH(xb, o.z);
    const ya = Math.max(prof(sa), ga + 0.3), yb = Math.max(prof(sb), gb + 0.3);
    // низ: над водой — балка толщиной T, у берега (под настилом меньше 4 м) — сплошной устой до земли
    const ba = ga > ya - T - 4 ? ga - 1 : ya - T, bb = gb > yb - T - 4 ? gb - 1 : yb - T;
    quad(top, [xa, ya, o.z - HW], [xa, ya, o.z + HW], [xb, yb, o.z + HW], [xb, yb, o.z - HW]);
    for (const zz of [o.z - HW, o.z + HW]) {
      quad(con, [xa, ba, zz], [xa, ya, zz], [xb, yb, zz], [xb, bb, zz]);                       // боковина
      quad(con, [xa, ya, zz], [xa, ya + 1.1, zz], [xb, yb + 1.1, zz], [xb, yb, zz]);           // перила
    }
    quad(con, [xa, ba, o.z + HW], [xa, ba, o.z - HW], [xb, bb, o.z - HW], [xb, bb, o.z + HW]);  // низ
    if (Math.floor(s / 12) % 2 === 0) quad(mk, [xa, ya + 0.04, o.z - 0.15], [xa, ya + 0.04, o.z + 0.15], [xb, yb + 0.04, o.z + 0.15], [xb, yb + 0.04, o.z - 0.15]);
  }
  const geo = (arr) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); g.computeVertexNormals(); return g; };
  const ramp = [part(geo(topR), 0x34363a), part(geo(conR), 0x8f8d88), part(geo(mkR), 0xd8d8d0)], span = [part(geo(topS), 0x34363a), part(geo(conS), 0x8f8d88), part(geo(mkS), 0xd8d8d0)];
  // быки в русле
  for (const s of [-75, 0, 75]) { const h = Yd - T - CITY.WATER_Y + 8; span.push(part(new THREE.BoxGeometry(7, h, HW * 2 - 8), 0x7f7d78, M(o.x + s, CITY.WATER_Y - 8 + h / 2, o.z))); }
  return { ramp, span, Yd, SPAN, HW };
}

// пролёты мостов над водой — моделью br_seg (VectorMan): экземплярами (одна отрисовка на деталь на все мосты), процедурный
// пролёт прячется. Модель: асфальт на +3,2 м, колонны опоры — от −4,71 до −0,28 м (растягиваются до дна), ригель (cap) — только
// над колоннами (через пролёт-два), ширина асфальта 5,5 м
// аэродром: огни приближения — стойки через 60 м на 900 м за торцами ВПП (ось — по X; где дом — пропуск), топливозаправщики у цистерн
function attachAirfield(G, scene, name, model, city, P) {
  const { x, z, rwyL } = AIRPORT, pts = [];
  if (name === 'af_appr') { for (const s of [-1, 1]) for (let k = 0; k < 15; k++) { const px = x + s * (rwyL / 2 + 30 + k * 60); if (Math.abs(px) < CITY.HALF - 50 && city.bldAt(px, z) <= 0) pts.push([px, z, Math.PI / 2]); } }
  else pts.push([x + 380, z + 578, Math.PI / 2], [x + 396, z + 578, Math.PI / 2], [x + 300, z + 470, 0]);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  model.traverse((c) => {
    if (!c.isMesh) return;
    const im = new THREE.InstancedMesh(c.geometry, c.material, pts.length);
    pts.forEach(([px, pz, yaw], i) => im.setMatrixAt(i, m4.compose(v.set(px, GH(px, pz), pz), q.setFromAxisAngle(Y, yaw), one)));
    im.castShadow = name === 'af_fuel' && !!P.shadows; im.receiveShadow = !!P.shadows; scene.add(im);
  });
}
function attachBridgeSegs(G, scene, model, P) {
  const list = G.bridgeSpans || []; if (!list.length) return;
  // широкий городской мост — четыре параллельных пролёта (ширина модели 7,75 м), перила — только по внешним краям
  const L = { deck: [], railL: [], railR: [], pier: [], cap: [] }, m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2), v = new THREE.Vector3(), sc = new THREE.Vector3();
  for (const b of list) {
    const n = Math.max(1, Math.round(2 * b.SPAN / 9.6)), sl = 2 * b.SPAN / (n * 9.6), NS = 4, sx = (2 * b.HW) / (NS * 7.75), y0 = b.Yd - 3.2;
    for (let k = 0; k < n; k++) for (let st = 0; st < NS; st++) {
      const x = b.o.x - b.SPAN + (k + 0.5) * 2 * b.SPAN / n, z = b.o.z + (st - (NS - 1) / 2) * 7.75 * sx; // поворот на 90°: +x модели → −z мира
      const dm = m4.compose(v.set(x, y0, z), q, sc.set(sx, 1, sl)).clone(); L.deck.push(dm);
      if (st === 0) L.railR.push(dm); if (st === NS - 1) L.railL.push(dm);
      if (k % 3 === 1 || n < 3) { L.cap.push(dm); const top = y0 - 0.28, bot = CITY.WATER_Y - 8, sy = (top - bot) / 4.43; L.pier.push(m4.compose(v.set(x, top + 0.28 * sy, z), q, sc.set(sx, sy, sl)).clone()); }
    }
    b.mesh.visible = false;
  }
  model.traverse((c) => {
    if (!c.isMesh) return;
    const k = (c.name.match(/^(railL|railR|pier|cap)\|/) || [])[1] || 'deck', mats = L[k], im = new THREE.InstancedMesh(c.geometry, c.material, mats.length);
    mats.forEach((m, i) => im.setMatrixAt(i, m)); im.instanceMatrix.needsUpdate = true; im.frustumCulled = false;
    im.castShadow = im.receiveShadow = !!P.shadows; scene.add(im);
  });
}

// ═════════════ Сборка сцены ═════════════
export function buildCityScene(scene, city, P, renderer, weatherKey = 'day') {
  GH = city.groundH; ZA = city.zoneAt; const WINT = city.kind === 'winter'; ENV.uSnowK.value = WINT ? 1 : 0; // зимняя карта: своя земля и лес, без реки-воды и улиц
  const AUT = city.kind === 'autumn', HILLS = WINT || AUT; // осенняя «Туманная топь»: своя земля, лес, дороги и вода болота (без снега)
  const W = WEATHERS[weatherKey] || WEATHERS.day;
  const G = { tiles: [], W, renderer, winter: WINT }; // renderer — снимки моделей для дальних копий домов (makeImpostor)
  if (P.roofDetail) loadCityTextures(renderer ? Math.min(P.aniso || 4, renderer.capabilities.getMaxAnisotropy()) : 1); // на «Низком» — без текстур
  else for (const u of Object.keys(TEX_FILES)) if (!TEX[u]) TEX[u] = { value: null };
  // солнце и атмосфера по погоде (как setWeather в «Летке»)
  const e = W.el * Math.PI / 180, a = W.az * Math.PI / 180;
  const sunDir = new THREE.Vector3(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a));
  ENV.uSun.value.copy(sunDir); ENV.uZen.value.copy(lin(W.zenith)); ENV.uHor.value.copy(lin(W.horizon)); ENV.uGnd.value.copy(lin(W.fog)).multiplyScalar(0.25);
  ENV.uSunCol.value.copy(lin(W.sun)).multiplyScalar(W.sunVis ? 1 : 0.15); ENV.uNight.value = W.night || 0;
  const SU = { sunDir: { value: sunDir }, zenith: { value: lin(W.zenith) }, horizon: { value: lin(W.horizon) }, ground: { value: lin(W.fog).multiplyScalar(0.75) },
    glow: { value: lin(W.glow).multiplyScalar(W.glowK || 0) }, haze: { value: lin(W.haze) }, sunCol: { value: lin(W.sun).lerp(new THREE.Color(1, 0.95, 0.85), W.el < 20 ? 0.25 : 0.5) },
    hazeK: { value: W.hazeK }, halo: { value: W.halo }, discK: { value: W.disc }, flash: { value: 0 }, ...skyUniforms() };
  SKY.hi = !P.skyOnly && renderer.capabilities.maxTextureSize >= 8192; skyPano(SU, W); // панорама неба (Poly Haven); 8K — не на телефонных пресетах
  const sky = new THREE.Mesh(new THREE.SphereGeometry(42000, 48, 24), skyMaterial(SU, 1));
  sky.renderOrder = -2; sky.frustumCulled = false; scene.add(sky); G.sky = sky;
  // дымка: не реже, чем нужно, чтобы дальние плитки растворялись до того, как пропадут
  scene.fog = new THREE.FogExp2(lin(W.fog), Math.max(W.fogD, 1.15 / P.draw));
  ATMO.sunDir.x = sunDir.x; ATMO.sunDir.y = sunDir.y; ATMO.sunDir.z = sunDir.z;
  const sc = lin(W.sun), fc = lin(W.fog), lowSun = 1 - THREE.MathUtils.smoothstep(sunDir.y, 0.1, 0.6);
  ATMO.sunCol.x = fc.r * 0.4 + sc.r * 0.9; ATMO.sunCol.y = fc.g * 0.4 + sc.g * 0.9; ATMO.sunCol.z = fc.b * 0.4 + sc.b * 0.9;
  ATMO.p.y = W.sunVis ? 0.35 + 0.4 * lowSun : 0;

  // свет
  const hemi = new THREE.HemisphereLight(lin(W.sky), lin(W.gnd), 0.55 * W.hemiI); scene.add(hemi);
  const sunL = new THREE.DirectionalLight(lin(W.sun), 2.0 * W.sunI * (0.35 + 0.65 * Math.min(1, sunDir.y / 0.25)));
  sunL.position.copy(sunDir).multiplyScalar(5000); scene.add(sunL); scene.add(sunL.target);
  if (P.shadows && W.shadows) {
    sunL.castShadow = true; sunL.shadow.mapSize.set(P.shadowMap || 2048, P.shadowMap || 2048);
    const b = P.shadowBox || 700, c = sunL.shadow.camera; c.left = -b; c.right = b; c.top = b; c.bottom = -b; c.near = 100; c.far = 12000; c.updateProjectionMatrix();
    sunL.shadow.bias = -0.0004; sunL.shadow.normalBias = 1.5;
    G.shTexel = 2 * b / (P.shadowMap || 2048);
  }
  G.sun = sunL; G.sunDir = sunDir; G.hemi = hemi;
  const sh = { cast: P.shadows, receive: P.shadows };

  // земля
  const seg = HILLS ? Math.min(640, Math.round(P.groundSeg * 1.6)) : P.groundSeg; // горы и холмы — сетка гуще
  const gg = new THREE.PlaneGeometry(2 * CITY.HALF, 2 * CITY.HALF, seg, seg); gg.rotateX(-Math.PI / 2);
  const pa = gg.attributes.position, uv = gg.attributes.uv;
  for (let i = 0; i < pa.count; i++) {
    pa.setY(i, GH(pa.getX(i), pa.getZ(i)));
    uv.setXY(i, (pa.getX(i) + CITY.HALF) / (2 * CITY.HALF), (pa.getZ(i) + CITY.HALF) / (2 * CITY.HALF));
  }
  gg.computeVertexNormals();
  const zt = HILLS ? null : zoneTexture(P.zoneTex || 1024); if (zt) zt.flipY = false;
  if (renderer && zt) zt.anisotropy = Math.min(P.aniso || 4, renderer.capabilities.getMaxAnisotropy());
  const aniso = renderer ? Math.min(P.aniso || 4, renderer.capabilities.getMaxAnisotropy()) : 1;
  const ground = new THREE.Mesh(gg, AUT ? autumnGroundMaterial(city, autumnZoneTex(city, P.zoneTex || 1024), winterNormalTex(city), ENV, autumnTextures(aniso, texStats), W) : WINT ? winterGroundMaterial(city, winterZoneTex(city, P.zoneTex || 1024), winterNormalTex(city), ENV, winterTextures(renderer ? Math.min(P.aniso || 4, renderer.capabilities.getMaxAnisotropy()) : 1, texStats)) : groundMaterial(zt, aoTexture(city), roadTexture(city)));
  ground.receiveShadow = !!P.shadows; scene.add(ground); G.ground = ground;
  // земля — последней из непрозрачного (2026-10-25): её шейдер — самый дорогой, а под лесом, домами и техникой он теперь не считается —
  // их глубина уже в буфере (стенд: кадр за самолётом над лесом −13 % на «Высоком», −6 % на «Среднем»; картинка та же — прозрачное всё равно после)
  if (!/[?&]gro=0/.test(typeof location !== 'undefined' ? location.search : '')) ground.renderOrder = 1;
  { // высота самой сетки земли (треугольники через 2·HALF/seg м), а не точная высота карты: на выпуклом склоне сетка выше на метры,
    // у берега реки в городе (спуск к воде ~60 м, клетка сетки — больше) — ниже или выше. По ней ставятся машины ПВО (main.js seat)
    const st = 2 * CITY.HALF / seg, gH = city.groundH, n1 = seg + 1, hv = new Float32Array(n1 * n1);
    for (let j = 0; j < n1; j++) for (let i = 0; i < n1; i++) hv[j * n1 + i] = gH(-CITY.HALF + i * st, -CITY.HALF + j * st);
    G.meshH = (x, z) => {
      const fx = Math.min(seg - 1e-4, Math.max(0, (x + CITY.HALF) / st)), fz = Math.min(seg - 1e-4, Math.max(0, (z + CITY.HALF) / st)), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
      const a = hv[j * n1 + i], b = hv[(j + 1) * n1 + i], c = hv[(j + 1) * n1 + i + 1], d = hv[j * n1 + i + 1]; // как PlaneGeometry: (a, b, d) и (b, c, d)
      return u + v <= 1 ? a + (d - a) * u + (b - a) * v : c + (b - c) * (1 - u) + (d - c) * (1 - v);
    };
  }
  if (HILLS) { // дальше всё ставится по высоте сетки, а не по точной высоте карты: дороги и дома на склоне «тонули» бы
    GH = G.meshH; G.roads = AUT ? autumnRoads(scene, city, ground.material.userData.AT || {}, P, GH) : winterRoads(scene, city, ground.material.userData.WT || {}, P, GH);
  }

  // река: тёмная вода, волны, отражение неба, блик солнца
  const WM = AUT ? autumnWaterMask(city) : null; // осень: вода болота — по маске (где вода), а не вдоль реки
  const wm = new THREE.MeshPhongMaterial({ color: lin(AUT ? 0x141710 : 0x1a2e3a), specular: lin(W.sun).multiplyScalar(W.sunVis ? 1.2 : 0.2), shininess: 260 });
  wm.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, ENV, { tWN: TEX.tWN, uTexOn: TEX.uTexOn }, WM ? { tWM: { value: WM.tex }, uWM: { value: WM.rect } } : {});
    s.vertexShader = 'varying vec3 vWp;\n' + s.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = 'varying vec3 vWp;\nvec3 wEmis = vec3(0.0); uniform sampler2D tWN; uniform float uTexOn;\n' + (WM ? 'uniform sampler2D tWM; uniform vec4 uWM;\n' : '') + 'float riverX(float z) { return 1300.0 * sin(z * 0.00019 + 0.6) + 450.0 * sin(z * 0.00052 + 2.1) - 300.0; }\n' + GLSL_COMMON + s.fragmentShader
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
  float t = uTime; vec2 q = vWp.xz;
  vec2 gw = vec2(cos(q.x * 0.11 + t * 1.3) + 0.6 * cos(q.x * 0.27 + q.y * 0.19 + t * 1.9), sin(q.y * 0.13 + t * 1.1) + 0.6 * sin(q.y * 0.31 - q.x * 0.17 + t * 2.3));
  gw += (vec2(vns(q * 0.35 + t * 0.4), vns(q.yx * 0.35 - t * 0.4)) - 0.5) * 1.6;
  vec3 nW = normalize(vec3(gw.x * 0.05, 1.0, gw.y * 0.05));
  float wd = length(vWp - uCam), wpx = wd * uPx, rimD = ${WM ? '(texture2D(tWM, (vWp.xz - uWM.xy) / uWM.zw).r - 0.5) * 110.0' : `${(CITY.RIVER_W / 2).toFixed(1)} - abs(vWp.x - riverX(vWp.z))`}; // до берега, м (болото — по размытой маске воды)
  if (rimD < -1.5) discard; // полоса воды шире реки (закрыть урез) — за линией берега её нет: там, где земля ниже уровня, иначе вылезала голубым
  if (uTexOn > 0.5) { // рябь (three.js waternormals): два слоя навстречу по течению, вдали — спокойнее
    vec3 a = texture2D(tWN, q / 21.0 + vec2(0.012, 0.031) * t).rgb * 2.0 - 1.0, b = texture2D(tWN, q / 53.0 - vec2(0.021, 0.017) * t).rgb * 2.0 - 1.0;
    vec2 rp = (a.xy + b.xy) * (0.22 * (1.0 - smoothstep(1.0, 12.0, wpx)) + 0.05)${WM ? ' * 0.25' : ''}; // болото — стоячая вода, рябь слабая
    nW = normalize(nW + vec3(rp.x, 0.0, rp.y));
  }
  ${WM ? 'nW = normalize(vec3(nW.x * 0.2, 1.0, nW.z * 0.2)); // болото: без волн — гладь' : ''}
  normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
  vec3 Vw = normalize(uCam - vWp), Rf = reflect(-Vw, nW);
  float fres = 0.03 + 0.97 * pow(1.0 - max(dot(nW, Vw), 0.0), 5.0);
  float shallow = 1.0 - smoothstep(4.0, 45.0, rimD); // у берега — мельче: светлее, мутно-зелёная
  wEmis = skyAt(Rf) * fres * 0.9 * (1.0 - 0.45 * shallow); // у кромки отражение неба слабее (мелко, видно дно)
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.6, 1.9, 1.5) + vec3(0.01, 0.012, 0.006), shallow * 0.6);
  // у самой кромки (≈ 12 м) вода — цвета мокрого песка под ней, без отражения неба: никакой голубой каёмки у берега
  float edge = 1.0 - smoothstep(0.0, 12.0 + 6.0 * vns(q * 0.05), rimD);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.085, 0.075, 0.055), edge);
  wEmis *= 1.0 - edge;${WM ? `\n  wEmis *= 0.5; // торфяная вода болота — тёмная, отражает слабее
  float sc = smoothstep(0.5, 0.78, vns(q * 0.012) * 0.6 + vns(q * 0.07) * 0.4); // ряска и тина пятнами — матовые, без отражения
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.045, 0.055, 0.018), sc * 0.85); wEmis *= 1.0 - sc * 0.85;` : ''}`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += wEmis;');
  };
  // вода — только полосой вдоль реки: сплошная плоскость в 4–10 м под землёй «мерцала» с большой высоты (не хватало точности глубины)
  const wv = [], wi = [], half = CITY.RIVER_W / 2 + 45;
  for (let z = -CITY.HALF, i = 0; z <= CITY.HALF; z += 60, i++) {
    const x = riverX(z); wv.push(x - half, 0, z, x + half, 0, z);
    if (i) wi.push((i - 1) * 2, i * 2, (i - 1) * 2 + 1, (i - 1) * 2 + 1, i * 2, i * 2 + 1);
  }
  const wg = WM ? new THREE.PlaneGeometry(WM.rect.z, WM.rect.w, 8, 8).rotateX(-Math.PI / 2).translate(WM.rect.x + WM.rect.z / 2, 0, WM.rect.y + WM.rect.w / 2) : new THREE.BufferGeometry();
  if (!WM) { wg.setAttribute('position', new THREE.Float32BufferAttribute(wv, 3)); wg.setIndex(wi); wg.computeVertexNormals(); }
  const water = new THREE.Mesh(wg, wm);
  water.position.y = AUT ? city.autumn.WY : CITY.WATER_Y; water.receiveShadow = !!P.shadows; if (!WINT) scene.add(water); // зимой реки и озёра — лёд в земле

  // здания, надстройки и скатные крыши
  const B = city.B, list = [], small = [], roofs = [], extras = [], col = new THREE.Color(), near = BLD.map(() => []);
  const pick = (kind, c) => { const pal = PAL[kind]; return col.set(pal[Math.floor(c * pal.length) % pal.length]).convertSRGBToLinear().multiplyScalar(0.62 + 0.2 * ((c * 7.31) % 1)).clone(); };
  for (let i = 0; i < B.n; i++) {
    const k = B.k[i], c = B.c[i], y0 = B.y0[i], gy = GH(B.x[i], B.z[i]);
    if (k === KIND.HOUSE && P.houseK < 1 && ((i * 2654435761) >>> 0) / 4294967296 > P.houseK) continue; // слабые пресеты: часть частных домов не рисуем
    const raised = y0 > 0, mdl = P.bldNear ? bldVariant(B, i) : 0;
    if (mdl) near[mdl].push(i);
    (k === KIND.HOUSE ? small : list).push({ x: B.x[i], z: B.z[i], y: raised ? gy + y0 : gy - 1, sx: B.w[i], sy: B.h[i] + (raised ? 0 : 1), sz: B.d[i], color: pick(k, c), kind: k + c * 0.9 + (raised ? 10 : 0), mdl });
    const top = gy + y0 + B.h[i];
    if (k === KIND.HOUSE) {
      const along = B.w[i] >= B.d[i], rh = roofH(c);
      roofs.push({ x: B.x[i], z: B.z[i], y: top, sx: (along ? B.w[i] : B.d[i]) + 0.8, sy: rh, sz: (along ? B.d[i] : B.w[i]) + 0.8, ry: along ? 0 : Math.PI / 2, color: pick(ROOF, (c * 13.7) % 1), kind: ROOF, mdl }); // крыша уходит вместе с домом
    } else if (P.roofDetail && B.h[i] > 12 && B.w[i] > 10 && B.d[i] > 10 && k !== KIND.WAREHOUSE) {
      const r = mulberry32(i * 7919 + 13), cnt = 1 + Math.floor(r() * (k === KIND.PANEL ? 2 : 4));
      for (let q = 0; q < cnt; q++) {
        const big = k === KIND.GLASS || k === KIND.OFFICE, sw = big ? 5 + r() * 9 : 3 + r() * 3, sd = big ? 5 + r() * 9 : 4 + r() * 4, sh2 = 2 + r() * (big ? 5 : 2);
        const mx = Math.max(0, B.w[i] / 2 - sw / 2 - 2), mz = Math.max(0, B.d[i] / 2 - sd / 2 - 2);
        extras.push({ x: B.x[i] + (r() * 2 - 1) * mx, z: B.z[i] + (r() * 2 - 1) * mz, y: top, sx: sw, sy: sh2, sz: sd, color: pick(ROOFX, r()), kind: ROOFX + r() * 0.9, mdl }); // надстройки уходят вместе с домом
      }
    }
  }
  const bMat = buildingMaterial(); if (WINT) snowify(bMat);
  G.tiles.push(...tiled(scene, list, boxGeo(), bMat, sh));
  // частные дома (их больше половины) вдали — в пиксель-два, только рябят: дальность как у их крыш
  if (small.length) G.tiles.push(...tiled(scene, small, boxGeo(), bMat, sh, 0.55));
  nearHouses(G, scene, B, near, P, sh);
  if (G.addNear && P.props !== false && !HILLS) streetProps(G, city, B, P);
  if (G.addNear && P.props !== false && AUT) autumnProps(G, city, P, GH); // «Туманная топь»: тыквы, кладбище, сено, сухостой, брошенные машины // «Детали улиц» можно выключить (тонкая настройка)
  if (roofs.length) G.tiles.push(...tiled(scene, roofs, roofGeo(), bMat, sh, 0.55));
  if (extras.length) G.tiles.push(...tiled(scene, extras, boxGeo(), bMat, { cast: false, receive: P.shadows }, 0.45));

  // объекты-цели
  // объекты-цели — каждый своей сеткой (разрушенный объект оседает и чернеет)
  const OCOL = { w_dam: 0xa8a8a2, w_radar: 0xd8dcdc, w_air: 0xa6a99c, w_cp: 0x8f9384, tv: 0x9a9c94, gov: 0x8f9384, tpp: 0x7d8270, oil: 0xc9c6b8, stad: 0x6f7563, air: 0xa6a99c, bridge: 0x8f8d88, port: 0xd08a2c }; // военные объекты — защитные и бетонные тона
  const objMat = new THREE.MeshPhongMaterial({ vertexColors: true, side: THREE.DoubleSide, specular: 0x222222, shininess: 20 }); if (WINT) snowify(objMat);
  G.objMesh = {}; G.objMat = objMat; G.ruinMat = new THREE.MeshPhongMaterial({ color: 0x1c1a18, specular: 0x050505, shininess: 4, side: THREE.DoubleSide });
  G.objBox = {}; G.objGroup = {}; G.objFar = {}; const FARC = {};
  // вышка аэродрома — моделью КДП (цилиндр из city.js остаётся только для LOS)
  const ATC = (o, p) => o.key === 'air' && p.t === 'cyl' && p.r === 6 && p.h === 30;
  for (const o of city.objects) if (o.key === 'air' && o.models && !o.models.some((q) => q.m === 'af_atc')) { const p = o.parts.find((q) => ATC(o, q)); if (p) o.models.push({ m: 'af_atc', x: p.x, z: p.z, rot: 0, s: 1 }); }
  for (const o of city.objects) {
  const br = o.bridge ? bridgeParts(o) : null, parts = br ? br.ramp : [], boxes = [];
  if (br) { const sm = new THREE.Mesh(mergeParts(br.span), objMat); sm.castShadow = sm.receiveShadow = !!P.shadows; scene.add(sm); (G.bridgeSpans = G.bridgeSpans || []).push({ o, mesh: sm, Yd: br.Yd, SPAN: br.SPAN, HW: br.HW }); }
  for (const p of o.bridge ? [] : o.parts) {
    // коробки готовых построек — временная заглушка, пока не загрузилась модель
    if (ATC(o, p)) continue;
    if (p.model) { const gy = GH(p.x, p.z) - 1; boxes.push(part(new THREE.BoxGeometry(p.w, p.h + 1, p.d), OCOL[o.key] || 0xbbbbbb, M(p.x, gy + (p.h + 1) / 2, p.z))); continue; }
    const y0 = (p.y0 !== undefined ? p.y0 : GH(p.x, p.z) - 1), color = OCOL[o.key] || 0xbbbbbb, hh = p.h + (p.y0 !== undefined ? 0 : 1);
    if (p.t === 'box') parts.push(part(new THREE.BoxGeometry(p.w, hh, p.d), color, M(p.x, y0 + hh / 2, p.z)));
    else if (p.t === 'cyl') {
      const bands = p.h > 150 && p.r < 10 ? 8 : 1; // заводские трубы — красно-белые
      for (let b = 0; b < bands; b++) {
        const hb = p.h / bands, rb = p.r * (1 - 0.35 * (b / bands));
        parts.push(part(new THREE.CylinderGeometry(rb * 0.97, rb, hb + 0.5, 16), bands > 1 ? (b % 2 ? 0xe9e9e4 : 0xc0392b) : color, M(p.x, y0 + hb * (b + 0.5), p.z)));
      }
    } else if (p.t === 'cone') { // градирня — гиперболоид
      const pts = []; for (let s = 0; s <= 10; s++) { const t = s / 10, r = p.r * (0.62 + 0.38 * Math.pow(Math.abs(t - 0.72) / 0.72, 2)); pts.push(new THREE.Vector2(r, t * p.h)); }
      parts.push(part(new THREE.LatheGeometry(pts, 32), 0xcbc8c0, M(p.x, y0, p.z)));
    }
  }
  if (parts.length) { const objMesh = new THREE.Mesh(mergeParts(parts), objMat); objMesh.castShadow = objMesh.receiveShadow = !!P.shadows; scene.add(objMesh); G.objMesh[o.id] = objMesh; }
  if (boxes.length) { const b = new THREE.Mesh(mergeParts(boxes), objMat); b.castShadow = b.receiveShadow = !!P.shadows; scene.add(b); G.objBox[o.id] = b; }
  if (o.models) { const g = new THREE.Group(); g.userData.left = new Set(o.models.map((q) => q.m)); scene.add(g); G.objGroup[o.id] = g;
    const f = new THREE.Group(); f.visible = false; f.userData.left = new Set(g.userData.left); scene.add(f); G.objFar[o.id] = f; } // вдали — упрощённые копии тех же построек
  }
  // модель постройки загрузилась: копии во все места, где она стоит; все модели объекта на месте — заглушка прячется
  // постройки с частями своего цвета (prepare.js: группа «#имя»): на каждой карте — свои цвета (линейные); pad — подложка у земли:
  // чуть выше рельефа и со сдвигом глубины (иначе издали мерцает с землёй), снега на ней нет (расчищена)
  const OBJ_TINT = { obj_hangar: { city: { pad: [0.07, 0.07, 0.065], shed: [0.1, 0.11, 0.08] }, winter: { pad: [0.25, 0.26, 0.28], shed: [0.3, 0.32, 0.34] } } };
  const objTint = (name, root) => {
    const T = OBJ_TINT[name] && OBJ_TINT[name][G.winter ? 'winter' : 'city']; if (!T) return;
    root.traverse((c) => {
      if (!c.isMesh) return; const part = (c.name || '').split('#')[1]; if (!part) return;
      if (part === 'pad') { c.position.y = 0.3; c.userData.noSnow = true; }
      const m = c.material; if (m.userData.tinted) return; m.userData.tinted = true;
      if (T[part]) m.color.setRGB(...T[part]);
      if (part === 'pad') { m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -6; }
    });
  };
  G.attachObjModel = (name, make) => {
    if (name === 'br_seg') { attachBridgeSegs(G, scene, make(), P); return; }
    if (name === 'af_appr' || name === 'af_fuel') { attachAirfield(G, scene, name, make(), city, P); return; }
    for (const o of city.objects) {
      const g = G.objGroup[o.id]; if (!g || !g.userData.left.has(name)) continue;
      for (const q of o.models) if (q.m === name) {
        const m = make(); m.position.set(q.x, GH(q.x, q.z), q.z); m.rotation.y = q.rot * Math.PI / 2; m.scale.setScalar(q.s); objTint(name, m);
        m.traverse((c) => { if (c.isMesh) { c.castShadow = !!P.shadows && !c.userData.noSnow; c.receiveShadow = !!P.shadows; if (G.winter && !c.userData.noSnow) snowify(c.material); } }); g.add(m); freezeTree(m);
      }
      g.userData.left.delete(name);
      if (!g.userData.left.size && G.objBox[o.id]) G.objBox[o.id].visible = false;
    }
    // дальняя копия постройки (одна на модель): те же меши с сильно упрощённой сеткой — вместо коробки вдали (main.js objLod)
    const tmpl0 = make(); objTint(name, tmpl0);
    (FARC[name] = FARC[name] || (async () => {
      const t = tmpl0, ms = []; t.traverse((c) => { if (c.isMesh) ms.push(c); });
      let tri = 0; for (const m of ms) tri += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
      const gs = await Promise.all(ms.map((m) => farGeo(m.geometry, tri >= 8000)));
      ms.forEach((m, i) => { m.geometry = farFlat(m, gs[i], m.geometry); m.castShadow = false; m.receiveShadow = !!P.shadows; }); // одним материалом (farFlat)
      return t;
    })()).then((t) => {
      for (const o of city.objects) {
        const f = G.objFar[o.id]; if (!f || !f.userData.left.has(name)) continue;
        for (const q of o.models) if (q.m === name) { const m = t.clone(); m.position.set(q.x, GH(q.x, q.z), q.z); m.rotation.y = q.rot * Math.PI / 2; m.scale.setScalar(q.s); f.add(m); freezeTree(m); }
        f.userData.left.delete(name); f.userData.ready = !f.userData.left.size;
        if (f.userData.ready && !f.userData.ruin) { bakeGroup(f); freezeTree(f); } // все дальние копии на месте — одной сеткой на материал (было: 9 построек порта × детали — десятки вызовов отрисовки); ближние — не запекаем: видны редко, а копия — лишняя память
      }
    }).catch(() => { /* без дальней копии — коробка */ });
  };

  // деревья: вдоль улиц, в парках и во дворах
  if (P.trees > 0 && WINT) { // зимняя карта: ельник по району «лес» — импосторы ели и сосны, снег на ветвях
    const tl = winterTrees(city, P, mulberry32(city.seed * 7 + 3), GH), q = new THREE.PlaneGeometry(1, 1);
    // вблизи — 3D-модели (снег на лапах — snowify в attachBld), импосторы там прячутся; радиус больше городского — лес гуще
    if (G.addNear && P.treeNear) {
      const per = TREES_W.map(() => []), m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), YY = new THREE.Vector3(0, 1, 0), pp = new THREE.Vector3(), ss = new THREE.Vector3();
      for (const t of tl) { per[t.v].push(t); t.mdl = TREES_W[t.v][0]; }
      TREES_W.forEach(([slot, name, h], v) => {
        const L = per[v], xz = new Float32Array(L.length * 2), mats = new Float32Array(L.length * 16);
        L.forEach((t, j) => { m4.compose(pp.set(t.x, t.y + 0.3, t.z), qq.setFromAxisAngle(YY, t.ry), ss.setScalar(1.3 * t.sy / h)); m4.toArray(mats, j * 16); xz[j * 2] = t.x; xz[j * 2 + 1] = t.z; });
        G.addNear('w' + slot, slot, name, Math.round(P.treeNear * 1.6), xz, mats);
      });
    }
    const li = tl.map((t) => ({ x: t.x, z: t.z, y: t.y + 0.3, sx: 1.3 * t.sy, sy: 1.3 * t.sy, sz: 1.3 * t.sy, kind: t.v, color: t.color, ry: t.ry, mdl: t.mdl || 0 }));
    G.tiles.push(...tiled(scene, li, q, treeImpMat('winter', P.trees >= 14000, hemi, sunL, !!P.perf && P.perf.aa === 'msaa'), { cast: false, receive: false }, 0.8));
  } else if (P.trees > 0 && AUT) { // осенняя карта: лес по району «лес» (склоны оврагов, холмы, кочки в болоте) — импосторы, листва перекрашена
    const tl = autumnTrees(city, P, mulberry32(city.seed * 7 + 3), GH), q = new THREE.PlaneGeometry(1, 1);
    const li = tl.map((t) => ({ x: t.x, z: t.z, y: t.y + 0.3, sx: t.sy, sy: t.sy, sz: t.sy, kind: t.v, color: t.color, ry: t.ry, mdl: 0 }));
    G.tiles.push(...tiled(scene, li, q, treeImpMat('autumn', P.trees >= 14000, hemi, sunL, !!P.perf && P.perf.aa === 'msaa'), { cast: false, receive: false }, 0.8));
  } else if (P.trees > 0) {
    const rnd = mulberry32(city.seed * 7 + 3), tl = [], tc = new THREE.Color();
    const tree = (x, z, s) => {
      tc.setHSL(0.2 + rnd() * 0.09, 0.38 + rnd() * 0.22, 0.17 + rnd() * 0.1).convertSRGBToLinear();
      tl.push({ x, z, y: GH(x, z) - 0.3, sx: s, sy: s * (1.1 + rnd() * 0.5), sz: s, color: tc.clone(), ry: rnd() * 6 });
    };
    // вдоль улиц жилых районов: ряд у тротуара, шаг ~14 м, с пропусками
    const G2 = CITY.GRID, streetN = Math.floor(P.trees * 0.45);
    for (let t = 0; t < streetN * 3 && tl.length < streetN; t++) {
      const alongX = rnd() < 0.5, i = Math.round((rnd() * 2 - 1) * CITY.R * 0.8 / G2), side = rnd() < 0.5 ? -1 : 1;
      const hw = (((i % 5) + 5) % 5 === 0 ? CITY.AVENUE : CITY.STREET) / 2 + 2.5;
      const along = (rnd() * 2 - 1) * CITY.R * 0.8, across = i * G2 + side * hw;
      const x = alongX ? along : across, z = alongX ? across : along;
      const zn = ZA(x, z);
      if (zn !== ZONE.MID && zn !== ZONE.LOW && zn !== ZONE.CBD) continue;
      for (let s = 0; s < 6 && tl.length < streetN; s++) {
        const a2 = along + s * 14, x2 = alongX ? a2 : across, z2 = alongX ? across : a2;
        const m2 = ((a2 % G2) + G2) % G2; if (m2 < 30 || m2 > G2 - 30 || city.bldAt(x2, z2) > 0 || !city.onRoad(alongX ? x2 : i * G2, alongX ? i * G2 : z2)) break; // ряд — только вдоль существующей улицы
        if (rnd() < 0.85) tree(x2, z2, 5 + rnd() * 3);
      }
    }
    // парки и дворы
    let tries = 0;
    while (tl.length < P.trees && tries++ < P.trees * 14) {
      const x = (rnd() * 2 - 1) * (CITY.R + 1500), z = (rnd() * 2 - 1) * (CITY.R + 1500), zn = ZA(x, z);
      const ok = zn === ZONE.PARK || (zn === ZONE.LOW && rnd() < 0.3) || (zn === ZONE.MID && rnd() < 0.15) || (zn === ZONE.FIELD && rnd() < 0.04);
      if (!ok || city.bldAt(x, z) > 0 || city.onRoad(x, z, 4)) continue; // не на дороге и не на обочине
      const gx = Math.abs(x - Math.round(x / G2) * G2), gz = Math.abs(z - Math.round(z / G2) * G2);
      if (zn !== ZONE.PARK && zn !== ZONE.FIELD && (gx < 20 || gz < 20)) continue;
      tree(x, z, 6 + rnd() * 6);
    }
    const tMat = new THREE.MeshPhongMaterial({ vertexColors: true, specular: 0x000000, shininess: 4 });
    // вид дерева (дуб, липа, сосна, куст) — для ближних моделей и импосторов одинаковый
    const rr = mulberry32(city.seed * 13 + 5);
    for (const t of tl) { const r = rr(); t.v = r < 0.35 ? 0 : r < 0.7 ? 1 : r < 0.9 ? 2 : 3; }
    // вблизи — готовые деревья (процедурные там прячутся): вид по случайному, высота — как у процедурного (крона ~1,3 высоты)
    if (G.addNear && P.treeNear) {
      const per = TREES.map(() => []);
      for (const t of tl) { per[t.v].push(t); t.mdl = TREES[t.v][0]; }
      const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), YY = new THREE.Vector3(0, 1, 0), pp = new THREE.Vector3(), ss = new THREE.Vector3();
      TREES.forEach(([slot, name, h], v) => {
        const L = per[v], xz = new Float32Array(L.length * 2), mats = new Float32Array(L.length * 16);
        L.forEach((t, j) => { m4.compose(pp.set(t.x, t.y + 0.3, t.z), qq.setFromAxisAngle(YY, t.ry), ss.setScalar(1.3 * t.sy / h)); m4.toArray(mats, j * 16); xz[j * 2] = t.x; xz[j * 2 + 1] = t.z; });
        G.addNear('t' + slot, slot, name, P.treeNear, xz, mats);
      });
      tMat.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, { uHide: ENV.uHide, uMdl: ENV.uMdl }); sh.vertexShader = HIDE_HEAD + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n' + HIDE_BODY); };
    }
    // вдали — импосторы тех же деревьев (без ?treeimp=0); иначе — прежние простые кроны
    if (!(typeof location !== "undefined" && /[?&]treeimp=0/.test(location.search))) {
      const q = new THREE.PlaneGeometry(1, 1), li = tl.map((t) => ({ ...t, y: t.y + 0.3, sx: 1.3 * t.sy, sy: 1.3 * t.sy, sz: 1.3 * t.sy, kind: t.v })); // масштаб — высота дерева
      G.tiles.push(...tiled(scene, li, q, treeImpMat('city', P.trees >= 14000, hemi, sunL, !!P.perf && P.perf.aa === 'msaa'), { cast: false, receive: false }, 0.6));
    } else G.tiles.push(...tiled(scene, tl, treeGeo(), tMat, { cast: P.shadows && P.treeShadows, receive: false, lo: treeGeoLo(), loD: P.treeLoD || 2600 }, 0.6)); // на сенсорных — простая крона ближе (P.treeLoD)
  }

  if (W.snow) G.snow = makeSnowfall(scene, Math.round((P.particles || 3000) * 2), W); // снегопад (зимняя погода «Снегопад»)
  if (P.clouds > 0 && !W.rain && !(P.skyOnly && W.hdri)) G.clouds = buildClouds(scene, Math.round(P.clouds * (W.deck ? 1.8 : 1)), city.seed, W, P.clouds >= 500, SU);
  // неподвижное — без пересчёта матриц (постройки целей, приходящие позже, — freezeTree при добавлении)
  for (const m of G.tiles) freezeTree(m);
  for (const k of ['objGroup', 'objFar', 'objMesh', 'objBox']) for (const id in G[k] || {}) freezeTree(G[k][id]);
  freezeTree(G.ground);
  return G;
}

// раз в кадр: небо и тень — за камерой, плитки дальше дальности прорисовки скрыты (высокие здания видно дальше)
const SX = new THREE.Vector3(), SY = new THREE.Vector3(), SN = new THREE.Vector3();
const CAM1 = [null], CAM2 = [null, null];
// extra — вторая камера с той же сценой (контейнер): модели вблизи нужны и в её поле зрения
export function updateCityScene(G, camera, P, focus, t, extra) {
  G.sky.position.copy(camera.position); ENV.uCam.value.copy(camera.position); ENV.uHide.value.copy(camera.position); ENV.uTime.value = t || 0;
  if (G.snow) G.snow.update(camera, t || 0, G.renderer ? G.renderer.domElement.height : 720);
  if (G.near) { camera.updateMatrixWorld(); const cs = extra ? CAM2 : CAM1; cs[0] = camera; if (extra) cs[1] = extra; G.near(camera, cs); }
  const cx = camera.position.x, cz = camera.position.z, D = P.draw + TILE;
  for (const m of G.tiles) {
    const u = m.userData, d = Math.hypot(u.cx - cx, u.cz - cz);
    m.visible = d < D * u.drawK * (u.maxH > 120 ? 1.6 : 1);
    if (u.gLo) m.geometry = d < u.loD ? u.gHi : u.gLo;
  }
  if (G.sun.castShadow && focus) {
    // теневая камера двигается шагами ровно в пиксель карты теней — края теней не «кипят» в полёте
    const s = G.sunDir; SY.set(0, 1, 0).sub(SN.copy(s).multiplyScalar(s.y)).normalize(); SX.crossVectors(SY, s).normalize();
    const a = Math.round(focus.dot(SX) / G.shTexel) * G.shTexel, b = Math.round(focus.dot(SY) / G.shTexel) * G.shTexel, c = focus.dot(s);
    SN.copy(SX).multiplyScalar(a).addScaledVector(SY, b).addScaledVector(s, c);
    G.sun.target.position.copy(SN); G.sun.position.copy(SN).addScaledVector(s, 5000);
  }
}
