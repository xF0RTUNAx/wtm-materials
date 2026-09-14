// claim-migration-code — игрок вводит на сайте код из /webcode, весь перенос
// прогресса происходит одной транзакцией на стороне БД (claim_migration_code()),
// так что тут только валидация входа и перевод кодов ошибок в понятный текст.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";

const ERROR_MESSAGES: Record<string, string> = {
  CODE_NOT_FOUND: "Такого кода нет — проверьте, что ввели без ошибок",
  CODE_ALREADY_USED: "Этот код уже был использован",
  CODE_EXPIRED: "Код истёк — получите новый командой /webcode в Telegram",
  LEGACY_PROGRESS_NOT_FOUND: "Прогресс для этого кода не найден",
  LEGACY_PROGRESS_ALREADY_CLAIMED: "Прогресс по этому аккаунту уже был перенесён",
  PLAYER_NOT_FOUND: "Аккаунт не найден",
  PLAYER_ALREADY_CLAIMED_A_CODE: "На этот аккаунт уже был перенесён прогресс — второй раз нельзя",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { player_id, code } = await req.json();
    if (typeof player_id !== "string" || typeof code !== "string" || !code.trim()) {
      return jsonResponse({ error: "player_id и code обязательны" }, 400);
    }

    const db = supabaseAdmin();
    const { data, error } = await db.rpc("claim_migration_code", {
      p_player_id: player_id,
      p_code: code.trim().toUpperCase(),
    });

    if (error) {
      const known = ERROR_MESSAGES[error.message];
      return jsonResponse({ error: known ?? "Не удалось перенести прогресс" }, known ? 400 : 500);
    }

    return jsonResponse({ transferred: data });
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: "Внутренняя ошибка сервера" }, 500);
  }
});
