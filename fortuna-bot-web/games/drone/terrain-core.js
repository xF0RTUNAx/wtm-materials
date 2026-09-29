// Рельеф «Симулятора Летки» — чистые функции без three.js: ими пользуются игра (высота земли, столкновения)
// и фоновый поток (terrain-worker.js), который строит сетки участков рельефа, не мешая кадру.
export const WORLD = { R: 12000, SIZE: 34000, WATER_Y: 60, CEIL: 14000 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth01 = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Города и аэродром — ровные площадки (позиции постоянные, застройка — по seed)
export const TOWNS = [{ x: -3500, z: -2500, r: 950 }, { x: 4200, z: -4800, r: 900 }, { x: 5200, z: 2600, r: 850 }, { x: -5200, z: 4500, r: 900 }];
export const AIRFIELD = { x: -2600, z: 8200, r: 1700 };
function riverX(z) { return 2200 * Math.sin(z * 0.00022 + 1.1) + 900 * Math.sin(z * 0.00061); }
function baseH(x, z) {
  const r = Math.hypot(x, z);
  let h = 200 + 220 * Math.sin(x * 0.00031 + 0.7) * Math.cos(z * 0.00027) + 120 * Math.sin(x * 0.00071 + 1.3) * Math.sin(z * 0.00063 + 0.4)
    + 45 * Math.sin(x * 0.0019) * Math.cos(z * 0.0017 + 1) + 14 * Math.sin(x * 0.0053 + z * 0.0041);
  h += Math.pow(smooth01(11000, 16500, r), 1.4) * 1700 * (0.75 + 0.25 * Math.sin(Math.atan2(z, x) * 6 + 1.3));
  const dr = x - riverX(z);
  h -= 190 * Math.exp(-(dr * dr) / (2 * 340 * 340)) * (1 - smooth01(9000, 12000, r));
  return h;
}
const FLATS = [...TOWNS, AIRFIELD].map((f) => ({ ...f, h: Math.max(WORLD.WATER_Y + 25, baseH(f.x, f.z)) }));
export function terrainH(x, z) {
  let h = baseH(x, z);
  for (const f of FLATS) {
    const dx = x - f.x, dz = z - f.z;
    if (Math.abs(dx) > f.r || Math.abs(dz) > f.r) continue;
    const d = Math.hypot(dx, dz);
    if (d < f.r) h += (f.h - h) * (1 - smooth01(f.r * 0.55, f.r, d));
  }
  return h;
}
export function airfieldH() { return FLATS[FLATS.length - 1].h; }

// ── сетка участка рельефа: позиции (с «юбкой» по краю), нормали по функции высоты, цвета в линейном пространстве ──
const hsh2 = (x, z) => { const v = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return v - Math.floor(v); };
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
function groundColor(x, y, z, ny, out, o) {
  const j = (hsh2(x, z) - 0.5) * 0.05;
  const field = Math.sin(x * 0.0021 + Math.sin(z * 0.0013) * 2) * Math.sin(z * 0.0019 + 0.5);
  const forest = Math.sin(x * 0.0009 + 2) * Math.cos(z * 0.0011) + 0.4 * Math.sin(x * 0.0031 + z * 0.0027);
  const town = TOWNS.some((t) => Math.abs(x - t.x) < t.r && Math.hypot(x - t.x, z - t.z) < t.r * 0.8);
  let r, g, b;
  if (y < WORLD.WATER_Y + 12) { r = 0.72 + j; g = 0.66 + j; b = 0.48 + j; }
  else if (y > 1450) { r = 0.94; g = 0.95; b = 0.97; }
  else if (ny < 0.78 || y > 1050) { r = 0.47 + j; g = 0.45 + j; b = 0.42 + j; }
  else if (town) { r = 0.5 + j; g = 0.5 + j; b = 0.46 + j; }
  else if (forest > 0.55) { r = 0.17 + j; g = 0.33 + j; b = 0.15 + j; }
  else if (field > 0.45) { r = 0.66 + j; g = 0.6 + j; b = 0.32 + j; }
  else if (field < -0.5) { r = 0.42 + j; g = 0.52 + j; b = 0.24 + j; }
  else { r = 0.32 + j; g = 0.5 + j; b = 0.24 + j; }
  out[o] = toLin(r); out[o + 1] = toLin(g); out[o + 2] = toLin(b);
}
export function buildChunkArrays(x0, z0, size, seg, skirt) {
  const step = size / seg, n = seg + 3, e = Math.max(step, 12);
  const pos = new Float32Array(n * n * 3), nor = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3);
  let k = 0, lo = 1e9, hi = -1e9;
  for (let j = -1; j <= seg + 1; j++) for (let i = -1; i <= seg + 1; i++, k++) {
    const ii = Math.min(Math.max(i, 0), seg), jj = Math.min(Math.max(j, 0), seg), x = x0 + ii * step, z = z0 + jj * step, y = terrainH(x, z);
    const hx = terrainH(x + e, z) - terrainH(x - e, z), hz = terrainH(x, z + e) - terrainH(x, z - e), nl = Math.hypot(hx, 2 * e, hz);
    pos[k * 3] = x; pos[k * 3 + 1] = y - (i !== ii || j !== jj ? skirt : 0); pos[k * 3 + 2] = z;
    nor[k * 3] = -hx / nl; nor[k * 3 + 1] = 2 * e / nl; nor[k * 3 + 2] = -hz / nl;
    groundColor(x, y, z, 2 * e / nl, col, k * 3);
    lo = Math.min(lo, y); hi = Math.max(hi, y);
  }
  const idx = new Uint16Array((n - 1) * (n - 1) * 6); let o = 0;
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) { const a = j * n + i, b = a + 1, c = a + n, d = c + 1; idx[o++] = a; idx[o++] = c; idx[o++] = b; idx[o++] = b; idx[o++] = c; idx[o++] = d; }
  return { pos, nor, col, idx, lo, hi };
}
