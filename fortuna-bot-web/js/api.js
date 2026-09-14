// api.js — низкоуровневый вызов Edge Functions. По образцу fortuna-game/js/auth.js:
// anon-ключ обязателен в двух заголовках, тело — JSON, ошибки — {error: "..."}.
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
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "Ошибка запроса");
    err.status = res.status;
    err.seconds_left = data.seconds_left;
    throw err;
  }
  return data;
}

async function fetchTable(table, query = "select=*") {
  const anonKey = String(CONFIG.SUPABASE_ANON_KEY).replace(/[^\x21-\x7E]/g, "");
  const res = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: { Authorization: "Bearer " + anonKey, apikey: anonKey },
  });
  if (!res.ok) throw new Error(`Не удалось загрузить ${table}`);
  return res.json();
}

function shopBuy(playerId, itemSlug) {
  return callEdgeFunction(CONFIG.SHOP_BUY_URL, { player_id: playerId, item_slug: itemSlug });
}

function containerOpen(playerId, tier, count) {
  return callEdgeFunction(CONFIG.CONTAINER_OPEN_URL, { player_id: playerId, tier, count });
}

function equipmentCraft(playerId, equipmentSlug) {
  return callEdgeFunction(CONFIG.EQUIPMENT_CRAFT_URL, { player_id: playerId, equipment_slug: equipmentSlug });
}

function equipmentEquip(playerId, equipmentSlug) {
  return callEdgeFunction(CONFIG.EQUIPMENT_EQUIP_URL, { player_id: playerId, equipment_slug: equipmentSlug });
}

function getRaidStatus() {
  return callEdgeFunction(CONFIG.RAID_STATUS_URL, {});
}
function raidBuyWeapon(playerId) {
  return callEdgeFunction(CONFIG.RAID_BUY_WEAPON_URL, { player_id: playerId });
}
function raidAttack(playerId) {
  return callEdgeFunction(CONFIG.RAID_ATTACK_URL, { player_id: playerId });
}
function raidStart(playerId, rtype) {
  return callEdgeFunction(CONFIG.RAID_START_URL, { player_id: playerId, rtype });
}
function raidStop(playerId) {
  return callEdgeFunction(CONFIG.RAID_STOP_URL, { player_id: playerId });
}

function getPlayerState(playerId) {
  return callEdgeFunction(CONFIG.PLAYER_STATE_URL, { player_id: playerId });
}

function claimMigrationCode(playerId, code) {
  return callEdgeFunction(CONFIG.CLAIM_CODE_URL, { player_id: playerId, code });
}

function farmFireball(playerId) {
  return callEdgeFunction(CONFIG.FARM_FIREBALL_URL, { player_id: playerId });
}
function farmRadiofugas(playerId) {
  return callEdgeFunction(CONFIG.FARM_RADIOFUGAS_URL, { player_id: playerId });
}
function farmLoot(playerId) {
  return callEdgeFunction(CONFIG.FARM_LOOT_URL, { player_id: playerId });
}
function farmMeladze(playerId) {
  return callEdgeFunction(CONFIG.FARM_MELADZE_URL, { player_id: playerId });
}
