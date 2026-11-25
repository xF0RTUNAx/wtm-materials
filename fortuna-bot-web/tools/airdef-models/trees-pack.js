// Деревья ревизии 2 (Свои/Деревья, сборщик fuel-builder, принято Mark 2026-11-25) → игровые наборы: город trees_c, зима trees_w, осень trees_a (models/*.glb)
// и отдельные pr_oldtree / pr_deadtree:   deno run -A tools/airdef-models/trees-pack.js [c w a pr]
// В исходниках у каждого из 126 файлов свои картинки (1 ГБ, разных 45) - здесь каждая один раз. Меши «<ключ>@<уровень>|leaf_… / bark_…»; уровни 0 (8-14 тыс.), 1 (2-3 тыс.),
// 2 (350-590 треугольников). COLOR_0 в наборах - как у сборщика (R гибкость, G фаза, B дрожь, A затенение; разбирает windMat в city-render.js), у pr_* - затенение в rgb.
const HOME = Deno.env.get('HOME'), SRC = `${HOME}/Downloads/Воздушное превосходство/Модели/Свои/Деревья/чистовые`, OUT = new URL('../../games/airdef/models/', import.meta.url).pathname;
const PY = '/Applications/Blender.app/Contents/Resources/5.2/python/bin/python3.13', FILL = new URL('./alpha-fill.py', import.meta.url).pathname;
const K = (d, L) => L.map((k) => [k, `${SRC}/${d}/${k}`]);
const PACKS = {
  c: ['trees_c', K('лето', ['tr_oak', 'tr_oak_b', 'tr_lime', 'tr_lime_b', 'tr_pine', 'tr_pine_b', 'tr_bush', 'tr_bush_b', 'tr_birch', 'tr_birch_b', 'tr_maple', 'tr_maple_b', 'tr_poplar', 'tr_poplar_b', 'tr_spruce', 'tr_spruce_b'])],
  w: ['trees_w', K('зима', ['w_fir1', 'w_fir3', 'w_fir_b', 'w_pine1', 'w_pine2', 'w_birch', 'w_oak'])],
  x: ['trees_x', K('сломанные', ['st_oak', 'st_oak_b', 'st_fir', 'st_fir_b', 'st_pine', 'st_pine_b']), [1]], // пни - от взрывов (treefall.js)
  a: ['trees_a', [...K('осень', ['a_oak', 'a_oak_h', 'a_lime', 'a_maple', 'a_birch']), ...K('лето', ['tr_pine', 'tr_pine_b']), ...K('старые', ['pr_deadtree'])]],
};
const tmp = Deno.makeTempDirSync({ prefix: 'trpack' }); const run = (c, a) => { const o = new Deno.Command(c, { args: a, stdout: 'piped', stderr: 'piped' }).outputSync(); if (!o.success) throw new Error(c + ': ' + new TextDecoder().decode(o.stderr).slice(-300)); return new TextDecoder().decode(o.stdout); };
const md5 = async (u8) => [...new Uint8Array(await crypto.subtle.digest('SHA-1', u8))].slice(0, 6).map((x) => x.toString(16).padStart(2, '0')).join('');
let imgN = 0; const IMG = new Map();
// картинка: leaf - 1024 с заливкой под прозрачным (WebP с альфой), кора - ширина 512 (у сосны 512 × 1024), нормали - 512, JPEG
async function image(u8, kind) {
  const k = await md5(u8) + kind; if (IMG.has(k)) return IMG.get(k);
  const f = `${tmp}/${imgN++}`; Deno.writeFileSync(f + '.png', u8); let out, mime;
  if (kind === 'leaf') { run(PY, [FILL, f + '.png', f + 'f.png', '1024']); run('cwebp', ['-quiet', '-q', '90', '-alpha_q', '100', '-exact', f + 'f.png', '-o', f + '.webp']); out = f + '.webp'; mime = 'image/webp'; }
  else { run('ffmpeg', ['-v', 'error', '-y', '-i', f + '.png', '-vf', `scale='min(512,iw)':-2:flags=lanczos`, '-pix_fmt', 'yuvj444p', '-q:v', '2', f + '.jpg']); out = f + '.jpg'; mime = 'image/jpeg'; }
  const r = { u8: Deno.readFileSync(out), mime, k }; IMG.set(k, r); return r;
}
const read = (p) => { const b = Deno.readFileSync(p), dv = new DataView(b.buffer), n = dv.getUint32(12, true), j = JSON.parse(new TextDecoder().decode(b.subarray(20, 20 + n))), o = 28 + n;
  const view = (i, extra = 0, len) => { const v = j.bufferViews[i]; return b.slice(o + (v.byteOffset || 0) + extra, o + (v.byteOffset || 0) + extra + (len ?? v.byteLength)); };
  const acc = (i) => { const a = j.accessors[i], T = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }[a.componentType], c = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type]; return new T(view(a.bufferView, a.byteOffset || 0, a.count * c * T.BYTES_PER_ELEMENT).buffer); };
  return { j, view, acc }; };
