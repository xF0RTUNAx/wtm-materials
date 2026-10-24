// Зимняя карта «Мульти-волны» — вымышленная горная долина «Северный рубеж» (не привязана к реальным местам).
// Детерминированный генератор, как buildCity (city.js): тот же интерфейс для симуляции и сервера (topAt, los, raycast,
// objects, B…). Рельеф — сеткой высот 50 м (горы до ~1,6 км; groundH — билинейно, быстро для лучей и ракет).
// Долина с севера на юг: водохранилище за плотиной ГЭС на севере, замёрзшая река, авиабаза посередине, посёлок и
// военный городок, ж/д узел, арсенал в восточном ущелье, РЛС на вершине хребта, озеро на юге. Оси как в city.js: −Z — север.
import { tr } from './i18n.js?v=20261024u';
import { CITY, ZONE, KIND, mulberry32, clamp, smooth, vnoise, mp, mbox, mapRuntime } from './city.js?v=20261024u';

const H = CITY.HALF, RES = 50, N = Math.round(2 * H / RES) + 1; // узлов по стороне
export const WINTER = {
  RES, DAM_Z: -9300, LAKE_N_Y: 0, LAKE_S_Y: 0, LAKE_S: { z: 11300, rx: 2300, rz: 1500 }, RIVER_W: 150, TREELINE: 1050,
  RWY: { dx: 1450, z: -600, L: 3400, W: 60 }, // ВПП вдоль Z, на восточном берегу: x = долина(z) + dx
};
// ось долины (русло реки) и дно долины (на юг чуть ниже)
export function valleyX(z) { return 700 * Math.sin(z * 0.00017 + 0.8) + 300 * Math.sin(z * 0.00049 + 2.3) - 400; }
export const floorY = (z) => 150 - z * 0.004;
// градиентный шум (Перлин) — без квадратных следов, как у шума по значению; таблица перестановок — постоянная
const PERM = (() => { const p = Array.from({ length: 256 }, (_, i) => i), r = mulberry32(1234567); for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } return Uint8Array.from([...p, ...p]); })();
const GR = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
export function perlin(x, z) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, ii = i & 255, jj = j & 255;
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const g = (a, b, dx, dz) => { const h = GR[PERM[PERM[a] + b] & 7]; return h[0] * dx + h[1] * dz; };
  const n00 = g(ii, jj, fx, fz), n10 = g(ii + 1, jj, fx - 1, fz), n01 = g(ii, jj + 1, fx, fz - 1), n11 = g(ii + 1, jj + 1, fx - 1, fz - 1);
  return (n00 + (n10 - n00) * u) * (1 - v) + (n01 + (n11 - n01) * u) * v; // ≈ −0,7…0,7
}
export const fbm = (x, z, oct = 4) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += a * perlin(x * f + i * 7.3, z * f - i * 3.1); f *= 2.03; a *= 0.5; } return 0.5 + s; };
// хребты: острые гребни (1 − |шум|), мелкие октавы слабее на склонах — как размытые эрозией
export const ridged = (x, z, oct = 6) => { let s = 0, a = 0.5, f = 1, w = 1, tot = 0; for (let i = 0; i < oct; i++) { let n = 1 - Math.abs(perlin(x * f + i * 11.7, z * f + i * 5.9) * 1.4); n = n * n * w; w = clamp(n * 1.8, 0, 1); s += a * n; tot += a; f *= 2.07; a *= 0.5; } return s / tot; };

