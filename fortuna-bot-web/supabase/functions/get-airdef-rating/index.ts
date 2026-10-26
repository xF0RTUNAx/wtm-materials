// get-airdef-rating — окно рейтинга «Воздушного превосходства» (Mark 2026-10-25, макет одобрен): таблица сезона (место, ник, очки — без
// подробностей), своё место и «Мои бои» (все онлайн-бои сезона: засчитан ли — sql/025, 2 + 2 + 2 + 1 — и из чего очки). В таблице — только аккаунты игры
// (sql/022: airdef_rating_board); аккаунт сайта видит таблицу и свои бои, но без места — нужен аккаунт игры (перенос прогресса).
//   { player_id?, season? } → { season, starts_at, ends_at, top: [{ place, nick, points, n }], me: { kind, place, points, n, nick, battles } | null }
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";

const TOP = 100, BATTLES = 60;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const db = supabaseAdmin();
    const cur = await db.rpc("airdef_season_at", { ts: new Date().toISOString() });
    if (cur.error) throw cur.error;
    const season = Number.isInteger(body.season) && body.season > 0 && body.season <= Number(cur.data) ? body.season : Math.max(1, Number(cur.data) || 1);
    const [b, board] = await Promise.all([db.rpc("airdef_season_bounds", { p: season }), db.rpc("airdef_rating_board", { p_season: season })]);
    if (b.error) throw b.error;
    if (board.error) throw board.error;
    const rows = (board.data || []) as { player_id: string; nick: string; points: number; n: number; place: number }[];
    const top = rows.slice(0, TOP).map((r) => ({ place: Number(r.place), nick: r.nick, points: Number(r.points), n: r.n }));
    let me = null;
    const id = body.player_id;
    if (typeof id === "string" && id.length >= 8 && id.length <= 64) {
      const { data: pl } = await db.from("players").select("kind").eq("id", id).maybeSingle();
      if (pl) {
        const mine = rows.find((r) => r.player_id === id);
        const [{ data: list, error }, cnt] = await Promise.all([
          db.from("airdef_mp_results").select("match_id, mode, team, win, rating, rp, result, claimed_at")
            .eq("player_id", id).eq("season", season).not("rating", "is", null).order("claimed_at", { ascending: false }).limit(BATTLES),
          db.rpc("airdef_rating_counted", { p_season: season, p_player: id })]);
        if (error) throw error;
        if (cnt.error) throw cnt.error;
        // засчитаны — как в таблице сезона (sql/025): по 2 лучших в обороне, вылете и «Мульти-волне» + 1 лучший из остальных
        const counted = (cnt.data || []) as { match_id: string; rating: number }[], best = new Set(counted.map((x) => x.match_id));
        const battles = (list || []).map((x) => {
          const res = (x.result || {}) as Record<string, unknown>;
          return { at: x.claimed_at, multi: res.mm === 1, mode: x.mode, team: x.team, win: x.win, draw: Number((x.rp || {}).r) === 200, rating: x.rating, rp: x.rp, counted: best.has(x.match_id) };
        });
        const acc = pl.kind === "airdef" ? await db.from("airdef_accounts").select("nick").eq("player_id", id).maybeSingle() : null;
        me = { kind: pl.kind, nick: acc?.data?.nick ?? null, place: mine ? Number(mine.place) : null, points: mine ? Number(mine.points) : counted.reduce((a, x) => a + x.rating, 0), n: counted.length, battles };
      }
    }
    const bd = (b.data || [])[0] || {};
    return jsonResponse({ season, current: Number(cur.data) || 0, starts_at: bd.starts_at ?? null, ends_at: bd.ends_at ?? null, total: rows.length, top, me });
  } catch (e) {
    console.error("get-airdef-rating", e);
    return jsonResponse({ error: "Внутренняя ошибка сервера" }, 500);
  }
});
