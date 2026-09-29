// Прогресс «Симулятора Летки»: какие ракеты открыты сразу и сколько деталей стоят остальные.
// Копия таблицы из supabase/functions/_shared/drone.ts (там — источник истины для покупок) — при изменении править оба места.
// Правила: «Обучение» и «Аркада» (одиночная и онлайн) — все ракеты; «Реализм» (одиночный и онлайн) — только открытые.
export const BASE_MISSILES = ['aim9b', 'r3s', 'firestreak', 'aim7e'];
export const MISSILE_PRICES = {
  r60m: 15, aim9l: 15, aim7m: 15, r27r: 15, r27t: 15,
  r73: 30, r27er: 30, mica_ir: 30, r33: 30,
  aim9x: 50, iris_t: 50, mica_em: 50, derby: 50, aim54: 50,
  python5: 75, aim120c: 75, r77: 75,
  meteor: 100,
};
// нужна ли покупка ракеты key в режиме mode при открытых owned (Set или массив)
export const lockedIn = (mode, key, owned) => mode === 'real' && !BASE_MISSILES.includes(key) && !(owned && (owned.has ? owned.has(key) : owned.includes(key)));
