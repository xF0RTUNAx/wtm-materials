// Пламя реактивных двигателей самолётов (2026-10-21, просьба Mark — детально, реалистично, красиво; этап A — отдельный модуль и стенд
// tools/airdef-fx/jet-view.html, в игру (units-render.attachFlames) ещё не встроен).
// Всё запечено (tools/airdef-fx/jet-bake.py → fx/jet_flame.png, fx/jet_glow.png), на сопло — три плоскости со сложением, без глубины:
//  • раскал сопла — диск внутри среза, смотрит назад (вид сзади в трубу: створки, турбина, кольцо форсажной камеры), 6 уровней нагрева
//    (0 малый газ — тёмно-вишнёвый … 3 «максимал» — жёлто-оранжевый … 5 полный форсаж — бело-жёлтое ядро и яркое кольцо), между уровнями — смесь;
//    инерция ~1 с (остывает дольше, чем разгорается);
//  • факел вид сбоку — осевой билборд вокруг оси сопла (как факелы ракет, plume.js): зоны форсажа 1–5 (1 — короткое бледное ядро,
//    5 — полный факел ~6–9 диаметров сопла), 6 кадров мерцания на зону, ромбы Маха — только в текстуре (шаг ≈ 1,1–1,3 D); зоны
//    смешиваются по длине и ширине, кадры — плавно; без форсажа — «язык» (слабый жёлтый, у blue / neutral почти не виден);
//  • факел «в торец» — спрайт к камере: ядро, кольца, ореол; проявляется, когда камера смотрит вдоль оси (там билборд тонкий);
//    вспышка розжига — спрайт со лучами в первые ~0,2 с включения форсажа.
// Переходы: включение форсажа — вспышка и рост зон 1 → 5 за ~0,6 с; выключение — гаснет за ~0,3 с; газ — плавно.
// Слой огня — как у факелов ракет (FX_ADD_LAYER; setJetLayer зовёт units-render.createFx.setLayers вместе с setFlameLayer).
/* global THREE */
const url = (f) => new URL(`./fx/${f}`, import.meta.url).href;
const WEB = typeof document !== 'undefined' && !!document.createElement && typeof Image !== 'undefined'; // стенды Deno — без картинок

// цвет форсажа по двигателю (Mark 2026-10-21; фото и видео — разведчик): blue — чистое бедное горение, светятся газы: голубое ядро,
// сине-фиолетовая середина, розовато-красный конец (НК-25 Ту-22М3, НК-32 Ту-160, АЛ-31Ф/117С семейства Су-27, F100-229 F-15E, F135 F-35);
// sooty — старые двигатели, богатая смесь, светится сажа: жёлто-оранжевый, короткие ромбы; neutral — бело-жёлтое ядро, оранжевый факел
// (таблица перенесена из units-render.js: там её читает прежний attachFlames)
export const FLAME_KIND = { e_tu22m3: 'blue', e_tu22m2: 'blue', e_tu22: 'blue', e_tu160: 'blue', e_su27: 'blue', su30: 'blue', e_su34: 'blue', e_su35: 'blue', e_su57: 'blue', e_f15e: 'blue', e_f35: 'blue', e_su33: 'blue',
  e_mig21n: 'sooty', e_mig23: 'sooty', e_mig27: 'sooty', e_mig25: 'sooty', e_mig31: 'sooty', mig29: 'sooty', e_su7b: 'sooty', e_su17: 'sooty', e_su24: 'sooty', e_f4: 'sooty', e_f111: 'sooty', e_f100: 'sooty', e_f5: 'sooty', e_jaguar: 'sooty', e_mirage_f1: 'sooty', e_tornado: 'sooty', e_mig19: 'sooty', e_mig17: 'sooty', e_t4: 'sooty', e_mig29k: 'sooty' };
export const flameKindOf = (key) => FLAME_KIND[key] || 'neutral';

// особые двигатели по ключу самолёта: flat — множители сечения по x и y сопла (плоское сопло: факел шире и ниже), len — длина факела,
// rad — радиус, ghost — экранированный выхлоп (только едва заметное тепло, факела нет), tune — общая яркость
export const JET_SHAPE = {
  e_f22: { flat: [1.55, 0.50], len: 0.92 },        // F-22A: плоские сопла с вектором тяги — факел сплющен по вертикали
  e_f117: { ghost: 1 },                            // F-117A: выхлоп в щелях над хвостом (экран) — факела и раскала нет
  e_b2: { ghost: 1 },                              // B-2A: двигатели в крыле, щели над крылом — факела и раскала нет
};

