// Фильтр целей комплекса ПВО (u.tgt, sim/strike.js tgtCat / cleanTgt / setTgt) без браузера:
//   deno run --allow-read --allow-env tools/airdef-headless/tgt-filter-test.js
// 1) разбор видов целей: самолёт, ложная цель, бомба, дрон, крылатая, баллистика; cleanTgt (мусор, пустой и полный набор — «все»);
// 2) «Мульти-волна»: С-400 без дронов не пускает по дронам и пускает по крылатым, без фильтра — по обоим;
// 3) оборона: «Панцирь» только по «бомбам» не стреляет по самолёту (ни ракетой, ни пушкой), без фильтра — стреляет; оператор (manual) фильтра не знает.
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
check('самолёт — air', tgtCat({ role: 'bomber' }) === 'air' && tgtCat({ heli: true }) === 'air');
check('ложная цель налёта: в «Мульти-волне» — cruise, в обороне от налёта — air (плашки «крылатые» там нет)', tgtCat({ role: 'decoy' }) === 'cruise' && tgtCat({ role: 'decoy' }, false) === 'air');
check('бомба и ракета с самолёта — bomb', tgtCat(mun('gbu39')) === 'bomb' && tgtCat(mun('jassm')) === 'bomb' && tgtCat(mun('kab500kr')) === 'bomb');
check('дроны — drone', tgtCat(mun('shahed', { ev: true })) === 'drone' && tgtCat(mun('scout_e', { ev: true })) === 'drone');
check('крылатые и планирующие «Мульти-волны» — cruise', tgtCat(mun('kh101', { ev: true })) === 'cruise' && tgtCat(mun('jsow', { ev: true })) === 'cruise' && tgtCat(mun('slam', { ev: true })) === 'cruise');
check('баллистика — tbm', tgtCat(mun('iskander', { ev: true })) === 'tbm' && tgtCat(mun('atacms', { ev: true })) === 'tbm');
check('cleanTgt: мусор, пусто, полный набор — «все»', cleanTgt(null) === null && cleanTgt([]) === null && cleanTgt(['x', 5, {}]) === null && cleanTgt('air') === null && cleanTgt([...TGT_CATS]) === null);
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
// бомба, идущая на комплекс: «Панцирь» с фильтром «бомбы» её берёт, с фильтром «самолёты» — нет
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
// оператор: ограничений нет — назначенный самолёт сопровождается, хотя фильтр его не включает
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
  check('«Все» — самолёт снова берётся', u.track === a);
}
console.log(fails ? `ИТОГ: ошибок ${fails}` : 'ИТОГ: всё прошло');
Deno.exit(fails ? 1 : 0);
