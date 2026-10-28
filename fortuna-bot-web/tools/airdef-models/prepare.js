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

// исходники моделей — ~/Downloads/Воздушное превосходство/Модели (Mark 2026-10-21: порядок в загрузках); свежескачанные, ещё не
// разложенные, ищутся прямо в ~/Downloads под тем же именем
const HOME = Deno.env.get('HOME'), DL = `${HOME}/Downloads/Воздушное превосходство/Модели`;
const srcOf = (p) => { try { Deno.statSync(p); return p; } catch { const q = p.replace(DL, `${HOME}/Downloads`); try { Deno.statSync(q); return q; } catch { return p; } } };
// перекраска: синие пиксели (синий заметно больше красного и зелёного) → оливковый той же яркости, остальное как было
const BLUE = 'gt(b(X,Y),r(X,Y)+25)*gt(b(X,Y),g(X,Y)+10)', LUM = '(0.3*r(X,Y)+0.59*g(X,Y)+0.11*b(X,Y))';
const OLIVE = `format=gbrp,geq=r='if(${BLUE},min(255,${LUM}*1.35),r(X,Y))':g='if(${BLUE},min(255,${LUM}*1.4),g(X,Y))':b='if(${BLUE},${LUM}*0.9,b(X,Y))'`;
const LS = (c) => { if (Deno.env.get('LS') && Math.max(...c.size) > Number(Deno.env.get('LSMIN') ?? 0.4)) console.log('  часть', c.mat, 'ц', c.ctr.map((v) => v.toFixed(2)).join(' '), 'р', c.size.map((v) => v.toFixed(2)).join(' ')); return 'body'; }; // LS=1 … --groups: список частей
// снять шасси и подвески автора: у оси (|dx| < dW) — части с центром ниже yF, дальше — свисающие ниже yW (по низу части);
// не больше smax; keep(c, d) — оставить (подфюзеляжные кили и т. п.). ax — x оси самолёта (до центровки)
const strip = (ax, yF, dW, yW, smax = 6.5, keep) => (c) => { const d = Math.abs(c.ctr[0] - ax), lo = c.ctr[1] - c.size[1] / 2;
  return Math.max(...c.size) < smax && (d < dW ? c.ctr[1] < yF : lo < yW) && !(keep && keep(c, d)) ? null : LS(c); };
// «Искандер» dofash_76: ракета на поднятой направляющей (ось в плоскости x–y исходника: от центра хвостовой заглушки (2,535; 3,05) к носу (0,77; 5,75), длина 3,2256 ед.);
// ISK_FLAT кладёт её вдоль −Z (нос вперёд) без крена, ISK_KZ — масштаб под 7,2 м («Кинжал»), ISK_CUT — граница головной части (~2 м) в осях правил
const ISK_N = [-1.765 / 3.2256, 2.70 / 3.2256], ISK_KZ = 7.2 / 3.2256;
const ISK_HY = 3.05 * 1.96, ISK_HZ = 2.535 * 1.96, ISK_UP = Math.atan2(-ISK_N[0], ISK_N[1]); // шарнир подъёма (хвост ракеты на направляющей, оси игры до центровки) и угол до вертикали (33,2°)
const ISK_FLAT = (x, y, z) => [-z, x * ISK_N[1] - y * ISK_N[0], -(x * ISK_N[0] + y * ISK_N[1])], ISK_CUT = -(0.77 * ISK_N[0] + 5.75 * ISK_N[1]) * ISK_KZ + 2.25;
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
const F35_GEAR = (c) => { const ax = Math.abs(c.ctr[0]), y = c.ctr[1], z = c.ctr[2];
  return (ax > 1.6 && ax < 2.8 && z > 4.4 && z < 6.2 && y < 3.3 && Math.max(...c.size) < 2.5) || (ax < 0.6 && z > -2.5 && z < -0.5 && y < 2.4); };
const A10_STORE = (c) => (c.mat === 16 && c.ctr[2] > -7.5) /* подвеска автора: бомбы, ракеты, контейнеры (дуло пушки впереди z < −7,5 — оставить) */ ||
  (Math.abs(c.ctr[0]) > 5.4 && c.ctr[1] < -0.3 && c.size[2] > 0.8) /* пластина-адаптер «Мейверика» на внешних пилонах */ ||
  (Math.abs(Math.abs(c.ctr[0]) - 3.62) < 0.1 && c.ctr[1] < -0.55 && c.size[2] > 0.5) /* рельсы под пилонами 3,6 м */ ||
  (Math.abs(c.ctr[0]) > 5 && c.ctr[0] !== 0 && c.mat !== 1 && Math.max(...c.size) < 0.5 && c.ctr[1] < -0.15 && ((c.ctr[2] > -2.2 && c.ctr[2] < -1.8) || (c.ctr[2] > 0.2 && c.ctr[2] < 0.45) || (Math.abs(Math.abs(c.ctr[0]) - 5.1) < 0.1 && c.ctr[2] > 0.6 && c.ctr[1] < -0.3))) /* остатки «Мейверика» на внешних пилонах */ ||
  (Math.abs(c.ctr[0]) > 3 && c.mat <= 1 && Math.max(...c.size) < 0.12 && c.ctr[1] < -0.5) /* крошки под пилонами */ ||
  (c.mat === 1 && c.ctr[2] > -6 && c.ctr[2] < -5.2 && Math.abs(c.ctr[0]) > 0.5 && c.ctr[1] - c.size[1] / 2 < -0.75); // передняя стойка шасси (выпущена у автора)
