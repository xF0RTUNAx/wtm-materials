// Онлайн «Воздушного превосходства»: общие правила сервера (game-server/airdef-rooms.js) и клиента (airdef/online.js).
// Решения Mark — AIRDEF_PLAN.md, «Онлайн — решения Mark». Команды: авиация (air) против ПВО (pvo), три волны.
// Бой целиком считает сервер той же логикой, что одиночная игра (sim/strike.js, sim/raid.js); клиенты рисуют по снимкам.
/* global THREE */
import { AG, SAM, SAM_COST, LOADOUTS, PLANES } from '../arsenal.js?v=20261011c';

export const AD_PATH = '/ad';             // адрес WebSocket на том же сервере, что «Летка» (/ws — её)
export const AD_MODES = ['arcade', 'real'];
export const AD_SIZES = [1, 2, 3, 4, 5, 6]; // комнаты 1×1 … 6×6
export const WAVES = 3;
export const PLAN_T = 45;                 // расстановка и покупки перед волной, с (все «Готов» — раньше)
export const WAVE_T = 300;                // волна длится не дольше, с
export const DEBRIEF_T = 10;              // итоги волны, с
export const RESULTS_T = 25;              // итоги боя, с
export const TICK_HZ = 30, SNAP_HZ = 15;
export const RESPAWNS = [1, 3, 5];        // возрождений у лётчика на волну (1-я, 2-я, 3-я)
export const RESPAWN_T = 6;               // через столько секунд после сбития — новый вылет с края карты
export const WIN_K = 0.75;                // авиация побеждает, уничтожив столько ценности целей (иначе — ПВО)
export const QUEUE_MIN = 2;               // очередь: минимум 2 на 2 (люди по ролям; «любая» добирает недостающих)
export const QUEUE_EXTRA_T = 15;          // набралось 2 на 2 — ждём ещё столько (вдруг зайдут ещё: 3 на 3, 4 на 4 …)
export const QUEUE_BOTS_T = 60;           // людей мало дольше минуты — добираем ботами
export const MAX_HP = 100;

// классы ПВО для лимита первой волны (на игрока): 1 топовый и 2 средних; ближние (пушки, ПЗРК, «Стрела-1») — только за очки
export const TOP = new Set(['s75', 's300', 's400', 'patriot', 'pac3', 'hawk']);
export const MID = new Set(['s125', 'kub', 'bukm3', 'osa', 'tor', 'torm2', 'pantsir', 'nasams']);
export const samClass = (k) => (TOP.has(k) ? 'top' : MID.has(k) ? 'mid' : 'near');
export const LIMIT1 = { top: 1, mid: 2 };
export const samCost = (k) => SAM_COST[k] || 100;

// связка авиации — самолёт и подвеска из LOADOUTS эпохи: цена по самолёту и оружию
const KIND_COST = { bomb: 12, lgb: 35, tvb: 40, gps: 45, agm: 45, arm: 55, cruise: 110, decoy: 35, ecm: 30 };
export const PLANE_COST = 120;
export const loadoutCost = (L) => PLANE_COST + L.items.reduce((s, [k, n]) => s + (KIND_COST[(AG[k] || {}).kind] || 40) * n, 0) + (L.pod ? 20 : 0);
// подход: истребители (МиГ-29, F-16) — «истребление» (ПРР, ракеты), ударные (Су-30, F/A-18) — «штурмовка» (бомбы)
export const approachOf = (L) => (L.plane === 'mig29' || L.plane === 'f16' ? 'истребление' : 'штурмовка');
export const bundleOf = (era, side, i) => { const L = LOADOUTS[era][i]; return L && L.side === side ? L : null; };
export const bundleName = (L) => `${PLANES[L.plane] || L.plane} · ${L.name}`;

