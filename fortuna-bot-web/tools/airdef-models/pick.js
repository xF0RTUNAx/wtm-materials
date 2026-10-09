// Одна подвеска модели крупно: все части, центр которых внутри коробки [x0,y0,z0, x1,y1,z1] (оси модели после узлов).
//   deno run -A tools/airdef-models/pick.js <файл.glb> <папка> 'x0,y0,z0,x1,y1,z1' [raw]
import { readGlb, flatten, components } from './glb.js';
import { render, writePpm } from './raster.js';
const [file, dir, boxS, raw] = Deno.args, B = boxS.split(',').map(Number);
const g = readGlb(Deno.readFileSync(file)), prims = flatten(g, { raw: raw === 'raw' });
const P = [], I = []; let base = 0, n = 0;
const mats = new Set();
for (const p of prims) {
  const { comp, list } = components(p.P, p.I, 0.001), sel = new Set();
  for (const c of list) { const ctr = c.max.map((v, k) => (v + c.min[k]) / 2); if (ctr.every((v, k) => v >= B[k] && v <= B[k + 3])) { sel.add(c.id); n++; mats.add(p.material); } }
  for (const x of p.P) P.push(x);
  for (let t = 0; t < p.I.length / 3; t++) if (sel.has(comp[t])) I.push(p.I[t * 3] + base, p.I[t * 3 + 1] + base, p.I[t * 3 + 2] + base);
  base += p.P.length / 3;
}
let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (const k of I) for (let d = 0; d < 3; d++) { mn[d] = Math.min(mn[d], P[k * 3 + d]); mx[d] = Math.max(mx[d], P[k * 3 + d]); }
console.log(`частей ${n}, треугольников ${I.length / 3}, материалы ${[...mats]}, габариты ${mx.map((v, i) => (v - mn[i]).toFixed(2)).join(' × ')}, центр ${mx.map((v, i) => ((v + mn[i]) / 2).toFixed(2)).join(' ')}`);
const name = file.split('/').pop().replace('.glb', '');
const map = new Map(), P2 = [], I2 = I.map((k) => { if (!map.has(k)) { map.set(k, P2.length / 3); P2.push(P[k * 3], P[k * 3 + 1], P[k * 3 + 2]); } return map.get(k); }); // только выбранные вершины — кадр по ним
for (const v of ['side', 'top', 'front']) writePpm(`${dir}/pk_${name}_${v}.ppm`, render(Float32Array.from(P2), Uint32Array.from(I2), () => [190, 190, 196], { view: v, w: 700, h: 300 }));
