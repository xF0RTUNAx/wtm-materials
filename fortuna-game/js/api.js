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

// Профиль игрока по его id (без password_hash — он скрыт на уровне БД)
async function fetchPlayerProfileById(playerId) {
  const rows = await supabaseSelect(
    `players?id=eq.${playerId}&select=id,telegram_id,username,full_name,avatar_url,xp,clan_id,battle_pass_level,last_online,created_at,display_name,display_avatar_url,login,avatar_unlocked`
  );
  return rows[0] || null;
}

// База игрока (завод, детали, лаборатория, госпиталь, составы, бусты)
async function fetchPlayerBase(playerUuid) {
  const rows = await supabaseSelect(`bases?player_id=eq.${playerUuid}&select=*`);
  return rows[0] || null;
}

// Войска игрока
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
    `players?id=neq.${playerUuid}&order=xp.desc&limit=50&select=id,login,xp,avatar_url`
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

// Этап 5 — кланы
async function createClan(playerId, name, tag, description) {
  return callEdgeFunction(CONFIG.CREATE_CLAN_URL, {
    player_id: playerId, name, tag, description,
  });
}
async function applyClan(playerId, clanId) {
  return callEdgeFunction(CONFIG.APPLY_CLAN_URL, {
    player_id: playerId, clan_id: clanId,
  });
}
async function respondApplication(playerId, applicationId, decision) {
  return callEdgeFunction(CONFIG.RESPOND_APPLICATION_URL, {
    player_id: playerId, application_id: applicationId, decision,
  });
}
async function leaveClan(playerId) {
  return callEdgeFunction(CONFIG.LEAVE_CLAN_URL, { player_id: playerId });
}
async function kickMember(playerId, targetPlayerId) {
  return callEdgeFunction(CONFIG.KICK_MEMBER_URL, {
    player_id: playerId, target_player_id: targetPlayerId,
  });
}
async function setClanRole(playerId, targetPlayerId, newRole) {
  return callEdgeFunction(CONFIG.SET_CLAN_ROLE_URL, {
    player_id: playerId, target_player_id: targetPlayerId, new_role: newRole,
  });
}
async function claimClanReward(playerId) {
  return callEdgeFunction(CONFIG.CLAIM_CLAN_REWARD_URL, { player_id: playerId });
}
async function sendMessage(playerId, channel, content) {
  return callEdgeFunction(CONFIG.SEND_MESSAGE_URL, {
    player_id: playerId, channel, content,
  });
}

// Чтение данных кланов из Supabase (GET)
async function fetchAllClans() {
  const rows = await supabaseSelect("clans?select=*&order=member_count.desc");
  return rows || [];
}
async function fetchClanById(clanId) {
  const rows = await supabaseSelect(`clans?id=eq.${clanId}&select=*`);
  return rows[0] || null;
}
async function fetchClanMembers(clanId) {
  const rows = await supabaseSelect(
    `clan_members?clan_id=eq.${clanId}&select=player_id,role,joined_at&order=joined_at.asc`
  );
  return rows || [];
}
async function fetchClanApplications(clanId) {
  const rows = await supabaseSelect(
    `clan_applications?clan_id=eq.${clanId}&status=eq.pending&select=*&order=created_at.asc`
  );
  return rows || [];
}
async function fetchPlayerApplication(playerId) {
  const rows = await supabaseSelect(
    `clan_applications?player_id=eq.${playerId}&status=eq.pending&select=*&order=created_at.desc&limit=1`
  );
  return rows[0] || null;
}
async function fetchClanRewardClaimed(clanId, playerId, weekStart) {
  const rows = await supabaseSelect(
    `clan_rewards?clan_id=eq.${clanId}&player_id=eq.${playerId}&week_start=eq.${weekStart}&select=id`
  );
  return rows.length > 0;
}
async function fetchMessages(channel, limit) {
  limit = limit || 50;
  const rows = await supabaseSelect(
    `messages?channel=eq.${channel}&order=created_at.desc&limit=${limit}&select=*`
  );
  return (rows || []).reverse();
}

