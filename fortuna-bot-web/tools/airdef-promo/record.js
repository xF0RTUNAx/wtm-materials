// Промо-ролик «Воздушного превосходства» → media/airdef_promo.mp4 (сайт: экран входа, «Фарм», карточка аркады).
// Без подписей: красота и возможности игры — город вблизи (готовые модели домов, деревьев, ЛЭП, фонарей, автоматов),
// ударная авиация, пуски ЗРК и перехват, пуски ракет и бомб с их моделями, настоящий геймплей с интерфейсом, ловушки,
// подбитый самолёт. Графика — ?gfx=cinema (дома и деревья готовыми моделями на километры вокруг). Самолёты в кадре летят
// по сценарию (a.script в sim/raid.js), пуски — по команде (S.launch / S.release).
//
// Порядок записи (кадры по одному с шагом 1/30 с, игра в это время стоит):
//  1. deno run --allow-net --allow-write fortuna-bot-web/tools/airdef-promo/frame-server.ts <папка>   (приёмник кадров, порт 8937)
//  2. окно 1280×720 (буфер ×2 = 2560×1440), две страницы — по погоде сцен (WEATHER ниже):
//       games/airdef.html?test=1&gfx=cinema&weather=sunset   → record({ weather: 'sunset' })
//       games/airdef.html?test=1&gfx=cinema&weather=day      → record({ weather: 'day' })
//     в консоли: const m = await import('/fortuna-bot-web/tools/airdef-promo/record.js?v=…'); m.record({ weather: … })
//     (window.__rec — сколько кадров, __recDone — конец). Номер кадра = место сцены в ORDER × 1000 + кадр — проходы с разной
//     погодой складываются в один порядок сами.
//  3. python3 fortuna-bot-web/tools/airdef-promo/encode.py <папка кадров> fortuna-bot-web/media   (растворы между сценами,
//     1280×720, постер airdef_promo.jpg)
/* global THREE */
const FPS = 30;
// порядок в ролике (номер сцены = место × 1000 в номерах кадров) и погода сцены
export const ORDER = ['open', 'flyby', 'city1', 's400', 'w_umpk', 'patriot', 'city2', 'w_harm', 'tor', 'w_gbu', 'game', 'city3', 'w_kh29', 'flares', 'burn', 'final'];
export const WEATHER = { open: 'sunset', flyby: 'sunset', city1: 'day', city3: 'sunset', flares: 'sunset', burn: 'sunset', final: 'sunset',
  s400: 'day', w_umpk: 'day', patriot: 'day', city2: 'day', w_harm: 'day', tor: 'day', w_gbu: 'day', game: 'day', w_kh29: 'day' };

