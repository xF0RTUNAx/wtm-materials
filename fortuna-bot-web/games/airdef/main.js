// «Воздушное превосходство» — ядро: город, рендер, бой (sim/strike.js + ИИ-налёт sim/raid.js), эффекты, звук, кадр,
// экраны паузы и итогов. Режимы — отдельные модули с общим контекстом C:
//   air.js      — вылет за самолёт против ИИ-ПВО;
//   defense.js  — «Оборона города»: расстановка, волны ИИ-ударников, командир и оператор ЗРК;
//   director.js — живой фон главного меню: ИИ-налёт против ИИ-ПВО и «режиссёр» камеры;
//   training.js — обучение за обе стороны (подсказки и объяснения на паузе);
//   menu.js     — карточка меню: режимы, вкладки «Бой», «Арсенал», «Руководство», «Настройки».
// Параметры адреса: ?gfx=low|medium|high|ultra, ?weather=…, ?touch=1, ?test=1 (window.__a), ?go=air|defense — сразу в бой,
// ?view=x,y,z,курс°,тангаж° — неподвижная камера (снимки города).
/* global THREE */
import { buildCity, CITY } from './city.js?v=20261013a';
import { buildCityScene, updateCityScene, UPX, ENV } from './city-render.js?v=20261013a';
import { createPipeline } from '../drone/post.js?v=20261013a';
import { setGround, D2R, clamp, fwdOf } from '../drone/sim/core.js?v=20261013a';
import { WEATHERS, FXU, FX_LAYER, FX_ADD_LAYER } from '../drone/world.js?v=20261013a';
import { AG, SAM, LOADOUTS, DEFENSE, raidPlane } from './arsenal.js?v=20261013a';
import { createStrike, MODES } from './sim/strike.js?v=20261013a';
import { createRaid } from './sim/raid.js?v=20261013a';
import { unitModel, weaponGeo, samGeos, rocketFlame, strikerGeo, createFx, attachFlames } from './units-render.js?v=20261013a';
import { slotCount } from './launchers.js?v=20261013a';
import { loadModels, planeModel, classOfRole, weaponMesh, unitModelGlb, unitMissileGlb, launcherGlb, isUnitModel, isObjModel, objModel, wantUnit, bldModel, wantBuildings } from './models.js?v=20261013a';
import { createSound } from './sound.js?v=20261013a';
import { createAir } from './air.js?v=20261013a';
import { createDefense } from './defense.js?v=20261013a';
import { createDirector } from './director.js?v=20261013a';
import { createOnline } from './online.js?v=20261013a';
import { createShell } from './shell.js?v=20261013a';
import { createTraining, LESSONS } from './training.js?v=20261013a';
import { createMenu } from './menu.js?v=20261013a';
import { orientGate } from '../orient-warn.js?v=20261011a';

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
if (Q.get('test') === '1') addEventListener('error', (e) => (window.__errs = window.__errs || []).push(e.error ? e.error.stack : e.message)); // для проверки: стеки ошибок
const IS_TOUCH = Q.get('touch') === '1' || matchMedia('(pointer: coarse)').matches;
document.body.classList.toggle('coarse', IS_TOUCH);
const ls = { get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* приватный режим */ } } };

// ═════════════ Пресеты графики ═════════════
export const PRESETS = {
  low: { name: 'Низкий', fxLo: true, lodObj: 3500, desc: 'слабые телефоны', prCap: 1.25, prMul: 0.8, draw: 8000, houseK: 0.5, bldNear: 0, groundSeg: 160, zoneTex: 512, trees: 0, clouds: 0, roofDetail: false, shadows: false, particles: 1500,
    perf: { scale: 1, min: 0.75, aa: 'off', up: 'off' } },
  medium: { name: 'Средний', fxLo: true, lodObj: 4500, desc: 'большинство телефонов', prCap: 1.5, prMul: 1, draw: 11000, houseK: 0.8, bldNear: 300, treeNear: 110, groundSeg: 256, zoneTex: 1024, trees: 3500, clouds: 150, roofDetail: true, shadows: false, particles: 2500,
    perf: { scale: 1, min: 0.7, aa: 'fxaa', up: 'cas', sharp: 0.45 } },
  // «Кастомный»: всё настраивается (Настройки → «Кастомный»). Основа — техника, ракеты, бомбы, самолёты и эффекты как на
  // «Высоком» (тени вблизи, свечение, сглаживание), город проще
  custom: { name: 'Кастомный', lodObj: 5000, desc: 'свои настройки: разрешение, тени, город, эффекты', prCap: 1.5, prMul: 1, draw: 12000, houseK: 0.8, bldNear: 0, treeNear: 0, groundSeg: 256, zoneTex: 1024, trees: 5000, clouds: 300, roofDetail: true, particles: 4000,
    shadows: true, shadowMap: 2048, shadowBox: 450, aniso: 4, props: false,
    perf: { scale: 1, min: 0.6, aa: 'msaa', up: 'cas', sharp: 0.4 }, post: { bloom: 0.35, grade: 0.18, vignette: 0.14 } },
  high: { name: 'Высокий', lodObj: 6000, desc: 'мощные телефоны и ПК: тени, свечение', prCap: 2, prMul: 1, draw: 16000, houseK: 1, bldNear: 450, treeNear: 170, groundSeg: 320, zoneTex: 1024, trees: 14000, clouds: 500, roofDetail: true, particles: 4000,
    shadows: true, shadowMap: 2048, shadowBox: 600, aniso: 4,
    perf: { scale: 1, min: 0.67, aa: 'msaa', up: 'cas', sharp: 0.4 }, post: { bloom: 0.35, grade: 0.18, vignette: 0.14 } },
  ultra: { name: 'Ультра', lodObj: 8000, desc: 'тени 4K, тени деревьев, дальняя прорисовка', prCap: 2, prMul: 1, draw: 20000, houseK: 1, bldNear: 650, treeNear: 260, groundSeg: 384, zoneTex: 2048, trees: 24000, clouds: 900, roofDetail: true, particles: 6000,
    shadows: true, treeShadows: true, shadowMap: 4096, shadowBox: 800, aniso: 8,
    perf: { scale: 1, min: 0.67, aa: 'msaa', up: 'fsr', sharp: 0.35 }, post: { bloom: 0.6, vignette: 0.18, grade: 0.3, exposure: 0.95 } },
};
export const WEATHER_KEYS = ['day', 'morning', 'evening', 'sunset', 'overcast'];
const CINEMA = Q.get('gfx') === 'cinema'; // запись промо-ролика (tools/airdef-promo): «Ультра» на пределе; в меню его нет
let gfxKey = CINEMA ? 'ultra' : Q.get('gfx') || ls.get('fortuna_airdef_gfx') || (IS_TOUCH ? 'medium' : 'high');
if (!PRESETS[gfxKey]) gfxKey = 'medium';
// свои настройки пресета «Кастомный» (Настройки; применяются перезапуском): разрешение, динамическое
// разрешение и его цель, тени, город, детали улиц, эффекты кадра, сглаживание, дальность; на сенсорных — без ×2 (если не «полное»)
const GO = (() => { try { return JSON.parse(ls.get('fortuna_airdef_gfxo') || '{}') || {}; } catch (_) { return {}; } })();
function applyGfx(base, o) {
  const P = { ...base, perf: { ...base.perf }, post: base.post ? { ...base.post } : null };
  if (IS_TOUCH && !o.fullRes) P.prCap = Math.min(P.prCap, 1.5);
  if (o.rs) P.perf.scale = clamp(+o.rs, 0.4, 1);
  if (o.dyn === false) P.perf.dynOff = true;
  if (o.dynMin) P.perf.min = clamp(+o.dynMin, 0.35, 1);
  if (o.fps) P.perf.goal = +o.fps;
  if (o.sh === 'off') P.shadows = false;
  else if (o.sh === 'low') Object.assign(P, { shadows: true, shadowMap: 1024, shadowBox: 400, treeShadows: false });
  else if (o.sh === 'mid') Object.assign(P, { shadows: true, shadowMap: 2048, shadowBox: 600, treeShadows: false });
  else if (o.sh === 'high') Object.assign(P, { shadows: true, shadowMap: 4096, shadowBox: 800, treeShadows: true });
  // город: простой — коробки и мало деревьев; средний — дома и деревья моделями вблизи; полный — как на «Высоком»
  if (o.city === 'low') Object.assign(P, { bldNear: 0, treeNear: 0, trees: 3000, houseK: 0.6, groundSeg: Math.min(P.groundSeg, 192) });
  else if (o.city === 'mid') Object.assign(P, { bldNear: 250, treeNear: 100, trees: 8000, houseK: 0.9 });
  else if (o.city === 'full') Object.assign(P, { bldNear: 450, treeNear: 170, trees: 14000, houseK: 1 });
  if (o.trees !== undefined) { const k = clamp(+o.trees, 0, 2); P.trees = Math.round(P.trees * k); if (!k) P.treeNear = 0; }
  if (o.props === false) P.props = false; else if (o.props === true) P.props = true;
  if (o.fx === false) P.post = null;
  if (o.aa) P.perf.aa = o.aa;
  if (o.up) P.perf.up = o.up;
  if (o.draw) P.draw = Math.round(P.draw * clamp(+o.draw, 0.5, 1.3));
  if (o.clouds !== undefined) P.clouds = Math.round(P.clouds * clamp(+o.clouds, 0, 2));
  if (o.parts) P.particles = Math.round(P.particles * clamp(+o.parts, 0.3, 1.5));
  if (o.tex === 'low') Object.assign(P, { zoneTex: 512, aniso: 1 }); else if (o.tex === 'high') Object.assign(P, { zoneTex: 2048, aniso: 8 });
  if (o.pod) P.podHalf = o.pod === 'half';
  if (o.cap !== undefined) P.cap = +o.cap; // 0 — без ограничения (на сенсорных — 60)
  if (o.shRate) P.shEvery = +o.shRate;
  return P;
}
// сенсорные (телефоны, планшеты) — то, что почти не видно, но дорого видеочипу: тени ≤ 2048 и ближе, без MSAA (у «Кастомного» —
// как выбрано), свечение с четверти разрешения, облака и дым — в половине разрешения (post.js), фильтр теней попроще
function touchGfx(P, custom) {
  if (!IS_TOUCH) return P;
  if (P.shadowMap > 2048) Object.assign(P, { shadowMap: 2048, shadowBox: Math.min(P.shadowBox, 600) });
  if (!custom && P.perf.aa === 'msaa') P.perf.aa = 'fxaa';
  P.bloomQ = true; P.halfFx = true; P.treeLoD = 1600;
  return P;
}
// окно контейнера через кадр — по умолчанию на сенсорных (телефоны, планшеты) и на «Низком»/«Среднем»
for (const k in PRESETS) if (PRESETS[k].podHalf === undefined) PRESETS[k].podHalf = IS_TOUCH || k === 'low' || k === 'medium';
const P0 = touchGfx(gfxKey === 'custom' ? applyGfx(PRESETS.custom, GO) : applyGfx(PRESETS[gfxKey], { fullRes: GO.fullRes }), gfxKey === 'custom'); // свои настройки — только у «Кастомного»
const P = CINEMA ? Object.assign(P0, { name: 'Кино', lodObj: 1e9, draw: 26000, bldNear: 5000, treeNear: 3000, trees: 32000, // дома и деревья готовыми моделями на километры clouds: 1100, particles: 9000, props: true, shadowMap: 4096, shadowBox: 900,
  treeShadows: true, aniso: 16, zoneTex: 2048, prCap: 2, podHalf: false, perf: { ...P0.perf, scale: 1, dynOff: true, aa: 'msaa', up: 'off' }, post: { ...P0.post, bloom: 0.5 } }) : P0;
