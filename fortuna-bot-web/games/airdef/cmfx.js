// Ловушки в кадре (2026-10-21): горящие ЛТЦ и облака диполей — запечённые спрайты (tools/airdef-fx/flare-bake.py → fx/flare.png, fx/chaff.png).
//  • ЛТЦ (2026-10-22, Mark): «капля» шейдером со сложением (слой огня FX_ADD_LAYER — как факелы ракет): белая головка, жёлто-оранжевый хвост
//    назад по скорости, чуть закручен, без мерцания; к концу горения гаснет и мельчает. Не мельче 6 пикселей — вдали ЛТЦ остаётся точкой света.
//    За каждой ЛТЦ — короткая белая дымная лента (plume.js, MOTOR.flare); на слабых устройствах (P.fxLo) — у каждой третьей и реже.
//  • Диполи: облако блёсток фольги, обычная альфа (слой дыма FX_LAYER), растёт и тает за ~4 с, блёстки мигают по кадрам.
//  • Пул: на экране не больше MAXF ЛТЦ (64, на слабых 32 — самые свежие) и 16 облаков.
// ЛТЦ боя (sim/strike.js, S.flares) рисуются по тику (flareTick — каждый кадр, пока горят); онлайн-клиент своего боя не считает — у него
// ЛТЦ-«картинки» (cosFlares): те же точки отстрела (sim/cm.js), своя простая баллистика.
/* global THREE */
import { FOG_LIN, FOG_U, FXU, SOFT_GLSL } from '../drone/world.js?v=20261022x';
import { MOTOR } from './plume.js?v=20261022x';
import { cmOf, cmKey, cmWorld, cmCenter } from './sim/cm.js?v=20261022x';

const url = (f) => new URL(`./fx/${f}`, import.meta.url).href;
const WEB = typeof document !== 'undefined' && !!document.createElementNS && typeof Image !== 'undefined'; // стенды Deno — без картинок
const VS = `#include <common>
  #include <logdepthbuf_pars_vertex>
  attribute vec3 iPos; attribute vec2 iSize; attribute vec4 iF;
  uniform float scale, minPx, fogDensity;
  varying vec2 vUv; varying vec3 vF; varying float vA, vFog;
  void main() {
    vUv = uv; vF = iF.xyz; vA = iF.w;
    vec4 mv0 = viewMatrix * vec4(iPos, 1.0); float d = max(-mv0.z, 0.1);
    float s = max(iSize.x, minPx * d / scale);              // не мельче minPx пикселей
    float c = cos(iSize.y), n = sin(iSize.y); vec2 q = position.xy * s; q = vec2(c * q.x - n * q.y, n * q.x + c * q.y);
    gl_Position = projectionMatrix * vec4(mv0.xyz + vec3(q, 0.0), 1.0);
    vFog = 1.0 - exp(-fogDensity * fogDensity * d * d);
    #include <logdepthbuf_vertex>
  }`;
const CELL = `vec2 cell(float f) { float c = mod(f, 4.0), r = floor(f / 4.0); return (vec2(c, 3.0 - r) + vUv) / 4.0; }`;
// ЛТЦ — «капля» (Mark 2026-10-22: было круглое мерцающее пятно): яркая головка впереди, хвост пламени назад по скорости, чуть закручен;
// квадрат вытянут вдоль проекции скорости на экран (iDir — направление полёта, iF.x — вытянутость: 1 — круг, до 3,5 — на скорости;
// вдоль луча зрения — снова круг), iF.y — фаза закрутки, iF.z — время (медленное колыхание хвоста, без мерцания)
const VS_FLARE = `#include <common>
  #include <logdepthbuf_pars_vertex>
  attribute vec3 iPos, iDir; attribute vec2 iSize; attribute vec4 iF;
  uniform float scale, minPx, fogDensity;
  varying vec2 vUv; varying vec3 vF; varying float vA, vFog, vEl;
  void main() {
    vUv = uv; vF = iF.xyz; vA = iF.w;
    vec4 mv0 = viewMatrix * vec4(iPos, 1.0); float d = max(-mv0.z, 0.1);
    float s = max(iSize.x, minPx * d / scale);
    vec3 ax = (viewMatrix * vec4(iDir, 0.0)).xyz; vec2 a2 = ax.xy; float pl = length(a2);
    vec2 fw = a2 / max(pl, 1e-4); if (pl < 1e-4) fw = vec2(0.0, 1.0);
    vec2 sd = vec2(fw.y, -fw.x);                              // правый базис (sd, fw): иначе квадрат вывернут и отсекается как задняя грань
    vEl = 1.0 + (iF.x - 1.0) * pl;                            // вытянутость на экране
    vec2 q = sd * position.x * s + fw * (position.y - 0.5 * (vEl - 1.0) / vEl) * s * vEl; // головка — у точки ЛТЦ, хвост — назад
    gl_Position = projectionMatrix * vec4(mv0.xyz + vec3(q, 0.0), 1.0);
    vFog = 1.0 - exp(-fogDensity * fogDensity * d * d);
    #include <logdepthbuf_vertex>
  }`;
