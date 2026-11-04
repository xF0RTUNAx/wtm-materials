-- «Задания» «Воздушного превосходства»: состояние игрока (airdef_progress.quests, правила — games/airdef/quests-data.js) и сохранение вместе с прогрессом.
-- Опыт, серебро и задания пишутся одной строкой с номером версии, кристаллы — в той же транзакции: «Забрать» не задвоится при гонке двух запросов.
-- Применить: SUPABASE_ACCESS_TOKEN= supabase db query --linked --workdir . -f sql/030_airdef_quests.sql
alter table airdef_progress add column if not exists quests jsonb not null default '{}'::jsonb;

create or replace function airdef_progress_save_q(p_player_id uuid, p_version int, p_xp int, p_silver int, p_res text[], p_own text[], p_goal jsonb,
                                                  p_first_win_day date, p_solo_day date, p_solo_xp int, p_quests jsonb, p_crystals int default 0)
returns int language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if p_xp < 0 or p_silver < 0 or p_crystals < 0 then raise exception 'airdef_progress_save_q: отрицательное значение'; end if;
  if p_version = 0 then
    insert into airdef_progress (player_id, xp, silver, res, own, goal, first_win_day, solo_day, solo_xp, quests, version)
    values (p_player_id, p_xp, p_silver, p_res, p_own, p_goal, p_first_win_day, p_solo_day, p_solo_xp, p_quests, 1)
    on conflict (player_id) do nothing
    returning version into v;
  else
    update airdef_progress set xp = p_xp, silver = p_silver, res = p_res, own = p_own, goal = p_goal,
           first_win_day = p_first_win_day, solo_day = p_solo_day, solo_xp = p_solo_xp, quests = p_quests, version = version + 1, updated_at = now()
     where player_id = p_player_id and version = p_version
    returning version into v;
  end if;
  if v is null then return -1; end if;
  if p_crystals > 0 then
    insert into airdef_wallet (player_id, crystals) values (p_player_id, p_crystals)
    on conflict (player_id) do update set crystals = airdef_wallet.crystals + excluded.crystals, updated_at = now();
  end if;
  return v;
end $$;

revoke all on function airdef_progress_save_q(uuid, int, int, int, text[], text[], jsonb, date, date, int, jsonb, int) from public, anon, authenticated;
grant execute on function airdef_progress_save_q(uuid, int, int, int, text[], text[], jsonb, date, date, int, jsonb, int) to service_role;

-- перенос прогресса с аккаунта сайта (sql/022): теперь и задания, и кошелёк
create or replace function airdef_transfer(p_from uuid, p_to uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare a airdef_progress; b airdef_progress; n_runs int; n_res int;
begin
  -- сначала замки на обе строки (два одновременных переноса одного аккаунта сайта или в один аккаунт игры идут по очереди),
  -- и только потом проверки «уже переносили»
  perform 1 from airdef_accounts where player_id = p_to for update;
  perform 1 from players where id = p_from for update;
  if not exists (select 1 from players where id = p_to and kind = 'airdef') then raise exception 'not_airdef'; end if;
  if not exists (select 1 from players where id = p_from and kind = 'site') then raise exception 'not_site'; end if;
  if exists (select 1 from airdef_accounts where from_player = p_from) then raise exception 'already_used'; end if;
  if exists (select 1 from airdef_accounts where player_id = p_to and from_player is not null) then raise exception 'already_done'; end if;
  select * into a from airdef_progress where player_id = p_from for update;
  select * into b from airdef_progress where player_id = p_to for update;
  if a.player_id is not null then
    if b.player_id is null then
      update airdef_progress set player_id = p_to, version = version + 1, updated_at = now() where player_id = p_from;
    else
      update airdef_progress set
        xp = b.xp + a.xp, silver = b.silver + a.silver,
        res = array(select distinct unnest(b.res || a.res)), own = array(select distinct unnest(b.own || a.own)),
        goal = case when b.goal = '{}'::jsonb then a.goal else b.goal end,
        first_win_day = greatest(b.first_win_day, a.first_win_day),
        quests = case when b.quests = '{}'::jsonb then a.quests else b.quests end,
        version = b.version + 1, updated_at = now()
      where player_id = p_to;
      delete from airdef_progress where player_id = p_from;
    end if;
  end if;
  update airdef_runs set player_id = p_to where player_id = p_from; get diagnostics n_runs = row_count;
  update airdef_mp_results set player_id = p_to where player_id = p_from; get diagnostics n_res = row_count;
  insert into airdef_mp_stats as s (player_id, games, wins, air_games, air_wins, pvo_games, pvo_wins, kills, score, best_score)
    select p_to, games, wins, air_games, air_wins, pvo_games, pvo_wins, kills, score, best_score from airdef_mp_stats where player_id = p_from
  on conflict (player_id) do update set
    games = s.games + excluded.games, wins = s.wins + excluded.wins, air_games = s.air_games + excluded.air_games, air_wins = s.air_wins + excluded.air_wins,
    pvo_games = s.pvo_games + excluded.pvo_games, pvo_wins = s.pvo_wins + excluded.pvo_wins, kills = s.kills + excluded.kills,
    score = s.score + excluded.score, best_score = greatest(s.best_score, excluded.best_score), updated_at = now();
  delete from airdef_mp_stats where player_id = p_from;
  -- кристаллы и окраски: на аккаунте сайта они появляются с заданиями (sql/030)
  insert into airdef_wallet as w (player_id, crystals, camos, picks)
    select p_to, crystals, camos, picks from airdef_wallet where player_id = p_from
  on conflict (player_id) do update set crystals = w.crystals + excluded.crystals, picks = w.picks + excluded.picks,
    camos = array(select distinct unnest(w.camos || excluded.camos)), updated_at = now();
  delete from airdef_wallet where player_id = p_from;
  update airdef_accounts set from_player = p_from, transferred_at = now() where player_id = p_to;
  return jsonb_build_object('progress', a.player_id is not null, 'runs', n_runs, 'online', n_res);
end $$;
