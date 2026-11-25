// Рельеф земли, запечённый на видеокарте при загрузке карты (AIRDEF_GRAPHICS.md, разбор ландшафта 2026-11-25; Mark: «ландшафт слабенький, свет словно глянец, а не рельеф»).
// Сетка высот зимы и осени - 50 м: между узлами склон гладкий, как пластилин, и свет ложится ровно. Один раз считаем в текстуру то, что студии запекают из эрозии:
//  RG - нормаль (x, z) с промоинами вдоль склона (полосы «гребень - промоина» по направлению стока, 5 масштабов 420 → 26 м, на ровном гаснут);
//  B - сколько неба видно (долины, ложбины - темнее) с затенением самих промоин; A - видно ли солнце (собственная тень гор, мягкий край).
// Кадр не дороже: текстура - на месте прежней карты нормалей. Высоты для игры (посадка, столкновения) не меняются. ?tb=0 - без этого
/* global THREE */
const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
export const AIR_SH = { tex: { value: null }, r: { value: { x: 1, y: 0 } } }; // тень гор для всех материалов (atmo.js)
export const TB_ON = Q.get('tb') !== '0';
const VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const HEAD = `precision highp float; precision highp sampler2D; varying vec2 vUv; uniform sampler2D tH; uniform float uN, uR, uHalf; uniform vec3 uSun;
float ht(ivec2 p) { return texelFetch(tH, clamp(p, ivec2(0), ivec2(int(uN) - 1)), 0).r; }
float hBil(vec2 w) { vec2 g = (w + uHalf) / uR, i = floor(g), f = g - i; ivec2 p = ivec2(i); return mix(mix(ht(p), ht(p + ivec2(1, 0)), f.x), mix(ht(p + ivec2(0, 1)), ht(p + ivec2(1, 1)), f.x), f.y); }
// бикубический B-сплайн: высота и производные (гладко, без граней сетки)
vec3 hCub(vec2 w) { vec2 g = (w + uHalf) / uR, i = floor(g), f = g - i; ivec2 p = ivec2(i);
  vec4 fx = vec4(1.0, f.x, f.x * f.x, f.x * f.x * f.x), fy = vec4(1.0, f.y, f.y * f.y, f.y * f.y * f.y);
  vec4 bx = vec4(1.0 - 3.0 * fx.y + 3.0 * fx.z - fx.w, 4.0 - 6.0 * fx.z + 3.0 * fx.w, 1.0 + 3.0 * fx.y + 3.0 * fx.z - 3.0 * fx.w, fx.w) / 6.0;
  vec4 by = vec4(1.0 - 3.0 * fy.y + 3.0 * fy.z - fy.w, 4.0 - 6.0 * fy.z + 3.0 * fy.w, 1.0 + 3.0 * fy.y + 3.0 * fy.z - 3.0 * fy.w, fy.w) / 6.0;
  vec4 dx = vec4(-0.5 + f.x - 0.5 * fx.z, -2.0 * f.x + 1.5 * fx.z, 0.5 + f.x - 1.5 * fx.z, 0.5 * fx.z);
  vec4 dy = vec4(-0.5 + f.y - 0.5 * fy.z, -2.0 * f.y + 1.5 * fy.z, 0.5 + f.y - 1.5 * fy.z, 0.5 * fy.z);
  vec3 s = vec3(0.0);
  for (int j = 0; j < 4; j++) { vec4 r = vec4(ht(p + ivec2(-1, j - 1)), ht(p + ivec2(0, j - 1)), ht(p + ivec2(1, j - 1)), ht(p + ivec2(2, j - 1)));
    float a = dot(r, bx), d = dot(r, dx); s += vec3(a * by[j], d * by[j], a * dy[j]); }
  return vec3(s.x, s.yz / uR); }
`;
// грубая карта (1024²): R - небо, G - солнце
const FS_A = HEAD + `void main() { vec2 w = (vUv * 2.0 - 1.0) * uHalf; float h = hBil(w) + 3.0, sk = 0.0;
  for (int a = 0; a < 12; a++) { float t = 6.2831853 * float(a) / 12.0; vec2 d = vec2(cos(t), sin(t)); float m = 0.0, r = 60.0; for (int k = 0; k < 8; k++) { m = max(m, (hBil(w + d * r) - h) / r); r *= 1.62; } sk += 1.0 - m / sqrt(1.0 + m * m); }
  float sun = 1.0, t = 45.0, tn = uSun.y / max(1e-3, length(uSun.xz)); vec2 sd = normalize(uSun.xz);
  for (int k = 0; k < 56; k++) { float dh = h + t * tn - hBil(w + sd * t); sun = min(sun, 0.5 + dh / (t * 0.035 + 4.0)); t *= 1.09; if (sun <= 0.0) break; }
  sun = clamp(sun, 0.0, 1.0); gl_FragColor = vec4(sk / 12.0, sun * sun * (3.0 - 2.0 * sun), 0.0, 1.0); }`;
