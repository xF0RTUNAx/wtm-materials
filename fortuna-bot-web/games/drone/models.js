// Процедурные модели: дрон игрока, ракеты (по параметрам vis из missiles.js), самолёты противника (пока не загрузились готовые модели), танкер.
// Каждая модель склеивается из примитивов в одну геометрию с цветами вершин (один draw call на объект).
// Нос всех летательных аппаратов — в −Z (как у fwd при yaw = 0), поворот задаётся rotation.set(pitch, yaw, roll) с порядком 'YXZ'.
/* global THREE */

const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
export function M(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _e.set(rx, ry, rz); _q.setFromEuler(_e); _s.set(sx, sy, sz); _p.set(x, y, z);
  return new THREE.Matrix4().compose(_p, _q, _s);
}
export function part(geo, color, m) { return { geo, color, m }; }
export function mergeParts(parts) {
  let total = 0;
  const gs = parts.map((p) => {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    for (const a of ['uv', 'uv2']) if (g.attributes[a]) g.deleteAttribute(a);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (p.m) g.applyMatrix4(p.m);
    total += g.attributes.position.count; return g;
  });
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
  let o = 0; const c = new THREE.Color();
  gs.forEach((g, i) => {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    c.set(parts[i].color).convertSRGBToLinear(); // цвета заданы в sRGB, освещение считается в линейном пространстве
    for (let k = 0; k < n; k++) { col[(o + k) * 3] = c.r; col[(o + k) * 3 + 1] = c.g; col[(o + k) * 3 + 2] = c.b; }
    o += n; g.dispose();
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}
// тело вращения вдоль оси Z: pts = [[радиус, z], …] (нос — в −Z)
export function latheZ(pts, seg = 16) {
  const g = new THREE.LatheGeometry(pts.map(([r, z]) => new THREE.Vector2(Math.max(0.0001, r), -z)), seg);
  g.rotateX(-Math.PI / 2);
  return g;
}
// плоская деталь по контуру (x, z), толщина вниз
export function plateXZ(pts, thick) {
  const sh = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false });
  g.rotateX(Math.PI / 2);
  return g;
}
// плоская деталь по контуру (z, y), толщина по X
export function plateZY(pts, thick) {
  const sh = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false });
  g.translate(0, 0, -thick / 2); g.rotateY(-Math.PI / 2);
  return g;
}
// раковина улитки: шары вдоль логарифмической спирали в плоскости YZ, чередование полос
export function snailShell(P, cx, cy, cz, R, color, spikes) {
  const base = new THREE.Color(color), dark = base.clone().offsetHSL(0, 0.05, -0.15);
  for (let i = 0; i < 13; i++) {
    const th = i * 0.62, rr = R * Math.exp(-0.15 * th), s = R * 1.05 * Math.exp(-0.15 * th);
    P.push(part(new THREE.SphereGeometry(1, 14, 10), i % 2 ? dark.getHex() : base.getHex(),
      M(cx, cy + Math.sin(-th + 2.2) * rr * 0.9, cz + Math.cos(-th + 2.2) * rr, 0, 0, 0, s * 0.72, s, s)));
  }
  if (spikes) for (let k = 0; k < 5; k++) P.push(part(new THREE.ConeGeometry(R * 0.12, R * 0.5, 6), 0xf5c518, M(cx + (k - 2) * R * 0.22, cy + R * 1.85 + (2 - Math.abs(k - 2)) * R * 0.06, cz)));
}
// глаза на стебельках (у носа, нос в −Z)
function eyeStalks(P, z, y, s) {
  for (const x of [-0.3, 0.3]) {
    P.push(part(new THREE.CylinderGeometry(0.05 * s, 0.07 * s, 1.0 * s, 6), 0xcdb37c, M(x * s, y + 0.45 * s, z - 0.1 * s, -0.5, 0, x * 0.4)));
    P.push(part(new THREE.SphereGeometry(0.17 * s, 10, 8), 0xffffff, M(x * 1.3 * s, y + 0.9 * s, z - 0.35 * s)));
    P.push(part(new THREE.SphereGeometry(0.08 * s, 8, 6), 0x111111, M(x * 1.3 * s, y + 0.93 * s, z - 0.5 * s)));
  }
}

