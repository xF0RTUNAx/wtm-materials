// Расписание вылета «Симулятора Летки» — версия 2.
// Чистые функции без DOM и three.js: сервер (Deno) может импортировать этот файл как есть
// и по seed из game_runs повторить расписание и посчитать максимально возможный счёт.
// Любое изменение логики — только через новую SCHEDULE_VERSION (старые партии проверяются старой версией).

export const SCHEDULE_VERSION = 2;
export const H_CAP = 300;            // жёсткий потолок длины вылета, с
export const UNIT_KILLS = { fighter: 1, interceptor: 1, ace: 2, boss: 5 };

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// События: { t — секунда вылета, type — тип (самолёт ИИ или 'tanker'), n — сколько, brg — пеленг входа в зону, ° }.
// Все числа целые, чтобы результат не зависел от округлений на клиенте и сервере.
export function buildSchedule(seed) {
  const rnd = mulberry32((seed ^ 0x5bd1e995) >>> 0);
  const ev = [];
  const turn = (b) => (b + 90 + Math.round(rnd() * 180)) % 360;
  const b1 = Math.round(rnd() * 359);
  ev.push({ t: 8 + Math.round(rnd() * 6), type: 'fighter', n: 2, brg: b1 });
  const b2 = turn(b1);
  ev.push({ t: 85 + Math.round(rnd() * 15), type: rnd() < 0.5 ? 'fighter' : 'interceptor', n: rnd() < 0.4 ? 3 : 2, brg: b2 });
  const b3 = turn(b2), t3 = 150 + Math.round(rnd() * 15);
  ev.push({ t: t3, type: 'ace', n: 1, brg: b3 });
  ev.push({ t: t3, type: rnd() < 0.5 ? 'fighter' : 'interceptor', n: rnd() < 0.5 ? 2 : 1, brg: b3 });
  const b4 = turn(b3), t4 = 215 + Math.round(rnd() * 10);
  ev.push({ t: t4, type: 'boss', n: 1, brg: b4 });
  ev.push({ t: t4, type: 'fighter', n: 2, brg: b4 });
  for (const tt of [50, 120, 185, 250]) ev.push({ t: tt + Math.round(rnd() * 8), type: 'tanker', n: 1, brg: 0 });
  ev.sort((a, b) => a.t - b.t);
  return ev;
}

export function maxKills(ev) { return ev.reduce((s, e) => s + (UNIT_KILLS[e.type] ? UNIT_KILLS[e.type] * e.n : 0), 0); }
