// Осмотр скачанной модели: deno run -A tools/airdef-models/inspect.js <файл.glb> [папка для видов]
// Печатает узлы с мешами (имя, треугольники, габариты в мировых осях), материалы и текстуры; рисует виды всей модели.
import { readGlb, flatten, bbox } from './glb.js';
import { render, writePpm } from './raster.js';
const [file, dir] = Deno.args, g = readGlb(Deno.readFileSync(file)), J = g.json;
const prims = flatten(g);
const all = bbox(Float32Array.from(prims.flatMap((p) => [...p.P])));
const ex = (J.asset && J.asset.extras) || {}; // Sketchfab пишет автора, лицензию и ссылку прямо в файл
console.log(`«${ex.title || '?'}» — ${ex.author || '?'} · ${ex.license || 'лицензия не указана'}${/NC|ND/.test(ex.license || '') ? ' ⚠ НЕЛЬЗЯ (некоммерческая / без изменений)' : ''} · ${ex.source || ''}`);
console.log(`узлов ${J.nodes.length}, мешей ${J.meshes.length}, примитивов ${prims.length}, материалов ${(J.materials || []).length}, картинок ${(J.images || []).length}`);
console.log('габариты', all.mn.map((v) => v.toFixed(2)), all.mx.map((v) => v.toFixed(2)), 'размер', all.mx.map((v, i) => (v - all.mn[i]).toFixed(2)));
for (const [i, im] of (J.images || []).entries()) { const bv = J.bufferViews[im.bufferView]; console.log(` картинка ${i} ${im.name || ''} ${im.mimeType} ${(bv.byteLength / 1024).toFixed(0)} КБ`); }
for (const [i, m] of (J.materials || []).entries()) console.log(` материал ${i} ${m.name} ${m.alphaMode || ''} ${Object.keys(m.pbrMetallicRoughness || {}).join(',')} ${m.normalTexture ? 'normal' : ''}`);
for (const p of prims) { const b = bbox(p.P); console.log(String(p.I.length / 3).padStart(7), p.path.split('/').slice(-2).join('/').slice(0, 60).padEnd(60), 'мат', p.material, 'мин', b.mn.map((v) => v.toFixed(2)).join(' '), 'макс', b.mx.map((v) => v.toFixed(2)).join(' ')); }
if (dir) {
  const P = Float32Array.from(prims.flatMap((p) => [...p.P])); let off = 0; const I = [];
  for (const p of prims) { for (const k of p.I) I.push(k + off); off += p.P.length / 3; }
  const name = file.split('/').pop().replace('.glb', '');
  for (const v of ['side', 'top', 'front', 'iso']) writePpm(`${dir}/${name}_${v}.ppm`, render(P, Uint32Array.from(I), () => [190, 190, 196], { view: v, w: 900, h: 500 }));
}
