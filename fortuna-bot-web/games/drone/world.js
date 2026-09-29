// Мир «Симулятора Летки»: рельеф ~34×34 км (горный хребет по краю арены), река, города, аэродром, лес, облака, небо, погода.
// Цвет — линейный конвейер: все «авторские» цвета задаются в sRGB и переводятся в линейное пространство (lin()),
// освещение считается физически, на выходе — тонмаппинг ACES и гамма (renderer или post.js).
// Детализация задаётся пресетом графики (см. PRESETS в main.js), атмосфера — погодой (WEATHERS).
// Шум для деталей земли, микрорельефа и облачного слоя — из одной текстуры (выборка вместо десятков sin() на пиксель).
/* global THREE */
import { mulberry32 } from './schedule.js?v=20260929c';
import { M, part, mergeParts } from './models.js?v=20260929c';
import { buildProps } from './props.js?v=20260929c';

import { WORLD, TOWNS, AIRFIELD, terrainH, airfieldH, buildChunkArrays } from './terrain-core.js?v=20260929c';
export { WORLD, TOWNS, AIRFIELD, terrainH, airfieldH };
export const SUN_DIR = new THREE.Vector3(0.42, 0.6, 0.38).normalize(); // меняется погодой (на месте — все ссылки видят новое)
export const FOG_D = 0.000042;
export const CLOUD_H = 2600;
export const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();
export const FOG_LIN = lin(0xc6d8e8);            // цвет тумана (общий объект: погода меняет его на месте)
export const FOG_U = { value: FOG_D };           // плотность тумана — общий uniform для частиц и облаков
// «Облака и дым в пониженном разрешении»: облака, облачный слой и дым переносятся на слой FX_LAYER и рисуются
// конвейером (post.js) в половине разрешения. Глубины там нет — сравниваем с глубиной кадра сами и мягко гасим на стыке.
export const FX_LAYER = 4, FX_ADD_LAYER = 5; // 5 — огонь и вспышки: рисуются после наложения дыма
export const FXU = { tDepth: { value: null }, fxOn: { value: 0 }, fxSize: { value: new THREE.Vector2(1, 1) }, camNF: { value: new THREE.Vector2(3, 60000) } };
const SOFT_GLSL = `uniform sampler2D tDepth; uniform float fxOn; uniform vec2 fxSize, camNF;
  float fxLinZ(float d) { float z = d * 2.0 - 1.0; return 2.0 * camNF.x * camNF.y / (camNF.y + camNF.x - z * (camNF.y - camNF.x)); }
  float fxSoft(float range) { if (fxOn < 0.5) return 1.0; float sz = texture2D(tDepth, gl_FragCoord.xy / fxSize).r;
    return clamp((fxLinZ(sz) - fxLinZ(gl_FragCoord.z)) / range, 0.0, 1.0); }`;

// ═════════════ Воздушная перспектива для всех стандартных материалов ═════════════
// Вместо плоского тумана: плотность падает с высотой (интеграл exp(−y/H) вдоль луча — внизу долины дымка гуще,
// с высоты дали чище), а в сторону солнца дымка подсвечивается его цветом. Подменяем куски шейдеров three.js
// до первой компиляции; значения — «простые» объекты, чтобы при клонировании uniform'ов оставалась общая ссылка.
export const ATMO = { sunDir: { x: 0.5, y: 0.7, z: 0.5 }, sunCol: { x: 1, y: 0.9, z: 0.75 }, p: { x: 1800, y: 0.5, z: 700 } };
(function patchFog() {
  for (const k in THREE.ShaderLib) {
    const u = THREE.ShaderLib[k].uniforms;
    if (u && u.fogColor) { u.atmoSunDir = { value: ATMO.sunDir }; u.atmoSunCol = { value: ATMO.sunCol }; u.atmoP = { value: ATMO.p }; }
  }
  THREE.ShaderChunk.fog_pars_vertex = '#ifdef USE_FOG\n  varying vec3 vFogW;\n#endif';
  THREE.ShaderChunk.fog_vertex = '#ifdef USE_FOG\n  vFogW = vec3(dot(viewMatrix[0].xyz, mvPosition.xyz), dot(viewMatrix[1].xyz, mvPosition.xyz), dot(viewMatrix[2].xyz, mvPosition.xyz));\n#endif';
  THREE.ShaderChunk.fog_pars_fragment = `#ifdef USE_FOG
  uniform vec3 fogColor, atmoSunDir, atmoSunCol, atmoP; varying vec3 vFogW;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear; uniform float fogFar;
  #endif
#endif`;
  THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
  float fDist = length(vFogW);
  #ifdef FOG_EXP2
    float fH = atmoP.x, fy0 = cameraPosition.y, fdy = vFogW.y;
    float fk = abs(fdy) > 1.0 ? (exp(-fy0 / fH) - exp(-(fy0 + fdy) / fH)) * fH / fdy : exp(-fy0 / fH);
    fk = min(fk * exp(atmoP.z / fH), 2.2);
    float fogFactor = 1.0 - exp(-fogDensity * fogDensity * fDist * fDist * fk);
  #else
    float fogFactor = smoothstep(fogNear, fogFar, fDist);
  #endif
  float fSun = pow(max(dot(vFogW / max(fDist, 1.0), atmoSunDir), 0.0), 6.0) * atmoP.y;
  gl_FragColor.rgb = mix(gl_FragColor.rgb, mix(fogColor, atmoSunCol, fSun), fogFactor);
#endif`;
})();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const UP_V = new THREE.Vector3(0, 1, 0);
const smooth01 = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ═════════════ Погода ═════════════
// el/az — высота и азимут солнца, °; sunI/hemiI — множители света; zenith/horizon — небо; glow — зарево у горизонта
// со стороны солнца; haze — дымка вокруг солнца; disc — яркость диска; fogD — плотность тумана; clouds — порог
// «поля облачности» (меньше — больше облаков); deck — сплошной слой облаков (пасмурно/дождь); cirrus — высокие
// перистые облака (только топовые пресеты); night — сколько окон горит; wet — мокрая земля; rain — ливень;
// drift — смещение солнца за вылет, °. w — вес при случайном выборе.
export const WEATHERS = {
  day: { name: 'Ясный день', w: 30, el: 46.6, az: 47.9, sun: 0xfff0d8, sunI: 1, sky: 0xd6e8ff, gnd: 0x6d7560, hemiI: 1,
    zenith: 0x2d63b4, horizon: 0xcadcec, glow: 0x000000, haze: 0xffdbad, hazeK: 0.22, halo: 0.9, disc: 40, fog: 0xc6d8e8, fogD: 0.000042,
    clouds: 0.6, cloudLit: 0xfffaf2, cloudDark: 0x9aa6b8, cirrus: { h: 8800, cover: 0.58, dens: 0.4, lit: 0xffffff, dark: 0xd4dce8 },
    night: 0, water: 0x2c6d8c, exposure: 1, shadows: true, sunVis: 1 },
  morning: { name: 'Утро', w: 14, el: 15, az: 100, drift: 3, sun: 0xffd9b0, sunI: 0.85, sky: 0xc8d8f0, gnd: 0x6a7060, hemiI: 0.95,
    zenith: 0x4274c4, horizon: 0xf0dcc8, glow: 0xffc49a, glowK: 0.25, haze: 0xffd2a8, hazeK: 0.35, halo: 1, disc: 34, fog: 0xdde2e6, fogD: 0.00006,
    clouds: 0.64, cloudLit: 0xfff0e0, cloudDark: 0xa0a8b8, cirrus: { h: 8800, cover: 0.6, dens: 0.35, lit: 0xfff0e4, dark: 0xd8d4d8 },
    night: 0.08, water: 0x3a7890, exposure: 1.08, shadows: true, sunVis: 1 },
  evening: { name: 'Вечер', w: 15, el: 13, az: 235, drift: -2.5, sun: 0xffc080, sunI: 0.8, sky: 0xaab8d8, gnd: 0x5a5448, hemiI: 0.85,
    zenith: 0x33589a, horizon: 0xf2c69a, glow: 0xffa860, glowK: 0.45, haze: 0xffb070, hazeK: 0.4, halo: 1, disc: 32, fog: 0xd6c0a6, fogD: 0.000045,
    clouds: 0.6, cloudLit: 0xffe0bc, cloudDark: 0x8a8ea8, cirrus: { h: 8800, cover: 0.56, dens: 0.45, lit: 0xffd0b0, dark: 0xb8aab8 },
    night: 0.3, water: 0x305e7c, exposure: 1.12, shadows: true, sunVis: 1 },
  sunset: { name: 'Закат', w: 15, el: 5.5, az: 250, drift: -3, sun: 0xff8a3a, sunI: 0.55, sky: 0x7a86b0, gnd: 0x4a3c34, hemiI: 0.75,
    zenith: 0x2a3a6e, horizon: 0xf0a868, glow: 0xff7a3a, glowK: 0.9, haze: 0xff9a50, hazeK: 0.6, halo: 1.2, disc: 25, fog: 0xc89a80, fogD: 0.00005,
    clouds: 0.58, cloudLit: 0xffb07a, cloudDark: 0x6a6a8a, cirrus: { h: 8800, cover: 0.53, dens: 0.55, lit: 0xff9a7a, dark: 0x8a7a9a },
    night: 0.6, water: 0x2a4a66, exposure: 1.25, shadows: true, sunVis: 1 },
  overcast: { name: 'Пасмурно', w: 13, el: 45, az: 60, sun: 0xdfe6ee, sunI: 0.25, sky: 0xb4bcc6, gnd: 0x5a5e58, hemiI: 1.0,
    zenith: 0x7c8896, horizon: 0xb4bcc4, glow: 0x000000, haze: 0xffffff, hazeK: 0.05, halo: 0.1, disc: 0, fog: 0xa8b0b8, fogD: 0.00006,
    clouds: 0.5, cloudLit: 0xc8cdd2, cloudDark: 0x7a828c, deck: { h: 3400, cover: 0.3, dens: 0.97, lit: 0xeef1f4, dark: 0x8a929c },
    night: 0.15, water: 0x3c5a68, exposure: 1.05, shadows: false, sunVis: 0, desat: 0.35 },
  rain: { name: 'Ливень', w: 13, el: 45, az: 60, sun: 0xc8d0da, sunI: 0.12, sky: 0x8a949e, gnd: 0x40463f, hemiI: 0.95,
    zenith: 0x4e5864, horizon: 0x78828c, glow: 0x000000, haze: 0xffffff, hazeK: 0.03, halo: 0, disc: 0, fog: 0x747e88, fogD: 0.00009,
    clouds: 0.46, cloudLit: 0x868e98, cloudDark: 0x4c545e, deck: { h: 2700, cover: 0.18, dens: 1, lit: 0xc8ced4, dark: 0x5c646e },
    night: 0.4, water: 0x34464e, exposure: 1.08, shadows: false, sunVis: 0, rain: 1, wet: 1, lightning: true, desat: 0.45 },
};
export function pickWeather(r = Math.random) {
  const list = Object.entries(WEATHERS), tot = list.reduce((s, [, w]) => s + w.w, 0);
  let x = r() * tot;
  for (const [k, w] of list) { x -= w.w; if (x <= 0) return k; }
  return 'day';
}
function setSunDir(el, az) { const e = el * Math.PI / 180, a = az * Math.PI / 180; SUN_DIR.set(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)); }