const weatherKey = Q.get('weather') || ls.get('fortuna_airdef_weather') || 'random';
const W_KEY = WEATHER_KEYS.includes(weatherKey) ? weatherKey : WEATHER_KEYS[Math.floor(Math.random() * WEATHER_KEYS.length)];
const W = WEATHERS[W_KEY];
if (CINEMA) { W.hazeK = (W.hazeK || 0) * 0.45; W.fogD = (W.fogD || 0) * 0.55; } // ролик: даль чище — высотки Сити не тонут в дымке

// ═════════════ Настройки боя (сохраняются) ═════════════
// game: 'air' — вылет, 'defense' — оборона, 'training'; diff — Аркада/Реализм; era; side — сторона ПВО города; lo — подвеска;
// tside — ветка обучения ('air' | 'def'), tl — урок
// op — «Операция» из 2 вылетов: lo1 — охота за ПВО, lo2 — удар
const setup = { game: 'air', diff: 'arcade', era: 2, side: 'east', lo: 0, op: false, lo1: 0, lo2: 0, tside: 'air', tl: 0 };
try { Object.assign(setup, JSON.parse(ls.get('fortuna_airdef_setup') || '{}')); } catch (_) { /* по умолчанию */ }
if (!MODES[setup.diff]) setup.diff = 'arcade';
if (!LOADOUTS[setup.era]) setup.era = 2;
if (!LOADOUTS[setup.era][setup.lo]) setup.lo = 0;
if (!DEFENSE[setup.side]) setup.side = 'east';
if (!['air', 'defense', 'training', 'online'].includes(setup.game)) setup.game = 'air';

// ═════════════ Город и рендер ═════════════
const city = buildCity(1);
setGround(city.groundH);
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMappingExposure = ((P.post && P.post.exposure) || 1.1) * (W.exposure || 1);
renderer.shadowMap.enabled = !!P.shadows; renderer.shadowMap.type = IS_TOUCH ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 3, 50000);
camera.rotation.order = 'YXZ';
const basePR = Math.min((window.devicePixelRatio || 1) * P.prMul, P.prCap);
const perf = { ...P.perf };
let pipe = null, sceneTM = THREE.ACESFilmicToneMapping;
if (P.post || perf.aa !== 'off' || perf.up !== 'off') {
  const ldr = !P.post;
  pipe = createPipeline(renderer, { ...(P.post || {}), ldr, exposure: renderer.toneMappingExposure, scale: perf.scale, upscaler: perf.up, sharp: perf.sharp || 0.4, aa: perf.aa,
    bloomQ: !!P.bloomQ, fx: !!P.halfFx, fxU: FXU, fxLayer: FX_LAYER, fxAddLayer: FX_ADD_LAYER }); // fx — облака и дым в половине разрешения (слои FX_*)
  sceneTM = ldr ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
  renderer.setPixelRatio(basePR);
} else renderer.setPixelRatio(basePR * perf.scale);
renderer.toneMapping = sceneTM;
const snd = createSound();

