// Пушки против дронов: N зениток у целей, волна «Шахедов» (sim/combined.js) — сколько сбито, сколько секунд каждая
// сопровождала цель и стреляла. deno run --allow-read --allow-env tools/airdef-headless/gun-test.js [ключ ЗРК] [число]
const dir = new URL('.', import.meta.url).pathname;
(0, eval)(Deno.readTextFileSync(dir + '../drone-headless/three.min.js'));
const { buildCity } = await import('../../games/airdef/city.js');
const { createStrike, MODES } = await import('../../games/airdef/sim/strike.js');
const { setGround } = await import('../../games/drone/sim/core.js');
const { createRaid } = await import('../../games/airdef/sim/raid.js');
const { pickTargets } = await import('../../games/airdef/mission.js');
const { createCombined } = await import('../../games/airdef/sim/combined.js');
const { SAM } = await import('../../games/airdef/arsenal.js');
const city = buildCity(1); setGround(city.groundH);
const KEY = Deno.args[0] || 'gepard', N = +(Deno.args[1] || 4), MODE = Deno.env.get('MODE') || 'arcade';
const ATT = SAM[KEY].side === 'east' ? 'west' : 'east', DRONE = ATT === 'east' ? ['scout_e', 'shahed'] : ['scout', 'uav_w']; // дроны — стороны, против которой этот ЗРК
let tot = 0, totL = 0;
for (let run = 0; run < 5; run++) {
  let seed = 11 + run * 977; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const st = { L: 0, I: 0 };
  const fx = { wpnRelease: (w) => { if (w.W.uav && !w.W.recon) st.L++; }, wpnEnd: (w, r) => { if (r.intercepted && w.W.uav) st.I++; } };
  let raid = null;
  const S = createStrike({ city, rnd, mode: () => MODES[MODE], aircraft: () => raid.alive(), laserSpot: () => null, night: 0, fx, hurt: (a, d) => raid.hurt(a, d) });
  raid = createRaid(S, city, rnd, { side: ATT, era: 4, fx: {} });
  const targets = pickTargets(S, rnd).slice(0, 2);
  for (let i = 0; i < N; i++) { const o = targets[i % targets.length], a = (i / N) * Math.PI * 2; S.addUnit(KEY, o.x + Math.cos(a) * 250, o.z + Math.sin(a) * 250, {}); }
  const E = createCombined(S, city, rnd, { side: ATT, era: 4, raid, comp: [[DRONE[0], 1, 1], [DRONE[1], 8, 1]] });
  E.start(targets);
  const stat = new Map(S.units.map((u) => [u, { tr: 0, fire: 0 }]));
  let T = 0; while ((E.pending() || S.wpns.length) && T < 900) { E.step(0.05); raid.step(0.05); S.step(0.05); T += 0.05; for (const u of S.units) { const q = stat.get(u); if (u.track) q.tr += 0.05; if (u.gunOn) q.fire += 0.05; } }
  tot += st.I; totL += st.L;
  console.log(`прогон ${run + 1}: сбито ${st.I}/${st.L} за ${Math.round(T)} с · ` + [...stat.values()].map((q) => `${Math.round(q.tr)}/${Math.round(q.fire)}`).join(' '));
}
console.log(`${KEY} ×${N} (${MODE}): сбито ${tot} из ${totL}`);
