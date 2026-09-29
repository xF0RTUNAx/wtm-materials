// Мир «Симулятора Летки»: рельеф ~34×34 км (горный хребет по краю арены), река, города, аэродром, лес, облака, небо.
// Цвет — линейный конвейер: все «авторские» цвета задаются в sRGB и переводятся в линейное пространство (lin()),
// освещение считается физически, на выходе — тонмаппинг ACES и гамма (renderer или post.js).
// Детализация задаётся пресетом графики (см. PRESETS в main.js).
/* global THREE */
import { mulberry32 } from './schedule.js';
import { M, part, mergeParts } from './models.js';

export const WORLD = { R: 12000, SIZE: 34000, WATER_Y: 60, CEIL: 14000 };
export const SUN_DIR = new THREE.Vector3(0.42, 0.6, 0.38).normalize();
export const FOG_D = 0.000042;
export const CLOUD_H = 2600;
export const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();
export const FOG_LIN = lin(0xc6d8e8);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth01 = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Города и аэродром — ровные площадки (позиции постоянные, застройка — по seed)
export const TOWNS = [{ x: -3500, z: -2500, r: 950 }, { x: 4200, z: -4800, r: 900 }, { x: 5200, z: 2600, r: 850 }, { x: -5200, z: 4500, r: 900 }];
export const AIRFIELD = { x: -2600, z: 8200, r: 1700 };
function riverX(z) { return 2200 * Math.sin(z * 0.00022 + 1.1) + 900 * Math.sin(z * 0.00061); }
function baseH(x, z) {
  const r = Math.hypot(x, z);
  let h = 200 + 220 * Math.sin(x * 0.00031 + 0.7) * Math.cos(z * 0.00027) + 120 * Math.sin(x * 0.00071 + 1.3) * Math.sin(z * 0.00063 + 0.4)
    + 45 * Math.sin(x * 0.0019) * Math.cos(z * 0.0017 + 1) + 14 * Math.sin(x * 0.0053 + z * 0.0041);
  h += Math.pow(smooth01(11000, 16500, r), 1.4) * 1700 * (0.75 + 0.25 * Math.sin(Math.atan2(z, x) * 6 + 1.3));
  const dr = x - riverX(z);
  h -= 190 * Math.exp(-(dr * dr) / (2 * 340 * 340)) * (1 - smooth01(9000, 12000, r));
  return h;
}
const FLATS = [...TOWNS, AIRFIELD].map((f) => ({ ...f, h: Math.max(WORLD.WATER_Y + 25, baseH(f.x, f.z)) }));
export function terrainH(x, z) {
  let h = baseH(x, z);
  for (const f of FLATS) {
    const dx = x - f.x, dz = z - f.z;
    if (Math.abs(dx) > f.r || Math.abs(dz) > f.r) continue;
    const d = Math.hypot(dx, dz);
    if (d < f.r) h += (f.h - h) * (1 - smooth01(f.r * 0.55, f.r, d));
  }
  return h;
}
export function airfieldH() { return FLATS[FLATS.length - 1].h; }

// ── «поле облачности»: одна и та же функция в JS (где ставить облака) и в GLSL (где на земле их тени) ──
const fract = (v) => v - Math.floor(v);
function hsh(x, y) { return fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453); }
function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y); let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hsh(ix, iy), b = hsh(ix + 1, iy), c = hsh(ix, iy + 1), d = hsh(ix + 1, iy + 1);
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
}
export function cloudField(x, z) { return vnoise(x * 0.00032, z * 0.00032) * 0.65 + vnoise(x * 0.0009 + 5.2, z * 0.0009 + 1.3) * 0.35; }
const CLOUD_TH = 0.6;

