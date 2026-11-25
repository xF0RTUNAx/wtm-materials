// Дальние дома - в цвет и рисунок своей модели (Mark 2026-11-25: «упрощённые модели должны повторять габариты, форму и цвет своих оригиналов»).
// Когда приходит модель серии своих домов, её секция этажа снимается без света (только цвет): лицо, двор и торец - в общий атлас (по строке на модель),
// средние цвета стен и крыши - в uniform. Коробка дали (city-render.js buildingMaterial) рисует этот фасад вместо процедурных окон; мельче ~3 текселей -
// средний цвет. Для остальных моделей - средние цвета стен и крыши снимком с четырёх сторон (surfColors). ?fac=0 - как было.
/* global THREE */
export const FAC_ON = typeof location === 'undefined' || !/[?&]fac=0/.test(location.search);
const A = 512, ROW = 40, G = 8, TH = 24; // атлас, высота строки, поле вокруг плитки (повтор - для мипов), высота плитки этажа
export const FAC_TILES = [[0, 96], [112, 96], [224, 48]]; // лицо, двор, торец: x начала поля и ширина плитки
export const FAC_MAX = 12;
export const FACU = { tFac: { value: null }, uFacP: { value: Array.from({ length: FAC_MAX }, () => new THREE.Vector4()) }, uFacA: { value: Array.from({ length: FAC_MAX * 3 }, () => new THREE.Vector3()) }, uFacR: { value: Array.from({ length: FAC_MAX }, () => new THREE.Vector3()) } };
export const FAC_GLSL = `
uniform sampler2D tFac; uniform vec4 uFacP[${FAC_MAX}]; uniform vec3 uFacA[${FAC_MAX * 3}], uFacR[${FAC_MAX}]; varying float vFac;
#if __VERSION__ >= 300 || defined(GL_EXT_shader_texture_lod)
#define FACG(t, uv, gx, gy) texture2DGradEXT(t, uv, gx, gy)
#else
#define FACG(t, uv, gx, gy) texture2D(t, uv)
#endif
`;
// в конце расчёта цвета коробки: wall - стена, roof - крыша
export const FAC_MAIN = `
  if (vFac > 0.5) {
    int fr = int(floor(vFac + 0.01)) - 1; vec4 fp = uFacP[fr]; float fl0 = fract(vFac + 0.01) > 0.25 ? -1.0 : 1.0;
    if (fp.w > 0.5) {
      bSpec = 0.0; bEmis *= uNight;
      if (abs(vObj.y - 1.0) > 0.001 && abs(N.y) < 0.7) {
        bool lx = vSize.x > vSize.z, sx = abs(vObj.x) > 0.499, en = lx == sx; float Ls = max(vSize.x, vSize.z), nS = clamp(floor(Ls / fp.x + 0.5), 1.0, fp.z);
        float lu = (sx ? vObj.z : vObj.x) + 0.5, side = (lx ? -vObj.z : -vObj.x) * fl0;
        int ti = en ? 2 : side > 0.0 ? 0 : 1; vec2 T = ti == 0 ? vec2(0.0, 96.0) : ti == 1 ? vec2(112.0, 96.0) : vec2(224.0, 48.0);
        vec2 q = vec2(lu * (en ? 1.0 : nS), (vObj.y * vSize.y - 1.8) / fp.y), S = vec2(T.y, ${TH}.0), gx = dFdx(q) * S, gy = dFdy(q) * S;
        vec2 uv = (vec2(T.x + ${G}.0, float(fr) * ${ROW}.0 + ${G}.0) + fract(q) * S) / ${A}.0;
        vec3 av = ti == 0 ? uFacA[fr * 3] : ti == 1 ? uFacA[fr * 3 + 1] : uFacA[fr * 3 + 2]; float rho = max(length(gx), length(gy));
        diffuseColor.rgb = mix(FACG(tFac, uv, gx / ${A}.0, gy / ${A}.0).rgb, av, smoothstep(5.0, 9.0, rho));
      } else if (N.y > 0.7) diffuseColor.rgb = uFacR[fr];
    }
  }
`;
const V = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), FWD = new THREE.Vector3(0, 0, -1);
const flat = (m, g = 1) => new THREE.MeshBasicMaterial({ map: m.map || null, color: m.color ? m.color.clone().multiplyScalar(g) : 0xffffff, side: THREE.DoubleSide, alphaTest: m.alphaTest || 0, toneMapped: false });
let RT = null, SM = null; const rows = new Map();
function withState(r, fn) {
  const rt = r.getRenderTarget(), au = r.autoClear, c = r.getClearColor(new THREE.Color()), a = r.getClearAlpha(), st = r.getScissorTest(), vp = r.getViewport(new THREE.Vector4()), sc = r.getScissor(new THREE.Vector4()), sh = r.shadowMap.autoUpdate, nu = r.shadowMap.needsUpdate;
  r.autoClear = false; r.shadowMap.autoUpdate = false; r.shadowMap.needsUpdate = false;
  try { fn(); } finally { r.setRenderTarget(rt); r.setScissorTest(st); r.setScissor(sc); r.setViewport(vp); r.autoClear = au; r.setClearColor(c, a); r.shadowMap.autoUpdate = sh; r.shadowMap.needsUpdate = nu; }
}
// средний цвет того, что снято в квадрат 16 × 16 (прозрачное не в счёт): r - рендерер, сцена, камера
function meanOf(r, sc, cam) {
  if (!SM) SM = new THREE.WebGLRenderTarget(32, 32, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, generateMipmaps: false });
  r.setRenderTarget(SM); r.setScissorTest(false); r.setViewport(0, 0, 32, 32); r.setClearColor(0x000000, 0); r.clear(true, true, true); r.render(sc, cam);
  const b = new Uint8Array(32 * 32 * 4); r.readRenderTargetPixels(SM, 0, 0, 32, 32, b); let R = 0, g = 0, B = 0, n = 0;
  for (let i = 0; i < b.length; i += 4) if (b[i + 3] > 127) { R += b[i]; g += b[i + 1]; B += b[i + 2]; n++; }
  return n ? [R / n / 255, g / n / 255, B / n / 255] : null;
}
const ortho = (x0, x1, y0, y1, from, at, up, far = 80) => { const c = new THREE.OrthographicCamera(x0, x1, y1, y0, 0.05, far); c.position.copy(from); c.up.copy(up); c.lookAt(at); c.updateMatrixWorld(); return c; };
// строка атласа модели серии: index - номер строки; ser - { SEC, DEP, FL, maxN }
export function facadeRow(renderer, group, ser, index, gain = 1) {
  if (!FAC_ON || !renderer || index >= FAC_MAX || rows.has(index)) return;
  const get = (n) => { const o = group.getObjectByName(n); return o && o.isMesh ? o : null; }, F = get('sec_floor0_F_lod1'), Y = get('sec_floor0_Y_lod1'), cF = get('cor_floor_F_lod1'), cY = get('cor_floor_Y_lod1'), rF = get('roof_F_lod1'), rY = get('roof_Y_lod1');
  if (!F || !Y || !cF || !cY) return; rows.set(index, 1);
  if (!RT) { RT = new THREE.WebGLRenderTarget(A, A, { minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true, format: THREE.RGBAFormat }); FACU.tFac.value = RT.texture; }
  const { SEC, DEP, FL } = ser, scene = (ms, dx) => { const s = new THREE.Scene(); for (const m of ms) if (m) for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const q = new THREE.Mesh(m.geometry, flat(m.material, gain)); q.position.set(dx ? i * SEC : 0, j * FL, dx ? 0 : i * DEP); s.add(q); } return s; };
  withState(renderer, () => {
    const shots = [[scene([F], true), SEC, new THREE.Vector3(0, FL / 2, -30), new THREE.Vector3(0, FL / 2, 0)], [scene([Y], true), SEC, new THREE.Vector3(0, FL / 2, 50), new THREE.Vector3(0, FL / 2, 0)], [scene([cF, cY], false), DEP, new THREE.Vector3(-30, FL / 2, DEP / 2), new THREE.Vector3(0, FL / 2, DEP / 2)]];
    shots.forEach(([s, w, from, at], k) => {
      const [x, tw] = FAC_TILES[k], gx = w * G / tw, gy = FL * G / TH, cam = ortho(-w / 2 - gx, w / 2 + gx, -FL / 2 - gy, FL / 2 + gy, from, at, UP);
      renderer.setRenderTarget(RT); renderer.setScissorTest(true); renderer.setViewport(x, index * ROW, tw + 2 * G, ROW); renderer.setScissor(x, index * ROW, tw + 2 * G, ROW); renderer.setClearColor(0x808080, 1); renderer.clear(true, true, true); renderer.render(s, cam);
      const c = meanOf(renderer, s, ortho(-w / 2, w / 2, -FL / 2, FL / 2, from, at, UP)); if (c) FACU.uFacA.value[index * 3 + k].fromArray(c);
      s.traverse((o) => { if (o.isMesh) o.material.dispose(); });
    });
    const s = new THREE.Scene(); for (const m of [rF, rY]) if (m) s.add(new THREE.Mesh(m.geometry, flat(m.material)));
    const c = s.children.length ? meanOf(renderer, s, ortho(-SEC / 2, SEC / 2, -DEP / 2, DEP / 2, V.set(0, 40, DEP / 2), new THREE.Vector3(0, 0, DEP / 2), FWD)) : null; FACU.uFacR.value[index].fromArray(c || [0.2, 0.2, 0.2]);
  });
  FACU.uFacP.value[index].set(SEC, FL, ser.maxN || 8, 1);
}
// средние цвета стен (четыре стороны) и крыши (сверху) модели - { wall, roof } в линейном цвете или null
export function surfColors(renderer, group) {
  if (!FAC_ON || !renderer) return null;
  group.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(group); if (bb.isEmpty()) return null;
  const S = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3()), sc = new THREE.Scene(), W = []; let roof = null;
  group.traverse((m) => { if (!m.isMesh || !m.material || Array.isArray(m.material) || (m.material.transparent && m.material.opacity < 0.3)) return; const q = new THREE.Mesh(m.geometry, flat(m.material)); q.matrixAutoUpdate = false; q.matrix.copy(m.matrixWorld); sc.add(q); });
  withState(renderer, () => {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const w = dx ? S.z : S.x, m = meanOf(renderer, sc, ortho(-w / 2, w / 2, -S.y / 2, S.y / 2, new THREE.Vector3(c.x + dx * (S.x / 2 + 1), c.y, c.z + dz * (S.z / 2 + 1)), c, UP, Math.max(S.x, S.z) + 2)); if (m) W.push([m, w]); }
    roof = meanOf(renderer, sc, ortho(-S.x / 2, S.x / 2, -S.z / 2, S.z / 2, new THREE.Vector3(c.x, bb.max.y + 1, c.z), c, FWD, S.y + 2));
  });
  sc.traverse((o) => { if (o.isMesh) o.material.dispose(); });
  if (!W.length) return null; const t = W.reduce((a, [, w]) => a + w, 0);
  return { wall: [0, 1, 2].map((k) => W.reduce((a, [m, w]) => a + m[k] * w, 0) / t), roof };
}
