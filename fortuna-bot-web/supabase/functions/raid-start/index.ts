// raid-start — только для is_admin. Один активный рейд одновременно, как в боте.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { isAdmin } from "../_shared/game.ts";
import { RAID_PARAMS } from "../_shared/raids.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { player_id, rtype } = await req.json();
    if (typeof player_id !== "string" || !RAID_PARAMS[rtype]) {
      return jsonResponse({ error: "player_id и корректный rtype обязательны" }, 400);
    }

    const db = supabaseAdmin();
    if (!(await isAdmin(db, player_id))) {
      return jsonResponse({ error: "Только для администратора" }, 403);
    }

    const { data: active } = await db.from("raids").select("id").eq("status", "active").maybeSingle();
    if (active) return jsonResponse({ error: "Рейд уже идёт" }, 409);

    const p = RAID_PARAMS[rtype];
    const now = Date.now();
    const { data: raid, error } = await db
      .from("raids")
      .insert({
        rtype,
        max_hp: p.maxHp,
        hp: p.maxHp,
        status: "active",
        started_at: new Date(now).toISOString(),
        ends_at: new Date(now + p.durationSec * 1000).toISOString(),
      })
      .select("*")
      .single();
    if (error) throw error;

    return jsonResponse({ raid });
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: "Внутренняя ошибка сервера" }, 500);
  }
});
