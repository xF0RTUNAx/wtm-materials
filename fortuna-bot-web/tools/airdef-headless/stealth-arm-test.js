// Проверка малозаметности и ПРР в режиме памяти (Mark 2026-11-23), без браузера:
//   deno run --allow-read tools/airdef-headless/stealth-arm-test.js
// 1. Стелс: захват РЛС дольше на STEALTH.acq, дальность обнаружения ×range, после пуска оружия - как обычный REVEAL_T секунд.
// 2. ПРР с памятью: РЛС выключили рано - промах (ошибка растёт в «темноте»), поздно - попадание; Shrike без памяти - промах.
// 3. ПРР со спутниковой навигацией (Х-31П) у станции подавления навигации - уход; AARGM - всё равно находит молчащую машину.
const dir = new URL('.', import.meta.url).pathname;
(0, eval)(Deno.readTextFileSync(dir + '../drone-headless/three.min.js'));
const { buildCity } = await import('../../games/airdef/city.js');
const { createStrike, MODES } = await import('../../games/airdef/sim/strike.js');
const { makeCraft, fwdOf, setGround, pilotStep } = await import('../../games/drone/sim/core.js');
const { STEALTH, REVEAL_T } = await import('../../games/airdef/arsenal.js');

let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const city = buildCity(1); setGround(city.groundH);
let bad = 0; const ok = (c, t) => { console.log((c ? 'OK   ' : 'ОШИБКА ') + t); if (!c) bad++; };
const plane = (model) => { const a = makeCraft({ milAcc: 16, abAcc: 34, cd0: 1.3e-4, rollK: 9, ir: 0.8, r: 7, gmax: 12, wCap: 0.95, agil: 9, vStall: 60, bleed: 0.6, speed: 250, thr: 0.9 }); a.rcs = 6; a.hp = 100; a.model = model; return a; };
const sim = (A, ev = {}) => createStrike({ city, rnd, mode: () => MODES.real, aircraft: () => A, laserSpot: () => null, night: 0, hurt: () => {}, fx: new Proxy(ev, { get: (o, k) => o[k] || (() => {}) }) });

// ── 1. малозаметность ──
function lockTime(model) {
  seed = 7; const a = plane(model), S = sim([a]);
  const u = S.addUnit('patriot', 0, 0, { skill: 1 }); u.ambush = false; u.emit = true;
  a.pos.set(0, 6000, 30000); a.yaw = 0; a.pitch = 0; a.speed = 0; a.vel.set(0, 0, -0.01); // висит на 30 км - видно с первого кадра
  const dt = 1 / 30; for (let t = 0; t < 20; t += dt) { S.step(dt); if (u.track === a) return t; }
  return null;
}
function seeRange(model, reveal = false) {
  const a = plane(model), S = sim([a]); const u = S.addUnit('patriot', 0, 0, { skill: 1 }); u.emit = true; if (reveal) a.revealT = 1;
  let lo = 1000, hi = 400000; a.vel.set(0, 0, -100);
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; a.pos.set(0, 9000, m); if (S.radarSees(u, a)) lo = m; else hi = m; }
  return lo;
}
// онлайн: у людей model - сторона, у ботов - машина роли; машина - в plane. Наружный груз (inBay false) малозаметность снимает
function lockOnline(model, pl, inBay) { seed = 7; const a = plane(model); a.plane = pl; a.inBay = inBay; const S = sim([a]), u = S.addUnit('patriot', 0, 0, { skill: 1 }); u.ambush = false; u.emit = true;
  a.pos.set(0, 6000, 30000); a.yaw = 0; a.pitch = 0; a.speed = 0; a.vel.set(0, 0, -0.01); const dt = 1 / 30; for (let t = 0; t < 20; t += dt) { S.step(dt); if (u.track === a) return t; } return null; }
