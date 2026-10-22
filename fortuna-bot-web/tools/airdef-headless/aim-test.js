// Точки прицела и область поражения объектов (city.js objTargets / objAimXZ, sim/strike.js blast) на трёх картах:
//   deno run -A tools/airdef-headless/aim-test.js
// 2026-10-22 (Mark): ПТУР и НАР вертолётов, Х-55 по порту, «Мульти-волна» били в центр объекта — у 10 объектов из 22 это пустая
// земля в 30–134 м от построек, точное попадание — «мимо». Проверки: (1) точно в главную точку — урон ПТУР, НАР и Х-55;
// (2) разлёт «Мульти-волны» (20 точек со сдвигом по крыше) — каждая точка даёт урон ПТУР; (3) стена ГЭС в сетке высот — на своей
// высоте (была 248 м над землёй: невидимая стена до ~440 м); (4) площадка порта: НАР в 15 м от стены ангара — урон (площадка — до 25 м
// от построек), Х-55 на пустом причале в ~250 м от кранов — нет (не общая рамка объекта), в реке у крана — нет.
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
    const wall = city.objects.find((q) => q.key === 'w_dam').parts[0], top = wall.y0 + wall.h;
    for (const dx of [-300, 0, 300]) { const t = city.topAt(wall.x + dx, wall.z); if (Math.abs(t - top) > 4) fail(`стена ГЭС: в сетке ${t.toFixed(0)} м, настоящая ${top.toFixed(0)} м`); }
    console.log(`стена ГЭС: верх ${top.toFixed(0)} м, в сетке высот ${city.topAt(wall.x, wall.z).toFixed(0)} м`);
  }
  if (name === 'Речной узел') {
    const o = city.objects.find((q) => q.key === 'port'), cr = o.parts[0], hg = o.parts.find((q) => q.model && q.w > 50 && q.d > 50); // кран и большой ангар
    const wall = dmgAt(city, o.id, hg.x + hg.w / 2 + 15, hg.z, 22, 14), quay = dmgAt(city, o.id, cr.x + 10, cr.z + 260, 200, 54), river = dmgAt(city, o.id, cr.x - 120, cr.z, 200, 54, -4);
    const far = objDist(o, cr.x + 10, cr.z + 260);
    console.log(`порт: НАР в 15 м от стены ангара — ${wall.toFixed(0)}; Х-55 на пустом причале (до построек ${far.toFixed(0)} м) — ${quay.toFixed(0)}; Х-55 в реке в 120 м от крана — ${river.toFixed(0)}`);
    if (!inWater(cr.x - 120, cr.z)) fail('точка «в реке» оказалась на берегу — поправить тест');
    if (far < 100) fail('точка «пустой причал» ближе 100 м к постройке — поправить тест');
    if (!(wall > 0)) fail('порт: НАР в 15 м от стены ангара — без урона (площадка)');
    if (quay > 0) fail('порт: разрыв на пустом причале далеко от построек засчитан');
    if (river > 0) fail('порт: разрыв в реке засчитан площадкой');
  }
}
console.log(bad ? `\nИТОГ: ошибок ${bad}` : '\nИТОГ: ошибок нет');
if (bad) Deno.exit(1);