// Высота земли, города и аэродром — в terrain-core.js (общие с фоновым потоком)


// ── «поле облачности»: где стоят облака (JS) и где на земле их тени (текстура из той же функции) ──
const fract = (v) => v - Math.floor(v);
function hsh(x, y) { return fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453); }
function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y); let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hsh(ix, iy), b = hsh(ix + 1, iy), c = hsh(ix, iy + 1), d = hsh(ix + 1, iy + 1);
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
}
export function cloudField(x, z) { return vnoise(x * 0.00032, z * 0.00032) * 0.65 + vnoise(x * 0.0009 + 5.2, z * 0.0009 + 1.3) * 0.35; }
const CLOUD_SPAN = 36000; // текстура теней облаков покрывает ±18 км

// Бесшовная текстура шума 256² (32 ячейки на плитку, мип-уровни): R, G — два независимых слоя value-noise,
// B, A — производные R по x и z (для микрорельефа без лишних выборок). Одна на все миры.
let NOISE_TEX = null;
function noiseTex() {
  if (NOISE_TEX) return NOISE_TEX;
  const S = 256, C = 32, cs = S / C;
  const lat = (seed) => { const r = mulberry32(seed), a = new Float32Array(C * C); for (let i = 0; i < a.length; i++) a[i] = r(); return a; };
  const A = lat(11), B = lat(23), data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / cs, v = y / cs, ix = Math.floor(u), iy = Math.floor(v), fx = u - ix, fy = v - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), dsx = 6 * fx * (1 - fx), dsy = 6 * fy * (1 - fy);
    const i00 = (iy % C) * C + (ix % C), i10 = (iy % C) * C + ((ix + 1) % C), i01 = ((iy + 1) % C) * C + (ix % C), i11 = ((iy + 1) % C) * C + ((ix + 1) % C);
    const val = (L) => { const a = L[i00], b = L[i10], c = L[i01], d = L[i11], k = a - b - c + d; return [a + (b - a) * sx + (c - a) * sy + k * sx * sy, dsx * ((b - a) + k * sy), dsy * ((c - a) + k * sx)]; };
    const [va, dx, dz] = val(A), [vb] = val(B), o = (y * S + x) * 4;
    data[o] = va * 255; data[o + 1] = vb * 255; data[o + 2] = clamp(128 + dx * 40, 0, 255); data[o + 3] = clamp(128 + dz * 40, 0, 255);
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.needsUpdate = true; NOISE_TEX = t; return t;
}
// Тени облаков: smoothstep(поле облачности) на сетке 256² — одна выборка на пиксель земли вместо восьми хешей
function cloudShadowData(th, tex) {
  const S = 256, data = tex ? tex.image.data : new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const f = cloudField((x / (S - 1) - 0.5) * CLOUD_SPAN, (y / (S - 1) - 0.5) * CLOUD_SPAN), o = (y * S + x) * 4;
    data[o] = smooth01(th + 0.02, th + 0.1, f) * 255; data[o + 3] = 255;
  }
  if (tex) { tex.needsUpdate = true; return tex; }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat); t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true; return t;
}

export function radialTex(stops, size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d');
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) g.addColorStop(o, col);
  x.fillStyle = g; x.fillRect(0, 0, size, size); return new THREE.CanvasTexture(c);
}
// «пушистая» текстура облака: много мягких кругов с шумом
function puffTex() {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d'); const r = mulberry32(99);
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2, d = Math.pow(r(), 0.7) * S * 0.3, cx = S / 2 + Math.cos(a) * d, cy = S / 2 + Math.sin(a) * d, rad = S * (0.08 + r() * 0.14);
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, 'rgba(255,255,255,.22)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, rad, 0, 7); x.fill();
  }
  return new THREE.CanvasTexture(c);
}

// Земля: детализация цвета шумом, тени от облаков, мокрая поверхность в дождь, микрорельеф (только PBR —
// у Ламберта освещение повершинное). Все шумы — выборки из текстуры с мип-уровнями (вдали не «искрит»).
function terrainShader(mat, P, U) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    let frag = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vWP; uniform sampler2D noiseTex, cloudTex; uniform vec2 sunXZ; uniform float cloudK, wet, desat;`);
    let colorCode = '';
    if (P.detail) colorCode += `
        float n1 = texture2D(noiseTex, vWP.xz * ${(0.012 / 32).toFixed(7)}).r, n2 = texture2D(noiseTex, vWP.xz * ${(0.09 / 32).toFixed(7)} + 0.37).g;
        float n3 = texture2D(noiseTex, vWP.xz * ${(0.6 / 32).toFixed(7)} + 0.71).r;
        diffuseColor.rgb *= 0.74 + 0.26 * n1 + 0.16 * n2 + 0.07 * n3;`;
    if (P.cloudShadows) colorCode += `
        if (cloudK > 0.0) { vec2 cq = vWP.xz + sunXZ * (${CLOUD_H.toFixed(1)} - vWP.y);
          diffuseColor.rgb *= 1.0 - cloudK * texture2D(cloudTex, cq / ${CLOUD_SPAN.toFixed(1)} + 0.5).r; }`;
    colorCode += '\n        diffuseColor.rgb *= 1.0 - 0.32 * wet;\n        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722))), desat); // в пасмурную погоду краски тусклее';
    frag = frag.replace('#include <color_fragment>', '#include <color_fragment>' + colorCode);
    if (P.terrainPBR) {
      frag = frag.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.38, wet);')
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { float fade = 1.0 - smoothstep(400.0, 3000.0, length(vWP - cameraPosition));
          vec2 g = (texture2D(noiseTex, vWP.xz * ${(0.07 / 32).toFixed(7)}).ba - 0.5) * ${(6.4 * 0.07).toFixed(4)}
                 + (texture2D(noiseTex, vWP.xz * ${(0.23 / 32).toFixed(7)} + 0.53).ba - 0.5) * ${(3.2 * 0.23).toFixed(4)};
          vec3 d = vec3(-g.x, 0.0, -g.y) * 1.68 * fade;
          normal = normalize(normal + (viewMatrix * vec4(d, 0.0)).xyz); }`);
    }
    sh.fragmentShader = frag;
  };
}
// Окна: сетка по фасадам; часть окон светится (тем больше, чем темнее — погода задаёт night)
function windowBuildings(mat, U) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 wpB = vec4(transformed, 1.0); vec3 nB = objectNormal;
        #ifdef USE_INSTANCING
          wpB = instanceMatrix * wpB; nB = mat3(instanceMatrix) * nB;
        #endif
        vWP = (modelMatrix * wpB).xyz; vWN = normalize(nB);`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN; uniform float night;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 winGlow = vec3(0.0);
        if (abs(vWN.y) < 0.5) {
          vec2 w = vec2((abs(vWN.x) > 0.5 ? vWP.z : vWP.x) / 3.4, vWP.y / 3.8);
          vec2 f = fract(w);
          float win = step(0.2, f.x) * step(f.x, 0.8) * step(0.28, f.y) * step(f.y, 0.84);
          float rnd = fract(sin(dot(floor(w), vec2(12.9898, 78.233))) * 43758.5453);
          float lit = step(0.83 - 0.35 * night, rnd);
          vec3 glass = mix(vec3(0.015, 0.03, 0.06), vec3(0.9, 0.7, 0.32), lit * 0.55);
          diffuseColor.rgb = mix(diffuseColor.rgb, glass, win * 0.9);
          diffuseColor.rgb *= 0.85 + 0.15 * step(0.5, fract(vWP.y / 3.8 * 0.5)); // межэтажные пояса
          winGlow = vec3(1.0, 0.62, 0.28) * win * lit * night * (0.6 + 0.8 * fract(rnd * 7.1)) * 2.2;
        } else { diffuseColor.rgb *= 0.6; }`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += winGlow;');
  };
}

