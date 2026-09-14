// /meladze — ECONOMY_CATALOG.md §4. Требует "Билет на концерт Меладзе" (meladze_ticket).
// КД 24ч (12ч с "Фрагмент раннего УРВВ" — urvv_fragment). +15000-25000 монет напрямую
// (случайное число, не конверсия фрагов). gitara: +3 детали. "Статуетка Улитки": +1 ключ.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { ownedSlugs, secondsLeft, randInt, applyHorseshoe, logFeedEvent } from "../_shared/game.ts";

const BASE_CD = 24 * 3600;
const REDUCED_CD = 12 * 3600;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { player_id } = await req.json();
    if (typeof player_id !== "string") {
      return jsonResponse({ error: "player_id обязателен" }, 400);
    }

    const db = supabaseAdmin();
    const [{ data: econ, error: econErr }, items] = await Promise.all([
      db
        .from("player_economy")
        .select("last_meladze_farm, loot_points, keys_current, keys_lifetime, details, active_equipment")
        .eq("player_id", player_id)
        .maybeSingle(),
      ownedSlugs(db, player_id),
    ]);
    if (econErr) throw econErr;
    if (!econ) return jsonResponse({ error: "Игрок не найден" }, 404);

    if (!items.has("meladze_ticket")) {
      return jsonResponse({ error: "Нужен «Билет на концерт Меладзе» из магазина" }, 403);
    }

    const cooldown = items.has("urvv_fragment") ? REDUCED_CD : BASE_CD;
    const left = secondsLeft(econ.last_meladze_farm, cooldown);
    if (left > 0) {
      return jsonResponse({ error: "Ещё рано на концерт", seconds_left: left }, 429);
    }

    const coins = randInt(15000, 25000);
    const bonusDetails = econ.active_equipment === "gitara" ? 3 : 0;
    const bonusKeys = items.has("snail_statuette") ? 1 : 0;

    const { error: updErr } = await db
      .from("player_economy")
      .update({
        loot_points: econ.loot_points + coins,
        keys_current: econ.keys_current + bonusKeys,
        keys_lifetime: econ.keys_lifetime + bonusKeys,
        details: econ.details + bonusDetails,
        last_meladze_farm: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("player_id", player_id);
    if (updErr) throw updErr;

    const [horseshoeHit] = await Promise.all([
      applyHorseshoe(db, player_id),
      logFeedEvent(db, player_id, "farm", { action: "meladze", coins, bonus_keys: bonusKeys, bonus_details: bonusDetails }),
    ]);

    return jsonResponse({
      coins_gained: coins,
      bonus_keys: bonusKeys,
      bonus_details: bonusDetails,
      new_loot_points: econ.loot_points + coins,
      horseshoe_bonus: horseshoeHit,
    });
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: "Внутренняя ошибка сервера" }, 500);
  }
});
