// /fireball — ECONOMY_CATALOG.md §4. КД 24ч (18ч с "Юнкерс Подстилки" — junkers_bedding).
// Базовый ролл 5-15 (6-16 с "Песня от Олега" — oleg_song), +1 всегда с "Взвод с Азериусом"
// (azerius_platoon). Оборудование raketen: ×1.25. "Набор с камуфляжем" (camo_set):
// 66% шанс +2 ключа +1 деталь. X2/rookie/"Секретные файлы" — не перенесено (см. коммит).
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { hasItem, secondsLeft, randInt, applyHorseshoe } from "../_shared/game.ts";

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
    const { data: econ, error: econErr } = await db
      .from("player_economy")
      .select("last_fireball_farm, fireball_kills, active_equipment")
      .eq("player_id", player_id)
      .maybeSingle();
    if (econErr) throw econErr;
    if (!econ) return jsonResponse({ error: "Игрок не найден" }, 404);

    const hasJunkers = await hasItem(db, player_id, "junkers_bedding");
    const cooldown = hasJunkers ? REDUCED_CD : BASE_CD;
    const left = secondsLeft(econ.last_fireball_farm, cooldown);
    if (left > 0) {
      return jsonResponse({ error: "Оружие ещё не готово", seconds_left: left }, 429);
    }

    const hasOlegSong = await hasItem(db, player_id, "oleg_song");
    let kills = hasOlegSong ? randInt(6, 16) : randInt(5, 15);

    if (await hasItem(db, player_id, "azerius_platoon")) kills += 1;
    if (econ.active_equipment === "raketen") kills = Math.floor(kills * 1.25);

    let bonusKeys = 0;
    let bonusDetails = 0;
    if ((await hasItem(db, player_id, "camo_set")) && Math.random() < 0.66) {
      bonusKeys = 2;
      bonusDetails = 1;
    }

    const { data: cur } = await db
      .from("player_economy")
      .select("keys_current, keys_lifetime, details")
      .eq("player_id", player_id)
      .single();

    const { error: updErr } = await db
      .from("player_economy")
      .update({
        fireball_kills: econ.fireball_kills + kills,
        last_fireball_farm: new Date().toISOString(),
        keys_current: cur!.keys_current + bonusKeys,
        keys_lifetime: cur!.keys_lifetime + bonusKeys,
        details: cur!.details + bonusDetails,
        updated_at: new Date().toISOString(),
      })
      .eq("player_id", player_id);
    if (updErr) throw updErr;

    const horseshoeHit = await applyHorseshoe(db, player_id);

    return jsonResponse({
      kills_gained: kills,
      bonus_keys: bonusKeys,
      bonus_details: bonusDetails,
      new_total_kills: econ.fireball_kills + kills,
      horseshoe_bonus: horseshoeHit,
    });
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: "Внутренняя ошибка сервера" }, 500);
  }
});
