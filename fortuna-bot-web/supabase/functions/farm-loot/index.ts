// /gimmetheloot — ECONOMY_CATALOG.md §4. КД 8ч (7ч с "Кейс открытый Войдом" — voydom_case).
// Конвертирует НАКОПЛЕННЫЕ tu4_points/fireball_kills/radiofugas_kills в монеты — они НЕ
// обнуляются, при повторном вызове (после кулдауна) та же база конвертируется заново, это
// сознательное поведение оригинального бота, не баг. X2/rookie/"Секретные файлы" не перенесены.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { hasItem, ownedSlugs, secondsLeft, applyHorseshoe, logFeedEvent } from "../_shared/game.ts";

const BASE_CD = 8 * 3600;
const REDUCED_CD = 7 * 3600;

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
      .select("*")
      .eq("player_id", player_id)
      .maybeSingle();
    if (econErr) throw econErr;
    if (!econ) return jsonResponse({ error: "Игрок не найден" }, 404);

    const items = await ownedSlugs(db, player_id);
    const cooldown = items.has("voydom_case") ? REDUCED_CD : BASE_CD;
    const left = secondsLeft(econ.last_loot_farm, cooldown);
    if (left > 0) {
      return jsonResponse({ error: "Ещё рано собирать лут", seconds_left: left }, 429);
    }

    const tuMult = items.has("urvv_button") ? 1.5 : 1.25;
    const fbMult = items.has("maksym_medal_copy") ? 30 : 15;
    const rfMult = items.has("apolis_shard") ? 75 : 50;

    const tu4Val = Math.floor(econ.tu4_points * tuMult);
    let fbVal = econ.fireball_kills * fbMult;
    let rfVal = econ.radiofugas_kills * rfMult;

    if (items.has("cedar_nuts") && Math.random() < 0.5) fbVal = Math.floor(fbVal * 1.5);
    if (items.has("inverted_tank") && Math.random() < 0.5) rfVal = Math.floor(rfVal * 1.5);

    let totalLoot = tu4Val + fbVal + rfVal;

    let bonusPct = 0;
    if (items.has("kostos_mug")) bonusPct += 1;
    if (items.has("paid_bomb")) bonusPct += 3;
    if (items.has("kostya_receipt") && Math.random() < 0.5) bonusPct += 3;
    totalLoot += Math.floor((totalLoot * bonusPct) / 100);

    if (econ.active_equipment === "premium") totalLoot = Math.floor(totalLoot * 1.1);

    const bonusKeys = items.has("maxim_set") ? 1 : 0;

    const { error: updErr } = await db
      .from("player_economy")
      .update({
        loot_points: econ.loot_points + totalLoot,
        keys_current: econ.keys_current + bonusKeys,
        keys_lifetime: econ.keys_lifetime + bonusKeys,
        last_loot_farm: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("player_id", player_id);
    if (updErr) throw updErr;

    const horseshoeHit = await applyHorseshoe(db, player_id);
    await logFeedEvent(db, player_id, "farm", { action: "loot", coins: totalLoot, bonus_keys: bonusKeys });

    return jsonResponse({
      loot_gained: totalLoot,
      bonus_keys: bonusKeys,
      new_loot_points: econ.loot_points + totalLoot,
      breakdown: { tu4_val: tu4Val, fireball_val: fbVal, radiofugas_val: rfVal, bonus_pct: bonusPct },
      horseshoe_bonus: horseshoeHit,
    });
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: "Внутренняя ошибка сервера" }, 500);
  }
});
