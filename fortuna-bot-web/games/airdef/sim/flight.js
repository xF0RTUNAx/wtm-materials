// Лётная модель самолётов «Воздушного превосходства»: свои ТТХ у каждого самолёта (по открытым данным), тяга по высоте и
// числу Маха, сопротивление (вредное + индуктивное + волновое у скорости звука), перегрузка — по прочности и по подъёмной
// силе крыла, сваливание — по массе и плотности воздуха. Скорости игры — SPEED_K = 0,8 от реальных (решение Mark 2026-10-18):
// аэродинамика считается на «реальной» скорости V = v / 0,8 с честными коэффициентами, ускорение от тяги и сопротивления —
// ×0,8 (вся кривая скоростей сжата одинаково, разгон — по той же кривой), сила тяжести — настоящая. Стенд
// tools/airdef-headless/flight-stand.js подбирает каждому самолёту сопротивление (cd0, волновое aw, спад тяги с высотой ex)
// так, чтобы максимальная скорость у земли и на 11 км совпала с реальной (в игре — 0,8 от неё), и пишет FIT. У земли скорость
// упирается не в тягу, а в прочность: предельный скоростной напор (vq — приборная скорость, выше — резко растёт сопротивление).
// Подключение: craft.fm = flightModel(ключ модели, { arcade }) — ядро (drone/sim/core.js flyStep/pilotStep) берёт из fm
// перегрузку, сваливание и ускорение; без fm — прежняя лётная модель («Летка» не меняется).
// Чистая математика: импортируют клиент, сервер и стенд.
import { FIT } from './flight-fit.js?v=20261022e';

export const SPEED_K = 0.8; // скорости игры — доля реальных
const G = 9.81, RHO0 = 1.225;
export const sigma = (h) => Math.exp(-Math.max(0, h) / 9000);           // плотность воздуха / у земли (как rhoAt в core.js)
export const sound = (h) => 340.3 - 0.0039 * Math.min(Math.max(0, h), 11000); // скорость звука, м/с

