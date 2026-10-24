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
import { localizeTree } from './lang/data.js?v=20261024u'; // язык: названия и описания из данных (arsenal, flight, heli) — до progress.js, который строит по ним дерево
import { TREE, BRANCHES } from './progress.js?v=20261024u';
import { trDom, tr, trIf, LANG, askLang } from './i18n.js?v=20261024u';
import { ktxInit, ktxRestore } from './ktx.js?v=20261024u';
import { buildCity, CITY } from './city.js?v=20261024u';
import { buildWinter } from './map-winter.js?v=20261024u';
import { WINTER_KEYS } from './winter-render.js?v=20261024u';
import { buildAutumn } from './map-autumn.js?v=20261024u';
import { AUTUMN_KEYS } from './autumn-render.js?v=20261024u';
import { buildCityScene, updateCityScene, UPX, ENV, texStats } from './city-render.js?v=20261024u';
import { createPipeline } from '../drone/post.js?v=20261024u';
import { setGround, D2R, clamp, fwdOf } from '../drone/sim/core.js?v=20261024u';
import { WEATHERS, FXU, FX_LAYER, FX_ADD_LAYER } from '../drone/world.js?v=20261024u';
import { AG, SAM, LOADOUTS, DEFENSE, raidPlane } from './arsenal.js?v=20261024u';
import { createStrike, MODES } from './sim/strike.js?v=20261024u';
import { createRaid } from './sim/raid.js?v=20261024u';
import { POD, RAIL } from './sim/combined.js?v=20261024u';
import { unitModel, weaponGeo, samMissileMesh, mountWpnFlame, narMesh, flameOf, wpnNozzle, strikerGeo, createFx, attachFlames } from './units-render.js?v=20261024u';
import { slotCount, LNCH } from './launchers.js?v=20261024u';
import { spinProps as spinRotors, spinSails, modelStats, loadModels, planeModel, heliModel, classOfRole, weaponMesh, pylonMesh, unitModelGlb, unitMissileGlb, launcherGlb, isUnitModel, isObjModel, objModel, wantUnit, wantUnitNear, bldModel, wantBuildings, wantModel, wantWeapon, weaponPending, anyModel, setWings, glideWings, planeMeta } from './models.js?v=20261024u';
import { planeDamageVis, updateDebris, clearDebris } from './plane-damage.js?v=20261024u';
import { createSound } from './sound.js?v=20261024u';
import { ico, iconize } from './icons.js?v=20261024u';
import { createAir } from './air.js?v=20261024u';
import { createDefense } from './defense.js?v=20261024u';
import { createDirector } from './director.js?v=20261024u';
import { createMenuBg } from './menubg.js?v=20261024u';
import { createOnline } from './online.js?v=20261024u';
import { createProgress } from './progress-net.js?v=20261024u';
import { createDifficulty } from './difficulty.js?v=20261024u';
import { createResearch } from './research.js?v=20261024u';
import { createEvent } from './event.js?v=20261024u';
import { createHints } from './hints.js?v=20261024u';
import { motorOf } from './plume.js?v=20261024u';
import { createShell } from './shell.js?v=20261024u';
import { createTraining, LESSONS } from './training.js?v=20261024u';
import { createPhoto } from './photo.js?v=20261024u';
import { createMenu } from './menu.js?v=20261024u';
import { registerSW } from './offline.js?v=20261024u';
import { detectGpu, sharpFor } from './gpu.js?v=20261024u';
import { orientGate } from '../orient-warn.js?v=20261011a';

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
localizeTree(TREE, BRANCHES); // страховка: узлы прокачки — по уже переведённым данным (если progress.js построил дерево раньше)
trDom(document.body); // язык: статичный HTML страницы — до того, как меню и бой допишут свой текст (i18n.js)
askLang(); // первый вход: язык ещё не выбран — спросить (угаданный по устройству / Telegram выделен)
// окна общих модулей (предупреждение о повороте телефона — orient-warn.js, «Летка» делит его с игрой), которые сами добавляют русский текст прямо в body
if (LANG === 'en' && typeof MutationObserver !== 'undefined') new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) trDom(n); }).observe(document.body, { childList: true });
if (Q.get('test') === '1') addEventListener('error', (e) => (window.__errs = window.__errs || []).push(e.error ? e.error.stack : e.message)); // для проверки: стеки ошибок
const IS_TOUCH = Q.get('touch') === '1' || matchMedia('(pointer: coarse)').matches;
document.body.classList.toggle('coarse', IS_TOUCH);
const ls = { get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* приватный режим */ } } };

// ═════════════ Пресеты графики ═════════════
export const PRESETS = {
  low: { name: tr('Низкий'), skyOnly: true, fxLo: true, lodObj: 3500, desc: tr('слабые телефоны'), prCap: 1.25, prMul: 0.8, draw: 8000, houseK: 0.5, bldNear: 0, groundSeg: 160, zoneTex: 512, trees: 0, clouds: 0, roofDetail: false, shadows: false, particles: 1500,
    perf: { scale: 1, min: 0.75, aa: 'off', up: 'off' } },
  medium: { name: tr('Средний'), skyOnly: true, fxLo: true, lodObj: 4500, desc: tr('большинство телефонов'), prCap: 1.5, prMul: 1, draw: 11000, houseK: 0.8, bldNear: 300, bldFar: 1600, treeFar: 450, treeNear: 110, groundSeg: 256, zoneTex: 1024, trees: 3500, clouds: 150, roofDetail: true, shadows: false, particles: 2500,
    perf: { scale: 1, min: 0.7, aa: 'fxaa', up: 'cas', sharp: 0.45 } },
  high: { name: tr('Высокий'), lodObj: 6000, desc: tr('мощные телефоны и ПК: тени, свечение'), prCap: 2, prMul: 1, draw: 16000, houseK: 1, bldNear: 450, bldFar: 2600, treeFar: 700, treeNear: 170, groundSeg: 320, zoneTex: 1024, trees: 14000, clouds: 500, roofDetail: true, particles: 4000,
    shadows: true, shadowMap: 2048, shadowBox: 600, aniso: 8, /* 4 → 8 (2026-10-23): земля и крыши под острым углом чётче, на телефонах почти бесплатно */
    perf: { scale: 1, min: 0.67, aa: 'msaa', up: 'cas', sharp: 0.4 }, post: { bloom: 0.35, grade: 0.18, vignette: 0.14 } },
  ultra: { name: tr('Ультра'), lodObj: 8000, desc: tr('тени 4K, тени деревьев, дальняя прорисовка'), prCap: 2, prMul: 1, draw: 20000, houseK: 1, bldNear: 650, bldFar: 3600, treeFar: 1000, treeNear: 260, groundSeg: 384, zoneTex: 2048, trees: 24000, clouds: 900, roofDetail: true, particles: 6000,
    shadows: true, treeShadows: true, shadowMap: 4096, shadowBox: 800, aniso: 8,
    perf: { scale: 1, min: 0.67, aa: 'msaa', up: 'fsr', sharp: 0.35 }, post: { bloom: 0.6, vignette: 0.18, grade: 0.3, exposure: 0.95 } },
  // «Кастомный» — последним, после «Ультра» (Mark 2026-10-23): всё настраивается (Настройки → «Кастомный»). Основа — техника, ракеты, бомбы, самолёты и эффекты как на
  // «Высоком» (тени вблизи, свечение, сглаживание), город проще
  custom: { name: tr('Кастомный'), lodObj: 5000, desc: tr('свои настройки: разрешение, тени, город, эффекты'), prCap: 1.5, prMul: 1, draw: 12000, houseK: 0.8, bldNear: 0, treeNear: 0, groundSeg: 256, zoneTex: 1024, trees: 5000, clouds: 300, roofDetail: true, particles: 4000,
    shadows: true, shadowMap: 2048, shadowBox: 450, aniso: 4, props: false,
    perf: { scale: 1, min: 0.6, aa: 'msaa', up: 'cas', sharp: 0.4 }, post: { bloom: 0.35, grade: 0.18, vignette: 0.14 } },
};
export const WEATHER_KEYS = ['day', 'morning', 'evening', 'sunset', 'overcast']; // ночь временно убрана (Mark, 2026-10-18): вернуть 'night' — и она снова в настройках
// цветокоррекция по погоде (post.js): gGain — оттенок светов, gLift — теней, gSat — насыщенность, gCon — контраст; сдержанно
const GRADE = {
  day: { gSat: 1.02 },
  morning: { gGain: [1.035, 1.0, 0.95], gLift: [0, 0.004, 0.012] },
  evening: { gGain: [1.05, 0.995, 0.92], gLift: [0.006, 0, 0.012], gSat: 0.97 },
  sunset: { gGain: [1.07, 0.98, 0.88], gLift: [0.01, 0, 0.018], gCon: 1.04 },
  overcast: { gGain: [0.97, 1.0, 1.03], gSat: 0.86, gCon: 0.96 },
};
const CINEMA = Q.get('gfx') === 'cinema'; // запись промо-ролика (tools/airdef-promo): «Ультра» на пределе; в меню его нет
let gfxKey = CINEMA ? 'ultra' : Q.get('gfx') || ls.get('fortuna_airdef_gfx') || (IS_TOUCH ? 'medium' : 'high');
if (!PRESETS[gfxKey]) gfxKey = 'medium';
// свои настройки пресета «Кастомный» (Настройки; применяются перезапуском): разрешение, динамическое
// разрешение и его цель, тени, город, детали улиц, эффекты кадра, сглаживание, дальность; на сенсорных — без ×2 (если не «полное»)
const GO = (() => { try { return JSON.parse(ls.get('fortuna_airdef_gfxo') || '{}') || {}; } catch (_) { return {}; } })();
// предел кадров для всех пресетов, кроме «Кастомного» (у него свой): 'auto' — на телефоне 60, на ПК без предела; 30 / 45 / 60; 0 — нет (ПК)
// чёткость на телефоне для всех пресетов, кроме «Кастомного» (Mark 2026-10-23: «мыльно»; после снижения нагрузки на процессор — можно чётче):
// 'auto' — как было (×1,25 у «Низкого» и «Среднего», ×1,5 у «Высокого» и «Ультра»), 'high' — ×1,75 / ×2, 'native' — как у экрана. Применяется перезапуском
const SHARP = (() => { const v = ls.get('fortuna_airdef_sharp'); return v === 'high' || v === 'native' ? v : 'auto'; })();
// видеочип телефона и его примерные баллы (gpu.js): по ним «Обычная» чёткость; ?gpu=<баллы> — проверить другую ступень (напр. ?gpu=1500 / 12000)
const GPU = (() => { const g = detectGpu(), q = Q.get('gpu'); if (q && Number.isFinite(+q)) g.score = +q; return g; })();
const GPU_NAME = GPU.name;
let fpsCap = (() => { const v = ls.get('fortuna_airdef_fps'); return v === null || v === 'auto' || !Number.isFinite(+v) ? 'auto' : +v; })();
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
  if (o.city === 'low') Object.assign(P, { bldNear: 0, treeNear: 0, bldFar: 0, treeFar: 0, trees: 3000, houseK: 0.6, groundSeg: Math.min(P.groundSeg, 192) });
  else if (o.city === 'mid') Object.assign(P, { bldNear: 250, treeNear: 100, bldFar: 1400, treeFar: 400, trees: 8000, houseK: 0.9 });
  else if (o.city === 'full') Object.assign(P, { bldNear: 450, treeNear: 170, bldFar: 2600, treeFar: 700, trees: 14000, houseK: 1 });
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
  if (!custom && P.shadows && !(P.shEvery > 1)) { P.shEvery = 2; P.shAuto = true; } // тени через кадр (main.js frame: камера низко — каждый кадр)
  P.bloomQ = true; P.halfFx = true; P.treeLoD = 1600;
  const b = PRESETS[gfxKey].prCap; // по пресету, а не по P: applyGfx уже срезал до 1,5 — «Высокий» и «Ультра» выходили ×1,25 (ревью 2026-10-23)
  // «Обычная» — по баллам видеочипа (2026-10-23): слабые — как было (×1,25 / ×1,5), дальше ступени до ×2; не тянет — динамическое разрешение само
  // опустит (perf.min)
  const AUTO = sharpFor(GPU.score); // ступень по баллам видеочипа (gpu.js): ниже прежнего не опускаем
  if (!custom) P.prCap = SHARP === 'native' ? 4 : SHARP === 'high' ? Math.max(AUTO[gfxKey] || 0, b > 1.5 ? 2 : 1.75) : (AUTO[gfxKey] || Math.min(P.prCap, b > 1.5 ? 1.5 : 1.25));
  // ?fsrout=1 (проба): холст — в разрешении экрана, 3D — во внутреннем буфере той же чёткости, до экрана — FSR (края чётче, чем растяжка браузера)
  if (!custom && /[?&]fsrout=1/.test(location.search) && P.prCap < 4) {
    const native = (window.devicePixelRatio || 1) * (P.prMul || 1), k = Math.min(1, P.prCap / native);
    P.prCap = 4; P.perf.scale = k; P.perf.min = Math.max(0.35, k * (P.perf.min || 0.7)); P.perf.up = 'fsr';
  } // телефон и планшет: экран и так плотный — меньше пикселей, меньше нагрев (iPad Air M1: «Средний» упирался в видеочип)
  return P;
}
// окно контейнера через кадр — по умолчанию на сенсорных (телефоны, планшеты) и на «Низком»/«Среднем»
for (const k in PRESETS) if (PRESETS[k].podHalf === undefined) PRESETS[k].podHalf = IS_TOUCH || k === 'low' || k === 'medium';
const P0 = touchGfx(gfxKey === 'custom' ? applyGfx(PRESETS.custom, GO) : applyGfx(PRESETS[gfxKey], { fullRes: GO.fullRes }), gfxKey === 'custom'); // свои настройки — только у «Кастомного»
const P = CINEMA ? Object.assign(P0, { name: tr('Кино'), lodObj: 1e9, draw: 26000, bldNear: 5000, treeNear: 3000, bldFar: 9000, treeFar: 5000, trees: 32000, clouds: 1100, particles: 9000, props: true, shadowMap: 4096, shadowBox: 900, // дома и деревья готовыми моделями на километры (комментарий съедал конец строки с 2026-10-09 — у «Кино» не было этих настроек)
  shEvery: 1, shAuto: false, // «Кино» — без уступок: тени каждый кадр
  treeShadows: true, aniso: 16, zoneTex: 2048, prCap: 2, podHalf: false, perf: { ...P0.perf, scale: 1, dynOff: true, aa: 'msaa', up: 'off' }, post: { ...P0.post, bloom: 0.5 } }) : P0;
