// Онлайн-бой «Симулятора Летки»: правила, точки появления и формат сетевых сообщений — общие для клиента и сервера.
// Правила согласованы в ONLINE_PLAN.md: командный бой с возрождением, 5 минут, форматы 1×1…4×4, Аркада и Реализм раздельно.
import { terrainH } from '../terrain-core.js?v=20260929c';

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

// Короткий код комнаты: без похожих символов (0/O, 1/I/L)
const CODE_CH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function makeCode(rnd = Math.random) { let s = ''; for (let i = 0; i < 4; i++) s += CODE_CH[(rnd() * CODE_CH.length) | 0]; return s; }
export const cleanCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
