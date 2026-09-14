// get-player-profile — карточка профиля другого игрока (клик по нику в ленте "Онлайн").
// players/player_economy не открыты anon напрямую, поэтому только через service_role,
// собирая экономику, кулдауны фарма, агрегированную статистику по рейдам и инвентарь.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { hasItem, secondsLeft } from "../_shared/game.ts";
import { RAID_PARAMS } from "../_shared/raids.ts";

const FARM_COOLDOWNS: Record<string, { base: number; reduced: number; reducerSlug: string; reducerName: string }> = {
  loot: { base: 8 * 3600, reduced: 7 * 3600, reducerSlug: "voydom_case", reducerName: "Кейс открытый Войдом" },
  fireball: { base: 24 * 3600, reduced: 18 * 3600, reducerSlug: "junkers_bedding", reducerName: "Юнкерс Подстилки" },
  radiofugas: { base: 24 * 3600, reduced: 18 * 3600, reducerSlug: "junkers_bedding", reducerName: "Юнкерс Подстилки" },
  meladze: { base: 24 * 3600, reduced: 12 * 3600, reducerSlug: "urvv_fragment", reducerName: "Фрагмент раннего УРВВ" },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { login } = await req.json();
    if (typeof login !== "string" || !login.trim()) {
      return jsonResponse({ error: "login обязателен" }, 400);
    }

    const db = supabaseAdmin();
    const { data: player, error: playerErr } = await db
      .from("players")
      .select("id, login, last_seen")
      .ilike("login", login.trim())
      .maybeSingle();
    if (playerErr) throw playerErr;
    if (!player) return jsonResponse({ error: "Игрок не найден" }, 404);

    const { data: econ } = await db
      .from("player_economy")
      .select("*")
      .eq("player_id", player.id)
      .maybeSingle();
    if (!econ) return jsonResponse({ error: "Игрок не найден" }, 404);

    const [{ data: ownedItems }, { data: ownedEquipment }, { data: equipmentCatalog }, { data: legacy }] =
      await Promise.all([
        db.from("player_items").select("item_slug, shop_items(name, category)").eq("player_id", player.id),
        db.from("player_equipment").select("equipment_slug, equipment_items(name)").eq("player_id", player.id),
        db.from("equipment_items").select("slug, name"),
        db.from("legacy_progress").select("snapshot").eq("claimed_by_player_id", player.id).maybeSingle(),
      ]);

    const equipmentNameBySlug = Object.fromEntries((equipmentCatalog ?? []).map((e) => [e.slug, e.name]));
    const legendaryItems = (ownedItems ?? [])
      .filter((i: any) => i.shop_items?.category === "legendary")
      .map((i: any) => ({ slug: i.item_slug, name: i.shop_items?.name ?? i.item_slug }));
    const regularItems = (ownedItems ?? [])
      .filter((i: any) => i.shop_items?.category === "shop")
      .map((i: any) => ({ slug: i.item_slug, name: i.shop_items?.name ?? i.item_slug }));

    // ── Кулдауны фарма ──
    const [hasVoydom, hasJunkers, hasFragment, hasTicket] = await Promise.all([
      hasItem(db, player.id, "voydom_case"),
      hasItem(db, player.id, "junkers_bedding"),
      hasItem(db, player.id, "urvv_fragment"),
      hasItem(db, player.id, "meladze_ticket"),
    ]);
    const reducerOwned: Record<string, boolean> = {
      loot: hasVoydom,
      fireball: hasJunkers,
      radiofugas: hasJunkers,
      meladze: hasFragment,
    };
    const lastFarmTs: Record<string, string | null> = {
      loot: econ.last_loot_farm,
      fireball: econ.last_fireball_farm,
      radiofugas: econ.last_radiofugas_farm,
      meladze: econ.last_meladze_farm,
    };
    const cooldowns: Record<string, unknown> = {};
    for (const key of ["loot", "fireball", "radiofugas", "meladze"]) {
      if (key === "meladze" && !hasTicket) {
        cooldowns[key] = { unlocked: false };
        continue;
      }
      const cfg = FARM_COOLDOWNS[key];
      const cdSeconds = reducerOwned[key] ? cfg.reduced : cfg.base;
      const left = secondsLeft(lastFarmTs[key], cdSeconds);
      cooldowns[key] = {
        unlocked: true,
        available: left <= 0,
        seconds_left: left,
        cd_hours: cdSeconds / 3600,
        reduced_by: reducerOwned[key] ? cfg.reducerName : null,
      };
    }

    // ── Статистика по рейдам ──
    const [{ data: allRaids }, { data: myParticipation }] = await Promise.all([
      db.from("raids").select("id, rtype, max_hp, status, started_at, ends_at, finished_at").order("started_at", { ascending: false }),
      db.from("raid_participants").select("raid_id, damage_dealt, attack_count").eq("player_id", player.id),
    ]);

    const raidsById = Object.fromEntries((allRaids ?? []).map((r) => [r.id, r]));
    const totalRaids = (allRaids ?? []).length;
    const participated = (myParticipation ?? []).filter((p) => p.damage_dealt > 0 || p.attack_count > 0);

    let raidStats: unknown = null;
    if (totalRaids > 0) {
      let totalAttacks = 0;
      let totalMaxAttacks = 0;
      let sumDamageShare = 0;
      let best: { damage: number; hpSharePct: number; rank: number; rtype: string } | null = null;

      for (const p of participated) {
        const raid = raidsById[p.raid_id];
        if (!raid) continue;
        const params = RAID_PARAMS[raid.rtype];
        const endTs = raid.finished_at ? new Date(raid.finished_at).getTime() : Date.now();
        const durationSec = Math.max(0, (endTs - new Date(raid.started_at).getTime()) / 1000);
        const maxAttacks = params ? Math.max(1, Math.floor(durationSec / params.attackCdSec)) : 1;
        totalAttacks += p.attack_count;
        totalMaxAttacks += maxAttacks;
        sumDamageShare += (p.damage_dealt / raid.max_hp) * 100;

        if (!best || p.damage_dealt > best.damage) {
          best = { damage: p.damage_dealt, hpSharePct: (p.damage_dealt / raid.max_hp) * 100, rank: 0, rtype: raid.rtype };
        }
      }

      if (best) {
        const bestParticipation = participated.reduce((a, b) => (b.damage_dealt > a.damage_dealt ? b : a));
        const { data: rivalRows } = await db
          .from("raid_participants")
          .select("player_id, damage_dealt")
          .eq("raid_id", bestParticipation.raid_id)
          .order("damage_dealt", { ascending: false });
        const rank = (rivalRows ?? []).findIndex((r) => r.player_id === player.id) + 1;
        best.rank = rank || 1;
      }

      const lastRaid = allRaids![0];
      const lastParticipation = participated.find((p) => p.raid_id === lastRaid.id);

      raidStats = {
        total_raids: totalRaids,
        participated: participated.length,
        participation_rate: participated.length / totalRaids,
        avg_damage_share_pct: participated.length ? sumDamageShare / participated.length : 0,
        attack_frequency: totalMaxAttacks ? totalAttacks / totalMaxAttacks : 0,
        total_attacks: totalAttacks,
        best_raid: best,
        last_raid: {
          participated: !!lastParticipation,
          rtype: lastRaid.rtype,
          damage: lastParticipation?.damage_dealt ?? 0,
        },
      };
    }

    const { data: activeRaid } = await db
      .from("raids")
      .select("rtype")
      .eq("status", "active")
      .maybeSingle();

    const ownedEquipCount = (ownedEquipment ?? []).length;
    const legacySnapshot = legacy?.snapshot as Record<string, unknown> | undefined;

    return jsonResponse({
      login: player.login,
      last_seen: player.last_seen,
      economy: {
        loot_points: econ.loot_points,
        tu4_points: econ.tu4_points,
        fireball_kills: econ.fireball_kills,
        radiofugas_kills: econ.radiofugas_kills,
        keys_current: econ.keys_current,
        keys_lifetime: econ.keys_lifetime,
        details: econ.details,
        active_equipment: econ.active_equipment
          ? { slug: econ.active_equipment, name: equipmentNameBySlug[econ.active_equipment] ?? econ.active_equipment }
          : null,
        equipment_owned_count: ownedEquipCount,
        equipment_available_count: Math.max(0, ownedEquipCount - (econ.active_equipment ? 1 : 0)),
      },
      legacy: legacySnapshot
        ? { total_warns: legacySnapshot.total_warns ?? 0, total_mutes: legacySnapshot.total_mutes ?? 0 }
        : null,
      cooldowns,
      raid_stats: raidStats,
      active_raid: activeRaid ? { rtype: activeRaid.rtype } : null,
      legendary_items: legendaryItems,
      regular_items: regularItems,
    });
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: "Внутренняя ошибка сервера" }, 500);
  }
});