// ТТХ: n — двигателей; dry / ab — тяга одного без форсажа / с форсажем, кН (ab 0 — форсажа нет); empty — пустой, кг;
// fuel — внутреннее топливо, кг; mNorm — нормальная взлётная, кг; S — площадь крыла, м²; vSL / vAlt — максимальная скорость
// у земли / на 11 км, км/ч (реальная); g — предел перегрузки при нормальной массе; roll — скорость крена, °/с; K — индуктивный
// коэффициент (1/(π·e·λ)); clMax — наибольший коэффициент подъёмной силы; ceil — потолок, м. side — чья.
export const SPECS = {
  // ── Восток ──
  su30: { name: 'Су-30СМ', side: 'east', n: 2, dry: 74.5, ab: 122.6, empty: 18800, fuel: 9640, mNorm: 24900, S: 62, vSL: 1350, vAlt: 2120, g: 9, roll: 200, K: 0.11, clMax: 1.5, ceil: 17300 },
  mig29: { name: 'МиГ-29', side: 'east', n: 2, dry: 49.4, ab: 81.4, empty: 11000, fuel: 3340, mNorm: 14900, S: 38, vSL: 1500, vAlt: 2450, g: 9, roll: 240, K: 0.12, clMax: 1.45, ceil: 18000 },
  e_su24: { name: 'Су-24М', side: 'east', n: 2, dry: 75, ab: 109.8, empty: 22300, fuel: 11100, mNorm: 33500, S: 55.2, vSL: 1315, vAlt: 1700, g: 6.5, roll: 90, K: 0.15, clMax: 1.1, ceil: 11500 },
  e_su25: { name: 'Су-25', side: 'east', n: 2, dry: 44.2, ab: 0, empty: 9800, fuel: 3000, mNorm: 14600, S: 33.7, vSL: 950, vAlt: 950, g: 6.5, roll: 120, K: 0.08, clMax: 1.35, ceil: 7000 },
  e_su34: { name: 'Су-34', side: 'east', n: 2, dry: 76, ab: 131.5, empty: 22500, fuel: 12100, mNorm: 39000, S: 62, vSL: 1400, vAlt: 1900, g: 7, roll: 120, K: 0.11, clMax: 1.4, ceil: 17000 },
  e_su17: { name: 'Су-17М4', side: 'east', n: 1, dry: 76.4, ab: 110.3, empty: 12160, fuel: 3770, mNorm: 16400, S: 34.5, vSL: 1400, vAlt: 1860, g: 7, roll: 150, K: 0.15, clMax: 1.1, ceil: 15200 },
  e_su57: { name: 'Су-57', side: 'east', n: 2, dry: 88.3, ab: 142.2, empty: 18000, fuel: 10300, mNorm: 25000, S: 78.8, vSL: 1400, vAlt: 2135, g: 9, roll: 270, K: 0.1, clMax: 1.6, ceil: 20000 },
  e_mig31: { name: 'МиГ-31БМ', side: 'east', n: 2, dry: 93.2, ab: 152, empty: 21820, fuel: 16350, mNorm: 41000, S: 61.6, vSL: 1500, vAlt: 2500, g: 5, roll: 90, K: 0.13, clMax: 1.05, ceil: 20600 }, // 3000 — на 17 км; на 11 км упирается в прочность
  e_tu22m3: { name: 'Ту-22М3', side: 'east', n: 2, dry: 140, ab: 245, empty: 58000, fuel: 50000, mNorm: 112000, S: 175.8, vSL: 1050, vAlt: 1800, g: 2.5, roll: 40, K: 0.1, clMax: 1.0, ceil: 13300 }, // 2000 — выше 12 км
  e_tu160: { name: 'Ту-160', side: 'east', n: 4, dry: 137, ab: 245, empty: 110000, fuel: 148000, mNorm: 267600, S: 293, vSL: 1030, vAlt: 1800, g: 2, roll: 30, K: 0.08, clMax: 1.0, ceil: 15000 }, // 2220 — выше 12 км, с малой массой
  // ── Запад ──
  f16: { name: 'F-16D', side: 'west', n: 1, dry: 76.3, ab: 131, empty: 9000, fuel: 2800, mNorm: 12000, S: 27.87, vSL: 1470, vAlt: 2120, g: 9, roll: 270, K: 0.12, clMax: 1.6, ceil: 15240 },
  f18: { name: 'F/A-18E', side: 'west', n: 2, dry: 62.3, ab: 98, empty: 14552, fuel: 6780, mNorm: 21320, S: 46.5, vSL: 1300, vAlt: 1915, g: 7.5, roll: 180, K: 0.11, clMax: 1.6, ceil: 15000 },
  e_f4: { name: 'F-4E Phantom II', side: 'west', n: 2, dry: 52.8, ab: 79.6, empty: 13757, fuel: 6000, mNorm: 18825, S: 49.2, vSL: 1390, vAlt: 2370, g: 7.33, roll: 150, K: 0.14, clMax: 1.2, ceil: 18300 },
  e_gripen: { name: 'JAS 39 Gripen', side: 'west', n: 1, dry: 54, ab: 80.5, empty: 6800, fuel: 2268, mNorm: 8500, S: 30, vSL: 1400, vAlt: 2200, g: 9, roll: 250, K: 0.13, clMax: 1.5, ceil: 15240 },
  e_f35: { name: 'F-35A', side: 'west', n: 1, dry: 125, ab: 191, empty: 13290, fuel: 8278, mNorm: 22470, S: 42.7, vSL: 1300, vAlt: 1930, g: 9, roll: 200, K: 0.12, clMax: 1.5, ceil: 15240 },
  e_f22: { name: 'F-22A Raptor', side: 'west', n: 2, dry: 116, ab: 156, empty: 19700, fuel: 8200, mNorm: 29410, S: 78, vSL: 1500, vAlt: 2410, g: 9, roll: 270, K: 0.1, clMax: 1.6, ceil: 19800 },
  e_typhoon: { name: 'Eurofighter Typhoon', side: 'west', n: 2, dry: 60, ab: 90, empty: 11000, fuel: 5000, mNorm: 16000, S: 51.2, vSL: 1390, vAlt: 2495, g: 9, roll: 250, K: 0.11, clMax: 1.5, ceil: 19810 },
  e_b1b: { name: 'B-1B Lancer', side: 'west', n: 4, dry: 75.6, ab: 136.9, empty: 87100, fuel: 88450, mNorm: 148000, S: 181, vSL: 1120, vAlt: 1335, g: 3, roll: 40, K: 0.08, clMax: 1.0, ceil: 18000 },
  e_b52: { name: 'B-52H', side: 'west', n: 8, dry: 76, ab: 0, empty: 83250, fuel: 141000, mNorm: 180000, S: 370, vSL: 650, vAlt: 1000, g: 2, roll: 25, K: 0.045, clMax: 1.1, ceil: 15000 },
};

// тяга одного двигателя, Н: падает с плотностью, растёт со скоростью (скоростной напор у воздухозаборника — сильнее на форсаже)
// ex — как быстро тяга падает с высотой (σ^ex): у высотных двигателей (МиГ-31, Ту-160) — медленнее
export function thrust(s, h, M, thr, ab, ex = 0.75) {
  const sg = sigma(h);
  if (ab && s.ab > 0) return s.n * s.ab * 1000 * Math.pow(sg, ex) * (1 + 0.45 * M);
  return s.n * s.dry * 1000 * thr * Math.pow(sg, ex + 0.05) * (1 + 0.12 * M);
}
// вредное сопротивление с волновым ростом у скорости звука (aw — во сколько раз больше за звуком, плато к M 1,3)
export function cdo(f, M) { const t = Math.min(1, Math.max(0, (M - 0.82) / 0.43)); return f.cd0 * (1 + f.aw * t * t * (3 - 2 * t)); }
// подбор по умолчанию (до стенда): типичные для класса
const DEF = { cd0: 0.022, aw: 1.6, ex: 0.75, vq: 0 };
export const fitOf = (key) => (FIT && FIT[key]) || DEF;

