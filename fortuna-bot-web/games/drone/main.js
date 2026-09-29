// «Симулятор Летки» — основной модуль: лётная модель, ракеты, радар, СПО, ИИ «Подстилки улитки», HUD, меню, тест графики.
/* global THREE */
import { SCHEDULE_VERSION, H_CAP, UNIT_KILLS, buildSchedule, maxKills } from './schedule.js';
import { MISSILES, CATS, KIND_TAG, KIND_FULL } from './missiles.js';
import { WORLD, SUN_DIR, TOWNS, AIRFIELD, terrainH, airfieldH, buildWorld, makeParticles, radialTex, lin } from './world.js';
import { STATIONS, stationPos, buildShipGeo, buildElevon, buildMissileGeo, buildJet, buildTanker, TANKER_DROGUE, JET_SPECS, M as Mx, part, mergeParts } from './models.js';
import { createPipeline } from './post.js';

// ═════════════ Параметры и режимы ═════════════
const Q = new URLSearchParams(location.search);
const TRAINING = Q.get('mode') === 'training';
const TEST = Q.get('test') === '1'; // отладочный хук window.__g — только вместе с mode=training
const SEED = ((parseInt(Q.get('seed'), 10) || Math.floor(Math.random() * 2147483646) + 1) >>> 0);
const IS_TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const IOS = /iPhone|iPod/.test(navigator.userAgent || '');
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrapPI = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const D2R = Math.PI / 180, G0 = 9.81;
const rnd = Math.random; // визуальная и тактическая случайность — не влияет на расписание
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* хранилище недоступно */ } },
};
const rhoAt = (y) => Math.exp(-Math.max(0, y) / 9000);   // относительная плотность воздуха

const FUEL_START = 190, FUEL_MAX = 240, FUEL_PICKUP = 70; // топливо — в секундах полёта на крейсерском режиме
const MAX_LOAD = 1500;
const STATION_KIND = { tip: { name: 'законцовка', lim: 110 }, mid: { name: 'средний', lim: 200 }, inner: { name: 'корневой', lim: 360 }, belly: { name: 'подфюзеляжный', lim: 500 } };
const DEFAULT_LOADOUT = ['aim9l', 'aim120c', null, null, null, null, 'aim120c', 'aim9l'];

// ═════════════ Пресеты графики ═════════════
// perf — настройки производительности по умолчанию для пресета (игрок может поменять в «Настройках»):
//   scale — масштаб рендера, dyn — динамическое разрешение, min — нижняя граница масштаба, target — цель к/с,
//   up — апскейлер ('off' | 'cas' | 'fsr'), sharp — резкость, aa — сглаживание ('off' | 'fxaa' | 'msaa').
// post — эффекты кадра (свечение, лучи, цветокоррекция); у «Низкого» конвейера нет вовсе — самый дешёвый путь.
const PRESETS = {
  low:    { name: 'Низкий',  desc: 'слабые телефоны', prMul: 0.8, prCap: 1, terrainN: 150, trees: 600, treeDist: 6000, bldPerTown: 22, clouds: 14, cloudPuffs: 5, particles: 1000,
    pbr: false, shadows: false, windows: false, detail: false, contrails: false,
    perf: { scale: 1, dyn: true, min: 0.55, target: 60, up: 'off', sharp: 0.4, aa: 'off' } },
  medium: { name: 'Средний', desc: 'большинство устройств', prMul: 1, prCap: 1.5, terrainN: 240, trees: 2400, treeDist: 9000, bldPerTown: 40, clouds: 26, cloudPuffs: 8, particles: 2200,
    pbr: true, shadows: false, windows: true, detail: true, cloudShadows: true, contrails: true,
    perf: { scale: 1, dyn: true, min: 0.6, target: 60, up: 'cas', sharp: 0.45, aa: 'fxaa' }, post: { bloom: 0, grade: 0.1 } },
  high:   { name: 'Высокий', desc: 'мощные ПК и планшеты', prMul: 1, prCap: 2, terrainN: 340, trees: 6000, treeDist: 12000, bldPerTown: 65, clouds: 40, cloudPuffs: 9, particles: 4000,
    pbr: true, shadows: true, windows: true, detail: true, cloudShadows: true, cloudSprites: true, treeVariety: true, contrails: true, waterAnim: true,
    perf: { scale: 1, dyn: true, min: 0.67, target: 60, up: 'cas', sharp: 0.4, aa: 'msaa' }, post: { bloom: 0.35, grade: 0.15, vignette: 0.12 } },
  // топовые: HDR-конвейер, свечение, тени 4K с широким охватом, PBR-земля с микрорельефом, лучи от солнца («Кино»)
  ultra:  { name: 'Ультра', desc: 'HDR-свечение, PBR-земля, тени 4K', prMul: 1, prCap: 2, terrainN: 460, trees: 10000, treeDist: 16000, bldPerTown: 80, clouds: 55, cloudPuffs: 12, particles: 6000,
    pbr: true, shadows: true, shadowMap: 4096, shadowBox: 400, windows: true, detail: true, terrainPBR: true, cloudShadows: true, cloudSprites: true, treeVariety: true, contrails: true, waterAnim: true, flares: true, lights: true,
    perf: { scale: 1, dyn: true, min: 0.67, target: 60, up: 'fsr', sharp: 0.35, aa: 'msaa' }, post: { bloom: 0.75, vignette: 0.22, grade: 0.25 } },
  cinema: { name: 'Кино', desc: 'ультра + лучи, киноцвет, зерно', prMul: 1, prCap: 2.5, terrainN: 520, trees: 14000, treeDist: 20000, bldPerTown: 90, clouds: 70, cloudPuffs: 13, particles: 8000,
    pbr: true, shadows: true, shadowMap: 4096, shadowBox: 450, windows: true, detail: true, terrainPBR: true, cloudShadows: true, cloudSprites: true, treeVariety: true, contrails: true, waterAnim: true, flares: true, lights: true,
    perf: { scale: 0.85, dyn: true, min: 0.67, target: 60, up: 'fsr', sharp: 0.45, aa: 'msaa' },
    post: { bloom: 1.0, vignette: 0.38, grain: 0.03, grade: 1, ca: 0.0022, threshold: 0.8, rays: true, raysK: 0.55, exposure: 1.1 } },
};
let gfxKey = store.get('fortuna_drone_gfx');
if (!PRESETS[gfxKey]) gfxKey = IS_TOUCH ? 'low' : 'medium';
const P = PRESETS[gfxKey];
const DPR = window.devicePixelRatio || 1;
const prFor = (p) => Math.min(DPR * p.prMul, p.prCap);
// настройки производительности и экрана (сбрасываются к умолчаниям пресета при его смене)
const PERF_KEYS = ['scale', 'dyn', 'min', 'target', 'up', 'sharp', 'aa'];
let perf = { ...P.perf, cap: 0, p3: false, fps: false, immersive: true };
try {
  const sp = JSON.parse(store.get('fortuna_drone_perf') || 'null');
  if (sp && typeof sp === 'object') {
    for (const k of ['cap', 'p3', 'fps', 'immersive']) if (k in sp) perf[k] = sp[k];
    if (sp.preset === gfxKey) for (const k of PERF_KEYS) if (k in sp) perf[k] = sp[k];
  }
} catch (_) { /* по умолчанию */ }
const savePerf = () => store.set('fortuna_drone_perf', JSON.stringify({ ...perf, preset: gfxKey }));
const P3_OK = (() => { try { return matchMedia('(color-gamut: p3)').matches && 'drawingBufferColorSpace' in WebGL2RenderingContext.prototype; } catch (_) { return false; } })();

// ═════════════ Режимы игры ═════════════
// Аркада прощает ошибки, Реализм — полная энергетика, только СПО/датчик пуска, умный противник, ×1,5 очков.
const MODES = {
  arcade: { name: 'Аркада', desc: 'все ракеты видны на экране, меньше урона, больше ловушек, мягкий противник',
    gmax: 15, wCap: 1.15, agil: 11, vStall: 50, bleed: 0.5, dmgTaken: 0.5, aiSkill: 0.7, cm: 48, gunCone: 4, gunHome: 3, lockT: 0.25, fuelK: 1.4, drogueR: 60, allMissiles: true, scoreK: 1 },
  real: { name: 'Реализм', desc: 'только СПО и датчик пуска, полная энергетика и урон, опытный противник, очки ×1,5',
    gmax: 12, wCap: 0.9, agil: 8, vStall: 75, bleed: 1, dmgTaken: 0.9, aiSkill: 1, cm: 32, gunCone: 1.5, gunHome: 0, lockT: 0.5, fuelK: 1, drogueR: 32, allMissiles: false, scoreK: 1.5 },
};
// Обучение: по игроку пускают ракеты всех типов с подсказками и паузой-объяснением; проиграть нельзя, наград нет.
MODES.training = { name: 'Обучение', desc: 'по вам пускают разные ракеты, подсказки и объяснения с паузой, проиграть нельзя',
  gmax: 15, wCap: 1.15, agil: 11, vStall: 50, bleed: 0.5, dmgTaken: 0.3, aiSkill: 0.6, cm: 99, gunCone: 4, gunHome: 3, lockT: 0.25, fuelK: 1, fuelBurn: 0, drogueR: 60, allMissiles: true, scoreK: 0, training: true };
let modeKey = store.get('fortuna_drone_mode');
if (!MODES[modeKey] || (modeKey === 'training' && !TRAINING)) modeKey = 'arcade'; // в партии на награду обучение недоступно
let MODE = MODES[modeKey];

// ═════════════ Рендер, сцена, мир ═════════════
// Линейный цвет: материалы считают свет в линейном пространстве, на выходе — ACES + sRGB.
// Без конвейера это делает сам renderer; с конвейером (post.js) — композит-шейдер.
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', logarithmicDepthBuffer: true });
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = !!P.shadows; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
if (perf.p3 && P3_OK) { try { renderer.getContext().drawingBufferColorSpace = 'display-p3'; } catch (_) { perf.p3 = false; } }
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(65, 1, 1, 90000);
camera.rotation.order = 'YXZ';
let VW = 1, VH = 1, pipe = null;
const basePR = prFor(P);
// конвейер нужен, если есть эффекты кадра, сглаживание, апскейлер или широкий цвет
function needPipe() { return !!P.post || perf.aa !== 'off' || perf.up !== 'off' || (perf.p3 && P3_OK); }
function rebuildPipe() {
  if (pipe) { pipe.dispose(); pipe = null; }
  if (needPipe()) {
    const pc = P.post || {};
    pipe = createPipeline(renderer, { ...pc, exposure: pc.exposure || 1.15, scale: perf.dyn ? dr.scale : perf.scale, upscaler: perf.up, sharp: perf.sharp, aa: perf.aa, p3: perf.p3 && P3_OK });
    renderer.toneMapping = THREE.NoToneMapping; // тонмаппинг и гамму делает композит
    renderer.setPixelRatio(basePR);
  } else {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.setPixelRatio(basePR * (perf.dyn ? dr.scale : perf.scale));
  }
  scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; }); // смена тонмаппинга — пересборка шейдеров
  resize();
}
// Динамическое разрешение: каждые 0,5 с сравниваем среднее время кадра с целью и двигаем масштаб
const dr = { scale: perf.scale, acc: 0, n: 0, t: 0, fps: 0 };
function drUpdate(ms) {
  dr.acc += ms; dr.n++; dr.t += ms;
  if (dr.t < 500) return;
  const avg = dr.acc / dr.n; dr.fps = 1000 / avg; dr.acc = dr.n = dr.t = 0;
  if (!perf.dyn) return;
  const goal = 1000 / (perf.cap || perf.target);
  let s = dr.scale;
  if (avg > goal * 1.08) s -= avg > goal * 1.5 ? 0.1 : 0.04;
  else if (avg < goal * 0.82) s += 0.03;
  s = clamp(s, perf.min, perf.scale);
  if (Math.abs(s - dr.scale) >= 0.01) { dr.scale = s; if (pipe) pipe.setScale(s); else renderer.setPixelRatio(basePR * s); resize(); }
}
function resize() {
  VW = window.innerWidth; VH = window.innerHeight;
  renderer.setSize(VW, VH, false); camera.aspect = VW / VH; camera.updateProjectionMatrix();
  if (pipe) pipe.setSize();
  // адаптация интерфейса: узкий экран / низкий (телефон в альбомной ориентации)
  document.body.classList.toggle('narrow', VW < 700);
  document.body.classList.toggle('short', VH < 520);
}
window.addEventListener('resize', resize);
rebuildPipe();
const world = buildWorld(scene, P, SEED, renderer);
const buildings = world.buildings;
const boomLight = new THREE.PointLight(lin(0xffa040), 0, 600, 2); scene.add(boomLight);

const dotTex = radialTex([[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,255,255,.6)'], [1, 'rgba(255,255,255,0)']], 64);
const smokeTex = radialTex([[0, 'rgba(255,255,255,.9)'], [0.55, 'rgba(255,255,255,.45)'], [1, 'rgba(255,255,255,0)']], 64);
const SMOKE = makeParticles(scene, P.particles, false, smokeTex);
const FX = makeParticles(scene, Math.round(P.particles * 0.7), true, dotTex);
function sph(s) { let x, y, z, l; do { x = rnd() * 2 - 1; y = rnd() * 2 - 1; z = rnd() * 2 - 1; l = x * x + y * y + z * z; } while (l > 1 || l < 0.01); return [x * s, y * s, z * s]; }
function explosion(p, size, color) {
  const c = color || [1, 0.6, 0.18];
  for (let k = 0; k < 14 + size * 8; k++) { const [vx, vy, vz] = sph(20 * size); FX.emit(p.x, p.y, p.z, vx, vy, vz, c[0], c[1], c[2], 1, 4 * size + rnd() * 4 * size, 8 * size, 0.35 + rnd() * 0.5, 2.5, 2); }
  for (let k = 0; k < 16 + size * 5; k++) { const [vx, vy, vz] = sph(40 * size); FX.emit(p.x, p.y, p.z, vx, vy, vz, 1, 0.9, 0.55, 1, 0.8 + rnd(), 0, 0.5 + rnd() * 0.7, 1.2, -15); }
  for (let k = 0; k < 8 + size * 4; k++) { const [vx, vy, vz] = sph(10 * size); SMOKE.emit(p.x, p.y, p.z, vx, vy + 3, vz, 0.24, 0.23, 0.22, 0.75, 5 * size, 9 * size, 2.5 + rnd() * 2, 0.8, 1.5); }
  boomLight.position.copy(p); boomLight.intensity = 3 * Math.min(4, size); boomLight.distance = 150 * size;
}

// ═════════════ Материалы и модели ═════════════
const MAT_METAL = P.pbr ? new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.45, roughness: 0.42, side: THREE.DoubleSide })
  : new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
const MAT_JET = P.pbr ? new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.3, roughness: 0.55, side: THREE.DoubleSide })
  : new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
const MGEO = {}, JGEO = {};
const missileGeo = (k) => MGEO[k] || (MGEO[k] = buildMissileGeo(MISSILES[k].vis));
const jetGeo = (k) => JGEO[k] || (JGEO[k] = buildJet(k));
function missileMesh(k) { const m = new THREE.Mesh(missileGeo(k), MAT_METAL); m.castShadow = !!P.shadows; return m; }
const flameMat = new THREE.MeshBasicMaterial({ color: lin(0xff9a3c).multiplyScalar(3), // ярче 1 — «светится» в HDR/свечении
  transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
const flameCore = new THREE.MeshBasicMaterial({ color: lin(0xcfe6ff).multiplyScalar(4), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
const flameGeo = new THREE.ConeGeometry(0.5, 1, 16, 1, true); flameGeo.rotateX(Math.PI / 2); flameGeo.translate(0, 0, 0.5);
const diamondGeo = new THREE.SphereGeometry(0.26, 10, 8);
const mslFlameGeo = new THREE.ConeGeometry(0.1, 1.6, 8, 1, true); mslFlameGeo.rotateX(Math.PI / 2); mslFlameGeo.translate(0, 0, 0.8);

// корабль игрока: корпус, подвижные элевоны, форсажное пламя с «ромбами» скачков уплотнения
const ship = new THREE.Group(); ship.rotation.order = 'YXZ'; scene.add(ship);
{ const m = new THREE.Mesh(buildShipGeo(), MAT_METAL); m.castShadow = !!P.shadows; ship.add(m); }
const elevons = [1, -1].map((s) => {
  const { geo, hinge } = buildElevon(s); const piv = new THREE.Group(); piv.position.copy(hinge);
  const m = new THREE.Mesh(geo, MAT_METAL); m.castShadow = !!P.shadows; piv.add(m); ship.add(piv); return { piv, s };
});
const flame = new THREE.Mesh(flameGeo, flameMat); flame.position.z = 7.35; ship.add(flame);
const flame2 = new THREE.Mesh(flameGeo, flameCore); flame2.position.z = 7.35; ship.add(flame2);
const diamonds = [0, 1, 2, 3].map((k) => { const d = new THREE.Mesh(diamondGeo, flameCore); d.position.z = 8.2 + k * 1.15; ship.add(d); return d; });
const pylonMeshes = [];
// кольцо ударной волны при переходе звукового барьера: остаётся в воздухе и расходится, дрон улетает вперёд
const shockRing = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 64), new THREE.MeshBasicMaterial({ color: lin(0xffffff).multiplyScalar(1.5), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, fog: false }));
shockRing.visible = false; scene.add(shockRing);
const shock = { t: 0, on: false };

// ═════════════ Анимации: обломки, свет форсажа и ракет, маркеры попаданий ═════════════
const DEBRIS = {};
function debrisGeo(kind) {
  if (DEBRIS[kind]) return DEBRIS[kind];
  const S = JET_SPECS[kind], L = S.L;
  DEBRIS[kind] = [
    mergeParts([part(new THREE.BoxGeometry(L * 0.28, 0.25, L * 0.14), S.body, Mx(0, 0, 0, 0, 0.3, 0)), part(new THREE.BoxGeometry(L * 0.1, 0.27, L * 0.05), 0x25292e, Mx(L * 0.08, 0, 0))]),
    mergeParts([part(new THREE.BoxGeometry(0.2, L * 0.16, L * 0.12), S.body, Mx(0, 0, 0, 0.2, 0, 0)), part(new THREE.CylinderGeometry(L * 0.03, L * 0.035, L * 0.1, 10), 0x3b3e42, Mx(0, -L * 0.07, 0, Math.PI / 2))]),
  ];
  return DEBRIS[kind];
}
const hitMarks = [], hitEls = [];
for (let i = 0; i < 5; i++) { const d = document.createElement('div'); d.className = 'hitmk'; d.style.display = 'none'; $('marks').appendChild(d); hitEls.push(d); }
// свет: форсаж подсвечивает дрон, горящие ракеты — всё вокруг (только топовые пресеты: каждый источник дорог)
const abLight = P.lights ? new THREE.PointLight(lin(0xff8a3c), 0, 70, 2) : null;
if (abLight) { abLight.position.set(0, 0, 10); ship.add(abLight); }
const mslLights = P.lights ? [0, 1].map(() => { const l = new THREE.PointLight(lin(0xffb070), 0, 260, 2); scene.add(l); return l; }) : [];
function updateMissileLights() {
  if (!mslLights.length) return;
  const burning = missiles.filter((m) => !m.dead && m.fl && m.fl.visible).sort((a, b) => a.pos.distanceTo(camera.position) - b.pos.distanceTo(camera.position));
  mslLights.forEach((l, i) => { const m = burning[i]; if (m && m.pos.distanceTo(camera.position) < 2500) { l.position.copy(m.pos); l.intensity = 4 * (0.8 + rnd() * 0.4); } else l.intensity = 0; });
}

// ═════════════ Летательные аппараты ═════════════
function makeCraft(o) {
  return Object.assign({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0, wy: 0, wp: 0, speed: 250, thr: 0.85, ab: false,
    n: 1, massK: 1, dragK: 1, dead: false, agil: 4, vStall: 80, bleed: 1, rollK: 4, cmFlare: 0, cmChaff: 0 }, o);
}
// «Изделие Фортуна-1»: беспилотник без лётчика — держит большую перегрузку, быстро отвечает на ручку, мощный двигатель.
const player = makeCraft({ isPlayer: true, hull: 100, fuel: FUEL_START, fuelMax: FUEL_MAX, milAcc: 16, abAcc: 34, cd0: 1.3e-4, rollK: 9,
  ir: 0.8, r: 7, flares: 32, chaff: 32, heat: 0, overheated: false, invuln: 0 });
function applyMode() {
  MODE = MODES[modeKey];
  Object.assign(player, { gmax: MODE.gmax, wCap: MODE.wCap, agil: MODE.agil, vStall: MODE.vStall, bleed: MODE.bleed,
    flares: MODE.cm, chaff: MODE.cm, fuelMax: Math.round(FUEL_MAX * MODE.fuelK), fuel: Math.round(FUEL_START * MODE.fuelK) });
}
applyMode();
// Самолёты «Подстилки улитки» (вымышленные). Подвески: [внутр. L, внутр. R, внешн. L, внешн. R] (у босса — 6 точек).
const AC = {
  fighter: { name: '«Слизень»', code: 'СЛ', hp: 100, rcs: 3, ir: 1.0, gmax: 8, wCap: 0.5, milAcc: 12, abAcc: 25, cd0: 1.44e-4, skill: 0.45, radarR: 28000, r: 9, pts: 1000, cm: 12,
    loadouts: [['r27r', 'r27r', 'r60m', 'r60m'], ['aim7m', 'aim7m', 'aim9l', 'aim9l'], ['r27r', 'r27t', 'r73', 'r73']] },
  interceptor: { name: '«Раковина»', code: 'РК', hp: 130, rcs: 6, ir: 1.3, gmax: 6.5, wCap: 0.4, milAcc: 14, abAcc: 30, cd0: 1.3e-4, skill: 0.55, radarR: 36000, r: 12, pts: 1200, cm: 16,
    loadouts: [['r27er', 'r27er', 'r73', 'r73'], ['aim7m', 'aim7m', 'aim9l', 'aim9l']] },
  ace: { name: '«Улитка-ас»', code: 'АС', hp: 110, rcs: 1.2, ir: 0.9, gmax: 9, wCap: 0.55, milAcc: 14, abAcc: 28, cd0: 1.35e-4, skill: 0.85, radarR: 34000, r: 10, pts: 2500, cm: 24,
    loadouts: [['r77', 'r77', 'r73', 'r73'], ['aim120c', 'aim120c', 'aim9x', 'aim9x'], ['derby', 'derby', 'python5', 'python5'], ['mica_em', 'mica_em', 'mica_ir', 'mica_ir']] },
  boss: { name: '«Подстилка улитки»', code: 'ПУ', hp: 450, rcs: 25, ir: 1.8, gmax: 3, wCap: 0.18, milAcc: 8, abAcc: 10, cd0: 1.6e-4, skill: 0.6, radarR: 45000, r: 26, pts: 6000, cm: 60, jam: true,
    loadouts: [['r73', 'r33', 'r33', 'r33', 'r33', 'r73'], ['aim9l', 'aim54', 'aim54', 'aim54', 'aim54', 'aim9l']] },
};
const enemies = [], missiles = [], bullets = [], cms = [], wrecks = [], tankers = [];
const TMP = new THREE.Vector3(), TMP2 = new THREE.Vector3(), TMP3 = new THREE.Vector3(), TGT = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
const NEG_Z = new THREE.Vector3(0, 0, -1), ZAXIS = new THREE.Vector3(0, 0, 1);
function fwdOf(a, out) { const cp = Math.cos(a.pitch); return out.set(-Math.sin(a.yaw) * cp, Math.sin(a.pitch), -Math.cos(a.yaw) * cp); }
function rightOf(a, out) { return out.set(Math.cos(a.yaw), 0, -Math.sin(a.yaw)); }
// азимут и угол места вектора rel относительно носа аппарата a
function localAngles(a, rel) {
  const cy = Math.cos(a.yaw), sy = Math.sin(a.yaw), cp = Math.cos(a.pitch), sp = Math.sin(a.pitch);
  const x1 = rel.x * cy - rel.z * sy, z1 = rel.x * sy + rel.z * cy;
  const y2 = rel.y * cp + z1 * sp, z2 = -rel.y * sp + z1 * cp;
  return [Math.atan2(x1, -z2), Math.atan2(y2, Math.hypot(x1, z2))];
}
function angleBetween(a, b) { return Math.acos(clamp(a.dot(b) / ((a.length() * b.length()) || 1), -1, 1)); }
function agl(a) { return a.pos.y - terrainH(a.pos.x, a.pos.z); }

// Общая лётная модель: rx, ry — команды по рысканию/тангажу (−1…1). Угловая скорость ограничена перегрузкой.
function flyStep(a, rx, ry, dt) {
  const v = Math.max(a.speed, 60);
  const wMax = Math.min(a.wCap, a.gmax * G0 / v);
  let wy = -rx * wMax, wp = ry * wMax;
  const w = Math.hypot(wy, wp); if (w > wMax) { wy *= wMax / w; wp *= wMax / w; }
  const k = Math.min(1, a.agil * dt);
  a.wy += (wy - a.wy) * k; a.wp += (wp - a.wp) * k;
  a.yaw += a.wy * dt; a.pitch = clamp(a.pitch + a.wp * dt, -1.35, 1.35);
  a.n = 1 + v * Math.hypot(a.wy * Math.cos(a.pitch), a.wp) / G0;
  const bank = clamp(Math.atan2(v * a.wy * Math.cos(a.pitch), G0), -1.45, 1.45);
  a.roll += (bank - a.roll) * Math.min(1, a.rollK * dt);
  const rho = rhoAt(a.pos.y);
  const thrust = (a.ab ? a.abAcc : a.milAcc * a.thr) * (0.25 + 0.75 * rho) / a.massK;
  const drag = a.cd0 * rho * v * v * a.dragK + 0.32 * a.bleed * Math.pow(Math.max(0, a.n - 1), 2);
  a.speed += (thrust - drag - G0 * Math.sin(a.pitch)) * dt;
  if (a.speed < a.vStall) a.pitch -= (a.vStall - a.speed) * 0.015 * dt; // сваливание: нос опускается
  a.speed = Math.max(a.speed, 45);
  fwdOf(a, a.vel).multiplyScalar(a.speed);
  a.pos.addScaledVector(a.vel, dt);
}
// Команды, чтобы развернуть нос в направлении dir
function steerTo(a, dir, gain = 2.5) {
  const wantYaw = Math.atan2(-dir.x, -dir.z), dy = wrapPI(wantYaw - a.yaw);
  const wantPitch = Math.asin(clamp(dir.y / (dir.length() || 1), -1, 1));
  return [clamp(-dy * gain, -1, 1), clamp((wantPitch - a.pitch) * gain, -1, 1)];
}

// ═════════════ Подвеска игрока ═════════════
let loadout = DEFAULT_LOADOUT.slice();
try {
  const saved = JSON.parse(store.get('fortuna_drone_loadout2') || 'null');
  if (Array.isArray(saved) && saved.length === 8 && saved.every((k, i) => k === null || (MISSILES[k] && MISSILES[k].mounts.includes(STATIONS[i].kind))) && loadMass(saved) <= MAX_LOAD) loadout = saved;
} catch (_) { /* повреждённое сохранение — берём подвеску по умолчанию */ }
const loaded = loadout.slice();
function loadMass(arr) { return arr.reduce((s, k) => s + (k ? MISSILES[k].mass : 0), 0); }
function canMount(i, key, arr) {
  if (!key) return true;
  const M_ = MISSILES[key], sk = STATIONS[i].kind;
  if (!M_.mounts.includes(sk) || M_.mass > STATION_KIND[sk].lim) return false;
  return loadMass(arr) - (arr[i] ? MISSILES[arr[i]].mass : 0) + M_.mass <= MAX_LOAD;
}
function rebuildPylonMeshes() {
  for (const m of pylonMeshes) if (m) ship.remove(m);
  pylonMeshes.length = 0;
  loaded.forEach((k, i) => {
    if (!k) { pylonMeshes.push(null); return; }
    const m = missileMesh(k), p = stationPos(i); m.position.copy(p);
    if (STATIONS[i].kind !== 'tip') m.position.y -= MISSILES[k].vis.r - 0.06;
    ship.add(m); pylonMeshes.push(m);
  });
  const mass = loadMass(loaded), nMsl = loaded.filter(Boolean).length;
  player.massK = 1 + mass / 6000; player.dragK = 1 + 0.03 * nMsl;
}
player.rcs = () => 1.0 + 0.15 * loaded.filter(Boolean).length; // внешняя подвеска увеличивает заметность
rebuildPylonMeshes();
let selType = null;
function typesLoaded() { return Object.keys(MISSILES).filter((k) => loaded.includes(k)); }
function countOf(k) { return loaded.filter((x) => x === k).length; }
function ensureSel() { const t = typesLoaded(); if (!t.includes(selType)) selType = t[0] || null; }
ensureSel();

// ═════════════ Игровое состояние ═════════════
const G = { state: 'menu', paused: false, runTime: 0, kills: 0, score: 0, shots: 0, hits: 0, mFired: 0, mHits: 0, evaded: 0,
  bossSpawned: false, bossKilled: false, shake: 0, fireT: 0, mslT: 0, cmT: 0, god: false, over: false, sent: false, menuT: 0 };
const schedule = buildSchedule(SEED);
const MAX_K = maxKills(schedule);
let schedIdx = 0;

// ═════════════ Ввод ═════════════
// Действия и назначаемые клавиши (ПК). У каждого действия два слота; кнопки мыши — коды Mouse0/1/2.
// Escape всегда ставит паузу и не переназначается.
const ACTIONS = [
  { id: 'fire', name: 'Пушка', hold: true, def: ['Space', 'Mouse0'] },
  { id: 'missile', name: 'Пуск ракеты', def: ['KeyF', 'Mouse2'] },
  { id: 'lock', name: 'Захват радаром / след. цель', def: ['KeyR', 'Mouse1'] },
  { id: 'weapon', name: 'Сменить ракету', def: ['KeyQ', 'Tab'] },
  { id: 'flare', name: 'ЛТЦ (тепловые ловушки)', def: ['KeyX', null] },
  { id: 'chaff', name: 'Диполи', def: ['KeyC', null] },
  { id: 'cm', name: 'ЛТЦ + диполи', def: ['KeyB', null] },
  { id: 'ab', name: 'Форсаж', hold: true, def: ['ShiftLeft', 'ShiftRight'] },
  { id: 'thrUp', name: 'Газ — полный', hold: true, def: ['KeyW', null] },
  { id: 'thrDown', name: 'Газ — малый', hold: true, def: ['KeyS', null] },
  { id: 'left', name: 'Курс влево', hold: true, def: ['KeyA', 'ArrowLeft'] },
  { id: 'right', name: 'Курс вправо', hold: true, def: ['KeyD', 'ArrowRight'] },
  { id: 'up', name: 'Нос вверх', hold: true, def: ['ArrowUp', null] },
  { id: 'down', name: 'Нос вниз', hold: true, def: ['ArrowDown', null] },
  { id: 'lookBack', name: 'Взгляд назад (держать)', hold: true, def: ['KeyV', null] },
  { id: 'radarScale', name: 'Масштаб индикатора РЛС', def: ['KeyZ', null] },
  { id: 'help', name: 'Обучение: объяснение ракеты («?»)', def: ['KeyH', null] },
  { id: 'pause', name: 'Пауза', def: ['KeyP', null] },
];
const defaultBinds = () => Object.fromEntries(ACTIONS.map((a) => [a.id, a.def.slice()]));
let binds = defaultBinds();
try {
  const sb = JSON.parse(store.get('fortuna_drone_keys') || 'null');
  if (sb && typeof sb === 'object') for (const a of ACTIONS) if (Array.isArray(sb[a.id]) && sb[a.id].length === 2) binds[a.id] = sb[a.id].map((c) => (typeof c === 'string' && c !== 'Escape' ? c : null));
} catch (_) { binds = defaultBinds(); }
let mouseCfg = { steer: true, invert: false, sens: 1 };
try { mouseCfg = Object.assign(mouseCfg, JSON.parse(store.get('fortuna_drone_mouse') || '{}')); } catch (_) { /* по умолчанию */ }
const input = { sx: 0, sy: 0, fire: false, ab: false };
const held = new Set();
let capturing = null; // { id, slot } — ждём клавишу для назначения
function deadzone(v, dz = 0.07) { return Math.abs(v) < dz ? 0 : (v - Math.sign(v) * dz) / (1 - dz); }
function actionsFor(code) { return ACTIONS.filter((a) => binds[a.id].includes(code)); }
function trigger(id) {
  if (id === 'pause') { togglePause(); return; }
  if (id === 'help' && G.state === 'play' && TR.ask) { openLesson(TR.ask); return; }
  if (G.state !== 'play') return;
  if (id === 'missile') launchPlayerMissile();
  else if (id === 'lock') cycleLock();
  else if (id === 'weapon') cycleWeapon();
  else if (id === 'flare') dropCM(player, 'flare');
  else if (id === 'chaff') dropCM(player, 'chaff');
  else if (id === 'cm') { dropCM(player, 'flare'); dropCM(player, 'chaff'); }
  else if (id === 'radarScale') cycleRadarScale();
}
function press(code) { for (const a of actionsFor(code)) { if (a.hold) held.add(a.id); else trigger(a.id); } }
function release(code) { for (const a of actionsFor(code)) if (a.hold) held.delete(a.id); }
function finishCapture(code) {
  const { id, slot } = capturing; capturing = null;
  if (code) for (const a of ACTIONS) binds[a.id] = binds[a.id].map((c) => (c === code ? null : c)); // одна клавиша — одно действие
  binds[id][slot] = code;
  store.set('fortuna_drone_keys', JSON.stringify(binds));
  renderSettingsTab(); renderGuideTab(); // руководство показывает актуальные клавиши
}
window.addEventListener('keydown', (e) => {
  if (capturing) {
    e.preventDefault();
    if (e.code === 'Escape') { capturing = null; renderSettingsTab(); } else finishCapture(e.code === 'Backspace' || e.code === 'Delete' ? null : e.code);
    return;
  }
  const acts = actionsFor(e.code);
  if (acts.length && G.state === 'play') e.preventDefault(); // пробел/Tab не должны листать страницу
  if (e.repeat) return;
  if (e.code === 'Escape') { togglePause(); return; }
  press(e.code);
});
window.addEventListener('keyup', (e) => release(e.code));
window.addEventListener('blur', () => { held.clear(); input.fire = false; });
// Рулёжка мышью: без захвата — положение курсора; с захватом (режим погружения) — виртуальный курсор по movementX/Y
const vcur = { x: 0, y: 0 };
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse' || G.state !== 'play' || !mouseCfg.steer) return;
  if (document.pointerLockElement === canvas) {
    vcur.x = clamp(vcur.x + (e.movementX || 0) / (window.innerWidth / 2), -1, 1); vcur.y = clamp(vcur.y + (e.movementY || 0) / (window.innerHeight / 2), -1, 1);
  } else { vcur.x = e.clientX / window.innerWidth * 2 - 1; vcur.y = e.clientY / window.innerHeight * 2 - 1; }
  const k = 1.1 * mouseCfg.sens;
  input.sx = clamp(deadzone(vcur.x * k), -1, 1);
  input.sy = clamp(deadzone(-vcur.y * k) * (mouseCfg.invert ? -1 : 1), -1, 1);
});
canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'mouse' || G.state !== 'play') return;
  if (e.button === 1) e.preventDefault();
  if (IMM.on && document.pointerLockElement !== canvas) { requestPointer(); return; } // первый клик — вернуть захват мыши
  press('Mouse' + e.button);
});
window.addEventListener('pointerdown', (e) => {
  if (!capturing || e.pointerType !== 'mouse' || e.target.closest('[data-kb]')) return;
  if (!e.target.closest('#tab-set .kb')) { capturing = null; renderSettingsTab(); return; } // клик мимо таблицы — отмена
  e.preventDefault(); finishCapture('Mouse' + e.button);
}, true);
window.addEventListener('pointerup', (e) => { if (e.pointerType === 'mouse') release('Mouse' + e.button); });
window.addEventListener('contextmenu', (e) => e.preventDefault());
const KEY_NAMES = { Space: 'Пробел', Mouse0: 'ЛКМ', Mouse1: 'Колесо', Mouse2: 'ПКМ', Tab: 'Tab', ShiftLeft: 'Shift лев.', ShiftRight: 'Shift прав.',
  ControlLeft: 'Ctrl лев.', ControlRight: 'Ctrl прав.', AltLeft: 'Alt лев.', AltRight: 'Alt прав.', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Enter: 'Enter', CapsLock: 'Caps', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\' };
function keyName(code) {
  if (!code) return '—';
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad/.test(code)) return 'Num ' + code.slice(6);
  return code;
}
// ═════════════ Подсказки под устройство: как называется нужная кнопка ═════════════
const TOUCH_NAMES = { fire: '«ПУШКА»', missile: '«РАКЕТА»', lock: '«ЗАХВАТ»', weapon: 'нажатие по панели оружия (слева вверху)', flare: '«ЛТЦ ДО»', chaff: '«ЛТЦ ДО»', cm: '«ЛТЦ ДО»',
  ab: '«ФОРСАЖ»', thrUp: 'отпустите «ГАЗ−»', thrDown: '«ГАЗ−»', left: 'палец влево', right: 'палец вправо', up: 'палец вверх', down: 'палец вниз', lookBack: '«НАЗАД»',
  radarScale: 'нажатие по индикатору РЛС', pause: 'кнопка «II»', help: 'кнопка «?»' };
