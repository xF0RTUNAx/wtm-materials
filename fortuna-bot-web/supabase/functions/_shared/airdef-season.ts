// Награды за сезон рейтинга «Воздушного превосходства» (sql/024 airdef_season_settle): первый запрос после конца сезона их начисляет —
// молча, в игре пока не объявляются. Правила — _shared/airdef/rating.js (SEASON), камуфляжи и цена — _shared/airdef/arsenal.js.
import { SEASON } from "./airdef/rating.js";
import { CAMOS, CAMO_PRICE } from "./airdef/arsenal.js";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const EVERY = 10 * 60 * 1000; // экземпляр функции проверяет не чаще раза в 10 минут — конец сезона заметит с этой задержкой
let next = 0;

export async function settleSeasons(db: SupabaseClient) {
  if (Date.now() < next) return;
  next = Date.now() + 60 * 1000; // сбой (нет sql/024, ошибка расчёта) — следующая попытка через минуту, а не на каждой загрузке
  const { error } = await db.rpc("airdef_season_settle", { p_rules: { per: SEASON.PER, min: SEASON.MIN, top: SEASON.TOP, price: CAMO_PRICE, camos: CAMOS } });
  if (error) throw error;
  next = Date.now() + EVERY;
}
