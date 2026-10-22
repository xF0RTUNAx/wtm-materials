// Стенд ИИ-вертолётов налёта (sim/raid.js, роль 'heli') на «Туманной топи»: заход по рельефу, подскок, пуск ПТУР с подсветом
// или залп НАР, уход; с ПВО и без. Печатает, кто куда долетел, что пустил и попал ли.
//   deno run --allow-read tools/airdef-headless/heli-raid-test.js
const dir = new URL('.', import.meta.url).pathname;
(0, eval)(Deno.readTextFileSync(dir + '../drone-headless/three.min.js'));
const { buildAutumn } = await import('../../games/airdef/map-autumn.js');
const { createStrike, MODES } = await import('../../games/airdef/sim/strike.js');
const { createRaid } = await import('../../games/airdef/sim/raid.js');
const { setGround } = await import('../../games/drone/sim/core.js');

const city = buildAutumn(1); setGround(city.groundH);
let bad = 0;
function run(name, side, era, sams = [], T = 360, plane = null) {
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const log = [], tgt = city.objects.find((o) => o.key === 'a_farm');
  let R = null; const st = { fired: 0, hits: 0, minAgl: 1e9, maxAgl: 0, down: 0, out: 0, near: 1e9 };
  const S = createStrike({ city, rnd, mode: () => MODES.real, aircraft: () => (R ? R.planes.filter((a) => !a.dead && !a.out && a.phase !== 'wait') : []), laserSpot: (a) => (R ? R.laserSpot(a) : null), night: 0,
    hurt: (a, d, by) => { R.hurt(a, d); log.push(`  урон ${d.toFixed(0)} от ${by}`); },
    fx: { wpnEnd: (w, r) => { if (r.objects.length || r.units.length) st.hits++; }, samLaunch: (m) => log.push(`  пуск ${m.S.short}`), unitDestroyed: (u) => log.push(`  уничтожен ${u.S.short}`) } });
  for (const [k, dx, dz] of sams) S.addUnit(k, tgt.x + dx, tgt.z + dz);
  R = createRaid(S, city, rnd, { side, era, fx: { release: () => st.fired++, down: () => st.down++, out: () => st.out++ } });
  const a = plane ? R.spawn('bomber', tgt, 2.2, 0, 14000, { plane: plane[0], load: plane[1].map(([key, n]) => ({ key, n })) }) : R.spawn('heli', tgt, 2.2, 0, 9000);
  if (plane) a.plane = a.model;
  const dt = 1 / 30;
  for (let t = 0; t < T; t += dt) {
    R.step(dt); S.step(dt);
    if (!a.dead && !a.out) { const agl = a.pos.y - city.groundH(a.pos.x, a.pos.z); st.minAgl = Math.min(st.minAgl, agl); st.maxAgl = Math.max(st.maxAgl, agl); st.near = Math.min(st.near, Math.hypot(a.pos.x - tgt.x, a.pos.z - tgt.z)); }
  }
  console.log(`\n== ${name}: ${a.plane} · пусков ${st.fired} · попаданий ${st.hits} · ближе всего ${(st.near / 1000).toFixed(1)} км · высота ${st.minAgl.toFixed(0)}–${st.maxAgl.toFixed(0)} м · ${a.dead ? 'СБИТ/РАЗБИЛСЯ' : a.out ? 'ушёл' : 'в бою'} · объект ${tgt.name}: ${Math.max(0, tgt.hp).toFixed(0)} hp`);
  if (log.length) console.log(log.slice(0, 12).join('\n'));
  return { st, a };
}
const r1 = run('Запад III, без ПВО (Hellfire)', 'west', 3);
if (!r1.st.fired || !r1.st.hits) { bad++; console.log('!! AH-64 без ПВО не стрелял или не попал'); }
const r2 = run('Восток I, без ПВО (Ми-24: «Штурм» и С-8)', 'east', 1);
if (!r2.st.fired) { bad++; console.log('!! Ми-24 не стрелял'); }
const r3 = run("Запад I, без ПВО (UH-1: только НАР)", "west", 1, [], 600);
if (!r3.st.fired) { bad++; console.log('!! UH-1 не стрелял НАР'); }
// 2026-10-21: новые вертолёты налёта по стороне и эпохе (RAID_HELI): Восток II — Ми-8МТВ (С-8), III — Ка-50, Запад II — UH-60 (Hellfire + Hydra), IV — RAH-66
const r4 = run('Восток II, без ПВО (Ми-8МТВ: только С-8)', 'east', 2, [], 600);
if (r4.a.plane !== 'h_mi8' || !r4.st.fired) { bad++; console.log('!! Ми-8МТВ не вылетел или не стрелял'); }
const r5 = run('Восток III, без ПВО (Ка-50: «Атака» и С-8)', 'east', 3);
if (r5.a.plane !== 'h_ka50' || !r5.st.fired) { bad++; console.log('!! Ка-50 не вылетел или не стрелял'); }
const r6 = run('Запад II, без ПВО (UH-60: Hellfire и Hydra)', 'west', 2);
if (r6.a.plane !== 'h_uh60' || !r6.st.fired) { bad++; console.log('!! UH-60 не вылетел или не стрелял'); }
const r7 = run('Запад IV, без ПВО (RAH-66: Hellfire и Hydra)', 'west', 4);
if (r7.a.plane !== 'h_rah66' || !r7.st.fired) { bad++; console.log('!! RAH-66 не вылетел или не стрелял'); }
run('Запад III против «Тунгуски» и «Иглы-С» у цели', 'west', 3, [['tunguska', 300, 200], ['iglas', -250, 150]]);
// 2026-10-22: самолёт с НАР (Viggen, Су-33, Draken) — заход с пикированием и залпы (раньше ветка ракет ждала W.fov — у НАР его нет, не стрелял)
for (const [nm, sd, era, pl] of [['Запад, Viggen: Hydra ×4', 'west', 2, ['e_viggen', [['hydra', 4]]]], ['Восток, Су-33: С-8 ×2', 'east', 3, ['e_su33', [['s8', 2]]]],
  ['Запад, Draken: Mk 82 ×4 + Hydra ×2', 'west', 2, ['e_draken', [['mk82', 4], ['hydra', 2]]]]]) {
  const r = run(nm, sd, era, [], 420, pl), bombs = pl[1][0][0] === 'mk82';
  // Draken: сначала Mk 82 — парами (вторая без нового прогноза) с повторным заходом, потом залпы Hydra (≥ 5 событий); раньше одна бомба и круги над целью до сваливания
  if (r.st.fired < (bombs ? 5 : 10) || !r.st.hits || r.a.dead) { bad++; console.log(`!! ${pl[0]}: ${bombs ? 'бомбы и потом НАР' : 'НАР'} не сброшены/не пущены, мимо или разбился`); }
}
console.log(bad ? `\nОШИБОК: ${bad}` : '\nошибок нет');
