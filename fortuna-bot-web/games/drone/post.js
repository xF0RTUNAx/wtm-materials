// Конвейер кадра «Симулятора Летки».
// Сцена рендерится в линейный HDR-буфер (HalfFloat) в масштабе scale (динамическое разрешение), затем:
//   свечение (bloom, 2 масштаба) → лучи от солнца (радиальное размытие, «Кино») → композит: ACES, цветокоррекция,
//   виньетка, хроматическая аберрация, перевод в P3 (если включён широкий цвет), гамма sRGB →
//   FXAA или TAA (по желанию) → апскейл до экрана: CAS (билинейный + адаптивная резкость) или FSR-стиль
//   (Lanczos-2 с защитой от ореолов + RCAS). Реализация апскейлеров упрощённая, идея — как у AMD FidelityFX.
// Облегчённый путь (cfg.ldr — пресеты без свечения и цветокоррекции): тонмаппинг и гамму делают сами материалы,
// сцена пишется в 8-битный буфер (вдвое меньше трафика памяти), дальше — только сглаживание и апскейл.
// Глубина — 24 бита (буфер с трафаретом): без логарифмической глубины нужна точность на дальних дистанциях.
// TAA (сглаживание по времени): каждый кадр проекция сдвигается на долю пикселя (последовательность Халтона), готовый
// кадр смешивается с накопленной «историей», перенесённой по глубине туда, где эта точка была в прошлом кадре;
// историю ограничивает разброс цветов соседних пикселей — против шлейфов. Ближе TAA_NEAR (свой самолёт, он летит вместе
// с камерой) история берётся с того же места экрана.
// Дрожание горячего воздуха (cfg.haze): частицы слоя cfg.hazeLayer рисуются в ¼ разрешения как «сила искажения»,
// композит сдвигает выборку кадра по бегущей синусоидальной ряби там, где она есть.
/* global THREE */

const VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const HALTON = Array.from({ length: 8 }, (_, i) => { const h = (b, n) => { let f = 1, r = 0; for (let k = n; k > 0; k = Math.floor(k / b)) { f /= b; r += f * (k % b); } return r; }; return [h(2, i + 1) - 0.5, h(3, i + 1) - 0.5]; });
const TAA_NEAR = 80;


