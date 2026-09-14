// auth-password — регистрация и вход по логину/паролю (без Supabase Auth,
// по образцу fortuna-game/js/auth.js). Пароль хешируется только здесь,
// в открытом виде никуда не сохраняется и клиенту не возвращается.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { hashPassword, verifyPassword } from "../_shared/password.ts";

const LOGIN_RE = /^[a-zA-Z0-9_]{3,32}$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { action, login, password } = await req.json();

    if (typeof login !== "string" || !LOGIN_RE.test(login)) {
      return jsonResponse(
        { error: "Логин: 3-32 символа, латиница/цифры/подчёркивание" },
        400,
      );
    }
    if (typeof password !== "string" || password.length < 6) {
      return jsonResponse({ error: "Пароль: минимум 6 символов" }, 400);
    }

    const db = supabaseAdmin();

    if (action === "register") {
      const { data: existing } = await db
        .from("players")
        .select("id")
        .eq("login", login)
        .maybeSingle();
      if (existing) {
        return jsonResponse({ error: "Этот логин уже занят" }, 409);
      }

      const password_hash = await hashPassword(password);
      const { data: player, error } = await db
        .from("players")
        .insert({ login, password_hash })
        .select("id, login")
        .single();
      if (error) throw error;

      const { error: econError } = await db
        .from("player_economy")
        .insert({ player_id: player.id });
      if (econError) throw econError;

      return jsonResponse({ player });
    }

    if (action === "login") {
      const { data: player, error } = await db
        .from("players")
        .select("id, login, password_hash")
        .eq("login", login)
        .maybeSingle();
      if (error) throw error;
      if (!player || !(await verifyPassword(password, player.password_hash))) {
        return jsonResponse({ error: "Неверный логин или пароль" }, 401);
      }

      await db
        .from("players")
        .update({ last_seen: new Date().toISOString() })
        .eq("id", player.id);

      return jsonResponse({ player: { id: player.id, login: player.login } });
    }

    return jsonResponse({ error: "Неизвестное действие" }, 400);
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: "Внутренняя ошибка сервера" }, 500);
  }
});
