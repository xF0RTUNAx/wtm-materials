// raid-buy-weapon — 5000 монет (скидка fortuna_set), один раз за рейд, безлимит атак дальше.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { hasItem } from "../_shared/game.ts";
import { WEAPON_PRICE } from "../_shared/raids.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { player_id } = await req.json();
    if (typeof player_id !== "string") return jsonResponse({ error: "player_id обязателен" }, 400);

    const db = supabaseAdmin();
    const { data: raid } = await db.from("raids").select("id").eq("status", "active").maybeSingle();
    if (!raid) return jsonResponse({ error: "Сейчас нет активного рейда" }, 404);

    const { data: existing } = await db
      .from("raid_participants")
      .select("has_weapon")
      .eq("raid_id", raid.id)
      .eq("player_id", player_id)
      .maybeSingle();
    if (existing?.has_weapon) return jsonResponse({ error: "Оружие уже куплено" }, 409);

    const { data: econ, error: econErr } = await db
      .from("player_economy")
      .select("loot_points")
      .eq("player_id", player_id)
      .maybeSingle();
    if (econErr) throw econErr;
    if (!econ) return jsonResponse({ error: "Игрок не найден" }, 404);

    const price = (await hasItem(db, player_id, "fortuna_set")) ? Math.floor(WEAPON_PRICE * 0.9) : WEAPON_PRICE;
    if (econ.loot_points < price) return jsonResponse({ error: `Недостаточно монет: нужно ${price}` }, 402);

    const { error: updErr } = await db
      .from("player_economy")
      .update({ loot_points: econ.loot_points - price, updated_at: new Date().toISOString() })
      .eq("player_id", player_id);
    if (updErr) throw updErr;

    const { error: upsertErr } = await db
      .from("raid_participants")
      .upsert({ raid_id: raid.id, player_id, has_weapon: true }, { onConflict: "raid_id,player_id" });
    if (upsertErr) throw upsertErr;

    return jsonResponse({ bought: true, price_paid: price });
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: "Внутренняя ошибка сервера" }, 500);
  }
});
