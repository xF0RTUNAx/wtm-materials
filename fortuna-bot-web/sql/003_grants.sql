-- service_role — единственная роль с прямым доступом к таблицам (используется только
-- внутри Edge Functions). anon/authenticated намеренно не получают ничего:
-- весь доступ идёт через серверные функции, как в fortuna-game.
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

alter default privileges in schema public
  grant all privileges on tables to service_role;
alter default privileges in schema public
  grant all privileges on sequences to service_role;
