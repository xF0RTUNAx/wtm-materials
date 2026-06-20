// ============================================================
//  api.js — запросы к данным
//   - Профиль и база читаются из Supabase напрямую (только чтение,
//     это разрешено RLS-политикой public_read).
//   - Баланс очков Фортуны берётся из моста (он читает базу бота).
//  Любые ЗАПИСИ (тратить очки, менять ресурсы) пойдут позже через
//  Edge Functions — фронтенд сам ничего не пишет.
// ============================================================

// --- Вспомогательный запрос к таблицам Supabase (чтение) ---
async function supabaseSelect(path) {
  const res = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: CONFIG.SUPABASE_ANON_KEY,
      Authorization: "Bearer " + CONFIG.SUPABASE_ANON_KEY,
    },
  });
  if (!res.ok) throw new Error("Ошибка чтения из базы (" + res.status + ")");
  return res.json();
}

// --- Профиль игрока из таблицы players ---
async function fetchPlayerProfile(telegramId) {
  const rows = await supabaseSelect(
    `players?telegram_id=eq.${telegramId}&select=*`
  );
  return rows[0] || null;
}

// --- База игрока (завод, детали) из таблицы bases ---
async function fetchPlayerBase(playerUuid) {
  const rows = await supabaseSelect(
    `bases?player_id=eq.${playerUuid}&select=*`
  );
  return rows[0] || null;
}

// --- Баланс Очков Фортуны из моста (мост читает базу бота) ---
async function fetchLootPoints(telegramId) {
  try {
    const res = await fetch(`${CONFIG.BRIDGE_URL}/balance/${telegramId}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.loot_points;
  } catch (_) {
    return null; // мост недоступен — покажем прочерк, не ломаем экран
  }
}
