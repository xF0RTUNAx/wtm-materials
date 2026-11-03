// Задания: пул ежедневных и еженедельных, очки маршрута недели, награды (экран — quests.js). Без DOM: годится для стендов и потом для сервера.
// Ориентир наград: час в «Реализме» ≈ 4300 опыта и столько же серебра, в «Аркаде» — вдвое меньше (progress.js battleReward).
// Mark 2026-11-04: всё засчитывается только в онлайне (итог подписан игровым сервером), кроме заданий на «Оборону» (solo).
// g — откуда задание: any — любая сторона, pvo — за ПВО, air — за авиацию и удар.
export const DAILY_N = 3, WEEKLY_N = 5, PTS_DAILY = 10, PTS_WEEKLY = 20;
export const CRATE = { silver: 150 }, CASE = { gem: 1, silver: 300 }; // за все три сегодня, за все пять недели
// маршрут недели: неделя целиком — 21 × 10 + 5 × 20 = 310 очков, конец маршрута — 250: запас 60 очков (2 дня или 3 еженедельных)
export const ROUTE = [{ p: 0 }, { p: 50, r: { silver: 150 } }, { p: 100, r: { gem: 1 } }, { p: 150, r: { silver: 300 } }, { p: 200, r: { silver: 200, xp: 100 } }, { p: 250, r: { gem: 2, silver: 400 } }];
export const ROUTE_MAX = ROUTE[ROUTE.length - 1].p;

export const DAILY = {
  play3: { g: 'any', ic: 'menu-checklist', t: 'Сыграть 3 боя', d: 'Онлайн, любая сторона', of: 3, r: { silver: 90, xp: 50 } },
  time: { g: 'any', ic: 'timer-stopwatch', t: 'Провести 30 минут в боях', d: 'Онлайн, любая сторона', of: 30, u: 'min', r: { silver: 130, xp: 80 } },
  xp: { g: 'any', ic: 'task-xp-sergeant', t: 'Набрать 2 000 опыта', d: 'Онлайн, любая сторона', of: 2000, r: { silver: 130 } },
  real: { g: 'any', ic: 'task-streak-fire', t: 'Два боя в «Реализме»', d: 'Онлайн в «Реализме»', of: 2, r: { silver: 150, xp: 90 } },
  score: { g: 'any', ic: 'task-streak-star-medal', t: 'Набрать 1 500 очков', d: 'Онлайн, сумма очков за бои', of: 1500, r: { silver: 130, xp: 80 } },
  top: { g: 'any', ic: 'task-online-trophy', t: 'Стать лучшим в команде', d: 'Онлайн: больше всех очков в своей команде', of: 1, r: { silver: 160, xp: 90 } },
  kills: { g: 'pvo', ic: 'task-kills-crosshair', t: 'Сбить 10 воздушных целей', d: 'Онлайн за ПВО, «Мульти-волна» за ПВО', of: 10, r: { silver: 140, xp: 80 } },
  waves: { g: 'pvo', solo: 1, ic: 'task-defense-shield', t: 'Отразить 5 волн обороны', d: '«Оборона», любая карта', of: 5, r: { silver: 120, xp: 70 } },
  intc: { g: 'pvo', ic: 'task-sam-incoming-rocket', t: 'Перехватить 20 ракет и бомб', d: 'Онлайн, «Мульти-волна» за ПВО', of: 20, r: { silver: 120, xp: 70 } },
  cm: { g: 'pvo', ic: 'task-kills-targeting', t: 'Сбить 5 крылатых ракет или дронов', d: 'Онлайн, «Мульти-волна» за ПВО', of: 5, r: { silver: 120, xp: 70 } },
  full: { g: 'pvo', solo: 1, ic: 'task-defense-energy-shield', t: 'Пройти «Оборону» до конца', d: '«Оборона», все волны одного боя', of: 1, r: { silver: 180, xp: 100 } },
  kill3: { g: 'pvo', ic: 'task-kills-bullseye', t: 'Сбить 3 самолёта за один бой', d: 'Онлайн за ПВО', of: 1, r: { silver: 150, xp: 90 } },
  tbm: { g: 'pvo', ic: 'task-sam-missile-launcher', t: 'Перехватить 5 баллистических ракет', d: 'Онлайн, «Мульти-волна» за ПВО', of: 5, r: { silver: 150, xp: 90 } },
  strike: { g: 'air', ic: 'task-strike-bombing-run', t: 'Поразить 4 объекта ударом', d: 'Онлайн за авиацию', of: 4, r: { silver: 140, xp: 80 } },
  sam: { g: 'air', ic: 'task-sam-radar-dish', t: 'Подавить 2 зенитных комплекса', d: 'Онлайн за авиацию', of: 2, r: { silver: 150, xp: 90 } },
  mwobj: { g: 'air', ic: 'task-strike-falling-bomb', t: 'Разрушить 20 построек', d: 'Онлайн, «Мульти-волна» за нападение', of: 20, r: { silver: 120, xp: 70 } },
  clean: { g: 'air', ic: 'daily-sunrise', t: 'Отлетать бой без потери самолёта', d: 'Онлайн за авиацию', of: 1, r: { silver: 110, xp: 60 } },
  mwsam: { g: 'air', ic: 'task-strike-explosion-rays', t: 'Уничтожить 3 комплекса ударами волны', d: 'Онлайн, «Мульти-волна» за нападение', of: 3, r: { silver: 120, xp: 70 } },
};
export const WEEKLY = {
  play: { g: 'any', ic: 'menu-checklist', t: 'Сыграть 25 боёв', d: 'Онлайн, любая сторона', of: 25, r: { silver: 400, xp: 250 } },
  time: { g: 'any', ic: 'timer-stopwatch', t: 'Провести 4 часа в боях', d: 'Онлайн, любая сторона', of: 240, u: 'h', r: { silver: 500, xp: 300 } },
  xp: { g: 'any', ic: 'task-xp-rank-3', t: 'Набрать 20 000 опыта', d: 'Онлайн, любая сторона', of: 20000, r: { silver: 500 } },
  real: { g: 'any', ic: 'task-streak-fire', t: '8 боёв в «Реализме»', d: 'Онлайн в «Реализме»', of: 8, r: { silver: 450, xp: 250 } },
  daily: { g: 'any', ic: 'done-check-mark', t: 'Выполнить 15 ежедневных заданий', d: 'Раздел «Задания», вкладка «Ежедневно»', of: 15, r: { silver: 400, gem: 1 } },
  days: { g: 'any', ic: 'weekly-calendar', t: 'Играть 5 дней из 7', d: 'Хотя бы один онлайн-бой в день', of: 5, r: { silver: 300, xp: 200 } },
  top: { g: 'any', ic: 'task-online-trophy', t: 'Стать лучшим в команде 5 раз', d: 'Онлайн: больше всех очков в своей команде', of: 5, r: { silver: 500, gem: 1 } },
  downs: { g: 'pvo', ic: 'task-kills-crosshair', t: 'Сбить 80 воздушных целей', d: 'Онлайн за ПВО, «Мульти-волна» за ПВО', of: 80, r: { silver: 300, xp: 200 } },
  def: { g: 'pvo', solo: 1, ic: 'task-defense-energy-shield', t: 'Отстоять город в обороне 4 раза', d: '«Оборона», все волны одного боя', of: 4, r: { silver: 500, gem: 1 } },
  intc: { g: 'pvo', ic: 'task-sam-incoming-rocket', t: 'Перехватить 150 ракет и бомб', d: 'Онлайн, «Мульти-волна» за ПВО', of: 150, r: { silver: 400, xp: 250 } },
  tbm: { g: 'pvo', ic: 'task-sam-missile-launcher', t: 'Перехватить 30 баллистических ракет', d: 'Онлайн, «Мульти-волна» за ПВО', of: 30, r: { silver: 400, xp: 250 } },
  strike: { g: 'air', ic: 'task-strike-bombing-run', t: 'Поразить 30 объектов ударом', d: 'Онлайн за авиацию', of: 30, r: { silver: 450, xp: 250 } },
  sams: { g: 'air', ic: 'task-sam-radar-dish', t: 'Подавить 12 зенитных комплексов', d: 'Онлайн за авиацию', of: 12, r: { silver: 450, xp: 250 } },
  clean: { g: 'air', ic: 'daily-sunrise', t: 'Отлетать 5 боёв без потери самолёта', d: 'Онлайн за авиацию', of: 5, r: { silver: 350, xp: 200 } },
  mwsam: { g: 'air', ic: 'task-strike-explosion-rays', t: 'Уничтожить 20 комплексов ударами волны', d: 'Онлайн, «Мульти-волна» за нападение', of: 20, r: { silver: 450, xp: 250 } },
};

