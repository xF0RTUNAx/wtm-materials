// Мини-игра Фортуны — ECONOMY_CATALOG.md §5, дословно из main.py roll_minigame().
import { randInt } from "./game.ts";

export type SymbolKey =
  | "skull" | "coin1" | "coin2" | "coin3" | "coin4" | "coin5" | "seven"
  | "key" | "fireball" | "radiofugas" | "tu4" | "clover" | "joker";

interface SymbolDef {
  key: SymbolKey;
  emoji: string;
  weight: number;
  kind: "nothing" | "coin" | "key" | "resource" | "clover" | "joker";
  nominal?: number;
  min?: number;
  max?: number;
  resField?: "fireball_kills" | "radiofugas_kills" | "tu4_points";
  detailPer?: number;
}

export const SYMBOLS: SymbolDef[] = [
  { key: "skull", emoji: "💀", weight: 20, kind: "nothing" },
  { key: "coin1", emoji: "🪙", weight: 14, kind: "coin", nominal: 400 },
  { key: "coin2", emoji: "💰", weight: 12, kind: "coin", nominal: 900 },
  { key: "coin3", emoji: "💵", weight: 10, kind: "coin", nominal: 1500 },
  { key: "coin4", emoji: "💎", weight: 8, kind: "coin", nominal: 2600 },
  { key: "coin5", emoji: "🏆", weight: 5, kind: "coin", nominal: 4400 },
  { key: "seven", emoji: "7️⃣", weight: 2, kind: "coin", nominal: 7777 },
  { key: "key", emoji: "🔑", weight: 6, kind: "key" },
  { key: "fireball", emoji: "🔥", weight: 6, kind: "resource", min: 10, max: 20, resField: "fireball_kills", detailPer: 1 },
  { key: "radiofugas", emoji: "💥", weight: 6, kind: "resource", min: 3, max: 8, resField: "radiofugas_kills", detailPer: 1 },
  { key: "tu4", emoji: "✈️", weight: 6, kind: "resource", min: 150, max: 350, resField: "tu4_points", detailPer: 2 },
  { key: "clover", emoji: "🍀", weight: 4, kind: "clover" },
  { key: "joker", emoji: "🃏", weight: 1, kind: "joker" },
];

const BY_KEY = Object.fromEntries(SYMBOLS.map((s) => [s.key, s])) as Record<SymbolKey, SymbolDef>;

// Приоритет джокера — ⚠️ index 'coin2' (💰) сознательно отсутствует, это баг оригинального
// бота (MINIGAME_JOKER_PRIORITY пропускает его), сохранён 1:1 по умолчанию.
const JOKER_PRIORITY: SymbolKey[] = ["seven", "coin5", "coin4", "coin3", "key", "coin1", "tu4", "radiofugas", "fireball", "clover"];

const COMBO_COINS: Record<number, number> = { 2: 2, 3: 5, 4: 12, 5: 30 };
const COMBO_RES: Record<number, number> = { 2: 2, 3: 3, 4: 4, 5: 5 };
const DETAIL_CONV_CHANCE = 0.45;
export const JACKPOT_777 = 77777;
export const ANTI_JACKPOT = 66666;
export const ITEM_CHANCE = 0.005;
export const ITEM_DUP_COMP = 50000;
export const ATTEMPT_COSTS: Record<number, number> = { 1: 7777, 2: 17777, 3: 27777 };
export const MAX_ATTEMPTS = 3;

function weightedPick(): SymbolKey {
  const r = Math.random() * 100;
  let acc = 0;
  for (const s of SYMBOLS) {
    acc += s.weight;
    if (r < acc) return s.key;
  }
  return SYMBOLS[SYMBOLS.length - 1].key;
}

export interface SpinResult {
  rolled: SymbolKey[];        // после конверсии джокеров
  coins: number;
  keys: number;
  details: number;
  resources: { fireball_kills: number; radiofugas_kills: number; tu4_points: number };
  bigWin: boolean;
  itemDrop: "new" | "duplicate" | null;
  breakdown: ComboBreakdownEntry[];
  jokerReplacements: { to: SymbolKey }[];
  cloverMultiplier: number;
  attemptMultiplier: number;
  jackpot: boolean;
  antiJackpot: boolean;
}

