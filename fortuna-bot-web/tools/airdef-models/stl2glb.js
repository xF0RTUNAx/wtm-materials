// STL (двоичный или текстовый) → glb для prepare.js: модели для печати (Thingiverse) — без текстур, плоские нормали (рёбра острые),
// один материал на файл; несколько STL — несколько мешей в одном glb (имя меша = имя файла). Лицензия и автор — в asset.extras,
// как у Sketchfab (prepare.js --credits читает их оттуда).
//   deno run -A tools/airdef-models/stl2glb.js <выход.glb> '<название>' '<автор>' '<ссылка>' 'CC-BY-4.0' a.stl [b.stl@dx,dy,dz …]
// @dx,dy,dz — сдвиг части (детали для печати лежат каждая в своих осях: пусковую — на гнездо шасси)
const [out, title, author, url, license, ...files] = Deno.args;
function readStl(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), n = dv.getUint32(80, true);
  const tris = [];
  if (84 + n * 50 === bytes.length) { // двоичный
    for (let i = 0; i < n; i++) { const o = 84 + i * 50 + 12; const t = []; for (let k = 0; k < 9; k++) t.push(dv.getFloat32(o + k * 4, true)); tris.push(t); }
  } else { // текстовый
    const v = [...new TextDecoder().decode(bytes).matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
    for (let i = 0; i + 2 < v.length; i += 3) tris.push([...v[i], ...v[i + 1], ...v[i + 2]]);
  }
  const P = new Float32Array(tris.length * 9), N = new Float32Array(tris.length * 9);
  tris.forEach((t, i) => {
    P.set(t, i * 9);
    const ux = t[3] - t[0], uy = t[4] - t[1], uz = t[5] - t[2], vx = t[6] - t[0], vy = t[7] - t[1], vz = t[8] - t[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    for (let k = 0; k < 3; k++) N.set([nx, ny, nz], i * 9 + k * 3);
  });
  return { P, N, count: tris.length * 3 };
}
const chunks = [], views = [], accs = [], meshes = [], nodes = [], materials = [];
let off = 0;
const add = (arr, target) => { const b = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength); chunks.push(b); views.push({ buffer: 0, byteOffset: off, byteLength: b.length, target }); off += b.length; const pad = (4 - (off % 4)) % 4; if (pad) { chunks.push(new Uint8Array(pad)); off += pad; } return views.length - 1; };
for (const arg of files) {
  const [f, sh] = arg.split('@'), d = sh ? sh.split(',').map(Number) : [0, 0, 0];
  const { P, N, count } = readStl(Deno.readFileSync(f)), name = f.split('/').pop().replace(/\.stl$/i, '');
  for (let i = 0; i < P.length; i += 3) { P[i] += d[0]; P[i + 1] += d[1]; P[i + 2] += d[2]; }
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], P[i + k]); mx[k] = Math.max(mx[k], P[i + k]); }
  const I = new Uint32Array(count); for (let i = 0; i < count; i++) I[i] = i;
  const pa = accs.push({ bufferView: add(P, 34962), componentType: 5126, count, type: 'VEC3', min: mn, max: mx }) - 1;
  const na = accs.push({ bufferView: add(N, 34962), componentType: 5126, count, type: 'VEC3' }) - 1;
  const ia = accs.push({ bufferView: add(I, 34963), componentType: 5125, count, type: 'SCALAR' }) - 1;
  materials.push({ name, pbrMetallicRoughness: { baseColorFactor: [0.6, 0.6, 0.6, 1], metallicFactor: 0, roughnessFactor: 0.8 } });
  meshes.push({ name, primitives: [{ attributes: { POSITION: pa, NORMAL: na }, indices: ia, material: materials.length - 1 }] });
  nodes.push({ name, mesh: meshes.length - 1 });
  console.log(`${name}: ${count / 3} треугольников, габариты`, mn.map((v, k) => (mx[k] - v).toFixed(2)).join(' × '));
}
const json = { asset: { version: '2.0', generator: 'stl2glb.js', extras: { title, author, source: url, license } }, scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }], nodes, meshes, materials, accessors: accs, bufferViews: views, buffers: [{ byteLength: off }] };
const enc = new TextEncoder().encode(JSON.stringify(json)), jl = Math.ceil(enc.length / 4) * 4, J = new Uint8Array(jl).fill(0x20); J.set(enc);
const total = 12 + 8 + jl + 8 + off, o = new Uint8Array(total), dv = new DataView(o.buffer);
dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
dv.setUint32(12, jl, true); dv.setUint32(16, 0x4e4f534a, true); o.set(J, 20);
dv.setUint32(20 + jl, off, true); dv.setUint32(24 + jl, 0x004e4942, true); let p = 28 + jl; for (const c of chunks) { o.set(c, p); p += c.length; }
Deno.writeFileSync(out, o); console.log('→', out, (total / 1024).toFixed(0), 'КБ');
