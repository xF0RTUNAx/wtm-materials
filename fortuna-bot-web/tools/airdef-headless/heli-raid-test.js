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
function run(name, side, era, sams = [], T = 360) {
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const log = [], tgt = city.objects.find((o) => o.key === 'a_farm');
  let R = null; const st = { fired: 0, hits: 0, minAgl: 1e9, maxAgl: 0, down: 0, out: 0, near: 1e9 };
  const S = createStrike({ city, rnd, mode: () => MODES.real, aircraft: () => (R ? R.planes.filter((a) => !a.dead && !a.out && a.phase !== 'wait') : []), laserSpot: (a) => (R ? R.laserSpot(a) : null), night: 0,
    hurt: (a, d, by) => { R.hurt(a, d); log.push(`  урон ${d.toFixed(0)} от ${by}`); },
    fx: { wpnEnd: (w, r) => { if (r.objects.length || r.units.length) st.hits++; }, samLaunch: (m) => log.push(`  пуск ${m.S.short}`), unitDestroyed: (u) => log.push(`  уничтожен ${u.S.short}`) } });
  for (const [k, dx, dz] of sams) S.addUnit(k, tgt.x + dx, tgt.z + dz);
  R = createRaid(S, city, rnd, { side, era, fx: { release: () => st.fired++, down: () => st.down++, out: () => st.out++ } });
  const a = R.spawn('heli', tgt, 2.2, 0, 9000);
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
run('Запад III против «Тунгуски» и «Иглы-С» у цели', 'west', 3, [['tunguska', 300, 200], ['iglas', -250, 150]]);
console.log(bad ? `\nОШИБОК: ${bad}` : '\nошибок нет');
