// Готовые модели (glb, подготовленные tools/airdef-models/prepare.js: метры, нос в −Z, позиции / нормали / UV,
// текстуры цвета в JPEG). Загружаются в фоне при старте; пока не загрузились (или если загрузка не удалась) — в игре
// процедурные модели из units-render.js. Материалы — Phong, как у остальной техники (освещение и туман игры).
// Для каждой модели: сторона и класс (strike — ударные загрузки с бомбами, fighter — ракетные), точки подвески
// (как у процедурных: L3 L2 L1 Ф1 Ф2 R1 R2 R3; py — высота дорисованного пилона, если у модели его нет), сопла и место
// контейнера. Авторы и лицензии — MODEL_CREDITS (показываются в «Настройках»).
/* global THREE */
import { CREDITS } from './models/credits.js?v=20261009z';
const V = (x, y, z, py = 0) => Object.assign(new THREE.Vector3(x, y, z), { py });
const mirror = (L) => [...L, ...L.slice().reverse().map((p) => V(-p.x, p.y, p.z, p.py))]; // L3 L2 L1 Ф1 → … Ф2 R1 R2 R3
const META = {
  // [PBR] Sukhoi Su-30 — Immersive3D: восток, ударные загрузки
  su30: { side: 'east', cls: 'strike', stations: mirror([V(-6.27, -0.34, 4.9), V(-4.67, -0.35, 3.3), V(-3.39, -0.44, 2.6), V(-1.76, -0.65, 3.9)]),
    nozzles: [V(-1.14, -0.42, 9.4), V(1.14, -0.42, 9.4)], nr: 0.55, pod: V(0, -1.25, 1.5) },
  // MiG 29 — Usman Zia: восток, ракетные загрузки
  mig29: { side: 'east', cls: 'fighter', stations: mirror([V(-4.06, -1.25, 3.41), V(-3.17, -1.24, 2.68), V(-2.23, -1.21, 1.96), V(-0.45, -1.4, 2.0, 0.26)]),
    nozzles: [V(-0.97, -1.35, 7.6), V(0.97, -1.35, 7.6)], nr: 0.45, pod: V(0, -1.55, 2.0) },
  // Boeing F/A-18E/F Super Hornet — andertan: запад, ударные загрузки (на концах крыльев — свои «Сайдуайндеры»)
  f18: { side: 'west', cls: 'strike', stations: mirror([V(-4.70, -1.43, 2.04), V(-3.72, -1.44, 1.87), V(-2.6, -1.24, 1.9, 0.4), V(-1.48, -1.05, -0.3, 0.22)]),
    nozzles: [V(-0.49, -0.94, 8.2), V(0.49, -0.94, 8.2)], nr: 0.45, pod: V(0, -1.96, 1.0) },
  // General Dynamics F-16D Block 60 — Muhamad Mirza Arrafi: запад, ракетные загрузки
  // (на законцовках крыльев — свои AIM-120, пилоны под крылом дорисованы)
  f16: { side: 'west', cls: 'fighter', stations: mirror([V(-3.9, -1.34, 2.4, 0.36), V(-3.0, -1.38, 2.2, 0.38), V(-2.15, -1.39, 2.0, 0.38), V(-0.75, -1.6, 1.0, 0.22)]),
    nozzles: [V(0, -0.9, 6.5)], nr: 0.55, pod: V(0.75, -1.62, -0.5) },
  // оружие, взятое с моделей самолётов: на пилоне и в полёте вместо процедурного
  w_gbu12: { weapon: 'gbu12', stations: [] }, // GBU-12 Paveway II с F-16D
  w_fab500: { weapon: 'fab500', stations: [] }, // ФАБ-500М-62 — Jeyhun1985 (модель с УМПК, комплект снят)
  w_umpk: { weapon: 'umpk', stations: [] }, // ФАБ-500 с УМПК — Jeyhun1985
  w_kh29t: { weapon: 'kh29t', stations: [] }, // Х-29 — Russian weapon pack, Rhine_Lab_Muelsyse
  w_kh31p: { weapon: 'kh31p', stations: [] }, // Х-31 — Russian weapon pack
  w_kh25ml: { weapon: 'kh25ml', stations: [] }, // Х-38МТ — Jeyhun1985 (вместо Х-25МЛ: та же схема)
  w_agm65b: { weapon: 'agm65b', stations: [] }, // AGM-65 — набор NETRUNNER_pl
  w_mk82: { weapon: 'mk82', stations: [] }, // Mk 83 → размер Mk 82 — набор NETRUNNER_pl
  w_jassm: { weapon: 'jassm', stations: [] }, // AGM-158 JASSM
  w_agm88: { weapon: ['agm88', 'aargm'], stations: [] }, // AGM-88 HARM (с тележки) — и для AARGM
  w_mald: { weapon: 'mald', stations: [] }, // ADM-160 MALD («AIM-160A Screamer»)
  w_decoy_e: { weapon: 'decoy_e', stations: [] }, // Harpy — ложная цель
  w_gbu39: { weapon: 'gbu39', stations: [] }, // GBU-39 SDB
  w_gbu31: { weapon: 'gbu31', stations: [] }, // Mk 84 с хвостом (GBU-24 с F-111 без головки) — как JDAM
  w_pod: { pod: true, stations: [] }, // AN/AAQ-28 LITENING — прицельный контейнер
  // постройки военных объектов (целей) — расставляются по OBJ_DIMS из city.js
  obj_tanks: { obj: true, stations: [] }, obj_tank4: { obj: true, stations: [] }, obj_rtank: { obj: true, stations: [] }, obj_hangar: { obj: true, stations: [] },
  bld_p5: { bld: true, stations: [] }, bld_p9: { bld: true, stations: [] }, bld_b12: { bld: true, stations: [] }, bld_st: { bld: true, stations: [] },
  h_brick: { bld: true, stations: [] }, h_house: { bld: true, stations: [] }, h_log: { bld: true, stations: [] }, h_khata: { bld: true, stations: [] }, o_block: { bld: true, stations: [] }, h_shanty: { bld: true, stations: [] }, h_mobile: { bld: true, stations: [] }, // дома города
  tr_oak: { bld: true, stations: [] }, tr_lime: { bld: true, stations: [] }, tr_pine: { bld: true, stations: [] }, tr_bush: { bld: true, stations: [] }, p_lamp: { bld: true, stations: [] }, // деревья и фонари вблизи
  pr_vend: { bld: true, stations: [] }, pr_vend2: { bld: true, stations: [] }, pr_booth: { bld: true, stations: [] }, pr_bin: { bld: true, stations: [] }, pr_wbins: { bld: true, stations: [] }, // уличные мелочи
  obj_jhangar: { obj: true, stations: [] }, obj_cont: { obj: true, stations: [] }, obj_milbase: { obj: true, stations: [] }, obj_oldind: { obj: true, stations: [] }, obj_factory: { obj: true, stations: [] }, // цех — и цель, и склады города вблизи
  // зенитные ракеты без своих пусковых: ракета «Вербы» — для всех ПЗРК и Avenger, AIM-120 (с F/A-18) — для NASAMS
  msl_manpads: { samMissile: ['strela2', 'redeye', 'igla', 'stinger', 'iglas', 'verba', 'avenger'], stations: [] },
  msl_aim120: { samMissile: ['nasams'], stations: [] },
  // трубы ПЗРК на плече у расчёта
  mp_verba: { launcher: ['strela2', 'igla', 'iglas', 'verba'], stations: [] },
  mp_stinger: { launcher: ['redeye', 'stinger'], stations: [] },
  // зенитные комплексы: корпус / башня / пакет (оси — LNCH в launchers.js, их печатает prepare.js)
  bukm3: { units: ['bukm3'], stations: [] }, // «Бук-М3» — Jeyhun1985
  // комплексы с ракетами на направляющих: ракета модели — в слотах и в полёте (у С-75 и С-125 — с отделяемым ускорителем)
  s75: { units: ['s75'], stations: [] }, // С-75 «Двина» — manyakasia
  s125: { units: ['s125'], stations: [] }, // С-125 «Нева» — teanid
  kub: { units: ['kub'], stations: [] }, // 2К12 «Куб» — UltraKill
  hawk: { units: ['hawk'], stations: [] }, // MIM-23 Hawk — Dominik Biały
  m163: { units: ['m163'], stations: [] }, // M163 VADS — 42manako
  gepard: { units: ['gepard'], stations: [] }, // Flakpanzer Gepard (не «War Thunder»)
  nasams: { units: ['nasams'], stations: [] }, // NASAMS 1 — пусковая
  ew_e: { units: ['gpsjam'], stations: [] }, // станция РЭБ (восток) — машина с РЛС IBIS-150
  ew_w: { units: ['gpsjamw'], stations: [] }, // станция РЭБ (запад) — радарная машина Renault TRM
  strela1: { units: ['strela1'], stations: [] }, // «Стрела-1» — 42manako
  osa: { units: ['osa'], stations: [] }, // «Оса-АКМ» — Jeyhun1985
  tor: { units: ['tor', 'torm2'], stations: [] }, // «Тор-М1» — 42manako
  pantsir: { units: ['pantsir'], stations: [] }, // «Панцирь-С2» — 42manako
  s400: { units: ['s400', 's300'], stations: [] }, // пусковая С-400 — Chenzoss (и для С-300: та же схема, 4 контейнера)
  patriot: { units: ['patriot', 'pac3'], stations: [] }, // Patriot M901 — Muhamad Mirza Arrafi
};
// авторы и лицензии — из исходных файлов (tools/airdef-models/prepare.js --credits)
// текстуры города (tex/*.jpg) — ambientCG: Grass004, Road008A, PavingStones151, Concrete042A, RoofingTiles006, Facade002/017/018A
const TEX_CREDIT = { title: 'Текстуры земли, дорог, крыш и фасадов', author: 'ambientCG', url: 'https://ambientcg.com', license: 'CC0', files: ['tex/*.jpg'] };
export const MODEL_CREDITS = [...CREDITS, TEX_CREDIT].map((c) => ({ ...c, licenseUrl: /CC0/.test(c.license) ? 'https://creativecommons.org/publicdomain/zero/1.0/' : 'http://creativecommons.org/licenses/by/4.0/' }));
const LOADED = {};
// разбор GLB: меши (позиции, нормали, UV, индексы), материалы, картинки текстур
function parseGlb(buf) {
  const dv = new DataView(buf), jl = dv.getUint32(12, true), json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jl)));
  const binOff = 28 + jl, T = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array };
  const slice = (bv, extra = 0, len = bv.byteLength) => buf.slice(binOff + (bv.byteOffset || 0) + extra, binOff + (bv.byteOffset || 0) + extra + len);
  const acc = (i) => { const a = json.accessors[i], bv = json.bufferViews[a.bufferView], C = T[a.componentType], n = { SCALAR: 1, VEC2: 2, VEC3: 3 }[a.type]; return new C(slice(bv, a.byteOffset || 0, a.count * n * C.BYTES_PER_ELEMENT)); };
  const meshes = json.meshes.map((m) => { const p = m.primitives[0], at = p.attributes; return { name: m.name, mat: json.materials[p.material], pos: acc(at.POSITION), nor: acc(at.NORMAL), uv: at.TEXCOORD_0 !== undefined ? acc(at.TEXCOORD_0) : null, idx: acc(p.indices) }; });
  const images = (json.images || []).map((im) => new Blob([slice(json.bufferViews[im.bufferView])], { type: im.mimeType }));
  return { meshes, images, textures: json.textures || [] };
}
const pylonMat = new THREE.MeshPhongMaterial({ color: 0x4a4f54, specular: 0x222222, shininess: 20 });
async function load(name, base) {
  const r = await fetch(`${base}models/${name}.glb?v=20261009z`); if (!r.ok) throw new Error(`${name}: ${r.status}`);
  const { meshes, images, textures } = parseGlb(await r.arrayBuffer());
  const tex = await Promise.all(textures.map(async (t) => {
    if (typeof createImageBitmap !== 'function') return null;
    let bmp; try { bmp = await createImageBitmap(images[t.source]); } catch (_) { return null; } // битая картинка — модель без этой текстуры
    // UV glTF — без переворота
    const x = new THREE.Texture(bmp); x.flipY = false; x.encoding = THREE.sRGBEncoding; x.anisotropy = 4; x.wrapS = x.wrapT = THREE.RepeatWrapping; x.needsUpdate = true; return x;
  }));
  // меш «часть|материал»: у комплексов — body / turret / cradle, у остальных всё в body
  const group = new THREE.Group(), parts = {};
  const partOf = (n) => { const k = n.includes('|') ? n.split('|')[0] : 'body'; if (!parts[k]) { parts[k] = new THREE.Group(); parts[k].name = k; group.add(parts[k]); } return parts[k]; };
  for (const m of meshes) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(m.nor, 3));
    if (m.uv) g.setAttribute('uv', new THREE.BufferAttribute(m.uv, 2));
    g.setIndex(new THREE.BufferAttribute(m.idx, 1)); g.computeBoundingSphere();
    const pbr = m.mat.pbrMetallicRoughness, f = pbr.baseColorFactor || [1, 1, 1, 1], glass = m.mat.alphaMode === 'BLEND';
    const map = pbr.baseColorTexture ? tex[pbr.baseColorTexture.index] : null;
    const mat = glass
      ? new THREE.MeshPhongMaterial({ color: new THREE.Color(f[0], f[1], f[2]).lerp(new THREE.Color(0.2, 0.26, 0.32), 0.5), transparent: true, opacity: Math.max(0.35, f[3]), specular: 0xffffff, shininess: 120, side: THREE.DoubleSide, depthWrite: false })
      : new THREE.MeshPhongMaterial({ map, color: new THREE.Color(f[0], f[1], f[2]), specular: 0x3a3a3a, shininess: 38, side: THREE.DoubleSide,
        ...(m.mat.alphaMode === 'MASK' ? { alphaTest: m.mat.alphaCutoff ?? 0.5 } : {}) });
    const mesh = new THREE.Mesh(g, mat); mesh.name = m.name; mesh.userData.glass = glass; partOf(m.name || '').add(mesh);
  }
  // дорисованные пилоны там, где у модели их нет
  for (const p of META[name].stations) if (p.py > 0) { const pm = new THREE.Mesh(new THREE.BoxGeometry(0.12, p.py, 1.6), pylonMat); pm.position.set(p.x, p.y + p.py / 2, p.z); group.add(pm); }
  return group;
}
// готовая модель комплекса: { body, turret, cradle } (копии) или null — тогда процедурная
const UMODEL = Object.fromEntries(Object.entries(META).filter(([, m]) => m.units).flatMap(([n, m]) => m.units.map((k) => [k, n])));
export function unitModelGlb(key) {
  const n = UMODEL[key], G = n && LOADED[n]; if (!G) return null;
  const get = (k) => { const p = G.children.find((c) => c.name === k); return p ? p.clone() : null; };
  return { body: get('body'), turret: get('turret'), cradle: get('cradle'), missile: get('missile'), booster: get('booster') };
}
// ракета комплекса из его модели (маршевая ступень + ускоритель) или null
export function unitMissileGlb(key) {
  const sm = SAMMSL[key]; if (sm && LOADED[sm]) return { missile: LOADED[sm].clone(), booster: null };
  const n = UMODEL[key], G = n && LOADED[n]; if (!G) return null;
  const m = G.children.find((c) => c.name === 'missile'); if (!m) return null;
  const b = G.children.find((c) => c.name === 'booster');
  return { missile: m.clone(), booster: b ? b.clone() : null };
}
export const isObjModel = (name) => !!(META[name] && META[name].obj);
export function objModel(name) { return LOADED[name] ? LOADED[name].clone() : null; }
export const isUnitModel = (name) => !!(META[name] && (META[name].units || META[name].launcher)); // пришла — пересобрать машины
// фоновая загрузка всех моделей; onReady — когда что-то загрузилось (чтобы пересобрать самолёты)
// самолёты и оружие — сразу; комплексы — по запросу wantUnit (только те, что есть в бою: файлы у них крупнее)
let BASE = '', READY = null; const LOADING = new Set();
function start(name) {
  if (LOADING.has(name)) return; LOADING.add(name);
  load(name, BASE).then((g) => { LOADED[name] = g; if (READY) READY(name); }).catch((e) => console.warn('модель не загрузилась:', e.message));
}
export function loadModels(base, onReady) {
  BASE = base; READY = onReady;
  for (const [name, m] of Object.entries(META)) if (!m.units && !m.bld) start(name); // самолёты, оружие, ракеты ПЗРК — сразу
}
export function wantUnit(key) { const n = UMODEL[key]; if (n && BASE) start(n); }
// дома города вблизи — по запросу (на слабом пресете не грузятся); bldModel — загруженная модель (общая, не копия)
export function wantBuildings() { if (BASE) for (const [n, m] of Object.entries(META)) if (m.bld) start(n); }
export const bldModel = (name) => (META[name] && (META[name].bld || META[name].obj) && LOADED[name]) || null;
// модель оружия: готовая (если есть и загрузилась) или процедурная геометрия с общим материалом
const byKey = (f) => Object.fromEntries(Object.entries(META).filter(([, m]) => m[f]).flatMap(([n, m]) => [].concat(m[f]).map((k) => [k, n])));
const WMODEL = byKey('weapon'), SAMMSL = byKey('samMissile'), LAUNCHER = byKey('launcher');
// прицельный контейнер игрока (или null — тогда цилиндр)
// (у самолётов pod — место подвески контейнера: ищем именно модель контейнера, pod === true)
export function podModel() { const n = Object.keys(META).find((k) => META[k].pod === true); return n && LOADED[n] ? LOADED[n].clone() : null; }
// труба ПЗРК (качающаяся часть пусковой у расчёта) или null
export function launcherGlb(key) { const n = LAUNCHER[key]; return n && LOADED[n] ? LOADED[n].clone() : null; }
export function weaponMesh(key, W, geoFn, mat) {
  const n = WMODEL[key];
  if (n && LOADED[n]) { const o = LOADED[n].clone(); o.traverse((q) => { if (q.isMesh) q.castShadow = true; }); return o; }
  return new THREE.Mesh(geoFn(key, W), mat);
}
// класс машины по подвеске: бомбы (в том числе управляемые) — ударный, иначе — ракетный
const BOMB = new Set(['bomb', 'lgb', 'tvb', 'gps']);
export function classOf(items, AG) {
  let b = 0, m = 0; for (const [key, n] of items) { const W = AG[key]; if (!W || W.kind === 'ecm') continue; if (BOMB.has(W.kind)) b += n * W.mass; else m += n * W.mass; }
  return b >= m ? 'strike' : 'fighter';
}
export const classOfRole = (role) => (role === 'sead' || role === 'low' || role === 'tv' ? 'fighter' : 'strike');
// готовая модель стороны и класса (своего класса нет — любая модель стороны; нет ничего — null, тогда процедурная)
// name — конкретная модель (из подвески), если загрузилась
export function planeModel(side, cls = 'strike', name = null) {
  const rank = ([n, m]) => (n === name ? -2 : m.cls === cls ? -1 : 0);
  const pick = Object.entries(META).filter(([n, m]) => m.side && m.side === side && LOADED[n]).sort((a, b) => rank(a) - rank(b))[0];
  if (!pick) return null;
  const [n, m] = pick;
  return { obj: LOADED[n].clone(), stations: m.stations, nozzles: m.nozzles, nr: m.nr, pod: m.pod, name: n, cls: m.cls };
}
