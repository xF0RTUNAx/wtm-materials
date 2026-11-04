// Главный экран - ангар (Mark 2026-11-04: «ангар + подвеска»). Фон - готовый рендер сборщика (ui/hangar, ПАСПОРТ.json: камера и свет), живой слой - настоящий самолёт
// с подвеской на подъёмниках, в одном ракурсе. Рисует тот же рендерер, что и бой: второй контекст WebGL на телефоне нельзя - текстуры моделей освобождаются после загрузки
// на видеокарту (models.js). Кадр считается только когда что-то меняется: в покое ни 3D, ни нагрева (как прежний фон на кадрах menubg.js).
// Фон и самолёт масштабируются как одна картинка: «полный кадр» - весь рендер 16:9 с его камерой, экран - окно в нём (setViewOffset), поэтому пол и самолёт совпадают на любом экране.
// Подвеска расставлена как в бою (air.js: order, buildPylons). Подъёмник: base, ram (шток, длина 1 м, scale.y = ход), head (седло). ?oldbg=1 - прежний фон.
import { AG } from './arsenal.js?v=20261104a';
import { planeModel, planeMeta, classOf, wantModel, wantWeapon, weaponPending, weaponFailed, pylonMesh, podModel, anyModel, modelLoaded, modelFailed, releaseModel, wantCamo, camoKnown, hiKnown } from './models.js?v=20261104a';

const VIEWS = { // ПАСПОРТ.json сборщика
  // near, far - не из паспорта: буфер со сглаживанием держит 16 бит глубины, при near 0,3 на 31 м различал только 5 см, и близкие поверхности мерцали лесенкой (Mark, телефон)
  fighter: { fov: 38, cam: [0, 1.85, 31], look: [0, 1.6, 0], r: 12, near: 10, far: 70 },
  heavy: { fov: 46, cam: [0, 2.4, 61], look: [0, 3.4, 0], r: 22, near: 20, far: 130 },
};
const FULL_W = 16, FULL_H = 9, AZ0 = 2.86, BIG = 25; // BIG - длина или размах, с которых нужен большой зал; AZ0 - один ракурс для всех: нос к камере и чуть влево (Mark 2026-11-04: самолёты не вращаются), справа панель
const ST_ORDER = [3, 4, 2, 5, 1, 6, 0, 7], JACK_TOP = 1.35, JACK_HEAD = 0.11, JACK_MAX = 2.5;
const MODEL_WAIT = 12000, PICK_WAIT = 180, KEEP_LOOKED = 3; // модель всё не приходит - показать, что есть; быстрое листание ленты не качает каждый самолёт; на телефоне в памяти - последние просмотренные
const BLOB_GEO = () => new THREE.PlaneGeometry(2.6, 2.6).rotateX(-Math.PI / 2);

