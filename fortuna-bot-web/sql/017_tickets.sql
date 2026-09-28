-- Билеты на игры с наградой (5 в день, сброс в полночь МСК, не копятся).
-- Тратятся: слот Фортуны (minigame-spin, по-прежнему максимум 3 попытки в день), Стратег,
-- Морской бой, дрон-игра. Тренировочные режимы бесплатны.
-- Лимит (p_daily) передаётся из Edge Functions (_shared/tickets.ts: DAILY_TICKETS) — единый источник.
alter table player_economy add column if not exists tickets_day date;
alter table player_economy add column if not exists tickets_used int not null default 0;

-- Партия на награду: билет списывается в момент старта, награда выдаётся только по run_id
-- (один раз). Заодно хранит зерно (seed) для детерминированной генерации волн в дрон-игре.
create table if not exists game_runs (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  game text not null,
  seed bigint not null default floor(random() * 2147483647)::bigint,
  started_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open', 'claimed')),
  claimed_at timestamptz,
  result jsonb
);
create index if not exists game_runs_player_idx on game_runs (player_id, started_at desc);
alter table game_runs enable row level security;

-- Дата "сегодня" по Москве — граница суток для билетов и попыток слота.
create or replace function msk_today() returns date language sql stable as $$
  select (now() at time zone 'Europe/Moscow')::date
$$;

-- Атомарное списание одного билета. Возвращает сколько билетов осталось, либо -1 если нет.
create or replace function spend_ticket(p_player_id uuid, p_daily int)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_today date := msk_today();
  v_used int;
begin
  update player_economy set
    tickets_used = case when tickets_day = v_today then tickets_used + 1 else 1 end,
    tickets_day = v_today,
    updated_at = now()
  where player_id = p_player_id
    and (tickets_day is distinct from v_today or tickets_used < p_daily)
  returning tickets_used into v_used;
  if not found then return -1; end if;
  return p_daily - v_used;
end $$;

-- Возврат билета (если после списания операция не удалась по нашей вине).
create or replace function refund_ticket(p_player_id uuid)
returns void language sql security definer set search_path = public as $$
  update player_economy set tickets_used = greatest(tickets_used - 1, 0), updated_at = now()
  where player_id = p_player_id and tickets_day = msk_today();
$$;

-- Старт партии на награду: билет + запись game_runs в одной транзакции.
create or replace function start_game_run(p_player_id uuid, p_game text, p_daily int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_left int;
  v_run game_runs%rowtype;
begin
  v_left := spend_ticket(p_player_id, p_daily);
  if v_left < 0 then
    return jsonb_build_object('error', 'no_tickets');
  end if;
  insert into game_runs (player_id, game) values (p_player_id, p_game) returning * into v_run;
  return jsonb_build_object('run_id', v_run.id, 'seed', v_run.seed, 'tickets_left', v_left);
end $$;

revoke all on function spend_ticket(uuid, int) from public;
revoke all on function refund_ticket(uuid) from public;
revoke all on function start_game_run(uuid, text, int) from public;
grant execute on function spend_ticket(uuid, int) to service_role;
grant execute on function refund_ticket(uuid) to service_role;
grant execute on function start_game_run(uuid, text, int) to service_role;
