// Стенд лётной модели вертолётов (games/airdef/sim/heli.js): у каждого — наибольшая скорость (ручка вперёд, «Аркада» и
// «Реализм»), скороподъёмность у земли, потолок висения и практический, висение без ручки (снос), торможение до висения,
// посадка «Аркады» с 60 м (скорость касания), вираж на скорости, разбитый рулевой винт.
//   deno run -A tools/airdef-headless/heli-stand.js
import { HSPECS, heliModel, heliStep, heliInit, tmaxAcc, touchVerdict, SPEED_K } from '../../games/airdef/sim/heli.js';
const KMH = 3.6, DT = 1 / 60;
const craft = (o = {}) => Object.assign({ pos: { x: 0, y: 300, z: 0 }, vel: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, roll: 0, speed: 0 }, o);
const run = (a, hm, u, t, env) => { let ev = null; for (let i = 0; i < t / DT; i++) { const e = heliStep(a, hm, typeof u === 'function' ? u(i * DT, a) : u, DT, env); if (e && e !== 'lift') { ev = e; break; } } return ev; };
const ceilOf = (hm, vh) => { let h = 0; while (h < 12000 && tmaxAcc(hm, h, vh) > 9.81) h += 25; return h; };
const f1 = (v) => v.toFixed(1), f0 = (v) => Math.round(v);
let bad = 0;
const rows = [];
for (const key of Object.keys(HSPECS)) {
  const s = HSPECS[key], A = heliModel(key, { arcade: true }), R = heliModel(key, { arcade: false });
  // наибольшая скорость: «Аркада» — ручка вперёд 90 с
  let a = craft(); heliInit(a); run(a, A, { cy: 1, cx: 0, col: 0 }, 90);
  const vA = Math.hypot(a.vel.x, a.vel.z) * KMH, altDrift = a.pos.y - 300;
  // скороподъёмность: висение, газ вверх
  a = craft({ pos: { x: 0, y: 20, z: 0 } }); heliInit(a); run(a, A, { cy: 0, cx: 0, col: 1 }, 7);
  const vy = a.vel.y;
  // висение без ручки 30 с — снос и высота
  a = craft(); heliInit(a); run(a, A, { cy: 0, cx: 0, col: 0 }, 30);
  const drift = Math.hypot(a.pos.x, a.pos.z), dz = a.pos.y - 300;
  // торможение: с наибольшей скорости — отпустить ручку, время до < 2 м/с
  a = craft(); heliInit(a); run(a, A, { cy: 1, cx: 0, col: 0 }, 60);
  let tStop = 0; while (tStop < 60 && Math.hypot(a.vel.x, a.vel.z) > 2) { heliStep(a, A, { cy: 0, cx: 0, col: 0 }, DT); tStop += DT; }
  // посадка «Аркады»: газ вниз до касания с 60 м
  a = craft({ pos: { x: 0, y: 62, z: 0 } }); heliInit(a);
  const hit = run(a, A, { cy: 0, cx: 0, col: -1 }, 120, { groundY: 0, gear: 2 });
  const land = hit ? `${f1(hit.vy)} м/с → ${touchVerdict(hit)}` : 'нет касания';
  // вираж: на 70 % скорости ручка вбок 20 с — радиус
  a = craft(); heliInit(a); run(a, A, { cy: 0.7, cx: 0, col: 0 }, 40); const y0 = a.yaw; run(a, A, { cy: 0.7, cx: 1, col: 0 }, 10);
  const turn = (y0 - a.yaw) / 10 / (Math.PI / 180); // °/с вправо
  // «Реализм»: ручка вперёд 2 с, потом наклон держится — скорость через 60 с; шаг — сколько нужно на висение
  a = craft(); heliInit(a); a.col = 9.81 / tmaxAcc(R, 300, 0); run(a, R, { cy: 0.6, cx: 0, col: 0 }, 0.6); run(a, R, { cy: 0, cx: 0, col: 0 }, 60);
  const vR = Math.hypot(a.vel.x, a.vel.z) * KMH;
  // рулевой винт разбит: висение, газ ×0, 5 с — скорость вращения
  a = craft(); heliInit(a); a.trotK = 0; run(a, A, { cy: 0, cx: 0, col: 0 }, 5); const spin = Math.abs(a.wy) / (Math.PI / 180);
  const want = SPEED_K * s.vmax;
  if (Math.abs(vA - want) > want * 0.06) { bad++; console.log(`!! ${key}: скорость ${f0(vA)} при цели ${f0(want)}`); }
  if (Math.abs(vy - SPEED_K * s.vc) > 1) { bad++; console.log(`!! ${key}: подъём ${f1(vy)} при цели ${f1(SPEED_K * s.vc)}`); }
  if (drift > 5 || Math.abs(dz) > 2) { bad++; console.log(`!! ${key}: висение плывёт ${f1(drift)} м, по высоте ${f1(dz)} м`); }
  if (!hit || touchVerdict(hit) !== 'land') { bad++; console.log(`!! ${key}: посадка «Аркады» — ${land}`); }
  rows.push([s.name, `${f0(vA)} (цель ${f0(want)})`, f0(altDrift), f1(vy), `${ceilOf(A, 0)} / ${ceilOf(A, 25)}`, `${f1(drift)} / ${f1(dz)}`, f1(tStop), land, f1(turn), f0(vR), f0(spin)]);
}
console.log(['вертолёт', 'Vmax А, км/ч', 'Δh на Vmax', 'подъём, м/с', 'висение / потолок, м', 'снос / Δh, м', 'стоп, с', 'посадка А', 'вираж, °/с', 'Vуст Р, км/ч', 'без РВ, °/с'].join(' | '));
for (const r of rows) console.log(r.join(' | '));
console.log(bad ? `ОШИБОК: ${bad}` : 'ошибок нет');