// ═════════════ Ракеты ═════════════
function finSet(P, n, roll, rootC, tipC, span, sweep, zLE, bodyR, thick, color) {
  for (let k = 0; k < n; k++) {
    const g = plateZY([[0, 0], [rootC, 0], [sweep + tipC, span], [sweep, span]], thick);
    g.translate(0, bodyR, zLE); g.rotateZ(roll + k * Math.PI * 2 / n);
    P.push(part(g, color, null));
  }
}
function gridFins(P, roll, zc, bodyR, span, width, chord, color) {
  const bars = [], t = 0.012, y0 = bodyR + 0.03, y1 = bodyR + span;
  bars.push([0, y0, width, t], [0, y1, width, t], [-width / 2, (y0 + y1) / 2, t, span - 0.03], [width / 2, (y0 + y1) / 2, t, span - 0.03]);
  for (let i = 1; i < 3; i++) bars.push([0, y0 + (y1 - y0) * i / 3, width, t * 0.8]);
  for (let i = 1; i < 4; i++) bars.push([-width / 2 + width * i / 4, (y0 + y1) / 2, t * 0.8, span - 0.03]);
  for (let k = 0; k < 4; k++) {
    const a = roll + k * Math.PI / 2;
    for (const [bx, by, bw, bh] of bars) { const g = new THREE.BoxGeometry(bw, bh, chord); g.translate(bx, by, zc); g.rotateZ(a); P.push(part(g, color, null)); }
    const s = new THREE.BoxGeometry(0.02, 0.05, chord * 0.7); s.translate(0, bodyR + 0.02, zc); s.rotateZ(a); P.push(part(s, color, null));
  }
}
export function buildMissileGeo(v) {
  const P = [], L = v.L, r = v.r, n = -L / 2, t = L / 2, X = Math.PI / 4, nl = v.noseLen || r * 5;
  const finColor = new THREE.Color(v.color).multiplyScalar(0.86).getHex();
  // нос
  if (v.nose === 'ogive') {
    P.push(part(latheZ([[0.001, n], [r * 0.35, n + nl * 0.12], [r * 0.62, n + nl * 0.35], [r * 0.86, n + nl * 0.65], [r, n + nl]], 16), v.noseColor || v.color));
  } else if (v.nose === 'facet') {
    P.push(part(latheZ([[0.001, n], [r * 0.6, n + nl * 0.55], [r, n + nl]], 8), v.domeColor));
  } else { // купол ИК-головки
    P.push(part(latheZ([[r * 0.7, n + 0.03], [r * 0.9, n + nl * 0.5], [r, n + nl]], 16), v.color));
    P.push(part(new THREE.SphereGeometry(r * 0.7, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), v.domeColor || 0x1d3140, M(0, 0, n + 0.03, -Math.PI / 2)));
  }
  // корпус и сопло
  P.push(part(latheZ([[r, n + nl], [r, t - 0.04], [r * 0.82, t]], 16), v.color));
  P.push(part(new THREE.CylinderGeometry(r * 0.7, r * 0.78, 0.08, 12, 1, true), 0x2e2e2e, M(0, 0, t + 0.03, Math.PI / 2)));
  for (const [f, w, c] of v.bands || []) P.push(part(latheZ([[r + 0.003, n + L * f], [r + 0.003, n + L * f + w]], 16), c));
  for (const f of v.fins || []) finSet(P, f.n || 4, (f.roll ?? 45) * Math.PI / 180, f.root, f.tip, f.span, f.sweep, n + L * f.at, r, f.th || 0.012, f.color || finColor);
  if (v.rollerons) {
    const last = v.fins[v.fins.length - 1];
    for (let k = 0; k < 4; k++) { const g = new THREE.CylinderGeometry(0.045, 0.045, 0.02, 12); g.rotateZ(Math.PI / 2); g.rotateY(Math.PI / 2); g.translate(0, r + last.span, n + L * last.at + last.sweep + last.tip * 0.5); g.rotateZ(X + k * Math.PI / 2); P.push(part(g, 0x7d838a, null)); }
  }
  if (v.grid) gridFins(P, X, n + L * v.grid.at, r, v.grid.span, v.grid.width, v.grid.chord, finColor);
  if (v.intakes) for (const s of [-1, 1]) {
    P.push(part(new THREE.BoxGeometry(r * 0.7, r * 0.75, L * 0.3), v.color, M(s * r * 0.75, -r * 0.5, n + L * 0.62)));
    P.push(part(new THREE.BoxGeometry(r * 0.6, r * 0.6, 0.02), 0x1a1a1a, M(s * r * 0.75, -r * 0.5, n + L * 0.47)));
  }
  return mergeParts(P);
}

