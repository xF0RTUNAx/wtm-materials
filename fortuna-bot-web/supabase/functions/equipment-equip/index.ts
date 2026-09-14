// equipment-equip — ECONOMY_CATALOG.md §7. Активно только одно оборудование одновременно;
// смена (включая снятие, equipment_slug=null) — не чаще раза в 24ч, общий таймер last_equip_swap.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { secondsLeft } from "../_shared/game.ts";

const SWAP_CD = 24 * 3600;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { player_id, equipment_slug } = await req.json();
    if (typeof player_id !== "string" || (equipment_slug !== null && typeof equipment_slug !== "string")) {
      return jsonResponse({ error: "player_id обязателен, equipment_slug — строка или null" }, 400);
    }

    const db = supabaseAdmin();
    const { data: econ, error: econErr } = await db
      .from("player_economy")
      .select("last_equip_swap, active_equipment")
      .eq("player_id", player_id)
      .maybeSingle();
    if (econErr) throw econErr;
    if (!econ) return jsonResponse({ error: "Игрок не найден" }, 404);

    if (equipment_slug === econ.active_equipment) {
      return jsonResponse({ error: "Уже активно" }, 409);
    }

    const left = secondsLeft(econ.last_equip_swap, SWAP_CD);
    if (left > 0) {
      return jsonResponse({ error: "Менять оборудование можно раз в 24 часа", seconds_left: left }, 429);
    }

    if (equipment_slug !== null) {
      const { data: owned } = await db
        .from("player_equipment")
        .select("equipment_slug")
        .eq("player_id", player_id)
        .eq("equipment_slug", equipment_slug)
        .maybeSingle();
      if (!owned) return jsonResponse({ error: "Это оборудование ещё не скрафчено" }, 403);
    }

    const { error: updErr } = await db
      .from("player_economy")
      .update({
        active_equipment: equipment_slug,
        last_equip_swap: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("player_id", player_id);
    if (updErr) throw updErr;

    return jsonResponse({ active_equipment: equipment_slug });
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: "Внутренняя ошибка сервера" }, 500);
  }
});