// Раскладка "почему именно такая сумма" — по одной записи на выпавший (не-джокерный
// после конверсии) символ, чтобы клиент мог объяснить каждый элемент отдельно.
export interface ComboBreakdownEntry {
  key: SymbolKey;
  count: number;
  coins?: number;
  keys?: number;
  detailsFromThis?: number;
  resourceField?: "fireball_kills" | "radiofugas_kills" | "tu4_points";
  resourceAmount?: number;
  comboMultiplier?: number;
}

export function rollMinigame(attemptNumber: number): SpinResult {
  const raw = [weightedPick(), weightedPick(), weightedPick(), weightedPick(), weightedPick()];

  const nonJokerCounts: Partial<Record<SymbolKey, number>> = {};
  for (const k of raw) if (k !== "joker") nonJokerCounts[k] = (nonJokerCounts[k] ?? 0) + 1;

  const rolled = raw.map((k) => {
    if (k !== "joker") return k;
    const target = JOKER_PRIORITY.find((cand) => (nonJokerCounts[cand] ?? 0) > 0);
    return target ?? "joker";
  });
  const jokerReplacements = raw
    .map((k, i) => (k === "joker" ? { to: rolled[i] } : null))
    .filter((r): r is { to: SymbolKey } => r !== null);

  const counts: Partial<Record<SymbolKey, number>> = {};
  for (const k of rolled) counts[k] = (counts[k] ?? 0) + 1;

  let coins = 0;
  let keys = 0;
  let details = 0;
  const resources = { fireball_kills: 0, radiofugas_kills: 0, tu4_points: 0 };
  let bigWin = false;
  let jackpot = false;
  let antiJackpot = false;
  const breakdown: ComboBreakdownEntry[] = [];

  for (const [key, count] of Object.entries(counts) as [SymbolKey, number][]) {
    if (count === 5) bigWin = true;
    const def = BY_KEY[key];
    const entry: ComboBreakdownEntry = { key, count };

    if (def.kind === "coin") {
      if (key === "seven" && count >= 3) {
        jackpot = true; // 7х3+ уходит в джекпот, не считается обычным комбо
      } else {
        entry.comboMultiplier = COMBO_COINS[count] ?? 1;
        entry.coins = def.nominal! * count * entry.comboMultiplier;
        coins += entry.coins;
      }
    } else if (key === "skull" && count === 5) {
      antiJackpot = true;
    } else if (def.kind === "key") {
      entry.comboMultiplier = COMBO_RES[count] ?? 1;
      entry.keys = count * entry.comboMultiplier;
      keys += entry.keys;
    } else if (def.kind === "resource") {
      let convertedDetails = 0;
      let keptCopies = 0;
      for (let i = 0; i < count; i++) {
        if (Math.random() < DETAIL_CONV_CHANCE) convertedDetails += def.detailPer!;
        else keptCopies++;
      }
      details += convertedDetails;
      let resSum = 0;
      for (let i = 0; i < keptCopies; i++) resSum += randInt(def.min!, def.max!);
      entry.comboMultiplier = COMBO_RES[count] ?? 1;
      entry.resourceField = def.resField;
      entry.resourceAmount = resSum * entry.comboMultiplier;
      entry.detailsFromThis = convertedDetails;
      resources[def.resField!] += entry.resourceAmount;
    }
    // clover обрабатывается отдельно ниже (множитель известен только после всего цикла),
    // skull(<5) и inert джокер (без валидной цели) остаются "нулевыми" записями как есть
    breakdown.push(entry);
  }

  const cloverCount = counts.clover ?? 0;
  let cloverMultiplier = 1;
  if (cloverCount > 0 && coins > 0) {
    cloverMultiplier = Math.pow(1.5, cloverCount);
    coins = Math.floor(coins * cloverMultiplier);
    const cloverEntry = breakdown.find((e) => e.key === "clover");
    if (cloverEntry) cloverEntry.comboMultiplier = cloverMultiplier;
  }

  coins = Math.floor(coins * attemptNumber);

  if (jackpot) { coins += JACKPOT_777; bigWin = true; }
  if (antiJackpot) { coins += ANTI_JACKPOT; bigWin = true; }

  return {
    rolled, coins, keys, details, resources, bigWin, itemDrop: null,
    breakdown, jokerReplacements, cloverMultiplier, attemptMultiplier: attemptNumber, jackpot, antiJackpot,
  };
}
