// Готовые модели (glb, подготовленные tools/airdef-models/prepare.js: метры, нос в −Z, позиции / нормали / UV,
// текстуры цвета в JPEG). Загружаются в фоне при старте; пока не загрузились (или если загрузка не удалась) — в игре
// процедурные модели из units-render.js. Материалы — Phong, как у остальной техники (освещение и туман игры).
// Для каждой модели: сторона и класс (strike — ударные загрузки с бомбами, fighter — ракетные), точки подвески
// (как у процедурных: L3 L2 L1 Ф1 Ф2 R1 R2 R3; py — высота дорисованного пилона, если у модели его нет), сопла (срез, по
// tools/airdef-models/planes-view.html?ortho=1; dry — двигатель без форсажа: только слабое свечение; нет сопел — пламени не видно: B-2, F-117) и место
// контейнера. Авторы и лицензии — MODEL_CREDITS (показываются в «Настройках»).
/* global THREE */
import { CREDITS } from './models/credits.js?v=20261022l';
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
  e_su24: { side: 'east', cls: 'strike', lazy: true, stations: mirror([V(-4.8, -1.13, 3.4, 0.3), V(-2.08, -1.39, 1.87), V(-0.5, -2.1, 3.0), V(-0.4, -2.12, -0.4)]),
    nozzles: [V(-0.6, -1.29, 9.86), V(0.6, -1.29, 9.86)], nr: 0.32, pod: null }, // Су-24М — manilov.ap («Кайра» встроена; пилоны консолей дорисованы)
  // ── 2026-10-19: manilov.ap (Tornado, F-111, МиГ-23, МиГ-27, Ту-22М2), Immersive3D (A-10), Spark_Customs (F-15E) ──
  e_tornado: { side: 'west', cls: 'strike', lazy: true, stations: mirror([V(-5.41, -1.68, 1.59), V(-2.95, -1.88, 0.52), V(-0.75, -2.27, -1.2), V(-0.75, -2.33, 2.4)]),
    nozzles: [V(-0.59, -1.19, 6.34), V(0.59, -1.19, 6.34)], nr: 0.25, pod: V(0, -2.35, 0.5) }, // Tornado IDS
  e_f111: { side: 'west', cls: 'strike', lazy: true, stations: mirror([V(-4.42, -1.43, 2.07), V(-3.03, -1.35, 1.62), V(-0.6, -1.99, -0.5), V(-0.6, -1.99, 1.5)]),
    nozzles: [V(-0.76, -1.1, 10.12), V(0.76, -1.1, 10.12)], nr: 0.3, pod: null }, // F-111F («Пэйв Тэк» во внутреннем отсеке)
  e_mig23: { side: 'east', cls: 'strike', lazy: true, stations: mirror([V(-1.44, -0.6, 0.34), V(-0.45, -1.43, -0.6), V(-0.45, -1.28, 2.2)]),
    nozzles: [V(0, -0.66, 7.57)], nr: 0.35, pod: null }, // МиГ-23БН
  e_mig27: { side: 'east', cls: 'strike', lazy: true, stations: mirror([V(-1.53, -0.61, 0.62), V(-0.45, -1.4, -0.6), V(-0.45, -1.46, 2.2)]),
    nozzles: [V(0, -0.65, 7.43)], nr: 0.33, pod: null }, // МиГ-27К («Кайра» встроена)
  e_tu22m2: { side: 'east', cls: 'bomber', lazy: true, stations: mirror([V(-6.34, -3.89, 5.06), V(-1.27, -2.71, -3.2), V(-1.27, -2.71, -0.5), V(-1.27, -2.71, 2.2)]),
    nozzles: [V(-0.81, -1.24, 19.09), V(0.81, -1.24, 19.09)], nr: 0.4, pod: null }, // Ту-22М2
  e_a10: { side: 'west', cls: 'strike', lazy: true, stations: mirror([V(-6.25, -0.4, -0.09), V(-5.1, -0.52, -0.04), V(-3.8, -0.68, -0.15), V(-2.94, -0.14, -0.06)]),
    nozzles: [V(-1.46, 1.1, 4.99), V(1.46, 1.1, 4.99)], nr: 0.25, pod: V(2.2, -0.5, -0.1), dry: true }, // A-10A
  e_f15e: { side: 'west', cls: 'fighter', lazy: true, stations: mirror([V(-2.93, -1.18, 0.46), V(-1.75, -1.59, -1.5), V(-1.75, -1.59, 0.3), V(-1.75, -1.05, 1.8)]),
    nozzles: [V(-0.68, -1.12, 8.31), V(0.68, -1.12, 8.31)], nr: 0.3, pod: V(0.9, -1.9, -2.5), matte: true }, // F-15E (LANTIRN под воздухозаборником)
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
    nozzles: [V(-1.0, -0.9, 0.9), V(1.0, -0.9, 0.9)], nr: 0.2, pod: null, dry: true }, // Harrier GR.3
  e_mirage: { side: 'west', cls: 'strike', lazy: true, stations: mirror([V(-2.8, -2.0, 3.1, 0.28), V(-2.08, -1.98, 2.45, 0.28), V(-0.6, -2.05, -0.5, 0.2), V(-0.6, -2.05, 2.0, 0.2)]),
    nozzles: [V(0, -1.11, 7.18)], nr: 0.42, pod: V(0, -2.15, 0.6) }, // Mirage 2000D
  e_rafale: { side: 'west', cls: 'strike', lazy: true, stations: mirror([V(-3.75, -1.85, 3.6), V(-2.6, -1.85, 2.6, 0.3), V(-1.6, -1.85, 1.6, 0.3), V(-0.6, -2.15, 1.0, 0.15)]),
    nozzles: [V(-0.72, -1.24, 6.56), V(0.72, -1.24, 6.56)], nr: 0.3, pod: V(0.6, -2.2, -1.0) }, // Rafale («Дамокл» под воздухозаборником)
  e_b2: { side: 'west', cls: 'bomber', lazy: true, internal: true, stations: mirror([V(-3, -1.0, -1.5), V(-3, -1.0, 0.5), V(-2, -1.0, -1.5), V(-2, -1.0, 0.5)]),
    nozzles: [], nr: 0.1, pod: null }, // B-2A (бомбы — во внутренних отсеках)
  // ── 2026-10-19, четвёртая партия: manilov.ap (Як-38, Ил-28, Ту-22, Ту-95, Hunter), andertan (Су-27, Су-35), helijah (Super Étendard),
  // Civorsky (Mirage F1), Rhine_Lab_Muelsyse (F/A-18C, EA-18G); бомбардировщики с отсеком — internal, точки — в отсеке
  e_yak38: { side: 'east', cls: 'strike', lazy: true, stations: mirror([V(-2.45, -1.42, 2.0, 0.3), V(-1.95, -1.4, 1.25), V(-0.45, -1.85, 0.3, 0.15), V(-0.45, -1.85, 2.3, 0.15)]),
    nozzles: [V(-0.6, -1.35, 1.6), V(0.6, -1.35, 1.6)], nr: 0.3, pod: null, dry: true }, // Як-38М (поворотные сопла по бокам)
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
    nozzles: [V(0, -0.81, 6.76)], nr: 0.35, pod: null, dry: true }, // Hunter FGA.9
  e_etendard: { side: 'west', cls: 'strike', lazy: true, stations: mirror([V(-2.64, -1.49, 1.85, 0.3), V(-1.92, -1.48, 1.23, 0.3), V(-0.4, -1.6, 0.0, 0.17), V(-0.4, -1.6, 1.8, 0.17)]),
    nozzles: [V(0, -0.57, 6.3)], nr: 0.35, pod: V(0.4, -1.7, -1.0), dry: true }, // Super Étendard (ATLIS под фюзеляжем)
  e_mirage_f1: { side: 'west', cls: 'strike', lazy: true, stations: mirror([V(-2.41, -1.13, 1.9, 0.28), V(-1.75, -1.07, 1.55, 0.28), V(-0.45, -1.9, 0.3, 0.15), V(-0.45, -1.9, 2.3, 0.15)]),
    nozzles: [V(0, -1.03, 7.63)], nr: 0.45, pod: null, camo: { scheme: 'fr', size: 2.6 } }, // Mirage F1
  e_f18c: { side: 'west', cls: 'strike', lazy: true, stations: mirror([V(-4.3, -1.25, 2.7, 0.3), V(-3.42, -1.54, 1.36), V(-2.24, -1.47, 1.16), V(-0.6, -1.6, 1.0, 0.15)]),
    nozzles: [V(-0.49, -0.98, 8.0), V(0.49, -0.98, 8.0)], nr: 0.42, pod: V(0.75, -1.6, -1.2) }, // F/A-18C (AN/AAS-38 у воздухозаборника)
  e_ea18g: { side: 'west', cls: 'fighter', lazy: true, stations: mirror([V(-5.08, -0.97, 3.11), V(-4.31, -1.28, 2.46), V(-2.73, -1.05, 2.26, 0.3), V(-0.6, -1.85, 1.0, 0.15)]),
    nozzles: [V(-0.48, -0.81, 8.18), V(0.48, -0.81, 8.18)], nr: 0.42, pod: null }, // EA-18G Growler
  e_su25: { side: 'east', cls: 'strike', lazy: true, stations: mirror([V(-4.37, -1.11, 0.67), V(-3.59, -1.09, 0.4), V(-2.81, -1.09, 0.2), V(-2.03, -1.07, -0.04)]),
    nozzles: [V(-0.88, -1.4, 3.85), V(0.88, -1.4, 3.85)], nr: 0.2, pod: null, dry: true }, // Су-25 — Immersive3D («Шквал» у Су-25Т встроен)
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
  w_storm: { weapon: 'storm', lazy: true, stations: [], drop: ['ss_misile.002', 'ss_misile.005'] }, // Storm Shadow — с Су-24 42manako; без переходника пилона (drop)
  w_atacms: { weapon: 'atacms', lazy: true, stations: [] }, // ракета M142 HIMARS — Denis.Cherkasov1
  d_shahed: { ev: true, lazy: true, stations: [] }, // «Шахед-136» — faintastic (винт — группа prop)
  d_uav: { ev: true, lazy: true, stations: [] }, // БПЛА — Artem Goyko (винты — prop, prop2)
  // ── вертолёты (2026-10-20): грузятся по запросу (heliModel / wantModel); винты — части rotor, rotor2 (соосный нижний), trotor — крутит spinProps;
  // stations — две точки на борт (внешняя, внутренняя) на консолях, оси модели (нос в −Z); nozzles пусто — пламени нет; в planeModel / PLANE_META не попадают (heli)
  h_mi24: { side: 'east', cls: 'heli', heli: true, lazy: true, stations: mirror([V(-3.22, -1.64, -1.43), V(-2.28, -1.33, -1.22)]), nozzles: [], nr: 0.3, pod: null }, // Ми-24 — manilov.ap (на концах консолей — направляющие для ПТУР, под консолями — пилоны)
  h_mi28: { side: 'east', cls: 'heli', heli: true, lazy: true, stations: mirror([V(-2.47, -1.35, -2.3), V(-1.78, -1.35, -2.38)]), nozzles: [], nr: 0.3, pod: null, matte: true }, // Ми-28Н — Rukh3D
  h_ka52: { side: 'east', cls: 'heli', heli: true, lazy: true, stations: mirror([V(-2.57, -1.1, -1.7), V(-1.9, -1.1, -1.7)]), nozzles: [], nr: 0.3, pod: null }, // Ка-52 — Immersive3D (соосные винты rotor / rotor2, рулевого нет)
  h_ah64: { side: 'west', cls: 'heli', heli: true, lazy: true, stations: mirror([V(-2.38, -1.36, -2.78), V(-1.65, -1.36, -2.78)]), nozzles: [], nr: 0.3, pod: null, matte: true }, // AH-64 — manilov.ap
  h_ah1: { side: 'west', cls: 'heli', heli: true, lazy: true, stations: mirror([V(-1.35, -1.04, -2.2, 0.3), V(-0.75, -1.04, -2.2, 0.3)]), nozzles: [], nr: 0.3, pod: null }, // AH-1 SuperCobra — drcrazzie (у модели нет пилонов — дорисованы)
  h_uh1: { side: 'west', cls: 'heli', heli: true, lazy: true, stations: mirror([V(-1.5, -1.5, -2.1)]), nozzles: [], nr: 0.3, pod: null }, // UH-1 — manilov.ap (по одной точке на борт — на боковых фермах)
  // вертолётное оружие (heliModel / weaponMesh): подвес сверху, нос в −Z, центр габаритов в нуле
  w_shturm: { weapon: ['shturm', 'ataka'], lazy: true, stations: [] }, // «Штурм» 9М114 — ТПК, timurwolf (и вид «Атаки»: контейнер почти тот же)
  w_b8: { weapon: 's8', lazy: true, stations: [] }, // блок НАР Б-8В20 (20 труб) — timurwolf
  w_lau61: { weapon: 'hydra', lazy: true, stations: [] }, // блок Hydra 70 LAU-61 (19 труб) — сетка блока Б-8 timurwolf, 1,7 × 0,4 м, олив NATO
  w_hellfire: { weapon: 'hellfire', lazy: true, stations: [] }, // AGM-114 Hellfire — из MH-60R (touka1212)
  aam_stinger: { weapon: 'aam_stinger', lazy: true, stations: [] }, // ракета FIM-92 Stinger «воздух–воздух» для вертолётов — GoldbergR
  e_tu160: { side: 'east', cls: 'carrier', only: true, lazy: true, internal: true, stations: mirror([V(-0.7, -3.8, -4.0), V(-0.7, -3.8, -1.5), V(-0.7, -3.8, 1.0), V(-0.7, -3.8, 3.5)]), nozzles: [V(-5.75, -4.31, 11.1), V(-3.97, -4.31, 11.1), V(3.97, -4.31, 11.1), V(5.75, -4.31, 11.1)], nr: 0.62 }, // Ту-160 — KOG_THORNS (с 2026-10-19 и в «Авиации»: точки — в отсеках); носитель «Мульти-волны»
  e_b1b: { side: 'west', cls: 'carrier', only: true, lazy: true, internal: true, stations: mirror([V(-0.6, -2.5, -5.0), V(-0.6, -2.5, -2.5), V(-0.6, -2.5, 0.0), V(-0.6, -2.5, 2.5)]), nozzles: [V(-4.3, -3.1, 11.5), V(-2.95, -3.1, 11.5), V(2.95, -3.1, 11.5), V(4.3, -3.1, 11.5)], nr: 0.5 }, // B-1B — Muhamad Mirza Arrafi; носитель «Мульти-волны»
  e_b52: { side: 'west', cls: 'carrier', only: true, lazy: true, internal: true, stations: mirror([V(-0.6, -5.2, -3.0), V(-0.6, -5.2, -1.0), V(-0.6, -5.2, 1.0), V(-0.6, -5.2, 3.0)]), nozzles: [], nr: 0.4 }, // B-52H — bohmerang; носитель «Мульти-волны» (без форсажа — пламени нет)
  e_typhoon: { side: 'west', cls: 'carrier', only: true, lazy: true, stations: mirror([V(-3.88, -1.93, 3.0, 0.3), V(-2.77, -1.91, 2.24, 0.3), V(-1.94, -1.85, 1.74, 0.3), V(-0.6, -2.1, 1.0, 0.15)]), nozzles: [V(-0.54, -0.63, 8.6), V(0.54, -0.63, 8.6)], nr: 0.38 }, // Eurofighter Typhoon — andertan; носитель Storm Shadow
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
  w_fab500: { weapon: 'fab500', stations: [], matte: true }, // ФАБ-500М-54 — 4ikalka
  w_fab100: { weapon: 'fab100', stations: [], matte: true }, // ФАБ-100 — 4ikalka
  w_ofab250: { weapon: 'ofab250', stations: [], matte: true }, // ОФАБ-250-270 — 4ikalka
  w_fab250: { weapon: 'fab250', stations: [], matte: true }, // ФАБ-250 — CATholic
  w_fab1000: { weapon: 'fab1000', stations: [], matte: true }, // ФАБ-1000 — United4192
  w_gbu24: { weapon: 'gbu24', stations: [] }, // GBU-24 — Rhine_Lab_Muelsyse (US Weapon Pack)
  w_gbu57: { weapon: 'gbu57', stations: [] }, // GBU-57 MOP — Rhine_Lab_Muelsyse (US Weapon Pack)
  w_umpk: { weapon: 'umpk', wings: 'fold', stations: [] }, // ФАБ-500 с УМПК — Jeyhun1985
  w_kh29t: { weapon: 'kh29t', stations: [] }, // Х-29 — Russian weapon pack, Rhine_Lab_Muelsyse
  w_kh31p: { weapon: 'kh31p', stations: [] },
  w_kh59m: { weapon: ['kh59m', 'kh59mk2'], lazy: true, stations: [] }, // Х-31 (L_elo) в размер Х-59М — и для Х-59МК2 (Mark 2026-10-19; прежняя — из War Thunder)
  w_kh25ml: { weapon: 'kh25ml', stations: [] }, // Х-29 (Novia556) в размер Х-25МЛ (прежняя Х-38 — из War Thunder)
  w_kh58: { weapon: 'kh58', stations: [] }, // Х-58У — Narni_Tchereskov
  w_agm65b: { weapon: 'agm65b', stations: [], recolor: { GREEN: 0x252912, SILVER: 0x6e6e6e, BROWN: 0x2a1a0e, BLACK: 0x0c0c0c } }, // AGM-65 — HEAVYCLOUD (одна из трёх, 60 тыс. треугольников); у авторов цвета почти чёрные (recolor, линейные)
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
  bukm3: { units: ['bukm3'], stations: [] }, // «Бук-М3» — Jeyhun1985
  buk: { units: ['buk'], stations: [], matte: true }, // «Бук» (колёсный) — azlan
  zu23: { units: ['zu23'], stations: [], matte: true }, // ЗУ-23-2 — LuckySkink9661
  phalanx: { units: ['phalanx'], stations: [] }, // Phalanx — DenisGLabrecque
  // комплексы с ракетами на направляющих: ракета модели — в слотах и в полёте (у С-75 и С-125 — с отделяемым ускорителем)
  s75: { units: ['s75'], stations: [] }, // С-75 «Двина» — manyakasia
  s125: { units: ['s125'], stations: [], bright: 1.9 }, // С-125 «Нева» — teanid; текстура у автора очень тёмная (bright — множитель цвета)
  kub: { units: ['kub'], stations: [] }, // 2К12 «Куб» — UltraKill
  hawk: { units: ['hawk'], stations: [] }, // MIM-23 Hawk — Dominik Biały
  m163: { units: ['m163'], stations: [], matte: true, camo: { scheme: 'nato', size: 1.3 } }, // M163 VADS — Gorgytz
  zsu234: { units: ['zsu234'], matte: true, stations: [] }, // ЗСУ-23-4М «Шилка» — voron335
  strela10: { units: ['strela10'], matte: true, stations: [], camo: { scheme: 'soviet', size: 1.5 } }, // «Стрела-10» на МТ-ЛБ — ScurvyWoof
  avenger: { units: ['avenger'], stations: [], matte: true, camo: { scheme: 'nato', size: 1.1 } }, // AN/TWQ-1 Avenger — KillCaptureDestroy
  chaparral: { units: ['chaparral'], stations: [], matte: true, camo: { scheme: 'nato', size: 1.2 } }, // MIM-72 Chaparral — TankLord (Thingiverse)
  gepard: { units: ['gepard'], matte: true, stations: [], camo: { scheme: 'nato', size: 1.4 } },
  roland: { units: ['roland'], matte: true, stations: [], camo: { scheme: 'nato', size: 1.4 } },
  tunguska: { units: ['tunguska'], matte: true, stations: [], camo: { scheme: 'soviet', size: 1.5, tex: true } },
  skyguard: { units: ['skyguard'], stations: [] },
  rapier: { units: ['rapier'], matte: true, stations: [], camo: { scheme: 'uk', size: 1.3 } }, // Tracked Rapier — stealth86 (перекрашен, пусковая развёрнута в рабочее положение) // Oerlikon GDF 35 мм — из сцены Skyguard (lm9241221) // 2К22 «Тунгуска» — usedm
  sampt: { units: ['sampt'], stations: [] }, // SAMP/T — Chenzoss
  khordad: { units: ['khordad'], matte: true, stations: [] }, // Sevom Khordad — 42manako (перекрашен, у запада — трофейный)
  msl_aster: { samMissile: ['sampt'], stations: [] }, // Aster 30 — по IRIS-T (Raptor9), увеличена и перекрашена // Roland 2 на Marder — ScurvyWoof (перекрашен) // Flakpanzer Gepard (не «War Thunder»)
  nasams: { units: ['nasams'], stations: [] }, // NASAMS 1 — пусковая
  ew_e: { units: ['gpsjam'], stations: [] }, // станция РЭБ (восток) — машина с РЛС IBIS-150
  ew_w: { units: ['gpsjamw'], stations: [] }, // станция РЭБ (запад) — радарная машина Renault TRM
  strela1: { units: ['strela1'], matte: true, stations: [], camo: { scheme: 'soviet', size: 1.4, tex: true } }, // «Стрела-1» — 42manako
  osa: { units: ['osa'], stations: [] }, // «Оса-АКМ» — Jeyhun1985
  tor: { units: ['tor', 'torm2'], stations: [] }, // «Тор-М1» — 42manako
  pantsir: { units: ['pantsir'], stations: [], camo: { scheme: 'soviet', size: 1.6, tex: true } }, // «Панцирь-С2» — 42manako
  s400: { units: ['s400', 's300'], matte: true, stations: [] }, // пусковая С-400 — Chenzoss (и для С-300: та же схема, 4 контейнера)
  patriot: { units: ['patriot', 'pac3'], stations: [] }, // Patriot M901 — Muhamad Mirza Arrafi
};
// самолёты — и для «Симулятора Летки» (выбор самолёта игрока; точки подвески — те же 8, что у его «Изделия»)
export const PLANE_META = Object.fromEntries(Object.entries(META).filter(([, m]) => m.side && !m.heli)); // вертолёты (heli) — не самолёты «Летки»
// авторы и лицензии — из исходных файлов (tools/airdef-models/prepare.js --credits)
// текстуры города (tex/*.jpg) — ambientCG: Grass004, PavingStones151, Concrete042A, RoofingTiles006, Facade002/017/018A;
// Poly Haven (tex/p_*.jpg): asphalt_02, road_damaged_2, gravel, rocky_terrain_03, brown_mud_03
const TEX_CREDIT = { title: 'Текстуры земли, дорог, крыш и фасадов', author: 'ambientCG', url: 'https://ambientcg.com', license: 'CC0', files: ['tex/*.jpg'] };
const PH_CREDIT = { title: 'Текстуры асфальта, щебня, скал и пашни; панорамы неба', author: 'Poly Haven', url: 'https://polyhaven.com', license: 'CC0', files: ['tex/p_*.jpg', 'sky/*.jpg'] };
// взрывы и пламя (fx/*.png): огненный шар с дымом — ohyhei; вспышка с кольцом и пламя — Explosion FX Free (heyheythere)
const FX_CREDITS = [
  { title: 'Иконки управления', author: 'Delapouite, Lorc, Skoll (game-icons.net)', url: 'https://game-icons.net', license: 'CC BY 3.0', licenseUrl: 'https://creativecommons.org/licenses/by/3.0/', files: ['icons.js'] },
  { title: 'Explosion sprite sheets', author: 'ohyhei', url: 'https://ohyhei.itch.io/a-free-explosion-sprite-sheets-asset-on-itch', license: 'бесплатно, с указанием автора', licenseUrl: 'https://ohyhei.itch.io/a-free-explosion-sprite-sheets-asset-on-itch', files: ['fx/explosion*.png'] },
  { title: 'Explosion FX Free', author: 'heyheythere', url: 'https://heyheythere.itch.io/explosion-fx-free', license: 'CC BY 4.0', files: ['fx/blast*.png', 'fx/flame*.png'] },
];
export const MODEL_CREDITS = [...CREDITS, TEX_CREDIT, PH_CREDIT, ...FX_CREDITS].map((c) => ({ ...c, licenseUrl: c.licenseUrl || (/CC0/.test(c.license) ? 'https://creativecommons.org/publicdomain/zero/1.0/' : 'http://creativecommons.org/licenses/by/4.0/') }));
const LOADED = {};
// версия файла модели (сброс кэша) — у пересобранных моделей своя, остальные не перекачиваются
const GLB_V = Object.fromEntries(['w_gbu10', 'w_ecm', 'gepard', 'gepard_lo', 'roland', 'rapier', 'rapier_lo', 'tunguska', 'tunguska_lo', 'khordad', 'strela1', 'zsu234', 'zsu234_lo', 'strela10', 'm163', 'm163_lo', 'chaparral', 'chaparral_lo', 'avenger', 'avenger_lo', 'w_gbu39', 'l_scud', 'pantsir', 'pantsir_lo', 'w_umpk', 'w_decoy_e', 'w_kh101', 'w_jsow', 'w_fab500', 'e_tornado', 'e_f111', 'e_mig23', 'e_mig27', 'e_tu22m2', 'e_a10', 'e_f15e', 'e_su24', 'm163', 'zsu234', 'strela10', 'avenger', 'chaparral', 'w_kh59m', 'w_kh25ml', 'w_kh58', 'w_gbu31', 'w_jassm', 'w_agm65b', 't_kc10'].map((n) => [n, '20261022c']).concat(
  ['roland', 'strela10', 'zsu234', 'zsu234_lo', 'strela1', 'khordad', 'tunguska', 'tunguska_lo', 'gepard', 'gepard_lo', 'chaparral', 'chaparral_lo', 'm163', 'm163_lo', 'rapier', 'rapier_lo', 'avenger', 'avenger_lo', 'w_gbu39', 'pantsir', 'pantsir_lo', 'w_gbu10', 'w_ecm', 'e_mig21n', 'e_mig25', 'e_su7b', 'e_tu16', 'e_f100', 'e_f5', 'e_f117', 'e_jaguar', 'e_buccaneer', 'e_harrier', 'e_mirage', 'e_rafale', 'e_b2'].map((n) => [n, '20261022i'])).concat(
  ['zsu234', 'zsu234_lo', 'zu23', 'buk', 'phalanx', 'w_fab100', 'w_ofab250', 'w_fab250', 'w_fab1000', 'w_gbu24', 'w_gbu57', 'w_umpk', 'e_yak38', 'e_il28', 'e_tu22', 'e_hunter', 'e_su27', 'e_su35', 'e_etendard', 'e_mirage_f1', 'e_f18c', 'e_ea18g'].map((n) => [n, '20261022k'])).concat([['e_tu95', '20261022l'], ['w_agm65b', '20261022l'], ['w_decoy_e', '20261022l'], ['obj_hangar', '20261022l']].concat(['h_mi24', 'h_mi28', 'h_ka52', 'h_ah64', 'h_ah1', 'h_uh1', 'w_shturm', 'w_b8', 'w_hellfire', 'aam_stinger'].map((n) => [n, '20261022m'])).concat([['w_shturm', '20261022n']])).concat(['h_ah64', 'h_mi28'].map((n) => [n, '20261022p'])).concat(['w_lau61', 'obj_church', 'obj_mill', 'obj_barn', 'pr_hay', 'pr_well', 'pr_pumpkin', 'pr_grave1', 'pr_grave2', 'pr_grave3', 'pr_grave4', 'pr_fence', 'pr_fpost', 'pr_deadtree', 'pr_oldtree', 'c_vaz'].map((n) => [n, '20261022o']))); // l — 2026-10-20: Ту-95 без нарисованных дисков, Maverick и Harpy без сильного упрощения // l — Ту-95 без нарисованных дисков винтов (2026-10-20) // j — четвёртая партия, новая «Шилка», УМПК без сжатия // i — ЗРК без упрощения, камуфляж шейдером, третья партия самолётов (2026-10-19); c — замены моделей 2026-10-19; остальные пересобраны 2026-10-18 (затенение в стыках) — общая версия ниже