// бюджеты: первая волна — поровну; дальше — база + за результат волны, проигрывающей стороне +20 %
export const BUDGET0 = { air: 420, pvo: 1100 };
// res: { valueK — доля ценности целей, уничтоженная за волну; downs — сбито самолётов; unitKills — уничтожено комплексов }
export function waveBudget(team, res, losing) {
  const b = team === 'air' ? 380 + res.valueK * 700 + res.unitKills * 50 : 450 + res.downs * 70 + (1 - res.valueK) * 300;
  return Math.round(b * (losing ? 1.2 : 1));
}

// снимок самолёта: [id, флаги, hp, x, y, z, yaw, pitch, roll, speed, thr] — флаги: 1 жив, 2 форсаж, 4 улетел (вне карты)
export const A_ALIVE = 1, A_AB = 2, A_OUT = 4;
const r1 = (v) => Math.round(v * 10) / 10, r3 = (v) => Math.round(v * 1000) / 1000;
export const packA = (a) => [a.id, (a.dead ? 0 : A_ALIVE) | (a.ab ? A_AB : 0) | (a.out ? A_OUT : 0), Math.round(a.hp), r1(a.pos.x), r1(a.pos.y), r1(a.pos.z),
  r3(a.yaw), r3(a.pitch), r3(a.roll), Math.round(a.speed), r3(a.thr || 0)];
// комплекс: [id, флаги, lyaw, lel, track (id самолёта; летящее оружие — минус id; 0 — нет), ammo, reloadT, hp] — флаги: 1 уничтожен, 2 излучает, 4 пушка стреляет, 8 ручное
export const U_DEAD = 1, U_EMIT = 2, U_GUN = 4, U_MAN = 8;
export const packU = (u) => [u.id, (u.dead ? U_DEAD : 0) | (u.emit ? U_EMIT : 0) | (u.gunOn ? U_GUN : 0) | (u.manual ? U_MAN : 0), r3(u.lyaw), r3(u.lel),
  u.track ? (u.track.isMun ? -u.track.id : u.track.id) : 0, Math.round(u.ammo * 10) / 10, r1(u.reloadT), Math.round(u.hp)];
// ЗУР: [id, x, y, z, dx, dy, dz, speed, флаги, target] — флаги: 1 двигатель запущен, 2 ускоритель отделён, 4 потеряла цель / уведена
export const M_MOTOR = 1, M_STAGED = 2, M_LOST = 4;
export const packM = (m) => [m.id, r1(m.pos.x), r1(m.pos.y), r1(m.pos.z), r3(m.dir.x), r3(m.dir.y), r3(m.dir.z), Math.round(m.speed),
  (m.lit ? M_MOTOR : 0) | (m.staged ? M_STAGED : 0) | (m.lost || m.decoy ? M_LOST : 0), m.target ? m.target.id : 0];
// оружие самолёта: [id, x, y, z, vx, vy, vz]
export const packW = (w) => [w.id, r1(w.pos.x), r1(w.pos.y), r1(w.pos.z), r1(w.vel.x), r1(w.vel.y), r1(w.vel.z)];

// состояние своего самолёта от клиента: [x, y, z, yaw, pitch, roll, speed, thr, flags] (flags: 1 форсаж)
export function validState(s, half = 16000) {
  if (!Array.isArray(s) || s.length < 9) return false;
  for (let i = 0; i < 9; i++) if (typeof s[i] !== 'number' || !Number.isFinite(s[i])) return false;
  return Math.abs(s[0]) < half + 3000 && Math.abs(s[2]) < half + 3000 && s[1] > -100 && s[1] < 20000 && s[6] >= 0 && s[6] < 1200;
}
const CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const makeCode = (taken) => { for (;;) { let c = ''; for (let i = 0; i < 4; i++) c += CODE_ABC[Math.floor(Math.random() * CODE_ABC.length)]; if (!taken.has(c)) return c; } };
export const cleanCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
export const ROLE_NAMES = { air: 'Авиация', pvo: 'ПВО' };
export const samOk = (k, era, side) => !!SAM[k] && SAM[k].era <= era && SAM[k].side === side;