export function createHangar(C, renderer) {
  const Q = (() => { try { return new URLSearchParams(location.search); } catch (_) { return new URLSearchParams(''); } })();
  let can = !!(renderer && renderer.capabilities && renderer.setRenderTarget && renderer.getDrawingBufferSize) && Q.get('oldbg') !== '1' && typeof document !== 'undefined' && !!document.createElementNS && !!document.getElementById('menu'); // createElementNS нет у заглушки DOM в стендах
  let inited = false, on = false, dirty = true, hs, cam, pivot, holder, shadow, jackG, bg, blitS, blitC, blit, rt = null, rtW = 0, rtH = 0;
  let viewKey = 'fighter', V = VIEWS.fighter, texA = null, texB = null, fade = 1;
  const TEX = {};
  let nFrames = 0, baseZ = 1, az = AZ0, tAz = AZ0, vel = 0, drag = null, moved = 0, z = 1, tZ = 1, cx = 0.5, cy = 0.5, tCx = 0.5, tCy = 0.5, hw = 0.5, hh = 0.5;
  let want = null, cur = null, wantT = 0, built = false, groups = [], focusKey = null, panelW = () => 0;
  const tmp = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), TOUCH = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

  function texOf(key) {
    if (TEX[key]) return TEX[key];
    const big = Math.min(2, devicePixelRatio || 1) * Math.max(innerWidth, innerHeight) > 1700, src = `airdef/ui/hangar/${key}${big ? '' : '_s'}.jpg`, t = { tex: null, ok: false };
    TEX[key] = t;
    t.tex = new THREE.TextureLoader().load(src, () => { t.ok = true; dirty = true; }, undefined, () => { t.bad = true; dirty = true; if (key === 'fighter' && on) { can = false; if (C.hangarFail) C.hangarFail(); } }); // основной зал не загрузился - прежний фон
    t.tex.minFilter = THREE.LinearMipmapLinearFilter; t.tex.magFilter = THREE.LinearFilter; t.tex.generateMipmaps = true; // без перевода цвета: фон и кадр - сразу значения экрана
    return t;
  }

  function init() {
    if (inited) return; inited = true;
    hs = new THREE.Scene();
    cam = new THREE.PerspectiveCamera(V.fov, FULL_W / FULL_H, 0.3, 400);
    pivot = new THREE.Group(); hs.add(pivot); holder = new THREE.Group(); pivot.add(holder); jackG = new THREE.Group(); pivot.add(jackG);
    // свет - по паспорту; сила подобрана по снимку на настоящей модели: пол вокруг светлый, борт самолёта не должен быть чёрным
    hs.add(new THREE.HemisphereLight(0xc9d3d9, 0x8a857a, 0.78));
    const main = new THREE.DirectionalLight(0xffedd1, 0.92); main.position.set(-0.15, 0.96, 0.22); hs.add(main);
    const fill = new THREE.DirectionalLight(0xfff4e6, 0.26); fill.position.set(0.1, 0.25, 1); hs.add(fill); // от пола и стен на ближний к камере борт
    const rim = new THREE.DirectionalLight(0xfff0d9, 0.24); rim.position.set(-0.5, 0.48, -0.72); hs.add(rim);
    // фон: прямоугольник на весь экран, окно в картинке - те же cx, cy, hw, hh, что у камеры; при приближении - размытие через младшие уровни картинки
    bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: { a: { value: null }, b: { value: null }, t: { value: 0 }, win: { value: new THREE.Vector4(0.5, 0.5, 0.5, 0.5) }, bias: { value: 0 } },
      vertexShader: 'uniform vec4 win; varying vec2 u; void main() { u = win.xy + position.xy * win.zw; gl_Position = vec4(position.xy, 0.9999, 1.0); }',
      fragmentShader: 'uniform sampler2D a, b; uniform float t, bias; varying vec2 u; void main() { vec3 c = texture2D(a, u, bias).rgb; if (t > 0.001) c = mix(c, texture2D(b, u, bias).rgb, t); gl_FragColor = vec4(c, 1.0); }',
      depthTest: false, depthWrite: false, toneMapped: false }));
    bg.frustumCulled = false; bg.renderOrder = -1000; hs.add(bg);
    // вывод на экран из буфера со сглаживанием (у основного холста antialias выключен)
    blitS = new THREE.Scene(); blitC = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    blit = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: { t: { value: null } }, vertexShader: 'varying vec2 u; void main() { u = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: 'uniform sampler2D t; varying vec2 u; void main() { gl_FragColor = vec4(texture2D(t, u).rgb, 1.0); }', depthTest: false, depthWrite: false, toneMapped: false }));
    blit.frustumCulled = false; blitS.add(blit);
    listen();
    // контекст WebGL вернулся (на телефоне страница перезагружается сама): буфер и запечённая тень потеряны
    renderer.domElement.addEventListener('webglcontextrestored', () => { rt = null; rtW = rtH = 0; shA = shB = null; if (shadow) { shadow.material.dispose(); pivot.remove(shadow); shadow = null; } const L = lastL; if (L) { cur = null; show(L); } dirty = true; });
  }

  function ensureRT() {
    const s = renderer.getDrawingBufferSize(tmp2);
    if (rt && rtW === s.x && rtH === s.y) return;
    if (rt) rt.dispose();
    rtW = s.x; rtH = s.y;
    const P = { depthBuffer: true, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat };
    rt = renderer.capabilities.isWebGL2 && THREE.WebGLMultisampleRenderTarget ? new THREE.WebGLMultisampleRenderTarget(rtW, rtH, P) : new THREE.WebGLRenderTarget(rtW, rtH, P);
    if (rt.samples !== undefined) rt.samples = 4;
    rt.texture.encoding = THREE.sRGBEncoding; rt.texture.generateMipmaps = false;
    blit.material.uniforms.t.value = rt.texture;
  }
  const tmp2 = new THREE.Vector2();

  // ── что показать ─────────────────────────────────────────
  const skinOf = (plane) => { const w = C.shop && C.shop.wallet && C.shop.wallet(), sk = (w && (w.worn || {})[plane]) || null; if (sk && camoKnown(plane, sk)) return sk; return C.texMax && C.texMax('hangar') && hiKnown(plane) ? 'hi' : null; };
  let lastL = null, retry = null, looked = [], mine = new Set(), wantView = null;
  function show(L) {
    if (!can || !L || !L.plane) return;
    init();
    const skin = skinOf(L.plane), key = [L.plane, skin || '', L.items.map(([k, n]) => k + n).join(','), L.pod ? 1 : 0].join('|');
    if (want ? want.key === key : cur === key) return;
    want = { key, L, skin, plane: L.plane, asked: false }; wantT = performance.now(); retry = null; clearFocus();
    dirty = true;
  }
  const refresh = () => { const L = (want && want.L) || lastL; if (L) show(L); }; // кошелёк обновился: окраска сменилась - пересборка, нет - show ничего не делает
  const keyOf = (q) => (q.skin ? `${q.plane}@${q.skin}` : q.plane);
  const fullyHere = (q) => modelLoaded(keyOf(q)) && modelLoaded('hg_jack') && !q.L.items.some(([k]) => weaponPending(k) && !weaponFailed(k));
  function stepBuild() {
    if (!on) return;
    // показали замену, потому что нужная модель не успела: пришла - пересобрать
    if (retry && !want && fullyHere(retry)) { want = retry; retry = null; }
    if (!want) return;
    const now = performance.now();
    if (!want.asked) {
      if (now - wantT < PICK_WAIT && cur) return; // листают ленту - не качать каждый самолёт
      want.asked = true;
      if (!modelLoaded(keyOf(want))) mine.add(keyOf(want));
      if (want.skin) wantCamo(want.plane, want.skin); else wantModel(want.plane);
      wantModel('hg_jack'); for (const [k] of want.L.items) wantWeapon(k);
    }
    if (want.skin && modelFailed(keyOf(want))) { want.skin = null; want.asked = false; wantT = now - PICK_WAIT; return; } // файл с окраской или большими текстурами не пришёл - обычная модель
    const q = want, broke = modelFailed(q.plane) || modelFailed('hg_jack'), here = fullyHere(q);
    if (!here && !broke && now - wantT < MODEL_WAIT) return;
    const meta = planeMeta(q.plane); if (!meta) { want = null; return; }
    if (!hallReady(q)) return; // зал для этого самолёта ещё не пришёл - прежний самолёт стоит в прежнем зале
    const pm = planeModel(meta.side, classOf(q.L.items, AG), q.plane, q.skin); if (!pm) { if (now - wantT >= MODEL_WAIT) want = null; return; }
    const prev = cur && cur.split('|')[0];
    wantView = q.view; build(pm, q.L); cur = q.key; lastL = q.L; want = null; built = true; dirty = true;
    if (!here && !modelFailed(keyOf(q))) retry = q; // замена или простые фигуры оружия - на время
    // телефон: просмотренные в этом меню и загруженные ради ангара самолёты не копятся
    if (TOUCH && prev !== q.plane) { const kq = keyOf(q); looked = [kq, ...looked.filter((n) => n !== kq)]; for (const n of looked.slice(KEEP_LOOKED)) { looked = looked.filter((x) => x !== n); if (mine.has(n) && n !== kq) { mine.delete(n); releaseModel(n); } } }
  }
  // зал определяется размером самолёта; пока его картинка не загрузилась, стоит прежний зал. Не загрузилась совсем - самолёт в основном зале
  function hallReady(q) {
    if (q.view === undefined) { const m = anyModel(keyOf(q)) || anyModel(q.plane); let size = 10; if (m) { const b = new THREE.Box3().setFromObject(m), v = b.getSize(new THREE.Vector3()); size = Math.max(v.x, v.z); } q.view = size > BIG ? 'heavy' : 'fighter'; }
    const t = texOf(q.view); if (t.bad) { q.view = 'fighter'; return !!texOf('fighter').ok; }
    return t.ok;
  }

  function build(pm, L) {
    pivot.rotation.y = 0; holder.position.set(0, 0, 0); pivot.updateMatrixWorld(true); // размеры и лучи - в осях самолёта; поворот вернёт следующий кадр
    while (holder.children.length) holder.remove(holder.children[0]);
    while (jackG.children.length) jackG.remove(jackG.children[0]);
    groups = [];
    const obj = pm.obj; holder.add(obj); obj.position.set(0, 0, 0); pivot.updateMatrixWorld(true);
    const box0 = new THREE.Box3().setFromObject(obj), sz = box0.getSize(new THREE.Vector3());
    // подвеска - как в бою
    let oi = 0; const parts = obj.children.slice(), hung = [];
    for (const [key, n] of L.items.slice().sort((a, b) => AG[b[0]].mass - AG[a[0]].mass)) {
      for (let i = 0; i < n && oi < 8; i++) {
        const st = ST_ORDER[oi++], p = pm.stations[st]; if (!p) continue;
        const W0 = AG[key].vis || {}, m = pylonMesh(key, AG[key], C.weaponGeo, C.mats.wMat); m.position.set(p.x, p.y - (W0.hang ?? W0.r ?? 0.2) - 0.05, p.z); m.visible = !pm.internal; obj.add(m); if (pm.internal) continue; hung.push(m); // во внутренних отсеках не видно, как в бою
        let g = groups.find((x) => x.key === key); if (!g) groups.push(g = { key, pos: [] }); g.pos.push(m.position.clone());
      }
    }
    if (L.pod && pm.pod) { const m = podModel() || new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 2.4, 10).rotateX(Math.PI / 2), new THREE.MeshPhongMaterial({ color: 0x5a636c })); m.position.copy(pm.pod); obj.add(m); hung.push(m); } // как в бою: контейнер ещё не пришёл - простая фигура
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const size = Math.max(sz.x, sz.z), heavy = size > BIG;
    setView(wantView || (heavy ? 'heavy' : 'fighter'));
    // подъёмники: нос и две основные точки; опора - настоящий низ модели (луч снизу), мимо подвески
    const stores = hung.map((c) => new THREE.Box3().setFromObject(c).expandByScalar(0.16));
    const free = (x, zz) => !stores.some((b) => x > b.min.x && x < b.max.x && zz > b.min.z && zz < b.max.z);
    const ray = new THREE.Raycaster(); ray.far = 200;
    const under = (x, zz) => { ray.set(tmp.set(x, -60, zz), UP); const h = ray.intersectObjects(parts, true)[0]; return h ? h.point.y : null; };
    const L0 = box0.max.z - box0.min.z, xM0 = Math.max(1, Math.min(3.2, sz.x * 0.14)), pts = [];
    // Mark: опоры не должны сходиться в центре. Точки - от нужной к дальним: первая, где нет подвески и опора не намного выше самой низкой рядом (фюзеляж, а не крыло)
    const pick = (x0, z0, sign, xs) => { const c = []; for (let dz = 0; dz < 5; dz++) for (const kx of xs) { const x = x0 * kx, zz = z0 + sign * dz * L0 * 0.03; if (!free(x, zz)) continue; const y = under(x, zz); if (y != null) c.push([x, zz, y]); } if (!c.length) return null; const low = Math.min(...c.map((q) => q[2])); return c.find((q) => q[2] <= low + 0.45); };
    const KX = [1, 0.85, 0.7, 0.55, 1.2, 1.4];
    const nose = pick(0, box0.min.z + L0 * 0.18, 1, [1]) || pick(0, box0.min.z + L0 * 0.14, -1, [1]);
    const mL = pick(-xM0, box0.min.z + L0 * 0.64, -1, KX) || pick(-xM0, box0.min.z + L0 * 0.64, 1, KX), mR = mL ? [-mL[0], mL[1], under(-mL[0], mL[1]) ?? mL[2]] : null;
    for (const q of [nose, mL, mR]) if (q) pts.push(q);
    if (!mL) { const c = pick(0, box0.min.z + L0 * 0.68, -1, [1]) || pick(0, box0.min.z + L0 * 0.68, 1, [1]); if (c) pts.push(c); } // подвеска заняла всё под крылом - задняя опора на оси
    const jS = heavy ? 1.3 : 1, top = (JACK_TOP + JACK_HEAD) * jS, H = Math.max(-box.min.y + 0.3, ...pts.map((q) => top - q[2]), 1.2);
    holder.position.set(-(box0.min.x + box0.max.x) / 2, H, -(box0.min.z + box0.max.z) / 2); pivot.updateMatrixWorld(true);
    for (const [x, zz, y] of pts) {
      const j = anyModel('hg_jack'); if (!j) continue;
      if (!jackTint) { jackTint = true; j.traverse((o) => { if (o.isMesh && o.material && o.material.color && o.material.map) o.material.color.multiplyScalar(0.84); }); } // материал общий у копий: под тремя источниками жёлтый ярче, чем у сборщика
      const ram = j.getObjectByName('ram'), head = j.getObjectByName('head'), st = Math.max(0, Math.min(JACK_MAX, (H + y - top) / jS));
      if (ram) { ram.position.y = JACK_TOP; ram.scale.y = Math.max(0.001, st); } if (head) head.position.y = JACK_TOP + st;
      j.scale.setScalar(jS); j.position.set(x + holder.position.x, 0, zz + holder.position.z); jackG.add(j);
    }
    bakeShadow(obj, Math.max(sz.x, sz.z, box.max.z - box.min.z) * 0.62);
    baseZ = wantView === 'heavy' ? Math.max(1.12, Math.min(1.3, 50 / Math.max(size, 1))) : Math.max(1, Math.min(1.34, 23 / Math.max(size, 1))); // небольшой самолёт - крупнее; у большого запас, чтобы сдвинуть кадр от панели
    tAz = az; homeView();
  }
  function setView(key) {
    if (key === viewKey && texA) return;
    const T = texOf(key).tex;
    if (texA && key !== viewKey && texA !== T) { texB = T; fade = 0; } else texA = T;
    viewKey = key; V = VIEWS[key];
    cam.fov = V.fov; cam.near = V.near; cam.far = V.far; cam.position.fromArray(V.cam); cam.up.set(0, 1, 0); cam.lookAt(tmp.fromArray(V.look)); cam.updateMatrixWorld(true);
  }

  // тень на полу: вид сверху на самолёт, размытый силуэт (бумажный шарик не нужен: крылья и хвост читаются). Считается один раз на самолёт
  const blurMat = () => new THREE.ShaderMaterial({ uniforms: { t: { value: null }, d: { value: new THREE.Vector2() } }, depthTest: false, depthWrite: false, toneMapped: false,
    vertexShader: 'varying vec2 u; void main() { u = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'uniform sampler2D t; uniform vec2 d; varying vec2 u; void main() { float s = 0.0; s += texture2D(t, u - 4.0 * d).g * 0.05; s += texture2D(t, u - 3.0 * d).g * 0.09; s += texture2D(t, u - 2.0 * d).g * 0.12; s += texture2D(t, u - d).g * 0.15; s += texture2D(t, u).g * 0.18; s += texture2D(t, u + d).g * 0.15; s += texture2D(t, u + 2.0 * d).g * 0.12; s += texture2D(t, u + 3.0 * d).g * 0.09; s += texture2D(t, u + 4.0 * d).g * 0.05; gl_FragColor = vec4(s, s, s, 1.0); }' });
  let shA = null, shB = null, shM = null, jackBlob = null, jackTint = false, blobGeo = null;
  function bakeShadow(obj, E) {
    const N = 256, O = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true, stencilBuffer: false };
    if (!shA) { shA = new THREE.WebGLRenderTarget(N, N, O); shB = new THREE.WebGLRenderTarget(N, N, O); shM = blurMat(); }
    const sc = new THREE.Scene(), oc = new THREE.OrthographicCamera(-E, E, E, -E, 0.1, 200), par = holder.parent, wasAuto = renderer.autoClear, bgC = new THREE.Color(), bgA = renderer.getClearAlpha();
    renderer.getClearColor(bgC);
    oc.position.set(0, 100, 0); oc.up.set(0, 0, -1); oc.lookAt(0, 0, 0);
    sc.overrideMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, toneMapped: false });
    const saveTM = renderer.toneMapping; renderer.toneMapping = THREE.NoToneMapping;
    const rot = pivot.rotation.y; pivot.rotation.y = 0; sc.add(pivot); pivot.updateMatrixWorld(true);
    jackG.visible = false; if (shadow) shadow.visible = false;
    renderer.setClearColor(0x000000, 1); renderer.autoClear = true;
    renderer.setRenderTarget(shA); renderer.render(sc, oc);
    sc.remove(pivot); hs.add(pivot); pivot.rotation.y = rot; jackG.visible = true; sc.overrideMaterial = null;
    const qS = new THREE.Scene(), q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), shM); q.frustumCulled = false; qS.add(q); const R = 2.2 / N;
    for (const [a, b, dx, dy] of [[shA, shB, R, 0], [shB, shA, 0, R], [shA, shB, R * 1.8, 0], [shB, shA, 0, R * 1.8]]) { shM.uniforms.t.value = a.texture; shM.uniforms.d.value.set(dx, dy); renderer.setRenderTarget(b); renderer.render(qS, blitC); }
    renderer.setRenderTarget(null); renderer.setClearColor(bgC, bgA); renderer.autoClear = wasAuto; renderer.toneMapping = saveTM;
    q.geometry.dispose();
    if (!shadow) { shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x24231f, alphaMap: shA.texture, transparent: true, opacity: 0.86, depthWrite: false, toneMapped: false })); shadow.renderOrder = -10; pivot.add(shadow); }
    shadow.visible = true; shadow.scale.set(E * 2, 1, E * 2); shadow.position.set(0, 0.015, 0);
    // пятна под основаниями подъёмников
    if (!jackBlob) { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 6, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,.8)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); jackBlob = new THREE.MeshBasicMaterial({ color: 0x1c1b18, map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, toneMapped: false }); }
    if (!blobGeo) blobGeo = BLOB_GEO();
    for (const j of jackG.children.slice()) { const b = new THREE.Mesh(blobGeo, jackBlob); b.position.set(j.position.x, 0.02, j.position.z); b.renderOrder = -9; jackG.add(b); }
  }

  // ── приблизить к оружию ─────────────────────────────────
  // обычный вид: крупнее для небольшого самолёта и по центру свободной части экрана (справа панель)
  function homeView() {
    focusKey = null; tZ = baseZ;
    const W = C.VW || innerWidth, s = Math.max(W / FULL_W, (C.VH || innerHeight) / FULL_H) * tZ;
    tCx = 0.5 + (panelW() / 2) / (s * FULL_W); tCy = 0.5 + 0.012; dirty = true;
  }
  function clearFocus() { homeView(); }
  function focusWeapon(key) {
    const g = groups.find((x) => x.key === key); if (!g) return false;
    if (focusKey === key) { clearFocus(); return false; }
    focusKey = key;
    const c = Math.cos(az), sn = Math.sin(az), w = tmp.copy(g.pos.slice().sort((a, b) => (-b.x * sn + b.z * c) - (-a.x * sn + a.z * c))[0]); // ближняя к камере точка этого оружия
    pivot.rotation.y = az; pivot.updateMatrixWorld(true); holder.children[0].localToWorld(w);
    cam.clearViewOffset(); cam.aspect = FULL_W / FULL_H; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true); w.project(cam);
    tZ = baseZ * (viewKey === 'heavy' ? 2.3 : 1.75);
    const W = C.VW || innerWidth, s = Math.max(W / FULL_W, (C.VH || innerHeight) / FULL_H) * tZ, fullW = s * FULL_W;
    tCx = (w.x + 1) / 2 + (panelW() / 2) / fullW; tCy = (w.y + 1) / 2;
    dirty = true; return true;
  }

  // ── палец и мышь ────────────────────────────────────────
  const inUi = (e) => e.target && e.target.closest && e.target.closest('button,a,input,select,.mpanel,.msheet,#hgStrip,.mrail,#mbtns,#ratWin,#shopWin');
  function listen() {
    const el = document.getElementById('menu');
    panelW = () => { if (!document.body.classList.contains('mpOpen') || innerWidth <= innerHeight) return 0; /* вертикально панель снизу */ const p = el.querySelector('.mpanel'); return p ? p.getBoundingClientRect().width : 0; };
    el.addEventListener('click', (e) => { if (!on || inUi(e) || !focusKey) return; clearFocus(); if (C.menu && C.menu.render) C.menu.render(); }); // нажатие мимо панелей - обратно к самолёту целиком
    el.addEventListener('wheel', (e) => { if (!on || inUi(e)) return; e.preventDefault(); tZ = Math.max(baseZ, Math.min(baseZ * 2, tZ * (e.deltaY > 0 ? 0.93 : 1.08))); dirty = true; }, { passive: false });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) dirty = true; });
  }

  // ── кадр ────────────────────────────────────────────────
  const near = (a, b, e = 0.0008) => Math.abs(a - b) < e;
  const settled = () => near(az, tAz, 0.001) && near(z, tZ) && near(cx, tCx) && near(cy, tCy) && Math.abs(vel) < 0.0004 && fade >= 1;
  function paint() {
    if (!on || !inited) return;
    stepBuild();
        const k = 0.2, T0 = TEX[viewKey]; if (!T0 || !T0.ok) return; // зал ещё грузится
    if (!settled()) { az += (tAz - az) * k; z += (tZ - z) * k; cx += (tCx - cx) * k; cy += (tCy - cy) * k; if (fade < 1) fade = Math.min(1, fade + 0.09); dirty = true; }
    if (texB && fade >= 1) { texA = texB; texB = null; }
    if (!dirty || !texA) return; dirty = false; nFrames++;
    const W = C.VW || innerWidth, H = C.VH || innerHeight, s = Math.max(W / FULL_W, H / FULL_H) * z, fullW = s * FULL_W, fullH = s * FULL_H;
    hw = W / (2 * fullW); hh = H / (2 * fullH);
    const X = Math.max(hw, Math.min(1 - hw, cx)), Y = Math.max(hh, Math.min(1 - hh, cy));
    cam.aspect = FULL_W / FULL_H; cam.setViewOffset(fullW, fullH, (X - hw) * fullW, (1 - Y - hh) * fullH, W, H);
    const U = bg.material.uniforms; U.a.value = texA; U.b.value = texB; U.t.value = texB ? fade : 0; U.win.value.set(X, Y, hw, hh); U.bias.value = Math.min(2.6, Math.max(0, z / baseZ - 1.05) * 2);
    pivot.rotation.y = az;
    ensureRT();
    const tm = renderer.toneMapping, ac = renderer.autoClear; renderer.toneMapping = THREE.NoToneMapping; renderer.autoClear = true; // как у фона: без тонового сжатия боя
    renderer.setRenderTarget(rt); renderer.render(hs, cam);
    renderer.setRenderTarget(null); renderer.render(blitS, blitC);
    renderer.toneMapping = tm; renderer.autoClear = ac;
  }

  return {
    has: () => can,
    sim: false, idle: () => true, skip3D: () => true,
    busy: () => on && (dirty || !!want || !settled()),
    ready: () => !can || (!!built && !!texA && !!TEX[viewKey] && !!TEX[viewKey].ok && !want),
    start() {
      init(); on = true; dirty = true;
      document.body.classList.add('hgOn');
      const old = document.getElementById('menuBg'); if (old) old.style.display = 'none';
      C.snd.ambient(true, C.setup.game);
      if (!texA) setView(viewKey);
    },
    stop() {
      on = false; mine.clear(); looked = []; document.body.classList.remove('hgOn', 'hgAir'); // с этого боя все загруженные модели - его, не освобождать
      C.snd.ambient(false);
      if (rt) { rt.dispose(); rt = null; rtW = rtH = 0; } // бою память нужнее; вернёмся в меню - создадим заново
      for (const k in TEX) if (TEX[k].tex) TEX[k].tex.dispose();
      dirty = true;
    },
    modeChanged() { C.snd.ambient(true, C.setup.game); },
    resize() { dirty = true; if (!focusKey) homeView(); },
    paint, show, refresh, focusWeapon, clearFocus, focused: () => focusKey, panelChanged() { if (!focusKey) homeView(); },
    frames: () => nFrames, // сколько кадров посчитано: в покое не растёт (проверка нагрева)
    stat: () => ({ jacks: jackG ? jackG.children.filter((c) => c.getObjectByName && c.getObjectByName('ram')).length : 0, maxSt: jackG ? Math.max(0, ...jackG.children.map((c) => { const r = c.getObjectByName && c.getObjectByName('ram'); return r ? r.scale.y : 0; })) : 0, H: holder ? holder.position.y : 0, view: viewKey, gap: jackG ? (() => { const J = jackG.children.filter((c) => c.getObjectByName && c.getObjectByName('ram')); let g = 99; for (let a = 0; a < J.length; a++) for (let b = a + 1; b < J.length; b++) g = Math.min(g, Math.hypot(J[a].position.x - J[b].position.x, J[a].position.z - J[b].position.z)); return g; })() : 0 }), // стенд: сколько подъёмников, ход и наименьшее расстояние между ними
    update() {}, camera() {}, hud() {}, focus: () => C.camera.position,
  };
}