export async function record({ weather = null, only = null, host = 'http://127.0.0.1:8937', preview = 0, frames: frameLimit = 0 } = {}) {
  const C = window.__a, V = THREE.Vector3, cam = C.camera, city = C.city;
  const ver = verOf();
  const { spotNear, freeGround } = await import(`/fortuna-bot-web/games/airdef/mission.js?v=${ver}`);
  const { riverX, mulberry32, zoneAt, ZONE, CITY } = await import(`/fortuna-bot-web/games/airdef/city.js?v=${ver}`);
  window.requestAnimationFrame = () => 0;
  for (const id of ['perf', 'touch', 'msg', 'promoNav']) { const e = document.getElementById(id); if (e) e.style.visibility = 'hidden'; }
  let now = performance.now() + 1e6;
  const st = { tick: null, cam: null, focus: new V(), skip: false, near: 0, hud: false };
  C.ctrls.promo = { sim: true, start() {}, stop() {}, update(dt) { if (st.tick) st.tick(dt); }, camera(dt) { if (st.cam) st.cam(dt); },
    hud() {}, focus: () => st.focus, skip3D: () => st.skip, near: () => st.near };
  const promoMode = () => { C.start('promo'); document.getElementById('hud').style.display = 'none'; document.body.classList.remove('flying'); };
  promoMode();
  const adv = (n = 1) => { for (let i = 0; i < n; i++) window.__frame(now += 1000 / FPS); };
  const skip = (sec, until) => { st.skip = true; for (let i = 0; i < sec * FPS; i++) { adv(); if (until && until()) break; } st.skip = false; };

  // ── кадр: 3D; в геймплейных сценах — поверх интерфейс игры (холст HUD, СПО, окно контейнера, панель, предупреждения) ──
  const gl = document.getElementById('c'), oc = document.createElement('canvas'), ox = oc.getContext('2d');
  let n = 0, sceneNo = 0; window.__rec = 0; window.__recDone = false;
  function paintText(root, k) { // текст DOM-элемента — по его же раскладке (шрифт, цвет, место строки)
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let t;
    while ((t = tw.nextNode())) {
      if (!t.textContent.trim()) continue;
      const el = t.parentElement, cs = getComputedStyle(el); let op = 1;
      for (let e = el; e && e !== root.parentElement; e = e.parentElement) op *= +getComputedStyle(e).opacity || 1;
      const rg = document.createRange(); rg.selectNodeContents(t); const r = rg.getBoundingClientRect(); if (!r.width) continue;
      const fs = parseFloat(cs.fontSize);
      ox.globalAlpha = op; ox.font = `${cs.fontWeight} ${fs * k}px ${cs.fontFamily}`; ox.fillStyle = cs.color; ox.textAlign = 'left'; ox.textBaseline = 'middle';
      ox.shadowColor = 'rgba(0,0,0,.85)'; ox.shadowBlur = 5 * k; ox.fillText(t.textContent.replace(/\s+/g, ' ').trim(), r.left * k, (r.top + r.height / 2) * k);
    }
    ox.globalAlpha = 1; ox.shadowBlur = 0;
  }
  function paintHud() {
    const k = oc.width / innerWidth, $ = (id) => document.getElementById(id), rr = (r) => [r.left * k, r.top * k, r.width * k, r.height * k];
    ox.drawImage($('hudc'), 0, 0, oc.width, oc.height);
    const pb = $('podBox');
    if (pb && pb.style.display === 'block') {
      const [x, y, w, h] = rr(pb.getBoundingClientRect());
      ox.save(); ox.filter = 'grayscale(1) contrast(1.35) brightness(1.05)'; ox.drawImage(oc, x, y, w, h, x, y, w, h); ox.restore();
      ox.strokeStyle = 'rgba(160,255,190,.6)'; ox.lineWidth = 1.5 * k; ox.strokeRect(x, y, w, h);
      const cx = x + w / 2, cy = y + h / 2, s = 23 * k; ox.strokeStyle = pb.classList.contains('locked') ? '#fde047' : 'rgba(255,255,255,.85)';
      ox.strokeRect(cx - s, cy - s, 2 * s, 2 * s); ox.beginPath(); ox.moveTo(cx, cy - s - 14 * k); ox.lineTo(cx, cy + s + 14 * k); ox.moveTo(cx - s - 14 * k, cy); ox.lineTo(cx + s + 14 * k, cy); ox.stroke();
      paintText(pb, k);
    }
    const rw = $('rwr'); { const [x, y, w, h] = rr(rw.getBoundingClientRect()); ox.drawImage(rw, x, y, w, h); }
    const wp = $('wpn'), [x, y, w, h] = rr(wp.getBoundingClientRect());
    ox.fillStyle = 'rgba(0,20,10,.35)'; ox.strokeStyle = 'rgba(140,255,170,.25)'; ox.lineWidth = 1 * k;
    ox.beginPath(); ox.roundRect(x, y, w, h, 8 * k); ox.fill(); ox.stroke(); paintText(wp, k);
    for (const id of ['warn', 'msg']) { const e = $(id); if (e.style.display === 'block' && e.textContent) paintText(e, k); }
  }
  async function snap() {
    if (oc.width !== gl.width) { oc.width = gl.width; oc.height = gl.height; }
    ox.drawImage(gl, 0, 0); if (st.hud) paintHud();
    if (!preview || n % preview === 0) {
      const b = await new Promise((r) => oc.toBlob(r, 'image/jpeg', 0.93));
      await fetch(`${host}/?n=f${String(sceneNo * 1000 + n).padStart(5, '0')}`, { method: 'POST', body: b }).catch(() => {});
    }
    n++; window.__rec++;
  }
  async function shoot(frames) {
    if (frameLimit) frames = Math.min(frames, frameLimit);
    for (let i = 0; i < frames; i++) { st.i = i; st.t = i / FPS; adv(); await snap(); }
  }

  // ── помощники постановки ──
  const rnd = mulberry32(20261009);
  function battle(defSide = 'east', era = 4) {
    const S = C.newBattle({ defSide, era, rnd });
    C.hooks = { samLaunch: () => {}, planeDown: (a) => { st.down = a; } };
    st.down = null; return S;
  }
  const ground = (x, z) => city.groundH(x, z), top = (x, z) => city.topAt(x, z);
  // самолёт по сценарию: курс yaw, высота — не ниже pos.y и не ниже крыш впереди + 60 м (иначе — в высотку); plane — модель
  // подвеска на пилонах (модели оружия): у каждого самолёта — своя
  const LOAD = { su30: [['fab500', 2], ['kh29t', 2]], f18: [['gbu12', 2], ['agm88', 2]], f16: [['gbu12', 2], ['agm65b', 2]], mig29: [['kh31p', 2]] };
  function plane(side, planeKey, pos, yaw, speed = 250, fn = null, hp = 1e6, load = null) {
    const a = C.raid.spawn('bomber', C.S.objects[0], 0, 0);
    a.plane = planeKey; a.side = side; a.pos.copy(pos); a.yaw = yaw; a.pitch = 0; a.roll = 0; a.q = null; a.speed = speed; a.hp = a.hpMax = hp;
    a.load = (load || LOAD[planeKey] || []).map(([key, n]) => ({ key, n }));
    const F = new V(-Math.sin(yaw), 0, -Math.cos(yaw)); a.vel.copy(F).multiplyScalar(speed);
    const D = new V();
    a.script = fn || ((p, dt, fly) => {
      let want = pos.y; for (const L of [150, 400, 800]) want = Math.max(want, top(p.pos.x + F.x * L, p.pos.z + F.z * L) + 60);
      D.copy(F); D.y = THREE.MathUtils.clamp((want - p.pos.y) / 350, -0.25, 0.35); fly(p, D.normalize(), dt); p.ab = true; p.thr = 1;
    });
    return a;
  }
  const fwd = (a, out = new V()) => out.set(-Math.sin(a.yaw) * Math.cos(a.pitch), Math.sin(a.pitch), -Math.cos(a.yaw) * Math.cos(a.pitch));
  const look = new V(), cpos = new V(), DV = new V(); // DV — сдвиг взгляда за ракетой (ограничен: пусковая остаётся в кадре)
  const setCam = (p, l, fov = 55) => { if (C.camera.fov !== fov) C.setFov(fov); cam.position.copy(p); cam.up.set(0, 1, 0); cam.lookAt(l); st.focus.copy(l); };
  const obj = (key) => C.S.objects.find((o) => o.key === key) || C.S.objects[0];
  const ease = (t) => t * t * (3 - 2 * t);
  // отрезок улицы (вдоль Z на линии X, шаг линий step) длиной len с наибольшим числом домов вида kind в полосе ±band
  function densest(kind, step, len, band) {
    const B = city.B, xs = [], zs = []; let best = [0, 0], bc = -1;
    for (let i = 0; i < B.n; i++) if (B.k[i] === kind && B.y0[i] === 0) { xs.push(B.x[i]); zs.push(B.z[i]); }
    for (let X = -12000; X <= 12000; X += step) {
      const zz = zs.filter((z, i) => Math.abs(xs[i] - X) < band).sort((p, q) => p - q);
      for (let a = 0, b = 0; a < zz.length; a++) { while (b < zz.length && zz[b] < zz[a] + len) b++; if (b - a > bc) { bc = b - a; best = [X, zz[a] - 20]; } }
    }
    return best;
  }
  // ЗРК: захват назначенной цели в пре-ролле, пуск по команде (повтор, пока пусковая не готова)
  async function samLaunch(key, x, z, T, camFn, frames, at = 10) {
    const u = C.S.addUnit(key, x, z, { skill: 1 }); C.syncUnits();
    C.S.setManual(u, true); C.S.designate(u, T); u.emit = true;
    skip(30, () => u.track && C.S.launcherReady(u)); // захват есть и пусковая уже довернулась на цель
    st.near = 0.4; let m = null, mt = 0;
    st.tick = () => { if (st.i >= at && !m) { const r = C.S.launch(u); (window.__lr = window.__lr || []).push([key, st.i, r, !!u.track]); if (!r) { m = C.S.sams[C.S.sams.length - 1]; mt = st.t; } } }; // __lr — почему не пускает (отладка)
    st.cam = () => camFn(u, m, mt);
    await shoot(frames);
    st.tick = null; st.near = 0;
    return { u, m };
  }
  // пуск ракеты / сброс бомбы крупно: камера у крыла, после схода — за оружием (видна его модель)
  async function weaponShot(side, planeKey, key, opts, frames = 70, count = 1) {
    battle(side === 'east' ? 'west' : 'east', 4);
    const a = plane(side, planeKey, new V(-1200, 1000, 4200), 0.7, 240, null, 1e6, [[key, Math.max(2, count)]]); // над спальными районами к Сити
    const o = typeof opts === 'function' ? opts(a) : opts;
    skip(0.5);
    const F = new V(), R = new V(); let rel = 0;
    st.near = 0.5;
    // сход с пилона: подвеска на модели убывает, оружие стартует с места своего пилона
    st.tick = () => {
      if (rel >= count || st.i < 16 + rel * 8) return;
      const L = a.load[0]; L.n--; C.S.release(a, key, o); rel++;
      const w = C.S.wpns[C.S.wpns.length - 1], g = C.planeMeshes.get(a.id), h = g && g.userData.hung && g.userData.hung.find((q) => q.l === L && q.k === L.n);
      if (w && h) { h.m.getWorldPosition(w.pos); w.pos.y -= 0.3; }
    };
    // камера едет вместе с самолётом: сбоку, ниже и чуть впереди крыла — сход и уход оружия крупно, под ними — город
    st.cam = () => { fwd(a, F); R.set(Math.cos(a.yaw), 0, -Math.sin(a.yaw)); cpos.copy(a.pos).addScaledVector(R, 14).addScaledVector(F, 3).y -= 5; look.copy(a.pos).addScaledVector(F, -3).y -= 6; setCam(cpos, look, 52); };
    await shoot(frames);
    st.tick = null; st.near = 0;
  }

  // ═════════════ Сцены ═════════════
  const SCENES = {
    // Город с реки на закате: кран вперёд и вверх, над камерой проходит пара Су-30 в сторону Сити
    async open() {
      battle('west', 4);
      const z0 = 3600, z1 = 2700, x0 = riverX(z0), x1 = riverX(z1), g0 = ground(x0, z0);
      const P0 = new V(x0, g0 + 34, z0), P1 = new V(x1, g0 + 110, z1), L = new V(riverX(-4000), g0 + 150, -4000);
      const yaw = Math.atan2(-(L.x - x0), -(L.z - z0)), F = new V(-Math.sin(yaw), 0, -Math.cos(yaw)), R = new V(Math.cos(yaw), 0, -Math.sin(yaw));
      plane('east', 'su30', P0.clone().addScaledVector(F, -240).addScaledVector(R, 24).setY(g0 + 70), yaw, 330);
      plane('east', 'su30', P0.clone().addScaledVector(F, -310).addScaledVector(R, -32).setY(g0 + 82), yaw, 330);
      st.cam = () => { const t = ease(Math.min(1, st.t / 5)); cpos.lerpVectors(P0, P1, t); look.copy(L); setCam(cpos, look, 54); };
      await shoot(150);
    },
    // Низкий пролёт пары F/A-18 над спальным районом: камера на крыше
    async flyby() {
      battle('east', 4);
      const B = city.B; let i0 = 0;
      for (let k = 0; k < 4000; k++) { const i = Math.floor(rnd() * B.n); if (B.k[i] === 1 && B.h[i] > 25 && B.h[i] < 50 && Math.hypot(B.x[i], B.z[i]) < 9000 && Math.hypot(B.x[i], B.z[i]) > 3000) { i0 = i; break; } }
      const roof = top(B.x[i0], B.z[i0]), yaw = 0.35, F = new V(-Math.sin(yaw), 0, -Math.cos(yaw)), R = new V(Math.cos(yaw), 0, -Math.sin(yaw));
      const cp = new V(B.x[i0], roof + 6, B.z[i0]), h = roof + 70;
      const p0 = cp.clone().addScaledVector(F, -470).addScaledVector(R, 55); p0.y = h;
      const a = plane('west', 'f18', p0, yaw, 255), b = plane('west', 'f18', p0.clone().addScaledVector(F, -90).addScaledVector(R, 45).setY(h + 12), yaw, 255);
      st.cam = () => { look.copy(a.pos).lerp(b.pos, 0.3); setCam(cp, look, 50); };
      await shoot(95);
    },
    // Проспект спального района: камера на тротуаре у домов едет вдоль — фонари с проводами, панельки, деревья, автоматы
    async city1() {
      battle('east', 4);
      const [X, Z0] = densest(1, CITY.GRID * CITY.AVE_EVERY, 500, 140); // панельки вдоль проспекта (на проспектах — фонари с проводами)
      st.near = 0.5;
      st.cam = () => { const z = Z0 + 60 + st.t * 8, g = ground(X + 27, z); cpos.set(X + 27, g + 5, z); look.set(X + 55, g + 12, z + 80); setCam(cpos, look, 62); };
      await shoot(105); st.near = 0;
    },
    // С-400: «холодный» старт сзади-сбоку
    async s400() {
      battle('west', 4);
      const [x, z] = spotNear(city, rnd, -2500, 3500, 0, 2500, false);
      const T = plane('west', 'f16', new V(x + 9000, 1600, z - 15000), Math.atan2(3000, -15000), 240);
      const brg = Math.atan2(T.pos.x - x, T.pos.z - z), sx = Math.sin(brg), sz = Math.cos(brg);
      const cp = new V(x - sx * 15 + sz * 13, 0, z - sz * 15 - sx * 13); cp.y = Math.max(ground(cp.x, cp.z) + 2.4, top(cp.x, cp.z) + 1.4);
      const dv = new V(); // камера чуть поворачивается за ракетой (взгляд смещается не больше чем на 8 м) — пусковая остаётся в кадре
      await samLaunch('s400', x, z, T, (u, m, mt) => { look.copy(u.pos).y += 4.5; if (m && !m.dead) { dv.copy(m.pos).sub(look); if (dv.length() > 8) dv.setLength(8); look.addScaledVector(dv, Math.min(1, Math.max(0, (st.t - mt - 0.6) / 1.5))); } setCam(cp, look, 50); }, 80);
    },
    // ФАБ-500 с УМПК: сход с Су-30, раскрытие крыльев
    async w_umpk() { await weaponShot('east', 'su30', 'umpk', (a) => ({ aim: a.pos.clone().add(new V(-Math.sin(a.yaw) * 30000, -2200, -Math.cos(a.yaw) * 30000)) }), 72); },
    // Patriot: пуск из наклонного контейнера, вид сзади-сбоку
    async patriot() {
      battle('east', 4);
      // открытое место: вокруг пусковой и камеры — без домов на 45 м, между ними и в сторону цели — прямая видимость
      let x = 6000, z = -2000, cp = new V(), T0 = new V(-8000, 2600, 9000);
      for (let k = 0; k < 400; k++) {
        const [cx, cz] = spotNear(city, rnd, 6000, -2000, 0, 4000, false); if (!freeGround(city, cx, cz, 45)) continue;
        const b = Math.atan2(T0.x, T0.z), c = new V(cx - Math.sin(b) * 26 + Math.cos(b) * 14, 0, cz - Math.cos(b) * 26 - Math.sin(b) * 14);
        c.y = ground(c.x, c.z) + 3.5; const gy = ground(cx, cz);
        if (!freeGround(city, c.x, c.z, 20) || !city.los(c.x, c.y, c.z, cx, gy + 3, cz, 2) || !city.los(cx, gy + 6, cz, cx + Math.sin(b) * 600, gy + 220, cz + Math.cos(b) * 600, 4)) continue;
        x = cx; z = cz; cp = c; break;
      }
      const T = plane('east', 'su30', new V(x - 8000, 2600, z + 9000), Math.atan2(-(4000), -(-9000)), 240);
      if (!cp.y) { const brg = Math.atan2(T.pos.x - x, T.pos.z - z); cp.set(x - Math.sin(brg) * 26 + Math.cos(brg) * 14, 0, z - Math.cos(brg) * 26 - Math.sin(brg) * 14); cp.y = Math.max(ground(cp.x, cp.z) + 3.5, top(cp.x, cp.z) + 1.6); }
      await samLaunch('pac3', x, z, T, (u, m, mt) => { look.copy(u.pos).y += 3; if (m && !m.dead) { DV.copy(m.pos).sub(look); if (DV.length() > 9) DV.setLength(9); look.addScaledVector(DV, Math.min(1, Math.max(0, (st.t - mt - 0.3) / 1.2))); } setCam(cp, look, 52); }, 58, 15);
    },
    // Панельный район днём: дрон над дворами — дома, деревья, автоматы, баки, фонари
    async city2() {
      battle('east', 4);
      const [X, Z0] = densest(1, CITY.GRID, 500, 220); // панельки вдоль улицы
      st.cam = () => { const z = Z0 + st.t * 12, gy = ground(X, z); cpos.set(X + 60, gy + 42, z); look.set(X - 80, gy + 2, z + 170); setCam(cpos, look, 60); };
      await shoot(100);
    },
    // HARM с F/A-18 по излучающей РЛС впереди
    async w_harm() {
      await weaponShot('west', 'f18', 'agm88', (a) => {
        const F = new V(-Math.sin(a.yaw), 0, -Math.cos(a.yaw)), p = a.pos.clone().addScaledVector(F, 30000);
        const u = C.S.addUnit('s300', p.x, p.z, { skill: 0 }); u.emit = true; return { target: u };
      }, 70);
    },
    // «Тор-М2»: вертикальный пуск, камера снизу у земли
    async tor() {
      battle('west', 4);
      const [x, z] = spotNear(city, rnd, -6000, -4000, 0, 2500, false);
      const T = plane('west', 'f18', new V(x + 6000, 1800, z + 5000), Math.atan2(-(-6000), -(-5000)), 230);
      const brg = Math.atan2(T.pos.x - x, T.pos.z - z), sx = Math.cos(brg), sz = -Math.sin(brg);
      const cp = new V(x + sx * 16 - Math.sin(brg) * 8, 0, z + sz * 16 - Math.cos(brg) * 8); cp.y = Math.max(ground(cp.x, cp.z) + 1.4, top(cp.x, cp.z) + 1.2);
      await samLaunch('torm2', x, z, T, (u, m, mt) => { look.copy(u.pos).y += 4; if (m && !m.dead) { DV.copy(m.pos).sub(look); if (DV.length() > 12) DV.setLength(12); look.addScaledVector(DV, Math.min(1, Math.max(0, (st.t - mt - 0.2) / 1))); } setCam(cp, look, 56); }, 55);
    },
    // пара GBU-12 с F-16
    async w_gbu() { await weaponShot('west', 'f16', 'gbu12', {}, 72, 2); },
    // геймплей: настоящий вылет с интерфейсом — метки целей и ПВО, СПО, прицел, окно контейнера; «АВТО» сбрасывает,
    // после сброса — камера за бомбой (как клавиша N в игре)
    async game() {
      const air = C.ctrls.air; Object.assign(C.setup, { side: 'east', era: 3, diff: 'arcade' });
      battle('east', 3);
      const tgt = obj('oil'), yaw = 0.5, F = new V(-Math.sin(yaw), 0, -Math.cos(yaw));
      const sp = new V(tgt.x, 0, tgt.z).addScaledVector(F, -9500);
      C.ctrl = air; air.start({ items: [['gbu12', 4], ['agm88', 2]], pod: true, side: 'west', plane: 'f18', targets: ['oil', 'tpp'], spawn: { x: sp.x, y: 2400, z: sp.z, yaw }, invuln: true, noEnd: true, noIntro: true });
      C.resize(); const hud = document.getElementById('hud'); hud.style.display = 'block'; hud.style.visibility = 'hidden';
      C.setAuto(true); air.pod.show = true; air.skip3D = () => st.skip;
      skip(20, () => air.pod.lock && air.craft.pos.distanceTo(new V(tgt.x, 0, tgt.z)) < 6200);
      st.hud = true; let camW = false;
      for (let i = 0; i < (frameLimit || 165); i++) {
        if (!camW && i > 40 && C.S.wpns.some((w) => w.owner === air.craft)) { camW = true; air.onKey({ code: 'KeyN', repeat: false, preventDefault() {} }, true); air.onKey({ code: 'KeyN' }, false); }
        st.i = i; adv(); await snap();
      }
      st.hud = false; delete air.skip3D; C.setAuto(false); air.stop(); hud.style.visibility = ''; promoMode();
    },
    // Парк у Сити на закате: кран из-за деревьев вверх, открывается панорама высоток
    async city3() {
      battle('west', 4);
      let P = null, bd = 1e12;
      for (let x = -6000; x <= 6000; x += 100) for (let z = -6000; z <= 6000; z += 100) if (zoneAt(x, z) === ZONE.PARK && city.bldAt(x, z) <= 0) { const d = Math.hypot(x, z); if (d > 1500 && d < bd) { bd = d; P = new V(x, 0, z); } }
      P = P || new V(2000, 0, 2000);
      const dir = new V(-P.x, 0, -P.z).normalize(), gy = ground(P.x, P.z);
      st.near = 0.5;
      st.cam = () => { const t = ease(Math.min(1, st.t / 3.6)); cpos.copy(P).addScaledVector(dir, -40 + t * 60); cpos.y = gy + 5 + t * 85; look.copy(P).addScaledVector(dir, 1500); look.y = gy + 60 + t * 60; setCam(cpos, look, 55); };
      await shoot(110); st.near = 0;
    },
    // Х-29Т с Су-30
    async w_kh29() { await weaponShot('east', 'su30', 'kh29t', (a) => ({ aim: a.pos.clone().add(new V(-Math.sin(a.yaw) * 9000, -2200, -Math.cos(a.yaw) * 9000)) }), 66); },
    // Ловушки: облёт Су-30 в вираже, пачки ЛТЦ и диполей
    async flares() {
      battle('west', 4);
      const a = plane('east', 'su30', new V(2000, 2600, 2000), 2.2, 250, (p, dt, fly) => { const D = fwd(p); D.addScaledVector(new V(Math.cos(p.yaw), 0, -Math.sin(p.yaw)), 0.12).normalize(); D.y = 0.03; fly(p, D.normalize(), dt, 3); p.ab = true; p.thr = 1; });
      skip(1.5);
      st.tick = () => { if (st.i % 6 === 0 && st.i > 10 && st.i < 90) { C.S.dropCM(a, 'flare'); C.S.dropCM(a, 'chaff'); } };
      st.near = 1.5;
      st.cam = () => { const g = 2.6 + st.t * 0.45; cpos.set(a.pos.x + Math.sin(g) * 34, a.pos.y + 6, a.pos.z + Math.cos(g) * 34); look.copy(a.pos); setCam(cpos, look, 50); };
      await shoot(100); st.tick = null; st.near = 0;
    },
    // Подбитый F-16: шлейф дыма, затем взрыв
    async burn() {
      battle('east', 4);
      const a = plane('west', 'f16', new V(-4000, 1500, 8000), -0.6, 240, (p, dt, fly) => { const D = fwd(p); D.y = -0.16; fly(p, D.normalize(), dt, 1.2); p.thr = 0.6; });
      a.hp = a.hpMax = 100; C.raid.hurt(a, 62); // > 50 % — горит
      skip(1);
      const off = new V(); st.near = 1.5;
      st.cam = () => { if (!a.dead) { fwd(a, off); cpos.copy(a.pos).addScaledVector(off, -40).add(new V(-off.z * 19, 8, off.x * 19)); look.copy(a.pos).addScaledVector(off, 30); } setCam(cpos, look, 50); };
      st.tick = () => { if (st.i === 72 && !a.dead) C.raid.hurt(a, 100); };
      await shoot(105); st.tick = null; st.near = 0;
    },
    // Финал: общий план города на закате, дымы пожаров
    async final() {
      battle('west', 4);
      const c = new V(0, 0, 0), R = 4300, g0 = 2.2;
      for (const [k, sd] of [[0.35, -900], [0.5, 700], [0.62, -200], [0.75, 1300]]) {
        const p = new V(Math.sin(g0) * R * (1 - k), 0, Math.cos(g0) * R * (1 - k)).add(new V(Math.cos(g0) * sd, 0, -Math.sin(g0) * sd)); p.y = ground(p.x, p.z) + 2;
        C.fx.explosion(p, 40, 'ground'); C.fx.burn(p, 40);
      }
      skip(6);
      st.cam = () => { const g = g0 + st.t * 0.03; cpos.set(c.x + Math.sin(g) * R, 480 - st.t * 12, c.z + Math.cos(g) * R); look.set(0, 170, 0); setCam(cpos, look, 46); };
      await shoot(120);
    },
  };

  // прогрев: готовые модели комплексов, самолётов и оружия догружаются в фоне — до записи все должны быть на месте
  battle('west', 4);
  ['s400', 'pac3', 'torm2', 's300'].forEach((k, i) => C.S.addUnit(k, 3000 + i * 60, 3000, {})); C.syncUnits();
  const wa = plane('east', 'su30', new V(3000, 400, 2800), 0, 200);
  ['f18', 'f16', 'mig29'].forEach((k, i) => plane(i % 2 ? 'east' : 'west', k, new V(3100 + i * 80, 400, 2800), 0, 200));
  for (const k of ['umpk', 'agm88', 'gbu12', 'kh29t']) C.S.release(wa, k, { aim: new V(3000, 0, 0) });
  for (let i = 0; i < 50; i++) { adv(); await new Promise((r) => setTimeout(r, 150)); }
  for (const k of ORDER) {
    if (only ? !only.includes(k) : weather && WEATHER[k] !== weather) continue;
    sceneNo = ORDER.indexOf(k) + 1; n = 0; st.tick = null; st.cam = null; st.near = 0;
    await SCENES[k]();
  }
  window.__recDone = true;
  return window.__rec;
}
function verOf() { const s = [...document.scripts].map((q) => q.src).join(' '); const m = /v=(\d{8}[a-z]?)/.exec(s); return m ? m[1] : ''; }
