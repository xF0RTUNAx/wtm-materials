// Шлейф ракет: факел и дымный след (2026-10-20, просьба Mark - «как в ПК-играх», по размеру и физике ракеты).
//  • Факел - запечённая раскадровка (tools/airdef-fx/plume-bake.py → fx/plume_flame.png: ядро, диски Маха, турбулентность),
//    плоскость вдоль оси ракеты, развёрнутая к камере вокруг оси; плюс свечение у среза сопла (видно и строго сзади).
//    Ширина - по соплу, длина - по режиму (стартовый / маршевый) и тяге; на высоте струя «недорасширена» - шире и длиннее.
//  • Дым - непрерывная лента по точкам траектории (не рвётся на любой скорости, в отличие от клубов-частиц): ширина
//    растёт как √возраста (турбулентная диффузия), лента сносится ветром и всплывает, тает к концу жизни; узор клубов -
//    запечённый бесшовный шум (fx/plume_smoke.png) с самозатенением. Освещение - небо и солнце сцены, туман - как у частиц.
//  • Тип двигателя (MOTOR): смесевое твёрдое топливо - густой белый дым; малодымное - лёгкая дымка; ПЗРК - тонкий серый;
//    НАР - плотный короткий; жидкостный (С-75, «Скад») - прозрачный рыжеватый (окислитель на азотной кислоте), факел
//    оранжевый; прямоточный («Куб», Х-31) - почти без дыма, факел слабый голубоватый; турбореактивный (крылатые) - дымки нет.
//    Густота и ширина дыма - от площади сечения (расход топлива ∝ r²), время жизни - от размера ракеты.
import { FOG_LIN, FOG_U, FXU, SOFT_GLSL } from '../drone/world.js?v=20261111b';

const url = (f) => new URL(`./fx/${f}`, import.meta.url).href;
const WEB = typeof document !== 'undefined' && !!document.createElement && typeof Image !== 'undefined'; // стенды Deno - без картинок
let flameTex = null, smokeTex = null;
function texs() { // текстуры - при первом факеле или ленте (не при импорте модуля)
  if (flameTex || !WEB) return; const L = new THREE.TextureLoader();
  flameTex = L.load(url('plume_flame.png')); smokeTex = L.load(url('plume_smoke.png')); smokeTex.wrapS = smokeTex.wrapT = THREE.RepeatWrapping; smokeTex.anisotropy = 4;
}

// a - плотность дыма у сопла, c - цвет дыма, w - ширина у сопла (× радиус), g - рост ширины (м/√с на 1 м радиуса + база),
// life - жизнь (с) = base + k·r, fl - факел: [r, g, b] оттенок, br - яркость, len - длина (× радиус) стартового / маршевого
// Жизнь ленты (Mark 2026-10-22): короче полёта ракеты - дальние участки следа тают, пока ракета летит; плотность падает и по мере расплывания (шейдер)
export const MOTOR = { // ширина у сопла и рост - по снимкам пусков: след С-300 сразу ≈ 4 м, через 10 с - 15-20 м; ПЗРК ≈ 1 м → 5 м
  solid: { a: 0.8, c: [0.9, 0.9, 0.88], w: 15, g: [1.2, 12], life: [6, 45], fl: [1, 0.78, 0.5], br: 1.0, len: [26, 13] },
  lowsmoke: { a: 0.32, c: [0.93, 0.93, 0.93], w: 11, g: [0.9, 9], life: [4, 22], fl: [1, 0.86, 0.68], br: 1.0, len: [22, 12] },
  manpads: { a: 0.75, c: [0.82, 0.82, 0.8], w: 24, g: [0.7, 14], life: [5, 30], fl: [1, 0.92, 0.8], br: 1.1, len: [20, 14] },
  rocket: { a: 0.55, c: [0.9, 0.9, 0.88], w: 5, g: [0.2, 6], life: [3, 25], fl: [1, 0.86, 0.6], br: 1.0, len: [14, 14] }, // НАР 70-80 мм (r ≈ 0,04): у сопла ≈ 0,2 м, за 2 с - ≈ 0,8 м (Mark 2026-10-22: всё ещё велик); факел ≈ 0,8 м
  atgm: { a: 0.42, c: [0.8, 0.8, 0.78], w: 14, g: [0.5, 9], life: [3, 20], fl: [1, 0.8, 0.55], br: 0.9, len: [12, 12] },
  liquid: { a: 0.16, c: [0.7, 0.54, 0.42], w: 9, g: [0.8, 7], life: [4, 14], fl: [1, 0.62, 0.38], br: 0.8, len: [20, 16] },
  ramjet: { a: 0.05, c: [0.86, 0.86, 0.86], w: 6, g: [0.5, 4], life: [2, 8], fl: [0.6, 0.72, 1], br: 0.35, len: [8, 8] },
  jet: { a: 0.05, c: [0.62, 0.62, 0.62], w: 5, g: [0.3, 3], life: [2, 6], fl: [1, 0.7, 0.45], br: 0.35, len: [5, 5] },
  flare: { a: 0.5, c: [0.96, 0.96, 0.95], w: 1.2, g: [0.45, 0], life: [3.5, 0], fl: [1, 0.9, 0.7], br: 0.5, len: [1, 1], ramp: 0.1 }, // ЛТЦ (магний): густой белый дым, лента ≈ 1 м, живёт ≈ 3,5 с, густеет за 0,1 с - под гаснущим хвостом пламени (0,4 с давали разрыв в десятки метров - Mark) (cmfx.js; r = 0,5)
};
// по ключу комплекса / оружия (что не указано - по виду: ракета ЗРК и УР «воздух - земля» - смесевое твёрдое)
const BY_KEY = {
  strela2: 'manpads', strela3: 'manpads', igla: 'manpads', iglas: 'manpads', verba: 'manpads', stinger: 'manpads', redeye: 'manpads', mistral: 'manpads', starstreak: 'manpads', aam_stinger: 'manpads',
  sampt: 'lowsmoke', iris: 'lowsmoke', nasams: 'lowsmoke', camm: 'lowsmoke', pac3: 'lowsmoke', bukm3: 'lowsmoke', s400: 'lowsmoke',
  w_kh31: 'ramjet', kh31: 'ramjet', kh31p: 'ramjet', agm88: 'lowsmoke', aargm: 'lowsmoke', hellfire: 'atgm', shturm: 'atgm', ataka: 'atgm', tow: 'atgm',
  s8: 'rocket', hydra: 'rocket', s5: 'rocket', s13: 'rocket', scud: 'liquid', r17: 'liquid', lance: 'liquid', // Lance - жидкостный двигатель; PrSM и ARRW - твёрдое топливо (по умолчанию)
  kh28: 'liquid', mald: 'jet', decoy_e: 'jet', // Х-28 - ЖРД (азотнокислотный окислитель: рыжеватый); MALD и восточная ложная цель - турбореактивные (2026-11-01: были «смесевые» с густым дымом)
};
// sustain - маршевый режим после стартового: у С-75 маршевый двигатель жидкостный, у «Куба» - прямоточный
const SUSTAIN = { s75: 'liquid', kub: 'ramjet', kvadrat: 'ramjet', w_kh31: 'ramjet', kh31: 'ramjet', kh31p: 'ramjet' };
export function motorOf(key, kind, sustain) {
  if (sustain && SUSTAIN[key]) return MOTOR[SUSTAIN[key]];
  return MOTOR[BY_KEY[key] || (kind === 'cruise' ? 'jet' : kind === 'rocket' ? 'rocket' : 'solid')];
}
const air = (y) => Math.exp(-Math.max(0, y) / 8500); // плотность воздуха на высоте (доля от земли)

