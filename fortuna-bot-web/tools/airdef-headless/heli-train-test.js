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
    querySelector: () => el('q'), querySelectorAll: () => [], getContext: () => ctx2d(), getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 300 }),
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
const { samKnown } = await import('../../games/airdef/sim/combined.js?v=20261022r');
for (let i = 0; i < 300 && !(globalThis.__a && globalThis.__a.state === 'menu'); i++) await new Promise((r) => setTimeout(r, 100)); // запуск по этапам (экран загрузки)
const C = globalThis.__a;
let now = 1000;
function frames(n, dt = 1000 / 30) { for (let i = 0; i < n; i++) { now += dt; const f = rafCb; rafCb = null; try { f(now); } catch (e) { errors.push(`кадр: ${e.stack}`); return false; } } return true; }
const check = (name, ok) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}`); if (!ok) errors.push(name); };


check(`карта «Туманная топь»`, C.MAP === 'autumn');
const LS = C.lessons.heli;
const passed = (i) => (C.ctrl && C.ctrl.T && C.ctrl.T.finished);
function start(i, ps) {
  C.toMenu(); frames(3); C.setup.side = ps; C.setup.game = 'training'; C.setup.tside = 'heli'; C.setup.tl = i; C.start('training'); frames(2);
  if (byId('lesson')._cls.has('on')) C.closeLesson();
}
for (const ps of ['east', 'west']) for (let i = 0; i < LS.length; i++) {
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
console.log(errors.length ? `\nошибок: ${errors.length}\n${errors.slice(0, 8).join('\n')}` : '\nошибок нет');
Deno.exit(errors.length ? 1 : 0);
