// Мегаполис «Воздушного превосходства»: детерминированный генератор по зерну — один и тот же город у игры и у сервера.
// Чистые функции без three.js: земля и река, районы, сетка улиц, здания-коробки, объекты-цели и сетка высот застройки
// (по ней — прямая видимость радаров, лазера и телевизора контейнера, столкновения самолётов со зданиями).
// Оси как в «Летке»: −Z — север (нос при yaw = 0), +X — восток; метры.

export const CITY = {
  HALF: 16000,   // карта ±16 км
  R: 10500,      // радиус застройки
  GRID: 200,     // шаг сетки улиц, м
  STREET: 26, AVENUE: 44, AVE_EVERY: 5, // ширина улиц; каждая 5-я линия — проспект
  RIVER_W: 230,  // ширина реки
  WATER_Y: -4,
  CEIL: 14000,
  CELL: 20,      // ячейка сетки высот застройки
  GH: 12000,     // сетка высот покрывает ±12 км (дальше застройки нет)
  CC: 160,       // ячейка грубой сетки (максимум высоты) для быстрых лучей
};
export const ZONE = { FIELD: 0, LOW: 1, MID: 2, CBD: 3, IND: 4, PARK: 5, WATER: 6, AIR: 7, PORT: 8 };
export const ZONE_NAME = ['Пригород', 'Частный сектор', 'Спальный район', 'Сити', 'Промзона', 'Парк', 'Река', 'Аэродром', 'Военно-морская база'];
// виды зданий (окна и цвет считаются в шейдере по виду)
export const KIND = { HOUSE: 0, PANEL: 1, OFFICE: 2, GLASS: 3, WAREHOUSE: 4, PLAIN: 5 };

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// гладкий шум по значению (детерминированный, без зерна — форма города постоянна, зерно меняет только застройку)
const h2 = (i, j) => { const v = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return v - Math.floor(v); };
function vnoise(x, z) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = h2(i, j), b = h2(i + 1, j), c = h2(i, j + 1), d = h2(i + 1, j + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

// ═════════════ Земля и река ═════════════
// река течёт с севера на юг через весь город, петляя
export function riverX(z) { return 1300 * Math.sin(z * 0.00019 + 0.6) + 450 * Math.sin(z * 0.00052 + 2.1) - 300; }
export const AIRPORT = { x: -8200, z: -5600, w: 4400, d: 1700, rwyL: 3400, rwyW: 60 }; // ось ВПП — по X
const CX = 500, CZ = -300; // центр Сити
export function groundH(x, z) {
  const r = Math.hypot(x, z);
  let h = 3 + 3 * Math.sin(x * 0.0011 + 0.4) * Math.cos(z * 0.0013);
  // за городом — холмы, к краю карты — гряда
  h += smooth(10500, 12500, r) * 60 * (vnoise(x * 0.0006, z * 0.0006) - 0.3);
  h += Math.pow(smooth(12000, 16000, r), 1.3) * 700 * (0.7 + 0.3 * Math.sin(Math.atan2(z, x) * 5 + 1));
  if (Math.abs(x - AIRPORT.x) < AIRPORT.w / 2 + 300 && Math.abs(z - AIRPORT.z) < AIRPORT.d / 2 + 300) h = 4; // ровное поле аэропорта
  const dr = Math.abs(x - riverX(z));
  const bank = CITY.RIVER_W / 2;
  return h + (CITY.WATER_Y - 7 - h) * (1 - smooth(bank - 25, bank + 35, dr));
}
export function inWater(x, z) { return Math.abs(x - riverX(z)) < CITY.RIVER_W / 2 - 10; }

export function zoneAt(x, z) {
  if (Math.abs(x - AIRPORT.x) < AIRPORT.w / 2 && Math.abs(z - AIRPORT.z) < AIRPORT.d / 2) return ZONE.AIR;
  const dr = Math.abs(x - riverX(z));
  if (dr < CITY.RIVER_W / 2) return ZONE.WATER;
  const n = vnoise(x * 0.0007 + 3.1, z * 0.0007 + 7.7), d = Math.hypot(x - CX, z - CZ);
  if (d < 1900 + 500 * (n - 0.5)) return ZONE.CBD;
  if (z > 4200 && z < 9200 && dr < 900) return ZONE.PORT;
  const a = Math.atan2(z - CZ, x - CX); // восток — 0, юг — +π/2
  if (d > 3600 && d < 8600 && a > -0.55 && a < 0.65 && x > riverX(z) + 400) return ZONE.IND;
  if (d > 2100 && d < 9000 && n > 0.8) return ZONE.PARK;
  if (d < 6400 + 900 * (n - 0.5)) return ZONE.MID;
  if (d < CITY.R - 500 + 800 * (n - 0.5)) return ZONE.LOW;
  return vnoise(x * 0.0011, z * 0.0011) > 0.78 ? ZONE.LOW : ZONE.FIELD; // деревни
}
// линия сетки улиц: проспект или улица
export const lineW = (i) => (((i % CITY.AVE_EVERY) + CITY.AVE_EVERY) % CITY.AVE_EVERY === 0 ? CITY.AVENUE : CITY.STREET);

// ═════════════ Объекты-цели ═════════════
// габариты готовых построек при масштабе 1 (ширина по X, высота, длина по Z) — как печатает tools/airdef-models/prepare.js
export const OBJ_DIMS = { obj_tanks: [28.42, 14.38, 33.45], obj_tank4: [30.27, 9.22, 55.93], obj_rtank: [8.62, 5.45, 10.0], obj_hangar: [61.15, 7.76, 61.15],
  obj_jhangar: [61.89, 19.3, 89.88], obj_cont: [27.61, 2.6, 10.8], obj_milbase: [29.92, 10.24, 30.06], obj_oldind: [11.61, 15.17, 34.51], obj_factory: [97.09, 27.93, 27.23] };
// постройка: модель m в точке (x, z), поворот на 90°·rot, масштаб s; mbox — её коробка для урона и сетки высот
const mp = (m, x, z, rot = 0, s = 1) => ({ m, x, z, rot, s });
const mbox = (q) => { const [w, h, d] = OBJ_DIMS[q.m], sw = (q.rot % 2 ? d : w) * q.s, sd = (q.rot % 2 ? w : d) * q.s; return { t: 'box', x: q.x, z: q.z, w: sw, d: sd, h: h * q.s, model: true }; };
// parts — простые тела для отрисовки и сетки высот: box {x,z,w,d,h,y0}, cyl {x,z,r,h,y0}, cone (градирня) {x,z,r,h}
// value — «ценность» для счёта, hp — прочность (кг тротила-эквивалента условно: сколько урона выдерживает)
function makeObjects() {
  const O = [];
  const add = (o) => { O.push(Object.assign({ id: O.length, value: 100, hp: 100 }, o)); };
  // цели — только военные объекты (ключи прежние: на них ссылаются задания и обучение). Постройки — готовые модели
  // (models: имя, место, поворот на 90°·rot, масштаб); их габариты (OBJ_DIMS) дают коробки для урона и сетки высот.
  // узел связи: радиорелейные мачты, огороженный городок, аппаратные в контейнерах
  { const x = 2700, z = -2900, M = [mp('obj_milbase', x - 45, z - 30), mp('obj_cont', x + 45, z - 40), mp('obj_cont', x + 45, z - 25)];
    add({ key: 'tv', name: 'Узел связи', x, z, w: 140, d: 90, value: 120, hp: 140, models: M,
      parts: [{ t: 'cyl', x, z, r: 4, h: 160 }, { t: 'cyl', x, z, r: 2, h: 210 }, { t: 'cyl', x: x + 30, z: z + 20, r: 2.5, h: 90 }, ...M.map(mbox)] }); }
  // командный пункт: укреплённый городок, штабные корпуса, антенны
  { const x = 1150, z = 300, M = [mp('obj_milbase', x, z, 0, 2), mp('obj_oldind', x - 60, z + 10, 1), mp('obj_oldind', x + 60, z - 10, 1), mp('obj_cont', x, z + 45)];
    add({ key: 'gov', name: 'Командный пункт', x, z, w: 170, d: 120, value: 160, hp: 260, models: M,
      parts: [...M.map(mbox), { t: 'cyl', x: x - 30, z: z - 40, r: 1, h: 45 }, { t: 'cyl', x: x + 35, z: z - 42, r: 1, h: 38 }] }); }
  // склад боеприпасов: хранилища-ангары, ряды контейнеров, огороженный въезд
  { const x = 5900, z = 1500, M = [mp('obj_hangar', x, z, 0, 1), mp('obj_hangar', x - 130, z + 10, 0, 0.8), mp('obj_hangar', x + 130, z + 10, 0, 0.8), mp('obj_milbase', x, z - 115)];
    for (let i = 0; i < 4; i++) M.push(mp('obj_cont', x - 150 + i * 100, z + 105), mp('obj_cont', x - 150 + i * 100, z + 125));
    add({ key: 'tpp', name: 'Склад боеприпасов', x, z, w: 420, d: 300, value: 180, hp: 220, models: M, parts: M.map(mbox) }); }
  // склад горючего: резервуары, резервуарная площадка, цистерны
  { const x = 7700, z = -1300, M = [];
    for (let i = -1; i <= 1; i++) for (const j of [-1, 1]) M.push(mp('obj_tanks', x + i * 75, z + j * 58));
    M.push(mp('obj_tank4', x, z, 1), mp('obj_tank4', x + 150, z, 1), mp('obj_rtank', x - 160, z - 20), mp('obj_rtank', x - 160, z), mp('obj_rtank', x - 160, z + 20)); // в центре — площадка
    add({ key: 'oil', name: 'Склад горючего', x, z, w: 520, d: 400, value: 170, hp: 200, models: M, parts: M.map(mbox) }); }
  // парк бронетехники: навесы-ангары для машин, городок, контейнеры с имуществом
  { const x = -3300, z = 2700, M = [mp('obj_hangar', x - 70, z - 40, 0, 0.9), mp('obj_hangar', x + 0, z - 40, 0, 0.9), mp('obj_hangar', x + 70, z - 40, 0, 0.9),
      mp('obj_milbase', x - 60, z + 60), mp('obj_cont', x + 50, z + 50), mp('obj_cont', x + 50, z + 70)];
    // центр — средний навес (ИИ и задания целятся в центр объекта)
    M.push(mp('obj_hangar', x, z + 10, 0, 0.6));
    add({ key: 'stad', name: 'Парк бронетехники', x, z, w: 300, d: 230, value: 90, hp: 140, models: M, parts: M.map(mbox) }); }
  // военный аэродром: большие ангары, арочные укрытия, вышка, цистерны (ВПП рисуется на земле)
  { const { x, z } = AIRPORT, M = [mp('obj_jhangar', x, z + 540, 1), mp('obj_jhangar', x + 230, z + 545, 1),
      mp('obj_hangar', x - 260, z + 540, 0, 0.7), mp('obj_hangar', x - 330, z + 540, 0, 0.7), mp('obj_hangar', x - 400, z + 540, 0, 0.7),
      mp('obj_rtank', x + 400, z + 540), mp('obj_rtank', x + 420, z + 540)];
    add({ key: 'air', name: 'Военный аэродром', x, z: z + 500, w: 900, d: 260, value: 150, hp: 220, models: M,
      parts: [...M.map(mbox), { t: 'cyl', x: x - 150, z: z + 520, r: 6, h: 30 }, { t: 'box', x: x - 150, z: z + 535, w: 20, d: 14, h: 8 }] }); }
  // мосты через реку — по проспектам
  for (const zb of [-6000, -3000, -1000, 1000, 3000, 7000]) {
    const xr = riverX(zb), L = CITY.RIVER_W + 80;
    add({ key: 'bridge', name: 'Мост', x: xr, z: zb, w: L, d: 34, value: 90, hp: 160, bridge: true, noTarget: true, // не цель: просто часть города
      parts: [{ t: 'box', x: xr, z: zb, w: L, d: 30, h: 4, y0: 10 }, { t: 'box', x: xr - 60, z: zb, w: 8, d: 24, h: 10, y0: CITY.WATER_Y },
        { t: 'box', x: xr + 60, z: zb, w: 8, d: 24, h: 10, y0: CITY.WATER_Y }] });
  }
  // военно-морская база: краны и причалы вдоль восточного берега
  { const P = []; let cx = 0, cz = 0;
    for (let i = 0; i < 6; i++) { const zz = 5200 + i * 520, xx = riverX(zz) + CITY.RIVER_W / 2 + 20; cx += xx; cz += zz;
      P.push({ t: 'box', x: xx, z: zz, w: 12, d: 14, h: 38 }, { t: 'box', x: xx - 15, z: zz, w: 60, d: 5, h: 6, y0: 38 }); }
    // причал: большой ангар, портовые здания, контейнеры
    const bx = cx / 6 + 60, bz = cz / 6, M = [mp('obj_jhangar', bx + 40, bz, 0), mp('obj_oldind', bx + 40, bz - 160), mp('obj_oldind', bx + 40, bz + 160)];
    for (let i = 0; i < 6; i++) M.push(mp('obj_cont', bx - 10, bz - 500 + i * 200, 1));
    P.push(...M.map(mbox));
    add({ key: 'port', name: 'Военно-морская база', x: cx / 6, z: cz / 6, w: 260, d: 2700, value: 110, hp: 180, models: M, parts: P }); }
  return O;
}

// ═════════════ Генерация ═════════════
export function buildCity(seed = 1) {
  const rnd = mulberry32((seed * 2654435761) >>> 0);
  const objects = makeObjects();
  const keepOut = objects.map((o) => ({ x0: o.x - o.w / 2 - 30, x1: o.x + o.w / 2 + 30, z0: o.z - o.d / 2 - 30, z1: o.z + o.d / 2 + 30 }));
  const blocked = (x0, x1, z0, z1) => keepOut.some((k) => x1 > k.x0 && x0 < k.x1 && z1 > k.z0 && z0 < k.z1);

  // здания — плоские массивы (на 40 тыс. коробок объекты были бы тяжелее)
  let cap = 50000, n = 0;
  const BX = new Float32Array(cap), BZ = new Float32Array(cap), BW = new Float32Array(cap), BD = new Float32Array(cap), BH = new Float32Array(cap), BY = new Float32Array(cap), BK = new Uint8Array(cap), BC = new Float32Array(cap);
  // y0 — высота основания над землёй (верхние ступени башен, шпили)
  const put = (x, z, w, d, h, k, y0 = 0) => {
    if (n >= cap) return;
    BX[n] = x; BZ[n] = z; BW[n] = w; BD[n] = d; BH[n] = h; BK[n] = k; BY[n] = y0; BC[n] = rnd(); n++;
  };
  // башня Сити: высокие — ступенями (уступы), иногда с короной и шпилем
  const tower = (x, z, w, d, H, k) => {
    if (H < 110 || rnd() < 0.35) { put(x, z, w, d, H, k); return; }
    const h1 = H * (0.45 + rnd() * 0.25), w2 = w * (0.62 + rnd() * 0.2), d2 = d * (0.62 + rnd() * 0.2);
    put(x, z, w, d, h1, k);
    if (rnd() < 0.5) { const h2 = (H - h1) * 0.6; put(x, z, w2, d2, h2, k, h1); put(x, z, w2 * 0.72, d2 * 0.72, H - h1 - h2, k, h1 + h2); }
    else put(x, z, w2, d2, H - h1, k, h1);
    if (rnd() < 0.4) put(x, z, 2.2, 2.2, 18 + rnd() * 45, KIND.PLAIN, H); // шпиль-антенна
  };
  const G = CITY.GRID, N = Math.ceil(CITY.R / G) + 1;
  for (let i = -N; i < N; i++) for (let j = -N; j < N; j++) {
    const x0 = i * G + lineW(i) / 2, x1 = (i + 1) * G - lineW(i + 1) / 2, z0 = j * G + lineW(j) / 2, z1 = (j + 1) * G - lineW(j + 1) / 2;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    if (Math.hypot(cx, cz) > CITY.HALF - 3000) continue;
    const zn = zoneAt(cx, cz);
    if (zn === ZONE.WATER || zn === ZONE.AIR || zn === ZONE.PARK || zn === ZONE.FIELD && rnd() < 0.85) continue;
    // квартал у реки — набережная 40 м
    const near = Math.min(Math.abs(x0 - riverX(z0)), Math.abs(x1 - riverX(z0)), Math.abs(x0 - riverX(z1)), Math.abs(x1 - riverX(z1)), Math.abs(cx - riverX(cz)));
    if (near < CITY.RIVER_W / 2 + 45 || Math.sign(x0 - riverX(cz)) !== Math.sign(x1 - riverX(cz))) continue;
    if (blocked(x0, x1, z0, z1)) continue;
    const bw = x1 - x0, bd = z1 - z0, m = 8; // отступ от улицы
    const d = Math.hypot(cx - CX, cz - CZ);
    if (zn === ZONE.CBD) {
      const k = clamp(1.15 - d / 2300, 0.25, 1);
      const split = rnd() < 0.6; // квартал: одна громадина или 2×2 башни
      if (!split) {
        const w = 50 + rnd() * 50, dd = 50 + rnd() * 50;
        tower(cx, cz, w, dd, 70 + Math.pow(rnd(), 1.4) * 360 * k, rnd() < 0.65 ? KIND.GLASS : KIND.OFFICE);
        if (rnd() < 0.7) put(cx, cz, Math.min(bw - 2 * m, w + 50), Math.min(bd - 2 * m, dd + 40), 14 + rnd() * 14, KIND.OFFICE); // стилобат
      } else for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
        if (rnd() < 0.15) continue;
        const qx = x0 + m + (a + 0.5) * (bw - 2 * m) / 2, qz = z0 + m + (b + 0.5) * (bd - 2 * m) / 2;
        const w = 26 + rnd() * 34, dd = 26 + rnd() * 34;
        tower(qx, qz, w, dd, 40 + Math.pow(rnd(), 1.7) * 260 * k, rnd() < 0.5 ? KIND.GLASS : KIND.OFFICE);
      }
    } else if (zn === ZONE.MID) {
      // микрорайон: панельные «пластины» и точечные башни
      const along = rnd() < 0.5, L = (along ? bw : bd) - 2 * m - 20 - rnd() * 30, floors = rnd() < 0.55 ? 9 : rnd() < 0.6 ? 12 : 16;
      const h = floors * 2.9 + 1.5;
      if (along) { put(cx, z0 + m + 7, L, 13, h, KIND.PANEL); put(cx, z1 - m - 7, L * (0.6 + rnd() * 0.4), 13, h, KIND.PANEL); }
      else { put(x0 + m + 7, cz, 13, L, h, KIND.PANEL); put(x1 - m - 7, cz, 13, L * (0.6 + rnd() * 0.4), h, KIND.PANEL); }
      if (rnd() < 0.45) put(cx, cz, 22, 22, 50 + rnd() * 30, KIND.PANEL);
      else if (rnd() < 0.4) put(cx, cz, 34 + rnd() * 20, 26, 9 + rnd() * 5, KIND.PLAIN); // школа, магазин
    } else if (zn === ZONE.LOW || zn === ZONE.FIELD) {
      // частный сектор и пятиэтажки по краям
      const five = d < 8000 && rnd() < 0.35;
      if (five) { put(cx, z0 + m + 6, bw - 2 * m - 30, 12, 15.5, KIND.PANEL); put(cx, z1 - m - 6, bw - 2 * m - 30, 12, 15.5, KIND.PANEL); }
      else for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
        if (rnd() < 0.18) continue;
        const qx = x0 + m + (a + 0.5) * (bw - 2 * m) / 2 + (rnd() - 0.5) * 20, qz = z0 + m + (b + 0.5) * (bd - 2 * m) / 2 + (rnd() - 0.5) * 20;
        put(qx, qz, 11 + rnd() * 8, 10 + rnd() * 8, 5 + rnd() * 6, KIND.HOUSE);
      }
    } else if (zn === ZONE.IND || zn === ZONE.PORT) {
      const c = 1 + Math.floor(rnd() * 2);
      for (let q = 0; q < c; q++) {
        const w = 50 + rnd() * (bw - 2 * m - 60), dd = 30 + rnd() * (bd / c - 2 * m - 30);
        const qz = z0 + m + (q + 0.5) * (bd - 2 * m) / c;
        put(cx + (rnd() - 0.5) * (bw - 2 * m - w), qz, w, dd, 8 + rnd() * 12, KIND.WAREHOUSE);
      }
      if (rnd() < 0.12) put(x0 + m + 6, z0 + m + 6, 5, 5, 45 + rnd() * 50, KIND.PLAIN); // заводская труба
    }
  }
  const B = { n, x: BX.subarray(0, n), z: BZ.subarray(0, n), w: BW.subarray(0, n), d: BD.subarray(0, n), h: BH.subarray(0, n), y0: BY.subarray(0, n), k: BK.subarray(0, n), c: BC.subarray(0, n) };

  // ── сетка высот застройки (над землёй, м) и грубая сетка максимумов (с землёй) ──
  const CELL = CITY.CELL, GN = Math.round(2 * CITY.GH / CELL), grid = new Uint16Array(GN * GN);
  const stamp = (x0, x1, z0, z1, top) => {
    const i0 = clamp(Math.floor((x0 + CITY.GH) / CELL), 0, GN - 1), i1 = clamp(Math.floor((x1 + CITY.GH) / CELL), 0, GN - 1);
    const j0 = clamp(Math.floor((z0 + CITY.GH) / CELL), 0, GN - 1), j1 = clamp(Math.floor((z1 + CITY.GH) / CELL), 0, GN - 1);
    const t = Math.min(65535, Math.ceil(top));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const q = j * GN + i; if (grid[q] < t) grid[q] = t; }
  };
  for (let q = 0; q < n; q++) stamp(B.x[q] - B.w[q] / 2, B.x[q] + B.w[q] / 2, B.z[q] - B.d[q] / 2, B.z[q] + B.d[q] / 2, B.y0[q] + B.h[q]);
  for (const o of objects) for (const p of o.parts) {
    const top = (p.y0 || 0) + p.h - (o.bridge ? 0 : 0);
    if (p.t === 'box') stamp(p.x - p.w / 2, p.x + p.w / 2, p.z - p.d / 2, p.z + p.d / 2, top);
    else stamp(p.x - p.r * 0.85, p.x + p.r * 0.85, p.z - p.r * 0.85, p.z + p.r * 0.85, top);
  }
  const CC = CITY.CC, CN = Math.round(2 * CITY.HALF / CC), coarse = new Float32Array(CN * CN), ratio = CC / CELL;
  for (let j = 0; j < CN; j++) for (let i = 0; i < CN; i++) {
    const x = -CITY.HALF + (i + 0.5) * CC, z = -CITY.HALF + (j + 0.5) * CC;
    let g = -1e9;
    for (const [ox, oz] of [[0, 0], [-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) g = Math.max(g, groundH(x + ox * CC, z + oz * CC));
    let b = 0;
    const gi = Math.floor((x - CC / 2 + CITY.GH) / CELL), gj = Math.floor((z - CC / 2 + CITY.GH) / CELL);
    if (gi >= 0 && gj >= 0 && gi + ratio <= GN && gj + ratio <= GN) for (let jj = 0; jj < ratio; jj++) for (let ii = 0; ii < ratio; ii++) b = Math.max(b, grid[(gj + jj) * GN + gi + ii]);
    coarse[j * CN + i] = g + 8 + b; // +8 м — запас на неровность земли внутри ячейки
  }
  const bldAt = (x, z) => {
    const i = Math.floor((x + CITY.GH) / CELL), j = Math.floor((z + CITY.GH) / CELL);
    return i < 0 || j < 0 || i >= GN || j >= GN ? 0 : grid[j * GN + i];
  };
  // верх препятствия в точке: земля + здание
  const topAt = (x, z) => groundH(x, z) + bldAt(x, z);
  // прямая видимость между двумя точками (радар — цель, контейнер — точка): шаг по сетке, высокие участки
  // пролетаем по грубой сетке максимумов. ends — сколько метров у концов не проверять (антенна на крыше, цель в здании)
  function los(ax, ay, az, bx, by, bz, ends = 0) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.hypot(dx, dz);
    if (L < 1) return true;
    const step = CELL * 0.75, ns = Math.ceil(L / step), skip = Math.ceil(ends / step);
    for (let s = skip; s <= ns - skip; s++) {
      const t = s / ns, x = ax + dx * t, z = az + dz * t, y = ay + dy * t;
      const ci = Math.floor((x + CITY.HALF) / CC), cj = Math.floor((z + CITY.HALF) / CC);
      if (ci < 0 || cj < 0 || ci >= CN || cj >= CN) continue;
      if (y > coarse[cj * CN + ci]) continue;
      if (y < topAt(x, z)) return false;
    }
    return true;
  }
  // луч из точки o по направлению d (единичный): первая точка на земле, крыше или стене (для прицельного контейнера)
  function raycast(o, d, maxD = 30000, out = { x: 0, y: 0, z: 0 }) {
    const step = CELL * 0.5;
    let px = o.x, py = o.y, pz = o.z;
    for (let s = step; s <= maxD; s += step) {
      const x = o.x + d.x * s, y = o.y + d.y * s, z = o.z + d.z * s;
      const ci = Math.floor((x + CITY.HALF) / CC), cj = Math.floor((z + CITY.HALF) / CC);
      if (ci >= 0 && cj >= 0 && ci < CN && cj < CN && y > coarse[cj * CN + ci]) { px = x; py = y; pz = z; continue; }
      if (y < Math.max(topAt(x, z), CITY.WATER_Y)) {
        // уточняем делением пополам между последней свободной точкой и попаданием
        let ax = px, ay = py, az = pz, bx = x, by = y, bz = z;
        for (let k = 0; k < 8; k++) {
          const mx = (ax + bx) / 2, my = (ay + by) / 2, mz = (az + bz) / 2;
          if (my < Math.max(topAt(mx, mz), CITY.WATER_Y)) { bx = mx; by = my; bz = mz; } else { ax = mx; ay = my; az = mz; }
        }
        out.x = bx; out.y = by; out.z = bz;
        return out;
      }
      px = x; py = y; pz = z;
    }
    return null;
  }
  return { seed, B, objects, grid, GN, coarse, CN, bldAt, topAt, los, raycast, zoneAt, groundH };
}