function ctl(id) {
  if (IS_TOUCH) return TOUCH_NAMES[id] || id;
  const k = (binds[id] || []).filter(Boolean).map(keyName);
  return k.length ? k.map((x) => `<kbd>${x}</kbd>`).join(' / ') : '(не назначено — см. «Настройки»)';
}
const POS = IS_TOUCH ? { radar: 'вверху справа', rwr: 'вверху, левее радара' } : { radar: 'справа внизу', rwr: 'слева внизу' };
function steerHint() {
  if (IS_TOUCH) return 'ведите левым пальцем — дрон поворачивает туда, куда отклонена «ручка»';
  return mouseCfg.steer ? `отводите мышь от центра экрана (или ${ctl('left')} ${ctl('right')} ${ctl('up')} ${ctl('down')})`
    : `${ctl('left')} / ${ctl('right')} — курс, ${ctl('up')} / ${ctl('down')} — нос вверх / вниз`;
}
function setHint(t) { const h = $('hint'); if (h._t !== t) { h._t = t; h.innerHTML = t; h.style.display = t ? 'block' : 'none'; } }

$('wpn').addEventListener('pointerdown', (e) => { e.stopPropagation(); if (G.state === 'play') cycleWeapon(); });
$('radar').addEventListener('pointerdown', (e) => { e.stopPropagation(); if (G.state === 'play') cycleRadarScale(); });
if (IS_TOUCH) {
  document.body.classList.add('coarse');
  const zone = $('stickZone'), base = $('stickBase'), knob = $('stickKnob');
  let sid = null, ox = 0, oy = 0; const R = 60;
  zone.addEventListener('pointerdown', (e) => {
    if (sid !== null) return; sid = e.pointerId; zone.setPointerCapture(sid);
    ox = e.clientX; oy = e.clientY; base.style.display = 'block'; base.style.left = ox + 'px'; base.style.top = oy + 'px'; knob.style.transform = 'translate(0,0)';
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== sid) return;
    let dx = e.clientX - ox, dy = e.clientY - oy; const l = Math.hypot(dx, dy);
    if (l > R) { dx *= R / l; dy *= R / l; }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    input.sx = clamp(deadzone(dx / R, 0.1), -1, 1); input.sy = clamp(deadzone(-dy / R, 0.1), -1, 1);
  });
  const endStick = (e) => { if (e.pointerId !== sid) return; sid = null; base.style.display = 'none'; input.sx = 0; input.sy = 0; };
  zone.addEventListener('pointerup', endStick); zone.addEventListener('pointercancel', endStick);
  const hold = (el, key) => {
    el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); input[key] = true; el.classList.add('on'); e.preventDefault(); });
    const up = () => { input[key] = false; el.classList.remove('on'); };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  };
  const tap = (el, fn) => el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.classList.add('on'); fn(); setTimeout(() => el.classList.remove('on'), 150); });
  hold($('btnFire'), 'fire'); hold($('btnAB'), 'ab');
  tap($('btnMsl'), () => launchPlayerMissile()); tap($('btnLock'), () => cycleLock());
  tap($('btnCM'), () => { dropCM(player, 'flare'); dropCM(player, 'chaff'); });
  const holdAct = (el, id) => { // удержание = «зажатая клавиша» действия
    el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); held.add(id); el.classList.add('on'); e.preventDefault(); });
    const up = () => { held.delete(id); el.classList.remove('on'); };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  };
  holdAct($('btnSlow'), 'thrDown'); holdAct($('btnBack'), 'lookBack');
}

// ═════════════ Звук (синтез) ═════════════
let actx = null, master = null, reverbIn = null, engOsc = null, engFilter = null, engGain = null, roarGain = null, roarFilter = null, windGain = null, windFilter = null,
  droneGain = null, growlOsc = null, growlGain = null, muted = false, noiseBuf = null;
function initAudio() {
  if (actx) return;
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    noiseBuf = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // общая шина: мягкий компрессор (не даёт хлопкам «рвать» звук) + общая реверберация
    master = actx.createDynamicsCompressor(); master.threshold.value = -18; master.ratio.value = 4; master.connect(actx.destination);
    const conv = actx.createConvolver(), ir = actx.createBuffer(2, actx.sampleRate * 2.2, actx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const x = ir.getChannelData(ch); for (let i = 0; i < x.length; i++) x[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / x.length, 3.2); }
    conv.buffer = ir; reverbIn = actx.createGain(); reverbIn.gain.value = 0.5; reverbIn.connect(conv); conv.connect(master);
    const loopNoise = (rate) => { const n = actx.createBufferSource(); n.buffer = noiseBuf; n.loop = true; n.playbackRate.value = rate; n.start(); return n; };
    // турбина: вой, на сверхзвуке «глохнет» (фильтр закрывается)
    engOsc = actx.createOscillator(); engOsc.type = 'sawtooth'; engOsc.frequency.value = 180;
    engFilter = actx.createBiquadFilter(); engFilter.type = 'lowpass'; engFilter.frequency.value = 900;
    engGain = actx.createGain(); engGain.gain.value = 0;
    engOsc.connect(engFilter); engFilter.connect(engGain); engGain.connect(master); engOsc.start();
    // рёв выхлопа
    roarFilter = actx.createBiquadFilter(); roarFilter.type = 'bandpass'; roarFilter.frequency.value = 500; roarFilter.Q.value = 0.5;
    roarGain = actx.createGain(); roarGain.gain.value = 0;
    loopNoise(1).connect(roarFilter); roarFilter.connect(roarGain); roarGain.connect(master);
    // поток воздуха: мягкий «розовый» шум (фильтр низких частот), медленно «дышит» — на сверхзвуке главный звук
    windFilter = actx.createBiquadFilter(); windFilter.type = 'lowpass'; windFilter.frequency.value = 700; windFilter.Q.value = 0.3;
    const windShelf = actx.createBiquadFilter(); windShelf.type = 'peaking'; windShelf.frequency.value = 420; windShelf.gain.value = 5; windShelf.Q.value = 0.7;
    windGain = actx.createGain(); windGain.gain.value = 0;
    loopNoise(0.7).connect(windFilter); windFilter.connect(windShelf); windShelf.connect(windGain); windGain.connect(master);
    const lfo = actx.createOscillator(), lfoGain = actx.createGain(); lfo.frequency.value = 0.23; lfoGain.gain.value = 0; lfo.connect(lfoGain); lfoGain.connect(windGain.gain); lfo.start();
    windGain.lfo = lfoGain;
    // низкий гул корпуса на сверхзвуке
    const drone = actx.createOscillator(); drone.type = 'triangle'; drone.frequency.value = 46;
    const drone2 = actx.createOscillator(); drone2.type = 'sine'; drone2.frequency.value = 69.5;
    droneGain = actx.createGain(); droneGain.gain.value = 0;
    drone.connect(droneGain); drone2.connect(droneGain); droneGain.connect(master); drone.start(); drone2.start();
    growlOsc = actx.createOscillator(); growlOsc.type = 'triangle'; growlOsc.frequency.value = 400;
    growlGain = actx.createGain(); growlGain.gain.value = 0;
    growlOsc.connect(growlGain); growlGain.connect(master); growlOsc.start();
    initSpatial();
  } catch (_) { actx = null; }
}
function tone(freq, dur, type = 'square', vol = 0.06, slide = 0, wet = 0) {
  if (!actx || muted) return;
  const o = actx.createOscillator(), g = actx.createGain(); o.type = type; o.frequency.value = freq;
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), actx.currentTime + dur);
  g.gain.setValueAtTime(vol, actx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
  o.connect(g); g.connect(master); if (wet) { const w = actx.createGain(); w.gain.value = wet; g.connect(w); w.connect(reverbIn); }
  o.start(); o.stop(actx.currentTime + dur);
}
function noise(dur, vol = 0.18, cutoff = 900, wet = 0, when = 0) {
  if (!actx || muted || !noiseBuf) return;
  const t0 = actx.currentTime + when;
  const s = actx.createBufferSource(), g = actx.createGain(), f = actx.createBiquadFilter(); s.buffer = noiseBuf; s.loop = true; f.type = 'lowpass'; f.frequency.value = cutoff;
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f); f.connect(g); g.connect(master); if (wet) { const w = actx.createGain(); w.gain.value = wet; g.connect(w); w.connect(reverbIn); }
  s.start(t0); s.stop(t0 + dur + 0.05);
}
// «Ударная волна» N-образной формы: два глухих удара ~0,12 с друг от друга, с эхом
function boomSound(vol = 0.3) {
  if (!actx || muted) return;
  for (const [dt, v] of [[0, 1], [0.12, 0.75]]) {
    noise(0.9, vol * v, 180, 0.7, dt);
    const o = actx.createOscillator(), g = actx.createGain(), t0 = actx.currentTime + dt;
    o.type = 'sine'; o.frequency.setValueAtTime(62, t0); o.frequency.exponentialRampToValueAtTime(34, t0 + 0.5);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol * v * 0.9, t0 + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.7);
    o.connect(g); g.connect(master); const w = actx.createGain(); w.gain.value = 0.5; g.connect(w); w.connect(reverbIn); o.start(t0); o.stop(t0 + 0.75);
  }
}

// ═════════════ Объёмный звук: вражеские самолёты и ракеты (панорама HRTF, затухание, эффект Доплера) ═════════════
const voices = [];
function initSpatial() {
  for (let i = 0; i < 5; i++) {
    const pan = actx.createPanner(); pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.refDistance = 220; pan.maxDistance = 20000; pan.rolloffFactor = 1.15;
    const g = actx.createGain(); g.gain.value = 0; g.connect(pan); pan.connect(master);
    const n = actx.createBufferSource(); n.buffer = noiseBuf; n.loop = true; n.playbackRate.value = 0.9 + i * 0.03;
    const bp = actx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.6; n.connect(bp); bp.connect(g); n.start();
    const o = actx.createOscillator(); o.type = 'sawtooth'; const olp = actx.createBiquadFilter(); olp.type = 'lowpass'; olp.frequency.value = 1400;
    const og = actx.createGain(); og.gain.value = 0.35; o.connect(olp); olp.connect(og); og.connect(g); o.start();
    voices.push({ pan, g, bp, o, og, src: null, d: 0 });
  }
}
function setParam(p, v, t) { if (p.setTargetAtTime) p.setTargetAtTime(v, t, 0.08); else p.value = v; }
let spatialT = 0;
function updateSpatial(dt) {
  if (!actx || !voices.length) return;
  const t = actx.currentTime, L = actx.listener;
  const f = TMP.set(0, 0, -1).applyQuaternion(camera.quaternion), u = TMP2.set(0, 1, 0).applyQuaternion(camera.quaternion), cp = camera.position;
  if (L.positionX) { L.positionX.value = cp.x; L.positionY.value = cp.y; L.positionZ.value = cp.z; L.forwardX.value = f.x; L.forwardY.value = f.y; L.forwardZ.value = f.z; L.upX.value = u.x; L.upY.value = u.y; L.upZ.value = u.z; }
  else { L.setPosition(cp.x, cp.y, cp.z); L.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z); }
  // раз в 0,25 с отдаём голоса ближайшим источникам
  spatialT -= dt;
  if (spatialT <= 0) {
    spatialT = 0.25;
    const src = [];
    for (const e of enemies) if (!e.dead) src.push({ o: e, kind: e.type === 'boss' ? 'boss' : 'jet', d: e.pos.distanceTo(cp) });
    for (const m of missiles) if (!m.dead && m.t - m.M.drop < m.M.burn + (m.M.sustain ? m.M.sustain.t : 0)) src.push({ o: m, kind: 'msl', d: m.pos.distanceTo(cp) });
    src.sort((a, b) => a.d - b.d);
    const want = src.filter((x) => x.d < (x.kind === 'msl' ? 3500 : 9000)).slice(0, voices.length);
    for (const v of voices) if (v.src && !want.some((w) => w.o === v.src.o)) { v.src = null; setParam(v.g.gain, 0, t); }
    for (const w of want) if (!voices.some((v) => v.src && v.src.o === w.o)) { const v = voices.find((x) => !x.src); if (v) v.src = w; }
  }
  const G_ = G.state === 'play' && !muted;
  for (const v of voices) {
    if (!v.src) continue;
    const o = v.src.o, p = o.pos;
    if (o.dead || !G_) { setParam(v.g.gain, 0, t); if (o.dead) v.src = null; continue; }
    if (v.pan.positionX) { v.pan.positionX.value = p.x; v.pan.positionY.value = p.y; v.pan.positionZ.value = p.z; } else v.pan.setPosition(p.x, p.y, p.z);
    // Доплер: скорость сближения источника со слушателем (камера летит вместе с игроком)
    const vel = o.vel || TMP3.copy(o.dir).multiplyScalar(o.speed);
    const dir = TMP.copy(cp).sub(p); const d = dir.length() || 1; dir.divideScalar(d);
    const approach = vel.dot(dir) - player.vel.dot(dir);
    const dop = clamp(343 / (343 - clamp(approach, -300, 300)), 0.55, 2.4);
    if (v.src.kind === 'msl') { setParam(v.bp.frequency, 1900 * dop, t); v.bp.Q.value = 0.9; setParam(v.og.gain, 0, t); setParam(v.g.gain, 0.5, t); }
    else {
      const big = v.src.kind === 'boss';
      setParam(v.bp.frequency, (big ? 230 : 420) * dop, t); v.bp.Q.value = 0.5;
      setParam(v.o.frequency, (big ? 55 : 95 + (o.ab ? 25 : 0)) * dop, t); setParam(v.og.gain, big ? 0.5 : 0.3, t);
      setParam(v.g.gain, (big ? 1.2 : 0.8) * (o.ab ? 1.4 : 1), t);
    }
  }
}
const sfx = {
  shot: () => tone(120, 0.04, 'square', 0.025, -40), boom: (v = 0.25) => noise(1.1, v, 500, 0.6), hit: () => { noise(0.3, 0.3, 400); tone(120, 0.25, 'sawtooth', 0.08, -60); },
  pick: () => { tone(660, 0.08, 'triangle', 0.08); setTimeout(() => tone(990, 0.12, 'triangle', 0.08), 70); }, warn: () => tone(300, 0.15, 'square', 0.05),
  launch: () => { noise(0.9, 0.2, 1800); tone(220, 0.5, 'sawtooth', 0.04, 300); }, lock: () => { tone(1250, 0.06, 'square', 0.05); setTimeout(() => tone(1250, 0.06, 'square', 0.05), 90); },
  lost: () => tone(420, 0.2, 'square', 0.04, -200), cm: () => noise(0.12, 0.08, 3000),
};
function silenceLoops() {
  if (!actx) return;
  engGain.gain.value = 0; roarGain.gain.value = 0; windGain.gain.value = 0; windGain.lfo.gain.value = 0; droneGain.gain.value = 0; growlGain.gain.value = 0;
  for (const v of voices) v.g.gain.value = 0;
}
$('mute').addEventListener('click', () => { muted = !muted; $('mute').style.opacity = muted ? 0.4 : 1; silenceLoops(); });

// ═════════════ Тепловая заметность и провал в доплере ═════════════
// ИК-заметность цели для головки в точке from: с форсажем ×2,2, в лоб ~40% от «хвоста».
// (у этих функций свои временные векторы — их зовут изнутри кода, который держит TMP*/TGT)
const SH_A = new THREE.Vector3(), SH_B = new THREE.Vector3(), IRV = new THREE.Vector3(), NTV = new THREE.Vector3(), CLV = new THREE.Vector3();
function seekerHeat(t, from) {
  fwdOf(t, SH_A); SH_B.copy(from).sub(t.pos).normalize();
  const tail = (1 - SH_A.dot(SH_B)) / 2; // 1 — смотрим строго в сопло
  return t.ir * (t.ab ? 2.2 : 1) * (0.4 + 0.6 * tail);
}
function offTailDeg(t, from) { fwdOf(t, SH_A); SH_B.copy(from).sub(t.pos).normalize(); return Math.acos(clamp(-SH_A.dot(SH_B), -1, 1)) / D2R; }
// ИК-ГСН ракеты M_ видит цель t из точки from с осью axis в конусе coneDeg?
function irCanSee(M_, t, from, axis, coneDeg) {
  IRV.copy(t.pos).sub(from); const d = IRV.length();
  if (d > M_.ir.range * Math.sqrt(seekerHeat(t, from)) || d < 50) return false;
  if (M_.ir.aspect < 180 && offTailDeg(t, from) > M_.ir.aspect) return false;
  return angleBetween(axis, IRV) <= coneDeg * D2R;
}
// Цель на фоне земли и летит поперёк луча — импульсно-доплеровская РЛС (и РЛ ГСН) её отсекает.
function isNotched(from, t) {
  NTV.copy(t.pos).sub(from); const d = NTV.length() || 1;
  if (NTV.y / d > -0.03) return false;
  return Math.abs(t.vel.dot(NTV) / d) < 35;
}

// ═════════════ Зона пуска (расчёт по той же кинематике) ═════════════
function dlz(M_, alt, vLaunch, vClose) {
  const rho = rhoAt(alt), dt = 0.1;
  let v = vLaunch, d = 0, t = 0, rmax = 0, rne = 0;
  while (t < M_.life) {
    const tb = t - M_.drop;
    const acc = tb < 0 ? 0 : tb < M_.burn ? M_.acc : (M_.sustain && tb < M_.burn + M_.sustain.t ? M_.sustain.acc : 0);
    v += (acc - M_.kd * 1e-4 * rho * v * v) * dt; d += v * dt; t += dt;
    if (v < M_.vmin && tb > M_.burn) break;
    rmax = Math.max(rmax, d + vClose * t); rne = Math.max(rne, d - 280 * t);
  }
  return { rmax, rne, rmin: M_.rmin };
}
function closingOf(t, from) { CLV.copy(from).sub(t.pos).normalize(); return t.vel.dot(CLV); }

