// airdef-claim — итог онлайн-боя «Воздушного превосходства»: результат в свою таблицу (airdef_mp_results, сводка airdef_mp_stats)
// и награда по правилам онлайна «Летки»; плюс опыт и серебро прокачки (airdef_progress — без дневного предела, «Реализм» ×1,5) (детали, ключи, билет; не больше ONLINE_REWARDS_PER_DAY наградных боёв в сутки, отдельно от «Летки»).
//   { player_id, token } — итог, подписанный игровым сервером секретом MP_SECRET (game-server/airdef-rooms.js → endBattle).
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { logFeedEvent } from "../_shared/game.ts";
import { mskDayStartIso } from "../_shared/msk.ts";
import { ONLINE_REWARDS_PER_DAY, onlineReward, verifySigned, type Reward } from "../_shared/drone.ts";
import { mskToday } from "../_shared/msk.ts";
import { cleanEvents, credit, load, mutate, view, NEED_GAME, NOT_FOUND, type Extra } from "../_shared/airdef-progress.ts";
import { unseal } from "../_shared/airdef-seal.ts";
// @ts-ignore — общий модуль игры (JS), копия tools/airdef-headless/sync-shared.js
import { battlePoints, oppStrength, RATING } from "../_shared/airdef/rating.js";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { player_id, token } = await req.json();
    if (typeof player_id !== "string" || typeof token !== "string") return jsonResponse({ error: "Некорректные параметры" }, 400);
    const p = await verifySigned(token, Deno.env.get("MP_SECRET") || "").catch(() => null); // испорченный итог — 403, не 500
    if (!p || p.g !== "airdef" || p.p !== player_id || typeof p.m !== "string" || !(Number(p.exp) * 1000 > Date.now())) return jsonResponse({ error: "Итог боя не подтверждён" }, 403);
    const db = supabaseAdmin();
    // новичок с аккаунтом сайта (без прогресса игры) бой не засчитываем — только аккаунт игры; проверка до записи боя
    const g = await load(db, player_id);
    if (!g.exists) return jsonResponse(NOT_FOUND, 404);
    if (g.needGame) return jsonResponse(NEED_GAME, 403);
    const mode = p.mode === "real" ? "real" : "arcade", team = p.team === "pvo" ? "pvo" : "air", win = p.w === 1;
    const kills = Math.max(0, Math.min(99, Math.floor(Number(p.k) || 0))), score = Math.max(0, Math.min(100000, Math.floor(Number(p.s) || 0)));
    const ins = await db.from("airdef_mp_results").insert({ match_id: p.m, player_id, mode, team, win, kills, score, result: p });
    if (ins.error) {
      if (ins.error.code === "23505") return jsonResponse({ error: "Этот бой уже засчитан" }, 409);
      throw ins.error;
    }
    const st = await db.rpc("airdef_mp_record", { p_player_id: player_id, p_team: team, p_win: win, p_kills: kills, p_score: score });
    if (st.error) throw st.error;
    // рейтинг (Mark 2026-10-25, sql/022, games/airdef/rating.js): части боя — от игрового сервера (подписаны), сила соперников — по их очкам
    // сезона до этого боя. Очки пишутся у всех онлайн-боёв; в таблице сезона — только аккаунты игры (перенёс прогресс — бои сезона в счёт).
    // rt в итоге есть только у быстрого боя (своя комната рейтинга не даёт — решение Mark): нет rt — рейтинг не считаем. id соперников-людей
    // приходят запечатанными (ope, _shared/airdef-seal.ts): испорченное или пустое — как будто соперников-людей нет
    let rating: { points: number; season: number; parts: Record<string, number> } | null = null, offseason = false;
    try {
      const rt0 = p.rt && typeof p.rt === "object" ? p.rt as Record<string, unknown> : null;
      if (rt0) {
        const cl = (v: unknown, a: number, b: number) => Math.max(a, Math.min(b, Number(v) || 0));
        const rt = { r: [0, RATING.DRAW, RATING.WIN].includes(Number(rt0.r)) ? Number(rt0.r) : 0, c: Math.round(cl(rt0.c, 0, RATING.CONTRIB_MAX)), b: cl(rt0.b, RATING.BOT_MIN, 1),
          m: Number(rt0.m) === 1 ? 1 : RATING.ARCADE_K, k: cl(rt0.k, 1, 1.08), idle: rt0.idle ? 1 : 0 };
        // идущий сезон; 0 — межсезонье (sql/027, неделя между сезонами): бой в рейтинг не идёт
        const ss = await db.rpc("airdef_season_live", { ts: new Date().toISOString() }); if (ss.error) throw ss.error;
        const season = Number(ss.data) || 0;
        if (!season) offseason = true;
        else {
          const pts = async (id: string) => { const q = await db.rpc("airdef_rating_points", { p_player: id, p_season: season }); return q.error ? 0 : Number(q.data) || 0; };
          const opp = (await unseal(p.ope, Deno.env.get("MP_SECRET") || "")).filter((x) => x !== player_id).slice(0, 12);
          const s = oppStrength(await pts(player_id), await Promise.all(opp.map(pts))), points = battlePoints(rt, s);
          const up = await db.from("airdef_mp_results").update({ rating: points, season, rp: { ...rt, s } }).eq("match_id", p.m).eq("player_id", player_id);
          if (up.error) throw up.error;
          rating = { points, season, parts: { ...rt, s } };
        }
      }
    } catch (e) { console.error("airdef-claim rating", e); } // бой записан — рейтинг не роняет награду
    // аккаунт игры (kind = airdef) отделён от сайта: награды мини-игр сайта (детали, ключи, билеты) ему не начисляются
    const acc = await db.from("players").select("kind").eq("id", player_id).maybeSingle();
    const gameAcc = acc.data?.kind === "airdef";
    // награда: победа — как у «Летки»; проигрыш — если лично отличился (≥ 2 сбитых / уничтоженных комплекса)
    const today = await db.from("airdef_mp_results").select("match_id", { count: "exact", head: true }).eq("player_id", player_id).eq("rewarded", true).gte("claimed_at", mskDayStartIso());
    if (today.error) throw today.error;
    const left = ONLINE_REWARDS_PER_DAY - (today.count ?? 0);
    let r: Reward = { details: 0, keys: 0, ticket: false, success: false }, ticket = "";
    if (left > 0 && !gameAcc) {
      r = onlineReward(mode, win, kills, p.hm === 1);
      if (r.success && (r.details || r.keys || r.ticket)) {
        const g = await db.rpc("drone_grant", { p_player_id: player_id, p_details: r.details, p_keys: r.keys, p_bonus_ticket: r.ticket });
        if (g.error) throw g.error;
        ticket = g.data || "";
        await db.from("airdef_mp_results").update({ rewarded: true }).eq("match_id", p.m).eq("player_id", player_id);
        await logFeedEvent(db, player_id, "drone_reward", { game: "airdef", online: true, mode, team, win, details: r.details, keys: r.keys + (ticket === "key" ? 1 : 0), ticket: ticket === "ticket" });
      }
    }
    // прокачка: события боя — из подписанного итога (ev от игрового сервера; у старого сервера — только k: сбитые / уничтоженные)
    let progress = null;
    try {
      const today = mskToday(), e = (p.ev && typeof p.ev === "object" ? p.ev : {}) as Record<string, unknown>;
      const ev = cleanEvents({ ...e, win, ...(p.ev ? {} : team === "air" ? { sams: kills } : { downs: kills }) }, Math.max(1, Math.min(60, Number(e.min) > 0 ? Number(e.min) : 8)));
      let res: ReturnType<typeof credit> | null = null, x1: Extra | null = null;
      const out = await mutate(db, player_id, (P, x) => { res = credit(P, x, ev, { real: mode === "real", online: true, today }); x1 = res.extra; return { ok: true, extra: res.extra }; });
      if (out.ok && res) {
        const c = res as ReturnType<typeof credit>;
        progress = { xp: c.reward.xp, silver: c.reward.silver, lines: c.reward.lines, mult: c.reward.mult, auto: c.auto, state: view(out.P!, x1!, today) };
      }
    } catch (e) { console.error("airdef-claim progress", e); } // награда сайта уже выдана — прокачку не роняем вместе с ней
    return jsonResponse({ details: r.details, keys: r.keys, ticket, rewarded: r.success, online_rewards_left: gameAcc ? null : Math.max(0, left - (r.success ? 1 : 0)), stats: st.data, progress, rating, offseason });
  } catch (e) {
    console.error("airdef-claim", e);
    return jsonResponse({ error: "Внутренняя ошибка сервера" }, 500);
  }
});
