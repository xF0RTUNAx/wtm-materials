// Раскадровки эффектов (взрыв, вспышка, пламя): все экземпляры одной раскадровки - один вызов отрисовки
// (InstancedBufferGeometry: точка, размер, кадр и прозрачность - на экземпляр). Прямоугольник всегда лицом к камере;
// «стоячие» (пламя) поворачиваются только вокруг вертикали, но при крутом взгляде сверху (окно ТВ) - тоже лицом к камере,
// иначе превращаются в полоску. up: 'strict' (столб старта С-300) - всегда стоит вертикально в мире (иначе снизу и сверху лист
// наклонялся к камере и расходился с ракетой), почти отвесно сверху или снизу - тает. Огонь светится сам, дым освещается сценой (небо + солнце) и тонет в дымке, как всё остальное.
/* global THREE */
import { FXU } from '../drone/world.js?v=20261124a';
import { ktxOn, ktxLoadUrl } from './ktx.js?v=20261124a';
const VS = `attribute vec3 iPos; attribute vec2 iSize; attribute vec4 iF;
#ifdef SIX
attribute vec3 iC; varying vec3 vC;
#endif
#ifdef ROT
attribute vec4 iR; attribute float iE; varying vec4 vR; varying float vE;
#endif
uniform vec2 uAnchor; uniform float uUp, uPush;
varying vec2 vUv; varying vec3 vF; varying float vA, vD, vS;
void main() {
  vUv = uv; vF = iF.xyz; vA = iF.w; vS = iSize.y;
#ifdef SIX
  vC = iC;
#endif
#ifdef ROT
  vR = iR; vE = iE;
#endif
  vec3 t = cameraPosition - iPos; t /= max(length(t), 1e-3);
  if (uUp > 1.5) vA *= 1.0 - smoothstep(0.9, 0.98, abs(t.y));
  vec3 cr = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), cu = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float s = uUp > 1.5 ? 1.0 : uUp * (1.0 - smoothstep(0.55, 0.8, abs(t.y)));
  vec3 R = normalize(mix(cr, normalize(vec3(t.z, 0.0, -t.x) + vec3(1e-4, 0.0, 0.0)), s)), U = normalize(mix(cu, vec3(0.0, 1.0, 0.0), s));
  vec2 q = (position.xy + vec2(0.5 - uAnchor.x, uAnchor.y - 0.5)) * iSize;
#ifdef ROT
  // клуб роя: поворот в плоскости экрана и отражение (iR.x - угол, iR.y - ±1) - одна съёмка не повторяется узнаваемо
  if (iR.y < 0.0) vUv.x = 1.0 - vUv.x;
  q = mat2(cos(iR.x), sin(iR.x), -sin(iR.x), cos(iR.x)) * q;
#endif
  float pd = min(uPush * iSize.y, 0.35 * length(cameraPosition - iPos)); // не больше трети расстояния: вблизи не вылезает поверх домов и не уходит за камеру
  vec4 mv = viewMatrix * vec4(iPos + t * pd + R * q.x + U * q.y, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; // uPush - к камере: низ кадра не уходит в землю
}`;
// в проходе дыма и облаков (половинное разрешение, своей глубины сцены нет) - мягкая проверка по глубине кадра: за домом не видно
const FS = `uniform sampler2D map;
#ifdef SIX
uniform sampler2D mapB; uniform vec3 uSunV, uSunC, uSkyC, uGndC; uniform float uDustY, uAsp; varying vec3 vC;
#ifdef ROT
varying vec4 vR; varying float vE;
#endif
float fbH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float fbN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(fbH(i), fbH(i + vec2(1.0, 0.0)), f.x), mix(fbH(i + vec2(0.0, 1.0)), fbH(i + vec2(1.0, 1.0)), f.x), f.y); }
#endif
 uniform vec2 uGrid; uniform float uGain, uFogD, uLit, uSoft; uniform vec3 uLight, uFog;
uniform sampler2D tDepth; uniform float fxOn; uniform vec2 fxSize, camNF;
float fxLinZ(float d) { float z = d * 2.0 - 1.0; return 2.0 * camNF.x * camNF.y / (camNF.y + camNF.x - z * (camNF.y - camNF.x)); }
varying vec2 vUv; varying vec3 vF; varying float vA, vD, vS;
vec2 cell(float f) { float c = mod(f, uGrid.x), r = floor(f / uGrid.x); return (vec2(c, uGrid.y - 1.0 - r) + vUv) / uGrid; }
void main() {
#ifdef SIX
  // свет с шести сторон (Blender, render6.py): a - справа, слева, сверху, прозрачность; b - снизу, сзади, пыль/сажа, накал
  vec4 A = mix(texture2D(map, cell(vF.x)), texture2D(map, cell(vF.y)), vF.z), B = mix(texture2D(mapB, cell(vF.x)), texture2D(mapB, cell(vF.y)), vF.z);
  // эрозия края (Mark 2026-11-26: «чёткие границы», «купол»): тонкий дым по краю выедается шумом неровно, плотное ядро остаётся; узор свой у каждого взрыва
  // (vC.x как зерно) и медленно ползёт - край рваный, клочьями, а не гладкая полусфера симуляции
  vec2 nq = vec2(vUv.x * uAsp, vUv.y) * 4.5 + vec2(vC.x * 91.0, vF.x * 0.035); float nz = fbN(nq) * 0.55 + fbN(nq * 2.3 + 3.1) * 0.3 + fbN(nq * 5.7 + 7.7) * 0.15;
  float th = nz * 0.58;
#ifdef ROT
  // клуб тает с краёв (Mark 2026-11-26: «заранее начать плавное исчезание… рассеивание с краёв»): порог плотности растёт с возрастом - тонкий край
  // съедается первым и неровно (шум), плотное ядро держится дольше
  th = mix(th, 0.22 + nz * 0.8, vE);
#endif
  float ea = clamp((A.a - th) / max(1.0 - th, 0.05), 0.0, 1.0);
  vec4 t = vec4(0.0, 0.0, 0.0, 1.0 - pow(1.0 - ea, 1.8)); // плотность ×1,7: юбка пыли и столб в первые секунды непрозрачны (сквозь них было видно, Mark 2026-11-26); край - мягкий уже в листе
  t.a *= smoothstep(0.0, 0.16, min(vUv.x, 1.0 - vUv.x)) * smoothstep(0.0, 0.1, 1.0 - vUv.y); // к краям листа - на нет (облако расползается в фазе рассеивания - прямые края листа были видны) // овальная маска (у стенок области симуляции дым копится ровной стеной): облако, вышедшее за кадр съёмки, не режется прямыми краями листа
  if (t.a * vA < 0.004) discard;
  vec3 La = A.rgb * A.rgb, Lb = B.rgb * B.rgb; float lf = 0.25 * (La.r + La.g + La.b + Lb.r);
  vec3 s = normalize((viewMatrix * vec4(uSunV, 0.0)).xyz);
#ifdef ROT
  // свет в осях повёрнутого (и отражённого) клуба: съёмка знает только свои «справа» и «сверху»
  s.xy = mat2(cos(vR.x), -sin(vR.x), sin(vR.x), cos(vR.x)) * s.xy; s.x *= vR.y;
#endif
  // на солнце, в осях камеры: x - вправо, y - вверх, z - к зрителю (лист смотрит на камеру)
  float dirL = La.r * max(s.x, 0.0) + La.g * max(-s.x, 0.0) + La.b * max(s.y, 0.0) + Lb.r * max(-s.y, 0.0) + lf * max(s.z, 0.0) + Lb.g * max(-s.z, 0.0) * 0.6; // просвет против солнца - слабее (светлый контур)
  vec3 amb = uSkyC * (0.35 * La.b + 0.65 * lf) + uGndC * (0.4 * Lb.r + 0.6 * lf) + (uSkyC + uGndC) * 0.04; // рассеянный - ровнее: многократное рассеяние в дыме
  // пыль - только самые светлые места симуляции (юбка и столб), остальное - сажа и дым
  // тонкий край - не светлый ободок (доля пыли меньше там, где дым редкий)
  // пыль - светлые места симуляции (юбка и столб), остальное - сажа; переход широкий (узкий порог на кадре 384-448 px давал «лесенку»)
  float dust = max(smoothstep(0.3, 1.0, B.b), 1.0 - smoothstep(uDustY, uDustY + 0.26, vUv.y)) * mix(0.55, 1.0, smoothstep(0.15, 0.6, A.a)); 
#ifdef ROT
  dust = vR.z; // клуб: доля пыли задаёт рой (цвет в съёмке воздушного шара - одна сажа, её разброс - шум)
#endif
  vec3 alb = mix(vec3(0.075, 0.072, 0.068), vC, dust);
  float heat = B.a, hot = smoothstep(0.02, 0.5, heat);
  // накал: ядро жёлто-белое, край оранжевый; яркость - с фактурой клубов (карты света), иначе огненный шар - ровный белый купол (Mark 2026-11-26)
  float tex = smoothstep(0.02, 0.45, La.b + 0.5 * Lb.g); // клубы: выпуклые, освещённые сверху - ярче, складки - темнее
#ifdef ROT
  heat *= vR.w; hot *= vR.w;
#endif
  vec3 fire = mix(vec3(1.0, 0.36, 0.07), vec3(1.0, 0.78, 0.48), smoothstep(0.55, 1.0, heat)) * heat * heat * smoothstep(0.08, 0.35, heat) * uGain * 2.6 * mix(0.55, 1.35, tex); // накал: тёмно-оранжевый край, бело-жёлтое ядро
  vec3 sunC = mix(vec3(dot(uSunC, vec3(0.2126, 0.7152, 0.0722))), uSunC, 0.7); // свет низкого солнца на дыме - чуть спокойнее (рыжий облак выделялся)
  vec3 col = alb * (sunC * dirL * 2.2 + amb * 2.1) + fire;
#ifdef ROT
  // огненный клуб без огня (в столбе): горячее ядро съёмки - редкий дым, освещён как пятно; гасим его до тёмного дыма в тени
  col = mix(col, alb * amb * 2.0 + fire, smoothstep(0.05, 0.4, B.a) * mix(1.0, 0.6, vR.w));
  // горячая зона съёмки - редкий дым: и огонь, и погашенный огонь держат непрозрачность (иначе в ядре дыры - видно небо и снег)
  t.a = max(t.a, 0.9 * smoothstep(0.05, 0.4, B.a) * (1.0 - vE));
#endif
#else
  vec4 t = mix(texture2D(map, cell(vF.x)), texture2D(map, cell(vF.y)), vF.z);
  if (t.a * vA < 0.004) discard;
  vec3 c = pow(t.rgb, vec3(2.2));
  float hot = smoothstep(0.25, 0.75, t.r - t.b * 0.7);
  vec3 col = c * mix(uLight * uLit, vec3(uGain), hot);
#endif
  float fog = 1.0 - exp(-vD * vD * uFogD * uFogD);
  float soft = 1.0; if (fxOn > 0.5) soft = clamp((fxLinZ(texture2D(tDepth, gl_FragCoord.xy / fxSize).r) - vD) / max(4.0, uSoft * vS), 0.0, 1.0); // мягкий переход у земли и домов: у крупных - пропорционально размеру
#ifdef DEPTH_PRE
  if (t.a * vA * soft < 0.93) discard; gl_FragColor = vec4(0.0); return; // только глубина плотной части
#endif
  gl_FragColor = vec4(mix(col, uFog, fog * (1.0 - hot * 0.6)), t.a * vA * soft);
}`;
// cfg: url, cols, rows, frames, cell [w, h] (пропорции кадра), anchor [x, y] от левого верхнего угла, up - стоячий, loop, gain;
// ktx - сжатый лист (KTX2, строки снизу вверх - как PNG после переворота при загрузке): в видеопамяти вчетверо меньше; нет поддержки
// или не загрузился - url (PNG / WebP); times - время каждого кадра, с (неравномерно: вспышка - покадрово, дальше реже), иначе - fps;
// lit - множитель света сцены для дыма (у снятых с освещением в Blender свет уже в картинке - второй раз не затемнять);
// push - сдвиг к камере (доля высоты кадра): у стоящих на земле низ кадра (пыль перед воронкой) не прячется в землю ровной линией;
// soft - мягкий переход у земли и домов (доля высоты кадра; меньше 4 м не бывает); onTex(t) - текстура пришла; fade - сколько последних кадров растворяется, fadeT - то же
// в секундах съёмки, по S-кривой (облако не обрывается: его подхватывают частицы остаточного дыма)
export function createBook(scene, cfg, max = 64) {
  const web = typeof document !== 'undefined' && document.createElementNS;
  const SIX = !!cfg.six, st = { ready: !web || !(cfg.ktx || cfg.wait || SIX) }; // ready - текстура пришла (пока нет - вызывающий берёт прежний эффект); без браузера - сразу
  const done = () => { st.ready = true; if (cfg.onTex) cfg.onTex(mat.uniforms.map.value); }; // onTex - сразу на видеокарту (не при первом показе)
  const tex = web && !SIX ? (cfg.ktx && ktxOn() ? new THREE.Texture() : new THREE.TextureLoader().load(cfg.url, done)) : new THREE.Texture(); // без браузера (проверки) - пустая
  const geo = new THREE.InstancedBufferGeometry(), pl = new THREE.PlaneGeometry(1, 1);
  geo.setAttribute('position', pl.attributes.position); geo.setAttribute('uv', pl.attributes.uv); geo.setIndex(pl.index);
  const aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3), aSize = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2), aF = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
  for (const a of [aPos, aSize, aF]) a.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iPos', aPos); geo.setAttribute('iSize', aSize); geo.setAttribute('iF', aF); geo.instanceCount = 0;
  const aC = SIX ? new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3) : null; if (aC) { aC.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('iC', aC); }
  // rot - клубы роя (только SIX): у каждого поворот, отражение, доля пыли, сила огня, скорость и рост (add: o.rot, o.flip, o.dust, o.fire, o.v, o.drag, o.grow, o.fin)
  const ROT = SIX && !!cfg.rot, aR = ROT ? new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4) : null, aE = ROT ? new THREE.InstancedBufferAttribute(new Float32Array(max), 1) : null;
  if (aR) { aR.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('iR', aR); aE.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('iE', aE); }
  const DEF = SIX ? (ROT ? { SIX: 1, ROT: 1 } : { SIX: 1 }) : {};
  const mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, defines: DEF,
    uniforms: { map: { value: tex }, uGrid: { value: new THREE.Vector2(cfg.cols, cfg.rows) }, uAnchor: { value: new THREE.Vector2(...cfg.anchor) }, uUp: { value: cfg.up === 'strict' ? 2 : cfg.up ? 1 : 0 },
      ...FXU, uGain: { value: cfg.gain || 2.2 }, uLit: { value: cfg.lit || 1 }, uPush: { value: cfg.push || 0 }, uSoft: { value: cfg.soft || 0 }, uFogD: { value: 0 }, uLight: { value: new THREE.Vector3(1, 1, 1) }, uFog: { value: new THREE.Color() },
      ...(SIX ? { mapB: { value: new THREE.Texture() }, uSunV: { value: new THREE.Vector3(0, 1, 0) }, uSunC: { value: new THREE.Color(1, 1, 1) }, uSkyC: { value: new THREE.Color(0.5, 0.55, 0.6) }, uGndC: { value: new THREE.Color(0.2, 0.2, 0.2) }, uDustY: { value: cfg.dustY != null ? cfg.dustY : 1 - cfg.anchor[1] + 0.02 }, uAsp: { value: cfg.cell[0] / cfg.cell[1] } } : {}) } }); // uDustY - линия земли на листе (снизу)
  if (web && SIX) Promise.all([ktxLoadUrl(cfg.six[0]), ktxLoadUrl(cfg.six[1])]).then(([ta, tb]) => { mat.uniforms.map.value = ta; mat.uniforms.mapB.value = tb; done(); if (cfg.onTex) cfg.onTex(tb); }).catch((e) => console.warn('взрыв: листы света', e.message));
  if (web && cfg.ktx && ktxOn()) ktxLoadUrl(cfg.ktx).then((t) => { mat.uniforms.map.value = t; done(); }).catch(() => { mat.uniforms.map.value = new THREE.TextureLoader().load(cfg.url, done); });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 0.8; scene.add(mesh); // после облаков (0,5), до дыма (1)
  // глубина плотной части (непрозрачный проход - раньше всего прозрачного): дым позади огня не закрывает его, дым спереди - закрывает
  const pre = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: mat.uniforms, defines: { DEPTH_PRE: 1, ...DEF }, colorWrite: false, depthWrite: true }));
  pre.frustumCulled = false; scene.add(pre); mesh.userData.pre = pre;
  if (SIX) pre.layers.disableAll(); // листы со светом - без прохода глубины: порог плотности резал всё позади облака жёсткой «лесенкой» (Mark 2026-11-26)
  const live = [], asp = cfg.cell[0] / cfg.cell[1], n = cfg.last ? Math.min(cfg.frames, cfg.last + 1) : cfg.frames, TM = cfg.times; // last - последний кадр, где облако ещё целиком в кадре съёмки (дальше - hold)
  // время съёмки → дробный номер кадра (между кадрами - смешение, как при постоянном fps)
  const LOOPT = TM ? TM[n - 1] + (TM[1] - TM[0]) : 0; // петля по времени съёмки: последний кадр → первый через один шаг
  // петля: после последнего кадра - плавно к первому (дальше f %= n)
  const frameAt = (t) => { if (t >= TM[n - 1]) return cfg.loop ? n - 1 + (t - TM[n - 1]) / (LOOPT - TM[n - 1]) : n - 1; let k = 0; while (k < n - 2 && TM[k + 1] <= t) k++; return k + (t - TM[k]) / (TM[k + 1] - TM[k]); };
  return {
    mesh, pre, mat, live, get ready() { return st.ready; },
    // h - высота кадра в метрах; fps - скорость; t0 < 0 - задержка; a - прозрачность (меняет хозяин, напр. у затухающего пожара)
    // с times: fps - скорость против съёмки (1 - как снято; крупнее - медленнее)
    add(p, h, fps, o = {}) {
      if (live.length >= max) live.shift(); // переполнение - старейший уходит
      const it = { x: p.x, y: p.y, z: p.z, h, w: h * asp * (o.wk || 1), fps, t: o.t0 || 0, a: 1, c: o.col || [0.3, 0.27, 0.23] };
      if (ROT) Object.assign(it, { e0: o.e0, sk: o.skip || 0, r: o.rot || 0, fl: o.flip ? -1 : 1, du: o.dust || 0, fi: o.fire == null ? 1 : o.fire, vx: o.v ? o.v[0] : 0, vy: o.v ? o.v[1] : 0, vz: o.v ? o.v[2] : 0, dr: o.drag || 0, gr: o.grow || 0, fin: o.fin || 0, t0: Math.max(0, o.t0 || 0), age: 0, hd: o.hold });
      live.push(it); return it;
    },
    remove(it) { const i = live.indexOf(it); if (i >= 0) live.splice(i, 1); },
    clear() { live.length = 0; geo.instanceCount = 0; },
    // SIX: свет сцены по частям (units-render): sunV - направление на солнце в мире, sunC / skyC / gndC - цвет × сила
    lights(sunV, sunC, skyC, gndC) { if (!SIX) return; const U = mat.uniforms; U.uSunV.value.copy(sunV); U.uSunC.value.copy(sunC); U.uSkyC.value.copy(skyC); U.uGndC.value.copy(gndC); },
    update(dt, light, fog) {
      let c = 0;
      for (let i = live.length - 1; i >= 0; i--) {
        const it = live[i]; it.t += dt; if (it.t < 0) continue;
        if (it.sk) { it.t += it.sk / it.fps; it.sk = 0; } // skip - клуб показывается с середины съёмки (начало - маленький колючий шарик), проявляется по fin
        if (ROT) { // клуб летит: скорость гаснет (сопротивление воздуха, drag 1/с), рост - сверх съёмки
          it.age += dt; const e = Math.exp(-it.dr * dt); it.vx *= e; it.vy *= e; it.vz *= e; it.x += it.vx * dt; it.y += it.vy * dt; it.z += it.vz * dt; }
        let f = TM ? frameAt(cfg.loop ? (it.t * it.fps) % LOOPT : it.t * it.fps) : it.t * it.fps;
        // hold - облако после последнего кадра не пропадает: ещё hold с расползается (×1,7), поднимается и тает (листы со светом; раньше его подхватывали
        // частицы - тёмные размытые шары, а сам лист растворялся за пару секунд, Mark 2026-11-26)
        const HD = it.hd || cfg.hold;
        let hk = 0; if (!cfg.loop && HD && f >= n - 1) { hk = (it.t * it.fps - TM[n - 1]) / HD; if (hk >= 1) { live.splice(i, 1); continue; } f = n - 1; }
        else if (!cfg.loop && f >= n - 1) { live.splice(i, 1); continue; }
        if (cfg.loop) f %= n;
        const f0 = Math.floor(f), f1 = cfg.loop ? (f0 + 1) % n : Math.min(n - 1, f0 + 1);
        // fadeT - последние fadeT с съёмки растворяются по S-кривой (облако передаётся частицам - те появляются волнами за то же время); fade - в кадрах
        // hold: разбавляется быстро в первые секунды, дальше - редкая дымка
        let fa = 1; if (HD) fa = Math.pow(1 - hk, 1.4) * (1 - 0.35 * Math.min(1, hk * 3)); else if (cfg.fadeT && TM) { const x = Math.min(1, Math.max(0, (TM[n - 1] - it.t * it.fps) / cfg.fadeT)); fa = x * x * (3 - 2 * x); } else if (cfg.fade) fa = Math.min(1, (n - 1 - f) / cfg.fade);
        let a = it.a * (cfg.loop ? Math.min(1, it.t * 2) : fa);
        let gk = 1 + 0.45 * hk;
        if (ROT) { // клуб: проявление, рост по своей скорости, таяние с краёв - с 55 % съёмки до конца hold (раздувание после съёмки - малое)
          if (it.fin) { const x = Math.min(1, it.age / it.fin); a *= x * x * (3 - 2 * x); }
          const tEnd = TM[n - 1] / it.fps, tt = it.t, e0 = tEnd * (it.e0 == null ? 0.55 : it.e0), e1 = tEnd + (HD || 0), x = Math.min(1, Math.max(0, (tt - e0) / Math.max(0.1, e1 - e0))), e = x * x * (3 - 2 * x);
          gk = (1 + 0.1 * hk) * (1 + it.gr * it.age); a = it.a * (1 - e * e * 0.6) * (it.fin ? Math.min(1, it.age / it.fin) : 1);
          aR.setXYZW(c, it.r, it.fl, it.du, it.fi); aE.setX(c, e); } aPos.setXYZ(c, it.x, it.y + hk * it.h * 0.04, it.z); aSize.setXY(c, it.w * gk, it.h * gk); aF.setXYZW(c, f0, f1, f - f0, a); if (aC) aC.setXYZ(c, it.c[0], it.c[1], it.c[2]); c++;
      }
      geo.instanceCount = c; mesh.visible = pre.visible = c > 0;
      if (c) { aPos.needsUpdate = aSize.needsUpdate = aF.needsUpdate = true; if (aC) aC.needsUpdate = true; if (aR) { aR.needsUpdate = true; aE.needsUpdate = true; } }
      mat.uniforms.uLight.value.copy(light);
      if (fog) { mat.uniforms.uFog.value.copy(fog.color); mat.uniforms.uFogD.value = fog.density || 0; }
    },
  };
}
