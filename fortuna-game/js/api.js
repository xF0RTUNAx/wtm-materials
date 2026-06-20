// ============================================================
//  api.js — чтение данных из Supabase + вызов Edge Functions.
//  Очки Фортуны (loot_points) не используются для логин-аккаунтов.
// ============================================================

// --- Чтение из Supabase (GET) ---

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

// --- Вызов Edge Functions (POST) ---

async function callEdgeFunction(url, body) {
  const anonKey = String(CONFIG.SUPABASE_ANON_KEY).replace(/[^\x21-\x7E]/g, "");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + anonKey,
      apikey: anonKey,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error || "Ошибка сервера");
  }
  return data;
}

// Собрать накопленные детали
async function collectResources(playerId) {
  return callEdgeFunction(CONFIG.COLLECT_URL, { player_id: playerId });
}

// Улучшить завод
async function upgradeFactory(playerId) {
  return callEdgeFunction(CONFIG.UPGRADE_URL, { player_id: playerId });
}