// Физическое небо: градиент зенит→горизонт, зарево заката у горизонта, дымка у солнца, ореол и яркий (HDR) диск
function skyMaterial(SU, discMul) {
  return new THREE.ShaderMaterial({
    uniforms: { ...SU, discMul: { value: discMul } },
    vertexShader: `varying vec3 vDir;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `uniform vec3 sunDir, zenith, horizon, ground, glow, haze, sunCol; uniform float hazeK, halo, discK, discMul, flash; varying vec3 vDir;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        vec3 d = normalize(vDir); float h = d.y;
        vec3 col = h > 0.0 ? mix(horizon, zenith, pow(h, 0.45)) : mix(horizon, ground, pow(min(-h * 5.0, 1.0), 0.6));
        float sd = max(dot(d, sunDir), 0.0);
        float az = dot(normalize(d.xz + 1e-5), normalize(sunDir.xz + 1e-5)) * 0.5 + 0.5;
        col += glow * pow(az, 3.0) * exp(-max(h, 0.0) * 7.0) * (1.0 - smoothstep(0.0, 0.15, -h));
        col += haze * pow(sd, 6.0) * hazeK * (1.0 - abs(h));
        col += sunCol * (pow(sd, 90.0) * halo + pow(sd, 2400.0) * discK * discMul);
        col += flash * vec3(0.75, 0.8, 1.0) * (0.35 + 0.65 * max(h, 0.0));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false, extensions: { fragDepth: true },
  });
}

