// Онлайн-бой «Симулятора Летки»: правила, точки появления и формат сетевых сообщений — общие для клиента и сервера.
// Правила согласованы в ONLINE_PLAN.md: командный бой с возрождением, 5 минут, форматы 1×1…4×4, Аркада и Реализм раздельно.
import { terrainH } from '../terrain-core.js?v=20260930b';
import { MISSILES } from '../missiles.js?v=20260930b';

export const MATCH_T = 300;     // длина боя, с
export const RESPAWN_T = 5;     // возрождение после сбития, с
export const COUNTDOWN_T = 3;   // отсчёт перед боем, с
export const RESULTS_T = 20;    // экран итогов, потом — снова лобби, с
export const SNAP_HZ = 20;      // снимков в секунду от сервера и состояний от клиента
export const SIZES = [1, 2, 3, 4];
export const TEAM_NAMES = ['Фортуна', 'Улитка'];
export const ONLINE_MODES = ['arcade', 'real'];
export const MAX_HP = 100;
export const GUN_DMG = 7;       // урон одной очереди-попадания пушки «Изделия» (как у игрока в одиночной игре)
export const PORT = 8787;

// Команда 0 — на юге, нос на север; команда 1 — на севере, нос на юг; слоты — строем по 700 м
export function teamSpawn(team, slot) {
  const x = (slot - 1.5) * 700, z = team ? -9500 : 9500;
  return { x, y: Math.max(terrainH(x, z) + 1500, 4200 + slot * 120), z, yaw: team ? Math.PI : 0 };
}

// Состояние аппарата в сети (массив чисел — компактнее объекта):
// [x, y, z, yaw, pitch, roll, speed, thr, flags]; flags: 1 — форсаж, 2 — стреляет из пушки
export const F_AB = 1, F_FIRE = 2;
const r1 = (v) => Math.round(v * 10) / 10, r3 = (v) => Math.round(v * 1000) / 1000;
export function packState(c, fire) {
  return [r1(c.pos.x), r1(c.pos.y), r1(c.pos.z), r3(c.yaw), r3(c.pitch), r3(c.roll), r1(c.speed), r3(c.thr), (c.ab ? F_AB : 0) | (fire ? F_FIRE : 0)];
}
export function validState(s) {
  return Array.isArray(s) && s.length === 9 && s.every((v) => typeof v === 'number' && Number.isFinite(v))
    && Math.abs(s[0]) < 40000 && s[1] > -500 && s[1] < 30000 && Math.abs(s[2]) < 40000 && s[6] >= 0 && s[6] < 1500;
}

// Подвеска «Изделия» в сети: 8 пилонов [L3 L2 L1 Ф1 Ф2 R1 R2 R3] — как STATIONS (models.js) и MAX_LOAD/STATION_KIND (main.js)
export const MAX_LOAD = 1500;
const ST_KIND = ['tip', 'mid', 'inner', 'belly', 'belly', 'inner', 'mid', 'tip'];
const ST_LIM = { tip: 110, mid: 200, inner: 360, belly: 500 };
export function validLoadout(l) {
  if (!Array.isArray(l) || l.length !== 8) return false;
  let mass = 0;
  for (let i = 0; i < 8; i++) {
    const k = l[i]; if (k === null) continue;
    const M_ = typeof k === 'string' && Object.prototype.hasOwnProperty.call(MISSILES, k) ? MISSILES[k] : null;
    if (!M_ || !M_.mounts.includes(ST_KIND[i]) || M_.mass > ST_LIM[ST_KIND[i]]) return false;
    mass += M_.mass;
  }
  return mass <= MAX_LOAD;
}

// Солнце по погоде (угол места и азимут, °; видно ли) — как WEATHERS в world.js (без медленного смещения за вылет).
// Сервер берёт отсюда направление для «увода» ранних ИК-ГСН на солнце.
const SUN = { day: [46.6, 47.9, 1], morning: [15, 100, 1], evening: [13, 235, 1], sunset: [5.5, 250, 1], overcast: [45, 60, 0], rain: [45, 60, 0] };
export function sunFor(weather, out) {
  const [el, az, vis] = SUN[weather] || SUN.day, e = el * Math.PI / 180, a = az * Math.PI / 180;
  out.set(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a));
  return !!vis;
}

// Ракета в снимке сервера: [id, x, y, z, dx, dy, dz, скорость, flags, цель (id игрока или 0), сближение с целью м/с или null]
export const MF_MOTOR = 1, MF_ACTIVE = 2, MF_LOST = 4;
export function packMissile(m, targetId) {
  const tb = m.t - m.M.drop, motor = tb >= 0 && (tb < m.M.burn || (m.M.sustain && tb < m.M.burn + m.M.sustain.t));
  return [m.id, r1(m.pos.x), r1(m.pos.y), r1(m.pos.z), r3(m.dir.x), r3(m.dir.y), r3(m.dir.z), Math.round(m.speed),
    (motor ? MF_MOTOR : 0) | (m.active ? MF_ACTIVE : 0) | (m.lost || m.decoy ? MF_LOST : 0), targetId, m.closing === undefined ? null : Math.round(m.closing)];
}

// Короткий код комнаты: без похожих символов (0/O, 1/I/L)
const CODE_CH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function makeCode(rnd = Math.random) { let s = ''; for (let i = 0; i < 4; i++) s += CODE_CH[(rnd() * CODE_CH.length) | 0]; return s; }
export const cleanCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