// таблицы тех же чисел, что в jet-bake.py (ZL / ZW / TONGUE / LAM): длина и полуширина ячейки (в диаметрах сопла D) по зонам 1–5
const ROW = { blue: 0, neutral: 1, sooty: 2 };
const ZONE_L = { blue: [1.7, 3.0, 4.7, 6.4, 8.2], neutral: [1.5, 2.7, 4.1, 5.5, 7.0], sooty: [1.2, 2.1, 3.2, 4.2, 5.2] };
const ZONE_W = { blue: [0.80, 0.95, 1.10, 1.25, 1.40], neutral: [0.80, 0.95, 1.10, 1.25, 1.45], sooty: [0.78, 0.92, 1.08, 1.22, 1.40] };
const TONGUE = [1.7, 0.70];
const TONGUE_AMP = { blue: 0.10, neutral: 0.18, sooty: 0.55 };   // язык без форсажа на «максимале»: sooty — слабый жёлтый, остальные — почти не видны
const TINT = { blue: [0.95, 0.98, 1.0], neutral: [1, 0.97, 0.92], sooty: [1, 0.96, 0.88] };
const FPS = 16;      // кадров мерцания в секунду (6 кадров — цикл 0,375 с; кадры смешиваются)
let GAIN = 0.95;      // яркость сложения (HDR: ядро выходит за 1 и даёт свечение)
export const setJetGain = (g) => { GAIN = g; };

// ═════════ текстуры, геометрия, шейдеры ═════════
let flameTex = null, glowTex = null, ready = null;
function texs() {  // при первом факеле (не при импорте): в стенде Deno — без картинок
  if (flameTex) return;
  if (!WEB) { flameTex = new THREE.Texture(); glowTex = new THREE.Texture(); return; }
  const L = new THREE.TextureLoader();
  flameTex = L.load(url('jet_flame.png')); glowTex = L.load(url('jet_glow.png'));
  for (const t of [flameTex, glowTex]) t.anisotropy = 4;
  ready = Promise.all([flameTex, glowTex].map((t) => new Promise((ok) => { const w = () => (t.image && t.image.width ? ok() : setTimeout(w, 30)); w(); })));
}
export const jetReady = () => { texs(); return ready || Promise.resolve(); };   // стенды: дождаться текстур перед снимком
const sideGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5);   // x — поперёк (−0,5…0,5), z — от среза (0) к хвосту (1)
const quadGeo = new THREE.PlaneGeometry(1, 1);

const SIDE_V = `#include <common>
  #include <logdepthbuf_pars_vertex>
  uniform vec2 uFlat;                    // множители сечения по x и y сопла (плоское сопло): ширина билборда — проекция эллипса
  varying float vS, vX, vFace;
  void main() {
    vS = position.z; vX = position.x;
    mat4 M = modelViewMatrix;
    vec3 ax = (M * vec4(0.0, 0.0, 1.0, 0.0)).xyz;                         // ось струи в осях камеры (с масштабом длины)
    vec3 base = (M * vec4(0.0, 0.0, position.z, 1.0)).xyz;
    float wid = length((M * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
    vec3 vd = normalize(-base), an = normalize(ax);
    vec3 side = normalize(cross(an, vd));                                 // поперёк оси и луча зрения
    float ca = abs(dot(an, vd));
    vFace = 1.0 - smoothstep(0.90, 0.995, ca);                           // вдоль оси билборд вырождается — гаснет, светит торцевой спрайт
    vec3 X = normalize(M[0].xyz), Y = normalize(M[1].xyz);
    float vx = dot(vd, X), vy = dot(vd, Y);
    float ext = sqrt((uFlat.x * uFlat.x * vy * vy + uFlat.y * uFlat.y * vx * vx) / (vx * vx + vy * vy + 1e-4)); // проекция плоского сечения на экран
    vec4 mv = vec4(base + side * position.x * wid * ext, 1.0);
    gl_Position = projectionMatrix * mv;
    #include <logdepthbuf_vertex>
  }`;
