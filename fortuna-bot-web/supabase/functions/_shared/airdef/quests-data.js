// СГЕНЕРИРОВАНО tools/airdef-headless/sync-shared.js из games/airdef — не править здесь
// Задания: пул ежедневных и еженедельных, очки маршрута недели, награды и правила счёта (экран — quests.js). Без DOM: те же правила у игры и у функций Supabase
// (копия в supabase/functions/_shared/airdef, tools/airdef-headless/sync-shared.js).
// Ориентир наград: час в «Реализме» ≈ 4300 опыта и столько же серебра, в «Аркаде» — вдвое меньше (progress.js battleReward).
// Mark 2026-11-04: всё засчитывается только в онлайне (итог подписан игровым сервером), кроме заданий на «Оборону» (solo).
// g — откуда задание: any — любая сторона, pvo — за ПВО, air — за авиацию и удар. c — счётчик боя (onlineCounters, questApply).
export const DAILY_N = 3, WEEKLY_N = 5, PTS_DAILY = 10, PTS_WEEKLY = 20;
export const CRATE = { silver: 150 }, CASE = { gem: 1, silver: 300 }; // за все три сегодня, за все пять недели
// маршрут недели: неделя целиком — 21 × 10 + 5 × 20 = 310 очков, конец маршрута — 250: запас 60 очков (2 дня или 3 еженедельных)
export const ROUTE = [{ p: 0 }, { p: 50, r: { silver: 150 } }, { p: 100, r: { gem: 1 } }, { p: 150, r: { silver: 300 } }, { p: 200, r: { silver: 200, xp: 100 } }, { p: 250, r: { gem: 2, silver: 400 } }];
export const ROUTE_MAX = ROUTE[ROUTE.length - 1].p;

