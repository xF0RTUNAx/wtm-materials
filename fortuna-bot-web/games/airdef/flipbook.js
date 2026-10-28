// Раскадровки эффектов (взрыв, вспышка, пламя): все экземпляры одной раскадровки — один вызов отрисовки
// (InstancedBufferGeometry: точка, размер, кадр и прозрачность — на экземпляр). Прямоугольник всегда лицом к камере;
// «стоячие» (пламя) поворачиваются только вокруг вертикали, но при крутом взгляде сверху (окно ТВ) — тоже лицом к камере,
// иначе превращаются в полоску. Огонь светится сам, дым освещается сценой (небо + солнце) и тонет в дымке, как всё остальное.
/* global THREE */
import { FXU } from '../drone/world.js?v=20261028a';
import { ktxOn, ktxLoadUrl } from './ktx.js?v=20261028a';
const VS = `attribute vec3 iPos; attribute vec2 iSize; attribute vec4 iF;
uniform vec2 uAnchor; uniform float uUp, uPush;
varying vec2 vUv; varying vec3 vF; varying float vA, vD, vS;
void main() {
  vUv = uv; vF = iF.xyz; vA = iF.w; vS = iSize.y;
  vec3 t = cameraPosition - iPos; t /= max(length(t), 1e-3);
  vec3 cr = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), cu = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float s = uUp * (1.0 - smoothstep(0.55, 0.8, abs(t.y)));
  vec3 R = normalize(mix(cr, normalize(vec3(t.z, 0.0, -t.x) + vec3(1e-4, 0.0, 0.0)), s)), U = normalize(mix(cu, vec3(0.0, 1.0, 0.0), s));
  vec2 q = (position.xy + vec2(0.5 - uAnchor.x, uAnchor.y - 0.5)) * iSize;
  float pd = min(uPush * iSize.y, 0.35 * length(cameraPosition - iPos)); // не больше трети расстояния: вблизи не вылезает поверх домов и не уходит за камеру
  vec4 mv = viewMatrix * vec4(iPos + t * pd + R * q.x + U * q.y, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; // uPush — к камере: низ кадра не уходит в землю
}`;
// в проходе дыма и облаков (половинное разрешение, своей глубины сцены нет) — мягкая проверка по глубине кадра: за домом не видно
const FS = `uniform sampler2D map; uniform vec2 uGrid; uniform float uGain, uFogD, uLit, uSoft; uniform vec3 uLight, uFog;
uniform sampler2D tDepth; uniform float fxOn; uniform vec2 fxSize, camNF;
float fxLinZ(float d) { float z = d * 2.0 - 1.0; return 2.0 * camNF.x * camNF.y / (camNF.y + camNF.x - z * (camNF.y - camNF.x)); }
varying vec2 vUv; varying vec3 vF; varying float vA, vD, vS;
vec2 cell(float f) { float c = mod(f, uGrid.x), r = floor(f / uGrid.x); return (vec2(c, uGrid.y - 1.0 - r) + vUv) / uGrid; }
void main() {
  vec4 t = mix(texture2D(map, cell(vF.x)), texture2D(map, cell(vF.y)), vF.z);
  if (t.a * vA < 0.004) discard;
  vec3 c = pow(t.rgb, vec3(2.2));
  float hot = smoothstep(0.25, 0.75, t.r - t.b * 0.7);
  vec3 col = c * mix(uLight * uLit, vec3(uGain), hot);
  float fog = 1.0 - exp(-vD * vD * uFogD * uFogD);
  float soft = 1.0; if (fxOn > 0.5) soft = clamp((fxLinZ(texture2D(tDepth, gl_FragCoord.xy / fxSize).r) - vD) / max(4.0, uSoft * vS), 0.0, 1.0); // мягкий переход у земли и домов: у крупных — пропорционально размеру
#ifdef DEPTH_PRE
  if (t.a * vA * soft < 0.93) discard; gl_FragColor = vec4(0.0); return; // только глубина плотной части
#endif
  gl_FragColor = vec4(mix(col, uFog, fog * (1.0 - hot * 0.6)), t.a * vA * soft);
}`;
// cfg: url, cols, rows, frames, cell [w, h] (пропорции кадра), anchor [x, y] от левого верхнего угла, up — стоячий, loop, gain;
// ktx — сжатый лист (KTX2, строки снизу вверх — как PNG после переворота при загрузке): в видеопамяти вчетверо меньше; нет поддержки
// или не загрузился — url (PNG / WebP); times — время каждого кадра, с (неравномерно: вспышка — покадрово, дальше реже), иначе — fps;
// lit — множитель света сцены для дыма (у снятых с освещением в Blender свет уже в картинке — второй раз не затемнять);
// push — сдвиг к камере (доля высоты кадра): у стоящих на земле низ кадра (пыль перед воронкой) не прячется в землю ровной линией;
// soft — мягкий переход у земли и домов (доля высоты кадра; меньше 4 м не бывает); onTex(t) — текстура пришла; fade — сколько последних кадров растворяется, fadeT — то же
// в секундах съёмки, по S-кривой (облако не обрывается: его подхватывают частицы остаточного дыма)
export function createBook(scene, cfg, max = 64) {
  const web = typeof document !== 'undefined' && document.createElementNS;
  const st = { ready: !web || !(cfg.ktx || cfg.wait) }; // ready — текстура пришла (пока нет — вызывающий берёт прежний эффект); без браузера — сразу
  const done = () => { st.ready = true; if (cfg.onTex) cfg.onTex(mat.uniforms.map.value); }; // onTex — сразу на видеокарту (не при первом показе)
  const tex = web ? (cfg.ktx && ktxOn() ? new THREE.Texture() : new THREE.TextureLoader().load(cfg.url, done)) : new THREE.Texture(); // без браузера (проверки) — пустая
  const geo = new THREE.InstancedBufferGeometry(), pl = new THREE.PlaneGeometry(1, 1);
  geo.setAttribute('position', pl.attributes.position); geo.setAttribute('uv', pl.attributes.uv); geo.setIndex(pl.index);
  const aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3), aSize = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2), aF = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
  for (const a of [aPos, aSize, aF]) a.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iPos', aPos); geo.setAttribute('iSize', aSize); geo.setAttribute('iF', aF); geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false,
    uniforms: { map: { value: tex }, uGrid: { value: new THREE.Vector2(cfg.cols, cfg.rows) }, uAnchor: { value: new THREE.Vector2(...cfg.anchor) }, uUp: { value: cfg.up ? 1 : 0 },
      ...FXU, uGain: { value: cfg.gain || 2.2 }, uLit: { value: cfg.lit || 1 }, uPush: { value: cfg.push || 0 }, uSoft: { value: cfg.soft || 0 }, uFogD: { value: 0 }, uLight: { value: new THREE.Vector3(1, 1, 1) }, uFog: { value: new THREE.Color() } } });
  if (web && cfg.ktx && ktxOn()) ktxLoadUrl(cfg.ktx).then((t) => { mat.uniforms.map.value = t; done(); }).catch(() => { mat.uniforms.map.value = new THREE.TextureLoader().load(cfg.url, done); });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 0.8; scene.add(mesh); // после облаков (0,5), до дыма (1)
  // глубина плотной части (непрозрачный проход — раньше всего прозрачного): дым позади огня не закрывает его, дым спереди — закрывает
  const pre = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: mat.uniforms, defines: { DEPTH_PRE: 1 }, colorWrite: false, depthWrite: true }));
  pre.frustumCulled = false; scene.add(pre); mesh.userData.pre = pre;
  const live = [], asp = cfg.cell[0] / cfg.cell[1], n = cfg.frames, TM = cfg.times;
  // время съёмки → дробный номер кадра (между кадрами — смешение, как при постоянном fps)
  const LOOPT = TM ? TM[n - 1] + (TM[1] - TM[0]) : 0; // петля по времени съёмки: последний кадр → первый через один шаг
  // петля: после последнего кадра — плавно к первому (дальше f %= n)
  const frameAt = (t) => { if (t >= TM[n - 1]) return cfg.loop ? n - 1 + (t - TM[n - 1]) / (LOOPT - TM[n - 1]) : n - 1; let k = 0; while (k < n - 2 && TM[k + 1] <= t) k++; return k + (t - TM[k]) / (TM[k + 1] - TM[k]); };
  return {
    mesh, pre, mat, live, get ready() { return st.ready; },
    // h — высота кадра в метрах; fps — скорость; t0 < 0 — задержка; a — прозрачность (меняет хозяин, напр. у затухающего пожара)
    // с times: fps — скорость против съёмки (1 — как снято; крупнее — медленнее)
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
        let f = TM ? frameAt(cfg.loop ? (it.t * it.fps) % LOOPT : it.t * it.fps) : it.t * it.fps;
        if (!cfg.loop && f >= n - 1) { live.splice(i, 1); continue; }
        if (cfg.loop) f %= n;
        const f0 = Math.floor(f), f1 = cfg.loop ? (f0 + 1) % n : Math.min(n - 1, f0 + 1);
        // fadeT — последние fadeT с съёмки растворяются по S-кривой (облако передаётся частицам — те появляются волнами за то же время); fade — в кадрах
        let fa = 1; if (cfg.fadeT && TM) { const x = Math.min(1, Math.max(0, (TM[n - 1] - it.t * it.fps) / cfg.fadeT)); fa = x * x * (3 - 2 * x); } else if (cfg.fade) fa = Math.min(1, (n - 1 - f) / cfg.fade);
        const a = it.a * (cfg.loop ? Math.min(1, it.t * 2) : fa);
        aPos.setXYZ(c, it.x, it.y, it.z); aSize.setXY(c, it.w, it.h); aF.setXYZW(c, f0, f1, f - f0, a); c++;
      }
      geo.instanceCount = c; mesh.visible = pre.visible = c > 0;
      if (c) { aPos.needsUpdate = aSize.needsUpdate = aF.needsUpdate = true; }
      mat.uniforms.uLight.value.copy(light);
      if (fog) { mat.uniforms.uFog.value.copy(fog.color); mat.uniforms.uFogD.value = fog.density || 0; }
    },
  };
}
