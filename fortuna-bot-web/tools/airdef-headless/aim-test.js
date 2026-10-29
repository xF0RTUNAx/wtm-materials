// Точки прицела и область поражения объектов (city.js objTargets / objAimXZ, sim/strike.js blast) на трёх картах:
//   deno run -A tools/airdef-headless/aim-test.js
// 2026-10-22 (Mark): ПТУР и НАР вертолётов, Х-55 по порту, «Мульти-волна» били в центр объекта — у 10 объектов из 22 это пустая
// земля в 30–134 м от построек, точное попадание — «мимо». Проверки: (1) точно в главную точку — урон ПТУР, НАР и Х-55;
// (2) разлёт «Мульти-волны» (20 точек со сдвигом по крыше) — каждая точка даёт урон ПТУР; (3) стена ГЭС в сетке высот — на своей
// высоте (была 248 м над землёй: невидимая стена до ~440 м): куски стены игры и плотина сцены (2026-10-29); (4) площадка порта: НАР в 15 м
// от стены штаба — урон (площадка — до 25 м от построек), Х-55 на пустом берегу бывшей базы севернее сцены — нет (не общая рамка объекта),
// в реке напротив насосной налива — нет.
const dir = new URL('.', import.meta.url).pathname;
(0, eval)(Deno.readTextFileSync(dir + '../drone-headless/three.min.js'));
const { buildCity, objAimXZ, objDist, inWater } = await import('../../games/airdef/city.js');
const { buildWinter } = await import('../../games/airdef/map-winter.js');
const { buildAutumn } = await import('../../games/airdef/map-autumn.js');
const { createStrike, MODES } = await import('../../games/airdef/sim/strike.js');

let seed = 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const fx = new Proxy({}, { get: () => () => {} });
// урон объекту id от разрыва в точке (x, z) над крышей или землёй (как оружие: на верху препятствия, над водой — на её уровне)
function dmgAt(city, id, x, z, dmg, R, y) {
  const S = createStrike({ city, rnd, mode: () => MODES.real, aircraft: () => [], laserSpot: () => null, night: 0, hurt() {}, fx });
  const o = S.objects.find((q) => q.id === id), hp0 = o.hp;
  S.blast(new THREE.Vector3(x, y ?? Math.max(city.topAt(x, z), -4) + 0.5, z), dmg, R, 'тест'); return hp0 - o.hp;
}
const W = [['ПТУР', 45, 14], ['НАР', 22, 14], ['Х-55', 200, 54]];
let bad = 0; const fail = (t) => { bad++; console.log('  ОШИБКА: ' + t); };
for (const [name, city] of [['Речной узел', buildCity(1)], ['Зимняя долина', buildWinter(1)], ['Туманная топь', buildAutumn(1)]]) {
  console.log(`\n== ${name}`);
  for (const o of city.objects) {
    if (o.noTarget) continue;
    const a = objAimXZ(o), got = W.map(([k, d, R]) => [k, dmgAt(city, o.id, a.x, a.z, d, R)]);
    let ok = 0; for (let n = 0; n < 20; n++) { const p = objAimXZ(o, n, rnd() - 0.5, rnd() - 0.5); if (dmgAt(city, o.id, p.x, p.z, 45, 14) > 0) ok++; }
    console.log(`${o.name.padEnd(40)} ${got.map(([k, v]) => `${k} ${v.toFixed(0)}`).join(' · ')} · разлёт ${ok}/20`);
    for (const [k, v] of got) if (!(v > 0)) fail(`${o.name}: ${k} точно в точку прицела — без урона`);
    if (ok < 20) fail(`${o.name}: разлёт — ${20 - ok} точек без урона`);
    if (!o.zones || !o.zones.some((q) => q.yard)) fail(`${o.name}: нет площадки`);
  }
  if (name === 'Зимняя долина') {
    const o = city.objects.find((q) => q.key === 'w_dam'), W2 = o.parts.filter((q) => q.wall), top = W2[0].y0 + W2[0].h;
    for (const q of [...W2, ...o.parts.filter((p) => ['dam_w', 'spill', 'intake', 'dam_e'].includes(p.b) && p.h === 66)]) for (const dx of [-0.3, 0, 0.3]) {
      const t = city.topAt(q.x + q.w * dx, q.z); if (Math.abs(t - top) > 4) fail(`стена ГЭС (${q.b || 'стена игры'}): в сетке ${t.toFixed(0)} м, настоящая ${top.toFixed(0)} м`); }
    console.log(`стена ГЭС: верх ${top.toFixed(0)} м, в сетке высот ${W2.map((q) => city.topAt(q.x, q.z).toFixed(0)).join(' / ')} м (куски стены игры)`);
  }
  if (name === 'Речной узел') {
    const o = city.objects.find((q) => q.key === 'port'), hq = o.parts.find((q) => q.b === 'hq'), fp = o.parts.find((q) => q.b === 'fuelpump'); // штаб, насосная налива
    const qx = o.x - 50, qz = o.z - 560, rx = fp.x - 85, rz = fp.z - 60; // пустой берег бывшей базы севернее сцены; река западнее насосной
    const wall = dmgAt(city, o.id, hq.x + hq.w / 2 + 15, hq.z, 22, 14), quay = dmgAt(city, o.id, qx, qz, 200, 54), river = dmgAt(city, o.id, rx, rz, 200, 54, -4);
    const far = objDist(o, qx, qz), rfar = objDist(o, rx, rz);
    console.log(`порт: НАР в 15 м от стены штаба — ${wall.toFixed(0)}; Х-55 на пустом берегу (до построек ${far.toFixed(0)} м) — ${quay.toFixed(0)}; Х-55 в реке (до построек ${rfar.toFixed(0)} м) — ${river.toFixed(0)}`);
    if (!inWater(rx, rz)) fail('точка «в реке» оказалась на берегу — поправить тест');
    if (inWater(qx, qz)) fail('точка «пустой берег» оказалась в реке — поправить тест');
    if (far < 100) fail('точка «пустой берег» ближе 100 м к постройке — поправить тест');
    if (rfar < 54) fail('точка «в реке» ближе радиуса Х-55 к постройке — поправить тест');
    if (!(wall > 0)) fail('порт: НАР в 15 м от стены штаба — без урона (площадка)');
    if (quay > 0) fail('порт: разрыв на пустом берегу далеко от построек засчитан');
    if (river > 0) fail('порт: разрыв в реке засчитан площадкой');
  }
}
console.log(bad ? `\nИТОГ: ошибок ${bad}` : '\nИТОГ: ошибок нет');
if (bad) Deno.exit(1);