const FS_B = HEAD + `uniform sampler2D tA; uniform float uGul;
vec2 hh(vec2 p) { vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); q += dot(q, q.yzx + 33.33); return fract((q.xx + q.yz) * q.zy); }
// полосы поперёк направления d (d - вдоль изолинии, длина - сила): значение и производные; опорные точки со сдвигом, веса - колокол
vec3 gul(vec2 p, vec2 d) { vec2 ip = floor(p), fp = p - ip; vec3 s = vec3(0.0); float W = 0.0;
  for (int j = -1; j <= 2; j++) for (int i = -1; i <= 2; i++) { vec2 o = vec2(float(i), float(j)), q = fp - o + 0.5 - hh(ip + o); float w = exp(-dot(q, q) * 1.9), m = dot(q, d) * 6.2831853; s += vec3(cos(m), -sin(m) * 6.2831853 * d) * w; W += w; }
  s /= W; float a = 1.0 - abs(s.x); return vec3(1.0 - 2.0 * a * a, 4.0 * a * sign(s.x) * s.yz * 0.5); } // гребни острее, промоины шире
void main() { vec2 w = (vUv * 2.0 - 1.0) * uHalf; vec3 H = hCub(w); vec2 g = H.yz; float s = length(g); vec3 acc = vec3(0.0); float cav = 0.0, wt = 0.0;
  float st = smoothstep(0.06, 0.42, s); vec2 dir0 = s > 1e-4 ? vec2(-g.y, g.x) / s : vec2(0.0); float lam = 420.0, amp = 1.0;
  for (int k = 0; k < 5; k++) { vec2 gg = g + acc.yz * 1.1; float l = length(gg); vec2 d = l > 1e-4 ? vec2(-gg.y, gg.x) / l : dir0;
    vec3 e = gul(w / lam + float(k) * 17.3, d * (0.55 + 0.45 * st)); float A = 0.05 * lam * st * (0.35 + 0.65 * min(s, 1.0)) * amp * uGul;
    acc += vec3(e.x * A, e.yz * A / lam); cav += e.x * amp; wt += amp; lam *= 0.5; amp *= 0.8; }
  vec3 n = normalize(vec3(-(g.x + acc.y), 1.0, -(g.y + acc.z))); vec4 a = texture2D(tA, vUv); float c = cav / wt;
  gl_FragColor = vec4(n.x * 0.5 + 0.5, n.z * 0.5 + 0.5, clamp(a.r * (1.0 + st * 0.22 * (c - 0.35)), 0.0, 1.0), a.g); }`;
// высота тени гор (Mark: дома и дороги в тени горы светились как на солнце): до какой высоты точка над землёй в тени - для всего остального (atmo.js vCld); 16 бит, 1024²
const FS_S = HEAD + `void main() { vec2 w = (vUv * 2.0 - 1.0) * uHalf; float tn = uSun.y / max(1e-3, length(uSun.xz)), hs = -1000.0, t = 60.0; vec2 sd = normalize(uSun.xz);
  for (int k = 0; k < 56; k++) { hs = max(hs, hBil(w + sd * t) - t * tn); t *= 1.09; } gl_FragColor = vec4(hs, 0.0, 0.0, 1.0); }`;
