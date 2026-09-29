// drone-start — начало вылета «Симулятора Летки» (Аркада или Реализм). ranked: true — потратить билет (награда за вылет);
// нет билетов или не просили — вылет без награды, но сбитые всё равно идут в операцию. Возвращает run_id для drone-claim.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { DAILY_TICKETS } from "../_shared/tickets.ts";
import { DRONE_MODES } from "../_shared/drone.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { player_id, mode, ranked } = await req.json();
    if (typeof player_id !== "string" || !DRONE_MODES.has(mode)) return jsonResponse({ error: "Некорректные параметры" }, 400);
    const db = supabaseAdmin();
    const { data, error } = await db.rpc("drone_start_run", { p_player_id: player_id, p_mode: mode, p_ranked: !!ranked, p_daily: DAILY_TICKETS });
    if (error) throw error;
    return jsonResponse(data);
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: "Внутренняя ошибка сервера" }, 500);
  }
});