// ═════════════ Радар игрока ═════════════
const RADAR = { range: 36000, refRcs: 5, az: 60 * D2R, el: 35 * D2R, burn: 16000 };
const RSCALES = [10000, 20000, 40000];
const radar = { contacts: new Map(), lock: null, lostT: 0, scanT: 0, t: 0, scale: 1 };
function detectR(e) { return RADAR.range * Math.min(1.4, Math.pow(e.S.rcs / RADAR.refRcs, 0.25)); }
function radarSees(e) {
  const rel = TMP.copy(e.pos).sub(player.pos), d = rel.length();
  const [az, el] = localAngles(player, rel);
  if (Math.abs(az) > RADAR.az || Math.abs(el) > RADAR.el) return false;
  if (e.jam && d > RADAR.burn) return 'jam';
  if (d > detectR(e)) return false;
  if (isNotched(player.pos, e)) return 'notch';
  return true;
}
function updateRadar(dt) {
  radar.t += dt; radar.scanT -= dt;
  if (radar.scanT <= 0) {
    radar.scanT = 0.25;
    for (const e of enemies) {
      if (e.dead) continue;
      const s = radarSees(e);
      if (s === true || s === 'jam') {
        const [az] = localAngles(player, TMP.copy(e.pos).sub(player.pos));
        radar.contacts.set(e, { t: radar.t, az, r: e.pos.distanceTo(player.pos), alt: e.pos.y, jam: s === 'jam' });
      }
    }
    for (const [e, c] of radar.contacts) if (e.dead || radar.t - c.t > 2) radar.contacts.delete(e);
  }
  const L = radar.lock;
  if (L) {
    if (L.dead) radar.lock = null;
    else if (radarSees(L) === true) radar.lostT = 0;
    else { radar.lostT += dt; if (radar.lostT > 0.8) { radar.lock = null; popup('ЗАХВАТ ПОТЕРЯН', 'bad'); sfx.lost(); } }
  }
}
function cycleLock() {
  const list = [...radar.contacts.entries()].filter(([e, c]) => !e.dead && !c.jam && radarSees(e) === true).map(([e]) => e);
  if (!list.length) { if (radar.lock) { radar.lock = null; sfx.lost(); } else popup('НЕТ ЦЕЛЕЙ НА РАДАРЕ', 'bad'); return; }
  fwdOf(player, TMP2);
  list.sort((a, b) => angleBetween(TMP2, TMP.copy(a.pos).sub(player.pos)) - angleBetween(TMP2, TMP3.copy(b.pos).sub(player.pos)));
  const idx = radar.lock ? list.indexOf(radar.lock) : -1;
  radar.lock = list[(idx + 1) % list.length]; radar.lostT = 0; sfx.lock();
  radar.lock.lockedByPlayerAt = G.runTime; // СПО противника слышит захват
  G.lockAnimT = 0.35;
}
function cycleRadarScale() { radar.scale = (radar.scale + 1) % RSCALES.length; tone(900, 0.04, 'square', 0.02); }
function cycleWeapon() {
  const t = typesLoaded(); if (!t.length) { selType = null; return; }
  selType = t[(t.indexOf(selType) + 1) % t.length]; seeker.target = null; seeker.t = 0; tone(700, 0.05, 'square', 0.03);
  if (MODE.training) askAbout('own', selType);
}
// радиокоррекция: РЛС игрока (сопровождение или свежая отметка обзора) «видит» цель
function playerDatalink(t) { const c = radar.contacts.get(t); return radar.lock === t || (c && !c.jam && radar.t - c.t < 0.6); }

// ═════════════ ИК-ГСН выбранной ракеты игрока ═════════════
const seeker = { target: null, t: 0, locked: false };
function updateSeeker(dt) {
  seeker.locked = false;
  const M_ = selType && MISSILES[selType];
  if (!M_ || M_.kind !== 'ir') { seeker.target = null; seeker.t = 0; return; }
  fwdOf(player, TMP2);
  let best = null, bestA = 1e9;
  const L = radar.lock;
  if (L && !L.dead && irCanSee(M_, L, player.pos, TMP2, M_.ir.slaved)) best = L;
  else for (const e of enemies) {
    if (e.dead || !irCanSee(M_, e, player.pos, TMP2, M_.ir.fov)) continue;
    const a = angleBetween(TMP2, TMP.copy(e.pos).sub(player.pos)); if (a < bestA) { bestA = a; best = e; }
  }
  if (best && best === seeker.target) seeker.t += dt; else { seeker.target = best; seeker.t = 0; }
  seeker.locked = !!best && seeker.t >= MODE.lockT;
}

// ═════════════ Ракеты (общие для игрока и ИИ) ═════════════
function launchMissile(owner, key, target, mesh) {
  const M_ = MISSILES[key];
  const wpos = new THREE.Vector3(), wq = new THREE.Quaternion();
  if (mesh) { mesh.updateMatrixWorld(true); mesh.getWorldPosition(wpos); mesh.getWorldQuaternion(wq); mesh.parent.remove(mesh); }
  else { mesh = missileMesh(key); wpos.copy(owner.pos); }
  mesh.position.copy(wpos); mesh.quaternion.copy(wq); scene.add(mesh);
  const fl = new THREE.Mesh(mslFlameGeo, flameMat); fl.position.z = M_.vis.L / 2 + 0.05; fl.visible = false; mesh.add(fl);
  const dir = fwdOf(owner, new THREE.Vector3());
  const m = { key, M: M_, owner, target, mesh, fl, pos: mesh.position, dir, speed: owner.speed, t: 0, flown: 0, active: false, lost: false, decoy: null, dead: false,
    lastKnown: target ? target.pos.clone() : owner.pos.clone().addScaledVector(dir, 5000), lastVel: target ? target.vel.clone() : new THREE.Vector3(), notchT: 0, trailT: 0, hit: false, seenBy: new Set() };
  missiles.push(m);
  // вспышка запуска двигателя и облачко дыма у пилона
  for (let k = 0; k < 18; k++) { const [vx, vy, vz] = sph(25); FX.emit(wpos.x, wpos.y, wpos.z, vx + owner.vel.x * 0.9, vy + owner.vel.y * 0.9, vz + owner.vel.z * 0.9, 1, 0.85, 0.5, 1, 1.6, 3, 0.25, 2, 0); }
  for (let k = 0; k < 6; k++) { const [vx, vy, vz] = sph(8); SMOKE.emit(wpos.x, wpos.y, wpos.z, vx + owner.vel.x * 0.7, vy + owner.vel.y * 0.7, vz + owner.vel.z * 0.7, 0.85, 0.85, 0.85, 0.55, 2, 6, 1.8, 1.2, 0); }
  if (owner === player) { G.mFired++; sfx.launch(); popup(M_.short + ' — ПУСК', 'info'); }
  return m;
}
function launchPlayerMissile() {
  if (G.state !== 'play' || G.mslT > 0) return;
  ensureSel();
  if (!selType) { popup('РАКЕТ НЕТ', 'bad'); return; }
  const M_ = MISSILES[selType];
  let tgt = null;
  if (M_.kind === 'ir') {
    if (seeker.locked) tgt = seeker.target;
    else if (!M_.ir.loal) { popup('НЕТ ЗАХВАТА ГСН', 'bad'); return; }
  } else if (M_.kind === 'sarh') {
    if (!radar.lock) { popup('НУЖЕН ЗАХВАТ РЛС (R)', 'bad'); return; }
    tgt = radar.lock;
  } else {
    tgt = radar.lock;
    if (!tgt) { // пуск по отметке обзора: ближайшая к оси носа в конусе 30°
      let bestA = 30 * D2R; fwdOf(player, TMP2);
      for (const [e, c] of radar.contacts) { if (e.dead || c.jam) continue; const a = angleBetween(TMP2, TMP.copy(e.pos).sub(player.pos)); if (a < bestA) { bestA = a; tgt = e; } }
    }
    if (!tgt) { popup('НЕТ ЦЕЛИ НА РАДАРЕ', 'bad'); return; }
  }
  const idxs = loaded.map((k, i) => (k === selType ? i : -1)).filter((i) => i >= 0);
  const side = G.mFired % 2 ? 1 : -1;
  const pi = idxs.find((i) => STATIONS[i].side === side) ?? idxs[0];
  const mesh = pylonMeshes[pi]; pylonMeshes[pi] = null; loaded[pi] = null;
  launchMissile(player, selType, tgt, mesh);
  rebuildLoadStats();
  G.mslT = 0.45; ensureSel();
}
function rebuildLoadStats() { const mass = loadMass(loaded); player.massK = 1 + mass / 6000; player.dragK = 1 + 0.03 * loaded.filter(Boolean).length; }
function turnToward(dir, desired, maxAng) {
  const a = Math.acos(clamp(dir.dot(desired), -1, 1));
  if (a < 1e-5) return 0;
  TMP3.crossVectors(dir, desired); if (TMP3.lengthSq() < 1e-12) return 0; TMP3.normalize();
  const turn = Math.min(a, maxAng); dir.applyAxisAngle(TMP3, turn).normalize(); return turn;
}
function opponentsOf(owner) { return owner === player ? enemies : [player]; }
function missileDatalink(m, T) {
  if (T.jam) return true; // наведение на источник помех
  return m.owner === player ? playerDatalink(T) : (!m.owner.dead && m.owner.stt);
}
function updateMissile(m, dt) {
  const M_ = m.M; m.t += dt;
  const tb = m.t - M_.drop;
  if (tb < 0) { // сброс с пилона
    m.pos.addScaledVector(m.dir, m.speed * dt); m.pos.y -= 14 * m.t * dt * 4;
    m.mesh.quaternion.setFromUnitVectors(NEG_Z, m.dir); return;
  }
  const acc = tb < M_.burn ? M_.acc : (M_.sustain && tb < M_.burn + M_.sustain.t ? M_.sustain.acc : 0);
  const motor = acc > 0;
  m.fl.visible = motor; if (motor) m.fl.scale.set(1, 1, (M_.sustain && tb > M_.burn ? 0.5 : 1) * (0.8 + rnd() * 0.5));
  // ── наведение ──
  const T = m.target, alive = T && !T.dead && !(T.isPlayer && G.over);
  let aim = null, avel = null;
  if (m.decoy) { aim = m.decoy.pos; avel = m.decoy.vel; if (m.decoy.life <= 0) { m.decoy = null; m.lost = true; m.why = m.why || 'decoy'; } }
  else if (!m.lost) {
    if (M_.kind === 'ir') {
      if (!T && M_.ir.loal && tb > 0.4) { // захват после пуска
        let best = null, bd = 1e9;
        for (const e of opponentsOf(m.owner)) { if (e.dead || !irCanSee(M_, e, m.pos, m.dir, 35)) continue; const d = e.pos.distanceTo(m.pos); if (d < bd) { bd = d; best = e; } }
        if (best) m.target = best;
      } else if (alive) {
        TGT.copy(T.pos).sub(m.pos);
        const gimbal = M_.ir.fov >= 45 ? 80 : 40;
        if (angleBetween(m.dir, TGT) > gimbal * D2R || (M_.ir.aspect < 180 && offTailDeg(T, m.pos) > M_.ir.aspect + 15)) { m.lost = true; m.why = 'gimbal'; }
        else if (M_.ir.sun && angleBetween(m.dir, SUN_DIR) < 10 * D2R) { m.lost = true; m.why = 'sun'; } // ранняя ГСН «увелась» на солнце
        else { aim = T.pos; avel = T.vel; }
      }
    } else if (M_.kind === 'sarh') {
      const illuminated = alive && (m.owner === player ? radar.lock === T : (!m.owner.dead && m.owner.stt));
      if (illuminated) {
        if (isNotched(m.pos, T)) { m.notchT += dt; if (m.notchT > 0.4 + 1.2 * M_.eccm) { m.lost = true; m.why = 'notch'; } } else m.notchT = Math.max(0, m.notchT - dt);
        aim = T.pos; avel = T.vel;
      }
    } else {
      if (!m.active) {
        if (alive && missileDatalink(m, T)) { m.lastKnown.copy(T.pos); m.lastVel.copy(T.vel); }
        else m.lastKnown.addScaledVector(m.lastVel, dt);
        aim = m.lastKnown; avel = m.lastVel;
        if (m.pos.distanceTo(m.lastKnown) < M_.pitbull) { m.active = true; if (m.owner === player) tone(1600, 0.05, 'square', 0.02); }
      }
      if (m.active && alive) {
        TGT.copy(T.pos).sub(m.pos); const d = TGT.length();
        if (d > M_.pitbull * 1.7 || angleBetween(m.dir, TGT) > 60 * D2R) { m.lost = true; m.why = 'gimbal'; }
        else {
          if (isNotched(m.pos, T)) { m.notchT += dt; if (m.notchT > 0.4 + 1.2 * M_.eccm) { m.lost = true; m.why = 'notch'; } } else m.notchT = Math.max(0, m.notchT - dt);
          aim = T.pos; avel = T.vel;
        }
      }
    }
  }
  let lat = 0;
  if (aim) {
    const d = m.pos.distanceTo(aim), tgo = d / Math.max(200, m.speed);
    TGT.copy(aim).addScaledVector(avel, tgo * 0.95).sub(m.pos).normalize();
    const gEff = M_.g * G0 * Math.pow(clamp(m.speed / M_.vmin, 0.3, 1), 2);
    lat = turnToward(m.dir, TGT, gEff / Math.max(150, m.speed) * dt) / dt * m.speed;
  }
  const rho = rhoAt(m.pos.y);
  m.speed += (acc - M_.kd * 1e-4 * rho * m.speed * m.speed - 0.1 * lat - G0 * m.dir.y) * dt;
  const step = m.speed * dt; m.flown += step;
  m.pos.addScaledVector(m.dir, step);
  m.mesh.quaternion.setFromUnitVectors(NEG_Z, m.dir);
  // скорость сближения с целью: после выгорания ракета, которая не догоняет, «сдыхает» (исчерпала энергию)
  if (T && !T.dead) {
    const dNow = m.pos.distanceTo(T.pos);
    if (m.dPrev !== undefined) m.closing = (m.dPrev - dNow) / dt;
    m.dPrev = dNow;
    if (!motor && m.closing !== undefined && m.closing < 15) { m.slowT = (m.slowT || 0) + dt; if (m.slowT > 2.5 && !m.lost) { m.lost = true; m.spent = true; m.why = 'energy'; } }
    else m.slowT = 0;
  }
  if (m.spent && (m.spentT = (m.spentT || 0) + dt) > 1.5) { detonate(m, false); return; }
  // след
  m.trailT -= dt;
  if (motor && m.trailT <= 0) {
    m.trailT = 0.025;
    SMOKE.emit(m.pos.x, m.pos.y, m.pos.z, (rnd() - 0.5) * 3, (rnd() - 0.5) * 3 + 1, (rnd() - 0.5) * 3, 0.9, 0.9, 0.9, M_.sustain && tb > M_.burn ? 0.18 : 0.55, 2.2, 6, 3.5, 0.5, 0.3);
    FX.emit(m.pos.x - m.dir.x * 3, m.pos.y - m.dir.y * 3, m.pos.z - m.dir.z * 3, 0, 0, 0, 1, 0.7, 0.3, 0.9, 2.2, -3, 0.08, 0, 0);
  }
  // неконтактный взрыватель: сближение внутри кадра
  if (m.flown > M_.rmin * 0.6) {
    for (const e of opponentsOf(m.owner)) {
      if (e.dead) continue;
      const px = e.pos.x - m.pos.x, py = e.pos.y - m.pos.y, pz = e.pos.z - m.pos.z;
      if (px * px + py * py + pz * pz > 600 * 600) continue;
      const vx = e.vel.x - m.dir.x * m.speed, vy = e.vel.y - m.dir.y * m.speed, vz = e.vel.z - m.dir.z * m.speed;
      const qx = px - vx * dt, qy = py - vy * dt, qz = pz - vz * dt; // положение в начале кадра
      const vv = vx * vx + vy * vy + vz * vz || 1e-6;
      const ts = clamp(-(qx * vx + qy * vy + qz * vz) / vv, 0, dt);
      const rx = qx + vx * ts, ry = qy + vy * ts, rz = qz + vz * ts, dmin = Math.hypot(rx, ry, rz);
      if (dmin < e.r * 0.4 + M_.blast * 0.7) { m.pos.set(e.pos.x - rx, e.pos.y - ry, e.pos.z - rz); detonate(m, true); return; }
    }
    if (m.decoy && m.pos.distanceTo(m.decoy.pos) < 20) { detonate(m, false); return; }
  }
  if (m.pos.y < terrainH(m.pos.x, m.pos.z) || (!motor && m.speed < Math.max(220, M_.vmin * 0.75)) || m.t > M_.life) detonate(m, false);
}
function detonate(m, dealDamage) {
  if (m.dead) return;
  m.dead = true; scene.remove(m.mesh);
  explosion(m.pos, dealDamage ? 2.2 : 1.1);
  if (m.pos.distanceTo(camera.position) < 3000) sfx.boom(dealDamage ? 0.25 : 0.1);
  if (!dealDamage) { if (m.target === player) G.evaded++; return; }
  let hitAny = false;
  for (const e of opponentsOf(m.owner)) {
    if (e.dead) continue;
    const d = Math.max(0, e.pos.distanceTo(m.pos) - e.r * 0.4);
    if (d < m.M.blast) { damage(e, m.M.dmg * Math.pow(1 - d / m.M.blast, 0.6), m.M.short, m.owner === player && e !== player ? m : null); hitAny = true; if (e === player) m.hitPlayer = true; }
  }
  if (hitAny && m.owner === player) G.mHits++;
  if (!hitAny && m.target === player) G.evaded++;
}

// ═════════════ Контрмеры: ЛТЦ и дипольные отражатели ═════════════
function dropCM(owner, type) {
  if (owner === player) {
    if (G.state !== 'play') return;
    if (type === 'flare' ? player.flares <= 0 : player.chaff <= 0) { if (G.cmT <= 0) { popup(type === 'flare' ? 'ЛТЦ КОНЧИЛИСЬ' : 'ДИПОЛИ КОНЧИЛИСЬ', 'bad'); G.cmT = 0.5; } return; }
    if (type === 'flare') player.flares -= 2; else player.chaff -= 2;
    sfx.cm();
  } else {
    if (type === 'flare' ? owner.cmFlare <= 0 : owner.cmChaff <= 0) return;
    if (type === 'flare') owner.cmFlare -= 2; else owner.cmChaff -= 2;
  }
  let last = null;
  for (let k = 0; k < 2; k++) {
    const c = { type, owner, pos: owner.pos.clone(), vel: owner.vel.clone().multiplyScalar(0.8).add(new THREE.Vector3((rnd() - 0.5) * 30, -20 - rnd() * 15, (rnd() - 0.5) * 30)), life: type === 'flare' ? 4 : 3.5 };
    cms.push(c); last = c;
  }
  // ракеты, наведённые на owner, могут переключиться на ловушку / отражатели
  for (const m of missiles) {
    if (m.dead || m.target !== owner || m.decoy || m.lost || m.pos.distanceTo(owner.pos) > 7000) continue;
    if (type === 'flare' && m.M.kind === 'ir') {
      const heat = seekerHeat(owner, m.pos);
      if (rnd() < clamp((1 - m.M.ir.irccm) * 1.7 / (1.7 + heat), 0, 0.92)) { m.decoy = last; m.why = 'flare'; }
    } else if (type === 'chaff' && m.M.kind !== 'ir' && (m.M.kind === 'sarh' || m.active)) {
      if (rnd() < (1 - m.M.eccm) * (isNotched(m.pos, owner) ? 0.85 : 0.22)) { m.decoy = last; m.why = 'chaff'; }
    }
  }
  if (type === 'chaff') { // срыв сопровождения РЛС
    if (owner === player) {
      for (const e of enemies) if (e.stt && !e.dead && rnd() < (isNotched(e.pos, player) ? 0.8 : 0.2) * (1 - 0.3 * e.skill)) { e.stt = false; e.sttCD = 2; }
    } else if (radar.lock === owner && rnd() < (isNotched(player.pos, owner) ? 0.8 : 0.15)) { radar.lock = null; popup('ЗАХВАТ СОРВАН ДИПОЛЯМИ', 'bad'); sfx.lost(); }
  }
  while (cms.length > 160) cms.shift();
}
function updateCMs(dt) {
  for (let i = cms.length - 1; i >= 0; i--) {
    const c = cms[i]; c.life -= dt;
    c.vel.multiplyScalar(Math.max(0, 1 - (c.type === 'flare' ? 0.9 : 2.5) * dt)); c.vel.y -= (c.type === 'flare' ? 8 : 2) * dt;
    c.pos.addScaledVector(c.vel, dt);
    if (c.type === 'flare') {
      FX.emit(c.pos.x, c.pos.y, c.pos.z, 0, 0, 0, 1, 0.95, 0.75, 1, 5, -3, 0.12, 0, 0);
      if (rnd() < 0.6) SMOKE.emit(c.pos.x, c.pos.y, c.pos.z, 0, 1, 0, 0.9, 0.9, 0.9, 0.5, 2, 5, 1.8, 0.3, 0);
    } else if (rnd() < 0.5) FX.emit(c.pos.x + (rnd() - 0.5) * 12, c.pos.y + (rnd() - 0.5) * 12, c.pos.z + (rnd() - 0.5) * 12, 0, -1, 0, 0.8, 0.85, 0.9, 0.6, 1.4, 0, 0.4, 0, 0);
    if (c.life <= 0) cms.splice(i, 1);
  }
}

// ═════════════ Урон, сбитие, обломки ═════════════
function damage(e, amount, by, msl) {
  if (e.dead) return;
  if (e === player) { hurt(amount * MODE.dmgTaken); return; }
  e.hp -= amount;
  if (by !== 'ЗЕМЛЯ' && by !== 'ТАРАН') hitMarks.push({ pos: e.pos.clone(), t: 0.35, big: amount > 40 }); // маркер попадания
  if (e.hp <= 0) killEnemy(e, by, msl);
}
function killEnemy(e, by, msl) {
  e.dead = true;
  explosion(e.pos, e.type === 'boss' ? 7 : 3.2);
  sfx.boom(0.3);
  if (radar.lock === e) radar.lock = null;
  radar.contacts.delete(e);
  G.kills += UNIT_KILLS[e.type];
  let pts = e.S.pts, bonus = '';
  if (by === 'ПУШКА') { pts *= 1.5; bonus = ' · пушкой ×1,5'; }
  else if (msl && msl.flown > 20000) { pts *= 1.3; bonus = ' · дальний пуск ×1,3'; }
  pts *= MODE.scoreK;
  G.score += Math.round(pts);
  popup(`СБИТ ${e.S.name}${by ? ' · ' + by : ''}${bonus}`, e.type === 'boss' ? 'boss' : 'good');
  if (e.type === 'boss') { G.bossKilled = true; $('bossbar').style.display = 'none'; G.slowmo = 1; }
  wrecks.push({ group: e.group, vel: e.vel.clone(), spin: (rnd() - 0.5) * 3, t: 0, big: e.type === 'boss' });
  // разлёт обломков: крыло и киль отрываются и падают отдельно, каждый со своим шлейфом
  const dg = debrisGeo(e.type);
  for (const g of dg) {
    const m = new THREE.Mesh(g, MAT_JET); m.position.copy(e.pos); m.rotation.set(rnd() * 6, rnd() * 6, rnd() * 6); scene.add(m);
    const [vx, vy, vz] = sph(70);
    wrecks.push({ group: m, vel: e.vel.clone().multiplyScalar(0.85).add(new THREE.Vector3(vx, vy + 20, vz)), spin: (rnd() - 0.5) * 9, t: 0, big: false, small: true });
  }
}
function updateWrecks(dt) {
  for (let i = wrecks.length - 1; i >= 0; i--) {
    const w = wrecks[i], p = w.group.position; w.t += dt;
    w.vel.y -= G0 * dt; w.vel.multiplyScalar(1 - 0.2 * dt); p.addScaledVector(w.vel, dt);
    w.group.rotation.z += w.spin * dt; w.group.rotation.x += w.spin * 0.3 * dt;
    if (!w.small || w.t < 6) FX.emit(p.x, p.y, p.z, 0, 0, 0, 1, 0.55, 0.15, 1, w.big ? 18 : w.small ? 3 : 7, 4, 0.3, 0, 0);
    if (!w.small || rnd() < 0.5) SMOKE.emit(p.x, p.y, p.z, (rnd() - 0.5) * 4, 3, (rnd() - 0.5) * 4, 0.12, 0.12, 0.12, 0.7, w.big ? 14 : w.small ? 3 : 6, 12, 5, 0.3, 1);
    if (p.y < terrainH(p.x, p.z) + 2 || w.t > 40) { explosion(p, w.big ? 8 : w.small ? 1.2 : 4); scene.remove(w.group); wrecks.splice(i, 1); }
  }
}
function hurt(amount) {
  if (G.god || player.invuln > 0 || G.over) return;
  player.hull -= amount; player.invuln = 0.3; G.shake = Math.min(1.2, 0.4 + amount / 60);
  $('flash').style.transition = 'none'; $('flash').style.opacity = Math.min(0.6, 0.2 + amount / 100);
  requestAnimationFrame(() => { $('flash').style.transition = 'opacity .6s'; $('flash').style.opacity = 0; });
  sfx.hit();
  if (player.hull <= 0) {
    if (MODE.training) { player.hull = 100; popup('В бою вы были бы сбиты — корпус восстановлен', 'bad'); return; }
    player.hull = 0; endGame('hull');
  }
}

// ═════════════ Пушка (общая) ═════════════
const bulletGeo = new THREE.BoxGeometry(0.3, 0.3, 14);
const bulletMat = new THREE.MeshBasicMaterial({ color: lin(0xffe9a0).multiplyScalar(4), fog: false }), bulletMatE = new THREE.MeshBasicMaterial({ color: lin(0xff8a6a).multiplyScalar(4), fog: false });
for (let i = 0; i < 180; i++) { const m = new THREE.Mesh(bulletGeo, bulletMat); m.visible = false; scene.add(m); bullets.push({ mesh: m, on: false, vel: new THREE.Vector3(), life: 0, owner: null, target: null, prev: new THREE.Vector3() }); }
let gunTarget = null;
function findGunTarget() {
  gunTarget = null; let best = Math.cos(MODE.gunCone * D2R);
  fwdOf(player, TMP3);
  for (const e of enemies) {
    if (e.dead) continue;
    TMP.copy(e.pos).sub(player.pos); const d = TMP.length(); if (d > 1800) continue;
    // упреждение: куда цель придёт, пока летит снаряд
    TMP.copy(e.pos).addScaledVector(e.vel, d / 1100).sub(player.pos);
    const c = TMP.dot(TMP3) / TMP.length(); if (c > best) { best = c; gunTarget = e; }
  }
}
function fireBullet(owner, target, dmg) {
  const b = bullets.find((x) => !x.on); if (!b) return;
  fwdOf(owner, TMP3);
  b.on = true; b.mesh.visible = true; b.life = 1.6; b.owner = owner; b.target = target; b.dmg = dmg;
  b.mesh.material = owner === player ? bulletMat : bulletMatE;
  b.mesh.position.copy(owner.pos).addScaledVector(TMP3, 9); b.mesh.position.y -= 0.4;
  b.prev.copy(b.mesh.position);
  b.vel.copy(TMP3).multiplyScalar(1050).add(owner.vel);
  TMP.set((rnd() - 0.5) * 6, (rnd() - 0.5) * 6, (rnd() - 0.5) * 6); b.vel.add(TMP); // рассеивание
  b.mesh.quaternion.setFromUnitVectors(ZAXIS, TMP.copy(b.vel).normalize());
  if (owner === player) { G.shots++; sfx.shot(); }
  FX.emit(b.mesh.position.x, b.mesh.position.y, b.mesh.position.z, 0, 0, 0, 1, 0.8, 0.4, 1, 2.2, 0, 0.05, 0, 0);
}
function segHitsSphere(a, b, c, r) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z, l2 = abx * abx + aby * aby + abz * abz || 1e-6;
  const t = clamp(((c.x - a.x) * abx + (c.y - a.y) * aby + (c.z - a.z) * abz) / l2, 0, 1);
  const dx = a.x + abx * t - c.x, dy = a.y + aby * t - c.y, dz = a.z + abz * t - c.z;
  return dx * dx + dy * dy + dz * dz < r * r;
}
function updateBullets(dt) {
  for (const b of bullets) {
    if (!b.on) continue;
    b.life -= dt; b.prev.copy(b.mesh.position);
    if (MODE.gunHome > 0 && b.target && !b.target.dead && b.owner === player) { // лёгкое «доведение» — прощает мелкие ошибки прицеливания
      TMP.copy(b.target.pos).sub(b.mesh.position).normalize().multiplyScalar(b.vel.length());
      b.vel.lerp(TMP, Math.min(1, MODE.gunHome * dt));
    }
    b.vel.y -= G0 * dt;
    b.mesh.position.addScaledVector(b.vel, dt);
    let hit = false;
    for (const e of opponentsOf(b.owner)) {
      if (e.dead) continue;
      if (segHitsSphere(b.prev, b.mesh.position, e.pos, e.r + 2)) {
        if (b.owner === player) G.hits++;
        FX.emit(e.pos.x, e.pos.y, e.pos.z, 0, 0, 0, 1, 0.9, 0.5, 1, 3, 0, 0.15, 0, 0);
        damage(e, b.dmg, 'ПУШКА'); hit = true; break;
      }
    }
    const p = b.mesh.position;
    if (!hit && p.y < terrainH(p.x, p.z)) hit = true;
    if (hit || b.life <= 0) { b.on = false; b.mesh.visible = false; }
  }
}

