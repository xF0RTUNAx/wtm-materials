// Объекты-сцены (city.js SITES, 2026-10-28: «РЛС на вершине» зимой и «Лысая гора» осенью - своя модель сборщика, разрушение по постройкам):
//   deno run -A tools/airdef-headless/site-test.js
// Проверки: (1) части объекта - постройки сцены с именами, у боя - их прочность (доли сумма 1); (2) ПТУР в малый купол разбивает его
// (fx.bldDestroyed), объект цел; (3) разбитая постройка - больше не точка прицела (objAimXZ); (4) мельница «Лысой горы» - урон объекту,
// постройки целы; (5) объект уничтожен - главные разрушены; разбиты все главные при запасе прочности - объект цел (2026-11-01, облако
// cloud/strike-balance: гибель - только по общей прочности); (6) онлайн: маска разбитых построек (bldMask) → клиент (bldFromMask) - то же;
// (7) вид разрушения: свободная бомба разбивает постройки в радиусе, управляемая с тем же эквивалентом - только ту, что под прицелом.
const dir = new URL('.', import.meta.url).pathname;
(0, eval)(Deno.readTextFileSync(dir + '../drone-headless/three.min.js'));
const { objAimXZ, partDist, bldMask, bldFromMask, SITES, YARD_K, CITY, buildCity } = await import('../../games/airdef/city.js');
const { buildWinter } = await import('../../games/airdef/map-winter.js');
const { buildAutumn } = await import('../../games/airdef/map-autumn.js');
const { createStrike, MODES, guidedOf } = await import('../../games/airdef/sim/strike.js');
const { AG, eqOf } = await import('../../games/airdef/arsenal.js');

