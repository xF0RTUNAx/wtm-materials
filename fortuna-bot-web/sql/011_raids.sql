-- Админ-флаг: запуск/остановка рейдов вручную, как /startraid у владельца бота.
alter table players add column is_admin boolean not null default false;

-- ── Атомарная раздача наград за рейд — ECONOMY_CATALOG.md §6 ──
-- p_reason: 'hp_depleted' (взяли босса) | 'timeout' (время вышло) | 'stopped' (остановлен админом).
-- Для ca тип timeout использует ТУ ЖЕ формулу, что и победа (см. каталог) — остальные типы
-- при timeout/stopped наград не дают вообще.
create or replace function finish_raid(p_raid_id bigint, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_raid raids%rowtype;
  v_total_dmg bigint;
  v_give_rewards boolean := false;
  v_result text;
  v_row record;
  v_rank int;
  v_coins bigint;
  v_keys bigint;
  v_details bigint;
  v_has_maksym boolean;
  v_summary jsonb := '[]'::jsonb;
begin
  select * into v_raid from raids where id = p_raid_id and status = 'active' for update;
  if not found then
    return jsonb_build_object('error', 'raid not active');
  end if;

  if p_reason = 'stopped' then
    v_result := 'stopped';
  elsif v_raid.rtype = 'ca' then
    v_result := 'victory'; -- ca: hp_depleted и timeout оба считаются победой с одной формулой
    v_give_rewards := true;
  elsif p_reason = 'hp_depleted' then
    v_result := 'victory';
    v_give_rewards := true;
  else
    v_result := 'defeat'; -- timeout для normal/hard/13 — без наград
  end if;

  update raids set status = v_result, finished_at = now() where id = p_raid_id;

  if v_give_rewards then
    select coalesce(sum(damage_dealt), 0) into v_total_dmg from raid_participants where raid_id = p_raid_id;

    v_rank := 0;
    for v_row in
      select player_id, damage_dealt from raid_participants
        where raid_id = p_raid_id and damage_dealt > 0
        order by damage_dealt desc
    loop
      v_rank := v_rank + 1;
      v_coins := 0; v_keys := 0; v_details := 0;

      if v_raid.rtype in ('normal', 'hard') then
        v_coins := floor((case v_raid.rtype when 'normal' then 200000 else 400000 end)::numeric
                          * v_row.damage_dealt / greatest(v_total_dmg, 1));
        v_keys := case v_rank when 1 then 10 when 2 then 5 when 3 then 3 else 1 end;
      elsif v_raid.rtype = '13' then
        v_keys := floor(200::numeric * v_row.damage_dealt / greatest(v_total_dmg, 1));
        v_coins := case v_rank when 1 then 25000 when 2 then 10000 when 3 then 5000 else 1000 end;
      elsif v_raid.rtype = 'ca' then
        v_keys := floor(1000::numeric * v_row.damage_dealt / greatest(v_raid.max_hp, 1));
        v_coins := case v_rank when 1 then 100000 when 2 then 50000 when 3 then 25000 else 10000 end;
        v_details := case v_rank when 1 then 5 when 2 then 4 when 3 then 3 else 1 end;
      end if;

      select exists(select 1 from player_items where player_id = v_row.player_id and item_slug = 'maksym_set')
        into v_has_maksym;
      if v_has_maksym and random() < 0.5 then
        v_coins := v_coins * 2; v_keys := v_keys * 2; v_details := v_details * 2;
      end if;

      update player_economy set
        loot_points = loot_points + v_coins,
        keys_current = keys_current + v_keys,
        keys_lifetime = keys_lifetime + v_keys,
        details = details + v_details,
        updated_at = now()
      where player_id = v_row.player_id;

      v_summary := v_summary || jsonb_build_object(
        'player_id', v_row.player_id, 'rank', v_rank, 'damage', v_row.damage_dealt,
        'coins', v_coins, 'keys', v_keys, 'details', v_details
      );
    end loop;
  end if;

  insert into activity_feed (event_type, detail)
    values ('raid_finish', jsonb_build_object('rtype', v_raid.rtype, 'result', v_result, 'rewards', v_summary));

  return jsonb_build_object('result', v_result, 'rewards', v_summary);
end;
$$;

revoke all on function finish_raid(bigint, text) from public;
grant execute on function finish_raid(bigint, text) to service_role;

-- activity_feed.event_type допускает ещё и 'raid_finish' (target_player_id тут не нужен)
alter table activity_feed drop constraint activity_feed_event_type_check;
alter table activity_feed add constraint activity_feed_event_type_check
  check (event_type in ('strong_man', 'weak_man', 'anime_girl', 'auto_key', 'horseshoe', 'raid_finish'));
alter table activity_feed alter column target_player_id drop not null;

-- ── Проверка таймаута — раз в 15 минут ──
create or replace function raid_timeout_tick()
returns void language plpgsql as $$
declare
  v_raid_id bigint;
begin
  select id into v_raid_id from raids where status = 'active' and ends_at <= now() limit 1;
  if v_raid_id is not null then
    perform finish_raid(v_raid_id, 'timeout');
  end if;
end;
$$;

select cron.schedule('raid_timeout_tick', '*/15 * * * *', $$select raid_timeout_tick()$$);