export function createPipeline(renderer, cfg) {
  const gl2 = renderer.capabilities.isWebGL2, ldr = !!cfg.ldr;
  const hdr = gl2 && !ldr ? THREE.HalfFloatType : THREE.UnsignedByteType;
  const lin = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
  const msaa = cfg.aa === 'msaa' && gl2 && THREE.WebGLMultisampleRenderTarget;
  const taaOn = cfg.aa === 'taa' && gl2; // без WebGL2 (нет текстуры глубины) — как FXAA
  const rtOpt = { type: hdr, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, stencilBuffer: true };
  const sceneRT = msaa ? new THREE.WebGLMultisampleRenderTarget(1, 1, rtOpt) : new THREE.WebGLRenderTarget(1, 1, rtOpt);
  if (msaa) sceneRT.samples = 4;
  if (ldr) sceneRT.texture.encoding = THREE.sRGBEncoding; // материалы сами переводят в sRGB
  // «Облака и дым в пониженном разрешении» (cfg.fx): глубина кадра нужна шейдерам облаков и дыма, чтобы прятаться
  // за землёй и самолётами и мягко растворяться на стыке; сами они рисуются в половине разрешения и накладываются сверху
  const fxOn = !!cfg.fx && gl2;
  const hazeOn = !!cfg.haze && gl2 && !ldr;
  if (fxOn || taaOn || hazeOn) { const dt = new THREE.DepthTexture(1, 1, THREE.UnsignedInt248Type); dt.format = THREE.DepthStencilFormat; sceneRT.depthTexture = dt; }
  const fxRT = fxOn ? new THREE.WebGLRenderTarget(1, 1, { type: hdr, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false }) : null;
  if (fxRT && ldr) fxRT.texture.encoding = THREE.sRGBEncoding;
  const bloomOn = !ldr && (cfg.bloom || 0) > 0, raysOn = !ldr && !!cfg.rays;
  const hA = new THREE.WebGLRenderTarget(1, 1, { ...lin, type: hdr }), hB = new THREE.WebGLRenderTarget(1, 1, { ...lin, type: hdr });
  const qA = new THREE.WebGLRenderTarget(1, 1, { ...lin, type: hdr }), qB = new THREE.WebGLRenderTarget(1, 1, { ...lin, type: hdr });
  const rays = new THREE.WebGLRenderTarget(1, 1, { ...lin, type: hdr });
  const taaRT = taaOn ? [0, 1].map(() => new THREE.WebGLRenderTarget(1, 1, { ...lin, type: THREE.HalfFloatType })) : null; // 16 бит: иначе смешивание по 10% «залипает»
  const hazeRT = hazeOn ? new THREE.WebGLRenderTarget(1, 1, { ...lin, type: hdr }) : null;
  const ldrA = new THREE.WebGLRenderTarget(1, 1, lin), ldrB = new THREE.WebGLRenderTarget(1, 1, lin), upRT = new THREE.WebGLRenderTarget(1, 1, lin);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); quad.frustumCulled = false;
  const qScene = new THREE.Scene(); qScene.add(quad);
  const qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const mat = (fs, uniforms) => new THREE.ShaderMaterial({ uniforms, vertexShader: VS, fragmentShader: fs, depthTest: false, depthWrite: false });

  const bright = mat(`uniform sampler2D tDiffuse; uniform float threshold; varying vec2 vUv;
    void main() { vec3 c = texture2D(tDiffuse, vUv).rgb; float l = max(max(c.r, c.g), c.b);
      gl_FragColor = vec4(c * smoothstep(threshold, threshold + 0.5, l), 1.0); }`,
  { tDiffuse: { value: null }, threshold: { value: cfg.threshold || 0.9 } });
  const blur = mat(`uniform sampler2D tDiffuse; uniform vec2 dir; varying vec2 vUv;
    void main() { vec3 s = texture2D(tDiffuse, vUv).rgb * 0.227027;
      s += (texture2D(tDiffuse, vUv + dir * 1.384615).rgb + texture2D(tDiffuse, vUv - dir * 1.384615).rgb) * 0.316216;
      s += (texture2D(tDiffuse, vUv + dir * 3.230769).rgb + texture2D(tDiffuse, vUv - dir * 3.230769).rgb) * 0.070270;
      gl_FragColor = vec4(s, 1.0); }`,
  { tDiffuse: { value: null }, dir: { value: new THREE.Vector2() } });
  // лучи: радиальное размытие ярких мест к солнцу (тени от облаков и рельефа дают «полосы»)
  // 28 выборок со сдвигом-«дизерингом» на пиксель: полос не видно, а выборок почти в полтора раза меньше, чем 40
  const radial = mat(`uniform sampler2D tDiffuse; uniform vec2 sun; uniform float vis; varying vec2 vUv;
    void main() { vec2 d = (sun - vUv) / 28.0; float j = fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453);
      vec2 uv = vUv + d * j; float w = 1.0; vec3 s = vec3(0.0);
      for (int i = 0; i < 28; i++) { s += texture2D(tDiffuse, uv).rgb * w; w *= 0.951; uv += d; }
      gl_FragColor = vec4(s / 28.0 * vis, 1.0); }`,
  { tDiffuse: { value: null }, sun: { value: new THREE.Vector2(0.5, 0.5) }, vis: { value: 0 } });
  const comp = mat(`uniform sampler2D tDiffuse, tBloom, tBloom2, tRays, tHaze, tDepth; uniform vec2 camNF; uniform float bloom, raysK, exposure, vignette, grade, ca, p3, p3k, hazeK, time;
    varying vec2 vUv;
    vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
    vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
    void main() {
      vec2 uv = vUv;
      if (hazeK > 0.0) { float h = min(texture2D(tHaze, vUv).r, 1.0);
        // свой дрон (ближе 40–70 м) не «плывёт»: дрожит только то, что видно сквозь струю
        float dz = texture2D(tDepth, vUv).r * 2.0 - 1.0; dz = 2.0 * camNF.x * camNF.y / (camNF.y + camNF.x - dz * (camNF.y - camNF.x)); h *= smoothstep(40.0, 70.0, dz);
        if (h > 0.002) uv += vec2(sin(vUv.y * 260.0 + time * 23.0) + sin(vUv.x * 170.0 - time * 17.0), cos(vUv.x * 210.0 + time * 19.0) + cos(vUv.y * 190.0 - time * 29.0)) * h * hazeK; }
      vec2 off = (vUv - 0.5) * ca;
      vec3 col = ca > 0.0 ? vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b) : texture2D(tDiffuse, uv).rgb;
      col += (texture2D(tBloom, vUv).rgb * 0.6 + texture2D(tBloom2, vUv).rgb * 0.9) * bloom;
      col += texture2D(tRays, vUv).rgb * raysK;
      col = aces(col * exposure);
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(col, col * mix(vec3(0.9, 0.99, 1.1), vec3(1.1, 1.0, 0.88), l), grade);  // холодные тени, тёплые света
      col = max(mix(vec3(l), col, 1.0 + 0.15 * grade), 0.0);
      col *= mix(1.0, smoothstep(0.9, 0.25, length(vUv - 0.5)), vignette);
      // широкий цвет: точный перевод sRGB → Display P3 выглядит на P3-экране так же, как sRGB (разницы не видно), поэтому
      // насыщенные цвета (зелень, небо, вода, пламя) расширяем в P3-охват: чем насыщеннее цвет, тем сильнее; серые не меняются
      if (p3 > 0.5) { vec3 cp = mat3(0.8225, 0.0332, 0.0171, 0.1774, 0.9669, 0.0724, 0.0, 0.0, 0.9108) * col;
        float mxc = max(col.r, max(col.g, col.b)), sat = clamp((mxc - min(col.r, min(col.g, col.b))) / max(mxc, 1e-4), 0.0, 1.0);
        col = mix(cp, col, p3k * sqrt(sat)); }
      col = toSRGB(clamp(col, 0.0, 1.0));
      gl_FragColor = vec4(col, 1.0);
    }`,
  { tDiffuse: { value: null }, tBloom: { value: null }, tBloom2: { value: null }, tRays: { value: null }, tHaze: { value: null }, tDepth: { value: null }, camNF: { value: new THREE.Vector2(3, 60000) }, hazeK: { value: 0 }, time: { value: 0 }, bloom: { value: cfg.bloom || 0 }, raysK: { value: raysOn ? (cfg.raysK || 0.5) : 0 },
    exposure: { value: cfg.exposure || 1.15 }, vignette: { value: cfg.vignette || 0 }, grade: { value: cfg.grade || 0 },
    ca: { value: cfg.ca || 0 }, p3: { value: cfg.p3 ? 1 : 0 }, p3k: { value: cfg.p3exact ? 0 : 0.65 } });
  // FXAA (классический «лёгкий» вариант, 5 выборок + 4 вдоль направления края)
  const fxaa = mat(`uniform sampler2D tDiffuse; uniform vec2 rcp; varying vec2 vUv;
    float lu(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
    void main() {
      vec3 nw = texture2D(tDiffuse, vUv + vec2(-1.0, -1.0) * rcp).rgb, ne = texture2D(tDiffuse, vUv + vec2(1.0, -1.0) * rcp).rgb;
      vec3 sw = texture2D(tDiffuse, vUv + vec2(-1.0, 1.0) * rcp).rgb, se = texture2D(tDiffuse, vUv + vec2(1.0, 1.0) * rcp).rgb, m = texture2D(tDiffuse, vUv).rgb;
      float lNW = lu(nw), lNE = lu(ne), lSW = lu(sw), lSE = lu(se), lM = lu(m);
      float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
      vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
      float red = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
      dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + red), -8.0, 8.0) * rcp;
      vec3 a = 0.5 * (texture2D(tDiffuse, vUv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tDiffuse, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);
      vec3 b = a * 0.5 + 0.25 * (texture2D(tDiffuse, vUv - dir * 0.5).rgb + texture2D(tDiffuse, vUv + dir * 0.5).rgb);
      float lB = lu(b);
      gl_FragColor = vec4((lB < lMin || lB > lMax) ? a : b, 1.0);
    }`,
  { tDiffuse: { value: null }, rcp: { value: new THREE.Vector2() } });
  // TAA: перенос истории по глубине и прошлой матрице камеры, ограничение разбросом 3×3 соседей в YCoCg
  const taa = mat(`uniform sampler2D tCur, tHist, tDepth; uniform mat4 invVP, prevVP; uniform vec2 rcp, camNF; uniform float reset;
    varying vec2 vUv;
    vec3 toY(vec3 c) { return vec3(dot(c, vec3(0.25, 0.5, 0.25)), dot(c, vec3(0.5, 0.0, -0.5)), dot(c, vec3(-0.25, 0.5, -0.25))); }
    vec3 toRGB(vec3 y) { return vec3(y.x + y.y - y.z, y.x + y.z, y.x - y.y - y.z); }
    void main() {
      vec3 c = toY(texture2D(tCur, vUv).rgb), m1 = c, m2 = c * c, mn = c, mx = c;
      for (int i = 0; i < 8; i++) {
        vec2 o = i == 0 ? vec2(-1.0, -1.0) : i == 1 ? vec2(0.0, -1.0) : i == 2 ? vec2(1.0, -1.0) : i == 3 ? vec2(-1.0, 0.0) : i == 4 ? vec2(1.0, 0.0) : i == 5 ? vec2(-1.0, 1.0) : i == 6 ? vec2(0.0, 1.0) : vec2(1.0, 1.0);
        vec3 s = toY(texture2D(tCur, vUv + o * rcp).rgb); m1 += s; m2 += s * s; mn = min(mn, s); mx = max(mx, s);
      }
      m1 /= 9.0; vec3 sig = sqrt(max(m2 / 9.0 - m1 * m1, 0.0));
      float d = texture2D(tDepth, vUv).r, z = 2.0 * camNF.x * camNF.y / (camNF.y + camNF.x - (d * 2.0 - 1.0) * (camNF.y - camNF.x));
      vec2 puv = vUv;
      if (z > ${TAA_NEAR.toFixed(1)}) { vec4 w = invVP * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); w /= w.w; vec4 p = prevVP * w; puv = p.xy / p.w * 0.5 + 0.5; }
      // история — в пересечении «коробки» соседей и разброса ±σ: чужие цвета (после резкой смены вида) не проходят
      vec3 h = clamp(toY(texture2D(tHist, puv).rgb), max(m1 - sig, mn), min(m1 + sig, mx));
      float a = 0.1 + min(length((puv - vUv) / rcp) * 0.01, 0.15); // быстрое движение — меньше истории, меньше мыла
      if (reset > 0.5 || puv.x < 0.0 || puv.y < 0.0 || puv.x > 1.0 || puv.y > 1.0) a = 1.0;
      gl_FragColor = vec4(toRGB(mix(h, c, a)), 1.0);
    }`,
  { tCur: { value: null }, tHist: { value: null }, tDepth: { value: null }, invVP: { value: new THREE.Matrix4() }, prevVP: { value: new THREE.Matrix4() },
    rcp: { value: new THREE.Vector2() }, camNF: { value: new THREE.Vector2() }, reset: { value: 1 } });
  // CAS: билинейный апскейл + контрастно-адаптивная резкость (крест из 5 выборок в пикселях экрана)
  const cas = mat(`uniform sampler2D tDiffuse; uniform vec2 px; uniform float sharp; varying vec2 vUv;
    void main() {
      vec3 e = texture2D(tDiffuse, vUv).rgb, b = texture2D(tDiffuse, vUv + vec2(0.0, -px.y)).rgb, d = texture2D(tDiffuse, vUv + vec2(-px.x, 0.0)).rgb;
      vec3 f = texture2D(tDiffuse, vUv + vec2(px.x, 0.0)).rgb, h = texture2D(tDiffuse, vUv + vec2(0.0, px.y)).rgb;
      vec3 mn = min(e, min(min(b, d), min(f, h))), mx = max(e, max(max(b, d), max(f, h)));
      vec3 amp = sqrt(clamp(min(mn, 2.0 - mx) / max(mx, 1e-4), 0.0, 1.0));
      vec3 w = amp * (-1.0 / mix(8.0, 5.0, sharp));
      gl_FragColor = vec4(clamp((b * w + d * w + f * w + h * w + e) / (1.0 + 4.0 * w), 0.0, 1.0), 1.0);
    }`,
  { tDiffuse: { value: null }, px: { value: new THREE.Vector2() }, sharp: { value: cfg.sharp ?? 0.5 } });
  // Lanczos-2 (4×4) с ограничением по соседним 2×2 — против ореолов, как в EASU
  const lanczos = mat(`uniform sampler2D tDiffuse; uniform vec2 srcSize; varying vec2 vUv;
    float L(float x) { x = abs(x); if (x < 1e-5) return 1.0; if (x >= 2.0) return 0.0; float px = 3.14159265 * x; return 2.0 * sin(px) * sin(px * 0.5) / (px * px); }
    void main() {
      vec2 p = vUv * srcSize - 0.5, f = fract(p), base = (floor(p) + 0.5) / srcSize;
      // фильтр разделимый: 4 веса по x и 4 по y вместо 16 пар синусов
      vec4 wx = vec4(L(-1.0 - f.x), L(-f.x), L(1.0 - f.x), L(2.0 - f.x)), wy = vec4(L(-1.0 - f.y), L(-f.y), L(1.0 - f.y), L(2.0 - f.y));
      vec3 s = vec3(0.0), mn = vec3(1e9), mx = vec3(-1e9);
      for (int j = 0; j < 4; j++) {
        float yw = j == 0 ? wy.x : j == 1 ? wy.y : j == 2 ? wy.z : wy.w; vec3 row = vec3(0.0);
        for (int i = 0; i < 4; i++) {
          vec3 c = texture2D(tDiffuse, base + vec2(float(i - 1), float(j - 1)) / srcSize).rgb;
          row += c * (i == 0 ? wx.x : i == 1 ? wx.y : i == 2 ? wx.z : wx.w);
          if (i >= 1 && i <= 2 && j >= 1 && j <= 2) { mn = min(mn, c); mx = max(mx, c); }
        }
        s += row * yw;
      }
      gl_FragColor = vec4(clamp(s / (dot(wx, vec4(1.0)) * dot(wy, vec4(1.0))), mn, mx), 1.0);
    }`,
  { tDiffuse: { value: null }, srcSize: { value: new THREE.Vector2() } });
  // RCAS: «робастная» адаптивная резкость из FSR 1 (крест, предел лепестка 0.1875)
  const rcas = mat(`uniform sampler2D tDiffuse; uniform vec2 px; uniform float sharp; varying vec2 vUv;
    void main() {
      vec3 e = texture2D(tDiffuse, vUv).rgb, b = texture2D(tDiffuse, vUv + vec2(0.0, -px.y)).rgb, d = texture2D(tDiffuse, vUv + vec2(-px.x, 0.0)).rgb;
      vec3 f = texture2D(tDiffuse, vUv + vec2(px.x, 0.0)).rgb, h = texture2D(tDiffuse, vUv + vec2(0.0, px.y)).rgb;
      vec3 mn4 = min(min(b, d), min(f, h)), mx4 = max(max(b, d), max(f, h));
      vec3 hitMin = min(mn4, e) / (4.0 * mx4 + 1e-4), hitMax = (1.0 - max(mx4, e)) / (4.0 * mn4 - 4.0 - 1e-4);
      vec3 lobeRGB = max(-hitMin, hitMax);
      float lobe = max(-0.1875, min(max(lobeRGB.r, max(lobeRGB.g, lobeRGB.b)), 0.0)) * sharp;
      gl_FragColor = vec4(clamp((lobe * (b + d + f + h) + e) / (4.0 * lobe + 1.0), 0.0, 1.0), 1.0);
    }`,
  { tDiffuse: { value: null }, px: { value: new THREE.Vector2() }, sharp: { value: cfg.sharp ?? 0.5 } });

  const copy = mat('uniform sampler2D tDiffuse; varying vec2 vUv; void main() { gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb, 1.0); }', { tDiffuse: { value: null } });
  // наложение облаков/дыма: цвет уже умножен на прозрачность, поэтому «над» = fx + кадр × (1 − альфа)
  const fxOver = mat('uniform sampler2D tDiffuse; varying vec2 vUv; void main() { gl_FragColor = texture2D(tDiffuse, vUv); }', { tDiffuse: { value: null } });
  fxOver.transparent = true; fxOver.blending = THREE.CustomBlending; fxOver.blendSrc = THREE.OneFactor; fxOver.blendDst = THREE.OneMinusSrcAlphaFactor;
  fxOver.blendSrcAlpha = THREE.ZeroFactor; fxOver.blendDstAlpha = THREE.OneFactor;
  const full = new THREE.Vector2(), ccTmp = new THREE.Color();
  let scale = cfg.scale || 1, sw = 1, sh = 1, taaI = 0, taaReset = true;
  const vp = new THREE.Matrix4(), prevVP = new THREE.Matrix4(), prevCam = new THREE.Vector3(), prevDir = new THREE.Vector3(), camDir = new THREE.Vector3();
  function setSize() {
    renderer.getDrawingBufferSize(full);
    sw = Math.max(1, Math.round(full.x * scale)); sh = Math.max(1, Math.round(full.y * scale));
    sceneRT.setSize(sw, sh); if (fxRT) { const k = cfg.fxFull ? 1 : 2; fxRT.setSize(Math.max(1, Math.ceil(sw / k)), Math.max(1, Math.ceil(sh / k))); } ldrA.setSize(sw, sh); ldrB.setSize(sw, sh); upRT.setSize(full.x, full.y);
    hA.setSize(Math.ceil(sw / 2), Math.ceil(sh / 2)); hB.setSize(Math.ceil(sw / 2), Math.ceil(sh / 2)); rays.setSize(Math.ceil(sw / 2), Math.ceil(sh / 2));
    qA.setSize(Math.ceil(sw / 4), Math.ceil(sh / 4)); qB.setSize(Math.ceil(sw / 4), Math.ceil(sh / 4));
    if (taaRT) { for (const r of taaRT) r.setSize(sw, sh); taaReset = true; }
    if (hazeRT) hazeRT.setSize(Math.ceil(sw / 4), Math.ceil(sh / 4));
  }
  function pass(m, target) { quad.material = m; renderer.setRenderTarget(target); renderer.render(qScene, qCam); }
  const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); black.needsUpdate = true;
  return {
    cfg, setSize,
    get scale() { return scale; },
    get target() { return sceneRT; },
    get fx() { return fxOn; },
    setScale(s) { s = Math.round(Math.max(0.35, Math.min(1, s)) * 100) / 100; if (s !== scale) { scale = s; setSize(); } },
    setSharp(v) { cas.uniforms.sharp.value = v; rcas.uniforms.sharp.value = v; },
    setExposure(v) { comp.uniforms.exposure.value = v; },
    resetHistory() { taaReset = true; }, // TAA: следующий кадр — без истории (смена вида)
    render(scene, camera, t, sun) {
      const pm = camera.projectionMatrix.elements, p8 = pm[8], p9 = pm[9];
      if (taaOn) { const j = HALTON[taaI = (taaI + 1) % 8]; pm[8] += j[0] * 2 / sw; pm[9] += j[1] * 2 / sh; } // дрожание на долю пикселя
      renderer.setRenderTarget(sceneRT); renderer.render(scene, camera);
      if (fxOn && cfg.fxU) { // облака и дым (слой FX) — в половине разрешения, с мягкой проверкой глубины по кадру
        const U = cfg.fxU, mask = camera.layers.mask, au = renderer.shadowMap.autoUpdate, ac = renderer.autoClear;
        U.tDepth.value = sceneRT.depthTexture; U.fxSize.value.set(fxRT.width, fxRT.height); U.camNF.value.set(camera.near, camera.far); U.fxOn.value = 1; if (U.fxK) U.fxK.value = cfg.fxFull ? 1 : 0.5;
        camera.layers.set(cfg.fxLayer); renderer.shadowMap.autoUpdate = false;
        renderer.getClearColor(ccTmp); const ca = renderer.getClearAlpha();
        renderer.setRenderTarget(fxRT); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.autoClear = false;
        renderer.render(scene, camera);
        camera.layers.mask = mask; renderer.shadowMap.autoUpdate = au; renderer.setClearColor(ccTmp, ca);
        U.fxOn.value = 0; U.tDepth.value = null; // глубина кадра прикреплена к его буферу: в основном проходе её нельзя держать в шейдерах
        fxOver.uniforms.tDiffuse.value = fxRT.texture; quad.material = fxOver; renderer.setRenderTarget(sceneRT); renderer.render(qScene, qCam);
        // огонь и вспышки (аддитивные частицы) — поверх дыма, в полном разрешении и с обычной глубиной кадра
        if (cfg.fxAddLayer) { camera.layers.set(cfg.fxAddLayer); renderer.shadowMap.autoUpdate = false; renderer.render(scene, camera); camera.layers.mask = mask; renderer.shadowMap.autoUpdate = au; }
        renderer.autoClear = ac;
      }
      if (hazeOn && cfg.hazeLayer) { // дрожание воздуха: «сила искажения» от частиц слоя hazeLayer
        const mask = camera.layers.mask, au = renderer.shadowMap.autoUpdate, ac = renderer.autoClear;
        renderer.getClearColor(ccTmp); const ca = renderer.getClearAlpha();
        camera.layers.set(cfg.hazeLayer); renderer.shadowMap.autoUpdate = false;
        renderer.setRenderTarget(hazeRT); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.autoClear = false;
        renderer.render(scene, camera);
        camera.layers.mask = mask; renderer.shadowMap.autoUpdate = au; renderer.setClearColor(ccTmp, ca); renderer.autoClear = ac;
        comp.uniforms.tHaze.value = hazeRT.texture; comp.uniforms.hazeK.value = cfg.hazeK || 0.0016; comp.uniforms.time.value = t || 0;
        comp.uniforms.tDepth.value = sceneRT.depthTexture; comp.uniforms.camNF.value.set(camera.near, camera.far);
      }
      pm[8] = p8; pm[9] = p9;
      let b1 = black, b2 = black, r = black;
      if (bloomOn || raysOn) { bright.uniforms.tDiffuse.value = sceneRT.texture; pass(bright, hA); }
      if (raysOn && sun && sun.vis > 0.01) {
        radial.uniforms.tDiffuse.value = hA.texture; radial.uniforms.sun.value.set(sun.x, sun.y); radial.uniforms.vis.value = sun.vis; pass(radial, rays); r = rays.texture;
      }
      if (bloomOn) {
        blur.uniforms.tDiffuse.value = hA.texture; blur.uniforms.dir.value.set(1 / hA.width, 0); pass(blur, hB);
        blur.uniforms.tDiffuse.value = hB.texture; blur.uniforms.dir.value.set(0, 1 / hB.height); pass(blur, hA);
        blur.uniforms.tDiffuse.value = hA.texture; blur.uniforms.dir.value.set(2 / qA.width, 0); pass(blur, qA);
        blur.uniforms.tDiffuse.value = qA.texture; blur.uniforms.dir.value.set(0, 2 / qB.height); pass(blur, qB);
        b1 = hA.texture; b2 = qB.texture;
      }
      const up = cfg.upscaler || 'off', useFxaa = cfg.aa === 'fxaa' || (cfg.aa === 'taa' && !taaOn);
      let src = ldrA;
      if (ldr) { // сцена уже в sRGB: композит не нужен
        src = sceneRT;
        if (!useFxaa && !taaOn && up === 'off') { copy.uniforms.tDiffuse.value = sceneRT.texture; pass(copy, null); return; }
      } else {
        const u = comp.uniforms; u.tDiffuse.value = sceneRT.texture; u.tBloom.value = b1; u.tBloom2.value = b2; u.tRays.value = r;
        if (!useFxaa && !taaOn && up === 'off') { pass(comp, null); return; } // билинейно растянется до экрана само
        pass(comp, ldrA);
      }
      if (taaOn) {
        const u = taa.uniforms, [hPrev, hNext] = taaRT;
        vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        camera.getWorldDirection(camDir);
        // резкая смена вида (взлёт из меню, «взгляд назад», новый план): прыжок камеры > 150 м или поворот > 25° за кадр — историю сбрасываем
        if (prevCam.distanceToSquared(camera.position) > 22500 || camDir.dot(prevDir) < 0.9) taaReset = true;
        u.tCur.value = src.texture; u.tHist.value = hPrev.texture; u.tDepth.value = sceneRT.depthTexture; u.invVP.value.copy(vp).invert(); u.prevVP.value.copy(prevVP);
        u.rcp.value.set(1 / sw, 1 / sh); u.camNF.value.set(camera.near, camera.far); u.reset.value = taaReset ? 1 : 0;
        pass(taa, hNext); taaRT.reverse(); prevVP.copy(vp); prevCam.copy(camera.position); prevDir.copy(camDir); taaReset = false; src = hNext;
        if (up === 'off') { cas.uniforms.tDiffuse.value = src.texture; cas.uniforms.px.value.set(1 / sw, 1 / sh); pass(cas, null); return; } // лёгкая резкость против «мыла»
      }
      if (useFxaa) { fxaa.uniforms.tDiffuse.value = src.texture; fxaa.uniforms.rcp.value.set(1 / sw, 1 / sh); if (up === 'off') { pass(fxaa, null); return; } pass(fxaa, ldrB); src = ldrB; }
      if (up === 'cas') { cas.uniforms.tDiffuse.value = src.texture; cas.uniforms.px.value.set(1 / full.x, 1 / full.y); pass(cas, null); return; }
      lanczos.uniforms.tDiffuse.value = src.texture; lanczos.uniforms.srcSize.value.set(sw, sh);
      if (scale >= 0.999) { rcas.uniforms.tDiffuse.value = src.texture; } else { pass(lanczos, upRT); rcas.uniforms.tDiffuse.value = upRT.texture; }
      rcas.uniforms.px.value.set(1 / full.x, 1 / full.y); pass(rcas, null);
    },
    dispose() {
      for (const r of [sceneRT, hA, hB, qA, qB, rays, ldrA, ldrB, upRT, ...(taaRT || []), ...(hazeRT ? [hazeRT] : [])]) r.dispose(); if (fxRT) fxRT.dispose(); if (sceneRT.depthTexture) sceneRT.depthTexture.dispose();
      for (const m of [bright, blur, radial, comp, taa, fxaa, cas, lanczos, rcas, copy, fxOver]) m.dispose();
      quad.geometry.dispose(); black.dispose();
    },
  };
}
