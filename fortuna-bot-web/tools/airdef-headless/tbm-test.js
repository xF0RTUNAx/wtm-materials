// Перехват баллистики без браузера: один противоракетный ЗРК (ИИ-расчёт) прикрывает точку, по ней — баллистические ракеты.
//   deno run --allow-read tools/airdef-headless/tbm-test.js [ракет на пару]
// Печатает по каждой паре «ЗРК — ракета»: пусков ЗУР, сближение ближе порога, сбито / долетело.
const dir = new URL('.', import.meta.url).pathname;
(0, eval)(Deno.readTextFileSync(dir + '../drone-headless/three.min.js'));
const { buildCity } = await import('../../games/airdef/city.js');
const { createStrike, MODES } = await import('../../games/airdef/sim/strike.js');
const { setGround } = await import('../../games/drone/sim/core.js');
const { CITY } = await import('../../games/airdef/city.js');
const city = buildCity(1); setGround(city.groundH);
const N = +(Deno.args[0] || 8);
const PAIRS = [['s300', 'atacms'], ['s400', 'atacms'], ['bukm3', 'atacms'], ['patriot', 'tochka'], ['patriot', 'iskander'], ['pac3', 'iskander'], ['pac3', 'tochka'], ['patriot', 'r17']];
let tot = 0, totK = 0;
for (const [sk, wk] of PAIRS) {
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let launched = 0, close = 0, kill = 0, lands = 0; const ds = [];
  for (let n = 0; n < N; n++) {
    const fx = { samLaunch: () => launched++, wpnEnd: (w, r) => { if (!w.decoy) { if (r.intercepted) kill++; else lands++; } } };
    const S = createStrike({ city, rnd, mode: () => MODES.real, aircraft: () => [], laserSpot: () => null, night: 0, fx, hurt: () => {} });
    const u = S.addUnit(sk, 0, 0); u.skill = 0.8;
    const a = n * 2.4, R = CITY.HALF + 1500 + 60000 * rnd();
    // цель — 1–4 км от ЗРК (прикрываемый объект)
    const tx = Math.cos(a + 1) * (1000 + 3000 * rnd()), tz = Math.sin(a + 1) * (1000 + 3000 * rnd());
    S.spawnMun(wk, new THREE.Vector3(Math.cos(a) * R, city.groundH(Math.cos(a) * R, Math.sin(a) * R) + 8, Math.sin(a) * R), new THREE.Vector3(tx, 0, tz));
    let dmin = 1e9;
    for (let T = 0; T < 400 && S.wpns.some((w) => !w.dead); T += 0.02) {
      S.step(0.02);
      for (const m of S.sams) if (!m.dead && m.target && m.target.pos) dmin = Math.min(dmin, m.pos.distanceTo(m.target.pos));
    }
    if (dmin < 100) close++; ds.push(dmin < 1e8 ? Math.round(dmin) : "—");
  }
  tot += N; totK += kill;
  console.log(`${sk.padEnd(8)} ↔ ${wk.padEnd(9)} пусков ЗУР ${launched}, сближений < 100 м: ${close}/${N}, сбито ${kill}, долетело ${lands} · сближение, м: ${ds.join(" ")}`);
}
console.log(`ИТОГ: сбито ${totK} из ${tot}`);