// ═════════════ ИИ «Подстилки улитки» ═════════════
function spawnAI(type, pos, yaw, leader, off) {
  const S = AC[type], J = jetGeo(type);
  const g = new THREE.Group(); g.rotation.order = 'YXZ';
  const mesh = new THREE.Mesh(J.geo, MAT_JET); mesh.castShadow = !!P.shadows; g.add(mesh);
  const flames = J.nozzles.map((nz) => { const f = new THREE.Mesh(flameGeo, flameMat); f.position.copy(nz); f.scale.set(type === 'boss' ? 1.8 : 1.1, type === 'boss' ? 1.8 : 1.1, 2); g.add(f); return f; });
  const lo = S.loadouts[(rnd() * S.loadouts.length) | 0];
  const msl = J.stations.map((st, i) => {
    const k = lo[i]; if (!k) return null;
    const mm = missileMesh(k); mm.position.copy(st); mm.position.y -= MISSILES[k].vis.r; g.add(mm); return { key: k, mesh: mm };
  });
  scene.add(g);
  const e = makeCraft({ type, S, group: g, flames, msl, hp: S.hp, gmax: S.gmax, wCap: S.wCap, agil: 2 + S.skill * MODE.aiSkill * 2.5, milAcc: S.milAcc, abAcc: S.abAcc, cd0: S.cd0,
    ir: S.ir, r: S.r, jam: !!S.jam, cmFlare: S.cm, cmChaff: S.cm, skill: S.skill * MODE.aiSkill,
    state: 'ingress', thinkT: rnd() * 0.3, stt: false, sttLostT: 0, sttCD: 0, mslCD: 6 + rnd() * 6, cmT: 0, crank: rnd() < 0.5 ? 1 : -1, reactT: 0, threat: null,
    gunT: 0, want: new THREE.Vector3(0, 0, -1), wantAB: false, leader, off });
  e.pos.copy(pos); e.yaw = yaw; e.speed = type === 'boss' ? 220 : 260;
  fwdOf(e, e.vel).multiplyScalar(e.speed);
  enemies.push(e);
  return e;
}
const AS_A = new THREE.Vector3(), AS_B = new THREE.Vector3(), AI_TOP = new THREE.Vector3();
function aiSees(e) { // РЛС ИИ видит игрока?
  const rel = AS_A.copy(player.pos).sub(e.pos), d = rel.length();
  fwdOf(e, AS_B);
  if (angleBetween(AS_B, rel) > 60 * D2R) return false;
  if (d > e.S.radarR * Math.pow(player.rcs() / 5, 0.25)) return false;
  return !isNotched(e.pos, player);
}
function aiLaunch(e, key) {
  const i = e.msl.findIndex((x) => x && x.key === key); if (i < 0) return;
  const mesh = e.msl[i].mesh; e.msl[i] = null;
  launchMissile(e, key, player, mesh);
}
function aiThink(e) {
  const p = player, toP = AI_TOP.copy(p.pos).sub(e.pos), d = toP.length();
  const sees = aiSees(e);
  // ── угрозы: ракеты игрока, летящие в e (что «знает» его СПО / что видно глазами) ──
  let threat = null, tD = 1e9;
  for (const m of missiles) {
    if (m.dead || m.owner !== player || m.target !== e || m.lost || m.decoy) continue;
    const md = m.pos.distanceTo(e.pos);
    let known = m.seenBy.has(e);
    if (!known) {
      if (m.M.kind === 'arh' && m.active) known = true;                          // СПО слышит активную ГСН
      else if (m.M.kind !== 'ir' && radar.lock === e && m.t < 6) known = true;   // пуск при захвате
      else if (m.M.kind === 'sarh' && radar.lock === e) known = true;            // подсвет
      else if (md < 4000 && rnd() < e.skill * 0.35) known = true;                // увидел дымный след
      if (known) m.seenBy.add(e);
    }
    if (known && md < tD) { threat = m; tD = md; }
  }
  if (threat && tD < (threat.M.kind === 'ir' ? 5000 : 15000)) {
    if (e.threat !== threat) { e.threat = threat; e.reactT = (1 - e.skill) * 1.4; }
    e.reactT -= 0.25;
    if (e.reactT <= 0) e.state = 'defend';
  } else { e.threat = null; if (e.state === 'defend') e.state = 'engage'; }
  // ── оборона: выход на траверз (в доплеровский провал), снижение, контрмеры ──
  if (e.state === 'defend') {
    const m = e.threat;
    TMP2.copy(e.pos).sub(m.pos); TMP2.y = 0; TMP2.normalize();
    const perp = TMP3.set(-TMP2.z, 0, TMP2.x); fwdOf(e, TGT);
    if (perp.dot(TGT) < 0) perp.negate();
    e.want.copy(perp); e.want.y = agl(e) > 1500 ? -0.3 : 0.05;
    e.wantAB = m.M.kind !== 'ir';
    if (tD < 1800) { e.want.addScaledVector(TMP2, -0.4).normalize(); } // в последний момент — резкий доворот на ракету
    if (e.cmT <= 0) {
      if (m.M.kind === 'ir' && tD < 3500) { dropCM(e, 'flare'); e.cmT = 0.7 - e.skill * 0.3; }
      else if (m.M.kind !== 'ir' && tD < 7000) { dropCM(e, 'chaff'); e.cmT = 0.9 - e.skill * 0.3; }
    }
    safety(e); return;
  }
  // ── сопровождение ──
  const hasR = e.msl.some((x) => x && MISSILES[x.key].kind !== 'ir');
  const hasIR = e.msl.some((x) => x && MISSILES[x.key].kind === 'ir');
  const guiding = missiles.filter((m) => !m.dead && m.owner === e && !m.lost && (m.M.kind === 'sarh' || (m.M.kind === 'arh' && !m.active))).length;
  const radarKey = hasR ? e.msl.find((x) => x && MISSILES[x.key].kind !== 'ir').key : null;
  const rK = radarKey && dlz(MISSILES[radarKey], e.pos.y, e.speed, closingOf(p, e.pos));
  const launchR = rK ? rK.rne + (rK.rmax - rK.rne) * (0.55 - 0.35 * e.skill) : 0;
  if (sees && e.sttCD <= 0 && (guiding || (hasR && d < launchR * 1.25))) { if (!e.stt) { e.stt = true; e.sttLostT = 0; } }
  else if (!guiding && !(hasR && d < launchR * 1.25)) e.stt = false;
  // ── пуски ──
  fwdOf(e, TMP2);
  const off = angleBetween(TMP2, toP);
  const maxInFlight = e.type === 'boss' ? 2 : 1;
  if (e.mslCD <= 0 && radarKey && e.stt && guiding < maxInFlight && d < launchR && d > MISSILES[radarKey].rmin && off < 25 * D2R) {
    aiLaunch(e, radarKey); e.mslCD = 9 + (1 - e.skill) * 7; e.state = 'crank';
  } else if (e.mslCD <= 0 && hasIR && d < 10000) {
    const irKey = e.msl.find((x) => x && MISSILES[x.key].kind === 'ir').key, M_ = MISSILES[irKey];
    if (d > M_.rmin && irCanSee(M_, p, e.pos, TMP2, Math.min(M_.ir.fov, 30)) && d < dlz(M_, e.pos.y, e.speed, closingOf(p, e.pos)).rmax * 0.8) {
      aiLaunch(e, irKey); e.mslCD = 6 + (1 - e.skill) * 5;
    }
  }
  // ── манёвр ──
  const lead = TGT.copy(p.pos).addScaledVector(p.vel, Math.min(6, d / 900));
  if (e.type === 'boss') {
    // флагман держит дистанцию, эскорт прикрывает
    if (d < 14000) { e.want.copy(e.pos).sub(p.pos).normalize(); e.want.y = 0; } else { e.want.copy(toP).normalize(); e.want.y = (7000 - e.pos.y) / 4000; }
    e.wantAB = false;
  } else if (e.leader && !e.leader.dead && d > 18000) {
    e.want.copy(e.leader.pos).add(e.off).sub(e.pos); if (e.want.lengthSq() < 1) e.want.copy(fwdOf(e.leader, TMP3)); e.want.normalize(); e.wantAB = e.pos.distanceTo(e.leader.pos) > 800;
  } else if (e.state === 'crank' && guiding) {
    // держим цель у края зоны обзора РЛС (~50°), чтобы медленнее сближаться и не терять захват
    const a = Math.atan2(toP.x, toP.z) + e.crank * 50 * D2R;
    e.want.set(Math.sin(a), (p.pos.y - e.pos.y) / Math.max(3000, d), Math.cos(a)).normalize(); e.wantAB = false;
  } else if (d > 6000) {
    e.state = 'engage';
    e.want.copy(lead).sub(e.pos); e.want.y += 800; e.want.normalize(); e.wantAB = d < 20000 && e.speed < 300;
  } else {
    e.state = 'dogfight';
    e.want.copy(lead).sub(e.pos).normalize(); e.wantAB = e.speed < 290;
  }
  safety(e);
}
// земля и граница арены важнее всего остального
function safety(e) {
  const ahead = TMP3.copy(e.pos).addScaledVector(e.vel, 5);
  const clearance = ahead.y - terrainH(ahead.x, ahead.z);
  if (clearance < 600 || agl(e) < 400) { e.want.y = Math.max(e.want.y, clearance < 250 ? 0.9 : 0.45); e.want.normalize(); }
  const r = Math.hypot(e.pos.x, e.pos.z);
  if (r > WORLD.R + 800) { e.want.set(-e.pos.x, 0, -e.pos.z).normalize(); }
  if (e.pos.y > WORLD.CEIL - 1500) e.want.y = Math.min(e.want.y, -0.2);
}
function updateAI(e, dt) {
  e.thinkT -= dt; e.mslCD -= dt; e.cmT -= dt; e.sttCD -= dt; e.gunT -= dt;
  if (e.stt) { if (!aiSees(e)) { e.sttLostT += dt; if (e.sttLostT > 0.8) { e.stt = false; e.sttCD = 1.5; } } else e.sttLostT = 0; }
  if (e.thinkT <= 0) { e.thinkT = 0.25; aiThink(e); }
  const [rx, ry] = steerTo(e, e.want, 2.2 + e.skill);
  e.ab = e.wantAB; e.thr = 1;
  flyStep(e, rx, ry, dt);
  if (agl(e) < 5) { e.hp = 0; killEnemy(e, 'ЗЕМЛЯ'); return; } // загнали в землю — засчитывается
  // пушка на малой дистанции
  const d = e.pos.distanceTo(player.pos);
  if (d < 1300 && e.gunT <= 0 && !G.over) {
    fwdOf(e, TMP2); TMP.copy(player.pos).addScaledVector(player.vel, d / 1100).sub(e.pos);
    if (angleBetween(TMP2, TMP) < 2.5 * D2R) { fireBullet(e, player, 4); e.gunT = 0.09; }
  }
  // столкновение с игроком
  if (d < e.r + player.r && !G.over) { hurt(50); damage(e, 80, 'ТАРАН'); }
  // визуал
  e.group.position.copy(e.pos); e.group.rotation.set(e.pitch, e.yaw, e.roll);
  for (const f of e.flames) { f.visible = e.ab || e.type === 'boss'; f.scale.z = (e.ab ? 4.5 : 1.5) * (0.85 + rnd() * 0.3); }
  if (P.contrails && e.pos.y > 7000 && rnd() < 0.5) SMOKE.emit(e.pos.x, e.pos.y, e.pos.z, 0, 0, 0, 0.95, 0.96, 1, 0.35, 4, 5, 6, 0, 0);
  if (e.type === 'boss') $('bossFill').style.width = Math.max(0, e.hp / e.S.hp * 100) + '%';
}
function runSchedule() {
  while (schedIdx < schedule.length && schedule[schedIdx].t <= G.runTime) {
    const ev = schedule[schedIdx++];
    if (ev.type === 'tanker') { spawnTanker(); continue; }
    const b = ev.brg * D2R, R = WORLD.R - 400;
    const base = new THREE.Vector3(Math.sin(b) * R, 0, -Math.cos(b) * R);
    const yaw = Math.atan2(base.x, base.z); // нос к центру арены
    const leader = ev.type === 'fighter' ? enemies.find((x) => x.type === 'boss' && !x.dead) : null;
    for (let i = 0; i < ev.n; i++) {
      const off = new THREE.Vector3((i - (ev.n - 1) / 2) * 600, (i % 2) * 300, 400 * i);
      const pos = base.clone().add(off.clone().applyAxisAngle(UP, yaw));
      pos.y = Math.max(terrainH(pos.x, pos.z) + 1500, (ev.type === 'boss' ? 7000 : 4500) + rnd() * 1500);
      const e = spawnAI(ev.type, pos, yaw, leader, leader ? new THREE.Vector3((i ? 1 : -1) * 900, 200, 600) : null);
      if (ev.type === 'boss') { G.bossSpawned = true; }
    }
    if (ev.type === 'boss') { popup('ПОДСТИЛКА УЛИТКИ НА ПОДХОДЕ!', 'boss'); $('bossbar').style.display = 'block'; }
    else popup(`${AC[ev.type].name} ×${ev.n} — пеленг ${ev.brg}°`, 'info');
  }
}

// ═════════════ Танкеры ═════════════
const tankerGeo = buildTanker();
function spawnTanker() {
  const hd = player.yaw + (rnd() - 0.5) * 0.6;
  const f = new THREE.Vector3(-Math.sin(hd), 0, -Math.cos(hd));
  const g = new THREE.Mesh(tankerGeo, MAT_METAL); g.castShadow = !!P.shadows; g.rotation.order = 'YXZ';
  const pos = player.pos.clone().addScaledVector(f, 5000).addScaledVector(rightOf(player, TMP2), (rnd() - 0.5) * 2000);
  pos.x = clamp(pos.x, -9000, 9000); pos.z = clamp(pos.z, -9000, 9000);
  pos.y = Math.max(terrainH(pos.x, pos.z) + 1200, clamp(player.pos.y, 2500, 7000));
  g.position.copy(pos); g.rotation.y = hd; scene.add(g);
  tankers.push({ mesh: g, pos: g.position, yaw: hd, speed: 185, life: 75, done: false, drogue: new THREE.Vector3(), vel: new THREE.Vector3() });
  popup('ЗАПРАВЩИК В ЗОНЕ', 'info');
}
function updateTankers(dt) {
  for (let i = tankers.length - 1; i >= 0; i--) {
    const t = tankers[i]; t.life -= dt;
    const r = Math.hypot(t.pos.x, t.pos.z);
    if (r > WORLD.R - 2500) t.yaw += 0.12 * dt; // разворот, чтобы не уйти из зоны
    t.vel.set(-Math.sin(t.yaw), t.done ? 0.15 : 0, -Math.cos(t.yaw)).multiplyScalar(t.speed);
    t.pos.addScaledVector(t.vel, dt); t.mesh.rotation.y = t.yaw;
    t.drogue.copy(TANKER_DROGUE).applyQuaternion(t.mesh.quaternion).add(t.pos);
    if (!t.done && t.drogue.distanceTo(player.pos) < MODE.drogueR && !G.over) {
      player.fuel = Math.min(player.fuelMax, player.fuel + FUEL_PICKUP); t.done = true; t.life = Math.min(t.life, 20);
      popup(`ДОЗАПРАВКА +${FUEL_PICKUP} с`, 'good'); sfx.pick();
    }
    if (t.life <= 0) { scene.remove(t.mesh); tankers.splice(i, 1); }
  }
}

// ═════════════ Игрок ═════════════
function updatePlayer(dt) {
  const p = player;
  const kx = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
  const ky = (held.has('up') ? 1 : 0) - (held.has('down') ? 1 : 0);
  let sx = clamp(input.sx + kx, -1, 1), sy = clamp(input.sy + ky, -1, 1);
  const r = Math.hypot(p.pos.x, p.pos.z), h = agl(p);
  if (r > WORLD.R) {
    const diff = wrapPI(Math.atan2(p.pos.x, p.pos.z) - p.yaw); // yaw «к центру»: нос на −pos
    sx = clamp(-diff * 1.5, -1, 1) * (r > WORLD.R + 1500 ? 1 : 0.6) + sx * 0.3;
    warn('ВЕРНИСЬ В ЗОНУ');
  } else if (p.pos.y > WORLD.CEIL) { sy = Math.min(sy, -0.5); warn('ПОТОЛОК'); }
  else if (h < 300 && p.pitch < -0.1) warn('ВЫСОТА! ВВЕРХ');
  else if (p.fuel < 35) warn('БИНГО — МАЛО ТОПЛИВА');
  else if (p.speed < 110) warn('МАЛАЯ СКОРОСТЬ');
  else warn('');
  p.thr += ((held.has('thrUp') ? 1 : held.has('thrDown') ? 0.55 : 0.85) - p.thr) * Math.min(1, 3 * dt);
  const wasAB = p.ab;
  p.ab = (input.ab || held.has('ab')) && p.fuel > 1;
  if (p.ab && !wasAB) { G.kick = 1; noise(0.5, 0.14, 700); } // включение форсажа — толчок
  flyStep(p, sx, sy, dt);
  p.cmdX = sx; p.cmdY = sy;
  // земля и здания
  const gh = terrainH(p.pos.x, p.pos.z);
  if (p.pos.y < gh + 4) {
    if (p.pitch < -0.08) { hurt(p.speed > 200 ? 60 : 30); explosion(p.pos, 2, [0.7, 0.6, 0.4]); }
    p.pos.y = gh + 4; p.pitch = Math.max(p.pitch, 0.25);
  }
  if (p.pos.y < 400) for (const b of buildings) {
    const dx = p.pos.x - b.x, dz = p.pos.z - b.z;
    if (Math.abs(dx) < b.hw + 4 && Math.abs(dz) < b.hd + 4 && p.pos.y < b.y1 + 4) {
      hurt(45); p.pos.y = b.y1 + 6; p.pitch = Math.max(p.pitch, 0.3); explosion(p.pos, 1.5, [1, 0.8, 0.4]); break;
    }
  }
  if (p.invuln > 0) p.invuln -= dt;
  // пушка
  p.heat = Math.max(0, p.heat - 22 * dt);
  if (p.overheated && p.heat < 40) p.overheated = false;
  G.fireT -= dt; G.mslT -= dt; G.cmT -= dt;
  findGunTarget();
  if ((input.fire || held.has('fire')) && !p.overheated && G.fireT <= 0) {
    G.fireT = 1 / 20; fireBullet(p, gunTarget, 7); p.heat += 2.2;
    if (p.heat >= 100) { p.heat = 100; p.overheated = true; popup('ПЕРЕГРЕВ ПУШКИ', 'bad'); }
  }
  // топливо: форсаж ×3, малый газ экономичнее
  p.fuel -= dt * (p.ab ? 3 : 0.45 + 0.6 * p.thr) * (MODE.fuelBurn ?? 1);
  if (p.fuel <= 0) { p.fuel = 0; endGame('fuel'); }
  // следы
  const nz = TMP.set(0, 0, 7.6).applyQuaternion(ship.quaternion).add(p.pos);
  if (p.ab) FX.emit(nz.x, nz.y, nz.z, -p.vel.x * 0.15, -p.vel.y * 0.15, -p.vel.z * 0.15, 1, 0.55, 0.2, 0.7, 2.4, 3, 0.12, 0, 0);
  if (P.contrails && p.pos.y > 7000) SMOKE.emit(nz.x, nz.y, nz.z, 0, 0, 0, 0.95, 0.96, 1, 0.4, 2.5, 4, 6, 0, 0);
  if (p.n > 4 && p.speed > 160) for (const s of [-1, 1]) { const w = TMP2.set(6.9 * s, 0, 3.5).applyQuaternion(ship.quaternion).add(p.pos); SMOKE.emit(w.x, w.y, w.z, 0, 0, 0, 1, 1, 1, clamp((p.n - 4) * 0.08, 0.1, 0.45), 0.8, 1.5, 0.6, 0, 0); }
  // конус конденсата у скорости звука
  const mach = p.speed / (340 - p.pos.y * 0.004);
  p.mach = mach;
  if (!p.sup && mach >= 1) { p.sup = true; sonicBoom(); }
  else if (p.sup && mach < 0.97) { p.sup = false; noise(1.2, 0.05, 800, 0.4); popup('ДОЗВУК', 'info'); }
  if (mach > 0.95 && mach < 1.07 && p.pos.y < 9000) {
    fwdOf(p, TMP3); rightOf(p, TMP2); const upv = TMP.crossVectors(TMP2, TMP3);
    for (let k = 0; k < 6; k++) {
      const a = rnd() * Math.PI * 2, rr = 2.4 + rnd() * 0.8;
      SMOKE.emit(p.pos.x + TMP3.x * 1.5 + (TMP2.x * Math.cos(a) + upv.x * Math.sin(a)) * rr, p.pos.y + TMP3.y * 1.5 + (TMP2.y * Math.cos(a) + upv.y * Math.sin(a)) * rr,
        p.pos.z + TMP3.z * 1.5 + (TMP2.z * Math.cos(a) + upv.z * Math.sin(a)) * rr, p.vel.x * 0.9, p.vel.y * 0.9, p.vel.z * 0.9, 1, 1, 1, 0.35, 1.2, 2, 0.12, 0, 0);
    }
  }
  if (p.hull < 40 && rnd() < 0.5) SMOKE.emit(p.pos.x, p.pos.y, p.pos.z, 0, 2, 0, 0.2, 0.2, 0.2, 0.55, 3, 7, 2, 0.5, 0);
}
function sonicBoom() {
  const p = player;
  G.shake = Math.max(G.shake, 0.9); G.kick = 1.6;
  popup('СВЕРХЗВУК · М1', 'info');
  // хлопок: низкий удар + широкополосный треск
  boomSound(0.34);
  // облако конденсата, разлетающееся кольцом
  fwdOf(p, TMP3); rightOf(p, TMP2); const upv = TMP.crossVectors(TMP2, TMP3);
  for (let k = 0; k < 90; k++) {
    const a = k / 90 * Math.PI * 2, cx = Math.cos(a), sy = Math.sin(a);
    const ox = TMP2.x * cx + upv.x * sy, oy = TMP2.y * cx + upv.y * sy, oz = TMP2.z * cx + upv.z * sy;
    SMOKE.emit(p.pos.x + ox * 3, p.pos.y + oy * 3, p.pos.z + oz * 3, p.vel.x * 0.8 + ox * 45, p.vel.y * 0.8 + oy * 45, p.vel.z * 0.8 + oz * 45, 1, 1, 1, 0.65, 2.5, 14, 0.8, 2.5, 0);
  }
  shockRing.position.copy(p.pos); shockRing.quaternion.setFromUnitVectors(ZAXIS, TMP3); shockRing.scale.setScalar(3);
  shockRing.visible = true; shock.t = 0; shock.on = true;
}
function updateShock(dt) {
  if (!shock.on) return;
  shock.t += dt;
  const k = shock.t / 0.7;
  shockRing.scale.setScalar(3 + k * 90); shockRing.material.opacity = Math.max(0, 0.55 * (1 - k));
  if (k >= 1) { shock.on = false; shockRing.visible = false; }
}
function placeShip() {
  ship.position.copy(player.pos); ship.rotation.set(player.pitch, player.yaw, player.roll);
  for (const el of elevons) el.piv.rotation.x = clamp(-(player.cmdY || 0) * 0.35 + (player.cmdX || 0) * 0.3 * el.s, -0.45, 0.45);
  const ab = player.ab;
  flame.scale.set(ab ? 1.25 : 0.9, ab ? 1.25 : 0.9, (ab ? 6 : 1.2 * player.thr) * (0.9 + rnd() * 0.2));
  flame2.scale.set(0.6, 0.6, (ab ? 3.2 : 0.7) * (0.9 + rnd() * 0.2));
  flameMat.opacity = ab ? 0.9 : 0.5;
  for (const d of diamonds) { d.visible = ab; d.scale.setScalar(0.8 + rnd() * 0.3); }
  if (abLight) abLight.intensity = ab ? 5 * (0.8 + rnd() * 0.4) : 0.4 * player.thr;
}
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
let camSnap = true;
function updateCamera(dt) {
  const p = player;
  fwdOf(p, TMP3); rightOf(p, TMP2);
  if (held.has('lookBack')) { // взгляд назад: над дроном, смотрим на хвост — видно догоняющие ракеты
    camera.position.copy(p.pos).addScaledVector(TMP3, 26).addScaledVector(UP, 7);
    camera.up.set(0, 1, 0); camera.lookAt(TGT.copy(p.pos).addScaledVector(TMP3, -300));
    camSnap = true;
  } else {
    // камера «уходит» наружу виража, отстаёт при перегрузке и на форсаже
    const back = 20 + (p.n - 1) * 0.9 + (p.ab ? 4 : 0);
    TGT.copy(p.pos).addScaledVector(TMP3, -back).addScaledVector(UP, 5.5 - p.wp * 10).addScaledVector(TMP2, p.wy * 18);
    if (camSnap) { camPos.copy(TGT); camSnap = false; } else camPos.lerp(TGT, 1 - Math.exp(-7 * dt));
    camera.position.copy(camPos);
    camLook.copy(p.pos).addScaledVector(TMP3, 60).addScaledVector(UP, 2);
    camera.up.set(0, 1, 0); camera.lookAt(camLook);
    camera.rotation.z += p.roll * 0.3;
  }
  // тряска: попадания, перегрузка, околозвук, форсаж
  const mach = p.speed / (340 - p.pos.y * 0.004);
  const buffet = (p.n > 7 ? (p.n - 7) * 0.06 : 0) + (mach > 0.95 && mach < 1.05 ? 0.12 : 0) + (p.ab ? 0.04 : 0);
  if (G.shake > 0) G.shake -= dt * 1.6;
  const s = Math.max(0, G.shake) * 0.8 + buffet;
  if (s > 0) { camera.position.x += (rnd() - 0.5) * s; camera.position.y += (rnd() - 0.5) * s; }
  G.kick = Math.max(0, (G.kick || 0) - dt * 2.5);
  const fov = (camera.aspect < 1 ? 80 : 66) + (p.ab ? 5 : 0) + clamp((p.speed - 250) * 0.025, -4, 8) + G.kick * 6;
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, 5 * dt); camera.updateProjectionMatrix(); }
}

