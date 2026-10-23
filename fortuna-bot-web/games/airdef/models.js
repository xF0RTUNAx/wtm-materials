// Готовые модели (glb, подготовленные tools/airdef-models/prepare.js: метры, нос в −Z, позиции / нормали / UV,
// текстуры цвета в JPEG). Загружаются в фоне при старте; пока не загрузились (или если загрузка не удалась) — в игре
// процедурные модели из units-render.js. Материалы — Phong, как у остальной техники (освещение и туман игры).
// Для каждой модели: сторона и класс (strike — ударные загрузки с бомбами, fighter — ракетные), точки подвески
// (как у процедурных: L3 L2 L1 Ф1 Ф2 R1 R2 R3; py — высота дорисованного пилона, если у модели его нет), сопла (срез, по
// tools/airdef-models/planes-view.html?ortho=1; dry — двигатель без форсажа: только слабое свечение; нет сопел — пламени не видно: B-2, F-117) и место
// контейнера. Авторы и лицензии — MODEL_CREDITS (показываются в «Настройках»).
/* global THREE */
import { tr } from './i18n.js?v=20261022z';
import { CREDITS } from './models/credits.js?v=20261022z';
import { mergeLocal } from './merge.js?v=20261022z';
import { cachedFetch } from './offline.js?v=20261022z';
import { ktxOn, ktxParse, ktxFree, ktxIndexUrl, ktxUrlOf } from './ktx.js?v=20261022z';
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
    nozzles: [V(-0.49, -0.94, 8.2), V(0.49, -0.94, 8.2)], nr: 0.4, pod: V(0, -1.96, 1.0) },
  // General Dynamics F-16D Block 60 — Muhamad Mirza Arrafi: запад, ракетные загрузки
  // (на законцовках крыльев — свои AIM-120, пилоны под крылом дорисованы)
  f16: { side: 'west', cls: 'fighter', stations: mirror([V(-3.9, -1.34, 2.4, 0.36), V(-3.0, -1.38, 2.2, 0.38), V(-2.15, -1.39, 2.0, 0.38), V(-0.75, -1.6, 1.0, 0.22)]),
    nozzles: [V(0, -0.9, 6.5)], nr: 0.55, pod: V(0.75, -1.62, -0.5) },
  // ── свой самолёт у каждой подвески (2026-10-12); lazy — грузится, когда нужен (выбран в подвеске или летит в налёте),
  // pod: null — прицельная система встроенная (контейнер не вешается); internal — оружие во внутренних отсеках (не видно до пуска)
  e_su24: { side: 'east', cls: 'strike', lazy: true, stations: mirror([V(-4.8, -1.13, 3.4, 0.3), V(-2.08, -1.39, 1.87), V(-0.5, -2.1, 3.0), V(-0.4, -2.12, -0.4)]),
    nozzles: [V(-0.6, -1.29, 9.86), V(0.6, -1.29, 9.86)], nr: 0.32, pod: null }, // Су-24М — manilov.ap («Кайра» встроена; пилоны консолей дорисованы)
  // ── 2026-10-19: manilov.ap (Tornado, F-111, МиГ-23, МиГ-27, Ту-22М2), Spark_Customs (F-15E); A-10 с 2026-10-22 — AIRMAN Magazine ──
  e_tornado: { side: 'west', cls: 'strike', lazy: true, stations: mirror([V(-5.41, -1.68, 1.59), V(-2.95, -1.88, 0.52), V(-0.75, -2.27, -1.2), V(-0.75, -2.33, 2.4)]),
    nozzles: [V(-0.59, -1.19, 6.34), V(0.59, -1.19, 6.34)], nr: 0.25, pod: V(0, -2.35, 0.5) }, // Tornado IDS
  e_f111: { side: 'west', cls: 'strike', lazy: true, stations: mirror([V(-4.42, -1.43, 2.07), V(-3.03, -1.35, 1.62), V(-0.6, -1.99, -0.5), V(-0.6, -1.99, 1.5)]),
    nozzles: [V(-0.76, -1.1, 10.12), V(0.76, -1.1, 10.12)], nr: 0.3, pod: null }, // F-111F («Пэйв Тэк» во внутреннем отсеке)
  e_mig23: { side: 'east', cls: 'strike', lazy: true, stations: mirror([V(-1.44, -0.6, 0.34), V(-0.45, -1.43, -0.6), V(-0.45, -1.28, 2.2)]),
    nozzles: [V(0, -0.66, 7.57)], nr: 0.35, pod: null }, // МиГ-23БН
  e_mig27: { side: 'east', cls: 'strike', lazy: true, stations: mirror([V(-1.53, -0.61, 0.62), V(-0.45, -1.4, -0.6), V(-0.45, -1.46, 2.2)]),
    nozzles: [V(0, -0.65, 7.43)], nr: 0.33, pod: null }, // МиГ-27К («Кайра» встроена)
  e_tu22m2: { side: 'east', cls: 'bomber', lazy: true, stations: mirror([V(-6.34, -3.89, 5.06), V(-1.27, -2.71, -3.2), V(-1.27, -2.71, -0.5), V(-1.27, -2.71, 2.2)]),
    nozzles: [V(-0.96, -2.67, 18.75), V(0.96, -2.67, 18.75)], nr: 0.72, pod: null }, // Ту-22М2 (сопла по срезу стволов: были выше на 1,4 м, радиус 0,4 → 0,72)
  e_a10: { side: 'west', cls: 'strike', lazy: true, stations: mirror([V(-5.74, -1.01, -0.34), V(-4.7, -1.06, -0.11), V(-3.62, -1.19, -0.2), V(-1.53, -1.27, -0.2)]), // по низу пилонов модели AIRMAN Magazine (подвеска автора убрана; пилоны на 5,74 / 4,70 / 3,62 / 1,53 м от оси)
    nozzles: [V(-1.45, 0.31, 5.0), V(1.45, 0.31, 5.0)], nr: 0.33, pod: V(-0.6, -1.62, -0.27), dry: true }, // A-10A (сопла по срезу гондол: кольцо R 0,43, горячая часть R ≈ 0,33; контейнер — на подфюзеляжном пилоне x −0,6)
  e_f15e: { side: 'west', cls: 'fighter', lazy: true, stations: mirror([V(-2.93, -1.18, 0.46), V(-1.75, -1.59, -1.5), V(-1.75, -1.59, 0.3), V(-1.75, -1.05, 1.8)]),
    nozzles: [V(-0.71, -1.35, 8.45), V(0.71, -1.35, 8.45)], nr: 0.44, pod: V(0.9, -1.9, -2.5), matte: true }, // F-15E (LANTIRN под воздухозаборником); сопла — по срезу модели (кольцо x 0,27–1,15, y −1,8…−0,91; было y −1,12 — огонь выше сопла, Mark 2026-10-22); в соплах модели — конусные заглушки до z 8,31: факел на 14 см за срезом (раскал — диск на 0,14·2·nr ≈ 12 см глубже точки факела; ближе — верх заглушки правого сопла его закрывал), иначе раскал на малом газу и максимале прятался; nr 0,44 — по кольцу сопла (было 0,3)
  // ── 2026-10-19, третья партия manilov.ap: точки подвески — по низу крыла (лучи по треугольникам) и пилонам автора ──
  e_mig21n: { side: 'east', cls: 'strike', lazy: true, stations: mirror([V(-2.76, -1.14, 2.1, 0.3), V(-1.95, -1.08, 0.7), V(-0.45, -1.3, 2.2, 0.2), V(-0.3, -1.3, 0.2, 0.2)]),
    nozzles: [V(0, -0.6, 6.03)], nr: 0.4, pod: null }, // МиГ-21бис
  e_mig25: { side: 'east', cls: 'fighter', lazy: true, stations: mirror([V(-3.98, -0.95, 4.4, 0.15), V(-2.9, -0.95, 3.6, 0.15), V(-0.6, -2.0, 0.2, 0.15), V(-0.6, -2.0, 2.4, 0.15)]),
    nozzles: [V(-0.67, -1.11, 8.34), V(0.67, -1.11, 8.34)], nr: 0.5, pod: null }, // МиГ-25БМ
  e_su7b: { side: 'east', cls: 'strike', lazy: true, stations: mirror([V(-2.55, -1.6, 2.4, 0.3), V(-1.89, -1.58, 1.3, 0.3), V(-0.45, -1.62, -0.6, 0.22), V(-0.45, -1.65, 1.6, 0.22)]),
    nozzles: [V(0, -0.92, 7.11)], nr: 0.42, pod: null }, // Су-7Б
  e_tu16: { side: 'east', cls: 'bomber', lazy: true, stations: mirror([V(-7.16, -3.55, 0.2, 0.35), V(-0.9, -3.9, -3.0, 0.3), V(-0.9, -3.9, -0.5, 0.3), V(-0.9, -3.9, 2.0, 0.3)]),
    nozzles: [V(-1.86, -2.72, 3.1), V(1.86, -2.72, 3.1)], nr: 0.45, pod: null, dry: true }, // Ту-16
  e_f100: { side: 'west', cls: 'strike', lazy: true, stations: mirror([V(-3.58, -2.02, 1.75, 0.3), V(-2.66, -2.04, 1.1, 0.3), V(-1.85, -2.05, 0.6, 0.3), V(-0.45, -2.25, 0.8, 0.2)]),
    nozzles: [V(-0.18, -1.19, 6.44)], nr: 0.38, pod: null }, // F-100D
  e_f5: { side: 'west', cls: 'strike', lazy: true, stations: mirror([V(-2.6, -1.57, 2.25, 0.3), V(-1.6, -1.55, 1.6, 0.3), V(-0.35, -1.55, -0.6, 0.22), V(-0.35, -1.6, 1.4, 0.22)]),
    nozzles: [V(-0.27, -0.95, 7.2), V(0.27, -0.95, 7.2)], nr: 0.22, pod: null }, // F-5E
  e_f117: { side: 'west', cls: 'strike', lazy: true, internal: true, stations: mirror([V(-0.6, -1.3, -1.5), V(-0.6, -1.3, -0.3), V(-0.6, -1.3, 0.9), V(-0.6, -1.3, 2.1)]),
    nozzles: [], nr: 0.12, pod: null, bright: 1.3 }, // F-117A (IRADS встроена, бомбы — во внутреннем отсеке)
  e_jaguar: { side: 'west', cls: 'strike', lazy: true, stations: mirror([V(-2.73, -0.85, 2.85, 0.35), V(-2.03, -0.82, 2.36, 0.35), V(-0.45, -1.75, -0.5, 0.22), V(-0.45, -1.78, 1.5, 0.22)]),
    nozzles: [V(-0.43, -1.21, 5.55), V(0.43, -1.21, 5.55)], nr: 0.3, pod: null }, // Jaguar GR.1
  e_buccaneer: { side: 'west', cls: 'strike', lazy: true, stations: mirror([V(-4.96, -1.5, 0.9, 0.3), V(-3.4, -1.52, 0.6, 0.3), V(-2.3, -1.55, 0.1, 0.3), V(-0.45, -2.25, 0.5, 0.15)]),
    nozzles: [V(-1.28, -1.15, 3.5), V(1.28, -1.15, 3.5)], nr: 0.3, pod: V(0.6, -2.3, -1.0), dry: true }, // Buccaneer S.2B («Пэйв Спайк»)
  e_harrier: { side: 'west', cls: 'strike', lazy: true, stations: mirror([V(-2.92, -1.2, 0.75), V(-1.93, -0.95, 0.35), V(-0.3, -1.75, -1.5, 0.15), V(-0.3, -1.75, 0.5, 0.15)]),
    nozzles: [V(-1.0, -0.95, 1.2), V(1.0, -0.95, 1.2)], nr: 0.22, pod: null, dry: true }, // Harrier GR.3 (два задних «горячих» поворотных сопла за крылом, срез z 1,2)
  e_mirage: { side: 'west', cls: 'strike', lazy: true, stations: mirror([V(-2.8, -2.0, 3.1, 0.28), V(-2.08, -1.98, 2.45, 0.28), V(-0.6, -2.05, -0.5, 0.2), V(-0.6, -2.05, 2.0, 0.2)]),
    nozzles: [V(0, -1.11, 7.18)], nr: 0.42, pod: V(0, -2.15, 0.6) }, // Mirage 2000D
  e_rafale: { side: 'west', cls: 'strike', lazy: true, stations: mirror([V(-3.75, -1.85, 3.6), V(-2.6, -1.85, 2.6, 0.3), V(-1.6, -1.85, 1.6, 0.3), V(-0.6, -2.15, 1.0, 0.15)]),
    nozzles: [V(-0.72, -1.24, 6.56), V(0.72, -1.24, 6.56)], nr: 0.3, pod: V(0.6, -2.2, -1.0) }, // Rafale («Дамокл» под воздухозаборником)
  e_b2: { side: 'west', cls: 'bomber', lazy: true, internal: true, stations: mirror([V(-3, -1.0, -1.5), V(-3, -1.0, 0.5), V(-2, -1.0, -1.5), V(-2, -1.0, 0.5)]),
    nozzles: [], nr: 0.1, pod: null }, // B-2A (бомбы — во внутренних отсеках)
  // ── 2026-10-19, четвёртая партия: manilov.ap (Як-38, Ил-28, Ту-22, Ту-95, Hunter), andertan (Су-27, Су-35), helijah (Super Étendard),
  // Civorsky (Mirage F1), Rhine_Lab_Muelsyse (F/A-18C, EA-18G); бомбардировщики с отсеком — internal, точки — в отсеке
  e_yak38: { side: 'east', cls: 'strike', lazy: true, stations: mirror([V(-2.45, -1.42, 2.0, 0.3), V(-1.95, -1.4, 1.25), V(-0.45, -1.85, 0.3, 0.15), V(-0.45, -1.85, 2.3, 0.15)]),
    nozzles: [V(-0.45, -1.38, 3.89), V(0.45, -1.38, 3.89)], nr: 0.24, pod: null, dry: true }, // Як-38М (два боковых поворотных сопла за крылом, срез по корпусу Cylinder02: было z 1,6 внутри фюзеляжа)
  e_il28: { side: 'east', cls: 'bomber', lazy: true, internal: true, stations: mirror([V(-0.4, -1.9, -2.5), V(-0.4, -1.9, -1.0), V(-0.4, -1.9, 0.5), V(-0.4, -1.9, 2.0)]),
    nozzles: [V(-3.38, -1.63, 3.3), V(3.38, -1.63, 3.3)], nr: 0.35, pod: null, dry: true }, // Ил-28 (бомбы — в отсеке)
  e_tu22: { side: 'east', cls: 'bomber', lazy: true, internal: true, stations: mirror([V(-0.6, -2.85, -3.0), V(-0.6, -2.85, -1.0), V(-0.6, -2.85, 1.0), V(-0.6, -2.85, 3.0)]),
    nozzles: [V(-0.82, -0.12, 18.85), V(0.82, -0.12, 18.85)], nr: 0.55, pod: null }, // Ту-22 (двигатели над хвостом)
  e_tu95: { side: 'east', cls: 'bomber', lazy: true, internal: true, stations: mirror([V(-0.7, -4.6, -4.0), V(-0.7, -4.6, -2.0), V(-0.7, -4.6, 0.0), V(-0.7, -4.6, 2.0)]),
    nozzles: [], nr: 0.1, pod: null }, // Ту-95МС (турбовинтовой — пламени нет; ракеты — в отсеке)
  e_su27: { side: 'east', cls: 'strike', lazy: true, stations: mirror([V(-5.06, -1.31, 3.6, 0.3), V(-3.98, -1.31, 3.0, 0.3), V(-2.89, -1.31, 2.3, 0.3), V(-0.6, -1.75, 1.0, 0.2)]),
    nozzles: [V(-1.11, -1.66, 8.95), V(1.11, -1.66, 8.95)], nr: 0.42, pod: null }, // Су-27СМ
  e_su35: { side: 'east', cls: 'strike', lazy: true, stations: mirror([V(-5.27, -1.03, 3.7, 0.3), V(-4.14, -1.02, 3.05, 0.3), V(-3.01, -1.03, 2.36, 0.3), V(-0.6, -1.7, 1.0, 0.2)]),
    nozzles: [V(-1.29, -1.39, 9.02), V(1.29, -1.39, 9.02)], nr: 0.45, pod: null }, // Су-35С
  e_hunter: { side: 'west', cls: 'strike', lazy: true, stations: mirror([V(-3.3, -1.42, 0.55, 0.3), V(-2.75, -1.44, -0.45), V(-0.45, -1.5, -0.5, 0.15), V(-0.45, -1.5, 1.5, 0.15)]),
    nozzles: [V(0, -0.61, 6.74)], nr: 0.3, pod: null, dry: true }, // Hunter FGA.9 (сопло по срезу: y −0,81 → −0,61)
  // ── 2026-10-21, пятая партия: manilov.ap (Vulcan, Draken, Viggen — без оружия в моделях; подвески по виду снизу / сбоку planes-view.html?ortho=1) ──
  e_vulcan: { side: 'west', cls: 'bomber', lazy: true, internal: true, stations: mirror([V(-0.5, -2.5, -3.6), V(-0.5, -2.5, -1.4), V(-0.5, -2.5, 0.8), V(-0.5, -2.5, 3.0)]),
    nozzles: [V(-3.47, -2.6, 11.85), V(-2.22, -2.6, 11.85), V(2.22, -2.6, 11.85), V(3.47, -2.6, 11.85)], nr: 0.42, pod: null, dry: true }, // Vulcan B.2 (сопла по срезу: y −2,36 → −2,6) (бомбы — в отсеке; четыре «Олимпа» в корне крыла, без форсажа)
  e_draken: { side: 'west', cls: 'strike', lazy: true, stations: mirror([V(-3.4, -1.36, 4.0, 0.3), V(-2.6, -1.38, 3.3, 0.3), V(-1.6, -1.5, 1.8, 0.3), V(-0.5, -1.47, 0.0, 0.15)]),
    nozzles: [V(0, -0.56, 7.67)], nr: 0.35, pod: null }, // Saab 35 Draken (J35F)
  e_viggen: { side: 'west', cls: 'strike', lazy: true, stations: mirror([V(-1.8, -1.98, 3.2, 0.3), V(-4.11, -1.78, 4.7), V(-2.9, -1.82, 4.4), V(-1.1, -1.95, 2.4, 0.2)]), // подвески: внутренние под крылом (L1/R1) и внешние (L2/R2) — на пилонах автора (балки 3,9 м и 2,1 м), бока фюзеляжа (Ф) — пилон дорисован
    nozzles: [V(0, -1.15, 7.47)], nr: 0.45, pod: null, matte: true }, // Saab AJ 37 Viggen (matte: на скользящем свете рёбра элевонов блестели белыми полосами)
  // ── 2026-10-21, шестая партия (Восток): Су-33 (andertan), М-4, МиГ-17 и Т-4 (manilov.ap), МиГ-19 (Tom Zimmermann); подвески — по виду снизу / сбоку (planes-view.html?heli=1 — красные точки), сопла — по срезу ?ortho=1 ──
  e_su33: { side: 'east', cls: 'strike', lazy: true, stations: mirror([V(-5.06, -1.31, 3.0, 0.3), V(-3.98, -1.31, 2.8, 0.3), V(-2.89, -1.31, 2.0, 0.3), V(-0.6, -1.75, 1.0, 0.2)]),
    nozzles: [V(-1.3, -1.62, 9.62), V(1.3, -1.62, 9.62)], nr: 0.42, pod: null }, // Су-33
  e_m4: { side: 'east', cls: 'bomber', lazy: true, internal: true, stations: mirror([V(-0.4, -3.0, -3.0), V(-0.4, -3.0, -1.0), V(-0.4, -3.0, 1.0), V(-0.4, -3.0, 3.0)]),
    nozzles: [V(-4.63, -3.97, 4.65), V(-2.73, -3.9, 4.06), V(2.73, -3.9, 4.06), V(4.63, -3.97, 4.65)], nr: 0.6, pod: null, dry: true }, // М-4 «Бизон» (бомбы — в отсеке; четыре ТРД в корнях крыла, без форсажа)
  e_mig19: { side: 'east', cls: 'strike', lazy: true, stations: mirror([V(-4.4, -1.2, 2.4, 0.1), V(-4.0, -1.21, 1.9, 0.15), V(-3.4, -1.19, 1.1, 0.2), V(-2.7, -1.17, 0.3, 0.2)]), // Ф1 / Ф2 — внутренние узлы под крылом (первые две бомбы)
    nozzles: [V(-0.34, -0.63, 4.4), V(0.34, -0.63, 4.4)], nr: 0.22, pod: null }, // МиГ-19
  e_mig17: { side: 'east', cls: 'strike', lazy: true, stations: mirror([V(-4.1, -1.25, 1.0, 0.1), V(-3.7, -1.23, 0.7, 0.15), V(-3.1, -1.2, 0.1, 0.2), V(-2.45, -1.16, -0.55, 0.2)]), // Ф1 / Ф2 — места подкрыльевых баков автора (первые две бомбы)
    nozzles: [V(0, -0.72, 3.45)], nr: 0.3, pod: null }, // МиГ-17Ф (ВК-1Ф)
  e_mig29k: { side: 'east', cls: 'strike', lazy: true, stations: mirror([V(-5.0, -1.12, 2.9, 0.2), V(-4.2, -1.13, 2.3, 0.2), V(-3.3, -1.08, 1.8, 0.25), V(-2.4, -1.03, 1.5, 0.25)]), // все узлы — под крылом (Ф1 / Ф2 — внутренние)
    nozzles: [V(-0.82, -0.87, 7.17), V(0.82, -0.87, 7.17)], nr: 0.3, pod: V(0, -1.45, 1.0), matte: true }, // МиГ-29К — KoreanNavy (matte: гладкая сетка после subdivision блестела волнами на скользящем свете)
  e_t4: { side: 'east', cls: 'strike', lazy: true, internal: true, stations: mirror([V(-0.4, -1.5, -4.0), V(-0.4, -1.5, -1.5), V(-0.4, -1.5, 1.0), V(-0.4, -1.5, 3.5)]),
    nozzles: [V(-2.04, -3.17, 16.1), V(-0.68, -3.17, 16.1), V(0.68, -3.17, 16.1), V(2.04, -3.17, 16.1)], nr: 0.62, pod: null }, // Т-4 «Сотка» (бомбы — в отсеке; четыре РД-36-41 в пакете под фюзеляжем)
  e_etendard: { side: 'west', cls: 'strike', lazy: true, stations: mirror([V(-2.64, -1.49, 1.85, 0.3), V(-1.92, -1.48, 1.23, 0.3), V(-0.4, -1.6, 0.0, 0.17), V(-0.4, -1.6, 1.8, 0.17)]),
    nozzles: [V(0, -0.9, 6.2)], nr: 0.32, pod: V(0.4, -1.7, -1.0), dry: true }, // Super Étendard (ATLIS под фюзеляжем; сопло по срезу: y −0,9, z 6,2, nr 0,32 — пламя не выше среза сбоку)
  e_mirage_f1: { side: 'west', cls: 'strike', lazy: true, stations: mirror([V(-2.41, -1.13, 1.9, 0.28), V(-1.75, -1.07, 1.55, 0.28), V(-0.45, -1.9, 0.3, 0.15), V(-0.45, -1.9, 2.3, 0.15)]),
    nozzles: [V(0, -1.03, 7.63)], nr: 0.45, pod: null, camo: { scheme: 'fr', size: 2.6 } }, // Mirage F1
  e_f18c: { side: 'west', cls: 'strike', lazy: true, stations: mirror([V(-4.3, -1.25, 2.7, 0.3), V(-3.42, -1.54, 1.36), V(-2.24, -1.47, 1.16), V(-0.6, -1.6, 1.0, 0.15)]),
    nozzles: [V(-0.49, -0.98, 8.0), V(0.49, -0.98, 8.0)], nr: 0.42, pod: V(0.75, -1.6, -1.2) }, // F/A-18C (AN/AAS-38 у воздухозаборника)
  e_su25: { side: 'east', cls: 'strike', lazy: true, stations: mirror([V(-4.37, -1.11, 0.67), V(-3.59, -1.09, 0.4), V(-2.81, -1.09, 0.2), V(-2.03, -1.07, -0.04)]),
    nozzles: [V(-0.88, -1.4, 3.85), V(0.88, -1.4, 3.85)], nr: 0.25, pod: null, dry: true }, // Су-25 — Immersive3D («Шквал» у Су-25Т встроен)
  e_su34: { side: 'east', cls: 'strike', lazy: true, stations: mirror([V(-6.01, -1.56, 5.59), V(-4.7, -1.6, 4.57), V(-3.4, -1.56, 4.0), V(-1.2, -2.66, 3.0, 0.2)]),
    nozzles: [V(-1.235, -1.67, 9.95), V(1.235, -1.67, 9.95)], nr: 0.44, pod: null }, // Су-34 — manilov.ap («Платан» встроен); под крылом пилоны модели, под гондолой (дно −2,46) пилон дорисован
  e_su17: { side: 'east', cls: 'strike', lazy: true, stations: mirror([V(-2.56, -1.33, 2.63), V(-1.72, -1.41, 0.51), V(-1.25, -1.68, -1.4), V(-0.37, -2.07, -0.25)]),
    nozzles: [V(0, -1.02, 8.21)], nr: 0.3, pod: V(0, -2.3, 1.8) }, // Су-17М4 — manilov.ap
  e_su57: { side: 'east', cls: 'fighter', lazy: true, internal: true, stations: mirror([V(-1.9, -0.95, 1.5), V(-1.6, -1.0, 0.0), V(-0.35, -1.2, 0.5), V(-0.3, -1.2, 2.6)]),
    nozzles: [V(-1.37, -0.66, 8.25), V(1.37, -0.66, 8.25)], nr: 0.23, pod: null }, // Су-57
  e_mig31: { side: 'east', cls: 'fighter', lazy: true, stations: mirror([V(-5.6, -0.95, 5.4, 0.3), V(-4.62, -1.24, 4.4), V(-1.55, -1.55, 7.5), V(-1.19, -1.92, -1.5)]),
    nozzles: [V(-0.78, -1.09, 11.1), V(0.78, -1.09, 11.1)], nr: 0.37, pod: null }, // МиГ-31БМ
  e_tu22m3: { side: 'east', cls: 'heavy', lazy: true, stations: mirror([V(-12, -5.05, 8.2, 0.35), V(-9.5, -4.91, 7.3, 0.35), V(-6.8, -4.38, 6.2), V(-1.9, -5.1, 7.3)]), // по низу консолей крыла (стреловидность 30°; пилонов у автора нет: два внешних дорисованы, py 0,35) и боку фюзеляжа
    nozzles: [V(-1.41, -3.44, 18.9), V(1.41, -3.44, 18.9)], nr: 0.9, pod: null }, // Ту-22М3 — только в налётах ИИ; сопла по срезу лепестков (z 18,85; кольцо R ≈ 1,1, проём R ≈ 0,9)
  e_f4: { side: 'west', cls: 'fighter', lazy: true, stations: mirror([V(-3.7, -1.78, 1.69), V(-2.29, -2.46, -0.5), V(-1.26, -1.46, -0.6), V(-1.26, -1.46, 2.4)]),
    nozzles: [V(-0.72, -0.99, 5.6), V(0.72, -0.99, 5.6)], nr: 0.42, pod: V(0, -1.55, 1.0) }, // F-4 Phantom II — andertan («Пэйв Тэк» под фюзеляжем); срез сопел z 5,6 (был 3,45 — факел начинался внутри трубы) Phantom II — andertan («Пэйв Тэк» под фюзеляжем)
  e_gripen: { side: 'west', cls: 'strike', lazy: true, stations: mirror([V(-4.18, -1.06, 3.77), V(-2.92, -1.4, 3.03), V(-1.95, -1.41, 1.77), V(-0.45, -1.62, 0.2, 0.1)]),
    nozzles: [V(0, -0.94, 7.3)], nr: 0.24, pod: V(0.75, -1.5, -1.6) }, // JAS 39 Gripen (LITENING на подфюзеляжной точке)
  e_f22: { side: 'west', cls: 'strike', lazy: true, internal: true, stations: mirror([V(-1.3, -1.3, -1.5), V(-0.75, -1.7, 0.2), V(-0.45, -1.75, 1.0), V(-0.2, -1.8, 2.2)]),
    nozzles: [V(-0.75, -0.98, 7.33), V(0.75, -0.98, 7.33)], nr: 0.25, pod: null }, // F-22A: JDAM и SDB во внутренних отсеках, наведение по GPS
  e_f35: { side: 'west', cls: 'strike', lazy: true, internal: true, stations: mirror([V(-0.9, -1.3, 2.4), V(-0.85, -1.3, 0.4), V(-0.65, -1.35, 1.0), V(-0.45, -1.4, 1.8)]),
    nozzles: [V(0, -0.69, 6.3)], nr: 0.42, pod: null, matte: true }, // F-35A (EOTS встроена; matte — матовое покрытие без текстур автора); andertan: сопло — по срезу лепестков (z 6,25; кольцо R 0,64, горячая часть R ≈ 0,4, центр y −0,69), модель 15,67 × 10,87 м
  // ── «Мульти-волна» (2026-10-13): грузится по требованию (lazy) — wantModel / anyModel
  w_tomahawk: { weapon: 'tomahawk', lazy: true, stations: [] }, // BGM-109 Tomahawk — Pan_Ar4ik
  w_kh555: { weapon: ['kh555', 'kh55', 'kh55d'], lazy: true, stations: [] }, // Х-555 (и вид Х-55) — Jeyhun1985
  w_kalibr: { weapon: 'kalibr', lazy: true, stations: [] }, // «Калибр» — mmickel
  w_agm86: { weapon: 'agm86', lazy: true, stations: [] }, // AGM-86 ALCM — mahmadsaleem11111
  w_storm: { weapon: 'storm', lazy: true, wings: 'fold', stations: [] }, // Storm Shadow — Viktor_ (CC BY 4.0), декали в текстуре стёрты (Свои/Storm Shadow); 5,1 м; у модели крылья раскрыты — на подвеске складываются вдоль корпуса, раскрываются после сброса
  w_atacms: { weapon: 'atacms', lazy: true, stations: [] }, // ракета M142 HIMARS — Denis.Cherkasov1
  d_shahed: { ev: true, lazy: true, stations: [] }, // «Шахед-136» — faintastic (винт — группа prop)
  d_uav: { ev: true, lazy: true, stations: [] }, // БПЛА — Artem Goyko (винты — prop, prop2)
  // ── вертолёты (2026-10-20): грузятся по запросу (heliModel / wantModel); винты — части rotor, rotor2 (соосный нижний), trotor — крутит spinProps;
  // stations — две точки на борт (внешняя, внутренняя) на консолях, оси модели (нос в −Z); nozzles пусто — пламени нет; в planeModel / PLANE_META не попадают (heli)
  h_mi24: { side: 'east', cls: 'heli', heli: true, lazy: true, stations: mirror([V(-3.22, -1.64, -1.43), V(-2.28, -1.33, -1.22)]), nozzles: [], nr: 0.3, pod: null, matte: true }, // Ми-24 — manilov.ap (на концах консолей — направляющие для ПТУР, под консолями — пилоны)
  h_mi28: { side: 'east', cls: 'heli', heli: true, lazy: true, stations: mirror([V(-2.47, -1.35, -2.3), V(-1.78, -1.35, -2.38)]), nozzles: [], nr: 0.3, pod: null, matte: true }, // Ми-28Н — Rukh3D
  h_ka52: { side: 'east', cls: 'heli', heli: true, lazy: true, stations: mirror([V(-2.9, -0.79, -1.54), V(-2.1, -0.93, -1.26)]), nozzles: [], nr: 0.3, pod: null, matte: true }, // Ка-52 — maddex88, переделан (Свои/Ка-52): соосные винты rotor / rotor2, рулевого нет; станции — низ внешнего и внутреннего пилонов
  h_ah64: { side: 'west', cls: 'heli', heli: true, lazy: true, stations: mirror([V(-2.38, -1.36, -2.78), V(-1.65, -1.36, -2.78)]), nozzles: [], nr: 0.3, pod: null, matte: true }, // AH-64 — manilov.ap
  h_ah1: { side: 'west', cls: 'heli', heli: true, lazy: true, stations: mirror([V(-1.35, -1.04, -2.2, 0.3), V(-0.75, -1.04, -2.2, 0.3)]), nozzles: [], nr: 0.3, pod: null, matte: true }, // AH-1 SuperCobra — drcrazzie (у модели нет пилонов — дорисованы)
  h_uh1: { side: 'west', cls: 'heli', heli: true, lazy: true, stations: mirror([V(-1.5, -1.5, -2.1)]), nozzles: [], nr: 0.3, pod: null, matte: true }, // UH-1 — manilov.ap (по одной точке на борт — на боковых фермах)
  // ── 2026-10-21: четыре вертолёта manilov.ap (CC BY 4.0) ──
  h_ka50: { side: 'east', cls: 'heli', heli: true, lazy: true, stations: mirror([V(-2.8, -0.75, -0.9), V(-1.87, -0.95, -1.5)]), nozzles: [], nr: 0.3, pod: null, matte: true }, // Ка-50 «Чёрная акула» (перекрашен в чёрный; соосные винты rotor / rotor2, рулевого нет)
  h_mi8: { side: 'east', cls: 'heli', heli: true, lazy: true, pods4: true, /* 4 блока НАР: по два на ферме (внутренняя и внешняя точки) */ stations: mirror([V(-2.6, -0.65, -4.0), V(-2.3, -0.65, -4.0, 0.3)]), nozzles: [], nr: 0.3, pod: null, matte: true }, // Ми-8МТВ
  h_uh60: { side: 'west', cls: 'heli', heli: true, lazy: true, stations: mirror([V(-3.1, -0.91, -2.4, 0.3), V(-2.0, -0.91, -2.4, 0.3)]), nozzles: [], nr: 0.3, pod: null, matte: true }, // UH-60 (вооружённый, фермы ESSS)
  h_rah66: { side: 'west', cls: 'heli', heli: true, lazy: true, stations: mirror([V(-2.35, -0.75, -0.5, 0.25), V(-1.55, -0.75, -0.5, 0.25)]), nozzles: [], nr: 0.3, pod: null, matte: true }, // RAH-66 Comanche (фенестрон — trotor)
  // вертолётное оружие (heliModel / weaponMesh): подвес сверху, нос в −Z, центр габаритов в нуле
  w_shturm: { weapon: ['shturm', 'ataka'], lazy: true, stations: [] }, // «Штурм» 9М114 — ТПК, timurwolf (и вид «Атаки»: контейнер почти тот же)
  w_b8: { weapon: 's8', lazy: true, stations: [] }, // блок НАР Б-8В20 (20 труб) — timurwolf
  w_lau61: { weapon: 'hydra', lazy: true, stations: [] }, // блок Hydra 70 LAU-61 (19 труб) — сетка блока Б-8 timurwolf, 1,7 × 0,4 м, олив NATO
  w_hellfire: { weapon: 'hellfire', lazy: true, stations: [] }, // AGM-114 Hellfire — из MH-60R (touka1212)
  aam_stinger: { weapon: 'aam_stinger', lazy: true, stations: [] }, // ракета FIM-92 Stinger «воздух–воздух» для вертолётов — GoldbergR
  e_tu160: { side: 'east', cls: 'carrier', only: true, lazy: true, internal: true, stations: mirror([V(-0.7, -3.8, -4.0), V(-0.7, -3.8, -1.5), V(-0.7, -3.8, 1.0), V(-0.7, -3.8, 3.5)]), nozzles: [V(-5.75, -4.31, 11.1), V(-3.97, -4.31, 11.1), V(3.97, -4.31, 11.1), V(5.75, -4.31, 11.1)], nr: 0.9 }, // Ту-160 — KOG_THORNS (с 2026-10-19 и в «Авиации»: точки — в отсеках); носитель «Мульти-волны»
  e_b1b: { side: 'west', cls: 'carrier', only: true, lazy: true, internal: true, stations: mirror([V(-0.6, -2.5, -5.0), V(-0.6, -2.5, -2.5), V(-0.6, -2.5, 0.0), V(-0.6, -2.5, 2.5)]), nozzles: [V(-4.3, -3.1, 11.5), V(-2.95, -3.1, 11.5), V(2.95, -3.1, 11.5), V(4.3, -3.1, 11.5)], nr: 0.5 }, // B-1B — Muhamad Mirza Arrafi; носитель «Мульти-волны»
  e_b52: { side: 'west', cls: 'carrier', only: true, lazy: true, internal: true, stations: mirror([V(-0.6, -5.2, -3.0), V(-0.6, -5.2, -1.0), V(-0.6, -5.2, 1.0), V(-0.6, -5.2, 3.0)]), nozzles: [], nr: 0.4 }, // B-52H — bohmerang; носитель «Мульти-волны» (без форсажа — пламени нет)
  e_typhoon: { side: 'west', cls: 'carrier', only: true, lazy: true, stations: mirror([V(-3.88, -1.93, 3.0, 0.3), V(-2.77, -1.91, 2.24, 0.3), V(-1.94, -1.85, 1.74, 0.3), V(-0.6, -2.1, 1.0, 0.15)]), nozzles: [V(-0.54, -1.46, 6.68), V(0.54, -1.46, 6.68)], nr: 0.42 }, // Eurofighter Typhoon — andertan; носитель Storm Shadow
  w_nar_hydra: { lazy: true, stations: [], matte: true }, // НАР Hydra 70 в полёте — собственная модель (Blender, tools/airdef-models/own)
  w_nar_s8: { lazy: true, stations: [], matte: true }, // НАР С-8КОМ в полёте — собственная модель (Blender, tools/airdef-models/own)
  w_tbmdec: { lazy: true, stations: [] }, // ложная цель «Искандера» — головная часть его ракеты
  w_kinzhal: { weapon: 'kinzhal', lazy: true, stations: [] }, // «Кинжал» — ракета 9М723 с пусковой «Искандера» (42manako), 7,2 м, светло-серая
  w_slam: { weapon: 'slam', lazy: true, stations: [] }, // AGM-84E SLAM — по UGM-84 Harpoon (FeriseCAT)
  w_jsow: { weapon: 'jsow', lazy: true, wings: 'deploy', stations: [] }, // AGM-154 JSOW — RickSlash
  w_kh101: { weapon: 'kh101', lazy: true, stations: [] },
  w_gbu10: { weapon: 'gbu10', stations: [] }, // GBU-10 — PhilCiborowski (Thingiverse)
  w_ecm: { weapon: ['ecm_w', 'ecm_e'], matte: true, stations: [] }, // станция помех ELTA 8222 — Original_linny (Thingiverse); у востока пока она же // Х-101 — HappyBattleSheep (Thingiverse)
  l_iskander: { ev: true, lazy: true, matte: true, stations: [] }, // 9П78 «Искандер» — 42manako (ракеты на старте — tbm, tbm2)
  l_tochka: { ev: true, lazy: true, matte: true, stations: [] }, // 9П129 «Точка-У» — 42manako (tbm)
  l_scud: { ev: true, lazy: true, matte: true, stations: [] }, // Р-17 на МАЗ-543 — AlexDang (tbm)
  l_himars: { ev: true, lazy: true, matte: true, stations: [] }, // M142 HIMARS — Denis.Cherkasov1
  // оружие, взятое с моделей самолётов: на пилоне и в полёте вместо процедурного
  w_gbu12: { weapon: 'gbu12', stations: [] }, // GBU-12 Paveway II с F-16D
  w_fab500: { weapon: 'fab500', stations: [], matte: true }, // ФАБ-500М-62 — собственная модель (tools/airdef-models/own/fab500)
  w_fab100: { weapon: 'fab100', stations: [], matte: true }, // ФАБ-100 — 4ikalka
  w_ofab250: { weapon: 'ofab250', stations: [], matte: true }, // ОФАБ-250-270 — 4ikalka
  w_fab250: { weapon: 'fab250', stations: [], matte: true }, // ФАБ-250 — CATholic
  w_fab1000: { weapon: 'fab1000', stations: [], matte: true }, // ФАБ-1000 — United4192
  w_gbu24: { weapon: 'gbu24', stations: [] }, // GBU-24 Paveway III — AnirudhRao, своя окраска и запекание (Свои/GBU-24)
  w_gbu57: { weapon: 'gbu57', stations: [] }, // GBU-57 — собственная модель (tools/airdef-models/own/gbu57)
  w_umpk: { weapon: 'umpk', wings: 'fold', flip: true, stations: [] }, // ФАБ-500 с УМПК — собственная модель (tools/airdef-models/own/umpk)
  w_kh29t: { weapon: 'kh29t', stations: [] }, // Х-29Т — собственная модель (tools/airdef-models/own/kh29t)
  w_kh31p: { weapon: 'kh31p', stations: [] }, // Х-31П — собственная модель (tools/airdef-models/own/kh31p)
  w_kh59m: { weapon: ['kh59m', 'kh59mk2'], lazy: true, stations: [] }, // Х-31 (L_elo) в размер Х-59М — и для Х-59МК2 (Mark 2026-10-19; прежняя — из War Thunder)
  w_kh25ml: { weapon: 'kh25ml', stations: [] }, // Х-29 (Novia556) в размер Х-25МЛ (прежняя Х-38 — из War Thunder)
  w_kh58: { weapon: 'kh58', stations: [] }, // Х-58У — Narni_Tchereskov
  w_agm65b: { weapon: 'agm65b', stations: [], recolor: { GREEN: 0x252912, SILVER: 0x6e6e6e, BROWN: 0x2a1a0e, BLACK: 0x0c0c0c } }, // AGM-65 — HEAVYCLOUD (одна из трёх, 60 тыс. треугольников); у авторов цвета почти чёрные (recolor, линейные)
  w_bomb1000: { weapon: 'bomb1000', stations: [], matte: true }, // AN-M65A1 1000 lb — United4192
  w_mk82: { weapon: 'mk82', stations: [] }, // Mk 83 → размер Mk 82 — набор NETRUNNER_pl
  w_jassm: { weapon: 'jassm', stations: [] }, // AGM-158 JASSM
  w_agm88: { weapon: ['agm88', 'aargm'], stations: [] }, // AGM-88 HARM (с тележки) — и для AARGM
  w_mald: { weapon: ['mald', 'quail'], stations: [] }, // ADM-160 MALD («AIM-160A Screamer»)
  w_decoy_e: { weapon: 'decoy_e', stations: [] }, // Harpy — ложная цель
  w_gbu39: { weapon: ['gbu39', 'sdb'], wings: 'fold', stations: [] }, // GBU-39 SDB (и для «Мульти-волны»)
  w_gbu31: { weapon: 'gbu31', stations: [] }, // Mk 82 JDAM (FeriseCAT) в размер GBU-31
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
  // Хеллоуин, осенняя карта «Туманная топь» (2026-10-20): постройки-цели — lazy (грузятся по wantModel, когда на карте есть); реквизит — bld (грузится по wantBuildings(G.bldNames), ставится G.addNear)
  obj_church: { matte: true, obj: true, lazy: true, stations: [] }, obj_mill: { matte: true, obj: true, lazy: true, stations: [] }, obj_barn: { matte: true, obj: true, lazy: true, stations: [] }, // церковь — reramil, мельница (крылья — часть sail, spinSails) — Tim0, сарай — narighillya
  pr_hay: { matte: true, bld: true, stations: [] }, pr_well: { matte: true, bld: true, stations: [] }, pr_pumpkin: { bld: true, stations: [] }, pr_grave1: { matte: true, bld: true, stations: [] }, pr_grave2: { matte: true, bld: true, stations: [] }, pr_grave3: { matte: true, bld: true, stations: [] }, pr_grave4: { matte: true, bld: true, stations: [] },
  pr_fence: { bld: true, stations: [] }, pr_fpost: { bld: true, stations: [] }, pr_deadtree: { matte: true, bld: true, stations: [] }, pr_oldtree: { matte: true, bld: true, stations: [] }, c_vaz: { bld: true, stations: [] }, // сено, колодец, тыква, надгробия, ограда, сухое и старое дерево, ржавый ВАЗ
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
  bukm3: { units: ['bukm3'], matte: true, stations: [], camo: { scheme: 'soviet', size: 1.5 } }, // «Бук-М3» — Valera121 (CC BY; без текстур — камуфляж шейдером, колёса и ракеты в ТПК — свои цвета; гусеницы звеньями — prepare.js tracks)
  msl_bukm3: { samMissile: ['bukm3'], matte: true, stations: [] }, // ракета 9М317М — из той же модели (Missile_1), светлая
  buk: { units: ['buk'], stations: [], matte: true }, // «Бук» (колёсный) — azlan
  zu23: { units: ['zu23'], stations: [], matte: true }, // ЗУ-23-2 — LuckySkink9661
  phalanx: { units: ['phalanx'], stations: [] }, // Phalanx — DenisGLabrecque
  // комплексы с ракетами на направляющих: ракета модели — в слотах и в полёте (у С-75 и С-125 — с отделяемым ускорителем)
  s75: { units: ['s75'], stations: [] }, // С-75 «Двина» — manyakasia
  s125: { units: ['s125'], stations: [], bright: 1.9 }, // С-125 «Нева» — teanid; текстура у автора очень тёмная (bright — множитель цвета)
  kub: { units: ['kub'], stations: [] }, // 2К12 «Куб» — UltraKill
  hawk: { units: ['hawk', 'hawk21'], stations: [] }, // MIM-23 Hawk — Dominik Biały; Hawk XXI — та же пусковая (вместо Sevom Khordad, 2026-10-22)
  m163: { units: ['m163'], stations: [], matte: true, camo: { scheme: 'nato', size: 1.3 } }, // M163 VADS — Gorgytz
  zsu234: { units: ['zsu234'], matte: true, stations: [] }, // ЗСУ-23-4М «Шилка» — voron335
  strela10: { units: ['strela10'], matte: true, stations: [], camo: { scheme: 'soviet', size: 1.5 } }, // «Стрела-10» на МТ-ЛБ — ScurvyWoof
  avenger: { units: ['avenger'], stations: [], matte: true, camo: { scheme: 'nato', size: 1.1 } }, // AN/TWQ-1 Avenger — KillCaptureDestroy
  chaparral: { units: ['chaparral'], stations: [], matte: true, camo: { scheme: 'nato', size: 1.2 } }, // MIM-72 Chaparral — TankLord (Thingiverse)
  gepard: { units: ['gepard'], matte: true, stations: [], camo: { scheme: 'nato', size: 1.4, tex: true, detail: true } }, // Flakpanzer Gepard — собственная модель (tools/airdef-models/own/gepard): камуфляж — по зелёной краске текстуры
  roland: { units: ['roland'], matte: true, stations: [], camo: { scheme: 'nato', size: 1.4 } },
  tunguska: { units: ['tunguska'], matte: true, stations: [] }, // 2К22 «Тунгуска» — SIpriv (CC BY 4.0), переделана в Blender (Свои/Тунгуска): камуфляж, затенение и карта нормалей запечены — шейдерного узора нет
  msl_9m311: { samMissile: ['tunguska'], matte: true, stations: [] }, // ракета 9М311 — своя (Свои/Тунгуска), 2,56 м, нос −Z
  skyguard: { units: ['skyguard'], stations: [] },
  rapier: { units: ['rapier'], matte: true, stations: [], camo: { scheme: 'uk', size: 1.3 } }, // Tracked Rapier — stealth86 (перекрашен, пусковая развёрнута в рабочее положение) // Oerlikon GDF 35 мм — из сцены Skyguard (lm9241221) // 2К22 «Тунгуска» — usedm
  sampt: { units: ['sampt'], stations: [] }, // SAMP/T — Chenzoss
  msl_aster: { samMissile: ['sampt'], stations: [] }, // Aster 30 — по IRIS-T (Raptor9), увеличена и перекрашена // Roland 2 на Marder — ScurvyWoof (перекрашен) // Flakpanzer Gepard (не «War Thunder»)
  nasams: { units: ['nasams'], stations: [] }, // NASAMS 1 — пусковая
  ew_e: { units: ['gpsjam'], stations: [] }, // станция РЭБ (восток) — машина с РЛС IBIS-150
  ew_w: { units: ['gpsjamw'], stations: [] }, // станция РЭБ (запад) — радарная машина Renault TRM
  strela1: { units: ['strela1'], matte: true, stations: [], camo: { scheme: 'soviet', size: 1.4, tex: true } }, // «Стрела-1» — 42manako
  osa: { units: ['osa'], matte: true, stations: [] }, // ЗИФ-122 «Оса-М» на береговой позиции — KoreanNavy (CC BY)
  tor: { units: ['tor', 'torm2'], stations: [] }, // «Тор-М1» — 42manako
  pantsir: { units: ['pantsir'], matte: true, stations: [] }, // «Панцирь-С1» на КамАЗ-6560 — SanderWolf (CC BY 4.0), переделан в Blender (Свои/Панцирь): камуфляж, затенение и карта нормалей запечены — шейдерного узора нет
  s400: { units: ['s400', 's300'], matte: true, stations: [] }, // пусковая С-400 — Chenzoss (и для С-300: та же схема, 4 контейнера)
  patriot: { units: ['patriot', 'pac3'], stations: [] }, // Patriot M901 — Muhamad Mirza Arrafi
};
// самолёты — и для «Симулятора Летки» (выбор самолёта игрока; точки подвески — те же 8, что у его «Изделия»)
export const PLANE_META = Object.fromEntries(Object.entries(META).filter(([, m]) => m.side && !m.heli)); // вертолёты (heli) — не самолёты «Летки»
// авторы и лицензии — из исходных файлов (tools/airdef-models/prepare.js --credits)
// текстуры города (tex/*.jpg) — ambientCG: Grass004, PavingStones151, Concrete042A, RoofingTiles006, Facade002/017/018A;
// Poly Haven (tex/p_*.jpg): asphalt_02, road_damaged_2, gravel, rocky_terrain_03, brown_mud_03
const TEX_CREDIT = { title: tr('Текстуры земли, дорог, крыш и фасадов'), author: 'ambientCG', url: 'https://ambientcg.com', license: 'CC0', files: ['tex/*.jpg'] };
const PH_CREDIT = { title: tr('Текстуры асфальта, щебня, скал и пашни; панорамы неба'), author: 'Poly Haven', url: 'https://polyhaven.com', license: 'CC0', files: ['tex/p_*.jpg', 'sky/*.jpg'] };
// взрывы и пламя (fx/*.png): огненный шар с дымом — ohyhei; вспышка с кольцом и пламя — Explosion FX Free (heyheythere)
const FX_CREDITS = [
  { title: tr('Иконки управления'), author: 'Delapouite, Lorc, Skoll (game-icons.net)', url: 'https://game-icons.net', license: 'CC BY 3.0', licenseUrl: 'https://creativecommons.org/licenses/by/3.0/', files: ['icons.js'] },
  { title: 'Explosion sprite sheets', author: 'ohyhei', url: 'https://ohyhei.itch.io/a-free-explosion-sprite-sheets-asset-on-itch', license: tr('бесплатно, с указанием автора'), licenseUrl: 'https://ohyhei.itch.io/a-free-explosion-sprite-sheets-asset-on-itch', files: ['fx/explosion*.png'] },
  { title: 'Explosion FX Free', author: 'heyheythere', url: 'https://heyheythere.itch.io/explosion-fx-free', license: 'CC BY 4.0', files: ['fx/blast*.png', 'fx/flame*.png'] },
];
export const MODEL_CREDITS = [...CREDITS, TEX_CREDIT, PH_CREDIT, ...FX_CREDITS].map((c) => ({ ...c, licenseUrl: c.licenseUrl || (/CC0/.test(c.license) ? 'https://creativecommons.org/publicdomain/zero/1.0/' : 'http://creativecommons.org/licenses/by/4.0/') }));
const LOADED = {};
// версия файла модели (сброс кэша) — у пересобранных моделей своя, остальные не перекачиваются
const GLB_V = Object.fromEntries(['w_gbu10', 'w_ecm', 'gepard', 'gepard_lo', 'roland', 'rapier', 'rapier_lo', 'tunguska', 'tunguska_lo', 'strela1', 'zsu234', 'zsu234_lo', 'strela10', 'm163', 'm163_lo', 'chaparral', 'chaparral_lo', 'avenger', 'avenger_lo', 'w_gbu39', 'l_scud', 'pantsir', 'pantsir_lo', 'w_umpk', 'w_decoy_e', 'w_kh101', 'w_jsow', 'w_fab500', 'e_tornado', 'e_f111', 'e_mig23', 'e_mig27', 'e_tu22m2', 'e_a10', 'e_f15e', 'e_su24', 'm163', 'zsu234', 'strela10', 'avenger', 'chaparral', 'w_kh59m', 'w_kh25ml', 'w_kh58', 'w_gbu31', 'w_jassm', 'w_agm65b', 't_kc10'].map((n) => [n, '20261022c']).concat(
  ['roland', 'strela10', 'zsu234', 'zsu234_lo', 'strela1', 'tunguska', 'tunguska_lo', 'gepard', 'gepard_lo', 'chaparral', 'chaparral_lo', 'm163', 'm163_lo', 'rapier', 'rapier_lo', 'avenger', 'avenger_lo', 'w_gbu39', 'pantsir', 'pantsir_lo', 'w_gbu10', 'w_ecm', 'e_mig21n', 'e_mig25', 'e_su7b', 'e_tu16', 'e_f100', 'e_f5', 'e_f117', 'e_jaguar', 'e_buccaneer', 'e_harrier', 'e_mirage', 'e_rafale', 'e_b2'].map((n) => [n, '20261022i'])).concat(
  ['zsu234', 'zsu234_lo', 'zu23', 'buk', 'phalanx', 'w_fab100', 'w_ofab250', 'w_fab250', 'w_fab1000', 'w_gbu24', 'w_gbu57', 'w_umpk', 'e_yak38', 'e_il28', 'e_tu22', 'e_hunter', 'e_su27', 'e_su35', 'e_etendard', 'e_mirage_f1', 'e_f18c'].map((n) => [n, '20261022k'])).concat([['e_tu95', '20261022l'], ['w_agm65b', '20261022l'], ['w_decoy_e', '20261022l'], ['obj_hangar', '20261022l']].concat(['h_mi24', 'h_mi28', 'h_ka52', 'h_ah64', 'h_ah1', 'h_uh1', 'w_shturm', 'w_b8', 'w_hellfire', 'aam_stinger'].map((n) => [n, '20261022m'])).concat([['w_shturm', '20261022n']])).concat(['h_ah64', 'h_mi28'].map((n) => [n, '20261022p'])).concat([['h_uh1', '20261022r']]).concat(['w_lau61', 'obj_church', 'obj_mill', 'obj_barn', 'pr_hay', 'pr_well', 'pr_pumpkin', 'pr_grave1', 'pr_grave2', 'pr_grave3', 'pr_grave4', 'pr_fence', 'pr_fpost', 'pr_deadtree', 'pr_oldtree', 'c_vaz'].map((n) => [n, '20261022o'])).concat(['e_vulcan', 'e_draken', 'e_viggen', 'w_bomb1000'].map((n) => [n, '20261023b'])).concat(['h_ka50', 'h_mi8', 'h_uh60', 'h_rah66'].map((n) => [n, '20261023c'])).concat([['w_nar_hydra', '20261024a'], ['w_nar_s8', '20261024a'], ['e_draken', '20261023d'], ['w_bomb1000', '20261023d'], ['h_ka50', '20261023d']]).concat(['e_su33', 'e_m4', 'e_mig19', 'e_mig17', 'e_t4', 'e_mig29k'].map((n) => [n, '20261023e']))); // 20261023e — шестая партия: Су-33, М-4, МиГ-19, МиГ-17, Т-4 (2026-10-21) // 20261023c — четыре вертолёта manilov.ap (2026-10-21) // 20261023b — Vulcan, Draken, Viggen, бомба 1000 lb (2026-10-21) // l — 2026-10-20: Ту-95 без нарисованных дисков, Maverick и Harpy без сильного упрощения // l — Ту-95 без нарисованных дисков винтов (2026-10-20) // j — четвёртая партия, новая «Шилка», УМПК без сжатия // i — ЗРК без упрощения, камуфляж шейдером, третья партия самолётов (2026-10-19); c — замены моделей 2026-10-19; остальные пересобраны 2026-10-18 (затенение в стыках) — общая версия ниже
