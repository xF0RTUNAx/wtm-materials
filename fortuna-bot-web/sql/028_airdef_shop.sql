-- «Воздушное превосходство»: магазин окрасок, этап 2 (Mark 2026-10-26/27: «покупку надо обязательно доделать» — до конца сезона 1, 01.01.2027).
-- Кошелёк — sql/024 (airdef_wallet: кристаллы, свои окраски 'самолёт:окраска', picks — окраски «на выбор» за 1-е место). Здесь: надетые окраски
-- (worn: самолёт → окраска) и три действия функции airdef-shop — купить за кристаллы, взять на выбор, надеть / снять. Всё списание — одним
-- update с проверкой в where (два нажатия сразу не спишут дважды и не уведут кристаллы в минус). Каталог и цена — arsenal.js (CAMOS, CAMO_PRICE):
-- функция передаёт окраски, которые сейчас в магазине (вышедшие к текущему сезону), — купить «будущую» нельзя.
-- Применить: SUPABASE_ACCESS_TOKEN= supabase db query --linked --workdir . -f sql/028_airdef_shop.sql
-- Проверка без боевой базы: deno run -A tools/airdef-headless/shop-sql-test.js

alter table airdef_wallet add column if not exists worn jsonb not null default '{}'::jsonb;

-- ответ всем трём: кошелёк после действия (как отдаёт 'state') или ошибка { error: код }
create or replace function airdef_wallet_view(p_player uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_build_object('crystals', w.crystals, 'camos', to_jsonb(w.camos), 'picks', w.picks, 'worn', w.worn)
    from airdef_wallet w where w.player_id = p_player), jsonb_build_object('crystals', 0, 'camos', '[]'::jsonb, 'picks', 0, 'worn', '{}'::jsonb));
$$;

-- купить: окраска в магазине (p_catalog), ещё не своя, кристаллов хватает. Коды ошибок: not_sold, owned, no_crystals
create or replace function airdef_shop_buy(p_player uuid, p_camo text, p_price int, p_catalog text[]) returns jsonb language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_price is null or p_price <= 0 then raise exception 'bad_price'; end if;
  if p_camo is null or not (p_camo = any(p_catalog)) then return jsonb_build_object('error', 'not_sold'); end if;
  insert into airdef_wallet (player_id) values (p_player) on conflict do nothing;
  update airdef_wallet set crystals = crystals - p_price, camos = camos || p_camo, updated_at = now()
    where player_id = p_player and crystals >= p_price and not (p_camo = any(camos));
  get diagnostics n = row_count;
  if n = 0 then
    return jsonb_build_object('error', case when exists (select 1 from airdef_wallet where player_id = p_player and p_camo = any(camos)) then 'owned' else 'no_crystals' end);
  end if;
  return jsonb_build_object('wallet', airdef_wallet_view(p_player));
end $$;

-- взять на выбор (награда за 1-е место — picks): любая окраска магазина, которой нет. Коды: not_sold, owned, no_pick
create or replace function airdef_shop_pick(p_player uuid, p_camo text, p_catalog text[]) returns jsonb language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_camo is null or not (p_camo = any(p_catalog)) then return jsonb_build_object('error', 'not_sold'); end if;
  update airdef_wallet set picks = picks - 1, camos = camos || p_camo, updated_at = now()
    where player_id = p_player and picks > 0 and not (p_camo = any(camos));
  get diagnostics n = row_count;
  if n = 0 then
    return jsonb_build_object('error', case when exists (select 1 from airdef_wallet where player_id = p_player and p_camo = any(camos)) then 'owned' else 'no_pick' end);
  end if;
  return jsonb_build_object('wallet', airdef_wallet_view(p_player));
end $$;

-- надеть (p_skin — своя окраска этого самолёта) или снять (p_skin null). Код: not_owned
create or replace function airdef_shop_wear(p_player uuid, p_plane text, p_skin text) returns jsonb language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_plane is null or p_plane !~ '^[a-z0-9_]{1,24}$' then raise exception 'bad_plane'; end if;
  if p_skin is null then
    update airdef_wallet set worn = worn - p_plane, updated_at = now() where player_id = p_player;
  else
    update airdef_wallet set worn = worn || jsonb_build_object(p_plane, p_skin), updated_at = now()
      where player_id = p_player and (p_plane || ':' || p_skin) = any(camos);
    get diagnostics n = row_count;
    if n = 0 then return jsonb_build_object('error', 'not_owned'); end if;
  end if;
  return jsonb_build_object('wallet', airdef_wallet_view(p_player));
end $$;

-- права — как в 019–027: только service_role. Проверка после применения (всё false):
--   select has_function_privilege('anon', 'airdef_shop_buy(uuid,text,int,text[])', 'execute'), has_function_privilege('authenticated', 'airdef_shop_wear(uuid,text,text)', 'execute');
revoke execute on function airdef_wallet_view(uuid) from public, anon, authenticated;
revoke execute on function airdef_shop_buy(uuid, text, int, text[]) from public, anon, authenticated;
revoke execute on function airdef_shop_pick(uuid, text, text[]) from public, anon, authenticated;
revoke execute on function airdef_shop_wear(uuid, text, text) from public, anon, authenticated;
grant execute on function airdef_wallet_view(uuid), airdef_shop_buy(uuid, text, int, text[]), airdef_shop_pick(uuid, text, text[]), airdef_shop_wear(uuid, text, text) to service_role;
