// Параметры типов рейда — ECONOMY_CATALOG.md §6.
export const RAID_PARAMS: Record<
  string,
  { maxHp: number; dmgMode: "range" | "choice"; dmgMin?: number; dmgMax?: number; dmgChoices?: number[]; attackCdSec: number; durationSec: number }
> = {
  normal: { maxHp: 10000, dmgMode: "range", dmgMin: 50, dmgMax: 500, attackCdSec: 2 * 3600, durationSec: 24 * 3600 },
  hard: { maxHp: 17500, dmgMode: "range", dmgMin: 500, dmgMax: 1000, attackCdSec: 2 * 3600, durationSec: 24 * 3600 },
  "13": { maxHp: 1300, dmgMode: "choice", dmgChoices: [7, 12, 13, 120, 130], attackCdSec: 2 * 3600, durationSec: 24 * 3600 },
  ca: { maxHp: 2000000, dmgMode: "range", dmgMin: 1000, dmgMax: 5000, attackCdSec: 3600, durationSec: 7 * 24 * 3600 },
};

export const WEAPON_PRICE = 5000;