if (Q.get('bldfar') !== null) Object.assign(P, { bldFar: +Q.get('bldfar'), treeFar: +Q.get('bldfar') * 0.3 }); // проверка: ?bldfar=0 — без дальних копий моделей
// карта: «Мульти-волна» (и в онлайне) и «Кино» — только зимняя долина «Северный рубеж», вылеты, задания и уроки — город
// (?map=winter|city — принудительно); у зимы — свои погоды. Карта строится при загрузке: смена — перезагрузкой страницы
// «Съёмка» — карта на выбор (pmap: 'winter' | 'city', по умолчанию зимняя) и своя погода для каждой карты (pwx: { city, winter })
// Осенняя «Туманная топь» (Хеллоуин) — ?map=autumn, «Съёмка» (pmap 'autumn') и проверка вертолёта ?heli=…
const MAPS = ['winter', 'city', 'autumn'];
// вылет на вертолёте (подвеска heli) — тоже на «Туманной топи»
function wantMap(game, pmap, era, lo, evd, tside) {
  if (MAPS.includes(Q.get('map'))) return Q.get('map');
  if (game === 'training') return tside === 'heli' ? 'autumn' : tside === 'matk' || tside === 'mdef' ? 'winter' : 'city'; // обучение: вертолёт — «Туманная топь», «Мульти-волна» — «Северный рубеж», как сами режимы (Mark 2026-10-21)
  if (game === 'air' && LOADOUTS[era] && LOADOUTS[era][lo] && LOADOUTS[era][lo].heli) return 'autumn';
  if (game === 'defense' && evd) return 'autumn'; // оборона события «Туманная топь» (event.js)
  if (game === 'photo') return pmap === 'city' || pmap === 'autumn' ? pmap : 'winter';
  if (Q.get('heli')) return 'autumn';
  const online = game === 'online' || Q.get('ad') || Q.get('mp') === '1';
  return game === 'multi' || (online && ls.get('fortuna_ad_kind') === 'multi') ? 'winter' : 'city';
}
const SETUP0 = (() => { try { return JSON.parse(ls.get('fortuna_airdef_setup') || '{}') || {}; } catch (_) { return {}; } })();
// вертолёт и оборона события — только при запуске из события (event.js: go=air&hlo=<подвеска в эпохе setup.era> / go=defense и setup.evd): сохранённая вертолётная подвеска обычный «Вылет» на осеннюю карту не уводит
const HLO = Q.get('hlo') !== null ? +Q.get('hlo') : -1;
const MAP = wantMap(SETUP0.game, SETUP0.pmap, SETUP0.era, Q.get('go') === 'air' ? HLO : -1, Q.get('go') === 'defense' && SETUP0.evd, SETUP0.tside);
// погода: «Съёмка» — выбранная для этой карты; зимняя карта иначе — всегда случайная из своих (общая настройка — только для города)
const weatherKey = Q.get('weather') || (SETUP0.game === 'photo' ? (SETUP0.pwx && SETUP0.pwx[MAP]) || 'random' : ls.get('fortuna_airdef_weather') || 'random');
const RND_KEYS = WEATHER_KEYS.filter((k) => k !== 'night'); // «Случайная» — без ночи; ночь — только по выбору и не в онлайне (?mp=1, приглашение ?ad=)
const MAP_KEYS = MAP === 'winter' ? WINTER_KEYS : MAP === 'autumn' ? AUTUMN_KEYS : null; // у зимы и осени — свои погоды
const W_KEY = MAP_KEYS ? (MAP_KEYS.includes(weatherKey) ? weatherKey : MAP_KEYS[Math.floor(Math.random() * MAP_KEYS.length)])
  : WEATHER_KEYS.includes(weatherKey) && !(weatherKey === 'night' && (Q.get('mp') === '1' || Q.get('ad'))) ? weatherKey : RND_KEYS[Math.floor(Math.random() * RND_KEYS.length)];
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
if (!['air', 'defense', 'multi', 'training', 'online', 'photo'].includes(setup.game)) setup.game = 'air';

// ═════════════ Город и рендер ═════════════
const city = MAP === 'winter' ? buildWinter(1) : MAP === 'autumn' ? buildAutumn(1) : buildCity(1);
const MILLS = city.objects.filter((o) => (o.models || []).some((m) => m.m === 'obj_mill')).map((o) => o.id); // объекты с мельницей — крутить крылья
setGround(city.groundH);
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
ktxInit(renderer); // сжатые текстуры (ktx.js): нужен рендерер — какие форматы есть у устройства
// телефон: текстуры после загрузки на видеокарту освобождаются (models.js, ktx.js) — в бою (онлайн и одиночном) не выбрасывать игрока: сжатые
// текстуры (модели, земля, листы взрывов) грузятся заново из кэша (ktxRestore — иначе до конца боя чёрные), бой доигрывается, перезагрузка — при выходе в меню
canvas.addEventListener('webglcontextrestored', () => { if (!IS_TOUCH) return; if ((C.net && C.net.battle) || C.state === 'play') { C.reloadAfterBattle = true; ktxRestore(renderer); } else location.reload(); }); // и в одиночном бою (2026-10-22, «бои изредка вылетают»): свернул Telegram / пришло уведомление — iOS отбирает контекст WebGL, раньше страница сразу перезагружалась и бой пропадал
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
  pipe = createPipeline(renderer, { ...(P.post || {}), ...(GRADE[W_KEY] || {}), ldr, exposure: renderer.toneMappingExposure, scale: perf.scale, upscaler: perf.up, sharp: perf.sharp || 0.4, aa: perf.aa,
    bloomQ: !!P.bloomQ, fx: !!P.halfFx, fxU: FXU, fxLayer: FX_LAYER, fxAddLayer: FX_ADD_LAYER }); // fx — облака и дым в половине разрешения (слои FX_*)
  sceneTM = ldr ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
  renderer.setPixelRatio(basePR);
} else renderer.setPixelRatio(basePR * perf.scale);
renderer.toneMapping = sceneTM;
const snd = createSound();

// ═════════════ Общий контекст режимов ═════════════
const C = {
  $, Q, IS_TOUCH, ls, P, W, W_KEY, weatherKey, gfxKey, NIGHT: W.night || 0, city, scene, camera, renderer, snd, setup, MAP, wantMap, GPU_NAME,
  get pipe() { return pipe; }, get sceneTM() { return sceneTM; },
  SHARP, get fpsCap() { return fpsCap; }, setFpsCap(v) { fpsCap = v === 'auto' ? 'auto' : +v; ls.set('fortuna_airdef_fps', String(fpsCap)); },
  VW: 1, VH: 1, fx: null, G: null, S: null, raid: null, player: null, ctrl: null, state: 'loading', paused: false, t: 0,
  hooks: {}, // события боя для текущего режима
  MODE: () => (C.net && C.net.battle ? MODES[C.net.battle.mode] : MODES[setup.diff]), // онлайн — режим комнаты
  // чувствительность: ручка (тангаж/крен), ведение контейнера, поворот обзора оператора
  // invert — вверх нос вниз (как в авиасимуляторах); pad — крестовина тангажа и крена, padK — её сила; aim — наведение камерой (сенсорные), иначе ручка
  sens: Object.assign({ stick: 1, look: 1, invert: false, pad: true, padK: 0.5, aim: true }, (() => { try { return JSON.parse(ls.get('fortuna_airdef_sens') || '{}'); } catch (_) { return {}; } })()),
  saveSens: () => ls.set('fortuna_airdef_sens', JSON.stringify(C.sens)),
  // «АВТО» — помощь в бою (вылет и оператор ЗРК)
  auto: ls.get('fortuna_airdef_auto') === '1',
  setAuto(on) { C.auto = !!on; ls.set('fortuna_airdef_auto', on ? '1' : '0'); for (const id of ['tAuto', 'opAuto']) $(id).classList.toggle('on', C.auto); C.say(on ? tr('АВТО включено: захват, сброс и пуск — сами (не идеально)') : tr('АВТО выключено'), 2); snd.click(); },
  saveSetup: () => ls.set('fortuna_airdef_setup', JSON.stringify(setup)),
};