function writer() {
  const chunks = []; let off = 0; const J = { asset: { version: '2.0', generator: 'trees-pack.js' }, scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], materials: [], accessors: [], bufferViews: [], buffers: [], images: [], textures: [], samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }] };
  const view = (u8, target) => { const pad = (4 - (off % 4)) % 4; if (pad) { chunks.push(new Uint8Array(pad)); off += pad; } J.bufferViews.push({ buffer: 0, byteOffset: off, byteLength: u8.byteLength, ...(target ? { target } : {}) }); chunks.push(u8); off += u8.byteLength; return J.bufferViews.length - 1; };
  const TX = new Map(), MT = new Map();
  const tex = (r) => { if (!TX.has(r.k)) { J.images.push({ bufferView: view(r.u8), mimeType: r.mime }); J.textures.push({ sampler: 0, source: J.images.length - 1 }); TX.set(r.k, J.textures.length - 1); } return TX.get(r.k); };
  return { J, view, tex, MT, async add(key, lod, path, aoRgb) {
    const g = read(path); let t = 0;
    for (const m of g.j.meshes) for (const p of m.primitives) {
      const M = g.j.materials[p.material], leaf = M.alphaMode === 'MASK', src = (ti) => g.view(g.j.images[g.j.textures[ti].source].bufferView);
      const c = tex(await image(src(M.pbrMetallicRoughness.baseColorTexture.index), leaf ? 'leaf' : 'bark')), n = M.normalTexture ? tex(await image(src(M.normalTexture.index), 'nrm')) : -1, mk = `${leaf}|${c}|${n}`;
      if (!MT.has(mk)) { J.materials.push({ name: (leaf ? 'leaf_' : 'bark_') + MT.size, pbrMetallicRoughness: { baseColorTexture: { index: c }, metallicFactor: 0, roughnessFactor: 1 }, ...(n >= 0 ? { normalTexture: { index: n } } : {}), ...(leaf ? { alphaMode: 'MASK', alphaCutoff: 0.5 } : {}) }); MT.set(mk, J.materials.length - 1); }
      const at = {}, A = p.attributes, bin = (arr) => new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
      const put = (name, arr, type, ct, norm, mm) => { const n0 = { VEC2: 2, VEC3: 3, VEC4: 4 }[type], a = { bufferView: view(bin(arr), 34962), componentType: ct, count: arr.length / n0, type, ...(norm ? { normalized: true } : {}) }; if (mm) { a.min = [1e9, 1e9, 1e9]; a.max = [-1e9, -1e9, -1e9]; for (let i = 0; i < arr.length; i++) { a.min[i % 3] = Math.min(a.min[i % 3], arr[i]); a.max[i % 3] = Math.max(a.max[i % 3], arr[i]); } } J.accessors.push(a); at[name] = J.accessors.length - 1; };
      put('POSITION', g.acc(A.POSITION), 'VEC3', 5126, 0, 1); put('NORMAL', g.acc(A.NORMAL), 'VEC3', 5126); put('TEXCOORD_0', g.acc(A.TEXCOORD_0), 'VEC2', 5126);
      const col = g.acc(A.COLOR_0); if (aoRgb) for (let i = 0; i < col.length; i += 4) { col[i] = col[i + 1] = col[i + 2] = col[i + 3]; col[i + 3] = 255; } put('COLOR_0', col, 'VEC4', 5121, 1);
      const I = g.acc(p.indices), u = A.POSITION !== undefined && g.j.accessors[A.POSITION].count > 65535 ? Uint32Array.from(I) : Uint16Array.from(I); J.accessors.push({ bufferView: view(bin(u), 34963), componentType: u instanceof Uint32Array ? 5125 : 5123, count: u.length, type: 'SCALAR' });
      const nm = aoRgb ? `body|${J.materials[MT.get(mk)].name}` : `${key}@${lod}|${J.materials[MT.get(mk)].name}`;
      J.meshes.push({ name: nm, primitives: [{ attributes: at, indices: J.accessors.length - 1, material: MT.get(mk) }] }); J.nodes.push({ name: nm, mesh: J.meshes.length - 1 }); J.scenes[0].nodes.push(J.nodes.length - 1); t += u.length / 3;
    } return t;
  }, save(file) {
    const bl = off + ((4 - (off % 4)) % 4), bin = new Uint8Array(bl); let o = 0; for (const c of chunks) { bin.set(c, o); o += c.byteLength; } J.buffers.push({ byteLength: bl });
    let js = new TextEncoder().encode(JSON.stringify(J)); const jp = (4 - (js.length % 4)) % 4; if (jp) { const q = new Uint8Array(js.length + jp).fill(0x20); q.set(js); js = q; }
    const G = new Uint8Array(28 + js.length + bl), dv = new DataView(G.buffer); dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true); dv.setUint32(8, G.length, true); dv.setUint32(12, js.length, true); dv.setUint32(16, 0x4E4F534A, true); G.set(js, 20); dv.setUint32(20 + js.length, bl, true); dv.setUint32(24 + js.length, 0x004E4942, true); G.set(bin, 28 + js.length);
    Deno.writeFileSync(OUT + file + '.glb', G); console.log(`${file}.glb: мешей ${J.meshes.length}, материалов ${J.materials.length}, картинок ${J.images.length}, ${(G.length / 1048576).toFixed(1)} МБ`); } };
}
const todo = Deno.args.length ? Deno.args : ['c', 'w', 'a', 'x', 'pr'];
for (const q of todo) if (PACKS[q]) { const [file, L, LV = [0, 1, 2]] = PACKS[q], W = writer(); for (const [k, p] of L) for (const l of LV) await W.add(k, l, p + (l ? `_lod${l}` : '') + '.glb'); W.save(file); }
if (todo.includes('pr')) for (const k of ['pr_oldtree', 'pr_deadtree']) { const W = writer(); await W.add(k, 1, `${SRC}/старые/${k}_lod1.glb`, true); W.save(k); }
Deno.removeSync(tmp, { recursive: true });
