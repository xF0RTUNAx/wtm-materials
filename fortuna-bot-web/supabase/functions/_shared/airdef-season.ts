// Награды за сезон рейтинга «Воздушного превосходства» (sql/024 airdef_season_settle): первый запрос после конца сезона их начисляет —
// молча, в игре пока не объявляются. Правила — _shared/airdef/rating.js (SEASON), камуфляжи и цена — _shared/airdef/arsenal.js: в награду идут
// только окраски, вышедшие к концу рассчитываемого сезона (camosOut; каждый сезон — 2 новые).
import { SEASON } from "./airdef/rating.js";
import { camosOut, CAMO_PRICE } from "./airdef/arsenal.js";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const EVERY = 10 * 60 * 1000; // экземпляр функции проверяет не чаще раза в 10 минут — конец сезона заметит с этой задержкой
let next = 0;

export async function settleSeasons(db: SupabaseClient) {
  if (Date.now() < next) return;
  next = Date.now() + 60 * 1000; // сбой (нет sql/024, ошибка расчёта) — следующая попытка через минуту, а не на каждой загрузке
  const cur = await db.rpc("airdef_season_at", { ts: new Date().toISOString() });
  if (cur.error) throw cur.error;
  // рассчитывается обычно один сезон — прошедший (cur − 1); если пропущено несколько — все по списку окрасок прошедшего
  const { error } = await db.rpc("airdef_season_settle", { p_rules: { per: SEASON.PER, min: SEASON.MIN, top: SEASON.TOP, price: CAMO_PRICE, camos: camosOut(Number(cur.data) - 1) } });
  if (error) throw error;
  next = Date.now() + EVERY;
}
