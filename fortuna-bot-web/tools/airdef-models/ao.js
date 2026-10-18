// Затенение в стыках (ambient occlusion) для готовых моделей игры: от каждой вершины — лучи по полусфере вокруг нормали,
// доля упёршихся в саму модель ближе maxD (с весом по расстоянию) → темнее. Пишет COLOR_0 (байты, VEC4: rgb = затенение)
// прямо в games/airdef/models/<имя>.glb; models.js включает цвет вершин, если он есть. Повторный запуск — пересчёт.
//   deno run -A tools/airdef-models/ao.js s400 su30 …   (или: all; --dry — без записи, только числа)
// Сила и дальность — от размера модели: maxD = 12 % диагонали габаритов (не меньше 0,4 м), 32 луча; открытость делится на 80-й процентиль и возводится в степень 1,8, итог не темнее 0,3.
import { readGlb, accessor } from './glb.js';

const DIR = new URL('../../games/airdef/models/', import.meta.url).pathname;
const RAYS = 32, MIN_AO = 0.3;

// ── BVH по треугольникам (медианное деление по длинной оси) ──
function buildBVH(P, T) { // P — позиции (xyz подряд), T — индексы треугольников (по 3)
  const n = T.length / 3, cen = new Float32Array(n * 3), order = new Uint32Array(n);
  for (let i = 0; i < n; i++) { order[i] = i; for (let d = 0; d < 3; d++) cen[i * 3 + d] = (P[T[i * 3] * 3 + d] + P[T[i * 3 + 1] * 3 + d] + P[T[i * 3 + 2] * 3 + d]) / 3; }
  const nodes = []; // { mn, mx, l, r, s, c } — лист: s (начало в order), c (число)
  const box = (s, c) => { const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (let k = s; k < s + c; k++) { const t = order[k]; for (let v = 0; v < 3; v++) { const p = T[t * 3 + v] * 3; for (let d = 0; d < 3; d++) { mn[d] = Math.min(mn[d], P[p + d]); mx[d] = Math.max(mx[d], P[p + d]); } } } return { mn, mx }; };
  const build = (s, c) => {
    const nd = { ...box(s, c) }; nodes.push(nd);
    if (c <= 6) { nd.s = s; nd.c = c; return nd; }
    const ext = [0, 1, 2].map((d) => nd.mx[d] - nd.mn[d]), ax = ext.indexOf(Math.max(...ext));
    const part = Array.from(order.subarray(s, s + c)).sort((a, b) => cen[a * 3 + ax] - cen[b * 3 + ax]); order.set(part, s);
    const h = c >> 1; nd.l = build(s, h); nd.r = build(s + h, c - h); return nd;
  };
  return { root: build(0, n), order };
}
function hitBox(nd, o, inv, tMax) {
  let t0 = 0, t1 = tMax;
  for (let d = 0; d < 3; d++) { let a = (nd.mn[d] - o[d]) * inv[d], b = (nd.mx[d] - o[d]) * inv[d]; if (a > b) { const x = a; a = b; b = x; } t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return false; }
  return true;
}
function rayHit(B, P, T, o, dir, tMax) { // ближайшее пересечение (Мёллер — Трумбор), иначе −1
  const inv = [1 / dir[0], 1 / dir[1], 1 / dir[2]]; let best = -1; const st = [B.root];
  while (st.length) {
    const nd = st.pop(); if (!hitBox(nd, o, inv, best > 0 ? best : tMax)) continue;
    if (nd.c === undefined) { st.push(nd.l, nd.r); continue; }
    for (let k = nd.s; k < nd.s + nd.c; k++) {
      const t = B.order[k], a = T[t * 3] * 3, b = T[t * 3 + 1] * 3, c = T[t * 3 + 2] * 3;
      const e1x = P[b] - P[a], e1y = P[b + 1] - P[a + 1], e1z = P[b + 2] - P[a + 2], e2x = P[c] - P[a], e2y = P[c + 1] - P[a + 1], e2z = P[c + 2] - P[a + 2];
      const px = dir[1] * e2z - dir[2] * e2y, py = dir[2] * e2x - dir[0] * e2z, pz = dir[0] * e2y - dir[1] * e2x, det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-12) continue; const id = 1 / det;
      const sx = o[0] - P[a], sy = o[1] - P[a + 1], sz = o[2] - P[a + 2], u = (sx * px + sy * py + sz * pz) * id; if (u < 0 || u > 1) continue;
      const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x, v = (dir[0] * qx + dir[1] * qy + dir[2] * qz) * id; if (v < 0 || u + v > 1) continue;
      const tt = (e2x * qx + e2y * qy + e2z * qz) * id; if (tt > 1e-4 && tt < tMax && (best < 0 || tt < best)) best = tt;
    }
  }
  return best;
}
// направления по полусфере (косинусное распределение, золотой угол) — одни на все вершины, поворачиваются к нормали
const HEMI = Array.from({ length: RAYS }, (_, i) => { const r = Math.sqrt((i + 0.5) / RAYS), a = i * 2.39996323; return [r * Math.cos(a), Math.sqrt(1 - r * r), r * Math.sin(a)]; });

