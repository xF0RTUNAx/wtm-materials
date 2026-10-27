// Модель с окраской для съёмки кадров меню и ролика (?camo=<модель>:<окраска>, models.js CAMO_R): glb сборщика (Свои/Камуфляжи/<модель>/<модель>.glb —
// новая развёртка, картинка основы <модель>_base) с картинкой окраски вместо основы → tools/airdef-shots/camo/<модель>.<окраска>.glb. Игрокам не отдаётся:
// окраски в бою — этап 2 магазина (AIRDEF_STATE «ЧТО ДАЛЬШЕ» 2).
//   deno run -A fortuna-bot-web/tools/airdef-shots/camo-glb.js e_f15e:inferno e_mig31:dragon
const SRC = `${Deno.env.get('HOME')}/Downloads/Воздушное превосходство/Модели/Свои/Камуфляжи`;
const OUT = new URL('./camo/', import.meta.url).pathname;
Deno.mkdirSync(OUT, { recursive: true });
for (const arg of Deno.args) {
  const [model, skin] = arg.split(':');
  const b = Deno.readFileSync(`${SRC}/${model}/${model}.glb`), dv = new DataView(b.buffer, b.byteOffset);
  const jl = dv.getUint32(12, true), j = JSON.parse(new TextDecoder().decode(b.subarray(20, 20 + jl)));
  const bo = 20 + jl, bl = dv.getUint32(bo, true), bin = b.subarray(bo + 8, bo + 8 + bl);
  const img = j.images.findIndex((i) => i.name === `${model}_base`); if (img < 0) throw new Error(`${model}: нет картинки ${model}_base`);
  const png = Deno.readFileSync(`${SRC}/${model}/${model}_${skin}.png`);
  // картинку окраски — в конец двоичного блока (выравнивание 4), её bufferView — туда же
  const pad = (n) => (4 - (n % 4)) % 4, off = bin.length + pad(bin.length), nb = new Uint8Array(off + png.length + pad(png.length));
  nb.set(bin); nb.set(png, off);
  j.bufferViews.push({ buffer: 0, byteOffset: off, byteLength: png.length }); j.images[img] = { name: `${model}_${skin}`, mimeType: 'image/png', bufferView: j.bufferViews.length - 1 };
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
