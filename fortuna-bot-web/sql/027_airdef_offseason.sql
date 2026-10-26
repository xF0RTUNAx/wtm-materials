-- «Воздушное превосходство»: межсезонье (Mark 2026-10-26: «межсезонье между сезонами длиной 1 неделя»). После последнего записанного сезона (сейчас —
-- сезон 1, до 01.01.2027 МСК, sql/026): неделя межсезонья, затем сезон 30 дней, снова неделя… — сезон 2: 08.01–07.02.2027, сезон 3: 14.02–16.03.2027.
-- airdef_season_at(ts) — номер идущего сезона, а в межсезонье — следующего (он ещё не начался): расчёт наград (sql/024: сезоны 1 … at − 1) идёт
-- в первый же день межсезонья. airdef_season_live(ts) — номер идущего сезона или 0 в межсезонье: бои межсезонья в рейтинг не идут (airdef-claim).
-- Применить: SUPABASE_ACCESS_TOKEN= supabase db query --linked --workdir . -f sql/027_airdef_offseason.sql (после 022)

create or replace function airdef_season_at(ts timestamptz) returns int language sql stable security definer set search_path = public as $$
  with r as (select max(id) n, max(ends_at) e, min(starts_at) s0 from airdef_seasons)
  select coalesce(
    (select id from airdef_seasons where ts >= starts_at and ts < ends_at),
    (select case when ts < r.s0 then 0
                 when ts < r.e then (select min(id) from airdef_seasons where starts_at > ts)   -- межсезонье между записанными сезонами
                 else r.n + 1 + floor(extract(epoch from (ts - r.e)) / (37 * 86400))::int end  -- дальше циклы по 37 дней: 7 межсезонья + 30 сезона
     from r))
$$;

-- границы сезона p (записанного или вычисленного: начало — после недели межсезонья)
create or replace function airdef_season_bounds(p int) returns table (starts_at timestamptz, ends_at timestamptz) language sql stable security definer set search_path = public as $$
  select s.starts_at, s.ends_at from airdef_seasons s where s.id = p
  union all
  select m.e + make_interval(secs => 86400 * (7 + 37 * (p - m.n - 1))), m.e + make_interval(secs => 86400 * 37 * (p - m.n)) -- секунды, как в airdef_season_at: «дни» зависели бы от часового пояса сессии
  from (select max(id) n, max(ends_at) e from airdef_seasons) m where p > m.n
$$;

-- идущий сезон или 0 (межсезонье, до первого сезона)
create or replace function airdef_season_live(ts timestamptz) returns int language sql stable security definer set search_path = public as $$
  select coalesce((select s.n from (select airdef_season_at(ts) n) s, airdef_season_bounds(s.n) b where ts >= b.starts_at and ts < b.ends_at), 0)
$$;

-- права — только service_role (как в 022)
revoke execute on function airdef_season_at(timestamptz) from public, anon, authenticated;
revoke execute on function airdef_season_bounds(int) from public, anon, authenticated;
revoke execute on function airdef_season_live(timestamptz) from public, anon, authenticated;
grant execute on function airdef_season_at(timestamptz) to service_role;
grant execute on function airdef_season_bounds(int) to service_role;
grant execute on function airdef_season_live(timestamptz) to service_role;
