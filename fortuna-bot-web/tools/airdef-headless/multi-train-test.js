// Обучение «Мульти-волны» на «Северном рубеже» (Mark 2026-10-21: уроки — на карте самого режима): все уроки за волну и за ПВО
// запускаются за обе стороны и проходятся ботом.  deno run -A tools/airdef-headless/multi-train-test.js  (основа — event-test.js, боты — из ui-test.js)
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
  location: { search: '?test=1&gfx=low&map=winter', href: 'http://x/airdef.html' },
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
const { samKnown } = await import('../../games/airdef/sim/combined.js?v=20261024t');
for (let i = 0; i < 300 && !(globalThis.__a && globalThis.__a.state === 'menu'); i++) await new Promise((r) => setTimeout(r, 100)); // запуск по этапам (экран загрузки)
const C = globalThis.__a;
let now = 1000;
function frames(n, dt = 1000 / 30) { for (let i = 0; i < n; i++) { now += dt; const f = rafCb; rafCb = null; try { f(now); } catch (e) { errors.push(`кадр: ${e.stack}`); return false; } } return true; }
const check = (name, ok) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}`); if (!ok) errors.push(name); };


check(`карта «Северный рубеж»`, C.MAP === 'winter');
for (const ps of ['east', 'west']) for (const side of ['matk', 'mdef']) {
  const n = C.lessons[side].length;
  for (let i = 0; i < n; i++) {
    C.toMenu(); frames(3);
    C.setup.side = ps; C.setup.game = 'training'; C.setup.tside = side; C.setup.tl = i; C.start('training');
    const ok = frames(30 * 15);
    check(`урок ${side} ${i + 1} (ПВО ${ps})`, ok);
  }
}
C.setup.side = 'east';
const passed = (side, i) => (C.ctrl && C.ctrl.T && C.ctrl.T.finished) || (JSON.parse(store.fortuna_airdef_stats || '{}').lessons || {})[C.lessons[side][i].id] === 1;
function runLesson(side, i, bot, sec) {
  C.toMenu(); frames(3); C.setup.game = 'training'; C.setup.tside = side; C.setup.tl = i; C.start('training');
  for (let k = 0; k < sec * 30 && !passed(side, i); k++) { if (byId('lesson')._cls.has('on')) C.closeLesson(); bot(C.ctrl.inner); frames(1); }
  const ok = passed(side, i); check(`урок ${side} ${i + 1} пройден ботом${ok ? '' : ` — шаг ${C.ctrl.T.s}: ${(document.getElementById('hint').innerHTML || '').replace(/<[^>]+>/g, '').slice(0, 120)}`}`, ok);
  if (byId('lesson')._cls.has('on')) C.closeLesson();
}
// «Мульти-волна»: бот делает то, что просит подсказка, — через состояние режима (как кнопки окна цели и настроек)
{
  const tg = (st, i = 0) => 'o' + st.targets[Math.min(i, st.targets.length - 1)].id;
  const add = (D, k, n, key) => { const st = D.st; for (let j = 0; j < n; j++) { const i = (st.plan.n[k] = (st.plan.n[k] || 0) + 1) - 1; D.setTkey(k, i, key); if (st.phase === 'wave') { st.addQ[k] = (st.addQ[k] || 0) + 1; st.addT = 0.05; } } };
  const once = (T, tag, f) => { if (T.d['b' + tag]) return; T.d['b' + tag] = 1; f(); };
  const go = (D) => { if (D.st.phase === 'plan') { D.st.edKey = null; D.st.tsel = null; D.startWave(); } D.st.timeK = 4; };
  const B = {
    m_scout: (D, T) => { const st = D.st; if (T.s === 0) st.tsel = tg(st); else if (T.s === 1) once(T, 1, () => add(D, 'shahed', 3, st.tsel)); else go(D); },
    m_alloc: (D, T) => { const st = D.st; if (T.s === 0) st.tsel = tg(st); else if (T.s === 1) { once(T, 1, () => add(D, 'shahed', 2, st.tsel)); if (!T.d.k || T.d.k < T.t) { T.d.k = T.t + 0.2; add(D, 'kh555', 1, st.tsel); } } else if (T.s === 2) once(T, 2, () => { st.plan.n.shahed--; }); else if (T.s === 3) once(T, 3, () => { const o = C.S.objects.find((q) => !q.noTarget && !q.dead && 'o' + q.id !== st.tsel); st.tsel = 'o' + o.id; add(D, 'shahed', 2, st.tsel); }); },
    m_unit: (D, T) => { const st = D.st, u = (i) => (st.plan.cfg.kalibr.units[i] = st.plan.cfg.kalibr.units[i] || {}); if (T.s === 0) st.tsel = tg(st); else if (T.s === 1) { st.edKey = 'kalibr'; st.edUnit = 0; } else if (T.s === 2) u(0).pts = [[4000, 3000], [2000, 5000]]; else if (T.s === 3) u(0).alt = 300; else if (T.s === 4) u(0).t = 280; else if (T.s === 5) st.edUnit = null; else if (T.s === 6) u(1).t = 290; },
    m_carrier: (D, T) => { go(D); document.body.classList.add('evopen'); },
    m_tbm: (D, T) => { const st = D.st; if (T.s === 0) once(T, 0, () => { st.tsel = tg(st); add(D, 'iskander', 1, st.tsel); }); else if (T.s === 1) st.edKey = 'iskander'; else if (T.s === 2) (st.plan.cfg.iskander.units[0] = st.plan.cfg.iskander.units[0] || {}).t = 60; else go(D); },
    m_sam: (D, T) => { const st = D.st; if (T.s === 0) st.tsel = 'sam'; else if (T.s === 1) once(T, 1, () => add(D, 'kh55d', 3, 'sam')); else if (T.s === 2) once(T, 2, () => add(D, 'kh555', 3, tg(st))); else go(D); },
    m_live: (D, T) => { const st = D.st; if (T.s === 0) go(D); else if (T.s === 1) once(T, 1, () => add(D, 'shahed', 1, tg(st))); else if (T.s === 2) once(T, 2, () => { st.plan.cfg.iskander.units[0].t = Math.ceil(C.ev.t + 1); C.ev.applyPlan(st.plan.cfg); });
      else if (T.s === 3) { const u = C.S.units.find((q) => !q.dead && samKnown(q) && q.S.radar); if (u) once(T, 3, () => add(D, 'shahed', 1, 'u' + u.id)); } },
    m_final: (D, T) => { const st = D.st; if (st.phase === 'plan') once(T, 0, () => { add(D, 'shahed', 8, tg(st)); add(D, 'kh55d', 2, 'sam'); add(D, 'kalibr', 3, tg(st, 1)); add(D, 'iskander', 1, tg(st, 2)); go(D); }); else st.timeK = 4; },
    md_alarm: (D) => go(D),
    md_drones: (D, T) => { if (D.st.phase === 'plan') once(T, 0, () => { for (const [k, key, dx] of [['gepard', 'w_dam', 300], ['stinger', 'w_dam', -300], ['gepard', 'w_fuel', 300], ['stinger', 'w_fuel', -300], ['gepard', 'w_dam', 900], ['stinger', 'w_fuel', 900]]) { const o = C.S.objects.find((q) => q.key === key); C.S.addUnit(k, o.x + dx, o.z + 200, {}); } C.syncUnits(); go(D); }); else D.st.timeK = 4; },
    md_cruise: (D, T) => { if (D.st.phase === 'plan') once(T, 0, () => { const o = C.S.objects.find((q) => q.key === 'w_fuel'); C.S.addUnit('gepard', o.x + 300, o.z + 200, {}); C.syncUnits(); go(D); }); else D.st.timeK = 4; },
    md_tbm: (D, T) => { const st = D.st, u = C.S.units.find((q) => q.key === 'pac3'); if (T.s === 0) go(D); else if (T.s === 1) D.enterOp(u); else { st.timeK = 4; const w = C.S.wpns.find((q) => !q.dead && q.ev && q.W.kind === 'tbm' && q.vel.y < 0); if (w && st.op && u.desig !== w) D.designate(w); if (st.op && u.track) C.S.launch(u); } },
    md_final: (D, T) => { if (D.st.phase === 'plan') once(T, 0, () => { for (const [k, key, dx] of [['pac3', 'w_dam', 1500], ['nasams', 'w_fuel', 900], ['gepard', 'w_dam', 300], ['gepard', 'w_fuel', 300], ['stinger', 'w_air', 300]]) { const o = C.S.objects.find((q) => q.key === key); if (o) C.S.addUnit(k, o.x + dx, o.z + 200, {}); } C.syncUnits(); go(D); }); else D.st.timeK = 4; },
  };
  for (const side of ['matk', 'mdef']) C.lessons[side].forEach((l, i) => runLesson(side, i, (D) => B[l.id](D, C.ctrl.T), 1800)); // поздние дроны (пуск до 5 мин) — волна идёт дольше
}

console.log(errors.length ? `\nошибок: ${errors.length}\n${errors.slice(0, 8).join('\n')}` : '\nошибок нет');
Deno.exit(errors.length ? 1 : 0);