const tN = lockTime('f16'), tS = lockTime('e_f22'), tB = lockTime('e_b2'), t57 = lockTime('e_su57');
console.log(`  захват Patriot: F-16 ${tN?.toFixed(2)} с, F-22 ${tS?.toFixed(2)} с, B-2 ${tB?.toFixed(2)} с, Су-57 ${t57?.toFixed(2)} с`);
ok(tN != null && tS != null && Math.abs(tS - tN - STEALTH.e_f22.acq) < 0.15, `F-22 захватывается на ${STEALTH.e_f22.acq} с дольше`);
ok(tB != null && Math.abs(tB - tN - STEALTH.e_b2.acq) < 0.15, `B-2 - на ${STEALTH.e_b2.acq} с дольше`);
ok(t57 != null && Math.abs(t57 - tN - STEALTH.e_su57.acq) < 0.15, `Су-57 - на ${STEALTH.e_su57.acq} с дольше`);
ok(Math.abs(lockOnline('east', 'e_su57', true) - tN - STEALTH.e_su57.acq) < 0.15, 'онлайн, человек: Су-57 с грузом в отсеках малозаметен (model - сторона)');
ok(Math.abs(lockOnline('east', 'e_su57', false) - tN) < 0.15, 'онлайн: Су-57 с наружным грузом - как обычный');
ok(Math.abs(lockOnline('e_f35', 'e_f15e', true) - tN) < 0.15, 'онлайн, бот: F-15E с машиной роли F-35 не малозаметен');
const rN = seeRange('f16'), rS = seeRange('e_f22'), rB = seeRange('e_b2'), rR = seeRange('e_b2', true);
console.log(`  обнаружение Patriot: F-16 ${(rN / 1000).toFixed(1)} км, F-22 ${(rS / 1000).toFixed(1)} км, B-2 ${(rB / 1000).toFixed(1)} км, B-2 после пуска ${(rR / 1000).toFixed(1)} км`);
ok(Math.abs(rS / rN - 0.8) < 0.02 && Math.abs(rB / rN - 0.75) < 0.02, 'дальность обнаружения: F-22 ×0,8, B-2 ×0,75 (не меньше 0,75)');
ok(Math.abs(rR - rN) < 50, 'после пуска оружия малозаметный виден как обычный');
{ const a = plane('e_f22'), S = sim([a]); a.pos.set(0, 5000, 20000); a.vel.set(0, 0, -250); S.release(a, 'gbu39'); const r0 = a.revealT; for (let i = 0; i < 30 * (REVEAL_T + 0.5); i++) S.step(1 / 30);
  ok(r0 === REVEAL_T && !(a.revealT > 0), `пуск засвечивает на ${REVEAL_T} с, потом снова малозаметный`); }

// ── 2-3. ПРР в режиме памяти ──
// ракета пущена по «Осе» с 14 км; РЛС выключают за offBefore секунд до подлёта (null - не выключают); jam - станция подавления навигации рядом
function armRun(key, offBefore, jam = false) {
  seed = 11; const a = plane('f16'); let hit = false, dmg = 0;
  const S = sim([a], { unitDestroyed: () => { hit = true; }, wpnEnd: (w, r) => { if (r && r.units) dmg += r.units.length; } });
  const u = S.addUnit('osa', 0, 0, { skill: 0 }); u.emit = true; u.ambush = false;
  if (jam) { const j = S.addUnit('gpsjamw', 1500, 1500); j.emit = true; }
  const other = S.addUnit('strela10', 0, 120); // сосед: в промахе не должен пострадать
  a.pos.set(0, 6000, 14000); a.yaw = 0; a.pitch = 0; a.speed = 250; fwdOf(a, a.vel).multiplyScalar(250);
  const w = S.release(a, key, { target: u }); const fly = FLY[key] || 30; // подлёт с 14 км по излучающей РЛС, с (замер ниже)
  const dt = 1 / 30; let t = 0, tOff = offBefore == null ? 1e9 : Math.max(0.6, fly - offBefore);
  for (; t < 90 && !w.dead; t += dt) { if (t >= tOff && u.emit) { S.setEmit ? S.setEmit(u, false) : (u.emit = false); } pilotStep(a, 1, 0.3, dt); S.step(dt); }
  return { hit: hit || u.dead, t, other: other.dead, miss: w.pos.distanceTo(u.pos) };
}
const FLY = {};
for (const key of ['kh58', 'kh31p', 'aargm', 'agm45']) { const r = armRun(key, null); FLY[key] = r.t; console.log(`  ${key} по излучающей «Осе»: ${r.hit ? 'попала' : 'мимо'} за ${r.t.toFixed(1)} с`); }
const late = armRun('kh58', 2), early = armRun('kh58', 18), shrike = armRun('agm45', 18);
console.log(`  Х-58, РЛС выключили за 2 с: ${late.hit ? 'попала' : `мимо ${late.miss.toFixed(0)} м`}; за 18 с: ${early.hit ? 'попала' : `мимо ${early.miss.toFixed(0)} м`}; Shrike за 18 с: ${shrike.hit ? 'попала' : 'мимо'}`);
ok(late.hit, 'Х-58: РЛС выключили за 2 с до подлёта - всё равно накрыла');
ok(!early.hit && !early.other, 'Х-58: выключили за 18 с - промах, сосед цел');
ok(!shrike.hit, 'Shrike без памяти - промах');
const sat = armRun('kh31p', 2, true), satNo = armRun('kh31p', 2, false), aargm = armRun('aargm', 2, true);
console.log(`  Х-31П за 2 с: без глушилки ${satNo.hit ? 'попала' : 'мимо'}, у глушилки ${sat.hit ? 'попала' : `мимо ${sat.miss.toFixed(0)} м`}; AARGM у глушилки: ${aargm.hit ? 'попала' : 'мимо'}`);
ok(satNo.hit, 'Х-31П: поздно выключили, без глушилки - попала');
ok(!sat.hit && !sat.other, 'Х-31П у станции подавления навигации - ушла в сторону, сосед цел');
ok(aargm.hit, 'AARGM у глушилки - миллиметровая ГСН нашла молчащую машину');
console.log(bad ? `ОШИБОК: ${bad}` : 'итог: ошибок нет');
Deno.exit(bad ? 1 : 0);
