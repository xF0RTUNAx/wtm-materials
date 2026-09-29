// Конвейер кадра «Симулятора Летки».
// Сцена рендерится в линейный HDR-буфер (HalfFloat) в масштабе scale (динамическое разрешение), затем:
//   свечение (bloom, 2 масштаба) → лучи от солнца (радиальное размытие, «Кино») → композит: ACES, цветокоррекция,
//   виньетка, хроматическая аберрация, перевод в P3 (если включён широкий цвет), гамма sRGB →
//   FXAA (по желанию) → апскейл до экрана: CAS (билинейный + адаптивная резкость) или FSR-стиль
//   (Lanczos-2 с защитой от ореолов + RCAS). Реализация апскейлеров упрощённая, идея — как у AMD FidelityFX.
// Облегчённый путь (cfg.ldr — пресеты без свечения и цветокоррекции): тонмаппинг и гамму делают сами материалы,
// сцена пишется в 8-битный буфер (вдвое меньше трафика памяти), дальше — только сглаживание и апскейл.
// Глубина — 24 бита (буфер с трафаретом): без логарифмической глубины нужна точность на дальних дистанциях.
/* global THREE */

const VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';


export function createPipeline(renderer, cfg) {
  const gl2 = renderer.capabilities.isWebGL2, ldr = !!cfg.ldr;
  const hdr = gl2 && !ldr ? THREE.HalfFloatType : THREE.UnsignedByteType;
  const lin = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
  const msaa = cfg.aa === 'msaa' && gl2 && THREE.WebGLMultisampleRenderTarget;
  const rtOpt = { type: hdr, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, stencilBuffer: true };
  const sceneRT = msaa ? new THREE.WebGLMultisampleRenderTarget(1, 1, rtOpt) : new THREE.WebGLRenderTarget(1, 1, rtOpt);
  if (msaa) sceneRT.samples = 4;
  if (ldr) sceneRT.texture.encoding = THREE.sRGBEncoding; // материалы сами переводят в sRGB
  const bloomOn = !ldr && (cfg.bloom || 0) > 0, raysOn = !ldr && !!cfg.rays;
  const hA = new THREE.WebGLRenderTarget(1, 1, { ...lin, type: hdr }), hB = new THREE.WebGLRenderTarget(1, 1, { ...lin, type: hdr });
  const qA = new THREE.WebGLRenderTarget(1, 1, { ...lin, type: hdr }), qB = new THREE.WebGLRenderTarget(1, 1, { ...lin, type: hdr });
  const rays = new THREE.WebGLRenderTarget(1, 1, { ...lin, type: hdr });
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
  const comp = mat(`uniform sampler2D tDiffuse, tBloom, tBloom2, tRays; uniform float bloom, raysK, exposure, vignette, grade, ca, p3;
    varying vec2 vUv;
    vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
    vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
    void main() {
      vec2 off = (vUv - 0.5) * ca;
      vec3 col = ca > 0.0 ? vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b) : texture2D(tDiffuse, vUv).rgb;
      col += (texture2D(tBloom, vUv).rgb * 0.6 + texture2D(tBloom2, vUv).rgb * 0.9) * bloom;
      col += texture2D(tRays, vUv).rgb * raysK;
      col = aces(col * exposure);
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(col, col * mix(vec3(0.9, 0.99, 1.1), vec3(1.1, 1.0, 0.88), l), grade);  // холодные тени, тёплые света
      col = max(mix(vec3(l), col, 1.0 + 0.15 * grade), 0.0);
      col *= mix(1.0, smoothstep(0.9, 0.25, length(vUv - 0.5)), vignette);
      if (p3 > 0.5) col = mat3(0.8225, 0.0332, 0.0171, 0.1774, 0.9669, 0.0724, 0.0, 0.0, 0.9108) * col; // линейный sRGB → Display P3
      col = toSRGB(clamp(col, 0.0, 1.0));
      gl_FragColor = vec4(col, 1.0);
    }`,
  { tDiffuse: { value: null }, tBloom: { value: null }, tBloom2: { value: null }, tRays: { value: null }, bloom: { value: cfg.bloom || 0 }, raysK: { value: raysOn ? (cfg.raysK || 0.5) : 0 },
    exposure: { value: cfg.exposure || 1.15 }, vignette: { value: cfg.vignette || 0 }, grade: { value: cfg.grade || 0 },
    ca: { value: cfg.ca || 0 }, p3: { value: cfg.p3 ? 1 : 0 } });
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
  const full = new THREE.Vector2();
  let scale = cfg.scale || 1, sw = 1, sh = 1;
  function setSize() {
    renderer.getDrawingBufferSize(full);
    sw = Math.max(1, Math.round(full.x * scale)); sh = Math.max(1, Math.round(full.y * scale));
    sceneRT.setSize(sw, sh); ldrA.setSize(sw, sh); ldrB.setSize(sw, sh); upRT.setSize(full.x, full.y);
    hA.setSize(Math.ceil(sw / 2), Math.ceil(sh / 2)); hB.setSize(Math.ceil(sw / 2), Math.ceil(sh / 2)); rays.setSize(Math.ceil(sw / 2), Math.ceil(sh / 2));
    qA.setSize(Math.ceil(sw / 4), Math.ceil(sh / 4)); qB.setSize(Math.ceil(sw / 4), Math.ceil(sh / 4));
  }
  function pass(m, target) { quad.material = m; renderer.setRenderTarget(target); renderer.render(qScene, qCam); }
  const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); black.needsUpdate = true;
  return {
    cfg, setSize,
    get scale() { return scale; },
    setScale(s) { s = Math.round(Math.max(0.35, Math.min(1, s)) * 100) / 100; if (s !== scale) { scale = s; setSize(); } },
    setSharp(v) { cas.uniforms.sharp.value = v; rcas.uniforms.sharp.value = v; },
    setExposure(v) { comp.uniforms.exposure.value = v; },
    render(scene, camera, t, sun) {
      renderer.setRenderTarget(sceneRT); renderer.render(scene, camera);
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
      const up = cfg.upscaler || 'off', useFxaa = cfg.aa === 'fxaa';
      let src = ldrA;
      if (ldr) { // сцена уже в sRGB: композит не нужен
        src = sceneRT;
        if (!useFxaa && up === 'off') { copy.uniforms.tDiffuse.value = sceneRT.texture; pass(copy, null); return; }
      } else {
        const u = comp.uniforms; u.tDiffuse.value = sceneRT.texture; u.tBloom.value = b1; u.tBloom2.value = b2; u.tRays.value = r;
        if (!useFxaa && up === 'off') { pass(comp, null); return; } // билинейно растянется до экрана само
        pass(comp, ldrA);
      }
      if (useFxaa) { fxaa.uniforms.tDiffuse.value = src.texture; fxaa.uniforms.rcp.value.set(1 / sw, 1 / sh); if (up === 'off') { pass(fxaa, null); return; } pass(fxaa, ldrB); src = ldrB; }
      if (up === 'cas') { cas.uniforms.tDiffuse.value = src.texture; cas.uniforms.px.value.set(1 / full.x, 1 / full.y); pass(cas, null); return; }
      lanczos.uniforms.tDiffuse.value = src.texture; lanczos.uniforms.srcSize.value.set(sw, sh);
      if (scale >= 0.999) { rcas.uniforms.tDiffuse.value = src.texture; } else { pass(lanczos, upRT); rcas.uniforms.tDiffuse.value = upRT.texture; }
      rcas.uniforms.px.value.set(1 / full.x, 1 / full.y); pass(rcas, null);
    },
    dispose() {
      for (const r of [sceneRT, hA, hB, qA, qB, rays, ldrA, ldrB, upRT]) r.dispose();
      for (const m of [bright, blur, radial, comp, fxaa, cas, lanczos, rcas, copy]) m.dispose();
      quad.geometry.dispose(); black.dispose();
    },
  };
}
