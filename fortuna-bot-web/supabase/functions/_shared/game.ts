import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export async function hasItem(db: SupabaseClient, playerId: string, slug: string): Promise<boolean> {
  const { data } = await db
    .from("player_items")
    .select("item_slug")
    .eq("player_id", playerId)
    .eq("item_slug", slug)
    .maybeSingle();
  return !!data;
}

export async function ownedSlugs(db: SupabaseClient, playerId: string): Promise<Set<string>> {
  const { data } = await db
    .from("player_items")
    .select("item_slug")
    .eq("player_id", playerId);
  return new Set((data ?? []).map((r) => r.item_slug));
}

export function secondsLeft(lastTs: string | null, cooldownSeconds: number): number {
  if (!lastTs) return 0;
  const elapsed = (Date.now() - new Date(lastTs).getTime()) / 1000;
  return Math.max(0, Math.ceil(cooldownSeconds - elapsed));
}

export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Декаль подковы: аналог "0.1% на сообщение в чате" — вызывается после любого игрового
// действия. Проверка владения, ролл и начисление атомарны на стороне БД (apply_horseshoe_bonus).
export async function applyHorseshoe(db: SupabaseClient, playerId: string): Promise<boolean> {
  const { data, error } = await db.rpc("apply_horseshoe_bonus", { p_player_id: playerId });
  if (error) {
    console.error("apply_horseshoe_bonus failed", error);
    return false;
  }
  return !!data;
}

export async function touchLastSeen(db: SupabaseClient, playerId: string): Promise<void> {
  await db.from("players").update({ last_seen: new Date().toISOString() }).eq("id", playerId);
}

export async function isAdmin(db: SupabaseClient, playerId: string): Promise<boolean> {
  const { data } = await db.from("players").select("is_admin").eq("id", playerId).maybeSingle();
  return !!data?.is_admin;
}
