// ============================================================
//  api.js — чтение данных из Supabase (только чтение, разрешено RLS).
//  Очки Фортуны (loot_points) больше НЕ используются для логин-аккаунтов:
//  они привязаны к Telegram-боту, а вход теперь без Telegram.
// ============================================================

async function supabaseSelect(path) {
  const anonKey = String(CONFIG.SUPABASE_ANON_KEY).replace(/[^\x21-\x7E]/g, "");
  const res = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: anonKey, Authorization: "Bearer " + anonKey },
  });
  if (!res.ok) throw new Error("Ошибка чтения из базы (" + res.status + ")");
  return res.json();
}

// Профиль игрока по его id
async function fetchPlayerProfileById(playerId) {
  const rows = await supabaseSelect(`players?id=eq.${playerId}&select=*`);
  return rows[0] || null;
}

// База игрока (завод, детали)
async function fetchPlayerBase(playerUuid) {
  const rows = await supabaseSelect(`bases?player_id=eq.${playerUuid}&select=*`);
  return rows[0] || null;
}