// ═════════════ Факел ═════════════
// плоскость: x - поперёк (−0,5…0,5), z - от среза сопла (0) к хвосту (1); в шейдере разворачивается к камере вокруг оси z
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
    vFace = 1.0 - smoothstep(0.8, 0.98, abs(dot(normalize(ax), normalize(base)))); // вдоль оси (камера сзади/спереди) - плоскость гаснет, светит сопло
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
    vec4 t = texture2D(map, (cell + vec2(vUv.x, vUv.y)) / 4.0);   // uv.y: 1 у сопла (z = 0) - кадр сверху вниз
    gl_FragColor = vec4(t.rgb * tint * br * 2.0 * vFace, t.a * br * vFace);
    #include <tonemapping_fragment>
    #include <encodings_fragment>
  }`;
// ═════════════ Факел по подобию War Thunder ═════════════
// Mark 2026-11-01 (снимок пуска С-125 в WT): не тонкая игла, а полное пламя - у среза сопла узкое белое ядро, дальше струя расширяется
// (≈ вдвое шире корпуса) и остывает: персиково-оранжевая, рваные края текут к хвосту; к хвосту горячие газы становятся дымом -
// полупрозрачная дымка цвета дыма, подсвеченная огнём, из неё и начинается след (клубы и лента у сопла узкие и расходятся за ≈ 2 длины
// факела - puffTo, SM_V). Процедурно (шум в шейдере), смешение с предумноженной альфой: огонь светит, дымка заслоняет. ?wtf=0 - прежний (раскадровка).
const WTF = !(typeof location !== 'undefined' && location && /[?&]wtf=0/.test(location.search || ''));
const FRAME = { value: 0 }, FL_LIGHT = { value: new THREE.Vector3(0.9, 0.9, 0.9) };
const FW_V = `#include <common>
  #include <logdepthbuf_pars_vertex>
  uniform float fogDensity;
  varying vec2 vUv; varying float vFace, vF;
  void main() {
    vUv = uv;
    vec3 ax = (modelViewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz;
    vec3 base = (modelViewMatrix * vec4(0.0, 0.0, position.z, 1.0)).xyz;
    float wid = length((modelViewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
    vec3 side = normalize(cross(normalize(ax), normalize(base)));
    vFace = 1.0 - smoothstep(0.8, 0.98, abs(dot(normalize(ax), normalize(base))));
    vec4 mv = vec4(base + side * position.x * wid, 1.0);
    vF = 1.0 - exp(-fogDensity * fogDensity * mv.z * mv.z);
    gl_Position = projectionMatrix * mv;
    #include <logdepthbuf_vertex>
  }`;
// s - от среза сопла (0) к концу факела (1), x - поперёк (−1…1); heat - длина белого ядра (стартовый режим - длиннее)
const FW_F = `#include <common>
  #include <logdepthbuf_pars_fragment>
  uniform vec3 tint, smokeC, uLight, fogColor; uniform float br, frame, smokeA, heat;
  varying vec2 vUv; varying float vFace, vF;
  float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
  void main() {
    #include <logdepthbuf_fragment>
    float s = 1.0 - vUv.y, x = vUv.x * 2.0 - 1.0, t = frame / 30.0;
    float n = vn(vec2(x * 2.5, s * 5.0 - t * 14.0)) * 0.6 + vn(vec2(x * 6.0 + 3.1, s * 13.0 - t * 31.0)) * 0.4; // турбулентность течёт к хвосту
    float R = mix(0.34, 0.8, smoothstep(0.0, 0.42, s)) * (1.0 - 0.3 * smoothstep(0.5, 1.0, s));                 // у сопла - по срезу, дальше вдвое шире
    float d = abs(x) / R + (n - 0.5) * (0.15 + 0.6 * s);                                                          // края рваные, дальше от сопла - сильнее
    float core = exp(-d * d * 5.0) * exp(-s * s * 18.0 / heat);
    float body = exp(-d * d * 1.8) * (1.0 - smoothstep(0.05, 0.75, s + (n - 0.5) * 0.25));
    float fl = 0.9 + 0.2 * vn(vec2(t * 23.0, 1.7));                                                               // мерцание
    vec3 bc = tint * mix(vec3(1.0, 0.6, 0.32), vec3(1.0, 0.42, 0.2), smoothstep(0.0, 0.6, s));                  // остывая - от жёлто-персикового к оранжевому
    vec3 E = (vec3(1.0, 0.96, 0.88) * core * 1.9 + bc * body * 0.95) * br * fl;
    float ab = body * 0.85 * (1.0 - core);                                                                        // тело пламени чуть заслоняет фон - цвет читается и на светлом небе
    // горячие газы остывают в дым: дымка с середины факела, у огня подсвечена им, дальше - дым под светом неба
    float hs = smoothstep(0.3, 0.7, s) * (1.0 - smoothstep(0.82, 1.0, s)) * exp(-d * d * 1.1) * smoothstep(0.15, 0.65, n);
    float a = clamp(smokeA * hs, 0.0, 0.85);
    vec3 sc = mix(tint * vec3(1.0, 0.6, 0.38) * 1.4 * br, smokeC * uLight, smoothstep(0.35, 0.95, s));
    sc = mix(sc, fogColor, vF);
    float k = vFace * (1.0 - smoothstep(0.8, 1.0, abs(x)));
    gl_FragColor = vec4((E + sc * a) * k, clamp(max(a, ab), 0.0, 0.85) * k);
    #include <tonemapping_fragment>
    #include <encodings_fragment>
  }`;
const wtMats = new Map();
function wtMat(m, k) {
  let A = wtMats.get(m); if (!A) wtMats.set(m, A = []); if (A[k]) return A[k];
  return (A[k] = new THREE.ShaderMaterial({
    uniforms: { tint: { value: new THREE.Color(...m.fl) }, smokeC: { value: new THREE.Color(...m.c) }, br: { value: m.br }, frame: FRAME, smokeA: { value: Math.min(1, m.a) }, heat: { value: k > 1 ? 1.3 : 0.9 },
      uLight: FL_LIGHT, fogColor: { value: FOG_LIN }, fogDensity: FOG_U },
    vertexShader: FW_V, fragmentShader: FW_F, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  }));
}
const flameMats = new Map();
function flameMat(m) {
  let M = flameMats.get(m); if (M) return M;
  texs();
  M = new THREE.ShaderMaterial({ uniforms: { map: { value: flameTex }, tint: { value: new THREE.Color(...m.fl) }, br: { value: m.br }, frame: { value: 0 } },
    vertexShader: FL_V, fragmentShader: FL_F, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  flameMats.set(m, M); return M;
}
let glowTex = null; // свечение у сопла - создаётся при первом факеле (в браузере; стенды Deno без canvas)
const mkGlow = () => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,230,180,.55)'); g.addColorStop(1, 'rgba(255,160,60,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); };
let frameT = 0, flameLayer = 0, live = null; // live - дымные ленты (createPlumes): свежий конец ленты привязывается к срезу сопла каждый кадр
const WP = new THREE.Vector3();
// слой факела: при дыме в половине разрешения - проход огня (рисуется после дыма - дым у сопла не закрывает факел)
export function setFlameLayer(l) { flameLayer = l; }
export function flameTick(dt) { frameT += dt * 30; FRAME.value = frameT; for (const M of flameMats.values()) M.uniforms.frame.value = frameT; } // 30 кадров/с, у каждой ракеты свой сдвиг - в uv нет, поэтому сдвиг - масштабом мерцания
// факел на ракете: group - модель (+Z к хвосту), z - срез сопла, r - радиус корпуса, motor - MOTOR.*
export function makeFlame(group, z, r, motor = MOTOR.solid) {
  const mesh = new THREE.Mesh(flameGeo, WTF ? wtMat(motor, 2) : flameMat(motor)); mesh.position.z = z; mesh.renderOrder = 5; mesh.frustumCulled = false; mesh.userData.fx = true;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex || (glowTex = WEB ? mkGlow() : null), color: new THREE.Color(...motor.fl), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
  glow.position.z = z; glow.renderOrder = 5; glow.userData.fx = true; group.add(mesh); group.add(glow);
  mesh.visible = glow.visible = false; // до запуска двигателя не видно (ракета на пилоне - без свечения)
  if (flameLayer) { mesh.layers.set(flameLayer); glow.layers.set(flameLayer); }
  let mot = motor, t0 = 0;
  return {
    // k: 0 - двигатель не работает, 1 - маршевый, 2 - стартовый; rr - радиус сопла; y - высота (на высоте струя шире и длиннее)
    owner: null, // ключ дымной ленты (ракета ЗРК / оружие): пока факел горит, конец ленты - в срезе сопла, а не в последней точке следа (на 600 м/с точки - через 24 м)
    set(k, rr = r, y = 0) {
      const was = mesh.visible; mesh.visible = glow.visible = k > 0;
      if (!k) { if (was && this.owner && live) live.finish(this.owner); return; }
      // розжиг (Mark 2026-10-22): струя не сразу во всю длину - за ≈ 0,35 с (быстро в начале), свечение у сопла - с первого кадра, но меньше
      if (!was) { t0 = frameT; if (IGN) { group.updateMatrixWorld(true); mesh.getWorldPosition(WP); AX.set(0, 0, 1).transformDirection(group.matrixWorld); IGN(WP, AX, rr, mot, k, y); } } // розжиг: вспышка и выхлоп
      const x = Math.min(1, (frameT - t0) / 30 / 0.35), ig = 1 - (1 - x) * (1 - x);
      if (WTF) { const M = wtMat(mot, k > 1 ? 2 : 1); if (mesh.material !== M) mesh.material = M; } // стартовый / маршевый - своя длина ядра
      const e = 1 - air(y), f = 0.9 + Math.random() * 0.2, w = rr * (WTF ? (k > 1 ? 6.4 : 5.0) : k > 1 ? 3.2 : 2.4) * (1 + 1.6 * e) * (0.45 + 0.55 * ig), L = rr * mot.len[k > 1 ? 0 : 1] * 1.5 * (1 + 0.8 * e) * f * (0.12 + 0.88 * ig);
      mesh.scale.set(w, 1, L); glow.scale.setScalar(rr * (k > 1 ? 5 : 3.6) * (1 + e) * (0.9 + Math.random() * 0.2) * (0.5 + 0.5 * ig)); glow.material.opacity = Math.min(0.8, 0.4 * mot.br + 0.1) * (0.6 + 0.4 * ig);
      if (this.owner && live) { group.updateMatrixWorld(true); mesh.getWorldPosition(WP); live.tip(this.owner, WP.x, WP.y, WP.z); }
    },
    motor(m) { if (m === mot) return; mot = m; mesh.material = WTF ? wtMat(m, 1) : flameMat(m); glow.material.color.setRGB(...m.fl); },
    move(z2) { mesh.position.z = glow.position.z = z2; },
    at(x, y, z) { mesh.position.set(x, y, z); glow.position.set(x, y, z); },
  };
}

// ═════════════ Клубы вдоль следа ═════════════
// Mark 2026-11-01 - «шлейфы по подобию War Thunder»: у них след - не гладкая полоса, а бугристые клубы с освещённым верхом и тенью снизу.
// Поверх ленты - клубы из Blender (puffs.js, лист ex_puff: свет, самозатенение, рваный край) через шаг ≈ ширины следа; лента остаётся
// сердцевиной у сопла и связкой между клубами. Вдали от камеры шаг реже (до ×5). Только дымные двигатели (густота ≥ PUFF_MIN). ?wts=0 - как было.
let PUF = null, PCAM = null;
export function setTrailPuffs(pf) { PUF = pf; }
export function setPuffCam(cam) { PCAM = cam; }
export const trailPuffsOn = () => !!(PUF && PUF.ready);
export const PUFF_MIN = 0.15; // клубы - у двигателей с густотой дыма от этой: смесевые, ПЗРК, НАР, ПТУР, малодымные - едва заметной дымкой, жидкостные (С-75 марш, Х-28, Р-17, Lance) - редкой рыжеватой (2026-11-01: лента у них читалась полосой с прямыми краями); прямоточные и реактивные - лентой
// вспышка запуска двигателя (units-render.js: огонь и клубы выхлопа по калибру) - зовёт факел при розжиге
let IGN = null; export function setIgnition(fn) { IGN = fn; }
const AX = new THREE.Vector3();

// ═════════════ Дымная лента ═════════════
const SM_V = `#include <common>
  #include <logdepthbuf_pars_vertex>
  attribute vec3 aTan; attribute vec4 aA; attribute vec4 aB; attribute vec3 aCol; attribute float aSeed, aRamp;
  uniform float uTime; uniform vec3 uWind, uSun; uniform float fogDensity;
  varying vec2 vUv; varying float vAl, vF, vAge, vSh; varying vec3 vCol;
  void main() {
    float age = max(0.0, uTime - aA.x), life = aB.y, f = clamp(age / life, 0.0, 1.0);
    vec3 p = position + uWind * age + vec3(0.0, aB.w * age, 0.0);          // снос ветром и всплытие тёплого дыма
    // grow - клубы и изгиб: немного с первых мгновений (иначе молодая лента - ровная полоса с прямыми краями, Mark 2026-10-22)
    float u = aB.z, sg = aSeed * 6.283, grow = 0.3 + 0.7 * smoothstep(0.0, 2.5, age);
    // начало следа (точка пуска / отстрела) - не квадратный срез: первые ≈ 5 ширин лента сужается и проявляется
    float st = smoothstep(0.0, max(aA.z * 5.0, 3.0), u);
    float w = (aA.z + aB.x * sqrt(age)) * (0.35 + 0.65 * st);                // турбулентная диффузия: ширина ∝ √t
    ${WTF ? 'if (aRamp < 0.05) w *= mix(0.3, 1.0, 1.0 - exp(-age / max(aRamp * 4.0, 0.02)));' : ''} // из факела след выходит узким и расходится (как в War Thunder; у ЛТЦ свой набор - нет)
    w *= 1.0 + grow * (0.28 * sin(u * 0.9 / max(aA.z, 0.5) + sg) + 0.18 * sin(u * 0.37 / max(aA.z, 0.5) + 2.0 * sg)); // «клубы» по длине
    vec3 vd = normalize(cameraPosition - p), sd = cross(normalize(aTan), vd); float sl = length(sd);
    vec3 sn = sl > 1e-4 ? sd / sl : vec3(0.0, 1.0, 0.0);
    p += sn * grow * w * (0.22 * sin(u * 0.045 + sg + age * 0.15) + 0.12 * sin(u * 0.13 + 3.0 * sg)); // лента изгибается - турбулентность
    p += sn * aA.y * w * 0.5; vSh = dot(sn * aA.y, uSun);                 // край ленты к солнцу - освещённый
    vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
    float d = -mv.z; vF = 1.0 - exp(-fogDensity * fogDensity * d * d);
    // у сопла дым появляется не сразу (горячие газы прозрачны: aRamp - время, за которое ракета уходит от факела), к концу жизни тает; лента «ребром» к камере - бледнее (клубы-частицы её дополняют)
    // расплываясь, дым редеет: после первой секунды плотность ∝ (ширина в 1 с / ширина сейчас)^0,6 - дальние участки следа тают постепенно
    float dil = pow(clamp((aA.z + aB.x) / (aA.z + aB.x * sqrt(max(age, 1.0))), 0.0, 1.0), 0.6);
    vAl = aA.w * smoothstep(0.0, aRamp, age) * pow(1.0 - f, 1.4) * dil * st * mix(0.35, 1.0, smoothstep(0.08, 0.5, sl));
    float wt = aA.z + aB.x * sqrt(max(age, 0.15));                            // масштаб узора по длине: у сопла не растёт (иначе u·dw/w² при больших u рвёт текстуру в гребёнку)
    vUv = vec2(u / max(wt, 0.6) * 0.42 + aSeed * 7.0, aA.y * 0.5 + 0.5); vAge = age; vCol = aCol;
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
    float edge = exp(-v * v * 1.5625); // не pow(v·1,25, 2): от отрицательного - NaN на части видеокарт
    float cl = smoothstep(0.1, 0.7, dens * (0.55 + 0.75 * edge) + 0.25 * edge - 0.1);   // рваный силуэт клубов
    float a = vAl * cl * (0.55 + 0.45 * edge) * fxSoft(6.0);
    if (a < 0.004) discard;
    vec3 c = vCol * uLight * mix(0.58, 1.08, t.r) * (0.86 + 0.22 * vSh * (1.0 - 0.5 * edge));
    gl_FragColor = vec4(mix(c, fogColor, vF), clamp(a, 0.0, 1.0));
    #include <tonemapping_fragment>
    #include <encodings_fragment>
  }`;
let P_FXLO = false; // пресет телефона: клубов следа вдвое реже (createPlumes P.fxLo)
export function createPlumes(scene, P = {}) {
  P_FXLO = !!P.fxLo;
  texs();
  const MAXV = P.fxLo ? 8000 : 20000, MAXP = 260, NP = MAXV >> 1; // NP - пар вершин (пара = два края ленты в одной точке следа)
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(MAXV * 3), tan = new Float32Array(MAXV * 3), A = new Float32Array(MAXV * 4), B = new Float32Array(MAXV * 4), C = new Float32Array(MAXV * 3);
  const idx = new Uint32Array(MAXV * 3);
  const at = (n, a, s) => { const b = new THREE.BufferAttribute(a, s); b.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(n, b); return b; };
  const SD = new Float32Array(MAXV), RP = new Float32Array(MAXV); const aPos = at('position', pos, 3), aTan = at('aTan', tan, 3), aA = at('aA', A, 4), aB = at('aB', B, 4), aC = at('aCol', C, 3), aS = at('aSeed', SD, 1), aR = at('aRamp', RP, 1);
  const ATTRS = [aPos, aTan, aA, aB, aC, aS, aR];
  geo.setIndex(new THREE.BufferAttribute(idx, 1)); geo.index.setUsage(THREE.DynamicDrawUsage); geo.setDrawRange(0, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: smokeTex }, uTime: { value: 0 }, uWind: { value: new THREE.Vector3(2, 0, 1) }, uLight: { value: new THREE.Vector3(0.9, 0.9, 0.9) }, uSun: { value: new THREE.Vector3(0.4, 0.8, 0.4).normalize() }, fogColor: { value: FOG_LIN }, fogDensity: FOG_U, ...FXU },
    vertexShader: SM_V, fragmentShader: SM_F, transparent: true, depthWrite: false, side: THREE.DoubleSide, extensions: { fragDepth: true },
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 2; scene.add(mesh);
  const trails = new Map(); let time = 0;
  // Вершины ленты пишутся один раз (2026-10-23, нагрузка на процессор): пара вершин живёт в «слоте» общего пула (вершины 2s и 2s+1), у ленты - список слотов по порядку вдоль следа.
  // Звено между двумя точками следа (его нарезка) пишется, когда появилась следующая точка; каждый кадр перезаписывается только хвост - от последней точки до факела.
  // Старые точки не трогаем: шейдер старит их по uTime − t; уйдя, звено возвращает слоты в пул. На видеокарту уходит один диапазон слотов (всё, что менялось с прошлой отрисовки).
  const freeS = new Int32Array(NP); let nFree = 0, bump = 0;
  const take = () => nFree ? freeS[--nFree] : bump < NP ? bump++ : -1;
  const give = (s) => { freeS[nFree++] = s; };
  let dmin = NP, dmax = -1, amin = NP, amax = -1, prevII = 0; // d - слоты, записанные в этом кадре; a - не ушедшие на видеокарту (кадр бывает без отрисовки ленты)
  mesh.onBeforeRender = () => { amin = NP; amax = -1; }; // после этого вызова three отправляет буферы по updateRange, выставленному в update()
  const mark = (s) => { if (s < dmin) dmin = s; if (s > dmax) dmax = s; };
  const TQ = { x: 0, y: 0, z: 0, t: 0, w: 0, g: 0, life: 0, a: 0, rise: 0, u: 0, ramp: 0, c: null }; // конец ленты у факела (на лету, не точка следа)
  const SEGS = [];
  // клубы от прошлого места выпуска до сопла (x, y, z): шаг ≈ ширины следа у сопла, вдали - реже; разброс поперёк - четверть ширины, снос - ветер
  // и всплытие, как у ленты. Зовут и точка следа (add), и факел каждый кадр (tip): клубы идут от самого среза - дым не отстаёт от огня
  // (Mark 2026-11-01; точки следа - раз в 0,02-0,08 с, на скорости это 10-40 м за соплом). P - точка следа (ширина, рост, всплытие, tau)
  const puffTo = (T, x, y, z, P, m, al, life) => { // al, life - плотность и жизнь следа без укорота ленты
    const c = T.pc; if (!c) { T.pc = { x, y, z, t: time }; return; }
    const ax = c.x, ay = c.y, az = c.z, at = c.t; c.x = x; c.y = y; c.z = z; c.t = time;
    const D = Math.hypot(x - ax, y - ay, z - az); if (D < 1e-3) return;
    const cd = PCAM ? Math.hypot(x - PCAM.position.x, y - PCAM.position.y, z - PCAM.position.z) : 600;
    const step = (P.step || Math.max(1.5, P.w * 0.4)) * Math.min(5, Math.max(1, cd / 800)), wv = mat.uniforms.uWind.value, j = P.w * 0.25; // клубы перекрываются - след сплошной; вдали - реже
    // из факела клуб выходит узким (≈ ширина конца факела) и за τ (≈ 2 длины факела пути ракеты) раздаётся до ширины следа; возраст - с момента, когда ракета была в этой точке
    const S = P.w * 1.35, nr = WTF ? Math.min(0.8, Math.max(0.15, 3.6 / m.w)) : 1, dtp = time - at;
    T.pd = (T.pd || 0) + D;
    for (let n = 0; T.pd >= step && n < 24; n++) {
      T.pd -= step; const f = 1 - T.pd / D;
      PUF.emit(ax + (x - ax) * f + (Math.random() - 0.5) * j, ay + (y - ay) * f + (Math.random() - 0.5) * j, az + (z - az) * f + (Math.random() - 0.5) * j,
        wv.x + (Math.random() - 0.5) * 0.6, P.rise + (Math.random() - 0.5) * 0.4, wv.z + (Math.random() - 0.5) * 0.6, m.c[0], m.c[1], m.c[2],
        Math.min(1, al * 0.9), S * nr, P.g * 1.2, life * 0.95, 0, 0, 0.06, S * (1 - nr), P.tau || 0.3, (1 - f) * dtp); // размер и рост - как у ленты: w + g·√t (пул клубов следа - sqrtGrow)
    }
  };
  // точки следа редкие (0,03-0,08 с: на 600 м/с - 24 м) - между ними лента режется на короткие звенья (узор клубов и изгиб считаются по вершинам)
  const seg = (a, b) => { const D = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z); return D > 1e-4 ? Math.min(40, Math.ceil(D / Math.min(10, Math.max(1.5, 1.5 * a.w)))) : 1; };
  const wr = (s, x, y, z, t, w, g, life, al, rise, u, ramp, c, sd) => {
    mark(s);
    for (let e = 0; e < 2; e++) {
      const v = s * 2 + e, o = v * 3, o4 = v * 4;
      pos[o] = x; pos[o + 1] = y; pos[o + 2] = z; C[o] = c[0]; C[o + 1] = c[1]; C[o + 2] = c[2];
      SD[v] = sd; RP[v] = ramp; A[o4] = t; A[o4 + 1] = e ? 1 : -1; A[o4 + 2] = w; A[o4 + 3] = al; B[o4] = g; B[o4 + 1] = life; B[o4 + 2] = u; B[o4 + 3] = rise;
    }
  };
  const put = (s, q, fade, sd) => wr(s, q.x, q.y, q.z, q.t, q.w, q.g, q.life, q.a * fade, q.rise, q.u, q.ramp, q.c, sd);
  const putL = (s, a, b, f, sd) => // звено между точками: поля точки (x, y, z, t, w, g, life, a, rise, u, ramp) - линейно, цвет - от начала
    wr(s, a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f, a.t + (b.t - a.t) * f, a.w + (b.w - a.w) * f, a.g + (b.g - a.g) * f,
    a.life + (b.life - a.life) * f, a.a + (b.a - a.a) * f, a.rise + (b.rise - a.rise) * f, a.u + (b.u - a.u) * f, a.ramp + (b.ramp - a.ramp) * f, a.c, sd);
  // касательная пары k (по порядку вдоль ленты) - по соседним парам; у краёв ленты - односторонняя
  const tangent = (T, k, total) => {
    const vp = T.vp, h = T.h, s = vp[h + k], a = vp[h + (k > 0 ? k - 1 : 0)] * 2, b = vp[h + (k < total - 1 ? k + 1 : total - 1)] * 2;
    let tx = pos[b * 3] - pos[a * 3], ty = pos[b * 3 + 1] - pos[a * 3 + 1], tz = pos[b * 3 + 2] - pos[a * 3 + 2]; if (tx * tx + ty * ty + tz * tz < 1e-8) { tx = 0; ty = 0; tz = 1; }
    mark(s); for (let e = 0; e < 2; e++) { const o = (s * 2 + e) * 3; tan[o] = tx; tan[o + 1] = ty; tan[o + 2] = tz; }
  };
  const emit = (T, n, ii) => { const vp = T.vp, h = T.h; for (let i = 0; i < n - 1; i++) { const a = vp[h + i] * 2, b = vp[h + i + 1] * 2; idx[ii++] = a; idx[ii++] = a + 1; idx[ii++] = b; idx[ii++] = a + 1; idx[ii++] = b + 1; idx[ii++] = b; } return ii; };
  const freeAll = (T) => { for (let i = T.vp.length - 1; i >= T.h; i--) give(T.vp[i]); T.vp = []; T.h = 0; T.runs = []; T.rh = 0; T.built = 0; T.pl = 0; T.tot = 0; };
  const api = {
    mesh, mat,
    // точка следа у среза сопла: obj - ракета (ключ ленты), m - MOTOR.*, r - радиус корпуса, y - высота
    add(obj, x, y, z, m, r) {
      if (!m || m.a < 0.02) return;
      let T = trails.get(obj);
      if (!T) { T = { pts: [], end: 0, seed: Math.random(), tip: null, vp: [], h: 0, runs: [], rh: 0, built: 0, pl: 0, tot: 0, rebuild: false, hfix: false }; trails.set(obj, T); } // vp - слоты пар вдоль ленты (с h), runs - число пар в звене каждой записанной точки (с rh), pl - пар в записанных звеньях, tot - пар, что можно рисовать
      const L = T.pts[T.pts.length - 1];
      if (L && time - L.t < 0.02) return;
      const e = 1 - air(y), rr = Math.max(0.03, r), dt = L ? time - L.t : 0, sp = L && dt > 1e-3 ? Math.hypot(x - L.x, y - L.y, z - L.z) / dt : 0;
      // дым начинается сразу за факелом: время, за которое ракета проходит длину факела (на 600 м/с - десятки мм, на 100 м/с - до 0,035 с)
      const ramp = m.ramp || (sp > 5 ? Math.min(0.035, Math.max(0.004, rr * m.len[0] * 1.2 / sp)) : 0.035); // m.ramp - свой набор плотности (ЛТЦ: дым густеет за хвостом пламени)
      const p = { x, y, z, t: time, w: Math.max(0.15, rr * m.w) * (1 + 1.2 * e), g: (m.g[0] + rr * m.g[1]) * (1 + 0.6 * e), life: (m.life[0] + rr * m.life[1]) * (0.7 + 0.3 * (1 - e)),
        a: Math.min(1, m.a * Math.min(1.2, 0.8 + rr * 2)) * (1 - 0.45 * e), rise: 0.25 + rr * 1.5, c: m.c, u: L ? L.u + Math.hypot(x - L.x, y - L.y, z - L.z) : 0, ramp,
        tau: sp > 5 ? Math.min(0.6, Math.max(0.04, rr * m.len[0] * 3 / sp)) : 0.6 }; // tau - за сколько клуб у сопла раздаётся до ширины следа (puffTo)
      // с клубами лента - только у сопла (≈ 30 м за срезом: на 1 км/с - 0,03 с, на 100 м/с - 0,3 с): сердцевина, пока клубы проявляются;
      // дальше след - одни клубы (Mark: шире клубов лента читалась вблизи полупрозрачной «подложкой»)
      // клубов на след - не больше 120 в секунду (на телефоне 60; ревью 2026-11-02: залп НАР на 700 м/с давал сотни клубов в секунду на ракету - пул переполнялся,
      // хвосты следов пропадали, телефон грелся): шаг ≥ скорость / темп. Тонкий быстрый след (НАР, ПЗРК на скорости), где клубы шли бы точками, - только лентой;
      // клубы реже своей ширины - лента остаётся сердцевиной. ЛТЦ (свой набор m.ramp) - своей лентой, как выверено с Mark
      const S = p.w * 1.35; p.step = Math.max(1.5, p.w * 0.4, sp / (P_FXLO ? 60 : 120));
      const pu = PUF && PUF.ready && m.a >= PUFF_MIN && !m.ramp && p.step <= S * 2.5, pa = p.a, pl = p.life; if (pu) { p.a *= 0.85; p.life = Math.min(p.life, Math.max(0.06, Math.min(0.4, 30 / Math.max(sp, 1)))); }
      T.noRib = pu && WTF && p.step < S * 1.2; // факел War Thunder: клубы идут от самого среза сопла (puffTo из tip) - ленты нет (вблизи её прямые края читались «подложкой»)
      T.pts.push(p); T.end = Math.max(T.end, time + p.life); T.tip = null;
      if (pu) { T.pp = p; T.pm = m; T.qa = pa; T.ql = pl; puffTo(T, x, y, z, p, m, pa, pl); } T.pu = pu;
      if (T.pts.length > MAXP) { const o = T.pts; T.pts = o.filter((q, i) => i >= o.length / 2 || i % 2 === 0); T.rebuild = true; } // длинная лента - старая половина реже (звенья перенарезаются)
    },
    // свежий конец ленты - в срезе сопла прямо сейчас (зовёт факел каждый кадр); между точками следа (до 24 м при 600 м/с) лента тянется к нему
    tip(obj, x, y, z) {
      const T = trails.get(obj); if (!T || !T.pts.length) return;
      if (!T.tip) T.tip = { x, y, z, t: time }; else { T.tip.x = x; T.tip.y = y; T.tip.z = z; T.tip.t = time; }
      if (T.pu && PUF && PUF.ready) puffTo(T, x, y, z, T.pp, T.pm, T.qa, T.ql); // клубы - до самого среза сопла
    },
    // двигатель выгорел: последний конец ленты - постоянная точка (лента кончается у сопла в момент выгорания)
    finish(obj) {
      const T = trails.get(obj); if (!T || !T.tip) return;
      const L = T.pts[T.pts.length - 1], k = T.tip; T.tip = null; if (!L) return;
      T.pts.push({ ...L, x: k.x, y: k.y, z: k.z, t: k.t, u: L.u + Math.hypot(k.x - L.x, k.y - L.y, k.z - L.z) });
    },
    clear() { trails.clear(); nFree = 0; bump = 0; amin = NP; amax = -1; geo.setDrawRange(0, 0); },
    update(dt, light, wind, sun) {
      time += dt; mat.uniforms.uTime.value = time; if (light) { mat.uniforms.uLight.value.copy(light); FL_LIGHT.value.copy(light); } if (sun) mat.uniforms.uSun.value.copy(sun); if (wind) mat.uniforms.uWind.value.set(wind.x, 0, wind.z); // дымка в факеле - под тем же светом
      let ii = 0; dmin = NP; dmax = -1;
      for (const [k, T] of trails) {
        if (time > T.end) { freeAll(T); trails.delete(k); continue; }
        const p = T.pts;
        if (T.rebuild) { freeAll(T); T.rebuild = false; T.hfix = false; }
        while (p.length > 2 && time - p[0].t > p[0].life && time - p[1].t > p[1].life) {
          p.shift();
          if (T.built > 0) { // звено старейшей точки ушло: слоты - в пул; новая первая пара - край ленты (касательная односторонняя)
            const n = T.runs[T.rh++]; for (let i = n - 1; i >= 0; i--) give(T.vp[T.h + i]); T.h += n; T.pl -= n; T.tot = Math.max(0, T.tot - n); T.built--; T.hfix = true;
            if (T.rh > 32) { T.runs.splice(0, T.rh); T.rh = 0; } if (T.h > 128) { T.vp.splice(0, T.h); T.h = 0; }
          }
        }
        if (T.noRib) { if (T.tip && time - T.tip.t > 0.1) T.tip = null; continue; } // без ленты: только точки следа (жизнь ленты, клубы)
        if (T.tip && time - T.tip.t > 0.1) T.tip = null; // факел погас без finish (ракета сбита, пропала)
        const m = p.length, L = p[m - 1]; if (!L) continue;
        const tip = T.tip; if (m + (tip ? 1 : 0) < 2) continue;
        if (tip) { TQ.x = tip.x; TQ.y = tip.y; TQ.z = tip.z; TQ.t = time; TQ.w = L.w; TQ.g = L.g; TQ.life = L.life; TQ.a = L.a; TQ.rise = L.rise; TQ.ramp = L.ramp; TQ.c = L.c; TQ.u = L.u + Math.hypot(tip.x - L.x, tip.y - L.y, tip.z - L.z); }
        // ждущие звенья: от записанных до предпоследней точки; хвост - звено последней точки до факела (или одна пара с нулевой плотностью)
        let add = 0, nw = 0; for (let i = T.built; i < m - 1; i++) { const n = seg(p[i], p[i + 1]); SEGS[nw++] = n; add += n; }
        const nt = tip ? seg(L, TQ) + 1 : 1, pl = T.pl, total = pl + add + nt, vp = T.vp, have = vp.length - T.h;
        if (total > have && total - have > nFree + NP - bump) { ii = emit(T, T.tot, ii); continue; } // не хватает места в пуле: лента не растёт, рисуется как была (пока слоты не освободятся)
        while (vp.length - T.h < total) vp.push(take());
        while (vp.length - T.h > total) give(vp.pop());
        const h = T.h, sd = T.seed; let q = pl;
        for (let i = T.built, r = 0; i < m - 1; i++, r++) {
          const a = p[i], b = p[i + 1], n = SEGS[r];
          put(vp[h + q++], a, 1, sd);
          for (let k2 = 1; k2 < n; k2++) putL(vp[h + q++], a, b, k2 / n, sd);
          T.runs.push(n);
        }
        T.built = m - 1; T.pl = pl + add;
        if (tip) { const n = nt - 1; put(vp[h + q++], L, 1, sd); for (let k2 = 1; k2 < n; k2++) putL(vp[h + q++], L, TQ, k2 / n, sd); put(vp[h + q++], TQ, 0, sd); }
        else put(vp[h + q++], L, 0, sd); // свежий конец - тонкий хвост у сопла
        const from = add > 0 ? Math.max(0, pl - 1) : pl; // касательные - по соседним парам: меняются у записанного заново и у хвоста
        for (let i = from; i < total; i++) tangent(T, i, total);
        if (T.hfix) { if (from > 0) tangent(T, 0, total); T.hfix = false; }
        T.tot = total; ii = emit(T, total, ii);
      }
      if (dmax >= 0) { if (dmin < amin) amin = dmin; if (dmax > amax) amax = dmax; }
      if (amax >= 0) for (const b of ATTRS) { b.updateRange.offset = amin * 2 * b.itemSize; b.updateRange.count = (amax - amin + 1) * 2 * b.itemSize; b.needsUpdate = true; }
      if (ii || prevII) { geo.index.updateRange.offset = 0; geo.index.updateRange.count = ii; geo.index.needsUpdate = true; }
      prevII = ii; geo.setDrawRange(0, ii);
    },
  };
  live = api;
  return api;
}
