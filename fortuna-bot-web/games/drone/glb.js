// Готовые модели «Симулятора Летки»: самолёты игрока на выбор и ракеты «воздух–воздух» — те же glb, что у «Воздушного
// превосходства» (games/airdef/models/*.glb: метры, нос в −Z, подготовлены tools/airdef-models/prepare.js).
// Только картинка: лётные данные у всех одинаковые («Изделие»). Нет модели (или не загрузилась) — процедурная.
// Материалы — как у остальной техники «Летки»: PBR на средних и выше (карта окружения сцены), Ламберт на «Низком».
/* global THREE */
import { PLANE_META, MODEL_CREDITS } from '../airdef/models.js?v=20261011a';

const BASE = new URL('../airdef/models/', import.meta.url).href;
// самолёты на выбор: key — glb (или 'izd' — процедурное «Изделие»)
export const PLANES = [
  { key: 'izd', name: '«Изделие Фортуна-1»', desc: 'беспилотник «Летки» — бесхвостка с развалёнными килями' },
  { key: 'su30', name: 'Су-30', desc: 'двухместный тяжёлый истребитель' },
  { key: 'mig29', name: 'МиГ-29', desc: 'лёгкий фронтовой истребитель' },
  { key: 'f18', name: 'F/A-18E Super Hornet', desc: 'палубный многоцелевой (на законцовках — свои учебные «Сайдуайндеры»)' },
  { key: 'f16', name: 'F-16D', desc: 'лёгкий многоцелевой (на законцовках — свои учебные AIM-120)' },
  { key: 'e_mig21', name: 'МиГ-21', desc: 'лёгкий фронтовой истребитель (модель в стиле «чиби»)' },
  { key: 'e_mig31', name: 'МиГ-31', desc: 'тяжёлый перехватчик' },
  { key: 'e_su57', name: 'Су-57', desc: 'малозаметный истребитель пятого поколения' },
  { key: 'e_tu22m3', name: 'Ту-22М3', desc: 'дальний бомбардировщик-ракетоносец (лётные данные — как у «Изделия»)' },
];
// ракета каталога → модель (вариации одного корпуса — одной моделью, длина подгоняется под каталог)
export const MSL_MODEL = { aim9b: 'aam_aim9', r3s: 'aam_aim9', aim9l: 'aam_aim9', aim9x: 'aam_aim9x', r60m: 'aam_r60', r73: 'aam_r73', iris_t: 'aam_iris',
  aim7e: 'aam_aim7', aim7m: 'aam_aim7', r27r: 'aam_r27', r27t: 'aam_r27', r27er: 'aam_r27', mica_em: 'aam_mica', mica_ir: 'aam_mica',
  r77: 'aam_r77', r33: 'aam_r33', aim120c: 'msl_aim120', aim54: 'aam_aim54' }; // нет моделей: Firestreak, Python-5, Derby, Meteor — процедурные
