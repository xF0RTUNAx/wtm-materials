// airdef-shop — магазин окрасок «Воздушного превосходства» (shop-ui.js, Mark 2026-10-26 — «Витрина»; этап 2 — покупка, 2026-10-27). Кристаллы
// начисляются за сезон рейтинга (sql/024 — молча), окраски «на выбор» (picks) — за 1-е место. Только аккаунт игры (kind = airdef).
//   { player_id, action: 'state' }                → { season, wallet: { crystals, camos, picks, worn } }
//   { player_id, action: 'buy',  key }            → { season, wallet } — за CAMO_PRICE кристаллов (sql/028 airdef_shop_buy)
//   { player_id, action: 'pick', key }            → { season, wallet } — окраска на выбор
//   { player_id, action: 'wear', key }            → { season, wallet } — надеть свою ('самолёт:окраска'); key: null + plane — снять с самолёта
// В магазине — окраски, вышедшие к сезону (arsenal.js camosOut; в межсезонье — следующего сезона, они уже на витрине). Списание — в SQL.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { camosOut, CAMO_PRICE } from "../_shared/airdef/arsenal.js";

const WHY: Record<string, string> = {
  not_sold: "Этой окраски сейчас нет в магазине",
  owned: "Эта окраска уже ваша",
  no_crystals: "Не хватает кристаллов",
  no_pick: "Окраски на выбор нет",
  not_owned: "Сначала купите эту окраску",
};
const CAMO_RE = /^[a-z0-9_]{1,24}:[a-z0-9_]{1,24}$/, PLANE_RE = /^[a-z0-9_]{1,24}$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { player_id, action, key, plane } = await req.json().catch(() => ({}));
    if (typeof player_id !== "string" || player_id.length < 8 || player_id.length > 64) return jsonResponse({ error: "Некорректные параметры" }, 400);
    const db = supabaseAdmin();
    const { data: pl, error } = await db.from("players").select("kind").eq("id", player_id).maybeSingle();
    if (error) throw error;
    if (!pl) return jsonResponse({ error: "Игрок не найден — войдите в аккаунт игры", code: "not_found" }, 404);
    if (pl.kind !== "airdef") return jsonResponse({ error: "Кристаллы и окраски — только у аккаунта игры", code: "need_game" }, 403);
    const ts = new Date().toISOString();
    const [at, lv] = await Promise.all([db.rpc("airdef_season_at", { ts }), db.rpc("airdef_season_live", { ts })]);
    // сезон окрасок: идущий; в межсезонье (sql/027) — следующий (его окраски уже в магазине)
    const season = Number(lv.data) || Number(at.data) || 1;
    if (action === "state" || action === undefined) {
      const w = await db.rpc("airdef_wallet_view", { p_player: player_id });
      if (w.error) throw w.error;
      return jsonResponse({ season, wallet: w.data });
    }
    const camo = typeof key === "string" && CAMO_RE.test(key) ? key : null;
    let r;
    if (action === "buy" || action === "pick") {
      if (!camo) return jsonResponse({ error: "Некорректные параметры" }, 400);
      r = action === "buy"
        ? await db.rpc("airdef_shop_buy", { p_player: player_id, p_camo: camo, p_price: CAMO_PRICE, p_catalog: camosOut(season) })
        : await db.rpc("airdef_shop_pick", { p_player: player_id, p_camo: camo, p_catalog: camosOut(season) });
    } else if (action === "wear") {
      const pn = camo ? camo.split(":")[0] : typeof plane === "string" && PLANE_RE.test(plane) ? plane : null;
      if (!pn) return jsonResponse({ error: "Некорректные параметры" }, 400);
      r = await db.rpc("airdef_shop_wear", { p_player: player_id, p_plane: pn, p_skin: camo ? camo.split(":")[1] : null });
    } else return jsonResponse({ error: "Неизвестное действие" }, 400);
    if (r.error) throw r.error;
    const d = r.data as { wallet?: unknown; error?: string };
    if (d.error) return jsonResponse({ error: WHY[d.error] || "Нельзя", code: d.error }, 409);
    return jsonResponse({ season, wallet: d.wallet });
  } catch (e) {
    console.error("airdef-shop", e);
    return jsonResponse({ error: "Внутренняя ошибка сервера" }, 500);
  }
});
