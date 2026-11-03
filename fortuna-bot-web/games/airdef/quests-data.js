// Задания: пул ежедневных и еженедельных, очки маршрута недели, награды (экран — quests.js). Без DOM: годится для стендов и потом для сервера.
// Ориентир наград: час в «Реализме» ≈ 4300 опыта и столько же серебра, в «Аркаде» — вдвое меньше (progress.js battleReward).
// g — откуда задание: any — любой режим, pvo — за ПВО, air — за авиацию и удар, net — только онлайн. ev — только пока идёт «Туманная топь» (вертолёты есть только в ней).
export const DAILY_N = 3, WEEKLY_N = 5, PTS_DAILY = 10, PTS_WEEKLY = 20;
export const CRATE = { silver: 150 }, CASE = { gem: 1, silver: 300 }; // за все три сегодня, за все пять недели
// маршрут недели: неделя целиком — 21 × 10 + 5 × 20 = 310 очков, конец маршрута — 250: запас 60 очков (2 дня или 3 еженедельных)
export const ROUTE = [{ p: 0 }, { p: 50, r: { silver: 150 } }, { p: 100, r: { gem: 1 } }, { p: 150, r: { silver: 300 } }, { p: 200, r: { silver: 200, xp: 100 } }, { p: 250, r: { gem: 2, silver: 400 } }];
export const ROUTE_MAX = ROUTE[ROUTE.length - 1].p;

export const DAILY = {
  play3: { g: 'any', ic: 'menu-checklist', t: 'Сыграть 3 боя', d: 'Все режимы, кроме обучения', of: 3, r: { silver: 90, xp: 50 } },
  time: { g: 'any', ic: 'timer-stopwatch', t: 'Провести 30 минут в боях', d: 'Все режимы, кроме обучения', of: 30, u: 'min', r: { silver: 130, xp: 80 } },
  xp: { g: 'any', ic: 'task-xp-sergeant', t: 'Набрать 2 000 опыта', d: 'Все режимы, кроме обучения', of: 2000, r: { silver: 130 } },
  real: { g: 'any', ic: 'task-streak-fire', t: 'Два боя в «Реализме»', d: 'Любой режим в «Реализме»', of: 2, r: { silver: 150, xp: 90 } },
  kills: { g: 'pvo', ic: 'task-kills-crosshair', t: 'Сбить 10 воздушных целей', d: '«Оборона», «Мульти-волна», онлайн за ПВО', of: 10, r: { silver: 140, xp: 80 } },
  waves: { g: 'pvo', ic: 'task-defense-shield', t: 'Отразить 5 волн обороны', d: '«Оборона», любая карта', of: 5, r: { silver: 120, xp: 70 } },
  intc: { g: 'pvo', ic: 'task-sam-incoming-rocket', t: 'Перехватить 20 ракет и бомб', d: '«Оборона», «Мульти-волна»', of: 20, r: { silver: 120, xp: 70 } },
  cm: { g: 'pvo', ic: 'task-kills-targeting', t: 'Сбить 5 крылатых ракет или дронов', d: '«Оборона», «Мульти-волна», онлайн за ПВО', of: 5, r: { silver: 120, xp: 70 } },
  full: { g: 'pvo', ic: 'task-defense-energy-shield', t: 'Пройти «Оборону» до конца', d: '«Оборона», все волны одного боя', of: 1, r: { silver: 180, xp: 100 } },
  hkill: { g: 'pvo', ev: 1, ic: 'task-heli-helicopter-tail', t: 'Сбить 2 вертолёта', d: '«Оборона» на «Туманной топи»', of: 2, r: { silver: 120, xp: 70 } },
  strike: { g: 'air', ic: 'task-strike-bombing-run', t: 'Поразить 4 объекта ударом', d: '«Вылет», онлайн за авиацию', of: 4, r: { silver: 140, xp: 80 } },
  sam: { g: 'air', ic: 'task-sam-radar-dish', t: 'Подавить 2 зенитных комплекса', d: '«Вылет»', of: 2, r: { silver: 150, xp: 90 } },
  back: { g: 'air', ic: 'daily-sunrise', t: 'Вернуться на аэродром 2 раза', d: '«Вылет» до посадки', of: 2, r: { silver: 110, xp: 60 } },
  mwobj: { g: 'air', ic: 'task-strike-explosion-rays', t: 'Разрушить 20 построек', d: '«Мульти-волна» за нападение', of: 20, r: { silver: 120, xp: 70 } },
  heli: { g: 'air', ev: 1, ic: 'task-heli-helicopter', t: 'Два вылета на вертолёте', d: '«Вылет» на «Туманной топи»', of: 2, r: { silver: 110, xp: 60 } },
  online: { g: 'net', ic: 'task-online-trophy-cup', t: 'Сыграть 2 онлайн-боя', d: 'Онлайн, любая сторона', of: 2, r: { silver: 130, xp: 80 } },
  win: { g: 'net', ic: 'task-online-trophy', t: 'Победить в онлайн-бою', d: 'Онлайн: быстрый бой или своя комната', of: 1, r: { silver: 160, xp: 90 } },
  pvo: { g: 'net', ic: 'task-sam-missile-launcher', t: 'Сбить 8 целей за ПВО в онлайне', d: 'Онлайн за ПВО', of: 8, r: { silver: 150, xp: 90 } },
};
export const WEEKLY = {
  play: { g: 'any', ic: 'menu-checklist', t: 'Сыграть 25 боёв', d: 'Все режимы, кроме обучения', of: 25, r: { silver: 400, xp: 250 } },
  time: { g: 'any', ic: 'timer-stopwatch', t: 'Провести 4 часа в боях', d: 'Все режимы, кроме обучения', of: 240, u: 'h', r: { silver: 500, xp: 300 } },
  xp: { g: 'any', ic: 'task-xp-rank-3', t: 'Набрать 20 000 опыта', d: 'Все режимы, кроме обучения', of: 20000, r: { silver: 500 } },
  real: { g: 'any', ic: 'task-streak-fire', t: '8 боёв в «Реализме»', d: 'Любой режим в «Реализме»', of: 8, r: { silver: 450, xp: 250 } },
  daily: { g: 'any', ic: 'done-check-mark', t: 'Выполнить 15 ежедневных заданий', d: 'Раздел «Задания», вкладка «Ежедневно»', of: 15, r: { silver: 400, gem: 1 } },
  days: { g: 'any', ic: 'weekly-calendar', t: 'Играть 5 дней из 7', d: 'Хотя бы один бой в день, любой режим', of: 5, r: { silver: 300, xp: 200 } },
  downs: { g: 'pvo', ic: 'task-kills-crosshair', t: 'Сбить 80 воздушных целей', d: '«Оборона», «Мульти-волна», онлайн за ПВО', of: 80, r: { silver: 300, xp: 200 } },
  def: { g: 'pvo', ic: 'task-defense-shield', t: 'Отстоять город в обороне 4 раза', d: '«Оборона», все волны одного боя', of: 4, r: { silver: 500, gem: 1 } },
  intc: { g: 'pvo', ic: 'task-sam-incoming-rocket', t: 'Перехватить 150 ракет и бомб', d: '«Оборона», «Мульти-волна»', of: 150, r: { silver: 400, xp: 250 } },
  heli: { g: 'pvo', ev: 1, ic: 'task-heli-helicopter-tail', t: 'Сбить 15 вертолётов', d: '«Оборона» на «Туманной топи»', of: 15, r: { silver: 400, xp: 250 } },
  strike: { g: 'air', ic: 'task-strike-bombing-run', t: 'Поразить 30 объектов ударом', d: '«Вылет», онлайн за авиацию', of: 30, r: { silver: 450, xp: 250 } },
  sams: { g: 'air', ic: 'task-sam-radar-dish', t: 'Подавить 12 зенитных комплексов', d: '«Вылет»', of: 12, r: { silver: 450, xp: 250 } },
  backs: { g: 'air', ic: 'daily-sunrise', t: 'Вернуться на аэродром 10 раз', d: '«Вылет» до посадки', of: 10, r: { silver: 350, xp: 200 } },
  wins: { g: 'net', ic: 'task-online-trophy', t: 'Победить в 8 онлайн-боях', d: 'Онлайн: быстрый бой или своя комната', of: 8, r: { silver: 500, gem: 1 } },
  both: { g: 'net', ic: 'task-online-laurel-crown', t: '6 онлайн-боёв за ПВО и 6 за авиацию', d: 'Онлайн, обе стороны', of: 12, r: { silver: 450, xp: 250 } },
};