// Этап 6 — карта войны
async function fetchActiveFront() {
  var rows = await supabaseSelect("fronts?is_active=eq.true&order=created_at.desc&limit=1&select=*");
  return rows[0] || null;
}
async function fetchTerritories(frontId) {
  var rows = await supabaseSelect(
    "territories?front_id=eq." + frontId + "&select=*&order=row_idx.asc,col_idx.asc"
  );
  return rows || [];
}
async function fetchClansByIds(clanIds) {
  if (!clanIds || !clanIds.length) return [];
  var filter = clanIds.map(function(id) { return "id.eq." + id; }).join(",");
  var rows = await supabaseSelect("clans?or=(" + filter + ")&select=id,name,tag");
  return rows || [];
}
async function captureTerritory(playerId, rowIdx, colIdx) {
  return callEdgeFunction(CONFIG.CAPTURE_TERRITORY_URL, {
    player_id: playerId, row_idx: rowIdx, col_idx: colIdx,
  });
}
async function collectTax(playerId) {
  return callEdgeFunction(CONFIG.COLLECT_TAX_URL, { player_id: playerId });
}
async function fetchCoopRequests(frontId, clanId) {
  var rows = await supabaseSelect(
    "coop_requests?front_id=eq." + frontId
    + "&clan_id=eq." + clanId
    + "&status=eq.pending&select=*"
  );
  return rows || [];
}
async function initiateCoop(playerId, rowIdx, colIdx) {
  return callEdgeFunction(CONFIG.INITIATE_COOP_URL, {
    player_id: playerId, row_idx: rowIdx, col_idx: colIdx,
  });
}
async function joinCoop(playerId, rowIdx, colIdx, action) {
  return callEdgeFunction(CONFIG.JOIN_COOP_URL, {
    player_id: playerId, row_idx: rowIdx, col_idx: colIdx, action: action,
  });
}

// ── Боевой пропуск ───────────────────────────────────────────

// Инициализация пропуска (создаёт snapshot XP при первом входе в сезон)
async function initBp(playerId) {
  return callEdgeFunction(CONFIG.INIT_BP_URL, { player_id: playerId });
}

// Забрать награду за уровень
async function claimBpReward(playerId, seasonId, level) {
  return callEdgeFunction(CONFIG.CLAIM_BP_REWARD_URL, {
    player_id: playerId, season_id: seasonId, level,
  });
}

// Надеть аватарку
async function equipAvatar(playerId, avatarKey) {
  return callEdgeFunction(CONFIG.EQUIP_AVATAR_URL, {
    player_id: playerId, avatar_key: avatarKey,
  });
}

// Чтение данных пропуска из Supabase (GET)
async function fetchActiveBpSeason() {
  var rows = await supabaseSelect(
    "bp_seasons?is_active=eq.true&order=created_at.desc&limit=1&select=*"
  );
  return rows[0] || null;
}

async function fetchPlayerBp(playerId, seasonId) {
  var rows = await supabaseSelect(
    "player_battle_pass?player_id=eq." + playerId
    + "&season_id=eq." + seasonId
    + "&select=*"
  );
  return rows[0] || null;
}

async function fetchBpRewards(seasonId) {
  var rows = await supabaseSelect(
    "bp_rewards?season_id=eq." + seasonId + "&order=level.asc&select=*"
  );
  return rows || [];
}

// ── Этап 7 — Аркада (мини-игры) ─────────────────────────────

// Начислить награду за победу в мини-игре (1 раз в сутки UTC per game)
async function claimMinigameReward(playerId, gameId) {
  return callEdgeFunction(CONFIG.CLAIM_MG_REWARD_URL, {
    player_id: playerId,
    game_id: gameId,
  });
}

// Все бои игрока (для расчёта винрейта в профиле)
async function fetchPlayerBattleCount(playerUuid) {
  const rows = await supabaseSelect(
    `battles?or=(attacker_id.eq.${playerUuid},defender_id.eq.${playerUuid})&select=id,attacker_id,result`
  );
  return rows || [];
}

// ── Онлайн-статус ────────────────────────────────────────────

// Обновляет last_online игрока (вызывается при входе и каждые 3 мин)
async function touchOnline(playerId) {
  return callEdgeFunction(CONFIG.TOUCH_ONLINE_URL, { player_id: playerId });
}
