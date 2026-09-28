// start-game-run — старт партии на награду в аркадной игре. Списывает 1 билет и выдаёт run_id
// (по нему потом единожды заберётся награда) и seed. Тренировочные режимы сюда не попадают.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { DAILY_TICKETS } from "../_shared/tickets.ts";

const GAMES = new Set(["strat", "sea"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { player_id, game } = await req.json();
    if (typeof player_id !== "string" || typeof game !== "string" || !GAMES.has(game)) {
      return jsonResponse({ error: "Некорректные параметры" }, 400);
    }

    const db = supabaseAdmin();
    const { data, error } = await db.rpc("start_game_run", {
      p_player_id: player_id,
      p_game: game,
      p_daily: DAILY_TICKETS,
    });
    if (error) throw error;
    if (data?.error === "no_tickets") {
      return jsonResponse({ error: "Билеты на сегодня закончились" }, 429);
    }
    return jsonResponse({ run_id: data.run_id, seed: data.seed, tickets_left: data.tickets_left });
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: "Внутренняя ошибка сервера" }, 500);
  }
});
