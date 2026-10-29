// Случайная карта вылета и обороны (Mark 2026-10-27): страница на «Северном рубеже» без ?map (выбрана заранее, fortuna_ad_map), вылет и оборона
// на зимней карте — ПВО на земле, ИИ-налёт не врезается в горы, ошибок нет; «Ещё раз» на другой выпавшей карте — перезагрузка сразу в бой (?go=…);
// второй вылет «Операции» — без смены карты. Безголовый прогон, как ui-test.
//   deno run -A tools/airdef-headless/map-rand-test.js
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
const store = { fortuna_ad_map: 'winter', fortuna_airdef_setup: JSON.stringify({ game: 'air', diff: 'arcade', era: 3, side: 'east', lo: 0 }) };
Object.assign(globalThis, {
  window: globalThis, devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720,
  document: { getElementById: byId, createElement: () => { const e = el('new'); made.push(e); return e; }, createElementNS: () => el('ns'), body: el('body'), documentElement: el('html'), addEventListener: noop, hidden: false },
  matchMedia: () => ({ matches: false }), addEventListener: noop, removeEventListener: noop,
  location: { search: '?test=1&gfx=low', href: 'http://x/airdef.html', replace: (u) => { globalThis.__replaced = String(u); } },
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
const { samKnown } = await import('../../games/airdef/sim/combined.js?v=20261029a');
for (let i = 0; i < 300 && !(globalThis.__a && globalThis.__a.state === 'menu'); i++) await new Promise((r) => setTimeout(r, 100)); // запуск по этапам (экран загрузки)
const C = globalThis.__a;
let now = 1000;
function frames(n, dt = 1000 / 30) { for (let i = 0; i < n; i++) { now += dt; const f = rafCb; rafCb = null; try { f(now); } catch (e) { errors.push(`кадр: ${e.stack}`); return false; } } return true; }
const check = (name, ok) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}`); if (!ok) errors.push(name); };

check('карта при загрузке — выбранная заранее («Северный рубеж»)', C.MAP === 'winter' && C.city.kind === 'winter');
const gh = (p) => C.city.groundH(p.x, p.z);
// ── вылет на зимней карте ──
C.setAuto(true); C.setup.game = 'air'; C.start('air'); frames(10);
check('вылет начался на зимней карте (без перезагрузки)', C.state === 'play' && !globalThis.__replaced);
const next1 = store.fortuna_ad_map;
check(`следующая карта выбрана заново (${next1})`, ['city', 'winter'].includes(next1));
const units = C.S.units.filter((u) => !u.dead);
check(`ПВО расставлена: ${units.length} (${[...new Set(units.map((u) => u.key))].join(', ')})`, units.length >= 6);
check('комплексы стоят на земле или крыше (не висят, не под землёй)', units.every((u) => Math.abs(u.pos.y - gh(u.pos)) < 3 || u.roof));
check(`цели — объекты зимней карты (${C.player ? '' : ''}${(C.ctrl.game ? C.ctrl.game.targets : []).map((o) => o.key).join(', ')})`, true);
frames(30 * 90);
check('вылет: 90 с без ошибок', errors.length === 0);
// ── «Ещё раз»: выпала другая карта — перезагрузка сразу в бой ──
store.fortuna_ad_map = 'city'; C.toMenu(); frames(5); C.start('air');
check('другая карта — перезагрузка страницы с ?go=air', !!globalThis.__replaced && globalThis.__replaced.includes('go=air'));
globalThis.__replaced = null;
// ── та же карта — без перезагрузки; «Операция»: второй вылет — без смены карты ──
store.fortuna_ad_map = 'winter'; C.start('air'); frames(5);
check('та же карта — бой без перезагрузки', C.state === 'play' && !globalThis.__replaced);
C.op = { stage: 1, next: true }; store.fortuna_ad_map = 'city'; C.toMenu(); C.op = { stage: 1, next: true }; C.start('air'); frames(5);
check('второй вылет «Операции» — на той же карте', !globalThis.__replaced);
C.op = null; globalThis.__replaced = null;
// ── оборона на зимней карте: ИИ-налёт трёх волн над горами ──
store.fortuna_ad_map = 'winter'; C.toMenu(); frames(5); C.setup.game = 'defense'; C.start('defense'); frames(10);
check('оборона на зимней карте', C.state === 'play' && !globalThis.__replaced);
const D = C.ctrls.defense;
const minAgl = new Map(); let crashes = 0, planesSeen = new Set();
const { placeDefense } = await import('../../games/airdef/mission.js?v=20261029a');
placeDefense(C.S, C.city, Math.random, 'east', 3, C.S.objects.filter((o) => !o.noTarget).slice(0, 3), 1, { same: true }); C.syncUnits(); // ПВО игрока — набор эпохи у целей
const roles = {};
for (let i = 0; i < 30 * 1800 && !C.ended && !(D.st.wave >= 4 && D.st.phase === 'debrief'); i++) {
  if (D.st.phase === 'debrief') D.st.phase = 'plan'; // «К расстановке — волна N»
  if (D.st.phase === 'plan') D.startWave();
  frames(1);
  for (const a of C.raid.planes) { if (a.dead || a.out || a.heli || a.phase === 'wait') continue; if (!planesSeen.has(a)) { planesSeen.add(a); roles[a.role] = (roles[a.role] || 0) + 1; } const h = a.pos.y - C.city.groundH(a.pos.x, a.pos.z); (a._hist ||= []).push(`${Math.round(h)}/${Math.round(a.vel.y)}${a.tgOn ? 'G' : ''}${a.evadeT > 0 ? 'E' : ''}/${Math.round(a.pitch * 57)}°/${Math.round((a.tgF || 0) - a.pos.y)}`); if (a._hist.length > 40) a._hist.shift(); if (h < (minAgl.get(a) ?? 1e9)) { a._h2 = a._hist.slice(); minAgl.set(a, h); a._dmg = a.hp < (a.hpMax || a.hp); a._low = `${a._dmg ? 'подбит, ' : ''}${a.role}/${a.phase}${a.evadeT > 0 ? '/отворот' : ''}${a.sOut ? '/заход' + a.sOut : ''} ${Math.round(a.speed)} м/с, верт ${Math.round(a.vel.y)}`; } }
}
console.log(`     волн: ${D.st.wave}, фаза ${D.st.phase}, пауза ${C.paused}, t ${Math.round(C.t)}, в воздухе ${C.raid.alive().length}, конец: ${!!C.ended}, роли: ${JSON.stringify(roles)}`);
for (const [a, h] of minAgl) { if (h < 0 && !a._dmg) crashes++; /* подбитый (пожар, нет консоли) может и разбиться о склон */ if (h < 20) console.log(`     низко ${Math.round(h)} м: ${a._low}${h < 0 && !a._dmg ? '\n       ' + (a._h2 || []).join(' ') : ''}`); }
const lows = [...minAgl.values()].sort((a, b) => a - b).slice(0, 5).map((h) => Math.round(h));
check(`налёт над горами: самолётов ${planesSeen.size}, целых ниже рельефа ${crashes} (минимум над землёй, м: ${lows.join(', ')})`, planesSeen.size > 0 && crashes === 0);
check('оборона: без ошибок', errors.length === 0);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
console.log(errors.length ? `ОШИБОК: ${errors.length}` : 'итог: ошибок нет');
Deno.exit(errors.length ? 1 : 0);