let seed = 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
let bad = 0; const fail = (t) => { bad++; console.log('  ОШИБКА: ' + t); };
const ev = [];
const fx = { bldDestroyed: (o, b) => ev.push('b:' + b), objectDestroyed: () => ev.push('dead') }; // остальные хуки - пустые (strike.js NOOP_FX)
const mk = (city) => createStrike({ city, rnd, mode: () => MODES.real, aircraft: () => [], laserSpot: () => null, night: 0, hurt() {}, fx });
// разрыв оружия W (по умолчанию - ПТУР Hellfire: эквивалент 30, управляемое) или «голый» урон dmg / R (как раньше: эквивалент dmg · 1,25, область)
const ATGM = AG.hellfire;
const hit = (S, city, x, z, dmg = ATGM, R) => { const p = new THREE.Vector3(x, Math.max(city.topAt(x, z), -4) + 0.5, z); return typeof dmg === 'object' ? S.blast(p, dmg.dmg, dmg.blast, 'тест', null, dmg.ap || 1, eqOf(dmg), guidedOf(dmg)) : S.blast(p, dmg, R, 'тест'); };

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
  if (!o.bld.dome2.dead) fail('ПТУР в малый купол - купол цел'); if (o.dead) fail('объект уничтожен одним ПТУР');
  if (!ev.includes('b:dome2')) fail('нет fx.bldDestroyed(dome2)');
  const other = names.filter((b) => b !== 'dome2' && o.bld[b].dead); if (other.length) fail(`задеты и другие постройки: ${other.join(', ')}`);
  console.log(`ПТУР в малый купол: прочность ${o.hp.toFixed(0)}, разбиты: ${names.filter((b) => o.bld[b].dead).join(', ')}`);
  // (3) прицел: главная точка - на большом куполе; разобьём его - прицел уходит на целую постройку
  const d1 = c.parts.find((q) => q.b === 'dome1'); let n1 = 0; while (n1 < 3 && !o.bld.dome1.dead) { hit(S, city, d1.x, d1.z); n1++; }
  if (!o.bld.dome1.dead) fail('3 ПТУР в большой купол - купол цел');
  console.log(`большой купол - ПТУР: ${n1}`);
  for (let n = -1; n < 30; n++) { const a = objAimXZ(o, n, 0, 0); const q = c.parts.filter((p) => p.b).find((p) => partDist(p, a.x, a.z) <= 0.5); if (q && o.bld[q.b].dead) { fail(`прицел ${n} - в разбитую постройку ${q.b}`); break; } }
  // (6) маска для онлайна
  const m = bldMask(o), S2 = mk(city), o2 = S2.objects.find((q) => q.id === c.id); bldFromMask(o2, m, fx);
  if (names.some((b) => o2.bld[b].dead !== o.bld[b].dead)) fail('маска построек: у клиента не то же');
  console.log(`маска ${m.toString(2)} - у клиента: ${names.filter((b) => o2.bld[b].dead).join(', ')}`);
  // (5) домик - третий главный: объект цел, пока есть общая прочность; добить - главные руины, fx.objectDestroyed
  const h = c.parts.find((q) => q.b === 'house'); let nh = 0; while (nh < 3 && !o.bld.house.dead) { hit(S, city, h.x, h.z); nh++; }
  if (names.some((b) => o.bld[b].main && !o.bld[b].dead)) fail('ПТУР по главным - не все разбиты');
  if (o.dead !== (o.dmgTaken >= o.hpMax - 1e-6)) fail(`разбиты все главные: объект ${o.dead ? 'уничтожен' : 'цел'} при уроне ${o.dmgTaken.toFixed(0)} из ${o.hpMax}`);
  let nk = 0; while (!o.dead && nk < 40) { hit(S, city, h.x, h.z); nk++; }
  if (!o.dead) fail('40 ПТУР - объект цел'); if (!ev.includes('dead')) fail('нет fx.objectDestroyed');
  console.log(`главные разбиты (урон ${Math.round(o.dmgTaken - nk * eqOf(ATGM))} из ${o.hpMax}), объект добит ещё ${nk} ПТУР; разбиты: ${names.filter((b) => o.bld[b].dead).join(', ')}`);
  // (5) общий запас кончился от разрывов на площадке - главные всё равно разрушены
  S = mk(city); o = S.objects.find((q) => q.id === c.id);
  for (let k = 0; k < 40 && !o.dead; k++) hit(S, city, c.x + 20, c.z - 30, 80, 30);
  if (!o.dead) fail('площадка: 40 разрывов - объект цел');
  else if (names.some((b) => o.bld[b].main && !o.bld[b].dead)) fail('объект уничтожен, а главная постройка цела');
  // (4) мельница (осень): урон объекту, постройки целы
  if (key === 'a_radar') {
    S = mk(city); o = S.objects.find((q) => q.id === c.id);
    const mill = c.parts.find((q) => q.model); const hp0 = o.hp; hit(S, city, mill.x, mill.z, 22, 8);
    console.log(`мельница: урон ${(hp0 - o.hp).toFixed(0)}, разбиты: ${names.filter((b) => o.bld[b].dead).join(', ') || 'нет'}`);
    if (!(o.hp < hp0)) fail('мельница - без урона объекту'); if (names.some((b) => o.bld[b].dead)) fail('мельница - разбита постройка');
  }
}
// «Ведьмина поляна» (a_heli, site_heli) и «Склад боеприпасов» (город, tpp, site_ammo_city): ПТУР в каждую главную по очереди - разбита
// только она, объект цел до последней; разбиты все - объект уничтожен; прицел - мимо руин; технику - не в водоём и не на рельсы (keep)
for (const [name, city, key, site] of [['Туманная топь', buildAutumn(1), 'a_heli', 'site_heli'], ['Речной узел', buildCity(1), 'tpp', 'site_ammo_city'], ['Зимняя долина', buildWinter(1), 'w_ammo', 'site_ammo_w'], ['Туманная топь', buildAutumn(1), 'a_farm', 'site_ammo_a'], ['Речной узел', buildCity(1), 'oil', 'site_fuel_city'], ['Зимняя долина', buildWinter(1), 'w_fuel', 'site_fuel_w'], ['Речной узел', buildCity(1), 'stad', 'site_park_city'], ['Туманная топь', buildAutumn(1), 'a_peat', 'site_fuel_a'], ['Зимняя долина', buildWinter(1), 'w_garr', 'site_garr_w'], ['Зимняя долина', buildWinter(1), 'w_cp', 'site_cp_w'], ['Туманная топь', buildAutumn(1), 'a_vil', 'site_garr_a'], ['Туманная топь', buildAutumn(1), 'a_mon', 'site_cp_a'], ['Речной узел', buildCity(1), 'gov', 'site_cp_city'], ['Туманная топь', buildAutumn(1), 'a_wreck', 'site_wreck_a'], ['Речной узел', buildCity(1), 'air', 'site_air'], ['Речной узел', buildCity(1), 'tv', 'site_tv_city'], ['Зимняя долина', buildWinter(1), 'w_air', 'site_air_w'], ['Зимняя долина', buildWinter(1), 'w_rail', 'site_rail_w'], ['Зимняя долина', buildWinter(1), 'w_dam', 'site_dam_w'], ['Речной узел', buildCity(1), 'port', 'site_port']]) {
  const c = city.objects.find((q) => q.key === key);
  console.log(`\n== ${name}: ${key}`);
  if (!c || c.site !== site) fail(`нет объекта-сцены ${key}`);
  else {
    const B = SITES[site].b, names = Object.keys(B), sum = names.reduce((s, b) => s + B[b].share, 0);
    if (Math.abs(sum - 1) > 1e-6) fail(`доли прочности: сумма ${sum}`);
    if (names.length > 31) fail(`построек ${names.length} - маска онлайна (bldMask) держит 31`);
    const S = mk(city), o = S.objects.find((q) => q.id === c.id); ev.length = 0;
    const hp0 = o.hp; o.hp = 1e9; // общий запас - без предела: разбить все главные - объект цел (гибель - только по прочности)
    console.log(`прочность ${hp0}; постройки: ${names.map((b) => `${b} ${o.bld[b].hp.toFixed(1)}${o.bld[b].main ? '*' : ''}${B[b].chain ? '!' : ''}`).join(', ')}`);
    const mains = names.filter((b) => B[b].main);
    mains.forEach((b, i) => {
      const q = c.parts.find((p) => p.b === b); let k = 0; while (k < 4 && !o.bld[b].dead && !o.dead) { hit(S, city, q.x, q.z); k++; } // большая (штаб в городе, корабль) - до четырёх ПТУР
      if (!o.bld[b].dead) fail(`${k} ПТУР в ${b} - цел`);
      // задеть можно только постройку, что стоит внутри (эстакада ГСМ - между составами эшелона цистерн): явные пары по сцене
      const near = (n) => (({ site_rail_w: { tanktrain: ['rack'] } })[site] || {})[b]?.includes(n);
      const extra = names.filter((n) => n !== b && o.bld[n].dead && !mains.slice(0, i).includes(n) && !near(n)); if (extra.length && !o.dead) fail(`ПТУР в ${b} задел ${extra.join(', ')}`);
      // все постройки прицела разбиты, а прочность есть - прицел на руинах главной (урон идёт): проверять, пока есть целая
      if (!o.dead && o.aims.some((x) => !x.b || !o.bld[x.b].dead)) for (let n = -1; n < 20; n++) { const a = objAimXZ(o, n, 0, 0), p = c.parts.filter((x) => x.b).find((x) => partDist(x, a.x, a.z) <= 0.5); if (p && o.bld[p.b].dead) { fail(`прицел ${n} - в разбитую ${p.b}`); break; } }
      if (i < mains.length - 1 && o.dead) fail(`объект уничтожен до последней главной (${b})`);
      console.log(`ПТУР в ${b} (${k}): объект ${o.dead ? 'уничтожен' : 'цел'}`);
    });
    if (o.dead) fail('разбиты все главные при запасе прочности - объект уничтожен (гибель - только по прочности)');
    // запретный декор (SITES keep): водоём и рельсы - не свободная земля; рядом с ними - свободная
    if (SITES[site].keep) {
      const { freeGround } = await import('../../games/airdef/mission.js');
      for (const [kx, kz] of SITES[site].keep.slice(0, 3)) if (freeGround(city, c.x + kx, c.z + kz)) fail(`техника ставится в запретный декор (${kx}, ${kz})`);
      const fx0 = { site_ammo_w: [-100, 0], site_ammo_a: [-100, -70], site_fuel_city: [-60, 80], site_fuel_w: [-60, 40], site_park_city: [-60, 30], site_fuel_a: [40, -60], site_garr_w: [-40, 40], site_cp_w: [60, 70], site_garr_a: [-80, -28], site_cp_a: [-100, 40], site_cp_city: [100, 10], site_wreck_a: [100, 60], site_air: [-150, 30], site_tv_city: [-30, 0], site_air_w: [80, -60], site_rail_w: [120, -120], site_dam_w: [-260, 140], site_port: [20, 30] }[site] || [-150, 20]; // площадка между постройками
      if (!freeGround(city, c.x + fx0[0], c.z + fx0[1])) fail('площадка между хранилищами - не свободная земля');
    }
    // скала (SITES solid): в сетке высот, технику не ставить, разрыв на ней - без урона объекту; ПТУР в портал штольни - штольня разбита
    for (const [sx, sz, w, d, h] of SITES[site].solid || []) {
      const { freeGround } = await import('../../games/airdef/mission.js');
      const g = city.groundH(c.x + sx, c.z + sz), top = city.topAt(c.x + sx, c.z + sz) - g;
      // низ над нулём сцены (шестое число: краны на гребне плотины, опоры ЛЭП по склону) - верх от земли другой
      const sp = c.parts.find((q) => q.solid && Math.abs(q.x - c.x - sx) < 1e-6 && Math.abs(q.z - c.z - sz) < 1e-6), want = sp && sp.y0 !== undefined ? sp.y0 + sp.h - g : h;
      // сетка высот - целые метры над землёй в центре клетки CELL: на склоне (берег у набережной, опоры ЛЭП) верх сдвинут на перепад земли в клетке
      const cc = (v) => -CITY.GH + (Math.floor((v + CITY.GH) / CITY.CELL) + 0.5) * CITY.CELL, gc = city.groundH(cc(c.x + sx), cc(c.z + sz));
      if (Math.abs(top - want) > 1 + (sp && sp.y0 !== undefined ? Math.abs(gc - g) : 0)) fail(`препятствие в сетке высот: ${top.toFixed(1)} м вместо ${want.toFixed(1)}`);
      if (freeGround(city, c.x + sx, c.z + sz)) fail('технику можно поставить на препятствие');
      const S2 = mk(city), o2 = S2.objects.find((q) => q.id === c.id), hp1 = o2.hp, bh = Object.values(o2.bld).map((B) => B.hp); hit(S2, city, c.x + sx + w / 4, c.z + sz - d / 4);
      // препятствие - не постройка: прочность построек не тронута; урон объекту - разве что осколками по двору (зона yard у построек: до YARD_K)
      if (Object.values(o2.bld).some((B, i) => B.hp < bh[i])) fail('разрыв на препятствии задел постройку');
      const px = c.x + sx + w / 4, pz = c.z + sz - d / 4, near = c.parts.some((q) => q.b && partDist(q, px, pz) < 25 + 14); // зона двора (YARD_PAD) + радиус разрыва
      if (hp1 - o2.hp > (near ? eqOf(ATGM) * YARD_K : 0) + 0.01) fail(`разрыв на препятствии - урон объекту ${(hp1 - o2.hp).toFixed(0)}`);
      for (let n = -1; n < 30; n++) { const a = objAimXZ(o2, n, 0, 0); if (Math.abs(a.x - c.x - sx) < w / 2 && Math.abs(a.z - c.z - sz) < d / 2) { fail(`прицел ${n} - в препятствие`); break; } }
      for (const b of Object.keys(SITES[site].b).filter((k) => /^adit/.test(k))) {
        const q = c.parts.find((p) => p.b === b), S3 = mk(city), o3 = S3.objects.find((x) => x.id === c.id); hit(S3, city, q.x, q.z);
        if (!o3.bld[b].dead) fail(`ПТУР в портал ${b} - штольня цела (верх в точке: ${(city.topAt(q.x, q.z) - city.groundH(q.x, q.z)).toFixed(1)} м)`);
      }
      console.log(`препятствие (solid): верх ${top.toFixed(1)} м, урон от разрыва на ней ${(hp1 - o2.hp).toFixed(0)}`);
    }
  }
}
// (7) вид разрушения: ФАБ-500 (свободная, область) в резервуар склада горючего - разбит он и соседние в радиусе; КАБ-500С (управляемая,
// тот же эквивалент 100) в ту же точку - только он; урон объекту - одинаковый
{
  console.log('\n== вид разрушения: склад горючего (oil), резервуар t1');
  const city = buildCity(1), c = city.objects.find((q) => q.key === 'oil'), t1 = c.parts.find((q) => q.b === 't1');
  const run = (W) => { const S = mk(city), o = S.objects.find((q) => q.id === c.id), hp0 = o.hp; hit(S, city, t1.x, t1.z, W); return { dmg: hp0 - o.hp, dead: Object.keys(o.bld).filter((b) => o.bld[b].dead) }; };
  const fab = run(AG.fab500), kab = run(AG.kab500s);
  console.log(`ФАБ-500: урон ${fab.dmg.toFixed(0)}, разбиты ${fab.dead.join(', ')}; КАБ-500С: урон ${kab.dmg.toFixed(0)}, разбиты ${kab.dead.join(', ')}`);
  if (eqOf(AG.fab500) !== eqOf(AG.kab500s)) fail('эквивалент ФАБ-500 и КАБ-500С разный - проверка не про вид');
  if (Math.abs(fab.dmg - kab.dmg) > 0.01) fail('урон объекту от ФАБ-500 и КАБ-500С с тем же эквивалентом - разный');
  if (!fab.dead.includes('t1') || fab.dead.length < 2) fail('ФАБ-500 в резервуар - не разбита область');
  if (kab.dead.join() !== 't1') fail(`КАБ-500С в резервуар - разбиты ${kab.dead.join(', ') || 'нет'} (ждём только t1)`);
}
console.log(bad ? `\nОШИБОК: ${bad}` : '\nошибок нет');
if (bad) Deno.exit(1);
