-- «Воздушное превосходство»: свои аккаунты игры, перенос прогресса с аккаунта сайта и сезонный рейтинг онлайна (Mark 2026-10-25).
-- Применить: SUPABASE_ACCESS_TOKEN= supabase db query --linked --workdir . -f sql/022_airdef_accounts_rating.sql
--
-- Аккаунт игры — строка players (все таблицы игры ссылаются на players(id)) с kind = 'airdef' и логином 'ad:<логин>': логин сайта
-- двоеточия не допускает (auth-password, LOGIN_RE) — пространства имён не пересекаются, вход сайта такие строки не найдёт.
-- Ник для рейтинга, перенос — в airdef_accounts. Аккаунт сайта в игре по-прежнему работает (без рейтинга); мини-игры сайта не тронуты.
alter table players add column if not exists kind text not null default 'site';
do $$ begin
  alter table players add constraint players_kind_check check (kind in ('site', 'airdef'));
exception when duplicate_object then null; end $$;

create table if not exists airdef_accounts (
  player_id      uuid primary key references players(id) on delete cascade,
  nick           text not null,
  nick_season    int  not null default 0,                         -- сезон последней смены ника (менять — раз в сезон)
  from_player    uuid unique references players(id) on delete set null, -- аккаунт сайта, с которого перенесён прогресс (каждый — один раз)
  transferred_at timestamptz,
  created_at     timestamptz not null default now()
);
create unique index if not exists airdef_accounts_nick on airdef_accounts (lower(nick));
alter table airdef_accounts enable row level security;

-- ── сезоны: первый — с 25.10.2026 до 01.12.2026 (МСК, Mark), дальше по 30 дней от конца последнего записанного ──
create table if not exists airdef_seasons (
  id        int primary key,
  starts_at timestamptz not null,
  ends_at   timestamptz not null
);
insert into airdef_seasons (id, starts_at, ends_at) values (1, '2026-10-25 00:00:00+03', '2026-12-01 00:00:00+03') on conflict (id) do nothing;
alter table airdef_seasons enable row level security;

-- номер сезона на момент ts (0 — до первого)
create or replace function airdef_season_at(ts timestamptz) returns int language sql stable security definer set search_path = public as $$
  select coalesce(
    (select id from airdef_seasons where ts >= starts_at and ts < ends_at),
    case when ts < (select min(starts_at) from airdef_seasons) then 0
         else (select max(id) from airdef_seasons) + 1 + floor(extract(epoch from (ts - (select max(ends_at) from airdef_seasons))) / (30 * 86400))::int end)
$$;
-- границы сезона p (записанного или вычисленного)
create or replace function airdef_season_bounds(p int) returns table (starts_at timestamptz, ends_at timestamptz) language sql stable security definer set search_path = public as $$
  select s.starts_at, s.ends_at from airdef_seasons s where s.id = p
  union all
  select m.e + make_interval(days => 30 * (p - m.n - 1)), m.e + make_interval(days => 30 * (p - m.n))
  from (select max(id) n, max(ends_at) e from airdef_seasons) m where p > m.n
$$;

-- ── рейтинг: очки боя считает airdef-claim (части — от игрового сервера, в подписанном итоге; сила соперников — по таблице сезона) ──
-- очки пишутся у всех онлайн-боёв; в таблице сезона — только аккаунты игры (перенёс прогресс — бои этого сезона засчитаны)
alter table airdef_mp_results add column if not exists rating int;
alter table airdef_mp_results add column if not exists season int;
alter table airdef_mp_results add column if not exists rp jsonb;   -- разбор: { r, c, s, b, m, k } — итог, вклад, соперники, боты, режим, ранг
create index if not exists airdef_mp_results_season on airdef_mp_results (season, player_id) where rating is not null;

-- очки сезона игрока: сумма 7 лучших боёв
create or replace function airdef_rating_points(p_player uuid, p_season int) returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(rating), 0)::int from (
    select rating from airdef_mp_results where player_id = p_player and season = p_season and rating is not null
    order by rating desc, claimed_at limit 7) t
$$;