// ═════════════ Общий контекст режимов ═════════════
const C = {
  $, Q, IS_TOUCH, ls, P, W, W_KEY, weatherKey, gfxKey, NIGHT: W.night || 0, city, scene, camera, renderer, snd, setup,
  get pipe() { return pipe; }, get sceneTM() { return sceneTM; },
  VW: 1, VH: 1, fx: null, G: null, S: null, raid: null, player: null, ctrl: null, state: 'loading', paused: false, t: 0,
  hooks: {}, // события боя для текущего режима
  MODE: () => (C.net && C.net.battle ? MODES[C.net.battle.mode] : MODES[setup.diff]), // онлайн — режим комнаты
  // чувствительность: ручка (тангаж/крен), ведение контейнера, поворот обзора оператора
  // invert — вверх нос вниз (как в авиасимуляторах); pad — крестовина тангажа и крена, padK — её сила; aim — наведение камерой (сенсорные), иначе ручка
  sens: Object.assign({ stick: 1, look: 1, invert: false, pad: true, padK: 0.5, aim: true }, (() => { try { return JSON.parse(ls.get('fortuna_airdef_sens') || '{}'); } catch (_) { return {}; } })()),
  saveSens: () => ls.set('fortuna_airdef_sens', JSON.stringify(C.sens)),
  // «АВТО» — помощь в бою (вылет и оператор ЗРК)
  auto: ls.get('fortuna_airdef_auto') === '1',
  setAuto(on) { C.auto = !!on; ls.set('fortuna_airdef_auto', on ? '1' : '0'); for (const id of ['tAuto', 'opAuto']) $(id).classList.toggle('on', C.auto); C.say(on ? 'АВТО включено: захват, сброс и пуск — сами (не идеально)' : 'АВТО выключено', 2); snd.click(); },
  saveSetup: () => ls.set('fortuna_airdef_setup', JSON.stringify(setup)),
};

