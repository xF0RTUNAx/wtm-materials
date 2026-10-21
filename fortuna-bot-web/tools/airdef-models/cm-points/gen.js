// Точки отстрела ловушек по моделям (правила Mark 2026-10-21) → cm.json и проверочные виды img/ (хвост: профиль, сверху, сзади; сетка 1 м, красные метки — точки).
//   cd tools/airdef-models/cm-points && deno run -A gen.js [spec.json] && python3 mkcm.py   (mkcm.py пишет games/airdef/sim/cm.js из cm.tpl.js)
//   python3 sheet.py лист.png ключ ключ …   — проверочный лист (нужны numpy и pillow: python3 -m venv v && v/bin/pip install pillow)
// spec.json: ключ → { salvo, mode (top | bot | edge | raw), pts, flare: false — только диполи, view — сколько метров хвоста на картинке }.
//   top / bot: pts — [x, dz]: точка на верхней / нижней поверхности на расстоянии dz от среза хвоста, зеркально парой (x > 0);
//   edge: [dz, y, xcap] — на боку тела; raw: [x, y, z (, dx, dy, dz)] — точка и направление заданы прямо.
import { load, bbox, surf, edge } from './geo.js';
import { render, writePpm } from '../raster.js';
// spec: [kind, salvo, pts, dirKind]; pts — [x, dz] (x>0 — зеркально парой; dz — от среза хвоста, м), kind: top | bot | side(у боковой точки y задан третьим числом ниже оси) | tip
const SPEC = JSON.parse(Deno.readTextFileSync(Deno.args[0] || 'spec.json'));
const out = {}, warn = [];
const r2 = (v) => Math.round(v * 20) / 20;
for (const [key, S] of Object.entries(SPEC)) {
  const M = load(key), b = bbox(M.P), zE = b.mx[2];
  const at = [], dir = [];
  if (S.flare === false && !S.pts) { /* только диполи: из хвоста */ }
  for (const p of S.pts || []) {
    if (S.mode === 'edge') { // [dz, y, xcap] — точка на боку тела (хвостовая балка, фюзеляж)
      const [dz, y, xc] = p, z = zE - dz, e = edge(M, y, z, xc ?? 3);
      if (e === null) { warn.push(`${key}: нет бока на y=${y} z=${z.toFixed(1)}`); continue; }
      for (const sx of [-1, 1]) { at.push([r2(sx * Math.max(0, e - 0.02)), r2(y), r2(z)]); const d = [(S.dx ?? 0.8) * sx, S.dy ?? -0.5, 0.05], l = Math.hypot(...d); dir.push(d.map((v) => Math.round(v / l * 100) / 100)); }
      continue;
    }
    if (S.mode === 'raw') { const [x, y, z] = p, dv = p.length > 3 ? p.slice(3) : S.dirv; for (const sx of (x === 0 ? [0] : [-1, 1])) { at.push([r2(sx * x), r2(y), r2(z)]); const d = [dv[0] * (sx || 1), dv[1], dv[2]], l = Math.hypot(...d); dir.push(d.map((v) => Math.round(v / l * 100) / 100)); } continue; }
    const [x, dz, yo] = p, z = zE - dz;
    let s = surf(M, x, z, S.yr), zz = z, xs2 = x;
    if (!s) { // привязка к ближайшей точке, где есть поверхность
      let best = null;
      for (let d2 = -1.5; d2 <= 1.5; d2 += 0.25) for (let dx = -0.6; dx <= 0.6; dx += 0.1) {
        const xq = Math.max(0, x + dx), q = surf(M, xq, z + d2, S.yr); if (!q) continue;
        const dd = Math.hypot(dx * 1.5, d2); if (!best || dd < best.d) best = { d: dd, s: q, x: xq, z: z + d2 };
      }
      if (best) { s = best.s; zz = best.z; xs2 = best.x; warn.push(`${key}: привязка (${x}, ${z.toFixed(1)}) -> (${xs2.toFixed(2)}, ${zz.toFixed(2)})`); }
    }
    let y;
    if (S.mode === 'bot') y = s ? s[1] : null; else if (S.mode === 'top') y = s ? s[0] : null; else y = yo ?? (s ? (s[0] + s[1]) / 2 : null);
    if (y === null || y === undefined) { warn.push(`${key}: нет поверхности в x=${x} z=${z.toFixed(1)}`); continue; }
    if (S.mode === 'top') y += (S.lift ?? 0.05); if (S.mode === 'bot') y -= (S.lift ?? 0.05);
    for (const sx of (xs2 === 0 ? [0] : [-1, 1])) {
      at.push([r2(sx * xs2), r2(y), r2(zz)]);
      const d = S.mode === 'top' ? [0.55 * sx, 0.82, 0.1] : S.mode === 'bot' ? [0.35 * sx, -0.92, 0.1] : S.mode === 'side' ? [0.75 * sx, -0.6, 0.05] : [0.9 * sx, 0.3, 0.05];
      const l = Math.hypot(...d); dir.push(d.map((v) => Math.round(v / l * 100) / 100));
    }
  }
  out[key] = { flare: S.flare !== false, salvo: S.salvo, at, dir };
}
Deno.writeTextFileSync('cm.json', JSON.stringify(out, null, 1));
console.log(warn.join('\n') || 'без предупреждений');
// картинки
const W = 560, H = 280; Deno.mkdirSync('img', { recursive: true });
const meta = {};
for (const key of Object.keys(SPEC)) {
  const M = load(key), b = bbox(M.P), zE = b.mx[2], span = Math.max(12, Math.min(zE * 2 - 1, SPEC[key].view || 13));
  const marks = out[key].at;
  const I = M.I, P = M.P;
  const prof = [-(zE + 1), -(zE - span), b.mn[1] - 0.3, b.mx[1] + 0.3]; // u = -z (хвост слева), v = y
  const xw = Math.min(b.mx[0] + 0.3, SPEC[key].xw ?? 7);
  const top = [-xw, xw, -(zE + 1), -(zE - span)];
  const col = () => [200, 205, 215];
  writePpm(`img/${key}_p.ppm`, render(P, I, col, { w: W, h: H, view: 'front', box: prof, marks }));
  writePpm(`img/${key}_t.ppm`, render(P, I, col, { w: W, h: H, view: 'top', box: top, marks }));
  writePpm(`img/${key}_r.ppm`, render(P, I, col, { w: 280, h: H, view: 'side', box: [-xw, xw, b.mn[1] - 0.3, b.mx[1] + 0.3], marks }));
  meta[key] = { prof, top, rear: [-xw, xw, b.mn[1] - 0.3, b.mx[1] + 0.3], W, H, zE };
}
Deno.writeTextFileSync('img/meta.json', JSON.stringify(meta));
