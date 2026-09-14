-- Публичная лента событий — замена "видимости в чате" для ивентов, которые раньше
-- были на глазах у всех в Telegram. Читается напрямую через anon (без Edge Function),
-- имя игрока денормализовано в detail на момент события (не джойним players для anon).
create table activity_feed (
  id bigserial primary key,
  event_type text not null check (event_type in ('strong_man', 'weak_man', 'anime_girl', 'auto_key', 'horseshoe')),
  target_player_id uuid references players(id),
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index idx_activity_feed_created on activity_feed (created_at desc);

alter table activity_feed enable row level security;
create policy "anon can read activity_feed" on activity_feed for select to anon using (true);

grant select on activity_feed to anon;
grant all privileges on activity_feed to service_role;
grant usage, select on sequence activity_feed_id_seq to service_role;
