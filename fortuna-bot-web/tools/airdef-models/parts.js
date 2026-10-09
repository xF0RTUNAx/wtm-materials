// Подсветка частей модели по правилу: deno run -A tools/airdef-models/parts.js <файл.glb> <папка> '<правило>' [вид…]
// Правило — выражение JS от c: { min, max (мировые оси модели), size, ctr, tris, mat, path }. Совпавшие части — красные,
// печатается их список; виды — side / top / bottom / front / iso.
import { readGlb, flatten, components } from './glb.js';
import { render, writePpm } from './raster.js';
const [file, dir, rule, ...views] = Deno.args;
const g = readGlb(Deno.readFileSync(file)), prims = flatten(g);
const test = new Function('c', `return (${rule || 'false'});`);
let P = [], I = [], col = [], off = 0, hit = [];
for (const p of prims) {
  const { comp, list } = components(p.P, p.I, 0.001 * Math.max(1, Math.abs(p.P[0]) > 50 ? 100 : 1));
  const sel = new Set();
  for (const c of list) {
    c.size = c.max.map((v, i) => v - c.min[i]); c.ctr = c.max.map((v, i) => (v + c.min[i]) / 2); c.mat = p.material; c.path = p.path;
    if (test(c)) { sel.add(c.id); hit.push(c); }
  }
  for (let v = 0; v < p.P.length; v++) P.push(p.P[v]);
  for (let t = 0; t < p.I.length / 3; t++) { for (let k = 0; k < 3; k++) I.push(p.I[t * 3 + k] + off); col.push(sel.has(comp[t]) ? [230, 40, 40] : [190, 190, 196]); }
  off += p.P.length / 3;
}
console.log(`совпало частей ${hit.length}, треугольников ${hit.reduce((s, c) => s + c.tris, 0)} из ${I.length / 3}`);
for (const c of hit.sort((a, b) => b.tris - a.tris).slice(0, 40)) console.log(String(c.tris).padStart(6), 'мат', c.mat, 'ц', c.ctr.map((v) => v.toFixed(2)).join(' '), 'р', c.size.map((v) => v.toFixed(2)).join(' '));
const name = file.split('/').pop().replace('.glb', '');
for (const v of views.length ? views : ['side', 'bottom']) writePpm(`${dir}/p_${name}_${v}.ppm`, render(Float32Array.from(P), Uint32Array.from(I), (t) => col[t], { view: v, w: 1000, h: 560 }));