export function radialTex(stops, size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d');
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) g.addColorStop(o, col);
  x.fillStyle = g; x.fillRect(0, 0, size, size); return new THREE.CanvasTexture(c);
}
// «пушистая» текстура облака: много мягких кругов с шумом
function puffTex() {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d'); const r = mulberry32(99);
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2, d = Math.pow(r(), 0.7) * S * 0.3, cx = S / 2 + Math.cos(a) * d, cy = S / 2 + Math.sin(a) * d, rad = S * (0.08 + r() * 0.14);
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, 'rgba(255,255,255,.22)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, rad, 0, 7); x.fill();
  }
  const t = new THREE.CanvasTexture(c); return t;
}

const NOISE_GLSL = `
  float hsh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hsh(i), hsh(i + vec2(1, 0)), f.x), mix(hsh(i + vec2(0, 1)), hsh(i + vec2(1, 1)), f.x), f.y); }
  float cloudField(vec2 q) { return vnoise(q * 0.00032) * 0.65 + vnoise(q * 0.0009 + vec2(5.2, 1.3)) * 0.35; }`;
const SUN_XZ = `vec2(${(SUN_DIR.x / SUN_DIR.y).toFixed(5)}, ${(SUN_DIR.z / SUN_DIR.y).toFixed(5)})`;

