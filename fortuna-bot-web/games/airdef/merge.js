// Слияние сеток (2026-10-23, нагрев телефонов: каждая сетка — отдельный вызов отрисовки, а на телефоне вызов в разы дороже, чем на ПК).
// mergeLocal — несколько геометрий в одну, каждая со своей матрицей: только использованные вершины, позиции и нормали — в общие оси,
// упакованные целые (цвет затенения — байты) — как были, если у всех одного вида, иначе в float. bakeGroup — неподвижная группа: сетки с одним
// материалом и тенью — в одну (подвижные части — винты, и всё под скрытыми узлами — не трогает).
// Выглядит так же. Общие геометрии — по ключу (cache), если копии одинаковые (самолёты одной модели, одинаковые постройки)
/* global THREE */
const MN3 = new THREE.Matrix3(), MV = new THREE.Vector3(), M4 = new THREE.Matrix4();
const NK = (A) => (!A.normalized ? 1 : A.array instanceof Uint8Array ? 1 / 255 : A.array instanceof Uint16Array ? 1 / 65535 : A.array instanceof Int8Array ? 1 / 127 : A.array instanceof Int16Array ? 1 / 32767 : 1);
const AV = (A, i, q) => (A.isInterleavedBufferAttribute ? A.data.array[i * A.data.stride + A.offset + q] : A.array[i * A.itemSize + q]);
const AT = (A) => (A.isInterleavedBufferAttribute ? A.data.array : A.array).constructor;
export function mergeLocal(list) { // [{ g, m }] → THREE.BufferGeometry
  const g0 = list[0].g, names = Object.keys(g0.attributes).filter((a) => list.every(({ g }) => g.attributes[a] && g.attributes[a].itemSize === g0.attributes[a].itemSize));
  const maps = list.map(({ g }) => { const n = g.attributes.position.count, ix = g.index ? g.index.array : null, L = ix ? ix.length : n, used = new Int32Array(n).fill(-1), ord = [];
    for (let t = 0; t < L; t++) { const v = ix ? ix[t] : t; if (used[v] < 0) { used[v] = ord.length; ord.push(v); } } return { used, ord, L, ix }; });
  const nv = maps.reduce((s, q) => s + q.ord.length, 0), ni = maps.reduce((s, q) => s + q.L, 0), out = new THREE.BufferGeometry(), idx = new (nv > 65535 ? Uint32Array : Uint16Array)(ni);
  for (const a of names) {
    const A0 = g0.attributes[a], s = A0.itemSize, P0 = a === 'position' || (a === 'normal' && s === 3);
    const raw = !P0 && A0.normalized && list.every(({ g }) => g.attributes[a].normalized && AT(g.attributes[a]) === AT(A0)); // байты цвета — байтами (память)
    const arr = new (raw ? AT(A0) : Float32Array)(nv * s); let o = 0;
    list.forEach(({ g, m }, j) => {
      const A = g.attributes[a], k = raw ? 1 : NK(A), P3 = a === 'position', N3 = a === 'normal' && s === 3; if (N3) MN3.getNormalMatrix(m);
      for (const v of maps[j].ord) {
        if (P3 || N3) { MV.set(AV(A, v, 0) * k, AV(A, v, 1) * k, AV(A, v, 2) * k); if (P3) MV.applyMatrix4(m); else MV.applyMatrix3(MN3).normalize(); arr[o++] = MV.x; arr[o++] = MV.y; arr[o++] = MV.z; }
        else for (let c = 0; c < s; c++) arr[o++] = AV(A, v, c) * k;
      }
    });
    out.setAttribute(a, new THREE.BufferAttribute(arr, s, raw));
  }
  let io = 0, vo = 0; for (const { used, ord, L, ix } of maps) { for (let t = 0; t < L; t++) idx[io++] = used[ix ? ix[t] : t] + vo; vo += ord.length; }
  out.setIndex(new THREE.BufferAttribute(idx, 1)); out.computeBoundingSphere(); return out;
}
// неподвижная группа: все сетки внутри (кроме keep(q)) — по одной на материал / тень / видимость / порядок вывода, в осях группы.
// cache + key — общая геометрия для одинаковых групп
export function bakeGroup(root, keep = () => false, cache = null, key = '') {
  root.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), by = new Map();
  const held = (q) => { for (let p = q; p && p !== root; p = p.parent) if ((p !== q && !p.visible) || p.userData.hub || p.userData.spin) return true; return false; }; // под скрытым узлом (стал бы виден) или вращается
  root.traverse((q) => { if (!q.isMesh || q.isInstancedMesh || q.isSkinnedMesh || !q.material || Array.isArray(q.material) || q.morphTargetInfluences || held(q) || keep(q)) return;
    const k = `${q.material.uuid}|${q.visible ? 1 : 0}${q.castShadow ? 1 : 0}${q.receiveShadow ? 1 : 0}|${q.renderOrder}`; (by.get(k) || by.set(k, []).get(k)).push(q); });
  let n = 0;
  for (const [k, L] of by) {
    if (L.length < 2) continue;
    const ck = key && key + '|' + k.split('|').slice(1).join('|') + '|' + L.map((q) => q.geometry.uuid + ':' + M4.multiplyMatrices(inv, q.matrixWorld).elements.map((e) => e.toFixed(3)).join(',')).join(';');
    let g = cache && ck ? cache.get(ck) : null;
    if (!g) { g = mergeLocal(L.map((q) => ({ g: q.geometry, m: new THREE.Matrix4().multiplyMatrices(inv, q.matrixWorld) }))); if (cache && ck) cache.set(ck, g); }
    const s = L[0], mm = new THREE.Mesh(g, s.material);
    mm.castShadow = s.castShadow; mm.receiveShadow = s.receiveShadow; mm.renderOrder = s.renderOrder; mm.visible = s.visible; mm.userData = { ...s.userData, baked: L.length }; mm.name = s.name;
    root.add(mm); for (const q of L) if (q.parent) q.parent.remove(q); n += L.length - 1;
  }
  // пустые группы-узлы (остались без сеток) — убрать, чтобы их матрицы не пересчитывались каждый кадр
  const empty = []; root.traverse((q) => { if (q !== root && !q.isMesh && q.children.length === 0 && q.type === 'Group') empty.push(q); }); for (const q of empty) if (q.parent) q.parent.remove(q);
  return n;
}
