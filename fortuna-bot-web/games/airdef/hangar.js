// Главный экран - ангар (Mark 2026-11-04: «ангар + подвеска»). Фон - готовый рендер сборщика (ui/hangar, ПАСПОРТ.json: камера и свет), живой слой - настоящий самолёт
// с подвеской на подъёмниках, в одном ракурсе. Рисует тот же рендерер, что и бой: второй контекст WebGL на телефоне нельзя - текстуры моделей освобождаются после загрузки
// на видеокарту (models.js). Кадр считается только когда что-то меняется: в покое ни 3D, ни нагрева (как прежний фон на кадрах menubg.js).
// Фон и самолёт масштабируются как одна картинка: «полный кадр» - весь рендер 16:9 с его камерой, экран - окно в нём (setViewOffset), поэтому пол и самолёт совпадают на любом экране.
// Подвеска расставлена как в бою (air.js: order, buildPylons). Подъёмник: base, ram (шток, длина 1 м, scale.y = ход), head (седло). ?oldbg=1 - прежний фон.
import { AG } from './arsenal.js?v=20261124a';
import { setPaintHall, paintOn } from './paint.js?v=20261124a';
import { planeModel, planeMeta, classOf, wantModel, wantWeapon, weaponPending, weaponFailed, pylonMesh, seatStores, podModel, podModelName, anyModel, modelLoaded, modelFailed, releaseModel, wantCamo, camoKnown, hiKnown, stOrder, setPose, tipPods } from './models.js?v=20261124a';

const VIEWS = { // ПАСПОРТ.json сборщика
  // near, far - не из паспорта: буфер со сглаживанием держит 16 бит глубины, при near 0,3 на 31 м различал только 5 см, и близкие поверхности мерцали лесенкой (Mark, телефон)
  fighter: { fov: 38, cam: [0, 1.85, 31], look: [0, 1.6, 0], r: 12, near: 10, far: 70 },
  heavy: { fov: 46, cam: [0, 2.4, 61], look: [0, 3.4, 0], r: 22, near: 20, far: 130 },
};
const FULL_W = 16, FULL_H = 9, AZ0 = +new URLSearchParams(location.search).get('hgaz') || 2.86, BIG = 25; // BIG - длина или размах, с которых нужен большой зал; AZ0 - один ракурс для всех: нос к камере и чуть влево (Mark 2026-11-04: самолёты не вращаются), справа панель
const JACK_TOP = 1.7, JACK_HEAD = 0.125, JACK_MAX = 2.5; // ПАСПОРТ.json, подъёмник версии 2
const MODEL_WAIT = 12000, PICK_WAIT = 180, KEEP_LOOKED = 3; // модель всё не приходит - показать, что есть; быстрое листание ленты не качает каждый самолёт; на телефоне в памяти - последние просмотренные
const BLOB_GEO = () => new THREE.PlaneGeometry(2.6, 2.6).rotateX(-Math.PI / 2);
// Новогодний ангар (Mark 2026-11-26, fuel-builder; tools/airdef-hangar/ny-pack.py): тот же зал в сумерках со снегом, гирлянды мигают, цветные нитки меняют цвет,
// за воротами и в фонарях крыши идёт снег. С 1 декабря по 14 января; ?ny=1 / ?ny=0 - включить / выключить. Схема сборщика («Новый год/СОСТОЯНИЕ.md»), петля 12 с:
// кадр = база + Σ Ii·тёплые_i + Σ Ci·цветные_i. Самолёт считается по-прежнему только при изменениях, анимируется лишь фон (24-30 кадров/с, телефон - меньше хлопьев)
const NYQ = new URLSearchParams(location.search).get('ny');
const NY = NYQ === '1' || (NYQ !== '0' && (() => { const d = new Date(), m = d.getMonth(), k = d.getDate(); return (m === 11 && k >= 1) || (m === 0 && k <= 14); })());
const NY_PAL = [[1, 0.12, 0.08], [1, 0.55, 0.08], [0.25, 1, 0.25], [0.22, 0.45, 1], [0.85, 0.25, 1], [1, 0.3, 0.55]];
const NY_STILL = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; // без движения: лампы горят, снег стоит
function nyLevels(t, I, Cv) {
  for (let i = 0; i < 4; i++) {
    const x = 0.5 + 0.5 * Math.cos(2 * Math.PI * (t / 6 - i / 4)); I.setComponent(i, NY_STILL ? 0.8 : 0.06 + 0.94 * x * x * (3 - 2 * x));
    const st = t / 2 + 1.5 * i, k = Math.floor(st), f = st - k, q = Math.min(1, Math.max(0, (f - 0.6) / 0.4)), w = q * q * (3 - 2 * q), A = NY_PAL[k % 6], B = NY_PAL[(k + 1) % 6];
    Cv[i].set(A[0] * (1 - w) + B[0] * w, A[1] * (1 - w) + B[1] * w, A[2] * (1 - w) + B[2] * w);
  }
}
// снег: хлопья в области маски (кадр 1600 × 900 - «точки сборщика»), дальность 3,5-220 м, ветер с порывами, кружение; не виден там, где предмет ближе (глубина улицы);
// вторая стая - в стёклах фонарей крыши (без глубины). Положение считает видеокарта по времени - на процессоре ничего
const SNOW_VS = `attribute vec4 aP; attribute vec4 aS; uniform float uT, uF, uPx; uniform vec4 uR0, uR1, uWin;
varying vec2 vUv; varying float vA, vZ, vSet; varying vec3 vC;
void main() {
  vec4 R = aS.w > 0.5 ? uR1 : uR0; float z = aP.z, inv = uF / z;
  float ug = 6.2832 * uT / 12.0 - aP.x / R.z * 1.3;
  float gi = 1.9099 * (-0.25 * cos(ug + 0.4) - 0.05 * cos(2.0 * ug + 1.7) - 0.0167 * cos(3.0 * ug + 0.2));
  float wob = aS.y * inv;
  float x = mod(aP.x + 1.4 * inv * (uT + gi) + wob * sin(6.2832 * floor(1.0 + aS.x * 3.0) * uT / 12.0 + aS.x * 40.0), R.z);
  float y = mod(aP.y + aS.z * inv * uT + 0.35 * wob * sin(6.2832 * floor(1.0 + fract(aS.x * 7.0) * 3.0) * uT / 12.0 + aS.x * 90.0), R.w);
  vec2 ip = R.xy + vec2(x, y), uv = vec2(ip.x / 1600.0, 1.0 - ip.y / 900.0);
  gl_Position = vec4((uv - uWin.xy) / uWin.zw, 0.0, 1.0);
  float rp = max(aP.w * inv * 0.5, 0.35) * uPx, ps = max(2.0, rp * 2.0 + 1.0); gl_PointSize = ps;
  float dens = 0.55 + 0.45 * (0.5 + 0.5 * sin(6.2832 * (2.0 * uT / 12.0) - x / R.z * 2.6 + 1.1));
  vA = (exp(-z / 150.0) + 0.18) * clamp(aP.w / 0.006, 0.6, 1.7) * dens * 0.55 * min(1.0, pow(rp * 2.0 / ps, 2.0) * 1.6);
  float warm = aS.w > 0.5 ? 0.0 : exp(-pow((z - 9.0) / 9.0, 2.0)) * (0.5 + 0.5 * fract(aS.x * 13.0));
  vC = vec3(0.80 + 0.18 * warm, 0.83 + 0.07 * warm, 0.92 - 0.12 * warm) * (0.55 + 0.45 * exp(-z / 120.0));
  vUv = uv; vZ = z; vSet = aS.w;
}`;
const SNOW_FS = `uniform sampler2D mT; varying vec2 vUv; varying float vA, vZ, vSet; varying vec3 vC;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0; float r = dot(q, q); if (r > 1.0) discard;
  float vis;
  if (vSet < 0.5) { float m = texture2D(mT, vec2(vUv.x * 0.5, 0.5 + vUv.y * 0.5)).r, d = texture2D(mT, vec2(vUv.x * 0.5, vUv.y * 0.5)).r; vis = step(0.5, m) * step(vZ, d * d * 600.0); }
  else vis = step(0.5, texture2D(mT, vec2(0.5 + vUv.x * 0.5, 0.5 + vUv.y * 0.5)).r);
  float a = vA * vis * (1.0 - smoothstep(0.15, 1.0, r)); if (a < 0.003) discard;
  gl_FragColor = vec4(vC, min(a, 0.95));
}`;

