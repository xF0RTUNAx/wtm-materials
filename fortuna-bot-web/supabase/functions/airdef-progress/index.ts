// airdef-progress — прокачка «Воздушного превосходства»: прочитать состояние, исследовать за опыт, купить за серебро,
// выбрать текущую цель ветки (опыт за бой исследует её сам, когда хватит).
//   { player_id, action: 'state' }                       → { progress }
//   { player_id, action: 'research' | 'buy', id }        → { ok, progress } | { error } (цены и паритет — по progress.js)
//   { player_id, action: 'goal', branch, id | null }     → { ok, progress }
//   { player_id, action: 'quests' }                      → { progress, crystals } (задания: progress.quests; новый день начисляет незабранное)
//   { player_id, action: 'quest', key }                  → { ok, progress, crystals, auto } | { error } («Забрать»: 'd:id', 'w:id', 'crate', 'chest')
// Правила — _shared/airdef/progress.js (копия games/airdef/progress.js). Тратит только сервер.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { mskToday } from "../_shared/msk.ts";
import { act, extraOf, load, mutate, questsPending, questsRolled, questTake, toProgress, view, NEED_GAME, NOT_FOUND, type Extra } from "../_shared/airdef-progress.ts";
import { settleSeasons } from "../_shared/airdef-season.ts";

const ACTIONS = new Set(["research", "buy", "goal"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { player_id, action, id, branch, key } = await req.json();
    if (typeof player_id !== "string" || player_id.length < 8 || player_id.length > 64) return jsonResponse({ error: "Некорректные параметры" }, 400);
    const db = supabaseAdmin(), today = mskToday();
    const crystals = async () => { const w = await db.rpc("airdef_wallet_view", { p_player: player_id }); if (w.error) throw w.error; return Number((w.data as { crystals?: number })?.crystals) || 0; };
    if (action === "state" || action === undefined || action === "quests") {
      // награды закончившегося сезона (sql/024) — молча; сбой не мешает загрузке прокачки
      if (action !== "quests") await settleSeasons(db).catch((e) => console.error("airdef-progress season", e));
      const { row, exists, needGame } = await load(db, player_id);
      if (!exists) return jsonResponse(NOT_FOUND, 404);
      if (needGame) return jsonResponse(NEED_GAME, 403); // новичок с аккаунтом сайта — прогресс только на аккаунте игры
      let P = toProgress(row), x = extraOf(row);
      // новый день: выполненные, но не забранные задания начисляются сами; без начислений чтение ничего не пишет
      if (row && questsPending(x, today)) {
        let x1 = null as Extra | null;
        const out = await mutate(db, player_id, (P2, x2) => { const r = questsRolled(P2, x2, today); x1 = r.extra; return r; });
        if (out.ok && x1) { P = out.P!; x = x1; }
      }
      return jsonResponse({ progress: view(P, x, today), ...(action === "quests" ? { crystals: await crystals() } : {}) });
    }
    if (action === "quest") {
      let x1 = null as Extra | null;
      const out = await mutate(db, player_id, (P, x) => { const r = questTake(P, x, key, today); if (r.ok) x1 = r.extra; return r; });
      if (out.notFound) return jsonResponse(NOT_FOUND, 404);
      if (out.needGame) return jsonResponse(NEED_GAME, 403);
      if (!out.ok) return jsonResponse({ error: (out as { why?: string }).why || "Нельзя" }, 409);
      return jsonResponse({ ok: true, progress: view(out.P!, x1!, today), crystals: await crystals(), auto: (out as { auto?: string[] }).auto || [] });
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