// ═════════════ Бой: город + ПВО + налёт (+ самолёт игрока) ═════════════
const unitMeshes = new Map(), wpnMeshes = new Map(), samMeshes = new Map(), planeMeshes = new Map(), wrecks = [], debris = [];
C.unitMeshes = unitMeshes; C.planeMeshes = planeMeshes; // модели самолётов ИИ (промо-ролик: подвеска на пилонах)
const wMat = new THREE.MeshPhongMaterial({ vertexColors: true, specular: 0x444444, shininess: 40 });
const unitMat = new THREE.MeshPhongMaterial({ vertexColors: true, specular: 0x222222, shininess: 18 });
const deadMat = new THREE.MeshPhongMaterial({ color: 0x181614, specular: 0x050505, shininess: 4 });
const planeMat = new THREE.MeshPhongMaterial({ vertexColors: true, specular: 0x666666, shininess: 50 });
C.mats = { wMat, unitMat, deadMat };
C.weaponGeo = weaponGeo;
// defSide — сторона ПВО города; атакующие — другая сторона. player — самолёт игрока (вылет) или null.
C.newBattle = function (o) {
  clearBattle();
  const rnd = o.rnd || Math.random;
  const S = createStrike({ city, rnd, mode: C.MODE, night: C.NIGHT, fx: simFx,
    aircraft: () => { const a = raid ? raid.alive() : []; return C.player && !C.player.dead ? [C.player, ...a] : a; },
    hurt: (a, dmg, by) => { if (a === C.player) { if (C.hooks.hurtPlayer) C.hooks.hurtPlayer(dmg, by); } else raid.hurt(a, dmg * (C.hooks.aiDmgK || 1)); },
    laserSpot: (a) => (a === C.player ? (C.hooks.playerLaser ? C.hooks.playerLaser() : null) : raid.laserSpot(a)),
    spawnDecoy: (a, key, aim) => { const d = raid.spawnDecoy(a, key, aim); if (C.hooks.decoyOut) C.hooks.decoyOut(d); } });
  const raid = createRaid(S, city, rnd, { side: o.defSide === 'east' ? 'west' : 'east', era: o.era, fx: raidFx });
  C.S = S; C.raid = raid; C.player = o.player || null; C.raidEra = o.era || 2;
  for (const ob of S.objects) objLook(ob.id, false);
  return S;
};
// вид объекта-цели: целый или разрушенный (осел и почернел) — процедурная часть, заглушка и готовые постройки
function objLook(id, ruin) {
  for (const m of [C.G.objMesh[id], C.G.objBox[id]]) if (m) { m.material = ruin ? C.G.ruinMat : C.G.objMat; m.scale.y = ruin ? 0.35 : 1; }
  const g = C.G.objGroup[id];
  if (g) { g.scale.y = ruin ? 0.35 : 1; g.traverse((c) => { if (!c.isMesh) return; if (!c.userData.mat0) c.userData.mat0 = c.material; c.material = ruin ? C.G.ruinMat : c.userData.mat0; }); }
}
function clearBattle() {
  for (const m of [...unitMeshes.values(), ...wpnMeshes.values(), ...samMeshes.values(), ...planeMeshes.values()]) scene.remove(m);
  for (const w of [...wrecks, ...debris]) scene.remove(w.g);
  unitMeshes.clear(); wpnMeshes.clear(); samMeshes.clear(); planeMeshes.clear(); wrecks.length = 0; debris.length = 0;
  if (C.fx) C.fx.clearBurning();
  C.S = null; C.raid = null; C.player = null;
}
C.clearBattle = clearBattle;
// онлайн: зеркало боя (сервер считает, клиент повторяет по снимкам — games/airdef/net.js); не шагается
C.netBattle = function (N, o) {
  clearBattle(); C.simFx = simFx; C.raidFx = raidFx; // хуки эффектов — для зеркала (net.js)
  const S = createStrike({ city, rnd: Math.random, mode: () => MODES[o.mode] || C.MODE(), night: C.NIGHT, fx: simFx,
    aircraft: () => { const a = N.raid.alive(); return C.player && !C.player.dead && N.myCraft ? [C.player, ...a] : a; },
    hurt: () => {}, laserSpot: () => null, spawnDecoy: () => {} });
  C.S = S; C.raid = N.raid; C.player = o.player || C.player || null; C.net = N; C.raidEra = o.era || (N.battle && N.battle.era) || 2;
  for (const ob of S.objects) objLook(ob.id, false);
  return S;
};
C.objLook = (id, ruin) => objLook(id, ruin);
// модели комплексов — по списку боя (после расстановки или переезда)
C.syncUnits = function () {
  const S = C.S; if (!S) return;
  const ids = new Set(S.units.map((u) => u.id));
  for (const [id, g] of unitMeshes) if (!ids.has(id)) { scene.remove(g); unitMeshes.delete(id); }
  for (const u of S.units) {
    let g = unitMeshes.get(u.id);
    wantUnit(u.key); // готовая модель комплекса — загрузить, если есть (пересоберётся, когда придёт)
    if (!g) {
      const md = unitModel(u.key, u.S), gm = unitModelGlb(u.key); g = new THREE.Group();
      const mesh = (geo, parent) => { const m = new THREE.Mesh(geo, unitMat); m.castShadow = !!P.shadows; parent.add(m); return m; };
      const obj = (o, parent) => { o.traverse((q) => { if (q.isMesh && !q.userData.glass) { q.castShadow = !!P.shadows; q.receiveShadow = !!P.shadows; } }); parent.add(o); return o; };
      // готовая модель (корпус, башня, пакет — РЛС на башне) или процедурная
      if (gm) obj(gm.body, g); else if (md.body) mesh(md.body, g);
      if (md.dish && !gm) { const d = mesh(md.dish, g); d.position.set(md.dishXZ[0], md.dishY, md.dishXZ[1]); g.userData.dish = d; }
      // пусковые: башня (азимут) → качающаяся часть (угол места) → ракеты / крышки контейнеров по слотам
      const tur = [], slots = [];
      if (md.LN) for (const Ld of md.LN.L) {
        const tg = new THREE.Group(), cg = new THREE.Group(); tg.position.fromArray(Ld.tp); cg.position.fromArray(Ld.cp);
        if (gm) { if (gm.turret) obj(gm.turret.clone(), tg); if (gm.cradle) obj(gm.cradle.clone(), cg); }
        else {
          if (md.turret) mesh(md.turret, tg);
          // ПЗРК: готовая труба вместо процедурной (ось трубы — через слот; центр модели ниже оси из-за рукоятки)
          const lg = launcherGlb(u.key);
          if (lg) { obj(lg, cg); lg.position.set(Ld.slots[0][0], Ld.slots[0][1] - 0.06, Ld.slots[0][2]); } else if (md.cradle) mesh(md.cradle, cg);
        }
        // ракеты модели на направляющих — в слотах (пустой слот прячется, как у процедурных)
        if (gm && gm.missile) for (const sp of Ld.slots) { const q = new THREE.Group(); obj(gm.missile.clone(), q); if (gm.booster) obj(gm.booster.clone(), q); q.position.fromArray(sp); cg.add(q); slots.push(q); }
        if (md.slotGeo && !gm) for (const sp of Ld.slots) { const sm = new THREE.Mesh(md.slotGeo, md.LN.box ? unitMat : wMat); sm.position.fromArray(sp); cg.add(sm); slots.push(sm); }
        tg.add(cg); g.add(tg); tur.push({ tg, cg });
      }
      g.userData.tur = tur; g.userData.slots = slots; g.userData.nSlots = md.LN ? slotCount(md.LN) : 0;
      if (!P.shadows) addBlob(g); // без карты теней — мягкое пятно под машиной (иначе «висит» над землёй)
      g.rotation.y = u.yaw; scene.add(g); unitMeshes.set(u.id, g);
    }
    g.position.copy(u.pos); g.position.y -= 1.5;
  }
};
// мягкое тёмное пятно под машиной по её габаритам (радиальный градиент, без записи глубины)
let blobTex = null;
function addBlob(g) {
  if (!blobTex) { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext && c.getContext('2d'); if (x) { const gr = x.createRadialGradient(32, 32, 4, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); } blobTex = new THREE.CanvasTexture(c); }
  const sz = new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3()), q = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, color: 0x000000 }));
  q.rotation.x = -Math.PI / 2; q.scale.set(Math.max(2, sz.x * 1.35), Math.max(2, sz.z * 1.25), 1); q.position.y = 0.08; q.renderOrder = 1; g.add(q);
}
const dist = (p) => camera.position.distanceTo(p);
// объекты-цели: готовые постройки (сотни тысяч треугольников на объект) — только ближе P.lodObj, дальше — коробки-заглушки
// по их габаритам (в пиксель-два разницы не видно). Окно ТВ — всё подробно (его узкое поле зрения само отсекает лишнее)
const objC = new Map();
function objLod(p, D) {
  const G = C.G; if (!G || !G.objGroup) return;
  for (const o of city.objects) {
    const g = G.objGroup[o.id]; if (!g) continue;
    let c = objC.get(o.id);
    if (!c) { const L = o.models && o.models.length ? o.models : o.parts; let x = 0, z = 0, r = 0; for (const q of L) { x += q.x; z += q.z; } x /= L.length; z /= L.length; for (const q of L) r = Math.max(r, Math.hypot(q.x - x, q.z - z)); objC.set(o.id, c = { x, z, r }); }
    const full = Math.hypot(c.x - p.x, c.z - p.z) - c.r < D, b = G.objBox[o.id];
    g.visible = full; if (b) b.visible = !full || g.userData.left.size > 0; // заглушка видна и пока не пришли все модели
  }
}
// окно ТВ (контейнер): своя детализация на время его кадра — машины по размеру в пикселях окна, объекты подробно, дома и
// деревья моделями вокруг точки, куда смотрит контейнер, фасады — с детализацией по пикселю окна. Остальной кадр не трогается.
// at — точка взгляда, hPx — высота окна в пикселях; возвращает функцию «вернуть как было»
const podSaved = [];
C.podPass = function (cam, at, hPx) {
  const pk = hPx / 2 / Math.tan(cam.fov * D2R / 2); podSaved.length = 0;
  for (const g of unitMeshes.values()) { const R = g.userData.R; if (R === undefined) continue; const v = R * pk > 1.5 * cam.position.distanceTo(g.position); if (v !== g.visible) { podSaved.push(g, g.visible); g.visible = v; } }
  objLod(cam.position, 1e9);
  const px0 = UPX.value, c0 = ENV.uCam.value.clone();
  UPX.value = 2 * Math.tan(cam.fov * D2R / 2) / hPx; ENV.uCam.value.copy(cam.position);
  const d = cam.position.distanceTo(at), back = C.G && C.G.nearPod && P.bldNear ? C.G.nearPod(cam, at, clamp(d * Math.tan(cam.fov * D2R / 2) * 1.5, 150, 600)) : null;
  return () => {
    for (let i = 0; i < podSaved.length; i += 2) podSaved[i].visible = podSaved[i + 1];
    objLod(camera.position, P.lodObj); UPX.value = px0; ENV.uCam.value.copy(c0); if (back) back();
  };
};
const raidFx = {
  down(a) { C.fx.explosion(a.pos, a.role === 'decoy' ? 8 : 22, 'air'); if (a.role === 'decoy') snd.samBurst(dist(a.pos), 0.8); else snd.planeKill(dist(a.pos)); const g = planeMeshes.get(a.id); if (g) { planeMeshes.delete(a.id); wrecks.push({ g, vel: a.vel.clone(), spin: (Math.random() - 0.5) * 3, t: 0 }); } if (C.hooks.planeDown) C.hooks.planeDown(a); },
  out(a) { const g = planeMeshes.get(a.id); if (g) { scene.remove(g); planeMeshes.delete(a.id); } if (C.hooks.planeOut) C.hooks.planeOut(a); },
  release(a, key) { if (C.hooks.aiRelease) C.hooks.aiRelease(a, key); },
};
const aaaT = new Map();
const simFx = {
  // ракета в полёте: маршевая ступень (+ ускоритель), факел; старт — по типу пусковой (launchers.js)
  samLaunch(m) {
    // ракета из модели комплекса (если есть) или процедурная; ускоритель — отдельной частью, отвалится в полёте
    const g = new THREE.Group(), L = m.M.L, r = m.M.r, big = L > 5, gm = unitMissileGlb(m.unit.key);
    let hasBoost = false;
    if (gm) { g.add(gm.missile); if (gm.booster && m.ln && m.ln.stage) { g.add(gm.booster); g.userData.booster = gm.booster; hasBoost = true; } }
    else {
      const geos = samGeos(m.S, m.ln), main = new THREE.Mesh(geos.main, wMat); main.position.z = geos.mainZ; g.add(main);
      if (geos.booster) { const b = new THREE.Mesh(geos.booster, wMat); b.position.z = geos.boosterZ; g.add(b); g.userData.booster = b; hasBoost = true; }
    }
    g.userData.flame = rocketFlame(g, L / 2, hasBoost ? r * m.ln.stageR : r);
    g.position.copy(m.pos); g.lookAt(LP.copy(m.pos).sub(m.dir));
    scene.add(g); samMeshes.set(m.id, g);
    const mode = m.ln ? m.ln.mode : 'rail', d = dist(m.pos);
    if (mode === 'cold') { C.fx.launchCold(LP.copy(m.pos).addScaledVector(m.dir, L / 2), m.dir, big); snd.eject(d, big); }
    else if (mode === 'tube') { C.fx.launchTube(m.pos, m.dir); snd.eject(d, false); }
    else { C.fx.launchHot(m.pos, m.dir, big, m.unit.pos.clone().setY(city.groundH(m.unit.pos.x, m.unit.pos.z))); snd.samLaunch(d, big); }
    if (C.hooks.samLaunch) C.hooks.samLaunch(m);
  },
  samIgnite(m) { C.fx.ignite(LP.copy(m.pos).addScaledVector(m.dir, -m.M.L / 2), m.dir, m.M.L > 5); snd.samLaunch(dist(m.pos), m.M.L > 5); },
  samJet(m) { C.fx.jet(m.pos, m.dir); },
  samStage(m) {
    const g = samMeshes.get(m.id), b = g && g.userData.booster; if (!b) return;
    // ускоритель отваливается и падает, кувыркаясь; факел переходит на срез маршевой ступени
    b.getWorldPosition(LP); g.remove(b);
    const q = new THREE.Group(); q.add(b); b.position.set(0, 0, 0); q.position.copy(LP); q.quaternion.copy(g.quaternion); scene.add(q);
    debris.push({ g: q, vel: m.dir.clone().multiplyScalar(m.speed * 0.85), spin: new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 3), t: 0 });
    g.userData.booster = null; g.userData.flame.move(-m.M.L / 2 + m.M.L * m.ln.stage);
    C.fx.stage(LP, m.dir);
  },
  samTrail(m) { C.fx.samTrail(m); },
  samEnd(m, hit) { const g = samMeshes.get(m.id); if (g) { scene.remove(g); samMeshes.delete(m.id); } if (C.hooks.samEnd) C.hooks.samEnd(m, hit); },
  wpnRelease(w) {
    const g = weaponMesh(w.key, w.W, weaponGeo, wMat); scene.add(g); wpnMeshes.set(w.id, g);
    if (w.owner === C.player) snd.release(w.W.kind === 'agm' || w.W.kind === 'arm');
    if (C.hooks.wpnRelease) C.hooks.wpnRelease(w);
  },
  wpnTrail(w) { C.fx.wpnTrail(w); },
  wpnEnd(w, res) { const g = wpnMeshes.get(w.id); if (g) { scene.remove(g); wpnMeshes.delete(w.id); } if (C.hooks.wpnEnd) C.hooks.wpnEnd(w, res); },
  explosion(p, R, kind) { C.fx.explosion(p, R, kind); if (kind === 'air') snd.samBurst(dist(p), R / 12); else snd.explosion(dist(p), R / 20); }, // в воздухе — подрыв ЗУР / перехват
  gunFire(u, t, hits, dt) {
    C.fx.gunFire(u.pos, t.pos, hits, dt);
    const k = (aaaT.get(u.id) || 0) - dt; if (k <= 0) { snd.aaa(dist(u.pos), u.key === 'gepard' ? 35 : 23); aaaT.set(u.id, 0.16); } else aaaT.set(u.id, k);
  },
  objectHit(o, amount, p) { if (C.hooks.objectHit) C.hooks.objectHit(o, amount, p); },
  objectDestroyed(o, by) {
    objLook(o.id, true);
    for (const q of o.parts) C.fx.burn(new THREE.Vector3(q.x, city.groundH(q.x, q.z) + 2, q.z), Math.min(60, (q.w || q.r * 2 || 20) * 0.6));
    if (C.hooks.objectDestroyed) C.hooks.objectDestroyed(o, by);
  },
  unitHit(u, a) { if (C.hooks.unitHit) C.hooks.unitHit(u, a); },
  unitDestroyed(u, by) {
    const g = unitMeshes.get(u.id); if (g) g.traverse((o) => { if (o.isMesh) o.material = deadMat; });
    C.fx.burn(u.pos, 10);
    if (C.hooks.unitDestroyed) C.hooks.unitDestroyed(u, by);
  },
  radarState(u) { if (C.hooks.radarState) C.hooks.radarState(u); },
  cmDrop(a, type) { if (type === 'flare') C.fx.flareFlash(a.pos); else C.fx.chaffBurst(a.pos, a.vel); if (a === C.player) { if (type === 'flare') snd.flare(); else snd.chaff(); } },
  decoyed(m, f) { if (C.hooks.decoyed) C.hooks.decoyed(m, f); },
  trackBroken(u, a) { if (C.hooks.trackBroken) C.hooks.trackBroken(u, a); },
};
// подвеска ИИ-самолёта с готовой моделью: тяжёлое — ближе к фюзеляжу (как у игрока); k — номер изделия этого типа
const ST_ORDER = [3, 4, 2, 5, 1, 6, 0, 7], LOD_D = 2500; // дальше LOD_D — простая модель самолёта
function hangLoad(g, stations, load) {
  const out = []; let oi = 0;
  for (const l of [...load].sort((x, y) => AG[y.key].mass - AG[x.key].mass)) for (let k = 0; k < l.n && oi < 8; k++) {
    const W = AG[l.key], p = stations[ST_ORDER[oi++]], m = weaponMesh(l.key, W, weaponGeo, wMat);
    m.position.set(p.x, p.y - W.vis.r - 0.05, p.z); g.add(m); out.push({ m, l, k });
  }
  return out;
}
// синхронизация моделей с боем
const LP = new THREE.Vector3();
function syncWorld(dt, t) {
  // дым подбитых самолётов (ИИ и игрок): ветер — лёгкий, постоянный для боя
  if (C.fx && dt > 0) {
    const W = C.windV || (C.windV = new THREE.Vector3(3.9, 0, 1.1)); // ~4 м/с
    if (C.raid) for (const a of C.raid.planes) if (!a.dead && !a.out && a.role !== 'decoy' && a.hpMax) C.fx.damageSmoke(a, dt, a.hp / a.hpMax, W);
    if (C.player && !C.player.dead) C.fx.damageSmoke(C.player, dt, C.player.hp / (C.player.hpMax || 100), W);
  }
  const S = C.S; if (!S) return;
  for (const m of S.sams) {
    const g = samMeshes.get(m.id); if (!g) continue;
    g.position.copy(m.pos); g.lookAt(LP.copy(m.pos).sub(m.dir));
    const on = m.tb >= 0 && (m.tb < m.M.burn || (m.M.sustain && m.tb < m.M.burn + m.M.sustain.t));
    g.userData.flame.set(on ? (m.tb < m.M.burn && (m.M.L > 2.5 || g.userData.booster) ? 2 : 1) : 0, g.userData.booster ? m.M.r * m.ln.stageR : m.M.r);
  }
  // отделившиеся ускорители: падают, кувыркаются, первые секунды дымят
  for (let i = debris.length - 1; i >= 0; i--) {
    const b = debris[i]; b.t += dt; b.vel.y -= 9.8 * dt; b.vel.multiplyScalar(1 - 0.35 * dt);
    b.g.position.addScaledVector(b.vel, dt); b.g.rotation.x += b.spin.x * dt; b.g.rotation.y += b.spin.y * dt; b.g.rotation.z += b.spin.z * dt;
    if (b.t < 2.5 && Math.random() < dt * 20) C.fx.debrisSmoke(b.g.position);
    if (b.g.position.y < city.topAt(b.g.position.x, b.g.position.z) + 0.5 || b.t > 40) { C.fx.explosion(b.g.position, 3, 'ground'); scene.remove(b.g); debris.splice(i, 1); }
  }
  for (const w of S.wpns) { const g = wpnMeshes.get(w.id); if (g) { g.position.copy(w.pos); g.lookAt(LP.copy(w.pos).sub(w.vel)); } }
  const pxK = VH / 2 / Math.tan(camera.fov * D2R / 2); // пикселей на метр на расстоянии 1 м
  for (const u of S.units) {
    const g = unitMeshes.get(u.id); if (!g) continue;
    // машина на экране меньше ~1,5 пикселя — не рисуем (детальные модели тяжёлые, а вдали их не видно)
    if (g.userData.R === undefined) g.userData.R = Math.max(2, new THREE.Box3().setFromObject(g).getSize(LP).length() * 0.5);
    g.visible = g.userData.R * pxK > 1.5 * camera.position.distanceTo(u.pos);
    // подробная модель или дальняя копия (models.js: THREE.LOD по частям) — по расстоянию с поправкой на поле зрения
    // (у узкого окна ТВ и прицела оператора «ближе»); конвейер кадра сам LOD не переключает
    if (g.visible) {
      if (!g.userData.lods) { g.userData.lods = []; g.traverse((o) => { if (o.isLOD) { o.autoUpdate = false; g.userData.lods.push(o); } }); }
      const near = camera.position.distanceTo(u.pos) * Math.tan(camera.fov * D2R / 2) / 0.577 < 400;
      for (const l of g.userData.lods) { l.levels[0].object.visible = near; l.levels[1].object.visible = !near; }
    }
    if (u.dead) continue;
    // пусковые: азимут и угол места из симуляции; слот пуст — ракета ушла (или нет боекомплекта)
    for (const T of g.userData.tur) { T.tg.rotation.y = u.lyaw; T.cg.rotation.x = u.lel; }
    const N = g.userData.nSlots, sl = g.userData.slots;
    if (sl.length) {
      const rem = u.reloadT > 0 ? 0 : Math.max(0, Math.round(u.ammo)), fired = u.S.ammo - rem;
      for (let k = 0; k < sl.length; k++) sl[k].visible = (rem >= N || ((k - fired % N) + N) % N < rem) && !(u.slotT[k] > 0);
    }
    const d = g.userData.dish; if (!d) continue;
    if (u.track && u.emit) { LP.copy(u.track.pos).sub(u.pos); d.rotation.y = Math.atan2(-LP.x, -LP.z) - u.yaw; }
    else if (u.emit) d.rotation.y = t * 2.5 + u.id;
  }
  if (C.raid) for (const a of C.raid.planes) {
    if (a.dead || a.out || a.phase === 'wait') continue;
    let g = planeMeshes.get(a.id);
    if (!g) {
      g = new THREE.Group(); g.rotation.order = 'YXZ';
      if (a.role === 'decoy') { g.add(weaponMesh(a.decoyKey, AG[a.decoyKey], weaponGeo, wMat)); g.userData.flames = { update() {} }; }
      else {
        // вблизи — готовая модель (подвеска отдельными моделями на пилонах, сброшенное пропадает), вдали — простая
        const pm = planeModel(a.side, classOfRole(a.role), a.plane || raidPlane(a.side, C.raidEra, a.role)), sg = strikerGeo(a.side), lo = new THREE.Mesh(sg.geo, planeMat); lo.castShadow = !!P.shadows; g.add(lo);
        if (pm) {
          pm.obj.traverse((o) => { if (o.isMesh && !o.userData.glass) o.castShadow = !!P.shadows; }); g.add(pm.obj);
          g.userData.flames = attachFlames(g, pm.nozzles, pm.nr / 0.45); g.userData.hung = pm.internal ? [] : hangLoad(g, pm.stations, a.load); // во внутренних отсеках — не видно
          g.userData.lod = { hi: pm.obj, lo };
        } else g.userData.flames = attachFlames(g, sg.nozzles, sg.nr / 0.45);
      }
      scene.add(g); planeMeshes.set(a.id, g);
    }
    g.position.copy(a.pos); g.rotation.set(a.pitch, a.yaw, a.roll);
    g.userData.flames.update(a.thr, a.ab);
    const L = g.userData.lod, near = !L || camera.position.distanceToSquared(a.pos) < LOD_D * LOD_D;
    if (L) { L.hi.visible = near; L.lo.visible = !near; }
    if (g.userData.hung) for (const h of g.userData.hung) h.m.visible = near && h.l.n > h.k;
  }
  if (dt > 0) for (const f of S.flares) C.fx.flareTick(f, dt);
  // обломки сбитых: падают, крутятся, дымят; на земле — пожар
  for (let i = wrecks.length - 1; i >= 0; i--) {
    const w = wrecks[i]; w.t += dt; w.vel.y -= 9.8 * dt; w.vel.multiplyScalar(1 - 0.15 * dt);
    w.g.position.addScaledVector(w.vel, dt); w.g.rotation.z += w.spin * dt; w.g.rotation.x += w.spin * 0.3 * dt;
    if (Math.random() < dt * 30) C.fx.wreckSmoke(w.g.position);
    if (w.g.position.y < city.topAt(w.g.position.x, w.g.position.z) + 2 || w.t > 25) { C.fx.explosion(w.g.position, 16, 'ground'); C.fx.burn(w.g.position, 12); scene.remove(w.g); wrecks.splice(i, 1); }
  }
}
// звук: двигатель игрока, объёмные голоса самолётов и ракет
const sndCands = [], sndPool = [];
function updateSound(dt) {
  if (!snd.A.ready) return;
  const pl = C.player, on = C.state === 'play' || C.state === 'menu';
  if (pl && !pl.dead && C.state === 'play' && !C.paused) {
    fwdOf(pl, LP); const rear = clamp((LP.dot(camera.getWorldDirection(new THREE.Vector3())) + 1) / 2, 0, 1);
    snd.frame(dt, { on: true, rpmTarget: pl.ab ? 1 : 0.6 + 0.4 * clamp((pl.thr - 0.55) / 0.45, 0, 1), ab: pl.ab, speed: pl.speed, mach: pl.speed / 330, sup: pl.speed > 340, n: pl.n || 1, rear, agl: pl.pos.y - city.groundH(pl.pos.x, pl.pos.z), rain: 0 });
  } else snd.frame(dt, { on: false });
  sndCands.length = 0;
  const cand = (o, kind, pos, vel, fwd, ab, gain) => { let c = sndPool[sndCands.length]; if (!c) sndPool.push(c = {}); Object.assign(c, { o, kind, pos, vel, fwd, ab, gain }); sndCands.push(c); };
  if (C.raid) for (const a of C.raid.planes) if (!a.dead && !a.out && a.phase !== 'wait') { a.sfwd = fwdOf(a, a.sfwd || new THREE.Vector3()); cand(a, 'jet', a.pos, a.vel, a.sfwd, a.ab, 1.1); }
  if (C.S) {
    for (const m of C.S.sams) if (!m.dead && m.tb >= 0 && m.tb < m.M.burn + (m.M.sustain ? m.M.sustain.t : 0)) { m.svel = (m.svel || new THREE.Vector3()).copy(m.dir).multiplyScalar(m.speed); cand(m, 'msl', m.pos, m.svel, null, false, 1); }
    for (const w of C.S.wpns) if (!w.dead && w.W.burn && w.t < w.W.burn) cand(w, 'msl', w.pos, w.vel, null, false, 0.8);
  }
  snd.spatial(dt, camera, pl && C.state === 'play' ? pl.vel : null, sndCands, on && !C.paused);
}

