// shop-buy — ECONOMY_CATALOG.md §1. Скидка −10% (округление вниз) при владении
// "Набором Фортуны" (fortuna_set), зависимость urvv_fragment -> требует meladze_ticket,
// повторная покупка одного и того же предмета запрещена.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { hasItem } from "../_shared/game.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { player_id, item_slug } = await req.json();
    if (typeof player_id !== "string" || typeof item_slug !== "string") {
      return jsonResponse({ error: "player_id и item_slug обязательны" }, 400);
    }

    const db = supabaseAdmin();

    const { data: item, error: itemErr } = await db
      .from("shop_items")
      .select("slug, name, price, category, requires_slug")
      .eq("slug", item_slug)
      .maybeSingle();
    if (itemErr) throw itemErr;
    if (!item || item.category !== "shop") {
      return jsonResponse({ error: "Такого предмета нет в магазине" }, 404);
    }

    if (await hasItem(db, player_id, item_slug)) {
      return jsonResponse({ error: "У вас уже есть этот предмет" }, 409);
    }
    if (item.requires_slug && !(await hasItem(db, player_id, item.requires_slug))) {
      return jsonResponse({ error: "Сначала нужен другой предмет-предпосылка" }, 403);
    }

    const { data: econ, error: econErr } = await db
      .from("player_economy")
      .select("loot_points")
      .eq("player_id", player_id)
      .maybeSingle();
    if (econErr) throw econErr;
    if (!econ) return jsonResponse({ error: "Игрок не найден" }, 404);

    const hasDiscount = await hasItem(db, player_id, "fortuna_set");
    const effPrice = hasDiscount ? Math.floor(item.price * 0.9) : item.price;

    if (econ.loot_points < effPrice) {
      return jsonResponse({ error: `Недостаточно монет: нужно ${effPrice}` }, 402);
    }

    const { error: updErr } = await db
      .from("player_economy")
      .update({ loot_points: econ.loot_points - effPrice, updated_at: new Date().toISOString() })
      .eq("player_id", player_id);
    if (updErr) throw updErr;

    const { error: insErr } = await db
      .from("player_items")
      .insert({ player_id, item_slug });
    if (insErr) throw insErr;

    return jsonResponse({
      bought: item.name,
      price_paid: effPrice,
      new_loot_points: econ.loot_points - effPrice,
    });
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: "Внутренняя ошибка сервера" }, 500);
  }
});
