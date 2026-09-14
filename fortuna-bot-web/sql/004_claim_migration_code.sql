-- Атомарный перенос прогресса по промокоду — одна транзакция, чтобы не было
-- ситуации "код помечен использованным, а деньги не начислились" или наоборот.
create or replace function claim_migration_code(p_player_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code_row migration_codes%rowtype;
  v_legacy legacy_progress%rowtype;
  v_snapshot jsonb;
  v_slug text;
begin
  select * into v_code_row from migration_codes
    where code = p_code
    for update;

  if not found then
    raise exception 'CODE_NOT_FOUND';
  end if;
  if v_code_row.used then
    raise exception 'CODE_ALREADY_USED';
  end if;
  if v_code_row.expires_at <= now() then
    raise exception 'CODE_EXPIRED';
  end if;

  select * into v_legacy from legacy_progress
    where telegram_user_id = v_code_row.telegram_user_id
    for update;

  if not found then
    raise exception 'LEGACY_PROGRESS_NOT_FOUND';
  end if;
  if v_legacy.claimed then
    raise exception 'LEGACY_PROGRESS_ALREADY_CLAIMED';
  end if;

  if not exists (select 1 from players where id = p_player_id) then
    raise exception 'PLAYER_NOT_FOUND';
  end if;
  if exists (select 1 from migration_codes
             where used_by_player_id = p_player_id) then
    raise exception 'PLAYER_ALREADY_CLAIMED_A_CODE';
  end if;

  v_snapshot := v_legacy.snapshot;

  update player_economy set
    loot_points       = coalesce((v_snapshot->>'loot_points')::bigint, 0),
    tu4_points        = coalesce((v_snapshot->>'tu4_points')::bigint, 0),
    fireball_kills    = coalesce((v_snapshot->>'fireball_kills')::bigint, 0),
    radiofugas_kills  = coalesce((v_snapshot->>'radiofugas_kills')::bigint, 0),
    keys_current      = coalesce((v_snapshot->>'keys_current')::bigint, 0),
    keys_lifetime     = coalesce((v_snapshot->>'keys_lifetime')::bigint, 0),
    details           = coalesce((v_snapshot->>'details')::bigint, 0),
    active_equipment  = nullif(v_snapshot->>'equipment_active', ''),
    updated_at        = now()
  where player_id = p_player_id;

  for v_slug in select jsonb_array_elements_text(coalesce(v_snapshot->'items', '[]'::jsonb))
  loop
    insert into player_items (player_id, item_slug)
      values (p_player_id, v_slug)
      on conflict do nothing;
  end loop;

  for v_slug in select jsonb_array_elements_text(coalesce(v_snapshot->'equipment_owned', '[]'::jsonb))
  loop
    insert into player_equipment (player_id, equipment_slug)
      values (p_player_id, v_slug)
      on conflict do nothing;
  end loop;

  update migration_codes set
    used = true, used_by_player_id = p_player_id, used_at = now()
    where code = p_code;

  update legacy_progress set
    claimed = true, claimed_by_player_id = p_player_id, claimed_at = now()
    where telegram_user_id = v_code_row.telegram_user_id;

  return jsonb_build_object(
    'loot_points', v_snapshot->>'loot_points',
    'keys_current', v_snapshot->>'keys_current',
    'details', v_snapshot->>'details',
    'items_count', jsonb_array_length(coalesce(v_snapshot->'items', '[]'::jsonb))
  );
end;
$$;

revoke all on function claim_migration_code(uuid, text) from public;
grant execute on function claim_migration_code(uuid, text) to service_role;