// ═════════════ Дрон игрока «Изделие Фортуна-1» ═════════════
// Бесхвостая схема с двумя развалёнными килями, верхний воздухозаборник, без кабины.
const C_BODY = 0x74818c, C_WING = 0x67737e, C_DARK = 0x1b1f23, C_NOSE = 0x5c6670, C_ORANGE = 0xea580c, C_PANEL = 0x5f6a74;
const LE = (x) => -2.6 + (x - 0.6) * (5.2 / 6.2);
const TE = (x) => 5.0 + (x - 0.6) * (-0.8 / 6.2);
// Точки подвески: законцовки (лёгкие ИК), средние, корневые, две подфюзеляжные (самые тяжёлые).
export const STATIONS = [
  { id: 'L3', side: -1, kind: 'tip' }, { id: 'L2', side: -1, kind: 'mid' }, { id: 'L1', side: -1, kind: 'inner' },
  { id: 'Ф1', side: -1, kind: 'belly' }, { id: 'Ф2', side: 1, kind: 'belly' },
  { id: 'R1', side: 1, kind: 'inner' }, { id: 'R2', side: 1, kind: 'mid' }, { id: 'R3', side: 1, kind: 'tip' },
];
const ST_X = { inner: 2.05, mid: 3.9, tip: 6.95, belly: 0.5 };
export function stationPos(i) {
  const st = STATIONS[i], x = ST_X[st.kind] * st.side, ax = Math.abs(x);
  if (st.kind === 'belly') return new THREE.Vector3(x, -1.0, 0.4);
  const zc = (LE(Math.min(ax, 6.8)) + TE(Math.min(ax, 6.8))) / 2 - 0.3;
  return st.kind === 'tip' ? new THREE.Vector3(x, -0.08, zc) : new THREE.Vector3(x, -0.62, zc);
}
export function buildShipGeo() {
  const P = [];
  const fus = latheZ([[0.001, -7.0], [0.3, -6.2], [0.62, -5.0], [0.9, -3.4], [1.08, -1.2], [1.1, 1.2], [1.0, 3.6], [0.82, 5.4], [0.64, 6.4]], 28);
  P.push(part(fus, C_BODY, M(0, 0, 0, 0, 0, 0, 1, 0.62, 1)));
  P.push(part(latheZ([[0.001, -7.02], [0.3, -6.22], [0.5, -5.5]], 28), C_NOSE, M(0, 0, 0, 0, 0, 0, 1, 0.62, 1)));
  P.push(part(new THREE.CylinderGeometry(0.02, 0.03, 1.4, 6), 0x2a2e33, M(0, 0, -7.6, Math.PI / 2))); // приёмник воздушного давления
  // горб и воздухозаборник
  P.push(part(new THREE.SphereGeometry(1, 24, 14), C_BODY, M(0, 0.42, 0.4, 0, 0, 0, 0.95, 0.5, 3.4)));
  P.push(part(new THREE.BoxGeometry(1.25, 0.34, 0.25), C_DARK, M(0, 0.62, -2.72)));
  P.push(part(new THREE.BoxGeometry(1.38, 0.08, 0.5), C_BODY, M(0, 0.82, -2.6, 0.12)));
  P.push(part(new THREE.BoxGeometry(0.05, 0.02, 3.6), C_PANEL, M(0, 0.93, 0.8))); // стыковочный шов
  for (const s of [1, -1]) {
    // крыло без элевонов (элевоны — отдельные подвижные меши)
    P.push(part(plateXZ([[0.6 * s, -2.6], [6.8 * s, 2.6], [6.8 * s, TE(6.8) - 0.5], [3.6 * s, TE(3.6) - 0.55], [0.6 * s, 5.0]], 0.16), C_WING, M(0, -0.05, 0)));
    P.push(part(plateXZ([[0.6 * s, -4.4], [1.3 * s, -2.2], [0.6 * s, -1.2]], 0.1), C_WING, M(0, 0.02, 0)));
    // панели и люки (тёмные «швы» на крыле)
    P.push(part(plateXZ([[1.4 * s, 0.4], [3.0 * s, 1.7], [3.0 * s, 1.75], [1.4 * s, 0.45]], 0.17), C_PANEL, M(0, -0.045, 0)));
    P.push(part(plateXZ([[1.2 * s, 2.6], [2.6 * s, 2.6], [2.6 * s, 3.6], [1.2 * s, 3.6]], 0.165), C_PANEL, M(0, -0.048, 0)));
    // кили с оранжевой законцовкой
    P.push(part(plateZY([[3.0, 0], [5.6, 0], [6.1, 2.3], [5.0, 2.3]], 0.1), C_WING, M(0.85 * s, 0.3, 0, 0, 0, -0.45 * s)));
    P.push(part(plateZY([[4.93, 2.05], [6.04, 2.05], [6.1, 2.3], [5.0, 2.3]], 0.12), C_ORANGE, M(0.85 * s, 0.3, 0, 0, 0, -0.45 * s)));
    // знаки и огни
    P.push(part(new THREE.CylinderGeometry(0.55, 0.55, 0.02, 20), C_ORANGE, M(4.4 * s, 0.12, 2.3)));
    P.push(part(new THREE.CylinderGeometry(0.28, 0.28, 0.03, 20), 0xf4efe6, M(4.4 * s, 0.125, 2.3)));
    P.push(part(new THREE.SphereGeometry(0.09, 8, 6), s > 0 ? 0x2cff6a : 0xff3030, M(6.82 * s, -0.02, 3.6)));
    // обтекатели антенн СПО на законцовках
    P.push(part(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 8), 0x3a4048, M(6.85 * s, -0.02, 4.3, Math.PI / 2)));
  }
  // пилоны
  for (let i = 0; i < STATIONS.length; i++) {
    const p = stationPos(i), st = STATIONS[i];
    if (st.kind === 'tip') P.push(part(new THREE.BoxGeometry(0.12, 0.14, 2.2), C_DARK, M(p.x, 0.02, p.z)));
    else if (st.kind === 'belly') P.push(part(new THREE.BoxGeometry(0.16, 0.3, 2.2), 0x4b545c, M(p.x, -0.72, p.z)));
    else P.push(part(new THREE.BoxGeometry(0.14, 0.34, 1.6), 0x4b545c, M(p.x, -0.36, p.z)));
  }
  // сопло с «зубчатой» кромкой, турбина, ОЭС, антенны
  P.push(part(new THREE.CylinderGeometry(0.66, 0.54, 1.0, 24, 1, true), 0x3b3e42, M(0, 0, 6.85, Math.PI / 2)));
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; P.push(part(new THREE.BoxGeometry(0.12, 0.03, 0.22), 0x2c2f33, M(Math.cos(a) * 0.62, Math.sin(a) * 0.62, 7.4, 0, 0, a))); }
  P.push(part(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 20), 0x111111, M(0, 0, 6.6, Math.PI / 2)));
  P.push(part(new THREE.ConeGeometry(0.22, 0.3, 12), 0x444444, M(0, 0, 6.5, Math.PI / 2)));
  P.push(part(new THREE.SphereGeometry(0.32, 16, 10), 0x2a2e33, M(0, -0.58, -4.4)));
  P.push(part(new THREE.SphereGeometry(0.14, 12, 8), 0x2b6a9a, M(0, -0.66, -4.66)));
  P.push(part(new THREE.BoxGeometry(0.05, 0.4, 0.3), C_DARK, M(0, 0.95, 1.8, -0.3)));
  P.push(part(new THREE.BoxGeometry(0.05, 0.22, 0.2), C_DARK, M(0, -0.72, 2.6, 0.3)));
  P.push(part(latheZ([[0.73, -4.7], [0.8, -4.3]], 28), C_ORANGE, M(0, 0, 0, 0, 0, 0, 1.01, 0.63, 1)));
  return mergeParts(P);
}
// элевон: плоскость в локальных координатах от оси шарнира (z = 0) назад
export function buildElevon(side) {
  const hz = TE(5.15) - 0.55;
  const g = plateXZ([[3.6 * side, TE(3.6) - 0.55 - hz], [6.8 * side, TE(6.8) - 0.5 - hz], [6.8 * side, TE(6.8) - hz], [3.6 * side, TE(3.6) - hz]], 0.15);
  return { geo: mergeParts([part(g, 0x59636c, null)]), hinge: new THREE.Vector3(0, -0.05, hz) };
}