const FS_FLARE = `#include <common>
  #include <logdepthbuf_pars_fragment>
  uniform float gain;
  varying vec2 vUv; varying vec3 vF; varying float vA, vFog, vEl;
  void main() {
    #include <logdepthbuf_fragment>
    // в долях ширины: px — поперёк, py — вдоль (0 — центр головки, < 0 — хвост)
    // хвост (Mark 2026-10-22: огонь обрывался ровным срезом в дым): без края — сужается конусом от головки и гаснет экспоненциально
    // по всей длине квадрата, кромка неровная (медленный «шум» из синусов по длине), к концу квадрата яркость уже ≈ 0
    float px = vUv.x - 0.5, L = vEl, hy = 1.0 - 0.5 / L, py = (vUv.y - hy) * L;
    float tq = clamp(-py / max(L - 0.5, 0.5), 0.0, 1.0), tail = step(py, 0.0);
    px -= 0.03 * sin(py * 2.2 + vF.y + vF.z * 1.3) * tq;          // закрученный хвост, колышется медленно
    float rh = 0.11, dh = length(vec2(px, py * 0.8));               // головка — круглая (с max(py, 0) была капсулой до конца квадрата — тот самый срез)
    float wd = rh * (1.15 - 0.75 * tq);                             // ширина хвоста: конус
    float rag = 0.7 + 0.3 * sin(py * 5.3 + vF.y * 2.0 - vF.z * 2.6) * sin(py * 2.1 + vF.y + vF.z * 1.1); // неровная кромка и «языки»
    float fade = exp(-tq * 4.2) * (1.0 - tq * tq);                  // спад по длине — без ступеньки
    // хвост тусклее головки: на светлом дневном небе сложение пересвечивает — белой «палкой» должна быть только головка
    float core = exp(-dh * dh / (rh * rh * 0.5)) + exp(-px * px / (wd * wd * 0.12)) * exp(-tq * 9.0) * 0.35 * tail;
    float flame = exp(-px * px / (wd * wd * 0.55 * rag)) * fade * rag * 0.45 * tail + exp(-dh * dh / (rh * rh * 2.5)) * 0.4;
    float halo = exp(-(px * px + py * py * 0.4) / 0.05) * 0.18;
    vec3 c = vec3(1.0, 0.97, 0.9) * min(core, 1.2) * 0.9 + mix(vec3(1.0, 0.45, 0.12), vec3(1.0, 0.7, 0.3), fade) * flame * 0.55 + vec3(1.0, 0.5, 0.18) * halo;
    float lum = max(c.r, max(c.g, c.b));
    if (lum * vA < 0.004) discard;
    gl_FragColor = vec4(c * gain * (1.0 - vFog), vA);   // сложение: srcAlpha · цвет + фон
    #include <tonemapping_fragment>
    #include <encodings_fragment>
  }`;
const FS_CHAFF = `#include <common>
  #include <logdepthbuf_pars_fragment>
  uniform sampler2D map; uniform vec3 fogColor, uLight;
  varying vec2 vUv; varying vec3 vF; varying float vA, vFog;
  ${SOFT_GLSL}
  ${CELL}
  void main() {
    #include <logdepthbuf_fragment>
    vec4 t = mix(texture2D(map, cell(vF.x)), texture2D(map, cell(vF.y)), vF.z);
    float a = t.a * vA * fxSoft(6.0);
    if (a < 0.004) discard;
    vec3 c = t.rgb * min(uLight * 1.5 + 0.25, vec3(1.3));   // фольга блестит на солнце
    gl_FragColor = vec4(mix(c, fogColor, vFog), clamp(a, 0.0, 1.0));
    #include <tonemapping_fragment>
    #include <encodings_fragment>
  }`;

