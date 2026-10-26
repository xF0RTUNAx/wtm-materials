-- «Воздушное превосходство»: кристаллы и награды за сезон рейтинга (Mark 2026-10-26). В игре пока не объявляются — копятся молча,
-- потратит их магазин камуфляжей (позже). Применить: SUPABASE_ACCESS_TOKEN= supabase db query --linked --workdir . -f sql/024_airdef_season_rewards.sql
-- Правила — games/airdef/rating.js (SEASON), камуфляжи и цена — arsenal.js (CAMOS, CAMO_PRICE): функция airdef-progress передаёт их в
-- airdef_season_settle при загрузке прокачки — первый вход после конца сезона его и рассчитывает (повторный вызов ничего не начислит).

-- кошелёк аккаунта игры: кристаллы, свои камуфляжи ('самолёт:окраска'), камуфляжи «на выбор», ещё не выбранные (место 1)
create table if not exists airdef_wallet (
  player_id  uuid primary key references players(id) on delete cascade,
  crystals   int    not null default 0 check (crystals >= 0),
  camos      text[] not null default '{}',
  picks      int    not null default 0 check (picks >= 0),
  updated_at timestamptz not null default now()
);
alter table airdef_wallet enable row level security;

-- выплаты: строка на игрока и сезон (что дали и за что); сезон рассчитан — строка в airdef_season_done
create table if not exists airdef_season_paid (
  season    int  not null,
  player_id uuid not null references players(id) on delete cascade,
  place     int  not null,
  points    int  not null,
  n         int  not null,
  crystals  int  not null default 0,
  camo      text,                     -- случайный камуфляж (место 2)
  pick      int  not null default 0,  -- камуфляж на выбор (место 1)
  paid_at   timestamptz not null default now(),
  primary key (season, player_id)
);
alter table airdef_season_paid enable row level security;
create table if not exists airdef_season_done (
  season   int primary key,
  players  int not null,
  crystals int not null,
  done_at  timestamptz not null default now()
);
alter table airdef_season_done enable row level security;

-- рассчитать все закончившиеся и ещё не рассчитанные сезоны; p_rules = { per, min, top, price, camos } (см. rating.js SEASON).
-- Место — как в таблице сезона (airdef_rating_board, rank: равные очки — одно место); меньше min засчитанных боёв — ничего; награда за
-- место — только при очках > 0 (бои без действий засчитываются нулём: нулевые делили бы одно место). Камуфляж (выбор или случайный) —
-- только если остался свободный, не обещанный невыбранным выборам (picks); иначе — цена кристаллами.
-- Возвращает номера сезонов, рассчитанных этим вызовом.
create or replace function airdef_season_settle(p_rules jsonb) returns int[] language plpgsql security definer set search_path = public as $$
declare
  cur int := airdef_season_at(now()); s int; r record; w airdef_wallet; t jsonb; free text[]; cr int; pk int; cm text; tot int; np int;
  per int := (p_rules->>'per')::int; mn int := (p_rules->>'min')::int; price int := (p_rules->>'price')::int;
  cat text[] := array(select jsonb_array_elements_text(p_rules->'camos')); done int[] := '{}';
begin
  if per is null or per <= 0 or mn is null or price is null or price <= 0 or jsonb_typeof(p_rules->'top') <> 'array' then raise exception 'bad_rules'; end if;
  for s in 1 .. cur - 1 loop
    continue when exists (select 1 from airdef_season_done d where d.season = s);
    perform pg_advisory_xact_lock(hashtext('airdef_season_settle'), s); -- два вызова сразу: второй ждёт и видит, что сезон рассчитан
    continue when exists (select 1 from airdef_season_done d where d.season = s);
    tot := 0; np := 0;
    for r in select b.player_id, b.points::int pts, b.n, b.place::int pl from airdef_rating_board(s) b loop
      continue when r.n < mn;
      insert into airdef_wallet (player_id) values (r.player_id) on conflict do nothing;
      select * into w from airdef_wallet where player_id = r.player_id for update;
      cr := greatest(r.pts, 0) / per; pk := 0; cm := null;
      t := case when r.pts > 0 then p_rules->'top'->(r.pl - 1) end;
      free := array(select unnest(cat) except select unnest(w.camos));
      if jsonb_typeof(t) = 'number' then cr := cr + ceil(price * (t #>> '{}')::numeric)::int;
      elsif t in ('"pick"', '"random"') and cardinality(free) <= w.picks then cr := cr + price; -- все камуфляжи уже свои или ждут выбора
      elsif t = '"pick"' then pk := 1;
      elsif t = '"random"' then cm := free[1 + floor(random() * cardinality(free))::int];
      end if;
      update airdef_wallet set crystals = crystals + cr, picks = picks + pk, camos = case when cm is null then camos else camos || cm end, updated_at = now()
        where player_id = r.player_id;
      insert into airdef_season_paid (season, player_id, place, points, n, crystals, camo, pick) values (s, r.player_id, r.pl, r.pts, r.n, cr, cm, pk);
      tot := tot + cr; np := np + 1;
    end loop;
    insert into airdef_season_done (season, players, crystals) values (s, np, tot);
    done := done || s;
  end loop;
  return done;
end $$;

-- права — как в 019–023: только service_role. Проверка после применения (всё false):
--   select has_function_privilege('anon', 'airdef_season_settle(jsonb)', 'execute'), has_function_privilege('authenticated', 'airdef_season_settle(jsonb)', 'execute');
revoke execute on function airdef_season_settle(jsonb) from public, anon, authenticated;
grant execute on function airdef_season_settle(jsonb) to service_role;
grant all privileges on airdef_wallet, airdef_season_paid, airdef_season_done to service_role;
