// Готовые модели (glb, подготовленные tools/airdef-models/prepare.js: метры, нос в −Z, позиции / нормали / UV,
// текстуры цвета в JPEG). Загружаются в фоне при старте; пока не загрузились (или если загрузка не удалась) — в игре
// процедурные модели из units-render.js. Материалы — Phong, как у остальной техники (освещение и туман игры).
// Для каждой модели: сторона и класс (strike — ударные загрузки с бомбами, fighter — ракетные), точки подвески
// (как у процедурных: L3 L2 L1 Ф1 Ф2 R1 R2 R3; py — высота дорисованного пилона, если у модели его нет), сопла и место
// контейнера. Авторы и лицензии — MODEL_CREDITS (показываются в «Настройках»).
/* global THREE */
import { CREDITS } from './models/credits.js?v=20261022e';
const V = (x, y, z, py = 0) => Object.assign(new THREE.Vector3(x, y, z), { py });
const mirror = (L) => [...L, ...L.slice().reverse().map((p) => V(-p.x, p.y, p.z, p.py))]; // L3 L2 L1 Ф1 → … Ф2 R1 R2 R3
const META = {
  // [PBR] Sukhoi Su-30 — Immersive3D: восток, ударные загрузки
  su30: { side: 'east', cls: 'strike', stations: mirror([V(-6.27, -0.34, 4.9), V(-4.67, -0.35, 3.3), V(-3.39, -0.44, 2.6), V(-1.76, -0.65, 3.9)]),
    nozzles: [V(-1.14, -0.42, 9.4), V(1.14, -0.42, 9.4)], nr: 0.55, pod: V(0, -1.25, 1.5) },
  // MiG 29 — Usman Zia: восток, ракетные загрузки
  mig29: { side: 'east', cls: 'fighter', stations: mirror([V(-4.06, -1.25, 3.41), V(-3.17, -1.24, 2.68), V(-2.23, -1.21, 1.96), V(-0.45, -1.4, 2.0, 0.26)]),
    nozzles: [V(-0.97, -1.35, 7.6), V(0.97, -1.35, 7.6)], nr: 0.45, pod: V(0, -1.55, 2.0) },
  // Boeing F/A-18E/F Super Hornet — andertan: запад, ударные загрузки (на концах крыльев — свои «Сайдуайндеры»)
  f18: { side: 'west', cls: 'strike', stations: mirror([V(-4.70, -1.43, 2.04), V(-3.72, -1.44, 1.87), V(-2.6, -1.24, 1.9, 0.4), V(-1.48, -1.05, -0.3, 0.22)]),
    nozzles: [V(-0.49, -0.94, 8.2), V(0.49, -0.94, 8.2)], nr: 0.45, pod: V(0, -1.96, 1.0) },
  // General Dynamics F-16D Block 60 — Muhamad Mirza Arrafi: запад, ракетные загрузки
  // (на законцовках крыльев — свои AIM-120, пилоны под крылом дорисованы)
  f16: { side: 'west', cls: 'fighter', stations: mirror([V(-3.9, -1.34, 2.4, 0.36), V(-3.0, -1.38, 2.2, 0.38), V(-2.15, -1.39, 2.0, 0.38), V(-0.75, -1.6, 1.0, 0.22)]),
    nozzles: [V(0, -0.9, 6.5)], nr: 0.55, pod: V(0.75, -1.62, -0.5) },
  // ── свой самолёт у каждой подвески (2026-10-12); lazy — грузится, когда нужен (выбран в подвеске или летит в налёте),
  // pod: null — прицельная система встроенная (контейнер не вешается); internal — оружие во внутренних отсеках (не видно до пуска)
  e_su24: { side: 'east', cls: 'strike', lazy: true, stations: mirror([V(-4.8, -1.39, 2.19), V(-2.1, -1.23, 0.8), V(-0.49, -2.48, 3.21), V(-0.35, -2.48, -0.4)]),
    nozzles: [V(-0.68, -1.28, 10.1), V(0.68, -1.28, 10.1)], nr: 0.32, pod: null }, // Су-24М — 42manako («Кайра» встроена)
  e_su25: { side: 'east', cls: 'strike', lazy: true, stations: mirror([V(-4.37, -1.11, 0.67), V(-3.59, -1.09, 0.4), V(-2.81, -1.09, 0.2), V(-2.03, -1.07, -0.04)]),
    nozzles: [V(-0.88, -1.4, 3.85), V(0.88, -1.4, 3.85)], nr: 0.2, pod: null }, // Су-25 — Immersive3D («Шквал» у Су-25Т встроен)
  e_su34: { side: 'east', cls: 'strike', lazy: true, stations: mirror([V(-6.21, -1.51, 4.94), V(-4.63, -1.5, 3.8), V(-3.55, -1.72, 3.21), V(-1.33, -2.42, 2.5)]),
    nozzles: [V(-1.18, -1.5, 9.4), V(1.18, -1.5, 9.4)], nr: 0.22, pod: null }, // Су-34 (Су-32ФН) — 42manako («Платан» встроен)
  e_su17: { side: 'east', cls: 'strike', lazy: true, stations: mirror([V(-2.56, -1.33, 2.63), V(-1.72, -1.41, 0.51), V(-1.25, -1.68, -1.4), V(-0.37, -2.07, -0.25)]),
    nozzles: [V(0, -1.02, 8.21)], nr: 0.3, pod: V(0, -2.3, 1.8) }, // Су-17М4 — manilov.ap
  e_su57: { side: 'east', cls: 'fighter', lazy: true, internal: true, stations: mirror([V(-1.9, -0.95, 1.5), V(-1.6, -1.0, 0.0), V(-0.35, -1.2, 0.5), V(-0.3, -1.2, 2.6)]),
    nozzles: [V(-1.37, -0.66, 8.25), V(1.37, -0.66, 8.25)], nr: 0.23, pod: null }, // Су-57
  e_mig31: { side: 'east', cls: 'fighter', lazy: true, stations: mirror([V(-5.6, -0.95, 5.4, 0.3), V(-4.62, -1.24, 4.4), V(-1.55, -1.55, 7.5), V(-1.19, -1.92, -1.5)]),
    nozzles: [V(-0.78, -1.09, 11.1), V(0.78, -1.09, 11.1)], nr: 0.37, pod: null }, // МиГ-31БМ
  e_tu22m3: { side: 'east', cls: 'heavy', lazy: true, stations: mirror([V(-11, -3.35, 7.6, 0.35), V(-8, -3.4, 6.8, 0.35), V(-5.07, -3.79, 5.15), V(-1.83, -3.53, 3.58)]),
    nozzles: [V(-0.93, -2.17, 19.05), V(0.93, -2.17, 19.05)], nr: 0.35, pod: null }, // Ту-22М3 — только в налётах ИИ
  e_f4: { side: 'west', cls: 'fighter', lazy: true, stations: mirror([V(-3.7, -1.78, 1.69), V(-2.29, -2.46, -0.5), V(-1.26, -1.46, -0.6), V(-1.26, -1.46, 2.4)]),
    nozzles: [V(-0.72, -0.99, 3.45), V(0.72, -0.99, 3.45)], nr: 0.25, pod: V(0, -1.55, 1.0) }, // F-4 Phantom II — andertan («Пэйв Тэк» под фюзеляжем)
  e_gripen: { side: 'west', cls: 'strike', lazy: true, stations: mirror([V(-4.18, -1.06, 3.77), V(-2.92, -1.4, 3.03), V(-1.95, -1.41, 1.77), V(-0.45, -1.62, 0.2, 0.1)]),
    nozzles: [V(0, -0.94, 7.3)], nr: 0.24, pod: V(0.75, -1.5, -1.6) }, // JAS 39 Gripen (LITENING на подфюзеляжной точке)
  e_f22: { side: 'west', cls: 'strike', lazy: true, internal: true, stations: mirror([V(-1.3, -1.3, -1.5), V(-0.75, -1.7, 0.2), V(-0.45, -1.75, 1.0), V(-0.2, -1.8, 2.2)]),
    nozzles: [V(-0.75, -0.98, 7.33), V(0.75, -0.98, 7.33)], nr: 0.25, pod: null }, // F-22A: JDAM и SDB во внутренних отсеках, наведение по GPS
  e_f35: { side: 'west', cls: 'strike', lazy: true, internal: true, stations: mirror([V(-0.9, -1.3, 2.4), V(-0.85, -1.3, 0.4), V(-0.65, -1.35, 1.0), V(-0.45, -1.4, 1.8)]),
    nozzles: [V(0, -0.55, 6.5)], nr: 0.24, pod: null }, // F-35A (EOTS встроена)
  // ── «Мульти-волна» (2026-10-13): грузится по требованию (lazy) — wantModel / anyModel
  w_tomahawk: { weapon: 'tomahawk', lazy: true, stations: [] }, // BGM-109 Tomahawk — Pan_Ar4ik
  w_kh555: { weapon: ['kh555', 'kh55', 'kh55d'], lazy: true, stations: [] }, // Х-555 (и вид Х-55) — Jeyhun1985
  w_kalibr: { weapon: 'kalibr', lazy: true, stations: [] }, // «Калибр» — mmickel
  w_agm86: { weapon: 'agm86', lazy: true, stations: [] }, // AGM-86 ALCM — mahmadsaleem11111
  w_storm: { weapon: 'storm', lazy: true, stations: [] }, // Storm Shadow — с Су-24 42manako
  w_atacms: { weapon: 'atacms', lazy: true, stations: [] }, // ракета M142 HIMARS — Denis.Cherkasov1
  d_shahed: { ev: true, lazy: true, stations: [] }, // «Шахед-136» — faintastic (винт — группа prop)
  d_uav: { ev: true, lazy: true, stations: [] }, // БПЛА — Artem Goyko (винты — prop, prop2)
  e_tu160: { side: 'east', cls: 'carrier', only: true, lazy: true, internal: true, stations: [], nozzles: [V(-5.75, -4.31, 11.1), V(-3.97, -4.31, 11.1), V(3.97, -4.31, 11.1), V(5.75, -4.31, 11.1)], nr: 0.62 }, // Ту-160 — KOG_THORNS; носитель «Мульти-волны»
  e_b1b: { side: 'west', cls: 'carrier', only: true, lazy: true, internal: true, stations: [], nozzles: [V(-4.3, -3.1, 11.5), V(-2.95, -3.1, 11.5), V(2.95, -3.1, 11.5), V(4.3, -3.1, 11.5)], nr: 0.5 }, // B-1B — Muhamad Mirza Arrafi; носитель «Мульти-волны»
  e_b52: { side: 'west', cls: 'carrier', only: true, lazy: true, internal: true, stations: [], nozzles: [], nr: 0.4 }, // B-52H — bohmerang; носитель «Мульти-волны» (без форсажа — пламени нет)
  e_typhoon: { side: 'west', cls: 'carrier', only: true, lazy: true, internal: true, stations: [], nozzles: [V(-0.54, -0.63, 8.6), V(0.54, -0.63, 8.6)], nr: 0.38 }, // Eurofighter Typhoon — andertan; носитель Storm Shadow
  w_tbmdec: { lazy: true, stations: [] }, // ложная цель «Искандера» — головная часть его ракеты
  w_kinzhal: { weapon: 'kinzhal', lazy: true, stations: [] }, // «Кинжал» — ракета 9М723 с пусковой «Искандера» (42manako), 7,2 м, светло-серая
  w_slam: { weapon: 'slam', lazy: true, stations: [] }, // AGM-84E SLAM — по UGM-84 Harpoon (FeriseCAT)
  w_jsow: { weapon: 'jsow', lazy: true, wings: 'deploy', stations: [] }, // AGM-154 JSOW — набор NETRUNNER_pl
  l_iskander: { ev: true, lazy: true, matte: true, stations: [] }, // 9П78 «Искандер» — 42manako (ракеты на старте — tbm, tbm2)
  l_tochka: { ev: true, lazy: true, matte: true, stations: [] }, // 9П129 «Точка-У» — 42manako (tbm)
  l_scud: { ev: true, lazy: true, matte: true, stations: [] }, // Р-17 на МАЗ-543 — AlexDang (tbm)
  l_himars: { ev: true, lazy: true, matte: true, stations: [] }, // M142 HIMARS — Denis.Cherkasov1
  // оружие, взятое с моделей самолётов: на пилоне и в полёте вместо процедурного
  w_gbu12: { weapon: 'gbu12', stations: [] }, // GBU-12 Paveway II с F-16D
  w_fab500: { weapon: 'fab500', stations: [] }, // ФАБ-500М-62 — Jeyhun1985 (модель с УМПК, комплект снят)
  w_umpk: { weapon: 'umpk', wings: 'fold', stations: [] }, // ФАБ-500 с УМПК — Jeyhun1985
  w_kh29t: { weapon: 'kh29t', stations: [] }, // Х-29 — Russian weapon pack, Rhine_Lab_Muelsyse
  w_kh31p: { weapon: 'kh31p', stations: [] },
  w_kh59m: { weapon: 'kh59m', lazy: true, stations: [] }, // Х-59М — из «Su-30MK2 with Kh-59M», Jeyhun1985 // Х-31 — Russian weapon pack
  w_kh25ml: { weapon: 'kh25ml', stations: [] }, // Х-38МТ — Jeyhun1985 (вместо Х-25МЛ: та же схема)
  w_agm65b: { weapon: 'agm65b', stations: [] }, // AGM-65 — набор NETRUNNER_pl
  w_mk82: { weapon: 'mk82', stations: [] }, // Mk 83 → размер Mk 82 — набор NETRUNNER_pl
  w_jassm: { weapon: 'jassm', stations: [] }, // AGM-158 JASSM
  w_agm88: { weapon: ['agm88', 'aargm'], stations: [] }, // AGM-88 HARM (с тележки) — и для AARGM
  w_mald: { weapon: ['mald', 'quail'], stations: [] }, // ADM-160 MALD («AIM-160A Screamer»)
  w_decoy_e: { weapon: 'decoy_e', stations: [] }, // Harpy — ложная цель
  w_gbu39: { weapon: ['gbu39', 'sdb'], wings: 'fold', stations: [] }, // GBU-39 SDB (и для «Мульти-волны»)
  w_gbu31: { weapon: 'gbu31', stations: [] }, // Mk 84 с хвостом (GBU-24 с F-111 без головки) — как JDAM
  w_pod: { pod: true, stations: [] }, // AN/AAQ-28 LITENING — прицельный контейнер
  // постройки военных объектов (целей) — расставляются по OBJ_DIMS из city.js
  obj_tanks: { obj: true, stations: [] }, obj_tank4: { obj: true, stations: [] }, obj_rtank: { obj: true, stations: [] }, obj_hangar: { obj: true, stations: [] },
  bld_p5: { bld: true, stations: [] }, bld_p9: { bld: true, stations: [] }, bld_b12: { bld: true, stations: [] }, bld_st: { bld: true, stations: [] },
  h_brick: { bld: true, stations: [] }, h_house: { bld: true, stations: [] }, h_log: { bld: true, stations: [] }, h_khata: { bld: true, stations: [] }, o_block: { bld: true, stations: [] }, h_shanty: { bld: true, stations: [] }, h_mobile: { bld: true, stations: [] }, // дома города
  bld_t9: { bld: true, stations: [] }, bld_a16: { bld: true, stations: [] }, o_tall: { bld: true, stations: [] }, g_amel: { bld: true, stations: [] }, g_fortune: { bld: true, stations: [] }, // башни и корпуса
  tr_oak: { bld: true, stations: [] }, tr_lime: { bld: true, stations: [] }, tr_pine: { bld: true, stations: [] }, tr_bush: { bld: true, stations: [] }, p_lamp: { bld: true, stations: [] },
  w_fir1: { bld: true, stations: [] }, w_fir3: { bld: true, stations: [] }, w_pine1: { bld: true, stations: [] }, w_pine2: { bld: true, stations: [] }, // зимний лес вблизи // деревья и фонари вблизи
  pr_vend: { bld: true, stations: [] }, pr_vend2: { bld: true, stations: [] }, pr_booth: { bld: true, stations: [] }, pr_bin: { bld: true, stations: [] }, pr_wbins: { bld: true, stations: [] }, // уличные мелочи
  pr_bstop: { bld: true, stations: [] }, pr_rstop: { bld: true, stations: [] }, sg_main: { bld: true, stations: [] }, sg_yield: { bld: true, stations: [] }, // остановки и знаки
  v_barn: { bld: true, stations: [] }, v_wtower: { bld: true, stations: [] }, v_combine: { bld: true, stations: [] }, v_tractor: { bld: true, stations: [] }, v_picket: { bld: true, stations: [] }, m_5g: { bld: true, stations: [] }, // село
  br_seg: { obj: true, stations: [] }, // пролёт моста — VectorMan (city-render.js attachBridgeSegs)
  af_atc: { obj: true, stations: [] }, af_fuel: { obj: true, stations: [] }, af_appr: { obj: true, stations: [] }, // аэродром: вышка КДП, топливозаправщики, огни приближения (city-render.js attachAirfield)
    obj_jhangar: { obj: true, stations: [] }, obj_cont: { obj: true, stations: [] }, obj_milbase: { obj: true, stations: [] }, obj_oldind: { obj: true, stations: [] }, obj_factory: { obj: true, stations: [] }, // цех — и цель, и склады города вблизи
  // зенитные ракеты без своих пусковых: ракета «Вербы» — для всех ПЗРК и Avenger, AIM-120 (с F/A-18) — для NASAMS
  msl_manpads: { samMissile: ['strela2', 'redeye', 'igla', 'stinger', 'iglas', 'verba', 'avenger'], stations: [] },
  msl_aim120: { samMissile: ['nasams'], stations: [] },
  // трубы ПЗРК на плече у расчёта
  mp_verba: { launcher: ['strela2', 'igla', 'iglas', 'verba'], stations: [] },
  mp_stinger: { launcher: ['redeye', 'stinger'], stations: [] },
  // зенитные комплексы: корпус / башня / пакет (оси — LNCH в launchers.js, их печатает prepare.js)
  bukm3: { units: ['bukm3'], stations: [] }, // «Бук-М3» — Jeyhun1985
  // комплексы с ракетами на направляющих: ракета модели — в слотах и в полёте (у С-75 и С-125 — с отделяемым ускорителем)
  s75: { units: ['s75'], stations: [] }, // С-75 «Двина» — manyakasia
  s125: { units: ['s125'], stations: [] }, // С-125 «Нева» — teanid
  kub: { units: ['kub'], stations: [] }, // 2К12 «Куб» — UltraKill
  hawk: { units: ['hawk'], stations: [] }, // MIM-23 Hawk — Dominik Biały
  m163: { units: ['m163'], stations: [] }, // M163 VADS — 42manako
  gepard: { units: ['gepard'], stations: [] },
  roland: { units: ['roland'], stations: [] },
  tunguska: { units: ['tunguska'], stations: [] },
  skyguard: { units: ['skyguard'], stations: [] },
  rapier: { units: ['rapier'], stations: [] }, // Tracked Rapier — stealth86 (перекрашен, пусковая развёрнута в рабочее положение) // Oerlikon GDF 35 мм — из сцены Skyguard (lm9241221) // 2К22 «Тунгуска» — usedm
  sampt: { units: ['sampt'], stations: [] }, // SAMP/T — Chenzoss
  khordad: { units: ['khordad'], stations: [] }, // Sevom Khordad — 42manako (перекрашен, у запада — трофейный)
  msl_aster: { samMissile: ['sampt'], stations: [] }, // Aster 30 — по IRIS-T (Raptor9), увеличена и перекрашена // Roland 2 на Marder — ScurvyWoof (перекрашен) // Flakpanzer Gepard (не «War Thunder»)
  nasams: { units: ['nasams'], stations: [] }, // NASAMS 1 — пусковая
  ew_e: { units: ['gpsjam'], stations: [] }, // станция РЭБ (восток) — машина с РЛС IBIS-150
  ew_w: { units: ['gpsjamw'], stations: [] }, // станция РЭБ (запад) — радарная машина Renault TRM
  strela1: { units: ['strela1'], stations: [] }, // «Стрела-1» — 42manako
  osa: { units: ['osa'], stations: [] }, // «Оса-АКМ» — Jeyhun1985
  tor: { units: ['tor', 'torm2'], stations: [] }, // «Тор-М1» — 42manako
  pantsir: { units: ['pantsir'], stations: [] }, // «Панцирь-С2» — 42manako
  s400: { units: ['s400', 's300'], matte: true, stations: [] }, // пусковая С-400 — Chenzoss (и для С-300: та же схема, 4 контейнера)
  patriot: { units: ['patriot', 'pac3'], stations: [] }, // Patriot M901 — Muhamad Mirza Arrafi
};
// самолёты — и для «Симулятора Летки» (выбор самолёта игрока; точки подвески — те же 8, что у его «Изделия»)
export const PLANE_META = Object.fromEntries(Object.entries(META).filter(([, m]) => m.side));
// авторы и лицензии — из исходных файлов (tools/airdef-models/prepare.js --credits)
// текстуры города (tex/*.jpg) — ambientCG: Grass004, PavingStones151, Concrete042A, RoofingTiles006, Facade002/017/018A;
// Poly Haven (tex/p_*.jpg): asphalt_02, road_damaged_2, gravel, rocky_terrain_03, brown_mud_03
const TEX_CREDIT = { title: 'Текстуры земли, дорог, крыш и фасадов', author: 'ambientCG', url: 'https://ambientcg.com', license: 'CC0', files: ['tex/*.jpg'] };
const PH_CREDIT = { title: 'Текстуры асфальта, щебня, скал и пашни; панорамы неба', author: 'Poly Haven', url: 'https://polyhaven.com', license: 'CC0', files: ['tex/p_*.jpg', 'sky/*.jpg'] };
// взрывы и пламя (fx/*.png): огненный шар с дымом — ohyhei; вспышка с кольцом и пламя — Explosion FX Free (heyheythere)
const FX_CREDITS = [
  { title: 'Иконки управления', author: 'Delapouite (game-icons.net)', url: 'https://game-icons.net', license: 'CC BY 3.0', licenseUrl: 'https://creativecommons.org/licenses/by/3.0/', files: ['icons.js'] },
  { title: 'Explosion sprite sheets', author: 'ohyhei', url: 'https://ohyhei.itch.io/a-free-explosion-sprite-sheets-asset-on-itch', license: 'бесплатно, с указанием автора', licenseUrl: 'https://ohyhei.itch.io/a-free-explosion-sprite-sheets-asset-on-itch', files: ['fx/explosion*.png'] },
  { title: 'Explosion FX Free', author: 'heyheythere', url: 'https://heyheythere.itch.io/explosion-fx-free', license: 'CC BY 4.0', files: ['fx/blast*.png', 'fx/flame*.png'] },
];
export const MODEL_CREDITS = [...CREDITS, TEX_CREDIT, PH_CREDIT, ...FX_CREDITS].map((c) => ({ ...c, licenseUrl: c.licenseUrl || (/CC0/.test(c.license) ? 'https://creativecommons.org/publicdomain/zero/1.0/' : 'http://creativecommons.org/licenses/by/4.0/') }));
const LOADED = {};
// версия файла модели (сброс кэша) — у пересобранных моделей своя, остальные не перекачиваются
const GLB_V = {}; // все модели пересобраны 2026-10-18 (затенение в стыках) — общая версия ниже
// разбор GLB: меши (позиции, нормали, UV, индексы), материалы, картинки текстур
function parseGlb(buf) {
  const dv = new DataView(buf), jl = dv.getUint32(12, true), json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jl)));
  const binOff = 28 + jl, T = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array };
  const slice = (bv, extra = 0, len = bv.byteLength) => buf.slice(binOff + (bv.byteOffset || 0) + extra, binOff + (bv.byteOffset || 0) + extra + len);
  const acc = (i) => { const a = json.accessors[i], bv = json.bufferViews[a.bufferView], C = T[a.componentType], n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type]; return new C(slice(bv, a.byteOffset || 0, a.count * n * C.BYTES_PER_ELEMENT)); };
  const meshes = json.meshes.map((m) => { const p = m.primitives[0], at = p.attributes; return { name: m.name, mat: json.materials[p.material], pos: acc(at.POSITION), nor: acc(at.NORMAL), uv: at.TEXCOORD_0 !== undefined ? acc(at.TEXCOORD_0) : null, ao: at.COLOR_0 !== undefined ? acc(at.COLOR_0) : null, idx: acc(p.indices) }; }); // ao — затенение в стыках (tools/airdef-models/ao.js)
  const images = (json.images || []).map((im) => new Blob([slice(json.bufferViews[im.bufferView])], { type: im.mimeType }));
  return { meshes, images, textures: json.textures || [] };
}
const pylonMat = new THREE.MeshPhongMaterial({ color: 0x4a4f54, specular: 0x222222, shininess: 20 });
async function load(name, base) {
  const r = await fetch(`${base}models/${name}.glb?v=${GLB_V[name] || '20261022b'}`); if (!r.ok) throw new Error(`${name}: ${r.status}`);
  const { meshes, images, textures } = parseGlb(await r.arrayBuffer());
  const tex = await Promise.all(textures.map(async (t) => {
    if (typeof createImageBitmap !== 'function') return null;
    let bmp; try { bmp = await createImageBitmap(images[t.source]); } catch (_) { return null; } // битая картинка — модель без этой текстуры
    // UV glTF — без переворота
    const x = new THREE.Texture(bmp); x.flipY = false; x.encoding = THREE.sRGBEncoding; x.anisotropy = 4; x.wrapS = x.wrapT = THREE.RepeatWrapping; x.needsUpdate = true; return x;
  }));
  // меш «часть|материал»: у комплексов — body / turret / cradle, у остальных всё в body
  const matte = !!(META[name] || META[name.replace(/_lo$/, '')] || {}).matte;
  const group = new THREE.Group(), parts = {};
  const partOf = (n) => { const k = n.includes('|') ? n.split('|')[0] : 'body'; if (!parts[k]) { parts[k] = new THREE.Group(); parts[k].name = k; group.add(parts[k]); } return parts[k]; };
  for (const m of meshes) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(m.nor, 3));
    if (m.uv) g.setAttribute('uv', new THREE.BufferAttribute(m.uv, 2));
    if (m.ao) g.setAttribute('color', new THREE.BufferAttribute(m.ao, 4, true));
    g.setIndex(new THREE.BufferAttribute(m.idx, 1)); g.computeBoundingSphere();
    const pbr = m.mat.pbrMetallicRoughness, f = pbr.baseColorFactor || [1, 1, 1, 1], glass = m.mat.alphaMode === 'BLEND';
    const map = pbr.baseColorTexture ? tex[pbr.baseColorTexture.index] : null;
    const mat = glass
      ? new THREE.MeshPhongMaterial({ color: new THREE.Color(f[0], f[1], f[2]).lerp(new THREE.Color(0.2, 0.26, 0.32), f[0] + f[1] + f[2] > 1.8 ? 0.8 : 0.4), /* белое «стекло» авторов — в тонированное, своё цветное — почти как есть */ transparent: true, opacity: Math.max(0.5, f[3]), specular: 0xffffff, shininess: 120, side: THREE.DoubleSide, depthWrite: false }) // стекло заметно: не меньше 0,5
      : new THREE.MeshPhongMaterial({ map, color: new THREE.Color(f[0], f[1], f[2]), specular: matte ? 0x0c0c0c : 0x3a3a3a, shininess: matte ? 10 : 38, side: THREE.DoubleSide, /* matte — краска техники без блеска */
        ...(m.mat.alphaMode === 'MASK' ? { alphaTest: m.mat.alphaCutoff ?? 0.5 } : {}), ...(m.ao && !/[?&]ao=0/.test(typeof location !== 'undefined' ? location.search : '') ? { vertexColors: true } : {}) }); // ?ao=0 — без затенения (сравнение)
    const mesh = new THREE.Mesh(g, mat); mesh.name = m.name; mesh.userData.glass = glass; partOf(m.name || '').add(mesh);
  }
  // крылья планирующих бомб (части wing*): своя ось поворота (вертикальная) — у корня по передней кромке; у цельного крыла
  // поперёк бомбы (УМПК) — посередине. wa — [угол на подвеске, угол в полёте]: сложенное лежит вдоль бомбы назад,
  // раскрытое — в стороны (модель с раскрытыми — wings: 'fold', со сложенными — 'deploy'); setWings ставит долю раскрытия
  const WM = (META[name] || {}).wings;
  // цельная деталь крыла поперёк бомбы (у УМПК две консоли на общей оси слиты в одну) — делим на левую и правую по
  // треугольникам: каждая консоль складывается сама, вокруг общей оси посередине
  for (const part of group.children.filter((c) => WM && /^wing/.test(c.name))) {
    const b = new THREE.Box3().setFromObject(part), c = b.getCenter(new THREE.Vector3());
    if (!(b.min.x < -0.3 && b.max.x > 0.3 && Math.abs(c.x) < 0.1)) continue;
    const halves = [new THREE.Group(), new THREE.Group()], acc = [new THREE.Vector3(), new THREE.Vector3()], cnt = [0, 0]; halves[0].name = part.name + 'R'; halves[1].name = part.name + 'L';
    for (const m of part.children) {
      const P = m.geometry.attributes.position, I = m.geometry.index.array, keep = [[], []];
      for (let t = 0; t < I.length; t += 3) { const x = (P.getX(I[t]) + P.getX(I[t + 1]) + P.getX(I[t + 2])) / 3; const h = x >= c.x ? 0 : 1; keep[h].push(I[t], I[t + 1], I[t + 2]);
        for (let j = 0; j < 3; j++) acc[h].add(new THREE.Vector3(P.getX(I[t + j]), P.getY(I[t + j]), P.getZ(I[t + j]))); cnt[h] += 3; }
      keep.forEach((ix, h) => { if (!ix.length) return; const g = m.geometry.clone(); g.setIndex(ix); halves[h].add(new THREE.Mesh(g, m.material)); });
    }
    halves.forEach((h, i) => { h.userData.pivot = c.clone(); h.userData.ctr = acc[i].divideScalar(Math.max(1, cnt[i])); group.add(h); }); group.remove(part); // габариты у клонов геометрии — от целой: центр половины считаем сами
  }
  if (WM) for (const part of group.children.filter((c) => /^wing/.test(c.name))) {
    const b = new THREE.Box3().setFromObject(part), c = part.userData.ctr ? part.userData.ctr.clone() : b.getCenter(new THREE.Vector3());
    const side = Math.sign(c.x) || 1, pv = part.userData.pivot ? part.userData.pivot.clone() : new THREE.Vector3(side > 0 ? b.min.x : b.max.x, c.y, b.min.z);
    if (WM === 'deploy' && !part.userData.pivot) pv.set(c.x, c.y, b.min.z);
    const piv = new THREE.Group(); piv.name = part.name; piv.position.copy(pv);
    for (const m of part.children.slice()) { m.position.sub(pv); piv.add(m); }
    group.remove(part); group.add(piv);
    const ang = (x, z) => Math.atan2(x, z), d = c.clone().sub(pv), wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    if (WM === 'fold') piv.userData.wa = [wrap(ang(0, 1) - ang(d.x, d.z)), 0]; // вдоль бомбы, назад
    else { const sx = Math.sign(d.x) || (part.name === 'wingA' ? 1 : -1); piv.userData.wa = [0, wrap(ang(sx * 0.98, 0.17) - ang(d.x, d.z))]; } // в сторону, со стреловидностью ~10°
    group.userData.wings = true;
  }
  // дорисованные пилоны там, где у модели их нет
  for (const p of (META[name] || META[name.replace(/_lo$/, "")] || { stations: [] }).stations) if (p.py > 0) { /* дальняя копия _lo — по описанию основной */ const pm = new THREE.Mesh(new THREE.BoxGeometry(0.12, p.py, 1.6), pylonMat); pm.position.set(p.x, p.y + p.py / 2, p.z); group.add(pm); }
  return group;
}
// готовая модель комплекса: { body, turret, cradle } (копии) или null — тогда процедурная
const UMODEL = Object.fromEntries(Object.entries(META).filter(([, m]) => m.units).flatMap(([n, m]) => m.units.map((k) => [k, n])));
// у тяжёлых моделей ПВО — дальняя копия <имя>_lo: каждая часть (корпус, башня, пакет) — THREE.LOD, ближе 400 м — подробная
const UNIT_LO = new Set(['osa', 'bukm3', 's125', 'gepard', 'ew_e', 's400', 'tor', 'pantsir', 'sampt', 'tunguska', 'skyguard', 'rapier']);
export function unitModelGlb(key) {
  const n = UMODEL[key], G = n && (LOADED[n] || LOADED[n + '_lo']), GL = n && LOADED[n] && LOADED[n + '_lo']; if (!G) return null;
  const find = (M, k) => M.children.find((c) => c.name === k);
  const get = (k) => {
    const p = find(G, k); if (!p) return null;
    const l = GL && k !== 'missile' && k !== 'booster' && find(GL, k); if (!l) return p.clone();
    const L = new THREE.LOD(); L.addLevel(p.clone(), 0); L.addLevel(l.clone(), 400); return L;
  };
  return { body: get('body'), turret: get('turret'), cradle: get('cradle'), missile: get('missile'), booster: get('booster'), radar: get('radar') }; // radar — антенна обзора на башне (крутится)
}
// ракета комплекса из его модели (маршевая ступень + ускоритель) или null
export function unitMissileGlb(key) {
  const sm = SAMMSL[key]; if (sm && LOADED[sm]) return { missile: LOADED[sm].clone(), booster: null };
  const n = UMODEL[key], G = n && LOADED[n]; if (!G) return null;
  const m = G.children.find((c) => c.name === 'missile'); if (!m) return null;
  const b = G.children.find((c) => c.name === 'booster');
  return { missile: m.clone(), booster: b ? b.clone() : null };
}
export const isObjModel = (name) => !!(META[name] && META[name].obj);
export function objModel(name) { return LOADED[name] ? LOADED[name].clone() : null; }
export const isUnitModel = (name) => { const b = name.replace(/_lo$/, ''); return !!(META[b] && (META[b].units || META[b].launcher)); }; // пришла — пересобрать машины
// фоновая загрузка всех моделей; onReady — когда что-то загрузилось (чтобы пересобрать самолёты)
// самолёты и оружие — сразу; комплексы — по запросу wantUnit (только те, что есть в бою: файлы у них крупнее)
let BASE = '', READY = null; const LOADING = new Set();
// счёт загрузки (статус «Загружаем город» в меню): сколько моделей запрошено и сколько пришло (или не пришло)
const LSTAT = { req: 0, done: 0 };
export const modelStats = () => LSTAT;
function start(name) {
  if (LOADING.has(name)) return; LOADING.add(name); LSTAT.req++;
  load(name, BASE).then((g) => { LOADED[name] = g; LSTAT.done++; if (READY) READY(name); }).catch((e) => { LSTAT.done++; console.warn('модель не загрузилась:', e.message); });
}
export function loadModels(base, onReady) {
  BASE = base; READY = onReady;
  for (const [name, m] of Object.entries(META)) if (!m.units && !m.bld && !m.lazy) start(name); // самолёты (кроме lazy), оружие, ракеты ПЗРК — сразу
}
// модели «Мульти-волны» и прочие lazy: начать загрузку / копия загруженной (или null)
export function wantModel(name) { if (META[name] && BASE) start(name); }
export const anyModel = (name) => (LOADED[name] ? LOADED[name].clone() : null);
export function wantUnit(key) { const n = UMODEL[key]; if (n && BASE) { if (UNIT_LO.has(n)) start(n + '_lo'); start(n); } } // сначала лёгкая дальняя копия
// дома города вблизи — по запросу (на слабом пресете не грузятся); bldModel — загруженная модель (общая, не копия)
export function wantBuildings(names) { if (BASE) for (const [n, m] of Object.entries(META)) if (m.bld && (!names || names.includes(n))) start(n); } // names — только модели этой карты (зимний лес городу не нужен и наоборот)
export const bldModel = (name) => (META[name] && (META[name].bld || META[name].obj) && LOADED[name]) || null;
// модель оружия: готовая (если есть и загрузилась) или процедурная геометрия с общим материалом
const byKey = (f) => Object.fromEntries(Object.entries(META).filter(([, m]) => m[f]).flatMap(([n, m]) => [].concat(m[f]).map((k) => [k, n])));
const WMODEL = byKey('weapon'), SAMMSL = byKey('samMissile'), LAUNCHER = byKey('launcher');
// модель оружия по ключу AG — загрузить (lazy: оружие «Мульти-волны»)
export function wantWeapon(key) { const n = WMODEL[key]; if (n && BASE) start(n); }
// прицельный контейнер игрока (или null — тогда цилиндр)
// (у самолётов pod — место подвески контейнера: ищем именно модель контейнера, pod === true)
export function podModel() { const n = Object.keys(META).find((k) => META[k].pod === true); return n && LOADED[n] ? LOADED[n].clone() : null; }
// труба ПЗРК (качающаяся часть пусковой у расчёта) или null
export function launcherGlb(key) { const n = LAUNCHER[key]; return n && LOADED[n] ? LOADED[n].clone() : null; }
// крылья планирующей бомбы: k = 0 — сложены (на подвеске), 1 — раскрыты (в полёте)
export function setWings(obj, k) { if (obj.userData.wings) obj.traverse((n) => { const a = n.userData.wa; if (a) n.rotation.y = a[0] + (a[1] - a[0]) * k; }); }
// у оружия есть готовая модель, но она ещё грузится (временную фигуру потом подменить)
// у оружия есть настоящая модель (а не процедурная фигура): только к такому подводим камеру (ЗУР — всегда, это не про них)
export const weaponHasModel = (key, W) => !!(WMODEL[key] || (W && W.model));
export const weaponPending = (key) => { const n = WMODEL[key]; return !!(n && !LOADED[n]); };
export function weaponMesh(key, W, geoFn, mat) {
  const n = WMODEL[key];
  if (n && LOADED[n]) { const o = LOADED[n].clone(); o.traverse((q) => { if (q.isMesh) q.castShadow = true; }); setWings(o, 0); return o; } // крылья — сложены (на подвеске)
  return new THREE.Mesh(geoFn(key, W), mat);
}
// класс машины по подвеске: бомбы (в том числе управляемые) — ударный, иначе — ракетный
const BOMB = new Set(['bomb', 'lgb', 'tvb', 'gps']);
export function classOf(items, AG) {
  let b = 0, m = 0; for (const [key, n] of items) { const W = AG[key]; if (!W || W.kind === 'ecm') continue; if (BOMB.has(W.kind)) b += n * W.mass; else m += n * W.mass; }
  return b >= m ? 'strike' : 'fighter';
}
export const classOfRole = (role) => (role === 'sead' || role === 'low' || role === 'tv' ? 'fighter' : 'strike');
// готовая модель стороны и класса (своего класса нет — любая модель стороны; нет ничего — null, тогда процедурная)
// name — конкретная модель (из подвески), если загрузилась
export const planeMeta = (name) => META[name] || null; // сопла, пилоны — для зон повреждений (plane-zones.js) и проверок
export function planeModel(side, cls = 'strike', name = null) {
  if (name && META[name] && !LOADED[name] && BASE) start(name); // своя модель подвески ещё не пришла — пока подходящая из загруженных
  const rank = ([n, m]) => (n === name ? -2 : m.cls === cls ? -1 : 0);
  const pick = Object.entries(META).filter(([n, m]) => m.side && m.side === side && LOADED[n] && (!m.only || n === name)).sort((a, b) => rank(a) - rank(b))[0];
  if (!pick) return null;
  const [n, m] = pick;
  return { obj: LOADED[n].clone(), stations: m.stations, nozzles: m.nozzles, nr: m.nr, pod: m.pod, name: n, cls: m.cls, internal: !!m.internal };
}
