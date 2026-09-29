// mp-ticket — билет для входа в онлайн-бой «Симулятора Летки» (игровой сервер — fortuna-bot-web/game-server).
// Вход: { player_id }. Выход: { ticket } — base64url(JSON {pid, login, exp}) + "." + base64url(HMAC-SHA256(MP_SECRET, первая часть)).
// Билет живёт 10 минут: игра берёт новый при каждом подключении. Игровой сервер проверяет подпись тем же
// секретом (server.js → checkTicket) и берёт ник из билета — подделать чужой ник без секрета нельзя.
// Секрет: `supabase secrets set MP_SECRET=...` (тот же — в переменной окружения MP_SECRET игрового сервера).
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";

const TTL = 600;
const enc = new TextEncoder();
const b64u = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const secret = Deno.env.get("MP_SECRET");
    if (!secret) return jsonResponse({ error: "Онлайн ещё не настроен" }, 503);
    const { player_id } = await req.json();
    if (typeof player_id !== "string" || player_id.length < 8 || player_id.length > 64) {
      return jsonResponse({ error: "Некорректные параметры" }, 400);
    }

    const db = supabaseAdmin();
    const { data: player, error } = await db.from("players").select("id, login").eq("id", player_id).maybeSingle();
    if (error) throw error;
    if (!player) return jsonResponse({ error: "Игрок не найден — перезайдите на сайт" }, 404);

    const body = b64u(enc.encode(JSON.stringify({ pid: player.id, login: player.login, exp: Math.floor(Date.now() / 1000) + TTL })));
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = b64u(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(body))));
    return jsonResponse({ ticket: `${body}.${sig}` });
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: "Внутренняя ошибка сервера" }, 500);
  }
});
