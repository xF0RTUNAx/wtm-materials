// operation — общая цель «Симулятора Летки» (операция «Истребительная угроза»): прогресс, шаги, свой вклад,
// таблица лидеров; action "claim" — забрать награды за достигнутые шаги (и бонус топ-3 после финала);
// action "start" (только админ) — новая операция { name, goal, steps }.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { isAdmin, logFeedEvent } from "../_shared/game.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { player_id, action, name, goal, steps } = await req.json();
    const db = supabaseAdmin();
    if (action === "claim") {
      if (typeof player_id !== "string") return jsonResponse({ error: "Некорректные параметры" }, 400);
      const { data, error } = await db.rpc("operation_claim", { p_player_id: player_id });
      if (error) throw error;
      if (data?.error === "low_contrib") return jsonResponse({ error: `Нужен вклад от ${data.need} очков (у вас ${data.have})` }, 409);
      if (data?.error) return jsonResponse({ error: "Сейчас нет операции" }, 404);
      if (data.details || data.keys) await logFeedEvent(db, player_id, "operation_claim", { details: data.details, keys: data.keys });
      return jsonResponse(data);
    }
    if (action === "start") {
      if (typeof player_id !== "string" || !(await isAdmin(db, player_id))) return jsonResponse({ error: "Только для администратора" }, 403);
      const g = Math.floor(Number(goal)), s = Math.floor(Number(steps));
      if (typeof name !== "string" || !name.trim() || !(g >= 100) || !(s >= 1 && s <= 100)) return jsonResponse({ error: "Некорректные параметры" }, 400);
      const { data, error } = await db.rpc("operation_start", { p_name: name.trim().slice(0, 60), p_goal: g, p_steps: s });
      if (error) throw error;
      await logFeedEvent(db, player_id, "operation_start", { name: name.trim().slice(0, 60), goal: g, steps: s });
      return jsonResponse({ ok: true, id: data });
    }
    // статус
    const op = await db.from("operations").select("*").in("status", ["active", "finished"]).order("id", { ascending: false }).limit(1).maybeSingle();
    if (op.error) throw op.error;
    if (!op.data) return jsonResponse({ operation: null });
    const o = op.data;
    const [top, mine, claims] = await Promise.all([
      db.from("operation_contrib").select("player_id, points, players(login)").eq("op_id", o.id).order("points", { ascending: false }).order("updated_at", { ascending: true }).limit(10),
      typeof player_id === "string" ? db.from("operation_contrib").select("points, updated_at").eq("op_id", o.id).eq("player_id", player_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      typeof player_id === "string" ? db.from("operation_claims").select("step").eq("op_id", o.id).eq("player_id", player_id) : Promise.resolve({ data: [], error: null }),
    ]);
    for (const r of [top, mine, claims]) if (r.error) throw r.error;
    let rank = null;
    if (mine.data) {
      const ahead = await db.from("operation_contrib").select("player_id", { count: "exact", head: true }).eq("op_id", o.id).gt("points", mine.data.points);
      if (ahead.error) throw ahead.error;
      rank = (ahead.count ?? 0) + 1;
    }
    const reached = Math.min(o.steps, Math.floor(Number(o.points) * o.steps / o.goal));
    const got = new Set((claims.data ?? []).map((c: { step: number }) => c.step));
    let pending = 0;
    for (let s = 1; s <= reached; s++) if (!got.has(s)) pending++;
    return jsonResponse({
      operation: { id: o.id, name: o.name, goal: o.goal, steps: o.steps, points: Number(o.points), status: o.status, min_contrib: o.min_contrib,
        step_details: o.step_details, step5_keys: o.step5_keys, final_details: o.final_details, final_keys: o.final_keys, top_bonus: o.top_bonus, reached },
      mine: Number(mine.data?.points ?? 0), rank, pending,
      // players(login) — связь «многие к одному»: PostgREST отдаёт объект (типы supabase-js считают массивом)
      top: (top.data ?? []).map((r: { points: number; players: unknown }) => {
        const pl = (Array.isArray(r.players) ? r.players[0] : r.players) as { login?: string } | null;
        return { login: pl?.login ?? "?", points: Number(r.points) };
      }),
    });
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: "Внутренняя ошибка сервера" }, 500);
  }
});
