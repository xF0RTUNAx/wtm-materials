// Хеллоуин-карта «Туманная топь» (2026) — вымышленное холмогорье поздней осенью, для вертолётов. Устроена иначе, чем
// «Северный рубеж»: не долина с рекой, а широкая котловина с болотом в середине (бочаги, острова, старица), вокруг —
// лесистые холмы, изрезанные глубокими оврагами (укрытия для полёта на малой высоте), на северо-востоке — голая
// Лысая гора с РЛС. Цели — по кругу у болота: монастырь на острове (КП, к нему — гать), гарнизон в заброшенной деревне,
// склад на ферме у тыквенных полей, ремонтная база на кладбище техники в овраге, вертолётная площадка противника, склад
// ГСМ на торфоразработках. Наша площадка — на юго-востоке (вылет и пополнение вертолётов).
// Детерминированный генератор с интерфейсом buildCity / buildWinter (симуляция и сервер): сетка высот 50 м, groundH —
// билинейно; вода — одна отметка (уровень болота AUTUMN.WY), waterAt — где она. Оси как в city.js: −Z — север.
import { tr } from './i18n.js?v=20261028a';
import { CITY, ZONE, KIND, mulberry32, clamp, smooth, mp, mbox, siteParts, mapRuntime } from './city.js?v=20261028a';
import { perlin, fbm, ridged, heap } from './map-winter.js?v=20261028a';

const H = CITY.HALF, RES = 50, N = Math.round(2 * H / RES) + 1;
export const AUTUMN = {
  RES, Y0: 72, WY: 70,                                   // дно котловины и уровень воды в болоте
  BASIN: { x: -400, z: 600, rx: 5600, rz: 4400 },        // котловина (эллипс, края искажены шумом)
  BALD: { x: 7600, z: -7000, h: 260, r: 1500 },          // Лысая гора
  OXBOW: { x: -3300, z: 1500, r: 1250, w: 150, a0: 0.6, a1: 3.9 }, // старица — дуга в западной части болота
  ISLE: { x: 600, z: 200, r: 330, moat: 700 },           // остров монастыря и вода вокруг
};
const B0 = AUTUMN.BASIN;
// «насколько далеко от середины котловины»: < 1 — болото, > 1,5 — холмы
export const basinD = (x, z) => Math.hypot((x - B0.x) / B0.rx, (z - B0.z) / B0.rz) + 0.22 * perlin(x * 0.00028 + 1.3, z * 0.00028 - 0.7);

