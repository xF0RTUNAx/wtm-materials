// Безголовая проверка боя «Воздушного превосходства» (sim/strike.js) без браузера:
//   deno run --allow-read tools/airdef-headless/sim-test.js
// Сценарии: пролёт над ПВО на высоте и на малой высоте между домами, сброс КАБ-500Кр и GBU-12, ПРР против «Осы».
const dir = new URL('.', import.meta.url).pathname;
(0, eval)(Deno.readTextFileSync(dir + '../drone-headless/three.min.js'));
const { buildCity, riverX } = await import('../../games/airdef/city.js');
const { createStrike, MODES, predictBomb } = await import('../../games/airdef/sim/strike.js');
const { makeCraft, pilotStep, steerTo, fwdOf, setGround } = await import('../../games/drone/sim/core.js');
const { AG } = await import('../../games/airdef/arsenal.js');

let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const city = buildCity(1); setGround(city.groundH);
function scenario(name, setup, T = 120) {
  seed = 7;
  const log = []; let hp = 100;
  const a = makeCraft({ milAcc: 16, abAcc: 34, cd0: 1.3e-4, rollK: 9, ir: 0.8, r: 7, gmax: 12, wCap: 0.95, agil: 9, vStall: 60, bleed: 0.6, speed: 250, thr: 0.9 });
  a.rcs = 5; a.hp = 100;
  let laser = null;
  const S = createStrike({ city, rnd, mode: () => MODES.real, aircraft: () => [a], laserSpot: () => laser, night: 0,
    hurt: (t, d, by) => { hp -= d; log.push(`  урон ${d.toFixed(0)} от ${by}, hp ${hp.toFixed(0)}`); if (hp <= 0 && !t.dead) { t.dead = true; log.push('  СБИТ'); } },
    fx: { samLaunch: (m) => log.push(`  пуск ${m.S.short} с ${(m.pos.distanceTo(a.pos) / 1000).toFixed(1)} км`),
      samEnd: (m, hit) => log.push(`  ракета ${m.S.short}: ${hit ? 'ПОПАЛА' : m.lost ? 'потеряла цель' : 'мимо'}`),
      radarState: (u) => log.push(`  РЛС ${u.S.short}: ${u.emit ? (u.track ? 'захват' : 'обзор') : 'выкл'}`),
      wpnEnd: (w, r) => log.push(`  ${w.W.short}: взрыв, задело объектов ${r.objects.length} (${r.objects.map((o) => o.name + ' ' + Math.max(0, o.hp).toFixed(0)).join(', ')}), комплексов ${r.units.length}`),
      objectDestroyed: (o) => log.push(`  УНИЧТОЖЕН ${o.name}`), unitDestroyed: (u) => log.push(`  УНИЧТОЖЕН комплекс ${u.S.short}`) } });
  const ctl = setup(S, a, (p) => { laser = p; });
  const dt = 1 / 30;
  for (let t = 0; t < T && !a.dead; t += dt) {
    const [rx, ry] = ctl.steer ? ctl.steer(t) : [0, 0];
    pilotStep(a, rx, ry, dt);
    a.pos.y = Math.max(a.pos.y, city.topAt(a.pos.x, a.pos.z) + 5);
    if (ctl.tick) ctl.tick(t, dt);
    S.step(dt);
  }
  console.log(`\n== ${name}: hp ${Math.max(0, hp).toFixed(0)}${a.dead ? ' (сбит)' : ''}`); console.log(log.join('\n'));
  return S;
}
// 1. пролёт на 3 км над «Осой» и «Vulcan» у ТЭЦ
scenario('пролёт 3 км над Осой и Vulcan', (S, a) => {
  S.addUnit('osa', 5600, 2300); S.addUnit('m163', 6200, 1900);
  a.pos.set(5800, 3000, 16000); a.yaw = 0; a.pitch = 0; a.speed = 250;
  return { steer: (t) => { const d = new THREE.Vector3(5800 - a.pos.x, 3000 - a.pos.y, -16000 - a.pos.z).normalize(); return steerTo(a, d); } };
}, 90);
// 2. та же трасса на 60 м между домами
scenario('пролёт 60 м над Осой и Vulcan', (S, a) => {
  S.addUnit('osa', 5600, 2300); S.addUnit('m163', 6200, 1900);
  a.pos.set(5800, 60, 16000); a.yaw = 0; a.pitch = 0; a.speed = 250;
  return { tick: () => { a.pos.y = city.topAt(a.pos.x, a.pos.z) + 60; a.pitch = 0; a.q = null; } };
}, 90);
// 3. КАБ-500Кр по ТЭЦ с 5 км, ГСН захватила точку
scenario('КАБ-500Кр по складу боеприпасов', (S, a) => {
  const tpp = city.objects.find((o) => o.key === 'tpp');
  a.pos.set(tpp.x, 5000, tpp.z + 7000); a.yaw = 0; a.pitch = 0; a.speed = 250; fwdOf(a, a.vel).multiplyScalar(250);
  const aim = new THREE.Vector3(tpp.x, city.topAt(tpp.x, tpp.z), tpp.z);
  const p = new THREE.Vector3(); const tImp = predictBomb(city, AG.kab500kr, a.pos, a.vel, aim, p);
  console.log(`  прогноз: упадёт через ${tImp.toFixed(1)} с в ${p.distanceTo(aim).toFixed(0)} м от точки`);
  S.release(a, 'kab500kr', { aim });
  return {};
}, 60);
// 4. GBU-12 по НПЗ с подсветом
scenario('GBU-12 с подсветом по складу горючего', (S, a, setLaser) => {
  const o = city.objects.find((q) => q.key === 'oil');
  a.pos.set(o.x - 6000, 4500, o.z); a.yaw = -Math.PI / 2; a.pitch = 0; a.speed = 240; fwdOf(a, a.vel).multiplyScalar(240);
  const spot = new THREE.Vector3(o.x, city.topAt(o.x, o.z), o.z);
  S.release(a, 'gbu12', {}); setLaser(spot);
  return { steer: () => [0, 0] };
}, 60);
// 5. Х-58 по «Осе», которая не выключает РЛС / выключает (у Shrike — промах)
for (const key of ['kh58', 'agm45']) scenario(`${key} по Осе`, (S, a) => {
  const u = S.addUnit('osa', 0, 0, { skill: 1 }); u.emit = true;
  a.pos.set(0, 6000, 14000); a.yaw = 0; a.pitch = 0; a.speed = 250; fwdOf(a, a.vel).multiplyScalar(250);
  S.release(a, key, { target: u });
  return { steer: () => [1, 0.3] };
}, 80);

