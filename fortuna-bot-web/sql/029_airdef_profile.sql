-- «Воздушное превосходство»: профиль игрока (Mark 2026-10-28, макет tools/airdef-ui/profile-mock.html). Открывается из таблицы рейтинга по нику
-- (свой — из своей карточки); только аккаунты игры. Решения Mark: статистика — только онлайн; период — текущий сезон и всё время; любимые
-- самолёт и ЗРК — только онлайн; награды — только места за сезоны; скрыть профиль нельзя; чужие лучшие бои — без разбора очков.
-- Наружу — ни id игрока, ни номеров боёв.
-- Применить: SUPABASE_ACCESS_TOKEN= supabase db query --linked --workdir . -f sql/029_airdef_profile.sql (после 022, 024, 025, 027)
--
-- Откуда что:
--   шапка — airdef_accounts (ник, created_at), место / очки / засчитано — airdef_rating_board (как в таблице);
--   по режимам — airdef_mp_results: вид боя — «Мульти-волна» (result.mm = 1) или роль (team); бои сезона — по времени боя в границах сезона
--     (и бои своих комнат, у которых нет очков рейтинга); победы — win; поражено — kills (лётчик — уничтоженные ЗРК, ПВО — сбитые);
--     лучший — наибольшие очки рейтинга;
--   любимое — result.u из подписанного итога (игровой сервер с 2026-10-28, game-server/airdef-own.js useOut): fl — вылеты по самолётам,
--     sm — ЗРК, стоявшие в бою. Самолёт — больше всего вылетов, ЗРК — в большем числе боёв; of — всего вылетов / боёв с ЗРК;
--   лучшие бои сезона — airdef_rating_counted (засчитанные, 2 + 2 + 2 + 1), без разбора очков;
--   награды — airdef_season_paid: место за каждый рассчитанный сезон.

-- профиль по нику (без учёта регистра) за сезон p_season; null — нет такого аккаунта игры.
--   { nick, since, games, place, points, n,
--     modes: { season: { air|pvo|multi: { n, w, k, best } }, all: { … } },
--     fav: { season: { plane: { key, n, of } | null, sam: { key, n, of } | null }, all: { … } },
--     best: [{ at, kind, mode, win, draw, k, rating }], awards: [{ season, place }] }
create or replace function airdef_profile(p_nick text, p_season int) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  pid uuid; nk text; since timestamptz; b0 timestamptz; b1 timestamptz; me record; res jsonb;
begin
  if p_nick is null or length(p_nick) > 32 then return null; end if;
  select a.player_id, a.nick, a.created_at into pid, nk, since
    from airdef_accounts a join players p on p.id = a.player_id and p.kind = 'airdef'
   where lower(a.nick) = lower(btrim(p_nick));
  if pid is null then return null; end if;
  select starts_at, ends_at into b0, b1 from airdef_season_bounds(p_season);
  select bd.place, bd.points, bd.n into me from airdef_rating_board(p_season) bd where bd.player_id = pid;

  with m as (
    select case when r.result->>'mm' = '1' then 'multi' when r.team = 'pvo' then 'pvo' else 'air' end kind,
           r.win, greatest(r.kills, 0) kills, r.rating, r.result->'u' u,
           coalesce(r.claimed_at >= b0 and r.claimed_at < b1, false) cur
      from airdef_mp_results r where r.player_id = pid),
  pr as (select 'season' per, m.* from m where m.cur union all select 'all', m.* from m),
  md as (
    select per, kind, jsonb_build_object('n', count(*), 'w', count(*) filter (where win), 'k', sum(kills), 'best', max(rating)) v
      from pr group by pr.per, pr.kind),
  -- любимое: вылеты по самолётам (fl — объект { ключ: число }) и ЗРК в бою (sm — массив ключей); чужие ключи и числа отбрасываются
  fl as (
    select pr.per, e.key, least(99, greatest(0, floor((e.value #>> '{}')::numeric)))::int n
      from pr, jsonb_each(case when jsonb_typeof(pr.u->'fl') = 'object' then pr.u->'fl' else '{}'::jsonb end) e
     where jsonb_typeof(e.value) = 'number' and e.key ~ '^[a-z0-9_]{1,24}$'),
  sm as (
    select distinct q.per, q.i, s.k
      from (select pr.per, pr.u, row_number() over () i from pr) q,
           jsonb_array_elements_text(case when jsonb_typeof(q.u->'sm') = 'array' then q.u->'sm' else '[]'::jsonb end) s(k)
     where s.k ~ '^[a-z0-9_]{1,24}$'),
  plane as (
    select f.per, jsonb_build_object('key', f.key, 'n', f.n, 'of', t.n) v
      from (select per, key, sum(n)::int n, row_number() over (partition by per order by sum(n) desc, key) rn from fl group by per, key) f
      join (select per, sum(n)::int n from fl group by per) t on t.per = f.per
     where f.rn = 1 and f.n > 0),
  sam as (
    select s.per, jsonb_build_object('key', s.k, 'n', s.n, 'of', t.n) v
      from (select per, k, count(*)::int n, row_number() over (partition by per order by count(*) desc, k) rn from sm group by per, k) s
      join (select per, count(distinct i)::int n from sm group by per) t on t.per = s.per
     where s.rn = 1)
  select jsonb_build_object(
    'modes', jsonb_build_object(
      'season', coalesce((select jsonb_object_agg(kind, v) from md where per = 'season'), '{}'::jsonb),
      'all',    coalesce((select jsonb_object_agg(kind, v) from md where per = 'all'), '{}'::jsonb)),
    'fav', jsonb_build_object(
      'season', jsonb_build_object('plane', (select v from plane where per = 'season'), 'sam', (select v from sam where per = 'season')),
      'all',    jsonb_build_object('plane', (select v from plane where per = 'all'),    'sam', (select v from sam where per = 'all'))),
    'games', (select count(*) from m))
  into res;

  return res || jsonb_build_object(
    'nick', nk, 'since', since,
    'place', me.place, 'points', coalesce(me.points, 0), 'n', coalesce(me.n, 0),
    'best', coalesce((
      select jsonb_agg(jsonb_build_object(
               'at', r.claimed_at, 'kind', c.kind, 'mode', r.mode, 'win', r.win, 'draw', coalesce(r.rp->>'r', '') = '200',
               'k', case when jsonb_typeof(r.rp->'k') = 'number' then (r.rp->>'k')::numeric else 1 end, 'rating', c.rating)
             order by c.rating desc, r.claimed_at)
        from airdef_rating_counted(p_season, pid) c
        join airdef_mp_results r on r.match_id = c.match_id and r.player_id = pid), '[]'::jsonb),
    'awards', coalesce((select jsonb_agg(jsonb_build_object('season', s.season, 'place', s.place) order by s.season desc)
                          from airdef_season_paid s where s.player_id = pid), '[]'::jsonb));
end $$;

-- права — только service_role (как в 022). Проверка после применения (всё false):
--   select has_function_privilege('anon', 'airdef_profile(text, int)', 'execute'), has_function_privilege('authenticated', 'airdef_profile(text, int)', 'execute');
revoke execute on function airdef_profile(text, int) from public, anon, authenticated;
grant execute on function airdef_profile(text, int) to service_role;
