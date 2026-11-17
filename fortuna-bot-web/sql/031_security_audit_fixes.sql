-- Аудит безопасности 2026-11-17 (Mark: «проведи аудит кибербезопасности»):
-- 1) Публичная лента activity_feed отдавала anon колонку target_player_id (uuid игрока), а у аккаунтов игры в detail.login - логин «ad:…».
--    Функции игры и сайта доверяют player_id, поэтому номер игрока - секрет: anon теперь видит только id, event_type, detail, created_at;
--    логины игры в старых записях заменены ником; тики выбирают только игроков сайта (аккаунтам игры события сайта не нужны).
-- 2) SECURITY DEFINER-функции без revoke вызывались anon через /rest/v1/rpc: airdef_mp_record (накрутка статистики онлайна любому id)
--    и тики событий сайта (раздача очков, ключей, лута, засорение ленты). Их зовут только pg_cron и функции с service_role.

revoke select on activity_feed from anon;
grant select (id, event_type, detail, created_at) on activity_feed to anon;

update activity_feed f
   set detail = jsonb_set(f.detail, '{login}', to_jsonb(coalesce(a.nick, 'игрок')))
  from players p left join airdef_accounts a on a.player_id = p.id
 where p.id = f.target_player_id and f.detail->>'login' like 'ad:%';

create or replace function _pick_random_active_player(p_exclude uuid default null)
returns uuid language sql as $$
  select p.id from players p
  where p.last_seen > now() - interval '14 days'
    and p.kind = 'site'
    and (p_exclude is null or p.id <> p_exclude)
  order by random() limit 1
$$;

revoke execute on function airdef_mp_record(uuid, text, boolean, int, int) from public, anon, authenticated;
revoke execute on function strong_man_tick() from public, anon, authenticated;
revoke execute on function weak_man_tick() from public, anon, authenticated;
revoke execute on function anime_girl_tick() from public, anon, authenticated;
revoke execute on function auto_key_tick() from public, anon, authenticated;
-- новые функции: Supabase сам выдаёт EXECUTE anon и authenticated - снимаем для функций, создаваемых postgres (сайт rpc сам не вызывает)
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;

-- порог «5 активных» для тиков - тоже только игроки сайта (как и выбор цели выше)
create or replace function _active_player_count()
returns int language sql as $$
  select count(*)::int from players where last_seen > now() - interval '14 days' and kind = 'site'
$$;
