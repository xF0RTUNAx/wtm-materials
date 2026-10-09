// Разбор GLB без зависимостей: JSON, бинарный буфер, чтение accessor'ов; поиск связных частей меша (шасси, ракеты,
// подвеска у моделей, склеенных в один меш) — для анализа и вырезания лишнего перед подключением в игру.
export function readGlb(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jl = dv.getUint32(12, true), json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jl)));
  const bl = dv.getUint32(20 + jl, true), bin = bytes.subarray(28 + jl, 28 + jl + bl);
  return { json, bin };
}
const CT = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array };
const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
export function accessor(g, i) {
  const a = g.json.accessors[i], bv = g.json.bufferViews[a.bufferView], T = CT[a.componentType], n = NC[a.type];
  const off = (bv.byteOffset || 0) + (a.byteOffset || 0), stride = bv.byteStride || n * T.BYTES_PER_ELEMENT;
  const out = new T(a.count * n), src = new DataView(g.bin.buffer, g.bin.byteOffset + off);
  for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) {
    const o = k * stride + c * T.BYTES_PER_ELEMENT;
    out[k * n + c] = T === Float32Array ? src.getFloat32(o, true) : T === Uint32Array ? src.getUint32(o, true) : T === Uint16Array ? src.getUint16(o, true) : src.getUint8(o);
  }
  return { data: out, n, count: a.count };
}
// связные части: вершины, совпадающие по положению (сварка с точностью q), объединяются через треугольники
export function components(P, I, q = 0.01) {
  const nv = P.length / 3, wid = new Int32Array(nv), map = new Map();
  for (let v = 0; v < nv; v++) { const k = `${Math.round(P[v * 3] / q)},${Math.round(P[v * 3 + 1] / q)},${Math.round(P[v * 3 + 2] / q)}`; let id = map.get(k); if (id === undefined) map.set(k, id = map.size); wid[v] = id; }
  const par = new Int32Array(map.size).map((_, i) => i);
  const f = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  for (let t = 0; t < I.length; t += 3) { const a = f(wid[I[t]]); par[f(wid[I[t + 1]])] = a; par[f(wid[I[t + 2]])] = a; }
  const comp = new Int32Array(I.length / 3), info = new Map();
  for (let t = 0; t < comp.length; t++) {
    const r = f(wid[I[t * 3]]); comp[t] = r;
    let c = info.get(r); if (!c) info.set(r, c = { id: r, tris: 0, min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] });
    c.tris++;
    for (let k = 0; k < 3; k++) { const v = I[t * 3 + k]; for (let d = 0; d < 3; d++) { const x = P[v * 3 + d]; if (x < c.min[d]) c.min[d] = x; if (x > c.max[d]) c.max[d] = x; } }
  }
  return { comp, list: [...info.values()].sort((a, b) => b.tris - a.tris) };
}

// ── мировые матрицы узлов: все примитивы сцены с позициями и нормалями в общих осях ──
const mul = (a, b) => { const o = new Array(16).fill(0); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
function trs(n) {
  if (n.matrix) return n.matrix.slice();
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1], [tx, ty, tz] = n.translation || [0, 0, 0];
  return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
}
export function flatten(g, { raw = false } = {}) { // raw — без матриц узлов (координаты мешей как есть)
  const out = [], J = g.json;
  const walk = (i, M, path) => {
    const n = J.nodes[i], W = raw ? M : mul(M, trs(n)), name = [...path, n.name || `#${i}`];
    if (n.mesh !== undefined) for (const [pi, p] of J.meshes[n.mesh].primitives.entries()) {
      const P0 = accessor(g, p.attributes.POSITION).data, N0 = p.attributes.NORMAL !== undefined ? accessor(g, p.attributes.NORMAL).data : null;
      const P = new Float32Array(P0.length), N = N0 ? new Float32Array(N0.length) : null;
      for (let v = 0; v < P0.length; v += 3) {
        const x = P0[v], y = P0[v + 1], z = P0[v + 2];
        P[v] = W[0] * x + W[4] * y + W[8] * z + W[12]; P[v + 1] = W[1] * x + W[5] * y + W[9] * z + W[13]; P[v + 2] = W[2] * x + W[6] * y + W[10] * z + W[14];
        if (N) { const a = N0[v], b = N0[v + 1], c = N0[v + 2]; let nx = W[0] * a + W[4] * b + W[8] * c, ny = W[1] * a + W[5] * b + W[9] * c, nz = W[2] * a + W[6] * b + W[10] * c; const l = Math.hypot(nx, ny, nz) || 1; N[v] = nx / l; N[v + 1] = ny / l; N[v + 2] = nz / l; }
      }
      const I = p.indices !== undefined ? accessor(g, p.indices).data : Uint32Array.from({ length: P.length / 3 }, (_, k) => k);
      const UV = p.attributes.TEXCOORD_0 !== undefined ? accessor(g, p.attributes.TEXCOORD_0).data : null;
      out.push({ node: i, path: name.join('/'), mesh: n.mesh, prim: pi, material: p.material, P, N, UV, I });
    }
    for (const c of n.children || []) walk(c, W, name);
  };
  const I4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const r of J.scenes[J.scene || 0].nodes) walk(r, I4, []);
  return out;
}
export function bbox(P) { const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (let i = 0; i < P.length; i += 3) for (let d = 0; d < 3; d++) { mn[d] = Math.min(mn[d], P[i + d]); mx[d] = Math.max(mx[d], P[i + d]); } return { mn, mx }; }