// противник: тип ИИ (sim/battle.js) → модель, точки подвески (порядок как у процедурных: внутр. L, R, внешн. L, R; у Ту-22М3 —
// 6 точек слева направо; py — высота дорисованного пилона) и сопла (k — размер пламени относительно «Изделия»)
const P3 = (x, y, z, py = 0) => Object.assign(new THREE.Vector3(x, y, z), { py });
export const ENEMY = {
  fighter: { model: 'e_mig21', stations: [P3(-2.56, -2.07, 0.8), P3(2.95, -2.07, 0.8), P3(-3.16, -1.44, 1.27), P3(3.54, -1.44, 1.27)], nozzles: [{ pos: P3(0.2, -1.25, 5.0), k: 1.2 }] },
  interceptor: { model: 'e_mig31', stations: [P3(-1.19, -1.92, -1.5), P3(1.19, -1.92, -1.5), P3(-4.62, -1.24, 4.4), P3(4.62, -1.24, 4.4)],
    nozzles: [{ pos: P3(-0.78, -1.09, 11.1), k: 1.1 }, { pos: P3(0.78, -1.09, 11.1), k: 1.1 }] },
  ace: { model: 'e_su57', stations: [P3(-0.6, -1.3, 1.0, 0.15), P3(0.6, -1.3, 1.0, 0.15), P3(-3.8, -1.1, 4.4, 0.3), P3(3.8, -1.1, 4.4, 0.3)],
    nozzles: [{ pos: P3(-1.37, -0.66, 8.25), k: 0.75 }, { pos: P3(1.37, -0.66, 8.25), k: 0.75 }] },
  boss: { model: 'e_tu22m3', stations: [P3(-9.5, -3.7, 7.0, 0.35), P3(-5.07, -3.79, 5.15), P3(-1.83, -3.53, 3.58), P3(1.83, -3.53, 3.58), P3(5.07, -3.79, 5.15), P3(9.5, -3.7, 7.0, 0.35)],
    nozzles: [{ pos: P3(-0.93, -2.17, 19.05), k: 1.3 }, { pos: P3(0.93, -2.17, 19.05), k: 1.3 }] },
};
export const TANKER = { model: 't_il78', hose: new THREE.Vector3(0, -2.6, 20.5) }; // Ил-78: шланг — из-под хвоста
// дальние копии (_lo) — первыми: лёгкие, противник сразу готовой моделью; вблизи — подробная
export const enemyModels = () => [...Object.values(ENEMY).map((e) => e.model + '_lo'), ...Object.values(ENEMY).map((e) => e.model), TANKER.model];
const LOD_D = { boss: 2500 }; // дальше — упрощённая копия (у истребителей — 900 м); вблизи — полная, без упрощения
const pylonMat = () => new THREE.MeshStandardMaterial({ color: 0x4a4f54, metalness: 0.4, roughness: 0.6 });
// самолёт противника: { obj, stations, nozzles } или null (модель ещё грузится — тогда процедурный)
export function enemyGlb(kind) {
  const m = ENEMY[kind], hi = m && LOADED[m.model], lo = m && LOADED[m.model + '_lo']; if (!hi && !lo) return null;
  const obj = new THREE.Group(), pm = pylonMat();
  if (hi && lo) { const L = new THREE.LOD(); L.addLevel(hi.clone(), 0); L.addLevel(lo.clone(), LOD_D[kind] || 900); obj.add(L); } else obj.add((hi || lo).clone());
  for (const p of m.stations) if (p.py > 0) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, p.py, 1.4), pm); b.position.set(p.x, p.y + p.py / 2, p.z); obj.add(b); }
  return { obj, stations: m.stations, nozzles: m.nozzles.map((n) => n.pos), nk: m.nozzles.map((n) => n.k) };
}
export const loadedModel = (n) => LOADED[n] || null; // исходная модель (не копия): её геометрию и материалы берут экземпляры
export const tankerGlb = () => (LOADED[TANKER.model] ? LOADED[TANKER.model].clone() : null);
// авторы моделей, которые использует «Летка»
// модели карты (glbmap.js): ЛЭП, ветряки, порт, маяк, промзона, аэродром, дома деревень, ближний лес
export const MAP_MODELS = ['m_pylon', 'm_wind', 'obj_tanks', 'm_crane', 'm_cont', 'm_ship', 'm_light', 'obj_jhangar', 'obj_rtank', 'su30', 'mig29',
  'h_brick', 'h_house', 'h_log', 'h_khata', 'h_mobile', 'tr_pine', 'tr_oak', 'tr_lime'];
const USED = new Set([...PLANES.map((p) => p.key), ...Object.values(MSL_MODEL), ...enemyModels(), ...MAP_MODELS]);
export const LETKA_CREDITS = MODEL_CREDITS.filter((c) => (c.files || []).some((f) => USED.has(f)));

