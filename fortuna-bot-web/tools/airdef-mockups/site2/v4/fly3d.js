// Один прозрачный WebGL-холст над страницей: в нём живут модели игры поверх кадров.
//  • Су-34 с двумя КАБ-500С: проходит над закатом первого экрана, разворачивается и улетает за край; в «Вылете» влетает слева,
//    сбрасывает бомбы (они падают вперёд и вниз и уходят за нижний край кадра) и улетает за правый край;
//  • SAMP/T стоит на земле кадра «Обороны»: прокрутка разворачивает его в боевое положение, потом из контейнера уходит Aster 30;
//  • «Искандер-К» в «Мульти-волне»: крышки, опоры, подъём контейнеров, пуск «Калибра» с разворотом на курс;
//  • F-15E в финале влетает и занимает своё место в кадре заката.
// Точки маршрутов привязаны к местам внутри кадров, поэтому модели сидят в кадре при любой ширине экрана.
// Лёгкий параллакс самолётов от курсора (на телефоне - от наклона). Рисуем только когда что-то меняется.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const D2R = Math.PI / 180;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const ease = (t) => lerp(t, smooth(t), 0.6);
const seg = (p, a, b) => smooth(clamp((p - a) / (b - a)));
const $ = (s) => document.querySelector(s);

// свет под кадр
const LIGHT = {
  dusk: { sky: '#6f7f9e', gnd: '#2b1f18', hemi: 0.75, key: '#ffa860', keyI: 3.0, keyDir: [-0.35, 0.45, -1], rim: '#ffc890', rimI: 1.5, rimDir: [0.8, 0.15, -1], env: 0.5, exp: 0.92, fog: '#c99a78', fogN: 10, fogF: 150 },
  eve: { sky: '#a7b6cc', gnd: '#5b4a3a', hemi: 0.95, key: '#ffdcae', keyI: 2.8, keyDir: [-0.75, 0.55, 0.35], rim: '#ffe4bd', rimI: 0.9, rimDir: [0.7, 0.3, -1], env: 0.75, exp: 0.98, fog: '#d8c7b0', fogN: 10, fogF: 170 },
  day: { sky: '#bfd5ef', gnd: '#6f7350', hemi: 1.2, key: '#fff3e0', keyI: 3.1, keyDir: [0.55, 0.8, 0.7], rim: '#d6e6ff', rimI: 0.7, rimDir: [-0.7, 0.3, -1], env: 0.9, exp: 1.0, fog: '#d3dde8', fogN: 30, fogF: 400 },
};