// версии файлов собственных моделей (Blender, tools/airdef-models/own): по строке на ключ; поднимает tools/airdef-models/integrate-own.js при каждом встраивании
const GLB_V_OWN = {
  w_kh29t: '20261024c',
  w_kh31p: '20261024d',
  gepard: '20261024d',
  gepard_lo: '20261024d',
  w_nar_s8: '20261024e',
  w_nar_hydra: '20261024f',
  w_gbu57: '20261024g',
  w_fab500: '20261024h',
  w_umpk: '20261024i',
};
GLB_V.e_f15e = '20261024g'; // заглушки в соплах — тёмные (prepare.js #soot), 2026-10-22
// «Оса-М» ЗИФ-122 (KoreanNavy) и «Бук-М3» (Valera121) вместо моделей Jeyhun1985 (2026-10-22): новые файлы
Object.assign(GLB_V, Object.fromEntries(['osa', 'osa_lo'].map((n) => [n, '20261024e'])));
Object.assign(GLB_V, Object.fromEntries(['bukm3', 'bukm3_lo', 'msl_bukm3'].map((n) => [n, '20261024f'])));
// F-35A (andertan), A-10 (AIRMAN Magazine) и Ту-22М3 (Real Slim Shady) вместо моделей shangus930 / Immersive3D / Jeyhun1985 (2026-10-22): новые файлы
Object.assign(GLB_V, Object.fromEntries(['e_f35', 'e_f35_lo', 'e_a10', 'e_tu22m3', 'e_tu22m3_lo'].map((n) => [n, '20261024h'])));
GLB_V.h_ka52 = '20261024i'; // Ка-52 maddex88 (CC BY 4.0), переделан и запечён вместо Immersive3D (2026-10-22)
// «Тунгуска» (SIpriv) и «Панцирь-С1» (SanderWolf) — свои перекрашенные и запечённые модели вместо usedm / 42manako, ракета 9М311, Storm Shadow (Viktor_) без декалей вместо вырезанной из Су-24 (2026-10-22): новые файлы
Object.assign(GLB_V, Object.fromEntries(['tunguska', 'tunguska_lo', 'pantsir', 'pantsir_lo', 'msl_9m311'].map((n) => [n, '20261024j'])));
GLB_V.w_storm = '20261024k'; // Storm Shadow: консоли крыла — свои части (сложены на подвеске)
GLB_V.e_su34 = '20261024l'; // Су-34 manilov.ap (CC BY 4.0) вместо 42manako, без шасси (2026-10-22)
Object.assign(GLB_V, { hawk: '20261024m', w_gbu24: '20261024m' }); // Hawk: ракета без деталей пусковой (absorb 0); GBU-24 — AnirudhRao, своя окраска
Object.assign(GLB_V, GLB_V_OWN);
// разбор GLB: меши (позиции, нормали, UV, индексы), материалы, картинки текстур
function parseGlb(buf) {
  const dv = new DataView(buf), jl = dv.getUint32(12, true), json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jl)));
  const binOff = 28 + jl, T = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array };
  const slice = (bv, extra = 0, len = bv.byteLength) => buf.slice(binOff + (bv.byteOffset || 0) + extra, binOff + (bv.byteOffset || 0) + extra + len);
  const acc = (i) => { const a = json.accessors[i], bv = json.bufferViews[a.bufferView], C = T[a.componentType], n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type]; return new C(slice(bv, a.byteOffset || 0, a.count * n * C.BYTES_PER_ELEMENT)); };
  const meshes = json.meshes.map((m) => { const p = m.primitives[0], at = p.attributes; return { name: m.name, mat: json.materials[p.material], pos: acc(at.POSITION), nor: acc(at.NORMAL), uv: at.TEXCOORD_0 !== undefined ? acc(at.TEXCOORD_0) : null, ao: at.COLOR_0 !== undefined ? acc(at.COLOR_0) : null, idx: acc(p.indices), hub: m.extras && m.extras.hub }; }); // hub — центр втулки винта вертолёта (prepare.js); ao — затенение в стыках (tools/airdef-models/ao.js)
  // hash — отпечаток байтов картинки (FNV-1a + длина): одинаковые картинки внутри файла и между файлами (у «Шилки» 65 текстур, разных 22;
  // у её дальней копии — те же) грузятся на видеокарту один раз (load: TEXC)
  const hashes = [], images = (json.images || []).map((im) => { const ab = slice(json.bufferViews[im.bufferView]), u8 = new Uint8Array(ab); let h = 0x811c9dc5; for (let i = 0; i < u8.length; i++) h = Math.imul(h ^ u8[i], 0x01000193); hashes.push(`${(h >>> 0).toString(36)}.${u8.length}`); return new Blob([ab], { type: im.mimeType }); });
  return { meshes, images, hashes, textures: json.textures || [], nrm: new Set((json.materials || []).filter((m) => m.normalTexture).map((m) => m.normalTexture.index)) }; // nrm — номера карт нормалей (данные, не цвет)
}
// камуфляж техники без текстур (краска «#camo» из prepare.js): узор — в шейдере по координатам точки модели: крупные пятна
// с ровными краями (шум со смещением области), не по треугольникам сетки. META.camo: { scheme, size — размер пятна, м }.
// Цвета — линейные (вывод игры — sRGB): основной, второй (крупные пятна), третий (мелкие тёмные); k2 / k3 — порог шума (выше — меньше пятен)
const CAMO = {
  nato: { c: [[0.09, 0.11, 0.055], [0.085, 0.064, 0.038], [0.02, 0.02, 0.018]], k2: 0.16, k3: 0.82 }, // MERDC: зелёный, коричневый, чёрный
  soviet: { c: [[0.085, 0.105, 0.05], [0.18, 0.14, 0.075], [0.022, 0.022, 0.02]], k2: 0.25, k3: 0.85 }, // защитный 4БО, песочный, чёрный
  fr: { c: [[0.19, 0.22, 0.26], [0.07, 0.085, 0.11], [0.07, 0.085, 0.11]], k2: 0.05, k3: 9 }, // французский двухтонный серо-голубой (Mirage F1)
  uk: { c: [[0.088, 0.11, 0.055], [0.045, 0.05, 0.036], [0.02, 0.02, 0.018]], k2: 0.5, k3: 9 }, // зелёный и чёрный
};
const CAMO_GLSL = `varying vec3 vCamoP; uniform vec3 uC1, uC2, uC3; uniform float uK2, uK3, uCS;
float camoH(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float camoV(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(camoH(i), camoH(i + vec3(1, 0, 0)), f.x), mix(camoH(i + vec3(0, 1, 0)), camoH(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(camoH(i + vec3(0, 0, 1)), camoH(i + vec3(1, 0, 1)), f.x), mix(camoH(i + vec3(0, 1, 1)), camoH(i + vec3(1, 1, 1)), f.x), f.y), f.z) * 2.0 - 1.0; }
float camoF(vec3 p) { p += 0.45 * vec3(camoV(p * 0.7 + 3.1), camoV(p * 0.7 + 5.7), camoV(p * 0.7 + 9.2)); return camoV(p) * 0.7 + camoV(p * 2.3 + 7.3) * 0.3; }
vec3 camoCol(vec3 P) { vec3 p = P / uCS; float a = camoF(p), b = camoF(p * 3.0 + 21.7); // чёрные — мелкие и редкие (крупные выглядели провалами)
  return mix(mix(uC1, uC2, smoothstep(uK2 - 0.02, uK2 + 0.02, a)), uC3, smoothstep(uK3 - 0.02, uK3 + 0.02, b)); }`;
