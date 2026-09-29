// drone-claim — итог боя «Симулятора Летки»: награда (если положена) и очки в операцию «Истребительная угроза».
//   одиночный вылет: { player_id, run_id, kills, boss } — run_id из drone-start (один раз на вылет). Время вылета меряет сервер
//     (от drone-start до этого вызова): слишком короткий вылет урезает число сбитых. Награда — только если вылет был с билетом.
//   онлайн-бой:      { player_id, token } — итог, подписанный игровым сервером секретом MP_SECRET (подделать нельзя);
//     награда — не больше ONLINE_REWARDS_PER_DAY боёв в сутки, очки в операцию — всегда.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { logFeedEvent } from "../_shared/game.ts";
import { mskDayStartIso } from "../_shared/msk.ts";
import { ONLINE_REWARDS_PER_DAY, SOLO_POINTS_PER_DAY, SOLO_MAX_KILLS, SOLO_MIN_SEC, SOLO_SEC_PER_KILL, pointsFor, soloReward, onlineReward, verifySigned,
  type Reward } from "../_shared/drone.ts";

const MAX_RUN_SECONDS = 2 * 3600;
type DB = ReturnType<typeof supabaseAdmin>;

async function grant(db: DB, player_id: string, r: Reward): Promise<string> {
  if (!r.details && !r.keys && !r.ticket) return "";
  const { data, error } = await db.rpc("drone_grant", { p_player_id: player_id, p_details: r.details, p_keys: r.keys, p_bonus_ticket: r.ticket });
  if (error) throw error;
  return data || "";
}
async function addPoints(db: DB, player_id: string, points: number, solo: boolean) {
  if (points <= 0) return null;
  const { data, error } = await db.rpc("operation_add_points", { p_player_id: player_id, p_points: points, p_solo: solo, p_solo_cap: SOLO_POINTS_PER_DAY });
  if (error) throw error;
  if (data && data.step_after > data.step_before) {
    await logFeedEvent(db, player_id, "operation_step", { name: data.name, step: data.step_after, steps: data.steps });
  }
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const { player_id } = body;
    if (typeof player_id !== "string") return jsonResponse({ error: "Некорректные параметры" }, 400);
    const db = supabaseAdmin();

    // ── онлайн-бой ──
    if (typeof body.token === "string") {
      const p = await verifySigned(body.token, Deno.env.get("MP_SECRET") || "");
      if (!p || p.p !== player_id || typeof p.m !== "string" || !(Number(p.exp) * 1000 > Date.now())) return jsonResponse({ error: "Итог боя не подтверждён" }, 403);
      const mode = p.mode === "real" ? "real" : "arcade", kills = Math.max(0, Math.min(99, Math.floor(Number(p.k) || 0)));
      const ins = await db.from("mp_claims").insert({ match_id: p.m, player_id, result: p });
      if (ins.error) {
        if (ins.error.code === "23505") return jsonResponse({ error: "Этот бой уже засчитан" }, 409);
        throw ins.error;
      }
      const today = await db.from("mp_claims").select("match_id", { count: "exact", head: true }).eq("player_id", player_id).eq("rewarded", true).gte("claimed_at", mskDayStartIso());
      if (today.error) throw today.error;
      const left = ONLINE_REWARDS_PER_DAY - (today.count ?? 0);
      let r: Reward = { details: 0, keys: 0, ticket: false, success: false }, ticket = "";
      if (left > 0) {
        r = onlineReward(mode, p.w === 1, kills, p.hm === 1);
        if (r.success) {
          ticket = await grant(db, player_id, r);
          await db.from("mp_claims").update({ rewarded: true }).eq("match_id", p.m).eq("player_id", player_id);
          await logFeedEvent(db, player_id, "drone_reward", { online: true, mode, win: p.w === 1, details: r.details, keys: r.keys + (ticket === "key" ? 1 : 0), ticket: ticket === "ticket" });
        }
      }
      const op = await addPoints(db, player_id, pointsFor(mode, kills), false);
      return jsonResponse({ details: r.details, keys: r.keys, ticket, rewarded: r.success, online_rewards_left: Math.max(0, left - (r.success ? 1 : 0)),
        points: op?.added ?? 0, operation: op });
    }

    // ── одиночный вылет ──
    const { run_id } = body;
    if (typeof run_id !== "string") return jsonResponse({ error: "Некорректные параметры" }, 400);
    const now = Date.now();
    const { data: runs, error: runErr } = await db.from("game_runs")
      .update({ status: "claimed", claimed_at: new Date(now).toISOString(), result: { kills: body.kills, boss: !!body.boss } })
      .eq("id", run_id).eq("player_id", player_id).eq("game", "drone").eq("status", "open")
      .gte("started_at", new Date(now - MAX_RUN_SECONDS * 1000).toISOString())
      .select("ranked, mode, started_at");
    if (runErr) throw runErr;
    if (!runs || !runs.length) return jsonResponse({ error: "Вылет не найден или уже засчитан" }, 409);
    const run = runs[0], mode = run.mode === "real" ? "real" : "arcade";
    const sec = (now - Date.parse(run.started_at)) / 1000;
    // правдоподобие: не больше SOLO_MAX_KILLS и не быстрее SOLO_SEC_PER_KILL на сбитого
    let kills = Math.max(0, Math.min(SOLO_MAX_KILLS, Math.floor(Number(body.kills) || 0)));
    kills = Math.min(kills, Math.max(0, Math.floor((sec - SOLO_MIN_SEC) / SOLO_SEC_PER_KILL)));
    const boss = !!body.boss && sec >= 60;
    let r: Reward = { details: 0, keys: 0, ticket: false, success: false }, ticket = "";
    if (run.ranked) {
      r = soloReward(mode, kills, boss);
      if (r.success) {
        ticket = await grant(db, player_id, r);
        await logFeedEvent(db, player_id, "drone_reward", { online: false, mode, kills, details: r.details, keys: r.keys + (ticket === "key" ? 1 : 0), ticket: ticket === "ticket" });
      }
    }
    const op = await addPoints(db, player_id, pointsFor(mode, kills), true);
    return jsonResponse({ ranked: run.ranked, details: r.details, keys: r.keys, ticket, rewarded: r.success, kills, points: op?.added ?? 0, operation: op });
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: "Внутренняя ошибка сервера" }, 500);
  }
});
