// /radiofugas — ECONOMY_CATALOG.md §4. КД 24ч (18ч с "Юнкерс Подстилки" — junkers_bedding,
// общий кулдаун-предмет с /fireball). Базовый ролл 1-5 (2-6 с "Собранный сетап в WTM" —
// wtm_setup). Оборудование raketen: ×1.25. "Набор с камуфляжем": 66% шанс +2 ключа +1 деталь.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { ownedSlugs, secondsLeft, randInt, applyHorseshoe, logFeedEvent } from "../_shared/game.ts";

const BASE_CD = 24 * 3600;
const REDUCED_CD = 18 * 3600;

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
        .select("last_radiofugas_farm, radiofugas_kills, active_equipment, keys_current, keys_lifetime, details")
        .eq("player_id", player_id)
        .maybeSingle(),
      ownedSlugs(db, player_id),
    ]);
    if (econErr) throw econErr;
    if (!econ) return jsonResponse({ error: "Игрок не найден" }, 404);

    const cooldown = items.has("junkers_bedding") ? REDUCED_CD : BASE_CD;
    const left = secondsLeft(econ.last_radiofugas_farm, cooldown);
    if (left > 0) {
      return jsonResponse({ error: "Оружие ещё не готово", seconds_left: left }, 429);
    }

    let kills = items.has("wtm_setup") ? randInt(2, 6) : randInt(1, 5);
    if (econ.active_equipment === "raketen") kills = Math.floor(kills * 1.25);

    let bonusKeys = 0;
    let bonusDetails = 0;
    if (items.has("camo_set") && Math.random() < 0.66) {
      bonusKeys = 2;
      bonusDetails = 1;
    }

    const { error: updErr } = await db
      .from("player_economy")
      .update({
        radiofugas_kills: econ.radiofugas_kills + kills,
        last_radiofugas_farm: new Date().toISOString(),
        keys_current: econ.keys_current + bonusKeys,
        keys_lifetime: econ.keys_lifetime + bonusKeys,
        details: econ.details + bonusDetails,
        updated_at: new Date().toISOString(),
      })
      .eq("player_id", player_id);
    if (updErr) throw updErr;

    const [horseshoeHit] = await Promise.all([
      applyHorseshoe(db, player_id),
      logFeedEvent(db, player_id, "farm", { action: "radiofugas", kills, bonus_keys: bonusKeys, bonus_details: bonusDetails }),
    ]);

    return jsonResponse({
      kills_gained: kills,
      bonus_keys: bonusKeys,
      bonus_details: bonusDetails,
      new_total_kills: econ.radiofugas_kills + kills,
      horseshoe_bonus: horseshoeHit,
    });
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: "Внутренняя ошибка сервера" }, 500);
  }
});