export async function start() {
  const html = document.documentElement;
  let phone = matchMedia('(max-width: 900px)').matches;
  let vw = html.clientWidth, vh = innerHeight;

  const canvas = document.createElement('canvas');
  canvas.className = 'fly';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.autoClear = false;
  renderer.localClippingEnabled = true; // ракета в контейнере видна только выше его среза
  let dpr = Math.min(devicePixelRatio || 1, phone ? 1.25 : 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(vw, vh);

  const cam = new THREE.PerspectiveCamera(26, vw / vh, 0.01, 3000);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xffffff, 10, 150);
  const hemi = new THREE.HemisphereLight(), key = new THREE.DirectionalLight(), rim = new THREE.DirectionalLight();
  scene.add(hemi, key, rim);
  const pmrem = new THREE.PMREMGenerator(renderer);

  // отражения - из кадра под моделью (небо сверху, земля снизу)
  const envCache = new Map();
  function envFrom(img) {
    if (!img || !img.complete || !img.naturalWidth) return null;
    const k = img.currentSrc || img.src;
    if (envCache.has(k)) return envCache.get(k);
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    c.getContext('2d').drawImage(img, 0, 0, 512, 256);
    const t = new THREE.CanvasTexture(c);
    t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace;
    const e = pmrem.fromEquirectangular(t).texture; t.dispose();
    envCache.set(k, e);
    return e;
  }

  // мягкое пятно тени под машиной
  const blobTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 6, 64, 64, 64); gr.addColorStop(0, 'rgba(0,0,0,0.62)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
  const blob = (w, d, y, op = 1) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: op, fog: false })); m.rotation.x = -Math.PI / 2; m.scale.set(w, d, 1); m.position.y = y; m.renderOrder = -1; m.userData.blob = op; return m; };

  // ── загрузка моделей ──
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const base = new URL('../models/', import.meta.url);
  // norm: длина = 1 и центр в нуле (самолёты); иначе - метры как в игре
  async function load(file, norm = true) {
    const g = await loader.loadAsync(new URL(file, base).href);
    const root = g.scene;
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
    const pivot = new THREE.Group(); pivot.add(root);
    if (norm) { root.position.sub(mid); pivot.scale.setScalar(1 / Math.max(size.x, size.y, size.z)); }
    const rig = new THREE.Group(); rig.add(pivot); rig.visible = false; rig.userData.actor = true;
    scene.add(rig);
    const M = { file, root, pivot, rig, mats: [], blobs: [], env: null, box, size };
    collect(M);
    return M;
  }
  function collect(M) {
    M.mats = []; M.blobs = [];
    M.rig.traverse((o) => {
      if (!o.isMesh) return;
      o.frustumCulled = false;
      const m = o.material;
      if (o.userData.blob) { M.blobs.push(o); return; }
      // в картах игры R - затенение щелей, G - шероховатость, B - металл: та же картинка идёт и в aoMap
      if (m.metalnessMap && !m.aoMap) { m.aoMap = m.metalnessMap; m.aoMapIntensity = 1; }
      if (m.userData.op === undefined) { m.userData.op = m.opacity; m.userData.tr = m.transparent; }
      if (!M.mats.includes(m)) M.mats.push(m);
    });
  }
  function unload(M) {
    if (!M) return;
    scene.remove(M.rig);
    M.rig.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.dispose();
      const m = o.material;
      for (const k of ['map', 'normalMap', 'metalnessMap', 'roughnessMap', 'emissiveMap']) if (m[k] && m[k] !== blobTex) m[k].dispose();
      m.dispose();
    });
  }
  function setAlpha(M, a) {
    for (const m of M.mats) {
      const tr = a < 0.999 || m.userData.tr;
      if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; }
      m.opacity = m.userData.op * a;
    }
    for (const b of M.blobs) b.material.opacity = b.userData.blob * a;
  }
  function setEnv(M, tex, k) {
    if (tex && M.env !== tex) { M.env = tex; for (const m of M.mats) { m.envMap = tex; m.needsUpdate = true; } }
    for (const m of M.mats) m.envMapIntensity = k;
  }
  const C1 = new THREE.Color(), C2 = new THREE.Color();
  function applyLight(a, b = a, t = 0) {
    const A = LIGHT[a], B = LIGHT[b];
    hemi.color.copy(C1.set(A.sky)).lerp(C2.set(B.sky), t);
    hemi.groundColor.copy(C1.set(A.gnd)).lerp(C2.set(B.gnd), t);
    hemi.intensity = lerp(A.hemi, B.hemi, t);
    key.color.copy(C1.set(A.key)).lerp(C2.set(B.key), t); key.intensity = lerp(A.keyI, B.keyI, t);
    key.position.set(lerp(A.keyDir[0], B.keyDir[0], t), lerp(A.keyDir[1], B.keyDir[1], t), lerp(A.keyDir[2], B.keyDir[2], t));
    rim.color.copy(C1.set(A.rim)).lerp(C2.set(B.rim), t); rim.intensity = lerp(A.rimI, B.rimI, t);
    rim.position.set(lerp(A.rimDir[0], B.rimDir[0], t), lerp(A.rimDir[1], B.rimDir[1], t), lerp(A.rimDir[2], B.rimDir[2], t));
    scene.fog.color.copy(C1.set(A.fog)).lerp(C2.set(B.fog), t);
    scene.fog.near = lerp(A.fogN, B.fogN, t); scene.fog.far = lerp(A.fogF, B.fogF, t);
    renderer.toneMappingExposure = lerp(A.exp, B.exp, t);
    return lerp(A.env, B.env, t);
  }
  function only(M) { for (const o of scene.children) if (o.userData.actor) o.visible = o === M.rig; }

  // ── экран ──
  const opCache = new WeakMap();
  function coverPt(img, u, v) { // точка снимка с учётом object-fit: cover
    const r = img.getBoundingClientRect();
    const nw = img.naturalWidth || 16, nh = img.naturalHeight || 9;
    const s = Math.max(r.width / nw, r.height / nh), cw = nw * s, ch = nh * s;
    let op = opCache.get(img);
    if (!op) { op = getComputedStyle(img).objectPosition.split(' ').map((x) => parseFloat(x) / 100); opCache.set(img, op); }
    return { x: r.left + (r.width - cw) * op[0] + u * cw, y: r.top + (r.height - ch) * op[1] + v * ch, w: cw, h: ch, top: r.top, bottom: r.bottom };
  }
  function boxPt(el, u, v) { // точка рамки кадра (для машин на земле: рамка неподвижна относительно страницы)
    const r = el.getBoundingClientRect();
    return { x: r.left + u * r.width, y: r.top + v * r.height, w: r.width, h: r.height, top: r.top, bottom: r.bottom };
  }
  function anchor(at) {
    if (at.vp) return { x: at.vp[0] * vw, y: at.vp[1] * vh, w: vw };
    const img = $(at.img);
    return img ? coverPt(img, at.u, at.v) : { x: vw / 2, y: vh / 2, w: vw };
  }
  const focal = () => (vh / 2) / Math.tan(cam.fov * D2R / 2);
  function place(rig, x, y, lenPx) {
    const f = focal(), d = f / Math.max(lenPx, 0.5);
    rig.position.set((x - vw / 2) * d / f, -(y - vh / 2) * d / f, -d);
  }
  const V = new THREE.Vector3(), V2 = new THREE.Vector3(), V3 = new THREE.Vector3();
  function toScreen(obj, x, y, z) { V.set(x, y, z).applyMatrix4(obj.matrixWorld).project(cam); return { x: (V.x + 1) / 2 * vw, y: (1 - V.y) / 2 * vh }; }
  const Q = new THREE.Quaternion(), Q2 = new THREE.Quaternion(), E = new THREE.Euler();
  const quat = (yaw, pitch, roll, out) => out.setFromEuler(E.set(pitch * D2R, yaw * D2R, roll * D2R, 'YXZ'));
  function scissor(top, bottom) { // полоса экрана по вертикали (CSS-пиксели)
    const t = clamp(top, 0, vh), b = clamp(bottom, 0, vh);
    renderer.setScissorTest(true); renderer.setScissor(0, vh - b, vw, Math.max(0, b - t));
  }

  // ── курсор / наклон телефона: лёгкий параллакс самолётов ──
  const ptr = { x: 0, y: 0, tx: 0, ty: 0 };
  const PQ = new THREE.Quaternion();
  function para(rig, k, x, y) {
    PQ.setFromEuler(E.set(ptr.y * 2.2 * k * D2R, ptr.x * 3.5 * k * D2R, 0, 'YXZ'));
    rig.quaternion.premultiply(PQ);
    return [x + ptr.x * vw * 0.006 * k, y + ptr.y * vh * 0.005 * k];
  }

  let docTop = {};
  const top = (s) => docTop[s] ?? 0;
  const hgt = (s) => docTop[s + ':h'] ?? 0;

  // маршрут: s - положение прокрутки; at - точка (кадр + доля, или доля экрана); size - длина модели (доля ширины экрана, при si - ширины кадра);
  // yaw 90 - нос влево, −90 - вправо, 0 - от зрителя; roll > 0 - крен влево; m - замены для телефона.
  // Пара точек с s и s + 1 и a 1 → 0 (или 0 → 1) - «склейка» за краем экрана: самолёт уже улетел, невидимо переходит к следующему заходу.
  const PH = 2.2; // на телефоне модели относительно крупнее
  const K = (k, f) => (phone && k.m && k.m[f] !== undefined ? k.m[f] : (f === 'size' && phone && !k.si ? Math.min(0.9, k[f] * PH) : k[f]));
  function route(L, sd) {
    let i = 0; while (i < L.length - 2 && sd >= L[i + 1].sv) i++;
    const A = L[i], B = L[i + 1];
    const t = ease(clamp((sd - A.sv) / Math.max(1, B.sv - A.sv)));
    return { i, A, B, t, a: lerp(K(A, 'a') ?? 1, K(B, 'a') ?? 1, t) };
  }
  function pose(R, M) { // положение, курс, длина по маршруту
    const { A, B, t } = R;
    const pa = anchor(K(A, 'at')), pb = anchor(K(B, 'at'));
    const la = K(A, 'size') * (A.si ? pa.w : vw), lb = K(B, 'size') * (B.si ? pb.w : vw);
    const len = Math.exp(lerp(Math.log(la), Math.log(lb), t));
    quat(A.yaw, A.pitch, A.roll, Q); quat(B.yaw, B.pitch, B.roll, Q2); Q.slerp(Q2, t);
    M.rig.quaternion.copy(Q);
    return { x: lerp(pa.x, pb.x, t), y: lerp(pa.y, pb.y, t), len };
  }
  const sway = (M, P, len, c, s) => { // самолёт чуть «дышит» в воздухе
    P.x += Math.sin(c * 0.31) * len * 0.05 * s; P.y += Math.sin(c * 0.47 + 1) * len * 0.025 * s;
    M.rig.quaternion.multiply(Q2.setFromEuler(E.set(Math.sin(c * 0.4) * 1.2 * D2R * s, 0, Math.sin(c * 0.55) * 3 * D2R * s)));
  };

  // ═════ Су-34 ═════
  const PLANE = [
    { s: () => 0, at: { img: '.hero-img', u: 0.62, v: 0.16 }, size: 0.24, yaw: 92, pitch: 4, roll: -5, a: 1, L: 'dusk', env: '.hero-img',
      m: { at: { img: '.hero-img', u: 0.42, v: 0.12 }, size: 0.6 } },
    { s: () => vh * 0.3, at: { vp: [0.72, 0.17] }, size: 0.2, yaw: 62, pitch: 9, roll: 48, a: 1, L: 'dusk', env: '.hero-img',
      m: { at: { vp: [0.66, 0.1] }, size: 0.45 } },
    // уходит в развороте за правый верхний край экрана
    { s: () => vh * 0.58, at: { vp: [1.32, -0.28] }, size: 0.15, yaw: 40, pitch: 12, roll: 45, a: 1, L: 'dusk', env: '.hero-img',
      m: { at: { vp: [1.4, -0.22] }, size: 0.32 } },
    { s: () => vh * 0.58 + 1, at: { vp: [1.32, -0.28] }, size: 0.15, yaw: 40, pitch: 12, roll: 45, a: 0, L: 'dusk', env: '.hero-img' },
    // «Вылет»: влетает слева, сбрасывает бомбы и уходит за правый край горизонтально
    { s: () => top('#sortie') - vh * 0.82, at: { img: '#sortie img', u: -0.42, v: 0.34 }, size: 0.3, yaw: -86, pitch: 1, roll: -8, a: 0, L: 'eve', env: '#sortie img', sc: 1 },
    { s: () => top('#sortie') - vh * 0.82 + 1, at: { img: '#sortie img', u: -0.42, v: 0.34 }, size: 0.3, yaw: -86, pitch: 1, roll: -8, a: 1, L: 'eve', env: '#sortie img', sc: 1,
      m: { size: 0.75 } },
    { s: () => top('#sortie') - vh * 0.5, at: { img: '#sortie img', u: 0.28, v: 0.32 }, size: 0.3, yaw: -84, pitch: 1, roll: -6, a: 1, drop: 0, L: 'eve', env: '#sortie img', sc: 1,
      m: { at: { img: '#sortie img', u: 0.4, v: 0.3 }, size: 0.75 } },
    { s: () => top('#sortie') - vh * 0.15, at: { img: '#sortie img', u: 0.62, v: 0.3 }, size: 0.29, yaw: -82, pitch: 1, roll: -3, a: 1, drop: 0.5, L: 'eve', env: '#sortie img', sc: 1,
      m: { at: { img: '#sortie img', u: 0.6, v: 0.29 }, size: 0.72 } },
    { s: () => top('#sortie') + vh * 0.22, at: { img: '#sortie img', u: 1.45, v: 0.27 }, size: 0.28, yaw: -80, pitch: 1, roll: 0, a: 1, drop: 1, L: 'eve', env: '#sortie img', sc: 1,
      m: { at: { img: '#sortie img', u: 1.25, v: 0.27 }, size: 0.7 } },
    { s: () => top('#sortie') + vh * 0.22 + 1, at: { img: '#sortie img', u: 1.45, v: 0.27 }, size: 0.28, yaw: -80, pitch: 1, roll: 0, a: 0, drop: 1, L: 'eve', env: '#sortie img', sc: 1 },
  ];
  // две КАБ-500С на внутренних подкрыльевых точках (таблица посадки игры: пилон ±1,3; −2,545; 1,35, верх корпуса бомбы на 0,197 выше её начала)
  const KAB_AT = [[1.3, -2.73, 1.35], [-1.3, -2.73, 1.35]];

  // ═════ F-15E в финале ═════
  const FIN = [
    { s: () => top('#play') - vh * 0.95, at: { img: '#play img', u: 1.3, v: -0.3 }, size: 0.62, si: 1, yaw: 112, pitch: -6, roll: 28, a: 1, L: 'dusk', env: '#play img' },
    { s: () => top('#play') - vh * 0.5, at: { img: '#play img', u: 0.7, v: 0.2 }, size: 0.42, si: 1, yaw: 110, pitch: -3, roll: 20, a: 1, L: 'dusk', env: '#play img' },
    { s: () => Math.min(docTop.max, top('#play') - vh * (phone ? 0.25 : 0.08)), at: { img: '#play img', u: 0.32, v: 0.38 }, size: 0.3, si: 1, yaw: 118, pitch: 2, roll: -6, a: 1, L: 'dusk', env: '#play img' },
  ];

  // ═════ SAMP/T ═════ (launchers.js игры: шарнир пакета (0; 2,55; 3,8), балки опор, лапы, пятка, цилиндр, мачта; слоты Aster)
  const SAMPT = { tp: [0, 2.55, 3.8], cylA: [0, 1.5, -0.6], cylB: [0, 2.56, 1.1], rodFrac: [0.3733, 0.7467, 1], mast: [2.25, 4.5, 6.75], jack: 0.6,
    arms: [[1.38, 1.46, -0.85, -90], [-1.38, 1.46, -0.85, 90], [1.38, 1.46, 5.15, -90], [-1.38, 1.46, 5.15, 90]], heel: { move: 1.36, plate: [0, 1.46, 5.53] }, slot: [-0.93, 0.65, -2.66] };
  function cylPose(el) {
    const P = SAMPT.tp, A = SAMPT.cylA, B = SAMPT.cylB, ce = Math.cos(el), se = Math.sin(el), by = B[1] - P[1], bz = B[2] - P[2];
    const y1 = P[1] + by * ce - bz * se - A[1], z1 = P[2] + by * se + bz * ce - A[2], y0 = B[1] - A[1], z0 = B[2] - A[2], L0 = Math.hypot(y0, z0);
    return { rot: Math.atan2(z1, y1) - Math.atan2(z0, y0), ext: Math.hypot(y1, z1) - L0, dir: [0, y0 / L0, z0 / L0] };
  }
  const grp = (parent, pos = [0, 0, 0]) => { const g = new THREE.Group(); g.position.fromArray(pos); parent.add(g); return g; };
  function rigSampt(M, aster) {
    const R = M.root, parts = {};
    for (const o of [...R.children]) { const n = o.name.split('|')[0].replace(/_\d+$/, ''); (parts[n] ||= []).push(o); }
    const into = (parent, o, off) => { parent.add(o); o.position.x -= off[0]; o.position.y -= off[1]; o.position.z -= off[2]; return o; };
    const S = { arms: [], jacks: [], cyl: [], mast: [], lids: [] };
    SAMPT.arms.forEach(([x, y, z, a], i) => {
      const pv = grp(R, [x, y, z]); S.arms.push({ pv, a: a * D2R });
      for (const o of parts['arm' + i] || []) into(pv, o, [x, y, z]);
      const q = grp(pv); S.jacks.push(q);
      for (const o of parts['jack' + i] || []) into(q, o, [x, y, z]);
    });
    const legs = grp(R); for (const o of parts.heel || []) into(legs, o, [0, 0, 0]);
    const plate = grp(legs, SAMPT.heel.plate); for (const o of parts.heelp || []) into(plate, o, SAMPT.heel.plate);
    S.heel = { legs, plate };
    const cpv = grp(R, SAMPT.cylA);
    for (let i = 0; i < 4; i++) { const q = grp(cpv); for (const o of parts['cyl' + i] || []) into(q, o, SAMPT.cylA); S.cyl.push(q); }
    S.cylPv = cpv;
    for (let i = 0; i < 3; i++) for (const o of parts['mast' + i] || []) S.mast.push({ o, y0: o.position.y, i });
    const pack = grp(R, SAMPT.tp);
    // пакет и крышки в файле уже в осях шарнира (как в игре: группа пакета стоит в tp)
    for (const o of parts.cradle || []) into(pack, o, [0, 0, 0]);
    for (let i = 0; i < 8; i++) for (const o of parts['lid' + i] || []) { into(pack, o, [0, 0, 0]); if (i === 0) S.lids.push(o); }
    S.pack = pack;
    const mg = grp(pack, SAMPT.slot); mg.add(aster.pivot); S.msl = mg; // Aster в слоте 0 (нос в −Z: пакет поднят - нос вверх)
    // срез контейнера: всё, что ниже его устья, у ракеты не рисуется - она не просвечивает сквозь пакет
    S.clip = new THREE.Plane(); S.mouth = [SAMPT.slot[0], SAMPT.slot[1], SAMPT.slot[2] - 2.45]; S.clipHost = pack;
    for (const m of aster.mats) { m.clippingPlanes = [S.clip]; m.clipShadows = true; }
    R.add(blob(4.8, 14, 0.04, 0.85));
    M.pivot.scale.setScalar(1 / M.size.z); // длина машины = 1, начало - земля под серединой
    collect(M);
    M.S = S;
  }
  function poseSampt(S, p) {
    const kA = seg(p, 0.02, 0.14), kJ = seg(p, 0.12, 0.26), el = 90 * D2R * seg(p, 0.26, 0.6), km = seg(p, 0.28, 0.55);
    S.arms.forEach((A) => { A.pv.rotation.y = A.a * kA; });
    for (const j of S.jacks) j.position.y = -SAMPT.jack * kJ;
    S.heel.legs.position.y = -SAMPT.heel.move * kJ; S.heel.plate.rotation.x = Math.PI / 2 * kJ;
    S.pack.rotation.x = el;
    const c = cylPose(el); S.cylPv.rotation.x = c.rot;
    for (let i = 1; i < S.cyl.length; i++) S.cyl[i].position.fromArray(c.dir).multiplyScalar(c.ext * SAMPT.rodFrac[i - 1]);
    for (const m of S.mast) m.o.position.y = m.y0 + SAMPT.mast[m.i] * km;
    const q = clamp((p - 0.62) / 0.38);           // пуск
    const H = q > 0 ? 34 * Math.pow(q, 1.9) : 0;   // метры вверх по оси контейнера
    S.msl.position.z = SAMPT.slot[2] - H;
    S.msl.visible = q > 0;
    for (const l of S.lids) l.visible = q <= 0;
    return { q, H };
  }

  // ═════ «Искандер-К» ═════ (паспорт сборщика: стрелы boom_r/l - шарнир (±0,58; 1,55; 6,32), 0…90° вокруг X; крышки отсека lid_r/l - вокруг Z
  // на 205° наружу; опоры - вниз на 0,45 м; цилиндры подъёма наводятся друг на друга; ракета 3М14 выходит вверх по оси правого контейнера)
  const ISK = { boom: Math.PI / 2, lid: 205 * D2R, jack: 0.45, tpk: [0, 0.751, -4.185], half: 3.675, mslHalf: 3.1, up: 9, R: 11, turn: 72 * D2R };
  function rigIsk(M, kal) {
    const R = M.root; M.rig.updateMatrixWorld(true);
    const by = (n) => R.getObjectByName(n);
    const pivotAt = (node, pos) => { if (!node) return null; const p = new THREE.Group(); node.parent.add(p); p.position.fromArray(pos); p.quaternion.copy(node.quaternion); p.updateMatrixWorld(true); p.attach(node); return p; };
    const S = { booms: [by('boom_r'), by('boom_l')], lids: [], jacks: [], cyl: [] };
    // файл в боевом положении; шарниры - по паспорту (у деталей с геометрией сжатие сдвинуло собственную точку)
    S.lids.push({ p: pivotAt(by('lid_r'), [1.535, 3.18, 0]), s: -1 }, { p: pivotAt(by('lid_l'), [-1.535, 3.18, 0]), s: 1 });
    for (const n of ['jack_fr', 'jack_fl', 'jack_rr', 'jack_rl']) { const j = by(n); if (j) S.jacks.push({ o: j, y0: j.position.y }); }
    for (const [b, r, x] of [['cyl_r_body', 'cyl_r_rod', 1], ['cyl_l_body', 'cyl_l_rod', -1]]) {
      const bp = pivotAt(by(b), [0.15 * x, 1.38, 5.32]), rp = pivotAt(by(r), [-0.43 * x, -0.15, -3.0]);
      S.cyl.push({ bp, rp, bx0: bp.rotation.x, rx0: rp.rotation.x });
    }
    const mg = grp(S.booms[0], ISK.tpk); mg.add(kal.pivot); S.msl = mg;
    S.clip = new THREE.Plane(); S.mouth = [ISK.tpk[0], ISK.tpk[1], ISK.tpk[2] - ISK.half]; S.clipHost = S.booms[0];
    for (const m of kal.mats) { m.clippingPlanes = [S.clip]; m.clipShadows = true; }
    // крылья и рули 3М14 (паспорт сборщика «Искандер-К/3М14»): в контейнере сложены, раскрываются после выхода.
    // Крылья - вокруг Y у корня (правое −90°, левое +90°: назад вдоль корпуса); рули - к корпусу, назад (поворот на 90° вокруг касательной у корня)
    M.rig.updateMatrixWorld(true);
    const KR = kal.root, kb = (n) => KR.getObjectByName(n);
    S.fold = [
      { p: pivotAt(kb('wing_r'), [0.2426, 0.085, 0.5]), ax: 'y', a: -90 }, { p: pivotAt(kb('wing_l'), [-0.2426, 0.085, 0.5]), ax: 'y', a: 90 },
      { p: pivotAt(kb('fin_1'), [0, 0.268, 2.8215]), ax: 'x', a: 90 }, { p: pivotAt(kb('fin_3'), [0, -0.268, 2.8215]), ax: 'x', a: -90 },
      { p: pivotAt(kb('fin_2'), [0.268, 0, 2.8215]), ax: 'y', a: -90 }, { p: pivotAt(kb('fin_4'), [-0.268, 0, 2.8215]), ax: 'y', a: 90 },
    ].filter((f) => f.p);
    R.add(blob(4.6, 15.5, 0.04, 0.85));
    M.rig.updateMatrixWorld(true);
    const W = new THREE.Vector3();
    S.ang = (c) => { R.worldToLocal(c.rp.getWorldPosition(W)); return Math.atan2(W.z - c.bp.position.z, W.y - c.bp.position.y); };
    for (const c of S.cyl) c.a0 = S.ang(c);
    M.pivot.scale.setScalar(1 / M.size.z);
    collect(M);
    M.S = S;
  }
  // путь ракеты от центра контейнера: вверх по оси на ISK.up, дуга радиуса R в сторону кормы на turn, дальше прямо
  function iskPath(h) {
    if (h <= ISK.up) return { y: 0, z: -h, f: 0 };
    const arc = ISK.R * ISK.turn;
    if (h <= ISK.up + arc) { const f = (h - ISK.up) / ISK.R; return { y: ISK.R * (1 - Math.cos(f)), z: -(ISK.up + ISK.R * Math.sin(f)), f }; }
    const f = ISK.turn, d = h - ISK.up - arc;
    return { y: ISK.R * (1 - Math.cos(f)) + d * Math.sin(f), z: -(ISK.up + ISK.R * Math.sin(f)) - d * Math.cos(f), f };
  }
  function poseIsk(M, p) {
    const S = M.S;
    const kL = seg(p, 0.0, 0.14), kJ = seg(p, 0.1, 0.24), kB = seg(p, 0.24, 0.58);
    for (const l of S.lids) l.p.rotation.set(0, 0, l.s * ISK.lid * kL);
    for (const j of S.jacks) j.o.position.y = j.y0 + ISK.jack * (1 - kJ);
    for (const b of S.booms) b.rotation.set(ISK.boom * kB, 0, 0);
    M.rig.updateMatrixWorld(true);
    for (const c of S.cyl) { const d = S.ang(c) - c.a0; c.bp.rotation.x = c.bx0 + d; c.rp.rotation.x = c.rx0 + d - (ISK.boom * kB - ISK.boom); }
    const q = clamp((p - 0.62) / 0.38);
    const h = q > 0 ? 150 * Math.pow(q, 2.1) : 0; // путь центра ракеты, м
    const P = iskPath(h);
    S.msl.position.set(ISK.tpk[0], ISK.tpk[1] + P.y, ISK.tpk[2] + P.z);
    S.msl.rotation.set(P.f, 0, 0);
    S.msl.visible = q > 0;
    // крылья и рули раскрываются, когда ракета целиком вышла и начинает дугу (около 0,4 с полёта)
    const kD = seg(h - ISK.mslHalf - ISK.half, 0.3, 4.5);
    for (const f of S.fold) f.p.rotation[f.ax] = f.a * D2R * (1 - kD);
    return { q, h };
  }

  // ═════ дым и пламя ракет (экранные координаты) ═════
  const ortho = new THREE.OrthographicCamera(0, vw, 0, -vh, -10, 10);
  const fx = new THREE.Scene();
  const N = 32;
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((N + 1) * 2 * 3), 3));
  const tuv = new Float32Array((N + 1) * 2 * 2);
  for (let i = 0; i <= N; i++) tuv.set([0, i / N, 1, i / N], i * 4);
  trailGeo.setAttribute('uv', new THREE.BufferAttribute(tuv, 2));
  const idx = []; for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  trailGeo.setIndex(idx);
  const trailMat = new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false,
    uniforms: { uT: { value: 0 }, uA: { value: 1 }, uLen: { value: 1 }, uLit: { value: new THREE.Color('#f3f1ec') }, uShade: { value: new THREE.Color('#a9b0b8') } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec2 vUv; uniform float uT, uA, uLen; uniform vec3 uLit, uShade;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main(){
        float s = vUv.x * 2.0 - 1.0, y = vUv.y;
        vec2 p = vec2(vUv.x * 3.0, y * uLen * 0.012 - uT * 0.6);
        float k = n(p * 2.0) * 0.55 + n(p * 5.0) * 0.3 + n(p * 11.0) * 0.15;
        float edge = 1.0 - smoothstep(0.35 + 0.35 * k, 1.0, abs(s));
        float a = edge * (0.55 + 0.45 * k) * mix(0.55, 0.95, y) * smoothstep(0.0, 0.05, y) * smoothstep(1.0, 0.94, y);
        vec3 c = mix(uShade, uLit, clamp(0.5 + 0.5 * s + (k - 0.5) * 0.6, 0.0, 1.0));
        gl_FragColor = vec4(c, a * uA);
      }`,
  });
  const trail = new THREE.Mesh(trailGeo, trailMat); trail.frustumCulled = false; fx.add(trail);
  const fc = document.createElement('canvas'); fc.width = 64; fc.height = 128;
  { const g = fc.getContext('2d'); const gr = g.createRadialGradient(32, 18, 1, 32, 40, 64);
    gr.addColorStop(0, 'rgba(255,250,225,1)'); gr.addColorStop(0.25, 'rgba(255,205,120,0.9)'); gr.addColorStop(0.6, 'rgba(255,140,50,0.35)'); gr.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 128); }
  const flameTex = new THREE.CanvasTexture(fc); flameTex.colorSpace = THREE.SRGBColorSpace;
  const flame = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: flameTex, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false }));
  flame.frustumCulled = false; fx.add(flame);
  // pts - точки следа от пусковой к хвосту (экран); tail, nose - хвост и нос ракеты (экран)
  function drawSmoke(pts, tail, nose, t, alpha) {
    const pos = trailGeo.attributes.position.array, n = pts.length - 1;
    const Lp = Math.hypot(nose.x - tail.x, nose.y - tail.y), wA = Lp * 0.55, wB = Lp * 0.1;
    let len = 0;
    for (let k = 0; k <= N; k++) {
      const f = k / N, j = Math.min(n - 1, Math.floor(f * n)), g = f * n - j, a = pts[j], b = pts[j + 1];
      const px = lerp(a.x, b.x, g), py = lerp(a.y, b.y, g);
      const dx = b.x - a.x, dy = b.y - a.y, dl = Math.hypot(dx, dy) || 1, nx = -dy / dl, ny = dx / dl;
      const w = lerp(wA, wB, Math.pow(f, 0.6)) * (1 + 0.15 * Math.sin(f * 9 + t * 6)) / 2;
      pos.set([px - nx * w, -(py - ny * w), 0, px + nx * w, -(py + ny * w), 0], k * 6);
      if (k) len += dl / n;
    }
    trailGeo.attributes.position.needsUpdate = true;
    trailMat.uniforms.uT.value = t * 4; trailMat.uniforms.uLen.value = Math.max(1, len * n); trailMat.uniforms.uA.value = alpha;
    const fl = Lp * 0.34, ang = Math.atan2(nose.x - tail.x, tail.y - nose.y);
    flame.scale.set(Lp * 0.13, fl, 1);
    flame.position.set(tail.x - Math.sin(ang) * fl * 0.42, -(tail.y + Math.cos(ang) * fl * 0.42), 1);
    flame.rotation.z = -ang;
    flame.material.opacity = alpha;
    renderer.render(fx, ortho);
  }

  // ═════ состояние ═════
  let plane = null, kabs = [], f15 = null, f15Loading = null, sampt = null, samptLoading = null, isk = null, iskLoading = null;
  let planeIn = 0, f15In = 0, samptIn = 0, iskIn = 0;
  let clock = 0, lastMove = performance.now();

  function measure() {
    vw = html.clientWidth; vh = innerHeight;
    phone = matchMedia('(max-width: 900px)').matches;
    docTop = {};
    for (const s of ['#statement', '#sortie', '#defense', '#defense .frame', '#waves .frame', '#play']) { const e = $(s); if (e) { docTop[s] = e.getBoundingClientRect().top + scrollY; docTop[s + ':h'] = e.offsetHeight; } }
    docTop.max = Math.max(1, html.scrollHeight - vh);
    renderer.setSize(vw, vh); cam.aspect = vw / vh; cam.updateProjectionMatrix();
    ortho.right = vw; ortho.bottom = -vh; ortho.updateProjectionMatrix();
    for (const L of [PLANE, FIN]) L.forEach((k, i) => { k.sv = k.s(); if (i) k.sv = Math.max(k.sv, L[i - 1].sv + 1); }); // точки - по порядку, даже если раздел короткий
  }

  // ── кадр ──
  let sd = scrollY;
  let running = false, last = 0, ema = 16, frames = 0;
  function kick() { if (!running && !document.hidden) { running = true; last = performance.now(); requestAnimationFrame(tick); } }
  function tick(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const more = draw(dt, now);
    if (dt > 0) { ema = lerp(ema, dt * 1000, 0.05); frames++; }
    if (frames > 45 && ema > 28 && dpr > 1) { dpr = Math.max(1, dpr * 0.75); renderer.setPixelRatio(dpr); renderer.setSize(vw, vh); frames = 0; }
    else if (frames > 60 && ema > 50 && phone) { off(); return; }
    if (more) requestAnimationFrame(tick); else running = false;
  }
  function off() { running = false; canvas.remove(); html.classList.remove('fly-on', 'fly-ready'); removeEventListener('scroll', onScroll); }

  function draw(dt, now) {
    const y = scrollY;
    sd = Math.abs(y - sd) < 0.5 ? y : lerp(sd, y, 1 - Math.exp(-dt * 12));
    let more = sd !== y;
    const pk = 1 - Math.exp(-dt * 4);
    ptr.x = lerp(ptr.x, ptr.tx, pk); ptr.y = lerp(ptr.y, ptr.ty, pk);
    if (Math.abs(ptr.x - ptr.tx) + Math.abs(ptr.y - ptr.ty) > 0.002) more = true;
    const swayOn = now - lastMove < 60000;
    if (swayOn) clock += dt;
    renderer.setScissorTest(false);
    renderer.clear();
    if (plane && drawPlane(dt, swayOn)) more = true;
    if (drawGround(dt, sampt, '#defense .frame', 'sampt')) more = true;
    if (drawGround(dt, isk, '#waves .frame', 'isk')) more = true;
    if (drawFin(dt, swayOn)) more = true;
    manage();
    return more;
  }

  function drawPlane(dt, swayOn) {
    let more = false;
    planeIn = Math.min(1, planeIn + dt / 0.9); if (planeIn < 1) more = true;
    const R = route(PLANE, sd), a = R.a * planeIn;
    if (a <= 0.004) return more;
    const P = pose(R, plane);
    if (R.i === 0) { sway(plane, P, P.len, clock, 1 - R.t); if (swayOn && R.t < 0.99) more = true; }
    [P.x, P.y] = para(plane.rig, 0.8, P.x, P.y);
    place(plane.rig, P.x, P.y, P.len);
    // бомбы: отделяются и падают по баллистике - вперёд по ходу самолёта (отстают от него), вниз, нос опускается
    const drop = lerp(R.A.drop ?? 0, R.B.drop ?? 0, R.t);
    kabs.forEach((kb, j) => {
      const d = clamp((drop - j * 0.1) / 0.9);
      kb.position.set(KAB_AT[j][0], KAB_AT[j][1] - Math.pow(d, 1.7) * 52, KAB_AT[j][2] + d * 9);
      kb.rotation.x = -d * 58 * D2R;
    });
    const envK = applyLight(R.A.L, R.B.L, R.t);
    setEnv(plane, envFrom($(R.t < 0.5 ? R.A.env : R.B.env)), envK);
    setAlpha(plane, a);
    only(plane);
    // в «Вылете» всё, что ниже кадра, не видно: бомбы уходят за его нижний край
    if (R.A.sc) { const f = $('#sortie .frame').getBoundingClientRect(); scissor(-1e5, f.bottom); }
    renderer.render(scene, cam);
    renderer.setScissorTest(false);
    plane.rig.visible = false;
    return more;
  }

  function drawFin(dt, swayOn) {
    if (!f15) return false;
    const img = $('#play img'); const r = img.getBoundingClientRect();
    if (r.bottom < 0 || r.top > vh * 1.2) return false;
    let more = false;
    f15In = Math.min(1, f15In + dt / 0.8); if (f15In < 1) more = true;
    const R = route(FIN, sd);
    const P = pose(R, f15);
    const settled = R.i === FIN.length - 2 ? R.t : 0; // на своём месте - чуть «дышит»
    if (settled > 0.5) { sway(f15, P, P.len, clock, (settled - 0.5) * 2); if (swayOn) more = true; }
    [P.x, P.y] = para(f15.rig, 0.8, P.x, P.y);
    place(f15.rig, P.x, P.y, P.len);
    setEnv(f15, envFrom(img), applyLight('dusk'));
    setAlpha(f15, f15In);
    only(f15);
    if (sd > FIN[FIN.length - 1].sv + 2) scissor(r.top, 1e5); // встал на место - дальше уезжает вместе с кадром, за его верхний край не вылезает
    renderer.render(scene, cam);
    renderer.setScissorTest(false);
    f15.rig.visible = false;
    return more;
  }

  // машины на земле кадра: стоят неподвижно в рамке, прокрутка только разворачивает их и пускает ракету
  const GROUND = {
    sampt: { u: 0.3, v: 0.93, len: 0.46, um: 0.34, vm: 0.94, lenm: 0.56, yaw: -128, L: 'day', s0: 0.6, s1: 0.1 },
    isk: { u: 0.7, v: 0.955, len: 0.62, um: 0.66, vm: 0.96, lenm: 0.7, yaw: 127, L: 'eve', s0: 0.55, s1: 0.35 },
  };
  function drawGround(dt, M, sel, k) {
    const fr = $(sel); if (!fr || !M) return false;
    const G = GROUND[k], B = boxPt(fr, phone ? G.um : G.u, phone ? G.vm : G.v);
    if (B.bottom < -vh * 0.5 || B.top > vh) return false;
    const p = clamp((sd - (top(sel) - vh * G.s0)) / (vh * (G.s0 + (phone ? G.s1 * 0.4 : G.s1))));
    let more = false;
    const fin = k === 'sampt' ? (samptIn = Math.min(1, samptIn + dt / 0.7)) : (iskIn = Math.min(1, iskIn + dt / 0.7));
    if (fin < 1) more = true;
    let launch;
    if (k === 'sampt') launch = poseSampt(M.S, p); else launch = poseIsk(M, p);
    quat(G.yaw, 4, 0, Q); M.rig.quaternion.copy(Q);
    // машина стоит на оси своей камеры, на место в кадре её переносит сдвиг изображения (setViewOffset): вид на неё не меняется при прокрутке,
    // и колёса стоят в одной точке снимка - иначе при движении кадра по экрану менялся бы угол взгляда и машина «ползла» по земле
    const d = focal() / Math.max(B.w * (phone ? G.lenm : G.len), 0.5);
    M.rig.position.set(0, 0, -d);
    cam.setViewOffset(vw, vh, vw / 2 - B.x, vh / 2 - B.y, vw, vh);
    const img = fr.querySelector('img');
    setEnv(M, envFrom(img), applyLight(G.L));
    setAlpha(M, fin);
    only(M);
    M.rig.updateMatrixWorld(true);
    const S = M.S; // срез контейнера - в мире, по текущему положению пакета или стрелы
    S.clip.setFromNormalAndCoplanarPoint(V2.set(0, 0, -1).transformDirection(S.clipHost.matrixWorld), S.clipHost.localToWorld(V3.fromArray(S.mouth)));
    scissor(-1e5, B.bottom);
    renderer.render(scene, cam);
    M.rig.visible = false;
    // пламя и дым - только когда сопло вышло из контейнера
    if (k === 'sampt' && launch.H > 4.95) {
      const sl = SAMPT.slot, S = M.S;
      const pts = [toScreen(S.pack, sl[0], sl[1], sl[2] - 2.45), toScreen(S.pack, sl[0], sl[1], sl[2] - launch.H + 2.45)];
      const nose = toScreen(S.pack, sl[0], sl[1], sl[2] - launch.H - 2.45);
      drawSmoke(pts, pts[1], nose, launch.q, clamp(1 - (B.top - pts[1].y) / (B.h * 0.35)) * 0.9);
    }
    if (k === 'isk' && launch.h - ISK.mslHalf > ISK.half + 0.1) {
      const bm = M.S.booms[0], tp = ISK.tpk, at = (h) => { const P = iskPath(h); return toScreen(bm, tp[0], tp[1] + P.y, tp[2] + P.z); };
      const h0 = ISK.half, h1 = launch.h - ISK.mslHalf, pts = [];
      for (let i = 0; i <= 12; i++) pts.push(at(lerp(h0, h1, i / 12)));
      const tail = pts[12], nose = at(launch.h + ISK.mslHalf);
      drawSmoke(pts, tail, nose, launch.q, clamp(1 - (B.top - tail.y) / (B.h * 0.5)) * clamp(1.4 - launch.q) * 0.9);
    }
    renderer.setScissorTest(false);
    cam.clearViewOffset();
    return more;
  }

  // ═════ подгрузка по мере прокрутки; на телефоне дальние модели выгружаются ═════
  function manage() {
    const near = (s, k) => Math.abs(sd + vh / 2 - (top(s) + hgt(s) / 2)) < vh * k + hgt(s) / 2;
    if (near('#defense', 2.2) && !sampt && !samptLoading) {
      samptLoading = Promise.all([load('sampt.glb', false), load('aster.glb', false)]).then(([M, A]) => {
        rigSampt(M, A); scene.remove(A.rig); sampt = M; samptLoading = null; samptIn = 0; mark(); kick();
      }).catch((e) => { samptLoading = null; console.warn(e); });
    }
    if (near('#waves .frame', 2.2) && !isk && !iskLoading) {
      iskLoading = Promise.all([load('iskander_k.glb', false), load('kalibr.glb', false)]).then(([M, A]) => {
        rigIsk(M, A); scene.remove(A.rig); isk = M; iskLoading = null; iskIn = 0; mark(); kick();
      }).catch((e) => { iskLoading = null; console.warn(e); });
    }
    if (near('#play', 2.2) && !f15 && !f15Loading) {
      f15Loading = load('f15e.glb').then((M) => { f15 = M; f15Loading = null; f15In = 0; mark(); kick(); }).catch((e) => { f15Loading = null; console.warn(e); });
    }
    if (phone) {
      if (sampt && !near('#defense', 3.5)) { unload(sampt); sampt = null; }
      if (isk && !near('#waves .frame', 3.5)) { unload(isk); isk = null; }
    }
  }

  const mark = () => { html.dataset.fly = ['plane', sampt && 'sampt', isk && 'isk', f15 && 'f15'].filter(Boolean).join(' '); };
  // ── события ──
  function onScroll() { lastMove = performance.now(); kick(); }
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', () => { measure(); kick(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
  new ResizeObserver(() => { measure(); kick(); }).observe(document.body);
  if (matchMedia('(pointer: fine)').matches) {
    addEventListener('pointermove', (e) => { ptr.tx = clamp(e.clientX / vw * 2 - 1, -1, 1); ptr.ty = clamp(e.clientY / vh * 2 - 1, -1, 1); kick(); }, { passive: true });
    document.addEventListener('pointerleave', () => { ptr.tx = 0; ptr.ty = 0; kick(); });
  } else {
    let b0 = null;
    addEventListener('deviceorientation', (e) => {
      if (e.gamma == null) return; if (b0 == null) b0 = e.beta;
      ptr.tx = clamp(e.gamma / 25, -1, 1); ptr.ty = clamp((e.beta - b0) / 25, -1, 1); kick();
    }, { passive: true });
  }
  measure();

  // ── загрузка: сначала самолёт с бомбами (он на первом экране) ──
  const [P, KB] = await Promise.all([load(phone ? 'su34-1k.glb' : 'su34.glb'), load('kab500s.glb', false)]);
  kabs = KAB_AT.map((at, j) => {
    const g = j === 0 ? KB.root : KB.root.clone(true);
    const w = new THREE.Group(); w.add(g);
    P.root.add(w); return w;
  });
  scene.remove(KB.rig);
  collect(P); // бомбы - вместе с самолётом (отражения, прозрачность)
  plane = P;
  html.classList.add('fly-ready');
  kick();
  html.dataset.fly = 'plane';
}
