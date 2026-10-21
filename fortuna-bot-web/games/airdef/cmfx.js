// Ловушки в кадре (2026-10-21): горящие ЛТЦ и облака диполей — запечённые спрайты (tools/airdef-fx/flare-bake.py → fx/flare.png, fx/chaff.png).
//  • ЛТЦ: спрайт-билборд с сложением (слой огня FX_ADD_LAYER — как факелы ракет): белое ядро, жёлто-оранжевый ореол, искры; 16 кадров мерцания
//    (у каждой свой сдвиг), яркость и размер падают к концу горения. Не мельче 5 пикселей — вдали ЛТЦ остаётся точкой света.
//    За каждой ЛТЦ — короткая белая дымная лента (plume.js, MOTOR.flare); на слабых устройствах (P.fxLo) — у каждой третьей и реже.
//  • Диполи: облако блёсток фольги, обычная альфа (слой дыма FX_LAYER), растёт и тает за ~4 с, блёстки мигают по кадрам.
//  • Пул: на экране не больше MAXF ЛТЦ (64, на слабых 32 — самые свежие) и 16 облаков.
// ЛТЦ боя (sim/strike.js, S.flares) рисуются по тику (flareTick — каждый кадр, пока горят); онлайн-клиент своего боя не считает — у него
// ЛТЦ-«картинки» (cosFlares): те же точки отстрела (sim/cm.js), своя простая баллистика.
/* global THREE */
import { FOG_LIN, FOG_U, FXU, SOFT_GLSL } from '../drone/world.js?v=20261022r';
import { MOTOR } from './plume.js?v=20261022r';
import { cmOf, cmKey, cmWorld, cmCenter } from './sim/cm.js?v=20261022r';

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
const FS_FLARE = `#include <common>
  #include <logdepthbuf_pars_fragment>
  uniform sampler2D map; uniform float gain;
  varying vec2 vUv; varying vec3 vF; varying float vA, vFog;
  ${CELL}
  void main() {
    #include <logdepthbuf_fragment>
    vec4 t = mix(texture2D(map, cell(vF.x)), texture2D(map, cell(vF.y)), vF.z);
    if (t.a * vA < 0.003) discard;
    gl_FragColor = vec4(t.rgb * gain * (1.0 - vFog), vA);   // сложение: srcAlpha · цвет + фон
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
function makeSprites(scene, max, tex, fs, additive, uniforms) {
  const geo = new THREE.InstancedBufferGeometry(), pl = new THREE.PlaneGeometry(1, 1);
  geo.setAttribute('position', pl.attributes.position); geo.setAttribute('uv', pl.attributes.uv); geo.setIndex(pl.index);
  const aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3), aSize = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2), aF = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
  for (const a of [aPos, aSize, aF]) a.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iPos', aPos); geo.setAttribute('iSize', aSize); geo.setAttribute('iF', aF); geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, extensions: { fragDepth: true },
    uniforms: { map: { value: tex }, scale: { value: 500 }, minPx: { value: 5 }, fogDensity: FOG_U, ...uniforms } });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = additive ? 5 : 3; scene.add(mesh);
  let n = 0;
  return { mesh, mat, begin() { n = 0; }, full: () => n >= max, count: () => n,
    put(x, y, z, size, rot, f0, f1, mix, a) { aPos.setXYZ(n, x, y, z); aSize.setXY(n, size, rot); aF.setXYZW(n, f0, f1, mix, a); n++; },
    end() { geo.instanceCount = n; mesh.visible = n > 0; if (n) aPos.needsUpdate = aSize.needsUpdate = aF.needsUpdate = true; } };
}

export function createCmFx(scene, P, PL) {
  const L = WEB ? new THREE.TextureLoader() : null, tex = (f) => (L ? L.load(url(f)) : new THREE.Texture());
  const MAXF = P.fxLo ? 32 : 64, MAXC = 16;
  const FLS = makeSprites(scene, MAXF, tex('flare.png'), FS_FLARE, true, { gain: { value: 1.1 } });
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
    const fr = (age * 30 + f.cs * 16) % 16, f0 = Math.floor(fr), f1 = (f0 + 1) % 16;
    const burst = 1 + 0.4 * Math.max(0, 1 - age / 0.14); // в первые доли секунды — вспышка выброса
    const size = (3.2 + 1.8 * Math.min(1, k * 3)) * burst * (0.9 + 0.2 * Math.sin(age * 31 + f.cs * 9));
    live.push({ x: f.pos.x, y: f.pos.y, z: f.pos.z, size, rot: f.cs * 6.283, f0, f1, mix: fr - f0, a: Math.min(1, 0.15 + k * 3.5) });
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
          FLS.begin(); for (const s of live.slice(-MAXF)) FLS.put(s.x, s.y, s.z, s.size, s.rot, s.f0, s.f1, s.mix, s.a); FLS.end(); // самые свежие
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
