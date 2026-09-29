// drone-state — всё, что нужно «Симулятору Летки» об игроке: детали, ключи, билеты, открытые ракеты и цены,
// сколько наградных онлайн-боёв осталось сегодня, текущая операция и свой вклад.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { DAILY_TICKETS } from "../_shared/tickets.ts";
import { BASE_MISSILES, MISSILE_PRICES, ONLINE_REWARDS_PER_DAY } from "../_shared/drone.ts";
import { mskToday, mskDayStartIso } from "../_shared/msk.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { player_id } = await req.json();
    if (typeof player_id !== "string") return jsonResponse({ error: "Некорректные параметры" }, 400);
    const db = supabaseAdmin();
    const [econ, owned, online, op] = await Promise.all([
      db.from("player_economy").select("details, keys_current, tickets_day, tickets_used").eq("player_id", player_id).maybeSingle(),
      db.from("drone_missiles").select("missile").eq("player_id", player_id),
      db.from("mp_claims").select("match_id", { count: "exact", head: true }).eq("player_id", player_id).eq("rewarded", true).gte("claimed_at", mskDayStartIso()),
      db.from("operations").select("id, name, goal, steps, points, status, min_contrib").in("status", ["active", "finished"]).order("id", { ascending: false }).limit(1).maybeSingle(),
    ]);
    for (const r of [econ, owned, online, op]) if (r.error) throw r.error;
    if (!econ.data) return jsonResponse({ error: "Игрок не найден" }, 404);
    const e = econ.data;
    let mine = 0;
    if (op.data) {
      const c = await db.from("operation_contrib").select("points").eq("op_id", op.data.id).eq("player_id", player_id).maybeSingle();
      if (c.error) throw c.error;
      mine = Number(c.data?.points ?? 0);
    }
    return jsonResponse({
      details: Number(e.details), keys: Number(e.keys_current),
      tickets_left: e.tickets_day === mskToday() ? Math.max(0, DAILY_TICKETS - e.tickets_used) : DAILY_TICKETS, tickets_daily: DAILY_TICKETS,
      base: BASE_MISSILES, prices: MISSILE_PRICES, owned: (owned.data ?? []).map((r) => r.missile),
      online_rewards_left: Math.max(0, ONLINE_REWARDS_PER_DAY - (online.count ?? 0)),
      operation: op.data ? { ...op.data, points: Number(op.data.points), mine } : null,
    });
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: "Внутренняя ошибка сервера" }, 500);
  }
});