// набор спрайтов одной раскадровки: один вызов отрисовки; размер, кадры (f0, f1, смесь) и прозрачность — на экземпляр
function makeSprites(scene, max, tex, fs, additive, uniforms, vs = VS) {
  const geo = new THREE.InstancedBufferGeometry(), pl = new THREE.PlaneGeometry(1, 1);
  geo.setAttribute('position', pl.attributes.position); geo.setAttribute('uv', pl.attributes.uv); geo.setIndex(pl.index);
  const aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3), aSize = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2), aF = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4), aDir = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
  for (const a of [aPos, aSize, aF, aDir]) a.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iPos', aPos); geo.setAttribute('iSize', aSize); geo.setAttribute('iF', aF); geo.setAttribute('iDir', aDir); geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, extensions: { fragDepth: true },
    uniforms: { map: { value: tex }, scale: { value: 500 }, minPx: { value: 5 }, fogDensity: FOG_U, ...uniforms } });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = additive ? 5 : 3; scene.add(mesh);
  let n = 0;
  return { mesh, mat, begin() { n = 0; }, full: () => n >= max, count: () => n,
    put(x, y, z, size, rot, f0, f1, mix, a, dx = 0, dy = 0, dz = 1) { aPos.setXYZ(n, x, y, z); aSize.setXY(n, size, rot); aF.setXYZW(n, f0, f1, mix, a); aDir.setXYZ(n, dx, dy, dz); n++; },
    end() { geo.instanceCount = n; mesh.visible = n > 0; if (n) aPos.needsUpdate = aSize.needsUpdate = aF.needsUpdate = aDir.needsUpdate = true; } };
}

