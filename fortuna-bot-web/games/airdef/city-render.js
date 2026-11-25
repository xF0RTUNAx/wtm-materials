// Отрисовка мегаполиса (three.js r128). Геометрию города даёт city.js - тот же город, что видит симуляция.
//  • Атмосфера и погода - из «Летки» (world.js): физическое небо, воздушная перспектива (дымка гуще внизу и
//    подсвечена со стороны солнца), палитры погоды. Все материалы - Phong: ему three.js передаёт позицию камеры,
//    без неё не работают ни дымка, ни отражения.
//  • Здания - инстансы коробок по плиткам 2×2 км (плитки отсекаются по виду и дальности). Фасад целиком в шейдере:
//    окна сеткой по размеру фасада (с простенками у углов), у каждого окна свой оттенок (шторы, жалюзи), ночью часть
//    окон горит; панельные швы и балконы, ленточные окна офисов, витражи стеклянных башен с отражением неба и бликом
//    солнца, витрины первого этажа; затенение у земли и в углах (как от рассеянного света), парапеты крыш.
//    Высокие башни - ступенями; на крышах - надстройки; у частных домов - скатные крыши.
//  • Земля: районы из текстуры, улицы, тротуары, разметка и «зебры» - в шейдере; дворы с газонами; затенение земли
//    у домов (запечённое из сетки высот застройки); шум, чтобы не было плоской заливки.
//  • Река с волнами и отражением неба, деревья в парках и вдоль улиц, облака-«пуховки» (один вызов отрисовки).
/* global THREE */
import { CITY, ZONE, KIND, AIRPORT, groundH, zoneAt, riverX, mulberry32, lineW, RN, RS, RURAL_HW, SITES, RELIEF, slopeAt, siteKeep } from './city.js?v=20261124a';
import { part, mergeParts, M } from '../drone/models.js?v=20261124a';
import { WEATHERS, ATMO, skyMaterial, skyUniforms, skyPano, SKY, FXU, FX_LAYER, FX_ADD_LAYER } from '../drone/world.js?v=20261124a';
import { bakeTerrain, ROUGH_GLSL, groundLit } from './terrain-bake.js?v=20261124a';
import { BU, BLAST_GLSL, tickBlast } from './blast.js?v=20261124a';
import { setAir, tickAir, airUniforms, CLD_ON } from './atmo.js?v=20261124a';
import { setPaintSky } from './paint.js?v=20261124a';
import { ktxOn, ktxLoad, ktxMeta } from './ktx.js?v=20261124a';
import { winterWeathers, winterZoneTex, winterNormalTex, winterTextures, winterGroundMaterial, winterTrees, makeSnowfall, winterRoads } from './winter-render.js?v=20261124a';
import { autumnWeathers, autumnZoneTex, autumnTextures, autumnGroundMaterial, autumnTrees, autumnRoads, autumnWaterMask, autumnProps } from './autumn-render.js?v=20261124a';
Object.assign(WEATHERS, winterWeathers(WEATHERS), autumnWeathers(WEATHERS)); // зимние и осенние погоды - только в «Воздушном превосходстве»
// свет погод по стенду Mark (?lab=1, 2026-11-16, tools/airdef-light/lab-values.json): множители силы солнца (sunI) и неба (hemiI), плотности дымки (fogD),
// цвета. Только здесь - общие погоды «Летки» (drone/world.js) не меняются: правки - копией объекта
// «Ясный день» города - объёмный (Mark 2026-11-25: «картинка выгоревшая и плоская» → «понравился вариант с сильными тенями»): небо слабее на 40 % (было 2,7273), экспозиция ×0,8,
// контраст и насыщенность - GRADE.day в main.js; ?lt=0 - прежний свет
{ const LT0 = typeof location !== 'undefined' && /[?&]lt=0/.test(location.search);
  const LAB = { day: { sunI: 1.735, hemiI: LT0 ? 2.7273 : 1.6364, expK: LT0 ? 1 : 0.8, sun: 0xeff3e8, sky: 0xd8e8fc }, overcast: { sunI: 0.4, hemiI: LT0 ? 0.4727 : 2.3, fogD: 1.85 }, ...(LT0 ? {} : { morning: { hemiI: 1.15 }, evening: { hemiI: 2.2, sky: 0xb2b8c4 }, sunset: { hemiI: 3.6, sky: 0xa8a6aa }, a_eve: { hemiI: 2.2 }, a_dusk: { hemiI: 1.9 } }), /* у низкого солнца небо светит заметнее: тени были чёрные */ w_frost: { fogD: 1.4, ...(LT0 ? {} : { expK: 0.8, hemiI: 1.2 }) }, ...(LT0 ? {} : { w_clear: { expK: 0.7, hemiI: 1.25, sky: 0xa8bcd8 } }), /* снег на солнце - не сплошь белый */
    w_snow: { sunI: 0, hemiI: 1.1273 }, a_fog: { sunI: 0.4143, hemiI: LT0 ? 0.9636 : 2.4 } };
  for (const [k, o] of Object.entries(LAB)) { const W = WEATHERS[k]; if (!W) continue; const n = { ...W, lab0: { sunI: W.sunI ?? 1, hemiI: W.hemiI ?? 1 } }; // lab0 - свет до правок (опора тумана низин осени)
    for (const f of ['sunI', 'hemiI', 'fogD']) if (o[f] !== undefined) n[f] = (W[f] ?? 1) * o[f];
    for (const f of ['sun', 'sky', 'gnd', 'fog']) if (o[f] !== undefined) n[f] = o[f];
    if (o.expK !== undefined) n.exposure = (W.exposure ?? 1) * o.expK;
    WEATHERS[k] = n; } }
// высота земли и районы - у текущей карты (город - city.js, зима - map-winter.js); выставляет buildCityScene
let GH = groundH, ZA = zoneAt, LAWNS = []; // LAWNS - объекты с травой на своём участке (o.lawn: склад боеприпасов)
import { MeshoptSimplifier } from './vendor/meshopt_simplifier.module.js?v=20261124a'; // MIT, meshoptimizer 0.21
import { bakeGroup, mergeLocal } from './merge.js?v=20261124a';
import { NOISE_ON, NOISE_GLSL, noiseTex } from './noise-tex.js?v=20261124a';
import { FAR_U, groundShadowChunk } from './ground-far.js?v=20261124a';
import { FAC_ON, FAC_MAX, FACU, FAC_GLSL, FAC_MAIN, facadeRow, surfColors } from './facade.js?v=20261124a';
import { NS_ON, NS_K, nearShadow, treeShadowGeo, tuftShadowGeo, shadowOnly } from './near-shadow.js?v=20261124a';
import { BAKE_ON, createGroundBake } from './ground-bake.js?v=20261124a';
import { GTILES as GT_OWN } from './ground-tiles.js?v=20261124a';
import { GTILES_S } from './ground-tiles-scan.js?v=20261124a';
// проба «земля по сканам» (Mark 2026-11-25: сравнение Watch Dogs 2 и GTA 6): ?scan=1 - плитки сканов CC0 (tools/airdef-tex/scan-atlas.py), нормали в свете (а не
// множителем цвета), тень мелочи от солнца, тон асфальта и травы - как у настоящих. Только город
export const SCAN = typeof location !== 'undefined' && /[?&]scan=1/.test(location.search);
const GTILES = SCAN ? { ...GT_OWN, ...GTILES_S } : GT_OWN;
const GK = typeof location === 'undefined' ? 0.9 : +(/[?&]gk=([0-9.]+)/.exec(location.search) || [0, 0.9])[1]; // яркость земли города до дорог (?gk=1 - как раньше)
const SKV = typeof location === 'undefined' || !/[?&]skv=0/.test(location.search); // небо у домов закрыто (?skv=0 - как раньше)
const AN_CAP = typeof location !== 'undefined' && /[?&]an=4/.test(location.search) ? 4 : 8; // анизотропия земли: 8 там, где её задаёт пресет («Высокий» и выше), было 4 у всех (?an=4)
const GT_V = '20261116a'; // версия файлов атласов земли (tex/gt_*, pt_*, dc_*, dn_*, mt_*)
const TOUCH_GT = (typeof location !== 'undefined' && /[?&]touch=1/.test(location.search)) || (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches); // телефон: атласы земли - клетка 512 (память видеокарты)

const GRASS_SH = typeof location === 'undefined' || !/[?&]gsh=0/.test(location.search); // тень травы (подставные лепестки); ?gsh=0 - без неё
const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();
const KB = [], KITGS = new Map(); let OFFB = new Uint8Array(0), OFFH = new Uint8Array(0), PH_ON = false; // PH_ON - свой частный сектор (только город: на зиме и осени улицы лучами - фасад к дороге по сетке не найти) // свои дома: данные для разрушения (kitHouses / G.kitHit), модель набора
// серии своих домов (Свои/Дома города, паспорта серий): модели (несколько - по номеру дома), вид BLD (заменяют его модель), секция, глубина, этаж (м),
// секций не меньше, вальмовая кровля у модели
const KIT_SER = [
  { key: 'ii49', models: ['bld_ii49'], v: 2, SEC: 22.4, DEP: 13, FL: 2.9, minN: 1, hip: [false] }, // панельная девятиэтажка II-49 (пилот)
  { key: 'hr', models: ['bld_hr_a', 'bld_hr_c'], v: 1, SEC: 16, DEP: 12, FL: 2.7, minN: 2, hip: [false, true] }, // хрущёвки: панельная 1-464 и кирпичная 1-447 (вальма)
  { key: 'd12', models: ['bld_d12_b', 'bld_d12_g', 'bld_d12_t'], v: 4, SEC: 22.4, DEP: 13, FL: 2.9, minN: 1, hip: [false, false, false] }, // 12-этажная пластина (лоджии; пояс синий / зелёный / терракота)
  { key: 'd16', models: ['bld_d16_b', 'bld_d16_g', 'bld_d16_t'], v: 19, SEC: 22.4, DEP: 13, FL: 2.9, minN: 1, hip: [false, false, false] }, // 16-этажная пластина (серия 5б; эркеры; свой атлас - светлее 12-этажки; вставки синие / зелёные / терракота)
  { key: 'tw', models: ['bld_tw_b', 'bld_tw_g', 'bld_tw_t'], v: 18, SEC: 22.4, DEP: 22.4, FL: 2.9, minN: 1, maxN: 1, hip: [false, false, false] }, // точечная башня 17-27 этажей (серия 5а; атлас 12-этажки; пилоны синие / зелёные / терракота)
];
// строка атласа фасадов по виду: вид → { ser, row } (у серии несколько моделей - подряд)
const KIT_FAC = new Map(); { let row = 0; for (const s of KIT_SER) { if (row + s.models.length <= FAC_MAX) KIT_FAC.set(s.v, { ser: s, row }); row += s.models.length; } }
// частный сектор - свои дома (Свои/Дома города, серия 2; ПАСПОРТ_частный): вид BLD → дом; размеры модели [вдоль фасада, вглубь, высота], м
const PH = { 5: 'st', 7: 'brick', 8: 'mansard', 9: 'wood', 10: 'khata', 12: 'barrack', 13: 'dacha' };
// «сталинка» (серия 4, ПАСПОРТ_сталинка; вид 5 вместо bld_st): целым домом, как частные; st3 - на коробку до 44 м, st4 - длиннее; без двора,
// пепелища нет (каменные стены стоят). Модели вида - обе: коробки вида прячутся, когда пришли обе
const PH_MODELS = { 5: ['bld_st3', 'bld_st4'], 31: ['bld_of', 'bld_gl'] };
// офисы и стеклянные башни Сити из деталей (серии 5в / 5г): вид 31 - все коробки OFFICE / GLASS, и ярусы (y0 > 0); ?of=0 - прежние модели и коробки
const OFV = 31, OF_ON = typeof location === 'undefined' || !/[?&]of=0/.test(location.search);
const PH_SIZE = { st3: [36, 26, 16.8], st4: [54, 26, 20.2], brick: [11.11, 9.1, 6.9], wood: [10.18, 10.9, 6.9], khata: [11.2, 7.2, 6.0], mansard: [11.0, 11.62, 8.4], dacha: [6.8, 6.72, 5.4], barrack: [25.0, 12.05, 9.6] };
// дом в настоящем размере (не вписан в коробку участка: так он выходил до 2× больше), фасадом к ближайшей улице (улицы - по сетке CITY.GRID);
// центр дома - в центре его коробки. ox, oz - середина фасада (начало модели), yaw - поворот (фасад модели смотрит в −Z)
function phPlace(B, i, v) {
  let base = PH[v]; if (!base) return null;
  if (base === 'st') base = Math.max(B.w[i], B.d[i]) > 44 ? 'st4' : 'st3';
  const [L, D, H] = PH_SIZE[base], st = v === 5;
  // сталинка - фасадом вдоль длинной стороны коробки (к ближней улице с той стороны); частный - к ближайшей улице
  const G0 = CITY.GRID, x = B.x[i], z = B.z[i], fx = ((x % G0) + G0) % G0, fz = ((z % G0) + G0) % G0, toX = st ? B.w[i] < B.d[i] : Math.min(fx, G0 - fx) < Math.min(fz, G0 - fz);
  const f0 = toX ? fx : fz, sg = Math.abs(f0 - G0 / 2) < 1 ? ((Math.imul(i, 2246822519) >>> 13) & 1 ? 1 : -1) : f0 < G0 / 2 ? -1 : 1; // посередине квартала - сторона по номеру дома
  const dir = toX ? [sg, 0] : [0, sg], yaw = toX ? (dir[0] > 0 ? -Math.PI / 2 : Math.PI / 2) : (dir[1] > 0 ? Math.PI : 0);
  return { base, M: (st ? 'bld_' : 'ph_') + base, L, D, H, st, yaw, dir, ox: x + dir[0] * D / 2, oz: z + dir[1] * D / 2, alongX: !toX };
}
const KIT_ON = typeof location === 'undefined' || !/[?&]kit=0/.test(location.search); // свои дома модулями вместо вида 2 (девятиэтажки bld_p9); ?kit=0 - прежняя модель
const KVAR = typeof location !== 'undefined' && /[?&]kvar=1/.test(location.search); // ?kvar=1 - варианты этажей одним набором (kitVarMat): вызовов меньше, но вершин вчетверо - по замеру кадр дольше (2026-11-16), по умолчанию выкл.
let TILE = 3000; // (buildCityScene: на сенсорных и без теней - 6 км: вызовов вдвое меньше, «Средний» на телефоне −11…14 % кадра; на ПК с тенями 6 км не быстрее - больше экземпляров в проходе теней) плитка инстансов: 3 км - на 20 % меньше вызовов отрисовки, чем 2 км, при почти тех же треугольниках
const ROOFX = 6, ROOF = 7; // виды только для отрисовки: надстройки на крышах и скатные крыши домов

// ═════════════ Общие uniform'ы ═════════════
export const UPX = { value: 0.0015 }; // размер пикселя на 1 м расстояния (сглаживание линий и окон, переход к среднему цвету)
export const ENV = {
  uCam: { value: new THREE.Vector3() }, uGCR: { value: 0 }, uPx: UPX, uSun: { value: new THREE.Vector3(0.4, 0.7, 0.4).normalize() },
  uZen: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uGnd: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() },
  uNight: { value: 0 }, uGK: { value: 0 }, uTime: { value: 0 }, uSnowK: { value: 0 }, // uSnowK - снег на крышах и уступах (зимняя карта)
  uMdlRf: { value: Array.from({ length: 32 }, () => new THREE.Vector4(0, 0, 0, 0)) }, // средний цвет крыши модели вида
  uMdlCol: { value: Array.from({ length: 32 }, () => new THREE.Vector4(0, 0, 0, 0)) }, // средний цвет модели вида (w = 1 - есть): дальняя коробка - в цвет своей модели
  uMdl: { value: new Array(32).fill(0) }, // радиус, в котором коробки вида дома скрыты (вместо них - модели; 0 - модели нет)
  uHide: { value: new THREE.Vector3() }, // центр этого радиуса: камера (в окне ТВ - точка, куда смотрит контейнер)
};
// ═════════════ Текстуры (ambientCG и Poly Haven, CC0): снимок с высоты, волны, крыши, фасады ═════════════
// грузятся в фоне (fetch + createImageBitmap); пока не пришли все - uTexOn = 0 и шейдеры обходятся без них
export const TEX = { uTexOn: { value: 0 }, uAvgGA: { value: new THREE.Vector3(1, 1, 1) } }; // uAvg* - средний цвет (линейный)
// земля и дороги вблизи - свои атласы (GT ниже); отсюда - снимок с высоты (дальний план), волны, фасады, крыши, бетон и железо для зданий
const TEX_FILES = { tGA: 'g_aerial', tWN: 'w_normals', // волны (three.js, MIT)
  tIron: 'p_iron', tConc: 'concrete', tRoof: 'roof', tOff: 'f_office', tGls: 'f_glass', tBrk: 'f_brick' };
// средний цвет картинки (линейный, как srgb() в шейдере - квадрат): уменьшенная копия 8×8
function avgColor(img) {
  const v = new THREE.Vector3(1, 1, 1);
  try { const c = document.createElement('canvas'); c.width = c.height = 8; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, 8, 8); const d = x.getImageData(0, 0, 8, 8).data; let r = 0, g = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += (d[i] / 255) ** 2; g += (d[i + 1] / 255) ** 2; b += (d[i + 2] / 255) ** 2; } const n = d.length / 4; v.set(r / n, g / n, b / n); } catch (_) { /* нет - 1 */ }
  return v;
}
export const texStats = { req: 0, done: 0 }; // статус загрузки текстур города
function loadCityTextures(aniso, hi, hills) {
  if (TEX.tGA) return;
  let left = Object.keys(TEX_FILES).length; texStats.req += left;
  if (!hills) loadGroundTiles(aniso, hi); // атласы земли - только городу (у осени и зимы свои материалы земли)
  const done = () => { texStats.done++; if (--left === 0) TEX.uTexOn.value = 1; };
  // сжатые KTX2; средний цвет снимка с высоты - из tex/ktx.json
  const viaKtx = ktxOn();
  if (viaKtx) { ktxMeta().then((m) => { for (const [u, c] of Object.entries(m.avg || {})) { const av = TEX['uAvg' + u.slice(1)]; if (av) av.value.set(c[0], c[1], c[2]); } }).catch(() => {}); }
  for (const [u, f] of Object.entries(TEX_FILES)) {
    const t = new THREE.Texture(); t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = u === 'tGA' ? 1 : Math.min(AN_CAP, aniso); t.minFilter = THREE.LinearMipmapLinearFilter; TEX[u] = { value: t }; // снимок с высоты (плитка 260 м) - без анизотропии (ground-far.js); остальные - не больше 4, как у осени и зимы (2026-10-27: 8 против 4 - снимки 55-109 дБ, кадр «Высокого» −3 %, «Ультра» −7 %, низко −15 %)
    if (typeof createImageBitmap !== 'function' || typeof fetch !== 'function') continue;
    if (viaKtx) { ktxLoad(f).then((k) => { k.wrapS = k.wrapT = THREE.RepeatWrapping; k.anisotropy = t.anisotropy; TEX[u].value = k; done(); }).catch(() => jpg(u, f, t)); continue; }
    jpg(u, f, t);
  }
  function jpg(u, f, t) {
    fetch(new URL(`./tex/${f}.jpg?v=20261124a`, import.meta.url)).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(f))))
      .then((b) => createImageBitmap(b)).then((bmp) => { TEX[u].value = t; t.image = bmp; t.needsUpdate = true; const av = TEX['uAvg' + u.slice(1)]; if (av && !viaKtx) av.value.copy(avgColor(bmp)); done(); })
      .catch((e) => { texStats.done++; console.warn('текстура не загрузилась:', e.message); });
  }
}
// ═════════════ Свои текстуры земли и дорог (Свои/Текстуры земли и дорог, сборщик hawk21, 2026-11-16; Mark: «сам встраиваешь все в игру») ═════════════
// tools/airdef-tex/ground-atlas.py: атласы 4 × 4 плитки (каждая - 4 м, плиты аэродрома 6 м) с полями 1/16 клетки (мипмапы не смешивают соседей):
// tGC / tPC - цвет земли / покрытий (альфа - высота плитки: смешивание слоёв по высоте), tGNm / tPN - нормали (B - шероховатость),
// tDC / tDN - наклейки износа дорог (атлас 8 × 8 м), tMT - макро-пятна 256 м (тон, в альфе - выгоревшее). tDT - таблица: прямоугольники
// наклеек (строки 0-1, 16 бит) и средние цвета плиток (строки 2-3) - в шейдере WebGL 1 нельзя брать элемент массива uniform по вычисленному номеру.
// Пока атласы не пришли - средние цвета плиток (uGOn = 0: без выборок). «Ультра» и «Высокий» на ПК - клетка 1024 (256 пикс/м), остальные - 512.
// наклейки дорог: 0-17 - городские улицы, 12-31 - загородные трассы (общие 12-17 - заплаты, битум, лужа), 32-36 - у бордюра (пока не кладутся)
const GT_MEANS = [['GM', 'gt'], ['PM', 'pt']].map(([p, k]) => GTILES[k].map((t, i) => `#define ${p}${i} vec3(${t.mean.map((v) => v.toFixed(5)).join(', ')})`).join('\n')).join('\n');
const DEC = ['люк_1', 'люк_2', 'колодец_связи', 'масло_1', 'масло_2', 'трещина_продольная_1', 'трещина_продольная_2', 'трещина_поперечная_1', 'трещина_поперечная_2',
  'крокодил_1', 'крокодил_3', 'сетка_залитая_1', 'ямочный_старый', 'ямочный_средний', 'ямочный_свежий', 'битум_2', 'лужа_1', 'люк_3', 'крокодил_2', 'выбоина_1',
  'выбоина_2', 'выбоина_3', 'трещина_отражённая_1', 'трещина_отражённая_2', 'колея_1', 'лужа_2', 'битум_1', 'следы_торможения', 'шины_по_песку', 'сетка_залитая_2',
  'мокрое_пятно', 'следы_разворота', 'решётка_1', 'решётка_2', 'песок_у_бордюра_1', 'песок_у_бордюра_2', 'мусор_у_бордюра'];
function gtData() {
  const d = new Uint8Array(64 * 4 * 4), put = (x, y, v) => d.set(v.map((q) => Math.max(0, Math.min(255, Math.round(q)))), (y * 64 + x) * 4);
  const hl = (u) => { const q = Math.round(Math.max(0, Math.min(1, u)) * 65535); return [q >> 8, q & 255]; };
  DEC.forEach((n, i) => { const e = GTILES.dec.list.find((q) => q.name === n); if (!e) { console.warn('нет наклейки', n); return; } const [u, v, w, h] = e.uv; put(i, 0, [...hl(u), ...hl(v)]); put(i, 1, [...hl(w), ...hl(h)]); });
  GTILES.gt.forEach((t, i) => put(i, 2, [...t.mean.map((c) => Math.sqrt(c) * 255), t.rough * 255]));
  GTILES.pt.forEach((t, i) => put(i, 3, [...t.mean.map((c) => Math.sqrt(c) * 255), t.rough * 255]));
  const t = new THREE.DataTexture(d, 64, 4, THREE.RGBAFormat); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.flipY = false; t.needsUpdate = true;
  return t;
}
export const GT = { uGOn: { value: 0 }, tDT: { value: gtData() }, tGC: { value: null }, tGNm: { value: null }, tPC: { value: null }, tPN: { value: null }, tDC: { value: null }, tDN: { value: null }, tMT: { value: null } };
const GT_FILES = { tGC: 'gt_c', tGNm: 'gt_n', tPC: 'pt_c', tPN: 'pt_n', tDC: 'dc', tDN: 'dn', tMT: 'mt' };
// пустышка до загрузки: макро-пятна - тон ×1 (код 128), остальное шейдер без uGOn не читает
{ const t = new THREE.DataTexture(new Uint8Array([128, 128, 128, 0]), 1, 1, THREE.RGBAFormat); t.needsUpdate = true; for (const u of Object.keys(GT_FILES)) GT[u].value = t; }
function loadGroundTiles(aniso, hi) {
  let left = Object.keys(GT_FILES).length; texStats.req += left;
  const done = () => { texStats.done++; if (--left === 0) GT.uGOn.value = 1; };
  const viaKtx = ktxOn();
  for (const [u, f] of Object.entries(GT_FILES)) {
    const set = (t) => { t.wrapS = t.wrapT = u === 'tMT' ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping; t.anisotropy = Math.min(AN_CAP, aniso); GT[u].value = t; done(); };
    // без KTX2 - webp клетки 512 (альфа - данные: без домножения цвета на альфу)
    const web = () => fetch(new URL(`./tex/${f}_lo.webp?v=${GT_V}`, import.meta.url)).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(f))))
      .then((b) => createImageBitmap(b, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })).then((bmp) => { const t = new THREE.Texture(bmp); t.minFilter = THREE.LinearMipmapLinearFilter; t.needsUpdate = true; set(t); })
      .catch((e) => { texStats.done++; console.warn('текстура земли не загрузилась:', e.message); });
    if (typeof createImageBitmap !== 'function' || typeof fetch !== 'function') continue;
    if (viaKtx) ktxLoad(`${SCAN && /^[gp]t_/.test(f) ? 's' : ''}${f}_${hi ? 'hi' : 'lo'}`).then(set).catch(web); else web();
  }
}
// яркость текстуры относительно её среднего (детализация поверх своего цвета); картинки - sRGB, без переворота
const GLSL_TEX = `
uniform sampler2D tIron, tConc, tRoof, tOff, tGls, tBrk, tGA; uniform float uTexOn; uniform vec3 uAvgGA;
float riverX(float z) { return 1300.0 * sin(z * 0.00019 + 0.6) + 450.0 * sin(z * 0.00052 + 2.1) - 300.0; } // как city.js riverX
float dl(sampler2D t, vec2 uv, float avg) { return clamp(dot(texture2D(t, uv).rgb, vec3(0.3, 0.59, 0.11)) / avg, 0.35, 1.9); }
vec3 srgb(vec3 c) { return c * c; }
// цвет текстуры относительно её среднего (оттенок и яркость поверх цвета района); рельеф - по карте нормалей: насколько грань ярче ровной под солнцем
vec3 cr(sampler2D t, vec2 uv, vec3 avg) { return clamp(srgb(texture2D(t, uv).rgb) / max(avg, vec3(0.004)), 0.25, 2.6); }
float reliefN(vec2 nx, vec3 sun) { vec3 n = vec3(nx * 2.0 - 1.0, 0.0); n.z = sqrt(max(0.0, 1.0 - dot(n.xy, n.xy))); vec3 w = normalize(vec3(n.x, n.z * 1.6, -n.y)); float f = max(sun.y, 0.08); return clamp(dot(w, sun) / f, 0.55, 1.5); } // ровная грань - 1 при любом солнце (низкое - не темнее)
`;
const GLSL_COMMON = `
uniform vec3 uCam, uSun, uZen, uHor, uGnd, uSunCol; uniform float uPx, uNight, uTime, uGK;
float hsh(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vns(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hsh(i), hsh(i + vec2(1.0, 0.0)), f.x), mix(hsh(i + vec2(0.0, 1.0)), hsh(i + vec2(1.0, 1.0)), f.x), f.y); }
// небо в направлении d (для отражений): градиент, ореол солнца; ниже горизонта - тёмный город
vec3 skyAt(vec3 d) {
  vec3 c = d.y > 0.0 ? mix(uHor, uZen, pow(d.y, 0.45)) : mix(uHor * 0.6, uGnd, min(-d.y * 3.0, 1.0));
  float s = max(dot(d, uSun), 0.0);
  return c + uSunCol * (pow(s, 10.0) * 0.35 + pow(s, 300.0) * 3.0);
}
`;

// ═════════════ Земля ═════════════
// цвет района (sRGB) и покрытие: 0 - без улиц, 0,5 - мощёный (Сити, промзона, порт), 1 - жилой (дворы с газонами)
const ZCOL = { [ZONE.FIELD]: [0x74854c, 0], [ZONE.LOW]: [0x65713f, 1], [ZONE.MID]: [0x676e4f, 1] /* жилые дворы - трава с грунтом, а не серый бетон (2026-11-25) */, [ZONE.CBD]: [0x6c6c6a, 0.5], [ZONE.IND]: [0x6e6a62, 0.5],
  [ZONE.PARK]: [0x4b6b35, 0.12], [ZONE.WATER]: [0x6e6a60, 0.04], [ZONE.AIR]: [0x7f8c62, 0.04], [ZONE.PORT]: [0x6c6a66, 0.5] }; // альфа 0 - поля за городом (лоскуты культур), 0,12 - парк (лесная подстилка), 0,04 - вода, аэродром
const LAWN = [0x6f7848, 0.06]; // трава внутри ограды объекта (o.lawn), как газон аэропорта, чуть суше
function zoneTexture(size) {
  const data = new Uint8Array(size * size * 4), c = new THREE.Color();
  // SCAN: не цвет района, а доли покрова (поле, мощёное, лес, промзона; остаток - жилые дворы и газоны): у всех зон одна палитра материалов, границы - пятнами
  const ZM = { [ZONE.FIELD]: [255, 0, 0, 0], [ZONE.CBD]: [0, 255, 0, 0], [ZONE.PORT]: [0, 255, 0, 0], [ZONE.PARK]: [0, 0, 255, 0], [ZONE.IND]: [0, 0, 0, 255], [ZONE.WATER]: [128, 0, 0, 0] };
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const x = -CITY.HALF + (i + 0.5) * 2 * CITY.HALF / size, z = -CITY.HALF + (j + 0.5) * 2 * CITY.HALF / size;
    if (SCAN) { data.set(LAWNS.some((o) => Math.abs(x - o.x - (o.rx || 0)) < o.w / 2 + 10 && Math.abs(z - o.z - (o.rz || 0)) < o.d / 2 + 10) ? [0, 0, 0, 0] : ZM[ZA(x, z)] || [0, 0, 0, 0], (j * size + i) * 4); continue; }
    const [hex, urb] = LAWNS.some((o) => Math.abs(x - o.x - (o.rx || 0)) < o.w / 2 + 10 && Math.abs(z - o.z - (o.rz || 0)) < o.d / 2 + 10) ? LAWN : ZCOL[ZA(x, z)];
    c.set(hex);
    const v = 0.9 + 0.2 * Math.sin(x * 0.0021 + Math.sin(z * 0.0013) * 2) * Math.sin(z * 0.0019 + 0.5); // поля и кварталы - пятнами
    const q = (j * size + i) * 4;
    data[q] = Math.min(255, c.r * 255 * v); data[q + 1] = Math.min(255, c.g * 255 * v); data[q + 2] = Math.min(255, c.b * 255 * v); data[q + 3] = urb * 255;
  }
  // границы районов - не ступенькой в текстель, а переходом ~120 м (окраина города плавно уходит в поле)
  const r = Math.max(1, Math.round(size / 1024 * 2)), tmp = new Float32Array(size * 4);
  const pass = (stride, step) => {
    for (let l = 0; l < size; l++) {
      const o = l * stride, s = [0, 0, 0, 0];
      for (let k = -r; k <= r; k++) { const q = o + Math.min(size - 1, Math.max(0, k)) * step; for (let c4 = 0; c4 < 4; c4++) s[c4] += data[q + c4]; }
      for (let i = 0; i < size; i++) {
        for (let c4 = 0; c4 < 4; c4++) tmp[i * 4 + c4] = s[c4] / (2 * r + 1) + 0.5;
        const qa = o + Math.min(size - 1, i + r + 1) * step, qb = o + Math.max(0, i - r) * step;
        for (let c4 = 0; c4 < 4; c4++) s[c4] += data[qa + c4] - data[qb + c4];
      }
      for (let i = 0; i < size; i++) for (let c4 = 0; c4 < 4; c4++) data[o + i * step + c4] = tmp[i * 4 + c4];
    }
  };
  for (let it = 0; it < 2; it++) { pass(size * 4, 4); pass(4, size * 4); }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.encoding = SCAN ? THREE.LinearEncoding : THREE.sRGBEncoding; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}
// затенение земли у зданий: доля застройки вокруг точки (размытая сетка высот) - «контактная тень» и тёмные дворы-колодцы
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
// дорожная сеть (city.RX/RZ) - текстура RS×RS: r - отрезок линии вдоль Z, g - вдоль X; 0 - нет, 0,5 - трасса, 1 - улица
function roadTexture(city) {
  const data = new Uint8Array(RS * RS * 4);
  for (let q = 0; q < RS * RS; q++) { data[q * 4] = city.RX[q] * 127; data[q * 4 + 1] = city.RZ[q] * 127; data[q * 4 + 3] = 255; }
  const t = new THREE.DataTexture(data, RS, RS, THREE.RGBAFormat);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.flipY = false; t.needsUpdate = true;
  return t;
}
// земля города: текстуры выбираются только там, где их вес не 0 (2026-10-27, Mark: «отдельные решения для Речного узла»): трава под асфальтом,
// щебень обочины во дворе, четыре слоя травы на бетоне, «зебры» вдали - без выборок; картинка та же. ?cl=0 - как раньше (сравнение)
const LAZY = { value: typeof location !== 'undefined' && /[?&]cl=0/.test(location.search) ? 0 : 1 };
// проба «земля и свет» города (Mark 2026-11-15: «городская карта слишком плоская… текстуры ощущаются пластиково»): ?look=1 - сильнее
// фактура и рельеф карт нормалей травы, проплешины мельче, вытоптанные обочины, глубже затенение у домов; свет - контрастнее (сильнее солнце,
// слабее заполняющий, реже дымка; цвет кадра - main.js). Только город (не зима и не осень)
const LOOK = typeof location !== 'undefined' && /[?&]look=1/.test(location.search);
// проба «вид с высоты» города (Mark 2026-11-20: «с высоты какие-то идеальные срезы, что высот, что текстур… дешевит игру», сравнение с War Thunder Mobile):
// ?alt=1 - выгоревшие пятна темнее и неровные (были белые круги ~190 м), крупные пятна цвета 2-5 км (сильнее вдали), рваные края склонов и
// береговой полосы. Только цвет земли (рельеф, по которому считает сервер, не меняется); запечённая даль считается тем же кодом - шва нет
const ALT = typeof location !== 'undefined' && /[?&]alt=1/.test(location.search);
// проба света города (Mark 2026-11-16: «начни работать со светом»): ?light=1 - резкое солнце (заполняющий слабее и голубее - тени синеватые,
// дымка реже и не белая), ?light=2 - то же мягче. Только город (не зима и не осень); цвет кадра - main.js LIGHT_GRADE
export const LIGHT = typeof location !== 'undefined' ? +(new URLSearchParams(location.search).get('light') || 0) : 0;
const LIGHTS = { 1: { hemi: 0.6, sun: 1.3, sky: 0xb0c8ee, gnd: 0x58624c, fog: 0xa6bcd4, fogD: 0.72 }, 2: { hemi: 0.74, sun: 1.17, sky: 0xc0d4f2, gnd: 0x626c56, fog: 0xb4c6da, fogD: 0.85 },
  3: { hemi: 0.8, sun: 1.06, sunC: 0xffe0b8, sky: 0xb4c8e4, gnd: 0x6c6650, fog: 0xc0c6cc, fogD: 0.92 } }; // 3 - мягкий «кино»: тёплое солнце, тени заполнены небом
// покров земли вблизи камеры (Свои/Покров земли, 2026-11-15; Mark: «Встраивай», затем «можешь внедрять для других карт»): свои модели gc_*
// (models/gc.glb - все 65 в одном файле, атласы по разу, tools/airdef-models/gc-pack.js). Каждый вид - один InstancedMesh (одна отрисовка на вид),
// экземпляры - в клетках GC_C м в радиусе R вокруг камеры (100 / 80 / 40 м по пресету); раскладка клетки считается один раз (кэш) - по месту:
// город (зона, улица, тротуар, дом, берег, круча, ВПП, объекты), зима и осень (свои наборы, дороги - ломаные city.roads, лёд, болото, пашня).
// Пересчёт - когда камера сдвинулась на 3 м; выше GC_HMAX над землёй - пучков нет. Вдали реже, но крупнее; на краю радиуса - растворение
const GC_ON = typeof location === 'undefined' || !/[?&]gc=0/.test(location.search), GC_C = 3, GC_HMAX = 45; // выше 45 м над землёй пучков нет
// виды по месту (паспорт сборщика: swap_notes и density_per_100m2): [ключ, вес]; цветы - пятнами (клетка-«пятно» одного цветка)
const GC_SET = {
  lawn: [['gc_gr_lawn', 40], ['gc_gr_lawn_b', 16], ['gc_gr_mixed', 18], ['gc_gr_mixed_b', 8], ['gc_gr_meadow', 8], ['gc_gr_dry', 2.5], ['gc_gr_weed', 6], ['gc_lit_grass', 1.2], ['gc_lit_soil', 0.6], ['gc_tussock', 1], ['gc_boulder_s', 0.1], ['gc_pebbles', 0.3]],
  park: [['gc_gr_lawn', 20], ['gc_gr_mixed', 18], ['gc_gr_meadow', 16], ['gc_gr_meadow_b', 8], ['gc_gr_mixed_b', 8], ['gc_lit_moss', 5], ['gc_lit_grass', 5], ['gc_fern_bracken', 2], ['gc_fern_shield', 1.5], ['gc_nettle', 1.5], ['gc_bush_a', 0.8], ['gc_bush_b', 0.8], ['gc_bush_rasp', 0.5],
    ['gc_stump', 0.08], ['gc_log', 0.06], ['gc_branch', 0.12], ['gc_moss', 0.15], ['gc_tussock', 3], ['gc_boulder', 0.2]],
  meadow: [['gc_gr_meadow', 25], ['gc_gr_meadow_b', 12], ['gc_gr_mixed', 18], ['gc_gr_mixed_b', 8], ['gc_gr_dry', 12], ['gc_gr_wormwood', 0.8], ['gc_tussock', 5], ['gc_lit_grass', 2], ['gc_bush_a', 0.4], ['gc_boulder', 0.08], ['gc_boulder_s', 0.15], ['gc_boulder_l', 0.03], ['gc_boulder_f', 0.05]],
  waste: [['gc_gr_dry', 20], ['gc_gr_weed', 14], ['gc_gr_mixed', 10], ['gc_gr_wormwood', 2.5], ['gc_burdock', 3], ['gc_nettle', 2.5], ['gc_hogweed', 0.8], ['gc_fl_thistle', 1.5], ['gc_fl_tansy', 1.5], ['gc_fl_chicory', 1.5], ['gc_rubble_conc', 1.5], ['gc_rubble_brick', 1.5], ['gc_pebbles', 2], ['gc_lit_soil', 5], ['gc_bush_b', 0.4]],
  verge: [['gc_gr_dry', 18], ['gc_gr_weed', 12], ['gc_gr_wormwood', 2], ['gc_gr_mixed', 10], ['gc_fl_chicory', 2], ['gc_fl_tansy', 1.5], ['gc_fl_yarrow', 1.5], ['gc_burdock', 1], ['gc_lit_soil', 4], ['gc_pebbles', 2], ['gc_bush_a', 0.5], ['gc_bush_b', 0.5]],
  yard: [['gc_gr_lawn', 40], ['gc_gr_lawn_b', 16], ['gc_gr_mixed', 18], ['gc_gr_mixed_b', 8], ['gc_gr_meadow', 6], ['gc_gr_dry', 3], ['gc_gr_weed', 4]],
  bank: [['gc_reed', 15], ['gc_gr_sedge', 20], ['gc_horsetail', 6], ['gc_gr_mixed', 8], ['gc_tussock', 4], ['gc_lit_moss', 3]],
  // зима «Северный рубеж»: сухие стебли пятнами по снегу, зонтики и можжевельник у дорог и посёлка, лапник под елями, валуны
  w_field: [['gc_w_stems', 30], ['gc_w_umbels', 3], ['gc_w_boulder_s', 0.4], ['gc_w_boulder', 0.15]],
  w_forest: [['gc_w_spruce', 1.2], ['gc_w_stems', 14], ['gc_w_juniper', 2], ['gc_w_boulder', 0.3], ['gc_w_boulder_s', 0.4]],
  w_verge: [['gc_w_stems', 20], ['gc_w_umbels', 6], ['gc_w_juniper', 1.5], ['gc_rubble_conc', 0.3]],
  w_vil: [['gc_w_stems', 20], ['gc_w_umbels', 5], ['gc_w_juniper', 2], ['gc_rubble_brick', 0.3]],
  w_ind: [['gc_w_stems', 14], ['gc_w_umbels', 3], ['gc_rubble_conc', 1.5], ['gc_rubble_brick', 1]],
  w_slope: [['gc_w_boulder', 1], ['gc_w_boulder_s', 2.5], ['gc_w_stems', 3]],
  // осень «Туманная топь»: рыжая трава, у воды кочки, осока, камыш и хвощ, под деревьями листья, шишки, брусника, папоротник, грибы
  a_field: [['gc_a_grass', 30], ['gc_gr_dry', 8], ['gc_tussock', 4], ['gc_a_leaves', 1.5], ['gc_lit_grass', 1.5], ['gc_bush_juniper', 0.3], ['gc_bush_a', 0.3], ['gc_boulder_s', 0.1], ['gc_boulder', 0.04]],
  a_forest: [['gc_a_leaves', 15], ['gc_a_grass', 10], ['gc_a_pile', 4], ['gc_a_cones', 3], ['gc_a_lingon', 3], ['gc_a_fern', 4], ['gc_fern_bracken', 2], ['gc_fern_shield', 1.2], ['gc_bush_blue', 2], ['gc_lit_moss', 3],
    ['gc_a_mush', 0.8], ['gc_a_amanita', 0.4], ['gc_moss', 0.6], ['gc_w_spruce', 1.2], ['gc_stump', 0.12], ['gc_log', 0.08], ['gc_branch', 0.2]],
  a_bank: [['gc_gr_sedge', 20], ['gc_reed', 12], ['gc_tussock', 8], ['gc_horsetail', 6], ['gc_a_grass', 8], ['gc_lit_moss', 3], ['gc_moss', 0.6]],
  a_verge: [['gc_a_grass', 20], ['gc_gr_dry', 12], ['gc_a_leaves', 3], ['gc_lit_soil', 2], ['gc_pebbles', 1]],
  a_vil: [['gc_a_grass', 25], ['gc_gr_dry', 10], ['gc_a_leaves', 4], ['gc_burdock', 1.5], ['gc_nettle', 1.5], ['gc_lit_soil', 1]],
  a_ind: [['gc_a_grass', 6], ['gc_gr_dry', 5], ['gc_rubble_conc', 2], ['gc_rubble_brick', 1.5], ['gc_lit_soil', 4], ['gc_pebbles', 4]], // утоптанные площадки фермы и торфоразработок - редко
  a_slope: [['gc_boulder', 1], ['gc_boulder_s', 2], ['gc_a_leaves', 3], ['gc_a_grass', 4], ['gc_moss', 1]],
  slope: [['gc_boulder', 1], ['gc_boulder_s', 2.5], ['gc_boulder_f', 0.8], ['gc_boulder_l', 0.3], ['gc_pebbles', 3], ['gc_moss', 1], ['gc_branch', 0.6], ['gc_gr_dry', 3], ['gc_gr_mixed', 3]],
};
// плотность у камеры, пучков на м² (дальше редеет: gcKeep); паспорт даёт соотношение видов, сплошной газон с земли - 3-5 пучков на м²; FL - доля клеток-пятен цветов
const GC_DEN = { w_field: 1.6, w_forest: 1.4, w_verge: 1.4, w_vil: 1.4, w_ind: 1, w_slope: 0.25, a_field: 4.5, a_forest: 3.5, a_bank: 3, a_verge: 2.5, a_vil: 3.5, a_ind: 0.6, a_slope: 0.6, yard: 4, lawn: 5.5, park: 3.5, meadow: 4.5, waste: 2.5, verge: 2.5, bank: 2.5, slope: 0.4 };
// доля оставленных на расстоянии d (м) при радиусе R: до 12 м - все, к 30 м - треть, на краю - двенадцатая часть (там видно только высокое)
// за 30 м оставшиеся пучки крупнее (gcFar: площадь, которую закрывает трава, убывает медленнее числа пучков) - даль не пустеет разом
const gcKeep = (d, R) => d < 12 ? 1 : d < 30 ? 1 - 0.65 * (d - 12) / 18 : 0.35 - 0.27 * Math.min(1, (d - 30) / Math.max(1, R - 30));
const gcFar = (k) => Math.min(1.8, Math.pow(1 / Math.max(k, 0.05), 0.25));
const GC_FL = { lawn: [0.06, ['gc_fl_dand', 'gc_fl_dand_b', 'gc_fl_daisy', 'gc_fl_daisy_b', 'gc_fl_clover']], park: [0.05, ['gc_fl_daisy', 'gc_fl_clover', 'gc_fl_bell', 'gc_fl_dand']],
  a_field: [0.03, ['gc_fl_fireweed', 'gc_fl_tansy', 'gc_fl_yarrow']],
  meadow: [0.1, ['gc_fl_cornflower', 'gc_fl_daisy', 'gc_fl_mix', 'gc_fl_fireweed', 'gc_fl_lupine', 'gc_fl_tansy', 'gc_fl_yarrow', 'gc_fl_bell', 'gc_fl_chicory', 'gc_fl_clover']], verge: [0.04, ['gc_fl_chicory', 'gc_fl_tansy', 'gc_fl_yarrow']] };
// яркость атласа в свете игры: камни и дерево сборщик тянул под пробу ?look=1 (сильное солнце) - в обычном свете города они почти чёрные на светлой траве
// (осенью и на снегу - нет: там свет другой, ×1,75 давал белые камни);
// полынь (серебристая) вдали - белые столбики
const GC_BRIGHT = { c: { K: 1.75, D: 1.35 }, a: { K: 1.2, D: 1.15 }, w: { K: 1, D: 1 } }, GC_KTINT = { gc_gr_wormwood: 0.72 };
const GC_FLAT = /^gc_(lit_|pebbles|moss|branch|a_leaves|a_lingon|a_cones|w_spruce)/, GC_OBJ = /^gc_(boulder|rubble|stump|log|branch|moss|pebbles|tussock|w_boulder|a_mush|a_amanita)/;
// шум для пятен цвета (зеленее / суше, 50-150 м): значение в узлах сетки 90 м, между ними - плавно
const gcH = (i, j) => { let h = (i * 374761393 + j * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function gcNoise(x, z, S) { const u = x / S, v = z / S, i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, a = fu * fu * (3 - 2 * fu), b = fv * fv * (3 - 2 * fv);
  return (gcH(i, j) * (1 - a) + gcH(i + 1, j) * a) * (1 - b) + (gcH(i, j + 1) * (1 - a) + gcH(i + 1, j + 1) * a) * b; }
// материал вида: свет как у земли (нормали карточек - вверх), ветер по высоте модели (wind из паспорта), растворение на краю радиуса,
// просвет травы против солнца. Один программный шейдер на все виды (customProgramCacheKey) - у каждого вида свои значения
function gcMat(m0, key, wind, card, U, atl, mk) {
  const m = card ? new THREE.MeshLambertMaterial({ map: m0.map, alphaTest: 0.45 }) : new THREE.MeshPhongMaterial({ map: m0.map, normalMap: m0.normalMap, normalScale: new THREE.Vector2(1, -1), specular: 0x0c0c0c, shininess: 10 });
  m.color.multiplyScalar((GC_BRIGHT[mk][atl] || 1) * (GC_KTINT[key] || 1) * (mk === 'c' && GK < 1 ? (SCAN ? 0.62 : 0.8) : 1)); // в тон земле (GK)
  const FL2 = SCAN && GC_FLAT.test(key) && !GC_OBJ.test(key); // плоские пятна подстилки: край тает точками, а не ровным вырезом
  if (FL2) m.alphaTest = 0;
  const UW = { value: wind || 0 };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uTime: ENV.uTime, uCam: ENV.uCam, uSun: ENV.uSun, uWH: UW, uGR: U.R }, BU);
    sh.vertexShader = BLAST_GLSL + 'uniform float uTime, uWH, uGR; uniform vec3 uCam; varying float vGF; varying vec3 vGW; varying float vGB;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  vGB = uWH > 0.0 ? clamp(position.y / uWH * 2.2, 0.0, 1.0) : 1.0;
  vec3 gp = instanceMatrix[3].xyz;
  if (uWH > 0.0) { // ветер - в мировых осях (одинаковый у соседних пучков), сдвиг тем больше, чем выше точка пучка
    float wk = clamp(position.y / uWH, 0.0, 1.2); wk *= wk; vec2 ph = gp.xz * 0.11;
    float sw = sin(uTime * 1.6 + ph.x + ph.y) + 0.4 * sin(uTime * 3.1 + ph.x * 1.9 - ph.y * 1.3);
    vec3 bl = blastAt(gp, 2.4, 0.22, uTime); vec3 wd = vec3(0.8, 0.0, 0.5) * sw * 0.07 * uWH * wk + vec3(bl.x, -0.4 * length(bl.xy), bl.y) * 2.2 * uWH * wk; mat3 im = mat3(instanceMatrix); float s2 = max(dot(im[0], im[0]), 1e-4);
    transformed += vec3(dot(im[0], wd), wd.y * length(im[1]), dot(im[2], wd)) / s2;
  }
  vGF = 1.0 - smoothstep(uGR * 0.65, uGR, distance(gp.xz, uCam.xz));`).replace('#include <project_vertex>', '#include <project_vertex>\n  vGW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'uniform vec3 uCam, uSun; varying float vGF; varying vec3 vGW; varying float vGB;\n' + sh.fragmentShader.replace('#include <map_fragment>', SCAN ? `#include <map_fragment>
  ${FL2 ? 'if (diffuseColor.a < 0.15 + 0.8 * fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))))) discard;' : ''}
  { float gl = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)); diffuseColor.rgb = mix(vec3(gl), diffuseColor.rgb, 0.72) * mix(vec3(0.52, 0.5, 0.46), vec3(0.9, 0.87, 0.8), vGB); }` : '#include <map_fragment>').replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  if (vGF < 1.0 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) > vGF) discard; // край радиуса - тает`)
      .replace('#include <dithering_fragment>', card ? `#include <dithering_fragment>
  { float bl = pow(max(dot(normalize(vGW - uCam), uSun), 0.0), 3.0); gl_FragColor.rgb *= 1.0 + bl * vec3(0.32, 0.28, 0.1); } // против солнца - просвет` : '#include <dithering_fragment>');
  };
  m.customProgramCacheKey = () => 'gc' + (card ? 'c' : 'o') + (FL2 ? 'f' : '');
  return m;
}
function groundCover(scene, city, sh, P) {
  // радиус: «Ультра» 100 м, «Высокий» 80, «Средний» (телефоны) 40 и плотность 0,6. Дальше - зерно травы шейдером земли (ENV.uGCR, город)
  const R = P.bldNear >= 650 ? 100 : P.bldNear >= 450 ? 80 : 40, DK = P.bldNear >= 450 ? 1 : 0.6, U = { R: { value: R } };
  const MK = city.kind === 'winter' ? 'w' : city.kind === 'autumn' ? 'a' : 'c', HL = MK !== 'c';
  const CTX = Object.keys(GC_SET).filter((k) => (MK === 'c' ? !/^[wa]_/.test(k) : k.startsWith(MK + '_')));
  const kinds = new Map(), cells = new Map(), EMPTY = new Float32Array(0), CMAX = Math.ceil(4 * Math.PI * (R / GC_C) ** 2); // кэш раскладки - на ~4 окна; дальние клетки выкидываются
  const kindOf = (k) => kinds.get(k) || kinds.set(k, { key: k, id: kinds.size, meshes: [], n: 0, cap: 64, arr: new Float32Array(64 * 16), col: new Float32Array(64 * 3) }).get(k);
  for (const c of CTX) { for (const [k] of GC_SET[c]) kindOf(k); if (GC_FL[c]) for (const k of GC_FL[c][1]) kindOf(k); }
  const KL = [...kinds.values()];
  const pick = (L, t) => { let s = 0; for (const e of L) s += e[1]; t *= s; for (const e of L) { t -= e[1]; if (t <= 0) return e[0]; } return L[L.length - 1][0]; };
  // что растёт в клетке (одно место - один набор): по зоне, дороге, дому, берегу и круче
  // участки объектов-целей (рамка o.w × o.d со сдвигом rx / rz): с травой внутри (o.lawn) - только газон, остальные - без покрова; ВПП - без
  const OBJ = city.objects.filter((o) => !o.bridge).map((o) => { const [a, b, c, d] = [(o.rx || 0) - o.w / 2, (o.rx || 0) + o.w / 2, (o.rz || 0) - o.d / 2, (o.rz || 0) + o.d / 2]; return [o.x + a, o.x + b, o.z + c, o.z + d, !!o.lawn]; });
  const objAt = (x, z) => { for (const q of OBJ) if (x > q[0] && x < q[1] && z > q[2] && z < q[3]) return q[4] ? 2 : 1; return 0; };
  const onRwy = (x, z) => !HL && Math.abs(x - AIRPORT.x) < AIRPORT.rwyL / 2 + 6 && Math.abs(z - AIRPORT.z) < AIRPORT.rwyW / 2 + 6;
  // дороги зимы и осени - ломаные city.roads (onRoad у этих карт пустой): отрезки по сетке 32 м, roadD - до края полотна
  const RG = new Map(), RC = 32;
  if (HL) for (const r of city.roads || []) for (let k = 0; k + 1 < r.pts.length; k++) {
    const [ax, az] = r.pts[k], [bx, bz] = r.pts[k + 1], pad = r.w / 2 + 10, sg = [ax, az, bx, bz, r.w / 2];
    for (let i = Math.floor((Math.min(ax, bx) - pad) / RC); i <= Math.floor((Math.max(ax, bx) + pad) / RC); i++) for (let j = Math.floor((Math.min(az, bz) - pad) / RC); j <= Math.floor((Math.max(az, bz) + pad) / RC); j++) { const q = i * 65536 + j; (RG.get(q) || RG.set(q, []).get(q)).push(sg); }
  }
  const roadD = (x, z) => { const L = RG.get(Math.floor(x / RC) * 65536 + Math.floor(z / RC)); let d = 1e9; if (L) for (const [ax, az, bx, bz, hw] of L) { const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)); d = Math.min(d, Math.hypot(x - ax - u * dx, z - az - u * dz) - hw); } return d; };
  const WY = MK === 'a' ? city.autumn.WY : CITY.WATER_Y, WI = MK === 'w' ? city.winter : null;
  // зима: лёд - по высоте над его уровнем, как в шейдере земли (winter-render.js iceY), а не по узлам сетки
  const wet = (x, z) => (WI ? GH(x, z) - (z < WI.DAM_Z ? WI.LAKE_N_Y : Math.max(WI.LAKE_S_Y, 144 - z * 0.004)) < 0.7 : GH(x, z) < WY + 0.05);
  const onRd = (x, z, pad) => (HL ? roadD(x, z) < pad : city.onRoad(x, z, pad));
  const ctxHills = (x, z) => {
    const zn = city.zoneAt(x, z); if (zn === ZONE.WATER || zn === ZONE.AIR) return null;
    const ob = objAt(x, z); if (ob === 1) return null; if (ob === 2) return MK + '_vil';
    if (city.bldAt(x, z) > 0) return null; const rd = roadD(x, z); if (rd < 1.5) return null;
    if (MK === 'a') { const wh = GH(x, z) - WY; if (wh < 0.05) return null; if (wh < 1.2) return 'a_bank'; }
    if (MK === 'a' && city.inField && city.inField(x, z)) return null; // пашня и тыквенные поля осени - борозды шейдера земли, без травы
    if (city.slopeAt(x, z) > (MK === 'w' ? 0.6 : 0.5)) return MK + '_slope';
    if (rd < 7) return MK + '_verge';
    return zn === ZONE.IND ? MK + '_ind' : zn === ZONE.LOW ? MK + '_vil' : zn === ZONE.PARK ? MK + '_forest' : MK + '_field';
  };
  const ctxOf = (x, z) => {
    if (HL) return ctxHills(x, z);
    const zn = zoneAt(x, z); if (zn === ZONE.WATER || zn === ZONE.PORT || zn === ZONE.CBD || onRwy(x, z)) return null;
    const ob = objAt(x, z); if (ob === 1) return null; if (ob === 2) return GH(x, z) - CITY.WATER_Y < 0.05 ? null : 'yard';
    const rd = Math.abs(x - riverX(z)) - CITY.RIVER_W / 2; if (rd < 1) return null;
    if (city.bldAt(x, z) > 0 || city.onRoad(x, z, 2.5)) return null;
    if (RELIEF && slopeAt(x, z) > 0.16) return 'slope';
    const wh = GH(x, z) - CITY.WATER_Y; if (wh < 0.05) return null; // под водой (берег у реки пологий: вода дальше её русла)
    if (wh < 1.3 && rd < 80) return 'bank';
    if (city.onRoad(x, z, 7)) return zn === ZONE.FIELD ? 'verge' : zn === ZONE.IND || zn === ZONE.AIR ? 'waste' : 'verge';
    return zn === ZONE.IND || zn === ZONE.AIR ? 'waste' : zn === ZONE.PARK ? 'park' : zn === ZONE.FIELD ? 'meadow' : 'lawn';
  };
  // раскладка клетки: [вид, x, y, z, поворот, масштаб, высота, r, g, b] - считается один раз
  const cellOf = (i, j) => {
    const ck = i * 65536 + j; let e = cells.get(ck); if (e) return e.a;
    const c = [], cx = (i + 0.5) * GC_C, cz = (j + 0.5) * GC_C, ctx = ctxOf(cx, cz); cells.set(ck, e = { x: cx, z: cz, a: EMPTY }); if (!ctx) return EMPTY;
    const rr = mulberry32(((i * 73856093) ^ (j * 19349663)) >>> 0), FL = GC_FL[ctx], flw = FL && rr() < FL[0] ? FL[1][Math.floor(rr() * FL[1].length)] : null;
    const patch = MK === 'w' ? 0.1 + 0.9 * THREE.MathUtils.smoothstep(gcNoise(cx - 77, cz + 41, 22), 0.4, 0.7) : 1; // зимой стебли пятнами из-под снега
    const clump = SCAN && MK === 'c' ? 0.35 + 1.5 * THREE.MathUtils.smoothstep(gcNoise(cx + 33, cz - 71, 9) * 0.6 + gcNoise(cx - 5, cz + 19, 31) * 0.4, 0.3, 0.7) : 1;
    const cnt = Math.round(GC_DEN[ctx] * clump * patch * GC_C * GC_C * (0.55 + 0.9 * rr()) * (flw ? 0.5 : 1)), nf = flw ? 3 + Math.floor(rr() * 6) : 0;
    const dry = gcNoise(cx, cz, 90), grn = gcNoise(cx + 517, cz - 311, 140), rpad = HL ? 1 : zoneAt(cx, cz) === ZONE.FIELD ? 1.5 : 4.6; // в городе у улиц - тротуар до 4,5 м от проезжей части (шейдер земли)
    for (let q = 0; q < cnt + nf; q++) {
      const k = q < nf ? flw : pick(GC_SET[ctx], rr()); if (SCAN && MK === 'c' && /^gc_lit_/.test(k)) continue; const x = i * GC_C + rr() * GC_C, z = j * GC_C + rr() * GC_C;
      const ob = objAt(x, z); if (onRd(x, z, rpad) || city.bldAt(x, z) > 0 || wet(x, z) || onRwy(x, z) || ob === 1 || (ob === 2 && siteKeep(city, x, z, 0.5))) continue; // сцены объектов: не в водоём, не на рельсы и площадки (SITES keep)
      const obj = GC_OBJ.test(k), flat = GC_FLAT.test(k), sc = 0.6 + rr() * 0.8, sy = obj || flat ? 1 : 0.85 + rr() * 0.35;
      const y = GH(x, z) + (flat && !obj ? 0.015 : obj ? -0.03 * sc : -0.01);
      // цвет экземпляра: трава - пятнами (суше / зеленее) и чуть каждая своя; камни и дерево - только яркость
      const v = 0.92 + rr() * 0.16; let cr = v, cg = v, cb = v;
      if (!obj) { const d = THREE.MathUtils.smoothstep(dry, 0.45, 0.8), g = THREE.MathUtils.smoothstep(grn, 0.55, 0.85); cr *= 1 + 0.07 * d - 0.1 * g; cg *= 1 + 0.02 * d + 0.05 * g; cb *= 1 - 0.1 * d - 0.06 * g; }
      c.push(kinds.get(k).id, x, y, z, rr() * 6.2832, sc, sy, cr, cg, cb);
    }
    return (e.a = c.length ? Float32Array.from(c) : EMPTY);
  };
  let lx = 1e9, lz = 1e9, on = false;
  const hideAll = () => { for (const K of KL) { for (const m of K.meshes) { m.count = 0; m.visible = false; } if (K.px) K.px.count = 0; } on = false; };
  let off = false;
  const tick = (p) => {
    if (!KL.some((K) => K.meshes.length)) return;
    if (off) { if (on) hideAll(); ENV.uGCR.value = 0; return; }
    const ph = p.y - GH(p.x, p.z); ENV.uGCR.value = HL ? 0 : R; // зерно травы шейдером земли - и с высоты (его гасит сам шейдер по размеру пикселя)
    if (ph > GC_HMAX) { if (on) hideAll(); lx = 1e9; ENV.uGCR.value = HL ? 0 : R; return; } // высоко - пучков не видно
    const ph2 = ph * ph;
    if (on && Math.abs(p.x - lx) < 3 && Math.abs(p.z - lz) < 3) return; lx = p.x; lz = p.z; on = true;
    for (const K of KL) K.n = 0;
    const i0 = Math.floor((p.x - R) / GC_C), i1 = Math.floor((p.x + R) / GC_C), j0 = Math.floor((p.z - R) / GC_C), j1 = Math.floor((p.z + R) / GC_C), R2 = (R + GC_C) ** 2;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const ccx = (i + 0.5) * GC_C - p.x, ccz = (j + 0.5) * GC_C - p.z; if (ccx * ccx + ccz * ccz > R2) continue;
      const c = cellOf(i, j);
      for (let o = 0; o < c.length; o += 10) {
        const x = c[o + 1], z = c[o + 3], d = Math.sqrt((x - p.x) ** 2 + (z - p.z) ** 2 + ph2); if (d > R) continue; // по наклонной: с высоты мелкая трава редеет раньше
        const K = KL[c[o]], sc = c[o + 5], h = (K.h || 0.4) * sc, keep = (c[o + 4] * 9.13) % 1; // мелкое вдали не видно: низкая трава редеет раньше высокой
        const kp = DK * gcKeep(d, R); if (d > 25 + 120 * h || keep > kp) continue;
        if (K.n >= K.cap) { K.cap *= 2; const a = new Float32Array(K.cap * 16), cl = new Float32Array(K.cap * 3); a.set(K.arr); cl.set(K.col); K.arr = a; K.col = cl; K.grow = true; }
        const n = K.n++, a = K.arr, ro = c[o + 4], s = sc * gcFar(kp / DK), cs = Math.cos(ro) * s, sn = Math.sin(ro) * s, b = n * 16;
        a[b] = cs; a[b + 1] = 0; a[b + 2] = -sn; a[b + 3] = 0; a[b + 4] = 0; a[b + 5] = s * c[o + 6]; a[b + 6] = 0; a[b + 7] = 0; a[b + 8] = sn; a[b + 9] = 0; a[b + 10] = cs; a[b + 11] = 0; a[b + 12] = x; a[b + 13] = c[o + 2]; a[b + 14] = z; a[b + 15] = 1;
        K.col[n * 3] = c[o + 7]; K.col[n * 3 + 1] = c[o + 8]; K.col[n * 3 + 2] = c[o + 9];
      }
    }
    if (cells.size > CMAX) { const F = (2 * R) ** 2; for (const [k, e] of cells) if ((e.x - p.x) ** 2 + (e.z - p.z) ** 2 > F) cells.delete(k); }
    for (const K of KL) {
      if (!K.meshes.length) continue;
      if (K.grow) { K.grow = false; K.im = new THREE.InstancedBufferAttribute(K.arr, 16).setUsage(THREE.DynamicDrawUsage); K.ic = new THREE.InstancedBufferAttribute(K.col, 3).setUsage(THREE.DynamicDrawUsage); for (const m of K.meshes) { m.instanceMatrix = K.im; m.instanceColor = K.ic; } if (K.px) K.px.instanceMatrix = K.im; }
      else if (K.n) { K.im.updateRange.count = K.n * 16; K.im.needsUpdate = true; K.ic.updateRange.count = K.n * 3; K.ic.needsUpdate = true; }
      for (const m of K.meshes) { m.count = K.n; m.visible = K.n > 0; }
      if (K.px) K.px.count = K.n;
    }
  };
  // радиус по роли (G.nearScale, Mark 2026-11-08: за самолёт земля - в минимальной детализации): меньше 1 - без покрова
  tick.scale = (k) => { off = k < 1; lx = 1e9; };
  // модель пришла (models.js, main.js loadModels): по InstancedMesh на вид и материал
  tick.attach = (group) => {
    if (KL.some((K) => K.meshes.length)) return;
    for (const K of KL) {
      const part = group.getObjectByName(K.key); if (!part) continue;
      const box = new THREE.Box3().setFromObject(part); K.h = Math.max(0.05, box.max.y);
      K.im = new THREE.InstancedBufferAttribute(K.arr, 16); K.im.setUsage(THREE.DynamicDrawUsage); K.ic = new THREE.InstancedBufferAttribute(K.col, 3); K.ic.setUsage(THREE.DynamicDrawUsage);
      part.traverse((c) => {
        if (!c.isMesh) return; const card = !!c.material.alphaTest, wind = GC_OBJ.test(K.key) || GC_FLAT.test(K.key) ? 0 : K.h;
        const m = new THREE.InstancedMesh(c.geometry, gcMat(c.material, K.key, wind, card, U, (c.name.split('|gc_')[1] || ''), MK), K.cap); m.instanceMatrix = K.im; m.instanceColor = K.ic; m.count = 0; m.visible = false;
        m.frustumCulled = false; m.castShadow = false; m.receiveShadow = !!sh.receive; m.name = K.key; scene.add(m); K.meshes.push(m);
      });
      if (sh.proxy && sh.proxy() && !GC_OBJ.test(K.key) && !GC_FLAT.test(K.key) && K.h > 0.12) { // тень куста - подставными лепестками (near-shadow.js)
        const w = Math.min(1.2, Math.max(0.2, Math.max(box.max.x - box.min.x, box.max.z - box.min.z))), px = K.px = new THREE.InstancedMesh(tuftShadowGeo(K.h, w), shadowOnly(), K.cap);
        px.instanceMatrix = K.im; px.count = 0; px.frustumCulled = false; px.visible = false; px.castShadow = true; px.name = 'shadow_' + K.key; scene.add(px); sh.proxy().near.push(px);
      }
    }
    lx = 1e9;
  };
  return tick;
}
const RLF = (n, k) => (SCAN ? '1.0' : `mix(1.0, reliefN(${n}, uSun), ${k})`), DNM = (n, ms, w) => (SCAN ? `{ float wN = ${w}; gDN = mix(gDN, (${n}) * 2.0 - 1.0, wN); gMS = mix(gMS, ${ms}, wN); }` : '');
function groundMaterial(tex, ao, road, bake, bakeReady) {
  const m = new THREE.MeshPhongMaterial({ map: tex, specular: SCAN ? 0x0b0b0b : ALT ? 0x000000 : 0x0a0a0a, shininess: SCAN ? 22 : 8 }); m.defines = { ...(m.defines || {}), NO_SH: 1 }; m.userData.farU = FAR_U; m.userData.AT = TEX; m.userData.lazyU = LAZY; m.userData.GT = GT; // ?alt=1: без блика (широкое пятно shininess 8 на всей земле - «глянец», Mark 2026-11-20)
  m.extensions = { derivatives: true, shaderTextureLOD: true }; // явные производные выборок (TXG) - на WebGL 1
  const XU = { uFar: FAR_U, uLazy: LAZY, tAO: { value: ao }, tRoad: { value: road }, tNoise: { value: NOISE_ON ? noiseTex() : null }, uAir: { value: new THREE.Vector4(AIRPORT.x, AIRPORT.z, AIRPORT.rwyL / 2, AIRPORT.rwyW / 2) } };
  const G = CITY.GRID.toFixed(1), AV = CITY.AVE_EVERY.toFixed(1), HA = (CITY.AVENUE / 2).toFixed(1), HS = (CITY.STREET / 2).toFixed(1);
  const RNf = RN.toFixed(1), RSf = RS.toFixed(1), HR = RURAL_HW.toFixed(1);
  // шум земли - текстурой (noise-tex.js): vns() здесь - 13 вызовов на пиксель по 4 хэша; в остальных шейдерах города vns прежний
  const HEAD = 'float gSkyV = 1.0; varying vec3 vWp; uniform sampler2D tAO, tRoad; uniform vec4 uAir; uniform float uFar, uLazy, uGCR;\n' + GLSL_COMMON + (NOISE_ON ? NOISE_GLSL + '#define vns vnt\n' : '') + GLSL_TEX + `
// все выборки атласов - с явными производными (cDx, cDy - до ветвлений): ветвления по весам слоёв не дают швов мипмапов
#if __VERSION__ >= 300 || defined(GL_EXT_shader_texture_lod)
#define TXG(t, uv, gx, gy) texture2DGradEXT(t, uv, gx, gy)
#else
#define TXG(t, uv, gx, gy) texture2D(t, uv)
#endif
uniform sampler2D tGC, tGNm, tPC, tPN, tDC, tDN, tMT, tDT; uniform float uGOn;
${GT_MEANS} // средние цвета плиток (линейные) - константами: без выборок таблицы на каждый слой (кадр ГП −10 %)
vec2 cDx, cDy; float gNear = 0.0;
// снимок с высоты относительно среднего (плитка T м)
vec3 crA(vec2 p, float T) { return clamp(srgb(TXG(tGA, p / T, cDx / T, cDy / T).rgb) / max(uAvgGA, vec3(0.004)), 0.25, 2.6); }
// таблица tDT: строка 0-1 - прямоугольник наклейки (16 бит), 2 - средний цвет плитки земли (√ линейного), 3 - покрытия
vec4 dtx(float i, float r) { return texture2D(tDT, vec2((i + 0.5) / 64.0, (r + 0.5) / 4.0)); }
vec2 u16(vec4 q) { return vec2(q.r * 65280.0 + q.g * 255.0, q.b * 65280.0 + q.a * 255.0) / 65535.0; }
vec4 decRect(float i) { return vec4(u16(dtx(i, 0.0)), u16(dtx(i, 1.0))); }
// клетка атласа: плитка - 7/8 клетки, поля по 1/16
// след выборки - не больше половины поля клетки (1/128 атласа): соседняя плитка не просвечивает (вдали плитка уже почти погасла - nk)
vec2 gc(vec2 g) { float l = length(g); return l > 0.0078 ? g * (0.0078 / l) : g; }
vec2 gd(vec2 g) { float l = length(g); return l > 0.0012 ? g * (0.0012 / l) : g; }
vec2 atUV(float s, vec2 p, float T) { return (vec2(mod(s, 4.0), floor(s * 0.25 + 0.01)) + 0.0625 + fract(p / T) * 0.875) * 0.25; }
float hbw(float w, float ha, float hb) { return w <= 0.001 ? 0.0 : (w >= 0.999 ? 1.0 : clamp((w - 0.5) * 4.0 + (hb - ha) * 2.5 + 0.5, 0.0, 1.0)); } // смешивание по высоте плиток
// слои земли: LR - цвет относительно среднего базы bm, LH - высота, LN - нормаль (x, y); вблизи (nk) - выборка, дальше - средний цвет плитки.
// own = 1 - слой даёт только свою фактуру (цвет - от района: пашня, подстилка уже окрашены по-своему)
vec3 LR; float LH; vec2 LN; float LS = 1.0, PS = 1.0; vec3 LM = vec3(0.0); vec2 gDN = vec2(0.0); float gMS = 1.0, gSpec = 0.0;
${SCAN ? 'float ms1(sampler2D t, float s, vec2 p, vec2 gx, vec2 gy, float T, float h) { vec2 o = uSun.xz / max(uSun.y, 0.3) * 0.022; float k = 0.21875 / T; float a = TXG(t, atUV(s, p + o, T), gc(gx * k), gc(gy * k)).a, b = TXG(t, atUV(s, p + o * 0.45, T), gc(gx * k), gc(gy * k)).a; return 1.0 - clamp(max(a - 0.34, b - 0.12) - h, 0.0, 0.3) / 0.3 * 0.75; }' : ''}
void gSet(vec3 m, float s, vec2 p, vec2 gx, vec2 gy, float T, float nk, vec3 bm, float w, float own) {
  if (w <= 0.0) return;${SCAN ? ' T = T > 5.0 ? T : T * 0.75;' : ''}
  vec3 b = mix(bm, m, own); vec3 r = m / max(b, vec3(0.004)); float h = 0.5, ms = 1.0; vec2 n = vec2(0.5);
  if (nk > 0.0) { float k = 0.21875 / T; vec2 uv = atUV(s, p, T); vec4 c = TXG(tGC, uv, gc(gx * k), gc(gy * k));${SCAN ? ' if (gNear > 0.0) ms = mix(1.0, ms1(tGC, s, p, gx, gy, T, c.a), gNear);' : ''}
    r = mix(r, srgb(c.rgb) / max(b, vec3(0.004)), nk); h = mix(0.5, c.a, nk); n = mix(n, TXG(tGNm, uv, gc(gx * k), gc(gy * k)).rg, nk); }
  float t = hbw(w, LH, h); LR = mix(LR, r, t); LH = mix(LH, h, t); LN = mix(LN, n, t); LS = mix(LS, ms, t); LM = mix(LM, m, t);
}
// покрытия: PC - цвет (линейный), PM - средний цвет слоёв, PH, PN - как у земли
vec3 PC, PM; float PH; vec2 PN;
void pBeg() { PC = vec3(0.0); PM = vec3(0.0); PH = 0.5; PN = vec2(0.5); PS = 1.0; }
void pSet(vec3 m, float s, vec2 p, vec2 gx, vec2 gy, float T, float nk, float w) {
  if (w <= 0.0) return;${SCAN ? ' T = T > 5.0 ? T : T * 0.75;' : ''}
  vec3 c3 = m; float h = 0.5, ms = 1.0; vec2 n = vec2(0.5);
  if (nk > 0.0) { float k = 0.21875 / T; vec2 uv = atUV(s, p, T); vec4 c = TXG(tPC, uv, gc(gx * k), gc(gy * k));${SCAN ? ' if (gNear > 0.0) ms = mix(1.0, ms1(tPC, s, p, gx, gy, T, c.a), gNear);' : ''}
    c3 = mix(m, srgb(c.rgb), nk); h = mix(0.5, c.a, nk); n = mix(n, TXG(tPN, uv, gc(gx * k), gc(gy * k)).rg, nk); }
  float t = hbw(w, PH, h); PC = mix(PC, c3, t); PM = mix(PM, m, t); PH = mix(PH, h, t); PN = mix(PN, n, t); PS = mix(PS, ms, t);
}
// плитка земли целиком (цвет, линейный): берег, двор, склон
vec3 gAbs(vec3 m, float s, vec2 p, vec2 gx, vec2 gy, float T, float nk) { if (nk <= 0.0) return m; float k = 0.21875 / T; return mix(m, srgb(TXG(tGC, atUV(s, p, T), gc(gx * k), gc(gy * k)).rgb), nk); }
// вид отрезка дороги: линия i (вдоль Z) между j и j+1 - .r, линия j (вдоль X) между i и i+1 - .g
vec2 roadSeg(float i, float j) { return texture2D(tRoad, (vec2(i, j) + ${RNf} + 0.5) / ${RSf}).rg; }
// дорога вдоль линии сетки: o - смещение от оси, hw - полуширина, ave - проспект
void roadAt(float p, out float o, out float hw, out float ave) {
  float i = floor(p / ${G} + 0.5); o = p - i * ${G};
  ave = mod(i, ${AV}) < 0.5 ? 1.0 : 0.0; hw = ave > 0.5 ? ${HA} : ${HS};
}
// наклейка износа на дороге: q.x - поперёк от оси (м), q.y - вдоль; li - номер линии (у каждого участка свой набор), CL - шаг ячеек вдоль,
// rural - загородная трасса; g* - производные (поперёк, вдоль). Результат: цвет (линейный) и покрытие, нормаль - в dN
vec4 dN;
vec4 decal(vec2 q, float li, float CL, float off, float hw, float rural, vec2 gx, vec2 gy, float prob) {
  float ci = floor((q.y + off) / CL), hs = hsh(vec2(li * 1.37 + off, ci * 0.913 + 5.0));
  if (hs > prob) return vec4(0.0);
  float hi = hsh(vec2(ci * 3.1 + off, li * 0.71 + 11.0)), idx = rural > 0.5 ? 12.0 + floor(hi * 19.99) : floor(hi * 17.99);
  vec4 R = decRect(idx); vec2 sz = R.zw * 8.0; // м: поперёк, вдоль
  float cy = (ci + 0.5) * CL - off + (hsh(vec2(ci, li + 3.3)) - 0.5) * max(0.0, CL - sz.y - 0.4);
  float cx = (hsh(vec2(li - 2.2, ci + 7.7)) - 0.5) * max(0.0, 2.0 * hw - 0.8 - sz.x);
  vec2 l = vec2((q.x - cx) / sz.x, (q.y - cy) / sz.y) + 0.5;
  bool fl = hsh(vec2(ci + 1.9, li)) > 0.5; if (fl) l = 1.0 - l;
  if (l.x <= 0.0 || l.x >= 1.0 || l.y <= 0.0 || l.y >= 1.0) return vec4(0.0);
  vec2 uv = R.xy + l * R.zw, k = R.zw / sz, dx = gd(gx * k), dy = gd(gy * k); vec4 c = TXG(tDC, uv, dx, dy); dN = TXG(tDN, uv, dx, dy); if (fl) dN.rg = 1.0 - dN.rg; // поле между наклейками ~0,0025 атласа - след не шире, иначе соседка затекает
  return vec4(srgb(c.rgb), c.a);
}
`;
  // цвет земли (до освещения): bk = false - в материале (пиксель экрана), true - в запекании дальней земли (ground-bake.js: пиксель - тексель уровня, дальше 1,6 км)
  const DER = 'cDx = dFdx(vWp.xz); cDy = dFdy(vWp.xz); vec3 c3x = dFdx(vWp), c3y = dFdy(vWp);';
  const BODY = (bk, der = true) => `  ${SCAN ? 'vec4 zm = diffuseColor; float urb = clamp(1.0 - zm.r - zm.g - zm.b - zm.a, 0.0, 1.0) + 0.5 * (zm.g + zm.a);' : 'float urb = diffuseColor.a;'} diffuseColor.a = 1.0; ${der ? DER : ''}
  float dist = ${bk ? '1.0e5' : 'length(vWp - uCam)'}, px = ${bk ? 'max(0.05, max(length(cDx), length(cDy)))' : 'max(0.05, dist * uPx)'}, fine = 1.0 - smoothstep(0.4, 2.5, ${bk ? 'px * 0.5' : 'px'}); // запекание (bk): пиксель - тексель уровня (пятна шума - как у живого шейдера, у которого здесь пиксель - полтекселя)
${SCAN ? `
  vec2 p = vWp.xz; float nA = vns(p / 190.0 + 7.0), n3 = vns(p / 61.0 + 13.0), n1 = vns(p / 23.0), nD = vns(p / 7.0 + 3.1), nE = vns(p / 420.0 + 31.0); float n2 = nA;
  float wv = smoothstep(0.35, 0.65, n1 * 0.7 + nD * 0.3), flower = smoothstep(0.62, 0.78, vns(p / 90.0 + 4.0));
  float nk = uGOn * (1.0 - smoothstep(0.06, 0.3, px)); gNear = nk * (1.0 - smoothstep(0.008, 0.022, px));
  vec4 mt1 = texture2D(tMT, p / 256.0), mt2 = texture2D(tMT, mat2(0.7986, 0.6018, -0.6018, 0.7986) * p / 173.0 + 0.37);
  vec3 tone = mix(vec3(1.0), mt1.rgb * 1.992, 0.6) * mix(vec3(1.0), mt2.rgb * 1.992, 0.45); float burnt = mt1.a * uGOn;
  // границы зон - рваными пятнами 7-200 м: один материал входит в другой языками и островами, а не ровным переходом цвета
  float ed = nA * 0.35 + n3 * 0.3 + n1 * 0.22 + nD * 0.13 - 0.5;
  float fm = smoothstep(0.4, 0.6, zm.r + ed * 0.75), pm = smoothstep(0.38, 0.62, zm.b + ed * 0.85), pv = smoothstep(0.44, 0.56, zm.g + ed * 0.3), ind = smoothstep(0.36, 0.64, zm.a + ed * 0.8);
  float fh = 0.0, fh2 = 0.0, fEdge = 0.0, crop = 0.0; vec2 fq = vec2(0.0); bool fAlongX = false;
  if (fm > 0.001) { // поля: лоскуты 300-500 м (пастбище, пашня, стерня, всходы), межи - грунтовки
    vec2 jit = vec2(vns(p / 900.0 + 11.0), vns(p / 900.0 + 23.0)) * 0.45, pc = p / vec2(430.0, 340.0) + jit, pid = floor(pc), pf = fract(pc);
    fh = hsh(pid * 1.7 + 3.1); fh2 = hsh(pid * 5.3 + 1.9);
    vec2 edm = min(pf, 1.0 - pf) * vec2(430.0, 340.0); fAlongX = edm.y < edm.x; float em = min(edm.x, edm.y);
    fq = fAlongX ? vec2((pf.y < 0.5 ? edm.y : -edm.y) + 2.0, p.y * 0.0 + vWp.x) : vec2((pf.x < 0.5 ? edm.x : -edm.x) + 2.0, vWp.z); fEdge = (1.0 - smoothstep(1.7, 2.3, abs(fq.x - 2.0))) * fm;
    crop = step(0.3, fh) * smoothstep(5.0, 16.0, em + (n1 - 0.5) * 16.0 + (nD - 0.5) * 8.0); } // край пашни неровный: у межи - трава
  float gm = (1.0 - pv) * (1.0 - 0.7 * ind);
  float dryM = smoothstep(0.42, 0.72, nA * 0.5 + n3 * 0.3 + nE * 0.35 - 0.08 + 0.12 * (1.0 - fm) * 0.0);
  float bare = smoothstep(0.6, 0.78, n1 * 0.45 + nD * 0.3 + n3 * 0.25 + 0.1 * dryM); // проплешины
  vec3 col; vec3 bm = vec3(1.0); LR = vec3(0.0); LH = 0.5; LN = vec2(0.5); LS = 1.0;
  mat2 rot = mat2(0.7986, 0.6018, -0.6018, 0.7986); vec2 pR = rot * p + 17.3, gxR = rot * cDx, gyR = rot * cDy;
  // низовой ковёр: газон двух видов, выгоревшая трава, луг; потом земля, подстилка, пашня - каждый слой врастает по высоте плиток
  gSet(GM0, 0.0, p, cDx, cDy, 4.0, nk, bm, 1.0, 0.0); gSet(GM1, 1.0, pR, gxR, gyR, 4.0, nk, bm, wv, 0.0);
  gSet(GM5, 5.0, p, cDx, cDy, 4.0, nk, bm, max(fm, 0.6 * smoothstep(0.45, 0.75, n3)), 0.0);
  gSet(GM7, 7.0, pR, gxR, gyR, 4.0, nk, bm, dryM * (0.55 + 0.35 * fm) * (1.0 - 0.6 * pm), 0.0);
  gSet(GM4, 4.0, p, cDx, cDy, 4.0, nk, bm, 0.5 * smoothstep(0.35, 0.75, n3) * (1.0 - fm), 0.0);
  if (crop > 0.0) { float cs = fh < 0.55 ? 10.0 : fh < 0.78 ? 8.0 : 11.0; vec3 csm = fh < 0.55 ? GM10 : fh < 0.78 ? GM8 : GM11; bool rz = fh2 <= 0.5;
    gSet(csm, cs, rz ? p.yx : p, rz ? cDx.yx : cDx, rz ? cDy.yx : cDy, 4.0, nk, bm, fm * crop, 0.0); }
  gSet(GM9 * 0.85, 9.0, pR, gxR, gyR, 4.0, nk, bm, max(bare * (0.75 + 0.25 * ind), ind * (0.45 + 0.55 * n1)), 0.0);
  gSet(GM12, 12.0, p, cDx, cDy, 4.0, nk, bm, pm * smoothstep(0.38, 0.72, n3 * 0.4 + n1 * 0.35 + nD * 0.35), 0.0);
  { float l0 = max(dot(LM, vec3(0.3, 0.59, 0.11)), 0.004), l1 = max(dot(LR, vec3(0.3, 0.59, 0.11)), 0.002); col = LR * clamp(pow(l1 / l0, 0.35 * nk), 0.6, 1.6) * 0.8; col = mix(vec3(dot(col, vec3(0.3, 0.59, 0.11))), col, 0.85) * mix(1.0, 0.82, pm); }
  ${DNM('LN', 'LS', '1.0')}
  if (ind > 0.0) { pBeg(); pSet(PM11, 11.0, p, cDx, cDy, 4.0, nk, 1.0); pSet(PM12, 12.0, pR, gxR, gyR, 4.0, nk, wv); float w = hbw(ind * smoothstep(0.35, 0.65, n3 * 0.5 + nD * 0.5), LH, PH); col = mix(col, PC * 0.4, w); ${DNM('PN', 'PS', 'w')} }
  col *= mix(vec3(1.0), vec3(0.74, 0.77, 0.82), ind);
  if (pv > 0.0) { pBeg(); pSet(PM9, 9.0, p, cDx, cDy, 4.0, nk, 1.0); pSet(PM10, 10.0, pR, gxR, gyR, 4.0, nk, wv); pSet(PM13, 13.0, p, cDx, cDy, 4.0, nk, smoothstep(0.5, 0.7, n3)); pSet(PM4, 4.0, p, cDx, cDy, 4.0, nk, smoothstep(0.5, 0.6, vns(p / 38.0 + 3.0)));
    col = mix(col, PC * 0.42, pv); ${DNM('PN', 'PS', 'pv * nk')} }
  if (uTexOn > 0.5) { float L5 = dot(crA(pR * 0.83, 31.0), vec3(0.3, 0.59, 0.11)); col *= mix(1.0, L5, 0.34 * gm * smoothstep(0.04, 0.2, px) * (1.0 - smoothstep(2.0, 7.0, px))); float L3 = dot(crA(p, 260.0), vec3(0.3, 0.59, 0.11)), L4 = dot(crA(p * 1.37 + 91.0, 75.0), vec3(0.3, 0.59, 0.11)); col *= mix(1.0, L3, 0.4 * gm) * mix(1.0, L4, 0.5 * gm * (1.0 - smoothstep(6.0, 20.0, px))); } // снимок с высоты - только яркость
  // крупные пятна 400-900 м: влажнее / суше - едины для всех зон
  col *= mix(vec3(0.95, 0.95, 0.74), vec3(1.14, 1.02, 0.84), smoothstep(0.3, 0.7, nE * 0.6 + vns(p / 900.0 + 57.0) * 0.4));
` : `  vec3 col = diffuseColor.rgb;
  // шум в двух масштабах: пятна покрытия, неровный тон
  float n1 = vns(vWp.xz / 23.0), n2 = vns(vWp.xz / 190.0 + 7.0);
  // шумы слоёв - до ветвлений (шум - текстурой с мипмапами): варианты плиток, цветущий луг, выгоревшие пятна
  float wv = smoothstep(0.35, 0.65, n1 * 0.7 + vns(vWp.xz / 7.0 + 3.1) * 0.3), n3 = vns(vWp.xz / 61.0 + 13.0), flower = smoothstep(0.62, 0.78, vns(vWp.xz / 90.0 + 4.0));
  col *= 0.86 + 0.28 * n2;
  col *= mix(1.0, 0.9 + 0.2 * n1, fine);
  // свои плитки вблизи (до ~8 пикселей на плитку 4 м - дальше их средний цвет); пока атласы не пришли - только средние (uGOn = 0)
  float nk = uGOn * (1.0 - smoothstep(0.06, 0.3, px)); gNear = ${SCAN ? 'nk * (1.0 - smoothstep(0.008, 0.022, px))' : '0.0'};
  float gm = clamp((col.g - col.b) * 14.0, 0.0, 1.0); // зелень (трава, поля) - иначе бетон и грунт
  // макро-пятна (256 и 173 м, второй слой повёрнут на 37°): тон земли, выгоревшее (альфа)
  vec4 mt1 = texture2D(tMT, vWp.xz / 256.0), mt2 = texture2D(tMT, mat2(0.7986, 0.6018, -0.6018, 0.7986) * vWp.xz / 173.0 + 0.37);
  vec3 tone = mix(vec3(1.0), mt1.rgb * 1.992, 0.7) * mix(vec3(1.0), mt2.rgb * 1.992, 0.5); float burnt = mt1.a * uGOn;
  // ── поля за городом (альфа зоны 0): лоскуты 300-500 м - пастбище, пашня, пшеница, всходы рядами; межи - грунтовки
  float fm = 1.0 - smoothstep(0.0, 0.025, urb), fh = 0.0, fh2 = 0.0, fEdge = 0.0; vec2 fq = vec2(0.0); bool fAlongX = false;
  if (fm > 0.001) {
    vec2 jit = vec2(vns(vWp.xz / 900.0 + 11.0), vns(vWp.xz / 900.0 + 23.0)) * 0.45;
    vec2 pc = vWp.xz / vec2(430.0, 340.0) + jit, pid = floor(pc), pf = fract(pc);
    fh = hsh(pid * 1.7 + 3.1); fh2 = hsh(pid * 5.3 + 1.9); float along = fh2 > 0.5 ? vWp.x : vWp.z;
    vec3 crop = fh < 0.3 ? vec3(0.38, 0.43, 0.25) : fh < 0.55 ? vec3(0.4, 0.34, 0.26) : fh < 0.78 ? vec3(0.5, 0.47, 0.33) : vec3(0.29, 0.36, 0.2); // приглушённо: пастбище, пашня, пшеница, всходы
    float plough = step(0.3, fh) * step(fh, 0.55);
    crop = srgb(crop) * (0.88 + 0.24 * hsh(pid * 9.1 + 0.3)) * (0.92 + 0.16 * vns(vWp.xz / 60.0));
    float rows = (fh > 0.55 || plough > 0.5) ? 1.0 - (1.0 - smoothstep(0.25, 0.9, px)) * (1.0 - nk) * 0.16 * (0.5 + 0.5 * sin(along * 1.2)) : 1.0; // борозды и рядки вдали (вблизи - плитка)
    vec2 ed = min(pf, 1.0 - pf) * vec2(430.0, 340.0); fAlongX = ed.y < ed.x; float edge = 1.0 - smoothstep(2.0, 6.0 + px, min(ed.x, ed.y)); // межа / полевая дорога
    // полевая грунтовка по меже: плитка - колеи вдоль её оси (x = 2 м), поперёк - расстояние до межи
    fq = fAlongX ? vec2((pf.y < 0.5 ? ed.y : -ed.y) + 2.0, vWp.x) : vec2((pf.x < 0.5 ? ed.x : -ed.x) + 2.0, vWp.z); fEdge = (1.0 - smoothstep(1.7, 2.3, abs(fq.x - 2.0))) * fm;
    crop *= rows * (1.0 - 0.32 * edge * (1.0 - fEdge));
    col = mix(col, crop, fm * 0.7);
  }
  // ── снимок с высоты (тайл 260 м) - дальний план зелени; свои плитки травы, лугов, полей - слоями по высоте плиток (газон 1-2, выгоревший газон, луг,
  //    цветущий луг, пашня / стерня / всходы, сухая трава по макро-пятнам, подстилка в парках); средний масштаб (24 м) - крупный рисунок газона до ~6 м на точку
  float dryM = ${ALT ? 'smoothstep(0.58, 0.8, vns((vWp.xz + 160.0 * vec2(vns(vWp.xz / 700.0 + 2.0), vns(vWp.xz / 700.0 + 9.0))) / 230.0 + 7.0) * 0.65 + vns(vWp.xz / 47.0 + 3.0) * 0.35)' : LOOK ? 'smoothstep(0.5, 0.72, n2 * 0.6 + vns(vWp.xz / 55.0 + 3.0) * 0.4)' : 'smoothstep(0.55, 0.75, n2)'};
  float pm = smoothstep(0.07, 0.11, urb) * (1.0 - smoothstep(0.16, 0.24, urb)); // парк, перелесок - лесная подстилка
  if (uTexOn > 0.5) {
    if (gm > 0.0 || uLazy < 0.5) col *= mix(vec3(1.0), crA(vWp.xz, 260.0), ${LOOK ? '0.75' : '0.4'} * gm); // снимок с высоты - на зелени
    col *= mix(1.0, dot(crA(vWp.xz * 1.37 + 91.0, 75.0), vec3(0.3, 0.59, 0.11)), 0.3 * gm * (1.0 - smoothstep(6.0, 20.0, px))); // только яркость: в снимке есть крыши и дороги - их оттенок пятнами не нужен // и мельче (75 м) - пятна на средней дальности, между плиткой вблизи и макро-пятнами
  }
  { float pn = vns(vWp.xz / 45.0 + 17.0) * 0.7 + vns(vWp.xz / 11.0) * 0.3; // пятна: тёмная трава ↔ бурая подстилка под кронами
    col = mix(col, mix(srgb(vec3(0.24, 0.31, 0.15)), GM12 * 0.85, smoothstep(0.35, 0.7, pn)), pm * gm * 0.75); }
  if (gm > 0.0) {
    vec3 bm = mix(GM0, GM5, fm); vec2 p = vWp.xz; LR = vec3(1.0); LH = 0.5; LN = vec2(0.5);
    // второй вариант газона и луга - повёрнут на 37° и сдвинут: периоды двух плиток не совпадают, повтор 4 м вдали не складывается в полосы
    mat2 rot = mat2(0.7986, 0.6018, -0.6018, 0.7986); vec2 pR = rot * p + 17.3, gxR = rot * cDx, gyR = rot * cDy;
    float ng = nk * (1.0 - smoothstep(0.1, 0.22, px)); // трава вблизи - до ~20 пикселей на плитку (дальше её мелкий рисунок - только рябь)
    gSet(GM0, 0.0, p, cDx, cDy, 4.0, ng, bm, 1.0, 0.0);
    gSet(GM1, 1.0, pR, gxR, gyR, 4.0, ng, bm, wv * (1.0 - fm), 0.0);
    gSet(GM2, 2.0, p, cDx, cDy, 4.0, ng, bm, dryM * (1.0 - fm), 0.0);
    gSet(GM5, 5.0, p, cDx, cDy, 4.0, ng, bm, fm, 0.0);
    gSet(GM6, 6.0, pR, gxR, gyR, 4.0, ng, bm, fm * flower, 0.0);
    if (fh >= 0.3) { float cs = fh < 0.55 ? 10.0 : fh < 0.78 ? 8.0 : 11.0; vec3 csm = fh < 0.55 ? GM10 : fh < 0.78 ? GM8 : GM11; bool rz = fh2 <= 0.5 && cs != 8.0; // борозды плитки - вдоль Y: поле «поперёк» - повернуть
      gSet(csm, cs, rz ? p.yx : p, rz ? cDx.yx : cDx, rz ? cDy.yx : cDy, 4.0, ng, bm, fm, 1.0); }
    gSet(GM7, 7.0, p, cDx, cDy, 4.0, ng, bm, max(dryM * fm * 0.8, smoothstep(0.6, 0.95, burnt) * 0.3 * (1.0 - pm)), 0.0);
    gSet(GM12, 12.0, p, cDx, cDy, 4.0, ng, bm, pm, 1.0);
    col *= mix(vec3(1.0), clamp(LR, 0.25, 2.6), gm);
    ${SCAN ? DNM('LN', 'LS', 'gm * ng') : 'col *= mix(1.0, reliefN(LN, uSun), 0.85 * gm * ng);'}
    col *= mix(1.0, 0.82, pm * gm); // под деревьями темнее
    if (uGCR > 0.0) { // за радиусом покрова (groundCover) - зерно травы в цветах её пучков: даль не становится гладкой «пустой» заливкой
      float fk = smoothstep(uGCR * 0.4, uGCR * 0.85, dist) * (1.0 - smoothstep(0.2, 0.8, px)) * (1.0 - 0.5 * pm) * (1.0 - nk * 0.6);
      vec3 tuft = mix(vec3(0.8, 0.88, 0.68), vec3(1.15, 1.08, 0.82), smoothstep(0.35, 0.75, n3)); // зелёные и сухие пучки
      col *= mix(vec3(1.0), tuft * (0.8 + 0.4 * wv), 0.5 * fk);
    }
    ${LOOK ? 'col *= mix(vec3(1.0), vec3(1.06, 1.0, 0.84), gm * 0.6); // трава - оливковее, не «газонная»' : ''}
  }
`}
  col *= mix(vec3(1.0), tone, 0.35 + 0.65 * gm); // макро-пятна: на зелени - полностью, на бетоне и грунте - слабее
  ${ALT ? `{ // ?alt=1: выгоревшее - охра, не белое; крупные пятна цвета 2-5 км (зеленее / суше / бурее) - сильнее вдали, вблизи почти не видно
    col *= mix(vec3(1.0), vec3(0.8, 0.76, 0.66), dryM * gm * 0.7);
    float L1 = vns((vWp.xz + 900.0 * vec2(vns(vWp.xz / 6000.0 + 1.0), vns(vWp.xz / 6000.0 + 4.0))) / 2300.0 + 31.0), L2 = vns(vWp.xz / 5200.0 + 57.0), L3 = vns(vWp.xz / 900.0 + 13.0);
    float fw = 0.45 + 0.55 * smoothstep(0.6, 4.0, px);
    vec3 hue = mix(vec3(0.84, 0.95, 0.78), vec3(1.1, 1.0, 0.82), smoothstep(0.3, 0.7, L1)) * mix(vec3(1.0), vec3(1.04, 0.96, 0.88), smoothstep(0.55, 0.85, L3) * 0.6);
    col *= mix(vec3(1.0), hue * (0.86 + 0.26 * L2), fw * (0.35 + 0.65 * gm));
    float lum = dot(col, vec3(0.3, 0.59, 0.11)); col = mix(col, vec3(lum), 0.18 * gm * fw) * mix(1.0, 0.86, gm * fw) * mix(1.0, 0.9, (1.0 - gm) * fw); // бетон и грунт вдали - тоже не выбеленные
    // микрорельеф светом (не геометрией): бугры 35 и 140 м - скаты к солнцу светлее, от солнца темнее; иначе вся земля ровного тона, «глянец»
    vec3 sN = normalize(uSun); float bmp = 0.0; vec2 bd = vec2(0.0);
    for (int k = 0; k < 2; k++) { float sc = k == 0 ? 140.0 : 35.0; vec2 q = vWp.xz / sc + float(k) * 37.0; float h0 = vns(q);
      bd += vec2(h0 - vns(q + vec2(0.2, 0.0)), h0 - vns(q + vec2(0.0, 0.2))) * (k == 0 ? 2.2 : 1.0); }
    vec3 bn = normalize(vec3(bd.x, 0.35, bd.y)); float lf = clamp(dot(bn, sN) / max(sN.y, 0.25), 0.55, 1.35);
    col *= mix(1.0, lf, 0.55 * (0.3 + 0.7 * gm)); } // без множителя расстояния: запечённая даль (dist = 1e5) - тот же расчёт, иначе шов` : ''}
  // полевая грунтовка по меже (колеи вдоль межи)
  if (fEdge > 0.0) { pBeg(); pSet(PM12, 12.0, fq, fAlongX ? cDx.yx : cDx, fAlongX ? cDy.yx : cDy, 4.0, nk, 1.0); col = mix(col, PC * 0.8 * ${RLF('fAlongX ? vec2(1.0) - PN.yx : PN', '0.8 * nk')}, fEdge * 0.85); ${DNM('fAlongX ? vec2(1.0) - PN.yx : PN', 'PS', 'fEdge * 0.85 * nk')} }
  ${RELIEF ? `{ // рельеф: на склоне - суглинок, на крутом - лёсс обрыва (трёхпроекционно: на изгибах без растяжки и «ёлочки»), пятнами и прожилками вниз по склону
    vec3 nW = ${SCAN && !bk ? 'normalize(vGN)' : 'normalize(cross(c3x, c3y))'}; float ny = abs(nW.y);
    float sk = ${SCAN ? 'smoothstep(0.985, 0.9, ny + (vns(vWp.xz / 33.0 + 5.0) * 0.6 + vns(vWp.xz / 9.0) * 0.4 - 0.5) * 0.05) * (0.15 + 0.85 * smoothstep(0.35, 0.65, vns(vWp.xz / 70.0 + 2.0) * 0.55 + vns(vWp.xz / 17.0 + 8.0) * 0.45))' : 'smoothstep(0.985, 0.93, ny)'} * (0.55 + 0.45 * smoothstep(0.3, 0.7, vns(vWp.xz / 14.0 + 21.0) * 0.6 + vns(vWp.xz / 4.0) * 0.4)), steep = 1.0 - smoothstep(0.8, 0.88, ny);
    ${ALT ? `{ float rg = vns(vWp.xz / 260.0 + 41.0) * 0.6 + vns(vWp.xz / 70.0 + 3.0) * 0.4; // ?alt=1: склон местами зарос, край полосы рваный
      sk *= mix(0.2, 1.0, smoothstep(0.3, 0.62, rg)); sk = smoothstep(0.08, 0.6, sk) * sk; }` : ''}
    if (sk > 0.0) {
      vec3 soil = gAbs(GM9, 9.0, vWp.xz, cDx, cDy, 4.0, nk);
      if (steep > 0.0) { vec3 cl = GM13;
        if (nk > 0.0) { vec3 bw = pow(abs(nW), vec3(4.0)); bw /= bw.x + bw.y + bw.z; float k = 0.21875 / 4.0;
          vec3 t3 = srgb(TXG(tGC, atUV(13.0, vWp.zy, 4.0), gc(c3x.zy * k), gc(c3y.zy * k)).rgb) * bw.x + srgb(TXG(tGC, atUV(13.0, vWp.xz, 4.0), gc(c3x.xz * k), gc(c3y.xz * k)).rgb) * bw.y + srgb(TXG(tGC, atUV(13.0, vWp.xy, 4.0), gc(c3x.xy * k), gc(c3y.xy * k)).rgb) * bw.z;
          cl = mix(cl, t3, nk); }
        soil = mix(soil, cl * 0.8, steep); }
      col = mix(col, soil * 0.72, sk * 0.75 * smoothstep(0.0, 0.3, gm + (1.0 - urb))); }
  }` : ''}
  // ── берег реки: песок и ил за городом, в городе - набережная; полоса ~60 м от уреза, у воды - мокрый ил
  float rd = abs(vWp.x - riverX(vWp.z)) - ${(CITY.RIVER_W / 2).toFixed(1)};
  float bank = (1.0 - smoothstep(30.0, ${ALT ? 'max(45.0, 75.0 + 0.5 * vns(vWp.xz / 40.0) * 40.0 + 140.0 * (vns(vWp.xz / 420.0 + 61.0) - 0.4))' : '75.0 + 0.5 * vns(vWp.xz / 40.0) * 40.0'}, rd)) * step(-60.0, rd), cityK = max(smoothstep(0.22, 0.42, urb), 1.0 - smoothstep(${(CITY.R * 0.55).toFixed(1)}, ${(CITY.R * 0.75).toFixed(1)}, length(vWp.xz)));
  float bnMud = smoothstep(0.45, 0.7, vns(vWp.xz / 70.0 + 5.0)), bnWet = 1.0 - smoothstep(0.0, 14.0, rd);
  if (bank > 0.001) {
    vec3 b = cityK < 1.0 ? mix(gAbs(GM14, 14.0, vWp.xz, cDx, cDy, 4.0, nk) * 0.62, gAbs(GM15, 15.0, vWp.xz, cDx, cDy, 4.0, nk), max(bnMud, bnWet)) : vec3(0.0);
    if (cityK > 0.0) { pBeg(); pSet(PM14, 14.0, vWp.zx, cDx.yx, cDy.yx, 4.0, nk, 1.0); b = mix(b, PC * 0.6 * ${RLF('vec2(1.0) - PN.yx', '0.7 * nk')}, cityK); ${DNM('vec2(1.0) - PN.yx', 'PS', 'cityK * bank * nk')} } // в городе - набережная (плиты вдоль реки)
    col = mix(col, b, bank * 0.9);
  }
  // бетон и площадки (где нет зелени): плитка относительно своего среднего - оттенок района остаётся; монолит, старый бетон, промзона - пятнами
  ${SCAN ? '' : `  if (gm < 1.0) { pBeg(); pSet(PM9, 9.0, vWp.xz, cDx, cDy, 4.0, nk, 1.0); pSet(PM10, 10.0, vWp.xz, cDx, cDy, 4.0, nk, wv); pSet(PM13, 13.0, vWp.xz, cDx, cDy, 4.0, nk, smoothstep(0.55, 0.75, n3));
    col *= mix(vec3(1.0), clamp(PC / max(PM, vec3(0.004)), 0.3, 2.5) * ${RLF('PN', '0.7 * nk')}, 1.0 - gm); ${DNM('PN', 'PS', '(1.0 - gm) * nk')} }`}
  ${LOOK ? `{ // бетон и грунт: крупные пятна грязи, потёки, светлые выгоревшие места (иначе ровная «пластиковая» заливка)
    float gr = vns(vWp.xz / 31.0 + 13.0) * 0.6 + vns(vWp.xz / 8.0 + 4.0) * 0.4, gr2 = vns(vWp.xz / 140.0 + 29.0);
    col *= mix(1.0, (0.62 + 0.62 * gr) * (0.85 + 0.3 * gr2), (1.0 - gm) * 0.85); col *= mix(vec3(1.0), vec3(1.06, 1.0, 0.9), (1.0 - gm) * smoothstep(0.55, 0.8, gr2)); }` : ''}
  col = mix(vec3(dot(col, vec3(0.3, 0.59, 0.11))), col, ${LOOK ? '0.9' : '0.82'});${SCAN ? ' col = mix(col, vec3(dot(col, vec3(0.3, 0.59, 0.11))) * vec3(1.12, 1.0, 0.8), 0.6 * smoothstep(1.15, 1.8, col.r / max(col.g, 0.004)));' : ''} /* рыжая глина - спокойнее */ // земля чуть спокойнее по цвету (без «кислотной» зелени)
  float yardN = vns(vWp.xz / 38.0 + 3.0), wornN = vns(vWp.xz / 3.0 + 9.0); // шумы - до ветвлений
  if (${SCAN ? 'false' : 'urb > 0.01'}) {
    // дворы: газоны с вытоптанными тропами в жилых кварталах, дворовый асфальт в мощёных
    float yard = smoothstep(0.42, 0.62, yardN), wy = yard * 0.75 * smoothstep(0.1, 0.4, urb);
    if (wy > 0.0) {
      vec3 yc;
      if (urb > 0.75) { LR = vec3(1.0); LH = 0.5; LN = vec2(0.5); vec3 bm = GM0; gSet(GM0, 0.0, vWp.xz, cDx, cDy, 4.0, nk, bm, 1.0, 0.0); gSet(GM2, 2.0, vWp.xz, cDx, cDy, 4.0, nk, bm, wv, 0.0); gSet(GM3, 3.0, vWp.xz, cDx, cDy, 4.0, nk, bm, smoothstep(0.6, 0.8, n3), 0.0);
        yc = ${LOOK ? 'col * vec3(0.78, 0.86, 0.72) * mix(vec3(1.0), clamp(LR, 0.4, 2.0), 0.6)' : 'bm * clamp(LR, 0.25, 2.6) * 0.75 * (0.85 + 0.3 * n1)'} * ${RLF('LN', '0.85 * nk')}; ${DNM('LN', 'LS', 'wy * nk')} }
      else { pBeg(); pSet(PM4, 4.0, vWp.xz, cDx, cDy, 4.0, nk, 1.0); pSet(PM5, 5.0, vWp.xz, cDx, cDy, 4.0, nk, wv); yc = PC * 0.6 * ${RLF('PN', '0.8 * nk')}; ${DNM('PN', 'PS', 'wy * nk')} }
      col = mix(col, yc, wy);
    }
  }
  ${GK < 1 ? `{ float gl = dot(col, vec3(0.2126, 0.7152, 0.0722)); col = mix(col, mix(vec3(gl), col, 0.94) * ${GK.toFixed(3)} / (1.0 + max(gl - 0.09, 0.0) * 6.0), uGK); } // земля и дворы на солнце выгорали: серый 0,165 давал на экране ~198 из 255` : ''}
  {
    // дороги - по сетке отрезков (city.js): улица кончается на перекрёстке, за городом - узкая трасса с обочиной
    float ox, hwx, avx, oz, hwz, avz;
    roadAt(vWp.x, ox, hwx, avx); roadAt(vWp.z, oz, hwz, avz);
    float tX = roadSeg(floor(vWp.x / ${G} + 0.5), floor(vWp.z / ${G})).r, tZ = roadSeg(floor(vWp.x / ${G}), floor(vWp.z / ${G} + 0.5)).g;
    float cX = step(0.75, tX), cZ = step(0.75, tZ), eX = step(0.25, tX), eZ = step(0.25, tZ); // c - улица, e - есть дорога
    float hx0 = hwx, hz0 = hwz;
    hwx = mix(${HR}, hwx, cX); hwz = mix(${HR}, hwz, cZ); avx *= cX; avz *= cZ;
    float ax = abs(ox), az = abs(oz);
    float onX = eX * (1.0 - smoothstep(hwx - px, hwx + px, ax));   // проезжая часть дороги, идущей вдоль z
    float onZ = eZ * (1.0 - smoothstep(hwz - px, hwz + px, az));   // … вдоль x
    float road = max(onX, onZ);
    float swX = 1.0 - smoothstep(hwx + 4.5 - px, hwx + 4.5 + px, ax), swZ = 1.0 - smoothstep(hwz + 4.5 - px, hwz + 4.5 + px, az);
    float walk = max(swX * cX, swZ * cZ) * (1.0 - road);
    float shX = 1.0 - smoothstep(hwx + 2.0 - px, hwx + 3.5 + px, ax), shZ = 1.0 - smoothstep(hwz + 2.0 - px, hwz + 3.5 + px, az);
    float shoulder = max(shX * eX * (1.0 - cX), shZ * eZ * (1.0 - cZ)) * (1.0 - road) * (1.0 - walk);
    // ось вдоль дороги: плитки - вдоль Y (колея, продольные трещины), у дороги вдоль X - повёрнуты
    bool alX = onZ > onX || (road <= 0.0 && min(az, 99.0) < ax); vec2 pr = alX ? vWp.zx : vWp.xz, gxr = alX ? cDx.yx : cDx, gyr = alX ? cDy.yx : cDy;
    float st = alX ? cZ : cX, ave = alX ? avz : avx;
    // асфальт: улица - старый (два варианта), проспект - 2-3 года, трасса - разбитый пятнами по старому
    vec3 asph = vec3(0.0); vec2 aN = vec2(0.5);
    if (road > 0.0) {
      pBeg(); pSet(PM0, 0.0, pr, gxr, gyr, 4.0, nk, 1.0); pSet(PM1, 1.0, pr, gxr, gyr, 4.0, nk, max(wv, 1.0 - st)); pSet(PM2, 2.0, pr, gxr, gyr, 4.0, nk, ave);
      pSet(PM3, 3.0, pr, gxr, gyr, 4.0, nk, (1.0 - st) * smoothstep(0.45, 0.7, n3));
      ${SCAN ? 'asph = PC / max(dot(PM, vec3(0.333)), 0.01) * mix(vec3(0.074, 0.072, 0.069), vec3(0.092, 0.087, 0.08), 1.0 - st) * (0.85 + 0.3 * n1);' : 'asph = mix(vec3(dot(PC, vec3(0.3, 0.59, 0.11))), PC, 0.5) * vec3(0.84, 0.9, 1.0) * mix(0.27, 0.33, 1.0 - st) * (0.9 + 0.2 * n1);'} aN = PN; // серее и темнее плитки: под солнцем игры она почти белая
      // наклейки износа: два слоя ячеек вдоль дороги (у каждого участка свой набор) - трещины, заплаты, люки, лужи, на трассе - выбоины и колея
      if (nk > 0.0 && road > 0.5) {
        float li = alX ? floor(vWp.z / ${G} + 0.5) : floor(vWp.x / ${G} + 0.5), hwR = alX ? hwz : hwx;
        vec2 q = vec2(alX ? oz : ox, alX ? vWp.x : vWp.z), qx = vec2(gxr.x, gxr.y), qy = vec2(gyr.x, gyr.y);
        dN = vec4(0.5); vec4 d1 = decal(q, li, 9.0, 0.0, hwR, 1.0 - st, qx, qy, 0.6); vec4 n1d = dN;
        dN = vec4(0.5); vec4 d2 = decal(q, li + 0.5, 14.0, 4.3, hwR, 1.0 - st, qx, qy, 0.45); vec4 n2d = dN;
        float a1 = d1.a * nk, a2 = d2.a * nk;
        float kA = mix(0.27, 0.33, 1.0 - st); asph = mix(asph, d1.rgb * kA, a1); aN = mix(aN, n1d.rg, a1);
        asph = mix(asph, d2.rgb * kA, a2); aN = mix(aN, n2d.rg, a2);
      }
      asph *= ${RLF('alX ? vec2(1.0) - aN.yx : aN', '0.8 * nk')}; ${SCAN ? 'float aS = PS, aH = PH;' : ''}
      ${SCAN ? DNM('mix(vec2(0.5), alX ? vec2(1.0) - aN.yx : aN, 0.6)', 'mix(1.0, aS, 0.3)', 'road * nk') + ' gSpec = road * (0.25 + 0.75 * aH) * (0.35 + 0.65 * nk);' : ''}
    }
    if (walk > 0.0) { // тротуар: плиты 500 × 500, в центре (мощёные районы) - «кирпичик» и брусчатка пятнами
      pBeg(); pSet(PM6, 6.0, pr, gxr, gyr, 4.0, nk, 1.0); float cbd = 1.0 - smoothstep(0.6, 0.75, urb); pSet(PM7, 7.0, pr, gxr, gyr, 4.0, nk, cbd * wv); pSet(PM8, 8.0, pr, gxr, gyr, 4.0, nk, cbd * smoothstep(0.55, 0.7, n3));
      col = mix(col, PC * 0.45 * (0.9 + 0.2 * n1) * ${RLF('alX ? vec2(1.0) - PN.yx : PN', '0.8 * nk')}, walk); ${DNM('alX ? vec2(1.0) - PN.yx : PN', 'PS', 'walk * nk')} }
    if (shoulder > 0.0) { pBeg(); pSet(PM11, 11.0, pr, gxr, gyr, 4.0, nk, 1.0); col = mix(col, PC * 0.42 * (0.85 + 0.3 * n1) * ${RLF('alX ? vec2(1.0) - PN.yx : PN', '0.8 * nk')}, shoulder * 0.8); ${DNM('alX ? vec2(1.0) - PN.yx : PN', 'PS', 'shoulder * 0.8 * nk')} } // обочина - гравий с песком
    { // вытоптанные обочины: полоса вытоптанного газона у дорог (на зелени), край неровный
      float vg = max(eX * (1.0 - smoothstep(hwx + 3.0, hwx + 9.0 + 9.0 * n1, ax)), eZ * (1.0 - smoothstep(hwz + 3.0, hwz + 9.0 + 9.0 * n1, az))) * (1.0 - road) * (1.0 - walk) * gm * ${LOOK ? '0.6' : '0.25'};
      if (vg > 0.0) col = mix(col, gAbs(GM4, 4.0, pr, gxr, gyr, 4.0, nk) * 0.8 * (0.8 + 0.4 * n1), vg); }
    col = mix(col, asph, road);
    // разметка (пока линия толще ~пикселя)
    float mk = (1.0 - smoothstep(0.25, 0.9, px)) * road;
    if (mk > 0.0 || uLazy < 0.5) { // разметка и «зебры» - только пока видны (вдали - без 4 выборок сетки дорог)
    float inX = onX * (1.0 - onZ), inZ = onZ * (1.0 - onX);              // не на перекрёстке
    float lane = 0.0;
    // осевая: у проспектов - двойная сплошная и пунктир полос, у улиц - пунктир
    lane += inX * (avx > 0.5 ? step(abs(ax - 0.3), 0.12) + step(abs(ax - 7.5), 0.1) * step(fract(vWp.z / 12.0), 0.4) : step(ax, 0.1) * step(fract(vWp.z / 9.0), 0.5));
    lane += inZ * (avz > 0.5 ? step(abs(az - 0.3), 0.12) + step(abs(az - 7.5), 0.1) * step(fract(vWp.x / 12.0), 0.4) : step(az, 0.1) * step(fract(vWp.x / 9.0), 0.5));
    // загородная трасса: сплошные края
    lane += inX * (1.0 - cX) * step(abs(ax - hwx + 0.5), 0.1) + inZ * (1.0 - cZ) * step(abs(az - hwz + 0.5), 0.1);
    // «зебры» у перекрёстков - только где поперечная улица есть
    float ix = floor(vWp.x / ${G} + 0.5), jz = floor(vWp.z / ${G} + 0.5);
    float nZ = step(0.75, max(roadSeg(ix - 1.0, jz).g, roadSeg(ix, jz).g)), nX = step(0.75, max(roadSeg(ix, jz - 1.0).r, roadSeg(ix, jz).r));
    lane += onX * cX * nZ * step(hz0 + 0.8, az) * step(az, hz0 + 4.0) * step(0.5, fract(vWp.x / 1.1)) * step(ax, hwx - 1.0);
    lane += onZ * cZ * nX * step(hx0 + 0.8, ax) * step(ax, hx0 + 4.0) * step(0.5, fract(vWp.z / 1.1)) * step(az, hwz - 1.0);
    // краска стёрта пятнами (в колее - сильнее)
    col = mix(col, vec3(0.42) * (0.85 + 0.15 * wv), min(lane, 1.0) * mk * (0.55 + 0.45 * smoothstep(0.25, 0.6, wornN)));
    }
  }
  // ВПП аэропорта: плиты ПАГ-14 6 × 2 м вдоль полосы, осевая, торцевые «клавиши»
  vec2 ra = abs(vWp.xz - uAir.xy);
  float rwy = (1.0 - smoothstep(uAir.z - px, uAir.z + px, ra.x)) * (1.0 - smoothstep(uAir.w - px, uAir.w + px, ra.y));
  float cl = step(ra.y, 0.7) * step(0.5, fract(vWp.x / 50.0)) * step(ra.x, uAir.z - 90.0);
  float keys = step(uAir.z - 60.0, ra.x) * step(ra.x, uAir.z - 10.0) * step(0.5, fract(ra.y / 3.0)) * step(ra.y, uAir.w - 4.0);
  if (rwy > 0.0) { pBeg(); pSet(PM15, 15.0, vWp.zx, cDx.yx, cDy.yx, 6.0, nk, 1.0); col = mix(col, PC * 0.42 * ${RLF('vec2(1.0) - PN.yx', '0.8 * nk')}, rwy); ${DNM('vec2(1.0) - PN.yx', 'PS', 'rwy * nk')} }
  col = mix(col, vec3(0.6), min(cl + keys, 1.0) * rwy * (1.0 - smoothstep(0.6, 3.0, px)));
  // затенение у домов
  float ao = texture2D(tAO, (vWp.xz + ${CITY.GH.toFixed(1)}) / ${(2 * CITY.GH).toFixed(1)}).r;
  ${bk || !SKV ? `col *= 1.0 - ${LOOK ? '0.72' : '0.55'} * ao;` : 'col *= 1.0 - 0.2 * ao; gSkyV = 1.0 - 0.75 * ao; // у домов закрыто небо: гасим рассеянный свет, а не солнце (AIRDEF_GRAPHICS.md)'}
  diffuseColor.rgb = col;`;
  if (bake) { // запечённая дальняя земля (2026-11-16, Mark: «нужна оптимизация»): дальше 1,6 км цвет от камеры не зависит - одна выборка вместо всего расчёта
    m.userData.bakeU = { ...ENV, ...TEX, ...GT, ...XU, tZone: { value: tex } }; m.userData.bakeReady = bakeReady;
    m.userData.bakeFS = 'varying vec2 vUv; uniform sampler2D tZone;\n' + HEAD + `
void main() {
  vec4 diffuseColor = texture2D(tZone, vUv); ${SCAN ? '' : 'diffuseColor.rgb = mix('}${SCAN ? '//' : ''}pow(diffuseColor.rgb * 0.9478672986 + 0.0521327014, vec3(2.4)), diffuseColor.rgb * 0.0773993808, vec3(lessThanEqual(diffuseColor.rgb, vec3(0.04045))));
` + BODY(true) + `
  gl_FragColor = vec4(sqrt(clamp(diffuseColor.rgb, 0.0, 1.0)), 0.0);
}`;
  }
  const GLUE = bake ? '#define TEXG(t, uv, gx, gy) TXG(t, uv, gx, gy)\nvec2 gDx, gDy; float gFp;\n' + bake.GLSL : '';
  // сэмплеров в программе земли с тенями - ровно 16 (предел видеочипов: Metal, iOS, ANGLE D3D): новая текстура здесь - только вместо другой
  // (ревью 2026-11-16; запас - слить tAO и tRoad в одну). Производные - до ветвления по запечённому
  const MAIN = bake ? `  ${DER} gDx = cDx; gDy = cDy; gFp = min(length(cDx), length(cDy));
  float bkK = bakeK(length(vWp - uCam), vWp.xz); vec3 bkC = bkK > 0.0 ? bakeAt(vWp.xz).rgb : vec3(0.0);
  if (bkK < 1.0) {
` + BODY(false, false) + `
  } else diffuseColor.a = 1.0;
  if (bkK > 0.0) { diffuseColor.rgb = mix(diffuseColor.rgb, bkC, bkK); gSkyV = mix(gSkyV, 1.0, bkK); }` : BODY(false);
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, ENV, TEX, GT, XU, bake ? bake.U : {});
    sh.vertexShader = 'varying vec3 vWp, vGN;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vWp = (modelMatrix * vec4(transformed, 1.0)).xyz; vGN = mat3(modelMatrix) * normal;');
    sh.fragmentShader = 'varying vec3 vGN;\n' + HEAD + ROUGH_GLSL + GLUE + groundLit(sh.fragmentShader, SCAN ? 'gMS' : '', 'gSkyV').replace('#include <shadowmap_pars_fragment>', groundShadowChunk()).replace('#include <map_fragment>', '#include <map_fragment>\n' + MAIN);
    if (SCAN) sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n  normal = normalize(normal + (viewMatrix * vec4(gDN.x, 0.0, -gDN.y, 0.0)).xyz * 0.9);').replace('float specularStrength = 0.0;', 'float specularStrength = gSpec;');
     // ?alt=1: даль дальше 6 км уходит в цвет дымки (= небо у горизонта, см. scene.fog): холмы на краю карты поднимаются в редкий воздух
     // (дымка с высотой реже) и на «Среднем» стояли сплошной полосой своего цвета; теперь растворяются силуэтом
     if (ALT) sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>', '#ifdef USE_FOG\n gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, 0.8 * smoothstep(6000.0, 15000.0, length(vFogW)));\n#endif\n#include <fog_fragment>');
  };
  return m;
}

// ═════════════ Здания ═════════════
// aKind = вид + 0,9·случайное (своё у каждого здания) + 10, если часть поднята над землёй (верхняя ступень башни)
// снег на всём, что смотрит вверх (крыши, уступы, верх объектов): поверх своего onBeforeCompile материала; включает ENV.uSnowK
export function snowify(m) {
  if (!m || m.userData.snow) return m; m.userData.snow = true;
  const prev = m.onBeforeCompile, pk = m.customProgramCacheKey(); // прежний ключ программы (у камуфляжа - свой: один код на разные схемы)
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uSnowK = ENV.uSnowK;
    sh.fragmentShader = 'uniform float uSnowK;\n' + sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  { float upv = dot(normal, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz)); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.84, 0.87, 0.92), uSnowK * smoothstep(0.45, 0.75, upv)); }`);
  };
  m.customProgramCacheKey = () => pk + 'snow';
  m.needsUpdate = true; return m;
}
// снег на своей технике зимой (Mark 2026-11-25): шапками на верхних плоскостях, припорошенные борта; пятнами по координатам модели - едет вместе с машиной. Материал - копия (в ангаре чисто)
const USNOW = new WeakMap();
export function unitSnow(m0, k = 1) {
  if (!m0 || !m0.isMeshPhongMaterial || m0.transparent) return m0; let m = USNOW.get(m0); if (m) return m;
  m = m0.clone(); const prev = m0.onBeforeCompile, ck = m0.customProgramCacheKey ? m0.customProgramCacheKey() : ''; for (const p of ['kitOrm']) if (m0[p]) m[p] = m0[p];
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(m, sh, r);
    sh.vertexShader = 'varying vec3 vSnP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vSnP = position * vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));');
    sh.fragmentShader = `varying vec3 vSnP;
float snH(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float snV(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(mix(mix(snH(i), snH(i + vec3(1, 0, 0)), f.x), mix(snH(i + vec3(0, 1, 0)), snH(i + vec3(1, 1, 0)), f.x), f.y), mix(mix(snH(i + vec3(0, 0, 1)), snH(i + vec3(1, 0, 1)), f.x), mix(snH(i + vec3(0, 1, 1)), snH(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
` + sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  { vec3 sup = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz); float up = dot(normal, sup), a = snV(vSnP * 1.1 + 3.0), b = snV(vSnP * 4.3), c = snV(vSnP * 17.0);
    float cap = smoothstep(0.5, 0.86, up + (a - 0.5) * 0.55 + (b - 0.5) * 0.3 + (c - 0.5) * 0.12) * smoothstep(0.22, 0.5, a * 0.6 + b * 0.4 + 0.12);
    float d = snV(vSnP * 46.0), dust = smoothstep(0.3, 0.95, a * 0.35 + c * 0.35 + d * 0.3 + 0.25 * up) * 0.26 * smoothstep(-0.45, 0.4, up);
    float sn = clamp(cap * 0.93 + dust, 0.0, 0.95); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.74, 0.77, 0.82) * (0.9 + 0.1 * c), sn); specularStrength *= 1.0 - 0.85 * sn; }`);
  };
  m.customProgramCacheKey = () => ck + '|usnow'; USNOW.set(m0, m); return m;
}
// ═════════════ Объект-сцена одним куском ═════════════
// Mark 2026-10-28 («займись оптимизацией»): у сцены каждая постройка, её руины и куски декора были отдельными сетками - ~37 вызовов
// отрисовки на дальнюю копию (две сцены города: 70 → 145 в обзоре). Теперь сетки склеены по материалу (ели - отдельно: зимой без снега),
// у треугольников - номер постройки: −1 декор, i - целая i-я постройка (порядок SITES = биты маски), 64 + i - её руины. Сетки склейки
// отсортированы по номеру (ranges: [номер, начало, длина] в индексе); видна целая или руины - своим индексом у копии сцены: при разрушении
// постройки он пересобирается (декор + целые + руины разбитых, siteMask), остальное видеокарта не трогает. 2026-10-29: раньше маска
// разрушений в вершинном шейдере прятала лишнее, но вершины скрытых руин считались в каждом кадре и в тенях (+30…45 тыс. треугольников
// у сцены вблизи) - теперь их в кадре нет; и материалы общие (без своего шейдера и материала тени)
const SITE_MERGED = {}; // склеенные части модели (геометрия общая у всех копий; модель склеивается один раз)
function siteMerged(name, key, make) {
  if (SITE_MERGED[name]) return SITE_MERGED[name];
  const src = make(); src.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(src.matrixWorld).invert(), idx = Object.fromEntries(Object.keys(SITES[key].b).map((b, i) => [b, i])), by = new Map();
  const top = (c) => { while (c.parent && c.parent !== src) c = c.parent; return c.name; };
  // падающий кусок (SITES fall: верх башни) - не в склейку руин: своя сетка в осях шарнира (siteInstance крутит её по кадрам)
  const F = SITES[key].fall, inFall = (c) => { for (let p = c; p && p !== src; p = p.parent) if (p.name.replace(/\.\d+$/, '') === F.node) return true; return false; };
  const hinge = F && new THREE.Matrix4().makeTranslation(-F.at[0], -F.k[0][1], -(F.at[1] + F.k[0][2])), fall = new Map();
  src.traverse((c) => {
    if (!c.isMesh || Array.isArray(c.material)) return;
    if (F && inFall(c)) { const t = c.material, k = [t.type, t.map && t.map.uuid, t.normalMap && t.normalMap.uuid, t.color && t.color.getHexString(), Object.keys(c.geometry.attributes).sort().join()].join();
      (fall.get(k) || fall.set(k, []).get(k)).push(c); return; }
    const n = top(c), r = /^b_(.+)_ruin$/.exec(n), b = !r && /^b_(.+)$/.exec(n), trees = /^deco_trees/.test(n);
    const code = r && r[1] in idx ? 64 + idx[r[1]] : b && b[1] in idx ? idx[b[1]] : -1;
    // у каждой сетки модели - свой материал (models.js), склеиваем одинаковые по виду; одинаковый набор атрибутов - иначе склейка их потеряет
    const t = c.material, mk = [t.type, t.map && t.map.uuid, t.normalMap && t.normalMap.uuid, t.alphaTest, t.transparent, t.opacity, t.vertexColors, t.side,
      t.color && t.color.getHexString(), t.specular && t.specular.getHexString(), t.shininess].join(',');
    const k = `${mk}|${trees ? 't' : ''}|${Object.entries(c.geometry.attributes).map(([a, A]) => a + A.itemSize).sort().join(',')}`;
    (by.get(k) || by.set(k, []).get(k)).push({ c, code, trees });
  });
  const parts = [...by.values()].map((L) => {
    L.sort((a, b) => a.code - b.code); // mergeLocal кладёт треугольники сеток подряд в порядке списка - по номеру постройки
    const ranges = []; let at = 0;
    for (const { c, code } of L) { const n = c.geometry.index ? c.geometry.index.count : c.geometry.attributes.position.count, q = ranges[ranges.length - 1];
      if (q && q[0] === code) q[2] += n; else ranges.push([code, at, n]); at += n; }
    return { geo: mergeLocal(L.map(({ c }) => ({ g: c.geometry, m: new THREE.Matrix4().multiplyMatrices(inv, c.matrixWorld) }))), ranges,
      mat: L[0].c.material, trees: L[0].trees, bld: L.some((q) => q.code >= 0) };
  });
  for (const L of fall.values()) parts.push({ geo: mergeLocal(L.map((c) => ({ g: c.geometry, m: new THREE.Matrix4().multiplyMatrices(hinge, new THREE.Matrix4().multiplyMatrices(inv, c.matrixWorld)) }))), mat: L[0].material, fall: true });
  // исходная модель (models.js LOADED) больше не нужна - склейка закэширована: её массивы отпустить (иначе на телефоне +10 МБ на сцену)
  src.traverse((c) => { if (!c.isMesh) return; const g = c.geometry; g.dispose(); for (const a in g.attributes) g.attributes[a].array = new g.attributes[a].array.constructor(0); if (g.index) g.index.array = new g.index.array.constructor(0); });
  return (SITE_MERGED[name] = parts);
}
// копия сцены: у частей с постройками - свой индекс (атрибуты общие), декор - общий; root.userData.siteMask(маска) - вид построек (main.js siteLook);
// падающий кусок (SITES fall) - на шарнире: постройка разбита в бою - падает за время клипа (SITE_ANIMS, main.js - тик), уже разбита - лежит
export const SITE_ANIMS = new Set();
const fallPose = (pv, F, t) => { const K = F.k; let i = 0; while (i < K.length - 2 && K[i + 1][0] <= t) i++; const a = K[i], b = K[i + 1], u = Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0])));
  pv.position.set(F.at[0], a[1] + (b[1] - a[1]) * u, F.at[1] + a[2] + (b[2] - a[2]) * u); pv.rotation.set((a[3] + (b[3] - a[3]) * u) * Math.PI / 180, 0, 0); pv.updateMatrix(); }; // дерево сцены заморожено (freezeTree) - матрицу шарнира - сами
function siteInstance(parts, cast, recv, winter, key) {
  const root = new THREE.Group(), live = [], F = SITES[key].fall, fb = F ? Object.keys(SITES[key].b).indexOf(F.b) : -1, pv = new THREE.Group(); pv.visible = false;
  if (F) { fallPose(pv, F, 0); root.add(pv); }
  for (const p of parts) {
    if (p.fall) { const m = new THREE.Mesh(p.geo, winter ? snowify(p.mat) : p.mat); m.castShadow = cast; m.receiveShadow = recv; pv.add(m); continue; }
    let geo = p.geo;
    if (p.bld) { geo = new THREE.BufferGeometry(); for (const a in p.geo.attributes) geo.setAttribute(a, p.geo.attributes[a]);
      geo.setIndex(new THREE.BufferAttribute(new p.geo.index.array.constructor(p.geo.index.count), 1)); geo.boundingSphere = p.geo.boundingSphere; }
    const m = new THREE.Mesh(geo, winter && !p.trees ? snowify(p.mat) : p.mat); // зима: снег на всё, что смотрит вверх, - кроме елей (хвоя вся «вверх» - белые призраки рядом с лесом карты)
    m.castShadow = cast; m.receiveShadow = recv; m.name = p.bld ? 'site_bld' : 'site_deco';
    if (p.bld) live.push({ m, p });
    root.add(m);
  }
  // индекс по маске: декор, целые, руины разбитых - подряд в начало буфера (тот же буфер - без новой памяти на видеокарте); пусто - без вызова отрисовки
  const fill = (mask) => {
    for (const { m, p } of live) {
      const src = p.geo.index.array, ix = m.geometry.index, dst = ix.array; let n = 0;
      for (const [code, s, c] of p.ranges) if (code < 0 || (code < 64 ? !(mask & (1 << code)) : (mask & (1 << (code - 64))) !== 0)) { dst.set(src.subarray(s, s + c), n); n += c; }
      m.geometry.setDrawRange(0, n); ix.updateRange.offset = 0; ix.updateRange.count = n; ix.needsUpdate = true; m.visible = n > 0;
    }
  };
  let last = 0, ft = -1; fill(0);
  root.userData.siteMask = (mask, now) => {
    if (mask === last) return; const was = fb >= 0 && (last & (1 << fb)) !== 0; last = mask; fill(mask);
    if (fb < 0) return; const dead = (mask & (1 << fb)) !== 0; pv.visible = dead;
    if (dead && !was) { ft = now ? 0 : F.k[F.k.length - 1][0]; fallPose(pv, F, ft); if (now) SITE_ANIMS.add(root); } // now - разбита на глазах: падает
  };
  root.userData.tick = (dt) => { ft += dt; fallPose(pv, F, ft); return ft < F.k[F.k.length - 1][0]; }; // false - упала (main.js убирает из SITE_ANIMS)
  return root;
}
// фасады вдали (2026-10-27, Mark: «давай попробуем с фасадом домов»): где окна мельче пикселя (far = 1), не считаются швы, балконы и отражение
// неба (их вклад там - 0), днём - горящие окна, без полос этажей - сами полосы; картинка та же. ?fac=0 - как раньше (сравнение)
const FAC = { value: typeof location !== 'undefined' && /[?&]fac=0/.test(location.search) ? 0 : 1 };
function buildingMaterial() {
  const m = new THREE.MeshPhongMaterial({ specular: 0x8a8a8a, shininess: 90 }); m.userData.facU = FAC; m.extensions = { derivatives: true, shaderTextureLOD: true };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, ENV, TEX, FACU, { uFac: FAC });
    sh.vertexShader = 'attribute float aKind, aMdl, aFac;\nuniform vec3 uCam, uHide; uniform float uMdl[32];\nvarying float vFac, vKind, vMdl; varying vec3 vObj, vSize, vNw, vWp;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
  // вблизи дом нарисован готовой моделью - коробку убираем за экран
  if (aMdl > 0.5 && distance(instanceMatrix[3].xz, uHide.xz) < uMdl[int(aMdl + 0.5)]) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  vWp = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz; vKind = aKind; vMdl = aMdl; vFac = aFac; vObj = position;
  vNw = normalize(mat3(instanceMatrix) * normal);
  vSize = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));`);
    sh.fragmentShader = FAC_GLSL + 'varying float vKind, vMdl; varying vec3 vObj, vSize, vNw, vWp;\nuniform vec4 uMdlCol[32], uMdlRf[32]; uniform float uFac;\nvec3 bEmis = vec3(0.0); float bSpec = 0.0;\n' + GLSL_COMMON + GLSL_TEX +
      sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  float raised = vKind >= 9.5 ? 1.0 : 0.0;
  float kf = mod(vKind, 10.0), kindF = floor(kf + 0.001), seed = fract(kf) / 0.9;
  int k = int(kindF + 0.5);
  float dist = length(vWp - uCam), px = max(0.02, dist * uPx);
  vec3 base = diffuseColor.rgb;
  if (vMdl > 0.5) { vec4 mc = uMdlCol[int(vMdl + 0.5)]; if (mc.w > 0.5) { base = mix(base, mc.rgb, 0.85); diffuseColor.rgb = base; } } // вдали - в цвет своей модели (вблизи её и видно)
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
    // первый этаж офисов и башен - сплошные витрины (у поднятых частей его нет)
    float gf = shop * (1.0 - raised) * step(y, 4.6);
    win = max(win, gf * step(0.6, y) * step(y, 4.0) * step(1.0, u) * step(u, W - 1.0));
    float r1 = hsh(vec2(col + seed * 113.0 + face * 37.0, fl + seed * 71.0)), r2 = hsh(vec2(fl * 3.1 + face, col * 1.7 + seed * 53.0));
    // переход к среднему цвету, когда окно меньше пикселя
    float far = smoothstep(0.25, 0.7, px / min(cs, fh) * 2.0);
    // фасадные детали: швы панелей, балконы, межэтажные пояса офисов, гофра складов
    float detail = 1.0; bool nearF = far < 1.0 || uFac < 0.5; // окна ещё различимы (вдали - ровная заливка, детали не нужны)
    if (!nearF) {}
    else if (k == ${KIND.PANEL}) {
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
    // окно: тёмное стекло, у части - шторы/жалюзи (светлее), у стеклянных башен - тонированное стекло
    vec3 glassC = mix(vec3(0.035, 0.045, 0.055), vec3(0.16, 0.14, 0.11), step(0.72, r1) * (1.0 - glassK));
    glassC = mix(glassC, base * 0.22 + vec3(0.01, 0.015, 0.02), glassK);
    vec3 wallC = base * detail;
    float w = mix(win, avg, far);
    if (vMdl > 0.5 && uMdlCol[int(vMdl + 0.5)].w > 1.5) { // средний цвет модели уже с окнами и затенением: стена - такая, чтобы вместе с ними вышло столько же
      float aoM = (1.0 - 0.225 * min(9.0, H) / H) * 0.97; wallC = max((base / aoM - vec3(0.06, 0.065, 0.07) * avg) / (1.0 - avg), vec3(0.01)) * detail; }
    diffuseColor.rgb = mix(mix(wallC, glassC, win), mix(wallC, glassC, avg), far) * ao;
    // издали окна уже меньше пикселя, а этажи ещё различимы - ряды окон и простенки полосами вместо ровной заливки
    // (иначе высотки Сити вдали - ровные белые и серые коробки)
    float bandK = far * (1.0 - smoothstep(0.12, 0.28, px / fh)) * step(0.01, avg) * inside; // этаж ≥ 3-4 пикс., иначе рябь
    float rowW = bandK > 0.0 || uFac < 0.5 ? smoothstep(0.45 - wh * 0.5, 0.55 - wh * 0.5, fy) * (1.0 - smoothstep(0.45 + wh * 0.5, 0.55 + wh * 0.5, fy)) : 0.0; // нужна только с весом bandK
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(wallC, glassC, rowW * min(1.0, avg * 1.6)) * ao, bandK);
    // фасады-текстуры: офисы - ленточные окна, башни - стеклянные панели, частные дома - кирпич с окнами
    // (тон - от цвета дома; тайл по размеру этажей картинки; у каждого дома свой сдвиг)
    if (uTexOn > 0.5 && (k == ${KIND.OFFICE} || k == ${KIND.GLASS} || k == ${KIND.HOUSE})) {
      vec2 tuv = vec2(u + seed * 37.0 + face * 5.0, -y);
      vec3 tc = k == ${KIND.OFFICE} ? srgb(texture2D(tOff, tuv / vec2(18.0, 33.0)).rgb) : k == ${KIND.GLASS} ? srgb(texture2D(tGls, tuv / vec2(28.0, 28.0)).rgb) : srgb(texture2D(tBrk, tuv / vec2(15.0, 18.0)).rgb);
      tc *= mix(vec3(1.0), base * 2.6, k == ${KIND.GLASS} ? 0.5 : k == ${KIND.OFFICE} ? 0.65 : 0.3); // офисы - заметно в цвет дома (светлая текстура под солнцем уходила в белое)
      if (k == ${KIND.OFFICE}) tc *= 0.82; else if (k == ${KIND.GLASS}) tc *= 0.85;
      diffuseColor.rgb = mix(diffuseColor.rgb, tc * ao, 0.85 * (1.0 - gf) * (1.0 - 0.55 * far)); // издали текстура - ровный тон, рисунок фасада важнее
    }
    // крупный рисунок фасада, читается за километры: остеклённые ленты через 3 этажа и простенки через 3 окна
    // (когда сами окна уже меньше пикселя; гаснет, пока ленты не стали мельче 3-4 пикс., - без ряби)
    float fh3 = fh * 3.0, fyM = fract(y / fh3), fuM = fract((u - mg) / (colW * 3.0));
    float macroK = far * (1.0 - smoothstep(0.15, 0.45, px / fh3)) * step(0.01, avg) * inside;
    float ribbon = macroK > 0.0 || uFac < 0.5 ? smoothstep(0.04, 0.12, fyM) * (1.0 - smoothstep(0.8, 0.88, fyM)) * smoothstep(0.03, 0.09, fuM) * (1.0 - smoothstep(0.91, 0.97, fuM)) : 0.0; // с весом macroK
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(wallC, glassC, ribbon * min(1.0, avg * 1.8)) * ao, macroK);
    // офисы и стеклянные башни - та же светлота, что у готовых моделей домов (иначе под солнцем - белые пятна среди города)
    if (k == ${KIND.OFFICE} || k == ${KIND.GLASS}) diffuseColor.rgb *= 0.78;
    // отражение неба в стекле (сильнее под острым углом) и блик солнца
    vec3 R = reflect(-V, N);
    float fres = mix(0.06, 1.0, pow(1.0 - max(dot(N, V), 0.0), 4.0));
    float rk = w * mix(0.35, 1.0, glassK) * (0.25 + 0.75 * fres);
    rk *= mix(1.0, 0.6, far) * mix(1.0, 0.45 + 0.75 * rowW, bandK) * mix(1.0, 0.35 + 0.8 * ribbon, macroK); // издали небо отражают только ряды и ленты окон - видны этажи, а не белая коробка
    // отражение неба - только вблизи и слабо: вдали высотки освещаются как готовые модели домов (солнце и небо), без своего свечения
    if (nearF) bEmis += min(skyAt(R), vec3(2.5)) * rk * (0.22 + 0.28 * glassK) * (1.0 - uNight * 0.6) * (1.0 - far);
    bSpec = w * mix(0.25, 1.0, glassK);
    // ночью - горящие окна (тёплые и холодные), витрины горят все
    if (uNight > 0.0 || uFac < 0.5) { // днём окна не горят (вклад - 0)
    float litP = smoothstep(0.3, 0.9, uNight) * uNight * (0.6 + 0.25 * glassK); // утром окна не горят, на закате - немногие
    // вдали окна горят только настоящей ночью (в сумерках готовые модели домов окнами не светятся - коробки не должны выделяться)
    float lit = mix(step(1.0 - litP, r2) * win + gf * win * uNight, avg * litP * 0.55 * mix(1.0, rowW * 1.6, bandK) * mix(1.0, ribbon * 1.4, macroK) * smoothstep(0.75, 0.95, uNight), far);
    vec3 lc = mix(vec3(1.0, 0.72, 0.4), vec3(0.75, 0.85, 1.0), step(0.7, hsh(vec2(r2, seed))));
    bEmis += lc * lit * mix(0.8 + 0.5 * r1, 0.9, far) * 1.2;
    }
  } else {
    // крыша: гравий/рубероид с пятнами, светлый парапет по краю; скатные крыши домов - полосами черепицы
    vec2 e2 = (0.5 - abs(vObj.xz)) * vSize.xz;
    float edge = min(e2.x, e2.y);
    float nn = vns(vWp.xz * 0.35 + seed * 50.0);
    float tr = uTexOn > 0.5 ? 1.0 - smoothstep(0.1, 0.8, px) : 0.0;
    if (k == ${ROOF}) diffuseColor.rgb = base * mix(0.85 + 0.15 * step(0.5, fract(y * 2.5)), dl(tRoof, vec2(vObj.x * vSize.x, vObj.z * vSize.z * 1.4) / 3.2, 0.319), tr) * (0.9 + 0.2 * nn);
    else if (k == ${KIND.WAREHOUSE}) diffuseColor.rgb = base * 0.8 * (0.85 + 0.3 * nn) * mix(1.0, dl(tIron, vec2(vObj.x * vSize.x, vObj.z * vSize.z) / 3.0, 0.208), tr); // цеха и склады - ржавый профнастил
    else diffuseColor.rgb = base * mix(0.42, 0.75, step(edge, 0.6)) * (0.85 + 0.3 * nn) * mix(1.0, dl(tConc, vWp.xz / 6.0, 0.364), tr);
    if (vMdl > 0.5 && k != ${ROOFX}) { vec4 rc = uMdlRf[int(vMdl + 0.5)]; if (rc.w > 0.5) diffuseColor.rgb = rc.rgb * (0.93 + 0.14 * nn); } // крыша - в цвет крыши своей модели
  }
${FAC_MAIN}`).replace('#include <specularmap_fragment>', '#include <specularmap_fragment>\n specularStrength = bSpec;')
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
// Импосторы деревьев (tools/airdef-trees/bake.html): каждое дерево снято с 6×6 направлений полусферы (полу-октаэдр), атлас 2×2
// вида: цвет + покрытие и нормаль + затенение кроны. В шейдере - квадрат лицом к камере, кадр по направлению взгляда
// (4 соседних кадра смешиваются), свет как у Phong (небо + солнце). city - модели ближнего кольца (дуб, липа, сосна, куст):
// вдали то же дерево, что вблизи; winter - две ели и две сосны (свои, Свои/Периферия; TREES_W - они же вблизи). Вид: [радиус описанной сферы, центр по высоте, высота]
const TREE_CAL = typeof location === 'undefined' || !/[?&]tcal=0/.test(location.search); // ?tcal=0 - прежний цвет деревьев
export const TREE_IMP = {
  city2: { G: 6, C: 4, RW: 2, tr2: 1, kA: [0.3, 0.315, 0.285], kD: [0.195, 0.21, 0.17], tint: [1, 1, 1], snow: 0, sp: [[9.49, 5.18, 10.36], [7.396, 4.76, 9.52], [8.472, 6.355, 12.71], [5.621, 3.56, 7.12], [8.385, 6.5, 13], [9.84, 5.6, 11.2], [9.35, 8.5, 17], [6.875, 5.5, 11]] }, winter2: { G: 6, C: 4, RW: 2, tr2: 1, kA: [0.235, 0.235, 0.24], kD: [0.19, 0.2, 0.21], tint: [1, 1, 1], snow: 0, sp: [[6.068, 4.655, 9.31], [5.576, 4.05, 8.1], [10.61, 8.445, 16.89], [11.805, 9.81, 19.62], [7.908, 6.2, 12.4], [8.773, 5.3, 10.6]] }, autumn2: { G: 6, C: 4, RW: 2, tr2: 1, kA: [0.33, 0.3, 0.29], kD: [0.28, 0.24, 0.19], tint: [1, 1, 1], snow: 0, sp: [[9.516, 5.18, 10.36], [7.405, 4.76, 9.52], [8.472, 6.355, 12.71], [9.836, 5.6, 11.2], [8.356, 6.5, 13], [9.96, 4.8, 9.6], [7.854, 5, 10]] },
  // kA, kD - поправка рассеянного и прямого света снимка под модель (замер tools: средний цвет кроны модели и снимка с трёх сторон, 2026-11-25; Mark: «дальние отличаются цветом»)
  city: { G: 6, kA: [2.75, 1.85, 1.55], kD: [1.8, 1.32, 1.05], tint: [0.1, 0.14, 0.085], snow: 0, sp: [[7.501, 5.18, 10.36], [7.136, 4.76, 9.52], [7.59, 6.355, 12.71], [5.169, 3.56, 7.12]] }, // свои деревья (Свои/Периферия), перепечены 2026-11-08
  winter: { G: 6, kA: [0.9, 1.08, 1.32], kD: [2.5, 2.25, 2.55], tint: [0.1, 0.13, 0.095], snow: 0.7, sp: [[6.126, 4.655, 9.31], [5.444, 4.05, 8.1], [10.483, 8.445, 16.89], [12.242, 9.81, 19.62]] },
  // осень: городской атлас, листва перекрашена цветом экземпляра (рыжие, жёлтые, багряные, сухостой), сосна (вид 2) - своя хвоя
  autumn: { G: 6, atlas: 'city', recolor: 1, tint: [0.12, 0.12, 0.1], snow: 0, sp: [[7.501, 5.18, 10.36], [7.136, 4.76, 9.52], [7.59, 6.355, 12.71], [5.169, 3.56, 7.12]] },
};
function treeImpTex(f) { // → uniform { value }: KTX2, иначе WebP
  const t = new THREE.Texture(); t.flipY = false; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  const U = { value: t };
  if (typeof createImageBitmap !== 'function' || typeof fetch !== 'function') return U;
  texStats.req++;
  if (ktxOn()) { ktxLoad(f).then((k) => { U.value = k; texStats.done++; }).catch(() => webp()); return U; }
  webp(); return U;
  function webp() { fetch(new URL(`./tex/${f}.webp?v=20261125c`, import.meta.url)).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(f))))
    .then((b) => createImageBitmap(b, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })).then((bmp) => { t.image = bmp; t.needsUpdate = true; texStats.done++; })
    .catch((e) => { texStats.done++; console.warn('деревья не загрузились:', e.message); }); }
}
function treeImpMat(set, hi, hemi, sunL, a2c = false) {
  if (TR2 && TREE_IMP[set + '2'].sp.length) set += '2'; const I = TREE_IMP[set], CC = I.C || 2, RW = I.RW || 2, sfx = hi ? '' : '_lo', atl = I.atlas || set;
  const sp = I.sp.map(([R, cy, H]) => new THREE.Vector4(R / H, cy / H, 0, 0)); while (sp.length < 8) sp.push(sp[0]); // в долях высоты: экземпляр масштабирован под высоту модели
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsLib.fog, ...airUniforms(), atmoSunDir: { value: ATMO.sunDir }, atmoSunCol: { value: ATMO.sunCol }, atmoP: { value: ATMO.p }, /* воздушная перспектива как у земли (world.js): без них высота тумана = 0 → туман ×2,2 - деревья вдали белые */ uCam: ENV.uCam, uHide: ENV.uHide, uMdl: ENV.uMdl, uSun: ENV.uSun, uTime: ENV.uTime, ...BU,
      tA: treeImpTex(`tr_${I.tr2 ? set : atl}_a${sfx}`), tN: treeImpTex(`tr_${I.tr2 ? set : atl}_n${sfx}`), uSp: { value: sp }, uRec: { value: I.recolor || 0 },
      uHS: { value: hemi.color.clone().multiplyScalar(hemi.intensity) }, uHG: { value: hemi.groundColor.clone().multiplyScalar(hemi.intensity) },
      uSL: { value: sunL.color.clone().multiplyScalar(sunL.intensity) }, uTint: { value: new THREE.Vector3(...I.tint) }, uKA: { value: new THREE.Vector3(...(TREE_CAL && I.kA || [1, 1, 1])) }, uKD: { value: new THREE.Vector3(...(TREE_CAL && I.kD || [1, 1, 1])) }, uSnow: { value: I.snow } },
    vertexShader: `${BLAST_GLSL}attribute float aKind, aMdl; uniform vec3 uCam, uHide; uniform float uMdl[32], uTime; uniform vec4 uSp[8]; varying float vTF; varying vec3 vWPos;
      varying vec2 vUv, vG0, vG1, vF; varying vec3 vAx, vAz, vCol; varying float vSp, vTint, vVar;
      #include <fog_pars_vertex>
      void main() {
        vSp = aKind; vec4 S = uSp[int(aKind + 0.5)];
        float h = length(instanceMatrix[1].xyz); vec3 base = instanceMatrix[3].xyz; vVar = fract(sin(dot(base.xz, vec2(12.9898, 78.233))) * 43758.5453); vec3 ctr = base + vec3(0.0, S.y * h, 0.0); float R = S.x * h;
        vAx = normalize(instanceMatrix[0].xyz); vAz = normalize(instanceMatrix[2].xyz);
        vec3 V = normalize(uCam - ctr), Vl = vec3(dot(V, vAx), max(V.y, 0.0), dot(V, vAz)); Vl = normalize(Vl + vec3(0.0, 1e-3, 0.0));
        vec2 p = Vl.xz / (abs(Vl.x) + Vl.y + abs(Vl.z)), o = vec2(p.x + p.y, p.x - p.y);                 // полу-октаэдр → [−1, 1]²
        vec2 g = (o * 0.5 + 0.5) * ${I.G.toFixed(1)} - 0.5; vG0 = clamp(floor(g), 0.0, ${(I.G - 1).toFixed(1)}); vG1 = min(vG0 + 1.0, ${(I.G - 1).toFixed(1)}); vF = clamp(g - vG0, 0.0, 1.0);
        vec3 up = vec3(0.0, 1.0, 0.0) - Vl * Vl.y; up = dot(up, up) < 1e-6 ? vec3(0.0, 0.0, -1.0) : normalize(up);   // как камера запекания
        vec3 rt = normalize(cross(up, Vl)); up = cross(Vl, rt);
        vec3 Rw = vAx * rt.x + vec3(0.0, rt.y, 0.0) + vAz * rt.z, Uw = vAx * up.x + vec3(0.0, up.y, 0.0) + vAz * up.z;
        vUv = position.xy + 0.5;
        vec3 wp = ctr + (Rw * position.x + Uw * position.y) * 2.0 * R; { float k = clamp((wp.y - base.y) / max(2.0 * S.y * h, 0.1), 0.0, 1.0); vec3 bl = blastAt(base + vec3(0.0, S.y * h, 0.0), 2.1 * pow(max(2.0 * S.y * h, 1.0), -0.55), 0.09, uTime); wp.xz += bl.xy * 2.0 * S.y * h * k * k; }
        vWPos = wp; vec4 mvPosition = viewMatrix * vec4(wp, 1.0); gl_Position = projectionMatrix * mvPosition;
        vTF = 1.0; if (aMdl > 0.5) { float dr = distance(base.xz, uHide.xz) / max(uMdl[int(aMdl + 0.5)], 1e-3); if (uMdl[int(aMdl + 0.5)] > 0.0) { vTF = smoothstep(${TF0.toFixed(2)}, 1.0, dr); if (dr < ${TF0.toFixed(2)}) gl_Position = vec4(2.0, 2.0, 2.0, 1.0); } } // вблизи - модели
        #ifdef USE_INSTANCING_COLOR
          vTint = dot(instanceColor, vec3(0.3, 0.59, 0.11)); vCol = instanceColor;
        #else
          vTint = 0.05; vCol = vec3(0.05);
        #endif
        #include <fog_vertex>
      }`,
    fragmentShader: `varying float vTF; varying vec3 vWPos; uniform vec3 uCam; uniform sampler2D tA, tN; uniform vec3 uHS, uHG, uSL, uSun, uTint, uKA, uKD; uniform float uSnow, uRec;
      varying vec2 vUv, vG0, vG1, vF; varying vec3 vAx, vAz, vCol; varying float vSp, vTint, vVar;
      #include <fog_pars_fragment>
      vec2 at(vec2 c) { float s = floor(vSp + 0.5); vec2 o = vec2(mod(s, ${CC.toFixed(1)}), floor(s / ${CC.toFixed(1)})) * ${I.G.toFixed(1)};
        vec2 q = (o + c + clamp(vUv, 0.01, 0.99)) / vec2(${(I.G * CC).toFixed(1)}, ${(I.G * RW).toFixed(1)}); return vec2(q.x, 1.0 - q.y); }
      void main() {
        if (vTF < 1.0 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) >= vTF) discard;
        vec2 a0 = at(vG0), a1 = at(vec2(vG1.x, vG0.y)), a2 = at(vec2(vG0.x, vG1.y)), a3 = at(vG1);
        float w0 = (1.0 - vF.x) * (1.0 - vF.y), w1 = vF.x * (1.0 - vF.y), w2 = (1.0 - vF.x) * vF.y, w3 = vF.x * vF.y;
        vec4 A = texture2D(tA, a0) * w0 + texture2D(tA, a1) * w1 + texture2D(tA, a2) * w2 + texture2D(tA, a3) * w3;
        // порог покрытия - ниже на мелких мип-уровнях (иначе редкая хвоя и листва вдали «облезают» до ствола)
        vec2 ts = vec2(${(I.G * CC * 128).toFixed(1)}, ${(I.G * RW * 128).toFixed(1)}); float lod = log2(max(max(length(dFdx(a0 * ts)), length(dFdy(a0 * ts))), 1.0)), lk = clamp(lod / 4.0, 0.0, 1.0);
        float thr = mix(${I.tr2 ? '0.3' : '0.45'}, 0.1, lk);
        ${a2c ? `float cov = clamp((A.a - thr) / max(fwidth(A.a), 1e-3) + 0.5, 0.0, 1.0); if (cov < 0.01) discard; // край хвои - сглаженный (MSAA: покрытие из альфы), без мерцания вдали`
          : 'if (A.a < thr) discard;'}
        vec4 Nn = texture2D(tN, a0) * w0 + texture2D(tN, a1) * w1 + texture2D(tN, a2) * w2 + texture2D(tN, a3) * w3;
        vec3 alb = pow(A.rgb / max(A.a, 0.05), vec3(2.2)) * (0.85 + 3.0 * vTint);${I.tr2 ? ` alb = min(alb, vec3(${set === 'city2' ? '0.3' : '0.85'}));` + (set === 'city2' ? ' if (abs(vSp - 4.0) < 0.5) alb *= vec3(0.6, 0.72, 0.62); ' + LEAF_TONE('alb') : '') : ''} // атлас - sRGB; тон - от цвета экземпляра
        alb *= uTint * mix(1.0, ${I.tr2 ? '1.0' : '0.85'}, clamp(lod / 4.0, 0.0, 1.0)); // крона в тени самой себя: темнее и зеленее, вдали - как у моделей
        float cl = dot(vCol, vec3(0.3, 0.59, 0.11)); // осень: тон листвы - цвет экземпляра (яркость - от атласа); сосна - без перекраски
        float gy = clamp(dot(alb, vec3(0.3, 0.59, 0.11)), 0.012, 0.11) * mix(1.0, 0.75, lk); // яркость листвы - с потолком: у края кроны и на мелких мипах цвет/прозрачность взлетает (неоновые ободки вблизи, белёсые пятна вдали)
        alb = mix(alb, gy * vCol / max(cl, 1e-3), uRec * (1.0 - step(abs(vSp - 2.0), 0.5)));
        vec3 nl = normalize(Nn.rgb / max(A.a, 0.05) * 2.0 - 1.0), n = normalize(vAx * nl.x + vec3(0.0, nl.y, 0.0) + vAz * nl.z);
        float ao = clamp(Nn.a / max(A.a, 0.05), 0.0, 1.0);
        float ny0 = n.y; n = normalize(mix(n, vec3(0.0, 0.6, 0.0) + normalize(uSun) * 0.25, ${I.tr2 ? '0.25 + lk * 0.4' : 'lk * 0.6'})); // вдали мелкий рельеф кроны не виден - свет ровнее (без искр)
        vec3 lt = mix(uHG, uHS, n.y * 0.5 + 0.5) * ao * uKA${set === 'city2' ? ' * mix(1.7, 1.0, smoothstep(0.08, 0.5, uSun.y))' : ''} + uKD * uSL * max(dot(n, normalize(uSun)) * 0.8 + 0.2, 0.0) * mix(0.6, 1.0, ao)${CLD_ON ? ' * vCld' : ''};
        ${TREE_CAL && !I.tr2 ? 'if (uRec < 0.5) { lt *= mix(1.0, 0.5, lk); alb = mix(alb, vec3(dot(alb, vec3(0.3, 0.59, 0.11))), 0.35 * lk); } // вдали крона - в тени самой себя: темнее и спокойнее (светлые «конфетти» на дальних склонах)' : ''}
        ${I.tr2 ? `{ float fd = smoothstep(150.0, 900.0, distance(uCam, vWPos)); lt *= mix(1.0, ${set === 'city2' ? '0.9' : '0.8'}, max(fd, lk * 0.7)); alb = mix(alb, vec3(dot(alb, vec3(0.3, 0.59, 0.11))) * vec3(0.95, 1.02, 0.86), ${set === 'city2' ? '0.25' : '0.2'} * max(fd, lk)); }` : ''}
        vec3 col = alb * lt;
        // снег на ветвях: плавно на обращённых вверх лапах, у каждого дерева - своё количество; вдали - приглушённо
        float sn = uSnow * smoothstep(0.35, 0.9, ny0) * (0.2 + 0.35 * vVar) * mix(1.0, 0.5, lk) * ao;
        col = mix(col, vec3(0.74, 0.77, 0.82) * lt, sn);
        gl_FragColor = vec4(col, ${a2c ? 'cov' : '1.0'});
        #include <fog_fragment>
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }`,
    fog: true, extensions: { derivatives: true },
  });
  mat.alphaToCoverage = a2c;
  return mat;
}
function treeGeo() {
  return mergeParts([
    part(new THREE.CylinderGeometry(0.06, 0.09, 0.5, 5), 0x5a4a3c, M(0, 0.25, 0)),
    part(new THREE.IcosahedronGeometry(0.5, 1), 0xffffff, M(0, 0.85, 0, 0, 0, 0, 1, 0.9, 1)),
  ]);
}
// дальние деревья (за 2-3 км - пара пикселей): ~26 треугольников вместо ~100
function treeGeoLo() {
  return mergeParts([
    part(new THREE.CylinderGeometry(0.07, 0.09, 0.5, 3, 1, true), 0x5a4a3c, M(0, 0.25, 0)),
    part(new THREE.IcosahedronGeometry(0.52, 0), 0xffffff, M(0, 0.85, 0, 0, 0, 0, 1, 0.9, 1)),
  ]);
}

// неподвижное - без пересчёта матриц каждый кадр (2026-10-23, нагрев телефонов: ≈ 700 из 1300 объектов сцены - город и постройки целей).
// Кто потом двигает такой объект (objLook в main.js - «осел» после разрушения), зовёт его updateMatrix()
// Подвижные части (крылья мельницы - userData.sail, винты - spin / hub) и всё под ними - не замораживаются (ревью 2026-10-23: крылья встали)
export function freezeTree(o) {
  if (!o) return;
  const walk = (q) => { if (q.userData.sail || q.userData.spin || q.userData.hub) return; q.updateMatrix(); q.matrixAutoUpdate = false; for (const c of q.children) walk(c); };
  walk(o);
}
// инстансы по плиткам: list - [{x, z, y, sx, sy, sz, ry, color, kind}]; drawK - доля дальности прорисовки
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
    const kind = new Float32Array(arr.length), mdl = new Float32Array(arr.length), fac = new Float32Array(arr.length);
    const mesh = new THREE.InstancedMesh(g, mat, arr.length);
    let maxH = 0;
    arr.forEach((b, i) => {
      q.setFromAxisAngle(Y, b.ry || 0);
      mtx.compose(p.set(b.x, b.y, b.z), q, s.set(b.sx, b.sy, b.sz)); mesh.setMatrixAt(i, mtx);
      mesh.setColorAt(i, b.color); kind[i] = b.kind || 0; mdl[i] = b.mdl || 0; fac[i] = b.fac || 0; maxH = Math.max(maxH, b.y + b.sy);
    });
    g.setAttribute('aKind', new THREE.InstancedBufferAttribute(kind, 1)); g.setAttribute('aMdl', new THREE.InstancedBufferAttribute(mdl, 1)); if (opts.fac) g.setAttribute('aFac', new THREE.InstancedBufferAttribute(fac, 1));
    const cx = (ti + 0.5) * TILE, cz = (tj + 0.5) * TILE;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, maxH / 2, cz), Math.hypot(TILE * 0.75, maxH / 2 + 10));
    mesh.castShadow = !!opts.cast; mesh.receiveShadow = !!opts.receive;
    mesh.frustumCulled = true; // r128 у InstancedMesh отсечение по умолчанию выключено - без него плитки за спиной рисовались во всех проходах (кадр, тени, контейнер)
    mesh.userData = { cx, cz, maxH, drawK };
    if (opts.lo) { // дальняя плитка - упрощённая форма (те же атрибуты инстансов)
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

// ═════════════ Дома вблизи - готовые модели ═════════════
// упрощённая копия сетки для средней дальности: те же вершины (нормали, текстура), меньше треугольников (meshoptimizer).
// Сливаются только полные дубли (положение, текстура, нормаль); швы текстуры и острые грани - границы, они закреплены
// (иначе текстура «течёт» полосами). err - допустимая ошибка в долях размера модели
export async function loIndex(geo, ratio, err) {
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
  if (out.length > widx.length * 0.75) return null; // почти не упростилось - незачем
  const I = new Uint32Array(out.length); for (let i = 0; i < out.length; i++) I[i] = rep[out[i]];
  return new THREE.BufferAttribute(I, 1);
}
// средний цвет модели (текстура × цвет материала, вес - число треугольников): им красится дальняя коробка того же вида,
// чтобы при подходе коробка не сменялась моделью другого цвета. Текстура - уменьшенной копией 8×8 (среднее по ней)
const MC = document.createElement('canvas'); MC.width = MC.height = 8; const MCC = new WeakMap(); // картинка → средний цвет
function modelColor(group) {
  const ctx = MC.getContext('2d', { willReadFrequently: true }); let r = 0, g = 0, b = 0, wsum = 0;
  group.traverse((m) => {
    if (!m.isMesh || !m.material || m.material.transparent) return;
    const w = (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3, c = m.material.color || new THREE.Color(1, 1, 1);
    let tr = 1, tg = 1, tb = 1; const img = m.material.map && m.material.map.image, sm = m.material.map && m.material.map.small;
    if (sm) { let a = 0, q = 0, e = 0; for (let i = 0; i < sm.length; i += 3) { a += sm[i]; q += sm[i + 1]; e += sm[i + 2]; } const n = sm.length / 3; tr = a / n; tg = q / n; tb = e / n; } // сжатая текстура: средний цвет - по уменьшенной копии (линейный, models.js smallTex)
    else if (img && MCC.has(img)) [tr, tg, tb] = MCC.get(img); // та же картинка у сотен модулей набора - читаем один раз
    else if (img) { try { ctx.clearRect(0, 0, 8, 8); ctx.drawImage(img, 0, 0, 8, 8); const d = ctx.getImageData(0, 0, 8, 8).data; let a = 0, q = 0, e = 0; for (let i = 0; i < d.length; i += 4) { a += d[i]; q += d[i + 1]; e += d[i + 2]; } const n = d.length / 4 * 255, L = (x) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)); tr = L(a / n); tg = L(q / n); tb = L(e / n); MCC.set(img, [tr, tg, tb]); } catch (_) { /* нет доступа к картинке */ } }
    r += c.r * tr * w; g += c.g * tg * w; b += c.b * tb * w; wsum += w;
  });
  return wsum ? { r: r / wsum, g: g / wsum, b: b / wsum } : null;
}
// сильно упрощённая копия той же модели - вдали вместо коробки: склейка только по положению (швы текстуры и острые грани
// схлопываются - вдали их не видно), err - крупно; форма, цвет и текстура остаются свои. k - доля треугольников, min - не меньше
export async function farIndex(geo, k = 0.04, min = 16, err = 0.08) {
  const pos = geo.attributes.position, idx = geo.index; if (!idx) return null;
  await MeshoptSimplifier.ready;
  const nv = pos.count, wid = new Uint32Array(nv), key = new Map(), wpos = [], rep = [];
  for (let v = 0; v < nv; v++) {
    const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v), kk = Math.round(x * 500) + ',' + Math.round(y * 500) + ',' + Math.round(z * 500);
    let w = key.get(kk); if (w === undefined) { key.set(kk, w = rep.length); wpos.push(x, y, z); rep.push(v); } wid[v] = w;
  }
  const widx = new Uint32Array(idx.count); for (let i = 0; i < idx.count; i++) widx[i] = wid[idx.getX(i)];
  const tgt = Math.max(min * 3, Math.floor(widx.length * k / 3) * 3);
  if (tgt >= widx.length) return idx;
  const [out] = MeshoptSimplifier.simplify(widx, Float32Array.from(wpos), 3, tgt, err, []);
  const I = new Uint32Array(out.length); for (let i = 0; i < out.length; i++) I[i] = rep[out[i]];
  return new THREE.BufferAttribute(I, 1);
}
// дальняя копия - одним материалом (2026-10-23, нагрев телефонов: у копии объекта было по вызову отрисовки на материал, ≈ 13 на объект):
// цвет текстуры запекается в цвет вершин треугольников - по уменьшенной копии картинки (models.js smallTex, линейный цвет), усреднение по 7
// точкам треугольника на уровне, где он ≈ тексель (повтор UV - как RepeatWrapping), × цвет материала × цвет вершин (деталь, затенение в стыках).
// Вдали (3,5-8 км) пиксель экрана - 3-6 м: рисунок окон и панелей и так сливается. Прозрачное, вырезанное по маске, со своим шейдером
// (камуфляж, снег) и текстура без копии - как было. ?farflat=0 - как было
const FAR_MAT = new Map(); // блеск - как у исходного материала (у построек обычно один на всех - одна сетка)
const farMat = (mt) => { const k = mt.specular.getHex() + '|' + mt.shininess; let m = FAR_MAT.get(k); if (!m) FAR_MAT.set(k, m = new THREE.MeshPhongMaterial({ vertexColors: true, specular: mt.specular.getHex(), shininess: mt.shininess, side: THREE.DoubleSide })); return m; };
const FARFLAT = !(typeof location !== 'undefined' && /[?&]farflat=0/.test(location.search));
const SMALLP = new WeakMap(); // уменьшенная копия → уровни 32, 16, 8, 4, 2, 1
function smallLevels(L) {
  let lv = SMALLP.get(L); if (lv) return lv; lv = [L];
  for (let w = 16; w >= 1; w >>= 1) { const a = lv[lv.length - 1], b = new Float32Array(w * w * 3), W = w * 2;
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) b[(y * w + x) * 3 + c] = (a[(2 * y * W + 2 * x) * 3 + c] + a[(2 * y * W + 2 * x + 1) * 3 + c] + a[((2 * y + 1) * W + 2 * x) * 3 + c] + a[((2 * y + 1) * W + 2 * x + 1) * 3 + c]) / 4;
    lv.push(b); }
  SMALLP.set(L, lv); return lv;
}
const FS3 = [0, 0, 0];
export function farFlat(m, geo, orig) {
  const mt = m.material;
  if (!FARFLAT || Array.isArray(mt) || mt.transparent || mt.alphaTest > 0 || mt.polygonOffset || mt.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile || !mt.isMeshPhongMaterial) return geo; // polygonOffset - подложки (pad): без сдвига мерцали бы с землёй
  const small = mt.map ? mt.map.small : null; if (mt.map && !small) return geo;
  const g = geo === orig ? (geo.index ? geo.toNonIndexed() : geo.clone()) : geo.index ? geo.toNonIndexed() : geo;
  const P = g.attributes.position, U = g.attributes.uv, C0 = g.attributes.color, n = P.count, col = new Float32Array(n * 3), lv = small && smallLevels(small);
  const ck = C0 && C0.normalized ? (C0.array instanceof Uint8Array ? 1 / 255 : C0.array instanceof Uint16Array ? 1 / 65535 : 1) : 1; // байты затенения → 0…1
  const smp = (u, v, l) => { const w = 32 >> l, a = lv[l], x = ((Math.floor(u * w) % w) + w) % w, y = ((Math.floor(v * w) % w) + w) % w, i = (y * w + x) * 3; FS3[0] += a[i]; FS3[1] += a[i + 1]; FS3[2] += a[i + 2]; };
  for (let t = 0; t + 2 < n; t += 3) {
    let r = mt.color.r, gg = mt.color.g, b = mt.color.b;
    if (lv && U) {
      const u0 = U.getX(t), v0 = U.getY(t), u1 = U.getX(t + 1), v1 = U.getY(t + 1), u2 = U.getX(t + 2), v2 = U.getY(t + 2);
      const ext = Math.max(Math.max(u0, u1, u2) - Math.min(u0, u1, u2), Math.max(v0, v1, v2) - Math.min(v0, v1, v2));
      const l = Math.max(0, Math.min(5, Math.ceil(Math.log2(Math.max(ext * 32 / 2, 1))))); // уровень, где треугольник ≈ 2 текселя
      FS3[0] = FS3[1] = FS3[2] = 0;
      smp(u0, v0, l); smp(u1, v1, l); smp(u2, v2, l); smp((u0 + u1) / 2, (v0 + v1) / 2, l); smp((u1 + u2) / 2, (v1 + v2) / 2, l); smp((u0 + u2) / 2, (v0 + v2) / 2, l); smp((u0 + u1 + u2) / 3, (v0 + v1 + v2) / 3, l);
      r *= FS3[0] / 7; gg *= FS3[1] / 7; b *= FS3[2] / 7;
    }
    for (let k = 0; k < 3; k++) { const o = (t + k) * 3; col[o] = r * (C0 ? C0.getX(t + k) * ck : 1); col[o + 1] = gg * (C0 ? C0.getY(t + k) * ck : 1); col[o + 2] = b * (C0 ? C0.getZ(t + k) * ck : 1); }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.deleteAttribute('uv'); m.material = farMat(mt);
  return g;
}
// дальняя копия как отдельная геометрия: свои вершины на каждый треугольник и нормали по граням - у упрощённой сетки
// нормали исходных вершин ложились пятнами («мятые» стены); крупные модели (big) - упрощаются до ошибки 0,5 % размера: силуэт не искажается
export async function farGeo(geo, big, o = {}) {
  const ix = await farIndex(geo, o.k ?? (big ? 0.05 : 0.04), o.min ?? (big ? 48 : 16), o.err ?? (big ? 0.005 : 0.08)); if (!ix) return geo; // крупные - по ошибке 0,5 % (силуэт), а не по доле: сколько треугольников останется, столько и будет
  const P = geo.attributes.position, U = geo.attributes.uv, N0 = geo.attributes.normal, n = ix.count, pos = new Float32Array(n * 3), uv = U ? new Float32Array(n * 2) : null, on = new Float32Array(n * 3);
  // цвет вершин - тоже (2026-10-23: у слитых деталей моделей в нём цвет детали, models.js mergeSame; раньше терялось только затенение)
  const Cc = geo.attributes.color, cs = Cc ? Cc.itemSize : 0, col = Cc ? new Float32Array(n * cs) : null, ck = Cc && Cc.normalized ? (Cc.array instanceof Uint8Array ? 1 / 255 : Cc.array instanceof Uint16Array ? 1 / 65535 : 1) : 1;
  for (let i = 0; i < n; i++) { const v = ix.getX(i); pos[i * 3] = P.getX(v); pos[i * 3 + 1] = P.getY(v); pos[i * 3 + 2] = P.getZ(v); if (uv) { uv[i * 2] = U.getX(v); uv[i * 2 + 1] = U.getY(v); } if (N0) { on[i * 3] = N0.getX(v); on[i * 3 + 1] = N0.getY(v); on[i * 3 + 2] = N0.getZ(v); } if (col) for (let c = 0; c < cs; c++) col[i * cs + c] = Cc.array[v * cs + c] * ck; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); if (uv) g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); if (col) g.setAttribute('color', new THREE.BufferAttribute(col, cs));
  g.computeVertexNormals(); const F = Float32Array.from(g.attributes.normal.array); creaseNormals(g, 0.72);
  // нормаль модели - где она совпадает с гранью (ровные стены коробчатых домов), развёрнутая по обходу грани (тонкие двусторонние крыши
  // склеились верхом и низом - иначе чёрные скаты); иначе - сглаженная
  if (N0) { const Nn = g.attributes.normal.array; for (let i = 0; i < n; i++) { const d = on[i * 3] * F[i * 3] + on[i * 3 + 1] * F[i * 3 + 1] + on[i * 3 + 2] * F[i * 3 + 2]; const sg = d < 0 ? -1 : 1; if (Math.abs(d) > 0.9) { Nn[i * 3] = sg * on[i * 3]; Nn[i * 3 + 1] = sg * on[i * 3 + 1]; Nn[i * 3 + 2] = sg * on[i * 3 + 2]; } } } // по обходу грани: изнанку движок развернёт сам (двусторонний материал)
  g.boundingSphere = geo.boundingSphere; return g;
}
// сглаживание с порогом угла: в каждой вершине - среднее нормалей граней, сходящихся в этой точке и отличающихся от своей
// не больше чем на acos(cosT) (~44°): стены - ровные (без «мятых» граней у неровных моделей), углы здания - острые
function creaseNormals(g, cosT) {
  const P = g.attributes.position.array, N = g.attributes.normal.array, n = P.length / 3, F = new Float32Array(n * 3), by = new Map();
  F.set(N); // после computeVertexNormals на неиндексной геометрии - нормали граней
  for (let i = 0; i < n; i++) { const k = Math.round(P[i * 3] * 200) + ',' + Math.round(P[i * 3 + 1] * 200) + ',' + Math.round(P[i * 3 + 2] * 200); let a = by.get(k); if (!a) by.set(k, a = []); a.push(i); }
  for (const a of by.values()) for (const i of a) {
    let x = 0, y = 0, z = 0;
    for (const j of a) { const d = F[i * 3] * F[j * 3] + F[i * 3 + 1] * F[j * 3 + 1] + F[i * 3 + 2] * F[j * 3 + 2]; if (d >= cosT) { x += F[j * 3]; y += F[j * 3 + 1]; z += F[j * 3 + 2]; } }
    const L = Math.hypot(x, y, z) || 1; N[i * 3] = x / L; N[i * 3 + 1] = y / L; N[i * 3 + 2] = z / L;
  }
  g.attributes.normal.needsUpdate = true;
}
// дальняя копия дома - «импостор»: коробка размером с модель, обтянутая её снимками (4 стороны и крыша, без света - только
// цвет), фон снимка прозрачный (alphaTest - силуэт свой: скаты крыш, уступы башен). 10 треугольников на дом, вид - как у
// модели (никаких «мятых» стен упрощения). Атлас 4×2 клетки: низ - +X, −X, +Z, −Z; верх - крыша и пустая (дно коробки)
const IMP_V = new THREE.Vector3(), IMP_C = new THREE.Vector3(), IMP_UP = new THREE.Vector3();
// высота основной крыши: по площади граней, смотрящих вверх (n.y > 0,5), - уровень, выше которого лежит меньше 35 % этой площади
// (трубы, будки, антенны - малая площадь - её не поднимают)
function roofHeight(group, bb) {
  const A = [], va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  group.traverse((m) => {
    if (!m.isMesh) return; const P = m.geometry.attributes.position, I = m.geometry.index; const n = I ? I.count : P.count;
    for (let t = 0; t < n; t += 3) {
      const a = I ? I.getX(t) : t, b = I ? I.getX(t + 1) : t + 1, c = I ? I.getX(t + 2) : t + 2;
      va.fromBufferAttribute(P, a).applyMatrix4(m.matrixWorld); vb.fromBufferAttribute(P, b).applyMatrix4(m.matrixWorld); vc.fromBufferAttribute(P, c).applyMatrix4(m.matrixWorld);
      e1.subVectors(vb, va); e2.subVectors(vc, va); e1.cross(e2); const ar = e1.length() / 2; if (ar < 1e-4) continue;
      if (Math.abs(e1.y) / (2 * ar) > 0.5) A.push([(va.y + vb.y + vc.y) / 3, ar]);
    }
  });
  if (!A.length) return bb.max.y;
  A.sort((p, q) => q[0] - p[0]); let tot = 0; for (const [, a] of A) tot += a;
  let acc = 0; for (const [y, a] of A) { acc += a; if (acc > tot * 0.35) return Math.min(bb.max.y, y + 0.05); }
  return bb.max.y;
}
export function makeImpostor(group, renderer, cell = 256) {
  if (!renderer) return null;
  group.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(group); if (bb.isEmpty()) return null;
  const S = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3()), sc = new THREE.Scene();
  group.traverse((m) => {
    if (!m.isMesh || !m.material || m.material.transparent && m.material.opacity < 0.3) return;
    const o = m.material, q = new THREE.Mesh(m.geometry, new THREE.MeshBasicMaterial({ map: o.map || null, color: o.color ? o.color.clone() : 0xffffff, side: THREE.DoubleSide, alphaTest: o.alphaTest || 0, toneMapped: false }));
    q.matrixAutoUpdate = false; q.matrix.copy(m.matrixWorld); sc.add(q);
  });
  const rt = new THREE.WebGLRenderTarget(cell * 4, cell * 2, { minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true, format: THREE.RGBAFormat });
  const prevRT = renderer.getRenderTarget(), prevAuto = renderer.autoClear, prevCol = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha(), prevSc = renderer.getScissorTest();
  const vp = new THREE.Vector4(); renderer.getViewport(vp); const sp = new THREE.Vector4(); renderer.getScissor(sp);
  renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.autoClear = false; renderer.setScissorTest(false); renderer.clear(true, true, true); renderer.setScissorTest(true);
  // клетка (cx, cy): камера на расстоянии вдоль n, смотрит в центр; w × h - ширина и высота грани; up - верх кадра
  const shot = (cx, cy, n, w, h, d, up) => {
    const cam = new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, 0.05, d + 2);
    cam.position.copy(c).addScaledVector(n, d / 2 + 1); cam.up.copy(up); cam.lookAt(c); cam.updateMatrixWorld();
    renderer.setViewport(cx * cell, cy * cell, cell, cell); renderer.setScissor(cx * cell, cy * cell, cell, cell); renderer.clear(true, true, true);
    renderer.render(sc, cam);
  };
  const Y = IMP_UP.set(0, 1, 0);
  shot(0, 0, IMP_V.set(1, 0, 0), S.z, S.y, S.x, Y); shot(1, 0, IMP_V.set(-1, 0, 0), S.z, S.y, S.x, Y);
  shot(2, 0, IMP_V.set(0, 0, 1), S.x, S.y, S.z, Y); shot(3, 0, IMP_V.set(0, 0, -1), S.x, S.y, S.z, Y);
  if (ENV.uSnowK.value > 0) sc.traverse((q) => { if (q.isMesh) { const o = q.material; q.material = new THREE.MeshBasicMaterial({ color: 0xd2d8e0, side: THREE.DoubleSide, alphaTest: o.alphaTest, map: o.alphaTest ? o.map : null, toneMapped: false }); o.dispose(); } }); // зима: крыша сверху - снег
  shot(0, 1, IMP_V.set(0, 1, 0), S.x, S.z, S.y, IMP_C.set(0, 0, -1));
  renderer.setScissorTest(prevSc); renderer.setScissor(sp); renderer.setViewport(vp); renderer.setRenderTarget(prevRT); renderer.autoClear = prevAuto; renderer.setClearColor(prevCol, prevA);
  sc.traverse((q) => { if (q.isMesh) q.material.dispose(); });
  // коробка: развёртка граней BoxGeometry (+X, −X, +Y, −Y, +Z, −Z) → клетки атласа (дно - в пустую клетку: прозрачно).
  // Крыша коробки - на высоте основной крыши (а не труб и будок: иначе снимок крыши висел над домом), стены - во всю высоту
  const g = new THREE.BoxGeometry(S.x, S.y, S.z); g.translate(c.x, c.y, c.z);
  const ry = roofHeight(group, bb); if (ry < bb.max.y - 0.3) for (let i = 8; i < 12; i++) g.attributes.position.setY(i, ry);
  const uv = g.attributes.uv, CELL = [[0, 0], [1, 0], [0, 1], [3, 1], [2, 0], [3, 0]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k, [cx, cy] = CELL[f], e = 0.5 / cell; uv.setXY(i, (cx + e + uv.getX(i) * (1 - 2 * e)) / 4, (cy + e + uv.getY(i) * (1 - 2 * e)) / 2); }
  const mat = new THREE.MeshLambertMaterial({ map: rt.texture, alphaTest: 0.5, side: THREE.DoubleSide });
  return { geo: g, mat, rt };
}
// вид (номер = aMdl) → модель и её габариты [X, Y, Z] при масштабе 1 (как печатает tools/airdef-models/prepare.js)
export const BLD = [null, ['bld_p5', 16.24, 16.5, 53.0], ['bld_p9', 24.1, 25.4, 178.6], null,
  ['bld_b12', 17.76, 29.86, 43.19], ['bld_st', 15.44, 17.43, 25.92], ['obj_factory', 97.09, 27.93, 27.23],
  // частные дома (с крышей; модель вписана в участок без растяжения, по одной на участок); офисный корпус
  ['h_brick', 11.39, 7.53, 13.38, 1], ['h_house', 12.01, 7.4, 9.71, 1], ['h_log', 10.23, 5.96, 12.24, 1], ['h_khata', 9.64, 3.86, 13.31, 1], ['o_block', 25.6, 32, 30.7],
  ['h_shanty', 18.39, 14.25, 29.59, 1], ['h_mobile', 7.42, 5.97, 11.74, 1], null, null, null, null, // 14…17 - деревья
  // 18…: точечная девятиэтажка, 16-этажная «пластина», офисный корпус, стеклянные башни
  ['bld_t9', 14.2, 28.42, 15], ['bld_a16', 16.25, 50.5, 50], ['o_tall', 37.09, 33.19, 18.36], ['g_amel', 25.15, 56.37, 27.19], ['g_fortune', 38.88, 111.23, 31.55],
  // 23…29: свои цеха и склады промзоны (Свои/Цеха и склады, 2026-11-08) - размер по стенам (рампы, свесы, трубы выходят за коробку нарочно), конёк вдоль Z;
  // 30 - контейнерная площадка порта (не модель: раскладка контейнеров в nearHouses, yardSets)
  ['wh_annex', 30, 14, 45], ['wh_arch', 30, 13, 40], ['wh_lantern', 36, 17.2, 54], ['wh_panel', 24, 7.8, 72], ['wh_ramp', 24, 9, 96], ['wh_saw', 40, 12.2, 40], ['wh_shed', 30, 12, 60], null];
const WH = [23, 24, 25, 26, 27, 28, 29], YARD = 30, YARD_FAR = +((typeof location !== 'undefined' && /[?&]yardfar=(\d+)/.exec(location.search)) || [0, 1200])[1]; // ?yardfar=0 - без упрощённых контейнеров (сразу штабели брусками, проверка); YARD_FAR - до скольких метров контейнеры площадок порта рисуются упрощёнными копиями
// цех v в коробке L × S: [копий вдоль, копий поперёк, растяжение вдоль, поперёк]
const whGrid = (v, L, S) => { const [, mx, , mz] = BLD[v], nl = Math.max(1, Math.round(L / mz)), nw = Math.max(1, Math.round(S / mx)); return [nl, nw, L / nl / mz, S / nw / mx]; };
// деревья вблизи (номер в uMdl - 14…17) и их высота при масштабе 1; фонарь
// деревья ревизии 2 (Свои/Деревья, 2026-11-25): наборы trees_c / _w / _a (tools/airdef-models/trees-pack.js) - все породы карты одним файлом, уровни 0-2, дальше - снимки; ?tr2=0 - прежние
const TR2 = typeof location === 'undefined' || !/[?&]tr2=0/.test(location.search), TRS = 14;
const T2 = { c: [['tr_oak', 10.36, 'tr_oak_b', 9.6], ['tr_lime', 9.52, 'tr_lime_b', 10.8], ['tr_pine', 12.71, 'tr_pine_b', 14.5], ['tr_bush', 7.12, 'tr_bush_b', 5.6], ['tr_birch', 13, 'tr_birch_b', 11], ['tr_maple', 11.2, 'tr_maple_b', 9.4], ['tr_poplar', 17, 'tr_poplar_b', 14], ['tr_spruce', 11, 'tr_spruce_b', 14]],
  w: [['w_fir1', 9.31, 'w_fir_b', 11.5], ['w_fir3', 8.1], ['w_pine1', 16.89], ['w_pine2', 19.62], ['w_birch', 12.4], ['w_oak', 10.6]],
  a: [['a_oak', 10.36], ['a_lime', 9.52], ['tr_pine', 12.71, 'tr_pine_b', 14.5], ['a_maple', 11.2], ['a_birch', 13], ['a_oak_h', 9.6], ['pr_deadtree', 10]] };
const trHash = (t) => { let h = (Math.round(t.x * 3) * 374761393 + Math.round(t.z * 3) * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
// вблизи - наборы пород: основной вид и вариант вперемешку; k - множитель высоты к t.sy (город и зима 1,3, осень 1)
const treeH = (set, t, lo, hi) => { const h = trHash({ x: t.z + 17, z: t.x - 5 }); return T2[set][t.v][1] * (lo + (hi - lo) * h); };
function addTrees2(G, set, tl, R, k) {
  const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), YY = new THREE.Vector3(0, 1, 0), pp = new THREE.Vector3(), ss = new THREE.Vector3();
  T2[set].forEach(([n0, h0, n1, h1], v) => { const all = tl.filter((t) => t.v === v);
    for (const [nm, mh, list] of n1 ? [[n0, h0, all.filter((t) => !treeB(t))], [n1, h1, all.filter(treeB)]] : [[n0, h0, all]]) {
      const xz = new Float32Array(list.length * 2), mats = new Float32Array(list.length * 16);
      list.forEach((t, j) => { m4.compose(pp.set(t.x, t.y + 0.3, t.z), qq.setFromAxisAngle(YY, t.ry), ss.setScalar(k * t.sy / mh)); m4.toArray(mats, j * 16); xz[j * 2] = t.x; xz[j * 2 + 1] = t.z; t.mdl = TRS; });
      G.addNear('tr2_' + nm, TRS, nm, R, xz, mats, { wind: mh, pack: 'trees_' + set });
    } });
}
const TREES = [[14, 'tr_oak', 10.36], [15, 'tr_lime', 9.52], [16, 'tr_pine', 12.71], [17, 'tr_bush', 7.12]];
// зимний лес вблизи (те же номера: на зимней карте городских деревьев нет): две ели, две сосны - высота модели, м
const TREES_W = [[14, 'w_fir1', 9.31], [15, 'w_fir3', 8.1], [16, 'w_pine1', 16.89], [17, 'w_pine2', 19.62]];
// свои варианты для разнообразия (Свои/Периферия, 2026-11-08): вблизи - вперемешку с основным видом (половина деревьев по месту),
// тот же номер uMdl и та же высота в игре; вдали - импостор основного вида. [имя, высота модели]
const TREE_B = { tr_oak: ['tr_oak_b', 9.6], tr_lime: ['tr_lime_b', 10.8], tr_pine: ['tr_pine_b', 14.5], tr_bush: ['tr_bush_b', 5.6], w_fir1: ['w_fir_b', 11.5] };
const treeB = (t) => !!(((Math.round(t.x * 7) * 73856093) ^ (Math.round(t.z * 7) * 19349663)) & 1); // вариант по месту - без своей случайности
// набор деревьев вблизи: основной вид и вариант (если есть) - каждый своим набором, с покачиванием на ветру
// глубина листвы для теней: вырез по альфе картинки кроны (картинка может прийти позже - берём у материала на ходу)
function leafDepth(src) {
  const d = src.userData.leafD; if (d) return d;
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide }); m.alphaTest = src.alphaTest;
  Object.defineProperty(m, 'map', { get: () => src.map, set() {}, configurable: true });
  return (src.userData.leafD = m);
}
function addTrees(G, pre, slot, name, h, L, R) {
  const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), YY = new THREE.Vector3(0, 1, 0), pp = new THREE.Vector3(), ss = new THREE.Vector3(), V = TREE_B[name];
  for (const [nm, mh, list] of V ? [[name, h, L.filter((t) => !treeB(t))], [V[0], V[1], L.filter(treeB)]] : [[name, h, L]]) {
    const xz = new Float32Array(list.length * 2), mats = new Float32Array(list.length * 16);
    list.forEach((t, j) => { m4.compose(pp.set(t.x, t.y + 0.3, t.z), qq.setFromAxisAngle(YY, t.ry), ss.setScalar(1.3 * t.sy / mh)); m4.toArray(mats, j * 16); xz[j * 2] = t.x; xz[j * 2 + 1] = t.z; });
    G.addNear(pre + slot + (nm === name ? '' : 'b'), slot, nm, R, xz, mats, { wind: mh });
  }
}
const HOUSES = [7, 8, 9, 10, 12, 13];
// прятать процедурное вблизи (вершинный шейдер): у инстанса aMdl > 0 и до камеры меньше uMdl[aMdl] - за экран
const HIDE_HEAD = 'attribute float aMdl;\nuniform vec3 uHide; uniform float uMdl[32];\n';
const HIDE_BODY = 'if (aMdl > 0.5 && distance(instanceMatrix[3].xz, uHide.xz) < uMdl[int(aMdl + 0.5)]) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);';
const roofH = (c) => 2.2 + c * 2.2; // высота скатной крыши частного дома (как у коробки с крышей)
// какой моделью рисовать дом вблизи (0 - остаётся коробкой): пятиэтажки, длинные девятиэтажки,
// многоэтажки, сталинки (школы, магазины - невысокие «простые»), цеха складов
function bldVariant(B, i) {
  if (B.y0[i] > 0) return KIT_ON && OF_ON && (B.k[i] === KIND.OFFICE || B.k[i] === KIND.GLASS) ? OFV : 0;
  const k = B.k[i], h = B.h[i], L = Math.max(B.w[i], B.d[i]), S = Math.min(B.w[i], B.d[i]);
  // башня (L / S < 1,6) - модель растягивается по коробке: годится, если по высоте она растянута не сильнее, чем по плану (×0,7…1,45)
  const tower = (...vs) => { let best = 0, bk = 0.37; for (const v of vs) { const [, mx, my, mz] = BLD[v], kp = Math.sqrt((B.w[i] * B.d[i]) / (mx * mz)), d = Math.abs(Math.log((h / my) / kp)); if (d < bk && kp < 2) { bk = d; best = v; } } return best; }; // и не крупнее ×2 (окна - не огромные)
  if (k === KIND.PANEL) return L / S < 1.6 ? (KIT_ON ? 18 : tower(18)) : h < 20 ? 1 : h > 40 ? 19 : L > 100 && h < 30 ? 2 : 4;
  if (k === KIND.PLAIN) return S > 15 && h > 11 && h < 20 && L < 70 ? 5 : 0;
  // цеха и склады: в порту - контейнерная площадка; в промзоне - свой цех ближайших пропорций: длинная сторона делится на секции
  // (как у домов), вид - с наименьшим растяжением по самой растянутой оси (на стенде сборщика 0,75…1,35 выглядит нормально)
  if (k === KIND.WAREHOUSE) {
    if (zoneAt(B.x[i], B.z[i]) === ZONE.PORT) return YARD;
    // широкая коробка (до 158 м при модели до 40 м) - ряд копий и поперёк (whGrid): иначе цех расплющивался; не вышло без растяжения больше ×1,8 - коробка
    let best = 0, bk = 1e9;
    for (const v of WH) { const g = whGrid(v, L, S), d = Math.max(Math.abs(Math.log(g[2])), Math.abs(Math.log(g[3])), Math.abs(Math.log(h / BLD[v][2]))); if (d < bk) { bk = d; best = v; } }
    return bk <= Math.log(1.8) ? best : 0; // на карте seed 1: среднее растяжение ×1,16, у 90 % не больше ×1,27; до ×1,8 - лучше цех, чем голая коробка среди цехов
  }
  if (k === KIND.HOUSE) return HOUSES[Math.floor(B.c[i] * HOUSES.length) % HOUSES.length];
  if ((k === KIND.OFFICE || k === KIND.GLASS) && KIT_ON && OF_ON) return OFV;
  if (k === KIND.OFFICE) return L / S < 1.5 ? (h > 20 && h < 45 ? 11 : 0) : h > 22 && h < 48 ? 20 : 0;
  if (k === KIND.GLASS) return L / S < 1.6 ? tower(21, 22) : 0;
  return 0;
}
// модели ставятся по готовым матрицам (растянуты по коробке дома, длинной стороной вдоль длинной стороны коробки);
// раз в кадр берутся те, что ближе радиуса, - ровно те, чьи коробки шейдер прячет (тот же uCam)
const GC = 150, gkey = (ix, iz) => (ix + 2048) * 4096 + iz + 2048; // ячейка сетки «моделей вблизи», м
// цвет контейнера: атлас - 8 столбцов расцветок по 1/8 ширины, у файла - первый; сдвиг u в вершинном шейдере (одна текстура на все цвета)
const COLM = new WeakMap(), WINDM = new WeakMap();
function colMat(m0, k) {
  let M = COLM.get(m0); if (!M) COLM.set(m0, M = new Map());
  let m = M.get(k); if (m) return m;
  m = m0.clone(); const prev = m0.onBeforeCompile, U = { value: k / 8 }, ck = m0.customProgramCacheKey ? m0.customProgramCacheKey() : '';
  m.onBeforeCompile = (sh, r) => { if (prev) prev.call(m, sh, r); sh.uniforms.uColOff = U; sh.vertexShader = 'uniform float uColOff;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_UV\n  vUv.x += uColOff;\n#endif'); };
  m.customProgramCacheKey = () => ck + '|col'; M.set(k, m); return m;
}
// покачивание дерева на ветру (Mark: деревья живые): сдвиг xz растёт как (y / H)², фаза - от места экземпляра; у кроны - мелкая дрожь
const TREE_FADE = typeof location === 'undefined' || !/[?&]tfade=0/.test(location.search), TF0 = TREE_FADE ? 0.84 : 1; // переход модель ↔ снимок дерева: в полосе 84-100 % радиуса - узором точек (модель тает, снимок проявляется), ?tfade=0 - скачком
const TR2M = new WeakMap();
// материал деревьев ревизии 2: цвет вершины - R гибкость (y / H)², G фаза ветки, B дрожь края карточки, A затенение кроны (только оно идёт в цвет); листва односторонняя (изнанка - своими гранями)
// общий тон листвы города: у моделей и снимков одна формула - яркие породы сжаты, тёмные почти не тронуты (Mark: «некоторые деревья слишком яркие»)
const LEAF_TONE = (v) => `{ float ll = dot(${v}, vec3(0.3, 0.59, 0.11)); ${v} = mix(vec3(ll) * vec3(1.0, 1.0, 0.82), ${v}, 0.74) / (1.0 + 5.5 * ll); }`;
function tree2Mat(m0, H, slot, tone) {
  let M = TR2M.get(m0); if (!M) TR2M.set(m0, M = new Map()); let m = M.get(H); if (m) return m;
  m = m0.clone(); m.side = THREE.FrontSide; m.specular.setHex(0); m.vertexColors = true; const leaf = m0.alphaTest > 0, UH = { value: H };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uTime: ENV.uTime, uTreeH: UH, uHide: ENV.uHide, uMdl: ENV.uMdl, uSun: ENV.uSun, uCam: ENV.uCam, uSunL: T2SUN }, BU);
    sh.vertexShader = 'uniform float uTime, uTreeH; uniform vec3 uHide; uniform float uMdl[32]; varying float vTF; varying vec3 vTW;\n' + BLAST_GLSL + sh.vertexShader.replace('#include <color_vertex>', 'vColor = vec4(vec3(color.a), 1.0);').replace('#include <begin_vertex>', `#include <begin_vertex>
  vTF = 0.0; vTW = vec3(0.0);
  #ifdef USE_INSTANCING
  { float wk = color.r, ph = dot(instanceMatrix[3].xz, vec2(0.031)), g = color.g * 6.2832; mat3 im = mat3(instanceMatrix); float s2 = dot(im[0], im[0]), hw = uTreeH * length(im[1]);
    ${TREE_FADE && slot ? `vTF = smoothstep(${TF0.toFixed(2)}, 1.0, distance(instanceMatrix[3].xz, uHide.xz) / uMdl[${slot}]);` : ''}
    vec3 bl = blastAt(instanceMatrix[3].xyz + vec3(0.0, hw * 0.5, 0.0), 2.1 * pow(max(hw, 1.0), -0.55), 0.09, uTime); vec3 bd = vec3(bl.x, -0.5 * dot(bl.xy, bl.xy), bl.y) * hw * wk;
    transformed += vec3(dot(im[0], bd), dot(im[1], bd), dot(im[2], bd)) / max(s2, 1e-4);
    float sw = sin(uTime * 1.1 + ph) + 0.45 * sin(uTime * 2.3 + ph * 1.7);
    transformed.xz += vec2(0.7, 0.45) * (sw * 0.012 * uTreeH * wk) + vec2(cos(g), sin(g)) * (0.006 * uTreeH * wk * sin(uTime * 1.9 + g + ph)); // ствол качается, ветка - своей фазой
    transformed += color.b * (0.02 + 0.25 * bl.z * wk) * sin(uTime * vec3(6.1, 7.3, 5.2) * (1.0 + 4.0 * bl.z) + g * 3.0 + position.yzx * 2.1); } // край побега дрожит, от ударной волны - сильнее
  #endif`).replace('#include <project_vertex>', '#include <project_vertex>\n  vTW = (modelMatrix * TR_INST * vec4(transformed, 1.0)).xyz;').replace('void main() {', '#ifdef USE_INSTANCING\n#define TR_INST instanceMatrix\n#else\n#define TR_INST mat4(1.0)\n#endif\nvoid main() {');
    sh.fragmentShader = 'varying float vTF; varying vec3 vTW; uniform vec3 uSun, uCam, uSunL;\n' + sh.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n  if (vTF > 0.0 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) < vTF) discard;');
    if (leaf) sh.fragmentShader = sh.fragmentShader.replace('#include <alphatest_fragment>', '{ vec2 ts = vUv * 1024.0; float ml = 0.5 * log2(max(max(dot(dFdx(ts), dFdx(ts)), dot(dFdy(ts), dFdy(ts))), 1.0)); if (diffuseColor.a < mix(0.5, 0.26, clamp((ml - 2.0) / 3.5, 0.0, 1.0))) discard; diffuseColor.a = 1.0; ' + (tone ? LEAF_TONE('diffuseColor.rgb') : '') + ' } // порог выреза ниже на мелких мипах: редкая хвоя и берёза вдали не рассыпаются в точки').replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n  { float bk = pow(clamp(dot(normalize(vTW - uCam), uSun), 0.0, 1.0), 4.0); reflectedLight.directDiffuse += diffuseColor.rgb * uSunL * bk * 0.35 * vColor.a * smoothstep(0.55, 1.0, vColor.r); } // просвет листвы против солнца');
  };
  m.customProgramCacheKey = () => 'tr2' + (leaf ? 'l' : 'b') + (slot || 0) + (tone ? 't' : ''); M.set(H, m); return m;
}
const T2SUN = { value: new THREE.Color(0, 0, 0) };
function windMat(m0, H, slot, leafy) {
  let m = WINDM.get(m0); if (m) return m;
  m = m0.clone(); if (TREE_CAL && m.alphaTest > 0 && leafy) { m.color = m.color.clone(); m.color.r *= 0.6; m.color.g *= 0.6; m.color.b *= 0.72; } // листва города - не неоновая (альбедо 0,05-0,1)
  const prev = m0.onBeforeCompile, UH = { value: H }, ck = m0.customProgramCacheKey ? m0.customProgramCacheKey() : '';
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(m, sh, r); sh.uniforms.uTime = ENV.uTime; sh.uniforms.uTreeH = UH; Object.assign(sh.uniforms, BU, { uHide: ENV.uHide, uMdl: ENV.uMdl });
    sh.fragmentShader = 'varying float vTF;\n' + sh.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n  if (vTF > 0.0 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) < vTF) discard;');
    sh.vertexShader = 'uniform float uTime, uTreeH; uniform vec3 uHide; uniform float uMdl[32]; varying float vTF;\n' + BLAST_GLSL + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  vTF = 0.0;
  { float wk = clamp(position.y / uTreeH, 0.0, 1.0); wk *= wk;
  #ifdef USE_INSTANCING
    vec2 ph = instanceMatrix[3].xz * 0.031; mat3 im = mat3(instanceMatrix); float s2 = dot(im[0], im[0]), hw = uTreeH * length(im[1]);
    ${TREE_FADE && slot ? `vTF = smoothstep(${TF0.toFixed(2)}, 1.0, distance(instanceMatrix[3].xz, uHide.xz) / uMdl[${slot}]);` : ''}
    vec3 bl = blastAt(instanceMatrix[3].xyz + vec3(0.0, hw * 0.5, 0.0), 2.1 * pow(max(hw, 1.0), -0.55), 0.09, uTime); vec3 bd = vec3(bl.x, -0.5 * dot(bl.xy, bl.xy), bl.y) * hw * wk;
    transformed += vec3(dot(im[0], bd), dot(im[1], bd), dot(im[2], bd)) / max(s2, 1e-4) + 0.5 * bl.z * wk * sin(uTime * 41.0 + position.yzx * 9.0) * vec3(1.0);
  #else
    vec2 ph = vec2(0.0);
  #endif
    float sw = sin(uTime * 1.1 + ph.x + ph.y) + 0.45 * sin(uTime * 2.3 + ph.x * 1.7 - ph.y);
    transformed.xz += vec2(0.7, 0.45) * (sw * 0.012 * uTreeH * wk) + 0.004 * uTreeH * wk * sin(uTime * 6.5 + position.x * 3.1 + position.z * 2.3); }`);
  };
  m.customProgramCacheKey = () => ck + '|wind' + (slot || 0); WINDM.set(m0, m); return m;
}
// контейнерные площадки порта: коробка KIND.WAREHOUSE в зоне порта (её высота - city.js, штабель в 3 яруса) - ряды по 5 штабелей
// поперёк, проезды 9 м, шаг вдоль - 40 футов; ярусы 1-4, двадцатифутовые - парами. Своя случайность от номера коробки (застройка не меняется).
// Типы: [ключ, высота яруса, расцветки (столбцы атласа: 0 синий, 1 красный, 2 зелёный, 3 серый, 4 бежевый, 5 белый, 6 рыжий, 7 бордовый)]
const YT40 = [['c40', 2.591, [0, 1, 2, 3, 4, 6, 7], 0.6], ['c40hc', 2.896, [0, 1, 3, 4, 7], 0.28], ['c40r', 2.896, [5], 0.12]];
const YT20 = [['c20', 2.591, [0, 1, 2, 3, 6, 7], 0.8], ['c20ot', 2.591, [2, 3], 0.1], ['c20tank', 2.591, [3, 5], 0.1]];
function yardSets(G, B, ids, R) {
  const per = new Map(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  let cx = 0, cz = 0; // отбор по радиусу - по центру площадки (как у домов: коробка прячется по своему центру, контейнеры - вместе с ней)
  const put = (name, col, x, y, z, ry) => { const key = col == null ? name : name + ':' + col; let L = per.get(key); if (!L) per.set(key, L = { name, col, xz: [], m: [] }); m4.compose(p.set(x, y, z), q.setFromAxisAngle(Y, ry), one); L.m.push(...m4.elements); L.xz.push(cx, cz); };
  const pick = (T, r) => { let x = r(); for (const t of T) { if (x < t[3]) return t; x -= t[3]; } return T[0]; };
  const PITCH = 2.75, BLK = 5, LANE = 9, SL = 12.8;
  const YL = []; // для дальних ступеней (yardLayer): по площадке - штабели [x, z, низ, высота, поворот, цвет верхнего] и блоки рядов [x, z, низ, высота, поворот, ширина, r, g, b]
  for (const i of ids) {
    const r = mulberry32(i * 7349 + 101), longX = B.w[i] >= B.d[i], L = Math.max(B.w[i], B.d[i]), S = Math.min(B.w[i], B.d[i]); cx = B.x[i]; cz = B.z[i];
    const at = (u, v) => (longX ? [B.x[i] + u, B.z[i] + v] : [B.x[i] + v, B.z[i] + u]); // u - вдоль длинной стороны, v - поперёк
    const ry = longX ? Math.PI / 2 : 0, ns = Math.floor((L - 6) / SL); if (ns < 1) continue;
    const nb = Math.max(1, Math.floor((S - 6 + LANE) / (BLK * PITCH + LANE))), W = nb * BLK * PITCH + (nb - 1) * LANE, u0 = -ns * SL / 2;
    const rows = [], rowB = []; for (let b = 0; b < nb; b++) for (let k = 0; k < BLK; k++) { const v = -W / 2 + b * (BLK * PITCH + LANE) + (k + 0.5) * PITCH; if (Math.abs(v) <= S / 2 - 2) { rows.push(v); rowB.push(b); } }
    const yl = { x: cx, z: cz, rad: Math.hypot(L, S) / 2 + 8, st: [], bl: [] }, blk = new Map(); YL.push(yl);
    rows.forEach((v, ri) => { for (let sl = 0; sl < ns; sl++) {
      if (r() < 0.12) continue;
      const x0 = r(), lv = x0 < 0.2 ? 1 : x0 < 0.55 ? 2 : 3, u = u0 + (sl + 0.5) * SL, [gx, gz] = at(u, v); let y = GH(gx, gz); const y0 = y; let top = 0; // не выше 3 ярусов: коробка столкновений 7,8 м (city.js)
      for (let l = 0; l < lv; l++) {
        if (r() < 0.72) { const t = pick(YT40, r), [x, z] = at(u, v); top = t[2][Math.floor(r() * t[2].length)]; put(t[0], top, x, y, z, ry + (r() < 0.5 ? Math.PI : 0)); y += t[1]; }
        else { const t = pick(YT20, r); for (const du of [-3.2, 3.2]) { const [x, z] = at(u + du, v); top = t[2][Math.floor(r() * t[2].length)]; put(t[0], top, x, y, z, ry + (r() < 0.5 ? Math.PI : 0)); } y += t[1]; }
      }
      yl.st.push(gx, gz, y0, y - y0, ry, top);
      const bk = rowB[ri] * 1000 + sl; let q = blk.get(bk); if (!q) blk.set(bk, q = { u, b: rowB[ri], vs: [], h: 0, y0: 1e9, c: [0, 0, 0], n: 0 });
      q.vs.push(v); q.h += y - y0; q.y0 = Math.min(q.y0, y0); const pc = YARD_PAL[top]; q.c[0] += pc.r; q.c[1] += pc.g; q.c[2] += pc.b; q.n++;
    } });
    for (const q of blk.values()) { const v0 = Math.min(...q.vs) - PITCH / 2, v1 = Math.max(...q.vs) + PITCH / 2, [x, z] = at(q.u, (v0 + v1) / 2); yl.bl.push(x, z, q.y0, q.h / q.n, ry, v1 - v0, q.c[0] / q.n, q.c[1] / q.n, q.c[2] / q.n); }
    // козловой кран над блоком (пролёт 24,8 м - поперёк рядов, по X модели) и ричстакер в проезде у торца
    for (let b = 0; b < nb; b++) { const v = -W / 2 + b * (BLK * PITCH + LANE) + BLK * PITCH / 2; if (ns < 3 || Math.abs(v) + 13.8 > S / 2 || r() >= 0.8) continue; const u = u0 + (1 + Math.floor(r() * (ns - 2))) * SL, [x, z] = at(u, v); put('c_rtg', null, x, GH(x, z), z, longX ? -Math.PI / 2 : 0); } // пролёт 24,8 м: ноги в проездах по 9 м, не в соседних рядах
    if (L - ns * SL > 26 && r() < 0.6) { const sd = r() < 0.5 ? -1 : 1, [x, z] = at(sd * (ns * SL / 2 + 7), rows[Math.floor(r() * rows.length)] || 0); put('c_reach', null, x, GH(x, z), z, ry + (sd < 0 ? 0 : Math.PI)); } // вдоль ряда, захватом к штабелю, 7 м от торца
  }
  for (const [key, L] of per) G.addNear('y_' + key, YARD, L.name, R, Float32Array.from(L.xz), Float32Array.from(L.m), { col: L.col });
  return YL;
}
// цвета контейнеров вдали (столбцы атласа, линейные): синий, красный, зелёный, серый, бежевый, белый, рыжий, бордовый
const YARD_PAL = ['#2f5d8e', '#a3352c', '#3d7448', '#83898e', '#bfa983', '#d6d7d3', '#c06a2e', '#6c2c2c'].map(lin);
// дальние ступени площадок порта (Mark 2026-11-15: «чтобы всегда были видны контейнеры, однако чем дальше - тем более упрощенная их версия»):
// вблизи - модели контейнеров, дальше (YARD_FAR) - те же контейнеры упрощённой сеткой, дальше (YARD_ST) - штабель одним бруском цвета верхнего,
// ещё дальше - блок рядов одним бруском (средняя высота и цвет). Коробка площадки (шейдер) не рисуется совсем
const YARD_ST = 2200;
// деревья: между моделью вблизи и снимками леса вдали была упрощённая сетка (farIndex) - у елей от неё оставался «столб с ветками внизу»
// (Mark 2026-11-15). Теперь от края моделей сразу снимки (TREE_IMP); ?treemid=1 - как было (проверка)
const TREE_MID = typeof location !== 'undefined' && /[?&]treemid=1/.test(location.search);
function yardLayer(scene, YL, sh) {
  const g0 = new THREE.BoxGeometry(1, 1, 1); g0.translate(0, 0.5, 0); const ix = g0.index.array, keep = []; for (let i = 0; i < ix.length; i += 6) if (i !== 18) for (let k = 0; k < 6; k++) keep.push(ix[i + k]); g0.setIndex(keep); // без дна (грань −Y)
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  let nS = 0, nB = 0; for (const y of YL) { nS += y.st.length / 6; nB += y.bl.length / 9; }
  const mk = (n) => { const m = new THREE.InstancedMesh(g0, mat, Math.max(1, n)); m.count = 0; m.visible = false; m.frustumCulled = false; m.castShadow = false; m.receiveShadow = !!sh.receive; m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n) * 3), 3); scene.add(m); return m; };
  const mS = mk(nS), mB = mk(nB), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s = new THREE.Vector3();
  let lx = 1e9, lz = 1e9, lr = -1; const inN = new Uint8Array(YL.length), inN0 = new Uint8Array(YL.length);
  const fill = (pc, near) => {
      let cs = 0, cb = 0; const aS = mS.instanceMatrix.array, aB = mB.instanceMatrix.array, kS = mS.instanceColor.array, kB = mB.instanceColor.array;
      for (const y of YL) {
        const d = Math.hypot(y.x - pc.x, y.z - pc.z); if (d < near) continue;
        if (d < YARD_ST) for (let j = 0; j < y.st.length; j += 6) { const c = YARD_PAL[y.st[j + 5]]; m4.compose(p.set(y.st[j], y.st[j + 2], y.st[j + 1]), q.setFromAxisAngle(Y, y.st[j + 4]), s.set(2.44, y.st[j + 3], 12.4)); m4.toArray(aS, cs * 16); kS[cs * 3] = c.r; kS[cs * 3 + 1] = c.g; kS[cs * 3 + 2] = c.b; cs++; }
        else for (let j = 0; j < y.bl.length; j += 9) { m4.compose(p.set(y.bl[j], y.bl[j + 2], y.bl[j + 1]), q.setFromAxisAngle(Y, y.bl[j + 4]), s.set(y.bl[j + 5], y.bl[j + 3], 12.4)); m4.toArray(aB, cb * 16); kB[cb * 3] = y.bl[j + 6]; kB[cb * 3 + 1] = y.bl[j + 7]; kB[cb * 3 + 2] = y.bl[j + 8]; cb++; }
      }
      for (const [m, c] of [[mS, cs], [mB, cb]]) { m.count = c; m.visible = c > 0; if (c) { m.instanceMatrix.updateRange.count = c * 16; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; } }
  };
  return {
    meshes: [mS, mB],
    // pc - камера, near - до какого радиуса площадку рисуют модели контейнеров (0 - ещё не пришли). Пересчёт - после 30 м пути или как только
    // хоть одна площадка перешла через радиус моделей (иначе на границе она пропадала бы или рисовалась дважды до следующего пересчёта)
    tick(pc, near) {
      let ch = near !== lr || Math.abs(pc.x - lx) >= 30 || Math.abs(pc.z - lz) >= 30;
      for (let i = 0; i < YL.length; i++) { inN[i] = Math.hypot(YL[i].x - pc.x, YL[i].z - pc.z) < near ? 1 : 0; if (inN[i] !== inN0[i]) ch = true; }
      if (!ch) return; inN0.set(inN); lx = pc.x; lz = pc.z; lr = near; fill(pc, near);
    },
    // окно ТВ: на время его кадра - от точки, куда смотрит контейнер (там свои модели в радиусе R); restore - снова от камеры
    pod(at, R) { fill(at, R); },
    restore() { if (lr >= 0) fill({ x: lx, z: lz }, lr); },
  };
}
function nearHouses(G, scene, B, near, P, sh) {
  KB.length = 0; OFFB = new Uint8Array(0); OFFH = new Uint8Array(0); KITGS.clear(); // свои дома: данные прошлой сборки города - не тащить
  const R = P.bldNear || 0, sets = (G.sets = new Map()), mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s = new THREE.Vector3();
  ENV.uMdl.value.fill(0); // город пересобран - коробки снова видны, пока не придут модели
  if (!R) return;
  // набор моделей вблизи: slot - номер в uMdl (коробки / процедурные деревья с этим aMdl прячутся в радиусе), 0 - прятать нечего
  // (фонари); xz - центры (по ним видимость), mats - готовые матрицы
  // o.col - цвет контейнера (сдвиг u атласа на col/8, colMat); o.wind - высота модели дерева (покачивание, windMat)
  G.addNear = (key, slot, name, Rs, xz, mats, o = {}) => {
    const n = xz.length / 2; if (!n) return;
    const im = new THREE.InstancedBufferAttribute(new Float32Array(n * 16), 16); im.setUsage(THREE.DynamicDrawUsage);
    // сетка ячеек GC × GC м: отбор перебирает только ячейки в радиусе, а не все экземпляры города
    const cells = new Map(), gb = [1e9, -1e9, 1e9, -1e9]; // gb - занятые ячейки (радиус на всю карту, ?full=1, не перебирает пустые)
    for (let j = 0; j < n; j++) {
      const ix = Math.floor(xz[j * 2] / GC), iz = Math.floor(xz[j * 2 + 1] / GC), k = gkey(ix, iz); let c = cells.get(k); if (!c) cells.set(k, c = []); c.push(j);
      gb[0] = Math.min(gb[0], ix); gb[1] = Math.max(gb[1], ix); gb[2] = Math.min(gb[2], iz); gb[3] = Math.max(gb[3], iz);
    }
    const grid = new Map(); for (const [k, c] of cells) grid.set(k, Int32Array.from(c));
    sets.set(key, { slot, name, xz, mats, im, n, meshes: [], R: Rs, grid, gb, col: o.col ?? null, wind: o.wind || 0, part: o.part || null, rIn: o.rIn || 0, kit: o.kit || 0, kitR: o.kitR || 0, pack: o.pack || null });
  };
  for (let v = 1; v < BLD.length; v++) {
    if (!BLD[v] || !near[v].length || (KIT_ON && KIT_SER.some((q) => q.v === v)) || (PH_ON && PH[v])) continue;
    const ids = near[v], [, mx, my, mz, house] = BLD[v];
    // длинный дом - несколькими секциями модели подряд (окна не растягиваются); видимость - по центру всего дома
    const mLongX = mx > mz, mL = Math.max(mx, mz), segs = [];
    for (const i of ids) {
      const longX = B.w[i] > B.d[i], L = Math.max(B.w[i], B.d[i]), S0 = Math.min(B.w[i], B.d[i]), wh = WH.includes(v), ns = house ? 1 : wh ? whGrid(v, L, S0)[0] : Math.max(1, Math.round(L / mL)), nw = wh ? whGrid(v, L, S0)[1] : 1;
      for (let k = 0; k < ns; k++) for (let c = 0; c < nw; c++) segs.push([i, longX, (k + 0.5) * L / ns - L / 2, L / ns, S0 / nw, (c + 0.5) * S0 / nw - S0 / 2]); // цеха - и поперёк (whGrid)
    }
    const n = segs.length, xz = new Float32Array(n * 2), mats = new Float32Array(n * 16);
    segs.forEach(([i, longX, off, sl, S, co], j) => {
      const flip = ((i * 2654435761 + j * 40503) >>> 0) % 2 ? Math.PI : 0;
      q.setFromAxisAngle(Y, (mLongX === longX ? 0 : Math.PI / 2) + flip);
      s.set((mLongX ? sl : S) / mx, B.h[i] / my, (mLongX ? S : sl) / mz); // вдоль длинной оси модели - секция, поперёк - ширина дома
      if (house) s.setScalar(Math.min(s.x, s.z)); // частный дом - без растяжения: свои пропорции, вписан в участок
      const x = B.x[i] + (longX ? off : co), z = B.z[i] + (longX ? co : off);
      const hx = (longX ? sl : S) / 2, hz = (longX ? S : sl) / 2; // на склоне (рельеф) - по нижнему углу секции: верхняя сторона уходит в землю, а не висит нижняя
      mtx.compose(p.set(x, (RELIEF ? Math.min(GH(x, z), GH(x - hx, z - hz), GH(x + hx, z - hz), GH(x - hx, z + hz), GH(x + hx, z + hz)) : GH(x, z)) - 0.2, z), q, s); mtx.toArray(mats, j * 16);
      xz[j * 2] = B.x[i]; xz[j * 2 + 1] = B.z[i];
    });
    // мелких частных домов много - их радиус меньше; офисный корпус издали светлый и плоский - дальше коробки с фасадом
    G.addNear('b' + v, v, BLD[v][0], P.full ? R : house ? R * 0.6 : BLD[v][0] === 'o_block' ? Math.min(R, 700) : R, xz, mats); // ?full=1 - все полными моделями
  }
  // контейнерные площадки порта (вид YARD): ряды штабелей вдоль длинной стороны коробки, проезды, козловой кран и ричстакер;
  // радиус - как у частных домов (контейнеров много)
  if (near[YARD] && near[YARD].length) { const YL = yardSets(G, B, near[YARD], P.full ? R : R * 0.6); G.yardL = yardLayer(scene, YL, sh); }
  // модель пришла: по мешу на материал, общая матрица инстансов; коробки этого вида вблизи прячутся
  // радиус моделей вблизи по роли (Mark 2026-11-08: «если играется самолет - то можно в самом минимальном разрешении это выдавать - в первую
  // очередь то что на земле будет важно при игре на пво»): k = 1 - ПВО и меню, меньше - самолёт; коробки и импосторы прячутся в том же радиусе
  G.kitOn = new Map(); G.nearScale = (k) => { G.kitK = k; for (const [v, r] of G.kitOn) ENV.uMdl.value[v] = r * k; for (const S of sets.values()) { if (S.R0 === undefined) { S.R0 = S.R; S.rIn0 = S.rIn; } S.R = S.R0 * k; S.rIn = S.rIn0 * k; if (S.tr) { S.Rf = S.Rf0 * k; if (S.R10) S.R1 = S.R10 * k; ENV.uMdl.value[S.slot] = S.Rf; continue; } if (S.R1 !== undefined) S.R1 = Math.max(120, S.R * 0.45); if (S.meshes.length && S.slot && !S.far) ENV.uMdl.value[S.slot] = S.R; } lx = 1e9; if (G.grassT) G.grassT.scale(k); };
  G.nearDirty = () => { lx = 1e9; }; // покров земли пришёл - пересчитать и стоящей камере
  // модуль набора пришёл: один меш (часть модели по имени), без упрощения и импостора - у набора свои *_lod1 (кольцо rIn…R)
  const LOD1_K = FAC_ON ? { bld_tw_b: 0.85, bld_tw_g: 0.85, bld_tw_t: 0.85, bld_d12_b: 0.88, bld_d12_g: 0.95, bld_d12_t: 0.97, bld_hr_c: 0.81, bld_ii49: 0.98, bld_d16_b: 0.96, bld_d16_t: 0.97 } : {}, L1M = new Map();
  const lod1Mat = (m0, k) => { let m = L1M.get(m0.uuid + k); if (!m) { m = m0.clone(); m.onBeforeCompile = m0.onBeforeCompile; m.customProgramCacheKey = m0.customProgramCacheKey; m.color.multiplyScalar(k); L1M.set(m0.uuid + k, m); } return m; };
  const kitAttach = (S, key, group) => {
    if (KITGS.get(S.name) !== group) { KITGS.set(S.name, group); group.traverse((q) => { if (q.isMesh && !q.material.userData.kitM) { q.material.userData.kitM = 1; q.material.specular.setHex(0x0c0c0c); q.material.shininess = 10; if (G.winter) snowify(q.material); kitGlass(q.material); } }); if (dmgB.size || dmgH.size) kitDirty = true; } // все модули серии: матовые, зимой со снегом; задетые до прихода модели - дорисовать
    let c;
    if (S.part.startsWith('C:')) c = { geometry: ofCardGeo(), material: ofCardMat(S.part.slice(2), group), varM: true }; // плоскость фасада офиса / стекла
    else if (S.part.startsWith('V:')) { // варианты этажа одним набором: номер варианта экземпляра - в ячейке [0][3] матрицы (kitVarMat), чужие варианты - в точку
      const gs = []; for (let v = 0; v < 4; v++) { const cv = S.part.slice(2).replace(/#/g, v).split('+').map((n) => group.getObjectByName(n)); if (cv.some((q) => !q || !q.isMesh)) { console.warn('свои дома: нет варианта', v, S.part); return; } const g = kitMerge(cv.map((q) => q.geometry)); g.setAttribute('aVar', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(v), 1)); gs.push(g); }
      const m0 = group.getObjectByName(S.part.slice(2).replace(/#/g, 0).split('+')[0]).material; c = { geometry: kitMerge(gs), material: kitVarMat(m0), varM: true };
    } else {
      const cs = S.part.split('+').map((n) => group.getObjectByName(n)); if (cs.some((q) => !q || !q.isMesh)) return;
      c = cs.length > 1 ? { geometry: kitMerge(cs.map((q) => q.geometry)), material: cs[0].material } : cs[0];
    }
    const lk = /_lod1/.test(S.part) && LOD1_K[S.name]; // упрощённая половина света не теряет (нет балконов и ниш) - чуть темнее, чтобы смена не мигала (замер tools: средний цвет фасада с одной камеры)
    const m = new THREE.InstancedMesh(c.geometry, lk ? lod1Mat(c.material, lk) : c.material, S.n); if (c.varM) m.customDepthMaterial = c.material.userData.depthM; m.instanceMatrix = S.im; m.count = 0; m.frustumCulled = false; m.userData.set = key;
    m.castShadow = !!sh.cast && !S.rIn; m.receiveShadow = !!sh.receive; scene.add(m); S.meshes.push(m); // упрощённые (кольцо дали) - без тени: за коробкой теней
    if (!c.geometry.boundingSphere) c.geometry.computeBoundingSphere();
    const bs = c.geometry.boundingSphere, r0 = bs.center.length() + bs.radius;
    S.rad = new Float32Array(S.n); S.cxyz = new Float32Array(S.n * 3);
    for (let j = 0, e = S.mats; j < S.n; j++) { const o = j * 16, k = Math.max(Math.hypot(e[o], e[o + 1], e[o + 2]), Math.hypot(e[o + 4], e[o + 5], e[o + 6]), Math.hypot(e[o + 8], e[o + 9], e[o + 10])); S.rad[j] = r0 * k + 45; S.cxyz[j * 3] = e[o + 12]; S.cxyz[j * 3 + 1] = e[o + 13]; S.cxyz[j * 3 + 2] = e[o + 14]; }
    const serAll = (KIT_SER.find((q) => q.v === S.kit) || { models: PH_MODELS[S.kit] || [S.name] }).models.every((q) => KITGS.has(q)); // хрущёвки A и C - один вид: коробки прятать, когда пришли обе
    if (S.kit && !G.kitOn.has(S.kit) && serAll) { // первый модуль вида пришёл - его коробки прячутся до внешнего радиуса; цвет коробок дали - по атласу серии
      const kr = S.kitR || G.kitRf; G.kitOn.set(S.kit, kr); ENV.uMdl.value[S.kit] = kr * (G.kitK || 1); const mc = modelColor(group); if (mc) ENV.uMdlCol.value[S.kit].set(mc.r, mc.g, mc.b, 1); }
    { const q = KIT_FAC.get(S.kit), t = q ? q.ser.models.indexOf(S.name) : -1; if (t >= 0) facadeRow(G.renderer, group, q.ser, q.row + t, LOD1_K[S.name] || 1);
      else if (S.kit !== OFV && !S.sf && PH[S.kit] && !S.part.includes('|') && c.geometry && c.geometry.boundingSphere.radius > 4) { S.sf = 1; const gr = new THREE.Group(); gr.add(new THREE.Mesh(c.geometry, c.material)); const sf = surfColors(G.renderer, gr); if (sf) { ENV.uMdlCol.value[S.kit].set(...sf.wall, 2); if (sf.roof) ENV.uMdlRf.value[S.kit].set(...sf.roof, 1); } } } // частный дом и сталинка: цвет стен и крыши - снимком // фасад - в атлас коробок дали
    lx = 1e9;
  };
  // материал набора вариантов: клон материала модели; номер варианта экземпляра - instanceMatrix[0][3] (в аффинной матрице там 0): вершины чужих
  // вариантов (aVar ≠ номер) - в точку (треугольники нулевые, не рисуются), ячейка обнуляется перед умножением. Тени - тот же отбор (customDepthMaterial)
  const KVAR_GLSL = (src) => src.replace('#include <common>', '#include <common>\nattribute float aVar;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n  #ifdef USE_INSTANCING\n  if (abs(aVar - instanceMatrix[0][3]) > 0.5) transformed = vec3(0.0);\n  mat4 kIM = instanceMatrix; kIM[0][3] = 0.0;\n  #endif')
    .replace('#include <project_vertex>', THREE.ShaderChunk.project_vertex.replace('instanceMatrix * mvPosition', 'kIM * mvPosition'))
    .replace('#include <worldpos_vertex>', THREE.ShaderChunk.worldpos_vertex.replace('instanceMatrix * worldPosition', 'kIM * worldPosition'));
  const kitVarMat = (m0) => {
    if (m0.userData.varMat) return m0.userData.varMat;
    const m = m0.clone(), prev = m0.onBeforeCompile, pk = m0.customProgramCacheKey(); m.onBeforeCompile = (sh, r) => { if (prev) prev.call(m, sh, r); sh.vertexShader = KVAR_GLSL(sh.vertexShader); }; m.customProgramCacheKey = () => pk + 'kitvar'; // поверх своих подмен модели (снег и т. п.)
    const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }); d.onBeforeCompile = (sh) => { sh.vertexShader = KVAR_GLSL(sh.vertexShader); }; d.customProgramCacheKey = () => 'kitvard';
    m.userData.depthM = d; m0.userData.varMat = m; return m;
  };
  // стёкла своих домов: маска окон - канал B карты ORM модели (сборщик, 2026-11-17); на стекле - отражение неба / земли по отражённому лучу
  // (небо и земля - цвета полусферного света погоды) с силой по Френелю; у плоскостей фасада (ofCardMat, KG_CARD) - те же координаты атласа kUv
  const KGU = { uGlSky: { value: new THREE.Color() }, uGlGnd: { value: new THREE.Color() }, uGlI: { get value() { return G.hemi ? Math.min(1.2, G.hemi.intensity) : 1; } } }; // сила полусферного света - яркость отражения
  const kitGlass = (m) => {
    // телефоны без теней («Средний», «Низкий») - без стёкол: карты ORM - лишние ~20 МБ видеопамяти; материал без текстур - без uv в шейдере
    const orm = m.kitOrm; if (!orm || (!m.map && !m.normalMap) || (TOUCH_GT && !P.shadows) || m.userData.kitGl || /[?&]glass=0/.test(typeof location !== 'undefined' ? location.search : '')) return; m.userData.kitGl = 1;
    if (G.hemi) { KGU.uGlSky.value = G.hemi.color; KGU.uGlGnd.value = G.hemi.groundColor; }
    const prev = m.onBeforeCompile, pk = m.customProgramCacheKey(), U = { tOrm: { value: orm } };
    m.onBeforeCompile = (sh, r) => {
      if (prev) prev.call(m, sh, r); Object.assign(sh.uniforms, U, KGU);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tOrm; uniform vec3 uGlSky, uGlGnd; uniform float uGlI;')
        .replace('#include <output_fragment>', `{
  #ifdef KG_CARD
  float wm = TXG(tOrm, kUv, dUx, dUy).b;
  #else
  float wm = texture2D(tOrm, vUv).b;
  #endif
  if (wm > 0.02) { vec3 Vv = normalize(vViewPosition), Rv = reflect(-Vv, normal); float up = dot(Rv, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz));
    float fr = 0.04 + 0.96 * pow(1.0 - clamp(dot(normal, Vv), 0.0, 1.0), 5.0);
    vec3 env = mix(uGlGnd * 0.55, uGlSky * mix(1.15, 0.8, clamp(up, 0.0, 1.0)), smoothstep(-0.15, 0.2, up)) * uGlI;
    outgoingLight = mix(outgoingLight, env, wm * clamp(0.22 + 0.7 * fr, 0.0, 0.85)); }
}
#include <output_fragment>`);
    };
    m.customProgramCacheKey = () => pk + 'kgl'; m.needsUpdate = true;
  };
  // плоскость фасада офиса / стекла (дальний вид): шаг и этаж - в шейдере; грань шага *_lod1 вида (облицовка × вестибюль / рядовой / тех / верх) - прямоугольник
  // атласа (углы из модели: U00 - низ шага слева, ex - вдоль, ey - вверх). Матрица экземпляра: [0][3] - шагов, [1][3] - этажей, [2][3] - код (облицовка
  // + 8 · вестибюль + 16 · верхний этаж с парапетом); ячейки обнуляются перед умножением (и в проходе теней)
  const OFC_V = (src) => src.replace('#include <common>', '#include <common>\nvarying vec2 vCd; varying vec3 vCp; varying float vCw;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n  #ifdef USE_INSTANCING\n  vCp = vec3(instanceMatrix[0][3], instanceMatrix[1][3], instanceMatrix[2][3]);\n  mat4 kIM = instanceMatrix; kIM[0][3] = 0.0; kIM[1][3] = 0.0; kIM[2][3] = 0.0;\n  vCw = length(kIM[0].xyz);\n  #else\n  mat4 kIM = mat4(1.0); vCp = vec3(1.0, 1.0, 0.0); vCw = 1.0;\n  #endif\n  vCd = vec2(position.x + 0.5, position.y);')
    .replace('#include <project_vertex>', THREE.ShaderChunk.project_vertex.replace('instanceMatrix * mvPosition', 'kIM * mvPosition'))
    .replace('#include <worldpos_vertex>', THREE.ShaderChunk.worldpos_vertex.replace('instanceMatrix * worldPosition', 'kIM * worldPosition'));
  const ofCardGeo = () => G._ofCG || (G._ofCG = (() => { const g = new THREE.PlaneGeometry(1, 1); g.rotateY(Math.PI); g.translate(0, 0.5, 0); return g; })());
  const ofCardMat = (fam, group) => {
    const F = OFS[fam], m0 = group.getObjectByName('bay_' + F.st[0] + '_floor0_s0').material; if (m0.userData['card' + fam]) return m0.userData['card' + fam];
    const K0 = [], KX = [], KY = [];
    for (const s of F.st) for (const kd of [F.k0, 'floor', 'tech', 'top']) {
      const o = group.getObjectByName('bay_' + s + '_' + kd + '_lod1'), P = o.geometry.attributes.position, U = o.geometry.attributes.uv;
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (let k = 0; k < P.count; k++) { x0 = Math.min(x0, P.getX(k)); x1 = Math.max(x1, P.getX(k)); y0 = Math.min(y0, P.getY(k)); y1 = Math.max(y1, P.getY(k)); }
      const at = (x, y) => { let b = 0, bd = 1e9; for (let k = 0; k < P.count; k++) { const d = Math.hypot(P.getX(k) - x, P.getY(k) - y); if (d < bd) { bd = d; b = k; } } return new THREE.Vector2(U.getX(b), U.getY(b)); };
      const u00 = at(x0, y0); K0.push(u00); KX.push(at(x1, y0).sub(u00)); KY.push(at(x0, y1).sub(u00));
    }
    const NK = K0.length, C = `const float LH = ${F.LH.toFixed(2)}, FH = ${F.FH.toFixed(2)}, PAR = ${F.PAR.toFixed(2)}, TECH = ${F.TECH.toFixed(1)}, C0 = ${F.C0.toFixed(2)};\n`;
    const U = { uK0: { value: K0 }, uKX: { value: KX }, uKY: { value: KY } };
    // ym - высота в метрах сборщика (ярус растянут в свою коробку: этаж в шейдере - без растяжения, как у настоящих шагов); шаги - между углами (C0)
    const FR = `{ float n = vCp.x, Fn = vCp.y, code = vCp.z, sty = mod(code, 8.0), lob = mod(floor(code / 8.0 + 0.01), 2.0), topf = mod(floor(code / 16.0 + 0.01), 2.0), cham = mod(floor(code / 32.0 + 0.01), 2.0);
  float cc = cham > 0.5 ? 0.0 : C0, bx = clamp((vCd.x * vCw - cc) / max(vCw - 2.0 * cc, 0.1), 0.0, 0.9999) * n, ym = vCd.y * (lob * LH + (Fn - lob) * FH + topf * PAR), fu = fract(bx), zl = lob * LH, last = Fn - 1.0, kind, fy, kh, f;
  if (lob > 0.5 && ym < LH) { kind = 0.0; fy = ym / LH; kh = LH; }
  else { float r = (ym - zl) / FH; f = lob + floor(r);
    if (topf > 0.5 && f >= last - 0.5) { kind = 3.0; kh = FH + PAR; fy = clamp((ym - zl - (last - lob) * FH) / kh, 0.0, 1.0); }
    else { f = min(f, last); kind = mod(f, TECH) > TECH - 1.5 ? 2.0 : 1.0; kh = FH; fy = fract(r); } }
  int k = int(sty * 4.0 + kind + 0.5); vec2 ko = uK0[k], ex = uKX[k], ey = uKY[k];
  kUv = ko + fu * ex + fy * ey; dUx = dFdx(bx) * ex + dFdx(ym) / kh * ey; dUy = dFdy(bx) * ex + dFdy(ym) / kh * ey; }\n`;
    const m = m0.clone(), prev = m0.onBeforeCompile, pk = m0.customProgramCacheKey(); m.extensions = { derivatives: true, shaderTextureLOD: true };
    m.onBeforeCompile = (sh, r) => {
      sh.fragmentShader = '#define KG_CARD\n' + sh.fragmentShader; if (prev) prev.call(m, sh, r); Object.assign(sh.uniforms, U); sh.vertexShader = OFC_V(sh.vertexShader);
      let fs = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec2 vCd; varying vec3 vCp; varying float vCw; uniform vec2 uK0[${NK}]; uniform vec2 uKX[${NK}]; uniform vec2 uKY[${NK}]; vec2 kUv, dUx, dUy;\n${C}#if __VERSION__ >= 300 || defined(GL_EXT_shader_texture_lod)\n#define TXG(t, uv, gx, gy) texture2DGradEXT(t, uv, gx, gy)\n#else\n#define TXG(t, uv, gx, gy) texture2D(t, uv)\n#endif`)
        .replace('#include <map_fragment>', FR + THREE.ShaderChunk.map_fragment.replace('texture2D( map, vUv )', 'TXG( map, kUv, dUx, dUy )'))
        .replace('#include <normalmap_pars_fragment>', THREE.ShaderChunk.normalmap_pars_fragment.replace(/dFdx\( vUv\.st \)/g, 'dUx').replace(/dFdy\( vUv\.st \)/g, 'dUy'))
        .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace(/texture2D\( normalMap, vUv \)/g, 'TXG( normalMap, kUv, dUx, dUy )'));
      if (!/TXG\( map, kUv/.test(fs) || /texture2D\( normalMap, vUv \)/.test(fs) || /texture2D\( map, vUv \)/.test(fs)) console.warn('офисы: подстановка шейдера плоскости не сработала', fam);
      sh.fragmentShader = fs;
    };
    m.customProgramCacheKey = () => pk + 'ofcard' + fam;
    const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }); d.onBeforeCompile = (sh) => { sh.vertexShader = OFC_V(sh.vertexShader); }; d.customProgramCacheKey = () => 'ofcardd';
    m.userData.depthM = d; m0.userData['card' + fam] = m; return m;
  };
  const kitMerge = (gs) => {
    const g = new THREE.BufferGeometry(), names = Object.keys(gs[0].attributes).filter((a) => gs.every((q) => q.attributes[a]));
    for (const a of names) { const A = gs.map((q) => q.attributes[a]), n = A.reduce((t, x) => t + x.array.length, 0), arr = new A[0].array.constructor(n); let o = 0; for (const x of A) { arr.set(x.array, o); o += x.array.length; } g.setAttribute(a, new THREE.BufferAttribute(arr, A[0].itemSize, A[0].normalized)); }
    const ix = []; let base = 0; for (const q of gs) { const I = q.index ? q.index.array : Array.from({ length: q.attributes.position.count }, (_, k) => k); for (let k = 0; k < I.length; k++) ix.push(I[k] + base); base += q.attributes.position.count; }
    g.setIndex(base > 65535 ? new THREE.Uint32BufferAttribute(ix, 1) : new THREE.Uint16BufferAttribute(ix, 1)); g.computeBoundingSphere(); return g;
  };
  // кровля секции sI из N (в осях серии): плоская - roof_F + roof_Y; вальмовая (хрущёвка C) - средние как плоская, крайние - срезанные вальмой roof_*_e
  // (правая - повёрнута на 180°); торцевые половины вальмы cor_roof_* - у торцов (у упрощённых вдали их нет). Возвращает [имя, x, z, поворот]
  const kitRoof = (ser, hip, N, sI, lod) => {
    const xs = -N * ser.SEC / 2 + ser.SEC / 2 + sI * ser.SEC;
    if (!hip || (sI > 0 && sI < N - 1)) return [['roof_F' + lod + '+roof_Y' + lod, xs, 0, false]];
    return [['roof_F_e' + lod + '+roof_Y_e' + lod, xs, sI === 0 ? 0 : ser.DEP, sI !== 0]];
  };
  // свои дома модулями (Свои/Дома города, паспорта серий; KIT_SER): секции по длине, этажи, половины по глубине (F - сторона подъездов, Y - двор),
  // углы торцов, кровля. Каждый модуль - свой набор экземпляров: у целых половины склеены одним экземпляром. Видимость - по центру дома
  // (дом появляется целиком): полные модули - до R, упрощённые *_lod1 - кольцом R…Rf, дальше коробки
  const kitHouses = (G, B, R, Rf) => {
    const list = new Map(), mt = new THREE.Matrix4(), mb = new THREE.Matrix4(), mm = new THREE.Matrix4(), rot = new THREE.Matrix4().makeRotationY(Math.PI);
    let bi = 0; const put = (M, name, xzc, m) => { const k = M + '|' + name; let L = list.get(k); if (!L) list.set(k, L = { xz: [], mats: [], bi: [] }); L.xz.push(xzc[0], xzc[1]); L.mats.push(...m.elements); L.bi.push(bi); };
    KB.length = 0;
    for (const ser of KIT_SER) for (const i of (near[ser.v] || [])) {
      // тип - по старшим битам номера (не совпадает с поворотом и чётностью)
      const t = ser.models.length > 1 ? (Math.imul(i, 2246822519) >>> 16) % ser.models.length : 0, M = ser.models[t], hip = !!ser.hip[t], SEC = ser.SEC, DEP = ser.DEP, FL = ser.FL;
      const longX = B.w[i] > B.d[i], L = Math.max(B.w[i], B.d[i]), S0 = Math.min(B.w[i], B.d[i]), N = Math.max(ser.minN, Math.min(ser.maxN || 8, Math.round(L / SEC))), F = Math.max(2, Math.round((B.h[i] - 1.5) / FL));
      const flip = (Math.imul(i, 2654435761) >>> 20) & 1 ? Math.PI : 0, yaw = (longX ? 0 : Math.PI / 2) + flip;
      const hx = longX ? L / 2 : S0 / 2, hz = longX ? S0 / 2 : L / 2, x0 = B.x[i], z0 = B.z[i];
      const y0 = (RELIEF ? Math.min(GH(x0, z0), GH(x0 - hx, z0 - hz), GH(x0 + hx, z0 - hz), GH(x0 - hx, z0 + hz), GH(x0 + hx, z0 + hz)) : GH(x0, z0)) - 0.2;
      // дом: центр участка, поворот, растяжение по длине и глубине (секций - по длине: окна почти не меняются), фасад подъездов - на −Z
      mb.makeRotationY(yaw).premultiply(mt.makeTranslation(x0, y0, z0)).multiply(mt.makeScale(L / (N * SEC), 1, S0 / DEP)).multiply(mt.makeTranslation(0, 0, -DEP / 2));
      const c = [x0, z0];
      KB.push({ i, ser, M, hip, N, F, x0, z0, y0, R: Math.hypot(L, S0) / 2, mb: mb.clone(), inv: mb.clone().invert(), st: new Uint8Array(N * F * 2), coll: new Int16Array(N).fill(-1), hits: 0 });
      for (const lod of ['', '_lod1']) {
        // целые: лицевая и дворовая половины - одним экземпляром (склейка «A+B»; разделятся при разрушении); вдали - один вариант
        const st = lod || '_s0', at = (x, y, z) => mm.copy(mb).multiply(mt.makeTranslation(x, y, z)), FY = (n) => n.replace('#', 'F') + '+' + n.replace('#', 'Y'), tag = '|' + lod;
        for (let sI = 0; sI < N; sI++) {
          const xs = -N * SEC / 2 + SEC / 2 + sI * SEC;
          for (let f = 0; f < F; f++) {
            const v = lod ? 0 : (sI * 3 + f * 5 + i) % 4, y = f === 0 ? 0 : 1.0 + f * FL;
            if (f === 0) put(M, FY('sec_ground_#' + st) + tag, c, at(xs, y, 0));
            else if (lod || !KVAR) put(M, FY((f === F - 1 ? 'sec_top' : 'sec_floor') + v + '_#' + st) + tag, c, at(xs, y, 0)); // ?kvar=0 - варианты отдельными наборами (как раньше)
            else { const kind = f === F - 1 ? 'sec_top' : 'sec_floor', m = at(xs, y, 0); m.elements[3] = v; put(M, 'V:' + kind + '#_F' + st + '+' + kind + '#_Y' + st + tag, c, m); } // варианты - одним набором (kitVarMat)
          }
          for (const [nm, x, z, r] of kitRoof(ser, hip, N, sI, lod)) put(M, nm + tag, c, r ? mm.copy(mb).multiply(mt.makeTranslation(x, 1.0 + F * FL, z)).multiply(rot) : at(x, 1.0 + F * FL, z));
        }
        // углы торцов: левый - на −X, правый - та же склейка, повёрнутая на 180° (паспорт: правый-F = угол Y повёрнутый); вальма - половины на торцах
        for (let f = 0; f <= F; f++) {
          if (f === F && !(hip && !lod)) continue;
          const y = f === 0 ? 0 : 1.0 + f * FL, nm = (f === F ? 'cor_roof_F+cor_roof_Y' : FY((f === 0 ? 'cor_ground' : f === F - 1 ? 'cor_top' : 'cor_floor') + '_#' + st)) + tag;
          put(M, nm, c, at(-N * SEC / 2, y, 0)); put(M, nm, c, mm.copy(mb).multiply(mt.makeTranslation(N * SEC / 2, y, DEP)).multiply(rot));
        }
      }
      bi++;
    }
    OFFB = new Uint8Array(KB.length);
    G.kitRf = Rf;
    for (const [k, Ls] of list) {
      const [M, part, lod] = k.split('|'), key = 'kit:' + M + ':' + part;
      G.addNear(key, 0, M, lod ? Rf : R, Float32Array.from(Ls.xz), Float32Array.from(Ls.mats), { part, rIn: lod ? R : 0, kit: KIT_SER.find((q) => q.models.includes(M)).v });
      const S = sets.get(key); if (S) { S.bi = Int32Array.from(Ls.bi); S.offA = OFFB; }
    }
  };
  // частный сектор: свой дом в настоящем размере фасадом к улице + двор (забор секциями 5 м с воротами в 5 м перед фасадом, 3-5 построек
  // по номеру дома). Дом - до R (дальше коробка его размера), двор - до 0,6 R
  const PHB = [], dmgH = new Set();
  const phHouses = (R) => {
    const list = new Map(), mt = new THREE.Matrix4(), mb = new THREE.Matrix4(), mm = new THREE.Matrix4();
    const put = (M, part, Rs, v, xz, m, bi) => { const k = M + '|' + part; let L = list.get(k); if (!L) list.set(k, L = { Rs, v, xz: [], mats: [], bi: [] }); L.xz.push(xz[0], xz[1]); L.mats.push(...m.elements); L.bi.push(bi); };
    PHB.length = 0;
    for (const vs of Object.keys(PH)) for (const i of (near[+vs] || [])) {
      const q = phPlace(B, i, +vs); if (!q) continue;
      const ax = q.alongX ? q.L / 2 : 0, az = q.alongX ? 0 : q.L / 2, bx = q.dir[0] * q.D, bz = q.dir[1] * q.D; // сталинка длинная - и по четырём углам
      const y0 = Math.min(GH(q.ox, q.oz), GH(B.x[i], B.z[i]), GH(B.x[i] - q.dir[0] * q.D / 2, B.z[i] - q.dir[1] * q.D / 2), ...(q.st ? [GH(q.ox - ax, q.oz - az), GH(q.ox + ax, q.oz + az), GH(q.ox - ax - bx, q.oz - az - bz), GH(q.ox + ax - bx, q.oz + az - bz)] : [])) - 0.1, c = [B.x[i], B.z[i]], hsh = Math.imul(i, 2654435761) >>> 8; // по нижней из точек фасад / центр / задняя стена
      mb.makeRotationY(q.yaw).premultiply(mt.makeTranslation(q.ox, y0, q.oz));
      const bi = PHB.length; PHB.push({ i, v: +vs, M: q.M, base: q.base, L: q.L, D: q.D, H: q.H, x0: B.x[i], z0: B.z[i], r: Math.hypot(q.L, q.D) / 2, mb: mb.clone(), inv: mb.clone().invert(), st: 's0', hits: 0 });
      put(q.M, q.base + '_s0', q.st && !TOUCH_GT ? Math.max(R * 1.5, P.bldFar || 0) : R, +vs, c, mb, bi); // сталинка на ПК - до дальнего кольца панелек (своих упрощённых нет)
      if (q.st) continue; // сталинка - без двора
      const at = (x, z) => mm.copy(mb).multiply(mt.makeTranslation(x, 0, z)), fence = (hsh >>> 11) & 1 ? 'y_fence_picket' : 'y_fence_prof';
      const len = Math.max(15, q.L + 10), n = Math.round(len / 5), gate = (hsh >>> 3) % n;
      for (let k = 0; k < n; k++) put('ph_yard', k === gate ? 'y_gate' : fence, R * 0.6, 0, c, at(-n * 2.5 + 2.5 + k * 5, -5), bi);
      const opt = [['y_garage', -q.L / 2 - 3, 1], ['y_shed', q.L / 2 + 4, q.D * 0.5], ['y_greenhouse', 0, q.D + 5], ['y_outhouse', -Math.max(q.L / 2, 4.5) - 0.5, q.D + 7.5], ['y_well', q.L / 2 + 2, -2.5]];
      let cnt = 0; for (let k = 0; k < opt.length; k++) if (((hsh >>> (6 + k)) & 1) || (opt.length - k <= 3 - cnt)) { if (cnt >= 5) break; put('ph_yard', opt[k][0], R * 0.6, 0, c, at(opt[k][1], opt[k][2]), bi); cnt++; }
    }
    OFFH = new Uint8Array(PHB.length);
    for (const [k, Ls] of list) {
      const [M, part] = k.split('|'), key = 'ph:' + M + ':' + part;
      G.addNear(key, 0, M, Ls.Rs, Float32Array.from(Ls.xz), Float32Array.from(Ls.mats), { part, kit: Ls.v, kitR: Ls.Rs });
      const S = sets.get(key); if (S && M !== 'ph_yard') { S.bi = Int32Array.from(Ls.bi); S.offA = OFFH; } // двор - без выключения (постройки стоят)
    }
  };
  // ── Сити: офисы и стеклянные башни из деталей (серии 5в / 5г; ПАСПОРТ_офис / ПАСПОРТ_стекло). Коробка генератора (и каждый её ярус) - здание:
  // шаги фасада 3 м по сторонам, этажи (вестибюль, рядовые, техэтаж, верхний), углы, кровля / терраса / корона. Шагов в городе ~1,1 млн - поэтому:
  // вдали - одна плоскость на сторону яруса (ofCardMat: шаги и этажи рисует шейдер по граням *_lod1 атласа; число шагов, этажей и вид - в свободных
  // ячейках матрицы экземпляра), вблизи (ofRn) и у разрушенных - настоящие шаги и углы (ofTick: собираются на лету), кровли - всегда наборами
  const OFB = [], dmgO = new Set(), oCache = new Map(), oPool = new Map(); let OFFO = new Uint8Array(0), oIn = '', oDirty = false;
  const OFS = {
    of: { M: 'bld_of', st: ['A', 'B', 'C'], k0: 'ground', LH: 5.5, FH: 3.7, PAR: 1.27, TECH: 10, C0: 0.3 },
    gl: { M: 'bld_gl', st: ['blue', 'teal', 'bronze', 'silver'], k0: 'lobby', LH: 8.0, FH: 4.0, PAR: 1.6, TECH: 15, C0: 0.3 },
  };
  const OF_RN = () => (TOUCH_GT ? 150 : 300) * (G.kitK || 1);
  const rot2 = (rz, x, y) => [x * Math.cos(rz) - y * Math.sin(rz), x * Math.sin(rz) + y * Math.cos(rz)];
  const oM = new THREE.Matrix4(), oT = new THREE.Matrix4(), oQ = new THREE.Quaternion(), oP = new THREE.Vector3(), oS = new THREE.Vector3(), oY = new THREE.Vector3(0, 1, 0);
  // матрица детали: координаты сборщика (Blender: x вдоль, y - вглубь отрицательно, z вверх; поворот rz) → игра (x, z, −y), от начала здания b.O
  const oMat = (b, x, y, z, rz = 0, sx = 1, sy = 1, sz = 1) => oT.makeTranslation(b.O[0], b.O[1], b.O[2]).multiply(oM.compose(oP.set(x, z, -y), oQ.setFromAxisAngle(oY, rz), oS.set(sx, sz, sy)));
  const ofSides = (b) => { const { W, Dp } = b; return [['F', W, 0, 0, 0], ['XP', Dp, W / 2, -Dp / 2, -Math.PI / 2], ['Y', W, 0, -Dp, Math.PI], ['XN', Dp, -W / 2, -Dp / 2, Math.PI / 2]]; };
  const ofCorners = (b) => { const { W, Dp } = b; return [[-W / 2, 0, 0], [W / 2, 0, -Math.PI / 2], [W / 2, -Dp, Math.PI], [-W / 2, -Dp, Math.PI / 2]]; };
  // этаж f: вид (без облицовки), низ z, высота
  // этаж f: вид (без облицовки), низ z, высота - с растяжением яруса vs (ярус ровно в свою коробку генератора: ярусы стыкуются, кровля - на высоте боя)
  const ofFloor = (b, f) => {
    const S = OFS[b.fam], lob = b.lob ? 1 : 0, v = b.vs || 1;
    const z = (f === 0 ? 0 : lob * S.LH + (f - lob) * S.FH) * v;
    if (lob && f === 0) return [S.k0, 0, S.LH * v];
    if (b.topf && f === b.F - 1) return ['top', z, (S.FH + S.PAR) * v];
    if (f % S.TECH === S.TECH - 1) return ['tech', z, S.FH * v];
    return ['floor', z, S.FH * v];
  };
  const ofH = (b) => { const S = OFS[b.fam]; return (b.lob ? S.LH : 0) + (b.F - (b.lob ? 1 : 0)) * S.FH + (b.topf ? S.PAR : 0); };
  const ofHouses = (R) => {
    const list = new Map(), RF = CITY.HALF * 2; // плоскости и кровли - на всю карту (коробки вида 31 больше не нужны)
    const put = (M, part, b, m) => { const k = M + '|' + part; let L = list.get(k); if (!L) list.set(k, L = { xz: [], mats: [], bi: [] }); L.xz.push(b.cx, b.cz); L.mats.push(...m.elements); L.bi.push(b.bi); };
    OFB.length = 0; dmgO.clear(); oCache.clear();
    const byXZ = new Map(); for (const i of near[OFV]) { const k = Math.round(B.x[i]) + ',' + Math.round(B.z[i]); let a = byXZ.get(k); if (!a) byXZ.set(k, a = []); a.push(i); }
    const gOf = (i) => { const W = B.w[i], Dp = B.d[i], gx = B.x[i], gz = B.z[i]; return Math.min(GH(gx, gz), GH(gx - W / 2, gz - Dp / 2), GH(gx + W / 2, gz - Dp / 2), GH(gx - W / 2, gz + Dp / 2), GH(gx + W / 2, gz + Dp / 2)) - 0.15; };
    const gBase = (i) => { const a = byXZ.get(Math.round(B.x[i]) + ',' + Math.round(B.z[i])) || [i]; let lo = i; for (const j of a) if (B.y0[j] < B.y0[lo]) lo = j; return gOf(lo); }; // земля башни - у нижнего яруса
    for (const i of near[OFV]) {
      const fam = B.k[i] === KIND.GLASS ? 'gl' : 'of', S = OFS[fam], hs = Math.imul(i + 7, 2654435761) >>> 0, W = B.w[i], Dp = B.d[i], H = B.h[i], y0 = B.y0[i];
      // ярус над этим (та же середина, основание = верх этого) - у этого вместо короны терраса / кровля без надстроек
      const tier = (byXZ.get(Math.round(B.x[i]) + ',' + Math.round(B.z[i])) || []).some((j) => j !== i && Math.abs(B.y0[j] - (y0 + H)) < 1);
      const lob = y0 < 0.5, top = fam === 'gl' ? (tier ? 'terrace' : ['roof', 'crownA', 'crownB'][(hs >>> 5) % 3]) : 'roof';
      const topf = fam === 'gl' ? top === 'roof' || top === 'crownA' : true;
      const F = Math.max(lob ? 2 : 1, (lob ? 1 : 0) + Math.round((H - (lob ? S.LH : 0) - (topf ? S.PAR : 0)) / S.FH));
      // основание: нижний ярус - по нижнему углу коробки (склон), верхние - на его основание + y0
      const gx = B.x[i], gz = B.z[i], g0 = gBase(i);
      const b = { i, bi: OFB.length, fam, M: S.M, s: S.st[(hs >>> 9) % S.st.length], cham: fam === 'gl' && ((hs >>> 13) & 1) === 1 && Math.min(W, Dp) > 18, lob, top, topf, F, W, Dp, cx: gx, cz: gz, O: [gx, g0 + y0, gz - Dp / 2], hs, dmg: null, tall: y0 + H > 80 };
      b.c = b.cham ? 3 / Math.SQRT2 : S.C0; b.vs = Math.max(0.8, Math.min(1.25, (H + (lob ? 0.15 : 0)) / ofH(b))); b.Ht = ofH(b) * b.vs; b.R = Math.hypot(W, Dp) / 2; OFB.push(b);
      // плоскости фасадов (дальний вид): n шагов, F этажей, код = облицовка + 8 · вестибюль + 16 · верхний этаж с парапетом
      const code = S.st.indexOf(b.s) + (lob ? 8 : 0) + (topf ? 16 : 0) + (b.cham ? 32 : 0), card = (x, y, rz, L, n) => { const m = oMat(b, x, y, 0, rz, L, 1, b.Ht); m.elements[3] = n; m.elements[7] = F; m.elements[11] = code; put(S.M, 'C:' + fam, b, m); };
      for (const [, L, cx, cy, rz] of ofSides(b)) {
        const Lb = b.cham ? L - 2 * b.c : L, n = Math.max(1, Math.round((L - 2 * b.c) / 3)), [dx, dy] = rot2(rz, 0, -0.12);
        card(cx + dx, cy + dy, rz, Lb, n);
      }
      if (b.cham) for (const [cx, cy, rz] of ofCorners(b)) { const [dx, dy] = rot2(rz, b.c / 2, -b.c / 2), [ex, ey] = rot2(rz + Math.PI / 4, 0, -0.12); card(cx + dx + ex, cy + dy + ey, rz + Math.PI / 4, 3, 1); }
      // кровля
      const zt = b.Ht - (topf ? S.PAR * b.vs : 0), flat = top === 'terrace' ? 'deck_unit' : 'roof_unit', C0 = S.C0, rnd = mulberry32(hs); b.zt = zt;
      if (b.cham) {
        put(S.M, flat, b, oMat(b, 0, -Dp / 2, zt, 0, W - 2 * b.c, Dp - 2 * C0)); put(S.M, flat, b, oMat(b, 0, -Dp / 2, zt + 0.01, 0, W - 2 * C0, Dp - 2 * b.c));
        for (const [cx, cy, rz] of ofCorners(b)) { const [dx, dy] = rot2(rz, b.c, -b.c); put(S.M, top === 'terrace' ? 'deck_tri' : 'roof_tri', b, oMat(b, cx + dx, cy + dy, zt, rz, b.c - C0, b.c - C0, 1)); }
      } else put(S.M, flat, b, oMat(b, 0, -Dp / 2, zt, 0, W - 2 * C0, Dp - 2 * C0));
      if (fam === 'of') {
        // ядро - ближе к задней стене: середину крыши занимают ПЗРК
        if (!tier) { if (Dp > 22) put(S.M, 'core_top', b, oMat(b, 0, -Dp * 0.78, zt)); const nh = 2 + ((hs >>> 3) % 3);
          for (let k = 0; k < nh; k++) put(S.M, k % 2 ? 'hvac_b' : 'hvac_a', b, oMat(b, (rnd() - 0.5) * (W - 12), -Dp / 2 + (rnd() < 0.5 ? -1 : 1) * (Dp / 2 - 5) * (0.5 + rnd() * 0.5), zt, rnd() < 0.5 ? 0 : Math.PI / 2));
          if (b.tall && Dp > 22 && ((hs >>> 17) & 1)) put(S.M, 'mast', b, oMat(b, 0, -Dp * 0.78, zt + 4.15)); }
      } else if (top === 'terrace') {
        for (const [, L, cx, cy, rz] of ofSides(b)) { const n = Math.max(1, Math.round((L - 2 * b.c) / 3)), bw = (L - 2 * b.c) / n; for (let k = 0; k < n; k++) { const [dx, dy] = rot2(rz, -L / 2 + b.c + (k + 0.5) * bw, 0); put(S.M, 'rail_' + b.s, b, oMat(b, cx + dx, cy + dy, zt, rz, bw / 3)); } }
        if (b.cham) for (const [cx, cy, rz] of ofCorners(b)) { const [dx, dy] = rot2(rz, b.c / 2, -b.c / 2); put(S.M, 'rail_' + b.s, b, oMat(b, cx + dx, cy + dy, zt, rz + Math.PI / 4)); }
        for (let k = 0; k < Math.floor((W + Dp) / 6); k++) { const a = rnd() < 0.5; put(S.M, 'planter', b, oMat(b, a ? -W / 2 + 2 + rnd() * (W - 4) : (rnd() < 0.5 ? -W / 2 + 1.3 : W / 2 - 1.3), a ? (rnd() < 0.5 ? -1.3 : -Dp + 1.3) : -Dp + 2 + rnd() * (Dp - 4), zt)); }
      } else if (top === 'crownA') {
        for (const [ins, hz, z1] of [[2, 1, 0], [5, 0.75, 8]]) {
          const w = W - 2 * ins, d = Dp - 2 * ins; if (w < 4 || d < 4) continue;
          for (const [L, cx, cy, rz] of [[w, 0, -ins, 0], [d, w / 2, -Dp / 2, -Math.PI / 2], [w, 0, -Dp + ins, Math.PI], [d, -w / 2, -Dp / 2, Math.PI / 2]]) { const n = Math.max(1, Math.round(L / 3)), bw = L / n; for (let k = 0; k < n; k++) { const [dx, dy] = rot2(rz, -L / 2 + (k + 0.5) * bw, 0); put(S.M, 'crownA_' + b.s, b, oMat(b, cx + dx, cy + dy, zt + z1, rz, bw / 3, 1, hz)); } }
        }
      } else if (top === 'crownB') {
        const Hc = 14, n = Math.max(1, Math.round((W - 2 * C0) / 3)), bw = (W - 2 * C0) / n;
        for (let k = 0; k < n; k++) put(S.M, 'crownB_' + b.s, b, oMat(b, -W / 2 + C0 + (k + 0.5) * bw, -C0, zt, 0, bw / 3, Dp - 2 * C0, Hc));
        put(S.M, 'crownB_sideL_' + b.s, b, oMat(b, -W / 2 + C0, -C0, zt, 0, 1, Dp - 2 * C0, Hc)); put(S.M, 'crownB_sideR_' + b.s, b, oMat(b, W / 2 - C0, -C0, zt, 0, 1, Dp - 2 * C0, Hc)); put(S.M, 'crownB_back_' + b.s, b, oMat(b, 0, -Dp + C0, zt, 0, W - 2 * C0, 1, Hc));
      } else put(S.M, 'core_top', b, oMat(b, 0, -Dp / 2, zt));
    }
    OFFO = new Uint8Array(OFB.length); PH_MODELS[OFV] = [...new Set(OFB.map((b) => b.M))]; // коробки прятать, когда пришли наборы, которые есть в городе
    for (const [k, Ls] of list) {
      const [M, part] = k.split('|'), key = 'of:' + M + ':' + part;
      // дальность: плоскости, кровля и наклонная корона - вся карта; ядро и корона A - дальнее кольцо панелек; ограждения, кадки, вентустановки, мачты - ближний радиус
      const Rp = part.startsWith('C:') || /^(roof|deck)_|^crownB/.test(part) ? RF : /^core_top|^crownA/.test(part) ? (TOUCH_GT ? R * 2 : Math.max(R * 1.5, P.bldFar || 0)) : R;
      G.addNear(key, 0, M, Rp, Float32Array.from(Ls.xz), Float32Array.from(Ls.mats), { part, kit: OFV, kitR: RF });
      const S = sets.get(key); if (S && part.startsWith('C:')) { S.bi = Int32Array.from(Ls.bi); S.offA = OFFO; } // плоскость прячется, когда здание - настоящими шагами
    }
  };
  // настоящие шаги и углы здания (вблизи и разрушенные): имя детали → матрицы; кэш по зданию
  const ofWalls = (b) => {
    let L = oCache.get(b.bi); if (L) return L; L = new Map();
    const S = OFS[b.fam], add = (nm, m) => { let a = L.get(nm); if (!a) L.set(nm, a = []); for (let k = 0; k < 16; k++) a.push(m.elements[k]); };
    for (let f = 0; f < b.F; f++) {
      const [kind, z] = ofFloor(b, f);
      ofSides(b).forEach(([sd, Ln, cx, cy, rz]) => {
        const n = Math.max(1, Math.round((Ln - 2 * b.c) / 3)), bw = (Ln - 2 * b.c) / n;
        for (let k = 0; k < n; k++) {
          let kd = kind === 'floor' ? ((Math.imul(b.hs + f * 131 + k * 7, 2246822519) >>> 15) & 1 ? 'floor1' : 'floor0') : kind;
          if (kind === S.k0 && sd === 'F' && k === (n >> 1)) kd = 'entry';
          const st = (b.dmg && b.dmg.get(sd + '|' + f + '|' + k)) || '0', [dx, dy] = rot2(rz, -Ln / 2 + b.c + (k + 0.5) * bw, 0);
          add('bay_' + b.s + '_' + kd + '_s' + st, oMat(b, cx + dx, cy + dy, z, rz, bw / 3, 1, b.vs));
        }
      });
      for (const [cx, cy, rz] of ofCorners(b)) {
        if (b.cham) { const [dx, dy] = rot2(rz, b.c / 2, -b.c / 2); add('bay_' + b.s + '_' + (kind === 'floor' ? 'floor0' : kind) + '_s0', oMat(b, cx + dx, cy + dy, z, rz + Math.PI / 4, 1, 1, b.vs)); }
        else add('cor_' + b.s + '_' + kind, oMat(b, cx, cy, z, rz, 1, 1, b.vs));
      }
    }
    if (b.rub) for (const [x, y, nm] of b.rub) add(nm, oMat(b, x, y, 0));
    for (const [k, a] of L) L.set(k, Float32Array.from(a));
    oCache.set(b.bi, L); if (oCache.size > 120) oCache.delete(oCache.keys().next().value); // старые - вон (вернутся, если подлетим)
    return L;
  };
  // раз в кадр: какие здания - настоящими шагами (ближе ofRn или разрушены и не дальше плоскостей); пересобрать пул, если набор сменился
  const ofTick = G.ofTick = (cam) => {
    if (!OFB.length) return;
    const rn = OF_RN(), x = cam.position.x, y = cam.position.y, z = cam.position.z; let key = '';
    // по расстоянию в пространстве до коробки яруса (с высоты башни под камерой - плоскостями)
    const rf = (TOUCH_GT ? R * 2 : Math.max(R * 1.5, P.bldFar || 0)) * (G.kitK || 1);
    for (const b of OFB) { if (!KITGS.has(b.M)) continue; const dy = Math.max(0, Math.abs(y - b.O[1] - b.Ht / 2) - b.Ht / 2), d2 = (b.cx - x) ** 2 + (b.cz - z) ** 2 + dy * dy, r = rn + b.R + (OFFO[b.bi] ? 25 : 0); // вышел - на 25 м дальше, чем вошёл
      if (d2 < r * r || (dmgO.has(b.bi) && d2 < (rf + b.R) ** 2)) key += b.bi + ','; } // разрушенные - до дальнего кольца
    if (!oDirty && key === oIn) return;
    oIn = key; oDirty = false; OFFO.fill(0);
    const all = new Map();
    for (const s of key.split(',')) { if (!s) continue; const b = OFB[+s]; OFFO[b.bi] = 1; for (const [nm, a] of ofWalls(b)) { const k = b.M + '|' + nm; let q = all.get(k); if (!q) all.set(k, q = []); q.push(a); (q.bs || (q.bs = [])).push(b.bi); } }
    for (const [k, P0] of oPool) if (!all.has(k)) { P0.m.count = 0; P0.m.visible = false; }
    for (const [k, parts] of all) {
      const [M, nm] = k.split('|'), src = KITGS.get(M).getObjectByName(nm); if (!src || !src.isMesh) continue;
      let n = 0; for (const a of parts) n += a.length / 16;
      let P0 = oPool.get(k);
      if (!P0 || P0.cap < n) { if (P0) { scene.remove(P0.m); P0.m.dispose(); } const cap = Math.max(16, Math.ceil(n * 1.5)), m = new THREE.InstancedMesh(src.geometry, src.material, cap); m.frustumCulled = false; m.castShadow = !!sh.cast; m.receiveShadow = !!sh.receive; m.userData.set = 'ofp:' + k; scene.add(m); oPool.set(k, P0 = { m, cap }); }
      let o = 0; P0.segs = []; parts.forEach((a, j) => { P0.m.instanceMatrix.array.set(a, o); P0.segs.push(parts.bs[j], o, a.length); o += a.length; }); // segs: здание, начало, длина (окно ТВ)
      P0.m.count = n; P0.m.visible = n > 0; P0.m.instanceMatrix.needsUpdate = true;
    }
    lx = 1e9;
  };
  // окно ТВ: настоящие шаги - только зданий в радиусе окна от точки взгляда (остальной пул - у игрока, в окне не виден; его коробки и плоскости
  // окно рисует само); буфер окна - свой у каждого меша пула, основной не трогаем
  const ofPod = (at, R) => {
    const kp = [];
    for (const P0 of oPool.values()) {
      if (!P0.m.visible || !P0.segs) continue;
      if (!P0.pod || P0.pod.count < P0.cap) { P0.pod = new THREE.InstancedBufferAttribute(new Float32Array(P0.cap * 16), 16); P0.pod.setUsage(THREE.DynamicDrawUsage); }
      const src = P0.m.instanceMatrix.array, dst = P0.pod.array; let o = 0;
      for (let j = 0; j < P0.segs.length; j += 3) { const b = OFB[P0.segs[j]]; if ((b.cx - at.x) ** 2 + (b.cz - at.z) ** 2 > (R + b.R) ** 2) continue; dst.set(src.subarray(P0.segs[j + 1], P0.segs[j + 1] + P0.segs[j + 2]), o); o += P0.segs[j + 2]; }
      kp.push(P0.m, P0.m.instanceMatrix, P0.m.count, P0.m.visible);
      P0.m.instanceMatrix = P0.pod; P0.m.count = o / 16; P0.m.visible = o > 0; if (o) { P0.pod.updateRange.count = o; P0.pod.needsUpdate = true; } // на видеочип - только занятая часть
    }
    return () => { for (let i = 0; i < kp.length; i += 4) { kp[i].instanceMatrix = kp[i + 1]; kp[i].count = kp[i + 2]; kp[i].visible = kp[i + 3]; } };
  };
  // разрыв у офиса / стеклянной башни: шаги в радиусе - пролом (2a / 2b), дальше - стёкла (1g) или пожар (1f у мощных); углы стоят
  const ofHit = (p, R) => {
    let any = false; const SEVO = { 0: 0, '1g': 1, '1f': 2, '2a': 3, '2b': 3 };
    for (const b of OFB) {
      if (Math.abs(p.x - b.cx) > b.W / 2 + R || Math.abs(p.z - b.cz) > b.Dp / 2 + R || p.y < b.O[1] - R || p.y > b.O[1] + b.Ht + R) continue;
      const lx0 = p.x - b.O[0], ly0 = -(p.z - b.O[2]), lz0 = p.y - b.O[1]; let hit = false; // в координатах сборщика
      for (let f = 0; f < b.F; f++) {
        const [, z, h] = ofFloor(b, f); if (Math.abs(lz0 - (z + h / 2)) > R * 0.7 + h) continue;
        for (const [sd, Ln, cx, cy, rz] of ofSides(b)) {
          const n = Math.max(1, Math.round((Ln - 2 * b.c) / 3)), bw = (Ln - 2 * b.c) / n;
          for (let k = 0; k < n; k++) {
            const [dx, dy] = rot2(rz, -Ln / 2 + b.c + (k + 0.5) * bw, 0), d = Math.hypot(cx + dx - lx0, cy + dy - ly0, z + h / 2 - lz0);
            let ns = null; if (d < R * 0.22 + 1.5) ns = (Math.imul(b.hs + f * 17 + k, 40503) >>> 7) & 1 ? '2b' : '2a'; else if (d < R * 0.6) ns = R >= 30 && d < R * 0.4 ? '1f' : '1g';
            if (!ns) continue; if (!b.dmg) b.dmg = new Map(); const kk = sd + '|' + f + '|' + k, was = b.dmg.get(kk) || '0';
            if (SEVO[ns] > SEVO[was]) { b.dmg.set(kk, ns); hit = true; if (ns[0] === '2' && f <= 1 && !b.rub) b.rub = []; if (ns[0] === '2' && f <= 1 && b.rub.length < 6) b.rub.push([cx + dx * 1.0 + rot2(rz, 0, 3)[0], cy + dy + rot2(rz, 0, 3)[1], R >= 40 ? 'rubble_l' : 'rubble_m']); }
          }
        }
      }
      if (hit) { dmgO.add(b.bi); oCache.delete(b.bi); oDirty = true; any = true; }
    }
    return any;
  };
  // ── разрушение своих домов (Mark 2026-11-16: «от прямых попаданий или очень рядом»; лестница - паспорта серий damage_ladder):
  // состояние каждой половины этажа секции (0 целый, 1-2 пожар, 3 выбиты стёкла волной, 4-6 пролом), этаж, с которого секция рухнула.
  // Варианты - по номеру дома и счётчику попаданий (не случайно): онлайн у всех игроков одинаково
  const STN = ['s0', 's1fa', 's1fb', 's1g', 's2a', 's2b', 's2c'], SEV = [0, 2, 2, 1, 3, 3, 3];
  const dynM = new Map(), dmgB = new Set(), PL = new THREE.Vector3(), MT = new THREE.Matrix4(), MM = new THREE.Matrix4(), ROT = new THREE.Matrix4().makeRotationY(Math.PI);
  const hsh2 = (a, b) => (((a * 2654435761) ^ (b * 40503)) >>> 0) % 997;
  const setSt = (b, s, f, h, v) => { if (s < 0 || s >= b.N || f < 0 || f >= b.F) return; const k = (s * b.F + f) * 2 + h; if (SEV[v] > SEV[b.st[k]]) b.st[k] = v; };
  const fire = (b, s, f, h) => setSt(b, s, f, h, 1 + hsh2(b.i + b.hits, s * 31 + f * 7 + h) % 2), hole = (b, s, f, h) => setSt(b, s, f, h, 4 + hsh2(b.i * 3 + b.hits, s * 17 + f * 5 + h) % 3);
  G.kitHit = (p, R) => {
    if ((!KB.length && !PHB.length && !OFB.length) || !(R >= 5)) return;
    if (OFB.length) ofHit(p, R); // ложная цель без боевой части (4) - не ломает
    let any = false;
    for (let bi = 0; bi < KB.length; bi++) {
      const b = KB[bi]; if (Math.hypot(p.x - b.x0, p.z - b.z0) > b.R + R + 10) continue;
      const SEC = b.ser.SEC, DEP = b.ser.DEP, FL = b.ser.FL;
      PL.copy(p).applyMatrix4(b.inv); // в осях серии: x вдоль дома (секции), y вверх от низа, z от фасада подъездов в глубину (0…DEP)
      const hx = b.N * SEC / 2, H = 1.0 + b.F * FL, x = PL.x, z = PL.z, y = PL.y - Math.max(0, GH(p.x, p.z) - b.y0 - 0.2); // на склоне бой считает крышу от земли в точке (topAt), дом стоит по нижнему углу
      const dx = Math.max(0, Math.abs(x) - hx), dz = z < 0 ? -z : z > DEP ? z - DEP : 0, dy = Math.max(0, y - H), d = Math.hypot(dx, dz, dy);
      const sI = Math.max(0, Math.min(b.N - 1, Math.floor((x + hx) / SEC))), f = Math.max(0, Math.min(b.F - 1, y < 1.0 + FL ? 0 : Math.floor((y - 1.0) / FL))), h = z < DEP / 2 ? 0 : 1;
      const hit = d < 2.5; // прямое попадание (в стену или крышу) - точка в доме или у самой стены
      if (!hit && d > R * 0.6) continue;
      b.hits++; any = true; dmgB.add(bi); OFFB[bi] = 1;
      if (!hit) { // близкий разрыв: стёкла со стороны взрыва (на высоте взрыва и соседних этажах), совсем близко от мощного - и пожар
        const side = z < DEP / 2 ? 0 : 1, rf = Math.max(1, Math.round(R / 12));
        for (let s2 = 0; s2 < b.N; s2++) for (let f2 = Math.max(0, f - rf); f2 <= Math.min(b.F - 1, f + rf); f2++) { const sx = -hx + (s2 + 0.5) * SEC; if (Math.abs(sx - x) > R) continue; if (d < R * 0.2 && R >= 40 && s2 === sI && Math.abs(f2 - f) <= 1) fire(b, s2, f2, side); else setSt(b, s2, f2, side, 3); }
        continue;
      }
      if (R < 20) { hole(b, sI, f, h); for (const [a, c] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) fire(b, sI + a, f + c, h); fire(b, sI, f, 1 - h); }
      else if (R < 44) { hole(b, sI, f, h); hole(b, sI, f + 1, h); hole(b, sI, f - 1, h); hole(b, sI, f, 1 - h); for (const [a, c] of [[1, 0], [-1, 0], [1, 1], [-1, 1], [0, 2], [0, -2]]) fire(b, sI + a, f + c, h); for (let s2 = 0; s2 < b.N; s2++) for (let f2 = 0; f2 < b.F; f2++) setSt(b, s2, f2, h, 3); }
      else { // мощная: подъезд складывается от этажа попадания вверх; у соседей на этих этажах - проломы и пожар; очень мощная у края - и соседний подъезд
        // перекрытия проваливаются и ниже точки удара: ФАБ-500 (47) - ещё ~2 этажа, ФАБ-1000 (68) - почти до земли
        const from = Math.max(1, f - Math.max(0, Math.round((R - 35) / 5))), col = (s2) => { if (s2 < 0 || s2 >= b.N) return; b.coll[s2] = b.coll[s2] < 0 ? from : Math.min(b.coll[s2], from); setSt(b, s2, 0, 0, 4 + hsh2(b.i, s2) % 3); setSt(b, s2, 0, 1, 4 + hsh2(b.i, s2 + 7) % 3); };
        col(sI); if (R >= 60) { const xs = -hx + (sI + 0.5) * SEC; col(x > xs ? sI + 1 : sI - 1); }
        for (let s2 = 0; s2 < b.N; s2++) { if (b.coll[s2] >= 0) continue; const near = Math.abs(s2 - sI) === 1; for (let f2 = 0; f2 < b.F; f2++) for (const h2 of [0, 1]) { if (near && f2 >= from - 1) (f2 % 2 ? hole : fire)(b, s2, f2, h2); else setSt(b, s2, f2, h2, 3); } }
      }
    }
    // частные дома: разрыв рядом - стёкла и листы кровли (s1g), слабое попадание - пролом или пожар (s2 / s1f), мощное - пепелище
    const PSEV = { s0: 0, s1g: 1, s1f: 2, s2: 3, sruin: 4 };
    for (let hi = 0; hi < PHB.length; hi++) {
      const h = PHB[hi]; if (Math.hypot(p.x - h.x0, p.z - h.z0) > h.r + R + 5) continue;
      PL.copy(p).applyMatrix4(h.inv);
      const bw = B.w[h.i] / 2, bd = B.d[h.i] / 2, dB = Math.hypot(Math.max(0, Math.abs(p.x - h.x0) - bw), Math.max(0, Math.abs(p.z - h.z0) - bd), Math.max(0, p.y - GH(p.x, p.z) - B.h[h.i])); // бой считает по коробке B - её попадание тоже прямое
      const yl = PL.y - Math.max(0, GH(p.x, p.z) - GH(h.x0, h.z0)), d = Math.min(dB, Math.hypot(Math.max(0, Math.abs(PL.x) - h.L / 2), PL.z < 0 ? -PL.z : PL.z > h.D ? PL.z - h.D : 0, Math.max(0, yl - h.H)));
      let ns = null;
      if (d < 2.5) ns = R >= 30 ? (h.v === 5 ? 's2' : 'sruin') : ((h.i + h.hits) % 2 ? 's2' : 's1f'); // у сталинки пепелища нет: мощное - пролом
      else if (d < R * 0.5) ns = R >= 40 && d < R * 0.2 ? 's2' : 's1g';
      if (!ns) continue;
      h.hits++; if (PSEV[ns] > PSEV[h.st]) { h.st = ns; dmgH.add(hi); OFFH[hi] = 1; any = true; }
    }
    if (any) { kitDirty = true; lx = 1e9; }
  };
  // разрушенные дома - своими модулями (наборы по серии и имени модуля, растут по мере надобности)
  let kitDirty = false, kcx = 0, kcz = 0, kIn = '';
  // раз в кадр (updateCityScene): пересобрать руины, если были разрывы или камера унесла разрушенные дома за дальний радиус / обратно
  G.kitTick = (cam) => {
    if ((!dmgB.size && !dmgH.size) || !KITGS.size) return;
    const rr = (G.kitRf || 0) * (G.kitK || 1); let key = ''; for (const bi of dmgB) { const b = KB[bi]; if (Math.hypot(b.x0 - cam.position.x, b.z0 - cam.position.z) <= rr + b.R) key += bi + ','; }
    for (const hi of dmgH) { const h = PHB[hi]; if (Math.hypot(h.x0 - cam.position.x, h.z0 - cam.position.z) <= (G.kitOn.get(h.v) || 0) * (G.kitK || 1)) key += 'h' + hi + h.st + ','; } // частные - до своего радиуса (дальше коробка)
    if (!kitDirty && key === kIn) return;
    kIn = key; kitDirty = false; kcx = cam.position.x; kcz = cam.position.z; kitDyn();
  };
  const kitDyn = () => {
    const L = new Map(), add = (M, name, m) => { const k = M + '|' + name; let a = L.get(k); if (!a) L.set(k, a = []); a.push(Float32Array.from(m.elements)); }; // копия: MM общая
    for (const bi of dmgB) {
      const b = KB[bi]; if (!KITGS.has(b.M) || Math.hypot(b.x0 - kcx, b.z0 - kcz) > (G.kitRf || 0) * (G.kitK || 1) + b.R) continue; // модели нет или дальше - коробка (как у целых)
      const { SEC, DEP, FL } = b.ser, M = b.M, at = (x, y, z) => MM.copy(b.mb).multiply(MT.makeTranslation(x, y, z)), atR = (x, y, z) => MM.copy(b.mb).multiply(MT.makeTranslation(x, y, z)).multiply(ROT), hx = b.N * SEC / 2;
      const roof = (sI, yr) => { for (const [nm, x, z, r] of kitRoof(b.ser, b.hip, b.N, sI, '')) for (const q of nm.split('+')) add(M, q, (r ? atR : at)(x, yr, z)); };
      for (let s2 = 0; s2 < b.N; s2++) {
        const xs = -hx + (s2 + 0.5) * SEC, cl = b.coll[s2], top = cl >= 0 ? cl : b.F;
        for (let f = 0; f < top; f++) {
          const v = (s2 * 3 + f * 5 + b.i) % 4, y = f === 0 ? 0 : 1.0 + f * FL, kind = f === 0 ? 'sec_ground' : f === b.F - 1 ? 'sec_top' + v : 'sec_floor' + v;
          for (const h of [0, 1]) add(M, kind + '_' + (h ? 'Y' : 'F') + '_' + STN[b.st[(s2 * b.F + f) * 2 + h]], at(xs, y, 0));
          // рваный край у рухнувшего соседа (на этаж, a / b - через этаж)
          for (const [nb, side] of [[s2 - 1, 'L'], [s2 + 1, 'R']]) if (nb >= 0 && nb < b.N && b.coll[nb] >= 0 && f >= b.coll[nb]) for (const h of ['F', 'Y']) add(M, 'edge_' + side + '_' + h + '_' + (f % 2 ? 'b' : 'a'), at(xs, f === 0 ? 1.0 : y, 0));
        }
        if (cl < 0) roof(s2, 1.0 + b.F * FL);
        else if (cl <= 1) { const n = b.F - cl; add(M, n >= 6 ? 'rubble_xl' : n >= 3 ? 'rubble_l' : 'rubble_m', at(xs, 0, -3)); } // груда - от фасада на улицу и во двор (паспорт: Blender y +3)
        else { const yt = 1.0 + cl * FL; if (!b.hip) for (const h of ['F', 'Y']) add(M, 'roof_' + h, at(xs, yt, 0)); add(M, b.F - cl >= 3 ? 'rubble_m' : 'rubble_s', at(xs, yt, DEP / 2 - 3)); } // у вальмы roof_* - скаты, а не перекрытие: над срезом только обломки (паспорт) // рухнул верх: уцелевшие этажи с перекрытием, обломки сверху
      }
      // углы торцов: по состоянию крайних секций (у рухнувшей - до этажа обрушения); половины вальмы - если крайняя секция цела доверху
      const sl = b.N - 1;
      for (let f = 0; f < b.F; f++) {
        const y = f === 0 ? 0 : 1.0 + f * FL, kind = f === 0 ? 'cor_ground' : f === b.F - 1 ? 'cor_top' : 'cor_floor';
        if (b.coll[0] < 0 || f < b.coll[0]) for (const h of [0, 1]) add(M, kind + '_' + (h ? 'Y' : 'F') + '_' + STN[b.st[f * 2 + h]], at(-hx, y, 0));
        if (b.coll[sl] < 0 || f < b.coll[sl]) for (const h of [0, 1]) add(M, kind + '_' + (h ? 'F' : 'Y') + '_' + STN[b.st[(sl * b.F + f) * 2 + h]], atR(hx, y, DEP));
      }
      if (b.hip) { const yr = 1.0 + b.F * FL; if (b.coll[0] < 0) for (const q of ['cor_roof_F', 'cor_roof_Y']) add(M, q, at(-hx, yr, 0)); if (b.coll[sl] < 0) for (const q of ['cor_roof_F', 'cor_roof_Y']) add(M, q, atR(hx, yr, DEP)); }
    }
    for (const hi of dmgH) { const h = PHB[hi]; if (KITGS.has(h.M) && Math.hypot(h.x0 - kcx, h.z0 - kcz) <= (G.kitOn.get(h.v) || 0) * (G.kitK || 1)) add(h.M, h.base + '_' + h.st, h.mb); } // частные дома - состоянием целиком
    for (const [k, D] of dynM) if (!L.has(k)) { D.m.count = 0; D.m.visible = false; }
    for (const [k, arr] of L) {
      const [M, name] = k.split('|'), src = KITGS.get(M).getObjectByName(name); if (!src || !src.isMesh) continue;
      let D = dynM.get(k);
      if (!D || D.cap < arr.length) { if (D) { scene.remove(D.m); D.m.dispose(); } const cap = Math.max(8, arr.length * 2), m = new THREE.InstancedMesh(src.geometry, src.material, cap); m.frustumCulled = false; m.castShadow = !!sh.cast; m.receiveShadow = !!sh.receive; m.userData.set = 'kitdyn'; scene.add(m); dynM.set(k, D = { m, cap }); }
      arr.forEach((e, j) => D.m.instanceMatrix.array.set(e, j * 16)); D.m.count = arr.length; D.m.visible = true; D.m.instanceMatrix.needsUpdate = true;
    }
  };
  if (PH_ON && Object.keys(PH).some((v) => near[v] && near[v].length)) phHouses(R); // частный сектор - свои дома и дворы
  if (KIT_ON && OF_ON && near[OFV].length) ofHouses(R); // офисы и стеклянные башни Сити - из деталей
  if (KIT_ON && KIT_SER.some((q) => near[q.v] && near[q.v].length)) kitHouses(G, B, R, TOUCH_GT ? R * (+((typeof location !== 'undefined' && /[?&]kitrf=([\d.]+)/.exec(location.search)) || [0, 2])[1]) : Math.max(R * 1.5, P.bldFar || 0)); // телефон: упрощённые модули - до 2 R (дальше коробки; до bldFar кадр «Среднего» +25 %); ?kitrf= - проба
  // породы деревьев из набора: уровни 0 / 1 / 2 (телефоны - с первого), дальше - снимки леса
  const tree2Attach = (S, key, group) => {
    const L = [0, 1, 2].map((l) => group.getObjectByName(`${S.name}@${l}`)); if (L.some((q) => !q)) { console.warn('нет дерева', S.name); return; }
    const hi = (P.bldNear || 0) >= 450, tier = hi ? L : L.slice(1), crownOK = (!TOUCH_GT && !P.shadowLite) || P.treeShadows;
    const mk = (g, im, tag, cs) => g.children.filter((c) => c.isMesh).map((c) => { const leaf = c.material.alphaTest > 0, m = new THREE.InstancedMesh(c.geometry, tree2Mat(c.material, S.wind, S.slot, S.pack === 'trees_c'), S.n); m.instanceMatrix = im; m.count = 0; m.visible = false; m.frustumCulled = false; Object.assign(m.userData, { set: key, ...tag });
      const crown = NS_ON && leaf && crownOK; if (crown) m.customDepthMaterial = leafDepth(c.material); m.castShadow = cs && !!sh.cast && (!leaf || crown); m.receiveShadow = !!sh.receive; scene.add(m); return m; });
    const buf = () => { const b = new THREE.InstancedBufferAttribute(new Float32Array(S.n * 16), 16); b.setUsage(THREE.DynamicDrawUsage); return b; };
    const R0 = S.R; S.tr = true; S.Rf = R0; S.R = R0 * 0.62; S.Rf0 = S.Rf; S.R0 = S.R; S.rIn0 = 0;
    S.meshes = mk(tier[0], S.im, {}, true);
    if (hi) { S.imLo = buf(); S.lo = mk(tier[1], S.imLo, { lo: true }, true); S.R1 = S.R10 = Math.min(45, R0 * 0.2); }
    S.imFar = buf(); S.far = mk(tier[tier.length - 1], S.imFar, { far: true }, false);
    const bb = new THREE.Box3().setFromObject(L[0]); let r0 = 0; for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) r0 = Math.max(r0, Math.hypot(x, y, z));
    S.rad = new Float32Array(S.n); S.cxyz = new Float32Array(S.n * 3);
    for (let j = 0, e = S.mats; j < S.n; j++) { const o = j * 16; S.rad[j] = r0 * Math.hypot(e[o], e[o + 1], e[o + 2]) + (sh.cast ? 45 : 15); S.cxyz[j * 3] = e[o + 12]; S.cxyz[j * 3 + 1] = e[o + 13]; S.cxyz[j * 3 + 2] = e[o + 14]; }
    S.imPod = buf(); const k = G.kitK || 1; if (k !== 1) { S.R = S.R0 * k; S.Rf = S.Rf0 * k; if (S.R10) S.R1 = S.R10 * k; } ENV.uMdl.value[S.slot] = S.Rf; lx = 1e9;
  };
  G.attachBld = (name, group) => {
    for (const [key, S] of sets) {
      if ((S.pack || S.name) !== name || S.meshes.length) continue;
      let cast = false;
      if (S.pack) { tree2Attach(S, key, group); continue; }
      if (S.part) { kitAttach(S, key, group); continue; }
      group.traverse((c) => {
        if (!c.isMesh) return;
        if (G.winter) snowify(c.material); // зимой - снег на крышах моделей
        const m = new THREE.InstancedMesh(c.geometry, S.col != null ? colMat(c.material, S.col) : S.wind ? windMat(c.material, S.wind, S.slot, /^tr_/.test(name)) : c.material, S.n); m.instanceMatrix = S.im; m.count = 0; m.frustumCulled = false; m.userData.set = key;
        const crown = NS_ON && !!S.wind && c.material.alphaTest > 0 && ((!TOUCH_GT && !P.shadowLite) || P.treeShadows); // крона дерева тоже бросает тень (раньше - только ствол): глубина с вырезом по листве
        if (crown) m.customDepthMaterial = leafDepth(c.material);
        m.castShadow = !!sh.cast && (!c.material.alphaTest || crown); m.receiveShadow = !!sh.receive; scene.add(m); S.meshes.push(m); cast = cast || m.castShadow;
      });
      // шар вокруг начала модели, вмещающий её, × масштаб экземпляра - для отсечения по полю зрения (+ запас на тень, если отбрасывает)
      const bb = new THREE.Box3().setFromObject(group); let r0 = 0;
      for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) r0 = Math.max(r0, Math.hypot(x, y, z));
      S.rad = new Float32Array(S.n); S.cxyz = new Float32Array(S.n * 3);
      for (let j = 0, e = S.mats; j < S.n; j++) {
        const o = j * 16, k = Math.max(Math.hypot(e[o], e[o + 1], e[o + 2]), Math.hypot(e[o + 4], e[o + 5], e[o + 6]), Math.hypot(e[o + 8], e[o + 9], e[o + 10]));
        S.rad[j] = r0 * k + (cast ? 45 : 15); // запас 15 м: отбор - через кадр
        S.cxyz[j * 3] = e[o + 12]; S.cxyz[j * 3 + 1] = e[o + 13]; S.cxyz[j * 3 + 2] = e[o + 14];
      }
      S.imPod = new THREE.InstancedBufferAttribute(new Float32Array(S.n * 16), 16); S.imPod.setUsage(THREE.DynamicDrawUsage);
      if (S.slot) { ENV.uMdl.value[S.slot] = S.R; const sf = S.slot === YARD || (S.slot >= 14 && S.slot <= 17) ? null : surfColors(G.renderer, group), mc = S.slot === YARD || WH.includes(S.slot) || sf ? null : modelColor(group); if (sf) { ENV.uMdlCol.value[S.slot].set(...sf.wall, 2); if (sf.roof) ENV.uMdlRf.value[S.slot].set(...sf.roof, 1); } if (mc) ENV.uMdlCol.value[S.slot].set(mc.r, mc.g, mc.b, 1); if (S.slot === YARD) ENV.uMdlCol.value[YARD].set(0.2, 0.16, 0.15, 1); } // площадки вдали - один пёстро-ржавый цвет (наборов много, порядок прихода любой); цеха - своя палитра коробок
      lx = 1e9;
      // тяжёлая модель (больше 2500 треугольников) - на средней дальности упрощённой копией (~ четверть треугольников)
      let tri = 0; for (const m of S.meshes) tri += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
      if (tri > 2500 && P.bldLo !== false && !(S.slot && !(S.slot >= 14 && S.slot <= 17) && (P.bldFar || 0) > S.R)) Promise.all(S.meshes.map((m) => loIndex(m.geometry, 0.35, 0.005))).then((ix) => { // мягче, чем было (0,25 / 0,012): у крупных - меньше «мятых» граней
        let lt = 0; S.meshes.forEach((m, i) => { lt += ix[i] ? ix[i].count / 3 : (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; });
        if (lt > tri * 0.7) return; // выигрыш меньше 30 % - лишние вызовы отрисовки дороже
        S.imLo = new THREE.InstancedBufferAttribute(new Float32Array(S.n * 16), 16); S.imLo.setUsage(THREE.DynamicDrawUsage);
        S.lo = S.meshes.map((h, i) => {
          let g = h.geometry;
          if (ix[i]) { g = new THREE.BufferGeometry(); for (const a in h.geometry.attributes) g.setAttribute(a, h.geometry.attributes[a]); g.setIndex(ix[i]); g.boundingSphere = h.geometry.boundingSphere; }
          const m = new THREE.InstancedMesh(g, h.material, S.n); m.instanceMatrix = S.imLo; m.count = 0; m.visible = false; m.frustumCulled = false;
          m.castShadow = h.castShadow; m.receiveShadow = h.receiveShadow; Object.assign(m.userData, { set: key, lo: true }); scene.add(m); return m;
        });
        S.R1 = Math.max(120, S.R * 0.45); lx = 1e9;
      }).catch(() => { /* без упрощения - модель целиком */ });
      // вдали (до P.bldFar) - сильно упрощённая та же модель вместо коробки; дальше - коробки в цвет модели (там здания - точки)
      const yard = S.slot === YARD, RF = yard ? Math.min(P.bldFar || 0, YARD_FAR) : S.slot >= 14 && S.slot <= 17 ? (TREE_MID ? P.treeFar || 0 : 0) : (P.bldFar || 0); // площадки порта: дальше ближнего радиуса - те же контейнеры коробочками (упрощённая сетка, свой цвет), за YARD_FAR - штабели и блоки брусками (yardLayer); коробка площадки не рисуется (Mark 2026-11-15: прямоугольник вместо контейнеров сменялся резко)
      const big = tri >= 8000 && !(S.slot >= 14 && S.slot <= 17); // сталинки, высотки, «пластины» - мягче
      const tree = S.slot >= 14 && S.slot <= 17, wh = FAC_ON && WH.includes(S.slot), imp = RF > S.R && S.slot && !tree && !yard && !wh ? makeImpostor(group, G.renderer, (() => { const b = new THREE.Box3().setFromObject(group), z = b.getSize(new THREE.Vector3()); return Math.max(z.x, z.z) > 60 ? 512 : big || S.R >= R ? 256 : 128; })()) : null; // дома - импостор (снимки модели), деревья - упрощённая сетка
      if (imp) {
        S.imFar = new THREE.InstancedBufferAttribute(new Float32Array(S.n * 16), 16); S.imFar.setUsage(THREE.DynamicDrawUsage);
        const m = new THREE.InstancedMesh(imp.geo, imp.mat, S.n); m.instanceMatrix = S.imFar; m.count = 0; m.visible = false; m.frustumCulled = false; m.receiveShadow = !!sh.receive;
        Object.assign(m.userData, { set: key, far: true }); scene.add(m); S.far = [m]; S.Rf = RF; ENV.uMdl.value[S.slot] = RF; lx = 1e9;
      } else if (RF > S.R && S.slot && (tree || yard || wh)) Promise.all(S.meshes.map((m) => (wh ? loIndex(m.geometry, 0.3, 0.004) : farIndex(m.geometry, yard ? 0.04 : 0.08, yard ? 4 : 8)).then((ix) => { const g = new THREE.BufferGeometry(); for (const a in m.geometry.attributes) g.setAttribute(a, m.geometry.attributes[a]); g.setIndex(ix || m.geometry.index); g.boundingSphere = m.geometry.boundingSphere; return g; }))).then((gs) => {
        S.imFar = new THREE.InstancedBufferAttribute(new Float32Array(S.n * 16), 16); S.imFar.setUsage(THREE.DynamicDrawUsage);
        S.far = S.meshes.map((h, i) => {
          const m = new THREE.InstancedMesh(gs[i], h.material, S.n); m.instanceMatrix = S.imFar; m.count = 0; m.visible = false; m.frustumCulled = false;
          m.castShadow = false; m.receiveShadow = h.receiveShadow; Object.assign(m.userData, { set: key, far: true }); scene.add(m); return m;
        });
        S.Rf = RF; ENV.uMdl.value[S.slot] = RF; lx = 1e9; // коробки этого вида спрятаны до RF - там теперь модель
      }).catch(() => { /* без дальней копии - коробки */ });
    }
  };
  Object.defineProperty(G, 'bldNames', { get: () => [...new Set([...sets.values()].map((S) => S.pack || S.name))] });
  // раз в кадр: в радиусе от камеры (его коробки прячет шейдер) и в поле зрения - камеры или контейнера (cams);
  // модели за спиной не рисуются ни в кадре, ни в тенях, ни в окне контейнера
  let lx = 1e9, lz = 1e9, nk = 0, nfx = 1e9, nfz = 1e9;
  const FR = [new THREE.Frustum(), new THREE.Frustum()], PM = new THREE.Matrix4(), lastM = new Float32Array(16);
  // сфера клетки сетки набора (все её экземпляры со своими радиусами) - для отсева клетки целиком по полю зрения; считается один раз
  const cellB = (S, k, cell) => {
    let m = S.cb; if (!m) m = S.cb = new Map(); let b = m.get(k); if (b) return b;
    const C3 = S.cxyz; let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
    for (let q = 0; q < cell.length; q++) { const j = cell[q] * 3; x0 = Math.min(x0, C3[j]); x1 = Math.max(x1, C3[j]); y0 = Math.min(y0, C3[j + 1]); y1 = Math.max(y1, C3[j + 1]); z0 = Math.min(z0, C3[j + 2]); z1 = Math.max(z1, C3[j + 2]); }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2; let r = 0;
    for (let q = 0; q < cell.length; q++) { const j = cell[q]; r = Math.max(r, Math.hypot(C3[j * 3] - cx, C3[j * 3 + 1] - cy, C3[j * 3 + 2] - cz) + S.rad[j]); }
    b = new Float32Array([cx, cy, cz, r]); m.set(k, b); return b;
  };
  const CELLC = typeof location === 'undefined' || !/[?&]cc=0/.test(location.search); // ?cc=0 - без отсева клеток (сравнение)
  const cellVis = (b, nf) => { for (let f = 0; f < nf; f++) { const pl = FR[f].planes; let v = true; for (let k = 0; k < 6; k++) { const q = pl[k]; if (q.normal.x * b[0] + q.normal.y * b[1] + q.normal.z * b[2] + q.constant < -b[3]) { v = false; break; } } if (v) return true; } return false; };
  G.nsPools = (fn) => { for (const S of sets.values()) { for (const m of S.meshes) if (m.castShadow && m.visible && m.userData.nsN !== undefined) fn(m); if (S.lo) for (const m of S.lo) if (m.castShadow && m.visible && m.userData.nsN !== undefined) fn(m); } };
  G.near = (cam, cams) => {
    const p = ENV.uHide.value;
    if ((++nk & 1) && lx < 1e8 && Math.abs(p.x - lx) < 120 && Math.abs(p.z - lz) < 120) return; // через кадр (запас по краям поля зрения - 15 м); резкий скачок камеры - сразу
    let same = Math.abs(p.x - lx) < 0.5 && Math.abs(p.z - lz) < 0.5 && cams.length === 1;
    for (let i = 0, e = cam.matrixWorld.elements; i < 16 && same; i++) if (Math.abs(e[i] - lastM[i]) > 2e-3) same = false;
    if (G.ns && Math.abs(G.ns.f.x - nfx) + Math.abs(G.ns.f.z - nfz) > 3) same = false; // центр ближней карты теней сместился
    if (same) return; // стоим и не поворачиваемся - ничего не меняется
    lx = p.x; lz = p.z; lastM.set(cam.matrixWorld.elements); if (G.ns) { nfx = G.ns.f.x; nfz = G.ns.f.z; }
    const nf = Math.min(cams.length, 2);
    const NS = G.ns, sd = G.sunDir, nsR = NS ? NS.R : 0; // ближняя карта теней (near-shadow.js): её экземпляры - в начало буфера
    for (let i = 0; i < nf; i++) { const c = cams[i]; c.updateMatrixWorld(); PM.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse.copy(c.matrixWorld).invert()); FR[i].setFromProjectionMatrix(PM); }
    for (const S of sets.values()) {
      if (!S.meshes.length) continue;
      const a = S.im.array, R2 = S.R * S.R, C3 = S.cxyz, al = S.lo ? S.imLo.array : null, R12 = al ? S.R1 * S.R1 : R2; let c = 0, cl = 0, cf = 0, cn = 0;
      const af = S.far ? S.imFar.array : null, RM = af ? S.Rf : S.R, RM2 = RM * RM; // вдали - упрощённая копия (до Rf)
      const g = S.gb, ix0 = Math.max(g[0], Math.floor((p.x - RM) / GC)), ix1 = Math.min(g[1], Math.floor((p.x + RM) / GC)), iz0 = Math.max(g[2], Math.floor((p.z - RM) / GC)), iz1 = Math.min(g[3], Math.floor((p.z + RM) / GC));
      for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
      const ck = gkey(ix, iz), cell = S.grid.get(ck); if (!cell) continue;
      if (CELLC && S.rad && !cellVis(cellB(S, ck, cell), nf)) continue; // клетка целиком вне поля зрения - её экземпляры не перебираем
      for (let q = 0; q < cell.length; q++) {
        const j = cell[q], dx = S.xz[j * 2] - p.x, dz = S.xz[j * 2 + 1] - p.z, d2 = dx * dx + dz * dz;
        if (d2 >= RM2 || d2 < S.rIn * S.rIn || (S.bi && S.offA[S.bi[j]])) continue; // разрушенный свой дом - своими модулями (kitDyn)
        const x = C3[j * 3], y = C3[j * 3 + 1], z = C3[j * 3 + 2], r = S.rad[j];
        let vis = false;
        for (let f = 0; f < nf && !vis; f++) { const pl = FR[f].planes; vis = true; for (let k = 0; k < 6; k++) { const q = pl[k]; if (q.normal.x * x + q.normal.y * y + q.normal.z * z + q.constant < -r) { vis = false; break; } } }
        if (!vis) continue;
        if (d2 < R12) {
          let near = false; if (NS) { const vx = x - NS.f.x, vy = y - NS.f.y, vz = z - NS.f.z, t = vx * sd.x + vy * sd.y + vz * sd.z, q = nsR + r; near = vx * vx + vy * vy + vz * vz - t * t < q * q; }
          if (near) { if (cn < c) a.copyWithin(c * 16, cn * 16, cn * 16 + 16); a.set(S.mats.subarray(j * 16, j * 16 + 16), cn * 16); cn++; } else a.set(S.mats.subarray(j * 16, j * 16 + 16), c * 16);
          c++; } else if (d2 < R2) { al.set(S.mats.subarray(j * 16, j * 16 + 16), cl * 16); cl++; } else { af.set(S.mats.subarray(j * 16, j * 16 + 16), cf * 16); cf++; }
      } }
      // на видеочип - только занятая часть буфера (у деревьев весь буфер - сотни КБ, а видно десятки)
      if (c || S.c0) { S.im.updateRange.count = Math.max(c, 1) * 16; S.im.needsUpdate = true; } S.c0 = c;
      for (const m of S.meshes) { m.count = c; m.visible = c > 0; m.userData.nsN = cn; m.userData.nsC = undefined; } // пустые - без вызова отрисовки
      if (al) { if (cl || S.cl0) { S.imLo.updateRange.count = Math.max(cl, 1) * 16; S.imLo.needsUpdate = true; } S.cl0 = cl; for (const m of S.lo) { m.count = cl; m.visible = cl > 0; m.userData.nsN = S.tr ? cl : 0; m.userData.nsC = undefined; } }
      if (af) { if (cf || S.cf0) { S.imFar.updateRange.count = Math.max(cf, 1) * 16; S.imFar.needsUpdate = true; } S.cf0 = cf; for (const m of S.far) { m.count = cf; m.visible = cf > 0; } }
    }
    if (G.grassT) G.grassT(cam.position);
    if (G.yardL) { // площадки порта: коробку не рисуем - дальние ступени контейнеров (yardLayer) от края моделей
      let nr = 1e9; for (const S of sets.values()) if (S.slot === YARD && S.name !== 'c_rtg' && S.name !== 'c_reach' && S.meshes.length) nr = Math.min(nr, S.far ? S.Rf : S.R); // только пришедшие виды: не пришёл один - остальные всё равно моделями
      ENV.uMdl.value[YARD] = 1e7; G.yardL.tick(p, nr < 1e9 ? nr : 0);
    }
  };
  // окно ТВ: модели вблизи точки at (радиус R) в поле зрения cam - во втором буфере инстансов; коробки там прячет шейдер
  // (uHide = at). Возвращает, как вернуть основной кадр. Основной набор не трогается - нагрузки на остальной кадр нет
  const podFr = new THREE.Frustum(), mdl0 = new Array(32), keep = [];
  G.nearPod = (cam, at, R) => {
    cam.updateMatrixWorld(); PM.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse.copy(cam.matrixWorld).invert()); podFr.setFromProjectionMatrix(PM);
    const pl = podFr.planes, R2 = R * R, U = ENV.uMdl.value; keep.length = 0;
    for (let i = 0; i < 32; i++) mdl0[i] = U[i];
    for (const S of sets.values()) {
      if (!S.meshes.length) continue;
      if (S.rIn) { for (const m of S.meshes) { keep.push(m, m.count, m.visible); m.visible = false; } continue; } // упрощённые модули домов - не в окне ТВ
      if (S.kit) U[S.kit] = R;
      if (!S.imPod) { S.imPod = new THREE.InstancedBufferAttribute(new Float32Array(S.n * 16), 16); S.imPod.setUsage(THREE.DynamicDrawUsage); } // свои дома: буфер окна ТВ - когда понадобился
      const a = S.imPod.array, C3 = S.cxyz; let c = 0;
      const ix0 = Math.floor((at.x - R) / GC), ix1 = Math.floor((at.x + R) / GC), iz0 = Math.floor((at.z - R) / GC), iz1 = Math.floor((at.z + R) / GC);
      for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
      const ck = gkey(ix, iz), cell = S.grid.get(ck); if (!cell) continue;
      if (CELLC && S.rad) { const b = cellB(S, ck, cell); let v = true; for (let k = 0; k < 6; k++) { const q = pl[k]; if (q.normal.x * b[0] + q.normal.y * b[1] + q.normal.z * b[2] + q.constant < -b[3]) { v = false; break; } } if (!v) continue; }
      for (let q = 0; q < cell.length; q++) {
        const j = cell[q], dx = S.xz[j * 2] - at.x, dz = S.xz[j * 2 + 1] - at.z;
        if (dx * dx + dz * dz >= R2 || (S.bi && S.offA[S.bi[j]])) continue;
        const x = C3[j * 3], y = C3[j * 3 + 1], z = C3[j * 3 + 2], r = S.rad[j];
        let vis = true; for (let k = 0; k < 6; k++) { const q = pl[k]; if (q.normal.x * x + q.normal.y * y + q.normal.z * z + q.constant < -r) { vis = false; break; } }
        if (vis) { a.set(S.mats.subarray(j * 16, j * 16 + 16), c * 16); c++; }
      } }
      if (c) { S.imPod.updateRange.count = c * 16; S.imPod.needsUpdate = true; }
      for (const m of S.meshes) { keep.push(m, m.count, m.visible); m.instanceMatrix = S.imPod; m.count = c; m.visible = c > 0; }
      if (S.lo) for (const m of S.lo) { keep.push(m, m.count, m.visible); m.visible = false; }
      if (S.far) for (const m of S.far) { keep.push(m, m.count, m.visible); m.visible = false; }
      if (S.slot && !(S.slot === YARD && G.yardL)) U[S.slot] = R; // коробку площадки порта не рисуем и в окне ТВ: дальше R - бруски yardLayer от точки взгляда
    }
    if (G.yardL) G.yardL.pod(at, R);
    const ofR = ofPod(at, R);
    const h0 = ENV.uHide.value.clone(); ENV.uHide.value.copy(at);
    return () => {
      if (G.yardL) G.yardL.restore(); ofR();
      for (let i = 0; i < keep.length; i += 3) { const m = keep[i], S = sets.get(m.userData.set); m.instanceMatrix = m.userData.far ? S.imFar : m.userData.lo ? S.imLo : S.im; m.count = keep[i + 1]; m.visible = keep[i + 2]; }
      for (let i = 0; i < 32; i++) U[i] = mdl0[i];
      ENV.uHide.value.copy(h0);
    };
  };
}

// ═════════════ Улица вблизи: фонари и ЛЭП с проводами, автоматы, будки, урны, баки ═════════════
// Только вблизи (вдали не видно) - наборы «моделей вблизи» без процедурной замены (slot 0). Своя случайность от seed.
// Фонарь (p_lamp): столб 6,9 м, консоль вдоль +Z; провода крепятся у вершины столба на консоли.
const WIRE_AT = [-1.4, -0.95, -0.25, 0.3], WIRE_Y = 6.1, WIRE_SAG = 0.7;
function streetProps(G, city, B, P) {
  const R = P.propNear || P.bldNear || 0, rnd = mulberry32(city.seed * 31 + 7), GR = CITY.GRID, n0 = Math.ceil(CITY.R / GR); // propNear - ?full=1 (main.js)
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0), p = new THREE.Vector3(), sc = new THREE.Vector3(), a3 = new THREE.Vector3(), b3 = new THREE.Vector3();
  const sets = {}; const put = (name, x, z, rot, s = 1, y = GH(x, z)) => { (sets[name] = sets[name] || []).push(x, z, ...m4.compose(p.set(x, y, z), q.setFromAxisAngle(Y, rot), sc.setScalar(s)).elements); };
  const wire = [], seg = (A, Bp) => { const d = b3.copy(Bp).sub(A), L = d.length(); q.setFromUnitVectors(X, d.normalize()); wire.push((A.x + Bp.x) / 2, (A.z + Bp.z) / 2, ...m4.compose(p.copy(A).add(Bp).multiplyScalar(0.5), q, sc.set(L, 1, 1)).elements); };
  // точка крепления провода k у столба: столб (x, z), поворот rot (консоль +Z модели)
  const att = (x, z, rot, k, out) => out.set(x + Math.sin(rot) * WIRE_AT[k], GH(x, z) + WIRE_Y, z + Math.cos(rot) * WIRE_AT[k]);
  // линия столбов вдоль оси: проспекты - фонари с обеих сторон, улицы частного сектора - ЛЭП с одной стороны
  const line = (alongX, c, side, step, okZone, withBins) => {
    let prev = null; const rc = Math.round(c / GR) * GR; // ось дороги
    for (let a = -CITY.R; a <= CITY.R; a += step) {
      const m = ((a % GR) + GR) % GR, x = alongX ? a : c, z = alongX ? c : a;
      const ok = m >= 30 && m <= GR - 30 && okZone(ZA(x, z)) && city.bldAt(x, z) <= 0 && city.onRoad(alongX ? x : rc, alongX ? rc : z); // столбы - только у существующей дороги
      if (!ok) { prev = null; continue; }
      const rot = alongX ? (side > 0 ? Math.PI : 0) : -side * Math.PI / 2; // консоль - к дороге
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
    const cx = i * GR, cz = j * GR, zn = ZA(cx, cz); if (zn !== ZONE.MID && zn !== ZONE.CBD) continue;
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      if (rnd() > 0.35) continue;
      const hx = lineW(i) / 2 + 3, hz = lineW(j) / 2 + 3, x = cx + sx * (hx + 6 + rnd() * 10), z = cz + sz * hz;
      if (city.bldAt(x, z) > 0) continue;
      const r = rnd(), name = r < 0.4 ? 'pr_vend' : r < 0.7 ? 'pr_vend2' : 'pr_booth';
      put(name, x, z, sz > 0 ? Math.PI : 0); // лицом к улице вдоль X
      if (name !== 'pr_booth' && rnd() < 0.6) put(name === 'pr_vend' ? 'pr_vend2' : 'pr_vend', x + 1.15 * Math.sign(sx), z, sz > 0 ? Math.PI : 0); // автоматы - парой
    }
  }
  // баки у панельных домов: у торца, в 4 м от стены
  for (let i = 0; i < B.n; i++) {
    if (B.k[i] !== KIND.PANEL || B.y0[i] > 0 || rnd() > 0.6) continue;
    const lx = B.w[i] > B.d[i], e = (lx ? B.w[i] : B.d[i]) / 2 + 4, sd = rnd() < 0.5 ? 1 : -1, x = B.x[i] + (lx ? e * sd : 0), z = B.z[i] + (lx ? 0 : e * sd);
    if (city.bldAt(x, z) <= 0) put('pr_wbins', x, z, (lx ? Math.PI / 2 : 0) + (rnd() < 0.5 ? Math.PI : 0));
  }
  // остановки, знаки, село - своей случайностью (прежние детали улиц не сдвигаются)
  const r2 = mulberry32(city.seed * 53 + 11), BIG = { v_wtower: 1, m_5g: 1, v_barn: 0.8, v_combine: 0.6, v_tractor: 0.5, pr_bstop: 0.45, pr_rstop: 0.45, v_picket: 0.3, sg_main: 0.3, sg_yield: 0.3 };
  const city0 = (zn) => zn === ZONE.MID || zn === ZONE.CBD, rural = (zn) => zn === ZONE.LOW || zn === ZONE.FIELD;
  for (let i = -n0; i <= n0; i++) for (let j = -n0; j < n0; j++) for (const alongX of [true, false]) {
    // середина квартала у дороги по линии i: городская остановка (через 3-4 квартала) или старая сельская; навесом к дороге
    const c = i * GR, a = j * GR + GR / 2, rx = alongX ? a : c, rz = alongX ? c : a, zn = ZA(rx, rz);
    if (!city.onRoad(rx, rz)) continue;
    const pc = city0(zn) ? 0.14 : rural(zn) ? 0.05 : 0; if (!pc || r2() > pc) continue;
    const side = r2() < 0.5 ? 1 : -1, off = (city0(zn) ? lineW(i) / 2 : RURAL_HW) + 4.5, x = rx + (alongX ? 0 : side * off), z = rz + (alongX ? side * off : 0);
    if (city.bldAt(x, z) > 0) continue;
    // повороты по модели (Mark 2026-11-17: «остановки стоят поперек дороги»): у pr_bstop длинная сторона вдоль Z модели, открыта на +X;
    // у pr_rstop длинная вдоль X, открыта на −Z. Поворот Ry: локальный +X → (cos, −sin), −Z → (−sin, −cos); навес - к дороге (−side)
    const rot = city0(zn) ? (alongX ? side * Math.PI / 2 : (side > 0 ? Math.PI : 0)) : (alongX ? (side > 0 ? 0 : Math.PI) : side * Math.PI / 2);
    put(city0(zn) ? 'pr_bstop' : 'pr_rstop', x, z, rot);
  }
  // перекрёстки за городом: на одной дороге «Главная», на другой «Уступи дорогу» (знак - лицом к подъезжающим)
  for (let i = -n0; i <= n0; i++) for (let j = -n0; j <= n0; j++) {
    const cx = i * GR, cz = j * GR; if (!rural(ZA(cx, cz)) || r2() > 0.3) continue;
    const ex = city.onRoad(cx + 30, cz) || city.onRoad(cx - 30, cz), ez = city.onRoad(cx, cz + 30) || city.onRoad(cx, cz - 30); if (!ex || !ez) continue;
    const o = RURAL_HW + 3, mainX = r2() < 0.5;
    for (const sd of [1, -1]) {
      const xm = cx + sd * 14, zm = cz + sd * o, xy = cx + sd * o, zy = cz - sd * 14; // знак у правой обочины, за 14 м до перекрёстка
      if (city.bldAt(mainX ? xm : xy, mainX ? zm : zy) <= 0) put('sg_main', mainX ? xm : xy, mainX ? zm : zy, mainX ? (sd > 0 ? Math.PI / 2 : -Math.PI / 2) : (sd > 0 ? 0 : Math.PI));
      if (city.bldAt(mainX ? xy : xm, mainX ? zy : zm) <= 0) put('sg_yield', mainX ? xy : xm, mainX ? zy : zm, mainX ? (sd > 0 ? 0 : Math.PI) : (sd > 0 ? Math.PI / 2 : -Math.PI / 2));
    }
  }
  // село: у частных домов за городом - штакетник со стороны улицы, сарай во дворе; рядом с домами - трактор, комбайн,
  // водонапорная башня, вышка сотовой связи
  const free = (x, z, r) => city.bldAt(x, z) <= 0 && city.bldAt(x + r, z) <= 0 && city.bldAt(x - r, z) <= 0 && city.bldAt(x, z + r) <= 0 && city.bldAt(x, z - r) <= 0 && !city.onRoad(x, z);
  for (let i = 0; i < B.n; i++) {
    if (B.k[i] !== KIND.HOUSE || B.y0[i] > 0) continue;
    const zn = ZA(B.x[i], B.z[i]); if (!rural(zn)) continue;
    const hx = B.w[i] / 2, hz = B.d[i] / 2;
    // улица - ближайшая к дому линия сетки
    const gx = Math.round(B.x[i] / GR) * GR, gz = Math.round(B.z[i] / GR) * GR, dx = B.x[i] - gx, dz = B.z[i] - gz, toX = Math.abs(dx) < Math.abs(dz);
    const own = PH_ON && !!PH[bldVariant(B, i)]; // свой дом - свой двор (phHouses): прежние штакетник и сарай не ставятся
    if (r2() < 0.7) { // штакетник: секции по 3 м вдоль фасада, в 4 м от стены
      const sd = toX ? -Math.sign(dx) : -Math.sign(dz), L = (toX ? B.d[i] : B.w[i]) + 6, n = Math.max(2, Math.round(L / 3));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) * L / n - L / 2, x = toX ? B.x[i] + sd * (hx + 4) : B.x[i] + t, z = toX ? B.z[i] + t : B.z[i] + sd * (hz + 4);
        if (!own && !city.onRoad(x, z)) put('v_picket', x, z, toX ? 0 : Math.PI / 2); // bldAt - по сетке: у своей стены всегда «дом»
      }
    }
    const back = (d) => [toX ? B.x[i] + Math.sign(dx || 1) * (hx + d) : B.x[i], toX ? B.z[i] : B.z[i] + Math.sign(dz || 1) * (hz + d)];
    if (r2() < 0.18) { const [x, z] = back(11); if (!own && free(x, z, 7)) put('v_barn', x, z, toX ? Math.PI / 2 : 0); }
    const r = r2();
    const spot = (d) => { const a = r2() * Math.PI * 2, x = B.x[i] + Math.cos(a) * d, z = B.z[i] + Math.sin(a) * d; return free(x, z, 6) ? [x, z, a] : null; };
    let q;
    if (r < 0.012 && (q = spot(35 + r2() * 30))) put('v_tractor', q[0], q[1], q[2]);
    else if (r < 0.02 && (q = spot(60 + r2() * 60))) put('v_combine', q[0], q[1], q[2]);
    else if (r < 0.023 && (q = spot(40))) put('v_wtower', q[0], q[1], r2() * 6);
    else if (r < 0.026 && (q = spot(70))) put('m_5g', q[0], q[1], r2() * 6);
  }
  const add = (name, arr, Rk) => { const n = arr.length / 18, xz = new Float32Array(n * 2), mats = new Float32Array(n * 16); for (let k = 0; k < n; k++) { xz[k * 2] = arr[k * 18]; xz[k * 2 + 1] = arr[k * 18 + 1]; mats.set(arr.slice(k * 18 + 2, k * 18 + 18), k * 16); } G.addNear(name, 0, name, R * Rk, xz, mats); };
  for (const [name, arr] of Object.entries(sets)) add(name, arr, name === 'p_lamp' ? 0.6 : BIG[name] || 0.33);
  if (wire.length) {
    add('p_wire', wire, 0.5);
    // провод - тонкий цилиндр длиной 1 вдоль X (модель не грузится - своя)
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
// запечённые объёмные облака (tools/airdef-clouds/bake.html): атлас 4×4 - 0-11 кучевые, 12-15 слоисто-кучевые;
// clouds_n - свет сквозь объём от солнца справа / сверху / слева, clouds_d - R прозрачность, G свет от солнца за облаком,
// B рассеянный свет неба. В шейдере свет смешивается по направлению на солнце (квадраты осей картинки). Картинка всегда стоит вертикально (без крена камеры).
const CLOUD_BASE = 0.35; // низ облака в клетке - примерно на 0,35 размера ниже центра (BASE −0,62 в запекании, клубы чуть ниже)
function cloudTex(f, done) { // → uniform { value }: KTX2, иначе WebP
  const t = new THREE.Texture(); t.flipY = false; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  const U = { value: t };
  if (typeof createImageBitmap !== 'function' || typeof fetch !== 'function') return U;
  texStats.req++;
  webp(); return U; // облака - WebP: в KTX2 светотень в кадре выходила площе (данные те же - разница в выборке мипов; не разобрались)
  function webp() { fetch(new URL(`./tex/${f}.webp?v=20261124a`, import.meta.url)).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(f))))
    .then((b) => createImageBitmap(b, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })).then((bmp) => { t.image = bmp; t.needsUpdate = true; texStats.done++; done(); })
    .catch((e) => { texStats.done++; console.warn('облака не загрузились:', e.message); }); }
}
function buildClouds(scene, count, seed, W, hi, SU) {
  const rnd = mulberry32(seed * 31 + 7), pos = [], cor = [], dat = [];
  let made = 0;
  const thick = W.deck ? 1.6 : 1, flatP = W.deck ? 0.55 : 0.18;
  while (made < count) {
    const cx = (rnd() * 2 - 1) * 24000, cz = (rnd() * 2 - 1) * 24000, cy = 2300 + rnd() * 900, k = 8 + Math.floor(rnd() * 10), R = 500 + rnd() * 900;
    for (let i = 0; i < k && made < count; i++, made++) {
      const x = cx + (rnd() - 0.5) * R * 2, z = cz + (rnd() - 0.5) * R * 2, s = (700 + rnd() * 900) * thick;
      const cell = rnd() < flatP ? 12 + Math.floor(rnd() * 4) : Math.floor(rnd() * 12);
      const y = cy + (rnd() - 0.5) * 60 * thick + CLOUD_BASE * s; // у облаков гряды - общее ровное основание
      const code = (cell + 1) * (rnd() < 0.5 ? -1 : 1); // знак - зеркально
      for (const [u, v] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) { pos.push(x, y, z); cor.push(u, v); dat.push(s, code); }
    }
  }
  const idx = []; for (let i = 0; i < made; i++) idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('corner', new THREE.Float32BufferAttribute(cor, 2)); g.setAttribute('dat', new THREE.Float32BufferAttribute(dat, 2));
  g.setIndex(idx); g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 60000);
  const rdy = { value: 0 }; let left = 2; const one = () => { if (--left === 0) rdy.value = 1; };
  const sfx = hi ? '' : '_lo';
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...ENV, ...FXU, tN: cloudTex('clouds_n' + sfx, one), tD: cloudTex('clouds_d' + sfx, one), uRdy: rdy,
      skyTex: SU.skyTex, skyOn: SU.skyOn, skyU: SU.skyU, skyK: SU.skyK, zenith: SU.zenith, horizon: SU.horizon,
      lit: { value: lin(W.cloudLit) }, dark: { value: lin(W.cloudDark) }, fogC: { value: lin(W.fog) }, fogD: { value: W.fogD } },
    vertexShader: `attribute vec2 corner, dat; varying vec2 vUv; varying vec3 vL, vW; varying float vFade, vFog;
      uniform vec3 uCam, uSun; uniform float fogD;
      void main() {
        vec3 toC = uCam - position; float d = length(toC); vec3 F = toC / max(d, 1.0);
        vec3 Rc = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), Rh = cross(vec3(0.0, 1.0, 0.0), F); float rl = length(Rh);
        vec3 Rb = normalize(mix(Rc, Rh / max(rl, 1e-4), smoothstep(0.05, 0.3, rl))); // сверху и снизу - по камере
        Rb = normalize(Rb - F * dot(Rb, F)); vec3 Ub = cross(F, Rb);
        float fl = sign(dat.y), cell = abs(dat.y) - 1.0;
        vec2 uv = corner + 0.5; if (fl < 0.0) uv.x = 1.0 - uv.x;
        uv = clamp(uv, 0.004, 0.996);
        vUv = vec2((mod(cell, 4.0) + uv.x) * 0.25, 1.0 - (floor(cell / 4.0) + uv.y) * 0.25);
        vL = vec3(dot(uSun, Rb) * fl, dot(uSun, Ub), dot(uSun, F));
        vFade = smoothstep(dat.x * 0.4, dat.x * 1.4, d); vFog = max(1.0 - exp(-pow(d * fogD * 0.55, 2.0)), 1.0 - exp(-d / 15000.0)); // + воздушная перспектива
        vW = position + (Rb * corner.x + Ub * corner.y) * dat.x;
        gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0);
      }`,
    // в проходе половинного разрешения (post.js, fxOn) глубины нет - облако гасится само там, где оно за домом или самолётом
    fragmentShader: `uniform sampler2D tN, tD, tDepth, skyTex; uniform vec3 lit, dark, fogC, uSunCol, uSun, uCam, zenith, horizon; uniform float fxOn, uRdy, skyOn, skyU, skyK; uniform vec2 fxSize, camNF;
      varying vec2 vUv; varying vec3 vL, vW; varying float vFade, vFog;
      vec3 skyAt(vec3 d) { // небо за облаком - как рисует небо (drone/world.js skyMaterial), размыто
        float h = max(d.y, 0.0); vec3 col = mix(horizon, zenith, pow(h, 0.45));
        if (skyOn > 0.5) { vec2 uv = vec2(fract((atan(d.z, d.x) - atan(uSun.z, uSun.x)) / 6.2831853 + skyU), asin(min(h, 1.0)) / 1.5707963);
          #if defined(GL_EXT_shader_texture_lod) || __VERSION__ >= 300
            vec3 p = texture2DLodEXT(skyTex, uv, 5.0).rgb;
          #else
            vec3 p = texture2D(skyTex, uv, 6.0).rgb;
          #endif
          col = mix(col, p * p * skyK, smoothstep(0.0, 0.12, h)); }
        return col; }
      float fxLinZ(float d) { float z = d * 2.0 - 1.0; return 2.0 * camNF.x * camNF.y / (camNF.y + camNF.x - z * (camNF.y - camNF.x)); }
      void main() { vec4 D = texture2D(tD, vUv); float a = pow(D.r, 1.5) * 0.8 * vFade * uRdy; if (a < 0.01) discard; // края - прозрачнее
        if (fxOn > 0.5) { a *= clamp((fxLinZ(texture2D(tDepth, gl_FragCoord.xy / fxSize).r) - fxLinZ(gl_FragCoord.z)) / 120.0, 0.0, 1.0); if (a < 0.01) discard; }
        vec3 A = texture2D(tN, vUv).rgb, L = normalize(vL), q = L * L; // свет сквозь объём: справа, сверху, слева; веса - квадраты осей
        float day = smoothstep(-0.08, 0.12, uSun.y), avg = (A.r + A.g + A.b) / 3.0;
        float sun = (L.x > 0.0 ? q.x * A.r : q.x * A.b) + (L.y > 0.0 ? q.y * A.g : q.y * avg * 0.3)
                  + (L.z > 0.0 ? q.z * (0.3 + 0.7 * mix(avg, A.g, 0.45)) : q.z * D.g * 1.3); // солнце за спиной - облако светлое; за облаком - светятся тонкие края
        vec3 bg = skyAt(normalize(vW - uCam)), amb = mix(dark, bg, 0.55); // тень облака - в цвет неба за ним
        vec3 lt = mix(vec3(dot(lit, vec3(0.3, 0.59, 0.11))), lit, 0.6); // закатный свет - приглушённый
        vec3 c = (amb * (0.26 + 0.58 * D.b) + max(lt - amb * 0.4, vec3(0.0)) * pow(sun, 1.25) * 0.9 * day) * (0.85 + 0.25 * uSunCol);
        c = mix(c, bg, max(vFog, 0.14)); // всегда чуть в дымке неба, вдали растворяется в нём
        gl_FragColor = vec4(c, min(a * 1.1, 1.0) * (1.0 - vFog * 0.35));
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }`,
    transparent: true, depthWrite: false, fog: false, extensions: { shaderTextureLOD: true },
  });
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = 0.5; scene.add(mesh); // облака - фон: раньше дыма (1) и взрывов (3), иначе дальнее облако ложилось поверх них
  return mesh;
}

// мост поперёк реки (вдоль X): пролёт над водой, пологие въезды до самой земли (у берега - сплошная опора-устой), перила,
// разметка, быки в русле. Части для столкновений и сетки высот - прежние (city.js), здесь только картинка
const topR = [], conR = [], mkR = []; // въезды (общие буферы на вызов bridgeParts - очищаются в начале)
function bridgeParts(o) {
  topR.length = conR.length = mkR.length = 0;
  const Yd = 9, T = 2.4, HW = 18, SPAN = CITY.RIVER_W / 2 + 30, K = 0.07, DS = 5;
  const prof = (s) => (Math.abs(s) <= SPAN ? Yd : Yd - K * (Math.abs(s) - SPAN));
  // въезд кончается, где настил лёг на землю (с каждой стороны - своя длина)
  const end = (dir) => { let s = SPAN; while (s < SPAN + 400 && prof(dir * s) > GH(o.x + dir * s, o.z) + 0.3) s += DS; return s + DS; };
  const s0 = -end(-1), s1 = end(1), top = [], con = [], mk = [], topS = [], conS = [], mkS = [];
  const quad = (arr, a, b, c, d) => arr.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (let s = s0; s < s1 - 0.1; s += DS) {
    const span = s >= -SPAN - 0.1 && s + DS <= SPAN + 0.1, [top, con, mk] = span ? [topS, conS, mkS] : [topR, conR, mkR]; // над водой - пролёт (его заменяет модель br_seg)
    const sa = s, sb = Math.min(s1, s + DS), xa = o.x + sa, xb = o.x + sb, ga = GH(xa, o.z), gb = GH(xb, o.z);
    const ya = Math.max(prof(sa), ga + 0.3), yb = Math.max(prof(sb), gb + 0.3);
    // низ: над водой - балка толщиной T, у берега (под настилом меньше 4 м) - сплошной устой до земли
    const ba = ga > ya - T - 4 ? ga - 1 : ya - T, bb = gb > yb - T - 4 ? gb - 1 : yb - T;
    quad(top, [xa, ya, o.z - HW], [xa, ya, o.z + HW], [xb, yb, o.z + HW], [xb, yb, o.z - HW]);
    for (const zz of [o.z - HW, o.z + HW]) {
      quad(con, [xa, ba, zz], [xa, ya, zz], [xb, yb, zz], [xb, bb, zz]);                       // боковина
      quad(con, [xa, ya, zz], [xa, ya + 1.1, zz], [xb, yb + 1.1, zz], [xb, yb, zz]);           // перила
    }
    quad(con, [xa, ba, o.z + HW], [xa, ba, o.z - HW], [xb, bb, o.z - HW], [xb, bb, o.z + HW]);  // низ
    if (Math.floor(s / 12) % 2 === 0) quad(mk, [xa, ya + 0.04, o.z - 0.15], [xa, ya + 0.04, o.z + 0.15], [xb, yb + 0.04, o.z + 0.15], [xb, yb + 0.04, o.z - 0.15]);
  }
  const geo = (arr) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); g.computeVertexNormals(); return g; };
  const ramp = [part(geo(topR), 0x34363a), part(geo(conR), 0x8f8d88), part(geo(mkR), 0xd8d8d0)], span = [part(geo(topS), 0x34363a), part(geo(conS), 0x8f8d88), part(geo(mkS), 0xd8d8d0)];
  // быки в русле
  for (const s of [-75, 0, 75]) { const h = Yd - T - CITY.WATER_Y + 8; span.push(part(new THREE.BoxGeometry(7, h, HW * 2 - 8), 0x7f7d78, M(o.x + s, CITY.WATER_Y - 8 + h / 2, o.z))); }
  return { ramp, span, Yd, SPAN, HW };
}

// пролёты мостов над водой - моделью br_seg (VectorMan): экземплярами (одна отрисовка на деталь на все мосты), процедурный
// пролёт прячется. Модель: асфальт на +3,2 м, колонны опоры - от −4,71 до −0,28 м (растягиваются до дна), ригель (cap) - только
// над колоннами (через пролёт-два), ширина асфальта 5,5 м
// аэродром: огни приближения - стойки через 60 м на 900 м за торцами ВПП (ось - по X; где дом - пропуск), топливозаправщики у цистерн
function attachAirfield(G, scene, name, model, city, P) {
  const { x, z, rwyL } = AIRPORT, pts = [];
  if (name === 'af_appr') { for (const s of [-1, 1]) for (let k = 0; k < 15; k++) { const px = x + s * (rwyL / 2 + 30 + k * 60); if (Math.abs(px) < CITY.HALF - 50 && city.bldAt(px, z) <= 0) pts.push([px, z, Math.PI / 2]); } }
  else pts.push([x + 380, z + 578, Math.PI / 2], [x + 396, z + 578, Math.PI / 2], [x + 300, z + 470, 0]);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  model.traverse((c) => {
    if (!c.isMesh) return;
    const im = new THREE.InstancedMesh(c.geometry, c.material, pts.length);
    pts.forEach(([px, pz, yaw], i) => im.setMatrixAt(i, m4.compose(v.set(px, GH(px, pz), pz), q.setFromAxisAngle(Y, yaw), one)));
    im.castShadow = name === 'af_fuel' && !!P.shadows; im.receiveShadow = !!P.shadows; scene.add(im);
    if (name === 'af_appr') { const R2 = rwyL / 2 + 900 + (P.brNear || 1600); (G.lodTicks = G.lodTicks || []).push((cam) => { im.visible = Math.hypot(cam.position.x - x, cam.position.z - z) < R2; }); } // огни подхода (стойка 4,6 тыс. треугольников) - только вблизи аэродрома
  });
}
function attachBridgeSegs(G, scene, model, P) {
  const list = G.bridgeSpans || []; if (!list.length) return;
  // широкий городской мост - четыре параллельных пролёта (ширина модели 7,75 м), перила - только по внешним краям.
  // У каждого моста - свои экземпляры (Mark 2026-11-17, телефон: пролёты всех мостов рисовались всегда, ~0,3 млн треугольников): ближе NEAR -
  // моделью, дальше - прежний простой пролёт (G.lodTicks)
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const NEAR = P.brNear || 1600;
  for (const b of list) {
    const L = { deck: [], railL: [], railR: [], pier: [], cap: [] };
    const n = Math.max(1, Math.round(2 * b.SPAN / 9.6)), sl = 2 * b.SPAN / (n * 9.6), NS = 4, sx = (2 * b.HW) / (NS * 7.75), y0 = b.Yd - 3.2;
    for (let k = 0; k < n; k++) for (let st = 0; st < NS; st++) {
      const x = b.o.x - b.SPAN + (k + 0.5) * 2 * b.SPAN / n, z = b.o.z + (st - (NS - 1) / 2) * 7.75 * sx; // поворот на 90°: +x модели → −z мира
      const dm = m4.compose(v.set(x, y0, z), q, sc.set(sx, 1, sl)).clone(); L.deck.push(dm);
      if (st === 0) L.railR.push(dm); if (st === NS - 1) L.railL.push(dm);
      if (k % 3 === 1 || n < 3) { L.cap.push(dm); const top = y0 - 0.28, bot = CITY.WATER_Y - 8, sy = (top - bot) / 4.43; L.pier.push(m4.compose(v.set(x, top + 0.28 * sy, z), q, sc.set(sx, sy, sl)).clone()); }
    }
    b.ims = [];
    model.traverse((c) => {
      if (!c.isMesh) return;
      const k = (c.name.match(/^(railL|railR|pier|cap)\|/) || [])[1] || 'deck', mats = L[k]; if (!mats.length) return;
      const im = new THREE.InstancedMesh(c.geometry, c.material, mats.length);
      mats.forEach((m, i) => im.setMatrixAt(i, m)); im.instanceMatrix.needsUpdate = true; im.frustumCulled = false; im.visible = false;
      im.castShadow = im.receiveShadow = !!P.shadows; scene.add(im); b.ims.push(im);
    });
    b.near = null; b.mesh.visible = true;
  }
  (G.lodTicks = G.lodTicks || []).push((cam) => {
    for (const b of list) {
      const near = Math.max(0, Math.hypot(cam.position.x - b.o.x, cam.position.z - b.o.z) - b.SPAN) < NEAR;
      if (near === b.near) continue; b.near = near; b.mesh.visible = !near; for (const im of b.ims) im.visible = near;
    }
  });
}

// ═════════════ Сборка сцены ═════════════
export function buildCityScene(scene, city, P, renderer, weatherKey = 'day') {
  GH = city.groundH; ZA = city.zoneAt; LAWNS = city.objects.filter((o) => o.lawn); const WINT = city.kind === 'winter'; ENV.uSnowK.value = WINT ? 1 : 0; // зимняя карта: своя земля и лес, без реки-воды и улиц
  const AUT = city.kind === 'autumn', HILLS = WINT || AUT; // осенняя «Туманная топь»: своя земля, лес, дороги и вода болота (без снега)
  TILE = TOUCH_GT || !P.shadows ? 6000 : 3000; // плитки инстансов (см. TILE)
  PH_ON = KIT_ON && !HILLS;
  const W = WEATHERS[weatherKey] || WEATHERS.day;
  const G = { tiles: [], W, renderer, winter: WINT }; // renderer - снимки моделей для дальних копий домов (makeImpostor)
  if (P.roofDetail) loadCityTextures(renderer ? Math.min(P.aniso || 4, renderer.capabilities.getMaxAnisotropy()) : 1, (P.zoneTex || 1024) >= 2048 || ((P.aniso || 4) >= 8 && !TOUCH_GT), HILLS); // на «Низком» - без текстур; атласы земли 4096 - «Ультра» и ПК
  else for (const u of Object.keys(TEX_FILES)) if (!TEX[u]) TEX[u] = { value: null };
  // солнце и атмосфера по погоде (как setWeather в «Летке»)
  const e = W.el * Math.PI / 180, a = W.az * Math.PI / 180;
  const sunDir = new THREE.Vector3(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a));
  ENV.uSun.value.copy(sunDir); ENV.uZen.value.copy(lin(W.zenith)); ENV.uHor.value.copy(lin(W.horizon)); ENV.uGnd.value.copy(lin(W.fog)).multiplyScalar(0.25);
  ENV.uSunCol.value.copy(lin(W.sun)).multiplyScalar(W.sunVis ? 1 : 0.15); ENV.uNight.value = W.night || 0; ENV.uGK.value = W.sunVis && !W.night ? Math.min(1, Math.max(0, (W.el - 6) / 14)) : 0; // земля притушена только при сильном солнце (в сумерках и пасмурно она и так тёмная)
  const SU = { sunDir: { value: sunDir }, zenith: { value: lin(W.zenith) }, horizon: { value: lin(W.horizon) }, ground: { value: lin(W.fog).multiplyScalar(0.75) },
    glow: { value: lin(W.glow).multiplyScalar(W.glowK || 0) }, haze: { value: lin(W.haze) }, sunCol: { value: lin(W.sun).lerp(new THREE.Color(1, 0.95, 0.85), W.el < 20 ? 0.25 : 0.5) },
    hazeK: { value: W.hazeK }, halo: { value: W.halo }, discK: { value: W.disc }, flash: { value: 0 }, ...skyUniforms() };
  SKY.hi = !P.skyOnly && renderer.capabilities.maxTextureSize >= 8192; skyPano(SU, W); if (ALT && !HILLS && SU.skyH0) SU.skyH0.value = Math.max(SU.skyH0.value, 0.075); setPaintSky(SU); // панорама неба (Poly Haven); 8K - не на телефонных пресетах. ?alt=1: снятые у горизонта горы панорамы (плоская синяя полоса на «Среднем», где земля кончается раньше) - ниже ~4° градиент неба
  const sky = new THREE.Mesh(new THREE.SphereGeometry(42000, 48, 24), skyMaterial(SU, 1));
  // небо - после земли (renderOrder 1), последним из непрозрачного (2026-10-26): закрытое землёй, домами и техникой не считается; кадр ГП −1…−4 %
  // (frame-ab.js, 3 карты × «Средний»/«Высокий»), снимки те же. ?sko=0 - первым, как раньше
  sky.renderOrder = typeof location !== 'undefined' && /[?&]sko=0/.test(location.search) ? -2 : 2; sky.frustumCulled = false; scene.add(sky); G.sky = sky;
  // дымка: не реже, чем нужно, чтобы дальние плитки растворялись до того, как пропадут
  const LT = !HILLS && LIGHTS[LIGHT] && !W.night ? LIGHTS[LIGHT] : null; // проба света (?light=)
  scene.fog = new THREE.FogExp2(lin(LT ? LT.fog : W.fog), setAir(W, P.draw, W.fogD * (LT ? LT.fogD : LOOK && !HILLS ? 0.6 : 1) * (ALT && !HILLS ? 0.8 : 1), sunDir.y));
  if (ALT && !HILLS && !W.night) scene.fog.color.copy(lin(W.horizon)).multiplyScalar(0.93); // ?alt=1: цвет дымки - небо у горизонта чуть темнее: дальний рельеф (холмы на краю карты) растворяется в небе силуэтом, а не стоит сплошной полосой своего цвета
  ATMO.sunDir.x = sunDir.x; ATMO.sunDir.y = sunDir.y; ATMO.sunDir.z = sunDir.z;
  const sc = lin(W.sun), fc = lin(LT ? LT.fog : W.fog), lowSun = 1 - THREE.MathUtils.smoothstep(sunDir.y, 0.1, 0.6);
  ATMO.sunCol.x = fc.r * 0.4 + sc.r * 0.9; ATMO.sunCol.y = fc.g * 0.4 + sc.g * 0.9; ATMO.sunCol.z = fc.b * 0.4 + sc.b * 0.9;
  ATMO.p.y = W.sunVis ? 0.35 + 0.4 * lowSun : 0;

  // свет
  const LK = LOOK && !HILLS; // проба «земля и свет» - только город
  const hemi = new THREE.HemisphereLight(lin(LT ? LT.sky : W.sky), lin(LT ? LT.gnd : W.gnd), 0.55 * W.hemiI * (LT ? LT.hemi : LK ? 0.62 : 1)); scene.add(hemi);
  if (W.winter && !(typeof location !== 'undefined' && /[?&]sn=0/.test(location.search))) { // снег светит снизу: отражение 0,75 от солнца и неба, вполовину (у стен он и сам в тени); ?sn=0 - как раньше
    const Y = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b, sI = 2.0 * W.sunI * (0.35 + 0.65 * Math.min(1, sunDir.y / 0.25)), E = sI * sunDir.y * Y(lin(W.sun)) + hemi.intensity * Y(hemi.color);
    hemi.groundColor.multiplyScalar(Math.min(3.5, Math.max(1, 0.34 * E / (hemi.intensity * Math.max(0.05, Y(hemi.groundColor)))))); }
  const sunL = new THREE.DirectionalLight(lin(LT && LT.sunC ? LT.sunC : W.sun), 2.0 * W.sunI * (0.35 + 0.65 * Math.min(1, sunDir.y / 0.25)) * (LT ? LT.sun : LK ? 1.32 : 1));
  sunL.position.copy(sunDir).multiplyScalar(5000); scene.add(sunL); scene.add(sunL.target);
  // свет - и на слоях облаков, дыма и огня (2026-10-26): они рисуются отдельными проходами (post.js) - без света в слоях число источников в ключе
  // шейдера было 0, а прогрев (main.js prewarm) собирал вариант с 1 + 1 → первый взрыв собирал шейдеры заново (рывок). Сами они свет не используют
  for (const l of [hemi, sunL]) { l.layers.enable(FX_LAYER); l.layers.enable(FX_ADD_LAYER); }
  if (P.shadows && W.shadows) {
    sunL.castShadow = true; sunL.shadow.mapSize.set(P.shadowMap || 2048, P.shadowMap || 2048);
    const b = P.shadowBox || 700, c = sunL.shadow.camera; c.left = -b; c.right = b; c.top = b; c.bottom = -b; c.near = 100; c.far = 12000; c.updateProjectionMatrix();
    sunL.shadow.bias = -0.0004; sunL.shadow.normalBias = 1.5;
    const N = P.shadowMap > 2048 ? 3072 : P.shadowMap || 2048; // две половины (near-shadow.js): 2 × 3072² вместо 4096² - памяти чуть больше, дальняя тень чуть мягче
    if (NS_ON) { nearShadow(sunL, N, b, sunDir.y, G, renderer, !!P.shadowLite); G.ns = { f: new THREE.Vector3(1e9, 0, 0), R: b / NS_K }; }
    G.shTexel = 2 * b / (NS_ON ? N : P.shadowMap || 2048);
  }
  G.sun = sunL; G.sunDir = sunDir; G.hemi = hemi; T2SUN.value.copy(sunL.color).multiplyScalar(sunL.intensity);
  const sh = { cast: P.shadows, receive: P.shadows, proxy: () => (GRASS_SH && !P.shadowLite ? G.nsProxy : null) };
  const CROWN = (!TOUCH_GT && !P.shadowLite) || P.treeShadows; // кроны моделей сами дают тень вблизи; иначе - подставные и в ближней половине
  // подставные тени деревьев - по плиткам, в дальней половине карты теней
  const treeShadows = (list, round, both = false) => { if (!G.nsProxy || !list.length) return; for (const m of tiled(scene, list, treeShadowGeo(round), shadowOnly(), { cast: true })) { m.visible = false; m.receiveShadow = false; (both ? G.nsProxy.both : G.nsProxy.far).push(m); } };

  // земля
  if (GC_ON && P.bldNear > 0) G.grassT = groundCover(scene, city, sh, P); // покров земли вблизи (свои gc_*, models/gc.glb): модель - G.gcAttach (main.js)
  G.gcAttach = G.grassT ? (g) => { G.grassT.attach(g); if (G.nearDirty) G.nearDirty(); } : null;
  const seg = HILLS || RELIEF ? Math.min(640, Math.round(P.groundSeg * 1.6)) : P.groundSeg; // горы и холмы - сетка гуще (город с рельефом - тоже)
  const gg = new THREE.PlaneGeometry(2 * CITY.HALF, 2 * CITY.HALF, seg, seg); gg.rotateX(-Math.PI / 2);
  const pa = gg.attributes.position, uv = gg.attributes.uv;
  for (let i = 0; i < pa.count; i++) {
    pa.setY(i, GH(pa.getX(i), pa.getZ(i)));
    uv.setXY(i, (pa.getX(i) + CITY.HALF) / (2 * CITY.HALF), (pa.getZ(i) + CITY.HALF) / (2 * CITY.HALF));
  }
  gg.computeVertexNormals();
  const zt = HILLS ? null : zoneTexture(P.zoneTex || 1024); if (zt) zt.flipY = false;
  if (renderer && zt) zt.anisotropy = Math.min(P.aniso || 4, renderer.capabilities.getMaxAnisotropy());
  const aniso = renderer ? Math.min(P.aniso || 4, renderer.capabilities.getMaxAnisotropy()) : 1;
  // город на ПК («Высокий», «Ультра», «Кастомный» - не на сенсорном): уровни 4096, L0 - 2 м на тексель (окно то же, 8,2 км; L1 - 7,8 м): запечённое начинается
  // там, где тексель не крупнее двух пикселей, а на большом экране при 4 м это было бы лишь с 4-5 км; на телефоне - 2048 (память)
  const BK_HI = !HILLS && !TOUCH_GT && P.shadows;
  const bake = BAKE_ON && renderer ? createGroundBake(CITY.HALF, { ...(BK_HI ? { n0: 4096, s0: 2, n1: 4096 } : {}), ...(ALT ? { d0: 1200, d1: 3000 } : {}) }) : null; // запечённый цвет дальней земли (ground-bake.js; ?gb=0 - без него): осень, зима и город
  const terrainTex = () => bakeTerrain(renderer, city, sunDir, P.bldNear >= 650 && !TOUCH_GT ? 4096 : P.bldNear > 0 ? 2048 : 1024, aniso) || winterNormalTex(city); // рельеф с промоинами, небо и солнце склонов (terrain-bake.js)
  const ground = new THREE.Mesh(gg, AUT ? autumnGroundMaterial(city, autumnZoneTex(city, P.zoneTex || 1024), terrainTex(), ENV, autumnTextures(aniso, texStats, P.bldNear >= 450 && !TOUCH_GT), W, bake) : WINT ? winterGroundMaterial(city, winterZoneTex(city, P.zoneTex || 1024), terrainTex(), ENV, winterTextures(renderer ? Math.min(P.aniso || 4, renderer.capabilities.getMaxAnisotropy()) : 1, texStats, P.bldNear >= 450 && !TOUCH_GT), bake) : groundMaterial(zt, aoTexture(city), roadTexture(city), bake, () => (!P.roofDetail || (TEX.uTexOn.value === 1 && GT.uGOn.value === 1))));
  ground.receiveShadow = !!P.shadows; scene.add(ground); G.ground = ground;
  // вдали точности глубины не хватает (с 600 м на 6 км - ~0,5 м): площадки, асфальт и основания объектов-целей в полуметре над землёй
  // «спорили» с ней и мерцали (Mark 2026-11-17). Земля по глубине чуть дальше - всё, что на ней лежит, рисуется поверх (?gpo=0 - как раньше)
  if (!(typeof location !== 'undefined' && /[?&]gpo=0/.test(location.search))) for (const m of [].concat(ground.material)) Object.assign(m, { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 });
  if (AUT && G.ground && G.ground.material.userData.uLowL) { // туман низин осени: цвет дымки без освещения - в темноте («Поздний вечер», ночь) светился пятнами (Mark 2026-11-16)
    const W0 = W.lab0 || W, L0 = Math.max(1e-3, 0.55 * (W0.hemiI ?? 1) + 0.35 * 2.0 * (W0.sunI ?? 1) * (0.35 + 0.65 * Math.min(1, sunDir.y / 0.25))); // опора - свет погоды до правок стенда (иначе тёмная погода = тёмная опора, и туман не темнел бы)
    const LU = G.ground.material.userData.uLowL;
    G.lowL = () => { LU.value = Math.min(1.5, (G.hemi.intensity + 0.35 * G.sun.intensity) / L0); }; }
  if (bake) { bake.init(renderer, gg, ground.material, aniso); G.bake = bake; }
  // земля - последней из непрозрачного (2026-10-25): её шейдер - самый дорогой, а под лесом, домами и техникой он теперь не считается -
  // их глубина уже в буфере (стенд: кадр за самолётом над лесом −13 % на «Высоком», −6 % на «Среднем»; картинка та же - прозрачное всё равно после)
  if (!/[?&]gro=0/.test(typeof location !== 'undefined' ? location.search : '')) ground.renderOrder = 1;
  { // высота самой сетки земли (треугольники через 2·HALF/seg м), а не точная высота карты: на выпуклом склоне сетка выше на метры,
    // у берега реки в городе (спуск к воде ~60 м, клетка сетки - больше) - ниже или выше. По ней ставятся машины ПВО (main.js seat)
    const st = 2 * CITY.HALF / seg, gH = city.groundH, n1 = seg + 1, hv = new Float32Array(n1 * n1);
    for (let j = 0; j < n1; j++) for (let i = 0; i < n1; i++) hv[j * n1 + i] = gH(-CITY.HALF + i * st, -CITY.HALF + j * st);
    G.meshH = (x, z) => {
      const fx = Math.min(seg - 1e-4, Math.max(0, (x + CITY.HALF) / st)), fz = Math.min(seg - 1e-4, Math.max(0, (z + CITY.HALF) / st)), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
      const a = hv[j * n1 + i], b = hv[(j + 1) * n1 + i], c = hv[(j + 1) * n1 + i + 1], d = hv[j * n1 + i + 1]; // как PlaneGeometry: (a, b, d) и (b, c, d)
      return u + v <= 1 ? a + (d - a) * u + (b - a) * v : c + (b - c) * (1 - u) + (d - c) * (1 - v);
    };
  }
  if (RELIEF && !HILLS) GH = G.meshH; // город с рельефом (проба): дома, деревья, площадки - по высоте сетки
  if (HILLS) { // дальше всё ставится по высоте сетки, а не по точной высоте карты: дороги и дома на склоне «тонули» бы
    GH = G.meshH; G.roads = AUT ? autumnRoads(scene, city, ground.material.userData.AT || {}, P, GH) : winterRoads(scene, city, ground.material.userData.WT || {}, P, GH);
  }

  // река: тёмная вода, волны, отражение неба, блик солнца
  const WM = AUT ? autumnWaterMask(city) : null; // осень: вода болота - по маске (где вода), а не вдоль реки
  const wm = new THREE.MeshPhongMaterial({ color: lin(AUT ? 0x141710 : 0x1a2e3a), specular: lin(W.sun).multiplyScalar(W.sunVis ? (SCAN && !AUT ? 0.5 : 1.2) : 0.2), shininess: SCAN && !AUT ? 120 : 260 });
  // болото: дно в 1,5 м под водой, берег - в 0,5 м над ней; издалека (камера за баллистикой в десятках км) шаг глубины - метры, вода и дно мерцали.
  // Сдвиг глубины на несколько шагов к камере: вблизи - доли миллиметра (не видно), вдали - вода всегда поверх дна (берег - по маске воды)
  if (WM) Object.assign(wm, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
  wm.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, ENV, { tWN: TEX.tWN, uTexOn: TEX.uTexOn }, WM ? { tWM: { value: WM.tex }, uWM: { value: WM.rect } } : {});
    s.vertexShader = 'varying vec3 vWp;\n' + s.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = 'varying vec3 vWp;\nvec3 wEmis = vec3(0.0); uniform sampler2D tWN; uniform float uTexOn;\n' + (WM ? 'uniform sampler2D tWM; uniform vec4 uWM;\n' : '') + 'float riverX(float z) { return 1300.0 * sin(z * 0.00019 + 0.6) + 450.0 * sin(z * 0.00052 + 2.1) - 300.0; }\n' + GLSL_COMMON + s.fragmentShader
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
  float t = uTime; vec2 q = vWp.xz;
  vec2 gw = vec2(cos(q.x * 0.11 + t * 1.3) + 0.6 * cos(q.x * 0.27 + q.y * 0.19 + t * 1.9), sin(q.y * 0.13 + t * 1.1) + 0.6 * sin(q.y * 0.31 - q.x * 0.17 + t * 2.3));
  gw += (vec2(vns(q * 0.35 + t * 0.4), vns(q.yx * 0.35 - t * 0.4)) - 0.5) * 1.6;
  vec3 nW = normalize(vec3(gw.x * 0.05, 1.0, gw.y * 0.05)); ${SCAN && !WM ? 'nW = normalize(vec3(gw.x * 0.008, 1.0, gw.y * 0.008));' : ''}
  float wd = length(vWp - uCam), wpx = wd * uPx, rimD = ${WM ? '(texture2D(tWM, (vWp.xz - uWM.xy) / uWM.zw).r - 0.5) * 110.0' : `${(CITY.RIVER_W / 2).toFixed(1)} - abs(vWp.x - riverX(vWp.z))`}; // до берега, м (болото - по размытой маске воды)
  if (rimD < -1.5) discard; // полоса воды шире реки (закрыть урез) - за линией берега её нет: там, где земля ниже уровня, иначе вылезала голубым
  if (uTexOn > 0.5) { // рябь (three.js waternormals): два слоя навстречу по течению, вдали - спокойнее
    vec3 a = texture2D(tWN, q / 21.0 + vec2(0.012, 0.031) * t).rgb * 2.0 - 1.0, b = texture2D(tWN, q / 53.0 - vec2(0.021, 0.017) * t).rgb * 2.0 - 1.0;
    ${SCAN && !WM ? `vec2 q3 = mat2(0.82, 0.57, -0.57, 0.82) * q; vec3 c3 = texture2D(tWN, q3 / 127.0 + vec2(0.006, -0.004) * t).rgb * 2.0 - 1.0, d3 = texture2D(tWN, q3 / 8.3 + vec2(0.05, 0.02) * t).rgb * 2.0 - 1.0; a = a * 0.55 + c3 * 0.8; b = b * 0.6 + d3 * 0.35 * (1.0 - smoothstep(0.1, 0.6, wpx));` : ''}
    vec2 rp = (a.xy + b.xy) * (${SCAN && !WM ? '0.1 * (1.0 - smoothstep(0.5, 6.0, wpx)) + 0.018' : '0.22 * (1.0 - smoothstep(1.0, 12.0, wpx)) + 0.05'})${WM ? ' * 0.25' : ''}; // болото - стоячая вода, рябь слабая
    nW = normalize(nW + vec3(rp.x, 0.0, rp.y));
  }
  ${WM ? 'nW = normalize(vec3(nW.x * 0.2, 1.0, nW.z * 0.2)); // болото: без волн - гладь' : ''}
  normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
  vec3 Vw = normalize(uCam - vWp), Rf = reflect(-Vw, nW);
  float fres = 0.03 + 0.97 * pow(1.0 - max(dot(nW, Vw), 0.0), 5.0);
  float shallow = 1.0 - smoothstep(4.0, 45.0, rimD); // у берега - мельче: светлее, мутно-зелёная
  ${SCAN && !WM ? 'fres = 0.02 + 0.62 * pow(1.0 - max(dot(nW, Vw), 0.0), 5.0); diffuseColor.rgb = mix(vec3(0.005, 0.0115, 0.0125), vec3(0.0095, 0.017, 0.0145), vns(q * 0.004 + 3.0)); // глубина - тёмная серо-зелёная, крупными пятнами' : ''}
  wEmis = skyAt(Rf) * fres * 0.9 * (1.0 - 0.45 * shallow);${SCAN && !WM ? ' wEmis = mix(wEmis, vec3(dot(wEmis, vec3(0.3, 0.59, 0.11))), 0.35);' : ''} // у кромки отражение неба слабее (мелко, видно дно)
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.6, 1.9, 1.5) + vec3(0.01, 0.012, 0.006), shallow * 0.6);
  // у самой кромки (≈ 12 м) вода - цвета мокрого песка под ней, без отражения неба: никакой голубой каёмки у берега
  float edge = 1.0 - smoothstep(0.0, 12.0 + 6.0 * vns(q * 0.05), rimD);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.085, 0.075, 0.055), edge);
  wEmis *= 1.0 - edge;${WM ? `\n  wEmis *= 0.5; // торфяная вода болота - тёмная, отражает слабее
  float sc = smoothstep(0.5, 0.78, vns(q * 0.012) * 0.6 + vns(q * 0.07) * 0.4); // ряска и тина пятнами - матовые, без отражения
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.045, 0.055, 0.018), sc * 0.85); wEmis *= 1.0 - sc * 0.85;` : ''}`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += wEmis;');
  };
  // вода - только полосой вдоль реки: сплошная плоскость в 4-10 м под землёй «мерцала» с большой высоты (не хватало точности глубины)
  const wv = [], wi = [], half = CITY.RIVER_W / 2 + 45;
  for (let z = -CITY.HALF, i = 0; z <= CITY.HALF; z += 60, i++) {
    const x = riverX(z); wv.push(x - half, 0, z, x + half, 0, z);
    if (i) wi.push((i - 1) * 2, i * 2, (i - 1) * 2 + 1, (i - 1) * 2 + 1, i * 2, i * 2 + 1);
  }
  const wg = WM ? new THREE.PlaneGeometry(WM.rect.z, WM.rect.w, 8, 8).rotateX(-Math.PI / 2).translate(WM.rect.x + WM.rect.z / 2, 0, WM.rect.y + WM.rect.w / 2) : new THREE.BufferGeometry();
  if (!WM) { wg.setAttribute('position', new THREE.Float32BufferAttribute(wv, 3)); wg.setIndex(wi); wg.computeVertexNormals(); }
  const water = new THREE.Mesh(wg, wm);
  water.position.y = AUT ? city.autumn.WY : CITY.WATER_Y; water.receiveShadow = !!P.shadows; if (!WINT) scene.add(water); // зимой реки и озёра - лёд в земле

  // здания, надстройки и скатные крыши
  const B = city.B, list = [], small = [], roofs = [], extras = [], col = new THREE.Color(), near = Array.from({ length: 32 }, () => []);
  const pick = (kind, c) => { const pal = PAL[kind]; return col.set(pal[Math.floor(c * pal.length) % pal.length]).convertSRGBToLinear().multiplyScalar(0.62 + 0.2 * ((c * 7.31) % 1)).clone(); };
  for (let i = 0; i < B.n; i++) {
    const k = B.k[i], c = B.c[i], y0 = B.y0[i], gy = GH(B.x[i], B.z[i]), gb = RELIEF ? Math.min(gy, GH(B.x[i] - B.w[i] / 2, B.z[i] - B.d[i] / 2), GH(B.x[i] + B.w[i] / 2, B.z[i] - B.d[i] / 2), GH(B.x[i] - B.w[i] / 2, B.z[i] + B.d[i] / 2), GH(B.x[i] + B.w[i] / 2, B.z[i] + B.d[i] / 2)) : gy; // на склоне - цоколь до нижнего угла
    if (k === KIND.HOUSE && P.houseK < 1 && ((i * 2654435761) >>> 0) / 4294967296 > P.houseK) continue; // слабые пресеты: часть частных домов не рисуем
    const raised = y0 > 0, mdl = P.bldNear ? bldVariant(B, i) : 0;
    if (mdl) near[mdl].push(i);
    const ph = PH_ON && !raised && (k === KIND.HOUSE || mdl === 5) ? phPlace(B, i, mdl) : null; // свой дом частного сектора и сталинка: коробка дали - по его размеру и повороту
    if (ph && ph.st) { const wx = (ph.alongX ? ph.L : ph.D) - 0.8, wz = (ph.alongX ? ph.D : ph.L) - 0.8, he = ph.H * 0.82; list.push({ x: B.x[i], z: B.z[i], y: gb - 1, sx: wx, sy: he + 1 + gy - gb, sz: wz, color: pick(k, c), kind: k + c * 0.9, mdl }); roofs.push({ x: B.x[i], z: B.z[i], y: gy + he, sx: ph.L + 0.4, sy: ph.H - he, sz: ph.D + 0.4, ry: ph.alongX ? 0 : Math.PI / 2, color: pick(ROOF, (c * 13.7) % 1), kind: ROOF, mdl }); continue; } // сталинка: стены до карниза (на 0,4 м внутри модели - без мерцания, пока она грузится) + кровля, без надстроек
    if (ph) { const wx = ph.alongX ? ph.L : ph.D, wz = ph.alongX ? ph.D : ph.L, hw = ph.H * 0.55; small.push({ x: B.x[i], z: B.z[i], y: gb - 1, sx: wx, sy: hw + 1 + gy - gb, sz: wz, color: pick(k, c), kind: k + c * 0.9, mdl }); roofs.push({ x: B.x[i], z: B.z[i], y: gy + hw, sx: ph.L + 0.4, sy: ph.H - hw, sz: ph.D + 0.4, ry: ph.alongX ? 0 : Math.PI / 2, color: pick(ROOF, (c * 13.7) % 1), kind: ROOF, mdl }); continue; }
    const fq = FAC_ON && KIT_ON && !raised && mdl ? KIT_FAC.get(mdl) : null; // своя серия: коробка дали - высотой модели и с её фасадом (facade.js)
    let fac = 0, hB = B.h[i];
    if (fq) { const t = fq.ser.models.length > 1 ? (Math.imul(i, 2246822519) >>> 16) % fq.ser.models.length : 0; fac = fq.row + t + 1 + ((Math.imul(i, 2654435761) >>> 20) & 1 ? 0.5 : 0); hB = 1 + Math.max(2, Math.round((B.h[i] - 1.5) / fq.ser.FL)) * fq.ser.FL; }
    (k === KIND.HOUSE ? small : list).push({ x: B.x[i], z: B.z[i], y: raised ? gy + y0 : gb - 1, sx: B.w[i], sy: hB + (raised ? 0 : 1 + gy - gb), sz: B.d[i], color: pick(k, c), kind: k + c * 0.9 + (raised ? 10 : 0), mdl, fac });
    const top = gy + y0 + B.h[i];
    if (k === KIND.HOUSE) {
      const along = B.w[i] >= B.d[i], rh = roofH(c);
      roofs.push({ x: B.x[i], z: B.z[i], y: top, sx: (along ? B.w[i] : B.d[i]) + 0.8, sy: rh, sz: (along ? B.d[i] : B.w[i]) + 0.8, ry: along ? 0 : Math.PI / 2, color: pick(ROOF, (c * 13.7) % 1), kind: ROOF, mdl }); // крыша уходит вместе с домом
    } else if (P.roofDetail && !fac && B.h[i] > 12 && B.w[i] > 10 && B.d[i] > 10 && k !== KIND.WAREHOUSE) {
      const r = mulberry32(i * 7919 + 13), cnt = 1 + Math.floor(r() * (k === KIND.PANEL ? 2 : 4));
      for (let q = 0; q < cnt; q++) {
        const big = k === KIND.GLASS || k === KIND.OFFICE, sw = big ? 5 + r() * 9 : 3 + r() * 3, sd = big ? 5 + r() * 9 : 4 + r() * 4, sh2 = 2 + r() * (big ? 5 : 2);
        const mx = Math.max(0, B.w[i] / 2 - sw / 2 - 2), mz = Math.max(0, B.d[i] / 2 - sd / 2 - 2);
        extras.push({ x: B.x[i] + (r() * 2 - 1) * mx, z: B.z[i] + (r() * 2 - 1) * mz, y: top, sx: sw, sy: sh2, sz: sd, color: pick(ROOFX, r()), kind: ROOFX + r() * 0.9, mdl }); // надстройки уходят вместе с домом
      }
    }
  }
  const bMat = buildingMaterial(); if (WINT) snowify(bMat);
  G.tiles.push(...tiled(scene, list, boxGeo(), bMat, { ...sh, fac: true }));
  // частные дома (их больше половины) вдали - в пиксель-два, только рябят: дальность как у их крыш
  if (small.length) G.tiles.push(...tiled(scene, small, boxGeo(), bMat, { ...sh, fac: true }, 0.55));
  nearHouses(G, scene, B, near, P, sh);
  if (G.addNear && P.props !== false && !HILLS) streetProps(G, city, B, P);
  if (G.addNear && P.props !== false && AUT) autumnProps(G, city, P, GH); // «Туманная топь»: тыквы, кладбище, сено, сухостой, брошенные машины // «Детали улиц» можно выключить (тонкая настройка)
  if (roofs.length) G.tiles.push(...tiled(scene, roofs, roofGeo(), bMat, { ...sh, fac: true }, 0.55));
  if (extras.length) G.tiles.push(...tiled(scene, extras, boxGeo(), bMat, { cast: false, receive: P.shadows, fac: true }, 0.45));

  // объекты-цели
  // объекты-цели - каждый своей сеткой (разрушенный объект оседает и чернеет)
  const OCOL = { w_dam: 0xa8a8a2, w_radar: 0xd8dcdc, w_air: 0xa6a99c, w_cp: 0x8f9384, tv: 0x9a9c94, gov: 0x8f9384, tpp: 0x7d8270, oil: 0xc9c6b8, stad: 0x6f7563, air: 0xa6a99c, bridge: 0x8f8d88, port: 0xd08a2c }; // военные объекты - защитные и бетонные тона
  const objMat = new THREE.MeshPhongMaterial({ vertexColors: true, side: THREE.DoubleSide, specular: 0x222222, shininess: 20 }); if (WINT) snowify(objMat);
  G.objMesh = {}; G.objMat = objMat; G.ruinMat = new THREE.MeshPhongMaterial({ color: 0x1c1a18, specular: 0x050505, shininess: 4, side: THREE.DoubleSide });
  G.objBox = {}; G.objGroup = {}; G.objFar = {}; const FARC = {};
  // вышка аэродрома - моделью КДП (цилиндр из city.js остаётся только для LOS)
  const ATC = (o, p) => o.key === 'air' && p.t === 'cyl' && p.r === 6 && p.h === 30;
  for (const o of city.objects) if (o.key === 'air' && o.models && !o.models.some((q) => q.m === 'af_atc')) { const p = o.parts.find((q) => ATC(o, q)); if (p) o.models.push({ m: 'af_atc', x: p.x, z: p.z, rot: 0, s: 1 }); }
  for (const o of city.objects) {
  const br = o.bridge ? bridgeParts(o) : null, parts = br ? br.ramp : [], boxes = [];
  if (br) { const sm = new THREE.Mesh(mergeParts(br.span), objMat); sm.castShadow = sm.receiveShadow = !!P.shadows; scene.add(sm); (G.bridgeSpans = G.bridgeSpans || []).push({ o, mesh: sm, Yd: br.Yd, SPAN: br.SPAN, HW: br.HW }); }
  for (const p of o.bridge ? [] : o.parts) {
    // коробки готовых построек - временная заглушка, пока не загрузилась модель
    if (ATC(o, p)) continue;
    if (p.model) { const gy = GH(p.x, p.z) - 1; boxes.push(part(new THREE.BoxGeometry(p.w, p.h + 1, p.d), OCOL[o.key] || 0xbbbbbb, M(p.x, gy + (p.h + 1) / 2, p.z))); continue; }
    const y0 = (p.y0 !== undefined ? p.y0 : GH(p.x, p.z) - 1), color = OCOL[o.key] || 0xbbbbbb, hh = p.h + (p.y0 !== undefined ? 0 : 1);
    const L = o.site && !p.wall ? boxes : parts; // объект-сцена (city.js SITES): объёмы построек - только заглушка, пока не пришла модель; wall - стена игры за краями сцены ГЭС
    if (p.t === 'box') L.push(part(new THREE.BoxGeometry(p.w, hh, p.d), color, M(p.x, y0 + hh / 2, p.z)));
    else if (p.t === 'cyl') {
      const bands = p.h > 150 && p.r < 10 ? 8 : 1; // заводские трубы - красно-белые
      for (let b = 0; b < bands; b++) {
        const hb = p.h / bands, rb = p.r * (1 - 0.35 * (b / bands));
        L.push(part(new THREE.CylinderGeometry(rb * 0.97, rb, hb + 0.5, 16), bands > 1 ? (b % 2 ? 0xe9e9e4 : 0xc0392b) : color, M(p.x, y0 + hb * (b + 0.5), p.z)));
      }
    } else if (p.t === 'cone') { // градирня - гиперболоид
      const pts = []; for (let s = 0; s <= 10; s++) { const t = s / 10, r = p.r * (0.62 + 0.38 * Math.pow(Math.abs(t - 0.72) / 0.72, 2)); pts.push(new THREE.Vector2(r, t * p.h)); }
      L.push(part(new THREE.LatheGeometry(pts, 32), 0xcbc8c0, M(p.x, y0, p.z)));
    }
  }
  if (parts.length) { const objMesh = new THREE.Mesh(mergeParts(parts), objMat); objMesh.castShadow = objMesh.receiveShadow = !!P.shadows; scene.add(objMesh); G.objMesh[o.id] = objMesh; }
  if (boxes.length) { const b = new THREE.Mesh(mergeParts(boxes), objMat); b.castShadow = b.receiveShadow = !!P.shadows; scene.add(b); G.objBox[o.id] = b; }
  if (o.models || o.site) { const g = new THREE.Group(), M0 = (o.models || []).map((q) => q.m); g.userData.left = new Set([...M0, ...(o.site ? [o.site] : [])]); scene.add(g); G.objGroup[o.id] = g;
    const f = new THREE.Group(); f.visible = false; f.userData.left = new Set([...M0, ...(o.site ? [o.site + '_lo'] : [])]); scene.add(f); G.objFar[o.id] = f; } // вдали - упрощённые копии тех же построек (у сцены - своя дальняя, _lo)
  }
  // модель постройки загрузилась: копии во все места, где она стоит; все модели объекта на месте - заглушка прячется
  // объект-сцена (city.js SITES, prepare.js site_*): подробная - в objGroup, дальняя (_lo) - в objFar, в центре объекта; части
  // b_<постройка> и b_<постройка>_ruin - целая и разрушенная, deco_* - всегда; склеена по материалам (siteMerged), какая видна - маска
  // разрушений - индексом (siteMask: main.js siteLook); G.onSite - расставить вид построек по бою и копии моделей игры (SITES place)
  const attachSite = (name, make) => {
    const lo = name.endsWith('_lo'), key = lo ? name.slice(0, -3) : name;
    for (const o of city.objects) {
      const g = (lo ? G.objFar : G.objGroup)[o.id]; if (o.site !== key || !g || !g.userData.left.has(name)) continue;
      const m = siteInstance(siteMerged(name, key, make), !!P.shadows && !lo, !!P.shadows, G.winter, key); m.position.set(o.x, o.sy ?? GH(o.x, o.z), o.z); // sy - ноль сцены (ГЭС: низ плотины над руслом)
      if (!HILLS && GK < 1) m.traverse((q) => { for (const t of q.isMesh ? [].concat(q.material) : []) if (t.color && !t.userData.gk) { t.userData.gk = 1; t.color.multiplyScalar(0.72); } }); // сцены города - в тон земле (плиты и стены выгорали)
      g.add(m); freezeTree(m); g.userData.site = m;
      g.userData.left.delete(name);
      if (lo) g.userData.ready = !g.userData.left.size;
      if (G.onSite) G.onSite(o);
    }
  };
  G.attachObjModel = (name, make) => {
    if (name === 'br_seg') { attachBridgeSegs(G, scene, make(), P); return; }
    if (/^site_/.test(name)) { attachSite(name, make); return; }
    if (name === 'af_appr' || name === 'af_fuel') { attachAirfield(G, scene, name, make(), city, P); return; }
    for (const o of city.objects) {
      const g = G.objGroup[o.id]; if (!g || !g.userData.left.has(name)) continue;
      for (const q of o.models) if (q.m === name) {
        const m = make(); m.position.set(q.x, GH(q.x, q.z), q.z); m.rotation.y = q.rot * Math.PI / 2; m.scale.setScalar(q.s);
        m.traverse((c) => { if (c.isMesh) { c.castShadow = !!P.shadows && !c.userData.noSnow; c.receiveShadow = !!P.shadows; if (G.winter && !c.userData.noSnow) snowify(c.material); } }); g.add(m); freezeTree(m);
      }
      g.userData.left.delete(name);
      if (!g.userData.left.size && G.objBox[o.id]) G.objBox[o.id].visible = false;
    }
    // дальняя копия постройки (одна на модель): те же меши с сильно упрощённой сеткой - вместо коробки вдали (main.js objLod)
    const tmpl0 = make();
    (FARC[name] = FARC[name] || (async () => {
      const t = tmpl0, ms = []; t.traverse((c) => { if (c.isMesh) ms.push(c); });
      let tri = 0; for (const m of ms) tri += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
      const gs = await Promise.all(ms.map((m) => farGeo(m.geometry, tri >= 8000)));
      ms.forEach((m, i) => { m.geometry = farFlat(m, gs[i], m.geometry); m.castShadow = false; m.receiveShadow = !!P.shadows; }); // одним материалом (farFlat)
      return t;
    })()).then((t) => {
      for (const o of city.objects) {
        const f = G.objFar[o.id]; if (!f || !f.userData.left.has(name)) continue;
        for (const q of o.models) if (q.m === name) { const m = t.clone(); m.position.set(q.x, GH(q.x, q.z), q.z); m.rotation.y = q.rot * Math.PI / 2; m.scale.setScalar(q.s); f.add(m); freezeTree(m); }
        f.userData.left.delete(name); f.userData.ready = !f.userData.left.size;
        if (f.userData.ready && !f.userData.ruin && !o.site) { bakeGroup(f); freezeTree(f); } // все дальние копии на месте - одной сеткой на материал (было: 9 построек порта × детали - десятки вызовов отрисовки); ближние - не запекаем: видны редко, а копия - лишняя память
      }
    }).catch(() => { /* без дальней копии - коробка */ });
  };

  // деревья: вдоль улиц, в парках и во дворах
  if (P.trees > 0 && WINT) { // зимняя карта: ельник по району «лес» - импосторы ели и сосны, снег на ветвях
    const tl = winterTrees(city, P, mulberry32(city.seed * 7 + 3), GH), q = new THREE.PlaneGeometry(1, 1);
    // вблизи - 3D-модели (снег на лапах - snowify в attachBld), импосторы там прячутся; радиус больше городского - лес гуще
    if (TR2) for (const t of tl) { const h = trHash(t); if (t.v < 2 && h < 0.07) t.v = h < 0.045 ? 4 : 5; }
    if (TR2) for (const t of tl) t.sy = treeH('w', t, t.v < 2 ? 0.9 : 0.8, t.v < 2 ? 1.7 : 1.15) / 1.3;
    if (TR2 && G.addNear && P.treeNear) addTrees2(G, 'w', tl, Math.round(P.treeNear * 1.6), 1.3);
    else if (G.addNear && P.treeNear) {
      const per = TREES_W.map(() => []), m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), YY = new THREE.Vector3(0, 1, 0), pp = new THREE.Vector3(), ss = new THREE.Vector3();
      for (const t of tl) { per[t.v].push(t); t.mdl = TREES_W[t.v][0]; }
      TREES_W.forEach(([slot, name, h], v) => addTrees(G, 'w', slot, name, h, per[v], Math.round(P.treeNear * 1.6)));
    }
    const li = tl.map((t) => ({ x: t.x, z: t.z, y: t.y + 0.3, sx: 1.3 * t.sy, sy: 1.3 * t.sy, sz: 1.3 * t.sy, kind: t.v, color: t.color, ry: t.ry, mdl: t.mdl || 0 }));
    G.tiles.push(...tiled(scene, li, q, treeImpMat('winter', P.trees >= 14000, hemi, sunL, !!P.perf && P.perf.aa === 'msaa'), { cast: false, receive: false }, 0.8)); treeShadows(li, false, !(G.addNear && P.treeNear && CROWN));
  } else if (P.trees > 0 && AUT) { // осенняя карта: лес по району «лес» (склоны оврагов, холмы, кочки в болоте) - импосторы, листва перекрашена
    const tl = autumnTrees(city, P, mulberry32(city.seed * 7 + 3), GH), q = new THREE.PlaneGeometry(1, 1);
    if (TR2) { for (const t of tl) { const h = trHash(t); t.v = t.v === 2 ? 2 : h < 0.07 ? 6 : t.v === 0 ? (h < 0.35 ? 5 : h < 0.55 ? 3 : 0) : t.v === 1 ? (h < 0.4 ? 4 : 1) : h < 0.5 ? 4 : 1; } for (const t of tl) t.sy = treeH('a', t, 0.85, 1.45); if (G.addNear && P.treeNear) addTrees2(G, 'a', tl, P.treeNear, 1); }
    const li = tl.map((t) => ({ x: t.x, z: t.z, y: t.y + 0.3, sx: t.sy, sy: t.sy, sz: t.sy, kind: t.v, color: t.color, ry: t.ry, mdl: TR2 ? t.mdl || 0 : 0 }));
    G.tiles.push(...tiled(scene, li, q, treeImpMat('autumn', P.trees >= 14000, hemi, sunL, !!P.perf && P.perf.aa === 'msaa'), { cast: false, receive: false }, 0.8)); treeShadows(li, true, !(TR2 && G.addNear && P.treeNear && CROWN)); // осень: вблизи тоже импосторы - подставные тени и в ближней
  } else if (P.trees > 0) {
    const rnd = mulberry32(city.seed * 7 + 3), tl = [], tc = new THREE.Color();
    const tree = (x, z, s) => {
      tc.setHSL(0.2 + rnd() * 0.09, 0.38 + rnd() * 0.22, 0.17 + rnd() * 0.1).convertSRGBToLinear();
      tl.push({ x, z, y: GH(x, z) - 0.3, sx: s, sy: s * (1.1 + rnd() * 0.5), sz: s, color: tc.clone(), ry: rnd() * 6 });
    };
    // вдоль улиц жилых районов: ряд у тротуара, шаг ~14 м, с пропусками
    const G2 = CITY.GRID, streetN = Math.floor(P.trees * 0.45);
    for (let t = 0; t < streetN * 3 && tl.length < streetN; t++) {
      const alongX = rnd() < 0.5, i = Math.round((rnd() * 2 - 1) * CITY.R * 0.8 / G2), side = rnd() < 0.5 ? -1 : 1;
      const hw = (((i % 5) + 5) % 5 === 0 ? CITY.AVENUE : CITY.STREET) / 2 + 6.5; // на газоне за тротуаром (тротуар в шейдере - до 4,5 м от края дороги; Mark 2026-11-17: «дерево растёт на тротуаре»)
      const along = (rnd() * 2 - 1) * CITY.R * 0.8, across = i * G2 + side * hw;
      const x = alongX ? along : across, z = alongX ? across : along;
      const zn = ZA(x, z);
      if (zn !== ZONE.MID && zn !== ZONE.LOW && zn !== ZONE.CBD) continue;
      for (let s = 0; s < 6 && tl.length < streetN; s++) {
        const a2 = along + s * 14, x2 = alongX ? a2 : across, z2 = alongX ? across : a2;
        const m2 = ((a2 % G2) + G2) % G2; if (m2 < 30 || m2 > G2 - 30 || city.bldAt(x2, z2) > 0 || !city.onRoad(alongX ? x2 : i * G2, alongX ? i * G2 : z2)) break; // ряд - только вдоль существующей улицы
        if (rnd() < 0.85) { tree(x2, z2, 5 + rnd() * 3); tl[tl.length - 1].st = 1; }
      }
    }
    // парки и дворы
    let tries = 0;
    while (tl.length < P.trees && tries++ < P.trees * 14) {
      const x = (rnd() * 2 - 1) * (CITY.R + 1500), z = (rnd() * 2 - 1) * (CITY.R + 1500), zn = ZA(x, z);
      const ok = zn === ZONE.PARK || (zn === ZONE.LOW && rnd() < 0.3) || (zn === ZONE.MID && rnd() < 0.15) || (zn === ZONE.FIELD && rnd() < 0.04);
      if (!ok || city.bldAt(x, z) > 0 || city.onRoad(x, z, 4)) continue; // не на дороге и не на обочине
      const gx = Math.abs(x - Math.round(x / G2) * G2), gz = Math.abs(z - Math.round(z / G2) * G2);
      if (zn !== ZONE.PARK && zn !== ZONE.FIELD && (gx < 20 || gz < 20)) continue;
      tree(x, z, 6 + rnd() * 6);
    }
    if (RELIEF) { // рельеф: крутые склоны (обрыв берега, стенки оврагов) - густой лес; своя случайность, остальной город не сдвигается
      const rs = mulberry32(city.seed * 97 + 3), want = tl.length + Math.round(P.trees * 0.55); let t2 = 0; // доля пресета: на «Низком» деревьев мало и тут
      while (tl.length < want && t2++ < want * 40) { // куртинами: точка на склоне - и вокруг неё 4-9 деревьев
        const x = (rs() * 2 - 1) * (CITY.R + 500), z = (rs() * 2 - 1) * (CITY.R + 500), sl = slopeAt(x, z);
        if (sl < 0.15) continue; // только настоящие кручи и стенки оврагов (пологие холмы - как город)
        for (let k = 0, m = 6 + Math.floor(rs() * 8); k < m && tl.length < want; k++) {
          const tx = x + (rs() - 0.5) * 30, tz = z + (rs() - 0.5) * 30;
          if (slopeAt(tx, tz) < 0.1 || city.bldAt(tx, tz) > 0 || city.onRoad(tx, tz, 4) || Math.abs(tx - riverX(tz)) < CITY.RIVER_W / 2 + 15) continue;
          tree(tx, tz, 7 + rs() * 8);
        }
      }
    }
    if (SCAN) { // леса - массивами с опушкой, рощи в полях, посадки вдоль трасс, деревья дворов гнёздами: с высоты зоны связаны зеленью, границ не видно
      const rs = mulberry32(city.seed * 131 + 9), H2 = CITY.R + 4500, SZ = 26, want = P.trees * (P.trees >= 14000 ? 6 : 3), gn = (x, z, S) => gcNoise(x, z, S), L = [];
      for (let z = -H2; z < H2; z += SZ) for (let x = -H2; x < H2; x += SZ) {
        const tx = x + rs() * SZ, tz = z + rs() * SZ, r = rs(), zn = ZA(tx, tz); if (zn === ZONE.WATER || zn === ZONE.AIR || zn === ZONE.PORT || zn === ZONE.CBD) continue;
        const n = gn(tx, tz, 170) * 0.6 + gn(tx + 900, tz - 300, 47) * 0.4, hw = zn === ZONE.FIELD && city.onRoad(tx, tz, 26);
        const p = zn === ZONE.PARK ? THREE.MathUtils.smoothstep(n, 0.28, 0.5) * 0.95 : zn === ZONE.FIELD ? (hw ? 0.6 * THREE.MathUtils.smoothstep(gn(tx, tz, 260), 0.35, 0.5) : 0.6 * THREE.MathUtils.smoothstep(gn(tx, tz, 640) * 0.65 + n * 0.35, 0.64, 0.74) + 0.008)
          : zn === ZONE.LOW ? 0.62 * THREE.MathUtils.smoothstep(n, 0.25, 0.55) : zn === ZONE.MID ? 0.75 * THREE.MathUtils.smoothstep(n, 0.28, 0.55) : 0.08 * THREE.MathUtils.smoothstep(n, 0.5, 0.7);
        if (r < p) L.push([tx, tz, zn, rs()]);
      }
      const k = Math.min(1, want / L.length);
      for (const [tx, tz, zn, q] of L) { if (q > (zn === ZONE.MID || zn === ZONE.LOW ? Math.min(1, k * 1.6) : k) || city.bldAt(tx, tz) > 0 || city.onRoad(tx, tz, zn === ZONE.FIELD ? 5 : 8) || GH(tx, tz) < CITY.WATER_Y + 1 || city.objects.some((o) => Math.abs(tx - o.x - (o.rx || 0)) < o.w / 2 + 14 && Math.abs(tz - o.z - (o.rz || 0)) < o.d / 2 + 14)) continue; tree(tx, tz, zn === ZONE.PARK || zn === ZONE.FIELD ? 6.5 + rs() * 6 : 5 + rs() * 4); }
    }
    const tMat = new THREE.MeshPhongMaterial({ vertexColors: true, specular: 0x000000, shininess: 4 });
    // вид дерева (дуб, липа, сосна, куст) - для ближних моделей и импосторов одинаковый
    const rr = mulberry32(city.seed * 13 + 5);
    for (const t of tl) { const r = rr(); t.v = r < 0.35 ? 0 : r < 0.7 ? 1 : r < 0.9 ? 2 : 3; }
    if (TR2) tl.forEach((t, i) => { const h = trHash(t), pk = ZA(t.x, t.z), gr = gcNoise(t.x, t.z, 120); // улица - узкие кроны (липа, берёза, тополь), парк - гнёздами пород, склон - берёза, клён, сосна
      t.v = t.st ? (h < 0.36 ? 1 : h < 0.58 ? 4 : h < 0.76 ? 6 : h < 0.9 ? 5 : 0) : pk === ZONE.PARK ? (gr < 0.35 ? (h < 0.5 ? 2 : h < 0.75 ? 7 : 4) : gr < 0.6 ? (h < 0.45 ? 4 : h < 0.7 ? 5 : h < 0.9 ? 0 : 3) : h < 0.4 ? 0 : h < 0.7 ? 1 : h < 0.85 ? 5 : 3) : pk === ZONE.FIELD ? (h < 0.35 ? 6 : h < 0.6 ? 4 : h < 0.8 ? 0 : 3) : h < 0.28 ? 1 : h < 0.48 ? 4 : h < 0.64 ? 5 : h < 0.74 ? 0 : h < 0.84 ? 7 : h < 0.92 ? 2 : 3; });
    // вблизи - готовые деревья (процедурные там прячутся): вид по случайному, высота - как у процедурного (крона ~1,3 высоты)
    if (TR2) for (const t of tl) t.sy = (t.v === 3 ? treeH('c', t, 0.4, 0.75) : treeH('c', t, t.st ? 0.7 : 0.85, t.st ? 1.05 : 1.4)) / 1.3;
    if (TR2 && G.addNear && P.treeNear) addTrees2(G, 'c', tl, P.treeNear, 1.3);
    else if (G.addNear && P.treeNear) {
      const per = TREES.map(() => []);
      for (const t of tl) { per[t.v].push(t); t.mdl = TREES[t.v][0]; }
      const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), YY = new THREE.Vector3(0, 1, 0), pp = new THREE.Vector3(), ss = new THREE.Vector3();
      TREES.forEach(([slot, name, h], v) => addTrees(G, 't', slot, name, h, per[v], P.treeNear));
      tMat.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, { uHide: ENV.uHide, uMdl: ENV.uMdl }); sh.vertexShader = HIDE_HEAD + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n' + HIDE_BODY); };
    }
    // вдали - импосторы тех же деревьев (без ?treeimp=0); иначе - прежние простые кроны
    if (!(typeof location !== "undefined" && /[?&]treeimp=0/.test(location.search))) {
      const q = new THREE.PlaneGeometry(1, 1), li = tl.map((t) => ({ ...t, y: t.y + 0.3, sx: 1.3 * t.sy, sy: 1.3 * t.sy, sz: 1.3 * t.sy, kind: t.v })); // масштаб - высота дерева
      G.tiles.push(...tiled(scene, li, q, treeImpMat('city', P.trees >= 14000, hemi, sunL, !!P.perf && P.perf.aa === 'msaa'), { cast: false, receive: false }, 0.6));
      { const bo = !(G.addNear && P.treeNear && CROWN); const cone = (t) => t.kind === 2 || (TR2 && t.kind >= 6); treeShadows(li.filter((t) => !cone(t)), true, bo); treeShadows(li.filter(cone), false, bo); }
    } else G.tiles.push(...tiled(scene, tl, treeGeo(), tMat, { cast: P.shadows && P.treeShadows, receive: false, lo: treeGeoLo(), loD: P.treeLoD || 2600 }, 0.6)); // на сенсорных - простая крона ближе (P.treeLoD)
  }

  if (W.snow) G.snow = makeSnowfall(scene, Math.round((P.particles || 3000) * 2), W); // снегопад (зимняя погода «Снегопад»)
  if (P.clouds > 0 && !W.rain && !(P.skyOnly && W.hdri)) G.clouds = buildClouds(scene, Math.round(P.clouds * (W.deck ? 1.8 : 1)), city.seed, W, P.clouds >= 500, SU);
  // неподвижное - без пересчёта матриц (постройки целей, приходящие позже, - freezeTree при добавлении)
  for (const m of G.tiles) freezeTree(m);
  for (const k of ['objGroup', 'objFar', 'objMesh', 'objBox']) for (const id in G[k] || {}) freezeTree(G[k][id]);
  freezeTree(G.ground);
  return G;
}

// раз в кадр: небо и тень - за камерой, плитки дальше дальности прорисовки скрыты (высокие здания видно дальше)
const SX = new THREE.Vector3(), SY = new THREE.Vector3(), SN = new THREE.Vector3();
const CAM1 = [null], CAM2 = [null, null];
// extra - вторая камера с той же сценой (контейнер): модели вблизи нужны и в её поле зрения
export function updateCityScene(G, camera, P, focus, t, extra) {
  G.sky.position.copy(camera.position); ENV.uCam.value.copy(camera.position); { const h = ENV.uHide.value, d = h.distanceTo(camera.position); if (d > 4) h.lerp(camera.position, d > 60 ? 1 : 1 - 4 / d); } /* центр смены моделей тянется за камерой с запасом 4 м: качание камеры на границе не мигает домом (модели и коробки - по одной точке) */ ENV.uTime.value = t || 0; tickAir(t || 0); tickBlast(t || 0);
  if (G.bake) G.bake.update(camera);
  if (G.lowL) G.lowL(); // осень: туман низин - по свету сцены
  if (G.snow) G.snow.update(camera, t || 0, G.renderer ? G.renderer.domElement.height : 720);
  if (G.lodTicks) for (const f of G.lodTicks) f(camera); // мосты и огни подхода: вдали - простое или ничего
  if (G.ofTick) G.ofTick(camera); // офисы и стекло: какие здания - настоящими шагами (до отбора наборов: плоскости этих зданий выключены в том же кадре)
  if (G.near) { camera.updateMatrixWorld(); const cs = extra ? CAM2 : CAM1; cs[0] = camera; if (extra) cs[1] = extra; G.near(camera, cs); }
  if (G.kitTick) G.kitTick(camera); // свои дома: руины
  const cx = camera.position.x, cz = camera.position.z, D = P.draw + TILE;
  for (const m of G.tiles) {
    const u = m.userData, d = Math.hypot(u.cx - cx, u.cz - cz);
    m.visible = d < D * u.drawK * (u.maxH > 120 ? 1.6 : 1);
    if (u.gLo) m.geometry = d < u.loD ? u.gHi : u.gLo;
  }
  if (G.sun.castShadow && focus) {
    if (G.ns) G.ns.f.copy(focus);
    // теневая камера двигается шагами ровно в пиксель карты теней - края теней не «кипят» в полёте
    const s = G.sunDir; SY.set(0, 1, 0).sub(SN.copy(s).multiplyScalar(s.y)).normalize(); SX.crossVectors(SY, s).normalize();
    const a = Math.round(focus.dot(SX) / G.shTexel) * G.shTexel, b = Math.round(focus.dot(SY) / G.shTexel) * G.shTexel, c = focus.dot(s);
    SN.copy(SX).multiplyScalar(a).addScaledVector(SY, b).addScaledVector(s, c);
    G.sun.target.position.copy(SN); G.sun.position.copy(SN).addScaledVector(s, 5000);
  }
}