// ускорение вдоль траектории (игровая скорость v), м/с²: m — масса, n — перегрузка, ind — доля индуктивного (Аркада — мягче),
// dragK — доп. сопротивление (подвески, повреждения), thrK — доля тяги (повреждённые двигатели)
export function accel(s, f, v, h, m, n, thr, ab, pitch, ind = 1, dragK = 1, thrK = 1) {
  const V = v / SPEED_K, sg = sigma(h), q = 0.5 * RHO0 * sg * V * V, M = V / sound(h);
  const cl = n * m * G / Math.max(q * s.S, 1), qx = f.vq ? Math.max(0, q / (0.5 * RHO0 * f.vq * f.vq) - 1) : 0;
  const D = q * s.S * (cdo(f, M) * dragK + ind * s.K * cl * cl + 3 * qx * qx + 0.3 * qx); // qx — превышение предельного напора
  return SPEED_K * (thrust(s, h, M, thr, ab, f.ex ?? 0.75) * thrK - D) / m - G * Math.sin(pitch);
}
// наибольшая перегрузка: по прочности (меньше с ростом массы) и по крылу (clMax — на малой скорости и большой высоте)
export function nMax(s, v, h, m, clK = 1) { // clK — доля подъёмной силы (повреждённое крыло)
  const V = v / SPEED_K, nStr = s.g * Math.min(1, s.mNorm / m), q = 0.5 * RHO0 * sigma(h) * V * V;
  return Math.max(1, Math.min(nStr, q * s.S * s.clMax * clK / (m * G)));
}
// скорость сваливания в горизонте (игровая), м/с
export const vStall = (s, h, m, clK = 1) => SPEED_K * Math.sqrt(2 * m * G / (RHO0 * sigma(h) * s.S * s.clMax * clK));

// ── масса и подвески ──
// топливо игры 100 % — боевая заправка (60 % внутреннего): к концу вылета самолёт заметно легче, после пополнения — снова тяжёлый
export const FUEL_K = 0.6;
// оружие во внутренних отсеках — внешние подвески сопротивления не добавляют
export const INTERNAL_BAY = new Set(['e_f22', 'e_f35', 'e_su57']);
// подвески: [{ mass кг, n }] → масса груза и доп. сопротивление (доля cd0): каждая внешняя ~2,5 % + по массе (ФАБ-500 ≈ 4,5 %)
export function loadOf(key, items) {
  let payload = 0, extra = 0;
  for (const it of items) { if (!it.n) continue; payload += it.n * (it.mass || 0); if (!INTERNAL_BAY.has(key)) extra += it.n * (0.025 + (it.mass || 0) / 25000); }
  return { payload, dragK: 1 + extra };
}
export const massOf = (s, fuel, payload) => s.empty + FUEL_K * s.fuel * fuel + payload;

// лётная модель для ядра: craft.fm. Масса — пустой + топливо (craft.fuel, 0…1) + груз (craft.payload, кг); craft.dragK —
// подвески и повреждения, craft.thrK — тяга (повреждённые двигатели). arcade — индуктивное вдвое мягче: в вираже скорость
// теряется меньше
export function flightModel(key, opts = {}) {
  const s = SPECS[key]; if (!s) return null;
  const f = fitOf(key), ind = opts.ind ?? (opts.arcade ? 0.5 : 1);
  const mass = (a) => massOf(s, a.fuel ?? 1, a.payload || 0);
  return {
    key, s, f, mass,
    // повреждения (sim/damage.js): clK — подъёмная сила, ctrlK — управление (хвост), dmgDrag, thrK, noAB
    nMax: (a, v) => nMax(s, v, a.pos.y, mass(a), a.clK ?? 1) * (a.ctrlK ?? 1),
    vStall: (a) => vStall(s, a.pos.y, mass(a), a.clK ?? 1),
    dv: (a, v) => accel(s, f, v, a.pos.y, mass(a), a.n || 1, a.thr ?? 0.85, !!a.ab && !a.noAB, a.pitch, ind, (a.dragK || 1) * (a.dmgDrag || 1), a.thrK ?? 1),
    rollRate: s.roll * Math.PI / 180,
    turnK: SPEED_K, // боковое ускорение ×0,8 (как всё в масштабе скоростей): угловая скорость виража — реальная, радиус — ×0,8
  };
}
