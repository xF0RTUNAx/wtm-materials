// Обучение «за вертолёт» (Mark 2026-10-21) — все уроки ветки heli на «Туманной топи» (основа — event-test.js)
// Стенд события «Туманная топь» (games/airdef/event.js): страница на осенней карте (?map=autumn) в безголовом прогоне, как ui-test.js.
// Проверяет: меню без вертолётных подвесок, экран события (вкладки, замки «Реализма», «ВЗЛЁТ» на каждом вертолёте), оборона на осенней
// карте — все волны до конца боя (вертолёты со 2-й волны, последняя — «Мульти-волна»).
//   deno run -A tools/airdef-headless/event-test.js
const dir = new URL('.', import.meta.url).pathname;
(0, eval)(Deno.readTextFileSync(dir + '../drone-headless/three.min.js'));

// ── заглушки страницы ──
const noop = () => {};
const ctx2d = () => new Proxy({ createRadialGradient: () => ({ addColorStop: noop }), createLinearGradient: () => ({ addColorStop: noop }), measureText: () => ({ width: 10 }), getImageData: () => ({ data: new Uint8ClampedArray(4) }), createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) },
  { get: (t, p) => (p in t ? t[p] : noop), set: (t, p, v) => { t[p] = v; return true; } });
const els = new Map(); const made = [];
function el(id) {
  const e = {
    id, style: {}, dataset: {}, innerHTML: '', textContent: '', width: 300, height: 150, _cls: new Set(), children: [],
    classList: { add: (...c) => c.forEach((x) => e._cls.add(x)), remove: (...c) => c.forEach((x) => e._cls.delete(x)), toggle: (c, on) => { const v = on === undefined ? !e._cls.has(c) : on; if (v) e._cls.add(c); else e._cls.delete(c); return v; }, contains: (c) => e._cls.has(c) },
    addEventListener: (t, f) => { (e._ev ||= {})[t] = f; }, removeEventListener: noop, setPointerCapture: noop, releasePointerCapture: noop,
    lastChild: { innerHTML: '', textContent: '' }, querySelector: () => el('q'), querySelectorAll: () => [], getContext: () => ctx2d(), getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 300 }),
    appendChild: noop, insertBefore: noop, remove: noop, closest: () => null, focus: noop, offsetWidth: 1, parentNode: null,
    toBlob: noop, toDataURL: () => '',
  };
  return e;
}
const byId = (id) => { if (!els.has(id)) els.set(id, el(id)); return els.get(id); };
const store = {};
Object.assign(globalThis, {
  window: globalThis, devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720,
  document: { getElementById: byId, createElement: () => { const e = el('new'); made.push(e); return e; }, createElementNS: () => el('ns'), body: el('body'), documentElement: el('html'), addEventListener: noop, hidden: false },
  matchMedia: () => ({ matches: false }), addEventListener: noop, removeEventListener: noop,
  location: { search: '?test=1&gfx=low&map=autumn&weather=a_dusk', href: 'http://x/airdef.html' },
});
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } }, configurable: true, writable: true });
let rafCb = null; globalThis.requestAnimationFrame = (f) => { rafCb = f; return 1; };
// рендерер-заглушка: все вызовы WebGL — пустые
class FakeRenderer {
  constructor() { this.shadowMap = { enabled: false, autoUpdate: true }; this.capabilities = { isWebGL2: true, getMaxAnisotropy: () => 4 }; this.toneMapping = 0; this.outputEncoding = 0; this.toneMappingExposure = 1; this.autoClear = true; this._pr = 1; this.domElement = el('c'); }
  setPixelRatio(p) { this._pr = p; } getPixelRatio() { return this._pr; } setSize() {} render() {} compile() {} setRenderTarget() {} getRenderTarget() { return null; }
  setScissor() {} setScissorTest() {} setViewport() {} clear() {} getContext() { return {}; } getClearColor(c) { return c; } getClearAlpha() { return 1; } setClearColor() {}
}
THREE.WebGLRenderer = FakeRenderer;

