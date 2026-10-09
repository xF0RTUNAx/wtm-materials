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
import { CITY, ZONE, KIND, AIRPORT, groundH, zoneAt, riverX, mulberry32, lineW } from './city.js?v=20261011b';
import { part, mergeParts, M } from '../drone/models.js?v=20261011b';
import { WEATHERS, ATMO, skyMaterial, FXU } from '../drone/world.js?v=20261011b';
import { MeshoptSimplifier } from './vendor/meshopt_simplifier.module.js?v=20261011b'; // MIT, meshoptimizer 0.21

const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();
const TILE = 3000; // плитка инстансов: 3 км — на 20 % меньше вызовов отрисовки, чем 2 км, при почти тех же треугольниках
const ROOFX = 6, ROOF = 7; // виды только для отрисовки: надстройки на крышах и скатные крыши домов

// ═════════════ Общие uniform'ы ═════════════
export const UPX = { value: 0.0015 }; // размер пикселя на 1 м расстояния (сглаживание линий и окон, переход к среднему цвету)
export const ENV = {
  uCam: { value: new THREE.Vector3() }, uPx: UPX, uSun: { value: new THREE.Vector3(0.4, 0.7, 0.4).normalize() },
  uZen: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uGnd: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() },
  uNight: { value: 0 }, uTime: { value: 0 },
  uMdl: { value: new Array(24).fill(0) }, // радиус, в котором коробки вида дома скрыты (вместо них — модели; 0 — модели нет)
  uHide: { value: new THREE.Vector3() }, // центр этого радиуса: камера (в окне ТВ — точка, куда смотрит контейнер)
};
// ═════════════ Текстуры (ambientCG, CC0): земля, дороги, тротуары, крыши, фасады ═════════════
// грузятся в фоне (fetch + createImageBitmap); пока не пришли все — uTexOn = 0 и шейдеры обходятся без них
export const TEX = { uTexOn: { value: 0 } };
const TEX_FILES = { tGrass: 'grass', tAsph: 'asphalt', tPave: 'paving', tConc: 'concrete', tRoof: 'roof', tOff: 'f_office', tGls: 'f_glass', tBrk: 'f_brick' };
function loadCityTextures(aniso) {
  if (TEX.tGrass) return;
  let left = Object.keys(TEX_FILES).length;
  for (const [u, f] of Object.entries(TEX_FILES)) {
    const t = new THREE.Texture(); t.wrapS = t.wrapT = f === 'asphalt' ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping;
    t.anisotropy = aniso; t.minFilter = THREE.LinearMipmapLinearFilter; TEX[u] = { value: t };
    if (typeof createImageBitmap !== 'function' || typeof fetch !== 'function') continue;
    fetch(new URL(`./tex/${f}.jpg?v=20261011b`, import.meta.url)).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(f))))
      .then((b) => createImageBitmap(b)).then((bmp) => { t.image = bmp; t.needsUpdate = true; if (--left === 0) TEX.uTexOn.value = 1; })
      .catch((e) => console.warn('текстура не загрузилась:', e.message));
  }
}
// яркость текстуры относительно её среднего (детализация поверх своего цвета); картинки — sRGB, без переворота
const GLSL_TEX = `
uniform sampler2D tGrass, tAsph, tPave, tConc, tRoof, tOff, tGls, tBrk; uniform float uTexOn;
float dl(sampler2D t, vec2 uv, float avg) { return clamp(dot(texture2D(t, uv).rgb, vec3(0.3, 0.59, 0.11)) / avg, 0.35, 1.9); }
vec3 srgb(vec3 c) { return c * c; }
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
  [ZONE.PARK]: [0x4b6b35, 0], [ZONE.WATER]: [0x6e6a60, 0], [ZONE.AIR]: [0x7f8c62, 0], [ZONE.PORT]: [0x6c6a66, 0.5] };
function zoneTexture(size) {
  const data = new Uint8Array(size * size * 4), c = new THREE.Color();
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const x = -CITY.HALF + (i + 0.5) * 2 * CITY.HALF / size, z = -CITY.HALF + (j + 0.5) * 2 * CITY.HALF / size;
    const [hex, urb] = ZCOL[zoneAt(x, z)];
    c.set(hex);
    const v = 0.9 + 0.2 * Math.sin(x * 0.0021 + Math.sin(z * 0.0013) * 2) * Math.sin(z * 0.0019 + 0.5); // поля и кварталы — пятнами
    const q = (j * size + i) * 4;
    data[q] = Math.min(255, c.r * 255 * v); data[q + 1] = Math.min(255, c.g * 255 * v); data[q + 2] = Math.min(255, c.b * 255 * v); data[q + 3] = urb * 255;
  }
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
function groundMaterial(tex, ao) {
  const m = new THREE.MeshPhongMaterial({ map: tex, specular: 0x0a0a0a, shininess: 8 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, ENV, TEX, { tAO: { value: ao }, uAir: { value: new THREE.Vector4(AIRPORT.x, AIRPORT.z, AIRPORT.rwyL / 2, AIRPORT.rwyW / 2) } });
    sh.vertexShader = 'varying vec3 vWp;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    const G = CITY.GRID.toFixed(1), AV = CITY.AVE_EVERY.toFixed(1), HA = (CITY.AVENUE / 2).toFixed(1), HS = (CITY.STREET / 2).toFixed(1);
    sh.fragmentShader = 'varying vec3 vWp; uniform sampler2D tAO; uniform vec4 uAir;\n' + GLSL_COMMON + GLSL_TEX + `
