// drone-shop — купить ракету «Симулятора Летки» за детали (нужна для «Реализма»; в «Аркаде» доступны все).
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { logFeedEvent } from "../_shared/game.ts";
import { BASE_MISSILES, MISSILE_PRICES } from "../_shared/drone.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { player_id, missile, name } = await req.json();
    if (typeof player_id !== "string" || typeof missile !== "string") return jsonResponse({ error: "Некорректные параметры" }, 400);
    if (BASE_MISSILES.includes(missile)) return jsonResponse({ error: "Эта ракета открыта всем" }, 400);
    const price = Object.prototype.hasOwnProperty.call(MISSILE_PRICES, missile) ? MISSILE_PRICES[missile] : 0;
    if (!price) return jsonResponse({ error: "Нет такой ракеты" }, 400);
    const db = supabaseAdmin();
    const { data, error } = await db.rpc("drone_buy_missile", { p_player_id: player_id, p_missile: missile, p_price: price });
    if (error) throw error;
    if (data === "owned") return jsonResponse({ error: "Уже открыта" }, 409);
    if (data === "no_details") return jsonResponse({ error: `Не хватает деталей: нужно ${price}` }, 402);
    await logFeedEvent(db, player_id, "drone_missile", { missile: typeof name === "string" ? name.slice(0, 24) : missile, price });
    const econ = await db.from("player_economy").select("details").eq("player_id", player_id).maybeSingle();
    return jsonResponse({ ok: true, missile, price, details: Number(econ.data?.details ?? 0) });
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: "Внутренняя ошибка сервера" }, 500);
  }
});
