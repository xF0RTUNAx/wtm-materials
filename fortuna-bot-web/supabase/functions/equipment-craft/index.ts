// equipment-craft — ECONOMY_CATALOG.md §7. Крафт за детали, навсегда, без ограничения
// на количество скрафтенного (ограничение — только на то, что АКТИВНО, см. equipment-equip).
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { applyHorseshoe } from "../_shared/game.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { player_id, equipment_slug } = await req.json();
    if (typeof player_id !== "string" || typeof equipment_slug !== "string") {
      return jsonResponse({ error: "player_id и equipment_slug обязательны" }, 400);
    }

    const db = supabaseAdmin();

    const { data: item, error: itemErr } = await db
      .from("equipment_items")
      .select("slug, name, price_details")
      .eq("slug", equipment_slug)
      .maybeSingle();
    if (itemErr) throw itemErr;
    if (!item) return jsonResponse({ error: "Такого оборудования нет" }, 404);

    const { data: already } = await db
      .from("player_equipment")
      .select("equipment_slug")
      .eq("player_id", player_id)
      .eq("equipment_slug", equipment_slug)
      .maybeSingle();
    if (already) return jsonResponse({ error: "Уже скрафчено" }, 409);

    const { data: econ, error: econErr } = await db
      .from("player_economy")
      .select("details")
      .eq("player_id", player_id)
      .maybeSingle();
    if (econErr) throw econErr;
    if (!econ) return jsonResponse({ error: "Игрок не найден" }, 404);
    if (econ.details < item.price_details) {
      return jsonResponse({ error: `Недостаточно деталей: нужно ${item.price_details}` }, 402);
    }

    const { error: updErr } = await db
      .from("player_economy")
      .update({ details: econ.details - item.price_details, updated_at: new Date().toISOString() })
      .eq("player_id", player_id);
    if (updErr) throw updErr;

    const { error: insErr } = await db
      .from("player_equipment")
      .insert({ player_id, equipment_slug });
    if (insErr) throw insErr;

    const horseshoeHit = await applyHorseshoe(db, player_id);

    return jsonResponse({ crafted: item.name, details_spent: item.price_details, horseshoe_bonus: horseshoeHit });
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: "Внутренняя ошибка сервера" }, 500);
  }
});