const errors = [];
const origErr = console.error; console.error = (...a) => { errors.push(a.join(' ')); };
await import('../../games/airdef/main.js');
const { samKnown } = await import('../../games/airdef/sim/combined.js?v=20261026a');
for (let i = 0; i < 300 && !(globalThis.__a && globalThis.__a.state === 'menu'); i++) await new Promise((r) => setTimeout(r, 100)); // запуск по этапам (экран загрузки)
const C = globalThis.__a;
let now = 1000;
function frames(n, dt = 1000 / 30) { for (let i = 0; i < n; i++) { now += dt; const f = rafCb; rafCb = null; try { f(now); } catch (e) { errors.push(`кадр: ${e.stack}`); return false; } } return true; }
const check = (name, ok) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}`); if (!ok) errors.push(name); };


check(`карта «Туманная топь»`, C.MAP === 'autumn');
if (Deno.env.get('PEAT')) {
  const city = C.city, o = city.objects.find((q) => q.key === 'a_peat'), WY = city.autumn.WY, wet = (x, z) => city.waterAt ? city.waterAt(x, z) : false;
  let w = 0; for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) { const x = o.x + i * 420 / 4, z = o.z + j * 300 / 4; if (wet(x, z)) w++; }
  console.log('склад', o.x, o.z, 'земля', city.groundH(o.x, o.z).toFixed(1), 'воды на площадке', w, '/81');
  const r = (x, z) => `(${Math.round(x)}, ${Math.round(z)}) ${wet(x, z) ? 'вода' : 'суша'} ${city.groundH(x, z).toFixed(0)} м`;
  console.log(' узкоколейка:', [[4500 - 420, 1100], [4500 - 420 - 1500, 1100 - 300], [4500 - 420 - 2600, 1100 - 900]].map(([x, z]) => r(x, z)).join(' → '));
  const I = city.autumn.ISLE; console.log(' остров', I.x, I.z, 'до склада', Math.round(Math.hypot(I.x - o.x, I.z - o.z)));
  Deno.exit(0);
}
if (Deno.env.get('LOS3')) {
  const city = C.city, o = city.objects.find((q) => q.key === 'a_peat'), WY = city.autumn ? city.autumn.WY : 0, out = [];
  for (let dx = -2000; dx <= 1500; dx += 250) for (let dz = -1500; dz <= 2000; dz += 250) {
    const cx = o.x + dx, cz = o.z + dz, g = city.groundH(cx, cz); if (g < WY + 1.5) continue;
    let flat = 0; for (const [ax, az] of [[-200, 0], [200, 0], [0, -150], [0, 150]]) flat = Math.max(flat, Math.abs(city.groundH(cx + ax, cz + az) - g)); if (flat > 12) continue;
    let ok = 0; for (let b = 0; b < 360; b += 15) { const r = b * Math.PI / 180; for (const d of [3000]) { const x = cx + Math.sin(r) * d, z = cz + Math.cos(r) * d; if (Math.abs(x) > 14000 || Math.abs(z) > 14000) continue; if (city.los(x, city.groundH(x, z) + 70, z, cx, g + 14, cz, 4)) ok++; } }
    out.push([ok, dx, dz, g.toFixed(0), flat.toFixed(0)]);
  }
  out.sort((a, b) => b[0] - a[0]); console.log('WY', WY); for (const r of out.slice(0, 12)) console.log(' видно', r[0] + '/24', 'сдвиг', r[1], r[2], 'земля', r[3], 'перепад', r[4]);
  Deno.exit(0);
}
if (Deno.env.get('LOS2')) {
  const city = C.city, o = city.objects.find((q) => q.key === 'a_peat'); let HP = null;
  { const w = (o.w || 120) * 0.45, dd = (o.d || 120) * 0.45; for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) { const x = o.x + (i / 2) * w, z = o.z + (j / 2) * dd, y = city.topAt(x, z); if (!HP || y > HP[1]) HP = [x, y, z]; } }
  console.log('peat', o.x, o.z, 'ground', city.groundH(o.x, o.z).toFixed(1), 'top', city.topAt(o.x, o.z).toFixed(1), 'HP', HP.map((v) => v.toFixed(1)).join(','), 'w', o.w, 'd', o.d);
  for (const b of [0, 29, 60, 90, 180, 240, 300]) { const r = b * Math.PI / 180, d = 3000, x = o.x + Math.sin(r) * d, z = o.z + Math.cos(r) * d, y = city.groundH(x, z) + 70;
    const tx = HP[0], ty = HP[1] + 2, tz = HP[2]; let first = null;
    for (let k = 1; k < 300; k++) { const t = k / 300, px = x + (tx - x) * t, pz = z + (tz - z) * t, py = y + (ty - y) * t, g = city.groundH(px, pz), tp = city.topAt(px, pz); if (py < tp) { first = { dist: Math.round(Math.hypot(tx - px, tz - pz)), py: py.toFixed(1), ground: g.toFixed(1), bld: (tp - g).toFixed(1) }; break; } }
    console.log(' пеленг', b, 'вертолёт', y.toFixed(0), 'м · первое препятствие:', JSON.stringify(first)); }
  Deno.exit(0);
}
if (Deno.env.get('LOS')) {
  const city = C.city;
  for (const key of ['a_peat', 'a_vil', 'a_farm', 'a_wreck', 'a_heli', 'a_mon']) {
    const o = city.objects.find((q) => q.key === key), ty = city.groundH(o.x, o.z), res = []; let HP = null; { const w = (o.w || 120) * 0.45, dd = (o.d || 120) * 0.45; for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) { const x = o.x + (i / 2) * w, z = o.z + (j / 2) * dd, y = city.topAt(x, z); if (!HP || y > HP[1]) HP = [x, y, z]; } }
    for (const d of [2500, 3500, 4500]) for (const agl of [40, 70, 110]) { let ok = 0, best = []; for (let b = 0; b < 360; b += 15) { const r = b * Math.PI / 180, x = o.x + Math.sin(r) * d, z = o.z + Math.cos(r) * d; if (Math.abs(x) > 14000 || Math.abs(z) > 14000) continue; const hy = city.groundH(x, z) + agl; if (city.los(x, hy, z, o.x, city.topAt(o.x, o.z) + 2, o.z, 4) || city.los(x, hy, z, HP[0], HP[1] + 2, HP[2], 4)) { ok++; best.push(b); } } res.push(`${d / 1000}км/${agl}м: ${ok}/24 [${best.join(',')}]`); }
    console.log(key, o.name, '·', `к дому ${Math.round(Math.atan2(9800 - o.x, 11200 - o.z) * 180 / Math.PI)}°`); for (const r of res) console.log('   ', r);
  }
  Deno.exit(0);
}
const LS = C.lessons.heli;
const passed = (i) => (C.ctrl && C.ctrl.T && C.ctrl.T.finished);
function start(i, ps) {
  C.toMenu(); frames(3); C.setup.side = ps; C.setup.game = 'training'; C.setup.tside = 'heli'; C.setup.tl = i; C.start('training'); frames(2);
  if (byId('lesson')._cls.has('on')) C.closeLesson();
}
if (!Deno.env.get('BOTS')) for (const ps of ['east', 'west']) for (let i = 0; i < LS.length; i++) {
  start(i, ps); const ok = frames(30 * 20);
  const T = C.ctrl.T, cr = C.ctrl.inner.craft;
  check(`урок heli ${i + 1} «${LS[i].name}» (ПВО ${ps}): шаг ${T.s}${LS[i].air ? `, ${cr.heli ? 'вертолёт ' + cr.hm.key : 'НЕ вертолёт'}` : ''}`, ok && (!LS[i].air || cr.heli));
}
// бот: управление «Аркада» — газ, вверх, вниз, тормоз и шаг вбок, к цели
{
  start(0, 'east'); const K = (code, on) => C.ctrl.inner.onKey({ code, repeat: false, preventDefault: () => {} }, on); const T = C.ctrl.T;
  for (let k = 0; k < 30 * 240 && !passed(); k++) {
    const s = T.s;
    K('KeyW', s === 0 || s === 4); K('ArrowUp', s === 1); K('ArrowDown', s === 2); K('KeyS', s === 3); K('ArrowRight', s === 3);
    if (s === 4) { const cr = C.ctrl.inner.craft, o = C.S.objects.find((q) => q.key === 'a_peat'); let e = Math.atan2(-(o.x - cr.pos.x), -(o.z - cr.pos.z)) - cr.yaw; while (e > Math.PI) e -= 6.283; while (e < -Math.PI) e += 6.283; K('KeyA', e > 0.1); K('KeyD', e < -0.1); }
    frames(1);
  }
  check(`урок «${LS[0].name}» пройден ботом (шаг ${T.s})`, passed());
}
// посадка ботом не проверяется (бот не держит висение над площадкой) — урок проверен руками
const keyOf = () => (code, on) => C.ctrl.inner.onKey({ code, repeat: false, preventDefault: () => {} }, on);
const steer = (K, cr, x, z) => { let e = Math.atan2(-(x - cr.pos.x), -(z - cr.pos.z)) - cr.yaw; while (e > Math.PI) e -= 6.283; while (e < -Math.PI) e += 6.283; K('KeyA', e > 0.08); K('KeyD', e < -0.08); return e; };
// бот: НАР и ПТУР — нос на цель, «АВТО» стреляет сам
for (const id of ['h_atgm']) { // НАР бот не умеет (нужен наклон носа по прицелу) — проверяется руками
  const i = LS.findIndex((l) => l.id === id); start(i, 'east'); const K = keyOf(), T = C.ctrl.T; C.setAuto(true);
  { const prev = C.hooks.wpnEnd; C.hooks.wpnEnd = (w, res) => { if (prev) prev(w, res); if (Deno.env.get('V')) console.log('   конец ракеты', w.key, JSON.stringify({ t: +w.t.toFixed(1), homing: w.homing, lost: !!w.lost, seeker: w.W.seeker, gap: +(w.pos.y - C.city.topAt(w.pos.x, w.pos.z)).toFixed(1), y: Math.round(w.pos.y), d: Math.round(w.pos.distanceTo(new THREE.Vector3(C.ctrl.inner.game.targets[0].x, w.pos.y, C.ctrl.inner.game.targets[0].z))) })); }; }
  for (let k = 0; k < 30 * 480 && !passed(); k++) {
    const cr = C.ctrl.inner.craft, o = C.ctrl.inner.game.targets[0], d = Math.hypot(o.x - cr.pos.x, o.z - cr.pos.z), sp = Math.hypot(cr.vel.x, cr.vel.z);
    for (const c of ['KeyW', 'KeyS', 'KeyA', 'KeyD']) K(c, false);
    const e = steer(K, cr, o.x, o.z); K('KeyW', d > 3000 && sp < 30); K('KeyS', d < 3000 && sp > 3);
    if (d < 3200 && Math.abs(e) < 0.15 && k % 45 === 0) { K('KeyR', true); K('KeyR', false); K('Space', true); K('Space', false); }
    frames(1);
  }
  { const cr = C.ctrl.inner.craft, o = C.ctrl.inner.game.targets[0]; console.log('  ', id, 'd', Math.round(Math.hypot(o.x - cr.pos.x, o.z - cr.pos.z)), 'v', Math.hypot(cr.vel.x, cr.vel.z).toFixed(1), 'agl', Math.round(cr.pos.y - C.city.groundH(cr.pos.x, cr.pos.z)), 'груз', JSON.stringify(C.ctrl.inner.loadout.map((l) => [l.key, l.n])), 'hp', Math.round(o.hp), '/', o.hpMax, 'пусков', C.S.wpns.length, 'pod', JSON.stringify({ lock: !!C.ctrl.inner.pod.lock, why: C.ctrl.inner.pod.why, tgt: C.ctrl.inner.pod.tgt && C.ctrl.inner.pod.tgt.key }), 'say', document.getElementById('say') && document.getElementById('say').textContent); }
  C.setAuto(false);
  check(`урок «${LS[i].name}» пройден ботом (шаг ${T.s})`, passed());
}
console.log(errors.length ? `\nошибок: ${errors.length}\n${errors.slice(0, 8).join('\n')}` : '\nошибок нет');
Deno.exit(errors.length ? 1 : 0);