// ═════════════ Самолёты противника (запасные, процедурные) ═════════════
// Вымышленные машины: беспилотные «улиточные» истребители с раковиной-горбом и глазами на стебельках.
export const JET_SPECS = {
  fighter:     { L: 14.5, R: 0.85, body: 0x7d8b76, shell: 0x7bd45a, wing: [[0.8, -1.5], [4.6, 3.2], [4.6, 4.2], [0.8, 5.5]], tails: 1, nozzles: 1, scale: 1 },
  interceptor: { L: 21, R: 1.2, body: 0x9aa0a6, shell: 0xe0b040, wing: [[1.2, -1.0], [7.0, 4.5], [7.0, 6.0], [1.2, 5.5]], tails: 2, nozzles: 2, stab: true, scale: 1 },
  ace:         { L: 17, R: 1.0, body: 0x3a3f4a, shell: 0x9b59b6, wing: [[1.0, -3.0], [6.0, 3.5], [6.0, 4.8], [1.0, 6.0]], tails: 2, cant: 0.45, nozzles: 2, chines: true, scale: 1 },
  boss:        { L: 42, R: 2.6, body: 0x6f5a7a, shell: 0x9b59b6, wing: [[2.6, -6], [22, 10], [22, 13], [2.6, 8]], tails: 1, ttail: true, pods: 4, scale: 1 },
};
export function buildJet(kind) {
  const S = JET_SPECS[kind], P = [], L = S.L, R = S.R, n = -L / 2;
  const dark = 0x25292e;
  const prof = [[0.001, n], [R * 0.35, n + L * 0.05], [R * 0.7, n + L * 0.14], [R * 0.95, n + L * 0.28], [R, n + L * 0.45], [R, n + L * 0.8], [R * 0.85, n + L * 0.97], [R * 0.75, n + L]];
  P.push(part(latheZ(prof, 22), S.body, M(0, 0, 0, 0, 0, 0, 1, 0.8, 1)));
  P.push(part(latheZ(prof.slice(0, 3), 22), dark, M(0, 0, 0, 0, 0, 0, 1.01, 0.81, 1)));
  // «глаз»-датчик в носу
  P.push(part(new THREE.SphereGeometry(R * 0.28, 12, 8), 0xff3b3b, M(0, R * 0.25, n + L * 0.1)));
  // крыло
  for (const s of [1, -1]) P.push(part(plateXZ(S.wing.map(([x, z]) => [x * s, z]), Math.max(0.12, R * 0.12)), S.body, M(0, -R * 0.2, 0)));
  if (S.chines) for (const s of [1, -1]) P.push(part(plateXZ([[0.3 * s, n + L * 0.08], [R * 1.25 * s, n + L * 0.4], [R * 1.1 * s, n + L * 0.55], [0.3 * s, n + L * 0.5]], 0.08), S.body, M(0, 0, 0)));
  // кили
  const tz = L / 2 - L * 0.28;
  const fin = [[tz, 0], [tz + L * 0.22, 0], [tz + L * 0.26, L * 0.2], [tz + L * 0.15, L * 0.2]];
  if (S.tails === 1) P.push(part(plateZY(fin, 0.14), S.body, M(0, R * 0.5, 0)));
  else for (const s of [1, -1]) P.push(part(plateZY(fin, 0.12), S.body, M(R * 1.1 * s, R * 0.4, 0, 0, 0, -(S.cant || 0.12) * s)));
  if (S.stab || S.ttail) for (const s of [1, -1]) {
    const y = S.ttail ? R * 0.5 + L * 0.2 : 0;
    const z0 = S.ttail ? tz + L * 0.15 : tz + L * 0.08;
    P.push(part(plateXZ([[0.3 * s, z0], [L * 0.16 * s, z0 + L * 0.07], [L * 0.16 * s, z0 + L * 0.1], [0.3 * s, z0 + L * 0.12]], 0.1), S.body, M(0, y, 0)));
  }
  // воздухозаборники
  for (const s of [1, -1]) P.push(part(new THREE.BoxGeometry(R * 0.6, R * 0.8, L * 0.3), S.body, M(R * 0.85 * s, -R * 0.25, n + L * 0.42)));
  for (const s of [1, -1]) P.push(part(new THREE.BoxGeometry(R * 0.5, R * 0.7, 0.05), dark, M(R * 0.85 * s, -R * 0.25, n + L * 0.27)));
  // сопла
  const nozzles = [];
  const nr = S.nozzles === 2 ? R * 0.48 : R * 0.65;
  const nxs = S.nozzles === 2 ? [-R * 0.52, R * 0.52] : S.nozzles === 1 ? [0] : [];
  for (const x of nxs) { P.push(part(new THREE.CylinderGeometry(nr, nr * 0.9, L * 0.06, 16, 1, true), 0x3b3e42, M(x, 0, L / 2 + L * 0.02, Math.PI / 2))); nozzles.push(new THREE.Vector3(x, 0, L / 2 + L * 0.05)); }
  if (S.pods) for (const x of [-14, -8, 8, 14]) {
    P.push(part(latheZ([[1.0, -3], [1.2, -2], [1.2, 2], [0.9, 3.2]], 16), S.body, M(x, -2.2, 3)));
    P.push(part(new THREE.CylinderGeometry(0.12, 0.12, 1.4, 6), dark, M(x, -1.2, 2.4)));
    nozzles.push(new THREE.Vector3(x, -2.2, 6.3));
  }
  // раковина и глаза
  const sh = kind === 'boss' ? 5.5 : R * 1.35;
  snailShell(P, 0, R * 0.6 + sh * 0.95, n + L * 0.52, sh, S.shell, kind === 'boss');
  eyeStalks(P, n + L * 0.12, R * 0.55, kind === 'boss' ? 3 : R * 1.1);
  // точки подвески ракет
  const stations = [];
  if (kind === 'boss') for (const x of [-18, -11, -5, 5, 11, 18]) stations.push(new THREE.Vector3(x, -1.4, (S.wing[0][1] + (S.wing[1][1] - S.wing[0][1]) * (Math.abs(x) - 2.6) / 19.4) + 3));
  else {
    const sp = S.wing[1][0];
    for (const f of [0.45, 0.8]) for (const s of [-1, 1]) {
      const x = sp * f * s, le = S.wing[0][1] + (S.wing[1][1] - S.wing[0][1]) * (Math.abs(x) - S.wing[0][0]) / (sp - S.wing[0][0]);
      stations.push(new THREE.Vector3(x, -R * 0.2 - 0.5, le + 1.4));
      P.push(part(new THREE.BoxGeometry(0.12, 0.3, 1.4), dark, M(x, -R * 0.2 - 0.22, le + 1.4)));
    }
  }
  return { geo: mergeParts(P), stations, nozzles, radius: kind === 'boss' ? 26 : L * 0.55 };
}

