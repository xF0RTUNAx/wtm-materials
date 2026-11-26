// Остаток облака взрыва клубами в объёме (Mark 2026-11-26: «дым висит в воздухе и проходит сквозь препятствия»): один лист кадров - плоская
// картинка; растянутая на десятки метров и на минуту, она резала дома и висела пластом. Студии собирают остаток из многих клубов - так и здесь:
// клуб - мягкая шумовая «шапка» со сферическими нормалями (свет солнца с нужной стороны, небо сверху, земля снизу - как у листов explode6),
// цвет - сажа или пыль грунта, край рвётся шумом, у домов и земли - мягкий переход по глубине (как у частиц). Все клубы - один вызов отрисовки.
/* global THREE */
import { FXU, SOFT_GLSL } from '../drone/world.js?v=20261124a';
const VS = `attribute vec4 iP; attribute vec4 iA; attribute vec4 iC;
varying vec2 vUv; varying vec4 vA; varying vec3 vC; varying float vD;
void main() {
  vUv = uv; vA = iA; vC = iC.rgb;
  vec3 cr = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), cu = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 w = iP.xyz + (cr * position.x + cu * position.y * iC.w) * iP.w; // iC.w - сплюснутость (пыль у земли - шире, чем выше)
  vec4 mv = viewMatrix * vec4(w, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv;
}`;
const FS = `uniform vec3 uSunV, uSunC, uSkyC, uGndC, uFog; uniform float uFogD, uT;
${SOFT_GLSL}
varying vec2 vUv; varying vec4 vA; varying vec3 vC; varying float vD;
float h1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h1(i), h1(i + vec2(1, 0)), f.x), mix(h1(i + vec2(0, 1)), h1(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec2 q = vUv * 2.0 - 1.0; float r = length(q); if (r > 1.0) discard;
  // vA: x - прозрачность, y - зерно, z - доля пыли, w - возраст (медленное течение узора)
  vec2 p = q * 2.2 + vec2(vA.y * 37.0, vA.y * 11.0) + vec2(0.0, -vA.w * 0.05);
  float f = n2(p) * 0.5 + n2(p * 2.1 + 5.2) * 0.3 + n2(p * 4.7 + 1.3) * 0.2;
  float den = smoothstep(1.0, 0.25, r + (f - 0.5) * 0.75) * smoothstep(0.15, 0.55, f + 0.25 * (1.0 - r));
  float a = vA.x * den * fxSoft(max(4.0, 0.0)); if (a < 0.004) discard;
  vec3 nV = normalize(vec3(q * 0.85 + (vec2(n2(p * 1.7), n2(p * 1.7 + 9.0)) - 0.5) * 0.5, sqrt(max(0.0, 1.0 - r * r)) + 0.25)); // нормаль клуба в осях камеры
  vec3 s = normalize((viewMatrix * vec4(uSunV, 0.0)).xyz), up = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  float dl = max(0.0, dot(nV, s) * 0.75 + 0.25), hy = dot(nV, up) * 0.5 + 0.5;
  vec3 alb = mix(vec3(0.075, 0.072, 0.068), vC, vA.z), sunC = mix(vec3(dot(uSunC, vec3(0.2126, 0.7152, 0.0722))), uSunC, 0.7);
  vec3 col = alb * (sunC * dl * 1.6 + (uSkyC * hy + uGndC * (1.0 - hy)) * 1.9) * (0.8 + 0.4 * f);
  float fog = 1.0 - exp(-vD * vD * uFogD * uFogD);
  gl_FragColor = vec4(mix(col, uFog, fog), a);
}`;
export function createCloudPuffs(scene, max = 400) {
  const geo = new THREE.InstancedBufferGeometry(), pl = new THREE.PlaneGeometry(1, 1);
  geo.setAttribute('position', pl.attributes.position); geo.setAttribute('uv', pl.attributes.uv); geo.setIndex(pl.index);
  const aP = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4), aA = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4), aC = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
  for (const a of [aP, aA, aC]) { a.setUsage(THREE.DynamicDrawUsage); }
  geo.setAttribute('iP', aP); geo.setAttribute('iA', aA); geo.setAttribute('iC', aC); geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false,
    uniforms: { ...FXU, uSunV: { value: new THREE.Vector3(0, 1, 0) }, uSunC: { value: new THREE.Color(1, 1, 1) }, uSkyC: { value: new THREE.Color(0.5, 0.55, 0.6) }, uGndC: { value: new THREE.Color(0.2, 0.2, 0.2) },
      uFog: { value: new THREE.Color() }, uFogD: { value: 0 }, uT: { value: 0 } } });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 0.85; mesh.visible = false; scene.add(mesh);
  const live = [];
  return {
    mesh, mat,
    // клуб: p - центр, s0 → s1 - размер (м) за life с, a - плотность, dust - доля пыли (0 сажа … 1 пыль), col - цвет пыли грунта, v - скорость (м/с), flat - сплюснутость,
    // tIn - сколько секунд проявляется (перехватывает облако листа, пока тот тает)
    add(p, o) { if (live.length >= max) live.shift(); live.push({ x: p.x, y: p.y, z: p.z, s0: o.s0, s1: o.s1, life: o.life, a: o.a, dust: o.dust || 0, c: o.col || [0.3, 0.27, 0.23], vx: o.v ? o.v[0] : 0, vy: o.v ? o.v[1] : 0, vz: o.v ? o.v[2] : 0, flat: o.flat || 1, tIn: o.tIn || 1, t: -(o.delay || 0), seed: Math.random() }); },
    clear() { live.length = 0; geo.instanceCount = 0; mesh.visible = false; },
    lights(sunV, sunC, skyC, gndC) { const U = mat.uniforms; U.uSunV.value.copy(sunV); U.uSunC.value.copy(sunC); U.uSkyC.value.copy(skyC); U.uGndC.value.copy(gndC); },
    update(dt, fog) {
      let c = 0;
      for (let i = live.length - 1; i >= 0; i--) {
        const q = live[i]; q.t += dt; if (q.t < 0) continue; if (q.t >= q.life) { live.splice(i, 1); continue; }
        const u = q.t / q.life, k = Math.min(1, q.t / q.tIn), a = q.a * k * k * (3 - 2 * k) * Math.pow(1 - u, 1.3), dr = Math.exp(-q.t * 0.08); // скорость гаснет (сопротивление воздуха)
        q.x += q.vx * dr * dt; q.y += q.vy * dr * dt; q.z += q.vz * dr * dt;
        aP.setXYZW(c, q.x, q.y, q.z, q.s0 + (q.s1 - q.s0) * Math.sqrt(u)); aA.setXYZW(c, a, q.seed, q.dust, q.t); aC.setXYZW(c, q.c[0], q.c[1], q.c[2], q.flat); c++;
      }
      geo.instanceCount = c; mesh.visible = c > 0;
      if (c) { aP.needsUpdate = aA.needsUpdate = aC.needsUpdate = true; }
      if (fog) { mat.uniforms.uFog.value.copy(fog.color); mat.uniforms.uFogD.value = fog.density || 0; }
    },
  };
}
