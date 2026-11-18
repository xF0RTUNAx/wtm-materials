-- 035: функция лимитов поддержки support_add (sql/034) - право вызова у service_role (функции Supabase). Без него любое обращение
-- падало с 500: sql/031 сняла права «по умолчанию» с новых функций, а revoke … from public в 034 убрал последний путь (Mark 2026-11-18:
-- «выдает ошибку когда пытаешься отправить сообщение в поддержку»). Аноним и сайт по-прежнему вызвать не могут.
-- Применить: SUPABASE_ACCESS_TOKEN= supabase db query --linked --workdir . -f sql/035_support_grant.sql
grant execute on function support_add(uuid, bigint, text, text, text, jsonb, text, bigint, int, int, int, bigint) to service_role;
