// raid-attack — ECONOMY_CATALOG.md §6. КД: "Набор Олега" ×0.75, оборудование avtomat ×0.8,
// перемножаются последовательно. Урон: блупринт ×1.33 → лом ×1.1. Трофейные змб: 25% шанс
// бесплатной следующей атаки (не запускается повторно самой бесплатной атакой). Урон/КД
// обновляются атомарно в raid_apply_attack (защита от гонки на добивающем ударе).
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { hasItem, secondsLeft, randInt, applyHorseshoe, logFeedEvent } from "../_shared/game.ts";
import { RAID_PARAMS } from "../_shared/raids.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { player_id } = await req.json();
    if (typeof player_id !== "string") return jsonResponse({ error: "player_id обязателен" }, 400);

    const db = supabaseAdmin();
    const { data: raid } = await db.from("raids").select("id, rtype").eq("status", "active").maybeSingle();
    if (!raid) return jsonResponse({ error: "Сейчас нет активного рейда" }, 404);

    const { data: participant } = await db
      .from("raid_participants")
      .select("has_weapon, free_attack, last_attack")
      .eq("raid_id", raid.id)
      .eq("player_id", player_id)
      .maybeSingle();
    if (!participant?.has_weapon) {
      return jsonResponse({ error: "Сначала купите оружие" }, 403);
    }

    const isFree = !!participant.free_attack;
    const p = RAID_PARAMS[raid.rtype];

    if (!isFree) {
      let cd = p.attackCdSec;
      if (await hasItem(db, player_id, "oleg_set")) cd = Math.floor(cd * 0.75);
      const { data: econEquip } = await db
        .from("player_economy")
        .select("active_equipment")
        .eq("player_id", player_id)
        .maybeSingle();
      if (econEquip?.active_equipment === "avtomat") cd = Math.floor(cd * 0.8);

      const left = secondsLeft(participant.last_attack, cd);
      if (left > 0) return jsonResponse({ error: "Оружие перезаряжается", seconds_left: left }, 429);
    }

    let dmg = p.dmgMode === "choice"
      ? p.dmgChoices![Math.floor(Math.random() * p.dmgChoices!.length)]
      : randInt(p.dmgMin!, p.dmgMax!);

    if (await hasItem(db, player_id, "oplot_blueprints")) dmg = Math.round(dmg * 1.33);
    const { data: econLom } = await db
      .from("player_economy")
      .select("active_equipment")
      .eq("player_id", player_id)
      .maybeSingle();
    if (econLom?.active_equipment === "lom") dmg = Math.floor(dmg * 1.1);

    const nextFree = !isFree && (await hasItem(db, player_id, "trophy_zmb")) && Math.random() < 0.25;

    const { data: applyRows, error: applyErr } = await db.rpc("raid_apply_attack", {
      p_raid_id: raid.id,
      p_player_id: player_id,
      p_damage: dmg,
      p_new_free_attack: nextFree,
    });
    if (applyErr) {
      if (applyErr.message?.includes("RAID_NOT_ACTIVE")) {
        return jsonResponse({ error: "Рейд уже закончился" }, 409);
      }
      throw applyErr;
    }
    const { actual_damage, new_hp, max_hp } = applyRows![0];

    let victory = null;
    if (new_hp <= 0) {
      const { data: fin, error: finErr } = await db.rpc("finish_raid", {
        p_raid_id: raid.id,
        p_reason: "hp_depleted",
      });
      if (finErr) throw finErr;
      victory = fin;
    }

    const horseshoeHit = await applyHorseshoe(db, player_id);
    await logFeedEvent(db, player_id, "raid_action", { action: "attack", damage: actual_damage, rtype: raid.rtype });

    return jsonResponse({
      damage_dealt: actual_damage,
      new_hp,
      max_hp,
      free_attack_charged: nextFree,
      finished: victory,
      horseshoe_bonus: horseshoeHit,
    });
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: "Внутренняя ошибка сервера" }, 500);
  }
});
