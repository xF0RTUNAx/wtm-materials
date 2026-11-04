// Фильтр целей комплекса ПВО (u.tgt, sim/strike.js tgtCat / cleanTgt / setTgt) без браузера:
//   deno run --allow-read --allow-env tools/airdef-headless/tgt-filter-test.js
// 1) разбор видов целей: самолёт, ложная цель, бомба, дрон, крылатая, баллистика; cleanTgt (мусор, пустой и полный набор - «все»);
// 2) «Мульти-волна»: С-400 без дронов не пускает по дронам и пускает по крылатым, без фильтра - по обоим;
// 3) оборона: «Панцирь» только по «бомбам» не стреляет по самолёту (ни ракетой, ни пушкой), без фильтра - стреляет; оператор (manual) фильтра не знает;
// 4) строка «Цели» в «Обороне» (вся игра на заглушках страницы, как ui-test.js): в налёте - «самолёты» и «бомбы», последняя волна «Мульти-волной»
//    (расстановка перед ней и сама волна) - «дроны» и «крылатые» (Mark 2026-11-02: кнопки «дроны» не было), «Обычный налёт» последней - как в налёте.
const dir = new URL('.', import.meta.url).pathname;
(0, eval)(Deno.readTextFileSync(dir + '../drone-headless/three.min.js'));
const { buildCity } = await import('../../games/airdef/city.js');
const { createStrike, MODES, TGT_CATS, tgtCat, cleanTgt } = await import('../../games/airdef/sim/strike.js');
const { makeCraft, pilotStep, setGround, fwdOf } = await import('../../games/drone/sim/core.js');
const { AG } = await import('../../games/airdef/arsenal.js');
const city = buildCity(1); setGround(city.groundH);
const X0 = 5600, Z0 = 2300; // открытое место у ТЭЦ (как в sim-test): здания не закрывают РЛС
let fails = 0; const check = (name, ok, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? ' · ' + info : ''}`); if (!ok) fails++; };
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// ── 1. виды и разбор ──
const mun = (key, o = {}) => ({ isMun: true, W: AG[key], ...o });
check('самолёт - air', tgtCat({ role: 'bomber' }) === 'air' && tgtCat({ heli: true }) === 'air');
check('ложная цель налёта: в «Мульти-волне» - cruise, в обороне от налёта - air (плашки «крылатые» там нет)', tgtCat({ role: 'decoy' }) === 'cruise' && tgtCat({ role: 'decoy' }, false) === 'air');
check('бомба и ракета с самолёта - bomb', tgtCat(mun('gbu39')) === 'bomb' && tgtCat(mun('jassm')) === 'bomb' && tgtCat(mun('kab500kr')) === 'bomb');
check('дроны - drone', tgtCat(mun('shahed', { ev: true })) === 'drone' && tgtCat(mun('scout_e', { ev: true })) === 'drone');
check('крылатые и планирующие «Мульти-волны» - cruise', tgtCat(mun('kh101', { ev: true })) === 'cruise' && tgtCat(mun('jsow', { ev: true })) === 'cruise' && tgtCat(mun('slam', { ev: true })) === 'cruise');
check('баллистика - tbm', tgtCat(mun('iskander', { ev: true })) === 'tbm' && tgtCat(mun('atacms', { ev: true })) === 'tbm');
check('cleanTgt: мусор, пусто, полный набор - «все»', cleanTgt(null) === null && cleanTgt([]) === null && cleanTgt(['x', 5, {}]) === null && cleanTgt('air') === null && cleanTgt([...TGT_CATS]) === null);
const cl = cleanTgt(['air', 'zzz', 'bomb', 'air']);
check('cleanTgt: оставляет известные виды', cl && cl.size === 2 && cl.has('air') && cl.has('bomb'));

// ── 2. «Мульти-волна»: дроны и крылатые против С-400 ──
function multiRun(tgt) {
  const launched = { drone: 0, cruise: 0 }, S = createStrike({ city, rnd, mode: () => MODES.real, aircraft: () => [], laserSpot: () => null, night: 0, hurt() {},
    fx: { samLaunch: (m) => { const c = tgtCat(m.target); if (c in launched) launched[c]++; } } });
  seed = 7;
  const u = S.addUnit('s400', X0, Z0, { skill: 1 }); u.emit = true; if (tgt) S.setTgt(u, tgt);
  const at = new THREE.Vector3(X0, 0, Z0);
  // дрон и крылатая идут на комплекс с юга (по 3 шт.), чтобы пуски были в любом случае
  for (let i = 0; i < 3; i++) {
    S.spawnMun('shahed', new THREE.Vector3(X0 - 400 + i * 400, 150, Z0 - 9000), at.clone(), {});
    S.spawnMun('kh101', new THREE.Vector3(X0 - 300 + i * 300, 60, Z0 - 10000), at.clone(), {});
  }
  for (let t = 0; t < 120; t += 0.05) S.step(0.05);
  return launched;
}
const all = multiRun(null), noDrone = multiRun(['cruise', 'tbm']), onlyDrone = multiRun(['drone']);
console.log('  без фильтра', JSON.stringify(all), '· без дронов', JSON.stringify(noDrone), '· только дроны', JSON.stringify(onlyDrone));
check('С-400 без фильтра пускает по крылатым', all.cruise > 0);
check('С-400 без дронов не пускает по дронам', noDrone.drone === 0);
check('С-400 без дронов пускает по крылатым', noDrone.cruise > 0);
check('С-400 только по дронам не пускает по крылатым', onlyDrone.cruise === 0);

// ── 3. оборона: «Панцирь» против самолёта ──
function planeRun(tgt, manual = false) {
  seed = 7;
  const a = makeCraft({ milAcc: 16, abAcc: 34, cd0: 1.3e-4, rollK: 9, ir: 0.8, r: 7, gmax: 12, wCap: 0.95, agil: 9, vStall: 60, bleed: 0.6, speed: 200, thr: 0.9 });
  a.rcs = 5; a.hp = 1e6;
  let sams = 0, guns = 0, bombs = 0;
  const S = createStrike({ city, rnd, mode: () => MODES.real, aircraft: () => [a], laserSpot: () => null, night: 0, hurt(t, d) { a.hp -= d; },
    fx: { samLaunch: (m) => { if (m.target === a) sams++; else bombs++; }, gunFire: (u, t) => { if (t === a) guns++; } } });
  const u = S.addUnit('pantsir', X0, Z0, { skill: 1 }); u.emit = true; if (tgt) S.setTgt(u, tgt); if (manual) S.setManual(u, true);
  a.pos.set(X0 + 300, 600, Z0 + 6000); a.yaw = 0; a.pitch = 0; a.speed = 200; fwdOf(a, a.vel).multiplyScalar(200);
  for (let t = 0; t < 60 && !a.dead; t += 1 / 30) {
    pilotStep(a, 0, 0, 1 / 30); a.pos.y = 600; a.pitch = 0;
    S.step(1 / 30);
  }
  return { sams, guns, track: !!u.track, u };
}
const pAll = planeRun(null), pBomb = planeRun(['bomb']), pBombDrone = planeRun(['bomb', 'drone']);
console.log('  без фильтра', JSON.stringify({ ...pAll, u: 0 }), '· только бомбы', JSON.stringify({ ...pBomb, u: 0 }));
check('«Панцирь» без фильтра стреляет по самолёту', pAll.sams + pAll.guns > 0);
check('«Панцирь» только по бомбам не стреляет по самолёту и не сопровождает его', pBomb.sams === 0 && pBomb.guns === 0 && !pBomb.track);
check('«Панцирь» по бомбам и дронам не стреляет по самолёту', pBombDrone.sams === 0 && pBombDrone.guns === 0);
// бомба, идущая на комплекс: «Панцирь» с фильтром «бомбы» её берёт, с фильтром «самолёты» - нет
function bombRun(tgt) {
  seed = 7;
  const a = makeCraft({ speed: 200 }); a.rcs = 5; a.hp = 1e6; a.pos.set(X0, 2500, Z0 + 5000); a.vel.set(0, 0, -200);
  let shots = 0;
  const S = createStrike({ city, rnd, mode: () => MODES.real, aircraft: () => [a], laserSpot: () => null, night: 0, hurt() {},
    fx: { samLaunch: (m) => { if (m.target.isMun) shots++; }, gunFire: (u, t) => { if (t.isMun) shots++; } } });
  const u = S.addUnit('pantsir', X0, Z0, { skill: 1 }); u.emit = true; if (tgt) S.setTgt(u, tgt);
  S.release(a, 'fab500', { aim: new THREE.Vector3(X0, 0, Z0) });
  for (let t = 0; t < 40; t += 0.05) { a.pos.y = 5000; S.step(0.05); }
  return shots;
}
const bAll = bombRun(null), bBomb = bombRun(['bomb']), bAir = bombRun(['air']);
console.log('  по бомбе: без фильтра', bAll, '· «бомбы»', bBomb, '· «самолёты»', bAir);
check('«Панцирь» по бомбам берёт бомбу', bBomb > 0);
check('«Панцирь» только по самолётам бомбу не берёт', bAir === 0);
// оператор: ограничений нет - назначенный самолёт сопровождается, хотя фильтр его не включает
{
  seed = 7; const a = makeCraft({ speed: 200 }); a.rcs = 5; a.hp = 1e6; a.pos.set(X0 + 300, 600, Z0 + 3000); a.vel.set(0, 0, -50);
  const S = createStrike({ city, rnd, mode: () => MODES.real, aircraft: () => [a], laserSpot: () => null, night: 0, hurt() {}, fx: {} });
  const u = S.addUnit('pantsir', X0, Z0, { skill: 1 }); u.emit = true; S.setTgt(u, ['bomb']); S.setManual(u, true); S.designate(u, a);
  for (let t = 0; t < 10; t += 0.05) { a.pos.addScaledVector(a.vel, 0.05); S.step(0.05); }
  check('оператор: фильтр не мешает назначить самолёт', u.track === a, u.track ? 'захват' : 'нет захвата');
}
// смена фильтра снимает сопровождение цели не того вида; «все» возвращает
{
  seed = 7; const a = makeCraft({ speed: 200 }); a.rcs = 5; a.hp = 1e6; a.pos.set(X0 + 300, 600, Z0 + 4000); a.vel.set(0, 0, -50);
  const S = createStrike({ city, rnd, mode: () => MODES.real, aircraft: () => [a], laserSpot: () => null, night: 0, hurt() {}, fx: {} });
  const u = S.addUnit('pantsir', X0, Z0, { skill: 1 }); u.emit = true;
  for (let t = 0; t < 40 && !u.track; t += 0.05) { a.pos.addScaledVector(a.vel, 0.05); S.step(0.05); }
  const had = u.track === a; S.setTgt(u, ['bomb']);
  check('смена фильтра снимает захват самолёта', had && !u.track, had ? '' : 'захвата не было');
  for (let t = 0; t < 5; t += 0.05) { a.pos.addScaledVector(a.vel, 0.05); S.step(0.05); }
  check('с фильтром «бомбы» самолёт заново не берётся', !u.track);
  S.setTgt(u, null);
  for (let t = 0; t < 10 && !u.track; t += 0.05) { a.pos.addScaledVector(a.vel, 0.05); S.step(0.05); }
  check('«Все» - самолёт снова берётся', u.track === a);
}

// ── 4. «Оборона»: строка «Цели» в последней волне «Мульти-волной» (defense.js tmode) ──
{
  const noop = () => {};
  const ctx2d = () => new Proxy({ createRadialGradient: () => ({ addColorStop: noop }), createLinearGradient: () => ({ addColorStop: noop }), measureText: () => ({ width: 10 }), getImageData: () => ({ data: new Uint8ClampedArray(4) }) },
    { get: (t, p) => (p in t ? t[p] : noop), set: (t, p, v) => { t[p] = v; return true; } });
  const els = new Map();
  const el = (id) => { const e = {
    id, style: {}, dataset: {}, innerHTML: '', textContent: '', width: 300, height: 150, _cls: new Set(), children: [],
    classList: { add: (...c) => c.forEach((x) => e._cls.add(x)), remove: (...c) => c.forEach((x) => e._cls.delete(x)), toggle: (c, on) => { const v = on === undefined ? !e._cls.has(c) : on; if (v) e._cls.add(c); else e._cls.delete(c); return v; }, contains: (c) => e._cls.has(c) },
    addEventListener: (t, f) => { (e._ev ||= {})[t] = f; }, removeEventListener: noop, setPointerCapture: noop, releasePointerCapture: noop,
    lastChild: { innerHTML: '', textContent: '' }, querySelector: () => el('q'), querySelectorAll: () => [], getContext: () => ctx2d(), getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 300 }),
    appendChild: noop, insertBefore: noop, remove: noop, closest: () => null, focus: noop, offsetWidth: 1, parentNode: null, toBlob: noop, toDataURL: () => '' }; return e; };
  const byId = (id) => { if (!els.has(id)) els.set(id, el(id)); return els.get(id); };
  const store = {};
  Object.assign(globalThis, {
    window: globalThis, devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720,
    document: { getElementById: byId, createElement: () => el('new'), body: el('body'), documentElement: el('html'), addEventListener: noop, hidden: false },
    matchMedia: () => ({ matches: false }), addEventListener: noop, removeEventListener: noop,
    location: { search: '?test=1&gfx=low&weather=day&map=city', href: 'http://x/airdef.html' },
  });
  Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } }, configurable: true, writable: true });
  let rafCb = null; globalThis.requestAnimationFrame = (f) => { rafCb = f; return 1; };
  THREE.WebGLRenderer = class { // рендерер-заглушка: все вызовы WebGL - пустые
    constructor() { this.shadowMap = { enabled: false, autoUpdate: true }; this.capabilities = { isWebGL2: true, getMaxAnisotropy: () => 4 }; this.toneMapping = 0; this.outputEncoding = 0; this.toneMappingExposure = 1; this.autoClear = true; this._pr = 1; this.domElement = el('c'); this.info = { memory: {}, programs: [], render: { calls: 0, triangles: 0 }, reset() {} }; }
    setPixelRatio(p) { this._pr = p; } getPixelRatio() { return this._pr; } setSize() {} render() {} compile() {} setRenderTarget() {} getRenderTarget() { return null; }
    setScissor() {} setScissorTest() {} setViewport() {} clear() {} getContext() { return {}; } getClearColor(c) { return c; } getClearAlpha() { return 1; } setClearColor() {}
  };
  const errors = []; console.error = (...a) => { errors.push(a.join(' ')); };
  await import('../../games/airdef/main.js');
  for (let i = 0; i < 300 && !(globalThis.__a && globalThis.__a.state === 'menu'); i++) await new Promise((r) => setTimeout(r, 100)); // запуск по этапам (экран загрузки)
  const C = globalThis.__a; let now = 1000;
  const frames = (n) => { for (let i = 0; i < n; i++) { now += 1000 / 30; const f = rafCb; rafCb = null; try { f(now); } catch (e) { errors.push(`кадр: ${e.stack}`); return; } } };
  const kinds = () => [...byId('dside').innerHTML.matchAll(/data-a="tg" data-k="(\w+)"/g)].map((m) => m[1]).join(',');
  const press = (a, k) => byId('dside').onclick({ target: { closest: (s) => (s === '[data-a]' ? { dataset: { a, k } } : null) } }); // нажатие кнопки боковой панели
  C.toMenu(); frames(5);
  Object.assign(C.setup, { era: 4, lo: 0, side: 'east', cs: true, game: 'defense' }); C.start('defense');
  const D = C.ctrl, st = D.st, t = C.S.objects.find((o) => o.key === 'tpp');
  const u = C.S.addUnit('pantsir', t.x + 500, t.z + 200, {}); u.paid = 100; C.syncUnits(); frames(3);
  const show = () => { st.sel = u; D.renderSide(); return kinds(); };
  const k1 = show();
  st.wave = st.waves - 1; // как будто прошли все волны, кроме последней
  C.setup.cs = false; const kPlain = show(); C.setup.cs = true; const kPlan = show();
  D.startWave(); frames(10); const kWave = show();
  console.log(`  «Панцирь», кнопки «Цели»: налёт - ${k1} · перед последней «Мульти-волной» - ${kPlan} · в ней - ${kWave} · «Обычный налёт» последней - ${kPlain}`);
  check('«Оборона», налёт: «самолёты» и «бомбы»', k1 === 'air,bomb');
  check('«Оборона», расстановка перед последней волной «Мульти-волной»: «дроны» и «крылатые»', kPlan === 'drone,cruise');
  check('«Оборона», последняя волна «Мульти-волной» идёт: «дроны» и «крылатые»', !!C.ev && kWave === 'drone,cruise', C.ev ? '' : 'удара нет');
  check('«Оборона», последняя волна «Обычным налётом»: как в налёте', kPlain === 'air,bomb');
  press('tg', 'cruise');
  check('последняя волна: «крылатые» выключены - дроны берутся, самолёты (кнопки нет) не выключаются', u.tgt && u.tgt.has('drone') && !u.tgt.has('cruise') && u.tgt.has('air'), u.tgt ? [...u.tgt].join(',') : 'все');
  check('последняя волна: в сводке комплекса - «цели: дроны»', byId('dside').innerHTML.includes('цели: дроны'));
  press('tgall'); check('последняя волна: «Все» - снова все', !u.tgt);
  check('ошибок выполнения нет', !errors.length, errors.slice(0, 3).join(' | '));
}
console.log(fails ? `ИТОГ: ошибок ${fails}` : 'ИТОГ: всё прошло');
Deno.exit(fails ? 1 : 0);