// зернистость краски (META.camo.detail): общая плиточная картинка 128×128 из значения-шума (строится кодом, ничего не качается), в шейдере — по координатам точки
// модели с проекцией по главной оси нормали (плитка 0,33 м): мелкое зерно краски и металла на любом расстоянии, не завися от разрешения атласа текстуры
let DETAIL_TEX = null;
function detailTex() {
  if (DETAIL_TEX) return DETAIL_TEX;
  const N = 128, g = (x, y, p, s) => { x = ((x % p) + p) % p; y = ((y % p) + p) % p; let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1274126177)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
  const vn = (u, v, p, s) => { const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    return (g(x0, y0, p, s) * (1 - sx) + g(x0 + 1, y0, p, s) * sx) * (1 - sy) + (g(x0, y0 + 1, p, s) * (1 - sx) + g(x0 + 1, y0 + 1, p, s) * sx) * sy; };
  const d = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { // периоды 8 / 16 / 32 клетки на 128 точек — плитка бесшовная
    const v = vn(x / 16, y / 16, 8, 1) * 0.4 + vn(x / 8, y / 8, 16, 2) * 0.3 + vn(x / 4, y / 4, 32, 3) * 0.2 + g(x, y, N, 4) * 0.1, c = Math.max(0, Math.min(255, Math.round((0.5 + (v - 0.5) * 1.8) * 255)));
    d[(y * N + x) * 4] = d[(y * N + x) * 4 + 1] = d[(y * N + x) * 4 + 2] = c; d[(y * N + x) * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true;
  return (DETAIL_TEX = t);
}
function camoMat(mat, cm, detail) {
  const S = CAMO[cm.scheme] || CAMO.nato; if (!cm.tex) mat.color.setRGB(1, 1, 1); mat.userData.camo = true;
  const det = !!(cm.detail && detail); // ?det=0 — без зернистости (сравнение)
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uC1: { value: new THREE.Vector3(...S.c[0]) }, uC2: { value: new THREE.Vector3(...S.c[1]) }, uC3: { value: new THREE.Vector3(...S.c[2]) },
      uK2: { value: S.k2 }, uK3: { value: cm.tex ? 9 : S.k3 }, uCS: { value: cm.size || 1.4 } });
    if (det) sh.uniforms.uDet = { value: detailTex() };
    sh.vertexShader = 'varying vec3 vCamoP;' + (det ? ' varying vec3 vCamoN;' : '') + '\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvCamoP = position;' + (det ? ' vCamoN = normal;' : ''));
    // у текстурных — без чёрных пятен (на грязи текстуры выглядели гарью), только по зелёной краске текстуры (маска: зелёный заметно больше красного и синего), с её светотенью и грязью
    const tx = 'float cmL = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)), cmM = smoothstep(0.004, 0.02, diffuseColor.g - max(diffuseColor.r, diffuseColor.b));\n' +
      'diffuseColor.rgb = mix(diffuseColor.rgb, camoCol(vCamoP) * clamp(cmL / dot(uC1, vec3(0.3, 0.59, 0.11)), 0.8, 1.4), cmM);\n';
    const dt = det ? 'vec3 dA = abs(vCamoN); vec2 dUV = dA.x > max(dA.y, dA.z) ? vCamoP.zy : (dA.y > dA.z ? vCamoP.xz : vCamoP.xy);\n' +
      'diffuseColor.rgb *= 0.82 + 0.36 * texture2D(uDet, dUV * 3.0).r;\n' : '';
    sh.fragmentShader = CAMO_GLSL + (det ? '\nvarying vec3 vCamoN; uniform sampler2D uDet;' : '') + '\n' + sh.fragmentShader.replace('#include <color_fragment>', (cm.tex ? tx : 'diffuseColor.rgb *= camoCol(vCamoP);\n') + dt + '#include <color_fragment>');
  };
  mat.customProgramCacheKey = () => (cm.tex ? 'camoT' : 'camo') + (det ? 'D' : '');
}
// оружие (Mark 2026-10-22: свои модели выглядели глянцевым пластиком): краска «в эксплуатации» — шейдером по координатам точки модели
// (м): пятна разного масштаба, потёки вдоль корпуса (ось z модели), блик по краске неровный; глянец — как у полуматовой эмали
const WEAR_GLSL = `varying vec3 vWearP;
float wearH(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float wearV(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(wearH(i), wearH(i + vec3(1, 0, 0)), f.x), mix(wearH(i + vec3(0, 1, 0)), wearH(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(wearH(i + vec3(0, 0, 1)), wearH(i + vec3(1, 0, 1)), f.x), mix(wearH(i + vec3(0, 1, 1)), wearH(i + vec3(1, 1, 1)), f.x), f.y), f.z); }`;
function wearMat(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = 'varying vec3 vWearP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvWearP = position;');
    sh.fragmentShader = WEAR_GLSL + '\n' + sh.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\n' +
        'float wM = wearV(vWearP * 7.0) * 0.5 + wearV(vWearP * 19.0) * 0.3 + wearV(vWearP * 53.0) * 0.2;\n' + // пятна краски
        'float wS = wearV(vec3(vWearP.x * 37.0, vWearP.y * 37.0, vWearP.z * 2.2));\n' + // потёки вдоль корпуса
        'diffuseColor.rgb *= 0.88 + 0.22 * wM - 0.1 * smoothstep(0.6, 0.92, wS);\n')
      .replace('#include <specularmap_fragment>', '#include <specularmap_fragment>\nspecularStrength *= 0.35 + 0.9 * wearV(vWearP * 11.0 + 3.1);\n');
  };
  mat.customProgramCacheKey = () => 'wear';
}
const pylonMat = new THREE.MeshPhongMaterial({ color: 0x4a4f54, specular: 0x222222, shininess: 20 });
// телефон (2026-10-22: Telegram закрывал вкладку в вертолётном режиме по памяти — у AH-64 18 текстур 1024 ≈ 100 МБ видеопамяти):
// текстуры вертолётов — не больше 512, остальных моделей — не больше 1024; распакованная картинка закрывается после загрузки на видеокарту
// (иначе держит ещё столько же обычной памяти). На ПК и в стендах (свои рендереры) — как было
const TOUCH = typeof matchMedia === 'function' && typeof location !== 'undefined' && (/[?&]touch=1/.test(location.search) || matchMedia('(pointer: coarse)').matches);
// уменьшенная копия картинки: 32×32, линейный цвет (sRGB → ^2,2, как в шейдере) — дальние копии построек красятся по ней в цвет вершин
// (city-render farFlat): вдали пиксель экрана — 3–6 м, рисунок текстуры там и так сливается в средний цвет. Без браузера — null
function smallTex(bmp) {
  if (typeof document === 'undefined' || !document.createElement) return null;
  try {
    const c1 = document.createElement('canvas'); c1.width = c1.height = 128; const x1 = c1.getContext('2d'); x1.imageSmoothingQuality = 'high'; x1.drawImage(bmp, 0, 0, 128, 128);
    const c2 = document.createElement('canvas'); c2.width = c2.height = 32; const x2 = c2.getContext('2d', { willReadFrequently: true }); x2.imageSmoothingQuality = 'high'; x2.drawImage(c1, 0, 0, 32, 32);
    const d = x2.getImageData(0, 0, 32, 32).data, L = new Float32Array(32 * 32 * 3);
    for (let i = 0, j = 0; i < d.length; i += 4, j += 3) { L[j] = (d[i] / 255) ** 2.2; L[j + 1] = (d[i + 1] / 255) ** 2.2; L[j + 2] = (d[i + 2] / 255) ** 2.2; }
    return L;
  } catch (_) { return null; }
}
const TEXC = new Map(); // общие текстуры моделей: отпечаток картинки | карта нормалей | предел размера → Promise<THREE.Texture>
// сжатые текстуры моделей (2026-10-23, KTX2 UASTC: в видеопамяти вчетверо меньше распакованного JPEG; файлы models/ktx, tools/airdef-models/ktx-models.js):
// есть файл нужной версии (index.json) — берём его, нет или не разобрался — JPEG из glb, как раньше. ?ktx=0 — без сжатых (ktx.js). У зданий и объектов — тоже сжатые (цвет вдали — с уменьшенной копии JPEG, mkKtx → small)
let KIDX = null; const ktxIndex = (base) => KIDX || (KIDX = cachedFetch(ktxIndexUrl(base)).then((r) => (r.ok ? r.json() : {})).catch(() => ({})));
// детали с одинаковым материалом — одна сетка (2026-10-23, нагрев телефонов): в файлах моделей у каждой детали свой материал, даже у
// одинаковых — у F/A-18 28 деталей = 28 вызовов отрисовки (после разрезки на зоны повреждений — 104), у «Шилки» 77, у построек объектов —
// десятки (и столько же у их дальних копий). Сливаются детали одной части (body / turret / cradle / prop* / wingA… — части двигаются) и одной
// метки «#…» (свой цвет постройки) с той же текстурой, картой нормалей, прозрачностью и камуфляжем; цвет детали (с перекраской и яркостью
// модели) уходит в цвет вершин вместе с затенением в стыках — свет считается так же (цвет вершины × текстура). Стекло и камуфляж — только
// одинаковые; жилые дома (по цвету их материала считается дальняя «коробка») — без переноса цвета. ?merge=0 — как было
const PINK = (f) => f[0] === 1 && f[1] === 0 && f[2] === 1;
function mergeSame(meshes, MM) {
  if (typeof location !== 'undefined' && /[?&]merge=0/.test(location.search)) return meshes;
  const sub = (n) => (n || '').split('|').pop(), groups = new Map(), noAO = typeof location !== 'undefined' && /[?&]ao=0/.test(location.search), HC = new THREE.Color();
  const info = (m) => { const n = m.name || '', pbr = m.mat.pbrMetallicRoughness || {}, f = pbr.baseColorFactor || [1, 1, 1, 1], rc = MM.recolor ? MM.recolor[sub(n)] : null, glass = m.mat.alphaMode === 'BLEND';
    const camo = !!MM.camo && !glass, tex = rc != null || !pbr.baseColorTexture ? -1 : pbr.baseColorTexture.index, fold = !glass && !camo && !MM.bld;
    const k = MM.bright && !glass ? MM.bright : 1; // яркость — только к цвету материала: перекраска и «нет текстуры» — как есть (так было до слияния)
    const c = rc != null ? HC.setHex(rc).toArray() : tex < 0 && PINK(f) ? HC.setHex(0x2e3128).toArray() : [f[0] * k, f[1] * k, f[2] * k];
    return { n, pbr, f, glass, tex, fold, c };
  };
  for (const m of meshes) {
    const I = info(m), drop = MM.drop && MM.drop.includes(sub(I.n));
    const k = [I.n.includes('|') ? I.n.split('|')[0] : 'body', I.n.split('#')[1] || '', m.mat.alphaMode || '', m.mat.alphaCutoff ?? '', I.fold ? 'fold' : I.f.join(',') + '|' + (MM.recolor && MM.recolor[sub(I.n)] != null ? MM.recolor[sub(I.n)] : ''),
      I.tex, m.mat.normalTexture ? m.mat.normalTexture.index : -1, /#camo$/.test(m.mat.name || '') ? 1 : 0, I.tex >= 0 && m.uv ? 1 : 0, I.fold ? '' : m.ao ? m.ao.constructor.name : '', drop ? 'drop' + I.n : '', m.hub ? m.hub.join(',') : ''].join('|');
    (groups.get(k) || groups.set(k, []).get(k)).push([m, I]);
  }
  if (groups.size === meshes.length) return meshes;
  const cat = (L, f) => { const A = L.map(f), C = A[0].constructor, out = new C(A.reduce((s, a) => s + a.length, 0)); let o = 0; for (const a of A) { out.set(a, o); o += a.length; } return out; };
  return [...groups.values()].map((G) => {
    const L = G.map((x) => x[0]); if (L.length === 1) return L[0];
    const nv = L.reduce((s, m) => s + m.pos.length / 3, 0), idx = new (nv > 65535 ? Uint32Array : Uint16Array)(L.reduce((s, m) => s + m.idx.length, 0));
    let io = 0, vo = 0; for (const m of L) { for (let i = 0; i < m.idx.length; i++) idx[io++] = m.idx[i] + vo; vo += m.pos.length / 3; }
    const out = { ...L[0], pos: cat(L, (m) => m.pos), nor: cat(L, (m) => m.nor), uv: L[0].uv && G[0][1].tex >= 0 ? cat(L, (m) => m.uv) : L[0].uv && L.every((m) => m.uv) ? cat(L, (m) => m.uv) : null, ao: !G[0][1].fold && L[0].ao ? cat(L, (m) => m.ao) : null, idx };
    if (G[0][1].fold) { // цвет детали × затенение — в цвет вершин
      const vc = new Float32Array(nv * 3); let o = 0;
      for (const [m, I] of G) { const n = m.pos.length / 3, A = !noAO && m.ao, as = A ? A.length / n : 0, ak = A ? (A instanceof Uint8Array ? 1 / 255 : A instanceof Uint16Array ? 1 / 65535 : 1) : 0;
        for (let v = 0; v < n; v++) for (let c = 0; c < 3; c++) vc[o++] = I.c[c] * (A ? A[v * as + c] * ak : 1); }
      Object.assign(out, { vc, fold: true, texIdx: G[0][1].tex });
    }
    return out;
  });
}
async function load(name, base) {
  const r = await cachedFetch(modelUrl(base, name)); if (!r.ok) throw new Error(`${name}: ${r.status}`); // с кэша устройства, если модель уже скачана (offline.js)
  const pg = parseGlb(await r.arrayBuffer()), { images, hashes, textures, nrm } = pg;
  const meshes = mergeSame(pg.meshes, META[name] || META[name.replace(/_lo$/, '')] || {});
  const tmax = TOUCH ? (/^h_/.test(name) ? 512 : 1024) : 0, MM0 = META[name] || META[name.replace(/_lo$/, '')] || {};
  const KI = ktxOn() ? await ktxIndex(base) : null; // здания и объекты — тоже (их цвет вдали берётся с уменьшенной копии, mkKtx → small)
  const tex = await Promise.all(textures.map((t, ti) => {
    const isN = nrm.has(ti), tm = isN && TOUCH ? Math.min(tmax, 512) : tmax; // карта нормалей — линейная (не цвет); на телефоне вдвое меньше
    if (MM0.bld && !KI) return mkTex(t, isN, tm); // без сжатых: у зданий картинку читает дальняя «коробка» (city-render modelColor) — свои копии, как было
    const mk = () => (KI ? mkKtx(t, isN, tm).then((x) => x || mkTex(t, isN, tm)) : mkTex(t, isN, tm)); // сжатая; не вышло — JPEG из glb
    const k = `${hashes[t.source]}|${isN ? 1 : 0}|${tm}`; // та же картинка, тот же вид и предел размера — одна текстура на все модели
    if (!TEXC.has(k)) TEXC.set(k, mk().then((x) => { if (!x) TEXC.delete(k); return x; })); // не вышло (нехватка памяти) — следующая модель попробует заново
    return TEXC.get(k);
  }));
  // сжатая текстура картинки из glb (файл models/ktx/<имя>.<номер>.ktx2): те же настройки, что у JPEG-пути; на телефоне — без верхних уровней больше предела;
  // нет файла этой версии или любая ошибка — null (вызывающий берёт JPEG)
  async function mkKtx(t, isN, tm) {
    const url = ktxUrlOf(base, KI, name, t.source, glbVer); if (!url) return null;
    try {
      const r = await cachedFetch(url); if (!r.ok) return null;
      const x = await ktxParse(await r.arrayBuffer(), tm);
      x.flipY = false; x.encoding = isN ? THREE.LinearEncoding : THREE.sRGBEncoding; x.anisotropy = 4; x.wrapS = x.wrapT = THREE.RepeatWrapping; x.needsUpdate = true;
      // на телефоне — копия уровней в памяти после загрузки на видеокарту не нужна (как close() у ImageBitmap); потеря контекста в бою — заново из кэша
      ktxFree(x, () => cachedFetch(url).then((q) => q.arrayBuffer()).then((b) => ktxParse(b, tm)));
      if ((MM0.bld || MM0.obj) && !isN && typeof createImageBitmap === 'function') { // постройки: цвет вдали (modelColor, farFlat) — с уменьшенной копии JPEG из glb
        try { const b = await createImageBitmap(images[t.source], { resizeWidth: 128, resizeHeight: 128, resizeQuality: 'high' }); x.small = smallTex(b); b.close(); } catch (_) { /* без копии — дальняя копия как была */ }
      }
      return x;
    } catch (e) { console.warn(`${name}: KTX2 не вышел, берём JPEG:`, e.message); return null; }
  }
  async function mkTex(t, isN, tm) {
    if (typeof createImageBitmap !== 'function') return null;
    let bmp; try { bmp = await createImageBitmap(images[t.source]); } catch (_) { return null; } // битая картинка — модель без этой текстуры
    if (tm && Math.max(bmp.width, bmp.height) > tm) { // уменьшить (с сохранением пропорций); не вышло — оставить как есть
      const k = tm / Math.max(bmp.width, bmp.height);
      const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
      try { const sm = await createImageBitmap(bmp, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' }); if (sm.width <= tm && sm.height <= tm) { bmp.close(); bmp = sm; } else sm.close(); } catch (_) { /* браузер без resize */ }
      if (Math.max(bmp.width, bmp.height) > tm && typeof document !== 'undefined') try { // resize не поддержан (бывает в Safari: молча отдаёт прежний размер) — через canvas
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(bmp, 0, 0, w, h); const sm = await createImageBitmap(cv); bmp.close(); bmp = sm;
      } catch (_) { /* оставить как есть */ }
    }
    const small = MM0.bld || MM0.obj ? smallTex(bmp) : null; // постройки: уменьшенная копия — по ней красится дальняя копия (city-render farFlat)
    // UV glTF — без переворота
    const x = new THREE.Texture(bmp); if (small) x.small = small; /* у Texture в r128 нет userData */ x.flipY = false; x.encoding = isN ? THREE.LinearEncoding : THREE.sRGBEncoding; x.anisotropy = 4; x.wrapS = x.wrapT = THREE.RepeatWrapping; x.needsUpdate = true;
    // на видеокарте — копия в памяти больше не нужна (рендерер в игре один; потеря контекста WebGL — перезагрузка страницы, main.js);
    // у зданий картинку читает дальняя «коробка» (city-render modelColor) — не закрываем
    if (TOUCH && !MM0.bld) x.onUpdate = () => { if (x.image && x.image.close) x.image.close(); };
    return x;
  }
  // меш «часть|материал»: у комплексов — body / turret / cradle, у остальных всё в body
  const MM = META[name] || META[name.replace(/_lo$/, '')] || {}, matte = !!MM.matte;
  // drop — лишние детали источника (переходник пилона и т. п.); recolor — свой цвет детали (по имени после «|», линейный)
  const group = new THREE.Group(), parts = {};
  const partOf = (n) => { const k = n.includes('|') ? n.split('|')[0] : 'body'; if (!parts[k]) { parts[k] = new THREE.Group(); parts[k].name = k; group.add(parts[k]); } return parts[k]; };
  const sub = (n) => (n || '').split('|').pop();
  for (const m of meshes) {
    if (MM.drop && MM.drop.includes(sub(m.name))) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(m.nor, 3));
    if (m.uv) g.setAttribute('uv', new THREE.BufferAttribute(m.uv, 2));
    if (m.vc) g.setAttribute('color', new THREE.BufferAttribute(m.vc, 3)); else if (m.ao) g.setAttribute('color', new THREE.BufferAttribute(m.ao, 4, true));
    g.setIndex(new THREE.BufferAttribute(m.idx, 1)); g.computeBoundingSphere();
    const pbr = m.mat.pbrMetallicRoughness, f = pbr.baseColorFactor || [1, 1, 1, 1], glass = m.mat.alphaMode === 'BLEND';
    const map = m.fold ? (m.texIdx >= 0 ? tex[m.texIdx] : null) : pbr.baseColorTexture ? tex[pbr.baseColorTexture.index] : null; // m.fold — слитые детали: цвет — в вершинах (mergeSame)
    const nmap = !glass && m.mat.normalTexture && !/[?&]nrm=0/.test(typeof location !== 'undefined' ? location.search : '') ? tex[m.mat.normalTexture.index] : null; // ?nrm=0 — без карты нормалей (сравнение)
    const mat = glass
      ? new THREE.MeshPhongMaterial({ color: new THREE.Color(f[0], f[1], f[2]).lerp(new THREE.Color(0.2, 0.26, 0.32), f[0] + f[1] + f[2] > 1.8 ? 0.8 : 0.4), /* белое «стекло» авторов — в тонированное, своё цветное — почти как есть */ transparent: true, opacity: Math.max(0.5, f[3]), specular: 0xffffff, shininess: 120, side: THREE.DoubleSide, depthWrite: false }) // стекло заметно: не меньше 0,5
      : new THREE.MeshPhongMaterial({ map, ...(nmap ? { normalMap: nmap, normalScale: new THREE.Vector2(1, -1) /* текстуры glTF не перевёрнуты (flipY = false), тангенсов у мешей нет — зелёный канал в three r128 надо инвертировать (как делает GLTFLoader) */ } : {}), color: m.fold ? new THREE.Color(1, 1, 1) : new THREE.Color(f[0], f[1], f[2]), specular: matte ? 0x0c0c0c : 0x3a3a3a, shininess: matte ? 10 : 38, side: THREE.DoubleSide, /* matte — краска техники без блеска */
        ...(m.mat.alphaMode === 'MASK' ? { alphaTest: m.mat.alphaCutoff ?? 0.5 } : {}), ...(m.vc || (m.ao && !/[?&]ao=0/.test(typeof location !== 'undefined' ? location.search : '')) ? { vertexColors: true } : {}) }); // ?ao=0 — без затенения (сравнение)
    const rc = m.fold ? null : MM.recolor && MM.recolor[sub(m.name)]; // у слитых перекраска и яркость — уже в цвете вершин
    if (MM.bright && !glass && !m.fold) mat.color.multiplyScalar(MM.bright);
    if (rc != null) { mat.color.setHex(rc); mat.map = null; }
    else if (!m.fold && !map && !glass && f[0] === 1 && f[1] === 0 && f[2] === 1) mat.color.setHex(0x2e3128); // пурпурная «нет текстуры» — в нейтральный тёмный
    if (MM.camo && !glass && (MM.camo.tex ? map : /#camo$/.test(m.mat.name || ''))) camoMat(mat, MM.camo, !/_lo$/.test(name) && !/[?&]det=0/.test(typeof location !== 'undefined' ? location.search : '')); // узор — шейдером (tex — по краске текстуры; зернистость — только у ближней модели)
    else if ((MM.weapon || MM.samMissile || /^w_nar_/.test(name)) && !glass) { wearMat(mat); if (!matte) { mat.specular.setHex(0x262626); mat.shininess = 24; } } // оружие — краска с потёртостями, полуматовая
    const mesh = new THREE.Mesh(g, mat); mesh.name = m.name; mesh.userData.glass = glass; const pt = partOf(m.name || ''); pt.add(mesh); if (m.hub) pt.userData.hub = m.hub;
  }
  // винты (части prop*, Ту-95): ось — вдоль самолёта через центр ступицы; соосные ряды (чётный / нечётный номер) — в разные
  // стороны; крутит игра (spinProps). В userData — только число (клон модели копирует userData через JSON)
  for (const part of group.children.filter((c) => /^prop/.test(c.name))) {
    const b = new THREE.Box3().setFromObject(part), c = b.getCenter(new THREE.Vector3());
    for (const m of part.children) m.geometry.translate(-c.x, -c.y, -c.z);
    part.position.copy(c); part.userData.spin = Math.abs(+part.name.split('_').pop()) % 2 ? -1 : 1; part.userData.nodisc = part.userData.spin < 0 ? 1 : 0; // диск — один на пару соосных рядов
  }
  // винты вертолётов: rotor / rotor2 (соосный нижний, крутится в другую сторону) — несущие, ось вертикальная (Y); trotor — рулевой, ось поперечная (X).
  // Ось — через центр втулки (hub из prepare.js; нет — центр габаритов), лопасти не «болтаются». Несущий у запада — против часовой (сверху), у востока — по часовой
  for (const part of group.children.filter((c) => /^(rotor2?|trotor)$/.test(c.name))) {
    const tail = part.name === 'trotor', c = part.userData.hub ? new THREE.Vector3(...part.userData.hub) : new THREE.Box3().setFromObject(part).getCenter(new THREE.Vector3());
    for (const m of part.children) m.geometry.translate(-c.x, -c.y, -c.z);
    part.position.copy(c); part.userData.axis = tail ? 'x' : 'y'; part.userData.nodisc = part.name === 'rotor2' ? 1 : 0; // у соосной пары диск — один (от верхнего)
    part.userData.spin = tail ? 1 : (MM.side === 'west' ? 1 : -1) * (part.name === 'rotor2' ? -1 : 1);
  }
  // крылья мельницы (часть sail, obj_mill): ось Z (горизонтальная, вперёд) через ступицу — hub из prepare.js; лопасти остаются непрозрачными (без призраков и диска), крутит spinSails
  for (const part of group.children.filter((c) => c.name === 'sail')) {
    const c = part.userData.hub ? new THREE.Vector3(...part.userData.hub) : new THREE.Box3().setFromObject(part).getCenter(new THREE.Vector3());
    for (const m of part.children) m.geometry.translate(-c.x, -c.y, -c.z);
    part.position.copy(c); part.userData.sail = 1;
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
    group.userData.wings = true; if ((META[name] || {}).flip) group.userData.flip = true; // висит крыльями вниз (УМПК): после сброса переворачивается на 180° (glideWings)
  }
  // дорисованные пилоны там, где у модели их нет
  for (const p of (META[name] || META[name.replace(/_lo$/, "")] || { stations: [] }).stations) if (p.py > 0) { /* дальняя копия _lo — по описанию основной */ const pm = new THREE.Mesh(new THREE.BoxGeometry(0.12, p.py, 1.6), pylonMat); pm.position.set(p.x, p.y + p.py / 2, p.z); group.add(pm); }
  return group;
}
// готовая модель комплекса: { body, turret, cradle } (копии) или null — тогда процедурная
const UMODEL = Object.fromEntries(Object.entries(META).filter(([, m]) => m.units).flatMap(([n, m]) => m.units.map((k) => [k, n])));
// у тяжёлых моделей ПВО — дальняя копия <имя>_lo: каждая часть (корпус, башня, пакет) — THREE.LOD, ближе 400 м — подробная
const UNIT_LO = new Set(['bukm3', 's125', 'gepard', 'ew_e', 's400', 'tor', 'pantsir', 'sampt', 'tunguska', 'skyguard', 'rapier', 'zsu234', 'm163', 'chaparral', 'avenger']);
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
  const n = UMODEL[key]; if (n && BASE && !LOADING.has(n)) start(n); // телефон: подробная модель ещё не грузилась — ракеты из неё со следующего пуска
  const G = n && (LOADED[n] || LOADED[n + '_lo']); if (!G) return null;
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
const glbVer = (name) => GLB_V[name] || '20261022b';
const modelUrl = (base, name) => `${base}models/${name}.glb?v=${glbVer(name)}`;
// все модели игры — для «Скачать всё заранее» (Настройки, offline.js prefetchAll): самолёты, оружие, техника и её дальние копии, постройки
export function modelUrls(base = BASE) { const N = new Set([...Object.keys(META), ...Object.keys(GLB_V)]); for (const n of UNIT_LO) N.add(n + '_lo'); return [...N].map((n) => modelUrl(base, n)); }
export function loadModels(base, onReady) {
  BASE = base; READY = onReady;
  for (const [name, m] of Object.entries(META)) if (!m.units && !m.bld && !m.lazy) start(name); // самолёты (кроме lazy), оружие, ракеты ПЗРК — сразу
}
// модели «Мульти-волны» и прочие lazy: начать загрузку / копия загруженной (или null)
export function wantModel(name) { if (META[name] && BASE) start(name); }
export const anyModel = (name) => (LOADED[name] ? LOADED[name].clone() : null);
// телефон (2026-10-22, вылеты самолётных боёв): у тяжёлых комплексов подробная модель — только когда камера подлетела ближе 1,5 км
// (wantUnitNear из main.js; LOD переключает на неё с 400 м) или комплекс пустил ракету (unitMissileGlb): «Шилка» — 656 тыс. треугольников
// и 31 МБ геометрии (в памяти дважды: массив и видеокарта), а в самолётном бою камера к машинам ПВО обычно не подлетает. Вблизи модель та же
export function wantUnit(key) { const n = UMODEL[key]; if (n && BASE) { if (UNIT_LO.has(n)) start(n + '_lo'); if (!TOUCH || !UNIT_LO.has(n)) start(n); } } // сначала лёгкая дальняя копия
export function wantUnitNear(key) { const n = UMODEL[key]; if (n && BASE && !LOADING.has(n)) start(n); }
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
// планирующая бомба в полёте, вызывать после lookAt (aimed — lookAt был в этом кадре); dt — секунд кадра. Крылья раскрываются через 0,3 с за 0,8 с; у бомб с flip (УМПК висит крыльями вниз) —
// сперва переворот на 180° вокруг оси (0,3…1,6 с), крылья — когда она уже вверх крыльями (1,3…2,1 с)
export function glideWings(obj, dt, aimed = true) {
  const u = obj.userData; if (!u.wings) return;
  const T = (u.wingT = (u.wingT || 0) + dt), c01 = (x) => Math.min(1, Math.max(0, x));
  setWings(obj, c01((T - (u.flip ? 1.3 : 0.3)) / 0.8));
  if (u.flip && aimed) { const r = c01((T - 0.3) / 1.3); obj.rotateZ(Math.PI * r * r * (3 - 2 * r)); }
}
// у оружия есть готовая модель, но она ещё грузится (временную фигуру потом подменить)
// у оружия есть настоящая модель (а не процедурная фигура): только к такому подводим камеру (ЗУР — всегда, это не про них)
export const weaponHasModel = (key, W) => !!(WMODEL[key] || (W && W.model));
export const weaponPending = (key) => { const n = WMODEL[key]; return !!(n && !LOADED[n]); };
export function weaponMesh(key, W, geoFn, mat) {
  const n = WMODEL[key];
  if (n && LOADED[n]) { const o = LOADED[n].clone(); o.traverse((q) => { if (q.isMesh) q.castShadow = true; }); setWings(o, 0); return o; } // крылья — сложены (на подвеске)
  return new THREE.Mesh(geoFn(key, W), mat);
}
// оружие на пилоне (своём и ИИ): та же модель, слитая — одна сетка на материал (2026-10-23, нагрев телефонов: у самолёта игрока подвески
// давали ~100 вызовов отрисовки и столько же в тенях — каждая деталь бомбы отдельно). Крылья сложены, частей не двигаем — на пилоне не нужно;
// в полёте — weaponMesh (там крылья раскрываются)
const PYLON = new Map(), PI4 = new THREE.Matrix4();
export function pylonMesh(key, W, geoFn, mat) {
  const n = WMODEL[key]; if (!n || !LOADED[n]) return weaponMesh(key, W, geoFn, mat);
  let P = PYLON.get(n);
  if (!P) {
    const src = LOADED[n].clone(); setWings(src, 0); src.updateMatrixWorld(true); PI4.copy(src.matrixWorld).invert();
    const by = new Map(); let ok = true;
    src.traverse((q) => { if (!q.isMesh) return; if (q.isSkinnedMesh || q.morphTargetInfluences || Array.isArray(q.material)) ok = false; let v = true; for (let p = q; p && p !== src; p = p.parent) if (!p.visible) v = false; if (!v) return;
      (by.get(q.material) || by.set(q.material, []).get(q.material)).push({ g: q.geometry, m: new THREE.Matrix4().multiplyMatrices(PI4, q.matrixWorld) }); });
    P = ok && by.size ? { q: src.quaternion.clone(), s: src.scale.clone(), parts: [...by].map(([m, gs]) => ({ m, g: mergeLocal(gs) })) } : 'orig';
    PYLON.set(n, P);
  }
  if (P === 'orig') return weaponMesh(key, W, geoFn, mat); // особая модель (кости, морфы, несколько материалов на сетке) — как есть
  const o = new THREE.Group(); o.quaternion.copy(P.q); o.scale.copy(P.s);
  for (const p of P.parts) { const m = new THREE.Mesh(p.g, p.m); m.castShadow = true; o.add(m); }
  return o;
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
export const planeMeta = (name) => META[name] || null;
// вращение винтов модели (части с userData.spin). Как в авиасимуляторах: настоящие 8–12 об/с на экране 60 к/с дают
// «стробоскоп» (лопасти скачут или стоят плоскими «блинами»), поэтому на ходу лопасти полупрозрачные и крутятся медленно
// (как на видео), а поверх — размытый диск винта с мягкими следами лопастей
const PROPS = new WeakMap();
let DISC_TEX = null;
function discTex() {
  if (DISC_TEX || typeof document === 'undefined') return DISC_TEX;
  const N = 256, cv = document.createElement('canvas'); cv.width = cv.height = N; const g = cv.getContext && cv.getContext('2d'), im = g && g.createImageData && g.createImageData(N, N);
  if (!im || !im.data) return null; // без настоящего canvas (проверки) — без диска
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (x + 0.5) / N * 2 - 1, dy = (y + 0.5) / N * 2 - 1, r = Math.hypot(dx, dy), th = Math.atan2(dy, dx);
    const ring = r < 0.13 || r > 1 ? 0 : Math.min(1, (r - 0.13) / 0.12) * Math.min(1, (1 - r) / 0.1); // от кока до концов лопастей
    const blades = Math.pow(0.5 + 0.5 * Math.cos(4 * th), 6) * (0.4 + 0.6 * r); // 4 следа лопастей, смазанные по кругу
    const a = ring * (0.09 + 0.15 * blades);
    const k = (y * N + x) * 4; im.data[k] = 34; im.data[k + 1] = 36; im.data[k + 2] = 38; im.data[k + 3] = Math.round(a * 255);
  }
  g.putImageData(im, 0, 0); DISC_TEX = new THREE.CanvasTexture(cv); DISC_TEX.encoding = THREE.sRGBEncoding; return DISC_TEX;
}
function propSetup(obj) {
  const L = []; let ghost = null; const ghosts = new Map(); // у вертолётных винтов призрачный материал — свой на каждый исходный (цвет лопастей), у пропеллеров — общий
  obj.traverse((o) => { if (o.userData.spin) L.push(o); });
  for (const p of L.slice()) {
    const ax = p.userData.axis || 'z'; let R = 0;
    for (const m of p.children) {
      if (!m.geometry) continue;
      if (ax === 'z') { m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox; R = Math.max(R, -b.min.x, b.max.x, -b.min.y, b.max.y); continue; }
      const P = m.geometry.attributes.position; for (let i = 0; i < P.count; i++) R = Math.max(R, ax === 'y' ? Math.hypot(P.getX(i), P.getZ(i)) : Math.hypot(P.getY(i), P.getZ(i))); // радиус по концам лопастей (от втулки)
    }
    for (const m of p.children) if (m.isMesh) {
      if (p.userData.axis) { let gm = ghosts.get(m.material); if (!gm) { gm = m.material.clone(); gm.transparent = true; gm.opacity = 0.35; gm.depthWrite = false; ghosts.set(m.material, gm); } m.material = gm; continue; }
      if (!ghost) { ghost = m.material.clone(); ghost.transparent = true; ghost.opacity = 0.35; ghost.depthWrite = false; } m.material = ghost;
    }
    const tex = discTex(); if (!tex || !R || p.userData.nodisc) continue; // соосные ряды — один диск на пару
    const geo = new THREE.CircleGeometry(R, 64); if (ax === 'y') geo.rotateX(-Math.PI / 2); else if (ax === 'x') geo.rotateY(Math.PI / 2); // несущий — горизонтальный круг, рулевой — вертикальный (плоскость YZ)
    const d = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    d.position.copy(p.position); d.renderOrder = 4; d.userData.fx = true; p.parent.add(d);
    L.push({ disc: d, spin: p.userData.spin, axis: ax });
  }
  return L;
}
// крылья мельницы: w — рад/с (по умолчанию ≈ 1 оборот за 18 с); вызывать для группы постройки (obj_mill) — крутятся все части sail внутри
export function spinSails(obj, dt, w = 0.35) { obj.traverse((o) => { if (o.userData.sail) o.rotation.z -= dt * w; }); }
// thr — газ 0…1 (у вертолёта винт крутится и на малом газу); рулевой винт — вдвое быстрее несущего
export function spinProps(obj, dt, thr = 1) {
  let L = PROPS.get(obj); if (!L) { L = propSetup(obj); PROPS.set(obj, L); }
  for (const p of L) {
    if (p.disc) p.disc.rotation[p.axis] += p.spin * dt * (4 + 3 * thr); // следы лопастей на диске
    else { const ax = p.userData.axis || 'z'; p.rotation[ax] += p.userData.spin * dt * (9 + 7 * thr) * (ax === 'x' ? 2 : 1); } // лопасти ≈ 2,5 об/с: быстро, но ещё без «стробоскопа» (4 лопасти — до ≈ 45° за кадр)
  }
} // сопла, пилоны — для зон повреждений (plane-zones.js) и проверок
export function planeModel(side, cls = 'strike', name = null) {
  if (name && META[name] && !LOADED[name] && BASE) start(name); // своя модель подвески ещё не пришла — пока подходящая из загруженных
  const rank = ([n, m]) => (n === name ? -2 : m.cls === cls ? -1 : 0);
  const pick = Object.entries(META).filter(([n, m]) => m.side && m.side === side && LOADED[n] && (!m.only || n === name) && (!m.heli || n === name)).sort((a, b) => rank(a) - rank(b))[0];
  if (!pick) return null;
  const [n, m] = pick;
  return { obj: LOADED[n].clone(), stations: m.stations, pods4: !!m.pods4, nozzles: m.nozzles, nr: m.nr, dry: !!m.dry, pod: m.pod, name: n, cls: m.cls, internal: !!m.internal }; // dry — без форсажа (только слабое свечение)
}
// вертолёт: готовая модель (копия) и точки подвески на консолях; нет модели (или ещё грузится — запрос послан) — null, подмены самолётом нет
export function heliModel(name) {
  const m = META[name]; if (!m || !m.heli) return null;
  if (!LOADED[name]) { if (BASE) start(name); return null; }
  return { obj: LOADED[name].clone(), stations: m.stations, name, side: m.side };
}
