// airdef-claim — итог онлайн-боя «Воздушного превосходства»: результат в свою таблицу (airdef_mp_results, сводка airdef_mp_stats)
// и награда по правилам онлайна «Летки» (детали, ключи, билет; не больше ONLINE_REWARDS_PER_DAY наградных боёв в сутки, отдельно от «Летки»).
//   { player_id, token } — итог, подписанный игровым сервером секретом MP_SECRET (game-server/airdef-rooms.js → endBattle).
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { logFeedEvent } from "../_shared/game.ts";
import { mskDayStartIso } from "../_shared/msk.ts";
import { ONLINE_REWARDS_PER_DAY, onlineReward, verifySigned, type Reward } from "../_shared/drone.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { player_id, token } = await req.json();
    if (typeof player_id !== "string" || typeof token !== "string") return jsonResponse({ error: "Некорректные параметры" }, 400);
    const p = await verifySigned(token, Deno.env.get("MP_SECRET") || "").catch(() => null); // испорченный итог — 403, не 500
    if (!p || p.g !== "airdef" || p.p !== player_id || typeof p.m !== "string" || !(Number(p.exp) * 1000 > Date.now())) return jsonResponse({ error: "Итог боя не подтверждён" }, 403);
    const db = supabaseAdmin();
    const mode = p.mode === "real" ? "real" : "arcade", team = p.team === "pvo" ? "pvo" : "air", win = p.w === 1;
    const kills = Math.max(0, Math.min(99, Math.floor(Number(p.k) || 0))), score = Math.max(0, Math.min(100000, Math.floor(Number(p.s) || 0)));
    const ins = await db.from("airdef_mp_results").insert({ match_id: p.m, player_id, mode, team, win, kills, score, result: p });
    if (ins.error) {
      if (ins.error.code === "23505") return jsonResponse({ error: "Этот бой уже засчитан" }, 409);
      throw ins.error;
    }
    const st = await db.rpc("airdef_mp_record", { p_player_id: player_id, p_team: team, p_win: win, p_kills: kills, p_score: score });
    if (st.error) throw st.error;
    // награда: победа — как у «Летки»; проигрыш — если лично отличился (≥ 2 сбитых / уничтоженных комплекса)
    const today = await db.from("airdef_mp_results").select("match_id", { count: "exact", head: true }).eq("player_id", player_id).eq("rewarded", true).gte("claimed_at", mskDayStartIso());
    if (today.error) throw today.error;
    const left = ONLINE_REWARDS_PER_DAY - (today.count ?? 0);
    let r: Reward = { details: 0, keys: 0, ticket: false, success: false }, ticket = "";
    if (left > 0) {
      r = onlineReward(mode, win, kills, p.hm === 1);
      if (r.success && (r.details || r.keys || r.ticket)) {
        const g = await db.rpc("drone_grant", { p_player_id: player_id, p_details: r.details, p_keys: r.keys, p_bonus_ticket: r.ticket });
        if (g.error) throw g.error;
        ticket = g.data || "";
        await db.from("airdef_mp_results").update({ rewarded: true }).eq("match_id", p.m).eq("player_id", player_id);
        await logFeedEvent(db, player_id, "drone_reward", { game: "airdef", online: true, mode, team, win, details: r.details, keys: r.keys + (ticket === "key" ? 1 : 0), ticket: ticket === "ticket" });
      }
    }
    return jsonResponse({ details: r.details, keys: r.keys, ticket, rewarded: r.success, online_rewards_left: Math.max(0, left - (r.success ? 1 : 0)), stats: st.data });
  } catch (e) {
    console.error("airdef-claim", e);
    return jsonResponse({ error: "Внутренняя ошибка сервера" }, 500);
  }
});