// самолёты противника на выбор игроку: 8 точек подвески (L3 L2 L1 Ф1 → … Ф2 R1 R2 R3, как у «Изделия»: законцовка, средняя,
// корневая, подфюзеляжная; py — дорисованный пилон), сопла, nr — радиус сопла. cx — ось симметрии модели (у МиГ-21 сдвинута)
const V3 = (x, y, z, py = 0) => Object.assign(new THREE.Vector3(x, y, z), { py });
const mirrorC = (L, cx = 0) => [...L, ...L.slice().reverse().map((p) => V3(2 * cx - p.x, p.y, p.z, p.py))];
const OWN_META = {
  e_mig21: { stations: mirrorC([V3(-3.6, -1.35, 2.2, 0.25), V3(-3.16, -1.44, 1.27), V3(-2.56, -2.07, 0.8), V3(-0.4, -2.05, -0.4, 0.15)], 0.19),
    nozzles: [V3(0.2, -1.25, 5.0)], nr: 0.65 },
  e_mig31: { stations: mirrorC([V3(-5.6, -0.95, 5.4, 0.3), V3(-4.62, -1.24, 4.4), V3(-1.55, -1.55, 7.5), V3(-1.19, -1.92, -1.5)]),
    nozzles: [V3(-0.78, -1.09, 11.1), V3(0.78, -1.09, 11.1)], nr: 0.6 },
  e_su57: { stations: mirrorC([V3(-5.2, -0.85, 4.6, 0.3), V3(-4.0, -0.85, 4.2, 0.3), V3(-2.6, -0.9, 3.2, 0.3), V3(-0.6, -1.3, 1.0, 0.15)]),
    nozzles: [V3(-1.37, -0.66, 8.25), V3(1.37, -0.66, 8.25)], nr: 0.4 },
  e_tu22m3: { stations: mirrorC([V3(-11, -3.35, 7.6, 0.35), V3(-8, -3.4, 6.8, 0.35), V3(-5.07, -3.79, 5.15), V3(-1.83, -3.53, 3.58)]),
    nozzles: [V3(-0.93, -2.17, 19.05), V3(0.93, -2.17, 19.05)], nr: 0.7 },
};
const META_ALL = { ...PLANE_META, ...OWN_META };
function parseGlb(buf) {
  const dv = new DataView(buf), jl = dv.getUint32(12, true), json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jl)));
  const binOff = 28 + jl, T = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array };
  const slice = (bv, extra = 0, len = bv.byteLength) => buf.slice(binOff + (bv.byteOffset || 0) + extra, binOff + (bv.byteOffset || 0) + extra + len);
  const acc = (i) => { const a = json.accessors[i], bv = json.bufferViews[a.bufferView], C = T[a.componentType], n = { SCALAR: 1, VEC2: 2, VEC3: 3 }[a.type]; return new C(slice(bv, a.byteOffset || 0, a.count * n * C.BYTES_PER_ELEMENT)); };
  const meshes = json.meshes.map((m) => { const p = m.primitives[0], at = p.attributes; return { name: m.name, mat: json.materials[p.material], pos: acc(at.POSITION), nor: acc(at.NORMAL), uv: at.TEXCOORD_0 !== undefined ? acc(at.TEXCOORD_0) : null, idx: acc(p.indices) }; });
  const images = (json.images || []).map((im) => new Blob([slice(json.bufferViews[im.bufferView])], { type: im.mimeType }));
  return { meshes, images, textures: json.textures || [] };
}
const LOADED = {}, LOADING = {};
let PBR = true, SHADOW = false, ANISO = 4;
// настройка материалов под пресет: pbr — MeshStandard, shadows — отбрасывать тень, aniso — фильтрация текстур
export function setupGlb(o) { PBR = !!o.pbr; SHADOW = !!o.shadows; ANISO = o.aniso || 4; }
async function load(name) {
  const r = await fetch(`${BASE}${name}.glb?v=20261011i`); if (!r.ok) throw new Error(`${name}: ${r.status}`);
  const { meshes, images, textures } = parseGlb(await r.arrayBuffer());
  const tex = await Promise.all(textures.map(async (t) => {
    if (typeof createImageBitmap !== 'function') return null;
    let bmp; try { bmp = await createImageBitmap(images[t.source]); } catch (_) { return null; }
    const x = new THREE.Texture(bmp); x.flipY = false; x.encoding = THREE.sRGBEncoding; x.anisotropy = ANISO; x.wrapS = x.wrapT = THREE.RepeatWrapping; x.needsUpdate = true; return x;
  }));
  const group = new THREE.Group(), matte = /^(tr_|h_|obj_|m_light|m_cont)/.test(name); // деревья, дома и постройки — без металлического блеска
  for (const m of meshes) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(m.nor, 3));
    if (m.uv) g.setAttribute('uv', new THREE.BufferAttribute(m.uv, 2));
    g.setIndex(new THREE.BufferAttribute(m.idx, 1)); g.computeBoundingSphere();
    const pbr = m.mat.pbrMetallicRoughness, f = pbr.baseColorFactor || [1, 1, 1, 1], glass = m.mat.alphaMode === 'BLEND';
    const map = pbr.baseColorTexture ? tex[pbr.baseColorTexture.index] : null, col = new THREE.Color(f[0], f[1], f[2]);
    let mat;
    if (glass) mat = PBR ? new THREE.MeshStandardMaterial({ color: col.lerp(new THREE.Color(0.12, 0.16, 0.2), 0.6), metalness: 0.9, roughness: 0.08, transparent: true, opacity: Math.max(0.45, f[3]), depthWrite: false, side: THREE.DoubleSide })
      : new THREE.MeshLambertMaterial({ color: col.lerp(new THREE.Color(0.12, 0.16, 0.2), 0.6), transparent: true, opacity: 0.6, depthWrite: false });
    else mat = PBR ? new THREE.MeshStandardMaterial({ map, color: col, metalness: matte ? 0 : 0.35, roughness: matte ? 0.9 : 0.55, side: THREE.DoubleSide, ...(m.mat.alphaMode === 'MASK' ? { alphaTest: m.mat.alphaCutoff ?? 0.5 } : {}) })
      : new THREE.MeshLambertMaterial({ map, color: col, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(g, mat); mesh.name = m.name; mesh.castShadow = SHADOW && !glass; mesh.userData.glass = glass; group.add(mesh);
  }
  return group;
}
// загрузить (один раз); onReady(name) — когда пришла
export function want(name, onReady) {
  if (LOADED[name]) return Promise.resolve(LOADED[name]);
  if (!LOADING[name]) LOADING[name] = load(name).then((g) => { LOADED[name] = g; return g; }).catch((e) => { console.warn('модель не загрузилась:', e.message); return null; });
  return LOADING[name].then((g) => { if (g && onReady) onReady(name); return g; });
}
// самолёт: { obj, stations (8, как у «Изделия»), nozzles, nr, len } или null (процедурный / ещё грузится)
export function planeGlb(key) {
  const m = META_ALL[key], G = LOADED[key]; if (!m || !G) return null;
  const obj = G.clone(), pylon = new THREE.MeshStandardMaterial({ color: 0x4a4f54, metalness: 0.4, roughness: 0.6 });
  for (const p of m.stations) if (p.py > 0) { const pm = new THREE.Mesh(new THREE.BoxGeometry(0.12, p.py, 1.6), pylon); pm.position.set(p.x, p.y + p.py / 2, p.z); obj.add(pm); } // дорисованные пилоны
  const bb = new THREE.Box3().setFromObject(G);
  return { obj, stations: m.stations, nozzles: m.nozzles, nr: m.nr, len: bb.max.z - bb.min.z, box: bb };
}
// ракета каталога: готовая модель длиной L (нос в −Z, центр в начале) или null
const MLEN = {};
export function missileGlb(key, L) {
  const n = MSL_MODEL[key], G = n && LOADED[n]; if (!G) return null;
  if (!MLEN[n]) { const b = new THREE.Box3().setFromObject(G); MLEN[n] = { len: b.max.z - b.min.z, cz: (b.max.z + b.min.z) / 2 }; }
  const o = new THREE.Group(), c = G.clone(), k = L / MLEN[n].len;
  c.scale.setScalar(k); c.position.z = -MLEN[n].cz * k; o.add(c);
  return o;
}
export const missileModels = () => [...new Set(Object.values(MSL_MODEL))];
