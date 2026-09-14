// register-migration-code — вызывается ТОЛЬКО ботом (main.py, команда /webcode),
// никогда клиентом сайта. Авторизация — узкий общий секрет (BOT_SHARED_SECRET),
// не service_role: даже если main.py когда-нибудь утечёт, максимум что можно
// сделать этим секретом — выписать себе код регистрации, а не залезть в базу.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // без 0/O, 1/I — не спутать при переписывании
const CODE_TTL_HOURS = 24;

function generateCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
    if (i === 3) code += "-";
  }
  return code;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const botSecret = Deno.env.get("BOT_SHARED_SECRET");
  if (!botSecret || req.headers.get("x-bot-secret") !== botSecret) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const { telegram_user_id } = await req.json();
    if (typeof telegram_user_id !== "number") {
      return jsonResponse({ error: "telegram_user_id обязателен" }, 400);
    }

    const db = supabaseAdmin();

    const { data: legacy } = await db
      .from("legacy_progress")
      .select("telegram_user_id, claimed")
      .eq("telegram_user_id", telegram_user_id)
      .maybeSingle();

    if (!legacy) {
      return jsonResponse(
        { error: "Прогресс для переноса ещё не завезён — попробуйте позже" },
        404,
      );
    }
    if (legacy.claimed) {
      return jsonResponse(
        { error: "Прогресс уже перенесён на сайт ранее" },
        409,
      );
    }

    const nowIso = new Date().toISOString();
    const { data: existing } = await db
      .from("migration_codes")
      .select("code, expires_at")
      .eq("telegram_user_id", telegram_user_id)
      .eq("used", false)
      .gt("expires_at", nowIso)
      .maybeSingle();

    if (existing) {
      return jsonResponse({ code: existing.code, expires_at: existing.expires_at });
    }

    const expires_at = new Date(
      Date.now() + CODE_TTL_HOURS * 3600 * 1000,
    ).toISOString();

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateCode();
      const { error } = await db
        .from("migration_codes")
        .insert({ code, telegram_user_id, expires_at });
      if (!error) {
        return jsonResponse({ code, expires_at });
      }
      if (error.code !== "23505") throw error; // не конфликт уникальности — реальная ошибка
    }

    return jsonResponse({ error: "Не удалось сгенерировать код, попробуйте снова" }, 500);
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: "Внутренняя ошибка сервера" }, 500);
  }
});
