// Поиск пилонов и сопел на подготовленной модели (оси игры: x вправо, y вверх, нос в −Z):
//   deno run -A tools/airdef-models/measure.js su30 [папка для вида снизу с метками]
// Пилоны — тонкие вертикальные пластины под крылом; сопла — круглые части у хвоста. Печатает кандидатов и
// нижнюю поверхность крыла по размаху (для моделей без пилонов).
import { readGlb, flatten, components } from './glb.js';
import { render, writePpm } from './raster.js';
const [name, dir] = Deno.args;
const g = readGlb(Deno.readFileSync(new URL(`../../games/airdef/models/${name}.glb`, import.meta.url).pathname)), prims = flatten(g);
const parts = [], P = [], I = []; let base = 0;
for (const p of prims) {
  const { list } = components(p.P, p.I, 0.002);
  for (const c of list) { c.size = c.max.map((v, k) => v - c.min[k]); c.ctr = c.max.map((v, k) => (v + c.min[k]) / 2); c.mat = p.material; parts.push(c); }
  for (const x of p.P) P.push(x); for (const k of p.I) I.push(k + base); base += p.P.length / 3;
}
let zMax = -1e9; for (let i = 2; i < P.length; i += 3) zMax = Math.max(zMax, P[i]);
const pyl = parts.filter((c) => c.size[0] < 0.3 && c.size[2] > 0.8 && c.size[2] < 4.5 && c.size[1] > 0.1 && Math.abs(c.ctr[0]) > 0.9 && c.tris >= 8).sort((a, b) => a.ctr[0] - b.ctr[0]);
console.log('пилоны (x, низ y, середина z, длина):'); for (const c of pyl) console.log(`  ${c.ctr[0].toFixed(2)} ${c.min[1].toFixed(2)} ${c.ctr[2].toFixed(2)} ${c.size[2].toFixed(2)}  треуг ${c.tris}`);
const noz = parts.filter((c) => c.max[2] > zMax - 1.6 && Math.abs(c.size[0] - c.size[1]) < 0.25 && c.size[0] > 0.5 && c.size[0] < 1.6).sort((a, b) => a.ctr[0] - b.ctr[0]);
console.log('сопла (x, y, срез z, диаметр):'); for (const c of noz) console.log(`  ${c.ctr[0].toFixed(2)} ${c.ctr[1].toFixed(2)} ${c.max[2].toFixed(2)} ${c.size[0].toFixed(2)}  треуг ${c.tris}`);
// нижняя поверхность по лучу снизу вверх в точке (x, z)
function under(x, z) {
  let best = null;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const d = (P[b] - P[a]) * (P[c + 2] - P[a + 2]) - (P[c] - P[a]) * (P[b + 2] - P[a + 2]); if (Math.abs(d) < 1e-9) continue;
    const u = ((x - P[a]) * (P[c + 2] - P[a + 2]) - (P[c] - P[a]) * (z - P[a + 2])) / d, v = ((P[b] - P[a]) * (z - P[a + 2]) - (x - P[a]) * (P[b + 2] - P[a + 2])) / d;
    if (u < 0 || v < 0 || u + v > 1) continue;
    const y = P[a + 1] + u * (P[b + 1] - P[a + 1]) + v * (P[c + 1] - P[a + 1]); if (best === null || y < best) best = y;
  }
  return best;
}
console.log('низ крыла по размаху (x: z от–до хорды, низ y в середине):');
let xMax = 0; for (let i = 0; i < P.length; i += 3) xMax = Math.max(xMax, P[i]);
for (const f of [0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75]) {
  const x = xMax * f; let z0 = null, z1 = null;
  for (let z = -10; z <= 10; z += 0.1) if (under(x, z) !== null) { if (z0 === null) z0 = z; z1 = z; }
  if (z0 !== null) { const zm = (z0 + z1) / 2, y = under(x, zm); console.log(`  x ${x.toFixed(2)}: z ${z0.toFixed(1)}…${z1.toFixed(1)}, низ ${y === null ? '—' : y.toFixed(2)} при z ${zm.toFixed(2)}`); }
}
// срез сопел: вершины у самого хвоста двигателей (последние 0,4 м по длине, ниже киля), по сторонам
for (const side of [-1, 1]) {
  let n = 0, sx = 0, sy = 0, y0 = 1e9, y1 = -1e9, x0 = 1e9, x1 = -1e9, zz = -1e9;
  for (let i = 0; i < P.length; i += 3) { const x = P[i], y = P[i + 1], z = P[i + 2]; if (z < zMax - 2.5 || Math.sign(x || side) !== side || Math.abs(x) > 2 || y > 0.6) continue; zz = Math.max(zz, z); }
  for (let i = 0; i < P.length; i += 3) { const x = P[i], y = P[i + 1], z = P[i + 2]; if (z < zz - 0.4 || Math.sign(x || side) !== side || Math.abs(x) > 2 || y > 0.6) continue; n++; sx += x; sy += y; y0 = Math.min(y0, y); y1 = Math.max(y1, y); x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
  if (n) console.log(`хвост ${side < 0 ? 'слева' : 'справа'}: центр x ${(sx / n).toFixed(2)} y ${(sy / n).toFixed(2)}, срез z ${zz.toFixed(2)}, по x ${x0.toFixed(2)}…${x1.toFixed(2)}, по y ${y0.toFixed(2)}…${y1.toFixed(2)}`);
}
if (dir) writePpm(`${dir}/m_${name}.ppm`, render(Float32Array.from(P), Uint32Array.from(I), () => [190, 190, 196], { view: 'bottom', w: 900, h: 600, marks: [...pyl.map((c) => [c.ctr[0], c.min[1], c.ctr[2]]), ...noz.map((c) => [c.ctr[0], c.ctr[1], c.max[2]])] }));
