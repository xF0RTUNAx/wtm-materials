// Покров земли (Свои/Покров земли, сборщик периферии 2026-11-15) → один игровой файл games/airdef/models/gc.glb:
//   deno run -A tools/airdef-models/gc-pack.js [--size=1024]
// В исходниках у каждого из 65 glb свой экземпляр атласа (4-16 МБ на модель); в игре - один файл, каждый атлас по одному разу:
// A, B, C, E - карточки травы и цветов (PNG с альфой), K - камни и обломки, D - дерево, мох, грибы (цвет JPEG + нормали).
// Меш «<ключ>|gc_<атлас>» на каждую пару модель × атлас (игра читает только первый примитив меша, матрицы узлов не применяет -
// координаты запекаются). Карта ORM («матовая») не нужна: материал игры матовый.
import { readGlb, flatten } from './glb.js';

const HOME = Deno.env.get('HOME'), SRC = `${HOME}/Downloads/Воздушное превосходство/Модели/Свои/Покров земли`;
const OUT = new URL('../../games/airdef/models/gc.glb', import.meta.url).pathname;
const SIZE = +((Deno.args.find((a) => a.startsWith('--size=')) || '--size=1024').slice(7));
const ATL = { A: 'трава', B: 'трава2', C: 'трава3', E: 'трава4', K: 'камни', D: 'дерево' }, CARD = new Set(['A', 'B', 'C', 'E']);
const pass = JSON.parse(Deno.readTextFileSync(`${SRC}/ПАСПОРТ.json`));
const tmp = Deno.makeTempDirSync({ prefix: 'gcpack' });
const sips = (a) => { const o = new Deno.Command('sips', { args: a, stdout: 'null', stderr: 'piped' }).outputSync(); if (!o.success) throw new Error(new TextDecoder().decode(o.stderr)); };
// картинка атласа: уменьшить до SIZE; цвет карточек - PNG (альфа), остальное - JPEG
// цвет карточек - с заливкой под прозрачными пикселями (alpha-fill.py: иначе вдали тонкие стебли бледнеют в мипмапах); Python с numpy - из Blender
const PY = Deno.env.get('PY') || '/Applications/Blender.app/Contents/Resources/5.2/python/bin/python3.13';
function img(file, png) {
  const out = `${tmp}/${file}.${png ? 'png' : 'jpg'}`;
  if (png) { const o = new Deno.Command(PY, { args: [new URL('./alpha-fill.py', import.meta.url).pathname, `${SRC}/атлас/${file}.png`, out, String(SIZE)], stderr: 'piped' }).outputSync(); if (!o.success) throw new Error(new TextDecoder().decode(o.stderr)); return Deno.readFileSync(out); }
  sips(['-Z', String(SIZE), ...(png ? [] : ['-s', 'format', 'jpeg', '-s', 'formatOptions', '90']), `${SRC}/атлас/${file}.png`, '--out', out]);
  return Deno.readFileSync(out);
}

// ── буфер и описание ──
const chunks = []; let off = 0;
const J = { asset: { version: '2.0', generator: 'gc-pack.js' }, scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], accessors: [], bufferViews: [], buffers: [], images: [], textures: [], samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }], materials: [] };
const view = (u8, target) => { const pad = (4 - (off % 4)) % 4; if (pad) { chunks.push(new Uint8Array(pad)); off += pad; } J.bufferViews.push({ buffer: 0, byteOffset: off, byteLength: u8.byteLength, ...(target ? { target } : {}) }); chunks.push(u8); off += u8.byteLength; return J.bufferViews.length - 1; };
const accF = (arr, n, minmax) => { const bv = view(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength), 34962); const a = { bufferView: bv, componentType: 5126, count: arr.length / n, type: ['', 'SCALAR', 'VEC2', 'VEC3', 'VEC4'][n] };
  if (minmax) { const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (let i = 0; i < arr.length; i += 3) for (let d = 0; d < 3; d++) { mn[d] = Math.min(mn[d], arr[i + d]); mx[d] = Math.max(mx[d], arr[i + d]); } a.min = mn; a.max = mx; }
  J.accessors.push(a); return J.accessors.length - 1; };