// ═════════════ СПО и датчик пуска ракет ═════════════
const rwr = { list: [], maws: [], inc: [], beepT: 0, known: new Set() };
function clockOf(az) { let h = Math.round(((az / D2R) % 360 + 360) % 360 / 30); if (h === 0) h = 12; return h; }
// «догоняет 120 м/с · 6 с» или «отстаёт» — видно, спасает ли манёвр
function closingText(m) {
  if (m.closing === undefined) return 'сближается';
  if (m.closing < 15) return 'НЕ ДОГОНЯЕТ';
  const tti = m.dPrev / m.closing;
  return `догоняет ${Math.round(m.closing)} м/с · ${tti < 60 ? Math.ceil(tti) + ' с' : '>1 мин'}`;
}
function updateRwr(dt) {
  const out = [];
  for (const e of enemies) {
    if (e.dead) continue;
    const rel = TMP.copy(player.pos).sub(e.pos), d = rel.length();
    fwdOf(e, TMP2);
    if (angleBetween(TMP2, rel) > 65 * D2R || d > e.S.radarR * 1.5) continue; // СПО слышит РЛС дальше, чем она видит нас
    const launch = missiles.some((m) => !m.dead && m.owner === e && m.target === player && !m.lost && (m.M.kind === 'sarh' || (m.M.kind === 'arh' && !m.active && m.t < 4)));
    const [az] = localAngles(player, TMP.copy(e.pos).sub(player.pos));
    out.push({ az, d, code: e.S.code, mode: launch ? 'launch' : e.stt ? 'lock' : 'search', e });
  }
  const maws = [];
  for (const m of missiles) {
    if (m.dead || m.owner === player || m.target !== player) continue;
    const d = m.pos.distanceTo(player.pos);
    const [az] = localAngles(player, TMP.copy(m.pos).sub(player.pos));
    if (m.M.kind === 'arh' && m.active && !m.lost) out.push({ az, d, code: 'М', mode: 'launch', m });
    const tb = m.t - m.M.drop, motor = tb >= 0 && (tb < m.M.burn || (m.M.sustain && tb < m.M.burn + m.M.sustain.t));
    if (motor && d < 9000) maws.push({ az, d, m }); // УФ/ИК-датчик видит факел двигателя
  }
  // звук: новая РЛС — короткий сигнал, захват — прерывистый, пуск — частый
  for (const t of out) if (t.e && !rwr.known.has(t.e)) { rwr.known.add(t.e); tone(1700, 0.07, 'square', 0.03); }
  rwr.beepT -= dt;
  const worst = out.some((t) => t.mode === 'launch') || maws.length ? 'launch' : out.some((t) => t.mode === 'lock') ? 'lock' : '';
  if (worst && rwr.beepT <= 0) { rwr.beepT = worst === 'launch' ? 0.12 : 0.45; tone(worst === 'launch' ? 1400 : 1000, 0.06, 'square', 0.035); }
  // в «Аркаде» на экране видны все ракеты, летящие в игрока (не только с работающим двигателем)
  const inc = [];
  for (const m of missiles) {
    if (m.dead || m.owner === player || m.target !== player || m.lost || m.decoy) continue;
    const d = m.pos.distanceTo(player.pos);
    if (MODE.allMissiles || maws.some((w) => w.m === m) || (m.M.kind === 'arh' && m.active)) inc.push({ m, d, az: localAngles(player, TMP.copy(m.pos).sub(player.pos))[0] });
  }
  rwr.list = out; rwr.maws = maws; rwr.inc = inc;
  // текст угрозы: откуда, как далеко и догоняет ли
  let txt = '';
  const lm = out.filter((t) => t.mode === 'launch').sort((a, b) => a.d - b.d)[0];
  const near = inc.sort((a, b) => a.d - b.d)[0];
  const lk = out.find((t) => t.mode === 'lock');
  if (near) txt = `РАКЕТА! ${clockOf(near.az)} ч · ${(near.d / 1000).toFixed(1)} км · ${closingText(near.m)}`;
  else if (lm) txt = lm.m ? `РАКЕТА (ГСН) ${clockOf(lm.az)} ч` : `ПУСК! ${lm.code} · ${clockOf(lm.az)} ч`;
  else if (lk) txt = `ЗАХВАТ ${lk.code} · ${clockOf(lk.az)} ч`;
  const th = $('threat'); if (th._t !== txt) { th._t = txt; th.textContent = txt; th.style.display = txt ? 'block' : 'none'; }
}
const rwc = $('rwr'), rwctx = rwc.getContext('2d');
function drawRwr() {
  const c = rwctx, W = rwc.width, H = rwc.height, cx = W / 2, cy = H / 2, R = W / 2 - 8;
  c.clearRect(0, 0, W, H);
  c.fillStyle = 'rgba(2,22,12,.6)'; c.beginPath(); c.arc(cx, cy, R, 0, 7); c.fill();
  c.strokeStyle = 'rgba(120,255,160,.35)'; c.lineWidth = 2;
  for (const k of [0.33, 0.66, 1]) { c.beginPath(); c.arc(cx, cy, R * k, 0, 7); c.stroke(); }
  c.beginPath(); c.moveTo(cx, cy - R); c.lineTo(cx, cy + R); c.moveTo(cx - R, cy); c.lineTo(cx + R, cy); c.stroke();
  c.fillStyle = 'rgba(184,255,200,.9)'; c.font = 'bold 22px ui-monospace, Menlo, monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('СПО', cx, 20);
  const blink = Math.floor(radar.t * 6) % 2 === 0;
  for (const t of rwr.list) {
    const rr = R * clamp(0.3 + 0.7 * t.d / (t.e ? t.e.S.radarR * 1.5 : 20000), 0.25, 0.95);
    const x = cx + Math.sin(t.az) * rr, y = cy - Math.cos(t.az) * rr;
    const col = t.mode === 'launch' ? '#ff4d4d' : t.mode === 'lock' ? '#fde047' : '#9dffb5';
    if (t.mode === 'launch' && !blink) continue;
    c.fillStyle = col; c.font = 'bold 24px ui-monospace, Menlo, monospace'; c.fillText(t.code, x, y);
    if (t.mode !== 'search') { c.strokeStyle = col; c.lineWidth = 3; c.beginPath(); c.moveTo(x, y - 22); c.lineTo(x + 22, y); c.lineTo(x, y + 22); c.lineTo(x - 22, y); c.closePath(); c.stroke(); }
  }
  for (const w of rwr.maws) { // стрелка датчика пуска на краю круга
    const x = cx + Math.sin(w.az) * R * 0.97, y = cy - Math.cos(w.az) * R * 0.97;
    c.fillStyle = blink ? '#ff3b3b' : '#ffb4b4'; c.beginPath(); c.arc(x, y, 10, 0, 7); c.fill();
  }
  c.fillStyle = '#b8ffc8'; c.beginPath(); c.moveTo(cx, cy - 9); c.lineTo(cx + 7, cy + 7); c.lineTo(cx - 7, cy + 7); c.closePath(); c.fill();
}

// ═════════════ HUD ═════════════
const el = { spdBox: $('spdBox'), fuel: $('barFuel').firstElementChild, hull: $('barHull').firstElementChild, heat: $('barHeat').firstElementChild, fuelTxt: $('fuelTxt'),
  kills: $('kills'), combo: $('combo'), score: $('score'), spd: $('spd'), alt: $('alt'), warn: $('warn'), cross: $('cross'), pipper: $('pipper'),
  seeker: $('seeker'), lockInfo: $('lockInfo'), wpn: $('wpn'), hdg: $('hdg'), clock: $('clock') };
