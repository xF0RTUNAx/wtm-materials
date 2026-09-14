// raid-stop — только для is_admin. Досрочная остановка, без наград (как /stopraid).
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { isAdmin } from "../_shared/game.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { player_id } = await req.json();
    if (typeof player_id !== "string") return jsonResponse({ error: "player_id обязателен" }, 400);

    const db = supabaseAdmin();
    if (!(await isAdmin(db, player_id))) {
      return jsonResponse({ error: "Только для администратора" }, 403);
    }

    const { data: active } = await db.from("raids").select("id").eq("status", "active").maybeSingle();
    if (!active) return jsonResponse({ error: "Сейчас нет активного рейда" }, 404);

    const { data, error } = await db.rpc("finish_raid", { p_raid_id: active.id, p_reason: "stopped" });
    if (error) throw error;

    return jsonResponse(data);
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: "Внутренняя ошибка сервера" }, 500);
  }
});