const accI = (arr) => { const u = arr.length && Math.max(...arr) > 65535 ? Uint32Array.from(arr) : Uint16Array.from(arr); const bv = view(new Uint8Array(u.buffer), 34963); J.accessors.push({ bufferView: bv, componentType: u instanceof Uint32Array ? 5125 : 5123, count: u.length, type: 'SCALAR' }); return J.accessors.length - 1; };
const tex = (u8, mime) => { J.images.push({ bufferView: view(u8), mimeType: mime }); J.textures.push({ sampler: 0, source: J.images.length - 1 }); return J.textures.length - 1; };

// материалы: по одному на атлас
const MAT = {};
for (const [L, f] of Object.entries(ATL)) {
  const card = CARD.has(L), c = tex(img(`${f}_цвет`, card), card ? 'image/png' : 'image/jpeg');
  const m = { name: `gc_${L}`, pbrMetallicRoughness: { baseColorTexture: { index: c }, metallicFactor: 0, roughnessFactor: 1 } };
  if (card) Object.assign(m, { alphaMode: 'MASK', alphaCutoff: 0.45 }); else m.normalTexture = { index: tex(img(`${f}_нормали`, false), 'image/jpeg') };
  J.materials.push(m); MAT[L] = J.materials.length - 1;
}

// модели
let tris = 0;
for (const key of pass.keys) {
  const g = readGlb(Deno.readFileSync(`${SRC}/${key}.glb`)), per = new Map();
  for (const p of flatten(g)) {
    const L = (g.json.materials[p.material].name || '').replace(/^gc_/, ''); if (!ATL[L]) throw new Error(`${key}: материал ${g.json.materials[p.material].name}`);
    const e = per.get(L) || per.set(L, { P: [], N: [], U: [], I: [] }).get(L), b = e.P.length / 3;
    e.P.push(...p.P); e.N.push(...p.N); e.U.push(...p.UV); for (const i of p.I) e.I.push(i + b);
  }
  for (const [L, e] of per) {
    const prim = { attributes: { POSITION: accF(Float32Array.from(e.P), 3, true), NORMAL: accF(Float32Array.from(e.N), 3), TEXCOORD_0: accF(Float32Array.from(e.U), 2) }, indices: accI(e.I), material: MAT[L] };
    J.meshes.push({ name: `${key}|gc_${L}`, primitives: [prim] }); J.nodes.push({ name: `${key}|gc_${L}`, mesh: J.meshes.length - 1 }); J.scenes[0].nodes.push(J.nodes.length - 1);
    tris += e.I.length / 3;
  }
}
const binLen = off + ((4 - (off % 4)) % 4), bin = new Uint8Array(binLen); { let o = 0; for (const c of chunks) { bin.set(c, o); o += c.byteLength; } }
J.buffers.push({ byteLength: binLen });
let js = new TextEncoder().encode(JSON.stringify(J)); const jp = (4 - (js.length % 4)) % 4; if (jp) { const t = new Uint8Array(js.length + jp).fill(0x20); t.set(js); js = t; }
const glb = new Uint8Array(12 + 8 + js.length + 8 + binLen), dv = new DataView(glb.buffer);
dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true); dv.setUint32(8, glb.length, true);
dv.setUint32(12, js.length, true); dv.setUint32(16, 0x4E4F534A, true); glb.set(js, 20);
dv.setUint32(20 + js.length, binLen, true); dv.setUint32(24 + js.length, 0x004E4942, true); glb.set(bin, 28 + js.length);
Deno.writeFileSync(OUT, glb); Deno.removeSync(tmp, { recursive: true });
console.log(`gc.glb: ${pass.keys.length} моделей, ${J.meshes.length} мешей, ${tris} треугольников, ${(glb.length / 1048576).toFixed(1)} МБ (атласы ${SIZE})`);
