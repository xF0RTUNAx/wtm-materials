-- Права service_role (edge-функции) на таблицы из 018_drone_rewards.sql.
-- 018 применялась через `supabase db query` (временная роль CLI), и права по умолчанию из 003_grants.sql
-- на новые таблицы не распространились: drone-state и operation падали с «Внутренняя ошибка сервера».
-- Применить: supabase db query --linked --workdir . < sql/019_drone_grants.sql
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
