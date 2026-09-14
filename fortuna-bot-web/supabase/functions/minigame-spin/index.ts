// /fortunagame — ECONOMY_CATALOG.md §5. 3 попытки/день, сброс по UTC-дате.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { hasItem, applyHorseshoe, logFeedEvent } from "../_shared/game.ts";
import { rollMinigame, ATTEMPT_COSTS, MAX_ATTEMPTS, ITEM_CHANCE, ITEM_DUP_COMP } from "../_shared/minigame.ts";

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { player_id } = await req.json();
    if (typeof player_id !== "string") return jsonResponse({ error: "player_id обязателен" }, 400);

    const db = supabaseAdmin();
    const { data: econ, error: econErr } = await db
      .from("player_economy")
      .select("*")
      .eq("player_id", player_id)
      .maybeSingle();
    if (econErr) throw econErr;
    if (!econ) return jsonResponse({ error: "Игрок не найден" }, 404);

    const today = utcDay();
    const attemptsUsed = econ.spin_day === today ? econ.spin_count : 0;
    const attemptNumber = attemptsUsed + 1;
    if (attemptNumber > MAX_ATTEMPTS) {
      return jsonResponse({ error: "Попытки на сегодня закончились" }, 429);
    }

    const hasDiscount = await hasItem(db, player_id, "fortuna_set");
    const cost = hasDiscount
      ? Math.floor(ATTEMPT_COSTS[attemptNumber] * 0.9)
      : ATTEMPT_COSTS[attemptNumber];
    if (econ.loot_points < cost) {
      return jsonResponse({ error: `Недостаточно монет: нужно ${cost}` }, 402);
    }

    const spin = rollMinigame(attemptNumber);

    let itemDrop: "new" | "duplicate" | null = null;
    let dupCoins = 0;
    if (Math.random() < ITEM_CHANCE) {
      const already = await hasItem(db, player_id, "fortuna_set");
      if (already) {
        itemDrop = "duplicate";
        dupCoins = ITEM_DUP_COMP;
      } else {
        itemDrop = "new";
        const { error: insErr } = await db.from("player_items").insert({ player_id, item_slug: "fortuna_set" });
        if (insErr) throw insErr;
      }
    }

    const { error: updErr } = await db
      .from("player_economy")
      .update({
        loot_points: econ.loot_points - cost + spin.coins + dupCoins,
        keys_current: econ.keys_current + spin.keys,
        keys_lifetime: econ.keys_lifetime + spin.keys,
        details: econ.details + spin.details,
        fireball_kills: econ.fireball_kills + spin.resources.fireball_kills,
        radiofugas_kills: econ.radiofugas_kills + spin.resources.radiofugas_kills,
        tu4_points: econ.tu4_points + spin.resources.tu4_points,
        spin_count: attemptNumber,
        spin_day: today,
        updated_at: new Date().toISOString(),
      })
      .eq("player_id", player_id);
    if (updErr) throw updErr;

    const horseshoeHit = await applyHorseshoe(db, player_id);
    await logFeedEvent(db, player_id, "minigame", {
      coins: spin.coins + dupCoins,
      keys: spin.keys,
      details: spin.details,
      resources: spin.resources,
      big_win: spin.bigWin,
      item_drop: itemDrop,
    });

    return jsonResponse({
      rolled: spin.rolled,
      cost_paid: cost,
      attempt_number: attemptNumber,
      attempts_left: MAX_ATTEMPTS - attemptNumber,
      coins_gained: spin.coins + dupCoins,
      keys_gained: spin.keys,
      details_gained: spin.details,
      resources_gained: spin.resources,
      big_win: spin.bigWin,
      item_drop: itemDrop,
      horseshoe_bonus: horseshoeHit,
    });
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: "Внутренняя ошибка сервера" }, 500);
  }
});