// высота «природы»: холмы вокруг котловины, Лысая гора, овраги; в котловине — почти ровно
function natural(x, z) {
  const Y0 = AUTUMN.Y0, bd = basinD(x, z), rim = smooth(0.8, 1.55, bd);
  const wx = x + 900 * perlin(x * 0.00015 + 4.2, z * 0.00015), wz = z + 900 * perlin(x * 0.00015, z * 0.00015 + 8.7);
  const hills = 110 + 260 * Math.pow(Math.max(0, fbm(wx * 0.00021, wz * 0.00021, 5)), 1.4) + 120 * ridged(wx * 0.00033 + 2.1, wz * 0.00033 + 5.3, 4);
  // + общий пологий подъём от болота (вода стекает к нему, бессточных ям меньше — овраги сходятся к котловине)
  let h = Y0 + rim * (hills + 80 * smooth(1.1, 3.2, bd)) + (1 - rim) * 4 * (fbm(x * 0.0015, z * 0.0015, 3) - 0.5);
  const BA = AUTUMN.BALD, bm = Math.hypot(x - BA.x, z - BA.z) * (1 + 0.15 * perlin(x * 0.0007, z * 0.0007));
  h += BA.h * Math.exp(-((bm / BA.r) ** 2)) * (0.85 + 0.3 * smooth(0, 1, rim));
  return Math.max(h, Y0 + 0.5 * rim); // овраги — по стоку воды (ravines), после сетки высот
}
// Овраги: ветвистая сеть, сходящаяся к болоту. От края котловины расходятся 11 главных оврагов (извиваются, 7–11,5 км), от них —
// отвершки (1,5–3,5 км), от отвершков — промоины. Дно: глубина у устья ~70–80 м (2026-10-22, Mark: «больше перепад высот» — было ~50), к верховью сходит на ~16 м, и ниже по
// течению всегда не выше, чем выше (вода стекает к болоту); склоны — V-профиль, ширина по верху ~ 4 глубины. Возвращает
// линии оврагов (для отрисовки: мокрое дно, густой лес на склонах)
function ravines(HM, N, rnd) {
  const hAt = (x, z) => { const fx = clamp((x + H) / RES, 0, N - 1.001), fz = clamp((z + H) / RES, 0, N - 1.001), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, q = j * N + i; return (HM[q] * (1 - u) + HM[q + 1] * u) * (1 - v) + (HM[q + N] * (1 - u) + HM[q + N + 1] * u) * v; };
  const lines = [];
  // линия: из точки (x, z) в сторону a, длина L, шаг 40 м; курс плавно гуляет (шум) и чуть тянется «в гору» (от болота)
  const walk = (x, z, a, L, wig, b0) => {
    const pts = [[x, z]], ph = rnd() * 100;
    for (let s = 40; s <= L; s += 40) {
      const g = basinD(x + Math.cos(a) * 80, z + Math.sin(a) * 80) - basinD(x - Math.cos(a) * 80, z - Math.sin(a) * 80); // > 0 — уходим от болота
      a += wig * perlin(ph + s * 0.0011, ph * 0.7) * 0.09 + (g < 0 ? 0.03 : 0) * Math.sign(perlin(ph, s * 0.001) || 1);
      x += Math.cos(a) * 40; z += Math.sin(a) * 40;
      if (Math.abs(x) > H - 600 || Math.abs(z) > H - 600) break;
      pts.push([x, z]);
    }
    return { pts, b0 };
  };
  const mains = 11, a0 = rnd() * 6.283;
  for (let m = 0; m < mains; m++) {
    const t = a0 + m * 6.283 / mains + (rnd() - 0.5) * 0.4;
    // устье — на краю котловины (basinD ≈ 1,0) по лучу t
    let r = 0.5; while (r < 3 && Math.hypot(Math.cos(t) * r, Math.sin(t) * r) < 9 && basinD(B0.x + Math.cos(t) * B0.rx * r, B0.z + Math.sin(t) * B0.rz * r) < 1.0) r += 0.02;
    const x0 = B0.x + Math.cos(t) * B0.rx * r, z0 = B0.z + Math.sin(t) * B0.rz * r;
    const main = walk(x0, z0, Math.atan2(Math.sin(t) * B0.rz, Math.cos(t) * B0.rx), 7000 + rnd() * 4500, 1, 50); main.d0 = 78; lines.push(main);
    const nb = 3 + Math.floor(rnd() * 3);
    for (let b = 0; b < nb; b++) {
      const k = Math.floor((0.2 + 0.7 * rnd()) * (main.pts.length - 2)) + 1, [bx, bz] = main.pts[k], [px, pz] = main.pts[k - 1], ma = Math.atan2(bz - pz, bx - px);
      const br = walk(bx, bz, ma + (rnd() < 0.5 ? -1 : 1) * (0.6 + rnd() * 0.5), 1500 + rnd() * 2000, 1.3); br.parent = main; br.at = k; br.d0 = 50; lines.push(br);
      if (rnd() < 0.6) { const k2 = Math.floor((0.3 + 0.5 * rnd()) * (br.pts.length - 2)) + 1, [cx, cz] = br.pts[k2], [qx, qz] = br.pts[k2 - 1], ba = Math.atan2(cz - qz, cx - qx);
        const tw = walk(cx, cz, ba + (rnd() < 0.5 ? -1 : 1) * (0.7 + rnd() * 0.5), 700 + rnd() * 1100, 1.6); tw.parent = br; tw.at = k2; tw.d0 = 30; lines.push(tw); }
    }
  }
  // дно: «сырой» профиль — земля минус глубина (у устья d0, к верховью ~8 м), потом от верховья вниз — не выше, чем выше;
  // у отвершка дно в месте впадения — дно родителя там же
  for (const l of lines) {
    const n = l.pts.length; l.bot = new Float32Array(n);
    for (let k = 0; k < n; k++) { const f = k / Math.max(1, n - 1); l.bot[k] = hAt(l.pts[k][0], l.pts[k][1]) - (16 + (l.d0 - 16) * Math.pow(1 - f, 0.35)); }
    for (let k = n - 2; k >= 0; k--) l.bot[k] = Math.min(l.bot[k], l.bot[k + 1]);
    if (l.parent) { const pb = l.parent.bot[l.at]; for (let k = 0; k < n && l.bot[k] < pb + 0.5; k++) l.bot[k] = pb + 0.5 + k * 0.05; }
    else for (let k = 0; k < n; k++) l.bot[k] = Math.max(l.bot[k], AUTUMN.Y0 - 0.5 + k * 0.04);
  }
  // склоны: каждая точка сетки у оврага — не выше V-профиля от дна (min по всем оврагам)
  const NEW = Float32Array.from(HM);
  for (const l of lines) for (let k = 0; k < l.pts.length; k++) {
    const [x, z] = l.pts[k], d = hAt(x, z) - l.bot[k]; if (d <= 0) continue;
    if (d > 42 && k % 2 && k < l.pts.length - 1) continue; // широкий склон (> 200 м) — по каждой второй точке (через 80 м): форма та же, вдвое быстрее
    const W = 30 + 4 * Math.max(d, 8), i0 = Math.max(0, Math.floor((x - W + H) / RES)), i1 = Math.min(N - 1, Math.ceil((x + W + H) / RES)), j0 = Math.max(0, Math.floor((z - W + H) / RES)), j1 = Math.min(N - 1, Math.ceil((z + W + H) / RES));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const q = j * N + i, r = Math.hypot(-H + i * RES - x, -H + j * RES - z); if (r >= W) continue;
      const y = l.bot[k] + (HM[q] - l.bot[k]) * Math.pow(r / W, 1.4);
      if (y < NEW[q]) NEW[q] = y;
    }
  }
  const CV = new Float32Array(HM.length); for (let q = 0; q < HM.length; q++) CV[q] = HM[q] - NEW[q]; // насколько врезан овраг
  HM.set(NEW);
  return { CV, lines: lines.map((l) => ({ pts: l.pts, bot: Array.from(l.bot), main: !l.parent })) };
}
// Гривы (2026-10-22, Mark: «больше перепад высот, чтобы прятаться от рельефа»): на ровных подходах к целям через котловину — вытянутые
// сухие гряды 32–46 м поперёк подхода — три кольца по 5 в 1,5–3,4 км от цели (из-за них — подскок на пуск ПТУР), у монастыря — двумя кольцами. Только в
// котловине (на холмах укрытий и так хватает), над водой — суша; случайных чисел не берут (остальная карта не меняется)
const RIDGES = (() => {
  const out = [], C0 = AUTUMN.BASIN, I = AUTUMN.ISLE;
  // разброс — от хэша номера гряды (длина, поворот, сдвиг, высота): иначе ровный «пунктир» по кругу
  const hs = (k) => { const v = Math.sin(k * 12.9898 + 78.233) * 43758.5453; return v - Math.floor(v); };
  const add = (x, z, a, L, h) => { const k = out.length; a += (hs(k) - 0.5) * 0.7; L *= 0.7 + 0.7 * hs(k + 0.3); h *= 0.85 + 0.3 * hs(k + 0.6); x += (hs(k + 0.1) - 0.5) * 500; z += (hs(k + 0.2) - 0.5) * 500;
    out.push({ x, z, ax: Math.cos(a), az: Math.sin(a), L, h, W: 170 + h * 2, r: Math.hypot(L, 170 + h * 2) }); };
  // [x, z, на склоне]: цели на склоне (деревня, ферма) смотрят на болото сверху — их гряды ближе (выше нельзя: закрывали и подскок)
  for (const [px, pz, up] of [[-1300, 5400, 1], [-7000, 300, 1], [4500, 1100, 0]]) { // деревня, ферма, торфяник
    const d0 = Math.atan2(C0.z - pz, C0.x - px);
    for (const [ring, D] of [[0, up ? 1500 : 1800], [1, up ? 2200 : 2600], [2, up ? 2900 : 3400]]) for (let k = 0; k < 5; k++) {
      const a = d0 + (k - 2) * 0.62 + (ring % 2) * 0.31; add(px + Math.cos(a) * D, pz + Math.sin(a) * D, a + Math.PI / 2, 520, 32 + ((k + ring) % 3) * 4);
    }
  }
  for (const [D, n, h] of [[1900, 6, 30], [2900, 7, 34]]) for (let k = 0; k < n; k++) { const a = 0.4 + (k + D / 1000) * 6.283 / n; add(I.x + Math.cos(a) * D, I.z + Math.sin(a) * D, a + Math.PI / 2, 520, h + (k % 2) * 6); } // монастырь
  return out;
})();
// высоты гряд на сетке (наибольшая из перекрытых), м: по клеткам рамки каждой гряды — не по всей карте
function ridgeGrid(N) {
  const RG = new Float32Array(N * N);
  for (const r of RIDGES) {
    const i0 = Math.max(0, Math.floor((r.x - r.r + H) / RES)), i1 = Math.min(N - 1, Math.ceil((r.x + r.r + H) / RES)), j0 = Math.max(0, Math.floor((r.z - r.r + H) / RES)), j1 = Math.min(N - 1, Math.ceil((r.z + r.r + H) / RES));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = -H + i * RES, z = -H + j * RES, dx = x - r.x, dz = z - r.z, along = dx * r.ax + dz * r.az, across = dx * -r.az + dz * r.ax;
      const u = Math.abs(along) / r.L; if (u >= 1) continue;
      const v = Math.abs(across + 40 * perlin(x * 0.002 + r.x * 1e-3, z * 0.002)) / r.W; if (v >= 1) continue; // ось чуть извилиста
      const h = r.h * Math.cos(v * Math.PI / 2) ** 2 * (1 - smooth(0.55, 1, u)) * (0.85 + 0.3 * perlin(x * 0.004 + 3.1, z * 0.004)), q = j * N + i;
      if (h > RG[q]) RG[q] = h;
    }
  }
  return RG;
}
// площадки: [центр, полуразмеры, откос m]; y — своя (остров, площадки у воды) или средняя по площадке
function pads() {
  const I = AUTUMN.ISLE;
  return [
    { key: 'mon', x: I.x, z: I.z, hx: 230, hz: 190, m: 120, y: AUTUMN.WY + 5 },   // 0 монастырь на острове
    { key: 'vil', x: -1300, z: 5400, hx: 650, hz: 420, m: 380, k: 0.8 },          // 1 заброшенная деревня (южный склон)
    { key: 'farm', x: -7000, z: 300, hx: 380, hz: 320, m: 350 },                  // 2 ферма и тыквенные поля (запад)
    { key: 'wreck', x: -5600, z: -6400, hx: 230, hz: 180, m: 150, rav: 1 },       // 3 кладбище техники — на дне ближайшего главного оврага
    { key: 'heli', x: 1800, z: -9200, hx: 300, hz: 300, m: 350 },                 // 4 вертолётная площадка противника (север)
    { key: 'peat', x: 4500, z: 1100, hx: 420, hz: 300, m: 300, y: AUTUMN.WY + 3 }, // 5 торфоразработки у края болота (восток); 2026-10-21 сдвинуты с (5000, 2600) к воде: там у подножия склона прицел вертолёта видел склад с 1 направления из 24, здесь — с 23
    { key: 'home', x: 9800, z: 11200, hx: 220, hz: 220, m: 350 },                 // 6 наша площадка (юго-восток)
  ];
}

