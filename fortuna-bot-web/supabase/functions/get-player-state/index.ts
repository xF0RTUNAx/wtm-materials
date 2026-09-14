// get-player-state — единственный способ клиенту прочитать свой баланс/предметы:
// player_economy/player_items закрыты для anon напрямую, всё через service_role здесь.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { player_id } = await req.json();
    if (typeof player_id !== "string") {
      return jsonResponse({ error: "player_id обязателен" }, 400);
    }

    const db = supabaseAdmin();
    const [{ data: economy, error: econErr }, { data: items }, { data: equipment }] =
      await Promise.all([
        db.from("player_economy").select("*").eq("player_id", player_id).maybeSingle(),
        db.from("player_items").select("item_slug").eq("player_id", player_id),
        db.from("player_equipment").select("equipment_slug").eq("player_id", player_id),
      ]);
    if (econErr) throw econErr;
    if (!economy) return jsonResponse({ error: "Игрок не найден" }, 404);

    return jsonResponse({
      economy,
      items: (items ?? []).map((r) => r.item_slug),
      equipment: (equipment ?? []).map((r) => r.equipment_slug),
    });
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: "Внутренняя ошибка сервера" }, 500);
  }
});