// 6. Волна ИИ-ударников против расстановки ПВО (игра за ПВО и фон меню)
const { createRaid } = await import('../../games/airdef/sim/raid.js');
const { SAM, DEFENSE } = await import('../../games/airdef/arsenal.js');
function waveTest(defSide, era, n, wave, seed0) {
  seed = seed0;
  let raid = null; const ev = { launches: 0, down: 0, out: 0, rel: 0, kills: [], icpt: 0, jam: 0, decoys: 0 };
  const S = createStrike({ city, rnd, mode: () => MODES.real, aircraft: () => (raid ? raid.alive() : []), laserSpot: (a) => raid.laserSpot(a), night: 0,
    hurt: (a, d) => raid.hurt(a, d), spawnDecoy: (a, k, aim) => { ev.decoys++; raid.spawnDecoy(a, k, aim); }, fx: { wpnEnd: (w, r) => { if (r.intercepted) ev.icpt++; }, wpnJammed: () => ev.jam++, samLaunch: () => ev.launches++, objectDestroyed: (o) => ev.kills.push(o.name), unitDestroyed: (u) => ev.kills.push('ЗРК ' + u.S.short) } });
  raid = createRaid(S, city, rnd, { side: defSide === 'east' ? 'west' : 'east', era, fx: { down: () => ev.down++, out: () => ev.out++, release: () => ev.rel++ } });
  const targets = ['tpp', 'oil', 'gov'].map((k) => S.objects.find((o) => o.key === k));
  const free = (x, z) => city.bldAt(x, z) === 0 && Math.abs(x - riverX(z)) > 130;
  let ti = 0;
  for (const [key, cnt] of DEFENSE[defSide][era]) for (let i = 0; i < cnt; i++) {
    const Sx = SAM[key], t = targets[ti++ % 3]; let x, z, k = 0;
    do { const a = rnd() * 6.28, r = Sx.rmax >= 15000 ? 2500 + rnd() * 4000 : 250 + rnd() * 1200; x = (Sx.rmax >= 15000 ? 500 : t.x) + Math.cos(a) * r; z = (Sx.rmax >= 15000 ? -300 : t.z) + Math.sin(a) * r; } while (!free(x, z) && k++ < 200);
    S.addUnit(key, x, z, { skill: 0.5 + rnd() * 0.45 });
  }
  raid.spawnWave(n, wave, targets);
  const dt = 1 / 30;
  for (let t = 0; t < 300; t += dt) { raid.step(dt); S.step(dt); if (raid.planes.every((a) => a.dead || a.out)) break; }
  console.log(`  ПВО ${defSide} ${era}, волна ${wave} ×${n}: сбито ${ev.down}, ушли ${ev.out}, сбросов ${ev.rel}, пусков ЗУР ${ev.launches}, перехвачено ${ev.icpt}, ЛЦ ${ev.decoys}, помехи нав. ${ev.jam}; уничтожено: ${ev.kills.join(', ') || '—'}`);
}
console.log('\n== волны');
for (const [side, era] of [['east', 2], ['west', 2], ['east', 1], ['east', 3], ['west', 3], ['east', 4], ['west', 4]]) for (const w of [1, 3]) waveTest(side, era, 2 + w * 2, w, 11 + w);

