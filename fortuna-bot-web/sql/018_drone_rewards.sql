-- «Симулятор Летки»: ракеты за детали, награды за вылеты и онлайн-бои, общая цель — операция «Истребительная угроза».
-- Правила — ONLINE_PLAN.md («Награды»); цены ракет и награды за бой — supabase/functions/_shared/drone.ts.
-- Применить: supabase db query --linked --workdir . < sql/018_drone_rewards.sql

-- ── Купленные ракеты (базовые открыты всем и сюда не пишутся) ──
create table if not exists drone_missiles (
  player_id uuid not null references players(id) on delete cascade,
  missile text not null,
  price int not null,
  bought_at timestamptz not null default now(),
  primary key (player_id, missile)
);
alter table drone_missiles enable row level security;

-- ── Вылеты: у дрон-игры каждый вылет — строка game_runs (с билетом — ranked, без билета — только в зачёт операции) ──
alter table game_runs add column if not exists ranked boolean not null default true;
alter table game_runs add column if not exists mode text;

-- ── Онлайн-бои, результат которых уже засчитан (результат подписан игровым сервером секретом MP_SECRET) ──
create table if not exists mp_claims (
  match_id text not null,
  player_id uuid not null references players(id) on delete cascade,
  claimed_at timestamptz not null default now(),
  rewarded boolean not null default false,
  result jsonb,
  primary key (match_id, player_id)
);
create index if not exists mp_claims_player_idx on mp_claims (player_id, claimed_at desc);
alter table mp_claims enable row level security;