const CONFIG = {
  su30: { src: `${DL}/sukhoi_su-30_flanker_c.glb`, scale: 21.94 / 14.94, nose: '+x', rulesIn: 'game', tex: () => 1024, centerX: true,
    groups: (c) => (c.mat === 16 ? null : LS(c)) }, // Су-30МКИ — andertan (CC BY 4.0; прежняя модель Immersive3D): у автора чистый планер, без шасси и подвесок (пилоны рисует игра: station py); «Plumes» — диски выхлопа в соплах — долой (пламя рисует игра)
  f18: { src: `${DL}/boeing_fa-18ef_super_hornet.glb`, scale: 1, nose: '+x', tex: () => 512, glassAny: /^glass$/, glassColor: [0.42, 0.36, 0.2, 0.45], /* фонарь у автора непрозрачный */
    remove: (c) => c.max[1] < 0.12 && Math.abs(c.ctr[2]) > 2.5 }, // ракеты под крыльями и спарка (на концах крыльев — оставить)
  f16: { src: `${DL}/lockheed_martin_f-16ef_fighting_falcon.glb`, scale: 15.03 / 26.83, nose: '+x', rulesIn: 'game', tex: () => 512, centerX: true,
    glassAny: /^(Not_so_Dark|Darker_blue_hue_glass|Material\.003)$/, glassColor: [0.42, 0.36, 0.2, 0.45], /* фонарь у автора непрозрачный; у F-16 — золотистый */
    // F-16E/F — andertan (CC BY 4.0; прежняя модель Muhamad Mirza Arrafi): подвеска автора под крылом (баки, ракеты) долой — пилоны (материалы 14, 15) оставлены; на законцовках — свои ракеты, оставлены; шасси у автора нет
    groups: (c) => (Math.abs(c.ctr[0]) > 1.6 && Math.abs(c.ctr[0]) < 4.7 && c.ctr[1] < 0.12 && c.mat !== 14 && c.mat !== 15 ? null : LS(c)) },
  // оружие из моделей самолётов: pick — коробка [x0,y0,z0, x1,y1,z1] в осях модели, берутся части с центром внутри;
  // модель ставится центром габаритов в начало координат
  w_umpk: { src: new URL('./own/umpk.glb', import.meta.url).pathname, scale: 1, nose: '-z', tex: () => 512, nTex: () => 512, pickMesh: /./, own: true, groups: (c) => (c.size[0] > 0.9 && c.size[1] < 0.06 ? (c.size[0] > 2 ? 'wingA' : 'wingB') : 'body') }, // ФАБ-500 с УМПК: своя модель (Blender, own/umpk.glb); крылья-доски (размах 2,5 и ≈ 1 м) — свои части wingA / wingB: на подвеске сложены вдоль модуля, после сброса раскрываются (models.js, META wings: 'fold')
  // ── четвёртая партия (2026-10-19), без упрощения: ФАБ-100 и ОФАБ-250 — 4ikalka (мм / свои единицы, без текстур — оливковые),
  // ФАБ-250 — CATholic (текстура автора), ФАБ-1000 — United4192, GBU-24 и GBU-57 — Rhine_Lab_Muelsyse (US Weapon Pack)
  w_fab100: { src: `${DL}/fab-100-120.glb`, scale: 0.001 * 1.07 / 1.134, nose: '-x', tex: () => 256, pickMesh: /./, colors: { '': [0.07, 0.08, 0.055] } },
  w_ofab250: { src: `${DL}/ofab-250-270.glb`, scale: 1.48 / 21.06, nose: '-x', tex: () => 256, pickMesh: /./, colors: { '': [0.07, 0.08, 0.055] } },
  w_fab250: { src: `${DL}/fab-250_the_soviet_aviation_bomb.glb`, scale: 1.5 / 2.25, nose: '-x', tex: () => 256, pickMesh: /./ },
  w_fab1000: { src: `${DL}/fab-1000.glb`, scale: 3.35 / 4.58, nose: '-z', tex: () => 256, pickMesh: /./, colors: { '^Black|^Gray': [0.07, 0.08, 0.055], '^Brown': [0.12, 0.04, 0.02] } /* корпус и хвост — оливковые, поясок — тёмно-красный */ },
  w_gbu24: { src: `${DL}/Свои/GBU-24/gbu24_game.glb`, scale: 1, nose: '-z', tex: () => 512, pickMesh: /./, credit: 'окраска и запекание' }, /* без карты нормалей: сетка частая (24 тыс. мелких граней), three.js строит касательные по пикселям — на хвосте шли полосы */ // GBU-24 Paveway III — AnirudhRao (CC BY 4.0; Свои/GBU-24: 4,39 м, БЧ оливковая с жёлтым пояском, блок наведения и хвост серые — запечено 1024; прежняя — Rhine_Lab US Weapon Pack)
  w_gbu57: { src: new URL('./own/gbu57.glb', import.meta.url).pathname, scale: 1, nose: '-z', tex: () => 1024, nTex: () => 512, pickMesh: /./, own: true }, // GBU-57: своя модель (Blender, own/gbu57.glb)
  w_fab500: { src: new URL('./own/fab500.glb', import.meta.url).pathname, scale: 1, nose: '-z', tex: () => 512, nTex: () => 512, pickMesh: /./, own: true }, // ФАБ-500М-62: своя модель (Blender, own/fab500.glb)
  w_fab500_old: { src: `${DL}/fab-500_m62.glb`, scale: 17.6, nose: '+x', tex: () => 512, target: 8000, simpErr: 0.15, minPart: 0.15, pickMesh: /./, rulesIn: 'game', perTri: true, groups: (c) => (c.min[1] > FAB_TOP ? null : 'body') }, // без УМПК: всё выше корпуса долой
  w_kh31p: { src: new URL('./own/kh31p.glb', import.meta.url).pathname, scale: 1, nose: '-z', tex: () => 512, nTex: () => 512, pickMesh: /./, own: true }, // Х-31П: своя модель (Blender, own/kh31p.glb)
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
  w_pod: { src: `${DL}/anaaq-28v_lightning_fbx.glb`, scale: 1, nose: '+z', tex: () => 256, target: 9000, simpErr: 0.3, cluster: true, minPart: 0.03, pickMesh: /./, // LITENING — прицельный контейнер
    // файл — перезалив Jeyhun1985 «AN/AAQ-28(V) Lightning (FBX)»; автор модели — Vlad.Mojaev (CC BY 4.0, страница проверена 2026-10-24)
    orig: { title: 'RAFAEL AN/AAQ-28(V) Litening', author: 'Vlad.Mojaev', source: 'https://sketchfab.com/3d-models/rafael-anaaq-28v-litening-be90b1ca86bd46f4a87a86829d1e112c', license: 'CC-BY-4.0' } },
  w_gbu39: { src: `${DL}/gbu-39b_small_diameter_bomb_weapon_system.glb`, scale: 0.0496, axes: (x, y, z) => [x, -y, -z], /* нос из +Z в −Z и переворот: у автора крылья снизу — у настоящей SDB на спине */ tex: () => 512, pickMesh: /./,
    groups: (c) => (Math.abs(c.ctr[0]) > 3 && c.size[1] < 1 ? (c.ctr[0] > 0 ? 'wingA' : 'wingB') : 'body') }, // крылья — свои части (на подвеске сложены)
  w_gbu31: { src: `${DL}/mk82_jdam.glb`, scale: 3.88 / 15.69, nose: '-z', tex: () => 256, target: 9000, pickMesh: /./ }, // Mk 82 JDAM (FeriseCAT) в размер GBU-31 (3,9 м) (прежняя GBU-24 — из War Thunder)
  // трубы ПЗРК — перекрашены по фото настоящих и с запечённым затенением (Свои/ПЗРК_трубы/paint.py, исходники авторов те же, CC BY):
  // Stinger развёрнут (nose '-x'): у настоящего ложа с прицелом спереди, раструб сзади; коробка прицела перенесена на левую сторону трубы
  mp_stinger: { src: `${DL}/Свои/ПЗРК_трубы/mp_stinger_src.glb`, scale: 7.6 * 1.52 / 0.712, nose: '-x', tex: () => 512,   /* в настоящий размер: 1,52 м (было 0,71) */ pickMesh: /./, remove: (c) => c.ctr[0] < -0.05, credit: 'перекрашена, развёрнута',
    orig: { title: 'FIM-92 Stinger', author: 'Pan_Ar4ik', source: 'https://sketchfab.com/3d-models/fim-92-stinger-925d78a613e847fcb2e7a60d54d3404c', license: 'CC-BY-4.0' } }, // труба Stinger (ракета — отдельно)
  mp_verba: { src: `${DL}/Свои/ПЗРК_трубы/mp_verba_src.glb`, scale: 0.0774 * 1.63 / 2.826, nose: '+x', tex: (m) => (/PZRC|trigger/.test(m.name || '') ? 512 : 256), target: 7000,   /* 1,63 м (было 2,83); 512 — труба и спусковой блок */ pickMesh: /PZRC|battery|pen_|trigger|nab_|button|switch/ , credit: 'перекрашена',
    orig: { title: 'MANPADS model 9K333 Verba', author: 's-k_2005', source: 'https://sketchfab.com/3d-models/manpads-model-9k333-verba-d7e05be0f5384e93a96ca47d84f1da07', license: 'CC-BY-4.0' } }, // труба «Вербы»
  // расчёт ПЗРК (Mark 2026-10-27): наводчик с трубой на плече, второй номер показывает цель, ящик — своя сборка (Свои/Расчёт ПЗРК/build.py) на солдате buh,
  // ящик — Wooden Military Crate, Prabhjinder Singh, Poly Haven (CC0). Части уже в осях игры (без центровки): turret — тело наводчика, th0…5 — его головы,
  // ca0…5 — руки по позам угла места через 15°; turret1 и cs0…2 — второй номер и его рука. Оси — из build.py (оси_*.json); у запада форма песочная
  ...Object.fromEntries(['e', 'w'].map((sd) => ['crew_' + sd, { src: `${DL}/Свои/Расчёт ПЗРК/crew_${sd}.glb`, scale: 1, nose: '-z', rulesIn: 'game', unit: true, tex: () => 1024, nTex: () => 512, pickMesh: /./,
    axisX: 0, ground: 0, axisZ: 0, tpFix: [-0.5, 0.0, -0.0], hinge: [-0.393, 1.521, 0.201], pack0: 0, tp1: [1.4, 0.0, 0.9], hinge1: [1.177, 1.503, 1.001], credit: 'расчёт ПЗРК: позы — свои',
    orig: { title: 'Forest soldier (outdated)', author: 'buh', source: 'https://sketchfab.com/3d-models/forest-soldier-outdated-b265975196394070837366de9a0ddb7c', license: 'CC-BY-4.0' },
    groups: (c) => { const m = /(^|\/)(body|turret1|turret|th\d+|ca\d+|cs\d+)(\.\d+)?(\/|\||$)/.exec(c.path); return m ? m[2] : 'body'; } }])),
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
  e_f35: { src: `${DL}/lockheed_martin_f35_lightning_ii.glb`, scale: 4.94, nose: '+z', rulesIn: 'game', tex: () => 512, glassColor: [0.42, 0.36, 0.2, 0.45], /* фонарь — золотистый */
    // фото-текстуры автора (самолёт на фоне неба, на полу с сеткой) дают хромированный блеск и знаки — не берём; планер — матовое радиопоглощающее покрытие (FS 36170, линейный цвет ≈ 0,09 / 0,10 / 0,105), кромки и люки чуть светлее / темнее
    noTex: /^(Darkness|Darker_back|F35_up_text|f35_tail|F35_back|F135_engine)$/, /* F135_engine у автора — оперение (фото с «70 YEARS») */ colors: { '^F135_engine$': [0.088, 0.095, 0.1], '^Darkness$': [0.09, 0.10, 0.105], '^Darker_back$': [0.075, 0.082, 0.088], '^F35_up_text$': [0.105, 0.115, 0.12], '^f35_tail$': [0.085, 0.092, 0.097], '^F35_back$': [0.098, 0.108, 0.113] }, groups: (c) => (F35_GEAR(c) ? null : 'body'),
    glassPart: (c) => c.mat === 5 && c.ctr[1] > 2.4 && c.ctr[2] < 0 && c.size[1] > 0.5 }, // F-35A — andertan (CC BY 4.0; прежняя модель shangus930 — рип из мода DCS): без шасси, створок и их тяг; фонарь — стекло
  // ── противник «Летки» (2026-10-11): нос в −Z, метры; без шасси и подставки
  e_mig21: { src: `${DL}/mig-21_chibi.glb`, scale: 0.07, rulesIn: 'game', tex: () => 512, opaque: /mig21/, // «чиби»: стоял на подставке с креном ~10° — выравниваем
    axes: (x, y, z) => { const c = Math.cos(-0.174), s = Math.sin(-0.174); return [-x * c - y * s, -x * s + y * c, -z]; },
    groups: (c) => (c.size[2] > 14 || c.mat !== 2 ? null : c.ctr[1] < 0.98 && Math.max(...c.size) < 4.9 ? null : LS(c)) }, // длина 14,5 м // подставка, шасси и бак
  e_mig31: { src: `${DL}/b168fbca1f6c4ad0ad4e45b7a22f52bc.glb`, scale: 9.95, nose: '+x', rulesIn: 'game', tex: () => 512, glassColor: [0.3, 0.36, 0.42, 0.4], /* у автора почти чёрное и прозрачное на 90 % */ groups: (c) => (c.min[1] < -1.25 && Math.max(...c.size) < 2.5 ? null : 'body') }, // без шасси
  e_su57: { src: `${DL}/sukhoi_su-57_felon.glb`, scale: 7.42, nose: '-x', rulesIn: 'game', tex: () => 512, glass: /^Darkness\.001$/, groups: () => 'body' },
  e_tu22m3: { src: `${DL}/tu-22m3_backfire_c_3d_model.glb`, scale: 1.03 /* 41,3 → 42,5 м */, fwd: [-0.1236, 0.9923] /* модель повёрнута на ~7° вокруг вертикали: ось — по носовой и основным стойкам и оперению */, rulesIn: 'game', tex: () => 1024, centerX: true,
    // крыло у автора — сложено на 65° (передняя кромка ≈ 58°); консоли (мат. 4) поворачиваем вокруг шарнира вперёд до 30° (Mark): шарнир — 4,3 м от оси, z = 14,94 (оси правил, до центровки); размах 29,7 м — как у настоящего при 30°
    swing: { mat: 4, axisX: 0.89, pivot: [4.3, 14.94], ang: 28 * Math.PI / 180 },
    groups: (c) => ([6, 9, 31].includes(c.mat) || (c.mat === 30 && c.ctr[1] < -0.3) ? null : 'body') }, // Ту-22М3 — Real Slim Shady (CC BY 4.0; прежняя модель Jeyhun1985): шасси выпущено у автора — стойки, колёса и створки долой
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
  e_a10: { src: `${DL}/a-10_thunderbolt_ii.glb`, scale: 1.22, nose: '-z', rulesIn: 'game', tex: () => 1024, centerX: true, crease: 35, groups: (c) => (A10_STORE(c) ? (Deno.env.get('MARK') ? 'mark' : null) : 'body') }, // A-10 — AIRMAN Magazine (Alfredo Tirado), заготовка
  e_f15e: { src: `${DL}/mcdonnell_douglas_f-15e_strike_eagle.glb`, scale: 0.1044, axes: (x, y, z) => [-(0.9211 * x - 0.3894 * z), -0.1329 * x + 0.9399 * y - 0.3145 * z, -(0.366 * x + 0.3414 * y + 0.8657 * z)], /* у автора в полёте: курс 67°, тангаж 20° — главная ось (pca3.js); нос — в −Z */ rulesIn: 'game', tex: () => 256, target: 60000, simpErr: 0.02, centerX: true, // F-15E — Spark_Customs: без текстур — «ганшип грей»
    colors: { '#soot': [0.03, 0.028, 0.026], '': [0.1, 0.105, 0.115] } /* первое совпадение — его цвет: '' — последним */, perTri: true, // подвески автора (по треугольникам; правила до центровки: x −0,104, y −4,418, z +1,588): под крылом и под конформными баками
    groups: (c) => { const X = Math.abs(c.ctr[0] - 0.104), Y = c.ctr[1] - 4.418;
      if (Math.hypot(X - 0.71, Y + 1.35) < 0.4 && c.ctr[2] + 1.588 > 8.18) return 'body#soot'; // конусные заглушки в соплах (Mark: «может убрать?») — тёмные, как закопчённое сопло изнутри: удалить нельзя — за ними пусто, видно небо
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
  // ── пятая партия 2026-10-21 (CC BY 4.0): manilov.ap — Vulcan, Draken, Viggen (fwd по оси симметрии: симметрия облака вершин, нос — у конца с зондом, хвост — у киля);
  // United4192 — бомба 1000 lb. Без упрощения, текстуры 1024; шасси и подвески автора — долой
  e_vulcan: { src: `${DL}/avro698.glb`, scale: 0.93, nose: '-z', rulesIn: 'game', tex: () => 1024, centerX: true,
    groups: (c) => ((c.ctr[1] < -1.15 && Math.max(...c.size) < 2.0) || (c.ctr[1] < -1.1 && Math.min(...c.size) < 0.2 && Math.max(...c.size) < 4) ? null : LS(c)) }, // шасси выпущено: стойки, тележки, створки ниш — долой (гондолы двигателей в корне крыла и обтекатели — оставить)
  e_draken: { src: `${DL}/j35.glb`, scale: 1.006, fwd: [-0.7632, 0.6461], rulesIn: 'game', tex: () => 1024, texVf: 'hue=s=0.8' /* Mark 2026-10-21: бирюзовый камуфляж автора — «чуть-чуть убавь насыщенность» */, centerX: true, groups: () => 'body' }, // J35F: чистая модель (шасси убрано автором), длина 15,35 м
  e_viggen: { src: `${DL}/ja37.glb`, scale: 1.0, fwd: [-0.6659, 0.7461], rulesIn: 'game', tex: () => 1024, centerX: true, // ось — x −0,9 (до центровки): подфюзеляжный бак и его пилоны — долой
    groups: (c) => (c.ctr[1] < -0.7 && Math.abs(c.ctr[0] + 0.9) < 1.0 && c.ctr[2] > -2.4 && c.ctr[2] < -0.9 && Math.max(...c.size) > 2.0 ? null : LS(c)) },
  // собственные модели (Blender, Mark и Claude 2026-10-21) — исходники в tools/airdef-models/own (.blend и .glb), нос в −Z, метры
  w_nar_hydra: { src: new URL('./own/hydra70.glb', import.meta.url).pathname, scale: 1, nose: '-z', tex: () => 256, nTex: () => 256, pickMesh: /./, own: true }, // НАР Hydra 70 в полёте: Mk 66 + M151, 1,45 м, Ø 70 мм
  w_kh29t: { src: new URL('./own/kh29t.glb', import.meta.url).pathname, scale: 1, nose: '-z', tex: () => 512, nTex: () => 512, pickMesh: /./, own: true }, // Х-29Т: своя модель (Blender, own/kh29t.glb)
  w_nar_s8: { src: new URL('./own/s8.glb', import.meta.url).pathname, scale: 1, nose: '-z', tex: () => 256, nTex: () => 256, pickMesh: /./, own: true }, // НАР С-8КОМ в полёте: своя модель (Blender по чертежу и фото Wikimedia S-8_KOM_80_mm_rocket.jpg), 1,57 м, Ø 80 / 82 мм, 6 лопастей раскрыты, размах 384 мм
  w_lance: { src: new URL('./own/msl_lance.glb', import.meta.url).pathname, scale: 1, nose: '-z', tex: () => 512, nTex: () => 512, pickMesh: /./, own: true }, // MGM-52 Lance (ракета): своя модель (Blender, own/msl_lance.glb)
  w_arrw: { src: new URL('./own/arrw.glb', import.meta.url).pathname, scale: 1, nose: '-z', tex: () => 512, nTex: () => 512, pickMesh: /./, own: true }, // ARRW (AGM-183A): своя модель (Blender, own/arrw.glb)
  // PrSM: модель сборщика 4,24 м (по фото), настоящая — 3,96 м (×0,935); толще настоящей (0,50 против 0,43 м) — исправит сборщик во второй ревизии
  w_prsm: { src: new URL('./own/prsm.glb', import.meta.url).pathname, scale: 0.935, nose: '-z', tex: () => 512, nTex: () => 512, pickMesh: /./, own: true }, // PrSM: своя модель (Blender, own/prsm.glb)
  w_kh55: { src: new URL('./own/kh55.glb', import.meta.url).pathname, scale: 1, nose: '-z', tex: () => 512, nTex: () => 512, pickMesh: /./, own: true }, // Х-55: своя модель (Blender, own/kh55.glb)
  w_ecm_e: { src: new URL('./own/sorbtsiya.glb', import.meta.url).pathname, scale: 1, nose: '-z', tex: () => 512, nTex: () => 512, pickMesh: /./, own: true }, // Станция помех «Сорбция»: своя модель (Blender, own/sorbtsiya.glb)
  w_ecm_w: { src: new URL('./own/alq131.glb', import.meta.url).pathname, scale: 1, nose: '-z', tex: () => 512, nTex: () => 512, pickMesh: /./, own: true }, // Станция помех AN/ALQ-131: своя модель (Blender, own/alq131.glb); пока только значок
  w_bomb1000: { src: `${DL}/an-m65a1.glb`, scale: 0.4286, nose: '-z', tex: () => 256, pickMesh: /./ }, // AN-M65A1: Ø корпуса 1,12 → 0,48 м, длина 4,36 → 1,87 м
  // ── шестая партия 2026-10-21 (CC BY 4.0, Восток): andertan — Су-33, manilov.ap — М-4, МиГ-17 и Т-4, Tom Zimmermann — МиГ-19; без упрощения, текстуры 1024 ──
  e_su33: { src: `${DL}/d80603a8a13b49bda90f19d80cac61d4.glb`, scale: 1.45, nose: '+x', rulesIn: 'game', tex: () => 1024, centerX: true, groups: LS },
  e_m4: { src: `${DL}/65059c25184c48c5b6a1b9ac27d34db6.glb`, scale: 0.95, fwd: [-0.7009, 0.7133], rulesIn: 'game', tex: () => 1024, centerX: true, // ось — x 1,32 (с масштабом): без шасси (тележки, стойки, створки ниш — по оси; стойки и колёса на концах крыла; обтекатели концов — оставить)
    groups: (c) => { const d = Math.abs(c.ctr[0] - 1.32), m = Math.max(...c.size); return m < 2.5 && ((d < 1.3 && c.ctr[1] < -0.65 && c.ctr[2] > -9 && c.ctr[2] < 11) || (d > 20 && c.ctr[1] < -1.6)) || (d < 1.3 && c.ctr[1] < -1.5 && m < 6 && Math.abs(c.ctr[2]) > 6 && Math.abs(c.ctr[2]) < 12) ? null : LS(c); },
    addBoxes: [{ c: [0, -5.04, 7.6], s: [1.8, 0.1, 5.1] }, { c: [0, -5.04, -8.9], s: [1.8, 0.1, 4.8] }].map((b) => ({ ...b, paint: 'well' })) /* ниши шасси в брюхе (чёрные провалы) закрыты заглушками */, colors: { '#well$': [0.5, 0.53, 0.48] } },
  e_mig19: { src: `${DL}/mikoyan-gurevich_mig-19.glb`, scale: 0.4514, nose: '-z', rulesIn: 'game', tex: () => 1024, centerX: true, dropMat: /^aams$/, groups: LS },
  e_mig17: { src: `${DL}/mig17.glb`, scale: 1.01, fwd: [-0.7314, 0.6820], rulesIn: 'game', tex: () => 1024, centerX: true, dropMat: /^cmj/, // МиГ-17 — manilov.ap; пилот (cmj*) долой; ось — x −1,0: без шасси (материалы 4, 5, 24–26: стойки, колёса, створки) и подкрыльевых баков (20–22; пушки в носу — оставить)
    groups: (c) => ([4, 5, 24, 25, 26].includes(c.mat) || ([20, 21, 22].includes(c.mat) && Math.abs(c.ctr[0] + 1.0) > 1.4) ? null : LS(c)),
    addBoxes: [{ c: [1.5, -0.88, -1.9], s: [1.4, 0.08, 1.0], mirror: true, paint: 'well' }] /* ниши основных стоек в крыле (после шасси — чёрные провалы): заглушки в цвет низа крыла */, colors: { '#well$': [0.42, 0.45, 0.42] } },
  e_mig29k: { src: `${DL}/mig-29k.glb`, scale: 4.05, nose: '+x', rulesIn: 'game', tex: () => 1024, centerX: true, target: 60000, simpErr: 0.004, groups: () => 'body' }, // МиГ-29К — KoreanNavy (Blender, 247 тыс. треугольников после subdivision)
  e_t4: { src: `${DL}/1b9171a6210b427fb2493af3947b1c26.glb`, scale: 0.97, nose: '-x', rulesIn: 'game', tex: () => 1024, centerX: true, groups: LS },
  e_su27: { src: `${DL}/sukhoi_su-27_flanker.glb`, scale: 21.9 / 30.61, nose: '+x', rulesIn: 'game', tex: () => 512, centerX: true, groups: LS },
  e_su35: { src: `${DL}/sukhoi_su-35_flanker-e__-35.glb`, scale: 21.9 / 10.15, nose: '+x', rulesIn: 'game', tex: () => 512, centerX: true, groups: LS },
  e_etendard: { src: `${DL}/super-etendard.glb`, scale: 14.31 / 14.29, nose: '-x', rulesIn: 'game', tex: () => 512, centerX: true, groups: (c) => ((c.ctr[1] < -1.15 || (c.ctr[1] < -0.8 && Math.abs(Math.abs(c.ctr[0]) - 1.7) < 0.2)) && Math.max(...c.size) < 3 ? null : LS(c)) /* шасси и его стойки */ },
  e_mirage_f1: { src: `${DL}/dassault_mirage_f1.glb`, scale: 15.3 / 12.18, nose: '+z', rulesIn: 'game', tex: () => 512, centerX: true, camo: { scheme: 'fr', skip: /^(?!material_0$|Material\.198$)/ }, /* у автора корпус и крылья без цвета (белые) — двухтонный серо-голубой камуфляж (шейдер игры) */ groups: strip(0, -1.42, 1.2, -0.85, 4.5) /* шасси, баки, блоки НАР */ },
  e_f18c: { src: `${DL}/f18c_manilov.glb`, scale: 17.07 / 2383.09, nose: '+z', rulesIn: 'game', tex: () => 512, centerX: true,
    // F/A-18C — manilov.ap «F18» (CC BY 4.0; прежняя модель Rhine_Lab_Muelsyse): окраска у автора — условные белые материалы без текстур, делаем светло-серый (FS 36375) и тёмную кабину; фонарь — стекло; фигура пилота (Poser, материалы 42–54), ракеты на подфюзеляжных станциях и шасси долой (пилоны под крылом рисует игра); ракеты на законцовках — автора, оставлены
    glassAny: /^VIFS06-FACES$/, glassColor: [0.42, 0.36, 0.2, 0.45],
    colors: { '^VIFS(18|20|38|16|13|34|22|15|19|17|31|11|24|14|21|42)-FACES$': [0.5, 0.52, 0.54], '^VIFS(07|08)-FACES$': [0.04, 0.045, 0.05], '^VIFS(12|10|43)-FACES$': [0.16, 0.17, 0.18], '^VIFS(40|02|39|37|35|09|23|41)-FACES$': [0.45, 0.47, 0.49] },
    groups: (c) => (c.mat >= 42 || [17, 19, 21, 23, 25].includes(c.mat) || (c.mat === 41 && c.ctr[1] < -0.3 && Math.abs(Math.abs(c.ctr[0] + 1.31) - 1.17) < 0.1) ? null : LS(c)) },
  e_su24_old: { src: `${DL}/russian_su-24.glb`, scale: 0.0543, nose: '-z', rulesIn: 'game', tex: () => 512, // (42manako — не использовать: из мода BF2)
    groups: (c) => (c.ctr[1] < -0.4 && Math.abs(c.ctr[0]) < 2.2 && Math.max(...c.size) < 1.9 && !(c.size[2] > 1.5 && c.size[1] < 0.3) && ((c.ctr[2] > 1.6 && c.ctr[2] < 4.7) || (c.ctr[2] > -5.7 && c.ctr[2] < -3.2)) ? null : LS(c)) }, // шасси и створки (пилоны под фюзеляжем — оставить)
  e_su25: { src: `${DL}/su25_mamontnikita.glb`, scale: 15.53 / 319.34, nose: '+z', rulesIn: 'game', tex: () => 512, centerX: true,
    // Су-25 — mamont nikita (CC BY 4.0; прежняя модель Immersive3D): шасси выпущено у автора — стойки, колёса и створки (всё ниже y 1,15 в осях правил, по треугольникам: части между собой не разделены) долой; пилоны (5 на крыло) и подвесные контейнеры на законцовках — оставлены, подвески у автора нет
    perTri: true, groups: (c) => (c.ctr[1] < 1.15 ? null : 'body') },
  // Су-34 — manilov.ap (CC BY 4.0, 2026-10-24; прежняя модель 42manako — «Not my original model»): оси самолёта совпадают с осями файла (нос +z), без упрощения (57 тыс.);
  // длина 23,34 м по оси (с штангой ПВД). Без шасси (по материалам стоек и колёс; створки и мелочь ниже оси — мельче 2,2 м; гондолы двигателей — крупные, остаются); рельсы под крылом — оставлены как пилоны
  e_su34: { src: `${DL}/su34_manilov.glb`, scale: 23.34 / 24.02, nose: '+z', rulesIn: 'game', tex: () => 512, centerX: true,
    groups: (c) => ([13, 15, 16].includes(c.mat) /* стойки, колёса, тяги шасси */ || (c.ctr[1] < -0.35 && Math.max(...c.size) < 2.2) ? null : LS(c)) },
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
  w_kh555: { src: new URL('./own/kh555.glb', import.meta.url).pathname, scale: 1, nose: '-z', tex: () => 512, nTex: () => 512, pickMesh: /./, own: true }, // Х-555: своя модель (Blender, own/kh555.glb)
  w_kalibr: { src: `${DL}/sizzler_ss-n-27_kalibr_3m-54.glb`, scale: 1, nose: '+z', rulesIn: 'game', tex: () => 256, groups: LS }, // «Калибр» — 6,2 м
  w_agm86: { src: `${DL}/agm-86.glb`, scale: 0.1454, nose: '-z', rulesIn: 'game', tex: () => 256, centerX: true, groups: LS }, // AGM-86 ALCM — 6,32 м
  w_storm: { src: `${DL}/Свои/Storm Shadow/storm_shadow_game.glb`, scale: 5.1 / 5.185, nose: '+x', tex: () => 512, pickMesh: /./, credit: 'декали убраны',
    groups: (c) => (c.size[2] > 1 && c.size[1] < 0.05 ? (c.ctr[2] > 0 ? 'wingA' : 'wingB') : 'body') }, // консоли крыла (0,96 × 1,14 м, на спине) — свои части: на подвеске сложены (META wings: 'fold'); Storm Shadow — Viktor_ (CC BY 4.0, Storm Shadow Ukraine; декали убраны в текстуре — Свои/Storm Shadow, README.md; storm_shadow_game.glb = storm_shadow_clean.glb + asset.extras оригинала), 5,1 м, 12,5 тыс. треугольников без упрощения
  d_shahed: { src: `${DL}/shahed_136.glb`, scale: 1.45, nose: '+z', rulesIn: 'game', tex: () => 256, groups: (c) => (c.ctr[2] > 0.25 && Math.hypot(c.ctr[0], c.ctr[1] - 0.25) < 0.5 && c.size[2] < 0.3 ? 'prop' : LS(c)) }, // «Шахед-136» — 3,5 м; винт сзади — своя группа (крутится)
  d_uav: { src: `${DL}/uav.glb`, scale: 6, nose: '-z', rulesIn: 'game', tex: () => 256, // винты — свои группы (крутятся каждый вокруг своей оси); без шасси
    groups: (c) => { const [x, y, z] = c.ctr, ax = Math.abs(x); if (y < -0.55 && Math.max(...c.size) < 5) return null; if (ax > 0.9 && ax < 1.85 && z > 3.1 && z < 3.45 && Math.abs(y) < 0.5) return x > 0 ? 'prop' : 'prop2'; return LS(c); } }, // разведывательно-ударный БПЛА — размах 12 м; два толкающих винта
  e_tu160: { src: `${DL}/tupolev_tu-160.glb`, scale: 0.235, nose: '+z', rulesIn: 'game', tex: () => 512, groups: (c) => (c.ctr[1] < 2.6 && Math.max(...c.size) < 4 && Math.abs(c.ctr[0]) < 4.5 ? null : LS(c)) } /* без шасси */, // Ту-160 — 54 м
  e_b1b: { src: `${DL}/b1b_manilov.glb`, scale: 44.5 / 45.42, nose: '-z', rulesIn: 'game', tex: () => 512, centerX: true,
    // B-1B — manilov.ap «B1» (CC BY 4.0; прежняя модель Muhamad Mirza Arrafi, 44,5 м): у автора крыло раскрыто вперёд (стреловидность 16°, размах 40 м); консоли (мат. 11 и 13) складываем назад вокруг шарниров у передней кромки корня — как в боевом полёте (стреловидность ≈ 58°, размах ≈ 23 м)
    swing: { mat: [11, 13], axisX: 0, pivot: [3.85, -7.24], ang: -42 * Math.PI / 180 },
    groups: LS }, // без шасси (у автора его нет)
  e_b52: { src: `${DL}/boeing_b-52_stratofortress.glb`, scale: 1, nose: '-z', rulesIn: 'game', tex: () => 512, groups: LS }, // B-52H — 48,5 м; носитель «Мульти-волны»
  e_typhoon: { src: `${DL}/eurofighter_typhoon_ef-2000.glb`, scale: 15.96 / 18.72, nose: '+x', rulesIn: 'game', tex: () => 512, target: 20000, pickMesh: /Eurofighter typhoon/,
    groups: (c) => (c.ctr[1] < -0.8 && Math.abs(c.ctr[0]) > 0.4 && !(c.size[0] < 0.12 && c.size[1] > 0.3) ? null : LS(c)) }, // подвеска модели (ракеты, баки) — долой, пилоны остаются // Eurofighter Typhoon — 16 м; носитель Storm Shadow
  w_slam: { src: `${DL}/ugm-84_harpoon_free.glb`, scale: 4.49 / 7.3, nose: '+x', tex: () => 256, target: 5000, pickMesh: /./ }, // AGM-84E SLAM (по Harpoon) — 4,49 м
  // AGM-154 JSOW — RickSlash (CC BY, с текстурами; 2026-10-19 вместо набора NETRUNNER_pl): 2 → 4,1 м, крылья — две пластины сверху (сложены)
  w_jsow: { src: `${DL}/agm-154_jsow_missile.glb`, scale: 2.05, nose: '+z', rulesIn: 'game', tex: () => 512, pickMesh: /./,
    groups: (c) => (c.size[1] < 0.06 && c.ctr[1] > 0.12 ? (c.ctr[0] > 0 ? 'wingA' : 'wingB') : 'body') },
  w_jsow_old: { src: `${DL}/300_followers_-_free_aircraft_missile_set.glb`, scale: 1, nose: '-x', tex: () => 256, pickMesh: /AGM-154 JSOW/, groups: (c) => (c.size[1] < 0.05 && c.ctr[1] > 2.9 ? (c.ctr[2] > 0 ? 'wingA' : 'wingB') : 'body') }, // AGM-154 JSOW — 4,1 м; крылья в модели сложены — раскрываются после сброса
  // «Кинжал» (до 2026-10-25 — ракета 9М723 с пусковой «Искандера», dofash_76, перекрашенная в светло-серый)
  w_kinzhal: { src: new URL('./own/kinzhal.glb', import.meta.url).pathname, scale: 1, nose: '-z', tex: () => 512, nTex: () => 512, pickMesh: /./, own: true }, // Х-47М2 «Кинжал»: своя модель (Blender, own/kinzhal.glb)
  // ложная цель «Искандера» — отделяемая головная часть той же ракеты (обычного цвета ракеты, без перекраски)
  w_tbmdec: { src: `${DL}/iskander_dofash76.glb`, scale: ISK_KZ, axes: ISK_FLAT, rulesIn: 'game', pickMesh: /\/Loft\//, tex: () => 256, cutZ: [-99, ISK_CUT], /* только головная часть: обтекатель и боевая часть, ~2 м от носа */ groups: () => 'body' },
  // 9П78 «Искандер» — dofash_76 (CC BY 4.0; прежняя — 42manako, перезалив 3D Warehouse): 13,0 м (у автора 6,64 ед.), нос машины — к −Z; на поднятой направляющей одна ракета
  // (у автора), вторая — её копия рядом (на настоящей 9П78 их две; пуск — по одной, tbm и tbm2 прячутся по очереди); ракета выходит из закрытого кузова
  l_iskander: { src: `${DL}/iskander_dofash76.glb`, scale: 1.96, nose: '-x', rulesIn: 'game', unit: true, tex: () => 512,
    copyParts: [{ sel: (c) => /\/Null_5\//.test(c.path), offs: [[-1.16, 0, 0]] }], /* вся поднятая сборка (направляющая и ракета) — копия по другую сторону оси машины (x 0,58 → −0,58 м) */
    raiseSel: { sel: (c) => /\/Null_5\//.test(c.path), hinge: [ISK_HY, ISK_HZ], angle: ISK_UP }, /* у автора сборка стоит под 56,8° (положение направляющей) — поднята до вертикали вокруг заднего конца ракеты */
    groups: (c) => (/\/Loft\//.test(c.path) ? (c.ctr[0] > 0 ? 'tbm' : 'tbm2') : 'body') },
  // M752 (пусковая MGM-52 Lance) — своя модель (сборщик: Свои/M752, ревизия 2, 2026-10-25; ракета — w_lance, Свои/MGM-52). Походное положение; подвижные части —
  // свои группы (ось петли задаёт игра, sim/combined.js POD.l_lance): pod — стрела с сёдлами (erect_*), rampA — задняя плита-трап (ramp_in, ramp_hw), rampB — наружная
  // плита (ramp_out, сложена на rampA). Ракету на стрелу ставит игра (main.js, копия w_lance). Метры, нос −Z, 6,5 м, 40 тыс. треугольников
  l_lance: { src: new URL('./own/l_lance.glb', import.meta.url).pathname, scale: 1, nose: '-z', rulesIn: 'game', unit: true, own: true, tex: () => 1024, nTex: () => 512, pickMesh: /./,
    groups: (c) => (/(^|\/)erect_/.test(c.path) ? 'pod' : /(^|\/)ramp_out/.test(c.path) ? 'rampB' : /(^|\/)ramp_/.test(c.path) ? 'rampA' : 'body') },
  // 9П129 «Точка-У» — своя модель (сборщик: Свои/Точка-У, ракета 9М79 — Свои/9М79, пакет — Свои/Точка-У_пакет; 2026-10-24) вместо 42manako («Not my model»):
  // в игре — боевое положение, кадр клипа «Raise» пакета (Свои/Точка-У_игра/combat_export.py): створки открыты, люлька и ракета вертикально, лепестки раскрыты.
  // Метры, нос −Z, 10,9 м, 68 тыс. треугольников; ракета (tbm_*) — часть tbm: стоит до пуска, при пуске прячется, летит её копия (evPart), 6,95 м — как у сборщика
  l_tochka: { src: `${DL}/Свои/Точка-У_игра/tochka_combat.glb`, scale: 1, nose: '-z', rulesIn: 'game', unit: true, own: true, tex: () => 1024, nTex: () => 512, pickMesh: /./,
    groups: (c) => (/(^|\/)tbm_/.test(c.path) ? 'tbm' : 'body') },
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
  msl_amraam: { src: new URL('./own/msl_aim120.glb', import.meta.url).pathname, scale: 1, nose: '-z', own: true, tex: () => 512, nTex: () => 512, pickMesh: /./ }, // AIM-120A — своя (сборщик, Свои/AIM-120, 2026-10-24): 3,863 м, Ø 0,188, ракета NASAMS. Своё имя: msl_aim120 (вырезка из F/A-18) грузит «Летка» (games/drone/glb.js) — её не трогаем
  w_gbu12: { src: new URL('./own/gbu12.glb', import.meta.url).pathname, scale: 1, nose: '-z', tex: () => 512, nTex: () => 512, pickMesh: /./, own: true }, // GBU-12 Paveway II: своя модель (Blender, own/gbu12.glb)
  mig29: { src: `${DL}/mig_29.glb`, scale: 17.32 / 947.3, nose: '+z', tex: () => 1024 },
  // правила частей — в осях игры (без центровки): along/across — положение центра части вдоль и поперёк оси пакета
  // «Тор-М1» — своя модель (сборщик, Свои/Тор-М1, 2026-10-24; копия own/tor.glb): 68 тыс. треугольников, цвет 2048 + нормали 1024 запечены, камуфляж в цвете.
  // Метры, нос −Z, земля y = 0; части — по именам объектов: body_*, turret_* (башня), radar_* (антенна обзора, крутится); dish — антенна сопровождения:
  // детали turret_dish у центра тарелки (≤ 0,42 м — тарелка, кожух привода, шея) и крепёж на ней turret_hwd (как в Тор-М1_пакет/pack_parts.py split_dish),
  // качается по углу места цели на цапфе (launchers.js tor.tdish), опора и цапфа остаются на башне; крышки ячеек — грани turret_main / _hw / _detail целиком в рамке ячейки
  // (геометрия сборщика: Тор-М1_пакет/pack_geo.py cell_frame / cover_pred) → lid0…7 (L1, R1, L2, R2, … — как слоты launchers.js). Дальняя копия — без них.
  tor: { src: new URL('./own/tor.glb', import.meta.url).pathname, scale: 1, nose: '-z', rulesIn: 'game', unit: true, own: true, perTri: true, tex: () => 2048, nTex: () => 1024, pickMesh: /./,
    tpFix: [0, 2.523, -0.37], perTriComp: true, groups: (c) => torPart(c, true) },
  msl_tor: { src: new URL('./own/msl_tor.glb', import.meta.url).pathname, scale: 1, nose: '-z', own: true, tex: () => 512, nTex: () => 512, pickMesh: /./ }, // ракета 9М331 — своя (сборщик, Свои/9М331), корпус 2,9 м
  // «Панцирь-С1» на КамАЗ-6560 — SanderWolf (CC BY 4.0), переделан в Blender (Свои/Панцирь, README.md): цвет и карта нормалей запечены в 2048 (материал PS_paint), 87 тыс. треугольников — без упрощения вблизи (pantsir_lo — дальняя);
  // pantsir_game.glb = pantsir_baked.glb + asset.extras оригинала (для титров; python3 -I glb_extras.py). Метры, нос −Z, начало — ось симметрии, середина длины, низ колёс y = 0; части — по именам объектов:
  // body — шасси и кунг, turret — башня (погон: ось x 0, y 2,805, z 2,218), cradle — две 2А38М и рамы люлек, missile — 12 ТПК 57Э6 (6 на борт: две колонки × 3 ряда; в игре — часть cradle: контейнеры остаются на месте после пуска, ракета вылетает из них, а «missile» у игры — модель самой ракеты), radar — антенна обзора на мачте (ось 0; 2,878; 3,419);
  // цапфа люльки — (0; 3,472; 2,350), ось ТПК горизонтальна (pack0 0). Нижний безопасный угол возвышения ≈ 0…+5° (при −5° ТПК входят в кунг) — launchers.js elMin
  pantsir: { src: `${DL}/Свои/Панцирь/pantsir_game.glb`, scale: 1, nose: '-z', rulesIn: 'game', unit: true, tex: () => 1024, nTex: () => 1024, pickMesh: /./, axisX: 0, ground: 0, hinge: [0, 3.472, 2.35], tpFix: [0, 2.805, 2.218], pack0: 0, tube: [0.15, 0.3], credit: 'окраска и запекание текстур',
    groups: (c) => (/(^|\/)(cradle|missile)/.test(c.path) ? 'cradle' : /(^|\/)radar/.test(c.path) ? 'radar' : /(^|\/)turret/.test(c.path) ? 'turret' : 'body') },
  // С-300 и С-400 — своя пусковая 5П85 на МАЗ-543 (сборщик, Свои/С-300, 2026-10-28; Mark: «с-300 готова», «и для с-400 используй всё то же самое»)
  // вместо скана Chenzoss. Метры, нос −Z, земля y = 0, оси сборщика без центровки (axisX / axisZ / ground 0 — числа ПАСПОРТ.json те же, что в игре);
  // части — по именам узлов (s300Part): body_* — шасси, кабины, кузов; pack_* — пакет на шарнире PACK_PIVOT (0; 1,264; 5,694): в модели лежит
  // (угол места 0, устья вперёд), игра поднимает его на 90° (u.lel); lid_c<ряд><столбец> → lid0…3 (c11, c12, c21, c22) — крышки, в осях пакета;
  // jack_0…3 → jack0…3 — штоки домкратов; cyl_barrel / cyl_rod1 / cyl_rod2 → cyl0…2 — гидроцилиндр подъёма (main.js erectView). Контейнеры полые:
  // ракеты 9М83 — своя модель msl_9m83. Дальняя копия — s300_lo.glb сборщика (без протектора, ступиц, рамы: 61 тыс.), крышки в пакете
  s300: { src: `${DL}/Свои/С-300/s300.glb`, scale: 1, nose: '-z', rulesIn: 'game', unit: true, own: true, tex: () => 2048, nTex: () => 1024, pickMesh: /./,
    axisX: 0, axisZ: 0, ground: 0, hinge: [0, 1.264, 5.694], tpFix: [0, 1.264, 5.694], pack0: 0, tube: [0.8, 1.1], groups: (c) => s300Part(c, true) },
  // объект «РЛС на вершине» (w_radar зимой, a_radar осенью) — своя сцена сборщика (Свои/РЛС на вершине, 2026-10-28): оси игры (x — восток,
  // −z — север, y = 0 — площадка), начало — центр объекта; части — узлы b_<постройка> (целая) и b_<постройка>_ruin (разрушенная, на том же
  // месте), deco_site / deco_props — неразрушаемое (props — только вблизи); пустышки place:* — без мешей (места — city.js SITES)
  site_radar: { src: `${DL}/Свои/РЛС на вершине/radar_site.glb`, scale: 1, nose: '-z', rulesIn: 'game', own: true, tex: () => 2048, nTex: () => 1024, pickMesh: /./,
    axisX: 0, axisZ: 0, centerY: 0, groups: (c) => c.path.split('/').pop().replace(/\.\d+$/, '') },
  // объект «Вертолётная площадка „Ведьмина поляна“» (a_heli, осень) — своя сцена сборщика (Свои/Вертолётная площадка, 2026-10-28), устроена как site_radar;
  // плиты стоянок — свой материал tile_pads (бесшовная текстура, повтор 6 м); deco_site / deco_camp — только вблизи
  site_heli: { src: `${DL}/Свои/Вертолётная площадка/heli_site.glb`, scale: 1, nose: '-z', rulesIn: 'game', own: true, tex: () => 2048, nTex: () => 1024, pickMesh: /./,
    axisX: 0, axisZ: 0, centerY: 0, groups: (c) => c.path.split('/').pop().replace(/\.\d+$/, '') },
  // объект «Склад боеприпасов» (город, tpp) — своя сцена сборщика (Свои/Склад боеприпасов, 2026-10-28), устроена как site_radar; бесшовные
  // tile_conc (плиты дорог, повтор 4 м) и tile_mesh (рабица, альфа-тест, повтор 1 м) — в своём размере, не растягивать до атласа;
  // в дневном городе плиты выходили белыми — цвет × 0,84; стёкла и вода A_glassF (почти чёрные, в Blender — с отражением) — тёмная вода, не дыра
  site_ammo_city: { src: `${DL}/Свои/Склад боеприпасов/ammo_city.glb`, scale: 1, nose: '-z', rulesIn: 'game', own: true, tex: (m) => ({ tile_conc: 1024, tile_mesh: 512 })[m.name] || 2048,
    colors: { '^tile_conc$': [0.84, 0.84, 0.82], '^A_glassF$': [0.08, 0.1, 0.11] },
    nTex: () => 1024, pickMesh: /./, axisX: 0, axisZ: 0, centerY: 0, groups: (c) => c.path.split('/').pop().replace(/\.\d+$/, '') },
  // ракета 9М83 — своя (сборщик, Свои/9М83): 6,9 м, Ø 0,672, нос −Z; рули M83_fin0…3 → fin0…3 (в контейнере сложены, раскрываются после выхода — main.js)
  msl_9m83: { src: `${DL}/Свои/9М83/msl_9m83.glb`, scale: 1, nose: '-z', own: true, tex: () => 1024, nTex: () => 512, pickMesh: /./,
    groups: (c) => { const f = c.path.match(/(^|\/)M83_fin(\d)/); return f ? 'fin' + f[2] : 'body'; } },
  // «Стрела-1» (9П31 на БРДМ-2) — основной чат по просьбе Mark 2026-10-24 (Свои/Стрела-1: build.py, bake.py, deliver.py): основа — БРДМ-2 zhek
  // (CC BY 4.0, масштаб до 5,75 м, пулемётная башенка снята), пусковая и ракета 9М31 — свои (окраска запечена в атлас 1024, нормали — Bevel).
  // Метры, нос −Z, земля y = 0; части — по первому слову имени объекта: body_*, turret_* (основание, окно оператора, стойка), cradle_* (ось и
  // четыре решётчатых контейнера), missile*_* (ракеты в контейнерах; образец — одна, места остальных — слоты). Ось башни — центр погона на крыше,
  // ось качания — на 1,04 м выше крыши (build.py TRUN); пакет в модели — угол места 0 (pack0). absorb 0 — поперечины контейнеров к ракетам не липнут,
  // instR 0,12 — ракеты в 0,31 м друг от друга, а стабилизаторы соседей — в 0,16 м (при 0,2 соседние ракеты склеивались парами). Титры — автор основы (файл выгружен из Blender, asset.extras в нём нет — orig).
  strela1: { src: `${DL}/Свои/Стрела-1/strela1.glb`, scale: 1, nose: '-z', rulesIn: 'game', unit: true, tex: () => 1024, nTex: () => 512, pickMesh: /./, /* нормали 512: у основы их 4 карты — файл легче на ~3 МБ */
    tpFix: [0, 1.98, 0.308], hinge: [0, 3.02, 0.308], pack0: 0, absorb: 0, instR: 0.12, credit: 'пусковая 9П31 и ракета 9М31 — свои',
    orig: { title: 'BRDM 2 armored reconnaissance vehicle', author: 'zhek', source: 'https://sketchfab.com/3d-models/brdm-2-armored-reconnaissance-vehicle-065dc054914f40fdbfb25ad62d6696b7', license: 'CC-BY-4.0' },
    groups: (c) => (/(^|\/)missile/.test(c.path) ? 'missile' : /(^|\/)cradle/.test(c.path) ? 'cradle' : /(^|\/)turret/.test(c.path) ? 'turret' : 'body') },
  msl_strela1: { src: new URL('./own/msl_strela1.glb', import.meta.url).pathname, scale: 1, nose: '-z', own: true, tex: () => 512, nTex: () => 512, pickMesh: /./ }, // ракета 9М31 — своя, 1,8 м
  // Roland 2 на Marder — ScurvyWoof: без текстур, цвета авторов «мятные» — перекраска в бронзово-зелёный бундесвера (RAL 6031)
  roland: { src: `${DL}/marder_roland_low-poly.glb`, scale: 2.3, nose: '+z', rulesIn: 'game', unit: true, tex: () => 512, camo: { scheme: 'nato', skip: /^(material_0|Material\.0(0[2-9]|1))/  }, hinge: [0, 2.74, 0.5], tube: [0.25, 0.4],
    colors: { '^Material\\.002': [0.05, 0.06, 0.065], '^Material\\.003': [0.025, 0.025, 0.024], '^Material\\.008': [0.035, 0.035, 0.032], '^Material\\.011': [0.03, 0.03, 0.028] }, // гусеницы и катки — тёмные (у автора белые и светло-серые)
    groups: (c) => {
      if (c.min[1] < 2.0 || c.ctr[2] < -1.2 || c.ctr[2] > 1.9) return 'body';
      if (Math.abs(c.ctr[0]) < 0.6 && c.min[1] > 3.15 && c.ctr[2] > 0.9) return 'radar'; // РЛС обзора на мачте — крутится
      return Math.abs(c.ctr[0]) > 0.65 && c.min[1] > 2.12 ? 'cradle' : 'turret'; // контейнеры с ракетами и их рычаги — качаются
    } },
  // 2К22 «Тунгуска» — SIpriv (CC BY 4.0, Low poly 2k22 Tunguska), переделана в Blender (Свои/Тунгуска, README.md): цвет и карта нормалей запечены в 2048 (материал TG_paint); без упрощения (28,8 тыс. треугольников; tunguska_lo — дальняя);
  // tunguska_game.glb = tunguska_baked.glb + asset.extras оригинала (для титров). Метры, нос −Z, начало — ось симметрии, середина длины корпуса, низ гусениц y = 0; части — по именам объектов:
  // body — шасси, turret — башня с РЛС сопровождения (погон: ось x 0, y 1,674, z −0,439), cradle — 2×2 пушки 2А38 и рамы люлек, missile — 8 ТПК 9М311 (по 4 на борт; в игре — часть cradle: контейнеры остаются на месте после пуска, ракета вылетает из них, а «missile» у игры — модель самой ракеты), radar — антенна обзора сзади (ось 0; 2,681; 1,485);
  // цапфа люльки — (0; 2,294; +0,360); ТПК лежат горизонтально (pack0 0)
  tunguska: { src: `${DL}/Свои/Тунгуска/tunguska_game.glb`, scale: 1, nose: '-z', rulesIn: 'game', unit: true, tex: () => 1024, nTex: () => 1024, pickMesh: /./, axisX: 0, ground: 0, hinge: [0, 2.294, 0.36], tpFix: [0, 1.674, -0.4435], pack0: 0, tube: [0.15, 0.3], credit: 'окраска и запекание текстур',
    groups: (c) => (/(^|\/)(cradle|missile)/.test(c.path) ? 'cradle' : /(^|\/)radar/.test(c.path) ? 'radar' : /(^|\/)turret/.test(c.path) ? 'turret' : 'body') },
  // ракета 9М311 «Тунгуски» — своя (Свои/Тунгуска/msl_9m311.glb, тот же автор SIpriv): 2,56 м, нос −Z, материал TG_msl; для полёта и ракет в слотах
  msl_9m311: { src: `${DL}/Свои/Тунгуска/msl_9m311_game.glb`, scale: 1, nose: '-z', tex: () => 512, nTex: () => 512, pickMesh: /./, credit: 'окраска и запекание текстур' },
  // SAMP/T — Chenzoss: скан, вся машина — одна сетка; пакет из 8 контейнеров Aster лежит по-походному — делим по треугольникам,
  // в игре он поднимается вертикально (u.lel = 90°) вокруг оси у кормы
  sampt: { src: `${DL}/samp-t_air_defense_system.glb`, scale: 5.5, nose: '+z', rulesIn: 'game', unit: true, perTri: true, tex: () => 1024, target: 60000, hinge: [0, 0.45, 4.3],
    groups: (c) => (c.ctr[1] > 0.4 && c.ctr[2] > -0.8 && c.ctr[2] < 4.35 && Math.abs(c.ctr[0]) < 1.7 ? 'cradle' : 'body') }, // пакет: два ряда контейнеров, y 0,5–1,75 (под ним — пустой промежуток до рамы)
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
  // ЗИФ-122 «Оса-М» на береговой позиции — KoreanNavy (CC BY 4.0; прежняя модель «Оса-АКМ» Jeyhun1985 — с признаками рипа): двухбалочная корабельная пусковая на тумбе с диском (диск — бетонная площадка-основание),
  // две ракеты 4К33 висят под балками (длина по модели ≈ 2,64 → 3,16 м, как msl.L; масштаб 1,2). Лежит носом в +X, балки подняты на ≈10° (pack0 — угол ракет и балок, 10,2°); ось качания — цапфа (x 0, y 1,815 в единицах автора)
  osa: { src: `${DL}/zif-122_osa-m_koreannavy.glb`, scale: 1.2, nose: '+x', rulesIn: 'game', unit: true, tex: () => 256, absorb: 0, hinge: [0, 2.178, 0], pack0: 0.178, colors: { '^Material\\.004#msl$': [0.25, 0.26, 0.24], '#msl$': [0.72, 0.72, 0.66], '#steel$': [0.17, 0.19, 0.16], '#conc$': [0.34, 0.33, 0.31] },
    groups: (c) => {
      if (/Cylinder\.001/.test(c.path)) return 'missile#msl'; // 4К33 на балках
      if (/Cube\.00[12]/.test(c.path)) return 'cradle#steel'; // балки и проушины подвеса
      if (c.max[1] < 1.3 * 1.2) return 'body#conc'; // диск, болты и тумба
      return c.mat === 1 ? 'turret' : 'turret#steel'; // башня с осью-цапфой
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
  hawk: { src: `${DL}/mim-23_hawk_sam_air_defence_system_game-ready.glb`, scale: 0.012, nose: '+z', rulesIn: 'game', unit: true, tex: () => 512, target: 55000, hinge: [0, 1.77, -0.19], absorb: 0, /* рули ракеты — уже в её детали; с «прилипанием» 0,9 м к ракете цеплялись 115 деталей пусковой (Mark 2026-10-22) */
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
  gepard: { src: new URL('./own/gepard.glb', import.meta.url).pathname, scale: 1, nose: '-z', rulesIn: 'game', unit: true, own: true, tex: () => 1024, nTex: () => 1024, pickMesh: /./, hinge: [0, 2.316, 0.0077], pack0: 0,
    // Flakpanzer Gepard: своя модель (Blender, own/gepard.glb): цвет (краска, песок, сколы, затенение) и карта нормалей (скруглённые рёбра, зерно) запечены в 1024; части — по именам объектов
    groups: (c) => (/(^|\/)cradle/.test(c.path) ? 'cradle' : /(^|\/)radar/.test(c.path) ? 'radar' : /(^|\/)turret/.test(c.path) ? 'turret' : 'body') },
  // NASAMS — своя пусковая (сборщик, Свои/NASAMS, 2026-10-24; Mark 2026-10-25: «внедряй насамс, его ракету и всё, что с этим связано») вместо
  // Muhamad Mirza Arrafi («сделано ИИ»). Метры, нос −Z, земля y = 0; части — по первому слову имени (nasamsPart): body_* — рама, опоры, пьедестал,
  // ящики; turret_* — погон и вилка; cradle_*, missile_c* (шесть контейнеров 4,5 × 0,68 × 0,64 м — сами ракеты игра ставит из msl_aim120) — блок
  // под постоянным углом 23,9° (pack0); lid_c11…c23 — передние крышки (lid0…5: нижний ряд слева направо, потом верхний), в осях башни — игра
  // откидывает их к пуску (launchers.js NASAMS_LIDS). Ось погона (0; 1,39; 0) и шарнир блока (0; 1,57; 0,42) — из build.py; модель центруется
  // по раме (сдвиг по z 0,172) — tpFix уже после центровки. Мачта антенны в бою поднята (картинка 2 Mark; сложенная мешает крышке c21):
  // труба с куполом, хомуты и кабель (mast) поворачиваются на 66,1° вокруг заднего шарнира — вертикально (raise); кронштейны остаются на блоке.
  nasams: { src: new URL('./own/nasams.glb', import.meta.url).pathname, scale: 1, nose: '-z', rulesIn: 'game', unit: true, own: true, tex: () => 2048, nTex: () => 1024, pickMesh: /./,
    axisX: 0, ground: 0, tpFix: [0, 1.39, 0.172], hinge: [0, 1.57, 0.42], pack0: 23.9 * Math.PI / 180, tube: [0.55, 0.75],
    raise: { group: 'mast', to: 'turret', hinge: [-1.12, 2.6627, 0.7999], angle: -66.1 * Math.PI / 180 }, groups: (c) => nasamsPart(c, true) },
  // станция РЭБ (запад) — AN/MPQ-64 Sentinel, своя (основной чат по просьбе Mark, Свои/Sentinel): «Хамви» karmy2k (CC BY 4.0) с кузовом M1097 и коробом
  // генератора, прицеп с антенной — свои. Антенна с поворотным столом (radar_*) крутится вокруг оси стола; башни нет — в осях модели (articulate не трогает).
  ew_w: { src: `${DL}/Свои/Sentinel/sentinel.glb`, scale: 1, nose: '-z', rulesIn: 'game', unit: true, tex: () => 1024, nTex: () => 512, pickMesh: /./,
    credit: 'кузов, прицеп и антенна AN/MPQ-64 — свои',
    orig: { title: 'Humvee Transport', author: 'karmy2k', source: 'https://sketchfab.com/3d-models/humvee-transport-48336bc41caf4fa1bdf147823a774111', license: 'CC-BY-4.0' },
    groups: (c) => (/(^|\/)radar_/.test(c.path) ? 'radar' : 'body') },
  // станция РЭБ (восток) — РЛС П-18 «Терек», своя (основной чат по просьбе Mark, Свои/П-18): «Урал-4320» Brout (CC BY 4.0) без тента, с будкой; мачта,
  // поворотная балка с 16 антеннами «волновой канал» — свои. Поворотная часть (radar_*) крутится вокруг оси мачты (шахта внутри мачты — самая низкая её часть).
  ew_e: { src: `${DL}/Свои/П-18/p18.glb`, scale: 1, nose: '-z', rulesIn: 'game', unit: true, tex: () => 1024, nTex: () => 512, pickMesh: /./,
    credit: 'будка, мачта и антенна П-18 — свои',
    orig: { title: 'Ural 4320', author: 'Brout', source: 'https://sketchfab.com/3d-models/ural-4320-f953c51a5dbc4a15949f4dcc0905c4e8', license: 'CC-BY-4.0' },
    groups: (c) => (/(^|\/)radar_/.test(c.path) ? 'radar' : 'body') },
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
  // маленькие дома (2026-10-27, Mark: «промежуточные версии — максимально похожи на оригинал, но легче»; стенд tools/airdef-models/house-compare.js):
  // упрощаются только тяжёлые и «простые» части (simpKeep — остальные как у автора), края открытых листов закреплены (lockBorder), ошибка ≤ 0,5–1 %
  // размера — было: черепица h_log рвалась в дыры (simplify 0,35 по всей модели), у h_mobile темнел задний фасад
  h_log: { src: `${DL}/cottage.glb`, scale: 0.12, nose: '-z', rulesIn: 'game', unit: true, tex: () => 256, simplify: 0.3, simpErr: 0.01, lockBorder: true, simpKeep: /^(?!(Palos_Barandilla|Lateral_|Pomo))/, groups: () => 'body' }, // бревенчатый дом: 14 728 → 8 962 тр., видов 37–68 дБ (перила, боковые стены, ручки; крыша, фасад с окнами, пол веранды — как у автора)
  h_khata: { src: `${DL}/thatched_rural_houses.glb`, scale: 6, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, simplify: 0.4, simpErr: 0.005, lockBorder: true, simpKeep: /^(?!(01___Default|material|04___Default))/ /* 3 052 → 1 948 тр., 39–50 дБ */, pick: [-13.5, -0.5, -9, -3.2, 7, 6], groups: () => 'body' }, // хата под соломой (левая из двух; правая — амбар)
  o_block: { src: `${DL}/large_low_poly_building.glb`, scale: 0.01, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, groups: () => 'body' }, // офисный корпус
  h_shanty: { src: `${DL}/shanty__mansion__wooden.glb`, scale: 1, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, groups: () => 'body' }, // деревянный дом с верандой
  h_mobile: { src: `${DL}/lp_americans_house_mobile.glb`, scale: 1.25, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, simplify: 0.5, simpErr: 0.005, lockBorder: true, simpKeep: /^(?!(MHousWood$|MHouseWoodFloor$))/, groups: () => 'body' }, // дом-фургон: 6 066 → 4 482 тр., 35–50 дБ (стены и пол; окна, двери, декали — как у автора)
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
  // 9К317М «Бук-М3» — Valera121 (CC BY 4.0; без текстур — один цвет; прежняя модель Jeyhun1985 — с признаками рипа): в файле лежат подложка (Plane) и две ракеты (Missile_1 — модель 9М317М: msl_bukm3 ниже).
  // Вся верхняя часть (кабина, палуба, пакет 2×3 ТПК) повёрнута на −32° вокруг оси поворота (0; −0,94) и поднята на 26°: правила — в осях игры, turretYaw выравнивает башню, hinge — в исходных осях (до выравнивания),
  // tpFix — ось башни в осях после центровки (земля — низ гусеницы, ground −0,56). Внутри ТПК — по две цилиндрические вставки (104 и 184 треугольника) — это 9М317М (группа missile, по ним считаются слоты);
  // колёса — тёмные, остальное — камуфляж (шейдер игры). У автора гусениц нет (колёса 6 на борт: ведущее сзади z 2,0, четыре катка, переднее z −4,5; над ними — полка корпуса y 0,33–0,63): лента звеньями строится tracks
  // (замкнутая оболочка окружностей по осевой линии, верх прижат под полку; bukm3_lo — гладкая лента без звеньев). Без отсева мелочи: все треугольники автора, кроме подложки и лежащих ракет
  bukm3: { src: `${DL}/buk-m3_valera121.glb`, scale: 1, nose: '+z', rulesIn: 'game', unit: true, tex: () => 512, pickMesh: /Buk M3/, absorb: 0, ground: -0.56, hinge: [2.09, 2.94, 2.4], turretYaw: -0.5585, tpFix: [0, 1.92, 0.055], camo: { scheme: 'soviet' },
    colors: { '#rubber$': [0.02, 0.02, 0.02], '#msl$': [0.55, 0.55, 0.5], '#track$': [0.10, 0.10, 0.09] },
    tracks: { xc: 1.38, w: 0.54, t: 0.07, pitch: 0.16, top: 0.55, links: true, circles: [[2.0, 0.25, 0.6], [0.5, 0, 0.525], [-0.75, 0, 0.525], [-2.0, 0, 0.525], [-3.25, 0, 0.525], [-4.5, 0.25, 0.525]] },
    groups: (c) => {
      if (c.min[1] < 1.3) return c.size[0] > 0.3 && c.size[0] < 0.5 && c.size[1] > 0.9 && c.size[1] < 1.3 && c.size[2] > 0.9 && c.size[2] < 1.3 && c.min[1] < 0.6 ? 'body#rubber' : 'body'; // колёса
      const Y = -0.5585, cy = Math.cos(Y), sy = Math.sin(Y), dx = c.ctr[0], dz = c.ctr[2] + 0.94, u = dx * cy + dz * sy, w = -0.94 - dx * sy + dz * cy, y = c.ctr[1]; // центр части в выровненных осях
      const dw = w - 3.0, dy = y - 2.94, along = -0.899 * dw + 0.438 * dy, up = 0.438 * dw + 0.899 * dy;
      if (!(Math.abs(u) < 1.18 && along > -0.8 && along < 5.5 && up > -0.85 && up < 1.0)) return 'turret';
      return (c.tris === 104 || c.tris === 184) && Math.abs(u) < 1.0 && up > -0.7 && up < 0.8 && along > -0.1 && along < 5.3 ? 'missile#msl' : 'cradle';
    } },
  // ракета 9М317М для «Бука-М3» — Missile_1 из той же модели (Valera121): в размер msl.L = 5,2 м, светлая окраска
  msl_bukm3: { src: `${DL}/buk-m3_valera121.glb`, scale: 5.2 / 5.25, nose: '-x', tex: () => 256, pickMesh: /Missile_1\//, colors: { '': [0.72, 0.72, 0.66] } },
  // ── вертолёты и вертолётное оружие (2026-10-20): лопасти — свои части rotor / rotor2 (несущий; вертикальная ось) и trotor (рулевой; поперечная ось), крутит models.js ──
  h_mi24: { src: `${DL}/mi24.glb`, scale: 1.018, fwd: [-0.5678, 0.8231], rulesIn: 'game', tex: () => 512, axisX: 1.16, centerBody: /^(rotor2?|trotor)$/, hubs: { rotor: [1.16, 4.17, -0.24], trotor: [0.53, 4.34, 10.56] }, // Ми-24 — manilov.ap: ось фюзеляжа x 1,16; Ø несущего 17,3
    groups: (c) => { const dx = c.ctr[0] - 1.17, dz = c.ctr[2] + 0.27, y = c.ctr[1];
      if (y > 3.6 && Math.hypot(dx, dz) < 9) return 'rotor'; // 5 лопастей, втулка и шарниры (оси — x 1,17, z −0,27, верх 4,17)
      if (y > 3 && c.ctr[2] > 9 && c.size[0] < 0.15) return 'trotor'; // рулевой винт (3 лопасти)
      if (Math.abs(dx) > 1.5 && y < 1.5 && ((c.size[2] > 1.3 && c.size[2] < 1.4 && c.size[0] < 0.6) || (c.size[0] < 0.1 && c.size[2] > 0.25 && c.size[2] < 0.3))) return null; // блоки НАР под консолями и их трубы (оружие — из игры)
      return 'body'; } },
  h_ah64: { src: `${DL}/ah64.glb`, scale: 1, minPart: 0.08, nose: '-x', rulesIn: 'game', tex: () => 1024, /* без упрощения (127 тыс.) и ужатия текстур — Mark 2026-10-20 */ texVf: 'hue=h=-30:s=0.5' /* у автора сочно-зелёный — в приглушённый оливковый армейский */, colors: { '^(ah2_2|ah05)-FACES(_0)?$': [0.06, 0.067, 0.045] }, axisX: 0.02, centerBody: /^(rotor2?|trotor)$/, hubs: { rotor: [0.02, 4.42, 0], trotor: [-1.0, 4.16, 8.84] }, // AH-64 — manilov.ap (1 : 1: Ø несущего 14,68, фюзеляж 14,96); хвостовой винт слева, 4 лопасти крестом
    groups: (c) => { const p = c.path;
      if (/\/ah62[1-4]-FACES|\/ah63-FACES/.test(p)) return 'rotor'; // 4 лопасти и головка
      if (/\/ah59[ab]-FACES/.test(p)) return 'trotor'; // лопасти рулевого винта (две пары крестом)
      if (/\/(ah12a\d*|ah13[ab]|ah14[ab]|ah15[A-Z]+|ah16[A-Z]+|ah70r\d*|ah71r\d*|ah86b\d*|ah89b\d*)-FACES/.test(p)) return null; // свой «Хеллфайр» (8), блоки НАР и ракеты на законцовках — оружие из игры
      return 'body'; } },
  h_uh1: { src: `${DL}/uh1.glb`, scale: 1.09, nose: '+z', rulesIn: 'game', tex: () => 1024, texVf: 'hue=s=0.48' /* без сдвига тона (иначе оранжевые законцовки и надписи — розовые): сочно-зелёный → приглушённый армейский */, axisX: 0, centerBody: /^(rotor2?|trotor)$/, hubs: { rotor: [0, 3.8, 0], trotor: [-0.44, 3.28, 7.97] }, // UH-1 — manilov.ap: Ø несущего 13,41 → 14,63 (×1,09); рулевой винт слева
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
  h_ka52: { src: `${DL}/Свои/Ка-52/ka52_game.glb`, scale: 1, nose: '-z', rulesIn: 'game', tex: () => 1024, nTex: () => 1024, pickMesh: /./, axisX: 0, centerBody: /^(rotor2?|trotor)$/, hubs: { rotor: [0, 5.193, -1.943], rotor2: [0, 3.752, -1.943] }, credit: 'корпус, кабина и хвост перестроены, окраска запечена',
    // Ка-52 — maddex88 (CC BY 4.0), переделан в Blender (Свои/Ка-52, README.md): метры, нос −Z, цвет и карта нормалей запечены в 2048; ka52_game.glb = ka52_baked.glb + asset.extras оригинала (для титров);
    // подвесные баки сняты (игра вешает своё оружие на 4 пилона); соосные винты: KA52_rotor — верхний, KA52_rotor2 — нижний; рулевого нет
    glassAny: /^KA52_glass$/, glassColor: [0.3, 0.36, 0.42, 0.4],
    groups: (c) => (/(^|\/)KA52_rotor2/.test(c.path) ? 'rotor2' : /(^|\/)KA52_rotor($|\/)/.test(c.path) ? 'rotor' : 'body') },
  h_mi28: { src: `${DL}/mi-28n_havoc.glb`, scale: 2.549, axes: (x, y, z) => [-x, -z, -y], rulesIn: 'game', tex: () => 2048, /* текстура автора 2048 — не ужимать (512 мылила камуфляж) */ texVf: 'eq=gamma=1.3' /* у автора очень тёмная */, axisX: 0, centerBody: /^(rotor2?|trotor)$/, hubs: { rotor: [0, 4.0, 0.41], trotor: [0.79, 3.04, 11.02] }, // Ми-28Н — Rukh3D (скинированный; оси автора: ось фюзеляжа Y, верх −Z; единицы автора ×2,549 по Ø несущего 17,2 — фюзеляж тогда 17,0 м); рулевой винт справа, 4 лопасти крестом
    glassAny: /^mirror$/,
    groups: (c) => { const p = c.path, k = 1 / 2.549, x = Math.abs(c.ctr[0]) * k, y = c.ctr[1] * k, z = c.ctr[2] * k;
      if (/\/Object_16$/.test(p)) return y > 1.78 ? 'body' : 'rotor'; // 5 лопастей и втулка (обтекатель РЛС над втулкой — неподвижный)
      if (/\/Object_18$/.test(p)) return 'trotor'; // рулевой винт (4 лопасти крестом)
      if (x > 0.55 && x < 1.05 && y > 0.35 && y < 0.65 && z > 0.3 && z < 0.9 && Math.max(...c.size) * k < 0.75) return null; // трубы и корпуса блоков НАР, малые направляющие под консолями — оружие из игры
      return 'body'; } },
  // ── 2026-10-21, четыре вертолёта manilov.ap (CC BY 4.0): Ка-50, Ми-8МТВ, UH-60, RAH-66; без упрощения, оружие автора убрано (своё — из игры) ──
  h_ka50: { src: `${DL}/ka50.glb`, scale: 0.84, nose: '+z' /* Mark 2026-10-21: с '-z' в карточке и в бою летел хвостом вперёд */, rulesIn: 'game', tex: () => 1024, axisX: -0.025, centerBody: /^(rotor2?|trotor)$/, hubs: { rotor: [-0.025, 0.5, -3.46], rotor2: [-0.025, -0.78, -3.46] }, // Ка-50 — manilov.ap: Ø несущих 14,5 → ×0,84; соосные: rotor — верхний, rotor2 — нижний; рулевого нет
    glassAny: /^hokufusg-FACES_7$/, glassColor: [0.05, 0.07, 0.08, 0.5],
    colors: { '^hokufusg-FACES_(9|16)$': [0.018, 0.018, 0.018], '^hokufusg-FACES_(6|10)$': [0.055, 0.055, 0.058], '^hokufusg-FACES_15$': [1, 0, 0], '^hokufusg-FACES(_\\d+)?$': [0.036, 0.037, 0.039],
      '^cmj(plvjean|torshrt|[lr](calf|thigh|bicep|shold|shstrp|forarm))-': [0.045, 0.05, 0.04] },
    groups: (c) => { const k = 1 / 0.84, x = c.ctr[0] * k, y = c.ctr[1] * k, z = c.ctr[2] * k, sz = c.size.map((v) => v * k);
      if (c.mat === 11) return y > 0 ? 'rotor' : 'rotor2'; // 6 лопастей (3 + 3)
      if (c.mat === 7 && Math.hypot(x - 0.03, z - 4.12) < 1.8) { if (y > -0.45) return 'rotor'; if (y > -1.45) return 'rotor2'; } // втулки, тяги и вал
      if (c.mat === 0 && sz[2] > 3 && sz[2] < 4 && Math.abs(x) > 2.9) return null; // направляющие ПТУР («Вихрь») и балки под крыльями — оружие из игры
      if (c.mat === 7 && y < -3.4 && Math.abs(x) > 1.9) return null; // блоки НАР и их поперечины
      return 'body'; } },
  h_uh60: { src: `${DL}/uh60.glb`, scale: 1, fwd: [-0.9349, -0.355], rulesIn: 'game', tex: () => 1024, texVf: 'hue=s=0.55,eq=brightness=-0.03' /* без сдвига тона: сочно-зелёный с голубыми пятнами → приглушённый армейский */, glassAny: /^(fuzelag-FACES_0|kabina01-FACES_0)$/, glassColor: [0.05, 0.07, 0.08, 0.5], addBoxes: [{ c: [2.25, -0.55, -2.4], s: [2.2, 0.12, 1.5], mirror: true, paint: 'esss' }] /* крылья ESSS (у автора подвески нет) — под них пилоны и оружие из игры */, colors: { '#esss$': [0.05, 0.055, 0.04], '^kabina01-FACES$': [0.05, 0.055, 0.04], '^(Cylinder08-FACES_0|Sphere05-FACES)$': [0.3, 0.3, 0.3], '^Cylinder04-FACES$': [0.2, 0.2, 0.2] }, axisX: -0.1, centerBody: /^(rotor2?|trotor)$/, hubs: { rotor: [-0.083, 3.5, -1.627], trotor: [0.274, 3.65, 8.186] }, // UH-60 — manilov.ap (1 : 1: Ø несущего 16,4; фюзеляж по оси — 15,3 м); ось фюзеляжа повёрнута к осям автора на ≈ 21°
    groups: (c) => { const [x, y, z] = c.ctr, hr = Math.hypot(x + 0.083, z + 1.627);
      if (c.mat === 5 && Math.max(...c.size) > 3) return 'rotor'; // 4 лопасти
      if (y > 3.3 && y < 4.5 && hr < 1.7) return 'rotor'; // головка: рукава, тяги, втулка
      if ([5, 8, 14, 16, 26].includes(c.mat) && z > 6.4 && y > 1.9 && Math.hypot(x - 0.274, y - 3.65, z - 8.186) < 1.7) return 'trotor'; // рулевой винт: 4 лопасти и ступица
      return 'body'; } },
  h_mi8: { src: `${DL}/mi8.glb`, scale: 1, fwd: [-0.8334, 0.5526], rulesIn: 'game', tex: () => 1024, texVf: (i) => (i === 7 ? 'drawbox=x=402:y=82:w=52:h=52:color=0x335e55:t=fill,drawbox=x=404:y=166:w=56:h=26:color=0x335e55:t=fill,drawbox=x=402:y=585:w=52:h=52:color=0x335e55:t=fill,drawbox=x=404:y=528:w=56:h=26:color=0x335e55:t=fill,' : '') + 'hue=s=0.7' /* без сдвига тона: сочный бирюзовый камуфляж → приглушённый; чужие кокарды и бортовой номер автора закрашены */, glassAny: /steclo/, glassColor: [0.05, 0.07, 0.08, 0.5], addBoxes: [{ c: [2.05, -0.3, -4.0], s: [1.7, 0.1, 0.8], mirror: true, paint: 'truss' }] /* балка подвески МТВ (у автора её нет) */, colors: { '#truss$': [0.05, 0.065, 0.055], '^kabina-FACES$': [0.05, 0.055, 0.04] },
    axisX: -1.415, centerBody: /^(rotor2?|trotor)$/, hubs: { rotor: [-1.412, 2.7, -2.196], trotor: [-2.151, 2.75, 10.536] }, // Ми-8МТВ — manilov.ap (1 : 1: Ø несущего 21,4, длина по оси ≈ 18,5); ось повёрнута к осям автора на ≈ 34°; рулевой винт — слева от киля, 3 лопасти
    groups: (c) => { const [x, y, z] = c.ctr, hr = Math.hypot(x + 1.412, z + 2.196);
      if (c.mat >= 77 && c.mat <= 81) return 'rotor'; // 5 лопастей
      if (c.mat >= 55 && c.mat <= 76 && y > 2.2 && hr < 3.3) return 'rotor'; // втулка, рукава, тяги
      if (Math.hypot(x + 2.151, y - 2.75, z - 10.536) < 2.1 && z > 8) return 'trotor'; // рулевой винт: 3 лопасти и ступица
      return 'body'; } },
  h_rah66: { src: `${DL}/rah66.glb`, scale: 0.31, fwd: [-0.7178, 0.6962], rulesIn: 'game', tex: () => 1024, addBoxes: [{ c: [1.75, -0.5, -0.5], s: [1.7, 0.1, 1.3], mirror: true, paint: 'wing' }] /* крылышки EFAMS (в модели автора их нет) */, colors: { '#wing$': [0.05, 0.052, 0.055] }, glassAny: /^(fuzelag-FACES_0|kabuna_vnutr-FACES_0)$/, glassColor: [0.04, 0.05, 0.055, 0.55],
    centerBody: /^(rotor2?|trotor)$/, centerX: true, hubs: { rotor: [1.234, 3.317, -0.471], trotor: [1.284, 1.767, 6.514] }, // RAH-66 Comanche — manilov.ap (единицы автора ×0,31 по Ø несущего 11,9); ось фюзеляжа повёрнута к осям автора на ≈ 44°; рулевой винт — фенестрон (8 лопастей, поперечная ось)
    groups: (c) => { if (c.mat >= 66 && c.mat <= 71) return 'rotor'; // 5 лопастей и втулка
      if (c.mat >= 5 && c.mat <= 13) return 'trotor'; // лопасти и ступица фенестрона (направляющие — неподвижные, остаются в корпусе)
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
// «Тор-М1»: рамка ячейки на наклонной грани башни (pack_geo.py сборщика; оси файла: x, y вверх, z = −Y Blender): центр (±MX, MY, −Y[k]),
// n — наружу, w — вверх по скату; крышка — грани, у которых все вершины в |вдоль| ≤ 0,205, |по скату| ≤ 0,285, от грани −0,03…+0,10 м
const TOR_CELL = (() => { const S = 8.86 / 439, ZA = (325 - 160) * S - 0.02, ZC = (325 - 130) * S, DX = 1.30 - 0.85, DZ = ZC - ZA, L = Math.hypot(DX, DZ); return { MX: (1.30 + 0.85) / 2, MY: (ZA + ZC) / 2, nx: DZ / L, ny: DX / L, Y: [0.12, -0.28, -0.68, -1.08] }; })();
function torLid(v) {
  const C = TOR_CELL;
  for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) {
    const inside = v.every(([x, y, z]) => { const dx = x - sx * C.MX, dy = y - C.MY, a = z + C.Y[k], c = -sx * C.ny * dx + C.nx * dy, h = sx * C.nx * dx + C.ny * dy; return Math.abs(a) <= 0.205 && Math.abs(c) <= 0.285 && h >= -0.03 && h <= 0.1; });
    if (inside) return k * 2 + (sx > 0 ? 1 : 0);
  }
  return -1;
}
function torPart(c, near) {
  if (/(^|\/)radar/.test(c.path)) return 'radar';
  if (!/(^|\/)turret/.test(c.path)) return 'body';
  if (!near) return 'turret'; // дальняя копия: тарелка и крышки — в башне
  if (/(^|\/)turret_hwd/.test(c.path)) return 'dish';
  if (/(^|\/)turret_dish/.test(c.path)) return c.cc && Math.hypot(c.cc[0] - 0.45, c.cc[1] - 3.71, c.cc[2] + 2.99) < 0.42 ? 'dish' : 'turret'; // центр тарелки (0,45; 3,71; −2,99)
  const k = /(^|\/)turret_(main|hw|detail)/.test(c.path) ? torLid(c.v) : -1;
  return k >= 0 ? 'lid' + k : 'turret';
}
// NASAMS: части по первому слову имени узла; крышки lid_c<ряд><колонка> → lid0…5 (вблизи; в дальней копии — закрытые, в башне);
// мачта mast_boom: три кронштейна на левой стенке блока (рамка у стенки x > −1,045 м, меньше 0,2 м) — блок, остальное — mast (поднимается, raise)
function nasamsPart(c, near) {
  const p = c.path, L = p.match(/(^|\/)lid_c([12])([123])/);
  if (L) return near ? 'lid' + ((+L[2] - 1) * 3 + (+L[3] - 1)) : 'turret';
  if (/(^|\/)mast_boom/.test(p)) return c.max[0] > -1.045 && c.size[1] < 0.2 && c.size[2] < 0.2 ? 'cradle' : 'mast';
  if (/(^|\/)(cradle|missile)_/.test(p)) return 'cradle';
  return /(^|\/)turret_/.test(p) ? 'turret' : 'body';
}
// С-300: части по первому слову имени узла; крышки lid_c<ряд><столбец> → lid0…3 (вблизи; в дальней копии — закрытые, в пакете)
function s300Part(c, near) {
  const p = c.path, L = p.match(/(^|\/)lid_c([12])([12])/);
  if (L) return near ? 'lid' + ((+L[2] - 1) * 2 + (+L[3] - 1)) : 'cradle';
  const J = p.match(/(^|\/)jack_(\d)/); if (J) return 'jack' + J[2];
  const Y = [...p.matchAll(/(?:^|\/)cyl_(barrel|rod1|rod2)/g)].pop(); if (Y) return 'cyl' + ['barrel', 'rod1', 'rod2'].indexOf(Y[1]); // штоки — дети корпуса цилиндра: по последнему узлу пути
  return /(^|\/)pack_/.test(p) ? 'cradle' : 'body';
}
// ПВО: дальние копии (_lo) — main.js рисует их дальше 400 м (THREE.LOD по частям: корпус, башня, пакет)
const SAM_LO = ['osa', 'bukm3', 's125', 'gepard', 'ew_e', 'tor', 'pantsir', 'sampt', 'tunguska', 'skyguard', 'rapier', 'zsu234', 'm163', 'chaparral', 'avenger'];
for (const k of SAM_LO) CONFIG[k + '_lo'] = { ...CONFIG[k], target: k === 'tor' || k === 'pantsir' ? 15000 : 20000, simpErr: 0.05, tex: () => 256, nTex: null };
CONFIG.bukm3_lo.tracks = { ...CONFIG.bukm3.tracks, links: false }; // дальняя копия: лента — гладкая, без звеньев
// Гепард (своя модель, 23 тыс.): дальняя копия — 8 тыс. треугольников, цвет 256, без карты нормалей
CONFIG.gepard_lo = { ...CONFIG.gepard, target: 8000, simpErr: 0.05, tex: () => 256, nTex: null };
// «Стрела-1» (основа 130 тыс., почти всё — колёса): дальняя копия — 15 тыс., цвет 512, без нормалей
CONFIG.strela1_lo = { ...CONFIG.strela1, target: 15000, simpErr: 0.05, tex: () => 512, nTex: null };
// Sentinel (67 тыс., почти всё — «Хамви» основы): дальняя копия — 15 тыс., цвет 512, без нормалей
CONFIG.ew_w_lo = { ...CONFIG.ew_w, target: 15000, simpErr: 0.05, tex: () => 512, nTex: null };
// «Тор-М1» (своя, 68 тыс.): дальняя копия — 12 тыс., цвет 512 (камуфляж — в цвете), без нормалей, тарелка и крышки — в башне
CONFIG.nasams_lo = { ...CONFIG.nasams, target: 12000, simpErr: 0.05, tex: () => 512, nTex: null, groups: (c) => nasamsPart(c, false) }; // NASAMS: дальняя — 12 тыс., крышки закрыты
CONFIG.tor_lo = { ...CONFIG.tor, target: 12000, simpErr: 0.05, tex: () => 512, nTex: null, perTriComp: false, groups: (c) => torPart(c, false) };
// С-300 / С-400 (своя): дальняя копия — облегчённая сборщиком (61 тыс.), цвет 512, без нормалей; домкраты и цилиндр — свои части (двигаются и вдали)
CONFIG.s300_lo = { ...CONFIG.s300, src: `${DL}/Свои/С-300/s300_lo.glb`, tex: () => 512, nTex: null, groups: (c) => s300Part(c, false) };
// «РЛС на вершине»: дальняя копия сборщика (25 тыс., без мелочи deco_props), цвет 512, без нормалей; узлы — те же
CONFIG.site_radar_lo = { ...CONFIG.site_radar, src: `${DL}/Свои/РЛС на вершине/radar_site_lo.glb`, tex: () => 512, nTex: null };
CONFIG.site_heli_lo = { ...CONFIG.site_heli, src: `${DL}/Свои/Вертолётная площадка/heli_site_lo.glb`, tex: () => 512, nTex: null }; // «Ведьмина поляна»: дальняя сборщика (21 тыс., без ограды и палаток)
CONFIG.site_ammo_city_lo = { ...CONFIG.site_ammo_city, src: `${DL}/Свои/Склад боеприпасов/ammo_city_lo.glb`, tex: (m) => (m.name === 'tile_conc' ? 256 : 512), nTex: null }; // склад: дальняя сборщика (24 тыс., без ограды и мелочи)
// «Арсенал в ущелье» (зима, w_ammo) — из того же набора (Свои/Арсенал в ущелье, 2026-10-28): те же материалы, окраска «зима» (снег кладёт игра); +останец со штольнями
CONFIG.site_ammo_w = { ...CONFIG.site_ammo_city, src: `${DL}/Свои/Арсенал в ущелье/arsenal.glb` };
CONFIG.site_ammo_w_lo = { ...CONFIG.site_ammo_city_lo, src: `${DL}/Свои/Арсенал в ущелье/arsenal_lo.glb` };
// склад «Фонарь Джека» (осень, a_farm) — из того же набора (Свои/Фонарь Джека, 2026-10-28): хранилища, бывшие коровники, окраска «после дождей»
// весь неразрушаемый декор deco_* — одной частью 'deco' (кроме deco_trees: у елей зимой свой снег): игра склеивает меши одной части по материалу —
// у склада горючего было 63 вызова отрисовки вблизи и 58 издали против 41 / 36 у склада боеприпасов (ревью 2026-10-28); у прежних сцен — при их перевыпуске
const siteGroups = (c) => { const n = c.path.split('/').pop().replace(/\.\d+$/, ''); return /^deco_/.test(n) && !/^deco_trees/.test(n) ? 'deco' : n; };
CONFIG.site_ammo_a = { ...CONFIG.site_ammo_city, src: `${DL}/Свои/Фонарь Джека/jack.glb`, groups: siteGroups };
CONFIG.site_ammo_a_lo = { ...CONFIG.site_ammo_city_lo, src: `${DL}/Свои/Фонарь Джека/jack_lo.glb`, groups: siteGroups };
// «Склад горючего» (город, oil) — второй сборщик (Свои/Склад горючего, 2026-10-28), свой набор: материалы F_A / F_B / F_glassF + те же tile_conc / tile_mesh
CONFIG.site_fuel_city = { ...CONFIG.site_ammo_city, src: `${DL}/Свои/Склад горючего/fuel_city.glb`, groups: siteGroups, colors: { '^tile_conc$': [0.84, 0.84, 0.82], '^F_glassF$': [0.08, 0.1, 0.11] } };
CONFIG.site_fuel_city_lo = { ...CONFIG.site_ammo_city_lo, src: `${DL}/Свои/Склад горючего/fuel_city_lo.glb`, groups: siteGroups, colors: CONFIG.site_fuel_city.colors };
CONFIG.site_fuel_w = { ...CONFIG.site_fuel_city, src: `${DL}/Свои/Склад ГСМ зима/fuel_w.glb` }; // зимний «Склад ГСМ» (w_fuel) — из того же набора
CONFIG.site_fuel_w_lo = { ...CONFIG.site_fuel_city_lo, src: `${DL}/Свои/Склад ГСМ зима/fuel_w_lo.glb` };
// «Парк бронетехники» (город, stad) — первый сборщик, набор военного городка: + бесшовная tile_po2 (плиты ограды ПО-2, 1024)
CONFIG.site_park_city = { ...CONFIG.site_ammo_city, src: `${DL}/Свои/Парк бронетехники/park_city.glb`, groups: siteGroups, tex: (m) => ({ tile_conc: 1024, tile_mesh: 512, tile_po2: 1024 })[m.name] || 2048 };
CONFIG.site_park_city_lo = { ...CONFIG.site_ammo_city_lo, src: `${DL}/Свои/Парк бронетехники/park_city_lo.glb`, groups: siteGroups };
CONFIG.site_fuel_a = { ...CONFIG.site_fuel_city, src: `${DL}/Свои/Болотный огонь/fuel_a.glb` }; // склад ГСМ «Болотный огонь» (осень, a_peat) — из набора склада горючего
CONFIG.site_fuel_a_lo = { ...CONFIG.site_fuel_city_lo, src: `${DL}/Свои/Болотный огонь/fuel_a_lo.glb` };
CONFIG.site_garr_w = { ...CONFIG.site_park_city, src: `${DL}/Свои/Военный городок/garr_w.glb` }; // «Военный городок» (зима, w_garr) — из набора парка
CONFIG.site_garr_w_lo = { ...CONFIG.site_park_city_lo, src: `${DL}/Свои/Военный городок/garr_w_lo.glb` };
CONFIG.site_cp_w = { ...CONFIG.site_fuel_city, src: `${DL}/Свои/Командный пункт/cp_w.glb` }; // «Командный пункт» (зима, w_cp) — набор КП второго сборщика (материалы F_*)
CONFIG.site_cp_w_lo = { ...CONFIG.site_fuel_city_lo, src: `${DL}/Свои/Командный пункт/cp_w_lo.glb` };
// машины: дальние копии (_lo, ~1000 треуг.) — для движения на дорогах дальше 250 м
for (const k of ['compact', 'coupe', 'hatch', 'van', 'offroad', 'pickup', 'sedan', 'sport', 'suv', 'wagon', 'police']) CONFIG[`c_${k}_lo`] = { ...CONFIG[`c_${k}`], target: 1000, simpErr: 0.05, tex: () => 128 };
// дальние копии противника «Летки» (_lo): вдали тонкие крылья можно упрощать сильнее — дефектов не видно, а треугольников в разы меньше
for (const [k, t] of [['e_mig21', 3000], ['e_mig31', 9000], ['e_su57', 7000], ['e_tu22m3', 7000], ['e_gripen', 3000], ['e_f22', 4000], ['e_f35', 9000]]) CONFIG[k + '_lo'] = { ...CONFIG[k], target: t, simpErr: 0.05, tex: () => 256 };
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
// ── гусеницы: замкнутая лента по осевой линии — выпуклая оболочка окружностей колёс (circles: [z, y, радиус осевой линии]), сверху срезана на y = top ──
// (верх прячется под полкой корпуса); звенья с шагом pitch: плита t × w, два грунтозацепа снаружи; links: false — гладкая лента из длинных плит (дальняя копия)
function orientedBox(M, c, ax, h) {
  for (let i = 0; i < 3; i++) for (const sgn of [1, -1]) {
    const j = (i + 1) % 3, k = (i + 2) % 3, nrm = ax[i].map((v) => v * sgn), base = M.pos.length / 3;
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) M.pos.push(...[0, 1, 2].map((d) => c[d] + nrm[d] * h[i] + ax[j][d] * a * h[j] + ax[k][d] * b * h[k])), M.nor.push(...nrm);
    const P0 = (q) => M.pos.slice((base + q) * 3, (base + q) * 3 + 3), A = P0(0), B = P0(1), C = P0(2), e1 = B.map((v, d) => v - A[d]), e2 = C.map((v, d) => v - A[d]);
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], fl = cr[0] * nrm[0] + cr[1] * nrm[1] + cr[2] * nrm[2] < 0;
    M.idx.push(...(fl ? [base, base + 2, base + 1, base, base + 3, base + 2] : [base, base + 1, base + 2, base, base + 2, base + 3]));
  }
}
function buildTracks(T) {
  const pts = [];
  for (const [z, y, r] of T.circles) for (let q = 0; q < 72; q++) { const a = q / 72 * 2 * Math.PI; pts.push([z + r * Math.cos(a), y + r * Math.sin(a)]); }
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
  for (const q of pts) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of [...pts].reverse()) { while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  let hull = [...lo.slice(0, -1), ...up.slice(0, -1)]; // против часовой стрелки в осях (z, y)
  // срез сверху: Сазерленд — Ходжман по y ≤ top
  const clip = []; for (let q = 0; q < hull.length; q++) { const a = hull[q], b = hull[(q + 1) % hull.length], ia = a[1] <= T.top, ib = b[1] <= T.top;
    if (ia) clip.push(a); if (ia !== ib) { const f = (T.top - a[1]) / (b[1] - a[1]); clip.push([a[0] + (b[0] - a[0]) * f, T.top]); } }
  hull = clip;
  const edges = hull.map((a, q) => { const b = hull[(q + 1) % hull.length]; return { a, b, l: Math.hypot(b[0] - a[0], b[1] - a[1]) }; }), L = edges.reduce((n, e) => n + e.l, 0);
  const at = (s) => { s = ((s % L) + L) % L; for (const e of edges) { if (s <= e.l) return [e.a[0] + (e.b[0] - e.a[0]) * s / e.l, e.a[1] + (e.b[1] - e.a[1]) * s / e.l]; s -= e.l; } return hull[0]; };
  const n = Math.max(8, Math.round(L / (T.links ? T.pitch : 0.3))), p = L / n, out = [];
  for (const sg of [1, -1]) {
    const M = { group: 'body', paint: 'track', mat: -1, keep: true, forceGlass: false, pos: [], nor: [], uv: [], idx: [], tc: [], hasUv: false };
    for (let i = 0; i < n; i++) {
      const c = at((i + 0.5) * p), a = at(i * p), b = at((i + 1) * p), tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, tz = (b[0] - a[0]) / tl, ty = (b[1] - a[1]) / tl;
      const et = [0, ty, tz], en = [0, -tz, ty], ex = [1, 0, 0], C0 = [sg * T.xc, c[1], c[0]]; // наружу — (n_z, n_y) = (ty, −tz)
      const half = T.links ? p * 0.47 : tl * 0.53;
      orientedBox(M, C0, [ex, et, en], [T.w / 2, half, T.t / 2]);
      if (T.links) for (const o of [-0.26, 0.26]) orientedBox(M, [C0[0], C0[1] + et[1] * p * o + en[1] * (T.t / 2 + 0.0175), C0[2] + et[2] * p * o + en[2] * (T.t / 2 + 0.0175)], [ex, et, en], [T.w * 0.46, p * 0.06, 0.0175]);
    }
    out.push(M);
  }
  console.log(`  гусеницы: лента ${L.toFixed(2)} м, звеньев ${n} на борт${T.links ? '' : ' (гладкая)'}, ${out.reduce((q, m) => q + m.idx.length / 3, 0)} треугольников`);
  return out;
}
async function prepare(name, views) {
  let cfg = CONFIG[name], g = readGlb(Deno.readFileSync(srcOf(cfg.src))), J = g.json, prims = flatten(g, { raw: !!cfg.raw }).filter((p) => (!cfg.pickMesh || cfg.pickMesh.test(p.path)) && !(cfg.dropMat && cfg.dropMat.test(((J.materials || [])[p.material] || {}).name || ''))) /* dropMat — материалы долой (линии рёбер SketchUp) */, ax = cfg.axes || (cfg.fwd ? axFwd(cfg.fwd) : AX[cfg.nose]);
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
  // raiseSel — поднятая сборка (направляющая с ракетой у «Искандера») поворачивается вокруг шарнира: { sel(c) — какие части (c: ctr, size, path — в осях правил, после copyParts),
  // hinge: [y, z] — ось шарнира вдоль X через эту точку (оси правил, метры, до центровки), angle — рад: (y, z) → (y·cos − z·sin, y·sin + z·cos) }
  if (cfg.raiseSel) for (const p of prims) {
    const { comp, list } = components(p.P, p.I, 0.001), want = new Set(), { sel, hinge: [hy, hz], angle } = cfg.raiseSel, co = Math.cos(angle), si = Math.sin(angle);
    for (const c of list) { c.ctr = c.max.map((v, k) => (v + c.min[k]) / 2); c.size = c.max.map((v, k) => v - c.min[k]); c.mat = p.material; c.path = p.path; if (sel(c)) want.add(c.id); }
    if (!want.size) continue;
    const vs = new Set(); for (let t = 0; t < comp.length; t++) if (want.has(comp[t])) for (let k = 0; k < 3; k++) vs.add(p.I[t * 3 + k]);
    for (const v of vs) { const y = p.P[v * 3 + 1] - hy, z = p.P[v * 3 + 2] - hz; p.P[v * 3 + 1] = hy + y * co - z * si; p.P[v * 3 + 2] = hz + y * si + z * co;
      if (p.N) { const ny = p.N[v * 3 + 1], nz = p.N[v * 3 + 2]; p.N[v * 3 + 1] = ny * co - nz * si; p.N[v * 3 + 2] = ny * si + nz * co; } }
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
      // perTriComp — правилу нужна и связная деталь треугольника (cc — середина её рамки): тарелка «Тора» — детали у её центра
      const CC = cfg.perTriComp ? components(p.P, p.I, 0.001) : null, ccOf = CC && new Map(CC.list.map((q) => [q.id, q.max.map((v, k) => (v + q.min[k]) / 2)]));
      for (let t = 0; t < p.I.length / 3; t++) {
        const c = { min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9], v: CC ? [] : null, cc: CC ? ccOf.get(CC.comp[t]) : null }; // v — три вершины (крышки ячеек «Тора»: грань целиком в рамке; только при perTriComp)
        for (let k = 0; k < 3; k++) { const v = p.I[t * 3 + k] * 3; if (c.v) c.v.push([p.P[v], p.P[v + 1], p.P[v + 2]]); for (let d = 0; d < 3; d++) { c.min[d] = Math.min(c.min[d], p.P[v + d]); c.max[d] = Math.max(c.max[d], p.P[v + d]); } }
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
      let M = byMat.get(key); if (!M) byMat.set(key, M = { group: grp, paint, mat: p.material, mname: (J.materials && J.materials[p.material] && J.materials[p.material].name) || '', forceGlass: fg, pos: [], nor: [], uv: [], idx: [], tc: [], hasUv: !!p.UV });
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
  // swing — консоли крыла (материал cfg.swing.mat) поворачиваются вокруг вертикальных шарниров на ±pivot[0] от оси axisX, z = pivot[1], на угол ang: передняя кромка идёт вперёд (меньше стреловидность)
  if (cfg.swing) { const { mat, axisX: a0, pivot: [pd, pz], ang } = cfg.swing, co = Math.cos(ang), si = Math.sin(ang), mats = [].concat(mat); // mat — номер материала или список (у B-1B левая и правая консоли — разные материалы)
    for (const m of byMat.values()) if (mats.includes(m.mat)) {
      for (let i = 0; i < m.pos.length; i += 3) { const sg = m.pos[i] > a0 ? 1 : -1, px = a0 + sg * pd, dx = m.pos[i] - px, dz = m.pos[i + 2] - pz;
        m.pos[i] = px + dx * co + sg * dz * si; m.pos[i + 2] = pz - sg * dx * si + dz * co;
        const nx = m.nor[i], nz = m.nor[i + 2]; m.nor[i] = nx * co + sg * nz * si; m.nor[i + 2] = -sg * nx * si + nz * co; } }
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
  const dz = cfg.axisZ !== undefined ? cfg.axisZ : (bodyB.mn[2] + bodyB.mx[2]) / 2, dy = cfg.unit ? (cfg.ground !== undefined ? cfg.ground : all.mn[1]) : cfg.centerBody ? (bodyB.mn[1] + bodyB.mx[1]) / 2 : cfg.centerY !== undefined ? 0 : (all.mn[1] + all.mx[1]) / 2, dx = cfg.axisX !== undefined ? cfg.axisX : cfg.pick || cfg.pickMesh || cfg.unit || cfg.centerX ? (bodyB.mn[0] + bodyB.mx[0]) / 2 : 0;
  for (const m of byMat.values()) for (let i = 0; i < m.pos.length; i += 3) { m.pos[i] -= dx; m.pos[i + 1] -= dy; m.pos[i + 2] -= dz; }
  if (cfg.centerBody) {
    console.log(`  центровка: сдвиг ${[dx, dy, dz].map((v) => v.toFixed(3)).join(' ')} (из осей правил: точка − сдвиг = точка в модели)`);
    console.log(`  корпус без винтов: длина ${(bodyB.mx[2] - bodyB.mn[2]).toFixed(2)} м, ширина ${(bodyB.mx[0] - bodyB.mn[0]).toFixed(2)} м, высота ${(bodyB.mx[1] - bodyB.mn[1]).toFixed(2)} м`);
    for (const [g, h] of Object.entries(cfg.hubs || {})) { let R = 0; for (const m of byMat.values()) if (m.group === g) for (let i = 0; i < m.pos.length; i += 3) { const a = m.pos[i] - (h[0] - dx), b = m.pos[i + 1] - (h[1] - dy), c = m.pos[i + 2] - (h[2] - dz); R = Math.max(R, g === 'trotor' ? Math.hypot(b, c) : Math.hypot(a, c)); } if (R) console.log(`  винт ${g}: радиус ${R.toFixed(2)} м, Ø ${(2 * R).toFixed(2)} м`); }
  }
  // addBoxes (вертолёты без подвесок у автора): свои прямоугольные детали — крылышки, балки — в осях модели ПОСЛЕ центровки, метры:
  // { c: [x, y, z], s: [длина по x, толщина по y, хорда по z], mirror: true — и зеркально (−x), paint — краска (cfg.colors['#paint']) }
  if (cfg.addBoxes) for (const [bi, b] of cfg.addBoxes.entries()) for (const sg of b.mirror ? [1, -1] : [1]) {
    const M = { group: 'body', paint: b.paint || 'box', mat: -1, forceGlass: false, pos: [], nor: [], uv: [], idx: [], tc: [], hasUv: false }, [hx, hy, hz] = b.s.map((v) => v / 2);
    for (const [nx, ny, nz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const u = nx ? [0, 1, 0] : [1, 0, 0], v = nx ? [0, 0, 1] : ny ? [0, 0, 1] : [0, 1, 0], h = [hx, hy, hz], base = M.pos.length / 3;
      for (const [a, c2] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const q = [0, 1, 2].map((d) => (nx ? [nx, 0, 0] : ny ? [0, ny, 0] : [0, 0, nz])[d] * h[d] + u[d] * a * h[d] + v[d] * c2 * h[d]); M.pos.push(sg * q[0] + b.c[0] * sg, q[1] + b.c[1], q[2] + b.c[2]); M.nor.push(sg * nx, ny, nz); }
      // обход вершин — против часовой стрелки, если смотреть снаружи (у «зеркальной» половины и у граней −x / +y он выходил наоборот: коробка выглядела вывернутой)
      const P0 = (k) => M.pos.slice((base + k) * 3, (base + k) * 3 + 3), A = P0(0), B = P0(1), Cc = P0(2), e1 = B.map((v, d) => v - A[d]), e2 = Cc.map((v, d) => v - A[d]);
      const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], fl = cr[0] * sg * nx + cr[1] * ny + cr[2] * nz < 0;
      M.idx.push(...(fl ? [base, base + 2, base + 1, base, base + 3, base + 2] : [base, base + 1, base + 2, base, base + 2, base + 3]));
    }
    byMat.set(`box${bi}${sg}`, M);
  }
  // tracks — гусеницы комплекса (у автора нет): по бортам x = ±xc, лента звеньями (links) или гладкая; тёмная краска #track, часть body (в осях правил, затем центровка)
  if (cfg.tracks) buildTracks(cfg.tracks).forEach((M, i) => { for (let k = 0; k < M.pos.length; k += 3) { M.pos[k] -= dx; M.pos[k + 1] -= dy; M.pos[k + 2] -= dz; } byMat.set(`track${i}`, M); });
  if (cfg.groups && cfg.unit) articulate(cfg, byMat, [dx, dy, dz], cfg.rulesIn === 'game' ? (x, y, z) => [x / cfg.scale, y / cfg.scale, z / cfg.scale] : ax);
  SIMP_ERR = cfg.simpErr || 0.05; WELD = cfg.weld || 1e-4; CLUSTER = !!cfg.cluster; LOCK = !!cfg.lockBorder; SKEEP = cfg.simpKeep || null;
  // PREPARE_SIMP — проба упрощения без правки конфига: 'none' — без него; 'доля:ошибка[:lock]' — своя доля, ошибка (доля размера), lock — края
  // открытых листов закреплены (стенд tools/airdef-models/house-compare.html, 2026-10-27)
  const PS = Deno.env.get('PREPARE_SIMP');
  if (PS === 'none') { cfg = { ...cfg }; delete cfg.simplify; delete cfg.target; } else if (PS) { const [r, e, l, kp] = PS.split(':'); cfg = { ...cfg, simplify: +r, target: undefined }; SIMP_ERR = +e || SIMP_ERR; LOCK = l === 'lock'; SKEEP = kp ? new RegExp(kp) : SKEEP; } // 4-е поле — материалы без упрощения
  // target — бюджет треугольников (упрощение до него, но не дальше допустимой ошибки SIMP_ERR — форма не мнётся); simplify — доля
  if (cfg.target || cfg.simplify) {
    let total = 0; for (const m of byMat.values()) if (!m.keep) total += m.idx.length / 3;
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
    const key = `${J.textures[ti].source}:${size}:${png}`; if (texCache.has(key)) return texCache.get(key); // одна картинка у нескольких текстур (материалов) — один файл
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
    // карта нормалей (у своих моделей запечена в Blender): PNG без потерь, размер cfg.nTex; у дальних копий (nTex: null) её нет
    if (src.normalTexture && m.hasUv && !glass && cfg.nTex) mat.normalTexture = { index: await texture(src.normalTexture.index, cfg.nTex(src), true), scale: src.normalTexture.scale ?? 1 };
    materials.push(mat);
    const pos = new Float32Array(m.pos), b = bbox(pos), n = pos.length / 3, attrs = {};
    accs.push({ bufferView: add(pos, 34962), componentType: 5126, count: n, type: 'VEC3', min: b.mn, max: b.mx }); attrs.POSITION = accs.length - 1;
    accs.push({ bufferView: add(new Float32Array(m.nor), 34962), componentType: 5126, count: n, type: 'VEC3' }); attrs.NORMAL = accs.length - 1;
    if (mat.pbrMetallicRoughness.baseColorTexture || mat.normalTexture) { accs.push({ bufferView: add(new Float32Array(m.uv), 34962), componentType: 5126, count: n, type: 'VEC2' }); attrs.TEXCOORD_0 = accs.length - 1; }
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
  // PREPARE_OUT — папка для готового файла вместо games/airdef/models/ (превью кандидата: tools/airdef-models/preview-candidate.js)
  const dir = Deno.env.get('PREPARE_OUT') ? Deno.env.get('PREPARE_OUT').replace(/\/?$/, '/') : new URL('../../games/airdef/models/', import.meta.url).pathname; await Deno.mkdir(dir, { recursive: true });
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
  // raise — часть group поворачивается вокруг оси X через hinge на angle (как radarRaise) и уходит в группу to (мачта NASAMS — поднята, в башне)
  if (cfg.raise) { const R = cfg.raise, h = sub(ax(...R.hinge).map((v) => v * cfg.scale)); let n = 0; for (const m of byMat.values()) if (m.group === R.group) { raiseX(m.pos, m.nor, h, R.angle); m.group = R.to; n += m.idx.length / 3; } console.log(`  поднято (${R.group} → ${R.to}): ${n} треугольников`); }
  const hinge = cfg.hinge ? sub(ax(...cfg.hinge).map((v) => v * cfg.scale)) : null;
  // ракеты на направляющих (группа missile) качаются вместе с пакетом
  // dish (тарелка «Тора») и lid0…7 (крышки его ячеек) — части башни: в её осях, игра двигает их сама
  // расчёт ПЗРК: th0…5 — головы наводчика по позам угла места (части башни), ca0…5 — его руки (части пакета, уже в осях пакета при угле 0);
  // второй номер — своя башня turret1 (ось tp1) и рука cs0…2 (шарнир hinge1) — в осях модели, без центровки (axisX, ground, axisZ — 0)
  if (cfg.tp1) for (const m of byMat.values()) if (m.group === 'turret1' || /^cs\d+$/.test(m.group)) { const o = m.group === 'turret1' ? cfg.tp1 : cfg.hinge1; for (let i = 0; i < m.pos.length; i += 3) { m.pos[i] -= o[0]; m.pos[i + 1] -= o[1]; m.pos[i + 2] -= o[2]; } }
  const T = [...byMat.values()].filter((m) => m.group === 'turret' || m.group === 'radar' || m.group === 'dish' || /^lid\d/.test(m.group) || /^th\d+$/.test(m.group)), K = [...byMat.values()].filter((m) => m.group === 'cradle' || m.group === 'missile' || /^ca\d+$/.test(m.group));
  if (!T.length && !K.length) return; // машина целиком
  if (!K.length && T.every((m) => m.group === 'radar')) return; // только антенна обзора без башни (Sentinel): в осях модели, игра крутит её вокруг оси опоры
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
      const M = { group: grp, paint: grp === 'missile' ? m.paint : undefined, mat: m.mat, pos: [], nor: [], uv: [], idx: [], tc: [], hasUv: m.hasUv }, map = new Map();
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
let SIMP_ERR = 0.05, WELD = 1e-4, CLUSTER = false, LOCK = false, SKEEP = null; // SKEEP (cfg.simpKeep) — материалы, которые не упрощаются (черепица из перекрытых полос рвётся) // LOCK (cfg.lockBorder) — края открытых листов не двигаются (черепица, навесы)
async function simplifyAll(byMat, ratio) {
  await MeshoptSimplifier.ready;
  let before = 0, after = 0;
  for (const m of byMat.values()) {
    if (m.idx.length < 30 || m.keep || (SKEEP && SKEEP.test(m.mname || ''))) continue; // крошки, готовые детали (keep — гусеницы) и SKEEP не упрощаем
    const nv = m.pos.length / 3, wid = new Uint32Array(nv), key = new Map(), wpos = [], cand = [];
    for (let v = 0; v < nv; v++) {
      const k = `${Math.round(m.pos[v * 3] / WELD)},${Math.round(m.pos[v * 3 + 1] / WELD)},${Math.round(m.pos[v * 3 + 2] / WELD)}`;
      let w = key.get(k); if (w === undefined) { key.set(k, w = wpos.length / 3); wpos.push(m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2]); cand.push([]); }
      wid[v] = w; cand[w].push(v);
    }
    const widx = Uint32Array.from(m.idx, (v) => wid[v]); before += widx.length / 3;
    const target = Math.max(3, Math.floor(widx.length * ratio / 3) * 3);
    let [out] = MeshoptSimplifier.simplify(widx, Float32Array.from(wpos), 3, target, SIMP_ERR, LOCK ? ['LockBorder'] : []);
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
    if (cfg.own) continue; // собственные модели (own: true) — своя работа, титров чужих авторов нет
    const ck = cfg.src + (cfg.credit ? '|' + cfg.credit : ''); // credit — пометка об адаптации: отдельная запись титров (menu.js выводит её в названии)
    let e = bySrc.get(ck);
    // orig — исходник оказался перезаливом: в титрах настоящий автор и его страница (из asset.extras файла был бы тот, кто перезалил)
    if (!e) { const J = readGlb(Deno.readFileSync(srcOf(cfg.src))).json, x = cfg.orig || (J.asset && J.asset.extras) || {}; bySrc.set(ck, e = { title: (x.title || '') + (cfg.credit ? ` (${cfg.credit})` : ''), author: (x.author || '').replace(/ \(.*$/, ''), url: x.source || '', license: (x.license || '').replace(/ \(.*$/, ''), files: [] }); }
    e.files.push(name);
  }
  const list = [...bySrc.values()];
  Deno.writeTextFileSync(`${dir}credits.js`, `// Создано tools/airdef-models/prepare.js --credits — не править руками\nexport const CREDITS = ${JSON.stringify(list, null, 1)};\n`);
  Deno.writeTextFileSync(`${dir}CREDITS.md`, `# 3D-модели «Воздушного превосходства»\n\nВсе — с Sketchfab и Thingiverse (модели для печати — tools/airdef-models/stl2glb.js), лицензии указаны. Для игры изменены (tools/airdef-models/prepare.js): убраны лишние части, упрощены\nсетки, переведены в метры и развёрнуты, разделены на корпус / башню / пакет, текстуры уменьшены и пересжаты в JPEG.\n\n` +
    list.map((c) => `- "${c.title}" (${c.url}) by ${c.author} — ${c.license} — ${c.files.map((f) => '`' + f + '.glb`').join(', ')}`).join('\n') + '\n');
  console.log(`авторов ${list.length}, файлов ${list.reduce((n, c) => n + c.files.length, 0)}`);
  Deno.exit(0);
}
// PREPARE_SRC — файл-кандидат (экспорт из Blender) вместо исходника ключа: конфиг своей модели (нос −Z, метры, материалы как есть); ключ может быть и новым
if (Deno.env.get('PREPARE_SRC') && Deno.args[0] && Deno.args[0] !== 'all' && !Deno.args[0].startsWith('--')) CONFIG[Deno.args[0]] = { src: Deno.env.get('PREPARE_SRC'), scale: 1, nose: '-z', tex: () => Number(Deno.env.get('PREPARE_TEX') || 256), ...(Deno.env.get('PREPARE_NTEX') ? { nTex: () => Number(Deno.env.get('PREPARE_NTEX')) } : {}), pickMesh: /./, own: true };
const names = Deno.args[0] === 'all' ? Object.keys(CONFIG) : [Deno.args[0]];
if (!CONFIG[names[0]]) { console.log('модели:', Object.keys(CONFIG).join(', '), '| all'); Deno.exit(1); }
for (const n of names) await prepare(n, Deno.args.includes('--views'));
