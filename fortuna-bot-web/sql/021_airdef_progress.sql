-- «Воздушное превосходство»: прокачка (AIRDEF_PROGRESSION.md). Опыт и серебро — только этой игры, не связаны с деталями сайта.
-- Правила (цены, паритет, награда за бой) считают edge-функции airdef-progress / airdef-solo / airdef-claim по
-- _shared/airdef/progress.js; база только хранит и не даёт двум запросам перезаписать друг друга (version).
-- Применить: supabase db query --linked --workdir . < sql/021_airdef_progress.sql
create table if not exists airdef_progress (
  player_id     uuid primary key references players(id) on delete cascade,
  xp            int  not null default 0 check (xp >= 0),
  silver        int  not null default 0 check (silver >= 0),
  res           text[] not null default '{}',   -- исследованные узлы ('air:e_su17', 'pvo:s125'…), сверх стартовых
  own           text[] not null default '{}',   -- купленные
  goal          jsonb not null default '{}',    -- текущая цель в каждой ветке: { air: 'air:e_su17', … }
  first_win_day date,                           -- день (МСК), когда уже была «первая победа дня» ×2
  solo_day      date,                           -- сутки (МСК) счётчика одиночной игры
  solo_xp       int  not null default 0,        -- опыт одиночной игры за эти сутки (после SOLO_DAY — ×0,5)
  version       int  not null default 1,
  updated_at    timestamptz not null default now()
);
alter table airdef_progress enable row level security;

-- одиночные бои: номер боя выдаётся перед боем (airdef-solo start), засчитать можно один раз; длительность — по серверу
create table if not exists airdef_runs (
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid not null references players(id) on delete cascade,
  game       text not null check (game in ('air', 'defense', 'multi')),
  mode       text not null check (mode in ('arcade', 'real')),
  era        int  not null default 1,
  started_at timestamptz not null default now(),
  claimed_at timestamptz,
  xp         int
);
create index if not exists airdef_runs_player on airdef_runs (player_id, started_at desc);
alter table airdef_runs enable row level security;

-- сохранить состояние, если строку не изменили с прочитанной версии (p_version = 0 — строки ещё нет).
-- Возвращает новую версию или -1 (кто-то успел раньше — функция перечитает и повторит)
create or replace function airdef_progress_save(p_player_id uuid, p_version int, p_xp int, p_silver int, p_res text[], p_own text[], p_goal jsonb,
                                                p_first_win_day date, p_solo_day date, p_solo_xp int)
returns int language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if p_xp < 0 or p_silver < 0 then raise exception 'airdef_progress_save: отрицательный остаток'; end if;
  if p_version = 0 then
    insert into airdef_progress (player_id, xp, silver, res, own, goal, first_win_day, solo_day, solo_xp, version)
    values (p_player_id, p_xp, p_silver, p_res, p_own, p_goal, p_first_win_day, p_solo_day, p_solo_xp, 1)
    on conflict (player_id) do nothing
    returning version into v;
    return coalesce(v, -1);
  end if;
  update airdef_progress set xp = p_xp, silver = p_silver, res = p_res, own = p_own, goal = p_goal,
         first_win_day = p_first_win_day, solo_day = p_solo_day, solo_xp = p_solo_xp, version = version + 1, updated_at = now()
   where player_id = p_player_id and version = p_version
  returning version into v;
  return coalesce(v, -1);
end $$;

-- засчитать одиночный бой один раз: отметка и длительность в секундах (null — нет такого боя / уже засчитан / старше 3 ч)
create or replace function airdef_run_claim(p_run uuid, p_player_id uuid)
returns table (game text, mode text, era int, seconds int) language plpgsql security definer set search_path = public as $$
begin
  return query
  with u as (
    update airdef_runs r set claimed_at = now()
     where r.id = p_run and r.player_id = p_player_id and r.claimed_at is null and r.started_at > now() - interval '3 hours'
    returning r.game as g, r.mode as m, r.era as e, extract(epoch from (now() - r.started_at))::int as s)
  select u.g, u.m, u.e, u.s from u;
end $$;
-- бой засчитан, но сохранить опыт не вышло — вернуть отметку (можно повторить)
create or replace function airdef_run_unclaim(p_run uuid) returns void language sql security definer set search_path = public as $$
  update airdef_runs set claimed_at = null where id = p_run;
$$;

revoke all on function airdef_progress_save(uuid, int, int, int, text[], text[], jsonb, date, date, int) from public;
revoke all on function airdef_run_claim(uuid, uuid) from public;
revoke all on function airdef_run_unclaim(uuid) from public;
grant all privileges on airdef_progress, airdef_runs to service_role;
grant execute on function airdef_progress_save(uuid, int, int, int, text[], text[], jsonb, date, date, int) to service_role;
grant execute on function airdef_run_claim(uuid, uuid) to service_role;
grant execute on function airdef_run_unclaim(uuid) to service_role;