-- таблица сезона: место, ник, очки (7 лучших), засчитано боёв; только аккаунты игры
create or replace function airdef_rating_board(p_season int)
returns table (player_id uuid, nick text, points bigint, n int, place bigint) language sql stable security definer set search_path = public as $$
  with best as (
    select r.player_id, r.rating, row_number() over (partition by r.player_id order by r.rating desc, r.claimed_at) rn
    from airdef_mp_results r join airdef_accounts a on a.player_id = r.player_id
    where r.season = p_season and r.rating is not null),
  sums as (select b.player_id, sum(b.rating)::bigint points, count(*)::int n from best b where b.rn <= 7 group by b.player_id)
  select s.player_id, a.nick, s.points, s.n, rank() over (order by s.points desc) place
  from sums s join airdef_accounts a on a.player_id = s.player_id
  order by s.points desc, a.nick
$$;

-- ── перенос прогресса игры: аккаунт сайта p_from → аккаунт игры p_to (одной транзакцией) ──
-- Только данные «Воздушного превосходства»: прокачка (airdef_progress), одиночные бои (airdef_runs), онлайн (airdef_mp_results, airdef_mp_stats).
-- Уже есть прогресс у аккаунта игры — складывается: опыт и серебро суммой, исследования и покупки — объединением. У аккаунта сайта прогресс
-- игры обнуляется (переезд, без копий); всё остальное сайта — на месте. Каждый аккаунт сайта переносится один раз.
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
  update airdef_accounts set from_player = p_from, transferred_at = now() where player_id = p_to;
  return jsonb_build_object('progress', a.player_id is not null, 'runs', n_runs, 'online', n_res);
end $$;

-- ── защита от перебора паролей (airdef-account: вход, перенос, смена ника) ──
-- key: 'login:<логин игры>' / 'site:<логин сайта>' (строчными); 10 неудач подряд — until = now() + 15 минут, удачный вход строку удаляет.
-- at — время последней неудачи: старше часа — отсчёт идёт заново. Таблица — только service_role (RLS включён, политик нет).
create table if not exists airdef_auth_fail (
  key   text primary key,
  n     int  not null default 0,
  until timestamptz,
  at    timestamptz not null default now()
);
alter table airdef_auth_fail enable row level security;
-- записать неудачу; возвращает until, если ключ теперь заперт (иначе null)
create or replace function airdef_auth_fail_hit(p_key text) returns timestamptz language plpgsql security definer set search_path = public as $$
declare u timestamptz;
begin
  insert into airdef_auth_fail as f (key, n, at) values (p_key, 1, now())
  on conflict (key) do update set
    n = case when (f.until is not null and f.until <= now()) or f.at < now() - interval '1 hour' then 1 else f.n + 1 end,
    until = case when f.until is not null and f.until <= now() then null else f.until end,
    at = now();
  update airdef_auth_fail set until = now() + interval '15 minutes' where key = p_key and n >= 10 and until is null;
  select until into u from airdef_auth_fail where key = p_key and until > now();
  return u;
end $$;

-- права edge-функций (как в 019–021): ни одна функция не доступна ни public, ни anon, ни authenticated — только service_role
-- (Supabase по умолчанию выдаёт execute новым функциям ещё и anon / authenticated — поэтому revoke явный).
-- Проверка после применения (всё должно быть false):
--   select p.proname, has_function_privilege('anon', p.oid, 'execute') anon, has_function_privilege('authenticated', p.oid, 'execute') auth
--   from pg_proc p where p.proname in ('airdef_season_at','airdef_season_bounds','airdef_rating_points','airdef_rating_board','airdef_transfer','airdef_auth_fail_hit');
revoke execute on function airdef_season_at(timestamptz) from public, anon, authenticated;
revoke execute on function airdef_season_bounds(int) from public, anon, authenticated;
revoke execute on function airdef_rating_points(uuid, int) from public, anon, authenticated;
revoke execute on function airdef_rating_board(int) from public, anon, authenticated;
revoke execute on function airdef_transfer(uuid, uuid) from public, anon, authenticated;
revoke execute on function airdef_auth_fail_hit(text) from public, anon, authenticated;
grant all privileges on airdef_accounts, airdef_seasons, airdef_auth_fail to service_role;
grant execute on function airdef_season_at(timestamptz) to service_role;
grant execute on function airdef_season_bounds(int) to service_role;
grant execute on function airdef_rating_points(uuid, int) to service_role;
grant execute on function airdef_rating_board(int) to service_role;
grant execute on function airdef_transfer(uuid, uuid) to service_role;
grant execute on function airdef_auth_fail_hit(text) to service_role;
