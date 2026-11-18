-- 036: очередь стирания копий обращений в Telegram (Mark 2026-11-18: «через бота настрой удаление через 30 дней»).
-- Игрок удалил аккаунт - airdef-account ставит сюда номера сообщений бота по его обращениям (support_tg) ДО удаления, потом бот их стирает;
-- неудачные повторяет airdef-support при каждом вызове, через 30 дней запись уходит из очереди (_shared/support-tg-purge.ts).
-- Ссылки на игрока нет: очередь переживает удаление аккаунта; в ней только номера сообщений.
-- Применить: SUPABASE_ACCESS_TOKEN= supabase db query --linked --workdir . -f sql/036_support_tg_purge.sql
create table if not exists support_tg_purge (
  tg_msg_id  bigint primary key,
  tries      int not null default 0,
  created_at timestamptz not null default now()
);
alter table support_tg_purge enable row level security;
revoke all on support_tg_purge from anon, authenticated;
grant select, insert, update, delete on support_tg_purge to service_role;
