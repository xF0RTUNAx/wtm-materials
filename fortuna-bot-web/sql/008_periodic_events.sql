-- Периодические ивенты чата, адаптированные под сайт: вместо счётчика сообщений —
-- реальное время (pg_cron), случайный игрок выбирается из "активных" (last_seen
-- в последние 14 дней), порог участия — аналог MIN_EVENT_PARTICIPANTS=5 из бота.
-- Логика 1:1 с ECONOMY_CATALOG.md, приложение "чат-ивенты".

create or replace function _pick_random_active_player(p_exclude uuid default null)
returns uuid language sql as $$
  select p.id from players p
  where p.last_seen > now() - interval '14 days'
    and (p_exclude is null or p.id <> p_exclude)
  order by random() limit 1
$$;

create or replace function _active_player_count()
returns int language sql as $$
  select count(*)::int from players where last_seen > now() - interval '14 days'
$$;

-- ── «Сильный мужчина» — +0-600 очков Ту-4 ──
create or replace function strong_man_tick()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_target uuid;
  v_amount int;
  v_has_book boolean;
  v_has_skyraider boolean;
begin
  if _active_player_count() < 5 then return; end if;
  v_target := _pick_random_active_player();
  if v_target is null then return; end if;

  v_amount := floor(random() * 601);
  select exists(select 1 from player_items where player_id = v_target and item_slug = 'manki_book') into v_has_book;
  select exists(select 1 from player_items where player_id = v_target and item_slug = 'manki_skyraider') into v_has_skyraider;

  if v_has_book then v_amount := round(v_amount * 1.05); end if;
  if v_has_skyraider then v_amount := v_amount * 2; end if;

  update player_economy set tu4_points = tu4_points + v_amount, updated_at = now() where player_id = v_target;

  insert into activity_feed (event_type, target_player_id, detail)
    select 'strong_man', v_target, jsonb_build_object('login', p.login, 'amount', v_amount)
    from players p where p.id = v_target;
end;
$$;

-- ── «Слабый мужчина» — отнимает 1-3 фрага радиофугаса ──
create or replace function weak_man_tick()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_target uuid;
  v_victim uuid;
  v_amount int := floor(random() * 3) + 1;
  v_rf int;
  v_login text;
  v_protected boolean := false;
  v_transferred boolean := false;
  v_no_effect boolean := false;
begin
  if _active_player_count() < 5 then return; end if;
  v_target := _pick_random_active_player();
  if v_target is null then return; end if;
  v_victim := v_target;

  -- Нестандартная мысль Линса: 50% полной защиты
  if exists(select 1 from player_items where player_id = v_target and item_slug = 'lins_thought') and random() < 0.5 then
    v_protected := true;
  -- ДЗ Дэвида: перенос на случайного другого игрока с radiofugas_kills>0
  elsif exists(select 1 from player_items where player_id = v_target and item_slug = 'david_homework') then
    select pe.player_id into v_victim from player_economy pe
      join players p on p.id = pe.player_id
      where p.last_seen > now() - interval '14 days' and pe.player_id <> v_target and pe.radiofugas_kills > 0
      order by random() limit 1;
    if v_victim is null then v_victim := v_target; else v_transferred := true; end if;
  end if;

  if not v_protected then
    select radiofugas_kills into v_rf from player_economy where player_id = v_victim;
    if v_rf is null or v_rf <= 0 then
      v_no_effect := true;
    else
      update player_economy set radiofugas_kills = greatest(0, radiofugas_kills - v_amount), updated_at = now()
        where player_id = v_victim;
      if exists(select 1 from player_items where player_id = v_victim and item_slug = 'save_anonymity') then
        update player_economy set loot_points = loot_points + 50000, keys_current = keys_current + 1,
          keys_lifetime = keys_lifetime + 1, details = details + 1 where player_id = v_victim;
      end if;
    end if;
  end if;

  select login into v_login from players where id = v_target;
  insert into activity_feed (event_type, target_player_id, detail)
    values ('weak_man', v_target, jsonb_build_object(
      'login', v_login, 'amount', v_amount, 'protected', v_protected,
      'transferred', v_transferred, 'no_effect', v_no_effect
    ));
end;
$$;

-- ── «2Д аниме девочка» — обнуляет половину статов ──
create or replace function anime_girl_tick()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_target uuid;
  v_victim uuid;
  v_divisor int := 2;
  v_transferred boolean := false;
  v_login text;
begin
  if _active_player_count() < 5 then return; end if;
  v_target := _pick_random_active_player();
  if v_target is null then return; end if;
  v_victim := v_target;

  if exists(select 1 from player_items where player_id = v_target and item_slug = 'andrey_10000th') then
    v_victim := _pick_random_active_player(v_target);
    if v_victim is null then v_victim := v_target; else v_transferred := true; v_divisor := 2; end if;
  end if;

  if not v_transferred and exists(select 1 from player_items where player_id = v_target and item_slug = 'motich_keychain') then
    v_divisor := 4;
  end if;

  update player_economy set
    radiofugas_kills = radiofugas_kills / v_divisor,
    fireball_kills = fireball_kills / v_divisor,
    tu4_points = tu4_points / v_divisor,
    updated_at = now()
  where player_id = v_victim;

  if exists(select 1 from player_items where player_id = v_victim and item_slug = 'save_anonymity') then
    update player_economy set loot_points = loot_points + 50000, keys_current = keys_current + 1,
      keys_lifetime = keys_lifetime + 1, details = details + 1 where player_id = v_victim;
  end if;

  select login into v_login from players where id = v_target;
  insert into activity_feed (event_type, target_player_id, detail)
    values ('anime_girl', v_target, jsonb_build_object('login', v_login, 'divisor', v_divisor, 'transferred', v_transferred));
end;
$$;

-- ── Авто-ключ — +1 ключ, +1000 монет случайному активному игроку ──
create or replace function auto_key_tick()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_target uuid;
  v_login text;
begin
  if _active_player_count() < 5 then return; end if;
  v_target := _pick_random_active_player();
  if v_target is null then return; end if;

  update player_economy set keys_current = keys_current + 1, keys_lifetime = keys_lifetime + 1,
    loot_points = loot_points + 1000, updated_at = now() where player_id = v_target;

  select login into v_login from players where id = v_target;
  insert into activity_feed (event_type, target_player_id, detail)
    values ('auto_key', v_target, jsonb_build_object('login', v_login));
end;
$$;

-- ── Расписание (интервалы пропорциональны исходным порогам 642/1020/2060/1250
--     сообщений в чате — настраивайте под реальную активность сайта) ──
select cron.schedule('strong_man_tick', '0 */3 * * *', $$select strong_man_tick()$$);
select cron.schedule('weak_man_tick', '0 */5 * * *', $$select weak_man_tick()$$);
select cron.schedule('anime_girl_tick', '0 */10 * * *', $$select anime_girl_tick()$$);
select cron.schedule('auto_key_tick', '0 */6 * * *', $$select auto_key_tick()$$);
