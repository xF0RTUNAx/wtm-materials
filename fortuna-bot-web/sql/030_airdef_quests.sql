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
