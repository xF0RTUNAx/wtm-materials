// Шум для шейдеров земли — текстурой (оптимизация 2026-10-24: на телефоне земля — до половины времени видеокарты в кадре; шум vn() с четырьмя
// sin-хэшами — 17–24 вызова на пиксель зимы и осени, vns() города — 13). Value noise: 4 канала — независимые решётки, 128 клеток на период,
// 4 текселя на клетку (сглаживание smoothstep посчитано в текселях, между ними — билинейно), мипмапы — вдали шум не рябит.
// Вызов в шейдере: NOISE_GLSL даёт vnt(p) — как vn(p) / vns(p) (решётка на целых p); ?tn=0 — прежний шум (сравнение).
/* global THREE */
export const NOISE_ON = typeof location === 'undefined' || !/[?&]tn=0/.test(location.search);
export const NOISE_GLSL = 'uniform sampler2D tNoise;\nfloat vnt(vec2 p) { return texture2D(tNoise, p * 0.0078125).r; }\n'; // 1/128
let tex = null;
export function noiseTex() {
  if (tex) return tex;
  const S = 512, C = 128, K = S / C, d = new Uint8Array(S * S * 4), lat = new Float32Array(C * C * 4);
  let s = 20261024; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < lat.length; i++) lat[i] = rnd();
  const L = (x, y, c) => lat[((((y % C) + C) % C) * C + (((x % C) + C) % C)) * 4 + c];
  const sm = (f) => f * f * (3 - 2 * f);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const px = (i + 0.5) / K, py = (j + 0.5) / K, x0 = Math.floor(px), y0 = Math.floor(py), fx = sm(px - x0), fy = sm(py - y0), q = (j * S + i) * 4;
    for (let c = 0; c < 4; c++) {
      const a = L(x0, y0, c) + (L(x0 + 1, y0, c) - L(x0, y0, c)) * fx, b = L(x0, y0 + 1, c) + (L(x0 + 1, y0 + 1, c) - L(x0, y0 + 1, c)) * fx;
      d[q + c] = Math.round((a + (b - a) * fy) * 255);
    }
  }
  tex = new THREE.DataTexture(d, S, S, THREE.RGBAFormat); tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true; tex.needsUpdate = true;
  return tex;
}