// 7. Старт ракет по типам пусковых: выброс, запуск двигателя, склонение, отделение ускорителя, итог по цели
console.log('\n== старты');
function launchTest(key) {
  seed = 5;
  const Sx = SAM[key], far = Sx.rmax > 9000, ev = [];
  const a = makeCraft({ milAcc: 16, abAcc: 34, cd0: 1.3e-4, rollK: 9, ir: 0.8, r: 7, gmax: 12, wCap: 0.95, agil: 9, vStall: 60, bleed: 0.6, speed: 230, thr: 0.9 });
  a.rcs = 5; a.hp = 100;
  const S = createStrike({ city, rnd, mode: () => MODES.real, aircraft: () => [a], laserSpot: () => null, night: 0, hurt: (t, d) => { a.hp -= d; if (a.hp <= 0) t.dead = true; },
    fx: { samIgnite: (m) => ev.push(`запуск двиг. ${m.t.toFixed(2)} с на +${(m.pos.y - m.unit.pos.y).toFixed(0)} м (v ${m.speed.toFixed(0)})`),
      samStage: (m) => ev.push(`ускоритель отделился ${m.t.toFixed(1)} с, v ${m.speed.toFixed(0)}`),
      samEnd: (m, hit) => ev.push(hit ? `ПОПАЛА ${m.t.toFixed(1)} с` : `мимо ${m.t.toFixed(1)} с`) } });
  const u = S.addUnit(key, 2400, 8600, { skill: 0.9, yaw: 1.0 });
  u.ambush = false; u.emit = true;
  const D = far ? 9000 : 3500, H = far ? 3000 : 1200;
  a.pos.set(u.pos.x + D * 0.6, H, u.pos.z + D * 0.8); a.yaw = Math.atan2(0.6, 0.8); a.pitch = 0; a.speed = 230; fwdOf(a, a.vel).multiplyScalar(230);
  let m = null; const dt = 1 / 60; const snap = [];
  for (let t = 0; t < 40 && !a.dead; t += dt) {
    pilotStep(a, 0, 0, dt); S.step(dt);
    if (!m && S.sams.length) { m = S.sams[0]; ev.push(`пуск ${t.toFixed(1)} с, слот ${m.slot}, +${(m.pos.y - u.pos.y).toFixed(1)} м, наклон ${(Math.asin(m.dir.y) * 57.3).toFixed(0)}°`); }
    if (m && !m.dead) for (const ts of [0.5, 1.2, 2.5]) if (m.t >= ts && !snap.includes(ts)) { snap.push(ts); ev.push(`${ts} с: +${(m.pos.y - u.pos.y).toFixed(0)} м, v ${m.speed.toFixed(0)}, наклон ${(Math.asin(m.dir.y) * 57.3).toFixed(0)}°`); }
    if (m && m.dead) break;
  }
  console.log(`  ${Sx.short} [${(LNCH[key] || {}).mode}]: ${ev.join(' · ') || 'не стрелял'}`);
}
const { LNCH } = await import('../../games/airdef/launchers.js');
for (const key of Object.keys(SAM)) if (SAM[key].msl && SAM[key].type !== 'jammer') launchTest(key);