const SIDE_F = `#include <common>
  #include <logdepthbuf_pars_fragment>
  uniform sampler2D map; uniform vec4 uA, uB; uniform float uWA, uWB, uFr, uBr, uMaxW, uLen; uniform vec3 uTint;
  varying float vS, vX, vFace;
  // ячейка Z = (длина D, полуширина D, колонка кадра 0, строка); кадры лежат подряд, ячейка 64×256, сверху отступ 6 строк, атлас 2048×1024, значения — sqrt
  vec3 cellS(vec4 Z, float f, float sD, float xD) {
    float v = sD / Z.x, u = 0.5 + 0.5 * xD / Z.y;
    float inside = step(0.0, v) * step(v, 1.0) * step(0.0, u) * step(u, 1.0);   // texture2D — всегда (в ветке производные для мип-уровня рвутся: светлая линия по кромке)
    vec2 uv = vec2((Z.z + f + clamp(u, 0.0, 1.0)) * 64.0 / 2048.0, 1.0 - (Z.w * 256.0 + 6.0 + clamp(v, 0.0, 1.0) * 248.0) / 1024.0);
    vec3 t = texture2D(map, uv).rgb; return t * t * inside;
  }
  vec3 zoneS(vec4 Z, float sD, float xD) {
    float f0 = floor(uFr), fm = fract(uFr);
    return mix(cellS(Z, mod(f0, 6.0), sD, xD), cellS(Z, mod(f0 + 1.0, 6.0), sD, xD), fm);
  }
  void main() {
    #include <logdepthbuf_fragment>
    float sD = vS * uLen, xD = vX * 2.0 * uMaxW;
    vec3 c = vec3(0.0);
    if (uWA > 0.0) c += uWA * zoneS(uA, sD, xD);
    if (uWB > 0.0) c += uWB * zoneS(uB, sD, xD);
    c *= uBr * vFace * uTint;
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <encodings_fragment>
  }`;
// раскал сопла: плоскость в срезе, смотрит назад; гаснет, когда камера не сзади
const DISC_V = `#include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec2 vUv; varying float vC;
  void main() {
    vUv = uv;
    vec4 mv0 = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vec3 ax = normalize((modelViewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);
    vC = dot(ax, normalize(-mv0.xyz));                                   // 1 — камера строго сзади, 0 — сбоку, < 0 — спереди
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }`;
const DISC_F = `#include <common>
  #include <logdepthbuf_pars_fragment>
  uniform sampler2D map; uniform float uRow, uLv, uBr; uniform vec3 uTint;
  varying vec2 vUv; varying float vC;
  vec3 gS(float col, float row, vec2 q) { vec3 t = texture2D(map, vec2((col + q.x) / 8.0, (7.0 - row + q.y) / 8.0)).rgb; return t * t; }
  void main() {
    #include <logdepthbuf_fragment>
    float l0 = floor(uLv), lm = uLv - l0;
    vec3 c = mix(gS(l0, uRow, vUv), gS(min(l0 + 1.0, 5.0), uRow, vUv), lm) * uBr * smoothstep(0.06, 0.5, vC) * uTint;
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <encodings_fragment>
  }`;
// факел «в торец» и вспышка розжига: спрайт к камере (ячейки jet_glow.png 128×128: строки 3–5 — торец, колонки — кадры; строка 6 — вспышка)
const GLOW_V = `#include <common>
  #include <logdepthbuf_pars_vertex>
  uniform float uSize;
  varying vec2 vUv; varying float vC;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vec3 ax = normalize((modelViewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);
    vC = dot(ax, normalize(-mv.xyz));
    mv.xy += position.xy * uSize;
    gl_Position = projectionMatrix * mv;
    #include <logdepthbuf_vertex>
  }`;
const GLOW_F = `#include <common>
  #include <logdepthbuf_pars_fragment>
  uniform sampler2D map; uniform float uRow, uFr, uRear, uFlash; uniform vec3 uTint;
  varying vec2 vUv; varying float vC;
  vec3 gS(float col, float row, vec2 q) { vec3 t = texture2D(map, vec2((col + q.x) / 8.0, (7.0 - row + q.y) / 8.0)).rgb; return t * t; }
  void main() {
    #include <logdepthbuf_fragment>
    float f0 = floor(uFr), fm = fract(uFr);
    vec3 r = mix(gS(mod(f0, 6.0), uRow, vUv), gS(mod(f0 + 1.0, 6.0), uRow, vUv), fm);
    vec3 fl = mix(gS(mod(f0, 6.0), 6.0, vUv), gS(mod(f0 + 1.0, 6.0), 6.0, vUv), fm);
    float wr = smoothstep(0.72, 0.995, vC);                              // торец виден, когда смотрим вдоль оси сзади
    vec3 c = (r * uRear * wr + fl * uFlash) * uTint;
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <encodings_fragment>
  }`;
