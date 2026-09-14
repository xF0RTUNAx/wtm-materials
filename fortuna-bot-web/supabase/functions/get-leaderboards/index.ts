// get-leaderboards — топ игроков по фаерболу, очкам на Ту-4, радиофугасам и монетам.
// player_economy/players не открыты anon напрямую, поэтому через service_role.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";

const BOARDS: { key: string; column: string }[] = [
  { key: "fireball", column: "fireball_kills" },
  { key: "tu4", column: "tu4_points" },
  { key: "radiofugas", column: "radiofugas_kills" },
  { key: "coins", column: "loot_points" },
];
const TOP_N = 10;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const db = supabaseAdmin();

    const boardRows = await Promise.all(
      BOARDS.map(({ column }) =>
        db
          .from("player_economy")
          .select(`player_id, value:${column}`)
          .gt(column, 0)
          .order(column, { ascending: false })
          .limit(TOP_N),
      ),
    );

    const ids = new Set<string>();
    boardRows.forEach(({ data }) => (data ?? []).forEach((r: any) => ids.add(r.player_id)));

    let names: Record<string, string> = {};
    if (ids.size) {
      const { data: players } = await db.from("players").select("id, login").in("id", [...ids]);
      names = Object.fromEntries((players ?? []).map((p) => [p.id, p.login]));
    }

    const result: Record<string, { login: string; value: number }[]> = {};
    BOARDS.forEach(({ key }, i) => {
      result[key] = (boardRows[i].data ?? []).map((r: any) => ({
        login: names[r.player_id] ?? "?",
        value: r.value,
      }));
    });

    return jsonResponse(result);
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: "Внутренняя ошибка сервера" }, 500);
  }
});
