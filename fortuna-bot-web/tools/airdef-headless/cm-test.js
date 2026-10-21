// Безголовая проверка ловушек (sim/cm.js + sim/strike.js dropCM): залп по машине, точки отстрела по ориентации, машины без ЛТЦ, пул, шанс увода:
//   deno run -A tools/airdef-headless/cm-test.js
const dir = new URL('.', import.meta.url).pathname;
(0, eval)(Deno.readTextFileSync(dir + '../drone-headless/three.min.js'));
const { createStrike, MODES } = await import('../../games/airdef/sim/strike.js');
const { CM, cmOf, cmBoost, cmWorld, cmCenter } = await import('../../games/airdef/sim/cm.js');
const { LOADOUTS, HELI_LOADOUTS } = await import('../../games/airdef/arsenal.js');
let bad = 0; const check = (name, ok, extra = '') => { console.log(`${ok ? 'OK  ' : 'ОШИБКА'} ${name}${extra ? ' — ' + extra : ''}`); if (!ok) bad++; };
const city = { objects: [], topAt: () => 0, groundH: () => 0, los: () => true };
const drops = [];
const mk = (model, o = {}) => ({ id: 1, model, side: 'east', pos: new THREE.Vector3(0, 800, 0), vel: new THREE.Vector3(0, 0, -200), yaw: 0, pitch: 0, roll: 0, speed: 200, dead: false, r: 8, ...o });
const S = createStrike({ city, rnd: Math.random, mode: () => MODES.real, aircraft: () => [], hurt() {}, laserSpot: () => null, night: 0, fx: { cmDrop: (a, t, made) => drops.push([a, t, made ? made.length : null]) } });

// таблица: у каждой машины из подвесок есть запись, векторы единичные
const keys = new Set([...Object.values(LOADOUTS).flat().map((l) => l.plane), ...HELI_LOADOUTS.map((l) => l.plane)].filter(Boolean));
check(`таблица CM: записи у всех ${keys.size} машин подвесок`, [...keys].every((k) => CM[k]), [...keys].filter((k) => !CM[k]).join(' '));
check('точки: число точек = числу направлений, векторы единичные', Object.values(CM).every((c) => c.at.length && c.at.length === c.dir.length && c.dir.every((d) => Math.abs(Math.hypot(...d) - 1) < 0.02)));
const NOFL = ['e_mig17', 'e_mig19', 'e_mig21n', 'e_su7b', 'e_il28', 'e_tu16', 'e_m4', 'e_hunter', 'e_f100', 'e_draken', 'e_vulcan'];
check('только диполи: 11 машин без ЛТЦ, у остальных — есть', NOFL.every((k) => !CM[k].flare) && Object.entries(CM).filter(([k]) => !NOFL.includes(k)).every(([, c]) => c.flare));
const SAL = { e_su25: 4, e_su27: 2, su30: 2, e_su34: 4, e_su24: 4, f16: 2, f18: 2, e_a10: 4, e_tornado: 4, e_f15e: 4, e_f111: 4, e_b52: 8, e_tu95: 8, e_tu160: 8, e_tu22: 6, e_b1b: 6, e_b2: 6, h_mi24: 4, h_mi8: 4, h_uh1: 2, h_ah64: 2, h_ka50: 2, h_rah66: 2 };
check('залпы: штурмовики 4, бомбардировщики 6–8, вертолёты по списку', Object.entries(SAL).every(([k, n]) => CM[k].salvo === n), Object.entries(SAL).filter(([k, n]) => CM[k].salvo !== n).join(' '));
check('неизвестная модель — по умолчанию (2 ЛТЦ)', cmOf('zzz', 'west').salvo === 2 && cmOf('h_zzz').at.length === 2);
check('шанс увода: залп 2 → ×1, 4 → ×1,2, 8 → ×1,4 (не больше)', cmBoost(2) === 1 && Math.abs(cmBoost(4) - 1.2) < 1e-9 && cmBoost(8) === 1.4 && cmBoost(20) === 1.4);

// залп в sim
for (const [k, n] of [['e_su25', 4], ['f16', 2], ['e_b52', 8], ['h_mi24', 4]]) {
  S.flares.length = 0; const a = mk(k); S.dropCM(a, 'flare');
  check(`${k}: залп ЛТЦ = ${n}`, S.flares.length === n && drops.at(-1)[1] === 'flare' && drops.at(-1)[2] === n, `в бою ${S.flares.length}`);
}
S.flares.length = 0; const dip = mk('e_mig21n'); drops.length = 0; S.dropCM(dip, 'flare');
check('МиГ-21бис: ЛТЦ не выбрасываются (ни ЛТЦ, ни хука)', S.flares.length === 0 && drops.length === 0);
S.dropCM(dip, 'chaff'); check('МиГ-21бис: диполи — выбрасываются', drops.length === 1 && drops[0][1] === 'chaff');

// точки по ориентации: нос на восток (yaw −90°) — «хвост» смотрит на запад (−x)
const sa = mk('f16', { yaw: -Math.PI / 2 }); S.flares.length = 0; S.dropCM(sa, 'flare');
check('f16, курс на восток: ЛТЦ — сзади (x < центра), ниже самолёта', S.flares.every((f) => f.pos.x < sa.pos.x - 3 && f.pos.y < sa.pos.y - 0.5), S.flares.map((f) => f.pos.toArray().map((v) => v.toFixed(1))).join(' | '));
const pp = [0, 0, 0], dd = [0, 0, 0]; cmWorld({ yaw: Math.PI / 2, pitch: 0, roll: 0, pos: { x: 0, y: 0, z: 0 } }, { at: [[0, 0, -1]], dir: [[1, 0, 0]] }, 0, pp, dd);
check('поворот: нос −z при курсе 90° смотрит на −x', Math.abs(pp[0] + 1) < 1e-9 && Math.abs(dd[2] + 1) < 1e-9);
const cc = cmCenter(mk('e_b52'), CM.e_b52, [0, 0, 0]);
check('облако диполей — середина точек отстрела (хвост B-52)', Math.abs(cc[0]) < 0.01 && cc[2] > 20 && cc[1] < 800);
// у «залпа веером» второй круг летит быстрее первого
S.flares.length = 0; const b52 = mk('e_b52'); S.dropCM(b52, 'flare');
const sp = (f) => f.vel.clone().sub(b52.vel.clone().multiplyScalar(0.6)).length();
check('B-52: второй «выстрел» из точки летит быстрее первого (веер)', S.flares.slice(4).every((f) => sp(f) > 25) && S.flares.slice(0, 4).every((f) => sp(f) < 33));
// пул
S.flares.length = 0; for (let i = 0; i < 20; i++) S.dropCM(mk('e_b52'), 'flare');
check('пул: 20 залпов B-52 — не больше 64 ЛТЦ одновременно', S.flares.length === 64, `в бою ${S.flares.length}`);
// ЛТЦ горят и гаснут
for (let t = 0; t < 4.5; t += 1 / 30) S.step(1 / 30);
check('ЛТЦ гаснут к 3,5 с', S.flares.length === 0, `осталось ${S.flares.length}`);
console.log(bad ? `\nОШИБОК: ${bad}` : '\nошибок нет'); Deno.exit(bad ? 1 : 0);