// ═════════════ Танкер-заправщик ═════════════
export const TANKER_DROGUE = new THREE.Vector3(0, -8.5, 36); // корзина в локальных координатах (нос — в −Z)
export function buildTanker() {
  const P = [];
  P.push(part(latheZ([[0.001, -15], [1.2, -13], [2.1, -9], [2.2, 6], [1.2, 14], [0.6, 15.5]], 20), 0xd9dde0));
  for (const s of [1, -1]) {
    P.push(part(plateXZ([[1.5 * s, -3], [17 * s, 1.5], [17 * s, 3.5], [1.5 * s, 3]], 0.35), 0xc9ced2, M(0, -0.4, 0)));
    P.push(part(plateXZ([[0.6 * s, 10], [6.5 * s, 12.5], [6.5 * s, 13.8], [0.6 * s, 14]], 0.2), 0xc9ced2, M(0, 0.4, 0)));
    P.push(part(latheZ([[0.7, -2.5], [0.9, -1.8], [0.9, 1.8], [0.7, 2.5]], 14), 0xb9bec2, M(7.5 * s, -1.6, 0)));
    P.push(part(new THREE.BoxGeometry(0.3, 0.3, 1.8), 0xf5c518, M(12 * s, -0.9, 2.8))); // подкрыльевые агрегаты заправки
  }
  P.push(part(plateZY([[9.5, 0], [14.5, 0], [15.3, 6], [12.5, 6]], 0.25), 0xc9ced2, M(0, 1.5, 0)));
  P.push(part(plateZY([[13.9, 5.2], [15.2, 5.2], [15.3, 6], [14.2, 6]], 0.27), 0xf5c518, M(0, 1.5, 0)));
  P.push(part(new THREE.BoxGeometry(1.2, 0.8, 3), 0x9aa0a4, M(0, -2.0, 11)));
  // шланг и корзина
  const hose = new THREE.Vector3(0, -2.4, 12.4), dro = TANKER_DROGUE;
  const mid = hose.clone().add(dro).multiplyScalar(0.5), len = hose.distanceTo(dro);
  const dir = dro.clone().sub(hose).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  P.push(part(new THREE.CylinderGeometry(0.08, 0.08, len, 6), 0x222222, new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1))));
  P.push(part(new THREE.CylinderGeometry(1.6, 0.35, 1.8, 18, 1, true), 0xf5c518, M(dro.x, dro.y, dro.z + 0.6, Math.PI / 2)));
  P.push(part(new THREE.TorusGeometry(1.6, 0.12, 6, 22), 0x222222, M(dro.x, dro.y, dro.z + 1.5)));
  return mergeParts(P);
}
