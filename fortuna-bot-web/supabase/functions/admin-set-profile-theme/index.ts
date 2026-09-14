// admin-set-profile-theme — только для is_admin: назначает себе любой дизайн профиля
// из полного списка (включая эксклюзивный theme-billcipher, не входящий в случайный
// пул assign_random_profile_theme), минуя проверку владения "Игрушечной админкой".
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";

const ALL_THEMES = [
  "theme-harlequin", "theme-serenity", "theme-aquarelle",
  "theme-nostalgia", "theme-hamster", "theme-starry", "theme-billcipher",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { player_id, theme } = await req.json();
    if (typeof player_id !== "string" || (theme !== null && !ALL_THEMES.includes(theme))) {
      return jsonResponse({ error: "Некорректные параметры" }, 400);
    }

    const db = supabaseAdmin();
    const { data: player, error: playerErr } = await db
      .from("players")
      .select("is_admin")
      .eq("id", player_id)
      .maybeSingle();
    if (playerErr) throw playerErr;
    if (!player?.is_admin) {
      return jsonResponse({ error: "Доступно только администратору" }, 403);
    }

    const { error: updErr } = await db.from("players").update({ profile_theme: theme }).eq("id", player_id);
    if (updErr) throw updErr;

    return jsonResponse({ profile_theme: theme });
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: "Внутренняя ошибка сервера" }, 500);
  }
});
