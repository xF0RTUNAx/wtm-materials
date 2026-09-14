-- Атомарное применение атаки: лочит raid (защита от гонки на добивающем ударе),
-- клэмпит урон остатком HP, обновляет и рейд, и участника одной транзакцией.
create or replace function raid_apply_attack(
  p_raid_id bigint, p_player_id uuid, p_damage bigint, p_new_free_attack boolean
)
returns table(actual_damage bigint, new_hp bigint, max_hp bigint)
language plpgsql security definer set search_path = public as $$
declare
  v_hp bigint;
  v_max_hp bigint;
  v_actual bigint;
begin
  select r.hp, r.max_hp into v_hp, v_max_hp from raids r where r.id = p_raid_id and r.status = 'active' for update;
  if not found then
    raise exception 'RAID_NOT_ACTIVE';
  end if;

  v_actual := least(p_damage, v_hp);
  update raids set hp = v_hp - v_actual where raids.id = p_raid_id;

  update raid_participants set
    damage_dealt = damage_dealt + v_actual,
    attack_count = attack_count + 1,
    last_attack = now(),
    free_attack = p_new_free_attack
  where raid_id = p_raid_id and player_id = p_player_id;

  return query select v_actual, (v_hp - v_actual), v_max_hp;
end;
$$;

revoke all on function raid_apply_attack(bigint, uuid, bigint, boolean) from public;
grant execute on function raid_apply_attack(bigint, uuid, bigint, boolean) to service_role;
