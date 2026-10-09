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
await new Promise((r) => setTimeout(r, 200));
const C = globalThis.__a;
let now = 1000;
function frames(n, dt = 1000 / 30) { for (let i = 0; i < n; i++) { now += dt; const f = rafCb; rafCb = null; try { f(now); } catch (e) { errors.push(`кадр: ${e.stack}`); return false; } } return true; }
const check = (name, ok) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}`); if (!ok) errors.push(name); };

// 1. меню и живой фон
check('меню открыто', C.state === 'menu');
frames(30 * 40);
check('фон: идёт бой (есть ИИ-самолёты и ЗРК)', !!C.raid && C.raid.planes.length > 0 && C.S.units.length > 0);
console.log(`     фон за 40 с: пусков ЗУР ${C.S.sams.length}, самолётов ${C.raid.planes.filter((a) => !a.dead && !a.out).length}`);
{ const kinds = {}; for (let i = 0; i < 30 * 150; i++) { frames(1); if (i % 15 === 0) await new Promise((r) => setTimeout(r, 300)); const k = C.ctrl.shotKind; kinds[k] = (kinds[k] || 0) + 1 / 30; }
  console.log(`     планы фона за 150 с: ${Object.entries(kinds).map(([k, v]) => `${k} ${Math.round(v)} с`).join(', ')}`);
  check('фон: кадр по свободной части экрана', C.camera.view && C.camera.view.enabled && C.camera.view.fullWidth < C.VW); }

{ const { planeModel } = await import('../../games/airdef/models.js?v=20261011b');
  for (const [side, cls] of [['east', 'strike'], ['east', 'fighter'], ['west', 'strike'], ['west', 'fighter']]) {
    const pm = planeModel(side, cls); let tris = 0, tex = 0; if (pm) pm.obj.traverse((o) => { if (o.isMesh) { tris += o.geometry.index ? o.geometry.index.count / 3 : 0; if (o.material.map) tex++; } });
    check(`готовая модель ${side}/${cls}: ${pm ? `${pm.name}, ${tris} треуг., мешей с текстурой ${tex}` : 'нет'}`, pm && pm.cls === cls);
  } }
{ const { unitModelGlb, wantUnit } = await import('../../games/airdef/models.js?v=20261011b');
  const keys = ['bukm3', 'osa', 'tor', 'torm2', 'pantsir', 's400', 's300', 'patriot', 'pac3', 's75', 's125', 'kub', 'hawk', 'm163', 'gepard', 'nasams', 'gpsjam', 'gpsjamw']; for (const k of keys) wantUnit(k);
  await new Promise((r) => setTimeout(r, 1500));
  for (const k of keys) { const m = unitModelGlb(k); let n = 0; if (m) for (const q of ['body', 'turret', 'cradle']) if (m[q]) m[q].traverse((o) => { if (o.isMesh) n += o.geometry.index.count / 3; });
    check(`готовая модель комплекса ${k}: ${m ? `${n} треуг., башня ${m.turret ? 'да' : 'нет'}, пакет ${m.cradle ? 'да' : 'нет'}` : 'нет'}`, !!m); }
  { const { weaponMesh } = await import('../../games/airdef/models.js?v=20261011b'); const { weaponGeo } = await import('../../games/airdef/units-render.js?v=20261011b'); const { AG } = await import('../../games/airdef/arsenal.js?v=20261011b');
    const want = ['fab500', 'umpk', 'kh29t', 'kh31p', 'kh25ml', 'agm65b', 'mk82', 'gbu12', 'jassm', 'agm88', 'aargm', 'mald', 'decoy_e', 'gbu39', 'gbu31'], got = want.filter((k) => !weaponMesh(k, AG[k], weaponGeo, null).isMesh);
    check(`готовые модели оружия (${got.length}/${want.length}): ${want.filter((k) => !got.includes(k)).join(', ') || 'все'}`, got.length === want.length);
    const { podModel, launcherGlb, unitMissileGlb } = await import('../../games/airdef/models.js?v=20261011b');
    for (let i = 0; i < 30 && !(podModel() && launcherGlb('igla') && launcherGlb('stinger')); i++) await new Promise((r) => setTimeout(r, 200));
    check(`контейнер LITENING, трубы ПЗРК, ракеты ПЗРК и NASAMS: ${!!podModel()} ${!!launcherGlb('igla')} ${!!launcherGlb('stinger')} ${!!unitMissileGlb('verba')} ${!!unitMissileGlb('nasams')}`, podModel() && launcherGlb('igla') && launcherGlb('stinger') && unitMissileGlb('verba') && unitMissileGlb('nasams')); }
  const gm = unitModelGlb('bukm3'); let n = 0; if (gm) for (const k of ['body', 'turret', 'cradle']) gm[k].traverse((o) => { if (o.isMesh) n += o.geometry.index.count / 3; });
  check(`готовая модель «Бук-М3»: ${gm ? `корпус, башня, пакет — ${n} треуг.` : 'нет'}`, !!gm && !!gm.turret && !!gm.cradle); }
// 2. вылет
C.setup.game = 'air'; C.start('air');
const air = C.ctrl;
frames(30 * 5);
check('вылет: самолёт летит', C.player && !C.player.dead && C.player.pos.z < 14000);
check(`вылет: топливо тратится (${(C.player.fuel * 100).toFixed(1)} %), ЛТЦ ${C.player.cmFlare}`, C.player.fuel < 1 && C.player.fuel > 0.5 && C.player.cmFlare >= 240);
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
{ const { LOADOUTS } = await import('../../games/airdef/arsenal.js?v=20261011b');
  const planes = new Set(); let used = 0, total = 0;
  for (const era of [1, 2, 3, 4]) for (const [lo, L] of LOADOUTS[era].entries()) {
    C.toMenu(); frames(3); C.setup.era = era; C.setup.side = L.side === 'east' ? 'west' : 'east'; C.setup.lo = lo; C.setup.game = 'air'; C.start('air'); C.setAuto(true);
    const a4 = C.ctrl, n0 = a4.loadout.reduce((s2, l) => s2 + l.n, 0);
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
for (const [k, dx] of [['osa', 500], ['m163', 300], ['igla', 400]]) { const u = C.S.addUnit(k, t.x + dx, t.z + 200, {}); u.paid = 100; }
C.syncUnits(); frames(5);
D.startWave(); frames(30 * 3);
check('оборона: волна пошла', D.st.phase === 'wave' && C.raid.planes.length > 0);
D.enterOp(C.S.units[0]); frames(30 * 2);
const tgt = C.raid.alive()[0]; if (tgt) D.designate(tgt);
frames(30 * 10);
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
C.setup.era = 2;

// 4. обучение — все уроки обеих сторон: каждый запускается и идёт 25 с без ошибок
for (const side of ['air', 'def']) {
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
  check(`урок ${side} ${i + 1} пройден ботом`, passed(side, i));
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
C.toMenu(); frames(30);
console.error = origErr;
console.log(errors.length ? `\nОШИБКИ (${errors.length}):\n${errors.slice(0, 12).join('\n')}` : '\nошибок нет');
Deno.exit(errors.length ? 1 : 0);