// ═════════════ Общие помощники для режимов ═════════════
let VW = 1, VH = 1;
const hc = $('hudc'), hx = hc.getContext('2d');
C.hx = hx;
const PRJ = new THREE.Vector3();
C.proj = (p, cam = camera) => { PRJ.copy(p).project(cam); return PRJ.z < 1 && PRJ.z > -1 ? [(PRJ.x + 1) / 2 * VW, (1 - PRJ.y) / 2 * VH] : null; };
let msgT = 0;
C.say = (t, s = 2.4) => { const m = $('msg'); m.innerHTML = t; m.style.display = t ? 'block' : 'none'; msgT = s; };
C.hint = (h) => { const e = $('hint'); if (e._h === h) return; e._h = h; e.innerHTML = h || ''; e.style.display = h ? 'block' : 'none'; };
C.setBody = (cls, on) => document.body.classList.toggle(cls, on);
function resize() {
  VW = C.VW = window.innerWidth; VH = C.VH = window.innerHeight;
  renderer.setSize(VW, VH, false); camera.aspect = VW / VH; camera.updateProjectionMatrix();
  if (pipe) pipe.setSize();
  UPX.value = 2 * Math.tan(camera.fov * Math.PI / 360) / (VH * renderer.getPixelRatio() * (pipe ? pipe.scale : 1));
  const k = Math.min(2, devicePixelRatio || 1); hc.width = VW * k; hc.height = VH * k;
  C.hudK = k;
  document.body.classList.toggle('short', VH < 500);
  if (C.fx) { const sc = renderer.getPixelRatio() * (pipe ? pipe.scale : 1) * VH / (2 * Math.tan(camera.fov * D2R / 2)); for (const m of C.fx.mats) m.uniforms.scale.value = sc; }
  if (C.ctrl && C.ctrl.resize) C.ctrl.resize();
}
addEventListener('resize', resize);
C.resize = resize;
// поле зрения камеры (оператор ЗРК меняет увеличение): частицы и сглаживание линий — по новому FOV
C.setFov = (f) => { if (Math.abs(camera.fov - f) < 0.01) return; camera.fov = f; resize(); };
// Telegram: кнопки поверх страницы — отступ сверху
C.shell = createShell(C, { IS_TOUCH, ls });
document.body.classList.toggle('nopad', !C.sens.pad); // крестовина выключена в настройках