-- ── Операция: общая цель всех игроков ──
-- Шаг = goal / steps очков. За каждый шаг — всем с вкладом ≥ min_contrib: step_details; каждый 5-й — ещё step5_keys;
-- последний шаг вместо обычной награды — final_details + final_keys; после финала топ-3 по вкладу — top_bonus[место]
-- деталей и столько же ключей. Награды забирают кнопкой (operation_claim).
create table if not exists operations (
  id serial primary key,
  name text not null,
  goal int not null,
  steps int not null,
  points bigint not null default 0,
  min_contrib int not null default 20,
  step_details int not null default 15,
  step5_keys int not null default 15,
  final_details int not null default 50,
  final_keys int not null default 50,
  top_bonus int[] not null default '{30,20,10}',
  status text not null default 'active' check (status in ('active', 'finished', 'stopped')),
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create unique index if not exists operations_one_active on operations ((true)) where status = 'active';
alter table operations enable row level security;

create table if not exists operation_contrib (
  op_id int not null references operations(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  points bigint not null default 0,
  day date,                       -- сутки (МСК) и очки из одиночных вылетов за эти сутки — предел против накрутки
  day_solo int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (op_id, player_id)
);
create index if not exists operation_contrib_rank_idx on operation_contrib (op_id, points desc, updated_at);
alter table operation_contrib enable row level security;

create table if not exists operation_claims (
  op_id int not null references operations(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  step int not null,              -- номер шага; 1000 + место — бонус топ-3
  details int not null default 0,
  keys int not null default 0,
  claimed_at timestamptz not null default now(),
  primary key (op_id, player_id, step)
);
alter table operation_claims enable row level security;

-- первая операция
insert into operations (name, goal, steps)
select 'Истребительная угроза', 30000, 25
where not exists (select 1 from operations);

-- ── Покупка ракеты: детали списываются атомарно; цена — из edge-функции (_shared/drone.ts) ──
create or replace function drone_buy_missile(p_player_id uuid, p_missile text, p_price int)
returns text language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from drone_missiles where player_id = p_player_id and missile = p_missile) then return 'owned'; end if;
  update player_economy set details = details - p_price, updated_at = now()
  where player_id = p_player_id and details >= p_price;
  if not found then return 'no_details'; end if;
  insert into drone_missiles (player_id, missile, price) values (p_player_id, p_missile, p_price);
  return 'ok';
end $$;

-- ── Начало вылета: с билетом (если просили и он есть) или без — вылет всё равно идёт в зачёт операции ──
create or replace function drone_start_run(p_player_id uuid, p_mode text, p_ranked boolean, p_daily int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_left int := null;
  v_ranked boolean := false;
  v_run game_runs%rowtype;
begin
  if p_ranked then
    v_left := spend_ticket(p_player_id, p_daily);
    v_ranked := v_left >= 0;
  end if;
  insert into game_runs (player_id, game, ranked, mode) values (p_player_id, 'drone', v_ranked, p_mode) returning * into v_run;
  return jsonb_build_object('run_id', v_run.id, 'seed', v_run.seed, 'ranked', v_ranked, 'tickets_left', greatest(coalesce(v_left, -1), -1));
end $$;

-- ── Выдача награды за бой: детали, ключи; бонусный билет — вернуть потраченный сегодня, а если не тратились — 1 ключ ──
create or replace function drone_grant(p_player_id uuid, p_details int, p_keys int, p_bonus_ticket boolean)
returns text language plpgsql security definer set search_path = public as $$
declare v_ticket text := null;
begin
  if p_bonus_ticket then
    update player_economy set tickets_used = tickets_used - 1
    where player_id = p_player_id and tickets_day = msk_today() and tickets_used > 0;
    if found then v_ticket := 'ticket'; else v_ticket := 'key'; end if;
  end if;
  update player_economy set
    details = details + p_details,
    keys_current = keys_current + p_keys + case when v_ticket = 'key' then 1 else 0 end,
    keys_lifetime = keys_lifetime + p_keys + case when v_ticket = 'key' then 1 else 0 end,
    updated_at = now()
  where player_id = p_player_id;
  return coalesce(v_ticket, '');
end $$;

-- ── Очки в операцию. p_solo — очки одиночного вылета (у них суточный предел p_solo_cap против накрутки;
--    онлайн-результаты подписаны сервером и предела не имеют). Возвращает шаг до и после ──
create or replace function operation_add_points(p_player_id uuid, p_points int, p_solo boolean, p_solo_cap int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_op operations%rowtype;
  v_today date := msk_today();
  v_pts int := greatest(p_points, 0);
  v_row operation_contrib%rowtype;
  v_before int;
  v_after int;
begin
  select * into v_op from operations where status = 'active' for update;
  if not found or v_pts = 0 then return null; end if;
  insert into operation_contrib (op_id, player_id, points, day, day_solo) values (v_op.id, p_player_id, 0, v_today, 0)
  on conflict (op_id, player_id) do nothing;
  select * into v_row from operation_contrib where op_id = v_op.id and player_id = p_player_id for update;
  if v_row.day is distinct from v_today then v_row.day_solo := 0; end if;
  if p_solo then v_pts := least(v_pts, greatest(p_solo_cap - v_row.day_solo, 0)); end if;
  if v_pts = 0 then return jsonb_build_object('op_id', v_op.id, 'added', 0, 'capped', true); end if;
  update operation_contrib set points = points + v_pts, day = v_today,
    day_solo = case when p_solo then v_row.day_solo + v_pts else v_row.day_solo end, updated_at = now()
  where op_id = v_op.id and player_id = p_player_id;
  v_before := least(v_op.steps, (v_op.points * v_op.steps / v_op.goal)::int);
  update operations set points = points + v_pts where id = v_op.id returning * into v_op;
  v_after := least(v_op.steps, (v_op.points * v_op.steps / v_op.goal)::int);
  if v_op.points >= v_op.goal then update operations set status = 'finished', finished_at = now() where id = v_op.id; end if;
  return jsonb_build_object('op_id', v_op.id, 'name', v_op.name, 'added', v_pts, 'points', v_op.points, 'goal', v_op.goal,
    'steps', v_op.steps, 'step_before', v_before, 'step_after', v_after, 'capped', v_pts < p_points);
end $$;

-- ── Забрать награды операции (последней — активной или только что завершённой) ──
create or replace function operation_claim(p_player_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_op operations%rowtype;
  v_contrib bigint;
  v_reached int;
  v_s int;
  v_d int; v_k int;
  v_total_d int := 0; v_total_k int := 0;
  v_rank int;
  v_claimed int[] := '{}';
begin
  select * into v_op from operations where status in ('active', 'finished') order by id desc limit 1;
  if not found then return jsonb_build_object('error', 'no_operation'); end if;
  select points into v_contrib from operation_contrib where op_id = v_op.id and player_id = p_player_id;
  if coalesce(v_contrib, 0) < v_op.min_contrib then
    return jsonb_build_object('error', 'low_contrib', 'need', v_op.min_contrib, 'have', coalesce(v_contrib, 0));
  end if;
  v_reached := least(v_op.steps, (v_op.points * v_op.steps / v_op.goal)::int);
  for v_s in 1..v_reached loop
    if exists (select 1 from operation_claims where op_id = v_op.id and player_id = p_player_id and step = v_s) then continue; end if;
    if v_s = v_op.steps then v_d := v_op.final_details; v_k := v_op.final_keys;
    elsif v_s % 5 = 0 then v_d := v_op.step_details; v_k := v_op.step5_keys;
    else v_d := v_op.step_details; v_k := 0; end if;
    insert into operation_claims (op_id, player_id, step, details, keys) values (v_op.id, p_player_id, v_s, v_d, v_k);
    v_total_d := v_total_d + v_d; v_total_k := v_total_k + v_k; v_claimed := v_claimed || v_s;
  end loop;
  if v_op.status = 'finished' then
    select r into v_rank from (
      select player_id, row_number() over (order by points desc, updated_at asc) as r from operation_contrib where op_id = v_op.id
    ) t where player_id = p_player_id;
    if v_rank is not null and v_rank <= coalesce(array_length(v_op.top_bonus, 1), 0)
       and not exists (select 1 from operation_claims where op_id = v_op.id and player_id = p_player_id and step = 1000 + v_rank) then
      v_d := v_op.top_bonus[v_rank]; v_k := v_op.top_bonus[v_rank];
      insert into operation_claims (op_id, player_id, step, details, keys) values (v_op.id, p_player_id, 1000 + v_rank, v_d, v_k);
      v_total_d := v_total_d + v_d; v_total_k := v_total_k + v_k; v_claimed := v_claimed || (1000 + v_rank);
    end if;
  end if;
  if v_total_d > 0 or v_total_k > 0 then
    update player_economy set details = details + v_total_d, keys_current = keys_current + v_total_k,
      keys_lifetime = keys_lifetime + v_total_k, updated_at = now() where player_id = p_player_id;
  end if;
  return jsonb_build_object('op_id', v_op.id, 'details', v_total_d, 'keys', v_total_k, 'steps', v_claimed);
end $$;

-- ── Новая операция (админ): закрывает текущую без наград за недобранные шаги ──
create or replace function operation_start(p_name text, p_goal int, p_steps int)
returns int language plpgsql security definer set search_path = public as $$
declare v_id int;
begin
  update operations set status = 'stopped', finished_at = now() where status = 'active';
  insert into operations (name, goal, steps) values (p_name, p_goal, p_steps) returning id into v_id;
  return v_id;
end $$;

revoke all on function drone_buy_missile(uuid, text, int) from public;
revoke all on function drone_start_run(uuid, text, boolean, int) from public;
revoke all on function drone_grant(uuid, int, int, boolean) from public;
revoke all on function operation_add_points(uuid, int, boolean, int) from public;
revoke all on function operation_claim(uuid) from public;
revoke all on function operation_start(text, int, int) from public;
grant execute on function drone_buy_missile(uuid, text, int) to service_role;
grant execute on function drone_start_run(uuid, text, boolean, int) to service_role;
grant execute on function drone_grant(uuid, int, int, boolean) to service_role;
grant execute on function operation_add_points(uuid, int, boolean, int) to service_role;
grant execute on function operation_claim(uuid) to service_role;
grant execute on function operation_start(text, int, int) to service_role;
