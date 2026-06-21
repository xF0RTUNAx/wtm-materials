// ============================================================
//  api.js — чтение данных из Supabase + вызов Edge Functions.
// ============================================================

// ── Чтение из Supabase (GET) ────────────────────────────────

async function supabaseSelect(path) {
  const anonKey = String(CONFIG.SUPABASE_ANON_KEY).replace(/[^\x21-\x7E]/g, "");
  const res = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey:        anonKey,
      Authorization: "Bearer " + anonKey,
    },
  });
  if (!res.ok) throw new Error("Ошибка чтения из базы (" + res.status + ")");
  return res.json();
}

// Профиль игрока по его id
async function fetchPlayerProfileById(playerId) {
  const rows = await supabaseSelect(
    `players?id=eq.${playerId}&select=*`
  );
  return rows[0] || null;
}

// База игрока (завод, детали, лаборатория)
async function fetchPlayerBase(playerUuid) {
  const rows = await supabaseSelect(
    `bases?player_id=eq.${playerUuid}&select=*`
  );
  return rows[0] || null;
}

// Войска игрока — массив {troop_type, level}
async function fetchPlayerTroops(playerUuid) {
  const rows = await supabaseSelect(
    `troops?player_id=eq.${playerUuid}&select=troop_type,level&order=created_at.asc`
  );
  return rows || [];
}

// ── Вызов Edge Functions (POST) ─────────────────────────────

async function callEdgeFunction(url, body) {
  const anonKey = String(CONFIG.SUPABASE_ANON_KEY).replace(/[^\x21-\x7E]/g, "");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization:  "Bearer " + anonKey,
      apikey:         anonKey,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error || "Ошибка сервера");
  }
  return data;
}

// Этап 1 — завод
async function collectResources(playerId) {
  return callEdgeFunction(CONFIG.COLLECT_URL, { player_id: playerId });
}

async function upgradeFactory(playerId) {
  return callEdgeFunction(CONFIG.UPGRADE_URL, { player_id: playerId });
}

// Этап 2 — лаборатория и войска
async function upgradeLab(playerId) {
  return callEdgeFunction(CONFIG.LAB_UPGRADE_URL, { player_id: playerId });
}

async function upgradeTroop(playerId, troopType) {
  return callEdgeFunction(CONFIG.TROOP_UPGRADE_URL, {
    player_id:  playerId,
    troop_type: troopType,
  });
}