// выбор на день и неделю — по номеру дня / недели, у всех игроков один (сервер посчитает так же)
const rng = (s) => () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const shuffled = (a, R) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const ids = (P, g, R) => shuffled(Object.keys(P).filter((k) => P[k].g === g), R);
// день: одно на любую сторону, одно за ПВО, одно за авиацию
export function pickDaily(day) {
  const R = rng(day * 7919 + 13);
  return [ids(DAILY, 'any', R)[0], ids(DAILY, 'pvo', R)[0], ids(DAILY, 'air', R)[0]];
}
// неделя: два на любую сторону, одно за ПВО, одно за авиацию, пятое — любое из остальных; с кристаллом — не больше двух
export function pickWeekly(week) {
  const R = rng(week * 104729 + 7), any = ids(WEEKLY, 'any', R), pvo = ids(WEEKLY, 'pvo', R), air = ids(WEEKLY, 'air', R), L = [];
  const gems = (A) => A.filter((k) => WEEKLY[k].r.gem).length;
  const add = (A, n = 1) => { for (const k of A) if (n > 0 && !L.includes(k) && gems([...L, k]) <= 2) { L.push(k); n--; } };
  add(any, 2); add(pvo); add(air); add(shuffled([...any, ...pvo, ...air], R));
  return L;
}

// сколько в среднем даёт неделя: для экрана «Все задания» и для решений по экономике
export function weekTotals(weeks = 200) {
  const sum = (r, A) => { for (const k in r) A[k] = (A[k] || 0) + r[k]; return A; };
  const daily = {}, weekly = {}, route = {}; let gemsMax = 0;
  for (let i = 0; i < weeks * 7; i++) for (const k of pickDaily(i)) sum(DAILY[k].r, daily);
  for (let i = 0; i < weeks; i++) { const L = pickWeekly(i); for (const k of L) sum(WEEKLY[k].r, weekly); gemsMax = Math.max(gemsMax, L.filter((k) => WEEKLY[k].r.gem).length); }
  for (const w of ROUTE) if (w.r) sum(w.r, route);
  const avg = (A) => { const o = {}; for (const k in A) o[k] = A[k] / weeks; return o; };
  const crates = { silver: CRATE.silver * 7 };
  const D = avg(daily), W = avg(weekly), all = {};
  for (const A of [D, crates, W, CASE, route]) sum(A, all);
  return { daily: D, crates, weekly: W, weekCase: CASE, route, all, gemsMax };
}