// высота «природы» без площадок (горы, долина, ущелье); координаты гор — с искажением (хребты извилистые)
function natural(x, z) {
  const vx = valleyX(z), dv = Math.abs(x - vx);
  const W = 2300 + 600 * perlin(z * 0.00035, 3.3) + 2600 * smooth(6000, 11500, z) + 500 * perlin(x * 0.0004, z * 0.0004); // на юге долина шире — котловина с озером
  let m = Math.pow(smooth(W * 0.4, W * 1.7, dv), 1.15);
  // восточное ущелье (арсенал): от долины на восток у z ≈ 5500
  const gz = 5500 + 600 * Math.sin(x * 0.0004), gk = smooth(vx + 600, vx + 1800, x) * (1 - smooth(9000, 13000, x - vx));
  m *= 1 - gk * (1 - smooth(300, 1200, Math.abs(z - gz)));
  const wx = x + 1100 * perlin(x * 0.00012 + 4.2, z * 0.00012), wz = z + 1100 * perlin(x * 0.00012, z * 0.00012 + 8.7);
  const r = ridged(wx * 0.00016 + 3.1, wz * 0.00016 + 1.7);
  const peaks = 260 + 1500 * Math.pow(r, 1.6);
  let h = floorY(z) + 30 * (fbm(x * 0.0008, z * 0.0008) - 0.5) + m * peaks + (1 - m) * 60 * Math.pow(fbm(x * 0.0005 + 2, z * 0.0005), 2);
  // русло реки: пологая пойма (~250 м) к уровню льда, без ступени у берега
  if (z > WINTER.DAM_Z - 400) h += (floorY(z) - 6 - h) * (1 - smooth(WINTER.RIVER_W * 0.5, WINTER.RIVER_W * 0.5 + 260, dv)) * smooth(WINTER.DAM_Z - 400, WINTER.DAM_Z, z);
  return h;
}
// ровные площадки: [cx, cz, полуширина x, полудлина z, запас] → к своей высоте
// Объекты разнесены по карте (у каждого — свой подход и своя оборона): север — ГЭС на плотине, северо-запад — ж/д узел,
// северо-восток — РЛС на вершине хребта, запад — командный пункт в высокогорной котловине за хребтом, центр — авиабаза,
// восток — арсенал в глубине ущелья, юг — склад ГСМ у озера, юго-запад — посёлок и военный городок
function pads() {
  const R = WINTER.RWY, rz = R.z, rx = valleyX(rz) + R.dx, LS = WINTER.LAKE_S;
  return [
    { x: rx + 120, z: rz, hx: 580, hz: R.L / 2 + 250, m: 450 },                      // 0 ВПП, перроны, стоянки, казармы
    { x: valleyX(6900) - 1700, z: 6900, hx: 700, hz: 700, m: 450, k: 0.85 },        // 1 посёлок (юго-запад)
    { x: valleyX(-6300) - 1150, z: -6300, hx: 170, hz: 1700, m: 300 },               // 2 ж/д узел (северо-запад, вдоль долины)
    { x: valleyX(5500) + 7600, z: 5500, hx: 440, hz: 280, m: 300 },                  // 3 арсенал в глубине ущелья (восток)
    { x: valleyX(LS.z) + 2000, z: LS.z - 2300, hx: 380, hz: 300, m: 350 },          // 4 склад ГСМ у озера (юг)
    { x: valleyX(-1500) - 8200, z: -1500, hx: 280, hz: 250, m: 420 },                // 5 командный пункт в котловине (запад)
  ];
}
// двоичная куча для поиска пути (A*)
export function heap() {
  const k = [], v = [];
  return { get size() { return k.length; },
    push(key, val) { let i = k.length; k.push(key); v.push(val); while (i) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; } k[i] = key; v[i] = val; },
    pop() { const top = v[0], lk = k.pop(), lv = v.pop(), n = k.length; if (n) { let i = 0; for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && k[c + 1] < k[c]) c++; if (k[c] >= lk) break; k[i] = k[c]; v[i] = v[c]; i = c; } k[i] = lk; v[i] = lv; } return top; } };
}

