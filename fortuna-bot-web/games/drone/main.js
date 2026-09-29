// «Симулятор Летки» — основной модуль: лётная модель, ракеты, радар, СПО, ИИ «Подстилки улитки», HUD, меню, тест графики.
/* global THREE */
import { SCHEDULE_VERSION, H_CAP, UNIT_KILLS, buildSchedule, maxKills } from './schedule.js?v=20260929d';
import { MISSILES, CATS, KIND_TAG, KIND_FULL } from './missiles.js?v=20260929d';
import { WORLD, SUN_DIR, TOWNS, AIRFIELD, terrainH, airfieldH, buildWorld, makeParticles, radialTex, lin, WEATHERS, pickWeather, FX_LAYER, FX_ADD_LAYER, FXU } from './world.js?v=20260929d';
import { STATIONS, stationPos, buildShipGeo, buildElevon, buildMissileGeo, buildJet, buildTanker, TANKER_DROGUE, JET_SPECS, M as Mx, part, mergeParts } from './models.js?v=20260929d';
import { createPipeline } from './post.js?v=20260929d';
import { createAudio } from './audio.js?v=20260929d';
import { AC, RADAR, createBattle } from './sim/battle.js?v=20260929d';
import { MODES, FUEL_START, FUEL_MAX, FUEL_PICKUP, DRONE } from './sim/modes.js?v=20260929d';
import { TEAM_NAMES } from './sim/online.js?v=20260929d';
import { createOnline } from './online-client.js?v=20260929d';
import { clamp, wrapPI, D2R, G0, rhoAt, makeCraft, fwdOf, rightOf, localAngles, angleBetween, agl, localAz, flyStep, steerTo,
  seekerHeat, offTailDeg, irCanSee, isNotched, dlz, closingOf, turnToward, segHitsSphere } from './sim/core.js?v=20260929d';

// ═════════════ Параметры и режимы ═════════════
const Q = new URLSearchParams(location.search);
const TRAINING = Q.get('mode') === 'training';
const TEST = Q.get('test') === '1'; // отладочный хук window.__g — только вместе с mode=training
const SEED = ((parseInt(Q.get('seed'), 10) || Math.floor(Math.random() * 2147483646) + 1) >>> 0);
// тест (только ?mode=training&test=1): touch=1 — сенсорный интерфейс на ПК, insets=t,r,b,l,tg — эмуляция выреза и кнопок Telegram
const IS_TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window || (TEST && TRAINING && Q.get('touch') === '1');
const TEST_INSETS = TEST && TRAINING && Q.get('insets') ? Q.get('insets').split(',').map((v) => +v || 0) : null;
const IOS = /iPhone|iPod/.test(navigator.userAgent || '');
const $ = (id) => document.getElementById(id);
const rnd = Math.random; // визуальная и тактическая случайность — не влияет на расписание
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* хранилище недоступно */ } },
};

const MAX_LOAD = 1500;
const STATION_KIND = { tip: { name: 'законцовка', lim: 110 }, mid: { name: 'средний', lim: 200 }, inner: { name: 'корневой', lim: 360 }, belly: { name: 'подфюзеляжный', lim: 500 } };
const DEFAULT_LOADOUT = ['aim9l', 'aim120c', null, null, null, null, 'aim120c', 'aim9l'];

// ═════════════ Пресеты графики ═════════════
// perf — настройки производительности по умолчанию для пресета (игрок может поменять в «Настройках»):
//   scale — масштаб рендера, dyn — динамическое разрешение, min — нижняя граница масштаба, target — цель к/с,
//   up — апскейлер ('off' | 'cas' | 'fsr'), sharp — резкость, aa — сглаживание ('off' | 'fxaa' | 'msaa').
// post — эффекты кадра (свечение, лучи, цветокоррекция); у «Низкого» конвейера нет вовсе — самый дешёвый путь.
// rainDrops — капель вокруг камеры в ливень, cirrus — высокие перистые облака в ясную погоду.
const PRESETS = {
  low:    { name: 'Низкий',  desc: 'слабые телефоны', prMul: 0.8, prCap: 1, terrainSeg: 16, trees: 800, treeDist: 6000, treeHi: 900, propsLvl: 0, treeCell: 5000, bldPerTown: 22, clouds: 14, cloudPuffs: 5, particles: 1000, rainDrops: 700,
    pbr: false, shadows: false, windows: false, detail: false, contrails: false,
    perf: { scale: 1, dyn: true, min: 0.55, target: 60, up: 'off', sharp: 0.4, aa: 'off' } },
  medium: { name: 'Средний', desc: 'большинство устройств', prMul: 1, prCap: 1.5, terrainSeg: 32, trees: 3000, treeDist: 9000, treeHi: 1500, propsLvl: 1, treeCell: 3500, bldPerTown: 40, clouds: 26, cloudPuffs: 8, particles: 2200, rainDrops: 1600,
    pbr: true, shadows: false, windows: true, detail: true, cloudShadows: true, contrails: true,
    perf: { scale: 1, dyn: true, min: 0.6, target: 60, up: 'cas', sharp: 0.45, aa: 'fxaa' } }, // без эффектов кадра — облегчённый 8-битный конвейер
  high:   { name: 'Высокий', desc: 'мощные ПК и планшеты', prMul: 1, prCap: 2, terrainSeg: 48, trees: 8000, treeDist: 12000, treeHi: 2200, propsLvl: 2, bldPerTown: 65, clouds: 40, cloudPuffs: 9, particles: 4000, rainDrops: 3000, cirrus: true,
    pbr: true, shadows: true, windows: true, detail: true, cloudShadows: true, cloudSprites: true, treeVariety: true, contrails: true, waterAnim: true,
    perf: { scale: 1, dyn: true, min: 0.67, target: 60, up: 'cas', sharp: 0.4, aa: 'msaa' }, post: { bloom: 0.35, grade: 0.15, vignette: 0.12 } },
  // топовые: HDR-конвейер, свечение, тени 4K с широким охватом, PBR-земля с микрорельефом, лучи от солнца («Кино»)
  ultra:  { name: 'Ультра', desc: 'HDR-свечение, PBR-земля, тени 4K', prMul: 1, prCap: 2, terrainSeg: 64, trees: 15000, treeDist: 16000, treeHi: 2800, propsLvl: 2, waterPBR: true, bldPerTown: 80, clouds: 55, cloudPuffs: 12, particles: 6000, rainDrops: 4500, cirrus: true,
    pbr: true, shadows: true, shadowMap: 4096, shadowBox: 400, windows: true, detail: true, terrainPBR: true, cloudShadows: true, cloudSprites: true, treeVariety: true, contrails: true, waterAnim: true, flares: true, lights: true,
    perf: { scale: 1, dyn: true, min: 0.67, target: 60, up: 'fsr', sharp: 0.35, aa: 'msaa' }, post: { bloom: 0.75, vignette: 0.22, grade: 0.25, exposure: 0.95 } },
  cinema: { name: 'Кино', desc: 'самая подробная земля и лес, лучи, отражения', prMul: 1, prCap: 2.5, terrainSeg: 96, trees: 22000, treeDist: 20000, treeHi: 3500, propsLvl: 3, waterPBR: true, lodD: [2600, 7000, 14000], bldPerTown: 90, clouds: 70, cloudPuffs: 13, particles: 8000, rainDrops: 6000, cirrus: true,
    pbr: true, shadows: true, shadowMap: 4096, shadowBox: 450, windows: true, detail: true, terrainPBR: true, cloudShadows: true, cloudSprites: true, treeVariety: true, contrails: true, waterAnim: true, flares: true, lights: true,
    perf: { scale: 0.85, dyn: true, min: 0.67, target: 60, up: 'fsr', sharp: 0.45, aa: 'msaa' },
    post: { bloom: 0.85, vignette: 0.18, grade: 0.7, threshold: 0.85, rays: true, raysK: 0.55, exposure: 1.0 } }, // без зерна и аберраций — чистая картинка
};
let gfxKey = store.get('fortuna_drone_gfx');
if (!PRESETS[gfxKey]) gfxKey = IS_TOUCH ? 'low' : 'medium';
const P = PRESETS[gfxKey];
const DPR = window.devicePixelRatio || 1;
const prFor = (p) => Math.min(DPR * p.prMul, p.prCap, IS_TOUCH ? 2 : 3); // на телефоне больше 2× не видно глазом — только нагрев
// настройки производительности и экрана (сбрасываются к умолчаниям пресета при его смене)
const PERF_KEYS = ['scale', 'dyn', 'min', 'target', 'up', 'sharp', 'aa'];
let perf = { ...P.perf, cap: 0, p3: false, fps: false, immersive: true, halfFx: false, smartQ: false };
try {
  const sp = JSON.parse(store.get('fortuna_drone_perf') || 'null');
  if (sp && typeof sp === 'object') {
    for (const k of ['cap', 'p3', 'fps', 'immersive', 'halfFx', 'smartQ']) if (k in sp) perf[k] = sp[k];
    if (sp.preset === gfxKey) for (const k of PERF_KEYS) if (k in sp) perf[k] = sp[k];
  }
} catch (_) { /* по умолчанию */ }
const savePerf = () => store.set('fortuna_drone_perf', JSON.stringify({ ...perf, preset: gfxKey }));
const P3_OK = (() => { try { return matchMedia('(color-gamut: p3)').matches && 'drawingBufferColorSpace' in WebGL2RenderingContext.prototype; } catch (_) { return false; } })();

// ═════════════ Режимы игры ═════════════
// (MODES — в sim/modes.js: их же использует онлайн-сервер)
let modeKey = store.get('fortuna_drone_mode');
if (!MODES[modeKey] || (modeKey === 'training' && !TRAINING)) modeKey = 'arcade'; // в партии на награду обучение недоступно
let MODE = MODES[modeKey];

// ═════════════ Погода ═════════════
// Случайная на каждый вылет (по весам из WEATHERS) или выбранная в «Настройках». На расписание и счёт не влияет.
let weatherPref = store.get('fortuna_drone_weather');
if (weatherPref !== 'random' && !WEATHERS[weatherPref]) weatherPref = 'random';
let weatherKey = weatherPref === 'random' ? pickWeather() : weatherPref;

// ═════════════ Рендер, сцена, мир ═════════════
// Линейный цвет: материалы считают свет в линейном пространстве, на выходе — ACES + sRGB.
// Без конвейера это делает сам renderer; с конвейером (post.js) — композит-шейдер.
const canvas = $('c');
// Глубина — обычная 24-битная (не логарифмическая): запись gl_FragDepth отключала бы на мобильных GPU отсечение
// скрытых пикселей до шейдера (Apple HSR, early-Z) — а это самая дешёвая оптимизация перекрытий. Точности хватает
// благодаря ближней плоскости 3 м (камера всегда ≥ 20 м от дрона).
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = !!P.shadows; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
if (perf.p3 && P3_OK) { try { renderer.getContext().drawingBufferColorSpace = 'display-p3'; } catch (_) { perf.p3 = false; } }
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(65, 1, 3, 60000);
camera.rotation.order = 'YXZ';
let VW = 1, VH = 1, pipe = null;
let hc = null, hx = null, hcR = 1; // HUD-холст (раздел «HUD»)
const basePR = prFor(P);
// конвейер нужен, если есть эффекты кадра, сглаживание, апскейлер или широкий цвет
function needPipe() { return !!P.post || perf.aa !== 'off' || perf.up !== 'off' || (perf.p3 && P3_OK); }
// облегчённый конвейер (8 бит, тонмаппинг в материалах): когда нет эффектов кадра и широкого цвета
const pipeLdr = () => !P.post && !(perf.p3 && P3_OK);
let weatherExp = 1;
function baseExposure() { return ((P.post && P.post.exposure) || 1.15) * weatherExp; }
function applyExposure() { if (pipe && !pipe.cfg.ldr) pipe.setExposure(baseExposure()); else renderer.toneMappingExposure = baseExposure(); }
function rebuildPipe() {
  if (pipe) { pipe.dispose(); pipe = null; }
  if (needPipe()) {
    const pc = P.post || {}, ldr = pipeLdr();
    pipe = createPipeline(renderer, { ...pc, ldr, fx: perf.halfFx, fxU: FXU, fxLayer: FX_LAYER, fxAddLayer: FX_ADD_LAYER, exposure: baseExposure(), scale: perf.dyn ? dr.scale : perf.scale, upscaler: perf.up, sharp: perf.sharp, aa: perf.aa, p3: perf.p3 && P3_OK });
    renderer.toneMapping = ldr ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping; // HDR: тонмаппинг и гамму делает композит
    renderer.setPixelRatio(basePR);
  } else {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.setPixelRatio(basePR * (perf.dyn ? dr.scale : perf.scale));
  }
  applyExposure();
  scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; }); // смена тонмаппинга — пересборка шейдеров
  resize();
  applyFxLayers();
}
// облака, облачный слой и дым — в отдельный проход конвейера в половине разрешения (если опция включена и конвейер её поддерживает)
let fxReady = false;
function applyFxLayers() {
  if (!fxReady) return;
  const on = !!(pipe && pipe.fx);
  world.setFxLayer(on); SMOKE.points.layers.set(on ? FX_LAYER : 0); FX.points.layers.set(on ? FX_ADD_LAYER : 0);
  if (!on) { FXU.fxOn.value = 0; FXU.tDepth.value = null; }
}
// Динамическое разрешение и счётчик кадров. Раз в 0,5 с: частота кадров, «худшие 5 %» кадров и решение по масштабу.
// Частота кадров не может быть выше частоты экрана (vs — период развёртки, меряется при загрузке), поэтому:
//  • цель — не быстрее экрана (цель 120 на 60-Гц экране больше не «топит» разрешение до минимума);
//  • запас мощности при упоре в частоту экрана не виден — масштаб осторожно пробует подняться раз в 2 с,
//    а если после подъёма кадры просели — возвращается и 10 с не пробует снова (раньше он только падал).
const REFRESH = [1000 / 144, 1000 / 120, 1000 / 90, 1000 / 75, 1000 / 60, 1000 / 30];
const snapPeriod = (ms) => REFRESH.find((p) => Math.abs(ms - p) < p * 0.12) || 0;
const dr = { scale: perf.scale, win: [], t: 0, fps: 0, low: 0, vs: 0, calm: 0, hold: 0, justUp: 0, q: 0 };
// «умное» качество: уровни детализации (дальность подробного леса и рельефа), которые снижаются раньше разрешения
const QK = [1, 0.8, 0.65, 0.5];
function setQ(q) { dr.q = q; world.setDetail(QK[q]); }
function drReset() { dr.win.length = 0; dr.t = 0; }
function drUpdate(ms) {
  dr.win.push(ms); dr.t += ms;
  if (dr.t < 500) return;
  const w = dr.win.slice().sort((a, b) => a - b), n = w.length, avg = dr.t / n;
  dr.fps = 1000 / avg; dr.low = 1000 / w[Math.min(n - 1, Math.floor(n * 0.95))];
  const q = snapPeriod(w[Math.floor(n * 0.25)]); if (q && (!dr.vs || q < dr.vs - 0.5)) dr.vs = q; // экран оказался быстрее, чем думали
  drReset();
  if (!perf.dyn) return;
  const goal = Math.max(1000 / (perf.cap || perf.target), dr.vs * 0.98);
  let s = dr.scale;
  if (dr.hold > 0) dr.hold--;
  if (avg > goal * 1.1) {
    // сначала — детализация (глазу почти незаметно), и только потом разрешение (картинка мягче)
    if (perf.smartQ && dr.q < QK.length - 1) setQ(dr.q + 1); else s -= avg > goal * 1.5 ? 0.1 : 0.05;
    dr.calm = 0;
    if (dr.justUp > 0) dr.hold = 20; // только что поднимали — не хватило мощности, 10 с не пробуем
  } else if (avg < goal * 1.04) {
    // возврат в обратном порядке: сначала чёткость, потом детализация
    if (++dr.calm >= 4 && dr.hold <= 0) {
      if (s < perf.scale) { s += 0.04; dr.calm = 0; dr.justUp = 3; }
      else if (dr.q > 0) { setQ(dr.q - 1); dr.calm = 0; dr.justUp = 3; }
    }
  } else dr.calm = 0;
  if (dr.justUp > 0) dr.justUp--;
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
  applySafeArea(); hudCanvasSize();
}
window.addEventListener('resize', resize);

