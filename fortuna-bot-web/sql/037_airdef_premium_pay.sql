-- «Воздушное превосходство»: премиум-аккаунт и покупки за Telegram Stars (Mark 2026-11-18/19).
-- Что продаём и почём - arsenal.js PAY (функция передаёт сюда уже проверенные числа). Порядок оплаты:
--   1) игра просит счёт (airdef-shop 'invoice') → строка airdef_orders (status 'new') → ссылка на счёт Telegram (createInvoiceLink, XTR);
--   2) Telegram спрашивает бота перед списанием (pre_checkout_query) → airdef_pay_check: заказ есть, новый, сумма та;
--   3) звёзды списаны (successful_payment) → airdef_pay_credit: премиум или кристаллы, заказ 'paid' - одним действием под замком строки заказа;
--      повтор того же сообщения Telegram (тот же charge id) второй раз не начислит;
--   4) возврат (только Mark: /refund в боте → refundStarPayment) → airdef_pay_refund: снять, что ещё не потрачено.
-- Удалил аккаунт - строки заказов остаются без игрока (player_id → null): учёт покупок и возвратов.
-- Применить: SUPABASE_ACCESS_TOKEN= supabase db query --linked --workdir . -f sql/037_airdef_premium_pay.sql
-- Проверка без боевой базы: deno run -A tools/airdef-headless/pay-sql-test.js

alter table airdef_wallet add column if not exists premium_until timestamptz;
alter table airdef_wallet add column if not exists prem_day date; -- день (по Москве) последнего кристалла за вход

create table if not exists airdef_orders (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid references players(id) on delete set null,
  sku         text not null check (sku ~ '^[a-z0-9_]{1,24}$'),
  stars       int  not null check (stars > 0),
  prem_days   int  not null default 0 check (prem_days >= 0),
  gems        int  not null default 0 check (gems >= 0),
  status      text not null default 'new' check (status in ('new', 'paid', 'refunded')),
  charge_id   text unique,          -- telegram_payment_charge_id: по нему возврат и защита от повтора
  tg_user     bigint,               -- кто платил в Telegram (для refundStarPayment)
  created_at  timestamptz not null default now(),
  paid_at     timestamptz,
  refunded_at timestamptz,
  prem_from   timestamptz,          -- премиум: с какого момента продлён (для возврата)
  prem_to     timestamptz,
  consent_at  timestamptz           -- премиум: когда игрок согласился на немедленный старт (без этого право отказа в ЕС не снимается)
);
alter table airdef_orders add column if not exists consent_at timestamptz;
create index if not exists airdef_orders_player on airdef_orders (player_id, created_at desc);
alter table airdef_orders enable row level security;

-- кошелёк для игры: + premium_until (null - премиума нет или кончился)
create or replace function airdef_wallet_view(p_player uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_build_object('crystals', w.crystals, 'camos', to_jsonb(w.camos), 'picks', w.picks, 'worn', w.worn,
      'premium_until', case when w.premium_until > now() then w.premium_until end)
    from airdef_wallet w where w.player_id = p_player), jsonb_build_object('crystals', 0, 'camos', '[]'::jsonb, 'picks', 0, 'worn', '{}'::jsonb, 'premium_until', null));
$$;

-- новый заказ; не больше 20 неоплаченных за час на игрока (кнопку «Купить» жмут много раз - счета не плодятся без меры)
-- p_consent - галочка «премиум начнётся сразу» (для премиума обязательна, без неё - { error: 'consent' })
drop function if exists airdef_order_new(uuid, text, int, int, int);
create or replace function airdef_order_new(p_player uuid, p_sku text, p_stars int, p_days int, p_gems int, p_consent boolean default false) returns jsonb language plpgsql security definer set search_path = public as $$
declare oid uuid;
begin
  if p_stars is null or p_stars <= 0 or coalesce(p_days, 0) < 0 or coalesce(p_gems, 0) < 0 or (coalesce(p_days, 0) = 0) = (coalesce(p_gems, 0) = 0) then raise exception 'bad_order'; end if;
  if coalesce(p_days, 0) > 0 and not coalesce(p_consent, false) then return jsonb_build_object('error', 'consent'); end if;
  perform pg_advisory_xact_lock(hashtext('airdef_order:' || p_player::text));
  if (select count(*) from airdef_orders where player_id = p_player and status = 'new' and created_at > now() - interval '1 hour') >= 20 then
    return jsonb_build_object('error', 'too_many');
  end if;
  insert into airdef_orders (player_id, sku, stars, prem_days, gems, consent_at) values (p_player, p_sku, p_stars, coalesce(p_days, 0), coalesce(p_gems, 0),
    case when coalesce(p_days, 0) > 0 then now() end) returning id into oid;
  return jsonb_build_object('id', oid);
end $$;

-- перед списанием (pre_checkout_query): заказ есть, ещё не оплачен, игрок не удалён, сумма и валюта сходятся. Ответ: ok | ошибка
create or replace function airdef_pay_check(p_order uuid, p_stars int) returns text language sql stable security definer set search_path = public as $$
  select case when o.id is null then 'no_order' when o.status <> 'new' then 'not_new' when o.player_id is null then 'no_player'
    when o.stars <> p_stars then 'bad_sum' when o.created_at < now() - interval '2 days' then 'expired' else 'ok' end
  from (select 1) d left join airdef_orders o on o.id = p_order;
