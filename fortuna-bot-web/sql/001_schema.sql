-- Fortuna Bot Web — базовая схема (v1)
-- Источник истины по игровой экономике: ../ECONOMY_CATALOG.md
-- Модерация, Сад Сакур, Теневой рейд, /gift — сознательно не переносятся.

create extension if not exists pgcrypto;

-- ── Игроки сайта (собственный логин/пароль, независимо от Telegram) ──
create table players (
  id uuid primary key default gen_random_uuid(),
  login text unique not null,
  password_hash text not null,
  full_name text,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

-- ── Валюты, ресурсы, кулдауны — 1:1 с игроком ──
create table player_economy (
  player_id uuid primary key references players(id) on delete cascade,

  loot_points bigint not null default 0,
  tu4_points bigint not null default 0,
  fireball_kills bigint not null default 0,
  radiofugas_kills bigint not null default 0,
  keys_current bigint not null default 0,
  keys_lifetime bigint not null default 0,
  details bigint not null default 0,

  last_loot_farm timestamptz,
  last_fireball_farm timestamptz,
  last_radiofugas_farm timestamptz,
  last_meladze_farm timestamptz,
  last_key_given timestamptz,
  last_equip_swap timestamptz,

  spin_count int not null default 0,
  spin_day date,

  active_equipment text,

  updated_at timestamptz not null default now()
);

-- ── Каталог предметов магазина + легендарных (из контейнеров/мини-игры) ──
-- effect-логика живёт в коде Edge Functions (как в main.py), эта таблица — источник
-- правды по названию/цене/описанию/владению, не по формулам.
create table shop_items (
  slug text primary key,
  name text not null,                 -- точная строка, как в старом inventory бота
  category text not null check (category in ('shop', 'legendary')),
  price int not null default 0,       -- 0 для legendary (не продаются, только дроп)
  requires_slug text references shop_items(slug),
  description text not null
);

create table player_items (
  player_id uuid not null references players(id) on delete cascade,
  item_slug text not null references shop_items(slug),
  acquired_at timestamptz not null default now(),
  primary key (player_id, item_slug)
);

-- ── Оборудование (крафт за детали, один активный) ──
create table equipment_items (
  slug text primary key,
  name text not null,
  price_details int not null,
  description text not null
);

alter table player_economy
  add constraint player_economy_active_equipment_fkey
  foreign key (active_equipment) references equipment_items(slug);

create table player_equipment (
  player_id uuid not null references players(id) on delete cascade,
  equipment_slug text not null references equipment_items(slug),
  crafted_at timestamptz not null default now(),
  primary key (player_id, equipment_slug)
);

-- ── Обычные рейды (глобальный босс, как в боте — один активный рейд) ──
create table raids (
  id bigserial primary key,
  rtype text not null check (rtype in ('normal', 'hard', '13', 'ca')),
  max_hp bigint not null,
  hp bigint not null,
  status text not null default 'active' check (status in ('active', 'victory', 'defeat', 'stopped')),
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  finished_at timestamptz
);

create table raid_participants (
  raid_id bigint not null references raids(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  has_weapon boolean not null default false,
  damage_dealt bigint not null default 0,
  attack_count int not null default 0,
  last_attack timestamptz,
  free_attack boolean not null default false,
  primary key (raid_id, player_id)
);

-- ── Разовый перенос прогресса из Telegram-бота ──
create table legacy_progress (
  telegram_user_id bigint primary key,
  telegram_username text,
  snapshot jsonb not null,            -- полный снимок: монеты/ключи/инвентарь/экипировка и т.д.
  claimed boolean not null default false,
  claimed_by_player_id uuid references players(id),
  claimed_at timestamptz,
  imported_at timestamptz not null default now()
);

create table migration_codes (
  code text primary key,
  telegram_user_id bigint not null references legacy_progress(telegram_user_id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used boolean not null default false,
  used_by_player_id uuid references players(id),
  used_at timestamptz
);

create index idx_migration_codes_telegram_user on migration_codes(telegram_user_id);
create index idx_player_items_player on player_items(player_id);
create index idx_raid_participants_player on raid_participants(player_id);
