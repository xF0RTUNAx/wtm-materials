// Стенд события «Туманная топь» (games/airdef/event.js): страница на осенней карте (?map=autumn) в безголовом прогоне, как ui-test.js.
// Проверяет: меню без вертолётных подвесок, экран события (вкладки, замки «Реализма», «Взлёт» на каждом вертолёте), оборона на осенней
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
const { samKnown } = await import('../../games/airdef/sim/combined.js?v=20261027d');
for (let i = 0; i < 300 && !(globalThis.__a && globalThis.__a.state === 'menu'); i++) await new Promise((r) => setTimeout(r, 100)); // запуск по этапам (экран загрузки)
const C = globalThis.__a;
let now = 1000;
function frames(n, dt = 1000 / 30) { for (let i = 0; i < n; i++) { now += dt; const f = rafCb; rafCb = null; try { f(now); } catch (e) { errors.push(`кадр: ${e.stack}`); return false; } } return true; }
const check = (name, ok) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}`); if (!ok) errors.push(name); };

const C2 = C;
const { HELI_LOADOUTS, PLANES, LOADOUTS } = await import('../../games/airdef/arsenal.js?v=20261027d');
const { EVENT_END, eventLeft } = await import('../../games/airdef/event.js?v=20261027d');
check(`конец события — 2026-12-20 23:59:59 МСК (${EVENT_END.toISOString()}), осталось ${Math.round(eventLeft() / 864e5)} дн.`, EVENT_END.toISOString() === '2026-12-20T20:59:59.000Z');
check(`карта «Туманная топь», погода ${C.W_KEY}`, C.MAP === 'autumn' && C.W_KEY === 'a_dusk');
// 1. «Вылет» и «Съёмка» без вертолётных подвесок; сохранённая вертолётная подвеска заменяется самолётной
{ const hl = HELI_LOADOUTS[0]; const heliNames = new Set(Object.keys(PLANES).filter((k) => k.startsWith('h_')).map((k) => PLANES[k]));
  for (const era of [1, 2, 3, 4]) for (const game of ['air', 'photo']) {
    const hs = HELI_LOADOUTS.find((L) => L.era === era); if (!hs) continue;
    Object.assign(C.setup, { game, pside: 'air', era, side: hs.side === 'east' ? 'west' : 'east', lo: hs.i, diff: 'arcade', op: false }); C.menu.render();
    const html = byId('tab-play').innerHTML, has = [...heliNames].some((n) => html.includes(n + ' ·'));
    check(`меню ${game}, эпоха ${era}: вертолётов нет, lo заменён на самолётную (${LOADOUTS[era][C.setup.lo].plane})`, !has && !LOADOUTS[era][C.setup.lo].heli);
  } }
// 2. экран события
const root = made.find((e) => e.id === 'event'), ev = C.event;
const click = (dataset, par) => { const t = { dataset, parentNode: par || {}, closest: () => t }; root._ev.click({ target: t }); };
Object.assign(C.setup, { game: 'air', diff: 'arcade' }); ev.open(); frames(2);
check('событие: экран открыт, вкладка «Вылет на вертолёте», в разметке вертолёты и «Взлёт»', ev.isOpen() && root.innerHTML.includes('Вылет на вертолёте') && root.innerHTML.includes('Взлёт') && root.innerHTML.includes('Ми-24В'));
click({ tab: 'def' }); check('событие: вкладка «Оборона» — «К расстановке»', root.innerHTML.includes('К расстановке')); click({ tab: 'fly' });
click({ v: 'west' }, { dataset: { seg: 'hside' } }); check('событие: сторона «Запад» — AH-64D в ленте', root.innerHTML.includes('AH-64D') && !root.innerHTML.includes('Ми-28Н'));
click({ v: 'east' }, { dataset: { seg: 'hside' } });
{ // «Реализм»: закрытые — с замком, нажатие ведёт в «Исследования»
  const pg = C.progress, saved = [pg.ready, pg.loadoutOk, pg.loadoutMissing], opened = [], ro = C.research.open;
  pg.ready = () => true; pg.loadoutOk = (L) => L.plane === 'h_mi24'; pg.loadoutMissing = (L) => (L.plane === 'h_mi24' ? [] : [{ id: 'heli:' + L.plane }]); C.research.open = (id) => opened.push(id);
  C.setup.diff = 'real'; click({ v: 'real' }, { dataset: { seg: 'diff' } }); // перерисовать
  // у Востока 5 вертолётов (Ми-24В, Ми-8МТВ, Ка-50, Ми-28Н, Ка-52): открыт только Ми-24В — закрытых 4
  check('событие, «Реализм»: закрытые карточки с замком и «исследовать»', (root.innerHTML.match(/class="ec [^"]*lk/g) || []).length === 4 && root.innerHTML.includes('исследовать'));
  click({ need: 'heli:h_mi28' }); check(`событие, «Реализм»: нажатие на закрытую — «Исследования» на узле (${opened[0]})`, opened[0] === 'heli:h_mi28');
  [pg.ready, pg.loadoutOk, pg.loadoutMissing] = saved; C.research.open = ro; C.setup.diff = 'arcade'; click({ v: 'arcade' }, { dataset: { seg: 'diff' } });
}
// «Взлёт» на каждом вертолёте: тут уже осенняя карта и нужная погода — старт сразу, без перезагрузки; своя модель и подвеска
for (const L of HELI_LOADOUTS) {
  C.toMenu(); frames(3); ev.open(); click({ v: L.side }, { dataset: { seg: 'hside' } }); click({ sel: `${L.era}:${L.i}` });
  click({ go: 'fly' }); for (let i = 0; i < 60 && C.state !== 'play'; i++) await new Promise((r) => setTimeout(r, 50));
  frames(1); for (let i = 0; i < 40 && C.ctrl.plane !== L.plane; i++) { await new Promise((r) => setTimeout(r, 100)); frames(1); }
  const ok = C.state === 'play' && C.setup.game === 'air' && C.setup.era === L.era && C.setup.lo === L.i && C.setup.side === (L.side === 'east' ? 'west' : 'east') && C.setup.op === false && C.setup.evd === false && !ev.isOpen();
  check(`Взлёт: ${PLANES[L.plane]} (эпоха ${L.era}, подвеска ${L.i}): вылет на ${C.ctrl.plane}, ПВО ${C.setup.side}`, ok && C.ctrl.plane === L.plane);
  check(`Взлёт: ${PLANES[L.plane]} — вертолёт в воздухе или на площадке, 8 с без ошибок`, frames(30 * 8) && !!C.player.heli);
}
// 3. оборона на осенней карте — все волны
C.toMenu(); frames(3); ev.open(); click({ tab: 'def' }); click({ v: 'east' }, { dataset: { seg: 'dside' } }); click({ v: '3' }, { dataset: { seg: 'dera' } }); click({ go: 'def' });
for (let i = 0; i < 60 && C.state !== 'play'; i++) await new Promise((r) => setTimeout(r, 50)); frames(2);
{ const errors0 = errors.length, D = C.ctrl;
  check(`оборона события: расстановка на осенней карте (${C.MAP}), игра ${C.setup.game}, evd ${C.setup.evd}, цели: ${C.S.objects.length}`, D.st.phase === 'plan' && C.setup.game === 'defense' && C.setup.evd === true && C.S.objects.length > 3);
  const { freeGround } = await import('../../games/airdef/mission.js?v=20261027d');
  const tg = C.S.objects.filter((o) => !o.noTarget); let ranC = false;
  for (let w = 1; w <= C.WAVES && !D.st.over; w++) {
    if (D.st.phase === 'plan' || D.st.phase === 'debrief') {
      if (w === 1) for (const [k, dx] of [['tor', 300], ['tunguska', -300], ['igla', 500]]) for (const o of tg.slice(0, 4)) { for (let q = 0; q < 200; q++) { const a = q * 2.4, x = o.x + Math.cos(a) * (Math.abs(dx) + q * 8), z = o.z + Math.sin(a) * (Math.abs(dx) + q * 8); if (freeGround(C.city, x, z)) { const u = C.S.addUnit(k, x, z, {}); u.paid = 100; break; } } }
      C.syncUnits(); D.startWave();
    }
    let g = 0, heli = 0; while (D.st.phase === 'wave' && !D.st.over && g++ < 30 * 1500) { frames(1); heli = Math.max(heli, C.raid.planes.filter((a) => a.heli).length); if (C.ev) ranC = true; }
    console.log(`     волна ${w}: вертолётов ${heli}, сбито ${D.st.downs}, ${D.st.over ? 'бой окончен' : 'фаза ' + D.st.phase}, принудительно ушло ${C.raid.planes.filter((a) => a.heli && (a.hT || 0) > 600).length}`);
    if (D.st.phase === 'wave' && !D.st.over) console.log('     застряли:', C.raid.planes.filter((q) => !q.dead && !q.out).map((q) => `${q.plane || q.role}/${q.phase} agl=${Math.round(q.pos.y - C.city.groundH(q.pos.x, q.pos.z))} pos=${Math.round(q.pos.x)},${Math.round(q.pos.z)} sp=${Math.round(q.speed)} L=${q.load && q.load.map((l) => l.key + l.n).join('+')}`).join(' | '), 'wpns', C.S.wpns.filter((x) => !x.dead).length);
    check(`оборона события: волна ${w} закончилась (${g} кадров)`, D.st.phase !== 'wave' || D.st.over);
  }
  check(`оборона события: бой дошёл до конца (${D.st.over ? (D.st.win ? 'город отстоял' : 'оборона прорвана') : 'не закончен'}), последняя волна «Мульти-волна»: ${ranC ? 'шла' : 'не шла'}`, D.st.over);
  check('оборона события: без ошибок выполнения', errors.length === errors0);
}
C.toMenu(); frames(30);
console.error = origErr;
console.log(errors.length ? `\nОШИБКИ (${errors.length}):\n${errors.slice(0, 12).join('\n')}` : '\nошибок нет');
Deno.exit(errors.length ? 1 : 0);