// ═════════════ Режимы: вход, пауза, итоги ═════════════
const ctrls = {};
C.start = function (game) {
  if (game === 'online') { C.online.again(); return; } // «Ещё раз» после онлайн-боя — снова в поиск
  snd.unlock();
  if (C.ctrl && C.ctrl.stop) C.ctrl.stop();
  C.hooks = {}; C.paused = false; C.hint(''); C.say('');
  $('menu').classList.remove('on'); $('end').classList.remove('on'); $('pauseScr').classList.remove('on');
  document.body.classList.remove('menuing'); document.body.classList.add('playing');
  C.state = 'play'; C.camera.clearViewOffset(); C.shell.play(true);
  C.ctrl = ctrls[game]; C.ctrl.start();
  resize();
};
C.toMenu = function () {
  C.op = null; // «Операция» прервана
  if (C.ctrl && C.ctrl.stop) C.ctrl.stop();
  C.hooks = {}; C.paused = false; C.hint(''); C.say(''); $('ask').style.display = 'none'; $('warn').style.display = 'none';
  for (const id of ['end', 'pauseScr', 'lesson']) $(id).classList.remove('on');
  for (const c of ['playing', 'flying', 'defense', 'dmap', 'oper']) document.body.classList.remove(c);
  document.body.classList.add('menuing');
  hx.setTransform(1, 0, 0, 1, 0, 0); hx.clearRect(0, 0, hc.width, hc.height);
  C.state = 'menu'; C.shell.play(false); C.ctrl = ctrls.director; C.ctrl.start(); C.menu.show();
  resize();
};
C.togglePause = function () {
  if (C.state !== 'play' || C.ended) return;
  if ($('lesson').classList.contains('on')) { C.closeLesson(); return; }
  C.paused = !C.paused;
  $('pauseScr').classList.toggle('on', C.paused);
  $('pauseHelp').innerHTML = C.ctrl.pauseHelp ? C.ctrl.pauseHelp() : '';
  if (C.paused) snd.silence();
};
// итоги: title, reason, stats [[число, подпись]], note, win (true/false/null)
C.showEnd = function ({ title, reason, stats, note, win, again }) {
  C.ended = true; $('againBtn').textContent = again || 'Ещё раз'; // «Операция»: «Вылет 2: удар →»
  $('endTitle').textContent = title; $('endTitle').className = win === true ? 'win' : win === false ? 'lose' : '';
  $('endReason').textContent = reason || '';
  $('endStats').innerHTML = (stats || []).map(([v, l]) => `<div class="stt"><b>${v}</b><span>${l}</span></div>`).join('');
  $('endNote').innerHTML = note || '';
  setTimeout(() => { $('end').classList.add('on'); document.body.classList.remove('flying'); }, 900);
};
// объяснение на паузе (обучение и «?»)
C.openLesson = function (title, body, sub) {
  C.paused = true; snd.silence();
  $('lessonTitle').innerHTML = title; $('lessonBody').innerHTML = body; $('lessonSub').textContent = sub || 'Объяснение · игра на паузе';
  $('lesson').classList.add('on');
};
C.closeLesson = function () { $('lesson').classList.remove('on'); C.paused = false; if (C.onLessonClose) { const f = C.onLessonClose; C.onLessonClose = null; f(); } };
$('lessonClose').onclick = () => C.closeLesson();
$('resumeBtn').onclick = () => C.togglePause();
$('pauseExit').onclick = () => C.toMenu();
$('pauseEnd').onclick = () => { C.togglePause(); if (C.ctrl.finish) C.ctrl.finish('Бой завершён досрочно'); };
$('pause').onclick = () => C.togglePause();
$('againBtn').onclick = () => orientGate(() => { C.ended = false; C.start(C.lastGame || 'air'); }, IS_TOUCH);
$('closeBtn').onclick = () => { C.ended = false; C.toMenu(); };
$('exit').onclick = () => C.toMenu();
$('mute').onclick = () => { snd.unlock(); snd.setMuted(!snd.muted); $('mute').textContent = snd.muted ? '✕♪' : '♪';
for (const id of ['tAuto', 'opAuto']) $(id).classList.toggle('on', C.auto); };
$('mute').textContent = snd.muted ? '✕♪' : '♪';
for (const id of ['tAuto', 'opAuto']) $(id).classList.toggle('on', C.auto);
addEventListener('keydown', (e) => {
  if (C.state === 'play' && (e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) { C.togglePause(); return; }
  if (C.ctrl && C.ctrl.onKey && !C.paused) C.ctrl.onKey(e, true);
});
addEventListener('keyup', (e) => { if (C.ctrl && C.ctrl.onKey) C.ctrl.onKey(e, false); });
addEventListener('pointerdown', () => snd.unlock(), { once: true });
document.addEventListener('visibilitychange', () => { if (document.hidden && C.state === 'play' && !C.paused) C.togglePause(); });

// ═════════════ Кадр ═════════════
let last = performance.now(), lastDraw = 0, fpsAcc = 0, fpsN = 0, fps = 0, shN = 0;
const msWin = [], dr = { scale: perf.scale, calm: 0, prev: 0, before: 0, hold: 0, miss: 0 };
const pf = { cpu: 0, n: 0, cpuS: 0, calls: 0, tris: 0 };
C.perfHud = ls.get('fortuna_airdef_perfhud') === '1';
if (renderer.info) renderer.info.autoReset = false; // счётчики — за весь кадр (постобработка рисует в несколько проходов); сброс — в начале кадра
C.gpuName = (() => { try { const gl = renderer.getContext(), e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); } catch (_) { return '?'; } })();
C.GO = GO; document.body.classList.toggle('perfhud', C.perfHud);
// динамическое разрешение: медиана 30 кадров (подгрузка моделей и сборка шейдеров не тянут вниз). Снизили — и кадр не ускорился
// (упор не в пиксели: вызовы, ЦП, ожидание экрана) — возвращаем как было и долго не трогаем, а не «мылим» картинку зря
function dynRes(ms) {
  if (perf.dynOff) return;
  msWin.push(ms); if (msWin.length < 30) return;
  msWin.sort((a, b) => a - b); const med = msWin[15]; msWin.length = 0;
  const goal = 1000 / Math.min(perf.goal || 60, P.cap || 999); // при ограничении 30 к/с — цель не выше него
  let s = dr.scale;
  if (dr.prev) { // проверка прошлого снижения
    if (med > dr.before * 0.94) { s = dr.prev; dr.hold = 20 * ++dr.miss; } else dr.miss = 0; // не помогло — назад, пауза растёт (≈10 с, 20 с, …)
    dr.prev = 0;
  } else if (dr.hold > 0) dr.hold--;
  else if (med > goal * 1.15 && s > perf.min) { dr.prev = s; dr.before = med; s -= med > goal * 1.5 ? 0.1 : 0.05; dr.calm = 0; }
  else if (med < goal * 1.08 && ++dr.calm >= 3) { s += 0.05; dr.calm = 0; }
  s = clamp(s, perf.min, perf.scale);
  if (Math.abs(s - dr.scale) >= 0.01) { dr.scale = s; if (pipe) pipe.setScale(s); else renderer.setPixelRatio(basePR * s); resize(); }
}
const view = Q.get('view') ? Q.get('view').split(',').map(Number) : null;
function frame(now) {
  requestAnimationFrame(frame);
  // меню и пауза — 30 к/с (фон не должен греть телефон), бой на телефоне — не больше 60
  // «Кастомный»: своё ограничение (30 к/с — вдвое меньше нагрев и расход батареи)
  const capMs = C.state === 'menu' || C.paused ? 1000 / 30 : P.cap ? 1000 / P.cap : IS_TOUCH ? 1000 / 60 : 0;
  if (capMs && now - lastDraw < capMs - 2) return;
  const ms = now - lastDraw; lastDraw = now;
  const t0 = performance.now(); if (renderer.info) renderer.info.reset(); // счётчик производительности: время ЦП и вызовы за кадр
  const dt = Math.min(0.05, (now - last) / 1000), t = now / 1000; last = now;
  C.t = t;
  const ctrl = C.ctrl;
  const online = !!(C.net && C.net.battle); // онлайн: мир не встаёт на паузу (пауза — только меню), бой считает сервер
  if ((!C.paused || online) && ctrl) {
    if (ctrl.update) ctrl.update(dt, t);
    if (online) C.net.update(dt);
    else if (C.S && ctrl.sim !== false) { if (C.raid) C.raid.step(dt); C.S.step(dt); }
    if (C.fx) C.fx.update(dt);
  }
  if (view) { camera.position.set(view[0], view[1], view[2]); camera.rotation.set((view[4] || 0) * D2R, (view[3] || 0) * D2R, 0); }
  else if (ctrl && ctrl.camera) ctrl.camera(dt, t);
  // ближняя плоскость отсечения растёт с высотой камеры: с 10 км точности глубины иначе не хватает (крыши «мерцают»)
  { let nearW = clamp((camera.position.y - city.groundH(camera.position.x, camera.position.z)) * 0.006, 3, 20);
    if (ctrl && ctrl.near && ctrl.near()) nearW = Math.min(nearW, ctrl.near()); // крупный план у самолёта — ближе
    if (Math.abs(camera.near - nearW) > camera.near * 0.15) { camera.near = nearW; camera.updateProjectionMatrix(); } }
  syncWorld(C.paused ? 0 : dt, t);
  objLod(camera.position, P.lodObj);
  updateCityScene(C.G, camera, P, ctrl && ctrl.focus ? ctrl.focus() : camera.position, t); // окно ТВ — свой набор моделей вблизи (C.podPass)
  // тактическая карта обороны закрывает весь экран — 3D-кадр не рисуем (телефон не греется)
  // «Тени через кадр»: карта теней перерисовывается раз в P.shEvery кадров (город стоит, тени техники чуть запаздывают)
  if (P.shEvery > 1 && renderer.shadowMap.enabled) { renderer.shadowMap.autoUpdate = false; if (++shN >= P.shEvery) { shN = 0; renderer.shadowMap.needsUpdate = true; } }
  if (!(ctrl && ctrl.skip3D && ctrl.skip3D())) { if (pipe) pipe.render(scene, camera, t); else renderer.render(scene, camera); }
  if (C.perfHud && renderer.info) { pf.cpu += performance.now() - t0; pf.n++; pf.calls = renderer.info.render.calls; pf.tris = renderer.info.render.triangles; }
  if (ctrl && ctrl.afterRender) ctrl.afterRender();
  hx.setTransform(C.hudK, 0, 0, C.hudK, 0, 0); hx.clearRect(0, 0, VW, VH);
  if (ctrl && ctrl.hud) ctrl.hud(dt, t);
  if (C.extraHud) C.extraHud(dt, t); // онлайн: журнал сбитий, метки «нужна помощь»
  updateSound(dt);
  if (msgT > 0 && (msgT -= dt) <= 0) C.say('');
  fpsAcc += ms; fpsN++; if (fpsAcc > 500) { fps = Math.round(1000 * fpsN / fpsAcc); fpsAcc = fpsN = 0; }
  if (C.state === 'play' && !view && ms < 250 && !(ctrl && ctrl.skip3D && ctrl.skip3D())) dynRes(ms); // на карте 3D не рисуется — мерить нечего
  const sc = Math.round((pipe ? pipe.scale : dr.scale) * 100);
  if (C.perfHud && renderer.info) { // подробно: кадр, ЦП (подготовка кадра в JS), ГП ≈ остаток кадра, вызовы, треугольники, память
    if (pf.n >= 20) { pf.cpuS = pf.cpu / pf.n; pf.cpu = pf.n = 0; }
    const frameMs = fps ? 1000 / fps : 0, mem = performance.memory ? ` · JS ${Math.round(performance.memory.usedJSHeapSize / 1048576)} МБ` : '', gm = renderer.info.memory;
    $('perf').textContent = `${P.name} · ${fps} к/с · кадр ${frameMs.toFixed(1)} мс · ЦП ${pf.cpuS.toFixed(1)} мс · ГП и ожидание ≈${Math.max(0, frameMs - pf.cpuS).toFixed(1)} мс · ${pf.calls} выз. · ${(pf.tris / 1e6).toFixed(2)} млн тр. · ${sc}% · геом. ${gm.geometries}, текст. ${gm.textures}${mem}`;
  } else $('perf').textContent = C.state === 'play' ? `${P.name} · ${fps} к/с · ${sc}%` : '';
}

