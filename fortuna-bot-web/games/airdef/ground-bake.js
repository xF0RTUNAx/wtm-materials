// Запечённый цвет дальней земли (пробная версия 2026-10-27, ?gb=1; Mark: «сначала быстрая пробная версия, финал — после одобрения»).
// Земля — до половины кадра видеокарты на телефоне: шейдер цвета осени — ~35 выборок текстур и шума на пиксель. Дальше ~1,6 км цвет от камеры не
// зависит (вблизи — трава, листва, тыквы; вдали — средний цвет), поэтому его можно посчитать один раз в текстуру и брать оттуда одной выборкой.
// Два уровня (clipmap): L1 — вся карта 32 км, 2048² (15,6 м на тексель), считается раз при загрузке; L0 — окно 8,2 км вокруг камеры, 2048² (4 м),
// «тороидальное»: камера ушла на 1 км — пересчитывается только вошедшая полоса (8 плиток 256², по 2 за кадр). Считает тот же код цвета, что у
// материала земли (autumn-render.js aGround), по той же сетке рельефа — высота в болоте и оврагах та же. Хранится √цвет (тёмная земля без полос
// в 8 битах), в альфе — туман низин. В шейдере земли: ближе 1,6 км — как было, 1,6–2 км — смесь, дальше — запечённое (L0, у края окна — L1).
/* global THREE */
const QS = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
export const BAKE_ON = QS.get('gb') === '1';
const N = 2048, T = 256, NT = N / T; // L0: размер, плитка (текселей), плиток на сторону
export function createGroundBake(H, o = {}) {
  const S0 = o.s0 || +QS.get('gbs') || 4, W0 = N * S0, TW = T * S0; // L0: метров на тексель, окно, плитка (м); ?gbs= — для пробы
  const N1 = o.n1 || +QS.get('gbn1') || 2048, NT1 = N1 / T; // L1 — вся карта (?gbn1=1024 — вдвое грубее, вчетверо меньше памяти)
  const U = { tB0: { value: null }, tB1: { value: null }, uB0: { value: new THREE.Vector4() }, uBk: { value: new THREE.Vector4(0, o.d0 || 1600, o.d1 || 2000, W0) } };
  const h = H.toFixed(1), h2 = (2 * H).toFixed(1);
  // в шейдер земли: bakeK — доля запечённого по расстоянию, bakeAt — цвет (L0 внутри окна, к краю окна — L1); выборки с производными farInit (ветвления)
  const GLSL = `uniform sampler2D tB0, tB1; uniform vec4 uB0, uBk;
float bakeK(float d) { return uBk.x * smoothstep(uBk.y, uBk.z, d); }
vec4 bakeAt(vec2 p) {
  vec2 e = min(p - uB0.xy, uB0.zw - p); float w0 = smoothstep(0.0, 600.0, min(e.x, e.y));
  vec4 c = vec4(0.0);
  if (w0 < 1.0) c = TEXG(tB1, (p + ${h}) / ${h2}, gDx / ${h2}, gDy / ${h2});
  if (w0 > 0.0) c = mix(c, TEXG(tB0, p / uBk.w, gDx / uBk.w, gDy / uBk.w), w0);
  return vec4(c.rgb * c.rgb, c.a * 1.2);
}
`;
  let R = null, scene = null, cam = null, mat = null, AT = null, L = [], ready = false, on = BAKE_ON, wx = 0, wz = 0;
  const q = []; // очередь плиток: { l, gx, gz }
  const mk = (aniso, n) => { const rt = new THREE.WebGLRenderTarget(n, n, { depthBuffer: false, stencilBuffer: false, format: THREE.RGBAFormat, type: THREE.UnsignedByteType });
    const t = rt.texture; t.generateMipmaps = false; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = aniso; return rt; };
  const texReady = () => Object.values(AT).every((u) => u.value && (u.value.isCompressedTexture || (u.value.image && (u.value.image.width || u.value.image.data))));
  function mips(rt) { const p = R.properties.get(rt.texture); if (!p.__webglTexture) return; const gl = R.getContext(); R.state.bindTexture(gl.TEXTURE_2D, p.__webglTexture); gl.generateMipmap(gl.TEXTURE_2D); R.state.bindTexture(gl.TEXTURE_2D, null); }
  const md = (a) => ((a % NT) + NT) % NT;
  function tile(t) {
    const rt = L[t.l], px = t.l ? t.gx : md(t.gx), pz = t.l ? t.gz : md(t.gz), u = mat.uniforms.uRect.value;
    if (t.l) u.set(-H + t.gx * 2 * H / NT1, -H + t.gz * 2 * H / NT1, 2 * H / NT1, 2 * H / NT1); else u.set(t.gx * TW, t.gz * TW, TW, TW);
    rt.viewport.set(px * T, pz * T, T, T); rt.scissor.set(px * T, pz * T, T, T); rt.scissorTest = true;
    R.setRenderTarget(rt); R.render(scene, cam);
    if (!t.l) { const s = px + pz * NT; slot[s] = t.gx + ',' + t.gz; fresh[s] = false; }
  }
  // L0 по местам (тороидально: место — плитка по модулю 8): какая плитка мира там посчитана и готовы ли её мипмапы. Плитка, посчитанная для
  // окна, остаётся верной, пока она в окне (её место занимает только плитка вне окна) — сдвиг окна, даже посреди пересчёта, пересчитывает только новое
  const slot = new Array(NT * NT).fill(''), fresh = new Array(NT * NT).fill(false);
  let wInit = false;
  const ok = (gx, gz) => { const s = md(gx) + md(gz) * NT; return fresh[s] && slot[s] === gx + ',' + gz; };
  // окно L0: камера — в одной из двух средних плиток (до края окна — от 3 км)
  function follow(c) {
    const tx = Math.floor(c.x / TW), tz = Math.floor(c.z / TW); let nx = wx, nz = wz;
    if (!wInit) { nx = tx - 3; nz = tz - 3; }
    if (tx < nx + 3) nx = tx - 3; else if (tx > nx + 4) nx = tx - 4;
    if (tz < nz + 3) nz = tz - 3; else if (tz > nz + 4) nz = tz - 4;
    if (wInit && nx === wx && nz === wz) return;
    wInit = true; wx = nx; wz = nz;
    for (let i = q.length - 1; i >= 0; i--) { const t = q[i]; if (!t.l && (t.gx < wx || t.gx >= wx + NT || t.gz < wz || t.gz >= wz + NT)) q.splice(i, 1); } // ушли из окна
    const has = new Set(q.filter((t) => !t.l).map((t) => t.gx + ',' + t.gz));
    for (let j = 0; j < NT; j++) for (let i = 0; i < NT; i++) { const gx = wx + i, gz = wz + j, s = md(gx) + md(gz) * NT; if (slot[s] !== gx + ',' + gz && !has.has(gx + ',' + gz)) q.push({ l: 0, gx, gz }); }
    rect();
  }
  // где L0 готов: окно, у которого края с неготовыми плитками срезаны; неготовые внутри — L0 пока нигде
  function rect() {
    const r = U.uB0.value; let x0 = wx, x1 = wx + NT, z0 = wz, z1 = wz + NT;
    const colOk = (x) => { for (let z = z0; z < z1; z++) if (!ok(x, z)) return false; return true; }, rowOk = (z) => { for (let x = x0; x < x1; x++) if (!ok(x, z)) return false; return true; };
    for (let it = 0; it < 2 * NT && x0 < x1 && z0 < z1; it++) {
      if (!colOk(x0)) x0++; else if (!colOk(x1 - 1)) x1--; else if (!rowOk(z0)) z0++; else if (!rowOk(z1 - 1)) z1--; else break;
    }
    let all = x0 < x1 && z0 < z1; for (let x = x0; all && x < x1; x++) all = colOk(x);
    if (!all || !wInit || !U.tB0.value) r.set(0, 0, -1, -1); else r.set(x0 * TW, z0 * TW, x1 * TW, z1 * TW);
  }
  function work(n) {
    const prev = R.getRenderTarget(); let d0 = false, d1 = false;
    for (let k = 0; k < n && q.length; k++) { const t = q.shift(); tile(t); if (t.l) d1 = true; else d0 = true; }
    R.setRenderTarget(prev);
    if (d1 && !q.some((t) => t.l)) { mips(L[1]); U.tB1.value = L[1].texture; }
    // мипмапы L0 — когда очередь пуста: до этого у новых плиток дальние уровни — от прежних (они в рамку не входят)
    if (d0 && !q.some((t) => !t.l)) { mips(L[0]); U.tB0.value = L[0].texture; fresh.fill(true); for (let s = 0; s < fresh.length; s++) if (!slot[s]) fresh[s] = false; }
    if (d0) rect();
    U.uBk.value.x = on && U.tB1.value ? 1 : 0;
  }
  const B = {
    U, GLSL,
    // renderer, сетка земли и её материал (userData.GU, AT, groundGLSL — autumn-render.js); aniso — фильтр запечённых текстур
    init(renderer, geo, gm, aniso = 4) {
      R = renderer; AT = gm.userData.AT; L = [mk(aniso, N), mk(aniso, N1)]; L[0].texture.wrapS = L[0].texture.wrapT = THREE.RepeatWrapping; // L0 — по кругу (тороидально)
      mat = new THREE.ShaderMaterial({ uniforms: { ...AT, ...gm.userData.GU, uRect: { value: new THREE.Vector4() } }, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
        vertexShader: `uniform vec4 uRect; varying vec3 vWp;
void main() { vWp = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = vec4((vWp.xz - uRect.xy) / uRect.zw * 2.0 - 1.0, 0.0, 1.0); }`,
        fragmentShader: `varying vec3 vWp;
${gm.userData.groundGLSL()}
void main() {
  farInit(vWp.xz); wN = normalize(texture2D(tNm, (vWp.xz + ${h}) / ${h2}).xyz * 2.0 - 1.0);
  vec4 g = aGround(vWp, 1.0e6);
  gl_FragColor = vec4(sqrt(clamp(g.rgb, 0.0, 1.0)), clamp(g.a / 1.2, 0.0, 1.0));
}` });
      mat.extensions = { derivatives: true, shaderTextureLOD: true };
      const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; scene = new THREE.Scene(); scene.add(m); cam = new THREE.OrthographicCamera();
      renderer.domElement.addEventListener('webglcontextrestored', () => { ready = false; wInit = false; q.length = 0; slot.fill(''); fresh.fill(false); U.tB0.value = U.tB1.value = null; U.uBk.value.x = 0; rect(); }); // содержимое потеряно — заново
    },
    // каждый кадр (до отрисовки): ждёт текстуры земли, потом считает по n плиток
    update(c, n = 2) {
      if (!R) return;
      if (!ready) { if (!texReady()) return; ready = true; for (let j = 0; j < NT1; j++) for (let i = 0; i < NT1; i++) q.push({ l: 1, gx: i, gz: j }); }
      if (U.tB1.value) follow(c.position);
      if (q.length) work(n);
    },
    // досчитать всё сразу (стенды: камера прыгает между видами)
    flush(c) { if (!R) return; this.update(c, 999); for (let i = 0; i < 4 && (q.length || !this.ready); i++) this.update(c, 999); },
    get ready() { return !!(U.tB1.value && U.tB0.value && wInit && !q.length); },
    get on() { return on; }, set on(v) { on = !!v; U.uBk.value.x = on && U.tB1.value ? 1 : 0; },
    get pending() { return q.length; }, get rts() { return L; }, // стенды: содержимое уровней
  };
  return B;
}
