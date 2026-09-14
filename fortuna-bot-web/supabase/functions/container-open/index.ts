// container-open — ECONOMY_CATALOG.md §2. Батч 1/5/10 контейнеров за раз, ключи списываются
// сразу. Дубликат уникального предмета (уже есть у игрока, включая уже выпавший в этом же
// батче) конвертируется в монеты по CONTAINER_DUP_COMP.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { ownedSlugs, applyHorseshoe } from "../_shared/game.ts";
import { CONTAINER_TIERS, CONTAINER_DUP_COMP, rollContainer } from "../_shared/containers.ts";

const ALLOWED_COUNTS = [1, 5, 10];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { player_id, tier, count } = await req.json();
    if (typeof player_id !== "string" || !CONTAINER_TIERS[tier] || !ALLOWED_COUNTS.includes(count)) {
      return jsonResponse({ error: "Некорректные параметры" }, 400);
    }

    const db = supabaseAdmin();
    const { data: econ, error: econErr } = await db
      .from("player_economy")
      .select("keys_current, keys_lifetime, loot_points, tu4_points, fireball_kills, radiofugas_kills, details")
      .eq("player_id", player_id)
      .maybeSingle();
    if (econErr) throw econErr;
    if (!econ) return jsonResponse({ error: "Игрок не найден" }, 404);

    const price = CONTAINER_TIERS[tier].priceKeys * count;
    if (econ.keys_current < price) {
      return jsonResponse({ error: `Недостаточно ключей: нужно ${price}` }, 402);
    }

    const owned = await ownedSlugs(db, player_id);
    const delta = { coins: 0, tu4: 0, fireball: 0, radiofugas: 0, keys: 0, details: 0 };
    const newItems: string[] = [];
    const rolls: Array<{ itemSlug: string | null; dupCoins: number; coins: number; tu4: number; fireball: number; radiofugas: number; keys: number; details: number }> = [];

    for (let i = 0; i < count; i++) {
      const r = rollContainer(tier);
      delta.coins += r.coins;
      delta.tu4 += r.tu4;
      delta.fireball += r.fireball;
      delta.radiofugas += r.radiofugas;
      delta.keys += r.keys;
      delta.details += r.details;

      let dupCoins = 0;
      if (r.itemSlug) {
        const alreadyHave = owned.has(r.itemSlug) || newItems.includes(r.itemSlug);
        if (alreadyHave) {
          dupCoins = CONTAINER_DUP_COMP[tier];
          delta.coins += dupCoins;
        } else {
          newItems.push(r.itemSlug);
        }
      }
      rolls.push({ ...r, dupCoins });
    }

    const { error: updErr } = await db
      .from("player_economy")
      .update({
        keys_current: econ.keys_current - price + delta.keys,
        keys_lifetime: econ.keys_lifetime + delta.keys,
        loot_points: econ.loot_points + delta.coins,
        tu4_points: econ.tu4_points + delta.tu4,
        fireball_kills: econ.fireball_kills + delta.fireball,
        radiofugas_kills: econ.radiofugas_kills + delta.radiofugas,
        details: econ.details + delta.details,
        updated_at: new Date().toISOString(),
      })
      .eq("player_id", player_id);
    if (updErr) throw updErr;

    if (newItems.length > 0) {
      const { error: insErr } = await db
        .from("player_items")
        .insert(newItems.map((item_slug) => ({ player_id, item_slug })));
      if (insErr) throw insErr;
    }

    const horseshoeHit = await applyHorseshoe(db, player_id);

    return jsonResponse({ rolls, totals: delta, new_items: newItems, horseshoe_bonus: horseshoeHit });
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: "Внутренняя ошибка сервера" }, 500);
  }
});
