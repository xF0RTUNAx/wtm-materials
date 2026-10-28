// Объекты-сцены (city.js SITES, 2026-10-28: «РЛС на вершине» зимой и «Лысая гора» осенью — своя модель сборщика, разрушение по постройкам):
//   deno run -A tools/airdef-headless/site-test.js
// Проверки: (1) части объекта — постройки сцены с именами, у боя — их прочность (доли сумма 1); (2) ПТУР в малый купол разбивает его
// (fx.bldDestroyed), объект цел; (3) разбитая постройка — больше не точка прицела (objAimXZ); (4) мельница «Лысой горы» — урон объекту,
// постройки целы; (5) объект уничтожен — главные разрушены; разбиты все главные при запасе прочности — объект уничтожен;
// (6) онлайн: маска разбитых построек (bldMask) → клиент (bldFromMask) — то же.
const dir = new URL('.', import.meta.url).pathname;
(0, eval)(Deno.readTextFileSync(dir + '../drone-headless/three.min.js'));
const { objAimXZ, partDist, bldMask, bldFromMask, SITES } = await import('../../games/airdef/city.js');
const { buildWinter } = await import('../../games/airdef/map-winter.js');
const { buildAutumn } = await import('../../games/airdef/map-autumn.js');
const { createStrike, MODES } = await import('../../games/airdef/sim/strike.js');

let seed = 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
let bad = 0; const fail = (t) => { bad++; console.log('  ОШИБКА: ' + t); };
const ev = [];
const fx = { bldDestroyed: (o, b) => ev.push('b:' + b), objectDestroyed: () => ev.push('dead') }; // остальные хуки — пустые (strike.js NOOP_FX)
const mk = (city) => createStrike({ city, rnd, mode: () => MODES.real, aircraft: () => [], laserSpot: () => null, night: 0, hurt() {}, fx });
const hit = (S, city, x, z, dmg = 45, R = 14) => S.blast(new THREE.Vector3(x, Math.max(city.topAt(x, z), -4) + 0.5, z), dmg, R, 'тест');

for (const [name, city, key] of [['Зимняя долина', buildWinter(1), 'w_radar'], ['Туманная топь', buildAutumn(1), 'a_radar']]) {
  console.log(`\n== ${name}: ${key}`);
  const c = city.objects.find((q) => q.key === key);
  if (!c || c.site !== 'site_radar') { fail('нет объекта-сцены'); continue; }
  const B = SITES.site_radar.b, names = Object.keys(B), sum = names.reduce((s, b) => s + B[b].share, 0);
  if (Math.abs(sum - 1) > 1e-6) fail(`доли прочности: сумма ${sum}`);
  for (const b of names) if (!c.parts.some((q) => q.b === b)) fail(`нет части ${b}`);
  let S = mk(city), o = S.objects.find((q) => q.id === c.id); ev.length = 0;
  console.log(`прочность ${o.hp}; постройки: ${names.map((b) => `${b} ${o.bld[b].hp.toFixed(1)}${o.bld[b].main ? '*' : ''}`).join(', ')}`);
  // (2) малый купол
  const d2 = c.parts.find((q) => q.b === 'dome2'); hit(S, city, d2.x, d2.z);
  if (!o.bld.dome2.dead) fail('ПТУР в малый купол — купол цел'); if (o.dead) fail('объект уничтожен одним ПТУР');
  if (!ev.includes('b:dome2')) fail('нет fx.bldDestroyed(dome2)');
  const other = names.filter((b) => b !== 'dome2' && o.bld[b].dead); if (other.length) fail(`задеты и другие постройки: ${other.join(', ')}`);
  console.log(`ПТУР в малый купол: прочность ${o.hp.toFixed(0)}, разбиты: ${names.filter((b) => o.bld[b].dead).join(', ')}`);
  // (3) прицел: главная точка — на большом куполе; разобьём его — прицел уходит на целую постройку
  const d1 = c.parts.find((q) => q.b === 'dome1'); hit(S, city, d1.x, d1.z);
  if (!o.bld.dome1.dead) fail('ПТУР в большой купол — купол цел');
  for (let n = -1; n < 30; n++) { const a = objAimXZ(o, n, 0, 0); const q = c.parts.filter((p) => p.b).find((p) => partDist(p, a.x, a.z) <= 0.5); if (q && o.bld[q.b].dead) { fail(`прицел ${n} — в разбитую постройку ${q.b}`); break; } }
  // (6) маска для онлайна
  const m = bldMask(o), S2 = mk(city), o2 = S2.objects.find((q) => q.id === c.id); bldFromMask(o2, m, fx);
  if (names.some((b) => o2.bld[b].dead !== o.bld[b].dead)) fail('маска построек: у клиента не то же');
  console.log(`маска ${m.toString(2)} — у клиента: ${names.filter((b) => o2.bld[b].dead).join(', ')}`);
  // (5) домик — третий главный: объект уничтожен, главные — разрушены
  const h = c.parts.find((q) => q.b === 'house'); hit(S, city, h.x, h.z);
  if (!o.dead) fail('разбиты все главные — объект цел');
  if (!ev.includes('dead')) fail('нет fx.objectDestroyed');
  console.log(`домик: объект ${o.dead ? 'уничтожен' : 'цел'}, разбиты: ${names.filter((b) => o.bld[b].dead).join(', ')}`);
  // (5) общий запас кончился от разрывов на площадке — главные всё равно разрушены
  S = mk(city); o = S.objects.find((q) => q.id === c.id);
  for (let k = 0; k < 40 && !o.dead; k++) hit(S, city, c.x + 20, c.z - 30, 80, 30);
  if (!o.dead) fail('площадка: 40 разрывов — объект цел');
  else if (names.some((b) => o.bld[b].main && !o.bld[b].dead)) fail('объект уничтожен, а главная постройка цела');
  // (4) мельница (осень): урон объекту, постройки целы
  if (key === 'a_radar') {
    S = mk(city); o = S.objects.find((q) => q.id === c.id);
    const mill = c.parts.find((q) => q.model); const hp0 = o.hp; hit(S, city, mill.x, mill.z, 22, 8);
    console.log(`мельница: урон ${(hp0 - o.hp).toFixed(0)}, разбиты: ${names.filter((b) => o.bld[b].dead).join(', ') || 'нет'}`);
    if (!(o.hp < hp0)) fail('мельница — без урона объекту'); if (names.some((b) => o.bld[b].dead)) fail('мельница — разбита постройка');
  }
}
console.log(bad ? `\nОШИБОК: ${bad}` : '\nошибок нет');
if (bad) Deno.exit(1);
