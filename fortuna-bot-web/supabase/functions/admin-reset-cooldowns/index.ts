// admin-reset-cooldowns — только для is_admin: сбрасывает выбранные кулдауны фарма
// себе же (player_id из запроса), без ограничения по времени.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";

const FIELD_MAP: Record<string, string> = {
  loot: "last_loot_farm",
  fireball: "last_fireball_farm",
  radiofugas: "last_radiofugas_farm",
  meladze: "last_meladze_farm",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { player_id, fields } = await req.json();
    if (typeof player_id !== "string" || !Array.isArray(fields) || fields.length === 0) {
      return jsonResponse({ error: "player_id и fields обязательны" }, 400);
    }
    const chosen = fields.filter((f: unknown) => typeof f === "string" && FIELD_MAP[f]);
    if (chosen.length === 0) {
      return jsonResponse({ error: "Некорректные поля кулдаунов" }, 400);
    }

    const db = supabaseAdmin();
    const { data: player, error: playerErr } = await db
      .from("players")
      .select("is_admin")
      .eq("id", player_id)
      .maybeSingle();
    if (playerErr) throw playerErr;
    if (!player?.is_admin) {
      return jsonResponse({ error: "Доступно только администратору" }, 403);
    }

    const patch: Record<string, null> = {};
    for (const f of chosen) patch[FIELD_MAP[f]] = null;

    const { error: updErr } = await db.from("player_economy").update(patch).eq("player_id", player_id);
    if (updErr) throw updErr;

    return jsonResponse({ reset: chosen });
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: "Внутренняя ошибка сервера" }, 500);
  }
});