// city: HM, HN, HRES (map-winter.js, map-autumn.js). N - размер текстуры. Возвращает текстуру или null (нет WebGL2)
export function bakeTerrain(renderer, city, sunDir, N, aniso) {
  if (!TB_ON || !renderer || !renderer.capabilities.isWebGL2 || !city.HM) return null;
  const hn = city.HN, tH = new THREE.DataTexture(city.HM instanceof Float32Array ? city.HM : Float32Array.from(city.HM), hn, hn, THREE.RedFormat, THREE.FloatType); tH.magFilter = tH.minFilter = THREE.NearestFilter; tH.generateMipmaps = false; tH.flipY = false; tH.needsUpdate = true;
  const o = { depthBuffer: false, stencilBuffer: false, magFilter: THREE.LinearFilter };
  const A = new THREE.WebGLRenderTarget(1024, 1024, { ...o, minFilter: THREE.LinearFilter, generateMipmaps: false }), B = new THREE.WebGLRenderTarget(N, N, { ...o, minFilter: THREE.LinearMipmapLinearFilter, generateMipmaps: true });
  B.texture.anisotropy = aniso || 1;
  const U = { tH: { value: tH }, uN: { value: hn }, uR: { value: city.HRES }, uHalf: { value: city.HRES * (hn - 1) / 2 }, uSun: { value: sunDir.clone() } };
  const mk = (fs, u) => new THREE.ShaderMaterial({ uniforms: { ...U, ...u }, vertexShader: VS, fragmentShader: fs.replace(/texelFetch/g, 'texelFetch'), depthTest: false, depthWrite: false, toneMapped: false });
  const Sh = new THREE.WebGLRenderTarget(1024, 1024, { ...o, type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, generateMipmaps: false });
  const mS = mk(FS_S, {}), mA = mk(FS_A, {}), mB = mk(FS_B, { tA: { value: A.texture }, uGul: { value: +(Q.get('gul') || 1.7) } });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mA), sc = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); quad.frustumCulled = false; sc.add(quad);
  const run = () => {
    const rt = renderer.getRenderTarget(), tm = renderer.toneMapping, au = renderer.shadowMap.autoUpdate; renderer.toneMapping = THREE.NoToneMapping; renderer.shadowMap.autoUpdate = false;
    quad.material = mA; renderer.setRenderTarget(A); renderer.render(sc, cam); quad.material = mS; renderer.setRenderTarget(Sh); renderer.render(sc, cam);
    quad.material = mB; const T = Math.max(1, N >> 10), sv = renderer.autoClear; renderer.autoClear = false; B.scissorTest = true; // плитками по 1024: слабый видеочип не должен висеть на одном вызове
    for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) { B.scissor.set(i * N / T, j * N / T, N / T, N / T); B.viewport.set(0, 0, N, N); B.texture.generateMipmaps = i === T - 1 && j === T - 1; renderer.setRenderTarget(B); renderer.render(sc, cam); }
    renderer.autoClear = sv; renderer.setRenderTarget(rt); renderer.toneMapping = tm; renderer.shadowMap.autoUpdate = au;
  };
  run(); renderer.domElement.addEventListener('webglcontextrestored', () => { tH.needsUpdate = true; run(); });
  if (Q.get('tsh') !== '0') { const st = Sh.texture; st.clone = () => st; /* ShaderLib копирует uniform'ы при сборке материала - текстура должна остаться той же */ AIR_SH.tex.value = st; AIR_SH.r.value.x = U.uHalf.value; AIR_SH.r.value.y = 1; for (const k in THREE.ShaderLib) { const u = THREE.ShaderLib[k].uniforms; if (u && u.atmoSh) u.atmoSh.value = st; } }
  return B.texture;
}
// в шейдеры земли: разбор текстуры рельефа; gSky, gSunV - сколько неба и солнца видно (множат рассеянный и прямой свет)
export const TB_GLSL = `float gSky = 1.0, gSunV = 1.0;
vec3 wNt(vec4 t) { vec2 q = t.rg * 2.0 - 1.0; gSky = t.b; gSunV = t.a; return vec3(q.x, sqrt(max(0.02, 1.0 - dot(q, q))), q.y); }
`;
// свет земли: блика нет (сухая земля, снег, трава не блестят; Dagor: smoothness 0), рассеяние шероховатой поверхности (Oren - Nayar в записи FON, EON, JCGT 2025):
// по солнцу светлее, против солнца темнее - вместо ровного ламберта. gRough: скала и почва 0,9, снег 0,35. sun - что ещё множит прямой свет, sky - рассеянный. ?fon=0 - прежнее
export const ROUGH_GLSL = `float gRough = 0.85;
float fonK(vec3 N, vec3 L, vec3 V, float al) { float nl = max(dot(N, L), 0.0), nv = max(dot(N, V), 0.0), s = dot(L, V) - nl * nv, t = s > 0.0 ? s / max(max(nl, nv), 0.05) : s;
  return mix(1.2 * (1.0 + gRough * t) / (1.0 + 0.28779 * gRough), 1.0, 0.35 + 0.3 * al); }
`;
const FON_ON = Q.get('fon') !== '0', GD = 'getDirectionalDirectLightIrradiance( directionalLight, geometry, directLight );';
export function groundLit(fs, sun, sky) {
  const ch = THREE.ShaderChunk.lights_fragment_begin.replace(GD, GD + `\n    directLight.color *= ${[sun, FON_ON ? 'fonK( geometry.normal, directLight.direction, geometry.viewDir, dot( diffuseColor.rgb, vec3( 0.33 ) ) )' : ''].filter(Boolean).join(' * ') || '1.0'};`);
  let r = fs.replace('#include <lights_fragment_begin>', ch); if (sky) r = r.replace('#include <lights_fragment_maps>', `irradiance *= mix(0.45, 1.0, ${sky});\n#include <lights_fragment_maps>`);
  return FON_ON ? r.replace('#include <specularmap_fragment>', 'float specularStrength = 0.0;') : r;
}
