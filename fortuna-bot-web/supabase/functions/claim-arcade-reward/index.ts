// claim-arcade-reward — победа в аркадных мини-играх (games/strat.html, games/sea.html),
// подтверждённая postMessage({type:'mg_win'}) из iframe. Раз в 24ч на игру — случайно
// 2 ключа или 2 детали. Тренировочный режим сюда не попадает вообще (клиент не зовёт
// эту функцию для тренировочных партий).
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { secondsLeft, applyHorseshoe, logFeedEvent } from "../_shared/game.ts";

const CD_SECONDS = 24 * 3600;
const COOLDOWN_COLUMN: Record<string, string> = {
  strat: "last_strat_win",
  sea: "last_sea_win",
};
const GAME_LABEL: Record<string, string> = { strat: "Стратег", sea: "Морской бой" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { player_id, game } = await req.json();
    if (typeof player_id !== "string" || !COOLDOWN_COLUMN[game]) {
      return jsonResponse({ error: "Некорректные параметры" }, 400);
    }
    const column = COOLDOWN_COLUMN[game];

    const db = supabaseAdmin();
    const { data: econ, error: econErr } = await db
      .from("player_economy")
      .select(`keys_current, keys_lifetime, details, ${column}`)
      .eq("player_id", player_id)
      .maybeSingle();
    if (econErr) throw econErr;
    if (!econ) return jsonResponse({ error: "Игрок не найден" }, 404);

    const left = secondsLeft((econ as Record<string, string | null>)[column], CD_SECONDS);
    if (left > 0) {
      return jsonResponse({ error: "Награда за сегодня уже получена", seconds_left: left }, 429);
    }

    const rewardType = Math.random() < 0.5 ? "keys" : "details";
    const patch: Record<string, unknown> = { [column]: new Date().toISOString(), updated_at: new Date().toISOString() };
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
