-- Ключи сессий аккаунтов игры (Mark 2026-11-17: «переделай на секретный ключ сессии»; аудит: player_id утекал через публичную ленту
-- сайта, а функции игры принимали его как ключ). Ключ - 32 случайных байта, у клиента - сам ключ, в базе - только SHA-256 (hex);
-- срок 90 дней, продлевается при использовании; не больше 10 устройств на игрока (_shared/airdef-session.ts). anon - без доступа.
create table if not exists airdef_sessions (
  token_hash text primary key,
  player_id  uuid not null references players(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_used  timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '90 days'
);
create index if not exists idx_airdef_sessions_player on airdef_sessions (player_id, last_used desc);
alter table airdef_sessions enable row level security;
revoke all on airdef_sessions from anon, authenticated;
grant all privileges on airdef_sessions to service_role;