// ═════════════ Бой: город + ПВО + налёт (+ самолёт игрока) ═════════════
const unitMeshes = new Map(), wpnMeshes = new Map(), samMeshes = new Map(), planeMeshes = new Map(), wrecks = [], debris = [];
const evLaunch = new Map(); // пусковые «Мульти-волны»
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
  const S = createStrike({ city, rnd, mode: C.MODE, night: C.NIGHT, fx: simFx, game: o.game || null, // game — перезарядка ПВО: 'air' вылеты, 'multi' «Мульти-волна»
    aircraft: () => { const a = raid ? raid.alive() : []; return C.player && !C.player.dead ? [C.player, ...a] : a; },
    hurt: (a, dmg, by, from) => { if (a === C.player) { if (C.hooks.hurtPlayer) C.hooks.hurtPlayer(dmg, by, from); } else raid.hurt(a, dmg * (C.hooks.aiDmgK || 1), from); },
    unitDmgK: () => C.hooks.unitDmgK ?? 1,
    laserSpot: (a) => (a === C.player ? (C.hooks.playerLaser ? C.hooks.playerLaser() : null) : raid.laserSpot(a)),
    spawnDecoy: (a, key, aim) => { const d = raid.spawnDecoy(a, key, aim); if (C.hooks.decoyOut) C.hooks.decoyOut(d); } });
  const raid = createRaid(S, city, rnd, { side: o.defSide === 'east' ? 'west' : 'east', era: o.era, fx: raidFx, helis: city.kind === 'autumn' }); // ИИ-вертолёты — только на «Туманной топи» (Mark 2026-10-21)
  if (C.diff && (setup.game === 'defense' || (setup.game === 'multi' && setup.mrole !== 'atk'))) raid.setHard(C.diff.knobs(setup.game, setup.diff)); // сложность: налёт против игрока за ПВО
  C.S = S; C.raid = raid; C.player = o.player || null; C.raidEra = o.era || 2;
  for (const ob of S.objects) objLook(ob.id, false);
  return S;
};
// вид объекта-цели: целый или разрушенный (осел и почернел) — процедурная часть, заглушка и готовые постройки
function objLook(id, ruin) {
  for (const m of [C.G.objMesh[id], C.G.objBox[id]]) if (m) { m.material = ruin ? C.G.ruinMat : C.G.objMat; m.scale.y = ruin ? 0.35 : 1; m.updateMatrix(); } // матрицы у неподвижного — вручную (city-render freezeTree)
  for (const g of [C.G.objGroup[id], C.G.objFar && C.G.objFar[id]]) { // и дальняя копия (если она придёт позже — objFarLook)
    if (g) { g.userData.ruin = ruin; g.scale.y = ruin ? 0.35 : 1; g.updateMatrix(); g.traverse((c) => { if (!c.isMesh) return; if (!c.userData.mat0) c.userData.mat0 = c.material; c.material = ruin ? C.G.ruinMat : c.userData.mat0; }); }
  }
}
function clearBattle() {
  for (const m of [...unitMeshes.values(), ...wpnMeshes.values(), ...samMeshes.values(), ...planeMeshes.values()]) scene.remove(m);
  for (const w of [...wrecks, ...debris]) scene.remove(w.g);
  unitMeshes.clear(); wpnMeshes.clear(); samMeshes.clear(); planeMeshes.clear(); wrecks.length = 0; debris.length = 0; clearDebris(scene);
  for (const g of evLaunch.values()) scene.remove(g); evLaunch.clear(); C.ev = null;
  if (C.fx) { C.fx.clearBurning(); C.fx.clearCraters(); }
  C.S = null; C.raid = null; C.player = null;
}
C.clearBattle = clearBattle;
// онлайн: зеркало боя (сервер считает, клиент повторяет по снимкам — games/airdef/net.js); не шагается
C.netBattle = function (N, o) {
  clearBattle(); C.simFx = simFx; C.raidFx = raidFx; // хуки эффектов — для зеркала (net.js)
  const S = createStrike({ city, rnd: Math.random, mode: () => MODES[o.mode] || C.MODE(), night: C.NIGHT, fx: simFx, game: o.game || null,
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
        // «Тор»: антенна сопровождения — на цапфе (tdish.p), крышки ячеек — на шарнирах по верхней кромке (lids.hinge; борт — по знаку x слота)
        if (gm && gm.tdish && md.LN.tdish) { const P = md.LN.tdish.p, pv = new THREE.Group(); obj(gm.tdish, pv); pv.position.fromArray(P); gm.tdish.position.set(-P[0], -P[1], -P[2]); tg.add(pv); g.userData.tdish = pv; }
        if (gm && gm.lids.length && md.LN.lids) {
          const H = md.LN.lids.hinge; g.userData.lids = gm.lids.map((lid, i) => {
            const sp = Ld.slots[i], sx = Math.sign(sp[0]), pv = new THREE.Group(); obj(lid, pv);
            pv.position.set(sx * H[0], H[1], sp[1]); lid.position.set(-sx * H[0], -H[1], -sp[1]); pv.userData.sx = sx; tg.add(pv); return pv;
          });
        }
      }
      // антенна обзора (готовая модель): на первой башне (без башни — на машине, Sentinel), ось вращения — центр её опоры (нижние 15 % по высоте)
      if (gm && gm.radar) { const rd = gm.radar.clone(), pv = new THREE.Group(); obj(rd, pv); (tur.length ? tur[0].tg : g).add(pv); const ax = radarAxis(rd); pv.position.set(ax[0], 0, ax[1]); rd.position.set(-ax[0], 0, -ax[1]); g.userData.radar = pv; }
      g.userData.tur = tur; g.userData.slots = slots; g.userData.nSlots = md.LN ? slotCount(md.LN) : 0;
      if (!P.shadows) addBlob(g); // без карты теней — мягкое пятно под машиной (иначе «висит» над землёй)
      g.rotation.y = u.yaw; scene.add(g); unitMeshes.set(u.id, g);
    }
    g.position.copy(u.pos); g.position.y -= 1.5; seat(g, u); // по рельефу: на склоне длинная машина не уходит в землю
  }
};
// «Тор»: крышки ячеек (только вид; правило — как в sim/strike.js u.lid, чтобы и в онлайне, где u.lid не приходит).
// Следующая ячейка открывается, пока цель сопровождается и есть ракеты; ракета ушла — её крышка открыта ещё 3 с, следующая — заново с нуля.
const sstep = (x) => x * x * (3 - 2 * x);
function torLids(u, g, dt) {
  const LN = LNCH[u.key], L = g.userData.lids, LD = LN.lids; if (!LD) return;
  const nS = slotCount(LN), nf = u.S.ammo - Math.max(0, Math.round(u.ammo)), st = u.lidSt || (u.lidSt = { n: nf, v: 0, a: L.map(() => 0), hold: L.map(() => 0) }); // на машине (u), не на модели: пересборка (подгрузка подробной) не сбрасывает
  if (nf > st.n) { for (let k = st.n; k < nf; k++) st.hold[(k % nS) % L.length] = 3; st.v = 0; }
  st.n = nf;
  const want = !!(u.track && !u.track.dead) && u.ammo > 0 && u.reloadT <= 0, next = (nf % nS) % L.length;
  st.v = clamp(st.v + (want ? dt / LD.tOpen : -dt / LD.tClose), 0, 1);
  for (let k = 0; k < L.length; k++) {
    st.hold[k] = Math.max(0, st.hold[k] - dt);
    const tgt = st.hold[k] > 0 ? 1 : k === next ? st.v : 0;
    st.a[k] = k === next && !(st.hold[k] > 0) ? tgt : clamp(st.a[k] + clamp(tgt - st.a[k], -dt / LD.tClose, dt / LD.tOpen), 0, 1);
    L[k].rotation.z = L[k].userData.sx * LD.open * sstep(st.a[k]);
  }
}
// «Тор»: антенна сопровождения — по углу места цели (от положения покоя el0, в пределах lo…hi, не быстрее w рад/с); без цели — в покой
function torDish(u, g, dt) {
  const D = g.userData.tdish, DS = LNCH[u.key].tdish; let a = 0;
  if (u.track && !u.track.dead && u.emit) { D.getWorldPosition(LP); const t = u.track.pos; a = clamp(Math.atan2(t.y - LP.y, Math.hypot(t.x - LP.x, t.z - LP.z)) - DS.el0, DS.lo, DS.hi); }
  D.rotation.x += clamp(a - D.rotation.x, -DS.w * dt, DS.w * dt);
}
// ось антенны обзора: центр (x, z) вершин её нижней части — опоры или мачты (тарелка бывает смещена от оси)
const RADAR_W = { gepard: 6.3, tor: 6.3, osa: 3.5, pantsir: 4.2, roland: 6.3, tunguska: 6.3, rapier: 4, gpsjamw: 3.1, gpsjam: 0.63 }; // рад/с: Gepard и «Тор» ≈ 60 об/мин, «Оса» и «Панцирь» — медленнее, Sentinel — 30, П-18 — 6
function radarAxis(o) {
  o.updateMatrixWorld(true); const V = new THREE.Vector3(), P = [];
  o.traverse((m) => { if (!m.isMesh) return; const a = m.geometry.attributes.position; for (let i = 0; i < a.count; i += 3) { V.fromBufferAttribute(a, i).applyMatrix4(m.matrixWorld); P.push(V.x, V.y, V.z); } });
  let y0 = 1e9, y1 = -1e9; for (let i = 1; i < P.length; i += 3) { y0 = Math.min(y0, P[i]); y1 = Math.max(y1, P[i]); }
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; const lim = y0 + (y1 - y0) * 0.15;
  for (let i = 0; i < P.length; i += 3) if (P[i + 1] <= lim) { x0 = Math.min(x0, P[i]); x1 = Math.max(x1, P[i]); z0 = Math.min(z0, P[i + 2]); z1 = Math.max(z1, P[i + 2]); }
  return x0 < 1e8 ? [(x0 + x1) / 2, (z0 + z1) / 2] : [0, 0];
}
// мягкое тёмное пятно под машиной по её габаритам (радиальный градиент, без записи глубины)
let blobTex = null;
function addBlob(g) {
  if (!blobTex) { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext && c.getContext('2d'); if (x) { const gr = x.createRadialGradient(32, 32, 4, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); } blobTex = new THREE.CanvasTexture(c); }
  const sz = new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3()), q = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, color: 0x000000 }));
  q.rotation.x = -Math.PI / 2; q.scale.set(Math.max(2, sz.x * 1.35), Math.max(2, sz.z * 1.25), 1); q.position.y = 0.08; q.renderOrder = 1; g.add(q);
}
const dist = (p) => camera.position.distanceTo(p);
const TP = new THREE.Vector3();
// объекты-цели: готовые постройки (сотни тысяч треугольников на объект) — только ближе P.lodObj, дальше — их сильно упрощённые
// копии (city-render.js farIndex: та же форма и текстура), коробки — только пока модели грузятся. Окно ТВ — всё подробно (его узкое поле зрения само отсекает лишнее)
const objC = new Map();
function objLod(p, D) {
  const G = C.G; if (!G || !G.objGroup) return;
  for (const o of city.objects) {
    const g = G.objGroup[o.id]; if (!g) continue;
    let c = objC.get(o.id);
    if (!c) { const L = o.models && o.models.length ? o.models : o.parts; let x = 0, z = 0, r = 0; for (const q of L) { x += q.x; z += q.z; } x /= L.length; z /= L.length; for (const q of L) r = Math.max(r, Math.hypot(q.x - x, q.z - z)); objC.set(o.id, c = { x, z, r }); }
    const full = Math.hypot(c.x - p.x, c.z - p.z) - c.r < D, b = G.objBox[o.id], f = G.objFar && G.objFar[o.id], fr = !!(f && f.userData.ready);
    g.visible = full; if (f) { f.visible = !full && fr; if (fr && f.userData.ruin !== g.userData.ruin && g.userData.ruin !== undefined) objLook(o.id, g.userData.ruin); } // вдали — упрощённые копии тех же построек
    if (b) b.visible = (!full && !fr) || g.userData.left.size > 0; // коробка — пока не пришли модели (или нет дальних копий)
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
  down(a) { C.fx.explosion(a.pos, a.role === 'decoy' ? 8 : 22, a.role === 'decoy' ? 'air' : 'plane'); /* 'plane' — свой лист: топливо и обломки */ if (a.role === 'decoy') snd.samBurst(dist(a.pos), 0.8); else snd.planeKill(dist(a.pos)); const g = planeMeshes.get(a.id); if (g) { planeMeshes.delete(a.id); wrecks.push({ g, vel: a.vel.clone(), spin: (Math.random() - 0.5) * 3, t: 0 }); } if (C.hooks.planeDown) C.hooks.planeDown(a); },
  out(a) { const g = planeMeshes.get(a.id); if (g) { scene.remove(g); planeMeshes.delete(a.id); } if (C.hooks.planeOut) C.hooks.planeOut(a); },
  release(a, key) { const k = AG[key] && AG[key].kind; if ((k === 'agm' || k === 'arm' || k === 'cruise') && a.role !== 'carrier') snd.airLaunch(dist(a.pos)); if (C.hooks.aiRelease) C.hooks.aiRelease(a, key); }, // ракета с самолёта ИИ — запись пуска
};
const aaaT = new Map();
const simFx = {
  // ракета в полёте: маршевая ступень (+ ускоритель), факел; старт — по типу пусковой (launchers.js)
  samLaunch(m) {
    // ракета из модели комплекса (если есть) или процедурная; ускоритель — отдельной частью, отвалится в полёте; факел — у среза сопла (units-render.js)
    const L = m.M.L, big = L > 5, g = samMissileMesh(m, unitMissileGlb(m.unit.key), wMat);
    g.position.copy(m.pos); g.lookAt(LP.copy(m.pos).sub(m.dir));
    scene.add(g); samMeshes.set(m.id, g);
    const mode = m.ln ? m.ln.mode : 'rail', d = dist(m.pos);
    if (mode === 'cold') {
      C.fx.launchCold(LP.copy(m.pos).addScaledVector(m.dir, L / 2), m.dir, big);
      // «Тор» (9М331): катапульта выбрасывает ракету, газовые рули склоняют её, двигатель — только через ≈ 1 с на ≈ 20 м. В записях С-300 рёв идёт
      // через 0,3–0,5 с после хлопка — факел загорался бы раньше двигателя. Поэтому здесь — хлопок катапульты, а вспышка, факел и рёв — в расчётный момент (samIgnite)
      if (m.ln.ej && m.ln.ej.tilt) { snd.eject(d, false); m.coldRec = false; }
      else { const rec = snd.coldLaunch(d, !big); m.coldRec = !!rec; if (rec) m.visIgn = rec.gap; } // С-300 / С-400: запись старта; вспышка и факел — когда в записи начинается рёв, полёт (зажигание в расчёте) — прежний
    }
    else if (mode === 'tube') { C.fx.launchTube(m.pos, m.dir); snd.eject(d, false); }
    else { C.fx.launchHot(m.pos, m.dir, big, m.unit.pos.clone().setY(city.groundH(m.unit.pos.x, m.unit.pos.z))); snd.samLaunch(d, big, m.unit.key); }
    if (C.hooks.samLaunch) C.hooks.samLaunch(m);
  },
  samIgnite(m) { if (m.visIgn !== undefined) return; C.fx.ignite(LP.copy(m.pos).addScaledVector(m.dir, -m.M.L / 2), m.dir, m.M.L > 5); if (!m.coldRec) snd.samLaunch(dist(m.pos), m.M.L > 5, m.unit.key); }, // под запись — вспышка в отрисовке
  samJet(m) { C.fx.jet(m.pos, m.dir); },
  samStage(m) {
    const g = samMeshes.get(m.id), b = g && g.userData.booster; if (!b) return;
    // ускоритель отваливается и падает, кувыркаясь; факел переходит на срез маршевой ступени
    b.getWorldPosition(LP); g.remove(b);
    const q = new THREE.Group(); q.add(b); b.position.set(0, 0, 0); q.position.copy(LP); q.quaternion.copy(g.quaternion); scene.add(q);
    debris.push({ g: q, vel: m.dir.clone().multiplyScalar(m.speed * 0.85), spin: new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 3), t: 0 });
    g.userData.booster = null;
    if (g.userData.nzM) { const n = g.userData.nzM; g.userData.flame.at(n.x, n.y, n.z); } else g.userData.flame.move(-m.M.L / 2 + m.M.L * m.ln.stage);
    C.fx.stage(LP, m.dir);
  },
  samTrail(m) { C.fx.samTrail(m); },
  samEnd(m, hit) { const g = samMeshes.get(m.id); if (g) { scene.remove(g); samMeshes.delete(m.id); } if (C.hooks.samEnd) C.hooks.samEnd(m, hit); },
  wpnIgnite(w) { snd.tbmLaunch(dist(w.pos), true); C.fx.ignite(w.pos, w.dir, true); }, // «Кинжал» сошёл с пилона — двигатель
  wpnRelease(w) {
    const g = relMesh(w); scene.add(g); wpnMeshes.set(w.id, g);
    // «Мульти-волна»: старт баллистики с пусковой — рёв; крылатая с носителя — хлопок и запуск двигателя
    if (w.ev && !w.decoy && w.W.kind === 'tbm' && w.phase !== 'drop') snd.tbmLaunch(dist(w.pos)); // воздушный пуск — рёв при зажигании (wpnIgnite)
    else if (w.ev && w.owner && w.owner.role === 'carrier') snd.cruiseLaunch(dist(w.pos));
    if (w.owner === C.player) snd.release(w.W.kind === 'agm' || w.W.kind === 'arm');
    if (C.hooks.wpnRelease) C.hooks.wpnRelease(w);
  },
  wpnTrail(w) { // огонь и дым — из среза сопла (w.nzL — сопло в осях модели: +Z к хвосту, как после lookAt)
    if (!w.nzL) { C.fx.wpnTrail(w); return; }
    C.fx.wpnTrail(w, wpnNozzle(w, TP));
  },
  wpnEnd(w, res) { const g = wpnMeshes.get(w.id); if (g) { scene.remove(g); wpnMeshes.delete(w.id); } if (C.hooks.wpnEnd) C.hooks.wpnEnd(w, res); },
  explosion(p, R, kind) { C.fx.explosion(p, R, kind); C.fx.crater(p, R, kind, city.groundH(p.x, p.z), city.bldAt(p.x, p.z)); if (kind === 'air') snd.samBurst(dist(p), R / 12); else snd.explosion(dist(p), R / (kind === 'tbm' ? 13 : R >= 45 ? 16 : 20), kind); }, // в воздухе — подрыв ЗУР / перехват
  gunFire(u, t, hits, dt) {
    C.fx.gunFire(u.pos, t.pos, hits, dt);
    if (snd.gunLoop(u.id, dist(u.pos), u.key)) return; // многоствольные — записанная очередь
    const k = (aaaT.get(u.id) || 0) - dt; if (k <= 0) { snd.aaa(dist(u.pos), /gepard|skyguard|skynex/.test(u.key) ? 35 : 23, u.S.gun && u.S.gun.rof); aaaT.set(u.id, 0.16); } else aaaT.set(u.id, k);
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
  cmDrop(a, type, made) { C.fx.cmDrop(a, type, made); if (a === C.player) { if (type === 'flare') snd.flare(); else snd.chaff(); } },
  decoyed(m, f) { if (C.hooks.decoyed) C.hooks.decoyed(m, f); },
  trackBroken(u, a) { if (C.hooks.trackBroken) C.hooks.trackBroken(u, a); },
};
// подвеска ИИ-самолёта с готовой моделью: тяжёлое — ближе к фюзеляжу (как у игрока); k — номер изделия этого типа
const ST_ORDER = [3, 4, 2, 5, 1, 6, 0, 7], LOD_D = 2500; // дальше LOD_D — простая модель самолёта
function hangLoad(g, stations, load) {
  const out = []; let oi = 0;
  for (const l of [...load].sort((x, y) => AG[y.key].mass - AG[x.key].mass)) for (let k = 0; k < l.n && oi < 8; k++) {
    const W = AG[l.key], p = stations[ST_ORDER[oi++]], m = pylonMesh(l.key, W, weaponGeo, wMat); if (weaponPending(l.key)) wantWeapon(l.key); // пришла — самолёты пересоберутся
    m.position.set(W.kind === 'tbm' ? 0 : p.x, p.y - (W.vis.hang ?? W.vis.r) - 0.05, p.z); g.add(m); out.push({ m, l, k }); // «Кинжал» — под фюзеляжем по оси
  }
  return out;
}
// посадка машины на рельеф: наклон по высоте земли спереди / сзади и слева / справа, высота — по средней из четырёх точек
// (раньше — по центру: на склоне нос или корма длинной машины уходили в землю). Пересчёт — когда машину переставили
const SEAT_B = new THREE.Box3();
function seat(g, u) {
  if (u.roof) return; // ПЗРК на крыше
  const k = `${u.pos.x},${u.pos.z},${u.yaw}`;
  if (g.userData.seatK !== k) {
    g.userData.seatK = k;
    if (!g.userData.half) { const r0 = g.rotation.y, p0 = g.position.clone(); g.rotation.set(0, 0, 0); g.position.set(0, 0, 0); g.updateMatrixWorld(true); SEAT_B.setFromObject(g); g.rotation.y = r0; g.userData.half = [Math.max(0.8, (SEAT_B.max.x - SEAT_B.min.x) * 0.42), Math.max(1, (SEAT_B.max.z - SEAT_B.min.z) * 0.42)]; g.position.copy(p0); }
    const [hw, hl] = g.userData.half, c = Math.cos(u.yaw), s = Math.sin(u.yaw);
    const gh = (C.G && C.G.meshH) || city.groundH; // по высоте нарисованной сетки земли (на склоне и у реки точная высота карты расходится с ней на метры — машина висела или тонула)
    const h = (lx, lz) => gh(u.pos.x + lx * c + lz * s, u.pos.z - lx * s + lz * c);
    const hf = h(0, -hl), hb = h(0, hl), hL = h(-hw, 0), hR = h(hw, 0);
    if (C.S && C.S.unitTilt) C.S.unitTilt(u); // наклон — тот же, по которому считается старт ракеты (sim/strike.js)
    g.userData.seat = { dy: (hf + hb + hL + hR) / 4 - city.groundH(u.pos.x, u.pos.z), rx: u.tx ?? Math.atan2(hf - hb, 2 * hl), rz: u.tz ?? Math.atan2(hR - hL, 2 * hw) };
  }
  const st = g.userData.seat; g.rotation.order = 'YXZ'; g.rotation.set(st.rx, u.yaw, st.rz); g.position.y += st.dy;
}
// ── «Мульти-волна»: модели ракет и дронов, пусковые за городом ──
// ракета с пусковой (tbm у «Искандера», «Точки», «Скада»): копия части модели, центр — в середину, ось — вперёд (−Z)
const EVB = new THREE.Box3(), EVC = new THREE.Vector3();
function evPart(glb, part) {
  const m = anyModel(glb); if (!m) return null;
  const p = m.children.find((c) => c.name === part); if (!p) return null;
  const g = new THREE.Group(), inner = p.clone(); EVB.setFromObject(inner); EVB.getCenter(EVC); inner.position.sub(EVC);
  const tilt = new THREE.Group(); tilt.add(inner); g.add(tilt);
  const R = RAIL[glb]; if (R) tilt.quaternion.setFromUnitVectors(new THREE.Vector3(...R.a), new THREE.Vector3(0, 0, -1)); // ось ракеты на направляющей (RAIL.a; у «Искандера» — вверх, тот же поворот −90° вокруг X) в −Z
  else tilt.rotation.x = -Math.PI / 2; // стоит вертикально — нос в −Z
  return g;
}
// ложная цель баллистической ракеты — отделившаяся головная часть (w_tbmdec), сзади закрыта диском; двигателя у неё нет
function decoyMesh() {
  const m = anyModel('w_tbmdec'); if (!m) return null;
  const b = new THREE.Box3().setFromObject(m), r = (b.max.x - b.min.x) / 2;
  const cap = new THREE.Mesh(new THREE.CircleGeometry(r * 0.97, 16), new THREE.MeshLambertMaterial({ color: 0x3a3c3e })); cap.position.set((b.max.x + b.min.x) / 2, (b.max.y + b.min.y) / 2, b.max.z - 0.01); m.add(cap);
  m.traverse((q) => { if (q.isMesh) q.castShadow = !!P.shadows; }); return m;
}
// сброшенное оружие самолёта: готовая модель или временная фигура (модель ещё грузится — потом подменяется, см. «подменить
// временную»); у ракет с двигателем — факел из среза сопла
function relMesh(w) {
  if (w.ev) return evMesh(w);
  if (w.W.kind === 'rocket') { // НАР — одна ракета (калибр 70–80 мм), а не блок с пилона: своя модель из Blender (w_nar_<ключ>), пока грузится — простая фигура
    const own = anyModel('w_nar_' + w.key); if (!own) wantModel('w_nar_' + w.key);
    const g = own || narMesh(w.key, w.W, wMat); mountWpnFlame(w, g, false); return g;
  }
  const g = weaponMesh(w.key, w.W, weaponGeo, wMat); if (weaponPending(w.key)) { g.userData.stub = true; wantWeapon(w.key); }
  mountWpnFlame(w, g, false);
  return g;
}
function evMesh(w) {
  const M = w.W.model;
  if (w.decoy && w.W.kind === 'tbm') { const d = decoyMesh(); if (d) return d; }
  let g = M && M.part ? evPart(M.glb, M.part) : M ? anyModel(M.glb) : null;
  if (!g) { g = weaponMesh(w.key, w.W, weaponGeo, wMat); if (M || weaponPending(w.key)) { g.userData.stub = true; if (!M) wantWeapon(w.key); } } // модель ещё грузится — временная (онлайн: ракета пущена раньше, чем пришла модель, — «Томагавк» оставался фигурой)
  g.traverse((q) => { if (q.isMesh) q.castShadow = !!P.shadows; });
  if (g.children.some((c) => /^prop/.test(c.name))) g.userData.props = true;
  mountWpnFlame(w, g, true);
  return g;
}
// винты дронов: части prop / prop2 крутятся вокруг своей оси (центр — по габаритам части, один раз)
function spinProps(g, dt) {
  for (const c of g.children) {
    if (!/^prop/.test(c.name)) continue;
    if (!c.userData.pivot) { EVB.setFromObject(c); const ctr = EVB.getCenter(new THREE.Vector3()); g.worldToLocal(ctr); const pv = new THREE.Group(); pv.position.copy(ctr); g.add(pv); c.position.sub(ctr); pv.add(c); pv.userData.prop = true; c.userData.pivot = pv; }
  }
  for (const c of g.children) if (c.userData.prop) c.rotation.z += dt * 70;
}
// пусковые: ставим, когда удар начался; ракеты на пусковой прячутся по мере пусков (evLaunch — рядом с unitMeshes)
C.evPreload = (comp) => { for (const [k, , , via] of comp) { const W = AG[k]; if (W.model) wantModel(W.model.glb); else wantWeapon(k); if (W.dec) wantModel('w_tbmdec'); if (W.launcher) wantModel(W.launcher); if (via) wantModel(via); } };
C.evReady = (ev) => {
  for (const [k] of ev.comp) { const W = AG[k]; if (W.model) wantModel(W.model.glb); else wantWeapon(k); if (W.dec) wantModel('w_tbmdec'); }
  for (const L of ev.launchers) wantModel(L.key);
  for (const a of ev.carriers) { wantModel(a.plane); for (const l of a.load) wantWeapon(l.key); }
};
function syncEv() {
  const ev = C.ev;
  if (!ev) { for (const g of evLaunch.values()) scene.remove(g); evLaunch.clear(); return; }
  for (const L of ev.launchers) {
    let g = evLaunch.get(L.id);
    if (!g) { const m = anyModel(L.key); if (!m) continue; g = m; g.traverse((q) => { if (q.isMesh) q.castShadow = !!P.shadows; }); scene.add(g); evLaunch.set(L.id, g); g.position.copy(L.pos); seat(g, { pos: L.pos, yaw: L.yaw, roof: false }, 0); } // по рельефу, как ЗРК
    const parts = g.children.filter((c) => /^tbm/.test(c.name));
    parts.forEach((c, i) => { c.visible = i >= L.fired && i < (L.n0 ?? parts.length); }); // n0 — сколько ракет заряжено (у последней пусковой при нечётном числе — одна: вторая не стоит весь бой)
    const PO = POD[L.key];
    if (PO) { // пакет HIMARS: поворот вокруг оси у кормы (своя «петля», один раз), подъём — по L.podEl
      if (!g.userData.podPivot) { const pod = g.children.find((c) => /^pod/.test(c.name)); if (pod) { const pv = new THREE.Group(); pv.position.set(...PO.hinge); g.add(pv); pod.position.sub(pv.position); pv.add(pod); g.userData.podPivot = pv; } }
      if (g.userData.podPivot) g.userData.podPivot.rotation.x = (PO.el - PO.rest) * L.podEl;
    }
  }
}
// синхронизация моделей с боем
const LP = new THREE.Vector3();
function syncWorld(dt, t) {
  // дым подбитых самолётов (ИИ и игрок): ветер — лёгкий, постоянный для боя
  if (C.fx && dt > 0) {
    const W = C.windV || (C.windV = new THREE.Vector3(3.9, 0, 1.1)); // ~4 м/с
    // у самолётов с зонами повреждений (sim/damage.js) — дым и огонь из самих зон, отрыв частей (plane-damage.js); без зон — общий шлейф по прочности
    if (C.raid) for (const a of C.raid.planes) {
      if (a.dead || a.out || a.role === 'decoy' || !a.hpMax) continue;
      const dv = (planeMeshes.get(a.id) || { userData: {} }).userData.dv;
      if (dv && a.dz) { dv.sync(a); dv.update(dt, a, W); } else C.fx.damageSmoke(a, dt, a.hp / a.hpMax, W);
    }
    if (C.player && !C.player.dead && !C.player.dz) C.fx.damageSmoke(C.player, dt, C.player.hp / (C.player.hpMax || 100), W);
    updateDebris(scene, dt, city.groundH, W);
  }
  const S = C.S; if (!S) return;
  for (const m of S.sams) {
    const g = samMeshes.get(m.id); if (!g) continue;
    g.position.copy(m.pos); g.lookAt(LP.copy(m.pos).sub(m.dir));
    // под запись старта: факел и вспышка — с момента рёва в записи (m.visIgn), раньше расчётного зажигания; дальше — как в расчёте
    if (m.visIgn !== undefined && !m.visLit && m.t >= m.visIgn) { m.visLit = true; C.fx.ignite(LP.copy(m.pos).addScaledVector(m.dir, -m.M.L / 2), m.dir, m.M.L > 5); }
    const on = (m.tb >= 0 || m.visLit) && (m.tb < m.M.burn || (m.M.sustain && m.tb < m.M.burn + m.M.sustain.t));
    if (m.tb >= m.M.burn && !m.susM) { m.susM = true; g.userData.flame.motor(motorOf(m.unit.key, 'sam', true)); } // маршевый двигатель (С-75 — жидкостный, «Куб» — прямоточный)
    g.userData.flame.set(on ? (m.tb < m.M.burn && (m.M.L > 2.5 || g.userData.booster) ? 2 : 1) : 0, g.userData.booster ? m.M.r * m.ln.stageR : m.M.r, m.pos.y); // на высоте факел шире (plume.js)
  }
  // отделившиеся ускорители: падают, кувыркаются, первые секунды дымят
  for (let i = debris.length - 1; i >= 0; i--) {
    const b = debris[i]; b.t += dt; b.vel.y -= 9.8 * dt; b.vel.multiplyScalar(1 - 0.35 * dt);
    b.g.position.addScaledVector(b.vel, dt); b.g.rotation.x += b.spin.x * dt; b.g.rotation.y += b.spin.y * dt; b.g.rotation.z += b.spin.z * dt;
    if (b.t < 2.5 && Math.random() < dt * 20) C.fx.debrisSmoke(b.g.position);
    if (b.g.position.y < city.topAt(b.g.position.x, b.g.position.z) + 0.5 || b.t > 40) { C.fx.explosion(b.g.position, 3, 'ground'); scene.remove(b.g); debris.splice(i, 1); }
  }
  for (const w of S.wpns) {
    let g = wpnMeshes.get(w.id);
    if (g && g.userData.stub && (w.stubT = (w.stubT || 0) - dt) <= 0) { w.stubT = 1; const g2 = relMesh(w); if (!g2.userData.stub) { scene.remove(g); scene.add(g2); wpnMeshes.set(w.id, g2); g = g2; } } // модель пришла — подменить временную
    if (g) { g.position.copy(w.pos); if (w.vel.lengthSq() > 1e-4) g.lookAt(LP.copy(w.pos).sub(w.vel)); if (g.userData.props) spinProps(g, dt); if (g.userData.flame) flameOf(g, w);
      if (g.userData.wings) glideWings(g, dt, w.vel.lengthSq() > 1e-4); } } // крылья раскрываются через 0,3 с после сброса (УМПК: сперва переворот на 180°, см. models.js)
  syncEv();
  const pxK = VH / 2 / Math.tan(camera.fov * D2R / 2); // пикселей на метр на расстоянии 1 м
  for (const u of S.units) {
    const g = unitMeshes.get(u.id); if (!g) continue;
    // машина на экране меньше ~1,5 пикселя — не рисуем (детальные модели тяжёлые, а вдали их не видно)
    if (g.userData.R === undefined) g.userData.R = Math.max(2, new THREE.Box3().setFromObject(g).getSize(LP).length() * 0.5);
    g.visible = g.userData.R * pxK > 1.5 * camera.position.distanceTo(u.pos);
    if (g.visible && camera.position.distanceTo(u.pos) < 1500) wantUnitNear(u.key); // телефон: подробная модель — когда камера подлетела (models.js), до того — дальняя копия
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
    if (g.userData.radar && (u.emit || u.S.type === 'jammer')) g.userData.radar.rotation.y += (RADAR_W[u.key] || 4) * Math.max(0, dt); // крутится, пока РЛС включена (станция РЭБ работает всегда)
    if (g.userData.lids) torLids(u, g, dt);
    if (g.userData.tdish) torDish(u, g, dt);
    const d = g.userData.dish; if (!d) continue;
    if (u.track && u.emit) { LP.copy(u.track.pos).sub(u.pos); d.rotation.y = Math.atan2(-LP.x, -LP.z) - u.yaw; }
    else if (u.emit) d.rotation.y = t * 2.5 + u.id;
  }
  if (MILLS.length && C.G && C.G.objGroup) for (const id of MILLS) { const g = C.G.objGroup[id]; if (g && !g.userData.ruin) spinSails(g, dt); } // крылья мельницы (пока цела)
  if (C.raid) for (const a of C.raid.planes) {
    if (a.dead || a.out || a.phase === 'wait') continue;
    let g = planeMeshes.get(a.id);
    if (!g) {
      g = new THREE.Group(); g.rotation.order = 'YXZ';
      if (a.role === 'decoy') { g.add(weaponMesh(a.decoyKey, AG[a.decoyKey], weaponGeo, wMat)); g.userData.flames = { update() {} }; }
      else if (a.heli) { // вертолёт налёта: ждём свою модель (пока грузится — не рисуем: иначе встал бы самолёт стороны), подвески — без отрисовки
        const hm = heliModel(a.plane); if (!hm) continue;
        hm.obj.traverse((o) => { if (o.isMesh && !o.userData.glass) o.castShadow = !!P.shadows; }); g.add(hm.obj); g.userData.flames = { update() {} };
      } else {
        // вблизи — готовая модель (подвеска отдельными моделями на пилонах, сброшенное пропадает), вдали — простая
        const pm = planeModel(a.mside || a.side, a.role === 'carrier' ? 'carrier' : classOfRole(a.role), a.plane || raidPlane(a.side, C.raidEra, a.role)), sg = strikerGeo(a.side), lo = new THREE.Mesh(sg.geo, planeMat); lo.castShadow = !!P.shadows; g.add(lo);
        if (pm) {
          pm.obj.traverse((o) => { if (o.isMesh && !o.userData.glass) o.castShadow = !!P.shadows; }); g.add(pm.obj);
          g.userData.dv = planeDamageVis(scene, pm.obj, pm.name, planeMeta(pm.name), () => C.fx); // зоны повреждений: отрыв частей, дым из зон
          // пламя — у каждой модели своё (вдали — у простой): иначе у длинных самолётов (Су-34) факелы висели за простой моделью
          const fh = attachFlames(pm.obj, pm.nozzles, pm.nr / 0.45, false, pm.dry, pm.name), fl = attachFlames(lo, pm.nozzles.length ? sg.nozzles : [], sg.nr / 0.45, false, pm.dry, pm.name); // вдали — так же: нет пламени у B-2 и F-117, слабое — без форсажа
          g.userData.flames = { update(t, ab) { fh.update(t, ab); fl.update(t, ab); } }; g.userData.hung = pm.internal ? [] : hangLoad(g, pm.stations, a.load); // во внутренних отсеках — не видно
          if (a.role === 'carrier') lo.visible = false; else g.userData.lod = { hi: pm.obj, lo }; // носитель велик — модель видна и издали
        } else g.userData.flames = attachFlames(g, sg.nozzles, sg.nr / 0.45);
      }
      scene.add(g); planeMeshes.set(a.id, g);
    }
    g.position.copy(a.pos); g.rotation.set(a.pitch, a.yaw, a.roll);
    g.userData.flames.update(a.thr, a.ab);
    spinRotors(g, dt, a.thr); // винты (Ту-95)
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
// вертолёты: одна запись винта (UH-1) на всех — скорость по типу (тяжёлые Ми ниже), нагрузка — по общему шагу
const HELI_SND = { h_uh1: 1, h_ah1: 1.04, h_ah64: 1.06, h_mi24: 0.88, h_mi28: 0.9, h_ka52: 0.93, h_ka50: 0.93, h_mi8: 0.82, h_uh60: 0.97, h_rah66: 1.08 };
const heliPw = (a) => clamp(((a.col ?? 0.75) - 0.45) / 0.5, 0, 1);
function updateSound(dt) {
  if (!snd.A.ready) return;
  const pl = C.player, on = C.state === 'play' || C.state === 'menu';
  const live = pl && !pl.dead && C.state === 'play' && !C.paused;
  if (live && !pl.heli) {
    fwdOf(pl, LP); const rear = clamp((LP.dot(camera.getWorldDirection(new THREE.Vector3())) + 1) / 2, 0, 1);
    snd.frame(dt, { on: true, rpmTarget: pl.ab ? 1 : 0.6 + 0.4 * clamp((pl.thr - 0.55) / 0.45, 0, 1), ab: pl.ab, speed: pl.speed, mach: pl.speed / 330, sup: pl.speed > 340, n: pl.n || 1, rear, tprop: !!(pl.fm && pl.fm.s.prop), agl: pl.pos.y - city.groundH(pl.pos.x, pl.pos.z), rain: 0 });
  } else snd.frame(dt, { on: false });
  if (live && pl.heli) { fwdOf(pl, LP); snd.heli(dt, { on: true, pw: heliPw(pl), rate: HELI_SND[pl.hm && pl.hm.key] || 1, speed: pl.vel.length(), rear: clamp((LP.dot(camera.getWorldDirection(new THREE.Vector3())) + 1) / 2, 0, 1) }); } else snd.heli(dt, null);
  snd.gunTick(); snd.mapAmb(dt, live, city.kind);
  sndCands.length = 0;
  const cand = (o, kind, pos, vel, fwd, ab, gain) => { let c = sndPool[sndCands.length]; if (!c) sndPool.push(c = {}); Object.assign(c, { o, kind, pos, vel, fwd, ab, gain, pw: undefined, rate: undefined, air: undefined }); sndCands.push(c); return c; };
  const lv = pl && C.state === 'play' ? pl.vel : null, cp = camera.position;
  if (C.raid) for (const a of C.raid.planes) if (!a.dead && !a.out && a.phase !== 'wait') {
    a.sfwd = fwdOf(a, a.sfwd || new THREE.Vector3());
    if (a.heli) { const c = cand(a, 'heli', a.pos, a.vel, a.sfwd, false, 1.2); c.pw = heliPw(a); c.rate = HELI_SND[a.plane] || 1; continue; }
    // близкий пролёт: за 2,6 с до точки наибольшего сближения (промах < 300 м) — запись пролёта целиком, свой голос тише
    const rx = a.pos.x - cp.x, ry = a.pos.y - cp.y, rz = a.pos.z - cp.z, vx = a.vel.x - (lv ? lv.x : 0), vy = a.vel.y - (lv ? lv.y : 0), vz = a.vel.z - (lv ? lv.z : 0), vv = vx * vx + vy * vy + vz * vz;
    const tca = vv > 1 ? -(rx * vx + ry * vy + rz * vz) / vv : -1, now = performance.now() / 1000;
    if (tca > 0 && tca <= 2.6 && (a.stca ?? 9) > 2.6 && vv > 120 * 120 && !(now < (a.passT || 0) + 8)) {
      const miss = Math.hypot(rx + vx * tca, ry + vy * tca, rz + vz * tca);
      if (miss < 300 && snd.jetPass(miss, a.role === 'carrier')) a.passT = now;
    }
    a.stca = tca;
    cand(a, a.fm && a.fm.s.prop ? 'tprop' : 'jet', a.pos, a.vel, a.sfwd, a.ab, 1.1 * (now < (a.passT || 0) + 6 ? 0.35 : 1));
  }
  if (C.S) {
    for (const m of C.S.sams) if (!m.dead && m.tb >= 0 && m.tb < m.M.burn + (m.M.sustain ? m.M.sustain.t : 0)) { m.svel = (m.svel || new THREE.Vector3()).copy(m.dir).multiplyScalar(m.speed); cand(m, 'msl', m.pos, m.svel, null, false, 1); }
    for (const w of C.S.wpns) if (!w.dead && w.W.burn && w.t < w.W.burn) cand(w, 'msl', w.pos, w.vel, null, false, 0.8);
    // «Мульти-волна»: крылатые — маленький турбовентилятор, дроны — поршневой мотор, баллистика — рёв на разгоне и свист на спуске
    for (const w of C.S.wpns) {
      if (w.dead || !w.ev) continue;
      if (w.W.kind === 'tbm') { const c = cand(w, 'tbm', w.pos, w.vel, null, false, w.phase === 'boost' ? 1.5 : 0.9); c.pw = w.phase === 'boost' ? 1 : 0; c.air = w.phase === 'term' ? 1 : 0; } // разгон — двигатель, в небе — гул вдали, спуск — воздух (без «двигателя»)
      else if (w.W.uav) cand(w, 'prop', w.pos, w.vel, w.dir, false, 0.9);
      else cand(w, 'jet', w.pos, w.vel, w.dir, false, 0.55);
    }
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
C.say = (t, s = 2.4) => { const m = $('msg'); m.innerHTML = iconize(t); m.style.display = t ? 'block' : 'none'; msgT = s; };
C.hint = (h) => { const e = $('hint'); if (e._h === h) return; e._h = h; e.innerHTML = iconize(h || ''); e.style.display = h ? 'block' : 'none'; };
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
  // самолёт ↔ вертолёт: у них разные карты (город / «Туманная топь») — карта строится при загрузке: перезагрузка сразу в вылет
  // «Ещё раз» после потери контекста WebGL (текстуры моделей не вернуть): новый бой — с перезагрузкой, адрес страницы тот же (карта, вертолёт — как были)
  if (C.reloadAfterBattle && (game === 'air' || game === 'defense' || game === 'training')) { ls.set('fortuna_airdef_setup', JSON.stringify(C.setup)); const u = new URL(location.href); u.searchParams.set('go', game); u.searchParams.set('weather', W_KEY); if (game === 'air' && MAP === 'autumn') u.searchParams.set('hlo', C.setup.lo); /* hlo и weather при загрузке из адреса убраны — вернуть: вертолёт «Топи» и её погода */ location.replace(u.href); return; }
  if ((game === 'air' || game === 'defense' || game === 'training') && !Q.get('map') && wantMap(game, C.setup.pmap, C.setup.era, C.setup.lo, C.setup.evd, C.setup.tside) !== MAP) {
    ls.set('fortuna_airdef_setup', JSON.stringify(C.setup)); const u = new URL(location.href); u.searchParams.set('go', game); u.searchParams.delete('heli'); u.searchParams.delete('hlo'); u.searchParams.delete('weather'); location.replace(u.href); return;
  }
  snd.unlock();
  if (C.ctrl && C.ctrl.stop) C.ctrl.stop();
  C.hooks = {}; C.paused = false; C.hint(''); C.say('');
  $('menu').classList.remove('on'); $('end').classList.remove('on'); $('pauseScr').classList.remove('on');
  document.body.classList.remove('menuing'); document.body.classList.add('playing');
  C.state = 'play'; C.camera.clearViewOffset(); C.shell.play(true);
  C.ctrl = ctrls[game]; C.ctrl.start(); prewarm(); // шейдеры сцены — сейчас, а не при первом взрыве или первом появлении техники
  if (C.progress) C.progress.runStart(game === 'multi' ? 'multi' : game, C.setup.diff === 'real' ? 'real' : 'arcade', C.setup.era); // опыт за бой (обучение, съёмка — без)
  resize();
};
C.toMenu = function () {
  if (C.reloadAfterBattle) { location.reload(); return; } // контекст WebGL терялся в онлайн-бою — текстуры моделей вернёт только перезагрузка
  C.op = null; // «Операция» прервана
  if (C.ctrl && C.ctrl.stop) C.ctrl.stop();
  C.hooks = {}; C.paused = false; C.hint(''); C.say(''); $('ask').style.display = 'none'; $('warn').style.display = 'none';
  for (const id of ['end', 'pauseScr', 'lesson']) $(id).classList.remove('on');
  for (const c of ['playing', 'flying', 'defense', 'dmap', 'oper']) document.body.classList.remove(c);
  document.body.classList.add('menuing');
  hx.setTransform(1, 0, 0, 1, 0, 0); hx.clearRect(0, 0, hc.width, hc.height);
  C.state = 'menu'; C.shell.play(false); C.ctrl = ctrls.menuBg.has() ? ctrls.menuBg : ctrls.director; C.ctrl.start(); C.menu.show(); // фон: кадры, если есть, иначе живой бой
  resize();
};
C.togglePause = function () {
  if (C.state !== 'play' || C.ended) return;
  if (document.body.classList.contains('lsnOpen') && C.ctrl && C.ctrl.lsnClose) { C.ctrl.lsnClose(); return; } // открыта панель «Урок» (она и есть пауза) — Esc / пауза её закрывают
  if ($('lesson').classList.contains('on')) { C.closeLesson(); return; }
  C.paused = !C.paused;
  $('pauseScr').classList.toggle('on', C.paused);
  $('pauseHelp').innerHTML = iconize(C.ctrl.pauseHelp ? C.ctrl.pauseHelp() : '');
  if (C.paused) snd.silence();
};
// итоги: title, reason, stats [[число, подпись]], note, win (true/false/null)
C.showEnd = function ({ title, reason, stats, note, win, again }) {
  C.ended = true; $('againBtn').textContent = again || tr('Ещё раз'); // «Операция»: «Вылет 2: удар →»
  $('endTitle').textContent = title; $('endTitle').className = win === true ? 'win' : win === false ? 'lose' : '';
  $('endReason').textContent = reason || '';
  $('endStats').innerHTML = (stats || []).map(([v, l]) => `<div class="stt"><b>${v}</b><span>${l}</span></div>`).join('');
  $('endNote').innerHTML = note || '';
  setTimeout(() => { $('end').classList.add('on'); document.body.classList.remove('flying'); }, 900);
};
// объяснение на паузе (обучение и «?»)
C.openLesson = function (title, body, sub) {
  C.paused = true; snd.silence();
  $('lessonTitle').innerHTML = title; $('lessonBody').innerHTML = iconize(body); $('lessonSub').textContent = sub || tr('Объяснение · игра на паузе');
  $('lesson').classList.add('on');
};
C.closeLesson = function () { $('lesson').classList.remove('on'); C.paused = document.body.classList.contains('lsnOpen'); /* панель «Урок» открыта — пауза остаётся */ if (C.onLessonClose) { const f = C.onLessonClose; C.onLessonClose = null; f(); } };
$('lessonClose').onclick = () => C.closeLesson();
$('resumeBtn').onclick = () => C.togglePause();
$('pauseExit').onclick = () => C.toMenu();
$('pauseEnd').onclick = () => { C.togglePause(); if (C.ctrl.finish) C.ctrl.finish(tr('Бой завершён досрочно')); };
$('pause').onclick = () => C.togglePause();
$('againBtn').onclick = () => orientGate(() => { C.ended = false; C.start(C.lastGame || 'air'); }, IS_TOUCH);
$('closeBtn').onclick = () => { C.ended = false; C.toMenu(); };
$('exit').onclick = () => C.toMenu();
// кнопки-иконки (games/airdef/icons.js): прежняя надпись — во всплывающей подсказке и для экранного диктора
const ICO = { tFlare: ['flares', tr('Ловушки')], tMap: ['map', tr('Карта')], tLock: ['target', tr('Цель')], tAuto: ['auto', tr('АВТО — помощник')], tLook: ['camera', tr('Обзор — свободная камера')], tCam: ['camera', tr('Камера: следующий союзник')],
  tHelp: ['help', tr('Нужна помощь')], tPop: ['popUp', tr('Подскок')], opMap: ['map', tr('Карта')], opAuto: ['auto', tr('АВТО — расчёт сам')], opCam: ['camera', tr('Камера')], opBino: ['bino', tr('Бинокль')], opRadar: ['radar', tr('РЛС: включить / выключить')],
  pause: ['pause', tr('Пауза')], plBtn: ['players', tr('Игроки')], lsnBtn: ['lesson', tr('Урок: задание и подсказки')], askBtn: ['lesson', tr('Объяснение')], wMap: ['map', tr('Карта')] };
for (const [id, [n, t]] of Object.entries(ICO)) { const e = $(id); if (!e) continue; e.innerHTML = ico(n); e.title = t; if (e.setAttribute) e.setAttribute('aria-label', t); e.classList.add('icb'); }
{ const pd = $('tPad'); if (pd && pd.querySelector) { const l = pd.querySelector('.pl'), r = pd.querySelector('.pr'); if (l) l.innerHTML = ico('rollL'); if (r) r.innerHTML = ico('rollR'); } } // крен — стрелки вращения
const muteIco = C.muteIco = () => { $('mute').innerHTML = ico(snd.muted ? 'soundOff' : 'soundOn'); $('mute').title = snd.muted ? tr('Звук выключен') : tr('Звук'); };
$('mute').onclick = () => { snd.unlock(); snd.setMuted(!snd.muted); muteIco();
for (const id of ['tAuto', 'opAuto']) $(id).classList.toggle('on', C.auto); };
muteIco();
for (const id of ['tAuto', 'opAuto']) $(id).classList.toggle('on', C.auto);
addEventListener('keydown', (e) => {
  if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return; // ввод текста (код комнаты, чат команды) — не управление
  if (C.state === 'play' && (e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) { if (e.code === 'Escape' && !C.paused && C.ctrl && C.ctrl.onEsc && C.ctrl.onEsc()) return; C.togglePause(); return; } // Esc в расстановке — отмена размещения
  if (C.ctrl && C.ctrl.onKey && !C.paused) C.ctrl.onKey(e, true);
});
addEventListener('keyup', (e) => { if (C.ctrl && C.ctrl.onKey) C.ctrl.onKey(e, false); });
addEventListener('pointerdown', () => snd.unlock(), { once: true });
document.addEventListener('visibilitychange', () => { if (document.hidden && C.state === 'play' && !C.paused) C.togglePause(); });
// телефон вертикально — экран «Поверните телефон» поверх всего, бой — на паузу (повернул — снимает паузу кнопкой «Продолжить»)
function orient() {
  const p = IS_TOUCH && innerHeight > innerWidth * 1.05; document.body.classList.toggle('portrait', p);
  if (p && C.state === 'play' && !C.paused && !C.ended) C.togglePause();
}
addEventListener('resize', orient); addEventListener('orientationchange', () => setTimeout(orient, 120)); orient();

// ═════════════ Кадр ═════════════
let last = performance.now(), lastDraw = 0, last3D = 0, ms3D = 0, lastRaf = 0, rafEma = 16.7, fpsAcc = 0, fpsN = 0, fps = 0, shN = 0, capAcc = 0;
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
  // телефон: 60 к/с — только в полёте за самолёт; оборона, мульти-волна, карта, оператор и наблюдение — 30 к/с (камера там
  // медленная, а нагрев и расход батареи вдвое меньше). Свой предел из «Кастомного» — главнее
  const cc = C.ctrl, fly = !!(cc && (cc.craft || cc.fps60 || (cc.inner && cc.inner.craft))); // «Съёмка» — тоже 60
  const idle = !!(cc && cc.idle && cc.idle()); // фон меню — готовые кадры: 3D не рисуется
  // Mark 2026-10-21: на телефоне вне полёта ограничение 30 к/с — только для 3D (нагрев и батарея — от видеочипа), а бой, экран боя и
  // кнопки (перезарядка, таймеры) — каждый кадр, без рывков
  // предел — накопителем времени (Mark 2026-10-23: телефоны с экраном 90 Гц грелись, игра шла 75–90 к/с): кадр рисуется, когда набралось
  // 1000/предел мс, остаток переносится — на 90 Гц предел 60 даёт ровно 60 (два кадра из трёх), а не 45, как порог «не раньше 14,7 мс»;
  // на телефоне 60 к/с по умолчанию при любой частоте экрана; 3D вне полёта — 30 к/с независимо от предела интерфейса (ревью 2026-10-21)
  const rd = now - lastRaf; lastRaf = now; if (rd > 0 && rd < 100) rafEma += (rd - rafEma) * 0.05;
  const uc = gfxKey === 'custom' ? P.cap : fpsCap === 'auto' ? undefined : fpsCap; // предел игрока (0 — нет)
  const menu = idle || C.state === 'menu' || C.paused; // меню и пауза — 30 к/с всему (и 3D, и интерфейсу)
  const capUI = idle ? 1000 / 8 : menu ? 1000 / 30 : uc ? 1000 / uc : 0;
  const capMs = capUI || (IS_TOUCH && uc !== 0 ? 1000 / 60 : 0);
  const cap3D = !menu && IS_TOUCH && !fly ? 1000 / 30 : 0; // предел игрока (45, 60) — не отменяет 30 для 3D вне полёта
  if (capMs) { capAcc = Math.min(capAcc + Math.max(0, rd), capMs * 2); if (capAcc < capMs - 1.5) return; capAcc = Math.max(0, capAcc - capMs); } else capAcc = 0;
  const ms = now - lastDraw; lastDraw = now;
  const draw3D = !cap3D || now - last3D >= cap3D - 2; if (draw3D) { ms3D = now - last3D; last3D = now; }
  const t0 = performance.now(); if (renderer.info) renderer.info.reset(); // счётчик производительности: время ЦП и вызовы за кадр
  const dt = clamp((now - last) / 1000, 0, 0.05), t = now / 1000; last = now; // время кадра не бывает отрицательным
  C.t = t;
  const ctrl = C.ctrl;
  if (idle) { hx.setTransform(C.hudK, 0, 0, C.hudK, 0, 0); hx.clearRect(0, 0, VW, VH); updateSound(dt); $('perf').textContent = ''; return; } // меню на кадрах: ни боя, ни 3D
  const online = !!(C.net && C.net.battle); // онлайн: мир не встаёт на паузу (пауза — только меню), бой считает сервер
  // «Съёмка»: замедление и стоп-кадр (ctrl.dtK) — бой идёт медленнее, камера — как обычно
  const dts = dt * (ctrl && ctrl.dtK && !online ? ctrl.dtK() : 1);
  if ((!C.paused || online) && ctrl && dts > 0) {
    // ускорение времени (смотреть удар «Мульти-волны»): несколько шагов боя за кадр
    const nK = !online && ctrl.timeK ? ctrl.timeK() : 1;
    for (let k = 0; k < nK; k++) {
      if (ctrl.update) ctrl.update(dts, t);
      if (online) C.net.update(dt);
      else if (C.S && ctrl.sim !== false) { if (C.raid) C.raid.step(dts); C.S.step(dts); }
      if (C.fx) C.fx.update(dts);
    }
  }
  if (view) { camera.position.set(view[0], view[1], view[2]); camera.rotation.set((view[4] || 0) * D2R, (view[3] || 0) * D2R, 0); }
  else if (ctrl && ctrl.camera) ctrl.camera(dt, t);
  // ближняя плоскость отсечения растёт с высотой камеры: с 10 км точности глубины иначе не хватает (крыши «мерцают»)
  { let nearW = clamp((camera.position.y - city.groundH(camera.position.x, camera.position.z)) * 0.006, 3, 20);
    if (ctrl && ctrl.near && ctrl.near()) nearW = Math.min(nearW, ctrl.near()); // крупный план у самолёта — ближе
    if (Math.abs(camera.near - nearW) > camera.near * 0.15) { camera.near = nearW; camera.updateProjectionMatrix(); } }
  syncWorld(C.paused ? 0 : dts, t);
  if (draw3D) objLod(camera.position, P.lodObj);
  if (draw3D) updateCityScene(C.G, camera, P, ctrl && ctrl.focus ? ctrl.focus() : camera.position, t); // окно ТВ — свой набор моделей вблизи (C.podPass)
  // тактическая карта обороны закрывает весь экран — 3D-кадр не рисуем (телефон не греется)
  // «Тени через кадр»: карта теней перерисовывается раз в P.shEvery кадров (город стоит, тени техники чуть запаздывают). На телефоне у пресетов
  // с тенями — по умолчанию (P.shAuto, 2026-10-23, нагрев), но камера ниже 150 м над землёй — каждый кадр: тень своего самолёта или вертолёта
  // рядом, её запаздывание (4 м на 250 м/с) было бы видно. У «Кастомного» — как выбрано (shRate), всегда
  if (draw3D && renderer.shadowMap.enabled) {
    const k = P.shEvery > 1 && (!P.shAuto || camera.position.y - city.groundH(camera.position.x, camera.position.z) > 150) ? P.shEvery : 1;
    renderer.shadowMap.autoUpdate = k < 2; if (k > 1 && ++shN >= k) { shN = 0; renderer.shadowMap.needsUpdate = true; }
  }
  if (C.fx && C.fx.setView) C.fx.setView(camera.position.y); // порядок дыма и облаков — по высоте камеры (units-render)
  if (draw3D && !(ctrl && ctrl.skip3D && ctrl.skip3D())) { if (pipe) pipe.render(scene, camera, t); else renderer.render(scene, camera); }
  if (C.perfHud && renderer.info) { pf.cpu += performance.now() - t0; pf.n++; pf.calls = renderer.info.render.calls; pf.tris = renderer.info.render.triangles; }
  if (ctrl && ctrl.afterRender) ctrl.afterRender();
  hx.setTransform(C.hudK, 0, 0, C.hudK, 0, 0); hx.clearRect(0, 0, VW, VH);
  if (ctrl && ctrl.hud) ctrl.hud(dt, t);
  if (C.extraHud) C.extraHud(dt, t); // онлайн: журнал сбитий, метки «нужна помощь»
  updateSound(dt);
  if (msgT > 0 && (msgT -= dt) <= 0) C.say('');
  fpsAcc += ms; fpsN++; if (fpsAcc > 500) { fps = Math.round(1000 * fpsN / fpsAcc); fpsAcc = fpsN = 0; }
  if (draw3D && C.state === 'play' && !view && ms3D < 250 && !(ctrl && ctrl.skip3D && ctrl.skip3D())) dynRes(cap3D ? ms3D / 2 : ms3D); // 3D через кадр — время кадра на пару кадров интерфейса // на карте 3D не рисуется — мерить нечего
  const sc = Math.round((pipe ? pipe.scale : dr.scale) * 100);
  // онлайн: задержка до сервера и потери (net.js) — мелко, в той же строке внизу
  const NN = C.online && C.online.N, netTxt = NN && NN.conn === 'on' && NN.battle && NN.ping ? tr(' · {0} мс · PL {1}%', [Math.round(NN.ping), NN.pl]) : '';
  if (C.perfHud && renderer.info) { // подробно: кадр, ЦП (подготовка кадра в JS), ГП ≈ остаток кадра, вызовы, треугольники, память
    if (pf.n >= 20) { pf.cpuS = pf.cpu / pf.n; pf.cpu = pf.n = 0; }
    const frameMs = fps ? 1000 / fps : 0, mem = performance.memory ? tr(' · JS {0} МБ', [Math.round(performance.memory.usedJSHeapSize / 1048576)]) : '', gm = renderer.info.memory;
    $('perf').textContent = tr('{0} · {1} к/с · кадр {2} мс · ЦП {3} мс · ГП и ожидание ≈{4} мс · {5} выз. · {6} млн тр. · {7}% · геом. {8}, текст. {9}{10}{11}', [P.name, fps, frameMs.toFixed(1), pf.cpuS.toFixed(1), Math.max(0, frameMs - pf.cpuS).toFixed(1), pf.calls, (pf.tris / 1e6).toFixed(2), sc, gm.geometries, gm.textures, mem, netTxt]);
  } else $('perf').textContent = C.state === 'play' ? tr('{0} · {1} к/с · {2}%{3}', [P.name, fps, sc, netTxt]) : '';
}

// компиляция шейдеров всего, что есть в сцене (и скрытого — листы эффектов, дым): без неё первое появление эффекта = рывок кадра
function prewarm() { try { if (renderer.compile) renderer.compile(scene, camera); } catch (_) { /* в проверках без WebGL — нет */ } }
// ═════════════ Запуск ═════════════
// готовые модели — в фоне; загрузилась — самолёты пересобираются уже с ней (постройки — ставятся, когда город собран)
const pendingObj = [];
registerSW(); // файлы игры — из кэша устройства (только на сайте; offline.js)
loadModels(new URL('./', import.meta.url).href, (name) => {
  if (C.G && C.G.attachBld && bldModel(name)) C.G.attachBld(name, bldModel(name)); // дома города вблизи (и цеха — та же модель, что у целей)
  if (isObjModel(name)) { if (C.G) C.G.attachObjModel(name, () => objModel(name)); else pendingObj.push(name); return; } // постройки целей
  if (bldModel(name)) return;
  if (isUnitModel(name)) { for (const g of unitMeshes.values()) scene.remove(g); unitMeshes.clear(); C.syncUnits(); return; } // комплексы — пересобрать
  for (const g of planeMeshes.values()) scene.remove(g); planeMeshes.clear();
  if (C.ctrl && C.ctrl.modelsReady) C.ctrl.modelsReady();
});
// запуск по этапам: между ними экран успевает показать, что сейчас строится (полоса и подпись)
const ldStep = (txt, k) => new Promise((r) => { const t = $('ldTxt'), b = $('ldBar'); if (t) t.textContent = txt; if (b) b.style.width = Math.round(k * 100) + '%'; setTimeout(r, 30); });
// догрузка после старта: модели техники и домов, текстуры — статус внизу, пока не придёт всё
let alShown = false;
setInterval(() => {
  const m = modelStats(), t = texStats, need = m.req + t.req, got = m.done + t.done, e = $('assetLoad'); if (!e || !need) return;
  const left = need - got;
  if (left > 0 && C.state !== 'loading') {
    alShown = true; e.classList.add('on');
    $('alTxt').textContent = tr('Загружаем город: модели {0} из {1}{2}', [m.done, m.req, t.req ? tr(', текстуры {0} из {1}', [t.done, t.req]) : '']);
    $('alBar').style.width = Math.round(100 * got / need) + '%';
  } else if (alShown && left <= 0) { alShown = false; $('alTxt').textContent = tr('Город загружен'); $('alBar').style.width = '100%'; setTimeout(() => { if (!alShown) e.classList.remove('on'); }, 1500); }
}, 400);
(async () => {
  await ldStep(tr('Строим улицы, дома и реку…'), 0.15);
  const t0 = performance.now();
  C.G = buildCityScene(scene, city, P, renderer, W_KEY);
  if (city.kind === 'autumn') for (const n of ['obj_church', 'obj_mill', 'obj_barn']) wantModel(n); // постройки «Туманной топи» — грузятся только здесь (lazy)
  await ldStep(tr('Деревья, вода, облака и эффекты…'), 0.55);
  for (const n of pendingObj.splice(0)) C.G.attachObjModel(n, () => objModel(n));
  if (C.G.bldNames) { for (const n of C.G.bldNames) if (bldModel(n)) C.G.attachBld(n, bldModel(n)); wantBuildings(C.G.bldNames); } // дома вблизи — только если пресет их рисует
  C.fx = createFx(scene, P); C.fx.groundH = (x, z) => city.groundH(x, z); // пыль от упавших комьев — по рельефу
  // заранее (2026-10-23, рывки при первом появлении): листы взрывов, огня и вспышек — на видеокарту, как только пришли; новые материалы — компилировать сразу
  C.fx.onTex = (t) => { try { if (renderer.initTexture) renderer.initTexture(t); } catch (_) { /* нет — загрузится при первом показе */ } };
  C.fx.onNewMats = () => prewarm();
  if (pipe && pipe.fx) { C.fx.setLayers(FX_LAYER, FX_ADD_LAYER); if (C.G.clouds) C.G.clouds.layers.set(FX_LAYER); } // облака и дым — в половине разрешения
  await ldStep(tr('Режимы игры: вылет, оборона, обучение…'), 0.7);
  ctrls.air = createAir(C); ctrls.defense = createDefense(C);
  ctrls.multi = Object.assign(Object.create(ctrls.defense), { start: () => ctrls.defense.start({ multi: setup.mrole === 'atk' ? 'atk' : 'def', lastGame: 'multi' }) }); // «Мульти-волна» — та же карта обороны
  $('wNext').onclick = () => C.watchNext(); $('wMap').onclick = () => C.watchMap(); $('wSpeed').onclick = () => C.watchSpeed();
  ctrls.director = createDirector(C); ctrls.menuBg = createMenuBg(C); ctrls.training = createTraining(C, ctrls); ctrls.photo = createPhoto(C, ctrls);
  C.diff = createDifficulty(ls); // сложность: режим + скрытая подстройка под игрока (difficulty.js)
  C.progress = createProgress(C); C.research = createResearch(C, C.progress); // прокачка: состояние с сайта, экран «Исследования»
  createHints(C, ctrls); // подсказки клавиш в бою (ПК): «Настройки» или F1
  C.event = createEvent(C); // событие «Туманная топь»: экран вертолётов (кнопка в меню — #evtBtn)
  C.online = createOnline(C, ctrls); // до меню: оно спрашивает у онлайна текст кнопки и раздел
  C.menu = createMenu(C, { PRESETS, WEATHER_KEYS });
  C.progress.on(() => { if (C.state === 'menu') C.menu.render(); }); C.progress.refresh(); // замки «Реализма» — по купленному
  resize();
  C.buildMs = Math.round(performance.now() - t0);
  await ldStep(tr('Готовим графику (шейдеры)…'), 0.85);
  try { renderer.compile(scene, camera); } catch (_) { /* не критично */ }
  await ldStep(tr('Готово'), 1);
  $('loading').remove();
  C.toMenu();
  requestAnimationFrame(frame);
  // go / hlo / weather — одноразовые (старт события, перезагрузка под карту): убрать из адреса, иначе следующая перезагрузка из меню
  // (смена режима, карты) снова запустит вылет на вертолёте или не тот режим
  { const u = new URL(location.href); let ch = false; for (const k of ['go', 'hlo', 'weather']) if (u.searchParams.has(k)) { u.searchParams.delete(k); ch = true; } if (ch) try { history.replaceState(history.state, '', u.href); } catch (_) { /* нет */ } }
  const go = Q.get('go'); if (go && ctrls[go]) { setup.game = go === 'training' ? 'training' : go; if (go === 'air' && HLO >= 0) setup.lo = HLO; /* меню при показе подменило вертолётную подвеску самолётной */ C.lastGame = go; C.start(go); }
})();
if (Q.get('test') === '1') { window.__a = C; window.__frame = frame; C.ctrls = ctrls; C.resize = resize; C.lessons = LESSONS; } // проверка: доступ к игре и шаг кадра вручную (страница в фоне)