export function buildWinter(seed = 1) {
  const rnd = mulberry32((seed * 2654435761 + 977) >>> 0);
  // ── сетка высот ──
  const HM = new Float32Array(N * N), ICE = new Uint8Array(N * N), P = pads();
  const LS = WINTER.LAKE_S, lsx = valleyX(LS.z) + 700, lakeSY = floorY(LS.z) - 3;
  const lakeNY = floorY(WINTER.DAM_Z) + 55; WINTER.LAKE_N_Y = lakeNY; WINTER.LAKE_S_Y = lakeSY;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = -H + i * RES, z = -H + j * RES; let h = natural(x, z), ice = 0;
    // озеро на юге: котловина — высота над уровнем льда плавно сходит к нулю к берегу (без уступа), берег неровный (заливы, мысы)
    const le = Math.hypot((x - lsx) / LS.rx, (z - LS.z) / LS.rz);
    if (le < 2.4 && h > lakeSY) h = Math.max(lakeSY + 2.5 + 30 * smooth(0.95, 1.5, le), lakeSY + (h - lakeSY) * Math.pow(smooth(0.85, 2.4, le), 1.4)); // берег на 2+ м выше льда
    if (le < 1 + 0.45 * perlin(x * 0.0011, z * 0.0011) + 0.15 * perlin(x * 0.004, z * 0.004)) { h = lakeSY; ice = 1; }
    // река: лёд в русле от плотины до озера
    if (z > WINTER.DAM_Z && z < LS.z && Math.abs(x - valleyX(z)) < WINTER.RIVER_W / 2) { h = Math.min(h, Math.max(floorY(z) - 6, lakeSY)); ice = 1; } // у устья — вровень с озером
    HM[j * N + i] = h; ICE[j * N + i] = ice;
  }
  // сглаживание обрывов: крутые места (уклон > ~30°) размываются, пологие и лёд — как были; гребни скругляются
  { const T = new Float32Array(N * N);
    for (let it = 0; it < 5; it++) {
      T.set(HM);
      for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
        const q = j * N + i; if (ICE[q]) continue;
        const s = Math.hypot(T[q + 1] - T[q - 1], T[q + N] - T[q - N]) / (2 * RES), w = smooth(0.7, 1.4, s) * 0.85;
        if (w <= 0) continue;
        const b = (4 * T[q] + 2 * (T[q - 1] + T[q + 1] + T[q - N] + T[q + N]) + T[q - N - 1] + T[q - N + 1] + T[q + N - 1] + T[q + N + 1]) / 16;
        HM[q] = T[q] + (b - T[q]) * w;
      }
    }
  }
  // водохранилище за плотиной: всё ниже уровня — лёд
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const z = -H + j * RES, q = j * N + i; if (z < WINTER.DAM_Z && HM[q] < lakeNY) { HM[q] = lakeNY; ICE[q] = 1; } }
  const node = (x, z) => [Math.round(clamp((x + H) / RES, 0, N - 1)), Math.round(clamp((z + H) / RES, 0, N - 1))];
  // ровные площадки: высота — средняя по площадке (выемка и насыпь поровну), откосы — пологие (ширина по перепаду, до 1,2 км)
  const flatten = (p) => {
    const [i0, j0] = node(p.x - p.hx, p.z - p.hz), [i1, j1] = node(p.x + p.hx, p.z + p.hz); let s = 0, c = 0;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { s += HM[j * N + i]; c++; }
    p.y = s / c;
    let dh = 0; const r0 = p.m;
    for (let a = 0; a < 6.283; a += 0.2) { const ex = p.x + Math.cos(a) * (p.hx + r0), ez = p.z + Math.sin(a) * (p.hz + r0), [i, j] = node(ex, ez); if (!ICE[j * N + i]) dh = Math.max(dh, Math.abs(HM[j * N + i] - p.y)); }
    const m = clamp(dh * 3.5, p.m, 1200); p.mm = m;
    const [a0, b0] = node(p.x - p.hx - m, p.z - p.hz - m), [a1, b1] = node(p.x + p.hx + m, p.z + p.hz + m);
    for (let j = b0; j <= b1; j++) for (let i = a0; i <= a1; i++) {
      const q = j * N + i; if (ICE[q]) continue;
      const x = -H + i * RES, z = -H + j * RES, ex = Math.max(0, Math.abs(x - p.x) - p.hx), ez = Math.max(0, Math.abs(z - p.z) - p.hz), e = Math.hypot(ex, ez);
      if (e < m) HM[q] += (p.y - HM[q]) * (1 - smooth(0, m, e)) * (p.k || 1);
    }
  };
  for (const p of P) flatten(p);

  // ── дороги: путь по сетке 100 м с ценой за уклон (A*) — идут долинами и по склону серпантином, не лезут на обрывы;
  // мосты через лёд — дорого (короткие переходы). Потом сглаживание кривой, ровный продольный профиль и врезка в склон ──
  const RD = 2 * RES, GN = Math.floor((N - 1) / 2) + 1, gi = (x) => Math.round(clamp((x + H) / RD, 1, GN - 2));
  const hN = (n) => HM[(Math.floor(n / GN) * 2) * N + (n % GN) * 2], iN = (n) => ICE[(Math.floor(n / GN) * 2) * N + (n % GN) * 2];
  const sN = new Float32Array(GN * GN);
  for (let j = 1; j < GN - 1; j++) for (let i = 1; i < GN - 1; i++) { const n = j * GN + i; sN[n] = Math.hypot(hN(n + 1) - hN(n - 1), hN(n + GN) - hN(n - GN)) / (2 * RD); }
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const route = (ax, az, bx, bz, src = null) => { // src — точки уже проложенной дороги: ответвление начнётся с лучшей из них
    const st = gi(az) * GN + gi(ax), goal = gi(bz) * GN + gi(bx), gx = goal % GN, gz = Math.floor(goal / GN);
    const g = new Float32Array(GN * GN).fill(Infinity), from = new Int32Array(GN * GN).fill(-1), done = new Uint8Array(GN * GN), q = heap();
    g[st] = 0; q.push(0, st);
    if (src) for (const [x, z] of src) { const n = gi(z) * GN + gi(x); g[n] = 0; q.push(0, n); }
    while (q.size) {
      const n = q.pop(); if (done[n]) continue; done[n] = 1; if (n === goal) break;
      const ni = n % GN, nj = Math.floor(n / GN);
      for (const [di, dj] of DIRS) {
        const mi = ni + di, mj = nj + dj; if (mi < 12 || mj < 12 || mi > GN - 13 || mj > GN - 13) continue; // не у края карты
        const m = mj * GN + mi; if (done[m]) continue;
        const len = RD * (di && dj ? Math.SQRT2 : 1), gr = Math.abs(hN(m) - hN(n)) / len;
        const c = len * (1 + 15 * gr + 2000 * Math.max(0, gr - 0.12) ** 2 + 3 * Math.max(0, sN[m] - 0.35) + (iN(m) ? 6 : 0));
        if (g[n] + c < g[m]) { g[m] = g[n] + c; from[m] = n; q.push(g[m] + Math.hypot(mi - gx, mj - gz) * RD, m); }
      }
    }
    const pts = []; for (let n = goal; n >= 0; n = from[n]) pts.push([-H + (n % GN) * RD, -H + Math.floor(n / GN) * RD]);
    pts.reverse(); if (!src) pts[0] = [ax, az]; pts[pts.length - 1] = [bx, bz];
    // сглаживание углов (Шайкин), потом шаг ~25 м
    let p = pts; for (let it = 0; it < 3; it++) { const o = [p[0]]; for (let k = 0; k < p.length - 1; k++) { const [x0, z0] = p[k], [x1, z1] = p[k + 1]; o.push([x0 * 0.75 + x1 * 0.25, z0 * 0.75 + z1 * 0.25], [x0 * 0.25 + x1 * 0.75, z0 * 0.25 + z1 * 0.75]); } o.push(p[p.length - 1]); p = o; }
    const out = [p[0]]; let acc = 0;
    for (let k = 1; k < p.length; k++) { acc += Math.hypot(p[k][0] - p[k - 1][0], p[k][1] - p[k - 1][1]); if (acc >= 25 || k === p.length - 1) { out.push(p[k]); acc = 0; } }
    return out;
  };
  const nearestOn = (pts, x, z) => pts.reduce((b, p) => (Math.hypot(p[0] - x, p[1] - z) < Math.hypot(b[0] - x, b[1] - z) ? p : b), pts[0]);
  const ROADS = [], R = WINTER.RWY, rwx = valleyX(R.z) + R.dx;
  { const p2 = P[2], p1 = P[1], p0 = P[0], p3 = P[3], p4 = P[4], p5 = P[5];
    const main = route(p2.x, p2.z - p2.hz, p1.x, p1.z); ROADS.push({ w: 9, pts: main });                       // главная: ж/д узел → посёлок
    const toB = [p0.x - p0.hx, R.z + 300], s1 = nearestOn(main, ...toB); ROADS.push({ w: 8, pts: route(s1[0], s1[1], ...toB, main) }); // к авиабазе (мост)
    const toC = [p5.x + p5.hx, p5.z], s2 = nearestOn(main, ...toC); ROADS.push({ w: 6, pts: route(s2[0], s2[1], ...toC, main) });     // в гору к командному пункту
    ROADS.push({ w: 6, pts: route(p0.x + p0.hx * 0.6, p0.z + p0.hz, p3.x - p3.hx, p3.z) });                // от базы в ущелье к арсеналу
    ROADS.push({ w: 7, pts: route(p1.x + p1.hx * 0.5, p1.z + p1.hz * 0.5, p4.x - p4.hx, p4.z) });          // от посёлка к складу ГСМ
    const dz = WINTER.DAM_Z + 260; ROADS.push({ w: 6, pts: route(main[0][0], main[0][1], valleyX(dz) - 140, dz) }); // к ГЭС
  }
  // врезка: продольный профиль сглажен (≈ ±150 м), поперёк дороги — ровно, откосы ~80 м; лёд (мосты) не трогаем
  { const CW = new Float32Array(N * N), CT = new Float32Array(N * N);
    for (const r of ROADS) {
      const pr = r.pts.map(([x, z]) => groundAt(x, z));
      for (let it = 0; it < 6; it++) { const t = pr.slice(); for (let k = 0; k < pr.length; k++) { let s = 0, c = 0; for (let d = -5; d <= 5; d++) { const v = t[k + d]; if (v !== undefined) { s += v; c++; } } pr[k] = s / c; } }
      for (let k = 0; k < r.pts.length - 1; k++) {
        const [ax, az] = r.pts[k], [bx, bz] = r.pts[k + 1], L2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1, rr = r.w / 2 + 90;
        const [i0, j0] = node(Math.min(ax, bx) - rr, Math.min(az, bz) - rr), [i1, j1] = node(Math.max(ax, bx) + rr, Math.max(az, bz) + rr);
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const x = -H + i * RES, z = -H + j * RES, t = clamp(((x - ax) * (bx - ax) + (z - az) * (bz - az)) / L2, 0, 1);
          const d = Math.hypot(x - ax - (bx - ax) * t, z - az - (bz - az) * t), w = 1 - smooth(r.w / 2 + 12, rr, d), q = j * N + i;
          if (w > CW[q]) { CW[q] = w; CT[q] = pr[k] + (pr[k + 1] - pr[k]) * t; }
        }
      }
    }
    for (let q = 0; q < N * N; q++) if (CW[q] > 0 && !ICE[q]) HM[q] += (CT[q] - HM[q]) * CW[q];
  }
  function groundAt(x, z) {
    const fx = clamp((x + H) / RES, 0, N - 1.001), fz = clamp((z + H) / RES, 0, N - 1.001), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, q = j * N + i;
    return (HM[q] * (1 - u) + HM[q + 1] * u) * (1 - v) + (HM[q + N] * (1 - u) + HM[q + N + 1] * u) * v;
  }
  const groundH = groundAt;
  const iceAt = (x, z) => { const i = Math.round(clamp((x + H) / RES, 0, N - 1)), j = Math.round(clamp((z + H) / RES, 0, N - 1)); return ICE[j * N + i] === 1; };
  const slopeAt = (x, z) => { const e = RES; return Math.hypot(groundH(x + e, z) - groundH(x - e, z), groundH(x, z + e) - groundH(x, z - e)) / (2 * e); };
  // наибольшая высота в ячейке (по узлам сетки, с краями) — для грубой сетки прямой видимости
  const cellMax = (x0, z0, x1, z1) => {
    let m = -1e9; const i0 = Math.max(0, Math.floor((x0 + H) / RES)), i1 = Math.min(N - 1, Math.ceil((x1 + H) / RES)), j0 = Math.max(0, Math.floor((z0 + H) / RES)), j1 = Math.min(N - 1, Math.ceil((z1 + H) / RES));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) m = Math.max(m, HM[j * N + i]);
    return m;
  };

  // ── объекты-цели (модели — те же постройки, что в городе) ──
  const O = [];
  const add = (o) => { O.push(Object.assign({ id: O.length, value: 100, hp: 100 }, o)); };
  { // авиабаза: ангары-укрытия вдоль перрона, большие ангары, цистерны, вышка
    const x = rwx + 260, z = R.z, M = [];
    for (let k = -2; k <= 2; k++) M.push(mp('obj_hangar', x, z + k * 260, 1, 0.75));
    M.push(mp('obj_jhangar', x + 70, z - 800, 0), mp('obj_jhangar', x + 70, z + 820, 0), mp('obj_rtank', x + 160, z + 1200), mp('obj_rtank', x + 180, z + 1200), mp('obj_milbase', x + 150, z - 1250));
    add({ key: 'w_air', name: tr('Авиабаза'), x, z, w: 420, d: 2700, value: 170, hp: 240, models: M, parts: [...M.map(mbox), { t: 'cyl', x: x + 120, z: z + 40, r: 6, h: 32 }],
      zones: [{ t: 'box', x: rwx, z: R.z, w: R.W, d: R.L, h: 1, k: 0.7 }] }); // ВПП — зона урона (sim/strike.js blast), как у городского аэродрома
  }
  { const p = P[4], M = []; // склад ГСМ
    for (let a = -1; a <= 1; a++) for (const b of [-1, 1]) M.push(mp('obj_tanks', p.x + a * 75, p.z + b * 60));
    M.push(mp('obj_tank4', p.x + 190, p.z, 1), mp('obj_rtank', p.x - 190, p.z - 20), mp('obj_rtank', p.x - 190, p.z + 20));
    add({ key: 'w_fuel', name: tr('Склад ГСМ'), x: p.x, z: p.z, w: 520, d: 380, value: 160, hp: 200, models: M, parts: M.map(mbox) }); }
  { const p = P[3], M = [mp('obj_hangar', p.x - 160, p.z, 0, 0.8), mp('obj_hangar', p.x, p.z, 0, 0.8), mp('obj_hangar', p.x + 160, p.z, 0, 0.8), mp('obj_milbase', p.x, p.z + 150)]; // арсенал
    for (let k = 0; k < 4; k++) M.push(mp('obj_cont', p.x - 150 + k * 100, p.z - 140));
    add({ key: 'w_ammo', name: tr('Арсенал в ущелье'), x: p.x, z: p.z, w: 520, d: 380, value: 180, hp: 220, models: M, parts: M.map(mbox) }); }
  { const p = P[5], M = [mp('obj_milbase', p.x, p.z, 0, 2), mp('obj_oldind', p.x - 70, p.z + 20, 1), mp('obj_cont', p.x + 70, p.z + 40)]; // командный пункт
    add({ key: 'w_cp', name: tr('Командный пункт'), x: p.x, z: p.z, w: 260, d: 200, value: 160, hp: 260, models: M,
      parts: [...M.map(mbox), { t: 'cyl', x: p.x - 40, z: p.z - 60, r: 1, h: 45 }, { t: 'cyl', x: p.x + 45, z: p.z - 60, r: 1, h: 38 }] }); }
  { // РЛС на вершине восточного хребта: самая высокая точка в круге
    let bx = 0, bz = 0, bh = -1e9; const cx = valleyX(-6500) + 6200, cz = -6500; // северо-восточный хребет
    for (let a = 0; a < 2000; a += 100) for (let t = 0; t < 6.283; t += 0.25) { const x = cx + Math.cos(t) * a, z = cz + Math.sin(t) * a, h = groundH(x, z); if (h > bh) { bh = h; bx = x; bz = z; } }
    { // площадка на вершине: срезана на 8 м, плечи — пологие (антенны и укрытия не висят над склоном)
      const [ci, cj] = node(bx, bz), y = bh - 8; bh = y;
      for (let j = cj - 6; j <= cj + 6; j++) for (let i = ci - 6; i <= ci + 6; i++) { const d = Math.hypot(i - ci, j - cj) * RES; if (d < 300) HM[j * N + i] += (y - HM[j * N + i]) * (1 - smooth(80, 300, d)); }
    }
    add({ key: 'w_radar', name: tr('РЛС на вершине'), x: bx, z: bz, w: 120, d: 100, value: 150, hp: 160, peak: true,
      parts: [{ t: 'cyl', x: bx, z: bz, r: 9, h: 18 }, { t: 'cyl', x: bx + 40, z: bz + 10, r: 7, h: 14 }, { t: 'box', x: bx - 35, z: bz - 20, w: 24, d: 12, h: 6 }, { t: 'cyl', x: bx - 10, z: bz + 35, r: 1.2, h: 40 }] }); }
  { // ГЭС: стена плотины поперёк долины и машинный зал ниже
    const z = WINTER.DAM_Z, vx = valleyX(z); let l = 0, r = 0;
    while (l < 6000 && groundH(vx - l, z + 40) < lakeNY + 4) l += 25; while (r < 6000 && groundH(vx + r, z + 40) < lakeNY + 4) r += 25; // стена — от склона до склона
    const x0 = vx - l, x1 = vx + r, cx = (x0 + x1) / 2, top = lakeNY + 5, base = floorY(z) - 6;
    const M = [mp('obj_factory', valleyX(z + 260), z + 260, 0, 0.9)];
    add({ key: 'w_dam', name: tr('ГЭС на плотине'), x: cx, z: z + 100, w: x1 - x0 + 40, d: 360, value: 190, hp: 300, dam: true, models: M,
      parts: [{ t: 'box', x: cx, z, w: x1 - x0 + 40, d: 34, h: top - base, y0: base }, ...M.map(mbox)] }); }
  { const p = P[2], M = []; // ж/д узел: склады и ряды вагонов-контейнеров
    for (let k = -3; k <= 3; k++) M.push(mp('obj_cont', p.x - 40, p.z + k * 260, 1), mp('obj_cont', p.x + 40, p.z + k * 260 + 120, 1));
    M.push(mp('obj_oldind', p.x, p.z - 1200), mp('obj_oldind', p.x, p.z + 1250));
    add({ key: 'w_rail', name: tr('Железнодорожный узел'), x: p.x, z: p.z, w: 220, d: 3000, value: 120, hp: 180, models: M, parts: M.map(mbox) }); }
  { const p = P[1], x = p.x + 520, z = p.z + 380, M = [mp('obj_milbase', x, z), mp('obj_milbase', x + 70, z + 60), mp('obj_milbase', x - 70, z + 60), mp('obj_cont', x, z + 120)]; // военный городок
    add({ key: 'w_garr', name: tr('Военный городок'), x, z: z + 50, w: 260, d: 240, value: 110, hp: 160, models: M, parts: M.map(mbox) }); }
  const objects = O;
  const keep = objects.map((o) => ({ x0: o.x - o.w / 2 - 40, x1: o.x + o.w / 2 + 40, z0: o.z - o.d / 2 - 40, z1: o.z + o.d / 2 + 40 }));
  const blocked = (x, z, r) => keep.some((k) => x + r > k.x0 && x - r < k.x1 && z + r > k.z0 && z - r < k.z1);

  // ── постройки: посёлок (частные дома, пятиэтажки), казармы у базы, будки у полосы ──
  let cap = 3000, n = 0;
  const BX = new Float32Array(cap), BZ = new Float32Array(cap), BW = new Float32Array(cap), BD = new Float32Array(cap), BH = new Float32Array(cap), BY = new Float32Array(cap), BK = new Uint8Array(cap), BC = new Float32Array(cap);
  const put = (x, z, w, d, h, k) => { if (n >= cap || blocked(x, z, Math.max(w, d) / 2) || iceAt(x, z)) return; BX[n] = x; BZ[n] = z; BW[n] = w; BD[n] = d; BH[n] = h; BK[n] = k; BY[n] = 0; BC[n] = rnd(); n++; };
  { // посёлок: улицы лучами от центра (с изгибом), дома по обе стороны с разным шагом и отступом; у главной улицы — пятиэтажки
    const p = P[1], nS = 5 + Math.floor(rnd() * 2), a0 = rnd() * 6.283;
    for (let k = 0; k < nS; k++) {
      let a = a0 + k * 6.283 / nS + (rnd() - 0.5) * 0.5, x = p.x, z = p.z; const L = 450 + rnd() * 350, main = k === 0, st = [[x, z]]; ROADS.push({ w: main ? 9 : 6, pts: st });
      for (let t = 30; t < L; t += 24 + rnd() * 16) {
        a += (rnd() - 0.5) * 0.12; x += Math.cos(a) * 30; z += Math.sin(a) * 30; // улица слегка петляет
        st.push([x, z]);
        for (const sd of [-1, 1]) {
          if (rnd() < 0.22) continue;
          const off = 15 + rnd() * 9, hx = x - Math.sin(a) * off * sd, hz = z + Math.cos(a) * off * sd;
          if (main && t < 260 && rnd() < 0.6) put(hx, hz, Math.abs(Math.cos(a)) > 0.7 ? 46 : 13, Math.abs(Math.cos(a)) > 0.7 ? 13 : 46, 15.5, KIND.PANEL);
          else put(hx, hz, 9 + rnd() * 5, 8 + rnd() * 5, 5 + rnd() * 2.5, KIND.HOUSE);
        }
      }
    }
  }
  for (let k = 0; k < 14; k++) put(rwx + 520 + (k % 2) * 60, R.z - 900 + k * 130, 18, 50, 8, KIND.PLAIN); // казармы и склады у перрона
  const B = { n, x: BX.subarray(0, n), z: BZ.subarray(0, n), w: BW.subarray(0, n), d: BD.subarray(0, n), h: BH.subarray(0, n), y0: BY.subarray(0, n), k: BK.subarray(0, n), c: BC.subarray(0, n) };

  // ── районы (для отрисовки и леса): лёд, аэродром, посёлок, промзона (склады, узел), лес, открытый снег ──
  const inPad = (p, x, z, pad = 0) => Math.abs(x - p.x) < p.hx + pad && Math.abs(z - p.z) < p.hz + pad;
  const zoneAt = (x, z) => {
    if (iceAt(x, z)) return ZONE.WATER;
    if (inPad(P[0], x, z)) return ZONE.AIR;
    if (Math.hypot(x - P[1].x, z - P[1].z) < 700) return ZONE.LOW;
    if (inPad(P[2], x, z, 60) || inPad(P[3], x, z, 80) || inPad(P[4], x, z, 80) || inPad(P[5], x, z, 60)) return ZONE.IND;
    const h = groundH(x, z), s = slopeAt(x, z);
    // ельник: ниже границы леса, не на крутых склонах, пятнами (по шуму), гуще на склонах долины
    if (h < WINTER.TREELINE - 140 * fbm(x * 0.002, z * 0.002, 2) && s < 0.7 && fbm(x * 0.0009 + 9.1, z * 0.0009 - 4.2, 4) + 0.12 * smooth(0.08, 0.35, s) > 0.5) return ZONE.PARK;
    return ZONE.FIELD;
  };
  const rt = mapRuntime(seed, B, objects, groundH, -1e9, cellMax);
  return { ...rt, zoneAt, kind: 'winter', winter: WINTER, iceAt, slopeAt, valleyX, airport: { x: rwx, z: R.z, w: 500, d: R.L + 400, rwyL: R.L, rwyW: R.W, alongZ: true },
    HM, HN: N, HRES: RES, pads: P, roads: ROADS, RX: new Uint8Array(0), RZ: new Uint8Array(0), roadT: () => 0, onRoad: () => false };
}
