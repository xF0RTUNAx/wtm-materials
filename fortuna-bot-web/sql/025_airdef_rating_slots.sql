-- «Воздушное превосходство»: какие бои идут в сезон (Mark 2026-10-26) — 2 лучших в обороне (роль ПВО), 2 лучших в вылете (лётчик),
-- 2 лучших в «Мульти-волне» и ещё 1 лучший из остальных боёв любого вида: всего до 7. Было (022) — 7 лучших любых.
-- Вид боя: «Мульти-волна» — result.mm = 1 (роль там меняется по раундам), иначе — по роли (team). Равные очки — раньше засчитанный.
-- Применить: SUPABASE_ACCESS_TOKEN= supabase db query --linked --workdir . -f sql/025_airdef_rating_slots.sql (после 022)

-- засчитанные бои сезона: всех игроков или одного (p_player); окно рейтинга отмечает по нему «засчитан» в «Моих боях».
-- Запрос собирается под случай: для одного игрока — с условием по игроку без «or» (индекс season, player_id; airdef-claim зовёт
-- airdef_rating_points до 13 раз на бой — с «p_player is null or …» каждый вызов читал бы весь сезон, ревью: ×60 медленнее)
create or replace function airdef_rating_counted(p_season int, p_player uuid default null)
returns table (player_id uuid, match_id text, rating int, kind text) language plpgsql stable security definer set search_path = public as $$
begin
  return query execute
    'with b as (
       select r.player_id, r.match_id, r.rating, r.claimed_at,
         case when r.result->>''mm'' = ''1'' then ''multi'' when r.team = ''pvo'' then ''pvo'' else ''air'' end kind
       from airdef_mp_results r where r.season = $1 and r.rating is not null' || case when p_player is null then '' else ' and r.player_id = $2' end || '),
     k as (select b.*, row_number() over (partition by b.player_id, b.kind order by b.rating desc, b.claimed_at, b.match_id) <= 2 slot from b),
     o as (select k.*, row_number() over (partition by k.player_id, k.slot order by k.rating desc, k.claimed_at, k.match_id) rn from k)
     select o.player_id, o.match_id, o.rating, o.kind from o where o.slot or o.rn = 1'
    using p_season, p_player;
end $$;

-- очки сезона игрока (сила соперников в airdef-claim)
create or replace function airdef_rating_points(p_player uuid, p_season int) returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(c.rating), 0)::int from airdef_rating_counted(p_season, p_player) c
$$;

-- таблица сезона: место, ник, очки, засчитано боёв; только аккаунты игры
create or replace function airdef_rating_board(p_season int)
returns table (player_id uuid, nick text, points bigint, n int, place bigint) language sql stable security definer set search_path = public as $$
  with sums as (
    select c.player_id, sum(c.rating)::bigint points, count(*)::int n
    from airdef_rating_counted(p_season) c join airdef_accounts a on a.player_id = c.player_id group by c.player_id)
  select s.player_id, a.nick, s.points, s.n, rank() over (order by s.points desc) place
  from sums s join airdef_accounts a on a.player_id = s.player_id
  order by s.points desc, a.nick
$$;

-- права — только service_role (как в 022)
revoke execute on function airdef_rating_counted(int, uuid) from public, anon, authenticated;
revoke execute on function airdef_rating_points(uuid, int) from public, anon, authenticated;
revoke execute on function airdef_rating_board(int) from public, anon, authenticated;
grant execute on function airdef_rating_counted(int, uuid) to service_role;
grant execute on function airdef_rating_points(uuid, int) to service_role;
grant execute on function airdef_rating_board(int) to service_role;