export const DAILY = {
  play3: { g: 'any', c: 'play', ic: 'menu-checklist', t: 'Сыграть 3 боя', d: 'Онлайн, любая сторона', of: 3, r: { silver: 90, xp: 50 } },
  time: { g: 'any', c: 'min', ic: 'timer-stopwatch', t: 'Провести 30 минут в боях', d: 'Онлайн, любая сторона', of: 30, u: 'min', r: { silver: 130, xp: 80 } },
  xp: { g: 'any', c: 'xp', ic: 'task-xp-sergeant', t: 'Набрать 2 000 опыта', d: 'Онлайн, любая сторона', of: 2000, r: { silver: 130 } },
  real: { g: 'any', c: 'real', ic: 'task-streak-fire', t: 'Два боя в «Реализме»', d: 'Онлайн в «Реализме»', of: 2, r: { silver: 150, xp: 90 } },
  top: { g: 'any', c: 'top', ic: 'task-online-trophy', t: 'Стать лучшим в команде', d: 'Онлайн: больше всех очков в своей команде', of: 1, r: { silver: 160, xp: 90 } },
  kills: { g: 'pvo', c: 'downs', ic: 'task-kills-crosshair', t: 'Сбить 10 воздушных целей', d: 'Онлайн за ПВО, «Мульти-волна» за ПВО', of: 10, r: { silver: 140, xp: 80 } },
  waves: { g: 'pvo', c: 'waves', solo: 1, ic: 'task-defense-shield', t: 'Отразить 5 волн обороны', d: '«Оборона», любая карта', of: 5, r: { silver: 120, xp: 70 } },
  intc: { g: 'pvo', c: 'intc', ic: 'task-sam-incoming-rocket', t: 'Перехватить 20 ракет и бомб', d: 'Онлайн, «Мульти-волна» за ПВО', of: 20, r: { silver: 120, xp: 70 } },
  cm: { g: 'pvo', c: 'cm', ic: 'task-kills-targeting', t: 'Сбить 5 крылатых ракет или дронов', d: 'Онлайн, «Мульти-волна» за ПВО', of: 5, r: { silver: 120, xp: 70 } },
  full: { g: 'pvo', c: 'full', solo: 1, ic: 'task-defense-energy-shield', t: 'Пройти «Оборону» до конца', d: '«Оборона», все волны одного боя', of: 1, r: { silver: 180, xp: 100 } },
  kill3: { g: 'pvo', c: 'kill3', ic: 'task-kills-bullseye', t: 'Сбить 3 самолёта за один бой', d: 'Онлайн за ПВО', of: 1, r: { silver: 150, xp: 90 } },
  tbm: { g: 'pvo', c: 'tbm', ic: 'task-sam-missile-launcher', t: 'Перехватить 1 баллистическую ракету', d: 'Онлайн, «Мульти-волна» за ПВО', of: 1, r: { silver: 150, xp: 90 } },
  strike: { g: 'air', c: 'obj', ic: 'task-strike-bombing-run', t: 'Поразить 4 объекта ударом', d: 'Онлайн за авиацию', of: 4, r: { silver: 140, xp: 80 } },
  sam: { g: 'air', c: 'sams', ic: 'task-sam-radar-dish', t: 'Подавить 2 зенитных комплекса', d: 'Онлайн за авиацию', of: 2, r: { silver: 150, xp: 90 } },
  mwobj: { g: 'air', c: 'bld', ic: 'task-strike-falling-bomb', t: 'Разрушить 20 построек', d: 'Онлайн, «Мульти-волна» за нападение', of: 20, r: { silver: 120, xp: 70 } },
  mwsam: { g: 'air', c: 'mwsam', ic: 'task-strike-explosion-rays', t: 'Уничтожить 3 комплекса ударами волны', d: 'Онлайн, «Мульти-волна» за нападение', of: 3, r: { silver: 120, xp: 70 } },
};
export const WEEKLY = {
  play: { g: 'any', c: 'play', ic: 'menu-checklist', t: 'Сыграть 25 боёв', d: 'Онлайн, любая сторона', of: 25, r: { silver: 400, xp: 250 } },
  time: { g: 'any', c: 'min', ic: 'timer-stopwatch', t: 'Провести 4 часа в боях', d: 'Онлайн, любая сторона', of: 240, u: 'h', r: { silver: 500, xp: 300 } },
  xp: { g: 'any', c: 'xp', ic: 'task-xp-rank-3', t: 'Набрать 20 000 опыта', d: 'Онлайн, любая сторона', of: 20000, r: { silver: 500 } },
  real: { g: 'any', c: 'real', ic: 'task-streak-fire', t: '8 боёв в «Реализме»', d: 'Онлайн в «Реализме»', of: 8, r: { silver: 450, xp: 250 } },
  daily: { g: 'any', c: 'dailyDone', ic: 'done-check-mark', t: 'Выполнить 15 ежедневных заданий', d: 'Раздел «Задания», вкладка «Ежедневно»', of: 15, r: { silver: 400, gem: 1 } },
  days: { g: 'any', c: 'day', ic: 'weekly-calendar', t: 'Играть 5 дней из 7', d: 'Хотя бы один онлайн-бой в день', of: 5, r: { silver: 300, xp: 200 } },
  downs: { g: 'pvo', c: 'downs', ic: 'task-kills-crosshair', t: 'Сбить 80 воздушных целей', d: 'Онлайн за ПВО, «Мульти-волна» за ПВО', of: 80, r: { silver: 300, xp: 200 } },
  def: { g: 'pvo', c: 'full', solo: 1, ic: 'task-defense-energy-shield', t: 'Отстоять город в обороне 4 раза', d: '«Оборона», все волны одного боя', of: 4, r: { silver: 500, gem: 1 } },
  intc: { g: 'pvo', c: 'intc', ic: 'task-sam-incoming-rocket', t: 'Перехватить 150 ракет и бомб', d: 'Онлайн, «Мульти-волна» за ПВО', of: 150, r: { silver: 400, xp: 250 } },
  tbm: { g: 'pvo', c: 'tbm', ic: 'task-sam-missile-launcher', t: 'Перехватить 15 баллистических ракет', d: 'Онлайн, «Мульти-волна» за ПВО', of: 15, r: { silver: 400, gem: 1 } },
  strike: { g: 'air', c: 'obj', ic: 'task-strike-bombing-run', t: 'Поразить 30 объектов ударом', d: 'Онлайн за авиацию', of: 30, r: { silver: 450, xp: 250 } },
  sams: { g: 'air', c: 'sams', ic: 'task-sam-radar-dish', t: 'Подавить 12 зенитных комплексов', d: 'Онлайн за авиацию', of: 12, r: { silver: 450, xp: 250 } },
  mwsam: { g: 'air', c: 'mwsam', ic: 'task-strike-explosion-rays', t: 'Уничтожить 20 комплексов ударами волны', d: 'Онлайн, «Мульти-волна» за нападение', of: 20, r: { silver: 450, xp: 250 } },
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

// ── счёт ──
// сутки по Москве и номера дня и недели (неделя — с понедельника)
export const mskDay = (now = Date.now()) => new Date(now + 3 * 3600e3).toISOString().slice(0, 10);
export const dayNo = (day) => Math.floor(Date.parse(day + 'T00:00:00Z') / 864e5);
export const weekNo = (day) => Math.floor((dayNo(day) + 3) / 7);
const fresh = (L) => L.map((id) => ({ id, n: 0, st: '' }));
const addTo = (pay, r) => { for (const k in r) pay[k] = (pay[k] || 0) + r[k]; };
const allTaken = (L) => L.length > 0 && L.every((q) => q.st === 'taken');
// точки маршрута: долетел — награда сразу
function payRoute(q, pay) { for (let i = (q.paid || 0) + 1; i < ROUTE.length && ROUTE[i].p <= q.pts; i++) { addTo(pay, ROUTE[i].r); q.paid = i; } }
const takeAll = (L, P, pts, q, pay) => { for (const t of L) if (t.st === 'done' && P[t.id]) { t.st = 'taken'; addTo(pay, P[t.id].r); q.pts += pts; } };
// новый день и неделя: выполненное, но не забранное начисляется само (сгорает только невыполненное). q — состояние (пустое у новичка); исходный объект не меняется.
// Возвращает { q, pay } — pay: что начислить (silver, xp, gem)
export function questRoll(q0, today) {
  const q = structuredClone(q0 && q0.day ? q0 : { d: [], w: [], pts: 0, paid: 0, crate: 0, chest: 0 }), pay = {}, wk = weekNo(today);
  if (q.day !== today) {
    takeAll(q.d, DAILY, PTS_DAILY, q, pay);
    if (allTaken(q.d) && !q.crate) addTo(pay, CRATE);
    q.day = today; q.d = fresh(pickDaily(dayNo(today))); q.crate = 0;
  }
  if (q.wk !== wk) {
    takeAll(q.w, WEEKLY, PTS_WEEKLY, q, pay);
    if (allTaken(q.w) && !q.chest) addTo(pay, CASE);
    payRoute(q, pay);
    q.wk = wk; q.w = fresh(pickWeekly(wk)); q.pts = 0; q.paid = 0; q.chest = 0;
  } else payRoute(q, pay);
  return { q, pay };
}
const stepTask = (t, P, c) => { const def = P[t.id]; if (!def || t.st) return false; const v = Number(c[def.c]) || 0; if (v <= 0) return false; t.n = Math.min(def.of, Math.round((t.n + v) * 10) / 10); if (t.n >= def.of) { t.st = 'done'; return true; } return false; };
// бой: c — счётчики (onlineCounters или { waves, full } из «Обороны»); один бой идёт во все подходящие задания
export function questApply(q0, today, c) {
  const { q, pay } = questRoll(q0, today); let done = 0;
  for (const t of q.d) if (stepTask(t, DAILY, c)) done++;
  const c2 = { ...c, dailyDone: (Number(c.dailyDone) || 0) + done, day: c.online && q.lastPlay !== today ? 1 : Number(c.day) || 0 };
  if (c.online) q.lastPlay = today;
  for (const t of q.w) stepTask(t, WEEKLY, c2);
  return { q, pay };
}
// «Забрать»: key — 'd:id', 'w:id', 'crate' (за все три), 'chest' (за все пять)
export function questClaim(q0, today, key) {
  const { q, pay } = questRoll(q0, today);
  if (key === 'crate' || key === 'chest') {
    const d = key === 'crate', L = d ? q.d : q.w;
    if (q[key]) return { ok: false, why: 'Награда уже получена' };
    if (!allTaken(L)) return { ok: false, why: 'Сначала заберите все задания' };
    q[key] = 1; addTo(pay, d ? CRATE : CASE); return { ok: true, q, pay };
  }
  const [k, id] = String(key).split(':'), d = k === 'd', t = (d ? q.d : k === 'w' ? q.w : []).find((x) => x.id === id), def = t && (d ? DAILY : WEEKLY)[id];
  if (!def) return { ok: false, why: 'Такого задания сейчас нет' };
  if (t.st === 'taken') return { ok: false, why: 'Награда уже получена' };
  if (t.st !== 'done') return { ok: false, why: 'Задание ещё не выполнено' };
  t.st = 'taken'; addTo(pay, def.r); q.pts += d ? PTS_DAILY : PTS_WEEKLY; payRoute(q, pay);
  return { ok: true, q, pay };
}
export const questStale = (q, today) => !q || q.day !== today || q.wk !== weekNo(today);
// что показать: сегодняшнее состояние без записи (задания, снятые из пула, не показываются)
export function questView(q0, today) {
  const { q } = questRoll(q0, today);
  return { day: q.day, d: q.d.filter((t) => DAILY[t.id]), w: q.w.filter((t) => WEEKLY[t.id]), pts: q.pts, paid: q.paid, crate: q.crate, chest: q.chest };
}
const int = (v, hi = 999) => Math.max(0, Math.min(hi, Math.floor(Number(v) || 0)));
// подписанный итог онлайн-боя → счётчики. Поля, которых нет у старого игрового сервера, просто дают 0
export function onlineCounters(p) {
  const e = (p && p.ev && typeof p.ev === 'object' ? p.ev : {}), mm = p.mm === 1, pvo = p.team === 'pvo', k = int(p.k), icp = int(e.icp), drones = int(e.icpD);
  return { online: 1, play: 1, min: Math.max(0, Math.min(60, Number(e.min) || 0)), real: p.mode === 'real' ? 1 : 0, top: e.top ? 1 : 0,
    downs: mm ? icp : pvo ? k : 0, kill3: !mm && pvo && k >= 3 ? 1 : 0, intc: mm ? Math.max(0, icp - drones) : 0, cm: mm ? int(e.icpC) + drones : 0, tbm: mm ? int(e.icpT) : 0,
    obj: !mm && !pvo ? int(e.obj ?? (Array.isArray(e.targets) ? e.targets.length : 0)) : 0, sams: !mm && !pvo ? k : 0, bld: mm ? int(e.bld) : 0, mwsam: mm ? int(e.samk) : 0 };
}
