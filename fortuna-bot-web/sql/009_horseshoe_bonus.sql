-- Декаль подковы: в боте — 0.1% на любое сообщение в чате. На сайте аналог "сообщения" —
-- собственное игровое действие владельца (вызывается из фарм/магазин/контейнер функций).
create or replace function apply_horseshoe_bonus(p_player_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_login text;
begin
  if not exists(select 1 from player_items where player_id = p_player_id and item_slug = 'horseshoe_decal') then
    return false;
  end if;
  if random() >= 0.001 then
    return false;
  end if;

  update player_economy set loot_points = loot_points + 33333, updated_at = now() where player_id = p_player_id;
  select login into v_login from players where id = p_player_id;
  insert into activity_feed (event_type, target_player_id, detail)
    values ('horseshoe', p_player_id, jsonb_build_object('login', v_login, 'amount', 33333));
  return true;
end;
$$;

revoke all on function apply_horseshoe_bonus(uuid) from public;
grant execute on function apply_horseshoe_bonus(uuid) to service_role;
