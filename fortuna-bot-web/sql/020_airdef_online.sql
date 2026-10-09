-- «Воздушное превосходство»: онлайн-бои — свои результаты и таблица лучших (отдельно от «Летки»).
-- Применить: supabase db query --linked --workdir . < sql/020_airdef_online.sql
create table if not exists airdef_mp_results (
  match_id   text        not null,
  player_id  uuid        not null references players(id) on delete cascade,
  mode       text        not null check (mode in ('arcade', 'real')),
  team       text        not null check (team in ('air', 'pvo')),
  win        boolean     not null,
  kills      int         not null default 0,
  score      int         not null default 0,
  rewarded   boolean     not null default false,
  result     jsonb,
  claimed_at timestamptz not null default now(),
  primary key (match_id, player_id)
);
create index if not exists airdef_mp_results_player on airdef_mp_results (player_id, claimed_at desc);

-- сводка игрока: бои, победы за каждую роль, сбито/уничтожено, очки (таблица лучших — по score)
create table if not exists airdef_mp_stats (
  player_id  uuid primary key references players(id) on delete cascade,
  games      int not null default 0,
  wins       int not null default 0,
  air_games  int not null default 0,
  air_wins   int not null default 0,
  pvo_games  int not null default 0,
  pvo_wins   int not null default 0,
  kills      int not null default 0,
  score      bigint not null default 0,
  best_score int not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists airdef_mp_stats_score on airdef_mp_stats (score desc);

create or replace function airdef_mp_record(p_player_id uuid, p_team text, p_win boolean, p_kills int, p_score int)
returns airdef_mp_stats language plpgsql security definer set search_path = public as $$
declare r airdef_mp_stats;
begin
  insert into airdef_mp_stats as s (player_id, games, wins, air_games, air_wins, pvo_games, pvo_wins, kills, score, best_score)
  values (p_player_id, 1, p_win::int, (p_team = 'air')::int, (p_team = 'air' and p_win)::int, (p_team = 'pvo')::int, (p_team = 'pvo' and p_win)::int,
          greatest(0, p_kills), greatest(0, p_score), greatest(0, p_score))
  on conflict (player_id) do update set
    games = s.games + 1, wins = s.wins + p_win::int,
    air_games = s.air_games + (p_team = 'air')::int, air_wins = s.air_wins + (p_team = 'air' and p_win)::int,
    pvo_games = s.pvo_games + (p_team = 'pvo')::int, pvo_wins = s.pvo_wins + (p_team = 'pvo' and p_win)::int,
    kills = s.kills + greatest(0, p_kills), score = s.score + greatest(0, p_score), best_score = greatest(s.best_score, p_score), updated_at = now()
  returning * into r;
  return r;
end $$;

-- права edge-функций (как в 019: таблицы, созданные через CLI, сами их не получают)
grant all privileges on airdef_mp_results, airdef_mp_stats to service_role;
grant execute on function airdef_mp_record(uuid, text, boolean, int, int) to service_role;
