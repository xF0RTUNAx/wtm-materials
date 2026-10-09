// Раскадровки эффектов (взрыв, вспышка, пламя): все экземпляры одной раскадровки — один вызов отрисовки
// (InstancedBufferGeometry: точка, размер, кадр и прозрачность — на экземпляр). Прямоугольник всегда лицом к камере;
// «стоячие» (пламя) поворачиваются только вокруг вертикали, но при крутом взгляде сверху (окно ТВ) — тоже лицом к камере,
// иначе превращаются в полоску. Огонь светится сам, дым освещается сценой (небо + солнце) и тонет в дымке, как всё остальное.
/* global THREE */
const VS = `attribute vec3 iPos; attribute vec2 iSize; attribute vec4 iF;
uniform vec2 uAnchor; uniform float uUp;
varying vec2 vUv; varying vec3 vF; varying float vA, vD;
void main() {
  vUv = uv; vF = iF.xyz; vA = iF.w;
  vec3 t = cameraPosition - iPos; t /= max(length(t), 1e-3);
  vec3 cr = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), cu = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float s = uUp * (1.0 - smoothstep(0.55, 0.8, abs(t.y)));
  vec3 R = normalize(mix(cr, normalize(vec3(t.z, 0.0, -t.x) + vec3(1e-4, 0.0, 0.0)), s)), U = normalize(mix(cu, vec3(0.0, 1.0, 0.0), s));
  vec2 q = (position.xy + vec2(0.5 - uAnchor.x, uAnchor.y - 0.5)) * iSize;
  vec4 mv = viewMatrix * vec4(iPos + R * q.x + U * q.y, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv;
}`;
const FS = `uniform sampler2D map; uniform vec2 uGrid; uniform float uGain, uFogD; uniform vec3 uLight, uFog;
varying vec2 vUv; varying vec3 vF; varying float vA, vD;
vec2 cell(float f) { float c = mod(f, uGrid.x), r = floor(f / uGrid.x); return (vec2(c, uGrid.y - 1.0 - r) + vUv) / uGrid; }
void main() {
  vec4 t = mix(texture2D(map, cell(vF.x)), texture2D(map, cell(vF.y)), vF.z);
  if (t.a * vA < 0.004) discard;
  vec3 c = pow(t.rgb, vec3(2.2));
  float hot = smoothstep(0.25, 0.75, t.r - t.b * 0.7);
  vec3 col = c * mix(uLight, vec3(uGain), hot);
  float fog = 1.0 - exp(-vD * vD * uFogD * uFogD);
  gl_FragColor = vec4(mix(col, uFog, fog * (1.0 - hot * 0.6)), t.a * vA);
}`;
// cfg: url, cols, rows, frames, cell [w, h] (пропорции кадра), anchor [x, y] от левого верхнего угла, up — стоячий, loop, gain
export function createBook(scene, cfg, max = 64) {
  const tex = typeof document !== 'undefined' && document.createElementNS ? new THREE.TextureLoader().load(cfg.url) : new THREE.Texture(); // без браузера (проверки) — пустая
  const geo = new THREE.InstancedBufferGeometry(), pl = new THREE.PlaneGeometry(1, 1);
  geo.setAttribute('position', pl.attributes.position); geo.setAttribute('uv', pl.attributes.uv); geo.setIndex(pl.index);
  const aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3), aSize = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2), aF = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
  for (const a of [aPos, aSize, aF]) a.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iPos', aPos); geo.setAttribute('iSize', aSize); geo.setAttribute('iF', aF); geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false,
    uniforms: { map: { value: tex }, uGrid: { value: new THREE.Vector2(cfg.cols, cfg.rows) }, uAnchor: { value: new THREE.Vector2(...cfg.anchor) }, uUp: { value: cfg.up ? 1 : 0 },
      uGain: { value: cfg.gain || 2.2 }, uFogD: { value: 0 }, uLight: { value: new THREE.Vector3(1, 1, 1) }, uFog: { value: new THREE.Color() } } });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 3; scene.add(mesh);
  const live = [], asp = cfg.cell[0] / cfg.cell[1], n = cfg.frames;
  return {
    mesh, mat, live,
    // h — высота кадра в метрах; fps — скорость; t0 < 0 — задержка; a — прозрачность (меняет хозяин, напр. у затухающего пожара)
    add(p, h, fps, o = {}) {
      if (live.length >= max) live.shift(); // переполнение — старейший уходит
      const it = { x: p.x, y: p.y, z: p.z, h, w: h * asp, fps, t: o.t0 || 0, a: 1 }; live.push(it); return it;
    },
    remove(it) { const i = live.indexOf(it); if (i >= 0) live.splice(i, 1); },
    clear() { live.length = 0; geo.instanceCount = 0; },
    update(dt, light, fog) {
      let c = 0;
      for (let i = live.length - 1; i >= 0; i--) {
        const it = live[i]; it.t += dt; if (it.t < 0) continue;
        let f = it.t * it.fps;
        if (!cfg.loop && f >= n - 1) { live.splice(i, 1); continue; }
        if (cfg.loop) f %= n;
        const f0 = Math.floor(f), f1 = cfg.loop ? (f0 + 1) % n : Math.min(n - 1, f0 + 1), a = it.a * (cfg.loop ? Math.min(1, it.t * 2) : 1);
        aPos.setXYZ(c, it.x, it.y, it.z); aSize.setXY(c, it.w, it.h); aF.setXYZW(c, f0, f1, f - f0, a); c++;
      }
      geo.instanceCount = c; mesh.visible = c > 0;
      if (c) { aPos.needsUpdate = aSize.needsUpdate = aF.needsUpdate = true; }
      mat.uniforms.uLight.value.copy(light);
      if (fog) { mat.uniforms.uFog.value.copy(fog.color); mat.uniforms.uFogD.value = fog.density || 0; }
    },
  };
}