// дорога вдоль линии сетки: o — смещение от оси, hw — полуширина, ave — проспект
void roadAt(float p, out float o, out float hw, out float ave) {
  float i = floor(p / ${G} + 0.5); o = p - i * ${G};
  ave = mod(i, ${AV}) < 0.5 ? 1.0 : 0.0; hw = ave > 0.5 ? ${HA} : ${HS};
}
` + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
  float urb = diffuseColor.a; diffuseColor.a = 1.0;
  float dist = length(vWp - uCam), px = max(0.05, dist * uPx), fine = 1.0 - smoothstep(0.4, 2.5, px);
  vec3 col = diffuseColor.rgb;
  // шум в двух масштабах: пятна покрытия, неровный тон
  float n1 = vns(vWp.xz / 23.0), n2 = vns(vWp.xz / 190.0 + 7.0);
  col *= 0.86 + 0.28 * n2;
  col *= mix(1.0, 0.9 + 0.2 * n1, fine);
  // текстуры вблизи: трава / бетон по цвету района, асфальт, плитка; дальше — их среднее (1)
  float tk = 0.0, dG = 1.0, dC = 1.0, dA = 1.0, dP = 1.0;
  if (uTexOn > 0.5) {
    tk = 1.0 - smoothstep(0.12, 1.0, px);
    dG = mix(1.0, dl(tGrass, vWp.xz / 3.0, 0.387), tk); dC = mix(1.0, dl(tConc, vWp.xz / 7.0, 0.364), tk);
    dA = mix(1.0, dl(tAsph, vWp.xz / vec2(3.0, 6.0), 0.27), tk); dP = mix(1.0, dl(tPave, vWp.xz / 2.5, 0.435), tk);
  }
  col *= mix(dC, dG, clamp((col.g - col.b) * 14.0, 0.0, 1.0));
  if (urb > 0.01) {
    // дворы: газоны в жилых кварталах, плитка и парковки в мощёных
    float yard = smoothstep(0.42, 0.62, vns(vWp.xz / 38.0 + 3.0));
    col = mix(col, urb > 0.75 ? vec3(0.07, 0.11, 0.04) * (0.8 + 0.4 * n1) * dG : vec3(0.16, 0.16, 0.15) * dP, yard * 0.75);
    float ox, hwx, avx, oz, hwz, avz;
    roadAt(vWp.x, ox, hwx, avx); roadAt(vWp.z, oz, hwz, avz);
    float ax = abs(ox), az = abs(oz);
    float onX = 1.0 - smoothstep(hwx - px, hwx + px, ax);   // проезжая часть улицы, идущей вдоль z
    float onZ = 1.0 - smoothstep(hwz - px, hwz + px, az);   // … вдоль x
    float road = max(onX, onZ);
    float swX = 1.0 - smoothstep(hwx + 4.5 - px, hwx + 4.5 + px, ax), swZ = 1.0 - smoothstep(hwz + 4.5 - px, hwz + 4.5 + px, az);
    float walk = max(swX, swZ) * (1.0 - road);
    vec3 asph = vec3(0.032, 0.034, 0.038) * (0.85 + 0.3 * n1) * dA;
    col = mix(col, vec3(0.15, 0.15, 0.145) * (0.9 + 0.2 * n1) * dP, walk);    // тротуар
    col = mix(col, asph, road);
    // разметка (пока линия толще ~пикселя)
    float mk = (1.0 - smoothstep(0.25, 0.9, px)) * road;
    float inX = onX * (1.0 - onZ), inZ = onZ * (1.0 - onX);              // не на перекрёстке
    float lane = 0.0;
    // осевая: у проспектов — двойная сплошная и пунктир полос, у улиц — пунктир
    lane += inX * (avx > 0.5 ? step(abs(ax - 0.3), 0.12) + step(abs(ax - 7.5), 0.1) * step(fract(vWp.z / 12.0), 0.4) : step(ax, 0.1) * step(fract(vWp.z / 9.0), 0.5));
    lane += inZ * (avz > 0.5 ? step(abs(az - 0.3), 0.12) + step(abs(az - 7.5), 0.1) * step(fract(vWp.x / 12.0), 0.4) : step(az, 0.1) * step(fract(vWp.x / 9.0), 0.5));
    // «зебры» у перекрёстков
    lane += onX * step(hwz + 0.8, az) * step(az, hwz + 4.0) * step(0.5, fract(vWp.x / 1.1)) * step(ax, hwx - 1.0);
    lane += onZ * step(hwx + 0.8, ax) * step(ax, hwx + 4.0) * step(0.5, fract(vWp.z / 1.1)) * step(az, hwz - 1.0);
    col = mix(col, vec3(0.55), min(lane, 1.0) * mk);
  }
  // ВПП аэропорта: асфальт, осевая, торцевые «клавиши»
  vec2 ra = abs(vWp.xz - uAir.xy);
  float rwy = (1.0 - smoothstep(uAir.z - px, uAir.z + px, ra.x)) * (1.0 - smoothstep(uAir.w - px, uAir.w + px, ra.y));
  float cl = step(ra.y, 0.7) * step(0.5, fract(vWp.x / 50.0)) * step(ra.x, uAir.z - 90.0);
  float keys = step(uAir.z - 60.0, ra.x) * step(ra.x, uAir.z - 10.0) * step(0.5, fract(ra.y / 3.0)) * step(ra.y, uAir.w - 4.0);
  col = mix(col, vec3(0.045, 0.047, 0.05) * dC, rwy);
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
function buildingMaterial() {
  const m = new THREE.MeshPhongMaterial({ specular: 0x8a8a8a, shininess: 90 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, ENV, TEX);
    sh.vertexShader = 'attribute float aKind, aMdl;\nuniform vec3 uCam, uHide; uniform float uMdl[24];\nvarying float vKind; varying vec3 vObj, vSize, vNw, vWp;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
  // вблизи дом нарисован готовой моделью — коробку убираем за экран
  if (aMdl > 0.5 && distance(instanceMatrix[3].xz, uHide.xz) < uMdl[int(aMdl + 0.5)]) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  vWp = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz; vKind = aKind; vObj = position;
  vNw = normalize(mat3(instanceMatrix) * normal);
  vSize = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));`);
    sh.fragmentShader = 'varying float vKind; varying vec3 vObj, vSize, vNw, vWp;\nvec3 bEmis = vec3(0.0); float bSpec = 0.0;\n' + GLSL_COMMON + GLSL_TEX +
      sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  float raised = vKind >= 9.5 ? 1.0 : 0.0;
  float kf = mod(vKind, 10.0), kindF = floor(kf + 0.001), seed = fract(kf) / 0.9;
  int k = int(kindF + 0.5);
  float dist = length(vWp - uCam), px = max(0.02, dist * uPx);
  vec3 base = diffuseColor.rgb;
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
async function loIndex(geo, ratio, err) {
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
// вид (номер = aMdl) → модель и её габариты [X, Y, Z] при масштабе 1 (как печатает tools/airdef-models/prepare.js)
export const BLD = [null, ['bld_p5', 16.24, 16.5, 53.0], ['bld_p9', 24.1, 25.4, 178.6], null,
  ['bld_b12', 17.76, 29.86, 43.19], ['bld_st', 15.44, 17.43, 25.92], ['obj_factory', 97.09, 27.93, 27.23],
  // частные дома (с крышей; модель вписана в участок без растяжения, по одной на участок); офисный корпус
  ['h_brick', 11.39, 7.53, 13.38, 1], ['h_house', 12.01, 7.4, 9.71, 1], ['h_log', 10.23, 5.96, 12.24, 1], ['h_khata', 9.64, 3.86, 13.31, 1], ['o_block', 25.6, 32, 30.7],
  ['h_shanty', 18.39, 14.25, 29.59, 1], ['h_mobile', 7.42, 5.97, 11.74, 1]];
// деревья вблизи (номер в uMdl — 14…17) и их высота при масштабе 1; фонарь
const TREES = [[14, 'tr_oak', 10.36], [15, 'tr_lime', 9.52], [16, 'tr_pine', 12.71], [17, 'tr_bush', 7.12]];
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
  if (k === KIND.PANEL) return L / S < 1.6 ? 0 : h < 20 ? 1 : L > 100 ? 2 : 4; // точечные башни — пока коробками (у скачанной модели упрощение рвёт развёртку)
  if (k === KIND.PLAIN) return S > 15 && h > 11 && h < 20 && L < 70 ? 5 : 0;
  if (k === KIND.WAREHOUSE) return 6;
  if (k === KIND.HOUSE) return HOUSES[Math.floor(B.c[i] * HOUSES.length) % HOUSES.length];
  if (k === KIND.OFFICE) return h > 20 && h < 45 && L / S < 1.5 ? 11 : 0;
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
      mtx.compose(p.set(x, groundH(x, z) - 0.2, z), q, s); mtx.toArray(mats, j * 16);
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
      if (S.slot) ENV.uMdl.value[S.slot] = S.R;
      lx = 1e9;
      // тяжёлая модель (больше 2500 треугольников) — на средней дальности упрощённой копией (~ четверть треугольников)
      let tri = 0; for (const m of S.meshes) tri += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
      if (tri > 2500 && P.bldLo !== false) Promise.all(S.meshes.map((m) => loIndex(m.geometry, 0.25, 0.012))).then((ix) => {
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
      const a = S.im.array, R2 = S.R * S.R, C3 = S.cxyz, al = S.lo ? S.imLo.array : null, R12 = al ? S.R1 * S.R1 : R2; let c = 0, cl = 0;
      const ix0 = Math.floor((p.x - S.R) / GC), ix1 = Math.floor((p.x + S.R) / GC), iz0 = Math.floor((p.z - S.R) / GC), iz1 = Math.floor((p.z + S.R) / GC);
      for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
      const cell = S.grid.get(gkey(ix, iz)); if (!cell) continue;
      for (let q = 0; q < cell.length; q++) {
        const j = cell[q], dx = S.xz[j * 2] - p.x, dz = S.xz[j * 2 + 1] - p.z, d2 = dx * dx + dz * dz;
        if (d2 >= R2) continue;
        const x = C3[j * 3], y = C3[j * 3 + 1], z = C3[j * 3 + 2], r = S.rad[j];
        let vis = false;
        for (let f = 0; f < nf && !vis; f++) { const pl = FR[f].planes; vis = true; for (let k = 0; k < 6; k++) { const q = pl[k]; if (q.normal.x * x + q.normal.y * y + q.normal.z * z + q.constant < -r) { vis = false; break; } } }
        if (!vis) continue;
        if (d2 < R12) { a.set(S.mats.subarray(j * 16, j * 16 + 16), c * 16); c++; } else { al.set(S.mats.subarray(j * 16, j * 16 + 16), cl * 16); cl++; }
      } }
      // на видеочип — только занятая часть буфера (у деревьев весь буфер — сотни КБ, а видно десятки)
      if (c || S.c0) { S.im.updateRange.count = Math.max(c, 1) * 16; S.im.needsUpdate = true; } S.c0 = c;
      for (const m of S.meshes) { m.count = c; m.visible = c > 0; } // пустые — без вызова отрисовки
      if (al) { if (cl || S.cl0) { S.imLo.updateRange.count = Math.max(cl, 1) * 16; S.imLo.needsUpdate = true; } S.cl0 = cl; for (const m of S.lo) { m.count = cl; m.visible = cl > 0; } }
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
      if (S.slot) U[S.slot] = R;
    }
    const h0 = ENV.uHide.value.clone(); ENV.uHide.value.copy(at);
    return () => {
      for (let i = 0; i < keep.length; i += 3) { const m = keep[i], S = sets.get(m.userData.set); m.instanceMatrix = m.userData.lo ? S.imLo : S.im; m.count = keep[i + 1]; m.visible = keep[i + 2]; }
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
  const sets = {}; const put = (name, x, z, rot, s = 1, y = groundH(x, z)) => { (sets[name] = sets[name] || []).push(x, z, ...m4.compose(p.set(x, y, z), q.setFromAxisAngle(Y, rot), sc.setScalar(s)).elements); };
  const wire = [], seg = (A, Bp) => { const d = b3.copy(Bp).sub(A), L = d.length(); q.setFromUnitVectors(X, d.normalize()); wire.push((A.x + Bp.x) / 2, (A.z + Bp.z) / 2, ...m4.compose(p.copy(A).add(Bp).multiplyScalar(0.5), q, sc.set(L, 1, 1)).elements); };
  // точка крепления провода k у столба: столб (x, z), поворот rot (консоль +Z модели)
  const att = (x, z, rot, k, out) => out.set(x + Math.sin(rot) * WIRE_AT[k], groundH(x, z) + WIRE_Y, z + Math.cos(rot) * WIRE_AT[k]);
  // линия столбов вдоль оси: проспекты — фонари с обеих сторон, улицы частного сектора — ЛЭП с одной стороны
  const line = (alongX, c, side, step, okZone, withBins) => {
    let prev = null;
    for (let a = -CITY.R; a <= CITY.R; a += step) {
      const m = ((a % GR) + GR) % GR, x = alongX ? a : c, z = alongX ? c : a;
      const ok = m >= 30 && m <= GR - 30 && okZone(zoneAt(x, z)) && city.bldAt(x, z) <= 0;
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
    const cx = i * GR, cz = j * GR, zn = zoneAt(cx, cz); if (zn !== ZONE.MID && zn !== ZONE.CBD) continue;
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
  const add = (name, arr, Rk) => { const n = arr.length / 18, xz = new Float32Array(n * 2), mats = new Float32Array(n * 16); for (let k = 0; k < n; k++) { xz[k * 2] = arr[k * 18]; xz[k * 2 + 1] = arr[k * 18 + 1]; mats.set(arr.slice(k * 18 + 2, k * 18 + 18), k * 16); } G.addNear(name, 0, name, R * Rk, xz, mats); };
  for (const [name, arr] of Object.entries(sets)) add(name, arr, name === 'p_lamp' ? 0.6 : 0.33);
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
function puffTex() {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d'), r = mulberry32(99);
  for (let i = 0; i < 46; i++) {
    const a = r() * Math.PI * 2, d = Math.pow(r(), 0.7) * S * 0.2, cx = S / 2 + Math.cos(a) * d, cy = S / 2 + Math.sin(a) * d * 0.8, rad = S * (0.1 + r() * 0.12);
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad); g.addColorStop(0, 'rgba(255,255,255,.26)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, rad, 0, 7); x.fill();
  }
  return new THREE.CanvasTexture(c);
}
function buildClouds(scene, count, seed, W) {
  const rnd = mulberry32(seed * 31 + 7), pos = [], cor = [], dat = [];
  let made = 0;
  const thick = W.deck ? 1.6 : 1;
  while (made < count) {
    const cx = (rnd() * 2 - 1) * 24000, cz = (rnd() * 2 - 1) * 24000, cy = 2300 + rnd() * 900, k = 8 + Math.floor(rnd() * 10), R = 500 + rnd() * 900;
    for (let i = 0; i < k && made < count; i++, made++) {
      const x = cx + (rnd() - 0.5) * R * 2, z = cz + (rnd() - 0.5) * R * 2, y = cy + (rnd() - 0.3) * 220 * thick, s = (700 + rnd() * 900) * thick;
      const rot = rnd(); // поворот — один на всю «пуховку», иначе четырёхугольник перекручивается
      for (const [u, v] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) { pos.push(x, y, z); cor.push(u, v); dat.push(s, rot); }
    }
  }
  const idx = []; for (let i = 0; i < made; i++) idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('corner', new THREE.Float32BufferAttribute(cor, 2)); g.setAttribute('dat', new THREE.Float32BufferAttribute(dat, 2));
  g.setIndex(idx); g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 60000);
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...ENV, ...FXU, tex: { value: puffTex() }, lit: { value: lin(W.cloudLit) }, dark: { value: lin(W.cloudDark) }, fogC: { value: lin(W.fog) }, fogD: { value: W.fogD } },
    vertexShader: `attribute vec2 corner, dat; varying vec2 vUv; varying float vShade, vFade, vFog;
      uniform vec3 uCam, uSun; uniform float fogD;
      void main() {
        vec3 R = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), U = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        float a = dat.y * 6.283, c = cos(a), s = sin(a); vec2 cr = vec2(c * corner.x - s * corner.y, s * corner.x + c * corner.y);
        vec3 p = position + (R * cr.x + U * cr.y) * dat.x;
        vUv = corner + 0.5; vShade = 0.45 + 0.55 * (corner.y + 0.5) * (0.6 + 0.4 * max(uSun.y, 0.0));
        float d = length(position - uCam); vFade = smoothstep(dat.x * 0.4, dat.x * 1.4, d); vFog = 1.0 - exp(-pow(d * fogD * 0.55, 2.0));
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    // в проходе половинного разрешения (post.js, fxOn) глубины нет — облако гасится само там, где оно за домом или самолётом
    fragmentShader: `uniform sampler2D tex, tDepth; uniform vec3 lit, dark, fogC, uSunCol; uniform float fxOn; uniform vec2 fxSize, camNF; varying vec2 vUv; varying float vShade, vFade, vFog;
      float fxLinZ(float d) { float z = d * 2.0 - 1.0; return 2.0 * camNF.x * camNF.y / (camNF.y + camNF.x - z * (camNF.y - camNF.x)); }
      void main() { vec4 t = texture2D(tex, vUv); float a = t.a * 2.4 * vFade * smoothstep(0.5, 0.3, length(vUv - 0.5)); if (a < 0.01) discard;
        if (fxOn > 0.5) { a *= clamp((fxLinZ(texture2D(tDepth, gl_FragCoord.xy / fxSize).r) - fxLinZ(gl_FragCoord.z)) / 120.0, 0.0, 1.0); if (a < 0.01) discard; }
        vec3 c = mix(dark, lit, vShade) * (0.85 + 0.25 * uSunCol); c = mix(c, fogC, vFog);
        gl_FragColor = vec4(c, min(a, 1.0) * (1.0 - vFog * 0.5));
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }`,
    transparent: true, depthWrite: false, fog: false,
  });
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = 2; scene.add(mesh);
  return mesh;
}

// ═════════════ Сборка сцены ═════════════
export function buildCityScene(scene, city, P, renderer, weatherKey = 'day') {
  const W = WEATHERS[weatherKey] || WEATHERS.day;
  const G = { tiles: [], W };
  if (P.roofDetail) loadCityTextures(renderer ? Math.min(P.aniso || 4, renderer.capabilities.getMaxAnisotropy()) : 1); // на «Низком» — без текстур
  else for (const u of Object.keys(TEX_FILES)) if (!TEX[u]) TEX[u] = { value: null };
  // солнце и атмосфера по погоде (как setWeather в «Летке»)
  const e = W.el * Math.PI / 180, a = W.az * Math.PI / 180;
  const sunDir = new THREE.Vector3(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a));
  ENV.uSun.value.copy(sunDir); ENV.uZen.value.copy(lin(W.zenith)); ENV.uHor.value.copy(lin(W.horizon)); ENV.uGnd.value.copy(lin(W.fog)).multiplyScalar(0.25);
  ENV.uSunCol.value.copy(lin(W.sun)).multiplyScalar(W.sunVis ? 1 : 0.15); ENV.uNight.value = W.night || 0;
  const SU = { sunDir: { value: sunDir }, zenith: { value: lin(W.zenith) }, horizon: { value: lin(W.horizon) }, ground: { value: lin(W.fog).multiplyScalar(0.75) },
    glow: { value: lin(W.glow).multiplyScalar(W.glowK || 0) }, haze: { value: lin(W.haze) }, sunCol: { value: lin(W.sun).lerp(new THREE.Color(1, 0.95, 0.85), W.el < 20 ? 0.25 : 0.5) },
    hazeK: { value: W.hazeK }, halo: { value: W.halo }, discK: { value: W.disc }, flash: { value: 0 } };
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
  const seg = P.groundSeg;
  const gg = new THREE.PlaneGeometry(2 * CITY.HALF, 2 * CITY.HALF, seg, seg); gg.rotateX(-Math.PI / 2);
  const pa = gg.attributes.position, uv = gg.attributes.uv;
  for (let i = 0; i < pa.count; i++) {
    pa.setY(i, groundH(pa.getX(i), pa.getZ(i)));
    uv.setXY(i, (pa.getX(i) + CITY.HALF) / (2 * CITY.HALF), (pa.getZ(i) + CITY.HALF) / (2 * CITY.HALF));
  }
  gg.computeVertexNormals();
  const zt = zoneTexture(P.zoneTex || 1024); zt.flipY = false;
  if (renderer) zt.anisotropy = Math.min(P.aniso || 4, renderer.capabilities.getMaxAnisotropy());
  const ground = new THREE.Mesh(gg, groundMaterial(zt, aoTexture(city)));
  ground.receiveShadow = !!P.shadows; scene.add(ground); G.ground = ground;

  // река: тёмная вода, волны, отражение неба, блик солнца
  const wm = new THREE.MeshPhongMaterial({ color: lin(0x1a2e3a), specular: lin(W.sun).multiplyScalar(W.sunVis ? 1.2 : 0.2), shininess: 260 });
  wm.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, ENV);
    s.vertexShader = 'varying vec3 vWp;\n' + s.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = 'varying vec3 vWp;\nvec3 wEmis = vec3(0.0);\n' + GLSL_COMMON + s.fragmentShader
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
  float t = uTime; vec2 q = vWp.xz;
  vec2 gw = vec2(cos(q.x * 0.11 + t * 1.3) + 0.6 * cos(q.x * 0.27 + q.y * 0.19 + t * 1.9), sin(q.y * 0.13 + t * 1.1) + 0.6 * sin(q.y * 0.31 - q.x * 0.17 + t * 2.3));
  gw += (vec2(vns(q * 0.35 + t * 0.4), vns(q.yx * 0.35 - t * 0.4)) - 0.5) * 1.6;
  vec3 nW = normalize(vec3(gw.x * 0.05, 1.0, gw.y * 0.05));
  normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
  vec3 Vw = normalize(uCam - vWp), Rf = reflect(-Vw, nW);
  float fres = 0.03 + 0.97 * pow(1.0 - max(dot(nW, Vw), 0.0), 5.0);
  wEmis = skyAt(Rf) * fres * 0.9;`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += wEmis;');
  };
  // вода — только полосой вдоль реки: сплошная плоскость в 4–10 м под землёй «мерцала» с большой высоты (не хватало точности глубины)
  const wv = [], wi = [], half = CITY.RIVER_W / 2 + 45;
  for (let z = -CITY.HALF, i = 0; z <= CITY.HALF; z += 60, i++) {
    const x = riverX(z); wv.push(x - half, 0, z, x + half, 0, z);
    if (i) wi.push((i - 1) * 2, i * 2, (i - 1) * 2 + 1, (i - 1) * 2 + 1, i * 2, i * 2 + 1);
  }
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wv, 3)); wg.setIndex(wi); wg.computeVertexNormals();
  const water = new THREE.Mesh(wg, wm);
  water.position.y = CITY.WATER_Y; water.receiveShadow = !!P.shadows; scene.add(water);

  // здания, надстройки и скатные крыши
  const B = city.B, list = [], small = [], roofs = [], extras = [], col = new THREE.Color(), near = BLD.map(() => []);
  const pick = (kind, c) => { const pal = PAL[kind]; return col.set(pal[Math.floor(c * pal.length) % pal.length]).convertSRGBToLinear().multiplyScalar(0.62 + 0.2 * ((c * 7.31) % 1)).clone(); };
  for (let i = 0; i < B.n; i++) {
    const k = B.k[i], c = B.c[i], y0 = B.y0[i], gy = groundH(B.x[i], B.z[i]);
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
  const bMat = buildingMaterial();
  G.tiles.push(...tiled(scene, list, boxGeo(), bMat, sh));
  // частные дома (их больше половины) вдали — в пиксель-два, только рябят: дальность как у их крыш
  if (small.length) G.tiles.push(...tiled(scene, small, boxGeo(), bMat, sh, 0.55));
  nearHouses(G, scene, B, near, P, sh);
  if (G.addNear && P.props !== false) streetProps(G, city, B, P); // «Детали улиц» можно выключить (тонкая настройка)
  if (roofs.length) G.tiles.push(...tiled(scene, roofs, roofGeo(), bMat, sh, 0.55));
  if (extras.length) G.tiles.push(...tiled(scene, extras, boxGeo(), bMat, { cast: false, receive: P.shadows }, 0.45));

  // объекты-цели
  // объекты-цели — каждый своей сеткой (разрушенный объект оседает и чернеет)
  const OCOL = { tv: 0x9a9c94, gov: 0x8f9384, tpp: 0x7d8270, oil: 0xc9c6b8, stad: 0x6f7563, air: 0xa6a99c, bridge: 0x8f8d88, port: 0xd08a2c }; // военные объекты — защитные и бетонные тона
  const objMat = new THREE.MeshPhongMaterial({ vertexColors: true, side: THREE.DoubleSide, specular: 0x222222, shininess: 20 });
  G.objMesh = {}; G.objMat = objMat; G.ruinMat = new THREE.MeshPhongMaterial({ color: 0x1c1a18, specular: 0x050505, shininess: 4, side: THREE.DoubleSide });
  G.objBox = {}; G.objGroup = {};
  for (const o of city.objects) {
  const parts = [], boxes = [];
  for (const p of o.parts) {
    // коробки готовых построек — временная заглушка, пока не загрузилась модель
    if (p.model) { const gy = groundH(p.x, p.z) - 1; boxes.push(part(new THREE.BoxGeometry(p.w, p.h + 1, p.d), OCOL[o.key] || 0xbbbbbb, M(p.x, gy + (p.h + 1) / 2, p.z))); continue; }
    const y0 = (p.y0 !== undefined ? p.y0 : groundH(p.x, p.z) - 1), color = OCOL[o.key] || 0xbbbbbb, hh = p.h + (p.y0 !== undefined ? 0 : 1);
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
  if (o.models) { const g = new THREE.Group(); g.userData.left = new Set(o.models.map((q) => q.m)); scene.add(g); G.objGroup[o.id] = g; }
  }
  // модель постройки загрузилась: копии во все места, где она стоит; все модели объекта на месте — заглушка прячется
  G.attachObjModel = (name, make) => {
    for (const o of city.objects) {
      const g = G.objGroup[o.id]; if (!g || !g.userData.left.has(name)) continue;
      for (const q of o.models) if (q.m === name) {
        const m = make(); m.position.set(q.x, groundH(q.x, q.z), q.z); m.rotation.y = q.rot * Math.PI / 2; m.scale.setScalar(q.s);
        m.traverse((c) => { if (c.isMesh) { c.castShadow = !!P.shadows; c.receiveShadow = !!P.shadows; } }); g.add(m);
      }
      g.userData.left.delete(name);
      if (!g.userData.left.size && G.objBox[o.id]) G.objBox[o.id].visible = false;
    }
  };

  // деревья: вдоль улиц, в парках и во дворах
  if (P.trees > 0) {
    const rnd = mulberry32(city.seed * 7 + 3), tl = [], tc = new THREE.Color();
    const tree = (x, z, s) => {
      tc.setHSL(0.2 + rnd() * 0.09, 0.38 + rnd() * 0.22, 0.17 + rnd() * 0.1).convertSRGBToLinear();
      tl.push({ x, z, y: groundH(x, z) - 0.3, sx: s, sy: s * (1.1 + rnd() * 0.5), sz: s, color: tc.clone(), ry: rnd() * 6 });
    };
    // вдоль улиц жилых районов: ряд у тротуара, шаг ~14 м, с пропусками
    const G2 = CITY.GRID, streetN = Math.floor(P.trees * 0.45);
    for (let t = 0; t < streetN * 3 && tl.length < streetN; t++) {
      const alongX = rnd() < 0.5, i = Math.round((rnd() * 2 - 1) * CITY.R * 0.8 / G2), side = rnd() < 0.5 ? -1 : 1;
      const hw = (((i % 5) + 5) % 5 === 0 ? CITY.AVENUE : CITY.STREET) / 2 + 2.5;
      const along = (rnd() * 2 - 1) * CITY.R * 0.8, across = i * G2 + side * hw;
      const x = alongX ? along : across, z = alongX ? across : along;
      const zn = zoneAt(x, z);
      if (zn !== ZONE.MID && zn !== ZONE.LOW && zn !== ZONE.CBD) continue;
      for (let s = 0; s < 6 && tl.length < streetN; s++) {
        const a2 = along + s * 14, x2 = alongX ? a2 : across, z2 = alongX ? across : a2;
        const m2 = ((a2 % G2) + G2) % G2; if (m2 < 30 || m2 > G2 - 30 || city.bldAt(x2, z2) > 0) break;
        if (rnd() < 0.85) tree(x2, z2, 5 + rnd() * 3);
      }
    }
    // парки и дворы
    let tries = 0;
    while (tl.length < P.trees && tries++ < P.trees * 14) {
      const x = (rnd() * 2 - 1) * (CITY.R + 1500), z = (rnd() * 2 - 1) * (CITY.R + 1500), zn = zoneAt(x, z);
      const ok = zn === ZONE.PARK || (zn === ZONE.LOW && rnd() < 0.3) || (zn === ZONE.MID && rnd() < 0.15) || (zn === ZONE.FIELD && rnd() < 0.04);
      if (!ok || city.bldAt(x, z) > 0) continue;
      const gx = Math.abs(x - Math.round(x / G2) * G2), gz = Math.abs(z - Math.round(z / G2) * G2);
      if (zn !== ZONE.PARK && zn !== ZONE.FIELD && (gx < 20 || gz < 20)) continue;
      tree(x, z, 6 + rnd() * 6);
    }
    const tMat = new THREE.MeshPhongMaterial({ vertexColors: true, specular: 0x000000, shininess: 4 });
    // вблизи — готовые деревья (процедурные там прячутся): вид по случайному, высота — как у процедурного (крона ~1,3 высоты)
    if (G.addNear && P.treeNear) {
      const per = TREES.map(() => []), rr = mulberry32(city.seed * 13 + 5);
      for (const t of tl) { const r = rr(), v = r < 0.35 ? 0 : r < 0.7 ? 1 : r < 0.9 ? 2 : 3; per[v].push(t); t.mdl = TREES[v][0]; }
      const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), YY = new THREE.Vector3(0, 1, 0), pp = new THREE.Vector3(), ss = new THREE.Vector3();
      TREES.forEach(([slot, name, h], v) => {
        const L = per[v], xz = new Float32Array(L.length * 2), mats = new Float32Array(L.length * 16);
        L.forEach((t, j) => { m4.compose(pp.set(t.x, t.y + 0.3, t.z), qq.setFromAxisAngle(YY, t.ry), ss.setScalar(1.3 * t.sy / h)); m4.toArray(mats, j * 16); xz[j * 2] = t.x; xz[j * 2 + 1] = t.z; });
        G.addNear('t' + slot, slot, name, P.treeNear, xz, mats);
      });
      tMat.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, { uHide: ENV.uHide, uMdl: ENV.uMdl }); sh.vertexShader = HIDE_HEAD + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n' + HIDE_BODY); };
    }
    G.tiles.push(...tiled(scene, tl, treeGeo(), tMat, { cast: P.shadows && P.treeShadows, receive: false, lo: treeGeoLo(), loD: P.treeLoD || 2600 }, 0.6)); // на сенсорных — простая крона ближе (P.treeLoD)
  }

  if (P.clouds > 0 && !W.rain) G.clouds = buildClouds(scene, Math.round(P.clouds * (W.deck ? 1.8 : 1)), city.seed, W);
  return G;
}

// раз в кадр: небо и тень — за камерой, плитки дальше дальности прорисовки скрыты (высокие здания видно дальше)
const SX = new THREE.Vector3(), SY = new THREE.Vector3(), SN = new THREE.Vector3();
const CAM1 = [null], CAM2 = [null, null];
// extra — вторая камера с той же сценой (контейнер): модели вблизи нужны и в её поле зрения
export function updateCityScene(G, camera, P, focus, t, extra) {
  G.sky.position.copy(camera.position); ENV.uCam.value.copy(camera.position); ENV.uHide.value.copy(camera.position); ENV.uTime.value = t || 0;
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
