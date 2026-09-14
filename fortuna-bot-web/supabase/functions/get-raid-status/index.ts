// get-raid-status — публичный статус текущего/последнего рейда + топ урона (с именами,
// поэтому через service_role, а не прямой anon-select: players не открыты anon напрямую).
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const db = supabaseAdmin();
    const { data: raid } = await db
      .from("raids")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!raid) return jsonResponse({ raid: null, top: [] });

    const { data: participants } = await db
      .from("raid_participants")
      .select("player_id, damage_dealt, has_weapon")
      .eq("raid_id", raid.id)
      .order("damage_dealt", { ascending: false })
      .limit(10);

    const ids = (participants ?? []).map((p) => p.player_id);
    let names: Record<string, string> = {};
    if (ids.length) {
      const { data: players } = await db.from("players").select("id, login").in("id", ids);
      names = Object.fromEntries((players ?? []).map((p) => [p.id, p.login]));
    }

    const top = (participants ?? [])
      .filter((p) => p.damage_dealt > 0)
      .map((p) => ({ login: names[p.player_id] ?? "?", damage: p.damage_dealt }));

    return jsonResponse({ raid, top });
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: "Внутренняя ошибка сервера" }, 500);
  }
});
