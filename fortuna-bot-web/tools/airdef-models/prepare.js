// Подготовка скачанных моделей (Sketchfab, glb) для «Воздушного превосходства»:
//   deno run -A tools/airdef-models/prepare.js su30 [--views]      (или: all)
// Что делает: собирает все меши в общих осях (с поворотами узлов), убирает лишние части по правилу (шасси, створки,
// подвеска модели — по связным частям меша, координаты как в parts.js), переводит в метры, разворачивает носом в −Z
// (как модели игры), ставит центр, оставляет POSITION / NORMAL / TEXCOORD_0, склеивает примитивы по материалам,
// текстуры цвета ужимает в JPEG (sips); остальные карты выбрасывает — в игре материалы Phong.
// Пишет games/airdef/models/<имя>.glb, печатает размеры. --views — виды готовой модели (PPM во временной папке).
import { readGlb, flatten, components, bbox, accessor } from './glb.js';
import { render, writePpm } from './raster.js';
import { MeshoptSimplifier } from 'npm:meshoptimizer@0.21.0';

const HOME = Deno.env.get('HOME'), DL = `${HOME}/Downloads`;
// перекраска: синие пиксели (синий заметно больше красного и зелёного) → оливковый той же яркости, остальное как было
const BLUE = 'gt(b(X,Y),r(X,Y)+25)*gt(b(X,Y),g(X,Y)+10)', LUM = '(0.3*r(X,Y)+0.59*g(X,Y)+0.11*b(X,Y))';
const OLIVE = `format=gbrp,geq=r='if(${BLUE},min(255,${LUM}*1.35),r(X,Y))':g='if(${BLUE},min(255,${LUM}*1.4),g(X,Y))':b='if(${BLUE},${LUM}*0.9,b(X,Y))'`;
const LS = (c) => { if (Deno.env.get('LS') && Math.max(...c.size) > Number(Deno.env.get('LSMIN') ?? 0.4)) console.log('  часть', c.mat, 'ц', c.ctr.map((v) => v.toFixed(2)).join(' '), 'р', c.size.map((v) => v.toFixed(2)).join(' ')); return 'body'; }; // LS=1 … --groups: список частей
// снять шасси и подвески автора: у оси (|dx| < dW) — части с центром ниже yF, дальше — свисающие ниже yW (по низу части);
// не больше smax; keep(c, d) — оставить (подфюзеляжные кили и т. п.). ax — x оси самолёта (до центровки)
const strip = (ax, yF, dW, yW, smax = 6.5, keep) => (c) => { const d = Math.abs(c.ctr[0] - ax), lo = c.ctr[1] - c.size[1] / 2;
  return Math.max(...c.size) < smax && (d < dW ? c.ctr[1] < yF : lo < yW) && !(keep && keep(c, d)) ? null : LS(c); };
