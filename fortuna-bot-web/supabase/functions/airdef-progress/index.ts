// airdef-progress — прокачка «Воздушного превосходства»: прочитать состояние, исследовать за опыт, купить за серебро,
// выбрать текущую цель ветки (опыт за бой исследует её сам, когда хватит).
//   { player_id, action: 'state' }                       → { progress }
//   { player_id, action: 'research' | 'buy', id }        → { ok, progress } | { error } (цены и паритет — по progress.js)
//   { player_id, action: 'goal', branch, id | null }     → { ok, progress }
// Правила — _shared/airdef/progress.js (копия games/airdef/progress.js). Тратит только сервер.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { mskToday } from "../_shared/msk.ts";
import { act, extraOf, load, mutate, toProgress, view, NEED_GAME, NOT_FOUND } from "../_shared/airdef-progress.ts";

const ACTIONS = new Set(["research", "buy", "goal"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { player_id, action, id, branch } = await req.json();
    if (typeof player_id !== "string" || player_id.length < 8 || player_id.length > 64) return jsonResponse({ error: "Некорректные параметры" }, 400);
    const db = supabaseAdmin(), today = mskToday();
    if (action === "state" || action === undefined) {
      const { row, exists, needGame } = await load(db, player_id);
      if (!exists) return jsonResponse(NOT_FOUND, 404);
      if (needGame) return jsonResponse(NEED_GAME, 403); // новичок с аккаунтом сайта — прогресс только на аккаунте игры
      return jsonResponse({ progress: view(toProgress(row), extraOf(row), today) });
    }
    if (!ACTIONS.has(action)) return jsonResponse({ error: "Неизвестное действие" }, 400);
    let x0 = null as ReturnType<typeof extraOf> | null;
    const out = await mutate(db, player_id, (P, x) => { x0 = x; return act(P, action, id, branch); });
    if (out.notFound) return jsonResponse(NOT_FOUND, 404);
    if (out.needGame) return jsonResponse(NEED_GAME, 403);
    if (!out.ok) return jsonResponse({ error: out.why || "Нельзя" }, 409);
    return jsonResponse({ ok: true, progress: view(out.P!, x0!, today) });
  } catch (e) {
    console.error("airdef-progress", e);
    return jsonResponse({ error: "Внутренняя ошибка сервера" }, 500);
  }
});