// разбор GLB: меши (позиции, нормали, UV, индексы), материалы, картинки текстур
function parseGlb(buf) {
  const dv = new DataView(buf), jl = dv.getUint32(12, true), json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jl)));
  const binOff = 28 + jl, T = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array };
  const slice = (bv, extra = 0, len = bv.byteLength) => buf.slice(binOff + (bv.byteOffset || 0) + extra, binOff + (bv.byteOffset || 0) + extra + len);
  const acc = (i) => { const a = json.accessors[i], bv = json.bufferViews[a.bufferView], C = T[a.componentType], n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type]; return new C(slice(bv, a.byteOffset || 0, a.count * n * C.BYTES_PER_ELEMENT)); };
  const meshes = json.meshes.map((m) => { const p = m.primitives[0], at = p.attributes; return { name: m.name, mat: json.materials[p.material], pos: acc(at.POSITION), nor: acc(at.NORMAL), uv: at.TEXCOORD_0 !== undefined ? acc(at.TEXCOORD_0) : null, ao: at.COLOR_0 !== undefined ? acc(at.COLOR_0) : null, idx: acc(p.indices), hub: m.extras && m.extras.hub }; }); // hub — центр втулки винта вертолёта (prepare.js); ao — затенение в стыках (tools/airdef-models/ao.js)
  const images = (json.images || []).map((im) => new Blob([slice(json.bufferViews[im.bufferView])], { type: im.mimeType }));
  return { meshes, images, textures: json.textures || [] };
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
function camoMat(mat, cm) {
  const S = CAMO[cm.scheme] || CAMO.nato; if (!cm.tex) mat.color.setRGB(1, 1, 1); mat.userData.camo = true;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uC1: { value: new THREE.Vector3(...S.c[0]) }, uC2: { value: new THREE.Vector3(...S.c[1]) }, uC3: { value: new THREE.Vector3(...S.c[2]) },
      uK2: { value: S.k2 }, uK3: { value: cm.tex ? 9 : S.k3 }, uCS: { value: cm.size || 1.4 } });
    sh.vertexShader = 'varying vec3 vCamoP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvCamoP = position;');
    // у текстурных — без чёрных пятен (на грязи текстуры выглядели гарью), только по зелёной краске текстуры (маска: зелёный заметно больше красного и синего), с её светотенью и грязью
    const tx = 'float cmL = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)), cmM = smoothstep(0.004, 0.02, diffuseColor.g - max(diffuseColor.r, diffuseColor.b));\n' +
      'diffuseColor.rgb = mix(diffuseColor.rgb, camoCol(vCamoP) * clamp(cmL / dot(uC1, vec3(0.3, 0.59, 0.11)), 0.8, 1.4), cmM);\n';
    sh.fragmentShader = CAMO_GLSL + '\n' + sh.fragmentShader.replace('#include <color_fragment>', (cm.tex ? tx : 'diffuseColor.rgb *= camoCol(vCamoP);\n') + '#include <color_fragment>');
  };
  mat.customProgramCacheKey = () => (cm.tex ? 'camoT' : 'camo');
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
    if (m.ao) g.setAttribute('color', new THREE.BufferAttribute(m.ao, 4, true));
    g.setIndex(new THREE.BufferAttribute(m.idx, 1)); g.computeBoundingSphere();
    const pbr = m.mat.pbrMetallicRoughness, f = pbr.baseColorFactor || [1, 1, 1, 1], glass = m.mat.alphaMode === 'BLEND';
    const map = pbr.baseColorTexture ? tex[pbr.baseColorTexture.index] : null;
    const mat = glass
      ? new THREE.MeshPhongMaterial({ color: new THREE.Color(f[0], f[1], f[2]).lerp(new THREE.Color(0.2, 0.26, 0.32), f[0] + f[1] + f[2] > 1.8 ? 0.8 : 0.4), /* белое «стекло» авторов — в тонированное, своё цветное — почти как есть */ transparent: true, opacity: Math.max(0.5, f[3]), specular: 0xffffff, shininess: 120, side: THREE.DoubleSide, depthWrite: false }) // стекло заметно: не меньше 0,5
      : new THREE.MeshPhongMaterial({ map, color: new THREE.Color(f[0], f[1], f[2]), specular: matte ? 0x0c0c0c : 0x3a3a3a, shininess: matte ? 10 : 38, side: THREE.DoubleSide, /* matte — краска техники без блеска */
        ...(m.mat.alphaMode === 'MASK' ? { alphaTest: m.mat.alphaCutoff ?? 0.5 } : {}), ...(m.ao && !/[?&]ao=0/.test(typeof location !== 'undefined' ? location.search : '') ? { vertexColors: true } : {}) }); // ?ao=0 — без затенения (сравнение)
    const rc = MM.recolor && MM.recolor[sub(m.name)];
    if (MM.bright && !glass) mat.color.multiplyScalar(MM.bright);
    if (rc != null) { mat.color.setHex(rc); mat.map = null; }
    else if (!map && !glass && f[0] === 1 && f[1] === 0 && f[2] === 1) mat.color.setHex(0x2e3128); // пурпурная «нет текстуры» — в нейтральный тёмный
    if (MM.camo && !glass && (MM.camo.tex ? map : /#camo$/.test(m.mat.name || ''))) camoMat(mat, MM.camo); // узор — шейдером (tex — по краске текстуры)
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
    group.userData.wings = true;
  }
  // дорисованные пилоны там, где у модели их нет
  for (const p of (META[name] || META[name.replace(/_lo$/, "")] || { stations: [] }).stations) if (p.py > 0) { /* дальняя копия _lo — по описанию основной */ const pm = new THREE.Mesh(new THREE.BoxGeometry(0.12, p.py, 1.6), pylonMat); pm.position.set(p.x, p.y + p.py / 2, p.z); group.add(pm); }
  return group;
}
// готовая модель комплекса: { body, turret, cradle } (копии) или null — тогда процедурная
const UMODEL = Object.fromEntries(Object.entries(META).filter(([, m]) => m.units).flatMap(([n, m]) => m.units.map((k) => [k, n])));
// у тяжёлых моделей ПВО — дальняя копия <имя>_lo: каждая часть (корпус, башня, пакет) — THREE.LOD, ближе 400 м — подробная
const UNIT_LO = new Set(['osa', 'bukm3', 's125', 'gepard', 'ew_e', 's400', 'tor', 'pantsir', 'sampt', 'tunguska', 'skyguard', 'rapier', 'zsu234', 'm163', 'chaparral', 'avenger']);
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
  return { obj: LOADED[n].clone(), stations: m.stations, nozzles: m.nozzles, nr: m.nr, dry: !!m.dry, pod: m.pod, name: n, cls: m.cls, internal: !!m.internal }; // dry — без форсажа (только слабое свечение)
}
// вертолёт: готовая модель (копия) и точки подвески на консолях; нет модели (или ещё грузится — запрос послан) — null, подмены самолётом нет
export function heliModel(name) {
  const m = META[name]; if (!m || !m.heli) return null;
  if (!LOADED[name]) { if (BASE) start(name); return null; }
  return { obj: LOADED[name].clone(), stations: m.stations, name, side: m.side };
}