export function createCmFx(scene, P, PL) {
  const L = WEB ? new THREE.TextureLoader() : null, tex = (f) => (L ? L.load(url(f)) : new THREE.Texture());
  const MAXF = P.fxLo ? 32 : 64, MAXC = 16;
  const FLS = makeSprites(scene, MAXF, null, FS_FLARE, true, { gain: { value: 1.1 } }, VS_FLARE); // «капля» рисуется шейдером (fx/flare.png больше не нужен)
  const CHS = makeSprites(scene, MAXC, tex('chaff.png'), FS_CHAFF, false, { ...FXU, fogColor: { value: FOG_LIN }, uLight: { value: new THREE.Vector3(1, 1, 1) } });
  FLS.mat.uniforms.minPx.value = 6; CHS.mat.uniforms.minPx.value = 12;
  const tick = [], cos = [], clouds = []; // tick — ЛТЦ боя за этот кадр; cos — «картинки» онлайн-клиента; clouds — облака диполей
  const CP = [0, 0, 0], CD = [0, 0, 0];
  let live = [], idleT = 0;
  // ЛТЦ в кадр: f — { pos, vel, life, max, rb } (боя или картинка); ленточный дым — раз в 0,05 с (на слабых — реже и не у всех)
  function drawFlare(f, dt) {
    if (f.cs === undefined) f.cs = Math.random();
    const age = f.max - f.life, k = Math.max(0, Math.min(1, f.life / f.max));
    if (dt > 0 && f.life > 0.05) {
      f.pt = (f.pt || 0) - dt;
      if (f.pt <= 0) { f.pt = P.fxLo ? 0.08 : 0.05; if (f.rb !== false && PL) PL.add(f, f.pos.x, f.pos.y, f.pos.z, MOTOR.flare, 0.5); }
    }
    // без мерцания: вспышка выброса (0,14 с), полная яркость первую половину горения, затем плавно гаснет и мельчает;
    // хвост — по скорости (торможение в воздухе — капля становится круглее)
    const burst = 1 + 0.35 * Math.max(0, 1 - age / 0.14), sp = f.vel ? f.vel.length() : 0;
    const size = (1.9 + 1.1 * Math.min(1, k * 2)) * burst, el = 1 + Math.min(3.2, sp / 45);
    const a = Math.min(1, age / 0.05 + 0.2) * Math.pow(Math.min(1, k / 0.5), 1.3), iv = sp > 1 ? 1 / sp : 0;
    live.push({ x: f.pos.x, y: f.pos.y, z: f.pos.z, size, rot: 0, f0: el, f1: f.cs * 6.283, mix: age, a, dx: sp > 1 ? f.vel.x * iv : 0, dy: sp > 1 ? f.vel.y * iv : -1, dz: sp > 1 ? f.vel.z * iv : 0 });
  }
  const api = {
    flares: FLS.mesh, chaff: CHS.mesh, mats: [FLS.mat, CHS.mat],
    setLayers(fxL, addL) { FLS.mesh.layers.set(addL); CHS.mesh.layers.set(fxL); },
    tick(f, dt) { tick.push([f, dt]); },
    // выброс залпа картинками (онлайн: боя нет — есть только событие «ловушки»); те же точки отстрела, что у боя
    cosFlares(a) {
      const cm = cmOf(cmKey(a), a.cmSide || a.mside || a.side); if (!cm.flare) return;
      const vx = a.vel ? a.vel.x : 0, vy = a.vel ? a.vel.y : 0, vz = a.vel ? a.vel.z : 0;
      for (let i = 0; i < cm.salvo; i++) {
        cmWorld(a, cm, i, CP, CD);
        cos.push({ pos: new THREE.Vector3(CP[0], CP[1], CP[2]), vel: new THREE.Vector3(vx * 0.6 + CD[0] * 25 + (Math.random() - 0.5) * 8, vy * 0.6 + CD[1] * 25 + (Math.random() - 0.5) * 8, vz * 0.6 + CD[2] * 25 + (Math.random() - 0.5) * 8), life: 3.5, max: 3.5, rb: !P.fxLo || i % 3 === 0 });
      }
      while (cos.length > MAXF) cos.shift();
    },
    // ЛТЦ боя: какие из залпа тянут ленту дыма (на слабых — каждая третья)
    arm(made) { made.forEach((f, i) => { f.rb = !P.fxLo || i % 3 === 0; }); },
    cloud(a, v) {
      const cm = cmOf(cmKey(a), a.cmSide || a.mside || a.side); cmCenter(a, cm, CP);
      clouds.push({ p: new THREE.Vector3(CP[0], CP[1], CP[2]), v: (v || a.vel || new THREE.Vector3()).clone().multiplyScalar(0.25), t: 0, life: 4.2, seed: Math.random() });
      while (clouds.length > MAXC) clouds.shift();
    },
    clear() { tick.length = 0; cos.length = 0; clouds.length = 0; live = []; FLS.begin(); FLS.end(); CHS.begin(); CHS.end(); },
    update(dt, light) {
      if (dt > 0) {
        for (let i = cos.length - 1; i >= 0; i--) { // картинки онлайна: торможение, тяжесть, выгорание
          const f = cos[i]; f.life -= dt; f.vel.multiplyScalar(Math.max(0, 1 - 0.9 * dt)); f.vel.y -= 9.8 * dt; f.pos.addScaledVector(f.vel, dt);
          if (f.life <= 0) cos.splice(i, 1);
        }
        // «Время ×4»: update зовут несколько раз за кадр, а ЛТЦ боя приходят (flareTick) раз в кадр — без новых не стирать (ревью 2026-10-21)
        if (tick.length || cos.length) {
          idleT = 0; live = [];
          for (const [f, d] of tick) drawFlare(f, d);
          tick.length = 0;
          for (const f of cos) drawFlare(f, dt);
          FLS.begin(); for (const s of live.slice(-MAXF)) FLS.put(s.x, s.y, s.z, s.size, s.rot, s.f0, s.f1, s.mix, s.a, s.dx, s.dy, s.dz); FLS.end(); // самые свежие
        } else if ((idleT += dt) > 0.15 && live.length) { live = []; FLS.begin(); FLS.end(); }
        CHS.begin();
        for (let i = clouds.length - 1; i >= 0; i--) {
          const c = clouds[i]; c.t += dt; c.v.multiplyScalar(Math.max(0, 1 - 1.4 * dt)); c.v.y -= 1.2 * dt; c.p.addScaledVector(c.v, dt);
          if (c.t > c.life) { clouds.splice(i, 1); continue; }
          const fr = (c.t * 14 + c.seed * 16) % 16, f0 = Math.floor(fr), u = c.t / c.life;
          CHS.put(c.p.x, c.p.y, c.p.z, 6 + c.t * 7.5, c.seed * 6.283, f0, (f0 + 1) % 16, fr - f0, Math.min(1, c.t / 0.12) * (1 - u * u) * 0.95);
        }
        CHS.end();
      }
      if (light) CHS.mat.uniforms.uLight.value.copy(light);
    },
  };
  return api;
}