const KZ = 7.2 / 8.4; // «Кинжал» из ракеты «Искандера»: длина 7,2 м
const FAB_TOP = Number(Deno.env.get('FAB_TOP') ?? -2.03); // верх корпуса ФАБ-500 в осях игры без центровки (см. --groups)
// nose — куда смотрит нос модели в её осях; center — [y оси фюзеляжа] в её единицах (иначе середина габаритов)
// remove(c, i) — c: часть меша { min, max, ctr, size, tris, mat }, i — номер по размеру в своём примитиве
// ось модели наклонена: x = bx·z, y = by·z (нос в −Z) — поворот, чтобы ось легла на Z
const tiltFix = (bx, by) => { const a = Math.atan(bx), b = Math.atan(by * Math.cos(a)), ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b); return (x, y, z) => { const x1 = x * ca - z * sa, z1 = x * sa + z * ca; return [x1, y * cb - z1 * sb, y * sb + z1 * cb]; }; };
// атлас ракет модели HIMARS: надписи автора модели на корпусе ракеты — закрашены (в игре их быть не должно)
const NO_TAG = 'drawbox=x=iw*0.325:y=ih*0.41:w=iw*0.375:h=ih*0.09:color=0x141414:t=fill,drawbox=x=iw*0.355:y=ih*0.515:w=iw*0.09:h=ih*0.41:color=0x141414:t=fill';
// камуфляж без текстур (cfg.camo: { scheme, skip: /имена материалов без камуфляжа/ }): краска «#camo», в файле — основной цвет
// схемы; сам узор (схема и размер пятен — META.camo в games/airdef/models.js) рисует шейдер игры. Гусеницы, шины, стёкла,
// стволы — свои цвета (skip или группа «часть#краска»)
const CAMO_BASE = { nato: [0.095, 0.118, 0.056], soviet: [0.092, 0.125, 0.046], uk: [0.088, 0.11, 0.055], fr: [0.2, 0.23, 0.27] }; // линейные (как в models.js CAMO)
const CONFIG = {
  su30: { src: `${DL}/pbr_sukhoi_su-30.glb`, raw: true, scale: 0.01, nose: '+x', centerY: 240, tex: () => 1024,
    remove: (c, i) => c.mat === 0 && i > 0 && c.min[1] < 130 && c.max[0] > -380 }, // шасси, створки и кронштейны ниш (брюшные гребни — оставить)
  f18: { src: `${DL}/boeing_fa-18ef_super_hornet.glb`, scale: 1, nose: '+x', tex: () => 512, glassAny: /^glass$/, glassColor: [0.42, 0.36, 0.2, 0.45], /* фонарь у автора непрозрачный */
    remove: (c) => c.max[1] < 0.12 && Math.abs(c.ctr[2]) > 2.5 }, // ракеты под крыльями и спарка (на концах крыльев — оставить)
  f16: { src: `${DL}/general_dynamics_f-16d_block_60.glb`, scale: 1, nose: '-z', tex: (m) => (/^cock|^ins/.test(m.name) ? 128 : 512),
    // подвеска (баки, бомбы, ракеты под крылом; AIM-120 на законцовках — оставить), шасси и мелкие детали кабины под фонарём
    // (из-за них 15 текстур и ~17 тыс. треугольников)
    remove: (c) => (c.mat === 10 && Math.abs(c.ctr[0]) < 4.5) || [17, 6, 7, 8, 9, 12, 13, 14, 15].includes(c.mat) || ((c.mat === 5 || c.mat === 1) && c.max[1] < 1.3) },
  // оружие из моделей самолётов: pick — коробка [x0,y0,z0, x1,y1,z1] в осях модели, берутся части с центром внутри;
  // модель ставится центром габаритов в начало координат
  w_umpk: { src: `${DL}/fab-500_m62.glb`, scale: 17.6, nose: '+x', tex: () => 512, pickMesh: /./, rulesIn: 'game', colors: { '#metal': [0.28, 0.29, 0.3], '': [0.07, 0.08, 0.055] }, groups: (c) => (c.mat === 13 || (c.size[0] > 2 && c.size[1] < 0.15) ? 'wing#metal' : [7, 9, 10, 11, 12, 15, 16, 17, 18, 19].includes(c.mat) ? 'body#metal' /* узел крепления крыльев, хвостовой модуль и бандажи — металл */ : 'body') }, // ФАБ-500 с УМПК; wing — крыло (на подвеске сложено вдоль бомбы)
  // ── четвёртая партия (2026-10-19), без упрощения: ФАБ-100 и ОФАБ-250 — 4ikalka (мм / свои единицы, без текстур — оливковые),
  // ФАБ-250 — CATholic (текстура автора), ФАБ-1000 — United4192, GBU-24 и GBU-57 — Rhine_Lab_Muelsyse (US Weapon Pack)
  w_fab100: { src: `${DL}/fab-100-120.glb`, scale: 0.001 * 1.07 / 1.134, nose: '-x', tex: () => 256, pickMesh: /./, colors: { '': [0.07, 0.08, 0.055] } },
  w_ofab250: { src: `${DL}/ofab-250-270.glb`, scale: 1.48 / 21.06, nose: '-x', tex: () => 256, pickMesh: /./, colors: { '': [0.07, 0.08, 0.055] } },
  w_fab250: { src: `${DL}/fab-250_the_soviet_aviation_bomb.glb`, scale: 1.5 / 2.25, nose: '-x', tex: () => 256, pickMesh: /./ },
  w_fab1000: { src: `${DL}/fab-1000.glb`, scale: 3.35 / 4.58, nose: '-z', tex: () => 256, pickMesh: /./, colors: { '^Black|^Gray': [0.07, 0.08, 0.055], '^Brown': [0.12, 0.04, 0.02] } /* корпус и хвост — оливковые, поясок — тёмно-красный */ },
  w_gbu24: { src: `${DL}/us_weapon_pack.glb`, scale: 1, nose: '-z', tex: () => 256, pickMesh: /gbu-24/ },
  w_gbu57: { src: `${DL}/us_weapon_pack.glb`, scale: 1, nose: '-z', tex: () => 256, pickMesh: /gbu-57/ },
  w_fab500: { src: `${DL}/fab-500_m-54_v5.glb`, scale: 2.47 / 20.68, nose: '-x', tex: () => 256, pickMesh: /./, colors: { '': [0.07, 0.08, 0.055] } }, // ФАБ-500М-54 — 4ikalka (2026-10-19; эпоха I), УМПК — по-прежнему из ФАБ-500М-62
  w_fab500_old: { src: `${DL}/fab-500_m62.glb`, scale: 17.6, nose: '+x', tex: () => 512, target: 8000, simpErr: 0.15, minPart: 0.15, pickMesh: /./, rulesIn: 'game', perTri: true, groups: (c) => (c.min[1] > FAB_TOP ? null : 'body') }, // без УМПК: всё выше корпуса долой
  w_kh29t: { src: `${DL}/russian_weapon_pack.glb`, scale: 1, nose: '+x', tex: () => 512, pickMesh: /ru_kh-29/ }, // Х-29 из набора
  w_kh31p: { src: `${DL}/russian_weapon_pack.glb`, scale: 1, nose: '+x', tex: () => 512, pickMesh: /w_lasm/ }, // Х-31 из набора
  w_kh59m: { colors: { '': [0.24, 0.25, 0.23] }, src: `${DL}/kh31.glb`, scale: 5.69 / 189.07, axes: (x, y, z) => [x, -z, y], tex: () => 256, target: 7000, pickMesh: /./ }, // Х-31 (L_elo) в размер Х-59М (5,7 м) — и для Х-59МК2 (прежняя — из War Thunder)
  w_kh25ml: { colors: { '': [0.3, 0.31, 0.29] }, src: `${DL}/kh-29_kedge.glb`, scale: 3.7 / 3.93, nose: '+z', tex: () => 256, target: 7000, pickMesh: /./ }, // Х-29 (Novia556) в размер Х-25МЛ (прежняя Х-38 — из War Thunder)
  w_kh58: { colors: { nosecone: [0.025, 0.028, 0.025], nozzle: [0.04, 0.04, 0.04], '^body$|fins|duct': [0.3, 0.31, 0.29], '': [0.12, 0.12, 0.12] }, src: `${DL}/kh-58u_anti-radiation_missile.glb`, scale: 1, nose: '-z', tex: () => 256, target: 9000, pick: [0, -1, -3, 1.2, 1, 3] }, // Х-58У (Narni_Tchereskov) — 4,8 м; у автора две ракеты — правая
  w_mk82: { src: `${DL}/300_followers_-_free_aircraft_missile_set.glb`, scale: 2.22 / 2.9, nose: '-x', tex: () => 256, pickMesh: /Mk83 bomb/ }, // Mk 83 → размер Mk 82
  // ── ещё оружие (2026-10-08)
  w_jassm: { src: `${DL}/agm-158_-_wings_extended.glb`, scale: 4.27 / 173, nose: '-x', tex: () => 256, target: 24000, simpErr: 0.02, pickMesh: /./ }, // 296 тыс. треугольников: при 7 тыс. — «обрубок», 24 тыс. — форма цела
  w_agm88: { src: `${DL}/agm-88_harm_transport_cart.glb`, scale: 1, nose: '+x', tex: () => 512, target: 7000, pick: [-2, 0.95, 0, 2.5, 1.7, 1] }, // одна HARM с тележки (и для AARGM)
  w_agm65b: { src: `${DL}/agm_65_maverick.glb`, scale: 2.49 / 1.31, axes: (x, y, z) => [x, z, -y], tex: () => 256, target: 60000, simpErr: 0.004, minPart: 0.012, pick: [-0.08, -1, -0.73, 0.23, 2, -0.42] }, // одна из трёх, стояла вертикально; у одной ~200 тыс. треугольников — до 60 тыс. с малой ошибкой (прежние 7000 — ломаная форма)
  w_mald: { src: `${DL}/aim-160a_screamer.glb`, scale: 2.84 / 2, nose: '-x', tex: () => 256, target: 7000, pickMesh: /./ },
  w_decoy_e: { colors: { '': [0.14, 0.16, 0.12] }, src: `${DL}/harpy_drone.glb`, scale: 0.1, nose: '+z', tex: () => 256, pickMesh: /./ }, // Harpy — ложная цель (без упрощения: у источника всего ~21 тыс. треугольников)
  w_pod: { src: `${DL}/anaaq-28v_lightning_fbx.glb`, scale: 1, nose: '+z', tex: () => 256, target: 9000, simpErr: 0.3, cluster: true, minPart: 0.03, pickMesh: /./ }, // LITENING — прицельный контейнер
  w_gbu39: { src: `${DL}/gbu-39b_small_diameter_bomb_weapon_system.glb`, scale: 0.0496, axes: (x, y, z) => [x, -y, -z], /* нос из +Z в −Z и переворот: у автора крылья снизу — у настоящей SDB на спине */ tex: () => 512, pickMesh: /./,
    groups: (c) => (Math.abs(c.ctr[0]) > 3 && c.size[1] < 1 ? (c.ctr[0] > 0 ? 'wingA' : 'wingB') : 'body') }, // крылья — свои части (на подвеске сложены)
  w_gbu31: { src: `${DL}/mk82_jdam.glb`, scale: 3.88 / 15.69, nose: '-z', tex: () => 256, target: 9000, pickMesh: /./ }, // Mk 82 JDAM (FeriseCAT) в размер GBU-31 (3,9 м) (прежняя GBU-24 — из War Thunder)
  mp_stinger: { src: `${DL}/fim-92_stinger.glb`, scale: 7.6, nose: '+x', tex: () => 256, pickMesh: /./, remove: (c) => c.ctr[0] < -0.05 }, // труба Stinger (ракета — отдельно)
  mp_verba: { src: `${DL}/manpads_model_9k333_verba.glb`, scale: 0.0774, nose: '+x', tex: () => 256, target: 7000, pickMesh: /PZRC|battery|pen_|trigger|nab_|button|switch/ }, // труба «Вербы»
  msl_manpads: { src: `${DL}/manpads_model_9k333_verba.glb`, scale: 0.0774, nose: '-x', tex: () => 256, pickMesh: /Rocket_low|_stab/ }, // ракета «Вербы» — для всех ПЗРК и Avenger
  // ракеты «воздух–воздух» для «Симулятора Летки» (на пилонах самолётов и в полёте вместо процедурных)
  aam_r73: { src: `${DL}/russian_weapon_pack.glb`, scale: 1, nose: '+x', tex: () => 512, pickMesh: /ru_r-73/ }, // Р-73
  aam_r77: { src: `${DL}/russian_weapon_pack.glb`, scale: 1, nose: '+x', tex: () => 512, pickMesh: /ru_r-77\// }, // Р-77 (не Р-77М)
  aam_r27: { src: `${DL}/russian_weapon_pack.glb`, scale: 1, nose: '+x', tex: () => 512, pickMesh: /ru_r-27r/ }, // Р-27Р (и для Т/ЭР)
  aam_r33: { src: `${DL}/russian_weapon_pack.glb`, scale: 1, nose: '+x', tex: () => 512, pickMesh: /ru_r-33/ }, // Р-33
  aam_aim9: { src: `${DL}/300_followers_-_free_aircraft_missile_set.glb`, scale: 1, nose: '-x', tex: () => 256, pickMesh: /AIM-9 Sidewinder/ }, // AIM-9 (B/L/X, Р-3С)
  aam_aim54: { src: `${DL}/300_followers_-_free_aircraft_missile_set.glb`, scale: 1, nose: '-x', tex: () => 256, pickMesh: /AIM-54 Phoenix/ }, // AIM-54
  // ── машины (generic passenger car pack — 10 штук на круглом подиуме): каждая — своим куском, повёрнута вдоль оси, нос в −Z
  c_compact: { src: `${DL}/generic_passenger_car_pack.glb`, scale: 1, unit: true, tex: () => 256, pick: [-5.8, -0.5, 3.9, -2.5, 3, 7.5], axes: (x, y, z) => [x * 0.8084 - z * -0.5886, y, x * -0.5886 + z * 0.8084] },
  c_coupe: { src: `${DL}/generic_passenger_car_pack.glb`, scale: 1, unit: true, tex: () => 256, pick: [-8.5, -0.5, 0.4, -3.7, 3, 3.5], axes: (x, y, z) => [x * 0.3045 - z * -0.9525, y, x * -0.9525 + z * 0.3045] },
  c_hatch: { src: `${DL}/generic_passenger_car_pack.glb`, scale: 1, unit: true, tex: () => 256, pick: [-5.8, -0.5, -7.6, -2.1, 3, -3.3], axes: (x, y, z) => [x * -0.8097 - z * -0.5868, y, x * -0.5868 + z * -0.8097] },
  c_van: { src: `${DL}/generic_passenger_car_pack.glb`, scale: 1, unit: true, tex: () => 256, pick: [-8.9, -0.5, -3.8, -3.7, 3, -0.4], axes: (x, y, z) => [x * -0.3162 - z * -0.9487, y, x * -0.9487 + z * -0.3162] },
  c_offroad: { src: `${DL}/generic_passenger_car_pack.glb`, scale: 1, unit: true, tex: () => 256, pick: [3.8, -0.5, 0.3, 8.4, 3, 3.6], axes: (x, y, z) => [x * 0.3045 - z * 0.9525, y, x * 0.9525 + z * 0.3045] },
  c_pickup: { src: `${DL}/generic_passenger_car_pack.glb`, scale: 1, unit: true, tex: () => 256, pick: [-1.3, -0.5, -9.4, 1.3, 3, -3.6], axes: (x, y, z) => [x * -1.0000 - z * 0.0000, y, x * 0.0000 + z * -1.0000] },
  c_sedan: { src: `${DL}/generic_passenger_car_pack.glb`, scale: 1, unit: true, tex: () => 256, pick: [-1.3, -0.5, 4.2, 1.3, 3, 9.2], axes: (x, y, z) => [x * 1.0000 - z * 0.0000, y, x * 0.0000 + z * 1.0000] },
  c_sport: { src: `${DL}/generic_passenger_car_pack.glb`, scale: 1, unit: true, tex: () => 256, pick: [2.1, -0.5, -7.7, 6.0, 3, -3.3], axes: (x, y, z) => [x * -0.8052 - z * 0.5929, y, x * 0.5929 + z * -0.8052] },
  c_suv: { src: `${DL}/generic_passenger_car_pack.glb`, scale: 1, unit: true, tex: () => 256, pick: [3.3, -0.5, -3.7, 8.5, 3, -0.2], axes: (x, y, z) => [x * -0.3138 - z * 0.9495, y, x * 0.9495 + z * -0.3138] },
  c_wagon: { src: `${DL}/generic_passenger_car_pack.glb`, scale: 1, unit: true, tex: () => 256, pick: [1.8, -0.5, 2.8, 5.8, 3, 7.5], axes: (x, y, z) => [x * 0.8047 - z * 0.5937, y, x * 0.5937 + z * 0.8047] },
  c_police: { src: `${DL}/low_poly_car.glb`, scale: 1, nose: '-x', unit: true, tex: () => 512, pickMesh: /./ }, // полицейская
  // ── Gripen, F-22, F-35A (2026-10-12): нос в −Z, метры; без своих ракет, шасси и открытых створок
  e_gripen: { src: `${DL}/saab_jas-39_gripen_fighter_jet.glb`, scale: 1, nose: '+x', rulesIn: 'game', tex: () => 512, opaque: /^(Camo|material|White|Jet_m)$/, cutout: true, groups: (c) => (Math.abs(c.ctr[0]) > 1.5 && [1, 4, 5].includes(c.mat) ? null : 'body'), glassPart: (c) => c.mat === 3 && Math.abs(c.ctr[0]) < 0.6 && c.ctr[2] < -3 }, // свои ракеты и баки — долой, пилоны и направляющие — оставить
  e_f22: { src: `${DL}/lockheed_martin_f-22_raptor.glb`, scale: 18.92 / 12.11, nose: '-x', rulesIn: 'game', tex: () => 512, glassAny: /^glass$/, glassColor: [0.42, 0.36, 0.2, 0.45], /* у автора фонарь непрозрачный; у F-22 — золотистый */ groups: (c) => ([16, 17].includes(c.mat) ? null : 'body') }, // без встроенного выхлопа (plumes): пламя рисует игра
  e_f35: { src: `${DL}/f-35a_lightning_ii.glb`, scale: 0.56, nose: '+z', rulesIn: 'game', tex: () => 512, glass: /^mat_1[45]$/, glassColor: [0.42, 0.36, 0.2, 0.45], /* фонарь и стекло ИЛС — золотистые */ groups: (c) => (Math.abs(c.ctr[0]) > 5.9 ? null : LS(c)) }, // модель ×1,8 — к 15,7 м; летающие створки — долой
  // ── противник «Летки» (2026-10-11): нос в −Z, метры; без шасси и подставки
  e_mig21: { src: `${DL}/mig-21_chibi.glb`, scale: 0.07, rulesIn: 'game', tex: () => 512, opaque: /mig21/, // «чиби»: стоял на подставке с креном ~10° — выравниваем
    axes: (x, y, z) => { const c = Math.cos(-0.174), s = Math.sin(-0.174); return [-x * c - y * s, -x * s + y * c, -z]; },
    groups: (c) => (c.size[2] > 14 || c.mat !== 2 ? null : c.ctr[1] < 0.98 && Math.max(...c.size) < 4.9 ? null : LS(c)) }, // длина 14,5 м // подставка, шасси и бак
  e_mig31: { src: `${DL}/b168fbca1f6c4ad0ad4e45b7a22f52bc.glb`, scale: 9.95, nose: '+x', rulesIn: 'game', tex: () => 512, glassColor: [0.3, 0.36, 0.42, 0.4], /* у автора почти чёрное и прозрачное на 90 % */ groups: (c) => (c.min[1] < -1.25 && Math.max(...c.size) < 2.5 ? null : 'body') }, // без шасси
  e_su57: { src: `${DL}/sukhoi_su-57_felon.glb`, scale: 7.42, nose: '-x', rulesIn: 'game', tex: () => 512, glass: /^Darkness\.001$/, groups: () => 'body' },
  e_tu22m3: { src: `${DL}/tupolev_tu-22m3.glb`, scale: 1, nose: '+z', rulesIn: 'game', tex: () => 512, groups: () => 'body' }, // вблизи — без упрощения: тонкие крылья и закрылки от него рвутся (дальняя копия _lo — упрощённая)
  // ── «Воздушное превосходство»: свой самолёт у каждой подвески (2026-10-12)
  // Су-24М — manilov.ap (CC BY; прежняя модель 42manako была из мода Battlefield 2): лежит повёрнутой в плоскости XZ (fwd — нос)
  e_su24: { src: `${DL}/su24.glb`, scale: 0.903, fwd: [-0.8024, -0.5968], rulesIn: 'game', tex: () => 512, centerX: true,
    // без подвесок автора: бак под фюзеляжем (длинный, ниже оси) и ракеты с оперением под крыльями (дальше 4 м от оси); ось у автора — x 0,87 (в масштабе)
    groups: (c) => ((c.size[2] > 4.5 && c.size[0] < 1.2 && c.ctr[1] < 0) || (Math.abs(c.ctr[0] - 0.87) > 3.6 && c.ctr[1] < 0.55) ||
      (Math.max(...c.size) < 1 && Math.abs(Math.abs(c.ctr[0] - 0.87) - 2.45) < 0.3 && c.ctr[1] < 0.2) /* оперение снятых баков и их подвесы */ ? null : LS(c)) },
  // ── новые самолёты 2026-10-19 (manilov.ap, CC BY; как Су-24 — лежат повёрнутыми в XZ: fwd — нос по оси симметрии, tools: sym.js) ──
  e_tornado: { src: `${DL}/tornado.glb`, scale: 16.72 / 16.5, fwd: [-0.7339, 0.6793], rulesIn: 'game', tex: () => 512, centerX: true, /* ливрея автора — как есть (Mark 2026-10-19) */ // ось — x 4,16: без баков и контейнеров под крылом (пилоны — оставить)
    groups: (c) => (Math.abs(c.ctr[0] - 4.16) > 2.5 && c.ctr[1] < 1.9 ? null : 'body') },
  e_f111: { src: `${DL}/f111.glb`, scale: 22.4 / 40.2, fwd: [-0.7716, 0.6361], rulesIn: 'game', tex: () => 512, centerX: true, // ось — x 3,97: без выпущенных шасси и створок
    groups: (c) => (c.ctr[1] < -1.9 && Math.abs(c.ctr[0] - 3.97) < 2.2 ? null : 'body') },
  e_mig23: { src: `${DL}/mig23.glb`, scale: 16.7 / 17.71, fwd: [-0.8192, 0.5736], rulesIn: 'game', tex: () => 512, centerX: true, // ось — x 3,77: без подфюзеляжного бака и ракет (подфюзеляжный киль — оставить)
    groups: (c) => ((c.size[2] > 4 && c.size[0] < 0.7 && Math.abs(c.ctr[0] - 3.77) < 0.3 && c.ctr[1] < 2.1) || (Math.abs(Math.abs(c.ctr[0] - 3.77) - 0.4) < 0.15 && c.ctr[1] < 2.3) ||
      (Math.abs(Math.abs(c.ctr[0] - 3.77) - 1.44) < 0.3 && c.ctr[1] < 3.2 && Math.max(...c.size) < 4.5) /* ракеты под крылом */ ? null : 'body') },
  e_mig27: { src: `${DL}/mig27.glb`, scale: 17.08 / 17.04, fwd: [-0.7193, 0.6947], rulesIn: 'game', tex: () => 512, centerX: true, // ось — x 3,0: без бака и блоков под фюзеляжем (киль — оставить)
    groups: (c) => ((c.size[2] > 4 && c.size[0] < 0.7 && Math.abs(c.ctr[0] - 3.0) < 0.3 && c.ctr[1] < 2.2) || (Math.abs(c.ctr[0] - 3.0) > 0.5 && Math.abs(c.ctr[0] - 3.0) < 1.4 && c.ctr[1] < 2.75) ||
      (Math.abs(Math.abs(c.ctr[0] - 3.0) - 1.53) < 0.3 && c.ctr[1] < 3.45) /* бомбы под наплывом */ ? null : 'body') },
  e_tu22m2: { src: `${DL}/tu26.glb`, scale: 42.46 / 42.9, fwd: [-0.8746, -0.4848], rulesIn: 'game', tex: () => 512, centerX: true, // без выпущенных шасси
    groups: (c) => { const dx = Math.abs(c.ctr[0] + 0.47); // ось — x −0,47
      return (c.max[1] < -2.3 && Math.max(...c.size) < 3) || (c.ctr[1] < -1.95 && c.ctr[2] > -11 && c.ctr[2] < -6.5 && dx < 1) /* носовая стойка и створки */ ||
        (c.ctr[1] < -1.6 && dx > 0.9 && dx < 6.2 && c.ctr[2] > 1 && c.ctr[2] < 9 && Math.max(...c.size) < 4) /* основные стойки и открытые створки */ ? null : 'body'; } },
  e_a10: { src: `${DL}/pbr_a-10_thunderbolt.glb`, scale: 16.26 / 21.06, nose: '-z', rulesIn: 'game', tex: () => 512, centerX: true, groups: (c) => (c.max[1] < 1.05 || (c.ctr[1] < 1.3 && Math.max(...c.size) < 1.4) ? null : 'body') }, // A-10 — Immersive3D: без колёс и стоек (гондолы шасси — как в полёте)
  e_f15e: { src: `${DL}/mcdonnell_douglas_f-15e_strike_eagle.glb`, scale: 0.1044, axes: (x, y, z) => [-(0.9211 * x - 0.3894 * z), -0.1329 * x + 0.9399 * y - 0.3145 * z, -(0.366 * x + 0.3414 * y + 0.8657 * z)], /* у автора в полёте: курс 67°, тангаж 20° — главная ось (pca3.js); нос — в −Z */ rulesIn: 'game', tex: () => 256, target: 60000, simpErr: 0.02, centerX: true, // F-15E — Spark_Customs: без текстур — «ганшип грей»
    colors: { '': [0.1, 0.105, 0.115] }, perTri: true, // подвески автора (по треугольникам; правила до центровки: x −0,104, y −4,418, z +1,588): под крылом и под конформными баками
    groups: (c) => { const X = Math.abs(c.ctr[0] - 0.104), Y = c.ctr[1] - 4.418;
      return (X > 1.95 && X < 4.6 && Y < -0.97 && c.ctr[2] + 1.588 < 5.2) /* не стабилизаторы (хвост — дальше 5,5 м) */ || (X > 1.0 && X < 1.95 && Y < -1.75) ? null : 'body'; } }, // крыло снизу — около −0,8 м
  // ── третья партия 2026-10-19 (manilov.ap, CC BY): fwd — по оси симметрии (sym.js; у F-117 и B-2 нет киля-подсказки — нос проверен по виду сбоку); без упрощения;
  // шасси и подвески автора — долой (strip): x оси, низ фюзеляжа и крыла — по LS=1 --groups и видам --views ──
  e_mig21n: { src: `${DL}/mig21.glb`, scale: 0.99190, fwd: [-0.8359, 0.5488], rulesIn: 'game', tex: () => 512, centerX: true, groups: strip(-0.26, 1.48, 1.0, 1.3, 2.0, (c, d) => d < 0.3 && c.size[2] > 3) /* подфюзеляжный киль — оставить */ },
  e_mig25: { src: `${DL}/mig25.glb`, scale: 0.80415, fwd: [-0.7934, 0.6088], rulesIn: 'game', tex: () => 512, centerX: true, groups: strip(-0.47, 1.25, 1.8, 2.05, 6.5, (c, d) => c.size[0] > 1.5 || (d < 1.6 && c.ctr[2] > 4.5)) /* ракеты Р-40 под крылом; стабилизатор и кили — оставить */ },
  e_su7b: { src: `${DL}/su7b.glb`, scale: 0.87774, fwd: [0.8361, 0.5486], rulesIn: 'game', tex: () => 512, centerX: true, groups: strip(-0.38, 1.2, 1.2, 1.42) /* баки под фюзеляжем и крылом */ },
  e_tu16: { src: `${DL}/tu16.glb`, scale: 0.94283, fwd: [-0.9304, -0.3665], rulesIn: 'game', tex: () => 512, centerX: true, groups: LS },
  e_f100: { src: `${DL}/f100.glb`, scale: 0.98446, fwd: [-0.5332, 0.8460], rulesIn: 'game', tex: () => 512, centerX: true, groups: strip(-0.75, -1.1, 0.9, -0.5, 6.5, (c) => c.size[0] > 2) /* четыре бака (консоль крыла — оставить) */ },
  e_f5: { src: `${DL}/8089d66a8a8748b2a4b049b3c06f6a02.glb`, scale: 0.43199, fwd: [-0.8547, 0.5191], rulesIn: 'game', tex: () => 512, centerX: true, groups: strip(-1.1, 1.2, 1.0, 1.25) /* подфюзеляжный бак */ },
  e_f117: { src: `${DL}/f117.glb`, scale: 0.98432, fwd: [-0.6820, 0.7314], rulesIn: 'game', tex: () => 512, centerX: true, groups: (c) => ((c.ctr[1] < 1.55 && Math.max(...c.size) < 2.5) || (c.ctr[1] - c.size[1] / 2 < 1.35 && Math.max(...c.size) < 1.2) ? null : LS(c)) /* створки отсеков */ },
  e_jaguar: { src: `${DL}/jaguar.glb`, scale: 1.03125, fwd: [-0.8090, 0.5878], rulesIn: 'game', tex: () => 512, centerX: true, groups: (c) => ((c.ctr[1] < 1.6 || c.ctr[1] - c.size[1] / 2 < 1.45) && Math.max(...c.size) < 1.4 && c.ctr[2] < 2.2 ? null : LS(c)) /* подфюзеляжные кили (z 3) — оставить */ },
  e_buccaneer: { src: `${DL}/buccaneer.glb`, scale: 0.99897, fwd: [-0.7320, 0.6813], rulesIn: 'game', tex: () => 512, centerX: true, groups: strip(-0.14, -1.15, 1.0, -1.0, 2.0) },
  e_harrier: { src: `${DL}/harrier.glb`, scale: 1.01656, fwd: [-0.7400, 0.6726], rulesIn: 'game', tex: () => 512, centerX: true, groups: strip(0, 1.3, 1.3, 1.6, 3.5) /* баки под крылом и стойки на концах крыла (обтекатели — оставить) */ },
  e_mirage: { src: `${DL}/mirage2000.glb`, scale: 0.99722, fwd: [-0.7765, 0.6301], rulesIn: 'game', tex: () => 512, centerX: true, groups: LS },
  e_rafale: { src: `${DL}/rafale.glb`, scale: 1.00659, fwd: [-0.8290, -0.5592], rulesIn: 'game', tex: () => 512, centerX: true, groups: (c) => ((c.ctr[1] < -0.45 || c.ctr[1] - c.size[1] / 2 < -0.7) && Math.max(...c.size) < 1.7 ? null : LS(c)) },
  e_b2: { src: `${DL}/a9be2ca923aa44809194613209810d06.glb`, scale: 2.20126, fwd: [-0.9591, -0.2831], rulesIn: 'game', tex: () => 512, centerX: true, groups: (c) => (c.max[1] < 1.15 || (c.ctr[1] < 1.1 && Math.max(...c.size) < 2.2) || (c.ctr[1] - c.size[1] / 2 < 0 && Math.max(...c.size) < 3) ? null : LS(c)) /* и открытый бомбоотсек */ },
  // ── четвёртая партия 2026-10-19 (CC BY; без упрощения): manilov.ap — fwd по оси симметрии (sym.js), остальные — по осям автора ──
  e_yak38: { src: `${DL}/yak-38.glb`, scale: 16.37 / 16.6, fwd: [-0.8090, -0.5878], rulesIn: 'game', tex: () => 512, centerX: true, groups: (c) => { const d = Math.abs(c.ctr[0] + 0.13), m = Math.max(...c.size); return (d < 1.2 ? c.ctr[1] < -0.5 && m < 2.0 : (c.size[0] < 0.12 && c.size[1] < 0.12 && c.size[2] > 1.2 && c.ctr[1] < -0.15) || (c.ctr[1] - c.size[1] / 2 < -0.45 && m < 4.5)) ? null : LS(c); } /* шасси и трубы блоков НАР под крылом */ },
  e_il28: { src: `${DL}/il28.glb`, scale: 21.45 / 21.43, fwd: [-0.8829, 0.4695], rulesIn: 'game', tex: () => 512, centerX: true, groups: (c) => (c.ctr[1] < 1.5 && Math.max(...c.size) < 3 ? null : LS(c)) /* шасси */ },
  e_tu22: { src: `${DL}/tu22.glb`, scale: 23.17 / 24.06, fwd: [-0.7826, -0.6225], rulesIn: 'game', tex: () => 512, centerX: true, groups: (c) => (c.ctr[1] < -1.25 && Math.max(...c.size) < 4 ? null : LS(c)) /* шасси */ },
  e_tu95: { src: `${DL}/tu95.glb`, scale: 50.04 / 49.93, fwd: [-0.7771, 0.6293], rulesIn: 'game', tex: () => 512, centerX: true, colors: { '^Cylinder68': [0.05, 0.05, 0.05] }, /* лопасти у автора целиком жёлтые — тёмный металл */
    groups: (c) => (c.mat === 10 ? null /* нарисованные автором неподвижные диски винтов («блины» с жёлтым ободом) — размытый диск рисует игра (models.js, spinProps) */ : c.mat === 11 ? `prop${[-11.52, -5.72, 7.14, 12.94].reduce((b, h, i, H) => (Math.abs(c.ctr[0] - h) < Math.abs(c.ctr[0] - H[b]) ? i : b), 0)}_${Math.round(c.ctr[2] * 2)}` /* по ближайшей ступице (x ступиц — до центровки) */ /* лопасти: часть на каждый винт (соосные — два ряда), крутит игра; диск «размытия» (VINT) — неподвижный */
      : c.ctr[1] < -1.9 && Math.max(...c.size) < 5 ? null : LS(c)) },
  e_hunter: { src: `${DL}/hunter.glb`, scale: 10.26 / 10.29, fwd: [-0.7160, 0.6981], rulesIn: 'game', tex: () => 512, centerX: true, groups: strip(0.36, 0.9, 1.0, 1.0, 4.0) },
  e_su27: { src: `${DL}/sukhoi_su-27_flanker.glb`, scale: 21.9 / 30.61, nose: '+x', rulesIn: 'game', tex: () => 512, centerX: true, groups: LS },
  e_su35: { src: `${DL}/sukhoi_su-35_flanker-e__-35.glb`, scale: 21.9 / 10.15, nose: '+x', rulesIn: 'game', tex: () => 512, centerX: true, groups: LS },
  e_etendard: { src: `${DL}/super-etendard.glb`, scale: 14.31 / 14.29, nose: '-x', rulesIn: 'game', tex: () => 512, centerX: true, groups: (c) => ((c.ctr[1] < -1.15 || (c.ctr[1] < -0.8 && Math.abs(Math.abs(c.ctr[0]) - 1.7) < 0.2)) && Math.max(...c.size) < 3 ? null : LS(c)) /* шасси и его стойки */ },
  e_mirage_f1: { src: `${DL}/dassault_mirage_f1.glb`, scale: 15.3 / 12.18, nose: '+z', rulesIn: 'game', tex: () => 512, centerX: true, camo: { scheme: 'fr', skip: /^(?!material_0$|Material\.198$)/ }, /* у автора корпус и крылья без цвета (белые) — двухтонный серо-голубой камуфляж (шейдер игры) */ groups: strip(0, -1.42, 1.2, -0.85, 4.5) /* шасси, баки, блоки НАР */ },
  e_f18c: { src: `${DL}/mcdonnell_douglas_fa-18c_hornet.glb`, scale: 17.07 / 16.95, nose: '+z', rulesIn: 'game', tex: () => 512, centerX: true, groups: (c) => ((c.ctr[1] < -1.3 && Math.max(...c.size) < 5) || (Math.abs(c.ctr[0]) < 1.5 && c.ctr[1] < -0.85 && Math.max(...c.size) < 1.6) ? null : LS(c)) /* шасси (и стойки) и подфюзеляжный бак */ },
  e_ea18g: { src: `${DL}/mcdonnell_douglas_fa-18eboeing_ea-18g_growler.glb`, scale: 18.31 / 18.29, nose: '+x', rulesIn: 'game', tex: () => 512, centerX: true, groups: (c) => { const d = Math.abs(c.ctr[0]); return (d < 1.4 ? (c.ctr[1] < -0.2 && Math.max(...c.size) < 5.5) || (c.ctr[1] < 0.05 && Math.max(...c.size) < 1.6) : c.ctr[1] - c.size[1] / 2 < 0.4 && Math.max(...c.size) < 5) ? null : LS(c); } /* шасси, бак и контейнеры помех (пилоны — оставить) */ },
  e_su24_old: { src: `${DL}/russian_su-24.glb`, scale: 0.0543, nose: '-z', rulesIn: 'game', tex: () => 512, // (42manako — не использовать: из мода BF2)
    groups: (c) => (c.ctr[1] < -0.4 && Math.abs(c.ctr[0]) < 2.2 && Math.max(...c.size) < 1.9 && !(c.size[2] > 1.5 && c.size[1] < 0.3) && ((c.ctr[2] > 1.6 && c.ctr[2] < 4.7) || (c.ctr[2] > -5.7 && c.ctr[2] < -3.2)) ? null : LS(c)) }, // шасси и створки (пилоны под фюзеляжем — оставить)
  e_su25: { src: `${DL}/pbr_sukhoi_su-25.glb`, scale: 0.483, nose: '-z', rulesIn: 'game', tex: () => 512,
    groups: (c) => (c.ctr[1] < 1.35 && Math.abs(c.ctr[0]) < 1.5 && c.ctr[2] > -3.2 && c.ctr[2] < 1.8 ? null : LS(c)) }, // шасси
  e_su34: { src: `${DL}/su-34_prototype_su-32fn.glb`, scale: 0.98, nose: '+z', rulesIn: 'game', tex: () => 512, centerX: true, texVf: 'hue=h=152:s=0.32,eq=brightness=-0.04', // меши подписаны: без шасси, створок, лестницы и своего оружия
    pickMesh: /^(?!.*(Wheel|Strut|Ladder|Step|TaxiLight|R-73|R-27|Kh-31|AB-500|Tank|Door))/, groups: LS },
  e_su17: { src: `${DL}/su17.glb`, scale: 1, fwd: [-0.6933, 0.7207], rulesIn: 'game', tex: () => 512, centerX: true, // лежит повёрнутой в плоскости XZ, ось — x −0,4
    groups: (c) => { const dx = Math.abs(c.ctr[0] + 0.4), [, y, z] = c.ctr; return (y < 1.45 && dx > 1.6 && dx < 2.9 && z > 0.2 && z < 2.0) || (y < 1.15 && dx < 0.45 && z > -5.6 && z < -4.0) ? null : LS(c); } }, // шасси и створки
  e_f4: { src: `${DL}/mcdonnell_douglas_f-4_phantom_ii.glb`, scale: 0.93, nose: '+x', rulesIn: 'game', tex: () => 512, // «полная подвеска» в одном меше — снимаем: баки, бомбы на МБД, «Спарроу»; без выхлопа
    groups: (c) => { const [x, y] = c.ctr, ax = Math.abs(x), s = c.size; if (c.mat === 14) return null;
      if (y < -0.18 && ax > 1.75 && !(s[0] < 0.12 && s[1] > 0.4)) return null; // под крылом: всё, кроме самих пилонов
      if (y < -0.55 && ax < 0.3 && s[0] > 0.6) return null; // подфюзеляжный бак
      if (y < -0.1 && ax < 1.75 && s[0] < 0.25 && s[1] < 0.25 && s[2] > 2) return null; // «Спарроу» в нишах
      return LS(c); } },
  // ── «Мульти-волна» (2026-10-13): крылатые ракеты, дроны, носители, пусковые оперативно-тактических ракет
  w_tomahawk: { src: `${DL}/tomahawk.glb`, scale: 1.44, nose: '-z', rulesIn: 'game', tex: () => 256, groups: LS }, // BGM-109 — 5,56 м
  // Х-101 — HappyBattleSheep, Thingiverse (CC BY): STL в мм, Z вверх; stl2glb.js → Downloads/stl-glb/kh101.glb
  // GBU-10 — PhilCiborowski, Thingiverse (CC BY; 1/72, мм): снизу «пенёк» для печати — долой
  w_gbu10: { src: `${DL}/stl-glb/gbu10.glb`, scale: 4.32 / 45.53, axes: (x, y, z) => [y, z, x], rulesIn: 'game', tex: () => 256, pickMesh: /./, crease: 35, perTri: true,
    colors: { '': [0.11, 0.125, 0.08] }, groups: () => 'body' },
  // станция помех ELTA 8222 — Original_linny, Thingiverse (CC BY; 1/48, мм): и для запада, и пока вместо «Сорбции» (Mark 2026-10-19)
  w_ecm: { src: `${DL}/stl-glb/elta8222.glb`, scale: 0.048, axes: (x, y, z) => [x, z, -y], tex: () => 256, pickMesh: /./, crease: 35, colors: { '': [0.2, 0.21, 0.2] } },
  w_kh101: { src: `${DL}/stl-glb/kh101.glb`, scale: 0.001, axes: (x, y, z) => [y, z, x], tex: () => 256, pickMesh: /./, colors: { '': [0.08, 0.085, 0.09] } },
  w_kh555: { src: `${DL}/kh-555_cruise_missile_high_poly_fbx.glb`, scale: 1, nose: '+z', rulesIn: 'game', tex: () => 256, target: 120000, simpErr: 0.004, /* 768 тыс. треугольников — почти без потерь */ groups: LS }, // Х-555 (и вид Х-55 / Х-101) — 6,04 м
  w_kalibr: { src: `${DL}/sizzler_ss-n-27_kalibr_3m-54.glb`, scale: 1, nose: '+z', rulesIn: 'game', tex: () => 256, groups: LS }, // «Калибр» — 6,2 м
  w_agm86: { src: `${DL}/agm-86.glb`, scale: 0.1454, nose: '-z', rulesIn: 'game', tex: () => 256, centerX: true, groups: LS }, // AGM-86 ALCM — 6,32 м
  w_storm: { src: `${DL}/ukrainian_su-24_with_storm_shadow_agms.glb`, scale: 2.48, nose: '+z', rulesIn: 'game', tex: () => 256, pickMesh: /ss_misile/, pick: [0.3, -99, -99, 99, 99, 99], groups: LS }, // Storm Shadow — 5,1 м, одна из двух с Су-24
  d_shahed: { src: `${DL}/shahed_136.glb`, scale: 1.45, nose: '+z', rulesIn: 'game', tex: () => 256, groups: (c) => (c.ctr[2] > 0.25 && Math.hypot(c.ctr[0], c.ctr[1] - 0.25) < 0.5 && c.size[2] < 0.3 ? 'prop' : LS(c)) }, // «Шахед-136» — 3,5 м; винт сзади — своя группа (крутится)
  d_uav: { src: `${DL}/uav.glb`, scale: 6, nose: '-z', rulesIn: 'game', tex: () => 256, // винты — свои группы (крутятся каждый вокруг своей оси); без шасси
    groups: (c) => { const [x, y, z] = c.ctr, ax = Math.abs(x); if (y < -0.55 && Math.max(...c.size) < 5) return null; if (ax > 0.9 && ax < 1.85 && z > 3.1 && z < 3.45 && Math.abs(y) < 0.5) return x > 0 ? 'prop' : 'prop2'; return LS(c); } }, // разведывательно-ударный БПЛА — размах 12 м; два толкающих винта
  e_tu160: { src: `${DL}/tupolev_tu-160.glb`, scale: 0.235, nose: '+z', rulesIn: 'game', tex: () => 512, groups: (c) => (c.ctr[1] < 2.6 && Math.max(...c.size) < 4 && Math.abs(c.ctr[0]) < 4.5 ? null : LS(c)) } /* без шасси */, // Ту-160 — 54 м
  e_b1b: { src: `${DL}/rockwell_b-1b_lancer.glb`, scale: 0.95, nose: '-z', rulesIn: 'game', tex: () => 512, groups: (c) => (c.ctr[1] < 2.2 && Math.max(...c.size) < 4 && Math.abs(c.ctr[0]) < 4.5 ? null : LS(c)) } /* без шасси */, // B-1B — 44,5 м
  e_b52: { src: `${DL}/boeing_b-52_stratofortress.glb`, scale: 1, nose: '-z', rulesIn: 'game', tex: () => 512, groups: LS }, // B-52H — 48,5 м; носитель «Мульти-волны»
  e_typhoon: { src: `${DL}/eurofighter_typhoon_ef-2000.glb`, scale: 15.96 / 18.72, nose: '+x', rulesIn: 'game', tex: () => 512, target: 20000, pickMesh: /Eurofighter typhoon/,
    groups: (c) => (c.ctr[1] < -0.8 && Math.abs(c.ctr[0]) > 0.4 && !(c.size[0] < 0.12 && c.size[1] > 0.3) ? null : LS(c)) }, // подвеска модели (ракеты, баки) — долой, пилоны остаются // Eurofighter Typhoon — 16 м; носитель Storm Shadow
  w_slam: { src: `${DL}/ugm-84_harpoon_free.glb`, scale: 4.49 / 7.3, nose: '+x', tex: () => 256, target: 5000, pickMesh: /./ }, // AGM-84E SLAM (по Harpoon) — 4,49 м
  // AGM-154 JSOW — RickSlash (CC BY, с текстурами; 2026-10-19 вместо набора NETRUNNER_pl): 2 → 4,1 м, крылья — две пластины сверху (сложены)
  w_jsow: { src: `${DL}/agm-154_jsow_missile.glb`, scale: 2.05, nose: '+z', rulesIn: 'game', tex: () => 512, pickMesh: /./,
    groups: (c) => (c.size[1] < 0.06 && c.ctr[1] > 0.12 ? (c.ctr[0] > 0 ? 'wingA' : 'wingB') : 'body') },
  w_jsow_old: { src: `${DL}/300_followers_-_free_aircraft_missile_set.glb`, scale: 1, nose: '-x', tex: () => 256, pickMesh: /AGM-154 JSOW/, groups: (c) => (c.size[1] < 0.05 && c.ctr[1] > 2.9 ? (c.ctr[2] > 0 ? 'wingA' : 'wingB') : 'body') }, // AGM-154 JSOW — 4,1 м; крылья в модели сложены — раскрываются после сброса
  // «Кинжал» — ракета 9М723 с пусковой «Искандера» (Х-47М2 сделан на её основе; решение Mark 2026-10-12): на старте она стоит
  // вертикально — поворот носом в −Z; правила частей — как у l_iskander (в её осях); светло-серая, как на фото
  w_kinzhal: { src: `${DL}/chinese_9k720_iskander_telar.glb`, scale: 0.027 * KZ, centerX: true, /* 7,2 м (у автора 8,4); ракета стоит в стороне от оси пусковой */ axes: (x, y, z) => { const [a, b, c] = AX['-x'](x, y, z); return [a, c, -b]; }, rulesIn: 'game', dedupe: true, renorm: true, dropMat: /^edge_color/, tex: () => 256,
    texVf: 'hue=s=0,eq=brightness=0.22:contrast=0.45,colorchannelmixer=rr=0.97:bb=1.03',
    groups: (c) => { const x = c.ctr[0] / KZ, y = -c.ctr[2] / KZ, z = c.ctr[1] / KZ, sx = c.size[0] / KZ, sy = c.size[2] / KZ, sz = c.size[1] / KZ; // обратно в оси и масштаб пусковой (правила l_iskander)
      const thin = sx < 1.15 && sz < 1.15 && !(Math.max(sx, sz) < 0.3 && sy > 2);
      const fin = sx < 0.3 && sz < 0.3 && sy > 1 && sy < 1.3; // рули (4 «косым крестом»): нижние — у l_iskander отрезаны порогом z > 6,3 (ось ракеты — z 6,53)
      return (z > 6.3 || (z > 6 && fin)) && y > 2.2 && thin && Math.abs(x - 2.75) < 0.62 ? 'body' : null; } },
  // ложная цель «Искандера» — отделяемая головная часть той же ракеты (обычного цвета ракеты, без перекраски)
  w_tbmdec: { src: `${DL}/chinese_9k720_iskander_telar.glb`, scale: 0.027 * KZ, centerX: true, /* 7,2 м (у автора 8,4); ракета стоит в стороне от оси пусковой */ axes: (x, y, z) => { const [a, b, c] = AX['-x'](x, y, z); return [a, c, -b]; }, rulesIn: 'game', dedupe: true, renorm: true, dropMat: /^edge_color/, tex: () => 256, cutZ: [-99, -6.85], /* только головная часть: обтекатель и боевая часть (нос — z ≈ −8,9), ~2 м */
    groups: (c) => { const x = c.ctr[0] / KZ, y = -c.ctr[2] / KZ, z = c.ctr[1] / KZ, sx = c.size[0] / KZ, sy = c.size[2] / KZ, sz = c.size[1] / KZ; // обратно в оси и масштаб пусковой (правила l_iskander)
      const thin = sx < 1.15 && sz < 1.15 && !(Math.max(sx, sz) < 0.3 && sy > 2);
      const fin = sx < 0.3 && sz < 0.3 && sy > 1 && sy < 1.3; // рули (4 «косым крестом»): нижние — у l_iskander отрезаны порогом z > 6,3 (ось ракеты — z 6,53)
      return (z > 6.3 || (z > 6 && fin)) && y > 2.2 && thin && Math.abs(x - 2.75) < 0.62 ? 'body' : null; } },
  l_iskander: { src: `${DL}/chinese_9k720_iskander_telar.glb`, scale: 0.027, nose: '-x', rulesIn: 'game', dedupe: true, renorm: true, dropMat: /^edge_color/, unit: true, tex: () => 512, // 9П78 — 13 м, две ракеты стоят на старте в корме
    groups: (c) => { const [x, y, z] = c.ctr, thin = c.size[0] < 1.15 && c.size[2] < 1.15 && !(Math.max(c.size[0], c.size[2]) < 0.3 && c.size[1] > 2); /* не направляющие пусковой (длинные и тонкие; стабилизаторы — короткие) */ const fin = c.size[0] < 0.3 && c.size[2] < 0.3 && c.size[1] > 1 && c.size[1] < 1.3; /* нижние рули ниже порога 6,3 — тоже ракета (как у w_kinzhal) */ if ((z > 6.3 || (z > 6 && fin)) && y > 2.2 && thin) { if (Math.abs(x - 2.75) < 0.62) return 'tbm'; if (Math.abs(x - 4.06) < 0.62) return 'tbm2'; } return 'body'; } },
  l_tochka: { src: `${DL}/ukrainian_otr-21_tochka-u.glb`, scale: 0.0284, nose: '+z', rulesIn: 'game', dedupe: true, renorm: true, texVf: "curves=all='0/0 0.5/0.42 1/0.68'", /* светлые пятна камуфляжа на солнце выгорали в белое */ colors: { '^(White|material_1)$': [0.07, 0.085, 0.05], '^0059_DarkOliveGreen': [0.06, 0.08, 0.035], '^material$': [0.1, 0.11, 0.08] }, /* цвета — линейные (0,06 ≈ 27 % яркости на экране); у автора белые без текстуры — под цвет машины */ dropMat: /^edge_color/, unit: true, tex: () => 512, // 9П129 — 11,8 м, ракета на старте в корме
    groups: (c) => ((Math.abs(c.ctr[0] + 3.98) < 0.4 && c.ctr[2] > 13.2 && c.ctr[1] > 2.4 && c.size[0] < 0.8) || (Math.abs(c.ctr[0] + 3.98) < 0.45 && c.ctr[2] > 12.9 && c.ctr[1] > 2.4 && c.ctr[1] < 2.7 && c.size[1] < 0.1) ? 'tbm' : 'body') }, /* второе условие — два нижних решётчатых руля (плоские, у хвоста) */
  l_scud: { src: `${DL}/scud__ballistic_missile.glb`, scale: 3.13, nose: '+z', rulesIn: 'game', unit: true, tex: () => 512, texVf: 'eq=gamma=1.7:brightness=0.04:saturation=0.9', /* текстура у автора очень тёмная */ // Р-17 на МАЗ-543 — 13,4 м, ракета на старте
    groups: (c) => (Math.abs(c.ctr[0]) < 0.75 && c.ctr[2] > 4.6 && c.ctr[1] > 2.2 && c.size[0] < 1.4 && !(c.size[1] > 2 && c.size[0] < 0.6 && c.size[2] > 0.6) ? 'tbm' : 'body') }, /* без наклонной стойки пусковой (высокая и тонкая) */ // tbm — ракета на старте: при пуске прячется, улетает её копия
  l_himars: { src: `${DL}/m142_himars__free_model__animation.glb`, scale: 0.43, nose: '-z', rulesIn: 'game', texVf: (src) => "curves=all='0/0 0.5/0.4 1/0.78'" + (src === 0 ? ',' + NO_TAG : '') /* атлас ракет (картинка 0) — без надписей автора */, colors: { '^Material_147$': [0.3, 0.25, 0.16] }, /* песочная окраска — чуть темнее, иначе на солнце белая */ unit: true, tex: () => 512, // M142 HIMARS — 7 м
    pickMesh: /^(?!.*(_dam\/|Default_2))/, groups: (c) => (c.mat === 3 && c.ctr[2] > -0.7 && c.ctr[1] > -0.6 ? 'pod' : LS(c)) }, /* pod — пакет с ракетами (узел misc_a, материал 3; без колпаков колёс того же материала и мелочи у кабины): поднимается перед пуском */ // без «повреждённых» дублей дверей и капота и без ракеты, лежащей рядом
  w_atacms: { src: `${DL}/m142_himars__free_model__animation.glb`, scale: 0.43, nose: '-z', axes: tiltFix(-0.0796, 0.0242) /* ракета в модели повёрнута на 4,5° / 1,4° — ось вдоль Z */, rulesIn: 'game', tex: () => 256, pickMesh: /Default_2/, groups: LS, texVf: () => NO_TAG }, // ракета HIMARS — как ATACMS (4 м); надписи автора модели на корпусе — закрашены
  // ── карта «Летки»: ЛЭП, ветряк, порт, маяк, поезда; танкеры (2026-10-11)
  // пролёт моста — VectorMan: квадратный настил ~7,5 м (асфальт, тротуары, перила, балка) и опора — отдельной частью pier
  // (в игре её тянут до дна); модель повёрнута на 45° — fwd по перилам
  br_seg: { src: `${DL}/modular_road_bridge.glb`, scale: 0.0024, fwd: [1, -1], rulesIn: 'game', tex: () => 512, groups: (c) => (c.mat === 1 && c.max[1] < 4.6 && c.size[1] > 2 ? 'pier' : c.mat === 1 && c.max[1] < 5.6 ? 'cap' : c.mat === 4 ? (c.ctr[0] < 0 ? 'railL' : 'railR') : LS(c)) }, // cap — ригель опоры (только там, где колонны); перила — по сторонам (у широкого моста внутренние долой)
  br_truss: { src: `${DL}/mcclintic_marshall_products_co._tender_b.glb`, scale: 1, nose: '-z', rulesIn: 'game', tex: () => 256, perTri: true, groups: (c) => (Math.abs(c.ctr[2]) > (c.ctr[1] < 0 ? 128 : 123) || c.size[2] > 40 ? null : 'body') }, // ферменный мост — statelibrarynsw: только ферма с концевыми опорами (|z| ≤ 122 м), подходы долой
  m_pylon: { src: `${DL}/high_voltage_transmission_line_tower_tileable.glb`, scale: 3.2, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, groups: (c) => (c.size[2] > 20 || c.ctr[2] < -60 ? null : 'body') }, // только опора: провода (крепления — 3 фазы x −7 / 0 / +7, y 23,1) рисует игра, изоляторы соседней опоры — долой // опора с пролётом проводов (стыкуются через 144 м)
  m_wind: { src: `${DL}/wind_turbine_demo.glb`, scale: 18, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, groups: (c) => (c.ctr[2] < 0.3 ? 'rotor' : 'body') }, // ротор — своя группа (крутится) // ветряк ~100 м
  m_ship: { src: `${DL}/low_poly_cargo_ship.glb`, scale: 150 / 4200, nose: '+z', rulesIn: 'game', unit: true, tex: () => 1024, groups: () => 'body' }, // сухогруз 150 м
  m_cont: { src: `${DL}/sea_container_-_low_poly.glb`, scale: 6.06 / 2.83, nose: '-z', rulesIn: 'game', unit: true, tex: () => 256, target: 400, groups: () => 'body' }, // 20-футовый контейнер (для палуб и порта)
  m_crane: { src: `${DL}/port_crane_sokol.glb`, scale: 1, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, target: 9000, groups: (c) => (c.mat === 2 ? null : 'body') }, // портальный кран «Сокол» (без площадки)
  m_light: { src: `${DL}/lighthouse-2.glb`, scale: 0.75, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, groups: () => 'body' }, // маяк ~42 м
  m_loco: { src: `${DL}/train__locomotive_low-poly_locomotive.glb`, scale: 1, nose: '+z', rulesIn: 'game', unit: true, tex: () => 256, target: 6000, groups: () => 'body' }, // тепловоз
  m_loco2: { src: `${DL}/train__locomotive_sd40-2.glb`, scale: 1, nose: '-z', rulesIn: 'game', unit: true, tex: () => 256, target: 6000, groups: () => 'body' }, // тепловоз SD40-2
  t_il78: { src: `${DL}/il78.glb`, scale: 1, nose: '-z', rulesIn: 'game', glass: /^Sphere01/, tex: () => 1024, target: 14000, groups: (c) => (Math.abs(c.ctr[0]) < 6 && c.max[1] < -1 && Math.max(...c.size) < 3 ? null : 'body') }, // без шасси // Ил-78 — танкер «Летки» (восток)
  t_kc10: { src: `${DL}/mcdonnell_douglas_kc-10_extender.glb`, scale: 55.35 / 226.4, nose: '-x', rulesIn: 'game', tex: () => 512, target: 40000, perTri: true, groups: (c) => (c.ctr[1] < 2.8 && Math.abs(c.ctr[0] - 4.5) < 7 ? null : 'body') }, // KC-10 — Spark_Customs (CC BY), без шасси (по треугольникам: колёса срослись с сеткой; ось у автора — x 4,5); западный танкер про запас (KC-135 из MS Flight Simulator — удалён)
  // ── ракеты «воздух–воздух» из новых наборов (2026-10-11)
  aam_aim7: { src: `${DL}/us_weapon_pack.glb`, scale: 1, nose: '-z', tex: () => 256, pickMesh: /us_aim-7\// }, // AIM-7 (E и M)
  aam_aim9x: { src: `${DL}/us_weapon_pack.glb`, scale: 1, nose: '-z', tex: () => 256, pickMesh: /us_aim-9x/ }, // AIM-9X
  aam_r60: { src: `${DL}/simple_gameready_weapons_for_fighter_jet_games.glb`, scale: 2.09 / 4.53, nose: '+z', tex: () => 256, pickMesh: /R-60_6/ }, // Р-60М (в наборе ×2,2)
  // Aster 30 для SAMP/T — по модели IRIS-T (Raptor9): увеличена до 4,9 м; голубые и сиреневые детали — в серые тона Aster
  msl_aster: { src: `${DL}/low_poly_german_iris-t_aam.glb`, scale: 4.9 / 924.74, nose: '-x', tex: () => 256, pickMesh: /./,
    colors: { '^ff18aef9$': [0.35, 0.35, 0.35], '^ff9(06680|55f8d)$': [0.5, 0.5, 0.5] } },
  aam_iris: { src: `${DL}/low_poly_german_iris-t_aam.glb`, scale: 2.936 / 924.74, nose: '-x', tex: () => 256, pickMesh: /./ }, // IRIS-T
  aam_mica: { src: `${DL}/low_poly_missiles_and_torpedos.glb`, scale: 1, nose: '+z', tex: () => 256, pickMesh: /VL MICA/ }, // MICA (EM и IR — один корпус)
  msl_aim120: { src: `${DL}/boeing_fa-18ef_super_hornet.glb`, scale: 1, nose: '+x', tex: () => 256, pick: [-6, -0.5, 4.5, -1, -0.02, 4.9] }, // AIM-120 с F/A-18 — для NASAMS
  w_gbu12: { src: `${DL}/general_dynamics_f-16d_block_60.glb`, scale: 1, nose: '-z', tex: () => 512, texVf: OLIVE, /* у автора — синяя учебная, перекрашена в оливковую боевую */ pick: [-3.0, 0.7, -1.5, -2.75, 1.1, 3] }, // GBU-12 Paveway II с F-16
  mig29: { src: `${DL}/mig_29.glb`, scale: 17.32 / 947.3, nose: '+z', tex: () => 1024 },
  // правила частей — в осях игры (без центровки): along/across — положение центра части вдоль и поперёк оси пакета
  tor: { src: `${DL}/9k331_tor-m1.glb`, scale: 1, fwd: [0.767, 0.641], rulesIn: 'game', unit: true, perTri: true, tex: () => 512, target: 55000,
    radarRaise: { hinge: [-9.33, 1.04, 10.3], angle: 1.85 }, tpFix: [0.01, 2.29, -0.19], /* ось башни — как в launchers.js (кромка сложенной решётки лежала у основания и сдвигала расчёт) */ // антенна в модели сложена назад на вилке; шарнир — верх тумбы (центр x −9,33, z 10,3): вилку с решёткой и запросчиком — в боевое положение
    groups: (c) => (c.min[1] > -0.13 && c.ctr[2] > 5.8 && c.ctr[2] < 12.8 ? ((c.ctr[2] > 10.5 && Math.abs(c.ctr[0] + 9.33) < (c.ctr[2] > 11.0 ? 1.15 : 1.0)) || (c.ctr[2] > 10.1 && c.ctr[1] > 0.98 && Math.abs(c.ctr[0] + 9.33) < 0.65) ? 'radar' : 'turret') : 'body') }, // башня сшита с корпусом одной сеткой — по треугольникам; radar — антенна обзора (в модели сложена назад)
  pantsir: { src: `${DL}/96k6_pantsir-s2.glb`, scale: 1, nose: '+z', rulesIn: 'game', unit: true, tex: () => 512, /* у автора — сплошной ярко-зелёный */ target: 55000, minPart: 0.04, hinge: [0, 3.35, -0.6], tube: [0.12, 0.35],
    groups: (c) => {
      if (c.min[1] < 2.4 || c.ctr[2] < -3.2 || c.ctr[2] > 2.4) return 'body';
      if (Math.abs(c.ctr[0]) < 0.72 && c.min[1] > 3.1 && c.ctr[2] > 0.9 && c.ctr[2] < 2.4 && (Math.abs(c.ctr[0]) < 0.4 || c.min[1] > 3.6)) return 'radar'; // РЛС обнаружения на крыше башни (блок 1,33 м — с боковыми деталями) — крутится
      return c.min[1] > 2.7 && c.max[1] < 3.95 && c.ctr[2] < 0.6 && (c.size[2] > 0.8 || Math.abs(c.ctr[0]) > 0.75) ? 'cradle' : 'turret';
    } },
  s400: { src: `${DL}/s-400_triumf_missile_launcher_truck.glb`, scale: 13.5 / 1.9, nose: '+z', rulesIn: 'game', unit: true, perTri: true, tex: () => 2048, target: 120000, /* скан: текстура 2048 — 1024 смазывала (2026-10-13) */ hinge: [0, -1.53, 5.44], tube: [0.6, 1.4], // скан: весь тягач — одна сетка, делим по треугольникам
    groups: (c) => (c.ctr[1] > -1.45 && axis(c, [5.44, -1.53], [-0.604, 0.797], 1.75, -1.8, 9.5) ? 'cradle' : 'body') },
  // «Стрела-1» (БРДМ-2): пусковая в модели развёрнута на ~43° влево — turretYaw; одна ракета «летит» отдельно — долой
  strela1: { src: `${DL}/9k31_strela-1_sam.glb`, scale: 0.295, nose: '+z', rulesIn: 'game', unit: true, tex: () => 512, turretYaw: -0.75, hinge: [0.55, 2.87, 0.24], absorb: 0,
    groups: (c) => {
      if (c.mat === 1) return c.ctr[0] < -1.4 ? null : 'missile'; // ракеты 9М31 на направляющих (и одна «в полёте»)
      if (c.min[1] > 2.75) return 'cradle';
      return c.min[1] > 1.88 ? 'turret' : 'body';
    } },
  // Roland 2 на Marder — ScurvyWoof: без текстур, цвета авторов «мятные» — перекраска в бронзово-зелёный бундесвера (RAL 6031)
  roland: { src: `${DL}/marder_roland_low-poly.glb`, scale: 2.3, nose: '+z', rulesIn: 'game', unit: true, tex: () => 512, camo: { scheme: 'nato', skip: /^(material_0|Material\.0(0[2-9]|1))/  }, hinge: [0, 2.74, 0.5], tube: [0.25, 0.4],
    colors: { '^Material\\.002': [0.05, 0.06, 0.065], '^Material\\.003': [0.025, 0.025, 0.024], '^Material\\.008': [0.035, 0.035, 0.032], '^Material\\.011': [0.03, 0.03, 0.028] }, // гусеницы и катки — тёмные (у автора белые и светло-серые)
    groups: (c) => {
      if (c.min[1] < 2.0 || c.ctr[2] < -1.2 || c.ctr[2] > 1.9) return 'body';
      if (Math.abs(c.ctr[0]) < 0.6 && c.min[1] > 3.15 && c.ctr[2] > 0.9) return 'radar'; // РЛС обзора на мачте — крутится
      return Math.abs(c.ctr[0]) > 0.65 && c.min[1] > 2.12 ? 'cradle' : 'turret'; // контейнеры с ракетами и их рычаги — качаются
    } },
  // 2К22 «Тунгуска» — usedm: башня с РЛС сопровождения спереди и обзора сзади (крутится); по бокам — спарки 2А38 и по 4 ТПК 9М311,
  // они качаются вместе (общая цапфа)
  tunguska: { src: `${DL}/2k22_tunguska.glb`, scale: 10, nose: '+z', rulesIn: 'game', unit: true, tex: () => 1024, /* без упрощения (37 тыс.) */ hinge: [0, 2.2, 0.1], tube: [0.18, 0.3],
    groups: (c) => {
      if (c.min[1] < 1.5 || Math.abs(c.ctr[2]) > 2.7) return 'body';
      if (Math.abs(c.ctr[0]) < 0.5 && c.min[1] > 3.05 && c.ctr[2] > 1.3) return 'radar';
      return Math.abs(c.ctr[0]) > 0.74 && c.min[1] > 1.65 && c.ctr[2] < 1.3 ? 'cradle' : 'turret';
    } },
  // SAMP/T — Chenzoss: скан, вся машина — одна сетка; пакет из 8 контейнеров Aster лежит по-походному — делим по треугольникам,
  // в игре он поднимается вертикально (u.lel = 90°) вокруг оси у кормы
  sampt: { src: `${DL}/samp-t_air_defense_system.glb`, scale: 5.5, nose: '+z', rulesIn: 'game', unit: true, perTri: true, tex: () => 1024, target: 60000, hinge: [0, 0.45, 4.3],
    groups: (c) => (c.ctr[1] > 0.4 && c.ctr[2] > -0.8 && c.ctr[2] < 4.35 && Math.abs(c.ctr[0]) < 1.7 ? 'cradle' : 'body') }, // пакет: два ряда контейнеров, y 0,5–1,75 (под ним — пустой промежуток до рамы)
  khordad: { src: `${DL}/iranian_sevom_khordad_sam.glb`, scale: 100, nose: '-x', texVf: "hue=h=44:s=0.75,eq=brightness=-0.06", rulesIn: 'game', unit: true, tex: () => 512, /* без «кривой» (затемняла колёса в сплошной чёрный) и упрощения */ hinge: [0, 3.0, 3.7],
    groups: (c) => (c.size[2] > 5 && c.size[0] < 0.5 && c.min[1] > 3.3 ? 'missile' : c.min[1] > 2.95 && c.ctr[2] > 0.5 && c.ctr[2] < 4.2 && c.size[0] < 2 ? 'cradle' : 'body') }, // Sevom Khordad — 42manako: пустынный камуфляж → оливковый (у запада — трофейный); пусковая с 3 ракетами — без башни, ось у кормы
  // Oerlikon GDF 35 мм — из сцены Skyguard (lm9241221): одна из двух пушек (сцена в мм, пушка — в половину размера → ×0,002);
  // станок поворачивается, спарка со стволами и коробами — качается на цапфах; подложка, кабели, радар и вторая пушка — долой
  skyguard: { src: `${DL}/oerlikon_35mm_skyguard_radar.glb`, scale: 0.002, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, target: 80000, simpErr: 0.002, minPart: 0.06, hinge: [19.62, 1.45, -8.1],
    groups: (c) => {
      if (Math.abs(c.ctr[0] - 19.6) > 6 || Math.abs(c.ctr[2] + 7.2) > 6.8 || Math.max(...c.size) > 12) return null;
      const dx = c.ctr[0] - 19.62;
      // вся верхняя часть (спарка, короба, стволы с дульными тормозами) — качающаяся: по отдельности детали расходились в воздухе
      if (c.min[1] > 1.0 && Math.abs(dx) < 1.3) return 'cradle';
      return c.min[1] > 0.85 && Math.abs(dx) < 1.3 ? 'turret' : 'body';
    } },
  // Tracked Rapier — stealth86: пусковая на корме стоит ракетами назад — turretYaw разворачивает её в рабочее положение;
  // по бокам — балки с 8 ракетами (качаются), сзади — малая тарелка РЛС (крутится). Цвет авторов — жёлтый хаки → тёмно-зелёный
  rapier: { src: `${DL}/tracked_rapier.glb`, scale: 0.001373, nose: '+z', rulesIn: 'game', unit: true, tex: () => 512, texVf: "hue=h=48:s=0.75,curves=all='0/0 0.5/0.4 1/0.75'", simpErr: 0.002, camo: { scheme: 'uk', skip: /missile|metal|wire|rubber|Tracks|socket/ }, /* без упрощения (447 тыс.; вдали — rapier_lo) */
    hinge: [0, 0.21, 1.45], turretYaw: Math.PI, pack0: 0, instR: 0.12, absorb: 0.13, tplNear: [0.83, 0.02],
    colors: { '^missile$': [0.55, 0.55, 0.52], '^Tracks': [0.03, 0.03, 0.028], rubber: [0.02, 0.02, 0.02] },
    groups: (c) => {
      if (c.min[1] < -0.25 || c.ctr[2] < 0.6) return 'body';
      if (c.mat === 15) return 'missile';
      if (c.ctr[2] > 2.85 && Math.abs(c.ctr[0]) < 0.35 && c.ctr[1] > -0.1) return 'radar';
      return Math.abs(c.ctr[0]) > 0.6 ? 'cradle' : 'turret';
    } },
  osa: { src: `${DL}/osa-akm_sam_system.glb`, scale: 1, nose: '+z', rulesIn: 'game', unit: true, tex: () => 512, target: 110000, minPart: 0.06, absorb: 0, tplNear: [0.91, 0.14], hinge: [0, 3.06, 1.32], tube: [0.15, 0.5],
    groups: (c) => {
      if (c.min[1] < 2.05 || c.ctr[2] < -2.2 || c.ctr[2] > 3.4) return 'body';
      if (Math.abs(c.ctr[0]) > 0.75 && Math.abs(c.size[0] - 0.21) < 0.05 && c.size[2] > 2.4) return 'missile'; // 9М33 в решётчатых контейнерах
      { const r = Math.hypot(c.ctr[0], c.ctr[2] - 1.1); if ((c.min[1] > 4.1 && r < 1.3) || (c.min[1] > 4.0 && r < 0.6) || (c.min[1] > 3.95 && r < 0.3)) return 'radar'; } // антенна обзора, запросчик над ней и верх мачты — крутятся, пока РЛС работает
      return Math.abs(c.ctr[0]) > 0.75 && axis(c, [1.32, 3.06], [-0.906, 0.423], 0.55, -2.4, 2.8) ? 'cradle' : 'turret';
    } },
  patriot: { src: `${DL}/mim-104_patriot_surface-to-air_missile_sam.glb`, scale: 1, nose: '+x', rulesIn: 'game', unit: true, tex: () => 1024, hinge: [0, 3.95, 12.81], tube: [0.5, 1.2],
    groups: (c) => {
      if (c.size[1] > 3 && c.size[2] < 0.6 && c.size[0] < 0.6) return null; // мачта антенны: в модели стоит на поднятом пакете — у нас висела в воздухе
      if (Math.abs(c.ctr[0] + 1.33) < 0.35 && Math.abs(c.ctr[2] - 10.1) < 0.35 && c.ctr[1] > 4.2) return null; // и её крепёж: колпак наверху (≈ 10 м) и хомуты — без мачты висели в воздухе
      if (axis(c, [12.81, 3.95], [-0.781, 0.625], 1.25, -0.3, 10.8)) return 'cradle';
      if (c.min[1] > 4.5 && axis(c, [12.81, 3.95], [-0.781, 0.625], 2.2, 6, 11.5)) return 'cradle'; // рамка на верхнем (переднем) конце пакета — едет с пакетом (была «корпусом» и висела в воздухе)
      return c.min[1] > 2.4 && c.ctr[2] > 6.5 && c.ctr[2] < 13.6 && Math.abs(c.ctr[0]) < 1.6 ? 'turret' : 'body';
    } },
  // ── комплексы с ракетами на направляющих: ракета модели — образец для слотов и полёта (missile), stage — доля маршевой ступени
  s75: { src: `${DL}/sam_s-75_dvina.glb`, scale: 2.83, nose: '+x', rulesIn: 'game', unit: true, tex: () => 256, hinge: [0, 1.65, 4.06], stage: 0.64,
    groups: (c) => {
      if (axis(c, [5.61, 1.85], [-0.926, 0.376], 0.45, -0.6, 10)) return 'missile';
      if (c.min[1] > 0.5 && axis(c, [4.06, 1.65], [-0.926, 0.376], 0.7, -1.2, 9)) return 'cradle';
      return c.min[1] > 0.25 && c.ctr[2] > 0.3 && c.ctr[2] < 4.7 ? 'turret' : 'body';
    } },
  s125: { src: `${DL}/-125___sam_s-125_neva.glb`, scale: 1.26, nose: '+x', rulesIn: 'game', unit: true, tex: () => 512, target: 110000, hinge: [0, 1.13, -0.95], stage: 0.66,
    groups: (c) => {
      if (axis(c, [-1.05, 1.34], [-0.931, 0.366], 0.22, -0.4, 6.2) && c.size[0] < 0.9) return 'missile';
      if (c.ctr[2] < -0.6 && c.min[1] > 0.6 && axis(c, [-0.95, 1.13], [-0.931, 0.366], 1.0, -0.6, 6)) return 'cradle';
      return c.min[1] > 0.25 ? 'turret' : 'body';
    } },
  kub: { src: `${DL}/2k12_kub.glb`, scale: 0.00236, axes: (x, y, z) => [-x, z, y], rulesIn: 'game', unit: true, tex: () => 512, hinge: [0, 2.41, 1.05], // модель лежит «Z вверх»
    // без текстуры у модели только корпус: остальное светло-серое — ракеты и пусковая (оливковые), гусеницы, катки, люки
    colors: { '^Material__25$': [0.17, 0.17, 0.1], '^Material__30$': [0.03, 0.028, 0.025], '^Material__36$': [0.07, 0.08, 0.045], '^Material__29$': [0.09, 0.09, 0.055],
      '^Material__3[1-4]$': [0.1, 0.095, 0.06] },
    groups: (c) => {
      if (axis(c, [1.68, 2.58], [-0.844, 0.536], 0.2, -0.3, 6) && c.size[0] < 0.7 && c.max[1] - c.min[1] < 4 && !(c.size[0] < 0.12 && Math.hypot(c.size[1], c.size[2]) > 1)) return 'missile'; // прутья рамок — не ракета
      if (c.min[1] > 2.0 && axis(c, [1.05, 2.41], [-0.844, 0.536], 1.0, -0.6, 6)) return 'cradle';
      return c.min[1] > 1.8 && c.ctr[2] > -0.9 && c.ctr[2] < 2.0 && c.max[1] < 3 ? 'turret' : 'body';
    } },
  hawk: { src: `${DL}/mim-23_hawk_sam_air_defence_system_game-ready.glb`, scale: 0.012, nose: '+z', rulesIn: 'game', unit: true, tex: () => 512, target: 55000, hinge: [0, 1.77, -0.19],
    groups: (c) => {
      if (c.size[2] > 3.8 && axis(c, [-0.19, 1.77], [-0.985, 0.175], 1.2, -3.2, 3.6)) return 'missile';
      if (c.min[1] > 1.55 && axis(c, [-0.19, 1.77], [-0.985, 0.175], 1.3, -3.2, 3.6)) return 'cradle';
      return c.min[1] > 1.15 && c.ctr[2] > -0.7 && c.ctr[2] < 0.5 ? 'turret' : 'body';
    } },
  // M163 VADS — Gorgytz (CC BY; прежняя 42manako — из Lock On): сетка из STL без текстур и деталей — части по связности, краска своя
  m163: { src: `${DL}/m163.glb`, scale: 4.86 / 136.9, nose: '+x', rulesIn: 'game', unit: true, tex: () => 256, target: 320000, simpErr: 0.005, perTri: true, crease: 35, camo: { scheme: 'nato' }, /* 616 тыс. → 320 тыс. (вдали — m163_lo) */
    hinge: [-0.3, 2.3, -0.4 - 2.32], // цапфы пушки (оси игры, м; правила — до центровки: по длине −2,32): стволы — слева от оси башни, на высоте 2,3 м
    colors: { '#track': [0.03, 0.03, 0.028], '#gun': [0.035, 0.036, 0.034] }, // олива; гусеницы и пушка — тёмные
    groups: (c) => { // по треугольникам (сетка из STL — связных частей тысячи): пушка качается, башня с РЛС крутится, антенны — на корпусе
      const x = c.ctr[0], y = c.ctr[1], z = c.ctr[2] + 2.32; // z — от середины корпуса
      if (y > 2.02 && z < -0.3 && x < 0.5 && x > -1.0) return 'cradle#gun';
      if (y > 2.02 && Math.hypot(x, z - 0.15) < 1.45 && !(z > 0.95 && Math.abs(x) < 0.45)) return 'turret';
      return y < 0.75 && Math.abs(x) > 0.85 ? 'body#track' : 'body';
    } },
  m163_old: { src: `${DL}/m163_vads.glb`, scale: 0.393, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, hinge: [0, 3.44, -1.29],
    groups: (c) => {
      if (c.min[1] < 2.85 || c.ctr[2] > 0.15 || c.ctr[2] < -3.3) return 'body';
      return c.min[1] > 3.25 && c.ctr[2] < -1.35 ? 'cradle' : 'turret';
    } },
  // ЗСУ-23-4М «Шилка» — voron335 (CC BY; прежняя от Scout снята 2026-10-19: имена материалов — как в War Thunder, похоже на выгрузку из игры)
  zsu234: { src: `${DL}/zsu-23-4m.glb`, scale: 1.55, nose: '+x', unit: true, tex: () => 512, /* без упрощения (656 тыс.; вдали — zsu234_lo) */ // правила — в осях автора (y вверх, нос +x, ось z 5,37)
    hinge: [0.9, 6.92, 5.37], // цапфы автоматов — у лобового листа башни
    groups: (c) => (c.mat === 14 || c.mat === 15 ? null /* кормовые фонари без кронштейнов — висели в воздухе */ : c.min[1] > 7.0 && c.max[1] > 7.3 && c.ctr[0] < -0.3 && c.size[1] < 1 ? 'radar' /* антенна РЛС на корме башни — крутится */
      : c.min[1] > 6.7 && c.ctr[0] > 0.75 && Math.abs(c.ctr[2] - 5.37) < 0.42 && c.size[2] < 0.7 ? 'cradle' /* четыре автомата и маска */
      : c.min[1] > 6.7 && c.ctr[0] > -1.1 ? 'turret' : 'body') },
  // 9К35 «Стрела-10» на МТ-ЛБ — ScurvyWoof (CC BY; его же Roland): части не подписаны — по треугольникам: тумба пусковой крутится,
  // всё выше неё (контейнеры, блок датчиков) качается; цвета у автора — свои (оставляем)
  strela10: { src: `${DL}/mtlb_strela-10_low-poly.glb`, scale: 1.2, nose: '+z', rulesIn: 'game', unit: true, tex: () => 256, perTri: true, hinge: [0, 2.1, 0.91],
    camo: { scheme: 'soviet', skip: /Material\.00[45]$/ }, colors: { 'Material\\.00[45]$': [0.035, 0.035, 0.032] }, // у автора — ярко-зелёный «игрушечный»: камуфляж; гусеницы и катки тёмные
    groups: (c) => (c.ctr[1] > 2.08 ? 'cradle' : c.ctr[1] > 1.85 && Math.hypot(c.ctr[0], c.ctr[2] - 0.91) < 0.32 ? 'turret' : 'body') },
  // AN/TWQ-1 Avenger — KillCaptureDestroy (CC BY): 1,7 млн треугольников (шины — 0,4 млн) → 140 тыс.; материалы у автора белые — свои цвета.
  // Турель — на кузове сзади (центр x −1,92 в осях правил — по краям пакетов), пакеты «Стингеров» по бокам выше 2 м — качаются
  avenger: { src: `${DL}/antwq-1a1_avenger.glb`, scale: 9.34, nose: '+z', rulesIn: 'game', unit: true, crease: 35, /* пусковые были «смазаны» — сглаженные нормали через острые рёбра */ tex: () => 256, target: 450000, simpErr: 0.005, hinge: [-1.92, 2.38, 1.63], perTri: true, camo: { scheme: 'nato', skip: /tire|chrome|steel|glass|head_lights|paint_black/ }, /* 1,7 млн → 450 тыс. (вдали — avenger_lo) */
    colors: { tire: [0.02, 0.02, 0.02], paint_black: [0.015, 0.015, 0.015], 'chrome|steel': [0.22, 0.22, 0.21], head_lights: [0.6, 0.6, 0.55] },
    groups: (c) => { const X = c.ctr[0] + 1.92, Y = c.ctr[1], Z = c.ctr[2];
      if (Y > 2.05 && Math.abs(X) > 0.4 && Z > 0.7 && Z < 2.5) return 'cradle';
      return Y > 1.25 && Math.hypot(X, Z - 1.63) < 0.85 ? 'turret' : 'body'; } },
  // MIM-72 Chaparral (M730) — TankLord, Thingiverse (CC BY), модель для печати 1/100 (мм → ×0,1 м), Z вверх; пусковая поставлена в гнездо
  // шасси при переводе (stl2glb.js …Launcher.stl@0.31,-26.73,1.35). Шип пусковой внутри корпуса — выбросить; тумба над палубой крутится,
  // блок с четырьмя ракетами качается
  chaparral: { src: `${DL}/stl-glb/chaparral.glb`, scale: 0.1, axes: (x, y, z) => [-x, z, y], rulesIn: 'game', unit: true, tex: () => 256, perTri: true, crease: 35, camo: { scheme: 'nato', size: 1.1 }, /* без упрощения (270 тыс.; вдали — chaparral_lo); STL — сварка и сглаживание до 35° */
    hinge: [-0.035, 2.33, 0.075], turretYaw: Math.PI, colors: { '#msl': [0.55, 0.55, 0.52] }, // пусковая у автора смотрит назад; ракеты — белые
    groups: (c) => { if (c.mat === 0) return 'body'; if (c.ctr[1] < 1.36) return null; if (c.ctr[1] < 1.6) return 'turret';
      const ax = Math.abs(c.ctr[0]), y = c.ctr[1]; return ax > 0.72 && ax < 1.18 && ((y > 1.82 && y < 2.22) || (y > 2.42 && y < 2.82)) ? 'cradle#msl' : 'cradle'; } }, // ракеты — по двум рядам направляющих
  gepard: { src: `${DL}/flakpanzer_gepard__high-quality_model.glb`, scale: 0.024, nose: '+z', rulesIn: 'game', unit: true, tex: () => 512, hinge: [0, 2.31, 0.06], camo: { scheme: 'nato', skip: /glass|gun|track|net/ }, // без упрощения (142 тыс.); камуфляж Бундесвера
    // у модели нет текстур, цвета материалов — розовые и фиолетовые: красим в оливковый Бундесвера (RAL 6031), гусеницы и стволы — тёмные
    colors: { body: [0.065, 0.08, 0.042], turret: [0.065, 0.08, 0.042], gun: [0.04, 0.042, 0.04], net: [0.08, 0.09, 0.06], track: [0.06, 0.06, 0.055], glass: [0.35, 0.38, 0.4] },
    groups: (c) => {
      if (c.min[1] < 1.5 || c.ctr[2] < -3.9 || c.ctr[2] > 2.2 || Math.abs(c.ctr[0]) > 1.45 || (c.ctr[2] > 1.4 && Math.abs(c.ctr[0]) > 1.0)) return 'body'; // ящики на бортах корпуса — не башня
      // пушки (корпуса и стволы) по бортам башни качаются
      const gunX = Math.abs(c.ctr[0]) > 0.7 && Math.abs(c.ctr[0]) < 1.45 && c.ctr[1] > 1.95 && c.ctr[1] < 2.7;
      // пушка целиком (и мелкие детали ствола впереди цапф — дульные тормоза, кожухи) качается вместе
      if (c.min[1] > 2.82 && c.ctr[2] > 1.2 && Math.abs(c.ctr[0]) < 0.8) return 'radar'; // РЛС обзора сзади на башне — крутится (передняя — сопровождения, с башней)
      return gunX && (c.size[2] > 1.0 || c.ctr[2] < -0.3) ? 'cradle' : 'turret';
    } },
  nasams: { src: `${DL}/nasams_1_surface-to-air_missile_system.glb`, scale: 0.4, fwd: [0.174, 0.985], rulesIn: 'game', unit: true, perTri: true, tex: () => 512, hinge: [0, 1.16, 1.42], tube: [0.3, 0.9],
    groups: (c) => {
      if (axis(c, [1.42, 1.16], [-0.903, 0.43], 2.0, -1.6, 6) && (c.min[1] > 0.55 || (c.ctr[1] > 0.45 && Math.abs(c.ctr[0]) < 1.4)) && !(c.size[1] > 2 && c.size[2] < 0.3)) return 'cradle'; // и большие грани контейнеров, уходящие ниже 0,55 м (были «корпусом» — при повороте пакета застывали)
      if (Math.abs(c.ctr[0] - 1.3) < 0.35 && Math.abs(c.ctr[2] - 0.6) < 0.4 && c.ctr[1] > 0.6) return 'turret'; // мачта с антенной стоит на поворотной части — крутится с ней (не протыкает пакет)
      return c.min[1] > -0.1 && c.ctr[2] > -1.1 && c.ctr[2] < 1.2 && Math.abs(c.ctr[0]) < 1.0 && c.max[1] < 1.7 ? 'turret' : 'body';
    } },
  ew_w: { src: `${DL}/renault_trm_radar_truck.glb`, scale: 0.0097, nose: '+z', rulesIn: 'game', unit: true, tex: () => 256, groups: () => 'body' }, // станция РЭБ (запад)
  ew_e: { src: `${DL}/ibis150_air_defense_radar.glb`, scale: 10, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, target: 120000, minPart: 0.05, groups: () => 'body' }, // станция РЭБ (восток)
  // ── постройки для военных объектов (целей): земля y = 0, центр по габаритам
  obj_tanks: { src: `${DL}/large_industrial_storage_tanks.glb`, scale: 1, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, groups: () => 'body' }, // резервуар и газгольдеры
  obj_tank4: { src: `${DL}/low_poly_fuel_tank_4-x__pipe.glb`, scale: 4.4, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, target: 40000, groups: () => 'body' },
  obj_rtank: { src: `${DL}/rusty_airbase_fuel_tank.glb`, scale: 5, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, groups: () => 'body' },
  obj_hangar: { src: `${DL}/hangar.glb`, scale: 1.4, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, colors: { '#pad': [0.2, 0.2, 0.19], '#shed': [0.1, 0.11, 0.08] }, // у автора всё белое: подложка (бетон) и навес — свои цвета; на каждой карте — свои (city-render.js, objTint)
    groups: (c) => (c.size[1] < 0.05 && c.size[0] > 40 ? 'body#pad' : 'body#shed') },
  obj_jhangar: { src: `${DL}/j_type_hanger.glb`, scale: 1, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, groups: () => 'body' },
  obj_cont: { src: `${DL}/modular_containers_and_barrells_pack_game_ready.glb`, scale: 1.18, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, groups: () => 'body' },
  obj_milbase: { src: `${DL}/small_military_base.glb`, scale: 1.5, nose: '-z', rulesIn: 'game', unit: true, tex: () => 256, target: 40000, minPart: 0.15, groups: () => 'body' },
  obj_oldind: { src: `${DL}/old_industrial_building.glb`, scale: 0.01, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, target: 40000, groups: () => 'body' },
  obj_factory: { src: `${DL}/factory_low-poly.glb`, scale: 0.01, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, groups: () => 'body' },
  // дома города вблизи (вместо коробок): длинной стороной вдоль Z, основание y = 0
  bld_p5: { src: `${DL}/soviet_panelki__voxel_style_apartment_buildings.glb`, scale: 1.24, nose: '-z', rulesIn: 'game', unit: true, tex: () => 128, pickMesh: /Apartment\/Apartment_(?!Just)/, groups: () => 'body' }, // пятиэтажка
  bld_p9: { src: `${DL}/soviet_panel_house_built_in_the_1970s.glb`, scale: 1, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, groups: () => 'body' }, // длинная девятиэтажка
  bld_b12: { src: `${DL}/low_poly_-_soviet__apartment_building_8k.glb`, scale: 26, nose: '-z', rulesIn: 'game', unit: true, tex: () => 1024, groups: () => 'body' }, // многоэтажка
  bld_st: { src: `${DL}/old_soviet_apartment_building.glb`, scale: 13, nose: '-x', rulesIn: 'game', unit: true, tex: () => 1024, groups: () => 'body' }, // сталинка (фотоскан: упрощение рвёт развёртку)
  bld_t9: { src: `${DL}/9_storey_residential_building_updated.glb`, scale: 0.01, nose: '-z', rulesIn: 'game', unit: true, tex: () => 1024, groups: () => 'body' }, // точечная девятиэтажка (фото-текстуры)
  bld_a16: { src: `${DL}/apartment_building_house_gameready.glb`, scale: 1, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, groups: () => 'body' }, // 16-этажная «пластина» (упрощение рвёт развёртку)
  g_fortune: { src: `${DL}/fortune_tower.glb`, scale: 14, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, groups: () => 'body' }, // стеклянная башня
  g_amel: { src: `${DL}/amelinco_office_building.glb`, scale: 1, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, groups: () => 'body' }, // стеклянный офис со стилобатом
  o_tall: { src: `${DL}/high_rise_office_building.glb`, scale: 1, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, groups: () => 'body' }, // офисный корпус в 10 этажей (упрощение рвёт развёртку)
  // аэродромы: вышка КДП, топливозаправщик (надписи закрашены, жёлтый → оливковый), огни приближения (без фото-задника)
  af_atc: { src: `${DL}/air_traffic_control_tower.glb`, scale: 0.4, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, groups: () => 'body' }, // вышка ~36 м
  af_fuel: { src: `${DL}/airport_fuel_truck.glb`, scale: 0.022, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512,
    texVf: 'drawbox=x=78:y=830:w=228:h=100:color=0xFEDC00:t=fill,drawbox=x=490:y=470:w=22:h=140:color=0xFEDC00:t=fill,hue=s=0.4,colorchannelmixer=rr=0.46:gg=0.5:bb=0.4', groups: () => 'body' }, // ~9,5 м
  af_appr: { src: `${DL}/approach_lighting_system__runway_lights.glb`, scale: 0.018, nose: '-z', rulesIn: 'game', unit: true, tex: () => 256, groups: (c) => (c.mat === 0 || c.mat === 4 || c.tris > 3000 ? null : 'body') }, // огни приближения: стойка с планкой (без задника, лестницы и решётчатых мостков — упрощение рвёт)
  // улицы и село: остановки (городская, старая сельская), знаки «Главная дорога» / «Уступи дорогу», сарай, водонапорная башня,
  // комбайн СК-5 «Нива», трактор, заборы, вышки сотовой связи
  pr_bstop: { src: `${DL}/bus_stop.glb`, scale: 1, nose: '-z', rulesIn: 'game', unit: true, tex: () => 256, target: 3000, groups: () => 'body' },
  pr_rstop: { src: `${DL}/old_russian_bus_stop.glb`, scale: 1, nose: '-z', rulesIn: 'game', unit: true, tex: () => 256, groups: () => 'body' },
  sg_main: { src: `${DL}/soviet_road_signs_single_model_from_asset_pack.glb`, scale: 1, nose: '-z', unit: true, tex: () => 256, groups: (c) => (Math.abs(c.ctr[2] - 1.5) < 0.3 ? 'body' : null) },
  sg_yield: { src: `${DL}/soviet_road_signs_single_model_from_asset_pack.glb`, scale: 1, nose: '-z', unit: true, tex: () => 256, groups: (c) => (Math.abs(c.ctr[2] + 1.5) < 0.3 ? 'body' : null) },
  v_barn: { src: `${DL}/low_poly_barn.glb`, scale: 5, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, groups: () => 'body' },
  v_wtower: { src: `${DL}/weathered_water_tower.glb`, scale: 10, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, groups: () => 'body' },
  v_combine: { src: `${DL}/sk-5_niva.glb`, scale: 0.8, nose: '+z', rulesIn: 'game', unit: true, tex: () => 512, target: 5000, groups: () => 'body' },
  v_tractor: { src: `${DL}/tractor_low_poly.glb`, scale: 0.25, nose: '-z', rulesIn: 'game', unit: true, tex: () => 256, groups: () => 'body' },
  v_fence: { src: `${DL}/fence_wood.glb`, scale: 1, nose: '-z', rulesIn: 'game', unit: true, tex: () => 256, groups: () => 'body' },
  v_picket: { src: `${DL}/wood_wooden_fence_protector_of_the_farm_low_poly.glb`, scale: 0.0105, nose: '-z', rulesIn: 'game', unit: true, tex: () => 256, groups: () => 'body' },
  m_5g: { src: `${DL}/5g_telecommunications_mast.glb`, scale: 1.6, nose: '-z', rulesIn: 'game', unit: true, tex: () => 256, groups: () => 'body' },
  // частный сектор (вместо коробок со скатной крышей) и офис средней высоты
  h_brick: { src: `${DL}/low-poly_brick_house.glb`, scale: 2.4, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, groups: () => 'body' }, // кирпичный дом
  h_house: { src: `${DL}/house.glb`, scale: 0.08, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, groups: (c) => (c.size[0] > 16 || c.size[2] > 16 ? null : 'body') }, // одноэтажный дом (без участка земли)
  h_log: { src: `${DL}/cottage.glb`, scale: 0.12, nose: '-z', rulesIn: 'game', unit: true, tex: () => 256, simplify: 0.35, groups: () => 'body' }, // бревенчатый дом
  h_khata: { src: `${DL}/thatched_rural_houses.glb`, scale: 6, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, simplify: 0.3, pick: [-13.5, -0.5, -9, -3.2, 7, 6], groups: () => 'body' }, // хата под соломой (левая из двух; правая — амбар)
  o_block: { src: `${DL}/large_low_poly_building.glb`, scale: 0.01, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, groups: () => 'body' }, // офисный корпус
  h_shanty: { src: `${DL}/shanty__mansion__wooden.glb`, scale: 1, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, groups: () => 'body' }, // деревянный дом с верандой
  h_mobile: { src: `${DL}/lp_americans_house_mobile.glb`, scale: 1.25, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, target: 3000, groups: () => 'body' }, // дом-фургон
  // деревья вблизи (листья — вырезка по альфе) и фонарь
  tr_oak: { src: `${DL}/trees_low_poly.glb`, scale: 0.01, nose: '-z', rulesIn: 'game', unit: true, cutout: true, tex: () => 512, target: 1500, pickMesh: /tree4/, groups: () => 'body' },
  tr_lime: { src: `${DL}/trees_low_poly.glb`, scale: 0.012, nose: '-z', rulesIn: 'game', unit: true, cutout: true, tex: () => 512, target: 1200, pickMesh: /tree6/, groups: () => 'body' },
  tr_pine: { src: `${DL}/low_poly_forest_tree_pack.glb`, scale: 0.5, nose: '-z', rulesIn: 'game', unit: true, cutout: true, tex: () => 512, pickMesh: /(^|\/)(Tree_Branches_01|Tree_Trunk_01\.001)\//, groups: () => 'body' },
  tr_bush: { src: `${DL}/low_poly_forest_tree_pack.glb`, scale: 0.6, nose: '-z', rulesIn: 'game', unit: true, cutout: true, tex: () => 512, pickMesh: /(^|\/)(Tree_Branches_02|Tree_Trunk_02)\//, groups: () => 'body' },
  // зимний лес вблизи (CC BY, LOLIPOP: Realistic fir trees pack / Pine trees pack) — ели — LOD1 (LOD2 слишком редкая), сосны — LOD2; из них же импосторы
  w_fir1: { src: `${DL}/realistic_fir_trees_pack_lods_gameready.glb`, scale: 1, nose: '-z', rulesIn: 'game', unit: true, cutout: true, tex: () => 512, pickMesh: /\/Christmas tree_LOD1\//, cutoff: 0.3, groups: () => 'body' },
  w_fir3: { src: `${DL}/realistic_fir_trees_pack_lods_gameready.glb`, scale: 1, nose: '-z', rulesIn: 'game', unit: true, cutout: true, tex: () => 512, pickMesh: /\/Christmas tree_3_LOD1\//, cutoff: 0.3, groups: () => 'body' },
  w_pine1: { src: `${DL}/pine_trees_pack_lowpoly_game_ready_lods.glb`, scale: 1, nose: '-z', rulesIn: 'game', unit: true, cutout: true, tex: () => 512, pickMesh: /\/Pine_big_1_LOD2\//, cutoff: 0.35, groups: () => 'body' },
  w_pine2: { src: `${DL}/pine_trees_pack_lowpoly_game_ready_lods.glb`, scale: 1, nose: '-z', rulesIn: 'game', unit: true, cutout: true, tex: () => 512, pickMesh: /\/Pine_big_3_LOD2\//, cutoff: 0.35, groups: () => 'body' },
  p_lamp: { src: `${DL}/abandoned_street_lights_pack.glb`, scale: 1, nose: '-z', rulesIn: 'game', unit: true, tex: () => 256, target: 600, pickMesh: /(^|\/)pillar_01\//, groups: () => 'body' }, // фонарь с консолью
  // уличные мелочи (набор S1lMoon, автомат Kasugay, баки Glen Ortiz)
  pr_vend: { src: `${DL}/low-poly_urban_street_props_pack_ps1_style.glb`, scale: 1, nose: '-z', rulesIn: 'game', unit: true, tex: () => 256, pickMesh: /(^|\/)(SodaMachine|Glass)\//, groups: () => 'body' }, // автомат с газировкой
  pr_booth: { src: `${DL}/low-poly_urban_street_props_pack_ps1_style.glb`, scale: 1.1, nose: '-z', rulesIn: 'game', unit: true, tex: () => 256, pickMesh: /(^|\/)(Body|Door|Glass\.001|Glass_Side)\//, groups: () => 'body' }, // телефонная будка
  pr_bin: { src: `${DL}/low-poly_urban_street_props_pack_ps1_style.glb`, scale: 1, nose: '-z', rulesIn: 'game', unit: true, tex: () => 256, pickMesh: /(^|\/)(Tank\.002|Cap\.002)\//, groups: () => 'body' }, // урна
  pr_vend2: { src: `${DL}/psx_-_vending_machine.glb`, scale: 14, nose: '-z', rulesIn: 'game', unit: true, tex: () => 256, groups: () => 'body' }, // автомат
  pr_wbins: { src: `${DL}/garbage_bin.glb`, scale: 0.01, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, target: 3000, groups: () => 'body' }, // баки у дома
  // ── зенитные комплексы: unit — земля в y = 0, центр по корпусу; groups — корпус / башня (азимут) / пакет (угол места);
  // hinge — ось качания пакета в осях модели; simplify — доля треугольников после упрощения (meshoptimizer)
  // 9К37 «Бук» (колёсный, на шасси МЗКТ) — azlan (CC BY; 2026-10-19): одна текстура на всё; пусковая у автора поднята и смотрит назад
  buk: { src: `${DL}/buk_missile_system.glb`, scale: 1, nose: '-z', unit: true, tex: () => 1024, hinge: [0, 4.0, 4.7], // правила — в осях автора (кабина в −z, палуба y 3,4)
    groups: (c) => ((c.size[0] < 0.5 && c.size[1] > 4 && c.size[2] > 4.5) || (c.size[0] < 0.25 && c.ctr[1] > 4.5 && c.ctr[2] > 3.4 && Math.max(...c.size) < 2) ? 'missile' /* четыре 9М38 с крыльями */
      : c.min[1] > 3.5 && c.ctr[1] > 4.4 && c.ctr[2] > 1.5 && (c.size[0] > 2.5 || Math.abs(Math.abs(c.ctr[0]) - 1.5) < 0.1) ? 'cradle' /* пусковая рама и её цапфы */ : 'body') },
  // ЗУ-23-2 — LuckySkink9661 (CC BY; 2026-10-19), в боевом положении (колёса подняты); без упрощения (256 тыс.); правила — в осях автора
  // (стволы — в +x, платформа y 0,26–0,38): верхний станок с сиденьями крутится, качающаяся часть — спарка с магазинами на цапфах y 1,05
  zu23: { src: `${DL}/fdae5a37901941fea3a02578506072a3.glb`, scale: 1, nose: '+x', unit: true, tex: () => 512, hinge: [0.02, 1.05, 0],
    groups: (c) => (c.min[1] > 0.6 && c.ctr[0] > -0.45 && Math.abs(c.ctr[2]) < 0.45 ? 'cradle' : c.min[1] > 0.42 && Math.abs(c.ctr[2]) < 1.0 && c.ctr[0] > -2.0 ? 'turret' : 'body') },
  // Phalanx (наземный C-RAM «Центурион») — DenisGLabrecque (CC BY; 2026-10-19): тумба — корпус, вилка — башня, качается всё между
  // её щёк: пушка, магазин и купол РЛС (как у настоящего). Правила — в осях автора (стволы в +z, цапфы y 2,39)
  phalanx: { src: `${DL}/phalanx_ciws_close-in_weapons_system.glb`, scale: 1.15, nose: '+z', unit: true, tex: () => 256, hinge: [0, 2.39, 0], pack0: 0, /* стволы у автора горизонтальны (ось пакета по куполу считалась бы вертикальной) */
    groups: (c) => (Math.abs(c.ctr[0]) < 0.45 && c.ctr[1] > 1.6 ? 'cradle' /* с барабаном магазина под пушкой */ : c.min[1] > 1.0 ? 'turret' : 'body') },
  bukm3: { src: `${DL}/buk-m3_9k317_sam.glb`, scale: 1, nose: '+z', unit: true, tex: () => 512, minPart: 0.06, absorb: 0, hinge: [0, 2.6, -3.85],
    copyParts: [{ sel: (c) => c.mat === 12 && Math.abs(c.ctr[0] + 0.66) < 0.05 && Math.abs(c.ctr[1] - 4.6) < 0.05 && c.size[0] > 0.5, offs: [[0.6, 0, 0], [1.2, 0, 0]] }], // два недостающих нижних ТПК
    groups: (c) => {
      if (c.min[1] < 1.9) return 'body';
      if (c.size[0] > 0.27 && c.size[0] < 0.34 && c.size[1] > 3) return 'missile'; // 9М317 внутри контейнеров (сечение тоньше ТПК)
      const H = [-3.85, 2.6], A = [0.66, 0.75], dz = c.ctr[2] - H[0], dy = c.ctr[1] - H[1], along = dz * A[0] + dy * A[1], across = Math.abs(dz * A[1] - dy * A[0]);
      return across < 0.95 && along > 0.3 && along < 6.6 ? 'cradle' : 'turret';
    } },
  // ── вертолёты и вертолётное оружие (2026-10-20): лопасти — свои части rotor / rotor2 (несущий; вертикальная ось) и trotor (рулевой; поперечная ось), крутит models.js ──
  h_mi24: { src: `${DL}/mi24.glb`, scale: 1.018, fwd: [-0.5678, 0.8231], rulesIn: 'game', tex: () => 512, axisX: 1.16, centerBody: /^(rotor2?|trotor)$/, hubs: { rotor: [1.16, 4.17, -0.24], trotor: [0.53, 4.34, 10.56] }, // Ми-24 — manilov.ap: ось фюзеляжа x 1,16; Ø несущего 17,3
    groups: (c) => { const dx = c.ctr[0] - 1.17, dz = c.ctr[2] + 0.27, y = c.ctr[1];
      if (y > 3.6 && Math.hypot(dx, dz) < 9) return 'rotor'; // 5 лопастей, втулка и шарниры (оси — x 1,17, z −0,27, верх 4,17)
      if (y > 3 && c.ctr[2] > 9 && c.size[0] < 0.15) return 'trotor'; // рулевой винт (3 лопасти)
      if (Math.abs(dx) > 1.5 && y < 1.5 && ((c.size[2] > 1.3 && c.size[2] < 1.4 && c.size[0] < 0.6) || (c.size[0] < 0.1 && c.size[2] > 0.25 && c.size[2] < 0.3))) return null; // блоки НАР под консолями и их трубы (оружие — из игры)
      return 'body'; } },
  h_ah64: { src: `${DL}/ah64.glb`, scale: 1, minPart: 0.08, target: 75000, simpErr: 0.02, nose: '-x', rulesIn: 'game', tex: () => 512, axisX: 0.02, centerBody: /^(rotor2?|trotor)$/, hubs: { rotor: [0.02, 4.42, 0], trotor: [-1.0, 4.16, 8.84] }, // AH-64 — manilov.ap (1 : 1: Ø несущего 14,68, фюзеляж 14,96); хвостовой винт слева, 4 лопасти крестом
    groups: (c) => { const p = c.path;
      if (/\/ah62[1-4]-FACES|\/ah63-FACES/.test(p)) return 'rotor'; // 4 лопасти и головка
      if (/\/ah59[ab]-FACES/.test(p)) return 'trotor'; // лопасти рулевого винта (две пары крестом)
      if (/\/(ah12a\d*|ah13[ab]|ah14[ab]|ah15[A-Z]+|ah16[A-Z]+|ah70r\d*|ah71r\d*|ah86b\d*|ah89b\d*)-FACES/.test(p)) return null; // свой «Хеллфайр» (8), блоки НАР и ракеты на законцовках — оружие из игры
      return 'body'; } },
  h_uh1: { src: `${DL}/uh1.glb`, scale: 1.09, nose: '+z', rulesIn: 'game', tex: () => 512, axisX: 0, centerBody: /^(rotor2?|trotor)$/, hubs: { rotor: [0, 3.8, 0], trotor: [-0.44, 3.28, 7.97] }, // UH-1 — manilov.ap: Ø несущего 13,41 → 14,63 (×1,09); рулевой винт слева
    groups: (c) => { const [x, y, z] = c.ctr;
      if (y > 3.5 && Math.hypot(x, z) < 7) return 'rotor'; // 2 лопасти, стабилизирующая штанга с грузами и головка
      if (z > 6.7 && y > 2.6 && x < -0.3 && x > -0.62) return 'trotor'; // рулевой винт: 2 лопасти и ступица
      return 'body'; } },
  h_ah1: { src: `${DL}/bell_ah-1_supercobra.glb`, scale: 0.01026, nose: '+z', rulesIn: 'game', tex: () => 512, axisX: 0, centerBody: /^(rotor2?|trotor)$/, hubs: { rotor: [0.0, 4.5, -1.87], trotor: [0.44, 3.35, 7.12] }, // AH-1 SuperCobra — drcrazzie (единицы автора ×0,01026: Ø несущего 14,6, фюзеляж 13,8)
    groups: (c) => { const p = c.path;
      if (/CobraRotorMain(Blade|BladeRod|BladeMount|Parts)_Low/.test(p)) return 'rotor'; // 2 лопасти, тяги и втулка
      if (/CobraRotorTail(Blade|BladeRod|BladeParts|BladeMount)_Low/.test(p)) return 'trotor'; // рулевой винт (2 лопасти) с ярмом
      if (/CobraRocket_Low/.test(p)) return null; // блоки НАР под консолями — оружие из игры
      return 'body'; } },
  h_ka52: { src: `${DL}/pbr_kamov_ka-52.glb`, scale: 0.5052, nose: '-z', rulesIn: 'game', tex: () => 512, axisX: 0.0354, centerBody: /^(rotor2?|trotor)$/, hubs: { rotor: [0.0354, 4.522, 0], rotor2: [0.0354, 3.284, 0.025] }, // Ка-52 — Immersive3D (две кабины рядом — именно Ка-52; единицы автора ×0,5052 по Ø несущих 14,5); соосные винты: rotor — верхний, rotor2 — нижний; рулевого нет
    glassAny: /^Material\.012$/, glassColor: [0.3, 0.36, 0.42, 0.4],
    groups: (c) => { const k = 1 / 0.5052, p = c.path;
      if (/LOD0\.00[23]_/.test(p)) return null; // свои блоки НАР и 12 «Вихрей» с направляющими — оружие из игры (пилоны остаются)
      if (Math.hypot(c.ctr[0] * k - 0.07, c.ctr[2] * k) < 9.5 && c.size[1] * k < 3) { const y = c.ctr[1] * k; if (y > 7.8) return 'rotor'; if (y > 5.9) return 'rotor2'; } // верхний (y 8–10) и нижний (y 6–7,8) винты: по 3 лопасти и втулка
      return 'body'; } },
  h_mi28: { src: `${DL}/mi-28n_havoc.glb`, scale: 2.549, axes: (x, y, z) => [-x, -z, -y], rulesIn: 'game', tex: () => 512, axisX: 0, centerBody: /^(rotor2?|trotor)$/, hubs: { rotor: [0, 4.0, 0.41], trotor: [0.79, 3.04, 11.02] }, // Ми-28Н — Rukh3D (скинированный; оси автора: ось фюзеляжа Y, верх −Z; единицы автора ×2,549 по Ø несущего 17,2 — фюзеляж тогда 17,0 м); рулевой винт справа, 4 лопасти крестом
    glassAny: /^mirror$/,
    groups: (c) => { const p = c.path, k = 1 / 2.549, x = Math.abs(c.ctr[0]) * k, y = c.ctr[1] * k, z = c.ctr[2] * k;
      if (/\/Object_16$/.test(p)) return y > 1.78 ? 'body' : 'rotor'; // 5 лопастей и втулка (обтекатель РЛС над втулкой — неподвижный)
      if (/\/Object_18$/.test(p)) return 'trotor'; // рулевой винт (4 лопасти крестом)
      if (x > 0.55 && x < 1.05 && y > 0.35 && y < 0.65 && z > 0.3 && z < 0.9 && Math.max(...c.size) * k < 0.75) return null; // трубы и корпуса блоков НАР, малые направляющие под консолями — оружие из игры
      return 'body'; } },
  // ── вертолётное оружие (2026-10-20); центр габаритов в начале координат, нос в −Z, подвес — сверху ──
  w_shturm: { src: `${DL}/42c7dd424a064efebf3e63ebd423afbb.glb`, scale: 1.83 / 67.65, axes: (x, y, z) => [z, -y, x], tex: () => 256, pickMesh: /./, perTri: true, colors: { '': [0.09, 0.1, 0.075] }, groups: (c) => (Math.hypot(c.ctr[1] - 8.51, c.ctr[2] + 97.49) < 3.4 ? 'body' : null) }, // «Штурм» 9М114: ОДИН ТПК (труба; вторая и балка автора убраны), 1,83 м, перевёрнут — timurwolf
  w_b8: { src: `${DL}/2905fcb5f5fd4c7284adc362bcdc39d1.glb`, scale: 2.0 / 63.38, nose: '-x', tex: () => 256, pickMesh: /./, colors: { '': [0.07, 0.08, 0.055] } }, // блок НАР Б-8В20 (20 труб Ø 80 мм — по снимку именно Б-8, не Б-13) — timurwolf, 2,0 м
  w_lau61: { src: `${DL}/2905fcb5f5fd4c7284adc362bcdc39d1.glb`, scale: 1.7 / 63.38, axes: (x, y, z) => [-z * 0.82, y * 0.738, x], tex: () => 256, pickMesh: /./, colors: { '': [0.095, 0.118, 0.056] }, credit: 'адаптация под LAU-61' }, // блок Hydra 70 LAU-61 (19 труб Ø 70 мм) на сетке блока Б-8 (timurwolf): по осям отдельно — длина 1,7 м, сечение 0,4 × 0,4 м; олив NATO, надписей у автора нет (нет и текстур)
  w_hellfire: { src: `${DL}/sh60b_obj.glb`, scale: 1.63 / 59.28, nose: '-z', tex: () => 256, centerX: true, /* одна из четырёх AGM-114 на левой ЕССШ MH-60R — touka1212: тело, обтекатель, сопло, оперение и пояски; направляющая, замки и пилон не берутся */
    colors: { '#nose$': [0.03, 0.03, 0.03], '#yellow$': [0.55, 0.42, 0.02], '#brown$': [0.12, 0.06, 0.02], '': [0.095, 0.118, 0.056] },
    groups: (c) => { const [x, y, z] = c.ctr; if (!(x > -88 && x < -82.5 && y > 27 && y < 33.5 && z > -185 && z < -100)) return null; if (c.mat === 3 && y > 32.5) return null; // коробка одной ракеты; замки и полозки на спине — долой
      if (z < -166.5) return 'body#nose'; // носовой обтекатель головки
      if (c.size[2] < 0.5 && c.mat === 2) { if (Math.abs(z + 155.41) < 0.5) return 'body#yellow'; if (Math.abs(z + 128.5) < 0.5) return 'body#brown'; } // три пояска из плоских накладок: у БЧ — жёлтый, у двигателя — коричневый
      return 'body'; } },
  aam_stinger: { src: `${DL}/fim-92_stinger_low-poly.glb`, scale: 1.1875, nose: '+z', tex: () => 256, pickMesh: /./, dropMat: /^FIM-92_Stinger_1_Material/ }, // ракета FIM-92 Stinger (без трубы) — GoldbergR
  // ── Хеллоуин, осенняя карта «Туманная топь» (2026-10-20): постройки-цели obj_*, реквизит pr_* / c_vaz (все CC BY 4.0, Sketchfab); unit — земля y = 0, центр по корпусу.
  // skin — скинированные лопасти мельницы; ground — высота «земли» модели (м, после масштаба), если ниже подошвы уходит корень или основание
  obj_church: { src: `${DL}/church_-_abandoned.glb`, scale: 0.0367, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, pickMesh: /\/(Cube|Cylinder)_Material/, groups: () => 'body' }, // заброшенная церковь — reramil (рельеф-подложка автора убран)
  obj_mill: { src: `${DL}/windmill.glb`, scale: 0.0079, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, skin: true, pickMesh: /Cylinder011|Object_7$/, hubs: { sail: [0.022, 10.45, 4.26] }, // мельница — Tim0 (у автора две; взята первая), крылья на костях — свои части sail (вращение вокруг оси Z через ступицу hubs)
    groups: (c) => (/Object_7$/.test(c.path) ? 'sail' : 'body') },
  obj_barn: { src: `${DL}/old_wooden_barn_house_4.glb`, scale: 1.8, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, pickMesh: /./, groups: () => 'body' }, // сарай — narighillya (Blenderust)
  pr_hay: { src: `${DL}/hay_bales.glb`, scale: 1, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, pickMesh: /./, groups: () => 'body' }, // тюки сена — zbrojmistrz
  pr_well: { src: `${DL}/the_wishing_well.glb`, scale: 0.7, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, pickMesh: /./, groups: () => 'body' }, // колодец — jadenmercado57
  pr_pumpkin: { src: `${DL}/pumpkin.glb`, scale: 0.0293, nose: '-z', rulesIn: 'game', unit: true, tex: () => 256, pickMesh: /./, groups: () => 'body' }, // тыква Ø 0,6 м — FantasyDragon
  pr_grave1: { src: `${DL}/grave_stone_collection.glb`, scale: 0.01, nose: '+x', rulesIn: 'game', unit: true, tex: () => 256, pickMesh: /\/Grave2\//, groups: () => 'body' }, // надгробия — Kigha (единицы автора — см)
  pr_grave2: { src: `${DL}/grave_stone_collection.glb`, scale: 0.01, nose: '+x', rulesIn: 'game', unit: true, tex: () => 256, pickMesh: /\/Grave3\//, groups: () => 'body' },
  pr_grave3: { src: `${DL}/grave_stone_collection.glb`, scale: 0.01, nose: '+x', rulesIn: 'game', unit: true, tex: () => 256, pickMesh: /\/Grave1\//, groups: () => 'body' },
  pr_grave4: { src: `${DL}/grave_stone_collection.glb`, scale: 0.01, nose: '+x', rulesIn: 'game', unit: true, tex: () => 256, pickMesh: /\/Grave4\//, groups: () => 'body' },
  pr_fence: { src: `${DL}/cemetery_fence.glb`, scale: 0.2658, nose: '-z', rulesIn: 'game', unit: true, tex: () => 256, pickMesh: /Part_Open/, groups: () => 'body' }, // секция чугунной ограды (высокий и низкий прут + три перекладины) — CollinPatrick
  pr_fpost: { src: `${DL}/cemetery_fence.glb`, scale: 0.2658, nose: '-z', rulesIn: 'game', unit: true, tex: () => 256, pickMesh: /poll_Tall/, groups: () => 'body' }, // высокий прут — замыкает ряд секций
  pr_deadtree: { src: `${DL}/dead_tree.glb`, scale: 10.1, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, pickMesh: /./, groups: () => 'body' }, // сухое дерево — MaX3Dd
  pr_oldtree: { src: `${DL}/old_tree.glb`, scale: 1.62, nose: '-z', rulesIn: 'game', unit: true, ground: -0.08, tex: () => 512, pickMesh: /./, groups: () => 'body' }, // старое дерево — evolveduk (корни у автора ниже земли — зарыты)
  c_vaz: { src: `${DL}/vaz-2104_free.glb`, scale: 4.1 / 278.7, nose: '+z', rulesIn: 'game', unit: true, tex: () => 512, pickMesh: /./, groups: () => 'body' }, // ВАЗ-2104 — sMoKi (SevKa)
};
// ПВО: дальние копии (_lo) — main.js рисует их дальше 400 м (THREE.LOD по частям: корпус, башня, пакет)
const SAM_LO = ['osa', 'bukm3', 's125', 'gepard', 'ew_e', 's400', 'tor', 'pantsir', 'sampt', 'tunguska', 'skyguard', 'rapier', 'zsu234', 'm163', 'chaparral', 'avenger'];
for (const k of SAM_LO) CONFIG[k + '_lo'] = { ...CONFIG[k], target: k === 'tor' || k === 'pantsir' ? 15000 : 20000, simpErr: 0.05, tex: () => 256 };
// С-400 / С-300 (скан одной сеткой): с 20 тыс. и 256 px вдали — бугры и пятна, а их почти всегда видно дальше 400 м (карта, пульт)
CONFIG.s400_lo = { ...CONFIG.s400, target: 45000, simpErr: 0.02, tex: () => 512 };
// машины: дальние копии (_lo, ~1000 треуг.) — для движения на дорогах дальше 250 м
for (const k of ['compact', 'coupe', 'hatch', 'van', 'offroad', 'pickup', 'sedan', 'sport', 'suv', 'wagon', 'police']) CONFIG[`c_${k}_lo`] = { ...CONFIG[`c_${k}`], target: 1000, simpErr: 0.05, tex: () => 128 };
// дальние копии противника «Летки» (_lo): вдали тонкие крылья можно упрощать сильнее — дефектов не видно, а треугольников в разы меньше
for (const [k, t] of [['e_mig21', 3000], ['e_mig31', 9000], ['e_su57', 7000], ['e_tu22m3', 14000], ['e_gripen', 3000], ['e_f22', 4000], ['e_f35', 9000]]) CONFIG[k + '_lo'] = { ...CONFIG[k], target: t, simpErr: 0.05, tex: () => 256 };
// часть лежит вдоль оси пакета: H — петля (z, y), A — направление оси (z, y), across — полутолщина, along — от и до
function axis(c, H, A, across, a0, a1) { const dz = c.ctr[2] - H[0], dy = c.ctr[1] - H[1], al = dz * A[0] + dy * A[1]; return Math.abs(dz * A[1] - dy * A[0]) < across && al > a0 && al < a1; }
// оси модели → оси игры (x вправо, y вверх, нос в −Z)
const AX = { '+x': (x, y, z) => [z, y, -x], '+z': (x, y, z) => [-x, y, -z], '-z': (x, y, z) => [x, y, z], '-x': (x, y, z) => [-z, y, x] };

// нос задан вектором [fx, fz] в осях модели (модель лежит повёрнутой): вперёд → −Z, вправо → +X
const axFwd = ([fx, fz]) => { const l = Math.hypot(fx, fz); fx /= l; fz /= l; const rx = -fz, rz = fx; return (x, y, z) => [x * rx + z * rz, y, -(x * fx + z * fz)]; };
// cfg.skin — скинированные меши (лопасти мельницы на костях): позиции и нормали по позе покоя, как велит glTF (мировая матрица кости × обратная bind-матрица)
const m4mul = (a, b) => { const o = new Array(16).fill(0); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
const m4trs = (n) => { if (n.matrix) return n.matrix.slice(); const [x, y, z, w] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1], [tx, ty, tz] = n.translation || [0, 0, 0];
  return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0, 2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0, 2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1]; };
function skinPrims(g, prims) {
  const J = g.json, W = {}, walk = (i, M) => { const w = m4mul(M, m4trs(J.nodes[i])); W[i] = w; (J.nodes[i].children || []).forEach((c) => walk(c, w)); };
  J.scenes[J.scene || 0].nodes.forEach((r) => walk(r, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]));
  for (const p of prims) {
    const n = J.nodes[p.node]; if (n.skin === undefined) continue;
    const sk = J.skins[n.skin], ia = J.accessors[sk.inverseBindMatrices], ib = J.bufferViews[ia.bufferView], o0 = g.bin.byteOffset + (ib.byteOffset || 0) + (ia.byteOffset || 0);
    const ibm = new Float32Array(g.bin.buffer.slice(o0, o0 + ia.count * 64)), jm = sk.joints.map((j, k) => m4mul(W[j], Array.from(ibm.subarray(k * 16, k * 16 + 16))));
    const at = J.meshes[n.mesh].primitives[p.prim].attributes, JT = accessor(g, at.JOINTS_0).data, WT = accessor(g, at.WEIGHTS_0).data, P0 = accessor(g, at.POSITION).data, N0 = at.NORMAL !== undefined ? accessor(g, at.NORMAL).data : null;
    for (let v = 0; v < P0.length / 3; v++) {
      let x = 0, y = 0, z = 0, nx = 0, ny = 0, nz = 0;
      for (let c = 0; c < 4; c++) { const w = WT[v * 4 + c]; if (!w) continue; const M = jm[JT[v * 4 + c]], a = P0[v * 3], b = P0[v * 3 + 1], d = P0[v * 3 + 2];
        x += w * (M[0] * a + M[4] * b + M[8] * d + M[12]); y += w * (M[1] * a + M[5] * b + M[9] * d + M[13]); z += w * (M[2] * a + M[6] * b + M[10] * d + M[14]);
        if (N0) { const A = N0[v * 3], B = N0[v * 3 + 1], C = N0[v * 3 + 2]; nx += w * (M[0] * A + M[4] * B + M[8] * C); ny += w * (M[1] * A + M[5] * B + M[9] * C); nz += w * (M[2] * A + M[6] * B + M[10] * C); } }
      p.P[v * 3] = x; p.P[v * 3 + 1] = y; p.P[v * 3 + 2] = z;
      if (N0) { const l = Math.hypot(nx, ny, nz) || 1; p.N[v * 3] = nx / l; p.N[v * 3 + 1] = ny / l; p.N[v * 3 + 2] = nz / l; }
    }
  }
}
async function prepare(name, views) {
  const cfg = CONFIG[name], g = readGlb(Deno.readFileSync(cfg.src)), J = g.json, prims = flatten(g, { raw: !!cfg.raw }).filter((p) => (!cfg.pickMesh || cfg.pickMesh.test(p.path)) && !(cfg.dropMat && cfg.dropMat.test(((J.materials || [])[p.material] || {}).name || ''))) /* dropMat — материалы долой (линии рёбер SketchUp) */, ax = cfg.axes || (cfg.fwd ? axFwd(cfg.fwd) : AX[cfg.nose]);
  if (cfg.skin) skinPrims(g, prims);
  // rulesIn: 'game' — правила частей (groups / remove), hinge и просмотр — в осях игры (метры, нос в −Z, без центровки)
  if (cfg.rulesIn === 'game') for (const p of prims) {
    for (let i = 0; i < p.P.length; i += 3) { const v = ax(p.P[i], p.P[i + 1], p.P[i + 2]); p.P[i] = v[0] * cfg.scale; p.P[i + 1] = v[1] * cfg.scale; p.P[i + 2] = v[2] * cfg.scale; }
    if (p.N) for (let i = 0; i < p.N.length; i += 3) { const v = ax(p.N[i], p.N[i + 1], p.N[i + 2]); p.N[i] = v[0]; p.N[i + 1] = v[1]; p.N[i + 2] = v[2]; }
  }
  const tx = cfg.rulesIn === 'game' ? (x, y, z) => [x, y, z] : ax, tsc = cfg.rulesIn === 'game' ? 1 : cfg.scale;
  // copyParts — недостающие у автора детали копией соседних: [{ sel(c) — какие части (c: ctr, size, mat — в осях правил), offs: [[dx, dy, dz], …] }]
  // (у «Бука-М3» в двух колонках нет нижнего ТПК — копия нижнего из первой колонки со сдвигом)
  if (cfg.copyParts) for (const p of prims) {
    const { comp, list } = components(p.P, p.I, 0.001), want = new Map();
    for (const c of list) { c.ctr = c.max.map((v, k) => (v + c.min[k]) / 2); c.size = c.max.map((v, k) => v - c.min[k]); c.mat = p.material; c.path = p.path; for (const cp of cfg.copyParts) if (cp.sel(c)) want.set(c.id, cp.offs); }
    if (!want.size) continue;
    const P = [...p.P], N = p.N ? [...p.N] : null, UV = p.UV ? [...p.UV] : null, I = [...p.I];
    for (const [id, offs] of want) for (const o of offs) {
      const map = new Map();
      for (let t = 0; t < p.I.length / 3; t++) { if (comp[t] !== id) continue;
        for (let k = 0; k < 3; k++) { const v = p.I[t * 3 + k]; if (!map.has(v)) { map.set(v, P.length / 3); P.push(p.P[v * 3] + o[0], p.P[v * 3 + 1] + o[1], p.P[v * 3 + 2] + o[2]); if (N) N.push(p.N[v * 3], p.N[v * 3 + 1], p.N[v * 3 + 2]); if (UV) UV.push(p.UV[v * 2], p.UV[v * 2 + 1]); } I.push(map.get(v)); } }
    }
    p.P = Float32Array.from(P); if (N) p.N = Float32Array.from(N); if (UV) p.UV = Float32Array.from(UV); p.I = Uint32Array.from(I);
  }
  // --groups: только осмотр разбивки (в осях модели): корпус серый, башня красная, пакет синий, убранное не рисуется
  if (Deno.args.includes('--groups')) {
    const P = [], I = [], C = []; let b = 0, cnt = {};
    for (const p of prims) {
      const { comp, list } = components(p.P, p.I, 0.001), gid = new Map();
      for (const c of list) { c.ctr = c.max.map((v, k) => (v + c.min[k]) / 2); c.size = c.max.map((v, k) => v - c.min[k]); c.mat = p.material; c.path = p.path; gid.set(c.id, Math.max(...c.size) * tsc < (cfg.minPart || 0) ? null : cfg.groups ? cfg.groups(c) : 'body'); }
      if (Deno.env.get('LSALL')) for (const c of list) if (Math.max(...c.size) * tsc > +(Deno.env.get('LSALL') || 0.3) && c.min[1] > +(Deno.env.get('LSY') || -1e9)) console.log('  деталь', gid.get(c.id), 'мат', c.mat, 'ц', c.ctr.map((v) => v.toFixed(2)).join(' '), 'р', c.size.map((v) => v.toFixed(2)).join(' ')); // LSALL=0.3 LSY=2 — детали крупнее 0,3 м выше y=2
      for (const x of p.P) P.push(x);
      const triG = (t) => { if (!cfg.perTri) return gid.get(comp[t]); const c = { min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] }; for (let k = 0; k < 3; k++) { const v = p.I[t * 3 + k] * 3; for (let d = 0; d < 3; d++) { c.min[d] = Math.min(c.min[d], p.P[v + d]); c.max[d] = Math.max(c.max[d], p.P[v + d]); } } c.ctr = c.max.map((v, k) => (v + c.min[k]) / 2); c.size = c.max.map((v, k) => v - c.min[k]); return cfg.groups(c); };
      for (let t = 0; t < p.I.length / 3; t++) { const gname = triG(t); if (!gname) continue; cnt[gname] = (cnt[gname] || 0) + 1; I.push(p.I[t * 3] + b, p.I[t * 3 + 1] + b, p.I[t * 3 + 2] + b); C.push({ body: [175, 175, 180], turret: [215, 95, 85], cradle: [80, 105, 220], missile: [60, 190, 90] , radar: [235, 205, 40], rotor: [215, 95, 85], rotor2: [230, 150, 60], trotor: [80, 105, 220], mark: [235, 205, 40] }[String(gname).split('#')[0]]); }
      b += p.P.length / 3;
    }
    // RADROT=1.57 — антенну обзора повернуть вокруг её оси (как в игре: центр нижних 15 % по высоте) — видно, что не поехало с ней
    if (cfg.radarRaise && !Deno.env.get('NORAISE')) { const RC0 = [235, 205, 40], vs0 = new Set(); for (let t = 0; t < C.length; t++) if (C[t] && C[t][0] === RC0[0] && C[t][1] === RC0[1] && C[t][2] === RC0[2]) for (let k = 0; k < 3; k++) vs0.add(I[t * 3 + k]);
      const q = new Float32Array(vs0.size * 3), ids = [...vs0]; ids.forEach((v, j) => { q[j * 3] = P[v * 3]; q[j * 3 + 1] = P[v * 3 + 1]; q[j * 3 + 2] = P[v * 3 + 2]; });
      raiseX(q, null, cfg.radarRaise.hinge, cfg.radarRaise.angle); const o = cfg.radarRaise.offset || [0, 0, 0]; for (let j = 0; j < q.length; j += 3) { q[j] += o[0]; q[j + 1] += o[1]; q[j + 2] += o[2]; } ids.forEach((v, j) => { P[v * 3] = q[j * 3]; P[v * 3 + 1] = q[j * 3 + 1]; P[v * 3 + 2] = q[j * 3 + 2]; }); }
    if (Deno.env.get('RADROT')) {
      const RC = [235, 205, 40], vs = new Set(); for (let t = 0; t < C.length; t++) if (C[t] && C[t][0] === RC[0] && C[t][1] === RC[1] && C[t][2] === RC[2]) for (let k = 0; k < 3; k++) vs.add(I[t * 3 + k]);
      let y0 = 1e9, y1 = -1e9; for (const v of vs) { y0 = Math.min(y0, P[v * 3 + 1]); y1 = Math.max(y1, P[v * 3 + 1]); }
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const v of vs) if (P[v * 3 + 1] <= y0 + (y1 - y0) * 0.15) { x0 = Math.min(x0, P[v * 3]); x1 = Math.max(x1, P[v * 3]); z0 = Math.min(z0, P[v * 3 + 2]); z1 = Math.max(z1, P[v * 3 + 2]); }
      const ax = (x0 + x1) / 2, az = (z0 + z1) / 2, a = +Deno.env.get('RADROT'), c = Math.cos(a), sn = Math.sin(a);
      for (const v of vs) { const x = P[v * 3] - ax, z = P[v * 3 + 2] - az; P[v * 3] = ax + x * c + z * sn; P[v * 3 + 2] = az - x * sn + z * c; }
      console.log(`  антенна: ось x ${ax.toFixed(2)} z ${az.toFixed(2)}, повёрнута на ${a}`);
    }
    const dir = Deno.args[Deno.args.indexOf('--groups') + 1], mk = cfg.hinge ? [cfg.hinge] : [];
    const bb = bbox(Float32Array.from(P)); console.log(name, 'треугольников по группам', JSON.stringify(cnt), 'габариты', bb.mn.map((v) => v.toFixed(2)).join(' '), '…', bb.mx.map((v) => v.toFixed(2)).join(' '));
    for (const v of ['front', 'side', 'top']) writePpm(`${dir}/g_${name}_${v}.ppm`, render(Float32Array.from(P), Uint32Array.from(I), (t) => C[t], { view: v, w: +(Deno.env.get('GW') || 900), h: +(Deno.env.get('GH') || 520), marks: mk }));
    return;
  }
  const byMat = new Map(); let removed = 0;
  // dedupe — двойные грани SketchUp: две совпадающие плоскости (лицевая «белая» и обратная с текстурой) при двусторонней отрисовке
  // перебивают друг друга (белые пятна). Из совпадающих треугольников остаётся тот, у материала которого есть текстура (иначе — первый)
  const dup = new Map(); // prim → Set номеров треугольников долой
  if (cfg.dedupe) {
    // оценка материала: с текстурой — лучше, светлее и «белое» в имени — хуже (белая лицевая сторона SketchUp — заглушка)
    const score = (pi) => { const m = (J.materials || [])[prims[pi].material] || {}, pb = m.pbrMetallicRoughness || {}, f = pb.baseColorFactor || [1, 1, 1, 1];
      return (pb.baseColorTexture ? 2 : 0) + (1 - (f[0] + f[1] + f[2]) / 3) - (/white|^material(_\d+)?$/i.test(m.name || '') ? 1.5 : 0); };
    const best = new Map();
    const q = (v) => Math.round(v * 2000);
    prims.forEach((p, pi) => { for (let t = 0; t < p.I.length / 3; t++) {
      const k = [0, 1, 2].map((j) => { const v = p.I[t * 3 + j] * 3; return `${q(p.P[v])},${q(p.P[v + 1])},${q(p.P[v + 2])}`; }).sort().join('|');
      const cur = best.get(k);
      if (!cur) { best.set(k, [pi, t]); continue; }
      const [bi, bt] = cur, drop = score(pi) > score(bi) ? [bi, bt] : [pi, t];
      if (drop[0] === bi) best.set(k, [pi, t]);
      if (!dup.has(drop[0])) dup.set(drop[0], new Set()); dup.get(drop[0]).add(drop[1]);
    } });
    let n = 0; for (const v of dup.values()) n += v.size; console.log(`  двойных граней убрано: ${n}`);
  }
  for (const [pi, p] of prims.entries()) {
    let keep = null;
    if (cfg.pick) {
      const { comp, list } = components(p.P, p.I, 0.001), B = cfg.pick, sel = new Set();
      for (const c of list) { const ctr = c.max.map((v, k) => (v + c.min[k]) / 2); if (ctr.every((v, k) => v >= B[k] && v <= B[k + 3])) sel.add(c.id); }
      keep = (t) => sel.has(comp[t]);
    } else if (cfg.groups && cfg.perTri) {
      const gs = [], small = new Set();
      if (cfg.minPart) { const { comp, list } = components(p.P, p.I, 0.001); for (const c of list) if (Math.max(...c.max.map((v, k) => v - c.min[k])) * tsc < cfg.minPart) small.add(c.id); for (let t = 0; t < comp.length; t++) if (small.has(comp[t])) small.add(-1 - t); }
      for (let t = 0; t < p.I.length / 3; t++) {
        const c = { min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] };
        for (let k = 0; k < 3; k++) { const v = p.I[t * 3 + k] * 3; for (let d = 0; d < 3; d++) { c.min[d] = Math.min(c.min[d], p.P[v + d]); c.max[d] = Math.max(c.max[d], p.P[v + d]); } }
        c.ctr = c.max.map((v, k) => (v + c.min[k]) / 2); c.size = c.max.map((v, k) => v - c.min[k]); c.mat = p.material; c.path = p.path; gs.push(small.has(-1 - t) ? null : cfg.groups(c));
      }
      p.group = (t) => gs[t]; p.comp = Int32Array.from(gs, (g2) => (String(g2).split('#')[0] === 'cradle' ? 1 : 0)); keep = (t) => !!gs[t];
    } else if (cfg.groups) {
      const { comp, list } = components(p.P, p.I, 0.001), gid = new Map();
      // мелочь (болты, заклёпки, ручки) меньше minPart — долой: на упрощение она почти не поддаётся
      for (const c of list) { c.ctr = c.max.map((v, k) => (v + c.min[k]) / 2); c.size = c.max.map((v, k) => v - c.min[k]); c.mat = p.material; c.path = p.path; gid.set(c.id, Math.max(...c.size) * tsc < (cfg.minPart || 0) ? null : cfg.groups(c)); }
      p.group = (t) => gid.get(comp[t]); p.comp = comp; keep = (t) => !!gid.get(comp[t]);
      // glassPart(c) — эта часть — стекло, хоть материал у неё общий с другими (у Gripen «Glass» — и фонарь, и огни на крыле)
      if (cfg.glassPart) { const gs = new Set(list.filter((c) => cfg.glassPart(c)).map((c) => c.id)); p.glassT = (t) => gs.has(comp[t]); }
    } else if (cfg.remove) {
      const { comp, list } = components(p.P, p.I, cfg.scale < 0.1 ? 0.5 : 0.001), drop = new Set();
      list.forEach((c, i) => { c.size = c.max.map((v, k) => v - c.min[k]); c.ctr = c.max.map((v, k) => (v + c.min[k]) / 2); c.mat = p.material; c.path = p.path; if (cfg.remove(c, i)) drop.add(c.id); });
      keep = (t) => !drop.has(comp[t]);
    }
    // камуфляж: краска «#camo» — узор рисует игра (models.js, шейдер по координатам точки: пятна с ровными краями, не по
    // треугольникам сетки); в файле — основной цвет схемы. Части с краской «#…» и материалы из skip — без камуфляжа
    if (cfg.camo) { const g0 = p.group || (() => 'body'), mn = ((J.materials || [])[p.material] || {}).name || '', sk = cfg.camo.skip && cfg.camo.skip.test(mn);
      p.group = (t) => { const g = g0(t); return !g || sk || String(g).includes('#') ? g : g + '#camo'; }; }
    // cutZ: [z0, z1] — оставить треугольники с центром в этих пределах по длине (оси правил): головная часть ракеты и т. п.
    if (cfg.cutZ) { const k0 = keep, [z0, z1] = cfg.cutZ; keep = (t) => { if (k0 && !k0(t)) return false; for (let k = 0; k < 3; k++) { const z = p.P[p.I[t * 3 + k] * 3 + 2]; if (z < z0 || z > z1) return false; } return true; }; } // все три вершины внутри: длинные грани корпуса не торчат «иглами»
    const remaps = new Map();
    for (let t = 0; t < p.I.length / 3; t++) {
      if ((keep && !keep(t)) || (dup.has(pi) && dup.get(pi).has(t))) { removed++; continue; }
      // группа «часть#краска» (groups у моделей без текстур): своя краска части — цвет из cfg.colors по имени «материал#краска»
      const fg = !!(p.glassT && p.glassT(t)), g0 = p.group ? p.group(t) : 'body', [grp, paint] = String(g0).split('#'), key = `${g0}|${p.material}${fg ? '|g' : ''}`;
      let M = byMat.get(key); if (!M) byMat.set(key, M = { group: grp, paint, mat: p.material, forceGlass: fg, pos: [], nor: [], uv: [], idx: [], tc: [], hasUv: !!p.UV });
      let remap = remaps.get(key); if (!remap) remaps.set(key, remap = new Int32Array(p.P.length / 3).fill(-1));
      if (p.comp) M.tc.push(`${p.node}.${p.prim}:${p.comp[t]}`);
      for (let k = 0; k < 3; k++) {
        const v = p.I[t * 3 + k];
        if (remap[v] < 0) {
          remap[v] = M.pos.length / 3;
          const [x, y, z] = tx(p.P[v * 3], p.P[v * 3 + 1] - (cfg.centerY || 0), p.P[v * 3 + 2]);
          M.pos.push(x * tsc, y * tsc, z * tsc);
          const n = p.N ? tx(p.N[v * 3], p.N[v * 3 + 1], p.N[v * 3 + 2]) : [0, 1, 0]; M.nor.push(...n);
          if (M.hasUv) M.uv.push(p.UV ? p.UV[v * 2] : 0, p.UV ? p.UV[v * 2 + 1] : 0);
        }
        M.idx.push(remap[v]);
      }
    }
  }
  // renorm — нормали заново по треугольникам (у вывернутых граней SketchUp нормаль смотрит против обхода вершин — грань пересвечена)
  if (cfg.renorm) for (const m of byMat.values()) {
    const N = new Float64Array(m.pos.length);
    for (let i = 0; i < m.idx.length; i += 3) {
      const a = m.idx[i] * 3, b = m.idx[i + 1] * 3, c = m.idx[i + 2] * 3, P = m.pos;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const k of [a, b, c]) { N[k] += nx; N[k + 1] += ny; N[k + 2] += nz; }
    }
    for (let i = 0; i < N.length; i += 3) { const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1; m.nor[i] = N[i] / l; m.nor[i + 1] = N[i + 1] / l; m.nor[i + 2] = N[i + 2] / l; }
  }
  // crease: N° — у моделей из STL каждая вершина у треугольника своя (грани «плоские», файл огромный): сварить совпадающие
  // вершины и сгладить нормали между гранями с углом меньше N° (острые рёбра остаются острыми)
  if (cfg.crease) for (const m of byMat.values()) {
    const cosA = Math.cos(cfg.crease * Math.PI / 180), P = m.pos, I = m.idx, nT = I.length / 3, FN = new Float64Array(nT * 3);
    for (let t = 0; t < nT; t++) {
      const a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; FN[t * 3] = nx / l; FN[t * 3 + 1] = ny / l; FN[t * 3 + 2] = nz / l;
    }
    const q = 1e4, pk = new Map(), pid = new Int32Array(P.length / 3);
    for (let i = 0; i < pid.length; i++) { const k = Math.round(P[i * 3] * q) + ',' + Math.round(P[i * 3 + 1] * q) + ',' + Math.round(P[i * 3 + 2] * q); let id = pk.get(k); if (id === undefined) pk.set(k, id = pk.size); pid[i] = id; }
    const faces = Array.from({ length: pk.size }, () => []);
    for (let t = 0; t < nT; t++) for (let j = 0; j < 3; j++) faces[pid[I[t * 3 + j]]].push(t);
    const pos = [], nor = [], uv = [], idx = [], vm = new Map();
    for (let t = 0; t < nT; t++) for (let j = 0; j < 3; j++) {
      const v = I[t * 3 + j], p = pid[v]; let nx = 0, ny = 0, nz = 0;
      for (const f of faces[p]) if (FN[f * 3] * FN[t * 3] + FN[f * 3 + 1] * FN[t * 3 + 1] + FN[f * 3 + 2] * FN[t * 3 + 2] >= cosA) { nx += FN[f * 3]; ny += FN[f * 3 + 1]; nz += FN[f * 3 + 2]; }
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      const k = p + ':' + Math.round(nx * 64) + ',' + Math.round(ny * 64) + ',' + Math.round(nz * 64) + (m.hasUv ? ':' + Math.round(m.uv[v * 2] * 4096) + ',' + Math.round(m.uv[v * 2 + 1] * 4096) : '');
      let o = vm.get(k);
      if (o === undefined) { vm.set(k, o = pos.length / 3); pos.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); nor.push(nx, ny, nz); if (m.hasUv) uv.push(m.uv[v * 2], m.uv[v * 2 + 1]); }
      idx.push(o);
    }
    m.pos = pos; m.nor = nor; m.uv = uv; m.idx = idx;
  }
  // rotorR: { rotor: R } — лопасти растянуть по радиусу до реального Ø (у модели авторская ошибка: винт короче фюзеляжа); от ступицы (cfg.hubs, оси правил, метры):
  // втулка (10 % радиуса) не трогается, дальше длина растёт линейно, хорда — пропорционально (только x и z), высота лопастей и нормали — как были
  if (cfg.rotorR) for (const [g, R1] of Object.entries(cfg.rotorR)) {
    const h = cfg.hubs[g]; let R0 = 0; for (const m of byMat.values()) if (m.group === g) for (let i = 0; i < m.pos.length; i += 3) R0 = Math.max(R0, Math.hypot(m.pos[i] - h[0], m.pos[i + 2] - h[2]));
    const r0 = R0 * 0.1, k = (R1 - r0) / (R0 - r0); console.log(`  винт ${g}: радиус ${R0.toFixed(2)} → ${R1} м (растяжка ×${k.toFixed(3)})`);
    for (const m of byMat.values()) if (m.group === g) for (let i = 0; i < m.pos.length; i += 3) { const a = m.pos[i] - h[0], b = m.pos[i + 2] - h[2], r = Math.hypot(a, b); if (r <= r0) continue; const f = (r0 + (r - r0) * k) / r; m.pos[i] = h[0] + a * f; m.pos[i + 2] = h[2] + b * f; }
  }
  // центр: по длине — середина, по высоте — ось фюзеляжа (centerY) или середина габаритов; у комплексов — земля y = 0,
  // центр по корпусу
  const all = bbox(Float32Array.from([...byMat.values()].flatMap((m) => m.pos)));
  // centerBody (вертолёты): центр — по корпусу без винтов (части, чьи имена не подходят под шаблон), по высоте тоже; axisX — x оси фюзеляжа (в осях правил)
  const bodyB = cfg.unit ? bbox(Float32Array.from([...byMat.values()].filter((m) => m.group === 'body').flatMap((m) => m.pos))) : cfg.centerBody ? bbox(Float32Array.from([...byMat.values()].filter((m) => !cfg.centerBody.test(m.group)).flatMap((m) => m.pos))) : all;
  const dz = (bodyB.mn[2] + bodyB.mx[2]) / 2, dy = cfg.unit ? (cfg.ground !== undefined ? cfg.ground : all.mn[1]) : cfg.centerBody ? (bodyB.mn[1] + bodyB.mx[1]) / 2 : cfg.centerY !== undefined ? 0 : (all.mn[1] + all.mx[1]) / 2, dx = cfg.axisX !== undefined ? cfg.axisX : cfg.pick || cfg.pickMesh || cfg.unit || cfg.centerX ? (bodyB.mn[0] + bodyB.mx[0]) / 2 : 0;
  for (const m of byMat.values()) for (let i = 0; i < m.pos.length; i += 3) { m.pos[i] -= dx; m.pos[i + 1] -= dy; m.pos[i + 2] -= dz; }
  if (cfg.centerBody) {
    console.log(`  центровка: сдвиг ${[dx, dy, dz].map((v) => v.toFixed(3)).join(' ')} (из осей правил: точка − сдвиг = точка в модели)`);
    console.log(`  корпус без винтов: длина ${(bodyB.mx[2] - bodyB.mn[2]).toFixed(2)} м, ширина ${(bodyB.mx[0] - bodyB.mn[0]).toFixed(2)} м, высота ${(bodyB.mx[1] - bodyB.mn[1]).toFixed(2)} м`);
    for (const [g, h] of Object.entries(cfg.hubs || {})) { let R = 0; for (const m of byMat.values()) if (m.group === g) for (let i = 0; i < m.pos.length; i += 3) { const a = m.pos[i] - (h[0] - dx), b = m.pos[i + 1] - (h[1] - dy), c = m.pos[i + 2] - (h[2] - dz); R = Math.max(R, g === 'trotor' ? Math.hypot(b, c) : Math.hypot(a, c)); } if (R) console.log(`  винт ${g}: радиус ${R.toFixed(2)} м, Ø ${(2 * R).toFixed(2)} м`); }
  }
  if (cfg.groups && cfg.unit) articulate(cfg, byMat, [dx, dy, dz], cfg.rulesIn === 'game' ? (x, y, z) => [x / cfg.scale, y / cfg.scale, z / cfg.scale] : ax);
  SIMP_ERR = cfg.simpErr || 0.05; WELD = cfg.weld || 1e-4; CLUSTER = !!cfg.cluster;
  // target — бюджет треугольников (упрощение до него, но не дальше допустимой ошибки SIMP_ERR — форма не мнётся); simplify — доля
  if (cfg.target || cfg.simplify) {
    let total = 0; for (const m of byMat.values()) total += m.idx.length / 3;
    const ratio = cfg.target ? Math.min(1, cfg.target / total) : cfg.simplify;
    if (ratio < 0.98) await simplifyAll(byMat, ratio);
  }
  console.log(`${name}: убрано треугольников ${removed}; длина ${(all.mx[2] - all.mn[2]).toFixed(2)} м, размах ${(all.mx[0] - all.mn[0]).toFixed(2)} м, высота ${(all.mx[1] - all.mn[1]).toFixed(2)} м`);

  // материалы и текстуры
  const tmp = await Deno.makeTempDir(), chunks = [], views_ = [], accs = [], images = [], textures = [], materials = [], meshes = [], nodes = [];
  let off = 0;
  const add = (arr, target) => { const b = arr instanceof Uint8Array ? arr : new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength); chunks.push(b); const pad = (4 - (b.length % 4)) % 4; if (pad) chunks.push(new Uint8Array(pad)); views_.push({ buffer: 0, byteOffset: off, byteLength: b.length, ...(target ? { target } : {}) }); off += b.length + pad; return views_.length - 1; };
  const texCache = new Map(); let texBytes = 0;
  async function texture(ti, size, png = false) { // png — с прозрачностью (листья, вырезка по альфе)
    const key = `${ti}:${size}:${png}`; if (texCache.has(key)) return texCache.get(key);
    const im = J.images[J.textures[ti].source], bv = J.bufferViews[im.bufferView];
    const ext = im.mimeType === 'image/jpeg' ? 'jpg' : 'png';
    Deno.writeFileSync(`${tmp}/t.${ext}`, g.bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength));
    const of = png ? 'o.png' : 'o.jpg';
    let srcT = `${tmp}/t.${ext}`; // texVf — фильтр ffmpeg для перекраски (у прототипа Су-34 грунт жёлтый → серо-голубой строевой)
    const vf = typeof cfg.texVf === 'function' ? cfg.texVf(J.textures[ti].source) : cfg.texVf; // функция — свой фильтр у каждой картинки (по номеру в исходнике)
    if (vf) { await new Deno.Command('ffmpeg', { args: ['-loglevel', 'error', '-y', '-i', srcT, '-vf', vf, `${tmp}/f.png`] }).output(); srcT = `${tmp}/f.png`; }
    await new Deno.Command('sips', { args: png ? ['-s', 'format', 'png', '-Z', String(size), srcT, '--out', `${tmp}/${of}`] : ['-s', 'format', 'jpeg', '-s', 'formatOptions', '80', '-Z', String(size), srcT, '--out', `${tmp}/${of}`], stdout: 'null', stderr: 'null' }).output();
    const jpg = Deno.readFileSync(`${tmp}/${of}`); texBytes += jpg.length;
    images.push({ bufferView: add(jpg), mimeType: png ? 'image/png' : 'image/jpeg' }); textures.push({ sampler: 0, source: images.length - 1 });
    texCache.set(key, textures.length - 1); return textures.length - 1;
  }
  let tris = 0;
  for (const m of byMat.values()) {
    const mi = m.mat;
    if (!m.idx.length) continue;
    const src = (J.materials || [])[mi] || { name: 'default', pbrMetallicRoughness: {} }, sg = src.extensions && src.extensions.KHR_materials_pbrSpecularGlossiness;
    // spec/gloss (как у F/A-18): diffuse → baseColor
    const pbr = sg ? { baseColorFactor: sg.diffuseFactor, baseColorTexture: sg.diffuseTexture } : src.pbrMetallicRoughness || {};
    // cutout — полупрозрачное (листья на картах) рисуем вырезкой по альфе, с текстурой PNG; без него BLEND — стекло
    // стекло — только полупрозрачное с «стеклянным» именем (фонарь, окна, линзы): многие авторы ставят BLEND на всё подряд (гусеницы «Тора»,
    // корпус «Вербы», крыша хаты) — без этого правила такие части выходили белыми «стёклами» без текстуры. cfg.glass — свои имена стёкол
    const GLASS = /glass|стекл|canopy|window|visor|lens|fonar|фонар/i, nm = src.name || '';
    const blend = src.alphaMode === 'BLEND', solid = !!(cfg.opaque && cfg.opaque.test(nm));
    const glass = m.forceGlass || !!(cfg.glassAny && cfg.glassAny.test(nm)) || (blend && !solid && !cfg.cutout && (GLASS.test(nm) || !!(cfg.glass && cfg.glass.test(nm))));
    const cut = blend && !solid && !glass; // остальное полупрозрачное — вырезкой по альфе: заборы и наклейки сохраняют дыры, корпуса — текстуру
    // colors — свои цвета материалов по имени (у модели без текстур цвета бывают «служебные»)
    const nmP = (src.name || '') + (m.paint ? '#' + m.paint : '');
    const CL = cfg.camo ? { '#camo$': CAMO_BASE[cfg.camo.scheme], ...(cfg.colors || {}) } : cfg.colors;
    const own = CL && Object.entries(CL).find(([re]) => new RegExp(re).test(nmP));
    const mat = { name: nmP, doubleSided: true, pbrMetallicRoughness: { baseColorFactor: own ? [...own[1], 1] : pbr.baseColorFactor || [1, 1, 1, 1], metallicFactor: 0.3, roughnessFactor: 0.6 } };
    if (glass) mat.alphaMode = 'BLEND';
    if (m.forceGlass) mat.pbrMetallicRoughness.baseColorFactor = [0.3, 0.36, 0.42, 0.35]; // своё стекло — тонированное, полупрозрачное
    // стекло без своего цвета (белое непрозрачное по умолчанию) — тонированное; glassColor — свой цвет стекла модели (у F-35 — золотистый)
    if (glass && cfg.glassColor) mat.pbrMetallicRoughness.baseColorFactor = cfg.glassColor;
    else if (glass && !m.forceGlass && !pbr.baseColorFactor) mat.pbrMetallicRoughness.baseColorFactor = [0.3, 0.36, 0.42, 0.35];
    if (src.alphaMode === 'MASK' || cut) { mat.alphaMode = 'MASK'; mat.alphaCutoff = cfg.cutoff ?? src.alphaCutoff ?? 0.5; } // cutoff — свой порог (тонкая хвоя: ниже, чтобы не «облезала»)
    if (pbr.baseColorTexture && m.hasUv && !glass && !(cfg.noTex && cfg.noTex.test(nm))) /* noTex — без текстуры (растянутая по торцам выгорает) */ mat.pbrMetallicRoughness.baseColorTexture = { index: await texture(pbr.baseColorTexture.index, cfg.tex(src), mat.alphaMode === 'MASK') };
    materials.push(mat);
    const pos = new Float32Array(m.pos), b = bbox(pos), n = pos.length / 3, attrs = {};
    accs.push({ bufferView: add(pos, 34962), componentType: 5126, count: n, type: 'VEC3', min: b.mn, max: b.mx }); attrs.POSITION = accs.length - 1;
    accs.push({ bufferView: add(new Float32Array(m.nor), 34962), componentType: 5126, count: n, type: 'VEC3' }); attrs.NORMAL = accs.length - 1;
    if (mat.pbrMetallicRoughness.baseColorTexture) { accs.push({ bufferView: add(new Float32Array(m.uv), 34962), componentType: 5126, count: n, type: 'VEC2' }); attrs.TEXCOORD_0 = accs.length - 1; }
    const ix = n < 65536 ? Uint16Array.from(m.idx) : Uint32Array.from(m.idx);
    accs.push({ bufferView: add(ix, 34963), componentType: n < 65536 ? 5123 : 5125, count: m.idx.length, type: 'SCALAR' });
    // hubs: { rotor: [x, y, z], … } — центр втулки винта (в осях правил, до центровки): в extras меша — models.js вращает вокруг неё
    const hub = cfg.hubs && cfg.hubs[m.group];
    meshes.push({ name: `${m.group || 'body'}|${glass ? 'glass' : nmP}`, primitives: [{ attributes: attrs, indices: accs.length - 1, material: materials.length - 1 }], ...(hub ? { extras: { hub: hub.map((v, d) => +(v - [dx, dy, dz][d]).toFixed(4)) } } : {}) });
    nodes.push({ name: meshes[meshes.length - 1].name, mesh: meshes.length - 1 });
    tris += m.idx.length / 3;
  }
  const json = { asset: { version: '2.0', generator: 'fortuna airdef prepare.js' }, scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }], nodes, meshes, accessors: accs, bufferViews: views_,
    buffers: [{ byteLength: off }], images, samplers: [{ magFilter: 9729, minFilter: 9987 }], textures, materials };
  let js = new TextEncoder().encode(JSON.stringify(json)); const jp = (4 - (js.length % 4)) % 4; if (jp) js = new Uint8Array([...js, ...new Array(jp).fill(32)]);
  const total = 28 + js.length + off, glb = new Uint8Array(total), dv = new DataView(glb.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, js.length, true); dv.setUint32(16, 0x4e4f534a, true); glb.set(js, 20);
  let o = 20 + js.length; dv.setUint32(o, off, true); dv.setUint32(o + 4, 0x004e4942, true); o += 8;
  for (const c of chunks) { glb.set(c, o); o += c.length; }
  const dir = new URL('../../games/airdef/models/', import.meta.url).pathname; await Deno.mkdir(dir, { recursive: true });
  Deno.writeFileSync(`${dir}${name}.glb`, glb);
  console.log(`→ models/${name}.glb: ${(total / 1024).toFixed(0)} КБ (текстуры ${(texBytes / 1024).toFixed(0)} КБ, ${textures.length} шт.), материалов ${materials.length}, треугольников ${tris}`);
  if (views) {
    const P = [], I = []; let base = 0;
    for (const m of byMat.values()) { for (const x of m.pos) P.push(x); for (const k of m.idx) I.push(k + base); base += m.pos.length / 3; }
    for (const v of ['side', 'top', 'bottom', 'front', 'iso']) writePpm(`${tmp}/${name}_${v}.ppm`, render(Float32Array.from(P), Uint32Array.from(I), () => [190, 190, 196], { view: v, w: 900, h: 500 }));
    console.log('  виды:', tmp);
  }
}
// ── шарниры комплекса: башня — вокруг вертикали через центр её основания, пакет — вокруг оси hinge; пакет поворачивается
// так, чтобы его ось смотрела в −Z (угол места 0), — в игре его поднимает u.lel. Печатает данные для launchers.js.
// подъём сложенной антенны: поворот вокруг горизонтальной оси X через шарнир h (a > 0 — задняя часть уходит вверх)
function raiseX(pos, nor, h, a) {
  const c = Math.cos(a), s = Math.sin(a);
  for (let i = 0; i < pos.length; i += 3) { const dy = pos[i + 1] - h[1], dz = pos[i + 2] - h[2]; pos[i + 1] = h[1] + dy * c + dz * s; pos[i + 2] = h[2] - dy * s + dz * c; }
  if (nor) for (let i = 0; i < nor.length; i += 3) { const y = nor[i + 1], z = nor[i + 2]; nor[i + 1] = y * c + z * s; nor[i + 2] = -y * s + z * c; }
}
function articulate(cfg, byMat, shift, ax) {
  const sub = (p) => [p[0] - shift[0], p[1] - shift[1], p[2] - shift[2]];
  if (cfg.radarRaise) { const h = sub(ax(...cfg.radarRaise.hinge).map((v) => v * cfg.scale)); const o = cfg.radarRaise.offset || [0, 0, 0]; for (const m of byMat.values()) if (m.group === 'radar') { raiseX(m.pos, m.nor, h, cfg.radarRaise.angle); for (let i = 0; i < m.pos.length; i += 3) { m.pos[i] += o[0]; m.pos[i + 1] += o[1]; m.pos[i + 2] += o[2]; } } } // и сдвиг: на крышу башни
  const hinge = cfg.hinge ? sub(ax(...cfg.hinge).map((v) => v * cfg.scale)) : null;
  // ракеты на направляющих (группа missile) качаются вместе с пакетом
  const T = [...byMat.values()].filter((m) => m.group === 'turret' || m.group === 'radar'), K = [...byMat.values()].filter((m) => m.group === 'cradle' || m.group === 'missile');
  if (!T.length && !K.length) return; // машина целиком (станция РЭБ)
  // основание башни: нижние 0,5 м её вершин
  const T0 = T.filter((m) => m.group === 'turret'); // основание — по самой башне (антенна обзора ось не сдвигает)
  let y0 = 1e9; for (const m of T0) for (let i = 1; i < m.pos.length; i += 3) y0 = Math.min(y0, m.pos[i]);
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const m of T0) for (let i = 0; i < m.pos.length; i += 3) if (m.pos[i + 1] < y0 + 0.5) { x0 = Math.min(x0, m.pos[i]); x1 = Math.max(x1, m.pos[i]); z0 = Math.min(z0, m.pos[i + 2]); z1 = Math.max(z1, m.pos[i + 2]); }
  // башни нет (С-400) — ось поворота в петле пакета
  const tp = cfg.tpFix ? cfg.tpFix.slice() : T.length ? [(x0 + x1) / 2, y0, (z0 + z1) / 2] : hinge.slice(); // tpFix — ось башни задана (как печатается ниже), если расчёт её сдвигает
  // turretYaw — башня в модели развёрнута (пусковая смотрит вбок): поворачиваем башню, пакет и петлю вокруг вертикали
  // через центр основания башни в нулевое положение (как у three.js: x' = x·cos + z·sin, z' = −x·sin + z·cos)
  if (cfg.turretYaw) {
    const c = Math.cos(cfg.turretYaw), s = Math.sin(cfg.turretYaw);
    const ry = (a, i, o) => { const x = a[i] - o[0], z = a[i + 2] - o[2]; a[i] = o[0] + x * c + z * s; a[i + 2] = o[2] - x * s + z * c; };
    for (const m of [...T, ...K]) { for (let i = 0; i < m.pos.length; i += 3) ry(m.pos, i, tp); for (let i = 0; i < m.nor.length; i += 3) ry(m.nor, i, [0, 0, 0]); }
    if (hinge) ry(hinge, 0, tp);
  }
  if (!K.length) { for (const m of T) for (let i = 0; i < m.pos.length; i += 3) { m.pos[i] -= tp[0]; m.pos[i + 1] -= tp[1]; m.pos[i + 2] -= tp[2]; } let top = -1e9; for (const m of T) for (let i = 1; i < m.pos.length; i += 3) top = Math.max(top, m.pos[i]); console.log(`  шарниры: башня tp [${tp.map((v) => +v.toFixed(2))}], пакета нет, верх башни +${top.toFixed(2)} м`); return; }
  // ось пакета — главная компонента вершин в плоскости (z, y)
  let n = 0, mz = 0, my = 0; for (const m of K) for (let i = 0; i < m.pos.length; i += 3) { n++; my += m.pos[i + 1]; mz += m.pos[i + 2]; } my /= n; mz /= n;
  let szz = 0, syy = 0, syz = 0; for (const m of K) for (let i = 0; i < m.pos.length; i += 3) { const a = m.pos[i + 2] - mz, b = m.pos[i + 1] - my; szz += a * a; syy += b * b; syz += a * b; }
  const th = 0.5 * Math.atan2(2 * syz, szz - syy); let ez = Math.cos(th), ey = Math.sin(th); if (ez > 0) { ez = -ez; ey = -ey; } // ось — вперёд (−Z)
  const el0 = cfg.pack0 !== undefined ? cfg.pack0 : Math.atan2(ey, -ez), ce = Math.cos(el0), se = Math.sin(el0);
  for (const m of T) for (let i = 0; i < m.pos.length; i += 3) { m.pos[i] -= tp[0]; m.pos[i + 1] -= tp[1]; m.pos[i + 2] -= tp[2]; }
  const rot = (a, i, o) => { const y = a[i + 1] - o[1], z = a[i + 2] - o[2]; a[i] -= o[0]; a[i + 1] = y * ce + z * se; a[i + 2] = -y * se + z * ce; };
  for (const m of K) { for (let i = 0; i < m.pos.length; i += 3) rot(m.pos, i, hinge); for (let i = 0; i < m.nor.length; i += 3) rot(m.nor, i, [0, 0, 0]); }
  if (K.some((m) => m.group === 'missile')) { const f2 = (v) => +v.toFixed(2), cp2 = [hinge[0] - tp[0], hinge[1] - tp[1], hinge[2] - tp[2]].map(f2); console.log(`  шарниры: башня tp [${tp.map(f2)}], пакет cp [${cp2}] (от башни), угол пакета в модели ${(el0 * 57.3).toFixed(1)}°`); extractMissile(cfg, byMat); return; }
  // контейнеры: длинные цилиндры вдоль оси пакета (по частям меша) → центры слотов
  const parts = new Map();
  for (const m of K) for (let t = 0; t < m.idx.length / 3; t++) { const id = m.tc[t]; let b = parts.get(id); if (!b) parts.set(id, b = { mn: [1e9, 1e9, 1e9], mx: [-1e9, -1e9, -1e9] }); for (let k = 0; k < 3; k++) { const v = m.idx[t * 3 + k] * 3; for (let d = 0; d < 3; d++) { b.mn[d] = Math.min(b.mn[d], m.pos[v + d]); b.mx[d] = Math.max(b.mx[d], m.pos[v + d]); } } }
  if (Deno.args.includes('--debug')) for (const b of parts.values()) { const s2 = b.mx.map((v, d) => v - b.mn[d]); if (s2[2] > 2) console.log('   длинная часть', b.mn.map((v, d) => ((v + b.mx[d]) / 2).toFixed(2)).join(' '), 'размер', s2.map((v) => v.toFixed(2)).join(' ')); }
  const tubes = [];
  // контейнер — длинная часть с сечением 0,25–0,6 м; из перекрывающихся берётся самая «толстая» (корпус ТПК, а не ракета в нём)
  const [t0, t1] = cfg.tube || [0.25, 0.6];
  for (const b of parts.values()) { const s = b.mx.map((v, d) => v - b.mn[d]); if (s[2] > 1.2 && s[0] > t0 && s[0] < t1 && s[1] > t0 && s[1] < t1) tubes.push({ x: (b.mn[0] + b.mx[0]) / 2, y: (b.mn[1] + b.mx[1]) / 2, z: (b.mn[2] + b.mx[2]) / 2, len: s[2], r: Math.min(s[0], s[1]) / 2, a: s[0] * s[1] }); }
  const slots = []; for (const t of tubes.sort((a, b) => b.a - a.a)) if (!slots.some((q) => Math.hypot(q.x - t.x, q.y - t.y) < 0.25)) slots.push(t);
  slots.sort((a, b) => a.y - b.y || a.x - b.x);
  const f = (v) => +v.toFixed(2), cp = [hinge[0] - tp[0], hinge[1] - tp[1], hinge[2] - tp[2]].map(f);
  console.log(`  шарниры: башня tp [${tp.map(f)}], пакет cp [${cp}] (от башни), угол пакета в модели ${(el0 * 57.3).toFixed(1)}°`);
  console.log(`  контейнеры (${slots.length}): ${slots.map((t) => `[${f(t.x)}, ${f(t.y)}, ${f(t.z)}]`).join(', ')}; длина ${slots[0] ? f(slots[0].len) : '?'} м, радиус ${slots[0] ? f(slots[0].r) : '?'} м`);
}
// ракеты модели на направляющих: экземпляры — группы частей, перекрывающихся в сечении (x, y); первый — образец (центр в 0,
// нос в −Z), остальные выбрасываются, их центры — слоты. stage — доля маршевой ступени: хвост образца — отдельный ускоритель
function extractMissile(cfg, byMat) {
  const Ms = [...byMat.values()].filter((m) => m.group === 'missile'), parts = new Map();
  for (const m of Ms) for (let t = 0; t < m.idx.length / 3; t++) { const id = m.tc[t]; let b = parts.get(id); if (!b) parts.set(id, b = { id, mn: [1e9, 1e9, 1e9], mx: [-1e9, -1e9, -1e9] }); for (let k = 0; k < 3; k++) { const v = m.idx[t * 3 + k] * 3; for (let d = 0; d < 3; d++) { b.mn[d] = Math.min(b.mn[d], m.pos[v + d]); b.mx[d] = Math.max(b.mx[d], m.pos[v + d]); } } }
  // слияние частей в экземпляры по перекрытию сечений
  const L = [...parts.values()], par = L.map((_, i) => i), f = (i) => (par[i] === i ? i : (par[i] = f(par[i])));
  // экземпляры — по оси: центры сечений ближе 0,35 м; короткие куски (рули, крылья) потом — к ближайшей длинной ракете
  const ctr = (b) => [(b.mn[0] + b.mx[0]) / 2, (b.mn[1] + b.mx[1]) / 2];
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) { const a = ctr(L[i]), b = ctr(L[j]); if (Math.hypot(a[0] - b[0], a[1] - b[1]) < (cfg.instR || 0.35)) par[f(i)] = f(j); } // instR — ракеты стоят теснее 0,35 м
  const inst = new Map(); L.forEach((b, i) => { const r = f(i); let q = inst.get(r); if (!q) inst.set(r, q = { ids: new Set(), mn: [1e9, 1e9, 1e9], mx: [-1e9, -1e9, -1e9] }); q.ids.add(b.id); for (let d = 0; d < 3; d++) { q.mn[d] = Math.min(q.mn[d], b.mn[d]); q.mx[d] = Math.max(q.mx[d], b.mx[d]); } });
  let list = [...inst.values()].map((q) => ({ ...q, c: q.mn.map((v, d) => (v + q.mx[d]) / 2), len: q.mx[2] - q.mn[2] }));
  const maxLen = Math.max(...list.map((q) => q.len)), big = list.filter((q) => q.len > maxLen * 0.6);
  for (const q of list) if (!big.includes(q)) { let best = null, bd = 0.9; for (const b of big) { const d = Math.hypot(q.c[0] - b.c[0], q.c[1] - b.c[1]); if (d < bd) { bd = d; best = b; } } if (best) for (const id of q.ids) best.ids.add(id); }
  list = big.sort((a, b) => a.c[1] - b.c[1] || a.c[0] - b.c[0]);
  // образец — ближайший к tplNear [x, y] (если задан), иначе первый
  if (cfg.tplNear) list.sort((a, b) => Math.hypot(a.c[0] - cfg.tplNear[0], a.c[1] - cfg.tplNear[1]) - Math.hypot(b.c[0] - cfg.tplNear[0], b.c[1] - cfg.tplNear[1]));
  const tpl = list[0], zs = cfg.stage ? -tpl.len / 2 + tpl.len * cfg.stage : 1e9;
  // крылья и рули — отдельные детали пакета внутри габарита ракеты (короче половины её длины, ближе 0,9 м к оси) — к ракете;
  // у остальных экземпляров — долой вместе с ними
  const Ks = [...byMat.values()].filter((m) => m.group === 'cradle'), cb = new Map();
  for (const m of Ks) for (let t = 0; t < m.idx.length / 3; t++) { const id = m.tc[t]; let b = cb.get(id); if (!b) cb.set(id, b = { mn: [1e9, 1e9, 1e9], mx: [-1e9, -1e9, -1e9] }); for (let k = 0; k < 3; k++) { const v = m.idx[t * 3 + k] * 3; for (let d = 0; d < 3; d++) { b.mn[d] = Math.min(b.mn[d], m.pos[v + d]); b.mx[d] = Math.max(b.mx[d], m.pos[v + d]); } } }
  const owner = new Map();
  for (const [id, b] of cb) {
    const c = b.mn.map((v, d) => (v + b.mx[d]) / 2), len = b.mx[2] - b.mn[2];
    const R = cfg.absorb ?? 0.9; // радиус «прилипания» к ракете (0 — не присоединять: вокруг ракеты стенки контейнера)
    for (const q of list) if (b.mn[2] >= q.mn[2] - 0.05 && b.mx[2] <= q.mx[2] + 0.05 && len < q.len * 0.5 && Math.hypot(c[0] - q.c[0], c[1] - q.c[1]) < R) { owner.set(id, q); break; }
  }
  for (const m of Ks) { const I2 = [], T2 = []; for (let t = 0; t < m.idx.length / 3; t++) { const q = owner.get(m.tc[t]); if (q === tpl) { tpl.ids.add(m.tc[t]); } if (q) continue; I2.push(m.idx[t * 3], m.idx[t * 3 + 1], m.idx[t * 3 + 2]); T2.push(m.tc[t]); } m.wing = m.idx.filter((_, k) => owner.get(m.tc[Math.floor(k / 3)]) === tpl); m.wingTc = m.tc.filter((id) => owner.get(id) === tpl); m.idx = I2; m.tc = T2; }
  // крылья образца — как ещё одна «ракетная» часть того же материала
  for (const m of Ks) if (m.wing.length) Ms.push({ ...m, idx: m.wing, tc: m.wingTc });
  console.log(`  к ракетам присоединено деталей пакета: ${owner.size}`);
  const out = [];
  for (const m of Ms) {
    const keepT = [], boost = [];
    for (let t = 0; t < m.idx.length / 3; t++) {
      if (!tpl.ids.has(m.tc[t])) continue;
      const zc = (m.pos[m.idx[t * 3] * 3 + 2] + m.pos[m.idx[t * 3 + 1] * 3 + 2] + m.pos[m.idx[t * 3 + 2] * 3 + 2]) / 3 - tpl.c[2];
      (zc > zs ? boost : keepT).push(t);
    }
    for (const [grp, tris] of [['missile', keepT], ['booster', boost]]) {
      if (!tris.length) continue;
      const M = { group: grp, mat: m.mat, pos: [], nor: [], uv: [], idx: [], tc: [], hasUv: m.hasUv }, map = new Map();
      for (const t of tris) for (let k = 0; k < 3; k++) { const v = m.idx[t * 3 + k]; if (!map.has(v)) { map.set(v, M.pos.length / 3); M.pos.push(m.pos[v * 3] - tpl.c[0], m.pos[v * 3 + 1] - tpl.c[1], m.pos[v * 3 + 2] - tpl.c[2]); M.nor.push(m.nor[v * 3], m.nor[v * 3 + 1], m.nor[v * 3 + 2]); if (m.hasUv) M.uv.push(m.uv[v * 2], m.uv[v * 2 + 1]); } M.idx.push(map.get(v)); M.tc.push(m.tc[t]); }
      out.push(M);
    }
  }
  for (const [k, m] of byMat) if (m.group === 'missile') byMat.delete(k);
  out.forEach((m, i) => byMat.set(`${m.group}|${m.mat}|${i}`, m));
  const f2 = (v) => +v.toFixed(2), r = Math.max(tpl.mx[0] - tpl.mn[0], tpl.mx[1] - tpl.mn[1]) / 2;
  console.log(`  ракеты на направляющих (${list.length}): ${list.map((q) => `[${q.c.map(f2)}]`).join(', ')}; образец: длина ${f2(tpl.len)} м, размах ${f2(r * 2)} м${cfg.stage ? `, ускоритель — хвост ${f2(tpl.len * (1 - cfg.stage))} м` : ''}`);
}
// упрощение сетки: вершины свариваются по положению (швы UV не держат сетку), упрощается сваренная сетка, потом каждому
// углу треугольника возвращается исходная вершина — из той «островной» группы UV, где три угла ближе всего друг к другу
let SIMP_ERR = 0.05, WELD = 1e-4, CLUSTER = false;
async function simplifyAll(byMat, ratio) {
  await MeshoptSimplifier.ready;
  let before = 0, after = 0;
  for (const m of byMat.values()) {
    if (m.idx.length < 30) continue; // крошки не упрощаем
    const nv = m.pos.length / 3, wid = new Uint32Array(nv), key = new Map(), wpos = [], cand = [];
    for (let v = 0; v < nv; v++) {
      const k = `${Math.round(m.pos[v * 3] / WELD)},${Math.round(m.pos[v * 3 + 1] / WELD)},${Math.round(m.pos[v * 3 + 2] / WELD)}`;
      let w = key.get(k); if (w === undefined) { key.set(k, w = wpos.length / 3); wpos.push(m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2]); cand.push([]); }
      wid[v] = w; cand[w].push(v);
    }
    const widx = Uint32Array.from(m.idx, (v) => wid[v]); before += widx.length / 3;
    const target = Math.max(3, Math.floor(widx.length * ratio / 3) * 3);
    let [out] = MeshoptSimplifier.simplify(widx, Float32Array.from(wpos), 3, target, SIMP_ERR);
    // топология не дала упростить — кластеризация по сетке: вершины одной ячейки сливаются, вырожденные треугольники долой
    if (CLUSTER && out.length > target * 1.6) {
      let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let i = 0; i < wpos.length; i += 3) for (let d = 0; d < 3; d++) { lo[d] = Math.min(lo[d], wpos[i + d]); hi[d] = Math.max(hi[d], wpos[i + d]); }
      const ext = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1;
      for (let cell = ext * 0.004; cell < ext * 0.2 && out.length > target * 1.6; cell *= 1.35) {
        const rep2 = new Map(), map = new Uint32Array(wpos.length / 3);
        for (let v = 0; v < map.length; v++) { const k = `${Math.floor(wpos[v * 3] / cell)},${Math.floor(wpos[v * 3 + 1] / cell)},${Math.floor(wpos[v * 3 + 2] / cell)}`; let r = rep2.get(k); if (r === undefined) rep2.set(k, r = v); map[v] = r; }
        const seen = new Set(), next = [];
        for (let t = 0; t < out.length; t += 3) { const a = map[out[t]], b = map[out[t + 1]], c = map[out[t + 2]]; if (a === b || b === c || a === c) continue; const k = [a, b, c].sort((x, y) => x - y).join(','); if (seen.has(k)) continue; seen.add(k); next.push(a, b, c); }
        out = Uint32Array.from(next);
      }
    }
    const uvd = (a, b) => (m.hasUv ? Math.abs(m.uv[a * 2] - m.uv[b * 2]) + Math.abs(m.uv[a * 2 + 1] - m.uv[b * 2 + 1]) : 0);
    const map = new Int32Array(nv).fill(-1), P = [], N = [], U = [], I = [];
    for (let t = 0; t < out.length; t += 3) {
      const A = cand[out[t]], B = cand[out[t + 1]], Cc = cand[out[t + 2]];
      let best = [A[0], B[0], Cc[0]], bd = 1e9;
      if (A.length * B.length * Cc.length > 1) for (const a of A) for (const b of B) for (const c of Cc) { const d = uvd(a, b) + uvd(b, c) + uvd(a, c); if (d < bd) { bd = d; best = [a, b, c]; } }
      for (const v of best) { if (map[v] < 0) { map[v] = P.length / 3; P.push(m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2]); N.push(m.nor[v * 3], m.nor[v * 3 + 1], m.nor[v * 3 + 2]); if (m.hasUv) U.push(m.uv[v * 2], m.uv[v * 2 + 1]); } I.push(map[v]); }
    }
    if (Deno.args.includes('--debug')) console.log(`   ${m.group}|${m.mat}: ${widx.length / 3} → ${I.length / 3}`);
    m.pos = P; m.nor = N; m.uv = U; m.idx = I; after += I.length / 3;
  }
  console.log(`  упрощение: ${before} → ${after} треугольников`);
}
// --credits: авторы и лицензии всех исходников (из asset.extras Sketchfab) → games/airdef/models/credits.js и CREDITS.md
if (Deno.args[0] === '--credits') {
  const bySrc = new Map(), dir = new URL('../../games/airdef/models/', import.meta.url).pathname;
  for (const [name, cfg] of Object.entries(CONFIG)) {
    try { Deno.statSync(`${dir}${name}.glb`); } catch { continue; } // в игре только собранные
    const ck = cfg.src + (cfg.credit ? '|' + cfg.credit : ''); // credit — пометка об адаптации: отдельная запись титров (menu.js выводит её в названии)
    let e = bySrc.get(ck);
    if (!e) { const J = readGlb(Deno.readFileSync(cfg.src)).json, x = (J.asset && J.asset.extras) || {}; bySrc.set(ck, e = { title: (x.title || '') + (cfg.credit ? ` (${cfg.credit})` : ''), author: (x.author || '').replace(/ \(.*$/, ''), url: x.source || '', license: (x.license || '').replace(/ \(.*$/, ''), files: [] }); }
    e.files.push(name);
  }
  const list = [...bySrc.values()];
  Deno.writeTextFileSync(`${dir}credits.js`, `// Создано tools/airdef-models/prepare.js --credits — не править руками\nexport const CREDITS = ${JSON.stringify(list, null, 1)};\n`);
  Deno.writeTextFileSync(`${dir}CREDITS.md`, `# 3D-модели «Воздушного превосходства»\n\nВсе — с Sketchfab и Thingiverse (модели для печати — tools/airdef-models/stl2glb.js), лицензии указаны. Для игры изменены (tools/airdef-models/prepare.js): убраны лишние части, упрощены\nсетки, переведены в метры и развёрнуты, разделены на корпус / башню / пакет, текстуры уменьшены и пересжаты в JPEG.\n\n` +
    list.map((c) => `- "${c.title}" (${c.url}) by ${c.author} — ${c.license} — ${c.files.map((f) => '`' + f + '.glb`').join(', ')}`).join('\n') + '\n');
  console.log(`авторов ${list.length}, файлов ${list.reduce((n, c) => n + c.files.length, 0)}`);
  Deno.exit(0);
}
const names = Deno.args[0] === 'all' ? Object.keys(CONFIG) : [Deno.args[0]];
if (!CONFIG[names[0]]) { console.log('модели:', Object.keys(CONFIG).join(', '), '| all'); Deno.exit(1); }
for (const n of names) await prepare(n, Deno.args.includes('--views'));