export function createHangar(C, renderer) {
  const Q = (() => { try { return new URLSearchParams(location.search); } catch (_) { return new URLSearchParams(''); } })();
  let can = !!(renderer && renderer.capabilities && renderer.setRenderTarget && renderer.getDrawingBufferSize) && Q.get('oldbg') !== '1' && typeof document !== 'undefined' && !!document.createElementNS && !!document.getElementById('menu'); // createElementNS нет у заглушки DOM в стендах
  let inited = false, on = false, dirty = true, hs, cam, pivot, holder, shadow, jackG, bg, blitS, blitC, blit, rt = null, rtW = 0, rtH = 0;
  let nyS = null, snowM = null, snowP = null, snowKey = null, blitP = null, blitPS = null, nyT0 = performance.now(), nyLast = 0;
  let viewKey = 'fighter', V = VIEWS.fighter, texA = null, texB = null, fade = 1;
  const TEX = {};
  let nFrames = 0, baseZ = 1, az = AZ0, tAz = AZ0, vel = 0, drag = null, moved = 0, z = 1, tZ = 1, cx = 0.5, cy = 0.5, tCx = 0.5, tCy = 0.5, hw = 0.5, hh = 0.5;
  let want = null, cur = null, wantT = 0, built = false, groups = [], focusKey = null, panelW = () => 0;
  const tmp = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), TOUCH = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const NYF = NY_STILL ? 0 : TOUCH ? 24 : 30; // темп новогоднего фона, кадров/с

  function texOf(key) {
    if (TEX[key]) return TEX[key];
    const big = Math.min(2, devicePixelRatio || 1) * Math.max(innerWidth, innerHeight) > 1700, src = `airdef/ui/hangar/${NY ? 'ny/' : ''}${key}${big ? '' : '_s'}.jpg`, t = { tex: null, ok: false };
    TEX[key] = t;
    if (NY) nyLayers(key, t);
    // один сбой сети не должен оставлять игрока без ангара на весь сеанс (Safari при первом заходе на сайт, 2026-11-05): ещё три попытки, и только потом прежний фон
    const load = (n) => {
      t.tex = new THREE.TextureLoader().load(n ? `${src}?r=${n}` : src, () => { t.ok = true; dirty = true; if (key === viewKey) { if (texB) texB = t.tex; else texA = t.tex; } /* после повтора t.tex - новая текстура, а зал ещё держит пустую первую */ }, undefined, () => {
        if (n < 3) { setTimeout(() => load(n + 1), 700 * (n + 1)); return; }
        t.bad = true; dirty = true; if (key === 'fighter' && on) { can = false; if (C.hangarFail) C.hangarFail(); } // основной зал не загрузился - прежний фон
      });
      t.tex.minFilter = THREE.LinearMipmapLinearFilter; t.tex.magFilter = THREE.LinearFilter; t.tex.generateMipmaps = true; // без перевода цвета: фон и кадр - сразу значения экрана
    };
    load(0);
    return t;
  }

  // слои новогоднего зала: тёплые и цветные нитки (сетки 2 × 2), цвет отсвета, маски снега; не пришли - зал без мигания (одна база)
  function nyLayers(key, t) {
    const L = t.ny = { n: 0 }, one = (k) => { const x = new THREE.TextureLoader().load(`airdef/ui/hangar/ny/${key}_${k}.jpg`, () => { L.n++; dirty = true; if (k === 'm') snowFor(key, x.image); }, undefined, () => { L.bad = true; });
      x.minFilter = THREE.LinearFilter; x.magFilter = THREE.LinearFilter; x.generateMipmaps = false; return x; };
    L.w = one('w'); L.c = one('c'); L.t = one('t'); L.m = one('m');
  }
  // область снега - рамка маски (улица, фонари крыши) в точках кадра 1600 × 900; хлопьев - как у сборщика (площадь / 20), телефон - не больше 1500
  const SNOW = {};
  function snowFor(key, img) {
    try {
      const cv = document.createElement('canvas'), w = img.width >> 1, h = img.height >> 1; cv.width = img.width; cv.height = img.height; const x = cv.getContext('2d'); x.drawImage(img, 0, 0);
      const box = (ox) => { const d = x.getImageData(ox, 0, w, h).data; let x0 = w, x1 = -1, y0 = h, y1 = -1; for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (d[(j * w + i) * 4] > 127) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j; }
        if (x1 < 0) return null; const k = 1600 / w, M = 60; return [Math.max(0, x0 * k - M), Math.max(0, y0 * k - M), Math.min(1600, x1 * k + M) - Math.max(0, x0 * k - M), Math.min(900, y1 * k + 4) - Math.max(0, y0 * k - M)]; };
      const r0 = box(0), r1 = box(w), cap = TOUCH ? 1500 : 4500, n0 = r0 ? Math.round(r0[2] * r0[3] / 20) : 0, n1 = r1 ? Math.round(r1[2] * r1[3] / 20) : 0, k = Math.min(1, cap / Math.max(1, n0 + n1));
      const N0 = Math.round(n0 * k), N1 = Math.round(n1 * k), N = N0 + N1; if (!N) return;
      const P = new Float32Array(N * 4), S = new Float32Array(N * 4), rnd = Math.random;
      const logn = () => { let u = 0, v = 0; while (!u) u = rnd(); v = rnd(); return Math.exp(Math.log(0.009) + 0.45 * Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2832 * v)); };
      for (let i = 0; i < N; i++) { const s1 = i >= N0, R = s1 ? r1 : r0, z0 = s1 ? 8 : 3.5, z = z0 * Math.pow(220 / z0, Math.pow(rnd(), 1.15));
        P.set([rnd() * R[2], rnd() * R[3], z, Math.min(0.032, Math.max(0.003, logn()))], i * 4); S.set([rnd(), 0.05 + rnd() * 0.07, 0.75 * (0.8 + rnd() * 0.4), s1 ? 1 : 0], i * 4); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3)); g.setAttribute('aP', new THREE.BufferAttribute(P, 4)); g.setAttribute('aS', new THREE.BufferAttribute(S, 4));
      SNOW[key] = { g, r0: r0 || [0, 0, 1, 1], r1: r1 || [0, 0, 1, 1] }; dirty = true;
    } catch (e) { console.warn('ангар: снег', e.message); }
  }

  const MAIN_L = [-0.15, 0.96, 0.22]; // главный свет зала
  // самолёт в зале (Mark 2026-11-05: «в Blender красивее»): своя тень на себе от главного света и обработка яркости у самолёта; фон и пол - картинка, их не трогаем. Сравнение: ?hgsh=0, ?hgtm=none|aces, ?hgexp=
  const HQ = new URLSearchParams(location.search), SELF_SH = paintOn && !!renderer.shadowMap.enabled && HQ.get('hgsh') !== '0';
  // тон самолёта: до 0,6 как было, выше - мягкое плечо: блики не выгорают. ACES здесь не подошёл (Mark: «разводы»): кривая поднимает контраст средних тонов и вытаскивает грязь из текстуры
  const CT0 = 'vec3 CustomToneMapping( vec3 color ) { return color; }';
  if (THREE.ShaderChunk.tonemapping_pars_fragment.includes(CT0)) THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace(CT0, 'vec3 CustomToneMapping( vec3 color ) { color *= toneMappingExposure; vec3 k = vec3(0.6); return mix(color, k + 0.4 * (1.0 - exp(-(color - k) / 0.4)), step(k, color)); }');
  const HG_TM = !paintOn ? THREE.NoToneMapping : ({ none: THREE.NoToneMapping, aces: THREE.ACESFilmicToneMapping }[HQ.get('hgtm')] ?? THREE.CustomToneMapping), HG_EXP = +HQ.get('hgexp') || 1;
  let mainL = null, shAz = null;
  function init() {
    if (inited) return; inited = true;
    hs = new THREE.Scene();
    cam = new THREE.PerspectiveCamera(V.fov, FULL_W / FULL_H, 0.3, 400);
    pivot = new THREE.Group(); hs.add(pivot); holder = new THREE.Group(); pivot.add(holder); jackG = new THREE.Group(); pivot.add(jackG);
    // свет - по паспорту; сила подобрана по снимку на настоящей модели: пол вокруг светлый, борт самолёта не должен быть чёрным
    hs.add(new THREE.HemisphereLight(0xc9d3d9, 0x8a857a, paintOn ? 0.58 : 0.78)); // с отражениями зала рассеянного нужно меньше, а ведущий свет сильнее - появляется объём
    const main = new THREE.DirectionalLight(0xffedd1, paintOn ? 1.15 : 0.92); main.position.set(...MAIN_L); hs.add(main);
    if (SELF_SH) { main.castShadow = true; const N = TOUCH ? 1024 : 2048; main.shadow.mapSize.set(N, N); main.shadow.bias = -0.0004; hs.add(main.target); mainL = main; }
    const fill = new THREE.DirectionalLight(0xfff4e6, 0.26); fill.position.set(0.1, 0.25, 1); hs.add(fill); // от пола и стен на ближний к камере борт
    const rim = new THREE.DirectionalLight(0xfff0d9, paintOn ? 0.42 : 0.24); rim.position.set(-0.5, 0.48, -0.72); hs.add(rim);
    // фон: прямоугольник на весь экран, окно в картинке - те же cx, cy, hw, hh, что у камеры; при приближении - размытие через младшие уровни картинки
    bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: { a: { value: null }, b: { value: null }, t: { value: 0 }, win: { value: new THREE.Vector4(0.5, 0.5, 0.5, 0.5) }, bias: { value: 0 },
        ny: { value: 0 }, wT: { value: null }, cT: { value: null }, tT: { value: null }, I: { value: new THREE.Vector4() }, Cc: { value: [0, 1, 2, 3].map(() => new THREE.Vector3()) } },
      vertexShader: 'uniform vec4 win; varying vec2 u; void main() { u = win.xy + position.xy * win.zw; gl_Position = vec4(position.xy, 0.9999, 1.0); }',
      // новогодний зал: слой группы i - клетка сетки 2 × 2 (сверху g1 g2, снизу g3 g4), яркость - в корне; отсвет - цвет из tT (слева тёплые, справа цветные)
      fragmentShader: `uniform sampler2D a, b, wT, cT, tT; uniform float t, bias, ny; uniform vec4 I; uniform vec3 Cc[4]; varying vec2 u;
        vec2 g(float i) { return vec2((u.x + mod(i, 2.0)) * 0.5, (u.y + 1.0 - floor(i / 2.0)) * 0.5); }
        void main() { vec3 c = texture2D(a, u, bias).rgb; if (t > 0.001) c = mix(c, texture2D(b, u, bias).rgb, t);
          if (ny > 0.5) { vec3 tw = texture2D(tT, vec2(u.x * 0.5, u.y)).rgb, tc = texture2D(tT, vec2(0.5 + u.x * 0.5, u.y)).rgb; vec4 w, k;
            w.x = texture2D(wT, g(0.0)).r; w.y = texture2D(wT, g(1.0)).r; w.z = texture2D(wT, g(2.0)).r; w.w = texture2D(wT, g(3.0)).r;
            k.x = texture2D(cT, g(0.0)).r; k.y = texture2D(cT, g(1.0)).r; k.z = texture2D(cT, g(2.0)).r; k.w = texture2D(cT, g(3.0)).r; w *= w; k *= k;
            c += tw * dot(w, I) + tc * (Cc[0] * k.x + Cc[1] * k.y + Cc[2] * k.z + Cc[3] * k.w); }
          gl_FragColor = vec4(c, 1.0); }`,
      depthTest: false, depthWrite: false, toneMapped: false }));
    bg.frustumCulled = false; bg.renderOrder = -1000;
    if (NY) { // фон анимируется отдельно: зал и снег - каждый кадр, самолёт - из буфера (прозрачный вокруг, тень на полу - полупрозрачная)
      nyS = new THREE.Scene(); nyS.add(bg);
      snowM = new THREE.ShaderMaterial({ vertexShader: SNOW_VS, fragmentShader: SNOW_FS, transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
        uniforms: { uT: { value: 0 }, uF: { value: 900 / (2 * Math.tan(19 * Math.PI / 180)) }, uPx: { value: 1 }, uR0: { value: new THREE.Vector4() }, uR1: { value: new THREE.Vector4() }, uWin: { value: new THREE.Vector4() }, mT: { value: null } } });
      blitP = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: { t: { value: null } }, vertexShader: 'varying vec2 u; void main() { u = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: 'uniform sampler2D t; varying vec2 u; void main() { gl_FragColor = texture2D(t, u); }', transparent: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, depthTest: false, depthWrite: false, toneMapped: false }));
      blitP.frustumCulled = false; blitPS = new THREE.Scene(); blitPS.add(blitP);
    } else hs.add(bg);
    // вывод на экран из буфера со сглаживанием (у основного холста antialias выключен)
    blitS = new THREE.Scene(); blitC = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    blit = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: { t: { value: null } }, vertexShader: 'varying vec2 u; void main() { u = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: 'uniform sampler2D t; varying vec2 u; void main() { gl_FragColor = vec4(texture2D(t, u).rgb, 1.0); }', depthTest: false, depthWrite: false, toneMapped: false }));
    blit.frustumCulled = false; blitS.add(blit);
    listen();
    // контекст WebGL вернулся (на телефоне страница перезагружается сама): буфер и запечённая тень потеряны
    renderer.domElement.addEventListener('webglcontextrestored', () => { rt = null; rtW = rtH = 0; shA = shB = null; if (shadow) { shadow.material.dispose(); pivot.remove(shadow); shadow = null; } const L = lastL; if (L) { cur = null; show(L); } dirty = true; });
  }

  function ensureRT() {
    const s = renderer.getDrawingBufferSize(tmp2);
    if (rt && rtW === s.x && rtH === s.y) return;
    if (rt) rt.dispose();
    rtW = s.x; rtH = s.y;
    const P = { depthBuffer: true, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat };
    rt = renderer.capabilities.isWebGL2 && THREE.WebGLMultisampleRenderTarget ? new THREE.WebGLMultisampleRenderTarget(rtW, rtH, P) : new THREE.WebGLRenderTarget(rtW, rtH, P);
    if (rt.samples !== undefined) rt.samples = 4;
    rt.texture.encoding = THREE.sRGBEncoding; rt.texture.generateMipmaps = false;
    blit.material.uniforms.t.value = rt.texture; if (blitP) blitP.material.uniforms.t.value = rt.texture;
  }
  const tmp2 = new THREE.Vector2();

  // ── что показать ─────────────────────────────────────────
  const skinOf = (plane) => { const w = C.shop && C.shop.wallet && C.shop.wallet(), sk = (w && (w.worn || {})[plane]) || null; if (sk && camoKnown(plane, sk)) return sk; return C.texMax && C.texMax('hangar') && hiKnown(plane) ? 'hi' : null; };
  let lastL = null, retry = null, looked = [], mine = new Set(), wantView = null;
  function show(L) {
    if (!can || !L || !L.plane) return;
    init();
    const skin = skinOf(L.plane), key = [L.plane, skin || '', L.items.map(([k, n]) => k + n).join(','), L.pod ? 1 : 0].join('|');
    if (want ? want.key === key : cur === key) return;
    want = { key, L, skin, plane: L.plane, asked: false }; wantT = performance.now(); retry = null; clearFocus();
    dirty = true;
  }
  const refresh = () => { const L = (want && want.L) || lastL; if (L) show(L); }; // кошелёк обновился: окраска сменилась - пересборка, нет - show ничего не делает
  const keyOf = (q) => (q.skin ? `${q.plane}@${q.skin}` : q.plane);
  const gearOf = (plane) => (paintOn && planeMeta(plane) && planeMeta(plane).gearModel) || null; // своя модель со стойками: в ангаре на шасси, а не на подъёмниках (проба, ?paint=1)
  const podOf = (q) => (q.L.pod && planeMeta(q.plane) && planeMeta(q.plane).pod ? podModelName(q.plane) : null); // прицельный контейнер - по требованию
  const fullyHere = (q) => modelLoaded(keyOf(q)) && modelLoaded('hg_jack') && (!gearOf(q.plane) || modelLoaded(gearOf(q.plane)) || modelFailed(gearOf(q.plane))) && !q.L.items.some(([k]) => weaponPending(k) && !weaponFailed(k)) && (!podOf(q) || modelLoaded(podOf(q)) || modelFailed(podOf(q)));
  function stepBuild() {
    if (!on) return;
    // показали замену, потому что нужная модель не успела: пришла - пересобрать
    if (retry && !want && fullyHere(retry)) { want = retry; retry = null; }
    if (!want) return;
    const now = performance.now();
    if (!want.asked) {
      if (now - wantT < PICK_WAIT && cur) return; // листают ленту - не качать каждый самолёт
      want.asked = true;
      if (!modelLoaded(keyOf(want))) mine.add(keyOf(want));
      if (want.skin) wantCamo(want.plane, want.skin); else wantModel(want.plane);
      wantModel('hg_jack'); { const gk = gearOf(want.plane); if (gk) { if (!modelLoaded(gk)) mine.add(gk); wantModel(gk); } } for (const [k] of want.L.items) wantWeapon(k); if (podOf(want)) wantModel(podOf(want)); // стойки делят картинки с самолётом: освобождать их вместе с ним, иначе текстуры остаются в памяти
    }
    if (want.skin && modelFailed(keyOf(want))) { want.skin = null; want.asked = false; wantT = now - PICK_WAIT; return; } // файл с окраской или большими текстурами не пришёл - обычная модель
    const q = want, broke = modelFailed(q.plane) || modelFailed('hg_jack'), here = fullyHere(q);
    if (!here && !broke && now - wantT < MODEL_WAIT) return;
    const meta = planeMeta(q.plane); if (!meta) { want = null; return; }
    if (!hallReady(q)) return; // зал для этого самолёта ещё не пришёл - прежний самолёт стоит в прежнем зале
    const pm = planeModel(meta.side, classOf(q.L.items, AG), q.plane, q.skin, q.L.items.map(([k]) => k)); if (!pm) { if (now - wantT >= MODEL_WAIT) want = null; return; }
    const prev = cur && cur.split('|')[0];
    wantView = q.view; build(pm, q.L); cur = q.key; lastL = q.L; want = null; built = true; dirty = true;
    if (!here && !modelFailed(keyOf(q))) retry = q; // замена или простые фигуры оружия - на время
    // телефон: просмотренные в этом меню и загруженные ради ангара самолёты не копятся
    if (TOUCH && prev !== q.plane) { const kq = keyOf(q); looked = [kq, ...looked.filter((n) => n !== kq)]; const shown = pm.skin ? `${pm.name}@${pm.skin}` : pm.name; for (const n of looked.slice(KEEP_LOOKED)) { looked = looked.filter((x) => x !== n); if (mine.has(n) && n !== kq && n !== shown) { mine.delete(n); releaseModel(n); const gn = gearOf(n.split('@')[0]); if (gn && mine.has(gn) && gn !== gearOf(q.plane)) { mine.delete(gn); releaseModel(gn); } } } } // shown: нужная не пришла, а на экране замена из списка - её текстуры заняты
  }
  // зал определяется размером самолёта; пока его картинка не загрузилась, стоит прежний зал. Не загрузилась совсем - самолёт в основном зале
  function hallReady(q) {
    if (q.view === undefined) { const m = anyModel(keyOf(q)) || anyModel(q.plane); let size = 10; if (m) { const b = new THREE.Box3().setFromObject(m), v = b.getSize(new THREE.Vector3()); size = Math.max(v.x, v.z); } q.view = size > BIG ? 'heavy' : 'fighter'; }
    const t = texOf(q.view); if (t.bad) { q.view = 'fighter'; return !!texOf('fighter').ok; }
    return t.ok;
  }

  function build(pm, L) {
    pivot.rotation.y = 0; holder.position.set(0, 0, 0); pivot.updateMatrixWorld(true); // размеры и лучи - в осях самолёта; поворот вернёт следующий кадр
    while (holder.children.length) holder.remove(holder.children[0]);
    while (jackG.children.length) jackG.remove(jackG.children[0]);
    groups = [];
    const obj = pm.obj; holder.add(obj); obj.position.set(0, 0, 0); pivot.updateMatrixWorld(true);
    const box0 = new THREE.Box3().setFromObject(obj), sz = box0.getSize(new THREE.Vector3());
    // подвеска - как в бою
    let oi = 0; const parts = obj.children.slice(), hung = [], ms = [], seatL = [], ord = stOrder(pm.stations ? pm.stations.length : 8, !!pm.heli), outSt = new Set((pm.internal && pm.out) || []); // out - точки вне отсека (Ту-22М3: МБД)
    for (const [key, n] of L.items.slice().sort((a, b) => AG[b[0]].mass - AG[a[0]].mass)) {
      const TP = pm.heli ? null : tipPods(pm.name, key); if (TP) { for (const T of TP) { const m = pylonMesh(key, AG[key], C.weaponGeo, C.mats.wMat); m.position.copy(T.p); m.rotation.z = T.rz; obj.add(m); hung.push(m); ms.push([key, m]); } continue; } // «Сорбция» на законцовках
      for (let i = 0; i < n && oi < ord.length; i++) {
        const st = ord[oi++], p = pm.stations[st]; if (!p) continue;
        const W0 = AG[key].vis || {}, m = pylonMesh(key, AG[key], C.weaponGeo, C.mats.wMat); m.position.set(p.x, p.y - (W0.hang ?? W0.r ?? 0.2) - 0.05, p.z); const inB = pm.internal && !outSt.has(st); m.visible = !inB; obj.add(m); if (inB) continue; hung.push(m); ms.push([key, m]); seatL.push({ m, st, key, W: AG[key] }); // во внутренних отсеках не видно, как в бою
      }
    }
    if (L.pod && pm.pod) { const m = podModel(pm.name) || new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 2.4, 10).rotateX(Math.PI / 2), new THREE.MeshPhongMaterial({ color: 0x5a636c })); m.position.copy(pm.pod); obj.add(m); hung.push(m); seatL.push({ m, pod: true }); } // как в бою: контейнер ещё не пришёл - простая фигура
    pivot.updateMatrixWorld(true);
    hangStores(obj, pm.name, hung, seatL);
    for (const [key, m] of ms) { let g = groups.find((x) => x.key === key); if (!g) groups.push(g = { key, pos: [] }); g.pos.push(m.position.clone()); }
    const gK = gearOf(pm.name), gear = gK && modelLoaded(gK) ? anyModel(gK) : null; if (gear) { gear.position.set(0, 0, 0); obj.add(gear); } // стойки в тех же осях, что самолёт; не пришли - обычные подъёмники
    setPose(obj, pm.name, 'sweep', 1); if (gear) setPose(obj, pm.name, 'ground', 1); for (const n of (planeMeta(pm.name) || {}).gearHide || []) { const o = obj.getObjectByName(n); if (o) o.visible = !gear; } // A-10A: колёса в обтекателях убраны, когда стоят стойки // на стоянке: крыло B-1B вперёд, крылья B-52H опущены на опоры (только со стойками)
    pivot.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj), gearY = gear ? new THREE.Box3().setFromObject(gear).min.y : null;
    const size = Math.max(sz.x, sz.z), heavy = size > BIG;
    setView(wantView || (heavy ? 'heavy' : 'fighter'));
    // подъёмники: нос и две основные точки; опора - настоящий низ модели (луч снизу), мимо подвески
    const stores = hung.map((c) => new THREE.Box3().setFromObject(c).expandByScalar(0.16));
    const free = (x, zz) => !stores.some((b) => x > b.min.x && x < b.max.x && zz > b.min.z && zz < b.max.z);
    const ray = new THREE.Raycaster(); ray.far = 200;
    const under = (x, zz) => { ray.set(tmp.set(x, -60, zz), UP); const h = ray.intersectObjects(parts, true)[0]; return h ? h.point.y : null; };
    const L0 = box0.max.z - box0.min.z, xM0 = Math.max(1, Math.min(3.2, sz.x * 0.14)), pts = [];
    // Mark: опоры не должны сходиться в центре. Точки - от нужной к дальним: первая, где нет подвески и опора не намного выше самой низкой рядом (фюзеляж, а не крыло)
    const pick = (x0, z0, sign, xs) => { const c = []; for (let dz = 0; dz < 5; dz++) for (const kx of xs) { const x = x0 * kx, zz = z0 + sign * dz * L0 * 0.03; if (!free(x, zz)) continue; const y = under(x, zz); if (y != null) c.push([x, zz, y]); } if (!c.length) return null; const low = Math.min(...c.map((q) => q[2])); return c.find((q) => q[2] <= low + 0.45); };
    const KX = [1, 0.85, 0.7, 0.55, 1.2, 1.4];
    const nose = pick(0, box0.min.z + L0 * 0.18, 1, [1]) || pick(0, box0.min.z + L0 * 0.14, -1, [1]);
    const mL = pick(-xM0, box0.min.z + L0 * 0.64, -1, KX) || pick(-xM0, box0.min.z + L0 * 0.64, 1, KX), mR = mL ? [-mL[0], mL[1], under(-mL[0], mL[1]) ?? mL[2]] : null;
    for (const q of [nose, mL, mR]) if (q) pts.push(q);
    if (!mL) { const c = pick(0, box0.min.z + L0 * 0.68, -1, [1]) || pick(0, box0.min.z + L0 * 0.68, 1, [1]); if (c) pts.push(c); } // подвеска заняла всё под крылом - задняя опора на оси
    const jS = heavy ? 1.3 : 1, top = (JACK_TOP + JACK_HEAD) * jS, H = gear ? -gearY : Math.max(-box.min.y + 0.3, ...pts.map((q) => top - q[2]), 1.2); if (gear) pts.length = 0; // на шасси: колёса на полу, подъёмников нет
    holder.position.set(-(box0.min.x + box0.max.x) / 2, H, -(box0.min.z + box0.max.z) / 2); pivot.updateMatrixWorld(true);
    for (const [x, zz, y] of pts) {
      const j = anyModel('hg_jack'); if (!j) continue; j.traverse((o) => { if (o.isMesh) o.material.toneMapped = false; }); // подъёмник подобран под зал
      const ram = j.getObjectByName('ram'), head = j.getObjectByName('head'), st = Math.max(0, Math.min(JACK_MAX, (H + y - top) / jS));
      if (ram) { ram.position.y = JACK_TOP; ram.scale.y = Math.max(0.001, st); } if (head) head.position.y = JACK_TOP + st;
      j.scale.setScalar(jS); j.position.set(x + holder.position.x, 0, zz + holder.position.z); jackG.add(j);
    }
    bakeShadow(obj, Math.max(sz.x, sz.z, box.max.z - box.min.z) * 0.62);
    if (mainL) fitSelfShadow(obj);
    baseZ = wantView === 'heavy' ? Math.max(1.12, Math.min(1.3, 50 / Math.max(size, 1))) : Math.max(1, Math.min(1.34, 23 / Math.max(size, 1))); // небольшой самолёт - крупнее; у большого запас, чтобы сдвинуть кадр от панели
    tAz = az; homeView();
  }
  // тень самолёта на себе: коробка карты - по сфере вокруг самолёта (он вращается на месте), считается заново только при смене самолёта или поворота
  function fitSelfShadow(obj) {
    obj.traverse((o) => { if (o.isMesh) { o.receiveShadow = true; o.castShadow = !o.userData.glass; } });
    const b = new THREE.Box3().setFromObject(obj), R = b.getSize(tmp).length() / 2 + 0.5, cy = (b.min.y + b.max.y) / 2, c = mainL.shadow.camera, texel = 2 * R / mainL.shadow.mapSize.x;
    c.left = c.bottom = -R; c.right = c.top = R; c.near = 0.1; c.far = 2 * R + 2; c.updateProjectionMatrix();
    mainL.target.position.set(0, cy, 0); mainL.position.set(MAIN_L[0], MAIN_L[1], MAIN_L[2]).normalize().multiplyScalar(R + 1).add(mainL.target.position); mainL.target.updateMatrixWorld(); mainL.updateMatrixWorld();
    mainL.shadow.normalBias = texel * 2.5; shAz = null;
  }
  // Посадка подвески на пилоны - общая с боем, по таблице (seat.js, seats-data.js); здесь только цвет пилонов под свет зала и проверка зазоров для тестов
  let pyMat = null, pyStat = { hung: 0, seated: 0 }, pyAudit = () => [];
  function hangStores(obj, name, hung, list) {
    if (!pyMat) pyMat = new THREE.MeshPhongMaterial({ color: 0x35393d, specular: 0x1c1c1c, shininess: 16 });
    for (const c of obj.children) if (c.userData.genPylon) c.material = pyMat;
    seatStores(obj, name, list, pyMat);
    pyStat = { hung: hung.length };
    pyAudit = () => {
      const a0 = pivot.rotation.y; pivot.rotation.y = 0; pivot.updateMatrixWorld(true);
      const ray = new THREE.Raycaster(), o = new THREE.Vector3(), others = obj.children.filter((c) => !hung.includes(c)), res = hung.map((m) => {
        const b = new THREE.Box3().setFromObject(m), L = b.max.z - b.min.z, cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2; let best = null;
        for (const k of [-0.12, 0, 0.12]) { ray.set(o.set(cx, b.max.y + 1, cz + k * L), new THREE.Vector3(0, -1, 0)); ray.far = 8; const t = ray.intersectObject(m, true)[0]; if (!t) continue; const yT = t.point.y < (b.min.y + b.max.y) / 2 ? b.max.y : t.point.y; /* простая фигура: грани внутрь, луч попал в низ */ ray.set(o.set(cx, yT - 0.03, cz + k * L), UP); ray.far = 8; const h = ray.intersectObjects(others, true)[0]; const g = h ? h.point.y - yT : 99; if (best == null || g < best) best = g; }
        return { x: +cx.toFixed(2), z: +cz.toFixed(2), gap: best == null ? null : +best.toFixed(3), L: +L.toFixed(2) };
      });
      pivot.rotation.y = a0; pivot.updateMatrixWorld(true); return res;
    };
  }
  function setView(key) {
    if (key === viewKey && texA) return;
    const T = texOf(key).tex;
    if (texA && key !== viewKey && texA !== T) { texB = T; fade = 0; } else texA = T;
    viewKey = key; V = VIEWS[key];
    cam.fov = V.fov; cam.near = V.near; cam.far = V.far; cam.position.fromArray(V.cam); cam.up.set(0, 1, 0); cam.lookAt(tmp.fromArray(V.look)); cam.updateMatrixWorld(true);
  }

  // тень на полу: вид сверху на самолёт, размытый силуэт (бумажный шарик не нужен: крылья и хвост читаются). Считается один раз на самолёт
  const blurMat = () => new THREE.ShaderMaterial({ uniforms: { t: { value: null }, d: { value: new THREE.Vector2() } }, depthTest: false, depthWrite: false, toneMapped: false,
    vertexShader: 'varying vec2 u; void main() { u = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'uniform sampler2D t; uniform vec2 d; varying vec2 u; void main() { float s = 0.0; s += texture2D(t, u - 4.0 * d).g * 0.05; s += texture2D(t, u - 3.0 * d).g * 0.09; s += texture2D(t, u - 2.0 * d).g * 0.12; s += texture2D(t, u - d).g * 0.15; s += texture2D(t, u).g * 0.18; s += texture2D(t, u + d).g * 0.15; s += texture2D(t, u + 2.0 * d).g * 0.12; s += texture2D(t, u + 3.0 * d).g * 0.09; s += texture2D(t, u + 4.0 * d).g * 0.05; gl_FragColor = vec4(s, s, s, 1.0); }' });
  let shA = null, shB = null, shM = null, jackBlob = null, blobGeo = null;
  function bakeShadow(obj, E0) {
    const E = paintOn ? E0 * 1.3 : E0, N = paintOn ? 1024 : 256, O = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true, stencilBuffer: false };
    if (!shA) { shA = new THREE.WebGLRenderTarget(N, N, O); shB = new THREE.WebGLRenderTarget(N, N, O); shM = blurMat(); }
    const sc = new THREE.Scene(), oc = new THREE.OrthographicCamera(-E, E, E, -E, 0.1, 200), par = holder.parent, wasAuto = renderer.autoClear, bgC = new THREE.Color(), bgA = renderer.getClearAlpha();
    renderer.getClearColor(bgC);
    oc.position.set(0, 100, 0); oc.up.set(0, 0, -1); oc.lookAt(0, 0, 0);
    // ?paint=1: чёткая тень - настоящая проекция на пол вдоль главного света (сдвиг растёт с высотой точки), почти без размытия
    const Lc = Math.cos(az), Ls = Math.sin(az), LX = (MAIN_L[0] * Lc - MAIN_L[2] * Ls) / MAIN_L[1], LZ = (MAIN_L[0] * Ls + MAIN_L[2] * Lc) / MAIN_L[1];
    sc.overrideMaterial = paintOn ? new THREE.ShaderMaterial({ side: THREE.DoubleSide, toneMapped: false, uniforms: { uL: { value: new THREE.Vector2(LX, LZ) } },
      vertexShader: 'uniform vec2 uL; void main() { vec4 w = modelMatrix * vec4(position, 1.0); w.xz -= w.y * uL; w.y = 0.0; gl_Position = projectionMatrix * viewMatrix * w; }', fragmentShader: 'void main() { gl_FragColor = vec4(1.0); }' })
      : new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, toneMapped: false });
    const saveTM = renderer.toneMapping; renderer.toneMapping = THREE.NoToneMapping;
    const rot = pivot.rotation.y; pivot.rotation.y = 0; sc.add(pivot); pivot.updateMatrixWorld(true);
    jackG.visible = false; if (shadow) shadow.visible = false;
    renderer.setClearColor(0x000000, 1); renderer.autoClear = true;
    renderer.setRenderTarget(shA); renderer.render(sc, oc);
    sc.remove(pivot); hs.add(pivot); pivot.rotation.y = rot; jackG.visible = true; sc.overrideMaterial = null;
    const qS = new THREE.Scene(), q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), shM); q.frustumCulled = false; qS.add(q); const R = (paintOn ? 0.9 : 2.2) / N;
    for (const [a, b, dx, dy] of [[shA, shB, R, 0], [shB, shA, 0, R], ...(paintOn ? [] : [[shA, shB, R * 1.8, 0], [shB, shA, 0, R * 1.8]])]) { shM.uniforms.t.value = a.texture; shM.uniforms.d.value.set(dx, dy); renderer.setRenderTarget(b); renderer.render(qS, blitC); }
    renderer.setRenderTarget(null); renderer.setClearColor(bgC, bgA); renderer.autoClear = wasAuto; renderer.toneMapping = saveTM;
    q.geometry.dispose();
    if (!shadow) { shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ toneMapped: false, color: paintOn ? 0x090907 : 0x24231f, alphaMap: shA.texture, transparent: true, opacity: paintOn ? 0.7 : 0.86, depthWrite: false, toneMapped: false })); shadow.renderOrder = -10; pivot.add(shadow); }
    shadow.visible = true; shadow.scale.set(E * 2, 1, E * 2); shadow.position.set(0, 0.015, 0);
    // пятна под основаниями подъёмников
    if (!jackBlob) { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 6, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,.8)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); jackBlob = new THREE.MeshBasicMaterial({ color: 0x1c1b18, map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, toneMapped: false }); }
    if (!blobGeo) blobGeo = BLOB_GEO();
    for (const j of jackG.children.slice()) { const b = new THREE.Mesh(blobGeo, jackBlob); b.position.set(j.position.x, 0.02, j.position.z); b.renderOrder = -9; jackG.add(b); }
  }

  // ── приблизить к оружию ─────────────────────────────────
  // обычный вид: крупнее для небольшого самолёта и по центру свободной части экрана (справа панель)
  function homeView() {
    focusKey = null; tZ = baseZ;
    const W = C.VW || innerWidth, s = Math.max(W / FULL_W, (C.VH || innerHeight) / FULL_H) * tZ;
    tCx = 0.5 + (panelW() / 2) / (s * FULL_W); tCy = 0.5 + 0.012; dirty = true;
  }
  function clearFocus() { homeView(); }
  function focusWeapon(key) {
    const g = groups.find((x) => x.key === key); if (!g) return false;
    if (focusKey === key) { clearFocus(); return false; }
    focusKey = key;
    const c = Math.cos(az), sn = Math.sin(az), w = tmp.copy(g.pos.slice().sort((a, b) => (-b.x * sn + b.z * c) - (-a.x * sn + a.z * c))[0]); // ближняя к камере точка этого оружия
    pivot.rotation.y = az; pivot.updateMatrixWorld(true); holder.children[0].localToWorld(w);
    cam.clearViewOffset(); cam.aspect = FULL_W / FULL_H; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true); w.project(cam);
    tZ = baseZ * (viewKey === 'heavy' ? 2.3 : 1.75);
    const W = C.VW || innerWidth, s = Math.max(W / FULL_W, (C.VH || innerHeight) / FULL_H) * tZ, fullW = s * FULL_W;
    tCx = (w.x + 1) / 2 + (panelW() / 2) / fullW; tCy = (w.y + 1) / 2;
    dirty = true; return true;
  }

  // ── палец и мышь ────────────────────────────────────────
  const inUi = (e) => e.target && e.target.closest && e.target.closest('button,a,input,select,.mpanel,.msheet,#hgStrip,.mrail,#mtabs,#mbtns,#ratWin,#shopWin');
  // панель шестерни (position: fixed) внутри прокручиваемой верхней строки Safari на iPhone обрезал по низу строки (снимок Mark 2026-11-04): в ангаре она лежит прямо в #menu
  const moveTabs = (toMenu) => { const t = document.getElementById('mtabs'), m = t && t.closest && t.closest('#menu'), to = m && (toMenu ? m : m.querySelector('.mrail')); if (to && t.parentNode !== to) to.appendChild(t); };
  function listen() {
    const el = document.getElementById('menu');
    panelW = () => { if (!document.body.classList.contains('mpOpen') || innerWidth <= innerHeight) return 0; /* вертикально панель снизу */ const p = el.querySelector('.mpanel'); return p ? p.getBoundingClientRect().width : 0; };
    el.addEventListener('click', (e) => { if (!on || !e.target.isConnected || inUi(e) || !focusKey) return; /* isConnected: панель перерисовалась от этого же нажатия */ clearFocus(); if (C.menu && C.menu.render) C.menu.render(); }); // нажатие мимо панелей - обратно к самолёту целиком
    el.addEventListener('wheel', (e) => { if (!on || inUi(e)) return; e.preventDefault(); tZ = Math.max(baseZ, Math.min(baseZ * 2, tZ * (e.deltaY > 0 ? 0.93 : 1.08))); dirty = true; }, { passive: false });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) dirty = true; });
  }

  // ── кадр ────────────────────────────────────────────────
  const near = (a, b, e = 0.0008) => Math.abs(a - b) < e;
  const settled = () => near(az, tAz, 0.001) && near(z, tZ) && near(cx, tCx) && near(cy, tCy) && Math.abs(vel) < 0.0004 && fade >= 1;
  function paint() {
    if (!on || !inited) return;
    stepBuild();
        const k = 0.2, T0 = TEX[viewKey]; if (!T0 || !T0.ok) return; // зал ещё грузится
    if (!settled()) { az += (tAz - az) * k; z += (tZ - z) * k; cx += (tCx - cx) * k; cy += (tCy - cy) * k; if (fade < 1) fade = Math.min(1, fade + 0.09); dirty = true; }
    if (texB && fade >= 1) { texA = texB; texB = null; }
    const now = performance.now(), nyTick = NY && NYF > 0 && now - nyLast >= 1000 / NYF - 4;
    if (!texA || (!dirty && !nyTick)) return;
    const plane = dirty; dirty = false; if (plane) nFrames++; // nFrames - кадры самолёта: в покое не растут и у новогоднего зала (анимируется только фон)
    const W = C.VW || innerWidth, H = C.VH || innerHeight, s = Math.max(W / FULL_W, H / FULL_H) * z, fullW = s * FULL_W, fullH = s * FULL_H;
    hw = W / (2 * fullW); hh = H / (2 * fullH);
    const X = Math.max(hw, Math.min(1 - hw, cx)), Y = Math.max(hh, Math.min(1 - hh, cy));
    cam.aspect = FULL_W / FULL_H; cam.setViewOffset(fullW, fullH, (X - hw) * fullW, (1 - Y - hh) * fullH, W, H);
    const U = bg.material.uniforms; U.a.value = texA; U.b.value = texB; U.t.value = texB ? fade : 0; U.win.value.set(X, Y, hw, hh); U.bias.value = Math.min(2.6, Math.max(0, z / baseZ - 1.05) * 2);
    pivot.rotation.y = az;
    ensureRT();
    const tm = renderer.toneMapping, tx = renderer.toneMappingExposure, ac = renderer.autoClear, au = renderer.shadowMap.autoUpdate; renderer.toneMapping = HG_TM; renderer.toneMappingExposure = HG_EXP; renderer.autoClear = true; // свой тон у самолёта; у фона, пола и подъёмников toneMapped: false
    if (mainL) { renderer.shadowMap.autoUpdate = false; if (shAz !== az) { renderer.shadowMap.needsUpdate = true; shAz = az; } }
    if (!NY) { renderer.setRenderTarget(rt); renderer.render(hs, cam); renderer.setRenderTarget(null); renderer.render(blitS, blitC); }
    else {
      if (plane || !rt.__ny) { const cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha(); renderer.setClearColor(0x000000, 0); renderer.setRenderTarget(rt); renderer.render(hs, cam); renderer.setClearColor(cc, ca); rt.__ny = true; }
      nyLast = now; const tt = ((now - nyT0) / 1000) % 600, L = TEX[viewKey] && TEX[viewKey].ny;
      U.ny.value = L && L.n >= 3 && !L.bad ? 1 : 0; if (U.ny.value) { U.wT.value = L.w; U.cT.value = L.c; U.tT.value = L.t; nyLevels(tt, U.I.value, U.Cc.value); }
      const SN = SNOW[viewKey];
      if (SN && snowKey !== viewKey) { if (snowP) nyS.remove(snowP); snowP = new THREE.Points(SN.g, snowM); snowP.frustumCulled = false; snowP.renderOrder = 1; nyS.add(snowP); snowKey = viewKey; snowM.uniforms.uR0.value.fromArray(SN.r0); snowM.uniforms.uR1.value.fromArray(SN.r1); snowM.uniforms.mT.value = L.m; }
      if (snowP) { snowP.visible = !fade || fade >= 1; const SU = snowM.uniforms; SU.uT.value = NY_STILL ? 3 : tt; SU.uWin.value.copy(U.win.value); SU.uPx.value = rtW / (2 * hw * 1600); }
      renderer.setRenderTarget(null); renderer.render(nyS, blitC); renderer.autoClear = false; renderer.render(blitPS, blitC);
    }
    renderer.toneMapping = tm; renderer.toneMappingExposure = tx; renderer.autoClear = ac; renderer.shadowMap.autoUpdate = au;
  }

  return {
    has: () => can,
    sim: false, idle: () => true, skip3D: () => true,
    busy: () => on && (dirty || !!want || !settled()),
    anim: () => (on && NY ? NYF : 0), // новогодний зал: фон живёт (гирлянды, снег) - main.js держит этот темп кадров
    ready: () => !can || (!!built && !!texA && !!TEX[viewKey] && !!TEX[viewKey].ok && !want),
    start() {
      init(); on = true; dirty = true;
      document.body.classList.add('hgOn'); moveTabs(true); setPaintHall(() => texA);
      const old = document.getElementById('menuBg'); if (old) old.style.display = 'none';
      C.snd.ambient(true, C.setup.game);
      if (!texA) setView(viewKey);
      if (!cur && !want && lastL) show(lastL); // самолёт освобождали на время боя
    },
    stop() {
      on = false;
      // телефон: большие текстуры ангара в бою не нужны (бой берёт @hi только при настройке «максимальные»): освободить, вернёмся в меню - самолёт соберётся заново
      if (TOUCH && !(C.texMax && C.texMax('battle')) && holder) { const hi = [...mine].filter((n) => n.endsWith('@hi')); if (hi.length) { while (holder.children.length) holder.remove(holder.children[0]); for (const n of hi) releaseModel(n); cur = null; built = false; } }
      mine.clear(); looked = []; document.body.classList.remove('hgOn', 'hgAir'); moveTabs(false); setPaintHall(null); // с этого боя все загруженные модели - его, не освобождать
      C.snd.ambient(false);
      if (rt) { rt.dispose(); rt = null; rtW = rtH = 0; } // бою память нужнее; вернёмся в меню - создадим заново
      if (TOUCH) { if (shA) { shA.dispose(); shB.dispose(); shA = shB = null; if (shadow) { shadow.material.dispose(); pivot.remove(shadow); shadow = null; } cur = null; } if (mainL && mainL.shadow.map) { mainL.shadow.map.dispose(); mainL.shadow.map = null; shAz = null; } } // телефон: тень на полу и своя тень самолёта - тоже; при возврате самолёт пересоберётся
      for (const k in TEX) { if (TEX[k].tex) TEX[k].tex.dispose(); const L = TEX[k].ny; if (L) for (const x of [L.w, L.c, L.t, L.m]) if (x) x.dispose(); }
      dirty = true;
    },
    modeChanged() { C.snd.ambient(true, C.setup.game); },
    resize() { dirty = true; if (!focusKey) homeView(); },
    paint, show, refresh, focusWeapon, clearFocus, focused: () => focusKey, panelChanged() { if (!focusKey) homeView(); },
    frames: () => nFrames, // сколько кадров посчитано: в покое не растёт (проверка нагрева)
    audit: () => pyAudit(),
    stat: () => ({ py: pyStat, jacks: jackG ? jackG.children.filter((c) => c.getObjectByName && c.getObjectByName('ram')).length : 0, maxSt: jackG ? Math.max(0, ...jackG.children.map((c) => { const r = c.getObjectByName && c.getObjectByName('ram'); return r ? r.scale.y : 0; })) : 0, H: holder ? holder.position.y : 0, view: viewKey, gap: jackG ? (() => { const J = jackG.children.filter((c) => c.getObjectByName && c.getObjectByName('ram')); let g = 99; for (let a = 0; a < J.length; a++) for (let b = a + 1; b < J.length; b++) g = Math.min(g, Math.hypot(J[a].position.x - J[b].position.x, J[a].position.z - J[b].position.z)); return g; })() : 0 }), // стенд: сколько подъёмников, ход и наименьшее расстояние между ними
    update() {}, camera() {}, hud() {}, focus: () => C.camera.position,
  };
}