$$;

-- звёзды списаны: начислить. Повтор с тем же charge id - { dup: true }; другой charge id на оплаченный заказ - { error } (разбирать вручную)
create or replace function airdef_pay_credit(p_order uuid, p_charge text, p_stars int, p_tg bigint) returns jsonb language plpgsql security definer set search_path = public as $$
declare o airdef_orders; f timestamptz; t timestamptz;
begin
  if p_charge is null or length(p_charge) = 0 or length(p_charge) > 200 then raise exception 'bad_charge'; end if;
  select * into o from airdef_orders where id = p_order for update;
  if not found then return jsonb_build_object('error', 'no_order'); end if;
  if o.status <> 'new' then
    if o.charge_id = p_charge then return jsonb_build_object('dup', true, 'player', o.player_id); end if;
    return jsonb_build_object('error', 'not_new');
  end if;
  if o.stars <> p_stars then return jsonb_build_object('error', 'bad_sum'); end if;
  if o.player_id is null then
    update airdef_orders set status = 'paid', charge_id = p_charge, tg_user = p_tg, paid_at = now() where id = o.id;
    return jsonb_build_object('error', 'no_player'); -- аккаунт удалён между счётом и оплатой: деньги - вернуть (/refund)
  end if;
  insert into airdef_wallet (player_id) values (o.player_id) on conflict do nothing;
  if o.prem_days > 0 then
    select greatest(coalesce(premium_until, now()), now()) into f from airdef_wallet where player_id = o.player_id for update;
    t := f + make_interval(days => o.prem_days);
    update airdef_wallet set premium_until = t, updated_at = now() where player_id = o.player_id;
  end if;
  if o.gems > 0 then
    update airdef_wallet set crystals = crystals + o.gems, updated_at = now() where player_id = o.player_id;
  end if;
  update airdef_orders set status = 'paid', charge_id = p_charge, tg_user = p_tg, paid_at = now(), prem_from = f, prem_to = t where id = o.id;
  return jsonb_build_object('ok', true, 'player', o.player_id, 'sku', o.sku);
end $$;

-- возврат: заказ по charge id → 'refunded'; кристаллы - сколько осталось (в минус не уходят), премиум - срок этой покупки сдвигается назад
-- (не раньше «сейчас»). Ответ - что снято. Второй возврат того же - { error: 'not_paid' }
create or replace function airdef_pay_refund(p_charge text) returns jsonb language plpgsql security definer set search_path = public as $$
declare o airdef_orders; took int := 0; cut interval := interval '0';
begin
  select * into o from airdef_orders where charge_id = p_charge for update;
  if not found then return jsonb_build_object('error', 'no_order'); end if;
  if o.status <> 'paid' then return jsonb_build_object('error', 'not_paid'); end if;
  if o.player_id is not null then
    if o.gems > 0 then
      select least(crystals, o.gems) into took from airdef_wallet where player_id = o.player_id for update;
      update airdef_wallet set crystals = crystals - coalesce(took, 0), updated_at = now() where player_id = o.player_id;
    end if;
    if o.prem_days > 0 and o.prem_to is not null then
      cut := o.prem_to - o.prem_from;
      update airdef_wallet set premium_until = case when premium_until - cut > now() then premium_until - cut else now() end, updated_at = now()
        where player_id = o.player_id and premium_until is not null;
    end if;
  end if;
  update airdef_orders set status = 'refunded', refunded_at = now() where id = o.id;
  return jsonb_build_object('ok', true, 'player', o.player_id, 'sku', o.sku, 'gems', coalesce(took, 0), 'tg_user', o.tg_user, 'stars', o.stars);
end $$;

-- премиум: +1 кристалл за первый вход дня (p_day - день по Москве). 1 - начислен сейчас, 0 - уже был сегодня или премиума нет
create or replace function airdef_prem_daily(p_player uuid, p_day date) returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update airdef_wallet set crystals = crystals + 1, prem_day = p_day, updated_at = now()
    where player_id = p_player and premium_until > now() and (prem_day is null or prem_day < p_day);
  get diagnostics n = row_count;
  return n;
end $$;

-- права - только service_role (как 019-036). Проверка после применения (всё false):
--   select has_function_privilege('anon', 'airdef_pay_credit(uuid,text,int,bigint)', 'execute'), has_table_privilege('authenticated', 'airdef_orders', 'select');
revoke all on airdef_orders from public, anon, authenticated;
grant select, insert, update on airdef_orders to service_role;
revoke execute on function airdef_wallet_view(uuid) from public, anon, authenticated;
revoke execute on function airdef_order_new(uuid, text, int, int, int, boolean) from public, anon, authenticated;
revoke execute on function airdef_pay_check(uuid, int) from public, anon, authenticated;
revoke execute on function airdef_pay_credit(uuid, text, int, bigint) from public, anon, authenticated;
revoke execute on function airdef_pay_refund(text) from public, anon, authenticated;
revoke execute on function airdef_prem_daily(uuid, date) from public, anon, authenticated;
grant execute on function airdef_wallet_view(uuid), airdef_order_new(uuid, text, int, int, int, boolean), airdef_pay_check(uuid, int),
  airdef_pay_credit(uuid, text, int, bigint), airdef_pay_refund(text), airdef_prem_daily(uuid, date) to service_role;