export function buildAutumn(seed = 1) {
  const rnd = mulberry32((seed * 2246822519 + 3301) >>> 0), A = AUTUMN, WY = A.WY;
  // ── сетка высот и вода ──
  const HM = new Float32Array(N * N), WET = new Uint8Array(N * N), P = pads();
  const OX = A.OXBOW, IS = A.ISLE;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = -H + i * RES, z = -H + j * RES, q = j * N + i, bd = basinD(x, z);
    let h = natural(x, z), wet = 0;
    if (bd < 1.08) {
      // болото: бочаги — пятнами, к середине их больше; между ними — кочки и острова на 0,5–4 м над водой
      const wn = fbm(x * 0.0011 + 7.7, z * 0.0011 - 1.1, 4) + 0.28 * (0.95 - bd);
      const land = WY + 0.5 + 3.5 * smooth(0.6, 0.3, wn);
      const k = smooth(0.85, 1.08, bd); h = land + (h - land) * k;
      if (wn > 0.6 && bd < 0.97) wet = 1;
      // старица — дуга
      const r = Math.hypot(x - OX.x, z - OX.z), a = Math.atan2(z - OX.z, x - OX.x) + Math.PI;
      if (Math.abs(r - OX.r) < OX.w / 2 + 25 * perlin(x * 0.004, z * 0.004) && a > OX.a0 && a < OX.a1) wet = 1;
      // вода вокруг острова монастыря
      const ri = Math.hypot(x - IS.x, z - IS.z) * (1 + 0.12 * perlin(x * 0.003, z * 0.003));
      if (ri > IS.r + 60 && ri < IS.moat) wet = 1;
      if (wet) h = WY - 1.5;
    }
    HM[q] = h; WET[q] = wet;
  }
  const RAV = ravines(HM, N, rnd);
  // гривы — поверх котловины (до 1,25 basinD, к краю сходят на нет); над водой — суша, а у монастыря вода рва остаётся
  { const RG = ridgeGrid(N); for (let q = 0; q < N * N; q++) {
    if (RG[q] <= 0.3) continue; const i = q % N, j = (q - i) / N, x = -H + i * RES, z = -H + j * RES, bd = basinD(x, z); if (bd > 1.45) continue;
    if (Math.hypot(x - IS.x, z - IS.z) < IS.moat + 250) continue;
    const r = RG[q] * (1 - smooth(1.2, 1.45, bd)); if (r <= 0.3) continue;
    if (WET[q]) { if (r > 2) { HM[q] = WY + 0.6 + r; WET[q] = 0; } } else HM[q] += r;
  } }
  // сглаживание крутых мест (уклон > ~35°); вода не трогается
  { const T = new Float32Array(N * N);
    for (let it = 0; it < 3; it++) {
      T.set(HM);
      for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
        const q = j * N + i; if (WET[q]) continue;
        const s = Math.hypot(T[q + 1] - T[q - 1], T[q + N] - T[q - N]) / (2 * RES), w = smooth(0.7, 1.3, s) * 0.8;
        if (w <= 0) continue;
        const b = (4 * T[q] + 2 * (T[q - 1] + T[q + 1] + T[q - N] + T[q + N]) + T[q - N - 1] + T[q - N + 1] + T[q + N - 1] + T[q + N + 1]) / 16;
        HM[q] = T[q] + (b - T[q]) * w;
      }
    }
  }
  const node = (x, z) => [Math.round(clamp((x + H) / RES, 0, N - 1)), Math.round(clamp((z + H) / RES, 0, N - 1))];
  function groundAt(x, z) {
    const fx = clamp((x + H) / RES, 0, N - 1.001), fz = clamp((z + H) / RES, 0, N - 1.001), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, q = j * N + i;
    return (HM[q] * (1 - u) + HM[q + 1] * u) * (1 - v) + (HM[q + N] * (1 - u) + HM[q + N + 1] * u) * v;
  }
  // кладбище техники — на дне ближайшего главного оврага (балка в этом месте расширена площадкой)
  for (const p of P) if (p.rav) {
    let best = null, bd = 1e12;
    for (const l of RAV.lines) if (l.main) l.pts.forEach(([x, z], k) => { const d = Math.hypot(x - p.x, z - p.z); if (d < bd && k > 20) { bd = d; best = [x, z, l.bot[k]]; } });
    if (best) { p.x = best[0]; p.z = best[1]; p.y = best[2] + 1; }
  }
  // площадки: высота — своя (у воды) или средняя; откос — по перепаду (до 900 м); вода под площадкой и откосом — суша
  const flatten = (p) => {
    const [i0, j0] = node(p.x - p.hx, p.z - p.hz), [i1, j1] = node(p.x + p.hx, p.z + p.hz);
    if (p.y === undefined) { let s = 0, c = 0; for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { s += HM[j * N + i]; c++; } p.y = s / c; }
    let dh = 0;
    for (let a = 0; a < 6.283; a += 0.2) { const [i, j] = node(p.x + Math.cos(a) * (p.hx + p.m), p.z + Math.sin(a) * (p.hz + p.m)); if (!WET[j * N + i]) dh = Math.max(dh, Math.abs(HM[j * N + i] - p.y)); }
    const m = clamp(dh * 3.5, p.m, 900); p.mm = m;
    const [a0, b0] = node(p.x - p.hx - m, p.z - p.hz - m), [a1, b1] = node(p.x + p.hx + m, p.z + p.hz + m);
    for (let j = b0; j <= b1; j++) for (let i = a0; i <= a1; i++) {
      const q = j * N + i, x = -H + i * RES, z = -H + j * RES, e = Math.hypot(Math.max(0, Math.abs(x - p.x) - p.hx), Math.max(0, Math.abs(z - p.z) - p.hz));
      if (WET[q] && e > 40) continue; // вода у края площадки остаётся водой (остров, берег торфяника)
      if (e < m) { HM[q] += (p.y - HM[q]) * (1 - smooth(0, m, e)) * (p.k || 1); if (e < 40) WET[q] = 0; }
    }
  };
  for (const p of P) flatten(p);
  const PK = Object.fromEntries(P.map((p) => [p.key, p]));

  // ── дороги: грунтовки по сетке 100 м с ценой за уклон (A*): по гребням и днищам оврагов, болото — гатью (дорого, коротко) ──
  const RD = 2 * RES, GN = Math.floor((N - 1) / 2) + 1, gi = (x) => Math.round(clamp((x + H) / RD, 1, GN - 2));
  const hN = (n) => HM[(Math.floor(n / GN) * 2) * N + (n % GN) * 2], wN = (n) => WET[(Math.floor(n / GN) * 2) * N + (n % GN) * 2];
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const route = (ax, az, bx, bz, src = null) => {
    const st = gi(az) * GN + gi(ax), goal = gi(bz) * GN + gi(bx), gx = goal % GN, gz = Math.floor(goal / GN);
    const g = new Float32Array(GN * GN).fill(Infinity), from = new Int32Array(GN * GN).fill(-1), done = new Uint8Array(GN * GN), q = heap();
    g[st] = 0; q.push(0, st);
    if (src) for (const [x, z] of src) { const n = gi(z) * GN + gi(x); g[n] = 0; q.push(0, n); }
    while (q.size) {
      const n = q.pop(); if (done[n]) continue; done[n] = 1; if (n === goal) break;
      const ni = n % GN, nj = Math.floor(n / GN);
      for (const [di, dj] of DIRS) {
        const mi = ni + di, mj = nj + dj; if (mi < 12 || mj < 12 || mi > GN - 13 || mj > GN - 13) continue;
        const m = mj * GN + mi; if (done[m]) continue;
        const len = RD * (di && dj ? Math.SQRT2 : 1), gr = Math.abs(hN(m) - hN(n)) / len;
        const c = len * (1 + 15 * gr + 2000 * Math.max(0, gr - 0.12) ** 2 + (wN(m) ? 7 : 0));
        if (g[n] + c < g[m]) { g[m] = g[n] + c; from[m] = n; q.push(g[m] + Math.hypot(mi - gx, mj - gz) * RD, m); }
      }
    }
    const pts = []; for (let n = goal; n >= 0; n = from[n]) pts.push([-H + (n % GN) * RD, -H + Math.floor(n / GN) * RD]);
    pts.reverse(); if (!src) pts[0] = [ax, az]; pts[pts.length - 1] = [bx, bz];
    let p = pts; for (let it = 0; it < 3; it++) { const o = [p[0]]; for (let k = 0; k < p.length - 1; k++) { const [x0, z0] = p[k], [x1, z1] = p[k + 1]; o.push([x0 * 0.75 + x1 * 0.25, z0 * 0.75 + z1 * 0.25], [x0 * 0.25 + x1 * 0.75, z0 * 0.25 + z1 * 0.75]); } o.push(p[p.length - 1]); p = o; }
    const out = [p[0]]; let acc = 0;
    for (let k = 1; k < p.length; k++) { acc += Math.hypot(p[k][0] - p[k - 1][0], p[k][1] - p[k - 1][1]); if (acc >= 25 || k === p.length - 1) { out.push(p[k]); acc = 0; } }
    return out;
  };
  const nearestOn = (pts, x, z) => pts.reduce((b, p) => (Math.hypot(p[0] - x, p[1] - z) < Math.hypot(b[0] - x, b[1] - z) ? p : b), pts[0]);
  const ROADS = [];
  { const V = PK.vil, F = PK.farm, W = PK.wreck, HL = PK.heli, PT = PK.peat, HO = PK.home, MO = PK.mon;
    // кольцевая грунтовка вокруг болота по склонам: деревня → ферма → кладбище техники → площадка → торфяник → деревня
    const ring = [[V.x - V.hx, V.z], [F.x, F.z + F.hz], [W.x, W.z + W.hz], [HL.x - HL.hx, HL.z], [PT.x + PT.hx, PT.z - PT.hz], [V.x + V.hx, V.z]];
    let prev = null;
    for (let k = 0; k < ring.length - 1; k++) { const r = route(...ring[k], ...ring[k + 1]); ROADS.push({ w: 7, pts: r }); prev = r; }
    // гать к монастырю — от деревни через болото (насыпь над водой)
    const s0 = nearestOn(ROADS[0].pts, MO.x, MO.z + 2000); ROADS.push({ w: 5, pts: route(s0[0], s0[1], MO.x, MO.z + MO.hz, ROADS[0].pts), gat: true });
    // от нашей площадки — к торфянику
    ROADS.push({ w: 6, pts: route(HO.x - HO.hx, HO.z, PT.x + PT.hx * 0.3, PT.z + PT.hz) });
    // узкоколейка торфяника — прямая в болото (рельсы рисует отрисовка; здесь — насыпь)
    ROADS.push({ w: 4, pts: [[PT.x - PT.hx, PT.z], [PT.x - PT.hx - 1500, PT.z - 300], [PT.x - PT.hx - 2600, PT.z - 900]], rail: true });
    void prev;
  }
  // врезка дорог: продольный профиль сглажен, поперёк — ровно, откосы ~70 м; над водой — насыпь (гать) на 1,2 м выше уровня
  { const CW = new Float32Array(N * N), CT = new Float32Array(N * N);
    for (const r of ROADS) {
      const pr = r.pts.map(([x, z]) => Math.max(groundAt(x, z), WY + 1.2));
      for (let it = 0; it < 6; it++) { const t = pr.slice(); for (let k = 0; k < pr.length; k++) { let s = 0, c = 0; for (let d = -5; d <= 5; d++) { const v = t[k + d]; if (v !== undefined) { s += v; c++; } } pr[k] = Math.max(s / c, WY + 1.2); } }
      for (let k = 0; k < r.pts.length - 1; k++) {
        const [ax, az] = r.pts[k], [bx, bz] = r.pts[k + 1], L2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1, rr = r.w / 2 + 70;
        const [i0, j0] = node(Math.min(ax, bx) - rr, Math.min(az, bz) - rr), [i1, j1] = node(Math.max(ax, bx) + rr, Math.max(az, bz) + rr);
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const x = -H + i * RES, z = -H + j * RES, t = clamp(((x - ax) * (bx - ax) + (z - az) * (bz - az)) / L2, 0, 1);
          const d = Math.hypot(x - ax - (bx - ax) * t, z - az - (bz - az) * t), q = j * N + i;
          const w = WET[q] ? (d < r.w / 2 + 6 ? 1 : 0) : 1 - smooth(r.w / 2 + 10, rr, d); // над водой — узкая насыпь без откосов
          if (w > CW[q]) { CW[q] = w; CT[q] = pr[k] + (pr[k + 1] - pr[k]) * t; }
        }
      }
    }
    for (let q = 0; q < N * N; q++) if (CW[q] > 0) { HM[q] += (CT[q] - HM[q]) * CW[q]; if (CW[q] >= 1) WET[q] = 0; }
  }
  const groundH = groundAt;
  const ravineAt = (x, z) => { const [i, j] = node(x, z); return RAV.CV[j * N + i]; }; // глубина врезки оврага, м
  const waterAt = (x, z) => { const [i, j] = node(x, z); return WET[j * N + i] === 1; };
  const slopeAt = (x, z) => { const e = RES; return Math.hypot(groundH(x + e, z) - groundH(x - e, z), groundH(x, z + e) - groundH(x, z - e)) / (2 * e); };
  const cellMax = (x0, z0, x1, z1) => {
    let m = -1e9; const i0 = Math.max(0, Math.floor((x0 + H) / RES)), i1 = Math.min(N - 1, Math.ceil((x1 + H) / RES)), j0 = Math.max(0, Math.floor((z0 + H) / RES)), j1 = Math.min(N - 1, Math.ceil((z1 + H) / RES));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) m = Math.max(m, HM[j * N + i]);
    return Math.max(m, WY);
  };

  // ── объекты-цели (модели построек — общие с городом; осенние модели — потом) ──
  const O = [];
  const add = (o) => { O.push(Object.assign({ id: O.length, value: 100, hp: 100 }, o)); };
  { const p = PK.mon, M = [mp('obj_church', p.x + 20, p.z - 40), mp('obj_milbase', p.x - 70, p.z + 60), mp('obj_cont', p.x + 85, p.z + 70, 1)]; // монастырь: заброшенный храм с колокольней (reramil), КП в кельях
    add({ key: 'a_mon', name: tr('КП «Погост»'), x: p.x, z: p.z, w: 300, d: 260, value: 180, hp: 260, models: M, parts: M.map(mbox) }); }
  { const p = PK.vil, x = p.x + 260, z = p.z - 120, M = [mp('obj_milbase', x, z), mp('obj_milbase', x + 70, z + 40, 1), mp('obj_cont', x - 60, z + 60)]; // гарнизон в деревне
    add({ key: 'a_vil', name: tr('Гарнизон «Пугало»'), x, z: z + 20, w: 240, d: 200, value: 120, hp: 170, models: M, parts: M.map(mbox) }); }
  { const p = PK.farm, M = [mp('obj_barn', p.x - 100, p.z, 0, 1.4), mp('obj_barn', p.x, p.z, 0, 1.4), mp('obj_barn', p.x + 100, p.z, 0, 1.4), mp('obj_oldind', p.x, p.z + 150, 1)]; // склад на ферме: сараи (narighillya), ×1,4 — коровники
    for (let k = 0; k < 3; k++) M.push(mp('obj_cont', p.x - 100 + k * 100, p.z - 140));
    add({ key: 'a_farm', name: tr('Склад «Фонарь Джека»'), x: p.x, z: p.z, w: 420, d: 360, value: 150, hp: 200, models: M, parts: M.map(mbox) }); }
  { const p = PK.wreck, M = [mp('obj_hangar', p.x, p.z - 80, 0, 0.8), mp('obj_milbase', p.x + 120, p.z + 60), mp('obj_oldind', p.x - 140, p.z + 40, 1)]; // ремонтная база на кладбище техники
    add({ key: 'a_wreck', name: tr('Рембаза «Костяной овраг»'), x: p.x, z: p.z, w: 400, d: 320, value: 150, hp: 200, models: M, parts: M.map(mbox) }); }
  { const p = PK.heli, M = [mp('obj_rtank', p.x + 200, p.z - 150), mp('obj_rtank', p.x + 215, p.z - 150), mp('obj_milbase', p.x - 200, p.z + 180), mp('obj_cont', p.x + 180, p.z + 200)]; // вертолётная площадка
    add({ key: 'a_heli', name: tr('Вертолётная площадка «Ведьмина поляна»'), x: p.x, z: p.z, w: 520, d: 520, value: 160, hp: 220, models: M,
      parts: [...M.map(mbox), ...[[-110, -110], [110, -110], [-110, 110], [110, 110]].map(([dx, dz]) => ({ t: 'box', x: p.x + dx, z: p.z + dz, w: 30, d: 30, h: 0.5 }))] }); }
  { const p = PK.peat, M = [mp('obj_tanks', p.x - 120, p.z - 60), mp('obj_tanks', p.x - 120, p.z + 60), mp('obj_oldind', p.x + 120, p.z, 1), mp('obj_rtank', p.x + 220, p.z - 120)]; // ГСМ на торфоразработках
    add({ key: 'a_peat', name: tr('Склад ГСМ «Болотный огонь»'), x: p.x, z: p.z, w: 520, d: 380, value: 160, hp: 200, models: M, parts: M.map(mbox) }); }
  { // РЛС на Лысой горе: вершина (самая высокая точка в круге), площадка срезана на 6 м
    const BA = A.BALD; let bx = BA.x, bz = BA.z, bh = -1e9;
    for (let a = 0; a < 1600; a += 100) for (let t = 0; t < 6.283; t += 0.25) { const x = BA.x + Math.cos(t) * a, z = BA.z + Math.sin(t) * a, h = groundH(x, z); if (h > bh) { bh = h; bx = x; bz = z; } }
    const [ci, cj] = node(bx, bz), y = bh - 6;
    for (let j = cj - 6; j <= cj + 6; j++) for (let i = ci - 6; i <= ci + 6; i++) { const d = Math.hypot(i - ci, j - cj) * RES; if (d < 300) HM[j * N + i] += (y - HM[j * N + i]) * (1 - smooth(70, 300, d)); }
    BA.top = { x: bx, z: bz, y };
    const MM = [mp('obj_mill', bx - 70, bz + 45)]; // старая мельница на вершине (Tim0) — рядом с антеннами
    add({ key: 'a_radar', name: tr('РЛС «Лысая гора»'), x: bx, z: bz, w: 160, d: 120, value: 150, hp: 160, peak: true, models: MM, site: 'site_radar', // своя сцена «РЛС на вершине» (city.js SITES), место мельницы в ней свободно
      parts: [...MM.map(mbox), ...siteParts('site_radar', bx, bz)] }); }
  const objects = O;
  const keep = [...objects.map((o) => ({ x0: o.x - o.w / 2 - 40, x1: o.x + o.w / 2 + 40, z0: o.z - o.d / 2 - 40, z1: o.z + o.d / 2 + 40 })),
    ...[PK.home].map((p) => ({ x0: p.x - p.hx, x1: p.x + p.hx, z0: p.z - p.hz, z1: p.z + p.hz }))];
  const blocked = (x, z, r) => keep.some((k) => x + r > k.x0 && x - r < k.x1 && z + r > k.z0 && z - r < k.z1);

  // ── постройки: заброшенная деревня (избы вдоль кривых улиц, сараи), хутор у фермы, бараки торфяника ──
  let cap = 2000, n = 0;
  const BX = new Float32Array(cap), BZ = new Float32Array(cap), BW = new Float32Array(cap), BD = new Float32Array(cap), BH = new Float32Array(cap), BY = new Float32Array(cap), BK = new Uint8Array(cap), BC = new Float32Array(cap);
  const put = (x, z, w, d, h, k) => { if (n >= cap || blocked(x, z, Math.max(w, d) / 2) || waterAt(x, z)) return; BX[n] = x; BZ[n] = z; BW[n] = w; BD[n] = d; BH[n] = h; BK[n] = k; BY[n] = 0; BC[n] = rnd(); n++; };
  { const p = PK.vil, a0 = -0.2 + rnd() * 0.4; // три улицы вдоль склона, дома с огородами — редко (деревня заброшена)
    for (let s = -1; s <= 1; s++) {
      let a = a0, x = p.x - p.hx * 0.9, z = p.z + s * 150; const st = [[x, z]]; ROADS.push({ w: s ? 5 : 6, pts: st });
      for (let t = 0; t < p.hx * 1.8; t += 26 + rnd() * 18) {
        a += (rnd() - 0.5) * 0.15; x += Math.cos(a) * 32; z += Math.sin(a) * 32; st.push([x, z]);
        for (const sd of [-1, 1]) { if (rnd() < 0.3) continue; const off = 16 + rnd() * 10; put(x - Math.sin(a) * off * sd, z + Math.cos(a) * off * sd, 7 + rnd() * 4, 8 + rnd() * 5, 4 + rnd() * 2, rnd() < 0.8 ? KIND.HOUSE : KIND.PLAIN); }
      }
    }
  }
  for (let k = 0; k < 6; k++) put(PK.farm.x - 260 + rnd() * 520, PK.farm.z + 230 + rnd() * 120, 10 + rnd() * 8, 16 + rnd() * 10, 5 + rnd() * 3, KIND.PLAIN); // хутор
  for (let k = 0; k < 5; k++) put(PK.peat.x + 300 + k * 30, PK.peat.z + 180, 9, 26, 4.5, KIND.PLAIN); // бараки торфяника
  const B = { n, x: BX.subarray(0, n), z: BZ.subarray(0, n), w: BW.subarray(0, n), d: BD.subarray(0, n), h: BH.subarray(0, n), y0: BY.subarray(0, n), k: BK.subarray(0, n), c: BC.subarray(0, n) };

  // ── поля: пашня и тыквенные — прямоугольники у фермы и деревни (для отрисовки и тыкв) ──
  const FIELDS = [];
  for (const [p, cnt] of [[PK.farm, 9], [PK.vil, 6]]) for (let k = 0; k < cnt; k++) {
    const a = rnd() * 6.283, r = 500 + rnd() * 900, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
    if (waterAt(x, z) || slopeAt(x, z) > 0.12 || blocked(x, z, 160)) continue;
    FIELDS.push({ x, z, w: 180 + rnd() * 200, d: 120 + rnd() * 160, a: rnd() * Math.PI, pumpkin: rnd() < 0.45 });
  }
  // ── реквизит (не цели, много копий; отрисовка — autumn-render.js autumnProps): имя → [x, z, поворот, масштаб, …] ──
  const PROPS = {}, prop = (name, x, z, rot = 0, sc = 1) => (PROPS[name] = PROPS[name] || []).push(x, z, rot, sc);
  const onBld = (x, z, r = 4) => { for (let i = 0; i < n; i++) if (Math.abs(x - BX[i]) < BW[i] / 2 + r && Math.abs(z - BZ[i]) < BD[i] / 2 + r) return true; return false; };
  { // кладбище у деревни: ровное место рядом, надгробия рядами (кресты, плиты, склепы), кованая ограда с воротами, старые деревья
    const v = PK.vil; let best = null, bs = 1e9;
    for (let a = 0; a < 6.283; a += 0.35) for (const r of [v.hx + 180, v.hx + 320]) { const x = v.x + Math.cos(a) * r, z = v.z + Math.sin(a) * r * 0.8, sl = slopeAt(x, z) + (waterAt(x, z) || blocked(x, z, 90) ? 9 : 0); if (sl < bs) { bs = sl; best = [x, z]; } }
    const [cx, cz] = best, W = 110, D = 70; FIELDS.cem = { x: cx, z: cz, w: W, d: D };
    for (let x = cx - W / 2 + 4; x < cx + W / 2 - 3; x += 2.4) for (let z = cz - D / 2 + 4; z < cz + D / 2 - 3; z += 3.3) {
      if (rnd() < 0.18 || Math.abs(x - cx) < 3) continue; // проход посередине
      const r = rnd(), g = r < 0.38 ? 'pr_grave1' : r < 0.72 ? 'pr_grave2' : r < 0.94 ? 'pr_grave4' : 'pr_grave3';
      prop(g, x + (rnd() - 0.5) * 0.6, z + (rnd() - 0.5) * 0.5, (rnd() < 0.85 ? 0 : Math.PI) + (rnd() - 0.5) * 0.25, 0.9 + rnd() * 0.25); // покосившиеся
    }
    const SEC = 0.5316, fence = (x0, z0, x1, z1, gate) => { const L = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(-(z1 - z0), x1 - x0);
      for (let t = 0; t < L; t += SEC) { const m = t / L; if (gate && Math.abs(t - L / 2) < 3) continue; prop('pr_fence', x0 + (x1 - x0) * (t + SEC / 2) / L, z0 + (z1 - z0) * (t + SEC / 2) / L, a); if (Math.round(t / SEC) % 19 === 0) prop('pr_fpost', x0 + (x1 - x0) * m, z0 + (z1 - z0) * m, a); } };
    fence(cx - W / 2, cz - D / 2, cx + W / 2, cz - D / 2, true); fence(cx - W / 2, cz + D / 2, cx + W / 2, cz + D / 2, false);
    fence(cx - W / 2, cz - D / 2, cx - W / 2, cz + D / 2, false); fence(cx + W / 2, cz - D / 2, cx + W / 2, cz + D / 2, false);
    for (let k = 0; k < 6; k++) prop(k < 3 ? 'pr_oldtree' : 'pr_deadtree', cx + (rnd() - 0.5) * W * 0.9, cz + (rnd() - 0.5) * D * 0.9, rnd() * 6.28, 0.85 + rnd() * 0.3);
  }
  { const p = PK.mon; for (let k = 0; k < 26; k++) prop(rnd() < 0.6 ? 'pr_grave2' : 'pr_grave1', p.x - 120 + (k % 9) * 2.6, p.z - 95 + Math.floor(k / 9) * 3.2, (rnd() - 0.5) * 0.3, 0.95); } // монастырский погост
  for (const f of FIELDS) { // тыквенные поля — рядами; на пашне — тюки сена
    const c = Math.cos(f.a), s0 = Math.sin(f.a), at = (u, v) => [f.x + u * c - v * s0, f.z + u * s0 + v * c];
    if (f.pumpkin) { for (let u = -f.w / 2 + 3; u < f.w / 2 - 3; u += 2.4) for (let v = -f.d / 2 + 3; v < f.d / 2 - 3; v += 2.0) if (rnd() < 0.42) { const [x, z] = at(u + (rnd() - 0.5), v + (rnd() - 0.5) * 0.8); prop('pr_pumpkin', x, z, rnd() * 6.28, 0.75 + rnd() * 0.6); } }
    else for (let k = 0; k < 14; k++) { const [x, z] = at((rnd() - 0.5) * f.w * 0.8, (rnd() - 0.5) * f.d * 0.8); prop('pr_hay', x, z, f.a + (rnd() - 0.5) * 0.4, 1.4); }
  }
  for (let k = 0; k < 24; k++) { const p = PK.farm, x = p.x + (rnd() - 0.5) * 600, z = p.z + 220 + rnd() * 160; if (!onBld(x, z) && !blocked(x, z, 4)) prop('pr_hay', x, z, rnd() * 6.28, 1.4); } // сено у фермы
  for (let k = 0; k < 7; k++) { const v = PK.vil, a = rnd() * 6.28, r = rnd() * 550, x = v.x + Math.cos(a) * r, z = v.z + Math.sin(a) * r * 0.7; if (!onBld(x, z, 3) && !waterAt(x, z) && !blocked(x, z, 4)) prop('pr_well', x, z, rnd() * 6.28, 0.9); } // колодцы
  for (let k = 0; k < 900; k++) { const x = B0.x + (rnd() - 0.5) * B0.rx * 2, z = B0.z + (rnd() - 0.5) * B0.rz * 2, bd = basinD(x, z); if (bd > 0.97 || blocked(x, z, 8)) continue; prop(rnd() < 0.8 ? 'pr_deadtree' : 'pr_oldtree', x, z, rnd() * 6.28, 0.6 + rnd() * 0.7); } // сухостой в болоте (и в воде)
  { const p = PK.wreck; for (let r = 0; r < 5; r++) for (let k = 0; k < 11; k++) { if (rnd() < 0.15) continue; const x = p.x - 150 + k * 7 + (rnd() - 0.5) * 2, z = p.z + p.hz - 30 - r * 6; prop('c_vaz', x, z, Math.PI / 2 + (rnd() - 0.5) * 0.5 + (rnd() < 0.2 ? Math.PI : 0), 1); } } // кладбище техники: ряды брошенных машин
  const inField = (x, z) => { for (const f of FIELDS) { const c = Math.cos(f.a), s = Math.sin(f.a), dx = x - f.x, dz = z - f.z, u = dx * c + dz * s, v = -dx * s + dz * c; if (Math.abs(u) < f.w / 2 && Math.abs(v) < f.d / 2) return f; } return null; };

  // ── районы: вода, площадки (наша и чужая — «аэродром»), деревня, объекты, лес, луг ──
  const inPad = (p, x, z, pad = 0) => Math.abs(x - p.x) < p.hx + pad && Math.abs(z - p.z) < p.hz + pad;
  const zoneAt = (x, z) => {
    if (waterAt(x, z)) return ZONE.WATER;
    if (inPad(PK.heli, x, z) || inPad(PK.home, x, z)) return ZONE.AIR;
    if (Math.hypot(x - PK.vil.x, z - PK.vil.z) < 700) return ZONE.LOW;
    if (inPad(PK.mon, x, z, 40) || inPad(PK.farm, x, z, 60) || inPad(PK.wreck, x, z, 60) || inPad(PK.peat, x, z, 60)) return ZONE.IND;
    if (inField(x, z)) return ZONE.FIELD;
    const BA = A.BALD; if (Math.hypot(x - BA.x, z - BA.z) < BA.r * 0.8) return ZONE.FIELD; // Лысая гора — голая
    const h = groundH(x, z), s = slopeAt(x, z), bd = basinD(x, z);
    // лес: на склонах и в оврагах (там гуще), пятнами; в болоте — редкие сухостойные рощи на кочках
    const f = fbm(x * 0.0008 + 9.1, z * 0.0008 - 4.2, 4) + 0.12 * smooth(0.08, 0.35, s);
    if (ravineAt(x, z) > 4 && s < 0.9) return ZONE.PARK; // склоны оврагов — в лесу (балки)
    if (bd > 1.1 && s < 0.8 && h > A.Y0 + 8 && f > 0.6) return ZONE.PARK; // перелески на холмах — пятнами
    if (bd <= 1.1 && f > 0.55) return ZONE.PARK; // кочки и острова — берёзы и сухостой
    return ZONE.FIELD;
  };
  const rt = mapRuntime(seed, B, objects, groundH, -1e9, cellMax);
  const HP = PK.heli, HO = PK.home;
  return { ...rt, zoneAt, kind: 'autumn', autumn: A, waterAt, slopeAt, basinD, fields: FIELDS, inField, ravines: RAV.lines, ravineAt, props: PROPS,
    home: { x: HO.x, z: HO.z, y: HO.y }, airport: { x: HP.x, z: HP.z, w: HP.hx * 2, d: HP.hz * 2, rwyL: 0, rwyW: 0, alongZ: true },
    HM, HN: N, HRES: RES, pads: P, roads: ROADS, RX: new Uint8Array(0), RZ: new Uint8Array(0), roadT: () => 0, onRoad: () => false };
}
