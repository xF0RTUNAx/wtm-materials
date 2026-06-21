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
  const rows = await supabaseSelect(`players?id=eq.${playerId}&select=*`);
  return rows[0] || null;
}

// База игрока (завод, детали, лаборатория, госпиталь, составы)
async function fetchPlayerBase(playerUuid) {
  const rows = await supabaseSelect(`bases?player_id=eq.${playerUuid}&select=*`);
  return rows[0] || null;
}

// Войска игрока — теперь включает vit и in_hospital_since
async function fetchPlayerTroops(playerUuid) {
  const rows = await supabaseSelect(
    `troops?player_id=eq.${playerUuid}&select=troop_type,level,vit,in_hospital_since&order=created_at.asc`
  );
  return rows || [];
}

// Нейросети игрока
async function fetchPlayerNeural(playerUuid) {
  const rows = await supabaseSelect(`neural_networks?player_id=eq.${playerUuid}&select=*`);
  return rows || [];
}

// История боёв игрока (атакующий или защитник), последние 20
async function fetchPlayerBattles(playerUuid) {
  const rows = await supabaseSelect(
    `battles?or=(attacker_id.eq.${playerUuid},defender_id.eq.${playerUuid})&order=created_at.desc&limit=20&select=*`
  );
  return rows || [];
}

// Уведомления игрока, последние 30
async function fetchPlayerNotifications(playerUuid) {
  const rows = await supabaseSelect(
    `notifications?player_id=eq.${playerUuid}&order=created_at.desc&limit=30&select=*`
  );
  return rows || [];
}

// Поиск соперников — другие игроки кроме себя
async function fetchOpponents(playerUuid) {
  const rows = await supabaseSelect(
    `players?id=neq.${playerUuid}&order=xp.desc&limit=50&select=id,login,xp`
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
  return callEdgeFunction(CONFIG.TROOP_UPGRADE_URL, { player_id: playerId, troop_type: troopType });
}

// Этап 3 — нейросети
async function startNeural(playerId, lineType) {
  return callEdgeFunction(CONFIG.NEURAL_START_URL, { player_id: playerId, line_type: lineType });
}
async function collectNeural(playerId, lineType) {
  return callEdgeFunction(CONFIG.NEURAL_COLLECT_URL, { player_id: playerId, line_type: lineType });
}
async function upgradeNeural(playerId, lineType) {
  return callEdgeFunction(CONFIG.NEURAL_UPGRADE_URL, { player_id: playerId, line_type: lineType });
}

// Этап 4 — битвы и госпиталь
async function saveLineup(playerId, lineupType, lineup) {
  return callEdgeFunction(CONFIG.SAVE_LINEUP_URL, {
    player_id: playerId, lineup_type: lineupType, lineup,
  });
}
async function sendToHospital(playerId, troopType) {
  return callEdgeFunction(CONFIG.SEND_HOSPITAL_URL, { player_id: playerId, troop_type: troopType });
}
async function collectHospital(playerId, troopType) {
  return callEdgeFunction(CONFIG.COLLECT_HOSPITAL_URL, { player_id: playerId, troop_type: troopType });
}
async function upgradeHospital(playerId) {
  return callEdgeFunction(CONFIG.UPGRADE_HOSPITAL_URL, { player_id: playerId });
}
async function resolveBattle(attackerId, defenderId) {
  return callEdgeFunction(CONFIG.RESOLVE_BATTLE_URL, {
    attacker_id: attackerId, defender_id: defenderId,
  });
}
async function markNotificationsRead(playerId) {
  return callEdgeFunction(CONFIG.MARK_NOTIF_URL, { player_id: playerId });
}
