// Простой программный растеризатор для осмотра моделей без браузера: ортографические виды (сбоку, сверху, спереди,
// ¾), z-буфер, освещение по нормали треугольника; цвет — по треугольнику. Пишет PPM (sips конвертирует в PNG).
export function render(P, I, triColor, { w = 900, h = 450, view = 'side', box = null, marks = [] } = {}) {
  const img = new Uint8Array(w * h * 3).fill(235), zb = new Float32Array(w * h).fill(-1e30);
  // оси вида: u — вправо, v — вверх, d — к зрителю
  const V = {
    side: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], bottom: [[1, 0, 0], [0, 0, 1], [0, -1, 0]], top: [[1, 0, 0], [0, 0, -1], [0, 1, 0]], front: [[0, 0, -1], [0, 1, 0], [1, 0, 0]],
    iso: [[0.71, 0, 0.71], [-0.35, 0.87, 0.35], [-0.61, -0.5, 0.61]],
  }[view];
  const n = P.length / 3, U = new Float32Array(n), Vv = new Float32Array(n), D = new Float32Array(n);
  let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
  for (let i = 0; i < n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    U[i] = x * V[0][0] + y * V[0][1] + z * V[0][2]; Vv[i] = x * V[1][0] + y * V[1][1] + z * V[1][2]; D[i] = x * V[2][0] + y * V[2][1] + z * V[2][2];
    if (!box) { u0 = Math.min(u0, U[i]); u1 = Math.max(u1, U[i]); v0 = Math.min(v0, Vv[i]); v1 = Math.max(v1, Vv[i]); }
  }
  if (box) [u0, u1, v0, v1] = box;
  const s = Math.min((w - 20) / (u1 - u0), (h - 20) / (v1 - v0)), cx = w / 2 - (u0 + u1) / 2 * s, cy = h / 2 + (v0 + v1) / 2 * s;
  const L = [0.4, 0.8, 0.45];
  for (let t = 0; t < I.length / 3; t++) {
    const col = triColor(t); if (!col) continue;
    const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2];
    const ax = P[b * 3] - P[a * 3], ay = P[b * 3 + 1] - P[a * 3 + 1], az = P[b * 3 + 2] - P[a * 3 + 2];
    const bx = P[c * 3] - P[a * 3], by = P[c * 3 + 1] - P[a * 3 + 1], bz = P[c * 3 + 2] - P[a * 3 + 2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx; const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    const sh = 0.35 + 0.65 * Math.abs(nx * L[0] + ny * L[1] + nz * L[2]);
    const X = [a, b, c].map((i) => cx + U[i] * s), Y = [a, b, c].map((i) => cy - Vv[i] * s), Z = [a, b, c].map((i) => D[i]);
    const minX = Math.max(0, Math.floor(Math.min(...X))), maxX = Math.min(w - 1, Math.ceil(Math.max(...X)));
    const minY = Math.max(0, Math.floor(Math.min(...Y))), maxY = Math.min(h - 1, Math.ceil(Math.max(...Y)));
    const area = (X[1] - X[0]) * (Y[2] - Y[0]) - (X[2] - X[0]) * (Y[1] - Y[0]); if (Math.abs(area) < 1e-9) continue;
    for (let py = minY; py <= maxY; py++) for (let px = minX; px <= maxX; px++) {
      const w0 = ((X[1] - px) * (Y[2] - py) - (X[2] - px) * (Y[1] - py)) / area, w1 = ((X[2] - px) * (Y[0] - py) - (X[0] - px) * (Y[2] - py)) / area, w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const z = w0 * Z[0] + w1 * Z[1] + w2 * Z[2], k = py * w + px;
      if (z <= zb[k]) continue; zb[k] = z;
      img[k * 3] = col[0] * sh; img[k * 3 + 1] = col[1] * sh; img[k * 3 + 2] = col[2] * sh;
    }
  }
  // метки (точки подвески, сопла): красные квадраты поверх
  for (const [x, y, z] of marks) {
    const u = x * V[0][0] + y * V[0][1] + z * V[0][2], v = x * V[1][0] + y * V[1][1] + z * V[1][2], px = Math.round(cx + u * s), py = Math.round(cy - v * s);
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const X = px + dx, Y = py + dy; if (X >= 0 && Y >= 0 && X < w && Y < h) { const k = (Y * w + X) * 3; img[k] = 230; img[k + 1] = 20; img[k + 2] = 20; } }
  }
  return { w, h, img };
}
export function writePpm(path, { w, h, img }) {
  const head = new TextEncoder().encode(`P6\n${w} ${h}\n255\n`), out = new Uint8Array(head.length + img.length);
  out.set(head); out.set(img, head.length); Deno.writeFileSync(path, out);
}
