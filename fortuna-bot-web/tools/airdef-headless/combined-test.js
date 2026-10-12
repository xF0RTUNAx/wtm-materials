// «Мульти-волна» без браузера: ИИ-ПВО против удара (sim/combined.js) — сколько пусков, перехватов, попаданий.
//   deno run --allow-read --allow-env tools/airdef-headless/combined-test.js [сторона атакующих] [эпоха]  (COMP=… — свой состав)
const dir = new URL('.', import.meta.url).pathname;
(0, eval)(Deno.readTextFileSync(dir + '../drone-headless/three.min.js'));
const { buildCity } = await import('../../games/airdef/city.js');
const { createStrike, MODES } = await import('../../games/airdef/sim/strike.js');
const { setGround } = await import('../../games/drone/sim/core.js');
const { AG, COMBINED, threatOf } = await import('../../games/airdef/arsenal.js');
const { createRaid } = await import('../../games/airdef/sim/raid.js');
const { placeDefense, pickTargets } = await import('../../games/airdef/mission.js');
const { createCombined } = await import('../../games/airdef/sim/combined.js');
const city = buildCity(1); setGround(city.groundH);
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const runs = Deno.args[0] ? [[Deno.args[0], +Deno.args[1]]] : [['east', 2], ['east', 3], ['east', 4], ['west', 2], ['west', 3], ['west', 4]];
let fails = 0;
for (const [att, era] of runs) {
  const def = att === 'east' ? 'west' : 'east';
  const st = { launched: {}, inter: {}, hit: 0, tbmHit: 0, spotted: 0 };
  const fx = { wpnRelease: (w) => { st.launched[w.key] = (st.launched[w.key] || 0) + 1; },
    wpnEnd: (w, r) => { if (r.intercepted) st.inter[w.key] = (st.inter[w.key] || 0) + 1; else if (r.objects.length || r.units.length) { st.hit++; if (w.W.kind === 'tbm') st.tbmHit++; } },
    unitSpotted: () => { st.spotted++; } };
  let raid = null; // носители — самолёты ИИ-налёта: их видят и сбивают ЗРК
  const S = createStrike({ city, rnd, mode: () => MODES.real, aircraft: () => raid.alive(), laserSpot: () => null, night: 0, fx, hurt: (a, d) => raid.hurt(a, d) });
  raid = createRaid(S, city, rnd, { side: att, era, fx: {} });
  const targets = pickTargets(S, rnd); placeDefense(S, city, rnd, def, era, targets);
  const E = createCombined(S, city, rnd, { side: att, era, raid, comp: Deno.env.get('COMP') ? JSON.parse(Deno.env.get('COMP')) : undefined }); // COMP='[["kinzhal",1,3,"e_mig31"]]' — свой состав
  if (!E.start(targets)) { console.log(`${att} ${era}: удара нет`); continue; }
  let T = 0; while ((E.pending() || S.wpns.length) && T < 900) { E.step(0.05); raid.step(0.05); S.step(0.05); T += 0.05; }
  const v = S.objects.reduce((s, o) => s + (o.dead ? 1 : 0), 0);
  const L = Object.entries(st.launched).map(([k, n]) => `${AG[k].short} ${st.inter[k] || 0}/${n}`).join(', ');
  console.log(`${att} ${era} (ПВО ${def}): ${Math.round(T)} с · сбито/пущено: ${L} · попаданий ${st.hit} (баллистика ${st.tbmHit}) · разведано комплексов ${st.spotted} · объектов уничтожено ${v} · пусковых ${E.launchers.length} · носители ${E.carriers.map((a) => `${a.carrierName}${a.dead ? ' сбит' : ''}`).join(', ') || '—'} · очков угрозы ${threatOf(COMBINED[att][era])}`);
  for (const a of E.carriers) if (a.dead && a.salvo.length) console.log(`  ${a.carrierName} сбит до конца залпа: не пущено ${a.salvo.length}`);
  if (T >= 900) { fails++; console.log('  FAIL: удар не закончился'); }
  if (!Object.keys(st.launched).length) { fails++; console.log('  FAIL: пусков нет'); }
}
console.log(fails ? `ИТОГ: ошибок ${fails}` : 'ИТОГ: всё прошло');