// Земля: детализация цвета шумом, тени от облаков, микрорельеф (только PBR-вариант — у Ламберта освещение повершинное)
function terrainShader(mat, P) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    let frag = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;' + NOISE_GLSL);
    let colorCode = '';
    if (P.detail) colorCode += `
        float n1 = vnoise(vWP.xz * 0.012), n2 = vnoise(vWP.xz * 0.09), n3 = vnoise(vWP.xz * 0.6);
        diffuseColor.rgb *= 0.74 + 0.26 * n1 + 0.16 * n2 + 0.07 * n3;`;
    if (P.cloudShadows) colorCode += `
        { vec2 cq = vWP.xz + ${SUN_XZ} * (${CLOUD_H.toFixed(1)} - vWP.y);
          diffuseColor.rgb *= 1.0 - 0.38 * smoothstep(${(CLOUD_TH + 0.02).toFixed(2)}, ${(CLOUD_TH + 0.1).toFixed(2)}, cloudField(cq)); }`;
    frag = frag.replace('#include <color_fragment>', '#include <color_fragment>' + colorCode);
    if (P.terrainPBR) frag = frag.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { vec2 p = vWP.xz; float fade = 1.0 - smoothstep(400.0, 3000.0, length(vWP - cameraPosition));
          float n0 = vnoise(p * 0.07) + 0.5 * vnoise(p * 0.23), nx = vnoise((p + vec2(1.2, 0.0)) * 0.07) + 0.5 * vnoise((p + vec2(1.2, 0.0)) * 0.23);
          float nz = vnoise((p + vec2(0.0, 1.2)) * 0.07) + 0.5 * vnoise((p + vec2(0.0, 1.2)) * 0.23);
          vec3 d = vec3((n0 - nx) * 1.4, 0.0, (n0 - nz) * 1.4) * fade;
          normal = normalize(normal + (viewMatrix * vec4(d, 0.0)).xyz); }`);
    sh.fragmentShader = frag;
  };
}
function windowBuildings(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 wpB = vec4(transformed, 1.0); vec3 nB = objectNormal;
        #ifdef USE_INSTANCING
          wpB = instanceMatrix * wpB; nB = mat3(instanceMatrix) * nB;
        #endif
        vWP = (modelMatrix * wpB).xyz; vWN = normalize(nB);`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (abs(vWN.y) < 0.5) {
          vec2 w = vec2((abs(vWN.x) > 0.5 ? vWP.z : vWP.x) / 3.4, vWP.y / 3.8);
          vec2 f = fract(w);
          float win = step(0.2, f.x) * step(f.x, 0.8) * step(0.28, f.y) * step(f.y, 0.84);
          float lit = step(0.83, fract(sin(dot(floor(w), vec2(12.9898, 78.233))) * 43758.5453));
          vec3 glass = mix(vec3(0.015, 0.03, 0.06), vec3(0.9, 0.7, 0.32), lit * 0.55);
          diffuseColor.rgb = mix(diffuseColor.rgb, glass, win * 0.9);
          diffuseColor.rgb *= 0.85 + 0.15 * step(0.5, fract(vWP.y / 3.8 * 0.5)); // межэтажные пояса
        } else { diffuseColor.rgb *= 0.6; }`);
  };
}

// Физическое небо: градиент зенит→горизонт, тёплая дымка у солнца, ореол и яркий (HDR) солнечный диск
function skyMaterial(discK) {
  return new THREE.ShaderMaterial({
    uniforms: { sunDir: { value: SUN_DIR }, zenith: { value: lin(0x2d63b4) }, horizon: { value: lin(0xcadcec) }, ground: { value: lin(0x8f9c8c) }, discK: { value: discK } },
    vertexShader: `varying vec3 vDir;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `uniform vec3 sunDir, zenith, horizon, ground; uniform float discK; varying vec3 vDir;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        vec3 d = normalize(vDir); float h = d.y;
        vec3 col = h > 0.0 ? mix(horizon, zenith, pow(h, 0.5)) : mix(horizon, ground, pow(min(-h * 5.0, 1.0), 0.6));
        float sd = max(dot(d, sunDir), 0.0);
        col += vec3(1.0, 0.7, 0.42) * pow(sd, 6.0) * 0.22 * (1.0 - abs(h));
        col += vec3(1.0, 0.95, 0.85) * (pow(sd, 90.0) * 0.9 + pow(sd, 2400.0) * discK);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false, extensions: { fragDepth: true },
  });
}

// buildWorld: наполняет сцену. P — пресет. Возвращает здания (для столкновений), follow/update и dispose.
export function buildWorld(scene, P, seed, renderer) {
  const owned = [];
  const add = (o) => { scene.add(o); owned.push(o); return o; };
  const rnd = mulberry32((seed ^ 0x51ed270b) >>> 0);

  scene.fog = new THREE.FogExp2(FOG_LIN.clone(), FOG_D);
  add(new THREE.HemisphereLight(lin(0xd6e8ff), lin(0x6d7560), P.terrainPBR ? 0.55 : 0.8));
  const sun = new THREE.DirectionalLight(lin(0xfff0d8), P.terrainPBR ? 2.4 : 1.25);
  sun.position.copy(SUN_DIR).multiplyScalar(2000); add(sun); add(sun.target);
  const shBox = P.shadowBox || 220;
  if (P.shadows) {
    sun.castShadow = true; sun.shadow.mapSize.set(P.shadowMap || 2048, P.shadowMap || 2048);
    const c = sun.shadow.camera; c.left = -shBox; c.right = shBox; c.top = shBox; c.bottom = -shBox; c.near = 10; c.far = 5000;
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
  }

  // небо
  const sky = add(new THREE.Mesh(new THREE.SphereGeometry(52000, 48, 24), skyMaterial(40)));
  sky.renderOrder = -2;

  // карта окружения для металла (PBR) — из того же неба (без ослепительного диска)
  if (P.pbr && renderer) {
    try {
      const envScene = new THREE.Scene();
      envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), skyMaterial(2)));
      const pm = new THREE.PMREMGenerator(renderer);
      scene.environment = pm.fromScene(envScene, 0.02).texture;
      pm.dispose();
    } catch (_) { /* без отражений — не критично */ }
  }

  // рельеф
  {
    const N = P.terrainN, S = WORLD.SIZE;
    const g = new THREE.PlaneGeometry(S, S, N, N); g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, terrainH(pos.getX(i), pos.getZ(i)));
    g.computeVertexNormals();
    const nor = g.attributes.normal, col = new Float32Array(pos.count * 3), c = new THREE.Color(), r2 = mulberry32(777);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i), ny = nor.getY(i);
      const j = (r2() - 0.5) * 0.05;
      const field = Math.sin(x * 0.0021 + Math.sin(z * 0.0013) * 2) * Math.sin(z * 0.0019 + 0.5);
      const forest = Math.sin(x * 0.0009 + 2) * Math.cos(z * 0.0011) + 0.4 * Math.sin(x * 0.0031 + z * 0.0027);
      const town = TOWNS.some((t) => Math.hypot(x - t.x, z - t.z) < t.r * 0.8);
      if (y < WORLD.WATER_Y + 12) c.setRGB(0.72 + j, 0.66 + j, 0.48 + j);
      else if (y > 1450) c.setRGB(0.94, 0.95, 0.97);
      else if (ny < 0.78 || y > 1050) c.setRGB(0.47 + j, 0.45 + j, 0.42 + j);
      else if (town) c.setRGB(0.5 + j, 0.5 + j, 0.46 + j);
      else if (forest > 0.55) c.setRGB(0.17 + j, 0.33 + j, 0.15 + j);
      else if (field > 0.45) c.setRGB(0.66 + j, 0.6 + j, 0.32 + j);
      else if (field < -0.5) c.setRGB(0.42 + j, 0.52 + j, 0.24 + j);
      else c.setRGB(0.32 + j, 0.5 + j, 0.24 + j);
      c.convertSRGBToLinear();
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = P.terrainPBR ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, envMapIntensity: 0.6 })
      : new THREE.MeshLambertMaterial({ vertexColors: true });
    if (P.detail || P.cloudShadows || P.terrainPBR) terrainShader(mat, P);
    const mesh = add(new THREE.Mesh(g, mat)); mesh.receiveShadow = !!P.shadows;
    const far = add(new THREE.Mesh(new THREE.PlaneGeometry(240000, 240000), new THREE.MeshLambertMaterial({ color: lin(0x5f7050) })));
    far.rotation.x = -Math.PI / 2; far.position.y = -40; // ниже воды: внутри карты её не видно
  }
  const water = add(new THREE.Mesh(new THREE.PlaneGeometry(WORLD.SIZE, WORLD.SIZE), P.pbr
    ? new THREE.MeshPhongMaterial({ color: lin(0x2c6d8c), shininess: 120, specular: lin(0x9ab8d0), transparent: true, opacity: 0.92 })
    : new THREE.MeshLambertMaterial({ color: lin(0x2f6f8e) })));
  water.rotation.x = -Math.PI / 2; water.position.y = WORLD.WATER_Y;
  const waterTime = { value: 0 };
  if (P.waterAnim) {
    water.material.onBeforeCompile = (sh) => {
      sh.uniforms.wTime = waterTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; uniform float wTime;' + NOISE_GLSL)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          { vec2 q = vWP.xz * 0.02; float t = wTime;
            vec3 pn = vec3(sin(q.x * 3.1 + t * 1.3) + 0.7 * sin(q.y * 2.3 - t * 0.9) + vnoise(q * 6.0 + t * 0.3) - 0.5, 0.0,
                           cos(q.y * 2.9 + t * 1.1) + 0.7 * sin(q.x * 1.7 + t * 0.7) + vnoise(q * 7.0 - t * 0.2) - 0.5);
            normal = normalize(normal + (viewMatrix * vec4(pn * 0.1, 0.0)).xyz); }`);
    };
  }

  // аэродром: полоса с разметкой, рулёжка, ангары
  {
    const h = airfieldH() + 0.6, parts = [];
    parts.push(part(new THREE.BoxGeometry(60, 1, 3000), 0x3c3f42, M(0, 0, 0)));
    for (let k = -14; k <= 14; k++) parts.push(part(new THREE.BoxGeometry(1.5, 1.05, 40), 0xe8e8e0, M(0, 0.02, k * 100)));
    for (const s of [-1, 1]) for (let k = 0; k < 8; k++) parts.push(part(new THREE.BoxGeometry(3, 1.05, 30), 0xe8e8e0, M((k - 3.5) * 6, 0.02, s * 1450)));
    parts.push(part(new THREE.BoxGeometry(24, 0.9, 2600), 0x4a4d50, M(120, 0, 0)));
    for (let k = 0; k < 6; k++) {
      parts.push(part(new THREE.BoxGeometry(40, 12, 50), 0x7c8278, M(210, 6, -900 + k * 360)));
      parts.push(part(new THREE.CylinderGeometry(25, 25, 50, 16, 1, false, 0, Math.PI), 0x6d736a, M(210, 12, -900 + k * 360, Math.PI / 2, 0, Math.PI / 2)));
    }
    const m = add(new THREE.Mesh(mergeParts(parts), new THREE.MeshLambertMaterial({ vertexColors: true })));
    m.position.set(AIRFIELD.x, h, AIRFIELD.z); m.receiveShadow = !!P.shadows;
  }

  // здания: отдельный InstancedMesh на город — невидимые города отсекаются целиком
  const buildings = [];
  const bMat = new THREE.MeshLambertMaterial();
  if (P.windows) windowBuildings(bMat);
  for (const t of TOWNS) {
    const N = P.bldPerTown, geo = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.InstancedMesh(geo, bMat, N);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
    let maxH = 0;
    for (let k = 0; k < N; k++) {
      let x, z, rr, tries = 0;
      do { const a = rnd() * Math.PI * 2; rr = Math.pow(rnd(), 0.8) * t.r * 0.72; x = t.x + Math.cos(a) * rr; z = t.z + Math.sin(a) * rr; tries++; }
      while (tries < 20 && buildings.some((b) => Math.abs(b.x - x) < b.hw + 22 && Math.abs(b.z - z) < b.hd + 22));
      const w = 16 + rnd() * 26, d = 16 + rnd() * 26;
      const hgt = Math.min(170, (14 + rnd() * 40) * (1 + 1.8 * Math.max(0, 1 - rr / (t.r * 0.5))));
      const base = terrainH(x, z) - 3;
      m.compose(new THREE.Vector3(x, base + hgt / 2, z), q, new THREE.Vector3(w, hgt, d));
      mesh.setMatrixAt(k, m);
      const tt = rnd();
      if (tt < 0.4) c.setRGB(0.72, 0.70, 0.66); else if (tt < 0.7) c.setRGB(0.62, 0.64, 0.68); else if (tt < 0.88) c.setRGB(0.74, 0.62, 0.52); else c.setRGB(0.5, 0.56, 0.62);
      mesh.setColorAt(k, c.convertSRGBToLinear());
      buildings.push({ x, z, hw: w / 2, hd: d / 2, y0: base, y1: base + hgt });
      maxH = Math.max(maxH, base + hgt);
    }
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(t.x, maxH / 2, t.z), t.r + maxH);
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = mesh.receiveShadow = !!P.shadows;
    add(mesh);
  }

  // лес: квадраты 2×2 км, у каждого свой InstancedMesh — вне кадра и дальше дальности прорисовки не рисуется
  const treeChunks = [];
  {
    const spruce = mergeParts([
      part(new THREE.CylinderGeometry(0.5, 0.8, 5, 5), 0x5a4029, M(0, 2.5, 0)),
      part(new THREE.ConeGeometry(4.6, 10, 7), 0x2a5f27, M(0, 8.5, 0)),
      part(new THREE.ConeGeometry(3.4, 8, 7), 0x35732f, M(0, 13, 0)),
    ]);
    const leafy = mergeParts([
      part(new THREE.CylinderGeometry(0.5, 0.9, 7, 5), 0x5e4630, M(0, 3.5, 0)),
      part(new THREE.IcosahedronGeometry(5.2, 1), 0x3f7a2e, M(0, 10, 0, 0, 0, 0, 1, 0.85, 1)),
      part(new THREE.IcosahedronGeometry(3.6, 1), 0x4c8a35, M(2.2, 12.5, 1, 0, 0, 0, 1, 0.8, 1)),
    ]);
    const tMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const CH = 2000, cells = new Map();
    let placed = 0;
    for (let k = 0; k < P.trees * 6 && placed < P.trees; k++) {
      const x = (rnd() - 0.5) * 24000, z = (rnd() - 0.5) * 24000;
      const forest = Math.sin(x * 0.0009 + 2) * Math.cos(z * 0.0011) + 0.4 * Math.sin(x * 0.0031 + z * 0.0027);
      if (forest < 0.5) continue;
      const y = terrainH(x, z);
      if (y < WORLD.WATER_Y + 15 || y > 1000) continue;
      const key = Math.floor(x / CH) + ':' + Math.floor(z / CH);
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push([x, y, z, 0.8 + rnd() * 0.9, rnd() * 6, 0.9 + rnd() * 0.4]);
      placed++;
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    let v = 0;
    for (const [key, list] of cells) {
      const [cx, cz] = key.split(':').map((n) => (+n + 0.5) * CH);
      const geo = (P.treeVariety && v++ % 2 ? leafy : spruce).clone();
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, list[0][1], cz), CH * 0.75 + 300);
      const mesh = new THREE.InstancedMesh(geo, tMat, list.length);
      list.forEach(([x, y, z, s, rot, sy], i) => { m.compose(new THREE.Vector3(x, y - 0.5, z), q.setFromEuler(e.set(0, rot, 0)), new THREE.Vector3(s, s * sy, s)); mesh.setMatrixAt(i, m); });
      mesh.instanceMatrix.needsUpdate = true; mesh.castShadow = !!P.shadows;
      add(mesh); treeChunks.push({ mesh, x: cx, z: cz });
    }
    spruce.dispose(); leafy.dispose();
  }

  // облака там, где «поле облачности» выше порога (там же на земле их тени)
  const centers = [];
  {
    // по облаку на каждый локальный максимум поля — там же, где шейдер земли рисует тень
    const st = 500, n = Math.round(30000 / st), F = [];
    for (let i = 0; i <= n; i++) { F.push([]); for (let j = 0; j <= n; j++) F[i].push(cloudField(-15000 + i * st, -15000 + j * st)); }
    for (let i = 1; i < n; i++) for (let j = 1; j < n; j++) {
      const f = F[i][j]; if (f < CLOUD_TH + 0.03) continue;
      let peak = true;
      for (let di = -1; di <= 1 && peak; di++) for (let dj = -1; dj <= 1; dj++) if ((di || dj) && F[i + di][j + dj] > f) { peak = false; break; }
      if (peak) centers.push([-15000 + i * st, -15000 + j * st, f]);
    }
    centers.sort((a, b) => b[2] - a[2]); centers.length = Math.min(centers.length, P.clouds);
  }
  let cloudMat = null;
  if (P.cloudSprites) {
    // объёмные облака из освещённых спрайтов: низ в тени, верх и край к солнцу светлее, «серебряная кромка» против солнца
    const R = mulberry32(777), offs = [], sizes = [], shades = [], rots = [];
    for (const [cx, cz, f] of centers) {
      const n = P.cloudPuffs * 3, rad = 300 + (f - CLOUD_TH) * 3000;
      for (let k = 0; k < n; k++) {
        const a = R() * Math.PI * 2, d = Math.pow(R(), 0.6) * rad, y = CLOUD_H + Math.pow(R(), 1.5) * rad * 0.7;
        const px = cx + Math.cos(a) * d, pz = cz + Math.sin(a) * d * 0.7;
        const hk = (y - CLOUD_H) / (rad * 0.7 + 1), side = (Math.cos(a) * SUN_DIR.x + Math.sin(a) * SUN_DIR.z) * (d / rad);
        offs.push(px, y, pz); sizes.push(260 + R() * 420 * (1 - d / rad * 0.5)); shades.push(clamp(0.35 + 0.55 * hk + 0.2 * side, 0.2, 1)); rots.push(R() * 6.28);
      }
    }
    const g = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(1, 1);
    g.setIndex(base.index); g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
    g.setAttribute('offset', new THREE.InstancedBufferAttribute(new Float32Array(offs), 3));
    g.setAttribute('psize', new THREE.InstancedBufferAttribute(new Float32Array(sizes), 1));
    g.setAttribute('shade', new THREE.InstancedBufferAttribute(new Float32Array(shades), 1));
    g.setAttribute('rot', new THREE.InstancedBufferAttribute(new Float32Array(rots), 1));
    g.instanceCount = sizes.length;
    cloudMat = new THREE.ShaderMaterial({
      uniforms: { map: { value: puffTex() }, sunDir: { value: SUN_DIR }, fogColor: { value: FOG_LIN }, fogDensity: { value: FOG_D * 0.8 },
        lit: { value: lin(0xfffaf2) }, dark: { value: lin(0x9aa6b8) } },
      vertexShader: `attribute vec3 offset; attribute float psize, shade, rot; varying vec2 vUv; varying float vShade, vFog, vFade; varying vec3 vView;
        uniform float fogDensity;
        #include <common>
        #include <logdepthbuf_pars_vertex>
        void main() {
          float c = cos(rot), s = sin(rot); vec2 p = mat2(c, s, -s, c) * position.xy;
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          vec3 wp = offset + (right * p.x + up * p.y) * psize;
          vec4 mv = viewMatrix * vec4(wp, 1.0); gl_Position = projectionMatrix * mv;
          float d = -mv.z; vFog = 1.0 - exp(-fogDensity * fogDensity * d * d);
          vFade = smoothstep(psize * 0.3, psize * 1.2, d); // не заслонять экран, когда пролетаем сквозь облако
          vUv = uv; vShade = shade; vView = normalize(wp - cameraPosition);
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 sunDir, fogColor, lit, dark; varying vec2 vUv; varying float vShade, vFog, vFade; varying vec3 vView;
        #include <common>
        #include <logdepthbuf_pars_fragment>
        void main() {
          #include <logdepthbuf_fragment>
          float a = texture2D(map, vUv).a * vFade; if (a < 0.01) discard;
          float fwd = pow(max(dot(vView, sunDir), 0.0), 8.0);
          vec3 col = mix(dark, lit, vShade) * (1.0 + 0.9 * fwd * (1.0 - vShade * 0.5)) * 1.15;
          gl_FragColor = vec4(mix(col, fogColor, vFog), a * 0.92);
          #include <tonemapping_fragment>
          #include <encodings_fragment>
        }`,
      transparent: true, depthWrite: false, extensions: { fragDepth: true },
    });
    const clouds = new THREE.Mesh(g, cloudMat); clouds.frustumCulled = false; clouds.renderOrder = 2;
    add(clouds);
  } else {
    const parts = [], cg = new THREE.IcosahedronGeometry(1, P.cloudPuffs > 8 ? 2 : 1), R = mulberry32(55);
    for (const [cx, cz] of centers) {
      const n = P.cloudPuffs;
      for (let k = 0; k < n; k++) {
        const s = 160 + R() * 260;
        parts.push(part(cg, 0xffffff, M(cx + (k - n / 2) * 170 + R() * 90, CLOUD_H + 150 + R() * 90 - (k % 2) * 40, cz + (R() - 0.5) * 260, 0, R() * 3, 0, s, s * (0.45 + R() * 0.25), s * 0.85)));
      }
    }
    if (parts.length) add(new THREE.Mesh(mergeParts(parts), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: lin(0x8e9aa6) })));
  }

  const treeDist = P.treeDist || 9000;
  return {
    buildings, sun, sky,
    update(dt) { waterTime.value += dt; },
    // небо следует за камерой, тень — за игроком; лес прорисовывается до treeDist
    follow(camPos, focus) {
      sky.position.copy(camPos);
      if (focus) { sun.position.copy(focus).addScaledVector(SUN_DIR, 2000); sun.target.position.copy(focus); sun.target.updateMatrixWorld(); }
      for (const t of treeChunks) t.mesh.visible = Math.hypot(t.x - camPos.x, t.z - camPos.z) < treeDist + 1400;
    },
    dispose() {
      for (const o of owned) {
        scene.remove(o);
        o.traverse((c) => { if (c.geometry) c.geometry.dispose(); if (c.material) { if (c.material.map) c.material.map.dispose(); c.material.dispose(); } });
      }
      if (scene.environment) { scene.environment.dispose(); scene.environment = null; }
    },
  };
}

