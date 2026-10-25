-- «Воздушное превосходство»: «Удары» без рангов (Mark 2026-10-25) — первый узел каждой ветки стал стартовым (открыт и бесплатен).
-- Кто успел исследовать / купить то, что стало стартовым, получает обратно потраченное по СТАРОЙ цене (ранг × 5,5: II — 5 500, III — 13 800).
-- Применить: SUPABASE_ACCESS_TOKEN= supabase db query --linked --workdir . -f sql/023_airdef_multi_starters.sql
-- ПОРЯДОК: сначала задеплоить функции airdef-progress / airdef-solo / airdef-claim / airdef-account (с новым _shared/airdef/progress.js), потом применять этот файл.
-- ЗАПУСКАТЬ РОВНО ОДИН РАЗ (ревью): журнал — по id игрока, а перенос аккаунта (airdef_transfer) переносит res / own на аккаунт игры — повторный запуск после
-- переноса вернул бы второй раз. Применён — отметить в AIRDEF_STATE.md.
-- Разовый и повторяемый безопасно: каждому игроку и узлу возврат выдаётся один раз (airdef_refund_log, ключ player_id + key); повторный запуск ничего не добавит.
--
-- Старые цены (ранг в прежнем дереве → round(COST.small[ранг−1] × 5,5 / 100) × 100):
--   strike:kh55_s, strike:kh55d, strike:lance — ранг II → 5 500;  strike:jsow, strike:uav_w — ранг III → 13 800.
-- Опыт возвращается, если узел в res (исследован), серебро — если в own (куплен). Сами записи res / own не трогаем (лишние стартовые id игра отбрасывает
-- по флагу start; так откат функций не даст купить дважды). Цель ветки, указывающую на ставший стартовым узел, снимаем.
create table if not exists airdef_refund_log (
  player_id uuid not null references players(id) on delete cascade,
  key       text not null,                       -- id узла ('strike:lance')
  xp        int  not null default 0,             -- возвращённый опыт
  silver    int  not null default 0,             -- возвращённое серебро
  at        timestamptz not null default now(),
  primary key (player_id, key)
);
alter table airdef_refund_log enable row level security;

-- вернуть потраченное; результат — сколько игроков и сколько выдано (повторный вызов: 0 игроков)
create or replace function airdef_multi_starters_refund() returns table (n_players int, sum_xp bigint, sum_silver bigint)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with old_price(id, price) as (values
    ('strike:kh55_s', 5500), ('strike:kh55d', 5500), ('strike:lance', 5500), ('strike:jsow', 13800), ('strike:uav_w', 13800)),
  ins as (
    insert into airdef_refund_log (player_id, key, xp, silver)
    select p.player_id, o.id, case when o.id = any (p.res) then o.price else 0 end, case when o.id = any (p.own) then o.price else 0 end
      from airdef_progress p join old_price o on o.id = any (p.res) or o.id = any (p.own)
    on conflict (player_id, key) do nothing
    returning player_id, key, xp, silver),
  sums as (select i.player_id, sum(i.xp)::int as xp, sum(i.silver)::int as silver from ins i group by i.player_id),
  upd as (
    update airdef_progress p
       set xp = p.xp + s.xp, silver = p.silver + s.silver, version = p.version + 1, updated_at = now(),
           goal = coalesce((select jsonb_object_agg(g.key, g.value) from jsonb_each(p.goal) g where (g.value #>> '{}') not in (select id from old_price)), '{}'::jsonb)
      from sums s where p.player_id = s.player_id
    returning p.player_id)
  select count(*)::int, coalesce(sum(s.xp), 0)::bigint, coalesce(sum(s.silver), 0)::bigint from sums s;
end $$;

revoke all on airdef_refund_log from public, anon, authenticated;
revoke execute on function airdef_multi_starters_refund() from public, anon, authenticated;
grant all privileges on airdef_refund_log to service_role;
grant execute on function airdef_multi_starters_refund() to service_role;

select * from airdef_multi_starters_refund();

-- цель ветки на ставший стартовым узел — снять у всех (у кого не было возврата — тоже; иначе осталась бы навсегда; ревью)
update airdef_progress p set goal = coalesce((select jsonb_object_agg(g.key, g.value) from jsonb_each(p.goal) g where (g.value #>> '{}') not in ('strike:kh55_s', 'strike:kh55d', 'strike:lance', 'strike:jsow', 'strike:uav_w')), '{}'::jsonb),
       version = p.version + 1, updated_at = now()
 where exists (select 1 from jsonb_each(p.goal) g where (g.value #>> '{}') in ('strike:kh55_s', 'strike:kh55d', 'strike:lance', 'strike:jsow', 'strike:uav_w'));
