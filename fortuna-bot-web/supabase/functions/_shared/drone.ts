// «Симулятор Летки»: ракеты за детали и награды за бой — единый источник для edge-функций drone-*.
// Та же таблица цен — в игре (games/drone/sim/progress.js): при изменении править оба места.

// Открыты всем сразу: три простые ИК и одна средняя полуактивная
export const BASE_MISSILES = ["aim9b", "r3s", "firestreak", "aim7e"];

// Цена в деталях. Группы — по тому, насколько ракета облегчает бой (а не по классу дальности)
export const MISSILE_PRICES: Record<string, number> = {
  // 15 — первые «нормальные» ракеты: лучше стартовых, но легко уводятся ловушками
  r60m: 15, aim9l: 15, aim7m: 15, r27r: 15, r27t: 15,
  // 30 — сильные середнячки
  r73: 30, r27er: 30, mica_ir: 30, r33: 30,
  // 50 — современные, прощают ошибки: высокая помехозащищённость, «выстрелил и забыл»
  aim9x: 50, iris_t: 50, mica_em: 50, derby: 50, aim54: 50,
  // 75 — лучшие в своём классе
  python5: 75, aim120c: 75, r77: 75,
  // 100 — Meteor: прямоточный двигатель, самая большая неизбежная зона
  meteor: 100,
};

export const DRONE_MODES = new Set(["arcade", "real"]);
export const ONLINE_REWARDS_PER_DAY = 5;   // наградных онлайн-боёв в сутки (МСК) — против фарма ботов
export const SOLO_POINTS_PER_DAY = 450;    // очков операции из одиночных вылетов в сутки — против накрутки (онлайн без предела)
export const SOLO_MAX_KILLS = 20;          // больше самолётов за вылет в расписании не бывает
export const SOLO_MIN_SEC = 20;            // вылет короче — не засчитываем
export const SOLO_SEC_PER_KILL = 8;        // и минимум столько секунд на каждого сбитого

// Очки операции за сбитого: Аркада — 1, Реализм — 3
export const pointsFor = (mode: string, kills: number) => Math.max(0, Math.floor(kills)) * (mode === "real" ? 3 : 1);

export type Reward = { details: number; keys: number; ticket: boolean; success: boolean };

// Одиночный вылет на награду: успех — сбито ≥ 4 или сбит флагман.
// Аркада: 2 детали (+1 за флагман). Реализм: ×3 — 6 (+3), 50% ключ, 5% билет.
export function soloReward(mode: string, kills: number, boss: boolean): Reward {
  const success = kills >= 4 || boss;
  if (!success) return { details: 0, keys: 0, ticket: false, success };
  const real = mode === "real";
  const details = (real ? 6 : 2) + (boss ? (real ? 3 : 1) : 0);
  return { details, keys: real && Math.random() < 0.5 ? 1 : 0, ticket: real && Math.random() < 0.05, success };
}

// Онлайн-бой (до ONLINE_REWARDS_PER_DAY в сутки): победа — Аркада 2, Реализм 6 + 50% ключ + 5% билет (если людей больше половины,
// иначе как в Аркаде); проигрыш или ничья, но лично сбил ≥ 2 — половина без ключей и билетов.
export function onlineReward(mode: string, win: boolean, kills: number, humansMajority: boolean): Reward {
  const full = mode === "real" && humansMajority;
  if (win) return { details: full ? 6 : 2, keys: full && Math.random() < 0.5 ? 1 : 0, ticket: full && Math.random() < 0.05, success: true };
  if (kills >= 2) return { details: full ? 3 : 1, keys: 0, ticket: false, success: true };
  return { details: 0, keys: 0, ticket: false, success: false };
}

// Подпись игрового сервера (формат как у билета mp-ticket): base64url(JSON) + "." + base64url(HMAC-SHA256(MP_SECRET, первая часть))
const enc = new TextEncoder();
const b64uDecode = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
export async function verifySigned(token: string, secret: string): Promise<Record<string, unknown> | null> {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig || !secret) return null;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  if (!(await crypto.subtle.verify("HMAC", key, b64uDecode(sig), enc.encode(body)))) return null;
  try { return JSON.parse(new TextDecoder().decode(b64uDecode(body))); } catch { return null; }
}
