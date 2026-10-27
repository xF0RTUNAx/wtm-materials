// Модель с окраской: glb сборщика (Свои/Камуфляжи/<модель>/<модель>.glb — новая развёртка, картинка основы <модель>_base) с картинкой окраски
// вместо основы. Без флага — для съёмки кадров меню и ролика (?camo=<модель>:<окраска>, models.js CAMO_R) → tools/airdef-shots/camo/<модель>.<окраска>.glb
// (PNG как у сборщика); --game — для игроков (магазин, этап 2: надетая окраска, models.js CAMO_V) → games/airdef/models/camo/<модель>.<окраска>.glb,
// картинка — JPEG 90 (sips, macOS): файл втрое легче, на глаз то же. После новой сборки — поднять версию в CAMO_V.
//   deno run -A fortuna-bot-web/tools/airdef-shots/camo-glb.js [--game] e_f15e:inferno e_mig31:dragon
const SRC = `${Deno.env.get('HOME')}/Downloads/Воздушное превосходство/Модели/Свои/Камуфляжи`;
const GAME = Deno.args.includes('--game');
const OUT = GAME ? new URL('../../games/airdef/models/camo/', import.meta.url).pathname : new URL('./camo/', import.meta.url).pathname;
Deno.mkdirSync(OUT, { recursive: true });
function jpeg(png) { // PNG → JPEG 90 через sips (во временной папке)
  const d = Deno.makeTempDirSync(), a = `${d}/a.png`, b = `${d}/b.jpg`; Deno.writeFileSync(a, png);
  const r = new Deno.Command('sips', { args: ['-s', 'format', 'jpeg', '-s', 'formatOptions', '90', a, '--out', b], stdout: 'null', stderr: 'piped' }).outputSync();
  if (!r.success) throw new Error('sips: ' + new TextDecoder().decode(r.stderr));
  const out = Deno.readFileSync(b); Deno.removeSync(d, { recursive: true }); return out;
}
for (const arg of Deno.args.filter((a) => !a.startsWith('--'))) {
  const [model, skin] = arg.split(':');
  const b = Deno.readFileSync(`${SRC}/${model}/${model}.glb`), dv = new DataView(b.buffer, b.byteOffset);
  const jl = dv.getUint32(12, true), j = JSON.parse(new TextDecoder().decode(b.subarray(20, 20 + jl)));
  const bo = 20 + jl, bl = dv.getUint32(bo, true), bin = b.subarray(bo + 8, bo + 8 + bl);
  const img = j.images.findIndex((i) => i.name === `${model}_base`); if (img < 0) throw new Error(`${model}: нет картинки ${model}_base`);
  const png0 = Deno.readFileSync(`${SRC}/${model}/${model}_${skin}.png`), png = GAME ? jpeg(png0) : png0, mime = GAME ? 'image/jpeg' : 'image/png';
  // двоичный блок заново: те же куски по порядку, вместо картинки основы — картинка окраски (основа в файле больше не лежит), выравнивание 4
  const pad = (n) => (4 - (n % 4)) % 4, bvImg = j.images[img].bufferView, parts = []; let len = 0;
  for (const [i, v] of j.bufferViews.entries()) { const data = i === bvImg ? png : bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength); len += pad(len); parts.push([v, data, len]); len += data.length; }
  const nb = new Uint8Array(len + pad(len));
  for (const [v, data, off] of parts) { nb.set(data, off); v.byteOffset = off; v.byteLength = data.length; }
  j.images[img] = { name: `${model}_${skin}`, mimeType: mime, bufferView: bvImg };
  j.buffers[0].byteLength = nb.length;
  const js = new TextEncoder().encode(JSON.stringify(j)), jp = new Uint8Array(js.length + pad(js.length)).fill(0x20); jp.set(js);
  const out = new Uint8Array(12 + 8 + jp.length + 8 + nb.length), ov = new DataView(out.buffer);
  ov.setUint32(0, 0x46546c67, true); ov.setUint32(4, 2, true); ov.setUint32(8, out.length, true);
  ov.setUint32(12, jp.length, true); ov.setUint32(16, 0x4e4f534a, true); out.set(jp, 20);
  ov.setUint32(20 + jp.length, nb.length, true); ov.setUint32(24 + jp.length, 0x004e4942, true); out.set(nb, 28 + jp.length);
  Deno.writeFileSync(`${OUT}${model}.${skin}.glb`, out);
  const col = j.meshes.some((m) => m.primitives.some((p) => p.attributes.COLOR_0 !== undefined));
  console.log(`${model}.${skin}.glb — ${(out.length / 1048576).toFixed(1)} МБ, затенение в цветах вершин: ${col ? 'есть' : 'нет'}`);
}
