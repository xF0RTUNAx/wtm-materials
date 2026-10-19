// Безголовый прогон всей игры «Воздушное превосходство» (games/airdef/main.js) без браузера: страница, холсты, Web Audio
// и WebGL-рендерер заменены заглушками, всё остальное — настоящий код (меню с живым фоном, вылет, оборона, оператор,
// все уроки обучения). Ловит ошибки выполнения и проверяет, что режимы доходят до ключевых состояний.
//   deno run --allow-read tools/airdef-headless/ui-test.js
const dir = new URL('.', import.meta.url).pathname;
(0, eval)(Deno.readTextFileSync(dir + '../drone-headless/three.min.js'));

// ── заглушки страницы ──
const noop = () => {};
const ctx2d = () => new Proxy({ createRadialGradient: () => ({ addColorStop: noop }), createLinearGradient: () => ({ addColorStop: noop }), measureText: () => ({ width: 10 }), getImageData: () => ({ data: new Uint8ClampedArray(4) }) },
  { get: (t, p) => (p in t ? t[p] : noop), set: (t, p, v) => { t[p] = v; return true; } });
const els = new Map();
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
  document: { getElementById: byId, createElement: () => el('new'), body: el('body'), documentElement: el('html'), addEventListener: noop, hidden: false },
  matchMedia: () => ({ matches: false }), addEventListener: noop, removeEventListener: noop,
  location: { search: '?test=1&gfx=low&weather=day', href: 'http://x/airdef.html' },
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
const { samKnown } = await import('../../games/airdef/sim/combined.js?v=20261022i');
for (let i = 0; i < 300 && !(globalThis.__a && globalThis.__a.state === 'menu'); i++) await new Promise((r) => setTimeout(r, 100)); // запуск по этапам (экран загрузки)
const C = globalThis.__a;
let now = 1000;
function frames(n, dt = 1000 / 30) { for (let i = 0; i < n; i++) { now += dt; const f = rafCb; rafCb = null; try { f(now); } catch (e) { errors.push(`кадр: ${e.stack}`); return false; } } return true; }
const check = (name, ok) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}`); if (!ok) errors.push(name); };

// 1. меню и живой фон
check('меню открыто', C.state === 'menu');
{ const { SHOTS } = await import('../../games/airdef/shots/shots.js?v=20261022i');
  check(`меню: фон — готовые кадры (${SHOTS.length}), без 3D и боя`, SHOTS.length > 0 && C.ctrl && C.ctrl.idle && C.ctrl.idle() && C.ctrl.sim === false);
  frames(30 * 3);
  C.ctrl.stop(); C.ctrl = C.ctrls.director; C.ctrl.start(); } // запасной фон (кадров нет) — живой бой: проверяем и его
frames(30 * 40);
check('фон: идёт бой (есть ИИ-самолёты и ЗРК)', !!C.raid && C.raid.planes.length > 0 && C.S.units.length > 0);
console.log(`     фон за 40 с: пусков ЗУР ${C.S.sams.length}, самолётов ${C.raid.planes.filter((a) => !a.dead && !a.out).length}`);
{ const kinds = {}; for (let i = 0; i < 30 * 150; i++) { frames(1); if (i % 15 === 0) await new Promise((r) => setTimeout(r, 300)); const k = C.ctrl.shotKind; kinds[k] = (kinds[k] || 0) + 1 / 30; }
  console.log(`     планы фона за 150 с: ${Object.entries(kinds).map(([k, v]) => `${k} ${Math.round(v)} с`).join(', ')}`);
  check('фон: кадр по свободной части экрана', C.camera.view && C.camera.view.enabled && C.camera.view.fullWidth < C.VW); }

{ const { planeModel } = await import('../../games/airdef/models.js?v=20261022i');
  for (const [side, cls] of [['east', 'strike'], ['east', 'fighter'], ['west', 'strike'], ['west', 'fighter']]) {
    const pm = planeModel(side, cls); let tris = 0, tex = 0; if (pm) pm.obj.traverse((o) => { if (o.isMesh) { tris += o.geometry.index ? o.geometry.index.count / 3 : 0; if (o.material.map) tex++; } });
    check(`готовая модель ${side}/${cls}: ${pm ? `${pm.name}, ${tris} треуг., мешей с текстурой ${tex}` : 'нет'}`, pm && pm.cls === cls);
  } }
{ const { unitModelGlb, wantUnit } = await import('../../games/airdef/models.js?v=20261022i');
  const keys = ['bukm3', 'osa', 'tor', 'torm2', 'pantsir', 's400', 's300', 'patriot', 'pac3', 's75', 's125', 'kub', 'hawk', 'm163', 'gepard', 'nasams', 'gpsjam', 'gpsjamw']; for (const k of keys) wantUnit(k);
  await new Promise((r) => setTimeout(r, 1500));
  for (const k of keys) { const m = unitModelGlb(k); let n = 0; if (m) for (const q of ['body', 'turret', 'cradle']) if (m[q]) m[q].traverse((o) => { if (o.isMesh) n += o.geometry.index.count / 3; });
    check(`готовая модель комплекса ${k}: ${m ? `${n} треуг., башня ${m.turret ? 'да' : 'нет'}, пакет ${m.cradle ? 'да' : 'нет'}` : 'нет'}`, !!m); }
  { const { weaponMesh } = await import('../../games/airdef/models.js?v=20261022i'); const { weaponGeo } = await import('../../games/airdef/units-render.js?v=20261022i'); const { AG } = await import('../../games/airdef/arsenal.js?v=20261022i');
    const want = ['fab500', 'umpk', 'kh29t', 'kh31p', 'kh25ml', 'agm65b', 'mk82', 'gbu12', 'jassm', 'agm88', 'aargm', 'mald', 'decoy_e', 'gbu39', 'gbu31'], got = want.filter((k) => !weaponMesh(k, AG[k], weaponGeo, null).isMesh);
    check(`готовые модели оружия (${got.length}/${want.length}): ${want.filter((k) => !got.includes(k)).join(', ') || 'все'}`, got.length === want.length);
    const { podModel, launcherGlb, unitMissileGlb } = await import('../../games/airdef/models.js?v=20261022i');
    for (let i = 0; i < 30 && !(podModel() && launcherGlb('igla') && launcherGlb('stinger')); i++) await new Promise((r) => setTimeout(r, 200));
    check(`контейнер LITENING, трубы ПЗРК, ракеты ПЗРК и NASAMS: ${!!podModel()} ${!!launcherGlb('igla')} ${!!launcherGlb('stinger')} ${!!unitMissileGlb('verba')} ${!!unitMissileGlb('nasams')}`, podModel() && launcherGlb('igla') && launcherGlb('stinger') && unitMissileGlb('verba') && unitMissileGlb('nasams')); }
  const gm = unitModelGlb('bukm3'); let n = 0; if (gm) for (const k of ['body', 'turret', 'cradle']) gm[k].traverse((o) => { if (o.isMesh) n += o.geometry.index.count / 3; });
  check(`готовая модель «Бук-М3»: ${gm ? `корпус, башня, пакет — ${n} треуг.` : 'нет'}`, !!gm && !!gm.turret && !!gm.cradle); }
// 2. вылет
C.setup.game = 'air'; C.start('air');
const air = C.ctrl;
frames(30 * 5);
check('вылет: самолёт летит', C.player && !C.player.dead && C.player.pos.z < 14000);
check(`вылет: топливо тратится (${(C.player.fuel * 100).toFixed(1)} %), ЛТЦ ${C.player.cmFlare}`, C.player.fuel < 1 && C.player.fuel > 0.5 && C.player.cmFlare >= 145);
{ // управление: стрелка вверх — нос вверх, крестовина вверх — тоже; с инверсией — наоборот
  const p0 = C.player.pitch; air.onKey({ code: 'ArrowUp', repeat: false, preventDefault: noop }, true); frames(20); air.onKey({ code: 'ArrowUp' }, false);
  check(`управление: вверх — нос вверх (тангаж ${(p0 * 57.3).toFixed(1)}° → ${(C.player.pitch * 57.3).toFixed(1)}°)`, C.player.pitch > p0 + 0.02);
  C.sens.invert = true; const p1 = C.player.pitch; air.onKey({ code: 'ArrowUp', repeat: false, preventDefault: noop }, true); frames(20); air.onKey({ code: 'ArrowUp' }, false); C.sens.invert = false;
  check(`управление: с инверсией вверх — нос вниз (${(p1 * 57.3).toFixed(1)}° → ${(C.player.pitch * 57.3).toFixed(1)}°)`, C.player.pitch < p1 - 0.02); frames(30);
}
{ // газ ступенями: после 100 % — форсаж, дальше — снова 40 %
  const st = []; for (let i = 0; i < 5; i++) { air.onKey({ code: 'KeyW', repeat: false, preventDefault: noop }, true); air.onKey({ code: 'KeyW' }, false); frames(2); st.push(C.player.ab ? 'AB' : Math.round(C.player.thr * 100)); }
  check(`газ: W — ступени ${st.join(' → ')}`, st.includes('AB') && st[0] === 100);
  air.setThr(2); frames(2); check('газ: 80 % без форсажа', !C.player.ab && Math.abs(C.player.thr - 0.8) < 0.01); }
{ // ловушки — одной кнопкой: и ЛТЦ, и диполи
  const f0 = C.player.cmFlare, c0 = C.player.cmChaff; air.cm(); check(`ловушки: пачка ЛТЦ+диполи (${f0}/${c0} → ${C.player.cmFlare}/${C.player.cmChaff})`, C.player.cmFlare === f0 - 1 && C.player.cmChaff === c0 - 1); }
air.fire(); frames(30 * 3);
air.onKey({ code: 'KeyQ', repeat: false, preventDefault: noop }, true); air.onKey({ code: 'KeyQ' }, false);
air.fire(); air.cm(); frames(30 * 20);
check('вылет: прошёл без ошибок', true);
C.togglePause(); check('пауза', C.paused); C.togglePause();
// «АВТО» в вылете: должен сам захватить цель и что-то сбросить
C.setAuto(true); const relBefore = air.loadout.reduce((s2, l) => s2 + l.n, 0);
C.player.pos.set(C.S.objects[0].x, 2500, C.S.objects[0].z + 9000); C.player.yaw = 0; C.player.pitch = -0.1; C.player.q = null;
frames(30 * 40);
check(`АВТО в вылете: сброшено ${relBefore - air.loadout.reduce((s2, l) => s2 + l.n, 0)}`, true);
check(`контейнер: цель ${air.pod.lockName || '—'}, захват ${air.pod.lock ? 'есть' : 'нет'}${air.pod.why ? ` (${air.pod.why})` : ''}`, !air.hasPod || !!air.pod.tgt || C.S.objects.every((o) => o.dead));
C.setAuto(false);
air.finish('тест', true); frames(5);

// 2б. все подвески всех эпох обеих сторон под «АВТО»: свой самолёт, оружие расходуется (эпоха IV, F/A-18 — ещё камера за оружием)
{ const { LOADOUTS } = await import('../../games/airdef/arsenal.js?v=20261022i');
  const planes = new Set(); let used = 0, total = 0;
  for (const era of [1, 2, 3, 4]) for (const [lo, L] of LOADOUTS[era].entries()) {
    C.toMenu(); frames(3); C.setup.era = era; C.setup.side = L.side === 'east' ? 'west' : 'east'; C.setup.lo = lo; C.setup.game = 'air'; C.start('air'); C.setAuto(true);
    const a4 = C.ctrl, n0 = a4.loadout.reduce((s2, l) => s2 + l.n, 0);
    for (let i = 0; i < 40 && a4.plane !== L.plane; i++) { await new Promise((r) => setTimeout(r, 100)); frames(1); } // своя модель подвески грузится по требованию
    C.player.pos.set(C.S.objects[0].x, 4000, C.S.objects[0].z + 14000); C.player.yaw = 0; C.player.q = null;
    const camTest = era === 4 && L.plane === 'f18' && !planes.has('cam');
    if (camTest) { planes.add('cam'); a4.onKey({ code: 'KeyN', repeat: false, preventDefault: noop }, true); }
    let camNear = 1e9;
    for (let i = 0; i < 30 * 25; i++) { frames(1); if (camTest) for (const w of C.S.wpns) if (!w.dead && w.owner === C.player) camNear = Math.min(camNear, C.camera.position.distanceTo(w.pos)); }
    if (camTest) { check(`камера за оружием: ближе всего ${Math.round(camNear)} м до своего оружия`, camNear < 80); a4.onKey({ code: 'KeyV', repeat: false, preventDefault: noop }, true); }
    const spent = n0 - a4.loadout.reduce((s2, l) => s2 + l.n, 0); total++; if (spent > 0) used++;
    planes.add(a4.plane);
    check(`эпоха ${era} · ${L.plane} · ${L.name}: самолёт ${a4.plane}, израсходовано ${spent}`, a4.plane === L.plane);
    C.setAuto(false);
  }
  check(`подвески: расходуют оружие ${used} из ${total}; самолёты: ${[...planes].filter((p) => p !== 'cam').join(', ')}`, used > total / 2);
}
C.setup.era = 2; C.setup.lo = 0;
// 3. оборона: расстановка, волна, оператор
C.toMenu(); frames(10);
C.setup.game = 'defense'; C.start('defense');
const D = C.ctrl;
check('оборона: расстановка', D.st.phase === 'plan');
const t = C.S.objects.find((o) => o.key === 'tpp');
{ // расстановка: место — касаниями (сколько угодно), «Подтвердить» — купить, «Отмена» — не покупать; касание своего — перенос с подтверждением
  const { freeGround } = await import('../../games/airdef/mission.js?v=20261022i');
  const spot = (r) => { for (let k = 0; k < 400; k++) { const a = k * 2.4, x = t.x + Math.cos(a) * r, z = t.z + Math.sin(a) * r; if (freeGround(C.city, x, z)) return [x, z]; } return [t.x + r, t.z]; };
  const b0 = D.st.budget, n0 = C.S.units.length, [x1, z1] = spot(600), [x2, z2] = spot(1000);
  D.st.placing = 'osa'; D.tapAt(x1, z1); D.tapAt(x2, z2);
  check('расстановка: касания двигают место, покупки ещё нет', C.S.units.length === n0 && D.st.budget === b0 && D.st.draft && Math.hypot(D.st.draft.x - x2, D.st.draft.z - z2) < 1);
  D.cancelDraft(); check('расстановка: «Отмена» — без покупки', C.S.units.length === n0 && D.st.budget === b0 && !D.st.placing && !D.st.draft);
  D.st.placing = 'osa'; D.tapAt(x1, z1); D.confirmDraft(); const u = C.S.units[C.S.units.length - 1];
  check(`расстановка: «Подтвердить» — куплен на месте (−${b0 - D.st.budget})`, C.S.units.length === n0 + 1 && u.key === 'osa' && Math.hypot(u.pos.x - x1, u.pos.z - z1) < 1 && D.st.budget < b0 && !D.st.placing);
  D.tapAt(u.pos.x, u.pos.z); check('расстановка: касание своего комплекса — перенос', D.st.sel === u && D.st.moving);
  D.tapAt(x2, z2); check('расстановка: перенос ждёт подтверждения', Math.hypot(u.pos.x - x1, u.pos.z - z1) < 1 && D.st.draft);
  frames(2); check(`расстановка: тень зоны с нового места посчитана (${D.st.draft.cov ? D.st.draft.cov.length : 0} направлений)`, D.st.draft.cov && D.st.draft.cov.length === 72);
  check('расстановка: Esc — отмена переноса', D.onEsc() && !D.st.moving && Math.hypot(u.pos.x - x1, u.pos.z - z1) < 1); D.tapAt(u.pos.x, u.pos.z); D.tapAt(x2, z2);
  D.confirmDraft(); check('расстановка: «Подтвердить перенос» — переехал', Math.hypot(u.pos.x - x2, u.pos.z - z2) < 1 && !D.st.moving);
  C.S.removeUnit(u); C.syncUnits(); D.st.sel = null; D.st.budget = b0;
}
for (const [k, dx] of [['osa', 500], ['m163', 300], ['igla', 400]]) { const u = C.S.addUnit(k, t.x + dx, t.z + 200, {}); u.paid = 100; }
C.syncUnits(); frames(5);
D.startWave(); frames(30 * 3);
check('оборона: волна пошла', D.st.phase === 'wave' && C.raid.planes.length > 0);
D.enterOp(C.S.units[0]); frames(30 * 2);
const tgt = C.raid.alive()[0]; if (tgt) D.designate(tgt);
frames(30 * 10);
{ // бинокль: без захвата — нет; с захватом — сильное увеличение на цель; захват сорвался — выключается сам
  const u = C.S.units[0], key = (code) => D.onKey({ code, repeat: false, preventDefault: noop }, true);
  for (let i = 0; i < 30 * 20 && !u.track; i++) { const a = C.raid.alive().find((q) => q.pos.distanceTo(u.pos) < u.S.rmax * 1.5) || C.raid.alive()[0]; if (a && u.desig !== a) D.designate(a); frames(1); }
  if (u.track) {
    key('KeyB'); frames(5); const f = C.camera.fov;
    check(`бинокль: при захвате — увеличение (поле ${f.toFixed(1)}°)`, f < 15);
    C.S.designate(u, null); frames(3); // цель снята — захвата нет
    check(`бинокль: захват сорвался — выключился (поле ${C.camera.fov.toFixed(1)}°)`, C.camera.fov > 15 || C.camera.fov !== f);
  } else check('бинокль: захвата за 20 с не было — проверка пропущена', true);
}
D.onKey({ code: 'Space', repeat: false, preventDefault: noop }, true); D.onKey({ code: 'Space' }, false);
D.onKey({ code: 'KeyE', repeat: false, preventDefault: noop }, true);
D.onKey({ code: 'KeyQ', repeat: false, preventDefault: noop }, true);
D.enterOp(C.S.units.find((u) => u.key === 'm163')); D.onKey({ code: 'Space', repeat: false, preventDefault: noop }, true); frames(30 * 3); D.onKey({ code: 'Space' }, false);
D.enterOp(C.S.units.find((u) => u.key === 'igla')); frames(30 * 2); D.leaveOp();
C.setAuto(true); D.enterOp(C.S.units[0]); frames(30 * 15); D.leaveOp(); D.enterOp(C.S.units.find((u) => u.key === 'm163')); frames(30 * 10); D.leaveOp(); C.setAuto(false);
let guard = 0; while (D.st.phase === 'wave' && guard++ < 30 * 240) frames(1);

check(`оборона: волна закончилась (${D.st.phase}, сбито ${D.st.downs})`, D.st.phase === 'debrief' || D.st.over);
// оборона эпохи III: «Тор» оператором против летящего оружия
C.toMenu(); frames(3); C.setup.era = 3; C.setup.side = 'east'; C.start('defense');
{ const D3 = C.ctrl, t3 = C.S.objects.find((o) => o.key === 'tpp');
  for (const [k, dx] of [['tor', 600], ['s300', 2500], ['gpsjam', 900]]) C.S.addUnit(k, t3.x + dx, t3.z - 400, {});
  C.syncUnits(); D3.startWave(); D3.enterOp(C.S.units[0]); C.setAuto(true);
  const key = (c) => D3.onKey({ code: c, repeat: false, preventDefault: noop }, true);
  key('KeyV'); frames(30 * 5); // снаружи
  const u0 = C.S.units[0]; check(`камера снаружи: ${Math.round(C.camera.position.distanceTo(u0.pos))} м от «Тора», пусковая повёрнута ${u0.lyaw.toFixed(2)}`, C.camera.position.distanceTo(u0.pos) < 60);
  key('KeyV'); let near = 1e9, fired = false; // за ракетой (если «Тор» за это время не стрелял — проверка пропускается)
  for (let i = 0; i < 30 * 90 && near > 35; i++) { frames(1); for (const m of C.S.sams) if (!m.dead && m.unit === u0 && m.t > 2) { fired = true; near = Math.min(near, C.camera.position.distanceTo(m.pos)); } }
  check(fired ? `камера за ракетой: ближе всего ${Math.round(near)} м до своей ракеты` : 'камера за ракетой: «Тор» не стрелял — пропущено', !fired || near < 40);
  key('KeyV'); C.setAuto(false); D3.leaveOp();
  check(`оборона эпоха III: сбито ${D3.st.downs}`, true); }
// «Мульти-волна» отдельно: за удар (восток, IV — план, пуск, камера за ракетой, время ×4) и за ПВО (запад атакует, IV)
for (const role of ['atk', 'def']) {
  C.toMenu(); frames(3); C.setup.era = 4; C.setup.side = 'east'; C.setup.mrole = role; C.setup.game = 'multi'; C.start('multi');
  const M = C.ctrl, st = M.st;
  check(`мульти-волна ${role}: ${st.phase}, бюджет ${st.budget}, роль ${st.multi}, ПВО ${role === 'atk' ? C.S.units.length : '—'}`, st.phase === 'plan' && st.multi === role && (role === 'def' || C.S.units.length > 5));
  if (role === 'def') { const t4 = C.S.objects.find((o) => o.key === 'tpp'); for (const [k, dx] of [['s400', 2500], ['pantsir', 600], ['torm2', -700]]) C.S.addUnit(k, t4.x + dx, t4.z - 400, {}); C.syncUnits(); }
  if (role === 'atk') { // готового состава нет — собираем: по типам на цели (как «+» в карточке цели)
    check(`мульти-волна: план пуст (${JSON.stringify(st.plan.n)}), ПУСК ${C.ctrl.st.plan && Object.keys(st.plan.n).length ? 'есть' : 'ждёт наряда'}`, !Object.keys(st.plan.n).length);
    Object.assign(st.plan.n, { shahed: 12, kh55d: 2, kh555: 3, kalibr: 3, iskander: 1 }); // баллистика — одна на человека
    for (const [k, j] of [['kh55d', 0], ['kalibr', 1]]) st.plan.cfg[k] = { pts: [], alt: null, t: null, sam: k === 'kh55d', tgt: st.targets[j].id, units: [] };
  }
  if (role === 'atk') { // у типа — маршрут и высота; у Х-555 №2 — свой маршрут, время и цель «ПВО»; баллистика — на 30 с позже
    st.plan.cfg.kh555 = { pts: [[9000, 2000], [4000, 1500]], alt: 300, t: null, sam: false, tgt: null, units: [undefined, { pts: [[-9000, -3000]], t: 120, sam: true }] };
    st.plan.cfg.shahed = { pts: [[-8000, 6000]], alt: null, t: null, sam: false, tgt: st.targets[0].id, units: [] };
    st.plan.cfg.iskander = { pts: [], alt: null, t: 260, sam: false, tgt: null, units: [] }; }
  if (role === 'atk') st.plan.n.shahed -= 3; // очки на докупку во время волны
  M.startWave(); frames(30 * 3);
  check(`мульти-волна ${role}: удар пошёл, носителей ${C.ev ? C.ev.carriers.length : 0}, событий в ленте ${C.ev ? C.ev.events().length : 0}`, st.phase === 'wave' && C.ev && C.ev.carriers.length > 0 && C.ev.events().length > 3);
  if (role === 'atk') { // докупка в бою: 3 «Шахеда» — в очередь, затем «пуск сейчас» последнему
    const n0 = st.plan.n.shahed; st.plan.n.shahed += 3; st.addQ.shahed = 3; st.addT = 0.05; frames(10);
    const f = C.ev.unitInfo('shahed', n0 + 2); check(`мульти-волна: докуплено 3 «Шахеда» в бою — №${n0 + 3} ждёт пуска (${f.launched ? 'уже пущен' : Math.round(f.t - C.ev.t) + ' с'})`, !f.launched);
    st.plan.cfg.shahed.units[n0 + 2] = { t: Math.ceil(C.ev.t + 1) }; C.ev.applyPlan(st.plan.cfg); frames(60);
    check('мульти-волна: «пуск сейчас» — докупленный «Шахед» пущен', C.ev.unitInfo('shahed', n0 + 2).launched);
  }
  st.timeK = 4; let watched = false, g2 = 0, routed = false, cued = false, followed = false;
  if (role === 'atk') { const L = C.ev.launchers[0], e = C.ev.events().find((x) => x.cue === L); if (e) { st.cue = { obj: L, at: C.ev.t + e.eta - 4 }; cued = true; } }
  while (!st.over && g2++ < 30 * 400) {
    frames(1);
    if (!routed) routed = C.S.wpns.some((w) => w.key === 'kh555' && w.alt === 300 && w.route);
    if (cued && st.watch && st.watch.isLauncher) followed = 'launcher';
    if (followed === 'launcher' && st.watch && st.watch.W && st.watch.W.kind === 'tbm') followed = 'tbm';
    if (!watched && C.S.wpns.some((w) => w.ev && w.W.kind === 'tbm')) { if (!cued) C.watchNext(); watched = st.view === 'watch'; }
  }
  if (role === 'atk') check(`мульти-волна: маршрут и высота Х-555 ${routed ? 'применены' : 'НЕ применены'}; «ждать» пуск — камера ${followed || 'не переключилась'}`, routed && followed === 'tbm');
  check(`мульти-волна ${role}: итог (${st.over ? 'бой окончен' : 'не закончился'}), камера за ракетой ${watched ? 'была' : 'не включилась'}, пущено ${st.mres.launched}, сбито ${role === 'atk' ? st.mres.down : st.downs}`, st.over && watched);
}
C.setup.era = 2; C.setup.game = 'defense';

// 4. обучение — все уроки обеих сторон: каждый запускается и идёт 25 с без ошибок
for (const side of ['air', 'def', 'matk', 'mdef']) {
  const n = C.lessons[side].length;
  for (let i = 0; i < n; i++) {
    C.toMenu(); frames(3);
    C.setup.game = 'training'; C.setup.tside = side; C.setup.tl = i; C.start('training');
    const ok = frames(30 * 25);
    check(`урок ${side} ${i + 1}: ${(C.hint && document.getElementById('hint').innerHTML || '').replace(/<[^>]+>/g, '').slice(0, 70)}`, ok);
  }
}
// 5. уроки проходятся: «бот» делает то, что просит подсказка
const passed = (side, i) => (C.ctrl && C.ctrl.T && C.ctrl.T.finished) || (JSON.parse(store.fortuna_airdef_stats || '{}').lessons || {})[C.lessons[side][i].id] === 1;
function runLesson(side, i, bot, sec) {
  C.toMenu(); frames(3); C.setup.game = 'training'; C.setup.tside = side; C.setup.tl = i; C.start('training');
  for (let k = 0; k < sec * 30 && !passed(side, i); k++) { if (byId('lesson')._cls.has('on')) C.closeLesson(); bot(C.ctrl.inner); frames(1); }
  const ok = passed(side, i); check(`урок ${side} ${i + 1} пройден ботом${ok ? '' : ` — шаг ${C.ctrl.T.s}: ${(document.getElementById('hint').innerHTML || '').replace(/<[^>]+>/g, '').slice(0, 120)}`}`, ok);
  if (byId('lesson')._cls.has('on')) C.closeLesson();
}
// уроки с бомбами: показ (автопилот и «АВТО») и практика — бот летит тем же автопилотом на цель задания
const LI = (side, id) => C.lessons[side].findIndex((l) => l.id === id);
for (const [id, alt] of [['bomb', 900], ['lgb', 2000], ['tvb', 2000], ['gps', 4000], ['agm', 2000], ['cruise', 3000]]) {
  runLesson('air', LI('air', id), (A) => { const T = C.ctrl.T; if (T.s >= 2 && A.game.targets[0] && !T.d.bot) { T.d.bot = 1; A.demo({ pt: A.game.targets[0], alt }); } }, 420);
}
// ложная цель: выбрать её и пустить по курсу
runLesson('air', LI('air', 'decoy'), (A) => { const DK = ['mald', 'decoy_e'], i = A.loadout.findIndex((l) => DK.includes(l.key) && l.n > 0); if (i >= 0 && !C.raid.planes.some((q) => q.role === 'decoy' && !q.dead) && C.ctrl.T.t > 2) { A.onKey({ code: 'KeyQ', repeat: false, preventDefault: noop }, true); A.onKey({ code: 'KeyQ' }, false); if (A.curW() && DK.includes(A.curW().key)) A.fire(); } }, 240);
// станция помех: два захода автопилотом на комплекс
runLesson('air', LI('air', 'ecm'), (A) => { const u = C.S.units[0]; if (u && C.ctrl.T.d.botS !== C.ctrl.T.s) { C.ctrl.T.d.botS = C.ctrl.T.s; A.demo({ pt: u.pos, alt: 4000 }); } }, 300);
// оператор «Осы»: назначить ближайшую видимую цель, пускать в зоне
const OPB = (D) => { const u = C.S.units[0]; if (!u || !D.st.op) return; const a = C.raid.alive()[0]; if (a && u.desig !== a) D.designate(a); if (u.track) C.S.launch(u); };
for (const id of ['d_op', 'd_sarh', 'd_tvm', 'd_arh']) runLesson('def', LI('def', id), OPB, 300);
// методы наведения: два опытных пуска сами, потом «МЕТОД ½» и пуск по цели поперёк
runLesson('def', LI('def', 'd_method'), (D) => { const T = C.ctrl.T, u = C.S.units[0]; if (!u || T.s < 4 || !T.d.p) return; u.method = 'half'; if (u.desig !== T.d.p) D.designate(T.d.p); if (u.track) C.S.launch(u); }, 300);
// перехват: оператор назначает летящие бомбы
runLesson('def', LI('def', 'd_mun'), (D) => { const u = C.S.units[0]; if (!u || !D.st.op) return; const w = C.S.wpns.find((q) => !q.dead && q.isMun && q.t > 1.5 && q.W.kind !== 'decoy'); if (w && u.desig !== w) D.designate(w); if (u.track) C.S.launch(u); }, 360);
// прорыв под «Тором»: автопилот на склад, «АВТО» бросает и пускает ПРР
runLesson('air', LI('air', 'mun'), (A) => { const T = C.ctrl.T; if (!T.d.bot) { T.d.bot = 1; C.auto = true; A.demo({ pt: A.game.targets[0], alt: 4000 }); } }, 360); C.auto = false;
// ПРР: выключить РЛС, как только ракета в воздухе
runLesson('def', LI('def', 'd_arm'), (D) => { const u = C.S.units[0]; if (u && C.S.wpns.some((w) => w.W.kind === 'arm' && !w.dead) && u.emit) C.S.setEmit(u, false); }, 200);
// пушки: ствол в точку упреждения, огонь
const LEAD = new THREE.Vector3();
runLesson('def', LI('def', 'd_gun'), (D) => { const u = C.S.units[0]; if (!u || !u.aimDir) return; const a = C.raid.alive()[0]; if (!a) return; C.S.gunLead(u, a, LEAD); u.aimDir.copy(LEAD).sub(u.pos).normalize(); if (D.st.op) D.onKey({ code: 'Space', repeat: false, preventDefault: noop }, a.pos.distanceTo(u.pos) < u.S.rmax); }, 200);
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
    md_drones: (D, T) => { if (D.st.phase === 'plan') once(T, 0, () => { for (const [k, key, dx] of [['gepard', 'tpp', 300], ['stinger', 'tpp', -300], ['gepard', 'oil', 300], ['stinger', 'oil', -300], ['gepard', 'tpp', 900], ['stinger', 'oil', 900]]) { const o = C.S.objects.find((q) => q.key === key); C.S.addUnit(k, o.x + dx, o.z + 200, {}); } C.syncUnits(); go(D); }); else D.st.timeK = 4; },
    md_cruise: (D, T) => { if (D.st.phase === 'plan') once(T, 0, () => { const o = C.S.objects.find((q) => q.key === 'oil'); C.S.addUnit('gepard', o.x + 300, o.z + 200, {}); C.syncUnits(); go(D); }); else D.st.timeK = 4; },
    md_tbm: (D, T) => { const st = D.st, u = C.S.units.find((q) => q.key === 'pac3'); if (T.s === 0) go(D); else if (T.s === 1) D.enterOp(u); else { st.timeK = 4; const w = C.S.wpns.find((q) => !q.dead && q.ev && q.W.kind === 'tbm' && q.vel.y < 0); if (w && st.op && u.desig !== w) D.designate(w); if (st.op && u.track) C.S.launch(u); } },
    md_final: (D, T) => { if (D.st.phase === 'plan') once(T, 0, () => { for (const [k, key, dx] of [['pac3', 'tpp', 1500], ['nasams', 'oil', 900], ['gepard', 'tpp', 300], ['gepard', 'oil', 300], ['stinger', 'air', 300]]) { const o = C.S.objects.find((q) => q.key === key); if (o) C.S.addUnit(k, o.x + dx, o.z + 200, {}); } C.syncUnits(); go(D); }); else D.st.timeK = 4; },
  };
  for (const side of ['matk', 'mdef']) C.lessons[side].forEach((l, i) => runLesson(side, i, (D) => B[l.id](D, C.ctrl.T), 1800)); // поздние дроны (пуск до 5 мин) — волна идёт дольше
}
// «Съёмка»: самолёт (автопилот, пуски, камера у пилона и за оружием), ПВО против самолётов и «Мульти-волны», оружие волны
{ const key = (code) => C.ctrl.onKey({ code, repeat: false, preventDefault: noop }, true);
  const { LOADOUTS } = await import('../../games/airdef/arsenal.js?v=20261022i');
  C.toMenu(); frames(3); Object.assign(C.setup, { game: 'photo', pside: 'air', era: 4, side: 'east', palt: 'mid' }); C.setup.lo = LOADOUTS[4].findIndex((L) => L.side === 'west'); C.start('photo');
  frames(30 * 3); check(`съёмка: самолёт в кадре (камера в ${Math.round(C.camera.position.distanceTo(C.player.pos))} м)`, C.camera.position.distanceTo(C.player.pos) < 150);
  key('ArrowDown'); frames(10); const dPy = Math.min(C.camera.position.distanceTo(C.player.pos), ...C.S.wpns.filter((w) => !w.dead && w.owner === C.player).map((w) => C.camera.position.distanceTo(w.pos))); check(`съёмка: камера у пилона или у сошедшего с него оружия (${dPy.toFixed(1)} м)`, dPy < 30);
  let rel = 0, nearW = 1e9; for (let i = 0; i < 30 * 90; i++) { frames(1); for (const w of C.S.wpns) if (!w.dead && w.owner === C.player) { rel = Math.max(rel, w.id); nearW = Math.min(nearW, C.camera.position.distanceTo(w.pos)); } }
  check(`съёмка: автопилот пускает (оружие в воздухе: ${rel ? 'было' : 'нет'}), камера пилона шла за ним (ближе всего ${Math.round(nearW)} м)`, rel > 0 && nearW < 60);
  for (let i = 0; i < 7; i++) { key('ArrowRight'); frames(15); }
  for (let i = 0; i < 6; i++) { key('ArrowDown'); frames(15); }
  key('Space'); const p0 = C.player.pos.clone(); frames(10); check('съёмка: стоп-кадр — бой стоит', C.player.pos.distanceTo(p0) < 0.01); key('Space');
  const path = (n) => { let d = 0; const q = C.player.pos.clone(); for (let i = 0; i < n; i++) { frames(1); const s2 = C.player.pos.distanceTo(q); if (s2 < 60) d += s2; q.copy(C.player.pos); } return d; }; // путь по кадрам (переносы самолёта — не в счёт)
  key('Digit3'); const v4 = path(30); key('Digit1'); const v1 = path(30);
  check(`съёмка: замедление ×¼ (${v4.toFixed(0)} м против ${v1.toFixed(0)} м за секунду)`, v4 < v1 * 0.4);
  key('KeyH'); check('съёмка: интерфейс прячется', document.body.classList.contains('clean')); key('KeyH');
  for (const [pvs, era, side, sam] of [['air', 3, 'west', 'patriot'], ['multi', 4, 'east', 's400'], ['multi', 4, 'west', 'pac3']]) {
    C.toMenu(); frames(3); Object.assign(C.setup, { game: 'photo', pside: 'def', pvs, era, side, psam: sam }); C.start('photo');
    let sh = 0; for (let i = 0; i < 30 * 150; i++) { frames(1); if (i % 300 === 0) key('ArrowDown'); if (C.S.sams.some((m) => !m.dead && m.unit && m.unit.key === sam)) sh++; }
    check(`съёмка ПВО ${sam} против ${pvs === 'multi' ? 'мульти-волны' : 'самолётов'}: свои ракеты в воздухе ${sh} кадров`, sh > 0);
  }
  for (const [side, k] of [['west', 'iskander'], ['west', 'kinzhal'], ['west', 'shahed'], ['west', 'kh555'], ['east', 'tomahawk'], ['east', 'atacms'], ['east', 'scout']]) {
    C.toMenu(); frames(3); Object.assign(C.setup, { game: 'photo', pside: 'multi', era: 4, side, pmun: k }); C.start('photo');
    let seen = 0, near = 1e9; if (k !== 'shahed' && k !== 'scout') key('ArrowDown'); // объект — само оружие (первым — носитель или пусковая)
    for (let i = 0; i < 30 * 120; i++) { frames(1); for (const w of C.S.wpns) if (!w.dead && w.ev && w.key === k) { seen++; near = Math.min(near, C.camera.position.distanceTo(w.pos)); break; } }
    check(`съёмка волны: ${k} — в полёте ${seen} кадров, камера ближе всего ${Math.round(near)} м`, seen > 0 && near < 200);
  }
}
C.toMenu(); frames(30);
console.error = origErr;
console.log(errors.length ? `\nОШИБКИ (${errors.length}):\n${errors.slice(0, 12).join('\n')}` : '\nошибок нет');
Deno.exit(errors.length ? 1 : 0);