// buildWorld: наполняет сцену. P — пресет, weather — ключ WEATHERS. Возвращает здания (для столкновений),
// follow/update, setWeather и dispose.
export function buildWorld(scene, P, seed, renderer, weather = 'day', opts = {}) {
  const owned = [];
  const add = (o) => { scene.add(o); owned.push(o); return o; };
  const rnd = mulberry32((seed ^ 0x51ed270b) >>> 0);
  const NT = noiseTex();
  if (renderer && P.terrainPBR) NT.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());

  scene.fog = new THREE.FogExp2(0xffffff, FOG_D); scene.fog.color = FOG_LIN;
  const hemi = add(new THREE.HemisphereLight(lin(0xd6e8ff), lin(0x6d7560), 1));
  const sun = new THREE.DirectionalLight(lin(0xfff0d8), 1);
  sun.position.copy(SUN_DIR).multiplyScalar(2000); add(sun); add(sun.target);
  const shBox = P.shadowBox || 220;
  if (P.shadows) {
    sun.castShadow = true; sun.shadow.mapSize.set(P.shadowMap || 2048, P.shadowMap || 2048);
    const c = sun.shadow.camera; c.left = -shBox; c.right = shBox; c.top = shBox; c.bottom = -shBox; c.near = 10; c.far = 5000;
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
    sun.shadow.camera.layers.enable(3); // «теневые» объекты (набор ближних деревьев) видит только теневая камера
  }
  // Теневая камера двигается за дроном шагами ровно в пиксель карты теней: края теней больше не «кипят» в полёте
  const shTexel = 2 * shBox / (P.shadowMap || 2048), SX = new THREE.Vector3(), SY = new THREE.Vector3(), SNAP = new THREE.Vector3();
  const shadowSet = { cx: 1e9, cz: 1e9, sd: '', on: true };
  function rebuildShadowTrees(f) {
    const ims = [shadowTrees.spruce, shadowTrees.leafy], cnt = [0, 0], lim = shBox + 60, reach = shBox + 1600;
    for (const t of treeChunks) {
      const dx = t.x - f.x, dz = t.z - f.z;
      if (Math.abs(dx * SX.x + dz * SX.z) > reach + 1450 || Math.abs(dx * SY.x + (terrainH(t.x, t.z) - f.y) * SY.y + dz * SY.z) > reach + 1450) continue;
      const src = t.mesh.instanceMatrix.array, n = t.mesh.count, k = t.leafy ? 1 : 0, im = ims[k], dst = im.instanceMatrix.array, cap = im.instanceMatrix.count;
      for (let i = 0; i < n && cnt[k] < cap; i++) {
        const o = i * 16, px = src[o + 12] - f.x, py = src[o + 13] - f.y, pz = src[o + 14] - f.z;
        if (Math.abs(px * SX.x + py * SX.y + pz * SX.z) > lim || Math.abs(px * SY.x + py * SY.y + pz * SY.z) > lim) continue;
        for (let q = 0; q < 16; q++) dst[cnt[k] * 16 + q] = src[o + q];
        cnt[k]++;
      }
    }
    ims.forEach((im, k) => { im.count = cnt[k]; im.instanceMatrix.updateRange.offset = 0; im.instanceMatrix.updateRange.count = cnt[k] * 16; im.instanceMatrix.needsUpdate = true; });
  }
  const hemiBase = P.terrainPBR ? 0.55 : 0.8, sunBase = P.terrainPBR ? 1.9 : 1.25; // PBR-земля: свет «честный», без пересвета

  // общие uniform'ы атмосферы (погода и вспышки молний меняют их на месте)
  const SU = { sunDir: { value: SUN_DIR }, zenith: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, ground: { value: new THREE.Color() },
    glow: { value: new THREE.Color() }, haze: { value: new THREE.Color() }, sunCol: { value: lin(0xfff9ee) }, hazeK: { value: 0.22 }, halo: { value: 0.9 },
    discK: { value: 40 }, flash: { value: 0 } };
  const TU = { noiseTex: { value: NT }, cloudTex: { value: null }, sunXZ: { value: new THREE.Vector2() }, cloudK: { value: 0.38 }, wet: { value: 0 }, desat: { value: 0 } };
  const BU = { night: { value: 0 } };

  // небо
  const sky = add(new THREE.Mesh(new THREE.SphereGeometry(42000, 48, 24), skyMaterial(SU, 1)));
  sky.renderOrder = -2;
  // карта окружения для металла (PBR) — из того же неба (без ослепительного диска); пересчитывается при смене погоды
  let envTex = null;
  function makeEnv() {
    if (!P.pbr || !renderer) return;
    try {
      const envScene = new THREE.Scene(), m = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), skyMaterial(SU, 0.05));
      envScene.add(m);
      const pm = new THREE.PMREMGenerator(renderer), t = pm.fromScene(envScene, 0.02).texture;
      pm.dispose(); m.geometry.dispose(); m.material.dispose();
      if (envTex) envTex.dispose();
      envTex = t; scene.environment = t;
    } catch (_) { /* без отражений — не критично */ }
  }

  // рельеф: 8×8 квадратов по 4,25 км, у каждого до 4 уровней детализации (ближе к камере — мельче сетка).
  // «Юбка» по краю квадрата прячет щели между соседями разной детализации, нормали считаются по самой функции
  // высоты (без швов на стыках). Мелкие уровни строятся по мере надобности и выгружаются, когда долго не нужны.
  const TCH = 8, TS = WORLD.SIZE / TCH, SEG0 = P.terrainSeg || 32, SKIRT = [6, 22, 70, 160], LOD_D = P.lodD || [1800, 5500, 12000];
  const tChunks = [];
  const tMat = P.terrainPBR ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, envMapIntensity: 0.3 })
    : new THREE.MeshLambertMaterial({ vertexColors: true });
  terrainShader(tMat, P, TU);
  // Сетки строит фоновый поток (terrain-worker.js), чтобы подлёт к новому участку не «дёргал» кадр;
  // пока подробная сетка готовится, показывается более грубая. Без поддержки модульных потоков — строим сразу.
  const toGeo = (ch, lv, a) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(a.pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(a.nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(a.col, 3));
    g.setIndex(new THREE.BufferAttribute(a.idx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(ch.x0 + TS / 2, (a.lo + a.hi) / 2, ch.z0 + TS / 2), Math.hypot(TS / 2, TS / 2, (a.hi - a.lo) / 2 + SKIRT[lv]));
    ch.cy = (a.lo + a.hi) / 2;
    return g;
  };
  const chunkGeo = (ch, lv) => toGeo(ch, lv, buildChunkArrays(ch.x0, ch.z0, TS, Math.max(4, SEG0 >> lv), SKIRT[lv]));
  let worker = null, jobId = 0;
  const jobs = new Map();
  try {
    if (typeof Worker !== 'undefined' && !opts.syncTerrain) {
      worker = new Worker(new URL('./terrain-worker.js?v=20260929c', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => { const j = jobs.get(e.data.id); if (!j) return; jobs.delete(e.data.id); j.ch.pending[j.lv] = false; if (!disposed) j.ch.geos[j.lv] = toGeo(j.ch, j.lv, e.data); };
      worker.onerror = () => { worker = null; }; // модульные потоки не поддерживаются — дальше строим сразу
    }
  } catch (_) { worker = null; }
  let disposed = false;
  function requestChunk(ch, lv) {
    if (ch.pending[lv]) return false;
    if (!worker) { ch.geos[lv] = chunkGeo(ch, lv); return true; }
    const id = ++jobId; jobs.set(id, { ch, lv }); ch.pending[lv] = true;
    worker.postMessage({ id, x0: ch.x0, z0: ch.z0, size: TS, seg: Math.max(4, SEG0 >> lv), skirt: SKIRT[lv] });
    return true;
  }
  for (let cj = 0; cj < TCH; cj++) for (let ci = 0; ci < TCH; ci++) {
    const ch = { x0: -WORLD.SIZE / 2 + ci * TS, z0: -WORLD.SIZE / 2 + cj * TS, geos: [], pending: [], last: [0, 0, 0, 0], lv: 3 };
    ch.geos[3] = chunkGeo(ch, 3); ch.geos[2] = chunkGeo(ch, 2);
    ch.mesh = add(new THREE.Mesh(ch.geos[3], tMat)); ch.mesh.receiveShadow = !!P.shadows;
    tChunks.push(ch);
  }
  let tFrame = 0, tBuildT = 0, detailK = 1; // detailK — «умное качество» (main.js) уменьшает дальности подробных уровней
  function updateTerrain(cam) {
    tFrame++; tBuildT--;
    for (const ch of tChunks) {
      const dx = Math.max(0, Math.abs(cam.x - (ch.x0 + TS / 2)) - TS / 2), dz = Math.max(0, Math.abs(cam.z - (ch.z0 + TS / 2)) - TS / 2);
      const d = Math.hypot(dx, dz, Math.max(0, cam.y - ch.cy) * 0.8);
      let want = d < LOD_D[0] * detailK ? 0 : d < LOD_D[1] * detailK ? 1 : d < LOD_D[2] * detailK ? 2 : 3;
      // в фоне — сколько угодно заданий; без фонового потока — не больше одного квадрата за 3 кадра
      if (!ch.geos[want] && (worker || tBuildT <= 0) && requestChunk(ch, want) && !worker) tBuildT = 2;
      while (!ch.geos[want]) want++;
      ch.last[want] = tFrame;
      if (ch.mesh.geometry !== ch.geos[want]) ch.mesh.geometry = ch.geos[want];
      for (let l = 0; l < 2; l++) if (ch.geos[l] && l !== want && tFrame - ch.last[l] > 1800) { ch.geos[l].dispose(); ch.geos[l] = null; } // ~30 с без надобности
    }
  }
  const far = add(new THREE.Mesh(new THREE.PlaneGeometry(240000, 240000), new THREE.MeshLambertMaterial({ color: lin(0x5f7050) })));
  far.rotation.x = -Math.PI / 2; far.position.y = -40; // ниже воды: внутри карты её не видно
  // вода: на «Ультра»/«Кино» — PBR с отражением неба (по Френелю: у горизонта зеркальнее) и бликом солнца
  const water = add(new THREE.Mesh(new THREE.PlaneGeometry(WORLD.SIZE, WORLD.SIZE), P.waterPBR
    ? new THREE.MeshStandardMaterial({ color: lin(0x245a74), roughness: 0.08, metalness: 0, envMapIntensity: 0.85, transparent: true, opacity: 0.93 })
    : P.pbr ? new THREE.MeshPhongMaterial({ color: lin(0x2c6d8c), shininess: 120, specular: lin(0x9ab8d0), transparent: true, opacity: 0.92 })
    : new THREE.MeshLambertMaterial({ color: lin(0x2f6f8e) })));
  water.rotation.x = -Math.PI / 2; water.position.y = WORLD.WATER_Y;
  const waterTime = { value: 0 }, waterRough = { value: 0.1 };
  if (P.waterAnim) {
    water.material.onBeforeCompile = (sh) => {
      sh.uniforms.wTime = waterTime; sh.uniforms.wRough = waterRough; sh.uniforms.noiseTex = TU.noiseTex;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; uniform float wTime, wRough; uniform sampler2D noiseTex;')
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          { // рябь: два слоя шума, бегущих в разные стороны (без регулярной «сетки»), вдали затухает
            vec2 q = vWP.xz; float t = wTime, fade = 1.0 - smoothstep(600.0, 4000.0, length(vWP - cameraPosition));
            vec2 n1 = texture2D(noiseTex, q * 0.0021 + vec2(t * 0.011, -t * 0.006)).ba - 0.5;
            vec2 n2 = texture2D(noiseTex, q * 0.0063 + vec2(-t * 0.017, t * 0.013) + 0.37).ba - 0.5;
            vec2 n3 = texture2D(noiseTex, q * 0.017 + vec2(t * 0.03, t * 0.021) + 0.71).ba - 0.5;
            vec3 pn = vec3(n1.x * 2.2 + n2.x * 1.4 + n3.x * 0.8 * fade, 0.0, n1.y * 2.2 + n2.y * 1.4 + n3.y * 0.8 * fade);
            normal = normalize(normal + (viewMatrix * vec4(pn * wRough * (0.35 + 0.65 * fade), 0.0)).xyz); }`);
    };
  }

  // аэродром: полоса с разметкой, рулёжка, ангары; вечером — огни полосы
  const runwayLights = [];
  {
    const h = airfieldH() + 0.6, parts = [];
    parts.push(part(new THREE.BoxGeometry(60, 1, 3000), 0x3c3f42, M(0, 0, 0)));
    for (let k = -14; k <= 14; k++) parts.push(part(new THREE.BoxGeometry(1.5, 1.05, 40), 0xe8e8e0, M(0, 0.12, k * 100)));
    for (const s of [-1, 1]) for (let k = 0; k < 8; k++) parts.push(part(new THREE.BoxGeometry(3, 1.05, 30), 0xe8e8e0, M((k - 3.5) * 6, 0.12, s * 1450)));
    parts.push(part(new THREE.BoxGeometry(24, 0.9, 2600), 0x4a4d50, M(120, 0, 0)));
    for (let k = 0; k < 6; k++) {
      parts.push(part(new THREE.BoxGeometry(40, 12, 50), 0x7c8278, M(210, 6, -900 + k * 360)));
      parts.push(part(new THREE.CylinderGeometry(25, 25, 50, 16, 1, false, 0, Math.PI), 0x6d736a, M(210, 12, -900 + k * 360, Math.PI / 2, 0, Math.PI / 2)));
    }
    const m = add(new THREE.Mesh(mergeParts(parts), new THREE.MeshLambertMaterial({ vertexColors: true })));
    m.position.set(AIRFIELD.x, h, AIRFIELD.z); m.receiveShadow = !!P.shadows;
    if (P.windows) { // огни: HDR-яркие точки (свечение в топовых пресетах), видны только в сумерках
      const lg = new THREE.SphereGeometry(0.7, 6, 4), lm = new THREE.MeshBasicMaterial({ color: lin(0xffd49a).multiplyScalar(6), fog: true });
      const n = 2 * 31 + 2 * 9, inst = new THREE.InstancedMesh(lg, lm, n), mm = new THREE.Matrix4();
      let k = 0;
      for (const s of [-1, 1]) for (let i = 0; i <= 30; i++) inst.setMatrixAt(k++, mm.makeTranslation(s * 32, 1.2, -1500 + i * 100));
      for (const s of [-1, 1]) for (let i = 0; i < 9; i++) inst.setMatrixAt(k++, mm.makeTranslation((i - 4) * 7, 1.2, s * 1510));
      inst.instanceMatrix.needsUpdate = true; inst.position.copy(m.position); inst.visible = false;
      lg.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1600);
      add(inst); runwayLights.push(inst);
    }
  }

  // здания: отдельный InstancedMesh на город — невидимые города отсекаются целиком
  const buildings = [], bldMeshes = [];
  const bMat = new THREE.MeshLambertMaterial();
  if (P.windows) windowBuildings(bMat, BU);
  for (const t of TOWNS) {
    const N = P.bldPerTown, geo = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.InstancedMesh(geo, bMat, N);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
    let maxH = 0;
    for (let k = 0; k < N; k++) {
      let x, z, rr, tries = 0;
      do { const a = rnd() * Math.PI * 2; rr = Math.pow(rnd(), 0.8) * t.r * 0.72; x = t.x + Math.cos(a) * rr; z = t.z + Math.sin(a) * rr; tries++; }
      while (tries < 20 && buildings.some((b) => Math.abs(b.x - x) < b.hw + 22 && Math.abs(b.z - z) < b.hd + 22));
      const w = 16 + rnd() * 26, d = 16 + rnd() * 26;
      const hgt = Math.min(170, (14 + rnd() * 40) * (1 + 1.8 * Math.max(0, 1 - rr / (t.r * 0.5))));
      const base = terrainH(x, z) - 3;
      m.compose(new THREE.Vector3(x, base + hgt / 2, z), q, new THREE.Vector3(w, hgt, d));
      mesh.setMatrixAt(k, m);
      const tt = rnd();
      if (tt < 0.4) c.setRGB(0.72, 0.70, 0.66); else if (tt < 0.7) c.setRGB(0.62, 0.64, 0.68); else if (tt < 0.88) c.setRGB(0.74, 0.62, 0.52); else c.setRGB(0.5, 0.56, 0.62);
      mesh.setColorAt(k, c.convertSRGBToLinear());
      buildings.push({ x, z, hw: w / 2, hd: d / 2, y0: base, y1: base + hgt });
      maxH = Math.max(maxH, base + hgt);
    }
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(t.x, maxH / 2, t.z), t.r + maxH);
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = mesh.receiveShadow = !!P.shadows;
    add(mesh); bldMeshes.push(mesh);
  }

  // деревни, промзона, дороги, ЛЭП, вышки, ветряки (props.js) — их коробки тоже участвуют в столкновениях
  const props = buildProps({ WORLD, TOWNS, AIRFIELD, terrainH, lin, add, P, seed });
  buildings.push(...props.boxes);

  // лес: квадраты 2×2 км, у каждого свой InstancedMesh — вне кадра и дальше дальности прорисовки не рисуется
  const treeChunks = [], shadowTrees = {};
  {
    const spruce = mergeParts([
      part(new THREE.CylinderGeometry(0.5, 0.8, 5, 5), 0x5a4029, M(0, 2.5, 0)),
      part(new THREE.ConeGeometry(4.6, 10, 7), 0x2a5f27, M(0, 8.5, 0)),
      part(new THREE.ConeGeometry(3.4, 8, 7), 0x35732f, M(0, 13, 0)),
    ]);
    const leafy = mergeParts([
      part(new THREE.CylinderGeometry(0.5, 0.9, 7, 5), 0x5e4630, M(0, 3.5, 0)),
      part(new THREE.IcosahedronGeometry(5.2, 1), 0x3f7a2e, M(0, 10, 0, 0, 0, 0, 1, 0.85, 1)),
      part(new THREE.IcosahedronGeometry(3.6, 1), 0x4c8a35, M(2.2, 12.5, 1, 0, 0, 0, 1, 0.8, 1)),
    ]);
    // дальние деревья — упрощённые (конус или многогранник вместо 3 частей): вдали разницы не видно, треугольников в 10–20 раз меньше
    const spruceLo = mergeParts([part(new THREE.ConeGeometry(4.3, 17, 5), 0x2e6a2a, M(0, 8.5, 0))]);
    const leafyLo = mergeParts([part(new THREE.IcosahedronGeometry(5.4, 0), 0x447f31, M(0.6, 10.5, 0.3, 0, 0, 0, 1, 0.9, 1)), part(new THREE.CylinderGeometry(0.6, 0.8, 7, 3), 0x5e4630, M(0, 3.5, 0))]);
    const trMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const CH = P.treeCell || 2000, cells = new Map(); // на слабых пресетах деревьев мало — крупнее квадраты, меньше вызовов отрисовки
    let placed = 0;
    for (let k = 0; k < P.trees * 6 && placed < P.trees; k++) {
      const x = (rnd() - 0.5) * 24000, z = (rnd() - 0.5) * 24000;
      const forest = Math.sin(x * 0.0009 + 2) * Math.cos(z * 0.0011) + 0.4 * Math.sin(x * 0.0031 + z * 0.0027);
      if (forest < 0.5) continue;
      const y = terrainH(x, z);
      if (y < WORLD.WATER_Y + 15 || y > 1000) continue;
      const key = Math.floor(x / CH) + ':' + Math.floor(z / CH);
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push([x, y, z, 0.8 + rnd() * 0.9, rnd() * 6, 0.9 + rnd() * 0.4]);
      placed++;
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    let v = 0;
    for (const [key, list] of cells) {
      const [cx, cz] = key.split(':').map((n) => (+n + 0.5) * CH);
      const isLeafy = P.treeVariety && v++ % 2;
      const geo = (isLeafy ? leafy : spruce).clone(), geoLo = (isLeafy ? leafyLo : spruceLo).clone();
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, list[0][1], cz), CH * 0.75 + 300); geoLo.boundingSphere = geo.boundingSphere.clone();
      const mesh = new THREE.InstancedMesh(geo, trMat, list.length);
      list.forEach(([x, y, z, s, rot, sy], i) => { m.compose(new THREE.Vector3(x, y - 0.5, z), q.setFromEuler(e.set(0, rot, 0)), new THREE.Vector3(s, s * sy, s)); mesh.setMatrixAt(i, m); });
      mesh.instanceMatrix.needsUpdate = true; // тени леса рисует отдельный «теневой» набор ближних деревьев (ниже)
      const lo = new THREE.InstancedMesh(geoLo, trMat, list.length); lo.instanceMatrix = mesh.instanceMatrix; // общий буфер матриц
      add(mesh); add(lo); treeChunks.push({ mesh, lo, x: cx, z: cz, leafy: !!isLeafy });
    }
    // «Теневой» лес: в карту теней попадают только деревья в зоне теней вокруг дрона (а не целые квадраты по 2 км),
    // и только для теневого прохода (слой 3 — основная камера его не видит). Набор пересобирается при смещении на 120 м.
    if (P.shadows) for (const [k, g] of [['spruce', spruce], ['leafy', leafy]]) {
      const cap = P.shadowTrees || 2500, im = new THREE.InstancedMesh(g.clone(), trMat, cap);
      im.count = 0; im.frustumCulled = false; im.castShadow = true; im.layers.set(3); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      add(im); shadowTrees[k] = im;
    }
    spruce.dispose(); leafy.dispose(); spruceLo.dispose(); leafyLo.dispose();
  }

  // ── облака-«кучи» там, где «поле облачности» выше порога (там же на земле их тени); пересобираются при смене погоды ──
  const CU = { lit: { value: new THREE.Color() }, dark: { value: new THREE.Color() }, sunTint: { value: new THREE.Color() }, flash: SU.flash };
  const puff = P.cloudSprites ? puffTex() : null;
  let clouds = null, fxLayerOn = false;
  function buildClouds(th, mul) {
    if (clouds) { scene.remove(clouds); clouds.geometry.dispose(); if (!P.cloudSprites) clouds.material.dispose(); clouds = null; }
    const centers = [], st = 500, n = Math.round(30000 / st), F = [];
    for (let i = 0; i <= n; i++) { F.push([]); for (let j = 0; j <= n; j++) F[i].push(cloudField(-15000 + i * st, -15000 + j * st)); }
    for (let i = 1; i < n; i++) for (let j = 1; j < n; j++) {
      const f = F[i][j]; if (f < th + 0.03) continue;
      let peak = true;
      for (let di = -1; di <= 1 && peak; di++) for (let dj = -1; dj <= 1; dj++) if ((di || dj) && F[i + di][j + dj] > f) { peak = false; break; }
      if (peak) centers.push([-15000 + i * st, -15000 + j * st, f]);
    }
    centers.sort((a, b) => b[2] - a[2]); centers.length = Math.min(centers.length, Math.round(P.clouds * mul));
    if (!centers.length) return;
    if (P.cloudSprites) {
      // объёмные облака из освещённых спрайтов: низ в тени, верх и край к солнцу светлее, «серебряная кромка» против солнца
      const R = mulberry32(777), offs = [], sizes = [], shades = [], rots = [];
      for (const [cx, cz, f] of centers) {
        const k = P.cloudPuffs * 3, rad = 300 + (f - th) * 3000;
        for (let i = 0; i < k; i++) {
          const a = R() * Math.PI * 2, d = Math.pow(R(), 0.6) * rad, y = CLOUD_H + Math.pow(R(), 1.5) * rad * 0.7;
          const px = cx + Math.cos(a) * d, pz = cz + Math.sin(a) * d * 0.7;
          const hk = (y - CLOUD_H) / (rad * 0.7 + 1), side = (Math.cos(a) * SUN_DIR.x + Math.sin(a) * SUN_DIR.z) * (d / rad);
          offs.push(px, y, pz); sizes.push(260 + R() * 420 * (1 - d / rad * 0.5)); shades.push(clamp(0.35 + 0.55 * hk + 0.2 * side, 0.2, 1)); rots.push(R() * 6.28);
        }
      }
      const g = new THREE.InstancedBufferGeometry(), base = new THREE.PlaneGeometry(1, 1);
      g.setIndex(base.index); g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
      g.setAttribute('offset', new THREE.InstancedBufferAttribute(new Float32Array(offs), 3));
      g.setAttribute('psize', new THREE.InstancedBufferAttribute(new Float32Array(sizes), 1));
      g.setAttribute('shade', new THREE.InstancedBufferAttribute(new Float32Array(shades), 1));
      g.setAttribute('rot', new THREE.InstancedBufferAttribute(new Float32Array(rots), 1));
      g.instanceCount = sizes.length;
      clouds = new THREE.Mesh(g, cloudMat); clouds.frustumCulled = false; clouds.renderOrder = 2;
    } else {
      const parts = [], cg = new THREE.IcosahedronGeometry(1, P.cloudPuffs > 8 ? 2 : 1), R = mulberry32(55);
      for (const [cx, cz] of centers) {
        const k = P.cloudPuffs;
        for (let i = 0; i < k; i++) {
          const s = 160 + R() * 260;
          parts.push(part(cg, 0xffffff, M(cx + (i - k / 2) * 170 + R() * 90, CLOUD_H + 150 + R() * 90 - (i % 2) * 40, cz + (R() - 0.5) * 260, 0, R() * 3, 0, s, s * (0.45 + R() * 0.25), s * 0.85)));
        }
      }
      clouds = new THREE.Mesh(mergeParts(parts), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: lin(0x8e9aa6) }));
    }
    clouds.layers.set(fxLayerOn && P.cloudSprites ? FX_LAYER : 0);
    scene.add(clouds);
  }
  const cloudMat = !P.cloudSprites ? null : new THREE.ShaderMaterial({
    uniforms: { map: { value: puff }, sunDir: SU.sunDir, fogColor: { value: FOG_LIN }, fogDensity: FOG_U, ...CU, ...FXU },
    vertexShader: `attribute vec3 offset; attribute float psize, shade, rot; varying vec2 vUv; varying float vShade, vFog, vFade; varying vec3 vView;
      uniform float fogDensity;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        // затухание по расстоянию до центра — одинаковое для всех 4 вершин; погасшие спрайты не растеризуются вовсе
        float dc = length(offset - cameraPosition);
        vFade = smoothstep(psize * 0.3, psize * 1.2, dc); // не заслонять экран, когда пролетаем сквозь облако
        vFog = 1.0 - exp(-fogDensity * fogDensity * 0.64 * dc * dc);
        if (vFade < 0.005 || vFog > 0.995) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
        float c = cos(rot), s = sin(rot); vec2 p = mat2(c, s, -s, c) * position.xy;
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec3 wp = offset + (right * p.x + up * p.y) * psize;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        vUv = uv; vShade = shade; vView = normalize(wp - cameraPosition);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `uniform sampler2D map; uniform vec3 sunDir, fogColor, lit, dark, sunTint; uniform float flash; varying vec2 vUv; varying float vShade, vFog, vFade; varying vec3 vView;
      ${SOFT_GLSL}
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        float a = texture2D(map, vUv).a * vFade * fxSoft(120.0); if (a < 0.01) discard;
        float fwd = pow(max(dot(vView, sunDir), 0.0), 8.0);
        vec3 col = mix(dark, lit, vShade) * 1.15 + sunTint * fwd * (1.0 - vShade * 0.5) + flash * vec3(0.7, 0.75, 0.9);
        gl_FragColor = vec4(mix(col, fogColor, vFog), a * 0.92);
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }`,
    transparent: true, depthWrite: false, extensions: { fragDepth: true },
  });

  // ── сплошной облачный слой (пасмурно/дождь) и высокие перистые облака (топовые пресеты): один большой квад ──
  const DU = { noiseTex: TU.noiseTex, lit: { value: new THREE.Color() }, dark: { value: new THREE.Color() }, sunTint: { value: new THREE.Color() },
    ...FXU, cover: { value: 0.3 }, dens: { value: 1 }, stretch: { value: 1 }, freq: { value: 0.000085 }, fine: { value: 0.15 }, time: { value: 0 }, flash: SU.flash, sunDir: SU.sunDir, fogColor: { value: FOG_LIN }, fogDensity: FOG_U };
  const deck = add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    uniforms: DU,
    vertexShader: `varying vec3 vWP;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `uniform sampler2D noiseTex; uniform vec3 lit, dark, sunTint, sunDir, fogColor; uniform float cover, dens, stretch, freq, fine, time, flash, fogDensity; varying vec3 vWP;
      ${SOFT_GLSL}
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        vec2 p = vWP.xz * vec2(freq, freq * stretch) + vec2(time * 0.0009, time * 0.0004);
        float n = (texture2D(noiseTex, p).r * 0.55 + texture2D(noiseTex, p * 2.7 + 0.31).g * 0.3 + texture2D(noiseTex, p * 7.3 + 0.77).r * fine) / (0.85 + fine);
        float a = smoothstep(cover, cover + 0.22, n) * dens;
        if (a < 0.004) discard;
        // «объём» одной доп. выборкой: если к солнцу плотнее — этот участок в тени
        float n2 = texture2D(noiseTex, p + sunDir.xz * 0.006).r;
        float shade = clamp(0.62 + (texture2D(noiseTex, p).r - n2) * 2.2, 0.0, 1.0);
        vec3 v = normalize(vWP - cameraPosition);
        vec3 col = cameraPosition.y < vWP.y ? mix(dark, dark * 1.35, (1.0 - a) * 0.8 + shade * 0.2) : mix(dark, lit, shade);
        col += sunTint * pow(max(dot(v, sunDir), 0.0), 6.0) * (1.0 - a * 0.6) + flash * vec3(0.8, 0.85, 1.0);
        float d = length(vWP - cameraPosition), fog = 1.0 - exp(-fogDensity * fogDensity * 0.5 * d * d);
        a *= smoothstep(15.0, 220.0, abs(cameraPosition.y - vWP.y)) * fxSoft(200.0); // пролёт сквозь слой — без резкой «стенки»
        gl_FragColor = vec4(mix(col, fogColor, fog), a * (1.0 - fog * 0.35));
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, extensions: { fragDepth: true },
  })));
  deck.rotation.x = -Math.PI / 2; deck.scale.set(110000, 110000, 1); deck.frustumCulled = false; deck.renderOrder = 1; deck.visible = false;

  // ── ливень: отрезки-капли вокруг камеры (анимация целиком в шейдере), вытянуты по относительной скорости ──
  const RAIN_N = P.rainDrops || 1500;
  const RU = { time: { value: 0 }, camPos: { value: new THREE.Vector3() }, rel: { value: new THREE.Vector3() }, alpha: { value: 0 }, col: { value: new THREE.Color() }, top: { value: 2400 } };
  let rain;
  {
    const seedA = new Float32Array(RAIN_N * 2 * 3), endA = new Float32Array(RAIN_N * 2), R = mulberry32(4242);
    for (let i = 0; i < RAIN_N; i++) { const x = R(), y = R(), z = R(); for (let e = 0; e < 2; e++) { seedA.set([x, y, z], (i * 2 + e) * 3); endA[i * 2 + e] = e; } }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(seedA, 3)); g.setAttribute('endp', new THREE.BufferAttribute(endA, 1));
    rain = add(new THREE.LineSegments(g, new THREE.ShaderMaterial({
      uniforms: RU,
      vertexShader: `attribute float endp; uniform float time, top; uniform vec3 camPos, rel; varying float vA;
        #include <common>
        #include <logdepthbuf_pars_vertex>
        void main() {
          const float BOX = 90.0;
          vec3 p = position * BOX + vec3(time * 4.0, -time * 11.0, time * 1.5);
          vec3 q = mod(p - camPos, BOX) - BOX * 0.5;
          vec3 wp = camPos + q - rel * 0.014 * endp;
          vA = (1.0 - smoothstep(20.0, 45.0, length(q))) * (1.0 - smoothstep(top - 300.0, top, wp.y));
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: `uniform vec3 col; uniform float alpha; varying float vA;
        #include <common>
        #include <logdepthbuf_pars_fragment>
        void main() {
          #include <logdepthbuf_fragment>
          gl_FragColor = vec4(col, vA * alpha);
          #include <tonemapping_fragment>
          #include <encodings_fragment>
        }`,
      transparent: true, depthWrite: false, extensions: { fragDepth: true },
    })));
    rain.frustumCulled = false; rain.renderOrder = 3; rain.visible = false;
  }

  // ── применение погоды: свет, небо, туман, облака, вода, окна, дождь ──
  let W = null, cloudTex = null, flashT = 0, boltT = 6, rainK = 1, driftT = 0, sortieT = 0, wKey = null;
  function applyLight() {
    const s = W, sunUp = clamp(SUN_DIR.y / 0.25, 0, 1);
    sun.color.copy(lin(s.sun)); sun.intensity = sunBase * s.sunI * (0.35 + 0.65 * sunUp);
    hemi.color.copy(lin(s.sky)); hemi.groundColor.copy(lin(s.gnd)); hemi.intensity = hemiBase * s.hemiI;
    TU.sunXZ.value.set(SUN_DIR.x / Math.max(0.05, SUN_DIR.y), SUN_DIR.z / Math.max(0.05, SUN_DIR.y));
    TU.cloudK.value = s.sunVis ? 0.38 * smooth01(0.18, 0.42, SUN_DIR.y) : 0;
    // воздушная перспектива: дымка к солнцу подсвечена его цветом (сильнее при низком солнце); в пасмурно — нет
    ATMO.sunDir.x = SUN_DIR.x; ATMO.sunDir.y = SUN_DIR.y; ATMO.sunDir.z = SUN_DIR.z;
    const sc = lin(s.sun), fc = lin(s.fog), lowSun = 1 - smooth01(0.1, 0.6, SUN_DIR.y);
    ATMO.sunCol.x = fc.r * 0.4 + sc.r * 0.9; ATMO.sunCol.y = fc.g * 0.4 + sc.g * 0.9; ATMO.sunCol.z = fc.b * 0.4 + sc.b * 0.9;
    ATMO.p.y = s.sunVis ? 0.35 + 0.4 * lowSun : 0;
  }
  function setWeather(key) {
    W = WEATHERS[key] || WEATHERS.day; wKey = key; driftT = 0;
    setSunDir(W.el, W.az);
    SU.zenith.value.copy(lin(W.zenith)); SU.horizon.value.copy(lin(W.horizon)); SU.ground.value.copy(lin(W.fog)).multiplyScalar(0.75);
    SU.glow.value.copy(lin(W.glow)).multiplyScalar(W.glowK || 0); SU.haze.value.copy(lin(W.haze)); SU.hazeK.value = W.hazeK; SU.halo.value = W.halo; SU.discK.value = W.disc;
    SU.sunCol.value.copy(lin(W.sun)).lerp(new THREE.Color(1, 0.95, 0.85), W.el < 20 ? 0.25 : 0.5);
    FOG_LIN.copy(lin(W.fog)); FOG_U.value = W.fogD; scene.fog.density = W.fogD;
    applyLight();
    if (P.shadows) sun.castShadow = !!W.shadows;
    // тени облаков на земле — текстура из того же поля, с порогом этой погоды
    if (P.cloudShadows) { cloudTex = cloudShadowData(W.clouds, cloudTex); TU.cloudTex.value = cloudTex; }
    TU.wet.value = W.wet || 0; TU.desat.value = W.desat || 0; BU.night.value = W.night || 0; waterRough.value = W.rain ? 0.22 : 0.1;
    water.material.color.copy(lin(W.water)); if (water.material.specular) water.material.specular.copy(lin(W.sun)).multiplyScalar(W.sunVis ? 0.8 : 0.25);
    for (const l of runwayLights) l.visible = (W.night || 0) > 0.25;
    CU.lit.value.copy(lin(W.cloudLit)); CU.dark.value.copy(lin(W.cloudDark)); CU.sunTint.value.copy(lin(W.sun)).multiplyScalar(W.sunVis ? 0.9 : 0);
    if (!P.cloudSprites) { /* у простых облаков цвет — через emissive (пересобираются ниже) */ }
    buildClouds(W.clouds, W.deck ? 1.3 : 1);
    if (clouds && !P.cloudSprites) { clouds.material.color.copy(lin(W.cloudLit)); clouds.material.emissive.copy(lin(W.cloudLit)).lerp(lin(W.cloudDark), 0.5).multiplyScalar(0.55); }
    const dk = W.deck || (P.cirrus ? W.cirrus : null);
    deck.visible = !!dk;
    if (dk) {
      deck.position.y = dk.h; DU.cover.value = dk.cover; DU.dens.value = dk.dens; DU.lit.value.copy(lin(dk.lit)); DU.dark.value.copy(lin(dk.dark));
      DU.stretch.value = W.deck ? 1 : 5; DU.freq.value = W.deck ? 0.000085 : 0.00005; DU.fine.value = W.deck ? 0.15 : 0.04; DU.sunTint.value.copy(lin(W.sun)).multiplyScalar(W.sunVis ? 0.6 : 0.05);
    }
    rain.visible = !!W.rain; RU.top.value = W.deck ? W.deck.h - 100 : 2400; RU.col.value.copy(lin(0xb8c4d0)).multiplyScalar(0.8);
    makeEnv();
    return W;
  }
  setWeather(weather);

  const treeDist = P.treeDist || 9000;
  let treeShadows = true;
  return {
    buildings, sun, sky,
    get weather() { return wKey; },
    get W() { return W; },
    setWeather,
    // облака и облачный слой — на слой FX (рисует конвейер в половине разрешения) или обратно в основной кадр
    setDetail(k) { detailK = k; },
    setFxLayer(on) { fxLayerOn = on; const l = on ? FX_LAYER : 0; if (clouds && P.cloudSprites) clouds.layers.set(l); deck.layers.set(l); },
    sortieStart() { sortieT = 0; driftT = 0; setSunDir(W.el, W.az); applyLight(); boltT = 5; },
    // dt — шаг игры; возвращает { thunder, delay } при ударе молнии (звук грома — в main.js)
    update(dt, camVel) {
      waterTime.value += dt; DU.time.value += dt; props.update(dt, BU.night.value);
      let ev = null;
      // «живое» солнце: за вылет оно чуть смещается (рассвет поднимается, закат опускается)
      sortieT += dt;
      if (W.drift) {
        driftT += dt;
        if (driftT > 2) { const k = Math.min(1, sortieT / 300); setSunDir(W.el + W.drift * k, W.az + W.drift * 0.5 * k); applyLight(); driftT = 0; }
      }
      if (W.rain) {
        rainK = 0.65 + 0.35 * (0.5 + 0.5 * Math.sin(DU.time.value * 0.05) * Math.sin(DU.time.value * 0.013 + 1));
        RU.time.value += dt; RU.alpha.value = 0.34 * rainK;
        if (camVel) RU.rel.value.set(-camVel.x, -11 - camVel.y, -camVel.z);
      }
      if (W.lightning) {
        boltT -= dt;
        if (boltT <= 0) { boltT = 7 + Math.random() * 16; flashT = 0.45; ev = { thunder: 0.5 + Math.random() * 0.5, delay: 0.6 + Math.random() * 3.5 }; }
      }
      if (flashT > 0) {
        flashT -= dt;
        const f = flashT > 0 ? (flashT > 0.3 ? 1 : flashT > 0.22 ? 0.25 : flashT > 0.12 ? 0.8 : flashT / 0.12 * 0.4) : 0;
        SU.flash.value = f * 0.9; hemi.intensity = hemiBase * W.hemiI * (1 + f * 2.2);
      } else if (SU.flash.value) { SU.flash.value = 0; hemi.intensity = hemiBase * W.hemiI; }
      return ev;
    },
    get rainK() { return W.rain ? rainK : 0; },
    get emitters() { return props.emitters; },
    props,
    // небо и слои облаков следуют за камерой, тень — за игроком; лес прорисовывается до treeDist;
    // деревья и дома отбрасывают тени, только когда игрок низко (сверху этих теней всё равно не видно)
    follow(camPos, focus, focusAgl) {
      sky.position.copy(camPos);
      deck.position.x = camPos.x; deck.position.z = camPos.z;
      RU.camPos.value.copy(camPos);
      const base = focus || camPos;
      if (P.shadows) {
        // оси теневой камеры (как их строит lookAt) и «привязка» центра к сетке пикселей карты теней
        SX.crossVectors(UP_V, SUN_DIR).normalize(); SY.crossVectors(SUN_DIR, SX);
        const a = Math.round(base.dot(SX) / shTexel) * shTexel, b = Math.round(base.dot(SY) / shTexel) * shTexel, c = Math.round(base.dot(SUN_DIR) / shTexel) * shTexel;
        SNAP.copy(SX).multiplyScalar(a).addScaledVector(SY, b).addScaledVector(SUN_DIR, c);
        sun.position.copy(SNAP).addScaledVector(SUN_DIR, 2000); sun.target.position.copy(SNAP); sun.target.updateMatrixWorld();
        // теневой набор леса: пересобрать при смещении на 120 м или повороте солнца
        const low = focusAgl === undefined || focusAgl < 900, sd = SUN_DIR.x.toFixed(3) + SUN_DIR.z.toFixed(3);
        if (low && sun.castShadow && shadowTrees.spruce) {
          if (Math.hypot(base.x - shadowSet.cx, base.z - shadowSet.cz) > 120 || sd !== shadowSet.sd || !shadowSet.on) { rebuildShadowTrees(base); shadowSet.cx = base.x; shadowSet.cz = base.z; shadowSet.sd = sd; shadowSet.on = true; }
        } else if (shadowSet.on && shadowTrees.spruce) { shadowTrees.spruce.count = 0; shadowTrees.leafy.count = 0; shadowSet.on = false; }
      } else { sun.position.copy(base).addScaledVector(SUN_DIR, 2000); sun.target.position.copy(base); sun.target.updateMatrixWorld(); }
      updateTerrain(camPos);
      const hiD = ((P.treeHi || 2000) + 1000) * detailK, ch = Math.max(0, camPos.y - 300) * 0.8;
      for (const t of treeChunks) {
        const d = Math.hypot(t.x - camPos.x, t.z - camPos.z, ch), on = d < (treeDist + 1400) * (0.85 + 0.15 * detailK);
        t.mesh.visible = on && d < hiD; t.lo.visible = on && d >= hiD;
      }
      if (P.shadows) {
        const low = focusAgl === undefined || focusAgl < 900;
        if (low !== treeShadows) { treeShadows = low; for (const b of bldMeshes) b.castShadow = low; }
      }
    },
    dispose() {
      for (const o of owned) {
        scene.remove(o);
        o.traverse((c) => { if (c.geometry) c.geometry.dispose(); if (c.material) { if (c.material.map) c.material.map.dispose(); c.material.dispose(); } });
      }
      if (clouds) { scene.remove(clouds); clouds.geometry.dispose(); clouds.material.dispose(); }
      if (cloudMat) cloudMat.dispose();
      if (puff) puff.dispose();
      if (cloudTex) cloudTex.dispose();
      disposed = true; if (worker) worker.terminate();
      for (const ch of tChunks) for (const g of ch.geos) if (g) g.dispose();
      if (envTex) { envTex.dispose(); if (scene.environment === envTex) scene.environment = null; }
    },
  };
}

// ═════════════ Частицы: точки с альфой и размером (линейный цвет, туман) ═════════════
// В видеопамять заливается и рисуется только диапазон живых частиц; цвет — только после новых вспышек.
export function makeParticles(scene, N, additive, tex) {
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), alp = new Float32Array(N), siz = new Float32Array(N);
  const vel = new Float32Array(N * 3), life = new Float32Array(N), max = new Float32Array(N), a0 = new Float32Array(N),
        grow = new Float32Array(N), drag = new Float32Array(N), grav = new Float32Array(N);
  for (let i = 0; i < N; i++) pos[i * 3 + 1] = -99999;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('pcolor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alp, 1));
  geo.setAttribute('size', new THREE.BufferAttribute(siz, 1));
  for (const k of ['position', 'pcolor', 'alpha', 'size']) geo.attributes[k].setUsage(THREE.DynamicDrawUsage);
  geo.setDrawRange(0, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, scale: { value: 500 }, fogColor: { value: FOG_LIN }, fogDensity: FOG_U, glow: { value: additive ? 2.2 : 1 }, ...(additive ? {} : FXU) },
    defines: additive ? { ADDITIVE: 1 } : {},
    extensions: { fragDepth: true },
    vertexShader: `#include <common>
      #include <logdepthbuf_pars_vertex>
      attribute float alpha; attribute float size; attribute vec3 pcolor;
      uniform float scale; uniform float fogDensity; varying vec3 vC; varying float vA; varying float vF;
      ${additive ? '' : 'uniform float fxOn;'}
      void main() { vC = pow(pcolor, vec3(2.2)); vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); float d = -mv.z;
        vF = 1.0 - exp(-fogDensity * fogDensity * d * d);
        float ps = size * scale / d;
        ${additive ? '' : 'if (fxOn > 0.5) ps *= 0.5; // в проходе половинного разрешения пиксели вдвое крупнее'}
        gl_PointSize = (d > 0.0 && alpha > 0.0) ? min(ps, 400.0) : 0.0; gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `#include <common>
      #include <logdepthbuf_pars_fragment>
      uniform sampler2D map; uniform vec3 fogColor; uniform float glow; varying vec3 vC; varying float vA; varying float vF;
      ${additive ? '' : SOFT_GLSL}
      void main() {
        #include <logdepthbuf_fragment>
        float t = texture2D(map, gl_PointCoord).a;
        #ifndef ADDITIVE
          t *= fxSoft(8.0);
        #endif
        #ifdef ADDITIVE
          gl_FragColor = vec4(vC * glow, vA * t * (1.0 - vF));
        #else
          gl_FragColor = vec4(mix(vC, fogColor, vF), vA * t);
        #endif
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }`,
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const points = new THREE.Points(geo, mat); points.frustumCulled = false; scene.add(points);
  let head = 0, emitted = false, wasLive = false;
  const A = geo.attributes;
  const range = (attr, lo, n, k) => { attr.updateRange.offset = lo * k; attr.updateRange.count = n * k; attr.needsUpdate = true; };
  return {
    mat, points,
    emit(x, y, z, vx, vy, vz, r, g, b, a, s, gr, l, dr, gv) {
      const i = head = (head + 1) % N, i3 = i * 3;
      pos[i3] = x; pos[i3 + 1] = y; pos[i3 + 2] = z; vel[i3] = vx; vel[i3 + 1] = vy; vel[i3 + 2] = vz;
      col[i3] = r; col[i3 + 1] = g; col[i3 + 2] = b; a0[i] = alp[i] = a; siz[i] = s; grow[i] = gr; max[i] = life[i] = l; drag[i] = dr; grav[i] = gv;
      emitted = true;
    },
    update(dt) {
      let lo = N, hi = -1;
      for (let i = 0; i < N; i++) {
        if (life[i] <= 0) { if (alp[i] !== 0) { alp[i] = 0; if (i < lo) lo = i; hi = i; } continue; }
        const i3 = i * 3;
        life[i] -= dt;
        pos[i3] += vel[i3] * dt; pos[i3 + 1] += vel[i3 + 1] * dt; pos[i3 + 2] += vel[i3 + 2] * dt;
        const k = Math.max(0, 1 - drag[i] * dt); vel[i3] *= k; vel[i3 + 1] = vel[i3 + 1] * k + grav[i] * dt; vel[i3 + 2] *= k;
        siz[i] += grow[i] * dt;
        const f = Math.max(0, life[i] / max[i]); alp[i] = a0[i] * (additive ? f * f : f);
        if (i < lo) lo = i; hi = i;
      }
      if (hi < 0) { if (wasLive) { geo.setDrawRange(0, 0); wasLive = false; } return; }
      const n = hi - lo + 1;
      range(A.position, lo, n, 3); range(A.alpha, lo, n, 1); range(A.size, lo, n, 1);
      if (emitted) { range(A.pcolor, lo, n, 3); emitted = false; }
      geo.setDrawRange(lo, n); wasLive = true;
    },
    dispose() { scene.remove(points); geo.dispose(); mat.dispose(); },
  };
}
