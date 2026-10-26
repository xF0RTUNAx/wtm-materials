// airdef-shop — магазин окрасок «Воздушного превосходства» (shop-ui.js, Mark 2026-10-26 — «Витрина»). Пока только состояние кошелька: кристаллы
// (начисляются за сезон рейтинга, sql/024 — молча), свои окраски, окраски «на выбор» (picks), надетые. Покупка, выбор и «надеть» — вместе со
// встраиванием окрасок в бой (этап 2): до конца сезона 1 (01.01.2027) кристаллов ни у кого нет. Только аккаунт игры (kind = airdef).
//   { player_id, action: 'state' } → { season, wallet: { crystals, camos, picks, worn } }
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { player_id, action } = await req.json().catch(() => ({}));
    if (typeof player_id !== "string" || player_id.length < 8 || player_id.length > 64) return jsonResponse({ error: "Некорректные параметры" }, 400);
    const db = supabaseAdmin();
    const { data: pl, error } = await db.from("players").select("kind").eq("id", player_id).maybeSingle();
    if (error) throw error;
    if (!pl) return jsonResponse({ error: "Игрок не найден — войдите в аккаунт игры", code: "not_found" }, 404);
    if (pl.kind !== "airdef") return jsonResponse({ error: "Кристаллы и окраски — только у аккаунта игры", code: "need_game" }, 403);
    if (action !== "state") return jsonResponse({ error: "Покупка окрасок откроется позже", code: "soon" }, 409);
    const ts = new Date().toISOString();
    const [w, at, lv] = await Promise.all([db.from("airdef_wallet").select("crystals, camos, picks").eq("player_id", player_id).maybeSingle(),
      db.rpc("airdef_season_at", { ts }), db.rpc("airdef_season_live", { ts })]);
    if (w.error) throw w.error;
    // сезон окрасок: идущий; в межсезонье (sql/027) — следующий (его окраски уже в магазине)
    const season = Number(lv.data) || Number(at.data) || 1;
    return jsonResponse({ season, wallet: { crystals: w.data?.crystals ?? 0, camos: w.data?.camos ?? [], picks: w.data?.picks ?? 0, worn: {} } });
  } catch (e) {
    console.error("airdef-shop", e);
    return jsonResponse({ error: "Внутренняя ошибка сервера" }, 500);
  }
});