const marks = []; for (let i = 0; i < 22; i++) { const d = document.createElement('div'); d.className = 'mk'; d.innerHTML = '<i></i><span></span>'; $('marks').appendChild(d); marks.push(d); }
let lastWarn = '';
function warn(t) { if (t !== lastWarn) { lastWarn = t; el.warn.textContent = t; el.warn.style.display = t ? 'block' : 'none'; if (t) sfx.warn(); } }
function popup(text, cls) {
  const d = document.createElement('div'); d.className = 'pop ' + (cls || ''); d.textContent = text; $('popups').appendChild(d);
  while ($('popups').children.length > 4) $('popups').firstChild.remove();
  setTimeout(() => d.remove(), 1400);
}
const _v = new THREE.Vector3();
function toScreen(pos) { _v.copy(pos).project(camera); return { x: (_v.x + 1) / 2 * VW, y: (1 - _v.y) / 2 * VH, behind: _v.z > 1, nx: _v.x, ny: _v.y }; }
function setMark(i, cls, x, y, label) {
  const m = marks[i]; if (m._c !== cls) { m.className = 'mk ' + cls; m._c = cls; }
  m.style.display = 'block'; m.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
  const s = m.lastChild; if (s._t !== label) { s.textContent = label; s._t = label; }
}
function edgeArrow(i, pos, cls) {
  const s = toScreen(pos); let x = s.nx, y = s.ny; if (s.behind) { x = -x; y = -y; }
  if (!s.behind && Math.abs(x) < 0.92 && Math.abs(y) < 0.9) return false;
  const k = Math.max(Math.abs(x), Math.abs(y)) || 1; x = clamp(x / k * 0.92, -0.92, 0.92); y = clamp(y / k * 0.86, -0.86, 0.86);
  setMark(i, 'arr' + (cls ? ' ' + cls : ''), (x + 1) / 2 * VW, (1 - y) / 2 * VH, ''); return true;
}
const km = (m) => (m / 1000).toFixed(m < 10000 ? 1 : 0) + ' км';
let wpnT = 0, dlzCache = null;
let hudSlowT = 0;
function updateHud(dt) {
  // медленная часть HUD (тексты, полосы, индикаторы РЛС и СПО) — 15 раз в секунду: меньше работы для страницы
  hudSlowT -= dt;
  const slow = hudSlowT <= 0;
  if (slow) { hudSlowT = 1 / 15; updateHudSlow(); }
  hudFast(dt, slow);
}
function updateHudSlow() {
  el.fuel.style.width = clamp(player.fuel / player.fuelMax * 100, 0, 100) + '%';
  el.fuel.style.background = player.fuel < 35 ? '#f87171' : '#4ade80';
  el.fuelTxt.textContent = Math.ceil(player.fuel) + ' с';
  el.hull.style.width = player.hull + '%';
  el.heat.style.width = player.heat + '%'; el.heat.style.background = player.overheated ? '#ef4444' : '#fbbf24';
  el.kills.textContent = G.kills; el.score.textContent = G.score;
  const next = schedule.slice(schedIdx).find((e) => e.type !== 'tanker');
  if (MODE.training) el.combo.textContent = `ОБУЧЕНИЕ · разобрано ракет: ${TR.done}`;
  else el.combo.textContent = next ? `следующая группа через ${Math.max(0, Math.ceil(next.t - G.runTime))} с` : enemies.some((e) => !e.dead) ? '' : 'все группы отбиты';
  const mach = player.speed / (340 - player.pos.y * 0.004);
  el.spd.textContent = `${Math.round(player.speed * 3.6)} М${mach.toFixed(2)}${player.ab ? ' Ф' : ''}`;
  el.alt.textContent = `${Math.round(player.pos.y)} · ${player.n.toFixed(1)}g`;
  el.hdg.textContent = 'КУРС ' + String(Math.round(((-player.yaw / D2R) % 360 + 360) % 360)).padStart(3, '0') + '°';
  const left = Math.max(0, H_CAP - G.runTime); el.clock.textContent = MODE.training ? 'ОБУЧЕНИЕ' : `${MODE.name.toUpperCase()} · ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
  el.spdBox.classList.toggle('sup', !!player.sup);
  drawRadar(); drawRwr();
}
function hudFast(dt, slow) {
  // визир и упреждение пушки
  fwdOf(player, TMP3);
  const bs = toScreen(TMP.copy(player.pos).addScaledVector(TMP3, 800));
  el.cross.style.left = bs.x + 'px'; el.cross.style.top = bs.y + 'px';
  if (gunTarget && !gunTarget.dead) {
    const d = gunTarget.pos.distanceTo(player.pos);
    const s = toScreen(TMP.copy(gunTarget.pos).addScaledVector(gunTarget.vel, d / 1100));
    el.pipper.style.display = s.behind ? 'none' : 'block'; el.pipper.style.left = s.x + 'px'; el.pipper.style.top = s.y + 'px';
  } else el.pipper.style.display = 'none';
  // ИК-ГСН
  const M_ = selType && MISSILES[selType];
  if (M_ && M_.kind === 'ir') {
    el.seeker.style.display = 'block';
    const s = seeker.target && !seeker.target.dead ? toScreen(seeker.target.pos) : bs;
    el.seeker.style.left = s.x + 'px'; el.seeker.style.top = s.y + 'px'; el.seeker.classList.toggle('lk', seeker.locked);
  } else el.seeker.style.display = 'none';
  if (growlGain && !muted) {
    const on = M_ && M_.kind === 'ir' && G.state === 'play';
    growlGain.gain.value = on ? (seeker.locked ? 0.035 : seeker.target ? 0.02 : 0.01) * (0.6 + 0.4 * Math.sin(radar.t * (seeker.locked ? 40 : 18))) : 0;
    growlOsc.frequency.value = seeker.locked ? 1150 : seeker.target ? 700 : 380;
  }
  // метки
  let n = 0; el.lockInfo.style.display = 'none'; dlzCache = null;
  for (const [e, c] of radar.contacts) {
    if (n >= marks.length - 8) break;
    if (e.dead || c.jam) continue;
    const s = toScreen(e.pos), d = e.pos.distanceTo(player.pos);
    if (e === radar.lock) {
      if (s.behind) { if (edgeArrow(n, e.pos)) n++; continue; }
      setMark(n++, 'l', s.x, s.y, km(d));
      const vc = Math.round(closingOf(e, player.pos) * 3.6 + player.speed * 3.6 * Math.cos(angleBetween(TMP3, TMP.copy(e.pos).sub(player.pos))));
      let info = `${e.S.name} · Vсбл ${vc} км/ч`;
      if (M_) {
        dlzCache = dlz(M_, player.pos.y, player.speed, closingOf(e, player.pos));
        const st = d < M_.rmin ? ['БЛИЗКО', '#fca5a5'] : d < dlzCache.rne ? ['НЕИЗБЕЖНАЯ ЗОНА', '#4ade80'] : d < dlzCache.rmax ? ['ПУСК РАЗРЕШЁН', '#86efac'] : ['ДАЛЕКО', '#fde68a'];
        info += `<br><span style="color:${st[1]}">${M_.short}: ${st[0]} (макс ${km(dlzCache.rmax)})</span>`;
      }
      el.lockInfo.innerHTML = info; el.lockInfo.style.display = 'block'; el.lockInfo.style.top = (s.y + 22) + 'px';
      if (s.x + 24 + el.lockInfo.offsetWidth > VW - 4) { el.lockInfo.style.left = 'auto'; el.lockInfo.style.right = Math.max(4, VW - s.x + 24) + 'px'; el.lockInfo.style.textAlign = 'right'; }
      else { el.lockInfo.style.right = 'auto'; el.lockInfo.style.left = Math.max(4, s.x + 24) + 'px'; el.lockInfo.style.textAlign = 'left'; }
    } else if (!s.behind) setMark(n++, 'c', s.x, s.y, km(d));
  }
  for (const e of enemies) { // визуальный контакт вблизи (без радара)
    if (n >= marks.length - 6 || e.dead || radar.contacts.has(e)) continue;
    const d = e.pos.distanceTo(player.pos); if (d > 5000) continue;
    const s = toScreen(e.pos);
    if (!s.behind && Math.abs(s.nx) < 1 && Math.abs(s.ny) < 1) setMark(n++, 'v', s.x, s.y, km(d)); else if (d < 3000 && edgeArrow(n, e.pos)) n++;
  }
  for (const w of rwr.inc) {
    if (n >= marks.length - 3) break;
    const s = toScreen(w.m.pos), lbl = `${km(w.d)} · ${w.m.closing !== undefined && w.m.closing < 15 ? 'отстаёт' : '+' + Math.round(w.m.closing || 0) + ' м/с'}`;
    if (!s.behind && Math.abs(s.nx) < 1 && Math.abs(s.ny) < 1) setMark(n++, 'm', s.x, s.y, lbl); else if (edgeArrow(n, w.m.pos)) n++;
  }
  for (const t of tankers) {
    if (t.done || n >= marks.length) continue;
    const s = toScreen(t.drogue), d = t.drogue.distanceTo(player.pos);
    if (!s.behind && Math.abs(s.nx) < 1 && Math.abs(s.ny) < 1) setMark(n++, 't', s.x, s.y, 'ЗАПРАВЩИК ' + (d < 1000 ? Math.round(d) + ' м' : km(d))); else if (edgeArrow(n, t.drogue, 't')) n++;
  }
  for (; n < marks.length; n++) if (marks[n].style.display !== 'none') marks[n].style.display = 'none';
  // анимация захвата: рамка «схлопывается» на цель
  const la = $('lockAnim');
  if (G.lockAnimT > 0 && radar.lock && !radar.lock.dead) {
    G.lockAnimT -= dt; const s2 = toScreen(radar.lock.pos), k = Math.max(0, G.lockAnimT / 0.35);
    la.style.display = s2.behind ? 'none' : 'block'; la.style.opacity = (1 - k * 0.3).toFixed(2);
    la.style.transform = `translate(${s2.x.toFixed(0)}px,${s2.y.toFixed(0)}px) scale(${(1 + k * 2.4).toFixed(2)}) rotate(${(k * 45).toFixed(0)}deg)`;
  } else if (la.style.display !== 'none') la.style.display = 'none';
  // виртуальный курсор (мышь захвачена в режиме погружения)
  const vc = $('vcur');
  if (document.pointerLockElement === canvas) { vc.style.display = 'block'; vc.style.transform = `translate(${((vcur.x + 1) / 2 * VW).toFixed(0)}px,${((vcur.y + 1) / 2 * VH).toFixed(0)}px)`; }
  else if (vc.style.display !== 'none') vc.style.display = 'none';
  // маркеры попаданий
  for (let i = 0; i < hitEls.length; i++) {
    const h = hitMarks[i], d = hitEls[i];
    if (!h) { if (d.style.display !== 'none') d.style.display = 'none'; continue; }
    h.t -= dt; const s3 = toScreen(h.pos);
    if (h.t <= 0 || s3.behind) { d.style.display = 'none'; continue; }
    d.style.display = 'block'; d.className = 'hitmk' + (h.big ? ' big' : ''); d.style.opacity = (h.t / 0.35).toFixed(2);
    d.style.transform = `translate(${s3.x.toFixed(0)}px,${s3.y.toFixed(0)}px) scale(${(1.4 - h.t).toFixed(2)})`;
  }
  while (hitMarks.length && hitMarks[0].t <= 0) hitMarks.shift();
  while (hitMarks.length > hitEls.length) hitMarks.shift();
  // панель вооружения
  wpnT -= dt;
  if (wpnT <= 0) {
    wpnT = 0.12;
    const types = typesLoaded();
    let h = types.map((k) => `<div class="row ${k === selType ? 'sel' : ''}"><span>${MISSILES[k].short}</span><span>×${countOf(k)} ${KIND_TAG[MISSILES[k].kind]}</span></div>`).join('');
    if (!types.length) h = '<div class="row">ракеты израсходованы</div>';
    let st = '';
    if (M_) {
      if (M_.kind === 'ir') st = seeker.locked ? 'ГСН: ЗАХВАТ — ПУСК!' : seeker.target ? 'ГСН: СОПРОВОЖДЕНИЕ…' : (M_.ir.loal ? 'ГСН: ПОИСК · можно пуск без захвата' : 'ГСН: ПОИСК');
      else if (radar.lock) st = 'РЛС: СОПРОВОЖДЕНИЕ';
      else st = M_.kind === 'arh' && radar.contacts.size ? 'РЛС: ОБЗОР · пуск по отметке' : (M_.kind === 'sarh' ? 'РЛС: нужен захват (R)' : 'РЛС: ОБЗОР');
    }
    const fly = missiles.filter((m) => !m.dead && m.owner === player);
    const fs = fly.length ? `<div class="fly">в полёте: ${fly.map((m) => m.M.short + (m.lost || m.decoy ? '·ПОТЕРЯ' : m.M.kind === 'arh' ? (m.active ? '·ГСН' : '·КОРР') : m.M.kind === 'sarh' ? (radar.lock === m.target ? '·ПОДСВ' : '·НЕТ ПОДСВ') : '')).join(', ')}</div>` : '';
    el.wpn.innerHTML = h + `<div class="st">${st}</div>` + fs + `<div class="cm">ЛТЦ ${player.flares} · ДО ${player.chaff}</div>`;
  }
}
// Индикатор РЛС: B-развёртка + шкала зоны пуска
const rc = $('radar'), rctx = rc.getContext('2d');
function drawRadar() {
  const W = rc.width, H = rc.height, c = rctx, RW = W - 50, range = RSCALES[radar.scale];
  c.clearRect(0, 0, W, H);
  c.fillStyle = 'rgba(2,22,12,.62)'; c.fillRect(0, 0, W, H);
  c.strokeStyle = 'rgba(120,255,160,.22)'; c.lineWidth = 2;
  for (let k = 1; k < 4; k++) { c.beginPath(); c.moveTo(16, H - 20 - (H - 44) * k / 4); c.lineTo(RW, H - 20 - (H - 44) * k / 4); c.stroke(); }
  for (const a of [-30, 0, 30]) { const x = 16 + (a / 60 + 1) / 2 * (RW - 16); c.beginPath(); c.moveTo(x, 24); c.lineTo(x, H - 20); c.stroke(); }
  c.strokeStyle = 'rgba(120,255,160,.55)'; c.strokeRect(16, 24, RW - 16, H - 44);
  const toX = (az) => 16 + (clamp(az / RADAR.az, -1, 1) + 1) / 2 * (RW - 16);
  const toY = (r) => H - 20 - clamp(r / range, 0, 1) * (H - 44);
  if (!radar.lock) { const sx = toX(Math.sin(radar.t * 2.2) * RADAR.az); c.fillStyle = 'rgba(120,255,160,.12)'; c.fillRect(sx - 6, 24, 12, H - 44); }
  c.fillStyle = '#93c5fd';
  for (const m of missiles) { if (m.dead || m.owner !== player) continue; const rel = TMP.copy(m.pos).sub(player.pos); const [az] = localAngles(player, rel); c.fillRect(toX(az) - 3, toY(rel.length()) - 3, 6, 6); }
  for (const [e, ct] of radar.contacts) {
    if (e.dead) continue;
    const a = clamp(1 - (radar.t - ct.t) / 2, 0.2, 1);
    if (ct.jam) { c.strokeStyle = `rgba(255,120,120,${a})`; c.lineWidth = 3; c.setLineDash([6, 6]); c.beginPath(); c.moveTo(toX(ct.az), 26); c.lineTo(toX(ct.az), H - 22); c.stroke(); c.setLineDash([]); continue; }
    const x = toX(ct.az), y = toY(ct.r);
    if (e === radar.lock) { c.fillStyle = '#ff6b6b'; c.fillRect(x - 8, y - 8, 16, 16); c.strokeStyle = '#ff6b6b'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 15, 0, 7); c.stroke(); }
    else { c.fillStyle = `rgba(160,255,190,${a})`; c.fillRect(x - 7, y - 7, 14, 14); }
    c.fillStyle = `rgba(184,255,200,${a})`; c.font = '16px ui-monospace, Menlo, monospace'; c.fillText(String(Math.round(ct.alt / 1000)), x + 10, y + 5);
  }
  // шкала зоны пуска справа
  const M_ = selType && MISSILES[selType];
  const bx = RW + 16;
  c.strokeStyle = 'rgba(120,255,160,.4)'; c.beginPath(); c.moveTo(bx + 6, 24); c.lineTo(bx + 6, H - 20); c.stroke();
  if (M_ && dlzCache) {
    c.fillStyle = 'rgba(253,230,138,.9)';
    const yMax = toY(dlzCache.rmax), yNe = toY(dlzCache.rne), yMin = toY(M_.rmin);
    c.fillRect(bx, yMax - 2, 14, 4); c.fillRect(bx, yMin - 2, 14, 4);
    c.fillStyle = 'rgba(74,222,128,.8)'; c.fillRect(bx + 3, yNe, 7, yMin - yNe);
    if (radar.lock) { const y = toY(radar.lock.pos.distanceTo(player.pos)); c.fillStyle = '#ff6b6b'; c.beginPath(); c.moveTo(bx - 2, y); c.lineTo(bx - 12, y - 7); c.lineTo(bx - 12, y + 7); c.fill(); }
  }
  c.fillStyle = 'rgba(184,255,200,.9)'; c.font = 'bold 18px ui-monospace, Menlo, monospace'; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  c.fillText(radar.lock ? 'СОПР' : 'ОБЗОР', 18, 18); c.textAlign = 'right'; c.fillText(range / 1000 + ' км', RW, 18); c.textAlign = 'left';
}

// ═════════════ Меню: подвеска, справка, радар, графика, управление ═════════════
let selSt = 1, symmetric = true;
function saveLoadout() { store.set('fortuna_drone_loadout2', JSON.stringify(loadout)); }
function applyLoadout() { for (let i = 0; i < 8; i++) loaded[i] = loadout[i]; rebuildPylonMeshes(); ensureSel(); saveLoadout(); }
function gameText(M_) {
  const z = dlz(M_, 5000, 250, 250);
  let t = `Дальность пуска на 5 км высоты: до ≈ ${km(z.rmax)} в лоб, неизбежная зона ≈ ${km(z.rne)}. Перегрузка до ${M_.g} g. `;
  if (M_.kind === 'ir') t += `ГСН берёт горячую цель сзади с ${km(M_.ir.range)}, поле захвата ${M_.ir.fov}°${M_.ir.slaved > M_.ir.fov ? ` (с РЛС — ${M_.ir.slaved}°)` : ''}${M_.ir.aspect < 180 ? ', только задняя полусфера' : ''}${M_.ir.loal ? ', захват после пуска' : ''}${M_.ir.sun ? ', может увестись на солнце' : ''}. Устойчивость к ЛТЦ ${Math.round(M_.ir.irccm * 100)}%.`;
  else if (M_.kind === 'sarh') t += `Нужен захват РЛС до попадания. Устойчивость к помехам ${Math.round(M_.eccm * 100)}%.`;
  else t += `Коррекция от РЛС, активная ГСН с ${km(M_.pitbull)}. Устойчивость к помехам ${Math.round(M_.eccm * 100)}%.`;
  return t + ` Урон ${M_.dmg}, радиус ${M_.blast} м.`;
}
function renderLoadTab() {
  const mass = loadMass(loadout), sk = STATIONS[selSt].kind;
  const pyl = STATIONS.map((st, i) => {
    const key = loadout[i];
    return `<button class="pyl ${i === selSt ? 'sel' : ''} ${key ? '' : 'empty'}" data-p="${i}"><small>${st.id}</small><b>${key ? MISSILES[key].short : 'пусто'}</b></button>`;
  }).join('');
  let opts = `<button class="opt ${!loadout[selSt] ? 'on' : ''}" data-k=""><span class="nm"><b>Пусто</b><span>снять ракету с пилона</span></span></button>`;
  for (const cat of CATS) {
    opts += `<div class="cat-h">${cat.name}</div>`;
    for (const [key, M_] of Object.entries(MISSILES)) {
      if (M_.cat !== cat.id) continue;
      let why = '';
      if (!M_.mounts.includes(sk) || M_.mass > STATION_KIND[sk].lim) why = 'не для этого пилона';
      else if (!canMount(selSt, key, loadout)) why = 'перегруз';
      opts += `<button class="opt ${loadout[selSt] === key ? 'on' : ''} ${why ? 'dis' : ''}" data-k="${key}">
        <span class="tag ${M_.kind}">${KIND_TAG[M_.kind]}</span>
        <span class="nm"><b>${M_.name}</b><span>${M_.mass} кг · ${KIND_FULL[M_.kind]}${why ? ' · ' + why : ''}</span></span>
        <span class="inf" data-info="${key}">справка</span></button>`;
    }
  }
  $('tab-load').innerHTML = `
    <div class="pyl-row">${pyl}</div>
    <div class="loadbar"><i style="width:${Math.min(100, mass / MAX_LOAD * 100)}%"></i></div>
    <div class="loadtxt"><span>Нагрузка ${mass} / ${MAX_LOAD} кг</span><span>ЭПР ${(1 + 0.15 * loadout.filter(Boolean).length).toFixed(2)} м²</span></div>
    <div class="pick-t"><span>Пилон ${STATIONS[selSt].id} · ${STATION_KIND[sk].name}, до ${STATION_KIND[sk].lim} кг</span>
      <label><input type="checkbox" id="symChk" ${symmetric ? 'checked' : ''}> симметрично</label></div>
    ${opts}
    <div class="help" style="margin-top:8px"><p>8 точек подвески: <b>законцовки</b> — до 110 кг, <b>средние</b> — до 200 кг, <b>корневые</b> — до 360 кг, <b>подфюзеляжные</b> — до 500 кг (только они держат Р-33 и AIM-54). Общий лимит — ${MAX_LOAD} кг.</p>
    <p>Масса замедляет разгон, каждая ракета снаружи добавляет сопротивление и <b>заметность для радаров</b> противника. После пусков дрон становится легче и «тише». Всегда есть пушка, ЛТЦ и диполи (32 или 48 — зависит от режима).</p></div>`;
}
function renderRefTab() {
  let h = '';
  for (const cat of CATS) {
    h += `<div class="cat-h">${cat.name}</div>`;
    for (const [key, M_] of Object.entries(MISSILES)) {
      if (M_.cat !== cat.id) continue;
      h += `<details class="ref" id="ref-${key}"><summary><span class="tag ${M_.kind}">${KIND_TAG[M_.kind]}</span>${M_.name}</summary><div class="body">
        <h4>История</h4>${M_.hist.map((p) => `<p>${p}</p>`).join('')}
        <h4>Как наводится</h4><p>${M_.guide}</p>
        <h4>Характеристики (открытые данные, округлённо)</h4><table class="tt">${M_.specs.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</table>
        <h4>В игре</h4><p>${gameText(M_)}</p>
        <p style="opacity:.65">Игровой мир сжат примерно в 3–5 раз по дальностям: цифры «в игре» не равны реальным.</p>
      </div></details>`;
    }
  }
  h += `<div class="cat-h">Противник</div>` + Object.values(AC).map((a) => `<details class="ref"><summary>${a.name}</summary><div class="body"><p>${{
    '«Слизень»': 'Лёгкий беспилотный истребитель «Подстилки улитки». Средняя подготовка ИИ, 2 ракеты средней дальности и 2 ближнего боя, ЭПР около 3 м².',
    '«Раковина»': 'Тяжёлый перехватчик: мощный радар, дальние Р-27ЭР или Sparrow, быстрый на прямой, но неповоротливый. ЭПР около 6 м².',
    '«Улитка-ас»': 'Малозаметная машина с лучшим ИИ: грамотно выходит на траверз, ставит помехи, стреляет с неизбежной дистанции. ЭПР около 1,2 м². Засчитывается как 2 сбитых.',
    '«Подстилка улитки»': 'Флагман-носитель: огромная раковина, 4 двигателя, дальние Р-33 или Phoenix, мощная РЭБ (радар берёт её только ближе 16 км) и много ловушек. Держится на дистанции под прикрытием эскорта. Засчитывается как 5 сбитых.',
  }[a.name]}</p></div></details>`).join('');
  h += `<div class="help"><p><b>ИК</b> — тепловая ГСН: «выстрелил и забыл», но ловушки и ракурс. <b>ПАРЛ</b> — полуактивная: держи захват до попадания. <b>АРЛ</b> — активная: коррекция от радара, потом ракета сама.</p></div>`;
  $('tab-ref').innerHTML = h;
}
// ── Руководство ──
function guideSection(title, body, open) { return `<details class="ref"${open ? ' open' : ''}><summary>${title}</summary><div class="body">${body}</div></details>`; }
function renderGuideTab() {
  const rcsRows = Object.values(AC).map((a) => `<tr><td>${a.name}</td><td>${a.rcs} м² → видно с ≈ ${km(RADAR.range * Math.min(1.4, Math.pow(a.rcs / RADAR.refRcs, 0.25)))}</td></tr>`).join('');
  const modeRows = [['Ракеты противника на экране', 'все, с дистанцией и сближением', 'только с работающим двигателем (датчик пуска) и активной ГСН'],
    ['Перегрузка «Изделия»', MODES.arcade.gmax + ' g', MODES.real.gmax + ' g'], ['Потеря скорости в вираже', 'вдвое меньше', 'полная'],
    ['Сваливание', 'почти нет', 'ниже ≈ 270 км/ч'], ['Урон от ракет', '×0,5', '×0,9'], ['Противник', 'медленнее реагирует, пускает издалека', 'опытный'],
    ['ЛТЦ / диполи', MODES.arcade.cm + ' / ' + MODES.arcade.cm, MODES.real.cm + ' / ' + MODES.real.cm], ['Помощь в прицеливании пушкой', 'сильная', 'почти нет'],
    ['Захват ИК-ГСН', MODES.arcade.lockT + ' с', MODES.real.lockT + ' с'], ['Топливо', '×1,4', '×1'], ['Корзина заправщика', MODES.arcade.drogueR + ' м', MODES.real.drogueR + ' м'], ['Очки', '×1', '×1,5']]
    .map(([a, b, c]) => `<tr><td>${a}</td><td>${b}</td><td>${c}</td></tr>`).join('');
  $('tab-guide').innerHTML = [
    guideSection('1. Быстрый старт — первая минута', `
      <p><b>0.</b> Совсем впервые? Выбери режим <b>Обучение</b> (над вкладками): по тебе будут пускать все типы ракет по очереди, на экране — подсказки, что нажимать, а окошко «?» ставит игру на паузу и объясняет каждую ракету.</p>
      <p><b>1.</b> Для боя выбери режим <b>Аркада</b> и оставь подвеску по умолчанию: 2 × AIM-9L (ближний бой) и 2 × AIM-120C (средняя дальность).</p>
      <p><b>2.</b> После старта вверху появится сообщение о группе противника и её пеленге, а под счётчиком — время до следующей группы. Разверни нос в сторону пеленга.</p>
      <p><b>3.</b> Когда на индикаторе радара (${POS.radar}) появится зелёный квадрат, нажми <b>захват</b> (${ctl('lock')}). Цель обведётся красной рамкой, рядом — дальность и строка «ПУСК РАЗРЕШЁН / ДАЛЕКО / НЕИЗБЕЖНАЯ ЗОНА».</p>
      <p><b>4.</b> В зелёной «неизбежной зоне» жми <b>пуск</b> (${ctl('missile')}). AIM-120 после пуска можно не держать — когда в панели оружия появится «·ГСН», ракета ведёт себя сама.</p>
      <p><b>5.</b> Если по центру загорелось красное <b>«ПУСК!»</b> или <b>«РАКЕТА!»</b> — сейчас важнее уклониться, чем атаковать (глава 9).</p>
      <p><b>6.</b> Следи за топливом: жёлтая метка <b>«ЗАПРАВЩИК»</b> — пролети через корзину шланга (глава 11).</p>`, true),
    guideSection('2. Как проходит вылет и как считаются очки', `
      <p>Вылет длится до <b>5 минут</b>. «Подстилка улитки» присылает 4 группы с разных сторон: пару «Слизней», затем 2–3 «Слизня» или «Раковины», затем «Улитку-аса» с ведомыми и в конце флагман с эскортом. Время до следующей группы — под счётчиком сбитых.</p>
      <p><b>Конец вылета:</b> победа, если все группы, включая флагман, уничтожены; поражение — корпус 0 или кончилось топливо; иначе — по времени.</p>
      <p><b>Сбитые:</b> «Слизень» и «Раковина» — 1, «Ас» — 2, флагман — 5 (максимум в вылете показан на экране итогов). <b>Очки:</b> 1000–6000 за самолёт; сбитие пушкой ×1,5; ракетой, пролетевшей больше 20 км, ×1,3; в «Реализме» всё ×1,5. Загнанный в землю противник засчитывается тебе.</p>`),
    guideSection('3. Полёт и энергия', `
      <p><b>Управление:</b> ${steerHint()}. Чем сильнее отклонение, тем быстрее поворот.</p>
      <p><b>Перегрузка (g)</b> ограничивает разворот: максимальная угловая скорость = g × 9,81 / скорость. На 900 км/ч при 12 g это ≈ 27°/с, на 500 км/ч — почти вдвое быстрее. «Изделие Фортуна-1» — беспилотник, лётчика нет, поэтому оно выдерживает 12–15 g против 6–9 g у противника.</p>
      <p><b>Энергия.</b> Каждый резкий вираж съедает скорость, набор высоты — тоже; пикирование разгоняет. Два-три крутых разворота подряд — и ты медленный и уязвимый. Если скорость падает ниже ~400 км/ч, выровняйся, опусти нос или включи форсаж.</p>
      <p><b>Газ:</b> ${IS_TOUCH ? '«ГАЗ−» — малый (экономит топливо и помогает при заправке), без неё — крейсерский' : ctl('thrUp') + ' — полный, ' + ctl('thrDown') + ' — малый (экономит топливо), по умолчанию — крейсерский'}. <b>Форсаж</b> (${ctl('ab')}) — резкий разгон, но топливо уходит втрое быстрее, а ты становишься в 2,2 раза «горячее» для тепловых ракет.</p>
      <p><b>Высота.</b> Наверху воздух реже: быстрее летишь, ракеты (и твои, и чужие) летят дальше, но противник видит тебя на фоне неба. Внизу ракеты быстро теряют скорость, а на фоне земли легче «спрятаться» в доплеровском провале (глава 5). Ниже 300 м при снижении загорится «ВЫСОТА! ВВЕРХ».</p>
      <p><b>Граница зоны</b> — 12 км от центра карты: за ней автопилот разворачивает к центру.</p>`),
    guideSection('4. Экран (HUD)', `
      <p><b>Слева вверху:</b> топливо (в секундах), корпус, панель оружия (выбранная ракета, остаток, статус ГСН/РЛС, ракеты в полёте, ЛТЦ и диполи). Нажатие по панели — смена ракеты.</p>
      <p><b>Центр:</b> кольцо визира — куда смотрит нос; жёлтый кружок — <b>упреждение пушки</b> (наведи визир на него); жёлтый круг побольше — <b>ИК-ГСН</b> (мигает красным при захвате).</p>
      <p><b>Метки:</b> зелёный ромб — цель на радаре (с дальностью); красная рамка — захваченная цель; белый кружок — самолёт, видимый глазом ближе 5 км; <b>красный кружок</b> — ракета, летящая в тебя, с дальностью и «+N м/с» (догоняет) или «отстаёт»; жёлтый круг — корзина заправщика; стрелки по краям — цели и угрозы за кадром.</p>
      <p><b>По бокам:</b> скорость (км/ч, число Маха, «Ф» — форсаж) и высота с перегрузкой. <b>Справа вверху:</b> очки, курс и оставшееся время.</p>
      <p><b>СПО</b> (глава 8) — ${POS.rwr}, <b>индикатор РЛС</b> (глава 5) — ${POS.radar}${IS_TOUCH ? '' : ', по центру внизу —'} перегрев пушки.</p>`),
    guideSection('5. Радар: обзор, захват и масштаб', `
      <p><b>Индикатор РЛС</b> — прямоугольник ${POS.radar}: по горизонтали — угол от носа (±60°), по вертикали — дальность, цифра у отметки — высота цели в км. Голубые точки — твои ракеты.</p>
      <p><b>Масштаб 10 / 20 / 40 км</b> (${ctl('radarScale')}) — это <b>только увеличение картинки</b>: на дальность обнаружения и захвата он не влияет. Цели дальше масштаба прижимаются к верхнему краю.</p>
      <p><b>Дальность обнаружения</b> зависит от заметности (ЭПР) цели: растёт как корень четвёртой степени — в 16 раз «ярче» лишь вдвое дальше.</p>
      <table class="tt">${rcsRows}</table>
      <p><b>Обзор и захват.</b> В обзоре противник не знает, что ты его видишь. <b>Захват</b> даёт точную дальность и скорость сближения, нужен для полуактивных ракет и «привязывает» ИК-ГСН к цели, но СПО противника сразу сообщает ему о захвате. Повторное нажатие — следующая цель, если целей нет — сброс.</p>
      <p><b>Захват теряется</b>, если цель ушла за ±60° от носа, дальше дальности обнаружения, ушла в <b>доплеровский провал</b> или удачно сбросила диполи.</p>
      <p><b>Доплеровский провал.</b> Чтобы не видеть землю, радар отбрасывает всё, что не движется относительно неё. Цель ниже тебя, летящая поперёк луча (на траверзе), пропадает. Это работает в обе стороны: так же ты прячешься от радаров противника.</p>
      <p><b>Помехи.</b> Флагман ставит РЭБ: дальше 16 км вместо отметки — пунктирный пеленг, захватить нельзя. Ближе («прожиг») — обычная цель. Активные ракеты умеют наводиться на источник помех.</p>`),
    guideSection('6. Ракеты и зона пуска', `
      <p><b>Три типа наведения:</b></p>
      <p>• <b>ИК (тепловая ГСН)</b> — захватывает цель сама, до пуска (звук растёт, круг мигает). После пуска — «выстрелил и забыл». СПО противника её не видит. Боится ЛТЦ, форсаж цели делает её лучше. Ранние (AIM-9B, Р-3С, Firestreak) берут цель только сзади и могут «увестись» на солнце; новые (AIM-9X, IRIS-T, Python-5, MICA IR) можно пускать и без захвата — ГСН найдёт цель после пуска.</p>
      <p>• <b>ПАРЛ (полуактивная)</b> — AIM-7, Р-27Р/ЭР, Р-33: летит на отражённый сигнал твоего радара. <b>Держи захват до попадания</b> — сорвался захват, и ракета ослепла.</p>
      <p>• <b>АРЛ (активная)</b> — AIM-120, Р-77, MICA EM, Derby, AIM-54, Meteor: сначала летит по данным твоего радара (в панели «·КОРР»), в нескольких км от цели включает свою ГСН («·ГСН») и дальше справляется сама. Можно пускать и без захвата — по отметке обзора в пределах 30° от носа.</p>
      <p><b>Зона пуска</b> (строка у захваченной цели и шкала справа от индикатора РЛС) считается по той же физике, что и полёт ракеты: <b>максимальная дальность</b> (жёлтая риска) — если цель летит на тебя и не манёврирует; <b>неизбежная зона</b> (зелёная полоса) — ракета догонит, даже если цель развернётся и убежит; <b>минимальная</b> — ближе взрыватель не успеет взвестись.</p>
      <p><b>Почему ракета «висит» на одной дистанции, а потом догоняет.</b> Двигатель работает всего 2–10 секунд, дальше ракета летит по инерции и тормозится воздухом. Если цель уходит от неё почти с той же скоростью, дистанция почти не меняется — так было в твоём случае с «3,7 км». Как только цель поворачивает, тормозит в вираже или набирает высоту, ракета догоняет. Поэтому у каждой летящей в тебя ракеты теперь пишется <b>«догоняет N м/с · T с»</b> или <b>«НЕ ДОГОНЯЕТ»</b>, а ракета, которая не может догнать дольше 2,5 с, самоликвидируется.</p>
      <p><b>Советы:</b> стреляй с высоты и на скорости — ракета получит больше энергии; по манёвренной цели — ближе к неизбежной зоне; по уходящей цели дальность резко падает; пара ракет разных типов (например АРЛ + ИК) сложнее для уклонения.</p>`),
    guideSection('7. Как стрелять — по шагам', `
      <p><b>ИК-ракета:</b> выбери ракету (${ctl('weapon')}) → наведи нос на цель (или захвати радаром — ГСН «привяжется» к ней) → дождись мигающего красного круга и высокого тона → пуск. Лучше всего — сзади, по цели на форсаже, ближе 5–8 км.</p>
      <p><b>Полуактивная:</b> захват (${ctl('lock')}) → «ПУСК РАЗРЕШЁН» → пуск → <b>держи цель в пределах ±60° от носа</b> до попадания (можно отвернуть на 40–50°, чтобы медленнее сближаться, — «крэнк»).</p>
      <p><b>Активная:</b> захват или просто отметка впереди → пуск → держи цель на радаре, пока в панели «·КОРР»; после «·ГСН» можно разворачиваться и уходить или брать следующую цель.</p>
      <p><b>Пушка</b> (${ctl('fire')}): ближе 1,5 км, совмести визир с жёлтым кружком упреждения, стреляй очередями — перегрев выключит пушку на несколько секунд.</p>`),
    guideSection('8. СПО и датчик пуска ракет', `
      <p><b>СПО</b> (круг ${POS.rwr}) слышит чужие радары: буква — тип (СЛ — «Слизень», РК — «Раковина», АС — «Ас», ПУ — флагман), положение — пеленг (верх — нос), ближе к центру — ближе источник.</p>
      <p>• <b>Зелёная буква</b> — тебя ищут (обзор), короткий сигнал при появлении. • <b>Жёлтая в ромбе</b> — захват, прерывистый сигнал. • <b>Мигающая красная</b> — пуск полуактивной/активной ракеты, частый сигнал. • <b>«М»</b> — включилась активная ГСН ракеты: она уже рядом.</p>
      <p><b>Датчик пуска ракет</b> видит факел работающего двигателя любой ракеты ближе 9 км — красные точки на краю круга и надпись <b>«РАКЕТА! 4 ч · 3,1 км · догоняет 250 м/с · 12 с»</b> («4 ч» — направление по циферблату: 12 — нос, 6 — хвост). Тепловые ракеты СПО <b>не видит</b> — о них предупредит только этот датчик или дымный след. После выгорания двигателя в «Реализме» дальняя ракета летит «молча» — поэтому важно заметить пуск.</p>`),
    guideSection('9. Как уклоняться и противодействовать', `
      <p><b>Сначала пойми, что летит.</b> Был захват и «ПУСК!» от самолёта — радиолокационная ракета. «РАКЕТА!» без захвата — скорее всего тепловая. «М» на СПО — активная ГСН уже включилась.</p>
      <p><b>Против полуактивной (Sparrow, Р-27Р/ЭР, Р-33).</b> Ракета слепа без радара пустившего. Сорви его захват: развернись так, чтобы он был у тебя на 3 или 9 часов (траверз), и <b>снижайся ниже него</b> — ты окажешься в доплеровском провале; сбрасывай <b>диполи</b> (${ctl('chaff')}), когда ракета ближе 7 км. Или уйди за ±60° от его носа. Пропал жёлтый ромб на СПО — ракета ослепла.</p>
      <p><b>Против активной (AMRAAM, Р-77, MICA EM, Derby, Phoenix, Meteor).</b> Пока нет «М», она летит по данным самолёта: сорви его захват тем же траверзом со снижением и смени курс — ракета полетит в старую точку. После «М» — держи уже саму ракету на 3/9 часах, снижайся, сбрасывай диполи пачками. Если ракета далеко — разворачивайся от неё и уходи на форсаже со снижением: пока горит «НЕ ДОГОНЯЕТ», ты в безопасности. Meteor с прямоточным двигателем так не перегнать — только провал и диполи.</p>
      <p><b>Против тепловой (Sidewinder, Р-73, Р-60, Python-5, IRIS-T, Р-27Т, MICA IR).</b> <b>Выключи форсаж</b>, сбрасывай <b>ЛТЦ</b> (${ctl('flare')}) <b>пачками, когда ракета в 1–3 км</b> (раньше — впустую), и резко отворачивай поперёк её курса. Ранние (AIM-9B, Р-3С, Firestreak) видят только сопло: не подставляй хвост, а если она летит — разворот на солнце может увести её. Современные (AIM-9X, IRIS-T, Python-5) почти не замечают ловушек — тут спасают резкий отворот в последний момент, уход на дистанцию больше дальности их ГСН или уничтожение носителя раньше.</p>
      <p><b>Энергетическая оборона.</b> Если ракета пущена издалека, развернись от неё и разгоняйся со снижением — ракета после выгорания двигателя тормозит. Следи за строкой «догоняет … м/с»: растущее время до попадания и «НЕ ДОГОНЯЕТ» — ты выиграл.</p>
      <p><b>Против пушки.</b> Не лети по прямой ближе 1,5 км перед носом противника, меняй плоскость манёвра. Ремонта в вылете нет — береги корпус.</p>
      <p><b>Против флагмана.</b> Его РЭБ прячет его дальше 16 км. Его Р-33 или Phoenix тяжёлые и неповоротливые (18–20 g): резкий отворот за 2–3 км до попадания их срывает. Сначала выбей эскорт, потом заходи на флагман — у него 450 единиц прочности, нужно 3–5 ракет или долгая работа пушкой.</p>
      <p><b>Приоритеты:</b> в тебя летит ракета → уклонение важнее атаки; два противника на хвосте → уходи на энергии и разворачивай их по одному; кончается топливо → к заправщику.</p>`),
    guideSection('10. Противник', Object.values(AC).map((a) => `<p><b>${a.name}</b> — ${{
      '«Слизень»': 'лёгкий истребитель. Средний ИИ, радар ≈ 28 км, 2 ракеты средней дальности (часто полуактивные) и 2 ближнего боя. Слабость: после пуска держит подсвет — сорви его захват, и ракета ослепнет.',
      '«Раковина»': 'тяжёлый перехватчик: мощный радар (≈ 36 км), дальние Р-27ЭР или Sparrow, быстрый на прямой. Слабость: плохо крутится (6,5 g) — в ближнем бою лёгкая добыча.',
      '«Улитка-ас»': 'малозаметный (ЭПР ≈ 1,2 м² — радар видит его поздно), лучший ИИ: быстро реагирует, выходит на траверз, ставит помехи, пускает с неизбежной дистанции активные ракеты. Засчитывается как 2 сбитых. Слабость: ракет всего 4 — вымани пуски и контратакуй.',
      '«Подстилка улитки»': 'флагман с огромной раковиной и 4 двигателями: 450 прочности, дальние Р-33 или AIM-54, РЭБ, много ловушек, держит дистанцию под прикрытием эскорта. Засчитывается как 5 сбитых.',
    }[a.name]}</p>`).join('') + `<p>ИИ реагирует на твой захват радаром, на активную ГСН твоей ракеты и (с шансом) на дымный след. Пуск по отметке обзора активной ракетой он заметит только когда включится её ГСН — это главный способ застать врасплох.</p>`),
    guideSection('11. Дозаправка', `
      <p>Топлива хватает примерно на 3 минуты крейсерского полёта (форсаж ×3). В вылете 4 заправщика — они появляются впереди тебя, летят на ≈ 670 км/ч и держатся ~75 с.</p>
      <p><b>Как заправиться:</b> зайди заправщику в хвост, <b>сбрось газ</b> (${ctl('thrDown')}), чтобы скорость была близка к его скорости, и наведи визир на жёлтую метку корзины. Пролёт через корзину (ближе ${MODES.real.drogueR} м в «Реализме», ${MODES.arcade.drogueR} м в «Аркаде») даёт +${FUEL_PICKUP} с топлива.</p>`),
    guideSection('12. Режимы «Аркада» и «Реализм»', `<table class="tt"><tr><td></td><td><b>Аркада</b></td><td><b>Реализм</b></td></tr>${modeRows}</table>
      <p style="margin-top:6px">Физика ракет, радара и СПО одинаковая — различаются подсказки, прощение ошибок и опыт противника. Режим выбирается над вкладками меню.</p>
      <p><b>Обучение</b> — третий режим: вместо волн противника учебные носители по очереди пускают по тебе все 22 типа ракет (в случайном порядке) — каждый оттуда, откуда такую ракету пускают на самом деле. По ходу полёта ракеты внизу экрана — короткие подсказки, что делать и какую кнопку нажать; окошко «?» (${ctl('help')}) ставит игру на паузу и объясняет, как работает именно эта ракета. После каждого пуска — разбор (ушла на ловушку, потеряла в провале, не догнала…), затем носитель можно сбить. При смене своей ракеты — тоже «?» с инструкцией, как ей стрелять. Сбить тебя нельзя, топливо не тратится, ракеты перезаряжаются; очки и награды не начисляются.</p>`),
    guideSection('13. Подвеска — советы', `
      <p>Каждая ракета снаружи — масса (медленнее разгон), сопротивление и +0,15 м² заметности: полностью увешанное «Изделие» противник видит на треть дальше.</p>
      <p><b>Универсал:</b> законцовки — AIM-9X или Р-73, средние — AIM-120C или Р-77, корневые — пусто или Р-27ЭР. <b>Дальний бой:</b> 2 × Meteor на средних, 2 × AIM-54 под фюзеляжем, ИК на законцовках (тяжело — меньше манёвренности). <b>Ближний бой:</b> 4–6 ИК (Python-5, IRIS-T) — лёгкий и вёрткий, но придётся подбираться близко. <b>Историческая:</b> AIM-9B + AIM-7E — почувствуй, каково было во Вьетнаме.</p>`),
  ].join('');
}
// ── Настройки: графика и управление ──
function renderSettingsTab() {
  let bench = null; try { bench = JSON.parse(store.get('fortuna_drone_bench') || 'null'); } catch (_) { bench = null; }
  const cards = Object.entries(PRESETS).map(([k, p]) => `<div class="gfx ${k === gfxKey ? 'on' : ''} ${bench && bench.rec === k ? 'rec' : ''}" data-g="${k}"><b>${p.name}</b><span>${p.desc}</span></div>`).join('');
  let res = '';
  if (bench) {
    res = `<div id="benchRes"><table class="tt">${Object.keys(PRESETS).filter((k) => bench.results[k]).reverse().map((k) => `<tr><td>${PRESETS[k].name}</td><td>${Math.round(bench.results[k].fps)} кадр/с, худшие 5% — ${Math.round(bench.results[k].p95)} мс</td></tr>`).join('')}</table>
      <p style="margin:6px 0 0">Рекомендуем: <b style="color:#86efac">${PRESETS[bench.rec].name}</b>${bench.rec === gfxKey ? ' (уже выбран)' : ''}. Видеокарта: ${bench.gpu}.</p></div>`;
  }
  let ctrl;
  if (IS_TOUCH) {
    ctrl = `<div class="help"><p><b>Левый палец</b> — «ручка»: курс и тангаж. Справа: <b>ПУШКА</b> — стрельба (держать), <b>РАКЕТА</b> — пуск, <b>ЗАХВАТ</b> — захват радаром / следующая цель, <b>ФОРСАЖ</b> — ускорение (топливо ×3), <b>ЛТЦ ДО</b> — сброс ловушек и диполей.</p>
      <p>Слева внизу: <b>ГАЗ−</b> — малый газ (держать; нужен для заправки), <b>НАЗАД</b> — взгляд назад (держать).</p>
      <p>Нажатие по панели оружия — сменить ракету, по индикатору радара — масштаб, кнопка <b>II</b> — пауза. В обучении — кнопка <b>«?»</b> в окошке-подсказке.</p>
      <p>Назначение клавиш доступно на компьютере с клавиатурой.</p></div>`;
  } else {
    const rows = ACTIONS.map((a) => `<div class="kb-row"><span>${a.name}</span>${[0, 1].map((sl) => {
      const cap = capturing && capturing.id === a.id && capturing.slot === sl;
      return `<button class="kb-key ${cap ? 'cap' : ''}" data-kb="${a.id}" data-slot="${sl}">${cap ? 'нажмите…' : keyName(binds[a.id][sl])}</button>`;
    }).join('')}</div>`).join('');
    ctrl = `<div class="kb">${rows}</div>
      <p class="kb-hint">Нажмите на ячейку, затем клавишу — или кнопку мыши над таблицей. Backspace — очистить, Esc или клик мимо таблицы — отмена. Esc в игре всегда ставит паузу.</p>
      <button class="btn alt sm" id="kbReset">Сбросить клавиши по умолчанию</button>
      <div class="help" style="margin-top:8px">
        <label class="chk"><input type="checkbox" id="mSteer" ${mouseCfg.steer ? 'checked' : ''}> Управление мышью (смещение курсора от центра экрана)</label>
        <label class="chk"><input type="checkbox" id="mInv" ${mouseCfg.invert ? 'checked' : ''}> Инверсия мыши по тангажу</label>
        <label class="chk">Чувствительность мыши <input type="range" id="mSens" min="0.5" max="2" step="0.1" value="${mouseCfg.sens}"> <span id="mSensV">${mouseCfg.sens.toFixed(1)}</span></label>
      </div>`;
  }
  $('tab-set').innerHTML = `<div class="cat-h">Графика</div><div class="gfx-row">${cards}</div>
    <div class="help"><p>Во всех пресетах — физически корректный цвет (линейное освещение + тонмаппинг ACES), небо с дымкой и солнечным ореолом.</p>
    <p><b>Низкий</b> — сниженное разрешение, простые материалы, мало деревьев и облаков. <b>Средний</b> — металл с отражениями, окна в домах, детализированная земля, тени от облаков, FXAA и резкость CAS. <b>Высокий</b> — тени, объёмные облака, живая вода, смешанный лес, MSAA, лёгкое свечение.</p>
    <p><b>Ультра</b> — HDR-конвейер, свечение ярких мест, земля с физическим освещением и микрорельефом, тени 4K на 800 м, свет от форсажа и ракет, блики объектива, апскейлер FSR. <b>Кино</b> — всё из «Ультра» плюс лучи от солнца сквозь облака, кинематографическая цветокоррекция, виньетка, зерно, разрешение до 2,5×.</p>
    <p>Смена пресета перезагружает игру (подвеска и клавиши сохраняются).</p></div>
    <button class="btn alt sm" id="benchBtn">Тест графики (≈ 15 с)</button>
    ${res}
    ${bench && bench.rec !== gfxKey ? `<button class="btn sm" id="applyRec">Применить рекомендованный</button>` : ''}
    ${perfBlock()}
    <div class="cat-h">Управление</div>${ctrl}`;
}
// ── Производительность и качество: апскейлеры, сглаживание, частота кадров, экран ──
const seg = (id, val, opts) => `<div class="seg" data-seg="${id}">${opts.map(([v, t]) => `<button class="${String(val) === String(v) ? 'on' : ''}" data-v="${v}">${t}</button>`).join('')}</div>`;
function perfBlock() {
  const pct = (x) => Math.round(x * 100) + '%';
  const upHint = { off: 'Без апскейлера: кадр рисуется в выбранном масштабе и просто растягивается — при масштабе меньше 100% картинка «мылится».',
    cas: '<b>CAS</b> (AMD FidelityFX Contrast Adaptive Sharpening): растяжение + «умная» резкость, которая усиливает детали, не пересвечивая края. Почти бесплатно. Лучше всего при 77–100%.',
    fsr: '<b>FSR-стиль</b> (как AMD FSR 1): растяжение фильтром Ланцоша с защитой от ореолов + «робастная» резкость RCAS. Лучше держит края и мелкие детали при 59–77%, чуть дороже CAS. Реализация упрощённая, принцип тот же.' }[perf.up];
  const aaHint = { off: 'Без сглаживания: самый быстрый вариант, края «лесенкой».', fxaa: '<b>FXAA</b> — сглаживание по готовому кадру: почти бесплатно, слегка смягчает мелкие детали.',
    msaa: '<b>MSAA ×4</b> — честное сглаживание геометрии: чётче и качественнее FXAA, но дороже по видеопамяти и скорости.' + (renderer.capabilities.isWebGL2 ? '' : ' На этом устройстве нет WebGL2 — будет работать как FXAA.') }[perf.aa];
  return `<div class="cat-h">Производительность и качество</div>
    <div class="perf">
      <div class="prow"><span>Цель, кадров/с</span>${seg('target', perf.target, [[30, '30'], [60, '60'], [120, '120']])}</div>
      <label class="chk"><input type="checkbox" id="pDyn" ${perf.dyn ? 'checked' : ''}> Динамическое разрешение</label>
      <p class="hint">Если кадры проседают ниже цели, игра на ходу снижает разрешение рендера (до ${pct(perf.min)}) и растягивает кадр апскейлером; когда запас есть — возвращает. Главный способ держать плавность на слабых устройствах.</p>
      <div class="prow"><span>Масштаб рендера${perf.dyn ? ' (макс.)' : ''}</span>${seg('scale', perf.scale, [[1, '100%'], [0.85, '85%'], [0.77, '77%'], [0.67, '67%'], [0.59, '59%'], [0.5, '50%']])}</div>
      <p class="hint">Какую долю пикселей экрана рисовать. Пресеты FSR: 77% — «ультра-качество», 67% — «качество», 59% — «баланс», 50% — «производительность». Меньше — быстрее, но нужен хороший апскейлер.</p>
      <div class="prow"><span>Апскейлер</span>${seg('up', perf.up, [['off', 'Выкл'], ['cas', 'CAS'], ['fsr', 'FSR']])}</div>
      <p class="hint">${upHint} DLSS, FSR 2/3 и XeSS в браузере недоступны: им нужны векторы движения и нативный графический API.</p>
      ${perf.up !== 'off' ? `<label class="chk">Резкость <input type="range" id="pSharp" min="0" max="1" step="0.05" value="${perf.sharp}"> <span id="pSharpV">${perf.sharp.toFixed(2)}</span></label>` : ''}
      <div class="prow"><span>Сглаживание</span>${seg('aa', perf.aa, [['off', 'Выкл'], ['fxaa', 'FXAA'], ['msaa', 'MSAA ×4']])}</div>
      <p class="hint">${aaHint}</p>
      <div class="prow"><span>Ограничение кадров</span>${seg('cap', perf.cap, [[0, 'Нет'], [30, '30'], [60, '60']])}</div>
      <p class="hint">Не рисовать чаще заданного — меньше нагрев и расход батареи на телефоне. Управление от этого не страдает.</p>
      ${P3_OK ? `<label class="chk"><input type="checkbox" id="pP3" ${perf.p3 ? 'checked' : ''}> Широкий цвет (Display P3)</label>
      <p class="hint">Ваш экран поддерживает расширенный цветовой охват P3: насыщеннее зелень, небо, пламя. Это не HDR — реального HDR-вывода для WebGL в браузерах пока нет.</p>` : ''}
      <label class="chk"><input type="checkbox" id="pFps" ${perf.fps ? 'checked' : ''}> Показывать счётчик кадров</label>
      <label class="chk"><input type="checkbox" id="pImm" ${perf.immersive ? 'checked' : ''}> Режим погружения</label>
      <p class="hint">При взлёте игра разворачивается на весь экран без адресной строки и вкладок${IS_TOUCH ? ', экран не гаснет, ориентация фиксируется' : ', мышь захватывается (курсор не уедет на панели браузера), горячие клавиши браузера перехватываются где это разрешено'}; «Назад» ставит паузу, а закрыть страницу во время вылета можно только с подтверждением.${IOS ? ' На iPhone Safari не даёт сайтам полный экран — добавьте игру на экран «Домой» (Поделиться → На экран «Домой»).' : ''}</p>
      <button class="btn alt sm" id="upTestBtn">Сравнить апскейлеры (≈ 8 с)</button>
      <button class="btn alt sm" id="perfReset">Сбросить к настройкам пресета</button>
    </div>`;
}
function applyPerf() { savePerf(); dr.scale = perf.scale; rebuildPipe(); renderSettingsTab(); }
function renderModeSel() {
  $('modeSel').innerHTML = Object.entries(MODES).map(([k, m]) => {
    const off = k === 'training' && !TRAINING; // в партии на награду обучения нет
    return `<button class="${k === modeKey ? 'on' : ''}" data-mode="${k}" ${off ? 'disabled' : ''}><b>${m.name}</b><span>${off ? 'только в тренировке без наград' : m.desc}</span></button>`;
  }).join('');
}
function showTab(t) {
  document.querySelectorAll('#mtabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
  document.querySelectorAll('.tabp').forEach((p) => p.classList.toggle('on', p.id === 'tab-' + t));
}
$('mtabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) showTab(b.dataset.tab); });
$('modeSel').addEventListener('click', (e) => {
  const b = e.target.closest('[data-mode]'); if (!b || G.state !== 'menu') return;
  modeKey = b.dataset.mode; store.set('fortuna_drone_mode', modeKey); applyMode(); renderModeSel();
});
$('tab-load').addEventListener('click', (e) => {
  const info = e.target.closest('[data-info]');
  if (info) { showTab('ref'); const d = $('ref-' + info.dataset.info); d.open = true; d.scrollIntoView({ block: 'start' }); return; }
  if (e.target.id === 'symChk') { symmetric = e.target.checked; return; }
  const p = e.target.closest('[data-p]'); if (p) { selSt = +p.dataset.p; renderLoadTab(); return; }
  const o = e.target.closest('.opt'); if (!o) return;
  if (o.classList.contains('dis')) { tone(200, 0.1, 'square', 0.03); return; }
  const key = o.dataset.k || null;
  const next = loadout.slice(); next[selSt] = key;
  const mir = 7 - selSt;
  if (symmetric && mir !== selSt && canMount(mir, key, next)) next[mir] = key;
  loadout = next; applyLoadout(); renderLoadTab();
});
function saveMouse() { store.set('fortuna_drone_mouse', JSON.stringify(mouseCfg)); }
$('tab-set').addEventListener('click', (e) => {
  const g = e.target.closest('[data-g]');
  if (g && g.dataset.g !== gfxKey) { store.set('fortuna_drone_gfx', g.dataset.g); location.reload(); return; }
  if (e.target.id === 'benchBtn') runBenchmark();
  if (e.target.id === 'applyRec') { const b = JSON.parse(store.get('fortuna_drone_bench') || 'null'); if (b) { store.set('fortuna_drone_gfx', b.rec); location.reload(); } }
  const kb = e.target.closest('[data-kb]');
  if (kb) { capturing = { id: kb.dataset.kb, slot: +kb.dataset.slot }; renderSettingsTab(); return; }
  if (e.target.id === 'kbReset') { binds = defaultBinds(); store.set('fortuna_drone_keys', JSON.stringify(binds)); renderSettingsTab(); renderGuideTab(); }
  const sb = e.target.closest('.seg button');
  if (sb) {
    const id = sb.parentNode.dataset.seg, raw = sb.dataset.v, v = isNaN(+raw) ? raw : +raw;
    perf[id] = v; applyPerf(); return;
  }
  if (e.target.id === 'perfReset') { Object.assign(perf, P.perf); applyPerf(); }
  if (e.target.id === 'upTestBtn') runUpscaleTest();
});
$('tab-set').addEventListener('change', (e) => {
  if (e.target.id === 'mSteer') { mouseCfg.steer = e.target.checked; if (!mouseCfg.steer) { input.sx = 0; input.sy = 0; } saveMouse(); renderGuideTab(); }
  if (e.target.id === 'mInv') { mouseCfg.invert = e.target.checked; saveMouse(); }
  if (e.target.id === 'pDyn') { perf.dyn = e.target.checked; applyPerf(); }
  if (e.target.id === 'pFps') { perf.fps = e.target.checked; savePerf(); }
  if (e.target.id === 'pImm') { perf.immersive = e.target.checked; savePerf(); renderSettingsTab(); }
  if (e.target.id === 'pP3') { perf.p3 = e.target.checked; try { renderer.getContext().drawingBufferColorSpace = perf.p3 ? 'display-p3' : 'srgb'; } catch (_) { perf.p3 = false; } applyPerf(); }
});
$('tab-set').addEventListener('input', (e) => {
  if (e.target.id === 'mSens') { mouseCfg.sens = +e.target.value; $('mSensV').textContent = mouseCfg.sens.toFixed(1); saveMouse(); }
  if (e.target.id === 'pSharp') { perf.sharp = +e.target.value; $('pSharpV').textContent = perf.sharp.toFixed(2); if (pipe) pipe.setSharp(perf.sharp); savePerf(); }
});
renderModeSel(); renderLoadTab(); renderRefTab(); renderGuideTab(); renderSettingsTab();

// ═════════════ Тест графики ═════════════
// Отдельная «тяжёлая» сцена (мир на высоком пресете, 16 самолётов, взрывы, тени) рендерится
// с разрешением и тенями каждого пресета по ~2,6 с; по средней частоте кадров и худшим 5% кадров — рекомендация.
const bench = { active: false };
async function runBenchmark() {
  if (bench.active) return;
  bench.active = true;
  show('menu', false); $('benchScr').classList.add('on'); $('benchBox').textContent = 'Тест графики: подготовка сцены…';
  await new Promise((r) => setTimeout(r, 30));
  const bScene = new THREE.Scene();
  const bw = buildWorld(bScene, PRESETS.high, 4242, renderer);
  const bFX = makeParticles(bScene, 3000, true, dotTex), bSM = makeParticles(bScene, 3000, false, smokeTex);
  const J = jetGeo('fighter'), jets = [];
  for (let i = 0; i < 16; i++) { const m = new THREE.Mesh(J.geo, MAT_JET); m.castShadow = true; m.rotation.order = 'YXZ'; bScene.add(m); jets.push({ m, a: i / 16 * Math.PI * 2, r: 250 + (i % 5) * 60, h: 380 + (i % 4) * 50 }); }
  const T0 = TOWNS[0], cy = terrainH(T0.x, T0.z);
  const phases = ['cinema', 'ultra', 'high', 'medium', 'low'].map((key) => ({ key, shadows: !!PRESETS[key].shadows }));
  const results = {};
  const prevSh = renderer.shadowMap.enabled;
  camera.clearViewOffset();
  for (const ph of phases) {
    const pp = PRESETS[ph.key], pf = pp.perf, usePipe = !!pp.post || pf.aa !== 'off' || pf.up !== 'off';
    renderer.setPixelRatio(usePipe ? prFor(pp) : prFor(pp) * pf.scale); renderer.toneMapping = usePipe ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping; resize();
    renderer.shadowMap.enabled = ph.shadows; bw.sun.castShadow = ph.shadows;
    const sm = PRESETS[ph.key].shadowMap || 2048;
    if (bw.sun.shadow.mapSize.x !== sm) { if (bw.sun.shadow.map) { bw.sun.shadow.map.dispose(); bw.sun.shadow.map = null; } bw.sun.shadow.mapSize.set(sm, sm); }
    const bPost = usePipe ? createPipeline(renderer, { ...(pp.post || {}), exposure: (pp.post && pp.post.exposure) || 1.15, scale: pf.scale, upscaler: pf.up, sharp: pf.sharp, aa: pf.aa }) : null;
    if (bPost) bPost.setSize();
    bScene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    const times = [];
    await new Promise((res) => {
      const t0 = performance.now(); let last = t0, boomT = 0;
      function f(now) {
        const dt = now - last, elT = now - t0; last = now;
        if (elT > 450) times.push(dt);
        const s = elT / 1000;
        camera.position.set(T0.x + Math.sin(s * 0.3) * 900, cy + 320, T0.z + Math.cos(s * 0.3) * 900);
        camera.lookAt(T0.x, cy + 120, T0.z); if (camera.fov !== 66) { camera.fov = 66; camera.updateProjectionMatrix(); }
        for (const j of jets) { const a = j.a + s * 0.5; j.m.position.set(T0.x + Math.cos(a) * j.r, cy + j.h, T0.z + Math.sin(a) * j.r); j.m.rotation.set(0, -a, 0.6); }
        boomT -= dt / 1000;
        if (boomT <= 0) { boomT = 0.3; const j = jets[(rnd() * jets.length) | 0].m.position;
          for (let k = 0; k < 60; k++) { const [vx, vy, vz] = sph(60); bFX.emit(j.x, j.y, j.z, vx, vy, vz, 1, 0.6, 0.2, 1, 8, 10, 0.8, 1.5, 0); bSM.emit(j.x, j.y, j.z, vx * 0.3, vy * 0.3, vz * 0.3, 0.3, 0.3, 0.3, 0.7, 10, 14, 3, 0.5, 1); } }
        bFX.update(dt / 1000); bSM.update(dt / 1000);
        const sc = renderer.getPixelRatio() * VH / (2 * Math.tan(camera.fov * D2R / 2)); bFX.mat.uniforms.scale.value = sc; bSM.mat.uniforms.scale.value = sc;
        bw.follow(camera.position, camera.position);
        if (bPost) bPost.render(bScene, camera, s); else renderer.render(bScene, camera);
        $('benchBox').textContent = `Тест графики: ${PRESETS[ph.key].name} — ${Math.min(100, Math.round(elT / 2300 * 100))}%`;
        if (elT < 2300) requestAnimationFrame(f); else res();
      }
      requestAnimationFrame(f);
    });
    times.sort((a, b) => a - b);
    const avg = times.reduce((s, x) => s + x, 0) / Math.max(1, times.length);
    results[ph.key] = { fps: 1000 / avg, p95: times[Math.floor(times.length * 0.95)] || avg };
    if (bPost) bPost.dispose();
  }
  renderer.shadowMap.enabled = prevSh; rebuildPipe(); // вернуть свой конвейер, разрешение и тонмаппинг
  scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  for (const j of jets) bScene.remove(j.m);
  bFX.dispose(); bSM.dispose(); bw.dispose();
  let gpu = 'не определена';
  try { const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); if (ext) gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)).slice(0, 80); } catch (_) { /* нет доступа */ }
  const refresh = Math.max(results.low.fps, 30);
  const ok = (r, need) => r.fps >= need && r.p95 < 1000 / (need * 0.6);
  const top = Math.min(55, refresh * 0.9);
  const rec = ['cinema', 'ultra', 'high'].find((k) => ok(results[k], top)) || (ok(results.medium, Math.min(45, refresh * 0.8)) ? 'medium' : 'low');
  store.set('fortuna_drone_bench', JSON.stringify({ results, rec, gpu, at: Date.now() }));
  bench.active = false; bench.last = { results, rec, gpu };
  $('benchScr').classList.remove('on'); show('menu', true); renderSettingsTab(); showTab('set');
}

// ═════════════ Режим погружения («веб-киоск») ═════════════
// Полный экран без адресной строки и вкладок, захват мыши (курсор не уедет на панели браузера), перехват клавиш
// браузера в полноэкранном режиме (Chromium), запрет сна экрана, фиксация ориентации (Android), «Назад» ставит паузу,
// закрытие вкладки во время вылета — с подтверждением; жесты масштабирования и прокрутки заблокированы.
// На iPhone Safari не даёт веб-страницам полный экран — там помогает «На экран «Домой»».
const IMM = { on: false, wake: null };
async function enterImmersive() {
  if (!perf.immersive || IMM.on) return;
  IMM.on = true; document.body.classList.add('immersive');
  const root = document.documentElement;
  try { if (!document.fullscreenElement && root.requestFullscreen) await root.requestFullscreen({ navigationUI: 'hide' }); } catch (_) { /* не разрешено (iPhone, фрейм без allow) */ }
  try { if (document.fullscreenElement && navigator.keyboard && navigator.keyboard.lock) await navigator.keyboard.lock(); } catch (_) { /* только Chromium */ }
  try { if (IS_TOUCH && screen.orientation && screen.orientation.lock) await screen.orientation.lock(screen.orientation.type.startsWith('landscape') ? 'landscape' : 'portrait'); } catch (_) { /* не везде */ }
  try { if (navigator.wakeLock) IMM.wake = await navigator.wakeLock.request('screen'); } catch (_) { /* не везде */ }
  requestPointer();
  try { history.pushState({ letka: 1 }, ''); } catch (_) { /* песочница */ }
}
function requestPointer() {
  if (IS_TOUCH || !IMM.on || !mouseCfg.steer || document.pointerLockElement === canvas) return;
  try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (_) { /* не поддерживается */ }
}
function exitImmersive() {
  if (!IMM.on) return;
  IMM.on = false; document.body.classList.remove('immersive');
  try { if (navigator.keyboard && navigator.keyboard.unlock) navigator.keyboard.unlock(); } catch (_) { /* нет */ }
  try { if (document.pointerLockElement) document.exitPointerLock(); } catch (_) { /* нет */ }
  try { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch (_) { /* нет */ }
  try { if (IMM.wake) IMM.wake.release(); } catch (_) { /* нет */ } IMM.wake = null;
}
document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement !== canvas && IMM.on && G.state === 'play') togglePause(); });
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && IMM.on && G.state === 'play') togglePause(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && IMM.on && navigator.wakeLock && !IMM.wake) navigator.wakeLock.request('screen').then((w) => { IMM.wake = w; }).catch(() => {}); });
window.addEventListener('popstate', () => { // «Назад» браузера/жест — не уходим со страницы, а ставим паузу
  if (!IMM.on || (G.state !== 'play' && G.state !== 'pause')) return;
  try { history.pushState({ letka: 1 }, ''); } catch (_) { /* песочница */ }
  if (G.state === 'play') togglePause();
});
window.addEventListener('beforeunload', (e) => { if (IMM.on && (G.state === 'play' || G.state === 'pause')) { e.preventDefault(); e.returnValue = ''; } });
// жесты браузера: масштабирование щипком/двойным тапом, «потянуть для обновления», выделение и перетаскивание
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 || G.state === 'play') e.preventDefault(); }, { passive: false });
document.addEventListener('selectstart', (e) => { if (G.state === 'play') e.preventDefault(); });
document.addEventListener('dragstart', (e) => e.preventDefault());
document.addEventListener('wheel', (e) => { if (e.ctrlKey || G.state === 'play') e.preventDefault(); }, { passive: false });

// ═════════════ Режим «Обучение» ═════════════
// Учебный носитель появляется там, откуда реально пускают такую ракету, захватывает игрока (радарные) и пускает её.
// Подсказки по ходу полёта ракеты, окошко «?» → пауза с объяснением, разбор результата, затем носитель можно сбить.
const TR = { phase: 'intro', t: 0, queue: [], done: 0, launcher: null, msl: null, key: null, ask: null, askT: 0, rearmT: 0 };
function trainingReset() { Object.assign(TR, { phase: 'intro', t: 0, queue: [], done: 0, launcher: null, msl: null, key: null, ask: null, askT: 0, rearmT: 0 }); hideAsk(); }
function shuffledKeys() { const k = Object.keys(MISSILES); for (let i = k.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [k[i], k[j]] = [k[j], k[i]]; } return k; }
function trIntro() {
  return [
    'Обучение: здесь вас не собьют — корпус восстанавливается, топливо не тратится, ракеты перезаряжаются.',
    `Полёт: ${steerHint()}.`,
    `По вам будут пускать разные ракеты. Когда появится окошко «?», нажмите ${ctl('help')} — игра встанет на паузу и расскажет, что это за ракета и что делать.`,
    `Свои ракеты: ${ctl('weapon')} — смена, ${ctl('lock')} — захват радаром, ${ctl('missile')} — пуск. При смене ракеты тоже появится «?».`,
  ];
}
function askAbout(kind, key, m) {
  if (!key) return;
  TR.ask = { kind, key, m }; TR.askT = 12;
  const M_ = MISSILES[key];
  $('askTxt').textContent = kind === 'enemy' ? `По вам пущена ${M_.short}! Что это за ракета?` : `Выбрана ${M_.short}. Как ей пользоваться?`;
  $('askKey').innerHTML = IS_TOUCH ? 'нажмите «?» — игра встанет на паузу' : `${ctl('help')} или «?» — пауза и объяснение`;
  $('ask').classList.add('on'); tone(900, 0.08, 'triangle', 0.05);
}
function hideAsk() { TR.ask = null; $('ask').classList.remove('on'); }
function trSpawn(key) {
  const M_ = MISSILES[key], p = player;
  let yawDir, dist;
  if (M_.kind === 'ir') { // тепловые — сзади-сбоку, в пределах дальности ГСН (ранние — строго в хвост)
    yawDir = p.yaw + Math.PI + (rnd() - 0.5) * (M_.ir.aspect < 180 ? 0.3 : 1.6); dist = clamp(M_.ir.range * 0.5, 2500, 7000);
  } else { // радиолокационные — спереди, между неизбежной и максимальной дальностью
    const z = dlz(M_, p.pos.y, 260, p.speed); dist = clamp(z.rne + (z.rmax - z.rne) * 0.3, 7000, 30000); yawDir = p.yaw + (rnd() - 0.5) * 1.2;
  }
  const pos = p.pos.clone().add(new THREE.Vector3(-Math.sin(yawDir) * dist, 0, -Math.cos(yawDir) * dist));
  pos.y = clamp(p.pos.y + (rnd() - 0.5) * 1200, terrainH(pos.x, pos.z) + 1200, 11000);
  const e = spawnAI(M_.cat === 'lr' ? 'interceptor' : 'fighter', pos, Math.atan2(pos.x - p.pos.x, pos.z - p.pos.z), null, null);
  for (const x of e.msl) if (x) e.group.remove(x.mesh);
  e.msl = jetGeo(e.type).stations.map((st, i) => {
    if (i > 1) return null;
    const mm = missileMesh(key); mm.position.copy(st); mm.position.y -= MISSILES[key].vis.r; e.group.add(mm); return { key, mesh: mm };
  });
  e.mslCD = 1e9; e.cmFlare = 0; e.cmChaff = 0; e.trainer = true; // сам не стреляет ракетами и не ставит помехи
  return e;
}
function trRemove(L) { if (!L || L.dead) return; L.dead = true; scene.remove(L.group); if (radar.lock === L) radar.lock = null; radar.contacts.delete(L); }
function trFlightHint(m, L) {
  const d = m.pos.distanceTo(player.pos), M_ = m.M, clk = clockOf(localAngles(player, TMP.copy(m.pos).sub(player.pos))[0]);
  const cl = m.closing !== undefined && m.closing < 15 ? '<b>не догоняет</b>' : `до попадания ≈ ${m.closing > 0 ? Math.ceil(d / m.closing) : '?'} с`;
  const base = `<b>${M_.short}</b> на ${clk} ч, ${(d / 1000).toFixed(1)} км, ${cl}. `;
  if (m.lost || m.decoy) return base + 'Ракета потеряла цель — продолжайте манёвр!';
  if (M_.kind === 'ir') {
    if (player.ab) return base + `Выключите форсаж (${ctl('ab')}) — на форсаже вы горячее, ЛТЦ работают хуже.`;
    if (d < 3200) return base + `Сейчас — ЛТЦ: ${ctl('flare')}! И резкий отворот поперёк её курса.`;
    return base + 'Отворачивайте так, чтобы ракета оказалась на 3 или 9 ч. ЛТЦ — когда она ближе 3 км.';
  }
  const lk = L && !L.dead && L.stt;
  const lclk = L && !L.dead ? clockOf(localAngles(player, TMP.copy(L.pos).sub(player.pos))[0]) : '?';
  if (M_.kind === 'sarh') {
    if (!lk) return base + 'Подсвет сорван — ракета ослепла! Держите манёвр.';
    return base + `Её ведёт радар «${L.S.name}» (${lclk} ч): поставьте его на 3 или 9 ч и снижайтесь — уйдёте в доплеровский провал.` + (d < 7000 ? ` Сейчас — диполи: ${ctl('chaff')}!` : '');
  }
  if (!m.active) return base + (lk ? `Пока летит по данным «${L.S.name}» (${lclk} ч): сорвите его захват — траверз и снижение.` : 'Носитель потерял вас — ракета летит в старую точку. Меняйте курс!');
  return base + `Её ГСН включилась («М» на СПО): держите ракету на 3 или 9 ч, снижайтесь, диполи — ${ctl('chaff')}.` + (d > 6000 ? ' Или разворачивайтесь от неё и уходите со снижением на форсаже.' : '');
}
function trAttackHint(L) {
  const d = L.pos.distanceTo(player.pos), M_ = selType && MISSILES[selType];
  if (!M_) return `Ракет нет — пушка: ${ctl('fire')}, ближе 1,5 км, визир на жёлтый кружок упреждения.`;
  if (M_.kind === 'ir') return seeker.locked ? `ГСН захватила цель — пуск: ${ctl('missile')}!` : `Наведите нос на «${L.S.name}» (${(d / 1000).toFixed(1)} км) — ГСН ${M_.short} должна захватить его (круг замигает красным).`;
  if (radar.lock !== L) return radar.contacts.has(L) ? `Захватите его радаром: ${ctl('lock')}.` : `Разверните нос к нему — радар видит цели в ±60° от носа (${(d / 1000).toFixed(1)} км).`;
  return dlzCache && d < dlzCache.rmax ? `В зоне пуска — ${ctl('missile')}!` + (M_.kind === 'sarh' ? ' Держите захват до попадания.' : '') : 'Далеко — сближайтесь до зоны пуска (шкала справа от радара).';
}
function trDebrief(m) {
  TR.done++;
  let txt;
  if (!m) txt = 'Пуск сорван.';
  else if (m.hitPlayer) txt = `Попадание ${m.M.short}. Нажмите «?» при следующем пуске — там разобрано, что делать.`;
  else txt = { flare: 'Ракета ушла на ЛТЦ — отлично!', chaff: 'Ракета ушла на диполи — отлично!', notch: 'Вы спрятались в доплеровском провале — ГСН потеряла цель!',
    energy: 'Ракета исчерпала энергию и не догнала — энергетическое уклонение сработало!', gimbal: 'Вы ушли из поля зрения её ГСН резким манёвром!', sun: 'Ранняя ГСН «увелась» на солнце!' }[m.why]
    || (m.M.kind === 'sarh' ? 'Ракета промахнулась — подсвет был сорван.' : 'Ракета промахнулась.');
  setHint(`<b>${txt}</b> Теперь попробуйте сбить носитель — или дождитесь следующего пуска.`);
  popup(m && m.hitPlayer ? 'ПОПАДАНИЕ' : 'УКЛОНЕНИЕ!', m && m.hitPlayer ? 'bad' : 'good');
}
function trainingTick(dt) {
  TR.t += dt;
  if (TR.ask) { TR.askT -= dt; if (TR.askT <= 0) hideAsk(); }
  if (!typesLoaded().length) { TR.rearmT += dt; if (TR.rearmT > 3) { TR.rearmT = 0; applyLoadout(); popup('Ракеты перезаряжены (обучение)', 'info'); } }
  if (player.flares < 10) player.flares = MODE.cm; if (player.chaff < 10) player.chaff = MODE.cm;
  const L = TR.launcher;
  if (TR.phase === 'intro') {
    const lines = trIntro(), i = Math.floor(TR.t / 5.5);
    if (i < lines.length) setHint(lines[i]); else { TR.phase = 'spawn'; TR.t = 0; if (selType) askAbout('own', selType); }
  } else if (TR.phase === 'spawn') {
    if (!TR.queue.length) TR.queue = shuffledKeys();
    TR.key = TR.queue.pop(); TR.launcher = trSpawn(TR.key); TR.msl = null; TR.phase = 'approach'; TR.t = 0;
    popup(`Учебный пуск: ${MISSILES[TR.key].short}`, 'info');
  } else if (TR.phase === 'approach') {
    if (!L || L.dead) { TR.phase = 'rest'; TR.t = 0; return; }
    const radarKind = MISSILES[TR.key].kind !== 'ir';
    if (radarKind) { L.stt = true; L.sttLostT = 0; } // сначала — захват: на СПО жёлтый ромб
    setHint(radarKind ? `Вас захватывает «${L.S.name}» — посмотрите на СПО (круг ${POS.rwr}): буква в жёлтом ромбе = захват.`
      : 'За вами заходит противник с тепловой ракетой. СПО её не покажет — следите за надписью «РАКЕТА!».');
    if (TR.t > (radarKind ? 3 : 2)) {
      TMP.copy(player.pos).sub(L.pos); L.yaw = Math.atan2(-TMP.x, -TMP.z); L.pitch = Math.asin(clamp(TMP.y / TMP.length(), -0.6, 0.6));
      fwdOf(L, L.vel).multiplyScalar(L.speed);
      const idx = L.msl.findIndex((x) => x); if (idx < 0) { TR.phase = 'rest'; TR.t = 0; return; }
      const mesh = L.msl[idx].mesh; L.msl[idx] = null;
      TR.msl = launchMissile(L, TR.key, player, mesh);
      askAbout('enemy', TR.key, TR.msl); TR.phase = 'flight'; TR.t = 0;
    }
  } else if (TR.phase === 'flight') {
    const m = TR.msl;
    if (!m || m.dead) { trDebrief(m); TR.phase = 'debrief'; TR.t = 0; return; }
    setHint(trFlightHint(m, L));
  } else if (TR.phase === 'debrief') {
    if (TR.t > 6) { TR.phase = 'target'; TR.t = 0; }
  } else if (TR.phase === 'target') {
    if (!L || L.dead) { setHint(L && L.dead ? '<b>Носитель сбит!</b> Следующий учебный пуск через пару секунд.' : ''); if (TR.t > 3) TR.phase = 'spawn'; }
    else { setHint(trAttackHint(L)); if (TR.t > 25) { trRemove(L); TR.phase = 'spawn'; } }
  } else if (TR.phase === 'rest' && TR.t > 2) TR.phase = 'spawn';
}
// ── Объяснение на паузе ──
function lessonEnemy(M_, m) {
  const live = m && !m.dead;
  const now = live ? `<p class="now">Сейчас: ракета в ${(m.pos.distanceTo(player.pos) / 1000).toFixed(1)} км на ${clockOf(localAngles(player, TMP.copy(m.pos).sub(player.pos))[0])} ч, ${closingText(m)}.</p>` : '';
  const see = {
    ir: 'СПО её <b>не видит</b> — тепловая ГСН ничего не излучает. Заметить можно только по надписи «РАКЕТА!» от датчика пуска (пока горит двигатель) и по дымному следу.',
    sarh: 'На СПО — буква пустившего самолёта в <b>жёлтом ромбе</b> (захват), затем <b>мигающая красная</b> — пуск. Ракету ведёт его радар.',
    arh: `На СПО — захват и пуск, затем символ <b>«М»</b>, когда ракета включит свою ГСН (≈ ${km(M_.pitbull || 0)} до вас). До этого она летит по данным самолёта.`,
  }[M_.kind];
  let todo;
  if (M_.kind === 'ir') {
    todo = [`Выключите форсаж (${ctl('ab')}) — на форсаже вы в 2,2 раза «горячее».`, `Сбрасывайте ЛТЦ (${ctl('flare')}) пачками, когда ракета ближе 1–3 км.`, `Резко отворачивайте поперёк её курса: ${steerHint()}.`];
    if (M_.ir.aspect < 180) todo.push('Эта ранняя ГСН видит только сопло: не подставляйте хвост; разворот на солнце может её увести.');
    if (M_.ir.irccm >= 0.8) todo.push('Её ГСН почти не обманывают ловушки — главное резкий отворот в последний момент или дальность больше дальности её ГСН.');
  } else if (M_.kind === 'sarh') {
    todo = ['Сорвите захват пустившего: поставьте его на 3 или 9 ч (траверз) и снижайтесь ниже него — уйдёте в доплеровский провал.',
      `Когда ракета ближе 7 км — диполи (${ctl('chaff')}).`, 'Или уйдите за ±60° от его носа. Пропал жёлтый ромб на СПО — ракета ослепла.'];
  } else {
    todo = ['Пока нет «М» — сорвите захват пустившего (траверз + снижение) и смените курс: ракета полетит в старую точку.',
      `После «М» держите на 3 или 9 ч уже саму ракету, снижайтесь, диполи пачками (${ctl('chaff')}).`,
      `Если ракета далеко — развернитесь от неё и уходите на форсаже (${ctl('ab')}) со снижением: при «НЕ ДОГОНЯЕТ» вы в безопасности.`];
    if (M_.sustain) todo.push('У Meteor прямоточный двигатель работает почти весь полёт — убежать не получится, только провал и диполи.');
  }
  if (M_.g <= 20) todo.push(`Ракета неповоротливая (${M_.g} g): резкий отворот за 2–3 км до попадания может её сорвать.`);
  return `${now}<h4>Что это</h4><p>${M_.guide}</p><p class="dim">${M_.hist[0]}</p>
    <h4>Как её заметить</h4><p>${see}</p>
    <h4>Что делать</h4><ol>${todo.map((t) => `<li>${t}</li>`).join('')}</ol>
    <h4>Кнопки</h4><p>ЛТЦ — ${ctl('flare')}, диполи — ${ctl('chaff')}, оба сразу — ${ctl('cm')}, форсаж — ${ctl('ab')}, взгляд назад — ${ctl('lookBack')}.</p>`;
}
function lessonOwn(M_) {
  const z = dlz(M_, player.pos.y, player.speed, 250);
  let steps;
  if (M_.kind === 'ir') {
    steps = [`Наведите нос на цель — ГСН видит в ±${M_.ir.fov}° от носа${M_.ir.slaved > M_.ir.fov ? ` (с захватом радаром — до ±${M_.ir.slaved}°, захват: ${ctl('lock')})` : ''}.`,
      'Дождитесь захвата: жёлтый круг станет красным и замигает, тон в наушниках повысится.', `Пуск — ${ctl('missile')}. Дальше ракета сама.`];
    if (M_.ir.loal) steps.push('Можно пускать и без захвата — ГСН найдёт цель после пуска (в конусе 35° от курса ракеты).');
    if (M_.ir.aspect < 180) steps.unshift('Ранняя ГСН: заходите цели строго в хвост — в лоб она цель не видит.');
  } else if (M_.kind === 'sarh') {
    steps = [`Захватите цель радаром: ${ctl('lock')}.`, 'Дождитесь «ПУСК РАЗРЕШЁН» (лучше — «НЕИЗБЕЖНАЯ ЗОНА»).', `Пуск — ${ctl('missile')}.`,
      '<b>Держите цель в захвате до попадания</b>: не отворачивайте больше чем на 60°. В панели оружия при этом «·ПОДСВ».'];
  } else {
    steps = [`Захватите цель (${ctl('lock')}) — или пускайте прямо по зелёной отметке радара в пределах 30° от носа: так противник не узнает о захвате.`,
      `Пуск — ${ctl('missile')}.`, 'Пока в панели оружия «·КОРР», держите цель на радаре — ракета получает поправки.',
      `После «·ГСН» (≈ ${km(M_.pitbull || 0)} до цели) ракета самостоятельна — можно разворачиваться.`];
  }
  return `<h4>Как наводится</h4><p>${M_.guide}</p>
    <h4>Как стрелять</h4><ol>${steps.map((t) => `<li>${t}</li>`).join('')}</ol>
    <h4>Дальности сейчас</h4><p>На вашей высоте ${Math.round(player.pos.y)} м по цели, идущей навстречу: до ≈ ${km(z.rmax)}; неизбежная зона ≈ ${km(z.rne)}; минимум ${km(M_.rmin)}.</p>
    <h4>В игре</h4><p>${gameText(M_)}</p><p class="dim">${M_.hist[0]}</p>`;
}
function openLesson(ask) {
  if (G.state !== 'play' || !ask) return;
  const M_ = MISSILES[ask.key]; hideAsk();
  G.state = 'pause'; G.paused = true; G.lesson = true; held.clear(); input.fire = false; silenceLoops();
  $('lessonTitle').innerHTML = `<span class="tag ${M_.kind}">${KIND_TAG[M_.kind]}</span> ${M_.name}`;
  $('lessonBody').innerHTML = ask.kind === 'enemy' ? lessonEnemy(M_, ask.m) : lessonOwn(M_);
  show('lesson', true);
}
function closeLesson() { show('lesson', false); G.lesson = false; G.paused = false; G.state = 'play'; }
$('askBtn').addEventListener('click', () => openLesson(TR.ask));
$('lessonClose').addEventListener('click', closeLesson);

// ═════════════ Сравнение апскейлеров ═════════════
// Одна и та же сцена (дрон над аэродромом): натив 100%, 67% без апскейлера, 67% + CAS, 67% + FSR-стиль.
// Для каждого — средняя частота кадров за ~1,6 с и снимок кадра; потом окно «шторкой» сравнивает снимки.
async function runUpscaleTest() {
  if (bench.active) return;
  bench.active = true;
  show('menu', false); $('benchScr').classList.add('on');
  const saved = { ...perf }, S = 0.67;
  const cfgs = [{ k: 'native', name: 'Натив 100%', scale: 1, up: 'off' }, { k: 'bil', name: '67% без апскейлера', scale: S, up: 'off' },
    { k: 'cas', name: '67% + CAS', scale: S, up: 'cas' }, { k: 'fsr', name: '67% + FSR', scale: S, up: 'fsr' }];
  camera.clearViewOffset();
  if (camera.fov !== 50) { camera.fov = 50; camera.updateProjectionMatrix(); }
  const pose = (t) => {
    player.pos.copy(HANGAR); player.yaw = 0.9 + t * 0.15; player.pitch = 0.05; player.roll = 0.35; player.ab = true; placeShip();
    camera.position.set(HANGAR.x + Math.sin(0.5 + t * 0.1) * 24, HANGAR.y + 5, HANGAR.z + Math.cos(0.5 + t * 0.1) * 24);
    camera.up.set(0, 1, 0); camera.lookAt(HANGAR.x, HANGAR.y - 3, HANGAR.z);
  };
  const out = [];
  for (const c of cfgs) {
    Object.assign(perf, { scale: c.scale, dyn: false, up: c.up }); dr.scale = c.scale; rebuildPipe();
    const times = [];
    await new Promise((res) => {
      const t0 = performance.now(); let lastT = t0;
      function f(now) {
        const el = now - t0; times.push(now - lastT); lastT = now;
        pose(el / 1000); SMOKE.update(0.016); FX.update(0.016); render();
        $('benchBox').textContent = `Сравнение апскейлеров: ${c.name} — ${Math.min(100, Math.round(el / 1600 * 100))}%`;
        if (el < 1600) requestAnimationFrame(f); else res();
      }
      requestAnimationFrame(f);
    });
    times.splice(0, 8); times.sort((a, b) => a - b);
    const avg = times.reduce((x, y) => x + y, 0) / Math.max(1, times.length);
    pose(0.8); render();
    let img = ''; try { img = canvas.toDataURL('image/jpeg', 0.92); } catch (_) { img = ''; }
    out.push({ ...c, fps: 1000 / avg, img });
  }
  Object.assign(perf, saved); dr.scale = perf.scale; rebuildPipe();
  player.ab = false; bench.active = false;
  $('benchScr').classList.remove('on');
  showUpscaleResult(out);
}
function showUpscaleResult(out) {
  const nat = out[0];
  const rows = out.map((r) => `<tr><td>${r.name}</td><td>${Math.round(r.fps)} к/с ${r === nat ? '' : `<b style="color:${r.fps >= nat.fps ? '#86efac' : '#fca5a5'}">${r.fps >= nat.fps ? '+' : ''}${Math.round((r.fps / nat.fps - 1) * 100)}%</b>`}</td></tr>`).join('');
  $('upBody').innerHTML = `
    <div class="cmp" id="cmp"><img id="cmpA" src="${nat.img}" alt="натив"><div class="cmpB" id="cmpB"><img id="cmpBi" src="${out[3].img}" alt="апскейл"></div>
      <div class="cmpLine" id="cmpLine"></div><span class="cmpL">Натив 100%</span><span class="cmpR" id="cmpR">${out[3].name}</span></div>
    <input type="range" id="cmpRange" min="0" max="100" value="50" style="width:100%">
    <div class="seg" id="cmpSel">${out.slice(1).map((r, i) => `<button class="${i === 2 ? 'on' : ''}" data-i="${i + 1}">${r.name}</button>`).join('')}</div>
    <label class="chk"><input type="checkbox" id="cmpZoom"> Увеличение ×2 (видно резкость мелких деталей)</label>
    <table class="tt">${rows}</table>
    <p class="hint">Двигайте ползунок: слева — натив, справа — выбранный вариант. Хороший апскейлер при 67% почти не отличается от натива, а кадров заметно больше. Разница в к/с видна, только если видеокарта не упирается в частоту экрана.</p>`;
  const setPos = (v) => { $('cmpB').style.clipPath = `inset(0 0 0 ${v}%)`; $('cmpLine').style.left = v + '%'; };
  setPos(50);
  $('cmpRange').oninput = (e) => setPos(+e.target.value);
  $('cmpSel').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; const r = out[+b.dataset.i]; $('cmpBi').src = r.img; $('cmpR').textContent = r.name; $('cmpSel').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); };
  $('cmpZoom').onchange = (e) => $('cmp').classList.toggle('zoom', e.target.checked);
  show('upTest', true);
}
$('upClose').addEventListener('click', () => { show('upTest', false); show('menu', true); showTab('set'); });

// ═════════════ Состояния игры ═════════════
function show(id, on) { $(id).classList.toggle('on', on); }
function setBody(cls) { document.body.classList.remove('menuing', 'playing'); if (cls) document.body.classList.add(cls); }
function placeAtStart() {
  player.yaw = 0; player.pitch = 0; player.roll = 0; player.wy = player.wp = 0; player.speed = 240; player.thr = 0.85;
  player.pos.set(AIRFIELD.x, airfieldH() + 2400, AIRFIELD.z - 1500);
  fwdOf(player, player.vel).multiplyScalar(player.speed); camSnap = true;
}
function startCountdown() {
  initAudio(); if (actx && actx.state === 'suspended') actx.resume();
  show('menu', false); setBody('playing'); $('hud').classList.add('on'); G.state = 'countdown';
  camera.clearViewOffset(); applyMode(); applyLoadout(); placeAtStart();
  setHint(''); if (MODE.training) trainingReset();
  enterImmersive(); // клик «ВЗЛЁТ» — жест пользователя, браузер разрешит полный экран и захват мыши
  let n = 3; $('count').textContent = n;
  const iv = setInterval(() => {
    n--; if (n > 0) { $('count').textContent = n; tone(440, 0.1, 'square', 0.05); }
    else { clearInterval(iv); $('count').textContent = 'В БОЙ!'; tone(880, 0.25, 'square', 0.06); G.state = 'play'; setTimeout(() => { $('count').textContent = ''; }, 700); }
  }, 800);
}
function togglePause() {
  if (G.lesson) { closeLesson(); return; }
  if (G.state !== 'play' && !G.paused) return;
  G.paused = !G.paused; G.state = G.paused ? 'pause' : 'play';
  show('pauseScr', G.paused);
  if (G.paused) { silenceLoops(); held.clear(); try { if (document.pointerLockElement) document.exitPointerLock(); } catch (_) { /* нет */ } }
  else requestPointer(); // продолжение по кнопке — снова захватываем мышь
}
function endGame(reason) {
  if (G.over) return; G.over = true; G.state = 'over'; input.fire = false; input.ab = false;
  try { if (document.pointerLockElement) document.exitPointerLock(); } catch (_) { /* нет */ } // курсор нужен для кнопок итогов
  if (reason === 'hull') { explosion(player.pos, 4); sfx.boom(0.35); }
  silenceLoops();
  const texts = { hull: 'Дрон сбит', fuel: 'Топливо закончилось', time: 'Время вылета вышло', win: 'Все группы противника уничтожены' };
  setTimeout(() => {
    $('hud').classList.remove('on'); setBody(null);
    $('endTitle').textContent = G.bossKilled ? 'Победа над Подстилкой!' : 'Вылет окончен'; $('endTitle').className = G.bossKilled ? 'win' : '';
    $('endReason').textContent = texts[reason] || '';
    $('eKills').textContent = G.kills; $('eMax').textContent = MAX_K; $('eScore').textContent = G.score; $('eMsl').textContent = G.mHits + '/' + G.mFired; $('eEvade').textContent = G.evaded;
    $('eBoss').textContent = G.bossKilled ? 'Флагман «Подстилка улитки» сбит (+5)' : (G.bossSpawned ? 'Флагман «Подстилка улитки» уцелел' : '');
    if (TRAINING) $('serverMsg').textContent = 'Тренировка — результат не идёт в общий прогресс';
    else { $('serverMsg').textContent = 'Отправляем результат…'; $('againBtn').style.display = 'none'; $('closeBtn').textContent = 'Закрыть'; }
    show('end', true);
  }, 1300);
  if (!TRAINING) sendResult(reason);
}
function sendResult(reason) {
  if (G.sent || MODE.training) return; G.sent = true;
  const payload = { type: 'mg_result', game: 'drone', schedule_version: SCHEDULE_VERSION, seed: SEED, kills: G.kills, max_kills: MAX_K, score: G.score,
    duration_ms: Math.round(G.runTime * 1000), boss_killed: G.bossKilled, reason, shots: G.shots, hits: G.hits,
    missiles_fired: G.mFired, missile_hits: G.mHits, evaded: G.evaded, loadout: loadout.slice(), mode: modeKey };
  if (window.parent !== window) window.parent.postMessage(payload, '*');
}
window.addEventListener('message', (e) => { if (e.data && e.data.type === 'mg_result_ack') $('serverMsg').textContent = String(e.data.text || ''); });
$('startBtn').addEventListener('click', startCountdown);
$('resumeBtn').addEventListener('click', togglePause);
$('againBtn').addEventListener('click', () => location.reload());
function exitGame() { exitImmersive(); if (window.parent !== window && window.parent.closeMgOverlay) window.parent.closeMgOverlay(); else location.reload(); } // вне сайта — назад в меню
$('closeBtn').addEventListener('click', exitGame); $('exit').addEventListener('click', exitGame); $('pause').addEventListener('click', togglePause); $('pauseExit').addEventListener('click', exitGame);
document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'play') togglePause(); });
$('modeBadge').className = 'badge ' + (TRAINING ? 'train' : 'rank');
$('modeBadge').textContent = TRAINING ? 'ТРЕНИРОВКА — без наград' : 'НА НАГРАДУ — результат идёт в общий прогресс недели';
setBody('menuing');

// ═════════════ Главный цикл ═════════════
const HANGAR = new THREE.Vector3(AIRFIELD.x, airfieldH() + 700, AIRFIELD.z);
function menuView(dt) {
  G.menuT += dt;
  player.pos.copy(HANGAR); player.pitch = 0.06 * Math.sin(G.menuT * 0.7); player.roll = 0.12 * Math.sin(G.menuT * 0.5); player.yaw = G.menuT * 0.22;
  player.ab = false; player.thr = 0.85; player.cmdX = Math.sin(G.menuT * 0.8) * 0.4; player.cmdY = 0; placeShip();
  const portrait = VW < VH, cd = portrait ? 27 : 23;
  camera.position.set(HANGAR.x + Math.sin(0.6) * cd, HANGAR.y + 6, HANGAR.z + Math.cos(0.6) * cd);
  camera.up.set(0, 1, 0); camera.lookAt(HANGAR);
  const fov = portrait ? 80 : 58; if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
  if (portrait) camera.setViewOffset(VW, VH, 0, VH * 0.24, VW, VH); else camera.setViewOffset(VW, VH, -VW * 0.2, 0, VW, VH);
}
function tick(dt) {
  if (G.state === 'play') {
    G.runTime += dt;
    if (!MODE.training) runSchedule();
    updatePlayer(dt);
    updateRadar(dt); updateSeeker(dt);
    for (let i = enemies.length - 1; i >= 0; i--) { const e = enemies[i]; if (!e.dead) updateAI(e, dt); if (e.dead) enemies.splice(i, 1); }
    if (MODE.training) trainingTick(dt);
    for (let i = missiles.length - 1; i >= 0; i--) { const m = missiles[i]; if (!m.dead) updateMissile(m, dt); if (m.dead) missiles.splice(i, 1); }
    updateBullets(dt); updateCMs(dt); updateWrecks(dt); updateTankers(dt); updateRwr(dt);
    updateMissileLights();
    if (MODE.training) { /* обучение без ограничения по времени */ }
    else if (G.runTime >= H_CAP) endGame('time');
    else if (G.bossSpawned && !enemies.length && !schedule.slice(schedIdx).some((ev) => ev.type !== 'tanker')) endGame('win');
    if (actx && engGain && !muted) {
      // дозвук: вой турбины + рёв выхлопа + лёгкий поток воздуха;
      // сверхзвук: турбина приглушена (звук двигателя «отстаёт» от самолёта), низкий гул корпуса и мягкий «дышащий» поток
      const sup = player.sup, mach = player.mach || 0, k = Math.min(1, 2.5 * dt);
      engOsc.frequency.value = 140 + player.speed * 0.45;
      engFilter.frequency.value += ((sup ? 320 : 900) - engFilter.frequency.value) * k;
      engGain.gain.value += ((sup ? 0.012 : 0.02 + player.thr * 0.02) - engGain.gain.value) * k;
      roarFilter.frequency.value += ((sup ? 190 : 500) - roarFilter.frequency.value) * k;
      roarGain.gain.value += ((sup ? 0.05 + (player.ab ? 0.015 : 0) : (player.ab ? 0.1 : 0.03 + player.thr * 0.02)) - roarGain.gain.value) * k;
      windFilter.frequency.value = sup ? 520 + clamp(mach - 1, 0, 1) * 300 : 500 + clamp(player.speed / 400, 0, 1) * 500;
      windGain.gain.value += ((sup ? 0.05 + clamp(mach - 1, 0, 0.8) * 0.03 : clamp((player.speed - 120) / 400, 0, 1) * 0.03) - windGain.gain.value) * k;
      windGain.lfo.gain.value = sup ? 0.015 : 0.004;
      droneGain.gain.value += ((sup ? 0.035 : 0) - droneGain.gain.value) * k;
    }
    updateSpatial(dt);
  } else if (G.state === 'over') {
    for (let i = missiles.length - 1; i >= 0; i--) { const m = missiles[i]; if (!m.dead) updateMissile(m, dt); if (m.dead) missiles.splice(i, 1); }
    updateCMs(dt); updateWrecks(dt);
  }
  if (G.state === 'play' || G.state === 'countdown' || G.state === 'over') {
    if (G.state === 'countdown') { player.pos.addScaledVector(player.vel, dt); }
    ship.visible = !(G.over && player.hull <= 0);
    placeShip(); updateCamera(dt); updateShock(dt);
    if (G.state !== 'over') updateHud(dt);
  } else if (G.state === 'menu') menuView(dt);
  if (G.state !== 'pause') {
    SMOKE.update(dt); FX.update(dt); world.update(dt);
    if (boomLight.intensity > 0) boomLight.intensity = Math.max(0, boomLight.intensity - dt * 8);
  }
}
// положение солнца на экране и его видимость (рельеф на пути к солнцу гасит блики и лучи)
const sunScr = { x: 0.5, y: 0.5, vis: 0 };
function updateSun() {
  const sp = TMP.copy(camera.position).addScaledVector(SUN_DIR, 10000).project(camera);
  let vis = sp.z < 1 && Math.abs(sp.x) < 1.3 && Math.abs(sp.y) < 1.3;
  if (vis) for (let k = 1; k <= 12; k++) { const q = TMP2.copy(camera.position).addScaledVector(SUN_DIR, k * 700); if (q.y < terrainH(q.x, q.z)) { vis = false; break; } }
  sunScr.x = (sp.x + 1) / 2; sunScr.y = (sp.y + 1) / 2; sunScr.nx = sp.x; sunScr.ny = sp.y;
  sunScr.vis += ((vis ? clamp(1.35 - Math.hypot(sp.x, sp.y) * 0.6, 0, 1) : 0) - sunScr.vis) * 0.2;
}
function render() {
  const s = renderer.getPixelRatio() * (pipe ? pipe.scale : 1) * VH / (2 * Math.tan(camera.fov * D2R / 2));
  SMOKE.mat.uniforms.scale.value = s; FX.mat.uniforms.scale.value = s;
  world.follow(camera.position, P.shadows ? player.pos : null);
  updateSun();
  if (pipe) pipe.render(scene, camera, performance.now() / 1000, sunScr); else renderer.render(scene, camera);
  if (P.flares) updateLensFlare();
}
// Блики объектива (Ультра/Кино): цепочка кругов через центр кадра
const flareEls = [];
if (P.flares) {
  const box = document.createElement('div'); box.id = 'flares'; document.body.insertBefore(box, $('hud'));
  for (const [sz, col] of [[300, 'rgba(255,240,200,.26)'], [70, 'rgba(160,210,255,.35)'], [130, 'rgba(255,200,140,.2)'], [40, 'rgba(200,255,220,.4)'], [190, 'rgba(140,170,255,.13)'], [22, 'rgba(255,255,255,.5)']]) {
    const d = document.createElement('i'); d.style.cssText = `width:${sz}px;height:${sz}px;margin:${-sz / 2}px 0 0 ${-sz / 2}px;background:radial-gradient(circle, ${col} 0%, rgba(0,0,0,0) 70%)`;
    box.appendChild(d); flareEls.push(d);
  }
}
function updateLensFlare() {
  const a = sunScr.vis, pts = [1, 0.4, -0.2, -0.6, -1.1, 0.15];
  flareEls.forEach((d, i) => {
    const x = (sunScr.nx * pts[i] + 1) / 2 * VW, y = (1 - sunScr.ny * pts[i]) / 2 * VH;
    d.style.transform = `translate(${x.toFixed(0)}px,${y.toFixed(0)}px)`; d.style.opacity = a.toFixed(2);
  });
}
// Счётчик кадров (включается в «Настройках»)
const fpsEl = document.createElement('div'); fpsEl.id = 'fpsMeter'; document.body.appendChild(fpsEl);
let fpsT = 0;
function updateFpsMeter(dtMs) {
  fpsT += dtMs; if (fpsT < 400) return; fpsT = 0;
  fpsEl.style.display = perf.fps ? 'block' : 'none';
  if (perf.fps) fpsEl.textContent = `${Math.round(dr.fps)} к/с · ${Math.round((pipe ? pipe.scale : dr.scale) * 100)}%${perf.up !== 'off' ? ' · ' + (perf.up === 'fsr' ? 'FSR' : 'CAS') : ''}${perf.aa !== 'off' ? ' · ' + perf.aa.toUpperCase() : ''}`;
}
let last = performance.now(), lastDraw = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (bench.active) { last = now; return; }
  // ограничитель кадров: пропускаем кадр, если с прошлого прошло меньше 1/cap (с запасом 1 мс)
  if (perf.cap && now - lastDraw < 1000 / perf.cap - 1) return;
  const frameMs = now - lastDraw; lastDraw = now;
  const dt = Math.min(0.05, (now - last) / 1000) * (G.slowmo > 0 ? 0.3 : 1); last = now;
  if (G.slowmo > 0) G.slowmo -= dt / 0.3;
  tick(dt); render();
  if (frameMs < 250) { drUpdate(frameMs); updateFpsMeter(frameMs); }
}
$('loading').remove();
requestAnimationFrame(frame);

if (TEST && TRAINING) window.__g = { camera, ship, scene, G, player, enemies, missiles, tankers, bullets, cms, schedule, radar, seeker, input, held, binds, loaded, MISSILES, AC, rwr,
  spawnAI, spawnTanker, endGame, hurt, dlz, buildSchedule, maxKills, SEED, tick, render, launchPlayerMissile, launchMissile, cycleLock, cycleWeapon, dropCM, updateHud, runBenchmark,
  getSel: () => selType, gunT: () => gunTarget, gfx: () => gfxKey, mode: () => modeKey, TR, openLesson, closeLesson, perf, pipe: () => pipe, dr,
  renderAll() { renderModeSel(); renderLoadTab(); renderRefTab(); renderGuideTab(); renderSettingsTab(); }, setMode(k) { modeKey = k; applyMode(); renderModeSel(); },
  setLoadout(arr) { loadout = arr.slice(); applyLoadout(); renderLoadTab(); },
  begin() { show('menu', false); setBody('playing'); $('hud').classList.add('on'); camera.clearViewOffset(); applyMode(); applyLoadout(); placeAtStart(); G.state = 'play'; } };