// ═════════════ Запуск ═════════════
// готовые модели — в фоне; загрузилась — самолёты пересобираются уже с ней (постройки — ставятся, когда город собран)
const pendingObj = [];
loadModels(new URL('./', import.meta.url).href, (name) => {
  if (C.G && C.G.attachBld && bldModel(name)) C.G.attachBld(name, bldModel(name)); // дома города вблизи (и цеха — та же модель, что у целей)
  if (isObjModel(name)) { if (C.G) C.G.attachObjModel(name, () => objModel(name)); else pendingObj.push(name); return; } // постройки целей
  if (bldModel(name)) return;
  if (isUnitModel(name)) { for (const g of unitMeshes.values()) scene.remove(g); unitMeshes.clear(); C.syncUnits(); return; } // комплексы — пересобрать
  for (const g of planeMeshes.values()) scene.remove(g); planeMeshes.clear();
  if (C.ctrl && C.ctrl.modelsReady) C.ctrl.modelsReady();
});
setTimeout(() => {
  const t0 = performance.now();
  C.G = buildCityScene(scene, city, P, renderer, W_KEY);
  for (const n of pendingObj.splice(0)) C.G.attachObjModel(n, () => objModel(n));
  if (C.G.bldNames) { for (const n of C.G.bldNames) if (bldModel(n)) C.G.attachBld(n, bldModel(n)); wantBuildings(); } // дома вблизи — только если пресет их рисует
  C.fx = createFx(scene, P);
  if (pipe && pipe.fx) { C.fx.setLayers(FX_LAYER, FX_ADD_LAYER); if (C.G.clouds) C.G.clouds.layers.set(FX_LAYER); } // облака и дым — в половине разрешения
  ctrls.air = createAir(C); ctrls.defense = createDefense(C); ctrls.director = createDirector(C); ctrls.training = createTraining(C, ctrls);
  C.online = createOnline(C, ctrls); // до меню: оно спрашивает у онлайна текст кнопки и раздел
  C.menu = createMenu(C, { PRESETS, WEATHER_KEYS });
  resize();
  C.buildMs = Math.round(performance.now() - t0);
  try { renderer.compile(scene, camera); } catch (_) { /* не критично */ }
  $('loading').remove();
  C.toMenu();
  requestAnimationFrame(frame);
  const go = Q.get('go'); if (go && ctrls[go]) { setup.game = go === 'training' ? 'training' : go; C.lastGame = go; C.start(go); }
}, 30);
if (Q.get('test') === '1') { window.__a = C; window.__frame = frame; C.ctrls = ctrls; C.resize = resize; C.lessons = LESSONS; } // проверка: доступ к игре и шаг кадра вручную (страница в фоне)
