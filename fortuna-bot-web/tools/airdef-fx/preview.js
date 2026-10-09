// Превью раскадровок взрывов и огня в сцене «Воздушного превосходства» (не часть игры — для сравнения перед внедрением).
// В консоли страницы игры (?test=1): const FB = (await import('/fortuna-bot-web/tools/airdef-fx/preview.js')).install(window.__a);
// FB.play('sheet', pos, { size: 60 }) — эффект в точке; FB.update(dt) — вызывает сам кадр игры (через C.fx.update).
const THREE = window.THREE;
const BASE = new URL('./sheets/', import.meta.url).href;
// cols, frames, fps, cell [w, h] (пропорции), anchor [x, y] (0..1 от левого верхнего угла кадра), add — сложением (чёрный фон),
// up — «стоячий» (поворот только вокруг вертикали: огонь, наземный взрыв), loop
export const SHEETS = {
  sheet: { file: 'sheet.png', cols: 8, rows: 7, frames: 58, fps: 22, cell: [1, 1], anchor: [0.5, 0.5] },
  clip1: { file: 'clip1.png', cols: 8, rows: 6, frames: 48, fps: 48 / 5.5, cell: [1, 1], anchor: [0.5, 0.95], add: true, up: true },
  clip2: { file: 'clip2.png', cols: 8, rows: 6, frames: 48, fps: 48 / 7, cell: [1, 1], anchor: [0.5, 0.12] },
  clip3: { file: 'clip3.png', cols: 8, rows: 6, frames: 48, fps: 48 / 6.1, cell: [1, 1], anchor: [0.5, 0.5] },
  fire_explosion: { file: 'fire_explosion.png', cols: 8, rows: 4, frames: 32, fps: 24, cell: [1, 1], anchor: [0.5, 0.55] },
  fire_blast: { file: 'fire_blast.png', cols: 8, rows: 2, frames: 16, fps: 24, cell: [1, 1], anchor: [0.5, 0.5] },
  fire_fire: { file: 'fire_fire.png', cols: 8, rows: 3, frames: 24, fps: 24, cell: [0.5, 1], anchor: [0.5, 0.92], loop: true, up: true },
  fire_smoke: { file: 'fire_smoke.png', cols: 8, rows: 4, frames: 32, fps: 20, cell: [0.5, 1], anchor: [0.5, 0.92], loop: true, up: true },
  white_puff: { file: 'white_puff.png', cols: 8, rows: 2, frames: 16, fps: 20, cell: [1, 1], anchor: [0.5, 0.5] },
};
const VS = `varying vec2 vUv; varying float vD;
void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }`;
const FS = `uniform sampler2D map; uniform vec2 uGrid; uniform float uF0, uF1, uMix, uAdd, uGain, uAlpha, uFogD; uniform vec3 uLight, uFog;
varying vec2 vUv; varying float vD;
vec2 cell(float f) { float c = mod(f, uGrid.x), r = floor(f / uGrid.x); return (vec2(c, uGrid.y - 1.0 - r) + vUv) / uGrid; }
void main() {
  vec4 t = mix(texture2D(map, cell(uF0)), texture2D(map, cell(uF1)), uMix);
  vec3 c = pow(max(t.rgb, 0.0), vec3(2.2));
  float hot = smoothstep(0.25, 0.75, t.r - t.b * 0.7);       // огонь светится сам, дым освещён сценой
  float fog = 1.0 - exp(-vD * vD * uFogD * uFogD);
  if (uAdd > 0.5) { gl_FragColor = vec4(c * uGain * uAlpha * (1.0 - fog), 1.0); return; }
  vec3 col = c * mix(uLight, vec3(uGain), hot);
  gl_FragColor = vec4(mix(col, uFog, fog * (1.0 - hot * 0.5)), t.a * uAlpha);
}`;
export function install(C) {
  const tex = {}, live = [], geo = new THREE.PlaneGeometry(1, 1), L = new THREE.Vector3(), Q = new THREE.Quaternion(), E = new THREE.Euler(0, 0, 0, 'YXZ');
  const load = (k) => tex[k] || (tex[k] = new THREE.TextureLoader().load(BASE + SHEETS[k].file + '?v=' + Date.now()));
  for (const k in SHEETS) load(k);
  const FB = {
    // k — раскадровка; pos — точка привязки (anchor кадра); size — высота кадра в метрах; o.gain — яркость огня, o.life — для петель
    play(k, pos, o = {}) {
      const S = SHEETS[k], add = o.add ?? S.add;
      const mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false,
        blending: add ? THREE.AdditiveBlending : THREE.NormalBlending,
        uniforms: { map: { value: load(k) }, uGrid: { value: new THREE.Vector2(S.cols, S.rows) }, uF0: { value: 0 }, uF1: { value: 0 }, uMix: { value: 0 },
          uAdd: { value: add ? 1 : 0 }, uGain: { value: o.gain || 2.2 }, uAlpha: { value: 1 }, uFogD: { value: 0 }, uLight: { value: new THREE.Vector3(1, 1, 1) }, uFog: { value: new THREE.Color() } } });
      const m = new THREE.Mesh(geo, mat), h = o.size || 40, w = h * S.cell[0] / S.cell[1];
      m.scale.set(w, h, 1); m.frustumCulled = false; m.renderOrder = 5;
      const g = new THREE.Group(); g.add(m); m.position.set((0.5 - S.anchor[0]) * w, (S.anchor[1] - 0.5) * h, 0);
      g.position.copy(pos); C.scene.add(g);
      live.push({ S, k, g, m, mat, t: -(o.delay || 0), life: o.life || 0, up: o.up ?? S.up, fps: o.fps || S.fps });
      return g;
    },
    clear() { for (const e of live) { C.scene.remove(e.g); e.mat.dispose(); } live.length = 0; },
    update(dt) {
      const cam = C.camera, fog = C.scene.fog, H = C.G.hemi, sun = C.G.sun;
      // освещение дыма: небо + солнце (приглушённо), как у облаков
      L.set(H.color.r, H.color.g, H.color.b).multiplyScalar(H.intensity * 0.55).addScaledVector(new THREE.Vector3(sun.color.r, sun.color.g, sun.color.b), sun.intensity * 0.35);
      for (let i = live.length - 1; i >= 0; i--) {
        const e = live[i]; e.t += dt; const u = e.mat.uniforms;
        e.g.visible = e.t >= 0; if (e.t < 0) continue;
        let f = e.t * e.fps; const n = e.S.frames;
        if (e.S.loop) { if (e.life && e.t > e.life) { C.scene.remove(e.g); live.splice(i, 1); continue; } u.uAlpha.value = Math.min(1, e.t * 2, e.life ? (e.life - e.t) / 1.5 : 1); f %= n; }
        else if (f >= n - 1) { C.scene.remove(e.g); live.splice(i, 1); continue; }
        u.uF0.value = Math.floor(f); u.uF1.value = e.S.loop ? (Math.floor(f) + 1) % n : Math.min(n - 1, Math.floor(f) + 1); u.uMix.value = f % 1;
        u.uLight.value.copy(L); u.uFog.value.copy(fog.color); u.uFogD.value = fog.density;
        if (e.up) { E.setFromQuaternion(cam.quaternion); e.g.quaternion.setFromEuler(E.set(0, E.y, 0)); } else e.g.quaternion.copy(cam.quaternion);
      }
    },
    live,
  };
  // кадр игры зовёт C.fx.update — к нему и цепляемся
  const up0 = C.fx.update.bind(C.fx); C.fx.update = (dt) => { up0(dt); FB.update(dt); };
  return FB;
}