// ═════════════ Частицы: точки с альфой и размером (линейный цвет, туман, логарифмическая глубина) ═════════════
export function makeParticles(scene, N, additive, tex) {
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), alp = new Float32Array(N), siz = new Float32Array(N);
  const vel = new Float32Array(N * 3), life = new Float32Array(N), max = new Float32Array(N), a0 = new Float32Array(N),
        grow = new Float32Array(N), drag = new Float32Array(N), grav = new Float32Array(N);
  for (let i = 0; i < N; i++) pos[i * 3 + 1] = -99999;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('pcolor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alp, 1));
  geo.setAttribute('size', new THREE.BufferAttribute(siz, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, scale: { value: 500 }, fogColor: { value: FOG_LIN }, fogDensity: { value: FOG_D }, glow: { value: additive ? 2.2 : 1 } },
    defines: additive ? { ADDITIVE: 1 } : {},
    extensions: { fragDepth: true },
    vertexShader: `#include <common>
      #include <logdepthbuf_pars_vertex>
      attribute float alpha; attribute float size; attribute vec3 pcolor;
      uniform float scale; uniform float fogDensity; varying vec3 vC; varying float vA; varying float vF;
      void main() { vC = pow(pcolor, vec3(2.2)); vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); float d = -mv.z;
        vF = 1.0 - exp(-fogDensity * fogDensity * d * d);
        gl_PointSize = (d > 0.0 && alpha > 0.0) ? min(size * scale / d, 400.0) : 0.0; gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `#include <common>
      #include <logdepthbuf_pars_fragment>
      uniform sampler2D map; uniform vec3 fogColor; uniform float glow; varying vec3 vC; varying float vA; varying float vF;
      void main() {
        #include <logdepthbuf_fragment>
        float t = texture2D(map, gl_PointCoord).a;
        #ifdef ADDITIVE
          gl_FragColor = vec4(vC * glow, vA * t * (1.0 - vF));
        #else
          gl_FragColor = vec4(mix(vC, fogColor, vF), vA * t);
        #endif
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }`,
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const points = new THREE.Points(geo, mat); points.frustumCulled = false; scene.add(points);
  let head = 0;
  return {
    mat, points,
    emit(x, y, z, vx, vy, vz, r, g, b, a, s, gr, l, dr, gv) {
      const i = head = (head + 1) % N, i3 = i * 3;
      pos[i3] = x; pos[i3 + 1] = y; pos[i3 + 2] = z; vel[i3] = vx; vel[i3 + 1] = vy; vel[i3 + 2] = vz;
      col[i3] = r; col[i3 + 1] = g; col[i3 + 2] = b; a0[i] = alp[i] = a; siz[i] = s; grow[i] = gr; max[i] = life[i] = l; drag[i] = dr; grav[i] = gv;
    },
    update(dt) {
      for (let i = 0; i < N; i++) {
        if (life[i] <= 0) { if (alp[i] !== 0) alp[i] = 0; continue; }
        const i3 = i * 3;
        life[i] -= dt;
        pos[i3] += vel[i3] * dt; pos[i3 + 1] += vel[i3 + 1] * dt; pos[i3 + 2] += vel[i3 + 2] * dt;
        const k = Math.max(0, 1 - drag[i] * dt); vel[i3] *= k; vel[i3 + 1] = vel[i3 + 1] * k + grav[i] * dt; vel[i3 + 2] *= k;
        siz[i] += grow[i] * dt;
        const f = Math.max(0, life[i] / max[i]); alp[i] = a0[i] * (additive ? f * f : f);
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.alpha.needsUpdate = true; geo.attributes.size.needsUpdate = true; geo.attributes.pcolor.needsUpdate = true;
    },
    dispose() { scene.remove(points); geo.dispose(); mat.dispose(); },
  };
}