function bake(name, dry) {
  const file = `${DIR}${name}.glb`, bytes = Deno.readFileSync(file), g = readGlb(bytes), J = g.json;
  // все примитивы модели — в общий набор (модель целиком затеняет себя)
  const prims = [];
  for (const m of J.meshes) for (const p of m.primitives) {
    const P = accessor(g, p.attributes.POSITION).data, N = p.attributes.NORMAL !== undefined ? accessor(g, p.attributes.NORMAL).data : null, I = accessor(g, p.indices).data;
    const glass = (J.materials[p.material] || {}).alphaMode === 'BLEND';
    prims.push({ p, P, N, I, glass });
  }
  const nv = prims.reduce((s, q) => s + q.P.length / 3, 0), PA = new Float32Array(nv * 3), TA = [];
  let base = 0; for (const q of prims) { PA.set(q.P, base * 3); if (!q.glass) for (const i of q.I) TA.push(i + base); q.base = base; base += q.P.length / 3; } // стекло не затеняет
  const T = Uint32Array.from(TA), B = buildBVH(PA, T);
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (let i = 0; i < PA.length; i += 3) for (let d = 0; d < 3; d++) { mn[d] = Math.min(mn[d], PA[i + d]); mx[d] = Math.max(mx[d], PA[i + d]); }
  const maxD = Math.max(0.4, Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) * 0.12), eps = maxD * 0.004;
  let sum = 0, cnt = 0;
  for (const q of prims) {
    const n = q.P.length / 3;
    for (let v = 0; v < n; v++) {
      let nx = 0, ny = 1, nz = 0; if (q.N) { nx = q.N[v * 3]; ny = q.N[v * 3 + 1]; nz = q.N[v * 3 + 2]; }
      // базис вокруг нормали
      const tx = Math.abs(ny) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      let ax = [ny * tx[2] - nz * tx[1], nz * tx[0] - nx * tx[2], nx * tx[1] - ny * tx[0]]; const al = Math.hypot(...ax); ax = ax.map((c) => c / al);
      const bz = [ny * ax[2] - nz * ax[1], nz * ax[0] - nx * ax[2], nx * ax[1] - ny * ax[0]];
      const o = [q.P[v * 3] + nx * eps, q.P[v * 3 + 1] + ny * eps, q.P[v * 3 + 2] + nz * eps];
      let occ = 0;
      // двусторонние тонкие детали: если почти все лучи упёрлись — пробуем обратную сторону (нормаль могла смотреть внутрь)
      for (const side of [1, -1]) {
        occ = 0;
        for (const [hx, hy, hz] of HEMI) {
          const d = [(ax[0] * hx + nx * hy + bz[0] * hz) * side, (ax[1] * hx + ny * hy + bz[1] * hz) * side, (ax[2] * hx + nz * hy + bz[2] * hz) * side];
          const oo = side > 0 ? o : [o[0] - 2 * nx * eps, o[1] - 2 * ny * eps, o[2] - 2 * nz * eps];
          const t = rayHit(B, PA, T, oo, d, maxD); if (t > maxD * 0.015) occ += 1 - t / maxD; // совпадающие слои (наклейки поверх корпуса) — не в счёт
        }
        occ /= RAYS; if (occ < 0.85) break;
      }
      q.raw = q.raw || new Float32Array(n); q.raw[v] = 1 - occ;
    }
  }
  // открытые места — к 1: делим на 80-й процентиль по модели (внутренности и наложения не тянут всё в темноту)
  const all = Float32Array.from(prims.flatMap((q) => Array.from(q.raw))).sort(), ref = Math.max(0.3, all[Math.floor(all.length * 0.8)]);
  for (const q of prims) {
    const n = q.raw.length, col = new Uint8Array(n * 4);
    for (let v = 0; v < n; v++) { const ao = Math.max(MIN_AO, Math.pow(Math.min(1, q.raw[v] / ref), 1.8)), b = Math.round(ao * 255); col[v * 4] = col[v * 4 + 1] = col[v * 4 + 2] = b; col[v * 4 + 3] = 255; sum += ao; cnt++; }
    q.col = col;
  }
  const avg = sum / cnt;
  if (dry) return { name, nv, tris: T.length / 3, avg };
  // запись: новые bufferView/accessor в конец BIN (выравнивание 4), старый COLOR_0 (если был) — заменяется
  const add = []; let off = g.bin.length + ((4 - (g.bin.length % 4)) % 4);
  for (const q of prims) {
    J.bufferViews.push({ buffer: 0, byteOffset: off, byteLength: q.col.length, target: 34962 });
    J.accessors.push({ bufferView: J.bufferViews.length - 1, componentType: 5121, normalized: true, count: q.col.length / 4, type: 'VEC4' });
    q.p.attributes.COLOR_0 = J.accessors.length - 1; add.push([off, q.col]); off += q.col.length;
  }
  const bin = new Uint8Array(off + ((4 - (off % 4)) % 4)); bin.set(g.bin); for (const [o, c] of add) bin.set(c, o);
  J.buffers[0].byteLength = bin.length;
  let js = new TextEncoder().encode(JSON.stringify(J)); const jp = (4 - (js.length % 4)) % 4; if (jp) { const t = new Uint8Array(js.length + jp).fill(0x20); t.set(js); js = t; }
  const out = new Uint8Array(12 + 8 + js.length + 8 + bin.length), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, out.length, true);
  dv.setUint32(12, js.length, true); dv.setUint32(16, 0x4e4f534a, true); out.set(js, 20);
  dv.setUint32(20 + js.length, bin.length, true); dv.setUint32(24 + js.length, 0x004e4942, true); out.set(bin, 28 + js.length);
  Deno.writeFileSync(file, out);
  return { name, nv, tris: T.length / 3, avg, kb: Math.round(out.length / 1024) };
}

const dry = Deno.args.includes('--dry'), names = Deno.args.filter((a) => !a.startsWith('--'));
const list = names[0] === 'all' ? [...Deno.readDirSync(DIR)].filter((e) => e.name.endsWith('.glb')).map((e) => e.name.slice(0, -4)).sort() : names;
for (const n of list) { const t0 = performance.now(); const r = bake(n, dry); console.log(`${r.name}: вершин ${r.nv}, треуг. ${r.tris}, среднее ${r.avg.toFixed(2)}${r.kb ? `, ${r.kb} КБ` : ''}, ${Math.round(performance.now() - t0)} мс`); }
