// Таблицы дропа контейнеров — ECONOMY_CATALOG.md §2, дословно из main.py roll_container().
import { randInt } from "./game.ts";

export const CONTAINER_TIERS: Record<number, { name: string; priceKeys: number }> = {
  1: { name: "Обычный", priceKeys: 1 },
  2: { name: "Продвинутый", priceKeys: 3 },
  3: { name: "Эпический", priceKeys: 5 },
  4: { name: "Легендарный", priceKeys: 10 },
};

export const CONTAINER_DETAIL_DROP: Record<number, [number, [number, number]]> = {
  1: [0.12, [1, 1]],
  2: [0.18, [1, 2]],
  3: [0.15, [2, 3]],
  4: [0.18, [3, 5]],
};

export const CONTAINER_DUP_COMP: Record<number, number> = { 1: 5000, 2: 5000, 3: 15000, 4: 50000 };

export interface RollResult {
  coins: number;
  tu4: number;
  fireball: number;
  radiofugas: number;
  keys: number;
  details: number;
  itemSlug: string | null;
}

function empty(): RollResult {
  return { coins: 0, tu4: 0, fireball: 0, radiofugas: 0, keys: 0, details: 0, itemSlug: null };
}

export function rollContainer(tier: number): RollResult {
  const res = empty();
  const r = Math.random() * 100;

  if (tier === 1) {
    if (r < 60) res.coins = randInt(100, 400);
    else if (r < 85) res.coins = randInt(400, 800);
    else if (r < 95) {
      if (Math.random() < 0.5) res.fireball = randInt(2, 5);
      else res.radiofugas = randInt(1, 3);
    } else res.keys = 1;
    // независимый бросок, не из основной таблицы
    if (Math.random() < 0.005) res.itemSlug = "camo_set";
  } else if (tier === 2) {
    if (r < 45) res.coins = randInt(800, 1500);
    else if (r < 75) res.coins = randInt(1500, 3000);
    else if (r < 90) {
      if (Math.random() < 0.5) res.fireball = randInt(2, 5);
      else res.radiofugas = randInt(1, 3);
    } else if (r < 99) res.keys = 2;
    else res.itemSlug = "maxim_set";
  } else if (tier === 3) {
    if (r < 35) res.coins = randInt(3000, 6000);
    else if (r < 65) res.coins = randInt(6000, 10000);
    else if (r < 80) res.tu4 = randInt(100, 300);
    else if (r < 93) res.keys = 3;
    else if (r < 98) res.coins = 25000;
    else res.itemSlug = "oleg_set";
  } else if (tier === 4) {
    if (r < 25) res.coins = randInt(10000, 20000);
    else if (r < 50) res.coins = 25000;
    else if (r < 70) {
      if (Math.random() < 0.5) res.fireball = randInt(15, 25);
      else res.radiofugas = randInt(15, 25);
    } else if (r < 85) res.keys = 5;
    else if (r < 97) res.coins = 40000;
    else res.itemSlug = "maksym_set";
  }

  const [detailChance, [dMin, dMax]] = CONTAINER_DETAIL_DROP[tier];
  if (Math.random() < detailChance) res.details = randInt(dMin, dMax);

  return res;
}
