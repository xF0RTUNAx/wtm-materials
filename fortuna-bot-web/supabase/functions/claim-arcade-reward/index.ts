// claim-arcade-reward — победа в аркадных мини-играх (games/strat.html, games/sea.html),
// подтверждённая postMessage({type:'mg_win'}) из iframe. Награда выдаётся один раз по run_id,
// полученному из start-game-run (там же списан билет): случайно 2 ключа или 2 детали.
// Тренировочный режим сюда не попадает вообще (клиент не зовёт эту функцию).
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { applyHorseshoe, logFeedEvent } from "../_shared/game.ts";

const GAMES = new Set(["strat", "sea"]);
const GAME_LABEL: Record<string, string> = { strat: "Стратег", sea: "Морской бой" };
// Быстрее этого партию выиграть нельзя — отсекает мгновенный claim сразу после старта.
const MIN_RUN_SECONDS = 25;
const MAX_RUN_SECONDS = 3 * 3600;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { player_id, game, run_id } = await req.json();
    if (typeof player_id !== "string" || typeof run_id !== "string" || !GAMES.has(game)) {
      return jsonResponse({ error: "Некорректные параметры" }, 400);
    }

    const db = supabaseAdmin();

    // Атомарно "закрываем" партию: обновится только открытая партия этого игрока и этой игры
    // нужного возраста — повторный claim того же run_id ничего не найдёт.
    const now = Date.now();
    const { data: claimed, error: claimErr } = await db
      .from("game_runs")
      .update({ status: "claimed", claimed_at: new Date(now).toISOString() })
      .eq("id", run_id)
      .eq("player_id", player_id)
      .eq("game", game)
      .eq("status", "open")
      .lte("started_at", new Date(now - MIN_RUN_SECONDS * 1000).toISOString())
      .gte("started_at", new Date(now - MAX_RUN_SECONDS * 1000).toISOString())
      .select("id");
    if (claimErr) throw claimErr;
    if (!claimed || claimed.length === 0) {
      return jsonResponse({ error: "Партия не найдена, уже засчитана или закончилась слишком быстро" }, 409);
    }

    const { data: econ, error: econErr } = await db
      .from("player_economy")
      .select("keys_current, keys_lifetime, details")
      .eq("player_id", player_id)
      .maybeSingle();
    if (econErr) throw econErr;
    if (!econ) return jsonResponse({ error: "Игрок не найден" }, 404);

    const rewardType = Math.random() < 0.5 ? "keys" : "details";
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (rewardType === "keys") {
      patch.keys_current = econ.keys_current + 2;
      patch.keys_lifetime = econ.keys_lifetime + 2;
    } else {
      patch.details = econ.details + 2;
    }

    const { error: updErr } = await db.from("player_economy").update(patch).eq("player_id", player_id);
    if (updErr) throw updErr;

    const [horseshoeHit] = await Promise.all([
      applyHorseshoe(db, player_id),
      logFeedEvent(db, player_id, "arcade_win", { game: GAME_LABEL[game] ?? game, reward_type: rewardType }),
    ]);

    return jsonResponse({ reward_type: rewardType, reward_amount: 2, horseshoe_bonus: horseshoeHit });
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: "Внутренняя ошибка сервера" }, 500);
  }
});