const addMat = (o) => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, ...o });

// слой огня (после дыма; как setFlameLayer в plume.js)
let layer = 0; const live = new Set();
export function setJetLayer(l) { layer = l; for (const f of live) f.layer(l); }

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

// group — модель самолёта (+Z к хвосту), nozzles — точки среза сопел (META.nozzles), r — радиус сопла / 0,45 (pm.nr / 0.45), key — ключ самолёта;
// opts: dry — двигатель без форсажа (META.dry), layer — слой (по умолчанию общий setJetLayer), fps
// → { update(thr, ab, dt), dispose(), kind, active } ; thr — газ 0…1 (в игре ≥ 0,4), ab — форсаж включён; dt — секунды (по умолчанию 1/60)
export function makeJetFlame(group, nozzles, r = 1, key = '', opts = {}) {
  const kind = flameKindOf(key), shape = JET_SHAPE[key] || {}, dry = !!opts.dry, ghost = !!shape.ghost;
  const row = ROW[kind], tint = TINT[kind], tongueKind = dry ? 'sooty' : kind;
  const Rn = 0.45 * r * (shape.rad || 1), Dm = 2 * Rn, lenK = shape.len || 1, flat = shape.flat || [1, 1];
  const lenW = (a) => (a < 1 ? TONGUE[0] : ZONE_L[kind][a - 1]);
  texs();
  const nz = (nozzles || []).map((p) => {
    const root = new THREE.Group(); root.position.copy(p); root.userData.fx = true;
    const U = (v) => ({ value: v });
    const side = new THREE.Mesh(sideGeo, addMat({ vertexShader: SIDE_V, fragmentShader: SIDE_F, uniforms: { map: U(flameTex), uFlat: U(new THREE.Vector2(flat[0], flat[1])), uA: U(new THREE.Vector4()), uB: U(new THREE.Vector4()), uWA: U(0), uWB: U(0), uFr: U(0), uBr: U(1), uMaxW: U(1), uLen: U(1), uTint: U(new THREE.Vector3(...tint)) } }));
    const disc = new THREE.Mesh(quadGeo, addMat({ vertexShader: DISC_V, fragmentShader: DISC_F, uniforms: { map: U(glowTex), uRow: U(row), uLv: U(0), uBr: U(1), uTint: U(new THREE.Vector3(1, 1, 1)) } }));
    const glow = new THREE.Mesh(quadGeo, addMat({ vertexShader: GLOW_V, fragmentShader: GLOW_F, uniforms: { map: U(glowTex), uRow: U(3 + row), uFr: U(0), uRear: U(0), uFlash: U(0), uSize: U(1), uTint: U(new THREE.Vector3(...tint)) } }));
    for (const m of [side, disc, glow]) { m.renderOrder = 5; m.frustumCulled = false; m.userData.fx = true; m.visible = false; root.add(m); }
    disc.position.z = -0.14 * Dm; disc.scale.set(3 * Rn * flat[0], 3 * Rn * flat[1], 1);  // охват ячейки — ±1,5 радиуса, чуть внутри среза
    glow.position.z = 0.28 * Dm;
    group.add(root);
    return { root, side, disc, glow, ph: Math.random() * 6, sp: 0.92 + Math.random() * 0.16, ft: Math.random() * 100 };
  });
  let T = 0, heat = 0, abv = 0, flash = 0, was = false;
  const api = {
    kind, active: nz.length > 0 && !ghost,
    layer(l) { for (const n of nz) for (const m of [n.side, n.disc, n.glow]) m.layers.set(l); },
    state: () => ({ heat, abv, flash }),
    parts: () => nz.flatMap((n) => [{ type: 'side', mesh: n.side }, { type: 'disc', mesh: n.disc }, { type: 'glow', mesh: n.glow }]),   // стенд: показать / скрыть по слоям
    dispose() { live.delete(api); for (const n of nz) { group.remove(n.root); for (const m of [n.side, n.disc, n.glow]) m.material.dispose(); } },
    update(thr = 0.85, ab = false, dt = 1 / 60) {
      if (!nz.length) return;
      T += dt; thr = clamp(thr);
      const wantAB = ab && !dry && !ghost;
      if (wantAB && !was && abv < 0.25) flash = 1;                       // розжиг форсажа — вспышка
      was = wantAB;
      abv = wantAB ? Math.min(1, abv + dt / 0.6) : Math.max(0, abv - dt / 0.3);   // рост зон 1 → 5 за ~0,6 с, выключение — за ~0,3 с
      flash = Math.max(0, flash - dt / 0.22);
      const base = (dry ? 2.1 : 3) * Math.pow(thr, 1.3), tgt = wantAB ? 5 : base;
      heat += (tgt - heat) * (1 - Math.exp(-(tgt > heat ? (wantAB ? 5 : 1.8) : 1.05) * dt));  // раскал инерционный: разгорается ~1 с, остывает дольше
      if (ghost) heat = Math.min(heat, 0.8);
      const zf = clamp(5 * abv + 1.4 * flash, 0, 5);                     // зона факела: 0 — нет форсажа, 1…5
      const tong = dry ? 0.5 * Math.pow(clamp((thr - 0.5) / 0.5), 1.5) : TONGUE_AMP[kind] * Math.pow(clamp((thr - 0.55) / 0.45), 1.5);
      const tg = ghost ? 0 : tong * (1 - Math.min(1, zf)), abOn = !ghost && zf > 0.01;
      // две ячейки атласа и их веса: до зоны 1 — язык и зона 1; дальше — соседние зоны (по длине и ширине смешиваются в шейдере)
      let ZA, ZB, wA, wB;
      if (zf < 1) { ZA = 0; ZB = 1; wA = tg; wB = abOn ? zf : 0; } else { ZA = Math.min(5, Math.floor(zf)); ZB = Math.min(5, ZA + 1); wB = ZB > ZA ? zf - ZA : 0; wA = 1 - wB; }
      const cellOf = (z) => (z < 1 ? { L: TONGUE[0], W: TONGUE[1], c: ROW[tongueKind] * 6, r: 3 } : { L: ZONE_L[kind][z - 1], W: ZONE_W[kind][z - 1], c: (z - 1) * 6, r: row });
      const A = cellOf(ZA), B = cellOf(ZB), Lm = Math.max(wA > 0.001 ? A.L : 0, wB > 0.001 ? B.L : 0) * lenK * Dm, Wmax = Math.max(wA > 0.001 ? A.W : 0, wB > 0.001 ? B.W : 0);
      const vis = !ghost && (wA > 0.012 || wB > 0.012);
      for (const n of nz) {
        const fl = 1 + 0.05 * Math.sin(T * 41 + n.ph * 3) + 0.04 * Math.sin(T * 67 + n.ph), f = T * FPS * n.sp + n.ph;
        // раскал
        const D = n.disc.material.uniforms; D.uLv.value = Math.min(5, heat); D.uBr.value = 1.6 * (0.94 + 0.06 * fl);
        n.disc.visible = heat > 0.03;
        // факел сбоку
        const S = n.side.material.uniforms;
        n.side.visible = vis;
        if (vis) {
          S.uA.value.set(A.L, A.W, A.c, A.r); S.uB.value.set(B.L, B.W, B.c, B.r); S.uWA.value = wA; S.uWB.value = wB;
          S.uFr.value = f; S.uBr.value = GAIN * (ZA < 1 && zf < 1 ? 1 : 1 + 0.9 * flash) * (0.93 + 0.07 * fl);
          S.uMaxW.value = Wmax; S.uLen.value = Lm / (lenK * Dm);
          n.side.scale.set(2 * Wmax * Dm, 1, Lm * (0.97 + 0.06 * fl));
        }
        // торец и вспышка
        const G = n.glow.material.uniforms, rear = abOn ? Math.min(1, abv * 1.3) : tg * 0.25;
        G.uFr.value = f * 1.0; G.uRear.value = 2.0 * rear * (0.9 + 0.1 * fl) * (1 + 0.6 * flash); G.uFlash.value = 1.8 * flash * flash;
        const gs = 4.6 * Rn * (1 + 0.6 * flash) * Math.max(flat[0], 1);
        G.uSize.value = gs; n.glow.visible = !ghost && (rear > 0.01 || flash > 0.01);
      }
    },
  };
  api.layer(opts.layer != null ? opts.layer : layer || 0);
  live.add(api);
  return api;
}
