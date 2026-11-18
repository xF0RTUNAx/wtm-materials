-- 033: поддержка игроков «Воздушного превосходства» (Mark 2026-11-18): обращения с аккаунта игры, переписка, ответы из Telegram.
-- Применить: SUPABASE_ACCESS_TOKEN= supabase db query --linked --workdir . -f sql/033_support.sql
-- Доступ - только у функции airdef-support (service role); анониму и сайту таблицы закрыты (RLS без политик + revoke).
-- Файлы лежат не здесь, а в Cloudflare R2 (хранилище airdef-support, Worker tools/airdef-support-worker): в сообщении - только описание файла и ключ.
-- Удаление аккаунта игры (players) удаляет обращения каскадом; файлы в R2 удаляет airdef-account (delete) по префиксу p/<player_id>/.

create table if not exists support_tickets (
  id            bigserial primary key,
  player_id     uuid not null references players(id) on delete cascade,
  topic         text not null check (topic in ('bug', 'account', 'purchase', 'player', 'idea')),
  title         text not null,
  status        text not null default 'new' check (status in ('draft', 'new', 'answered', 'closed')), -- draft - пока грузятся файлы (до 'sent')
  unread_player boolean not null default false,                 -- есть ответ поддержки, игрок ещё не открыл
  lang          text,
  meta          jsonb not null default '{}'::jsonb,              -- версия, устройство, графика, бой, ошибки страницы
  notified      boolean not null default false,                  -- уведомление в Telegram ушло
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists support_tickets_player on support_tickets (player_id, updated_at desc);
create index if not exists support_tickets_unnotified on support_tickets (notified) where not notified;

create table if not exists support_messages (
  id         bigserial primary key,
  ticket_id  bigint not null references support_tickets(id) on delete cascade,
  author     text not null check (author in ('player', 'support')),
  body       text not null,
  files      jsonb not null default '[]'::jsonb,                 -- [{ key, name, size, type }]
  sent       boolean not null default false,                     -- файлы загружены, сообщение показано (у поддержки - сразу)
  bytes      bigint not null default 0,                          -- сумма размеров файлов (лимит в сутки)
  created_at timestamptz not null default now()
);
create index if not exists support_messages_ticket on support_messages (ticket_id, id);

-- сообщения бота в Telegram → обращение (ответ на любое из них - ответ игроку)
create table if not exists support_tg (
  tg_msg_id  bigint primary key,
  ticket_id  bigint not null references support_tickets(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- служебное состояние (вебхук бота)
create table if not exists support_state (
  k text primary key,
  v text not null,
  updated_at timestamptz not null default now()
);

alter table support_tickets enable row level security;
alter table support_messages enable row level security;
alter table support_tg enable row level security;
alter table support_state enable row level security;
revoke all on support_tickets, support_messages, support_tg, support_state from anon, authenticated;
revoke all on sequence support_tickets_id_seq, support_messages_id_seq from anon, authenticated;
