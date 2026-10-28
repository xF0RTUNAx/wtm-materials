// get-airdef-profile — профиль игрока «Воздушного превосходства» (Mark 2026-10-28, макет tools/airdef-ui/profile-mock.html): открывается из таблицы
// рейтинга по нику (свой — из своей карточки, тоже по нику). Всё считает sql/029 airdef_profile: шапка, онлайн по режимам за сезон и за всё
// время, любимые самолёт и ЗРК, лучшие бои сезона (без разбора), места за сезоны. Ни id игрока, ни номеров боёв в ответе нет.
//   { nick, season? } → { season, live, profile } | 404 { error }
// Сезон — как у get-airdef-rating: идущий, а в межсезонье — прошедший; season — номер из окна рейтинга (не больше текущего).
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";

const NICK_RE = /^[\p{L}\p{N}_\- ]{1,32}$/u; // ник аккаунта игры — 3–16 символов (airdef-account); здесь — только отсев мусора

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const nick = typeof body.nick === "string" ? body.nick.trim() : "";
    if (!NICK_RE.test(nick)) return jsonResponse({ error: "Некорректные параметры" }, 400);
    const db = supabaseAdmin();
    const now = new Date().toISOString();
    const [cur, lv] = await Promise.all([db.rpc("airdef_season_at", { ts: now }), db.rpc("airdef_season_live", { ts: now })]);
    if (cur.error) throw cur.error;
    if (lv.error) throw lv.error;
    const at = Number(cur.data) || 0, live = Number(lv.data) || 0;
    const season = Number.isInteger(body.season) && body.season > 0 && body.season <= at ? body.season : live || Math.max(1, at - 1);
    const pr = await db.rpc("airdef_profile", { p_nick: nick, p_season: season });
    if (pr.error) throw pr.error;
    if (!pr.data) return jsonResponse({ error: "Игрок не найден" }, 404);
    return jsonResponse({ season, live: live === season, profile: pr.data });
  } catch (e) {
    console.error("get-airdef-profile", e);
    return jsonResponse({ error: "Внутренняя ошибка сервера" }, 500);
  }
});
