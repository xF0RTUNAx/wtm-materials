// Геометрия моделей для точек ловушек (sim/cm.js): габариты, высота верхней / нижней поверхности и край тела по лучу (оси игры: нос в −Z).
import { readGlb, flatten } from '../glb.js';
const D = new URL('../../../games/airdef/models/', import.meta.url).pathname;
export function load(name) {
  const g = readGlb(Deno.readFileSync(D + name + '.glb')), prims = flatten(g);
  const P = [], I = []; let base = 0;
  for (const p of prims) { for (const x of p.P) P.push(x); for (const k of p.I) I.push(k + base); base += p.P.length / 3; }
  return { P: Float32Array.from(P), I: Uint32Array.from(I) };
}
export function bbox(P) { const mn = [1e9,1e9,1e9], mx = [-1e9,-1e9,-1e9]; for (let i = 0; i < P.length; i += 3) for (let d = 0; d < 3; d++) { mn[d] = Math.min(mn[d], P[i+d]); mx[d] = Math.max(mx[d], P[i+d]); } return { mn, mx }; }
// высота верхней / нижней поверхности в точке (x,z) по лучу (все треугольники)
export function surf(M, x, z, yr = null) {
  const { P, I } = M; let top = -1e9, bot = 1e9;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t]*3, b = I[t+1]*3, c = I[t+2]*3;
    const d = (P[b]-P[a])*(P[c+2]-P[a+2]) - (P[c]-P[a])*(P[b+2]-P[a+2]); if (Math.abs(d) < 1e-9) continue;
    const u = ((x-P[a])*(P[c+2]-P[a+2]) - (P[c]-P[a])*(z-P[a+2])) / d, v = ((P[b]-P[a])*(z-P[a+2]) - (x-P[a])*(P[b+2]-P[a+2])) / d;
    if (u < 0 || v < 0 || u+v > 1) continue;
    const y = P[a+1] + u*(P[b+1]-P[a+1]) + v*(P[c+1]-P[a+1]); if (yr && (y < yr[0] || y > yr[1])) continue; if (y > top) top = y; if (y < bot) bot = y;
  }
  return top < -1e8 ? null : [top, bot];
}
if (import.meta.main) {
  for (const n of Deno.args) { const M = load(n), b = bbox(M.P); console.log(n.padEnd(14), 'x', b.mn[0].toFixed(1), b.mx[0].toFixed(1), 'y', b.mn[1].toFixed(2), b.mx[1].toFixed(2), 'z', b.mn[2].toFixed(1), b.mx[2].toFixed(1), 'tris', M.I.length/3); }
}

// крайний по x край тела на высоте y в сечении z (луч вдоль x): максимум |x| ≤ xcap среди пересечений
export function edge(M, y, z, xcap) {
  const { P, I } = M; let best = null;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t]*3, b = I[t+1]*3, c = I[t+2]*3;
    // треугольник в плоскости (y,z): точка (y,z) внутри?
    const y0 = P[a+1], z0 = P[a+2], d1y = P[b+1]-y0, d1z = P[b+2]-z0, d2y = P[c+1]-y0, d2z = P[c+2]-z0, det = d1y*d2z - d2y*d1z; if (Math.abs(det) < 1e-9) continue;
    const u = ((y-y0)*d2z - d2y*(z-z0)) / det, v = (d1y*(z-z0) - (y-y0)*d1z) / det; if (u < 0 || v < 0 || u+v > 1) continue;
    const x = P[a] + u*(P[b]-P[a]) + v*(P[c]-P[a]); if (Math.abs(x) <= xcap && (best === null || Math.abs(x) > Math.abs(best))) best = x;
  }
  return best === null ? null : Math.abs(best);
}
