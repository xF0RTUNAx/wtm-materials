// Посадка подвески на пилон: арифметика по таблице seats-data.js (её считает tools/airdef-headless/seats-gen.js заранее, чтобы в бою не было лучей и подвисаний).
// Запись точки подвески: [вид, x, y, z, c, t]. Вид: 0 - не сажать; 1 - дорисованный пилон, низ на y, верх на t (крыло); 2 - пилон автора, низ на y; 3 - вплотную к обшивке (контейнер). c - низ крыла рядом: туда не должны входить перья.
// Запись оружия: [t, r, L, x, z, sh]: верх корпуса над началом модели, насколько перья выше корпуса, длина, середина по x и z, как опускается плечо корпуса на 0,1 м от оси (null - корпус уже).
export const RACK_H = 0.06;
const DROP_MAX = 0.45, RING = [[0, 0.5], [0.5, 0.17], [0.5, -0.17], [0, -0.5], [-0.5, -0.17], [-0.5, 0.17]];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// лезвие: кромки острые, снизу короче и сдвинуто назад (нос модели к -z); центр по высоте в (cx, cy, cz)
export function pylonTris(v, h, L, w, cx, cy, cz) {
  const loop = (y, kL, kW, dz) => RING.map(([x, z]) => [cx + x * w * kW, cy + y, cz + z * L * kL + dz]);
  const T = loop(h / 2, 1, 1, 0), B = loop(-h / 2, 0.72, 0.85, L * 0.07), tri = (a, b, c) => v.push(...a, ...b, ...c);
  for (let i = 0; i < 6; i++) { const j = (i + 1) % 6; tri(B[i], B[j], T[j]); tri(B[i], T[j], T[i]); }
  for (let i = 1; i < 5; i++) { tri(T[0], T[i], T[i + 1]); tri(B[0], B[i + 1], B[i]); }
}
export function geoOf(v) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals(); return g; }
// брусок от a к b в плоскости xy: w - по z, d - поперёк
function beam(v, a, b, w, d) {
  const dx = b[0] - a[0], dy = b[1] - a[1], k = d / 2 / (Math.hypot(dx, dy) || 1), sx = -dy * k, sy = dx * k, c = [];
  for (const e of [a, b]) for (const [s, t] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) c.push([e[0] + s * sx, e[1] + s * sy, e[2] + t * w / 2]);
  for (const [i, j, q, r] of [[3, 2, 1, 0], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]) v.push(...c[i], ...c[j], ...c[q], ...c[i], ...c[q], ...c[r]);
}
// балка на подвеске и упоры на плечи корпуса
function rack(v, x, z, L, yT, top, sh) {
  const len = clamp(L * 0.3, 0.4, 0.9);
  beam(v, [x, yT, z], [x, yT - RACK_H, z], len, 0.11);
  if (sh != null && sh < 0.2) for (const dz of [-len * 0.36, len * 0.36]) for (const s of [-1, 1]) beam(v, [x + s * 0.05, yT - RACK_H * 0.5, z + dz], [x + s * 0.1, top - sh - 0.004, z + dz], 0.03, 0.022);
}
// положение начала модели подвески; балка и надставка дописываются в v
export function seatOne(p, s, v) {
  const [k, x, y, z, c] = p, [t, r, L, wx, wz, sh] = s, ch = clamp(L * 0.55, 0.6, 1.6);
  const finDrop = (top) => (r >= 0.06 ? Math.min(DROP_MAX, Math.max(0, top + r + 0.02 - c)) : 0);
  let top;
  if (k === 3) top = y - 0.012;
  else if (k === 2) {
    const d = finDrop(y + 0.012);
    if (d <= 0.03) top = y + 0.012;
    else { const h = Math.max(d, RACK_H + 0.03), yT = y - h + RACK_H, hp = h - RACK_H + 0.04; top = y - h; rack(v, x, z, L, yT, top, sh); pylonTris(v, hp, Math.min(ch, 0.9), 0.08, x, yT + hp / 2, z); }
  } else {
    const d = finDrop(y - RACK_H), yB = y - d; top = yB - RACK_H; rack(v, x, z, L, yB, top, sh);
    if (d > 0.01) { const hp = d + 0.03; pylonTris(v, hp, Math.min(ch, 1), 0.1, x, yB + hp / 2, z); }
  }
  return [x - wx, top - t, z - wz];
}