// ═════════════ Безопасные зоны экрана и Telegram ═════════════
// Игра живёт во фрейме сайта, а внутри фрейма env(safe-area-inset-*) всегда 0. Поэтому отступы берём
// у страницы-родителя и у Telegram Mini App (кнопки «Закрыть» и «⋯» в полноэкранном режиме лежат поверх
// страницы — contentSafeAreaInset), и отдаём в CSS переменными --sa-* и --tg-t.
const TG = (() => {
  try {
    const w = window.parent !== window ? window.parent : window, T = w.Telegram && w.Telegram.WebApp;
    return { W: T && T.platform && T.platform !== 'unknown' ? T : null, proxy: !!w.TelegramWebviewProxy };
  } catch (_) { return { W: null, proxy: false }; }
})();
const tgv = (v) => { try { return !!(TG.W && TG.W.isVersionAtLeast && TG.W.isVersionAtLeast(v)); } catch (_) { return false; } };
function envInsets(win) {
  try {
    const d = win.document.createElement('div');
    d.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    win.document.body.appendChild(d); const cs = win.getComputedStyle(d);
    const r = [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map((v) => parseFloat(v) || 0); d.remove(); return r;
  } catch (_) { return [0, 0, 0, 0]; }
}
function applySafeArea() {
  const ins = envInsets(window);
  if (window.parent !== window) envInsets(window.parent).forEach((v, i) => { ins[i] = Math.max(ins[i], v); });
  let tg = 0;
  if (TG.W) {
    const a = TG.W.safeAreaInset || {}, c = TG.W.contentSafeAreaInset || {};
    ins[0] = Math.max(ins[0], a.top || 0); ins[1] = Math.max(ins[1], a.right || 0); ins[2] = Math.max(ins[2], a.bottom || 0); ins[3] = Math.max(ins[3], a.left || 0);
    tg = c.top || (TG.W.isFullscreen ? 46 : 0);
  } else if (TG.proxy && IS_TOUCH && Math.abs(window.innerHeight - (screen.height < screen.width === window.innerHeight < window.innerWidth ? screen.height : screen.width)) < 4) {
    tg = 46; // Telegram без данных API, но страница во весь экран — значит, его кнопки поверх
  }
  if (TEST_INSETS) { for (let i = 0; i < 4; i++) ins[i] = TEST_INSETS[i] || 0; tg = TEST_INSETS[4] || 0; }
  const st = document.documentElement.style;
  ['t', 'r', 'b', 'l'].forEach((k, i) => st.setProperty('--sa-' + k, Math.round(ins[i]) + 'px'));
  st.setProperty('--tg-t', Math.round(tg) + 'px');
  document.body.classList.toggle('tgfs', tg > 0);
}
if (TG.W) {
  const onTg = () => applySafeArea();
  for (const ev of ['safeAreaChanged', 'contentSafeAreaChanged', 'fullscreenChanged', 'viewportChanged']) try { TG.W.onEvent(ev, onTg); } catch (_) { /* старый клиент */ }
  window.addEventListener('pagehide', () => { for (const ev of ['safeAreaChanged', 'contentSafeAreaChanged', 'fullscreenChanged', 'viewportChanged']) try { TG.W.offEvent(ev, onTg); } catch (_) { /* нет */ } });
}
// Во время вылета: свайп вниз не сворачивает мини-приложение (им рулят!), закрытие — с подтверждением;
// в режиме погружения — ещё полный экран Telegram и фиксация ориентации.
const tgState = { fs: false };
function tgFlight(on, screenToo = true) {
  const T = TG.W; if (!T) return;
  try {
    if (tgv('7.7')) on ? T.disableVerticalSwipes() : T.enableVerticalSwipes();
    if (tgv('6.2')) on ? T.enableClosingConfirmation() : T.disableClosingConfirmation();
    if (tgv('8.0') && screenToo) {
      if (on && perf.immersive) { if (!T.isFullscreen) { tgState.fs = true; T.requestFullscreen(); } if (IS_TOUCH) T.lockOrientation(); }
      if (!on) { T.unlockOrientation(); if (tgState.fs) { tgState.fs = false; T.exitFullscreen(); } }
    }
  } catch (_) { /* метод недоступен в этой версии Telegram */ }
}
rebuildPipe();
const world = buildWorld(scene, P, SEED, renderer, weatherKey);
weatherExp = world.W.exposure || 1; applyExposure();
const buildings = world.buildings;
const boomLight = new THREE.PointLight(lin(0xffa040), 0, 600, 2); scene.add(boomLight);

const dotTex = radialTex([[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,255,255,.6)'], [1, 'rgba(255,255,255,0)']], 64);
const smokeTex = radialTex([[0, 'rgba(255,255,255,.9)'], [0.55, 'rgba(255,255,255,.45)'], [1, 'rgba(255,255,255,0)']], 64);
const SMOKE = makeParticles(scene, P.particles, false, smokeTex);
const FX = makeParticles(scene, Math.round(P.particles * 0.7), true, dotTex);
fxReady = true; applyFxLayers();
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
const hitMarks = []; // маркеры попаданий рисует HUD-холст
// свет: форсаж подсвечивает дрон, горящие ракеты — всё вокруг (только топовые пресеты: каждый источник дорог)
const abLight = P.lights ? new THREE.PointLight(lin(0xff8a3c), 0, 70, 2) : null;
if (abLight) { abLight.position.set(0, 0, 10); ship.add(abLight); }
const mslLights = P.lights ? [0, 1].map(() => { const l = new THREE.PointLight(lin(0xffb070), 0, 260, 2); scene.add(l); return l; }) : [];
function updateMissileLights() {
  if (!mslLights.length) return;
  // две ближайшие горящие ракеты — простым проходом, без новых массивов
  let a = null, b = null, da = 2500, db = 2500;
  for (const m of missiles) {
    if (m.dead || !m.fl || !m.fl.visible) continue;
    const d = m.pos.distanceTo(camera.position);
    if (d < da) { b = a; db = da; a = m; da = d; } else if (d < db) { b = m; db = d; }
  }
  [a, b].forEach((m, i) => { const l = mslLights[i]; if (m) { l.position.copy(m.pos); l.intensity = 4 * (0.8 + rnd() * 0.4); } else l.intensity = 0; });
}

// ═════════════ Летательные аппараты ═════════════
// «Изделие Фортуна-1»: беспилотник без лётчика — держит большую перегрузку, быстро отвечает на ручку, мощный двигатель.
const player = makeCraft({ isPlayer: true, hull: 100, fuel: FUEL_START, fuelMax: FUEL_MAX, ...DRONE, flares: 32, chaff: 32, heat: 0, overheated: false, invuln: 0 });
function applyMode() {
  MODE = MODES[modeKey];
  Object.assign(player, { gmax: MODE.gmax, wCap: MODE.wCap, agil: MODE.agil, vStall: MODE.vStall, bleed: MODE.bleed,
    flares: MODE.cm, chaff: MODE.cm, fuelMax: Math.round(FUEL_MAX * MODE.fuelK), fuel: Math.round(FUEL_START * MODE.fuelK) });
}
applyMode();
const enemies = [], wrecks = [], tankers = [];
player.human = true; player.team = 0;
const PLAYER_ARR = [player], NONE = [];
// бой (sim/battle.js): ракеты, ловушки, пушка, урон, ИИ — общий с онлайн-сервером; здесь — только эффекты, звук и HUD
const BFX = battleFx(); // хуки эффектов — их же зовёт онлайн для сетевых ракет и чужих ловушек
const B = createBattle({
  mode: () => MODE,
  opponents: (o) => (o === player ? enemies : o.remote ? NONE : PLAYER_ARR), // пули чужих онлайн-самолётов — только трассеры
  targetable: (t) => !(t === player && G.over),
  canAct: () => G.state === 'play' && !MP.down,
  hurt: (t, amount) => (t === player ? hurt(amount) : t.remote ? MP.hitRemote(t) : undefined), // по живому сопернику урон считает сервер
  remoteCM: (o) => MP.on && o === player, // онлайн: свои ловушки только показываем, увод ракет и срыв захвата — на сервере
  sunDir: SUN_DIR, sunVis: () => world.W.sunVis,
  fx: BFX,
});
const { missiles, cms, bullets, updateMissile, detonate, dropCM, updateCMs, damage, fireBullet, updateBullets, spawnAI, updateAI } = B;
const TMP = new THREE.Vector3(), TMP2 = new THREE.Vector3(), TMP3 = new THREE.Vector3(), TGT = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
const NEG_Z = new THREE.Vector3(0, 0, -1), ZAXIS = new THREE.Vector3(0, 0, 1);


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
// Сенсорная «ручка»: чувствительность (радиус хода пальца), мёртвая зона, кривая отклика, инверсия тангажа
let touchCfg = { sens: 1, dead: 0.1, curve: 0.35, invert: false };
try { touchCfg = Object.assign(touchCfg, JSON.parse(store.get('fortuna_drone_touch') || '{}')); } catch (_) { /* по умолчанию */ }
const saveTouch = () => store.set('fortuna_drone_touch', JSON.stringify(touchCfg));
// кривая: 0 — линейная, 1 — «экспонента» (у центра точнее, у края — полный отклик)
const stickCurve = (v) => { const a = Math.abs(v); return Math.sign(v) * (a * (1 - touchCfg.curve) + a * a * a * touchCfg.curve); };
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

$('wpn').addEventListener('pointerdown', (e) => {
  e.stopPropagation(); e.preventDefault();
  if (G.state !== 'play') return;
  cycleWeapon(); wpnT = 0; const w = $('wpn'); w.classList.remove('tap'); void w.offsetWidth; w.classList.add('tap'); // мгновенно обновить панель + вспышка
});
$('radar').addEventListener('pointerdown', (e) => { e.stopPropagation(); if (G.state === 'play') cycleRadarScale(); });
if (IS_TOUCH) {
  document.body.classList.add('coarse');
  const zone = $('stickZone'), base = $('stickBase'), knob = $('stickKnob');
  let sid = null, ox = 0, oy = 0, R = 60;
  zone.addEventListener('pointerdown', (e) => {
    if (sid !== null) return; sid = e.pointerId; zone.setPointerCapture(sid);
    R = Math.round(60 / clamp(touchCfg.sens, 0.4, 2.5)); // выше чувствительность — короче ход пальца до полного отклонения
    base.style.width = base.style.height = 2 * R + 'px'; base.style.margin = `${-R}px 0 0 ${-R}px`;
    ox = e.clientX; oy = e.clientY; base.style.display = 'block'; base.style.left = ox + 'px'; base.style.top = oy + 'px'; knob.style.transform = 'translate(0,0)';
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== sid) return;
    let dx = e.clientX - ox, dy = e.clientY - oy; const l = Math.hypot(dx, dy);
    if (l > R) { dx *= R / l; dy *= R / l; }
    knob.style.transform = `translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px)`;
    input.sx = clamp(stickCurve(deadzone(dx / R, touchCfg.dead)), -1, 1);
    input.sy = clamp(stickCurve(deadzone(-dy / R, touchCfg.dead)), -1, 1) * (touchCfg.invert ? -1 : 1);
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

// ═════════════ Звук ═════════════
// Синтез — в audio.js (реактивный двигатель, объёмные голоса, взрывы, окружение). Здесь — привязка к игре.
const AU = createAudio();
let muted = store.get('fortuna_drone_mute') === '1';
let soundVol = clamp(+(store.get('fortuna_drone_vol') || 0.9), 0, 1);
AU.setMuted(muted); AU.setVolume(soundVol);
const tone = (freq, dur, type, vol, slide) => AU.beep(freq, dur, type, vol, slide);
const sfx = {
  boom: (d, size) => AU.explosion(d, size), hit: () => AU.hit(), pick: () => AU.chime(), warn: () => tone(300, 0.15, 'square', 0.045),
  launch: () => AU.launch(), lock: () => { tone(1250, 0.06, 'square', 0.045); setTimeout(() => tone(1250, 0.06, 'square', 0.045), 90); },
  lost: () => tone(420, 0.2, 'square', 0.035, -200),
};
function silenceLoops() { AU.silence(); }
// звук включается первым же касанием/кликом (браузеры не дают играть звук до жеста) — в том числе в лобби
function unlockAudio() { AU.init(); AU.resume(); }
window.addEventListener('pointerdown', unlockAudio, true); window.addEventListener('keydown', unlockAudio, true);
function setMute(m) { muted = m; store.set('fortuna_drone_mute', m ? '1' : '0'); AU.setMuted(m); $('mute').style.opacity = m ? 0.4 : 1; const c = $('sMute'); if (c) c.checked = m; }
$('mute').addEventListener('click', () => setMute(!muted));
$('mute').style.opacity = muted ? 0.4 : 1;


// ═════════════ Радар игрока ═════════════
const RSCALES = [10000, 20000, 40000];
const radar = { contacts: new Map(), lock: null, lostT: 0, scanT: 0, t: 0, scale: 1 };
player.radar = radar;
function radarSees(e) { return B.radarSees(player, e); }
function updateRadar(dt) { B.updateRadar(player, dt); }
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
function launchMissile(owner, key, target, mesh) { return B.launchMissile(owner, key, target, mesh ? { mesh } : null); }
function launchPlayerMissile() {
  if (G.state !== 'play' || G.mslT > 0 || MP.down) return;
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
  if (MP.on) { MP.launch(selType, tgt, pi); G.mslT = 0.45; return; } // онлайн: пуск проверяет и ведёт сервер, ракета придёт событием
  const mesh = pylonMeshes[pi]; pylonMeshes[pi] = null; loaded[pi] = null;
  launchMissile(player, selType, tgt, mesh);
  rebuildLoadStats();
  G.mslT = 0.45; ensureSel();
}
function rebuildLoadStats() { const mass = loadMass(loaded); player.massK = 1 + mass / 6000; player.dragK = 1 + 0.03 * loaded.filter(Boolean).length; }
// ═════════════ Урон, сбитие, обломки ═════════════
// сбит самолёт ИИ (sim/battle.js уже пометил его dead): взрыв, очки, лента, обломки
function onKilled(e, by, msl) {
  explosion(e.pos, e.type === 'boss' ? 7 : 3.2);
  sfx.boom(e.pos.distanceTo(camera.position), e.type === 'boss' ? 5 : 3);
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
function hurtFx(amount) {
  G.shake = Math.min(1.2, 0.4 + amount / 60);
  $('flash').style.transition = 'none'; $('flash').style.opacity = Math.min(0.6, 0.2 + amount / 100);
  requestAnimationFrame(() => { $('flash').style.transition = 'opacity .6s'; $('flash').style.opacity = 0; });
  sfx.hit();
}
function hurt(amount) {
  if (MP.on) { if (!MP.down && G.state === 'play' && player.invuln <= 0) { MP.selfDamage(amount); player.invuln = 0.3; } return; } // корпус в онлайне ведёт сервер
  if (G.god || player.invuln > 0 || G.over) return;
  player.hull -= amount; player.invuln = 0.3;
  hurtFx(amount);
  if (player.hull <= 0) {
    if (MODE.training) { player.hull = 100; popup('В бою вы были бы сбиты — корпус восстановлен', 'bad'); return; }
    player.hull = 0; endGame('hull');
  }
}

// ═════════════ Пушка (общая) ═════════════
const bulletGeo = new THREE.BoxGeometry(0.3, 0.3, 14);
const bulletMat = new THREE.MeshBasicMaterial({ color: lin(0xffe9a0).multiplyScalar(4), fog: false }), bulletMatE = new THREE.MeshBasicMaterial({ color: lin(0xff8a6a).multiplyScalar(4), fog: false });
for (const b of bullets) { const m = new THREE.Mesh(bulletGeo, bulletMat); m.visible = false; scene.add(m); b.mesh = m; b.pos = m.position; } // пули боя двигают свои модели напрямую
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
// ═════════════ ИИ «Подстилки улитки» ═════════════
// самолёт ИИ появился в бою (sim/battle.js): модель, пламя, ракеты на пилонах
function onSpawned(e) {
  const type = e.type, J = jetGeo(type);
  const g = new THREE.Group(); g.rotation.order = 'YXZ';
  const mesh = new THREE.Mesh(J.geo, MAT_JET); mesh.castShadow = !!P.shadows; g.add(mesh);
  const flames = J.nozzles.map((nz) => { const f = new THREE.Mesh(flameGeo, flameMat); f.position.copy(nz); f.scale.set(type === 'boss' ? 1.8 : 1.1, type === 'boss' ? 1.8 : 1.1, 2); g.add(f); return f; });
  e.msl.forEach((x, i) => { if (!x) return; const mm = missileMesh(x.key); mm.position.copy(J.stations[i]); mm.position.y -= MISSILES[x.key].vis.r; g.add(mm); x.mesh = mm; });
  scene.add(g);
  e.group = g; e.flames = flames;
  enemies.push(e);
}
// эффекты и звук боя: sim/battle.js зовёт их там, где раньше стоял этот код (порядок случайных чисел не изменился)
function battleFx() {
  return {
    launchPos(owner, key, slot, out) { // ракета стартует с пилона: берём её модель и мировое положение
      if (slot && slot.mesh) { const mesh = slot.mesh; mesh.updateMatrixWorld(true); mesh.getWorldPosition(out); slot.q = mesh.getWorldQuaternion(new THREE.Quaternion()); mesh.parent.remove(mesh); }
      else out.copy(owner.pos);
    },
    launched(m, slot) {
      const M_ = m.M, owner = m.owner, mesh = (slot && slot.mesh) || missileMesh(m.key);
      mesh.position.copy(m.pos); if (slot && slot.q) mesh.quaternion.copy(slot.q); scene.add(mesh);
      const fl = new THREE.Mesh(mslFlameGeo, flameMat); fl.position.z = M_.vis.L / 2 + 0.05; fl.visible = false; mesh.add(fl);
      m.mesh = mesh; m.fl = fl; m.pos = mesh.position; // ракета двигает свою модель напрямую
      const wpos = m.pos;
      // вспышка запуска двигателя и облачко дыма у пилона
      for (let k = 0; k < 18; k++) { const [vx, vy, vz] = sph(25); FX.emit(wpos.x, wpos.y, wpos.z, vx + owner.vel.x * 0.9, vy + owner.vel.y * 0.9, vz + owner.vel.z * 0.9, 1, 0.85, 0.5, 1, 1.6, 3, 0.25, 2, 0); }
      for (let k = 0; k < 6; k++) { const [vx, vy, vz] = sph(8); SMOKE.emit(wpos.x, wpos.y, wpos.z, vx + owner.vel.x * 0.7, vy + owner.vel.y * 0.7, vz + owner.vel.z * 0.7, 0.85, 0.85, 0.85, 0.55, 2, 6, 1.8, 1.2, 0); }
      if (owner === player) { G.mFired++; sfx.launch(); popup(M_.short + ' — ПУСК', 'info'); }
    },
    motor(m, motor, tb) { m.fl.visible = motor; if (motor) m.fl.scale.set(1, 1, (m.M.sustain && tb > m.M.burn ? 0.5 : 1) * (0.8 + rnd() * 0.5)); },
    trail(m, tb) {
      SMOKE.emit(m.pos.x, m.pos.y, m.pos.z, (rnd() - 0.5) * 3, (rnd() - 0.5) * 3 + 1, (rnd() - 0.5) * 3, 0.9, 0.9, 0.9, m.M.sustain && tb > m.M.burn ? 0.18 : 0.55, 2.2, 6, 3.5, 0.5, 0.3);
      FX.emit(m.pos.x - m.dir.x * 3, m.pos.y - m.dir.y * 3, m.pos.z - m.dir.z * 3, 0, 0, 0, 1, 0.7, 0.3, 0.9, 2.2, -3, 0.08, 0, 0);
    },
    pitbull(m) { if (m.owner === player) tone(1600, 0.05, 'square', 0.02); },
    detonated(m, dealDamage) {
      scene.remove(m.mesh);
      explosion(m.pos, dealDamage ? 2.2 : 1.1);
      sfx.boom(m.pos.distanceTo(camera.position), dealDamage ? 1.4 : 0.7);
    },
    missileResult(m, hit) { if (hit && m.owner === player) G.mHits++; if (!hit && m.target === player) G.evaded++; },
    cmEmpty(o, type) { if (G.cmT <= 0) { popup(type === 'flare' ? 'ЛТЦ КОНЧИЛИСЬ' : 'ДИПОЛИ КОНЧИЛИСЬ', 'bad'); G.cmT = 0.5; } },
    cmDrop(o, type) { if (type === 'flare') AU.flare(); else AU.chaff(); if (MP.on && o === player) MP.cm(type); },
    lockBroken() { popup('ЗАХВАТ СОРВАН ДИПОЛЯМИ', 'bad'); sfx.lost(); },
    cm(c) {
      if (c.type === 'flare') {
        FX.emit(c.pos.x, c.pos.y, c.pos.z, 0, 0, 0, 1, 0.95, 0.75, 1, 5, -3, 0.12, 0, 0);
        if (rnd() < 0.6) SMOKE.emit(c.pos.x, c.pos.y, c.pos.z, 0, 1, 0, 0.9, 0.9, 0.9, 0.5, 2, 5, 1.8, 0.3, 0);
      } else if (rnd() < 0.5) FX.emit(c.pos.x + (rnd() - 0.5) * 12, c.pos.y + (rnd() - 0.5) * 12, c.pos.z + (rnd() - 0.5) * 12, 0, -1, 0, 0.8, 0.85, 0.9, 0.6, 1.4, 0, 0.4, 0, 0);
    },
    hit(e, amount, by) { if (by !== 'ЗЕМЛЯ' && by !== 'ТАРАН') hitMarks.push({ pos: e.pos.clone(), t: 0.35, big: amount > 40 }); }, // маркер попадания
    killed: onKilled,
    shot(b) {
      b.mesh.visible = true; b.mesh.material = b.owner === player ? bulletMat : bulletMatE;
      b.mesh.quaternion.setFromUnitVectors(ZAXIS, TMP.copy(b.vel).normalize());
      if (b.owner === player) G.shots++;
      FX.emit(b.pos.x, b.pos.y, b.pos.z, 0, 0, 0, 1, 0.8, 0.4, 1, 2.2, 0, 0.05, 0, 0);
    },
    bulletHit(b, e) { if (b.owner === player) G.hits++; FX.emit(e.pos.x, e.pos.y, e.pos.z, 0, 0, 0, 1, 0.9, 0.5, 1, 3, 0, 0.15, 0, 0); },
    bulletOff(b) { b.mesh.visible = false; },
    spawned: onSpawned,
    aiVisual(e) {
      e.group.position.copy(e.pos); e.group.rotation.set(e.pitch, e.yaw, e.roll);
      for (const f of e.flames) { f.visible = e.ab || e.type === 'boss'; f.scale.z = (e.ab ? 4.5 : 1.5) * (0.85 + rnd() * 0.3); }
      if (P.contrails && e.pos.y > 7000 && rnd() < 0.5) SMOKE.emit(e.pos.x, e.pos.y, e.pos.z, 0, 0, 0, 0.95, 0.96, 1, 0.35, 4, 5, 6, 0, 0);
      if (e.type === 'boss') $('bossFill').style.width = Math.max(0, e.hp / e.S.hp * 100) + '%';
    },
    radarLost() { popup('ЗАХВАТ ПОТЕРЯН', 'bad'); sfx.lost(); },
  };
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
  if (p.ab && !wasAB) { G.kick = 1; AU.afterburner(); } // включение форсажа — толчок
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
  else if (p.sup && mach < 0.97) { p.sup = false; AU.subsonic(); popup('ДОЗВУК', 'info'); }
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
  AU.boom(0.34);
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
// записи СПО берутся из пулов и переиспользуются (раньше каждый кадр создавались новые массивы и объекты)
const RWR_POOL = [], MAWS_POOL = [], INC_POOL = [];
const pooled = (pool, i) => pool[i] || (pool[i] = {});
const byDist = (a, b) => a.d - b.d;
function updateRwr(dt) {
  const out = rwr.list, maws = rwr.maws, inc = rwr.inc; out.length = 0; maws.length = 0; inc.length = 0;
  for (const e of enemies) {
    if (e.dead) continue;
    const rel = TMP.copy(player.pos).sub(e.pos), d = rel.length();
    fwdOf(e, TMP2);
    if (angleBetween(TMP2, rel) > 65 * D2R || d > e.S.radarR * 1.5) continue; // СПО слышит РЛС дальше, чем она видит нас
    let launch = false;
    for (const m of missiles) if (!m.dead && m.owner === e && m.target === player && !m.lost && (m.M.kind === 'sarh' || (m.M.kind === 'arh' && !m.active && m.t < 4))) { launch = true; break; }
    const r = pooled(RWR_POOL, out.length); r.az = localAz(player, TMP.copy(e.pos).sub(player.pos)); r.d = d; r.code = e.S.code; r.mode = launch ? 'launch' : e.stt ? 'lock' : 'search'; r.e = e; r.m = null;
    out.push(r);
  }
  for (const m of missiles) {
    if (m.dead || m.owner === player || m.target !== player) continue;
    const d = m.pos.distanceTo(player.pos), az = localAz(player, TMP.copy(m.pos).sub(player.pos));
    if (m.M.kind === 'arh' && m.active && !m.lost) { const r = pooled(RWR_POOL, out.length); r.az = az; r.d = d; r.code = 'М'; r.mode = 'launch'; r.e = null; r.m = m; out.push(r); }
    const tb = m.t - m.M.drop, motor = tb >= 0 && (tb < m.M.burn || (m.M.sustain && tb < m.M.burn + m.M.sustain.t));
    m.mawSeen = motor && d < 9000; // УФ/ИК-датчик видит факел двигателя
    if (m.mawSeen) { const w = pooled(MAWS_POOL, maws.length); w.az = az; w.d = d; w.m = m; maws.push(w); }
  }
  // звук: новая РЛС — короткий сигнал, захват — прерывистый, пуск — частый
  let anyLaunch = maws.length > 0, anyLock = false;
  for (const t of out) { if (t.e && !rwr.known.has(t.e)) { rwr.known.add(t.e); tone(1700, 0.07, 'square', 0.03); } if (t.mode === 'launch') anyLaunch = true; else if (t.mode === 'lock') anyLock = true; }
  rwr.beepT -= dt;
  const worst = anyLaunch ? 'launch' : anyLock ? 'lock' : '';
  if (worst && rwr.beepT <= 0) { rwr.beepT = worst === 'launch' ? 0.12 : 0.45; tone(worst === 'launch' ? 1400 : 1000, 0.06, 'square', 0.035); }
  // в «Аркаде» на экране видны все ракеты, летящие в игрока (не только с работающим двигателем)
  for (const m of missiles) {
    if (m.dead || m.owner === player || m.target !== player || m.lost || m.decoy) continue;
    if (MODE.allMissiles || m.mawSeen || (m.M.kind === 'arh' && m.active)) { const w = pooled(INC_POOL, inc.length); w.m = m; w.d = m.pos.distanceTo(player.pos); w.az = localAz(player, TMP.copy(m.pos).sub(player.pos)); inc.push(w); }
  }
  // текст угрозы: откуда, как далеко и догоняет ли
  let txt = '';
  let lm = null, lk = null;
  for (const t of out) { if (t.mode === 'launch' && (!lm || t.d < lm.d)) lm = t; if (!lk && t.mode === 'lock') lk = t; }
  inc.sort(byDist); const near = inc[0];
  if (near) txt = VW < 760 // узкий экран: «РАКЕТА 6 ч · 5.4 км · +195 м/с · 28 с» — в одну-две строки, не на прицел
    ? `РАКЕТА ${clockOf(near.az)} ч · ${(near.d / 1000).toFixed(1)} км · ${near.m.closing !== undefined && near.m.closing < 15 ? 'НЕ ДОГОНЯЕТ' : '+' + Math.round(near.m.closing || 0) + ' м/с' + (near.m.closing > 15 && near.m.dPrev / near.m.closing < 60 ? ' · ' + Math.ceil(near.m.dPrev / near.m.closing) + ' с' : '')}`
    : `РАКЕТА! ${clockOf(near.az)} ч · ${(near.d / 1000).toFixed(1)} км · ${closingText(near.m)}`;
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
  kills: $('kills'), combo: $('combo'), score: $('score'), spd: $('spd'), alt: $('alt'), warn: $('warn'), wpn: $('wpn'), hdg: $('hdg'), clock: $('clock') };
let lastWarn = '';
function warn(t) { if (t !== lastWarn) { lastWarn = t; el.warn.textContent = t; el.warn.style.display = t ? 'block' : 'none'; if (t) sfx.warn(); } }
function popup(text, cls) {
  const d = document.createElement('div'); d.className = 'pop ' + (cls || ''); d.textContent = text; $('popups').appendChild(d);
  while ($('popups').children.length > 4) $('popups').firstChild.remove();
  setTimeout(() => d.remove(), 1400);
}
// экранные координаты без новых объектов: результат пишется в out (по умолчанию — общий)
const _v = new THREE.Vector3(), SCR = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, behind: false, nx: 0, ny: 0 }));
function toScreen(pos, out = SCR[0]) { _v.copy(pos).project(camera); out.x = (_v.x + 1) / 2 * VW; out.y = (1 - _v.y) / 2 * VH; out.behind = _v.z > 1; out.nx = _v.x; out.ny = _v.y; return out; }
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
  let next = null; for (let i = schedIdx; i < schedule.length; i++) if (schedule[i].type !== 'tanker') { next = schedule[i]; break; }
  const cmp = VW < 760; // узкий экран — короткие подписи
  if (MP.on) el.combo.textContent = `${TEAM_NAMES[0]} ${MP.score[0]} : ${MP.score[1]} ${TEAM_NAMES[1]} · вы — «${TEAM_NAMES[MP.team]}»`;
  else if (MODE.training) el.combo.textContent = `ОБУЧЕНИЕ · разобрано${cmp ? '' : ' ракет'}: ${TR.done}`;
  else el.combo.textContent = next ? `${cmp ? 'группа' : 'следующая группа'} через ${Math.max(0, Math.ceil(next.t - G.runTime))} с` : enemies.some((e) => !e.dead) ? '' : 'все группы отбиты';
  const mach = player.speed / (340 - player.pos.y * 0.004);
  el.spd.textContent = `${Math.round(player.speed * 3.6)} М${mach.toFixed(2)}${player.ab ? ' Ф' : ''}`;
  el.alt.textContent = `${Math.round(player.pos.y)} · ${player.n.toFixed(1)}g`;
  el.hdg.textContent = 'КУРС ' + String(Math.round(((-player.yaw / D2R) % 360 + 360) % 360)).padStart(3, '0') + '°';
  const left = MP.on ? MP.leftSec() : Math.max(0, H_CAP - G.runTime); el.clock.textContent = MODE.training ? 'ОБУЧЕНИЕ' : `${MODE.name.toUpperCase()} · ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
  el.spdBox.classList.toggle('sup', !!player.sup);
  drawRadar(); drawRwr();
  if (IS_TOUCH) placeThreat();
}
// На телефоне подсказка обучения встаёт в просвет между панелью ракет и СПО, а плашка угрозы — сразу под ней
let hintBox = '';
function placeThreat() {
  const th = $('threat'), h = $('hint');
  const hintOn = h.style.display === 'block', thOn = th.style.display !== 'none';
  if (!hintOn && !thOn) return;
  const key = VW + 'x' + VH;
  if (hintBox !== key) { // просвет между левой колонкой и СПО — пересчёт только при смене размера экрана
    hintBox = key;
    const l = $('wpn').parentNode.getBoundingClientRect().right + 8, r = $('rwr').getBoundingClientRect().left - 8;
    const fit = r - l > 180, x = fit ? ((l + r) / 2).toFixed(0) + 'px' : '', w = fit ? Math.min(360, r - l).toFixed(0) + 'px' : '';
    h.style.left = x; h.style.width = w; th.style.left = x; th.style.maxWidth = w;
  }
  if (!thOn) return;
  const top = hintOn ? Math.round(h.offsetTop + h.offsetHeight + 6) + 'px' : '';
  if (th._top !== top) { th._top = top; th.style.top = top; }
}
if (IS_TOUCH) { const tl = $('wpn').parentNode; if (tl) tl.appendChild($('ask')); } // «?» — под панелью ракет, слева
// ── Быстрая часть HUD — один прозрачный холст поверх кадра вместо 30 HTML-элементов, которые браузер каждый кадр
// двигал и заново собирал страницу: визир, упреждение, ИК-ГСН, метки целей/ракет/заправщиков, стрелки у края экрана,
// рамка захвата с анимацией, подпись захваченной цели, маркеры попаданий, виртуальный курсор мыши. Вид — как был.
hc = $('hudc'); hx = hc.getContext('2d');
function hudCanvasSize() { if (!hc) return; hcR = Math.min(2, window.devicePixelRatio || 1); const w = Math.round(VW * hcR), h = Math.round(VH * hcR); if (hc.width !== w || hc.height !== h) { hc.width = w; hc.height = h; } }
hudCanvasSize();
const HF = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
function hText(t, x, y, col, size = 10.5, align = 'left', base = 'middle') {
  hx.font = `700 ${size}px ${HF}`; hx.textAlign = align; hx.textBaseline = base;
  // мягкая тень, как у текста HUD в HTML (text-shadow 0 0 5px), а не жёсткая обводка
  hx.shadowColor = 'rgba(0,0,0,.9)'; hx.shadowBlur = 5 * hcR; hx.fillStyle = col; hx.fillText(t, x, y); hx.shadowBlur = 0;
}
function hRing(x, y, r, col, w = 2) { hx.beginPath(); hx.arc(x, y, r, 0, 6.2832); hx.lineWidth = w; hx.strokeStyle = col; hx.stroke(); }
// метка: kind — 'c' контакт РЛС, 'l' захват, 'v' визуальный контакт, 't' заправщик, 'm' ракета
function hMark(kind, x, y, label) {
  if (kind === 'c') { hx.save(); hx.translate(x, y); hx.rotate(0.7854); hx.lineWidth = 1.5; hx.strokeStyle = '#7CFF9B'; hx.strokeRect(-8, -8, 16, 16); hx.restore(); hText(label, x + 14, y, '#b8ffc8'); }
  else if (kind === 'l') { hx.shadowColor = 'rgba(255,80,80,.6)'; hx.shadowBlur = 8; hx.lineWidth = 2; hx.strokeStyle = '#ff5b5b'; hx.strokeRect(x - 18, y - 18, 36, 36); hx.shadowBlur = 0; hText(label, x + 22, y - 12, '#ffb4b4'); }
  else if (kind === 'v') { hRing(x, y, 6, 'rgba(255,255,255,.55)', 1.5); hText(label, x + 10, y, 'rgba(255,255,255,.7)'); }
  else if (kind === 't') { hRing(x, y, 8, '#fde047', 1.5); hText(label, x + 14, y, '#fde047'); }
  else if (kind === 'm') { hx.beginPath(); hx.arc(x, y, 7, 0, 6.2832); hx.fillStyle = 'rgba(255,60,60,.3)'; hx.fill(); hRing(x, y, 7, '#ff3b3b'); hText(label, x + 12, y, '#ff8a8a'); }
}
// стрелка у края экрана к цели вне кадра (или позади)
function hArrow(pos, col) {
  const s = toScreen(pos, SCR[3]); let x = s.nx, y = s.ny; if (s.behind) { x = -x; y = -y; }
  if (!s.behind && Math.abs(x) < 0.92 && Math.abs(y) < 0.9) return false;
  const k = Math.max(Math.abs(x), Math.abs(y)) || 1; x = clamp(x / k * 0.92, -0.92, 0.92); y = clamp(y / k * 0.86, -0.86, 0.86);
  const px = (x + 1) / 2 * VW, py = (1 - y) / 2 * VH, a = Math.atan2(px - VW / 2, VH / 2 - py);
  hx.save(); hx.translate(px, py); hx.rotate(a); hx.beginPath(); hx.moveTo(0, -10); hx.lineTo(8, 7); hx.lineTo(-8, 7); hx.closePath();
  hx.fillStyle = col; hx.fill(); hx.lineWidth = 1.5; hx.strokeStyle = 'rgba(0,0,0,.6)'; hx.stroke(); hx.restore(); return true;
}
function hudFast(dt, slow) {
  hx.setTransform(hcR, 0, 0, hcR, 0, 0); hx.clearRect(0, 0, VW, VH);
  // визир (кольцо и «крылья») и упреждение пушки
  fwdOf(player, TMP3);
  const bs = toScreen(TMP.copy(player.pos).addScaledVector(TMP3, 800), SCR[0]), bx = bs.x, by = bs.y;
  hRing(bx, by, 8, '#b8ffc8'); hx.fillStyle = '#b8ffc8'; hx.fillRect(bx - 29, by - 1, 12, 2); hx.fillRect(bx + 17, by - 1, 12, 2);
  if (gunTarget && !gunTarget.dead) {
    const d = gunTarget.pos.distanceTo(player.pos), s = toScreen(TMP.copy(gunTarget.pos).addScaledVector(gunTarget.vel, d / 1100), SCR[1]);
    if (!s.behind) { hRing(s.x, s.y, 7, '#fde68a'); hx.fillStyle = '#fde68a'; hx.fillRect(s.x - 1, s.y - 1, 2, 2); }
  }
  // ИК-ГСН
  const M_ = selType && MISSILES[selType];
  if (M_ && M_.kind === 'ir') {
    const t = seeker.target && !seeker.target.dead ? toScreen(seeker.target.pos, SCR[1]) : null, sx = t ? t.x : bx, sy = t ? t.y : by;
    if (seeker.locked) { if (Math.floor(radar.t * 8) % 2 === 0) { hx.shadowColor = 'rgba(255,80,80,.7)'; hx.shadowBlur = 10; hRing(sx, sy, 22, '#ff5b5b'); hx.shadowBlur = 0; } else hRing(sx, sy, 22, 'rgba(255,91,91,.35)'); }
    else hRing(sx, sy, 22, '#fbbf24');
  }
  { // «рычание» ИК-ГСН в наушнике: тише в поиске, громче и выше при захвате
    const on = M_ && M_.kind === 'ir' && G.state === 'play';
    AU.growl(on ? (seeker.locked ? 0.035 : seeker.target ? 0.02 : 0.01) * (0.6 + 0.4 * Math.sin(radar.t * (seeker.locked ? 40 : 18))) : 0, seeker.locked ? 1150 : seeker.target ? 700 : 380);
  }
  // метки: контакты РЛС (захваченный — с подписью), визуальные контакты, ракеты, заправщики
  let n = 0; dlzCache = null;
  const MAXM = 22;
  for (const [e, c] of radar.contacts) {
    if (n >= MAXM - 8) break;
    if (e.dead || c.jam) continue;
    const s = toScreen(e.pos, SCR[1]), d = e.pos.distanceTo(player.pos);
    if (e === radar.lock) {
      if (s.behind) { if (hArrow(e.pos, '#ff5b5b')) n++; continue; }
      hMark('l', s.x, s.y, km(d)); n++;
      const vc = Math.round(closingOf(e, player.pos) * 3.6 + player.speed * 3.6 * Math.cos(angleBetween(TMP3, TMP.copy(e.pos).sub(player.pos))));
      const l1 = `${e.S.name} · Vсбл ${vc} км/ч`; let l2 = '', c2 = '#86efac';
      if (M_) {
        dlzCache = dlz(M_, player.pos.y, player.speed, closingOf(e, player.pos));
        const st = d < M_.rmin ? ['БЛИЗКО', '#fca5a5'] : d < dlzCache.rne ? ['НЕИЗБЕЖНАЯ ЗОНА', '#4ade80'] : d < dlzCache.rmax ? ['ПУСК РАЗРЕШЁН', '#86efac'] : ['ДАЛЕКО', '#fde68a'];
        l2 = `${M_.short}: ${st[0]} (макс ${km(dlzCache.rmax)})`; c2 = st[1];
      }
      // подпись справа от цели, а если не влезает — слева
      hx.font = `700 11px ${HF}`; const w = Math.max(hx.measureText(l1).width, l2 ? hx.measureText(l2).width : 0);
      const right = s.x + 24 + w <= VW - 4, lx = right ? Math.max(4, s.x + 24) : Math.min(VW - 4, s.x - 24), al = right ? 'left' : 'right';
      hText(l1, lx, s.y + 22, '#b8ffc8', 11, al, 'top'); if (l2) hText(l2, lx, s.y + 37, c2, 11, al, 'top');
    } else if (!s.behind) { hMark('c', s.x, s.y, km(d)); n++; }
  }
  for (const e of enemies) { // визуальный контакт вблизи (без радара)
    if (n >= MAXM - 6 || e.dead || radar.contacts.has(e)) continue;
    const d = e.pos.distanceTo(player.pos); if (d > 5000) continue;
    const s = toScreen(e.pos, SCR[1]);
    if (!s.behind && Math.abs(s.nx) < 1 && Math.abs(s.ny) < 1) { hMark('v', s.x, s.y, km(d)); n++; } else if (d < 3000 && hArrow(e.pos, '#ff5b5b')) n++;
  }
  for (const w of rwr.inc) {
    if (n >= MAXM - 3) break;
    const s = toScreen(w.m.pos, SCR[1]);
    if (!s.behind && Math.abs(s.nx) < 1 && Math.abs(s.ny) < 1) { hMark('m', s.x, s.y, `${km(w.d)} · ${w.m.closing !== undefined && w.m.closing < 15 ? 'отстаёт' : '+' + Math.round(w.m.closing || 0) + ' м/с'}`); n++; }
    else if (hArrow(w.m.pos, '#ff5b5b')) n++;
  }
  for (const t of tankers) {
    if (t.done || n >= MAXM) continue;
    const s = toScreen(t.drogue, SCR[1]), d = t.drogue.distanceTo(player.pos);
    if (!s.behind && Math.abs(s.nx) < 1 && Math.abs(s.ny) < 1) { hMark('t', s.x, s.y, 'ЗАПРАВЩИК ' + (d < 1000 ? Math.round(d) + ' м' : km(d))); n++; } else if (hArrow(t.drogue, '#fde047')) n++;
  }
  if (MP.on) { // онлайн: ники соперников над метками и союзники (голубым)
    for (const e of enemies) {
      if (!e.remote || e.dead) continue;
      const d = e.pos.distanceTo(player.pos); if (d > 12000) continue;
      const s = toScreen(e.pos, SCR[1]); if (!s.behind && Math.abs(s.nx) < 1 && Math.abs(s.ny) < 1) hText(e.name, s.x, s.y - 17, '#fca5a5', 10.5, 'center', 'bottom');
    }
    for (const a of MP.allies) {
      if (a.dead || n >= MAXM) continue;
      const d = a.pos.distanceTo(player.pos), s = toScreen(a.pos, SCR[1]);
      if (!s.behind && Math.abs(s.nx) < 1 && Math.abs(s.ny) < 1) { hRing(s.x, s.y, 7, '#93c5fd', 1.5); hText(`${a.name} · ${km(d)}`, s.x, s.y - 12, '#93c5fd', 10.5, 'center', 'bottom'); n++; }
    }
  }
  // анимация захвата: рамка «схлопывается» на цель
  if (G.lockAnimT > 0 && radar.lock && !radar.lock.dead) {
    G.lockAnimT -= dt; const s = toScreen(radar.lock.pos, SCR[1]), k = Math.max(0, G.lockAnimT / 0.35);
    if (!s.behind) {
      hx.save(); hx.translate(s.x, s.y); hx.rotate(k * 0.785); hx.scale(1 + k * 2.4, 1 + k * 2.4); hx.globalAlpha = 1 - k * 0.3;
      hx.shadowColor = 'rgba(255,80,80,.8)'; hx.shadowBlur = 10; hx.lineWidth = 2 / (1 + k * 2.4); hx.strokeStyle = '#ff5b5b'; hx.strokeRect(-22, -22, 44, 44); hx.restore();
    }
  }
  // виртуальный курсор (мышь захвачена в режиме погружения)
  if (document.pointerLockElement === canvas) { const x = (vcur.x + 1) / 2 * VW, y = (vcur.y + 1) / 2 * VH; hRing(x, y, 8, 'rgba(255,255,255,.85)'); hx.fillStyle = '#fff'; hx.fillRect(x - 1, y - 1, 2, 2); }
  // маркеры попаданий: белый (крупное — жёлтый) косой крест, гаснет за 0,35 с
  for (let i = 0; i < hitMarks.length; i++) {
    const h = hitMarks[i]; h.t -= dt; if (h.t <= 0) continue;
    const s = toScreen(h.pos, SCR[1]); if (s.behind) continue;
    const L = (h.big ? 17 : 13) * (1.4 - h.t);
    hx.save(); hx.translate(s.x, s.y); hx.globalAlpha = h.t / 0.35; hx.lineWidth = 2; hx.strokeStyle = h.big ? '#fde047' : '#fff'; hx.shadowColor = '#000'; hx.shadowBlur = 4;
    hx.beginPath(); hx.moveTo(-L * 0.7, -L * 0.7); hx.lineTo(L * 0.7, L * 0.7); hx.moveTo(L * 0.7, -L * 0.7); hx.lineTo(-L * 0.7, L * 0.7); hx.stroke(); hx.restore();
  }
  while (hitMarks.length && hitMarks[0].t <= 0) hitMarks.shift();
  while (hitMarks.length > 5) hitMarks.shift();
  // панель вооружения: собираем текст раз в 0,12 с, а в страницу пишем, только если он изменился
  wpnT -= dt;
  if (wpnT <= 0) {
    wpnT = 0.12;
    const types = typesLoaded();
    let h = '';
    for (const k of types) h += `<div class="row ${k === selType ? 'sel' : ''}"><span>${MISSILES[k].short}</span><span>×${countOf(k)} ${KIND_TAG[MISSILES[k].kind]}</span></div>`;
    if (!types.length) h = '<div class="row">ракеты израсходованы</div>';
    let st = '';
    if (M_) {
      if (M_.kind === 'ir') st = seeker.locked ? 'ГСН: ЗАХВАТ — ПУСК!' : seeker.target ? 'ГСН: СОПРОВОЖДЕНИЕ…' : (M_.ir.loal ? 'ГСН: ПОИСК · можно пуск без захвата' : 'ГСН: ПОИСК');
      else if (radar.lock) st = 'РЛС: СОПРОВОЖДЕНИЕ';
      else st = M_.kind === 'arh' && radar.contacts.size ? 'РЛС: ОБЗОР · пуск по отметке' : (M_.kind === 'sarh' ? 'РЛС: нужен захват (R)' : 'РЛС: ОБЗОР');
    }
    let fs = '';
    for (const m of missiles) if (!m.dead && m.owner === player) fs += (fs ? ', ' : '') + m.M.short + (m.lost || m.decoy ? '·ПОТЕРЯ' : m.M.kind === 'arh' ? (m.active ? '·ГСН' : '·КОРР') : m.M.kind === 'sarh' ? (radar.lock === m.target ? '·ПОДСВ' : '·НЕТ ПОДСВ') : '');
    const html = h + `<div class="st">${st}</div>` + (fs ? `<div class="fly">в полёте: ${fs}</div>` : '') + `<div class="cm">ЛТЦ ${player.flares} · ДО ${player.chaff}</div>`;
    if (el.wpn._h !== html) { el.wpn._h = html; el.wpn.innerHTML = html; }
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
  const cards = Object.entries(PRESETS).map(([k, p]) => `<div class="gfx ${k === gfxKey ? 'on' : ''} ${bench && bench.rec === k ? 'rec' : ''}" data-g="${k}"><b>${p.name}</b></div>`).join('');
  let res = '';
  if (bench) {
    res = `<div id="benchRes"><table class="tt">${Object.keys(PRESETS).filter((k) => bench.results[k]).reverse().map((k) => `<tr><td>${PRESETS[k].name}</td><td>${Math.round(bench.results[k].fps)} кадр/с, худшие 5% — ${Math.round(bench.results[k].p95)} мс</td></tr>`).join('')}</table>
      <p style="margin:6px 0 0">Рекомендуем: <b style="color:#86efac">${PRESETS[bench.rec].name}</b>${bench.rec === gfxKey ? ' (уже выбран)' : ''}. Видеокарта: ${bench.gpu}.</p></div>`;
  }
  let ctrl;
  if (IS_TOUCH) {
    ctrl = `<div class="perf">
        <label class="chk">Чувствительность ручки <input type="range" id="tSens" min="0.5" max="2" step="0.05" value="${touchCfg.sens}"> <span id="tSensV">${touchCfg.sens.toFixed(2)}</span></label>
        <p class="hint">Выше — короче ход пальца до полного отклонения: резче манёвр, но легче «передёрнуть».</p>
        <label class="chk">Мёртвая зона <input type="range" id="tDead" min="0" max="0.25" step="0.01" value="${touchCfg.dead}"> <span id="tDeadV">${Math.round(touchCfg.dead * 100)}%</span></label>
        <p class="hint">Малые движения пальца у центра не поворачивают дрон — меньше случайных рысканий.</p>
        <label class="chk">Кривая отклика <input type="range" id="tCurve" min="0" max="1" step="0.05" value="${touchCfg.curve}"> <span id="tCurveV">${Math.round(touchCfg.curve * 100)}%</span></label>
        <p class="hint">0% — отклик пропорционален отклонению. Больше — точнее у центра (прицеливание), а полный манёвр — у края хода.</p>
        <label class="chk"><input type="checkbox" id="tInv" ${touchCfg.invert ? 'checked' : ''}> Инверсия тангажа (палец вниз — нос вверх)</label>
        <button class="btn alt sm" id="tReset">Сбросить ручку</button>
      </div>
      <div class="help" style="margin-top:8px"><p><b>Левый палец</b> — «ручка». Справа: <b>ПУШКА</b> (держать), <b>РАКЕТА</b>, <b>ЗАХВАТ</b>, <b>ФОРСАЖ</b>, <b>ЛТЦ ДО</b>. Слева внизу: <b>ГАЗ−</b> и <b>НАЗАД</b> (держать).</p>
      <p>Тап по панели ракет — сменить ракету, по индикатору радара — масштаб, <b>II</b> — пауза.</p></div>`;
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
  const wOpts = [['random', 'Случайная'], ...Object.entries(WEATHERS).map(([k, w]) => [k, w.name])];
  $('tab-set').innerHTML = `<div class="cat-h">Графика</div><div class="gfx-row">${cards}</div>
    <p class="hint">Пресет задаёт дальность прорисовки, густоту леса и облаков, качество материалов и теней. С «Высокого» — тени и объёмные облака, в «Ультра» и «Кино» — отражения в воде, свечение и лучи; «Кино» — самая подробная земля и лес. Смена пресета перезагружает игру.</p>
    <button class="btn alt sm" id="benchBtn">Тест графики (≈ 15 с)</button>
    ${res}
    ${bench && bench.rec !== gfxKey ? `<button class="btn sm" id="applyRec">Применить рекомендованный</button>` : ''}
    <div class="cat-h">Звук</div>
    <div class="perf"><label class="chk">Громкость <input type="range" id="sVol" min="0" max="1" step="0.05" value="${soundVol}"> <span id="sVolV">${Math.round(soundVol * 100)}%</span></label>
    <label class="chk"><input type="checkbox" id="sMute" ${muted ? 'checked' : ''}> Без звука</label>
    <p class="hint">Двигатель синтезируется как настоящий: рёв струи, вой турбины, треск форсажа; чужие самолёты и ракеты слышны объёмно, с эффектом Доплера. Лучше всего — в наушниках.</p></div>
    <div class="cat-h">Погода</div>
    <div class="perf"><div class="prow">${seg('weather', weatherPref, wOpts)}</div>
    <p class="hint">Сейчас: <b>${WEATHERS[weatherKey].name}</b>. Погода меняет свет, небо, облака и дальность видимости; в ливень темнее и хуже видно глазом — радар работает как обычно.</p></div>
    ${perfBlock()}
    <div class="cat-h">Управление</div>${ctrl}`;
}
// ── Производительность и качество: апскейлеры, сглаживание, частота кадров, экран ──
const seg = (id, val, opts) => `<div class="seg" data-seg="${id}">${opts.map(([v, t]) => `<button class="${String(val) === String(v) ? 'on' : ''}" data-v="${v}">${t}</button>`).join('')}</div>`;
function perfBlock() {
  const pct = (x) => Math.round(x * 100) + '%';
  const upHint = { off: 'Кадр просто растягивается до размера экрана: при масштабе ниже 100% картинка мягче.',
    cas: '<b>CAS</b> растягивает кадр и добавляет резкость там, где контраст низкий, не пересвечивая края. Лучше всего при 77–100%.',
    fsr: '<b>FSR</b> растягивает кадр фильтром Ланцоша с защитой от ореолов и добавляет адаптивную резкость. Чётче держит края и мелкие детали при 59–77%.' }[perf.up];
  const aaHint = { off: 'Края объектов «лесенкой», зато быстрее всего.', fxaa: '<b>FXAA</b> находит края на готовом кадре и сглаживает «лесенку»; мелкие детали становятся чуть мягче.',
    msaa: '<b>MSAA ×4</b> сглаживает края геометрии прямо при рисовании: чище FXAA, но заметно нагружает видеопамять.' + (renderer.capabilities.isWebGL2 ? '' : ' На этом устройстве работает как FXAA.') }[perf.aa];
  return `<div class="cat-h">Производительность и качество</div>
    <div class="perf">
      <div class="prow"><span>Цель, кадров/с</span>${seg('target', perf.target, [[30, '30'], [60, '60'], [120, '120']])}</div>
      <label class="chk"><input type="checkbox" id="pDyn" ${perf.dyn ? 'checked' : ''}> Динамическое разрешение</label>
      <p class="hint">Когда кадры не успевают, разрешение рендера на ходу снижается (до ${pct(perf.min)}), а апскейлер растягивает кадр до экрана; появился запас — разрешение возвращается.</p>
      <div class="prow"><span>Масштаб рендера${perf.dyn ? ' (макс.)' : ''}</span>${seg('scale', perf.scale, [[1, '100%'], [0.85, '85%'], [0.77, '77%'], [0.67, '67%'], [0.59, '59%'], [0.5, '50%']])}</div>
      <p class="hint">Доля пикселей экрана, которую рисует видеокарта. Меньше — быстрее; 67–77% с апскейлером почти не отличаются от 100%.</p>
      <div class="prow"><span>Апскейлер</span>${seg('up', perf.up, [['off', 'Выкл'], ['cas', 'CAS'], ['fsr', 'FSR']])}</div>
      <p class="hint">${upHint}</p>
      ${perf.up !== 'off' ? `<label class="chk">Резкость <input type="range" id="pSharp" min="0" max="1" step="0.05" value="${perf.sharp}"> <span id="pSharpV">${perf.sharp.toFixed(2)}</span></label>` : ''}
      <div class="prow"><span>Сглаживание</span>${seg('aa', perf.aa, [['off', 'Выкл'], ['fxaa', 'FXAA'], ['msaa', 'MSAA ×4']])}</div>
      <p class="hint">${aaHint}</p>
      <label class="chk"><input type="checkbox" id="pSmartQ" ${perf.smartQ ? 'checked' : ''} ${perf.dyn ? '' : 'disabled'}> Умное динамическое качество</label>
      <p class="hint">Когда кадры не успевают, сначала сокращается дальность подробного леса и рельефа, и только потом снижается разрешение; возвращается в обратном порядке. Картинка при нагрузке остаётся чёткой.${perf.dyn ? '' : ' Работает вместе с динамическим разрешением.'}</p>
      <label class="chk"><input type="checkbox" id="pHalfFx" ${perf.halfFx ? 'checked' : ''} ${fxAvail() ? '' : 'disabled'}> Облака и дым в половинном разрешении</label>
      <p class="hint">Облака, облачный слой и дым рисуются в четверть пикселей и накладываются на кадр, а на стыке с землёй и самолётами мягко растворяются. Сильно разгружает видеокарту в облаках, в пасмурную погоду и при взрывах; края дыма чуть мягче.${fxAvail() ? '' : ' Нужен конвейер кадра: включите сглаживание или апскейлер.'}</p>
      <div class="prow"><span>Ограничение кадров</span>${seg('cap', perf.cap, [[0, 'Нет'], [30, '30'], [60, '60']])}</div>
      <p class="hint">Не рисовать чаще заданного: меньше нагрев и расход батареи.</p>
      ${P3_OK ? `<label class="chk"><input type="checkbox" id="pP3" ${perf.p3 ? 'checked' : ''}> Широкий цвет (Display P3)</label>
      <p class="hint">Расширенный цветовой охват экрана: насыщеннее зелень, небо и пламя.</p>` : ''}
      <label class="chk"><input type="checkbox" id="pFps" ${perf.fps ? 'checked' : ''}> Показывать счётчик кадров</label>
      <p class="hint">В полёте: кадров в секунду, частота экрана, худшие 5% кадров и текущий масштаб рендера.</p>
      <label class="chk"><input type="checkbox" id="pImm" ${perf.immersive ? 'checked' : ''}> Режим погружения</label>
      <p class="hint">На время вылета — весь экран без панелей браузера${IS_TOUCH ? ', экран не гаснет, ориентация зафиксирована' : ', мышь не уходит за край окна'}; «Назад» ставит паузу, закрытие — только с подтверждением.${TG.W || TG.proxy ? ' В Telegram свайп вниз не сворачивает игру.' : IOS ? ' В Safari на iPhone весь экран доступен, если открыть игру с экрана «Домой».' : ''}</p>
      <button class="btn alt sm" id="upTestBtn">Сравнить апскейлеры (≈ 12 с)</button>
      <button class="btn alt sm" id="perfReset">Сбросить к настройкам пресета</button>
    </div>`;
}
function applyPerf() { savePerf(); dr.scale = perf.scale; rebuildPipe(); renderSettingsTab(); }
const fxAvail = () => renderer.capabilities.isWebGL2 && needPipe();
// Погода в меню меняется сразу (без перезагрузки); «Случайная» — новая погода на каждый вылет
function setWeatherPref(v) {
  weatherPref = v; store.set('fortuna_drone_weather', v);
  const k = v === 'random' ? pickWeather() : v;
  if (k !== weatherKey) applyWeatherKey(k);
  renderSettingsTab(); renderWeatherChip();
}
function applyWeatherKey(k) {
  const sh = world.sun.castShadow;
  weatherKey = k; world.setWeather(k); weatherExp = world.W.exposure || 1; applyExposure();
  if (sh !== world.sun.castShadow) { scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; }); warmShaders(); } // тени вкл/выкл — пересборка шейдеров
}
function renderWeatherChip() { const c = $('weatherChip'); if (c) c.textContent = 'Погода: ' + WEATHERS[weatherKey].name; }
function renderModeSel() {
  $('modeSel').innerHTML = Object.entries(MODES).map(([k, m]) => {
    const off = k === 'training' && !TRAINING; // в партии на награду обучения нет
    return `<button class="${k === modeKey ? 'on' : ''}" data-mode="${k}" ${off ? 'disabled' : ''}><b>${m.name}</b><span>${off ? 'только в тренировке без наград' : m.desc}</span></button>`;
  }).join('');
}
function showTab(t) {
  document.querySelectorAll('#mtabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
  document.querySelectorAll('.tabp').forEach((p) => p.classList.toggle('on', p.id === 'tab-' + t));
  if (t === 'mp') { MP.connect(); MP.render(); }
}
$('mtabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) showTab(b.dataset.tab); });
$('modeSel').addEventListener('click', (e) => {
  const b = e.target.closest('[data-mode]'); if (!b || G.state !== 'menu') return;
  modeKey = b.dataset.mode; store.set('fortuna_drone_mode', modeKey); applyMode(); renderModeSel(); renderStats();
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
    if (id === 'weather') { setWeatherPref(raw); return; }
    perf[id] = v; applyPerf(); return;
  }
  if (e.target.id === 'perfReset') { Object.assign(perf, P.perf); applyPerf(); }
  if (e.target.id === 'upTestBtn') runUpscaleTest();
  if (e.target.id === 'tReset') { touchCfg = { sens: 1, dead: 0.1, curve: 0.35, invert: false }; saveTouch(); renderSettingsTab(); }
});
$('tab-set').addEventListener('change', (e) => {
  if (e.target.id === 'mSteer') { mouseCfg.steer = e.target.checked; if (!mouseCfg.steer) { input.sx = 0; input.sy = 0; } saveMouse(); renderGuideTab(); }
  if (e.target.id === 'mInv') { mouseCfg.invert = e.target.checked; saveMouse(); }
  if (e.target.id === 'pDyn') { perf.dyn = e.target.checked; if (!perf.dyn && dr.q) setQ(0); applyPerf(); }
  if (e.target.id === 'pSmartQ') { perf.smartQ = e.target.checked; if (!perf.smartQ && dr.q) setQ(0); savePerf(); }
  if (e.target.id === 'pHalfFx') { perf.halfFx = e.target.checked; applyPerf(); }
  if (e.target.id === 'pFps') { perf.fps = e.target.checked; savePerf(); }
  if (e.target.id === 'pImm') { perf.immersive = e.target.checked; savePerf(); renderSettingsTab(); }
  if (e.target.id === 'sMute') setMute(e.target.checked);
  if (e.target.id === 'tInv') { touchCfg.invert = e.target.checked; saveTouch(); }
  if (e.target.id === 'pP3') { perf.p3 = e.target.checked; try { renderer.getContext().drawingBufferColorSpace = perf.p3 ? 'display-p3' : 'srgb'; } catch (_) { perf.p3 = false; } applyPerf(); }
});
$('tab-set').addEventListener('input', (e) => {
  if (e.target.id === 'mSens') { mouseCfg.sens = +e.target.value; $('mSensV').textContent = mouseCfg.sens.toFixed(1); saveMouse(); }
  if (e.target.id === 'sVol') { soundVol = +e.target.value; $('sVolV').textContent = Math.round(soundVol * 100) + '%'; AU.setVolume(soundVol); store.set('fortuna_drone_vol', String(soundVol)); }
  if (e.target.id === 'tSens') { touchCfg.sens = +e.target.value; $('tSensV').textContent = touchCfg.sens.toFixed(2); saveTouch(); }
  if (e.target.id === 'tDead') { touchCfg.dead = +e.target.value; $('tDeadV').textContent = Math.round(touchCfg.dead * 100) + '%'; saveTouch(); }
  if (e.target.id === 'tCurve') { touchCfg.curve = +e.target.value; $('tCurveV').textContent = Math.round(touchCfg.curve * 100) + '%'; saveTouch(); }
  if (e.target.id === 'pSharp') { perf.sharp = +e.target.value; $('pSharpV').textContent = perf.sharp.toFixed(2); if (pipe) pipe.setSharp(perf.sharp); savePerf(); }
});
renderModeSel(); renderLoadTab(); renderRefTab(); renderGuideTab(); renderSettingsTab(); renderWeatherChip();

// ═════════════ Тест графики ═════════════
// Отдельная «тяжёлая» сцена (мир на высоком пресете, 16 самолётов, взрывы, тени) рендерится
// с разрешением и тенями каждого пресета по ~2,6 с; по средней частоте кадров и худшим 5% кадров — рекомендация.
const bench = { active: false };
async function runBenchmark() {
  if (bench.active) return;
  bench.active = true; AU.silence();
  show('menu', false); $('benchScr').classList.add('on'); $('benchBox').textContent = 'Тест графики: подготовка сцены…';
  await new Promise((r) => setTimeout(r, 30));
  const bScene = new THREE.Scene();
  const bw = buildWorld(bScene, PRESETS.high, 4242, renderer, weatherKey);
  const bFX = makeParticles(bScene, 3000, true, dotTex), bSM = makeParticles(bScene, 3000, false, smokeTex);
  const J = jetGeo('fighter'), jets = [];
  for (let i = 0; i < 16; i++) { const m = new THREE.Mesh(J.geo, MAT_JET); m.castShadow = true; m.rotation.order = 'YXZ'; bScene.add(m); jets.push({ m, a: i / 16 * Math.PI * 2, r: 250 + (i % 5) * 60, h: 380 + (i % 4) * 50 }); }
  const T0 = TOWNS[0], cy = terrainH(T0.x, T0.z);
  const phases = ['cinema', 'ultra', 'high', 'medium', 'low'].map((key) => ({ key, shadows: !!PRESETS[key].shadows }));
  const results = {};
  const prevSh = renderer.shadowMap.enabled;
  camera.clearViewOffset();
  for (const ph of phases) {
    const pp = PRESETS[ph.key], pf = pp.perf, usePipe = !!pp.post || pf.aa !== 'off' || pf.up !== 'off', ldr = !pp.post;
    renderer.setPixelRatio(usePipe ? prFor(pp) : prFor(pp) * pf.scale); renderer.toneMapping = usePipe && !ldr ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping; resize();
    renderer.shadowMap.enabled = ph.shadows; bw.sun.castShadow = ph.shadows;
    const sm = PRESETS[ph.key].shadowMap || 2048;
    if (bw.sun.shadow.mapSize.x !== sm) { if (bw.sun.shadow.map) { bw.sun.shadow.map.dispose(); bw.sun.shadow.map = null; } bw.sun.shadow.mapSize.set(sm, sm); }
    const bPost = usePipe ? createPipeline(renderer, { ...(pp.post || {}), ldr, exposure: (pp.post && pp.post.exposure) || 1.15, scale: pf.scale, upscaler: pf.up, sharp: pf.sharp, aa: pf.aa }) : null;
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
// Натив 100%, 67% без апскейлера, 67% + CAS, 67% + FSR. Для каждого — средняя частота кадров (~1,6 с на сцене с дроном)
// и снимки трёх сцен: дрон крупно, город с лесом, даль с облаками. В окне сравнения — «шторка», масштаб до ×4
// и перетаскивание картинки (пальцем или мышью), щипок и колесо — увеличение.
const UP_SHOTS = [
  { name: 'Дрон крупно', pose: (t) => { const a = 0.5 + t * 0.1; return [HANGAR.x + Math.sin(a) * 24, HANGAR.y + 5, HANGAR.z + Math.cos(a) * 24, HANGAR.x, HANGAR.y - 3, HANGAR.z]; } },
  { name: 'Город и лес', pose: () => { const T = TOWNS[0], y = terrainH(T.x, T.z); return [T.x + 700, y + 380, T.z + 900, T.x, y + 40, T.z]; } },
  { name: 'Даль и облака', pose: () => [AIRFIELD.x, airfieldH() + 1600, AIRFIELD.z, AIRFIELD.x + 9000, airfieldH() + 900, AIRFIELD.z - 12000] },
];
let upUrls = [];
function snapCanvas() {
  return new Promise((res) => {
    try {
      if (canvas.toBlob) { canvas.toBlob((b) => res(b ? URL.createObjectURL(b) : ''), 'image/jpeg', 0.95); return; } // копия кадра снимается сразу при вызове
      res(canvas.toDataURL('image/jpeg', 0.95));
    } catch (_) { res(''); }
  });
}
async function runUpscaleTest() {
  if (bench.active) return;
  bench.active = true; AU.silence();
  show('menu', false); $('benchScr').classList.add('on');
  for (const u of upUrls) if (u.startsWith('blob:')) URL.revokeObjectURL(u); upUrls = [];
  const saved = { ...perf }, S = 0.67;
  const cfgs = [{ k: 'native', name: 'Натив 100%', scale: 1, up: 'off' }, { k: 'bil', name: '67% без апскейлера', scale: S, up: 'off' },
    { k: 'cas', name: '67% + CAS', scale: S, up: 'cas' }, { k: 'fsr', name: '67% + FSR', scale: S, up: 'fsr' }];
  camera.clearViewOffset();
  if (camera.fov !== 50) { camera.fov = 50; camera.updateProjectionMatrix(); }
  const pose = (shot, t) => {
    player.pos.copy(HANGAR); player.yaw = 0.9 + t * 0.15; player.pitch = 0.05; player.roll = 0.35; player.ab = true; placeShip();
    const [x, y, z, lx, ly, lz] = shot.pose(t);
    camera.position.set(x, y, z); camera.up.set(0, 1, 0); camera.lookAt(lx, ly, lz);
  };
  const out = [];
  for (const c of cfgs) {
    Object.assign(perf, { scale: c.scale, dyn: false, up: c.up }); dr.scale = c.scale; rebuildPipe();
    const times = [];
    await new Promise((res) => {
      const t0 = performance.now(); let lastT = t0;
      function f(now) {
        const el = now - t0; times.push(now - lastT); lastT = now;
        pose(UP_SHOTS[0], el / 1000); SMOKE.update(0.016); FX.update(0.016); render();
        $('benchBox').textContent = `Сравнение апскейлеров: ${c.name} — ${Math.min(100, Math.round(el / 1600 * 100))}%`;
        if (el < 1600) requestAnimationFrame(f); else res();
      }
      requestAnimationFrame(f);
    });
    times.splice(0, 8); times.sort((a, b) => a - b);
    const avg = times.reduce((x, y) => x + y, 0) / Math.max(1, times.length);
    const imgs = [];
    for (const shot of UP_SHOTS) {
      pose(shot, 0.8); render(); render(); // второй кадр — уже с прогретыми тенями и облаками
      imgs.push(await snapCanvas());
    }
    upUrls.push(...imgs);
    out.push({ ...c, fps: 1000 / avg, imgs });
  }
  Object.assign(perf, saved); dr.scale = perf.scale; rebuildPipe();
  player.ab = false; bench.active = false;
  $('benchScr').classList.remove('on');
  showUpscaleResult(out, VW / VH);
}
function showUpscaleResult(out, aspect) {
  const nat = out[0];
  const rows = out.map((r) => `<tr><td>${r.name}</td><td>${Math.round(r.fps)} к/с ${r === nat ? '' : `<b style="color:${r.fps >= nat.fps ? '#86efac' : '#fca5a5'}">${r.fps >= nat.fps ? '+' : ''}${Math.round((r.fps / nat.fps - 1) * 100)}%</b>`}</td></tr>`).join('');
  $('upBody').innerHTML = `
    <div class="cmp" id="cmp" style="width:min(100%, calc(56vh * ${aspect.toFixed(3)})); aspect-ratio:${aspect.toFixed(3)}">
      <img id="cmpA" alt="натив" draggable="false"><div class="cmpB" id="cmpB"><img id="cmpBi" alt="апскейл" draggable="false"></div>
      <div class="cmpLine" id="cmpLine"><i></i></div><span class="cmpL">Натив 100%</span><span class="cmpR" id="cmpR"></span><span class="cmpZ" id="cmpZ"></span></div>
    <div class="cmpBar">${seg('cmpShot', 0, UP_SHOTS.map((sh, i) => [i, sh.name]))}${seg('cmpZoom', 1, [[1, '×1'], [2, '×2'], [4, '×4']])}</div>
    <div class="cmpBar">${seg('cmpVar', 3, out.slice(1).map((r, i) => [i + 1, r.name]))}</div>
    <table class="tt">${rows}</table>
    <p class="hint">Тяните жёлтую линию: слева — натив, справа — выбранный вариант. В увеличении картинку можно двигать пальцем или мышью; щипок, колесо и двойной тап — масштаб. Разница в к/с видна, только если видеокарта не упирается в частоту экрана.</p>`;
  const cmp = $('cmp'), A = $('cmpA'), B = $('cmpBi'), clip = $('cmpB'), line = $('cmpLine');
  const st = { shot: 0, v: 3, z: 1, tx: 0, ty: 0, split: 0.5 };
  const size = () => { const r = cmp.getBoundingClientRect(); return [r.width || 1, r.height || 1, r.left, r.top]; };
  const clampPan = () => { const [w, h] = size(); st.tx = clamp(st.tx, w - w * st.z, 0); st.ty = clamp(st.ty, h - h * st.z, 0); };
  const draw = () => {
    clampPan();
    const tf = `translate(${st.tx.toFixed(1)}px,${st.ty.toFixed(1)}px) scale(${st.z})`;
    A.style.transform = B.style.transform = tf; cmp.classList.toggle('px', st.z >= 2);
    clip.style.clipPath = `inset(0 0 0 ${(st.split * 100).toFixed(2)}%)`; line.style.left = (st.split * 100).toFixed(2) + '%';
    $('cmpZ').textContent = st.z > 1 ? '×' + (+st.z.toFixed(1)) : '';
    $('upBody').querySelectorAll('[data-seg="cmpZoom"] button').forEach((b) => b.classList.toggle('on', +b.dataset.v === Math.round(st.z) && Math.abs(st.z - Math.round(st.z)) < 0.05));
  };
  const setImgs = () => { A.src = nat.imgs[st.shot]; B.src = out[st.v].imgs[st.shot]; $('cmpR').textContent = out[st.v].name; };
  const zoomAt = (nz, cx, cy) => { nz = clamp(nz, 1, 6); const k = nz / st.z; st.tx = cx - (cx - st.tx) * k; st.ty = cy - (cy - st.ty) * k; st.z = nz; draw(); };
  setImgs(); draw();
  // жесты: линия-«шторка», перетаскивание картинки, щипок
  const pts = new Map(); let mode = null, sx = 0, sy = 0, stx = 0, sty = 0, pinch = null, lastTap = 0;
  cmp.onpointerdown = (e) => {
    e.preventDefault(); cmp.setPointerCapture(e.pointerId);
    const [w, , l, t] = size(), x = e.clientX - l, y = e.clientY - t;
    pts.set(e.pointerId, [x, y]);
    if (pts.size === 2) { const [p1, p2] = [...pts.values()]; pinch = { d: Math.hypot(p1[0] - p2[0], p1[1] - p2[1]) || 1, z: st.z }; mode = 'pinch'; return; }
    const now = performance.now();
    if (now - lastTap < 300) { zoomAt(st.z > 1.5 ? 1 : 2.5, x, y); lastTap = 0; mode = null; return; }
    lastTap = now;
    mode = Math.abs(x - st.split * w) < 24 || st.z <= 1 ? 'line' : 'pan';
    sx = x; sy = y; stx = st.tx; sty = st.ty;
    if (mode === 'line') { st.split = clamp(x / w, 0, 1); draw(); }
  };
  cmp.onpointermove = (e) => {
    if (!pts.has(e.pointerId)) return;
    const [w, , l, t] = size(), x = e.clientX - l, y = e.clientY - t; pts.set(e.pointerId, [x, y]);
    if (mode === 'pinch' && pts.size === 2) { const [p1, p2] = [...pts.values()]; zoomAt(pinch.z * Math.hypot(p1[0] - p2[0], p1[1] - p2[1]) / pinch.d, (p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2); }
    else if (mode === 'line') { st.split = clamp(x / w, 0, 1); draw(); }
    else if (mode === 'pan') { st.tx = stx + x - sx; st.ty = sty + y - sy; draw(); }
  };
  const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2 && mode === 'pinch') mode = null; if (!pts.size) mode = null; };
  cmp.onpointerup = up; cmp.onpointercancel = up;
  cmp.onwheel = (e) => { e.preventDefault(); const [, , l, t] = size(); zoomAt(st.z * (e.deltaY < 0 ? 1.25 : 0.8), e.clientX - l, e.clientY - t); };
  $('upBody').onclick = (e) => {
    const b = e.target.closest('.seg button'); if (!b) return;
    const id = b.parentNode.dataset.seg, v = +b.dataset.v;
    b.parentNode.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    if (id === 'cmpShot') { st.shot = v; setImgs(); }
    else if (id === 'cmpVar') { st.v = v; setImgs(); }
    else if (id === 'cmpZoom') { const [w, h] = size(); zoomAt(v, w / 2, h / 2); }
  };
  show('upTest', true);
}
$('upClose').addEventListener('click', () => { show('upTest', false); show('menu', true); showTab('set'); });

// ═════════════ Состояния игры ═════════════
function show(id, on) { $(id).classList.toggle('on', on); }
// крупная надпись по центру: цифры отсчёта и «В БОЙ!» — большим шрифтом, сообщения («СБИТ…», «НЕТ СВЯЗИ…») — мелким
function setCount(t) { const c = $('count'); t = String(t); c.textContent = t; c.classList.toggle('msg', t.length > 8); }
function setBody(cls) { document.body.classList.remove('menuing', 'playing'); if (cls) document.body.classList.add(cls); }
function placeAtStart() {
  player.yaw = 0; player.pitch = 0; player.roll = 0; player.wy = player.wp = 0; player.speed = 240; player.thr = 0.85;
  player.pos.set(AIRFIELD.x, airfieldH() + 2400, AIRFIELD.z - 1500);
  fwdOf(player, player.vel).multiplyScalar(player.speed); camSnap = true;
}
function startCountdown() {
  unlockAudio();
  show('menu', false); setBody('playing'); $('hud').classList.add('on'); G.state = 'countdown';
  camera.clearViewOffset(); applyMode(); applyLoadout(); placeAtStart(); world.sortieStart();
  setHint(''); if (MODE.training) trainingReset();
  enterImmersive(); tgFlight(true); drReset(); // клик «ВЗЛЁТ» — жест пользователя, браузер разрешит полный экран и захват мыши
  let n = 3; setCount(n);
  const iv = setInterval(() => {
    n--; if (n > 0) { setCount(n); tone(440, 0.1, 'square', 0.05); }
    else { clearInterval(iv); setCount('В БОЙ!'); tone(880, 0.25, 'square', 0.06); G.state = 'play'; setTimeout(() => { setCount(''); }, 700); }
  }, 800);
}
function togglePause() {
  if (G.lesson) { closeLesson(); return; }
  if (MP.on) { show('pauseScr', !$('pauseScr').classList.contains('on')); held.clear(); return; } // онлайн: мир не останавливается — только меню
  if (G.state !== 'play' && !G.paused) return;
  G.paused = !G.paused; G.state = G.paused ? 'pause' : 'play';
  show('pauseScr', G.paused);
  if (G.paused) { silenceLoops(); held.clear(); try { if (document.pointerLockElement) document.exitPointerLock(); } catch (_) { /* нет */ } }
  else requestPointer(); // продолжение по кнопке — снова захватываем мышь
}
function endGame(reason) {
  if (G.over) return; G.over = true; G.state = 'over'; input.fire = false; input.ab = false; tgFlight(false, false);
  try { if (document.pointerLockElement) document.exitPointerLock(); } catch (_) { /* нет */ } // курсор нужен для кнопок итогов
  if (reason === 'hull') { explosion(player.pos, 4); sfx.boom(20, 4); }
  silenceLoops();
  const texts = { hull: 'Дрон сбит', fuel: 'Топливо закончилось', time: 'Время вылета вышло', win: 'Все группы противника уничтожены' };
  setTimeout(() => {
    $('hud').classList.remove('on'); setBody(null);
    $('end').classList.remove('mpEnd');
    $('endTitle').textContent = G.bossKilled ? 'Победа над Подстилкой!' : 'Вылет окончен'; $('endTitle').className = G.bossKilled ? 'win' : '';
    $('endReason').textContent = texts[reason] || '';
    $('eKills').textContent = G.kills; $('eMax').textContent = MAX_K; $('eScore').textContent = G.score; $('eMsl').textContent = G.mHits + '/' + G.mFired; $('eEvade').textContent = G.evaded;
    $('eBoss').textContent = G.bossKilled ? 'Флагман «Подстилка улитки» сбит (+5)' : (G.bossSpawned ? 'Флагман «Подстилка улитки» уцелел' : '');
    if (TRAINING) $('serverMsg').textContent = 'Тренировка — результат не идёт в общий прогресс';
    else { $('serverMsg').textContent = 'Отправляем результат…'; $('againBtn').style.display = 'none'; $('closeBtn').textContent = 'Закрыть'; }
    show('end', true);
  }, 1300);
  const rec = saveRunStats(); if (rec && G.score > 0) setTimeout(() => { $('eBoss').textContent = ($('eBoss').textContent ? $('eBoss').textContent + ' · ' : '') + 'Новый личный рекорд!'; }, 1350);
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
$('startBtn').addEventListener('click', () => { if (MP.room) { unlockAudio(); if (MP.inLobby()) MP.toggleReady(); return; } startCountdown(); }); // в онлайн-комнате — «Готов»
$('resumeBtn').addEventListener('click', togglePause);
$('againBtn').addEventListener('click', () => { if (MP.end) mpBackToMenu(); else location.reload(); });
function exitGame() { MP.leave(); exitImmersive(); tgFlight(false); if (window.parent !== window && window.parent.closeMgOverlay) window.parent.closeMgOverlay(); else location.reload(); } // вне сайта — назад в меню
$('closeBtn').addEventListener('click', exitGame); $('exit').addEventListener('click', exitGame); $('pause').addEventListener('click', togglePause); $('pauseExit').addEventListener('click', exitGame);
document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'play' && !MP.on) togglePause(); }); // онлайн-бой не ставится на паузу
$('modeBadge').className = 'badge ' + (TRAINING ? 'train' : 'rank');
$('modeBadge').textContent = TRAINING ? 'ТРЕНИРОВКА — без наград' : 'НА НАГРАДУ — результат идёт в общий прогресс недели';
setBody('menuing');

// ═════════════ Онлайн-бой ═════════════
// Связь, лобби и чужие самолёты — online-client.js; здесь — то, что трогает саму игру: старт, модели соперников, урон, итоги.
const MAT_ALLY = MAT_METAL.clone(); MAT_ALLY.color.set(0xaecbff); // союзники — голубоватые, соперники — красноватые
const MAT_FOE = MAT_METAL.clone(); MAT_FOE.color.set(0xffb4a6);
let remoteGeo = null;
function mpPlace(s) {
  Object.assign(player, { yaw: s[3], pitch: 0, roll: 0, wy: 0, wp: 0, speed: 240, thr: 0.85 });
  player.pos.set(s[0], s[1], s[2]); fwdOf(player, player.vel).multiplyScalar(player.speed); camSnap = true;
}
function mpStart(o) {
  unlockAudio();
  show('end', false); show('pauseScr', false); show('menu', false); setBody('playing'); $('hud').classList.add('on');
  modeKey = o.mode; applyMode(); MODE = { ...MODE, fuelBurn: 0 }; // режим задаёт комната (не сохраняем как свой); топливо в онлайне не тратится
  if (WEATHERS[o.weather] && o.weather !== weatherKey) applyWeatherKey(o.weather);
  renderWeatherChip();
  Object.assign(G, { state: 'countdown', paused: false, over: false, runTime: 0, kills: 0, score: 0, shots: 0, hits: 0, mFired: 0, mHits: 0, evaded: 0, shake: 0 });
  camera.clearViewOffset(); clearMissiles(); applyLoadout(); mpPlace(o.spawn); world.sortieStart();
  player.hull = 100; player.invuln = 0; player.heat = 0; player.overheated = false; radar.lock = null; radar.contacts.clear();
  setHint(''); enterImmersive(); tgFlight(true); drReset();
  setCount(o.cd > 0 ? Math.ceil(o.cd) : '');
}
function mpGoPlay() { G.state = 'play'; setCount('В БОЙ!'); tone(880, 0.25, 'square', 0.06); setTimeout(() => { if ($('count').textContent === 'В БОЙ!') setCount(''); }, 700); }
function mpSetHull(hp) { const was = player.hull; player.hull = hp; if (hp < was) hurtFx(was - hp); }
function mpMeDown() {
  explosion(player.pos, 4); sfx.boom(20, 4); G.shake = 1.2; input.fire = false; input.ab = false; held.clear();
  radar.lock = null; setCount('СБИТ · возрождение через 5 с');
}
function mpMeUp(s) {
  mpPlace(s); applyLoadout();
  Object.assign(player, { hull: 100, invuln: 1.5, heat: 0, overheated: false, flares: MODE.cm, chaff: MODE.cm });
  radar.lock = null; setCount(''); popup('ВОЗРОЖДЕНИЕ', 'info');
}
// сервер вернул самолёт после ИИ (вкладка была свёрнута или оборвалась связь): где он сейчас, корпус, что осталось на пилонах
function mpApplyYou(y) {
  const s = y.s;
  Object.assign(player, { yaw: s[3], pitch: s[4], roll: s[5], wy: 0, wp: 0, speed: s[6], thr: 0.85, invuln: 0.5 });
  player.pos.set(s[0], s[1], s[2]); fwdOf(player, player.vel).multiplyScalar(player.speed); camSnap = true;
  if (typeof y.hp === 'number') player.hull = y.hp;
  if (Array.isArray(y.load)) { for (let i = 0; i < 8; i++) loaded[i] = y.load[i] || null; rebuildPylonMeshes(); ensureSel(); }
  if (typeof y.flares === 'number') { player.flares = y.flares; player.chaff = y.chaff; }
  radar.lock = null;
}
const REMOTE_RCS = () => 1.6; // «Изделие» с типовой подвеской
function makeRemote(info, ally) {
  const c = makeCraft({ remote: true, human: true, team: info.team, ...DRONE, hp: 100, flares: 0, chaff: 0, rcs: REMOTE_RCS,
    S: { name: info.name, code: 'ИЗ', hp: 100, rcs: 1.6, radarR: RADAR.range, pts: 0 }, radar: { contacts: new Map(), lock: null, lostT: 0, scanT: 0, t: 0 } });
  c.ally = ally; remoteUp(c);
  return c;
}
function remoteUp(c) { // модель «Изделия» соперника/союзника (заново после каждого сбития — старая падает обломком)
  const g = new THREE.Group(); g.rotation.order = 'YXZ';
  const m = new THREE.Mesh(remoteGeo || (remoteGeo = buildShipGeo()), c.ally ? MAT_ALLY : MAT_FOE); m.castShadow = !!P.shadows; g.add(m);
  const f = new THREE.Mesh(flameGeo, flameMat); f.position.z = 7.35; g.add(f);
  scene.add(g); c.group = g; c.flames = [f];
}
function remoteVisual(c) {
  const g = c.group; if (!g) return;
  g.position.copy(c.pos); g.rotation.set(c.pitch, c.yaw, c.roll);
  const f = c.flames[0]; f.scale.set(c.ab ? 1.25 : 0.9, c.ab ? 1.25 : 0.9, (c.ab ? 6 : 1.2 * c.thr) * (0.9 + rnd() * 0.2));
}
function remoteDown(c) {
  explosion(c.pos, 3.2); sfx.boom(c.pos.distanceTo(camera.position), 3);
  if (radar.lock === c) radar.lock = null; radar.contacts.delete(c);
  if (c.group) wrecks.push({ group: c.group, vel: c.vel.clone(), spin: (rnd() - 0.5) * 3, t: 0, big: false });
  c.group = null;
}
function removeRemote(c) { if (c.group) scene.remove(c.group); c.group = null; if (radar.lock === c) radar.lock = null; radar.contacts.delete(c); }
function mpShowEnd(m, me, myTeam) {
  G.over = true; G.state = 'over'; input.fire = false; input.ab = false; held.clear(); tgFlight(false, false);
  try { if (document.pointerLockElement) document.exitPointerLock(); } catch (_) { /* нет */ }
  silenceLoops(); show('pauseScr', false);
  const [a, b] = m.score, mine = m.score[myTeam], theirs = m.score[1 - myTeam];
  setTimeout(() => {
    $('hud').classList.remove('on'); setBody(null); setCount('');
    $('endTitle').textContent = mine > theirs ? 'Победа!' : mine < theirs ? 'Поражение' : 'Ничья'; $('endTitle').className = mine > theirs ? 'win' : '';
    $('endReason').textContent = `${TEAM_NAMES[0]} ${a} : ${b} ${TEAM_NAMES[1]}`;
    const rows = m.players.slice().sort((x, y) => y.k - x.k || x.d - y.d)
      .map((p) => `<tr class="${p.id === me ? 'me' : ''}"><td>${String(p.name).replace(/[&<>]/g, '')}${p.bot ? ' <i>(бот)</i>' : ''}</td><td>${TEAM_NAMES[p.team]}</td><td>${p.k}</td><td>${p.d}</td></tr>`).join('');
    $('serverMsg').innerHTML = `<table class="mpRes"><tr><th>Пилот</th><th>Команда</th><th>Сбил</th><th>Сбит</th></tr>${rows}</table>`;
    $('end').classList.add('mpEnd'); $('againBtn').style.display = ''; $('againBtn').textContent = 'В лобби'; $('closeBtn').textContent = 'Выйти';
    show('end', true);
  }, 1200);
}
function mpBackToMenu() {
  MP.closeResults();
  show('end', false); show('pauseScr', false); $('end').classList.remove('mpEnd'); $('againBtn').textContent = 'Ещё вылет'; setCount('');
  $('hud').classList.remove('on'); setBody('menuing'); exitImmersive(); tgFlight(false);
  Object.assign(G, { state: 'menu', over: false, paused: false });
  clearMissiles();
  modeKey = MODES[store.get('fortuna_drone_mode')] ? store.get('fortuna_drone_mode') : 'arcade'; if (modeKey === 'training' && !TRAINING) modeKey = 'arcade';
  applyMode(); renderModeSel(); show('menu', true); showTab('mp');
}
// меню в онлайн-комнате: большая кнопка — «Готов», выбор режима скрыт (режим задаёт комната)
function mpSyncMenu(mp) {
  const me = mp.myInfo(), inRoom = !!mp.room;
  $('startBtn').textContent = !inRoom ? 'ВЗЛЁТ' : mp.inLobby() ? (me && me.ready ? 'ОТМЕНИТЬ ГОТОВНОСТЬ' : 'ГОТОВ') : 'ИДЁТ БОЙ…';
  $('startBtn').classList.toggle('ready', !!(inRoom && me && me.ready));
  $('modeSel').style.display = inRoom ? 'none' : '';
}
// приглашение в комнату: в Telegram — «поделиться» в чат, на телефоне — системное меню, иначе — ссылка в буфер
function shareInvite(url, text, btn) {
  try { if (TG.W && TG.W.openTelegramLink) { TG.W.openTelegramLink('https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(text)); return; } } catch (_) { /* не Telegram */ }
  if (navigator.share && IS_TOUCH) { navigator.share({ title: 'Симулятор Летки', text, url }).catch(() => {}); return; }
  const done = () => { btn.textContent = 'ссылка скопирована'; };
  try { navigator.clipboard.writeText(url).then(done, () => popup(url, 'info')); } catch (_) { popup(url, 'info'); }
}
const MP = createOnline({
  G, player, enemies, testName: (TEST && TRAINING && Q.get('mpname')) || '', inviteCode: (TRAINING && Q.get('mp')) || '', share: shareInvite,
  popup, tabEl: () => $('tab-mp'), syncMenu: mpSyncMenu, backToMenu: mpBackToMenu, goPlay: mpGoPlay,
  countdown: (n) => { setCount(n); },
  startOnline: mpStart, setHull: mpSetHull, hitMark: (c) => hitMarks.push({ pos: c.pos.clone(), t: 0.35, big: false }),
  meDown: mpMeDown, meUp: mpMeUp, makeRemote, remoteDown, remoteUp, removeRemote, remoteVisual,
  remoteShot: (c) => fireBullet(c, null, 0), showEnd: mpShowEnd,
  firing: () => (input.fire || held.has('fire')) && !player.overheated,
  radarLock: () => radar.lock, loadout: () => loaded.slice(),
  status: (t) => { if (MP.on || !t) setCount(t); }, applyYou: mpApplyYou,
  onFound: () => { if (G.state === 'menu') showTab('mp'); for (let i = 0; i < 3; i++) setTimeout(() => tone(880 + i * 220, 0.12, 'square', 0.05), i * 160); }, // «Бой найден» — вкладка и сигнал
  netLaunched: mpNetLaunched, netMotor: mpNetMotor,
  netDetonated: (m, hit) => { BFX.detonated(m, hit); BFX.missileResult(m, hit); },
  netGone: (m) => { scene.remove(m.mesh); },
  netCM: (c, type) => { B.spawnCMs(c, type); }, // чужие ловушки — только картинка
  lockLost: (why) => { if (!radar.lock) return; radar.lock = null; if (why === 'chaff') BFX.lockBroken(); else BFX.radarLost(); },
});
$('tab-mp').addEventListener('click', (e) => MP.onClick(e));
if (!TRAINING) $('mtabs').querySelector('[data-tab="mp"]').style.display = 'none'; // в партии на награду онлайна нет
else if (Q.get('mp')) showTab('mp'); // ссылка-приглашение (?mp=КОД) или кнопка «Онлайн-бой» на сайте (?mp=1) — сразу вкладка «Онлайн»

// сетевая ракета пущена (событие сервера): модель и вспышка; своя — снимается с пилона, с которого просили пуск
function mpNetLaunched(m, slot) {
  let sl = null;
  if (m.owner === player && slot >= 0 && slot < 8) {
    if (pylonMeshes[slot]) { sl = { mesh: pylonMeshes[slot] }; BFX.launchPos(player, m.key, sl, TMP); m.off.copy(TMP).sub(m.srv); } // показ стартует с пилона
    pylonMeshes[slot] = null; loaded[slot] = null; rebuildLoadStats(); ensureSel();
  }
  m.pos.copy(m.srv).add(m.off);
  BFX.launched(m, sl); // здесь m.pos становится положением модели
  missiles.push(m);
}
function mpNetMotor(m, motor, dt) {
  const tb = m.t - m.M.drop;
  BFX.motor(m, motor, tb);
  m.trailT -= dt; if (motor && m.trailT <= 0) { m.trailT = 0.025; BFX.trail(m, tb); }
}
function clearMissiles() {
  for (const m of missiles) scene.remove(m.mesh); missiles.length = 0; cms.length = 0;
  for (const b of bullets) { b.on = false; b.mesh.visible = false; }
}
function stepMissiles(dt) {
  for (let i = missiles.length - 1; i >= 0; i--) {
    const m = missiles[i];
    if (!m.dead) { if (m.net) MP.stepMissile(m, dt); else updateMissile(m, dt); m.mesh.quaternion.setFromUnitVectors(NEG_Z, m.dir); }
    if (m.dead) missiles.splice(i, 1);
  }
}

// ═════════════ Главный цикл ═════════════
const HANGAR = new THREE.Vector3(AIRFIELD.x, airfieldH() + 700, AIRFIELD.z);
// ═════════════ Лобби: планы камеры, пролёты самолётов, советы, рекорды ═════════════
// Камера медленно меняет планы (бок, низкий ракурс сзади с пламенем, сверху, общий план с местностью);
// время от времени рядом проходит самолёт «Подстилки улитки», звено или заправщик — со звуком и эффектом Доплера.
const LOBBY_SHOTS = [{ a: 0.6, d: 23, h: 6 }, { a: 2.75, d: 17, h: 2 }, { a: -0.55, d: 28, h: 12 }, { a: 1.35, d: 46, h: 15 }];
const lobby = { shot: 0, t: 0, jets: [], nextT: 5 };
function lobbySpawn() {
  const r = rnd(), kind = r < 0.4 ? 'fighter' : r < 0.65 ? 'interceptor' : r < 0.85 ? 'ace' : 'tanker';
  const tanker = kind === 'tanker', pair = !tanker && rnd() < 0.35;
  // проход «за» дроном относительно камеры, поперёк взгляда (иногда наискось)
  const cx = camera.position.x - HANGAR.x, cz = camera.position.z - HANGAR.z, cl = Math.hypot(cx, cz) || 1;
  const away = new THREE.Vector3(-cx / cl, 0, -cz / cl), side = (rnd() < 0.5 ? 1 : -1);
  const dir = new THREE.Vector3(-away.z * side, 0, away.x * side).applyAxisAngle(UP, (rnd() - 0.5) * 0.7);
  const speed = tanker ? 170 : 260 + rnd() * 120, ab = !tanker && rnd() < 0.45;
  const mid = HANGAR.clone().addScaledVector(away, tanker ? 420 + rnd() * 300 : 110 + rnd() * 220); mid.y += tanker ? 60 + rnd() * 80 : -25 + rnd() * 80;
  const T = tanker ? 11 : 6.5;
  for (let k = 0; k < (pair ? 2 : 1); k++) {
    const g = new THREE.Group(); g.rotation.order = 'YXZ';
    const mesh = tanker ? new THREE.Mesh(tankerGeo, MAT_METAL) : new THREE.Mesh(jetGeo(kind).geo, MAT_JET); g.add(mesh);
    const flames = tanker ? [] : jetGeo(kind).nozzles.map((nz) => { const f = new THREE.Mesh(flameGeo, flameMat); f.position.copy(nz); f.scale.set(1.1, 1.1, ab ? 4.5 : 1.5); f.visible = ab; g.add(f); return f; });
    const pos = mid.clone().addScaledVector(dir, -speed * T);
    if (k) pos.addScaledVector(dir, -40).add(new THREE.Vector3(dir.z * 35 * side, -6, -dir.x * 35 * side)); // ведомый — уступом
    const j = { g, flames, pos, vel: dir.clone().multiplyScalar(speed), fwd: dir.clone(), ab, tanker, life: T * 2 + 2, bank: 0 };
    g.position.copy(pos); g.rotation.set(0, Math.atan2(-dir.x, -dir.z), 0); scene.add(g); lobby.jets.push(j);
  }
}
function lobbyUpdate(dt) {
  lobby.nextT -= dt;
  if (lobby.nextT <= 0 && lobby.jets.length < 3) { lobbySpawn(); lobby.nextT = 16 + rnd() * 20; }
  for (let i = lobby.jets.length - 1; i >= 0; i--) {
    const j = lobby.jets[i]; j.life -= dt; j.pos.addScaledVector(j.vel, dt);
    j.g.position.copy(j.pos);
    for (const f of j.flames) f.scale.z = (j.ab ? 4.5 : 1.5) * (0.85 + rnd() * 0.3);
    if (j.ab) { const n = TMP.set(0, 0, 7).applyQuaternion(j.g.quaternion).add(j.pos); FX.emit(n.x, n.y, n.z, -j.vel.x * 0.12, -j.vel.y * 0.12, -j.vel.z * 0.12, 1, 0.55, 0.2, 0.6, 2.2, 3, 0.1, 0, 0); }
    if (j.life <= 0 || G.state !== 'menu') { scene.remove(j.g); lobby.jets.splice(i, 1); }
  }
}
function menuView(dt) {
  G.menuT += dt;
  player.pos.copy(HANGAR); player.pitch = 0.06 * Math.sin(G.menuT * 0.7); player.roll = 0.12 * Math.sin(G.menuT * 0.5); player.yaw = G.menuT * 0.22;
  player.ab = false; player.thr = 0.85; player.cmdX = Math.sin(G.menuT * 0.8) * 0.4; player.cmdY = 0; placeShip();
  // смена плана: 11 с на план, переход 2,5 с (плавный, без рывков)
  lobby.t += dt; if (lobby.t > 11) { lobby.t = 0; lobby.shot = (lobby.shot + 1) % LOBBY_SHOTS.length; }
  const a = LOBBY_SHOTS[(lobby.shot + LOBBY_SHOTS.length - 1) % LOBBY_SHOTS.length], b = LOBBY_SHOTS[lobby.shot];
  const k = lobby.t < 2.5 ? (1 - Math.cos(Math.PI * lobby.t / 2.5)) / 2 : 1, drift = G.menuT * 0.02;
  const portrait = VW < VH, ang = a.a + (b.a - a.a) * k + drift, cd = (a.d + (b.d - a.d) * k) * (portrait ? 1.17 : 1), ch = a.h + (b.h - a.h) * k;
  camera.position.set(HANGAR.x + Math.sin(ang) * cd, HANGAR.y + ch, HANGAR.z + Math.cos(ang) * cd);
  camera.up.set(0, 1, 0); camera.lookAt(HANGAR);
  const fov = portrait ? 80 : 58; if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
  if (portrait) camera.setViewOffset(VW, VH, 0, VH * 0.24, VW, VH); else camera.setViewOffset(VW, VH, -VW * 0.2, 0, VW, VH);
  lobbyUpdate(dt);
}
// Советы в лобби: сменяются сами, тап — следующий
const TIPS = [
  'Ракета «не догоняет»? Отворачивайте так, чтобы она оказалась на 3 или 9 часов — ей придётся тянуть перегрузку и терять скорость.',
  'ЛТЦ отстреливайте, когда ИК-ракета ближе 3 км: раньше она успеет отличить ловушку от сопла.',
  'Против радиолокационной ракеты — «провал»: держите её на 3/9 часов и снижайтесь, чтобы радар смотрел на землю. Плюс диполи.',
  'Форсаж даёт скорость, но жжёт топливо втрое быстрее и делает вас ярче для ИК-головок.',
  'Неизбежная зона пуска — зелёная полоса на шкале радара. Пуск в ней почти не оставляет цели шансов.',
  'Полуактивным ракетам (AIM-7, Р-27Р) нужен захват радара до самого попадания — не отворачивайте нос от цели.',
  'Активные ракеты (AIM-120, Р-77, Meteor) после «ГСН» наводятся сами — можно уходить.',
  'Каждая ракета снаружи — масса и заметность: полностью увешанный дрон противник видит на треть дальше.',
  'Заправщик — жёлтая метка. Подойдите к корзине на малом газу и держитесь в ней пару секунд.',
  'Флагман «Подстилки улитки» ставит помехи: радар возьмёт его только ближе 16 км.',
  'Сверху вниз радар противника путается на фоне земли — это ваш шанс подойти незамеченным.',
  'Перегрузка съедает скорость. Резкий вираж хорош для уклонения, а для погони — плавный.',
  'Ранние ИК-ракеты (AIM-9B, Р-3С) видят только горячее сопло — пускайте строго в хвост.',
  'СПО показывает, кто вас облучает: ромб вокруг метки — захват, мигание — пуск.',
  'Взгляд назад (кнопка «НАЗАД» / V) показывает догоняющие ракеты и позволяет рассчитать отворот.',
  'В Реализме ракеты противника видны только по датчику пуска и СПО — слушайте звуковые сигналы.',
];
let tipI = (rnd() * TIPS.length) | 0, tipT = 0;
function showTip(next) {
  if (next) tipI = (tipI + 1) % TIPS.length;
  const el2 = $('lobbyTip'); if (!el2) return;
  el2.classList.remove('in'); void el2.offsetWidth; el2.classList.add('in');
  el2.innerHTML = `<b>Совет.</b> ${TIPS[tipI]}`;
}
function tipTick(dt) { if (G.state !== 'menu') return; tipT += dt; if (tipT > 12) { tipT = 0; showTip(true); } }
$('lobbyTip').addEventListener('click', () => { tipT = 0; showTip(true); });
// Личные рекорды (на этом устройстве) — по режимам
function loadStats() { try { return JSON.parse(store.get('fortuna_drone_stats') || '{}') || {}; } catch (_) { return {}; } }
function saveRunStats() {
  if (MODE.training) return;
  const all = loadStats(), r = all[modeKey] || { runs: 0, best: 0, bestKills: 0, kills: 0, fired: 0, hits: 0, boss: 0 };
  r.runs++; r.kills += G.kills; r.fired += G.mFired; r.hits += G.mHits; if (G.bossKilled) r.boss++;
  const rec = G.score > r.best; r.best = Math.max(r.best, G.score); r.bestKills = Math.max(r.bestKills, G.kills);
  all[modeKey] = r; store.set('fortuna_drone_stats', JSON.stringify(all)); return rec;
}
function renderStats() {
  const el2 = $('lobbyStats'); if (!el2) return;
  if (MODE.training) { el2.innerHTML = 'Обучение: 22 ракеты по очереди, игра на паузе с объяснением каждой.'; return; }
  const r = loadStats()[modeKey];
  el2.innerHTML = r && r.runs ? `Рекорд (${MODE.name}): <b>${r.best.toLocaleString('ru-RU')}</b> очков · ${r.bestKills} сбито за вылет · вылетов ${r.runs}${r.fired ? ` · точность ракет ${Math.round(r.hits / r.fired * 100)}%` : ''}${r.boss ? ` · флагман сбит ×${r.boss}` : ''}`
    : `${MODE.name}: рекордов пока нет — первый вылет впереди.`;
}
renderStats(); showTip(false);
// ═════════════ Звук: каждый кадр ═════════════
const sndCands = [], SND_POOL = [];
function updateSound(dt) {
  if (!AU.ready) return;
  const st = G.state, flying = st === 'play' || st === 'countdown', inLobby = st === 'menu';
  const on = (flying || inLobby) && !bench.active;
  fwdOf(player, TMP3); TMP.copy(player.pos).sub(camera.position).normalize();
  const rear = clamp((TMP.dot(TMP3) + 1) / 2, 0, 1); // 1 — камера за соплом, 0 — перед носом
  const W_ = world.W, above = W_.deck ? clamp((camera.position.y - W_.deck.h + 200) / 400, 0, 1) : 0;
  AU.frame(dt, { on, lobby: inLobby, rpmTarget: inLobby ? 0.66 : player.ab ? 1 : 0.6 + 0.4 * clamp((player.thr - 0.55) / 0.45, 0, 1),
    ab: flying && player.ab, speed: inLobby ? 170 : player.speed, mach: inLobby ? 0.5 : player.mach, sup: flying && !!player.sup,
    n: inLobby ? 1 : player.n, rear, agl: inLobby ? 700 : agl(player), rain: world.rainK * (1 - above) });
  AU.gun(st === 'play' && (input.fire || held.has('fire')) && !player.overheated);
  sndCands.length = 0;
  // записи для объёмного звука — из пула (без новых объектов каждый кадр)
  const cand = (o, kind, pos, vel, fwd, ab, gain) => { const c = pooled(SND_POOL, sndCands.length); c.o = o; c.kind = kind; c.pos = pos; c.vel = vel; c.fwd = fwd; c.ab = ab; c.gain = gain; sndCands.push(c); };
  if (flying) {
    for (const e of enemies) if (!e.dead) { e.sfwd = fwdOf(e, e.sfwd || new THREE.Vector3()); cand(e, e.type === 'boss' ? 'boss' : 'jet', e.pos, e.vel, e.sfwd, e.ab, 1); }
    for (const m of missiles) if (!m.dead && m.t - m.M.drop < m.M.burn + (m.M.sustain ? m.M.sustain.t : 0)) { m.svel = (m.svel || new THREE.Vector3()).copy(m.dir).multiplyScalar(m.speed); cand(m, 'msl', m.pos, m.svel, null, false, 1); }
    for (const t of tankers) if (!t.done && t.mesh) cand(t, 'jet', t.pos, t.vel, null, false, 0.8);
  } else if (inLobby) for (const j of lobby.jets) cand(j, 'jet', j.pos, j.vel, j.fwd, j.ab, j.tanker ? 0.9 : 1.3);
  AU.spatial(dt, camera, flying ? player.vel : null, sndCands, on);
}
function tick(dt) {
  MP.update(dt);
  if (G.state === 'play') {
    G.runTime += dt;
    if (!MODE.training && !MP.on) runSchedule();
    if (!MP.down) { updatePlayer(dt); updateRadar(dt); updateSeeker(dt); }
    for (let i = enemies.length - 1; i >= 0; i--) { const e = enemies[i]; if (!e.dead && !e.remote) updateAI(e, dt); if (e.dead) enemies.splice(i, 1); }
    if (MODE.training) trainingTick(dt);
    stepMissiles(dt);
    updateBullets(dt); updateCMs(dt); updateWrecks(dt); updateTankers(dt); updateRwr(dt);
    updateMissileLights();
    if (MODE.training || MP.on) { /* обучение без ограничения по времени; онлайн-бой заканчивает сервер */ }
    else if (G.runTime >= H_CAP) endGame('time');
    else if (G.bossSpawned && !enemies.length && !schedule.slice(schedIdx).some((ev) => ev.type !== 'tanker')) endGame('win');
  } else if (G.state === 'over') {
    stepMissiles(dt);
    updateCMs(dt); updateWrecks(dt);
  }
  if (G.state === 'play' || G.state === 'countdown' || G.state === 'over') {
    if (G.state === 'countdown') { player.pos.addScaledVector(player.vel, dt); }
    ship.visible = !(G.over && player.hull <= 0) && !MP.down;
    placeShip(); updateCamera(dt); updateShock(dt);
    if (G.state !== 'over') updateHud(dt);
  } else if (G.state === 'menu') menuView(dt);
  if (G.state !== 'pause') {
    SMOKE.update(dt); FX.update(dt);
    const ev = world.update(dt, G.state === 'play' || G.state === 'countdown' ? player.vel : null);
    if (ev && ev.thunder) setTimeout(() => AU.thunder(ev.thunder), ev.delay * 1000);
    if (P.propsLvl >= 1) smokeStacks(dt);
    if (boomLight.intensity > 0) boomLight.intensity = Math.max(0, boomLight.intensity - dt * 8);
  }
  updateSound(dt); tipTick(dt);
}
// дым труб и пар градирни промзоны (ветер несёт шлейф; дальше 14 км не рисуем)
let stackT = 0;
function smokeStacks(dt) {
  stackT += dt; if (stackT < 0.3) return; stackT = 0;
  for (const e of world.emitters) {
    if (Math.hypot(e.x - camera.position.x, e.z - camera.position.z) > 14000) continue;
    if (e.kind === 'steam') SMOKE.emit(e.x + (rnd() - 0.5) * 30, e.y, e.z + (rnd() - 0.5) * 30, 3 + rnd() * 2, 5 + rnd() * 2, 1.5, 0.96, 0.97, 0.98, 0.55, 30, 16, 10, 0.05, 0.4);
    else SMOKE.emit(e.x, e.y, e.z, 4 + rnd() * 2, 3 + rnd() * 2, 1.5 + rnd(), 0.42, 0.41, 0.4, 0.45, 8, 9, 16, 0.03, 0.3);
  }
}
// положение солнца на экране и его видимость (рельеф на пути к солнцу гасит блики и лучи)
const sunScr = { x: 0.5, y: 0.5, vis: 0 };
function updateSun() {
  const sp = TMP.copy(camera.position).addScaledVector(SUN_DIR, 10000).project(camera);
  let vis = sp.z < 1 && Math.abs(sp.x) < 1.3 && Math.abs(sp.y) < 1.3;
  if (vis) for (let k = 1; k <= 12; k++) { const q = TMP2.copy(camera.position).addScaledVector(SUN_DIR, k * 700); if (q.y < terrainH(q.x, q.z)) { vis = false; break; } }
  sunScr.x = (sp.x + 1) / 2; sunScr.y = (sp.y + 1) / 2; sunScr.nx = sp.x; sunScr.ny = sp.y;
  vis = vis && world.W.sunVis > 0 && !(world.W.deck && camera.position.y < world.W.deck.h); // за сплошными облаками солнца нет
  sunScr.vis += ((vis ? clamp(1.35 - Math.hypot(sp.x, sp.y) * 0.6, 0, 1) : 0) - sunScr.vis) * 0.2;
}
function render() {
  const s = renderer.getPixelRatio() * (pipe ? pipe.scale : 1) * VH / (2 * Math.tan(camera.fov * D2R / 2));
  SMOKE.mat.uniforms.scale.value = s; FX.mat.uniforms.scale.value = s;
  world.follow(camera.position, P.shadows ? player.pos : null, agl(player));
  updateSun();
  if (pipe) pipe.render(scene, camera, performance.now() / 1000, sunScr); else renderer.render(scene, camera);
  if (P.flares) updateLensFlare();
}
// Блики объектива (Ультра/Кино): цепочка кругов через центр кадра — на своём холсте (раньше — DOM-слой с режимом
// смешивания «экран», который iPhone пересобирал каждый кадр); холст перерисовывается, только пока солнце в кадре
const FLARES = [[300, '255,240,200', 0.26], [70, '160,210,255', 0.35], [130, '255,200,140', 0.2], [40, '200,255,220', 0.4], [190, '140,170,255', 0.13], [22, '255,255,255', 0.5]];
const FLARE_PTS = [1, 0.4, -0.2, -0.6, -1.1, 0.15];
let fc = null, fx = null, flareDrawn = false;
if (P.flares) { fc = document.createElement('canvas'); fc.id = 'flarec'; document.body.insertBefore(fc, $('hud')); fx = fc.getContext('2d'); }
function updateLensFlare() {
  const a = sunScr.vis;
  if (a < 0.01) { if (flareDrawn) { fx.setTransform(1, 0, 0, 1, 0, 0); fx.clearRect(0, 0, fc.width, fc.height); flareDrawn = false; } return; }
  const r = Math.min(1.5, window.devicePixelRatio || 1), w = Math.round(VW * r), h = Math.round(VH * r);
  if (fc.width !== w || fc.height !== h) { fc.width = w; fc.height = h; }
  fx.setTransform(r, 0, 0, r, 0, 0); fx.clearRect(0, 0, VW, VH); fx.globalCompositeOperation = 'lighter';
  FLARES.forEach(([sz, rgb, al], i) => {
    const x = (sunScr.nx * FLARE_PTS[i] + 1) / 2 * VW, y = (1 - sunScr.ny * FLARE_PTS[i]) / 2 * VH, R = sz / 2;
    const g = fx.createRadialGradient(x, y, 0, x, y, R); g.addColorStop(0, `rgba(${rgb},${(al * a).toFixed(3)})`); g.addColorStop(0.7, `rgba(${rgb},0)`);
    fx.fillStyle = g; fx.fillRect(x - R, y - R, sz, sz);
  });
  fx.globalCompositeOperation = 'source-over'; flareDrawn = true;
}
// Счётчик кадров (включается в «Настройках»)
const fpsEl = document.createElement('div'); fpsEl.id = 'fpsMeter'; document.body.appendChild(fpsEl);
let fpsT = 0;
function updateFpsMeter(dtMs) {
  fpsT += dtMs; if (fpsT < 500) return; fpsT = 0;
  const on = perf.fps && (G.state === 'play' || G.state === 'countdown' || G.state === 'pause'); // в меню не мешает кнопке «ВЗЛЁТ»
  if (fpsEl._on !== on) { fpsEl._on = on; fpsEl.style.display = on ? 'block' : 'none'; }
  if (!on || !dr.fps) return;
  const hz = dr.vs ? Math.round(1000 / dr.vs) : 0;
  fpsEl.textContent = `${Math.round(dr.fps)}${hz ? '/' + hz : ''} к/с · худш. ${Math.round(dr.low)} · ${Math.round((pipe ? pipe.scale : dr.scale) * 100)}%${dr.q ? ' · дет. ' + Math.round(QK[dr.q] * 100) + '%' : ''}${pipe && pipe.fx ? ' · FX½' : ''}${perf.up !== 'off' ? ' · ' + (perf.up === 'fsr' ? 'FSR' : 'CAS') : ''}${perf.aa !== 'off' ? ' · ' + perf.aa.toUpperCase() : ''}`;
}
let last = performance.now(), lastDraw = 0, lastState = '';
function frame(now) {
  requestAnimationFrame(frame);
  if (bench.active) { last = now; return; }
  // ограничитель кадров (меню — 30 к/с: фон не должен греть телефон). Допуск — треть периода экрана:
  // метки времени кадров «дрожат» на 1–2 мс, и с жёстким порогом каждый второй кадр пропускался бы (60 → 30)
  const capMs = perf.cap ? 1000 / perf.cap : (G.state === 'menu' ? 1000 / 30 : 0);
  if (capMs && now - lastDraw < capMs - Math.max(1.5, (dr.vs || 16.7) * 0.33)) return;
  const frameMs = now - lastDraw; lastDraw = now;
  const dt = Math.min(0.05, (now - last) / 1000) * (G.slowmo > 0 ? 0.3 : 1); last = now;
  if (G.slowmo > 0) G.slowmo -= dt / 0.3;
  tick(dt); render();
  if (G.state !== lastState) { lastState = G.state; drReset(); } // окно замера — только внутри одного состояния
  else if (frameMs < 250 && G.state !== 'menu') { drUpdate(frameMs); updateFpsMeter(frameMs); }
}
// Частота экрана: несколько пустых кадров до начала отрисовки (нагрузки нет — интервал = период развёртки)
function measureRefresh() {
  return new Promise((res) => {
    const t = []; let prev = 0, n = 0;
    const f = (now) => { if (prev) t.push(now - prev); prev = now; if (++n < 14) requestAnimationFrame(f); else res(t); };
    requestAnimationFrame(f); setTimeout(() => res(t), 600);
  }).then((t) => { if (t.length > 4) { t.sort((a, b) => a - b); dr.vs = snapPeriod(t[Math.floor(t.length / 2)]); } });
}
// Прогрев шейдеров: все материалы (в том числе скрытые — пламя форсажа, пули, самолёты противника) собираются
// за экраном загрузки, а не в момент первого взрыва или пуска — без заморозок посреди боя
const warmGroup = new THREE.Group(); warmGroup.visible = false; warmGroup.add(new THREE.Mesh(jetGeo('fighter').geo, MAT_JET)); scene.add(warmGroup);
function warmShaders() {
  try { const prev = renderer.getRenderTarget(); if (pipe && pipe.target && !pipe.cfg.ldr) renderer.setRenderTarget(pipe.target); renderer.compile(scene, camera); renderer.setRenderTarget(prev); } catch (_) { /* не критично */ }
}
warmShaders();
measureRefresh().then(() => { try { render(); } catch (_) { /* первый кадр — ещё под экраном загрузки */ } $('loading').remove(); requestAnimationFrame(frame); });

if (TEST && TRAINING) window.__g = { MP, camera, ship, scene, G, player, enemies, missiles, tankers, bullets, cms, schedule, radar, seeker, input, held, binds, loaded, MISSILES, AC, rwr,
  spawnAI, spawnTanker, endGame, hurt, dlz, buildSchedule, maxKills, SEED, tick, render, launchPlayerMissile, launchMissile, cycleLock, cycleWeapon, dropCM, updateHud, runBenchmark,
  renderer, AU, lobby, world, terrainH, TOWNS, AIRFIELD, explosion, SMOKE, applyPerf, applyWeatherKey, WEATHERS, showUpscaleResult, touchCfg: () => touchCfg,
  getSel: () => selType, gunT: () => gunTarget, gfx: () => gfxKey, mode: () => modeKey, TR, openLesson, closeLesson, perf, pipe: () => pipe, dr,
  renderAll() { renderModeSel(); renderLoadTab(); renderRefTab(); renderGuideTab(); renderSettingsTab(); }, setMode(k) { modeKey = k; applyMode(); renderModeSel(); },
  setLoadout(arr) { loadout = arr.slice(); applyLoadout(); renderLoadTab(); },
  begin() { show('menu', false); setBody('playing'); $('hud').classList.add('on'); camera.clearViewOffset(); applyMode(); applyLoadout(); placeAtStart(); G.state = 'play'; } };