// выбор на день и неделю — по номеру дня / недели, у всех игроков один (сервер посчитает так же)
const rng = (s) => () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const shuffled = (a, R) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const ids = (P, g, ev, R) => shuffled(Object.keys(P).filter((k) => P[k].g === g && (ev || !P[k].ev)), R);
// день: одно на любой режим, одно за ПВО, одно за авиацию; примерно раз в три дня онлайн-задание заменяет ПВО или авиацию
export function pickDaily(day, ev = false) {
  const R = rng(day * 7919 + 13), L = [ids(DAILY, 'any', ev, R)[0], ids(DAILY, 'pvo', ev, R)[0], ids(DAILY, 'air', ev, R)[0]];
  if (R() < 0.33) L[1 + Math.floor(R() * 2)] = ids(DAILY, 'net', ev, R)[0];
  return L;
}
// неделя: два на любой режим, одно за ПВО, одно за авиацию, пятое — любое из остальных; онлайн-только — не больше одного, с кристаллом — не больше двух
export function pickWeekly(week, ev = false) {
  const R = rng(week * 104729 + 7), any = ids(WEEKLY, 'any', ev, R), pvo = ids(WEEKLY, 'pvo', ev, R), air = ids(WEEKLY, 'air', ev, R), net = ids(WEEKLY, 'net', ev, R);
  const L = [any[0], any[1], pvo[0], air[0]], rest = shuffled([...any.slice(2), ...pvo.slice(1), ...air.slice(1), net[0]], R);
  const gems = (A) => A.filter((k) => WEEKLY[k].r.gem).length;
  for (const k of rest) { if (gems([...L, k]) <= 2) { L.push(k); break; } }
  return L;
}

// сколько в среднем даёт неделя: для экрана «Все задания» и для решений по экономике
export function weekTotals(ev = false, weeks = 200) {
  const sum = (r, A) => { for (const k in r) A[k] = (A[k] || 0) + r[k]; return A; };
  const daily = {}, weekly = {}, route = {}; let gemsMax = 0;
  for (let i = 0; i < weeks * 7; i++) for (const k of pickDaily(i, ev)) sum(DAILY[k].r, daily);
  for (let i = 0; i < weeks; i++) { const L = pickWeekly(i, ev); for (const k of L) sum(WEEKLY[k].r, weekly); gemsMax = Math.max(gemsMax, L.filter((k) => WEEKLY[k].r.gem).length); }
  for (const w of ROUTE) if (w.r) sum(w.r, route);
  const avg = (A) => { const o = {}; for (const k in A) o[k] = A[k] / weeks; return o; };
  const crates = { silver: CRATE.silver * 7 };
  const D = avg(daily), W = avg(weekly), all = {};
  for (const A of [D, crates, W, CASE, route]) sum(A, all);
  return { daily: D, crates, weekly: W, weekCase: CASE, route, all, gemsMax };
}
